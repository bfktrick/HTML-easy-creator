// Applies a model's edit reply to the page. The reply format is defined by EDIT_SYSTEM_PROMPT
// in server/prompts.ts: an optional <summary>, then SEARCH/REPLACE blocks, or (only when the
// whole page is redone) a complete new document. Pure, so it is easy to test.

import { extractHtml } from './extract-html.ts';

export interface EditBlock {
  search: string;
  replace: string;
}

export type EditFailureReason =
  /** The SEARCH text is nowhere in the page. */
  | 'not_found'
  /** The SEARCH text is in more than one place, so the target is unclear. */
  | 'ambiguous'
  | 'empty_search'
  /** The reply stopped inside a block (cut off). */
  | 'incomplete'
  /** Neither blocks nor a complete document. */
  | 'no_edits';

export interface EditFailure {
  reason: EditFailureReason;
  /** The block's SEARCH text ("" when there is no block to point at). */
  search: string;
}

export type ParsedEditReply =
  | { kind: 'blocks'; summary: string; blocks: EditBlock[]; incomplete: EditBlock | null }
  | { kind: 'document'; summary: string; html: string }
  | { kind: 'none'; summary: string };

export type EditOutcome = { ok: true; html: string; summary: string } | { ok: false; failures: EditFailure[] };

// Models sometimes miscount the marker characters; any run of 5 to 9 is accepted.
const SEARCH_LINE = /^[ \t]*<{5,9}[ \t]*SEARCH[ \t]*$/;
const DIVIDER_LINE = /^[ \t]*={5,9}[ \t]*$/;
const REPLACE_LINE = /^[ \t]*>{5,9}[ \t]*REPLACE[ \t]*$/;
const SUMMARY = /<summary>([\s\S]*?)<\/summary>/i;
const DOC_END = /<\/html\s*>$/i;
const WHITESPACE_RUN = /\s+/g;
const MAX_SUMMARY_CHARS = 200;

