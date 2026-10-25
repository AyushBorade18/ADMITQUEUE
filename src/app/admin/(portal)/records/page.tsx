import Link from 'next/link';
import { ActionForm } from '@/components/AdminActions';
import { CsvImport } from '@/components/AdminTools';
import { requireAdminPage } from '@/lib/auth/session';

export const metadata = { title: 'CAP records' };
export const dynamic = 'force-dynamic';

export default async function RecordsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page = '1' } = await searchParams;
  const { supabase: db } = await requireAdminPage();
  const size = 25;
  const p = Math.max(1, Number(page) || 1);
  const { data, count } = await db.from('cap_records').select('id, cap_id, candidate_name, merit_rank, verification_status, allotment_status, is_synthetic', { count: 'exact' }).order('cap_id').range((p - 1) * size, p * size - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h1 className="page-title mb-0">CAP records</h1>
        <a className="btn btn-outline-primary btn-sm" href="/api/admin/records/export">Download CSV</a>
      </div>
      <p className="text-muted">Records stored in this system&apos;s own database. Fictional demo records are marked. Only add real candidate data if you are authorised to hold it.</p>
      <div className="table-panel mb-4"><div className="table-responsive"><table className="admin-table">
        <thead><tr><th>CAP ID</th><th>Name</th><th>Rank</th><th>Verification</th><th>Allotment</th><th></th></tr></thead>
        <tbody>{(data ?? []).map((r) => (
          <tr key={r.id}><td>{r.cap_id}</td><td>{r.candidate_name}</td><td>{r.merit_rank ?? '-'}</td><td>{r.verification_status}</td><td>{r.allotment_status}</td><td>{r.is_synthetic ? <span className="demo-badge">fictional</span> : null}</td></tr>
        ))}</tbody></table></div></div>
      <div className="pager mb-4"><span>{count ?? 0} records · page {p} of {pages}</span>
        {p > 1 ? <Link className="btn btn-outline-secondary btn-sm" href={`?page=${p - 1}`}>Previous</Link> : null}
        {p < pages ? <Link className="btn btn-outline-secondary btn-sm" href={`?page=${p + 1}`}>Next</Link> : null}</div>
      <div className="row g-4">
        <div className="col-lg-6"><section className="panel"><h2 className="panel-title">Add one record</h2>
          <ActionForm url="/api/admin/records" submit="Add record" onDoneMessage="Record added."
            fields={[{ name: 'capId', label: 'CAP ID', type: 'text', required: true }, { name: 'candidateName', label: 'Name', type: 'text', required: true }, { name: 'category', label: 'Category', type: 'text' }, { name: 'meritRank', label: 'Merit rank', type: 'number' }, { name: 'percentile', label: 'Percentile', type: 'number' }]} />
        </section></div>
        <div className="col-lg-6"><section className="panel"><h2 className="panel-title">Import CSV</h2><CsvImport /></section></div>
      </div>
    </>
  );
}
