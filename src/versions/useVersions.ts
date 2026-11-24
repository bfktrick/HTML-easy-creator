import { useCallback, useEffect, useReducer, useState } from 'react';
import { loadVersions, saveVersions } from './storage.ts';
import { currentVersion, versionsReducer, type Version, type VersionOrigin } from './versions.ts';

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** The page's versions, restored from the last visit and saved on every change. */
export function useVersions() {
  const [storage] = useState(browserStorage);
  const [state, dispatch] = useReducer(versionsReducer, storage, loadVersions);

  useEffect(() => {
    saveVersions(state, storage);
  }, [state, storage]);

  /** Appends a version, makes it current and returns its id. An edit says what it was made from. */
  const add = useCallback(
    (html: string, label: string, origin: VersionOrigin, from?: { parentId: string; request: string }): string => {
      const version: Version = { id: newId(), html, label, origin, createdAt: Date.now(), ...from };
      dispatch({ type: 'add', version });
      return version.id;
    },
    [],
  );
  const select = useCallback((id: string) => dispatch({ type: 'select', id }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return { versions: state.versions, current: currentVersion(state), add, select, reset };
}
