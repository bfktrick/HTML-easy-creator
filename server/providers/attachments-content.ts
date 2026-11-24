// The user message with attached PDFs and images, in each provider's format. Files go before
// the text (both providers recommend it), and each image is preceded by its number so the
// model can refer to it as src="attachment:N".

import type Anthropic from '@anthropic-ai/sdk';
import type OpenAI from 'openai';
import { dataUrl, numberedImages, type ModelAttachment } from '../../shared/attachments.ts';

function imageLabel(n: number, name: string): string {
  return `Image ${n}: ${name}`;
}

/** Image numbers by position in the list, for the builders below. */
function imageNumbers(attachments: readonly ModelAttachment[]): Map<ModelAttachment, number> {
  return new Map(numberedImages(attachments).map(({ n, image }) => [image, n]));
}

export function anthropicUserContent(
  prompt: string,
  attachments: readonly ModelAttachment[] = [],
): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (attachments.length === 0) return prompt;
  const numbers = imageNumbers(attachments);
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const file of attachments) {
    if (file.kind === 'pdf') {
      blocks.push({
        type: 'document',
        title: file.name,
        source: { type: 'base64', media_type: file.mediaType, data: file.data },
      });
    } else {
      blocks.push({ type: 'text', text: imageLabel(numbers.get(file) ?? 0, file.name) });
      blocks.push({ type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } });
    }
  }
  blocks.push({ type: 'text', text: prompt });
  return blocks;
}

export function openAIInput(
  prompt: string,
  attachments: readonly ModelAttachment[] = [],
): string | OpenAI.Responses.ResponseInput {
  if (attachments.length === 0) return prompt;
  const numbers = imageNumbers(attachments);
  const content: OpenAI.Responses.ResponseInputContent[] = [];
  for (const file of attachments) {
    if (file.kind === 'pdf') {
      // OpenAI reads the type of an inline file from its name.
      const filename = /\.pdf$/i.test(file.name) ? file.name : `${file.name}.pdf`;
      content.push({ type: 'input_file', filename, file_data: dataUrl(file) });
    } else {
      content.push({ type: 'input_text', text: imageLabel(numbers.get(file) ?? 0, file.name) });
      content.push({ type: 'input_image', image_url: dataUrl(file), detail: 'auto' });
    }
  }
  content.push({ type: 'input_text', text: prompt });
  return [{ role: 'user', content }];
}

const ABOUT_FILES = /\b(pdfs?|images?|files?|documents?|media|vision|input_file|input_image|image_url)\b/i;

/**
 * Whether a 400 from the provider is about the attached files: a model without vision or
 * PDF input, or a document with more pages than the model reads. Either way the person
 * should try another model rather than wait and retry.
 */
export function rejectsAttachments(status: number | undefined, message: string): boolean {
  return status === 400 && ABOUT_FILES.test(message);
}
