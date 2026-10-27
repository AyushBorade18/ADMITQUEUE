import { ActionButton } from '@/components/AdminActions';
import { StatusPill } from '@/components/ui';
import { requireAdminPage } from '@/lib/auth/session';

export const metadata = { title: 'Service desk' };
export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  const { supabase: db } = await requireAdminPage();
  const counters = (await db.from('service_counters').select('id, name, is_open').order('id')).data ?? [];
  const items = (await db.from('service_queue_items').select('id, seq, kind, subject, level, status, counter_id, workspace_id').in('status', ['waiting', 'called', 'serving']).order('seq').limit(300)).data ?? [];
  const wsIds = [...new Set(items.map((i) => i.workspace_id as string))];
  const ws = wsIds.length ? (await db.from('admission_workspaces').select('id, cap_id').in('id', wsIds)).data ?? [] : [];
  const cap = new Map(ws.map((w) => [w.id as string, w.cap_id as string]));
  const code = (level: number, seq: number) => `${level >= 3 ? 'R' : 'P'}${String(seq).padStart(3, '0')}`;
  const waiting = items.filter((i) => i.status === 'waiting');
  const active = items.filter((i) => i.status !== 'waiting');
  return (
    <>
      <h1 className="page-title">Service desk</h1>
      <p className="text-muted">The engine picks who is called next: a priority queue for urgent requests and a normal queue (first come, first served) for the rest, with a fairness rule so regular students are not left waiting forever. Two staff clicking at once is protected by a version check.</p>
      <div className="row g-3 mb-4">
        {counters.map((c) => {
          const cur = active.find((i) => i.counter_id === c.id);
          return (
            <div className="col-md-4" key={c.id}><section className="panel h-100">
              <h2 className="panel-title">{c.name} <StatusPill status={c.is_open ? 'completed' : 'rejected'} label={c.is_open ? 'open' : 'closed'} /></h2>
              {cur ? (
                <>
                  <p className="mb-2"><strong>{code(cur.level as number, cur.seq as number)}</strong> · {cap.get(cur.workspace_id as string)} · {cur.status}<div className="small text-muted">{cur.subject}</div></p>
                  <div className="d-flex flex-wrap gap-2">
                    {cur.status === 'called' ? <ActionButton url="/api/admin/queue" body={{ action: 'start', code: code(cur.level as number, cur.seq as number) }} label="Start" /> : null}
                    {cur.status === 'called' ? <ActionButton url="/api/admin/queue" body={{ action: 'noshow', code: code(cur.level as number, cur.seq as number) }} label="No-show" className="btn btn-outline-danger btn-sm" /> : null}
                    {cur.status === 'serving' ? <ActionButton url="/api/admin/queue" body={{ action: 'complete', code: code(cur.level as number, cur.seq as number) }} label="Complete" /> : null}
                  </div>
                </>
              ) : c.is_open ? <ActionButton url="/api/admin/queue" body={{ action: 'call', counterId: c.id }} label="Call next" className="btn btn-primary btn-sm" /> : <p className="text-muted mb-0">Closed.</p>}
              <div className="mt-2"><ActionButton url="/api/admin/queue" body={{ action: c.is_open ? 'close_counter' : 'open_counter', counterId: c.id }} label={c.is_open ? 'Close counter' : 'Open counter'} className="btn btn-outline-secondary btn-sm" /></div>
            </section></div>
          );
        })}
      </div>
      <section className="panel"><h2 className="panel-title">Waiting ({waiting.length})</h2>
        <table className="admin-table"><thead><tr><th>Token</th><th>CAP ID</th><th>Type</th><th>Subject</th><th></th></tr></thead><tbody>
          {waiting.map((i) => <tr key={i.id}><td>{code(i.level as number, i.seq as number)}</td><td>{cap.get(i.workspace_id as string)}</td><td>{i.kind}</td><td>{i.subject}</td>
            <td><ActionButton url="/api/admin/queue" body={{ action: 'cancel', code: code(i.level as number, i.seq as number) }} label="Cancel" className="btn btn-outline-danger btn-sm" confirm="Cancel this request?" /></td></tr>)}
          {waiting.length === 0 ? <tr><td colSpan={5} className="text-muted">Nobody is waiting.</td></tr> : null}
        </tbody></table>
      </section>
    </>
  );
}
