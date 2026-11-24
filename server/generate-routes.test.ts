import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_SOURCE_CHARS, type GenerateStreamEvent } from '../shared/generate.ts';
import { createApp } from './app.ts';
import { ProviderError, type GenerateEvent, type GenerateRequest, type ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';

const HOST = { host: '127.0.0.1:4800' };
const JSON_HEADERS = { ...HOST, 'content-type': 'application/json' };
const KEY = 'test-key-generate-000000000000000';

let dir: string;
let store: SettingsStore;
let calls: { apiKey: string; request: GenerateRequest }[];
let script: (GenerateEvent | ProviderError)[];

function adapter(): ProviderAdapter {
  return {
    listModels: async () => [],
    ask: async () => "",
    async *generate(apiKey, request) {
      calls.push({ apiKey, request });
      for (const step of script) {
        if (step instanceof ProviderError) throw step;
        yield step;
      }
    },
  };
}

function app() {
  return createApp({ port: 4800, store, providers: { anthropic: adapter(), openai: adapter() } });
}

async function configure() {
  await store.update((d) => {
    d.providers.anthropic = { apiKey: KEY, model: 'claude-opus-5-5' };
    d.activeProvider = 'anthropic';
  });
}

function generate(source: unknown) {
  return app().request('/api/generate', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ source }),
  });
}

async function events(res: Response): Promise<GenerateStreamEvent[]> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-generate-'));
  store = createSettingsStore(dir);
  calls = [];
  script = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/generate', () => {
  it('needs a connected AI', async () => {
    const res = await generate('Mi guía');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('rejects an empty source', async () => {
    await configure();
    const res = await generate('   ');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'empty_source' });
  });

  it('rejects a source that is too long', async () => {
    await configure();
    const res = await generate('x'.repeat(MAX_SOURCE_CHARS + 1));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'source_too_long' });
  });

  it('streams the page as NDJSON with the saved key and model', async () => {
    await configure();
    script = [
      { type: 'text', text: '<!doctype html><html>' },
      { type: 'text', text: '<body>Hola</body></html>' },
      { type: 'end', outcome: 'complete' },
    ];
    const res = await generate('Guía de montaje del armario');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(await events(res)).toEqual([
      { type: 'text', text: '<!doctype html><html>' },
      { type: 'text', text: '<body>Hola</body></html>' },
      { type: 'end', outcome: 'complete' },
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].apiKey).toBe(KEY);
    expect(calls[0].request.model).toBe('claude-opus-5-5');
    expect(calls[0].request.prompt).toContain('Guía de montaje del armario');
    expect(calls[0].request.system.length).toBeGreaterThan(500);
  });

  it('passes resets through', async () => {
    await configure();
    script = [{ type: 'text', text: '<!doc' }, { type: 'reset' }, { type: 'end', outcome: 'complete' }];
    expect(await events(await generate('x'))).toEqual([
      { type: 'text', text: '<!doc' },
      { type: 'reset' },
      { type: 'end', outcome: 'complete' },
    ]);
  });

  it('reports a provider failure inside the stream', async () => {
    await configure();
    script = [{ type: 'text', text: '<!doctype html>' }, new ProviderError('rate_limited')];
    expect(await events(await generate('x'))).toEqual([
      { type: 'text', text: '<!doctype html>' },
      { type: 'error', error: 'rate_limited' },
    ]);
  });

  it('never sends the key to the browser', async () => {
    await configure();
    script = [{ type: 'text', text: 'ok' }, new ProviderError('invalid_key')];
    const body = await (await generate('x')).text();
    expect(body).not.toContain(KEY);
  });
});
