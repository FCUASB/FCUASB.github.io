-- Additive delta after the deployed cloud API. No existing function is replaced.
begin;
set local lock_timeout='5s';
create table archive_private.catalog_entries (
  kind text not null check(kind in ('concert','biography')),
  entry_id text not null,
  document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=98304),
  revision integer not null default 1 check(revision>0),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(kind,entry_id),
  check ((kind='biography' and entry_id='main' and deleted_at is null) or (kind='concert' and entry_id ~ '^[1-9][0-9]{0,15}$'))
);
create table archive_private.catalog_history (
  event_id bigint generated always as identity primary key,
  kind text not null, entry_id text not null, revision integer not null,
  actor_id uuid not null, action text not null check(action in ('save','visibility')),
  document jsonb not null, deleted_at timestamptz, created_at timestamptz not null default now(),
  unique(kind,entry_id,revision)
);
alter table archive_private.catalog_entries enable row level security;
alter table archive_private.catalog_history enable row level security;
revoke all on archive_private.catalog_entries,archive_private.catalog_history from public,anon,authenticated;
grant select,insert,update on archive_private.catalog_entries to service_role;
grant select,insert on archive_private.catalog_history to service_role;
grant usage,select on sequence archive_private.catalog_history_event_id_seq to service_role;
create policy catalog_backend on archive_private.catalog_entries for all to service_role using(true) with check(true);
create policy catalog_history_read on archive_private.catalog_history for select to service_role using(true);
create policy catalog_history_insert on archive_private.catalog_history for insert to service_role with check(true);

create function public.archive_catalog_public()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,
   'biography',(select document from archive_private.catalog_entries where kind='biography' and entry_id='main'),
   'concerts',(select coalesce(jsonb_agg(document order by entry_id),'[]'::jsonb) from archive_private.catalog_entries where kind='concert' and deleted_at is null));
$$;
create function public.archive_catalog_action(p_actor uuid,p_session uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_kind text:=p_input->>'kind'; v_id text:=p_input->>'id';
 v_before archive_private.catalog_entries%rowtype; v_after archive_private.catalog_entries%rowtype; v_result jsonb;
begin
 -- Reuse the existing live membership/session check, never user_metadata claims.
 v_role:=public.archive_admin_action(p_actor,p_session,'profile','{}'::jsonb)->>'role';
 if v_role is null or v_kind not in ('concert','biography') then raise exception 'access denied' using errcode='42501'; end if;
 if p_action='list' then
   select coalesce(jsonb_agg(to_jsonb(e) order by entry_id),'[]'::jsonb) into v_result from archive_private.catalog_entries e where kind=v_kind;
   return v_result;
 end if;
 if p_action='history' then
   select coalesce(jsonb_agg(to_jsonb(h) order by revision desc),'[]'::jsonb) into v_result from
     (select revision,actor_id,action,document,deleted_at,created_at from archive_private.catalog_history where kind=v_kind and entry_id=v_id order by revision desc limit 100) h;
   return v_result;
 end if;
 if v_role not in ('system_admin','content_admin') then raise exception 'access denied' using errcode='42501'; end if;
 if v_kind='biography' and v_id<>'main' or v_id is null then raise exception 'invalid id' using errcode='22023'; end if;
 select * into v_before from archive_private.catalog_entries where kind=v_kind and entry_id=v_id for update;
 if coalesce(v_before.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'edit conflict' using errcode='40001'; end if;
 if p_action='save' then
   if jsonb_typeof(p_input->'document') is distinct from 'object' then raise exception 'invalid document' using errcode='22023'; end if;
   if v_before.revision is null then
     if (select count(*) from archive_private.catalog_entries)>=500 then raise exception 'catalog full' using errcode='22023'; end if;
     insert into archive_private.catalog_entries(kind,entry_id,document) values(v_kind,v_id,p_input->'document') returning * into v_after;
   else
     update archive_private.catalog_entries set document=p_input->'document',revision=revision+1,updated_at=now()
       where kind=v_kind and entry_id=v_id returning * into v_after;
   end if;
 elsif p_action='visibility' then
   if v_kind<>'concert' or v_before.revision is null or jsonb_typeof(p_input->'deleted') is distinct from 'boolean' then raise exception 'invalid state' using errcode='22023'; end if;
   update archive_private.catalog_entries set deleted_at=case when (p_input->>'deleted')::boolean then now() else null end,revision=revision+1,updated_at=now()
     where kind=v_kind and entry_id=v_id returning * into v_after;
 else raise exception 'invalid action' using errcode='22023'; end if;
 -- Retain original state too, including imported baseline before its first change.
 if v_before.revision is not null then
   insert into archive_private.catalog_history(kind,entry_id,revision,actor_id,action,document,deleted_at)
     values(v_kind,v_id,v_before.revision,p_actor,p_action,v_before.document,v_before.deleted_at) on conflict do nothing;
 end if;
 insert into archive_private.catalog_history(kind,entry_id,revision,actor_id,action,document,deleted_at)
   values(v_kind,v_id,v_after.revision,p_actor,p_action,v_after.document,v_after.deleted_at);
 return to_jsonb(v_after);
exception when unique_violation then raise exception 'edit conflict' using errcode='40001';
end;
$$;
revoke all on function public.archive_catalog_public(),public.archive_catalog_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_catalog_public(),public.archive_catalog_action(uuid,uuid,text,jsonb) to service_role;
commit;
