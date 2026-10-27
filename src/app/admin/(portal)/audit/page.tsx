import { ActionButton } from '@/components/AdminActions';
import { requireAdminPage } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/client/api';
import { engine } from '@/lib/engine/ops';

export const metadata = { title: 'Audit and undo' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const { supabase: db, user } = await requireAdminPage();
  const logs = (await db.from('audit_logs').select('id, actor_id, action, entity_type, entity_id, note, undoable, undone_at, created_at').order('id', { ascending: false }).limit(100)).data ?? [];
  const mine = [...logs].filter((l) => l.actor_id === user.id && l.undoable && !l.undone_at).reverse();
  const latest = mine.length ? await engine.undoTop(mine.map((l) => Number(l.id))).catch(() => null) : null;
  return (
    <>
      <h1 className="page-title">Audit log and undo</h1>
      <p className="text-muted">Every staff change is recorded. Only your most recent change can be undone (a stack: last in, first out), and only if nothing touched the data afterwards.</p>
      <div className="table-panel"><div className="table-responsive"><table className="admin-table">
        <thead><tr><th>#</th><th>When</th><th>Action</th><th>Entity</th><th>Note</th><th></th></tr></thead>
        <tbody>{logs.map((l) => (
          <tr key={l.id}><td>{l.id}</td><td>{formatDateTime(l.created_at)}</td><td>{l.action}</td><td>{l.entity_type}</td><td>{l.note}{l.undone_at ? ' (undone)' : ''}</td>
            <td>{Number(l.id) === latest ? <ActionButton url="/api/admin/audit/undo" body={{ id: Number(l.id) }} label="Undo" confirm="Undo this change?" /> : null}</td></tr>
        ))}</tbody></table></div></div>
    </>
  );
}
