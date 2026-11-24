import { PROVIDER_LABEL } from '../../shared/settings.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { LANGUAGES } from '../i18n/language.ts';
import { useSettings } from '../settings/SettingsProvider.tsx';

export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { lang, setLang, t } = useI18n();
  const { settings } = useSettings();
  const active = settings?.activeProvider ?? null;
  const model = active ? settings?.providers[active].model : null;

  return (
    <header className="topbar">
      <span className="wordmark">HTML Creator</span>
      <div className="topbar-tools">
        {settings && (
          <span className="ai-status" data-state={active ? 'on' : 'off'}>
            {active ? [PROVIDER_LABEL[active], model].filter(Boolean).join(' · ') : t('header.noAi')}
          </span>
        )}
        <button type="button" className="button" onClick={onOpenSettings}>
          {t('header.settings')}
        </button>
        <div className="segmented" role="group" aria-label={t('lang.label')}>
          {LANGUAGES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={lang === option}
              onClick={() => setLang(option)}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
