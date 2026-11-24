// Which files the composer takes and how each one travels: Markdown, text and Word files
// become part of the source; PDFs and images go to the model as files.

import {
  MAX_DOCX_BYTES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_TEXT_FILE_BYTES,
  numberedImages,
  type ModelAttachment,
} from '../../shared/attachments.ts';
import type { InlineImage } from '../../shared/inline-attachments.ts';

export type FileKind = 'text' | 'docx' | 'pdf' | 'image';

/** A file as the chat shows it, in the composer and in the sent message. */
export interface AttachmentChip {
  name: string;
  kind: FileKind;
}

export const MAX_BYTES: Record<FileKind, number> = {
  text: MAX_TEXT_FILE_BYTES,
  docx: MAX_DOCX_BYTES,
  pdf: MAX_PDF_BYTES,
  image: MAX_IMAGE_BYTES,
};

/** For the file picker. Other images the browser can decode are taken too when dropped. */
export const ACCEPTED_FILES =
  '.md,.markdown,.txt,.docx,.pdf,text/plain,text/markdown,application/pdf,image/png,image/jpeg,image/webp,image/gif';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The kind of a file, "old-word" for a .doc, or null for one the app cannot read. */
export function fileKind(name: string, type: string): FileKind | 'old-word' | null {
  const lower = name.toLowerCase();
  if (/\.(md|markdown|txt)$/.test(lower) || type === 'text/plain' || type === 'text/markdown') return 'text';
  if (lower.endsWith('.docx') || type === DOCX_TYPE) return 'docx';
  if (lower.endsWith('.doc') || type === 'application/msword') return 'old-word';
  if (lower.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  // Neither provider reads SVG, and it is a document that can carry scripts, not a picture.
  if (type === 'image/svg+xml' || lower.endsWith('.svg')) return null;
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(lower)) return 'image';
  return null;
}

/** The typed text followed by each text or Word file, under a line with its name. */
export function composeSource(text: string, documents: readonly { name: string; text: string }[]): string {
  if (documents.length === 0) return text;
  const parts = text.trim() === '' ? [] : [text.trim()];
  for (const document of documents) parts.push(`=== ${document.name} ===\n${document.text.trim()}`);
  return parts.join('\n\n');
}

/** The images among the attachments, in the order attachment:N counts them. */
export function imagesOf(attachments: readonly ModelAttachment[]): (InlineImage & { name: string })[] {
  return numberedImages(attachments).map(({ image }) => ({ name: image.name, mediaType: image.mediaType, data: image.data }));
}

export const MAX_IMAGE_SIDE = 1600;

/** The size that fits within max on its longest side, never larger than the original. */
export function scaledSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Whether any pixel of RGBA data is not fully opaque. */
export function hasTransparentPixel(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}
