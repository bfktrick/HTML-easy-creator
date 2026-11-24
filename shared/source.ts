// Wire format of POST /api/source/url: the server reads a web page and hands back its text.

export interface UrlSourceRequestBody {
  url: string;
}

export interface UrlSourceResponse {
  /** Final address after redirects. */
  url: string;
  title: string;
  /** Readable text of the page (headings as "#", list items as "- "), capped at MAX_SOURCE_CHARS. */
  text: string;
}

export const URL_SOURCE_ERROR_CODES = [
  'bad_url',
  'blocked_address',
  'fetch_failed',
  'too_large',
  'unsupported_content',
  'empty_page',
] as const;

export type UrlSourceErrorCode = (typeof URL_SOURCE_ERROR_CODES)[number];
