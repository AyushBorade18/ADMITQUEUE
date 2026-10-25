// The place where CAP admission records come from.
//
// AdmitQueue looks records up in ITS OWN Supabase database (table cap_records). It does NOT call the CET Cell
// and cannot fetch real-world records from a CAP ID. Everything that needs a record goes through this small
// interface, so a future authorized CET Cell API, or a legitimately obtained dataset imported into the
// database, can be plugged in by writing one more class and returning it from getRecordSource().
import type { SupabaseClient } from '@supabase/supabase-js';

export type CapRecord = {
  id: string;
  cap_id: string;
  candidate_name: string;
  category: string | null;
  merit_rank: number | null;
  percentile: number | null;
  application_status: 'submitted' | 'under_review' | 'confirmed';
  verification_status: 'pending' | 'verified' | 'rejected';
  cap_round: number | null;
  allotment_status: 'not_allotted' | 'allotted' | 'waiting' | 'frozen' | 'cancelled';
  allotted_course_id: string | null;
  allotted_pref_no: number | null;
  is_synthetic: boolean;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

export interface CapRecordSource {
  /** Human readable name of the source (shown to staff, never to students). */
  readonly name: string;
  /** Record with this normalized CAP ID, or null. The caller's own permissions (RLS) still apply. */
  findByCapId(capId: string): Promise<CapRecord | null>;
  /** Record by id (the id stored in admission_workspaces.cap_record_id). */
  getById(id: string): Promise<CapRecord | null>;
}

/** Records stored in our own PostgreSQL database. Access is limited by Row Level Security of the given client. */
export class SupabaseCapRecordSource implements CapRecordSource {
  readonly name = 'AdmitQueue database (Supabase PostgreSQL)';
  constructor(private db: SupabaseClient) {}

  async findByCapId(capId: string): Promise<CapRecord | null> {
    const { data, error } = await this.db.from('cap_records').select('*').eq('cap_id', capId).maybeSingle();
    if (error) throw new Error(`record lookup failed: ${error.message}`);
    return (data as CapRecord | null) ?? null;
  }

  async getById(id: string): Promise<CapRecord | null> {
    const { data, error } = await this.db.from('cap_records').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`record lookup failed: ${error.message}`);
    return (data as CapRecord | null) ?? null;
  }
}

/** The one place that decides which source is used. */
export function getRecordSource(db: SupabaseClient): CapRecordSource {
  return new SupabaseCapRecordSource(db);
}
