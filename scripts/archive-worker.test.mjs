import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerHandler,runArchiveTick } from '../supabase/functions/archive-worker/worker.mjs';
import { ArchiveError,createDriveClient,validateDriveSession } from '../supabase/functions/archive-worker/drive.mjs';
const sessionUrl='https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic';
const job={jobId:'synthetic-job',token:'synthetic-lease',kind:'attachment',submissionId:'synthetic-submission',attachmentId:'synthetic-attachment',createdAt:'2026-10-24T00:00:00Z',size:9*1024*1024,mimeType:'video/mp4',objectPath:'synthetic/path',revision:1};
function dependencies(extra={}){
 const events=[];let generated=0;
 const drive={generateId:async()=>`generated-file-${++generated}`,ensureFolder:async()=>{},begin:async()=>({sessionUrl,offset:0,done:false,fresh:true}),
  chunk:async(url,bytes,offset,size)=>{assert.equal(url,sessionUrl);return{offset:offset+bytes.length,done:offset+bytes.length===size};},verify:async()=>{}};
 return {events,claim:async()=>job,work:async(action,id,token,data)=>{events.push({action,data});return{fileId:data?.fileId};},getDrive:async()=>drive,
  readSource:async(path,start,end)=>new Uint8Array(end-start+1),rootFolderId:'synthetic-root',...extra};
}
test('worker checkpoints chunks and keeps a stable resumable URL',async()=>{
 const deps=dependencies();assert.deepEqual(await runArchiveTick(deps),{state:'completed'});
 assert.equal(deps.events.filter(e=>e.action==='session').length,1);
 assert.equal(deps.events.filter(e=>e.action==='complete').length,1);
 const limited=dependencies({maxChunks:1});assert.equal((await runArchiveTick(limited)).state,'pending');
 assert.equal(limited.events.at(-1).action,'yield');
});
test('worker reports sanitized auth failure and never claims cloud success',async()=>{
 const deps=dependencies({getDrive:async()=>{throw new ArchiveError('AUTH_REQUIRED');}});
 assert.deepEqual(await runArchiveTick(deps),{state:'failed',code:'AUTH_REQUIRED'});
 assert.equal(deps.events.at(-1).data.code,'AUTH_REQUIRED');
});
test('scheduler is fail-closed and requires its separate secret',async()=>{
 let ran=false;const handler=createWorkerHandler({enabled:true,secret:'s'.repeat(40),tick:async()=>{ran=true;return{state:'idle'};}});
 assert.equal((await handler(new Request('https://example.test/worker',{method:'POST'}))).status,401);assert.equal(ran,false);
 assert.equal((await handler(new Request('https://example.test/worker',{method:'POST',headers:{Authorization:'Bearer '+'s'.repeat(40)}}))).status,200);assert.equal(ran,true);
});
test('Drive session URLs cannot send bearer credentials to arbitrary hosts',()=>{
 assert.equal(validateDriveSession(sessionUrl),sessionUrl);
 for(const url of ['https://attacker.test/upload/drive/v3/files?upload_id=x','http://www.googleapis.com/upload/drive/v3/files?upload_id=x','https://www.googleapis.com/other?upload_id=x'])assert.throws(()=>validateDriveSession(url));
});
test('already uploaded preallocated ID is verified without another upload',async()=>{
 const requests=[];const drive=createDriveClient({token:'synthetic-secret',fetch:async(url,options)=>{
  requests.push({url,method:options.method||'GET'});return Response.json({id:'generated-file-00001',size:'100',parents:['generated-folder-00001'],appProperties:{archiveSubmission:'submission',archiveKind:'attachment',archiveAttachment:'attachment'}});
 }});
 const result=await drive.begin({fileId:'generated-file-00001',folderId:'generated-folder-00001',submissionId:'submission',attachmentId:'attachment',kind:'attachment',size:100,mimeType:'image/jpeg'});
 assert.equal(result.done,true);assert.equal(requests.length,1);assert.equal(requests[0].method,'GET');
});

test('incomplete Drive status cannot cause an empty final chunk or premature success',async()=>{
 const drive=createDriveClient({token:'synthetic',fetch:async(url)=>
  url.includes('/drive/v3/files/generated-file') ? new Response(null,{status:404}) :
  new Response(null,{status:308,headers:{Range:'bytes=0-99'}})});
 await assert.rejects(drive.begin({fileId:'generated-file-00001',folderId:'generated-folder-00001',
  submissionId:'submission',attachmentId:'attachment',kind:'attachment',size:100,mimeType:'image/jpeg',sessionUrl}),
  error=>error.code==='FILE_MISMATCH');
 const premature=createDriveClient({token:'synthetic',fetch:async()=>new Response(null,{status:200})});
 await assert.rejects(premature.chunk(sessionUrl,new Uint8Array(10),0,100),error=>error.code==='FILE_MISMATCH');
 assert.deepEqual(await premature.chunk(sessionUrl,new Uint8Array(10),90,100),{offset:100,done:true});
});
