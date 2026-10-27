'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Alert, Button, StatusPill } from '@/components/ui';
import { api, formatDateTime } from '@/lib/client/api';

type Course = { id: string; code: string; college_name: string; city: string; branch: string; demo_seats: number };

/** Ordered preference planner (max 10). Saved with one call; the database enforces all rules again. */
export function PreferencePlanner({ courses, initial, locked }: { courses: Course[]; initial: string[]; locked: boolean }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(initial);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  const byId = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const available = courses.filter((c) => !chosen.includes(c.id) && `${c.college_name} ${c.branch} ${c.city}`.toLowerCase().includes(q.trim().toLowerCase()));
  const dirty = JSON.stringify(chosen) !== JSON.stringify(initial);

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    setChosen(next);
  }
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/student/preferences', { method: 'PUT', body: { courseIds: chosen } });
      setMsg({ type: 'success', text: 'Preferences saved.' });
      router.refresh();
    } catch (e) {
      setMsg({ type: 'danger', text: e instanceof Error ? e.message : 'Could not save.' });
    }
    setBusy(false);
  }

  return (
    <div className="row g-4">
      <div className="col-lg-6">
        <section className="panel h-100" aria-labelledby="pl-yours">
          <h2 className="panel-title" id="pl-yours">Your order ({chosen.length}/10)</h2>
          {chosen.length === 0 ? <p className="text-muted">Pick courses from the list. The first one is your top choice.</p> : null}
          <ol className="list-group list-group-numbered mb-3" data-testid="chosen-list">
            {chosen.map((id, i) => {
              const c = byId.get(id);
              return (
                <li key={id} className="list-group-item d-flex justify-content-between align-items-center gap-2">
                  <span className="me-auto">{c ? `${c.college_name} - ${c.branch}` : id}</span>
                  {!locked ? (
                    <span className="btn-group btn-group-sm">
                      <button type="button" className="btn btn-outline-secondary" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                      <button type="button" className="btn btn-outline-secondary" aria-label="Move down" disabled={i === chosen.length - 1} onClick={() => move(i, 1)}>↓</button>
                      <button type="button" className="btn btn-outline-danger" aria-label="Remove" onClick={() => setChosen(chosen.filter((x) => x !== id))}>×</button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          {msg ? <Alert type={msg.type}>{msg.text}</Alert> : null}
          {locked ? <Alert type="info">Preferences are locked for your current admission status.</Alert> : (
            <Button type="button" className="btn btn-primary" loading={busy} disabled={!dirty} onClick={save}>Save preferences</Button>
          )}
        </section>
      </div>
      <div className="col-lg-6">
        <section className="panel h-100" aria-labelledby="pl-courses">
          <h2 className="panel-title" id="pl-courses">Demo courses</h2>
          <p className="small text-muted">Fictional colleges for this demonstration.</p>
          <label htmlFor="course-q" className="visually-hidden">Search courses</label>
          <input id="course-q" className="form-control mb-2" placeholder="Search college, branch or city" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="list-group course-scroll" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {available.map((c) => (
              <li key={c.id} className="list-group-item d-flex justify-content-between align-items-center gap-2">
                <span>{c.college_name}<div className="small text-muted">{c.branch} · {c.city} · {c.demo_seats} seats</div></span>
                <button type="button" className="btn btn-sm btn-outline-primary" disabled={locked || chosen.length >= 10} onClick={() => setChosen([...chosen, c.id])}>Add</button>
              </li>
            ))}
            {available.length === 0 ? <li className="list-group-item text-muted">No matching courses.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

type Doc = { code: string; title: string; note: string | null; status: string; staffNote: string | null };
const DOC_OPTIONS = [['not_started', 'Not started'], ['in_progress', 'In progress'], ['ready', 'Ready']] as const;

export function DocumentChecklist({ docs }: { docs: Doc[] }) {
  const router = useRouter();
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  async function set(code: string, status: string) {
    setBusyCode(code);
    setError('');
    try {
      await api('/api/student/documents', { method: 'PATCH', body: { docCode: code, status } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update.');
    }
    setBusyCode(null);
  }
  return (
    <section className="panel" aria-labelledby="cl-title">
      <h2 className="panel-title" id="cl-title">Documents to prepare</h2>
      {error ? <Alert type="danger">{error}</Alert> : null}
      <ul className="list-group">
        {docs.map((d) => {
          const staffOnly = d.status === 'verified' || d.status === 'rejected';
          return (
            <li key={d.code} className="list-group-item">
              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                <div>
                  <strong>{d.title}</strong>
                  {d.note ? <div className="small text-muted">{d.note}</div> : null}
                  {d.staffNote ? <div className="small text-danger">Staff note: {d.staffNote}</div> : null}
                </div>
                {d.status === 'verified' ? (
                  <StatusPill status="verified" label="Verified by staff" />
                ) : (
                  <div className="d-flex align-items-center gap-2">
                    {d.status === 'rejected' ? <StatusPill status="rejected" label="Needs correction" /> : null}
                    <select className="form-select form-select-sm" aria-label={`Status of ${d.title}`} disabled={busyCode === d.code} value={staffOnly ? 'in_progress' : d.status} onChange={(e) => set(d.code, e.target.value)}>
                      {DOC_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="manual-note mt-3 mb-0">Marking &quot;Ready&quot; means you have the document. Only staff can verify it, in person, with the original.</p>
    </section>
  );
}

export function SupportForm({ requests }: { requests: { id: string; subject: string; status: string; createdAt: string }[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api('/api/student/support', { body: { subject, body } });
      setSubject('');
      setBody('');
      setMsg({ type: 'success', text: 'Request sent. Staff will call your token from the service desk.' });
      router.refresh();
    } catch (err) {
      setMsg({ type: 'danger', text: err instanceof Error ? err.message : 'Could not send.' });
    }
    setBusy(false);
  }
  return (
    <div className="row g-4">
      <div className="col-lg-6">
        <form className="panel" onSubmit={submit} aria-labelledby="sup-title">
          <h2 className="panel-title" id="sup-title">Ask the admission cell</h2>
          {msg ? <Alert type={msg.type}>{msg.text}</Alert> : null}
          <label htmlFor="sup-subject" className="form-label fw-semibold">Subject</label>
          <input id="sup-subject" className="form-control mb-2" required minLength={3} maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label htmlFor="sup-body" className="form-label fw-semibold">Details (optional)</label>
          <textarea id="sup-body" className="form-control mb-3" rows={4} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} />
          <Button type="submit" className="btn btn-primary" loading={busy}>Send request</Button>
        </form>
      </div>
      <div className="col-lg-6">
        <section className="panel h-100" aria-labelledby="sup-list">
          <h2 className="panel-title" id="sup-list">Your requests</h2>
          {requests.length === 0 ? <p className="text-muted mb-0">No requests yet.</p> : (
            <ul className="review-history mb-0">
              {requests.map((r) => (
                <li key={r.id} className="d-flex justify-content-between gap-2">
                  <span>{r.subject}<div className="small text-muted">{formatDateTime(r.createdAt)}</div></span>
                  <StatusPill status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
