import { Brand } from '@/components/PublicBar';
import { LogoutButton } from '@/components/LogoutButton';
import { AdminNavLinks } from '@/components/NavLinks';

export function AdminShell({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <>
      <header className="admin-nav">
        <div className="container d-flex flex-wrap align-items-center gap-2 gap-md-3">
          <Brand href="/admin" />
          <span className="admin-badge">Admin</span>
          <AdminNavLinks />
          <div className="d-flex align-items-center gap-3 ms-auto">
            <span className="role-chip">{name}</span>
            <LogoutButton redirectTo="/admin/login?notice=loggedout" api="/api/auth/logout" />
          </div>
        </div>
      </header>
      <main className="container py-4" id="main">
        {children}
      </main>
    </>
  );
}
