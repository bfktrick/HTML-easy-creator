// Every state of the page is a version. The list only grows: going back to an old version
// makes it current, and the next change is appended after the newest one, built from it.

export type VersionOrigin = 'generated' | 'edited';

export interface Version {
  id: string;
  html: string;
  /** The page title or the change made; "" shows a generic name in the interface language. */
  label: string;
  origin: VersionOrigin;
  createdAt: number;
  /** For an edit: the version it was made from, and the change request that made it. */
  parentId?: string;
  request?: string;
}

export interface VersionsState {
  /** Oldest first. */
  versions: Version[];
  currentId: string | null;
}

export type VersionsAction = { type: 'add'; version: Version } | { type: 'select'; id: string } | { type: 'reset' };

export const EMPTY_VERSIONS: VersionsState = { versions: [], currentId: null };

export function versionsReducer(state: VersionsState, action: VersionsAction): VersionsState {
  switch (action.type) {
    case 'add':
      return { versions: [...state.versions, action.version], currentId: action.version.id };
    case 'select':
      if (action.id === state.currentId || !state.versions.some((v) => v.id === action.id)) return state;
      return { ...state, currentId: action.id };
    case 'reset':
      return EMPTY_VERSIONS;
  }
}

export function currentVersion(state: VersionsState): Version | null {
  return state.versions.find((v) => v.id === state.currentId) ?? null;
}

/**
 * The change requests that turned the generated page into this version, oldest first (the
 * last max of them). After going back to an old version, undone changes are not among them.
 */
export function requestsLeadingTo(versions: readonly Version[], id: string, max: number): string[] {
  const byId = new Map(versions.map((v) => [v.id, v]));
  const requests: string[] = [];
  // The length bound also stops a loop in damaged stored data.
  for (let v = byId.get(id); v?.request !== undefined && requests.length < max; v = byId.get(v.parentId ?? '')) {
    requests.unshift(v.request);
  }
  return requests;
}

const MAX_LABEL_CHARS = 120;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** One line of reasonable length for the versions list. */
export function versionLabel(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > MAX_LABEL_CHARS ? `${line.slice(0, MAX_LABEL_CHARS - 1)}…` : line;
}

/** The page's <title> as plain text, or "". */
export function pageTitle(html: string): string {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const decoded = title.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? entity;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
  return versionLabel(decoded);
}
