import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireAdminApi } from '@/lib/auth/session';
import { engine, type QueueStepRequest, type QueueTokenView } from '@/lib/engine/ops';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), counterId: z.number().int().min(1).max(20) }),
  z.object({ action: z.enum(['start', 'complete', 'noshow', 'cancel']), code: z.string().regex(/^[PR]\d{3,}$/) }),
  z.object({ action: z.enum(['close_counter', 'open_counter']), counterId: z.number().int().min(1).max(20) }),
]);

const FINAL: Record<string, string> = { waiting: 'waiting', called: 'called', serving: 'serving', completed: 'completed', no_show: 'no_show', cancelled: 'cancelled' };

/**
 * One step of the service desk. The C++ engine (FIFO lane + priority heap + fairness rule) decides what happens;
 * the database stores the result. A version number makes two staff clicking at once safe: the loser retries.
 */
export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, schema);

  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await supabase.from('queue_state').select('streak, version').eq('id', 1).single();
    if (state.error) throw new Error(state.error.message);
    const counters = await supabase.from('service_counters').select('id, is_open').order('id');
    if (counters.error) throw new Error(counters.error.message);
    const items = await supabase.from('service_queue_items').select('id, seq, level, status, counter_id, workspace_id').in('status', ['waiting', 'called', 'serving']).order('seq').limit(2000);
    if (items.error) throw new Error(items.error.message);
    const wsIds = [...new Set((items.data ?? []).map((i) => i.workspace_id as string))];
    const ws = wsIds.length ? await supabase.from('admission_workspaces').select('id, cap_id').in('id', wsIds) : { data: [], error: null };
    if (ws.error) throw new Error(ws.error.message);
    const capOf = new Map((ws.data ?? []).map((w) => [w.id as string, w.cap_id as string]));
    const bySeq = new Map((items.data ?? []).map((i) => [i.seq as number, i]));
    const last = await supabase.from('service_queue_items').select('seq').order('seq', { ascending: false }).limit(1);

    const req: QueueStepRequest = {
      fairness: 3,
      streak: state.data.streak as number,
      lastSeq: ((last.data ?? [])[0]?.seq as number | undefined) ?? 0,
      counters: (counters.data ?? []).map((c) => ({ id: c.id as number, open: Boolean(c.is_open) })),
      tokens: (items.data ?? []).map((i, idx) => ({
        seq: Number(i.seq), level: i.level as number, status: i.status as 'waiting' | 'called' | 'serving', counterId: (i.counter_id as number | null) ?? 0,
        studentId: idx + 1, appId: capOf.get(i.workspace_id as string) ?? 'UNKNOWN',
      })),
      action: b.action === 'call' ? { type: 'call', counterId: b.counterId }
        : 'counterId' in b ? { type: b.action, counterId: b.counterId }
        : { type: b.action, code: b.code },
    };
    const out = await engine.queueStep(req);
    if (!out.action.ok) throw new ApiError(409, out.action.error ?? 'queue_error', out.action.message ?? 'The queue could not do that.');

    const changes: { id: string; status: string; counter_id: number | null }[] = [];
    const touched = [out.action.token, ...(out.action.returned ?? [])].filter(Boolean) as QueueTokenView[];
    for (const t of touched) {
      const item = bySeq.get(t.seq);
      const status = FINAL[t.status];
      if (item && status) changes.push({ id: item.id as string, status, counter_id: status === 'called' || status === 'serving' ? t.counterId : null });
    }
    if (b.action === 'close_counter' || b.action === 'open_counter') {
      const u = await supabase.from('service_counters').update({ is_open: b.action === 'open_counter' }).eq('id', b.counterId);
      if (u.error) throw new Error(u.error.message);
    }
    const applied = await supabase.rpc('apply_queue_change', { p_expected_version: state.data.version, p_streak: out.streak, p_changes: changes });
    if (applied.error) throw new Error(applied.error.message);
    if (applied.data === true) return ok({ token: out.action.token ?? null, snapshot: out.snapshot });
  }
  throw new ApiError(409, 'busy', 'Someone else changed the queue at the same moment. Please try again.');
});
