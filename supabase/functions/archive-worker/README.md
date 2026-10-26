# Google Drive 歸檔工作程式

目前僅本機實作與測試，尚未取得校友團 OAuth、部署或排程，未上傳任何素材。

每次呼叫以獨立後端 secret 驗證，領取一件兩分鐘租約的工作，最多傳四個 4 MiB 區塊後保存進度並重新排程。來源為私有 Storage，目的地限定設定的 Google Drive 根資料夾。工作及上傳 URL 只存在私人 schema，不傳給公開網站或後台狀態列表。

Drive 使用預先產生並持久保存的檔案 ID。上傳前確認原檔是否已完成，重試不重新產生檔案；描述檔使用同一檔案 ID 更新。租約 token 阻止舊 worker 更新新工作的狀態。描述檔 revision 變動會重新排程，避免把舊快照標成最新版本已完成。

每則投稿建立日期＋投稿 ID 資料夾，存原始附件與 submission.json（署名、文字、時間、情境、附件 ID／原始檔名／狀態／Drive 對應及 YouTube ID）。電話與 Email 不寫入 Drive。原檔名保留於描述檔；實體檔名使用附件 ID。沒有權限變更或公開分享 API 呼叫。

## 設定

環境：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、GOOGLE_DRIVE_CLIENT_ID、GOOGLE_DRIVE_CLIENT_SECRET、GOOGLE_DRIVE_REFRESH_TOKEN、DRIVE_FOLDER_ID、ARCHIVE_WORKER_SECRET（至少 32 字元的隨機秘密）。ARCHIVE_ENABLED 預設 false。

校友團的 My Drive 必須使用該帳號的使用者 OAuth；不能把本次 AI Drive 連接器的 session 或 token 匯出給工作程式。優先 drive.file scope，但既有 Folder ID 不等於已獲這個 OAuth app 的權限；需由 Google Picker 授權該資料夾或讓 app 建立授權範圍內的資料夾，實際流程仍待設定。不得默默擴大完整 Drive 權限。External Testing 模式的 token 到期限制及正式發布要求需在 GCP 上線前確認。

由後端排程呼叫 POST /functions/v1/archive-worker，Authorization: Bearer <ARCHIVE_WORKER_SECRET>。排程的秘密要放 Vault／受保護的秘密設定，不能硬編碼到公開 SQL、前端或聊天。平台 JWT 設定需針對此工作程式獨立審查，因這是 scheduler 專用 secret，不是訪客 JWT。

排程頻率與平行 worker 數依實際歸檔量調整。單一低頻 cron 無法保證尖峰 200 人的檔案即時全數完成；收件與公開不等 Drive。尚未建立排程、容量計算或進行負載測試。

## 錯誤與恢復

可辨識 AUTH_REQUIRED、DRIVE_QUOTA、REMOTE_ERROR、SOURCE_MISSING、FILE_MISMATCH。失敗採退避，達 10 次停止自動領取；系統管理員可從後台重新排程。授權失效需先修復 OAuth；不能靠反覆重試取得權限。工作程式每次輪詢也會把超過 24 小時仍未完成的附件標為 UPLOAD_EXPIRED。

已下載的副本與進行中的外部傳輸無法靠軟刪除撤回。歸檔會保留被下架的原始資料，描述檔更新下架狀態。Drive 歸檔不等於完整資料庫／Auth 備份。

目前測試是注入的 Drive HTTP 回應與 PGlite PostgreSQL；真實 Google OAuth、scope、session 期限、配額、Storage Range、跨裝置及還原均未驗收。必須完成真實端到端測試才可啟用。
