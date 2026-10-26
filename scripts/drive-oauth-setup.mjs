// One-time, loopback-only setup. No credentials, codes or tokens are logged or written to disk.
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const scope = 'https://www.googleapis.com/auth/drive.file';
export const origin = 'http://localhost:8765';
export const redirectUri = `${origin}/oauth/callback`;
const clientId = '603084847618-91vrelpc6ge1qqotpsnu21ovkrsnhslr.apps.googleusercontent.com';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nonce = () => randomBytes(32).toString('base64url');
const failure = code => Object.assign(new Error(code), { safeCode:code });

export function createSetupServer({ send = fetch } = {}) {
  const csrf = nonce();
  let session, result;
  const expires = Date.now() + 20 * 60_000;
  function page(res, status, body) {
    res.writeHead(status, {
      'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store',
      // no-referrer makes native form POSTs send Origin: null. Keep same-origin
      // form provenance while suppressing referrers to external destinations.
      'Referrer-Policy':'same-origin', 'X-Content-Type-Options':'nosniff',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'none'",
    });
    res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Drive 一次性授權</title><style>body{font:18px/1.6 system-ui;max-width:760px;margin:40px auto;padding:20px}input,textarea{box-sizing:border-box;width:100%;font:inherit}textarea{height:110px}button{font:inherit;padding:12px;margin-top:16px}code{overflow-wrap:anywhere}</style><h1>校友團 Drive 一次性授權</h1>${body}</html>`);
  }
  async function form(req) {
    if (req.headers.origin !== origin) throw failure('FORM_ORIGIN');
    if (!String(req.headers['content-type']).startsWith('application/x-www-form-urlencoded')) throw failure('FORM_FORMAT');
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 8192) throw failure('FORM_SIZE'); }
    const data = new URLSearchParams(body);
    if (data.get('csrf') !== csrf) throw failure('FORM_EXPIRED');
    return data;
  }
  async function json(url, options) {
    let response;
    try { response = await send(url, {...options, redirect:'error', signal:AbortSignal.timeout(20_000)}); }
    catch { throw failure('GOOGLE_CONNECTION'); }
    if (!response.ok) {
      let code; try { code = (await response.json()).error; } catch {}
      const allowed = {invalid_client:'OAUTH_CLIENT',invalid_grant:'OAUTH_CODE',redirect_uri_mismatch:'OAUTH_REDIRECT',access_denied:'OAUTH_DENIED'};
      throw failure(Object.hasOwn(allowed, code) ? allowed[code] : 'GOOGLE_RESPONSE');
    }
    return response.json();
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.host !== 'localhost:8765') return page(res, 403, '請使用 localhost:8765。');
      if (Date.now() > expires) { session = result = undefined; return page(res, 410, '已逾時，請停止並重新啟動工具。'); }
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && url.pathname === '/') {
        return page(res, 200, `<p>僅向 Google 申請 <code>drive.file</code> 與離線存取。請選校友團 Google 帳號。秘密僅暫存於本機程序記憶體，不寫檔、不輸出到終端。</p><p>GCP 返回網址：<code>${redirectUri}</code></p><form method="post" action="/start"><input type="hidden" name="csrf" value="${csrf}"><label>輪替後的 OAuth Client Secret<input name="secret" type="password" autocomplete="off" required maxlength="512"></label><button>前往 Google 授權</button></form>`);
      }
      if (req.method === 'POST' && url.pathname === '/start') {
        const data = await form(req);
        const secret = data.get('secret')?.trim();
        if (!secret || secret.length > 512 || session || result) return page(res, 409, '請重新啟動工具後再試。');
        const verifier = nonce();
        session = { secret, verifier, state:nonce(), started:Date.now() };
        const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        auth.search = new URLSearchParams({ client_id:clientId, redirect_uri:redirectUri, response_type:'code', scope,
          access_type:'offline', prompt:'consent', state:session.state, login_hint:'fcuasb2016@gmail.com',
          code_challenge:createHash('sha256').update(verifier).digest('base64url'), code_challenge_method:'S256' }).toString();
        res.writeHead(303, { Location:auth.href, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' });
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        // Consume once before any remote operation; failures never log the callback URL.
        const current = session;
        if (!current || Date.now() - current.started > 10 * 60_000 || url.searchParams.get('state') !== current.state) return page(res, 400, '授權狀態無效，請重新啟動。');
        session = undefined;
        if (url.searchParams.has('error') || !url.searchParams.get('code')) return page(res, 400, '授權未完成，請重新啟動。');
        const tokens = await json('https://oauth2.googleapis.com/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
          body:new URLSearchParams({client_id:clientId, client_secret:current.secret, code:url.searchParams.get('code'), code_verifier:current.verifier, redirect_uri:redirectUri, grant_type:'authorization_code'}) });
        if (!tokens.refresh_token) throw failure('NO_REFRESH_TOKEN');
        if (!tokens.access_token || !String(tokens.scope || '').split(' ').includes(scope)) throw failure('SCOPE_MISSING');
        result = { secret:current.secret, refreshToken:tokens.refresh_token, accessToken:tokens.access_token };
        res.writeHead(303, {Location:'/ready', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer'});
        return res.end();
      }
      if (req.method === 'GET' && url.pathname === '/ready' && result) {
        // Never render secrets on an automatically inspected page. Holder explicitly opens /credentials.
        return page(res, 200, `<p>Google 已回傳離線授權。尚未建立資料夾或啟用歸檔。</p><form method="post" action="/credentials"><input type="hidden" name="csrf" value="${csrf}"><button>由持有人顯示後端設定值（勿讓 Agent 讀取此頁）</button></form>`);
      }
      if (req.method === 'POST' && url.pathname === '/credentials' && result) {
        await form(req);
        return page(res, 200, `<p>請持有人自行填入 Supabase Edge Secrets；不要貼聊天、截圖或存入公開檔案。完成後停止此工具。</p>${Object.entries({ GOOGLE_DRIVE_CLIENT_ID:clientId, GOOGLE_DRIVE_CLIENT_SECRET:result.secret, GOOGLE_DRIVE_REFRESH_TOKEN:result.refreshToken }).map(([key,value]) => `<label>${key}<textarea readonly>${escape(value)}</textarea></label>`).join('')}<p>歸檔目的地尚未授權。既有資料夾需 Picker 授權，或由應用程式建立新資料夾；不可僅填既有 Folder ID 就認定可存取。</p>`);
      }
      return page(res, 404, '找不到頁面。');
    } catch (error) {
      session = result = undefined;
      const messages = {FORM_ORIGIN:'請由 http://localhost:8765/ 重新開啟表單，勿使用 127.0.0.1 或嵌入頁面。',FORM_FORMAT:'表單格式不符。',FORM_SIZE:'輸入過長，請只填 client_secret 的值。',FORM_EXPIRED:'表單已失效，請重新開啟首頁。',GOOGLE_CONNECTION:'本機無法連線 Google，請確認網路後重試。',OAUTH_CLIENT:'用戶端密鑰與此 Client ID 不符或已停用，請確認使用 dalusite 的新密鑰。',OAUTH_CODE:'授權碼已失效或重複使用，請重新授權。',OAUTH_REDIRECT:'GCP 返回網址與工具不符。',OAUTH_DENIED:'Google 拒絕授權。',GOOGLE_RESPONSE:'Google 回應未成功，請核對專案設定。',NO_REFRESH_TOKEN:'Google 沒有回傳 refresh token，請重新進行離線授權。',SCOPE_MISSING:'尚未授權 drive.file。'};
      const code = Object.hasOwn(messages, error.safeCode) ? error.safeCode : 'SETUP_FAILED';
      return page(res, 400, `<p>操作失敗：<strong>${code}</strong></p><p>${messages[code] || '請重新開啟首頁再試。'}</p><p>秘密已從工具狀態清除。只需回報上面的錯誤代碼，不要提供密鑰。</p><a href="/">重新開啟授權表單</a>`);
    }
  });
  const expiryTimer = setTimeout(() => { session = result = undefined; }, 20 * 60_000);
  expiryTimer.unref();
  server.on('close', () => { clearTimeout(expiryTimer); session = result = undefined; });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createSetupServer();
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.on('error', () => { console.error('無法啟動本機授權工具，請確認 8765 連接埠可用。'); process.exitCode = 1; });
  server.listen(8765, '127.0.0.1', () => console.log(`Drive setup: ${origin}/ (20 分鐘有效，Ctrl+C 清除記憶體中的秘密)`));
}
