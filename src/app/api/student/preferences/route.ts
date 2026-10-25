import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireStudentApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const schema = z.object({ courseIds: z.array(z.uuid()).max(10) });

const MESSAGES: Record<string, [number, string]> = {
  no_workspace: [409, 'You do not have an admission workspace yet.'],
  too_many_preferences: [400, 'You can save at most 10 preferences.'],
  duplicate_course: [400, 'The same course appears twice.'],
  preferences_locked: [409, 'Your preferences are locked because your seat is frozen or admission is complete.'],
  unknown_course: [400, 'One of the selected courses does not exist.'],
};

/** Replaces the signed-in student's ordered preference list. The database function enforces every rule. */
export const PUT = route(async (request) => {
  const { supabase } = await requireStudentApi();
  const body = await readJson(request, schema);
  const { data, error } = await supabase.rpc('save_preferences', { p_course_ids: body.courseIds });
  if (error) {
    const key = Object.keys(MESSAGES).find((k) => error.message.includes(k));
    if (key) throw new ApiError(MESSAGES[key][0], key, MESSAGES[key][1]);
    if (error.code === '23503') throw new ApiError(400, 'unknown_course', MESSAGES.unknown_course[1]);
    throw new Error(error.message);
  }
  return ok({ saved: data });
});
