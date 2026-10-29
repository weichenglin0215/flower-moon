# vendor/ — 自架的第三方函式庫

過去 `index.html` 直接從 CDN 載入這幾支函式庫，一旦玩家離線（或 CDN 當機）：
農曆日曆壞掉、雲端存檔／排行榜整個不能用、QR Code 畫不出來。
為了讓花月能**離線遊玩**，全部改放在專案內，由 Service Worker 一併快取。

| 檔案 | 套件 | 版本 | 授權 | 來源 |
|---|---|---|---|---|
| `lunar.js` | lunar-javascript | **1.6.12** | MIT | npm registry（`npm pack`，自動驗證 integrity） |
| `supabase.js` | @supabase/supabase-js（UMD 版 `dist/umd/supabase.js`） | **2.118.0** | MIT | npm registry（`npm pack`，自動驗證 integrity） |
| `qrcode.min.js` | qrcodejs | **1.0.0** | MIT | cdnjs（已比對 cdnjs 公布的 SRI 雜湊，完全一致） |

SHA-256（供日後核對檔案沒有被改動）：

```
e92a6390a7b1612e71138f25b64239a2883211688bff7b5853a4e13baae9366a  lunar.js
ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3  supabase.js
c541ef06327885a8415bca8df6071e14189b4855336def4f36db54bde8484f36  qrcode.min.js
```

## ⚠️ 版本說明

- 改成自架之前，`supabase-js` 是用 `@2`（浮動版本）載入，當時 CDN 解析到 2.118.0；
  這裡**釘死在同一個版本**，行為與改版前完全相同。之後不會再被 CDN 默默升級。
- 想升級時，請依下列步驟，並實際測過登入／存檔／排行榜再發布。

## 如何升級某個函式庫

1. 在**專案以外**的空資料夾執行 `npm pack <套件>@<版本>`（npm 會自動驗證 integrity），解開後取出對應檔案。
2. 覆蓋 `vendor/` 內的檔案，更新本檔的版本與 SHA-256。
3. 執行 `node tools/build_sw.js`（重新產生離線快取清單；沒做的話玩家會一直拿到舊檔案）。
4. 執行 `node tools/verify_sw.js` 與 `node tools/verify_learning_path.js`。

## 為什麼不自架 Google Fonts（Noto Serif TC）

中文字體一整套動輒數十 MB，自架不划算。Service Worker 會在玩家「連線時」把用到的字體切片快取起來，
離線時沿用；沒快取到的字會退回系統字體，版面不會壞。
