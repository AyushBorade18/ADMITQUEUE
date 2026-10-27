import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { rpcError } from '@/lib/admin/rpc';
import { requireAdminApi } from '@/lib/auth/session';
import { engine } from '@/lib/engine/ops';

export const dynamic = 'force-dynamic';
const schema = z.object({ round: z.union([z.literal(1), z.literal(2)]), apply: z.boolean().default(false) });
const STATUS = ['not_allotted', 'allotted', 'waiting', 'frozen', 'cancelled'] as const;

/**
<<<<<<< HEAD
 * Runs the allotment simulation (arrays + queue + bubble sort, see cpp/engine/main.cpp) on the records and
=======
 * Runs the Project (1) allotment simulation (linked list + FIFO queue + bubble sort, in C++) on the records and
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
 * preferences stored here. A dry run only shows what would change. Applying goes through audited, undoable edits.
 * This is a classroom simulation, NOT the official CET Cell allotment.
 */
export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, schema);

  const courses = (await supabase.from('college_courses').select('id, code, demo_seats').order('code')).data ?? [];
  const courseIdx = new Map(courses.map((c, i) => [c.id as string, i + 1]));
  const recs = (await supabase.from('cap_records').select('id, cap_id, candidate_name, merit_rank, verification_status, allotment_status, allotted_course_id, allotted_pref_no, cap_round').not('merit_rank', 'is', null).order('merit_rank').limit(5000)).data ?? [];
  const ws = (await supabase.from('admission_workspaces').select('id, cap_record_id').not('cap_record_id', 'is', null).limit(5000)).data ?? [];
  const wsOf = new Map(ws.map((w) => [w.cap_record_id as string, w.id as string]));
  const prefRows = (await supabase.from('student_preferences').select('workspace_id, position, course_id').order('position').limit(60000)).data ?? [];
  const prefsOf = new Map<string, number[]>();
  for (const p of prefRows) {
    const i = courseIdx.get(p.course_id as string);
    if (i) prefsOf.set(p.workspace_id as string, [...(prefsOf.get(p.workspace_id as string) ?? []), i]);
  }

  const students = recs.flatMap((r, i) => {
    const prefs = prefsOf.get(wsOf.get(r.id as string) ?? '') ?? [];
    if (prefs.length === 0) return [];
    const status = STATUS.indexOf(r.allotment_status as (typeof STATUS)[number]);
    return [{ id: i + 1, name: r.candidate_name as string, rank: r.merit_rank as number, verified: r.verification_status === 'verified', prefs,
      status: b.round === 1 ? 0 : status, allotment: b.round === 1 ? 0 : courseIdx.get(r.allotted_course_id as string) ?? 0, prefNo: b.round === 1 ? 0 : (r.allotted_pref_no as number | null) ?? 0, round: (r.cap_round as number | null) ?? 0, _rec: r }];
  });
  if (students.length === 0) throw new ApiError(409, 'no_students', 'No records with merit ranks and saved preferences were found.');
  if (b.round === 2 && !students.some((s) => s.status === 1)) throw new ApiError(409, 'run_round_1_first', 'Apply round 1 before running round 2.');

  const filled = new Map<number, number>();
  if (b.round === 2) for (const s of students) if (s.status === 1 || s.status === 3) filled.set(s.allotment, (filled.get(s.allotment) ?? 0) + 1);
  const result = await engine.allotment({
<<<<<<< HEAD
    round: b.round,
    courses: courses.map((c, i) => ({ id: i + 1, seats: c.demo_seats as number, filled: filled.get(i + 1) ?? 0 })),
    students: students.map((s) => ({ id: s.id, rank: s.rank, verified: s.verified, prefs: s.prefs, status: s.status, allotment: s.allotment, prefNo: s.prefNo })),
  });
  const message = `Round ${b.round}: ${result.students.filter((s) => s.status === 1).length} allotted, ${result.waiting.length} on the waiting list.`;
=======
    action: b.round === 1 ? 'round1' : 'round2',
    courses: courses.map((c, i) => ({ id: i + 1, label: c.code as string, seats: c.demo_seats as number, filled: filled.get(i + 1) ?? 0 })),
    students: students.map((s) => ({ id: s.id, name: s.name, rank: s.rank, verified: s.verified, prefs: s.prefs, status: s.status, allotment: s.allotment, prefNo: s.prefNo, round: s.round })),
  });
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52

  const byId = new Map(students.map((s) => [s.id, s._rec]));
  const changes = result.students.flatMap((s) => {
    const rec = byId.get(s.id);
    if (!rec) return [];
    const status = STATUS[s.status] ?? 'not_allotted';
    const courseId = s.allotment ? (courses[s.allotment - 1]?.id as string | undefined) ?? null : null;
    const same = rec.allotment_status === status && (rec.allotted_course_id ?? null) === courseId;
    return same ? [] : [{ id: rec.id as string, capId: rec.cap_id as string, from: rec.allotment_status as string, to: status, courseId, prefNo: s.prefNo || null }];
  });

  let applied = 0;
  if (b.apply) {
    for (const c of changes) {
      const hasCourse = (c.to === 'allotted' || c.to === 'frozen') && c.courseId;
      const { error } = await supabase.rpc('admin_update_record', {
        p_record: c.id,
        p_changes: { allotment_status: hasCourse || c.to === 'waiting' || c.to === 'not_allotted' || c.to === 'cancelled' ? c.to : 'not_allotted', allotted_course_id: hasCourse ? c.courseId : null, allotted_pref_no: hasCourse ? c.prefNo : null, cap_round: b.round },
        p_note: `Round ${b.round} allotment simulation`,
      });
      if (error) rpcError(error);
      await supabase.from('allotment_history').insert({ cap_record_id: c.id, cap_round: b.round, event_type: c.to === 'allotted' ? (c.from === 'allotted' ? 'betterment' : 'allotted') : c.to === 'waiting' ? 'waiting' : 'cancelled', course_id: c.courseId, pref_no: c.prefNo, remark: `Simulation round ${b.round}`, source: 'simulation' });
      applied++;
    }
  }
<<<<<<< HEAD
  return ok({ message, considered: students.length, changeCount: changes.length, applied, sample: changes.slice(0, 15), waiting: result.waiting.length });
=======
  return ok({ message: result.message, considered: students.length, changeCount: changes.length, applied, sample: changes.slice(0, 15), waiting: result.waiting.length });
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
});
