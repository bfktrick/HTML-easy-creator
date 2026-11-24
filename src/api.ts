import type { DocxRequestBody, DocxResponse, ModelAttachment } from '../shared/attachments.ts';
import type { EditRequestBody, EditStreamEvent } from '../shared/edit.ts';
import type { GenerateRequestBody, GenerateStreamEvent } from '../shared/generate.ts';
import type { KindChoice } from '../shared/page-kind.ts';
import type { Answer, QuestionsRequestBody, QuestionsResponse } from '../shared/questions.ts';
import type {
  ConnectResponse,
  ModelsResponse,
  ProviderId,
  PublicSettings,
  SettingsPatch,
} from '../shared/settings.ts';
import type { UrlSourceRequestBody, UrlSourceResponse } from '../shared/source.ts';
import { readNdjson } from './generate/ndjson.ts';

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

function errorCode(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
    return body.error;
  }
  return 'internal';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    });
  } catch {
    throw new ApiError('server_unreachable');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(errorCode(body));
  return body as T;
}

export const api = {
  getSettings: () => request<PublicSettings>('/api/settings'),

  connect: (provider: ProviderId, apiKey: string) =>
    request<ConnectResponse>(`/api/settings/providers/${provider}/key`, {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    }),

  removeKey: (provider: ProviderId) =>
    request<PublicSettings>(`/api/settings/providers/${provider}/key`, { method: 'DELETE' }),

  updateSettings: (patch: SettingsPatch) =>
    request<PublicSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),

  listModels: (provider: ProviderId) => request<ModelsResponse>(`/api/providers/${provider}/models`),

  questions: (source: string, lang: string, kind: KindChoice, attachments: ModelAttachment[], signal: AbortSignal) =>
    request<QuestionsResponse>('/api/questions', {
      method: 'POST',
      body: JSON.stringify({ source, lang, kind, attachments } satisfies QuestionsRequestBody),
      signal,
    }),

  /** The readable text of a web page, read by the local server. */
  sourceFromUrl: (url: string, signal: AbortSignal) =>
    request<UrlSourceResponse>('/api/source/url', {
      method: 'POST',
      body: JSON.stringify({ url } satisfies UrlSourceRequestBody),
      signal,
    }),

  /** Streams the page being written. Throws ApiError before the stream starts. */
  generate: (source: string, answers: Answer[], kind: KindChoice, attachments: ModelAttachment[], signal: AbortSignal) =>
    streamEvents<GenerateStreamEvent>(
      '/api/generate',
      { source, answers, kind, attachments } satisfies GenerateRequestBody,
      signal,
    ),

  /** Streams the progress of a change, then the edited page. Throws ApiError before the stream starts. */
  edit: (html: string, request: string, previous: string[], signal: AbortSignal) =>
    streamEvents<EditStreamEvent>('/api/edit', { html, request, previous } satisfies EditRequestBody, signal),

  /** The text of a Word file (data is the file, base64). */
  docx: (name: string, data: string) =>
    request<DocxResponse>('/api/source/docx', {
      method: 'POST',
      body: JSON.stringify({ name, data } satisfies DocxRequestBody),
    }),
};

/** POSTs a JSON body and yields the NDJSON events of the answer. */
async function* streamEvents<T>(path: string, body: unknown, signal: AbortSignal): AsyncGenerator<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError('server_unreachable');
  }
  if (!response.ok || !response.body) {
    throw new ApiError(errorCode(await response.json().catch(() => null)));
  }
  for await (const event of readNdjson(response.body)) yield event as T;
}
