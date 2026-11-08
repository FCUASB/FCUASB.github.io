# 影片封面與按需播放

2026-11-05。本次來源與本機產物已完成；正式同步狀態見文末紀錄。

## 訪客行為

- 2026-11-08 影片更新：保留原本首頁主視覺，將指定 YouTube 影片 `A3eFst6rHMQ` 放在主視覺下方、關於大呂上方的獨立紀念影片區塊。先顯示 16:9 封面，點擊才建立播放器，另保留 YouTube 原頁連結。切換頁面、開啟投稿／相簿／音樂會或其他影音時停止並恢復封面；播放影片也會關閉背景音樂。GitHub main 與 Pages 的發布結果須分別核對。
- 首頁回憶卡、回憶牆、相簿與驗收頁先顯示圖片封面。沒有建立遠端 video／iframe，也沒有設定其 src；開相簿仍不讀原片。
- 按「點擊播放影片」才建立 HTML video 或 YouTube iframe。原片沿用既有 Range 媒體入口，不新增轉檔或付費服務。開始播放後瀏覽器仍可預先緩衝，不能保證只下載觀看過的秒數。
- 切換附件、關閉相簿或離開音樂會詳情會停止並釋放播放器。背景音樂維持使用者點擊後才載入 n7mhsJLAsVk、單曲循環。
- 原片及封面仍使用私有 bucket 與逐次檢查下架的入口，不改為永久公開網址或長時間快取。

## 新投稿的封面

投稿者的瀏覽器從所選本機影片擷取約一秒處的一張影格，最長邊 640px，JPEG 品質 0.75，最多 256 KiB。這一步只讀本機 Blob。支援的影片會帶出正確寬高；解碼、擷取失敗或逾時時改用預設封面，不阻擋原片投稿。

先完成原片收件，再以同一個隨機收件 capability 取得 poster_ticket、上傳 JPEG、poster_complete 核對實際 Storage 大小與 MIME。封面使用原片路徑加 .poster.jpg，屬衍生檔，不占額外附件 slot，照片／影片／YouTube 合計最多 10 個的規則不變。

資料庫新增 attachments.poster_size_bytes、poster_ready；收件 key 的 24 小時期限、既有 RLS、service_role-only RPC 與管理角色均保留。封面僅適用已完成原片收件的影片；不同 capability、非影片、過大 JPEG、實際大小／MIME 不符及已下架原片均不可完成／公開封面。

封面上傳失敗時會說明使用預設封面，不把已收到的原片標成失敗。既有影片沒有自動回填快照，先用預設封面；訪客不會為了產生快照下載原片。既有 IndexedDB 不會上傳。

## 維護與同步

共用封面／播放器在 shared/video.js，首頁與 acceptance/app.js 由各自建置流程納入。不能只修改發布 HTML。

既有後端升級順序：

1. 唯讀核對指定專案、attachments 結構及 receive/list/upload/public_media 函式，與目前來源比較。
2. 審查並套用 supabase/setup/video-posters.sql。它由 npm run prepare:video-posters 從現行來源產生，只加兩個欄位、更新三個私人函式；不重跑 foundation.sql 或 cloud-api.sql，也不變更角色或 exposed schemas。
3. 部署本次 supabase/deploy/media.js，保持原有 Verify JWT 設定與環境值。
4. 通過 GitHub PR 檢查後同步兩份首頁與驗收頁。新前端對未提供 posterReady 的舊列表仍使用預設封面；完整快照收件須先完成後端升級。
5. 正式驗證新影片／封面收件、跨瀏覽器可見、原片 Range 與下架阻擋。不要把本機測試視為正式驗收。

復原時透過 PR 回退前端及 media 函式；兩個新增欄位可保留，舊程式會忽略。不要用 DROP、清 bucket 或還原整個資料庫回退這個功能。Drive worker 尚未啟用，本次沒有新增歸檔或 200 人負載承諾。

## 本機驗證

- npm run check、check:acceptance、check:edge、check:edge-bundle、check:cloud-sql、check:video-posters 通過。
- test:cloud 48、test:home 15、test:video 3 通過；跨命令有重複案例，不相加為唯一案例數。
- 以 localhost HTTP 模擬 API、Mozilla CC0 flower.mp4 做瀏覽器驗證，未送出正式投稿。實際封面為 21,984 bytes；主頁與開啟相簿後原片請求皆為 0 次／0 bytes，按播放後才出現 1 次原片請求，HTML video readyState=4、paused=false，無播放錯誤。關閉後 DOM 不再有 video。
- YouTube 回憶開相簿後 iframe 仍為 0；本次未驗證 YouTube 真實完整播放。
- 360／390／430／1280px 相簿與投稿表單均沒有橫向溢出；實際影片檔選取後產生本機封面預覽，表單內 video 為 0。
- 正式 Supabase 真實上傳、舊片封面回填、Safari／iPhone 實機、200 人負載、Drive 與備份還原尚未驗證。

## 2026-11-08 首頁下方紀念影片

