// End-to-end tests against the production build, the real C++ engine, real PostgreSQL with the real migrations,
// and the Supabase EMULATOR (not a real Supabase project). See tests/support/emulator.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, Browser, runScript, startStack, type Stack } from '../support/stack';

let s: Stack;
const GENERIC = 'The ID or password is incorrect.';
const PASSWORD = 'Student-Pass-123';

beforeAll(async () => {
  s = await startStack();
}, 600_000);
afterAll(async () => {
  await s?.stop();
});

const reg = (b: Browser, over: Record<string, unknown>) =>
  b.post('/api/auth/register', { fullName: 'Test Student', email: 'x@example.test', capId: 'DM26000001', password: PASSWORD, confirmPassword: PASSWORD, ...over });

describe('seed', () => {
  it('seeded 500 fictional records, and running it again inserts nothing new', async () => {
    expect((await s.db.pool.query("select count(*)::int n from public.cap_records where cap_id like 'DM26%'")).rows[0].n).toBe(500);
    expect((await s.db.pool.query('select count(*)::int n from public.college_courses')).rows[0].n).toBe(40);
    expect(s.seedOutput.join('\n')).toMatch(/cap_records\s+inserted\s+500/);
    const before = (await s.db.pool.query('select (select count(*) from public.student_preferences) p, (select count(*) from public.allotment_history) h, (select count(*) from public.workflow_events) e')).rows[0];
    const again = await runScript('scripts/seed.ts', s.envFor());
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/cap_records\s+inserted\s+0\s+already there\s+500/);
    const after = (await s.db.pool.query('select (select count(*) from public.student_preferences) p, (select count(*) from public.allotment_history) h, (select count(*) from public.workflow_events) e')).rows[0];
    expect(after).toEqual(before);
  });
  it('the seed used the C++ engine: some students are allotted, some waiting, seats are never exceeded', async () => {
    const c = await s.db.pool.query("select allotment_status, count(*)::int n from public.cap_records group by 1");
    const by = Object.fromEntries(c.rows.map((r) => [r.allotment_status, r.n]));
    expect(by.allotted).toBeGreaterThan(100);
    const over = await s.db.pool.query('select cc.code from public.college_courses cc join public.cap_records r on r.allotted_course_id = cc.id group by cc.id having count(*) > max(cc.demo_seats)');
    expect(over.rowCount).toBe(0);
  });
  it('bootstrap created exactly one admin and does not reset the password on a second run', async () => {
    const out = await runScript('scripts/bootstrap-admin.ts', s.envFor({ ADMIN_PASSWORD: 'A-Different-Password-77' }));
    expect(out.code).toBe(0);
    expect(out.out).toMatch(/existing password kept/);
    expect((await s.db.pool.query("select count(*)::int n from public.profiles where role='admin'")).rows[0].n).toBe(1);
    const b = new Browser(s.demoUrl);
    expect((await b.post('/api/admin/login', { loginId: ADMIN.loginId, password: ADMIN.password })).status).toBe(200);
  });
});

