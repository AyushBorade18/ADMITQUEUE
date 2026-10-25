import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/AuthForms';
import { PublicBar } from '@/components/PublicBar';
import { getSession } from '@/lib/auth/session';
import { isDemoMode } from '@/lib/env';

export const metadata = { title: 'Log in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const session = await getSession().catch(() => null);
  if (session) redirect(session.profile.role === 'admin' ? '/admin' : '/dashboard');
  return (
    <>
      <PublicBar action="register" />
      <main className="auth-wrap" id="main">
        <h1 className="page-title mb-1">Log in</h1>
        <p className="text-muted mb-4">Use your CAP Application ID. Your saved details load automatically.</p>
        <LoginForm demo={isDemoMode()} notice={notice} />
        <p className="text-center text-muted mt-3">
          New here? <Link href="/register">Register with your CAP ID</Link>
        </p>
        <p className="text-center small mt-4">
          <Link href="/admin/login">College staff? Admin log in</Link>
        </p>
      </main>
    </>
  );
}
