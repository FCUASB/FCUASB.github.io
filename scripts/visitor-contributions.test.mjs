import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const admin = '53f43393-2d36-4a93-9814-7a047a32ee97';
const key = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const doc = { id: 1, origin: 'visitor', title: '[測試] 親友新增', date: '2008', year: 2008, status: 'date-pending', ens: '', place: '', cond: '', story: '', rows: [], sourceNote: '親友新增，尚未核對' };
async function setup() {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);');
  for (const file of ['setup/foundation.sql', 'setup/intake-api.sql', 'setup/admin-api.sql', 'setup/rate-limits.sql', 'setup/catalog-api.sql', 'deploy/visitor-contributions.sql'])
    await db.exec(await readFile(new URL('../supabase/' + file, import.meta.url), 'utf8'));
  await db.query('insert into auth.users values($1)', [admin]); await db.query('insert into auth.sessions values($1,$1,null)', [admin]);
  await db.query("insert into archive_private.admin_members(user_id,role)values($1,'content_admin')", [admin]);
  const rpc = async (name, ...args) => { await db.exec('set role service_role'); try { return (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) as r`, args)).rows[0].r; } finally { await db.exec('reset role'); } };
  const adminCall = (action, input) => rpc('archive_visitor_admin', admin, admin, action, JSON.stringify(input)).catch(error => { throw error; });
  return { db, rpc, adminCall };
}
const concertInput = (n, over = {}) => JSON.stringify({ idempotencyKey: key(n), document: { ...doc, ...over } });
test('a visitor concert publishes immediately with a server id, is idempotent, history-tracked and capped', async () => {
  const { db, rpc } = await setup();
  try {
    const first = await rpc('archive_visitor_concert', concertInput(1));
    assert.equal(first.status, 'received'); assert.match(first.id, /^[1-9][0-9]{12,15}$/); assert.ok(Number.isSafeInteger(Number(first.id)));
    assert.deepEqual(await rpc('archive_visitor_concert', concertInput(1)), first);
    const pub = await rpc('archive_catalog_public');
    assert.equal(pub.concerts.length, 1); assert.equal(String(pub.concerts[0].id), first.id); assert.equal(pub.concerts[0].origin, 'visitor');
    const history = (await db.query("select actor_id,action,revision from archive_private.catalog_history where entry_id=$1", [first.id])).rows;
    assert.deepEqual(history, [{ actor_id: null, action: 'visitor_create', revision: 1 }]);
    await assert.rejects(rpc('archive_visitor_concert', JSON.stringify({ idempotencyKey: key(2), document: { ...doc, origin: 'admin' } })), /invalid document/);
    for (let n = 3; n <= 101; n++) await rpc('archive_visitor_concert', concertInput(n));
    await assert.rejects(rpc('archive_visitor_concert', concertInput(500)), /visitor limit/);
    // Admin takedown keeps working on visitor entries and removes them from the public read.
    await db.exec("set role service_role");
    await db.query("select public.archive_catalog_action($1,$1,'visibility',$2::jsonb)", [admin, JSON.stringify({ kind: 'concert', id: first.id, revision: 1, deleted: true })]);
    await db.exec('reset role');
    assert.equal((await rpc('archive_catalog_public')).concerts.length, 99 + 1 - 1);
  } finally { await db.close(); }
});
test('supplements are public additions with caps; reports stay private; moderation needs a live editor role', async () => {
  const { db, rpc, adminCall } = await setup();
  try {
    const concert = await rpc('archive_visitor_concert', concertInput(1));
    const supplement = n => JSON.stringify({ idempotencyKey: key(n), kind: 'supplement', targetKind: 'concert', targetId: concert.id, name: '親友', body: { text: '補充說明', rows: [] } });
    const first = await rpc('archive_visitor_contribution', supplement(10));
    assert.deepEqual(await rpc('archive_visitor_contribution', supplement(10)), first);
    const supplements = await rpc('archive_catalog_supplements');
    assert.equal(supplements.length, 1); assert.equal(supplements[0].concertId, concert.id); assert.equal(supplements[0].body.text, '補充說明');
    await assert.rejects(rpc('archive_visitor_contribution', JSON.stringify({ idempotencyKey: key(11), kind: 'supplement', targetKind: 'concert', targetId: '999', name: 'x', body: {} })), /target missing/);
    await assert.rejects(rpc('archive_visitor_contribution', JSON.stringify({ idempotencyKey: key(12), kind: 'supplement', targetKind: 'memory', targetId: '1', name: 'x', body: {} })), /invalid kind/);
    for (let n = 13; n <= 31; n++) await rpc('archive_visitor_contribution', supplement(n));
    await assert.rejects(rpc('archive_visitor_contribution', supplement(99)), /supplement limit/);
    // Reports never appear in the public projection.
    const report = await rpc('archive_visitor_contribution', JSON.stringify({ idempotencyKey: key(200), kind: 'report', targetKind: 'memory', targetId: '1000000000000001', name: '訪客', body: { type: '資料錯誤', detail: '說明', contact: 'a@b.c' } }));
    assert.equal((await rpc('archive_catalog_supplements')).length, 20);
    const reports = await adminCall('list', { kind: 'report' });
    assert.equal(reports.length, 1); assert.equal(reports[0].id, report.id);
    assert.equal(reports[0].body.contact, undefined); // content_admin never sees reporter contact data
    await db.query("update archive_private.admin_members set role='data_curator' where user_id=$1", [admin]);
    assert.equal((await adminCall('list', { kind: 'report' }))[0].body.contact, 'a@b.c');
    await db.query("update archive_private.admin_members set role='content_admin' where user_id=$1", [admin]);
    // Hide / restore / resolve.
    await adminCall('hide', { id: first.id });
    assert.equal((await rpc('archive_catalog_supplements')).length, 19);
    await adminCall('restore', { id: first.id });
    assert.equal((await rpc('archive_catalog_supplements')).length, 20);
    assert.ok((await adminCall('resolve', { id: report.id })).resolved_at);
    await assert.rejects(adminCall('hide', { id: report.id }), /invalid action/);
    await assert.rejects(adminCall('list', { kind: 'other' }), /invalid kind/);
    await db.query("update archive_private.admin_members set role='data_curator' where user_id=$1", [admin]);
    assert.equal((await adminCall('list', { kind: 'supplement' })).length, 20);
    await assert.rejects(adminCall('hide', { id: first.id }), /access denied/);
    await db.query('delete from auth.sessions where id=$1', [admin]);
    await assert.rejects(adminCall('list', { kind: 'report' }), /access denied/);
    // A takedown of the concert removes its supplements from the public read as well.
    await db.query("update archive_private.catalog_entries set deleted_at=now() where entry_id=$1", [concert.id]);
    assert.equal((await rpc('archive_catalog_supplements')).length, 0);
    // No browser role can call any of the new functions or read the tables.
    for (const role of ['anon', 'authenticated']) {
      await db.exec('set role ' + role);
      await assert.rejects(db.query("select public.archive_visitor_concert('{}'::jsonb)"), /permission denied/);
      await assert.rejects(db.query('select public.archive_catalog_supplements()'), /permission denied/);
      await assert.rejects(db.query('select * from archive_private.catalog_contributions'), /permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
