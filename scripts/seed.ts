// Seeds 500 fictional CAP records (DM26000001 - DM26000500) plus a fictional college catalogue.
// Idempotent: running it again inserts only what is missing and never changes rows that already exist
// (so a student's saved preferences/documents are never overwritten).
//   npm run db:seed
import { runEngine } from '../src/lib/engine/client';
import { adminClient, chunk, fail, loadEnvFiles } from './lib/common';
import { DEMO_COUNT, DEMO_PREFIX, STAGE_PATH, buildCourses, buildStudents, capIdFor, makeRng } from './lib/dataset';

loadEnvFiles();

type EngineStudent = { id: number; status: number; allotment: number | null; prefNo: number; round: number; remark: string };
type EngineResult = { students: EngineStudent[] };
const STATUS = ['not_allotted', 'allotted', 'waiting', 'frozen', 'cancelled'] as const;

function must<T>(label: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) fail(`${label}: ${res.error.message}`);
  return res.data as T;
}

async function main() {
  const db = adminClient();
  const stats: Record<string, { inserted: number; skipped: number }> = {};
  const note = (k: string, inserted: number, skipped: number) => (stats[k] = { inserted, skipped });

  // ---- courses ----
  const courses = buildCourses();
  const existingCourses = must('read courses', await db.from('college_courses').select('code'));
  const haveCode = new Set(existingCourses.map((c: { code: string }) => c.code));
  const newCourses = courses.filter((c) => !haveCode.has(c.code));
  if (newCourses.length) must('insert courses', await db.from('college_courses').upsert(newCourses.map((c) => ({ ...c, is_synthetic: true })), { onConflict: 'code', ignoreDuplicates: true }));
  note('courses', newCourses.length, courses.length - newCourses.length);
  const courseRows = must('read courses', await db.from('college_courses').select('id, code').in('code', courses.map((c) => c.code)));
  const courseId = new Map(courseRows.map((c: { id: string; code: string }) => [c.code, c.id]));
  const courseIdByIndex = (i: number) => courseId.get(courses[i - 1].code) as string;

  // ---- which candidates are new? ----
  const students = buildStudents(courses.length);
  const existing = must('read records', await db.from('cap_records').select('cap_id').like('cap_id', `${DEMO_PREFIX}%`).limit(5000));
  const haveCap = new Set(existing.map((r: { cap_id: string }) => r.cap_id));
  const fresh = students.filter((s) => !haveCap.has(s.capId));
  note('cap_records', fresh.length, students.length - fresh.length);

  if (fresh.length > 0) {
    // ---- round-1 allotment computed by the real C++ engine (Project (1) linked-list/queue logic) ----
    // All 500 are always passed in so the result does not depend on which ones happen to be new.
    const result = await runEngine<EngineResult>('allotment', {
      action: 'round1',
      courses: courses.map((c, i) => ({ id: i + 1, label: c.code, seats: c.demo_seats })),
      students: students.map((s) => ({ id: s.index, name: s.name, rank: s.rank, verified: s.verified, prefs: s.prefIndexes })),
    }, 30000).catch((e: Error) => fail(`The C++ engine could not run the seed allotment: ${e.message}\nBuild it first with: npm run build:engine`));
    const byId = new Map(result.students.map((s) => [s.id, s]));

    const rows = fresh.map((s) => {
      const r = byId.get(s.index);
      const status = STATUS[r?.status ?? 0];
      const hasCourse = (status === 'allotted' || status === 'frozen') && r?.allotment;
      return {
        cap_id: s.capId, candidate_name: s.name, category: s.category, merit_rank: s.rank, percentile: s.percentile,
        application_status: s.verified ? 'confirmed' : 'under_review',
        verification_status: s.verified ? 'verified' : 'pending',
        cap_round: status === 'not_allotted' ? 1 : 1,
        allotment_status: hasCourse || status === 'waiting' || status === 'not_allotted' ? status : 'not_allotted',
        allotted_course_id: hasCourse ? courseIdByIndex(r!.allotment as number) : null,
        allotted_pref_no: hasCourse ? r!.prefNo : null,
        is_synthetic: true,
        remark: 'Fictional demonstration record',
      };
    });
    for (const part of chunk(rows, 100)) must('insert records', await db.from('cap_records').upsert(part, { onConflict: 'cap_id', ignoreDuplicates: true }));

  }

  {
    // the database trigger created one unclaimed workspace per record; look them up
    const wsRows: { id: string; cap_id: string; cap_record_id: string | null; user_id: string | null }[] = [];
    for (const part of chunk(students.map((s) => s.capId), 100)) {
      wsRows.push(...must('read workspaces', await db.from('admission_workspaces').select('id, cap_id, cap_record_id, user_id').in('cap_id', part)));
    }
    const ws = new Map(wsRows.map((w) => [w.cap_id, w]));
    const recRows: { id: string; cap_id: string; allotment_status: string; allotted_course_id: string | null; allotted_pref_no: number | null }[] = [];
    for (const part of chunk(students.map((s) => s.capId), 100)) {
      recRows.push(...must('read records', await db.from('cap_records').select('id, cap_id, allotment_status, allotted_course_id, allotted_pref_no').in('cap_id', part)));
    }
    const rec = new Map(recRows.map((r) => [r.cap_id, r]));
    note('admission_workspaces', fresh.length, students.length - fresh.length);

    // Extras (preferences, stage, events, history, documents, appointments) are written once per workspace.
    // A workspace that already has seeded events, or that a student has claimed, is left exactly as it is,
    // so a rerun after a crash completes the work and a rerun after claiming never overwrites a student's changes.
    const withEvents = new Set<string>();
    for (const part of chunk([...ws.values()].map((w) => w.id), 100)) {
      for (const e of must<{ workspace_id: string }[]>('read events', await db.from('workflow_events').select('workspace_id').in('workspace_id', part))) withEvents.add(e.workspace_id);
    }
    const todo = students.filter((s) => {
      const w = ws.get(s.capId);
      return w && rec.has(s.capId) && w.user_id === null && !withEvents.has(w.id);
    });

    // ---- preferences ----
    const prefs = todo.flatMap((s) => s.prefIndexes.map((ci, k) => ({ workspace_id: ws.get(s.capId)!.id, position: k + 1, course_id: courseIdByIndex(ci) })));
    for (const part of chunk(prefs, 400)) must('insert preferences', await db.from('student_preferences').upsert(part, { onConflict: 'workspace_id,position', ignoreDuplicates: true }));
    note('student_preferences', prefs.length, 0);

    // ---- stage + workflow events + history ----
    const rng = makeRng(777);
    const events: Record<string, unknown>[] = [];
    const history: Record<string, unknown>[] = [];
    const stageByWs = new Map<string, string>();
    for (const s of todo) {
      const r = rec.get(s.capId)!;
      const w = ws.get(s.capId)!;
      const stage = r.allotment_status === 'allotted' ? 'allotment_recorded' : s.verified ? 'preference_preparation' : 'profile_verification';
      stageByWs.set(w.id, stage);
      const upto = STAGE_PATH.indexOf(stage as (typeof STAGE_PATH)[number]);
      STAGE_PATH.slice(0, upto + 1).forEach((st, i) => events.push({
        workspace_id: w.id, from_stage: i === 0 ? null : STAGE_PATH[i - 1], to_stage: st, note: 'Fictional demonstration data', is_synthetic: true,
      }));
      if (r.allotment_status === 'allotted' || r.allotment_status === 'waiting') {
        history.push({
          cap_record_id: r.id, cap_round: 1, event_type: r.allotment_status === 'allotted' ? 'allotted' : 'waiting',
          course_id: r.allotted_course_id, pref_no: r.allotted_pref_no, remark: r.allotment_status === 'allotted' ? 'Round 1 allotment (demonstration)' : 'Placed on the waiting list (demonstration)', source: 'seed',
        });
      }
    }
    // group workspaces by stage and update each group with one request
    const groups = new Map<string, string[]>();
    for (const [id, st] of stageByWs) groups.set(st, [...(groups.get(st) ?? []), id]);
    for (const [st, ids] of groups) for (const part of chunk(ids, 100)) must('set stage', await db.from('admission_workspaces').update({ workflow_stage: st }).in('id', part));
    for (const part of chunk(events, 400)) must('insert events', await db.from('workflow_events').insert(part));
    const haveHistory = new Set<string>();
    for (const part of chunk(history.map((h) => h.cap_record_id as string), 100)) {
      for (const h of must<{ cap_record_id: string }[]>('read history', await db.from('allotment_history').select('cap_record_id').eq('source', 'seed').in('cap_record_id', part))) haveHistory.add(h.cap_record_id);
    }
    const newHistory = history.filter((h) => !haveHistory.has(h.cap_record_id as string));
    for (const part of chunk(newHistory, 400)) must('insert history', await db.from('allotment_history').insert(part));
    note('workflow_events', events.length, 0);
    note('allotment_history', newHistory.length, 0);

    // ---- document checklist states (the checklist rows were created by a database trigger) ----
    const docs = must('read doc types', await db.from('document_types').select('code, sort_order').order('sort_order'));
    for (const s of todo) {
      const w = ws.get(s.capId)!;
      const depth = s.verified ? 3 + Math.floor(rng() * (docs.length - 2)) : Math.floor(rng() * 3);
      const ready = docs.slice(0, Math.min(depth, docs.length)).map((d: { code: string }) => d.code);
      const verified = s.verified && rng() < 0.4 ? ready.slice(0, Math.max(0, ready.length - 2)) : [];
      if (verified.length) must('docs verified', await db.from('document_checklists').update({ status: 'verified' }).eq('workspace_id', w.id).in('doc_code', verified));
      const rest = ready.filter((c: string) => !verified.includes(c));
      if (rest.length) must('docs ready', await db.from('document_checklists').update({ status: 'ready' }).eq('workspace_id', w.id).in('doc_code', rest));
    }

    // ---- a few appointments and service-desk items so the admin screens have something to show ----
    const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const appts = todo.filter((s) => s.index % 17 === 0).map((s, i) => ({
      workspace_id: ws.get(s.capId)!.id, scheduled_date: day(1 + (i % 5)), slot_minutes: 600 + (i % 8) * 30,
      purpose: 'Document verification', status: 'scheduled', is_synthetic: true,
    }));
    if (appts.length) must('insert appointments', await db.from('appointments').insert(appts));
    note('appointments', appts.length, 0);
    const items = todo.filter((s) => s.index % 41 === 0).map((s, i) => ({
      workspace_id: ws.get(s.capId)!.id, kind: i % 2 ? 'support' : 'verification', subject: i % 2 ? 'Question about my preferences' : 'Please verify my documents',
      level: i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 3, status: 'waiting', is_synthetic: true,
    }));
    if (items.length) must('insert queue items', await db.from('service_queue_items').insert(items));
    note('service_queue_items', items.length, 0);
  }

  // ---- demo round dates (relative to today; only written once) ----
  const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const rounds = [
    { round: 1, label: 'CAP Round 1 (demo)', allotment_date: day(-5), reporting_deadline: day(5) },
    { round: 2, label: 'CAP Round 2 (demo)', allotment_date: day(12), reporting_deadline: day(20) },
    { round: 3, label: 'CAP Round 3 (demo)', allotment_date: day(30), reporting_deadline: day(38) },
  ];
  const had = must('read settings', await db.from('app_settings').select('key').eq('key', 'cap_rounds'));
  if (had.length === 0) must('insert settings', await db.from('app_settings').insert({ key: 'cap_rounds', value: rounds }));
  note('app_settings', had.length === 0 ? 1 : 0, had.length === 0 ? 0 : 1);

  console.log(`Seed finished (${DEMO_COUNT} fictional records ${capIdFor(1)} - ${capIdFor(DEMO_COUNT)}).`);
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(22)} inserted ${String(v.inserted).padStart(5)}   already there ${String(v.skipped).padStart(5)}`);
}

main().catch((e) => fail(`Seed failed: ${e instanceof Error ? e.message : String(e)}`));
