import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_CHARS } from '../shared/generate.ts';
import {
  fetchUrlSource,
  nodeRequest,
  parseSourceUrl,
  UrlSourceError,
  type FetchedResponse,
  type PinnedRequest,
  type ResolvedAddress,
  type UrlSourceDeps,
} from './url-source.ts';

// Fake DNS and HTTP: nothing in these tests reaches the network.
const DNS: Record<string, string[]> = {
  'example.com': ['93.184.215.14'],
  'www.example.com': ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
  'other.example': ['1.1.1.1'],
  'internal.example': ['10.0.0.5'],
  'mixed.example': ['1.1.1.1', '127.0.0.1'],
  'mapped.example': ['::ffff:192.168.1.1'],
};

async function resolve(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = DNS[hostname];
  if (!addresses) throw new Error('ENOTFOUND');
  return addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

/** A link with a user name (and maybe a password) in it, built so no such URL is written out. */
function withUser(base: string, password = ''): string {
  const url = new URL(base);
  url.username = 'someone';
  url.password = password;
  return url.href;
}

interface FakeResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string | Buffer | Buffer[];
}

function html(body: string, title = 'Página') {
  return `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;
}

function site(pages: Record<string, FakeResponse | (() => Promise<FetchedResponse>)>) {
  const requests: PinnedRequest[] = [];
  const deps: UrlSourceDeps = {
    resolve,
    async request(request) {
      requests.push(request);
      const page = pages[request.url.href];
      if (!page) throw new Error('ECONNREFUSED');
      if (typeof page === 'function') return page();
      const body = page.body ?? '';
      return {
        status: page.status ?? 200,
        headers: { 'content-type': 'text/html; charset=utf-8', ...page.headers },
        body: Readable.from(Array.isArray(body) ? body : [Buffer.from(body)]),
      };
    },
  };
  return { deps, requests };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof UrlSourceError) return error.code;
    throw error;
  }
  throw new Error('expected a UrlSourceError');
}

describe('parseSourceUrl', () => {
  it('accepts public http(s) links and drops the fragment', () => {
    expect(parseSourceUrl(' https://example.com/a?b=1#c ').href).toBe('https://example.com/a?b=1');
    expect(parseSourceUrl('http://example.com:80/').href).toBe('http://example.com/');
    expect(parseSourceUrl('https://example.com:443/x').href).toBe('https://example.com/x');
  });

  it.each([
    '',
    'example.com',
    'ftp://example.com/file',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'data:text/html,hi',
    withUser('https://example.com/', 'not-a-real-secret'),
    withUser('https://example.com/'),
    'https://example.com:8443/',
    'http://example.com:443/',
    'http://example.com:22/',
    `https://example.com/${'a'.repeat(3000)}`,
  ])('refuses %j', (raw) => {
    expect(() => parseSourceUrl(raw)).toThrow(UrlSourceError);
  });

  it('refuses anything that is not a string', () => {
    expect(() => parseSourceUrl(42)).toThrow(UrlSourceError);
  });
});

