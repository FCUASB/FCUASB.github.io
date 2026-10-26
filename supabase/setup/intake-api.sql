-- Not yet applied. Service-only RPC bridge; never grant to anon/authenticated.
begin;
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
commit;
