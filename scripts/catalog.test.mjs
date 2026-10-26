import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { validateCatalogDocument } from '../shared/catalog.mjs';
import { createCatalogHandler } from '../supabase/functions/catalog/handler.mjs';
const id='53f43393-2d36-4a93-9814-7a047a32ee97';
const concert={id:1,title:'Synthetic',date:'2000-01-01',year:2000,ens:'',place:'',cond:'',story:'',rows:[],source:'https://example.test/source'};
const biography={biography:'Synthetic',biographyMore:'',career:[]};
test('all existing source material is valid; unsafe sources and impossible dates are rejected',async()=>{
 const source=JSON.parse(await readFile(new URL('../handoff-v1.1/工程檔/content.json',import.meta.url),'utf8'));
 for(const c of source.concerts)assert.deepEqual(validateCatalogDocument('concert',c),c);
 assert.throws(()=>validateCatalogDocument('concert',{...concert,source:'javascript:alert(1)'}));
 assert.throws(()=>validateCatalogDocument('concert',{...concert,date:'2000-02-31'}));
 assert.throws(()=>validateCatalogDocument('concert',{...concert,year:2001}));
});
test('catalog boundary requires verified identity and strips caller role/actor overrides',async()=>{
 let reached=0;
 const handler=createCatalogHandler({origins:['https://dalu.tw'],enabled:true,consumeRate:async()=>true,authenticate:async token=>token==='valid'?{id,sessionId:id}:null,
  readPublic:async()=>({schemaVersion:1,biography,concerts:[]}),execute:async(identity,action,input)=>{reached++;assert.equal(identity.id,id);assert.deepEqual(input,{kind:'concert',id:'1',revision:0,document:concert});return {};}});
 const request=(token,input)=>new Request('https://example.test/catalog',{method:'POST',headers:{origin:'https://dalu.tw',authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action:'save',input})});
 assert.equal((await handler(request('bad',{kind:'concert'}))).status,401);
 assert.equal((await handler(request('valid',{kind:'concert',id:'1',revision:0,document:{...concert,source:'javascript:x'}}))).status,400);
 assert.equal((await handler(request('valid',{kind:'concert',id:'1',revision:0,document:concert,actor:'attacker',role:'system_admin'}))).status,200);assert.equal(reached,1);
 assert.equal((await handler(new Request('https://example.test/catalog',{headers:{origin:'https://attacker.test'}}))).status,403);
});
test('Postgres catalog enforces roles, live sessions, revisions, soft-delete and version history',async()=>{
 const db=new PGlite();try{
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
  for(const file of ['foundation.sql','intake-api.sql','admin-api.sql','catalog-api.sql'])await db.exec(await readFile(new URL('../supabase/setup/'+file,import.meta.url),'utf8'));
  await db.query('insert into auth.users values($1)',[id]);await db.query('insert into auth.sessions values($1,$1,null)',[id]);await db.query("insert into archive_private.admin_members(user_id,role)values($1,'content_admin')",[id]);
  const call=async(action,input)=>{await db.exec('set role service_role');try{return(await db.query('select public.archive_catalog_action($1,$1,$2,$3::jsonb) as result',[id,action,JSON.stringify(input)])).rows[0].result;}finally{await db.exec('reset role');}};
  const publicRead=async()=>{await db.exec('set role service_role');try{return(await db.query('select public.archive_catalog_public() as result')).rows[0].result;}finally{await db.exec('reset role');}};
  await call('save',{kind:'biography',id:'main',revision:0,document:biography});
  const saved=await call('save',{kind:'concert',id:'1',revision:0,document:concert});assert.equal(saved.revision,1);
  await assert.rejects(call('save',{kind:'concert',id:'1',revision:0,document:concert}),/edit conflict/);
  await call('visibility',{kind:'concert',id:'1',revision:1,deleted:true});assert.equal((await publicRead()).concerts.length,0);
  assert.equal((await call('list',{kind:'concert'}))[0].deleted_at!=null,true);
  assert.equal((await call('history',{kind:'concert',id:'1'})).length,2);
  await assert.rejects(call('visibility',{kind:'biography',id:'main',revision:1,deleted:true}),/invalid state/);
  await db.query("update archive_private.admin_members set role='data_curator' where user_id=$1",[id]);
  assert.equal((await call('list',{kind:'concert'})).length,1);
  await assert.rejects(call('save',{kind:'concert',id:'1',revision:2,document:concert}),/access denied/);
  await db.query('delete from auth.sessions where id=$1',[id]);await assert.rejects(call('list',{kind:'concert'}),/access denied/);
  for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select public.archive_catalog_public()'),/permission denied/);await assert.rejects(db.query('select * from archive_private.catalog_entries'),/permission denied/);await db.exec('reset role');}
 }finally{await db.close();}
});
