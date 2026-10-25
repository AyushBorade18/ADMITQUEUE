import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine/ops';
import { EngineError } from '@/lib/engine/client';

export const dynamic = 'force-dynamic';

/** Runs the real C++ executable (health op incl. a built-in self check). 503 when it is missing or broken. */
export async function GET() {
  try {
    const h = await engine.health();
    return NextResponse.json({ ok: h.status === 'ok' && h.selfCheck, engine: h.engine, ops: h.ops.length, selfCheck: h.selfCheck }, { status: h.selfCheck ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const kind = e instanceof EngineError ? e.kind : 'error';
    return NextResponse.json({ ok: false, engine: null, reason: kind }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
