# 雲端收件部署與驗收清單

> 2026-10-26 整合註記：本文件保留各階段規劃／驗收快照。正式首頁雲端收件、音樂會／生平及原有公開回憶後台管理已發布；最新狀態與本次整合限制見 [整合驗證紀錄](INTEGRATION-STATUS.md)，不以歷史「尚未接通」描述覆蓋目前程式。

2026-10-24。資料庫結構與受限 API SQL 已套用遠端；四個 Edge Functions 已部署；intake/media/admin 已獲准啟用驗收，worker 停用，管理員與驗收頁發布尚未完成；詳見 CLOUD-PROGRESS.md。此文件不是發布授權。

## 本機檢查

使用 Node.js 24，先 npm ci。執行 npm run test:cloud、npm run check:edge、npm run build:admin、npm run check:admin、npm run build、npm run check。

固定版本依賴與 package-lock.json 一起保留。PGlite 用於執行 PostgreSQL SQL 測試，不能代替真實 Supabase Auth／Storage 與跨裝置驗收。Deno 用於 Edge 入口型別及模組檢查。CI 會執行新增檢查。

## SQL 與權限

遠端 foundation.sql 與 cloud-api.sql 均已套用，不要重跑。cloud-api.sql 為五份來源（含 archive-queue.sql）的原子交易組合，部署 SHA256 為 E377FB3BEAFB04CFFDC106959644A816F930A9C9AC00FB97FEBFE6500B60B055。後續變更應新增差異腳本，不改寫已部署基準。遠端驗證：9 張私人表均有 RLS、訪客表存取為 0、7 個 public wrapper 均為 invoker 且僅 service_role 可執行；投稿及管理角色目前各 0 筆。

新 SQL 包含私人 schema 內的高權限函式及 public 的 invoker wrapper，只授權 service_role 執行；不把 archive_private 暴露給 Data API。瀏覽器不能持有管理金鑰。部署時確認 Data API 對服務端 wrapper 的可見性，不因查詢失敗而授予 anon／authenticated 權限。

初始限流為每分鐘請求 6000、收件 600、上傳票證 2400、管理操作 1200，為可調整的全站保護值，不是效能承諾，也不是依 IP 判定個人身分。公共媒體讀取會逐次檢查下架狀態；進行中的串流及已下載副本無法撤回。

## Edge Functions

- intake：新文字／YouTube／附件清單收件、公開分頁列表。免登入，需要後端 Turnstile 驗證才能寫入。
- media：憑收件 capability 取得附件票證、核對 Storage 實際大小與 MIME、完成或標記失敗；公開 GET 每次查詢下架狀態，不發永久公開讀取 URL。管理員可帶已驗證 session 下載私有原檔。
- archive-worker：受獨立 secret 保護的 Drive 分塊歸檔工作，預設停用；OAuth 與排程尚未接通。
- admin：先向 Supabase Auth 驗證 token，再在同次資料庫操作中查詢有效 session 及即時角色；不信任 caller 提供的 actor 或 user_metadata。

2026-10-26 經使用者確認，intake/media 平台 Verify JWT 已關閉並啟用功能，admin 啟用功能但維持平台 JWT 與 handler 驗證，worker 維持停用。免登入 intake／media 需要明確設定平台 JWT 規則；admin 保留平台驗證並由 handler 再驗證。不得為處理單一 401 而關閉全部端點驗證。

後端秘密／環境：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（僅後端）、TURNSTILE_SECRET_KEY、INTAKE_ORIGINS=https://dalu.tw、ADMIN_ORIGINS=https://dalu.tw、MAX_UPLOAD_BYTES。

INTAKE_ENABLED、MEDIA_ENABLED、ADMIN_ENABLED 程式預設關閉，目前已經使用者明確核准在指定專案設為 true 以進行端到端驗收；這不等於驗收通過。最大檔案大小必須與 Storage 專案及 bucket 的實際限制一致；目前以 50 MiB 為程式預設。過大的附件會保存為失敗紀錄，文字仍收件，不能誤稱檔案已收到。照片在雲端模式保留原檔；本機模式仍依既有規則壓縮。

## Turnstile 與公開設定

使用者已確認採用 Turnstile、正式來源 https://dalu.tw。2026-10-25 已在校友團帳號建立「dalu.tw 投稿防濫用」widget：hostname dalu.tw、Managed、Pre-clearance 關閉。公開 site key 已寫入工程檔 cloud-config.json 並同步兩份 HTML，enabled 仍為 false。widget action 使用 memory-submit。TURNSTILE_SECRET_KEY 已由持有人直接存入 Supabase Edge secrets，2026-10-25 已核對名稱存在，未讀取值；不能貼入聊天或提交 secret。

