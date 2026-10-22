# 長期維護手冊

## 現況與文件權責

2026-10-22 本機基準提交為 `3b55be9`，已將新版設為根目錄首頁；這修正了原交接 v1.0「根目錄仍為舊版」的狀態快照。遠端與 Pages 設定仍需發布者現場確認。

- README.md：新成員入口與操作命令。
- AGENTS.md：跨 Agent 的修改界線與交付標準。
- 本檔：建置、驗收、發布及後續決策。
- 原 AI 接手說明 v1.0：需求編號、背景、內容原則與歷史快照，保留原件。
- `content.json`：網站內容來源；TXT／CSV 是校對材料，不能反向自動更新網站。

網站仍是原生 HTML／CSS／JavaScript 靜態站，沒有正式共用投稿後端。不需要 npm install，也不因這次維護設定而新增服務或部署。

## 日常修改

使用 Node.js 24 LTS。在 repository 根目錄：

```sh
npm run build
npm run check
# 內容變更時：
npm run proofread
npm run serve
```

開啟 `http://localhost:8000/` 及 `/handoff-v1.1/`。沒有 npm 時可使用 `node scripts/project.mjs build` 等同名子命令。

`build` 先建置並執行原有驗證，通過後同步兩份發布 HTML。`check` 重新建置並逐位元組比較兩份已提交 HTML，不會替你更新發布檔。兩者均檢查版本、Pages 靜態標記與校對 TXT 是否一致。資料修改後先執行 `npm run proofread`，再 build／check；CSV 仍需人工核對。工程 TXT 為忽略的暫存產物，上層 TXT 是需提交的校對副本。

建置讀入文字時統一為 LF，讓 Windows 與 Linux 的換行設定不影響生成結果；發布 HTML 另以 .gitattributes 固定 LF。

來源集中於 `handoff-v1.1/工程檔/`：資料在 content.json，素材在 assets.json／assets，行為在 archive.js、base-forms.js、base-interaction.js，樣式在 additions.css；build.mjs 以 template-original.html 組裝。dist 與 app-check.js 是忽略的暫存產物；兩份公開 index.html 必須提交。

## 驗證與發布

PR 及 main push 會執行 Validate project；這只涵蓋現有腳本驗證與發布檔一致性。需由維護者在 GitHub 設定要求此檢查通過及人工審查；本次沒有變更分支保護。

畫面修改需人工測手機 360／390／430px、桌面、鍵盤焦點、彈窗關閉與照片比例；行為修改需核對受影響的搜尋、排序、100 字／emoji、附件及影音。外部平台影片是否播放只能在實際瀏覽器確認。記錄實際結果，無法測試就註明。

main 依既有交接紀錄是 Pages 發布來源，合併可能立即公開。以獨立分支與 PR 交付，取得當次授權後才合併；發布者確認 Pages 成功及兩個公開網址。需要復原時，透過 PR revert 問題提交並重驗，避免強制重寫歷史。前端回退不能還原訪客 IndexedDB 或未來雲端資料。

## 待辦與決策追蹤

目前的工作狀態集中於 [BACKLOG.md](BACKLOG.md)，新增決策依 [決策範本](decisions/README.md) 留存。

沿用原交接說明第 6 節編號建立 issue，記錄現象、驗收條件、來源、負責人、決策及 PR。UI-01 已有手機肖像修正提交，先驗收再判定是否仍有問題；UI-02 本機保存去向可繼續釐清；UI-03 需選方案。其他項目依實際證據更新狀態，不能只依舊清單認定未完成。

正式共用收件前，另行決定平台、組織帳號／費用、審核與公開規則、權限、容量、防濫用、素材同意及備份還原責任。要有跨裝置讀寫、私有待審媒體權限與實際還原證據，才能宣告正式收件。維護者／內容校對者／審核者／發布者目前未在專案中具名，交由委託人指定，不由 Agent 虛構。

新增決策使用 `docs/decisions/NNNN-short-title.md`，寫日期、狀態（提案／已同意／取代）、問題、選項、決定者及依據、影響與驗收方式；未同意的提案不得寫成既定規則。版本變更需同步 content.json、package.json、驗證腳本及文件；網站版本與文件版本分別管理。
