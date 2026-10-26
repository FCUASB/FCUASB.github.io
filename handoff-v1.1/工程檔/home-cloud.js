/* New submissions use the cloud. Existing browser records stay local. */
async function startHomepageCloud(){
 if(!ProjectCloud.enabled())return;
 const status=$('#cloud-sync-status');
 const sync=createAcceptanceSync({active:()=>!document.hidden,read:async()=>{
  const previous=MEM.find(m=>m.id===ltId&&m.cloud);
  await Promise.all([ProjectCloud.refresh(),...(typeof ProjectCatalog==='undefined'?[]:[ProjectCatalog.refresh()])]);
  storageState.albumIds=storageState.albumIds.filter(id=>MEM.some(m=>m.id===id));
  if(previous&&lt.open){const current=MEM.find(m=>m.id===previous.id);if(!current){lt.close();toast('這則投稿已下架。')}else if(JSON.stringify(previous)!==JSON.stringify(current))drawLight()}
 },notify:({state,lastSuccess})=>{
  const time=lastSuccess?new Date(lastSuccess).toLocaleTimeString('zh-TW'):'尚無';
  status.textContent=state==='failed'?`暫時無法同步，畫面可能是舊資料。上次成功：${time}。`:state==='loading'?`正在同步親友投稿；上次成功：${time}。`:`親友投稿最後同步：${time}。每 10 秒更新。`;
 }});
 $('#cloud-refresh').onclick=()=>void sync.refresh();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void sync.refresh()});
 addEventListener('focus',()=>void sync.refresh());
 addEventListener('pagehide',event=>{if(!event.persisted)sync.stop()});
 await sync.refresh();
 if(location.hash.startsWith('#m-'))route();
}
