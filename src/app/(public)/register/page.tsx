import Link from 'next/link';
import { RegisterForm } from '@/components/AuthForms';
import { PublicBar } from '@/components/PublicBar';
import { isDemoMode } from '@/lib/env';

export const metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <>
      <PublicBar action="login" />
      <main className="auth-wrap wide" id="main">
        <h1 className="page-title mb-1">Create your account</h1>
        <p className="text-muted mb-4">Register once with your CAP Application ID, then log in with the ID and your password.</p>
        <RegisterForm demo={isDemoMode()} />
        <p className="text-center text-muted mt-3">
          Already registered? <Link href="/login">Log in</Link>
        </p>
      </main>
    </>
  );
}
