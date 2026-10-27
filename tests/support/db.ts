// Creates a throw-away PostgreSQL database with the stand-in Supabase pieces and the real migrations applied.
// Needs a local PostgreSQL server; connection comes from TEST_PG_URL (default: the local test role).
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const ADMIN_URL = process.env.TEST_PG_URL ?? 'postgres://aq_test:aq_test@127.0.0.1:5432/postgres';
const root = path.resolve(__dirname, '..', '..');

export function dbUrl(name: string): string {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${name}`;
  return u.toString();
}

export async function createTestDb(name: string): Promise<{ url: string; pool: pg.Pool; drop: () => Promise<void> }> {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();
  const url = dbUrl(name);
  const pool = new pg.Pool({ connectionString: url, max: 6 });
  await pool.query(readFileSync(path.join(root, 'tests/support/supabase-stub.sql'), 'utf8'));
  const dir = path.join(root, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) await pool.query(readFileSync(path.join(dir, f), 'utf8'));
  return {
    url, pool,
    drop: async () => {
      await pool.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

/** Runs `fn` inside a transaction as the given Supabase role / user, like PostgREST does. */
export async function asRole<T>(pool: pg.Pool, role: 'anon' | 'authenticated' | 'service_role', sub: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role, ...(sub ? { sub } : {}) })]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export async function addUser(pool: pg.Pool, email: string, role: 'student' | 'admin' = 'student', name = 'Test Person'): Promise<string> {
  const r = await pool.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ($1, $2, now()) returning id", [email, { full_name: name }]);
  if (role === 'admin') await pool.query("update public.profiles set role = 'admin', admin_login_id = $2 where id = $1", [r.rows[0].id, email.split('@')[0].replace(/[^a-z0-9]/g, '')]);
  return r.rows[0].id;
}
