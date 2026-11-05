# 專案導覽：入口、檔案與互動流程

整理日期：2026-11-04。本次核對基準為 `31c908d`（PR #14 整合後），且已確認 GitHub 遠端 main 同為此提交；正式站仍未於本次重新驗收。下列「已發布」狀態依 repository 最新整合紀錄，不代表本次重新完成線上驗收。

## 先理解這個網站

這是紀念呂彥慶指揮的「大呂的音樂，未完待續」，提供回憶照片／影片／文字、生平時間軸、音樂會及曲目查詢，也有親友投稿與管理後台。

訪客頁是原生 HTML、CSS、JavaScript 靜態網站；首頁的程式與圖片由建置工具嵌進 HTML。需要共用收件、公開內容同步與管理權限的部分，透過指定 Supabase 專案的 API 處理。GitHub Pages 提供網頁，不直接負責存放投稿資料。

先分清楚三個概念：

- **來源檔**：維護者實際編輯的內容、程式與樣式。
- **發布檔**：來源經建置後供瀏覽器開啟的 HTML／JavaScript；首頁不可只手改發布檔。
- **執行時資料**：訪客開啟網站後，從雲端與該瀏覽器 IndexedDB 讀取的資料。修改靜態內容來源，不等於修改後台已管理的雲端內容。

## 從哪裡進入

`CNAME` 目前指定 `dalu.tw`。下表以此網域說明路徑，實際 DNS、HTTPS 與 Pages 狀態仍需發布者確認。本機執行 `npm run serve` 後，可將網址前綴換成 `http://localhost:8000`；雲端 API 是否允許本機來源是另一項限制。

| 網址／入口 | 對應檔案 | 用途 |
| --- | --- | --- |
| `/` | `index.html` | 訪客正式首頁，包含回憶、生平及音樂會介面 |
| `/handoff-v1.1/` | `handoff-v1.1/index.html` | 與根目錄同源、同內容的發布副本，不是另一套獨立網站 |
| `/#memories` | 首頁內的 hash 導覽 | 回到首頁回憶介面 |
| `/#journey` | 首頁內的 hash 導覽 | 切換生涯與演出、作品索引介面 |
| `/#m-<數字ID>` | 首頁內的回憶連結 | 資料載入後開啟指定回憶相簿；本機回憶不保證可跨裝置分享 |
| `/admin/` | `admin/index.html` | 授權管理員登入、管理投稿與公開內容 |
| `/acceptance/` | `acceptance/index.html` | 獨立雲端驗收介面；會連到實際後端，測試不是隔離沙箱 |

首頁的 hash 只是同一份 HTML 裡的畫面切換，不是多份網頁或伺服器路由。音樂會詳情由前端選取資料並繪製。

## 檔案分工：要改什麼就先看哪裡

以下路徑均相對於 repository 根目錄。

| 路徑 | 責任與維護方式 |
| --- | --- |
| `handoff-v1.1/工程檔/template-original.html` | 原版頁面骨架、基礎樣式與部分核心程式；建置時保留並替換指定區塊 |
| `handoff-v1.1/工程檔/build.mjs` | 組裝首頁：讀取模板、資料、圖片、互動程式與雲端設定，產生工程目錄的 `dist/` |
| `scripts/project.mjs` | 根目錄 build／check／proofread 的總入口；同步或核對兩份首頁與校對文字副本 |
| `handoff-v1.1/工程檔/content.json` | 靜態內容基準與初始化／資料準備來源，包括回憶、生平、音樂會與出處；目前部分公開內容由雲端管理 |
| `handoff-v1.1/工程檔/assets.json`、`assets/` | 圖片清單與原始圖片；建置時轉為內嵌圖片 |
| `handoff-v1.1/工程檔/additions.css` | 原版之上的補充樣式、手機顯示與修正 |
| `handoff-v1.1/工程檔/base-forms.js` | 投稿、新增音樂會、補充、檢舉的表單結構與曲目欄位 |
| `handoff-v1.1/工程檔/base-interaction.js` | 點擊事件、彈窗、附件準備、本機儲存、表單送出分流與啟動流程 |
| `handoff-v1.1/工程檔/archive.js` | 現行回憶卡／相簿、時間軸、音樂會詳情、來源清單、100 字收合及背景音樂 |
| `handoff-v1.1/工程檔/connection.js` | 通用 HTTP 與 repository 介面；本機 `projectRepository` 使用其封裝 |
| `handoff-v1.1/工程檔/cloud.js` | 新回憶雲端客戶端 `ProjectCloud`，處理投稿、公開列表及附件流程 |
| `handoff-v1.1/工程檔/home-cloud.js` | 將雲端同步接進首頁；頁面載入、手動重新讀取及投稿後更新，不做背景輪詢 |
| `handoff-v1.1/工程檔/catalog-client.js` | 公開音樂會、生平與原有公開回憶的同步，更新畫面與下架狀態 |
| `handoff-v1.1/工程檔/local-concerts.js` | 分開保存與組合公開音樂會、個人本機補充，處理舊副本及不確定日期 |
| `handoff-v1.1/工程檔/cloud-config.json` | 首頁公開端點與功能開關；目前 enabled、catalogEnabled、existingMemoriesEnabled 均為 true |
| `shared/catalog.mjs` | 前後端共用的公開內容欄位驗證規則 |
| `acceptance/src/app.js`、`src/sync.mjs` | 驗收頁邏輯、同步控制；同步控制也由首頁共用 |
| `admin/src/app.js`、`src/catalog.js` | 後台登入、管理 API 操作、內容管理介面 |
| `admin/config.json`、`acceptance/config.json` | 各自頁面的公開設定；不能放管理金鑰或密碼 |
| `supabase/functions/` | 雲端函式來源；`index.ts` 是執行入口，handler／worker 與共用模組承接邏輯 |
| `supabase/setup/` | 資料庫結構、API 與權限 SQL；已部署基準不可當作日常初始化任意重跑 |
| `supabase/deploy/` | 待部署／部署用 JavaScript 與 SQL 產物；檔案存在不代表遠端版本相同 |
| `scripts/`、`tools/acceptance-build/` | 預覽、建置、生成資料、來源一致性與回歸檢查工具 |
| `REFF/`、原《AI接手說明 v1.0》 | 設計與歷史參考；不能用來覆蓋現行首頁 |

