# 花月 Design System 整理筆記（宣紙主題遷移）

> 本文件整理今日（2026-07-07）與使用者討論並已在 game1 / game4 / game13 落地驗證的「宣紙淺色主題」統一設計系統，提供給後續 agent 模式在夜間依序把其餘遊戲套用相同規範。
>
> **核心原則：只動介面「上半部」（overlay 背景、頂部分數列、控制鈕、難度標籤、紅心副標、詩詞出處連結），下半部的遊戲區（`.gameXX-area` 及其內容）維持各遊戲原有私有樣式與版面不動。**

---

## 1. 背景與目標

- 原本配色以暗紅／深藍黑為主，過於沉重；使用者要求改為「淺米黃宣紙」風格。
- 主要在手機使用、面向較高年齡層玩家，字體偏大、對比要清晰、色調要柔和不刺眼。
- 色彩語彙取自中國傳統：**宣紙底、墨字、朱砂印色、青碧（答對/過關）**，古典雅致。
- 因為各遊戲是分開製作，介面上半部（header/分數/控制鈕/難度標籤/紅心）尺寸、顏色、寫法都各自為政。這次要做的是**抽成共用元件統一**，並同時支援「淺色宣紙」與「墨黑」兩種主題皮膚。

## 2. 遊戲色系分類（使用者提供，之後遷移請依此分組）

| 分組 | 遊戲 | 套用方式 |
|---|---|---|
| **米色（宣紙）** | game1, 2, 4, 9, 11, 12, 13, 16, 20, 21, 22, 23, 24, 25, 27, 28, 30, 31, 32, 33, 34, 35 | 套用 `.fm-*` 共用 class，overlay **不加** `fm-theme-dark`（預設即宣紙淺色） |
| **墨黑** | game3, 5, 6, 8, 10, 14, 15, 19, 26, 29 | 套用 `.fm-*` 共用 class，overlay **加上** `fm-theme-dark` class |
| **先不動（自成一格）** | game7, 17, 18（18 尚未製作） | 不要碰，維持原樣 |

> ⚠️ 目前**已完成遷移**（含詩句/選項色彩統一）：**game1、game4、game13**。
> **已改名但尚未套用 fm-\* 主題**：game12（僅做了 `.poem-lines` → `.game12-poem-lines` 全域污染修正，上半部 header/hearts/難度標籤等仍是舊寫法，仍待遷移）。
> 其餘全部尚未動工。

---

## 3. 共用主題檔：`theme_xuanzhi.css`

新增檔案，於 `index.html` 中 **`screen_adaptive.css` 之後、所有 `gameN.css` 之前** 載入：

```html
<link rel="stylesheet" href="screen_adaptive.css">
<!-- 共用宣紙淺色主題變數（--fm-*），需在各遊戲 CSS 之前載入 -->
<link rel="stylesheet" href="theme_xuanzhi.css">
<link rel="stylesheet" href="achievement.css">
...
```

### 3.1 `:root` 變數（宣紙淺色，預設）

