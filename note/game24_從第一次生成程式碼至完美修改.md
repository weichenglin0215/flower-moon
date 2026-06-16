# GAME24《三字成珠》從第一次生成程式碼到完美修改

> 本文件記錄 GAME24（三消類詩詞遊戲）在數輪反覆迭代中所有的修正與優化。
> 撰寫目的：讓後續開發者（與未來的 AI 共筆者）能快速吸收經驗，少走冤枉路。

---

## 0. 一句話總覽

> **「三消遊戲的視覺、節奏、特效細節，比邏輯本身難十倍。」**

GAME24 的核心邏輯（拖曳交換、三連偵測、重力下落、補位、連鎖）一次生成就接近可玩；但要達到「Candy Crush 級的爽快感 + 公平有效的提示 + 精準的動畫節奏」，需要十多輪小修。下面分類記錄每一個問題的「症狀 → 根因 → 修正」。

---

## 1. 介面結構與視覺

### 1.1 步數倒數框必須是「外框」，不可覆蓋 board
- **症狀**：紅白倒數框畫在棋盤格之上，視覺混亂。
- **根因**：`#game24-timer-ring` SVG 與 `#game24-board` 同尺寸貼齊，stroke 落在 board 邊。
- **修正**：
  - `.game24-board-wrapper { padding: 14px }`：板塊內縮，留外框空間。
  - SVG rect 以 `x=3 y=3, w=W-6, h=H-6` 畫於 wrapper 邊緣（離 board 11px）。
  - `overflow: visible` on SVG。

### 1.2 答案方框必須是正方形
- **症狀**：高難度（10×7）時答案方塊變扁。
- **根因**：CSS 寫死 `aspect-ratio: 7/8`，但 rows/cols 因難度而異。
- **修正**：移除固定比例；JS `_resizeBoardWrapper()` 動態計算：
  ```
  cell = (wrapperWidth - 28) / cols
  wrapperHeight = cell × rows + 28
  ```
  在 `startGameProcess` 內呼叫一次。

### 1.3 答案方框中的文字偏下方
- **症狀**：字基線偏低，沒在方框正中央。
- **根因**：中文字字型的 baseline 偏移 + flex `align-items: center` 不考慮字型 metrics。
- **修正**：`.game24-cell { line-height: 1; padding-bottom: 0.05em }`。`padding-bottom` 透過 `box-sizing: border-box` 內縮內容區，將字推上一點補正視覺。

### 1.4 字體尺寸 = 方框 80%
- **症狀**：CSS 寫死 `font-size: 36px`，不同難度方框大小變動，字體比例不一致。
- **修正**：JS `renderBoard` 算出 `cellSize` 後 `cellFontPx = floor(cellSize × 0.8)`，內聯設到每格。

### 1.5 poem-info 靠右 + 詩名截斷
- **症狀**：詩名與「盤面/步數」標籤重疊。
- **修正**：
  - sub-header 改 `justify-content: space-between`，moves-label 左 / poem-info 右 + `margin-right: 20px`。
  - `selectRandomPoem` 將顯示字串截到 15 字 + `…`，原全名放 `title` 屬性（hover 顯示）。

### 1.6 moves-label 格式：「盤面:1/2 步數:8/30」
- **修正**：HTML 結構 `<div id="game24-moves-label">盤面:<span id="game24-stage-text"></span> 步數:<span id="game24-moves"></span>/<span id="game24-max-moves"></span></div>`。
- 新增 `_updateMovesLabel()`，在 `startGameProcess`、`startCurrentLine`、`attemptSwap`、`completeLine` 都呼叫。

---

## 2. 同字同色與目標字辨識

### 2.1 同字必同色（HUE 依目標字位置 360° 等分）
- **早期**：用 hash mapping 到固定 10 色 palette → 顏色重複、邏輯不直觀。
- **修正**：`getHueForChar(ch)`：
  ```js
  const idx = currentLineChars.indexOf(ch);
  if (idx >= 0) return round((360/n) × idx + 12) % 360;
  // 干擾字：hash-based fallback（會被 .decoy 強制套灰調）
  ```
  目標字以「高亮度 75% + 中彩度 60% + 深色字（#241）」呈現，干擾字保持灰色。

