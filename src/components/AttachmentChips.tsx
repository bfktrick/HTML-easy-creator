import type { AttachmentChip, FileKind } from '../attachments/files.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { MessageKey } from '../i18n/messages.ts';

const KIND_KEYS: Record<FileKind, MessageKey> = {
  text: 'attach.kind.text',
  docx: 'attach.kind.docx',
  pdf: 'attach.kind.pdf',
  image: 'attach.kind.image',
};

interface ChipFile extends AttachmentChip {
  /** Files in the composer have an id and can be removed; sent ones cannot. */
  id?: number;
  ready?: boolean;
}

interface AttachmentChipsProps {
  files: readonly ChipFile[];
  onRemove?: (id: number) => void;
}

export function AttachmentChips({ files, onRemove }: AttachmentChipsProps) {
  const { t } = useI18n();

  return (
    <ul className="chips" aria-label={t('attach.listLabel')}>
      {files.map((file, index) => {
        const { id } = file;
        return (
          <li key={id ?? index} className="chip" data-reading={file.ready === false ? '' : undefined}>
            <span className="chip-kind">{t(KIND_KEYS[file.kind])}</span>
            <span className="chip-name" title={file.name}>
              {file.name}
            </span>
            {file.ready === false && <span className="chip-state">{t('attach.reading')}</span>}
            {onRemove && id !== undefined && (
              <button
                type="button"
                className="chip-remove"
                aria-label={t('attach.remove', { name: file.name })}
                onClick={() => onRemove(id)}
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
