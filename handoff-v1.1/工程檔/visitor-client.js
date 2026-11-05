/* Visitor concerts, supplements and reports go to the cloud; nothing is stored in or read from IndexedDB. */
const ProjectVisitor=(()=>{
 let challengeScript,supplements=[];
 const enabled=()=>CLOUD_CONFIG.visitorEnabled===true&&!!CLOUD_CONFIG.visitorEndpoint&&!!CLOUD_CONFIG.turnstileSiteKey;
 const notReady='目前尚未開放這項功能，內容尚未送出，請稍後再試。';
 async function request(body){
  let response;try{response=await fetch(CLOUD_CONFIG.visitorEndpoint,{method:'POST',credentials:'omit',redirect:'error',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)})}catch{throw new Error('目前無法連線到網站，請確認網路後再試；填寫內容仍保留。')}
  let data={};try{data=await response.json()}catch{}
  if(!response.ok){const messages={CHALLENGE_FAILED:'驗證已失效，請重新完成驗證後再送出。',RATE_LIMITED:'目前送出的人較多，請稍後再試；填寫內容仍保留。',VISITOR_NOT_READY:notReady,INVALID_INPUT:'內容格式不符，請檢查日期、必填欄位與長度。',CONSENT_REQUIRED:'請先勾選同意。',INVALID_CHANGE:'目前已達新增上限或內容不符，請聯絡網站管理員。',NOT_FOUND:'這場音樂會已不存在，請回到音樂足跡重新選擇。',PAYLOAD_TOO_LARGE:'內容太長，請縮短後再送出。',INVALID_IDEMPOTENCY_KEY:'收件識別資料錯誤，請重新開啟表單。'};throw new Error(messages[data.error]||'未確認收件成功，內容仍保留，請稍後重試。')}
  return data;
 }
 function fields(publicNote){return enabled()?`<div class="row"><div data-challenge></div></div><p class="upload-note">${publicNote}</p>`:`<p class="form-error" role="alert">${notReady}</p>`}
 async function attach(form){
  if(!enabled())return;
  const mount=form.querySelector('[data-challenge]');if(!mount)return;
  try{
   if(!window.turnstile){challengeScript??=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=resolve;s.onerror=reject;document.head.append(s)});await challengeScript}
   if(form._media?.disposed)return;
   form._challenge=window.turnstile.render(mount,{sitekey:CLOUD_CONFIG.turnstileSiteKey,size:'compact',action:'visitor-submit',callback:token=>{form._challengeToken=token},'expired-callback':()=>{form._challengeToken=''},'error-callback':()=>{form._challengeToken=''}});
  }catch{formError(form,'無法載入驗證，請確認網路後重新開啟表單。')}
 }
 function resetChallenge(form){form._challengeToken='';if(form._challenge!=null&&window.turnstile)window.turnstile.reset(form._challenge)}
const checkDate=value=>{const ok=/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(value)&&Number(value.slice(0,4))>=1977&&Number(value.slice(0,4))<=3000&&(value.length<10||new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);if(!ok)throw new Error('請填寫 1977 年起的年份、年月或完整日期，例如 2008、2008-05、2008-05-18。');return value};
 const rowsOf=rows=>rows.map(({zh,orig,composer,arr})=>({zh,orig,composer,arr}));
 async function submit(form,type,fields){
  if(!enabled())throw new Error(notReady);
  if(!form._challengeToken)throw new Error('請先完成驗證。');
  const consent=!!form.querySelector('input[type=checkbox][required]')?.checked;
  const payload={...fields,consent};
  const fingerprint=JSON.stringify([type,payload]);if(form._visitorFingerprint!==fingerprint){form._visitorKey=crypto.randomUUID();form._visitorFingerprint=fingerprint}
  let receipt;try{receipt=await request({type,payload:{...payload,idempotencyKey:form._visitorKey},challengeToken:form._challengeToken})}finally{resetChallenge(form)}
  if(type!=='report'){try{await ProjectCatalog.refresh()}catch{}}
  if(type==='concert')return {cloud:true,title:'音樂會已公開',message:'已加入音樂足跡，標示為「親友新增，尚未核對」，之後會由管理員協助核對。收件編號：'+receipt.id+'。',kind:'concert',id:Number(receipt.id)};
  if(type==='supplement')return {cloud:true,title:'補充已公開',message:'已顯示在這場音樂會的「親友補充」，不會改動原有紀錄。',kind:'concert',id:Number(fields.concertId)};
  return {cloud:true,title:'回報已送出',message:'這份回報只會送給網站管理員，不會公開顯示。',kind:'report'};
 }
 function load(list){
  if(list==null){const changed=supplements.length>0;supplements=[];return changed}
  if(!Array.isArray(list)||list.length>500)throw Error();
  const next=list.map(s=>{
   if(!s||typeof s.id!=='string'||!/^[1-9]\d{0,15}$/.test(String(s.concertId))||typeof s.name!=='string'||!s.body||typeof s.body.text!=='string'||!Array.isArray(s.body.rows||[]))throw Error();
   return {id:s.id,concertId:Number(s.concertId),name:s.name,text:s.body.text,rows:(s.body.rows||[]).map(r=>({zh:String(r.zh||''),orig:String(r.orig||''),composer:String(r.composer||''),arr:String(r.arr||'')})),createdAt:Date.parse(s.createdAt)||0};
  });
  const changed=JSON.stringify(next)!==JSON.stringify(supplements);supplements=next;return changed;
 }
 const supplementsFor=id=>supplements.filter(s=>s.concertId===id);
 return {enabled,fields,attach,submit,rowsOf,checkDate,load,supplementsFor};
})();
