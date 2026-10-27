// "Pending actions" shown on the dashboard. Pure function of the stored data (no invented content).
import type { StudentSnapshot } from '@/lib/student/snapshot';

export type PendingAction = { id: string; text: string; href?: string; tone: 'info' | 'warning' };

export function pendingActions(s: Pick<StudentSnapshot, 'state' | 'preferences' | 'documents' | 'workspace' | 'record' | 'linkRequest'>): PendingAction[] {
  const out: PendingAction[] = [];
  if (s.state === 'pending_verification') {
    out.push({ id: 'wait-verify', text: 'Staff are verifying that your CAP ID is yours. Your saved details appear as soon as they approve.', tone: 'info' });
    return out;
  }
  if (s.state === 'no_workspace') {
    out.push({ id: 'contact', text: 'Your claim was not approved. Contact the admission cell to resolve it.', tone: 'warning' });
    return out;
  }
  if (s.state === 'record_unavailable' && s.linkRequest?.status !== 'pending') {
    out.push({ id: 'request-link', text: 'No admission record is linked yet. Ask staff to verify and link one if you have an allotment.', tone: 'info' });
  }
  if (s.preferences.length === 0 && s.workspace && s.workspace.stage !== 'admission_completed') {
    out.push({ id: 'prefs', text: 'Save your ordered college and course preferences.', href: '/preferences', tone: 'warning' });
  }
  const notReady = s.documents.filter((d) => ['not_started', 'in_progress', 'rejected'].includes(d.status));
  if (notReady.length > 0) {
    out.push({ id: 'docs', text: `${notReady.length} document${notReady.length === 1 ? '' : 's'} still to prepare.`, href: '/checklist', tone: 'warning' });
  }
  const rejected = s.documents.filter((d) => d.status === 'rejected');
  if (rejected.length > 0) {
    out.push({ id: 'docs-fix', text: `Staff asked for corrections on ${rejected.length} document${rejected.length === 1 ? '' : 's'}.`, href: '/checklist', tone: 'warning' });
  }
  if (s.record?.allotment_status === 'allotted' && s.workspace?.stage === 'allotment_recorded') {
    out.push({ id: 'accept', text: 'Your allotment is recorded. Prepare to report to the college with your documents.', tone: 'info' });
  }
  return out;
}
