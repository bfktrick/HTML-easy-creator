import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { UrlSourceErrorCode, UrlSourceResponse } from '../shared/source.ts';
import { fail, readJson } from './http.ts';
import { fetchUrlSource, UrlSourceError } from './url-source.ts';

/** Reads a link; tests swap it for a fake so nothing goes out to the network. */
export type UrlReader = (url: string, signal: AbortSignal) => Promise<UrlSourceResponse>;

const STATUS: Record<UrlSourceErrorCode, ContentfulStatusCode> = {
  bad_url: 400,
  blocked_address: 422,
  fetch_failed: 502,
  too_large: 413,
  unsupported_content: 415,
  empty_page: 422,
};

const readWithNode: UrlReader = (url, signal) => fetchUrlSource(url, { signal });

export function sourceRoutes({ readUrl = readWithNode }: { readUrl?: UrlReader } = {}) {
  const api = new Hono();

  // Reading a link needs no AI: the text goes back to the browser, which then sends it
  // to /api/questions and /api/generate like pasted text.
  api.post('/source/url', async (c) => {
    const body = await readJson(c);
    if (!body) return fail(c, 'bad_request', 400);
    if (typeof body.url !== 'string' || body.url.trim() === '') return fail(c, 'bad_url', 400);
    try {
      const source = await readUrl(body.url, c.req.raw.signal);
      return c.json(source satisfies UrlSourceResponse);
    } catch (error) {
      if (error instanceof UrlSourceError) return fail(c, error.code, STATUS[error.code]);
      throw error;
    }
  });

  return api;
}
