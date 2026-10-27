import Link from 'next/link';
import { ForgotForm } from '@/components/AuthForms';
import { PublicBar } from '@/components/PublicBar';

export const metadata = { title: 'Forgot password' };

export default function ForgotPage() {
  return (
    <>
      <PublicBar action="login" />
      <main className="auth-wrap" id="main">
        <h1 className="page-title mb-1">Forgot your password?</h1>
        <p className="text-muted mb-4">Enter your CAP Application ID. We email a reset link to the address on that account.</p>
        <ForgotForm />
        <p className="text-center mt-3">
          <Link href="/login">Back to log in</Link>
        </p>
      </main>
    </>
  );
}
