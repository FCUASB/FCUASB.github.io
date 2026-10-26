import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
test('durable archive queue fences stale workers, preserves IDs, and requeues changed manifests',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role;
      create schema auth;create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);`);
    for(const name of ['foundation','cloud-api'])await db.exec(await readFile(new URL(`../supabase/setup/${name}.sql`,import.meta.url),'utf8'));
    const exposed=(await db.query(`select p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') as anon_access,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as user_access from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'archive_%'`)).rows;
    assert.equal(exposed.length,7);assert.ok(exposed.every(p=>!p.prosecdef&&!p.anon_access&&!p.user_access));
    await db.exec(await readFile(new URL('../supabase/setup/audit-api.sql',import.meta.url),'utf8'));
    const record={idempotency_key:'2d469018-366a-4822-a06a-0a25fc13699d',display_name:'Synthetic',body:'Synthetic archive',memory_year:2000,
      context:{},phone:'private-synthetic',email:'private@example.test',youtube_id:null,uploads:[]};
    const rpc=async(name,args)=>{
      await db.exec('set role service_role');
      try{return(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as data`,args)).rows[0].data;}
      finally{await db.exec('reset role');}
    };
    const receipt=await rpc('archive_receive_memory',[JSON.stringify(record)]);
    const first=await rpc('archive_work',['claim',null,null,'{}']);
    assert.equal(first.kind,'manifest');assert.equal(first.submissionId,receipt.id);
    assert.equal(JSON.stringify(first.manifest).includes(record.email),false);
    assert.equal(JSON.stringify(first.manifest).includes(record.phone),false);
    assert.equal(await rpc('archive_work',['claim',null,null,'{}']),null);
    const work=(action,job,data={})=>rpc('archive_work',[action,job.jobId,job.token,JSON.stringify(data)]);
    assert.equal((await work('reserve_file',first,{fileId:'generated-file-00001'})).fileId,'generated-file-00001');
    assert.equal((await work('reserve_file',first,{fileId:'generated-file-00002'})).fileId,'generated-file-00001');
    await work('session',first,{url:'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic',revision:first.revision});
    await work('progress',first,{offset:10});await work('yield',first);
    const resumed=await rpc('archive_work',['claim',null,null,'{}']);
    assert.equal(resumed.driveFileId,'generated-file-00001');assert.equal(resumed.offset,10);assert.notEqual(resumed.token,first.token);
    await assert.rejects(work('complete',first,{revision:first.revision}),/lease expired/);
    await db.query('update archive_private.submissions set body=$1 where id=$2',['edited',receipt.id]);
    await work('complete',resumed,{revision:resumed.revision});
    const newest=await rpc('archive_work',['claim',null,null,'{}']);
    assert.equal(newest.manifest.body,'edited');assert.equal(newest.sessionUrl,null);
    await work('fail',newest,{code:'AUTH_REQUIRED'});
    assert.equal(await rpc('archive_work',['claim',null,null,'{}']),null);
    const failed=(await db.query('select status,error_code,attempts from archive_private.archive_jobs where id=$1',[newest.jobId])).rows[0];
    assert.deepEqual(failed,{status:'failed',error_code:'AUTH_REQUIRED',attempts:1});
    const actor='53f43393-2d36-4a93-9814-7a047a32ee97';
    await db.query('insert into auth.users(id) values($1)',[actor]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[actor]);
    await db.query("insert into archive_private.admin_members(user_id,role) values($1,'content_admin')",[actor]);
    const status=await rpc('archive_admin_action',[actor,actor,'archive_status','{}']);
    assert.equal(status.counts.failed,1);assert.equal(status.failures[0].error_code,'AUTH_REQUIRED');
    assert.equal(JSON.stringify(status).includes('upload_id'),false);
    await assert.rejects(rpc('archive_admin_action',[actor,actor,'retry_archive',JSON.stringify({id:newest.jobId})]),/access denied/);
    await assert.rejects(rpc('archive_list_audit',[actor,actor,'{}']),/access denied/);
    await db.query("update archive_private.admin_members set role='system_admin' where user_id=$1",[actor]);
    await rpc('archive_admin_action',[actor,actor,'retry_archive',JSON.stringify({id:newest.jobId})]);
    assert.equal((await rpc('archive_work',['claim',null,null,'{}'])).jobId,newest.jobId);
    const events=await rpc('archive_list_audit',[actor,actor,'{}']);
    assert.ok(events.some(e=>e.action==='archive.retry'));
    assert.ok(events.every(e=>!('details' in e)));
    const last=events.at(-1);
    assert.deepEqual(await rpc('archive_list_audit',[actor,actor,JSON.stringify({before:last.created_at,beforeId:last.id})]),[]);
    await db.query('update auth.sessions set not_after=now()-interval \'1 minute\' where id=$1',[actor]);
    await assert.rejects(rpc('archive_list_audit',[actor,actor,'{}']),/access denied/);
    await db.exec('set role anon');await assert.rejects(db.query('select public.archive_list_audit($1,$1)',[actor]),/permission denied/);await db.exec('reset role');
    await db.exec('set role anon');await assert.rejects(db.query("select public.archive_work('claim')"),/permission denied/);await db.exec('reset role');
  }finally{await db.close();}
});