首頁組裝會移除模板或 `base-interaction.js` 中部分同名舊函式，再使用 `archive.js` 的現行實作。因此搜尋到同名函式時，要先查 `build.mjs`，不能只看單一檔案就認定實際執行版本。根目錄 `theme.js`／`theme.css` 也不在目前首頁組裝讀取清單內，改外觀應先追查上述模板與補充樣式。

## 建置時：來源如何變成網頁

```text
template-original.html + content.json + assets.json／assets
  + base-forms.js + archive.js + base-interaction.js + additions.css
  + connection.js + cloud.js + local-concerts.js + catalog-client.js + home-cloud.js
  + cloud-config.json + shared/catalog.mjs + acceptance/src/sync.mjs
        ↓ 工程檔/build.mjs（替換、組裝、內嵌）
工程檔/dist/index.html
        ↓ scripts/project.mjs（驗證、同步）
index.html ＝ handoff-v1.1/index.html
```

這套建置以模板字串替換為基礎。改模板結構、函式名稱或替換文字時，需核對替換是否仍命中，尤其肖像、日期拆行與彈窗寬度修正。

後台由 `npm run build:admin` 進入 `tools/acceptance-build/build.mjs`，用 esbuild 將 `admin/src/app.js` 與相依模組打包成 `admin/app.js`，同時更新後台 HTML 的資源版本參數，並同步產生 `acceptance/app.js`。驗收頁也可單獨用 `npm run build:acceptance` 建置；兩者共用 `cloud.js` 與同步控制來源。

## 開啟網站後：互動如何串起來

### 瀏覽與導覽

首頁先建立 `ARCHIVE`（內容）、`ASSETS`（圖片）、`MEM`（畫面中的回憶）、`CON`（畫面中的音樂會）與本機儲存狀態。`initialize()` 嘗試讀取 IndexedDB 的原有內容與偏好，再更新畫面。啟動後的 `startHomepageCloud()` 讀取雲端投稿與公開內容，並提供手動重新讀取；不做定時輪詢，也不因切回分頁或視窗而自動讀取。

`base-interaction.js` 以 `data-*` 屬性辨識點擊，例如 `data-mem` 開啟回憶、`data-con` 開啟音樂會、`data-open` 開啟表單。畫面繪製主要由 `archive.js` 與保留的模板核心函式負責；`route()` 依網址 hash 切換首頁／生涯介面。

### 表單送出：一定要分清楚去向

| 使用者動作 | 主要程式路徑 | 資料去向／可見範圍 |
| --- | --- | --- |
| 分享新回憶 | 表單 → `open()` submit → `ProjectCloud.submit()` → intake／media | 目前設定為雲端收件；附件狀態需另行確認，文字成功不等於附件已完成 |
| 訪客新增音樂會 | 表單 → `submitLocal()` → `saveRecord()` | IndexedDB，僅該瀏覽器 |
| 補充音樂會／曲目 | 表單 → `submitLocal()` → `saveRecord()` | IndexedDB，不能寫成已送達管理員 |
| 檢舉 | 表單 → `submitLocal()` → `saveRecord()` | IndexedDB，不能寫成已送達管理員 |
| 喜歡／外觀偏好 | 本機互動 → settings | 該瀏覽器的偏好 |
| 後台編輯投稿 | `admin/src/app.js` → admin API | 依登入身分與角色處理雲端資料 |
| 後台管理音樂會、生平、原有公開回憶 | `admin/src/catalog.js` → catalog API | 雲端公開內容；首頁後續同步更新 |

