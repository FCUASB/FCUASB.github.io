import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const names=['intake-api','admin-api','rate-limits','media-api','archive-queue'];
const parts=['-- Atomic deployment of reviewed cloud API; foundation must already exist.','-- Not yet applied. No visitor grants, admin accounts, secrets, or service enablement.','begin;'];
for(const name of names){
  const source=(await readFile(new URL(`../supabase/setup/${name}.sql`,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  const body=source.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
  parts.push(`-- Source: ${name}.sql; sha256=${createHash('sha256').update(source).digest('hex')}`,body);
}
parts.push('commit;','');
const result=parts.join('\n');
const target=new URL('../supabase/setup/cloud-api.sql',import.meta.url);
if(process.argv.includes('--check')){
  if(await readFile(target,'utf8')!==result)throw new Error('Cloud SQL bundle is stale. Run npm run prepare:cloud-sql');
}else await writeFile(target,result);
console.log(process.argv.includes('--check')?'PASS: 雲端 SQL 組合檔與來源一致。':'已產生原子雲端 SQL 組合檔。');
