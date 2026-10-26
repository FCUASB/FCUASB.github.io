# 維護標準驗證紀錄

日期：2026-10-22（臺灣）
分支：codex/project-maintenance
基準：3b55be9；遠端 main 已以 git ls-remote 確認同一提交。
環境：Windows PowerShell、Node.js v24.18.0。

| 項目 | 結果 |
| --- | --- |
| npm run build | 通過，產生並同步根目錄與子路徑 HTML |
| npm run check | 通過，兩份發布 HTML 與新建置逐位元組相同 |
| 原 verify-v11.mjs | 通過：JavaScript、版本、100 字邊界、emoji、展開、指定音樂、時間軸與資料完整性 |
| 版本／靜態標記／校對 TXT | 通過，由根目錄命令檢查 |
| git diff --check | 通過 |

本次只調整維護工具、文件與建置換行處理，未修改內容資料或產品互動。發布檔已依 LF 規則重建。

尚未執行：Linux GitHub Actions、360／390／430px 與桌面瀏覽器視覺驗收、鍵盤與表單操作、外部影音實播。現有後端尚未實作，沒有跨裝置收件或備份還原證據。

本機維護工具檢查通過不等於全部 UI 待辦完成，也不代表具備正式共用收件能力。後續驗收依 BACKLOG.md 更新。

## 手機圖片與 RWD 修正驗收（2026-10-22）

以本機 HTTP 預覽及瀏覽器 viewport 進行測試，非實體手機測試。

- 確認並修正 aboutImg 因 HTML height=600 在窄螢幕拉長：360px viewport 的顯示尺寸由 313×600 改為 313×416，原圖 621×827。
- 演出詳情海報依原圖比例顯示完整內容，相簿使用 contain；卡片縮圖仍維持原有 cover 裁切。
- 手機導覽保持原有四個入口，縮小間距；長文字與詳情欄位允許縮排換行。
- 首頁、時間軸、作品列表、演出詳情皆檢查 360／390／430／1280px，document scrollWidth 等於 clientWidth，沒有頁面橫向溢出。
- 分享回憶、新增音樂會及照片相簿在相同四種尺寸，dialog scrollWidth 等於 clientWidth；開啟與關閉正常。未送出測試投稿。
- 相簿照片依原比例顯示，390px 截圖保存於 screenshots/mobile-album-390.png。
- npm run build 與 npm run check 通過，兩份發布 HTML 已同步。

本輪未測外部影音實播、實體 iOS／Android、所有 42 場演出逐筆詳情、實際附件上傳與投稿。先前「尚未執行」清單中，本節列明的 RWD 與彈窗項目已補驗，其他限制仍適用。
