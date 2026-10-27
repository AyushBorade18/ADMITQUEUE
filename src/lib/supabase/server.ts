import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { isProduction, supabasePublishableKey, supabaseSecretKey, supabaseUrl } from '@/lib/env';

/** Cookie settings for the session: not readable by page scripts, https-only in production. */
export function sessionCookieOptions() {
  return { httpOnly: true, secure: isProduction(), sameSite: 'lax' as const, path: '/' };
}

/**
 * Supabase client that acts AS THE SIGNED-IN USER (their session cookie). Row Level Security applies to every
 * query made with it. Use this for all student and admin data access.
 */
export async function createSessionClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...sessionCookieOptions() });
          }
        } catch {
          // Called from a Server Component: cookies cannot be written there. proxy.ts refreshes the session.
        }
      },
    },
  });
}

let adminClient: SupabaseClient | null = null;

/**
 * Supabase client with the SECRET key. It bypasses Row Level Security, so it is used only for the few things
 * a signed-out or privileged server step must do: CAP ID lookup at login, registration, rate limiting.
 * Never return anything from it to the browser without checking who is asking.
 */
export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(supabaseUrl(), supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return adminClient;
}

/** A client with no session at all (used for the dummy password check that hides unknown CAP IDs). */
export function createAnonClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
