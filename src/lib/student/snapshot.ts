import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRecordSource, type CapRecord } from '@/lib/records/source';
import type { Stage } from '@/lib/stages';

export type Course = { id: string; code: string; college_name: string; city: string; branch: string; demo_seats: number; is_synthetic: boolean };

export type StudentState =
  | 'linked' // verified link to an admission record
  | 'record_unavailable' // workspace exists, no record linked yet
  | 'pending_verification' // CAP ID matches a record, staff must approve the claim
  | 'no_workspace';

export type StudentSnapshot = {
  userId: string;
  fullName: string;
  capId: string | null;
  state: StudentState;
  workspace: { id: string; stage: Stage; isSynthetic: boolean } | null;
  record: (CapRecord & { course: Course | null }) | null;
  preferences: { position: number; course: Course }[];
  documents: { code: string; title: string; note: string | null; status: string; staffNote: string | null }[];
  history: { id: string; capRound: number; eventType: string; course: Course | null; prefNo: number | null; remark: string | null; createdAt: string }[];
  events: { id: string; fromStage: string | null; toStage: string; note: string | null; createdAt: string }[];
  appointments: { id: string; date: string; slotMinutes: number; purpose: string; status: string }[];
  notifications: { id: string; title: string; body: string | null; kind: string; isRead: boolean; createdAt: string }[];
  supportRequests: { id: string; subject: string; status: string; createdAt: string }[];
  linkRequest: { id: string; status: string; reviewNote: string | null; createdAt: string } | null;
  rounds: { round: number; label: string; allotmentDate: string | null; reportingDeadline: string | null }[];
};

function fail(what: string, message: string): never {
  throw new Error(`Could not load ${what}: ${message}`);
}

/**
 * Loads everything the signed-in student has saved. `db` MUST be the student's own session client: Row Level
 * Security then guarantees that only this student's rows come back, whatever ids are used here. The user id
 * comes from the verified session, not from the browser.
 */
