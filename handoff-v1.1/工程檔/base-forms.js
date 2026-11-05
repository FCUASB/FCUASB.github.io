const REL=['學生','團員','同事','朋友','家人','其他'];
const DEMO='<p class="demo-note">內容會保存在此瀏覽器，尚未同步至雲端。</p>';
const consent=id=>`<div class="row"><label class="check" for="${id}"><input type="checkbox" id="${id}" required><span>我確認自己有權使用與分享這些照片、影片及文字。</span></label></div>`;
const closeX='<button class="x" type="button" aria-label="關閉" data-close>×</button>';
const relChoices=pre=>`<div class="row"><label for="${pre}-rel">您與大呂的關係</label><select id="${pre}-rel"><option value="">選填</option>${REL.map(r=>`<option>${r}</option>`).join('')}</select></div>`;


function repRow(pre,i){return `<div class="rep" data-rep><div class="rh"><b>第 <span data-no>${i}</span> 首</b><button type="button" class="rm" data-rmrep>移除</button></div>
 <div class="two"><div class="row"><label for="${pre}-zh${i}">曲目中文名稱</label><input type="text" id="${pre}-zh${i}" autocomplete="off"></div><div class="row"><label for="${pre}-or${i}">曲目原文名稱</label><input type="text" id="${pre}-or${i}" autocomplete="off"></div></div>
 <div class="two"><div class="row"><label for="${pre}-co${i}">作曲家</label><input type="text" id="${pre}-co${i}" autocomplete="off"></div><div class="row"><label for="${pre}-ar${i}">編曲家</label><input type="text" id="${pre}-ar${i}" autocomplete="off"></div></div>
</div>`}
function repBlock(pre){return `<div class="row"><span class="lab">演出曲目 <small>不知道完整曲目也沒關係，只填你記得的</small></span><div data-reps="${pre}">${repRow(pre,1)}</div><button type="button" class="btn ghost small" data-addrep="${pre}" style="justify-self:start">＋ 新增曲目</button></div>`}
function renumber(box){$$('[data-rep]',box).forEach((r,i)=>$('[data-no]',r).textContent=i+1)}

const uploadHTML=()=>`<form class="dlg simple-upload" id="f-up" novalidate>${closeX}<h2 id="up-h">留下我與大呂的回憶</h2><p class="lead">一句想念、一張照片、一段影片，都可以。</p>
 <div class="row"><label for="up-name">您的稱呼 <small>${ProjectCloud.enabled()?'必填，會公開顯示':'選填'}</small></label><input type="text" id="up-name" autocomplete="name" ${ProjectCloud.enabled()?'required':''} placeholder="${ProjectCloud.enabled()?'姓名或暱稱':'姓名或暱稱，留白則匿名'}"></div>
 <div class="row"><label for="up-story">想對大呂說的話 <small>選填</small></label><textarea id="up-story" rows="3" placeholder="大呂，還記得……"></textarea></div>
 <div class="row"><label class="media-pick" for="up-files"><span aria-hidden="true">＋</span> 加入照片／影片<span class="hint">可多選，也可以只留文字${ProjectCloud.enabled()?'<br>單檔最多 '+ProjectCloud.uploadLimitLabel():''}</span><input type="file" id="up-files" multiple accept="image/*,video/*" aria-describedby="up-file-limits up-file-error"></label><p class="hint" id="up-file-limits">${ProjectCloud.enabled()?'照片、影片單檔最多 '+ProjectCloud.uploadLimitLabel()+'；與 YouTube 連結合計最多 10 個附件。超過上限請縮小檔案，或改填下方的 YouTube 影片連結。':'照片每張 25MB、影片每支 300MB 以內，最多 10 個檔案。'}</p><p class="form-error" id="up-file-error" data-file-error role="alert" hidden></p><div class="files" id="up-list" aria-live="polite"></div></div>
 <details class="upload-extra"><summary>補充年份、地點（選填）</summary>${relChoices('up')}<div class="two"><div class="row"><label for="up-y">年份</label><input type="number" id="up-y" min="1977" max="${new Date().getFullYear()}" inputmode="numeric" placeholder="不確定可留白"></div><div class="row"><label for="up-mo">月份</label><select id="up-mo"><option value="">不確定</option>${Array.from({length:12},(_,i)=>`<option>${i+1} 月</option>`).join('')}</select></div></div><div class="row"><label for="up-pl">地點</label><input type="text" id="up-pl" placeholder="例如：排練教室"></div><p class="hint">${ProjectCloud.enabled()?'單檔最多 '+ProjectCloud.uploadLimitLabel()+'，超過時請縮小檔案或改貼 YouTube 連結。與 YouTube 合計最多 10 個附件。':'照片每張 25MB、影片每支 300MB 以內，最多 10 個。'}HEIC 與 MOV 需瀏覽器支援。</p></details>
 ${ProjectCloud.fields()}<p class="upload-note">${ProjectCloud.enabled()?'投稿文字及可用附件會公開；電話與 Email 不公開。':'請分享您有權使用的內容。此版先儲存在您的瀏覽器。'}</p><button class="btn gold" type="submit" id="up-send" style="width:100%">留下這份回憶</button></form>`;

