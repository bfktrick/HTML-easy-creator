import { describe, expect, it } from 'vitest';
import { extractHtml } from './extract-html.ts';

const DOC = '<!doctype html>\n<html lang="es"><head><title>T</title></head><body><p>Hola</p></body></html>';

describe('extractHtml', () => {
  it('returns a clean document unchanged', () => {
    expect(extractHtml(DOC)).toBe(DOC);
  });

  it('drops any text before the doctype and after </html>', () => {
    expect(extractHtml(`Aquí tienes la página:\n\n${DOC}\n\nEspero que te guste.`)).toBe(DOC);
  });

  it('strips markdown code fences', () => {
    expect(extractHtml('```html\n' + DOC + '\n```')).toBe(DOC);
  });

  it('starts at <html> when there is no doctype', () => {
    const doc = '<html><body>x</body></html>';
    expect(extractHtml(`intro ${doc}`)).toBe(doc);
  });

  it('is case-insensitive', () => {
    const doc = '<!DOCTYPE HTML><HTML><BODY>x</BODY></HTML>';
    expect(extractHtml(doc)).toBe(doc);
  });

  it('keeps a partial document while it is still streaming', () => {
    expect(extractHtml('```html\n<!doctype html>\n<html><head><style>body{')).toBe(
      '<!doctype html>\n<html><head><style>body{',
    );
  });

  it('returns an empty string until the document starts', () => {
    expect(extractHtml('')).toBe('');
    expect(extractHtml('```ht')).toBe('');
    expect(extractHtml('Aquí tienes')).toBe('');
  });

  it('keeps the last </html>, not one inside a script string', () => {
    const doc = '<!doctype html><html><body><script>const s = "</html>";</script></body></html>';
    expect(extractHtml(doc + '\nfin')).toBe(doc);
  });
});
