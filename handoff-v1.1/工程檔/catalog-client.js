/* Public catalog only; no credentials or local content are sent. */
const ProjectCatalog=(()=>{
 let fingerprint,loaded=false,version=0;
 const status=message=>document.querySelectorAll('[data-catalog-status]').forEach(node=>{node.textContent=message});
 async function refresh(){
  if(!CLOUD_CONFIG.catalogEnabled)return;
  const currentVersion=++version;
  try{
   const response=await fetch(CLOUD_CONFIG.catalogEndpoint,{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
   if(!response.ok)throw Error();
   const {result}=await response.json();
   if(result?.schemaVersion!==1||!Array.isArray(result.concerts)||result.concerts.length>500||!result.biography)throw Error();
   const biography=validateCatalogDocument('biography',result.biography),concerts=result.concerts.map(c=>validateCatalogDocument('concert',c));
   if(new Set(concerts.map(c=>c.id)).size!==concerts.length)throw Error();
   if(currentVersion!==version)return;
   const next=JSON.stringify(result);
   if(next!==fingerprint){
    const viewed=J.view==='concert'?CON.find(c=>c.id===J.id):null;
    const locals=CON.filter(c=>c.local),localIds=new Set(locals.map(c=>c.id));
    const hydrated=concerts.filter(c=>!localIds.has(c.id)).map(c=>({...c,poster:ASSETS[c.asset]?.url||ASSETS['lu-portrait'].url,rows:c.rows.map((r,i)=>({...r,no:i+1}))}));
    CON.splice(0,CON.length,...hydrated,...locals);
    ARCHIVE.biography=biography.biography;ARCHIVE.biographyMore=biography.biographyMore;ARCHIVE.career=biography.career;
    $('#catalog-biography').textContent=biography.biography;$('#catalog-biography-more').textContent=biography.biographyMore;
    renderCareer();refreshConcerts();
    if(viewed&&!viewed.local){const current=CON.find(c=>c.id===viewed.id);if(!current){showList();toast('這場音樂會已下架。')}else if(JSON.stringify(current)!==JSON.stringify(viewed))showConcert(current.id)}
    fingerprint=next;
   }
   loaded=true;document.body.classList.remove('catalog-pending');
   status('音樂會與大呂生平最後同步：'+new Date().toLocaleTimeString('zh-TW')+'。');
  }catch{
   if(currentVersion!==version)return;
   status(loaded?'音樂會與生平同步失敗，目前可能是舊資料，請稍後重試。':'暫時無法載入音樂會與大呂生平，請稍後重新整理。');
  }
 }
 return {refresh};
})();