const concertHTML=()=>`<form class="dlg" id="f-con" novalidate>${closeX}<h2 id="ac-h">新增音樂會</h2><p class="lead">先留下你記得的演出與曲目。送出後會直接公開，並標示「親友新增，尚未核對」。</p>
 <div class="row"><label for="ac-t">音樂會名稱</label><input type="text" id="ac-t" required></div>
 <div class="two"><div class="row"><label for="ac-d">演出年份／日期</label><input type="text" id="ac-d" required maxlength="10" placeholder="2008、2008-05 或 2008-05-18" aria-describedby="ac-date-hint"><p class="hint" id="ac-date-hint">只記得年份或月份也可以，請勿補上不確定的月日。</p></div><div class="row"><label for="ac-tm">演出時間 <small>選填</small></label><input type="time" id="ac-tm"></div></div>
 <div class="row"><label for="ac-date-note">日期待核對註記 <small>選填</small></label><input type="text" id="ac-date-note" placeholder="例如：可能是暑假，確切日期待查節目冊"></div>
 <div class="two"><div class="row"><label for="ac-p">演出地點</label><input type="text" id="ac-p" required></div><div class="row"><label for="ac-e">演出團體</label><input type="text" id="ac-e" required></div></div>
 <div class="two"><div class="row"><label for="ac-c">指揮</label><input type="text" id="ac-c"></div><div class="row"><label for="ac-h2">主辦單位 <small>選填</small></label><input type="text" id="ac-h2"></div></div>
 ${repBlock('ac')}
 <div class="row"><label for="ac-s">這場音樂會，你最難忘的是什麼？</label><textarea id="ac-s" placeholder="排練的故事、演出時的心情、與大呂的互動……"></textarea></div>
 <div class="row"><label for="ac-n">您的姓名</label><input type="text" id="ac-n" required autocomplete="name"><p class="hint">姓名會公開顯示。照片與節目冊暫不開放上傳。</p></div>${consent('ac-ok')}
 ${ProjectVisitor.fields('送出後立即公開，管理員可下架；請勿填寫電話、Email 或他人隱私。')}
 <button class="btn gold" type="submit" style="width:100%">公開這場音樂會</button></form>`;

const contribHTML=c=>`<form class="dlg" id="f-ct" novalidate>${closeX}<h2 id="ct-h">補充這場音樂會的資料</h2><p class="lead">${esc(c.title)}（${esc(c.dateLabel||fmtDate(c.date))}）</p><p class="hint">補充會顯示在這場音樂會的「親友補充」，不會改動原有紀錄。</p>
 ${repBlock('ct')}
 <div class="row"><label for="ct-s">其他想補充的內容</label><textarea id="ct-s"></textarea></div>
 <div class="row"><label for="ct-n">您的姓名</label><input type="text" id="ct-n" required autocomplete="name"><p class="hint">姓名會公開顯示。照片與節目冊暫不開放上傳。</p></div>${consent('ct-ok')}
 ${ProjectVisitor.fields('送出後立即公開，管理員可隱藏；請勿填寫電話、Email 或他人隱私。')}
 <button class="btn gold" type="submit" style="width:100%">公開這份補充</button></form>`;

const reportHTML=()=>`<form class="dlg" id="f-rp" novalidate>${closeX}<h2 id="rp-h">檢舉、更正或申請下架</h2><p class="lead">回報只會送給網站管理員，不會公開顯示。</p>
 <div class="row"><label for="rp-t">類型</label><select id="rp-t" required><option value="">請選擇</option><option>照片誤植</option><option>資料錯誤</option><option>要求移除照片或影片</option><option>音樂會資料需要修正</option><option>檢舉不適當內容</option></select></div>
 <div class="row"><label for="rp-d">說明 <small>請寫下是哪一張照片或哪一場音樂會</small></label><textarea id="rp-d" required></textarea></div>
 <div class="row"><label for="rp-c">聯絡方式 <small>選填，僅管理員可見</small></label><input type="text" id="rp-c" autocomplete="email"></div>
 <div class="row"><label for="rp-n">您的姓名</label><input type="text" id="rp-n" required autocomplete="name"></div>${consent('rp-ok')}
 ${ProjectVisitor.fields('回報不會公開；請勿在說明裡填寫不必要的個人資料。')}
 <button class="btn gold" type="submit" style="width:100%">送出給管理員</button></form>`;


