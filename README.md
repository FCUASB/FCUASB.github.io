# 大呂的音樂，未完待續 v1.1

網站根目錄的 `index.html` 使用 `handoff-v1.1/index.html`，作為 https://fcuasb.github.io/ 的首頁。照片已嵌入 HTML。

## 維護入口

委託人、內容校對者與非程式人員可先讀 [網站規格書](docs/SPECIFICATION.md)，了解目前功能、已決定方向、限制及待確認事項。

AI Agent 與工程師先讀 [AGENTS.md](AGENTS.md) 與 [長期維護手冊](docs/MAINTENANCE.md)。原《AI接手說明 v1.0》保留為歷史背景，其中首頁位置已由提交 `3b55be9` 更新，以目前程式與上述文件為準。

使用 Node.js 24 LTS，無需安裝套件：

```sh
npm run build
npm run check
```

`build` 建置、驗證並同步兩份發布 HTML；`check` 檢查發布檔與來源一致。內容修改另執行 `npm run proofread` 並人工核對 CSV。PR 自動執行一致性檢查，畫面與互動仍需人工驗收。

## 本機預覽

```powershell
npm run serve
```

開啟 http://localhost:8000 。字型、YouTube 與外部來源需要網路連線。

也可使用 `npm start`。按 Ctrl+C 停止。若 8000 已被使用，PowerShell 可先執行 `$env:PORT=8001` 再啟動。此伺服器僅提供本機靜態預覽；來源修改後仍需 `npm run build`，再重新整理瀏覽器。

## GitHub Pages

依既有交接設定，Pages 使用 main → /(root)。根目錄 `.nojekyll` 讓 GitHub Pages 直接提供靜態檔案。以分支與 PR 審查，取得當次授權才合併／發布；發布者確認實際 Pages 設定與發布結果。

## 更新內容

編輯 `handoff-v1.1/工程檔/content.json`，在根目錄執行 `npm run build`，提交來源與同步後的兩份 `index.html`。不要直接手改發布 HTML。

完整功能說明、資料來源、人工校對與已知限制見 [handoff-v1.1/README.md](handoff-v1.1/README.md)。投稿保存在訪客自己的瀏覽器 IndexedDB，尚未連接共用收件後台。