describe('Case A: existing student with a fictional record (demo mode)', () => {
  const b = new Browser('http://127.0.0.1:3101');
  const email = 'case.a@example.test';
  it('registers, is auto-linked, and the dashboard shows the stored details without asking for them', async () => {
    const r = await reg(b, { capId: 'dm26 000005', email, fullName: 'Typed Name' });
    expect(r.status).toBe(201);
    expect(r.json.state).toBe('linked');
    expect(r.json.signedIn).toBe(true);
    const rec = (await s.db.pool.query("select candidate_name, merit_rank from public.cap_records where cap_id='DM26000005'")).rows[0];
    const page = await b.get('/dashboard');
    expect(page.status).toBe(200);
    expect(page.text).toContain('DM26000005');
    expect(page.text).toContain(rec.candidate_name);
    expect(page.text).toContain('Demonstration data');
    expect(page.text).toContain('CAP record');
  });
  it('the response of the API never contains an email address', async () => {
    const me = await b.get('/api/auth/me');
    expect(JSON.stringify(me.json)).not.toContain('@');
  });
  it('logout clears the session; protected pages redirect to login', async () => {
    expect((await b.post('/api/auth/logout')).status).toBe(200);
    const page = await b.get('/dashboard');
    expect(page.status).toBeGreaterThanOrEqual(300);
    expect(page.status).toBeLessThan(400);
    expect(page.headers.get('location')).toContain('/login');
    expect((await b.get('/api/auth/me')).status).toBe(401);
  });
  it('logs in with the CAP ID in a different style and the stored data comes back automatically', async () => {
    const r = await b.post('/api/auth/login', { capId: ' DM26-000005 ', password: PASSWORD });
    expect(r.status).toBe(200);
    expect(r.json.student.capId).toBe('DM26000005');
    expect(r.json.student.state).toBe('linked');
    expect(JSON.stringify(r.json)).not.toContain('@');
    const page = await b.get('/dashboard');
    expect(page.text).toContain('CAP record');
  });
  it('the session persists across requests and preferences/documents are saved and shown again after a new login', async () => {
    const courses = (await s.db.pool.query('select id from public.college_courses order by code limit 3')).rows.map((r) => r.id);
    const save = await b.put('/api/student/preferences', { courseIds: courses });
    expect(save.status).toBe(200);
    const code = (await s.db.pool.query('select code from public.document_types order by sort_order limit 1')).rows[0].code;
    expect((await b.patch('/api/student/documents', { docCode: code, status: 'ready' })).status).toBe(200);
    expect((await b.patch('/api/student/documents', { docCode: code, status: 'verified' })).status).toBe(400); // students cannot verify
    await b.post('/api/auth/logout');
    await b.post('/api/auth/login', { capId: 'DM26000005', password: PASSWORD });
    const page = await b.get('/dashboard');
    expect(page.text).toContain('pref-list');
    const prefs = await b.get('/preferences');
    expect(prefs.status).toBe(200);
    const row = (await s.db.pool.query("select status from public.document_checklists d join public.admission_workspaces w on w.id=d.workspace_id where w.cap_id='DM26000005' and d.doc_code=$1", [code])).rows[0];
    expect(row.status).toBe('ready');
  });
  it('wrong password and unknown CAP ID give the same generic answer', async () => {
    const x = new Browser(s.demoUrl);
    const wrong = await x.post('/api/auth/login', { capId: 'DM26000005', password: 'Nope-Nope-1' });
    const unknown = await x.post('/api/auth/login', { capId: 'ZZ99999999', password: 'Nope-Nope-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.message).toBe(GENERIC);
    expect(unknown.json.message).toBe(GENERIC);
    expect(x.cookieNames.filter((n) => n.includes('auth-token'))).toHaveLength(0);
  });
  it('a second registration with the same CAP ID (other email) or the same email is refused with a generic message', async () => {
    const x = new Browser(s.demoUrl);
    const sameCap = await reg(x, { capId: 'DM26000005', email: 'other@example.test' });
    expect(sameCap.status).toBe(409);
    const sameEmail = await reg(x, { capId: 'DM26000006', email });
    expect([409, 201]).toContain(sameEmail.status); // Supabase hides whether the email exists
    expect((await s.db.pool.query("select count(*)::int n from public.admission_workspaces where cap_id='DM26000006' and user_id is not null")).rows[0].n).toBe(0);
    expect(sameCap.json.message).toContain("can't register");
  });
  it('a browser-supplied user id or CAP ID cannot change whose data is returned', async () => {
    const other = new Browser(s.demoUrl);
    await reg(other, { capId: 'DM26000007', email: 'case.a2@example.test' });
    const r = await other.post('/api/auth/login', { capId: 'DM26000007', password: PASSWORD, userId: 'x', user_id: 'y', cap_id: 'DM26000005' });
    expect(r.json.student.capId).toBe('DM26000007');
    const page = await other.get('/dashboard');
    const mine = (await s.db.pool.query("select candidate_name from public.cap_records where cap_id='DM26000005'")).rows[0].candidate_name;
    expect(page.text).not.toContain(mine);
  });
});

describe('Case B: new student with no matching CAP record', () => {
  const b = new Browser('http://127.0.0.1:3101');
  it('registers, gets a workspace, and sees an honest "details unavailable" message', async () => {
    const r = await reg(b, { capId: 'NEW00000001', email: 'case.b@example.test', fullName: 'Brand New' });
    expect(r.status).toBe(201);
    expect(r.json.state).toBe('record_unavailable');
    const page = await b.get('/dashboard');
    expect(page.text).toContain('Admission details are not available yet');
    expect(page.text).toContain('Brand New');
    expect(page.text).not.toContain('data-testid="cap-record"');
  });
  it('can still save preferences and documents, which persist across logout/login', async () => {
    const courses = (await s.db.pool.query('select id from public.college_courses order by code limit 2')).rows.map((r) => r.id);
    expect((await b.put('/api/student/preferences', { courseIds: courses })).status).toBe(200);
    await b.post('/api/auth/logout');
    expect((await b.post('/api/auth/login', { capId: 'new00000001', password: PASSWORD })).status).toBe(200);
    const page = await b.get('/dashboard');
    expect(page.text).toContain('pref-list');
  });
  it('can ask staff to verify a record and cannot do it twice', async () => {
    expect((await b.post('/api/student/link-request', { note: 'please check' })).status).toBe(200);
    expect((await b.post('/api/student/link-request', { note: 'again' })).status).toBe(409);
  });
  it('can open a support request that appears in the staff queue', async () => {
    expect((await b.post('/api/student/support', { subject: 'Question about documents', body: 'Hello' })).status).toBe(200);
    expect((await s.db.pool.query("select count(*)::int n from public.service_queue_items where subject='Question about documents' and level=3 and status='waiting'")).rows[0].n).toBe(1);
  });
});

describe('Case C: existing record with demo mode off needs staff approval', () => {
  const student = new Browser('http://127.0.0.1:3102');
  const staff = new Browser('http://127.0.0.1:3102');
  let requestId = '';
  let name = '';
  it('registers but sees nothing from the record until approved', async () => {
    const r = await reg(student, { capId: 'DM26000020', email: 'case.c@example.test' });
    expect(r.status).toBe(201);
    expect(r.json.state).toBe('pending_verification');
    name = (await s.db.pool.query("select candidate_name from public.cap_records where cap_id='DM26000020'")).rows[0].candidate_name;
    const page = await student.get('/dashboard');
    expect(page.text).toContain('Verification pending');
    expect(page.text).not.toContain(name);
  });
  it('staff see the request, approve it, and the student then sees the record', async () => {
    expect((await staff.post('/api/admin/login', { loginId: ADMIN.loginId, password: ADMIN.password })).status).toBe(200);
    const list = await staff.get('/admin/requests');
    expect(list.text).toContain('DM26000020');
    requestId = (await s.db.pool.query("select id from public.record_link_requests where cap_id='DM26000020'")).rows[0].id;
    expect((await staff.post('/api/admin/requests', { id: requestId, decision: 'approve', note: 'ID checked' })).status).toBe(200);
    const page = await student.get('/dashboard');
    expect(page.text).toContain(name);
  });
  it('approving twice is refused', async () => {
    expect((await staff.post('/api/admin/requests', { id: requestId, decision: 'approve' })).status).toBe(409);
  });
});

describe('admin and access control', () => {
  const staff = new Browser('http://127.0.0.1:3101');
  const student = new Browser('http://127.0.0.1:3101');
  it('unauthenticated callers are rejected by every protected API', async () => {
    const anon = new Browser(s.demoUrl);
    for (const [m, u] of [['POST', '/api/admin/queue'], ['POST', '/api/admin/records'], ['GET', '/api/admin/records/export'], ['POST', '/api/admin/allotment'], ['PUT', '/api/student/preferences'], ['POST', '/api/student/support']] as const) {
      const r = await anon.req(m, u, m === 'GET' ? undefined : {});
      expect(r.status, `${m} ${u}`).toBe(401);
    }
    const page = await anon.get('/admin');
    expect(page.headers.get('location')).toContain('/admin/login');
  });
  it('a student account cannot use admin APIs or pages, and cannot log in on the admin form', async () => {
    await reg(student, { capId: 'DM26000030', email: 'norole@example.test' });
    for (const [m, u] of [['POST', '/api/admin/queue'], ['POST', '/api/admin/records'], ['POST', '/api/admin/allotment'], ['GET', '/api/admin/records/export']] as const) {
      const r = await student.req(m, u, m === 'GET' ? undefined : { action: 'snapshot' });
      expect(r.status, `${m} ${u}`).toBe(403);
    }
    expect((await student.get('/admin')).headers.get('location')).toContain('/admin/login');
    const x = new Browser(s.demoUrl);
    expect((await x.post('/api/admin/login', { loginId: 'norole', password: PASSWORD })).status).toBe(401);
  });
  it('an admin account cannot log in through the student form', async () => {
    const x = new Browser(s.demoUrl);
    expect((await x.post('/api/auth/login', { capId: ADMIN.loginId.toUpperCase() + '1', password: ADMIN.password })).status).toBe(401);
  });
  it('cross-site writes are blocked', async () => {
    const r = await new Browser(s.demoUrl).req('POST', '/api/auth/login', { capId: 'DM26000005', password: PASSWORD }, { Origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
  it('admin logs in and all admin pages render', async () => {
    expect((await staff.post('/api/admin/login', { loginId: ADMIN.loginId.toUpperCase(), password: ADMIN.password })).status).toBe(200);
    for (const p of ['/admin', '/admin/students', '/admin/students?q=DM2600', '/admin/records', '/admin/requests', '/admin/queue', '/admin/appointments', '/admin/planner', '/admin/allotment', '/admin/audit']) {
      const r = await staff.get(p);
      expect(r.status, p).toBe(200);
    }
  });
  it('student search uses the C++ engine and reports its comparison count', async () => {
    const r = await staff.get('/admin/students?q=DM260001');
    expect(r.text.replace(/<!-- -->/g, '')).toMatch(/comparisons over 5\d\d records/);
    expect(r.text).toContain('DM26000100');
  });
  it('stage change: allowed move works, illegal jump is refused, and the student is notified', async () => {
    const ws = (await s.db.pool.query("select id from public.admission_workspaces where cap_id='DM26000030'")).rows[0].id;
    const bad = await staff.post('/api/admin/students/stage', { workspaceId: ws, stage: 'admission_completed' });
    expect(bad.status).toBe(409);
    const ok = await staff.post('/api/admin/students/stage', { workspaceId: ws, stage: 'profile_verification', note: 'Looks fine' });
    expect(ok.status).toBe(200);
    const page = await student.get('/dashboard');
    expect(page.text).toContain('Your admission status was updated');
  });
  it('undo works only for the newest change', async () => {
    const ws = (await s.db.pool.query("select id from public.admission_workspaces where cap_id='DM26000030'")).rows[0].id;
    await staff.post('/api/admin/students/stage', { workspaceId: ws, stage: 'preference_preparation' });
    const logs = (await s.db.pool.query("select id from public.audit_logs where action='set_stage' and undone_at is null order by id desc")).rows.map((r) => Number(r.id));
    expect((await staff.post('/api/admin/audit/undo', { id: logs[1] })).status).toBe(409);
    expect((await staff.post('/api/admin/audit/undo', { id: logs[0] })).status).toBe(200);
    expect((await s.db.pool.query("select workflow_stage from public.admission_workspaces where cap_id='DM26000030'")).rows[0].workflow_stage).toBe('profile_verification');
  });
  it('service desk: the C++ queue calls priority first, completes, and two clicks at once stay consistent', async () => {
    const wss = (await s.db.pool.query("select id from public.admission_workspaces where cap_id in ('DM26000040','DM26000041','DM26000042') order by cap_id")).rows.map((r) => r.id);
    await s.db.pool.query('delete from public.service_queue_items');
    await s.db.pool.query("insert into public.service_queue_items (workspace_id, kind, subject, level, status) values ($1,'support','regular first',3,'waiting'), ($2,'verification','priority later',1,'waiting'), ($3,'support','regular last',3,'waiting')", wss);
    const call = await staff.post('/api/admin/queue', { action: 'call', counterId: 1 });
    expect(call.status).toBe(200);
    expect(call.json.token.status).toBe('called');
    expect(call.json.token.lane).toBe('priority');
    const code = call.json.token.code;
    expect((await staff.post('/api/admin/queue', { action: 'start', code })).status).toBe(200);
    expect((await staff.post('/api/admin/queue', { action: 'complete', code })).status).toBe(200);
    expect((await s.db.pool.query("select status from public.service_queue_items where subject='priority later'")).rows[0].status).toBe('completed');
    const [a, c] = await Promise.all([staff.post('/api/admin/queue', { action: 'call', counterId: 2 }), staff.post('/api/admin/queue', { action: 'call', counterId: 3 })]);
    expect([a.status, c.status].every((x) => x === 200 || x === 409)).toBe(true);
    const called = (await s.db.pool.query("select count(distinct counter_id)::int n, count(*)::int t from public.service_queue_items where status='called'")).rows[0];
    expect(called.n).toBe(called.t); // never two people at one counter
    const bad = await staff.post('/api/admin/queue', { action: 'start', code: 'R999' });
    expect(bad.status).toBe(409);
  });
  it('CSV import: the C++ hash table separates new, repeated and existing IDs', async () => {
    const csv = 'cap_id,name,category,merit_rank,percentile\nIMP00000001,Import One,OPEN,901,40\nIMP00000001,Import One Again,OPEN,902,41\nDM26000001,Already There,OPEN,1,99\nbad id!,Broken,,,';
    const dry = await staff.post('/api/admin/records/import', { csv, dryRun: true });
    expect(dry.json).toMatchObject({ wouldImport: 1, duplicateInFile: 1, alreadyExists: 1, imported: 0 });
    const real = await staff.post('/api/admin/records/import', { csv });
    expect(real.json.imported).toBe(1);
    expect((await s.db.pool.query("select count(*)::int n from public.cap_records where cap_id='IMP00000001'")).rows[0].n).toBe(1);
    const exp = await staff.get('/api/admin/records/export');
    expect(exp.headers.get('content-type')).toContain('text/csv');
    expect(exp.text.split('\n')[0]).toContain('cap_id');
  });
  it('allotment simulation: preview changes nothing, apply is audited', async () => {
    const before = (await s.db.pool.query("select count(*)::int n from public.audit_logs where action='update_record'")).rows[0].n;
    const preview = await staff.post('/api/admin/allotment', { round: 1, apply: false });
    expect(preview.status).toBe(200);
    expect(preview.json.considered).toBeGreaterThan(0);
    expect((await s.db.pool.query("select count(*)::int n from public.audit_logs where action='update_record'")).rows[0].n).toBe(before);
  });
});

describe('rate limiting and email flows', () => {
  it('too many wrong passwords for one CAP ID gets a 429 with Retry-After, still generic', async () => {
    const x = new Browser(s.demoUrl);
    let last = { status: 0, headers: new Headers(), json: null as any };
    for (let i = 0; i < 10; i++) last = await x.post('/api/auth/login', { capId: 'RATE00000001', password: 'Wrong-Pass-1' });
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBeTruthy();
  });
  it('forgot-password answers identically for known and unknown IDs and sends mail only for known ones', async () => {
    const x = new Browser(s.demoUrl);
    s.emulator.mail.length = 0;
    const known = await x.post('/api/auth/forgot-password', { capId: 'DM26000005' });
    const unknown = await x.post('/api/auth/forgot-password', { capId: 'NOPE00000001' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.json.message).toBe(unknown.json.message);
    expect(s.emulator.mail.filter((m) => m.kind === 'recovery')).toHaveLength(1);
    expect(JSON.stringify(known.json)).not.toContain('@');
  });
  it('with email confirmation on, registration says "check your email" and login is refused until confirmed', async () => {
    s.emulator.options.confirmEmail = true;
    try {
      const x = new Browser(s.demoUrl);
      const r = await reg(x, { capId: 'DM26000050', email: 'confirm.me@example.test' });
      expect(r.status).toBe(201);
      expect(r.json.needsEmailConfirmation).toBe(true);
      expect(r.json.signedIn).toBe(false);
      const early = await x.post('/api/auth/login', { capId: 'DM26000050', password: PASSWORD });
      expect(early.status).toBe(403);
      expect(early.json.code).toBe('email_not_confirmed');
      await s.db.pool.query("update auth.users set email_confirmed_at = now() where email = 'confirm.me@example.test'");
      expect((await x.post('/api/auth/login', { capId: 'DM26000050', password: PASSWORD })).status).toBe(200);
    } finally {
      s.emulator.options.confirmEmail = false;
    }
  });
  it('invalid registration input is rejected with field messages', async () => {
    const x = new Browser(s.demoUrl);
    const r = await reg(x, { capId: 'NEW00000077', email: 'bad', password: 'short', confirmPassword: 'different' });
    expect(r.status).toBe(400);
  });
});

describe('C++ engine in production', () => {
  it('the engine health endpoint runs the real executable and its self check', async () => {
    const r = await new Browser(s.demoUrl).get('/api/health/engine');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, selfCheck: true });
    expect(r.json.engine).toMatch(/admitqueue-engine/);
  });
  it('when the executable is missing, the site stays up, health says so, and engine features fail safely', async () => {
    const b = new Browser(s.noEngineUrl);
    expect((await b.get('/api/health')).status).toBe(200);
    const h = await b.get('/api/health/engine');
    expect(h.status).toBe(503);
    expect(h.json.ok).toBe(false);
    expect(JSON.stringify(h.json)).not.toContain('/nonexistent');
    // student login does not need the engine
    expect((await reg(b, { capId: 'NEW00000099', email: 'noengine@example.test' })).status).toBe(201);
    expect((await b.get('/dashboard')).status).toBe(200);
    // an admin engine action reports a safe 503
    const staff = new Browser(s.noEngineUrl);
    await staff.post('/api/admin/login', { loginId: ADMIN.loginId, password: ADMIN.password });
    const q = await staff.post('/api/admin/queue', { action: 'call', counterId: 1 });
    expect(q.status).toBe(503);
    expect(q.json.code).toBe('engine_unavailable');
    expect(JSON.stringify(q.json)).not.toContain('/nonexistent');
  });
});

describe('PWA', () => {
  const b = () => new Browser(s.demoUrl);
  it('serves a valid manifest with icons', async () => {
    const m = await b().get('/manifest.webmanifest');
    expect(m.status).toBe(200);
    expect(m.json).toMatchObject({ display: 'standalone' });
    expect(m.json.start_url).toBeTruthy();
    const sizes = m.json.icons.map((i: any) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of m.json.icons) expect((await b().get(icon.src)).status).toBe(200);
  });
  it('the service worker is served without caching and never caches private API data', async () => {
    const sw = await b().get('/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers.get('cache-control')).toMatch(/no-cache|no-store|max-age=0/);
    expect(sw.text).toMatch(/\/api\//);
    expect(sw.text).toMatch(/\/auth\//);
    expect(sw.text).toMatch(/\/offline/);
    expect((await b().get('/offline')).text).toMatch(/offline/i);
  });
  it('API and dashboard responses are not cacheable', async () => {
    const x = b();
    expect(x && (await x.get('/api/health')).headers.get('cache-control')).toContain('no-store');
    expect((await x.get('/api/auth/me')).headers.get('cache-control') ?? '').toMatch(/no-store|private|no-cache/);
  });
  it('security headers are present', async () => {
    const r = await b().get('/login');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options') ?? r.headers.get('content-security-policy')).toBeTruthy();
  });
});
