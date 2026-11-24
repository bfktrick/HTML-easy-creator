import { useCallback, useRef, useState } from 'react';
import type { ModelAttachment } from '../../shared/attachments.ts';
import { extractHtml } from '../../shared/extract-html.ts';
import type { GenerateOutcome } from '../../shared/generate.ts';
import type { KindChoice } from '../../shared/page-kind.ts';
import type { Answer, Question } from '../../shared/questions.ts';
import { api, ApiError } from '../api.ts';

export type GeneratorPhase = 'idle' | 'reading' | 'asking' | 'thinking' | 'writing' | 'editing';

export type ReadResult =
  | { kind: 'read'; url: string; title: string; text: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: string };

/** html is the page as far as it got ("cancelled" keeps what was written), or null if none. */
export type GenerationResult =
  | { kind: GenerateOutcome | 'cancelled'; html: string | null }
  | { kind: 'error'; code: string };

export type AskResult =
  | { kind: 'questions'; questions: Question[] }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: string };

export type EditResult =
  | { kind: 'edited'; html: string; summary: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; code: string };

// Reloading the preview iframe more often than this makes it flicker without showing more.
const PREVIEW_INTERVAL_MS = 1200;
// The character count during an edit only needs to look alive.
const COUNT_INTERVAL_MS = 250;

function errorCodeOf(error: unknown): string {
  return error instanceof ApiError ? error.code : 'generic';
}

export function useGenerator() {
  const [phase, setPhase] = useState<GeneratorPhase>('idle');
  /** The page while it is being written; null until the document starts. */
  const [draft, setDraft] = useState<string | null>(null);
  const [chars, setChars] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  /** Starts a cancellable step; finish() returns to idle unless a newer step took over. */
  const begin = useCallback((next: GeneratorPhase) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase(next);
    setStartedAt(Date.now());
    const finish = () => {
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      setPhase('idle');
      setStartedAt(null);
    };
    return { controller, finish };
  }, []);

  /** Reads a web page on the server (it guards against internal addresses) and returns its text. */
  const readUrl = useCallback(
    async (url: string): Promise<ReadResult> => {
      const { controller, finish } = begin('reading');
      try {
        const page = await api.sourceFromUrl(url, controller.signal);
        return { kind: 'read', url: page.url, title: page.title, text: page.text };
      } catch (error) {
        if (controller.signal.aborted) return { kind: 'cancelled' };
        return { kind: 'error', code: errorCodeOf(error) };
      } finally {
        finish();
      }
    },
    [begin],
  );

  const ask = useCallback(
    async (source: string, lang: string, kind: KindChoice, attachments: ModelAttachment[] = []): Promise<AskResult> => {
      const { controller, finish } = begin('asking');
      try {
        const response = await api.questions(source, lang, kind, attachments, controller.signal);
        return { kind: 'questions', questions: response.questions };
      } catch (error) {
        if (controller.signal.aborted) return { kind: 'cancelled' };
        return { kind: 'error', code: errorCodeOf(error) };
      } finally {
        finish();
      }
    },
    [begin],
  );

  const start = useCallback(
    async (
      source: string,
      answers: Answer[],
      kind: KindChoice,
      attachments: ModelAttachment[] = [],
    ): Promise<GenerationResult> => {
      const { controller, finish } = begin('thinking');
      setChars(0);
      setDraft(null);

      let raw = '';
      let doc: string | null = null;
      let lastFlush = 0;
      let outcome: GenerateOutcome | null = null;

      const flush = (force: boolean) => {
        const now = performance.now();
        if (!force && now - lastFlush < PREVIEW_INTERVAL_MS) return;
        lastFlush = now;
        setChars(raw.length);
        const extracted = extractHtml(raw);
        if (extracted) {
          doc = extracted;
          setDraft(extracted);
        }
      };

      try {
        for await (const event of api.generate(source, answers, kind, attachments, controller.signal)) {
          if (event.type === 'text') {
            if (raw === '') setPhase('writing');
            raw += event.text;
            flush(false);
          } else if (event.type === 'reset') {
            raw = '';
            setPhase('thinking');
          } else if (event.type === 'end') {
            outcome = event.outcome;
          } else {
            throw new ApiError(event.error);
          }
        }
        flush(true);
        // A stream that stops without an "end" event was cut off on the way.
        return outcome ? { kind: outcome, html: doc } : { kind: 'error', code: 'provider_error' };
      } catch (error) {
        flush(true);
        if (controller.signal.aborted) return { kind: 'cancelled', html: doc };
        return { kind: 'error', code: errorCodeOf(error) };
      } finally {
        finish();
      }
    },
    [begin],
  );

  /** Asks for a change to html. Nothing is shown until the whole change has been applied. */
  const edit = useCallback(
    async (html: string, request: string, previous: string[]): Promise<EditResult> => {
      const { controller, finish } = begin('editing');
      setChars(0);

      let count = 0;
      let lastCount = 0;
      let result: EditResult | null = null;
      try {
        for await (const event of api.edit(html, request, previous, controller.signal)) {
          if (event.type === 'text') {
            count += event.text.length;
            const now = performance.now();
            if (now - lastCount >= COUNT_INTERVAL_MS) {
              lastCount = now;
              setChars(count);
            }
          } else if (event.type === 'reset') {
            count = 0;
            setChars(0);
          } else if (event.type === 'result') {
            result = { kind: 'edited', html: event.html, summary: event.summary };
          } else if (event.type === 'error') {
            throw new ApiError(event.error);
          }
        }
        return result ?? { kind: 'error', code: 'provider_error' };
      } catch (error) {
        if (controller.signal.aborted) return { kind: 'cancelled' };
        return { kind: 'error', code: errorCodeOf(error) };
      } finally {
        finish();
      }
    },
    [begin],
  );

  const cancel = useCallback(() => controllerRef.current?.abort(), []);

  return { phase, draft, chars, startedAt, readUrl, ask, start, edit, cancel };
}

/** 75 seconds becomes "1:15". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
