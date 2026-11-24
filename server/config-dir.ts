import path from 'node:path';

const APP_FOLDER = 'html-creator';

/**
 * Per-user settings folder, outside the repository so a key can never be committed
 * by accident and survives a fresh clone. HTML_CREATOR_CONFIG_DIR overrides it.
 */
export function resolveConfigDir(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  home: string,
): string {
  if (env.HTML_CREATOR_CONFIG_DIR) return env.HTML_CREATOR_CONFIG_DIR;

  if (platform === 'win32') {
    const appData = env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(appData, APP_FOLDER);
  }
  if (platform === 'darwin') {
    return path.posix.join(home, 'Library', 'Application Support', APP_FOLDER);
  }
  return path.posix.join(env.XDG_CONFIG_HOME ?? path.posix.join(home, '.config'), APP_FOLDER);
}
