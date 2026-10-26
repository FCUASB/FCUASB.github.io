# 雲端操作進度

2026-10-24，依使用者建立及啟用服務授權操作。

- 校友團成員邀請後，Chrome 內 huyuhua33 已能進入 fcuasb 組織的 dalu.tw 專案（rikgchswpjaxlnhdrxtw）。AI Supabase 連接器仍回報無權限，瀏覽器與連接器授權分開。
- 專案顯示 Free／Nano、首爾區域；概覽顯示 Unhealthy，尚未確認原因。平台亦顯示正在調查技術問題，不推定兩者必然相關。
- Table Editor 未顯示既有資料表；未執行 SQL 盤點，不能視為所有 schema 均空白。
- Storage 原先顯示建立第一個 bucket 的畫面。已建立 submission-media，建立時 Public bucket 保持關閉，未新增政策或上傳內容。
- 建立後列表確認 submission-media 存在，Policies 0，大小顯示 Unset (50 MB)，MIME Any。此為目前服務限制，不代表已支援大型影片或無限容量；正式上傳仍待 API、驗證與權限實作。
- 尚未建立投稿資料表、網站管理員、角色、收件 API、Drive OAuth 或歸檔工作；未接通前端、修改付費方案或部署網站。不要再次建立同名 bucket。

下一步：診斷健康狀態，唯讀盤點 schema 與 Auth 設定，再準備資料表與角色權限實作。正式開放前需要完整驗收；200 人容量未驗證。

## 2026-10-24 Supabase 基礎設定更新

- 分支 codex/supabase-foundation，保留原有未提交修改。
- 直接進 SQL 頁曾顯示無專案權限；從 fcuasb 組織清單進入後恢復可用，概覽顯示 Healthy。未確認短暫異常根因，不宣稱已修復平台問題。
- 唯讀查詢確認 public／archive_private 中原先無一般資料表。已以交易建立 archive_private schema 及 admin_members、submissions、submission_contacts、attachments、archive_jobs、audit_events 六張表；SQL Editor 回報成功。
- 實際查詢六張表均 RLS=true，anon_access=false、user_access=false；兩種角色 schema USAGE=false。聯絡資料獨立表，角色尚未指定人員。
- 查詢確認 submission-media public=false，file_size_limit=NULL（沿用專案全域限制，不等於無上限）。未新增公開政策。
- 腳本與操作說明位於 supabase/setup/；CLI 未安裝，未建立或偽造 migration 歷史。後續導入 CLI 時需 pull 真實 schema 建立基準。
- npm run check 通過。無測試投稿或個資寫入。未升級方案、建立管理員憑證、啟用 passkey、部署 API 或接通 Drive；網站仍僅本機收件。
- 下一步是受控收件 API、三角色後端授權、管理員 Auth 設定與後台；資料基礎建表不等於上述功能完成。

## 雲端收件 API 本機開發

- 已新增 supabase/functions/intake/handler.mjs、index.ts、README.md、supabase/setup/intake-api.sql 及 scripts/intake.test.mjs；目前均未部署或套用。
- 邊界測試 4 組通過：格式及空內容、未啟用與驗證失敗不寫入、聯絡資料與錯誤不洩漏、串流大小上限。npm run check 通過。
- SQL 準備原子寫入與冪等鍵、公開欄位投影。高權限函式位於私人 schema，public 僅有受 service_role 限制的 invoker wrapper；仍待真實資料庫驗證。
- Turnstile 為提案，尚未建立或啟用；未配置 secrets 時端點保持拒絕收件。200 人壓測未執行；不得宣稱已正式接通。
- 遠端 main 查詢仍因 DNS 解析失敗，依本機分支開發。後續持續完成限流、附件、前端、後台、Drive 及驗收，不以本階段取代完整需求。

## 收件、附件及後台本機實作更新

