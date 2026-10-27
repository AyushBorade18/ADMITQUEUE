// Creates the first admin account from environment variables. Safe to run on every deploy:
//  * if the admin already exists, the password is NOT changed (set ADMIN_RESET_PASSWORD=true to change it on purpose)
//  * an admin login id is a short name (like "admin"), kept separate from student CAP IDs
//   npm run admin:bootstrap
import { adminClient, fail, loadEnvFiles, requireEnv } from './lib/common';

loadEnvFiles();

async function main() {
  const loginId = requireEnv('ADMIN_LOGIN_ID').toLowerCase();
  const email = requireEnv('ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('ADMIN_PASSWORD');
  if (!/^[a-z0-9._-]{3,32}$/.test(loginId)) fail('ADMIN_LOGIN_ID must be 3-32 characters: lowercase letters, digits, dot, dash or underscore.');
  if (password.length < 12) fail('ADMIN_PASSWORD must be at least 12 characters.');
  if (password === 'change-this-to-a-long-password') fail('Please change ADMIN_PASSWORD from the example value.');
  const resetPassword = process.env.ADMIN_RESET_PASSWORD === 'true';

  const db = adminClient();

  // Is there already a profile with this admin login id?
  const found = await db.from('profiles').select('id, role').eq('admin_login_id', loginId).maybeSingle();
  if (found.error) fail(`lookup failed: ${found.error.message}`);
  let userId = found.data?.id as string | undefined;
  let created = false;

  if (!userId) {
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Administrator' } });
    if (made.error || !made.data.user) {
      // the e-mail may already be registered: find that user instead of failing
      const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const match = list.data?.users.find((u) => u.email?.toLowerCase() === email);
      if (!match) fail(`could not create the admin user: ${made.error?.message ?? 'unknown error'}`);
      userId = match!.id;
      console.log('A user with that e-mail already existed; promoting it to admin without changing its password.');
    } else {
      userId = made.data.user.id;
      created = true;
    }
  } else if (resetPassword) {
    const upd = await db.auth.admin.updateUserById(userId, { password });
    if (upd.error) fail(`could not reset the password: ${upd.error.message}`);
    console.log('Admin password was reset (ADMIN_RESET_PASSWORD=true).');
  }

  const prof = await db.from('profiles').update({ role: 'admin', admin_login_id: loginId, full_name: 'Administrator' }).eq('id', userId!);
  if (prof.error) fail(`could not mark the profile as admin: ${prof.error.message}`);
  console.log(created ? `Admin created. Log in at /admin/login with login id "${loginId}".` : `Admin "${loginId}" is ready (existing password kept).`);
}

main().catch((e) => fail(`Bootstrap failed: ${e instanceof Error ? e.message : String(e)}`));
