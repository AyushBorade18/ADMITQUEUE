import Link from 'next/link';
import { engine } from '@/lib/engine/ops';
import { requireAdminPage } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/client/api';

export const metadata = { title: 'Admin dashboard' };
export const dynamic = 'force-dynamic';

async function count(db: Awaited<ReturnType<typeof requireAdminPage>>['supabase'], table: string, filter?: (q: any) => any) {
  let q = db.from(table).select('id', { count: 'exact', head: true });
  if (filter) q = filter(q);
  const { count: n } = await q;
  return n ?? 0;
}

export default async function AdminDashboard() {
  const { supabase: db } = await requireAdminPage();
  const [students, records, pending, waiting, appts] = await Promise.all([
    count(db, 'admission_workspaces', (q) => q.not('user_id', 'is', null)),
    count(db, 'cap_records'),
    count(db, 'record_link_requests', (q) => q.eq('status', 'pending')),
    count(db, 'service_queue_items', (q) => q.eq('status', 'waiting')),
    count(db, 'appointments', (q) => q.eq('status', 'scheduled')),
  ]);
  const audit = await db.from('audit_logs').select('id, action, entity_type, note, created_at').order('id', { ascending: false }).limit(8);
<<<<<<< HEAD
  const health = await engine.health().then((h) => ({ ok: h.selfCheck, name: h.mode === 'cpp' ? 'C++ program (cpp/build/engine)' : 'TypeScript copy of the engine steps (C++ program not built here)' })).catch(() => ({ ok: false, name: 'not available' }));
=======
  const health = await engine.health().then((h) => ({ ok: h.selfCheck, name: h.engine })).catch(() => ({ ok: false, name: 'not available' }));
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
  const cards: [string, number, string, string][] = [
    ['Registered students', students, '/admin/students', 'total'],
    ['CAP records', records, '/admin/records', 'approved'],
    ['Link requests waiting', pending, '/admin/requests', 'pending'],
    ['Service desk waiting', waiting, '/admin/queue', 'verification'],
    ['Appointments scheduled', appts, '/admin/appointments', 'approved'],
  ];
  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <div className="row g-3 mb-4">
        {cards.map(([label, n, href, cls]) => (
          <div className="col-6 col-lg" key={label}>
            <Link href={href} className={`stat-card ${cls} d-block text-decoration-none`}><div className="num">{n}</div><div className="lbl">{label}</div></Link>
          </div>
        ))}
      </div>
      <div className="row g-4">
        <div className="col-lg-8">
          <section className="panel"><h2 className="panel-title">Recent staff actions</h2>
            {(audit.data ?? []).length === 0 ? <p className="text-muted mb-0">Nothing yet.</p> : (
              <ul className="review-history mb-0">{audit.data!.map((a) => <li key={a.id}>#{a.id} {a.action} <span className="text-muted">({a.entity_type}){a.note ? ` - ${a.note}` : ''}</span><div className="small text-muted">{formatDateTime(a.created_at)}</div></li>)}</ul>
            )}
          </section>
        </div>
        <div className="col-lg-4">
<<<<<<< HEAD
          <section className="panel"><h2 className="panel-title">Engine</h2>
            <p className="mb-1"><span className={`status-pill ${health.ok ? 'completed' : 'rejected'}`}>{health.ok ? 'running' : 'not available'}</span></p>
            <p className="small text-muted mb-0">Running: {health.name}. It does the searching, sorting, queue/stack steps and the allotment; everything else is Next.js.</p>
=======
          <section className="panel"><h2 className="panel-title">C++ engine</h2>
            <p className="mb-1"><span className={`status-pill ${health.ok ? 'completed' : 'rejected'}`}>{health.ok ? 'running' : 'not available'}</span></p>
            <p className="small text-muted mb-0">{health.name}. Search, sorting, queueing, undo, planning and allotment run in this executable.</p>
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
          </section>
        </div>
      </div>
    </>
  );
}
