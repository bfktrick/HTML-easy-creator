export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'html-creator.lang';
const FALLBACK: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** First supported language in the browser's preference list ("es-ES" counts as "es"). */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return FALLBACK;
}

export function loadLanguage(storage: Storage | undefined): Language | null {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveLanguage(lang: Language, storage: Storage | undefined): void {
  try {
    storage?.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage blocked (private window, site data off): the choice lasts for this visit only.
  }
}
