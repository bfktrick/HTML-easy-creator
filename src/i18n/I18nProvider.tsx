import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { detectLanguage, loadLanguage, saveLanguage, type Language } from './language.ts';
import { format, messages, type MessageKey } from './messages.ts';

interface I18nValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function initialLanguage(): Language {
  return loadLanguage(browserStorage()) ?? detectLanguage(navigator.languages ?? [navigator.language]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    saveLanguage(next, browserStorage());
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key, vars) => (vars ? format(messages[lang][key], vars) : messages[lang][key]) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
