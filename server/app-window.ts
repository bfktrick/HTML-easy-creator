import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

// "Window mode": the app opens in a window of its own (no address bar, no tabs, its own
// taskbar entry) through the --app switch that every Chromium browser has. No extra
// runtime to download: Windows ships Edge, and most people have Chrome or Brave anyway.

/** A window shorter-lived than this handed the page to a window that was already open. */
export const HANDOFF_MS = 5_000;

const WINDOWS_BROWSERS = [
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
  ['BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'],
  ['Chromium', 'Application', 'chrome.exe'],
];

const MAC_BROWSERS = [
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const LINUX_BROWSERS = [
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/brave-browser',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

/** Where a browser able to open an app window may be installed, in order of preference. */
export function appWindowCandidates(env: Record<string, string | undefined>, platform: NodeJS.Platform): string[] {
  if (platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(
      (root): root is string => Boolean(root),
    );
    return WINDOWS_BROWSERS.flatMap((parts) => roots.map((root) => path.win32.join(root, ...parts)));
  }
  return platform === 'darwin' ? MAC_BROWSERS : LINUX_BROWSERS;
}

/**
 * A profile of its own keeps the window apart from the person's browsing (and from their
 * extensions), keeps the app's saved versions between runs, and makes the browser process
 * live exactly as long as the window, which is how the server knows when to stop.
 */
export function appWindowArgs(url: string, profileDir: string): string[] {
  return [
    `--app=${url}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
  ];
}

export interface AppWindowDeps {
  exists?: (file: string) => boolean;
  start?: (file: string, args: string[]) => ChildProcess;
}

/** Opens the app window, or returns null when no suitable browser is installed. */
export function openAppWindow(
  url: string,
  profileDir: string,
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  { exists = existsSync, start = (file, args) => spawn(file, args, { stdio: 'ignore' }) }: AppWindowDeps = {},
): ChildProcess | null {
  const browser = appWindowCandidates(env, platform).find((file) => exists(file));
  if (!browser) return null;
  try {
    const child = start(browser, appWindowArgs(url, profileDir));
    child.on('error', () => {});
    return child;
  } catch {
    return null;
  }
}
