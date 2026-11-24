import { describe, expect, it } from 'vitest';
import { parseUrlMessage } from './url-input.ts';

describe('parseUrlMessage', () => {
  it('reads a message that is just a link', () => {
    expect(parseUrlMessage('https://example.com/guia')).toEqual({ url: 'https://example.com/guia', rest: '' });
    expect(parseUrlMessage('  http://example.com  ')).toEqual({ url: 'http://example.com/', rest: '' });
    expect(parseUrlMessage('www.example.com/a')).toEqual({ url: 'https://www.example.com/a', rest: '' });
    expect(parseUrlMessage('<https://example.com/x>')).toEqual({ url: 'https://example.com/x', rest: '' });
  });

  it('keeps what comes after the link as instructions', () => {
    expect(parseUrlMessage('https://example.com/receta hazla en tono informal')).toEqual({
      url: 'https://example.com/receta',
      rest: 'hazla en tono informal',
    });
    expect(parseUrlMessage('https://example.com, como una landing')?.rest).toBe('como una landing');
    expect(parseUrlMessage('https://example.com/a - en inglés')?.rest).toBe('en inglés');
    expect(parseUrlMessage('https://example.com/a\n\nSolo la parte de precios.')?.rest).toBe('Solo la parte de precios.');
  });

  it('drops sentence punctuation but keeps brackets the link opened', () => {
    expect(parseUrlMessage('https://example.com/a.')?.url).toBe('https://example.com/a');
    expect(parseUrlMessage('https://en.wikipedia.org/wiki/Cake_(disambiguation)')?.url).toBe(
      'https://en.wikipedia.org/wiki/Cake_(disambiguation)',
    );
    expect(parseUrlMessage('https://example.com/a).')?.url).toBe('https://example.com/a');
  });

  it('ignores messages that do not start with a link', () => {
    expect(parseUrlMessage('Mira https://example.com')).toBeNull();
    expect(parseUrlMessage('Una guía sobre huertos')).toBeNull();
    expect(parseUrlMessage('')).toBeNull();
    expect(parseUrlMessage('ftp://example.com/file')).toBeNull();
    expect(parseUrlMessage('https://')).toBeNull();
    expect(parseUrlMessage('example.com')).toBeNull();
  });
});
