begin;
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
commit;
