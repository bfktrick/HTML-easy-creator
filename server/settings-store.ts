import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isProviderId, PROVIDERS, type ProviderId, type PublicSettings } from '../shared/settings.ts';

export interface ProviderSecrets {
  apiKey?: string;
  model?: string;
}

export interface StoredSettings {
  version: 1;
  activeProvider: ProviderId | null;
  providers: Partial<Record<ProviderId, ProviderSecrets>>;
}

export interface SettingsStore {
  readonly dir: string;
  get(): StoredSettings;
  /** Applies the change to a copy, writes it to disk, then makes it current. Calls run one at a time. */
  update(change: (draft: StoredSettings) => void): Promise<StoredSettings>;
}

const FILE_NAME = 'settings.json';

function emptySettings(): StoredSettings {
  return { version: 1, activeProvider: null, providers: {} };
}

function sanitize(raw: unknown): StoredSettings {
  const settings = emptySettings();
  if (typeof raw !== 'object' || raw === null) return settings;
  const data = raw as Record<string, unknown>;

  if (typeof data.providers === 'object' && data.providers !== null) {
    for (const [id, value] of Object.entries(data.providers)) {
      if (!isProviderId(id) || typeof value !== 'object' || value === null) continue;
      const entry = value as Record<string, unknown>;
      const secrets: ProviderSecrets = {};
      if (typeof entry.apiKey === 'string' && entry.apiKey !== '') secrets.apiKey = entry.apiKey;
      if (typeof entry.model === 'string' && entry.model !== '') secrets.model = entry.model;
      settings.providers[id] = secrets;
    }
  }
  if (isProviderId(data.activeProvider) && settings.providers[data.activeProvider]?.apiKey) {
    settings.activeProvider = data.activeProvider;
  }
  return settings;
}

function load(file: string): StoredSettings {
  if (!existsSync(file)) return emptySettings();
  try {
    return sanitize(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    const aside = file.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
    renameSync(file, aside);
    console.warn(`Settings file was unreadable; moved it to ${aside} and started with empty settings.`);
    return emptySettings();
  }
}

export function createSettingsStore(dir: string): SettingsStore {
  const file = path.join(dir, FILE_NAME);
  let current = load(file);
  let queue: Promise<unknown> = Promise.resolve();

  async function write(next: StoredSettings): Promise<void> {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, file);
  }

  return {
    dir,
    get: () => structuredClone(current),
    update(change) {
      const run = queue.then(async () => {
        const draft = structuredClone(current);
        change(draft);
        await write(draft);
        current = draft;
        return structuredClone(current);
      });
      queue = run.catch(() => {});
      return run;
    },
  };
}

export function keyHint(apiKey: string): string {
  return `…${apiKey.slice(-4)}`;
}

export function toPublicSettings(settings: StoredSettings, configDir: string): PublicSettings {
  const providers = {} as PublicSettings['providers'];
  for (const id of PROVIDERS) {
    const entry = settings.providers[id];
    providers[id] = {
      configured: Boolean(entry?.apiKey),
      keyHint: entry?.apiKey ? keyHint(entry.apiKey) : null,
      model: entry?.model ?? null,
    };
  }
  return { activeProvider: settings.activeProvider, configDir, providers };
}

export interface ActiveAi {
  provider: ProviderId;
  apiKey: string;
  model: string;
}

/** The AI that writes and edits pages, or null until one is connected with a model chosen. */
export function activeAi(settings: StoredSettings): ActiveAi | null {
  const provider = settings.activeProvider;
  const entry = provider ? settings.providers[provider] : undefined;
  if (!provider || !entry?.apiKey || !entry.model) return null;
  return { provider, apiKey: entry.apiKey, model: entry.model };
}
