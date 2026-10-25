'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`status-pill ${status}`}>{label ?? status.replace(/_/g, ' ')}</span>;
}

export function Alert({ type = 'info', children, className = '' }: { type?: 'info' | 'danger' | 'success' | 'warning'; children: ReactNode; className?: string }) {
  return (
    <div className={`alert alert-${type} ${className}`} role={type === 'danger' || type === 'warning' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner-wrap" role="status">
      <div className="spinner-border text-primary mb-2" aria-hidden="true" />
      <div>{label}</div>
    </div>
  );
}

export function Button({ loading, children, ...rest }: { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} disabled={rest.disabled || loading}>
      {loading ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function SegBar({ statuses }: { statuses: string[] }) {
  return (
    <div className="seg-bar" aria-hidden="true">
      {statuses.map((s, i) => (
        <span key={i} className={`seg ${s}`} />
      ))}
    </div>
  );
}

/** Dialog in the AdmitQueue "task window" style. Closes on Escape and on a click outside. */
export function Modal({ title, onClose, children, footer, large }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; large?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    document.body.classList.add('af-modal-open');
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('af-modal-open');
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="af-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`af-modal ${large ? 'af-modal-lg' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="af-modal-header">
          <h2 className="af-modal-title">{title}</h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
        </div>
        <div className="af-modal-body">{children}</div>
        {footer ? <div className="af-modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export function Field({ id, label, error, children, hint }: { id: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label fw-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <div className="invalid-feedback d-block" id={`${id}-error`}>
          {error}
        </div>
      ) : null}
      {hint && !error ? <div className="form-text">{hint}</div> : null}
    </div>
  );
}
