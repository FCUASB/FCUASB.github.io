import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../handoff-v1.1/工程檔/home-cloud.js',import.meta.url),'utf8');
function page(){
 const current={id:1000000000000000,cloud:true,story:'before'},local={id:1,local:true};
 const status={textContent:''},button={},events={};let config;
 const context=vm.createContext({MEM:[current,local],ltId:current.id,lt:{open:true,close(){this.open=false}},
  storageState:{albumIds:[current.id,local.id]},document:{hidden:false,addEventListener(name,fn){events[name]=fn}},
  addEventListener(name,fn){events[name]=fn},location:{hash:''},toast(){},route(){},drawLight(){context.draws++},draws:0,
  $:selector=>selector==='#cloud-sync-status'?status:button,
  ProjectCloud:{enabled:()=>true,refresh:async()=>{}},
  createAcceptanceSync(options){config=options;return {refresh:options.read,stop(){}}}});
 vm.runInContext(source+';this.start=startHomepageCloud',context);
 return {context,status,button,events,get config(){return config}};
}
test('a removed cloud memory closes its open album without deleting browser records',async()=>{
 const p=page();p.context.ProjectCloud.refresh=async()=>{p.context.MEM.splice(0,1)};
 await p.context.start();assert.equal(p.context.lt.open,false);
 assert.equal(p.context.MEM[0].local,true);assert.equal(p.context.storageState.albumIds.length,1);
});
test('unchanged polls keep the open player; edited posts redraw and failed sync is explicit',async()=>{
 const p=page();await p.context.start();assert.equal(p.context.draws,0);
 p.context.ProjectCloud.refresh=async()=>{p.context.MEM[0]={...p.context.MEM[0],story:'edited'}};
 await p.config.read();assert.equal(p.context.draws,1);
 p.config.notify({state:'failed',lastSuccess:null});assert.match(p.status.textContent,/可能是舊資料/);
 p.context.document.hidden=true;assert.equal(p.config.active(),false);
});
