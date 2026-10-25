import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requireAdminApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// A cell that starts with = + - @ could be run as a formula by a spreadsheet; prefix it with an apostrophe.
function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = route(async () => {
  const { supabase } = await requireAdminApi();
  const { data, error } = await supabase.from('cap_records').select('cap_id, candidate_name, category, merit_rank, percentile, application_status, verification_status, allotment_status, is_synthetic').order('cap_id').limit(20000);
  if (error) throw new Error(error.message);
  const head = 'cap_id,name,category,merit_rank,percentile,application_status,verification_status,allotment_status,is_synthetic';
  const body = (data ?? []).map((r) => [r.cap_id, r.candidate_name, r.category, r.merit_rank, r.percentile, r.application_status, r.verification_status, r.allotment_status, r.is_synthetic].map(cell).join(','));
  return new NextResponse([head, ...body].join('\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cap-records.csv"', 'Cache-Control': 'no-store' } });
});
