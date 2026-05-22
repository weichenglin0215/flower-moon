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

# AI(包括Claude code) 注意事項
- 直接修改本地端程式碼，不要透過worktree。
- 程式碼中加註大量繁體中文註解。
- 使用utf-8 編碼。

# 已廢棄的檔案（勿參考、勿修改）
- `enricher.html`：詩詞標籤工具，已不再使用。
- `responsive.js`：早期的響應式方案，已由 `screen_adaptive.js` 完全取代。
- `screen_adaptive.html`：僅用於早期測試縮放效果，非正式頁面。

# 絕對禁止事項⛔
- 不得使用無前綴的通用 class 名稱
- 不得在模組外直接呼叫 localStorage
- 不得修改 screen_adaptive.js 的核心邏輯