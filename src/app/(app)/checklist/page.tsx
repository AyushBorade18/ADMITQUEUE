import { Alert } from '@/components/ui';
import { DocumentChecklist } from '@/components/StudentForms';
import { getStudentContext } from '@/lib/student/context';

export const metadata = { title: 'Document checklist' };
export const dynamic = 'force-dynamic';

export default async function ChecklistPage() {
  const { snapshot: s } = await getStudentContext();
  return (
    <>
      <h1 className="page-title">Document checklist</h1>
      {s.workspace ? <DocumentChecklist docs={s.documents} /> : <Alert type="info">Your workspace is not available yet.</Alert>}
    </>
  );
}
