import { useCallback, useEffect, useRef, useState } from 'react';
import { createImageStore, type StoredImage } from './image-store.ts';

function browserIndexedDb(): IDBFactory | undefined {
  try {
    return window.indexedDB ?? undefined;
  } catch {
    return undefined;
  }
}

/** The page's images (attachment:1 is the first), restored from the last visit. */
export function useProjectImages() {
  const [store] = useState(() => createImageStore(browserIndexedDb()));
  const [images, setImages] = useState<StoredImage[]>([]);
  // Images chosen in this visit win over the stored ones, however late the store answers.
  const replaced = useRef(false);

  useEffect(() => {
    void store.load().then((list) => {
      if (!replaced.current) setImages(list);
    });
  }, [store]);

  const replace = useCallback(
    (list: StoredImage[]) => {
      replaced.current = true;
      setImages(list);
      void store.save(list);
    },
    [store],
  );

  return { images, replace };
}
