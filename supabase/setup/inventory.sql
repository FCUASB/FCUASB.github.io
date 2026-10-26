-- Read-only catalog inspection: no submission content or user emails.
select current_database(), current_user, version();
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'archive_private') and c.relkind = 'r'
order by 1, 2;
select schemaname, tablename, policyname, roles, cmd
from pg_policies where schemaname in ('public', 'archive_private', 'storage')
order by 1, 2, 3;
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'submission-media';
