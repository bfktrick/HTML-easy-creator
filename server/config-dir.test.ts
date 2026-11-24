import { describe, expect, it } from 'vitest';
import { resolveConfigDir } from './config-dir.ts';

describe('resolveConfigDir', () => {
  it('honours an explicit override', () => {
    expect(resolveConfigDir({ HTML_CREATOR_CONFIG_DIR: '/tmp/hc' }, 'linux', '/home/ana')).toBe('/tmp/hc');
  });

  it('uses APPDATA on Windows', () => {
    expect(resolveConfigDir({ APPDATA: 'C:\\Users\\Ana\\AppData\\Roaming' }, 'win32', 'C:\\Users\\Ana')).toBe(
      'C:\\Users\\Ana\\AppData\\Roaming\\html-creator',
    );
    expect(resolveConfigDir({}, 'win32', 'C:\\Users\\Ana')).toBe('C:\\Users\\Ana\\AppData\\Roaming\\html-creator');
  });

  it('uses Application Support on macOS', () => {
    expect(resolveConfigDir({}, 'darwin', '/Users/ana')).toBe('/Users/ana/Library/Application Support/html-creator');
  });

  it('uses XDG_CONFIG_HOME or ~/.config elsewhere', () => {
    expect(resolveConfigDir({ XDG_CONFIG_HOME: '/cfg' }, 'linux', '/home/ana')).toBe('/cfg/html-creator');
    expect(resolveConfigDir({}, 'linux', '/home/ana')).toBe('/home/ana/.config/html-creator');
  });
});
