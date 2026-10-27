'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

const NOTICES: Record<string, { type: 'info' | 'success' | 'warning'; text: string }> = {
  loggedout: { type: 'success', text: 'You have been logged out.' },
  expired: { type: 'info', text: 'Your session ended. Please log in again.' },
};

/** Student login (CAP ID + password) or, with `admin`, the staff login (login ID + password). */
export function LoginForm({ notice, admin = false }: { notice?: string; admin?: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ id: '', password: '' });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const note = notice ? NOTICES[notice] : undefined;

  const bind = (name: 'id' | 'password') => ({
    id: name,
    name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [name]: e.target.value })),
    className: `form-control${fields[name] ? ' is-invalid' : ''}`,
    'aria-invalid': fields[name] ? true : undefined,
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFields({});
    const errors: Record<string, string> = {};
    if (!values.id.trim()) errors.id = admin ? 'Enter your admin login ID.' : 'Enter your CAP Application ID.';
    if (!values.password) errors.password = 'Enter your password.';
    if (Object.keys(errors).length) return setFields(errors);
    setBusy(true);
    try {
      const res = await api<{ redirect: string }>(admin ? '/api/admin/login' : '/api/auth/login', {
        body: admin ? { loginId: values.id, password: values.password } : { capId: values.id, password: values.password },
      });
      router.replace(res.redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        const f = err.fields ?? {};
        const mapped: Record<string, string> = {};
        if (f.capId) mapped.id = f.capId;
        if (f.loginId) mapped.id = f.loginId;
        if (f.password) mapped.password = f.password;
        setFields(mapped);
        if (!Object.keys(mapped).length) setError(err.message);
      } else setError('Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      {note ? <Alert type={note.type}>{note.text}</Alert> : null}
      {error ? <Alert type="danger">{error}</Alert> : null}
      <Field id="id" label={admin ? 'Admin login ID' : 'CAP Application ID'} error={fields.id}>
        <input {...bind('id')} type="text" autoComplete="username" maxLength={60} autoCapitalize={admin ? 'none' : 'characters'} placeholder={admin ? 'admin' : 'e.g. EN26100001'} required />
      </Field>
      <Field id="password" label="Password" error={fields.password}>
        <input {...bind('password')} type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="btn btn-primary w-100" loading={busy}>
        {busy ? 'Logging in' : 'Log in'}
      </Button>
    </form>
  );
}
