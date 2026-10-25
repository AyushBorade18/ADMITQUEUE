import { z } from 'zod';
import { ok, readJson, route } from '@/lib/api';
import { rpcError } from '@/lib/admin/rpc';
import { requireAdminApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, z.object({ workspaceId: z.uuid() }));
  const { error } = await supabase.rpc('admin_link_record', { p_workspace: b.workspaceId });
  if (error) rpcError(error);
  return ok({});
});
