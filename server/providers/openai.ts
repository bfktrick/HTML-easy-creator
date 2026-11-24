import OpenAI from 'openai';
import type { GenerateOutcome } from '../../shared/generate.ts';
import { openAIInput, rejectsAttachments } from './attachments-content.ts';
import { openAIChatModels } from './models.ts';
import {
  ASK_TIMEOUT_MS,
  GENERATE_TIMEOUT_MS,
  ProviderError,
  TEST_TIMEOUT_MS,
  type GenerateEvent,
  type ProviderAdapter,
} from './types.ts';

// Reasoning models take reasoning.effort and long outputs; older chat models reject both.
const REASONING_MODEL = /^(gpt-5|o\d)/;

/** Output cap per model family; reasoning tokens count against it. */
export function openAIMaxOutputTokens(model: string): number {
  if (model.startsWith('gpt-5')) return 128_000;
  if (REASONING_MODEL.test(model)) return 100_000;
  if (model.startsWith('gpt-4.1')) return 32_768;
  return 16_384;
}

function client(apiKey: string, timeout: number): OpenAI {
  // organization/project: null so OPENAI_ORG_ID or OPENAI_PROJECT_ID in the shell don't interfere.
  return new OpenAI({ apiKey, organization: null, project: null, timeout, maxRetries: 1 });
}

/** withAttachments: the request carried PDFs or images, so a 400 about them means the model can't take them. */
export function openAIError(error: unknown, withAttachments = false): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error instanceof OpenAI.AuthenticationError) return new ProviderError('invalid_key');
  if (error instanceof OpenAI.PermissionDeniedError) return new ProviderError('forbidden');
  if (error instanceof OpenAI.RateLimitError) return new ProviderError('rate_limited');
  if (error instanceof OpenAI.APIConnectionError) return new ProviderError('network');
  if (error instanceof OpenAI.APIError && error.status === 413) return new ProviderError('attachments_too_large');
  if (withAttachments && error instanceof OpenAI.APIError && rejectsAttachments(error.status, error.message)) {
    return new ProviderError('attachments_unsupported');
  }
  return new ProviderError('provider_error');
}

export const openAIAdapter: ProviderAdapter = {
  async listModels(apiKey) {
    try {
      const raw: { id: string; created: number }[] = [];
      for await (const model of client(apiKey, TEST_TIMEOUT_MS).models.list()) {
        raw.push({ id: model.id, created: model.created });
      }
      return openAIChatModels(raw);
    } catch (error) {
      throw openAIError(error);
    }
  },

  async ask(apiKey, { model, system, prompt, attachments = [], schema, signal }) {
    try {
      const response = await client(apiKey, ASK_TIMEOUT_MS).responses.create(
        {
          model,
          instructions: system,
          input: openAIInput(prompt, attachments),
          max_output_tokens: 8_000,
          store: false,
          text: { format: { type: 'json_schema', name: 'reply', schema, strict: true } },
          ...(REASONING_MODEL.test(model) ? { reasoning: { effort: 'low' as const } } : {}),
        },
        { signal },
      );
      return response.output_text;
    } catch (error) {
      throw openAIError(error, attachments.length > 0);
    }
  },

  async *generate(
    apiKey,
    { model, system, prompt, attachments = [], effort = 'high', signal },
  ): AsyncGenerator<GenerateEvent> {
    try {
      const events = await client(apiKey, GENERATE_TIMEOUT_MS).responses.create(
        {
          model,
          instructions: system,
          input: openAIInput(prompt, attachments),
          max_output_tokens: openAIMaxOutputTokens(model),
          // Do not keep the user's material on OpenAI's side.
          store: false,
          stream: true,
          ...(REASONING_MODEL.test(model) ? { reasoning: { effort } } : {}),
        },
        { signal },
      );

      let refused = false;
      for await (const event of events) {
        switch (event.type) {
          case 'response.output_text.delta':
            yield { type: 'text', text: event.delta };
            break;
          case 'response.refusal.delta':
            refused = true;
            break;
          case 'response.completed':
            console.log(`[generate] ${model}: completed, ${event.response.usage?.output_tokens ?? '?'} output tokens`);
            yield { type: 'end', outcome: refused ? 'refused' : 'complete' };
            return;
          case 'response.incomplete': {
            const reason = event.response.incomplete_details?.reason;
            console.log(`[generate] ${model}: incomplete (${reason}), ${event.response.usage?.output_tokens ?? '?'} output tokens`);
            const outcome: GenerateOutcome = reason === 'content_filter' ? 'refused' : 'truncated';
            yield { type: 'end', outcome };
            return;
          }
          case 'response.failed':
          case 'error':
            throw new ProviderError('provider_error');
        }
      }
      yield { type: 'end', outcome: refused ? 'refused' : 'complete' };
    } catch (error) {
      if (signal?.aborted) return;
      throw openAIError(error, attachments.length > 0);
    }
  },
};
