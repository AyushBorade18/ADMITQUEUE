import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton, ActionForm } from '@/components/AdminActions';
import { StatusPill } from '@/components/ui';
import { requireAdminPage } from '@/lib/auth/session';
import { formatDateTime } from '@/lib/client/api';
import { STAGES, STAGE_LABEL, allowedNextStages, isStage } from '@/lib/stages';

export const metadata = { title: 'Student' };
export const dynamic = 'force-dynamic';

export default async function StudentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase: db } = await requireAdminPage();
  const ws = await db.from('admission_workspaces').select('id, cap_id, user_id, workflow_stage, cap_record_id, record_state, is_synthetic').eq('id', id).maybeSingle();
  if (!ws.data) notFound();
  const w = ws.data;
  const record = w.cap_record_id ? (await db.from('cap_records').select('*').eq('id', w.cap_record_id).maybeSingle()).data : null;
  const profile = w.user_id ? (await db.from('profiles').select('full_name').eq('id', w.user_id).maybeSingle()).data : null;
  const types = (await db.from('document_types').select('code, title').order('sort_order')).data ?? [];
  const docs = (await db.from('document_checklists').select('doc_code, status, staff_note').eq('workspace_id', id)).data ?? [];
  const events = (await db.from('workflow_events').select('id, to_stage, note, created_at').eq('workspace_id', id).order('created_at', { ascending: false }).limit(10)).data ?? [];
  const docBy = new Map(docs.map((d) => [d.doc_code as string, d]));
  const stage = isStage(w.workflow_stage) ? w.workflow_stage : STAGES[0];
  const next = allowedNextStages(stage, record?.allotment_status === 'allotted' || record?.allotment_status === 'frozen');

  return (
    <>
      <p className="mb-2"><Link href="/admin/students">← All students</Link></p>
      <h1 className="page-title">{record?.candidate_name ?? profile?.full_name ?? 'Unclaimed workspace'} <span className="text-muted fs-5">{w.cap_id}</span></h1>
      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <section className="panel h-100">
            <h2 className="panel-title">Workflow stage</h2>
            <p>Current: <strong>{STAGE_LABEL[stage]}</strong> {w.is_synthetic ? <span className="demo-badge">fictional</span> : null}</p>
            {next.length > 0 ? (
              <ActionForm url="/api/admin/students/stage" fixed={{ workspaceId: id }} submit="Move stage"
                fields={[{ name: 'stage', label: 'Move to', type: 'select', required: true, options: next.map((s) => [s, STAGE_LABEL[s]]) }, { name: 'note', label: 'Note (optional)', type: 'text' }]} />
            ) : <p className="text-muted mb-0">No further stage is available.</p>}
          </section>
        </div>
        <div className="col-lg-6">
          <section className="panel h-100">
            <h2 className="panel-title">CAP record</h2>
            {record ? (
              <dl className="cap-summary mb-0">
                <dt>Rank</dt><dd>{record.merit_rank ?? '-'}</dd>
                <dt>Category</dt><dd>{record.category ?? '-'}</dd>
                <dt>Application</dt><dd>{record.application_status}</dd>
                <dt>Verification</dt><dd>{record.verification_status}</dd>
                <dt>Allotment</dt><dd>{record.allotment_status}</dd>
              </dl>
            ) : (
              <>
                <p className="text-muted">No record is linked to this workspace.</p>
                <ActionButton url="/api/admin/students/link" body={{ workspaceId: id }} label="Link record with this CAP ID" confirm="Link the record that has this CAP ID?" />
              </>
            )}
          </section>
        </div>
      </div>
      <section className="panel mb-4">
        <h2 className="panel-title">Documents</h2>
        <div className="table-responsive"><table className="admin-table"><thead><tr><th>Document</th><th>Status</th><th>Staff action</th></tr></thead><tbody>
          {types.map((t) => {
            const d = docBy.get(t.code as string);
            return (
              <tr key={t.code}>
                <td>{t.title}{d?.staff_note ? <div className="cell-sub">{d.staff_note}</div> : null}</td>
                <td><StatusPill status={(d?.status as string) ?? 'not_started'} /></td>
                <td className="d-flex gap-2">
                  <ActionButton url="/api/admin/documents" body={{ workspaceId: id, docCode: t.code, status: 'verified' }} label="Verify (original seen)" />
                  <ActionButton url="/api/admin/documents" body={{ workspaceId: id, docCode: t.code, status: 'rejected', staffNote: 'Please bring a corrected copy.' }} label="Ask correction" className="btn btn-outline-danger btn-sm" />
                </td>
              </tr>
            );
          })}
        </tbody></table></div>
      </section>
      <section className="panel mb-4">
        <h2 className="panel-title">Book an appointment</h2>
        <ActionForm url="/api/admin/appointments" fixed={{ workspaceId: id }} submit="Book"
          fields={[{ name: 'date', label: 'Date', type: 'date', required: true }, { name: 'slotMinutes', label: 'Start (minutes after midnight, multiple of 30, e.g. 600 = 10:00)', type: 'number', required: true }, { name: 'purpose', label: 'Purpose', type: 'text' }]} />
      </section>
      <section className="panel">
        <h2 className="panel-title">History</h2>
        <ul className="review-history mb-0">{events.map((e) => <li key={e.id}>{STAGE_LABEL[e.to_stage as keyof typeof STAGE_LABEL] ?? e.to_stage}{e.note ? ` - ${e.note}` : ''}<div className="small text-muted">{formatDateTime(e.created_at)}</div></li>)}</ul>
      </section>
    </>
  );
}
