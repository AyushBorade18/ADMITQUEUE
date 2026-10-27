import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';

export type RegistrationState = 'linked' | 'record_unavailable' | 'pending_verification';

const GENERIC_CONFLICT = "We can't register an account with these details. If you already registered, log in instead or reset your password.";

export function conflictError(): ApiError {
  return new ApiError(409, 'cannot_register', GENERIC_CONFLICT);
}

/**
 * Steps after the Auth account exists (all with the server-only secret key):
 *  1. reserve the CAP ID for this account (PRIMARY KEY on student_login_ids: one account per CAP ID);
 *  2. create/claim the admission workspace (atomic SQL function, see register_workspace).
 * If anything fails the Auth account is deleted again, so no half-registered accounts remain.
 */
export async function finishRegistration(admin: SupabaseClient, userId: string, capId: string, demoMode: boolean): Promise<RegistrationState> {
  const reserve = await admin.from('student_login_ids').insert({ cap_id: capId, user_id: userId });
  if (reserve.error) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    if (reserve.error.code === '23505') throw conflictError();
    throw new Error(`reserve cap id failed: ${reserve.error.message}`);
  }
  const { data, error } = await admin.rpc('register_workspace', { p_user: userId, p_cap_id: capId, p_demo: demoMode });
  if (error || !data) {
    await admin.from('student_login_ids').delete().eq('user_id', userId);
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    if (error?.message?.includes('cap_id_taken')) throw conflictError();
    throw new Error(`register workspace failed: ${error?.message ?? 'no data'}`);
  }
  return (data as { state: RegistrationState }).state;
}
