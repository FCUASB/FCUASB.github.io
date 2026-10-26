import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validateCatalogDocument } from '../shared/catalog.mjs';
import { createCatalogHandler } from '../supabase/functions/catalog/handler.mjs';
const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');
const source = JSON.parse(await read('handoff-v1.1/工程檔/content.json'));
const actor = '53f43393-2d36-4a93-9814-7a047a32ee97';

test('all 25 originals preserve every field and reject unsafe or ambiguous replacements', () => {
  assert.equal(source.memories.length, 25);
  for (const memory of source.memories) assert.deepEqual(validateCatalogDocument('memory', memory), memory);
  const memory = source.memories[0];
  for (const bad of [{source:'javascript:alert(1)'},{type:'text',story:''},{y:null,m:2},{type:'photo',asset:'../../secret'},{youtube:'bad'}])
    assert.throws(() => validateCatalogDocument('memory', {...memory,...bad}));
});

test('release carries only the managed ID manifest, never a static copy of the old memory bodies',async()=>{
  const html=await read('index.html');
  const archive=JSON.parse(html.match(/const ARCHIVE=(.*);\nconst ASSETS=/)[1]);
  assert.deepEqual(archive.memories,[]);
  assert.deepEqual(archive.memoryIds,source.memories.map(m=>m.id));
  assert.equal(html.includes(source.memories[0].story),false);
});

test('delta imports exactly, preserves edits/deletions on retry and enforces the existing live roles', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
    for (const file of ['foundation','intake-api','admin-api','catalog-api']) await db.exec(await read('supabase/setup/'+file+'.sql'));
    const delta = await read('supabase/deploy/existing-memories.sql');
    await db.exec(delta);
    const originals=(await db.query("select document from archive_private.catalog_entries where kind='memory' order by entry_id")).rows.map(r=>r.document);
    assert.deepEqual(originals, [...source.memories].sort((a,b)=>String(a.id).localeCompare(String(b.id))));
    assert.equal((await db.query('select count(*)::int n from archive_private.submissions')).rows[0].n,0);
    await db.query('insert into auth.users values($1)',[actor]);
    await db.query('insert into auth.sessions values($1,$1,null)',[actor]);
    await db.query("insert into archive_private.admin_members(user_id,role)values($1,'content_admin')",[actor]);
    const call=async(action,input)=>{await db.exec('set role service_role');try{return(await db.query('select public.archive_catalog_action($1,$1,$2,$3::jsonb) result',[actor,action,JSON.stringify(input)])).rows[0].result;}finally{await db.exec('reset role');}};
    const publicRead=async()=>{await db.exec('set role service_role');try{return(await db.query('select public.archive_catalog_public() result')).rows[0].result;}finally{await db.exec('reset role');}};
    const original=source.memories[0],id=String(original.id),edited={...original,story:'Synthetic edit'};
    await call('save',{kind:'memory',id,revision:1,document:edited});
    await assert.rejects(call('save',{kind:'memory',id,revision:1,document:original}),/edit conflict/);
    await call('visibility',{kind:'memory',id,revision:2,deleted:true});
    await db.exec(delta);
    const rows=await call('list',{kind:'memory'}),record=rows.find(r=>r.entry_id===id);
    assert.equal(record.document.story,'Synthetic edit');assert.ok(record.deleted_at);assert.equal(record.revision,3);
    let published=await publicRead();assert.equal(published.memories.length,24);assert.ok(published.managedMemoryIds.includes(original.id));
    assert.equal((await call('history',{kind:'memory',id})).length,3);
    await call('visibility',{kind:'memory',id,revision:3,deleted:false});
    published=await publicRead();assert.equal(published.memories.length,25);
    await db.query("update archive_private.admin_members set role='data_curator' where user_id=$1",[actor]);
    assert.equal((await call('list',{kind:'memory'})).length,25);
    await assert.rejects(call('visibility',{kind:'memory',id,revision:4,deleted:true}),/access denied/);
    await assert.rejects(call('save',{kind:'memory',id,revision:4,document:original}),/access denied/);
    await db.query('delete from auth.sessions');await assert.rejects(call('list',{kind:'memory'}),/access denied/);
    for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.archive_catalog_public()'),/permission denied/);await assert.rejects(db.query('select * from archive_private.catalog_entries'),/permission denied/);await db.exec('reset role');}
  } finally { await db.close(); }
});

test('memory API validates identity, document ID and soft deletion before RPC', async () => {
  let reached=0;
  const handler=createCatalogHandler({origins:['https://dalu.tw'],enabled:true,consumeRate:async()=>true,authenticate:async token=>token==='valid'?{id:actor,sessionId:actor}:null,readPublic:async()=>({}),execute:async()=>{reached++;return {};}});
  const request=(token,action,input)=>new Request('https://example.test/catalog',{method:'POST',headers:{origin:'https://dalu.tw',authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action,input})});
  const input={kind:'memory',id:String(source.memories[0].id),revision:1,document:source.memories[0]};
  assert.equal((await handler(request('bad','save',input))).status,401);
  assert.equal((await handler(request('valid','save',{...input,id:'99'}))).status,400);
  assert.equal((await handler(request('valid','save',input))).status,200);
  assert.equal((await handler(request('valid','visibility',{...input,deleted:true}))).status,200);
  assert.equal(reached,2);
});

test('front page follows managed deletions, preserves local/cloud records and fails closed on incomplete imports', async () => {
  let result={schemaVersion:1,biography:{biography:'Synthetic',biographyMore:'',career:[]},concerts:[],memories:[source.memories[0]],managedMemoryIds:source.memories.map(m=>m.id)};
  let closes=0,renders=0;
  const context=vm.createContext({URL,AbortSignal,validateCatalogDocument,fetch:async()=>Response.json({result}),console,
    CLOUD_CONFIG:{catalogEnabled:true,existingMemoriesEnabled:true,catalogEndpoint:'https://example.test/catalog'},
    ARCHIVE:{memories:source.memories},ASSETS:{},CON:[],J:{view:'list'},MEM:[{id:7,local:true},{id:8,cloud:true}],ltId:source.memories[0].id,
    lt:{open:true,close(){closes++;}},storageState:{albumIds:[]},mem:{order:null},
    document:{querySelectorAll:()=>[],body:{classList:{remove(){}}}},$:()=>({}),renderCareer(){},refreshConcerts(){},showList(){},showConcert(){},toast(){},renderMem(){renders++;},buildWall(){},drawLight(){}
  });
  vm.runInContext(await read('handoff-v1.1/工程檔/catalog-client.js')+';this.client=ProjectCatalog;',context);
  await context.client.refresh();assert.equal(context.MEM.length,3);assert.equal(context.MEM[2].managed,true);
  await context.client.refresh();assert.equal(renders,1);
  result={...result,memories:[]};await context.client.refresh();assert.equal(context.MEM.length,2);assert.equal(closes,1);
  result={...result,memories:[source.memories[0]],managedMemoryIds:[]};await context.client.refresh();assert.equal(context.MEM.length,2);
});
