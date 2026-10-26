import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../handoff-v1.1/工程檔/cloud.js', import.meta.url), 'utf8');
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
test('oversized failed attachment does not discard a successfully received text submission',async()=>{
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
    _media:{items:[{name:'synthetic.mp4',type:'video',blob:{size:100000000,type:'video/mp4'},w:400,h:300}]}};
  const result=await context.client.submit(form);
  assert.equal(result.cloud,true);assert.match(result.message,/1 個附件未完成/);
  assert.equal(result.id,record.displayId);assert.equal(calls.filter(call=>call.body?.action==='ticket').length,0);
  assert.equal(calls[0].body.email,'synthetic@example.test');assert.equal(form._challengeToken,'');
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
