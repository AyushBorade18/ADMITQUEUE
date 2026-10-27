// A TEST-ONLY emulator of the two Supabase HTTP services this app talks to:
//   * Auth (GoTrue):  /auth/v1/...   - signup, password login, refresh, user, logout, recover, PKCE exchange, admin users
//   * PostgREST:      /rest/v1/...   - table select/insert/upsert/update/delete and rpc, running against a REAL PostgreSQL
//                                      with the REAL migrations, as the `anon` / `authenticated` / `service_role` roles,
//                                      so Row Level Security and function grants are enforced by PostgreSQL itself.
// It is NOT Supabase. It exists so the app's routes can be tested end to end on a machine without Docker or internet.
// Behaviour that only the real services have (email delivery, rate limits of Supabase Auth, JWT key rotation, etc.)
// is not covered. Always re-run the manual checklist against a real Supabase project.
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import pg from 'pg';

export const TEST_KEYS = { publishable: 'sb_publishable_test_key', secret: 'sb_secret_test_key', jwtSecret: 'emulator-jwt-secret-at-least-32-characters-long' };

export type EmulatorOptions = { dbUrl: string; port: number; confirmEmail: boolean };
export type Emulator = { server: Server; mail: { to: string; kind: 'confirm' | 'recovery'; code: string }[]; close: () => Promise<void>; options: EmulatorOptions };

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
function signJwt(payload: Record<string, unknown>): string {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  return `${head}.${body}.${createHmac('sha256', TEST_KEYS.jwtSecret).update(`${head}.${body}`).digest('base64url')}`;
}
function verifyJwt(token: string): Record<string, unknown> | null {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const expect = createHmac('sha256', TEST_KEYS.jwtSecret).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
  return payload;
}
function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  const [, salt, hash] = stored.split('$');
  const got = scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

type Json = Record<string, any>;
const IDENT = /^[a-z_][a-z0-9_]*$/;

