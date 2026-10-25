// Tests of the REAL migrations on a REAL PostgreSQL (roles/auth schema are minimal stand-ins, see supabase-stub.sql).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { STAGES, stageTransitionAllowed } from '../../src/lib/stages';
import { addUser, asRole, createTestDb } from '../support/db';

let db: Awaited<ReturnType<typeof createTestDb>>;
let pool: pg.Pool;
let admin: string, alice: string, bob: string;
let aliceWs: string, bobWs: string;
let course: string;

async function rec(capId: string, name: string, rank = 10) {
  const r = await pool.query(
    `insert into public.cap_records (cap_id, candidate_name, merit_rank, is_synthetic, verification_status) values ($1,$2,$3,true,'verified') returning id`,
    [capId, name, rank],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  db = await createTestDb('aq_db_tests');
  pool = db.pool;
  admin = await addUser(pool, 'root@example.com', 'admin', 'Admin');
  alice = await addUser(pool, 'alice@example.com', 'student', 'Alice');
  bob = await addUser(pool, 'bob@example.com', 'student', 'Bob');
  course = (await pool.query("insert into public.college_courses (code, college_name, city, branch, demo_seats) values ('T-1','Test College','Town','CE',5) returning id")).rows[0].id;
  await rec('DM26000001', 'Alice Record');
  await rec('DM26000002', 'Bob Record');
  await pool.query("insert into public.student_login_ids (cap_id, user_id) values ('DM26000001', $1), ('DM26000002', $2)", [alice, bob]);
  aliceWs = (await pool.query("select (public.register_workspace($1,'DM26000001',true) ->> 'workspace_id')::uuid as id", [alice])).rows[0].id;
  bobWs = (await pool.query("select (public.register_workspace($1,'DM26000002',true) ->> 'workspace_id')::uuid as id", [bob])).rows[0].id;
});
afterAll(async () => {
  await db?.drop();
});

describe('schema basics', () => {
  it('profiles are created by trigger and always start as students', async () => {
    const r = await pool.query('select role from public.profiles where id = $1', [alice]);
    expect(r.rows[0].role).toBe('student');
  });
  it('a workspace can only point at the record with the same CAP ID', async () => {
    const other = (await pool.query("select id from public.cap_records where cap_id = 'DM26000002'")).rows[0].id;
    await expect(pool.query('update public.admission_workspaces set cap_record_id = $1 where id = $2', [other, aliceWs])).rejects.toThrow();
  });
  it('seeded document types exist and every workspace has a full checklist', async () => {
    expect((await pool.query('select count(*)::int n from public.document_types')).rows[0].n).toBe(8);
    expect((await pool.query('select count(*)::int n from public.document_checklists where workspace_id = $1', [aliceWs])).rows[0].n).toBe(8);
  });
});

describe('registration function (Case A / B / C and no double claim)', () => {
  it('Case A: demo mode links a fictional unclaimed record atomically', async () => {
    const u = await addUser(pool, 'carol@example.com');
    await rec('DM26000010', 'Carol Record');
    const out = (await pool.query("select public.register_workspace($1,'DM26000010',true) as r", [u])).rows[0].r;
    expect(out.state).toBe('linked');
    const ws = (await pool.query("select user_id, record_state from public.admission_workspaces where cap_id='DM26000010'")).rows[0];
    expect(ws.user_id).toBe(u);
    expect(ws.record_state).toBe('linked');
  });
  it('a second account cannot claim the same CAP ID', async () => {
    const u = await addUser(pool, 'dave@example.com');
    await expect(pool.query("select public.register_workspace($1,'DM26000010',true)", [u])).rejects.toThrow(/cap_id_taken/);
  });
  it('two simultaneous claims: exactly one wins', async () => {
    const u1 = await addUser(pool, 'race1@example.com');
    const u2 = await addUser(pool, 'race2@example.com');
    await rec('DM26000011', 'Race Record');
    const results = await Promise.allSettled([
      pool.query("select public.register_workspace($1,'DM26000011',true)", [u1]),
      pool.query("select public.register_workspace($1,'DM26000011',true)", [u2]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await pool.query("select count(*)::int n from public.admission_workspaces where cap_id='DM26000011' and user_id is not null")).rows[0].n).toBe(1);
  });
  it('Case B: an unknown CAP ID gets a workspace with no record', async () => {
    const u = await addUser(pool, 'erin@example.com');
    const out = (await pool.query("select public.register_workspace($1,'NEW99999999',true) as r", [u])).rows[0].r;
    expect(out.state).toBe('record_unavailable');
    const ws = (await pool.query("select cap_record_id from public.admission_workspaces where cap_id='NEW99999999'")).rows[0];
    expect(ws.cap_record_id).toBeNull();
  });
  it('Case C: with demo mode off an existing record creates a pending request and exposes nothing', async () => {
    const u = await addUser(pool, 'frank@example.com');
    await rec('DM26000012', 'Frank Record');
    const out = (await pool.query("select public.register_workspace($1,'DM26000012',false) as r", [u])).rows[0].r;
    expect(out.state).toBe('pending_verification');
    expect((await pool.query("select user_id from public.admission_workspaces where cap_id='DM26000012'")).rows[0].user_id).toBeNull();
    const seen = await asRole(pool, 'authenticated', u, (c) => c.query('select * from public.cap_records'));
    expect(seen.rowCount).toBe(0);
  });
  it('real (non-synthetic) records are never auto-linked even in demo mode', async () => {
    const u = await addUser(pool, 'gina@example.com');
    await pool.query("insert into public.cap_records (cap_id, candidate_name, is_synthetic) values ('REAL00000001','Real Person',false)");
    const out = (await pool.query("select public.register_workspace($1,'REAL00000001',true) as r", [u])).rows[0].r;
    expect(out.state).toBe('pending_verification');
  });
  it('the registration function is not callable from the browser roles', async () => {
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query("select public.register_workspace($1,'DM26000002',true)", [alice]))).rejects.toThrow(/permission denied/);
    await expect(asRole(pool, 'anon', null, (c) => c.query("select public.register_workspace($1,'DM26000002',true)", [alice]))).rejects.toThrow(/permission denied/);
  });
});

