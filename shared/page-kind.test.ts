import { describe, expect, it } from 'vitest';
import { isKindChoice, isPageKind, KIND_CHOICES, pageKindOf, parseKindChoice } from './page-kind.ts';

describe('parseKindChoice', () => {
  it('accepts every kind and "auto"', () => {
    for (const kind of KIND_CHOICES) expect(parseKindChoice(kind)).toBe(kind);
  });

  it('defaults to "auto" when the field is missing', () => {
    expect(parseKindChoice(undefined)).toBe('auto');
  });

  it('rejects anything else as malformed', () => {
    for (const raw of ['', 'Slides', 'presentation', null, 3, ['slides'], { kind: 'app' }]) {
      expect(parseKindChoice(raw)).toBeNull();
    }
  });
});

describe('isPageKind / isKindChoice', () => {
  it('tells a declared kind from the "auto" choice', () => {
    expect(isPageKind('slides')).toBe(true);
    expect(isPageKind('auto')).toBe(false);
    expect(isKindChoice('auto')).toBe(true);
    expect(isKindChoice('toString')).toBe(false);
  });
});

describe('pageKindOf', () => {
  it('reads data-kind from the <html> element', () => {
    expect(pageKindOf('<!doctype html><html lang="es" data-kind="slides"><head></head></html>')).toBe('slides');
    expect(pageKindOf("<!DOCTYPE html>\n<HTML DATA-KIND='Landing' lang=en>")).toBe('landing');
    expect(pageKindOf('<html data-kind=app>')).toBe('app');
    expect(pageKindOf('<html\n  lang="en"\n  data-kind = "document"\n>')).toBe('document');
  });

  it('copes with a ">" inside another quoted attribute', () => {
    expect(pageKindOf('<html data-note="a > b" data-kind="slides">')).toBe('slides');
  });

  it('gives null without a known kind', () => {
    expect(pageKindOf('<!doctype html><html lang="es"><body>data-kind="slides"</body></html>')).toBeNull();
    expect(pageKindOf('<html data-kind="poster">')).toBeNull();
    expect(pageKindOf('<html data-kinds="slides">')).toBeNull();
    expect(pageKindOf('<p>no document yet</p>')).toBeNull();
    expect(pageKindOf('')).toBeNull();
  });

  it('only looks at the root element, not at text or other tags', () => {
    expect(pageKindOf('<html lang="es"><body><div data-kind="slides"></div></body></html>')).toBeNull();
    expect(pageKindOf('<htmlx data-kind="slides"><html data-kind="app">')).toBe('app');
  });

  it('skips a commented-out <html>', () => {
    expect(pageKindOf('<!-- <html data-kind="slides"> --><html data-kind="landing">')).toBe('landing');
  });
});