### 2.2 `decoyRatio = 0` 時嚴禁干擾字
- **症狀**：即使 `decoyRatio=0`，補位仍可能出現干擾字。
- **根因**：`pickWeightedChar` 的 fallback「當前句全收完」分支會強取其他句字。
- **修正**：兩個守門：
  - `useDecoy = decoyRatio > 0 && Math.random() < decoyRatio`
  - `allDoneFallback = totalDeficit === 0 && decoyRatio > 0`

---

## 3. 開局保證無 3 連（嚴格）

### 3.1 BUG 史
- **第一版**：`makeNewTile(r, c, true)` 只檢查左/上 2 格，失敗後 `pickWeightedChar` 重抽 20 次。
- **第二版**：加 `eliminateInitialTriples(maxRounds)`：掃 match → 中段格重抽 → 仍有「全部禁→放棄」破口。
- **症狀**：在 `decoyRatio=0` 且 `currentLineChars` 小（如 5 個字）時，重抽幾乎必撞禁，破口被觸發 → BUG 留三連。

### 3.2 最終修正（嚴格保證）
**cell-by-cell 掃描**（不再用 match 中段重抽）：
```js
for r from 0 to rows-1:
    for c from 0 to cols-1:
        cur = board[r][c].char
        如果 (左兩格同字 == cur) 或 (上兩格同字 == cur):
            從 currentLineChars 找第一個既不撞左也不撞上的字 → 覆寫
```
數學上保證：只要 `currentLineChars >= 2`，必能找到合規替代字。掃描順序左→右、上→下，每替換一格只可能解決舊三連，不可能向後製造新的（後續未掃格才會看到當前修改）。

---

## 4. 拖曳與閒置提示（Hint）

### 4.1 拖曳時方塊要有移動表演
- `onDragMove` 計算位移，鎖定主軸，限制單格範圍內，套 `transform: translate(...) scale(1.1)` 給拖曳起點格。
- `onDragEnd` 清掉 transform 讓字塊回彈。

### 4.2 hintDelay 參數
- 加到 `difficultySettings`：小學 2s、中學 3s、高中 5s、大學 / 研究所 0（不提示）。
- `scheduleHint()` 在 `startCurrentLine` 與 `afterChainSettle` 啟動；`clearHint()` 在 `onDragStart` 清除。

### 4.3 Hint 起點 / 終點方向（兩次修正）
- **錯誤一**：只標 (r,c) 一格 → 玩家不知拖往哪。
  - **修正**：標起點 `.hint`（金光）+ 終點 `.hint-target`（青光）。
- **錯誤二**：起點與終點搞反 → 例：要把「問借問」變「問問問」，金光卻在「借」上。
  - **根因**：未考慮 match 落在哪一側。交換 A↔B 後，match 若落在 B → 起點是 A（A 的字移到了 B 位置加入連線）。
  - **修正**：`_swapMatchSide(r1,c1,r2,c2)` 回傳 `'a'/'b'/null`，再以該結果決定起終點。

### 4.4 Hint 優先大連
- **症狀**：明明有 4 連 / 5 連機會，卻提示一個 3 連。
- **修正**：`showHint` 不是「找到就提示」，改成**掃全盤所有可拖曳交換**，呼叫 `_swapMatchInfo` 取最長 match length，挑 `maxLen` 最大者。

---

## 5. 消除動畫

### 5.1 一層層依序滑落（重力感）
- `applyGravity` 為每個下落 tile 設 `_fallDelay = stagger × 40ms`（同一欄越上方的越晚開始）。
- `refillBoard` 為每個新 tile 設 `_spawnDelay = 80 + spawnIdx × 60ms`。
- CSS `.game24-cell.spawn` / `.fall` 用 `animation-delay: var(--g24-delay)` 套用階梯。

### 5.2 粒子顏色與字塊同色系
- `spawnParticles(cellEl, count, hue)`：給定 hue，CSS 中 `.game24-particle.hue` 用 `hsl(var(--g24-ph), 100%, ...)`。

---

## 6. Power Tile（四 / 五連道具）

