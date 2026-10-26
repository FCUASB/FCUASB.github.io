# 上傳與管理功能驗證

驗證日期：2026-10-26。範圍為現況驗收，未啟用服務、部署、合併或修改權限。

## 結論

本機文字與照片保存流程通過。後續 PR #7 已合併發布，真實文字／照片收件與原檔一致性已通過；管理員登入、編輯及下架仍待帳號設定與實測。下表保留發布前結果，最新結果見末節。

## 本次實測

| 項目 | 結果與證據 |
| --- | --- |
| 正式首頁 | https://dalu.tw/ 回應 200；與先前 404 的狀態不同。 |
| 正式後台 | https://dalu.tw/admin/ 回應 404。 |
| 本機空白投稿 | 按送出顯示「請選一張照片、影片，或寫下一段話」，未進入成功畫面。 |
| 本機純文字 | 合成文字成功保存，成功畫面明示未同步雲端、其他親友看不到；重新整理仍可找到。 |
| 本機照片 | 合成 32×32 PNG 可選取、預覽；不填文字亦成功保存；重新整理後相簿影像 complete=true、naturalWidth/Height=32。 |
| 超過 10 個附件 | 已有 1 張時再選 10 個，顯示最多 10 個的錯誤；原有附件仍保留。 |
| 本機後台 | /admin/ 顯示「管理後台尚未接通服務」，登入與忘記密碼按鈕停用。 |
| 正式 API 無憑證 | intake/admin/media/archive-worker 以 POST {} 均回應 401 Missing authorization header。這只證明平台拒絕無憑證，並非已驗證業務流程。 |

本機 cloud-config.json enabled=false；admin/config.json enabled=false、publishableKey 空白、passkeysEnabled=false。未更動這些開關。

瀏覽器使用 HTTP localhost:8011 與內建瀏覽器；Chrome 擴充連線曾無法取得頁面，未將該次視為成功測試。第一次附件來源在每次命令隔離的暫存目錄，瀏覽器無法讀取；改用允許的持久測試素材路徑後重測通過，不能把前者判為網站圖片解碼缺陷。

## 自動驗證

- npm run test:cloud：28 項通過，涵蓋 SQL 權限／session、角色、編輯衝突、最後管理員、軟刪除、附件完成核對、資料隔離、歸檔重試及前端部分流程。
- npm run check、check:admin、check:edge-bundle 均通過。
- 測試使用 PGlite、模擬 HTTP 與隔離前端環境；不能替代真實 Supabase 登入、Storage、Google Drive、實體裝置或負載驗收。
- 本機分支 codex/supabase-foundation，HEAD 5b15c47；唯讀遠端 main 為 80f71a73f9fcfb16c7dfd2fa0b48e7400837b591。正式網站與本機未提交成果不是同一版本，未自動合併遠端或覆蓋既有工作。

## 尚未驗收

正式匿名投稿、跨瀏覽器共用資料、真實影片上傳／播放、YouTube 新投稿、真實管理員登入／搜尋／編輯／匯出／撤權、Drive OAuth 與歸檔、passkey、故障復原及 200 人負載均未證明可用。新一輪手機尺寸驗收亦未執行。

本輪只在本機瀏覽器建立兩筆具 QA 標記的合成資料，沒有寫入正式 Supabase 或 Drive，沒有將測試投稿加入發布來源。未清除任何既有 IndexedDB 資料。

正式驗收須先完成後台發布與服務設定，再以合成資料實際證明「投稿編號 → 另一個獨立瀏覽器可見 → 私有附件可讀 → 下架後拒絕 → Drive 檔案存在」；不得用本輪通過結果替代。

## PR #7 合併後的真實驗收（2026-10-26）

- 經使用者當次授權合併 PR #7，遠端 main 合併提交 5ad53d5073f6548998019eff0c29b230b4a4e2f0，Pages 工作 40256205007 成功且 builds/latest 對應同一提交。
- https://dalu.tw/acceptance/ 與 https://dalu.tw/admin/ 均回應 200，後台顯示可操作登入表單，passkey 仍關閉。
- 真實 Turnstile 元件自動顯示 Success；透過表單送出一筆合成文字＋100 bytes、32×32 PNG，網站回傳收件編號並顯示雲端列表。未填電話或 Email。
- 公開 API 確認附件 status=ready，媒體 GET 200、image/png、100 bytes；與原始合成 PNG 逐位元相同，SHA256=be72456cffa0219f2cf0290ec774d382471383142783eed7ad88b4861eba4fd1。
- 測試投稿仍公開保留供驗收辨識，尚未藉後台軟下架。管理員帳號／角色尚待完成；不能將此結果擴大為登入、編輯、下架、恢復、Drive、影片與負載全部通過。

- 跨瀏覽器確認通過：內建瀏覽器送件後，另以 Chrome 開啟正式驗收頁，讀到同一收件編號與合成文字，圖片 complete=true、32×32。這不是同一個瀏覽器的 IndexedDB 暫存。
- 發現介面小問題：收到成功結果後，附件進度文字仍可能保留「正在上傳」；實際附件已 ready 且雜湊一致，此提示應在後續修正，不視為附件仍未上傳。
