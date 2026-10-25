import 'server-only';
import { ApiError } from '@/lib/api';
import { createAdminClient } from '@/lib/supabase/server';

export type Limit = { bucket: string; limit: number; windowSeconds: number };

/**
 * Counts one hit in each bucket (kept in PostgreSQL, so it works across restarts and several servers).
 * Throws ApiError(429) when any bucket is over its limit. If the counter itself fails we refuse the request
 * (fail closed) because these buckets protect the login endpoints.
 */
export async function enforceRateLimits(limits: Limit[]): Promise<void> {
  const db = createAdminClient();
  let retryAfter = 0;
  for (const l of limits) {
    const { data, error } = await db.rpc('rate_limit_hit', { p_bucket: l.bucket, p_limit: l.limit, p_window_seconds: l.windowSeconds });
    if (error || !data) throw new ApiError(503, 'rate_limit_unavailable', 'Please try again in a moment.');
    if (!data.allowed) retryAfter = Math.max(retryAfter, Number(data.retry_after) || 60);
  }
  if (retryAfter > 0) {
    throw new ApiError(429, 'too_many_requests', 'Too many attempts. Please wait a few minutes and try again.', undefined, {
      'Retry-After': String(retryAfter),
    });
  }
}
