import { describe, expect, it } from 'vitest';
import { fileNameFor } from './filename.ts';
import { readNdjson } from './ndjson.ts';
import { formatElapsed } from './useGenerator.ts';

describe('formatElapsed', () => {
  it('shows minutes and zero-padded seconds', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(9_400)).toBe('0:09');
    expect(formatElapsed(75_000)).toBe('1:15');
    expect(formatElapsed(-5)).toBe('0:00');
  });
});

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of readNdjson(streamOf(chunks))) out.push(item);
  return out;
}

describe('readNdjson', () => {
  it('parses objects split across chunks', async () => {
    expect(await collect(['{"a":', '1}\n{"b"', ':2}\n'])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips blank lines and reads a last line without newline', async () => {
    expect(await collect(['\n{"a":1}\n\n', '{"b":2}'])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('keeps multi-byte characters split between chunks', async () => {
    const bytes = new TextEncoder().encode('{"t":"guía"}\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 9));
        controller.enqueue(bytes.slice(9));
        controller.close();
      },
    });
    const out: unknown[] = [];
    for await (const item of readNdjson(stream)) out.push(item);
    expect(out).toEqual([{ t: 'guía' }]);
  });
});

describe('fileNameFor', () => {
  it('builds a file name from the page title', () => {
    expect(fileNameFor('<html><head><title>Guía de Montaje: Paso 1</title></head></html>')).toBe(
      'guia-de-montaje-paso-1.html',
    );
  });

  it('keeps only the part of the title before a separator', () => {
    expect(fileNameFor('<title>Taller de bicis · Sábados de 10 a 13 h</title>')).toBe('taller-de-bicis.html');
    expect(fileNameFor('<title>Guía rápida | Banco de Alimentos</title>')).toBe('guia-rapida.html');
    expect(fileNameFor('<title>Pre-venta abierta</title>')).toBe('pre-venta-abierta.html');
  });

  it('decodes common entities and trims long titles', () => {
    expect(fileNameFor('<title>Precios &amp; Planes</title>')).toBe('precios-planes.html');
    const long = fileNameFor(`<title>${'palabra '.repeat(20)}</title>`);
    expect(long.length).toBeLessThanOrEqual(65);
    expect(long.endsWith('.html')).toBe(true);
    expect(long).not.toMatch(/-\.html$/);
  });

  it('falls back to a generic name', () => {
    expect(fileNameFor('<html><body>sin título</body></html>')).toBe('page.html');
    expect(fileNameFor('<title>   ¡¡!!  </title>')).toBe('page.html');
  });
});
