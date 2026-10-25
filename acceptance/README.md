# 雲端功能驗收

預計入口 https://dalu.tw/acceptance/ ，後台 https://dalu.tw/admin/ 。本頁寫入同一校友團 Supabase 專案，並非保密或獨立資料庫；只使用合成測試資料，署名以「驗收」開頭。不會讀取或搬移首頁 IndexedDB。

首頁不因這組檔案而啟用雲端。驗收頁僅在 https://dalu.tw 啟用送件；本機預覽會顯示尚不能送件。管理員仍須完成 Auth 帳號及角色綁定，公開金鑰不會授予管理權限。Drive 與 passkey 不在這次驗收範圍。

## 重建

使用 Node.js 24。在 repository 根目錄執行：

```sh
npm ci --prefix tools/acceptance-build
npm run build --prefix tools/acceptance-build
npm run check --prefix tools/acceptance-build
```

這組固定版本工具可獨立重建 admin/app.js 與 acceptance/app.js，不需變更首頁工具鏈。驗收頁重用 handoff-v1.1/工程檔/cloud.js 的票證與收件流程；不要手改發布 JavaScript。

## 驗收順序

1. 投稿合成文字並保存收件編號。
2. 在另一個瀏覽器開啟驗收頁並重新讀取，確認同一編號。
3. 測試照片、短影片與 YouTube 連結，核對附件可讀及失敗提示。
4. 後台搜尋編號，編輯文字後重新讀取；下架後確認列表不再出現、附件重新請求遭拒絕，再測恢復。
5. 保存實測紀錄；沒有完成這些步驟前，不宣稱正式收件或管理功能已通過。

測試完成後由有權限者軟下架測試資料；不要刪除他人投稿。首頁未來接通前須再確認測試資料的公開狀態。
