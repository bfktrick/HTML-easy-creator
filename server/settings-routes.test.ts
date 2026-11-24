import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelInfo, ProviderId, PublicSettings } from '../shared/settings.ts';
import { createApp } from './app.ts';
import { DEFAULT_ANTHROPIC_MODEL } from './providers/models.ts';
import { ProviderError, type ProviderAdapter } from './providers/types.ts';
import { createSettingsStore } from './settings-store.ts';

const PORT = 4800;
const HOST = { host: '127.0.0.1:4800' };
const JSON_HEADERS = { ...HOST, 'content-type': 'application/json' };

// Fake values with the shape of a key, not real credentials.
const GOOD_KEY = 'test-key-good-00000000000000wxyz';
const REJECTED_KEY = 'test-key-rejected-000000000000000';
const OFFLINE_KEY = 'test-key-offline-0000000000000000';

const CLAUDE_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: DEFAULT_ANTHROPIC_MODEL, label: 'Claude Opus 5.5' },
];
const GPT_MODELS: ModelInfo[] = [
  { id: 'gpt-5.2', label: 'gpt-5.2' },
  { id: 'gpt-5', label: 'gpt-5' },
];

function fakeAdapter(models: ModelInfo[]): ProviderAdapter {
  return {
    listModels: vi.fn(async (apiKey: string) => {
      if (apiKey === REJECTED_KEY) throw new ProviderError('invalid_key');
      if (apiKey === OFFLINE_KEY) throw new ProviderError('network');
      return models;
    }),
    ask: async () => "",
    async *generate() {
      yield { type: 'end', outcome: 'complete' };
    },
  };
}

let dir: string;
let providers: Record<ProviderId, ProviderAdapter>;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-routes-'));
  providers = { anthropic: fakeAdapter(CLAUDE_MODELS), openai: fakeAdapter(GPT_MODELS) };
  app = createApp({ port: PORT, store: createSettingsStore(dir), providers });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function connect(provider: string, apiKey: string) {
  return app.request(`/api/settings/providers/${provider}/key`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify({ apiKey }),
  });
}

function patch(body: unknown) {
  return app.request('/api/settings', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) });
}

async function settings(): Promise<PublicSettings> {
  return (await app.request('/api/settings', { headers: HOST })).json();
}

describe('GET /api/settings', () => {
  it('starts with nothing configured and shows where settings live', async () => {
    const view = await settings();
    expect(view.activeProvider).toBeNull();
    expect(view.configDir).toBe(dir);
    expect(view.providers.anthropic.configured).toBe(false);
    expect(view.providers.openai.configured).toBe(false);
  });
});

describe('PUT /api/settings/providers/:provider/key', () => {
  it('checks the key with the provider, saves it and picks a model', async () => {
    const res = await connect('anthropic', GOOD_KEY);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(GOOD_KEY);

    const body = JSON.parse(text);
    expect(body.models).toEqual(CLAUDE_MODELS);
    expect(body.settings.activeProvider).toBe('anthropic');
    expect(body.settings.providers.anthropic).toEqual({
      configured: true,
      keyHint: '…wxyz',
      model: DEFAULT_ANTHROPIC_MODEL,
    });
    expect(readFileSync(path.join(dir, 'settings.json'), 'utf8')).toContain(GOOD_KEY);
  });

  it('keeps the first connected provider active when a second one is added', async () => {
    await connect('anthropic', GOOD_KEY);
    await connect('openai', GOOD_KEY);
    const view = await settings();
    expect(view.activeProvider).toBe('anthropic');
    expect(view.providers.openai.model).toBe('gpt-5.2');
  });

  it('does not save a key the provider rejects', async () => {
    const res = await connect('anthropic', REJECTED_KEY);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'invalid_key' });
    expect((await settings()).providers.anthropic.configured).toBe(false);
  });

  it('reports a network failure', async () => {
    const res = await connect('openai', OFFLINE_KEY);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'network' });
  });

  it('rejects something that is not shaped like a key without calling the provider', async () => {
    const res = await connect('anthropic', 'my key');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_key_format' });
    expect(providers.anthropic.listModels).not.toHaveBeenCalled();
  });

  it('rejects unknown providers', async () => {
    const res = await connect('gemini', GOOD_KEY);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'unknown_provider' });
  });

  it('requires a JSON body', async () => {
    const res = await app.request('/api/settings/providers/anthropic/key', {
      method: 'PUT',
      headers: { ...HOST, 'content-type': 'text/plain' },
      body: JSON.stringify({ apiKey: GOOD_KEY }),
    });
    expect(res.status).toBe(415);
  });

  it('rejects malformed JSON', async () => {
    const res = await app.request('/api/settings/providers/anthropic/key', {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: '{oops',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_request' });
  });
});

describe('GET /api/providers/:provider/models', () => {
  it('needs a saved key', async () => {
    const res = await app.request('/api/providers/openai/models', { headers: HOST });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('lists the models with the saved key', async () => {
    await connect('openai', GOOD_KEY);
    const res = await app.request('/api/providers/openai/models', { headers: HOST });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ models: GPT_MODELS });
  });
});

describe('PATCH /api/settings', () => {
  it('only activates a provider that has a key', async () => {
    const res = await patch({ activeProvider: 'openai' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'not_configured' });

    await connect('anthropic', GOOD_KEY);
    await connect('openai', GOOD_KEY);
    const ok = await patch({ activeProvider: 'openai' });
    expect(ok.status).toBe(200);
    expect((await ok.json()).activeProvider).toBe('openai');
  });

  it('changes the model of a configured provider', async () => {
    await connect('anthropic', GOOD_KEY);
    const res = await patch({ models: { anthropic: 'claude-sonnet-5-5' } });
    expect(res.status).toBe(200);
    expect((await settings()).providers.anthropic.model).toBe('claude-sonnet-5-5');
  });

  it('rejects model names with odd characters', async () => {
    await connect('anthropic', GOOD_KEY);
    const res = await patch({ models: { anthropic: 'claude opus <script>' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_model' });
  });
});

describe('DELETE /api/settings/providers/:provider/key', () => {
  it('forgets the key and hands the active role to the other provider', async () => {
    await connect('anthropic', GOOD_KEY);
    await connect('openai', GOOD_KEY);
    const res = await app.request('/api/settings/providers/anthropic/key', { method: 'DELETE', headers: HOST });
    expect(res.status).toBe(200);
    const view = await settings();
    expect(view.providers.anthropic.configured).toBe(false);
    expect(view.activeProvider).toBe('openai');
    expect(readFileSync(path.join(dir, 'settings.json'), 'utf8')).toContain(GOOD_KEY);

    await app.request('/api/settings/providers/openai/key', { method: 'DELETE', headers: HOST });
    expect((await settings()).activeProvider).toBeNull();
    expect(readFileSync(path.join(dir, 'settings.json'), 'utf8')).not.toContain(GOOD_KEY);
  });
});
