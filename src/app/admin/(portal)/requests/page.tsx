import { RequestReview } from '@/components/AdminTools';
import { StatusPill } from '@/components/ui';
import { requireAdminPage } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/client/api';

export const metadata = { title: 'Link requests' };
export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const { supabase: db } = await requireAdminPage();
  const reqs = (await db.from('record_link_requests').select('id, user_id, cap_id, status, student_note, review_note, created_at').order('created_at', { ascending: true }).limit(200)).data ?? [];
  const ids = [...new Set(reqs.map((r) => r.user_id as string))];
  const profs = ids.length ? (await db.from('profiles').select('id, full_name').in('id', ids)).data ?? [] : [];
  const name = new Map(profs.map((p) => [p.id as string, p.full_name as string]));
  const pending = reqs.filter((r) => r.status === 'pending');
  const done = reqs.filter((r) => r.status !== 'pending').reverse();
  return (
    <>
      <h1 className="page-title">Record link requests</h1>
      <p className="text-muted">Oldest first (a first-in-first-out queue). Approving links the student&apos;s account to the record with the same CAP ID; check identity before you approve.</p>
      <section className="panel mb-4">
        <h2 className="panel-title">Waiting ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-muted mb-0">Nothing waiting.</p> : pending.map((r, i) => (
          <div key={r.id} className="border-bottom py-3">
            <div className="mb-2"><strong>#{i + 1} · {name.get(r.user_id as string) ?? 'Student'}</strong> claims <strong>{r.cap_id}</strong> <span className="text-muted small">({formatDateTime(r.created_at)})</span>{r.student_note ? <div className="small text-muted">“{r.student_note}”</div> : null}</div>
            <RequestReview id={r.id as string} />
          </div>
        ))}
      </section>
      <section className="panel">
        <h2 className="panel-title">Reviewed</h2>
        <table className="admin-table"><thead><tr><th>CAP ID</th><th>Student</th><th>Result</th><th>Note</th></tr></thead><tbody>
          {done.map((r) => <tr key={r.id}><td>{r.cap_id}</td><td>{name.get(r.user_id as string) ?? ''}</td><td><StatusPill status={r.status as string} /></td><td>{r.review_note}</td></tr>)}
          {done.length === 0 ? <tr><td colSpan={4} className="text-muted">None yet.</td></tr> : null}
        </tbody></table>
      </section>
    </>
  );
}
