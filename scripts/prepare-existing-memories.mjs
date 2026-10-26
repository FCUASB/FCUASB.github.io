import { readFile, writeFile } from 'node:fs/promises';
import { validateCatalogDocument } from '../shared/catalog.mjs';
const root = new URL('../', import.meta.url);
const read = async path => (await readFile(new URL(path, root), 'utf8')).replaceAll('\r\n', '\n');
const data = JSON.parse(await read('handoff-v1.1/工程檔/content.json'));
const memories = data.memories.map(m => validateCatalogDocument('memory', m));
if (new Set(memories.map(m => m.id)).size !== memories.length) throw Error('Duplicate memory ID');
const quote = value => "'" + value.replaceAll("'", "''") + "'";
// Keep the already deployed baseline immutable. Only replace the two existing RPCs.
const original = await read('supabase/setup/catalog-api.sql');
const start = original.indexOf('create function public.archive_catalog_public()');
if (start < 0) throw Error('Catalog baseline changed');
let functions = original.slice(start).replaceAll('create function public.', 'create or replace function public.')
  .replace("v_kind not in ('concert','biography')", "v_kind not in ('concert','biography','memory')")
  .replace("v_kind<>'concert'", "v_kind not in ('concert','memory')")
  .replace("'schemaVersion',1,", "'schemaVersion',1,\n   'memories',(select coalesce(jsonb_agg(document order by entry_id),'[]'::jsonb) from archive_private.catalog_entries where kind='memory' and deleted_at is null),\n   'managedMemoryIds',(select coalesce(jsonb_agg((entry_id)::bigint order by entry_id),'[]'::jsonb) from archive_private.catalog_entries where kind='memory'),");
const sql = `-- Delta after catalog-setup.sql. No submission, contact or attachment rows are changed.
-- Stable IDs and ON CONFLICT preserve all existing edits and soft deletions on retry.
begin;
set local lock_timeout='5s';
alter table archive_private.catalog_entries drop constraint catalog_entries_kind_check;
alter table archive_private.catalog_entries add constraint catalog_entries_kind_check check(kind in ('concert','biography','memory'));
alter table archive_private.catalog_entries drop constraint catalog_entries_check;
alter table archive_private.catalog_entries add constraint catalog_entries_check check(
 (kind='biography' and entry_id='main' and deleted_at is null)
 or (kind in ('concert','memory') and entry_id ~ '^[1-9][0-9]{0,15}$'));
${memories.map(doc => `insert into archive_private.catalog_entries(kind,entry_id,document) values('memory',${quote(String(doc.id))},${quote(JSON.stringify(doc))}::jsonb) on conflict do nothing;`).join('\n')}
${functions}`;
const target = new URL('supabase/deploy/existing-memories.sql', root);
if (process.argv.includes('--check')) { if (await readFile(target, 'utf8') !== sql) throw Error('Run prepare:memories'); }
else await writeFile(target, sql);
console.log(`PASS: ${memories.length} 筆既有回憶，完整保留原始資料，重跑不覆蓋後台修改。`);
