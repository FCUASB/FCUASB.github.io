import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { validateCatalogDocument } from '../shared/catalog.mjs';
const root=new URL('../',import.meta.url),check=process.argv.includes('--check');
const data=JSON.parse(await readFile(new URL('handoff-v1.1/工程檔/content.json',root),'utf8'));
const biography=validateCatalogDocument('biography',{biography:data.biography,biographyMore:data.biographyMore,career:data.career});
const records=[['biography','main',biography],...data.concerts.map(c=>['concert',String(c.id),validateCatalogDocument('concert',c)])];
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const seed='\n-- Import only reviewed repository content. Never overwrite existing cloud edits.\n'+records.map(([kind,id,doc])=>`insert into archive_private.catalog_entries(kind,entry_id,document) values(${quote(kind)},${quote(id)},${quote(JSON.stringify(doc))}::jsonb) on conflict do nothing;`).join('\n');
const source=(await readFile(new URL('supabase/setup/catalog-api.sql',root),'utf8')).replaceAll('\r\n','\n');
const sql=source.replace(/commit;\s*$/,seed+'\ncommit;\n');
const target=new URL('supabase/deploy/catalog-setup.sql',root);
if(check){if(await readFile(target,'utf8')!==sql)throw Error('Catalog setup differs from reviewed source');}
else{await mkdir(new URL('supabase/deploy/',root),{recursive:true});await writeFile(target,sql);}
console.log(`PASS: ${records.length} 筆音樂會／生平初始化資料，保留來源，無測試投稿。`);
