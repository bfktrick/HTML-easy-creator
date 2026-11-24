import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { ProviderError, type AskRequest, type GenerateRequest, type ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';

const HOST = { host: '127.0.0.1:4800' };
const JSON_HEADERS = { ...HOST, 'content-type': 'application/json' };
const KEY = 'test-key-questions-00000000000000';

const QUESTIONS = {
  questions: [
    {
      id: 'when',
      text: '¿Cuándo es el taller?',
      kind: 'text',
      options: [],
      placeholder: 'Ej.: sábados de 10 a 13 h',
    },
    {
      id: 'style',
      text: '¿Qué aspecto te gusta?',
      kind: 'single',
      options: [
        { label: 'Cuaderno de taller', description: 'Dibujos a línea.' },
        { label: 'Cartel de barrio', description: 'Colores fuertes.' },
      ],
      placeholder: '',
    },
  ],
};

let dir: string;
let store: SettingsStore;
let asked: AskRequest[];
let generated: GenerateRequest[];
let reply: string | ProviderError;

function adapter(): ProviderAdapter {
  return {
    listModels: async () => [],
    async ask(_apiKey, request) {
      asked.push(request);
      if (reply instanceof ProviderError) throw reply;
      return reply;
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

async function configure() {
  await store.update((d) => {
    d.providers.anthropic = { apiKey: KEY, model: 'claude-opus-5-5' };
    d.activeProvider = 'anthropic';
  });
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-questions-'));
  store = createSettingsStore(dir);
  asked = [];
  generated = [];
  reply = JSON.stringify(QUESTIONS);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('POST /api/questions', () => {
  it('needs a connected AI', async () => {
    const res = await post('/api/questions', { source: 'Un taller de bicis', lang: 'es' });
    expect(res.status).toBe(409);
  });

  it('returns the questions the model wrote, with the material and the interface language in the prompt', async () => {
    await configure();
    const res = await post('/api/questions', { source: 'Un taller de bicis', lang: 'es' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(QUESTIONS);
    expect(asked[0].model).toBe('claude-opus-5-5');
    expect(asked[0].prompt).toContain('Un taller de bicis');
    expect(asked[0].system).toContain('Spanish');
    expect(asked[0].schema).toHaveProperty('properties.questions');
  });

  it('falls back to English for an unknown interface language', async () => {
    await configure();
    await post('/api/questions', { source: 'x', lang: 'fr' });
    expect(asked[0].system).toContain('English');
  });

  it('returns no questions when the model reply is unusable, so the page is generated directly', async () => {
    await configure();
    reply = 'lo siento';
    expect(await (await post('/api/questions', { source: 'x', lang: 'es' })).json()).toEqual({ questions: [] });
  });

  it('returns no questions when the model cannot do structured replies', async () => {
    await configure();
    reply = new ProviderError('provider_error');
    const res = await post('/api/questions', { source: 'x', lang: 'es' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ questions: [] });
  });

  it('reports problems the user has to fix', async () => {
    await configure();
    reply = new ProviderError('invalid_key');
    const res = await post('/api/questions', { source: 'x', lang: 'es' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'invalid_key' });
  });

  it('rejects an empty source', async () => {
    await configure();
    expect((await post('/api/questions', { source: ' ', lang: 'es' })).status).toBe(400);
  });
});

describe('POST /api/generate with answers', () => {
  it('passes the answers to the model', async () => {
    await configure();
    const res = await post('/api/generate', {
      source: 'Un taller de bicis',
      answers: [{ question: '¿Cuándo es?', answer: 'Sábados de 10 a 13 h' }],
    });
    await res.text();
    expect(generated[0].prompt).toContain('<answers>');
    expect(generated[0].prompt).toContain('¿Cuándo es?');
    expect(generated[0].prompt).toContain('Sábados de 10 a 13 h');
  });

  it('leaves the answers block out when there are none', async () => {
    await configure();
    await (await post('/api/generate', { source: 'Un taller de bicis', answers: [] })).text();
    expect(generated[0].prompt).not.toContain('<answers>');
  });

  it('rejects malformed answers', async () => {
    await configure();
    const res = await post('/api/generate', { source: 'x', answers: 'todas' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });
});