```css
:root {
    /* 宣紙底色（漸層用） */
    --fm-paper-light: hsl(44, 63%, 90%);   /* 受光處（漸層中心）*/
    --fm-paper:       hsl(43, 53%, 82%);   /* 主色 */
    --fm-paper-deep:  hsl(42, 48%, 76%);   /* 邊緣暗處（漸層外圈）*/
    --fm-paper-card:  hsl(43, 72%, 94%);   /* 卡片/按鈕紙面（略白於底）*/

    /* 墨色（文字） */
    --fm-ink:       hsl(28, 26%, 24%);     /* 濃墨：詩句主文字 */
    --fm-ink-soft:  hsl(30, 25%, 23%);     /* 淡墨：次要文字 */
    --fm-ink-faint: hsl(35, 38%, 39%);     /* 赭墨：註記/出處等弱化文字 */

    /* 朱砂印色（強調、計時、答錯） */
    --fm-cinnabar:        hsl(6, 63%, 46%);
    --fm-cinnabar-bright: hsl(8, 56%, 51%);  /* 遮蔽字（待答字）*/

    /* 青碧（過關、答對） */
    --fm-celadon: hsl(150, 37%, 40%);

    /* 金赭（分數、控制鈕文字） */
    --fm-gold: hsl(40, 66%, 40%);

    /* 描邊 */
    --fm-border:        hsl(40, 47%, 71%);
    --fm-border-strong: hsl(35, 43%, 52%);
    --fm-hairline:      hsla(38, 50%, 31%, 0.16);
    --fm-veil:          hsla(38, 50%, 31%, 0.06); /* 頂列/副標的淡色遮罩 */

    /* 答題狀態語意色 */
    --fm-correct-bg: hsl(120, 35%, 90%);
    --fm-correct-border: hsl(150, 37%, 36%);
    --fm-correct-text: hsl(150, 100%, 15%);

    --fm-wrong-bg: hsl(0, 50%, 86%);
    --fm-wrong-border: hsl(6, 66%, 50%);
    --fm-wrong-text: hsl(354, 53%, 23%);

    --fm-hint-bg: hsl(213, 44%, 90%);
    --fm-hint-border: hsl(216, 41%, 68%);
    --fm-hint-text: hsl(221, 39%, 29%);

    /* 陰影（宣紙上宜淺、宜暖，不用純黑重影） */
    --fm-shadow-soft: 0 2px 6px hsla(38, 50%, 31%, 0.2);
    --fm-shadow-btn:  0 4px 6px hsla(38, 80%, 20%, 0.5);
    --fm-text-shadow: 0 4px 4px hsla(38, 50%, 31%, 0.5);
}
```

### 3.2 墨黑主題皮膚：`.fm-theme-dark`

墨黑組遊戲只需在 overlay 上**多加一個 class**，不必改任何 `.fm-*` 元件寫法：

```css
.fm-theme-dark {
    --fm-paper-light: hsl(210, 30%, 25%);
    --fm-paper:       hsl(220, 40%, 10%);
    --fm-paper-deep:  hsl(0, 0%, 3%);
    --fm-paper-card:  hsl(210, 22%, 20%);

    --fm-ink:       hsl(40, 50%, 85%);
    --fm-ink-soft:  hsl(40, 40%, 78%);
    --fm-ink-faint: hsl(35, 30%, 62%);

    --fm-gold: hsl(48, 80%, 62%);

    --fm-border:        hsla(40, 60%, 70%, 0.32);
    --fm-border-strong: hsla(40, 70%, 75%, 0.55);
    --fm-hairline:      hsla(40, 60%, 70%, 0.15);
    --fm-veil:          hsla(0, 0%, 0%, 0.35);
}
```

用法（墨黑組遊戲 createDOM 裡）：
```js
div.className = 'game3-overlay fm-overlay fm-theme-dark hidden';
```

### 3.3 共用 UI 元件 class（`.fm-*`）

| Class | 用途 | 替代掉的舊 class |
|---|---|---|
| `.fm-overlay` | 全畫面覆蓋層背景（漸層＋字型＋防縮放） | `.gameN-overlay` 內的視覺樣式（保留 `gameN-overlay` 當私有 hook 用，兩個 class 並列） |
| `.fm-header` | 頂部資訊列容器（分數＋控制鈕） | `.gameN-header` |
| `.fm-scoreboard` | 分數文字 | `.gameN-score-board` |
| `.fm-controls` | 控制鈕容器 | `.gameN-controls` |
| `.fm-nav-btn` | 重來／開新局按鈕 | `.nav-btn` |
| `.fm-difficulty-tag` | 難度標籤（需搭配 `data-level="小學"` 等屬性套色） | `.gameN-difficulty-tag` |
| `.fm-sub-header` | 副標列容器（紅心＋詩詞出處），`justify-content: space-between` | `.gameN-sub-header` |
| `.fm-hearts` | 紅心容器（自動靠左） | `.hearts`（⚠️原本是無前綴全域污染 class）|
| `.fm-heart` | 單顆紅心（`.empty` = 已扣血，`.score` = ScoreManager 動畫著色） | `.heart`（⚠️同上）|
| `.fm-poem-info` | 詩詞出處連結（自動靠右、`max-width:60%` + ellipsis 雙保險） | `.gameN-poem-info` |

