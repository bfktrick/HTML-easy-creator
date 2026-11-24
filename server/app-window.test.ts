import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { appWindowArgs, appWindowCandidates, openAppWindow } from './app-window.ts';

const WINDOWS_ENV = {
  PROGRAMFILES: 'C:\\Program Files',
  'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local',
};

describe('appWindowCandidates', () => {
  it('prefers Edge, then Chrome and Brave, in every Windows install folder', () => {
    const list = appWindowCandidates(WINDOWS_ENV, 'win32');
    expect(list[0]).toBe('C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe');
    expect(list).toContain('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe');
    expect(list).toContain('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
    expect(list).toContain('C:\\Users\\Ana\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe');
    expect(list.findIndex((f) => f.endsWith('msedge.exe'))).toBeLessThan(list.findIndex((f) => f.endsWith('brave.exe')));
  });

  it('skips Windows folders that are not set', () => {
    const list = appWindowCandidates({ PROGRAMFILES: 'C:\\Program Files' }, 'win32');
    expect(list.every((file) => file.startsWith('C:\\Program Files\\'))).toBe(true);
  });

  it('has fixed paths on macOS and Linux', () => {
    expect(appWindowCandidates({}, 'darwin')[0]).toContain('/Applications/');
    expect(appWindowCandidates({}, 'linux')).toContain('/usr/bin/google-chrome');
  });
});

describe('appWindowArgs', () => {
  it('opens the url as an app window with its own profile', () => {
    const args = appWindowArgs('http://127.0.0.1:4800', 'C:\\cfg\\window');
    expect(args).toContain('--app=http://127.0.0.1:4800');
    expect(args).toContain('--user-data-dir=C:\\cfg\\window');
  });
});

describe('openAppWindow', () => {
  function fakeChild(): ChildProcess {
    return new EventEmitter() as ChildProcess;
  }

  it('starts the first installed browser', () => {
    const started: string[] = [];
    const child = openAppWindow('http://127.0.0.1:4800', 'p', WINDOWS_ENV, 'win32', {
      exists: (file) => file.endsWith('chrome.exe'),
      start: (file) => {
        started.push(file);
        return fakeChild();
      },
    });
    expect(child).not.toBeNull();
    expect(started).toEqual(['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']);
  });

  it('returns null without a suitable browser or when it cannot start', () => {
    expect(openAppWindow('u', 'p', WINDOWS_ENV, 'win32', { exists: () => false })).toBeNull();
    expect(
      openAppWindow('u', 'p', WINDOWS_ENV, 'win32', {
        exists: () => true,
        start: () => {
          throw new Error('EACCES');
        },
      }),
    ).toBeNull();
  });
});
