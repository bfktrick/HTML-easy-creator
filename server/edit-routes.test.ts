import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_EDIT_REQUEST_CHARS, type EditStreamEvent } from '../shared/edit.ts';
import { MAX_SOURCE_CHARS } from '../shared/generate.ts';
import { createApp } from './app.ts';
import { EDIT_SYSTEM_PROMPT, PAGE_SYSTEM_PROMPT } from './prompts.ts';
import { ProviderError, type GenerateEvent, type GenerateRequest, type ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';

const HOST = { host: '127.0.0.1:4800' };
const JSON_HEADERS = { ...HOST, 'content-type': 'application/json' };
const KEY = 'test-key-edit-0000000000000000000';
const PAGE = '<!doctype html>\n<html lang="es">\n<body>\n  <h1>Taller</h1>\n  <p>Sábados</p>\n</body>\n</html>';

let dir: string;
let store: SettingsStore;
let calls: GenerateRequest[];
/** One script per call to generate(), in order. */
let replies: (GenerateEvent | ProviderError)[][];

function adapter(): ProviderAdapter {
  return {
    listModels: async () => [],
    ask: async () => '',
    async *generate(_apiKey, request) {
      calls.push(request);
      for (const step of replies[calls.length - 1] ?? []) {
        if (step instanceof ProviderError) throw step;
        yield step;
      }
    },
  };
}

function reply(text: string): GenerateEvent[] {
  return [
    { type: 'text', text: text.slice(0, 10) },
    { type: 'text', text: text.slice(10) },
    { type: 'end', outcome: 'complete' },
  ];
}

function block(search: string, replace: string): string {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`;
}

function edit(body: unknown) {
  return createApp({ port: 4800, store, providers: { anthropic: adapter(), openai: adapter() } }).request('/api/edit', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

async function events(res: Response): Promise<EditStreamEvent[]> {
  return (await res.text())
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/** The events that matter for the outcome; the text pieces are only progress. */
async function outcome(res: Response): Promise<EditStreamEvent[]> {
  return (await events(res)).filter((event) => event.type !== 'text');
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-edit-'));
  store = createSettingsStore(dir);
  calls = [];
  replies = [];
  await store.update((d) => {
    d.providers.openai = { apiKey: KEY, model: 'gpt-5.5' };
    d.activeProvider = 'openai';
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/edit validation', () => {
  it('needs a connected AI', async () => {
    await store.update((d) => {
      d.activeProvider = null;
    });
    const res = await edit({ html: PAGE, request: 'Pon el título más grande' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it.each([
    [{ request: 'x' }, 400, 'bad_request'],
    [{ html: '  ', request: 'x' }, 400, 'bad_request'],
    [{ html: PAGE }, 400, 'bad_request'],
    [{ html: PAGE, request: '  ' }, 400, 'empty_source'],
    [{ html: PAGE, request: 'x'.repeat(MAX_EDIT_REQUEST_CHARS + 1) }, 413, 'request_too_long'],
    [{ html: 'x'.repeat(MAX_SOURCE_CHARS + 1), request: 'x' }, 413, 'page_too_long'],
    [{ html: PAGE, request: 'x', previous: 'antes' }, 400, 'bad_request'],
    [{ html: PAGE, request: 'x', previous: [1] }, 400, 'bad_request'],
  ])('rejects %j', async (body, status, error) => {
    const res = await edit(body);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error });
    expect(calls).toHaveLength(0);
  });

  it('accepts a page far larger than ordinary JSON bodies', async () => {
    const big = PAGE.replace('<p>Sábados</p>', `<p>Sábados</p>\n<p>${'texto '.repeat(40_000)}</p>`);
    replies = [reply(block('<h1>Taller</h1>', '<h1>Taller de bicis</h1>'))];
    const res = await edit({ html: big, request: 'Cambia el título' });
    expect(res.status).toBe(200);
    const result = (await outcome(res))[0];
    expect(result.type === 'result' && result.html).toBe(big.replace('<h1>Taller</h1>', '<h1>Taller de bicis</h1>'));
  });
});

describe('POST /api/edit', () => {
  it('streams progress, then the edited page and its summary', async () => {
    const text = `<summary>Título cambiado.</summary>\n${block('<h1>Taller</h1>', '<h1>Taller de bicis</h1>')}`;
    replies = [reply(text)];
    const res = await edit({ html: PAGE, request: 'Pon «de bicis» en el título', previous: ['uno', 'dos'] });
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const all = await events(res);
    expect(all.filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : '')).join('')).toBe(text);
    expect(all.filter((e) => e.type !== 'text')).toEqual([
      { type: 'result', html: PAGE.replace('<h1>Taller</h1>', '<h1>Taller de bicis</h1>'), summary: 'Título cambiado.' },
      { type: 'end' },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('gpt-5.5');
    expect(calls[0].effort).toBe('medium');
    expect(calls[0].system).toBe(EDIT_SYSTEM_PROMPT);
    expect(calls[0].prompt).toContain(PAGE);
    expect(calls[0].prompt).toContain('Pon «de bicis» en el título');
    expect(calls[0].prompt).toContain('<earlier_request>\ndos\n</earlier_request>');
  });

  it('only sends the last five earlier requests', async () => {
    replies = [reply(block('<h1>Taller</h1>', '<h1>T</h1>'))];
    await (await edit({ html: PAGE, request: 'x', previous: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] })).text();
    expect(calls[0].prompt).not.toContain('p1');
    expect(calls[0].prompt).toContain('p6');
  });

  it('retries once, telling the model which SEARCH did not match', async () => {
    replies = [
      reply(block('<h1>Taler</h1>', '<h1>Taller de bicis</h1>')),
      reply(`<summary>Hecho.</summary>\n${block('<h1>Taller</h1>', '<h1>Taller de bicis</h1>')}`),
    ];
    const res = await edit({ html: PAGE, request: 'Cambia el título' });
    expect(await outcome(res)).toEqual([
      { type: 'reset' },
      { type: 'result', html: PAGE.replace('<h1>Taller</h1>', '<h1>Taller de bicis</h1>'), summary: 'Hecho.' },
      { type: 'end' },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0].prompt).not.toContain('could not be applied');
    expect(calls[1].prompt).toContain('could not be applied');
    expect(calls[1].prompt).toContain('<failed reason="not found in the document">\n<h1>Taler</h1>\n</failed>');
  });

  it('gives up with edit_failed after the retry also fails', async () => {
    replies = [reply(block('<h2>Nada</h2>', 'x')), reply('No sé qué cambiar.')];
    expect(await outcome(await edit({ html: PAGE, request: 'Cambia algo' }))).toEqual([
      { type: 'reset' },
      { type: 'error', error: 'edit_failed' },
    ]);
    expect(calls).toHaveLength(2);
  });

  it('takes a complete new page when the whole page is redone', async () => {
    const doc = '<!doctype html><html><body><h1>Otra</h1></body></html>';
    replies = [reply(`<summary>Página rehecha.</summary>\n${doc}`)];
    expect(await outcome(await edit({ html: PAGE, request: 'Rehaz la página entera' }))).toEqual([
      { type: 'result', html: doc, summary: 'Página rehecha.' },
      { type: 'end' },
    ]);
  });

  it('does not apply a reply cut off at the output limit', async () => {
    replies = [[{ type: 'text', text: block('<h1>Taller</h1>', '<h1>T</h1>') }, { type: 'end', outcome: 'truncated' }]];
    expect(await outcome(await edit({ html: PAGE, request: 'x' }))).toEqual([{ type: 'error', error: 'edit_failed' }]);
    expect(calls).toHaveLength(1);
  });

  it('reports a refusal and a provider failure', async () => {
    replies = [[{ type: 'end', outcome: 'refused' }]];
    expect(await outcome(await edit({ html: PAGE, request: 'x' }))).toEqual([{ type: 'error', error: 'edit_refused' }]);

    calls = [];
    replies = [[{ type: 'text', text: '<<<' }, new ProviderError('rate_limited')]];
    expect(await outcome(await edit({ html: PAGE, request: 'x' }))).toEqual([{ type: 'error', error: 'rate_limited' }]);
  });

  it('shares the page rules with the prompt that writes the page', () => {
    const rules = PAGE_SYSTEM_PROMPT.slice(PAGE_SYSTEM_PROMPT.indexOf('# File'));
    expect(rules.length).toBeGreaterThan(1000);
    expect(EDIT_SYSTEM_PROMPT.endsWith(rules)).toBe(true);
  });
});
