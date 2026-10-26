# Drive 轉存部署與驗收

本清單不代表已啟用。現有瀏覽器 IndexedDB 內容不自動搬移；驗收只用明確標記的合成資料，勿使用真實聯絡資料。

## 授權與秘密

1. 在校友團 dalu-512503 建立 OAuth 應用程式。只申請 drive.file，由應用程式建立專用歸檔根資料夾；不擴大為完整 Drive 權限。
2. 持有人同意 offline access，秘密直接寫入受保護的後端設定，不貼聊天、公開 SQL 或版本庫。External Testing 的七天 token 限制需在長期啟用前處理。
3. 核對 Edge 所需設定名稱見 archive-worker/README.md。Vault 的 archive_worker_secret 必須與 Edge 的 ARCHIVE_WORKER_SECRET 一致；不得輸出兩者的值來比對。
4. 平台 JWT 目前開啟，會擋住獨立 scheduler bearer。必須獨立審查 archive-worker 的 gateway 規則並取得必要授權，不能關掉其他函式的驗證。handler 自己的長秘密驗證必須保留。

## 排程

依 Supabase 官方方式使用 pg_cron、pg_net、Vault。先盤點擴充功能及同名 cron，不重建既有設定。套用 supabase/setup/archive-scheduler.sql 後工作保持 active=false；重跑也會停用，維護時須留意。

每分鐘呼叫一次是初始設定，每次最多處理一件工作及四個 4 MiB 區塊。不是 200 人容量承諾，收件不等待 Drive。HTTP timeout 為 90 秒，佇列租約為兩分鐘，實際執行時間與積壓仍需觀察。

Vault 不會讓傳輸中的秘密完全不可讀：pg_net 暫時把解密後的 HTTP header 存在請求佇列。部署前盤點 net schema／佇列表權限，不向訪客或一般登入角色授予讀取。查驗只輸出狀態與 HTTP 狀態碼，不輸出 header、OAuth 回應或上傳 session URL。

## 完成證據

| 項目 | 必須看到的結果 |
| --- | --- |
| 未授權呼叫 | worker 已啟用時，缺少或錯誤秘密得到 401，沒有領取工作 |
| 手動轉存 | 合成文字、一張圖片、一個超過 4 MiB 的附件，Storage 與 Drive 原檔 SHA256 一致 |
| 描述檔 | submission.json 的投稿 ID、附件對應及文字正確，不含電話或 Email |
| 防重複 | 同工作重試仍使用相同 Drive file ID，沒有第二份檔案 |
| 續傳 | 保存 offset 後下一次呼叫接續同一 session，最終檔案雜湊一致 |
| 自動排程 | 啟用後不用手動呼叫，也能把新合成工作轉成 completed；核對 cron 執行及 HTTP 回應，SQL 成功排入 HTTP 不等於 worker 成功 |
| 失敗恢復 | OAuth 失效呈現 AUTH_REQUIRED；修復後重排成功，不靠擴權或無限重試 |
| 權限 | Drive 檔案未公開分享；無痕未登入無法開啟原檔 |

逐項記錄時間、合成投稿 ID、Drive file ID、大小及雜湊。未完成真實測試前不宣告接通。完成後可先停用 cron，合成資料依持有人指定方式處理，不擅自永久刪除。

官方依據：[排程與 Vault](https://supabase.com/docs/guides/functions/schedule-functions)、[Drive scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)、[OAuth offline access](https://developers.google.com/identity/protocols/oauth2/web-server#offline)。
