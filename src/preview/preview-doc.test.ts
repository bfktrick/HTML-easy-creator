import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  hasRenderableBody,
  MAX_PREVIEW_ERROR_CHARS,
  PREVIEW_GUARD,
  PREVIEW_MESSAGE_SOURCE,
  previewDocument,
  previewErrorMessage,
} from './preview-doc.ts';

const G = PREVIEW_GUARD;

describe('previewDocument', () => {
  it.each([
    ['<!doctype html><html lang="es"><head><title>x</title></head><body>hi</body></html>', '<!doctype html><html lang="es"><head>'],
    ['<!DOCTYPE HTML><HTML><HEAD><TITLE>x</TITLE></HEAD><BODY>hi</BODY></HTML>', '<!DOCTYPE HTML><HTML><HEAD>'],
    ['<!doctype html><html data-x="a>b"><head data-y=\'c>d\'><meta charset="utf-8"></head></html>', `<!doctype html><html data-x="a>b"><head data-y='c>d'>`],
    ['<!doctype html>\n<html>\n  <head>\n<title>x</title></head></html>', '<!doctype html>\n<html>\n  <head>'],
    ['<!doctype html><html lang="en"><title>x</title><body>hi</body></html>', '<!doctype html><html lang="en">'],
    ['<!doctype html><title>x</title><p>hi</p>', '<!doctype html>'],
    ['<p>hi</p>', ''],
    ['  \n<!-- made by hand --><!doctype html><!-- x --><html><!-- y --><head></head></html>', '  \n<!-- made by hand --><!doctype html><!-- x --><html><!-- y --><head>'],
    ['\uFEFF<!doctype html><html><head></head></html>', '\uFEFF<!doctype html><html><head>'],
    ['<!doctype html><html><header>top</header><body></body></html>', '<!doctype html><html>'],
    ['<!doctype html><html><head-like></head-like></html>', '<!doctype html><html>'],
  ])('puts the guard first in the head of %j', (html, before) => {
    const result = previewDocument(html);
    expect(result.startsWith(before + G)).toBe(true);
    expect(result.replace(G, '')).toBe(html);
  });

  it('only looks at the prologue, not at a "<head>" written in the body', () => {
    const html = '<!doctype html><html><body><pre>&lt;head&gt;</pre><script>var s = "<head>";</script></body></html>';
    expect(previewDocument(html)).toBe(`<!doctype html><html>${G}<body>` + html.slice('<!doctype html><html><body>'.length));
  });

  it('copes with a page that is still streaming in', () => {
    expect(previewDocument('<!doctype html><html lang=')).toBe(`<!doctype html>${G}<html lang=`);
    expect(previewDocument('<!doc')).toBe(`${G}<!doc`);
    expect(previewDocument('')).toBe(G);
  });

  it('is idempotent', () => {
    for (const html of ['<!doctype html><html><head></head></html>', '<html><body></body></html>', '<!doctype html><p>x', 'x']) {
      const once = previewDocument(html);
      expect(previewDocument(once)).toBe(once);
    }
  });

  it('keeps the guard a single, self-contained script', () => {
    const inner = G.slice(G.indexOf('>') + 1, -'</script>'.length);
    expect(inner).not.toMatch(/<\/script/i);
    expect(inner).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });
});

describe('hasRenderableBody', () => {
  it('waits while only the head has arrived', () => {
    expect(hasRenderableBody('')).toBe(false);
    expect(hasRenderableBody('<!doctype html><html><head><style>body { color: red }')).toBe(false);
    expect(hasRenderableBody('<!doctype html><html><head><style></style></head>')).toBe(false);
    expect(hasRenderableBody('<!doctype html><html><head></head><bo')).toBe(false);
    expect(hasRenderableBody('<head><meta name="bodyguard"></head>\n')).toBe(false);
  });

  it('renders once the body has started, written or implied', () => {
    expect(hasRenderableBody('<!doctype html><html><head></head><body>')).toBe(true);
    expect(hasRenderableBody('<HEAD></HEAD><BODY class="x">')).toBe(true);
    expect(hasRenderableBody('<head></head>\n<!-- page --><main>')).toBe(true);
  });
});

