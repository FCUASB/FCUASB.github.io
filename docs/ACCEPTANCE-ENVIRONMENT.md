# 雲端驗收入口

2026-10-26：使用者同意準備獨立雲端驗收頁與後台。驗收頁尚未發布；後端已於使用者明確同意後啟用。

## 檔案與操作

acceptance/index.html 為獨立入口，acceptance/config.json 與首頁設定分開；發布準備設定為 enabled=true；僅 https://dalu.tw 可送件，本機預覽不送件。執行 npm run build:acceptance 產生 app.js，npm run check:acceptance 核對。發布檔由原本 cloud.js 加上驗收介面來源組成，確保票證上傳、Turnstile、收件編號及列表流程與首頁使用同一程式。

本機 http://localhost:8011/acceptance/ 可預覽停用畫面。360、390、430 與 1280px 實測沒有橫向溢出；停用時表單不可送出，重新讀取顯示「驗收開關尚未啟用」。本輪尚未真實雲端送件。

此頁不是獨立資料庫或保密測試區：投稿寫入同一校友團專案，公開 API 投影可被讀取。署名以「驗收」開頭僅方便畫面篩選，不是授權控制；只使用合成素材，不填聯絡資料。正式首頁 enabled 保持 false，但未來首頁接通前仍應整理測試紀錄，避免誤顯示為正式回憶。

## 待啟用設定

經使用者明確同意，已在 Supabase Dashboard 儲存：INTAKE_ORIGINS 與 ADMIN_ORIGINS=https://dalu.tw，INTAKE_ENABLED、MEDIA_ENABLED、ADMIN_ENABLED=true，MAX_UPLOAD_BYTES=52428800。intake/media 的平台 JWT 已關閉，依賴程式內檢查；admin/worker 的平台 JWT 保持啟用。admin 保留登入與角色檢查；archive-worker 不啟用。

只有來源限制並不能限制呼叫者身分；端點開放後可被直接呼叫。免登入寫入依賴 Turnstile 與限流；附件依賴收件 capability，公開附件逐次核對下架。不得將驗收頁網址不出現在導覽視為安全控制。

## 後續驗收

先確認端點可讀與錯誤請求受阻，再發布驗收頁、完成兩位管理員邀請與角色綁定。以合成文字、照片與 YouTube 測試收件，於另一獨立瀏覽器核對同一收件編號，管理員搜尋、編輯、下架後核對公開存取失效。Drive、passkey、備份及 200 人負載另行驗收，不能因本頁可投稿就標示全部通過。

## 2026-10-26 啟用後實測

公開列表 200（空列表）、空白收件 400 INVALID_IDEMPOTENCY_KEY、外來 Origin 403 ORIGIN_DENIED、附件空白請求 400 INVALID_INPUT、無效 Turnstile token 403 CHALLENGE_FAILED、未登入 admin 401 Missing authorization header。尚未建立真實投稿，不能據此宣稱有效附件上傳已通過。

獨立分支 codex/cloud-acceptance 本機提交 45b0096，基於最新 main 80f71a7，共 19 個新增檔案。只包含驗收頁、後台、共用 cloud.js 與獨立固定版本建置工具；兩份首頁無差異。獨立 npm ci 與建置一致性檢查通過；曾發現 Windows 換行差異，已正規化並重驗，未放寬檢查。尚未推送或發布。
