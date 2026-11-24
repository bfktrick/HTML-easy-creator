import { describe, expect, it } from 'vitest';
import { loadVersions, saveVersions } from './storage.ts';
import {
  currentVersion,
  EMPTY_VERSIONS,
  pageTitle,
  requestsLeadingTo,
  versionLabel,
  versionsReducer,
  type Version,
  type VersionsState,
} from './versions.ts';

function version(id: string, html = `<p>${id}</p>`): Version {
  return { id, html, label: id, origin: id === 'v1' ? 'generated' : 'edited', createdAt: 1_700_000_000_000 };
}

function withVersions(...ids: string[]): VersionsState {
  return ids.reduce((state, id) => versionsReducer(state, { type: 'add', version: version(id) }), EMPTY_VERSIONS);
}

describe('versionsReducer', () => {
  it('appends a version and makes it current', () => {
    const state = withVersions('v1', 'v2');
    expect(state.versions.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(state.currentId).toBe('v2');
    expect(currentVersion(state)?.html).toBe('<p>v2</p>');
  });

  it('selects an old version without deleting anything, and appends the next one at the end', () => {
    const selected = versionsReducer(withVersions('v1', 'v2', 'v3'), { type: 'select', id: 'v1' });
    expect(selected.currentId).toBe('v1');
    expect(selected.versions).toHaveLength(3);

    const next = versionsReducer(selected, { type: 'add', version: version('v4') });
    expect(next.versions.map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
    expect(next.currentId).toBe('v4');
  });

  it('ignores unknown ids and keeps the same state when nothing changes', () => {
    const state = withVersions('v1', 'v2');
    expect(versionsReducer(state, { type: 'select', id: 'nope' })).toBe(state);
    expect(versionsReducer(state, { type: 'select', id: 'v2' })).toBe(state);
  });

  it('starts over with reset', () => {
    expect(versionsReducer(withVersions('v1'), { type: 'reset' })).toEqual(EMPTY_VERSIONS);
    expect(currentVersion(EMPTY_VERSIONS)).toBeNull();
  });
});

describe('requestsLeadingTo', () => {
  const generated = version('v1');
  const edited = (id: string, parentId: string): Version => ({ ...version(id), parentId, request: `req ${id}` });

  it('follows the edits back to the generated page, oldest first', () => {
    const list = [generated, edited('v2', 'v1'), edited('v3', 'v2'), edited('v4', 'v3')];
    expect(requestsLeadingTo(list, 'v4', 5)).toEqual(['req v2', 'req v3', 'req v4']);
    expect(requestsLeadingTo(list, 'v4', 2)).toEqual(['req v3', 'req v4']);
    expect(requestsLeadingTo(list, 'v1', 5)).toEqual([]);
  });

  it('leaves out changes that were undone', () => {
    // v3 was made from v2, then the person went back to v2 and asked for v4 from it.
    const list = [generated, edited('v2', 'v1'), edited('v3', 'v2'), edited('v4', 'v2')];
    expect(requestsLeadingTo(list, 'v4', 5)).toEqual(['req v2', 'req v4']);
  });

  it('stops at a missing parent and at a loop in damaged data', () => {
    expect(requestsLeadingTo([edited('v3', 'gone')], 'v3', 5)).toEqual(['req v3']);
    const loop = [edited('a', 'b'), edited('b', 'a')];
    expect(requestsLeadingTo(loop, 'a', 5)).toHaveLength(5);
  });
});

describe('pageTitle / versionLabel', () => {
  it('reads the title as plain text', () => {
    expect(pageTitle('<head><title>\n  Guía &amp; montaje &#8212; taller &#x41;\n</title></head>')).toBe(
      'Guía & montaje — taller A',
    );
    expect(pageTitle('<p>sin título</p>')).toBe('');
    expect(pageTitle('<title>&unknown; &#0;</title>')).toBe('&unknown; &#0;');
  });

  it('keeps labels on one short line', () => {
    expect(versionLabel('  Pon el\n título   más grande ')).toBe('Pon el título más grande');
    const long = versionLabel('a'.repeat(300));
    expect(long).toHaveLength(120);
    expect(long.endsWith('…')).toBe(true);
  });
});

/** In-memory Storage that refuses to hold more than limit characters, like a full localStorage. */
function memoryStorage(limit = Infinity) {
  const data = new Map<string, string>();
  let writes = 0;
  const storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => {
      writes++;
      if (v.length > limit) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, v);
    },
  } as Storage;
  return { storage, data, writes: () => writes };
}

describe('loadVersions / saveVersions', () => {
  it('round-trips the versions and the current one', () => {
    const { storage } = memoryStorage();
    const state = versionsReducer(withVersions('v1', 'v2', 'v3'), { type: 'select', id: 'v2' });
    expect(saveVersions(state, storage)).toBe(3);
    expect(loadVersions(storage)).toEqual(state);
  });

  it('drops the oldest versions, never the current one, when storage is full', () => {
    const { storage } = memoryStorage();
    const big = (id: string) => version(id, 'x'.repeat(1000));
    let state = EMPTY_VERSIONS;
    for (const id of ['v1', 'v2', 'v3', 'v4']) state = versionsReducer(state, { type: 'add', version: big(id) });
    state = versionsReducer(state, { type: 'select', id: 'v1' });

    const full = memoryStorage(2_600);
    expect(saveVersions(state, full.storage)).toBe(2);
    const saved = loadVersions(full.storage);
    expect(saved.versions.map((v) => v.id)).toEqual(['v1', 'v4']);
    expect(saved.currentId).toBe('v1');
    expect(saveVersions(state, storage)).toBe(4);
  });

  it('gives up quietly when not even the current version fits', () => {
    const { storage, writes } = memoryStorage(10);
    expect(saveVersions(withVersions('v1', 'v2'), storage)).toBe(0);
    expect(writes()).toBe(2);
  });

  it('clears storage when there are no versions', () => {
    const { storage, data } = memoryStorage();
    saveVersions(withVersions('v1'), storage);
    expect(data.size).toBe(1);
    saveVersions(EMPTY_VERSIONS, storage);
    expect(data.size).toBe(0);
  });

  it('ignores damaged data and repairs a missing current id', () => {
    const { storage } = memoryStorage();
    storage.setItem('html-creator.versions', '{not json');
    expect(loadVersions(storage)).toEqual(EMPTY_VERSIONS);

    storage.setItem(
      'html-creator.versions',
      JSON.stringify({
        currentId: 'gone',
        versions: [version('v1'), { id: 'bad' }, { ...version('v9'), parentId: 5 }, version('v2'), null],
      }),
    );
    const loaded = loadVersions(storage);
    expect(loaded.versions.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(loaded.currentId).toBe('v2');
  });

  it('survives a storage that throws or is missing', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadVersions(broken)).toEqual(EMPTY_VERSIONS);
    expect(saveVersions(withVersions('v1'), broken)).toBe(0);
    expect(saveVersions(EMPTY_VERSIONS, broken)).toBe(0);
    expect(loadVersions(undefined)).toEqual(EMPTY_VERSIONS);
    expect(saveVersions(withVersions('v1'), undefined)).toBe(0);
  });
});
