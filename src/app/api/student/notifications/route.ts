import { z } from 'zod';
import { ok, readJson, route } from '@/lib/api';
import { requireStudentApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const schema = z.object({ all: z.literal(true).optional(), ids: z.array(z.uuid()).max(50).optional() }).refine((v) => v.all || (v.ids && v.ids.length > 0), 'Nothing to update.');

/** Marks the signed-in student's own notifications as read (RLS only lets them touch their own rows). */
export const POST = route(async (request) => {
  const { supabase, user } = await requireStudentApi();
  const body = await readJson(request, schema);
  let q = supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
  if (!body.all && body.ids) q = q.in('id', body.ids);
  const { error } = await q;
  if (error) throw new Error(error.message);
  return ok({});
});
