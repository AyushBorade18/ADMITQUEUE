import { StudentShell } from '@/components/StudentShell';
import { getStudentContext } from '@/lib/student/context';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { snapshot } = await getStudentContext();
  return (
    <StudentShell name={snapshot.fullName} unread={snapshot.notifications.filter((n) => !n.isRead).length}>
      {children}
    </StudentShell>
  );
}
