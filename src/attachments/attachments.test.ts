import { describe, expect, it } from 'vitest';
import type { ModelAttachment } from '../../shared/attachments.ts';
import { composeSource, fileKind, hasTransparentPixel, imagesOf, scaledSize } from './files.ts';
import { createImageStore } from './image-store.ts';

describe('fileKind', () => {
  it('recognises the files the app reads, by name or by type', () => {
    expect(fileKind('notas.md', '')).toBe('text');
    expect(fileKind('README.markdown', '')).toBe('text');
    expect(fileKind('lista.TXT', 'text/plain')).toBe('text');
    expect(fileKind('Guía.docx', '')).toBe('docx');
    expect(fileKind('x', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(fileKind('manual.pdf', 'application/pdf')).toBe('pdf');
    expect(fileKind('foto.JPG', 'image/jpeg')).toBe('image');
    expect(fileKind('image.png', 'image/png')).toBe('image');
    // Other images the browser decodes are converted before sending.
    expect(fileKind('escaneo.bmp', 'image/bmp')).toBe('image');
  });

  it('points old Word files out and refuses the rest', () => {
    expect(fileKind('viejo.doc', 'application/msword')).toBe('old-word');
    expect(fileKind('logo.svg', 'image/svg+xml')).toBeNull();
    expect(fileKind('hoja.xlsx', '')).toBeNull();
    expect(fileKind('programa.exe', 'application/octet-stream')).toBeNull();
  });
});

describe('composeSource', () => {
  const docs = [
    { name: 'menu.md', text: '# Menú\n\n- Café\n' },
    { name: 'horario.docx', text: 'Abierto de 8 a 14' },
  ];

  it('leaves the text alone without files', () => {
    expect(composeSource('  Mi idea  ', [])).toBe('  Mi idea  ');
  });

  it('adds each file under a line with its name', () => {
    expect(composeSource('Una web para el bar', docs)).toBe(
      'Una web para el bar\n\n=== menu.md ===\n# Menú\n\n- Café\n\n=== horario.docx ===\nAbierto de 8 a 14',
    );
  });

  it('works with only files', () => {
    expect(composeSource('  ', docs.slice(1))).toBe('=== horario.docx ===\nAbierto de 8 a 14');
  });
});

describe('images', () => {
  it('lists only the images, in attachment order', () => {
    const files: ModelAttachment[] = [
      { kind: 'image', mediaType: 'image/png', data: 'AAAA', name: 'logo.png' },
      { kind: 'pdf', mediaType: 'application/pdf', data: 'JVBE', name: 'carta.pdf' },
      { kind: 'image', mediaType: 'image/jpeg', data: 'BBBB', name: 'local.jpg' },
    ];
    expect(imagesOf(files)).toEqual([
      { name: 'logo.png', mediaType: 'image/png', data: 'AAAA' },
      { name: 'local.jpg', mediaType: 'image/jpeg', data: 'BBBB' },
    ]);
  });

  it('scales the longest side down to 1600 px and never up', () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(1000, 5000)).toEqual({ width: 320, height: 1600 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('spots transparency', () => {
    expect(hasTransparentPixel([0, 0, 0, 255, 9, 9, 9, 255])).toBe(false);
    expect(hasTransparentPixel([0, 0, 0, 255, 9, 9, 9, 0])).toBe(true);
  });
});

describe('createImageStore', () => {
  const image = { name: 'logo.png', mediaType: 'image/png', data: 'AAAA' };

  it('keeps the images for this visit without IndexedDB', async () => {
    const store = createImageStore(undefined);
    expect(await store.load()).toEqual([]);
    await store.save([image]);
    expect(await store.load()).toEqual([image]);
    await store.save([]);
    expect(await store.load()).toEqual([]);
  });

  it('falls back to memory when IndexedDB refuses to open', async () => {
    const broken = {
      open() {
        throw new DOMException('blocked', 'SecurityError');
      },
    } as unknown as IDBFactory;
    const store = createImageStore(broken);
    await store.save([image]);
    expect(await store.load()).toEqual([image]);
  });
});
