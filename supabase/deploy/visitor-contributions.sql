-- Delta after catalog-setup.sql, rate-limits.sql and existing-memories.sql. Not yet applied to any project.
-- Visitors publish concerts directly (no review); supplements are public additions and reports stay private.
-- All objects are service_role-only; the Edge Function validates input and verifies Turnstile first.
begin;
set local lock_timeout='5s';
alter table archive_private.catalog_history alter column actor_id drop not null;
alter table archive_private.catalog_history drop constraint catalog_history_action_check;
alter table archive_private.catalog_history add constraint catalog_history_action_check check(action in ('save','visibility','visitor_create'));
insert into archive_private.rate_limits values('visitor_write',120) on conflict do nothing;

create table archive_private.visitor_receipts(
  idempotency_key uuid primary key,
  kind text not null check(kind in ('concert','supplement','report')),
  target text not null,
  created_at timestamptz not null default now());
create table archive_private.catalog_contributions(
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('supplement','report')),
  target_kind text not null check(target_kind in ('concert','memory')),
  target_id text not null check(target_id ~ '^[A-Za-z0-9-]{1,64}$'),
  display_name text not null check(char_length(display_name) between 1 and 200),
  body jsonb not null check(jsonb_typeof(body)='object' and octet_length(body::text)<=20000),
  hidden_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check(kind<>'supplement' or target_kind='concert'));
create index catalog_contributions_target_idx on archive_private.catalog_contributions(kind,target_kind,target_id,created_at);
alter table archive_private.visitor_receipts enable row level security;
alter table archive_private.catalog_contributions enable row level security;
revoke all on archive_private.visitor_receipts,archive_private.catalog_contributions from public,anon,authenticated;
grant select,insert,update on archive_private.visitor_receipts,archive_private.catalog_contributions to service_role;
create policy visitor_receipts_backend on archive_private.visitor_receipts for all to service_role using(true) with check(true);
create policy catalog_contributions_backend on archive_private.catalog_contributions for all to service_role using(true) with check(true);

-- A visitor-created concert is an ordinary catalog entry marked origin=visitor. The id is generated here.
create function archive_private.visitor_concert(p_record jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key uuid:=(p_record->>'idempotencyKey')::uuid; v_doc jsonb:=p_record->'document'; v_id bigint; v_old text; v_try integer:=0;
begin
  select target into v_old from archive_private.visitor_receipts where idempotency_key=v_key;
  if v_old is not null then return jsonb_build_object('id',v_old,'status','received'); end if;
  if jsonb_typeof(v_doc) is distinct from 'object' or v_doc->>'origin' is distinct from 'visitor' then raise exception 'invalid document' using errcode='22023'; end if;
  if (select count(*) from archive_private.catalog_entries where kind='concert' and document->>'origin'='visitor')>=100 then raise exception 'visitor limit' using errcode='22023'; end if;
  if (select count(*) from archive_private.catalog_entries)>=500 then raise exception 'catalog full' using errcode='22023'; end if;
  loop
    v_id:=(extract(epoch from clock_timestamp())*1000)::bigint*1000+floor(random()*1000)::integer;
    begin
      insert into archive_private.catalog_entries(kind,entry_id,document) values('concert',v_id::text,jsonb_set(v_doc,'{id}',to_jsonb(v_id)));
      exit;
    exception when unique_violation then
      v_try:=v_try+1; if v_try>5 then raise exception 'id unavailable' using errcode='22023'; end if;
    end;
  end loop;
  insert into archive_private.catalog_history(kind,entry_id,revision,actor_id,action,document)
    values('concert',v_id::text,1,null,'visitor_create',jsonb_set(v_doc,'{id}',to_jsonb(v_id)));
  insert into archive_private.visitor_receipts(idempotency_key,kind,target) values(v_key,'concert',v_id::text);
  return jsonb_build_object('id',v_id::text,'status','received');
end;
$$;

-- Supplements are public additions to a public concert; reports (concert or memory) are visible only to admins.
create function archive_private.visitor_contribution(p_record jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_key uuid:=(p_record->>'idempotencyKey')::uuid; v_kind text:=p_record->>'kind'; v_tk text:=p_record->>'targetKind';
  v_tid text:=p_record->>'targetId'; v_old text; v_new uuid;
begin
  select target into v_old from archive_private.visitor_receipts where idempotency_key=v_key;
  if v_old is not null then return jsonb_build_object('id',v_old,'status','received'); end if;
  if v_kind not in ('supplement','report') or v_tk not in ('concert','memory') or (v_kind='supplement' and v_tk<>'concert') then raise exception 'invalid kind' using errcode='22023'; end if;
  if v_kind='supplement' then
    if not exists(select 1 from archive_private.catalog_entries where kind='concert' and entry_id=v_tid and deleted_at is null) then raise exception 'target missing' using errcode='P0002'; end if;
    if (select count(*) from archive_private.catalog_contributions where kind='supplement' and target_id=v_tid and hidden_at is null)>=20 then raise exception 'supplement limit' using errcode='22023'; end if;
  elsif (select count(*) from archive_private.catalog_contributions where kind='report' and resolved_at is null)>=500 then
    raise exception 'report limit' using errcode='22023';
  end if;
  insert into archive_private.catalog_contributions(kind,target_kind,target_id,display_name,body)
    values(v_kind,v_tk,v_tid,p_record->>'name',p_record->'body') returning id into v_new;
  insert into archive_private.visitor_receipts(idempotency_key,kind,target) values(v_key,v_kind,v_new::text);
  return jsonb_build_object('id',v_new::text,'status','received');
end;
$$;

create function archive_private.catalog_supplements()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'concertId',c.target_id,'name',c.display_name,'body',c.body,'createdAt',c.created_at) order by c.created_at),'[]'::jsonb)
 from archive_private.catalog_contributions c join archive_private.catalog_entries e on e.kind='concert' and e.entry_id=c.target_id and e.deleted_at is null
 where c.kind='supplement' and c.hidden_at is null;
