(function () {
    // ============================================================
    // 遊戲二十一：橫批成詩 (The Poetry Banner)
    // 8(寬) × 13(高) 的「直棒拼圖」：每一欄是一根可上下滑動的直棒。
    // 中央第 7 列（0-based index 6）為「黃金橫批列」。
    // 玩家以二維拖曳讓黃框拼出謎題詩句。
    //
    // 規格要點（依使用者規範）：
    //   ① 棋盤寬度 = min(8, puzzleLength + decoyCount)；
    //      若 puzzleLength=7、maxDecoy=3，decoy 必須降為 1。
    //   ② 棋盤固定 13 列高，中央為第 7 列（index 6）。
    //   ③ 直棒可超出棋盤上下緣：任一字皆能被滑到中央列；
    //      換言之，bar[0] 最低可到中央列、bar[L-1] 最高可到中央列。
    //   ④ 直棒只用原始詩句字元，不補字、不截斷；長度自然不一。
    // ============================================================

    const GRID_ROWS = 13;
    const GRID_COLS_MAX = 8;
    const MIDDLE_ROW = 6;   // 0-based 第 7 列 = 黃金橫批列
    const CELL_PX = 50;     // 邏輯像素：每格寬高

    const Game21 = {
        // ---- 基本狀態 ----
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,

        // ---- 計時與計分 ----
        timer: 120,
        maxTimer: 120,
        timerInterval: null,
        startTime: null,
        score: 0,

        // ---- 題目資料 ----
        currentPoem: null,
        puzzleText: '',
        puzzleLength: 5,
        gridCols: 5,              // 本局實際棋盤欄位數（5~8）
        bars: [],                 // 所有直棒（建立後順序固定，currentCol 為權威位置）
        barEls: new Map(),        // bar -> DOM 元素 對應表
        revealedHintChars: 0,
        hintTimer: null,

        // ---- DOM 參考 ----
        container: null,
        gridEl: null,
        hintEl: null,
        gameStartTime: null,

        // ---- 拖曳狀態 ----
        drag: null,
        //timeLimit 時間限制
        // poemMinRating 詩詞評分
        // poemType 詩詞類型
        // hintDelaySec 提示延遲秒數
        // hintStep 提示顯示方式
        // stepInterval 提示間隔秒數
        // maxFixBarCount 固定直棒數量上限（每局實際數量 = 0 ~ maxFixBarCount 隨機）
        // maxDecoyCount 最大干擾棒數量
        // ---- 難度設定 ----
        // showRightChar：當答案棒的上下位置（中央列字）= 該棒的 targetChar 時，
        //                以金黃色顯示。僅小學開啟（會大幅降低難度）。
        //
        // 提示行（hintStep）規格說明：
        //   'never'       — 完全不顯示謎題字，提示行恆顯示「（無提示）」。
        //                   忽略 hintDelaySec、stepInterval。
        //   'instant'     — 新局開始的瞬間立即全部顯示。
        //                   忽略 hintDelaySec、stepInterval。
        //   'fullDelayed' — 等待 hintDelaySec 秒後一次全部顯示。
        //                   忽略 stepInterval。
        //   'progressive' — 先等待 hintDelaySec 秒，之後每 stepInterval 秒
        //                   依序揭示 1 個字，直到全部字顯示為止。
        // showWrongOnTimeout：時間到之後，答案區「非干擾」但字元不符的棒以紅色顯示，
        //   讓玩家一眼看出還沒對到的欄位。小學至大學開啟；研究所關閉（最高難度不給提示）。
        difficultySettings: {
            '小學': {
                timeLimit: 20, poemMinRating: 6, poemType: '五言',
                hintDelaySec: 8, hintStep: 'progressive', stepInterval: 2,
                maxFixBarCount: 3, maxDecoyCount: 0, showRightChar: true,
                showWrongOnTimeout: true
            },
            '中學': {
                timeLimit: 40, poemMinRating: 5, poemType: '五言',
                hintDelaySec: 21, hintStep: 'progressive', stepInterval: 5,
                maxFixBarCount: 2, maxDecoyCount: 1, showRightChar: false,
                showWrongOnTimeout: true
            },
            '高中': {
                timeLimit: 60, poemMinRating: 4, poemType: '七言',
                hintDelaySec: 31, hintStep: 'progressive', stepInterval: 10,
                maxFixBarCount: 2, maxDecoyCount: 2, showRightChar: false,
                showWrongOnTimeout: true
            },
            '大學': {
                timeLimit: 80, poemMinRating: 3, poemType: '七言',
                hintDelaySec: 59, hintStep: 'progressive', stepInterval: 10,
                maxFixBarCount: 1, maxDecoyCount: 3, showRightChar: false,
                showWrongOnTimeout: true
            },
            '研究所': {
                timeLimit: 100, poemMinRating: 3, poemType: '七言',
                hintDelaySec: 999, hintStep: 'never', stepInterval: 5,
                maxFixBarCount: 0, maxDecoyCount: 3, showRightChar: false,
                showWrongOnTimeout: false
            }
        },

        // 提示用的計時器控制把柄（要在 startHintReveal 時全部清掉，避免上局殘留）
        hintDelayHandle: null,

        // ------------------------------------------------------------
        // 動態載入本遊戲專屬的 CSS（game21.css）；
        // 若頁面已存在同 id 的 <link>，代表已載入過，直接略過避免重複插入。
        loadCSS: function () {
            if (!document.getElementById('game21-css')) {
                const link = document.createElement('link');
                link.id = 'game21-css';
                link.rel = 'stylesheet';
                link.href = 'game21.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入 CSS、建立（或重用）DOM 結構，並綁定「重來／開新局／難度標籤」
        // 三個按鈕的點擊事件。每次呼叫 show() 都會先執行本函式。
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game21-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game21-container');
            this.gridEl = document.getElementById('game21-grid');
            this.hintEl = document.getElementById('game21-hint');

            document.getElementById('game21-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game21-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game21-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立遊戲的整體 DOM 骨架（頂部分數列、提示列、棋盤容器、計時外框 SVG），
        // 只在第一次進入本遊戲時執行一次；並向外部的螢幕自適應模組註冊縮放/定位回呼。
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game21-container';
            div.className = 'game21-overlay hidden';
            div.innerHTML = `
                <div class="game21-header">
                    <div class="game21-score-board">分數: <span id="game21-score">0</span></div>
                    <div class="game21-controls">
                        <button class="game21-difficulty-tag" id="game21-diff-tag">小學</button>
                        <button id="game21-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game21-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game21-sub-header">
                    <div id="game21-hint" class="game21-hint"></div>
                </div>
                <div id="game21-area" class="game21-area">
                    <div class="game21-poem-info" id="game21-poem-info"></div>
                    <div id="game21-grid-container" class="game21-grid-container">
                        <svg id="game21-timer-ring">
                            <rect id="game21-timer-path" x="4" y="4"></rect>
                        </svg>
                        <div id="game21-grid" class="game21-grid"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        // 對外進入點：由主選單呼叫，開始初始化並顯示難度選擇畫面。
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度選擇彈窗；玩家選定難度後套用對應的 difficultySettings，
        // 更新畫面狀態並開始新的一局。若找不到 DifficultySelector 模組則直接開局（保底）。
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) clearInterval(this.hintTimer);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('橫批成詩', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    const s = this.difficultySettings[selectedLevel];
                    this.maxTimer = s.timeLimit;
                    this.timer = s.timeLimit;
                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    this.startNewGame();
                });
            } else {
                this.container.classList.remove('hidden');
                this.startNewGame();
            }
        },

        // 依目前是「一般難度模式」或「關卡模式」，更新難度標籤文字/顏色，
        // 並決定「開新局」按鈕是否顯示（關卡模式下不允許自由開新局，只能重來或進下一關）。
        updateUIForMode: function () {
            const diffTag = document.getElementById('game21-diff-tag');
            const retryBtn = document.getElementById('game21-retryGame-btn');
            const newBtn = document.getElementById('game21-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (this.isLevelMode) {
                if (diffTag) {
                    diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) {
                    diffTag.textContent = this.difficulty;
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        // 進入本遊戲全螢幕覆蓋層時，隱藏主頁面的卡片容器，避免背景內容穿透顯示。
        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },
        // 離開本遊戲時，還原主頁面卡片容器的顯示（清除 inline style，交回 CSS 預設值）。
        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        // 停止遊戲並關閉覆蓋層：清除計時器與提示排程、把 hintSession 遞增使殘留
        // 回呼失效，並還原頁面捲動與主內容顯示。
        stopGame: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) { clearInterval(this.hintTimer); this.hintTimer = null; }
            if (this.hintDelayHandle) { clearTimeout(this.hintDelayHandle); this.hintDelayHandle = null; }
            this._hintSession = (this._hintSession || 0) + 1; // 讓殘留回呼一律失效
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        // 「重來」：沿用同一首謎題詩，只重新打亂非固定（非 fix）直棒的位置，
        // 固定棒維持原位，計分歸零、重新啟動提示與計時器。
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            document.getElementById('game21-score').textContent = '0';
            if (window.GameMessage) window.GameMessage.hide();
            // ⚠️ 重來只打亂非 fix 棒，fix bar 維持原位不動：
            //   防止玩家多次「重來」透過 fix bar 位置變化推敲正解。
            this.randomizeBarsKeepFixed();
            this.renderGrid();
            this.startHintReveal();
            this.startTimer();
            document.getElementById('game21-retryGame-btn').disabled = false;
            document.getElementById('game21-newGame-btn').disabled = false;
        },

        // 「開新局」：重新抽取一首謎題詩（呼叫 prepareChallenge 產生全新題目），
        // 並重置分數、提示與計時器。若帶入 levelIndex 代表進入關卡模式的指定關卡。
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            document.getElementById('game21-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.gameStartTime = Date.now();

            this.prepareChallenge();
            this.startHintReveal();
            this.startTimer();
            document.getElementById('game21-retryGame-btn').disabled = false;
            document.getElementById('game21-newGame-btn').disabled = false;
        },

        // 關卡模式專用：關卡編號 +1 後直接開始下一局。
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // ------------------------------------------------------------
        // 題目準備
        // ------------------------------------------------------------
        prepareChallenge: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return;
            const s = this.difficultySettings[this.difficulty];

            // ⚠️ 規格⑤：只有「小學」固定五言；其它難度從 [5, 7] 隨機抽
            //   題目詩型由 wantLen 決定（5 或 7）。
            //   答案直棒的詩句長度不受此限（在 getSharedBarLine 內以 minLen/maxLen 控制）。
            const possibleLens = (s.poemType === '五言') ? [5] : [5, 7];
            const wantLen = possibleLens[Math.floor(Math.random() * possibleLens.length)];
            this.puzzleLength = wantLen;

            // ⚠️ 規格①：總欄位數最多 GRID_COLS_MAX(=8)
            const decoyCount = Math.max(0, Math.min(s.maxDecoyCount, GRID_COLS_MAX - wantLen));
            this.gridCols = wantLen + decoyCount;

            // 1. 題目詩：嚴格遵守 poemMinRating（規格④）；
            //    且該句的 line_ratings 也須 >= poemMinRating（避免好詩中的弱句被選為題目）；
            //    並排除「含 >1 個孤立字」的句子（規格②），減少 fix-bar 數量。
            const ratedPoems = POEMS.filter(p => (p.rating || 0) >= s.poemMinRating);

            // 收集所有 (poem, line) 的合格候選；最後從中隨機抽一個
            const validCandidates = [];
            for (const p of ratedPoems) {
                const lineRatings = p.line_ratings || [];
                const content = p.content || [];
                for (let li = 0; li < content.length; li++) {
                    const line = content[li];
                    const clean = this.stripPunct(line);
                    if (clean.length !== wantLen) continue;
                    // ⚠️ 句評分也必須 >= poemMinRating
                    if ((lineRatings[li] || 0) < s.poemMinRating) continue;
                    // ⚠️ 規格②：謎題句中孤立字（無法在其它句找到）最多允許 1 個
                    if (typeof window.countIsolatedChars === 'function'
                        && window.countIsolatedChars(clean) > 1) continue;
                    validCandidates.push({ poem: p, line, clean });
                }
            }
            // 條件過嚴退無候選 → 放寬至原規格的篩選（仍保留「句評分 ≥ poemMinRating」要求）
            let chosenCandidate;
            if (validCandidates.length === 0) {
                for (const p of ratedPoems) {
                    const lineRatings = p.line_ratings || [];
                    const content = p.content || [];
                    for (let li = 0; li < content.length; li++) {
                        const line = content[li];
                        const clean = this.stripPunct(line);
                        if (clean.length !== wantLen) continue;
                        if ((lineRatings[li] || 0) < s.poemMinRating) continue;
                        validCandidates.push({ poem: p, line, clean });
                    }
                }
            }
            // 再放寬：只要詩評分達標即可（孤立字與句評分都不檢查）
            if (validCandidates.length === 0) {
                for (const p of ratedPoems) {
                    for (const line of (p.content || [])) {
                        const clean = this.stripPunct(line);
                        if (clean.length === wantLen) {
                            validCandidates.push({ poem: p, line, clean });
                        }
                    }
                }
            }
            if (validCandidates.length === 0) {
                alert('找不到符合條件的詩詞。');
                return;
            }
            // 關卡模式：以 currentLevelIndex 確定性挑選
            const pickIdx = this.isLevelMode
                ? (this.currentLevelIndex * 7919) % validCandidates.length
                : Math.floor(Math.random() * validCandidates.length);
            chosenCandidate = validCandidates[pickIdx];
            const poem = chosenCandidate.poem;
            this.currentPoem = poem;
            this.puzzleText = chosenCandidate.clean;

            // 2. 為每個謎題字配對直棒（共用 getSharedBarLine — 全詩庫、加權隨機）
            //    ⚠️ 規格④：直棒詩句不受 poemMinRating 限制，但內部已做評分加權。
            //    ⚠️ 規格⑤：直棒長度允許 4~12 字（五言、七言皆可作為直棒）。
            const puzzleChars = this.puzzleText.split('');
            const bars = [];
            const usedLines = new Set([chosenCandidate.clean]);
            puzzleChars.forEach((ch, i) => {
                const lineStr = window.getSharedBarLine(ch, {
                    minLen: 4,
                    maxLen: 12,
                    excludePoemId: poem.id,
                    excludeLines: usedLines,
                    preferMid: true
                });
                const charString = lineStr || ch; // 終極保底：單字（極罕見）
                if (lineStr) usedLines.add(lineStr);
                // 取 targetChar 最接近中段的索引位置
                const mid = charString.length / 2;
                let bestIdx = -1, bestDist = Infinity;
                for (let k = 0; k < charString.length; k++) {
                    if (charString[k] === ch) {
                        const d = Math.abs(k - mid);
                        if (d < bestDist) { bestDist = d; bestIdx = k; }
                    }
                }
                bars.push({
                    charString,
                    targetIdx: bestIdx,
                    targetChar: ch,
                    puzzleColIdx: i,
                    isDecoy: false,
                    isFixed: false,
                    currentCol: 0,
                    offset: 0
                });
            });

            // 3. 干擾棒：以「不含任何謎題字」為過濾條件，從全詩庫加權挑選
            const puzzleCharSet = new Set(puzzleChars);
            for (let i = 0; i < decoyCount; i++) {
                const decoyClean = this.pickDecoyLine(puzzleCharSet, usedLines);
                if (decoyClean) {
                    usedLines.add(decoyClean);
                    bars.push({
                        charString: decoyClean,
                        targetIdx: -1,
                        targetChar: null,
                        isDecoy: true,
                        isFixed: false,
                        currentCol: 0,
                        offset: 0
                    });
                }
            }

            this.bars = bars;
            this.randomizeBars(true);

            // 詩詞資訊
            let title = poem.title;
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const info = document.getElementById('game21-poem-info');
            info.textContent = `${title} / ${poem.dynasty} / ${poem.author}`;
            info.onclick = () => {
                if (window.PoemDialog) window.PoemDialog.openById(poem.id);
            };
            // ⚠️ 規格：只有「小學」難度會在開局就顯示詩名（教學用意）；
            //   其餘難度必須等玩家過關才能看到，避免透過詩名/作者反推答案作弊。
            info.style.visibility = (this.difficulty === '小學') ? '' : 'hidden';

            this.renderGrid();
        },

        // 去除標點符號與空白，只留下純文字（用於比對詩句長度與內容）。
        stripPunct: function (s) {
            return (s || '').replace(/[，。？！、：；「」『』\s]/g, '');
        },
        // 回傳去除標點後的純文字長度。
        cleanLen: function (s) {
            return this.stripPunct(s).length;
        },

        // ------------------------------------------------------------
        // 干擾棒選句：「不含任何謎題字」的詩句，從全詩庫加權挑（評分高的優先，
        // 但同分內隨機，避免每局都用同一句）
        // ------------------------------------------------------------
        pickDecoyLine: function (excludeSet, usedLines) {
            const candidates = [];
            for (const p of POEMS) {
                for (const line of (p.content || [])) {
                    if (usedLines.has(line)) continue;
                    const clean = this.stripPunct(line);
                    if (clean.length < 4 || clean.length > 12) continue;
                    let bad = false;
                    for (const c of clean) {
                        if (excludeSet.has(c)) { bad = true; break; }
                    }
                    if (!bad) candidates.push({ clean, rating: p.rating || 0 });
                }
            }
            if (!candidates.length) return null;
            // 加權隨機：rating+1 為權重
            const totalW = candidates.reduce((s, it) => s + (it.rating + 1), 0);
            let r = Math.random() * totalW;
            for (const it of candidates) {
                r -= (it.rating + 1);
                if (r <= 0) return it.clean;
            }
            return candidates[candidates.length - 1].clean;
        },

        // ------------------------------------------------------------
        // 隨機化欄位順序與垂直位移
        // ⚠️ 規格③：bar.offset 是「bar[0] 所在的顯示列索引」
        //    offset 範圍：[MIDDLE_ROW - L + 1, MIDDLE_ROW]
        //    → bar[0] 最低可到中央列、bar[L-1] 最高可到中央列
        //    bar[i] 顯示於 row = offset + i
        //    中央列當前字 = bar[MIDDLE_ROW - offset]
        // ------------------------------------------------------------
        randomizeBars: function (assignFixed) {
            const s = this.difficultySettings[this.difficulty];

            // 1. 隨機打散欄位順序
            const order = this.bars.map((_, i) => i);
            this.shuffleInPlace(order);
            order.forEach((origIdx, displayCol) => {
                this.bars[origIdx].currentCol = displayCol;
            });

            // 2. 為每根棒設定 offset，保證謎棒的目標字「不在」中央列
            for (const bar of this.bars) {
                const L = bar.charString.length;
                const minOff = MIDDLE_ROW - L + 1;
                const maxOff = MIDDLE_ROW;
                let off, tries = 0;
                do {
                    off = minOff + Math.floor(Math.random() * (maxOff - minOff + 1));
                    tries++;
                    if (bar.targetIdx < 0) break; // 干擾棒不限制
                    if (MIDDLE_ROW - off !== bar.targetIdx) break;
                } while (tries < 20);
                bar.offset = off;
                bar.isFixed = false;
            }

            // 3. 預置棒：✨ 數量於 [0, maxFixBarCount] 範圍內隨機，每局不同
            //    位置上下左右全部就位（targetChar 落在中央列、currentCol = puzzleColIdx）且完全鎖定
            //    - currentCol = puzzleColIdx（正確欄位）
            //    - offset 設為使中央列字 = targetChar（上下也正確）
            //    - isFixed = true（左右拖曳禁止移動、垂直亦鎖定）
            if (assignFixed) {
                const puzzleBars = this.bars.filter(b => !b.isDecoy);
                this.shuffleInPlace(puzzleBars);
                // 若本局有單一字的答案棒，優先鎖定它（給玩家明確錨點）；其餘隨機。
                // 穩定排序：charString.length === 1 排前面，同組內維持上面隨機洗牌的順序
                puzzleBars.sort((a, b) =>
                    (a.charString.length === 1 ? 0 : 1) - (b.charString.length === 1 ? 0 : 1)
                );
                // 隨機決定本局實際 fix 棒數量
                // ⚠️ 規則：maxFixBarCount > 0 時，至少保證 1 根（避免低難度
                //    某些局完全沒有預置棒，玩家少了「分步學習」的引導）
                const maxFix = Math.min(s.maxFixBarCount, puzzleBars.length);
                const fixCount = maxFix > 0
                    ? 1 + Math.floor(Math.random() * maxFix)   // 1 ~ maxFix
                    : 0;
                for (let i = 0; i < fixCount; i++) {
                    const bar = puzzleBars[i];
                    this.swapBarsToCol(bar, bar.puzzleColIdx);
                    // offset 使 bar[targetIdx] 落在中央列：MIDDLE_ROW - offset = targetIdx
                    bar.offset = MIDDLE_ROW - bar.targetIdx;
                    bar.isFixed = true;
                }
            }
        },

        // ------------------------------------------------------------
        // 重來專用：只重新隨機化「非 fix」棒的欄位順序與垂直位移；
        // fix bar 的 currentCol / offset / isFixed 全部保留不動。
        // ------------------------------------------------------------
        randomizeBarsKeepFixed: function () {
            // 1. 只取出非 fix 棒重新排列
            const movableBars = this.bars.filter(b => !b.isFixed);
            // fix bar 已佔用的欄位
            const fixedCols = new Set(this.bars.filter(b => b.isFixed).map(b => b.currentCol));
            // 可用欄位 = 全部欄位 - fix bar 佔用欄位
            const freeCols = [];
            for (let c = 0; c < this.gridCols; c++) {
                if (!fixedCols.has(c)) freeCols.push(c);
            }
            // 洗牌可用欄位並分配給非 fix 棒
            this.shuffleInPlace(freeCols);
            movableBars.forEach((bar, i) => {
                bar.currentCol = freeCols[i];
            });

            // 2. 重新隨機化非 fix 棒的垂直位移，保證謎棒目標字不在中央列
            for (const bar of movableBars) {
                const L = bar.charString.length;
                const minOff = MIDDLE_ROW - L + 1;
                const maxOff = MIDDLE_ROW;
                let off, tries = 0;
                do {
                    off = minOff + Math.floor(Math.random() * (maxOff - minOff + 1));
                    tries++;
                    if (bar.targetIdx < 0) break;
                    if (MIDDLE_ROW - off !== bar.targetIdx) break;
                } while (tries < 20);
                bar.offset = off;
            }
        },

        // 把 bar 換到 targetCol：與該位置原本的棒交換 currentCol
        // ⚠️ 不重排 this.bars 陣列，僅更新各 bar 的 currentCol 屬性
        // 第三參數 respectFixed=true 時：若 targetCol 上有 fix bar，拒絕交換
        swapBarsToCol: function (bar, targetCol, respectFixed) {
            if (bar.currentCol === targetCol) return false;
            const other = this.bars.find(b => b !== bar && b.currentCol === targetCol);
            if (respectFixed && other && other.isFixed) return false;
            const oldCol = bar.currentCol;
            bar.currentCol = targetCol;
            if (other) other.currentCol = oldCol;
            return true;
        },

        // 標準 Fisher-Yates 洗牌演算法：原地打亂陣列元素順序。
        shuffleInPlace: function (arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        },

        // ------------------------------------------------------------
        // 渲染棋盤（建立 bar DOM 並建立 barEls Map）
        // ------------------------------------------------------------
        renderGrid: function () {
            const grid = this.gridEl;
            if (!grid) return;
            grid.innerHTML = '';
            this.barEls.clear();
            grid.style.width = (this.gridCols * CELL_PX + 4) + 'px'; //加 4 因為最右邊的答案棒有點凸出去
            grid.style.height = (GRID_ROWS * CELL_PX) + 'px';

            // 黃金橫批列底色裝飾
            const yellowRowEl = document.createElement('div');
            yellowRowEl.className = 'game21-yellow-row';
            yellowRowEl.style.top = (MIDDLE_ROW * CELL_PX) + 'px';
            yellowRowEl.style.height = CELL_PX + 'px';
            yellowRowEl.style.width = (this.gridCols * CELL_PX) + 'px';
            grid.appendChild(yellowRowEl);

            // ⚠️ 規格：先找出每根答案棒「正確歸位」所佔的列範圍，
            //   再在該答案欄內把上下超出這個範圍的區塊標成紅色斜線區，
            //   提醒玩家答案卡的中央字必須落在黃列上，其他列都是不可放置區。
            //   → 正確歸位時，答案棒佔用列：[MIDDLE_ROW - targetIdx, MIDDLE_ROW - targetIdx + L - 1]
            //   → 混淆棒所在欄位（col >= puzzleLength）完全不標記，混淆欄本身無正解概念。
            this.bars.forEach(bar => {
                if (bar.isDecoy) return;
                const col = bar.puzzleColIdx;
                const L = bar.charString.length;
                const correctTop = MIDDLE_ROW - bar.targetIdx;
                const correctBottom = correctTop + L - 1;
                // 上緣不可放置區：rows [0, correctTop - 1]
                if (correctTop > 0) {
                    const above = document.createElement('div');
                    above.className = 'game21-no-drop-zone hidden';
                    above.dataset.col = col;
                    above.style.left = (col * CELL_PX) + 'px';
                    above.style.top = '0px';
                    above.style.width = CELL_PX + 'px';
                    above.style.height = (correctTop * CELL_PX) + 'px';
                    grid.appendChild(above);
                }
                // 下緣不可放置區：rows [correctBottom + 1, GRID_ROWS - 1]
                if (correctBottom < GRID_ROWS - 1) {
                    const below = document.createElement('div');
                    below.className = 'game21-no-drop-zone hidden';
                    below.dataset.col = col;
                    below.style.left = (col * CELL_PX) + 'px';
                    below.style.top = ((correctBottom + 1) * CELL_PX) + 'px';
                    below.style.width = CELL_PX + 'px';
                    below.style.height = ((GRID_ROWS - 1 - correctBottom) * CELL_PX) + 'px';
                    grid.appendChild(below);
                }
            });

            // 直棒
            this.bars.forEach(bar => {
                const barEl = document.createElement('div');
                barEl.className = 'game21-bar';
                if (bar.isFixed) barEl.classList.add('fixed');
                if (bar.isDecoy) barEl.classList.add('decoy');
                barEl.style.width = CELL_PX + 'px';
                barEl.style.height = (bar.charString.length * CELL_PX) + 'px';
                this.applyBarPosition(barEl, bar);

                if (bar.isFixed) {
                    const lock = document.createElement('div');
                    lock.className = 'game21-bar-lock';
                    lock.textContent = '🔒';
                    barEl.appendChild(lock);
                } else {
                    // ⚠️ 規格：可移動棒上方顯示「上下左右」四向箭頭，提醒玩家可拖曳
                    const arrows = document.createElement('div');
                    arrows.className = 'game21-bar-arrows';
                    arrows.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></svg>';
                    barEl.appendChild(arrows);
                }
                for (let i = 0; i < bar.charString.length; i++) {
                    const cell = document.createElement('div');
                    cell.className = 'game21-cell';
                    cell.textContent = bar.charString[i];
                    cell.style.height = CELL_PX + 'px';
                    cell.style.width = CELL_PX + 'px';
                    barEl.appendChild(cell);
                }
                this.attachDragHandlers(barEl, bar);
                grid.appendChild(barEl);
                this.barEls.set(bar, barEl);
            });

            this.updateYellowRowHighlight();
            setTimeout(() => this.updateTimerRing(1), 0);
        },

        // 套用 bar 的視覺位置：left = currentCol * CELL_PX, top = offset * CELL_PX
        applyBarPosition: function (barEl, bar) {
            barEl.style.left = (bar.currentCol * CELL_PX) + 'px';
            barEl.style.top = (bar.offset * CELL_PX) + 'px';
        },

        // ------------------------------------------------------------
        // 黃框字配對指示
        // 中央列當前字 = bar[MIDDLE_ROW - bar.offset]
        // ------------------------------------------------------------
        // ⚠️ 規格⑤：僅小學（showRightChar=true）顯示「上下位置正確」的金黃色字
        //   - 命中條件：中央列字 === bar.targetChar（垂直已對齊正解）
        //   - 不開啟此功能的難度，中央列字一律以普通色顯示，避免提示破壞挑戰
        updateYellowRowHighlight: function () {
            const s = this.difficultySettings[this.difficulty] || {};
            const showRight = !!s.showRightChar;
            this.bars.forEach(bar => {
                const barEl = this.barEls.get(bar);
                if (!barEl) return;
                const cells = barEl.querySelectorAll('.game21-cell');
                cells.forEach(c => c.classList.remove('yellow-hit', 'yellow-miss'));
                if (!showRight) return; // 非小學：完全不顯示中央列字色提示
                const idx = MIDDLE_ROW - bar.offset;
                if (idx < 0 || idx >= cells.length) return;
                if (bar.currentCol >= this.gridCols) return;
                if (bar.isDecoy) return; // 干擾棒無「正解」概念
                const ch = bar.charString[idx];
                if (ch && bar.targetChar && ch === bar.targetChar) {
                    cells[idx].classList.add('yellow-hit');
                }
            });
        },

        // ------------------------------------------------------------
        // 拖曳處理：以 pointer events 統一滑鼠／觸控
        // ⚠️ 重要：DOM 元素位置只由 currentCol 與 offset 推導；
        //    swap 後重新呼叫 applyBarPosition 即可，不再依賴 DOM 順序。
        // ------------------------------------------------------------
        // 為單一直棒的 DOM 元素綁定 pointerdown/move/up/cancel 事件，
        // 實作「左右換位（可跳過固定棒）」與「上下滑動（受最大/最小 offset 限制）」的拖曳邏輯，
        // 放開時（onUp）才進行勝利判定，避免玩家用拖曳掃過正解取巧得分。
        attachDragHandlers: function (barEl, bar) {
            const onDown = (e) => {
                if (!this.isActive) return;
                // ⚠️ 規格②：fix bar 完全不可拖曳（也不顯示 dragging 視覺）
                if (bar.isFixed) return;
                e.preventDefault();
                const scale = window.stageScale || 1;
                this.drag = {
                    bar: bar,
                    barEl: barEl,
                    startX: e.clientX,
                    startY: e.clientY,
                    scale: scale,
                    origCol: bar.currentCol,
                    origOffset: bar.offset
                };
                barEl.classList.add('dragging');
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (barEl.setPointerCapture && e.pointerId !== undefined) {
                    try { barEl.setPointerCapture(e.pointerId); } catch (err) { }
                }
            };
            const onMove = (e) => {
                if (!this.isActive) return; // 勝利後完全凍結，所有移動忽略
                if (!this.drag || this.drag.bar !== bar) return;
                e.preventDefault();
                // ⚠️ 規格①+②：fix bar 上下左右皆不可移動，直接忽略所有拖曳
                if (bar.isFixed) return;
                const d = this.drag;
                const dx = (e.clientX - d.startX) / d.scale;
                const dy = (e.clientY - d.startY) / d.scale;

                // === 水平換位 ===
                // ⚠️ 規格：fix bar 是「牆」，自己不會被移動，但可跳過 —
                //   兩側的可移動棒能越過 fix bar 互相交換位置。
                //   實作方式：一步步往目標欄推進；若下一格是 fix bar，
                //   就「跳過」連續的 fix bar 找到第一根非 fix 的對象互換。
                const colDelta = Math.round(dx / CELL_PX);
                const wantCol = Math.max(0, Math.min(this.gridCols - 1, d.origCol + colDelta));
                if (wantCol !== bar.currentCol) {
                    const dir = wantCol > bar.currentCol ? 1 : -1;
                    let cur = bar.currentCol;
                    let changed = false;
                    while (cur !== wantCol) {
                        // 從 cur 往 dir 方向尋找第一個「非 fix」的目標欄位
                        let nextCol = cur + dir;
                        let occupant = null;
                        while (nextCol >= 0 && nextCol < this.gridCols) {
                            occupant = this.bars.find(b => b.currentCol === nextCol);
                            if (!occupant || !occupant.isFixed) break;
                            nextCol += dir; // 連續 fix bar 一起跳過
                        }
                        if (nextCol < 0 || nextCol >= this.gridCols) break;
                        // 若跳過 fix bar 後已超出 wantCol，視為無法到達 → 停止
                        if (dir > 0 && nextCol > wantCol) break;
                        if (dir < 0 && nextCol < wantCol) break;
                        // 進行跳躍式互換：bar 落到 nextCol，原 occupant 落到 bar 原本的 cur
                        // （中間被跳過的 fix bar 完全不動）
                        bar.currentCol = nextCol;
                        if (occupant) occupant.currentCol = cur;
                        cur = nextCol;
                        changed = true;
                    }
                    if (changed) {
                        this.bars.forEach(b => {
                            const el = this.barEls.get(b);
                            if (el) this.applyBarPosition(el, b);
                        });
                        if (window.SoundManager) window.SoundManager.playSuccessShort();
                        this.updateYellowRowHighlight();
                        // 水平換位不改變垂直對齊狀態，但仍同步一次紅色區可見性以防萬一
                        this.updateNoDropZoneVisibility();
                    }
                }

                // === 垂直滑動 ===
                const offDelta = Math.round(dy / CELL_PX);
                const L = bar.charString.length;
                const minOff = MIDDLE_ROW - L + 1;
                const maxOff = MIDDLE_ROW;
                const newOff = Math.max(minOff, Math.min(maxOff, d.origOffset + offDelta));
                if (newOff !== bar.offset) {
                    bar.offset = newOff;
                    this.applyBarPosition(barEl, bar);
                    this.updateYellowRowHighlight();
                    // ⚠️ 垂直對齊變動 → 重新評估該欄紅色區是否該顯示
                    this.updateNoDropZoneVisibility();
                    if (window.SoundManager) window.SoundManager.playGuzheng(Math.abs(newOff) % 7, 0.4);
                    // ⚠️ 規格：勝利判定改為「鬆開滑鼠／手指離開」時才觸發，
                    //   防止玩家刻意拖曳掃過正解位置取巧得分。
                }
            };
            const onUp = (e) => {
                if (!this.drag || this.drag.bar !== bar) return;
                barEl.classList.remove('dragging');
                this.drag = null;
                if (this.checkWin()) this.handleWin();
            };
            barEl.addEventListener('pointerdown', onDown);
            barEl.addEventListener('pointermove', onMove);
            barEl.addEventListener('pointerup', onUp);
            barEl.addEventListener('pointercancel', onUp);
        },

        // ------------------------------------------------------------
        // 勝利判定：讀取黃框前 puzzleLength 欄的實際字元
        // ------------------------------------------------------------
        // 勝利判定：依序讀出黃金橫批列前 puzzleLength 欄目前對齊的字元，
        // 拼接後與 puzzleText（正解）完全相同才算過關。
        checkWin: function () {
            const candidate = [];
            for (let col = 0; col < this.puzzleLength; col++) {
                const bar = this.bars.find(b => b.currentCol === col);
                if (!bar) return false;
                const idx = MIDDLE_ROW - bar.offset;
                if (idx < 0 || idx >= bar.charString.length) return false;
                candidate.push(bar.charString[idx]);
            }
            return candidate.join('') === this.puzzleText;
        },

        // 過關處理：凍結所有直棒（禁止再拖曳）、停止計時與提示、依難度計算並加總分數、
        // 逐欄播放「亮字」動畫與音效，最後交給 ScoreManager 播放勝利動畫並呼叫 gameOver(true)。
        handleWin: function () {
            if (!this.isActive) return;
            this.isActive = false;
            // ⚠️ 勝利瞬間凍結所有棒：清掉進行中的拖曳、將每根棒標為 fixed
            //   （isFixed=true 會讓 onDown 直接 return；CSS 顯示 not-allowed 游標）
            this.drag = null;
            this.bars.forEach(b => {
                b.isFixed = true;
                const el = this.barEls.get(b);
                if (el) {
                    el.classList.remove('dragging');
                    el.classList.add('fixed');
                }
            });
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) clearInterval(this.hintTimer);

            // 過關加分：每個答案字 × getPointA（套用難度倍率）
            const perChar = window.ScoreManager.getPointA('game21', this.difficulty);
            this.score += perChar * this.puzzleText.length;
            document.getElementById('game21-score').textContent = Math.floor(this.score);

            // 過關解鎖詩名顯示
            const info = document.getElementById('game21-poem-info');
            if (info) info.style.visibility = '';

            // 黃框字逐欄亮起，同時將正確答案棒標為 .won（綠色底、金色字保留）
            const cells = [];
            for (let col = 0; col < this.puzzleLength; col++) {
                const bar = this.bars.find(b => b.currentCol === col);
                if (!bar) continue;
                const barEl = this.barEls.get(bar);
                if (!barEl) continue;
                // ⚠️ 規格：混淆棒始終維持土黃色，因此不加 .won（win 時答案區其實不會有 decoy）
                if (!bar.isDecoy) barEl.classList.add('won');
                const idx = MIDDLE_ROW - bar.offset;
                const c = barEl.querySelectorAll('.game21-cell')[idx];
                if (c) cells.push(c);
            }
            cells.forEach((c, i) => {
                setTimeout(() => {
                    c.classList.add('win-flash');
                    if (window.SoundManager) window.SoundManager.playGuzheng(i, 1.0);
                }, i * 180);
            });
            setTimeout(() => {
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();
            }, cells.length * 180);

            document.getElementById('game21-retryGame-btn').disabled = true;
            document.getElementById('game21-newGame-btn').disabled = true;

            setTimeout(() => {
                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game21',
                    timerContainerId: 'game21-grid-container',
                    scoreElementId: 'game21-score',
                    heartsSelector: null,
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.gameOver(true, '');
                    }
                });
            }, cells.length * 180 + 400);
        },

        // ------------------------------------------------------------
        // 提示行
        // ------------------------------------------------------------
        // ------------------------------------------------------------
        // 提示行系統 — 規格詳見 difficultySettings 上方註解
        // ⚠️ 關鍵修正：必須同時清掉 setTimeout（hintDelayHandle）與
        //    setInterval（hintTimer），否則上局排程的 setTimeout 會在
        //    下一局延後觸發，造成「研究所卻顯示了提示」的錯誤。
        // 同時用 sessionId 防呆：每局遞增，舊回呼觸發時若不符即放棄。
        // ------------------------------------------------------------
        startHintReveal: function () {
            // 1. 清掉上一局所有未觸發的提示排程
            if (this.hintTimer) { clearInterval(this.hintTimer); this.hintTimer = null; }
            if (this.hintDelayHandle) { clearTimeout(this.hintDelayHandle); this.hintDelayHandle = null; }
            // 2. 用 sessionId 隔離本局與舊局回呼
            this._hintSession = (this._hintSession || 0) + 1;
            const mySession = this._hintSession;

            this.revealedHintChars = 0;
            // ⚠️ 每局提示重跑時，紅色區也要回到「未啟動」，等新的顯示時機重新開啟
            this.noDropZoneActive = false;
            const s = this.difficultySettings[this.difficulty];

            // never：完全不顯示，提示行恆為「（無提示）」，提早 return
            //   ⚠️ 此難度亦不顯示紅色斜線非答案卡區域（不給玩家任何提示）
            if (s.hintStep === 'never') {
                if (this.hintEl) this.hintEl.textContent = '（無提示）';
                return;
            }
            // instant：立即全顯（同時亮起非答案卡區域紅色斜線）
            if (s.hintStep === 'instant') {
                this.revealedHintChars = this.puzzleText.length;
                this.renderHint();
                this.showNoDropZone();
                return;
            }
            // 先渲染全部為 "_" 佔位符
            this.renderHint();

            // fullDelayed / progressive：等待 hintDelaySec 秒後處理
            //   ⚠️ 紅色斜線非答案卡區域在此時（第一個提示字浮現的瞬間）同步顯示，
            //   而不是等到全部提示字揭曉完畢。
            this.hintDelayHandle = setTimeout(() => {
                this.hintDelayHandle = null;
                if (mySession !== this._hintSession) return; // 已切換到新局
                if (!this.isActive) return;
                this.showNoDropZone();
                if (s.hintStep === 'fullDelayed') {
                    this.revealedHintChars = this.puzzleText.length;
                    this.renderHint();
                    return;
                }
                // progressive：每 stepInterval 秒揭一個字
                if (s.hintStep === 'progressive') {
                    const step = Math.max(0.1, s.stepInterval) * 1000;
                    this.hintTimer = setInterval(() => {
                        if (mySession !== this._hintSession) { clearInterval(this.hintTimer); this.hintTimer = null; return; }
                        if (!this.isActive) { clearInterval(this.hintTimer); this.hintTimer = null; return; }
                        if (this.revealedHintChars >= this.puzzleText.length) {
                            clearInterval(this.hintTimer); this.hintTimer = null;
                            return;
                        }
                        this.revealedHintChars++;
                        this.renderHint();
                    }, step);
                }
            }, Math.max(0, s.hintDelaySec) * 1000);
        },

        // ⚠️ 開啟紅色斜線區的「顯示模式」（提示開始時觸發）；
        //   之後由 updateNoDropZoneVisibility() 依各答案棒目前狀態決定顯示哪些欄。
        showNoDropZone: function () {
            this.noDropZoneActive = true;
            this.updateNoDropZoneVisibility();
        },

        // ⚠️ 規格（防作弊修正）：紅色禁止放置區一旦顯示就必須「維持顯示」，
        //   直到玩家開始新的一局或重來才會消失（見 renderGrid 重新建立為 hidden）。
        //   舊版做法是依「該答案棒目前是否上下對齊正確」動態隱藏/顯示對應欄的紅色區，
        //   等於變相告訴玩家「紅色消失＝這個位置是對的」，玩家只要任意拖曳測試
        //   哪一欄的紅色會消失，就能直接找出正解位置，形同作弊捷徑。
        //   因此改為：一旦觸發顯示（noDropZoneActive），全部紅色區一律持續顯示，
        //   不再依任何棒的目前狀態動態隱藏。
        updateNoDropZoneVisibility: function () {
            if (!this.gridEl || !this.noDropZoneActive) return;
            this.gridEl.querySelectorAll('.game21-no-drop-zone').forEach(el => {
                el.classList.remove('hidden');
            });
        },

        renderHint: function () {
            if (!this.hintEl) return;
            const chars = this.puzzleText.split('');
            const html = chars.map((c, i) =>
                i < this.revealedHintChars
                    ? `<span class="game21-hint-char shown">${c}</span>`
                    : `<span class="game21-hint-char hidden">_</span>`
            ).join('');
            this.hintEl.innerHTML = html;
            // ⚠️ 規格：非小學難度的詩名只在玩家過關後才顯示，
            //   因此這裡不再因「提示字全顯」而解鎖詩名（防止提示揭完 = 直接看答案）。
        },

        // ------------------------------------------------------------
        // 計時器
        // ------------------------------------------------------------
        // 啟動倒數計時器：每 100ms 更新一次計時外框（SVG 進度環），
        // 時間歸零時停止提示排程並延遲 1 秒後判定為輸（時間到）。
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    clearInterval(this.timerInterval);
                    if (this.hintTimer) clearInterval(this.hintTimer);
                    setTimeout(() => this.gameOver(false, '時間到！'), 1000);
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        // 更新棋盤外框的 SVG 計時進度環。ratio 為剩餘時間比例（1=滿、0=歸零）。
        // mode==='win' 時改用勝利動畫的漸層金色樣式；一般模式則依剩餘時間由暗轉紅。
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game21-timer-path');
            const container = document.getElementById('game21-grid-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game21-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            const rw = w - 8;
            const rh = h - 8;
            if (rw < 0 || rh < 0) return;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);
            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsla(0, 90%, 50%, ${Math.round(5 + 45 * elapsed)}%)`;
            }
        },

        // ------------------------------------------------------------
        // 遊戲結束處理：無論勝負皆會呼叫。win=true 表示過關；win=false 表示逾時失敗。
        // 負責：失敗時視需求標示錯誤棒、記錄失敗場次、切換按鈕可用狀態，
        // 並顯示結算訊息（GameMessage），依情境決定下一步（下一關/下一局/再試一次）。
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;

            // ⚠️ 規格：時間到（!win）之後，若難度啟用 showWrongOnTimeout，
            //   將所有「未正確歸位」的答案卡與混淆卡都以紅色顯示。判定：
            //     正確歸位 = 非 decoy、currentCol < puzzleLength、且中央列字元 = puzzleText[currentCol]
            //   任何不符者（含混淆棒、上下對錯欄的答案棒、被推到 decoy 區的答案棒）皆標紅。
            if (!win) {
                const s = this.difficultySettings[this.difficulty] || {};
                if (s.showWrongOnTimeout) {
                    this.bars.forEach(bar => {
                        let isCorrect = false;
                        if (!bar.isDecoy && bar.currentCol < this.puzzleLength) {
                            const idx = MIDDLE_ROW - bar.offset;
                            const ch = (idx >= 0 && idx < bar.charString.length)
                                ? bar.charString[idx] : '';
                            if (ch === this.puzzleText[bar.currentCol]) isCorrect = true;
                        }
                        if (!isCorrect) {
                            const barEl = this.barEls.get(bar);
                            if (barEl) barEl.classList.add('wrong');
                        }
                    });
                }
            }

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 21,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game21-retryGame-btn').disabled = true;
                document.getElementById('game21-newGame-btn').disabled = true;
            } else {
                document.getElementById('game21-retryGame-btn').disabled = false;
                document.getElementById('game21-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMessage = () => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? this.score : 0,
                        reason: win ? '' : reason,
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game21', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game21', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        }
    };

    window.Game21 = Game21;

    if (new URLSearchParams(window.location.search).get('game') === '21') {
        setTimeout(() => {
            if (window.Game21) window.Game21.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
