-- Incremental change after the deployed cloud-api.sql. Not yet applied remotely.
begin;
set local lock_timeout='5s';
create index audit_events_cursor_idx on archive_private.audit_events(created_at desc,id desc);
create function archive_private.list_audit(p_actor uuid,p_session uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_profile jsonb; v_result jsonb;
begin
  -- Reuse the existing live membership and auth.sessions check in this transaction.
  v_profile:=archive_private.admin_action(p_actor,p_session,'profile','{}'::jsonb);
  if v_profile->>'role' <> 'system_admin' then
    raise exception 'access denied' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id desc),'[]'::jsonb)
  into v_result from (
    select id,actor_user_id,action,target_id,created_at
    from archive_private.audit_events
    where (nullif(p_input->>'actorId','') is null or actor_user_id=(p_input->>'actorId')::uuid)
      and (nullif(p_input->>'targetId','') is null or target_id=(p_input->>'targetId')::uuid)
      and (nullif(p_input->>'action','') is null or action=p_input->>'action')
      and (nullif(p_input->>'before','') is null or
        (created_at,id)<((p_input->>'before')::timestamptz,(p_input->>'beforeId')::uuid))
    order by created_at desc,id desc limit 100
  ) e;
  return v_result;
end;
$$;
revoke all on function archive_private.list_audit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function archive_private.list_audit(uuid,uuid,jsonb) to service_role;
create function public.archive_list_audit(p_actor uuid,p_session uuid,p_input jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select archive_private.list_audit(p_actor,p_session,p_input);
$$;
revoke all on function public.archive_list_audit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.archive_list_audit(uuid,uuid,jsonb) to service_role;
commit;