/** The text of a <summary> element, on one line and of a sensible length; "" if there is none. */
export function parseSummary(text: string): string {
  const match = SUMMARY.exec(text);
  if (!match) return '';
  const summary = match[1].replace(WHITESPACE_RUN, ' ').trim();
  return summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS - 1)}…` : summary;
}

export function parseEditReply(raw: string): ParsedEditReply {
  const lines = raw.split(/\r?\n/);
  if (lines.some((line) => SEARCH_LINE.test(line))) return parseBlocks(lines);

  const html = extractHtml(raw);
  if (html && DOC_END.test(html)) {
    // Only the text before the document can hold the summary: the page itself may well
    // contain <details><summary> elements.
    return { kind: 'document', summary: parseSummary(raw.slice(0, raw.indexOf(html))), html };
  }
  return { kind: 'none', summary: parseSummary(raw) };
}

function parseBlocks(lines: string[]): ParsedEditReply {
  const blocks: EditBlock[] = [];
  // Lines outside the blocks: where the summary lives (pages can contain <summary> too).
  const outside: string[] = [];
  let state: 'outside' | 'search' | 'replace' = 'outside';
  let search: string[] = [];
  let replace: string[] = [];

  for (const line of lines) {
    if (state === 'outside') {
      if (SEARCH_LINE.test(line)) {
        state = 'search';
        search = [];
        replace = [];
      } else {
        outside.push(line);
      }
    } else if (state === 'search') {
      if (DIVIDER_LINE.test(line)) {
        state = 'replace';
        replace = [];
      } else {
        search.push(line);
      }
    } else if (REPLACE_LINE.test(line)) {
      blocks.push({ search: search.join('\n'), replace: replace.join('\n') });
      state = 'outside';
    } else {
      replace.push(line);
    }
  }

  const incomplete = state === 'outside' ? null : { search: search.join('\n'), replace: replace.join('\n') };
  return { kind: 'blocks', summary: parseSummary(outside.join('\n')), blocks, incomplete };
}

/**
 * Applies the blocks one after another, each to the page as changed by the ones before.
 * All or nothing: if any block fails, the page comes back untouched with every failure.
 */
export function applyBlocks(html: string, blocks: readonly EditBlock[]): { html: string; failures: EditFailure[] } {
  let doc = html;
  const failures: EditFailure[] = [];
  for (const block of blocks) {
    const found = locate(doc, block.search);
    if ('reason' in found) {
      failures.push({ reason: found.reason, search: block.search });
      continue;
    }
    const replacement = fitReplacement(doc, block, found.exact);
    doc = doc.slice(0, found.start) + replacement + doc.slice(found.end);
  }
  return failures.length > 0 ? { html, failures } : { html: doc, failures };
}

/** Parses a reply and applies it to html. */
export function applyEditReply(html: string, raw: string): EditOutcome {
  const reply = parseEditReply(raw);
  if (reply.kind === 'document') return { ok: true, html: reply.html, summary: reply.summary };
  if (reply.kind === 'none') return { ok: false, failures: [{ reason: 'no_edits', search: '' }] };

  const applied = applyBlocks(html, reply.blocks);
  const failures = [...applied.failures];
  // A block cut off halfway may be one of several the change needs: never apply part of it.
  if (reply.incomplete) failures.push({ reason: 'incomplete', search: reply.incomplete.search });
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, html: applied.html, summary: reply.summary };
}

type Located = { start: number; end: number; exact: boolean } | { reason: 'not_found' | 'ambiguous' | 'empty_search' };

function locate(doc: string, search: string): Located {
  if (search.trim() === '') return { reason: 'empty_search' };
  const exact = occurrences(doc, search);
  if (exact.length === 1) return { start: exact[0], end: exact[0] + search.length, exact: true };
  if (exact.length > 1) return { reason: 'ambiguous' };
  return locateLoosely(doc, search);
}

/** Start offsets of part in text, overlapping ones included; stops counting at two. */
function occurrences(text: string, part: string): number[] {
  const found: number[] = [];
  for (let at = text.indexOf(part); at !== -1 && found.length < 2; at = text.indexOf(part, at + 1)) found.push(at);
  return found;
}

/**
 * Second chance for a SEARCH text whose spacing differs from the page (re-indented lines,
 * CRLF against LF): every run of whitespace counts as one space on both sides. The match is
 * mapped back to offsets in the original page so everything around it stays byte-identical.
 */
function locateLoosely(doc: string, search: string): Located {
  const needle = collapse(search.trim()).text;
  const haystack = collapse(doc);
  const found = occurrences(haystack.text, needle);
  if (found.length === 0) return { reason: 'not_found' };
  if (found.length > 1) return { reason: 'ambiguous' };
  // The needle is trimmed, so its first and last characters are never collapsed whitespace.
  const start = haystack.offsets[found[0]];
  const end = haystack.offsets[found[0] + needle.length - 1] + 1;
  return { start, end, exact: false };
}

/** text with each whitespace run turned into one space, and the original offset of each character. */
function collapse(text: string): { text: string; offsets: Int32Array } {
  const offsets = new Int32Array(text.length);
  const parts: string[] = [];
  let length = 0;
  let last = 0;
  const keep = (from: number, to: number) => {
    parts.push(text.slice(from, to));
    for (let i = from; i < to; i++) offsets[length++] = i;
  };
  for (const run of text.matchAll(WHITESPACE_RUN)) {
    keep(last, run.index);
    parts.push(' ');
    offsets[length++] = run.index;
    last = run.index + run[0].length;
  }
  keep(last, text.length);
  return { text: parts.join(''), offsets: offsets.subarray(0, length) };
}

function fitReplacement(doc: string, { search, replace }: EditBlock, exact: boolean): string {
  let text = replace;
  if (!exact) {
    // A loose match leaves out the SEARCH text's outer whitespace, so the same outer
    // whitespace on the replacement goes too; otherwise indentation would double up.
    const lead = /^\s*/.exec(search)?.[0] ?? '';
    const trail = /\s*$/.exec(search)?.[0] ?? '';
    if (lead && text.startsWith(lead)) text = text.slice(lead.length);
    if (trail && text.endsWith(trail)) text = text.slice(0, text.length - trail.length);
  }
  // Blocks are read line by line, so they always use LF; keep a CRLF page consistent.
  return doc.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text;
}