### 6.1 殘留高光導致無法進行
- **症狀**：完成句子時，棋盤上仍有 `.power-h/v/star` 高光字塊不消失。
- **根因**：`completeLine` 未清除 power class 與 board 中的 `isPower` 旗標。
- **修正**：新增 `_cleanupStageRemnants()`，過場前清掉所有 cell 的 power/removing/selected/... class，並把 `board[r][c].isPower = null`，再清掉 FX layer 內的 particle/shockwave/soul 等殘餘 DOM。

### 6.2 方向爆破特效（高難度三消的核心爽點）
- **要求**：橫向 power 應有「橫向長條光束 + 橫排字塊依序爆破 + 結束後暫停 0.5s」。
- **修正**：
  - `cellRemoveDelay[key] = |distance from power center| × 55ms`（橫向 power 對同列每格遞延）。
  - `spawnPowerBlast(centerEl, type, hue)` 創建 `.blast-h / .blast-v / .blast-star` 元素，用 `radial-gradient(ellipse at center, ...)` 把亮中心**鎖在道具字塊位置**，向兩端遞淡。
  - `spawnDirectionalParticles(cellEl, hue, dir)`：橫向 power 對每格噴左右粒子、縱向噴上下粒子。
  - `burstDuration = 450 + cascadeTotal + (power ? 500 : 0)`，級聯結束後額外停半秒「感受爆炸」才下落補位。

### 6.3 爆破位置兩次定位 BUG
- **BUG 1**：光束兩亮點分裂到道具字塊兩側（不是貫穿）。
  - **根因**：`linear-gradient` 把亮峰設在 30% 和 70%，width 從 60px → 1200px 時亮峰跟著百分比往兩端跑。
  - **修正**：改 `radial-gradient(ellipse at center, …)`，亮中心永遠鎖在元素中央。
- **BUG 2**：光束跑到完全不同的列／欄（差 2 格以上）。
  - **根因**：`getBoundingClientRect()` 取的是被舞台 scale 縮放後的 viewport 像素，但 FX 元素是 wrapper 的子節點會再被 scale 一次 → scale 雙重套用 → 位置往原點偏移 `(1 - scale) × 本地座標` 倍。
  - **修正**：`getCellCenter` 把回傳座標除以 `window.stageScale` 還原為本地像素。同時修 `spawnSoul` 的終點座標。

---

## 7. 進度顯示

### 7.1 多版本迭代
- **v1**：每字 `床:●●○`（圓點數量代表進度）→ 字數多時超寬。
- **v2**：`答案字: 4/9`（單一總計）→ 看不出哪個字缺。
- **v3（最終）**：**多卡橫排**，每張卡 `[上方彩色字塊]` + `[X/Y 計數]`，與棋盤同色：
  - `flex: 1 1 0; max-width: 64px`：總寬必小於畫面寬，自動依字數均分。
  - 達標卡片整體變金色 + 金光脈動。
  - 字魂特效 `spawnSoul` 終點 = `.game24-char-group[data-char="X"]`（飛入對應卡片）。

---

## 8. 句完成與最終勝利的「過場節奏」

### 8.1 早期 BUG
- 完成全部句子後盤面空白、無 MessageBox。
- 中途完成句子節奏太快，玩家看不清發生了什麼。

### 8.2 非最後一句：7 階段串行
1. 進度卡逐一發金光（160ms 間隔）
2. 棋盤由下往上逐列掉落（80ms 間隔）
3. 「恭喜！進入下一句盤面。」金黃橫幅 2 秒
4. 進度卡逐一消失（110ms 間隔）
5. 切句、生新進度卡逐一出現（130ms 間隔）
6. 新盤面逐列由上滑落（80ms 間隔）
7. 解鎖拖曳、重啟 hint 倒數

全程 `isAnimating = true` 鎖玩家輸入；過場開頭呼叫 `_cleanupStageRemnants()`。

### 8.3 最後一句：勝利動畫
- **不走** 過場、不淨空盤面、不顯示「下一句」橫幅。
- 進度卡逐一發金光（180ms 間隔）→ 呼叫 `gameOver(true)` → `ScoreManager.playWinAnimation`。

