import Link from 'next/link';

export function Brand({ href = '/' }: { href?: string }) {
  return (
    <Link className="brand" href={href}>
      Admit<span className="brand-mark">Queue</span>
    </Link>
  );
}

<<<<<<< HEAD
export function PublicBar() {
=======
export function PublicBar({ action }: { action?: 'login' | 'register' | 'both' }) {
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
  return (
    <header className="public-bar">
      <div className="container d-flex align-items-center justify-content-between">
        <Brand />
        <div className="d-flex gap-2">
<<<<<<< HEAD
          <Link className="btn btn-primary btn-sm" href="/login">
            Log in
          </Link>
=======
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
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
        </div>
      </div>
    </header>
  );
}
