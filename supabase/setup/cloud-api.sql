-- Atomic deployment of reviewed cloud API; foundation must already exist.
-- Not yet applied. No visitor grants, admin accounts, secrets, or service enablement.
begin;
-- Source: intake-api.sql; sha256=361a433f71acfe3ffc26d476287629c1b87d1b920bfaea6779379c1fd6f7343f
-- Not yet applied. Service-only RPC bridge; never grant to anon/authenticated.

set local lock_timeout = '5s';
alter table archive_private.submissions add column context jsonb not null default '{}'::jsonb;
alter table archive_private.submissions add column display_id bigint generated always as identity (start with 1000000000000000) unique;
alter table archive_private.submissions add constraint submissions_display_safe check(display_id<=9007199254740991);
alter table archive_private.attachments add column width integer not null default 400 check(width between 1 and 100000);
alter table archive_private.attachments add column height integer not null default 300 check(height between 1 and 100000);
create function archive_private.receive_memory(p_record jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_existing archive_private.submissions%rowtype; v_file jsonb; v_attachment uuid; v_slot integer:=0;
begin
  if length(btrim(p_record->>'display_name')) not between 1 and 200
     or length(coalesce(p_record->>'body','')) > 5000
     or (coalesce(p_record->>'body','') = '' and coalesce(p_record->>'youtube_id','') = '' and jsonb_array_length(coalesce(p_record->'uploads','[]'::jsonb))=0)
     or length(coalesce(p_record->>'email','')) > 254
     or length(coalesce(p_record->>'phone','')) > 80 then
    raise exception 'invalid input' using errcode='22023';
  end if;
  if jsonb_array_length(coalesce(p_record->'uploads','[]'::jsonb)) + (case when nullif(p_record->>'youtube_id','') is null then 0 else 1 end) > 10
    then raise exception 'too many attachments' using errcode='22023'; end if;
  -- Serialize retries for this random receipt key, not all event attendees.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_record->>'idempotency_key',0));
  select * into v_existing from archive_private.submissions
    where idempotency_key=(p_record->>'idempotency_key')::uuid;
  if found then
    -- Reused key cannot change content or undo a moderator's soft deletion.
    if v_existing.display_name is distinct from p_record->>'display_name'
       or v_existing.body is distinct from p_record->>'body'
       or v_existing.context is distinct from coalesce(p_record->'context','{}'::jsonb)
       or v_existing.memory_year is distinct from (p_record->>'memory_year')::integer
       or exists(select 1 from archive_private.submission_contacts c where c.submission_id=v_existing.id
         and (c.phone is distinct from nullif(p_record->>'phone','') or c.email is distinct from nullif(p_record->>'email','')))
       or (select a.youtube_id from archive_private.attachments a where a.submission_id=v_existing.id and a.source='youtube' limit 1)
         is distinct from nullif(p_record->>'youtube_id','')
       or coalesce((select jsonb_agg(jsonb_build_object('filename',a.original_filename,'mime_type',a.mime_type,'size_bytes',a.size_bytes,'width',a.width,'height',a.height) order by a.slot)
         from archive_private.attachments a where a.submission_id=v_existing.id and a.source='upload'),'[]'::jsonb)
         is distinct from coalesce((select jsonb_agg(value-'initial_error') from jsonb_array_elements(p_record->'uploads')),'[]'::jsonb) then
      raise exception 'idempotency conflict' using errcode='22023';
    end if;
    return pg_catalog.jsonb_build_object('id',v_existing.id);
  end if;
  insert into archive_private.submissions(idempotency_key,display_name,body,memory_year,status,context)
    values((p_record->>'idempotency_key')::uuid,p_record->>'display_name',p_record->>'body',
      (p_record->>'memory_year')::integer,'published',coalesce(p_record->'context','{}'::jsonb)) returning id into v_id;
  insert into archive_private.submission_contacts(submission_id,phone,email)
    values(v_id,nullif(p_record->>'phone',''),nullif(p_record->>'email',''));
  if nullif(p_record->>'youtube_id','') is not null then
    v_slot:=1;
    insert into archive_private.attachments(submission_id,slot,source,youtube_id,status)
      values(v_id,1,'youtube',p_record->>'youtube_id','ready');
  end if;
  for v_file in select value from jsonb_array_elements(coalesce(p_record->'uploads','[]'::jsonb)) loop
    v_slot:=v_slot+1; v_attachment:=gen_random_uuid();
    insert into archive_private.attachments(id,submission_id,slot,source,object_path,original_filename,mime_type,size_bytes,width,height,status,error_code)
      values(v_attachment,v_id,v_slot,'upload',v_id::text||'/'||v_attachment::text,v_file->>'filename',v_file->>'mime_type',(v_file->>'size_bytes')::bigint,coalesce((v_file->>'width')::integer,400),coalesce((v_file->>'height')::integer,300),
        case when v_file->>'initial_error' is null then 'pending' else 'failed' end,v_file->>'initial_error');
  end loop;
  insert into archive_private.audit_events(action,target_id) values('submission.received',v_id);
  return pg_catalog.jsonb_build_object('id',v_id);
