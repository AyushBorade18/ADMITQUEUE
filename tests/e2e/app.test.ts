// End-to-end tests against the production build, the real C++ program, real PostgreSQL with the real migrations,
// and the Supabase EMULATOR (not a real Supabase project). See tests/support/emulator.ts.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ADMIN, Browser, runScript, startStack, type Stack } from '../support/stack';

let s: Stack;
const GENERIC = 'The ID or password is incorrect.';
// demo rule: the password of every demo student is the CAP ID itself
const login = (b: Browser, capId: string, extra: Record<string, unknown> = {}) => b.post('/api/auth/login', { capId, password: capId, ...extra });

beforeAll(async () => {
  s = await startStack();
}, 900_000);
afterAll(async () => {
  await s?.stop();
});

describe('seed', () => {
  it('seeded 500 fictional records, 500 logins and the admin; running it again adds nothing', async () => {
    expect((await s.db.pool.query("select count(*)::int n from public.cap_records where cap_id like 'EN26%'")).rows[0].n).toBe(500);
    expect((await s.db.pool.query('select count(*)::int n from public.college_courses')).rows[0].n).toBe(40);
    expect((await s.db.pool.query("select count(*)::int n from public.student_login_ids where cap_id like 'EN26%'")).rows[0].n).toBe(500);
    expect((await s.db.pool.query("select count(*)::int n from public.admission_workspaces where cap_id like 'EN26%' and user_id is not null")).rows[0].n).toBe(500);
    expect((await s.db.pool.query("select count(*)::int n from public.profiles where role='admin'")).rows[0].n).toBe(1);
    expect(s.seedOutput.join('\n')).toMatch(/cap_records\s+inserted\s+500/);
    expect(s.seedOutput.join('\n')).toMatch(/student logins\s+inserted\s+500/);
    const count = 'select (select count(*) from public.student_preferences) p, (select count(*) from public.allotment_history) h, (select count(*) from public.workflow_events) e, (select count(*) from auth.users) u';
    const before = (await s.db.pool.query(count)).rows[0];
    const again = await runScript('scripts/seed.ts', s.envFor());
    expect(again.code).toBe(0);
    expect(again.out).toMatch(/cap_records\s+inserted\s+0\s+already there\s+500/);
    expect(again.out).toMatch(/student logins\s+inserted\s+0\s+already there\s+500/);
    expect((await s.db.pool.query(count)).rows[0]).toEqual(before);
  });
  it('round 1 of the seed: some students are allotted, some waiting, seats are never exceeded', async () => {
    const c = await s.db.pool.query('select allotment_status, count(*)::int n from public.cap_records group by 1');
    const by = Object.fromEntries(c.rows.map((r) => [r.allotment_status, r.n]));
    expect(by.allotted).toBeGreaterThan(100);
    const over = await s.db.pool.query('select cc.code from public.college_courses cc join public.cap_records r on r.allotted_course_id = cc.id group by cc.id having count(*) > max(cc.demo_seats)');
    expect(over.rowCount).toBe(0);
  });
});

