import { ActionButton } from '@/components/AdminActions';
import { requireAdminPage } from '@/lib/auth/session';
import { formatClock, formatDay } from '@/lib/client/api';

export const metadata = { title: 'Appointments' };
export const dynamic = 'force-dynamic';

export default async function AppointmentsPage() {
  const { supabase: db } = await requireAdminPage();
  const rows = (await db.from('appointments').select('id, workspace_id, scheduled_date, slot_minutes, purpose, status').eq('status', 'scheduled').order('scheduled_date').order('slot_minutes').limit(300)).data ?? [];
  const ids = [...new Set(rows.map((r) => r.workspace_id as string))];
  const ws = ids.length ? (await db.from('admission_workspaces').select('id, cap_id').in('id', ids)).data ?? [] : [];
  const cap = new Map(ws.map((w) => [w.id as string, w.cap_id as string]));
  return (
    <>
      <h1 className="page-title">Appointments</h1>
      <p className="text-muted">Book appointments from a student&apos;s page. Each student can have one scheduled appointment.</p>
      <div className="table-panel"><div className="table-responsive"><table className="admin-table">
        <thead><tr><th>Date</th><th>Time</th><th>CAP ID</th><th>Purpose</th><th></th></tr></thead><tbody>
          {rows.map((r) => (
            <tr key={r.id}><td>{formatDay(r.scheduled_date)}</td><td>{formatClock(r.slot_minutes as number)}</td><td>{cap.get(r.workspace_id as string)}</td><td>{r.purpose}</td>
              <td className="d-flex gap-2">
                <ActionButton method="PATCH" url="/api/admin/appointments" body={{ id: r.id, status: 'completed' }} label="Completed" />
                <ActionButton method="PATCH" url="/api/admin/appointments" body={{ id: r.id, status: 'missed' }} label="Missed" className="btn btn-outline-secondary btn-sm" />
                <ActionButton method="PATCH" url="/api/admin/appointments" body={{ id: r.id, status: 'cancelled' }} label="Cancel" className="btn btn-outline-danger btn-sm" confirm="Cancel this appointment?" />
              </td></tr>
          ))}
          {rows.length === 0 ? <tr><td colSpan={5} className="text-muted">No scheduled appointments.</td></tr> : null}
        </tbody></table></div></div>
    </>
  );
}
