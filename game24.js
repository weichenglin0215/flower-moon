/* =========================================
   Game24《三字成珠》(Three-In-A-Verse)
   ----------------------------------------
   花月版 A1 三消連線版 ── 源自 Candy Crush 的「拖曳交換 + 同字三連消除」玩法。
   玩家在漢字棋盤上拖曳交換相鄰字塊，形成同字三連即可消除並收集詩句字頻。
   完成一句進入下一句，集滿整首詩過關。
   ----------------------------------------
   依《.agent/skills/花月開發常見錯誤與解法.md §4》規範撰寫：
   - 全域 class 前綴 game24-
   - loadCSS() 動態防護
   - overlay 掛載 document.body 且套用 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 完整支援關卡挑戰模式
   - 時限以「實際詩詞字數 × timeLimitRate」計算
   ========================================= */

(function () {
    const Game24 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // ── 詩詞相關 ──
        currentPoem: null,       // 當前選中的詩詞物件
        poemLines: [],           // 詩句陣列（每行為一句純文字）
        targetChars: [],         // 全詩所有字（合併後的單字陣列），用於計算時限
        currentLineIndex: 0,     // 當前正在收集的句子索引
        currentLineChars: [],    // 當前句去重後的目標字陣列
        collectProgress: {},     // 當前句字頻收集進度 { 字: 已收集次數 }
        collectTarget: 0,        // 每字需收集次數

        // ── 棋盤相關 ──
        rows: 8,
        cols: 7,
        board: [],               // 二維陣列：{ char, isPower:'h'|'v'|'star'|null, id }
        cellElements: [],        // 對應 DOM
        cellIdCounter: 0,

        // ── 玩家互動 ──
        isDragging: false,
        dragStartCell: null,     // { r, c, x, y }
        isAnimating: false,      // 連鎖/補位動畫鎖
        movesLeft: 0,            // 剩餘步數（步數模式）
        maxMoves: 0,             // 本局起始步數（用於紅白倒數框分段）
        hintTimer: null,         // 閒置提示計時器（hintDelay 觸發）
        hintedCells: [],         // 當前正發光的字塊 DOM 陣列（拖曳起點 + 終點）

        // ── 計時器 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        /*
         * 難度設定（嚴格依企劃書 §7）
         * timeLimitRate：每字時間倍率（秒）。0 = 不使用時限（步數模式）。
         *                實際時限 = targetChars.length × timeLimitRate
         * moveLimitRate：步數倍率（浮點）。0 = 不使用步數限制（時間模式）。
         *               總步數 = round(全詩字數 × moveLimitRate × collectTarget)
         *               例：moveLimitRate=1.5、全詩 14 字、collectTarget=2 → 42 步
         * poemMinRating：詩評下限
         * rowsCfg/colsCfg：棋盤尺寸
         * decoyRatio   ：干擾字比例（0~1）
         * collectTarget：每字需收集次數
         * refillBias   ：加權補位強度（0~1）。0 = 純隨機；1 = 完全偏袒缺口字
         */
        difficultySettings: {
            '小學': {
                timeLimitRate: 0, moveLimitRate: 1.3, poemMinRating: 6, rowsCfg: 7, colsCfg: 7,
                decoyRatio: 0.00, collectTarget: 2, refillBias: 0.40, hintDelay: 2,
                minLines: 2, maxLines: 2, minChars: 8, maxChars: 14
            },
            '中學': {
                timeLimitRate: 0, moveLimitRate: 1.1, poemMinRating: 5, rowsCfg: 7, colsCfg: 7,
                decoyRatio: 0.00, collectTarget: 3, refillBias: 0.30, hintDelay: 3,
                minLines: 2, maxLines: 4, minChars: 10, maxChars: 20
            },
            '高中': {
                timeLimitRate: 0, moveLimitRate: 0.9, poemMinRating: 4, rowsCfg: 8, colsCfg: 7,
                decoyRatio: 0.00, collectTarget: 3, refillBias: 0.20, hintDelay: 5,
                minLines: 4, maxLines: 4, minChars: 14, maxChars: 28
            },
            '大學': {
                timeLimitRate: 0, moveLimitRate: 0.8, poemMinRating: 3, rowsCfg: 9, colsCfg: 7,
                decoyRatio: 0.00, collectTarget: 4, refillBias: 0.10, hintDelay: 0,
                minLines: 4, maxLines: 6, minChars: 20, maxChars: 42
            },
            '研究所': {
                timeLimitRate: 0, moveLimitRate: 0.7, poemMinRating: 3, rowsCfg: 10, colsCfg: 7,
                decoyRatio: 0.00, collectTarget: 5, refillBias: 0.00, hintDelay: 0,
                minLines: 4, maxLines: 8, minChars: 28, maxChars: 56
            }
        },

        // 連鎖讚辭詞庫（取代西式 Combo）
        chainPraises: ['妙手', '神來', '絕唱', '生花', '驚鴻', '繞樑', '吟絕', '入聖'],

        // ── 目標字色相：依當前句目標字位置等分 360°（相同字永遠同色） ──
        //   高亮度搭配中彩度（亮 75% / 彩 60%）→ 由 renderBoard 套用至 CSS 變數
        //   非目標（干擾）字維持灰調，避免搶走目標字注意力
        getHueForChar: function (ch) {
            if (!ch) return 40;
            const idx = this.currentLineChars.indexOf(ch);
            if (idx >= 0) {
                const n = this.currentLineChars.length || 1;
                // 起始偏移 12°，避免第一個字為純紅；等分後取整
                return Math.round((360 / n) * idx + 12) % 360;
            }
            // 干擾字：雜湊穩定（保證同字同色），但 renderBoard 會強制套灰調
            let h = 0;
            for (let i = 0; i < ch.length; i++) h = (h * 31 + ch.charCodeAt(i)) >>> 0;
            return h % 360;
        },

        // ── CSS 載入防護（避免重複載入造成全域污染） ──
        loadCSS: function () {
            if (!document.getElementById('game24-css')) {
                const link = document.createElement('link');
                link.id = 'game24-css';
                link.rel = 'stylesheet';
                link.href = 'game24.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game24-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game24-container');
        },

        // 建立 overlay DOM 並掛載至 document.body（非 #stage，避免 scale 重複縮放）
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game24-container';
            div.className = 'game24-overlay hidden';
            div.innerHTML = `
                <div class="game24-header">
                    <div class="game24-score-board">分數: <span id="game24-score">0</span></div>
                    <div class="game24-controls">
                        <button class="game24-difficulty-tag" id="game24-diff-tag">小學</button>
                        <button id="game24-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game24-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game24-sub-header">
                    <div id="game24-moves-label" class="game24-moves-label" style="display:none">盤面:<span id="game24-stage-text">1/1</span> 步數:<span id="game24-moves">0</span>/<span id="game24-max-moves">0</span></div>
                    <div id="game24-poem-info" class="poem-info" style="cursor:pointer; text-decoration:underline; opacity:0.85;"></div>
                </div>
                <div class="game24-info-bar">
                    <div id="game24-line-text" class="game24-line-text" style="display:none"></div>
                    <div id="game24-progress" class="game24-progress"></div>
                </div>
                <div class="game24-area">
                    <div id="game24-board-wrapper" class="game24-board-wrapper">
                        <svg id="game24-timer-ring">
                            <rect id="game24-timer-path" x="3" y="3"></rect>
                            <rect id="game24-moves-path-white" x="3" y="3"></rect>
                            <rect id="game24-moves-path-red" x="3" y="3"></rect>
                        </svg>
                        <div id="game24-board" class="game24-board"></div>
                        <div id="game24-chain-praise" class="game24-chain-praise hidden"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放（依 stage 視窗適配系統 §3.1）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = 500 + 'px';
                    div.style.height = 850 + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }

            // 控制按鈕綁定
            document.getElementById('game24-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game24-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game24-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 拖曳事件（同時支援滑鼠與觸控）
            const board = document.getElementById('game24-board');
            board.addEventListener('mousedown', this.onDragStart.bind(this));
            board.addEventListener('touchstart', this.onDragStart.bind(this), { passive: false });
            window.addEventListener('mousemove', this.onDragMove.bind(this));
            window.addEventListener('touchmove', this.onDragMove.bind(this), { passive: false });
            window.addEventListener('mouseup', this.onDragEnd.bind(this));
            window.addEventListener('touchend', this.onDragEnd.bind(this));
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 隱藏其他頁面 overlay，避免畫面疊加
        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container',
                'game4-container', 'game5-container', 'game6-container', 'game7-container',
                'game8-container', 'game9-container', 'game10-container', 'game11-container',
                'game12-container', 'game13-container', 'game14-container', 'game15-container',
                'game16-container', 'game17-container', 'game18-container', 'game19-container',
                'game20-container', 'game21-container', 'game22-container', 'game23-container'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('三字成珠', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.SoundManager) window.SoundManager.init();
                    this.startNewGame();
                });
            }
        },

        // 更新 UI 模式（挑戰模式 vs 一般模式）
        updateUIForMode: function () {
            const diffTag = document.getElementById('game24-diff-tag');
            const retryBtn = document.getElementById('game24-retryGame-btn');
            const newBtn = document.getElementById('game24-newGame-btn');
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

        // 隱藏遊戲（保留 stopGame 統一清理）
        hide: function () {
            this.stopGame();
        },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，必須在此隱藏 container
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // 重來：使用同一首詩重新發牌
        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        // 開新局：重抽詩詞
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 抽詩（共用 getSharedRandomPoem）
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要先載入 script.js 中的 getSharedRandomPoem 函數');
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                settings.minLines,
                settings.maxLines,
                settings.minChars,
                settings.maxChars,
                '',
                this.isLevelMode ? this.currentLevelIndex : null,
                'game24'
            );
            if (!result) return false;
            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            // 全詩字陣列（不含標點）── 用於計算時限與全局字頻
            this.targetChars = this.poemLines.join('').split('');

            const poemInfo = document.getElementById('game24-poem-info');
            // 詩名顯示截斷至 16 字內，避免與「盤面/步數」標籤重疊
            const fullName = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            poemInfo.textContent = fullName.length > 16 ? (fullName.slice(0, 15) + '…') : fullName;
            poemInfo.title = fullName; // 滑鼠停留可看全名
            poemInfo.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // 啟動本局流程
        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.currentLineIndex = 0;
            this.isAnimating = false;

            const settings = this.difficultySettings[this.difficulty];
            this.rows = settings.rowsCfg;
            this.cols = settings.colsCfg;
            this.collectTarget = settings.collectTarget;
            // 總步數 = round(全詩字數 × moveLimitRate × collectTarget)
            //   moveLimitRate = 0 → 不使用步數限制（時間模式 / 無限制）
            const totalChars = (this.targetChars && this.targetChars.length) || 0;
            this.maxMoves = settings.moveLimitRate > 0
                ? Math.max(1, Math.round(totalChars * settings.moveLimitRate * this.collectTarget))
                : 0;
            this.movesLeft = this.maxMoves;
            console.log('[game24] 總步數計算：' + totalChars + ' 字 × ' + settings.moveLimitRate + ' × ' + this.collectTarget + ' = ' + this.maxMoves + ' 步');

            document.getElementById('game24-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            // 啟用按鈕
            document.getElementById('game24-retryGame-btn').disabled = false;
            document.getElementById('game24-newGame-btn').disabled = false;

            // ⚠️ 時限必須在抽詩之後、用實際 targetChars.length 計算（§1.1 規範）
            const timerSvg = document.getElementById('game24-timer-ring');
            const timerPath = document.getElementById('game24-timer-path');
            const movesPathRed = document.getElementById('game24-moves-path-red');
            const movesPathWhite = document.getElementById('game24-moves-path-white');
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
                this.timer = this.maxTimer;
                timerSvg.style.display = 'block';
                if (timerPath) timerPath.style.display = 'block';
                if (movesPathRed) movesPathRed.style.display = 'none';
                if (movesPathWhite) movesPathWhite.style.display = 'none';
                this.startTimer();
            } else {
                this.maxTimer = 0;
                if (timerPath) timerPath.style.display = 'none';
                clearInterval(this.timerInterval);
            }

            // 顯示/隱藏步數列與紅白倒數框
            const movesLabel = document.getElementById('game24-moves-label');
            if (this.maxMoves > 0) {
                movesLabel.style.display = 'inline-block';
                this._updateMovesLabel();
                // 啟用紅白倒數框（在 SVG 環內，與時限框互斥）
                timerSvg.style.display = 'block';
                if (movesPathRed) movesPathRed.style.display = 'block';
                if (movesPathWhite) movesPathWhite.style.display = 'block';
            } else {
                movesLabel.style.display = 'none';
                if (movesPathRed) movesPathRed.style.display = 'none';
                if (movesPathWhite) movesPathWhite.style.display = 'none';
            }

            // ⚠️ 依 rows/cols 動態設定 wrapper 高度，確保每格為正方形
            //    必須在 startCurrentLine（產生棋盤）前先設好，棋盤渲染才能取到正確尺寸
            this._resizeBoardWrapper();
            requestAnimationFrame(() => this.updateMovesRing());

            this.startCurrentLine();
        },

        // ── 依 rows/cols 計算 wrapper 高度，保證 cell = 正方形 ──
        //    cell 邊長 = (wrapper_width - 28px padding) / cols
        //    wrapper 高度 = cell 邊長 × rows + 28px padding
        _resizeBoardWrapper: function () {
            const wrapper = document.getElementById('game24-board-wrapper');
            if (!wrapper) return;
            const PAD = 14 * 2; // CSS: padding: 14px (左右、上下)
            let w = wrapper.offsetWidth;
            if (!w) w = wrapper.getBoundingClientRect().width;
            if (!w || !this.cols || !this.rows) return;
            const cell = (w - PAD) / this.cols;
            const targetH = Math.round(cell * this.rows + PAD);
            wrapper.style.height = targetH + 'px';
        },

        // ── 開始當前句的收集 ──
        startCurrentLine: function () {
            const line = this.poemLines[this.currentLineIndex] || '';
            // 句中去重後的目標字
            const uniqueChars = [];
            const seen = {};
            for (const ch of line) {
                if (!seen[ch]) { seen[ch] = true; uniqueChars.push(ch); }
            }
            this.currentLineChars = uniqueChars;
            this.collectProgress = {};
            uniqueChars.forEach(ch => { this.collectProgress[ch] = 0; });
            this._prevCollectProgress = {}; // 換句時重置進度燈快照，避免誤觸 just-lit

            this.updateLineDisplay();
            this.generateBoard();
            this.renderBoard();
            this._updateMovesLabel();
            this.scheduleHint();
        },

        // ── 閒置提示：difficultySettings.hintDelay 秒未拖曳則對可移動字塊發光 ──
        scheduleHint: function () {
            this.clearHint();
            const settings = this.difficultySettings[this.difficulty];
            const delay = settings && settings.hintDelay;
            if (!delay || delay <= 0) return;
            this.hintTimer = setTimeout(() => this.showHint(), delay * 1000);
        },

        clearHint: function () {
            if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
            if (this.hintedCells && this.hintedCells.length) {
                this.hintedCells.forEach(el => { if (el) { el.classList.remove('hint'); el.classList.remove('hint-target'); } });
                this.hintedCells = [];
            }
        },

        // 找一組可拖曳形成 ≥3 連的字塊對；正確標示「起點」（要拖的字）與「終點」（拖往的方向）
        //
        // 關鍵：交換 (A↔B) 後，三連在哪一側決定了起點。
        //   若 match 落在 B 位置 → A 的字遷移到 B 後加入了同字三連 → 起點 = A、終點 = B
        //   若 match 落在 A 位置 → B 的字遷移到 A 後加入了同字三連 → 起點 = B、終點 = A
        // 例：要把「問借問」變成「問問問」(借跳走、第二個問跳過來)，
        //     原局 …問借問… 拖第三個「問」往左跟「借」交換 → match 在 A 位置 →
        //     起點是右側「問」(金光)、終點是左側「借」(青光)。
        // 掃描所有可拖曳交換、挑選「最長 match」作為提示，鼓勵玩家累積 4 連 / 5 連道具
        showHint: function () {
            if (!this.isActive || this.isAnimating || this.isDragging) return;
            let best = null; // { sr,sc,tr,tc, len }
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (c + 1 < this.cols) {
                        const info = this._swapMatchInfo(r, c, r, c + 1);
                        if (info && (!best || info.maxLen > best.len)) {
                            // info.side 'a' → 起=B 終=A；'b' → 起=A 終=B
                            const pair = info.side === 'b'
                                ? { sr: r, sc: c, tr: r, tc: c + 1 }
                                : { sr: r, sc: c + 1, tr: r, tc: c };
                            best = Object.assign(pair, { len: info.maxLen });
                        }
                    }
                    if (r + 1 < this.rows) {
                        const info = this._swapMatchInfo(r, c, r + 1, c);
                        if (info && (!best || info.maxLen > best.len)) {
                            const pair = info.side === 'b'
                                ? { sr: r, sc: c, tr: r + 1, tc: c }
                                : { sr: r + 1, sc: c, tr: r, tc: c };
                            best = Object.assign(pair, { len: info.maxLen });
                        }
                    }
                }
            }
            if (best) this._markHintPair(best.sr, best.sc, best.tr, best.tc);
        },

        // 交換後檢查 → 回傳 { side: 'a'|'b', maxLen: 該 match 最長連字數 } 或 null
        //   maxLen 用於提示優先序：5 連 > 4 連 > 3 連
        _swapMatchInfo: function (r1, c1, r2, c2) {
            this.swap(r1, c1, r2, c2);
            const matches = this.findAllMatches();
            this.swap(r1, c1, r2, c2);
            let bestSide = null, bestLen = 0;
            for (const m of matches) {
                let hitA = false, hitB = false;
                for (const cell of m.cells) {
                    if (cell.r === r1 && cell.c === c1) hitA = true;
                    if (cell.r === r2 && cell.c === c2) hitB = true;
                }
                if (!hitA && !hitB) continue;
                if (m.length > bestLen) {
                    bestLen = m.length;
                    bestSide = hitB ? 'b' : 'a';
                }
            }
            return bestLen > 0 ? { side: bestSide, maxLen: bestLen } : null;
        },

        // sr/sc = 起點（玩家要拖的字，.hint 金光）；tr/tc = 終點（拖往的方向，.hint-target 青光）
        // 更新「盤面:X/Y 步數:n/N」標籤（每次開新句、每走一步呼叫）
        _updateMovesLabel: function () {
            const stageEl = document.getElementById('game24-stage-text');
            const movesEl = document.getElementById('game24-moves');
            const maxEl = document.getElementById('game24-max-moves');
            const totalLines = this.poemLines ? this.poemLines.length : 1;
            if (stageEl) stageEl.textContent = (this.currentLineIndex + 1) + '/' + totalLines;
            if (movesEl) movesEl.textContent = this.movesLeft;
            if (maxEl) maxEl.textContent = this.maxMoves;
        },

        _markHintPair: function (sr, sc, tr, tc) {
            const a = this.cellElements[sr] && this.cellElements[sr][sc];
            const b = this.cellElements[tr] && this.cellElements[tr][tc];
            if (a) { a.classList.add('hint'); this.hintedCells.push(a); }
            if (b) { b.classList.add('hint-target'); this.hintedCells.push(b); }
        },

        // 更新句子顯示與每字進度卡片
        //   每組為直排：上方彩色字塊（與棋盤同色）、下方 X/Y 數量
        //   多組橫排，總寬必小於 .game24-progress 容器（auto-fit、字塊自動縮放）
        // animateNewlyLit：若 true，對「本次新達標」的卡片加 just-lit 彈跳
        updateLineDisplay: function (animateNewlyLit) {
            const lineEl = document.getElementById('game24-line-text');
            const progEl = document.getElementById('game24-progress');
            const line = this.poemLines[this.currentLineIndex] || '';
            lineEl.innerHTML = `〈第 ${this.currentLineIndex + 1}/${this.poemLines.length} 句〉<span class="game24-line-poem">${line}</span>`;

            const prevGot = this._prevCollectProgress || {};
            let html = '';
            this.currentLineChars.forEach(ch => {
                const got = Math.min(this.collectTarget, this.collectProgress[ch] || 0);
                const prev = Math.min(this.collectTarget, prevGot[ch] || 0);
                const done = got >= this.collectTarget;
                const justDone = animateNewlyLit && done && prev < this.collectTarget;
                const hue = this.getHueForChar(ch);
                // data-char 供字魂特效定位（落點為這張卡）
                html += `<span class="game24-char-group ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g24-h:${hue}">`
                    + `<span class="game24-char-tile">${ch}</span>`
                    + `<span class="game24-char-count"><span class="game24-char-num">${got}</span>/<span class="game24-char-den">${this.collectTarget}</span></span>`
                    + `</span>`;
            });
            progEl.innerHTML = html;

            this._prevCollectProgress = Object.assign({}, this.collectProgress);
        },

        // ── 棋盤生成（嚴格保證初始無三連） ──
        generateBoard: function () {
            this.board = [];
            for (let r = 0; r < this.rows; r++) {
                const row = [];
                for (let c = 0; c < this.cols; c++) {
                    row.push(this.makeNewTile(r, c, true));
                }
                this.board.push(row);
            }
            // 後處理：cell-by-cell 嚴格掃描修正（保證後續絕無三連）
            this.eliminateInitialTriples();
            // 死局自動洗牌（最多 5 次嘗試）
            for (let i = 0; i < 5; i++) {
                if (this.hasPossibleMove()) break;
                this.shuffleBoard();
                this.eliminateInitialTriples();
            }
        },

        // 由左上往右下逐格掃描；若該格與「同列前兩格」或「同欄上兩格」構成三連，
        // 強制把本格字改成「不與兩個前置同字的任何可用字」。
        // 改字後 = 該方向絕無三連；又因尚未到達後續格，後續格將以更新後的棋盤再判定。
        // ⚠️ currentLineChars 必須 ≥ 2 個唯一字才能保證；單字成詩本就不會三連消除。
        eliminateInitialTriples: function () {
            const pool = (this.currentLineChars && this.currentLineChars.length >= 2)
                ? this.currentLineChars.slice() : null;
            if (!pool) return;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cur = this.board[r][c].char;
                    // 同列前兩格
                    const left1 = (c >= 1) ? this.board[r][c - 1].char : null;
                    const left2 = (c >= 2) ? this.board[r][c - 2].char : null;
                    // 同欄上兩格
                    const up1 = (r >= 1) ? this.board[r - 1][c].char : null;
                    const up2 = (r >= 2) ? this.board[r - 2][c].char : null;
                    const conflictH = (left1 !== null && left1 === left2 && cur === left1);
                    const conflictV = (up1 !== null && up1 === up2 && cur === up1);
                    if (!conflictH && !conflictV) continue;
                    // 從 pool 找第一個既不與 left1 也不與 up1 相同的字
                    let replacement = null;
                    for (const ch of pool) {
                        if (ch === cur) continue;
                        if (left1 !== null && left1 === left2 && ch === left1) continue;
                        if (up1 !== null && up1 === up2 && ch === up1) continue;
                        replacement = ch; break;
                    }
                    if (replacement === null) {
                        // pool 只有兩字且都剛好被禁 → 找任一非當前字（仍可能形成下次掃描修正）
                        for (const ch of pool) { if (ch !== cur) { replacement = ch; break; } }
                    }
                    if (replacement !== null) this.board[r][c].char = replacement;
                }
            }
        },

        // 產生一個新字塊；avoidTriples=true 時避開與上方/左方形成三連
        makeNewTile: function (r, c, avoidTriples) {
            const ch = this.pickWeightedChar();
            const tile = { char: ch, isPower: null, id: ++this.cellIdCounter };
            if (avoidTriples) {
                let attempt = 0;
                while (attempt < 20) {
                    const a = (r >= 2 && this.board[r - 1] && this.board[r - 2]) ? this.board[r - 1][c].char : null;
                    const b = (r >= 2 && this.board[r - 2]) ? this.board[r - 2][c].char : null;
                    const a2 = (c >= 2 && this.board[r] && this.board[r][c - 1]) ? this.board[r][c - 1].char : null;
                    const b2 = (c >= 2 && this.board[r] && this.board[r][c - 2]) ? this.board[r][c - 2].char : null;
                    if ((a !== tile.char || b !== tile.char) && (a2 !== tile.char || b2 !== tile.char)) break;
                    tile.char = this.pickWeightedChar();
                    attempt++;
                }
            }
            return tile;
        },

        // 加權字塊抽選：依當前句字頻缺口、refillBias 動態加權
        pickWeightedChar: function () {
            const settings = this.difficultySettings[this.difficulty];
            const bias = settings.refillBias;
            // 計算當前句剩餘需求
            const deficits = this.currentLineChars.map(ch => {
                const got = this.collectProgress[ch] || 0;
                return Math.max(0, this.collectTarget - got);
            });
            const totalDeficit = deficits.reduce((a, b) => a + b, 0);

            // 是否使用干擾字（從全詩其他句字 + 一些常用詩詞字）
            // ⚠️ decoyRatio === 0 → 完全禁止干擾字（即使句已收集完仍從當前句字補位）
            const useDecoy = settings.decoyRatio > 0 && Math.random() < settings.decoyRatio;
            const allDoneFallback = totalDeficit === 0 && settings.decoyRatio > 0;
            if (useDecoy || allDoneFallback) {
                // 干擾字池：全詩其他句字 + 全棋盤可能字（fallback）
                const otherChars = [];
                this.poemLines.forEach((ln, i) => {
                    if (i !== this.currentLineIndex) {
                        for (const ch of ln) otherChars.push(ch);
                    }
                });
                if (otherChars.length > 0) {
                    return otherChars[Math.floor(Math.random() * otherChars.length)];
                }
                // 退化：從全詩隨抽
                return this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
            }

            // 加權偏袒缺口字：bias 機率使用加權，(1-bias) 機率均勻隨機
            if (Math.random() < bias && totalDeficit > 0) {
                let pick = Math.random() * totalDeficit;
                for (let i = 0; i < this.currentLineChars.length; i++) {
                    pick -= deficits[i];
                    if (pick <= 0) return this.currentLineChars[i];
                }
            }
            // 均勻隨機從當前句字中選
            return this.currentLineChars[Math.floor(Math.random() * this.currentLineChars.length)];
        },

        // 渲染棋盤 DOM
        // animateNew：是否對「新生」字塊（自上方掉落補位）加 spawn 動畫
        renderBoard: function (animateNew) {
            const boardEl = document.getElementById('game24-board');
            boardEl.innerHTML = '';
            // 動態設定棋盤格線
            boardEl.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
            boardEl.style.gridTemplateRows = `repeat(${this.rows}, 1fr)`;
            this.cellElements = [];
            // 估算每格大小 → 字體 = 80% 方框（避免出現過小或過大字體）
            let boardW = boardEl.offsetWidth, boardH = boardEl.offsetHeight;
            if (boardW === 0 || boardH === 0) {
                const rb = boardEl.getBoundingClientRect();
                boardW = rb.width; boardH = rb.height;
            }
            const cellSize = Math.min((boardW - this.cols * 3) / this.cols, (boardH - this.rows * 3) / this.rows);
            const cellFontPx = Math.max(12, Math.floor(cellSize * 0.8));
            // 目標字集合（用於判斷干擾字）：當前句字 + 全詩其他句字也視為「目標相關」
            const lineCharsSet = {};
            this.currentLineChars.forEach(ch => { lineCharsSet[ch] = true; });
            for (let r = 0; r < this.rows; r++) {
                const rowEls = [];
                for (let c = 0; c < this.cols; c++) {
                    const div = document.createElement('div');
                    div.className = 'game24-cell';
                    div.dataset.r = r;
                    div.dataset.c = c;
                    const t = this.board[r][c];
                    div.textContent = t.char;
                    // 字體 = 方框 80%
                    div.style.fontSize = cellFontPx + 'px';
                    // 套用色相（依當前句字位置 360° 分配；相同字必為相同底色）
                    const hue = this.getHueForChar(t.char);
                    div.style.setProperty('--g24-h', hue);
                    // 干擾字（非當前句目標）使用低飽和灰調，讓玩家一眼識別「真目標」
                    if (!lineCharsSet[t.char]) {
                        div.classList.add('decoy');
                    } else {
                        // 目標字：高亮度（75%）+ 中彩度（60%）搭配深色字提高可讀性
                        div.style.setProperty('--g24-s', '70%');
                        div.style.setProperty('--g24-l', '60%');
                        div.style.setProperty('--g24-text', `hsl(${hue}, 90%, 25%)`);
                    }
                    if (t.isPower === 'h') div.classList.add('power-h');
                    else if (t.isPower === 'v') div.classList.add('power-v');
                    else if (t.isPower === 'star') div.classList.add('power-star');
                    // 標記新生字塊（補位）→ 觸發 spawn 掉落動畫（依列序階梯延遲）
                    if (animateNew && t._isNew) {
                        div.classList.add('spawn');
                        const delay = t._spawnDelay || 0;
                        if (delay > 0) div.style.setProperty('--g24-delay', delay + 'ms');
                        setTimeout(() => { div.classList.remove('spawn'); div.style.removeProperty('--g24-delay'); }, 460 + delay);
                        delete t._isNew; delete t._spawnDelay;
                    } else if (animateNew && t._isFalling) {
                        div.classList.add('fall');
                        const delay = t._fallDelay || 0;
                        if (delay > 0) div.style.setProperty('--g24-delay', delay + 'ms');
                        setTimeout(() => { div.classList.remove('fall'); div.style.removeProperty('--g24-delay'); }, 360 + delay);
                        delete t._isFalling; delete t._fallDelay;
                    }
                    boardEl.appendChild(div);
                    rowEls.push(div);
                }
                this.cellElements.push(rowEls);
            }
            // 啟動後同步計時條尺寸
            requestAnimationFrame(() => this.updateTimerRing(this.maxTimer ? this.timer / this.maxTimer : 1));
        },

        // ── 拖曳輸入 ──
        getCellFromPoint: function (clientX, clientY) {
            const el = document.elementFromPoint(clientX, clientY);
            if (el && el.classList && el.classList.contains('game24-cell')) {
                return { r: parseInt(el.dataset.r), c: parseInt(el.dataset.c), el };
            }
            return null;
        },

        onDragStart: function (e) {
            if (!this.isActive || this.isAnimating) return;
            // 玩家開始操作 → 清除閒置提示
            this.clearHint();
            e.preventDefault();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX; clientY = e.clientY;
            }
            const cell = this.getCellFromPoint(clientX, clientY);
            if (!cell) return;
            this.isDragging = true;
            this.dragStartCell = { r: cell.r, c: cell.c, x: clientX, y: clientY };
            cell.el.classList.add('selected');
            if (window.SoundManager) window.SoundManager.playOpenItem();
        },

        onDragMove: function (e) {
            // 拖曳期間：讓被選中的字塊跟著游標移動（限制單格距離內），正式交換仍在 onDragEnd 結算
            if (!this.isDragging || !this.dragStartCell) return;
            if (e.cancelable) e.preventDefault();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX; clientY = e.clientY;
            }
            const start = this.dragStartCell;
            const scale = window.stageScale || 1;
            const rawDx = (clientX - start.x) / scale;
            const rawDy = (clientY - start.y) / scale;
            // 主軸鎖定：只沿水平或垂直其中一軸移動，並限制在「一格寬」內，避免穿越多格
            const startEl = this.cellElements[start.r] && this.cellElements[start.r][start.c];
            if (!startEl) return;
            const cellW = startEl.offsetWidth || 50;
            const cellH = startEl.offsetHeight || 50;
            let tx = 0, ty = 0;
            if (Math.abs(rawDx) > Math.abs(rawDy)) {
                tx = Math.max(-cellW, Math.min(cellW, rawDx));
            } else {
                ty = Math.max(-cellH, Math.min(cellH, rawDy));
            }
            startEl.style.transform = `translate(${tx}px, ${ty}px) scale(1.1)`;
            startEl.style.zIndex = '6';
        },

        onDragEnd: function (e) {
            if (!this.isDragging || !this.dragStartCell) {
                this.isDragging = false;
                return;
            }
            this.isDragging = false;
            let clientX, clientY;
            if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX; clientY = e.clientY;
            }
            const startCell = this.dragStartCell;
            // 清除選中樣式與拖曳期間的 transform（讓字塊回彈原位）
            const startEl = this.cellElements[startCell.r] && this.cellElements[startCell.r][startCell.c];
            if (startEl) {
                startEl.classList.remove('selected');
                startEl.style.transform = '';
                startEl.style.zIndex = '';
            }

            const dx = clientX - startCell.x;
            const dy = clientY - startCell.y;
            // 觸控座標已被 stage scale 縮放 ── 取消縮放
            const scale = window.stageScale || 1;
            const dxAdj = dx / scale;
            const dyAdj = dy / scale;
            const dist = Math.sqrt(dxAdj * dxAdj + dyAdj * dyAdj);
            if (dist < 20) { this.dragStartCell = null; return; } // 距離不足，視為點擊不交換

            // 主軸判定：取較大分量決定上下左右方向
            let dr = 0, dc = 0;
            if (Math.abs(dxAdj) > Math.abs(dyAdj)) {
                dc = dxAdj > 0 ? 1 : -1;
            } else {
                dr = dyAdj > 0 ? 1 : -1;
            }
            const nr = startCell.r + dr;
            const nc = startCell.c + dc;
            this.dragStartCell = null;
            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) return;

            this.attemptSwap(startCell.r, startCell.c, nr, nc);
        },

        // 嘗試交換兩格
        attemptSwap: function (r1, c1, r2, c2) {
            if (this.isAnimating) return;
            this.swap(r1, c1, r2, c2);
            const matches = this.findAllMatches();
            if (matches.length === 0) {
                // 無三連 → 自動還原，不扣步數
                this.swap(r1, c1, r2, c2);
                if (window.SoundManager) window.SoundManager.playFailure();
                this.renderBoard();
                // 失敗回彈：對被交換的兩格加搖晃動畫
                const a = this.cellElements[r1] && this.cellElements[r1][c1];
                const b = this.cellElements[r2] && this.cellElements[r2][c2];
                if (a) { a.classList.add('shake'); setTimeout(() => a.classList.remove('shake'), 310); }
                if (b) { b.classList.add('shake'); setTimeout(() => b.classList.remove('shake'), 310); }
                return;
            }
            // 有效交換：扣步數（步數模式下）
            if (this.maxMoves > 0) {
                this.movesLeft--;
                this._updateMovesLabel();
                this.updateMovesRing();
            }
            this.renderBoard();
            this.isAnimating = true;
            this.resolveMatchesChain(1);
        },

        swap: function (r1, c1, r2, c2) {
            const tmp = this.board[r1][c1];
            this.board[r1][c1] = this.board[r2][c2];
            this.board[r2][c2] = tmp;
        },

        // ── 三連偵測（BFS 全棋盤掃描） ──
        findAllMatches: function () {
            const matches = []; // 每組 { cells:[{r,c}], char, length, dir:'h'|'v' }
            // 橫向掃描
            for (let r = 0; r < this.rows; r++) {
                let runStart = 0;
                for (let c = 1; c <= this.cols; c++) {
                    const prev = this.board[r][c - 1].char;
                    const cur = (c < this.cols) ? this.board[r][c].char : null;
                    if (cur !== prev || c === this.cols) {
                        const len = c - runStart;
                        if (len >= 3) {
                            const cells = [];
                            for (let k = runStart; k < c; k++) cells.push({ r, c: k });
                            matches.push({ cells, char: prev, length: len, dir: 'h' });
                        }
                        runStart = c;
                    }
                }
            }
            // 縱向掃描
            for (let c = 0; c < this.cols; c++) {
                let runStart = 0;
                for (let r = 1; r <= this.rows; r++) {
                    const prev = this.board[r - 1][c].char;
                    const cur = (r < this.rows) ? this.board[r][c].char : null;
                    if (cur !== prev || r === this.rows) {
                        const len = r - runStart;
                        if (len >= 3) {
                            const cells = [];
                            for (let k = runStart; k < r; k++) cells.push({ r: k, c });
                            matches.push({ cells, char: prev, length: len, dir: 'v' });
                        }
                        runStart = r;
                    }
                }
            }
            return matches;
        },

        // 連鎖反應結算（chainCount 從 1 起算）
        resolveMatchesChain: function (chainCount) {
            const matches = this.findAllMatches();
            if (matches.length === 0) {
                this.isAnimating = false;
                this.afterChainSettle();
                return;
            }

            // 標記要消除的格子；同時記錄四連/五連產生道具
            const toRemove = {}; // key "r,c" → true
            const powerSpawns = []; // { r, c, type, char }
            const chainMult = Math.min(chainCount, 5); // 1,2,3,4,5+
            const multTable = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];

            matches.forEach(m => {
                m.cells.forEach(cell => { toRemove[cell.r + ',' + cell.c] = true; });
                // 收集字頻
                const collectTimes = m.length >= 5 ? m.length : (m.length === 4 ? 2 : 1);
                if (this.collectProgress[m.char] !== undefined) {
                    const newVal = Math.min(this.collectTarget, (this.collectProgress[m.char] || 0) + collectTimes);
                    this.collectProgress[m.char] = newVal;
                }
                // 四連 / 五連道具
                if (m.length === 4) {
                    const mid = m.cells[Math.floor(m.cells.length / 2)];
                    powerSpawns.push({ r: mid.r, c: mid.c, type: m.dir === 'h' ? 'v' : 'h', char: m.char });
                } else if (m.length >= 5) {
                    const mid = m.cells[Math.floor(m.cells.length / 2)];
                    powerSpawns.push({ r: mid.r, c: mid.c, type: 'star', char: m.char });
                }
                // 加分（連鎖倍率）
                const base = (window.ScoreManager && window.ScoreManager.gameSettings && window.ScoreManager.gameSettings.game24)
                    ? window.ScoreManager.gameSettings.game24.getPointA : 1;
                this.score += base * m.length * multTable[chainMult];
            });

            // 道具觸發：被消除格中若含道具，連帶消除其方向整行/列或同字全消
            //   ── 每格紀錄 removeDelay（從道具中心向外擴散的階梯延遲），製造爆炸感
            const powerTriggers = [];
            const cellRemoveDelay = {}; // key "r,c" → ms（道具觸發格用）
            Object.keys(toRemove).forEach(k => {
                const [r, c] = k.split(',').map(Number);
                const t = this.board[r][c];
                if (t.isPower) powerTriggers.push({ r, c, type: t.isPower, char: t.char });
            });
            const POWER_CASCADE_GAP = 55; // 每格擴散階梯
            powerTriggers.forEach(p => {
                if (p.type === 'h') {
                    for (let cc = 0; cc < this.cols; cc++) {
                        const key = p.r + ',' + cc;
                        toRemove[key] = true;
                        cellRemoveDelay[key] = Math.abs(cc - p.c) * POWER_CASCADE_GAP;
                    }
                } else if (p.type === 'v') {
                    for (let rr = 0; rr < this.rows; rr++) {
                        const key = rr + ',' + p.c;
                        toRemove[key] = true;
                        cellRemoveDelay[key] = Math.abs(rr - p.r) * POWER_CASCADE_GAP;
                    }
                } else if (p.type === 'star') {
                    // 星型同字全消：用距離震央的距離 × 30ms 階梯
                    for (let rr = 0; rr < this.rows; rr++) {
                        for (let cc = 0; cc < this.cols; cc++) {
                            if (this.board[rr][cc].char === p.char) {
                                const key = rr + ',' + cc;
                                toRemove[key] = true;
                                cellRemoveDelay[key] = (Math.abs(rr - p.r) + Math.abs(cc - p.c)) * 30;
                            }
                        }
                    }
                }
            });
            const hasPowerTrigger = powerTriggers.length > 0;
            // 道具方向（取第一個道具的類型，用於決定爆炸粒子的擴散方向）
            const firstPowerDir = hasPowerTrigger ? powerTriggers[0].type : null;

            // 顯示連鎖讚辭
            if (chainCount >= 2) this.showChainPraise(chainCount);
            if (window.SoundManager) {
                if (chainCount === 1) window.SoundManager.playSuccessShort && window.SoundManager.playSuccessShort();
                else window.SoundManager.playSuccess && window.SoundManager.playSuccess();
            }

            // 計算最大連消長度（用以判定 4 連 / 5 連特效強度）
            let maxLen = 0;
            matches.forEach(m => { if (m.length > maxLen) maxLen = m.length; });

            // ── 套用消除動畫 ──
            //   非道具格：立即 removing
            //   道具觸發格：按 cellRemoveDelay 階梯加 removing，搭配「方向爆炸粒子」
            //               讓玩家清楚看到「整排掃過去的」威力
            const removeKeys = Object.keys(toRemove);
            // 道具中心立刻發出大型方向衝擊波
            if (hasPowerTrigger) {
                powerTriggers.forEach(p => {
                    const centerEl = this.cellElements[p.r] && this.cellElements[p.r][p.c];
                    if (centerEl) {
                        this.spawnPowerBlast(centerEl, p.type, this.getHueForChar(p.char));
                    }
                });
            }

            removeKeys.forEach(k => {
                const [r, c] = k.split(',').map(Number);
                const cellEl = this.cellElements[r] && this.cellElements[r][c];
                if (!cellEl) return;
                const ch = this.board[r][c] && this.board[r][c].char;
                const hue = this.getHueForChar(ch);
                const delay = cellRemoveDelay[k] || 0;
                const fireAtThisCell = () => {
                    cellEl.classList.add('removing');
                    this.spawnShockwave(cellEl);
                    // 道具觸發格：方向性爆炸粒子（橫排→左右濺射、直排→上下濺射）
                    if (cellRemoveDelay[k] !== undefined && firstPowerDir) {
                        this.spawnDirectionalParticles(cellEl, hue, firstPowerDir);
                    } else {
                        this.spawnParticles(cellEl, 7, hue);
                    }
                    if (ch && this.currentLineChars.indexOf(ch) >= 0) {
                        this.spawnSoul(cellEl, ch);
                    }
                };
                if (delay > 0) setTimeout(fireAtThisCell, delay); else fireAtThisCell();
            });

            // 4 連以上：螢幕邊緣金光脈衝（強度隨 chain 遞增）
            if (maxLen >= 4 || chainCount >= 2) {
                this.flashEdge(Math.min(1, 0.4 + chainCount * 0.2 + (maxLen - 3) * 0.25));
            }
            // 5 連以上：全螢幕白光 flash
            if (maxLen >= 5 || chainCount >= 4) {
                this.flashScreen();
            }

            document.getElementById('game24-score').textContent = this.score;
            this.updateLineDisplay(true);

            // 消除動畫時長：道具觸發要更長（級聯結束後再暫停 500ms「感受爆炸威力」）
            const cascadeTotal = Math.max(0, ...Object.values(cellRemoveDelay));
            const burstDuration = 450 + cascadeTotal + (hasPowerTrigger ? 500 : 0);

            setTimeout(() => {
                Object.keys(toRemove).forEach(k => {
                    const [r, c] = k.split(',').map(Number);
                    this.board[r][c] = null;
                });
                this.applyGravity();
                this.refillBoard();
                powerSpawns.forEach(p => {
                    if (this.board[p.r] && this.board[p.r][p.c]) {
                        this.board[p.r][p.c].isPower = p.type;
                        this.board[p.r][p.c].char = p.char;
                    }
                });
                this.renderBoard(true);

                if (this.isLineComplete()) {
                    this.isAnimating = false;
                    this.completeLine();
                    return;
                }
                setTimeout(() => this.resolveMatchesChain(chainCount + 1), 220);
            }, burstDuration);
        },

        // 方向爆炸：道具中心發出橫向或縱向長條衝擊波
        spawnPowerBlast: function (centerEl, type, hue) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const c = this.getCellCenter(centerEl);
            const blast = document.createElement('div');
            blast.className = 'game24-power-blast ' + (type === 'h' ? 'blast-h' : type === 'v' ? 'blast-v' : 'blast-star');
            blast.style.left = c.x + 'px';
            blast.style.top = c.y + 'px';
            if (typeof hue === 'number') blast.style.setProperty('--g24-ph', hue);
            wrapper.appendChild(blast);
            setTimeout(() => { blast.remove(); }, 650);
        },

        // 方向粒子：道具觸發的格子用 — 橫排則向左右濺射、直排則向上下濺射
        spawnDirectionalParticles: function (cellEl, hue, dir) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const c = this.getCellCenter(cellEl);
            const count = 10;
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game24-particle hue';
                const dist = 40 + Math.random() * 50;
                let dx, dy;
                if (dir === 'h') {
                    // 橫向噴射：左/右 + 微小垂直變動
                    dx = (i % 2 === 0 ? 1 : -1) * dist * (0.6 + Math.random() * 0.8);
                    dy = (Math.random() - 0.5) * 25;
                } else if (dir === 'v') {
                    dx = (Math.random() - 0.5) * 25;
                    dy = (i % 2 === 0 ? 1 : -1) * dist * (0.6 + Math.random() * 0.8);
                } else {
                    // star：四面八方
                    const ang = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.5;
                    dx = Math.cos(ang) * dist;
                    dy = Math.sin(ang) * dist;
                }
                p.style.left = c.x + 'px';
                p.style.top = c.y + 'px';
                p.style.setProperty('--g24-dx', dx + 'px');
                p.style.setProperty('--g24-dy', dy + 'px');
                if (typeof hue === 'number') p.style.setProperty('--g24-ph', hue);
                const scale = 1.0 + Math.random() * 0.8;
                p.style.width = (10 * scale) + 'px';
                p.style.height = (10 * scale) + 'px';
                wrapper.appendChild(p);
                setTimeout(() => { p.remove(); }, 700);
            }
        },

        // 重力：將每欄非 null 字塊往下沉，落下的字塊標記 _isFalling 觸發 fall 動畫
        //   _fallDelay：依該欄底部往上等比延遲，營造「一層一層依序滑落」的視覺節奏
        applyGravity: function () {
            for (let c = 0; c < this.cols; c++) {
                // 由下往上收集非 null，記錄原列 r
                const stack = []; // { tile, originRow }
                for (let r = this.rows - 1; r >= 0; r--) {
                    if (this.board[r][c] !== null) stack.push({ tile: this.board[r][c], originRow: r });
                }
                let stagger = 0;
                for (let r = this.rows - 1; r >= 0; r--) {
                    const item = stack.shift();
                    if (item) {
                        if (item.originRow !== r) {
                            item.tile._isFalling = true;
                            // 越上層的（後填入下方位置的）延遲越大；每層 40ms
                            item.tile._fallDelay = stagger * 40;
                            stagger++;
                        }
                        this.board[r][c] = item.tile;
                    } else {
                        this.board[r][c] = null;
                    }
                }
            }
        },

        // 補位：所有 null 格生成新字塊；_spawnDelay 依欄內由下往上遞增（下方先進、上方後進）
        refillBoard: function () {
            for (let c = 0; c < this.cols; c++) {
                let spawnIdx = 0;
                for (let r = this.rows - 1; r >= 0; r--) {
                    if (this.board[r][c] === null) {
                        const t = this.makeNewTile(r, c, false);
                        t._isNew = true;
                        // 銜接 fall 動畫尾段；每層 60ms 階梯延遲
                        t._spawnDelay = 80 + spawnIdx * 60;
                        spawnIdx++;
                        this.board[r][c] = t;
                    }
                }
            }
        },

        // ── 視覺特效輔助函式 ── ───────────────────────────────────────

        // 取得棋盤包裝器（粒子、衝擊波、字魂的掛載點）
        getFxLayer: function () {
            return document.getElementById('game24-board-wrapper');
        },

        // 計算字塊中心點相對於 board-wrapper 的座標（回傳「本地未縮放」像素）
        //
        // ⚠️ overlay 被 transform: scale(r.scale) 縮放（screen_adaptive 系統）。
        //    getBoundingClientRect() 回傳的是被縮放後的 viewport 像素。
        //    若直接把 viewport 像素設給子節點 style.left/top → 子節點再被 wrapper 縮放一次 →
        //    scale 雙重套用、FX 位置 (1 - scale) × 本地座標 倍往原點偏移
        //    （離原點越遠偏越多，觀感就是「光束跑到差兩格的位置」）。
        //    解法：除以 stageScale 還原為本地像素，再回傳。
        getCellCenter: function (cellEl) {
            const wrapper = this.getFxLayer();
            if (!cellEl || !wrapper) return { x: 0, y: 0 };
            const cr = cellEl.getBoundingClientRect();
            const wr = wrapper.getBoundingClientRect();
            const scale = window.stageScale || 1;
            return {
                x: ((cr.left - wr.left) + cr.width / 2) / scale,
                y: ((cr.top - wr.top) + cr.height / 2) / scale,
                w: cr.width / scale,
                h: cr.height / scale
            };
        },

        // 衝擊波：白色擴散圓環（200~450ms）
        spawnShockwave: function (cellEl) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const c = this.getCellCenter(cellEl);
            const sw = document.createElement('div');
            sw.className = 'game24-shockwave';
            sw.style.left = c.x + 'px';
            sw.style.top = c.y + 'px';
            sw.style.width = (c.w * 0.9) + 'px';
            sw.style.height = (c.h * 0.9) + 'px';
            wrapper.appendChild(sw);
            setTimeout(() => { sw.remove(); }, 480);
        },

        // 粒子：從字塊中心向四面拋灑 N 個亮點（拋物線）；hue 指定色系（同字塊色）
        spawnParticles: function (cellEl, count, hue) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const c = this.getCellCenter(cellEl);
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game24-particle';
                // 隨機方向 + 距離 35~70px
                const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
                const dist = 35 + Math.random() * 35;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist - 10; // 略偏上製造拋物線感
                p.style.left = c.x + 'px';
                p.style.top = c.y + 'px';
                p.style.setProperty('--g24-dx', dx + 'px');
                p.style.setProperty('--g24-dy', dy + 'px');
                // 隨機略大/小，增加豐富度
                const scale = 0.7 + Math.random() * 0.8;
                p.style.width = (8 * scale) + 'px';
                p.style.height = (8 * scale) + 'px';
                // 套用色系：若給定 hue，用同色系亮粒子；否則退回金色預設
                if (typeof hue === 'number') {
                    p.style.setProperty('--g24-ph', hue);
                    p.classList.add('hue');
                }
                wrapper.appendChild(p);
                setTimeout(() => { p.remove(); }, 600);
            }
        },

        // 字魂：金色大字從消除位置拋物線飛向頂端對應進度燈
        spawnSoul: function (cellEl, ch) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const start = this.getCellCenter(cellEl);
            // 目標：進度數字（所有字共用同一個 progress-num，用作飛入終點）
            // 同樣需要除以 stageScale 把 viewport 像素轉為 wrapper 本地像素，與 start 單位一致
            const groupEl = document.querySelector('.game24-progress-num');
            let endX, endY;
            if (groupEl) {
                const gr = groupEl.getBoundingClientRect();
                const wr = wrapper.getBoundingClientRect();
                const scale = window.stageScale || 1;
                endX = ((gr.left - wr.left) + gr.width / 2) / scale;
                endY = ((gr.top - wr.top) + gr.height / 2) / scale;
            } else {
                endX = start.x; endY = -20;
            }
            const soul = document.createElement('div');
            soul.className = 'game24-soul';
            soul.textContent = ch;
            soul.style.left = start.x + 'px';
            soul.style.top = start.y + 'px';
            wrapper.appendChild(soul);
            // 第一階段：先彈起 30px（200ms ease-out）
            requestAnimationFrame(() => {
                soul.style.opacity = '0.95';
                soul.style.transform = 'translate(-50%, -50%) scale(1.2)';
                soul.style.transition = 'top 0.2s ease-out, opacity 0.15s ease, transform 0.2s ease';
                soul.style.top = (start.y - 30) + 'px';
            });
            // 第二階段：拋物線飛向目標（500ms ease-in-out）
            setTimeout(() => {
                soul.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease, transform 0.4s ease';
                soul.style.left = endX + 'px';
                soul.style.top = endY + 'px';
                soul.style.transform = 'translate(-50%, -50%) scale(0.8)';
            }, 210);
            // 第三階段：到達 → 進度燈彈跳 + fade
            setTimeout(() => {
                soul.style.opacity = '0';
                if (groupEl) {
                    groupEl.style.transform = 'scale(1.25)';
                    groupEl.style.transition = 'transform 0.2s ease';
                    groupEl.style.boxShadow = '0 0 16px hsla(45, 100%, 70%, 0.95)';
                    setTimeout(() => {
                        groupEl.style.transform = '';
                        groupEl.style.boxShadow = '';
                    }, 220);
                }
            }, 720);
            setTimeout(() => { soul.remove(); }, 900);
        },

        // 螢幕邊緣金光脈衝（4 連以上 / 連鎖階段）
        flashEdge: function (intensity) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const f = document.createElement('div');
            f.className = 'game24-edge-flash';
            f.style.opacity = '';
            // 用內聯 box-shadow 改強度
            const a = Math.max(0.3, Math.min(1, intensity));
            f.style.boxShadow = `inset 0 0 ${30 + a * 40}px ${6 + a * 14}px hsla(45, 100%, 60%, ${a}), inset 0 0 ${60 + a * 60}px ${15 + a * 15}px hsla(40, 100%, 55%, ${a * 0.5})`;
            wrapper.appendChild(f);
            setTimeout(() => { f.remove(); }, 580);
        },

        // 全螢幕白色短閃（5 連以上）
        flashScreen: function () {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const f = document.createElement('div');
            f.className = 'game24-screen-flash';
            wrapper.appendChild(f);
            setTimeout(() => { f.remove(); }, 220);
        },

        // 連鎖結束後的整理
        afterChainSettle: function () {
            // 防呆：連鎖收尾時若已達成該句目標 → 立即進句/勝利
            //   原本只在 resolveMatchesChain 中段檢查，若道具/連鎖剛好在「無新匹配」階段達成，會漏判
            if (this.isLineComplete()) {
                this.completeLine();
                return;
            }
            // 死局檢查 → 自動洗牌
            if (!this.hasPossibleMove()) {
                this.shuffleBoard();
                this.renderBoard();
                if (window.SoundManager) window.SoundManager.playOpenItem();
            }
            // 檢查步數歸零
            if (this.maxMoves > 0 && this.movesLeft <= 0 && !this.isLineComplete()) {
                this.gameOver(false, '步數用盡');
                return;
            }
            // 玩家回合 → 重新啟動閒置提示倒數
            this.scheduleHint();
        },

        // 判斷當前句是否字頻都已達標
        isLineComplete: function () {
            for (const ch of this.currentLineChars) {
                if ((this.collectProgress[ch] || 0) < this.collectTarget) return false;
            }
            return true;
        },

        // ─────────────────────────────────────────────────────────────────
        // 進入下一句：嚴格的階段完成過場（鎖拖曳直到全部過場完成）
        //   STAGE 1: 上方進度卡逐一發光
        //   STAGE 2: 下方棋盤逐列掉落（含「先清除 power/removing/FX 殘留」防呆）
        //   STAGE 3: 「恭喜！進入下一句盤面。」金黃橫幅維持 2 秒
        //   STAGE 4: 上方進度卡逐一消失
        //   STAGE 5: 切句、依新詩句逐一生出進度卡
        //   STAGE 6: 生成新盤面，由上方逐列滑落
        //   STAGE 7: 恢復玩家操作 + 重啟 hint 倒數
        // ─────────────────────────────────────────────────────────────────
        completeLine: function () {
            this.isAnimating = true;
            this.isDragging = false;
            this.dragStartCell = null;
            this.clearHint();
            // 除錯：每次完成一句都輸出當前狀態
            const _isLast = (this.currentLineIndex + 1) >= this.poemLines.length;
            console.log('[game24] completeLine',
                '盤面:', (this.currentLineIndex + 1) + '/' + this.poemLines.length,
                '剛完成:', this.poemLines[this.currentLineIndex],
                'isLastLine:', _isLast,
                'score:', this.score,
                'movesLeft:', this.movesLeft + '/' + this.maxMoves,
                'collectProgress:', JSON.parse(JSON.stringify(this.collectProgress)));
            if (window.SoundManager) window.SoundManager.playJoyfulTriple && window.SoundManager.playJoyfulTriple();

            // ⚠️ 防呆：清除所有殘留 FX（粒子、衝擊波、字魂、邊光、全螢光）+ 棋盤殘留 class
            //   ── 修正 4/5 連消除生成的 power 字塊高光殘留導致無法進行的問題
            this._cleanupStageRemnants();

            const progEl = document.getElementById('game24-progress');
            const oldGroups = progEl ? Array.from(progEl.querySelectorAll('.game24-char-group')) : [];

            // ── 最後一句 → 走「過關勝利」流程，不淨空盤面、不顯示「進入下一句」
            //   ① 進度卡逐一發光
            //   ② 呼叫 gameOver(true) → ScoreManager.playWinAnimation 處理加分動畫 + 倒數框 + 星星
            //   ③ playWinAnimation 完成後 onComplete → MessageBox
            const isLastLine = (this.currentLineIndex + 1) >= this.poemLines.length;
            if (isLastLine) {
                console.log('[game24] 最後一句完成 → 走勝利動畫，' + oldGroups.length + ' 張進度卡逐一發光');
                const TILE_FLASH_GAP = 180;
                oldGroups.forEach((g, i) => {
                    setTimeout(() => g.classList.add('stage-flash'), i * TILE_FLASH_GAP);
                });
                const flashTotal = oldGroups.length * TILE_FLASH_GAP + 500;
                setTimeout(() => {
                    this.currentLineIndex++;
                    this.isAnimating = false;
                    console.log('[game24] 呼叫 gameOver(true) → 啟動 ScoreManager.playWinAnimation');
                    this.gameOver(true, '');
                }, flashTotal);
                return;
            }
            // ── 非最後一句 → 走完整 7 階段過場 ──

            const TILE_FLASH_GAP = 160;
            const ROW_DROP_GAP = 80;
            const TILE_FADE_GAP = 110;
            const TILE_SHOW_GAP = 130;
            const ROW_LAND_GAP = 80;

            // 連續 stages：每階段呼叫 next 進入下一個
            const stages = [];

            // ── STAGE 1: 上方進度卡逐一發光 ──
            stages.push((next) => {
                if (oldGroups.length === 0) { next(); return; }
                oldGroups.forEach((g, i) => {
                    setTimeout(() => g.classList.add('stage-flash'), i * TILE_FLASH_GAP);
                });
                setTimeout(next, oldGroups.length * TILE_FLASH_GAP + 350);
            });

            // ── STAGE 2: 棋盤由下往上逐列掉落 ──
            stages.push((next) => {
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        const el = this.cellElements[r] && this.cellElements[r][c];
                        if (!el) continue;
                        // 越靠近底部越先掉（與重力一致）
                        const delay = (this.rows - 1 - r) * ROW_DROP_GAP;
                        el.style.setProperty('--g24-delay', delay + 'ms');
                        el.classList.add('sweep-out');
                    }
                }
                setTimeout(next, this.rows * ROW_DROP_GAP + 550);
            });

            // ── STAGE 3: 「恭喜！」橫幅 2 秒 ──
            stages.push((next) => {
                const banner = document.getElementById('game24-chain-praise');
                if (banner) {
                    banner.textContent = '恭喜！進入下一句盤面。';
                    banner.className = 'game24-chain-praise stage-banner animate';
                }
                setTimeout(() => {
                    if (banner) banner.classList.add('hidden');
                    next();
                }, 2000);
            });

            // ── STAGE 4: 上方進度卡逐一消失 ──
            stages.push((next) => {
                if (oldGroups.length === 0) { next(); return; }
                oldGroups.forEach((g, i) => {
                    setTimeout(() => g.classList.add('stage-fade-out'), i * TILE_FADE_GAP);
                });
                setTimeout(next, oldGroups.length * TILE_FADE_GAP + 300);
            });

            // ── STAGE 5: 切句、生新進度卡（先全部隱藏，再依序顯示） ──
            stages.push((next) => {
                this.currentLineIndex++;
                if (this.currentLineIndex >= this.poemLines.length) {
                    this.isAnimating = false;
                    this.gameOver(true, '');
                    return; // 終止整個 stage 鏈
                }
                const line = this.poemLines[this.currentLineIndex] || '';
                const uniqueChars = [];
                const seen = {};
                for (const ch of line) if (!seen[ch]) { seen[ch] = true; uniqueChars.push(ch); }
                this.currentLineChars = uniqueChars;
                this.collectProgress = {};
                uniqueChars.forEach(ch => { this.collectProgress[ch] = 0; });
                this._prevCollectProgress = {};
                this.updateLineDisplay();
                this._updateMovesLabel();

                const newGroups = progEl ? Array.from(progEl.querySelectorAll('.game24-char-group')) : [];
                newGroups.forEach(g => g.classList.add('stage-pre-appear'));
                newGroups.forEach((g, i) => {
                    setTimeout(() => {
                        g.classList.remove('stage-pre-appear');
                        g.classList.add('stage-appear');
                    }, i * TILE_SHOW_GAP);
                });
                setTimeout(next, newGroups.length * TILE_SHOW_GAP + 400);
            });

            // ── STAGE 6: 生新盤面，全盤由上滑落 ──
            stages.push((next) => {
                this.generateBoard();
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        const t = this.board[r][c];
                        t._isNew = true;
                        t._spawnDelay = (this.rows - 1 - r) * ROW_LAND_GAP;
                    }
                }
                this.renderBoard(true);
                setTimeout(next, this.rows * ROW_LAND_GAP + 500);
            });

            // ── STAGE 7: 恢復玩家操作 ──
            stages.push(() => {
                this.isAnimating = false;
                this.scheduleHint();
            });

            // 串行執行
            const runner = (i) => {
                if (i >= stages.length) return;
                stages[i](() => runner(i + 1));
            };
            runner(0);
        },

        // 過場前先清除棋盤上殘留的 power 高光、消除類別、選中類別，以及 FX 層的粒子/衝擊波/字魂等
        _cleanupStageRemnants: function () {
            const wrapper = document.getElementById('game24-board-wrapper');
            if (wrapper) {
                wrapper.querySelectorAll(
                    '.game24-particle, .game24-shockwave, .game24-soul, .game24-edge-flash, .game24-screen-flash'
                ).forEach(n => n.remove());
            }
            if (this.cellElements) {
                this.cellElements.forEach(row => row.forEach(el => {
                    if (!el) return;
                    el.classList.remove(
                        'power-h', 'power-v', 'power-star',
                        'removing', 'selected', 'shake', 'spawn', 'fall', 'hint', 'hint-target'
                    );
                    el.style.transform = '';
                    el.style.zIndex = '';
                }));
            }
            // 將 board 內所有 tile 的 isPower 清掉，避免新盤面殘留旗標
            if (this.board && this.board.length) {
                for (let r = 0; r < this.board.length; r++) {
                    if (!this.board[r]) continue;
                    for (let c = 0; c < this.board[r].length; c++) {
                        const t = this.board[r][c];
                        if (t) t.isPower = null;
                    }
                }
            }
        },

        // ── 死局偵測：掃描是否還存在「可形成三連的交換」 ──
        hasPossibleMove: function () {
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    // 試右
                    if (c + 1 < this.cols) {
                        this.swap(r, c, r, c + 1);
                        const m = this.findAllMatches();
                        this.swap(r, c, r, c + 1);
                        if (m.length > 0) return true;
                    }
                    // 試下
                    if (r + 1 < this.rows) {
                        this.swap(r, c, r + 1, c);
                        const m = this.findAllMatches();
                        this.swap(r, c, r + 1, c);
                        if (m.length > 0) return true;
                    }
                }
            }
            return false;
        },

        // 洗牌：將棋盤所有字塊隨機重排
        shuffleBoard: function () {
            const flat = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) flat.push(this.board[r][c]);
            }
            for (let i = flat.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [flat[i], flat[j]] = [flat[j], flat[i]];
            }
            let idx = 0;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) this.board[r][c] = flat[idx++];
            }
        },

        // 顯示連鎖讚辭
        showChainPraise: function (chainCount) {
            const el = document.getElementById('game24-chain-praise');
            if (!el) return;
            const praise = this.chainPraises[(chainCount - 2) % this.chainPraises.length];
            el.textContent = `${praise} ×${chainCount}`;
            el.classList.remove('hidden');
            el.classList.remove('animate');
            // 強制 reflow 重啟動畫
            void el.offsetWidth;
            el.classList.add('animate');
            setTimeout(() => { el.classList.add('hidden'); }, 800);
        },

        // ── 計時器 ──
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        // ── 紅白步數倒數框（仿 game9 詩韻鎖扣） ──
        //   依 maxMoves 將外框等分成 N 段；奇紅偶白交替；每走一步從尾段開始扣除
        updateMovesRing: function () {
            const rectRed = document.getElementById('game24-moves-path-red');
            const rectWhite = document.getElementById('game24-moves-path-white');
            const wrapper = document.getElementById('game24-board-wrapper');
            const svg = document.getElementById('game24-timer-ring');
            if (!rectRed || !rectWhite || !wrapper || !svg) return;
            if (!this.maxMoves || this.maxMoves <= 0) return;

            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rb = wrapper.getBoundingClientRect();
                w = rb.width; h = rb.height;
            }
            if (w === 0) return;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            rectRed.setAttribute('width', w - 6);
            rectRed.setAttribute('height', h - 6);
            rectWhite.setAttribute('width', w - 6);
            rectWhite.setAttribute('height', h - 6);

            const totalLength = (w - 6 + h - 6) * 2;
            const segment = totalLength / this.maxMoves;
            const dashArrayRed = [];
            const dashArrayWhite = [];
            // 依序為每段分配紅 / 白；超過剩餘步數的段落兩環皆為 Gap（已消耗）
            for (let i = 1; i <= this.maxMoves; i++) {
                const isVisible = i <= this.movesLeft;
                const isRedSlot = (i % 2 === 0);
                if (isVisible) {
                    if (isRedSlot) {
                        dashArrayWhite.push(0, segment);
                        dashArrayRed.push(segment, 0);
                    } else {
                        dashArrayWhite.push(segment, 0);
                        dashArrayRed.push(0, segment);
                    }
                } else {
                    dashArrayWhite.push(0, segment);
                    dashArrayRed.push(0, segment);
                }
            }
            rectRed.style.strokeDasharray = dashArrayRed.join(' ');
            rectWhite.style.strokeDasharray = dashArrayWhite.join(' ');
        },

        // 更新計時器矩形邊框（順時鐘環繞棋盤）
        //   mode='win'：步數模式勝利動畫 — 完全比照 game9 詩韻鎖扣
        //               不換金色單框，紅白雙框逐段消失（每段對應一步），ScoreManager 每跳一格從消失段噴星飛入分數
        updateTimerRing: function (ratio, mode) {
            if (mode === 'win') {
                // 比照 game9：用 ratio 推算 movesLeft，重畫紅白雙框
                if (typeof ratio === 'number') {
                    this.movesLeft = Math.round(ratio * this.maxMoves);
                }
                this.updateMovesRing();
                return;
            }
            // 時間模式（本作目前難度全為 0，留作未來擴充）
            const rect = document.getElementById('game24-timer-path');
            const wrapper = document.getElementById('game24-board-wrapper');
            const svg = document.getElementById('game24-timer-ring');
            if (!rect || !wrapper || !svg) return;
            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rb = wrapper.getBoundingClientRect();
                w = rb.width; h = rb.height;
            }
            if (w === 0) return;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';
            rect.setAttribute('width', w - 6);
            rect.setAttribute('height', h - 6);
            const perimeter = (w - 6 + h - 6) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.transition = '';
            rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
            const elapsed = 1 - Math.max(0, Math.min(1, ratio));
            rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
        },

        // ── 遊戲結束（勝/敗）統一處理 ──
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);

            // 失敗時寫入 game_logs；勝利由 ScoreManager.saveScore 寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 24,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game24-retryGame-btn').disabled = true;
                document.getElementById('game24-newGame-btn').disabled = true;

                // ⚠️ 步數模式專屬處理（完全比照 game9 詩韻鎖扣）：
                //   ScoreManager.playWinAnimation 階段 2 以 gameInst.timer / maxTimer 為資源換算分數與星星。
                //   本作 timeLimitRate=0 → 把 movesLeft / maxMoves 灌入 timer / maxTimer。
                //   保留「紅白雙框」不切金色單框；updateTimerRing('win') 會逐一吃掉紅白段並噴星。
                this.timer = this.movesLeft;
                this.maxTimer = this.maxMoves;
                this.startTime = 0;
                console.log('[game24] 勝利動畫：timer=' + this.timer + ', maxTimer=' + this.maxTimer + ' → 紅白段逐一消除 + 星星飛入分數');
            } else {
                document.getElementById('game24-retryGame-btn').disabled = false;
                document.getElementById('game24-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMessage = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore || this.score) : 0,
                        reason: win ? '' : (typeof reason === 'string' ? reason : '三珠散落！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game24', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game24', this.currentLevelIndex, () => showMessage(finalScore));
                    } else {
                        showMessage(finalScore);
                    }
                } else {
                    showMessage(finalScore);
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game24',
                    timerContainerId: 'game24-board-wrapper',
                    scoreElementId: 'game24-score',
                    heartsSelector: '.game24-no-hearts',  // 本作無紅心 — 用永不命中的 selector，避免 querySelectorAll('') 拋例外
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        checkAchievementsAndShow(finalScore);
                    }
                });
            } else {
                checkAchievementsAndShow();
            }
        }
    };

    window.Game24 = Game24;

    // 透過 ?game=24 URL 參數自動啟動（支援挑戰關卡直連）
    if (new URLSearchParams(window.location.search).get('game') === '24') {
        setTimeout(() => {
            if (window.Game24) window.Game24.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
