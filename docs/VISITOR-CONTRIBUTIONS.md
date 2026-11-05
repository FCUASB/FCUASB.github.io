# 訪客新增音樂會、補充與回報

狀態：已在 `lexi/visitor-concerts` 分支本機實作並通過自動測試；**尚未套用資料庫、尚未部署 Edge Function、前端開關預設關閉**。部署前，網站上這三個表單會顯示「目前尚未開放這項功能」，不會寫入瀏覽器本機。

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

- 已驗證：pglite 資料庫行為（冪等、上限、權限、下架連動、聯絡方式遮蔽）、Edge 處理器、前端流程（本機以攔截的假回應在 360/390/430／桌面之外的 390、1280px 實測）、後台列表與操作。
- 未驗證：實際 Supabase、真實 Turnstile、真實後台登入、跨裝置、手機 360／430px、圖片上傳（未開放）。
