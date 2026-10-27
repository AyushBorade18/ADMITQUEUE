// Typed wrappers around the engine. Every call is plain text in, answer lines out (see cpp/engine/main.cpp).
// The C++ program is used when it is built; otherwise the TypeScript copy answers (engine.mode() says which).
import { EngineError, runCpp } from './client';
import { runFallback } from './fallback';

export type EngineMode = 'cpp' | 'typescript';
let lastMode: EngineMode | null = null;

async function call(input: string, timeoutMs?: number): Promise<{ lines: string[]; mode: EngineMode }> {
  try {
    const lines = await runCpp(input, timeoutMs);
    lastMode = 'cpp';
    return { lines, mode: 'cpp' };
  } catch (e) {
    // only "the program is not there / cannot start" falls back; a crash or a rejected request is a real error
    if (!(e instanceof EngineError) || e.kind !== 'unavailable') throw e;
    const lines = runFallback(input);
    const failure = lines.find((l) => l.startsWith('ERROR'));
    if (failure) throw new EngineError('rejected', failure.split(/\s+/)[1] || 'REJECTED', `Engine rejected the request (${failure}).`);
    lastMode = 'typescript';
    return { lines, mode: 'typescript' };
  }
}

/** value of lines like "KEY a b c" -> [a, b, c] as numbers/strings */
const pick = (lines: string[], key: string) => lines.filter((l) => l.startsWith(key + ' ')).map((l) => l.split(/\s+/).slice(1));
const word = (s: string) => (s.trim().toUpperCase().replace(/\s+/g, '_') || '-');

export type SearchStats = { algorithm: string; comparisons: number; size: number };
export type UndoEntry = { actionId: number };

export type AllotmentRequest = {
  round: 1 | 2;
  courses: { id: number; seats: number; filled?: number }[];
  students: { id: number; rank: number; verified: boolean; prefs: number[]; status?: number; allotment?: number; prefNo?: number }[];
};
export type AllotmentResult = {
  students: { id: number; status: number; allotment: number | null; prefNo: number }[];
  courses: { id: number; filled: number; seats: number }[];
  waiting: number[];
};

export type AppointmentLoad = { rowSums: number[]; bestSlots: [number, number, number][]; booked: number; rows: number; cols: number };
export type DocReadiness = { percent: number[]; weakestDoc: number };

