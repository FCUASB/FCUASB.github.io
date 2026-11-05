import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCatalog } from '../admin/src/catalog.js';
class Node {
  constructor(tag='div'){this.tagName=tag;this.textContent='';this.value='';this.children=[];this.hidden=false;this.open=false;this.style={};}
  append(...nodes){this.children.push(...nodes);for(const node of nodes)node.parent=this;}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  setAttribute(){} addEventListener(){} showModal(){this.open=true;} close(){this.open=false;}
  remove(){this.parent.children=this.parent.children.filter(node=>node!==this);}
}
function setup(api,role='system_admin'){
  const previous=globalThis.document,elements=new Map();let lastTask,notice='';
  const get=id=>{if(!elements.has(id))elements.set(id,new Node());return elements.get(id);};
  globalThis.document={getElementById:get,createElement:tag=>new Node(tag)};
  get('concert-filter').value='all';
  get('memory-filter').value='all';
  const ui=mountCatalog({api,getRole:()=>role,enabled:true,notice:text=>{notice=text;},task(fn){lastTask=Promise.resolve().then(fn).catch(error=>{notice=error.message;});return lastTask;}});
  const all=node=>[node,...node.children.flatMap(all)];
  return {ui,get,all,notice:()=>notice,settled:()=>lastTask,restore(){globalThis.document=previous;}};
}
const record={kind:'concert',entry_id:'1',revision:1,document:{id:1,title:'Synthetic',date:'2000',year:2000,ens:'',place:'',cond:'',story:'',source:'https://example.test/source',rows:[]}};

test('existing memory editor preserves original provenance and collection order while saving edits',async()=>{
 const original={id:11,n:'Synthetic title',story:'Synthetic text',type:'photo',asset:'lu-portrait',y:null,m:null,source:'https://example.test/source',sourceNote:'署名待核對；非網站投稿',createdAt:100};
 const memory={kind:'memory',entry_id:'11',revision:1,document:original};let saved;
 const p=setup(async(action,input)=>{if(action==='catalog.save'){saved=input;return{};}return[memory];});try{
  await p.get('section-memory').onclick();
  assert.match(p.get('memory-count').textContent,/1 筆/);
  await p.all(p.get('memory-results')).find(n=>n.textContent==='編輯').onclick();
  const form=p.get('catalog-edit-form'),story=p.all(form).find(n=>n.tagName==='label'&&n.textContent==='回憶文字').children[0];story.value='Synthetic edited';
  form.onsubmit({preventDefault(){}});await p.settled();
  assert.deepEqual(saved.document,{...original,story:'Synthetic edited',place:'',sourceName:''});
  assert.equal(saved.kind,'memory');assert.equal(saved.revision,1);
 }finally{p.restore();}
});

test('data curator can read existing memories and export but cannot edit or change visibility',async()=>{
 const p=setup(async()=>[{kind:'memory',entry_id:'11',revision:1,document:{id:11,n:'Synthetic',story:'Synthetic',type:'text'}}],'data_curator');try{
  await p.get('section-memory').onclick();
  assert.deepEqual(p.all(p.get('memory-results')).filter(n=>n.tagName==='button').map(n=>n.textContent),['版本紀錄']);
  assert.equal(p.get('memory-export').hidden,false);
  p.ui.clear();assert.equal(p.get('memory-results').children.length,0);
 }finally{p.restore();}
});
test('leaving the account clears the catalog and rejects a late list response',async()=>{
 let resolve;const p=setup(()=>new Promise(done=>{resolve=done;}));try{
  const pending=p.get('section-concert').onclick();await Promise.resolve();p.ui.clear();resolve([record]);await pending;
  assert.equal(p.get('concert-results').children.length,0);assert.equal(p.get('catalog-edit-form').children.length,0);
 }finally{p.restore();}
});
test('data curator sees the catalog and history controls without editing controls',async()=>{
 const p=setup(async()=>[record],'data_curator');try{
  await p.get('section-concert').onclick();
  assert.equal(p.get('concert-new').hidden,true);
  const labels=p.all(p.get('concert-results')).filter(n=>n.tagName==='button').map(n=>n.textContent);
  assert.deepEqual(labels,['版本紀錄']);
 }finally{p.restore();}
});
test('a save conflict keeps the editor and entered text, with an error inside the dialog',async()=>{
 const p=setup(async action=>{if(action==='catalog.list')return[record];throw Error('資料已被其他人修改');});try{
  await p.get('section-concert').onclick();
  await p.all(p.get('concert-results')).find(n=>n.textContent==='編輯').onclick();
  const form=p.get('catalog-edit-form'),title=p.all(form).find(n=>n.tagName==='label'&&n.textContent==='音樂會名稱').children[0];
  title.value='Synthetic edited';form.onsubmit({preventDefault(){}});await p.settled();
  assert.equal(p.get('catalog-edit-dialog').open,true);assert.equal(title.value,'Synthetic edited');
  assert.match(p.all(form).find(n=>n.className==='catalog-error').textContent,/已被其他人修改/);
 }finally{p.restore();}
});

