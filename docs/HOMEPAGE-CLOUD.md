# 正式首頁雲端投稿接入

狀態：新回憶雲端收件已於 2026-10-26 發布；訪客音樂會、補充與回報已於 2026-11-05 上線。2026-11-06 的自動同步與本輪修正仍是尚未發布的本機修改。

## 行為

- 根目錄與 /handoff-v1.1/ 使用同一份來源。新回憶投稿直接經 Turnstile 與現有 intake/media API 收件；署名公開，電話與 Email 選填且不公開。
- 支援純文字、照片、影片檔、YouTube 連結，合計最多 10 個附件。單檔 50MB；附件失敗時保留已收到的文字與收件編號。Drive 歸檔仍另行處理。
- 2026-11-06 本機修改（尚未發布）：回憶與音樂會在頁面可見時每 10 秒同步，切回分頁或視窗立即更新；頁面載入、手動更新或投稿後更新仍保留。隱藏分頁／離開頁面停止排程，從瀏覽器快取返回後恢復。同步失敗明示畫面可能是舊資料並自動重試，不重疊啟動下一輪。資料未變不重畫，避免中斷影音；下架後移除公開列表，若相簿開啟中則關閉；編輯則重繪該相簿。
- 舊 IndexedDB 投稿保留在原瀏覽器，不再顯示，也不自動上傳。新增音樂會與補充已接通雲端並直接公開；回報只送管理員，詳見 [訪客收件說明](VISITOR-CONTRIBUTIONS.md)。
- 不調整資料庫、角色、秘密、後端功能開關或來源白名單；正式來源沿用 https://dalu.tw。

## 2026-10-26 接入時驗證與限制（歷史紀錄）

npm run build、npm run check、npm run test:home（8 項）及獨立驗收頁一致性檢查通過。本機完整雲端測試另有 32 項通過。

HTTP 預覽 360、390、430、1280px；投稿彈窗、欄位與 Turnstile compact 無水平溢出。原設計、肖像比例、100 字收合與組合 emoji、升冪時間軸、指定音樂 ID 由現有檢查保護。未進行 200 人壓測。

localhost 不在正式 CORS/Turnstile hostname 來源內，預覽同步失敗屬預期；不放寬來源以完成本機測試。正式首頁的真實送出、跨瀏覽器與後台下架回驗要在授權發布後執行；既有 /acceptance/ 真實照片收件已於上一批驗收，不能替代首頁發布後回驗。

當時公開 API 含合成驗收資料；此為歷史快照，本輪未新增、刪除或重新盤點正式雲端投稿。Drive、passkey 與較長影片流程仍待驗收。

## 維護與復原

編輯 handoff-v1.1/工程檔/，執行 npm run build 並提交兩份 HTML；npm run check 與 npm run test:home 應通過。acceptance/src/sync.mjs 是共用請求控制器，變更後也需重建驗收頁。

前端可關閉 cloud-config.json 的 enabled 並重建，或以 PR revert 這批提交。這不刪除已收到的雲端投稿，也不會清除訪客本機資料。

參考：[Turnstile 尺寸](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)、[Supabase CORS](https://supabase.com/docs/guides/functions/cors)。

## 2026-10-31 按需讀取調整（歷史紀錄）

首頁與獨立驗收頁已取消定時輪詢、分頁可見及視窗焦點觸發的讀取。初次載入、手動重新讀取及投稿後更新仍保留；其他使用者的編輯與下架須重新讀取才反映。這只減少背景 API 請求，不保證解決附件下載造成的流量超額。

本機 build、build:acceptance、check、check:acceptance 與 test:home（9 項）通過。HTTP 預覽服務已啟動，但瀏覽器連線 localhost:8000 逾時，因此未完成 360／390／430px、桌面及真實後端／投稿／影音驗收。該次驗證未部署。

2026-11-06 本機修改恢復首頁的自動同步（上方行為），獨立 `/acceptance/` 驗收頁仍維持按需讀取，共用請求控制器未改。管理後台原有每 5 秒刷新目前分區的行為保留，編輯時暫停以保護草稿。

## 2026-11-06 自動刷新本機驗證（尚未發布）

變更檔：`handoff-v1.1/工程檔/home-cloud.js`、根目錄 `index.html`、`handoff-v1.1/index.html`、`scripts/home-cloud.test.mjs`、`scripts/admin-client.test.mjs`、`README.md`、`docs/CATALOG-MANAGEMENT.md`、本文件。原始內容資料、樣式與後端未改。沿用 `codex/concert-local-sync`；GitHub 連接器確認遠端 main 仍為 `684e947`，與本機已整合的 main 一致。

- `npm run build`、`npm run check`、`npm run check:acceptance` 通過，兩份發布 HTML 與來源一致，發布內容不含合成投稿。
- `npm run test:home` 18 項通過；catalog-client、catalog-ui、admin-client 與 admin-sync 共 23 項通過。涵蓋共同排程、隱藏暫停、切回立即更新、慢速／失敗去重、自動重試、離開取消、快取返回恢復、未變更不重畫、下架移除及後台編輯草稿保留。
- HTTP 本機模擬 API（僅替換預覽回應，不寫入正式雲端）：不手動重新整理即可出現合成回憶與音樂會；音樂會修改、親友補充自動反映，正在觀看的場次下架後回列表；新增音樂會表單的未送出草稿在刷新後保留，搜尋字詞保留。
- 360／390／430／1280px 首頁及回憶投稿彈窗無水平溢出，手機肖像維持 3:4；音樂會新增彈窗於三種手機尺寸無水平溢出，桌面音樂會詳情已檢視。點擊播放前沒有 YouTube iframe。
- 未驗證：正式後端跨裝置、真實 Turnstile／投稿與附件實傳、影音實際播放、真實後台帳號的瀏覽器長時間使用、壓力與流量測試。分頁隱藏／快取恢復及後台刷新由自動測試核對，未以多個實體裝置實測。

本次未修改資料來源，未另行更新校對 TXT／CSV；`check` 的既有內容完整性、100 字／emoji 收合、升冪時間軸及背景音樂檢查通過。沒有新增待決策功能；合併與發布仍需當次授權。

同日最後整理另外修正相簿切換競態、補充回應順序與分享連結重試，並補齊 catalog 的 CI 檢查。完整測試增為 102 項、`test:home` 21 項；修正、瀏覽器實測與剩餘限制見 [最後檢查紀錄](FINAL-REVIEW-2026-11-06.md)。
