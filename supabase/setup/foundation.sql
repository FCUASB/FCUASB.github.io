-- Initial protected foundation only. NOT a public intake API.
-- Run inventory.sql first. Fails and rolls back if names already exist.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create schema archive_private;
revoke all on schema archive_private from public, anon, authenticated;
alter default privileges in schema archive_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema archive_private revoke execute on functions from public, anon, authenticated;

create table archive_private.admin_members (
  user_id uuid primary key references auth.users(id),
  role text not null check (role in ('system_admin', 'content_admin', 'data_curator')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table archive_private.submissions (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  display_name text not null check (length(btrim(display_name)) > 0),
  body text not null,
  memory_year integer check (memory_year between 1 and 9999),
  status text not null default 'received' check (status in ('received', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index submissions_created_idx on archive_private.submissions(created_at desc, id);
create index submissions_public_idx on archive_private.submissions(created_at desc, id)
  where deleted_at is null and status = 'published';
create table archive_private.submission_contacts (
  submission_id uuid primary key references archive_private.submissions(id),
  phone text,
  email text
);
create table archive_private.attachments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references archive_private.submissions(id),
  slot smallint not null check (slot between 1 and 10),
  source text not null check (source in ('upload', 'youtube')),
  object_path text unique,
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  original_filename text,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'processing', 'ready', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (submission_id, slot),
  check ((source = 'upload' and object_path is not null and youtube_id is null)
    or (source = 'youtube' and youtube_id is not null and object_path is null))
);
create table archive_private.archive_jobs (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid not null unique references archive_private.attachments(id),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  drive_file_id text,
  error_code text,
  created_at timestamptz not null default now()
);
create index archive_jobs_due_idx on archive_private.archive_jobs(next_attempt_at)
  where status in ('pending', 'failed');
create table archive_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_id uuid,
  created_at timestamptz not null default now()
);
create index audit_events_actor_idx on archive_private.audit_events(actor_user_id, created_at desc);
create index audit_events_target_idx on archive_private.audit_events(target_id, created_at desc);

alter table archive_private.admin_members enable row level security;
alter table archive_private.submissions enable row level security;
alter table archive_private.submission_contacts enable row level security;
alter table archive_private.attachments enable row level security;
alter table archive_private.archive_jobs enable row level security;
alter table archive_private.audit_events enable row level security;
revoke all on all tables in schema archive_private from public, anon, authenticated;
-- No policies, public grants, secret keys or initial admin are created here.
-- Backend access and role enforcement require a separately reviewed implementation.
commit;
