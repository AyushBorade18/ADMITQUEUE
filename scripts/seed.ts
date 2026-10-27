// Seeds the demo database:
//   * 500 fictional CAP records (EN26100001 - EN26100500) with preferences, documents, appointments, queue items
//   * a fictional college catalogue
//   * 500 student logins (CAP ID + password, password = the CAP ID) and the admin login (admin / Admin@123)
// Safe to run again: it only adds what is missing and never overwrites what a student or admin changed.
//   npm run db:seed                      add what is missing
//   npm run db:seed -- --reset-passwords also set every demo password back to the CAP ID
import type { SupabaseClient } from '@supabase/supabase-js';
import { runFallback } from '../src/lib/engine/fallback';
import { adminClient, chunk, fail, loadEnvFiles } from './lib/common';
import { DEMO_ADMIN, DEMO_COUNT, DEMO_PREFIX, STAGE_PATH, buildCourses, buildStudents, capIdFor, emailFor, makeRng, passwordFor, titleName } from './lib/dataset';

loadEnvFiles();

type EngineStudent = { id: number; status: number; allotment: number | null; prefNo: number };
type EngineResult = { students: EngineStudent[] };

/** Round 1 with the same steps as cpp/engine/main.cpp (the TypeScript copy, so seeding needs no C++ compiler). */
function round1(courses: { seats: number }[], students: { index: number; rank: number; verified: boolean; prefIndexes: number[] }[]): EngineResult {
  const input = [
    `allot 1 ${courses.length}`,
    ...courses.map((c, i) => `${i + 1} ${c.seats} 0`),
    String(students.length),
    ...students.map((s) => `${s.index} ${s.rank} 0 0 0 ${s.verified ? 1 : 0} ${s.prefIndexes.length} ${s.prefIndexes.join(' ')}`),
  ].join('\n');
  const lines = runFallback(input);
  return {
    students: lines.filter((l) => l.startsWith('STUDENT ')).map((l) => {
      const [, id, status, course, prefNo] = l.split(' ');
      return { id: Number(id), status: Number(status), allotment: Number(course) || null, prefNo: Number(prefNo) };
    }),
  };
}
const STATUS = ['not_allotted', 'allotted', 'waiting', 'frozen', 'cancelled'] as const;

function must<T>(label: string, res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) fail(`${label}: ${res.error.message}`);
  return res.data as T;
}