- 使用者已確認 Turnstile 與正式 origin https://dalu.tw。Cloudflare 登入頁已開啟，等待校友團登入；未建立 widget 或取得秘密。
- 新增 admin-api.sql、rate-limits.sql、media-api.sql 與 admin／media Edge Functions。後端檢查即時角色與 auth.sessions，具搜尋、聯絡資料分權、編輯衝突防護、下架／恢復、檔案下載、匯出稽核及最後一位管理員保護。SQL 尚未套用遠端。
- 附件使用私有票證上傳，伺服器核對 Storage 大小與 MIME 後才公開；過大／不支援附件保存失敗紀錄，不丟棄文字與選填聯絡資料。原檔保留；未做影片轉檔。
- 新增 /admin/ 頁面，固定 SDK 版本，提供帳密及可選 passkey UI、搜尋、編輯、下架、下載、CSV 與角色管理。設定停用，沒有真實管理員帳號，尚未部署。
- 網站新增 cloud.js／cloud-config.json 並串入原來源，只有 enabled=true 才會讀寫雲端；本機 IndexedDB 不會自動上傳。已 build 同步兩份首頁。音樂會、補充、檢舉仍未接通雲端。
- 新增固定版本 PGlite、Deno、Supabase SDK、esbuild 及 lockfile；CI 增加 npm ci、cloud 測試、Edge 型別及後台一致性檢查。
- npm run test:cloud：14 組通過，含真實 PostgreSQL 核心 SQL 執行、權限／停權／session 撤銷、原子失敗回滾、重試、附件、分頁與不搬移本機內容。PGlite 不等於正式 Supabase 實測。
- npm run check:edge：intake／admin／media 入口通過 Deno 檢查。npm run build、check 通過；後台 build／一致性通過。
- HTTP 預覽：一開始沙箱伺服器無法供 Chrome 存取，提升本機服務執行權限後 8011 可用。後台停用畫面在 360／390／430／1280px 無橫向溢出。首頁投稿彈窗也於相同實際 viewport 檢查，pageWidth=viewport，dialogScroll=dialogClient；音樂 iframe 在未點擊前為 0。肖像素材自然尺寸 621×827。曾有一輪 viewport 套用到其他選定分頁，該輪不採計，已重新開啟選定網站分頁重測。
- 尚未測：雲端啟用 UI、正式登入與 passkey、真實附件、跨裝置、Drive、影音播放、200 人負載與備份還原。沒有提交測試投稿或正式資料。部署與完整待辦見 CLOUD-DEPLOYMENT.md。

## 2026-10-24 遠端 SQL 與首批管理員更新

- 經使用者明確同意，已在指定校友團專案套用 cloud-api.sql 原子交易；雜湊與驗證結果見 CLOUD-DEPLOYMENT.md。遠端表 9 張全部 RLS、訪客權限 0、7 個受限 wrapper，無投稿、無管理員角色，背景領取結果 null。
- Drive worker 及租約／重試／分塊續傳／固定 ID 防重複已本機實作；24 組 cloud 測試及四個 Edge 入口型別檢查通過。四份無外部 import、預設停用的 Edge 發布檔已建置，尚未部署。
- 使用者已指定首位與備援系統管理員，尚未寄邀請或授予角色，不將真實信箱寫入公開檔案。瀏覽器 Auth 列表顯示沒有使用者（頁腳 estimated 數量不採信）；Site URL 仍為 localhost:3000，須先完成返回網址與可用後台。
- 修正後台邀請連結的密碼設定流程，於 SDK 消耗 URL fragment 前保留 invite/recovery 類型；真實邀請與復原仍待實測。
- 提升網路權限後 git ls-remote 已成功：遠端 main 為 3b55be9ce86c26cf942f82aa861ac174c750ad37，本機 HEAD 為 5b15c4790ee8acd4445bf8a3f6eee3ded28912f0。未推送、合併或發布。

## 管理員邀請回歸與設定權限

- 再次確認 Supabase Auth Site URL、Save changes 與 Add URL 均為 disabled；不能以目前平台登入身分變更。已請校友團擁有者切換有權限的登入，未繞過限制或擴張個人平台權限。
- 新增 admin-client.test.mjs，實際執行後台來源於隔離環境，模擬 SDK 消耗 fragment 後的 invite/recovery 流程，確認不進入角色工作區；登出亦清除密碼設定與角色／歸檔／passkey 區塊。納入 test:cloud，後台重新建置與一致性通過。此測試不能取代實際寄信與瀏覽器 Auth 驗收。

## Auth 權限恢復與 Drive 完成確認

