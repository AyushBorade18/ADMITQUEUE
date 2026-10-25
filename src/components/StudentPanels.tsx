'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { api, formatDateTime } from '@/lib/client/api';

type Note = { id: string; title: string; body: string | null; kind: string; isRead: boolean; createdAt: string };

export function NotificationsPanel({ notes }: { notes: Note[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const unread = notes.filter((n) => !n.isRead).length;
  async function markAll() {
    setBusy(true);
    setError('');
    try {
      await api('/api/student/notifications', { method: 'POST', body: { all: true } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update notifications.');
    }
    setBusy(false);
  }
  return (
    <section className="panel h-100" aria-labelledby="notes-title">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="panel-title mb-0" id="notes-title">
          Notifications {unread ? <span className="badge bg-primary ms-1">{unread} new</span> : null}
        </h2>
        {unread ? (
          <Button type="button" className="btn btn-outline-primary btn-sm" loading={busy} onClick={markAll}>
            Mark all read
          </Button>
        ) : null}
      </div>
      {error ? <Alert type="danger">{error}</Alert> : null}
      {notes.length === 0 ? (
        <p className="text-muted mb-0">No notifications yet.</p>
      ) : (
        <ul className="review-history">
          {notes.map((n) => (
            <li key={n.id}>
              <div className={n.isRead ? '' : 'fw-semibold'}>{n.title}</div>
              {n.body ? <div className="text-muted pre-line">{n.body}</div> : null}
              <div className="text-muted small">{formatDateTime(n.createdAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LinkRequestPanel({ capId, status, reviewNote }: { capId: string; status: string | null; reviewNote: string | null }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api('/api/student/link-request', { body: { note } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the request.');
    }
    setBusy(false);
  }
  if (status === 'pending') {
    return <Alert type="info">Your verification request is with the admission cell. You will get a notification when it is reviewed.</Alert>;
  }
  return (
    <div>
      {status === 'rejected' ? <Alert type="warning">Your last request was not approved{reviewNote ? `: ${reviewNote}` : '.'}</Alert> : null}
      {error ? <Alert type="danger">{error}</Alert> : null}
      <label htmlFor="link-note" className="form-label fw-semibold">
        Note for staff (optional)
      </label>
      <textarea id="link-note" className="form-control mb-2" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Anything that helps staff match CAP ID ${capId}`} />
      <Button type="button" className="btn btn-primary" loading={busy} onClick={submit}>
        Ask staff to verify my CAP record
      </Button>
    </div>
  );
}
