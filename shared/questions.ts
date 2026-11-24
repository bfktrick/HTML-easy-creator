// Guided questions asked before a page is generated, and the answers sent back with it.

import type { ModelAttachment } from './attachments.ts';
import type { KindChoice } from './page-kind.ts';

export const MAX_QUESTIONS = 4;
export const MAX_OPTIONS = 5;
export const MAX_ANSWERS = 8;
export const MAX_ANSWER_CHARS = 1_000;

export type QuestionKind = 'single' | 'multi' | 'text';

export interface QuestionOption {
  label: string;
  /** One short sentence, or "". */
  description: string;
}

export interface Question {
  id: string;
  text: string;
  kind: QuestionKind;
  /** Empty for "text" questions. */
  options: QuestionOption[];
  /** Example answer for "text" questions, or "". */
  placeholder: string;
}

export interface QuestionsRequestBody {
  source: string;
  /** Interface language, used when the material is too short to tell its language. */
  lang: string;
  /** PDFs and images. With them, source may be empty. */
  attachments?: ModelAttachment[];
  /** The kind of page that will be made; omitted means "auto". */
  kind?: KindChoice;
}

export interface QuestionsResponse {
  questions: Question[];
}

export interface Answer {
  question: string;
  answer: string;
}

/** JSON Schema the model's reply must follow (structured outputs). */
export const QUESTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text', 'kind', 'options', 'placeholder'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          kind: { type: 'string', enum: ['single', 'multi', 'text'] },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['label', 'description'],
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          placeholder: { type: 'string' },
        },
      },
    },
  },
} as const;

const KINDS = new Set<string>(['single', 'multi', 'text']);

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * Cleans what a model returned (object or JSON text). Invalid questions are dropped;
 * an unusable reply gives [], which means "generate without asking".
 */
export function parseQuestions(raw: unknown): Question[] {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const list = record(data)?.questions;
  if (!Array.isArray(list)) return [];

  const questions: Question[] = [];
  const ids = new Set<string>();
  for (const item of list) {
    const q = record(item);
    if (!q) continue;
    const text = str(q.text, 300);
    const kind = str(q.kind, 10);
    if (!text || !KINDS.has(kind)) continue;

    const options =
      kind === 'text'
        ? []
        : (Array.isArray(q.options) ? q.options : [])
            .map(record)
            .filter((o): o is Record<string, unknown> => o !== null)
            .map((o) => ({ label: str(o.label, 120), description: str(o.description, 240) }))
            .filter((o) => o.label !== '')
            .slice(0, MAX_OPTIONS);
    if (kind !== 'text' && options.length < 2) continue;

    let id = str(q.id, 40).replace(/[^\w-]/g, '') || `q${questions.length + 1}`;
    while (ids.has(id)) id = `${id}-${questions.length + 1}`;
    ids.add(id);

    questions.push({ id, text, kind: kind as QuestionKind, options, placeholder: str(q.placeholder, 160) });
    if (questions.length === MAX_QUESTIONS) break;
  }
  return questions;
}

/** Validates answers sent by the browser. null means the request is malformed. */
export function sanitizeAnswers(raw: unknown): Answer[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_ANSWERS) return null;
  const answers: Answer[] = [];
  for (const item of raw) {
    const a = record(item);
    if (!a || typeof a.question !== 'string' || typeof a.answer !== 'string') return null;
    if (a.question.length > MAX_ANSWER_CHARS || a.answer.length > MAX_ANSWER_CHARS) return null;
    const question = a.question.trim();
    const answer = a.answer.trim();
    if (question && answer) answers.push({ question, answer });
  }
  return answers;
}
