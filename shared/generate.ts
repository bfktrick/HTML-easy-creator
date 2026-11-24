// Wire format of POST /api/generate: one JSON object per line (NDJSON).

import type { ModelAttachment } from './attachments.ts';
import type { KindChoice } from './page-kind.ts';
import type { Answer } from './questions.ts';

/** About 100k tokens of source; longer inputs need chunking, which this app does not do. */
export const MAX_SOURCE_CHARS = 400_000;

export type GenerateOutcome = 'complete' | 'truncated' | 'refused';

export type GenerateStreamEvent =
  /** A piece of the page, in order. */
  | { type: 'text'; text: string }
  /** The model was swapped mid-answer (refusal fallback): throw away the text so far. */
  | { type: 'reset' }
  | { type: 'end'; outcome: GenerateOutcome }
  | { type: 'error'; error: string };

export interface GenerateRequestBody {
  source: string;
  /** Answers to the guided questions; omitted or [] when they were skipped. */
  answers?: Answer[];
  /** PDFs and images. With them, source may be empty. */
  attachments?: ModelAttachment[];
  /** The kind of page to make; omitted means "auto". */
  kind?: KindChoice;
}
