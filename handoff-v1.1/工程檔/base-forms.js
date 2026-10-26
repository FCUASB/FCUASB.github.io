const REL=['學生','團員','同事','朋友','家人','其他'];
const DEMO='<p class="demo-note">內容會保存在此瀏覽器，尚未同步至雲端。</p>';
const consent=id=>`<div class="row"><label class="check" for="${id}"><input type="checkbox" id="${id}" required><span>我確認自己有權使用與分享這些照片、影片及文字。</span></label></div>`;
const closeX='<button class="x" type="button" aria-label="關閉" data-close>×</button>';
const relChoices=pre=>`<div class="row"><label for="${pre}-rel">您與大呂的關係</label><select id="${pre}-rel"><option value="">選填</option>${REL.map(r=>`<option>${r}</option>`).join('')}</select></div>`;


function repRow(pre,i){return `<div class="rep" data-rep><div class="rh"><b>第 <span data-no>${i}</span> 首</b><button type="button" class="rm" data-rmrep>移除</button></div>
 <div class="two"><div class="row"><label for="${pre}-zh${i}">曲目中文名稱</label><input type="text" id="${pre}-zh${i}" autocomplete="off"></div><div class="row"><label for="${pre}-or${i}">曲目原文名稱</label><input type="text" id="${pre}-or${i}" autocomplete="off"></div></div>
 <div class="two"><div class="row"><label for="${pre}-co${i}">作曲家</label><input type="text" id="${pre}-co${i}" autocomplete="off"></div><div class="row"><label for="${pre}-ar${i}">編曲家</label><input type="text" id="${pre}-ar${i}" autocomplete="off"></div></div>
 <div class="two"><div class="row"><label for="${pre}-sr${i}">資料來源</label><select id="${pre}-sr${i}"><option>由參與者回憶提供</option><option>有節目冊可供核對</option></select></div><div class="row"><label for="${pre}-nt${i}">備註</label><input type="text" id="${pre}-nt${i}" autocomplete="off"></div></div></div>`}
function repBlock(pre){return `<div class="row"><span class="lab">演出曲目 <small>不知道完整曲目也沒關係，只填你記得的</small></span><div data-reps="${pre}">${repRow(pre,1)}</div><button type="button" class="btn ghost small" data-addrep="${pre}" style="justify-self:start">＋ 新增曲目</button></div>`}
function renumber(box){$$('[data-rep]',box).forEach((r,i)=>$('[data-no]',r).textContent=i+1)}

const uploadHTML=()=>`<form class="dlg simple-upload" id="f-up" novalidate>${closeX}<h2 id="up-h">留下我與大呂的回憶</h2><p class="lead">一句想念、一張照片、一段影片，都可以。</p>
 <div class="row"><label for="up-name">您的稱呼 <small>${ProjectCloud.enabled()?'必填，會公開顯示':'選填'}</small></label><input type="text" id="up-name" autocomplete="name" ${ProjectCloud.enabled()?'required':''} placeholder="${ProjectCloud.enabled()?'姓名或暱稱':'姓名或暱稱，留白則匿名'}"></div>
 <div class="row"><label for="up-story">想對大呂說的話 <small>選填</small></label><textarea id="up-story" rows="3" placeholder="大呂，還記得……"></textarea></div>
 <div class="row"><label class="media-pick" for="up-files"><span aria-hidden="true">＋</span> 加入照片／影片<span class="hint">可多選，也可以只留文字</span><input type="file" id="up-files" multiple accept="image/*,video/*"></label><div class="files" id="up-list" aria-live="polite"></div></div>
 <details class="upload-extra"><summary>補充年份、地點（選填）</summary>${relChoices('up')}<div class="two"><div class="row"><label for="up-y">年份</label><input type="number" id="up-y" min="1977" max="${new Date().getFullYear()}" inputmode="numeric" placeholder="不確定可留白"></div><div class="row"><label for="up-mo">月份</label><select id="up-mo"><option value="">不確定</option>${Array.from({length:12},(_,i)=>`<option>${i+1} 月</option>`).join('')}</select></div></div><div class="row"><label for="up-pl">地點</label><input type="text" id="up-pl" placeholder="例如：排練教室"></div><p class="hint">${ProjectCloud.enabled()?'單檔最多 50MB，超過限制的附件會顯示失敗；長影片建議貼 YouTube 連結。與 YouTube 合計最多 10 個附件。':'照片每張 25MB、影片每支 300MB 以內，最多 10 個。'}HEIC 與 MOV 需瀏覽器支援。</p></details>
 ${ProjectCloud.fields()}<p class="upload-note">${ProjectCloud.enabled()?'投稿文字及可用附件會公開；電話與 Email 不公開。':'請分享您有權使用的內容。此版先儲存在您的瀏覽器。'}</p><button class="btn gold" type="submit" id="up-send" style="width:100%">留下這份回憶</button></form>`;

