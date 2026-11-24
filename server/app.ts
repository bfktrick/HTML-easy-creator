import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { serveStatic } from '@hono/node-server/serve-static';
import { base64Length, MAX_DOCX_BYTES, MAX_TOTAL_ATTACHMENT_BYTES } from '../shared/attachments.ts';
import type { ProviderId } from '../shared/settings.ts';
import { docxRoutes, type DocxDeps } from './docx-routes.ts';
import { editRoutes } from './edit-routes.ts';
import { generateRoutes } from './generate-routes.ts';
import type { ProviderAdapter } from './providers/types.ts';
import { settingsRoutes } from './settings-routes.ts';
import { sourceRoutes, type UrlReader } from './source-routes.ts';
import type { SettingsStore } from './settings-store.ts';

const LOOPBACK_NAMES = ['127.0.0.1', 'localhost'];

// Fetch metadata values a page of our own (or the user typing the URL) can send.
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'none']);

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);
const MAX_JSON_BODY = 64 * 1024;
// A pasted guide can be long: MAX_SOURCE_CHARS of text, JSON-escaped and UTF-8 encoded.
const MAX_GENERATE_BODY = 4 * 1024 * 1024;
// Questions and pages also carry the attached PDFs and images, base64-encoded.
const MAX_MATERIAL_BODY = MAX_GENERATE_BODY + base64Length(MAX_TOTAL_ATTACHMENT_BYTES);
const MAX_DOCX_BODY = base64Length(MAX_DOCX_BYTES) + MAX_JSON_BODY;

/** The server only answers to loopback names on its own port (DNS rebinding guard). */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return LOOPBACK_NAMES.some((name) => host === `${name}:${port}`);
}

/**
 * Requests without Origin come from the address bar or from tools such as curl.
 * Any other origin, including the opaque "null" of the sandboxed preview, is refused.
 */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (origin === undefined) return true;
  return LOOPBACK_NAMES.some((name) => origin === `http://${name}:${port}`);
}

export interface AppOptions {
  port: number;
  store: SettingsStore;
  providers: Record<ProviderId, ProviderAdapter>;
  /** Absolute path of the built client. Omit it in dev, where Vite serves the client. */
  staticRoot?: string;
  docx?: DocxDeps;
  /** Link reader; defaults to the real one. Tests pass a fake. */
  readUrl?: UrlReader;
}

export function createApp({ port, store, providers, staticRoot, docx, readUrl }: AppOptions) {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const fetchSite = c.req.header('sec-fetch-site');
    const allowed =
      isAllowedHost(c.req.header('host'), port) &&
      isAllowedOrigin(c.req.header('origin'), port) &&
      (fetchSite === undefined || ALLOWED_FETCH_SITES.has(fetchSite));
    if (!allowed) return c.text('Forbidden', 403);
    await next();
  });

  app.use('*', secureHeaders({ strictTransportSecurity: false }));

  // Only JSON bodies: an HTML form on another site cannot send one without a CORS preflight.
  app.use('/api/*', async (c, next) => {
    const contentType = c.req.header('content-type') ?? '';
    if (METHODS_WITH_BODY.has(c.req.method) && !contentType.startsWith('application/json')) {
      return c.json({ error: 'unsupported_media_type' }, 415);
    }
    await next();
  });
  const tooLarge = bodyLimit({ maxSize: MAX_JSON_BODY, onError: (c) => c.json({ error: 'bad_request' }, 413) });
  const materialTooLarge = bodyLimit({
    maxSize: MAX_MATERIAL_BODY,
    onError: (c) => c.json({ error: 'attachments_too_large' }, 413),
  });
  const docxTooLarge = bodyLimit({
    maxSize: MAX_DOCX_BODY,
    onError: (c) => c.json({ error: 'attachment_too_large' }, 413),
  });
  // An edit sends the whole page, which can be as long as a pasted guide.
  const pageTooLarge = bodyLimit({
    maxSize: MAX_GENERATE_BODY,
    onError: (c) => c.json({ error: 'page_too_long' }, 413),
  });
  const limits: Record<string, typeof tooLarge> = {
    '/api/questions': materialTooLarge,
    '/api/generate': materialTooLarge,
    // Edits never resend the attachments: the page refers to its images as attachment:N.
    '/api/edit': pageTooLarge,
    '/api/source/docx': docxTooLarge,
  };
  app.use('/api/*', (c, next) => (limits[c.req.path] ?? tooLarge)(c, next));

  app.get('/api/health', (c) => c.json({ ok: true }));
  app.route('/api', settingsRoutes({ store, providers }));
  app.route('/api', generateRoutes({ store, providers }));
  app.route('/api', editRoutes({ store, providers }));
  app.route('/api', docxRoutes(docx));
  app.route('/api', sourceRoutes({ readUrl }));
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  app.onError((error, c) => {
    // Never echo the error: it could include request data such as a key.
    console.error('Unexpected server error:', error instanceof Error ? error.name : 'unknown');
    return c.json({ error: 'internal' }, 500);
  });

  if (staticRoot) {
    app.use('/*', serveStatic({ root: staticRoot }));
    // Single page: any other path gets the app shell.
    app.get('*', serveStatic({ root: staticRoot, path: 'index.html' }));
  }

  return app;
}
