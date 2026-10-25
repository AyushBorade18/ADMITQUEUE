// Typed wrappers for the engine operations (see engine/include/json_ops.h for the protocol).
import { runEngine } from './client';

export type SearchStats = { algorithm: string; comparisons: number; size: number };

export const engine = {
  health: () => runEngine<{ status: string; engine: string; ops: string[]; selfCheck: boolean }>('health'),

  /** Binary search on CAP ID prefixes / linear search on names. `id` values are indexes chosen by the caller. */
  search: (mode: 'app_prefix' | 'name' | 'token', query: string, students: { id: number; appId: string; name: string }[]) =>
    runEngine<{ matches: number[]; stats: SearchStats; buildComparisons: number }>('search', { mode, query, students }),

  /** Hash-table lookup of CAP IDs inside a supplied collection. */
  hashLookup: (records: { key: string; id: number }[], queries: string[]) =>
    runEngine<{ found: { query: string; id: number | null }[]; tableSize: number }>('hash_lookup', { records, queries }),

  /** Which incoming CAP IDs are new / repeated in the file / already stored (hash table). */
  importCheck: (existing: string[], incoming: string[]) =>
    runEngine<{ status: ('new' | 'duplicate_in_file' | 'already_exists')[]; new: number; duplicateInFile: number; alreadyExists: number }>('import_check', { existing, incoming }),

  /** Stable merge sort of a worklist. */
  rankWorklist: (
    mode: 'unscheduled' | 'arrivals_time' | 'arrivals_priority' | 'arrivals_token',
    items: { id: number; level?: number; minutes?: number; token?: number; waitKey?: number; name?: string }[],
  ) => runEngine<{ order: number[]; stats: SearchStats }>('rank_worklist', { mode, items }),

  queueStep: (payload: QueueStepRequest) => runEngine<QueueStepResult>('queue_step', payload as unknown as Record<string, unknown>),

  undoStack: (payload: { action: 'push' | 'pop' | 'peek' | 'list'; capacity?: number; adminId?: number; entries: UndoEntry[]; entry?: UndoEntry }) =>
    runEngine<{ entry?: UndoEntry | null; remaining: UndoEntry[]; size: number; dropped: UndoEntry[] }>('undo_stack', payload),

  appointmentLoad: (payload: { rows: number; cols: number; fromCol: number; toCol: number; bookings: [number, number][] }) =>
    runEngine<AppointmentLoad>('appointment_load', payload),

  docReadiness: (payload: { docs: number; rounds: number; roundTotals: number[]; cells: { doc: number; round: number; count: number }[] }) =>
    runEngine<DocReadiness>('doc_readiness', payload),

  progressRank: (students: { studentId: number; token: string; score: number; enteredAt: string }[]) =>
    runEngine<{ ranked: { position: number; studentId: number; token: string; score: number }[]; size: number }>('progress_rank', { students }),

  allotment: (payload: AllotmentRequest) => runEngine<AllotmentResult>('allotment', payload as unknown as Record<string, unknown>, 20000),
};

export type UndoEntry = { actionId: number; studentId?: number; kind?: string };

export type QueueToken = { seq: number; level: number; status: 'waiting' | 'called' | 'serving'; counterId: number; studentId: number; appId: string };
export type QueueStepRequest = {
  fairness?: number;
  streak?: number;
  lastSeq?: number;
  counters: { id: number; open: boolean }[];
  tokens: QueueToken[];
  action?: { type: 'call'; counterId: number } | { type: 'start' | 'complete' | 'noshow' | 'cancel'; code: string } | { type: 'close_counter' | 'open_counter'; counterId: number } | { type: 'snapshot' };
};
export type QueueTokenView = { code: string; seq: number; lane: string; level: number; status: string; counterId: number; studentId: number; applicationId: string; position: number; ahead: number };
export type QueueStepResult = {
  action: { ok: boolean; error?: string; message?: string; token?: QueueTokenView; returned?: QueueTokenView[] };
  snapshot: { fairness: number; streak: number; waiting: QueueTokenView[]; priorityWaiting: number; regularWaiting: number; called: number; serving: number; counters: unknown[] };
  streak: number;
};

export type AppointmentLoad = {
  rows: number; cols: number; nonZeros: number; density: number;
  cells: [number, number, number][]; rowSums: number[]; colSums: number[];
  busiest: [number, number, number][]; bestSlots: [number, number][]; lookupComparisons: number;
};
export type DocReadiness = {
  docs: number; rounds: number; counts: number[]; percent: number[]; docTotals: number[]; roundTotals: number[]; weakestDoc: number[]; strongestDoc: number[];
};

export type AllotmentRequest = {
  action: 'round1' | 'round2' | 'promote' | 'freeze' | 'cancel' | 'verify_next';
  round?: number;
  studentId?: number;
  courses: { id: number; label: string; seats: number; filled?: number }[];
  students: { id: number; name: string; rank: number; verified: boolean; prefs: number[]; status?: number; allotment?: number; prefNo?: number; round?: number; remark?: string }[];
  waiting?: number[];
  verificationQueue?: number[];
};
export type AllotmentResult = {
  success: boolean; message: string; round: number;
  students: { id: number; rank: number; verified: boolean; status: number; allotment: number | null; prefNo: number; round: number; remark: string }[];
  courses: { id: number; filled: number; seats: number }[];
  waiting: number[]; verificationQueue: number[];
};