**注意**：`.fm-overlay` 等共用 class 是**額外疊加**在原本的 `.gameN-overlay` 上，不是取代：

```html
<!-- ✅ 正確：兩個 class 並存 -->
<div class="game1-overlay fm-overlay hidden">
```

原因：`.gameN-overlay` 仍作為該遊戲的 DOM 私有 hook（例如 `document.querySelector('.game1-overlay')`、`registerOverlayResize` 等可能依賴），純視覺樣式則交給 `.fm-overlay`。

---

## 4. 版位規則：紅心靠左、詩詞出處靠右

`.fm-sub-header` 用 `justify-content: space-between`：

```html
<div class="fm-sub-header">
    <div id="gameN-hearts" class="fm-hearts"></div>
    <div id="gameN-info" class="fm-poem-info"></div>
</div>
```

- 紅心自動靠左（sub-header 的 flex 第一個子元素）
- 詩詞出處自動靠右（第二個子元素）
- 若某遊戲沒有詩詞出處連結（如 game13，其「人事時地」的題目 meta 是題目本體，不是出處連結），**不要**硬塞 `.fm-poem-info`，維持只有 `.fm-hearts` 即可（該 meta 元素留在題目區原位）。
- 若原程式中沒有控制`fm-poem-info` 或 `gameXX-poem-info` 的顯示與否，請增加控制條件如下：
1. 小學難度維持顯示，不需要隱藏，提供給玩家當成提示。
2. 中學以上難度遊戲開始(或是重來、重玩)需隱藏，直到玩家通過勝利時，才能夠顯示出來，供玩家點擊觀看該詩詞的細節內容。


### 4.1 詩詞標題截斷規則

避免詩名過長與左側紅心重疊，統一規則：**最多顯示 8 個字，超過則截斷＋`…`**（原本 game1 是 12 字截 10、game4 是 12 字截 10、game13 是截 7 字，這次統一改為 8）：

```js
// 詩詞名稱最多顯示 8 字（避免在 fm-sub-header 右側與左邊紅心重疊）
let title = this.currentPoem.title;
if (title.length > 8) {
    title = title.substring(0, 8) + "…";
}
```

CSS 端另有 `text-overflow: ellipsis` 作為雙保險（`.fm-poem-info` 已內建 `max-width:60%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis`）。

---

## 5. 全域污染修正（B 治本，務必比照辦理）

### 5.1 問題

CLAUDE.md 規範明文禁止「無前綴通用 class 名稱」。但舊程式碼裡 `.poem-lines`、`.poem-info`、`.hearts`、`.heart` 都是**無前綴全域 class**，被多個 gameN.css 各自定義（顏色/text-shadow 不同），只要兩個頁面同時載入，就會互相污染覆蓋（後載入的 CSS 規則會蓋掉前面的）。

已確認過的污染源：
- `.poem-lines`：game4.css、game12.css、game13.css 都定義過（含舊琥珀色 `hsl(40,50%,80%)` + 黑色 `text-shadow: 0 4px 12px rgba(0,0,0,0.66)`）
- `.hearts` / `.heart`：多個 gameN.js 都用過

### 5.2 修法：每個遊戲的 class 一律加上 `gameN-` 前綴

例如 game4：
```js
// Before: l1Div.className = 'poem-lines';
// After:
l1Div.className = 'game4-poem-lines';
```
```css
/* Before: .poem-lines { ... } */
/* After: */
.game4-poem-lines { ... }
```

**紅心已被 `.fm-heart` 這個共用 class 取代**（見第 3.3 節），所以遷移到 fm-* 主題的遊戲不需要再另外加 `gameN-heart` 前綴，直接用 `fm-heart` 即可（`.fm-heart` 本身就是有前綴的共用 class，不會有污染問題）。

