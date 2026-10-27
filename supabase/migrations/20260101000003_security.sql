-- AdmitQueue - Row Level Security, grants
--
-- Roles (provided by Supabase): anon (not logged in), authenticated (logged in), service_role (server secret key).
--  * anon gets NOTHING.
--  * authenticated gets only what the policies below allow: a student reaches only rows that belong to
--    their own workspace; an admin (profiles.role = 'admin', checked by is_admin()) reaches staff data.
--  * service_role bypasses RLS and is used only by the Next.js server (login lookup, registration, bootstrap, seed).
-- The role is never taken from the request or from user metadata: is_admin() reads public.profiles, which a
-- student cannot change (no UPDATE grant on profiles).

-- ---------------------------------------------------------------------------------------------- start from zero
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter table public.profiles               enable row level security;
alter table public.student_login_ids      enable row level security;
alter table public.college_courses        enable row level security;
alter table public.cap_records            enable row level security;
alter table public.admission_workspaces   enable row level security;
alter table public.record_link_requests   enable row level security;
alter table public.student_preferences    enable row level security;
alter table public.document_types         enable row level security;
alter table public.document_checklists    enable row level security;
alter table public.allotment_history      enable row level security;
alter table public.workflow_events        enable row level security;
alter table public.appointments           enable row level security;
alter table public.service_counters       enable row level security;
alter table public.queue_state            enable row level security;
alter table public.service_queue_items    enable row level security;
alter table public.notifications          enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.app_settings           enable row level security;
alter table public.auth_rate_limits       enable row level security;   -- no policy, no grant: server only

-- ---------------------------------------------------------------------------------------------- profiles
grant select on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------------------------- login ids
grant select on public.student_login_ids to authenticated;
create policy login_ids_select on public.student_login_ids for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------------------------- catalogue
grant select on public.college_courses, public.document_types, public.service_counters, public.app_settings to authenticated;
grant insert, update, delete on public.college_courses to authenticated;
grant update on public.service_counters to authenticated;
grant insert, update on public.app_settings to authenticated;

create policy courses_select on public.college_courses for select to authenticated using (true);
create policy courses_admin_write on public.college_courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy doc_types_select on public.document_types for select to authenticated using (true);
create policy counters_select on public.service_counters for select to authenticated using (true);
create policy counters_admin_update on public.service_counters for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy settings_select on public.app_settings for select to authenticated using (true);
create policy settings_admin_write on public.app_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------- workspaces & records
grant select on public.admission_workspaces to authenticated;
create policy workspaces_select on public.admission_workspaces for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- A student reads a CAP record only through THEIR OWN workspace's verified link.
grant select, insert, update, delete on public.cap_records to authenticated;
create policy records_select on public.cap_records for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.admission_workspaces w
    where w.cap_record_id = cap_records.id and w.user_id = auth.uid()));
create policy records_admin_insert on public.cap_records for insert to authenticated with check (public.is_admin());
create policy records_admin_update on public.cap_records for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy records_admin_delete on public.cap_records for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------------------------- link requests
grant select, insert, update on public.record_link_requests to authenticated;
create policy link_requests_select on public.record_link_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy link_requests_insert on public.record_link_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and reviewed_by is null
              and public.owns_workspace(workspace_id));
create policy link_requests_cancel on public.record_link_requests for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

-- ---------------------------------------------------------------------------------------------- preferences
grant select, insert, update, delete on public.student_preferences to authenticated;
create policy prefs_select on public.student_preferences for select to authenticated
  using (public.owns_workspace(workspace_id) or public.is_admin());
create policy prefs_owner_write on public.student_preferences for all to authenticated
  using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));

-- ---------------------------------------------------------------------------------------------- documents
grant select on public.document_checklists to authenticated;
grant update (status, staff_note, updated_by) on public.document_checklists to authenticated;
create policy docs_select on public.document_checklists for select to authenticated
  using (public.owns_workspace(workspace_id) or public.is_admin());
-- students may mark their own items not_started / in_progress / ready; only staff set verified / rejected
create policy docs_student_update on public.document_checklists for update to authenticated
  using (public.owns_workspace(workspace_id) and status <> 'verified')
  with check (public.owns_workspace(workspace_id) and status in ('not_started', 'in_progress', 'ready'));
create policy docs_admin_update on public.document_checklists for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- a student can never touch the staff note
create or replace function public.document_update_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    new.staff_note := old.staff_note;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger document_checklists_guard before update on public.document_checklists
  for each row execute function public.document_update_guard();

-- ---------------------------------------------------------------------------------------------- allotment history
grant select, insert on public.allotment_history to authenticated;
create policy history_select on public.allotment_history for select to authenticated
  using (public.is_admin() or exists (
    select 1 from public.admission_workspaces w
    where w.cap_record_id = allotment_history.cap_record_id and w.user_id = auth.uid()));
create policy history_admin_insert on public.allotment_history for insert to authenticated with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------- workflow events
grant select on public.workflow_events to authenticated;
create policy events_select on public.workflow_events for select to authenticated
  using (public.owns_workspace(workspace_id) or public.is_admin());

-- ---------------------------------------------------------------------------------------------- appointments
grant select, insert, update, delete on public.appointments to authenticated;
create policy appointments_select on public.appointments for select to authenticated
  using (public.owns_workspace(workspace_id) or public.is_admin());
create policy appointments_admin_write on public.appointments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------- service queue
grant select on public.queue_state to authenticated;
create policy queue_state_admin_select on public.queue_state for select to authenticated using (public.is_admin());

grant select, insert, update, delete on public.service_queue_items to authenticated;
create policy queue_items_select on public.service_queue_items for select to authenticated
  using (public.owns_workspace(workspace_id) or public.is_admin());
-- a student may open a plain support request for themselves, nothing else
create policy queue_items_student_insert on public.service_queue_items for insert to authenticated
  with check (public.owns_workspace(workspace_id) and kind = 'support' and level = 3 and status = 'waiting'
              and counter_id is null and assigned_to is null and created_by = auth.uid());
create policy queue_items_admin_write on public.service_queue_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------------------------- notifications
grant select on public.notifications to authenticated;
grant update (is_read) on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------------------------- audit log (staff read only)
grant select on public.audit_logs to authenticated;
create policy audit_admin_select on public.audit_logs for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------------------------- functions
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to service_role;
grant execute on function public.is_admin(), public.owns_workspace(uuid),
  public.stage_index(text), public.stage_transition_allowed(text, text, boolean),
  public.approve_link_request(uuid, text), public.reject_link_request(uuid, text),
  public.admin_link_record(uuid), public.request_record_verification(text),
  public.workspace_set_stage(uuid, text, text), public.admin_update_record(uuid, jsonb, text),
  public.undo_audit_action(bigint), public.save_preferences(uuid[]),
  public.apply_queue_change(bigint, integer, jsonb), public.record_editable_subset(jsonb)
  to authenticated;
-- internal helpers and the server-only functions stay closed to the browser roles
revoke execute on function public.write_audit(uuid, text, text, text, jsonb, jsonb, text, boolean) from authenticated;
revoke execute on function public.notify_user(uuid, text, text, text) from authenticated;
revoke execute on function public.register_workspace(uuid, text, boolean) from authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer) from authenticated;
revoke execute on function public.link_workspace_to_record(uuid, uuid) from authenticated;
revoke execute on function public.admin_update_record_raw(uuid, jsonb) from authenticated;
