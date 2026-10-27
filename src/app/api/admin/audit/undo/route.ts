import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { rpcError } from '@/lib/admin/rpc';
import { requireAdminApi } from '@/lib/auth/session';
import { engine } from '@/lib/engine/ops';

export const dynamic = 'force-dynamic';

/**
 * Undo works like an undo button: only the NEWEST undoable action of this admin can be undone. The engine's stack
 * decides which one that is; the database then re-checks that nothing changed after it.
 */
export const POST = route(async (request) => {
  const { supabase, user } = await requireAdminApi();
  const b = await readJson(request, z.object({ id: z.number().int().positive() }));
  const rows = await supabase.from('audit_logs').select('id').eq('actor_id', user.id).eq('undoable', true).is('undone_at', null).order('id', { ascending: true }).limit(200);
  if (rows.error) throw new Error(rows.error.message);
  const top = await engine.undoTop((rows.data ?? []).map((r) => Number(r.id)));
  if (top !== b.id) throw new ApiError(409, 'not_latest', 'Only your most recent change can be undone.');
  const { error } = await supabase.rpc('undo_audit_action', { p_audit_id: b.id });
  if (error) rpcError(error);
  return ok({});
});
