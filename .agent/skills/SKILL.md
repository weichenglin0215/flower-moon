---
name: FlowerMoon_web專案規範總覽
description: 開始任何 FlowerMoon_web 開發任務前必須先讀此文件，再依任務類型讀取對應規範
---

# 必讀順序
1. CLAUDE_andrej-karpathy-skills.md（所有任務必讀）
2. 花月開發常見錯誤與解法.md（所有任務必讀）
3. 遊戲類型介面設計與程式碼規範.md（新增或修改遊戲時讀）
4. 資料類型介面設計與程式碼規範.md（新增或修改資料介面時讀）
5. 遊戲企劃書撰寫規範.md（撰寫或閱讀遊戲企劃書時讀）

# 修改「青雲梯 / 文位升等 / 任何 gameXX」之後，必跑的自動驗證
```
node tools/verify_learning_path.js
```
- 它會把 game1~game40 的青雲梯接入契約、設定表、站點結構、
  文位升等五個劇本與考試流程各驗一次（載入的是專案線上的模組本身）。
- 必須 ✓ 全數通過才算完成；❌ 的訊息會直接指出檔案與修法。
- 想看「玩家到底經歷了什麼」：`node tools/verify_learning_path.js report`
  會跑一趟完整生涯並輸出 `tools/out/青雲梯歷程LOG.txt`（逐局 game_logs／
  晉升獎勵／考試逐題／冊封獎狀，可從頭讀到尾）。
- 對應規範與踩坑紀錄（新增遊戲或改升等流程前先讀）：
  - `note/青雲梯與獎勵企畫書/青雲梯遊戲接入規範與已知錯誤.md`
  - `note/青雲梯與獎勵企畫書/文位升等已知錯誤紀錄.md`

# AI(包括Claude code) 注意事項
- 直接修改本地端程式碼，不要透過worktree。
- 程式碼中加註大量繁體中文註解。
- 使用utf-8 編碼。

# 已廢棄的檔案（勿參考、勿修改）
- `enricher.html`：詩詞標籤工具，已不再使用。
- `responsive.js`：早期的響應式方案，已由 `screen_adaptive.js` 完全取代。
- `screen_adaptive.html`：僅用於早期測試縮放效果，非正式頁面。

# 擴充題庫（data/poems.js）之前必讀⛔
- 關卡編號＝關卡表的陣列位置，**新增詩詞會整批位移**。
  玩家存檔已改存「穩定關卡識別碼」（`錨定詩id:起始句`），
  舊存檔由 `ScoreManager._migrateLevelKeys()` 在載入時自動遷移。
- 因此：**先確認所有玩家都開過含遷移的版本，再擴充題庫**。
  遷移是拿「目前的關卡表」翻譯舊編號，題庫改了才遷移會翻出錯的詩。
- 擴充後務必跑 `node tools/verify_learning_path.js keys` 確認仍然穩定。
- ⚠️ 尚未解決：新詩會插進學習序列中間，既有玩家的站點會倒退
  （見 `note/青雲梯與獎勵企畫書/文位升等已知錯誤紀錄.md` №14 附記）。

# 全遊戲共同契約（新增或修改任何 gameXX 之前必讀）
`gameContract.js`（`window.FMGame`）是 39 款遊戲的共同契約：
必備函式 `show／stopGame／startNewGame／retryGame／startNextLevel／gameOver(win, reason)`、
必備變數 `isLevelMode／currentLevelIndex／difficultySettings`，
以及 `FMGame.nextLevel／advance／completeLevel／exit／getScore／getSilver／audit`。
**契約的權威來源是那個檔案的常數，不是任何一份 .md**；驗證工具直接拿它驗 39 款，
任何一款不符都是 ❌，不會因為「這款還沒納入青雲梯」而降級為提醒。
詳見 `.agent/skills/花月開發常見錯誤與解法.md` §4.0。

# 絕對禁止事項⛔
- 遊戲內不得呼叫 `MenuManager.closeAll()`／`closeAllActiveOverlays()`／`FMGoHome()`／
  `MenuManager.goHome()`／`this.startNextLevel()`（要離開請用 `FMGame.exit()`）
- 遊戲內不得自行 `currentLevelIndex++`（一律 `FMGame.nextLevel(this)`）
- 不得使用無前綴的通用 class 名稱
- 不得在模組外直接呼叫 localStorage
- 不得修改 screen_adaptive.js 的核心邏輯
- 非經同意，禁止修改 difficultySettings: 的內容