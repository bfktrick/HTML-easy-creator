// Reads a web page for the "paste a link" input. The server runs on the user's
// computer, so a careless fetch would let a page (or a link someone sends them) reach
// the router, other devices on the network or this app itself. Every hop is checked:
// public http(s) only, every address the name resolves to must be public, and the
// connection goes to the address that was checked, so a second DNS answer cannot
// swap in a private one (DNS rebinding).

import { lookup } from 'node:dns/promises';
import http, { type IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { pipeline, type Readable } from 'node:stream';
import zlib from 'node:zlib';
import { MAX_SOURCE_CHARS } from '../shared/generate.ts';
import type { UrlSourceErrorCode, UrlSourceResponse } from '../shared/source.ts';
import { htmlToText } from './html-text.ts';
import { isBlockedAddress } from './ip-address.ts';

export const FETCH_TIMEOUT_MS = 15_000;
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2048;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const REQUEST_HEADERS: Record<string, string> = {
  // A generic name: nothing about the user or the machine.
  'user-agent': 'Mozilla/5.0 (compatible; HTML-Creator link reader)',
  accept: 'text/html,application/xhtml+xml,text/markdown;q=0.9,text/plain;q=0.8,*/*;q=0.1',
  'accept-encoding': 'gzip, deflate, br',
};

export class UrlSourceError extends Error {
  readonly code: UrlSourceErrorCode;

  constructor(code: UrlSourceErrorCode) {
    super(code);
    this.name = 'UrlSourceError';
    this.code = code;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/** Every address a host name resolves to. */
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

export interface PinnedRequest {
  url: URL;
  /** Already validated: the connection must go here, whatever DNS says later. */
  address: ResolvedAddress;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface FetchedResponse {
  status: number;
  headers: IncomingHttpHeaders;
  /** The body as sent, still compressed. */
  body: Readable;
}

/** One GET without following redirects. */
export type Requester = (request: PinnedRequest) => Promise<FetchedResponse>;

export interface UrlSourceDeps {
  resolve?: Resolver;
  request?: Requester;
  /** Aborts the read, e.g. when the browser gives up on the request. */
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
}

const systemResolve: Resolver = async (hostname) => {
  const addresses = await lookup(hostname, { all: true });
  return addresses.map(({ address, family }) => ({ address, family: family === 6 ? 6 : 4 }));
};

export const nodeRequest: Requester = ({ url, address, headers, signal }) =>
  new Promise((resolve, reject) => {
    // Hands the socket the checked address instead of asking DNS again. The URL keeps
    // the host name, so the Host header and the TLS certificate check still use it.
    const pinned: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: address.address, family: address.family }]);
      else callback(null, address.address, address.family);
    };
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(url, { method: 'GET', headers, signal, lookup: pinned, agent: false }, (response) =>
      resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response }),
    );
    request.on('error', reject);
    request.end();
  });

/** Whether a URL is one the reader may open: http(s), no credentials, the scheme's own port. */
function isFetchableUrl(url: URL): boolean {
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.hostname !== ''
  );
}

/** The link the user gave, parsed, or bad_url. */
export function parseSourceUrl(raw: unknown): URL {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text === '' || text.length > MAX_URL_LENGTH) throw new UrlSourceError('bad_url');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UrlSourceError('bad_url');
  }
  if (!isFetchableUrl(url)) throw new UrlSourceError('bad_url');
  url.hash = '';
  return url;
}

/** Where a redirect points. Its target goes through the same checks as the first link. */
function redirectTarget(location: string, from: URL): URL {
  let url: URL;
  try {
    url = new URL(location, from);
  } catch {
    throw new UrlSourceError('fetch_failed');
  }
  if (!isFetchableUrl(url)) throw new UrlSourceError('blocked_address');
  url.hash = '';
  return url;
}

/** Rejects with fetch_failed as soon as the signal aborts (the timeout or the browser). */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new UrlSourceError('fetch_failed'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/** The address to connect to, after checking every address of the host. */
async function publicAddress(url: URL, resolve: Resolver, signal: AbortSignal): Promise<ResolvedAddress> {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) throw new UrlSourceError('blocked_address');

  const version = isIP(host);
  let addresses: ResolvedAddress[];
  if (version !== 0) {
    addresses = [{ address: host, family: version === 6 ? 6 : 4 }];
  } else {
    try {
      addresses = await abortable(resolve(host), signal);
    } catch {
      throw new UrlSourceError('fetch_failed');
    }
  }
  if (addresses.length === 0) throw new UrlSourceError('fetch_failed');
  // All of them, not just the first: the system could connect to any.
  if (addresses.some(({ address }) => isBlockedAddress(address))) throw new UrlSourceError('blocked_address');
  return addresses[0];
}

