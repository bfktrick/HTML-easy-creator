import type { ModelAttachment } from '../../shared/attachments.ts';
import type { GenerateOutcome } from '../../shared/generate.ts';
import type { ModelInfo, ProviderErrorCode } from '../../shared/settings.ts';

export type Effort = 'low' | 'medium' | 'high';

export type { ModelAttachment };

export interface GenerateRequest {
  model: string;
  system: string;
  prompt: string;
  /** PDFs and images sent with the prompt, before its text. */
  attachments?: readonly ModelAttachment[];
  /** How hard the model thinks, on models that let us choose. Defaults to "high" (page design). */
  effort?: Effort;
  signal?: AbortSignal;
}

export interface AskRequest {
  model: string;
  system: string;
  prompt: string;
  /** PDFs and images sent with the prompt, before its text. */
  attachments?: readonly ModelAttachment[];
  /** JSON Schema the reply must follow. */
  schema: Record<string, unknown>;
  signal?: AbortSignal;
}

export type GenerateEvent =
  | { type: 'text'; text: string }
  | { type: 'reset' }
  | { type: 'end'; outcome: GenerateOutcome };

/** What the app needs from each AI provider. */
export interface ProviderAdapter {
  /** Lists the models the key can use. Free, so it doubles as the connection test. */
  listModels(apiKey: string): Promise<ModelInfo[]>;
  /** A short, fast call whose reply is JSON following request.schema ("" if declined). */
  ask(apiKey: string, request: AskRequest): Promise<string>;
  /**
   * Streams the reply. Ends with one "end" event; failures throw ProviderError.
   * When the signal aborts it stops quietly, without an "end" event.
   */
  generate(apiKey: string, request: GenerateRequest): AsyncIterable<GenerateEvent>;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode) {
    super(code);
    this.name = 'ProviderError';
    this.code = code;
  }
}

/** Connection tests should answer quickly. */
export const TEST_TIMEOUT_MS = 15_000;
/** Questions are a small reply at low effort. */
export const ASK_TIMEOUT_MS = 2 * 60_000;
/** A long page at high effort can take several minutes. */
export const GENERATE_TIMEOUT_MS = 15 * 60_000;
