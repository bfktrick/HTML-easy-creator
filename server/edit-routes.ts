import { Hono, type Context } from 'hono';
import { stream } from 'hono/streaming';
import { applyEditReply, type EditFailure } from '../shared/apply-edits.ts';
import { MAX_EDIT_REQUEST_CHARS, MAX_PREVIOUS_REQUESTS, type EditStreamEvent } from '../shared/edit.ts';
import { MAX_SOURCE_CHARS, type GenerateOutcome } from '../shared/generate.ts';
import { fail, readJson } from './http.ts';
import { EDIT_SYSTEM_PROMPT, editUserPrompt } from './prompts.ts';
import { ProviderError, type GenerateEvent } from './providers/types.ts';
import type { SettingsDeps } from './settings-routes.ts';
import { activeAi } from './settings-store.ts';

/** One retry, told which SEARCH texts missed, fixes most slips; more tries tend to repeat them. */
const ATTEMPTS = 2;

interface EditInput {
  html: string;
  request: string;
  previous: string[];
}

/** The validated body, or the error response to send. */
function editInputOf(c: Context, body: Record<string, unknown> | null): EditInput | Response {
  if (!body) return fail(c, 'bad_request', 400);
  const { html, request, previous = [] } = body;
  if (typeof html !== 'string' || html.trim() === '') return fail(c, 'bad_request', 400);
  if (html.length > MAX_SOURCE_CHARS) return fail(c, 'page_too_long', 413);
  if (typeof request !== 'string') return fail(c, 'bad_request', 400);
  if (request.trim() === '') return fail(c, 'empty_source', 400);
  if (request.length > MAX_EDIT_REQUEST_CHARS) return fail(c, 'request_too_long', 413);
  if (!Array.isArray(previous) || !previous.every((item) => typeof item === 'string')) {
    return fail(c, 'bad_request', 400);
  }
  const recent = previous
    .filter((item) => item.trim() !== '')
    .slice(-MAX_PREVIOUS_REQUESTS)
    .map((item) => item.slice(0, MAX_EDIT_REQUEST_CHARS));
  return { html, request, previous: recent };
}

/** Passes the model's text on (for the progress count) and collects it. */
async function readReply(
  events: AsyncIterable<GenerateEvent>,
  send: (event: EditStreamEvent) => Promise<unknown>,
): Promise<{ text: string; outcome: GenerateOutcome | null }> {
  let text = '';
  let outcome: GenerateOutcome | null = null;
  for await (const event of events) {
    if (event.type === 'end') {
      outcome = event.outcome;
      continue;
    }
    text = event.type === 'reset' ? '' : text + event.text;
    await send(event);
  }
  return { text, outcome };
}

export function editRoutes({ store, providers }: SettingsDeps) {
  const api = new Hono();

  // Streams progress as NDJSON (see shared/edit.ts), then the whole edited page in one
  // "result" event: the edits are applied here, all or nothing, so the browser never shows
  // a page with half a change.
  api.post('/edit', async (c) => {
    const ai = activeAi(store.get());
    if (!ai) return fail(c, 'not_configured', 409);
    const input = editInputOf(c, await readJson(c));
    if (input instanceof Response) return input;

    c.header('content-type', 'application/x-ndjson; charset=utf-8');
    c.header('cache-control', 'no-store');

    return stream(c, async (out) => {
      const controller = new AbortController();
      out.onAbort(() => controller.abort());
      const send = (event: EditStreamEvent) => out.write(`${JSON.stringify(event)}\n`);

      try {
        let failures: EditFailure[] = [];
        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
          if (attempt > 1) await send({ type: 'reset' });
          const reply = await readReply(
            providers[ai.provider].generate(ai.apiKey, {
              model: ai.model,
              system: EDIT_SYSTEM_PROMPT,
              prompt: editUserPrompt(input.html, input.request, input.previous, failures),
              // Finding and rewriting a few lines needs less thought than designing a page.
              effort: 'medium',
              signal: controller.signal,
            }),
            send,
          );
          if (controller.signal.aborted) return;
          // No "end" event means the stream was cut off on the way.
          if (reply.outcome === null || reply.outcome === 'refused') {
            await send({ type: 'error', error: reply.outcome === 'refused' ? 'edit_refused' : 'provider_error' });
            return;
          }
          // A reply cut off at the output limit may be missing blocks: never apply part of a change.
          if (reply.outcome === 'truncated') break;

          const applied = applyEditReply(input.html, reply.text);
          if (applied.ok) {
            console.log(`[edit] ${ai.model}: applied on attempt ${attempt}`);
            await send({ type: 'result', html: applied.html, summary: applied.summary });
            await send({ type: 'end' });
            return;
          }
          failures = applied.failures;
          console.log(`[edit] ${ai.model}: attempt ${attempt}, ${failures.length} edit(s) did not apply`);
        }
        await send({ type: 'error', error: 'edit_failed' });
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!(error instanceof ProviderError)) {
          console.error('Edit failed:', error instanceof Error ? error.name : 'unknown');
        }
        await send({ type: 'error', error: error instanceof ProviderError ? error.code : 'internal' });
      }
    });
  });

  return api;
}
