import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { base64Length, MAX_DOCX_BYTES } from '../shared/attachments.ts';
import { createApp } from './app.ts';
import type { DocxDeps } from './docx-routes.ts';
import { docxHtmlToText } from './docx-text.ts';
import type { ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';

const JSON_HEADERS = { host: '127.0.0.1:4800', 'content-type': 'application/json' };

let dir: string;
let store: SettingsStore;

const unused: ProviderAdapter = {
  listModels: async () => [],
  ask: async () => '',
  async *generate() {},
};

function post(body: unknown, docx?: DocxDeps) {
  const app = createApp({ port: 4800, store, providers: { anthropic: unused, openai: unused }, docx });
  return app.request('/api/source/docx', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

/** A zip with the files stored uncompressed: enough for a tiny .docx. */
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const data = Buffer.from(content);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const DOCX = zip({
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${OFFICE}/officeDocument" Target="word/document.xml"/></Relationships>`,
  'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${RELS}"><Relationship Id="rId1" Type="${OFFICE}/styles" Target="styles.xml"/></Relationships>`,
  'word/styles.xml': `<?xml version="1.0" encoding="UTF-8"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>`,
  'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Guía de montaje</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Antes</w:t></w:r><w:r><w:t xml:space="preserve"> de empezar, saca las 12 piezas &amp; los tornillos.</w:t></w:r></w:p>
</w:body></w:document>`,
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-docx-'));
  store = createSettingsStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/source/docx', () => {
  it('turns a Word file into Markdown-like text', async () => {
    const res = await post({ name: 'guia.docx', data: DOCX.toString('base64') });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      text: '# Guía de montaje\n\n**Antes** de empezar, saca las 12 piezas & los tornillos.',
    });
  });

  it('says so when the file is not a readable Word document', async () => {
    const res = await post({ name: 'falso.docx', data: Buffer.from('no soy un zip').toString('base64') });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'docx_unreadable' });
  });

  it('rejects a malformed body', async () => {
    for (const body of [{}, { name: 'a.docx' }, { name: 'a.docx', data: 'not base64!' }, { name: 1, data: 'AAAA' }]) {
      const res = await post(body, { convert: async () => 'never' });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('rejects files over the Word limit', async () => {
    const data = 'A'.repeat(base64Length(MAX_DOCX_BYTES + 3));
    const res = await post({ name: 'grande.docx', data }, { convert: async () => 'never' });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'attachment_too_large' });
  });

  it('passes the decoded file to the converter', async () => {
    let received = '';
    const res = await post(
      { name: 'a.docx', data: Buffer.from('PK fake').toString('base64') },
      { convert: async (file) => ((received = file.toString()), 'texto') },
    );
    expect(await res.json()).toEqual({ text: 'texto' });
    expect(received).toBe('PK fake');
  });
});

describe('docxHtmlToText', () => {
  it('keeps headings, paragraphs and emphasis', () => {
    expect(docxHtmlToText('<h2>Paso 1</h2><p>Abre la <em>caja</em> con cuidado.</p><p>Luego, &lt;sigue&gt;.</p>')).toBe(
      '## Paso 1\n\nAbre la *caja* con cuidado.\n\nLuego, <sigue>.',
    );
  });

  it('writes nested and numbered lists', () => {
    const html = '<ul><li>Piezas<ul><li>Tablero</li><li>Patas</li></ul></li><li>Tornillos</li></ul><ol><li>Uno</li><li>Dos</li></ol><p>Fin</p>';
    expect(docxHtmlToText(html)).toBe('- Piezas\n  - Tablero\n  - Patas\n- Tornillos\n\n1. Uno\n2. Dos\n\nFin');
  });

  it('writes tables as rows', () => {
    const html = '<table><tr><td><p>Pieza</p></td><td><p>Cantidad</p></td></tr><tr><td><p>Tornillo</p></td><td><p>12</p></td></tr></table>';
    expect(docxHtmlToText(html)).toBe('| Pieza | Cantidad |\n| Tornillo | 12 |');
  });

  it('keeps external links, drops internal anchors and images without a description', () => {
    const html =
      '<p>Ver <a href="https://example.com/manual">el manual</a><sup><a href="#footnote-1" id="footnote-ref-1">[1]</a></sup></p><p><img src="" alt="Plano del armario" /><img src="" /></p>';
    expect(docxHtmlToText(html)).toBe('Ver [el manual](https://example.com/manual)[1]\n\n[image: Plano del armario]');
  });
});
