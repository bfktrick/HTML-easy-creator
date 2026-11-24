import Anthropic from '@anthropic-ai/sdk';
import type { ModelInfo } from '../../shared/settings.ts';
import { anthropicUserContent, rejectsAttachments } from './attachments-content.ts';
import {
  ASK_TIMEOUT_MS,
  GENERATE_TIMEOUT_MS,
  ProviderError,
  TEST_TIMEOUT_MS,
  type GenerateEvent,
  type ProviderAdapter,
} from './types.ts';

// Models that accept output_config.effort (it is a 400 on Sonnet 4.5 and Haiku 4.5).
const SUPPORTS_EFFORT = /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[5-9]|sonnet-4-[6-9])/;
// Models with server-side refusal fallbacks ("default" routes by refusal category).
const SUPPORTS_FALLBACKS = new Set([
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-mythos-5-2',
  'claude-mythos-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);
// Output caps per model. Thinking counts against them, so a creative page at high effort
// needs the full allowance: at 64K a long think left too little room to finish the page.
const FULL_OUTPUT = /^claude-(fable|mythos|opus-5|sonnet-5|haiku-5|opus-4-[6-9]|sonnet-4-[6-9])/;
const SHORT_OUTPUT = /^claude-opus-4(-[01])?$|^claude-opus-4-[01]-/;

export function anthropicMaxTokens(model: string): number {
  if (FULL_OUTPUT.test(model)) return 128_000;
  if (SHORT_OUTPUT.test(model)) return 32_000;
  return 64_000;
}

function client(apiKey: string, timeout: number): Anthropic {
  // authToken: null so a stray ANTHROPIC_AUTH_TOKEN in the user's shell is never sent along.
  return new Anthropic({ apiKey, authToken: null, timeout, maxRetries: 1 });
}

/** withAttachments: the request carried PDFs or images, so a 400 about them means the model can't take them. */
export function anthropicError(error: unknown, withAttachments = false): ProviderError {
  if (error instanceof Anthropic.AuthenticationError) return new ProviderError('invalid_key');
  if (error instanceof Anthropic.PermissionDeniedError) return new ProviderError('forbidden');
  if (error instanceof Anthropic.RateLimitError) return new ProviderError('rate_limited');
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('network');
  // Anthropic takes requests of up to 32 MB: big files can pass our limits and still not fit.
  if (error instanceof Anthropic.APIError && error.status === 413) return new ProviderError('attachments_too_large');
  if (withAttachments && error instanceof Anthropic.APIError && rejectsAttachments(error.status, error.message)) {
    return new ProviderError('attachments_unsupported');
  }
  return new ProviderError('provider_error');
}

export const anthropicAdapter: ProviderAdapter = {
  async listModels(apiKey) {
    try {
      const models: ModelInfo[] = [];
      for await (const model of client(apiKey, TEST_TIMEOUT_MS).models.list()) {
        if (model.deprecated_at) continue;
        models.push({ id: model.id, label: model.display_name });
      }
      return models;
    } catch (error) {
      throw anthropicError(error);
    }
  },

  async ask(apiKey, { model, system, prompt, attachments = [], schema, signal }) {
    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: 16_000,
      system,
      messages: [{ role: 'user', content: anthropicUserContent(prompt, attachments) }],
      output_config: {
        format: { type: 'json_schema', schema },
        // A handful of questions does not need deep thinking; low keeps the wait short.
        ...(SUPPORTS_EFFORT.test(model) ? { effort: 'low' as const } : {}),
      },
    };
    if (SUPPORTS_FALLBACKS.has(model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    try {
      const message = await client(apiKey, ASK_TIMEOUT_MS).beta.messages.create(params, { signal });
      if (message.stop_reason === 'refusal') return '';
      return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    } catch (error) {
      throw anthropicError(error, attachments.length > 0);
    }
  },

  async *generate(
    apiKey,
    { model, system, prompt, attachments = [], effort = 'high', signal },
  ): AsyncGenerator<GenerateEvent> {
    const params: Anthropic.Beta.MessageCreateParamsStreaming = {
      model,
      max_tokens: anthropicMaxTokens(model),
      system,
      messages: [{ role: 'user', content: anthropicUserContent(prompt, attachments) }],
      stream: true,
    };
    // Thinking is left at the model default (adaptive on current models). Designing a page
    // benefits from more care than Opus 5.5's default "medium"; edits ask for less.
    if (SUPPORTS_EFFORT.test(model)) params.output_config = { effort };
    if (SUPPORTS_FALLBACKS.has(model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }

    try {
      const stream = client(apiKey, GENERATE_TIMEOUT_MS).beta.messages.stream(params, { signal });
      for await (const event of stream) {
        if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
          // Another model takes over and starts the answer again.
          yield { type: 'reset' };
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      console.log(`[generate] ${model}: ${final.stop_reason}, ${final.usage.output_tokens} output tokens`);
      const outcome =
        final.stop_reason === 'max_tokens' ? 'truncated' : final.stop_reason === 'refusal' ? 'refused' : 'complete';
      yield { type: 'end', outcome };
    } catch (error) {
      if (signal?.aborted) return;
      throw anthropicError(error, attachments.length > 0);
    }
  },
};
