// A message that is a link, or starts with one ("https://… hazla en tono informal"),
// means "read this page". A link in the middle of a text is just part of the text.

export interface UrlMessage {
  url: string;
  /** What the user wrote after the link: extra instructions, or "". */
  rest: string;
}

// Punctuation that ends a sentence rather than the address ("mira https://x.com.").
const TRAILING = /[.,;:!?'"»”’>]+$/;
// Separators people put between the link and what they want ("https://… - en inglés").
const LEADING_SEPARATOR = /^[\s\-–—:,;|]+/;

/** Drops closing brackets that the address itself did not open (Wikipedia keeps its "(…)"). */
const OPENING: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

function trimLink(candidate: string): string {
  let url = candidate.replace(TRAILING, '');
  for (;;) {
    const last = url.at(-1) ?? '';
    const open = OPENING[last];
    if (open === undefined || count(url, last) <= count(url, open)) return url;
    url = url.slice(0, -1).replace(TRAILING, '');
  }
}

export function parseUrlMessage(text: string): UrlMessage | null {
  const trimmed = text.trim().replace(/^</, '');
  const first = /^\S+/.exec(trimmed)?.[0];
  if (!first || !/^(https?:\/\/|www\.)/i.test(first)) return null;

  const candidate = trimLink(first);
  let url: URL;
  try {
    url = new URL(/^www\./i.test(candidate) ? `https://${candidate}` : candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  // Whatever punctuation was trimmed off the link belonged to the sentence: drop it.
  const rest = trimmed.slice(first.length).replace(LEADING_SEPARATOR, '').trim();
  return { url: url.href, rest };
}
