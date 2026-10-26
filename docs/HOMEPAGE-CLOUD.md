# 正式首頁雲端投稿接入

狀態：本機準備完成，尚未取得這批發布授權。

## 行為

- 根目錄與 /handoff-v1.1/ 使用同一份來源。新回憶投稿直接經 Turnstile 與現有 intake/media API 收件；署名公開，電話與 Email 選填且不公開。
- 支援純文字、照片、影片檔、YouTube 連結，合計最多 10 個附件。單檔 50MB；附件失敗時保留已收到的文字與收件編號。Drive 歸檔仍另行處理。
- 開啟頁面與切回分頁時讀取，頁面可見時每 10 秒輪詢。同步失敗明示畫面可能是舊資料。下架後移除公開列表，若相簿開啟中則關閉；編輯則重繪該相簿。
- 舊 IndexedDB 內容只在原瀏覽器顯示，不會自動上傳。新增音樂會、補充與檢舉仍是本機內容，表單保留提示，不能視為送交管理員。
- 不調整資料庫、角色、秘密、後端功能開關或來源白名單；正式來源沿用 https://dalu.tw。

## 驗證與限制

npm run build、npm run check、npm run test:home（8 項）及獨立驗收頁一致性檢查通過。本機完整雲端測試另有 32 項通過。

HTTP 預覽 360、390、430、1280px；投稿彈窗、欄位與 Turnstile compact 無水平溢出。原設計、肖像比例、100 字收合與組合 emoji、升冪時間軸、指定音樂 ID 由現有檢查保護。未進行 200 人壓測。

localhost 不在正式 CORS/Turnstile hostname 來源內，預覽同步失敗屬預期；不放寬來源以完成本機測試。正式首頁的真實送出、跨瀏覽器與後台下架回驗要在授權發布後執行；既有 /acceptance/ 真實照片收件已於上一批驗收，不能替代首頁發布後回驗。

公開 API 目前含既有合成驗收資料，接通後也會出現在首頁；未擅自刪除或下架。Drive、passkey 與較長影片流程仍待驗收。

## 維護與復原

編輯 handoff-v1.1/工程檔/，執行 npm run build 並提交兩份 HTML；npm run check 與 npm run test:home 應通過。acceptance/src/sync.mjs 是共用輪詢器，變更後也需重建驗收頁。

前端可關閉 cloud-config.json 的 enabled 並重建，或以 PR revert 這批提交。這不刪除已收到的雲端投稿，也不會清除訪客本機資料。

參考：[Turnstile 尺寸](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)、[Supabase CORS](https://supabase.com/docs/guides/functions/cors)。