- 依「原本的頁面要維持，在下面增加一個影片播放頁面」調整為主視覺下方的獨立區塊。原主視覺的高度、文字、按鈕與照片牆結構均恢復；沒有變更導覽方案。移除新增影片 section 後，整份 `template-original.html` 與本次工作前的 HEAD 完全一致；新增樣式只作用於 `.memorial-video`。
- 修改 `template-original.html`、`additions.css`、`archive.js`、`base-interaction.js`，並以 `npm run build` 同步根目錄及 `/handoff-v1.1/` 的 `index.html`。播放生命週期使用 `memorial-video-player` 與 `stopMemorialVideo()`，未修改內容資料、後端或權限。
- `npm run check` 通過（兩份發布檔一致、原版樣式、100 字／組合 emoji、時間軸與指定背景音樂等既有檢查）；`npm run test:video` 3 項及 `npm run test:home` 21 項通過。
- 以 HTTP 預覽實測 360／390／430／1280px，文件寬度皆未超過可視範圍；原主視覺內沒有播放器，影片區塊位於其後，影片寬度分別約 313／343／383／900px，封面及播放器維持 16:9，肖像保留自然比例。
- 影片置中：在 `additions.css` 明確設定區塊及播放器容器的 grid 置中，重新建置兩份首頁。360／390／430px 封面與播放後 iframe 的左右留白皆為 16px；1280px 皆約 182.4px，中心誤差小於 0.001px，沒有橫向溢出。`npm run build`、`npm run check` 通過。
- 點擊前 iframe 為 0；下方區塊點擊後桌面實播至 65.7 秒，390px 副本頁面也實播成功，`readyState=4`、`paused=false`、`error=null`。切頁後 iframe 為 0；開始背景音樂會停止影片並恢復封面，投稿表單亦會停止影片。390px 投稿彈窗寬約 352px，沒有橫向溢出；Enter 可啟動影片 iframe。
- 本機雲端公開內容未成功載入，因此未完成照片牆、回憶文字展開及相簿的瀏覽器驗收；本次沒有送出投稿，真實收件、跨裝置及 iPhone／Safari 未測。沒有推送、合併或發布。
- 同步界線：保留使用者截圖指定的首頁主視覺結構、標題、說明、紀念日期、投稿／音樂足跡按鈕、展映入口、音樂按鈕與照片牆；影片維持在其下方獨立區塊。截圖中的「示範」背景不是新增素材，公開影像仍沿用既有資料來源。2026-11-08 已取得同步 main 的授權，經 PR 檢查後合併；上列為本機驗證快照，發布狀態以 PR 與 Pages 結果為準。
- 同步前以遠端 main `997f863` 為基準另建 `codex/memorial-video-main`，只套用本次影片變更；原分支的兩筆既有紀錄／展映更新與未追蹤素材均保留。再次比對確認：移除影片 section 後的模板、移除影片專用樣式後的 CSS、照片牆與回憶繪製程式，以及 `content.json` 均與 main 一致。`npm run check`、影音 3 項、首頁 21 項、連線 3 項通過；連線測試須允許本機 loopback，沒有放寬檢查。

## 2026-11-08 播放問題追查與修正（本機、尚未發布）

- 網路追蹤確認 `127.0.0.1` 預覽已送出 Referer，YouTube 內嵌初始回應仍為 `previewPlayabilityStatus.status=UNPLAYABLE`、`reason=This video is unavailable`。同一份首頁、同一個 iframe URL 改由 `http://localhost:8000/` 開啟後，實測播放至 42.3 秒，`readyState=4`、`paused=false`、`error=null`。可確認本次失敗與本機來源網址相關，未查得 YouTube 內部判定規則。
- 修正 `scripts/serve.mjs`：數字 loopback IP 的 GET／HEAD 以 307 暫時轉址至 `localhost`，保留原路徑及查詢參數，使用設定的 PORT，不依賴外部或付費服務。播放器與正式網站網址不需因這個預覽問題更換；原頁連結、點擊後才載入、影音互斥與單曲循環均保留。
- 修正後根目錄與 `/handoff-v1.1/` 均可由 IP 網址自動轉至 `localhost`；瀏覽器驗證查詢參數與 `#memories` 保留。App 瀏覽器及 Chrome 皆實際播放成功（`readyState=4`、`paused=false`、`error=null`），360／390／430／1280px 持續播放且無橫向溢出。
- 切頁、Enter 再次啟動、背景音樂與影片互斥、開啟／關閉投稿表單均實測通過。只開頁時不建立影片 iframe，未送出投稿。
- `npm run check`、`git diff --check` 通過；8 項本機 HTTP 檢查通過，涵蓋根目錄／副本、保留查詢的 307 轉址、轉址後 200，以及既有 403／404／405。這是本機播放驗證，正式網域、完整全片、iPhone／Safari 及真實雲端收件仍未驗證；未推送、合併或發布。

## 2026-11-05 正式後端同步

依使用者「更改並同步」要求，已在指定專案 rikgchswpjaxlnhdrxtw 套用封面升級交易並部署 media。執行前，三個私人函式的正規化本文 MD5 均與 main 基準一致，原部署 media 程式長度及全文指紋亦一致；未以舊稿覆蓋不同的線上程式。

- 升級 SQL SHA256：91DE48E08B82454531D94B502DA2E4E5479C2D8A29A61781FCFFACA8308575E2。
- media 部署檔 SHA256：51D0E7612DD7B0D62B91383579D8FA0A82B23E6020C4B3A2DA7332828C991BF1。
- 交易成功，重查兩個新增欄位及三個函式本文與本次來源一致。attachments RLS=true、bucket public=false、匿名 RPC EXECUTE=false。未新增權限、秘密或服務。
- 原 media Verify JWT=false，維持程式內 capability、公開狀態與管理員驗證。
- 正式 API：超大 poster_ticket 回應 400 INVALID_POSTER_SIZE，公開列表 200；沒有建立測試投稿。
- 盤點當時沒有公開、ready 的上傳影片，因此沒有對舊影片下載或回填封面。這不代表新影片＋快照的正式實傳已驗收。
- GitHub PR、CI 與 Pages 發布結果完成後再補記。
