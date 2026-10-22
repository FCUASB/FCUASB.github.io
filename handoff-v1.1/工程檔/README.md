# v1.1 工程原始碼

日常維護請優先在 repository 根目錄執行 `npm run build`、`npm run check`；內容變更另執行 `npm run proofread`。根目錄命令會同步發布／校對副本，下面的原始腳本只操作工程目錄。規則見根目錄 AGENTS.md 及 docs/MAINTENANCE.md。

需 Node.js，無需安裝套件。在此資料夾執行：

```sh
node build.mjs
node verify-v11.mjs
node proofread-v11.mjs
```

建置結果位於 `dist/index.html`。資料修改請編輯 `content.json`；素材清單是 `assets.json`，圖片在 `assets/`。原版保留在 `template-original.html`。

完整功能、資料來源及待串接項目請見上層 README。投稿目前僅存於訪客瀏覽器；共用資料庫與雲端儲存仍需工程端實作。
