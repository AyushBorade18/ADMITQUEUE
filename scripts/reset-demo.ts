// Removes the fictional demo data so it can be seeded again.
//   npm run db:reset-demo                      removes only UNCLAIMED fictional records (safe: no student loses data)
//   npm run db:reset-demo -- --include-claimed also removes fictional records students have claimed (they lose their workspace)
// Real accounts, admin accounts and anything that is not marked synthetic are never touched.
import { adminClient, chunk, fail, loadEnvFiles } from './lib/common';

loadEnvFiles();

async function main() {
  const includeClaimed = process.argv.includes('--include-claimed');
  const db = adminClient();

  // current demo IDs start with EN26 (older versions of this project used DM26)
  const workspaces: { id: string; cap_id: string }[] = [];
  for (const prefix of ['EN26', 'DM26']) {
    let q = db.from('admission_workspaces').select('id, cap_id').eq('is_synthetic', true).like('cap_id', `${prefix}%`).limit(5000);
    if (!includeClaimed) q = q.is('user_id', null);
    const { data, error } = await q;
    if (error) fail(`read workspaces: ${error.message}`);
    workspaces.push(...(data ?? []));
  }
  const capIds = (workspaces ?? []).map((w: { cap_id: string }) => w.cap_id);
  const ids = (workspaces ?? []).map((w: { id: string }) => w.id);

  // demo logins are removed too when claimed workspaces are removed (deleting the user also removes the CAP ID mapping)
  let loginsRemoved = 0;
  if (includeClaimed) {
    for (const part of chunk(capIds, 100)) {
      const { data, error } = await db.from('student_login_ids').select('user_id').in('cap_id', part);
      if (error) fail(`read logins: ${error.message}`);
      for (const row of data ?? []) {
        const r = await db.auth.admin.deleteUser(row.user_id as string);
        if (!r.error) loginsRemoved++;
      }
    }
  }
  for (const part of chunk(ids, 100)) {
    const r = await db.from('admission_workspaces').delete().in('id', part);
    if (r.error) fail(`delete workspaces: ${r.error.message}`);
  }
  for (const part of chunk(capIds, 100)) {
    const r = await db.from('cap_records').delete().eq('is_synthetic', true).in('cap_id', part);
    if (r.error) fail(`delete records: ${r.error.message}`);
  }
  console.log(`Removed ${ids.length} fictional workspaces and their records${includeClaimed ? ` (including claimed ones and ${loginsRemoved} demo logins)` : ' (claimed ones were kept)'}.`);
  console.log('The college catalogue and the round dates were kept. Run "npm run db:seed" to add the demo data again.');
}

main().catch((e) => fail(`Reset failed: ${e instanceof Error ? e.message : String(e)}`));