既有本機資料不會默默上傳。`connection.js` 提供通用介面，不表示所有表單都已改走雲端。修改資料流應追到表單送出分流與實際 API。

公開場次的個人補充由 `local-concerts.js` 與最新雲端資料組合，另列於「我的本機補充」，不再以本機整場副本遮住公開修訂。下架後只保留個人補充可見，舊副本仍留在本機。訪客新增場次可只填年份或年月，並保留日期待核對註記。

### 後端各自做什麼

```text
首頁／驗收頁 ─→ intake：新回憶收件、公開投稿列表
             └→ media：附件上傳票證、完成確認、媒體讀取
首頁 ─────────→ catalog：公開音樂會、生平、原有公開回憶
後台 ─→ Supabase Auth 登入 ─→ admin／catalog：依角色管理
雲端歸檔工作 ─→ archive-worker ─→ Google Drive（尚未正式啟用）
```

函式透過服務端共用層與資料庫／儲存服務互動；瀏覽器不能持有 service role key。管理後台的登入介面與權限控制不是同一件事，後端仍需驗證身分、有效 session 與角色。

## 目前狀態與容易誤解的地方

依最新整合紀錄，正式首頁的新回憶雲端收件、獨立驗收頁、後台，以及音樂會／生平／原有 25 筆公開回憶管理已發布。首頁設定也已開啟相應功能。`content.json` 仍是重要靜態基準，但在 existingMemoriesEnabled 模式下，建置不將原有回憶清單直接作為公開顯示清單，而由 catalog 讀取管理後的資料，避免下架內容從靜態副本復活。

尚未正式啟用或仍需驗證的項目包括 Drive worker、passkey、跨裝置完整驗收、真實影音與大量附件實傳、備份還原及負載測試。操作紀錄有本機來源與待部署差異，不能因後台程式已有介面就判定遠端已可使用。詳細狀態以相關文件及實際部署證據確認。

`MAINTENANCE.md`、`CONNECTION.md`、工程檔 README、雲端部署文件內保留早期「尚無後端」「開關 false」等快照。閱讀時先看最新整合註記與 [INTEGRATION-STATUS.md](INTEGRATION-STATUS.md)，再對照來源；本導覽沒有將那些歷史段落改寫成新的部署證明。

仍待需求端確認：UI-03 導覽方案、MEDIA-01 曲名、MEDIA-02 影片位置。保留目前實作，不將待確認事項寫成已核定需求。

## 接手修改與驗證

使用 Node.js 24 LTS，先確認 `git status` 並保留既有修改。在 `codex/<task>` 分支工作；需要後台／雲端相依套件時先 `npm ci`。

| 修改範圍 | 建置與檢查 |
| --- | --- |
| 首頁來源／樣式／互動 | `npm run build`、`npm run check`；提交來源與兩份首頁 |
| 靜態內容資料 | 另執行 `npm run proofread`，人工核對 CSV 與來源註記 |
| 首頁雲端互動 | 另執行 `npm run test:home`，視影響加 connection／catalog／memories 測試 |
| 後台 | `npm run build:admin`、`npm run check:admin`，並檢查其連帶更新的驗收頁產物 |
| 獨立驗收頁 | `npm run build:acceptance`、`npm run check:acceptance` |
| 雲端函式／SQL | 依範圍執行 `npm run test:cloud`、`npm run check:edge` 與對應生成檔檢查；本機建置不會部署服務 |
| 只改文件 | `npm run check`，核對文件連結與敘述是否符合來源 |

UI／互動變更另以 HTTP 預覽測 360／390／430px 與桌面，核對照片、溢出、導覽、彈窗、文字展開、投稿及影音。保留 100 可見字元收合（含組合 emoji）、1977 起升冪時間軸、最多 10 個投稿附件，以及使用者點擊才載入的背景音樂 `n7mhsJLAsVk`／單曲循環。

測試報告要區分腳本通過、瀏覽器實測與真實雲端驗收。本次導覽整理沒有提交投稿、登入後台或重新驗證正式影音／跨裝置流程，也未合併或部署。

## 想知道更多，接著讀哪份

- 非程式人員了解功能與限制：[網站規格書](SPECIFICATION.md)。
- 確認最近整合範圍與驗證證據：[整合驗證紀錄](INTEGRATION-STATUS.md)。
- 維護、發布規範：[長期維護手冊](MAINTENANCE.md) 與 [AGENTS.md](../AGENTS.md)。
- 首頁投稿接線：[首頁雲端接入](HOMEPAGE-CLOUD.md)。
- 公開內容管理：[音樂會與生平管理](CATALOG-MANAGEMENT.md)、[原有公開內容管理](EXISTING-CONTENT-MANAGEMENT.md)。
- 雲端部署與未完成事項：[部署清單](CLOUD-DEPLOYMENT.md)、[雲端進度](CLOUD-PROGRESS.md)。
- 待辦與決策：[BACKLOG.md](BACKLOG.md)、[決策紀錄](decisions/README.md)。