export const engine = {
  /** Which implementation answered last: 'cpp' (the real program) or 'typescript' (fallback). */
  mode: (): EngineMode | null => lastMode,

  async health() {
    const { lines, mode } = await call('health');
    return { mode, name: (pick(lines, 'ENGINE')[0] ?? ['?'])[0], selfCheck: (pick(lines, 'SELFCHECK')[0] ?? ['0'])[0] === '1' };
  },

  /** Linear search over CAP ID prefixes or names. Returns the indexes (into `students`) that match. */
  async search(mode: 'prefix' | 'name', query: string, students: { capId: string; name: string }[]) {
    const body = students.map((s) => `${s.capId} ${word(s.name)}`).join('\n');
    const { lines } = await call(`search ${mode} ${word(query)} ${students.length}\n${body}`);
    const [comparisons, size] = (pick(lines, 'STATS')[0] ?? ['0', '0']).map(Number);
    return { matches: pick(lines, 'MATCH').map((m) => Number(m[0])), stats: { algorithm: 'linear search', comparisons, size } as SearchStats };
  },

  /** For every incoming CAP ID: 'new', 'duplicate_in_file' or 'already_exists'. */
  async importCheck(existing: string[], incoming: string[]) {
    const { lines } = await call(`import_check ${existing.length} ${existing.join(' ')}\n${incoming.length} ${incoming.join(' ')}`, 20000);
    const status = lines.filter((l) => ['new', 'duplicate_in_file', 'already_exists'].includes(l)) as ('new' | 'duplicate_in_file' | 'already_exists')[];
    return {
      status,
      new: status.filter((s) => s === 'new').length,
      duplicateInFile: status.filter((s) => s === 'duplicate_in_file').length,
      alreadyExists: status.filter((s) => s === 'already_exists').length,
    };
  },

  /** Bubble sort: ids with the highest score first (equal scores keep their order). */
  async rankByScore(items: { id: number; score: number }[]) {
    if (items.length === 0) return [] as number[];
    const { lines } = await call(`sort_desc ${items.length}\n${items.map((i) => `${i.id} ${i.score}`).join('\n')}`);
    return pick(lines, 'ID').map((r) => Number(r[0]));
  },

  /** Stack: the newest of the given action ids (oldest first) is on top. null when the list is empty. */
  async undoTop(ids: number[]) {
    if (ids.length === 0) return null;
    const { lines } = await call(`undo_top ${ids.length} ${ids.join(' ')}`);
    const top = Number((pick(lines, 'TOP')[0] ?? ['0'])[0]);
    return top || null;
  },

  /** Priority queue + queue: who is called next? tokens must be in arrival order. level 1-2 = priority, 3 = regular. */
  async nextCall(fairness: number, streak: number, tokens: { seq: number; level: number }[]) {
    const { lines } = await call(`next_call ${fairness} ${streak} ${tokens.length}\n${tokens.map((t) => `${t.seq} ${t.level}`).join('\n')}`);
    const [seq, newStreak] = (pick(lines, 'NEXT')[0] ?? ['0', String(streak)]).map(Number);
    return { seq: seq || null, streak: newStreak };
  },

  async allotment(req: AllotmentRequest): Promise<AllotmentResult> {
    const courses = req.courses.map((c) => `${c.id} ${c.seats} ${c.filled ?? 0}`).join('\n');
    const students = req.students
      .map((s) => `${s.id} ${s.rank} ${s.status ?? 0} ${s.allotment ?? 0} ${s.prefNo ?? 0} ${s.verified ? 1 : 0} ${s.prefs.length} ${s.prefs.join(' ')}`.trimEnd())
      .join('\n');
    const { lines } = await call(`allot ${req.round} ${req.courses.length}\n${courses}\n${req.students.length}\n${students}`, 30000);
    return {
      students: pick(lines, 'STUDENT').map(([id, status, course, prefNo]) => ({ id: Number(id), status: Number(status), allotment: Number(course) || null, prefNo: Number(prefNo) })),
      courses: pick(lines, 'COURSE').map(([id, filled, seats]) => ({ id: Number(id), filled: Number(filled), seats: Number(seats) })),
      waiting: pick(lines, 'WAIT').map((w) => Number(w[0])),
    };
  },

  async appointmentLoad(p: { rows: number; cols: number; fromCol: number; toCol: number; bookings: [number, number][] }): Promise<AppointmentLoad> {
    const { lines } = await call(`load ${p.rows} ${p.cols} ${p.fromCol} ${p.toCol} ${p.bookings.length}\n${p.bookings.map(([r, c]) => `${r} ${c}`).join('\n')}`);
    return {
      rows: p.rows,
      cols: p.cols,
      rowSums: pick(lines, 'ROWSUM').map((r) => Number(r[1])),
      bestSlots: pick(lines, 'BEST').map(([r, c, n]) => [Number(r), Number(c), Number(n)] as [number, number, number]),
      booked: Number((pick(lines, 'BOOKED')[0] ?? ['0'])[0]),
    };
  },

  async docReadiness(p: { docs: number; rounds: number; roundTotals: number[]; cells: { doc: number; round: number; count: number }[] }): Promise<DocReadiness> {
    const { lines } = await call(`readiness ${p.docs} ${p.rounds} ${p.roundTotals.join(' ')}\n${p.cells.length}\n${p.cells.map((c) => `${c.doc} ${c.round} ${c.count}`).join('\n')}`);
    return { percent: pick(lines, 'PCT').map((r) => Number(r[2])), weakestDoc: Number((pick(lines, 'WEAKEST')[0] ?? ['0'])[0]) };
  },
};
