import { useCallback, useRef, useState } from 'react';
import {
  base64Size,
  MAX_ATTACHMENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  type ModelAttachment,
} from '../../shared/attachments.ts';
import { ApiError } from '../api.ts';
import { errorKey, type MessageKey } from '../i18n/messages.ts';
import { fileKind, MAX_BYTES, type AttachmentChip, type FileKind } from './files.ts';
import { EmptyFileError, readAttachment, type ReadResult } from './read.ts';

/** A file in the composer. It is read as soon as it is added; until then it cannot be sent. */
export interface ComposerFile extends AttachmentChip {
  id: number;
  ready: boolean;
  /** Text and Word files: their text, which joins the source. */
  text?: string;
  /** PDFs and images: what goes to the model. */
  attachment?: ModelAttachment;
}

export interface ComposerError {
  key: MessageKey;
  vars?: Record<string, string | number>;
}

/** What a sent message carries besides its text. */
export interface OutgoingFiles {
  documents: { name: string; text: string }[];
  attachments: ModelAttachment[];
  chips: AttachmentChip[];
}

const MB = 1024 * 1024;
const TOO_LARGE: Record<FileKind, MessageKey> = {
  text: 'attach.error.docTooLarge',
  docx: 'attach.error.docTooLarge',
  pdf: 'attach.error.pdfTooLarge',
  image: 'attach.error.imageTooLarge',
};

function attachmentBytes(files: readonly ComposerFile[]): number {
  return files.reduce((sum, file) => sum + (file.attachment ? base64Size(file.attachment.data) : 0), 0);
}

function readError(error: unknown, name: string): ComposerError {
  if (error instanceof EmptyFileError) return { key: 'attach.error.empty', vars: { name } };
  if (error instanceof ApiError) {
    if (error.code === 'docx_unreadable') return { key: 'attach.error.unreadable', vars: { name } };
    if (error.code === 'attachment_too_large') return { key: 'attach.error.docTooLarge', vars: { name, mb: MAX_BYTES.docx / MB } };
    return { key: errorKey(error.code) };
  }
  return { key: 'attach.error.unreadable', vars: { name } };
}

/** The files attached in the composer, with the limits checked as they are added. */
export function useAttachments() {
  const [files, setFiles] = useState<ComposerFile[]>([]);
  const [error, setError] = useState<ComposerError | null>(null);
  // Reads finish out of order: the checks use the latest list, not the one of a past render.
  const filesRef = useRef<ComposerFile[]>([]);
  const nextId = useRef(1);

  const update = useCallback((change: (list: ComposerFile[]) => ComposerFile[]) => {
    filesRef.current = change(filesRef.current);
    setFiles(filesRef.current);
  }, []);

  const finish = useCallback(
    (id: number, name: string, result: ReadResult) => {
      const others = filesRef.current.filter((file) => file.id !== id);
      if (others.length === filesRef.current.length) return; // removed while it was read
      if ('attachment' in result) {
        const total = attachmentBytes(others) + base64Size(result.attachment.data);
        if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
          update(() => others);
          setError({ key: 'attach.error.total', vars: { name, mb: MAX_TOTAL_ATTACHMENT_BYTES / MB } });
          return;
        }
      }
      update((list) => list.map((file) => (file.id === id ? { ...file, ready: true, ...result } : file)));
    },
    [update],
  );

  const add = useCallback(
    (incoming: readonly File[]) => {
      setError(null);
      for (const raw of incoming) {
        const name = raw.name;
        const kind = fileKind(name, raw.type);
        if (kind === null || kind === 'old-word') {
          setError({ key: kind ? 'attach.error.oldWord' : 'attach.error.unsupported', vars: { name } });
          continue;
        }
        if (raw.size === 0) {
          setError({ key: 'attach.error.empty', vars: { name } });
          continue;
        }
        if (raw.size > MAX_BYTES[kind]) {
          setError({ key: TOO_LARGE[kind], vars: { name, mb: MAX_BYTES[kind] / MB } });
          continue;
        }
        if (filesRef.current.length >= MAX_ATTACHMENTS) {
          setError({ key: 'attach.error.tooMany', vars: { max: MAX_ATTACHMENTS } });
          break;
        }
        const id = nextId.current++;
        update((list) => [...list, { id, name, kind, ready: false }]);
        readAttachment(raw, kind).then(
          (result) => finish(id, name, result),
          (failure: unknown) => {
            if (!filesRef.current.some((file) => file.id === id)) return;
            update((list) => list.filter((file) => file.id !== id));
            setError(readError(failure, name));
          },
        );
      }
    },
    [finish, update],
  );

  const remove = useCallback((id: number) => update((list) => list.filter((file) => file.id !== id)), [update]);

  /** Empties the composer and returns its files, in the order they were added. */
  const take = useCallback((): OutgoingFiles => {
    const list = filesRef.current.filter((file) => file.ready);
    update(() => []);
    setError(null);
    return {
      documents: list.flatMap((file) => (file.text !== undefined ? [{ name: file.name, text: file.text }] : [])),
      attachments: list.flatMap((file) => (file.attachment ? [file.attachment] : [])),
      chips: list.map(({ name, kind }) => ({ name, kind })),
    };
  }, [update]);

  return {
    files,
    error,
    /** Some file is still being read. */
    pending: files.some((file) => !file.ready),
    add,
    remove,
    take,
    /** Shows a problem with a file the composer could not take at all. */
    reject: (key: MessageKey) => setError({ key }),
  };
}
