import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z, ZodError } from 'zod';
import { ConfigError } from '@/lib/env';
import { EngineError } from '@/lib/engine/client';

/** An error whose message is safe to show to the user. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function ok<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function fail(status: number, code: string, message: string, fields?: Record<string, string>, headers?: Record<string, string>): NextResponse {
  return NextResponse.json({ ok: false, code, message, fields }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

function fieldErrors(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Parses a JSON body with a zod schema. Throws ApiError(400) with per-field messages. */
export async function readJson<S extends z.ZodType>(request: NextRequest | Request, schema: S, maxBytes = 200_000): Promise<z.infer<S>> {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().includes('application/json')) throw new ApiError(415, 'bad_content_type', 'Send the data as JSON.');
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'too_large', 'The request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'bad_json', 'The request body is not valid JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, 'invalid_input', 'Please check the highlighted fields.', fieldErrors(parsed.error));
  return parsed.data;
}

/** Same-origin check for requests that change data (the session cookie is also SameSite=Lax). */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'bad_origin', 'Request blocked.');
  }
  if (host && originHost !== host) throw new ApiError(403, 'bad_origin', 'Request blocked.');
}

type Handler<C> = (request: NextRequest, context: C) => Promise<NextResponse>;

/** Wraps a route handler: origin check for writes, uniform error responses, no internal details in messages. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request);
      return await handler(request, context);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, err.code, err.message, err.fields, err.headers);
      if (err instanceof ConfigError) {
        console.error('[config]', err.message);
        return fail(500, 'not_configured', 'The server is not configured yet. Please tell the administrator.');
      }
      if (err instanceof EngineError) {
        console.error('[engine]', err.code, err.message);
        return fail(503, 'engine_unavailable', 'The processing engine is not available right now. Please try again shortly.');
      }
      console.error('[api]', request.method, request.nextUrl?.pathname, err instanceof Error ? err.message : err);
      return fail(500, 'server_error', 'Something went wrong. Please try again.');
    }
  };
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim().slice(0, 64) || 'unknown';
  return (request.headers.get('x-real-ip') || 'unknown').slice(0, 64);
}
