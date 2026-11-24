import { describe, expect, it } from 'vitest';
import {
  base64Length,
  base64Size,
  isBase64,
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  numberedImages,
  parseAttachments,
} from './attachments.ts';

const PDF = { kind: 'pdf', mediaType: 'application/pdf', data: 'JVBERi0xLjQK', name: 'guía.pdf' };
const PNG = { kind: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=', name: 'logo.png' };

/** Base64 of at most `bytes` bytes (whole groups of three), without building the bytes. */
function base64Of(bytes: number): string {
  return 'A'.repeat(Math.floor(bytes / 3) * 4);
}

describe('base64 helpers', () => {
  it('knows the decoded size without decoding', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'hola, ¿qué tal?']) {
      const data = Buffer.from(text).toString('base64');
      expect(base64Size(data), text).toBe(Buffer.byteLength(text));
      expect(base64Length(Buffer.byteLength(text))).toBe(data.length);
    }
  });

  it('accepts only well-formed base64', () => {
    expect(isBase64('aGVsbG8=')).toBe(true);
    expect(isBase64('aGVsbG8')).toBe(false);
    expect(isBase64('aGVs bG8=')).toBe(false);
    expect(isBase64('data:image/png;base64,aGVsbG8=')).toBe(false);
    expect(isBase64('')).toBe(false);
  });
});

describe('parseAttachments', () => {
  it('treats a missing field as no attachments', () => {
    expect(parseAttachments(undefined)).toEqual({ ok: true, attachments: [] });
    expect(parseAttachments(null)).toEqual({ ok: true, attachments: [] });
  });

  it('keeps valid PDFs and images in order', () => {
    expect(parseAttachments([PNG, PDF])).toEqual({ ok: true, attachments: [PNG, PDF] });
  });

  it('rejects anything that is not a list of objects with base64 data', () => {
    expect(parseAttachments('x')).toEqual({ ok: false, error: 'bad_request' });
    expect(parseAttachments(['x'])).toEqual({ ok: false, error: 'bad_request' });
    expect(parseAttachments([{ ...PNG, data: 'not base64!' }])).toEqual({ ok: false, error: 'bad_request' });
    expect(parseAttachments([{ ...PNG, data: 42 }])).toEqual({ ok: false, error: 'bad_request' });
  });

  it('only allows PDFs and the image types both providers read', () => {
    for (const mediaType of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(parseAttachments([{ ...PNG, mediaType }]).ok, mediaType).toBe(true);
    }
    for (const bad of [
      { ...PNG, mediaType: 'image/svg+xml' },
      { ...PNG, mediaType: 'text/html' },
      { ...PNG, mediaType: 'application/pdf' },
      { ...PDF, mediaType: 'image/png' },
      { ...PDF, kind: 'docx' },
    ]) {
      expect(parseAttachments([bad]), JSON.stringify(bad)).toEqual({ ok: false, error: 'unsupported_attachment' });
    }
  });

  it('limits the number of files', () => {
    expect(parseAttachments(Array(MAX_ATTACHMENTS).fill(PNG)).ok).toBe(true);
    expect(parseAttachments(Array(MAX_ATTACHMENTS + 1).fill(PNG))).toEqual({ ok: false, error: 'too_many_attachments' });
  });

  it('limits each file by kind and all of them together', () => {
    expect(parseAttachments([{ ...PNG, data: base64Of(MAX_IMAGE_BYTES) }]).ok).toBe(true);
    expect(parseAttachments([{ ...PNG, data: base64Of(MAX_IMAGE_BYTES + 3) }])).toEqual({
      ok: false,
      error: 'attachment_too_large',
    });
    expect(parseAttachments([{ ...PDF, data: base64Of(MAX_PDF_BYTES) }]).ok).toBe(true);
    expect(parseAttachments([{ ...PDF, data: base64Of(MAX_PDF_BYTES + 3) }])).toEqual({
      ok: false,
      error: 'attachment_too_large',
    });
    // A full PDF plus an image that fills the rest of the total; a few bytes more are over it.
    const full = [
      { ...PDF, data: base64Of(MAX_PDF_BYTES) },
      { ...PNG, data: base64Of(MAX_TOTAL_ATTACHMENT_BYTES - MAX_PDF_BYTES) },
    ];
    expect(parseAttachments(full).ok).toBe(true);
    // Claude refuses requests over 32 MB: the base64 of a full request must stay well under it.
    expect(base64Length(MAX_TOTAL_ATTACHMENT_BYTES)).toBeLessThan(29 * 1024 * 1024);
    expect(parseAttachments([...full, { ...PNG, data: 'AAAAAAAA' }])).toEqual({ ok: false, error: 'attachments_too_large' });
  });

  it('cleans the names that go into the prompt', () => {
    const parsed = parseAttachments([{ ...PNG, name: 'a\n<b>.png' }, { ...PNG, name: '' }, { ...PNG, name: 'x'.repeat(500) }]);
    if (!parsed.ok) throw new Error('expected ok');
    expect(parsed.attachments.map((a) => a.name)).toEqual(['a  b .png', 'file', 'x'.repeat(120)]);
  });
});

describe('numberedImages', () => {
  it('numbers only the images, from 1, in attachment order', () => {
    const second = { ...PNG, name: 'b.png' };
    expect(numberedImages([PDF, PNG, PDF, second])).toEqual([
      { n: 1, image: PNG },
      { n: 2, image: second },
    ]);
  });
});
