import { ok, route } from '@/lib/api';
import { createSessionClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const POST = route(async () => {
  const session = await createSessionClient();
  await session.auth.signOut(); // revokes the session and clears the cookies
  return ok({ redirect: '/login' });
});
