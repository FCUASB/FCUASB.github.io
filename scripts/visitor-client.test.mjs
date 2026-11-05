import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../handoff-v1.1/工程檔/visitor-client.js', import.meta.url), 'utf8');
function client({ enabled = true, fetch }) {
  const refreshed = [], resets = [];
  const context = vm.createContext({ fetch, AbortSignal, JSON, crypto, Date, Number, String, Array, Promise, console,
    CLOUD_CONFIG: { visitorEnabled: enabled, visitorEndpoint: 'https://example.test/visitor', turnstileSiteKey: 'site' },
    ProjectCatalog: { refresh: async () => { refreshed.push(1); } }, formError() {},
    window: { turnstile: { reset: id => resets.push(id) } } });
  vm.runInContext(source + ';this.client=ProjectVisitor;', context);
  return { api: context.client, refreshed, resets };
}
const form = (over = {}) => ({ _challengeToken: 'tok', _challenge: 7, querySelector: () => ({ checked: true }), ...over });
const ok = body => async (url, init) => Response.json(body, { status: 201 });
test('visitor forms send nothing and keep the content when the feature is not enabled', async () => {
  let calls = 0; const { api } = client({ enabled: false, fetch: async () => { calls++; return Response.json({}); } });
  await assert.rejects(api.submit(form(), 'concert', { title: 'x' }), /尚未開放/);
  assert.equal(calls, 0); assert.match(api.fields('公開說明'), /尚未開放/);
});
test('a submission needs a challenge token, keeps one idempotency key per unchanged content and resets the challenge', async () => {
  const bodies = []; const { api, refreshed, resets } = client({ fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return Response.json({ id: '1700000000000123', status: 'received' }, { status: 201 }); } });
  await assert.rejects(api.submit(form({ _challengeToken: '' }), 'concert', {}), /請先完成驗證/);
  const f = form(); const fields = { title: 'T', date: '2008', name: 'N' };
  const result = await api.submit(f, 'concert', fields);
  assert.equal(result.cloud, true); assert.equal(result.kind, 'concert'); assert.equal(result.id, 1700000000000123);
  assert.equal(bodies[0].type, 'concert'); assert.equal(bodies[0].challengeToken, 'tok'); assert.equal(bodies[0].payload.consent, true); assert.equal(bodies[0].payload.title, 'T');
  assert.deepEqual(resets, [7]); assert.equal(f._challengeToken, ''); assert.equal(refreshed.length, 1);
  f._challengeToken = 'tok2'; await api.submit(f, 'concert', fields);
  assert.equal(bodies[1].payload.idempotencyKey, bodies[0].payload.idempotencyKey);
  f._challengeToken = 'tok3'; await api.submit(f, 'concert', { ...fields, title: 'changed' });
  assert.notEqual(bodies[2].payload.idempotencyKey, bodies[0].payload.idempotencyKey);
});
test('supplements refresh the catalog, reports stay private and errors are readable without leaking details', async () => {
  const { api, refreshed } = client({ fetch: ok({ id: 'abc', status: 'received' }) });
  const s = await api.submit(form(), 'supplement', { concertId: 5, text: 't', rows: [], name: 'N' });
  assert.equal(s.kind, 'concert'); assert.equal(s.id, 5); assert.equal(refreshed.length, 1);
  const r = await api.submit(form(), 'report', { targetKind: 'site', targetId: 'general', type: '資料錯誤', detail: 'd', name: 'N' });
  assert.equal(r.kind, 'report'); assert.match(r.message, /不會公開/); assert.equal(refreshed.length, 1);
  const net = client({ fetch: async () => { throw new TypeError('Failed to fetch'); } }).api;
  await assert.rejects(net.submit(form(), 'report', {}), /目前無法連線到網站/);
  for (const [code, text] of [['CHALLENGE_FAILED', /驗證已失效/], ['RATE_LIMITED', /稍後再試/], ['INVALID_INPUT', /格式不符/], ['INVALID_CHANGE', /上限/], ['NOT_FOUND', /已不存在/], ['SOMETHING_ELSE', /未確認收件成功/]]) {
    const api2 = client({ fetch: async () => Response.json({ error: code }, { status: 400 }) }).api;
    await assert.rejects(api2.submit(form(), 'report', {}), text);
  }
});
test('server supplements are validated and mapped to concert ids', () => {
  const { api } = client({ fetch: ok({}) });
  assert.equal(api.load([{ id: 'a', concertId: '12', name: 'N', body: { text: 't', rows: [{ zh: 'z' }] }, createdAt: '2026-01-01T00:00:00Z' }]), true);
  assert.equal(api.supplementsFor(12)[0].rows[0].zh, 'z');
  assert.throws(() => api.load([{ id: 'a', concertId: 'x', name: 'N', body: { text: 't' } }]));
  assert.equal(api.load(null), true); assert.equal(api.supplementsFor(12).length, 0);
});
test('the form checks dates in the browser before anything is sent', () => {
  const { api } = client({ fetch: ok({}) });
  for (const good of ['2008', '2008-05', '2008-05-18']) assert.equal(api.checkDate(good), good);
  for (const bad of ['2008-5-1', '1976', '3001', '2008-02-31', '2008-13', '', '八月']) assert.throws(() => api.checkDate(bad), /請填寫 1977 年起/);
});
