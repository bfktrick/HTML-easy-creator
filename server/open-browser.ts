import { spawn } from 'node:child_process';

/** Opens the URL in the default browser. Best effort: failures are ignored. */
export function openBrowser(url: string): void {
  const command =
    process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    const child = spawn(command, [url], { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // No browser available (CI, SSH): the URL is printed in the console anyway.
  }
}
