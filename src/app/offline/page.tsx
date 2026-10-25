import Link from 'next/link';
import { PublicBar } from '@/components/PublicBar';

export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <>
      <PublicBar />
      <main className="auth-wrap wide" id="main">
        <div className="panel">
          <h1 className="page-title">You are offline</h1>
          <p className="text-muted">
            AdmitQueue keeps your admission records on the server, so viewing or changing them needs an internet connection. Nothing was saved while you were offline.
          </p>
          <p className="text-muted">The installed app only stores its own screens, never your personal data. Reconnect and try again.</p>
          <Link className="btn btn-primary" href="/dashboard">
            Try again
          </Link>
        </div>
      </main>
    </>
  );
}
