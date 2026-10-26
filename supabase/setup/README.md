# Supabase 基礎設定（已套用）

2026-10-24 已透過 Dashboard SQL Editor 在指定專案套用與 foundation.sql 等義的初始化交易。不要再次執行 foundation.sql。六張表均已查詢確認 RLS=true，anon／authenticated 的 SELECT、INSERT、UPDATE、DELETE 權限均 false；schema USAGE 均 false，submission-media public=false。

目標專案：rikgchswpjaxlnhdrxtw。先確認 SQL Editor 頂部的專案識別，勿在其他專案執行。

1. 先執行 inventory.sql，只查結構及 bucket 設定。若 archive_private 已存在，停止並比對，不能直接重跑初始化。
2. 審查 foundation.sql，執行前確認現有資料與權限不衝突。SQL 在單一交易新增私人 schema 與六張表；任一步驟失敗即回滾，不刪除或取代既有表。
3. 執行 verify.sql，確認六張表 RLS 開啟、訪客及一般登入使用者無資料表權限，bucket 非公開。

本腳本是封閉的儲存基礎，不是完成的網站後端。未授予 service_role 自訂 schema 權限，也未建立 Data API、公開列表、投稿端點、管理員帳號、角色執行邏輯或 Drive 工作程式；不應把 archive_private 加入 exposed schemas。不能將 service_role 放前端。

附件 slot 唯一鍵限制每則最多十個保留欄位，包含軟刪除欄位；恢復與更換 slot 的規則需由後端實作。角色資料尚無初始成員，不會因 GitHub/Supabase 平台成員身分自動變成網站管理員。audit_events 僅為記錄儲存結構，尚無自動稽核，updated_at 也需由後續寫入流程維護。

下階段才建立受控後端：身分與即時角色檢查、防濫用、冪等收件、公開欄位投影、原子寫入聯絡資料、附件狀態驗證、軟刪除媒體存取與稽核。歸檔佇列的領取、租約、防重複及復原亦未實作。

不提供 DROP 回復腳本，避免誤刪投稿；如需退出，先停止新功能流量、匯出及驗證資料後另審查處理。已通過 PostgreSQL 建表與目錄權限查詢，尚未測試業務寫入、跨裝置或後台流程；npm run check 不會驗證 SQL。
