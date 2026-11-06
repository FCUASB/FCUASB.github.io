/* New submissions use the cloud. Existing browser records stay local. */
async function startHomepageCloud(){
 if(!ProjectCloud.enabled())return;
 const status=$('#cloud-sync-status');
 const sync=createAcceptanceSync({read:async()=>{
  const previousMemories=new Map(MEM.filter(m=>m.cloud).map(m=>[m.id,m]));
  const results=await Promise.allSettled([ProjectCloud.refresh(),...(typeof ProjectCatalog==='undefined'?[]:[ProjectCatalog.refresh()])]);
  ProjectPresentation.sync(results[0].status==='fulfilled');
  storageState.albumIds=storageState.albumIds.filter(id=>MEM.some(m=>m.id===id));
  const previous=previousMemories.get(ltId);
  if(previous&&lt.open){const current=MEM.find(m=>m.id===ltId);if(!current){lt.close();toast('這則投稿已下架。')}else if(JSON.stringify(previous)!==JSON.stringify(current))drawLight()}
  const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
 },notify:({state,lastSuccess})=>{
  const time=lastSuccess?new Date(lastSuccess).toLocaleTimeString('zh-TW'):'尚無';
  status.textContent=state==='failed'?`暫時無法同步，畫面可能是舊資料，稍後自動重試。上次成功：${time}。`:state==='loading'?`正在同步親友投稿；上次成功：${time}。`:`親友投稿最後同步：${time}。每 10 秒自動更新，也可按「重新讀取投稿」。`;
 }});
 let timer,paused=false,initialMemoryHash=location.hash.startsWith('#m-')?location.hash:null;
 function schedule(){clearTimeout(timer);if(!paused&&!document.hidden)timer=setTimeout(()=>void refresh(),10000)}
 async function refresh(){
  clearTimeout(timer);
  if(paused||document.hidden)return;
  try{
   await sync.refresh();
   if(initialMemoryHash){
    if(location.hash!==initialMemoryHash)initialMemoryHash=null;
    else if(!paused&&!document.hidden&&MEM.some(m=>m.id===Number(initialMemoryHash.slice(3)))){initialMemoryHash=null;if(!lt.open)route()}
   }
  }finally{schedule()}
 }
 $('#cloud-refresh').onclick=refresh;
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else void refresh()});
 addEventListener('focus',()=>void refresh());
 addEventListener('pagehide',event=>{paused=true;clearTimeout(timer);if(!event.persisted)sync.stop()});
 addEventListener('pageshow',event=>{if(event.persisted){paused=false;void refresh()}});
 await refresh();
}
