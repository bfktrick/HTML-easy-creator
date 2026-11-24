import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { getRequestListener } from '@hono/node-server';
import { createApp, isAllowedHost } from './app.ts';
import { HANDOFF_MS, openAppWindow } from './app-window.ts';
import { resolveConfigDir } from './config-dir.ts';
import { openBrowser } from './open-browser.ts';
import { anthropicAdapter } from './providers/anthropic.ts';
import { openAIAdapter } from './providers/openai.ts';
import { createSettingsStore } from './settings-store.ts';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4800;

const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const shouldOpen = !args.has('--no-open') && process.env.HTML_CREATOR_NO_OPEN !== '1';
// --window: the app gets a window of its own and the server stops when it is closed.
const windowMode = args.has('--window');

const port = Number(process.env.PORT ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`PORT must be a number between 1 and 65535 (got "${process.env.PORT}").`);
  process.exit(1);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

if (!dev && !existsSync(path.join(distDir, 'index.html'))) {
  console.error('The app is not built yet. Run "pnpm start" (it builds first) or "pnpm build".');
  process.exit(1);
}

type Middleware = (req: IncomingMessage, res: ServerResponse) => void;

const httpServer = createServer();
const configDir = resolveConfigDir(process.env, process.platform, homedir());
const store = createSettingsStore(configDir);
const app = createApp({
  port,
  store,
  providers: { anthropic: anthropicAdapter, openai: openAIAdapter },
  staticRoot: dev ? undefined : distDir,
});
const apiListener = getRequestListener(app.fetch);

let viteMiddleware: Middleware | undefined;
if (dev) {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    root: rootDir,
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server: httpServer } },
  });
  viteMiddleware = vite.middlewares;
}

httpServer.on('request', (req, res) => {
  if (!isAllowedHost(req.headers.host, port)) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  if (viteMiddleware && !req.url?.startsWith('/api/')) {
    viteMiddleware(req, res);
    return;
  }
  void apiListener(req, res);
});

/** Whether the server already on our port is HTML Creator (opened twice) rather than another program. */
async function isOurServer(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2_000) });
    const body: unknown = await response.json();
    return typeof body === 'object' && body !== null && 'ok' in body && body.ok === true;
  } catch {
    return false;
  }
}

/** Opens the app window; when it closes, the server stops. Falls back to the default browser. */
function openWindow(url: string) {
  const opened = Date.now();
  const child = openAppWindow(url, path.join(configDir, 'window'), process.env, process.platform);
  if (!child) {
    console.log('No Edge, Chrome or Brave found: opening the default browser instead.');
    openBrowser(url);
    return;
  }
  child.on('exit', () => {
    // A quick exit means the page went to a window that was already open: keep serving it.
    if (Date.now() - opened < HANDOFF_MS) return;
    console.log('Window closed. Bye!');
    process.exit(0);
  });
}

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE' && windowMode) {
    // Started twice: show the running app instead of failing.
    const url = `http://${HOST}:${port}`;
    void isOurServer(url).then((ours) => {
      if (!ours) {
        console.error(`Port ${port} is used by another program. Run with PORT=<another port>.`);
        process.exit(1);
      }
      openAppWindow(url, path.join(configDir, 'window'), process.env, process.platform)?.unref();
      process.exit(0);
    });
    return;
  }
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Close the other app or run with PORT=<another port>.`);
    process.exit(1);
  }
  throw error;
});

httpServer.listen(port, HOST, () => {
  const url = `http://${HOST}:${port}`;
  console.log(`HTML Creator running at ${url}${dev ? ' (dev)' : ''}`);
  console.log('Press Ctrl+C to stop.');
  if (windowMode) openWindow(url);
  else if (shouldOpen) openBrowser(url);
});