/** Runs `fn` over `items` with a few requests at a time. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

/** Student logins (password = CAP ID, linked to the record) and the admin login. */
async function createLogins(db: SupabaseClient, students: { capId: string; name: string }[], note: (k: string, inserted: number, skipped: number) => void) {
  const resetPasswords = process.argv.includes('--reset-passwords');

  // ---- admin ----
  const A = DEMO_ADMIN;
  let adminId: string | undefined;
  const foundAdmin = must('read admin', await db.from('profiles').select('id').eq('admin_login_id', A.loginId).maybeSingle());
  adminId = (foundAdmin as { id: string } | null)?.id;
  let adminCreated = false;
  if (!adminId) {
    const made = await db.auth.admin.createUser({ email: A.email, password: A.password, email_confirm: true, user_metadata: { full_name: A.fullName } });
    if (made.error || !made.data.user) {
      const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = list.data?.users.find((u) => u.email?.toLowerCase() === A.email);
      if (!match) fail(`Could not create the admin login: ${made.error?.message ?? 'unknown error'}`);
      adminId = match!.id;
    } else {
      adminId = made.data.user.id;
      adminCreated = true;
    }
  }
  // always (re)set the demo password so the documented admin login works
  const upd = await db.auth.admin.updateUserById(adminId!, { password: A.password });
  if (upd.error) fail(`Could not set the admin password: ${upd.error.message}`);
  const prof = await db.from('profiles').update({ role: 'admin', admin_login_id: A.loginId, full_name: A.fullName }).eq('id', adminId!);
  if (prof.error) fail(`Could not mark the admin profile: ${prof.error.message}`);
  note('admin login', adminCreated ? 1 : 0, adminCreated ? 0 : 1);

  // ---- students ----
  const mapped = new Map<string, string>(); // cap id -> user id
  for (const part of chunk(students.map((s) => s.capId), 100)) {
    for (const m of must<{ cap_id: string; user_id: string }[]>('read logins', await db.from('student_login_ids').select('cap_id, user_id').in('cap_id', part))) mapped.set(m.cap_id, m.user_id);
  }
  let known: Map<string, string> | null = null; // e-mail -> user id (loaded only if a user already exists without a mapping)
  const loadKnown = async () => {
    if (known) return known;
    known = new Map();
    for (let page = 1; page < 20; page++) {
      const r = await db.auth.admin.listUsers({ page, perPage: 1000 });
      const users = r.data?.users ?? [];
      for (const u of users) if (u.email) known.set(u.email.toLowerCase(), u.id);
      if (users.length < 1000) break;
    }
    return known;
  };

  let created = 0;
  let linked = 0;
  const problems: string[] = [];
  await pool(students, 6, async (s) => {
    try {
      let userId = mapped.get(s.capId);
      let isNew = false;
      if (!userId) {
        const made = await db.auth.admin.createUser({ email: emailFor(s.capId), password: passwordFor(s.capId), email_confirm: true, user_metadata: { full_name: titleName(s.name) } });
        if (made.error || !made.data.user) {
          userId = (await loadKnown()).get(emailFor(s.capId));
          if (!userId) throw new Error(made.error?.message ?? 'could not create the user');
        } else {
          userId = made.data.user.id;
          isNew = true;
        }
        const map = await db.from('student_login_ids').insert({ cap_id: s.capId, user_id: userId });
        if (map.error && map.error.code !== '23505') throw new Error(`map ${s.capId}: ${map.error.message}`);
        created++;
      } else if (resetPasswords) {
        const r = await db.auth.admin.updateUserById(userId, { password: passwordFor(s.capId) });
        if (r.error) throw new Error(`password ${s.capId}: ${r.error.message}`);
      }
      // link the login to the record's workspace (does nothing when it is already linked to this user)
      const link = await db.rpc('register_workspace', { p_user: userId, p_cap_id: s.capId, p_demo: true });
      if (link.error) throw new Error(`link ${s.capId}: ${link.error.message}`);
      if (isNew) linked++;
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
  });
  note('student logins', created, students.length - created);
  if (problems.length) {
    console.error(`\n${problems.length} login(s) failed, for example: ${problems[0]}`);
    console.error('Run "npm run db:seed" again: it continues where it stopped.');
    process.exitCode = 1;
  }
  void linked;
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
    // ---- round-1 allotment (same steps as the engine). All 500 are always passed in so the result does not
    // depend on which ones happen to be new.
    const result = round1(courses.map((c) => ({ seats: c.demo_seats })), students);
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
    // A workspace that already has events is left exactly as it is, so a rerun after a crash completes the
    // work and a rerun never overwrites what somebody changed.
    const withEvents = new Set<string>();
    for (const part of chunk([...ws.values()].map((w) => w.id), 100)) {
      for (const e of must<{ workspace_id: string }[]>('read events', await db.from('workflow_events').select('workspace_id').in('workspace_id', part))) withEvents.add(e.workspace_id);
    }
    const todo = students.filter((s) => {
      const w = ws.get(s.capId);
      return w && rec.has(s.capId) && !withEvents.has(w.id);
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

  await createLogins(db, students.map((s) => ({ capId: s.capId, name: s.name })), note);

  console.log(`Seed finished (${DEMO_COUNT} fictional records ${capIdFor(1)} - ${capIdFor(DEMO_COUNT)}).`);
  for (const [k, v] of Object.entries(stats)) console.log(`  ${k.padEnd(22)} inserted ${String(v.inserted).padStart(5)}   already there ${String(v.skipped).padStart(5)}`);
}

main().catch((e) => fail(`Seed failed: ${e instanceof Error ? e.message : String(e)}`));
