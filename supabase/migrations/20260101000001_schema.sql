-- AdmitQueue - schema (tables, constraints, indexes, triggers)
-- Run order: 20260101000001_schema.sql -> 20260101000002_functions.sql -> 20260101000003_security.sql
--
-- Design notes
--  * One source of truth per fact:
--      - the link between a student account and an admission record is admission_workspaces.user_id +
--        admission_workspaces.cap_record_id (both UNIQUE, so one account <-> one workspace <-> one record);
--      - institutional data about a CAP application (merit, allotment, statuses) is cap_records;
--      - everything a student edits or staff move forward (preferences, documents, workflow stage,
--        appointments, service items) hangs off the workspace.
--  * Seeded demo records get an UNCLAIMED workspace (user_id is null). A student claims it atomically
--    (see register_workspace / approve_link_request in the functions migration).
--  * Passwords live only in Supabase Auth. Emails live only in auth.users (never copied into public tables).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------------------------- helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------- profiles
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            text not null default 'student' check (role in ('student', 'admin')),
  full_name       text not null check (char_length(btrim(full_name)) between 2 and 120),
  admin_login_id  text unique check (admin_login_id ~ '^[a-z0-9._-]{3,32}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profiles_admin_login_only_for_admin check (admin_login_id is null or role = 'admin')
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Every new Auth account gets a profile. The role is ALWAYS 'student' here: it is never read from user
-- metadata, so public registration can never create an admin. Admins are promoted by the bootstrap script
-- with the server-only secret key.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  if char_length(v_name) < 2 then
    v_name := 'Student';
  end if;
  insert into public.profiles (id, role, full_name)
  values (new.id, 'student', left(v_name, 120));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------- CAP ID -> account mapping
-- Server only (secret key). The CAP ID is stored normalized (A-Z0-9, 6-20 characters).
create table public.student_login_ids (
  cap_id      text primary key check (cap_id ~ '^[A-Z0-9]{6,20}$'),
  user_id     uuid not null unique references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------- catalogue (fictional demo data)
create table public.college_courses (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  college_name  text not null,
  city          text not null,
  branch        text not null,
  demo_seats    integer not null check (demo_seats >= 0),
  is_synthetic  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger college_courses_updated_at before update on public.college_courses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- CAP records
create table public.cap_records (
  id                  uuid primary key default gen_random_uuid(),
  cap_id              text not null unique check (cap_id ~ '^[A-Z0-9]{6,20}$'),
  candidate_name      text not null check (char_length(btrim(candidate_name)) between 2 and 120),
  category            text,
  merit_rank          integer check (merit_rank > 0),
  percentile          numeric(10, 7) check (percentile between 0 and 100),
  application_status  text not null default 'submitted'
                      check (application_status in ('submitted', 'under_review', 'confirmed')),
  verification_status text not null default 'pending'
                      check (verification_status in ('pending', 'verified', 'rejected')),
  cap_round           integer check (cap_round between 1 and 4),
  allotment_status    text not null default 'not_allotted'
                      check (allotment_status in ('not_allotted', 'allotted', 'waiting', 'frozen', 'cancelled')),
  allotted_course_id  uuid references public.college_courses (id),
  allotted_pref_no    integer check (allotted_pref_no > 0),
  is_synthetic        boolean not null default false,
  remark              text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, cap_id),
  constraint cap_records_allotment_has_course check (
    allotment_status not in ('allotted', 'frozen') or allotted_course_id is not null
  )
);
create index cap_records_course_idx on public.cap_records (allotted_course_id);
create index cap_records_rank_idx on public.cap_records (merit_rank);
create trigger cap_records_updated_at before update on public.cap_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- admission workspaces
-- One row per CAP ID. user_id is null while a seeded record is still unclaimed.
create table public.admission_workspaces (
  id              uuid primary key default gen_random_uuid(),
  cap_id          text not null unique check (cap_id ~ '^[A-Z0-9]{6,20}$'),
  user_id         uuid unique references public.profiles (id) on delete set null,
  cap_record_id   uuid unique,
  workflow_stage  text not null default 'registration'
                  check (workflow_stage in ('registration', 'profile_verification', 'preference_preparation',
                                            'allotment_recorded', 'acceptance_reporting',
                                            'next_round_consideration', 'admission_completed')),
  is_synthetic    boolean not null default false,
  record_state    text generated always as (
                    case when user_id is null then 'unclaimed'
                         when cap_record_id is null then 'record_unavailable'
                         else 'linked' end) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- a workspace can only point at the record that has the SAME CAP ID
  constraint workspace_record_same_cap foreign key (cap_record_id, cap_id)
    references public.cap_records (id, cap_id) on delete set null (cap_record_id)
);
create trigger admission_workspaces_updated_at before update on public.admission_workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- link requests
create table public.record_link_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  cap_id        text not null check (cap_id ~ '^[A-Z0-9]{6,20}$'),
  workspace_id  uuid references public.admission_workspaces (id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  student_note  text check (char_length(student_note) <= 500),
  review_note   text check (char_length(review_note) <= 500),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index record_link_requests_one_pending on public.record_link_requests (user_id) where status = 'pending';
create index record_link_requests_status_idx on public.record_link_requests (status, created_at);
create trigger record_link_requests_updated_at before update on public.record_link_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- preferences
create table public.student_preferences (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.admission_workspaces (id) on delete cascade,
  position      integer not null check (position between 1 and 10),
  course_id     uuid not null references public.college_courses (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, position),
  unique (workspace_id, course_id)
);
create index student_preferences_course_idx on public.student_preferences (course_id);
create trigger student_preferences_updated_at before update on public.student_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- documents
create table public.document_types (
  code        text primary key,
  title       text not null,
  note        text,
  sort_order  integer not null unique
);

create table public.document_checklists (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.admission_workspaces (id) on delete cascade,
  doc_code      text not null references public.document_types (code),
  status        text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'ready', 'verified', 'rejected')),
  staff_note    text check (char_length(staff_note) <= 300),
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, doc_code)
);
create trigger document_checklists_updated_at before update on public.document_checklists
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- allotment history
create table public.allotment_history (
  id             uuid primary key default gen_random_uuid(),
  cap_record_id  uuid not null references public.cap_records (id) on delete cascade,
  cap_round      integer not null check (cap_round between 1 and 4),
  event_type     text not null check (event_type in ('allotted', 'betterment', 'promoted', 'frozen', 'cancelled', 'waiting')),
  course_id      uuid references public.college_courses (id),
  pref_no        integer check (pref_no > 0),
  remark         text,
  source         text not null default 'seed' check (source in ('seed', 'simulation', 'admin')),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index allotment_history_record_idx on public.allotment_history (cap_record_id, created_at);
create unique index allotment_history_seed_once on public.allotment_history (cap_record_id, cap_round, event_type) where source = 'seed';

-- ---------------------------------------------------------------------------------------------- workflow events (student-visible timeline)
create table public.workflow_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.admission_workspaces (id) on delete cascade,
  from_stage    text,
  to_stage      text not null,
  note          text check (char_length(note) <= 500),
  actor_id      uuid references public.profiles (id) on delete set null,
  is_synthetic  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index workflow_events_workspace_idx on public.workflow_events (workspace_id, created_at);
create unique index workflow_events_seed_once on public.workflow_events (workspace_id, to_stage) where is_synthetic;

-- ---------------------------------------------------------------------------------------------- appointments
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.admission_workspaces (id) on delete cascade,
  scheduled_date  date not null,
  slot_minutes    integer not null check (slot_minutes between 0 and 1410 and slot_minutes % 30 = 0),
  purpose         text not null default 'Document verification' check (char_length(purpose) between 3 and 120),
  status          text not null default 'scheduled' check (status in ('scheduled', 'completed', 'missed', 'cancelled')),
  notes           text check (char_length(notes) <= 300),
  is_synthetic    boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index appointments_one_scheduled on public.appointments (workspace_id) where status = 'scheduled';
create index appointments_day_idx on public.appointments (scheduled_date, slot_minutes);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- service desk queue
create table public.service_counters (
  id       integer primary key check (id between 1 and 20),
  name     text not null,
  is_open  boolean not null default true
);

-- one row: the fairness streak plus a version number used for optimistic concurrency
create table public.queue_state (
  id       integer primary key default 1 check (id = 1),
  streak   integer not null default 0 check (streak >= 0),
  version  bigint not null default 0
);
insert into public.queue_state (id) values (1);

create table public.service_queue_items (
  id            uuid primary key default gen_random_uuid(),
  seq           bigint generated always as identity unique,
  workspace_id  uuid not null references public.admission_workspaces (id) on delete cascade,
  kind          text not null check (kind in ('verification', 'support', 'document_review')),
  subject       text not null check (char_length(btrim(subject)) between 3 and 140),
  body          text check (char_length(body) <= 1000),
  level         integer not null default 3 check (level between 1 and 3),
  status        text not null default 'waiting'
                check (status in ('waiting', 'called', 'serving', 'completed', 'no_show', 'cancelled')),
  counter_id    integer references public.service_counters (id),
  assigned_to   uuid references public.profiles (id) on delete set null,
  is_synthetic  boolean not null default false,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint queue_item_counter check ((status in ('called', 'serving')) = (counter_id is not null))
);
create index service_queue_items_active_idx on public.service_queue_items (status, level, seq);
create index service_queue_items_workspace_idx on public.service_queue_items (workspace_id);
create trigger service_queue_items_updated_at before update on public.service_queue_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------- notifications
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 140),
  body        text check (char_length(body) <= 1000),
  kind        text not null default 'info' check (kind in ('info', 'action', 'status')),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------------------------- audit log
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    text not null,
  before_data  jsonb,
  after_data   jsonb,
  note         text check (char_length(note) <= 500),
  undoable     boolean not null default false,
  undone_at    timestamptz,
  undone_by    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ---------------------------------------------------------------------------------------------- settings (demo dates etc.)
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------- rate limiting (server only)
create table public.auth_rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------------------------------------- reference data
insert into public.document_types (code, title, note, sort_order) values
  ('ssc_marksheet',    'SSC (Class 10) marksheet',             'Original and photocopies',            1),
  ('hsc_marksheet',    'HSC (Class 12) marksheet',             'Original and photocopies',            2),
  ('cet_scorecard',    'MHT-CET score card',                   'Printout of the score card',          3),
  ('allotment_letter', 'CAP allotment letter',                 'Printout of the allotment letter',    4),
  ('domicile',         'Domicile / nationality certificate',   'As required for your category',       5),
  ('category_cert',    'Category certificate (if applicable)', 'Only if you claim a reservation',     6),
  ('leaving_cert',     'School leaving certificate',           'Original',                            7),
  ('photo_id',         'Photo ID proof',                       'Any valid photo ID',                  8);

insert into public.service_counters (id, name) values (1, 'Counter 1'), (2, 'Counter 2'), (3, 'Counter 3');

-- Every new workspace starts with the full checklist.
create or replace function public.seed_workspace_checklist() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.document_checklists (workspace_id, doc_code)
  select new.id, d.code from public.document_types d
  on conflict do nothing;
  return new;
end $$;

create trigger admission_workspaces_checklist after insert on public.admission_workspaces
  for each row execute function public.seed_workspace_checklist();
