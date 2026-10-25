import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireAdminApi } from '@/lib/auth/session';
import { isValidCapId, normalizeCapId } from '@/lib/capId';
import { engine } from '@/lib/engine/ops';

export const dynamic = 'force-dynamic';
const schema = z.object({ csv: z.string().max(400_000), dryRun: z.boolean().optional() });

/** CSV columns: cap_id,name,category,merit_rank,percentile. The C++ hash table classifies every CAP ID. */
export const POST = route(async (request) => {
  const { supabase, user } = await requireAdminApi();
  const b = await readJson(request, schema);
  const lines = b.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 0 && /^cap_?id/i.test(lines[0])) lines.shift();
  if (lines.length === 0) throw new ApiError(400, 'empty', 'The file has no rows.');
  if (lines.length > 1000) throw new ApiError(400, 'too_many', 'Import at most 1000 rows at a time.');

  const parsed: { capId: string; name: string; category: string | null; rank: number | null; pct: number | null }[] = [];
  const problems: string[] = [];
  lines.forEach((line, i) => {
    const [id = '', name = '', cat = '', rank = '', pct = ''] = line.split(',').map((c) => c.trim());
    const capId = normalizeCapId(id);
    const rankN = rank === '' ? null : Number(rank);
    const pctN = pct === '' ? null : Number(pct);
    if (!isValidCapId(capId)) problems.push(`Row ${i + 1}: invalid CAP ID`);
    else if (name.length < 2 || name.length > 120) problems.push(`Row ${i + 1}: name must be 2-120 characters`);
    else if (rankN !== null && (!Number.isInteger(rankN) || rankN < 1)) problems.push(`Row ${i + 1}: rank must be a positive whole number`);
    else if (pctN !== null && (!Number.isFinite(pctN) || pctN < 0 || pctN > 100)) problems.push(`Row ${i + 1}: percentile must be 0-100`);
    else parsed.push({ capId, name, category: cat || null, rank: rankN, pct: pctN });
  });

  const existingRows = await supabase.from('cap_records').select('cap_id').limit(20000);
  if (existingRows.error) throw new Error(existingRows.error.message);
  const check = await engine.importCheck((existingRows.data ?? []).map((r) => r.cap_id as string), parsed.map((p) => p.capId));
  const fresh = parsed.filter((_, i) => check.status[i] === 'new');
  if (!b.dryRun && fresh.length > 0) {
    const { error } = await supabase.from('cap_records').insert(fresh.map((p) => ({ cap_id: p.capId, candidate_name: p.name, category: p.category, merit_rank: p.rank, percentile: p.pct, created_by: user.id })));
    if (error) throw new Error(error.message);
  }
  return ok({ imported: b.dryRun ? 0 : fresh.length, wouldImport: fresh.length, duplicateInFile: check.duplicateInFile, alreadyExists: check.alreadyExists, problems: problems.slice(0, 20), problemCount: problems.length, dryRun: Boolean(b.dryRun) });
});
