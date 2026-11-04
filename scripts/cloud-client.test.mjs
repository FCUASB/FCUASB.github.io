import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../handoff-v1.1/工程檔/cloud.js', import.meta.url), 'utf8');
const interactions = await readFile(new URL('../handoff-v1.1/工程檔/base-interaction.js', import.meta.url), 'utf8');
const fileSource = interactions.slice(interactions.indexOf('function fileType('), interactions.indexOf('function collectRows('));
const id='6bb3c1cd-2eb8-4c53-8d8e-9282ad4f6164';
const record={id,displayId:1000000000000000,name:'Synthetic',body:'Synthetic',year:2000,createdAt:new Date().toISOString(),attachments:[]};
function client(fetch, enabled=true) {
  const context=vm.createContext({CLOUD_CONFIG:{enabled,intakeEndpoint:'https://example.test/intake',mediaEndpoint:'https://example.test/media',maxUploadBytes:52428800},
    fetch,AbortSignal,URL,URLSearchParams,crypto,console,MEM:[{id:123,local:true,story:'local only'}],mem:{},renderMem(){},buildWall(){},
    formValue:(form,id)=>form.values[id]||'', $:(selector,form)=>selector==='#up-mo'?{selectedIndex:0}:selector==='#up-consent'?{checked:true}:{} });
  vm.runInContext(source+'\nglobalThis.client=ProjectCloud;',context);
  return context;
}
test('cloud client never reads or migrates local records; handles pagination and preserves local memory',async()=>{
  const calls=[];
  const context=client(async url=>{calls.push(url);return Response.json(calls.length===1?{records:[record],next:{before:record.createdAt,beforeId:id}}:{records:[],next:null});});
  await context.client.refresh();
  assert.equal(calls.length,2);assert.ok(calls.every(url=>!url.includes('local only')));
  assert.equal(context.MEM.length,2);assert.equal(context.MEM[0].local,true);assert.equal(context.MEM[1].cloud,true);
  assert.equal(context.MEM[1].id,record.displayId);
  let fetched=false;const disabled=client(async()=>{fetched=true;},false);await disabled.client.refresh();assert.equal(fetched,false);
});
test('a stricter server limit does not discard a successfully received text submission',async()=>{
  const calls=[];
  const context=client(async(url,options)=>{
    calls.push({url,body:options.body?JSON.parse(options.body):null});
    if(options.method==='GET')return Response.json({records:[record],next:null});
    const body=JSON.parse(options.body);
    if(url.endsWith('/intake'))return Response.json({id,status:'received'},{status:201});
    assert.equal(body.action,'list');
    return Response.json({attachments:[{id,status:'failed',errorCode:'FILE_TOO_LARGE'}]});
  });
  const form={values:{'up-name':'Synthetic','up-story':'Synthetic','up-email':'synthetic@example.test'},_challengeToken:'synthetic-token',
    _media:{items:[{name:'synthetic.mp4',type:'video',blob:{size:1048576,type:'video/mp4'},w:400,h:300}]}};
  const result=await context.client.submit(form);
  assert.equal(result.cloud,true);assert.match(result.message,/1 個附件未完成/);
  assert.equal(result.id,record.displayId);assert.equal(calls.filter(call=>call.body?.action==='ticket').length,0);
  assert.equal(calls[0].body.email,'synthetic@example.test');assert.equal(form._challengeToken,'');
});

test('cloud preparation accepts the size boundary and rejects oversized photos and videos before decoding',async()=>{
  const context=client(()=>{throw Error('No network expected');});
  for(const size of [52428799,52428800]){
    const file={name:'synthetic.mp4',type:'video/mp4',size};
    assert.equal((await context.client.prepareFile(file,'video')).blob,file);
  }
  for(const [type,name,size] of [['photo','synthetic.jpg',52428801],['video','synthetic.mp4',Math.round(375.9*1048576)]]){
    await assert.rejects(context.client.prepareFile({name,size},type),/超過單檔 50 MB.*YouTube/);
  }
  context.CLOUD_CONFIG.maxUploadBytes=1048576;
  assert.equal(context.client.uploadLimitLabel(),'1 MB');
  await assert.rejects(context.client.prepareFile({name:'synthetic.mp4',size:1048577},'video'),/超過單檔 1 MB/);
  delete context.CLOUD_CONFIG.maxUploadBytes;
  assert.equal(context.client.uploadLimitLabel(),'50 MB');
});

test('submit rechecks original file size before creating any receipt or resetting the challenge',async()=>{
  let requests=0;
  const context=client(()=>{requests++;throw Error('No network expected');});
  const form={_challengeToken:'synthetic-token',_media:{items:[{name:'synthetic.jpg',
    blob:{size:100},original:{size:52428801}}]}};
  await assert.rejects(context.client.submit(form),/synthetic.jpg.*超過單檔 50 MB/);
  assert.equal(requests,0);assert.equal(form._challengeToken,'synthetic-token');
  assert.equal(form._cloudReceipt,undefined);
});