describe('fetchUrlSource', () => {
  it('reads a page and pins the connection to the checked address', async () => {
    const { deps, requests } = site({ 'https://example.com/guia': { body: html('<main><h1>Hola</h1><p>Texto</p></main>', 'Guía') } });
    const source = await fetchUrlSource('https://example.com/guia', deps);
    expect(source).toEqual({ url: 'https://example.com/guia', title: 'Guía', text: '# Hola\n\nTexto' });
    expect(requests).toHaveLength(1);
    expect(requests[0].address).toEqual({ address: '93.184.215.14', family: 4 });
  });

  it('refuses hosts that resolve to an internal address, even partly', async () => {
    for (const host of ['internal.example', 'mixed.example', 'mapped.example', 'localhost', 'app.localhost']) {
      const { deps, requests } = site({});
      expect(await failure(fetchUrlSource(`https://${host}/`, deps))).toBe('blocked_address');
      expect(requests).toEqual([]);
    }
  });

  it('refuses internal IP literals without asking DNS', async () => {
    const noDns = () => Promise.reject(new Error('no DNS'));
    for (const url of [
      'http://127.0.0.1/',
      'http://2130706433/',
      'http://0x7f.1/',
      'http://[::1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://169.254.169.254/latest/meta-data/',
    ]) {
      const { deps, requests } = site({});
      expect(await failure(fetchUrlSource(url, { ...deps, resolve: noDns }))).toBe('blocked_address');
      expect(requests).toEqual([]);
    }
  });

  it('follows redirects and checks every hop', async () => {
    const { deps, requests } = site({
      'http://example.com/': { status: 301, headers: { location: 'https://www.example.com/' } },
      'https://www.example.com/': { status: 302, headers: { location: '/final#x' } },
      'https://www.example.com/final': { body: html('<p>Fin</p>') },
    });
    const source = await fetchUrlSource('http://example.com/', deps);
    expect(source.url).toBe('https://www.example.com/final');
    expect(source.text).toBe('Fin');
    expect(requests.map((r) => r.url.href)).toEqual([
      'http://example.com/',
      'https://www.example.com/',
      'https://www.example.com/final',
    ]);
  });

  it.each([
    ['an internal host', 'https://internal.example/'],
    ['a loopback literal', 'http://127.0.0.1:80/admin'],
    ['another scheme', 'file:///etc/passwd'],
    ['a non-default port', 'https://other.example:8443/'],
    ['credentials', withUser('https://other.example/', 'not-a-real-secret')],
  ])('refuses a redirect to %s', async (_label, location) => {
    const { deps, requests } = site({ 'https://example.com/': { status: 302, headers: { location } } });
    expect(await failure(fetchUrlSource('https://example.com/', deps))).toBe('blocked_address');
    expect(requests).toHaveLength(1);
  });

  it('stops after five redirects', async () => {
    const pages: Record<string, FakeResponse> = {};
    for (let i = 0; i < 7; i++) pages[`https://example.com/${i}`] = { status: 307, headers: { location: `/${i + 1}` } };
    const { deps, requests } = site(pages);
    expect(await failure(fetchUrlSource('https://example.com/0', deps))).toBe('fetch_failed');
    expect(requests).toHaveLength(6);
  });

  it('refuses bodies past the size cap while streaming', async () => {
    const chunk = Buffer.alloc(1024, 'a');
    const { deps } = site({ 'https://example.com/': { body: Array.from({ length: 20 }, () => chunk) } });
    expect(await failure(fetchUrlSource('https://example.com/', { ...deps, maxBytes: 10 * 1024 }))).toBe('too_large');
  });

  it('refuses a declared length past the cap without reading', async () => {
    const { deps } = site({ 'https://example.com/': { headers: { 'content-length': String(6 * 1024 * 1024) }, body: 'x' } });
    expect(await failure(fetchUrlSource('https://example.com/', deps))).toBe('too_large');
  });

  it('counts decompressed bytes, so a small compressed bomb is refused', async () => {
    const bomb = gzipSync(Buffer.alloc(200 * 1024, 'a'));
    expect(bomb.length).toBeLessThan(10 * 1024);
    const { deps } = site({ 'https://example.com/': { headers: { 'content-encoding': 'gzip' }, body: bomb } });
    expect(await failure(fetchUrlSource('https://example.com/', { ...deps, maxBytes: 100 * 1024 }))).toBe('too_large');
  });

  it.each([
    ['gzip', gzipSync],
    ['deflate', deflateSync],
    ['br', brotliCompressSync],
  ] as const)('decodes %s', async (encoding, compress) => {
    const body = compress(Buffer.from(html('<p>Comprimido</p>')));
    const { deps } = site({ 'https://example.com/': { headers: { 'content-encoding': encoding }, body } });
    expect((await fetchUrlSource('https://example.com/', deps)).text).toBe('Comprimido');
  });

  it('honours the declared charset', async () => {
    const latin1 = Buffer.from(html('<p>Año, canción</p>'), 'latin1');
    const fromHeader = site({
      'https://example.com/': { headers: { 'content-type': 'text/html; charset=ISO-8859-1' }, body: latin1 },
    });
    expect((await fetchUrlSource('https://example.com/', fromHeader.deps)).text).toBe('Año, canción');

    const withMeta = Buffer.from(html('<p>Año</p>').replace('<head>', '<head><meta charset="windows-1252">'), 'latin1');
    const fromMeta = site({ 'https://example.com/': { headers: { 'content-type': 'text/html' }, body: withMeta } });
    expect((await fetchUrlSource('https://example.com/', fromMeta.deps)).text).toBe('Año');
  });

  it('reads plain text and Markdown as they are', async () => {
    const { deps } = site({
      'https://example.com/notas.md': { headers: { 'content-type': 'text/markdown' }, body: '# Notas\r\n\r\n- uno\r\n- dos\r\n' },
      'https://example.com/leeme.txt': { headers: { 'content-type': 'text/plain' }, body: 'Hola' },
    });
    expect(await fetchUrlSource('https://example.com/notas.md', deps)).toEqual({
      url: 'https://example.com/notas.md',
      title: 'Notas',
      text: '# Notas\n\n- uno\n- dos',
    });
    expect((await fetchUrlSource('https://example.com/leeme.txt', deps)).title).toBe('leeme.txt');
  });

  it.each(['application/pdf', 'image/png', 'application/json', ''])('refuses content type %j', async (type) => {
    const { deps } = site({ 'https://example.com/': { headers: { 'content-type': type }, body: '%PDF' } });
    expect(await failure(fetchUrlSource('https://example.com/', deps))).toBe('unsupported_content');
  });

  it('reports pages without text', async () => {
    const { deps } = site({ 'https://example.com/': { body: html('<div id="app"></div><script src="x.js"></script>') } });
    expect(await failure(fetchUrlSource('https://example.com/', deps))).toBe('empty_page');
  });

  it('reports HTTP errors, network errors and unknown hosts as fetch_failed', async () => {
    const { deps } = site({ 'https://example.com/404': { status: 404, body: html('<p>No</p>') } });
    expect(await failure(fetchUrlSource('https://example.com/404', deps))).toBe('fetch_failed');
    expect(await failure(fetchUrlSource('https://example.com/down', deps))).toBe('fetch_failed');
    expect(await failure(fetchUrlSource('https://nowhere.example/', deps))).toBe('fetch_failed');
  });

  it('gives up when the server never answers', async () => {
    const { deps } = site({ 'https://example.com/': () => new Promise<FetchedResponse>(() => {}) });
    expect(await failure(fetchUrlSource('https://example.com/', { ...deps, timeoutMs: 30 }))).toBe('fetch_failed');
  });

  it('gives up when the body stalls', async () => {
    const stalled = new Readable({ read() {} });
    stalled.push('<!doctype html><p>a');
    const { deps } = site({
      'https://example.com/': async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: stalled }),
    });
    expect(await failure(fetchUrlSource('https://example.com/', { ...deps, timeoutMs: 30 }))).toBe('fetch_failed');
  });

  it('caps the text at the source limit', async () => {
    const long = 'palabra '.repeat(MAX_SOURCE_CHARS / 4);
    const { deps } = site({ 'https://example.com/': { headers: { 'content-type': 'text/plain' }, body: long } });
    expect((await fetchUrlSource('https://example.com/', deps)).text).toHaveLength(MAX_SOURCE_CHARS);
  });
});

describe('nodeRequest', () => {
  // A loopback server stands in for the site. ".invalid" never resolves (RFC 6761),
  // so getting an answer proves the socket used the pinned address, not DNS.
  it('connects to the pinned address and keeps the host name in the request', async () => {
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(req.headers.host);
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;
    try {
      const response = await nodeRequest({
        url: new URL(`http://pinned.invalid:${port}/`),
        address: { address: '127.0.0.1', family: 4 },
        headers: {},
        signal: AbortSignal.timeout(5000),
      });
      let body = '';
      for await (const chunk of response.body) body += String(chunk);
      expect(response.status).toBe(200);
      expect(body).toBe(`pinned.invalid:${port}`);
    } finally {
      server.close();
    }
  });
});
