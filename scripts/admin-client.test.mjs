import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createAdminSync } from '../admin/src/sync.mjs';

const source = (await readFile(new URL('../admin/src/app.js', import.meta.url), 'utf8'))
  .replace("import { createClient } from '@supabase/supabase-js';", '').replace("import { mountCatalog } from './catalog.js';", '')
  .replace("import { createAdminSync } from './sync.mjs';", '').replace(/task\(start\);\s*$/, '');

async function boot(type, request) {
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, value: '', textContent: '',
      classList: { toggle() {} }, replaceChildren() {}, close() {}, reset() { this.value = ''; },
      querySelector() { return {}; }, addEventListener() {} });
    return elements.get(id);
  };
  let callback, profileCalls = 0, signOuts = 0;
  const location = { hash: `#access_token=synthetic&type=${type}`, origin: 'https://example.test' };
  const auth = {
    onAuthStateChange(fn) { callback = fn; },
    getSession: async () => ({ data: { session: { access_token: 'synthetic', user: {} } } }),
    updateUser: async () => ({ error: null }),
    signOut: async () => { signOuts++; callback('SIGNED_OUT'); return {}; },
  };
  const context = vm.createContext({ document: { getElementById: node, addEventListener() {} }, location,
    URLSearchParams, AbortSignal, AbortController, window: { addEventListener() {} }, createAdminSync, mountCatalog(){return {clear(){},enter(){}}}, createClient() {
      // The real SDK may consume the fragment before getSession resolves.
      location.hash = ''; return { auth };
    }, fetch: async url => {
      if (url === './config.json') return Response.json({ enabled: true, publishableKey: 'sb_publishable_synthetic', supabaseUrl: 'https://example.test' });
      if (request) return request(url);
      profileCalls++; throw new Error('Setup links must not enter the role workspace');
    },
  });
  vm.runInContext(source + '\nglobalThis.boot = start; globalThis.callApi = api;', context);
  await context.boot();
  return { node, callback, callApi: context.callApi, profileCalls: () => profileCalls, signOuts: () => signOuts };
}

test('invite and recovery links survive SDK fragment consumption and require password setup', async () => {
  for (const type of ['invite', 'recovery']) {
    const page = await boot(type);
    assert.equal(page.node('recovery-panel').hidden, false);
    assert.equal(page.node('workspace').hidden, true);
    assert.equal(page.profileCalls(), 0);
    page.callback('SIGNED_OUT');
    assert.equal(page.node('recovery-panel').hidden, true);
    for (const id of ['members-panel', 'security-panel', 'archive-panel']) assert.equal(page.node(id).hidden, true);
  }
});


test('logout rejects an in-flight private response even if the transport returns late', async () => {
  let deliver;
  const page = await boot('invite', () => new Promise(resolve => { deliver = resolve; }));
  const pending = page.callApi('contacts', { id: 'synthetic' });
  await new Promise(resolve => setImmediate(resolve));
  page.callback('SIGNED_OUT');
  deliver(Response.json({ result: { email: 'synthetic@example.test' } }));
  await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(page.node('workspace').hidden, true);
});

class Element {
  constructor(tag='div') { this.tagName=tag; this.children=[]; this.value=''; this.textContent=''; this.hidden=false; this.open=false; this.replacements=0; this.classList={toggle(){}}; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; this.replacements++; }
  addEventListener() {} setAttribute() {} reset() {} close() { this.open=false; } showModal() { this.open=true; }
  querySelector() { return new Element('button'); }
}
const submission={id:'synthetic-id',name:'Synthetic',body:'Synthetic text',createdAt:'2026-11-05T00:00:00Z',attachments:[{filename:'synthetic.mp4',source:'upload',status:'pending'}]};
async function adminPage() {
  const nodes=new Map(),timers=new Map(),events={},calls=[];let timerId=0,callback,rows=[],failure=false,hold,token='synthetic',signIns=0,catalogReads=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  node('filter').value='all';node('archive-panel').hidden=true;
  const document={hidden:false,getElementById:node,createElement:tag=>new Element(tag),addEventListener(name,fn){events[name]=fn;}};
  const context=vm.createContext({document,location:{hash:'',origin:'https://example.test'},URLSearchParams,AbortController,AbortSignal,
    window:{addEventListener(name,fn){events[name]=fn;}},
    mountCatalog(){return {enter(){node('submissions-panel').hidden=false;},clear(){},refresh:async()=>{catalogReads++;return true}};},
    createAdminSync:options=>createAdminSync({...options,setTimer(fn,delay){assert.equal(delay,5000);timers.set(++timerId,fn);return timerId;},clearTimer(id){timers.delete(id);}}),
    createClient(){return {auth:{onAuthStateChange(fn){callback=fn;},getSession:async()=>({data:{session:{access_token:token,user:{}}}}),signInWithPassword(){signIns++;throw Error('Unexpected sign-in');}}};},
    fetch:async(url,options)=>{
      if(url==='./config.json')return Response.json({enabled:true,supabaseUrl:'https://example.test',publishableKey:'sb_publishable_synthetic',adminEndpoint:'https://example.test/admin'});
      const body=JSON.parse(options.body);calls.push({...body,token:options.headers.Authorization});
      if(body.action==='profile')return Response.json({result:{role:'content_admin'}});
      if(failure)throw Error('offline');
      if(hold){const wait=hold;hold=null;return wait;}
      return Response.json({result:rows});
    }});
  vm.runInContext(source+'\nglobalThis.run=()=>task(start); globalThis.poll=()=>adminSync?.refresh();',context);
  await context.run();await context.poll();
  const text=node=>[node.textContent,...node.children.map(text)].join(' ');
  return {node,context,document,events,calls,timers,text,setRows(value){rows=value;},setFailure(value){failure=value;},
    setToken(value){token=value;callback('TOKEN_REFRESHED');},signIns:()=>signIns,catalogReads:()=>catalogReads,
    holdSearch(){let deliver;hold=new Promise(resolve=>{deliver=resolve;});return rows=>deliver(Response.json({result:rows}));},
    async tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);fn();await context.poll();},
    logout(){callback('SIGNED_OUT');}};
}

