# 投稿 API 實作進度

尚未部署或啟用。handler.mjs 為可在 Node 測試的邊界；index.ts 為 Deno Edge 入口。intake-api.sql 是尚未套用的服務端 RPC，先建立於本機供審查；不能再次執行 foundation.sql。

已實作：文字及 YouTube ID 輸入檢查、選填聯絡資料、明確同意、收件編號、32 KiB 串流要求上限、指定來源 CORS、伺服器挑戰驗證、原子投稿／聯絡資料／YouTube 寫入、同 key 重試防重複與軟刪除不復活、公開列表欄位投影。一般使用者不得直接執行 RPC。

需要的秘密：SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY、TURNSTILE_SECRET_KEY；公開非秘密設定 INTAKE_ORIGINS（逗號分隔來源）。INTAKE_ENABLED 預設關閉，只有在完整驗收後才能設 true。CORS 不是身分驗證，不能替代防濫用。

Turnstile 是建議的防濫用供應者，尚未取得使用者確認或建立資源。需要由校友團建立 widget，限定正式網站 hostname，前端取得 action=memory-submit 的 token。失敗或逾時後重送需重新取得 token，並保留同一 idempotencyKey。公開免登入端點的 Edge 平台 JWT 設定需在部署時明確審查，不能直接關閉現有管理員端點的驗證。

尚未完成：每來源／總量限流、附件上傳與狀態確認、游標分頁（現為最近 100 筆）、投稿結果恢復查詢、後台角色及匯出、Drive 歸檔、前端表單串接、Deno 型別檢查、真實 SQL/RLS/RPC 與瀏覽器驗收。不能把本階段視為正式可用收件服務。

本機測試：node --test scripts/intake.test.mjs；測試使用合成資料及注入依賴，不連線、不寫雲端。使用者的「先不測試」依既有紀錄指暫不執行 200 人壓測，此處為必要程式檢查。
