import { z } from 'zod';
import { ok, readJson, route } from '@/lib/api';
import { rpcError } from '@/lib/admin/rpc';
import { requireAdminApi } from '@/lib/auth/session';
import { STAGES } from '@/lib/stages';

export const dynamic = 'force-dynamic';
const schema = z.object({ workspaceId: z.uuid(), stage: z.enum(STAGES), note: z.string().trim().max(500).optional() });

export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, schema);
  const { data, error } = await supabase.rpc('workspace_set_stage', { p_workspace: b.workspaceId, p_stage: b.stage, p_note: b.note ?? null });
  if (error) rpcError(error);
  return ok(data ?? {});
});
