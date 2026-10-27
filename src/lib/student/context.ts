import 'server-only';
import { cache } from 'react';
import { requireStudentPage } from '@/lib/auth/session';
import { loadStudentSnapshot } from '@/lib/student/snapshot';

/** Session + snapshot for the current request (loaded once per request, shared by layout and page). */
export const getStudentContext = cache(async () => {
  const session = await requireStudentPage();
  const snapshot = await loadStudentSnapshot(session.supabase, session.user.id, session.profile.full_name);
  return { session, snapshot };
});
