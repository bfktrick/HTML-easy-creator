import { describe, expect, it } from 'vitest';
import { loadKindChoice, saveKindChoice } from './kind-choice.ts';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('loadKindChoice / saveKindChoice', () => {
  it('starts on "auto" when nothing was saved', () => {
    expect(loadKindChoice(memoryStorage())).toBe('auto');
    expect(loadKindChoice(undefined)).toBe('auto');
  });

  it('round-trips the chosen kind', () => {
    const storage = memoryStorage();
    saveKindChoice('slides', storage);
    expect(loadKindChoice(storage)).toBe('slides');
    saveKindChoice('auto', storage);
    expect(loadKindChoice(storage)).toBe('auto');
  });

  it('ignores an unknown stored value', () => {
    const storage = memoryStorage();
    storage.setItem('html-creator.kind', 'poster');
    expect(loadKindChoice(storage)).toBe('auto');
  });

  it('survives a storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(loadKindChoice(broken)).toBe('auto');
    expect(() => saveKindChoice('app', broken)).not.toThrow();
  });
});
