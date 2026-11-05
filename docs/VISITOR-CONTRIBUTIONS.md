# 訪客新增音樂會、補充與回報

狀態：**已於 2026-11-05 上線**。資料庫變更已在專案 rikgchswpjaxlnhdrxtw 執行，`visitor` 與 `catalog` Edge Function 已部署（`visitor` 的 Verify JWT 關閉，secret `VISITOR_ENABLED=true`），前端 `visitorEnabled` 已為 true（PR #18）。關閉開關後三個表單會顯示「目前尚未開放這項功能」，不會寫入瀏覽器本機。

## 行為

| 功能 | 行為 |
|---|---|
| 新增音樂會 | 送出後直接公開，不經審核。標示「親友新增，尚未核對」，署名公開。日期可只填年份或年月，不補造月日；有註記或不完整日期時狀態為「演出日期待核對」。第一版不開放圖片與節目冊。 |
| 補充 | 公開顯示在該場音樂會的「親友補充」，不覆蓋原有紀錄。每場最多 20 筆有效補充。 |
| 回報 | 只送給管理員，不公開。聯絡方式僅 system_admin、data_curator 可見。 |
| 下架 | 管理員可下架音樂會（既有功能）、隱藏／恢復補充、標記回報已處理。皆保留資料與版本。 |
| 作品索引 | 親友新增的曲目不計入作品索引，避免未核對資料混入。 |
| 舊本機資料 | 不上傳、不刪除。網站不再讀取瀏覽器內的本機音樂會。 |

## 防濫用

Turnstile（action `visitor-submit`）、全域頻率限制（`visitor_write`，預設每分鐘 120）、固定欄位重建（不接受連結與未知欄位）、單次請求 64KB、曲目最多 50 首、訪客新增音樂會最多 100 筆、整個目錄上限仍為 500 筆。上限用於避免訪客佔滿目錄。

## 部署順序（需逐步取得授權；不可顛倒）

1. 在目標專案確認已套用 `catalog-setup.sql`、`rate-limits.sql`、`existing-memories.sql`，再執行 `supabase/deploy/visitor-contributions.sql`（單一交易，無 DROP）。
2. 部署 `supabase/deploy/visitor.js` 為 `visitor` 函式；設定 `VISITOR_ENABLED=true`，並確認 `INTAKE_ORIGINS`、`TURNSTILE_SECRET_KEY` 已存在。Cloudflare Turnstile 的 widget 需允許 action `visitor-submit`。
3. 重新部署 `supabase/deploy/catalog.js`（公開讀取會呼叫新的資料庫函式，**資料庫尚未更新前不可部署**）。
4. 部署後台（`admin/`）。
5. 將 `handoff-v1.1/工程檔/cloud-config.json` 的 `visitorEnabled` 改為 `true`，執行 `npm run build`，發布。
6. 以「Lexi測試」資料各跑一次新增、補充、回報，再請管理員下架或隱藏測試資料；確認前台更新。

## 復原

關閉 `visitorEnabled` 並重建，即回到「尚未開放」；資料庫物件與資料保留，不刪表。已公開的訪客音樂會與補充可由後台下架或隱藏。

## 已驗證與未驗證

上線後（2026-11-05）在 dalu.tw 以真實 Turnstile 驗證、桌面 1280px 實測：新增音樂會（只填年份）立即出現並標示「親友新增，尚未核對」，補充顯示於「親友補充」，回報送出且不在公開頁面出現，皆無頁面錯誤；以指令確認不合法內容、缺少或偽造驗證 token、非 dalu.tw 來源皆被拒絕且未寫入。測試資料已由管理員在後台下架或處理。

- 已驗證：pglite 資料庫行為（冪等、上限、權限、下架連動、聯絡方式遮蔽）、Edge 處理器、前端流程（本機以攔截的假回應在 360/390/430／桌面之外的 390、1280px 實測）、後台列表與操作。
- 仍未驗證：手機 360／430px 與跨裝置、後台分頁的長期使用（含聯絡方式角色遮蔽）、頻率限制與 100／20 筆上限在真實環境的行為、圖片上傳（未開放）。

## 營運提醒

- 親友新增會直接公開，請指定人員定期（建議每週）檢查後台「音樂會」「親友補充」「回報」。
- 回報沒有 Email 通知，不看就不會被發現。
- 資料庫備份表 `catalog_entries_backup_20261105`、`catalog_history_backup_20261105` 供復原，確認穩定後再刪除。
