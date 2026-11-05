import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { validateCatalogDocument } from '../shared/catalog.mjs';
const source=await readFile(new URL('../handoff-v1.1/工程檔/visitor-client.js',import.meta.url),'utf8')+await readFile(new URL('../handoff-v1.1/工程檔/catalog-client.js',import.meta.url),'utf8');
const concert={id:1,title:'Synthetic',date:'2000',year:2000,ens:'',place:'',cond:'',story:'',rows:[],source:'https://example.test/source',asset:'lu-portrait'};
const catalog={schemaVersion:1,biography:{biography:'Synthetic biography',biographyMore:'',career:[]},concerts:[concert]};
function page(fetch){
 const status={textContent:''},intro={textContent:''};let renders=0,closed=0,shown=0;
 const context=vm.createContext({fetch,AbortSignal,validateCatalogDocument,console,URL,
  CLOUD_CONFIG:{catalogEnabled:true,catalogEndpoint:'https://example.test/catalog'},
  J:{view:'concert',id:1},CON:[{...concert,poster:'test',rows:[]}],ASSETS:{'lu-portrait':{url:'test'}},ARCHIVE:{},
  document:{querySelectorAll:()=>[status],body:{classList:{remove(){}}}},$:()=>intro,
  renderCareer(){renders++},refreshConcerts(){renders++},showList(){closed++},showConcert(){shown++},toast(){}
 });
 vm.runInContext(source+';this.catalogClient=ProjectCatalog;this.ProjectVisitor=ProjectVisitor;',context);
 return {context,status,intro,renders:()=>renders,closed:()=>closed,shown:()=>shown};
}
test('published catalog updates biography and soft-deletes a viewed concert',async()=>{
 let result=catalog;const p=page(async()=>Response.json({result}));
 await p.context.catalogClient.refresh();assert.equal(p.intro.textContent,''); // last field is biographyMore
 assert.equal(p.context.ARCHIVE.biography,'Synthetic biography');assert.equal(p.context.CON.length,1);
 const firstRenders=p.renders();await p.context.catalogClient.refresh();assert.equal(p.renders(),firstRenders);
 result={...catalog,concerts:[]};await p.context.catalogClient.refresh();assert.equal(p.closed(),1);assert.equal(p.context.CON.length,0);
});
test('unsafe or failed public catalog never replaces the last validated content',async()=>{
 let result=catalog;const p=page(async()=>Response.json({result}));await p.context.catalogClient.refresh();
 result={...catalog,concerts:[{...concert,source:'javascript:alert(1)'}]};await p.context.catalogClient.refresh();
 assert.equal(p.context.CON[0].source,'https://example.test/source');assert.match(p.status.textContent,/可能是舊資料/);
});
test('a late older catalog response cannot restore a deleted concert',async()=>{
 const pending=[],p=page(()=>new Promise(resolve=>pending.push(resolve)));
 const older=p.context.catalogClient.refresh(),newer=p.context.catalogClient.refresh();
 pending[1](Response.json({result:{...catalog,concerts:[]}}));await newer;
 pending[0](Response.json({result:catalog}));await older;
 assert.equal(p.context.CON.some(c=>c.id===1),false);
});
test('public supplements are validated, shown per concert and redraw a viewed concert only when they change',async()=>{
 const supplement={id:'a1',concertId:'1',name:'親友',body:{text:'補充',rows:[{zh:'曲名'}]},createdAt:'2026-11-05T00:00:00Z'};
 let result={...catalog,supplements:[supplement]};const p=page(async()=>Response.json({result}));
 await p.context.catalogClient.refresh();
 const list=p.context.ProjectVisitor.supplementsFor(1);assert.equal(list.length,1);assert.equal(list[0].text,'補充');assert.equal(list[0].rows[0].zh,'曲名');assert.equal(p.context.ProjectVisitor.supplementsFor(2).length,0);
 const shown=p.shown();await p.context.catalogClient.refresh();assert.equal(p.shown(),shown);
 result={...catalog,supplements:[supplement,{...supplement,id:'a2',body:{text:'第二則',rows:[]}}]};await p.context.catalogClient.refresh();
 assert.equal(p.shown(),shown+1);assert.equal(p.context.ProjectVisitor.supplementsFor(1).length,2);
 result={...catalog,supplements:[{...supplement,concertId:'abc'}]};await p.context.catalogClient.refresh();
 assert.match(p.status.textContent,/可能是舊資料/);assert.equal(p.context.ProjectVisitor.supplementsFor(1).length,2);
 result={...catalog};await p.context.catalogClient.refresh();assert.equal(p.context.ProjectVisitor.supplementsFor(1).length,0);
});
