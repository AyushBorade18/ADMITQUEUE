import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine/ops';
import { EngineError } from '@/lib/engine/client';

export const dynamic = 'force-dynamic';

<<<<<<< HEAD
/**
 * Runs the engine self check. "mode" says which implementation answered:
 *   "cpp"        the real C++ program (cpp/build/engine)
 *   "typescript" the TypeScript copy of the same steps (used when the C++ program could not be built/started)
 */
export async function GET() {
  try {
    const h = await engine.health();
    return NextResponse.json({ ok: h.selfCheck, mode: h.mode, engine: h.name, selfCheck: h.selfCheck }, { status: h.selfCheck ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const kind = e instanceof EngineError ? e.kind : 'error';
    return NextResponse.json({ ok: false, mode: null, reason: kind }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
=======
/** Runs the real C++ executable (health op incl. a built-in self check). 503 when it is missing or broken. */
export async function GET() {
  try {
    const h = await engine.health();
    return NextResponse.json({ ok: h.status === 'ok' && h.selfCheck, engine: h.engine, ops: h.ops.length, selfCheck: h.selfCheck }, { status: h.selfCheck ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const kind = e instanceof EngineError ? e.kind : 'error';
    return NextResponse.json({ ok: false, engine: null, reason: kind }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
  }
}
