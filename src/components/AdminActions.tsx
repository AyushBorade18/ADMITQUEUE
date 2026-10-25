'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/client/api';

type Method = 'POST' | 'PATCH' | 'PUT';

/** One button that calls an admin API route and refreshes the page. */
export function ActionButton({ url, body, label, method = 'POST', confirm, className = 'btn btn-outline-primary btn-sm' }: {
  url: string; body: unknown; label: string; method?: Method; confirm?: string; className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError('');
    try {
      await api(url, { method, body });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed.');
    }
    setBusy(false);
  }
  return (
    <span>
      <Button type="button" className={className} loading={busy} onClick={run}>{label}</Button>
      {error ? <span className="text-danger small ms-2" role="alert">{error}</span> : null}
    </span>
  );
}

export type FieldDef =
  | { name: string; label: string; type: 'text' | 'number' | 'date' | 'textarea'; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: 'select'; options: [string, string][]; required?: boolean };

/** A small form that posts its fields as JSON. `fixed` values are merged in (ids chosen by the server-rendered page). */
export function ActionForm({ url, method = 'POST', fields, fixed = {}, submit, onDoneMessage, resetOnDone = true }: {
  url: string; method?: Method; fields: FieldDef[]; fixed?: Record<string, unknown>; submit: string; onDoneMessage?: string; resetOnDone?: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'danger'; text: string } | null>(null);
  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      const v = values[f.name];
      if (v === undefined || v === '') continue;
      body[f.name] = f.type === 'number' ? Number(v) : v;
    }
    try {
      await api(url, { method, body });
      setMsg({ type: 'success', text: onDoneMessage ?? 'Saved.' });
      if (resetOnDone) setValues({});
      router.refresh();
    } catch (err) {
      setMsg({ type: 'danger', text: err instanceof Error ? err.message : 'Failed.' });
    }
    setBusy(false);
  }
  return (
    <form onSubmit={submitForm} className="row g-2 align-items-end">
      {fields.map((f) => (
        <div key={f.name} className={f.type === 'textarea' ? 'col-12' : 'col-md-4'}>
          <label className="form-label" htmlFor={`f-${f.name}`}>{f.label}</label>
          {f.type === 'textarea' ? (
            <textarea id={`f-${f.name}`} className="form-control" rows={3} required={f.required} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
          ) : f.type === 'select' ? (
            <select id={`f-${f.name}`} className="form-select" required={f.required} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
              <option value="">Choose…</option>
              {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          ) : (
            <input id={`f-${f.name}`} type={f.type} className="form-control" required={f.required} placeholder={f.placeholder} value={values[f.name] ?? ''} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
          )}
        </div>
      ))}
      <div className="col-auto"><Button type="submit" className="btn btn-primary" loading={busy}>{submit}</Button></div>
      {msg ? <div className="col-12"><Alert type={msg.type}>{msg.text}</Alert></div> : null}
    </form>
  );
}
