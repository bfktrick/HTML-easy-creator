// Files the person attaches. PDFs and images go to the model as they are (the wire format of
// /api/questions and /api/generate); Markdown, text and Word files are turned into text in
// the browser first and travel inside the source.

import type { ApiErrorCode } from './settings.ts';

export const PDF_MEDIA_TYPE = 'application/pdf';
/** What both Claude and OpenAI accept as image input. */
export const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

interface AttachmentBase {
  /** Base64, without a data: prefix. */
  data: string;
  /** The file name, so the model can tell the files apart. */
  name: string;
}

export type ModelAttachment =
  | (AttachmentBase & { kind: 'pdf'; mediaType: typeof PDF_MEDIA_TYPE })
  | (AttachmentBase & { kind: 'image'; mediaType: ImageMediaType });

export type AttachmentKind = ModelAttachment['kind'];

const MB = 1024 * 1024;
export const MAX_ATTACHMENTS = 10;
export const MAX_IMAGE_BYTES = 10 * MB;
export const MAX_PDF_BYTES = 20 * MB;
export const MAX_DOCX_BYTES = 10 * MB;
/** Markdown and text files: anything longer would not fit in the source anyway. */
export const MAX_TEXT_FILE_BYTES = 10 * MB;
/**
 * All the PDFs and images of one request together, decoded. Claude refuses requests over
 * 32 MB: 21 MB is 28 MB in base64, which leaves room for the longest source and the prompt.
 */
export const MAX_TOTAL_ATTACHMENT_BYTES = 21 * MB;
const MAX_NAME_CHARS = 120;

/** Base64 length of n bytes. The servers' body limits are sized with it. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/** Decoded size of base64 data, without decoding it. */
export function base64Size(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function isBase64(data: string): boolean {
  return data.length % 4 === 0 && BASE64.test(data);
}

export function isImageMediaType(value: unknown): value is ImageMediaType {
  return typeof value === 'string' && (IMAGE_MEDIA_TYPES as readonly string[]).includes(value);
}

export function dataUrl(file: { mediaType: string; data: string }): string {
  return `data:${file.mediaType};base64,${file.data}`;
}

/** The name goes into the prompt: one short line, with nothing that looks like markup. */
function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim() : '';
  return name.slice(0, MAX_NAME_CHARS) || 'file';
}

export type AttachmentsParse = { ok: true; attachments: ModelAttachment[] } | { ok: false; error: ApiErrorCode };

/** Validates the attachments of a request body; a missing field means none. */
export function parseAttachments(raw: unknown): AttachmentsParse {
  if (raw === undefined || raw === null) return { ok: true, attachments: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'bad_request' };
  if (raw.length > MAX_ATTACHMENTS) return { ok: false, error: 'too_many_attachments' };

  const attachments: ModelAttachment[] = [];
  let total = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) return { ok: false, error: 'bad_request' };
    const { kind, mediaType, data, name } = item as Record<string, unknown>;
    if (typeof data !== 'string' || !isBase64(data)) return { ok: false, error: 'bad_request' };
    const size = base64Size(data);
    total += size;

    if (kind === 'pdf' && mediaType === PDF_MEDIA_TYPE) {
      if (size > MAX_PDF_BYTES) return { ok: false, error: 'attachment_too_large' };
      attachments.push({ kind, mediaType, data, name: cleanName(name) });
    } else if (kind === 'image' && isImageMediaType(mediaType)) {
      if (size > MAX_IMAGE_BYTES) return { ok: false, error: 'attachment_too_large' };
      attachments.push({ kind, mediaType, data, name: cleanName(name) });
    } else {
      return { ok: false, error: 'unsupported_attachment' };
    }
  }
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) return { ok: false, error: 'attachments_too_large' };
  return { ok: true, attachments };
}

/**
 * The images, numbered from 1 in the order they were attached. The prompt, the model's
 * content and the page's src="attachment:N" all use this numbering.
 */
export function numberedImages<T extends { kind: string }>(attachments: readonly T[]): { n: number; image: T }[] {
  return attachments.filter((a) => a.kind === 'image').map((image, index) => ({ n: index + 1, image }));
}

/** Body of POST /api/source/docx. */
export interface DocxRequestBody {
  name: string;
  /** The .docx file, base64. */
  data: string;
}

export interface DocxResponse {
  /** Markdown-like text: headings, lists and tables survive, images do not. */
  text: string;
}
