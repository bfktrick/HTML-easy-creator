import { Hono, type Context } from 'hono';
import { stream } from 'hono/streaming';
import { parseAttachments, type ModelAttachment } from '../shared/attachments.ts';
import { MAX_SOURCE_CHARS, type GenerateStreamEvent } from '../shared/generate.ts';
import { parseKindChoice } from '../shared/page-kind.ts';
import { parseQuestions, QUESTIONS_SCHEMA, sanitizeAnswers, type QuestionsResponse } from '../shared/questions.ts';
import type { ApiErrorCode } from '../shared/settings.ts';
import { fail, providerFailure, readJson } from './http.ts';
import {
  attachmentsNote,
  PAGE_SYSTEM_PROMPT,
  pageUserPrompt,
  questionsSystemPrompt,
  questionsUserPrompt,
} from './prompts.ts';
import { ProviderError } from './providers/types.ts';
import type { SettingsDeps } from './settings-routes.ts';
import { activeAi } from './settings-store.ts';

interface Material {
  source: string;
  attachments: ModelAttachment[];
}

const OVERSIZE = new Set<ApiErrorCode>(['too_many_attachments', 'attachment_too_large', 'attachments_too_large']);

export function generateRoutes({ store, providers }: SettingsDeps) {
  const api = new Hono();
  const active = () => activeAi(store.get());

  /** The text and attached files from the body, or the error response to send. */
  function materialOf(c: Context, body: Record<string, unknown> | null): Material | Response {
    if (!body) return fail(c, 'bad_request', 400);
    const source = typeof body.source === 'string' ? body.source : '';
    if (source.length > MAX_SOURCE_CHARS) return fail(c, 'source_too_long', 413);
    const parsed = parseAttachments(body.attachments);
    if (!parsed.ok) return fail(c, parsed.error, OVERSIZE.has(parsed.error) ? 413 : 400);
    // A message may be only files: a PDF or a few photos are material enough.
    if (source.trim() === '' && parsed.attachments.length === 0) return fail(c, 'empty_source', 400);
    return { source, attachments: parsed.attachments };
  }

  // Guided questions. An unusable reply, or a model that cannot do structured
  // replies, gives no questions: the browser then generates straight away.
  api.post('/questions', async (c) => {
    const ai = active();
    if (!ai) return fail(c, 'not_configured', 409);
    const body = await readJson(c);
    const material = materialOf(c, body);
    if (material instanceof Response) return material;
    const { source, attachments } = material;
    const lang = typeof body?.lang === 'string' ? body.lang : 'en';
    const kind = parseKindChoice(body?.kind);
    if (!kind) return fail(c, 'bad_request', 400);

    let reply: string;
    try {
      reply = await providers[ai.provider].ask(ai.apiKey, {
        model: ai.model,
        system: questionsSystemPrompt(lang),
        prompt: questionsUserPrompt(source, kind) + attachmentsNote(attachments, source),
        attachments,
        schema: QUESTIONS_SCHEMA,
        signal: c.req.raw.signal,
      });
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'provider_error') reply = '';
      else return providerFailure(c, error);
    }
    const response: QuestionsResponse = { questions: parseQuestions(reply) };
    return c.json(response);
  });

  // Streams the page as NDJSON (see shared/generate.ts). Errors before the first byte are
  // plain JSON with a status; once streaming has started they arrive as an "error" event.
  api.post('/generate', async (c) => {
    const ai = active();
    if (!ai) return fail(c, 'not_configured', 409);
    const body = await readJson(c);
    const material = materialOf(c, body);
    if (material instanceof Response) return material;
    const { source, attachments } = material;
    const answers = sanitizeAnswers(body?.answers);
    if (!answers) return fail(c, 'bad_request', 400);
    const kind = parseKindChoice(body?.kind);
    if (!kind) return fail(c, 'bad_request', 400);

    c.header('content-type', 'application/x-ndjson; charset=utf-8');
    c.header('cache-control', 'no-store');

    return stream(c, async (out) => {
      const controller = new AbortController();
      out.onAbort(() => controller.abort());
      const send = (event: GenerateStreamEvent) => out.write(`${JSON.stringify(event)}\n`);

      try {
        const events = providers[ai.provider].generate(ai.apiKey, {
          model: ai.model,
          system: PAGE_SYSTEM_PROMPT,
          prompt: pageUserPrompt(source, answers, kind) + attachmentsNote(attachments, source),
          attachments,
          signal: controller.signal,
        });
        for await (const event of events) await send(event);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!(error instanceof ProviderError)) {
          console.error('Generation failed:', error instanceof Error ? error.name : 'unknown');
        }
        await send({ type: 'error', error: error instanceof ProviderError ? error.code : 'internal' });
      }
    });
  });

  return api;
}
