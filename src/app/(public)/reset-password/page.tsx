import Link from 'next/link';
import { ResetForm } from '@/components/AuthForms';
import { PublicBar } from '@/components/PublicBar';
import { getSession } from '@/lib/auth/session';

export const metadata = { title: 'Choose a new password' };
export const dynamic = 'force-dynamic';

export default async function ResetPage() {
  const session = await getSession().catch(() => null);
  return (
    <>
      <PublicBar action="login" />
      <main className="auth-wrap" id="main">
        <h1 className="page-title mb-1">Choose a new password</h1>
        {session ? (
          <ResetForm />
        ) : (
          <div className="panel">
            <p className="mb-3">This reset link is missing or has expired.</p>
            <Link className="btn btn-primary" href="/forgot-password">
              Request a new link
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
