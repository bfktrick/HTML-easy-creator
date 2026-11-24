// Wire format of POST /api/edit: one JSON object per line (NDJSON), like /api/generate.

/** A change request is a sentence or a paragraph to add, not a document. */
export const MAX_EDIT_REQUEST_CHARS = 4_000;
/** Earlier change requests sent along for context ("make it bigger" after "change the title"). */
export const MAX_PREVIOUS_REQUESTS = 5;

export type EditStreamEvent =
  /** A piece of the model's reply. Only counted for progress: the page changes once, at the end. */
  | { type: 'text'; text: string }
  /** The reply starts over (refusal fallback, or a retry after edits that did not apply). */
  | { type: 'reset' }
  /** The whole page with the change applied. */
  | { type: 'result'; html: string; summary: string }
  | { type: 'end' }
  | { type: 'error'; error: string };

export interface EditRequestBody {
  /** The current page. */
  html: string;
  /** What the person wants changed. */
  request: string;
  /** Earlier change requests, oldest first, at most MAX_PREVIOUS_REQUESTS. */
  previous?: string[];
}