describe('previewErrorMessage', () => {
  it('reads messages from the guard', () => {
    expect(previewErrorMessage({ source: PREVIEW_MESSAGE_SOURCE, type: 'error', message: ' x is\n not defined ' })).toBe(
      'x is not defined',
    );
    expect(
      previewErrorMessage({ source: PREVIEW_MESSAGE_SOURCE, type: 'error', message: 'y'.repeat(1000) })?.length,
    ).toBe(MAX_PREVIEW_ERROR_CHARS);
  });

  it('ignores anything else', () => {
    expect(previewErrorMessage(null)).toBeNull();
    expect(previewErrorMessage('error')).toBeNull();
    expect(previewErrorMessage({ source: 'other', type: 'error', message: 'x' })).toBeNull();
    expect(previewErrorMessage({ source: PREVIEW_MESSAGE_SOURCE, type: 'log', message: 'x' })).toBeNull();
    expect(previewErrorMessage({ source: PREVIEW_MESSAGE_SOURCE, type: 'error', message: 3 })).toBeNull();
    expect(previewErrorMessage({ source: PREVIEW_MESSAGE_SOURCE, type: 'error', message: '  ' })).toBeNull();
  });
});

// Runs the guard against a fake window that behaves like the sandboxed iframe.
type Listener = (event: Record<string, unknown>) => void;

function runGuard({ storageThrows = true, cookieThrows = true } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const posted: Array<{ data: unknown; origin: string }> = [];
  const opened: unknown[][] = [];
  const scrolledTo: unknown[][] = [];
  const blocked = () => {
    throw new Error('SecurityError: the document is sandboxed');
  };
  const realStorage = { real: true };
  const sections: Record<string, { scrollIntoView: () => void }> = { pricing: { scrollIntoView: vi.fn() } };

  const window: Record<string, unknown> = {
    addEventListener: (type: string, listener: Listener) => (listeners[type] ??= []).push(listener),
    open: (...args: unknown[]) => opened.push(args),
    scrollTo: (...args: unknown[]) => scrolledTo.push(args),
    parent: { postMessage: (data: unknown, origin: string) => posted.push({ data, origin }) },
  };
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: storageThrows ? blocked : () => realStorage,
    });
  }
  const document: Record<string, unknown> = {
    getElementById: (id: string) => sections[id] ?? null,
    getElementsByName: () => [],
  };
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: cookieThrows ? blocked : () => 'real=1',
    set: cookieThrows ? blocked : () => {},
  });

  const source = G.slice(G.indexOf('>') + 1, -'</script>'.length);
  vm.runInNewContext(source, { window, document });

  const fire = (type: string, event: Record<string, unknown>) => {
    for (const listener of listeners[type] ?? []) listener(event);
  };
  return { window, document, posted, opened, scrolledTo, sections, realStorage, fire };
}

function link(href: string, attrs: Record<string, string> = {}) {
  const all: Record<string, string> = { href, ...attrs };
  return {
    nodeName: 'A',
    getAttribute: (name: string) => all[name] ?? null,
    hasAttribute: (name: string) => name in all,
    parentNode: null,
  };
}

function click(target: unknown, extra: Record<string, unknown> = {}) {
  return { target, button: 0, defaultPrevented: false, preventDefault: vi.fn(), ...extra };
}

