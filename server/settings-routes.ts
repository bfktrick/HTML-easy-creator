import { Hono } from 'hono';
import {
  isProviderId,
  PROVIDERS,
  type ConnectResponse,
  type ModelsResponse,
  type ProviderId,
} from '../shared/settings.ts';
import { fail, providerFailure, readJson } from './http.ts';
import { pickDefaultModel } from './providers/models.ts';
import type { ProviderAdapter } from './providers/types.ts';
import { toPublicSettings, type SettingsStore } from './settings-store.ts';

export interface SettingsDeps {
  store: SettingsStore;
  providers: Record<ProviderId, ProviderAdapter>;
}

// Real keys are long runs of letters, digits, "-" and "_". This only catches pasting mistakes.
const KEY_SHAPE = /^[A-Za-z0-9_-]{20,300}$/;
const MODEL_SHAPE = /^[A-Za-z0-9._:/-]{1,100}$/;

export function settingsRoutes({ store, providers }: SettingsDeps) {
  const api = new Hono();
  const view = () => toPublicSettings(store.get(), store.dir);

  api.get('/settings', (c) => c.json(view()));

  // Connect: the key is checked with the provider first and only saved if it works.
  api.put('/settings/providers/:provider/key', async (c) => {
    const provider = c.req.param('provider');
    if (!isProviderId(provider)) return fail(c, 'unknown_provider', 404);

    const body = await readJson(c);
    if (!body) return fail(c, 'bad_request', 400);
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!KEY_SHAPE.test(apiKey)) return fail(c, 'invalid_key_format', 400);

    let models;
    try {
      models = await providers[provider].listModels(apiKey);
    } catch (error) {
      return providerFailure(c, error);
    }

    await store.update((draft) => {
      const previous = draft.providers[provider]?.model;
      const model = previous && models.some((m) => m.id === previous) ? previous : pickDefaultModel(provider, models);
      draft.providers[provider] = model ? { apiKey, model } : { apiKey };
      draft.activeProvider ??= provider;
    });

    const response: ConnectResponse = { settings: view(), models };
    return c.json(response);
  });

  api.delete('/settings/providers/:provider/key', async (c) => {
    const provider = c.req.param('provider');
    if (!isProviderId(provider)) return fail(c, 'unknown_provider', 404);

    await store.update((draft) => {
      delete draft.providers[provider];
      if (draft.activeProvider === provider) {
        draft.activeProvider = PROVIDERS.find((id) => draft.providers[id]?.apiKey) ?? null;
      }
    });
    return c.json(view());
  });

  api.patch('/settings', async (c) => {
    const body = await readJson(c);
    if (!body) return fail(c, 'bad_request', 400);
    const current = store.get();
    const hasKey = (id: ProviderId) => Boolean(current.providers[id]?.apiKey);

    const { activeProvider, models } = body;
    if (activeProvider !== undefined) {
      if (!isProviderId(activeProvider)) return fail(c, 'unknown_provider', 404);
      if (!hasKey(activeProvider)) return fail(c, 'not_configured', 400);
    }

    const modelChanges: [ProviderId, string][] = [];
    if (models !== undefined) {
      if (typeof models !== 'object' || models === null) return fail(c, 'bad_request', 400);
      for (const [id, model] of Object.entries(models)) {
        if (!isProviderId(id)) return fail(c, 'unknown_provider', 404);
        if (typeof model !== 'string' || !MODEL_SHAPE.test(model)) return fail(c, 'invalid_model', 400);
        if (!hasKey(id)) return fail(c, 'not_configured', 400);
        modelChanges.push([id, model]);
      }
    }

    await store.update((draft) => {
      if (isProviderId(activeProvider)) draft.activeProvider = activeProvider;
      for (const [id, model] of modelChanges) {
        const entry = draft.providers[id];
        if (entry) entry.model = model;
      }
    });
    return c.json(view());
  });

  // Also the "test connection" button: listing models costs nothing.
  api.get('/providers/:provider/models', async (c) => {
    const provider = c.req.param('provider');
    if (!isProviderId(provider)) return fail(c, 'unknown_provider', 404);
    const apiKey = store.get().providers[provider]?.apiKey;
    if (!apiKey) return fail(c, 'not_configured', 409);

    try {
      const response: ModelsResponse = { models: await providers[provider].listModels(apiKey) };
      return c.json(response);
    } catch (error) {
      return providerFailure(c, error);
    }
  });

  return api;
}
