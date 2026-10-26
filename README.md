# 大呂的音樂，未完待續 v1.1

網站根目錄的 `index.html` 使用 `handoff-v1.1/index.html`，作為 https://fcuasb.github.io/ 的首頁。照片已嵌入 HTML。

## 本機預覽

```powershell
python -m http.server 8000
```

開啟 http://localhost:8000 。字型、YouTube 與外部來源需要網路連線。

## GitHub Pages

將變更推送到 `main`，並在 Settings → Pages 選擇 Deploy from a branch → main → /(root)。根目錄 `.nojekyll` 讓 GitHub Pages 直接提供靜態檔案。

## 更新內容

編輯 `handoff-v1.1/工程檔/content.json`，於該目錄執行 `node build.mjs`，將輸出的 `dist/index.html` 同步到 `handoff-v1.1/index.html` 與根目錄 `index.html`。

完整功能說明、資料來源、人工校對與已知限制見 [handoff-v1.1/README.md](handoff-v1.1/README.md)。投稿保存在訪客自己的瀏覽器 IndexedDB，尚未連接共用收件後台。


## 首頁雲端接入

正式首頁的新回憶投稿已於 2026-10-26 透過 PR #9 接入 Supabase，包含每 10 秒同步與下架更新。行為、驗證限制與復原方式見 [接入說明](docs/HOMEPAGE-CLOUD.md)。使用 Node.js 24，執行 npm run build、npm run check、npm run test:home。既有本機內容不會自動上傳；其他補充與檢舉仍是本機資料。


## 音樂會與大呂生平管理

音樂會與生平的資料庫及 catalog API 已接通；本批前端發布後提供後台分區、雲端內容版本與同步。接續操作與驗證限制見 [管理與部署說明](docs/CATALOG-MANAGEMENT.md)。
