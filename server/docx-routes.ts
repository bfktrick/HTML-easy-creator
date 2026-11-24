import { Hono } from 'hono';
import { base64Size, isBase64, MAX_DOCX_BYTES, type DocxResponse } from '../shared/attachments.ts';
import { docxToText } from './docx-text.ts';
import { fail, readJson } from './http.ts';

export interface DocxDeps {
  /** Replaced in tests. */
  convert?: (file: Buffer) => Promise<string>;
}

// The browser reads Markdown and text files itself, but a .docx is a zip of XML: it is turned
// into text here and goes back to the browser, which adds it to the source.
export function docxRoutes({ convert = docxToText }: DocxDeps = {}) {
  const api = new Hono();

  api.post('/source/docx', async (c) => {
    const body = await readJson(c);
    if (!body || typeof body.name !== 'string' || typeof body.data !== 'string' || !isBase64(body.data)) {
      return fail(c, 'bad_request', 400);
    }
    if (base64Size(body.data) > MAX_DOCX_BYTES) return fail(c, 'attachment_too_large', 413);

    let text: string;
    try {
      text = await convert(Buffer.from(body.data, 'base64'));
    } catch {
      // Not a Word file, an old .doc renamed, or a damaged one. The details stay out of the log.
      return fail(c, 'docx_unreadable', 422);
    }
    const response: DocxResponse = { text };
    return c.json(response);
  });

  return api;
}
