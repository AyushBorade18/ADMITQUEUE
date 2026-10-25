import 'server-only';
import { redirect } from 'next/navigation';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';
import { createSessionClient } from '@/lib/supabase/server';

export type Profile = { id: string; role: 'student' | 'admin'; full_name: string; admin_login_id: string | null };
export type SessionContext = { supabase: SupabaseClient; user: User; profile: Profile };

/**
 * The signed-in user, verified by asking the Supabase Auth server (getUser), plus their profile row.
 * The user id and role come from here, NEVER from the request body, query string or local storage.
 */
export async function getSession(): Promise<SessionContext | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, full_name, admin_login_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || !profile) return null;
  return { supabase, user: data.user, profile: profile as Profile };
}

/** For API routes: throws 401/403 instead of redirecting. */
export async function requireStudentApi(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'not_signed_in', 'Please log in to continue.');
  if (session.profile.role !== 'student') throw new ApiError(403, 'forbidden', 'This action is only for student accounts.');
  return session;
}

export async function requireAdminApi(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new ApiError(401, 'not_signed_in', 'Please log in to continue.');
  // role comes from the database row of the verified user, never from the request
  if (session.profile.role !== 'admin') throw new ApiError(403, 'forbidden', 'You do not have permission to do this.');
  return session;
}

/** For pages: redirect to the right login screen. */
export async function requireStudentPage(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.profile.role !== 'student') redirect('/admin');
  return session;
}

export async function requireAdminPage(): Promise<SessionContext> {
  const session = await getSession();
  if (!session || session.profile.role !== 'admin') redirect('/admin/login');
  return session;
}
