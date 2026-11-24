import { useId } from 'react';
import { KIND_CHOICES, type KindChoice } from '../../shared/page-kind.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import type { MessageKey } from '../i18n/messages.ts';

const LABELS: Record<KindChoice, MessageKey> = {
  auto: 'kindPicker.auto',
  document: 'kindPicker.document',
  landing: 'kindPicker.landing',
  slides: 'kindPicker.slides',
  app: 'kindPicker.app',
};

interface KindSelectorProps {
  value: KindChoice;
  /** While questions are open or a step runs, the kind they were asked for must not change. */
  disabled: boolean;
  onChange: (kind: KindChoice) => void;
}

/** The kind of page to make. Native radios, so arrow keys move through the options for free. */
export function KindSelector({ value, disabled, onChange }: KindSelectorProps) {
  const { t } = useI18n();
  const name = useId();

  return (
    <fieldset className="kind-picker" disabled={disabled}>
      <legend className="visually-hidden">{t('kindPicker.label')}</legend>
      {KIND_CHOICES.map((kind) => (
        <label key={kind} className="kind-option">
          <input
            type="radio"
            name={name}
            value={kind}
            checked={value === kind}
            onChange={() => onChange(kind)}
          />
          <span>{t(LABELS[kind])}</span>
        </label>
      ))}
    </fieldset>
  );
}
