// The optional "kind" field of /api/questions and /api/generate.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import type { AskRequest, GenerateRequest, ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';

const JSON_HEADERS = { host: '127.0.0.1:4800', 'content-type': 'application/json' };
const KEY = 'test-key-kinds-000000000000000000';

let dir: string;
let store: SettingsStore;
let asked: AskRequest[];
let generated: GenerateRequest[];

function adapter(): ProviderAdapter {
  return {
    listModels: async () => [],
    async ask(_apiKey, request) {
      asked.push(request);
      return JSON.stringify({ questions: [] });
    },
    async *generate(_apiKey, request) {
      generated.push(request);
      yield { type: 'end', outcome: 'complete' };
    },
  };
}

async function post(pathName: string, body: unknown) {
  const app = createApp({ port: 4800, store, providers: { anthropic: adapter(), openai: adapter() } });
  const res = await app.request(pathName, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) });
  await res.clone().text();
  return res;
}

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-kinds-'));
  store = createSettingsStore(dir);
  asked = [];
  generated = [];
  await store.update((d) => {
    d.providers.anthropic = { apiKey: KEY, model: 'claude-opus-5-5' };
    d.activeProvider = 'anthropic';
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('kind in /api/questions', () => {
  it('puts the chosen kind in the prompt', async () => {
    expect((await post('/api/questions', { source: 'Charla sobre compostaje', lang: 'es', kind: 'slides' })).status).toBe(200);
    expect(asked[0].prompt.startsWith('Kind: slides.')).toBe(true);
  });

  it('leaves the kind open when none is sent', async () => {
    await post('/api/questions', { source: 'Charla sobre compostaje', lang: 'es' });
    expect(asked[0].prompt.startsWith('Kind: not chosen.')).toBe(true);
  });

  it('rejects an unknown kind without calling the model', async () => {
    const res = await post('/api/questions', { source: 'x', lang: 'es', kind: 'poster' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
    expect(asked).toHaveLength(0);
  });
});

describe('kind in /api/generate', () => {
  it('puts the chosen kind in the prompt and keeps the system prompt the same for every kind', async () => {
    await post('/api/generate', { source: 'Calculadora de riego', kind: 'app' });
    await post('/api/generate', { source: 'Calculadora de riego', kind: 'landing' });
    expect(generated[0].prompt).toContain('Kind: app.');
    expect(generated[1].prompt).toContain('Kind: landing.');
    expect(generated[0].system).toBe(generated[1].system);
  });

  it('defaults to "auto"', async () => {
    await post('/api/generate', { source: 'Guía de montaje' });
    expect(generated[0].prompt.startsWith('Kind: not chosen.')).toBe(true);
  });

  it('rejects an unknown kind without calling the model', async () => {
    const res = await post('/api/generate', { source: 'x', kind: 42 });
    expect(res.status).toBe(400);
    expect(generated).toHaveLength(0);
  });
});