describe('row level security', () => {
  it('a student sees only their own record, workspace and checklist', async () => {
    const recs = await asRole(pool, 'authenticated', alice, (c) => c.query('select cap_id from public.cap_records'));
    expect(recs.rows.map((r) => r.cap_id)).toEqual(['DM26000001']);
    const ws = await asRole(pool, 'authenticated', alice, (c) => c.query('select cap_id from public.admission_workspaces'));
    expect(ws.rows.map((r) => r.cap_id)).toEqual(['DM26000001']);
    const docs = await asRole(pool, 'authenticated', alice, (c) => c.query('select distinct workspace_id from public.document_checklists'));
    expect(docs.rows.map((r) => r.workspace_id)).toEqual([aliceWs]);
  });
  it('a student cannot read another profile or login id', async () => {
    const p = await asRole(pool, 'authenticated', alice, (c) => c.query('select id from public.profiles'));
    expect(p.rows.map((r) => r.id)).toEqual([alice]);
    const l = await asRole(pool, 'authenticated', alice, (c) => c.query('select user_id from public.student_login_ids'));
    expect(l.rows.map((r) => r.user_id)).toEqual([alice]);
  });
  it('anonymous callers see nothing', async () => {
    await expect(asRole(pool, 'anon', null, (c) => c.query('select * from public.cap_records'))).rejects.toThrow(/permission denied/);
    await expect(asRole(pool, 'anon', null, (c) => c.query('select * from public.profiles'))).rejects.toThrow(/permission denied/);
  });
  it('a student cannot change their own role or a record', async () => {
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query("update public.profiles set role='admin' where id=$1", [alice]))).rejects.toThrow(/permission denied/);
    const upd = await asRole(pool, 'authenticated', alice, (c) => c.query("update public.cap_records set candidate_name='Hacked' where cap_id='DM26000001'")).catch(() => null);
    expect(upd === null || upd.rowCount === 0).toBe(true);
    expect((await pool.query("select candidate_name from public.cap_records where cap_id='DM26000001'")).rows[0].candidate_name).toBe('Alice Record');
  });
  it("a student cannot touch another student's preferences or documents", async () => {
    const upd = await asRole(pool, 'authenticated', alice, (c) => c.query("update public.document_checklists set status='ready' where workspace_id=$1", [bobWs]));
    expect(upd.rowCount).toBe(0);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query('insert into public.student_preferences (workspace_id, position, course_id) values ($1,1,$2)', [bobWs, course]))).rejects.toThrow();
  });
  it('a student can mark documents ready but never verified, and cannot edit the staff note', async () => {
    const code = (await pool.query('select code from public.document_types order by sort_order limit 1')).rows[0].code;
    const ok = await asRole(pool, 'authenticated', alice, (c) => c.query("update public.document_checklists set status='ready' where workspace_id=$1 and doc_code=$2", [aliceWs, code]));
    expect(ok.rowCount).toBe(1);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query("update public.document_checklists set status='verified' where workspace_id=$1 and doc_code=$2", [aliceWs, code]))).rejects.toThrow();
    await asRole(pool, 'authenticated', alice, (c) => c.query("update public.document_checklists set staff_note='x' where workspace_id=$1 and doc_code=$2", [aliceWs, code]));
    expect((await pool.query('select staff_note from public.document_checklists where workspace_id=$1 and doc_code=$2', [aliceWs, code])).rows[0].staff_note).toBeNull();
  });
  it('the admin sees everything', async () => {
    const r = await asRole(pool, 'authenticated', admin, (c) => c.query('select count(*)::int n from public.cap_records'));
    expect(r.rows[0].n).toBeGreaterThanOrEqual(2);
  });
  it('admin-only functions refuse students', async () => {
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query("select public.workspace_set_stage($1,'profile_verification')", [aliceWs]))).rejects.toThrow(/not_admin/);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query('select public.apply_queue_change(0, 0, $1::jsonb)', ['[]']))).rejects.toThrow(/not_admin/);
  });
  it('the auth rate-limit table and function are server only', async () => {
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query('select * from public.auth_rate_limits'))).rejects.toThrow(/permission denied/);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query("select public.rate_limit_hit('x',1,60)"))).rejects.toThrow(/permission denied/);
  });
});

