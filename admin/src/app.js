import { mountCatalog } from './catalog.js';
import { createClient } from '@supabase/supabase-js';
const $ = id => document.getElementById(id);
const roleNames = { system_admin: '系統管理員', content_admin: '內容管理員', data_curator: '資料整理員' };
let catalogUI;
let client, config, session, profile, records = [], editing, cursor, generation = 0;
// Read the link type before the Auth SDK consumes and clears its fragment.
const linkType = new URLSearchParams(location.hash.slice(1)).get('type');
let passwordSetup = ['invite', 'recovery'].includes(linkType);
let privateRequests = new AbortController();
let auditCursor = null;
function showPasswordSetup() {
  clearPrivateUI(); $('login-panel').hidden = true; $('recovery-panel').hidden = false;
  notice(linkType === 'invite' ? '邀請已驗證，請自行設定管理員密碼。' : '請設定新密碼。');
}
function notice(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function button(text, action, className) { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', () => task(action, node)); return node; }
async function task(fn, target) { if (target) target.disabled = true; try { await fn(); } catch (error) { notice(error.message || '操作失敗，請重試。', true); } finally { if (target) target.disabled = false; } }
async function api(action, input = {}) {
  const lifetime = privateRequests.signal;
  const { data, error } = await client.auth.getSession();
  lifetime.throwIfAborted();
  if (error || !data.session) throw new Error('請重新登入。');
  session = data.session;
  const catalogAction=action.startsWith('catalog.');
  if(catalogAction&&(!config.catalogEnabled||!config.catalogEndpoint))throw Error('音樂會與生平管理尚未啟用。');
  const response = await fetch(catalogAction?config.catalogEndpoint:config.adminEndpoint, { method: 'POST', credentials: 'omit', redirect: 'error',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: config.publishableKey },
    body: JSON.stringify({ action:catalogAction?action.slice(8):action, input }), signal: AbortSignal.any([lifetime, AbortSignal.timeout(20000)]) });
  const body = await response.json();
  lifetime.throwIfAborted();
  if (!response.ok) {
    if ([401, 403].includes(response.status)) clearPrivateUI();
    const messages = { ACCESS_DENIED: '沒有操作權限，請聯絡系統管理員。', LOGIN_REQUIRED: '登入已失效，請重新登入。',
      CATALOG_NOT_READY: '音樂會與生平管理尚未啟用。', INVALID_CONTENT: '請檢查必填欄位、日期及來源網址。', EDIT_CONFLICT: '這筆資料已被其他人修改，請重新讀取後再編輯；填寫內容仍保留。', ADMIN_NOT_READY: '後台尚未啟用。', INVALID_CHANGE: '變更不符合規則，請檢查欄位；不能停用最後一位系統管理員。' };
    throw new Error(messages[body.error] || '服務暫時無法完成操作。');
  }
  return body.result;
}
function clearPrivateUI() {
  catalogUI?.clear();
  privateRequests.abort(); privateRequests = new AbortController();
  generation++; profile = null; records = []; editing = null; cursor = null;
  $('workspace').hidden = true; $('login-panel').hidden = false;
  for (const id of ['recovery-panel', 'members-panel', 'security-panel', 'archive-panel', 'audit-panel']) $(id).hidden = true;
  $('recovery-form').reset(); $('member-form').reset();
  for (const id of ['results', 'members', 'passkeys', 'archive-summary', 'archive-failures', 'audit-results']) $(id).replaceChildren();
  $('edit-dialog').close(); $('edit-form').reset(); $('identity').textContent = '請登入校友團授權的管理員帳號。';
}
async function enter() {
  profile = await api('profile');
  $('identity').textContent = `${roleNames[profile.role] || profile.role} · ${session.user.email || profile.userId}`;
  $('login-panel').hidden = true; $('workspace').hidden = false;
  $('export').hidden = !['system_admin', 'data_curator'].includes(profile.role);
  $('members-button').hidden = profile.role !== 'system_admin';
  $('audit-button').hidden = profile.role !== 'system_admin' || !config.auditEnabled;
  $('register-passkey').hidden = $('list-passkeys').hidden = !config.passkeysEnabled;
  catalogUI?.enter(); notice('已登入。'); await search();
}
async function search(next = false) {
  const current = ++generation;
  const input = { query: $('query').value.trim(), filter: $('filter').value, ...(next && cursor ? cursor : {}) };
  const data = await api('search', input); if (generation !== current) return;
  records = data; $('results').replaceChildren();
  if (!data.length) $('results').append(el('p', '沒有符合條件的投稿。'));
  for (const record of data) renderRecord(record);
  const last = data.at(-1); cursor = last ? { before: last.createdAt, beforeId: last.id } : null;
  $('next-page').hidden = data.length < 100;
  notice(`本頁 ${data.length} 筆。`);
}
function renderRecord(record) {
  const article = el('article'); article.append(el('h2', record.name), el('small', `${record.year || '年份未填'} · ${record.deletedAt ? '已下架' : '公開中'}`),
    el('p', record.body || '（無文字）'), el('p', record.id, 'id'), el('small', record.createdAt));
  const actions = el('div', null, 'actions');
  if (['system_admin', 'content_admin'].includes(profile.role)) {
    actions.append(button('編輯', async () => { editing = record; $('edit-name').value = record.name; $('edit-year').value = record.year || ''; $('edit-body').value = record.body; $('edit-dialog').showModal(); }),
      button(record.deletedAt ? '恢復公開' : '下架', async () => {
        await api('visibility', { id: record.id, updatedAt: record.updatedAt, deleted: !record.deletedAt }); await search();
      }, record.deletedAt ? '' : 'danger'));
  }
  if (['system_admin', 'data_curator'].includes(profile.role)) actions.append(button('查看聯絡資料', async () => {
    const contacts = await api('contacts', { id: record.id });
    const existing = article.querySelector('.contacts'); existing?.remove();
    article.append(el('p', `Email：${contacts?.email || '未填'}\n電話：${contacts?.phone || '未填'}`, 'contacts'));
  }));
  article.append(actions);
  for (const attachment of record.attachments || []) {
    const line = el('div', null, 'attachment');
    line.append(el('p', `${attachment.filename || attachment.youtubeId || '附件'} · ${attachment.status} · 歸檔：${attachment.archiveStatus || '尚無工作'}${attachment.deletedAt ? ' · 已下架' : ''}`));
    if (['system_admin', 'content_admin'].includes(profile.role)) line.append(button(attachment.deletedAt ? '恢復附件' : '下架附件', async () => {
      await api('attachment_visibility', { id: attachment.id, deleted: !attachment.deletedAt }); await search();
    }));
    if (attachment.source === 'upload' && attachment.status === 'ready') line.append(button('下載原始檔', async () => {
      const lifetime = privateRequests.signal;
      await api('profile'); lifetime.throwIfAborted();
      const response = await fetch(`${config.mediaEndpoint}/${encodeURIComponent(attachment.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.publishableKey }, credentials: 'omit', redirect: 'error',
        signal: AbortSignal.any([lifetime, AbortSignal.timeout(120000)]),
      });
      if (!response.ok) throw new Error('附件下載失敗，請確認權限或稍後重試。');
      const blob = await response.blob(); lifetime.throwIfAborted();
      const url = URL.createObjectURL(blob); const link = el('a');
      link.href = url; link.download = attachment.filename || attachment.id; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    article.append(line);
  }
  $('results').append(article);
}
function csvCell(value) { let text = String(value ?? ''); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text; return '"' + text.replaceAll('"', '""') + '"'; }
async function exportRecords() {
  const lifetime = privateRequests.signal;
  const rows = [['投稿編號', '署名', '文字', '年份', 'Email', '電話', '建立時間', '下架時間']];
  let pageCursor = {};
  for (;;) {
    lifetime.throwIfAborted();
    const page = await api('export', { query: $('query').value.trim(), filter: $('filter').value, ...pageCursor });
    lifetime.throwIfAborted();
    rows.push(...page.map(r => [r.id, r.name, r.body, r.year, r.email, r.phone, r.createdAt, r.deletedAt]));
    notice(`正在匯出 ${rows.length - 1} 筆……`);
    if (page.length < 100) break;
    const last = page.at(-1); pageCursor = { before: last.createdAt, beforeId: last.id };
  }
  lifetime.throwIfAborted();
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = el('a'); link.href = url; link.download = `投稿匯出-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice(`已匯出 ${rows.length - 1} 筆，檔案含選填聯絡資料，請妥善保存。`);
}
async function showAudit(next = false) {
  const result = await api('audit', { actorId: $('audit-actor').value.trim(), targetId: $('audit-target').value.trim(),
    action: $('audit-action').value.trim(), ...(next && auditCursor ? auditCursor : {}) });
  $('audit-results').replaceChildren();
  for (const event of result) $('audit-results').append(el('p', `${event.created_at} · ${event.actor_user_id || '訪客／系統'} · ${event.action} · ${event.target_id || '無目標編號'}`));
  if (!result.length) $('audit-results').append(el('p', '沒有符合條件的操作紀錄。'));
  const last = result.at(-1); auditCursor = last ? { before: last.created_at, beforeId: last.id } : null;
  $('audit-next').hidden = result.length < 100; $('audit-panel').hidden = false;
}
async function showMembers() {
  const members = await api('members'); $('members').replaceChildren();
  for (const member of members) $('members').append(button(`${member.user_id} · ${roleNames[member.role]} · ${member.active ? '啟用' : '停用'}`, async () => {
    $('member-id').value = member.user_id; $('member-role').value = member.role; $('member-active').checked = member.active;
  }));
  $('members-panel').hidden = false;
}
async function showArchive() {
  const result = await api('archive_status');
  const labels = { pending: '等待', running: '進行中', completed: '完成', failed: '失敗' };
  $('archive-summary').textContent = Object.entries(result.counts || {}).map(([state, count]) => `${labels[state] || state}：${count}`).join(' · ') || '尚無歸檔工作。';
  $('archive-failures').replaceChildren();
  for (const job of result.failures || []) {
    const line = el('p', `${job.submission_id} · ${job.job_kind === 'manifest' ? '投稿描述檔' : '附件'} · ${job.error_code} · 重試 ${job.attempts} 次 `);
    if (profile.role === 'system_admin') line.append(button('重新排程', async () => { await api('retry_archive', { id: job.id }); await showArchive(); }));
    $('archive-failures').append(line);
  }
  $('archive-panel').hidden = false;
}
async function showPasskeys() {
  const { data, error } = await client.auth.passkey.list(); if (error) throw new Error('無法取得 passkey，請確認專案已啟用。');
  $('passkeys').replaceChildren();
  for (const passkey of data || []) {
    const row = el('p', `${passkey.friendly_name || 'Passkey'} · ${passkey.created_at} `);
    row.append(button('移除', async () => {
      if (!confirm('移除此 passkey？請先確認還有其他登入方式。')) return;
      const { error } = await client.auth.passkey.delete({ passkeyId: passkey.id }); if (error) throw new Error('移除失敗。'); await showPasskeys();
    })); $('passkeys').append(row);
  }
  $('security-panel').hidden = false;
}
async function start() {
  config = await (await fetch('./config.json', { cache: 'no-store' })).json();
  if (!config.enabled || !config.publishableKey) { notice('管理後台尚未接通服務，請由維護者完成設定。'); $('login-form').querySelectorAll('button').forEach(b => b.disabled = true); return; }
  if (!/^https:\/\//.test(config.supabaseUrl) || !config.publishableKey.startsWith('sb_publishable_')) throw new Error('公開設定格式錯誤；此處只能使用 publishable key。');
  client = createClient(config.supabaseUrl, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: true, experimental: { passkey: !!config.passkeysEnabled } } });
  catalogUI=mountCatalog({api,task,notice,getRole:()=>profile?.role,enabled:!!config.catalogEnabled});
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') clearPrivateUI();
    if (event === 'PASSWORD_RECOVERY') { passwordSetup = true; showPasswordSetup(); }
    if (event === 'SIGNED_IN' && passwordSetup) showPasswordSetup();
  });
  $('passkey-login').hidden = !config.passkeysEnabled || !window.PublicKeyCredential;
  $('login-form').addEventListener('submit', event => { event.preventDefault(); task(async () => {
    const { error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    $('password').value = ''; if (error) throw new Error('登入失敗，請確認帳密及驗證狀態。'); await enter();
  }, $('login-form').querySelector('[type=submit]')); });
  $('passkey-login').onclick = () => task(async () => { const { error } = await client.auth.signInWithPasskey(); if (error) throw new Error('Passkey 登入未完成，請重試或使用帳密。'); await enter(); });
  $('register-passkey').onclick = () => task(async () => { await api('profile'); const { error } = await client.auth.registerPasskey(); if (error) throw new Error('Passkey 註冊未完成。'); notice('Passkey 已加入此帳號。'); });
  $('list-passkeys').onclick = () => task(showPasskeys);
  $('logout').onclick = () => task(async () => { clearPrivateUI(); const { error } = await client.auth.signOut(); if (error) throw new Error('畫面已清除，但伺服器登出未確認，請重試。'); });
  $('reset-password').onclick = () => task(async () => {
    if (!$('email').reportValidity()) return;
    const { error } = await client.auth.resetPasswordForEmail($('email').value.trim(), { redirectTo: `${location.origin}/admin/` });
    if (error) throw new Error('復原要求暫時無法完成。'); notice('若此信箱可復原，系統將寄送操作連結。');
  });
  $('recovery-form').onsubmit = event => { event.preventDefault(); task(async () => {
    const { error } = await client.auth.updateUser({ password: $('new-password').value }); $('new-password').value = '';
    if (error) throw new Error('密碼更新失敗。'); passwordSetup = false; $('recovery-panel').hidden = true; await client.auth.signOut(); clearPrivateUI(); notice('密碼已更新，請重新登入。');
  }); };
  $('search-form').onsubmit = event => { event.preventDefault(); task(() => search()); };
  $('next-page').onclick = () => task(() => search(true)); $('export').onclick = () => task(exportRecords, $('export'));
  $('members-button').onclick = () => task(showMembers);
  $('archive-button').onclick = () => task(showArchive);
  $('audit-button').onclick = () => task(() => showAudit());
  $('audit-form').onsubmit = event => { event.preventDefault(); task(() => showAudit()); };
  $('audit-next').onclick = () => task(() => showAudit(true));
  $('member-form').onsubmit = event => { event.preventDefault(); task(async () => {
    await api('set_role', { userId: $('member-id').value.trim(), role: $('member-role').value, active: $('member-active').checked }); await showMembers(); notice('角色已更新。');
  }); };
  $('cancel-edit').onclick = () => $('edit-dialog').close();
  $('edit-form').onsubmit = event => { event.preventDefault(); task(async () => {
    await api('edit', { id: editing.id, updatedAt: editing.updatedAt, name: $('edit-name').value, body: $('edit-body').value, year: $('edit-year').value ? Number($('edit-year').value) : null });
    $('edit-dialog').close(); await search();
  }); };
  const { data } = await client.auth.getSession();
  if (data.session) { if (passwordSetup) showPasswordSetup(); else await enter(); }
}
task(start);
