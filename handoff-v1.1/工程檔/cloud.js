/* New cloud submissions only. Never reads or migrates IndexedDB records. */
const ProjectCloud=(()=>{
 let challengeScript,refreshVersion=0,recordsFingerprint;
 const enabled=()=>CLOUD_CONFIG.enabled===true;
 async function request(endpoint,body){
  const response=await fetch(endpoint,{method:body?'POST':'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok){const messages={CHALLENGE_FAILED:'驗證已失效，請重新完成驗證後再送出。',RATE_LIMITED:'目前投稿較多，請稍後再試；填寫內容仍保留。',FILE_TOO_LARGE:'附件超過目前雲端單檔限制，請改貼 YouTube 連結或移除該附件。',INVALID_IDEMPOTENCY_KEY:'收件識別資料錯誤，請重新開啟表單。',INTAKE_NOT_READY:'雲端收件尚未啟用，內容尚未送出。'};throw new Error(messages[data.error]||'未確認雲端收件成功，內容仍保留，請稍後重試。')}
  return data;
 }
 function youtubeId(url){if(!url)return '';try{const u=new URL(url);if(u.protocol!=='https:')throw Error();let id;if(u.hostname==='youtu.be')id=u.pathname.slice(1);else if(['www.youtube.com','youtube.com','m.youtube.com'].includes(u.hostname))id=u.pathname==='/watch'?u.searchParams.get('v'):u.pathname.split('/')[1]==='shorts'?u.pathname.split('/')[2]:null;if(!/^[A-Za-z0-9_-]{11}$/.test(id||''))throw Error();return id}catch{throw new Error('請填入有效的 HTTPS YouTube 影片連結。')}}
 function fields(){return enabled()?`<div class="row"><label for="up-youtube">YouTube 影片連結 <small>選填，長影片建議使用連結</small></label><input id="up-youtube" type="url" inputmode="url" placeholder="https://www.youtube.com/watch?v=..."></div><div class="two"><div class="row"><label for="up-email">Email <small>選填，不公開</small></label><input id="up-email" type="email" autocomplete="email" maxlength="254"></div><div class="row"><label for="up-phone">電話 <small>選填，不公開</small></label><input id="up-phone" type="tel" autocomplete="tel" maxlength="80"></div></div>${consent('up-consent')}<p class="hint">送出後文字會立即公開；附件另行上傳，失敗時文字仍保留。聯絡資料僅供獲授權的校友團人員聯繫。</p><div data-challenge></div>`:''}
 async function attach(form){
  if(!enabled())return;
  const mount=form.querySelector('[data-challenge]');if(!mount)return;
  try{
   if(!CLOUD_CONFIG.turnstileSiteKey)throw Error();
   if(!window.turnstile){challengeScript??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=resolve;s.onerror=reject;document.head.append(s)});await challengeScript}
   if(form._media?.disposed)return;
   form._challenge=window.turnstile.render(mount,{sitekey:CLOUD_CONFIG.turnstileSiteKey,action:'memory-submit',callback:token=>{form._challengeToken=token},'expired-callback':()=>{form._challengeToken=''},'error-callback':()=>{form._challengeToken=''}});
  }catch{formError(form,'無法載入投稿驗證，請確認網路後重新開啟表單。')}
 }
 function resetChallenge(form){form._challengeToken='';if(form._challenge!=null&&window.turnstile)window.turnstile.reset(form._challenge)}
 function dispose(form){if(form?._challenge!=null&&window.turnstile)window.turnstile.remove(form._challenge)}
 function hydrate(record){
  if(!record||!Number.isSafeInteger(record.displayId)||record.displayId<1000000000000000||typeof record.name!=='string'||typeof record.body!=='string')throw new Error('雲端資料格式錯誤。');
  const attachments=Array.isArray(record.attachments)?record.attachments:[];
  const media=attachments.filter(a=>a.status==='ready').map(a=>a.source==='youtube'?{id:a.id,type:'video',youtube:a.youtubeId,url:'https://i.ytimg.com/vi/'+encodeURIComponent(a.youtubeId)+'/hqdefault.jpg',w:400,h:300}:{id:a.id,type:a.mimeType?.startsWith('video/')?'video':'photo',url:CLOUD_CONFIG.mediaEndpoint+'/'+encodeURIComponent(a.id),w:a.width||400,h:a.height||300});
  const youtube=media[0]?.youtube;
  return {id:record.displayId,cloudId:record.id,cloud:true,local:false,sample:false,n:record.name,story:record.body,y:record.year,m:record.context?.month,place:record.context?.place||'',rel:record.context?.relationship||'',createdAt:Date.parse(record.createdAt),media,type:media[0]?.type||(youtube?'video':'text'),youtube,src:media[0]?.url||(youtube?'https://i.ytimg.com/vi/'+encodeURIComponent(youtube)+'/hqdefault.jpg':''),w:media[0]?.w||400,h:media[0]?.h||300,pendingAttachments:attachments.filter(a=>!['ready','failed'].includes(a.status)).length};
 }
 async function refresh(){
  if(!enabled())return;
  const current=++refreshVersion;
  const records=[];let next=null;const seen=new Set();do{const query=next?'?'+new URLSearchParams(next):'';const page=await request(CLOUD_CONFIG.intakeEndpoint+query);if(!Array.isArray(page.records))throw Error('無法讀取雲端列表。');records.push(...page.records);next=page.next;if(next){const cursor=JSON.stringify(next);if(seen.has(cursor))throw Error('雲端列表分頁錯誤。');seen.add(cursor)}}while(next);
  if(current!==refreshVersion)return;
  const fingerprint=JSON.stringify(records);if(fingerprint===recordsFingerprint)return;
  const hydrated=records.map(hydrate);recordsFingerprint=fingerprint;for(let i=MEM.length-1;i>=0;i--)if(MEM[i].cloud)MEM.splice(i,1);
  MEM.push(...hydrated);mem.order=null;renderMem();buildWall(true);
 }
 function fileMime(item){const file=item.original||item.blob;if(file.type)return file.type;const ext=item.name.split('.').pop().toLowerCase();return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'})[ext]||''}
 async function submit(form){
  const value=id=>formValue(form,id),items=form._media.items;
  if(!form._challengeToken)throw new Error('請先完成投稿驗證。');
  const data={name:value('up-name'),body:value('up-story'),year:value('up-y')?Number(value('up-y')):null,month:$('#up-mo',form).selectedIndex||null,place:value('up-pl'),relationship:value('up-rel'),email:value('up-email'),phone:value('up-phone'),youtubeId:youtubeId(value('up-youtube')),consent:!!$('#up-consent',form)?.checked,
   uploads:items.map(item=>({name:item.name,mimeType:fileMime(item),size:(item.original||item.blob).size,width:item.w,height:item.h}))};
  if(data.uploads.length+(data.youtubeId?1:0)>10)throw new Error('照片、影片與 YouTube 連結合計最多 10 個附件。');
  const fingerprint=JSON.stringify(data);if(form._cloudFingerprint!==fingerprint){form._cloudKey=crypto.randomUUID();form._cloudFingerprint=fingerprint}
  let receipt;try{receipt=await request(CLOUD_CONFIG.intakeEndpoint,{...data,idempotencyKey:form._cloudKey,challengeToken:form._challengeToken})}finally{resetChallenge(form)}
  form._cloudReceipt=receipt.id;
  let failures=0;
  try{
   const {attachments}=await request(CLOUD_CONFIG.mediaEndpoint,{action:'list',id:receipt.id,key:form._cloudKey});
   if(!Array.isArray(attachments)||attachments.length!==items.length)throw Error();
   for(let index=0;index<items.length;index++){
    const attachment=attachments[index],item=items[index];if(attachment.status==='ready')continue;if(['FILE_TOO_LARGE','UNSUPPORTED_FORMAT','EMPTY_FILE'].includes(attachment.errorCode)){failures++;continue}
    $('[data-file-status]',form).textContent='文字已收件；正在上傳附件 '+(index+1)+'／'+items.length+'……';
    try{
     const {url}=await request(CLOUD_CONFIG.mediaEndpoint,{action:'ticket',id:attachment.id,key:form._cloudKey});
     if(new URL(url).origin!==new URL(CLOUD_CONFIG.intakeEndpoint).origin)throw Error();
     const uploaded=await fetch(url,{method:'PUT',body:item.original||item.blob,headers:{'Content-Type':fileMime(item),'x-upsert':'false'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(180000)});
     if(!uploaded.ok)throw Error();
     await request(CLOUD_CONFIG.mediaEndpoint,{action:'complete',id:attachment.id,key:form._cloudKey});
    }catch{failures++;try{await request(CLOUD_CONFIG.mediaEndpoint,{action:'fail',id:attachment.id,key:form._cloudKey})}catch{}}
   }
  }catch{failures=items.length}
  let listUpdated=true;try{await refresh()}catch{listUpdated=false}
  const record=MEM.find(m=>m.cloudId===receipt.id);
  return {cloud:true,title:failures?'文字已收到，部分附件未收到':'投稿已收到',message:'收件編號：'+receipt.id+'。'+(failures?failures+' 個附件未完成上傳；如有填寫聯絡資料，管理員可後續聯繫。':'內容已保存在網站雲端，Drive 歸檔會另行處理。')+(listUpdated?'':'目前無法更新列表，請稍後重新整理。'),kind:record?'memory':'report',id:record?.id};
 }
 async function prepareFile(file,type){if(type!=='photo')return {blob:file,w:400,h:300};const url=objectURL(file);try{return await new Promise(resolve=>{const image=new Image();const timer=setTimeout(()=>resolve({blob:file,w:400,h:300}),10000);image.onload=()=>{clearTimeout(timer);resolve({blob:file,w:image.naturalWidth||400,h:image.naturalHeight||300})};image.onerror=()=>{clearTimeout(timer);resolve({blob:file,w:400,h:300})};image.src=url})}finally{releaseURL(url)}}
 return {enabled,fields,attach,dispose,refresh,submit,prepareFile};
})();
