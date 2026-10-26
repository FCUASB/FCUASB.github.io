# Supabase、GCP 與 Google Drive 準備指南

> 2026-10-26 整合註記：本文件保留各階段規劃／驗收快照。正式首頁雲端收件、音樂會／生平及原有公開回憶後台管理已發布；最新狀態與本次整合限制見 [整合驗證紀錄](INTEGRATION-STATUS.md)，不以歷史「尚未接通」描述覆蓋目前程式。

更新日期：2026-10-23。本文記錄本次對話的技術規劃與手動設定步驟，不代表服務已串接、權限已驗證或正式收件已完成。

## 架構與目前狀態

規劃資料流：GitHub Pages 前端 → Supabase Database／Auth／Storage／後端程式 → Google Drive 素材歸檔。

- 前端沿用現有網站與設計；目前投稿仍保存在瀏覽器 IndexedDB。
- [決策 0001](decisions/0001-supabase-backend.md) 已記錄採用 Supabase 的平台方向。
- 使用者正在準備的 [Supabase 專案](https://supabase.com/dashboard/project/rikgchswpjaxlnhdrxtw)，Project ref 為 `rikgchswpjaxlnhdrxtw`。本次未登入驗證其狀態、組織、方案、資料表或權限。
- [連線接口](CONNECTION.md) 記錄另一階段的通用接口工作及當時保留平台的狀態；本文記錄本次雲端準備方向，不能據此認定接口已啟用 Supabase。
- Drive 是素材歸檔目的地；授權、同步狀態、重試、防重複及還原仍需實作。歸檔不等於完整備份。
- 組織歸屬、費用、審核與公開規則及備份負責人尚待指定。既有本機投稿不得自動上傳。

## 準備哪些 GCP 項目

| 項目 | 用途 | 準備條件 |
| --- | --- | --- |
| Google Cloud Project | 管理 API、授權與憑證 | 必要，建議由長期維護組織持有 |
| Google Drive API | 上傳歸檔附件 | Drive 歸檔必要 |
| Google Auth Platform／OAuth Web Client | 使用者授權個人 Drive，或管理員 Google 登入 | 依所選方案設定 |
| Service Account | 後端向 Workspace Shared Drive 歸檔 | 選用共用雲端硬碟方案時 |

依目前規劃，後端先由 Supabase 承接，暫無需另外建立 Cloud Run、Compute Engine、Cloud SQL、Firebase 或 Google Cloud Storage。Google Drive 與 Google Cloud Storage 是不同服務。費用與配額依實際方案及官方當時政策確認，不在本文承諾免費或核准付費。

## 1. 建立專案並啟用 API

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)，點頂部專案選單 → **New Project**。
2. 名稱建議 `FCUASB Memorial Archive`；有校友會 Workspace Organization 時選擇該組織。
3. 建立後選取新專案，記錄 Project ID。GCP Project ID 與 Supabase Project ref 不同。
4. 進入 **APIs & Services → Library**，搜尋 **Google Drive API**，點 **Enable**。
5. 在 **Enabled APIs & services** 確認啟用狀態。

