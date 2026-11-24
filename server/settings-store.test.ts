import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSettingsStore, keyHint, toPublicSettings } from './settings-store.ts';

// Fake values with the shape of a key, not real credentials.
const KEY = 'test-key-anthropic-000000000001234';
const OTHER_KEY = 'test-key-openai-0000000000005678';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'hc-settings-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('createSettingsStore', () => {
  it('starts empty when there is no file', () => {
    const store = createSettingsStore(dir);
    expect(store.get()).toEqual({ version: 1, activeProvider: null, providers: {} });
  });

  it('persists updates and reads them back in a new store', async () => {
    const store = createSettingsStore(dir);
    await store.update((draft) => {
      draft.providers.anthropic = { apiKey: KEY, model: 'claude-opus-5-5' };
      draft.activeProvider = 'anthropic';
    });

    const reopened = createSettingsStore(dir);
    expect(reopened.get().activeProvider).toBe('anthropic');
    expect(reopened.get().providers.anthropic).toEqual({ apiKey: KEY, model: 'claude-opus-5-5' });
  });

  it('applies concurrent updates one after the other', async () => {
    const store = createSettingsStore(dir);
    await Promise.all([
      store.update((d) => {
        d.providers.anthropic = { apiKey: KEY };
      }),
      store.update((d) => {
        d.providers.openai = { apiKey: OTHER_KEY };
      }),
    ]);
    const reopened = createSettingsStore(dir);
    expect(Object.keys(reopened.get().providers).sort()).toEqual(['anthropic', 'openai']);
  });

  it('does not change the cached settings when an update fails', async () => {
    const store = createSettingsStore(dir);
    await expect(
      store.update(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(store.get().providers).toEqual({});
  });

  it('sets aside a corrupt file and starts empty', () => {
    writeFileSync(path.join(dir, 'settings.json'), '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createSettingsStore(dir);
    expect(store.get().providers).toEqual({});
    expect(readdirSync(dir).some((name) => name.startsWith('settings.corrupt-'))).toBe(true);
    warn.mockRestore();
  });

  it('drops unknown providers and malformed fields from the file', () => {
    writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({
        version: 1,
        activeProvider: 'gemini',
        providers: { anthropic: { apiKey: KEY, model: 42 }, gemini: { apiKey: 'x' } },
      }),
    );
    const store = createSettingsStore(dir);
    expect(store.get()).toEqual({ version: 1, activeProvider: null, providers: { anthropic: { apiKey: KEY } } });
  });

  it.skipIf(process.platform === 'win32')('writes the file readable by its owner only', async () => {
    const store = createSettingsStore(dir);
    await store.update((d) => {
      d.providers.anthropic = { apiKey: KEY };
    });
    expect(statSync(path.join(dir, 'settings.json')).mode & 0o777).toBe(0o600);
  });

  it('keeps the key in the settings file', async () => {
    const store = createSettingsStore(dir);
    await store.update((d) => {
      d.providers.anthropic = { apiKey: KEY };
    });
    expect(readFileSync(path.join(dir, 'settings.json'), 'utf8')).toContain(KEY);
  });
});

describe('toPublicSettings', () => {
  it('never exposes the key', () => {
    const view = toPublicSettings(
      { version: 1, activeProvider: 'anthropic', providers: { anthropic: { apiKey: KEY, model: 'claude-opus-5-5' } } },
      dir,
    );
    expect(JSON.stringify(view)).not.toContain(KEY);
    expect(view).toEqual({
      activeProvider: 'anthropic',
      configDir: dir,
      providers: {
        anthropic: { configured: true, keyHint: '…1234', model: 'claude-opus-5-5' },
        openai: { configured: false, keyHint: null, model: null },
      },
    });
  });
});

describe('keyHint', () => {
  it('shows only the last four characters', () => {
    expect(keyHint('test-key-abcdefgh9876')).toBe('…9876');
  });
});