- 使用者回覆可操作後重新載入，Site URL 已可編輯、Add URL 已可使用；先前唯讀狀態已解除。已準備 https://dalu.tw/admin/，等待明確確認再儲存 Site URL 與精確 redirect allowlist，尚未寫入。
- 依 Google 官方 resumable upload 文件核對，修正 308 未完成卻聲稱收滿全部位元組時可能傳送空白尾塊的情況，拒絕提早回覆成功狀態造成的錯誤完成；新增對應回歸測試。官方來源：https://developers.google.com/workspace/drive/api/guides/manage-uploads#resumable 。
- 26 組 cloud 測試、四個 Edge 入口型別、Edge 發布檔一致性及 npm run check 通過；僅本機驗證，尚無真實 Drive 歸檔或正式收件。

## 已儲存 Auth 網址與網域核對

- 使用者明確同意後，已分別儲存精確 Redirect URL 與 Site URL 為 https://dalu.tw/admin/；未寄邀請、未建立角色、未開放投稿。
- 提升網路權限後 gh API 唯讀存取成功（先前沙箱 gh auth status 的失敗不能證明憑證已失效）。Pages API 顯示 built、main /、cname=null、HTTPS enforced。dalu.tw 首頁及 /admin/ 為 404，而 fcuasb.github.io 為 200。
- 新增本機 CNAME 作為網域發布準備；未推送或變更公開 Pages。待正式後台與雲端端點部署及驗收後才能寄送管理員邀請。

## Edge 部署準備

- 連接器 list_edge_functions 仍回覆無權限；Dashboard 已確認沒有既有函式，避免覆蓋未盤點的版本。
- 四份發布檔已建置並通過 26 組測試及型別檢查，intake 已填入 Dashboard 編輯器，尚未部署。已請使用者授權部署四個停用函式，平台 JWT 維持啟用；後續開放匿名收件仍須獨立設定及驗收。

## 四個 Edge Functions 已部署（停用）
- 經使用者明確授權，在校友團專案依序部署 intake、admin、media、archive-worker；各 Settings 畫面 Verify JWT with legacy secret 均為 1。未新增秘密、未啟用功能、未發布網站。
- 部署使用的本機發布檔 SHA256（尚未下載遠端原始碼逐位元比對）：
  - intake: 1e1eda16bc618d48efe91765181b7395da16a864722a8083a0036b41a300915d
  - admin: 1161e08a6b0a6ee0e432f86017a8c36c6de5e1fafaee11bacd1c611a9810e266
  - media: 395c5d96020dfe205edff09bf6b4a84c4b0e6f1b8773391ce647de1d5ee5079c
  - archive-worker: 547fec782fb8dd97d5520fba059247aafcd2f39c54ecadf738b19d3dc6ba66ec

- 遠端 Dashboard 以 POST {} 逐一測試，實際回應均為 503：intake=INTAKE_NOT_READY、admin=ADMIN_NOT_READY、media=MEDIA_NOT_READY、archive-worker=WORKER_NOT_READY。測試未寫入投稿或存取 Drive，證明目前部署拒絕執行，不能用來宣稱完整收件已通過。

## 雲端登入交接與登出請求取消

- 現場確認 Cloudflare 尚未登入；Google Cloud 目前登入個人帳號，未選到 dalu-512503。已開啟校友團 Google 新增登入頁及 Cloudflare 登入頁，等待持有人完成登入，不匯出 session、不變更帳戶權限。
- 後台新增每次登入期間的請求取消控制：登出先清畫面與取消資料請求，聯絡資料回應／CSV 分頁／附件下載在送出與接收後核對取消狀態，避免登出後舊請求重新使用新工作階段。
- 新增延遲回應回歸測試：模擬登出後傳輸仍返回聯絡資料，確認 API 拒絕該結果；兩組後台前端測試、build:admin、check:admin 與 npm run check 通過。未宣稱正式登入或真實瀏覽器下載已驗收。

## 操作紀錄查詢本機實作

- 新增 audit-api.sql 差異檔，不修改已部署 cloud-api.sql；系統管理員可依操作者、目標與動作查詢每頁 100 筆紀錄，不回傳 details 或聯絡資料。
- 新增 admin handler 驗證、RPC 分流與後台篩選／分頁；本機發布檔已重新建置，遠端 admin 尚未更新。
- 28 組 cloud 測試通過，包含 PostgreSQL 實際執行差異 SQL、一般管理員拒絕、session 過期拒絕、游標與私人快照隔離；型別、網站、後台、Edge bundle 及已部署 SQL 基準一致性檢查通過。新操作紀錄畫面的正式登入與手機 UI 仍待驗收。
- 使用者指示使用校友團 Chrome 設定檔；工具目前僅列出單一 Chrome，未揭露設定檔名稱，已請持有人連接正確設定檔的擴充功能。未將個人 Google 登入當作校友團授權。

