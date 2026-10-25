import { Alert } from '@/components/ui';
import { PreferencePlanner } from '@/components/StudentForms';
import { getStudentContext } from '@/lib/student/context';
import { listCourses } from '@/lib/student/snapshot';

export const metadata = { title: 'Preferences' };
export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  const { snapshot: s, session } = await getStudentContext();
  if (!s.workspace) {
    return (
      <>
        <h1 className="page-title">Preferences</h1>
        <Alert type="info">Your workspace is not available yet, so preferences cannot be saved.</Alert>
      </>
    );
  }
  const courses = await listCourses(session.supabase);
  const locked = s.workspace.stage === 'admission_completed' || s.record?.allotment_status === 'frozen';
  return (
    <>
      <h1 className="page-title">College and course preferences</h1>
      <p className="text-muted">Build your ordered list (up to 10). It is saved to your account and shown again every time you log in.</p>
      <PreferencePlanner courses={courses} initial={s.preferences.map((p) => p.course.id)} locked={locked} />
    </>
  );
}
