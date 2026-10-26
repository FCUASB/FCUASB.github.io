import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const api = vm.runInNewContext(readFileSync(new URL('../handoff-v1.1/工程檔/connection.js', import.meta.url), 'utf8') + '\nProjectConnection', {
  URL, Headers, AbortController, setTimeout, clearTimeout, fetch,
});
const code = expected => error => error.code === expected;

test('HTTP integration: base path, JSON, empty response, retry reads only', async () => {
  const counts = {};
  const server = createServer((req, res) => {
    counts[req.url] = (counts[req.url] || 0) + 1;
    if (req.url === '/api/empty') { res.writeHead(204).end(); return; }
    if (req.url === '/api/bad') { res.end('invalid json'); return; }
    if (req.url === '/api/retry' && counts[req.url] === 1 || req.url === '/api/write') {
      res.writeHead(503).end(); return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => res.end(JSON.stringify({ body: body ? JSON.parse(body) : null, path: req.url })));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const client = api.createHttpClient({ baseURL: `http://127.0.0.1:${server.address().port}/api` });
    assert.equal((await client.request('items', { method: 'POST', body: { text: '測試' } })).body.text, '測試');
    assert.equal(await client.request('empty'), null);
    await assert.rejects(client.request('bad'), code('INVALID_RESPONSE'));
    assert.equal((await client.request('retry')).path, '/api/retry');
    assert.equal(counts['/api/retry'], 2);
    await assert.rejects(client.request('write', { method: 'POST', body: {} }), code('HTTP'));
    assert.equal(counts['/api/write'], 1);
    for (const path of ['../escape', '/escape', 'https://other.test', '%2e%2e/escape']) {
      await assert.rejects(client.request(path));
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('timeout, cancellation and network errors remain distinguishable', async () => {
  const pending = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const client = api.createHttpClient({ baseURL: 'https://example.test/api/', fetchImpl: pending, timeoutMs: 10, retries: 0 });
  await assert.rejects(client.request('items'), code('TIMEOUT'));
  const controller = new AbortController();
  const request = client.request('items', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, code('CANCELLED'));
  await assert.rejects(client.request('items', { signal: controller.signal }), code('CANCELLED'));
  let calls = 0;
  const offline = api.createHttpClient({ baseURL: 'https://example.test', fetchImpl: async () => { calls++; throw Error('offline'); } });
  await assert.rejects(offline.request('items'), code('NETWORK'));
  assert.equal(calls, 2);
});

test('repository delegates records without changing blobs or hiding failures', async () => {
  const record = { id: 1, media: [new Blob(['test'])] };
  const failure = new Error('storage failed');
  const repository = api.createRepository({ list: async () => [record], save: async (_name, value) => {
    assert.equal(value, record); throw failure;
  } });
  assert.equal((await repository.list('memories'))[0], record);
  await assert.rejects(repository.save('memories', record), error => error === failure);
  await assert.rejects(repository.list('unknown'));
});
