-- Service-only global circuit breakers; limits are operational defaults, not capacity claims.
begin;
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
commit;
