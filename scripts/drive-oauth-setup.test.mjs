import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSetupServer, scope, redirectUri } from './drive-oauth-setup.mjs';

// Undici replaces Host; use a raw HTTP client to exercise the loopback Host boundary.
function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method:options.method || 'GET',headers:options.headers}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), {status:res.statusCode,headers:res.headers})));
    });
    req.on('error', reject);
    req.end(options.body?.toString());
  });
}

test('loopback OAuth rejects forged hosts, cross-origin posts and unsolicited callbacks', async () => {
  let remoteCalls = 0;
  const server = createSetupServer({send:async () => { remoteCalls++; throw Error(); }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base)).status, 403);
    const headers = {Host:'localhost:8765'};
    const home = await fetch(base, {headers});
    const html = await home.text();
    assert.equal(home.headers.get('cache-control'), 'no-store');
    assert.equal(home.headers.get('referrer-policy'), 'same-origin');
    assert.match(home.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(home.headers.get('content-security-policy'), /form-action 'self' https:\/\/accounts\.google\.com;/);
    assert.ok(html.includes(redirectUri));
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    assert.equal((await fetch(`${base}/start`, {method:'POST', headers:{...headers, Origin:'https://evil.example','Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({csrf, secret:'synthetic-secret'})})).status, 400);
    assert.equal((await fetch(`${base}/oauth/callback?code=synthetic&state=forged`, {headers})).status, 400);
    assert.equal(remoteCalls, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('OAuth uses state and PKCE, exchanges a code once, and keeps secrets off status pages', async () => {
  const calls = [];
  const server = createSetupServer({send:async (url, options) => {
    calls.push({url, body:options.body});
    return new Response(JSON.stringify({refresh_token:'synthetic-refresh', access_token:'synthetic-access',scope}), {status:200});
  }});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {Host:'localhost:8765'};
  try {
    const html = await (await fetch(base,{headers})).text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
    const start = await fetch(`${base}/start`, {method:'POST', redirect:'manual', headers:{...headers,Origin:'http://localhost:8765','Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({csrf,secret:'synthetic-secret'})});
    const auth = new URL(start.headers.get('location'));
    assert.equal(auth.origin, 'https://accounts.google.com');
    assert.equal(auth.searchParams.get('scope'), scope);
    assert.equal(auth.searchParams.get('access_type'), 'offline');
    assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
    const callback = `${base}/oauth/callback?code=synthetic-code&state=${auth.searchParams.get('state')}`;
    const response = await fetch(callback,{headers,redirect:'manual'});
    assert.equal(response.status,303);
    assert.equal(response.headers.get('location'), '/ready');
    const status = await (await fetch(`${base}/ready`,{headers})).text();
    assert.ok(!status.includes('synthetic-refresh') && !status.includes('synthetic-secret'));
    assert.equal(calls.length,1);
    assert.equal(calls[0].url,'https://oauth2.googleapis.com/token');
    assert.equal(calls[0].body.get('redirect_uri'),redirectUri);
    assert.equal((await fetch(callback,{headers,redirect:'manual'})).status,400);
    assert.equal(calls.length,1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
