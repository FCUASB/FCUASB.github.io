import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL intake transaction, permissions, retries, and soft deletion', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);`);
    await db.exec(await readFile(new URL('../supabase/setup/foundation.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/setup/intake-api.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/setup/admin-api.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/setup/rate-limits.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/setup/media-api.sql', import.meta.url), 'utf8'));
    const tables = await db.query(`select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='archive_private' and c.relkind='r'`);
    assert.equal(tables.rows.length, 8);
    assert.ok(tables.rows.every(row => row.relrowsecurity));
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select public.archive_list_memories()'), /permission denied/);
      await assert.rejects(db.query('select * from archive_private.submission_contacts'), /permission denied/);
      await db.exec('reset role');
    }
    const record = { idempotency_key: '2d469018-366a-4822-a06a-0a25fc13699d', display_name: 'Synthetic', body: 'Synthetic memory',
      memory_year: 2000, email: 'synthetic@example.test', phone: 'synthetic', context: { place: 'synthetic' }, youtube_id: null };
    const submit = async value => {
      await db.exec('set role service_role');
      try { return (await db.query('select public.archive_receive_memory($1::jsonb) as result', [JSON.stringify(value)])).rows[0].result; }
      finally { await db.exec('reset role'); }
    };
    const receipt = await submit(record);
    assert.deepEqual(await submit(record), receipt);
    assert.equal((await db.query('select count(*)::int as n from archive_private.submissions')).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int as n from archive_private.submission_contacts')).rows[0].n, 1);
    await assert.rejects(submit({ ...record, body: 'changed' }), /idempotency conflict/);
    await db.exec('set role service_role');
    const published = (await db.query('select public.archive_list_memories() as items')).rows[0].items;
    await db.exec('reset role');
    const uploadRecord = { ...record, idempotency_key: '6bb3c1cd-2eb8-4c53-8d8e-9282ad4f6164', body: '',
      uploads: [{ filename: 'synthetic.jpg', mime_type: 'image/jpeg', size_bytes: 100, width: 400, height: 300 }] };
    const uploadReceipt = await submit(uploadRecord);
    assert.deepEqual(await submit(uploadRecord), uploadReceipt);
    const media = async (name, args) => {
      await db.exec('set role service_role');
      try { return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`, args)).rows[0].result; }
      finally { await db.exec('reset role'); }
    };
    const uploads = await media('archive_upload_action', [uploadRecord.idempotency_key,uploadReceipt.id,'list',null,null]);
    assert.equal(uploads.length,1);
    assert.equal(await media('archive_public_media',[uploads[0].id]),null);
    await assert.rejects(media('archive_upload_action',[record.idempotency_key,uploads[0].id,'ticket',null,null]),/not found/);
    await assert.rejects(media('archive_upload_action',[uploadRecord.idempotency_key,uploads[0].id,'complete',99,'image/jpeg']),/metadata mismatch/);
    await media('archive_upload_action',[uploadRecord.idempotency_key,uploads[0].id,'complete',100,'image/jpeg']);
    await media('archive_upload_action',[uploadRecord.idempotency_key,uploads[0].id,'complete',100,'image/jpeg']);
    assert.equal((await db.query('select count(*)::int as n from archive_private.archive_jobs')).rows[0].n,1);
    assert.equal((await media('archive_public_media',[uploads[0].id])).mimeType,'image/jpeg');
    await db.query('update archive_private.submissions set deleted_at=now() where id=$1',[uploadReceipt.id]);
    assert.equal(await media('archive_public_media',[uploads[0].id]),null);
    assert.equal(published.length, 1);
    assert.equal(JSON.stringify(published).includes(record.email), false);
    assert.equal(JSON.stringify(published).includes(record.idempotency_key), false);
    await db.query('update archive_private.submissions set deleted_at=now() where id=$1', [receipt.id]);
    await submit(record);
    await db.exec('set role service_role');
    assert.deepEqual((await db.query('select public.archive_list_memories() as items')).rows[0].items, []);
    await db.exec('reset role');
    await assert.rejects(submit({ ...record, idempotency_key: '1e32fdc1-5f5c-49d0-ac42-2720b0ad81fe', youtube_id: 'invalid' }));
    assert.equal((await db.query('select count(*)::int as n from archive_private.submissions')).rows[0].n, 2);
    const actors = {
      system_admin: '53f43393-2d36-4a93-9814-7a047a32ee97',
      content_admin: '53f43393-2d36-4a93-9814-7a047a32ee98',
      data_curator: '53f43393-2d36-4a93-9814-7a047a32ee99',
    };
    for (const [role, user] of Object.entries(actors)) {
      await db.query('insert into auth.users(id) values($1)', [user]);
      await db.query('insert into auth.sessions(id,user_id) values($1,$1)', [user]);
      await db.query('insert into archive_private.admin_members(user_id,role) values($1,$2)', [user, role]);
    }
    const admin = async (role, action, input = {}) => {
      await db.exec('set role service_role');
      try { return (await db.query('select public.archive_admin_action($1,$1,$2,$3::jsonb) as result', [actors[role], action, JSON.stringify(input)])).rows[0].result; }
      finally { await db.exec('reset role'); }
    };
    assert.equal((await admin('content_admin', 'profile')).role, 'content_admin');
    assert.equal(JSON.stringify(await admin('content_admin', 'search')).includes(record.email), false);
    await assert.rejects(admin('content_admin', 'contacts', { id: receipt.id }), /access denied/);
    await assert.rejects(admin('content_admin', 'export'), /access denied/);
    assert.equal((await admin('data_curator', 'contacts', { id: receipt.id })).email, record.email);
    assert.equal((await admin('data_curator', 'export'))[0].email, record.email);
    await assert.rejects(admin('data_curator', 'edit', { id: receipt.id }), /access denied/);
    const prior = (await admin('content_admin', 'search')).find(item => item.id === receipt.id);
    const edited = await admin('content_admin', 'edit', { id: receipt.id, updatedAt: prior.updatedAt, name: 'Edited', body: 'Edited', year: 2001 });
    assert.equal(edited.id, receipt.id);
    await assert.rejects(admin('content_admin', 'edit', { id: receipt.id, updatedAt: prior.updatedAt, name: 'Stale', body: 'Stale' }), /edit conflict/);
    await assert.rejects(admin('system_admin', 'set_role', { userId: actors.system_admin, role: 'data_curator', active: true }), /last administrator/);
    await admin('system_admin', 'set_role', { userId: actors.content_admin, role: 'content_admin', active: false });
    await assert.rejects(admin('content_admin', 'search'), /access denied/);
    await db.query('delete from auth.sessions where user_id=$1', [actors.data_curator]);
    await assert.rejects(admin('data_curator', 'export'), /access denied/);
    await db.exec("update archive_private.rate_limits set requests_per_minute=2 where scope='intake_write';set role service_role;");
    assert.equal((await db.query("select public.archive_consume_rate('intake_write') as allowed")).rows[0].allowed,true);
    assert.equal((await db.query("select public.archive_consume_rate('intake_write') as allowed")).rows[0].allowed,true);
    assert.equal((await db.query("select public.archive_consume_rate('intake_write') as allowed")).rows[0].allowed,false);
    assert.equal((await db.query("select public.archive_consume_rate('unknown') as allowed")).rows[0].allowed,false);
    await db.exec('reset role');
  } finally { await db.close(); }
});
