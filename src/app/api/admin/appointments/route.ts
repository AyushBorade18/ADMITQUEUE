import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireAdminApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
const create = z.object({
  workspaceId: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotMinutes: z.number().int().min(0).max(1410).refine((n) => n % 30 === 0, 'Slots start on the hour or half hour.'),
  purpose: z.string().trim().min(3).max(120).optional(),
});

export const POST = route(async (request) => {
  const { supabase, user } = await requireAdminApi();
  const b = await readJson(request, create);
  const { error } = await supabase.from('appointments').insert({
    workspace_id: b.workspaceId, scheduled_date: b.date, slot_minutes: b.slotMinutes, purpose: b.purpose ?? 'Document verification', created_by: user.id,
  });
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'already_booked', 'This student already has a scheduled appointment.');
    throw new Error(error.message);
  }
  return ok({});
});

const patch = z.object({ id: z.uuid(), status: z.enum(['completed', 'missed', 'cancelled']) });
export const PATCH = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, patch);
  const { data, error } = await supabase.from('appointments').update({ status: b.status }).eq('id', b.id).eq('status', 'scheduled').select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new ApiError(409, 'not_scheduled', 'That appointment is no longer scheduled.');
  return ok({});
});
