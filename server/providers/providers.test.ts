import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { anthropicError, anthropicMaxTokens } from './anthropic.ts';
import { DEFAULT_ANTHROPIC_MODEL, openAIChatModels, pickDefaultModel } from './models.ts';
import { openAIError, openAIMaxOutputTokens } from './openai.ts';
import { ProviderError } from './types.ts';

const headers = new Headers();

describe('anthropicError', () => {
  it.each([
    [new Anthropic.AuthenticationError(401, undefined, 'bad key', headers), 'invalid_key'],
    [new Anthropic.PermissionDeniedError(403, undefined, 'no', headers), 'forbidden'],
    [new Anthropic.RateLimitError(429, undefined, 'slow down', headers), 'rate_limited'],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 'network'],
    [new Anthropic.APIConnectionTimeoutError(), 'network'],
    [new Anthropic.InternalServerError(500, undefined, 'oops', headers), 'provider_error'],
    [new Error('anything else'), 'provider_error'],
  ])('maps %o to %s', (error, code) => {
    const mapped = anthropicError(error);
    expect(mapped).toBeInstanceOf(ProviderError);
    expect(mapped.code).toBe(code);
  });
});

describe('openAIError', () => {
  it.each([
    [new OpenAI.AuthenticationError(401, undefined, 'bad key', headers), 'invalid_key'],
    [new OpenAI.PermissionDeniedError(403, undefined, 'no', headers), 'forbidden'],
    [new OpenAI.RateLimitError(429, undefined, 'quota', headers), 'rate_limited'],
    [new OpenAI.APIConnectionError({ message: 'offline' }), 'network'],
    [new OpenAI.APIConnectionTimeoutError(), 'network'],
    [new OpenAI.InternalServerError(500, undefined, 'oops', headers), 'provider_error'],
  ])('maps %o to %s', (error, code) => {
    expect(openAIError(error).code).toBe(code);
  });
});

// Thinking counts against max_tokens: a creative page at high effort can think for
// minutes and then run out of room while writing (a long page could be cut off at 64K).
describe('anthropicMaxTokens', () => {
  it('gives current models their full 128K output', () => {
    for (const model of ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5-2', 'claude-haiku-5-5', 'claude-opus-4-8', 'claude-opus-4-6', 'claude-sonnet-4-6']) {
      expect(anthropicMaxTokens(model), model).toBe(128_000);
    }
  });

  it('keeps the lower caps of older models', () => {
    expect(anthropicMaxTokens('claude-haiku-4-5')).toBe(64_000);
    expect(anthropicMaxTokens('claude-sonnet-4-5')).toBe(64_000);
    expect(anthropicMaxTokens('claude-opus-4-1')).toBe(32_000);
    expect(anthropicMaxTokens('claude-opus-4')).toBe(32_000);
  });
});

describe('openAIMaxOutputTokens', () => {
  it('uses each family limit', () => {
    expect(openAIMaxOutputTokens('gpt-5.2')).toBe(128_000);
    expect(openAIMaxOutputTokens('o4-mini')).toBe(100_000);
    expect(openAIMaxOutputTokens('gpt-4.1')).toBe(32_768);
    expect(openAIMaxOutputTokens('gpt-4o')).toBe(16_384);
  });
});

describe('openAIChatModels', () => {
  it('keeps chat models, newest first, and drops audio, image and embedding models', () => {
    const models = openAIChatModels([
      { id: 'gpt-5', created: 100 },
      { id: 'text-embedding-3-large', created: 300 },
      { id: 'gpt-5.2', created: 200 },
      { id: 'gpt-4o-realtime-preview', created: 250 },
      { id: 'gpt-image-1', created: 260 },
      { id: 'whisper-1', created: 50 },
      { id: 'o4-mini', created: 150 },
      { id: 'gpt-4o-mini-tts', created: 270 },
    ]);
    expect(models.map((m) => m.id)).toEqual(['gpt-5.2', 'o4-mini', 'gpt-5']);
  });
});

describe('pickDefaultModel', () => {
  it('prefers the recommended Claude model when available', () => {
    const models = [
      { id: 'claude-sonnet-5-5', label: 'Sonnet' },
      { id: DEFAULT_ANTHROPIC_MODEL, label: 'Opus' },
    ];
    expect(pickDefaultModel('anthropic', models)).toBe(DEFAULT_ANTHROPIC_MODEL);
    expect(pickDefaultModel('anthropic', [{ id: 'claude-x', label: 'X' }])).toBe('claude-x');
  });

  it('picks the highest flagship GPT version for OpenAI', () => {
    const ids = ['gpt-5-mini', 'gpt-5.2', 'gpt-5.10', 'gpt-5', 'gpt-5.2-2026-01-01', 'o4-mini'];
    const models = ids.map((id) => ({ id, label: id }));
    expect(pickDefaultModel('openai', models)).toBe('gpt-5.10');
    expect(pickDefaultModel('openai', [{ id: 'o4-mini', label: 'o4-mini' }])).toBe('o4-mini');
  });

  it('returns null for an empty list', () => {
    expect(pickDefaultModel('openai', [])).toBeNull();
  });
});
