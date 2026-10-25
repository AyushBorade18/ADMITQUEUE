'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';

export function LogoutButton({ redirectTo, api: url }: { redirectTo: string; api: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-outline-primary btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api(url, { method: 'POST', body: {} });
        } catch {
          /* leave the page regardless */
        }
        router.replace(redirectTo);
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
