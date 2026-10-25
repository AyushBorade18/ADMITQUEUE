import { NextResponse, type NextRequest } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { appUrl } from '@/lib/env';

export const dynamic = 'force-dynamic';

const ALLOWED_NEXT = new Set(['/dashboard', '/reset-password', '/login']);

/** Target of the links in Supabase emails (confirm email / reset password): exchanges the code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const nextParam = request.nextUrl.searchParams.get('next') || '/dashboard';
  const next = ALLOWED_NEXT.has(nextParam) ? nextParam : '/dashboard';
  const base = appUrl();
  if (!code) return NextResponse.redirect(`${base}/login?notice=link_invalid`);
  const session = await createSessionClient();
  const { error } = await session.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${base}/login?notice=${next === '/reset-password' ? 'reset_failed' : 'confirm_failed'}`);
  return NextResponse.redirect(`${base}${next}`);
}
