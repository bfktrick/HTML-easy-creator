import { useEffect, useState, type FormEvent } from 'react';
import {
  API_KEY_PAGE,
  DEFAULT_ANTHROPIC_MODEL,
  PROVIDER_LABEL,
  type ModelInfo,
  type ProviderId,
} from '../../shared/settings.ts';
import { api } from '../api.ts';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { errorKey } from '../i18n/messages.ts';
import { useSettings } from '../settings/SettingsProvider.tsx';

type Busy = 'connect' | 'test' | 'model' | 'use' | 'remove' | null;

interface Status {
  tone: 'ok' | 'error';
  text: string;
}

export function ProviderPanel({ provider }: { provider: ProviderId }) {
  const { t } = useI18n();
  const { settings, setSettings } = useSettings();
  const [changingKey, setChangingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const info = settings?.providers[provider];
  const configured = info?.configured ?? false;
  const isActive = settings?.activeProvider === provider;
  const showKeyForm = !configured || changingKey;

  // Fill the model list when the panel opens on a connected provider.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    api.listModels(provider).then(
      (response) => {
        if (!cancelled) setModels(response.models);
      },
      (error: unknown) => {
        if (!cancelled) setStatus({ tone: 'error', text: t(errorKey(error)) });
      },
    );
    return () => {
      cancelled = true;
    };
    // t is left out on purpose: switching language must not refetch the models.
  }, [provider, configured]);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<string | null>) {
    setBusy(kind);
    setStatus(null);
    try {
      const okText = await action();
      if (okText) setStatus({ tone: 'ok', text: okText });
    } catch (error) {
      setStatus({ tone: 'error', text: t(errorKey(error)) });
    } finally {
      setBusy(null);
    }
  }

  function handleConnect(event: FormEvent) {
    event.preventDefault();
    void run('connect', async () => {
      const response = await api.connect(provider, keyDraft);
      setSettings(response.settings);
      setModels(response.models);
      setKeyDraft('');
      setChangingKey(false);
      return t('settings.connected', { n: response.models.length });
    });
  }

  function handleTest() {
    void run('test', async () => {
      const response = await api.listModels(provider);
      setModels(response.models);
      return t('settings.testOk', { n: response.models.length });
    });
  }

  function handleModel(model: string) {
    void run('model', async () => {
      setSettings(await api.updateSettings({ models: { [provider]: model } }));
      return t('settings.model.saved');
    });
  }

  function handleUse() {
    void run('use', async () => {
      setSettings(await api.updateSettings({ activeProvider: provider }));
      return null;
    });
  }

  function handleRemove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    void run('remove', async () => {
      setSettings(await api.removeKey(provider));
      setModels(null);
      setConfirmRemove(false);
      return null;
    });
  }

  const currentModel = info?.model ?? '';
  const modelOptions: ModelInfo[] = models ?? (currentModel ? [{ id: currentModel, label: currentModel }] : []);
  if (currentModel && !modelOptions.some((m) => m.id === currentModel)) {
    modelOptions.unshift({ id: currentModel, label: currentModel });
  }

  function optionLabel(model: ModelInfo): string {
    const name = model.label === model.id ? model.id : `${model.label} (${model.id})`;
    return model.id === DEFAULT_ANTHROPIC_MODEL ? `${name} · ${t('settings.model.recommended')}` : name;
  }

  return (
    <div role="tabpanel" id={`panel-${provider}`} aria-labelledby={`tab-${provider}`} className="provider-panel">
      {showKeyForm ? (
        <form className="field" onSubmit={handleConnect}>
          <label htmlFor={`key-${provider}`} className="field-label">
            {t('settings.key.label')} · {PROVIDER_LABEL[provider]}
          </label>
          <div className="field-row">
            <input
              id={`key-${provider}`}
              className="input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('settings.key.placeholder')}
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
            <button type="submit" className="button primary" disabled={busy !== null || keyDraft.trim() === ''}>
              {busy === 'connect' ? t('settings.connecting') : t('settings.connect')}
            </button>
            {changingKey && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setChangingKey(false);
                  setKeyDraft('');
                  setStatus(null);
                }}
              >
                {t('settings.cancel')}
              </button>
            )}
          </div>
          <p className="field-help">
            {t(provider === 'anthropic' ? 'settings.key.help.anthropic' : 'settings.key.help.openai')}{' '}
            <a href={API_KEY_PAGE[provider]} target="_blank" rel="noopener noreferrer">
              {t('settings.key.openConsole')}
            </a>
          </p>
        </form>
      ) : (
        <div className="field">
          <span className="field-label">{t('settings.key.saved')}</span>
          <div className="field-row">
            <code className="key-hint">{info?.keyHint}</code>
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => {
                setChangingKey(true);
                setConfirmRemove(false);
              }}
            >
              {t('settings.change')}
            </button>
            <button
              type="button"
              className="button"
              data-danger={confirmRemove || undefined}
              disabled={busy !== null}
              onClick={handleRemove}
              onBlur={() => setConfirmRemove(false)}
            >
              {confirmRemove ? t('settings.removeConfirm') : t('settings.remove')}
            </button>
          </div>
        </div>
      )}

      {configured && (
        <div className="field">
          <label htmlFor={`model-${provider}`} className="field-label">
            {t('settings.model')}
          </label>
          <select
            id={`model-${provider}`}
            className="input"
            value={currentModel}
            disabled={busy !== null || modelOptions.length === 0}
            onChange={(event) => handleModel(event.target.value)}
          >
            {modelOptions.length === 0 && <option value="">{t('settings.model.loading')}</option>}
            {modelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {optionLabel(model)}
              </option>
            ))}
          </select>
          <div className="field-row">
            <button type="button" className="button" disabled={busy !== null} onClick={handleTest}>
              {busy === 'test' ? t('settings.testing') : t('settings.test')}
            </button>
            {isActive ? (
              <span className="badge">{t('settings.status.inUse')}</span>
            ) : (
              <button type="button" className="button primary" disabled={busy !== null} onClick={handleUse}>
                {t('settings.use')}
              </button>
            )}
          </div>
        </div>
      )}

      <p className="status" role="status" aria-live="polite" data-tone={status?.tone}>
        {status?.text}
      </p>
      <p className="field-help">{t('settings.cost', { provider: PROVIDER_LABEL[provider] })}</p>
    </div>
  );
}
