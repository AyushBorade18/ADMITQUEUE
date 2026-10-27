import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { rpcError } from '@/lib/admin/rpc';
import { requireAdminApi } from '@/lib/auth/session';
import { isValidCapId, normalizeCapId } from '@/lib/capId';

export const dynamic = 'force-dynamic';

const create = z.object({
  capId: z.string().transform(normalizeCapId).refine(isValidCapId, 'Enter a valid CAP ID.'),
  candidateName: z.string().trim().min(2).max(120),
  category: z.string().trim().max(20).optional(),
  meritRank: z.number().int().positive().optional(),
  percentile: z.number().min(0).max(100).optional(),
});

/** Staff create a record by hand (real or fictional is the staff member's responsibility; it is stored as non-synthetic). */
export const POST = route(async (request) => {
  const { supabase, user } = await requireAdminApi();
  const b = await readJson(request, create);
  const { error } = await supabase.from('cap_records').insert({
    cap_id: b.capId, candidate_name: b.candidateName, category: b.category ?? null, merit_rank: b.meritRank ?? null, percentile: b.percentile ?? null, created_by: user.id,
  });
  if (error) {
    if (error.code === '23505') throw new ApiError(409, 'exists', 'A record with this CAP ID already exists.');
    throw new Error(error.message);
  }
  return ok({});
});

const patch = z.object({
  id: z.uuid(),
  note: z.string().trim().max(500).optional(),
  changes: z.object({
    candidate_name: z.string().trim().min(2).max(120),
    category: z.string().trim().max(20).nullable(),
    merit_rank: z.number().int().positive().nullable(),
    percentile: z.number().min(0).max(100).nullable(),
    application_status: z.enum(['submitted', 'under_review', 'confirmed']),
    verification_status: z.enum(['pending', 'verified', 'rejected']),
    cap_round: z.number().int().min(1).max(4).nullable(),
    allotment_status: z.enum(['not_allotted', 'allotted', 'waiting', 'frozen', 'cancelled']),
    allotted_course_id: z.uuid().nullable(),
    allotted_pref_no: z.number().int().positive().nullable(),
    remark: z.string().trim().max(300).nullable(),
  }).partial().refine((c) => Object.keys(c).length > 0, 'Nothing to change.'),
});

export const PATCH = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, patch);
  const { data, error } = await supabase.rpc('admin_update_record', { p_record: b.id, p_changes: b.changes, p_note: b.note ?? null });
  if (error) rpcError(error);
  return ok(data ?? {});
});
