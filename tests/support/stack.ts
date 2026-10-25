// Starts the whole system for end-to-end tests:
//   real PostgreSQL (migrations applied) <- Supabase emulator (tests/support/emulator.ts) <- the REAL production build
//   of the Next.js app (`next start`) with the REAL C++ engine. Seed and admin bootstrap run as the real scripts.
// Requires: a local PostgreSQL, `npm run build` done once, and the C++ engine built (`npm run build:engine`).
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createTestDb } from './db';
import { startEmulator, TEST_KEYS, type Emulator } from './emulator';

const root = path.resolve(__dirname, '..', '..');
export const EMU_PORT = 54399;
export const ADMIN = { loginId: 'staffadmin', email: 'staffadmin@example.test', password: 'Correct-Horse-Battery-9' };

export type Stack = {
  db: Awaited<ReturnType<typeof createTestDb>>;
  emulator: Emulator;
  demoUrl: string; // DEMO_MODE=true
  strictUrl: string; // DEMO_MODE=false
  noEngineUrl: string; // engine executable missing
  seedOutput: string[];
  envFor: (extra?: Record<string, string>) => NodeJS.ProcessEnv;
  stop: () => Promise<void>;
};

export function envFor(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${EMU_PORT}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: TEST_KEYS.publishable,
    SUPABASE_SECRET_KEY: TEST_KEYS.secret,
    ADMIN_LOGIN_ID: ADMIN.loginId,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    ...extra,
  } as NodeJS.ProcessEnv;
}

export function runScript(script: string, env: NodeJS.ProcessEnv): Promise<{ code: number; out: string }> {
  // asynchronous on purpose: the emulator runs in THIS process and must stay responsive while the script talks to it
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', script], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
  });
}

async function startNext(port: number, extra: Record<string, string>): Promise<ChildProcess> {
  const child = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: envFor({ NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`, PORT: String(port), ...extra }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let log = '';
  const sink = createWriteStream(`/tmp/aq-next-${port}.log`);
  child.stdout?.on('data', (d) => { log += d; sink.write(d); });
  child.stderr?.on('data', (d) => { log += d; sink.write(d); });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (r.ok) return child;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`next start on ${port} did not become healthy:\n${log}`);
}

export async function startStack(dbName = 'aq_e2e'): Promise<Stack> {
  const db = await createTestDb(dbName);
  const emulator = await startEmulator({ dbUrl: db.url, port: EMU_PORT, confirmEmail: false });
  const env = envFor();
  const servers: ChildProcess[] = [];
  const stopAll = async () => {
    for (const s of servers) { try { process.kill(-s.pid!, 'SIGTERM'); } catch { /* already gone */ } }
    await emulator.close();
    await db.drop();
  };
  let seed: { code: number; out: string };
  try {
    seed = await runScript('scripts/seed.ts', env);
    if (seed.code !== 0) throw new Error(`seed failed:\n${seed.out}`);
    const boot = await runScript('scripts/bootstrap-admin.ts', env);
    if (boot.code !== 0) throw new Error(`bootstrap failed:\n${boot.out}`);
    servers.push(await startNext(3101, { DEMO_MODE: 'true' }));
    servers.push(await startNext(3102, { DEMO_MODE: 'false' }));
    servers.push(await startNext(3103, { DEMO_MODE: 'true', ENGINE_PATH: '/nonexistent/engine' }));
  } catch (e) {
    await stopAll();
    throw e;
  }
  return {
    db, emulator, seedOutput: seed.out.split('\n'),
    demoUrl: 'http://127.0.0.1:3101', strictUrl: 'http://127.0.0.1:3102', noEngineUrl: 'http://127.0.0.1:3103',
    envFor,
    stop: stopAll,
  };
}

/** A tiny browser: keeps cookies between requests and sends a same-origin Origin header on writes. */
export class Browser {
  jar = new Map<string, string>();
  constructor(public base: string) {}
  private cookieHeader() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
  async req(method: string, url: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = { Cookie: this.cookieHeader(), ...extraHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && !('Origin' in extraHeaders)) headers['Origin'] = this.base;
    const res = await fetch(this.base + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1);
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === '';
      if (expired) this.jar.delete(name); else this.jar.set(name, value);
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  get = (url: string) => this.req('GET', url);
  post = (url: string, body: unknown = {}) => this.req('POST', url, body);
  put = (url: string, body: unknown) => this.req('PUT', url, body);
  patch = (url: string, body: unknown) => this.req('PATCH', url, body);
  get cookieNames() { return [...this.jar.keys()]; }
}
