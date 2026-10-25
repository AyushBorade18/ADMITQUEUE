import 'server-only';
import type { PostgrestError } from '@supabase/supabase-js';
import { ApiError } from '@/lib/api';

const MESSAGES: Record<string, [number, string]> = {
  not_admin: [403, 'You do not have permission to do this.'],
  workspace_not_found: [404, 'That student workspace was not found.'],
  workspace_unclaimed: [409, 'This CAP ID has not been claimed by a student account yet.'],
  invalid_transition: [409, 'That status change is not allowed from the current stage.'],
  no_record: [409, 'No CAP record exists for this CAP ID yet. Create the record first.'],
  request_not_found: [404, 'That request was not found.'],
  request_not_pending: [409, 'That request was already reviewed.'],
  cap_id_taken: [409, 'That CAP ID already belongs to another account.'],
  note_required: [400, 'Please write a short reason (at least 3 characters).'],
  changed_since: [409, 'Cannot undo: the data was changed after that action.'],
  not_undoable: [409, 'That action cannot be undone.'],
  already_undone: [409, 'That action was already undone.'],
  record_not_found: [404, 'That record was not found.'],
};

/** Turns a database error into a safe API error. Unknown errors become a generic 500 (logged by route()). */
export function rpcError(error: PostgrestError | { message: string; code?: string }): never {
  const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
  if (key) throw new ApiError(MESSAGES[key][0], key, MESSAGES[key][1]);
  if (error.code === '42501') throw new ApiError(403, 'forbidden', 'You do not have permission to do this.');
  if (error.code === '23505') throw new ApiError(409, 'duplicate', 'That already exists.');
  if (error.code === '23514' || error.code === '23503' || error.code === '22P02') throw new ApiError(400, 'invalid', 'Some of the values are not valid.');
  throw new Error(error.message);
}
