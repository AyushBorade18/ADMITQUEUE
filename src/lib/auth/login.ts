import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';
import { createAdminClient, createAnonClient } from '@/lib/supabase/server';

export const BAD_CREDENTIALS = 'The ID or password is incorrect.';

/** Finds the Auth user id that belongs to a CAP ID. Server-side only; the result is never sent to the browser. */
export async function userIdForCapId(capId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from('student_login_ids').select('user_id').eq('cap_id', capId).maybeSingle();
  if (error) throw new Error(`cap id lookup failed: ${error.message}`);
  return (data?.user_id as string | undefined) ?? null;
}

export async function userIdForAdminLogin(loginId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().from('profiles').select('id').eq('admin_login_id', loginId).eq('role', 'admin').maybeSingle();
  if (error) throw new Error(`admin lookup failed: ${error.message}`);
  return (data?.id as string | undefined) ?? null;
}

/** The internal Auth email of an account. Used only to call signInWithPassword; never returned to a client. */
export async function authEmailOf(userId: string): Promise<string | null> {
  const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

/**
 * Runs a password check against a throw-away address so that "unknown ID" costs about as much time as
 * "wrong password" (the response time does not reveal whether an ID exists).
 */
async function dummyPasswordCheck(password: string): Promise<void> {
  await createAnonClient().auth.signInWithPassword({ email: `nobody-${randomUUID()}@invalid.example`, password }).catch(() => undefined);
}

/**
 * Verifies the password with Supabase Auth and, on success, stores the session in the cookies of `session`.
 * Returns the verified user id. Every failure looks the same to the caller (BAD_CREDENTIALS), except an
 * unconfirmed email, which Supabase only reports after the password was correct.
 */
export async function signInMapped(session: SupabaseClient, userId: string | null, password: string): Promise<string> {
  const email = userId ? await authEmailOf(userId) : null;
  if (!email) {
    await dummyPasswordCheck(password);
    throw new ApiError(401, 'bad_credentials', BAD_CREDENTIALS);
  }
  const { data, error } = await session.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === 'email_not_confirmed') {
      throw new ApiError(403, 'email_not_confirmed', 'Please confirm your email address first (check your inbox), then log in.');
    }
    if (error && error.status && error.status >= 500) throw new Error(`auth service error: ${error.message}`);
    throw new ApiError(401, 'bad_credentials', BAD_CREDENTIALS);
  }
  return data.user.id;
}