### 5.3 執行時務必檢查的地方（以 game4/game13 為例，逐一過一遍）

- `createDOM()` 裡 innerHTML 內的 `class="..."`
- `renderXXX()` / `updateXXX()` 裡 `element.className = '...'`
- 所有 `document.querySelectorAll('.poem-lines...')` 之類的選擇器字串
- CSS 檔裡所有 `.poem-lines`、`.poem-lines.xxx`、`.poem-lines span.xxx` 等複合選擇器（用 replace_all 一次全部改名最保險）
- 若有 `@media` 區塊也要檢查（game1.css 底部 `@media (max-width: 240px)` 曾漏改）

---

## 6. 詩句／答題狀態色彩統一規則

上半部套用 `.fm-*` 之後，下半部題目區的顏色**也建議**統一改用 `--fm-*` 變數（已在 game1/4/13 做過），讓宣紙底上的墨字風格一致：

```css
/* 詩句本體（墨字） */
.gameN-poem-lines {
    color: var(--fm-ink, #2e241b);
    /* 不要再用 text-shadow: 0 4px 12px rgba(0,0,0,0.66) 這種黑色重影，宣紙底上會很突兀 */
}

/* 遮蔽字（待答，◎ 符號常用這個 class） */
.gameN-poem-lines span.hidden-char {
    color: var(--fm-cinnabar-bright, #c94f3d);
}

/* 已答對字 */
.gameN-poem-lines span.correct-char {
    color: var(--fm-celadon, #3a7d5c);
}

/* 打字中／候選字（若遊戲有此狀態，如 game4 的拼字判定） */
.gameN-poem-lines span.char-typing {
    color: var(--fm-ink-faint, #8a6a3e);
}

/* 位置錯誤（若遊戲有此狀態） */
.gameN-poem-lines span.char-wrong-pos {
    color: hsl(220, 55%, 45%);
}

/* 完全錯誤 */
.gameN-poem-lines span.char-wrong {
    color: var(--fm-cinnabar, #c0392b);
}
```

答題按鈕（若遊戲有類似 `option-btn` / `ans-btn` 的四選一按鈕）比照 game1.css 的 `.game1-option-btn` 寫法：

```css
.gameN-option-btn {
    background: var(--fm-paper-card, #fbf5e6);
    color: var(--fm-ink, #2e241b);
    border: 4px solid var(--fm-border, #d8c193);
    box-shadow: var(--fm-shadow-btn, 0 4px 5px rgba(120, 90, 40, 0.22));
}
.gameN-option-btn:hover {
    border-color: var(--fm-border-strong, #b98e50);
    background: #fffdf3;
}
.gameN-option-btn.correct {
    background: var(--fm-correct-bg, #e4f0e2);
    border-color: var(--fm-correct-border, #7cbf93);
    color: var(--fm-correct-text, #245c3c);
}
.gameN-option-btn.wrong {
    background: var(--fm-wrong-bg, #f9e3df);
    border-color: var(--fm-wrong-border, #dd8a80);
    color: var(--fm-wrong-text, #8a2b20);
}
.gameN-option-btn.hint {
    background: var(--fm-hint-bg, #e2eaf4);
    border-color: var(--fm-hint-border, #8ba6cf);
    color: var(--fm-hint-text, #2d3f66);
}
```

> ⚠️ 墨黑組遊戲因為 `--fm-*` 變數會被 `.fm-theme-dark` 整組覆寫，理論上**不需要另外寫深色版本**，直接沿用 `var(--fm-xxx)` 即可自動變色。但答對/答錯/提示三色（`--fm-correct-*`、`--fm-wrong-*`、`--fm-hint-*`）目前**沒有**在 `.fm-theme-dark` 裡覆寫，墨黑組套用後這幾個顏色仍是淺色系（可能在深底上不夠突出），**這是已知待辦事項**，遷移墨黑組遊戲時請一併評估是否要幫這三組變數也加上 `.fm-theme-dark` 版本。

