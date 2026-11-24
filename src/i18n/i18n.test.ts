import { describe, expect, it } from 'vitest';
import { detectLanguage, loadLanguage, saveLanguage } from './language.ts';
import { URL_SOURCE_ERROR_CODES } from '../../shared/source.ts';
import { errorKey, format, messages } from './messages.ts';

describe('format', () => {
  it('fills {placeholders} and leaves unknown ones visible', () => {
    expect(format('{n} models in {dir}', { n: 3, dir: 'C:\\x' })).toBe('3 models in C:\\x');
    expect(format('Hello {name}', {})).toBe('Hello {name}');
  });
});

describe('errorKey', () => {
  it('maps known API error codes to their message', () => {
    expect(errorKey('invalid_key')).toBe('error.invalid_key');
    expect(errorKey('server_unreachable')).toBe('error.server_unreachable');
    expect(errorKey('edit_failed')).toBe('error.edit_failed');
    expect(errorKey({ code: 'page_too_long' })).toBe('error.page_too_long');
  });

  it('has a message for every link-reader error', () => {
    for (const code of URL_SOURCE_ERROR_CODES) expect(errorKey(code)).toBe(`error.${code}`);
  });

  it('falls back to a generic message', () => {
    expect(errorKey('something_new')).toBe('error.generic');
    expect(errorKey(new Error('x'))).toBe('error.generic');
  });
});

describe('messages', () => {
  it('has the same keys in Spanish and English', () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.es).sort());
  });

  it('has no empty texts', () => {
    for (const lang of ['es', 'en'] as const) {
      for (const [key, text] of Object.entries(messages[lang])) {
        expect(text.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });
});

describe('detectLanguage', () => {
  it('picks the first supported language from the browser list', () => {
    expect(detectLanguage(['es-ES', 'en'])).toBe('es');
    expect(detectLanguage(['en-US'])).toBe('en');
    expect(detectLanguage(['fr-FR', 'es'])).toBe('es');
  });

  it('falls back to English', () => {
    expect(detectLanguage(['fr-FR', 'de'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
});

describe('loadLanguage / saveLanguage', () => {
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

  it('round-trips a saved language', () => {
    const storage = memoryStorage();
    saveLanguage('es', storage);
    expect(loadLanguage(storage)).toBe('es');
  });

  it('ignores unknown stored values', () => {
    const storage = memoryStorage();
    storage.setItem('html-creator.lang', 'xx');
    expect(loadLanguage(storage)).toBeNull();
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
    expect(loadLanguage(broken)).toBeNull();
    expect(() => saveLanguage('en', broken)).not.toThrow();
  });
});