test('an open admin session sees new submissions and attachment changes without reloading or signing in',async()=>{
  const p=await adminPage();try{
    p.setRows([submission]);await p.tick();
    assert.equal(p.node('submission-count').textContent,'本頁 1 筆。');assert.match(p.text(p.node('results')),/synthetic.mp4.*pending/);
    const rendered=p.node('results').children[0],updates=p.node('results').replacements;
    await p.tick();assert.equal(p.node('results').children[0],rendered);assert.equal(p.node('results').replacements,updates);
    p.setRows([{...submission,attachments:[{...submission.attachments[0],status:'ready'}]}]);p.setToken('synthetic-renewed');await p.tick();
    assert.match(p.text(p.node('results')),/synthetic.mp4.*ready/);assert.equal(p.calls.at(-1).token,'Bearer synthetic-renewed');assert.equal(p.signIns(),0);
  }finally{p.logout();}
});

test('background reads preserve submitted filters and the current page while search inputs contain drafts',async()=>{
  const p=await adminPage();try{
    p.node('query').value='applied';p.node('filter').value='active';
    p.setRows(Array.from({length:100},(_,i)=>({...submission,id:String(i)})));await p.context.search();
    p.setRows([submission]);await p.context.search(true);
    const applied=p.calls.at(-1).input;assert.equal(applied.beforeId,'99');
    p.node('query').value='draft';p.node('filter').value='deleted';await p.tick();
    assert.deepEqual(p.calls.at(-1).input,applied);assert.equal(p.node('query').value,'draft');assert.equal(p.node('filter').value,'deleted');
  }finally{p.logout();}
});

test('admin sync pauses while hidden or editing and resumes through focus without replacing a draft',async()=>{
  const p=await adminPage();try{
    let searches=p.calls.filter(c=>c.action==='search').length;p.document.hidden=true;await p.tick();
    assert.equal(p.calls.filter(c=>c.action==='search').length,searches);
    p.document.hidden=false;p.setRows([submission]);p.events.visibilitychange();await p.context.poll();
    assert.equal(p.calls.filter(c=>c.action==='search').length,++searches);
    p.node('edit-dialog').open=true;p.node('edit-body').value='draft';await p.tick();
    assert.equal(p.calls.filter(c=>c.action==='search').length,searches);assert.equal(p.node('edit-body').value,'draft');
    p.node('edit-dialog').open=false;p.events.focus();await p.context.poll();assert.equal(p.calls.filter(c=>c.action==='search').length,searches+1);
  }finally{p.logout();}
});

test('the admin five-second timer refreshes concerts through the catalog and pauses for concert drafts',async()=>{
  const p=await adminPage();try{
    p.node('submissions-panel').hidden=true;p.node('concert-panel').hidden=false;
    const searches=p.calls.filter(c=>c.action==='search').length;
    await p.tick();assert.equal(p.catalogReads(),1);assert.equal(p.calls.filter(c=>c.action==='search').length,searches);
    p.node('catalog-edit-dialog').open=true;p.node('catalog-edit-form').value='concert draft';
    await p.tick();assert.equal(p.catalogReads(),1);assert.equal(p.node('catalog-edit-form').value,'concert draft');
    p.node('catalog-edit-dialog').open=false;p.events.focus();await p.context.poll();assert.equal(p.catalogReads(),2);
  }finally{p.logout();}
});

test('a read arriving after an editor opens is deferred; failed reads keep data and logout stops the timer',async()=>{
  const p=await adminPage();try{
    const deliver=p.holdSearch(),pending=p.context.poll();await new Promise(resolve=>setImmediate(resolve));
    p.node('edit-dialog').open=true;deliver([submission]);await pending;
    assert.equal(p.node('submission-count').textContent,'本頁 0 筆。');
    p.node('edit-dialog').open=false;p.setRows([submission]);await p.tick();
    const rendered=p.node('results').children[0];p.setFailure(true);await p.tick();
    assert.equal(p.node('results').children[0],rendered);assert.match(p.node('admin-sync-status').textContent,/同步失敗.*舊資料/);
    p.setFailure(false);await p.tick();assert.match(p.node('admin-sync-status').textContent,/最後成功/);
  }finally{p.logout();}
  assert.equal(p.timers.size,0);assert.equal(p.node('results').children.length,0);assert.equal(p.node('workspace').hidden,true);
});
