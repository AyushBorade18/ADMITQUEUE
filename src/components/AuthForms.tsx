'use client';
<<<<<<< HEAD
=======
import Link from 'next/link';
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { api, ApiClientError } from '@/lib/client/api';

<<<<<<< HEAD
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
=======
function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (name: keyof T & string) => ({
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    id: name,
    name,
    value: values[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [name]: e.target.value })),
    className: `form-control${fields[name] ? ' is-invalid' : ''}`,
    'aria-invalid': fields[name] ? true : undefined,
<<<<<<< HEAD
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
=======
    'aria-describedby': fields[name] ? `${name}-error` : undefined,
  });
  return { values, fields, setFields, error, setError, busy, setBusy, bind };
}

const NOTICES: Record<string, { type: 'info' | 'success' | 'warning'; text: string }> = {
  loggedout: { type: 'success', text: 'You have been logged out.' },
  confirm_failed: { type: 'warning', text: 'We could not complete the email confirmation in this browser. If you already confirmed your email, just log in.' },
  reset_failed: { type: 'warning', text: 'That reset link is invalid or has expired. Request a new one.' },
  link_invalid: { type: 'warning', text: 'That link is not valid.' },
  password_changed: { type: 'success', text: 'Your password was changed. Log in with the new password.' },
  expired: { type: 'info', text: 'Your session ended. Please log in again.' },
};

export function LoginForm({ demo, notice, admin = false }: { demo: boolean; notice?: string; admin?: boolean }) {
  const router = useRouter();
  const f = useForm({ id: '', password: '' });
  const note = notice ? NOTICES[notice] : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    f.setError('');
    f.setFields({});
    const errors: Record<string, string> = {};
    if (!f.values.id.trim()) errors.id = admin ? 'Enter your admin login ID.' : 'Enter your CAP Application ID.';
    if (!f.values.password) errors.password = 'Enter your password.';
    if (Object.keys(errors).length) return f.setFields(errors);
    f.setBusy(true);
    try {
      const res = await api<{ redirect: string }>(admin ? '/api/admin/login' : '/api/auth/login', {
        body: admin ? { loginId: f.values.id, password: f.values.password } : { capId: f.values.id, password: f.values.password },
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      });
      router.replace(res.redirect);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
<<<<<<< HEAD
        const f = err.fields ?? {};
        const mapped: Record<string, string> = {};
        if (f.capId) mapped.id = f.capId;
        if (f.loginId) mapped.id = f.loginId;
        if (f.password) mapped.password = f.password;
        setFields(mapped);
        if (!Object.keys(mapped).length) setError(err.message);
      } else setError('Something went wrong. Please try again.');
      setBusy(false);
=======
        const fields = err.fields ?? {};
        const mapped: Record<string, string> = {};
        if (fields.capId) mapped.id = fields.capId;
        if (fields.loginId) mapped.id = fields.loginId;
        if (fields.password) mapped.password = fields.password;
        f.setFields(mapped);
        if (!Object.keys(mapped).length) f.setError(err.message);
      } else f.setError('Something went wrong. Please try again.');
      f.setBusy(false);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      {note ? <Alert type={note.type}>{note.text}</Alert> : null}
<<<<<<< HEAD
      {error ? <Alert type="danger">{error}</Alert> : null}
      <Field id="id" label={admin ? 'Admin login ID' : 'CAP Application ID'} error={fields.id}>
        <input {...bind('id')} type="text" autoComplete="username" maxLength={60} autoCapitalize={admin ? 'none' : 'characters'} placeholder={admin ? 'admin' : 'e.g. EN26100001'} required />
      </Field>
      <Field id="password" label="Password" error={fields.password}>
        <input {...bind('password')} type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" className="btn btn-primary w-100" loading={busy}>
        {busy ? 'Logging in' : 'Log in'}
=======
      {f.error ? <Alert type="danger">{f.error}</Alert> : null}
      <Field id="id" label={admin ? 'Admin login ID' : 'CAP Application ID'} error={f.fields.id}>
        <input {...f.bind('id')} type="text" autoComplete="username" maxLength={60} autoCapitalize="characters" placeholder={admin ? 'admin' : 'e.g. DM26000001'} required />
      </Field>
      <Field id="password" label="Password" error={f.fields.password}>
        <input {...f.bind('password')} type="password" autoComplete="current-password" required />
      </Field>
      {!admin && demo ? (
        <div className="alert alert-info py-2 small mb-3">
          <strong>Demo mode:</strong> the CAP IDs <code>DM26000001</code> to <code>DM26000500</code> are fictional records. Create an account with one of them first, then log in here.
        </div>
      ) : null}
      <Button type="submit" className="btn btn-primary w-100" loading={f.busy}>
        {f.busy ? 'Logging in' : 'Log in'}
      </Button>
      {!admin ? (
        <p className="text-center small mt-3 mb-0">
          <Link href="/forgot-password">Forgot your password?</Link>
        </p>
      ) : null}
    </form>
  );
}

