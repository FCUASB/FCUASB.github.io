import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaHandler } from '../supabase/functions/media/handler.mjs';
const id='6bb3c1cd-2eb8-4c53-8d8e-9282ad4f6164';
const metadata={path:`${id}/${id}`,mimeType:'image/jpeg',size:100};
const make=extra=>createMediaHandler({origins:['https://dalu.tw'],enabled:true,consumeRate:async()=>true,
  uploadAction:async()=>metadata,signUpload:async()=> 'https://storage.test/upload?token=capability',
  inspectObject:async()=>({size:100,mimeType:'image/jpeg'}),publicMedia:async()=>metadata,
  authenticate:async()=>null,adminMedia:async()=>metadata,readObject:async()=>new Response('bytes',{headers:{'Content-Length':'5'}}),...extra});
const post=(action)=>new Request('https://example.test/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,key:id,action})});

test('posters have a separate size bound and completion verifies Storage metadata',async()=>{
  const calls=[];
  const handler=make({uploadAction:async(key,id,action,size,mime)=>{calls.push({action,size,mime});return {...metadata,path:metadata.path+'.poster.jpg'};}});
  const ticket=size=>new Request('https://example.test/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,key:id,action:'poster_ticket',size})});
  for(const size of [0,262145,'100',null])assert.equal((await handler(ticket(size))).status,400);
  assert.equal(calls.length,0);
  assert.equal((await handler(ticket(100))).status,200);
  assert.deepEqual(calls[0],{action:'poster_ticket',size:100,mime:undefined});
  assert.equal((await handler(post('poster_complete'))).status,200);
  assert.deepEqual(calls.at(-1),{action:'poster_complete',size:100,mime:'image/jpeg'});
  const failed=make({uploadAction:async()=>({...metadata,path:metadata.path+'.poster.jpg'}),inspectObject:async()=>({size:101,mimeType:'image/jpeg'})});
  assert.equal((await failed(post('poster_complete'))).status,400);
});

test('a poster GET reads only its JPEG and removal blocks both variants before storage',async()=>{
  const paths=[];
  const handler=make({publicMedia:async()=>({...metadata,mimeType:'video/mp4',posterReady:true,posterSize:20}),readObject:async path=>{paths.push(path);return new Response('poster');}});
  const response=await handler(new Request(`https://example.test/media/${id}?variant=poster`));
  assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');
  assert.deepEqual(paths,[metadata.path+'.poster.jpg']);
  for(const publicMedia of [async()=>null,async()=>({...metadata,mimeType:'video/mp4',posterReady:false})]){
    const blocked=make({publicMedia,readObject:async()=>{throw Error('Should not read any object');}});
    assert.equal((await blocked(new Request(`https://example.test/media/${id}?variant=poster`))).status,404);
  }
});
test('upload completion never trusts browser claimed metadata',async()=>{
  let completed=false;
  const handler=make({inspectObject:async()=>({size:99,mimeType:'image/jpeg'}),uploadAction:async(key,id,action)=>{if(action==='complete') completed=true;return metadata;}});
  assert.equal((await handler(post('complete'))).status,400);assert.equal(completed,false);
});
test('removed media and expired admin auth cannot reach object storage',async()=>{
  let read=false;
  const handler=make({publicMedia:async()=>null,readObject:async()=>{read=true;return new Response('private');}});
  assert.equal((await handler(new Request(`https://example.test/media/${id}`))).status,404);
  assert.equal((await handler(new Request(`https://example.test/media/${id}`,{headers:{Authorization:'Bearer expired'}}))).status,401);
  assert.equal(read,false);
});
test('public media is streamed without cache or signed download capability',async()=>{
  const response=await make({})(new Request(`https://example.test/media/${id}`));
  assert.equal(response.status,200);assert.equal(await response.text(),'bytes');
  assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  assert.equal(response.headers.get('content-type'),'image/jpeg');
  assert.equal((await make({})(new Request(`https://example.test/media/${id}`,{headers:{Range:'bytes=1-2,4-5'}}))).status,416);
});