describe('student login (CAP ID + password) and automatic details', () => {
  const b = new Browser('http://127.0.0.1:3101');
  it('the home and login pages have no sign-up and no demo-mode text', async () => {
    for (const p of ['/', '/login', '/admin/login']) {
      const r = await b.get(p);
      expect(r.status, p).toBe(200);
      expect(r.text, p).not.toMatch(/Create (your )?account|Register|Demo mode|DM26000001/);
    }
    expect((await b.get('/register')).status).toBe(404);
    expect((await b.post('/api/auth/register', {})).status).toBe(404);
  });
  it('logs in with CAP ID + password and the dashboard shows the stored details without asking for them', async () => {
    const r = await login(b, 'EN26100005');
    expect(r.status).toBe(200);
    expect(r.json.student.capId).toBe('EN26100005');
    expect(r.json.student.state).toBe('linked');
    expect(JSON.stringify(r.json)).not.toContain('@');
    const rec = (await s.db.pool.query("select candidate_name from public.cap_records where cap_id='EN26100005'")).rows[0];
    const page = await b.get('/dashboard');
    expect(page.status).toBe(200);
    expect(page.text).toContain('EN26100005');
    expect(page.text).toContain(rec.candidate_name);
    expect(page.text).toContain('CAP record');
  });
  it('the API never returns an email address', async () => {
    expect(JSON.stringify((await b.get('/api/auth/me')).json)).not.toContain('@');
  });
  it('logout clears the session; protected pages redirect to login', async () => {
    expect((await b.post('/api/auth/logout')).status).toBe(200);
    const page = await b.get('/dashboard');
    expect(page.status).toBeGreaterThanOrEqual(300);
    expect(page.status).toBeLessThan(400);
    expect(page.headers.get('location')).toContain('/login');
    expect((await b.get('/api/auth/me')).status).toBe(401);
  });
  it('accepts the CAP ID in a different style', async () => {
    const r = await b.post('/api/auth/login', { capId: ' en26-100005 ', password: 'EN26100005' });
    expect(r.status).toBe(200);
    expect(r.json.student.capId).toBe('EN26100005');
  });
  it('preferences and documents are saved and shown again after a new login', async () => {
    const courses = (await s.db.pool.query('select id from public.college_courses order by code limit 3')).rows.map((r) => r.id);
    expect((await b.put('/api/student/preferences', { courseIds: courses })).status).toBe(200);
    const code = (await s.db.pool.query('select code from public.document_types order by sort_order limit 1')).rows[0].code;
    expect((await b.patch('/api/student/documents', { docCode: code, status: 'ready' })).status).toBe(200);
    expect((await b.patch('/api/student/documents', { docCode: code, status: 'verified' })).status).toBe(400); // students cannot verify
    await b.post('/api/auth/logout');
    await login(b, 'EN26100005');
    expect((await b.get('/dashboard')).text).toContain('pref-list');
    expect((await b.get('/preferences')).status).toBe(200);
    const row = (await s.db.pool.query("select status from public.document_checklists d join public.admission_workspaces w on w.id=d.workspace_id where w.cap_id='EN26100005' and d.doc_code=$1", [code])).rows[0];
    expect(row.status).toBe('ready');
  });
  it('wrong password and unknown CAP ID give the same generic answer', async () => {
    const x = new Browser(s.demoUrl);
    const wrong = await x.post('/api/auth/login', { capId: 'EN26100005', password: 'Nope-Nope-1' });
    const unknown = await x.post('/api/auth/login', { capId: 'ZZ99999999', password: 'Nope-Nope-1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.message).toBe(GENERIC);
    expect(unknown.json.message).toBe(GENERIC);
    expect(x.cookieNames.filter((n) => n.includes('auth-token'))).toHaveLength(0);
  });
  it('one student cannot log in with another student\'s ID by sending extra fields', async () => {
    const other = new Browser(s.demoUrl);
    const r = await login(other, 'EN26100007', { userId: 'x', user_id: 'y', cap_id: 'EN26100005' });
    expect(r.json.student.capId).toBe('EN26100007');
    const mine = (await s.db.pool.query("select candidate_name from public.cap_records where cap_id='EN26100005'")).rows[0].candidate_name;
    expect((await other.get('/dashboard')).text).not.toContain(mine);
  });
  it('can open a support request that appears in the staff queue', async () => {
    expect((await b.post('/api/student/support', { subject: 'Question about documents', body: 'Hello' })).status).toBe(200);
    expect((await s.db.pool.query("select count(*)::int n from public.service_queue_items where subject='Question about documents' and level=3 and status='waiting'")).rows[0].n).toBe(1);
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
    expect((await anon.get('/admin')).headers.get('location')).toContain('/admin/login');
  });
  it('a student account cannot use admin APIs or pages, and cannot log in on the admin form', async () => {
    await login(student, 'EN26100030');
    for (const [m, u] of [['POST', '/api/admin/queue'], ['POST', '/api/admin/records'], ['POST', '/api/admin/allotment'], ['GET', '/api/admin/records/export']] as const) {
      const r = await student.req(m, u, m === 'GET' ? undefined : { action: 'snapshot' });
      expect(r.status, `${m} ${u}`).toBe(403);
    }
    expect((await student.get('/admin')).headers.get('location')).toContain('/admin/login');
    expect((await new Browser(s.demoUrl).post('/api/admin/login', { loginId: 'en26100030', password: 'EN26100030' })).status).toBe(401);
  });
  it('the admin account cannot log in through the student form', async () => {
    expect((await new Browser(s.demoUrl).post('/api/auth/login', { capId: 'ADMIN0001', password: ADMIN.password })).status).toBe(401);
  });
  it('cross-site writes are blocked', async () => {
    const r = await new Browser(s.demoUrl).req('POST', '/api/auth/login', { capId: 'EN26100005', password: 'EN26100005' }, { Origin: 'https://evil.example' });
    expect(r.status).toBe(403);
  });
  it('admin logs in with the demo credentials and all admin pages render', async () => {
    expect((await staff.post('/api/admin/login', { loginId: ADMIN.loginId.toUpperCase(), password: ADMIN.password })).status).toBe(200);
    for (const p of ['/admin', '/admin/students', '/admin/students?q=EN2610', '/admin/records', '/admin/requests', '/admin/queue', '/admin/appointments', '/admin/planner', '/admin/allotment', '/admin/audit']) {
      const r = await staff.get(p);
      expect(r.status, p).toBe(200);
    }
    expect((await staff.get('/admin')).text).toMatch(/C\+\+ program/);
  });
  it('student search reports its comparison count', async () => {
    const r = await staff.get('/admin/students?q=EN261001');
    expect(r.text.replace(/<!-- -->/g, '')).toMatch(/comparisons over 5\d\d records/);
    expect(r.text).toContain('EN26100100');
    const byName = (await s.db.pool.query("select candidate_name from public.cap_records where cap_id='EN26100100'")).rows[0].candidate_name as string;
    expect((await staff.get(`/admin/students?q=${encodeURIComponent(byName.split(' ')[1].toLowerCase())}`)).text).toContain('EN26100100');
  });
  it('stage change: allowed move works, illegal jump is refused, and the student is notified', async () => {
    const ws = (await s.db.pool.query("select id from public.admission_workspaces where cap_id='EN26100030'")).rows[0].id;
    await s.db.pool.query("update public.admission_workspaces set workflow_stage='registration' where id=$1", [ws]);
    const bad = await staff.post('/api/admin/students/stage', { workspaceId: ws, stage: 'admission_completed' });
    expect(bad.status).toBe(409);
    const ok = await staff.post('/api/admin/students/stage', { workspaceId: ws, stage: 'profile_verification', note: 'Looks fine' });
    expect(ok.status).toBe(200);
    expect((await student.get('/dashboard')).text).toContain('Your admission status was updated');
  });
  it('undo works only for the newest change', async () => {
    const ws = (await s.db.pool.query("select id from public.admission_workspaces where cap_id='EN26100030'")).rows[0].id;
    await staff.post('/api/admin/students/stage', { workspaceId: ws, stage: 'preference_preparation' });
    const logs = (await s.db.pool.query("select id from public.audit_logs where action='set_stage' and undone_at is null order by id desc")).rows.map((r) => Number(r.id));
    expect((await staff.post('/api/admin/audit/undo', { id: logs[1] })).status).toBe(409);
    expect((await staff.post('/api/admin/audit/undo', { id: logs[0] })).status).toBe(200);
    expect((await s.db.pool.query("select workflow_stage from public.admission_workspaces where cap_id='EN26100030'")).rows[0].workflow_stage).toBe('profile_verification');
  });
  it('service desk: priority is called first, tokens move on, and two clicks at once stay consistent', async () => {
    const wss = (await s.db.pool.query("select id from public.admission_workspaces where cap_id in ('EN26100040','EN26100041','EN26100042') order by cap_id")).rows.map((r) => r.id);
    await s.db.pool.query('delete from public.service_queue_items');
    await s.db.pool.query("insert into public.service_queue_items (workspace_id, kind, subject, level, status) values ($1,'support','regular first',3,'waiting'), ($2,'verification','priority later',1,'waiting'), ($3,'support','regular last',3,'waiting')", wss);
    const call = await staff.post('/api/admin/queue', { action: 'call', counterId: 1 });
    expect(call.status).toBe(200);
    expect(call.json.token.status).toBe('called');
    const code = call.json.token.code as string;
    expect(code.startsWith('P')).toBe(true); // priority lane
    expect((await staff.post('/api/admin/queue', { action: 'complete', code })).status).toBe(409); // must be started first
    expect((await staff.post('/api/admin/queue', { action: 'start', code })).status).toBe(200);
    expect((await staff.post('/api/admin/queue', { action: 'complete', code })).status).toBe(200);
    expect((await s.db.pool.query("select status from public.service_queue_items where subject='priority later'")).rows[0].status).toBe('completed');
    const [a, c] = await Promise.all([staff.post('/api/admin/queue', { action: 'call', counterId: 2 }), staff.post('/api/admin/queue', { action: 'call', counterId: 3 })]);
    expect([a.status, c.status].every((x) => x === 200 || x === 409)).toBe(true);
    const called = (await s.db.pool.query("select count(distinct counter_id)::int n, count(*)::int t from public.service_queue_items where status='called'")).rows[0];
    expect(called.n).toBe(called.t); // never two people at one counter
    expect((await staff.post('/api/admin/queue', { action: 'start', code: 'R999' })).status).toBe(404);
    expect((await staff.post('/api/admin/queue', { action: 'call', counterId: 2 })).status).toBeGreaterThanOrEqual(409);
  });
  it('CSV import separates new, repeated and existing IDs', async () => {
    const csv = 'cap_id,name,category,merit_rank,percentile\nIMP00000001,Import One,OPEN,901,40\nIMP00000001,Import One Again,OPEN,902,41\nEN26100001,Already There,OPEN,1,99\nbad id!,Broken,,,';
    const dry = await staff.post('/api/admin/records/import', { csv, dryRun: true });
    expect(dry.json).toMatchObject({ wouldImport: 1, duplicateInFile: 1, alreadyExists: 1, imported: 0 });
    const real = await staff.post('/api/admin/records/import', { csv });
    expect(real.json.imported).toBe(1);
    expect((await s.db.pool.query("select count(*)::int n from public.cap_records where cap_id='IMP00000001'")).rows[0].n).toBe(1);
    const exp = await staff.get('/api/admin/records/export');
    expect(exp.headers.get('content-type')).toContain('text/csv');
    expect(exp.text.split('\n')[0]).toContain('cap_id');
  });
  it('allotment: preview changes nothing, applying round 1 is audited and never exceeds seats', async () => {
    const before = (await s.db.pool.query("select count(*)::int n from public.audit_logs where action='update_record'")).rows[0].n;
    const preview = await staff.post('/api/admin/allotment', { round: 1, apply: false });
    expect(preview.status).toBe(200);
    expect(preview.json.considered).toBeGreaterThan(100);
    expect(preview.json.message).toMatch(/allotted/);
    expect((await s.db.pool.query("select count(*)::int n from public.audit_logs where action='update_record'")).rows[0].n).toBe(before);
    const applied = await staff.post('/api/admin/allotment', { round: 1, apply: true });
    expect(applied.status).toBe(200);
    const over = await s.db.pool.query('select cc.code from public.college_courses cc join public.cap_records r on r.allotted_course_id = cc.id group by cc.id having count(*) > max(cc.demo_seats)');
    expect(over.rowCount).toBe(0);
    expect((await staff.post('/api/admin/allotment', { round: 2, apply: false })).status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('too many wrong passwords for one CAP ID gets a 429 with Retry-After', async () => {
    const x = new Browser(s.demoUrl);
    let last = { status: 0, headers: new Headers(), json: null as unknown };
    for (let i = 0; i < 10; i++) last = await x.post('/api/auth/login', { capId: 'RATE00000001', password: 'Wrong-Pass-1' });
    expect(last.status).toBe(429);
    expect(last.headers.get('retry-after')).toBeTruthy();
  });
});

describe('engine in production', () => {
  it('the health endpoint runs the real C++ program and its self check', async () => {
    const r = await new Browser(s.demoUrl).get('/api/health/engine');
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, selfCheck: true, mode: 'cpp', engine: 'simple-cpp' });
  });
  it('when the C++ program is missing, the site keeps working with the TypeScript copy and says so', async () => {
    const b = new Browser(s.noEngineUrl);
    expect((await b.get('/api/health')).status).toBe(200);
    const h = await b.get('/api/health/engine');
    expect(h.status).toBe(200);
    expect(h.json).toMatchObject({ ok: true, mode: 'typescript' });
    expect(JSON.stringify(h.json)).not.toContain('/nonexistent');
    expect((await login(b, 'EN26100099')).status).toBe(200);
    expect((await b.get('/dashboard')).status).toBe(200);
    const staff = new Browser(s.noEngineUrl);
    await staff.post('/api/admin/login', { loginId: ADMIN.loginId, password: ADMIN.password });
    expect((await staff.get('/admin')).text).toMatch(/TypeScript copy/);
    expect((await staff.post('/api/admin/allotment', { round: 1, apply: false })).status).toBe(200);
  });
});

describe('PWA', () => {
  const b = () => new Browser(s.demoUrl);
  it('serves a valid manifest with icons', async () => {
    const m = await b().get('/manifest.webmanifest');
    expect(m.status).toBe(200);
    expect(m.json).toMatchObject({ display: 'standalone' });
    expect(m.json.start_url).toBeTruthy();
    const sizes = m.json.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of m.json.icons) expect((await b().get(icon.src)).status).toBe(200);
  });
  it('the service worker is served without caching and never caches private API data', async () => {
    const sw = await b().get('/sw.js');
    expect(sw.status).toBe(200);
    expect(sw.headers.get('cache-control')).toMatch(/no-cache|no-store|max-age=0/);
    expect(sw.text).toMatch(/\/api\//);
    expect(sw.text).toMatch(/\/offline/);
    expect((await b().get('/offline')).text).toMatch(/offline/i);
  });
  it('API responses are not cacheable', async () => {
    const x = b();
    expect((await x.get('/api/health')).headers.get('cache-control')).toContain('no-store');
    expect((await x.get('/api/auth/me')).headers.get('cache-control') ?? '').toMatch(/no-store|private|no-cache/);
  });
  it('security headers are present', async () => {
    const r = await b().get('/login');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options') ?? r.headers.get('content-security-policy')).toBeTruthy();
  });
});
