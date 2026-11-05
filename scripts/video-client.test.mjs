import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../shared/video.js',import.meta.url),'utf8');
function page({decode=false}={}){
 const events={},requests=[],created=[],revoked=[];
 const document={addEventListener:(name,fn)=>events[name]=fn,createElement(tag){
  const node={tag,dataset:{},attrs:{},children:[],readyState:2,videoWidth:1280,videoHeight:720,duration:4,
   addEventListener(){},append(child){this.children.push(child)},setAttribute(name,value){this.attrs[name]=value},
   removeAttribute(name){delete this.attrs[name]},querySelectorAll(){return[]},
   pause(){this.paused=true},load(){},play(){this.played=true;return Promise.resolve()},after(){},remove(){this.removed=true},
   getContext(){return{drawImage(){}}},toBlob(callback,type){callback({size:100,type})}};
  Object.defineProperty(node,'src',{get(){return node.attrs.src},set(value){node.attrs.src=value;requests.push({tag,url:value});if(decode&&tag==='video')queueMicrotask(()=>node.onloadedmetadata?.())}});
  Object.defineProperty(node,'currentTime',{set(){queueMicrotask(()=>node.onseeked?.())}});
  created.push(node);return node;
 }};
 const context=vm.createContext({document,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:url=>revoked.push(url)},encodeURIComponent,setTimeout,clearTimeout});
 vm.runInContext(source+';this.api=ProjectVideo;',context);
 return {api:context.api,events,requests,created,revoked};
}
test('file and YouTube posters never attach media sources until the explicit play click',async()=>{
 const p=page(),url='https://example.test/media/video';
 for(const media of [{url},{url,poster:'https://example.test/poster'},{youtube:'n7mhsJLAsVk'}]){
  const html=p.api.player(media,'Synthetic');
  assert.doesNotMatch(html,/<(?:video|iframe)\b/);assert.doesNotMatch(p.api.cover(media),new RegExp(url));
 }
 assert.equal(p.requests.length,0);
 const button={dataset:{videoSrc:url,videoTitle:'Synthetic'},replaceWith(node){this.replacement=node}};
 p.events.click({target:{closest:()=>button}});
 assert.deepEqual(p.requests,[{tag:'video',url}]);assert.equal(button.replacement.played,true);
 p.api.stop({querySelectorAll:selector=>selector==='video'?[button.replacement]:[]});
 assert.equal(button.replacement.paused,true);assert.equal(button.replacement.attrs.src,undefined);
 const youtube={dataset:{videoYoutube:'n7mhsJLAsVk'},replaceWith(node){this.replacement=node}};
 p.events.click({target:{closest:()=>youtube}});
 assert.equal(p.requests.at(-1).tag,'iframe');assert.match(p.requests.at(-1).url,/autoplay=1/);
});
test('a snapshot is generated from the selected local blob and stays below the poster bound',async()=>{
 const p=page({decode:true}),file={name:'synthetic.mp4'};
 const prepared=await p.api.prepare(file);
 assert.equal(prepared.blob,file);assert.equal(prepared.w,1280);assert.equal(prepared.h,720);
 assert.equal(prepared.posterBlob.type,'image/jpeg');assert.ok(prepared.posterBlob.size<=262144);
 assert.deepEqual(p.requests,[{tag:'video',url:'blob:synthetic'}]);assert.deepEqual(p.revoked,['blob:synthetic']);
 const canvas=p.created.find(node=>node.tag==='canvas');assert.equal(canvas.width,640);assert.equal(canvas.height,360);
});
