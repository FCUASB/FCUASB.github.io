import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntakeHandler, validateMemory } from '../supabase/functions/intake/handler.mjs';
const id = '2d469018-366a-4822-a06a-0a25fc13699d';
const valid = { idempotencyKey: id, name: '測試署名', body: '合成測試文字', consent: true, challengeToken: 'test-token' };
const post = (body, origin = 'https://dalu.tw') => new Request('https://example.test/intake', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
});
function handler(overrides = {}) {
  return createIntakeHandler({ origins: ['https://dalu.tw'], enabled: true,
    consumeRate: async () => true,
    verifyChallenge: async () => true, saveMemory: async () => ({ id }), listMemories: async () => [], ...overrides });
}
test('validates optional private contacts and rejects empty or malformed submissions', () => {
  assert.equal(validateMemory(valid).email, null);
  for (const change of [{ name: '' }, { body: '', youtubeId: '' }, { consent: false }, { email: 'bad' },
    { year: 0 }, { month: 13 }, { youtubeId: 'https://bad' }, { idempotencyKey: 'bad' }, { body: 'a'.repeat(5001) }]) {
    assert.throws(() => validateMemory({ ...valid, ...change }));
  }
});
test('oversized media remains a tracked failed attachment without rejecting the text', () => {
  const result=validateMemory({...valid,uploads:[{name:'synthetic.mp4',mimeType:'video/mp4',size:100000000}]});
  assert.equal(result.body,valid.body);assert.equal(result.uploads[0].initial_error,'FILE_TOO_LARGE');
  assert.throws(()=>validateMemory({...valid,uploads:Array.from({length:11},()=>({name:'x',mimeType:'image/jpeg',size:1}))}));
});
test('rate limit and missing limiter fail closed without saving', async () => {
  let saved = false;
  const saveMemory = async () => { saved = true; return { id }; };
  assert.equal((await handler({ consumeRate: async () => false, saveMemory })(post(valid))).status, 429);
  assert.equal((await handler({ consumeRate: undefined, saveMemory })(post(valid))).status, 503);
  assert.equal(saved, false);
});
test('fails closed before enabling, on challenge rejection, and disallowed origin', async () => {
  let saved = 0;
  const saveMemory = async () => { saved++; return { id }; };
  assert.equal((await handler({ enabled: false, saveMemory })(post(valid))).status, 503);
  assert.equal((await handler({ verifyChallenge: async () => false, saveMemory })(post(valid))).status, 403);
  assert.equal((await handler({ saveMemory })(post(valid, 'https://attacker.test'))).status, 403);
  assert.equal(saved, 0);
});
test('receipt never discloses contacts and upstream errors never leak secrets', async () => {
  const response = await handler()(post({ ...valid, email: 'synthetic@example.test', phone: 'synthetic' }));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id, status: 'received' });
  const failure = await handler({ saveMemory: async () => { throw new Error('secret'); } })(post(valid));
  assert.deepEqual(await failure.json(), { error: 'SERVICE_UNAVAILABLE' });
});
test('bounds streamed request bytes even without content-length', async () => {
  assert.equal((await handler()(post({ ...valid, extra: 'x'.repeat(40000) }))).status, 413);
  const req = new Request('https://example.test/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal((await handler()(req)).status, 400);
});
