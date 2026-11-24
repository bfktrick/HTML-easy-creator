import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicSettings } from '../../shared/settings.ts';
import { api } from '../api.ts';

interface SettingsValue {
  /** null while loading or if the first load failed. */
  settings: PublicSettings | null;
  loadError: unknown;
  setSettings: (settings: PublicSettings) => void;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setSettings(await api.getSettings());
      setLoadError(null);
    } catch (error) {
      setLoadError(error);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(() => ({ settings, loadError, setSettings, reload }), [settings, loadError, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