end;
$$;
revoke all on function archive_private.receive_memory(jsonb) from public,anon,authenticated;
grant execute on function archive_private.receive_memory(jsonb) to service_role;

create function archive_private.list_memories(p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) from (
 select s.id,s.created_at,jsonb_build_object('id',s.id,'displayId',s.display_id,'name',s.display_name,'body',s.body,
  'year',s.memory_year,'context',s.context,'createdAt',s.created_at,
  'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'source',a.source,
    'youtubeId',a.youtube_id,'status',a.status,'mimeType',a.mime_type,'width',a.width,'height',a.height) order by a.slot)
    from archive_private.attachments a where a.submission_id=s.id and a.deleted_at is null),'[]'::jsonb)) as item
 from archive_private.submissions s where s.status='published' and s.deleted_at is null
   and (p_before is null or (s.created_at,s.id)<(p_before,p_before_id))
 order by s.created_at desc,s.id desc limit 100
) rows;
$$;
revoke all on function archive_private.list_memories(timestamptz,uuid) from public,anon,authenticated;
grant execute on function archive_private.list_memories(timestamptz,uuid) to service_role;
grant usage on schema archive_private to service_role;
-- Public wrappers do not elevate the caller; only the backend role can execute.
create function public.archive_receive_memory(p_record jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
 select archive_private.receive_memory(p_record);
$$;
create function public.archive_list_memories(p_before timestamptz default null,p_before_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
 select archive_private.list_memories(p_before,p_before_id);
$$;
revoke all on function public.archive_receive_memory(jsonb) from public,anon,authenticated;
revoke all on function public.archive_list_memories(timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.archive_receive_memory(jsonb) to service_role;
grant execute on function public.archive_list_memories(timestamptz,uuid) to service_role;

-- Source: admin-api.sql; sha256=e9f7b9b0fcb6a346678f3615a42c3df774cac3a227b7a4c62b261742a401170a
-- Apply after intake-api.sql; service-only, each operation checks live membership and session.

set local lock_timeout='5s';
alter table archive_private.audit_events add column details jsonb not null default '{}'::jsonb;
create function archive_private.admin_action(p_actor uuid,p_session uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text; v_result jsonb; v_before jsonb; v_after jsonb; v_id uuid; v_target uuid;
begin
  select m.role into v_role from archive_private.admin_members m
  join auth.sessions se on se.user_id=m.user_id and se.id=p_session
  where m.user_id=p_actor and m.active and (se.not_after is null or se.not_after>now());
  if v_role is null then raise exception 'access denied' using errcode='42501'; end if;
  if p_action='profile' then return jsonb_build_object('userId',p_actor,'role',v_role); end if;
  if p_action='archive_status' then
    return jsonb_build_object('counts',(select coalesce(jsonb_object_agg(status,n),'{}'::jsonb) from (
      select status,count(*) as n from archive_private.archive_jobs group by status) counts),
      'failures',(select coalesce(jsonb_agg(to_jsonb(j)),'[]'::jsonb) from (
        select id,submission_id,job_kind,status,error_code,attempts,next_attempt_at from archive_private.archive_jobs
        where status='failed' order by next_attempt_at desc limit 100) j));
  end if;
  if p_action='retry_archive' then
    if v_role<>'system_admin' then raise exception 'access denied' using errcode='42501'; end if;
    update archive_private.archive_jobs set status='pending',attempts=0,error_code=null,next_attempt_at=now(),lease_token=null,lease_expires_at=null
      where id=(p_input->>'id')::uuid and status='failed';
    if not found then raise exception 'job not failed' using errcode='40001'; end if;
    insert into archive_private.audit_events(actor_user_id,action,target_id) values(p_actor,'archive.retry',(p_input->>'id')::uuid);
    return jsonb_build_object('ok',true);
  end if;
  if p_action='download_metadata' then
    select jsonb_build_object('path',a.object_path,'mimeType',a.mime_type,'size',a.size_bytes,'filename',a.original_filename)
      into v_result from archive_private.attachments a where a.id=(p_input->>'id')::uuid and a.source='upload' and a.status='ready';
    insert into archive_private.audit_events(actor_user_id,action,target_id) values(p_actor,'attachment.download',(p_input->>'id')::uuid);
    return v_result;
  end if;
  if p_action in ('search','export') then
    if p_action='export' and v_role not in ('system_admin','data_curator') then
      raise exception 'access denied' using errcode='42501';
    end if;
    if length(coalesce(p_input->>'query',''))>200 then raise exception 'invalid query' using errcode='22023'; end if;
    select coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb) into v_result from (
      select s.id,s.created_at,jsonb_build_object('id',s.id,'name',s.display_name,'body',s.body,
        'year',s.memory_year,'context',s.context,'createdAt',s.created_at,'updatedAt',s.updated_at,'deletedAt',s.deleted_at,
        'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'filename',a.original_filename,
          'source',a.source,'youtubeId',a.youtube_id,'status',a.status,'deletedAt',a.deleted_at,'archiveStatus',j.status) order by a.slot)
          from archive_private.attachments a left join archive_private.archive_jobs j on j.attachment_id=a.id
          where a.submission_id=s.id),'[]'::jsonb))
        || case when p_action='export' then jsonb_build_object('phone',c.phone,'email',c.email) else '{}'::jsonb end as item
      from archive_private.submissions s left join archive_private.submission_contacts c on c.submission_id=s.id
      where (coalesce(p_input->>'query','')='' or strpos(lower(s.display_name||' '||s.body||' '||s.id::text),lower(p_input->>'query'))>0)
        and (coalesce(p_input->>'filter','all')='all'
          or (p_input->>'filter'='deleted' and s.deleted_at is not null)
          or (p_input->>'filter'='active' and s.deleted_at is null)
          or (p_input->>'filter'='upload_failed' and exists(select 1 from archive_private.attachments a where a.submission_id=s.id and a.status='failed'))
          or (p_input->>'filter'='archive_failed' and exists(select 1 from archive_private.attachments a join archive_private.archive_jobs j on j.attachment_id=a.id where a.submission_id=s.id and j.status='failed')))
        and (p_input->>'before' is null or (s.created_at,s.id)<((p_input->>'before')::timestamptz,(p_input->>'beforeId')::uuid))
      order by s.created_at desc,s.id desc limit 100
    ) page;
    if p_action='export' then insert into archive_private.audit_events(actor_user_id,action,details)
      values(p_actor,'contacts.export',jsonb_build_object('count',jsonb_array_length(v_result))); end if;
    return v_result;
  end if;
  if p_action='contacts' then
    if v_role not in ('system_admin','data_curator') then raise exception 'access denied' using errcode='42501'; end if;
    select jsonb_build_object('phone',phone,'email',email) into v_result from archive_private.submission_contacts
      where submission_id=(p_input->>'id')::uuid;
    insert into archive_private.audit_events(actor_user_id,action,target_id) values(p_actor,'contacts.read',(p_input->>'id')::uuid);
    return v_result;
  end if;
  if p_action='members' then
    if v_role<>'system_admin' then raise exception 'access denied' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) into v_result from archive_private.admin_members m;
    return v_result;
  end if;
  if p_action='set_role' then
    if v_role<>'system_admin' then raise exception 'access denied' using errcode='42501'; end if;
    perform pg_advisory_xact_lock(729845331);
    v_target:=(p_input->>'userId')::uuid;
    if p_input->>'role' not in ('system_admin','content_admin','data_curator') or jsonb_typeof(p_input->'active')<>'boolean'
      then raise exception 'invalid role' using errcode='22023'; end if;
    if exists(select 1 from archive_private.admin_members where user_id=v_target and role='system_admin' and active)
      and ((p_input->>'role')<>'system_admin' or not (p_input->>'active')::boolean)
      and (select count(*) from archive_private.admin_members where role='system_admin' and active)<=1
      then raise exception 'last administrator' using errcode='22023'; end if;
    select to_jsonb(m) into v_before from archive_private.admin_members m where user_id=v_target;
    insert into archive_private.admin_members(user_id,role,active) values(v_target,p_input->>'role',(p_input->>'active')::boolean)
      on conflict(user_id) do update set role=excluded.role,active=excluded.active returning to_jsonb(admin_members.*) into v_after;
    insert into archive_private.audit_events(actor_user_id,action,target_id,details)
      values(p_actor,'member.changed',v_target,jsonb_build_object('before',v_before,'after',v_after));
    return v_after;
  end if;
  if v_role not in ('system_admin','content_admin') then raise exception 'access denied' using errcode='42501'; end if;
  if p_action in ('edit','visibility') then
    v_id:=(p_input->>'id')::uuid;
    select to_jsonb(s) into v_before from archive_private.submissions s where s.id=v_id for update;
    if v_before is null then raise exception 'not found' using errcode='P0002'; end if;
    if (p_input->>'updatedAt')::timestamptz is distinct from (v_before->>'updated_at')::timestamptz
      then raise exception 'edit conflict' using errcode='40001'; end if;
    if p_action='edit' then
      if length(btrim(p_input->>'name')) not between 1 and 200 or length(p_input->>'body')>5000
        then raise exception 'invalid content' using errcode='22023'; end if;
      update archive_private.submissions set display_name=p_input->>'name',body=p_input->>'body',
        memory_year=(p_input->>'year')::integer,updated_at=clock_timestamp() where id=v_id;
    else
      if jsonb_typeof(p_input->'deleted')<>'boolean' then raise exception 'invalid state' using errcode='22023'; end if;
      update archive_private.submissions set deleted_at=case when (p_input->>'deleted')::boolean then now() else null end,
        updated_at=clock_timestamp() where id=v_id;
    end if;
    select to_jsonb(s) into v_after from archive_private.submissions s where s.id=v_id;
    insert into archive_private.audit_events(actor_user_id,action,target_id,details)
      values(p_actor,'submission.'||p_action,v_id,jsonb_build_object('before',v_before-'idempotency_key','after',v_after-'idempotency_key'));
    return jsonb_build_object('id',v_id,'updatedAt',v_after->'updated_at');
  end if;
  if p_action='attachment_visibility' then
    v_id:=(p_input->>'id')::uuid;
    if jsonb_typeof(p_input->'deleted')<>'boolean' then raise exception 'invalid state' using errcode='22023'; end if;
    update archive_private.attachments set deleted_at=case when (p_input->>'deleted')::boolean then now() else null end where id=v_id;
    if not found then raise exception 'not found' using errcode='P0002'; end if;
    insert into archive_private.audit_events(actor_user_id,action,target_id,details)
      values(p_actor,'attachment.visibility',v_id,jsonb_build_object('deleted',p_input->'deleted'));
    return jsonb_build_object('id',v_id);
  end if;
  raise exception 'unknown action' using errcode='22023';
