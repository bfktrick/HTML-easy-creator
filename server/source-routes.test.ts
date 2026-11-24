import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_SOURCE_CHARS } from '../shared/generate.ts';
import type { UrlSourceErrorCode, UrlSourceResponse } from '../shared/source.ts';
import { createApp } from './app.ts';
import type { ProviderAdapter } from './providers/types.ts';
import { createSettingsStore, type SettingsStore } from './settings-store.ts';
import type { UrlReader } from './source-routes.ts';
import { UrlSourceError } from './url-source.ts';

const JSON_HEADERS = { host: '127.0.0.1:4800', 'content-type': 'application/json' };

const unused: ProviderAdapter = {
  listModels: async () => [],
  ask: async () => '',
  async *generate() {},
};

let dir: string;
let store: SettingsStore;
let reads: string[];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-source-'));
  store = createSettingsStore(dir);
  reads = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function app(reader: UrlReader) {
  const readUrl: UrlReader = (url, signal) => {
    reads.push(url);
    return reader(url, signal);
  };
  return createApp({ port: 4800, store, providers: { anthropic: unused, openai: unused }, readUrl });
}

function post(reader: UrlReader, body: unknown, headers: Record<string, string> = JSON_HEADERS) {
  return app(reader).request('/api/source/url', { method: 'POST', headers, body: JSON.stringify(body) });
}

const PAGE: UrlSourceResponse = { url: 'https://example.com/guia', title: 'Guía', text: '# Hola' };

describe('POST /api/source/url', () => {
  it('returns the text of the page, without needing an AI', async () => {
    const response = await post(async () => PAGE, { url: 'https://example.com/guia' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(PAGE);
    expect(reads).toEqual(['https://example.com/guia']);
  });

  it.each([
    [{}, 'bad_url'],
    [{ url: '   ' }, 'bad_url'],
    [{ url: 42 }, 'bad_url'],
    [[], 'bad_request'],
  ])('refuses %j', async (body, error) => {
    const response = await post(async () => PAGE, body);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error });
    expect(reads).toEqual([]);
  });

  it.each([
    ['bad_url', 400],
    ['blocked_address', 422],
    ['fetch_failed', 502],
    ['too_large', 413],
    ['unsupported_content', 415],
    ['empty_page', 422],
  ] as Array<[UrlSourceErrorCode, number]>)('answers %s with %i', async (code, status) => {
    const response = await post(() => Promise.reject(new UrlSourceError(code)), { url: 'https://example.com/' });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it('hides unexpected failures behind "internal"', async () => {
    const response = await post(() => Promise.reject(new Error('secret detail')), { url: 'https://example.com/' });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal' });
  });

  it('keeps the host, origin and content-type guards', async () => {
    const reader = async () => PAGE;
    const otherOrigin = await post(reader, { url: 'https://example.com/' }, { ...JSON_HEADERS, origin: 'https://evil.example' });
    expect(otherOrigin.status).toBe(403);
    const preview = await post(reader, { url: 'https://example.com/' }, { ...JSON_HEADERS, origin: 'null' });
    expect(preview.status).toBe(403);
    const form = await post(reader, { url: 'https://example.com/' }, { host: '127.0.0.1:4800', 'content-type': 'text/plain' });
    expect(form.status).toBe(415);
    const oversized = await post(reader, { url: `https://example.com/${'a'.repeat(MAX_SOURCE_CHARS)}` });
    expect(oversized.status).toBe(413);
    expect(reads).toEqual([]);
  });
});
