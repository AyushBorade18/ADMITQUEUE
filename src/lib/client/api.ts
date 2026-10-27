// Browser-side fetch wrapper for the AdmitQueue API (same-origin, cookie session).

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public fields?: Record<string, string>,
    public offline = false,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type Init = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown };

export async function api<T = Record<string, unknown>>(url: string, init: Init = {}): Promise<T & { ok: true }> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
  } catch {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiClientError(
      offline ? 'You are offline. This needs an internet connection; nothing was saved.' : 'Cannot reach the server. Check your connection and try again.',
      0,
      'network',
      undefined,
      offline,
    );
  }
  let payload: { ok?: boolean; message?: string; code?: string; fields?: Record<string, string> } | null = null;
  try {
    payload = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !payload || payload.ok === false) {
    throw new ApiClientError(payload?.message || 'Something went wrong. Please try again.', res.status, payload?.code, payload?.fields);
  }
  return payload as T & { ok: true };
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
