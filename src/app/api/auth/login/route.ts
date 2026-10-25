import { clientIp, ok, readJson, route, ApiError } from '@/lib/api';
import { parseCapId } from '@/lib/capId';
import { BAD_CREDENTIALS, signInMapped, userIdForCapId } from '@/lib/auth/login';
import { loginSchema } from '@/lib/auth/schemas';
import { enforceRateLimits } from '@/lib/rateLimit';
import { createSessionClient } from '@/lib/supabase/server';
import { loadStudentSnapshot } from '@/lib/student/snapshot';

export const dynamic = 'force-dynamic';

/**
 * Student login with CAP Application ID + password.
 *  1 normalize + validate the ID            2 rate limit (per IP and per ID, before any lookup)
 *  3 server-side lookup CAP ID -> account   4 Supabase Auth verifies the password
 *  5 session cookie is set                  6 profile + linked record are read with RLS as that user
 */
export const POST = route(async (request) => {
  const body = await readJson(request, loginSchema);
  const capId = parseCapId(body.capId)!; // validated by the schema

  await enforceRateLimits([
    { bucket: `login:ip:${clientIp(request)}`, limit: 30, windowSeconds: 600 },
    { bucket: `login:id:${capId}`, limit: 8, windowSeconds: 900 },
  ]);

  const session = await createSessionClient();
  const userId = await userIdForCapId(capId);
  const verifiedId = await signInMapped(session, userId, body.password);

  // the session is now set. Verify it with the Auth server and read the profile as that user.
  const { data } = await session.auth.getUser();
  const profile = data.user ? await session.from('profiles').select('role, full_name').eq('id', data.user.id).maybeSingle() : null;
  if (!data.user || data.user.id !== verifiedId || !profile?.data || profile.data.role !== 'student') {
    await session.auth.signOut();
    throw new ApiError(401, 'bad_credentials', BAD_CREDENTIALS); // admins sign in on the admin page
  }

  // automatic fetch of the student's saved details (their own rows only; see loadStudentSnapshot)
  const snapshot = await loadStudentSnapshot(session, data.user.id, profile.data.full_name as string);
  return ok({
    redirect: '/dashboard',
    student: { fullName: snapshot.fullName, capId: snapshot.capId, state: snapshot.state },
  });
});
