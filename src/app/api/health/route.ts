import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness check for Render. Does not touch the database or the engine, so it is cheap and never leaks details. */
export async function GET() {
  return NextResponse.json({ ok: true, service: 'admitqueue-web' }, { headers: { 'Cache-Control': 'no-store' } });
}
