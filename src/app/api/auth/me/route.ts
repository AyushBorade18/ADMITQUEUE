import { ok, route } from '@/lib/api';
import { getSession } from '@/lib/auth/session';
import { ApiError } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Who am I? (verified by the Auth server). Used by the app shell to show the name and role. */
export const GET = route(async () => {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'not_signed_in', 'Please log in to continue.');
  return ok({ user: { id: session.user.id, fullName: session.profile.full_name, role: session.profile.role } });
});
