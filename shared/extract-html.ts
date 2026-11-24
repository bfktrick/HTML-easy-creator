const DOC_START = /<!doctype html|<html[\s>]/i;
const DOC_END = /<\/html\s*>/gi;

/**
 * Pulls the HTML document out of a model reply: drops any preamble, code fences and
 * text after the final </html>. Works on partial replies while they stream; returns
 * "" until the document has started.
 */
export function extractHtml(raw: string): string {
  const start = raw.search(DOC_START);
  if (start === -1) return '';
  const body = raw.slice(start);

  let end = -1;
  for (const match of body.matchAll(DOC_END)) end = match.index + match[0].length;
  return end === -1 ? body.replace(/\s*`{3}\s*$/, '') : body.slice(0, end);
}
