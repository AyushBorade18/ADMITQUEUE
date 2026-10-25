import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type StudentRow = {
  workspaceId: string; capId: string; userId: string | null; name: string; stage: string; recordState: string;
  rank: number | null; allotment: string | null; synthetic: boolean; recordId: string | null;
};

function must<T>(label: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${label}: ${r.error.message}`);
  return (r.data ?? []) as T;
}

/** Every workspace with the best known name. Uses only simple queries (no embeds); `db` is the admin's own session client. */
export async function loadStudentRows(db: SupabaseClient): Promise<StudentRow[]> {
  const ws = must<{ id: string; cap_id: string; user_id: string | null; workflow_stage: string; record_state: string; cap_record_id: string | null; is_synthetic: boolean }[]>(
    'workspaces', await db.from('admission_workspaces').select('id, cap_id, user_id, workflow_stage, record_state, cap_record_id, is_synthetic').order('cap_id').limit(5000));
  const recs = must<{ id: string; candidate_name: string; merit_rank: number | null; allotment_status: string }[]>(
    'records', await db.from('cap_records').select('id, candidate_name, merit_rank, allotment_status').limit(5000));
  const profiles = must<{ id: string; full_name: string }[]>('profiles', await db.from('profiles').select('id, full_name').eq('role', 'student').limit(5000));
  const rec = new Map(recs.map((r) => [r.id, r]));
  const prof = new Map(profiles.map((p) => [p.id, p.full_name]));
  return ws.map((w) => {
    const r = w.cap_record_id ? rec.get(w.cap_record_id) : undefined;
    return {
      workspaceId: w.id, capId: w.cap_id, userId: w.user_id, name: r?.candidate_name ?? (w.user_id ? prof.get(w.user_id) ?? '(unnamed)' : '(unclaimed)'),
      stage: w.workflow_stage, recordState: w.record_state, rank: r?.merit_rank ?? null, allotment: r?.allotment_status ?? null, synthetic: w.is_synthetic, recordId: w.cap_record_id,
    };
  });
}

export function errorText(e: { message: string }, map: Record<string, string>, fallback = 'The change was not accepted.'): string {
  const k = Object.keys(map).find((x) => e.message.includes(x));
  return k ? map[k] : fallback;
}