---

## 7. 計時器倒數框顏色寫法（game1 最新做法，供其他有計時 SVG 框的遊戲參考）

game1 使用 SVG `<rect>` 畫倒數框，顏色由 JS 即時計算 `stroke`。**使用者最新手動修改**：不要讓顏色從暗紅漸變到鮮紅（色相/明度都變），改成**色相固定在朱砂紅、只變化透明度**，視覺上更穩定不突兀：

```js
// game1.js updateTimerRing()，正常計時（非勝利動畫）分支：
rect.style.transition = ''; // 恢復 CSS 定義的過渡效果
rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
const elapsed = 1 - Math.max(0, Math.min(1, ratio));
rect.style.stroke = `hsla(0, 90%, 50%, ${Math.round(5 + 45 * elapsed)}%)`;
```

即：`hsl(0, 90%, 50%)` 固定為朱紅色相，透明度從 `5%`（剛開始）線性增加到 `50%`（時間到）。若其他遊戲也有類似「深紅→鮮紅」的計時框漸變寫法，建議統一改成這個 alpha-only 的模式。

CSS 端 `#gameN-timer-path` 的靜態 `stroke` 預設值也建議改用 `var(--fm-cinnabar, ...)`：

```css
#gameN-timer-path {
    fill: none;
    stroke: var(--fm-cinnabar, hsl(6, 63%, 46%));
    stroke-width: 10px;
    stroke-linecap: round;
    stroke-dasharray: 10000;
    stroke-dashoffset: 10000;
}
```

---

## 8. 難度標籤色彩：改用 `data-level` 屬性，勿用 JS inline 硬寫顏色

**Before（舊寫法，會蓋掉 CSS 主題）：**
```js
const colors = { '小學': '#27ae60', '中學': '#2980b9', ... };
diffTag.style.backgroundColor = colors[this.difficulty];
diffTag.style.color = '#fff';
```

**After（正確寫法）：**
```js
// updateUIForMode() 內
if (diffTag) diffTag.setAttribute('data-level', this.difficulty);
if (this.isLevelMode) {
    if (diffTag) diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
} else {
    if (diffTag) diffTag.textContent = this.difficulty;
}
```

顏色完全交給 `theme_xuanzhi.css` 的 `.fm-difficulty-tag[data-level="..."]` 規則決定（見 3.3 節）。HTML 初始 render 時也要記得帶上預設 `data-level`：

```html
<button class="fm-difficulty-tag" id="gameN-diff-tag" data-level="小學">小學</button>
```

---

## 9. 完整遷移 SOP Checklist（每款遊戲照此順序執行）

以 `gameN` 代稱要遷移的遊戲：

