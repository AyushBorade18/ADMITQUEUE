import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      Admit<span className="brand-mark">Queue</span>
    </Link>
  );
}

export function PublicBar({ action }: { action?: 'login' | 'register' | 'both' }) {
  return (
    <header className="public-bar">
      <div className="container d-flex align-items-center justify-content-between">
        <Brand />
        <div className="d-flex gap-2">
          {action !== 'register' && (
            <Link className="btn btn-outline-primary btn-sm" href="/login">
              Log in
            </Link>
          )}
          {action !== 'login' && (
            <Link className="btn btn-primary btn-sm" href="/register">
              Create account
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
