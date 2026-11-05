/* Private browser additions stay separate from the current public catalog. */
const ProjectLocalConcerts=(()=>{
 const records=new Map(),hydrated=new Map(),seedIds=new Set(ARCHIVE.concerts.map(c=>c.id));
 let published=ARCHIVE.concerts;
 const isSupplement=r=>r.recordType==='concert-supplement'||r.recordType!=='local-concert'&&(seedIds.has(r.id)||!!r.source||!!r.sourceNote||!r.createdAt&&!!r.updatedAt);
 function supplement(record){
  if(record?.recordType==='concert-supplement')return record;
  return {id:record?.id,recordType:'concert-supplement',targetDate:record?.date,
   rows:(record?.rows||[]).filter(r=>r.local),media:record?.media||[],notes:record?.notes||[],
   ...(record?{legacySnapshot:record}:{})};
 }
 function mergeRows(previous,added){
  const rows=previous.map(r=>({...r}));
  for(const row of added){const index=rows.findIndex(r=>workKey(r)===workKey(row));
   if(index<0)rows.push({...row});
   else{const old=rows[index];rows[index]={...old,...row,zh:old.zh||row.zh,orig:old.orig||row.orig,composer:old.composer||row.composer,arr:old.arr||row.arr,note:[old.note,row.note].filter(Boolean).join('；')};}
  }
  return rows;
 }
 function remember(record){
  const old=hydrated.get(record.id);
  for(const item of old?.media||[]){releaseURL(item.url);releaseURL(item.poster);}
  records.set(record.id,record);hydrated.delete(record.id);
 }
 function rebuild(){
  const next=new Map(published.map(c=>[c.id,{...c,catalogManaged:true,poster:ASSETS[c.asset]?.url||ASSETS['lu-portrait'].url,rows:c.rows.map((r,i)=>({...r,no:i+1}))}]));
  for(const record of records.values()){
   const personal=isSupplement(record),data=personal?supplement(record):record;
   if(!hydrated.has(record.id))hydrated.set(record.id,personal?{...data,media:hydrateMedia(data.media)}:hydrateConcert(data));
   const local=hydrated.get(record.id);
   if(!personal){next.set(record.id,{...local});continue;}
   const current=next.get(record.id),date=data.targetDate||'';
   next.set(record.id,{...(current||{id:record.id,title:'已停止公開的音樂會｜我的本機補充',date,year:date?Number(date.slice(0,4)):null,place:'',ens:'',cond:'',story:'',rows:[],status:'unavailable',catalogManaged:true,unavailable:true,poster:ASSETS['lu-portrait'].url,imageLabel:'呂彥慶指揮資料照（非該場演出照片）'}),
    hasLocalSupplement:true,personalRows:local.rows,personalMedia:local.media,personalNotes:local.notes});
  }
  CON.splice(0,CON.length,...next.values());
 }
 function prepareSupplement(existing,{rows,media,notes}){
  if(existing.unavailable)throw Error('這場音樂會已停止公開，填寫內容仍保留在此表單。');
  const previous=records.get(existing.id);
  const base=existing.local&&!existing.catalogManaged?persistableConcert(existing):supplement(previous);
  return {...base,id:existing.id,...(existing.catalogManaged||!existing.local?{recordType:'concert-supplement',targetDate:existing.date}:{recordType:'local-concert'}),
   rows:mergeRows(base.rows||[],rows),media:[...(base.media||[]),...media],notes:[...(base.notes||[]),...notes],updatedAt:Date.now()};
 }
 return {
  load(items,supplements=[]){for(const record of [...items,...supplements])remember(record);rebuild();},
  publish(items){published=items;rebuild();},
  saved(record){remember(record);rebuild();},
  prepareSupplement
 };
})();

function localConcertDate(date,note=''){
 if(!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(date)||Number(date.slice(0,4))<1977||Number(date.slice(0,4))>3000||date.length===10&&new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('請填寫 1977 年起的年份、年月或完整日期，例如 2008、2008-05、2008-05-18。');
 const partial=date.length<10;
 return {date,year:Number(date.slice(0,4)),...(partial||note?{status:'date-pending',dateLabel:fmtDate(date)+'（'+(note||'演出日期待核對')+'）',sourceNote:note}:{})};
}
