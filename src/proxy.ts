// Runs before protected pages: refreshes the Supabase session cookie and sends signed-out visitors to the login page.
// This is a convenience layer. Every page and API route ALSO checks the session itself (src/lib/auth/session.ts),
// and the database enforces Row Level Security, so skipping this file would not expose any data.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === '/admin/login') return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next(); // not configured: the page itself explains the problem

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, { ...options, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }),
        );
      },
    },
  });

  let signedIn = false;
  try {
    const { data } = await supabase.auth.getUser();
    signedIn = Boolean(data.user);
  } catch {
    signedIn = false;
  }

  if (!signedIn) {
    const target = path.startsWith('/admin') ? '/admin/login' : '/login';
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // keep any cookies the refresh attempt cleared
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/preferences/:path*', '/checklist/:path*', '/support/:path*', '/admin/:path*'],
};
