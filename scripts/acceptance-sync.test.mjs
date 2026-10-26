import test from 'node:test';
import assert from 'node:assert/strict';
import { createAcceptanceSync } from '../acceptance/src/sync.mjs';

function clock() {
  let id = 0; const timers = new Map();
  return { timers, setTimer(fn, delay) { assert.equal(delay, 10000); timers.set(++id, fn); return id; },
    clearTimer(id) { timers.delete(id); }, fire() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); } };
}
test('automatic refresh has one in-flight read and resumes from a hidden page', async () => {
  const timer = clock(), states = []; let calls = 0, finish, visible = true;
  const sync = createAcceptanceSync({ ...timer, active: () => visible, notify: state => states.push(state),
    now: () => '2026-10-26T00:00:00Z', read: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = sync.refresh(); assert.equal(sync.refresh(), first);
  await Promise.resolve(); assert.equal(calls, 1); finish(); await first;
  assert.equal(states.at(-1).state, 'ready'); assert.equal(timer.timers.size, 1);
  visible = false; timer.fire(); assert.equal(calls, 1);
  visible = true; timer.fire(); await Promise.resolve(); assert.equal(calls, 2);
  sync.stop(); finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(timer.timers.size, 0);
});
test('failed sync keeps the last successful time and never reports a fresh list', async () => {
  const timer = clock(), states = []; let fail = false;
  const sync = createAcceptanceSync({ ...timer, notify: state => states.push(state), now: () => 'synthetic-time',
    read: async () => { if (fail) throw Error('offline'); } });
  await sync.refresh(); fail = true; await sync.refresh();
  assert.deepEqual(states.at(-1), { state: 'failed', lastSuccess: 'synthetic-time' });
  assert.equal(timer.timers.size, 1); sync.stop();
});
