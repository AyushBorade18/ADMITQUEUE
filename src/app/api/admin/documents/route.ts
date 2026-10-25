import { z } from 'zod';
import { ApiError, ok, readJson, route } from '@/lib/api';
import { requireAdminApi } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
const schema = z.object({
  workspaceId: z.uuid(),
  docCode: z.string().regex(/^[a-z0-9_]+$/).max(40),
  status: z.enum(['not_started', 'in_progress', 'ready', 'verified', 'rejected']),
  staffNote: z.string().trim().max(300).optional(),
});

export const POST = route(async (request) => {
  const { supabase } = await requireAdminApi();
  const b = await readJson(request, schema);
  const { data, error } = await supabase.from('document_checklists')
    .update({ status: b.status, staff_note: b.status === 'verified' ? null : (b.staffNote ?? null) })
    .eq('workspace_id', b.workspaceId).eq('doc_code', b.docCode).select('doc_code');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new ApiError(404, 'not_found', 'That document item was not found.');
  return ok({});
});
