import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminHandler, validateAdminInput } from '../supabase/functions/admin/handler.mjs';
const id = '53f43393-2d36-4a93-9814-7a047a32ee97';
const request = (body, token = 'valid') => new Request('https://example.test/admin', { method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'https://dalu.tw' }, body: JSON.stringify(body) });
test('only authenticated identity reaches role-checked database; caller cannot impersonate actor', async () => {
  let identity;
  const handler = createAdminHandler({ origins: ['https://dalu.tw'], enabled: true,
    consumeRate: async () => true,
    authenticate: async token => token === 'valid' ? { id, sessionId: id } : null,
    execute: async (actual, action, input) => { identity = actual; assert.deepEqual(input, { query: '', filter: 'all' }); return []; } });
  assert.equal((await handler(request({ action: 'search', input: { p_actor: 'attacker', role: 'system_admin' } }))).status, 200);
  assert.equal(identity.id, id);
  identity = null;
  assert.equal((await handler(request({ action: 'search' }, 'expired'))).status, 401);
  assert.equal(identity, null);
});
test('validates edit versions, role choices and cursors', () => {
  assert.throws(() => validateAdminInput('edit', { id, name: 'A', body: 'B' }));
  assert.throws(() => validateAdminInput('set_role', { userId: id, role: 'owner', active: true }));
  assert.throws(() => validateAdminInput('search', { before: 'bad', beforeId: id }));
  assert.throws(() => validateAdminInput('visibility', { id, updatedAt: new Date().toISOString(), deleted: 'false' }));
});


test('audit filters copy only validated IDs, action and complete cursors', () => {
  assert.throws(() => validateAdminInput('audit', { actorId: 'spoofed' }));
  assert.throws(() => validateAdminInput('audit', { action: 'invalid action' }));
  assert.throws(() => validateAdminInput('audit', { before: new Date().toISOString() }));
  const input = validateAdminInput('audit', { actorId: id, action: 'member.changed', p_actor: 'spoofed' });
  assert.equal(input.actorId, id); assert.equal(input.action, 'member.changed'); assert.equal(input.p_actor, undefined);
});
