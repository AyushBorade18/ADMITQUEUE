import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireStudentApi } from '@/lib/auth/session';
import { enforceRateLimits } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const schema = z.object({ subject: z.string().trim().min(3).max(140), body: z.string().trim().max(1000).optional() });

/** Opens a plain support request in the staff queue. RLS only allows kind=support, level 3, waiting, own workspace. */
export const POST = route(async (request) => {
  const { supabase, user } = await requireStudentApi();
  const body = await readJson(request, schema);
  await enforceRateLimits([{ bucket: `support:${user.id}`, limit: 10, windowSeconds: 3600 }]);
  const ws = await supabase.from('admission_workspaces').select('id').eq('user_id', user.id).maybeSingle();
  if (ws.error) throw new Error(ws.error.message);
  if (!ws.data) throw new ApiError(409, 'no_workspace', 'You do not have an admission workspace yet.');
  const { data, error } = await supabase
    .from('service_queue_items')
    .insert({ workspace_id: ws.data.id, kind: 'support', subject: body.subject, body: body.body ?? null, level: 3, status: 'waiting', created_by: user.id })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return ok({ id: data.id });
});