function header(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function contentKind(contentType: string): 'html' | 'text' | null {
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (type === 'text/html' || type === 'application/xhtml+xml') return 'html';
  if (type === 'text/plain' || type === 'text/markdown' || type === 'text/x-markdown') return 'text';
  return null;
}

function decoderFor(encoding: string): zlib.Gunzip | zlib.Inflate | zlib.BrotliDecompress | null {
  switch (encoding.trim().toLowerCase()) {
    case '':
    case 'identity':
      return null;
    case 'gzip':
    case 'x-gzip':
      return zlib.createGunzip();
    case 'deflate':
      return zlib.createInflate();
    case 'br':
      return zlib.createBrotliDecompress();
    default:
      throw new UrlSourceError('fetch_failed');
  }
}

/**
 * The decompressed body, refused past maxBytes. The limit counts decompressed bytes so
 * a small compressed bomb cannot fill the memory either.
 */
async function readBody(response: FetchedResponse, maxBytes: number, signal: AbortSignal): Promise<Buffer> {
  const declared = Number(header(response.headers, 'content-length'));
  let decoder: ReturnType<typeof decoderFor>;
  try {
    if (Number.isFinite(declared) && declared > maxBytes) throw new UrlSourceError('too_large');
    decoder = decoderFor(header(response.headers, 'content-encoding'));
  } catch (error) {
    response.body.destroy();
    throw error;
  }
  const stream: Readable = decoder ? pipeline(response.body, decoder, () => {}) : response.body;
  const stop = () => stream.destroy(new Error('aborted'));
  signal.addEventListener('abort', stop, { once: true });

  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maxBytes) throw new UrlSourceError('too_large');
      chunks.push(buffer);
    }
  } catch (error) {
    throw error instanceof UrlSourceError ? error : new UrlSourceError('fetch_failed');
  } finally {
    signal.removeEventListener('abort', stop);
    response.body.destroy();
    stream.destroy();
  }
  return Buffer.concat(chunks);
}

/** Byte-order mark, then the Content-Type charset, then <meta charset>, then UTF-8. */
function charsetOf(bytes: Buffer, contentType: string, kind: 'html' | 'text'): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType)?.[1];
  if (fromHeader) return fromHeader;
  if (kind === 'html') {
    const head = bytes.subarray(0, 4096).toString('latin1');
    const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
    if (fromMeta) return fromMeta;
  }
  return 'utf-8';
}

function decodeText(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** A plain-text or Markdown file: its first "# " heading, if any, is the title. */
function plainText(text: string): { title: string; text: string } {
  const normalized = text.replace(/\r\n?/g, '\n');
  const heading = /^#{1,6}[ \t]+(.+)$/m.exec(normalized)?.[1] ?? '';
  return { title: heading.trim(), text: normalized.trim() };
}

function fallbackTitle(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop();
  if (!last) return url.hostname;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** Reads the page at a link and returns its readable text. Throws UrlSourceError. */
export async function fetchUrlSource(rawUrl: unknown, deps: UrlSourceDeps = {}): Promise<UrlSourceResponse> {
  const resolve = deps.resolve ?? systemResolve;
  const request = deps.request ?? nodeRequest;
  const maxBytes = deps.maxBytes ?? MAX_PAGE_BYTES;
  const timeout = AbortSignal.timeout(deps.timeoutMs ?? FETCH_TIMEOUT_MS);
  const signal = deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout;

  let url = parseSourceUrl(rawUrl);
  for (let redirects = 0; ; redirects++) {
    const address = await publicAddress(url, resolve, signal);
    let response: FetchedResponse;
    try {
      response = await abortable(request({ url, address, headers: { ...REQUEST_HEADERS }, signal }), signal);
    } catch {
      throw new UrlSourceError('fetch_failed');
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      response.body.destroy();
      const location = header(response.headers, 'location');
      if (location === '' || redirects >= MAX_REDIRECTS) throw new UrlSourceError('fetch_failed');
      url = redirectTarget(location, url);
      continue;
    }
    if (response.status < 200 || response.status > 299) {
      response.body.destroy();
      throw new UrlSourceError('fetch_failed');
    }
    const contentType = header(response.headers, 'content-type');
    const kind = contentKind(contentType);
    if (!kind) {
      response.body.destroy();
      throw new UrlSourceError('unsupported_content');
    }

    const bytes = await readBody(response, maxBytes, signal);
    const decoded = decodeText(bytes, charsetOf(bytes, contentType, kind));
    const page = kind === 'html' ? htmlToText(decoded, url.href) : plainText(decoded);
    const text = page.text.trim();
    if (text === '') throw new UrlSourceError('empty_page');
    return { url: url.href, title: page.title || fallbackTitle(url), text: text.slice(0, MAX_SOURCE_CHARS) };
  }
}
