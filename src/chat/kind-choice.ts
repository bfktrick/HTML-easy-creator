// Remembers the kind of page picked in the composer, so someone who makes slides keeps
// making slides after a reload. Storage can be blocked: then the choice lasts for the visit.

import { useCallback, useState } from 'react';
import { isKindChoice, type KindChoice } from '../../shared/page-kind.ts';

const STORAGE_KEY = 'html-creator.kind';

export function loadKindChoice(storage: Storage | undefined): KindChoice {
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    return isKindChoice(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveKindChoice(kind: KindChoice, storage: Storage | undefined): void {
  try {
    storage?.setItem(STORAGE_KEY, kind);
  } catch {
    // Blocked or full: nothing to do, the choice stays in memory.
  }
}

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The kind picked in the composer, restored from the last visit and saved on every change. */
export function useKindChoice(): [KindChoice, (kind: KindChoice) => void] {
  const [storage] = useState(browserStorage);
  const [kind, setKind] = useState(() => loadKindChoice(storage));
  const choose = useCallback(
    (next: KindChoice) => {
      setKind(next);
      saveKindChoice(next, storage);
    },
    [storage],
  );
  return [kind, choose];
}
