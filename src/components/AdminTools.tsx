'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/client/api';

export function CsvImport() {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ type: 'success' | 'danger' | 'info'; text: string; problems?: string[] } | null>(null);
  async function run(dryRun: boolean) {
    setBusy(true);
    setOut(null);
    try {
      const r = await api<{ imported: number; wouldImport: number; duplicateInFile: number; alreadyExists: number; problems: string[]; problemCount: number }>('/api/admin/records/import', { body: { csv, dryRun } });
      setOut({ type: dryRun ? 'info' : 'success', text: `${dryRun ? 'Check only: ' : 'Imported '}${dryRun ? r.wouldImport : r.imported} new, ${r.alreadyExists} already stored, ${r.duplicateInFile} repeated in the file, ${r.problemCount} rows with problems.`, problems: r.problems });
      if (!dryRun) router.refresh();
    } catch (e) {
      setOut({ type: 'danger', text: e instanceof Error ? e.message : 'Import failed.' });
    }
    setBusy(false);
  }
  return (
    <div>
      <label className="form-label" htmlFor="csv">Paste CSV rows: cap_id,name,category,merit_rank,percentile</label>
      <textarea id="csv" className="form-control mb-2" rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="EN26900001,Test Student,OPEN,901,45.5" />
      <div className="d-flex gap-2 mb-2">
        <Button type="button" className="btn btn-outline-primary btn-sm" loading={busy} disabled={!csv.trim()} onClick={() => run(true)}>Check only</Button>
        <Button type="button" className="btn btn-primary btn-sm" loading={busy} disabled={!csv.trim()} onClick={() => run(false)}>Import</Button>
      </div>
      {out ? <Alert type={out.type}>{out.text}{out.problems?.length ? <ul className="mb-0 mt-1">{out.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}</Alert> : null}
    </div>
  );
}

export function AllotmentRunner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ message: string; considered: number; changeCount: number; applied: number; sample: { capId: string; from: string; to: string }[]; waiting: number } | null>(null);
  const [error, setError] = useState('');
  async function run(round: 1 | 2, apply: boolean) {
    if (apply && !window.confirm(`Apply round ${round} to the stored records? Each change is logged and can be undone one by one.`)) return;
    setBusy(true);
    setError('');
    try {
      setRes(await api('/api/admin/allotment', { body: { round, apply } }));
      if (apply) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
    setBusy(false);
  }
  return (
    <div>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {([1, 2] as const).map((r) => (
          <span key={r} className="btn-group">
            <Button type="button" className="btn btn-outline-primary" loading={busy} onClick={() => run(r, false)}>Preview round {r}</Button>
            <Button type="button" className="btn btn-primary" loading={busy} onClick={() => run(r, true)}>Apply round {r}</Button>
          </span>
        ))}
      </div>
      {error ? <Alert type="danger">{error}</Alert> : null}
      {res ? (
        <Alert type="info">
          {res.message} Considered {res.considered} students; {res.changeCount} would change{res.applied ? `, ${res.applied} applied` : ''}; {res.waiting} on the waiting list.
          {res.sample.length ? <ul className="mb-0 mt-1">{res.sample.map((s) => <li key={s.capId}>{s.capId}: {s.from} → {s.to}</li>)}</ul> : null}
        </Alert>
      ) : null}
    </div>
  );
}

export function RequestReview({ id }: { id: string }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError('');
    try {
      await api('/api/admin/requests', { body: { id, decision, note } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
    setBusy(false);
  }
  return (
    <div className="d-flex flex-wrap gap-2 align-items-center">
      <input className="form-control form-control-sm" style={{ maxWidth: 260 }} aria-label="Note" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="button" className="btn btn-primary btn-sm" loading={busy} onClick={() => decide('approve')}>Approve link</Button>
      <Button type="button" className="btn btn-outline-danger btn-sm" loading={busy} onClick={() => decide('reject')}>Reject</Button>
      {error ? <span className="text-danger small" role="alert">{error}</span> : null}
    </div>
  );
}
