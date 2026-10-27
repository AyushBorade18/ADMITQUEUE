import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/AuthForms';
import { Brand } from '@/components/PublicBar';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Admin log in' };
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const session = await getSession().catch(() => null);
  if (session?.profile.role === 'admin') redirect('/admin');
  return (
    <>
      <header className="public-bar">
        <div className="container d-flex align-items-center justify-content-between">
          <Brand />
          <span className="demo-badge">Staff</span>
        </div>
      </header>
      <main className="auth-wrap" id="main">
        <h1 className="page-title mb-1">Admin log in</h1>
<<<<<<< HEAD
        <p className="text-muted mb-4">For college admission cell staff.</p>
        <LoginForm admin notice={notice} />
=======
        <p className="text-muted mb-4">For college admission cell staff. Admin accounts are created by the administrator, never through registration.</p>
        <LoginForm demo={false} admin notice={notice} />
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
        <p className="text-center small mt-4">
          <Link href="/login">Student? Log in with your CAP ID</Link>
        </p>
      </main>
    </>
  );
}
