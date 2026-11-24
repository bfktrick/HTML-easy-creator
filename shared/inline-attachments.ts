// The model writes the person's images into the page as src="attachment:N" (see the page
// rules in server/prompts.ts). Versions and edits keep that short form; the preview and the
// download get the images themselves, so the file stays self-contained.

import { dataUrl } from './attachments.ts';

export interface InlineImage {
  mediaType: string;
  data: string;
}

// Only inside an attribute value or a CSS url(): the same words in the page's text stay text.
const TOKEN = /(["'(])attachment:(\d+)(?=["')])/g;

/** Replaces attachment:N with image N (from 1). An N with no image stays as it is. */
export function inlineAttachments(html: string, images: readonly InlineImage[]): string {
  if (images.length === 0 || !html.includes('attachment:')) return html;
  return html.replace(TOKEN, (match, open: string, n: string) => {
    const image = images[Number(n) - 1];
    return image ? open + dataUrl(image) : match;
  });
}

/** The reverse: each image's data URL goes back to attachment:N. */
export function tokenizeAttachments(html: string, images: readonly InlineImage[]): string {
  let result = html;
  images.forEach((image, index) => {
    const url = dataUrl(image);
    if (result.includes(url)) result = result.split(url).join(`attachment:${index + 1}`);
  });
  return result;
}