參考：[Drive API 快速入門](https://developers.google.com/workspace/drive/api/quickstart/python)。

## 2. 選擇 Drive 授權方案

兩種方案擇一；使用者尚未指定。只有 My Drive 中的共用資料夾，不等於 Workspace 的 Shared Drive。

### A. Workspace Shared Drive：組織歸檔方案

GCP 設定：

1. 進入 **IAM & Admin → Service Accounts → Create Service Account**。
2. 名稱建議 `fcuasb-drive-archiver`，說明為「網站投稿附件歸檔」。
3. **Grant this service account access to project** 先留空；只做 Drive 歸檔不需要賦予 GCP Owner／Editor。
4. 建立後記錄服務帳號 email，格式為 `fcuasb-drive-archiver@YOUR_PROJECT_ID.iam.gserviceaccount.com`。

Google Drive 設定：

1. 建立專用共用雲端硬碟，例如「大呂紀念網站歸檔」。
2. 在 **Manage members** 加入服務帳號 email；須確認 Workspace 政策允許。
3. 僅新增檔案先評估 **Contributor**；若需要移動或刪除，再依實際操作評估更高權限。
4. 建立 `submissions` 資料夾，記下 `https://drive.google.com/drive/folders/FOLDER_ID` 中的 Folder ID。

服務帳號本身沒有 Drive 儲存配額，不能擁有檔案。授予 GCP IAM 角色不會自動取得 Drive 檔案權限；必須在 Drive 端授權。初期不需要網域全權委派。

憑證在實際串接時再決定。若採服務帳號 JSON key，位置為 **Service Accounts → 該帳號 → Keys → Add key → Create new key → JSON**；若組織禁止建立金鑰，交由管理者選擇允許的授權方式，不自行放寬政策。金鑰只存後端秘密設定，不提交公開 repository 或貼入聊天。

參考：[建立服務帳號](https://docs.cloud.google.com/iam/docs/service-accounts-create)、[Shared Drive 與服務帳號限制](https://developers.google.com/workspace/drive/api/guides/about-shareddrives)、[服務帳號金鑰](https://docs.cloud.google.com/iam/docs/keys-create-delete)。

### B. 個人 Gmail／My Drive：OAuth 使用者授權方案

進入 **Google Auth Platform**：

| 頁面 | 準備內容 |
| --- | --- |
| Branding | App name、支援 email、開發者聯絡 email |
| Audience | 個人帳號選 External；測試時加入 Drive 持有人為 Test user |
| Data Access | 優先評估 `https://www.googleapis.com/auth/drive.file` |
| Clients | 建立 Web application 類型 OAuth Client，名稱建議 `FCUASB Drive Archive` |

`drive.file` 只涵蓋應用程式建立或使用者透過適當流程授權的檔案；知道既有 Folder ID 不等於有權存取。串接時需設計由應用程式建立歸檔資料夾，或透過 Picker 等方式授權既有目的地。若採 Picker，另確認其 API 與前端設定需求，不直接擴大成完整 Drive scope。

**Authorized redirect URI 尚待後端 Drive OAuth callback 實作後填入**，不要把登入 callback 當成已可用的歸檔授權端點。後端流程需要求 offline access，取得 refresh token，並處理重新授權與撤銷。

External App 若保持 Testing 且要求 Drive scope，refresh token 通常七天到期。正式自動歸檔前需處理發布狀態及適用的驗證要求；切換正式狀態不代表 token 永不失效。

參考：[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)、[OAuth 後端流程](https://developers.google.com/identity/protocols/oauth2/web-server)、[refresh token 到期規則](https://developers.google.com/identity/protocols/oauth2/)。

## 3. 選用：管理員 Google 登入

僅在決定管理員使用 Google 登入時設定。建議另建 OAuth Web Client，名稱 `FCUASB Admin Login`，與 Drive 歸檔分開管理。

- Authorized JavaScript origin：`https://fcuasb.github.io`，不含路徑。
- Authorized redirect URI：`https://rikgchswpjaxlnhdrxtw.supabase.co/auth/v1/callback`。
- 上述 callback 依使用者提供的 Project ref 推導，儲存前須與 Supabase Google Provider 畫面核對。
- 在 Google Auth Platform 設定 `openid`、email、profile 等登入 scopes；登入本身不需要完整 Drive 權限。
- 將 Client ID／Client Secret 填入 Supabase **Authentication → Sign In / Providers → Google**；介面名稱可能調整。
- Supabase 的 Site URL／允許的前端 redirect URLs 需依實作設定，與 Google 回到 Supabase 的 callback 是不同設定。
- 能登入不代表有審核權；管理員名單、角色及後端授權仍需另外限制。

參考：[Supabase Google 登入](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)。

## 4. 交接資料與驗收

可記錄的非秘密資料：GCP Project ID、Supabase Project ref、Drive 類型、Shared Drive ID（如適用）、Folder ID、服務帳號 email 或 OAuth Client ID，以及管理與付費負責人。

Client Secret、服務帳號私鑰、refresh token、Supabase secret／service_role key 僅存後端秘密設定。前端公開設定只使用適合公開的專案網址與 publishable key，並以資料庫 RLS、Storage 與後端權限限制實際存取。

正式收件前需留下實測證據：

1. 跨裝置讀寫及投稿收件結果；本機內容不會自動匯入。
2. 待審投稿及附件不會被未授權訪客讀取；管理員登入與角色限制有效。
3. 核准後公開流程符合委託人指定規則。
4. Drive 測試上傳成功，權限、目的地與擁有權符合所選方案。
5. 歸檔失敗、重試及防重複有效，授權失效能辨識並處理。
6. 資料庫與附件分別完成備份還原測試，並指定負責人。

本次僅整理文件，未建立 GCP 資源、產生憑證、修改外部權限、部署後端或測試上述流程。後續準備順序：建立 GCP Project → 啟用 Drive API → 確認 A／B 方案 → 設定授權 → 實作及驗收。
