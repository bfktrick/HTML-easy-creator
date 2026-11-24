// The kinds of page the app makes. The person picks one before sending, or leaves it to
// the model ("auto"); the finished page declares its kind as <html data-kind="…"> so the
// app can tell later (the preview offers "Present" for slides) without asking the model.

export const PAGE_KINDS = ['document', 'landing', 'slides', 'app'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

/** What the person can choose: a kind, or "auto" to let the model decide from the material. */
export const KIND_CHOICES = ['auto', ...PAGE_KINDS] as const;
export type KindChoice = (typeof KIND_CHOICES)[number];

export function isPageKind(value: unknown): value is PageKind {
  return typeof value === 'string' && (PAGE_KINDS as readonly string[]).includes(value);
}

export function isKindChoice(value: unknown): value is KindChoice {
  return typeof value === 'string' && (KIND_CHOICES as readonly string[]).includes(value);
}

/** The kind from a request body: missing means "auto", anything unknown is a malformed request (null). */
export function parseKindChoice(raw: unknown): KindChoice | null {
  if (raw === undefined) return 'auto';
  return isKindChoice(raw) ? raw : null;
}

// Comments are matched first so a commented-out <html> is skipped; quoted attribute values
// may contain ">" without ending the tag.
const HTML_TAG = /<!--[\s\S]*?-->|<html(?=[\s/>])((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
const DATA_KIND = /(?:^|\s)data-kind\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;

/** The kind the page declares on its <html> element, or null when it declares none we know. */
export function pageKindOf(html: string): PageKind | null {
  for (const match of html.matchAll(HTML_TAG)) {
    if (match[0].startsWith('<!--')) continue;
    const attr = DATA_KIND.exec(match[1]);
    const value = (attr?.[1] ?? attr?.[2] ?? attr?.[3] ?? '').trim().toLowerCase();
    return isPageKind(value) ? value : null;
  }
  return null;
}
