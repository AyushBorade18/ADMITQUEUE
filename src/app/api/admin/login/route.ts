import { ApiError, clientIp, ok, readJson, route } from '@/lib/api';
import { parseAdminLoginId } from '@/lib/capId';
import { BAD_CREDENTIALS, signInMapped, userIdForAdminLogin } from '@/lib/auth/login';
import { adminLoginSchema } from '@/lib/auth/schemas';
import { enforceRateLimits } from '@/lib/rateLimit';
import { createSessionClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Admin login: admin login ID + password (Supabase Auth). Student accounts can never pass this check. */
export const POST = route(async (request) => {
  const body = await readJson(request, adminLoginSchema);
  const loginId = parseAdminLoginId(body.loginId)!;
  await enforceRateLimits([
    { bucket: `admin:ip:${clientIp(request)}`, limit: 20, windowSeconds: 600 },
    { bucket: `admin:id:${loginId}`, limit: 6, windowSeconds: 900 },
  ]);
  const session = await createSessionClient();
  const userId = await userIdForAdminLogin(loginId);
  const verifiedId = await signInMapped(session, userId, body.password);
  const { data } = await session.auth.getUser();
  const profile = data.user ? await session.from('profiles').select('role').eq('id', data.user.id).maybeSingle() : null;
  if (!data.user || data.user.id !== verifiedId || profile?.data?.role !== 'admin') {
    await session.auth.signOut();
    throw new ApiError(401, 'bad_credentials', BAD_CREDENTIALS);
  }
  return ok({ redirect: '/admin' });
});
