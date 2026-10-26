# 音樂會與大呂生平管理

狀態：本機完成，等待這批遠端設定與發布授權。正式網站目前仍是 PR #9。

## 分區與權限

後台分為回憶投稿、音樂會、大呂生平。生平不是投稿者聯絡資料，也不是管理員帳號；這兩類既有功能保留。

系統管理員與內容管理員可新增／編輯音樂會、軟下架與恢復，也可編輯生平、補充介紹與生涯時間軸。資料整理員可檢視內容及版本，不能修改。每次操作沿用既有 Auth 與即時會員／session 檢查，不採用可由使用者修改的 metadata。

音樂會包含名稱、日期、時間、地點、團體、指揮、大呂身分、主辦、介紹、狀態、曲目與來源註記。原有圖片、影片、補充來源及未呈現於表單的欄位會保留；這批不新增音樂會媒體上傳流程。新增場次預設使用有明確註記的既有指揮資料照。未知日期可只填年份或月份，保留待核對文字，不自動補成確定演出日期。

儲存會直接更新公開內容；採 revision 比對，衝突時不覆蓋他人變更，彈窗保留填寫內容並顯示錯誤。版本紀錄保留操作者及內容，可載入舊版重新編輯儲存。下架音樂會只設定 deleted_at；生平文件本身不能刪除。

## 資料及接入

新增兩張私有 RLS 表 catalog_entries、catalog_history，前端無讀表或 RPC 權限。兩個 SECURITY INVOKER RPC 只授權 service_role；後端動作透過現有 archive_admin_action 的 profile 檢查即時登入及角色。歷史表只授權後端查詢及新增，不授權更新、刪除。

新 catalog Edge Function：GET 僅回傳公開生平與未下架的音樂會；POST 必須驗證真實 Auth 使用者與 session，並於資料庫再次檢查角色。使用既有來源白名單與限流，不調整現有四個函式。

prepare:catalog 由 content.json 生成單一 transaction 的 catalog-setup.sql：42 筆音樂會與 1 份生平（21 筆事件）。不含投稿或私人聯絡資料；所有文字、來源與待核對註記保留，不捏造內容。schema 新增若發現同名表／函式會失敗回滾；不要在已成功的環境重跑完整 bundle。seed 使用 on conflict do nothing，不覆寫既有雲端編輯。

supabase/setup/foundation.sql、intake-api.sql、admin-api.sql 及既有 backend helper 這次納入 repository 供依賴與本機測試；不是此次要重新套用的 SQL。遠端只套用新的 catalog-setup.sql。

## 部署順序（需當次授權）

1. 先只讀確認 Supabase 專案 rikgchswpjaxlnhdrxtw 及同名物件尚不存在。備份現況，確認既有兩位管理員仍有現行角色；這批不增加管理員或調整角色。
2. 核對 npm run check:catalog 通過後，套用 supabase/deploy/catalog-setup.sql，檢查 43 筆資料、RLS、RPC 權限。
3. 部署 supabase/deploy/catalog.js 為新 catalog 函式。僅此函式的平台 Verify JWT 關閉，供公開 GET；POST 仍由程式驗證 Auth，再由資料庫檢查即時角色。不更改 admin 函式的 JWT 設定。先不設定 CATALOG_ENABLED，功能預設拒絕。
4. 設定 CATALOG_ENABLED=true（不新增秘密值），確認公開 GET 的資料及未登入 POST 的拒絕結果；不通過就停止前端發布。
5. 推送獨立分支、PR，CI 通過後依授權合併；Pages 成功後再驗證後台登入、42 場音樂會、21 筆生涯事件、儲存、跨瀏覽器與軟下架／恢復。只以清楚標記的合成資料測試，不修改真實生平事實。

前端與 admin/config.json 的 catalogEnabled 只在上述服務可用後發布。本機目前已準備 true 的發布檔，但未上傳。

## 網站同步與維護

網站與回憶投稿共用每 10 秒及切回分頁的排程，但分別顯示成功／失敗狀態。內容未改變不重畫；較舊回應不能把已下架場次放回畫面。正在觀看的場次被下架時回到列表。

首次載入尚未取得有效雲端目錄前，隱藏音樂會、生平與相關統計，避免暫時顯示靜態舊內容；載入失敗顯示無法載入。後續失敗保留上次資料並明示可能過期。舊 IndexedDB 不上傳，仍保留原瀏覽器自己的音樂會版本；不能藉由雲端下架刪除他人的本機副本。

content.json 保留匯入基準；啟用後，這兩個分區以雲端內容為準。npm run check／proofread 檢查的是 repository 的靜態基準，不代表雲端後續編輯已經校對。應定期備份 catalog_entries 與 catalog_history；尚未建立排程備份或完成還原演練。前端套件版本固定並提交 lockfile。

復原可回退前端提交或關閉 catalogEnabled 並重建；這會回到匯入前的靜態內容，可能包含其後已修改／下架的資料，需先核對。不要刪表來復原。保留資料庫與版本，可在維護後重新接回。

## 已完成的本機驗證

- npm run build、npm run check；npm run proofread（原資料及校對 TXT 無差異，CSV 未改）。
- test:catalog 11 項：原資料相容、危險 URL／錯誤日期、身份不可偽造、Postgres 角色與失效 session、revision 衝突、軟刪除、版本、舊回應、登出與編輯錯誤保留。
- test:home 8 項及獨立前端建置一致性檢查通過；新函式 Deno check 通過。
- HTTP 本機模擬 API 預覽：42 筆搜尋、音樂會編輯儲存、生平介紹與 21 筆生涯事件編輯儲存。360、390、430、1280px 兩種編輯彈窗無水平溢出。這不是正式後端驗收。

Supabase 連接器目前回覆無權限，遠端 SQL、函式與網站均未改動。遠端 advisors、完整瀏覽器端雲端驗收、Drive、passkey、200 人負載及影片實傳仍未完成。

參考：[Supabase functions](https://supabase.com/docs/guides/database/functions)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