## 2026-10-25 校友團設定檔與 Turnstile

- 新 Chrome 設定檔已連接，確認 Cloudflare、Google Cloud dalu-512503 與 Supabase 平台均使用校友團帳號；後續服務設定使用此連線。
- 經使用者明確同意，已建立 Turnstile widget「dalu.tw 投稿防濫用」，hostname dalu.tw、Managed、No pre-clearance，列表確認共有 1 個 widget。公開 site key 已設定，enabled 仍 false。未讀取或儲存 Secret key 於本機／聊天。
- 已在 Supabase Secrets 預填 TURNSTILE_SECRET_KEY 名稱，請持有人直接輸入與儲存 Value；尚未確認遠端存在此自訂秘密。
- Google Cloud 產品頁實際顯示 Drive API 已啟用，不需要重複啟用。OAuth app／scope／refresh token 與排程仍未完成。
- npm run build、check 通過，兩份 HTML 同步。未進行正式 Turnstile 投稿或跨裝置驗收。
- 已由遠端 main 3b55be9 建立隔離工作樹與 codex/dalu-domain 分支，提交 c7f0099 僅新增 CNAME；未推送、建立 PR、合併或發布。原工作區修改完整保留。

## 2026-10-25 Turnstile 後端秘密已確認

- 持有人回覆 done 後重新載入 Supabase Secrets，只投影資料表首欄名稱，確認 TURNSTILE_SECRET_KEY 存在；未取得或輸出秘密值，也未啟用投稿。
- Google Cloud dalu-512503 憑證清單確認無 OAuth 用戶端、無 API key、無服務帳戶；Drive API 已啟用仍不代表背景程式已獲 Drive 使用者授權。接續準備 OAuth 同意設定，不自動增加完整 Drive scope。

## 2026-10-25 網域修復 PR 已建立

- 經使用者明確同意，已推送 codex/dalu-domain 並建立 https://github.com/FCUASB/FCUASB.github.io/pull/6 ，已附加到本任務。
- gh pr view/diff 實際確認 OPEN、CLEAN，base main，僅 CNAME 新增一行 dalu.tw；無其他工作區開發內容。尚未合併或發布，需另行合併／發布授權及上線驗證。

## 2026-10-25 GCP OAuth 設定接續

- 校友團 dalu-512503 已有 Web OAuth Client dalusite，不另建立重複用戶端。持有人回覆已完成密鑰輪替；後續頁面僅檢查非秘密欄位，不讀密鑰、剪貼簿或 JSON。
- 經使用者確認，drive.file 已儲存，頁面回報「已儲存資料存取權變更」。沒有新增完整 Drive scope。
- 持有人完成測試名單後，頁面確認校友團帳號已存在；不重複新增、不修改其他既有測試使用者。
- 新增 scripts/drive-oauth-setup.mjs 與測試、docs/DRIVE-OAUTH-SETUP.md。一次性 localhost callback 具 state、PKCE、一次性 code、防跨來源 POST、Host 檢查、no-store 及 20 分鐘記憶體清除，不記錄憑證或 code；僅由持有人自行輸入密鑰及查看後端設定值。
- 已在 GCP 預填 http://localhost:8765/oauth/callback，尚未儲存。未取得 refresh token、未建立或授權 Drive 目的地、未啟用 worker 或排程。External Testing 仍需在正式歸檔前處理期限與發布要求。
- 兩組 loopback OAuth 安全測試及 npm run check 通過；Google 實際授權尚未驗收。原有工作區修改完整保留，無推送、合併或網站發布。

## 2026-10-26 真實驗收後端已啟用