```
□ 判斷分組：米色 or 墨黑（見第 2 節表格；game7/17/18 跳過不做）

□ gameN.js — createDOM()
    □ overlay：div.className = 'gameN-overlay fm-overlay hidden'
      （墨黑組再加 fm-theme-dark：'gameN-overlay fm-overlay fm-theme-dark hidden'）
    □ 頂列：.gameN-header → .fm-header
    □ 分數：.gameN-score-board → .fm-scoreboard
    □ 控制鈕容器：.gameN-controls → .fm-controls
    □ 重來/開新局按鈕：.nav-btn → .fm-nav-btn
    □ 難度標籤：.gameN-difficulty-tag → .fm-difficulty-tag，並加上 data-level="小學"（預設值）
    □ 副標容器：.gameN-sub-header → .fm-sub-header
    □ 紅心：.hearts → .fm-hearts；紅心 span 的 .heart → .fm-heart
    □ 若原本有詩詞出處連結（.gameN-poem-info）：
        - 把該 <div id="gameN-info"> 從題目區移到 .fm-sub-header 內、.fm-hearts 之後
        - class 改為 .fm-poem-info
        - 題目區原位置留註解說明「已移至 fm-sub-header」
    □ 若原本沒有詩詞出處連結（如純題目 meta）：不動，維持在題目區原位

□ gameN.js — updateUIForMode()
    □ 移除 colors 物件與 diffTag.style.backgroundColor / .style.color 兩行 inline 硬寫
    □ 改為 diffTag.setAttribute('data-level', this.difficulty)

□ gameN.js — renderQuestion() / 詩詞資訊渲染處（若有）
    □ 詩名截斷邏輯統一改為「> 8 字則截 8 字 + …」
    □ 若原本用 innerHTML + inline <span style="..."> 產生連結樣式，改用 textContent（樣式交給 .fm-poem-info 統一處理）

□ gameN.js — renderHearts() / updateHearts() / ScoreManager heartsSelector 參數
    □ span.className = 'heart' → 'fm-heart'
    □ querySelectorAll('#gameN-hearts .heart') → querySelectorAll('#gameN-hearts .fm-heart')
    □ heartsSelector: '#gameN-hearts .heart:not(.empty)' → '#gameN-hearts .fm-heart:not(.empty)'

□ gameN.js — 若有全域污染 class（.poem-lines / .poem-info 等無前綴 class）
    □ 一律加上 gameN- 前綴（.gameN-poem-lines / .gameN-poem-info），JS/CSS 都要改，見第 5 節

□ gameN.css
    □ 刪除已上移至 theme_xuanzhi.css 的區塊：
      .gameN-overlay（視覺屬性部分）、.gameN-header、.gameN-score-board、
      .gameN-controls .nav-btn（含 :hover/:disabled）、.gameN-difficulty-tag（含各 data-level 與 :hover）、
      .gameN-sub-header、.hearts、.heart（含 .empty/.score）、.gameN-poem-info（若已改用 .fm-poem-info）
    □ 保留區塊改用位置留一行註解說明「已抽至 theme_xuanzhi.css 的 .fm-* 共用區塊」
    □ .gameN-poem-lines 系列（本體/hidden-char/correct-char/其他狀態）改用 --fm-* 變數（見第 6 節）
    □ 答題按鈕（.gameN-option-btn / .ans-btn 等）改用 --fm-* 變數（見第 6 節）
    □ 計時器 stroke 預設值改用 var(--fm-cinnabar, ...)（若有 SVG 計時框）
    □ 檢查 @media 區塊裡有沒有殘留的舊 class 名稱忘記改

□ 瀏覽器實測（務必做，勿只憑讀碼判斷）
    □ 啟動 preview server，導覽至 ?game=N，選任一難度進入遊戲
    □ 確認：overlay 背景為宣紙漸層（墨黑組則為深色）
    □ 確認：分數/控制鈕/難度標籤 樣式正確、data-level 有正確設置
    □ 確認：紅心靠左、詩詞出處（若有）靠右且不重疊，超長詩名有正確截斷
    □ 確認：詩句顏色為墨色、遮蔽字朱砂、答對字青碧，無殘留黑色 text-shadow
    □ 確認 console 無 error
    □ ⚠️ 若改了 CSS/JS 卻在瀏覽器看不到變化，很可能是「gameN.js 的 loadCSS() 動態注入了無版本號的 <link>」蓋掉了新內容，見第 10 節的除錯方法
```

---

## 10. 已知陷阱與除錯技巧

### 10.1 瀏覽器快取 + 動態 loadCSS 雙重載入問題（今日踩雷記錄）

大部分 `gameN.js` 都有這段自我防護：

```js
loadCSS: function () {
    if (!document.getElementById('gameN-css')) {
        const link = document.createElement('link');
        link.id = 'gameN-css';
        link.rel = 'stylesheet';
        link.href = 'gameN.css';   // ← 注意：無版本號
        document.head.appendChild(link);
    }
},
```

