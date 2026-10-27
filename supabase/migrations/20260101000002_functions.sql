-- AdmitQueue - functions (authorization helper, atomic operations, rate limiting)
-- Every SECURITY DEFINER function sets search_path = '' and checks who is calling.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------- who is calling
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- is the caller the student who owns this workspace?
create or replace function public.owns_workspace(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admission_workspaces w where w.id = p_workspace and w.user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------- internal helpers (not exposed)
create or replace function public.write_audit(p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
                                              p_before jsonb, p_after jsonb, p_note text, p_undoable boolean)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note, undoable)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_before, p_after, left(p_note, 500), p_undoable)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.notify_user(p_user uuid, p_title text, p_body text, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is not null then
    insert into public.notifications (user_id, title, body, kind) values (p_user, p_title, p_body, p_kind);
  end if;
end $$;

revoke all on function public.write_audit(uuid, text, text, text, jsonb, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- stages
create or replace function public.stage_index(p_stage text) returns integer
language sql immutable as $$
  select case p_stage
    when 'registration' then 1
    when 'profile_verification' then 2
    when 'preference_preparation' then 3
    when 'allotment_recorded' then 4
    when 'acceptance_reporting' then 5
    when 'next_round_consideration' then 6
    when 'admission_completed' then 7
  end;
$$;

-- The single rule for moving a workspace between workflow stages (the UI mirrors it in src/lib/stages.ts).
create or replace function public.stage_transition_allowed(p_from text, p_to text, p_has_allotment boolean)
returns boolean language plpgsql immutable as $$
declare i integer := public.stage_index(p_from); j integer := public.stage_index(p_to);
begin
  if i is null or j is null or i = j then return false; end if;
  if j < i then return true; end if;                                   -- staff may step back to correct a mistake
  if j > i + 1 and not (p_from = 'acceptance_reporting' and p_to = 'admission_completed') then return false; end if;
  if j >= 4 and not p_has_allotment then return false; end if;         -- later stages need a recorded allotment
  return true;
end $$;

-- ---------------------------------------------------------------------------------------------- cap_records -> workspace
-- A new record gets (or binds) its workspace. An unclaimed workspace is always bound to its record.
-- A workspace that a student already owns is NOT linked automatically: staff must link it (verification).
create or replace function public.bind_record_workspace() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admission_workspaces (cap_id, cap_record_id, is_synthetic)
  values (new.cap_id, new.id, new.is_synthetic)
  on conflict (cap_id) do update
    set cap_record_id = excluded.cap_record_id
    where public.admission_workspaces.user_id is null and public.admission_workspaces.cap_record_id is null;
  return new;
end $$;

create trigger cap_records_bind_workspace after insert on public.cap_records
  for each row execute function public.bind_record_workspace();

-- ---------------------------------------------------------------------------------------------- registration (server only)
-- Called by the registration route with the secret key. Never callable from the browser.
create or replace function public.register_workspace(p_user uuid, p_cap_id text, p_demo boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.admission_workspaces;
begin
  select * into w from public.admission_workspaces where cap_id = p_cap_id for update;

  if not found then                                           -- Case B: unknown CAP ID
    insert into public.admission_workspaces (cap_id, user_id) values (p_cap_id, p_user) returning * into w;
    return jsonb_build_object('state', 'record_unavailable', 'workspace_id', w.id);
  end if;

  if w.user_id is not null then
    if w.user_id = p_user then
      return jsonb_build_object('state', w.record_state, 'workspace_id', w.id);
    end if;
    raise exception 'cap_id_taken' using errcode = 'P0001';  -- one account per CAP ID
  end if;

  if p_demo and w.is_synthetic then                           -- Case A: demo auto-link of a fictional record
    update public.admission_workspaces set user_id = p_user where id = w.id and user_id is null;
    if not found then raise exception 'cap_id_taken' using errcode = 'P0001'; end if;
    return jsonb_build_object('state', 'linked', 'workspace_id', w.id);
  end if;

  -- Case C: the record exists but ownership is not proven. Staff must approve the claim.
  insert into public.record_link_requests (user_id, cap_id, workspace_id) values (p_user, p_cap_id, w.id);
  return jsonb_build_object('state', 'pending_verification', 'workspace_id', null);
end $$;

revoke all on function public.register_workspace(uuid, text, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- link requests (admin)
create or replace function public.link_workspace_to_record(p_workspace uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.admission_workspaces; r public.cap_records;
begin
  select * into w from public.admission_workspaces where id = p_workspace for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if w.cap_record_id is not null then return; end if;
  select * into r from public.cap_records where cap_id = w.cap_id;
  if not found then raise exception 'no_record' using hint = 'Create the CAP record first.'; end if;
  update public.admission_workspaces set cap_record_id = r.id where id = w.id;
  perform public.write_audit(p_actor, 'link_record', 'workspace', w.id::text, null,
                             jsonb_build_object('cap_record_id', r.id, 'cap_id', r.cap_id), null, false);
end $$;
revoke all on function public.link_workspace_to_record(uuid, uuid) from public, anon, authenticated;

create or replace function public.approve_link_request(p_request uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare q public.record_link_requests; w public.admission_workspaces;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into q from public.record_link_requests where id = p_request for update;
  if not found then raise exception 'request_not_found'; end if;
  if q.status <> 'pending' then raise exception 'request_not_pending'; end if;

  select * into w from public.admission_workspaces where cap_id = q.cap_id for update;
  if not found then raise exception 'no_record'; end if;

  if w.user_id is null then                                   -- claim the unclaimed record workspace
    update public.admission_workspaces set user_id = q.user_id where id = w.id and user_id is null;
    if not found then raise exception 'cap_id_taken'; end if;
  elsif w.user_id <> q.user_id then
    raise exception 'cap_id_taken';
  end if;
  perform public.link_workspace_to_record(w.id, auth.uid());

  update public.record_link_requests
     set status = 'approved', review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now(),
         workspace_id = w.id
   where id = q.id;
  perform public.write_audit(auth.uid(), 'approve_link_request', 'link_request', q.id::text, null,
                             jsonb_build_object('cap_id', q.cap_id, 'user_id', q.user_id), p_note, false);
  perform public.notify_user(q.user_id, 'Your CAP record is linked',
                             'Staff verified your claim. Your saved admission details are now on your dashboard.', 'status');
  return jsonb_build_object('workspace_id', w.id);
end $$;

create or replace function public.reject_link_request(p_request uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare q public.record_link_requests;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  if p_note is null or char_length(btrim(p_note)) < 3 then raise exception 'note_required'; end if;
  select * into q from public.record_link_requests where id = p_request for update;
  if not found then raise exception 'request_not_found'; end if;
  if q.status <> 'pending' then raise exception 'request_not_pending'; end if;
  update public.record_link_requests
     set status = 'rejected', review_note = left(p_note, 500), reviewed_by = auth.uid(), reviewed_at = now()
   where id = q.id;
  perform public.write_audit(auth.uid(), 'reject_link_request', 'link_request', q.id::text, null,
                             jsonb_build_object('cap_id', q.cap_id), p_note, false);
  perform public.notify_user(q.user_id, 'Your record claim was not approved', left(p_note, 500), 'action');
end $$;

-- Link a student's own workspace (CAP ID without a record yet) to the record with the same CAP ID.
create or replace function public.admin_link_record(p_workspace uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.admission_workspaces;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into w from public.admission_workspaces where id = p_workspace;
  if not found then raise exception 'workspace_not_found'; end if;
  perform public.link_workspace_to_record(p_workspace, auth.uid());
  perform public.notify_user(w.user_id, 'Your CAP record is linked',
                             'Staff linked your CAP ID to its admission record.', 'status');
end $$;

-- A student asks staff to verify and link a record for their CAP ID.
create or replace function public.request_record_verification(p_note text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare w public.admission_workspaces; v_id uuid;
begin
  select * into w from public.admission_workspaces where user_id = auth.uid();
  if not found then raise exception 'no_workspace'; end if;
  if w.cap_record_id is not null then raise exception 'already_linked'; end if;
  insert into public.record_link_requests (user_id, cap_id, workspace_id, student_note)
  values (auth.uid(), w.cap_id, w.id, left(p_note, 500)) returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------------------------- workflow stages (admin)
create or replace function public.workspace_set_stage(p_workspace uuid, p_stage text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare w public.admission_workspaces; r public.cap_records; v_has boolean; v_audit bigint;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into w from public.admission_workspaces where id = p_workspace for update;
  if not found then raise exception 'workspace_not_found'; end if;
  if w.user_id is null then raise exception 'workspace_unclaimed'; end if;
  select * into r from public.cap_records where id = w.cap_record_id;
  v_has := found and r.allotment_status in ('allotted', 'frozen');
  if not public.stage_transition_allowed(w.workflow_stage, p_stage, v_has) then
    raise exception 'invalid_transition';
  end if;
  update public.admission_workspaces set workflow_stage = p_stage where id = w.id;
  insert into public.workflow_events (workspace_id, from_stage, to_stage, note, actor_id)
  values (w.id, w.workflow_stage, p_stage, left(p_note, 500), auth.uid());
  v_audit := public.write_audit(auth.uid(), 'set_stage', 'workspace_stage', w.id::text,
                                jsonb_build_object('stage', w.workflow_stage), jsonb_build_object('stage', p_stage), p_note, true);
  perform public.notify_user(w.user_id, 'Your admission status was updated',
                             'Your status in this demonstration system is now: ' || replace(p_stage, '_', ' ') || '.', 'status');
  return jsonb_build_object('stage', p_stage, 'audit_id', v_audit);
end $$;

-- ---------------------------------------------------------------------------------------------- CAP record edits (admin)
create or replace function public.record_editable_subset(p_row jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, p_row -> k), '{}'::jsonb)
  from unnest(array['candidate_name', 'category', 'merit_rank', 'percentile', 'application_status',
                    'verification_status', 'cap_round', 'allotment_status', 'allotted_course_id',
                    'allotted_pref_no', 'remark']) as k
  where p_row ? k;
$$;

create or replace function public.admin_update_record(p_record uuid, p_changes jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.cap_records; v_new public.cap_records; v_json jsonb; v_audit bigint; v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into v_old from public.cap_records where id = p_record for update;
  if not found then raise exception 'record_not_found'; end if;
  v_json := to_jsonb(v_old) || public.record_editable_subset(p_changes);
  v_new := jsonb_populate_record(null::public.cap_records, v_json);
  update public.cap_records set
    candidate_name = v_new.candidate_name, category = v_new.category, merit_rank = v_new.merit_rank,
    percentile = v_new.percentile, application_status = v_new.application_status,
    verification_status = v_new.verification_status, cap_round = v_new.cap_round,
    allotment_status = v_new.allotment_status, allotted_course_id = v_new.allotted_course_id,
    allotted_pref_no = v_new.allotted_pref_no, remark = v_new.remark
  where id = p_record;
  -- only the fields that really changed are logged
  select coalesce(jsonb_object_agg(k, to_jsonb(v_old) -> k), '{}'), coalesce(jsonb_object_agg(k, to_jsonb(v_new) -> k), '{}')
    into v_before, v_after
    from jsonb_object_keys(public.record_editable_subset(p_changes)) as k
   where (to_jsonb(v_old) -> k) is distinct from (to_jsonb(v_new) -> k);
  if v_after = '{}'::jsonb then return jsonb_build_object('changed', false); end if;
  v_audit := public.write_audit(auth.uid(), 'update_record', 'cap_record', p_record::text, v_before, v_after, p_note, true);
  return jsonb_build_object('changed', true, 'audit_id', v_audit);
end $$;

-- ---------------------------------------------------------------------------------------------- undo (admin)
-- The caller (Node) uses the C++ stack to pick which action is newest. The database re-checks that nothing
-- changed afterwards, so newer work is never overwritten.
create or replace function public.undo_audit_action(p_audit_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.audit_logs; w public.admission_workspaces; r public.cap_records; v_cur jsonb;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  select * into a from public.audit_logs where id = p_audit_id for update;
  if not found then raise exception 'action_not_found'; end if;
  if not a.undoable then raise exception 'not_undoable'; end if;
  if a.undone_at is not null then raise exception 'already_undone'; end if;

  if a.entity_type = 'workspace_stage' then
    select * into w from public.admission_workspaces where id = a.entity_id::uuid for update;
    if not found then raise exception 'changed_since'; end if;
    if w.workflow_stage <> (a.after_data ->> 'stage') then raise exception 'changed_since'; end if;
    update public.admission_workspaces set workflow_stage = a.before_data ->> 'stage' where id = w.id;
    insert into public.workflow_events (workspace_id, from_stage, to_stage, note, actor_id)
    values (w.id, w.workflow_stage, a.before_data ->> 'stage', 'Change undone by staff', auth.uid());
  elsif a.entity_type = 'cap_record' then
    select * into r from public.cap_records where id = a.entity_id::uuid for update;
    if not found then raise exception 'changed_since'; end if;
    v_cur := public.record_editable_subset(to_jsonb(r));
    if (select count(*) from jsonb_each(a.after_data) e where (v_cur -> e.key) is distinct from e.value) > 0 then
      raise exception 'changed_since';
    end if;
    perform public.admin_update_record_raw(r.id, a.before_data);
  else
    raise exception 'not_undoable';
  end if;

  update public.audit_logs set undone_at = now(), undone_by = auth.uid() where id = a.id;
  perform public.write_audit(auth.uid(), 'undo', a.entity_type, a.entity_id, a.after_data, a.before_data,
                             'Undo of action #' || a.id, false);
  return jsonb_build_object('undone', a.id);
end $$;

-- internal: apply a field subset without writing an audit row (used by undo)
create or replace function public.admin_update_record_raw(p_record uuid, p_changes jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.cap_records; v_new public.cap_records;
begin
  select * into v_old from public.cap_records where id = p_record;
  v_new := jsonb_populate_record(null::public.cap_records, to_jsonb(v_old) || public.record_editable_subset(p_changes));
  update public.cap_records set
    candidate_name = v_new.candidate_name, category = v_new.category, merit_rank = v_new.merit_rank,
    percentile = v_new.percentile, application_status = v_new.application_status,
    verification_status = v_new.verification_status, cap_round = v_new.cap_round,
    allotment_status = v_new.allotment_status, allotted_course_id = v_new.allotted_course_id,
    allotted_pref_no = v_new.allotted_pref_no, remark = v_new.remark
  where id = p_record;
end $$;
revoke all on function public.admin_update_record_raw(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------- preferences (student)
-- SECURITY INVOKER: Row Level Security decides what the caller may touch.
create or replace function public.save_preferences(p_course_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare w public.admission_workspaces; r public.cap_records; n integer;
begin
  select * into w from public.admission_workspaces where user_id = auth.uid();
  if not found then raise exception 'no_workspace'; end if;
  n := coalesce(array_length(p_course_ids, 1), 0);
  if n > 10 then raise exception 'too_many_preferences'; end if;
  if n <> (select count(distinct c) from unnest(p_course_ids) c) then raise exception 'duplicate_course'; end if;
  if w.workflow_stage = 'admission_completed' then raise exception 'preferences_locked'; end if;
  if w.cap_record_id is not null then
    select * into r from public.cap_records where id = w.cap_record_id;
    if r.allotment_status = 'frozen' then raise exception 'preferences_locked'; end if;
  end if;
  if exists (select 1 from unnest(p_course_ids) c where not exists (select 1 from public.college_courses cc where cc.id = c)) then
    raise exception 'unknown_course';
  end if;
  delete from public.student_preferences where workspace_id = w.id;
  insert into public.student_preferences (workspace_id, position, course_id)
  select w.id, ord::integer, c from unnest(p_course_ids) with ordinality as t(c, ord);
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------- service queue (admin)
create or replace function public.apply_queue_change(p_expected_version bigint, p_streak integer, p_changes jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c jsonb; v_status text; v_user uuid; v_counter integer; v_name text;
begin
  if not public.is_admin() then raise exception 'not_admin' using errcode = '42501'; end if;
  update public.queue_state set streak = p_streak, version = version + 1 where id = 1 and version = p_expected_version;
  if not found then return false; end if;                       -- somebody else changed the queue first: caller retries
  for c in select * from jsonb_array_elements(p_changes) loop
    v_status := c ->> 'status';
    v_counter := nullif(c ->> 'counter_id', '')::integer;
    update public.service_queue_items
       set status = v_status,
           counter_id = case when v_status in ('called', 'serving') then v_counter else null end,
           assigned_to = case when v_status in ('called', 'serving') then auth.uid()
                              when v_status = 'waiting' then null else assigned_to end
     where id = (c ->> 'id')::uuid;
    if v_status = 'called' then
      select w.user_id into v_user from public.service_queue_items i
        join public.admission_workspaces w on w.id = i.workspace_id where i.id = (c ->> 'id')::uuid;
      select name into v_name from public.service_counters where id = v_counter;
      perform public.notify_user(v_user, 'Your request is being handled', 'Please go to ' || coalesce(v_name, 'the counter') || '.', 'action');
    end if;
  end loop;
  return true;
end $$;

-- ---------------------------------------------------------------------------------------------- rate limiting (server only)
create or replace function public.rate_limit_hit(p_bucket text, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_hits integer;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.auth_rate_limits (bucket, window_start, hits) values (left(p_bucket, 200), v_start, 1)
  on conflict (bucket, window_start) do update set hits = public.auth_rate_limits.hits + 1
  returning hits into v_hits;
  if random() < 0.02 then
    delete from public.auth_rate_limits where window_start < now() - interval '2 days';
  end if;
  return jsonb_build_object('allowed', v_hits <= p_limit, 'hits', v_hits,
                            'retry_after', greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now())))::integer));
end $$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
