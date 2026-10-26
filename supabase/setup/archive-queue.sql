-- Apply after intake/admin/rate/media SQL. Private durable Drive queue, not a scheduler.
begin;
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
