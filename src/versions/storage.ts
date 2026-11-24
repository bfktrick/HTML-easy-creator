// Keeps the versions in the browser so a reload does not lose the page. Storage can be
// blocked (private windows, site data off) or full: the app must work the same without it.

import { EMPTY_VERSIONS, type Version, type VersionsState } from './versions.ts';

const STORAGE_KEY = 'html-creator.versions';
const ORIGINS = new Set(['generated', 'edited']);

function isVersion(value: unknown): value is Version {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.html === 'string' &&
    typeof v.label === 'string' &&
    typeof v.origin === 'string' &&
    ORIGINS.has(v.origin) &&
    typeof v.createdAt === 'number' &&
    (v.parentId === undefined || typeof v.parentId === 'string') &&
    (v.request === undefined || typeof v.request === 'string')
  );
}

/** The saved versions, or none if there are none or they cannot be read. */
export function loadVersions(storage: Storage | undefined): VersionsState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_VERSIONS;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return EMPTY_VERSIONS;
    const { versions, currentId } = data as Record<string, unknown>;
    const list = Array.isArray(versions) ? versions.filter(isVersion) : [];
    if (list.length === 0) return EMPTY_VERSIONS;
    const current = list.find((v) => v.id === currentId) ?? list[list.length - 1];
    return { versions: list, currentId: current.id };
  } catch {
    return EMPTY_VERSIONS;
  }
}

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  // Firefox used its own name for it.
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/**
 * Saves the versions. When they do not fit, the oldest are left out (never the current one)
 * until they do. Returns how many were saved.
 */
export function saveVersions(state: VersionsState, storage: Storage | undefined): number {
  try {
    if (!storage) return 0;
    if (state.versions.length === 0) {
      storage.removeItem(STORAGE_KEY);
      return 0;
    }
    let versions = state.versions;
    for (;;) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ currentId: state.currentId, versions }));
        return versions.length;
      } catch (error) {
        if (!isQuotaError(error) || versions.length <= 1) throw error;
        const oldest = versions.findIndex((v) => v.id !== state.currentId);
        versions = versions.filter((_, index) => index !== oldest);
      }
    }
  } catch {
    // Blocked, or not even the current page fits: the versions last for this visit only.
    return 0;
  }
}
