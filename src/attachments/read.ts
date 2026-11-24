// Reads an attached file in the browser into what the request needs. Images are made
// smaller first: the models see little more than 1600 px, and the page carries the image.

import { isImageMediaType, PDF_MEDIA_TYPE, type ImageMediaType, type ModelAttachment } from '../../shared/attachments.ts';
import { api } from '../api.ts';
import { hasTransparentPixel, scaledSize, type FileKind } from './files.ts';

// Below this an image that already fits is sent as it is: no loss, and a GIF keeps moving.
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;
// Every PDF starts with "%PDF", which is "JVBER" in base64.
const PDF_SIGNATURE = 'JVBER';

/** The file had nothing to read: an empty text, or a Word file with no text in it. */
export class EmptyFileError extends Error {
  constructor() {
    super('empty file');
    this.name = 'EmptyFileError';
  }
}

export class UnreadableFileError extends Error {
  constructor() {
    super('unreadable file');
    this.name = 'UnreadableFileError';
  }
}

export function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new UnreadableFileError());
    reader.readAsDataURL(blob);
  });
}

async function prepareImage(file: File): Promise<{ mediaType: ImageMediaType; data: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnreadableFileError();
  }
  try {
    const { width, height } = scaledSize(bitmap.width, bitmap.height);
    if (width === bitmap.width && height === bitmap.height && isImageMediaType(file.type) && file.size <= KEEP_ORIGINAL_BYTES) {
      return { mediaType: file.type, data: await fileToBase64(file) };
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new UnreadableFileError();
    context.drawImage(bitmap, 0, 0, width, height);
    // A logo with a transparent background stays PNG; anything else is smaller as JPEG.
    const transparent = file.type !== 'image/jpeg' && hasTransparentPixel(context.getImageData(0, 0, width, height).data);
    const mediaType = transparent ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mediaType, JPEG_QUALITY));
    if (!blob) throw new UnreadableFileError();
    return { mediaType, data: await fileToBase64(blob) };
  } finally {
    bitmap.close();
  }
}

export type ReadResult = { text: string } | { attachment: ModelAttachment };

/** Throws EmptyFileError, UnreadableFileError or, for Word files, ApiError. */
export async function readAttachment(file: File, kind: FileKind): Promise<ReadResult> {
  switch (kind) {
    case 'text':
    case 'docx': {
      const text = kind === 'text' ? await file.text() : (await api.docx(file.name, await fileToBase64(file))).text;
      if (text.trim() === '') throw new EmptyFileError();
      return { text };
    }
    case 'pdf': {
      const data = await fileToBase64(file);
      if (!data.startsWith(PDF_SIGNATURE)) throw new UnreadableFileError();
      return { attachment: { kind: 'pdf', mediaType: PDF_MEDIA_TYPE, data, name: file.name } };
    }
    case 'image':
      return { attachment: { kind: 'image', name: file.name, ...(await prepareImage(file)) } };
  }
}
