import Link from 'next/link';
import { Brand } from '@/components/PublicBar';
import { LogoutButton } from '@/components/LogoutButton';
import { InstallButton, OnlineDot } from '@/components/PwaStatus';
import { StudentNavLinks } from '@/components/NavLinks';

export function StudentShell({ name, unread, children }: { name: string; unread: number; children: React.ReactNode }) {
  return (
    <>
      <header className="app-nav">
        <div className="container d-flex flex-wrap align-items-center gap-2 gap-md-3">
          <Brand href="/dashboard" />
          <StudentNavLinks unread={unread} />
          <div className="d-flex align-items-center gap-3 ms-auto">
            <OnlineDot />
            <InstallButton />
            <span className="text-muted small">{name}</span>
            <LogoutButton redirectTo="/login?notice=loggedout" api="/api/auth/logout" />
          </div>
        </div>
      </header>
      <main className="container py-4" id="main">
        {children}
      </main>
      <footer className="container pb-4 small text-muted text-center">
        Independent project. Not connected to the CET Cell. <Link href="/support">Need help?</Link>
      </footer>
    </>
  );
}
