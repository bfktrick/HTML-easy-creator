import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp, isAllowedHost, isAllowedOrigin } from './app.ts';
import type { ProviderAdapter } from './providers/types.ts';
import { createSettingsStore } from './settings-store.ts';

const PORT = 4800;
const noProvider: ProviderAdapter = {
  listModels: async () => [],
  ask: async () => "",
  async *generate() {
    yield { type: 'end', outcome: 'complete' };
  },
};
const app = createApp({
  port: PORT,
  store: createSettingsStore(mkdtempSync(path.join(tmpdir(), 'hc-app-'))),
  providers: { anthropic: noProvider, openai: noProvider },
});

function get(path: string, headers: Record<string, string>) {
  return app.request(path, { headers });
}

describe('isAllowedHost', () => {
  it('accepts loopback hosts on our port', () => {
    expect(isAllowedHost('127.0.0.1:4800', PORT)).toBe(true);
    expect(isAllowedHost('localhost:4800', PORT)).toBe(true);
  });

  it('rejects other hosts, other ports and a missing header', () => {
    expect(isAllowedHost('evil.example:4800', PORT)).toBe(false);
    expect(isAllowedHost('127.0.0.1:9999', PORT)).toBe(false);
    expect(isAllowedHost('127.0.0.1', PORT)).toBe(false);
    expect(isAllowedHost(undefined, PORT)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it('accepts our own origin and requests without Origin', () => {
    expect(isAllowedOrigin('http://127.0.0.1:4800', PORT)).toBe(true);
    expect(isAllowedOrigin('http://localhost:4800', PORT)).toBe(true);
    expect(isAllowedOrigin(undefined, PORT)).toBe(true);
  });

  it('rejects foreign and opaque origins', () => {
    expect(isAllowedOrigin('https://evil.example', PORT)).toBe(false);
    expect(isAllowedOrigin('http://127.0.0.1:9999', PORT)).toBe(false);
    // The sandboxed preview iframe has an opaque origin: it must not reach the API.
    expect(isAllowedOrigin('null', PORT)).toBe(false);
  });
});

describe('createApp', () => {
  it('answers the health check on a loopback host', async () => {
    const res = await get('/api/health', { host: '127.0.0.1:4800' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('refuses a foreign Host header (DNS rebinding)', async () => {
    const res = await get('/api/health', { host: 'evil.example:4800' });
    expect(res.status).toBe(403);
  });

  it('refuses a cross-site Origin', async () => {
    const res = await get('/api/health', {
      host: '127.0.0.1:4800',
      origin: 'https://evil.example',
    });
    expect(res.status).toBe(403);
  });

  it('refuses navigations from other sites, such as a link inside the preview', async () => {
    const res = await get('/api/health', { host: '127.0.0.1:4800', 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
    const own = await get('/api/health', { host: '127.0.0.1:4800', 'sec-fetch-site': 'same-origin' });
    expect(own.status).toBe(200);
  });

  it('sends hardening headers', async () => {
    const res = await get('/api/health', { host: '127.0.0.1:4800' });
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('returns 404 JSON for unknown API routes', async () => {
    const res = await get('/api/nope', { host: '127.0.0.1:4800' });
    expect(res.status).toBe(404);
  });
});
