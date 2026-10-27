import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireAdminApi } from '@/lib/auth/session';
import { engine } from '@/lib/engine/ops';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('call'), counterId: z.number().int().min(1).max(20) }),
  z.object({ action: z.enum(['start', 'complete', 'noshow', 'cancel']), code: z.string().regex(/^[PR]\d{3,}$/) }),
  z.object({ action: z.enum(['close_counter', 'open_counter']), counterId: z.number().int().min(1).max(20) }),
]);

const FAIRNESS = 3; // after 3 priority calls in a row, one regular student is called

type Item = { id: string; seq: number; level: number; status: string; counter_id: number | null };
type Change = { id: string; status: string; counter_id: number | null };

/**
 * One step of the service desk.
 *  - "Call next" is decided by the engine (priority queue for levels 1-2, plain queue for level 3, plus the fairness rule).
 *  - Start / complete / no-show / cancel are simple status changes made here.
 * The database stores the result. A version number makes two staff clicking at once safe: the loser retries.
 */
export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, schema);

  for (let attempt = 0; attempt < 4; attempt++) {
    const state = await supabase.from('queue_state').select('streak, version').eq('id', 1).single();
    if (state.error) throw new Error(state.error.message);
    const counters = await supabase.from('service_counters').select('id, is_open').order('id');
    if (counters.error) throw new Error(counters.error.message);
    const found = await supabase.from('service_queue_items').select('id, seq, level, status, counter_id').in('status', ['waiting', 'called', 'serving']).order('seq').limit(2000);
    if (found.error) throw new Error(found.error.message);
    const items = (found.data ?? []) as Item[];

    let streak = state.data.streak as number;
    const changes: Change[] = [];
    let shown: { code: string; status: string } | null = null;
    const codeOf = (i: Item) => `${i.level >= 3 ? 'R' : 'P'}${String(i.seq).padStart(3, '0')}`;

    if (b.action === 'call') {
      const counter = (counters.data ?? []).find((c) => c.id === b.counterId);
      if (!counter) throw new ApiError(404, 'no_counter', 'That counter does not exist.');
      if (!counter.is_open) throw new ApiError(409, 'counter_closed', 'That counter is closed.');
      if (items.some((i) => i.counter_id === b.counterId && i.status !== 'waiting')) throw new ApiError(409, 'counter_busy', 'Finish the current student first.');
      const waiting = items.filter((i) => i.status === 'waiting');
      if (waiting.length === 0) throw new ApiError(409, 'nobody_waiting', 'Nobody is waiting.');
      const next = await engine.nextCall(FAIRNESS, streak, waiting.map((i) => ({ seq: Number(i.seq), level: i.level })));
      const chosen = waiting.find((i) => Number(i.seq) === next.seq);
      if (!chosen) throw new ApiError(409, 'nobody_waiting', 'Nobody is waiting.');
      streak = next.streak;
      changes.push({ id: chosen.id, status: 'called', counter_id: b.counterId });
      shown = { code: codeOf(chosen), status: 'called' };
    } else if (b.action === 'close_counter' || b.action === 'open_counter') {
      const here = items.filter((i) => i.counter_id === b.counterId && i.status !== 'waiting');
      if (b.action === 'close_counter') {
        if (here.some((i) => i.status === 'serving')) throw new ApiError(409, 'counter_serving', 'Complete the student being served before closing the counter.');
        for (const i of here) changes.push({ id: i.id, status: 'waiting', counter_id: null }); // a called student goes back to waiting
      }
      const u = await supabase.from('service_counters').update({ is_open: b.action === 'open_counter' }).eq('id', b.counterId);
      if (u.error) throw new Error(u.error.message);
    } else if ('code' in b) {
      const seq = Number(b.code.slice(1));
      const item = items.find((i) => Number(i.seq) === seq && codeOf(i) === b.code);
      if (!item) throw new ApiError(404, 'no_token', 'That token is not in the queue any more.');
      const rule: Record<string, { from: string[]; to: string }> = {
        start: { from: ['called'], to: 'serving' },
        complete: { from: ['serving'], to: 'completed' },
        noshow: { from: ['called'], to: 'no_show' },
        cancel: { from: ['waiting', 'called'], to: 'cancelled' },
      };
      const r = rule[b.action];
      if (!r.from.includes(item.status)) throw new ApiError(409, 'wrong_state', `That token is ${item.status}, so this action is not possible.`);
      changes.push({ id: item.id, status: r.to, counter_id: r.to === 'serving' ? item.counter_id : null });
      shown = { code: b.code, status: r.to };
    }

    const applied = await supabase.rpc('apply_queue_change', { p_expected_version: state.data.version, p_streak: streak, p_changes: changes });
    if (applied.error) throw new Error(applied.error.message);
    if (applied.data === true) return ok({ token: shown });
  }
  throw new ApiError(409, 'busy', 'Someone else changed the queue at the same moment. Please try again.');
});