### 8.4 勝利動畫整合 ScoreManager 的兩個關鍵 BUG
- **BUG A**：`heartsSelector: ''` 空字串 → `querySelectorAll('')` 拋 `SyntaxError` → 整段勝利動畫中斷、無 MessageBox。
  - **修正**：用永不命中但語法合法的 `.game24-no-hearts`。
- **BUG B**：步數模式下 `timer/maxTimer = 0` → ScoreManager 階段 2 直接跳過 → 看不到倒數框轉場與星星。
  - **修正**：仿 [game9.js](../game9.js) — 在 `gameOver(true)` 內 `this.timer = this.movesLeft; this.maxTimer = this.maxMoves`，讓 ScoreManager 把「剩餘步數」當作獎勵資源換算。
- **BUG C（自己挖的洞）**：曾嘗試切換到金色 timer-path、隱藏紅白雙框。
  - **錯誤**：用戶要求**比照 game9**，紅白雙框就是要逐段消失而不切金色。
  - **修正**：`updateTimerRing(ratio, 'win')` 改為直接呼叫 `updateMovesRing()`（依新的 `movesLeft` 重畫紅白），保留紅白雙框、不換 stroke。

---

## 9. 難度參數系統

### 9.1 `moveLimit`（整數）→ `moveLimitRate`（浮點）
- **要求**：總步數應與「詩的字數」掛勾，而非寫死。
- **修正**：`difficultySettings` 加 `moveLimitRate`，在 `startGameProcess` 計算：
  ```js
  maxMoves = round(targetChars.length × moveLimitRate × collectTarget)
  ```
  範例：兩句 × 每句 7 字 = 14 字、`collectTarget=2`、`moveLimitRate=1.5` → 42 步。

### 9.2 最終難度參數表

| 難度 | poemMinRating | rows×cols | moveLimitRate | collectTarget | refillBias | decoyRatio | hintDelay | minLines~maxLines | minChars~maxChars |
|------|---------------|-----------|---------------|---------------|------------|-----------|-----------|---------------------|---------------------|
| 小學 | 6 | 7×7 | 1.5 | 2 | 0.40 | 0 | 2s | 2~2 | 8~14 |
| 中學 | 5 | 7×7 | 1.3 | 3 | 0.30 | 0 | 3s | 2~4 | 10~20 |
| 高中 | 4 | 8×7 | 1.1 | 3 | 0.20 | 0 | 5s | 4~4 | 14~28 |
| 大學 | 3 | 9×7 | 1.0 | 4 | 0.10 | 0 | 0 | 4~6 | 20~42 |
| 研究所 | 3 | 10×7 | 0.9 | 5 | 0.00 | 0 | 0 | 4~8 | 28~56 |

> 注意：所有難度都改成步數模式（`timeLimitRate: 0`），不再有時限模式。

---

## 10. Auto-Win 防呆

- **症狀**：玩家最後一步消除剛好補滿目標，但接下來什麼都沒發生。
- **根因**：`isLineComplete()` 只在 `resolveMatchesChain` setTimeout 中段檢查；若連鎖剛好在「無新匹配階段」收尾，會漏判。
- **修正**：`afterChainSettle()` 開頭加防呆 `if (isLineComplete()) completeLine()`。

---

## 11. GAME32~35 視覺對齊 game4（順帶完成的任務）

| 對齊項目 | game4 基準 |
|---|---|
| Overlay 背景 | `radial-gradient(circle at center, hsl(210, 30%, 25%), hsl(0, 0%, 5%))` |
| 文字色 | `hsl(40, 50%, 80%)` |
| 字型 | `'Noto Serif TC', serif` |
| Header padding/bg | `2px 8px` / `rgba(0,0,0,0.4)` |
| Score | `hsl(50, 70%, 60%)` / 24px / `padding-left: 50px` |
| nav-btn | bg `hsl(0,60%,25%)` / color `hsl(45,80%,70%)` |
| difficulty-tag | `padding: 2px 6px` / 20px / `hsl(45,30%,85%)` |
| sub-header | bg `rgba(0,0,0,0.4)` / 40px / 白色細邊底線 |
| heart | 32px / `hsl(4, 90%, 60%)` |
| poem-info | 20px / 底線 / `hsl(40,50%,80%)` |
| timer-path | `stroke: hsl(0,50%,22%)` / 10px / round |

只對齊視覺層，玩法保留。

---

## 12. 開發經驗總結（給後續開發者的提醒）

### 12.1 凡是要追特定遊戲（如 Candy Crush）的「爽快感」，動畫節奏比邏輯難十倍
- 連鎖動畫要分階段：消除（0.45s）→ 重力下落（0.35~0.55s 含階梯）→ 補位（0.45s 含階梯）→ 連鎖延遲（0.22s）。
- 動畫期間 `isAnimating = true` 必鎖玩家輸入。
- 階梯延遲（stagger）營造「層次感」，每層 40~60ms 是甜蜜點。

### 12.2 scale 與 getBoundingClientRect 的雙重縮放陷阱
- **規則**：若 overlay 有 `transform: scale(x)`，任何用 `getBoundingClientRect()` 算出的座標都是 viewport（已縮放）像素；若要設給 wrapper 的子節點 style.left/top，**必須除以 `window.stageScale`** 還原為本地像素。
- 若這條規則沒守，FX 會出現「離原點越遠偏越多」的詭異現象。

### 12.3 提示（Hint）的「正確性」比想像難
- 不能只回「能成 match 的格」；要回「哪個格是起點、哪個是終點」。
- 起點 = 「字會被移過去 → 形成 match」的那一格。
- 提示應優先大連，引導玩家做出 4 連 / 5 連道具。

### 12.4 初始盤面無 3 連的「嚴格保證」
- 用 cell-by-cell 左→右、上→下掃描修正法。
- 別用「match 找中段重抽」策略 — 有破口、不嚴格。

### 12.5 完成階段的動畫節奏：不要快、要明確
- 進度卡逐一發光是「告訴玩家剛剛做了什麼」。
- 棋盤掉落是「告訴玩家階段結束」。
- 橫幅 2 秒是「給玩家喘息與成就感」。
- 新盤滑落是「告訴玩家新挑戰開始」。
- 每一步都不能省。

### 12.6 整合 ScoreManager 的 checklist
- `heartsSelector` 不能為空字串（用 `.gameNN-no-hearts` 等合法但永不命中的 selector）。
- 步數模式要把 `movesLeft → timer`、`maxMoves → maxTimer`、`startTime = 0`，讓 ScoreManager 把「剩餘步數」當資源換分。
- `updateTimerRing(ratio, 'win')` 要實作：步數模式下用 `updateMovesRing()` 重畫紅白框，不要切金色。

### 12.7 power tile（4/5 連道具）的「位置 = 視覺中心」原則
- 光束、粒子、爆破中心都要從**道具字塊的中心**發出。
- 級聯延遲（cascade delay）要從**道具字塊位置**為原點向外擴散，不要從邊角。
- 級聯完成後**多停 0.5s** 再做下落 / 補位，玩家才能「感受」爆破。

### 12.8 console.log 是診斷神器
- 在 `completeLine`、`gameOver(true)`、power trigger、總步數計算等關鍵節點都印 log，能省下大量在「為什麼這個沒觸發」上的猜測時間。

---

## 13. 檔案結構速查

| 檔案 | 角色 |
|---|---|
| [game24.js](../game24.js) | 邏輯 + 動畫排程 + ScoreManager 整合 |
| [game24.css](../game24.css) | 樣式 + keyframes + 視覺狀態 class |
| [note/game24_三字成珠_企劃書與遊戲心得.md](game24_三字成珠_企劃書與遊戲心得.md) | 高層次企劃 |
| [note/game24_從第一次生成程式碼至完美修改.md](game24_從第一次生成程式碼至完美修改.md) | 本文件 — 開發日誌 |
| [game9.js](../game9.js) / [game9.css](../game9.css) | 紅白倒數框 + 步數模式勝利動畫的參考實作 |
| [game4.js](../game4.js) / [game4.css](../game4.css) | 視覺基準（GAME32~35 對齊用） |
| [scoreManager.js](../scoreManager.js) | 過關結算動畫 + 飛行星星 |

---

*本文件由本輪迭代結束時整理。後續若再有大改，請追加新章節，不要刪除歷史紀錄 — 失敗的嘗試與根因，比成功的程式碼更值得保留。*
