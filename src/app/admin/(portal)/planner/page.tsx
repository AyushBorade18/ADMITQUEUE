import { requireAdminPage } from '@/lib/auth/session';
import { formatClock } from '@/lib/client/api';
import { engine } from '@/lib/engine/ops';
import { STAGES, STAGE_LABEL } from '@/lib/stages';

export const metadata = { title: 'Planner' };
export const dynamic = 'force-dynamic';

export default async function PlannerPage() {
  const { supabase: db } = await requireAdminPage();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10));
  const appts = (await db.from('appointments').select('scheduled_date, slot_minutes').eq('status', 'scheduled').gte('scheduled_date', days[0]).lte('scheduled_date', days[6]).limit(5000)).data ?? [];
  const FROM = 20, TO = 35; // 10:00 .. 17:30
  const load = await engine.appointmentLoad({
    rows: 7, cols: 48, fromCol: FROM, toCol: TO,
    bookings: appts.flatMap((a) => { const r = days.indexOf(a.scheduled_date as string); const c = (a.slot_minutes as number) / 30; return r >= 0 ? [[r, c] as [number, number]] : []; }),
  }).catch(() => null);

  const ws = (await db.from('admission_workspaces').select('id, workflow_stage, user_id, created_at').limit(5000)).data ?? [];
  const docs = (await db.from('document_checklists').select('workspace_id, doc_code, status').limit(60000)).data ?? [];
  const types = (await db.from('document_types').select('code, title').order('sort_order')).data ?? [];
  const stageOf = new Map(ws.map((w) => [w.id as string, STAGES.indexOf(w.workflow_stage as (typeof STAGES)[number])]));
  const docIdx = new Map(types.map((t, i) => [t.code as string, i]));
  const cell = new Map<string, number>();
  const stageTotals = STAGES.map(() => 0);
  for (const w of ws) if (w.user_id) stageTotals[stageOf.get(w.id as string) ?? 0]++;
  const missing = new Map<string, number>();
  for (const d of docs) {
    const s = stageOf.get(d.workspace_id as string);
    const di = docIdx.get(d.doc_code as string);
    if (s === undefined || di === undefined) continue;
    if (d.status === 'ready' || d.status === 'verified') cell.set(`${di}:${s}`, (cell.get(`${di}:${s}`) ?? 0) + 1);
    else missing.set(d.workspace_id as string, (missing.get(d.workspace_id as string) ?? 0) + 1);
  }
  const readiness = await engine.docReadiness({ docs: types.length, rounds: STAGES.length, roundTotals: stageTotals, cells: [...cell].map(([k, count]) => { const [doc, round] = k.split(':').map(Number); return { doc, round, count }; }) }).catch(() => null);

  const claimed = ws.filter((w) => w.user_id);
  const ranked = await engine.progressRank(claimed.map((w, i) => ({ studentId: i + 1, token: (w.id as string).slice(0, 8), score: (missing.get(w.id as string) ?? 0) * 10 + (STAGES.length - 1 - (stageOf.get(w.id as string) ?? 0)), enteredAt: w.created_at as string }))).catch(() => null);
  const capByToken = new Map(claimed.map((w) => [(w.id as string).slice(0, 8), w.id as string]));

  return (
    <>
      <h1 className="page-title">Planner</h1>
      <div className="row g-4">
        <div className="col-12"><section className="panel">
          <h2 className="panel-title">Appointment load (next 7 days)</h2>
          {load ? (
            <>
              <p className="small text-muted">A sparse matrix (days × half-hour slots): only {load.nonZeros} booked cells are stored out of {load.rows * load.cols} ({(load.density * 100).toFixed(1)}% filled). Best free slots: {load.bestSlots.slice(0, 3).map(([r, c]) => `${days[r]} ${formatClock(c * 30)}`).join(', ') || 'none'}.</p>
              <table className="admin-table"><thead><tr><th>Day</th><th>Booked</th></tr></thead><tbody>{days.map((d, i) => <tr key={d}><td>{d}</td><td>{load.rowSums[i] ?? 0}</td></tr>)}</tbody></table>
            </>
          ) : <p className="text-muted mb-0">The engine is not available.</p>}
        </section></div>
        <div className="col-lg-7"><section className="panel">
          <h2 className="panel-title">Document readiness by stage</h2>
          {readiness ? (
            <div className="table-responsive"><table className="admin-table"><thead><tr><th>Document</th>{STAGES.map((s) => <th key={s}>{STAGE_LABEL[s].split(' ')[0]}</th>)}</tr></thead><tbody>
              {types.map((t, di) => <tr key={t.code}><td>{t.title}</td>{STAGES.map((s, si) => <td key={s}>{readiness.percent[di * STAGES.length + si] ?? 0}%</td>)}</tr>)}
            </tbody></table></div>
          ) : <p className="text-muted mb-0">The engine is not available.</p>}
          {readiness ? <p className="small text-muted mt-2 mb-0">Dense matrix (documents × stages). Weakest document: {types[readiness.weakestDoc[0]]?.title ?? '-'}.</p> : null}
        </section></div>
        <div className="col-lg-5"><section className="panel">
          <h2 className="panel-title">Follow-up list</h2>
          <p className="small text-muted">A max-heap ranks students with the most work left (missing documents, early stage).</p>
          <ol className="mb-0">{(ranked?.ranked ?? []).slice(0, 10).map((r) => <li key={r.token}><a href={`/admin/students/${capByToken.get(r.token)}`}>{r.token}…</a> <span className="text-muted small">score {r.score}</span></li>)}</ol>
        </section></div>
      </div>
    </>
  );
}
