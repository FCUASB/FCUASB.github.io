import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitorHandler } from '../supabase/functions/visitor/handler.mjs';
import { validateVisitorConcert, validateSupplement, validateReport, visitorDate } from '../shared/visitor.mjs';
const k = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = { idempotencyKey: k(1), name: 'Lexi測試', consent: true };
const concert = { ...base, title: '[測試] 新增音樂會', date: '2008-05', dateNote: '可能是暑假', place: '地點', ens: '團體', cond: '指揮', story: '回憶', rows: [{ zh: '曲名', composer: '作曲' }] };
test('visitor dates accept year, month or day and never invent missing parts', () => {
  assert.deepEqual(visitorDate('2008'), { date: '2008', year: 2008, timelineOrder: 20080000 });
  assert.equal(visitorDate('2008-05').timelineOrder, 20080500);
  assert.equal(visitorDate('2008-05-18').timelineOrder, 20080518);
  for (const bad of ['2008-5-1', '2008-13', '2008-02-31', '1976', '3001', '', 'abc', '2008/05']) assert.throws(() => visitorDate(bad), /INVALID_INPUT/);
});
test('a visitor concert is rebuilt from fixed fields, marked unverified and cannot smuggle links or keys', () => {
  const { document } = validateVisitorConcert({ ...concert, source: 'javascript:alert(1)', sources: ['https://evil.test'], origin: 'admin', id: 7, need: false, status: '', asset: 'x', videoIds: ['aaaaaaaaaaa'], extra: 1 });
  assert.equal(document.origin, 'visitor'); assert.equal(document.id, 1); assert.equal(document.need, true); assert.equal(document.asset, 'lu-portrait');
  assert.equal(document.status, 'date-pending'); assert.equal(document.sourceNote, '親友新增，尚未核對'); assert.equal(document.contributor, 'Lexi測試');
  assert.equal(document.dateLabel, '2008 年 05 月（可能是暑假）');
  for (const key of ['source', 'sources', 'extra', 'videoIds']) assert.equal(key in document, false);
  const full = validateVisitorConcert({ ...concert, date: '2008-05-18', dateNote: '' }).document;
  assert.equal('dateLabel' in full, false); assert.equal('status' in full, false);
  assert.throws(() => validateVisitorConcert({ ...concert, consent: false }), /CONSENT_REQUIRED/);
  assert.throws(() => validateVisitorConcert({ ...concert, idempotencyKey: 'x' }), /INVALID_IDEMPOTENCY_KEY/);
  assert.throws(() => validateVisitorConcert({ ...concert, title: ' ' }), /INVALID_INPUT/);
  assert.throws(() => validateVisitorConcert({ ...concert, rows: Array(51).fill({ zh: 'a' }) }), /INVALID_INPUT/);
  assert.throws(() => validateVisitorConcert({ ...concert, rows: [{ composer: 'x' }] }), /INVALID_INPUT/);
});
test('supplements and reports validate targets and content', () => {
  assert.equal(validateSupplement({ ...base, concertId: '123', text: '補充' }).targetId, '123');
  assert.throws(() => validateSupplement({ ...base, concertId: '123' }), /INVALID_INPUT/);
  assert.throws(() => validateSupplement({ ...base, concertId: 'abc', text: 'x' }), /INVALID_INPUT/);
  assert.equal(validateReport({ ...base, targetKind: 'memory', targetId: '1000000000000001', type: '資料有誤', detail: '說明' }).body.type, '資料有誤');
  assert.throws(() => validateReport({ ...base, targetKind: 'user', targetId: '1', type: '資料有誤', detail: 'x' }), /INVALID_INPUT/);
  assert.throws(() => validateReport({ ...base, targetKind: 'concert', targetId: '1', type: '亂寫', detail: 'x' }), /INVALID_INPUT/);
  assert.throws(() => validateReport({ ...base, targetKind: 'concert', targetId: '1', type: '資料有誤', detail: '' }), /INVALID_INPUT/);
});
function harness(over = {}) {
  const calls = { concert: [], contribution: [], rates: [], tokens: [] };
  const handler = createVisitorHandler({ origins: ['https://dalu.tw'], enabled: true,
    consumeRate: async scope => { calls.rates.push(scope); return over.blockRate !== scope; },
    verifyChallenge: async (token, origin) => { calls.tokens.push([token, origin]); return token === 'good'; },
    saveConcert: async r => { calls.concert.push(r); return { id: '1700000000000123', status: 'received' }; },
    saveContribution: async r => { calls.contribution.push(r); return { id: k(9), status: 'received' }; }, ...over.deps });
  const post = (body, headers = {}) => handler(new Request('https://example.test/visitor', { method: 'POST', headers: { origin: 'https://dalu.tw', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  return { calls, post, handler };
}
test('the handler verifies the challenge after validation and before any write, and never echoes input', async () => {
  const { calls, post } = harness();
  const bad = await post({ type: 'concert', payload: { ...concert, title: '' }, challengeToken: 'good' });
  assert.equal(bad.status, 400); assert.equal(calls.tokens.length, 0); assert.equal(calls.concert.length, 0);
  assert.equal((await post({ type: 'nope', payload: {}, challengeToken: 'good' })).status, 400);
  assert.equal((await post({ type: 'concert', payload: concert, challengeToken: 'bad' })).status, 403); assert.equal(calls.concert.length, 0);
  assert.equal((await post({ type: 'concert', payload: concert })).status, 403);
  const ok = await post({ type: 'concert', payload: { ...concert, email: 'a@b.c', phone: '123' }, challengeToken: 'good' });
  assert.equal(ok.status, 201); assert.deepEqual(await ok.json(), { id: '1700000000000123', status: 'received' });
  assert.equal(calls.concert.length, 1); assert.equal('email' in calls.concert[0].document, false); assert.deepEqual(calls.tokens.at(-1), ['good', 'https://dalu.tw']);
  const s = await post({ type: 'supplement', payload: { ...base, concertId: '5', text: '補充' }, challengeToken: 'good' });
  assert.equal(s.status, 201); assert.equal(calls.contribution[0].kind, 'supplement');
  const r = await post({ type: 'report', payload: { ...base, targetKind: 'concert', targetId: '5', type: '資料有誤', detail: '說明' }, challengeToken: 'good' });
  assert.equal(r.status, 201); assert.equal(calls.contribution[1].kind, 'report');
});
test('origin, method, size, rate limit and disabled deployments are refused without writing', async () => {
  const { calls, post, handler } = harness();
  assert.equal((await post({ type: 'concert', payload: concert, challengeToken: 'good' }, { origin: 'https://attacker.test' })).status, 403);
  assert.equal((await handler(new Request('https://example.test/visitor', { method: 'GET', headers: { origin: 'https://dalu.tw' } }))).status, 405);
  assert.equal((await handler(new Request('https://example.test/visitor', { method: 'OPTIONS', headers: { origin: 'https://dalu.tw' } }))).status, 204);
  assert.equal((await post({ type: 'concert', payload: { ...concert, story: 'x'.repeat(70000) }, challengeToken: 'good' })).status, 413);
  const limited = harness({ blockRate: 'visitor_write' });
  assert.equal((await limited.post({ type: 'concert', payload: concert, challengeToken: 'good' })).status, 429); assert.equal(limited.calls.concert.length, 0);
  const off = createVisitorHandler({ origins: ['https://dalu.tw'], enabled: false });
  assert.equal((await off(new Request('https://example.test/visitor', { method: 'POST', headers: { origin: 'https://dalu.tw' } }))).status, 503);
  const failing = harness({ deps: { saveConcert: async () => { throw new Error('db password leaked'); } } });
  const res = await failing.post({ type: 'concert', payload: concert, challengeToken: 'good' });
  assert.equal(res.status, 503); assert.deepEqual(await res.json(), { error: 'SERVICE_UNAVAILABLE' }); assert.equal(calls.concert.length, 0);
});
