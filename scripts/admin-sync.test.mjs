import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminSync } from '../admin/src/sync.mjs';

function clock() {
  let id = 0; const timers = new Map();
  return { timers, setTimer(fn, delay) { assert.equal(delay, 5000); timers.set(++id, fn); return id; },
    clearTimer(id) { timers.delete(id); }, fire() { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); } };
}

test('admin sync reads serially every five seconds and deduplicates focus events during a slow read', async () => {
  const timer = clock(), states = []; let calls = 0, deliver;
  const sync = createAdminSync({ ...timer, read() { calls++; return new Promise(resolve => { deliver = resolve; }); }, notify: state => states.push(state) });
  const first = sync.refresh(); assert.equal(sync.refresh(), first);
  await Promise.resolve(); assert.equal(calls, 1); assert.equal(timer.timers.size, 0);
  deliver(); await first; assert.equal(timer.timers.size, 1);
  timer.fire(); const next = sync.refresh(); await Promise.resolve(); assert.equal(calls, 2);
  deliver(); await next; assert.equal(states.at(-1).state, 'ready'); sync.stop(); assert.equal(timer.timers.size, 0);
});

test('hidden or editing workspaces pause, and returning to the page refreshes immediately', async () => {
  const timer = clock(), states = []; let visible = false, calls = 0;
  const sync = createAdminSync({ ...timer, canRead: () => visible, read: async () => { calls++; }, notify: state => states.push(state) });
  await sync.refresh(); assert.equal(calls, 0); assert.equal(states.at(-1).state, 'paused');
  visible = true; await sync.refresh(); assert.equal(calls, 1);
  visible = false; timer.fire(); await sync.refresh(); assert.equal(calls, 1); sync.stop();
});

test('failed reads preserve the last success and recover on the next scheduled read', async () => {
  const timer = clock(), states = []; let fail = false;
  const sync = createAdminSync({ ...timer, now: () => 'synthetic-time', read: async () => { if (fail) throw Error('offline'); }, notify: state => states.push(state) });
  await sync.refresh(); fail = true; timer.fire(); await sync.refresh();
  assert.deepEqual(states.at(-1), { state: 'failed', lastSuccess: 'synthetic-time' });
  fail = false; timer.fire(); await sync.refresh(); assert.equal(states.at(-1).state, 'ready'); sync.stop();
});

test('logout cancels scheduled and queued work and ignores late responses', async () => {
  const timer = clock(), states = []; let calls = 0, deliver;
  const sync = createAdminSync({ ...timer, read() { calls++; return new Promise(resolve => { deliver = resolve; }); }, notify: state => states.push(state) });
  const pending = sync.refresh(); await Promise.resolve(); sync.stop(); deliver(); await pending;
  assert.equal(states.length, 1); assert.equal(timer.timers.size, 0); await sync.refresh(); assert.equal(calls, 1);
  const queued = createAdminSync({ ...timer, read: () => { calls++; }, notify() {} });
  const beforeStart = queued.refresh(); queued.stop(); await beforeStart; assert.equal(calls, 1);
});