export async function startEmulator(options: EmulatorOptions): Promise<Emulator> {
  // PostgREST sends bigint and numeric columns as JSON numbers (node-pg would return strings), so match that
  const types = { getTypeParser: (oid: number, format?: any) => (oid === 20 || oid === 1700 ? (v: string) => Number(v) : pg.types.getTypeParser(oid, format)) };
  const pool = new pg.Pool({ connectionString: options.dbUrl, max: 8, types: types as any });
  const mail: Emulator['mail'] = [];
  const refreshTokens = new Map<string, { userId: string; sessionId: string }>();
  const codes = new Map<string, string>(); // pkce / email link code -> user id

  const userJson = (u: any) => ({
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at, phone: '',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.raw_user_meta_data ?? {},
    identities: [{ id: u.id, user_id: u.id, identity_data: { sub: u.id, email: u.email }, provider: 'email' }], created_at: u.created_at, updated_at: u.created_at,
  });
  const session = (u: any) => {
    const sessionId = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const access = signJwt({ aud: 'authenticated', exp: now + 3600, iat: now, sub: u.id, email: u.email, role: 'authenticated', session_id: sessionId });
    const refresh = randomBytes(12).toString('hex');
    refreshTokens.set(refresh, { userId: u.id, sessionId });
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(u) };
  };
  const authErr = (res: ServerResponse, status: number, code: string, msg: string) => send(res, status, { code: status, error_code: code, msg, message: msg });

  function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
    if (body === undefined) { res.writeHead(status, headers); res.end(); return; }
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  }
  const readBody = (req: IncomingMessage) => new Promise<string>((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => resolve(d)); });

  // ---------------------------------------------------------------- who is calling?
  function caller(req: IncomingMessage): { role: 'anon' | 'authenticated' | 'service_role'; sub?: string; claims: Json } {
    const apikey = String(req.headers['apikey'] ?? '');
    const bearer = String(req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
    if (apikey === TEST_KEYS.secret || bearer === TEST_KEYS.secret) return { role: 'service_role', claims: { role: 'service_role' } };
    const jwt = bearer && bearer !== TEST_KEYS.publishable ? verifyJwt(bearer) : null;
    if (jwt && jwt.role === 'authenticated') return { role: 'authenticated', sub: String(jwt.sub), claims: jwt };
    return { role: 'anon', claims: { role: 'anon' } };
  }
  const apikeyOk = (req: IncomingMessage) => [TEST_KEYS.publishable, TEST_KEYS.secret].includes(String(req.headers['apikey'] ?? ''));

  // ---------------------------------------------------------------- Auth
  async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL) {
    const route = url.pathname.replace('/auth/v1', '');
    const body: Json = req.method === 'GET' || req.method === 'DELETE' ? {} : JSON.parse((await readBody(req)) || '{}');
    const c = caller(req);

    if (route === '/signup' && req.method === 'POST') {
      const email = String(body.email ?? '').toLowerCase();
      const password = String(body.password ?? '');
      if (!email.includes('@')) return authErr(res, 422, 'validation_failed', 'Unable to validate email address: invalid format');
      if (password.length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
      const exists = await pool.query('select id from auth.users where email = $1', [email]);
      if (exists.rowCount) {
        // like real Supabase with email confirmation on: look like success, but with no identities
        const fake = { id: randomUUID(), aud: 'authenticated', email, identities: [], user_metadata: {}, app_metadata: {}, created_at: new Date().toISOString() };
        return send(res, 200, fake);
      }
      const confirmedAt = options.confirmEmail ? null : new Date().toISOString();
      const ins = await pool.query('insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data) values ($1, $2, $3, $4) returning *', [email, hashPassword(password), confirmedAt, body.data ?? {}]);
      const u = ins.rows[0];
      if (options.confirmEmail) {
        const code = randomBytes(8).toString('hex');
        codes.set(code, u.id);
        mail.push({ to: email, kind: 'confirm', code });
        return send(res, 200, userJson(u));
      }
      return send(res, 200, session(u));
    }

    if (route === '/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const email = String(body.email ?? '').toLowerCase();
        const r = await pool.query('select * from auth.users where email = $1', [email]);
        const u = r.rows[0];
        if (!u || !checkPassword(String(body.password ?? ''), u.encrypted_password)) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
        if (!u.email_confirmed_at) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
        return send(res, 200, session(u));
      }
      if (grant === 'refresh_token') {
        const t = refreshTokens.get(String(body.refresh_token ?? ''));
        if (!t) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        refreshTokens.delete(String(body.refresh_token));
        const r = await pool.query('select * from auth.users where id = $1', [t.userId]);
        if (!r.rowCount) return authErr(res, 400, 'user_not_found', 'User not found');
        return send(res, 200, session(r.rows[0]));
      }
      if (grant === 'pkce') {
        const id = codes.get(String(body.auth_code ?? ''));
        if (!id || !body.code_verifier) return authErr(res, 400, 'flow_state_not_found', 'invalid flow state, no valid flow state found');
        codes.delete(String(body.auth_code));
        const r = await pool.query('update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1 returning *', [id]);
        return send(res, 200, session(r.rows[0]));
      }
    }

    if (route === '/user' && req.method === 'GET') {
      if (c.role !== 'authenticated') return authErr(res, 401, 'bad_jwt', 'invalid JWT');
      const r = await pool.query('select * from auth.users where id = $1', [c.sub]);
      return r.rowCount ? send(res, 200, userJson(r.rows[0])) : authErr(res, 403, 'user_not_found', 'User from sub claim in JWT does not exist');
    }
    if (route === '/user' && req.method === 'PUT') {
      if (c.role !== 'authenticated') return authErr(res, 401, 'bad_jwt', 'invalid JWT');
      if (body.password) {
        if (String(body.password).length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
        await pool.query('update auth.users set encrypted_password = $2 where id = $1', [c.sub, hashPassword(String(body.password))]);
      }
      const r = await pool.query('select * from auth.users where id = $1', [c.sub]);
      return send(res, 200, userJson(r.rows[0]));
    }
    if (route === '/logout' && req.method === 'POST') return send(res, 204);
    if (route === '/recover' && req.method === 'POST') {
      const email = String(body.email ?? '').toLowerCase();
      const r = await pool.query('select id from auth.users where email = $1', [email]);
      if (r.rowCount) { const code = randomBytes(8).toString('hex'); codes.set(code, r.rows[0].id); mail.push({ to: email, kind: 'recovery', code }); }
      return send(res, 200, {});
    }

    if (route.startsWith('/admin/users')) {
      if (c.role !== 'service_role') return authErr(res, 403, 'not_admin', 'User not allowed');
      const id = route.split('/')[3];
      if (!id && req.method === 'POST') {
        const email = String(body.email ?? '').toLowerCase();
        const dup = await pool.query('select 1 from auth.users where email = $1', [email]);
        if (dup.rowCount) return authErr(res, 422, 'email_exists', 'A user with this email address has already been registered');
        const r = await pool.query('insert into auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data) values ($1,$2,$3,$4) returning *', [email, hashPassword(String(body.password ?? randomUUID())), body.email_confirm ? new Date().toISOString() : null, body.user_metadata ?? {}]);
        return send(res, 200, userJson(r.rows[0]));
      }
      if (!id && req.method === 'GET') {
        const r = await pool.query('select * from auth.users order by created_at limit 1000');
        return send(res, 200, { users: r.rows.map(userJson), aud: 'authenticated' });
      }
      if (id && req.method === 'GET') {
        const r = await pool.query('select * from auth.users where id = $1', [id]);
        return r.rowCount ? send(res, 200, userJson(r.rows[0])) : authErr(res, 404, 'user_not_found', 'User not found');
      }
      if (id && req.method === 'PUT') {
        if (body.password) await pool.query('update auth.users set encrypted_password = $2 where id = $1', [id, hashPassword(String(body.password))]);
        const r = await pool.query('select * from auth.users where id = $1', [id]);
        return send(res, 200, userJson(r.rows[0]));
      }
      if (id && req.method === 'DELETE') { await pool.query('delete from auth.users where id = $1', [id]); return send(res, 200, {}); }
    }
    return authErr(res, 404, 'not_found', `no such auth route ${route}`);
  }

  // ---------------------------------------------------------------- PostgREST
  function pgError(res: ServerResponse, e: any) {
    const status = e.code === '42501' ? 403 : e.code === 'P0001' || e.code?.startsWith('23') || e.code?.startsWith('22') ? 400 : e.code === '42883' || e.code === '42P01' ? 404 : 400;
    send(res, status, { code: e.code ?? 'XX000', message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
  }
  function filterSql(url: URL, params: any[]): string {
    const parts: string[] = [];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const cond = (col: string, spec: string): string => {
      let negate = false;
      let s = spec;
      if (s.startsWith('not.')) { negate = true; s = s.slice(4); }
      const dot = s.indexOf('.');
      const op = s.slice(0, dot);
      const val = s.slice(dot + 1);
      let sql: string;
      const q = `"${col}"`;
      if (op === 'is') sql = `${q} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
      else if (op === 'in') {
        const inner = val.replace(/^\(/, '').replace(/\)$/, '');
        const items = inner.length ? (inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) ?? []).map((x) => x.replace(/^"|"$/g, '').replace(/\\"/g, '"')) : [];
        sql = items.length ? `${q}::text = any(${add(items)}::text[])` : 'false';
      } else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(op)) {
        const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op as 'eq'];
        sql = `${q}::text ${sym === '=' || sym === '<>' ? sym : sym} ${add(val)}`;
        if (!['eq', 'neq'].includes(op)) sql = `${q} ${sym} ${add(val)}`; // ordered comparison keeps the column type
      } else if (op === 'like' || op === 'ilike') sql = `${q}::text ${op} ${add(val.replace(/\*/g, '%'))}`;
      else throw Object.assign(new Error(`emulator: unsupported filter ${op}`), { code: 'PGRST100' });
      return negate ? `not (${sql})` : sql;
    };
    for (const [k, v] of url.searchParams) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      if (!IDENT.test(k)) throw Object.assign(new Error(`emulator: unsupported filter column ${k}`), { code: 'PGRST100' });
      parts.push(cond(k, v));
    }
    return parts.length ? ` where ${parts.join(' and ')}` : '';
  }

  async function handleRest(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (!apikeyOk(req)) return send(res, 401, { message: 'No API key found in request', hint: 'No `apikey` request header or url param was found.' });
    const c = caller(req);
    const rest = url.pathname.replace('/rest/v1/', '');
    const prefer = String(req.headers['prefer'] ?? '');
    const wantsObject = String(req.headers['accept'] ?? '').includes('vnd.pgrst.object');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${c.role}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(c.claims)]);
      let rows: any[] = [];
      let total: number | null = null;
      let status = 200;
      let scalar: { value: unknown } | null = null;

      if (rest.startsWith('rpc/')) {
        const fn = rest.slice(4);
        if (!IDENT.test(fn)) throw Object.assign(new Error('bad function name'), { code: 'PGRST202' });
        const args: Json = req.method === 'GET' ? Object.fromEntries(url.searchParams) : JSON.parse((await readBody(req)) || '{}');
        const meta = await pool.query(`select p.proargnames, p.proargtypes::oid[] as types, p.prorettype::regtype::text as ret, p.proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [fn]);
        if (!meta.rowCount) throw Object.assign(new Error(`Could not find the function public.${fn}`), { code: 'PGRST202' });
        const m = meta.rows[0];
        const typeNames = (await pool.query('select oid, format_type(oid, null) as t from pg_type where oid = any($1::oid[])', [m.types])).rows;
        const typeOf = new Map(typeNames.map((r: any) => [Number(r.oid), r.t as string]));
        const names: string[] = m.proargnames ?? [];
        const vals: any[] = [];
        const argSql = Object.keys(args).map((k) => {
          const idx = names.indexOf(k);
          if (idx < 0 || !IDENT.test(k)) throw Object.assign(new Error(`Could not find the function public.${fn}(${k})`), { code: 'PGRST202' });
          const t = typeOf.get(Number(m.types[idx])) ?? 'text';
          const v = args[k];
          vals.push(t === 'jsonb' || t === 'json' ? JSON.stringify(v) : v);
          return `${k} => $${vals.length}::${t}`;
        }).join(', ');
        if (m.ret === 'void') { await client.query(`select public.${fn}(${argSql})`, vals); status = 204; }
        else {
          const r = await client.query(`select to_json(public.${fn}(${argSql})) as v`, vals);
          const first = r.rows[0]?.v;
          scalar = { value: first ?? null };
        }
      } else {
        const table = rest.split('/')[0];
        if (!IDENT.test(table)) throw Object.assign(new Error('bad table'), { code: '42P01' });
        const params: any[] = [];
        const where = filterSql(url, params);
        const sel = url.searchParams.get('select') ?? '*';
        if (!/^[a-z0-9_*,\s]+$/i.test(sel)) throw Object.assign(new Error('emulator: embedded selects are not supported'), { code: 'PGRST100' });
        const cols = sel.split(',').map((x) => x.trim()).filter(Boolean).map((x) => (x === '*' ? '*' : `"${x}"`)).join(', ') || '*';

        if (req.method === 'GET' || req.method === 'HEAD') {
          const order = (url.searchParams.get('order') ?? '').split(',').filter(Boolean).map((o) => { const [col, dir = 'asc', nulls] = o.split('.'); if (!IDENT.test(col)) throw Object.assign(new Error('bad order'), { code: 'PGRST100' }); return `"${col}" ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`; });
          const limit = url.searchParams.get('limit');
          const offset = url.searchParams.get('offset');
          if (prefer.includes('count=exact')) total = Number((await client.query(`select count(*)::int as n from public."${table}"${where}`, params)).rows[0].n);
          if (req.method === 'GET') {
            const q = `select ${cols} from public."${table}"${where}${order.length ? ` order by ${order.join(', ')}` : ''}${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}`;
            rows = (await client.query(q, params)).rows;
          }
        } else if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const list: Json[] = Array.isArray(body) ? body : [body];
          const onConflict = (url.searchParams.get('on_conflict') ?? '').split(',').filter(Boolean);
          for (const row of list) {
            const keys = Object.keys(row);
            if (!keys.every((k) => IDENT.test(k))) throw Object.assign(new Error('bad column'), { code: 'PGRST100' });
            const qc = keys.map((k) => `"${k}"`).join(', ');
            let conflict = '';
            if (prefer.includes('resolution=ignore-duplicates')) conflict = ` on conflict ${onConflict.length ? `(${onConflict.map((k) => `"${k}"`).join(', ')})` : ''} do nothing`;
            else if (prefer.includes('resolution=merge-duplicates')) conflict = ` on conflict (${onConflict.map((k) => `"${k}"`).join(', ')}) do update set ${keys.map((k) => `"${k}" = excluded."${k}"`).join(', ')}`;
            const q = keys.length
              ? `insert into public."${table}" (${qc}) select ${qc} from json_populate_record(null::public."${table}", $1::json)${conflict} returning ${cols}`
              : `insert into public."${table}" default values returning ${cols}`;
            rows.push(...(await client.query(q, keys.length ? [JSON.stringify(row)] : [])).rows);
          }
          status = 201;
        } else if (req.method === 'PATCH') {
          const body = JSON.parse((await readBody(req)) || '{}');
          const keys = Object.keys(body);
          if (!keys.length || !keys.every((k) => IDENT.test(k))) throw Object.assign(new Error('bad update'), { code: 'PGRST100' });
          params.unshift(JSON.stringify(body));
          // shift the placeholder numbers of the where clause by one because the body is now $1
          const shifted = where.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`);
          const set = keys.map((k) => `"${k}" = r."${k}"`).join(', ');
          rows = (await client.query(`update public."${table}" t set ${set} from json_populate_record(null::public."${table}", $1::json) r${shifted.replace(/"(\w+)"/g, 't."$1"')} returning ${cols.replace(/"(\w+)"/g, 't."$1"').replace(/^\*$/, 't.*')}`, params)).rows;
        } else if (req.method === 'DELETE') {
          rows = (await client.query(`delete from public."${table}"${where} returning ${cols}`, params)).rows;
        } else throw Object.assign(new Error('method not supported'), { code: 'PGRST100' });
      }
      await client.query('commit');

      const headers: Record<string, string> = {};
      if (total !== null) headers['Content-Range'] = `0-${Math.max(0, rows.length - 1)}/${total}`;
      if (scalar) return send(res, 200, scalar.value, headers);
      if (status === 204 || (req.method !== 'GET' && !prefer.includes('return=representation') && req.method !== 'HEAD')) return send(res, status === 201 ? 201 : 204, undefined, headers);
      if (req.method === 'HEAD') return send(res, 200, undefined, headers);
      if (wantsObject) {
        if (rows.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${rows.length} rows`, hint: null });
        return send(res, status, rows[0], headers);
      }
      return send(res, status, rows, headers);
    } catch (e: any) {
      await client.query('rollback').catch(() => undefined);
      return pgError(res, e);
    } finally {
      client.release();
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${options.port}`);
      if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
      if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url);
      if (url.pathname === '/__health') return send(res, 200, { ok: true });
      send(res, 404, { message: 'not found' });
    } catch (e: any) {
      send(res, 500, { message: String(e?.message ?? e) });
    }
  });
  await new Promise<void>((r) => server.listen(options.port, '127.0.0.1', r));
  return { server, mail, options, close: async () => { await new Promise<void>((r) => server.close(() => r())); await pool.end(); } };
}
