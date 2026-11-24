// The images of the page being made, kept apart from its versions: localStorage holds a few
// MB and would fill up with one copy of every image per version. The versions keep only
// "attachment:N"; the images are stored once, in IndexedDB. Where it is blocked (private
// windows, site data off) they last for this visit only.

import { isBase64, isImageMediaType } from '../../shared/attachments.ts';

export interface StoredImage {
  name: string;
  mediaType: string;
  data: string;
}

export interface ImageStore {
  load(): Promise<StoredImage[]>;
  save(images: readonly StoredImage[]): Promise<void>;
}

const DB_NAME = 'html-creator';
const STORE = 'images';
const KEY = 'current';

// The data ends up inside the page's attributes: only an image type and plain base64 get there.
function isStoredImage(value: unknown): value is StoredImage {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.name === 'string' && isImageMediaType(v.mediaType) && typeof v.data === 'string' && isBase64(v.data);
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createImageStore(indexedDb: IDBFactory | undefined): ImageStore {
  let memory: StoredImage[] = [];
  let opening: Promise<IDBDatabase | null> | null = null;

  /** The database, or null when it cannot be used. */
  function open(): Promise<IDBDatabase | null> {
    opening ??= new Promise((resolve) => {
      try {
        if (!indexedDb) return resolve(null);
        const request = indexedDb.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return opening;
  }

  return {
    async load() {
      const db = await open();
      if (!db) return memory;
      try {
        const value: unknown = await done(db.transaction(STORE).objectStore(STORE).get(KEY));
        return Array.isArray(value) && value.every(isStoredImage) ? value : [];
      } catch {
        return memory;
      }
    },

    async save(images) {
      memory = [...images];
      const db = await open();
      if (!db) return;
      try {
        const transaction = db.transaction(STORE, 'readwrite');
        const store = transaction.objectStore(STORE);
        if (memory.length === 0) store.delete(KEY);
        else store.put(memory, KEY);
        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } catch {
        // Full or blocked: the copy in memory still serves this visit.
      }
    },
  };
}
