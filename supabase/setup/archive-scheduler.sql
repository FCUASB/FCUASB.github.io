-- Manual deployment only. Creates/updates a DISABLED schedule in one transaction.
-- Prerequisites: pg_cron, pg_net, Vault; archive worker independently authenticated.
-- Vault name archive_worker_secret must match Edge ARCHIVE_WORKER_SECRET.
-- Never paste its value into this file or SQL Editor history.
begin;
do $setup$
declare
  scheduled_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception 'Enable and review pg_cron, pg_net and Vault before deployment';
  end if;
  if (select count(*) from vault.decrypted_secrets
      where name = 'archive_worker_secret' and length(decrypted_secret) >= 32) <> 1 then
    raise exception 'Exactly one valid archive_worker_secret is required in Vault';
  end if;
  scheduled_id := cron.schedule(
    'dalu-drive-archive', '* * * * *',
    $command$
      select net.http_post(
        url := 'https://rikgchswpjaxlnhdrxtw.supabase.co/functions/v1/archive-worker',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' ||
            (select decrypted_secret from vault.decrypted_secrets
             where name = 'archive_worker_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 90000
      ) where (select count(*) from vault.decrypted_secrets
               where name = 'archive_worker_secret' and length(decrypted_secret) >= 32) = 1;
    $command$
  );
  perform cron.alter_job(scheduled_id, active := false);
end
$setup$;
commit;

-- Inspect only non-secret fields after deployment:
select jobid, jobname, schedule, active from cron.job
where jobname = 'dalu-drive-archive';
-- Activate only after OAuth, manual archive and gateway authentication pass:
-- select cron.alter_job(jobid, active := true) from cron.job where jobname = 'dalu-drive-archive';
-- Pause without deleting jobs, queue entries or files:
-- select cron.alter_job(jobid, active := false) from cron.job where jobname = 'dalu-drive-archive';