test('automatic catalog reads update the active section and preserve unchanged nodes and draft filters',async()=>{
 let records=[record];const p=setup(async()=>structuredClone(records));try{
  await p.get('section-concert').onclick();const original=p.get('concert-results').children[0];
  await p.ui.refresh();assert.equal(p.get('concert-results').children[0],original);
  p.get('concert-query').value='unsubmitted draft';records=[{...record,revision:2,document:{...record.document,title:'Updated by another administrator'}}];
  await p.ui.refresh();assert.match(p.all(p.get('concert-results')).map(n=>n.textContent).join(' '),/Updated by another administrator/);
  assert.equal(p.get('concert-query').value,'unsubmitted draft');
  await p.get('concert-search').onsubmit({preventDefault(){}});assert.match(p.all(p.get('concert-results')).map(n=>n.textContent).join(' '),/沒有符合/);
 }finally{p.restore();}
});

test('a background catalog response cannot redraw an editor opened during the read',async()=>{
 let deliver;let loading=false;const p=setup(()=>loading?new Promise(resolve=>{deliver=resolve;}):Promise.resolve([record]));try{
  await p.get('section-concert').onclick();loading=true;const pending=p.ui.refresh();
  await p.all(p.get('concert-results')).find(n=>n.textContent==='編輯').onclick();
  const form=p.get('catalog-edit-form'),title=p.all(form).find(n=>n.tagName==='label'&&n.textContent==='音樂會名稱').children[0];title.value='Draft';
  deliver([{...record,revision:2,document:{...record.document,title:'External edit'}}]);assert.equal(await pending,false);
  assert.equal(p.get('catalog-edit-dialog').open,true);assert.equal(title.value,'Draft');
 }finally{p.restore();}
});

test('visitor supplements can be hidden and restored; reports show contact only to allowed roles and can be resolved',async()=>{
 const supplement={id:'11111111-1111-4111-8111-111111111111',kind:'supplement',target_kind:'concert',target_id:'5',display_name:'親友',body:{text:'補充內容',rows:[{zh:'曲名',composer:'作曲'}]},hidden_at:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'};
 const report={id:'22222222-2222-4222-8222-222222222222',kind:'report',target_kind:'site',target_id:'general',display_name:'訪客',body:{type:'資料錯誤',detail:'說明',contact:'a@b.c'},hidden_at:null,resolved_at:null,created_at:'2026-11-05T00:00:00Z'};
 const calls=[];
 const api=async(action,input)=>{calls.push([action,input]);if(action==='catalog.visitor_list')return input.kind==='report'?[report]:[supplement];return {};};
 const p=setup(api);try{
  await p.get('section-supplement').onclick();
  assert.match(p.get('supplement-count').textContent,/1 筆/);
  assert.ok(p.all(p.get('supplement-results')).some(n=>/補充內容/.test(n.textContent)));
  await p.all(p.get('supplement-results')).find(n=>n.textContent==='隱藏').onclick();
  assert.deepEqual(calls.find(c=>c[0]==='catalog.visitor_hide'),['catalog.visitor_hide',{id:supplement.id}]);
  await p.get('section-report').onclick();
  assert.match(p.get('report-count').textContent,/1 筆待處理/);
  assert.ok(p.all(p.get('report-results')).some(n=>/a@b\.c/.test(n.textContent)));
  await p.all(p.get('report-results')).find(n=>n.textContent==='標記已處理').onclick();
  assert.deepEqual(calls.find(c=>c[0]==='catalog.visitor_resolve'),['catalog.visitor_resolve',{id:report.id}]);
 }finally{p.restore();}
 const viewer=setup(api,'data_curator');try{
  await viewer.get('section-report').onclick();
  assert.ok(viewer.all(viewer.get('report-results')).some(n=>/a@b\.c/.test(n.textContent)));
  assert.equal(viewer.all(viewer.get('report-results')).some(n=>n.textContent==='標記已處理'),false);
 }finally{viewer.restore();}
 const outsider=setup(api,'content_admin');try{
  await outsider.get('section-report').onclick();
  assert.equal(outsider.all(outsider.get('report-results')).some(n=>/a@b\.c/.test(n.textContent)),false);
 }finally{outsider.restore();}
});
