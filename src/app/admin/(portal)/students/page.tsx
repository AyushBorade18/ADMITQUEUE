import Link from 'next/link';
import { engine } from '@/lib/engine/ops';
import { requireAdminPage } from '@/lib/auth/session';
import { loadStudentRows } from '@/lib/admin/data';
import { STAGE_LABEL, isStage } from '@/lib/stages';

export const metadata = { title: 'Students' };
export const dynamic = 'force-dynamic';

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = '', page = '1' } = await searchParams;
  const { supabase: db } = await requireAdminPage();
  const all = await loadStudentRows(db);
  const query = q.trim().slice(0, 40);
  let rows = all;
  let stats: { algorithm: string; comparisons: number; size: number } | null = null;
  if (query) {
    const looksLikeId = /^[A-Za-z]{0,4}\d*$/.test(query) && /\d/.test(query);
    const payload = all.map((s, i) => ({ id: i, appId: s.capId, name: s.name }));
    const res = await engine.search(looksLikeId ? 'app_prefix' : 'name', looksLikeId ? query.toUpperCase() : query, payload).catch(() => null);
    if (res) {
      rows = res.matches.map((i) => all[i]);
      stats = res.stats;
    }
  }
  const size = 25;
  const p = Math.max(1, Number(page) || 1);
  const slice = rows.slice((p - 1) * size, p * size);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  return (
    <>
      <h1 className="page-title">Students</h1>
      <form className="filter-bar mb-3" method="get">
        <input name="q" className="form-control search" defaultValue={query} placeholder="CAP ID prefix (e.g. DM2600) or name" aria-label="Search" />
        <button className="btn btn-primary" type="submit">Search</button>
        {query ? <Link className="btn btn-outline-secondary" href="/admin/students">Clear</Link> : null}
      </form>
      {stats ? <p className="small text-muted">Found by the C++ engine using <strong>{stats.algorithm}</strong>: {stats.comparisons} comparisons over {stats.size} records.</p> : null}
      <div className="table-panel">
        <div className="table-responsive">
          <table className="admin-table">
            <thead><tr><th>CAP ID</th><th>Name</th><th>Rank</th><th>Stage</th><th>Record</th><th>Account</th></tr></thead>
            <tbody>
              {slice.map((s) => (
                <tr key={s.workspaceId}>
                  <td><Link href={`/admin/students/${s.workspaceId}`}>{s.capId}</Link></td>
                  <td>{s.name}</td>
                  <td>{s.rank ?? '-'}</td>
                  <td>{isStage(s.stage) ? STAGE_LABEL[s.stage] : s.stage}</td>
                  <td>{s.recordState.replace('_', ' ')}</td>
                  <td>{s.userId ? 'registered' : 'not claimed'}</td>
                </tr>
              ))}
              {slice.length === 0 ? <tr><td colSpan={6} className="text-muted">No matching students.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <div className="pager">
        <span>{rows.length} total · page {p} of {pages}</span>
        {p > 1 ? <Link className="btn btn-outline-secondary btn-sm" href={`?q=${encodeURIComponent(query)}&page=${p - 1}`}>Previous</Link> : null}
        {p < pages ? <Link className="btn btn-outline-secondary btn-sm" href={`?q=${encodeURIComponent(query)}&page=${p + 1}`}>Next</Link> : null}
      </div>
    </>
  );
}
