# DNS 與 GitHub Pages 維護紀錄

## 2026-10-24（台灣時間）

使用者回報 GitHub Pages 網域驗證成功。約 20:07 另以公開 DNS 與 HTTPS 進行唯讀確認：

- 自訂網域：`dalu.tw`；GitHub Pages 預設網址：`https://fcuasb.github.io/`。
- 名稱伺服器先前查詢為 `ns1.cyberdns.tw`、`ns2.cyberdns.tw`。
- Google DNS（8.8.8.8）可查到 `_github-pages-challenge-FCUASB.dalu.tw` 的 TXT，值與 GitHub 提供的驗證碼一致。
- 此 DNS 管理介面的「主機／次網域」填 `_github-pages-challenge-FCUASB`，由系統補上 `.dalu.tw`；TXT 驗證成功後須保留。
- Cloudflare DNS（1.1.1.1）查到 `dalu.tw` 四筆 A：`185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`。
- `curl.exe -I https://dalu.tw/` 回傳 `HTTP/1.1 200 OK`、`Server: GitHub.com`，未略過 TLS 憑證檢查。

先前約 19:43 時，自訂網域尚無 A／AAAA 回應，預設網址轉址至 `http://dalu.tw/` 而失敗；以上為設定更新後的確認結果。

## 維護與限制

- TXT 用於所有權驗證；A 記錄用於網站解析，兩者用途不同。
- 未直接讀取 GitHub 私有 Pages 設定；GitHub 驗證成功依使用者回報。未確認 Enforce HTTPS 開關、更新後的 HTTP 轉址、www、IPv6、全球 DNS 傳播及瀏覽器互動。
- 本次只新增紀錄，未修改 DNS、網站來源、部署或既有本機工作。
- 遠端 main 確認為 `3b55be9ce86c26cf942f82aa861ac174c750ad37`；本機另有較新維護提交與未完成修改，不包含在此紀錄 PR。
- 原工作目錄執行 `npm run check` 通過；遠端 main 尚無 package.json，不能將該檢查視為 PR 基底的建置驗證。文件變更另以 `git diff --check` 檢查。

官方說明：https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages
