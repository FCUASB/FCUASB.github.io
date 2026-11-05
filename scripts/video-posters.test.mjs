import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('poster upgrade preserves old uploads, capabilities, ten slots and takedown access',async()=>{
 const db=new PGlite();
 const read=async name=>readFile(new URL('../supabase/setup/'+name+'.sql',import.meta.url),'utf8');
 try{
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);');
  await db.exec(await read('foundation'));
  const intake=(await read('intake-api')).split('\n').filter(line=>!line.startsWith('alter table archive_private.attachments add column poster_')).join('\n').replace(",'posterReady',a.poster_ready",'');
  let media=(await read('media-api')).replaceAll(",'posterReady',a.poster_ready",'').replace(",'posterSize',a.poster_size_bytes",'');
  const start=media.indexOf("  if p_action in ('poster_ticket'");
  media=media.slice(0,start)+media.slice(media.indexOf("  if p_action='complete' then",start));
  await db.exec(intake);await db.exec(media);
  const key='2d469018-366a-4822-a06a-0a25fc13699d',other='6bb3c1cd-2eb8-4c53-8d8e-9282ad4f6164';
  const record={idempotency_key:key,display_name:'Synthetic',body:'Synthetic',uploads:Array.from({length:10},()=>({filename:'synthetic.mp4',mime_type:'video/mp4',size_bytes:100,width:400,height:300}))};
  const call=async(name,args=[])=>{
   await db.exec('set role service_role');
   try{return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args)).rows[0].result;}
   finally{await db.exec('reset role');}
  };
  const receipt=await call('archive_receive_memory',[record]);
  await db.exec(await read('video-posters'));await db.exec(await read('video-posters'));
  const uploads=await call('archive_upload_action',[key,receipt.id,'list',null,null]),id=uploads[0].id;
  assert.equal(uploads.length,10);assert.equal(uploads[0].posterReady,false);
  const upload=(action,size=null,mime=null,cap=key)=>call('archive_upload_action',[cap,id,action,size,mime]);
  await assert.rejects(upload('poster_ticket',100),/poster not eligible/);
  await upload('complete',100,'video/mp4');
  await assert.rejects(upload('poster_ticket',100,null,other),/not found/);
  for(const size of [0,262145])await assert.rejects(upload('poster_ticket',size),/invalid poster size/);
  const ticket=await upload('poster_ticket',100);
  assert.match(ticket.path,/\.poster\.jpg$/);assert.equal(ticket.mimeType,'image/jpeg');
  await assert.rejects(upload('poster_ticket',101),/poster size conflict/);
  await assert.rejects(upload('poster_complete',99,'image/jpeg'),/poster metadata mismatch/);
  await assert.rejects(upload('poster_complete',100,'video/mp4'),/poster metadata mismatch/);
  await upload('poster_complete',100,'image/jpeg');
  assert.equal((await upload('poster_ticket',100)).ready,true);
  assert.equal((await call('archive_public_media',[id])).posterReady,true);
  assert.equal((await call('archive_list_memories'))[0].attachments[0].posterReady,true);
  assert.equal((await db.query('select count(*)::int as n from archive_private.attachments')).rows[0].n,10);
  assert.deepEqual(await call('archive_receive_memory',[record]),receipt);
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select public.archive_upload_action($1,$2,$3,100,null)',[key,id,'poster_ticket']),/permission denied/);
   await db.exec('reset role');
  }
  await db.query('update archive_private.submissions set deleted_at=now() where id=$1',[receipt.id]);
  assert.equal(await call('archive_public_media',[id]),null);
  await assert.rejects(upload('poster_ticket',100),/not found/);
 }finally{await db.close();}
});