- 經使用者明確同意，儲存六項驗收設定，intake/media 平台 JWT 關閉；admin 平台 JWT 及角色驗證維持，Drive worker 不啟用。
- 公開列表 200；空白投稿與附件請求 400；外來來源與無效 Turnstile 403；未登入 admin 401。有效寫入與附件上傳仍待正式驗收頁發布後實測。
- 已從 Dashboard 取得公開 publishable key 放入後台設定，無秘密金鑰進入前端。後台設定已準備啟用，操作紀錄因差異 SQL 尚未套用而以 auditEnabled=false 隱藏。未邀請或授權網站管理員。
- 已重用乾淨的隔離 worktree，基於遠端 main 80f71a7 建立 codex/cloud-acceptance，提交 45b0096，19 個新增檔案；兩份首頁無差異。固定版本獨立建置與一致性通過，尚未推送、建立 PR 或發布。

## 2026-10-26 驗收環境 PR 已建立

- 經使用者明確同意推送 codex/cloud-acceptance 並建立 https://github.com/FCUASB/FCUASB.github.io/pull/7 ，已附加至本任務。
- 遠端 PR 核對 OPEN、CLEAN，head 45b0096c108ea049f427d79626376c8b82d986cc，共 19 個新增檔案，首頁變更清單為空。尚未合併或發布；網站管理員邀請／角色及真實投稿仍待完成。

## 2026-10-26 PR #7 已合併發布與真實收件

- 使用者授權合併及推送後，已合併 PR #7，遠端 main=5ad53d5073f6548998019eff0c29b230b4a4e2f0；Pages 工作 40256205007 success，兩個正式入口 200。
- 真實合成文字＋PNG 已經正式表單收件，附件 ready、GET 200 並與原始檔逐位元一致；完整證據見 UPLOAD-ADMIN-VERIFICATION.md。尚待管理員帳號與編輯／下架驗收。
- 主工作區仍保留先前未提交開發修改；未把這些未審查修改一併推送。

## 2026-10-26 初次管理員邀請已送出

- 經使用者明確要求，已對先前指定的主要與備援管理員信箱分別執行 Supabase Auth Send invitation；兩個 Auth 帳號均已建立。信箱及 UUID 不寫入公開交接文件。
- 寄出前重新確認 Site URL 及唯一 redirect allowlist 為 https://dalu.tw/admin/；主要管理員詳情顯示 Invited at 與 Confirmation sent at，Confirmed at、Last signed in 尚空白。這是寄送操作成功的證據，不代表持有人已收到或完成設定。
- 密碼由持有人透過邀請連結自行設定，未由 Agent 建立、讀取或保存；網站 system_admin 角色綁定仍待確認與執行。

## 2026-10-26 首批網站系統管理員已授權

- 經使用者明確同意，在指定校友團專案以交易將兩位已邀請的 Auth UUID 綁定為 active=true 的 system_admin，執行前同時核對 UUID 與指定信箱相符。未變更 Supabase 平台成員權限。
- SQL 回傳兩筆 system_admin／true，並為每筆寫入 member.bootstrap 授權稽核。密碼仍由帳號持有人自行設定；不將真實信箱或 UUID 寫入本文件。
- 真實管理員登入、搜尋、編輯、下架與恢復仍須由持有人完成登入後驗收，不以資料庫角色綁定成功替代。

## 2026-10-26 下架同步問題核對與本機修正

- 使用者提供投稿編號後，唯讀資料庫確認該筆 deleted_at 已設定，並有 submission.visibility 稽核；公開列表已排除。未修改或恢復使用者投稿。後台全部篩選保留軟下架紀錄屬既定行為。
- 現行驗收頁沒有自動更新，已開頁面須手動重新讀取。已本機新增 10 秒可見頁面輪詢、切回頁面立即讀取與最後成功時間；失敗明示舊資料。修正共享客戶端的舊回應覆蓋新結果風險，未變內容不重繪影音 DOM，並清理送件成功後的附件進度文字。
- 6 項同步／共享客戶端測試、驗收發布檔一致性與 npm run build/check 通過。修正尚未推送或發布；首頁維持原有正式版本。

### 2026-10-26 同步修正已發布
- 經委託人同意，PR #8 已合併，main merge commit `ec71055fbad27d00dc5de476d6f3bff85cdba5e1`。
- Pages run 40261252943 success；驗收頁已出現每 10 秒更新與最後同步時間。
- 目標投稿 55c8877d-ae32-423e-83b2-a0b6b828b639 已軟刪除，公開列表不顯示；後台全部保留紀錄供恢復。
- 獨立同步測試 6/6 與本機雲端測試 32/32 通過。正式首頁未改；Drive、passkey、200 人負載仍未完成驗收。

