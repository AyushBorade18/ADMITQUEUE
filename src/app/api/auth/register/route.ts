import { clientIp, ok, readJson, route, ApiError } from '@/lib/api';
import { parseCapId } from '@/lib/capId';
import { conflictError, finishRegistration } from '@/lib/auth/register';
import { registerSchema } from '@/lib/auth/schemas';
import { appUrl, isDemoMode } from '@/lib/env';
import { enforceRateLimits } from '@/lib/rateLimit';
import { createAdminClient, createSessionClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const POST = route(async (request) => {
  const body = await readJson(request, registerSchema);
  const capId = parseCapId(body.capId)!;

  await enforceRateLimits([
    { bucket: `register:ip:${clientIp(request)}`, limit: 10, windowSeconds: 3600 },
    { bucket: `register:id:${capId}`, limit: 6, windowSeconds: 3600 },
  ]);

  const admin = createAdminClient();
  const taken = await admin.from('student_login_ids').select('cap_id').eq('cap_id', capId).maybeSingle();
  if (taken.error) throw new Error(taken.error.message);
  if (taken.data) throw conflictError();

  const session = await createSessionClient();
  const { data, error } = await session.auth.signUp({
    email: body.email,
    password: body.password,
    options: { data: { full_name: body.fullName }, emailRedirectTo: `${appUrl()}/auth/callback?next=/dashboard` },
  });
  if (error) {
    if (error.code === 'user_already_exists' || /already registered/i.test(error.message)) throw conflictError();
    if (error.code === 'weak_password') throw new ApiError(400, 'weak_password', 'Please choose a stronger password.', { password: 'Please choose a stronger password.' });
    if (error.status && error.status < 500) throw new ApiError(400, 'signup_rejected', 'We could not create the account with these details.');
    throw new Error(`signUp failed: ${error.message}`);
  }

  // With email confirmation enabled, Supabase answers an already-used email with a user that has no identities.
  // Treat it exactly like a normal "check your email" answer so nobody can probe which emails exist.
  if (!data.user || (data.user.identities && data.user.identities.length === 0)) {
    return ok({ signedIn: false, needsEmailConfirmation: true }, 201);
  }

  let state;
  try {
    state = await finishRegistration(admin, data.user.id, capId, isDemoMode());
  } catch (err) {
    await session.auth.signOut().catch(() => undefined);
    throw err;
  }

  if (data.session) return ok({ signedIn: true, needsEmailConfirmation: false, state, redirect: '/dashboard' }, 201);
  return ok({ signedIn: false, needsEmailConfirmation: true, state }, 201);
});
