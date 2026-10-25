// Applies supabase/migrations/*.sql in order using a direct Postgres connection.
// Each file runs once; applied files are remembered in the table public._aq_migrations.
// Alternative without this script: paste each file into the Supabase SQL editor, in file-name order.
//   npm run db:migrate
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fail, loadEnvFiles, requireEnv } from './lib/common';

loadEnvFiles();

async function main() {
  const url = requireEnv('SUPABASE_DB_URL');
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('create table if not exists public._aq_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await client.query('select name from public._aq_migrations')).rows.map((r: { name: string }) => r.name));
    let applied = 0;
    for (const f of files) {
      if (done.has(f)) { console.log(`skip   ${f} (already applied)`); continue; }
      const sql = readFileSync(path.join(dir, f), 'utf8');
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into public._aq_migrations (name) values ($1)', [f]);
        await client.query('commit');
        console.log(`apply  ${f}`);
        applied++;
      } catch (e) {
        await client.query('rollback');
        fail(`${f} failed and was rolled back: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    console.log(applied ? `Done: ${applied} migration(s) applied.` : 'Database is already up to date.');
  } finally {
    await client.end();
  }
}

main().catch((e) => fail(`Migration failed: ${e instanceof Error ? e.message : String(e)}`));
