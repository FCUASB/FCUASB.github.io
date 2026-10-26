-- Apply after intake-api.sql; service-only, each operation checks live membership and session.
begin;
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
commit;
