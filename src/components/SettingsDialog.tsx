import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PROVIDER_LABEL, PROVIDERS, type ProviderId } from '../../shared/settings.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { useSettings } from '../settings/SettingsProvider.tsx';
import { ProviderPanel } from './ProviderPanel.tsx';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<Partial<Record<ProviderId, HTMLButtonElement | null>>>({});
  const [tab, setTab] = useState<ProviderId>('anthropic');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Open on the AI in use, if there is one.
  const activeProvider = settings?.activeProvider ?? null;
  useEffect(() => {
    if (open && activeProvider) setTab(activeProvider);
  }, [open, activeProvider]);

  function statusOf(id: ProviderId): string {
    if (!settings?.providers[id].configured) return t('settings.status.notConnected');
    return settings.activeProvider === id ? t('settings.status.inUse') : t('settings.status.connected');
  }

  function handleTabKeys(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = PROVIDERS[(PROVIDERS.indexOf(tab) + step + PROVIDERS.length) % PROVIDERS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <dialog ref={dialogRef} className="settings" aria-labelledby="settings-title" onClose={onClose}>
      <div className="pane-bar">
        <h2 id="settings-title" className="pane-label">
          {t('settings.title')}
        </h2>
        <button type="button" className="button" onClick={onClose}>
          {t('settings.close')}
        </button>
      </div>

      {open && (
        <div className="settings-body">
          <p className="field-label" id="settings-ai-label">
            {t('settings.ai')}
          </p>
          <div className="tabs" role="tablist" aria-labelledby="settings-ai-label" onKeyDown={handleTabKeys}>
            {PROVIDERS.map((id) => (
              <button
                key={id}
                ref={(element) => {
                  tabRefs.current[id] = element;
                }}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
              >
                <span className="tab-name">{PROVIDER_LABEL[id]}</span>
                <span className="tab-status" data-state={settings?.activeProvider === id ? 'active' : undefined}>
                  {statusOf(id)}
                </span>
              </button>
            ))}
          </div>

          {settings ? (
            <>
              <ProviderPanel key={tab} provider={tab} />
              <p className="settings-note">{t('settings.storage', { dir: settings.configDir })}</p>
            </>
          ) : (
            <p className="field-help">{t('settings.loading')}</p>
          )}
        </div>
      )}
    </dialog>
  );
}