describe('preferences', () => {
  it('saves an ordered list and enforces the rules', async () => {
    const out = await asRole(pool, 'authenticated', alice, (c) => c.query('select public.save_preferences($1::uuid[]) as n', [[course]]));
    expect(out.rows[0].n).toBe(1);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query('select public.save_preferences($1::uuid[])', [[course, course]]))).rejects.toThrow(/duplicate_course/);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query('select public.save_preferences($1::uuid[])', [['00000000-0000-0000-0000-000000000001']]))).rejects.toThrow(/unknown_course/);
    const many = Array.from({ length: 11 }, () => course);
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query('select public.save_preferences($1::uuid[])', [many]))).rejects.toThrow(/too_many_preferences/);
  });
});

describe('stage rules', () => {
  it('the TypeScript rule agrees with the SQL rule for every pair', async () => {
    for (const hasAllotment of [false, true]) {
      for (const from of STAGES) {
        for (const to of STAGES) {
          const sql = (await pool.query('select public.stage_transition_allowed($1,$2,$3) as ok', [from, to, hasAllotment])).rows[0].ok;
          expect(stageTransitionAllowed(from, to, hasAllotment), `${from} -> ${to} allot=${hasAllotment}`).toBe(sql);
        }
      }
    }
  });
  it('admin moves a stage, it is audited, notified, and can be undone while unchanged', async () => {
    const out = await asRole(pool, 'authenticated', admin, (c) => c.query("select public.workspace_set_stage($1,'profile_verification','checked') as r", [aliceWs]));
    const auditId = out.rows[0].r.audit_id;
    expect((await pool.query('select workflow_stage from public.admission_workspaces where id=$1', [aliceWs])).rows[0].workflow_stage).toBe('profile_verification');
    expect((await pool.query("select count(*)::int n from public.notifications where user_id=$1 and title like 'Your admission status%'", [alice])).rows[0].n).toBe(1);
    await expect(asRole(pool, 'authenticated', admin, (c) => c.query("select public.workspace_set_stage($1,'admission_completed')", [aliceWs]))).rejects.toThrow(/invalid_transition/);
    await asRole(pool, 'authenticated', admin, (c) => c.query('select public.undo_audit_action($1)', [auditId]));
    expect((await pool.query('select workflow_stage from public.admission_workspaces where id=$1', [aliceWs])).rows[0].workflow_stage).toBe('registration');
    await expect(asRole(pool, 'authenticated', admin, (c) => c.query('select public.undo_audit_action($1)', [auditId]))).rejects.toThrow();
  });
  it('undo is refused when the data changed afterwards', async () => {
    const a1 = (await asRole(pool, 'authenticated', admin, (c) => c.query("select public.workspace_set_stage($1,'profile_verification') as r", [aliceWs]))).rows[0].r.audit_id;
    await asRole(pool, 'authenticated', admin, (c) => c.query("select public.workspace_set_stage($1,'preference_preparation')", [aliceWs]));
    await expect(asRole(pool, 'authenticated', admin, (c) => c.query('select public.undo_audit_action($1)', [a1]))).rejects.toThrow(/changed_since/);
  });
});

describe('record edits and audit', () => {
  it('admin_update_record changes only listed fields and logs before/after', async () => {
    const id = (await pool.query("select id from public.cap_records where cap_id='DM26000002'")).rows[0].id;
    const r = await asRole(pool, 'authenticated', admin, (c) => c.query('select public.admin_update_record($1, $2::jsonb, $3) as r', [id, '{"category":"OBC"}', 'fix']));
    expect(r.rows[0].r.changed).toBe(true);
    const a = (await pool.query("select before_data, after_data from public.audit_logs where action='update_record' order by id desc limit 1")).rows[0];
    expect(a.after_data).toEqual({ category: 'OBC' });
    await expect(asRole(pool, 'authenticated', alice, (c) => c.query("select public.admin_update_record($1, '{}'::jsonb)", [id]))).rejects.toThrow(/not_admin/);
  });
});

