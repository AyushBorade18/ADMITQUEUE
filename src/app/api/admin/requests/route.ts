import { z } from 'zod';
import { ok, readJson, route } from '@/lib/api';
import { rpcError } from '@/lib/admin/rpc';
import { requireAdminApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
const schema = z.object({ id: z.uuid(), decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() });

export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, schema);
  const { error } = b.decision === 'approve'
    ? await supabase.rpc('approve_link_request', { p_request: b.id, p_note: b.note ?? null })
    : await supabase.rpc('reject_link_request', { p_request: b.id, p_note: b.note ?? '' });
  if (error) rpcError(error);
  return ok({});
});
