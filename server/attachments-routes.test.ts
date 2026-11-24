import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_ATTACHMENTS, type ModelAttachment } from '../shared/attachments.ts';
import { createApp } from './app.ts';
import { ProviderError, type AskRequest, type GenerateRequest, type ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';

const JSON_HEADERS = { host: '127.0.0.1:4800', 'content-type': 'application/json' };
const KEY = 'test-key-attachments-0000000000000';

const PDF: ModelAttachment = { kind: 'pdf', mediaType: 'application/pdf', data: 'JVBERi0xLjQK', name: 'menu.pdf' };
const LOGO: ModelAttachment = { kind: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'logo.png' };

let dir: string;
let store: SettingsStore;
let asked: AskRequest[];
let generated: GenerateRequest[];
let askError: ProviderError | null;

function adapter(): ProviderAdapter {
  return {
    listModels: async () => [],
    async ask(_apiKey, request) {
      asked.push(request);
      if (askError) throw askError;
      return '{"questions":[]}';
    },
    async *generate(_apiKey, request) {
      generated.push(request);
      yield { type: 'end', outcome: 'complete' };
    },
  };
}

function post(pathName: string, body: unknown) {
  const app = createApp({ port: 4800, store, providers: { anthropic: adapter(), openai: adapter() } });
  return app.request(pathName, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-attachments-'));
  store = createSettingsStore(dir);
  asked = [];
  generated = [];
  askError = null;
  await store.update((d) => {
    d.providers.anthropic = { apiKey: KEY, model: 'claude-opus-5-5' };
    d.activeProvider = 'anthropic';
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('attachments in /api/questions and /api/generate', () => {
  it('accepts a message that is only files', async () => {
    const res = await post('/api/generate', { source: '', attachments: [PDF, LOGO] });
    expect(res.status).toBe(200);
    await res.text();
    expect(generated).toHaveLength(1);
    expect(generated[0].attachments).toEqual([PDF, LOGO]);
    expect(generated[0].prompt).toContain('There is no text: the material is in the files');
    expect(generated[0].prompt).toContain('- Document: menu.pdf\n- Image 1: logo.png');
  });

  it('lists the files after the text when there is text too', async () => {
    await (await post('/api/generate', { source: 'Carta del bar', attachments: [LOGO] })).text();
    expect(generated[0].prompt).toContain('Carta del bar');
    expect(generated[0].prompt).toContain('The person also attached these files');
  });

  it('takes the kind of page together with the files', async () => {
    const withKind = await post('/api/generate', { source: 'Charla del sábado', kind: 'slides', attachments: [LOGO] });
    await withKind.text();
    const plain = await post('/api/generate', { source: 'Charla del sábado', attachments: [LOGO] });
    await plain.text();
    expect(generated.map((r) => r.attachments)).toEqual([[LOGO], [LOGO]]);
    expect(generated[0].prompt).not.toBe(generated[1].prompt);
    expect(generated[0].prompt).toContain('- Image 1: logo.png');
  });

  it('still needs text or files', async () => {
    const res = await post('/api/generate', { source: '  ', attachments: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'empty_source' });
  });

  it('sends the files with the questions too', async () => {
    const res = await post('/api/questions', { source: '', lang: 'es', attachments: [LOGO] });
    expect(res.status).toBe(200);
    expect(asked[0].attachments).toEqual([LOGO]);
    expect(asked[0].prompt).toContain('- Image 1: logo.png');
  });

  it('rejects files it cannot send', async () => {
    const svg = { ...LOGO, mediaType: 'image/svg+xml' };
    for (const route of ['/api/questions', '/api/generate']) {
      const unsupported = await post(route, { source: 'x', attachments: [svg] });
      expect(unsupported.status, route).toBe(400);
      expect(await unsupported.json()).toEqual({ error: 'unsupported_attachment' });

      const many = await post(route, { source: 'x', attachments: Array(MAX_ATTACHMENTS + 1).fill(LOGO) });
      expect(many.status, route).toBe(413);
      expect(await many.json()).toEqual({ error: 'too_many_attachments' });
    }
    expect(asked).toHaveLength(0);
    expect(generated).toHaveLength(0);
  });

  it('takes bodies far larger than a pasted text', async () => {
    const big = { ...PDF, data: 'A'.repeat(8 * 1024 * 1024) };
    const res = await post('/api/generate', { source: 'x', attachments: [big] });
    expect(res.status).toBe(200);
    await res.text();
    expect(generated[0].attachments?.[0].data.length).toBe(8 * 1024 * 1024);
  });

  it('tells the person when the model does not take files', async () => {
    askError = new ProviderError('attachments_unsupported');
    const res = await post('/api/questions', { source: 'x', lang: 'es', attachments: [PDF] });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'attachments_unsupported' });
  });
});
