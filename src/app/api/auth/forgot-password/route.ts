import { clientIp, ok, readJson, route } from '@/lib/api';
import { parseCapId } from '@/lib/capId';
import { authEmailOf, userIdForCapId } from '@/lib/auth/login';
import { forgotSchema } from '@/lib/auth/schemas';
import { appUrl } from '@/lib/env';
import { enforceRateLimits } from '@/lib/rateLimit';
import { createSessionClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Always answers the same way, whether or not the CAP ID exists. The email goes to the address on the account. */
export const POST = route(async (request) => {
  const body = await readJson(request, forgotSchema);
  const capId = parseCapId(body.capId)!;
  await enforceRateLimits([
    { bucket: `forgot:ip:${clientIp(request)}`, limit: 10, windowSeconds: 3600 },
    { bucket: `forgot:id:${capId}`, limit: 3, windowSeconds: 3600 },
  ]);
  const userId = await userIdForCapId(capId);
  const email = userId ? await authEmailOf(userId) : null;
  if (email) {
    const session = await createSessionClient(); // keeps the PKCE verifier in this browser's cookie
    const { error } = await session.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl()}/auth/callback?next=/reset-password` });
    if (error) console.error('[forgot-password]', error.code ?? error.message);
  }
  return ok({ message: 'If this CAP ID has an account, a password reset link was sent to its email address.' });
});
