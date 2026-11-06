import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createAcceptanceSync } from '../acceptance/src/sync.mjs';
const source=await readFile(new URL('../handoff-v1.1/工程檔/home-cloud.js',import.meta.url),'utf8');
function page(){
 const current={id:1000000000000000,cloud:true,story:'before'},local={id:1,local:true};
 const status={textContent:''},button={},events={},timers=new Map();let config,timerId=0;
 const context=vm.createContext({MEM:[current,local],ltId:current.id,lt:{open:true,close(){this.open=false}},
  storageState:{albumIds:[current.id,local.id]},document:{hidden:false,addEventListener(name,fn){events[name]=fn}},
  addEventListener(name,fn){events[name]=fn},location:{hash:''},toast(){},route(){context.routes++},routes:0,drawLight(){context.draws++},draws:0,
  $:selector=>selector==='#cloud-sync-status'?status:button,
  ProjectCloud:{enabled:()=>true,refresh:async()=>{}},
  ProjectPresentation:{sync(){}},
  setTimeout(fn,delay){assert.equal(delay,10000);timers.set(++timerId,fn);return timerId},
  clearTimeout(id){timers.delete(id)},
  createAcceptanceSync(options){config=options;return createAcceptanceSync(options)}});
 vm.runInContext(source+';this.start=startHomepageCloud',context);
 return {context,status,button,events,timers,get config(){return config},
  async idle(){await new Promise(resolve=>setImmediate(resolve))},
  async tick(){assert.equal(timers.size,1);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await this.idle()}};
}
test('a removed cloud memory closes its open album without deleting browser records',async()=>{
 const p=page();p.context.ProjectCloud.refresh=async()=>{p.context.MEM.splice(0,1)};
 await p.context.start();assert.equal(p.context.lt.open,false);
 assert.equal(p.context.MEM[0].local,true);assert.equal(p.context.storageState.albumIds.length,1);
});
test('unchanged reads keep the open player; edited posts redraw and failed sync is explicit',async()=>{
 const p=page();await p.context.start();assert.equal(p.context.draws,0);
 p.context.ProjectCloud.refresh=async()=>{p.context.MEM[0]={...p.context.MEM[0],story:'edited'}};
 await p.config.read();assert.equal(p.context.draws,1);
 p.config.notify({state:'failed',lastSuccess:null});assert.match(p.status.textContent,/可能是舊資料/);
});

test('a slow refresh reconciles the album visible on completion instead of the album open at its start',async()=>{
 for(const change of ['removed-first','removed-second','edited-second']){
  const p=page(),second={id:1000000000000001,cloud:true,story:'second'};
  p.context.MEM.push(second);await p.context.start();
  let finish;p.context.ProjectCloud.refresh=()=>new Promise(resolve=>{finish=()=>{
   if(change==='removed-first')p.context.MEM.splice(0,1);
   else if(change==='removed-second')p.context.MEM.splice(p.context.MEM.indexOf(second),1);
   else p.context.MEM[p.context.MEM.indexOf(second)]={...second,story:'edited'};
   resolve();
  }});
  const pending=p.button.onclick();await p.idle();p.context.ltId=second.id;finish();await pending;
  assert.equal(p.context.lt.open,change!=='removed-second',change);
  assert.equal(p.context.draws,change==='edited-second'?1:0,change);
 }
});

test('homepage reads memories and concerts on load, every ten seconds and on manual refresh',async()=>{
 const p=page();let reads=0,catalogReads=0;
 p.context.ProjectCloud.refresh=async()=>{reads++};
 p.context.ProjectCatalog={refresh:async()=>{catalogReads++}};
 await p.context.start();assert.equal(reads,1);assert.equal(catalogReads,1);
 await p.tick();assert.equal(reads,2);assert.equal(catalogReads,2);
 await p.button.onclick();
 assert.equal(reads,3);assert.equal(catalogReads,3);assert.equal(p.timers.size,1);
 assert.match(p.status.textContent,/每 10 秒自動更新/);
});

test('hidden pages stop polling and visibility or focus refreshes both lists',async()=>{
 const p=page();let reads=0,catalogReads=0;
 p.context.ProjectCloud.refresh=async()=>{reads++};p.context.ProjectCatalog={refresh:async()=>{catalogReads++}};
 await p.context.start();p.context.document.hidden=true;p.events.visibilitychange();
 assert.equal(p.timers.size,0);p.events.focus();await p.idle();assert.equal(reads,1);
 p.context.document.hidden=false;p.events.visibilitychange();await p.idle();
 assert.equal(reads,2);assert.equal(catalogReads,2);
 p.events.focus();await p.idle();assert.equal(reads,3);assert.equal(catalogReads,3);assert.equal(p.timers.size,1);
});

test('a shared memory link opens once after a hidden or failed initial read recovers',async()=>{
 for(const hidden of [false,true]){
  const p=page(),memory=p.context.MEM[0];p.context.MEM=[];p.context.lt.open=false;
  p.context.location.hash='#m-'+memory.id;p.context.document.hidden=hidden;
  p.context.ProjectCloud.refresh=async()=>{throw Error('offline')};
  await p.context.start();assert.equal(p.context.routes,0);
  p.context.ProjectCloud.refresh=async()=>{p.context.MEM=[memory]};
  p.context.document.hidden=false;p.events.focus();await p.idle();assert.equal(p.context.routes,1);
  await p.tick();assert.equal(p.context.routes,1);
 }
});

test('a delayed shared link never replaces a newer navigation or an already open album',async()=>{
 for(const navigate of [false,true]){
  const p=page();p.context.location.hash='#m-'+p.context.MEM[0].id;
  let finish;p.context.ProjectCloud.refresh=()=>new Promise(resolve=>{finish=resolve});
  const pending=p.context.start();await p.idle();
  if(navigate){p.context.location.hash='#journey';p.context.lt.open=false}
  finish();await pending;assert.equal(p.context.routes,0);
 }
});

test('slow catalog reads finish before retry even when memories fail, with no overlapping refreshes',async()=>{
 const p=page();await p.context.start();let finish,reads=0,catalogReads=0;
 p.context.ProjectCloud.refresh=async()=>{reads++;throw Error('offline')};
 p.context.ProjectCatalog={refresh:()=>{catalogReads++;return new Promise(resolve=>{finish=resolve})}};
 const pending=p.button.onclick();await p.idle();p.events.focus();await p.idle();
 assert.equal(reads,1);assert.equal(catalogReads,1);assert.equal(p.timers.size,0);
 finish();await pending;await p.idle();assert.equal(p.timers.size,1);assert.match(p.status.textContent,/舊資料.*自動重試/);
 p.context.ProjectCloud.refresh=async()=>{reads++};p.context.ProjectCatalog.refresh=async()=>{catalogReads++};
 await p.tick();assert.equal(reads,2);assert.equal(catalogReads,2);assert.match(p.status.textContent,/每 10 秒/);
});

test('leaving cancels timers and late reads cannot restart polling; cached pages resume on return',async()=>{
 for(const persisted of [false,true]){
  const p=page();await p.context.start();let finish,reads=0;
  p.context.ProjectCloud.refresh=()=>{reads++;return new Promise(resolve=>{finish=resolve})};
  const pending=p.button.onclick();await p.idle();p.events.pagehide({persisted});finish();await pending;
  assert.equal(p.timers.size,0);p.events.focus();await p.idle();assert.equal(reads,1);
  if(persisted){p.context.ProjectCloud.refresh=async()=>{reads++};p.events.pageshow({persisted:true});await p.idle();assert.equal(reads,2);assert.equal(p.timers.size,1)}
 }
});
