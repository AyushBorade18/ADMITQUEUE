import { Alert } from '@/components/ui';
import { SupportForm } from '@/components/StudentForms';
import { getStudentContext } from '@/lib/student/context';

export const metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  const { snapshot: s } = await getStudentContext();
  return (
    <>
      <h1 className="page-title">Support</h1>
      {s.workspace ? <SupportForm requests={s.supportRequests} /> : <Alert type="info">Your workspace is not available yet.</Alert>}
    </>
  );
}
