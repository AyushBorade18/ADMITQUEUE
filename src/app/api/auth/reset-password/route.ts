import { ApiError, ok, readJson, route } from '@/lib/api';
import { resetSchema } from '@/lib/auth/schemas';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Works only inside the short session created by the emailed reset link. */
export const POST = route(async (request) => {
  const body = await readJson(request, resetSchema);
  const session = await getSession();
  if (!session) throw new ApiError(401, 'link_expired', 'This reset link has expired. Request a new one.');
  const { error } = await session.supabase.auth.updateUser({ password: body.password });
  if (error) {
    if (error.code === 'weak_password') throw new ApiError(400, 'weak_password', 'Please choose a stronger password.', { password: 'Please choose a stronger password.' });
    if (error.code === 'same_password') throw new ApiError(400, 'same_password', 'Choose a password you have not used before.', { password: 'Choose a different password.' });
    throw new Error(error.message);
  }
  await session.supabase.auth.signOut();
  return ok({ redirect: session.profile.role === 'admin' ? '/admin/login' : '/login' });
});
