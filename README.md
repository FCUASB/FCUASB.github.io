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
