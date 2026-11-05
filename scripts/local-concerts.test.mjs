import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../handoff-v1.1/工程檔/local-concerts.js',import.meta.url),'utf8');
const interaction=await readFile(new URL('../handoff-v1.1/工程檔/base-interaction.js',import.meta.url),'utf8');
const publicRow={zh:'公開曲目',orig:'Public work',composer:'Original',arr:''};
const concert={id:1,title:'公開場次',date:'2000-06-01',year:2000,ens:'公開團體',place:'公開地點',cond:'指揮',story:'公開介紹',rows:[publicRow],source:'https://example.test/source',asset:'portrait'};
const privateRow={zh:'私人補充',orig:'Private work',composer:'Private',arr:'',local:true};
const plain=value=>JSON.parse(JSON.stringify(value));
function page(){
 const writes=[],revoked=[];
 const context=vm.createContext({ARCHIVE:{concerts:[structuredClone(concert)]},CON:[],ASSETS:{portrait:{url:'public-image'},'lu-portrait':{url:'fallback'}},
  workKey:r=>(r.orig||r.zh)+'|'+r.composer,
  hydrateMedia:items=>(items||[]).map(a=>({...a,url:a.blob?'blob:private':a.url})),
  hydrateConcert:r=>({...r,local:true,poster:'private-image'}),releaseURL:url=>revoked.push(url),
  persistableConcert:r=>structuredClone(r),fmtDate:date=>date,console,Date,
  newId:()=>500,formValue:(form,id)=>form[id]||'',rawMedia:form=>form.media||[],collectRows:form=>form.rows||[],
  saveRecord:async(name,record)=>writes.push({name,record}),refreshConcerts(){},
 });
 vm.runInContext(source+';this.local=ProjectLocalConcerts;this.parseDate=localConcertDate;'+interaction.slice(interaction.indexOf('function saveConcertRecord('),interaction.indexOf('function syncModalState('))+';this.submit=submitLocal;',context);
 return {context,writes,revoked,get concerts(){return context.CON;}};
}

test('legacy supplements retain private additions while public edits, removal and restoration take effect',()=>{
 const p=page(),legacy={...structuredClone(concert),local:true,rows:[publicRow,privateRow],media:[{blob:'photo',name:'私人照片'}],notes:[{author:'測試者',text:'私人文字'}],updatedAt:1};
 const original=structuredClone(legacy);
 p.context.local.load([legacy]);
 const edited={...concert,title:'最新公開標題',date:'2001',year:2001,rows:[{...publicRow,composer:'Corrected'}]};
 p.context.local.publish([edited]);
 let current=p.concerts[0];assert.equal(current.title,edited.title);assert.equal(current.date,'2001');
 assert.equal(current.rows.length,1);assert.equal(current.rows[0].composer,'Corrected');
 assert.equal(current.personalRows[0].orig,privateRow.orig);assert.equal(current.personalMedia[0].url,'blob:private');
 p.context.local.publish([]);current=p.concerts[0];
 assert.equal(current.unavailable,true);assert.equal(current.rows.length,0);assert.equal(current.source,undefined);assert.equal(current.asset,undefined);
 assert.equal(current.personalNotes[0].text,'私人文字');assert.notEqual(current.title,concert.title);
 assert.throws(()=>p.context.local.prepareSupplement(current,{rows:[],media:[],notes:[]}),/停止公開/);
 p.context.local.publish([edited]);assert.equal(p.concerts[0].unavailable,undefined);assert.equal(p.concerts[0].title,edited.title);
 const saved=p.context.local.prepareSupplement(p.concerts[0],{rows:[privateRow],media:[],notes:[]});
 assert.equal(saved.recordType,'concert-supplement');assert.equal(saved.title,undefined);assert.equal(saved.rows.length,1);
 assert.deepEqual(plain(saved.legacySnapshot),original);assert.deepEqual(legacy,original);
 p.context.local.load([legacy],[saved]);p.context.local.publish([{...edited,title:'再修訂'}]);assert.equal(p.concerts[0].title,'再修訂');
 assert.equal(p.concerts[0].personalMedia.length,1);assert.equal(p.concerts[0].personalNotes.length,1);
});

test('supplement submit saves only private data and repeat reads never duplicate it',async()=>{
 const p=page();p.context.local.load([]);p.context.local.publish([concert]);
 const form={'ct-s':'私人文字','ct-n':'測試者',rows:[privateRow],media:[{blob:'photo'}]};
 await p.context.submit(form,'contrib',1);
 const saved=p.writes[0].record;
 assert.equal(p.writes[0].name,'settings');assert.equal(saved.id,'concert-supplement:1');
 assert.equal(saved.recordType,'concert-supplement');assert.equal(saved.title,undefined);assert.equal(saved.source,undefined);
 assert.equal(saved.rows.length,1);assert.equal(p.concerts[0].local,undefined);
 for(let i=0;i<3;i++)p.context.local.publish([{...concert,title:'更新公開場次'}]);
 assert.equal(p.concerts[0].title,'更新公開場次');assert.equal(p.concerts[0].personalRows.length,1);
 assert.equal(p.concerts[0].personalMedia.length,1);assert.equal(p.concerts[0].personalNotes.length,1);
 const reloaded=page();reloaded.context.local.load([],[{...saved,id:saved.concertId}]);reloaded.context.local.publish([concert]);
 assert.equal(reloaded.concerts[0].personalRows.length,1);assert.equal(reloaded.concerts[0].rows.length,1);
});

test('new and legacy locally created concerts remain private and editable across catalog reads',async()=>{
 const p=page(),local={...concert,id:500,source:undefined,asset:undefined,createdAt:123,local:true,rows:[],media:[],notes:[]};
 p.context.local.load([local]);p.context.local.publish([]);
 assert.equal(p.concerts.length,1);assert.equal(p.concerts[0].local,true);assert.equal(p.concerts[0].unavailable,undefined);
 await p.context.submit({'ct-s':'私人的補充',rows:[privateRow]},'contrib',500);
 assert.equal(p.writes[0].record.recordType,'local-concert');assert.equal(p.concerts[0].rows.length,1);
 p.context.local.publish([concert]);assert.equal(p.concerts.find(c=>c.id===500).notes[0].text,'私人的補充');
});

test('visitor submissions persist partial dates and uncertainty without inventing a day',async()=>{
 for(const date of ['2008','2008-05','2008-05-18']){
  const p=page();p.context.local.load([]);
  await p.context.submit({'ac-d':date,'ac-date-note':'可能是暑假','ac-t':'本機測試場次',rows:[]},'concert');
  const saved=p.writes[0].record;
  assert.equal(saved.date,date);assert.equal(saved.year,2008);assert.equal(saved.status,'date-pending');
  assert.match(saved.dateLabel,/可能是暑假/);assert.equal(saved.sourceNote,'可能是暑假');
  p.context.local.publish([]);assert.equal(p.concerts[0].date,date);
 }
 const p=page();assert.equal(p.context.parseDate('2008').status,'date-pending');
 assert.equal(p.context.parseDate('2008-05-18').status,undefined);
 assert.equal(p.context.parseDate('2000-02-29').date,'2000-02-29');
 for(const date of ['','1976','3001','2008-00','2008-13','2008-2','2008-02-30','2001-02-29','2008-05-00']){
  await assert.rejects(p.context.submit({'ac-d':date},'concert'),/年份、年月或完整日期/);
 }
 assert.equal(p.writes.length,0);
});