end;
$$;
revoke all on function archive_private.admin_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function archive_private.admin_action(uuid,uuid,text,jsonb) to service_role;
create function public.archive_admin_action(p_actor uuid,p_session uuid,p_action text,p_input jsonb)
returns jsonb language sql security invoker set search_path='' as $$
select archive_private.admin_action(p_actor,p_session,p_action,p_input);
$$;
revoke all on function public.archive_admin_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_admin_action(uuid,uuid,text,jsonb) to service_role;

-- Source: rate-limits.sql; sha256=0b0d2f2c35990731fe8ab27c2b348bb3f0a902eaaa688cbec896c874af44d9d3
-- Service-only global circuit breakers; limits are operational defaults, not capacity claims.

create table archive_private.rate_limits(scope text primary key,requests_per_minute integer not null check(requests_per_minute>0));
create table archive_private.rate_windows(scope text references archive_private.rate_limits(scope),window_start timestamptz not null,
  requests integer not null check(requests>=0),primary key(scope,window_start));
create index rate_windows_expiry_idx on archive_private.rate_windows(window_start);
alter table archive_private.rate_limits enable row level security;
alter table archive_private.rate_windows enable row level security;
revoke all on archive_private.rate_limits,archive_private.rate_windows from public,anon,authenticated;
insert into archive_private.rate_limits values('intake_request',6000),('intake_write',600),('upload_ticket',2400),('admin',1200);
create function archive_private.consume_rate(p_scope text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_limit integer; v_used integer;
begin
  select requests_per_minute into v_limit from archive_private.rate_limits where scope=p_scope;
  if v_limit is null then return false; end if;
  insert into archive_private.rate_windows(scope,window_start,requests) values(p_scope,date_trunc('minute',now()),1)
    on conflict(scope,window_start) do update set requests=archive_private.rate_windows.requests+1
    where archive_private.rate_windows.requests<v_limit returning requests into v_used;
  delete from archive_private.rate_windows where window_start<now()-interval '2 days';
  return v_used is not null;
end;
$$;
revoke all on function archive_private.consume_rate(text) from public,anon,authenticated;
grant execute on function archive_private.consume_rate(text) to service_role;
create function public.archive_consume_rate(p_scope text)
returns boolean language sql security invoker set search_path='' as $$ select archive_private.consume_rate(p_scope); $$;
revoke all on function public.archive_consume_rate(text) from public,anon,authenticated;
grant execute on function public.archive_consume_rate(text) to service_role;

-- Source: media-api.sql; sha256=c61ece9de13b90b8619dd91a082d34c3c242645be39a773a424e2dd9a752a651

set local lock_timeout='5s';
create function archive_private.upload_action(p_key uuid,p_id uuid,p_action text,p_size bigint default null,p_mime text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_attachment archive_private.attachments%rowtype; v_result jsonb;
begin
  if p_action='list' then
    select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'status',a.status,'filename',a.original_filename,'errorCode',a.error_code) order by a.slot),'[]'::jsonb)
      into v_result from archive_private.submissions s join archive_private.attachments a on a.submission_id=s.id
      where s.id=p_id and s.idempotency_key=p_key and s.deleted_at is null and a.deleted_at is null and a.source='upload'
        and s.created_at>now()-interval '24 hours';
    return v_result;
  end if;
  select a.* into v_attachment from archive_private.attachments a join archive_private.submissions s on s.id=a.submission_id
    where a.id=p_id and s.idempotency_key=p_key and s.deleted_at is null and a.deleted_at is null
      and a.source='upload' and s.created_at>now()-interval '24 hours' for update of a;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  if v_attachment.error_code in ('FILE_TOO_LARGE','UNSUPPORTED_FORMAT','EMPTY_FILE') then raise exception 'file not eligible' using errcode='22023'; end if;
  if p_action='complete' then
    if v_attachment.size_bytes is distinct from p_size or v_attachment.mime_type is distinct from p_mime then
      raise exception 'file metadata mismatch' using errcode='22023'; end if;
    update archive_private.attachments set status='ready',error_code=null where id=p_id;
    insert into archive_private.archive_jobs(attachment_id) values(p_id) on conflict(attachment_id) do nothing;
  elsif p_action='fail' then
    if v_attachment.status<>'ready' then update archive_private.attachments set status='failed',error_code='UPLOAD_FAILED' where id=p_id; end if;
  elsif p_action<>'ticket' then raise exception 'invalid action' using errcode='22023';
  end if;
  return jsonb_build_object('id',p_id,'path',v_attachment.object_path,'mimeType',v_attachment.mime_type,'size',v_attachment.size_bytes);