describe('support requests and service queue', () => {
  const insert = (ws: string, user: string, subject: string, level: number) =>
    asRole(pool, 'authenticated', user, (c) =>
      c.query("insert into public.service_queue_items (workspace_id, kind, subject, level, status, created_by) values ($1,'support',$2,$3,'waiting',$4)", [ws, subject, level, user]),
    );
  it('a student can open only a plain support request for themselves', async () => {
    await insert(aliceWs, alice, 'Need help', 3);
    await expect(insert(aliceWs, alice, 'Jump the queue', 1)).rejects.toThrow();
    await expect(insert(bobWs, alice, 'For bob', 3)).rejects.toThrow();
  });
  it('apply_queue_change uses optimistic concurrency: a stale version is refused', async () => {
    const item = (await pool.query('select id from public.service_queue_items limit 1')).rows[0].id;
    const v = (await pool.query('select version from public.queue_state')).rows[0].version;
    const changes = JSON.stringify([{ id: item, status: 'called', counter_id: 1 }]);
    const first = await asRole(pool, 'authenticated', admin, (c) => c.query('select public.apply_queue_change($1,$2,$3::jsonb) as ok', [v, 1, changes]));
    expect(first.rows[0].ok).toBe(true);
    const stale = await asRole(pool, 'authenticated', admin, (c) => c.query('select public.apply_queue_change($1,$2,$3::jsonb) as ok', [v, 1, changes]));
    expect(stale.rows[0].ok).toBe(false);
    expect((await pool.query('select status, counter_id from public.service_queue_items where id=$1', [item])).rows[0]).toEqual({ status: 'called', counter_id: 1 });
    expect((await pool.query("select count(*)::int n from public.notifications where user_id=$1 and title='Your request is being handled'", [alice])).rows[0].n).toBe(1);
  });
  it('the database refuses a serving item without a counter', async () => {
    await expect(pool.query("update public.service_queue_items set status='serving', counter_id=null")).rejects.toThrow();
  });
});

describe('link requests', () => {
  it('a student asks, staff approve, and the record becomes visible', async () => {
    const u = await addUser(pool, 'hank@example.com');
    await rec('DM26000020', 'Hank Record');
    await pool.query("select public.register_workspace($1,'DM26000020',false)", [u]);
    const reqId = (await pool.query('select id from public.record_link_requests where user_id=$1', [u])).rows[0].id;
    expect((await asRole(pool, 'authenticated', u, (c) => c.query('select * from public.cap_records'))).rowCount).toBe(0);
    await expect(asRole(pool, 'authenticated', u, (c) => c.query('select public.approve_link_request($1)', [reqId]))).rejects.toThrow(/not_admin/);
    await asRole(pool, 'authenticated', admin, (c) => c.query('select public.approve_link_request($1, $2)', [reqId, 'ID checked']));
    const seen = await asRole(pool, 'authenticated', u, (c) => c.query('select cap_id from public.cap_records'));
    expect(seen.rows.map((r) => r.cap_id)).toEqual(['DM26000020']);
  });
  it('rejecting needs a reason and a reviewed request cannot be reviewed again', async () => {
    const u = await addUser(pool, 'ivy@example.com');
    await rec('DM26000021', 'Ivy Record');
    await pool.query("select public.register_workspace($1,'DM26000021',false)", [u]);
    const reqId = (await pool.query('select id from public.record_link_requests where user_id=$1', [u])).rows[0].id;
    await expect(asRole(pool, 'authenticated', admin, (c) => c.query("select public.reject_link_request($1, '')", [reqId]))).rejects.toThrow(/note_required/);
    await asRole(pool, 'authenticated', admin, (c) => c.query("select public.reject_link_request($1, 'Name does not match')", [reqId]));
    await expect(asRole(pool, 'authenticated', admin, (c) => c.query("select public.reject_link_request($1, 'again')", [reqId]))).rejects.toThrow(/request_not_pending/);
    expect((await asRole(pool, 'authenticated', u, (c) => c.query('select * from public.cap_records'))).rowCount).toBe(0);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit then refuses, with a retry time', async () => {
    const hit = async () => (await pool.query("select public.rate_limit_hit('test:bucket', 3, 600) as r")).rows[0].r;
    expect((await hit()).allowed).toBe(true);
    expect((await hit()).allowed).toBe(true);
    expect((await hit()).allowed).toBe(true);
    const fourth = await hit();
    expect(fourth.allowed).toBe(false);
    expect(fourth.retry_after).toBeGreaterThan(0);
  });
});
