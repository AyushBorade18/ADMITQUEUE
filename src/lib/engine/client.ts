<<<<<<< HEAD
// Bridge between the Next.js server and the small C++ program (cpp/engine/main.cpp).
//
// * The website starts the program with child_process.spawn (no shell), writes plain words and numbers to its
//   standard input and reads answer lines from its standard output.
// * The program keeps no memory between requests. The database stays the source of truth.
// * The program gets an EMPTY environment, so it never sees a password or key.
=======
// Bridge between the Next.js server and the native C++ engine.
//
// * The engine is a normal executable. For every operation we start it with child_process.spawn (no shell, so
//   nothing from a request can ever become part of a command line), write ONE JSON request to its standard
//   input and read ONE JSON reply from its standard output. Diagnostics (standard error) are only logged.
// * The engine keeps no memory between requests. PostgreSQL stays the source of truth.
// * The engine gets an EMPTY environment: it never sees database credentials or any secret.
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
// * Limits: request size, reply size, run time (the process is killed on timeout), parallel processes.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export type EngineErrorKind = 'unavailable' | 'timeout' | 'bad_output' | 'crashed' | 'rejected';

export class EngineError extends Error {
  constructor(
    public kind: EngineErrorKind,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

<<<<<<< HEAD
const EXE = process.platform === 'win32' ? 'engine.exe' : 'engine';
=======
const EXE = process.platform === 'win32' ? 'admitqueue_engine.exe' : 'admitqueue_engine';
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_REPLY_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_PARALLEL = 4;

let cachedPath: string | null = null;

<<<<<<< HEAD
/** Where cpp/build/engine is. Independent of the terminal's current directory. */
=======
/** Where the engine executable is. Independent of the terminal's current directory. */
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
export function resolveEnginePath(): string {
  if (process.env.ENGINE_PATH && process.env.ENGINE_PATH.trim()) return process.env.ENGINE_PATH.trim();
  if (cachedPath && existsSync(cachedPath)) return cachedPath;
  const starts = [process.cwd(), typeof __dirname === 'string' ? __dirname : process.cwd()];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (let i = 0; i < 8; i++) {
<<<<<<< HEAD
      const candidate = path.join(dir, 'cpp', 'build', EXE);
=======
      const candidate = path.join(dir, 'engine', 'build', EXE);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      if (existsSync(candidate)) {
        cachedPath = candidate;
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
<<<<<<< HEAD
  return path.join(process.cwd(), 'cpp', 'build', EXE);
=======
  // default location (reported in the error when the file does not exist)
  return path.join(process.cwd(), 'engine', 'build', EXE);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
}

let running = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (running < MAX_PARALLEL) {
    running++;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  running++;
}

function release(): void {
  running--;
  const next = waiters.shift();
  if (next) next();
}

<<<<<<< HEAD
/** Starts the C++ program, sends the request text, returns the answer lines. */
export async function runCpp(input: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string[]> {
  if (Buffer.byteLength(input) > MAX_REQUEST_BYTES) throw new EngineError('rejected', 'TOO_LARGE', 'Engine request is too large.');
  const exe = resolveEnginePath();
  if (!existsSync(exe)) {
    throw new EngineError('unavailable', 'MISSING', `C++ engine not found at ${exe}. Run "npm run build:engine".`);
  }
  await acquire();
  try {
    return await new Promise<string[]>((resolve, reject) => {
=======
type Reply = { ok: boolean; op?: string; engine?: string; result?: unknown; error?: string; message?: string };

/** Starts the engine, sends one request, returns the parsed `result`. */
export async function runEngine<T = unknown>(op: string, payload: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const request = JSON.stringify({ ...payload, op });
  if (Buffer.byteLength(request) > MAX_REQUEST_BYTES) throw new EngineError('rejected', 'TOO_LARGE', 'Engine request is too large.');
  const exe = resolveEnginePath();
  if (!existsSync(exe)) {
    throw new EngineError('unavailable', 'MISSING', `Engine executable not found at ${exe}. Run "npm run build:engine".`);
  }
  await acquire();
  try {
    return await new Promise<T>((resolve, reject) => {
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      const env = (process.platform === 'win32' && process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) as NodeJS.ProcessEnv;
      const child = spawn(exe, [], { stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true, shell: false });
      let stdout = '';
      let stderr = '';
<<<<<<< HEAD
=======
      let size = 0;
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        done(() => reject(new EngineError('timeout', 'TIMEOUT', `Engine did not answer within ${timeoutMs} ms.`)));
      }, timeoutMs);

      child.on('error', (err: NodeJS.ErrnoException) => {
        done(() => reject(new EngineError('unavailable', err.code || 'SPAWN', `Cannot start the engine: ${err.message}`)));
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
<<<<<<< HEAD
        if (stdout.length + chunk.length > MAX_REPLY_BYTES) {
=======
        size += chunk.length;
        if (size > MAX_REPLY_BYTES) {
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
          child.kill('SIGKILL');
          done(() => reject(new EngineError('bad_output', 'TOO_LARGE', 'Engine reply is too large.')));
          return;
        }
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        if (stderr.length < 4000) stderr += chunk;
      });
      child.stdin.on('error', () => {
        /* the process ended early; the close handler reports it */
      });
      child.on('close', (code) => {
        done(() => {
          if (stderr.trim()) console.error('[engine stderr]', stderr.trim().slice(0, 500));
<<<<<<< HEAD
          const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          const failure = lines.find((l) => l.startsWith('ERROR'));
          if (failure) {
            reject(new EngineError('rejected', failure.split(/\s+/)[1] || 'REJECTED', `Engine rejected the request (${failure}).`));
            return;
          }
          if (code !== 0 || lines.length === 0) {
            reject(new EngineError('crashed', 'CRASHED', `Engine stopped without a usable answer (exit code ${code}).`));
            return;
          }
          resolve(lines);
        });
      });
      child.stdin.end(input);
=======
          let reply: Reply;
          try {
            reply = JSON.parse(stdout) as Reply;
          } catch {
            reject(new EngineError(code === 0 ? 'bad_output' : 'crashed', 'BAD_OUTPUT', `Engine returned unreadable output (exit code ${code}).`));
            return;
          }
          if (!reply || typeof reply !== 'object' || typeof reply.ok !== 'boolean') {
            reject(new EngineError('bad_output', 'BAD_OUTPUT', 'Engine reply has the wrong shape.'));
            return;
          }
          if (!reply.ok) {
            reject(new EngineError('rejected', String(reply.error || 'REJECTED'), String(reply.message || 'Engine rejected the request.')));
            return;
          }
          if (reply.op !== op) {
            reject(new EngineError('bad_output', 'WRONG_OP', 'Engine answered a different operation.'));
            return;
          }
          resolve(reply.result as T);
        });
      });
      child.stdin.end(request);
>>>>>>> 89de309f19d2115fe6181c86cab66f16ea2c6f52
    });
  } finally {
    release();
  }
}