function filePage(enabled=true){
  const context=client(()=>{throw Error('No network expected');},enabled);
  vm.runInContext(fileSource,context);
  const status={textContent:'1 個檔案已準備好。'},button={disabled:false};
  const list={setAttribute(){},removeAttribute(){}};
  const existing={name:'existing.mp4',blob:{size:100,type:'video/mp4'},url:'blob:existing'};
  const form={id:'f-up',_media:{items:[existing],version:0,busy:false}};
  context.formError=(form,message)=>{form.error=message;};
  context.fileError=(form,message)=>{form.error=message;};
  context.renderFileRows=()=>{};
  context.objectURL=()=> 'blob:synthetic';
  context.$=selector=>selector==='[type=submit]'?button:status;
  const select=files=>context.fileRows({form,files,value:'synthetic'},list);
  return {context,form,status,button,existing,select};
}

test('mixed oversized selections preserve earlier attachments and can be replaced with valid selections',async()=>{
  const page=filePage();let prepared=0;
  const prepare=page.context.client.prepareFile;
  page.context.client.prepareFile=async(...args)=>{prepared++;return prepare(...args);};
  await page.select([{name:'small.mp4',type:'video/mp4',size:100},
    {name:'oversized.mp4',type:'video/mp4',size:Math.round(375.9*1048576)}]);
  assert.match(page.form.error,/oversized.mp4.*超過單檔 50 MB/);
  assert.equal(prepared,0);assert.equal(page.form._media.items.length,1);
  assert.equal(page.form._media.items[0],page.existing);
  assert.equal(page.status.textContent,'1 個檔案已準備好。');
  assert.equal(page.form._media.busy,false);assert.equal(page.button.disabled,false);
  await page.select([{name:'valid.mp4',type:'video/mp4',size:52428800}]);
  assert.equal(page.form.error,'');assert.equal(page.form._media.items.length,2);
  assert.equal(page.status.textContent,'2 個檔案已準備好。');
  page.form._media.items=Array(10).fill(page.existing);
  await page.select([{name:'eleventh.mp4',type:'video/mp4',size:100}]);
  assert.match(page.form.error,/最多 10 個/);assert.equal(page.form._media.items.length,10);
});

test('local-only selection retains its existing video and photo limits',async()=>{
  const page=filePage(false);
  await page.select([{name:'local.mp4',type:'video/mp4',size:100*1048576}]);
  assert.equal(page.form.error,'');assert.equal(page.form._media.items.length,2);
  for(const file of [{name:'large.mp4',type:'video/mp4',size:300*1048576+1},
    {name:'large.jpg',type:'image/jpeg',size:25*1048576+1}]){
    await page.select([file]);assert.match(page.form.error,/超過檔案大小限制/);
    assert.equal(page.form._media.items.length,2);
  }
});

test('file errors are visible beside the picker and scroll into view; clearing them hides the alert',()=>{
  const context=client(()=>{});vm.runInContext(fileSource,context);let scrolls=0;
  const alert={textContent:'',hidden:true,scrollIntoView(options){assert.equal(options.block,'nearest');scrolls++;}};
  context.$=selector=>{assert.equal(selector,'[data-file-error]');return alert;};
  context.fileError({},'synthetic.mp4 超過單檔 50 MB');assert.equal(alert.hidden,false);assert.match(alert.textContent,/超過單檔/);assert.equal(scrolls,1);
  context.fileError({},'');assert.equal(alert.hidden,true);assert.equal(scrolls,1);
});

test('a slow older response cannot restore a post removed by a newer read', async () => {
  const pending = [];
  const context = client(() => new Promise(resolve => pending.push(resolve)));
  const older = context.client.refresh(), newer = context.client.refresh();
  pending[1](Response.json({ records: [], next: null })); await newer;
  pending[0](Response.json({ records: [record], next: null })); await older;
  assert.equal(context.MEM.some(item => item.cloudId === id), false);
  assert.equal(context.MEM[0].local, true);
});
test('unchanged polls preserve media DOM; a removed cloud record disappears on refresh', async () => {
  let removed = false, renders = 0;
  const context = client(async () => Response.json({ records: removed ? [] : [record], next: null }));
  context.renderMem = () => renders++;
  await context.client.refresh(); await context.client.refresh(); assert.equal(renders, 1);
  removed = true; await context.client.refresh(); assert.equal(renders, 2);
  assert.equal(context.MEM.length, 1); assert.equal(context.MEM[0].local, true);
});
