// Types shared by the server and the browser. Nothing here may ever carry an API key:
// the browser only learns whether a key exists and its last four characters.

import type { UrlSourceErrorCode } from './source.ts';

export const PROVIDERS = ['anthropic', 'openai'] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
};

/** Anthropic's recommended model; the settings screen marks it as such. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

export const API_KEY_PAGE: Record<ProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
};

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as readonly string[]).includes(value);
}

export interface ModelInfo {
  id: string;
  label: string;
}

export interface PublicProviderSettings {
  configured: boolean;
  /** "…abcd": enough to recognise the key, useless to anyone else. */
  keyHint: string | null;
  model: string | null;
}

export interface PublicSettings {
  activeProvider: ProviderId | null;
  /** Folder where the settings file lives, shown to the user. */
  configDir: string;
  providers: Record<ProviderId, PublicProviderSettings>;
}

export interface ConnectResponse {
  settings: PublicSettings;
  models: ModelInfo[];
}

export interface ModelsResponse {
  models: ModelInfo[];
}

export interface SettingsPatch {
  activeProvider?: ProviderId;
  models?: Partial<Record<ProviderId, string>>;
}

/** Errors the provider itself reports when we call it. */
export type ProviderErrorCode =
  | 'invalid_key'
  | 'forbidden'
  | 'rate_limited'
  | 'network'
  | 'provider_error'
  /** The model would not take the attached PDFs or images (or they were too long for it). */
  | 'attachments_unsupported'
  /** The attachments together are more than the provider accepts in one request. */
  | 'attachments_too_large';

export type ApiErrorCode =
  | ProviderErrorCode
  | UrlSourceErrorCode
  | 'invalid_key_format'
  | 'invalid_model'
  | 'not_configured'
  | 'unknown_provider'
  | 'bad_request'
  | 'unsupported_media_type'
  | 'empty_source'
  | 'source_too_long'
  | 'page_too_long'
  | 'request_too_long'
  | 'too_many_attachments'
  | 'unsupported_attachment'
  | 'attachment_too_large'
  | 'docx_unreadable'
  /** The model's edits did not match the page, even after a retry. */
  | 'edit_failed'
  | 'edit_refused'
  | 'not_found'
  | 'internal';

export interface ApiErrorBody {
  error: ApiErrorCode;
}