describe('preview guard script', () => {
  it('swaps blocked storage for an in-memory one', () => {
    const { window } = runGuard();
    const storage = window.localStorage as Storage;
    storage.setItem('theme', 'dark' as string);
    storage.setItem('n', 2 as unknown as string);
    expect(storage.getItem('theme')).toBe('dark');
    expect(storage.getItem('n')).toBe('2');
    expect(storage.getItem('missing')).toBeNull();
    expect(storage.length).toBe(2);
    expect(storage.key(0)).toBe('theme');
    expect(storage.key(5)).toBeNull();
    storage.removeItem('theme');
    expect(storage.length).toBe(1);
    storage.clear();
    expect(storage.length).toBe(0);
    expect(window.sessionStorage).not.toBe(window.localStorage);
  });

  it('leaves working storage and cookies alone', () => {
    const { window, document, realStorage } = runGuard({ storageThrows: false, cookieThrows: false });
    expect(window.localStorage).toBe(realStorage);
    expect(document.cookie).toBe('real=1');
  });

  it('keeps cookies in memory', () => {
    const { document } = runGuard();
    document.cookie = 'a=1; path=/';
    document.cookie = 'b=two';
    expect(document.cookie).toBe('a=1; b=two');
    document.cookie = 'a=; max-age=0';
    document.cookie = 'b=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    expect(document.cookie).toBe('');
  });

  it('stops forms from navigating the frame, except dialog forms', () => {
    const { fire } = runGuard();
    const post = { target: { getAttribute: () => 'post' }, preventDefault: vi.fn() };
    fire('submit', post);
    expect(post.preventDefault).toHaveBeenCalled();

    const dialog = { target: { getAttribute: () => 'dialog' }, preventDefault: vi.fn() };
    fire('submit', dialog);
    expect(dialog.preventDefault).not.toHaveBeenCalled();
  });

  it('scrolls to fragments by hand', () => {
    const { fire, sections, scrolledTo, opened } = runGuard();
    const event = click(link('#pricing'));
    fire('click', event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(sections.pricing.scrollIntoView).toHaveBeenCalled();

    fire('click', click(link('#')));
    expect(scrolledTo).toEqual([[0, 0]]);
    expect(opened).toEqual([]);
  });

  it('opens web and mail links in a new tab and swallows relative ones', () => {
    const { fire, opened } = runGuard();
    const web = click({ nodeName: 'SPAN', parentNode: link('https://example.com/a') });
    fire('click', web);
    expect(web.preventDefault).toHaveBeenCalled();
    fire('click', click(link('mailto:hola@example.com')));
    expect(opened).toEqual([
      ['https://example.com/a', '_blank', 'noopener,noreferrer'],
      ['mailto:hola@example.com', '_blank', 'noopener,noreferrer'],
    ]);

    const relative = click(link('otra-pagina.html'));
    fire('click', relative);
    expect(relative.preventDefault).toHaveBeenCalled();
    expect(opened).toHaveLength(2);
  });

  it('leaves links the page already handled, or that run script, alone', () => {
    const { fire, opened } = runGuard();
    const handled = click(link('https://example.com'), { defaultPrevented: true });
    fire('click', handled);
    const script = click(link('javascript:void(0)'));
    fire('click', script);
    const middle = click(link('https://example.com'), { button: 1 });
    fire('click', middle);
    expect(opened).toEqual([]);
    expect(script.preventDefault).not.toHaveBeenCalled();
  });

  it('reports script errors to the app, trimmed and capped', () => {
    const { fire, posted } = runGuard();
    fire('error', { message: 'Uncaught ReferenceError: x is not defined' });
    fire('unhandledrejection', { reason: { message: 'fetch failed' } });
    fire('unhandledrejection', { reason: 'plain' });
    fire('error', { message: 'z'.repeat(1000) });
    expect(posted[0]).toEqual({
      data: { source: PREVIEW_MESSAGE_SOURCE, type: 'error', message: 'Uncaught ReferenceError: x is not defined' },
      origin: '*',
    });
    expect(posted.map((p) => (p.data as { message: string }).message.length)).toEqual([41, 12, 5, MAX_PREVIEW_ERROR_CHARS]);

    for (let i = 0; i < 20; i++) fire('error', { message: 'again' });
    expect(posted).toHaveLength(10);
  });
});