前端 cloud-config.json 的 enabled 保持 false，直到遠端可用後才啟用並執行 build 同步兩份首頁。端點僅供新投稿使用，無 IndexedDB 自動匯入。

## 管理員與 passkey

後台位於 /admin/，來源 admin/src/app.js，發布 admin/app.js。admin/config.json 僅存 publishable key、專案 URL、端點及功能開關；預設停用。沒有網站管理員帳號不能靠 Supabase 平台會員身分自動登入後台。

校友團已指定首位及備援系統管理員（信箱僅留於對話，不提交公開 repository）；已於 2026-10-26 完成 Auth 邀請與私人 admin_members 的 system_admin 啟用綁定，密碼由持有人設定，不能把帳密寫進 SQL。之後 system_admin 可管理既有使用者角色，後台尚未提供邀請新 Auth 使用者的 UI。

管理員以各自帳號登入，session 僅在頁面記憶體，重新整理通常需重新登入；不持久保存到 localStorage。忘記密碼使用 Auth 復原信，需設定可用 SMTP 與 https://dalu.tw/admin/ redirect allowlist。復原、邀請與首位管理員流程仍待真實驗收。

passkey 程式依官方 SDK 實作，但維持 passkeysEnabled=false。正式啟用前設定 RP ID dalu.tw、允許 origin https://dalu.tw、既有已確認管理員帳號及備援方式。實驗性功能、裝置遺失與跨裝置登入尚未驗證；不得宣稱已啟用。

## 未完成及正式上線門檻

- Drive worker、租約、重試、固定檔案 ID 防重複及資料夾管理已完成本機實作與測試；OAuth 授權、排程部署、真實 Drive 實測與外部告警尚未完成。
- 音樂會新增、補充、檢舉仍是既有本機流程；第一條雲端流程是新回憶，不可用其通過證明所有表單已接通。
- 後台邀請新帳號與進階來源校訂仍需補齊。操作紀錄的系統管理員查詢已本機實作；audit-api.sql 為尚未套用的獨立差異檔，admin 函式與前端亦須更新部署，不能視為遠端已可查詢。
- 瀏覽器關閉時未完成的附件可能留在 pending，需背景逾時整理。收件憑證只在目前表單，不宣稱跨裝置續傳或永續查件。
- 實際跨裝置讀寫、RLS／session／角色撤權、Storage 超限與下架、Google 權限、復原與備份還原需實測。
- 200 人壓測依使用者要求暫不執行；任何本機測試均非負載承諾。
- 未授權前不推送、合併或公開部署。先完成可審查成果，再由持有人核准具體外部權限與發布變更。

## 首批管理員啟用順序

Auth URL Configuration 已經使用者核准，Site URL 與唯一精確 Redirect URL 均設為 https://dalu.tw/admin/。應先完成正式 /admin/ 部署、SMTP、Site URL 與精確 redirect allowlist，再分別寄送邀請。受邀者自行設定密碼；以 Auth UUID 綁定兩位 system_admin，確認第二位可登入後驗證備援與最後管理員保護。邀請及授權不等於加入 Supabase 平台組織。

## 正式網域發布前檢查

2026-10-24 實測：dalu.tw 的四個 A 記錄已指向 GitHub Pages，NS 為 cyberdns.tw；HTTPS 首頁與 /admin/ 均回應 404。GitHub Pages API 顯示 main / 根目錄已 built、cname=null、https_enforced=true，fcuasb.github.io 首頁為 200。這證明 DNS 已指向主機，但尚未完成 Pages 自訂網域綁定。

已準備根目錄 CNAME，內容 dalu.tw；僅本機檔案，尚未推送、合併或變更 Pages 設定。發布時核對已提交的 CNAME、Pages custom domain、DNS 檢查與 HTTPS 憑證，確認 / 和 /admin/ 實際 200，才啟用正式邀請。不可因 Supabase 返回網址已儲存而略過此步。

## 待部署差異：操作紀錄

audit-api.sql 新增僅 service_role 可執行的 invoker wrapper，私人函式重用既有即時成員與 session 檢查，僅 system_admin 可查詢時間／操作者 UUID／動作／目標 UUID。回應不含 details，以免擴大內容快照及聯絡資料存取。支援精確篩選與時間＋UUID 游標，最多 100 筆，附排序索引。

本機 admin 發布檔已更新，遠端 admin 仍是先前部署版本（SHA256 1161e08a6b0a6ee0e432f86017a8c36c6de5e1fafaee11bacd1c611a9810e266）。需先核准並套用 audit-api.sql，再更新 admin 函式及靜態後台；不得因本機重新 build 就宣稱遠端已更新。