$$;

-- Admin listing and moderation. Any live admin role may read; only system/content admins may change state.
create function public.archive_visitor_admin(p_actor uuid,p_session uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_kind text:=p_input->>'kind'; v_id uuid; v_row archive_private.catalog_contributions%rowtype;
begin
  v_role:=public.archive_admin_action(p_actor,p_session,'profile','{}'::jsonb)->>'role';
  if v_role is null then raise exception 'access denied' using errcode='42501'; end if;
  if p_action='list' then
    if v_kind not in ('supplement','report') then raise exception 'invalid kind' using errcode='22023'; end if;
    return (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb) from
      (select * from archive_private.catalog_contributions where kind=v_kind order by created_at desc limit 500) c);
  end if;
  if v_role not in ('system_admin','content_admin') then raise exception 'access denied' using errcode='42501'; end if;
  begin v_id:=(p_input->>'id')::uuid; exception when others then raise exception 'invalid id' using errcode='22023'; end;
  select * into v_row from archive_private.catalog_contributions where id=v_id for update;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  if p_action='hide' and v_row.kind='supplement' then update archive_private.catalog_contributions set hidden_at=now() where id=v_id;
  elsif p_action='restore' and v_row.kind='supplement' then update archive_private.catalog_contributions set hidden_at=null where id=v_id;
  elsif p_action='resolve' and v_row.kind='report' then update archive_private.catalog_contributions set resolved_at=now() where id=v_id;
  elsif p_action='reopen' and v_row.kind='report' then update archive_private.catalog_contributions set resolved_at=null where id=v_id;
  else raise exception 'invalid action' using errcode='22023'; end if;
  return (select to_jsonb(c) from archive_private.catalog_contributions c where id=v_id);
end;
$$;

create function public.archive_visitor_concert(p_record jsonb) returns jsonb language sql security invoker set search_path='' as $$ select archive_private.visitor_concert(p_record); $$;
create function public.archive_visitor_contribution(p_record jsonb) returns jsonb language sql security invoker set search_path='' as $$ select archive_private.visitor_contribution(p_record); $$;
create function public.archive_catalog_supplements() returns jsonb language sql stable security invoker set search_path='' as $$ select archive_private.catalog_supplements(); $$;
revoke all on function archive_private.visitor_concert(jsonb),archive_private.visitor_contribution(jsonb),archive_private.catalog_supplements() from public,anon,authenticated;
grant execute on function archive_private.visitor_concert(jsonb),archive_private.visitor_contribution(jsonb),archive_private.catalog_supplements() to service_role;
revoke all on function public.archive_visitor_concert(jsonb),public.archive_visitor_contribution(jsonb),public.archive_catalog_supplements(),public.archive_visitor_admin(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_visitor_concert(jsonb),public.archive_visitor_contribution(jsonb),public.archive_catalog_supplements(),public.archive_visitor_admin(uuid,uuid,text,jsonb) to service_role;
commit;
