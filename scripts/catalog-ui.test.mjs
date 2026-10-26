import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCatalog } from '../admin/src/catalog.js';
class Node {
  constructor(tag='div'){this.tagName=tag;this.textContent='';this.value='';this.children=[];this.hidden=false;this.open=false;}
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
  const ui=mountCatalog({api,getRole:()=>role,enabled:true,notice:text=>{notice=text;},task(fn){lastTask=Promise.resolve().then(fn).catch(error=>{notice=error.message;});return lastTask;}});
  const all=node=>[node,...node.children.flatMap(all)];
  return {ui,get,all,notice:()=>notice,settled:()=>lastTask,restore(){globalThis.document=previous;}};
}
const record={kind:'concert',entry_id:'1',revision:1,document:{id:1,title:'Synthetic',date:'2000',year:2000,ens:'',place:'',cond:'',story:'',source:'https://example.test/source',rows:[]}};
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