end;
$$;
create function archive_private.public_media(p_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('path',a.object_path,'mimeType',a.mime_type,'size',a.size_bytes)
  from archive_private.attachments a join archive_private.submissions s on s.id=a.submission_id
  where a.id=p_id and a.source='upload' and a.status='ready' and a.deleted_at is null and s.deleted_at is null and s.status='published';
$$;
revoke all on function archive_private.upload_action(uuid,uuid,text,bigint,text) from public,anon,authenticated;
revoke all on function archive_private.public_media(uuid) from public,anon,authenticated;
grant execute on function archive_private.upload_action(uuid,uuid,text,bigint,text),archive_private.public_media(uuid) to service_role;
create function public.archive_upload_action(p_key uuid,p_id uuid,p_action text,p_size bigint default null,p_mime text default null)
returns jsonb language sql security invoker set search_path='' as $$ select archive_private.upload_action(p_key,p_id,p_action,p_size,p_mime); $$;
create function public.archive_public_media(p_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select archive_private.public_media(p_id); $$;
revoke all on function public.archive_upload_action(uuid,uuid,text,bigint,text),public.archive_public_media(uuid) from public,anon,authenticated;
grant execute on function public.archive_upload_action(uuid,uuid,text,bigint,text),public.archive_public_media(uuid) to service_role;

-- Source: archive-queue.sql; sha256=039e250311309db724f0c22291ab2eefdaf8553be9e3a787c3e9430aab07ee0b
-- Apply after intake/admin/rate/media SQL. Private durable Drive queue, not a scheduler.

set local lock_timeout='5s';
alter table archive_private.archive_jobs alter column attachment_id drop not null;
alter table archive_private.archive_jobs add column submission_id uuid references archive_private.submissions(id);
update archive_private.archive_jobs j set submission_id=a.submission_id from archive_private.attachments a where a.id=j.attachment_id;
alter table archive_private.archive_jobs alter column submission_id set not null;
alter table archive_private.archive_jobs add column job_kind text not null default 'attachment' check(job_kind in ('attachment','manifest'));
alter table archive_private.archive_jobs add column lease_token uuid;
alter table archive_private.archive_jobs add column upload_session text;
alter table archive_private.archive_jobs add column bytes_uploaded bigint not null default 0 check(bytes_uploaded>=0);
alter table archive_private.archive_jobs add column revision bigint not null default 1;
alter table archive_private.archive_jobs add column upload_revision bigint;
alter table archive_private.archive_jobs add constraint archive_job_target check((job_kind='attachment' and attachment_id is not null) or (job_kind='manifest' and attachment_id is null));
create unique index archive_manifest_unique on archive_private.archive_jobs(submission_id) where job_kind='manifest';
create index archive_jobs_submission_idx on archive_private.archive_jobs(submission_id);
create table archive_private.archive_folders(submission_id uuid primary key references archive_private.submissions(id),drive_folder_id text not null unique);
alter table archive_private.archive_folders enable row level security;
revoke all on archive_private.archive_folders from public,anon,authenticated;

create function archive_private.assign_job_submission() returns trigger language plpgsql set search_path='' as $$
begin
  if new.job_kind='attachment' then select submission_id into new.submission_id from archive_private.attachments where id=new.attachment_id; end if;
  return new;
end;
$$;
create trigger archive_job_submission before insert on archive_private.archive_jobs for each row execute function archive_private.assign_job_submission();
create function archive_private.enqueue_manifest() returns trigger language plpgsql set search_path='' as $$
declare v_submission uuid;
begin
  if tg_table_name='submissions' then v_submission:=new.id; else v_submission:=new.submission_id; end if;
  insert into archive_private.archive_jobs(submission_id,job_kind) values(v_submission,'manifest')
    on conflict(submission_id) where job_kind='manifest' do update set revision=archive_private.archive_jobs.revision+1,
      status=case when archive_private.archive_jobs.status='running' then 'running' else 'pending' end,
      attempts=0,next_attempt_at=now();
  return new;
end;
$$;
create trigger archive_submission_manifest after insert or update on archive_private.submissions for each row execute function archive_private.enqueue_manifest();
create trigger archive_attachment_manifest after insert or update on archive_private.attachments for each row execute function archive_private.enqueue_manifest();
revoke all on function archive_private.assign_job_submission(),archive_private.enqueue_manifest() from public,anon,authenticated;
-- Existing cloud submissions are new service data, not browser IndexedDB imports.
insert into archive_private.archive_jobs(submission_id,job_kind) select id,'manifest' from archive_private.submissions
  on conflict(submission_id) where job_kind='manifest' do nothing;

create function archive_private.archive_work(p_action text,p_id uuid default null,p_token uuid default null,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_job archive_private.archive_jobs%rowtype; v_result jsonb; v_file text; v_submission uuid;
begin
  if p_action='claim' then
    update archive_private.attachments a set status='failed',error_code='UPLOAD_EXPIRED'
      from archive_private.submissions s where s.id=a.submission_id and a.source='upload'
        and a.status in ('pending','uploaded','processing') and s.created_at<now()-interval '24 hours';
    select * into v_job from archive_private.archive_jobs j where j.attempts<10
      and ((j.status in ('pending','failed') and j.next_attempt_at<=now()) or (j.status='running' and j.lease_expires_at<now()))
      order by j.next_attempt_at,j.created_at,j.id for update skip locked limit 1;
    if not found then return null; end if;
    update archive_private.archive_jobs set status='running',lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',
      upload_session=case when upload_revision is distinct from revision then null else upload_session end,
      bytes_uploaded=case when upload_revision is distinct from revision then 0 else bytes_uploaded end
      where id=v_job.id returning * into v_job;
    select jsonb_build_object('jobId',v_job.id,'token',v_job.lease_token,'kind',v_job.job_kind,'revision',v_job.revision,
      'submissionId',s.id,'createdAt',s.created_at,'driveFileId',v_job.drive_file_id,'sessionUrl',v_job.upload_session,'offset',v_job.bytes_uploaded,
      'folderId',(select drive_folder_id from archive_private.archive_folders f where f.submission_id=s.id),
      'attachmentId',a.id,'filename',a.original_filename,'mimeType',a.mime_type,'size',a.size_bytes,'objectPath',a.object_path,
      'manifest',jsonb_build_object('schemaVersion',1,'id',s.id,'name',s.display_name,'body',s.body,'year',s.memory_year,
        'context',s.context,'createdAt',s.created_at,'updatedAt',s.updated_at,'deletedAt',s.deleted_at,
        'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'source',x.source,'youtubeId',x.youtube_id,
          'filename',x.original_filename,'mimeType',x.mime_type,'size',x.size_bytes,'status',x.status,'deletedAt',x.deleted_at,
          'driveFileId',(select drive_file_id from archive_private.archive_jobs aj where aj.attachment_id=x.id and aj.status='completed')) order by x.slot)
          from archive_private.attachments x where x.submission_id=s.id),'[]'::jsonb))) into v_result
    from archive_private.submissions s left join archive_private.attachments a on a.id=v_job.attachment_id where s.id=v_job.submission_id;
    return v_result;
  end if;
  select * into v_job from archive_private.archive_jobs where id=p_id and lease_token=p_token and status='running'
    and lease_expires_at>now() for update;
  if not found then raise exception 'lease expired' using errcode='40001'; end if;
  if p_action='folder' then
    if (p_data->>'fileId') !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'invalid folder' using errcode='22023'; end if;
    insert into archive_private.archive_folders(submission_id,drive_folder_id) values(v_job.submission_id,p_data->>'fileId')
      on conflict(submission_id) do nothing;
    select drive_folder_id into v_file from archive_private.archive_folders where submission_id=v_job.submission_id;
    return jsonb_build_object('fileId',v_file);
  elsif p_action='reserve_file' then
    if (p_data->>'fileId') !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'invalid file' using errcode='22023'; end if;
    update archive_private.archive_jobs set drive_file_id=coalesce(drive_file_id,p_data->>'fileId') where id=p_id returning drive_file_id into v_file;
    return jsonb_build_object('fileId',v_file);
  elsif p_action='session' then
    if (p_data->>'url') !~ '^https://www\.googleapis\.com/upload/drive/v3/files(/[A-Za-z0-9_-]{10,200})?[?]' then raise exception 'invalid session' using errcode='22023'; end if;
    update archive_private.archive_jobs set upload_session=p_data->>'url',bytes_uploaded=0,upload_revision=(p_data->>'revision')::bigint where id=p_id;
  elsif p_action='progress' then
    if (p_data->>'offset')::bigint<0 then raise exception 'invalid progress' using errcode='22023'; end if;
    update archive_private.archive_jobs set bytes_uploaded=(p_data->>'offset')::bigint,lease_expires_at=now()+interval '2 minutes' where id=p_id;
  elsif p_action='yield' then
    update archive_private.archive_jobs set status='pending',lease_token=null,lease_expires_at=null,next_attempt_at=now() where id=p_id;
  elsif p_action='complete' then
    update archive_private.archive_jobs set status=case when revision=(p_data->>'revision')::bigint then 'completed' else 'pending' end,
      next_attempt_at=now(),lease_token=null,lease_expires_at=null,upload_session=null,bytes_uploaded=0,error_code=null,attempts=0 where id=p_id;
    if v_job.job_kind='attachment' then
      insert into archive_private.archive_jobs(submission_id,job_kind) values(v_job.submission_id,'manifest')
        on conflict(submission_id) where job_kind='manifest' do update set revision=archive_private.archive_jobs.revision+1,
          status=case when archive_private.archive_jobs.status='running' then 'running' else 'pending' end,next_attempt_at=now(),attempts=0;
    end if;
    insert into archive_private.audit_events(action,target_id) values('archive.completed',p_id);
  elsif p_action='fail' then
    if p_data->>'code' not in ('AUTH_REQUIRED','DRIVE_QUOTA','REMOTE_ERROR','SOURCE_MISSING','FILE_MISMATCH') then raise exception 'invalid error' using errcode='22023'; end if;
    update archive_private.archive_jobs set status='failed',attempts=attempts+1,error_code=p_data->>'code',lease_token=null,lease_expires_at=null,
      next_attempt_at=now()+make_interval(secs=>case when p_data->>'code'='AUTH_REQUIRED' then 3600 else least(3600,30*power(2,least(attempts,7)))::int end) where id=p_id;
    insert into archive_private.audit_events(action,target_id,details) values('archive.failed',p_id,jsonb_build_object('code',p_data->>'code'));
  else raise exception 'invalid action' using errcode='22023'; end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function archive_private.archive_work(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function archive_private.archive_work(text,uuid,uuid,jsonb) to service_role;
create function public.archive_work(p_action text,p_id uuid default null,p_token uuid default null,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$ select archive_private.archive_work(p_action,p_id,p_token,p_data); $$;
revoke all on function public.archive_work(text,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.archive_work(text,uuid,uuid,jsonb) to service_role;

commit;
