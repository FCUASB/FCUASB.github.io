// Bundled after the same cloud client used by the main website. No IndexedDB access.
let CLOUD_CONFIG;
const acceptedOrigin = location.origin === 'https://dalu.tw';
const MEM = [], mem = {};
const $ = (selector, root = document) => root.querySelector(selector);
const formValue = (form, id) => form.querySelector('#' + id)?.value.trim() || '';
const objectURL = blob => URL.createObjectURL(blob);
const releaseURL = url => URL.revokeObjectURL(url);
const buildWall = () => {};
const formError = (form, message) => { $('#form-error', form).textContent = message; };
const form = $('#f-up');
form._media = { items: [], disposed: false };
function node(tag, text) { const result = document.createElement(tag); if (text != null) result.textContent = text; return result; }
function renderMem() {
  const root = $('#records'); root.replaceChildren();
  for (const record of MEM.filter(record => record.n.startsWith('驗收'))) {
    const card = node('article');
    card.append(node('h3', record.n), node('p', record.story), node('code', record.cloudId));
    if (record.pendingAttachments) card.append(node('p', `${record.pendingAttachments} 個附件尚在處理`));
    for (const media of record.media) {
      if (media.youtube) { const link = node('a', '開啟 YouTube 測試影片'); link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(media.youtube); link.target = '_blank'; link.rel = 'noopener'; card.append(link); }
      else { const asset = node(media.type === 'video' ? 'video' : 'img'); asset.src = media.url; if (media.type === 'video') { asset.controls = true; asset.preload = 'metadata'; } else { asset.alt = '測試附件'; asset.loading = 'lazy'; } card.append(asset); }
    }
    root.append(card);
  }
  if (!root.children.length) root.append(node('p', '尚未讀到驗收投稿。'));
}
async function run(action) { try { await action(); } catch (error) { $('#status').textContent = error.message || '操作未完成。'; } }
async function start() {
  CLOUD_CONFIG = await (await fetch('./config.json', { cache: 'no-store' })).json();
  for (const endpoint of ['intakeEndpoint', 'mediaEndpoint']) if (new URL(CLOUD_CONFIG[endpoint]).origin !== 'https://rikgchswpjaxlnhdrxtw.supabase.co') throw Error('驗收設定的專案不符。');
  // The shared client expects an optional month select; it is not part of this test form.
  const month = node('select'); month.id = 'up-mo'; month.hidden = true; month.append(node('option', '未填')); form.append(month);
  $('#submission-fields').disabled = !ProjectCloud.enabled() || !acceptedOrigin;
  $('#status').textContent = !acceptedOrigin ? '請於正式 HTTPS 網址 https://dalu.tw/acceptance/ 驗收；本機預覽不會送件。' : ProjectCloud.enabled() ? '驗收頁已啟用；須通過實際收件與跨瀏覽器核對才能判定成功。' : '尚未啟用雲端驗收；目前不會送出資料。可先檢查端點。';
  $('#probe').onclick = () => run(async () => {
    const result = await fetch(CLOUD_CONFIG.intakeEndpoint, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
    $('#status').textContent = `收件端點 HTTP ${result.status}。` + (result.status === 401 ? '平台仍要求 JWT，匿名投稿尚不可用。' : result.status === 503 ? '後端尚未啟用。' : '此結果只代表端點回應，仍須送出測試。');
  });
  $('#refresh').onclick = () => run(async () => { if (!acceptedOrigin || !ProjectCloud.enabled()) throw Error('請先發布並開啟 https://dalu.tw/acceptance/ 驗收。'); await ProjectCloud.refresh(); $('#status').textContent = '已重新讀取雲端；請核對收件編號。'; });
  $('#up-files').onchange = () => run(async () => {
    const files = [...$('#up-files').files]; form._media.items = []; $('#files').replaceChildren(); if (files.length > 10) throw Error('最多選擇 10 個附件。');
    const items = []; $('#send').disabled = true; $('#new-test').disabled = true; $('#up-files').disabled = true;
    try { for (const file of files) items.push({ name: file.name, original: file, type: file.type.startsWith('image/') ? 'photo' : 'video', ...await ProjectCloud.prepareFile(file, file.type.startsWith('image/') ? 'photo' : 'video') }); }
    finally { $('#send').disabled = false; $('#new-test').disabled = false; $('#up-files').disabled = false; }
    form._media.items = items; $('#files').replaceChildren(...items.map(item => node('li', `${item.name} · ${item.original.size} bytes`)));
  });
  $('#new-test').onclick = () => { form.reset(); form._media.items = []; form._cloudFingerprint = null; form._cloudKey = null; $('#files').replaceChildren(); $('#receipt').textContent = ''; ProjectCloud.dispose(form); run(() => ProjectCloud.attach(form)); };
  form.onsubmit = event => { event.preventDefault(); run(async () => {
    if (!acceptedOrigin || !ProjectCloud.enabled()) throw Error('請先發布並開啟正式 HTTPS 驗收頁。');
    if (!formValue(form, 'up-name').startsWith('驗收')) throw Error('測試署名請以「驗收」開頭，方便後續辨識。');
    if (!formValue(form, 'up-story') && !formValue(form, 'up-youtube') && !form._media.items.length) throw Error('請填寫文字或選擇附件。');
    $('#submission-fields').disabled = true; $('#form-error').textContent = '';
    try { const result = await ProjectCloud.submit(form); $('#receipt').textContent = result.title + '\n' + result.message; }
    finally { $('#submission-fields').disabled = false; }
  }); };
  if (acceptedOrigin && ProjectCloud.enabled()) { await ProjectCloud.attach(form); await ProjectCloud.refresh(); }
}
run(start);
