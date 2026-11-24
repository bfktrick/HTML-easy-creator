import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.tsx';

// Long enough to read the question and click again; after that the button goes back to normal.
const CONFIRM_MS = 5000;

interface NewPageButtonProps {
  /** Starting over would throw away versions: ask first. */
  confirm: boolean;
  disabled: boolean;
  onStartOver: () => void;
}

/** "New page". With work to lose, the first click turns into an inline "click again" instead of a dialog. */
export function NewPageButton({ confirm, disabled, onStartOver }: NewPageButtonProps) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const confirming = asking && !disabled;

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setAsking(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  function handleClick() {
    if (confirm && !confirming) {
      setAsking(true);
      return;
    }
    setAsking(false);
    onStartOver();
  }

  return (
    <button
      type="button"
      className="button"
      data-danger={confirming || undefined}
      disabled={disabled}
      onClick={handleClick}
      onBlur={() => setAsking(false)}
    >
      {confirming ? t('chat.newPageConfirm') : t('chat.newPage')}
    </button>
  );
}
