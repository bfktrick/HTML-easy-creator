import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import type { ModelAttachment } from '../../shared/attachments.ts';
import { anthropicError } from './anthropic.ts';
import { anthropicUserContent, openAIInput, rejectsAttachments } from './attachments-content.ts';
import { openAIError } from './openai.ts';

const PDF: ModelAttachment = { kind: 'pdf', mediaType: 'application/pdf', data: 'JVBERi0x', name: 'guía' };
const LOGO: ModelAttachment = { kind: 'image', mediaType: 'image/png', data: 'iVBORw0K', name: 'logo.png' };
const PHOTO: ModelAttachment = { kind: 'image', mediaType: 'image/jpeg', data: '/9j/4AAQ', name: 'taller.jpg' };
const headers = new Headers();

describe('anthropicUserContent', () => {
  it('stays a plain string without attachments', () => {
    expect(anthropicUserContent('Hola')).toBe('Hola');
  });

  it('puts documents and numbered images before the text', () => {
    expect(anthropicUserContent('Haz la página', [LOGO, PDF, PHOTO])).toEqual([
      { type: 'text', text: 'Image 1: logo.png' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0K' } },
      { type: 'document', title: 'guía', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0x' } },
      { type: 'text', text: 'Image 2: taller.jpg' },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQ' } },
      { type: 'text', text: 'Haz la página' },
    ]);
  });
});

describe('openAIInput', () => {
  it('stays a plain string without attachments', () => {
    expect(openAIInput('Hola')).toBe('Hola');
  });

  it('sends files and numbered images as data URLs before the text', () => {
    expect(openAIInput('Haz la página', [PDF, LOGO])).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_file', filename: 'guía.pdf', file_data: 'data:application/pdf;base64,JVBERi0x' },
          { type: 'input_text', text: 'Image 1: logo.png' },
          { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0K', detail: 'auto' },
          { type: 'input_text', text: 'Haz la página' },
        ],
      },
    ]);
  });

  it('keeps a name that already ends in .pdf', () => {
    const input = openAIInput('x', [{ ...PDF, name: 'Guía.PDF' }]);
    expect(JSON.stringify(input)).toContain('"filename":"Guía.PDF"');
  });
});

describe('rejectsAttachments', () => {
  it('spots a 400 about the files', () => {
    expect(rejectsAttachments(400, 'This model does not support image inputs.')).toBe(true);
    expect(rejectsAttachments(400, "Invalid content type. image_url is only supported by certain models.")).toBe(true);
    expect(rejectsAttachments(400, 'A maximum of 100 PDF pages may be provided.')).toBe(true);
  });

  it('ignores other errors', () => {
    expect(rejectsAttachments(400, 'max_tokens: must be less than 64000')).toBe(false);
    expect(rejectsAttachments(500, 'image processing failed')).toBe(false);
  });
});

describe('attachment errors from the providers', () => {
  const imageError = { error: { type: 'invalid_request_error', message: 'Image input is not supported by this model' } };

  it('maps a model that refuses the files to attachments_unsupported', () => {
    const anthropic = new Anthropic.BadRequestError(400, imageError, 'Image input is not supported', headers);
    expect(anthropicError(anthropic, true).code).toBe('attachments_unsupported');
    const openai = new OpenAI.BadRequestError(400, imageError, 'Image input is not supported', headers);
    expect(openAIError(openai, true).code).toBe('attachments_unsupported');
  });

  it('keeps a plain provider error when the request had no files', () => {
    const anthropic = new Anthropic.BadRequestError(400, imageError, 'Image input is not supported', headers);
    expect(anthropicError(anthropic).code).toBe('provider_error');
    const openai = new OpenAI.BadRequestError(400, imageError, 'Image input is not supported', headers);
    expect(openAIError(openai).code).toBe('provider_error');
  });

  it('maps a request too large for the provider to attachments_too_large', () => {
    const anthropic = Anthropic.APIError.generate(413, { error: { type: 'request_too_large' } }, 'too large', headers);
    expect(anthropicError(anthropic, true).code).toBe('attachments_too_large');
    const openai = OpenAI.APIError.generate(413, { error: { message: 'too large' } }, 'too large', headers);
    expect(openAIError(openai, true).code).toBe('attachments_too_large');
  });
});
