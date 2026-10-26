# Drive 一次性離線授權工具

本工具只用於持有人初次授權，不是公開網站或持續運作的 OAuth callback。不得部署在 GitHub Pages。

1. 執行 `node scripts/drive-oauth-setup.mjs`，僅監聽 127.0.0.1:8765，20 分鐘有效。
2. GCP 既有 dalusite Web Client 的 Authorized redirect URI 設為精確的 `http://localhost:8765/oauth/callback`。不需要 JavaScript origin，不使用 Supabase 登入 callback 取代 Drive callback。
3. 持有人在 http://localhost:8765/ 自行輸入輪替後的 Client Secret，前往 Google 並以校友團帳號授權。Agent 不讀取輸入值、Google 回傳 code 或憑證頁。
4. 工具使用 state、PKCE S256、offline access 及 drive.file；callback 僅使用一次。回傳後立刻導向沒有 code 的 /ready。成功頁不顯示秘密。
5. 持有人按「顯示後端設定值」，自行將三個 GOOGLE_DRIVE_* 值填入指定專案 Supabase Edge Secrets。秘密只在程序記憶體及持有人頁面，不寫入檔案或終端；完成後 Ctrl+C 結束。

既有 My Drive Folder ID 不代表此 app 具有 drive.file 存取權。仍須 Google Picker 授權既有目的地，或經持有人確認後由 app 建立新歸檔資料夾；此工具不自行建立或分享檔案。DRIVE_FOLDER_ID 未驗證前不得啟用 worker。

External Testing 的 Drive refresh token 有七天限制，正式自動歸檔前仍須處理 OAuth 發布狀態與適用驗證。此工具成功不代表 worker、排程或正式歸檔已完成。

驗證：`node --test scripts/drive-oauth-setup.test.mjs`。測試只使用合成憑證和注入的 Google 回應；不能代替持有人實際授權。

官方依據：[Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)、[Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)。