const concertHTML=()=>`<form class="dlg" id="f-con" novalidate>${closeX}<h2 id="ac-h">新增音樂會</h2><p class="lead">先留下你記得的演出與曲目。</p>${DEMO}
 <div class="row"><label for="ac-t">音樂會名稱</label><input type="text" id="ac-t" required></div>
 <div class="two"><div class="row"><label for="ac-d">演出日期 <small>不確定請填大約日期</small></label><input type="date" id="ac-d" required></div><div class="row"><label for="ac-tm">演出時間 <small>選填</small></label><input type="time" id="ac-tm"></div></div>
 <div class="two"><div class="row"><label for="ac-p">演出地點</label><input type="text" id="ac-p" required></div><div class="row"><label for="ac-e">演出團體</label><input type="text" id="ac-e" required></div></div>
 <div class="two"><div class="row"><label for="ac-c">指揮</label><input type="text" id="ac-c"></div><div class="row"><label for="ac-h2">主辦單位 <small>選填</small></label><input type="text" id="ac-h2"></div></div>
 <div class="row"><span class="lab">海報、節目冊與照片 <small>選填，可多選</small></span><div class="drop"><input type="file" id="ac-files" multiple accept="image/*"><span class="hint">音樂會海報、節目冊封面與內頁、演出或排練照片</span></div><div class="files" id="ac-list"></div></div>
 ${repBlock('ac')}
 <div class="row"><label for="ac-s">這場音樂會，你最難忘的是什麼？</label><textarea id="ac-s" placeholder="排練的故事、演出時的心情、與大呂的互動……"></textarea></div>
 <div class="row"><label for="ac-n">您的姓名</label><input type="text" id="ac-n" required autocomplete="name"></div>${consent('ac-ok')}
 <button class="btn gold" type="submit" style="width:100%">儲存音樂會</button></form>`;

const contribHTML=c=>`<form class="dlg" id="f-ct" novalidate>${closeX}<h2 id="ct-h">補充這場音樂會的資料</h2><p class="lead">${esc(c.title)}（${fmtDate(c.date)}）</p>${DEMO}
 <div class="row"><span class="lab">你想補充什麼？</span><div class="choices">${['遺漏的曲目','演出照片','節目冊','演出者資訊','其他回憶'].map((t,i)=>`<label><input type="checkbox" value="${t}" ${i===0?'checked':''}>${t}</label>`).join('')}</div></div>
 ${repBlock('ct')}
 <div class="row"><span class="lab">照片或節目冊 <small>選填</small></span><div class="drop"><input type="file" id="ct-files" multiple accept="image/*"></div><div class="files" id="ct-list"></div></div>
 <div class="row"><label for="ct-s">其他想補充的內容</label><textarea id="ct-s"></textarea></div>
 <div class="row"><label for="ct-n">您的姓名</label><input type="text" id="ct-n" required autocomplete="name"></div>${consent('ct-ok')}
 <button class="btn gold" type="submit" style="width:100%">儲存補充</button></form>`;

const reportHTML=()=>`<form class="dlg" id="f-rp" novalidate>${closeX}<h2 id="rp-h">檢舉、更正或申請下架</h2><p class="lead">可先保存更正或下架需求，供之後交給管理員。這裡尚未連接收件後台。</p>${DEMO}
 <div class="row"><label for="rp-t">類型</label><select id="rp-t" required><option value="">請選擇</option><option>照片誤植</option><option>資料錯誤</option><option>要求移除照片或影片</option><option>音樂會資料需要修正</option><option>檢舉不適當內容</option></select></div>
 <div class="row"><label for="rp-d">說明 <small>請寫下是哪一張照片或哪一場音樂會</small></label><textarea id="rp-d" required></textarea></div>
 <div class="row"><label for="rp-c">聯絡方式 <small>選填，僅保存在此瀏覽器的回報草稿</small></label><input type="text" id="rp-c" autocomplete="email"></div>
 <button class="btn gold" type="submit" style="width:100%">儲存回報草稿</button></form>`;


