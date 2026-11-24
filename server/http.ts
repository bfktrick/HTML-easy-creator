import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode } from '../shared/settings.ts';
import { ProviderError } from './providers/types.ts';

export function fail(c: Context, error: ApiErrorCode, status: ContentfulStatusCode) {
  return c.json({ error }, status);
}

/** HTTP answer for a provider failure; anything else is a bug and goes to onError. */
export function providerFailure(c: Context, error: unknown) {
  if (!(error instanceof ProviderError)) throw error;
  switch (error.code) {
    case 'invalid_key':
    case 'forbidden':
    case 'attachments_unsupported':
      return fail(c, error.code, 422);
    case 'attachments_too_large':
      return fail(c, error.code, 413);
    case 'rate_limited':
      return fail(c, error.code, 429);
    default:
      return fail(c, error.code, 502);
  }
}

/** The JSON object in the body, or null if it is missing or malformed. */
export async function readJson(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
