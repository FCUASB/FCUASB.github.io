# 2026-10-26 完整狀態整合

## 範圍

依使用者「當前狀態全部合併」及「if no err, push」授權，整合本機完整開發快照、兩筆未合併維護提交與 PR #3–#6，基於正式 main `35dbd07`。原始本機快照保存在整合分支歷史，沒有 reset／clean。

保留正式首頁雲端收件、音樂會／生平與原有 25 筆公開回憶管理、後台資源版本網址；不以草稿的停用設定回退正式功能。回憶卡改為標題與來源在上方，沿用最新雲端投稿／附件處理中標示。來源與兩份發布 HTML 同步。

補齊本機 Edge／Drive worker 來源、測試、SQL 維護工具與文件；納入 repository 不表示這些新增來源已部署遠端。資料庫、角色、秘密、Drive 排程及 passkey 設定均未改動。歷史文件保留，入口與維護文件加上目前狀態註記。

## 驗證

- npm run build、check、proofread 通過。內容 JSON 與 CSV 未變更，沒有新增測試投稿。
- test:cloud 32、test:catalog 13、test:memories 5、test:home 8、test:connection 3、Drive OAuth 2 項通過；部分測試跨命令重複，不相加為唯一案例數。
- check:admin、check:acceptance、check:edge、check:cloud-sql、check:edge-bundle、check:catalog、check:memories 及獨立後台／catalog 建置檢查通過。
- localhost 連線與 OAuth 測試在沙箱內 EACCES，允許 localhost 後原測試通過；未刪除或放寬測試。固定 mjs／js／ts／SQL 為 LF，避免 Windows checkout 導致生成檔不一致。
- HTTP 預覽 8012：暫用本機模式驗證既有資料版面，完成後還原正式 enabled/catalog/existingMemories 設定並重新 build/check。360／390／430／1280px 首頁、時間軸及投稿彈窗無橫向溢出，彈窗 clientWidth=scrollWidth（322／352／392／560）。肖像比例約 621:827；回憶卡標題在上、展開與相簿開關可用；時間軸從 1977 起升冪；未點擊前背景音樂 iframe 為 0。
- 本機正式雲端模式因來源限制無法載入公開 API，未放寬 CORS。雲端流程以既有回歸測試及發布後唯讀回驗確認；本次未送出正式投稿。

## 限制

本次未重做真實管理員登入、跨裝置編輯、影音播放與影片實傳、10 附件實傳、Drive、passkey、200 人負載及備份還原驗收。原始本機內容不自動上傳；補充、檢舉與訪客新增音樂會仍是本機流程。遠端服務部署與新權限需要另有明確範圍，不由 Git 合併推定完成。

CI 與 Pages 的實際合併／發布結果以本次 PR 及 Actions 為準。