export function RegisterForm({ demo }: { demo: boolean }) {
  const router = useRouter();
  const f = useForm({ fullName: '', email: '', capId: '', password: '', confirmPassword: '' });
  const [done, setDone] = useState<null | { needsEmailConfirmation: boolean }>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    f.setError('');
    f.setFields({});
    f.setBusy(true);
    try {
      const res = await api<{ signedIn: boolean; needsEmailConfirmation: boolean; redirect?: string }>('/api/auth/register', { body: f.values });
      if (res.signedIn && res.redirect) {
        router.replace(res.redirect);
        router.refresh();
        return;
      }
      setDone({ needsEmailConfirmation: res.needsEmailConfirmation });
    } catch (err) {
      if (err instanceof ApiClientError) {
        f.setFields(err.fields ?? {});
        if (!err.fields || !Object.keys(err.fields).length) f.setError(err.message);
      } else f.setError('Something went wrong. Please try again.');
    }
    f.setBusy(false);
  }

  if (done) {
    return (
      <div className="panel">
        <Alert type="success">
          {done.needsEmailConfirmation
            ? 'Almost done. We sent a confirmation link to your email address. Open it, then log in with your CAP ID and password.'
            : 'Your account was created.'}
        </Alert>
        <Link className="btn btn-primary" href="/login">
          Go to log in
        </Link>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      {f.error ? <Alert type="danger">{f.error}</Alert> : null}
      <Field id="fullName" label="Full name" error={f.fields.fullName}>
        <input {...f.bind('fullName')} type="text" autoComplete="name" maxLength={120} required />
      </Field>
      <Field id="email" label="Email address" error={f.fields.email} hint="Used for confirmation and password reset only.">
        <input {...f.bind('email')} type="email" autoComplete="email" maxLength={254} required />
      </Field>
      <Field id="capId" label="CAP Application ID" error={f.fields.capId} hint="You will log in with this ID. Spaces and dashes are ignored.">
        <input {...f.bind('capId')} type="text" autoComplete="username" maxLength={60} autoCapitalize="characters" required />
      </Field>
      <Field id="password" label="Password" error={f.fields.password} hint="At least 8 characters with a letter and a number.">
        <input {...f.bind('password')} type="password" autoComplete="new-password" required />
      </Field>
      <Field id="confirmPassword" label="Confirm password" error={f.fields.confirmPassword}>
        <input {...f.bind('confirmPassword')} type="password" autoComplete="new-password" required />
      </Field>
      {demo ? (
        <div className="alert alert-info py-2 small">
          <strong>Demo mode:</strong> if you use one of the fictional IDs <code>DM26000001</code> to <code>DM26000500</code>, its record is linked to your account automatically. Any other ID
          creates an empty workspace.
        </div>
      ) : (
        <div className="alert alert-info py-2 small">
          If your CAP ID already exists in this system&apos;s records, staff must verify that it is yours before any details are shown. Never enter your real CAP portal password here.
        </div>
      )}
      <Button type="submit" className="btn btn-primary w-100" loading={f.busy}>
        {f.busy ? 'Creating account' : 'Create account'}
      </Button>
    </form>
  );
}

export function ForgotForm() {
  const f = useForm({ capId: '' });
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    f.setError('');
    f.setFields({});
    f.setBusy(true);
    try {
      const res = await api<{ message: string }>('/api/auth/forgot-password', { body: f.values });
      setMessage(res.message);
    } catch (err) {
      if (err instanceof ApiClientError && err.fields?.capId) f.setFields({ capId: err.fields.capId });
      else f.setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
    f.setBusy(false);
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      {message ? <Alert type="success">{message}</Alert> : null}
      {f.error ? <Alert type="danger">{f.error}</Alert> : null}
      <Field id="capId" label="CAP Application ID" error={f.fields.capId}>
        <input {...f.bind('capId')} type="text" autoComplete="username" maxLength={60} required />
      </Field>
      <Button type="submit" className="btn btn-primary w-100" loading={f.busy}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetForm() {
  const router = useRouter();
  const f = useForm({ password: '', confirmPassword: '' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    f.setError('');
    f.setFields({});
    f.setBusy(true);
    try {
      await api('/api/auth/reset-password', { body: f.values });
      router.replace('/login?notice=password_changed');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError) {
        f.setFields(err.fields ?? {});
        if (!err.fields || !Object.keys(err.fields).length) f.setError(err.message);
      } else f.setError('Something went wrong.');
      f.setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      {f.error ? <Alert type="danger">{f.error}</Alert> : null}
      <Field id="password" label="New password" error={f.fields.password} hint="At least 8 characters with a letter and a number.">
        <input {...f.bind('password')} type="password" autoComplete="new-password" required />
      </Field>
      <Field id="confirmPassword" label="Confirm new password" error={f.fields.confirmPassword}>
        <input {...f.bind('confirmPassword')} type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" className="btn btn-primary w-100" loading={f.busy}>
        Change password
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      </Button>
    </form>
  );
}
