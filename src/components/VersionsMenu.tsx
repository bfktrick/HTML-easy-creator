import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { Version } from '../versions/versions.ts';

interface VersionsMenuProps {
  versions: Version[];
  currentId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}

/** "12:40" for today, "3 nov, 12:40" for older versions restored from storage. */
function formatWhen(time: number, lang: string): string {
  const date = new Date(time);
  const clock = { hour: '2-digit', minute: '2-digit' } as const;
  const today = new Date().toDateString() === date.toDateString();
  return date.toLocaleString(lang, today ? clock : { ...clock, day: 'numeric', month: 'short' });
}

/** Menu button listing the page's versions, newest first; choosing one makes it current. */
export function VersionsMenu({ versions, currentId, disabled, onSelect }: VersionsMenuProps) {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const unavailable = disabled || versions.length === 0;
  const shown = open && !unavailable;
  const newestFirst = [...versions].reverse();
  const currentIndex = Math.max(0, newestFirst.findIndex((v) => v.id === currentId));

  // Clicks inside the preview iframe never reach this document, but they blur the window.
  useEffect(() => {
    if (!shown) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('blur', close);
    };
  }, [shown]);

  // Opening puts focus on the current version, as in a native select. Only on opening:
  // a later change of the current version must not move the focus.
  useEffect(() => {
    if (shown) itemsRef.current[currentIndex]?.focus();
  }, [shown]);

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }

  function choose(id: string) {
    onSelect(id);
    close(true);
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' && !unavailable) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === 'Escape' && shown) {
      event.preventDefault();
      close(true);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const items = itemsRef.current.filter((item): item is HTMLButtonElement => item !== null);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = (index + 1) % items.length;
        break;
      case 'ArrowUp':
        next = (index - 1 + items.length) % items.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
    event.preventDefault();
    items[next]?.focus();
  }

  return (
    <div className="versions" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="button"
        aria-haspopup="menu"
        aria-expanded={shown}
        aria-controls={shown ? menuId : undefined}
        disabled={unavailable}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleButtonKeyDown}
      >
        {versions.length > 1 ? t('preview.versionsCount', { n: versions.length }) : t('preview.versions')}
      </button>

      {shown && (
        <ul
          id={menuId}
          className="versions-menu"
          role="menu"
          aria-label={t('versions.listLabel')}
          onKeyDown={handleMenuKeyDown}
        >
          {newestFirst.map((version, index) => {
            const current = version.id === currentId;
            return (
              <li key={version.id} role="none">
                <button
                  ref={(item) => {
                    itemsRef.current[index] = item;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={current}
                  tabIndex={-1}
                  className="versions-item"
                  onClick={() => choose(version.id)}
                >
                  <span className="versions-label">{version.label || t('versions.untitled')}</span>
                  <span className="versions-meta">
                    {t(version.origin === 'generated' ? 'versions.generated' : 'versions.edited')} ·{' '}
                    <time dateTime={new Date(version.createdAt).toISOString()}>
                      {formatWhen(version.createdAt, lang)}
                    </time>
                    {current && <span className="versions-current"> · {t('versions.current')}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
