// Generated from the shared cloud client and acceptance/src/app.js.
/* New cloud submissions only. Never reads or migrates IndexedDB records. */
const ProjectCloud=(()=>{
 let challengeScript;
 const enabled=()=>CLOUD_CONFIG.enabled===true;
 async function request(endpoint,body){
  const response=await fetch(endpoint,{method:body?'POST':'GET',credentials:'omit',redirect:'error',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
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
  const records=[];let next=null;const seen=new Set();do{const query=next?'?'+new URLSearchParams(next):'';const page=await request(CLOUD_CONFIG.intakeEndpoint+query);if(!Array.isArray(page.records))throw Error('無法讀取雲端列表。');records.push(...page.records);next=page.next;if(next){const cursor=JSON.stringify(next);if(seen.has(cursor))throw Error('雲端列表分頁錯誤。');seen.add(cursor)}}while(next);
  const hydrated=records.map(hydrate);for(let i=MEM.length-1;i>=0;i--)if(MEM[i].cloud)MEM.splice(i,1);
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

// Bundled after the same cloud client used by the main website. No IndexedDB access.
let CLOUD_CONFIG;
const acceptedOrigin = location.origin === 'https://dalu.tw';
const MEM = [], mem = {};
const $ = (selector, root = document) => root.querySelector(selector);
const formValue = (form, id) => form.querySelector('#' + id)?.value.trim() || '';
const objectURL = blob => URL.createObjectURL(blob);
const releaseURL = url => URL.revokeObjectURL(url);
const buildWall = () => {};
const formError = (form, message) => { $('#form-error', form).textContent = message; };
const form = $('#f-up');
form._media = { items: [], disposed: false };
function node(tag, text) { const result = document.createElement(tag); if (text != null) result.textContent = text; return result; }
function renderMem() {
  const root = $('#records'); root.replaceChildren();
  for (const record of MEM.filter(record => record.n.startsWith('驗收'))) {
    const card = node('article');
    card.append(node('h3', record.n), node('p', record.story), node('code', record.cloudId));
    if (record.pendingAttachments) card.append(node('p', `${record.pendingAttachments} 個附件尚在處理`));
    for (const media of record.media) {
      if (media.youtube) { const link = node('a', '開啟 YouTube 測試影片'); link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(media.youtube); link.target = '_blank'; link.rel = 'noopener'; card.append(link); }
      else { const asset = node(media.type === 'video' ? 'video' : 'img'); asset.src = media.url; if (media.type === 'video') { asset.controls = true; asset.preload = 'metadata'; } else { asset.alt = '測試附件'; asset.loading = 'lazy'; } card.append(asset); }
    }
    root.append(card);
  }
  if (!root.children.length) root.append(node('p', '尚未讀到驗收投稿。'));
}
async function run(action) { try { await action(); } catch (error) { $('#status').textContent = error.message || '操作未完成。'; } }
async function start() {
  CLOUD_CONFIG = await (await fetch('./config.json', { cache: 'no-store' })).json();
  for (const endpoint of ['intakeEndpoint', 'mediaEndpoint']) if (new URL(CLOUD_CONFIG[endpoint]).origin !== 'https://rikgchswpjaxlnhdrxtw.supabase.co') throw Error('驗收設定的專案不符。');
  // The shared client expects an optional month select; it is not part of this test form.
  const month = node('select'); month.id = 'up-mo'; month.hidden = true; month.append(node('option', '未填')); form.append(month);
  $('#submission-fields').disabled = !ProjectCloud.enabled() || !acceptedOrigin;
  $('#status').textContent = !acceptedOrigin ? '請於正式 HTTPS 網址 https://dalu.tw/acceptance/ 驗收；本機預覽不會送件。' : ProjectCloud.enabled() ? '驗收頁已啟用；須通過實際收件與跨瀏覽器核對才能判定成功。' : '尚未啟用雲端驗收；目前不會送出資料。可先檢查端點。';
  $('#probe').onclick = () => run(async () => {
    const result = await fetch(CLOUD_CONFIG.intakeEndpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
    $('#status').textContent = `收件端點 HTTP ${result.status}。` + (result.status === 401 ? '平台仍要求 JWT，匿名投稿尚不可用。' : result.status === 503 ? '後端尚未啟用。' : '此結果只代表端點回應，仍須送出測試。');
  });
  $('#refresh').onclick = () => run(async () => { if (!acceptedOrigin || !ProjectCloud.enabled()) throw Error('請先發布並開啟 https://dalu.tw/acceptance/ 驗收。'); await ProjectCloud.refresh(); $('#status').textContent = '已重新讀取雲端；請核對收件編號。'; });
  $('#up-files').onchange = () => run(async () => {
    const files = [...$('#up-files').files]; form._media.items = []; $('#files').replaceChildren(); if (files.length > 10) throw Error('最多選擇 10 個附件。');
    const items = []; $('#send').disabled = true; $('#new-test').disabled = true; $('#up-files').disabled = true;
    try { for (const file of files) items.push({ name: file.name, original: file, type: file.type.startsWith('image/') ? 'photo' : 'video', ...await ProjectCloud.prepareFile(file, file.type.startsWith('image/') ? 'photo' : 'video') }); }
    finally { $('#send').disabled = false; $('#new-test').disabled = false; $('#up-files').disabled = false; }
    form._media.items = items; $('#files').replaceChildren(...items.map(item => node('li', `${item.name} · ${item.original.size} bytes`)));
  });
  $('#new-test').onclick = () => { form.reset(); form._media.items = []; form._cloudFingerprint = null; form._cloudKey = null; $('#files').replaceChildren(); $('#receipt').textContent = ''; ProjectCloud.dispose(form); run(() => ProjectCloud.attach(form)); };
  form.onsubmit = event => { event.preventDefault(); run(async () => {
    if (!acceptedOrigin || !ProjectCloud.enabled()) throw Error('請先發布並開啟正式 HTTPS 驗收頁。');
    if (!formValue(form, 'up-name').startsWith('驗收')) throw Error('測試署名請以「驗收」開頭，方便後續辨識。');
    if (!formValue(form, 'up-story') && !formValue(form, 'up-youtube') && !form._media.items.length) throw Error('請填寫文字或選擇附件。');
    $('#submission-fields').disabled = true; $('#form-error').textContent = '';
    try { const result = await ProjectCloud.submit(form); $('#receipt').textContent = result.title + '\n' + result.message; }
    finally { $('#submission-fields').disabled = false; }
  }); };
  if (acceptedOrigin && ProjectCloud.enabled()) { await ProjectCloud.attach(form); await ProjectCloud.refresh(); }
}
run(start);
