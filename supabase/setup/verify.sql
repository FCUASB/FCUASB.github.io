-- Expected: six rows, all rls_enabled=true, both privilege columns=false.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as anon_any_access,
       has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE') as authenticated_any_access
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'archive_private' and c.relkind = 'r'
order by 1;
-- Expected: both false; private bucket public=false.
select has_schema_privilege('anon', 'archive_private', 'USAGE') as anon_schema_access,
       has_schema_privilege('authenticated', 'archive_private', 'USAGE') as authenticated_schema_access;
select id, public from storage.buckets where id = 'submission-media';
