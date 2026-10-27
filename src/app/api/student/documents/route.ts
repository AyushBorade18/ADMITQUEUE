import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireStudentApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const schema = z.object({
  docCode: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/),
  status: z.enum(['not_started', 'in_progress', 'ready']),
});

/** A student can mark their own items not started / in progress / ready. Only staff verify or reject (enforced by RLS). */
export const PATCH = route(async (request) => {
  const { supabase, user } = await requireStudentApi();
  const body = await readJson(request, schema);
  const ws = await supabase.from('admission_workspaces').select('id').eq('user_id', user.id).maybeSingle();
  if (ws.error) throw new Error(ws.error.message);
  if (!ws.data) throw new ApiError(409, 'no_workspace', 'You do not have an admission workspace yet.');
  const { data, error } = await supabase
    .from('document_checklists')
    .update({ status: body.status })
    .eq('workspace_id', ws.data.id)
    .eq('doc_code', body.docCode)
    .select('doc_code, status');
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new ApiError(409, 'not_editable', 'This document cannot be changed (it may already be verified by staff).');
  return ok({ docCode: data[0].doc_code, status: data[0].status });
});
