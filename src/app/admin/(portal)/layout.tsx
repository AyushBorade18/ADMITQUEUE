import { AdminShell } from '@/components/AdminShell';
import { requireAdminPage } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminPage();
  return <AdminShell name={profile.full_name}>{children}</AdminShell>;
}