export async function loadStudentSnapshot(db: SupabaseClient, userId: string, fullName: string): Promise<StudentSnapshot> {
  const loginId = await db.from('student_login_ids').select('cap_id').eq('user_id', userId).maybeSingle();
  if (loginId.error) fail('login id', loginId.error.message);

  const ws = await db.from('admission_workspaces').select('id, cap_id, workflow_stage, cap_record_id, is_synthetic, record_state').eq('user_id', userId).maybeSingle();
  if (ws.error) fail('workspace', ws.error.message);

  const reqs = await db.from('record_link_requests').select('id, status, review_note, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1);
  if (reqs.error) fail('link request', reqs.error.message);
  const latestRequest = (reqs.data ?? [])[0] ?? null;

  const notes = await db.from('notifications').select('id, title, body, kind, is_read, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
  if (notes.error) fail('notifications', notes.error.message);

  const settings = await db.from('app_settings').select('value').eq('key', 'cap_rounds').maybeSingle();
  if (settings.error) fail('settings', settings.error.message);
  const rounds = Array.isArray(settings.data?.value)
    ? (settings.data!.value as { round: number; label: string; allotment_date?: string; reporting_deadline?: string }[]).map((r) => ({
        round: r.round,
        label: r.label,
        allotmentDate: r.allotment_date ?? null,
        reportingDeadline: r.reporting_deadline ?? null,
      }))
    : [];

  const base = {
    userId,
    fullName,
    capId: (loginId.data?.cap_id as string | undefined) ?? null,
    notifications: (notes.data ?? []).map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, isRead: n.is_read, createdAt: n.created_at })),
    rounds,
    linkRequest: latestRequest ? { id: latestRequest.id, status: latestRequest.status, reviewNote: latestRequest.review_note, createdAt: latestRequest.created_at } : null,
  };

  const empty = { workspace: null, record: null, preferences: [], documents: [], history: [], events: [], appointments: [], supportRequests: [] };

  if (!ws.data) {
    const pending = latestRequest?.status === 'pending';
    return { ...base, ...empty, state: pending ? 'pending_verification' : 'no_workspace' };
  }

  const workspaceId = ws.data.id as string;
  const courses = await db.from('college_courses').select('id, code, college_name, city, branch, demo_seats, is_synthetic');
  if (courses.error) fail('courses', courses.error.message);
  const courseById = new Map<string, Course>((courses.data ?? []).map((c) => [c.id as string, c as Course]));

  const prefs = await db.from('student_preferences').select('position, course_id').eq('workspace_id', workspaceId).order('position', { ascending: true });
  if (prefs.error) fail('preferences', prefs.error.message);

  const docs = await db.from('document_checklists').select('doc_code, status, staff_note').eq('workspace_id', workspaceId);
  if (docs.error) fail('documents', docs.error.message);
  const types = await db.from('document_types').select('code, title, note, sort_order').order('sort_order', { ascending: true });
  if (types.error) fail('document types', types.error.message);
  const docByCode = new Map((docs.data ?? []).map((d) => [d.doc_code as string, d]));

  const events = await db.from('workflow_events').select('id, from_stage, to_stage, note, created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: true });
  if (events.error) fail('workflow events', events.error.message);

  const appts = await db.from('appointments').select('id, scheduled_date, slot_minutes, purpose, status').eq('workspace_id', workspaceId).order('scheduled_date', { ascending: true });
  if (appts.error) fail('appointments', appts.error.message);

  const support = await db.from('service_queue_items').select('id, subject, status, created_at').eq('workspace_id', workspaceId).eq('kind', 'support').order('created_at', { ascending: false }).limit(10);
  if (support.error) fail('support requests', support.error.message);

  let record: StudentSnapshot['record'] = null;
  let history: StudentSnapshot['history'] = [];
  if (ws.data.cap_record_id) {
    // the record is read through the replaceable data-source layer, with the student's own client
    const found = await getRecordSource(db).getById(ws.data.cap_record_id as string);
    if (found) {
      record = { ...found, course: found.allotted_course_id ? courseById.get(found.allotted_course_id) ?? null : null };
      const h = await db.from('allotment_history').select('id, cap_round, event_type, course_id, pref_no, remark, created_at').eq('cap_record_id', found.id).order('created_at', { ascending: true });
      if (h.error) fail('allotment history', h.error.message);
      history = (h.data ?? []).map((x) => ({
        id: x.id, capRound: x.cap_round, eventType: x.event_type, course: x.course_id ? courseById.get(x.course_id) ?? null : null,
        prefNo: x.pref_no, remark: x.remark, createdAt: x.created_at,
      }));
    }
  }

  return {
    ...base,
    state: record ? 'linked' : 'record_unavailable',
    workspace: { id: workspaceId, stage: ws.data.workflow_stage as Stage, isSynthetic: Boolean(ws.data.is_synthetic) },
    record,
    preferences: (prefs.data ?? []).flatMap((p) => {
      const course = courseById.get(p.course_id as string);
      return course ? [{ position: p.position as number, course }] : [];
    }),
    documents: (types.data ?? []).map((t) => {
      const d = docByCode.get(t.code as string);
      return { code: t.code as string, title: t.title as string, note: (t.note as string | null) ?? null, status: (d?.status as string) ?? 'not_started', staffNote: (d?.staff_note as string | null) ?? null };
    }),
    history,
    events: (events.data ?? []).map((e) => ({ id: e.id, fromStage: e.from_stage, toStage: e.to_stage, note: e.note, createdAt: e.created_at })),
    appointments: (appts.data ?? []).map((a) => ({ id: a.id, date: a.scheduled_date, slotMinutes: a.slot_minutes, purpose: a.purpose, status: a.status })),
    supportRequests: (support.data ?? []).map((s) => ({ id: s.id, subject: s.subject, status: s.status, createdAt: s.created_at })),
  };
}

export async function listCourses(db: SupabaseClient): Promise<Course[]> {
  const { data, error } = await db.from('college_courses').select('id, code, college_name, city, branch, demo_seats, is_synthetic').order('college_name').order('branch');
  if (error) fail('courses', error.message);
  return (data ?? []) as Course[];
}
