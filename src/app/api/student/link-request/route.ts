import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireStudentApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const schema = z.object({ note: z.string().trim().max(500).optional() });

/** The student asks staff to verify and link the record that has their CAP ID. */
export const POST = route(async (request) => {
  const { supabase } = await requireStudentApi();
  const body = await readJson(request, schema);
  const { data, error } = await supabase.rpc('request_record_verification', { p_note: body.note ?? null });
  if (error) {
    if (error.message.includes('already_linked')) throw new ApiError(409, 'already_linked', 'A record is already linked to your account.');
    if (error.code === '23505') throw new ApiError(409, 'already_pending', 'You already have a request waiting for review.');
    throw new Error(error.message);
  }
  return ok({ requestId: data });
});
