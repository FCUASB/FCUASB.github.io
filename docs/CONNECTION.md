# 連線與資料接口

本次依使用者指示先整理通用架構，後端平台保留待決；不啟用決策 0001 所規劃的 Supabase。現有網站依然只使用 IndexedDB，沒有雲端收件、自動同步或既有資料上傳。

## 接入位置

`handoff-v1.1/工程檔/connection.js` 由 build.mjs 嵌入兩份發布 HTML，提供 `ProjectConnection`。建立客戶端不會發出要求，也沒有預設服務網址。

畫面 → `allRecords`／`saveRecord` → `projectRepository` → IndexedDB。

`base-interaction.js` 的 `projectRepository` 是目前資料接入點。介面為非同步 `list(collection)` 與 `save(collection, record)`，支援 memories、concerts、reports、settings。現有本機資料結構與 Blob 原樣保留。初始化仍由既有 IndexedDB 流程負責。

未來接入後端時另建 adapter，負責欄位轉換、身分、附件上傳及回傳驗證。不可把所有集合直接切換到遠端：settings 的偏好及喜歡、待審投稿與公開列表需要分別設計。遠端失敗不得默默改成本機成功；既有本機內容也不得自動匯入。

## HTTP 使用範例（未啟用）

```js
const client = ProjectConnection.createHttpClient({
  baseURL: 'https://your-api.example/api/',
  timeoutMs: 10000,
  retries: 1,
});
const controller = new AbortController();
try {
  const data = await client.request('public/memories', {
    signal: controller.signal,
  });
  // 由 adapter 核對回傳欄位後，才交給畫面。
} catch (error) {
  // code: NETWORK / TIMEOUT / CANCELLED / HTTP / INVALID_RESPONSE
  // HTTP 類型另有 status；保留表單，讓使用者決定下一步。
}
// controller.abort() 可取消要求。
```

路徑使用 baseURL 之下的相對路徑。僅支援 JSON 要求與 JSON 回應，204／HEAD 回傳 null；附件、串流及授權更新由未來 adapter 另訂。逾時涵蓋每次要求與讀取回應，各次重試分別計時。

GET／HEAD 遇到網路錯誤、逾時、502／503／504 最多重試指定次數（0–3）；其他狀態與寫入一律不自動重試，也沒有背景重送佇列。寫入逾時不代表後端未收到，須由未來後端的冪等鍵與查詢收件結果機制處理。

跨來源預設不帶 cookie，禁止重新導向。需要身分驗證時可透過每次要求的 headers 提供短期權杖；公開前端不得放管理金鑰。正式服務應使用 HTTPS，並設定允許的前端來源。附件及待審資料的存取權限由後端強制執行。

## 驗證與後續

`npm run test:connection` 使用本機 HTTP 伺服器與注入的 fetch 驗證 JSON、重試、取消、逾時、錯誤及 adapter 失敗傳遞；`npm run check` 驗證建置與既有規則。這些不代表跨裝置、瀏覽器 CORS、真實後端權限或正式收件已通過。

接入前需確認 API 網址、回傳規格、身分與審核流程、附件限制及重複送件處理。UI-03、影音與正式發布仍依原維護規範處理。

### 2026-10-23 本次實測

- 分支：`codex/connection-interface`。
- `npm run test:connection`：3 組通過。本機 HTTP 測試在沙箱內連線失敗，取得執行權限後完整重跑通過。
- `npm run build`、`npm run check`：通過，兩份發布 HTML 一致，既有驗證規則通過。內容資料未修改。
- HTTP 預覽伺服器可啟動，但內嵌瀏覽器存取 localhost:8000 回報 `ERR_CONNECTION_TIMED_OUT`，未取得畫面。因此 360／390／430px 與桌面的照片、溢出、導覽、彈窗、展開文字、投稿保存及影音流程均未完成本次瀏覽器驗收。
- 未連接外部 API；跨來源、跨裝置、真實收件、附件權限與後端備份還原未測。未推送、部署或建立外部服務。