同時 `index.html` 也用 `<link>` 靜態載入了一次 `gameN.css`。當你改了 `gameN.css` 內容後：
- 如果只在 `index.html` 的靜態 `<link>` 加 `?v=xxx` 版本號強制重新抓取，**動態注入的那份（無版本號）仍會用瀏覽器快取的舊版本**，且因為是後插入 DOM，會**覆蓋**你剛更新的樣式，導致「明明改了 CSS，畫面卻沒變」的假象。
- **除錯方法**：
  1. 開 devtools console，執行 `document.querySelectorAll('link[href*="gameN.css"]')` 確認是否有兩個 `<link>`。
  2. 若要臨時驗證，可以手動移除多餘的那個：`document.querySelectorAll('link[href$="gameN.css"]').forEach(l=>l.remove())`，再重新整理畫面看效果。
  3. 或直接在瀏覽器做**硬性重新整理**（Ctrl+Shift+R / 清空快取重載）通常也能解決，因為兩份都會被強制重抓。
  4. 正式驗證完後，若在 `index.html` 加過 `?v=` 版本號僅供除錯用，**記得改完測完後要移除**，不要把除錯用的版本號字串留在 commit 裡（除非你們決定長期採用 cache-busting 版本號策略）。

### 10.2 CSS 選擇器改名要 replace_all，不要漏掉複合選擇器

例如 `.poem-lines.game4-hidden-line`、`.poem-lines span.hidden-char` 這種複合選擇器，改名時容易只改到單獨出現的 `.poem-lines`，漏掉組合寫法。建議改名前先 grep 一次該 class 在該檔案所有出現位置，全部列出來再逐一confirm。

### 10.3 `updateResponsiveLayout` 相關的殘留註解

多處程式碼裡有 `/* updateResponsiveLayout replaced */` 這種殘留註解（舊響應式方案被 `screen_adaptive.js` 取代後留下的），與本次主題遷移無關，**不要**因為看到而順手清理，維持現狀即可，除非使用者另外指示。

---

## 11. 檔案異動總覽（今日已完成，供比對參考）

| 檔案 | 異動狀態 |
|---|---|
| `theme_xuanzhi.css` | 新增（本次核心產出） |
| `index.html` | 新增一行 `<link>` 載入 `theme_xuanzhi.css`（置於 screen_adaptive.css 之後、achievement.css 之前） |
| `game1.js` / `game1.css` | ✅ 已完整遷移（含詩句色、答題按鈕色、計時框 alpha-only 動畫） |
| `game4.js` / `game4.css` | ✅ 已完整遷移 |
| `game13.js` / `game13.css` | ✅ 已完整遷移 |
| `game12.js` / `game12.css` | ⚠️ 僅完成 `.poem-lines`/`.poem-info` 全域污染改名（第 5 節），**尚未**套用 `.fm-*` 主題（第 3/4 節），今晚可從這款開始 |
| 其他所有 gameN | ❌ 全數未動 |

---

## 12. 給 Agent 的執行建議

1. 先讀本文件全文，再讀 `theme_xuanzhi.css`、`game1.js`、`game1.css`、`game4.js`、`game4.css`、`game13.js`、`game13.css` 作為範本（尤其是已完成的三款，逐行比對「改了什麼」比單看規則更快抓到手感）。
2. 依第 2 節分組表，**建議從 game12 開始**（已改名，少一步），接著挑幾款米色組（結構越接近 game1/4/13 的優先），最後才處理墨黑組（因為墨黑組要多驗證 `.fm-theme-dark` 覆寫效果，且答對/答錯/提示三色在深底上可能需要額外調整，見第 6 節末段的已知待辦）。
3. 每款務必照第 9 節 Checklist 做完**瀏覽器實測**再算完成，不要只憑讀碼判斷「應該沒問題」。
4. 每款遷移獨立一個小的 commit 或至少獨立回報，方便使用者隔天逐一 review，不要一次全部改完才回報（一旦某款有問題，範圍才好縮小）。
5. 若某款遊戲的 DOM 結構與 game1/4/13 差異較大（例如版面是垂直排列、沒有明確的 header/sub-header 分層），先回報使用者確認版面對應方式，不要自行大改版面結構——**本次遷移只換色與共用元件，不改版面**。