### 2026-10-26 正式首頁已發布與回驗
- PR #9 已合併；main 85687fee9e81383288d9c56d97e6c1d4d089de02。兩項 CI 通過，Pages run 40263038304 success。
- 正式首頁真實送出合成文字與 PNG：370d564d-77ce-45cd-9989-efaf81b5364a，回傳投稿已收到；相簿可讀。
- 獨立 Chrome 看見相同合成投稿，圖片完整載入 32x32；不依賴同一瀏覽器本機資料。
- 使用者登入後台並下架該測試稿；兩個瀏覽器無手動刷新即移除投稿且關閉開啟中的相簿。後台依收件編號搜尋只回傳該一筆，顯示已下架。
- /handoff-v1.1/ 亦已載入新版並成功同步。新投稿雲端接入已發布；新增音樂會、補充、檢舉仍為本機資料。
- Drive、passkey、200 人負載與新影片實傳仍未完成驗收。不以單次照片成功推定容量驗收通過。
- 後台編輯合成稿並儲存成功，仍維持已下架；結果已補入 PR #9。

### 2026-10-26 音樂會與大呂生平分區（本機待授權）
- 使用者確認「個人資訊」指大呂生平；保留回憶投稿，新增音樂會與生平管理分區。
- 獨立 worktree 分支 codex/admin-catalog，本機提交 003ecd2（39 檔），未推送、未合併、未部署。
- 新增 catalog Edge Function、兩張私有 RLS 表及 service_role-only invoker RPC；沿用現有即時身份／角色檢查。系統／內容管理員可修改，資料整理員唯讀。
- 初始化沿用現有 content.json 的 42 筆音樂會及 1 份生平（21 筆事件），不改寫來源事實或既有投稿。
- 11 項 catalog／權限／SQL／介面測試及 8 項首頁回歸通過；build/check/proofread、獨立前端一致性及新函式 Deno check 通過。本機模擬 API 互動及 360/390/430/1280px 彈窗已核對。
- 遠端 Supabase connector 仍無權限；catalog-setup.sql 未套用、CATALOG_ENABLED 尚未設定，正式網站不受本次本機變更影響。
- 待當次授權後：先 inventory→套用 additive SQL→部署新 catalog（僅新函式 Verify JWT off，POST 保留內部 Auth＋角色驗證）→CATALOG_ENABLED=true→驗證API→推送PR→CI通過後合併→Pages→雲端回驗。詳見 worktree docs/CATALOG-MANAGEMENT.md。

### 2026-10-26 音樂會與大呂生平正式接通完成
- PR #10 已合併，main 7babc13f516e6220c0f51337ac02aea4ae28a376；CI 兩項通過，Pages run 40279544902 success。
- catalog SQL SHA256 24A0E3045CDB57B56F6A16A26A71B10CBA88A0F0873E0C7F21A840E9A979D459 已套用；新增兩張私有 RLS 表，匿名與 authenticated 不可直接讀表／RPC。42 場音樂會、1 份生平、21 筆事件已匯入。
- catalog 函式部署成功（bundle SHA256 5ED268E74766C2D3111EB3CA3BEAE0D9A20C0A31469FE496C88252BCED000EB2）；僅新函式 Verify JWT off，CATALOG_ENABLED=true。公開 GET 200，未登入 POST 401 LOGIN_REQUIRED。
- 正式後台三分區：回憶投稿、音樂會、大呂生平。系統管理員登入後可搜尋 42 場並讀取生平 21 事件。
- 合成場次 1792996064973 新增與編輯後，IAB 跨瀏覽器自動同步，來源註記可見。Chrome 原生確認視窗阻塞工具，由使用者按確定完成下架；公開 API 回到42場，詳情頁自動關閉，測試稿保留已下架與版本。
- 生平原文儲存成功，版本 1/2 可查；介紹、補充文字與 21 事件的 label/title/description/source/timelineOrder 全數與基準一致，未改寫事實。
- 兩份正式首頁200且 HTML相同。真人資料整理員、實際恢復公開、Advisor（介面 unavailable）、200人負載、Drive、passkey、影片實傳仍未驗收。
- 正式成果由隔離 worktree 的 codex/admin-catalog 交付，主工作區歷史開發草稿保留，未 pull/reset 覆蓋。
