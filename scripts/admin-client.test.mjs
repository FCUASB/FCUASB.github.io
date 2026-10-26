import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../admin/src/app.js', import.meta.url), 'utf8'))
  .replace("import { createClient } from '@supabase/supabase-js';", '').replace("import { mountCatalog } from './catalog.js';", '')
  .replace(/task\(start\);\s*$/, '');

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
  const context = vm.createContext({ document: { getElementById: node }, location,
    URLSearchParams, AbortSignal, AbortController, window: {}, mountCatalog(){return {clear(){},enter(){}}}, createClient() {
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
