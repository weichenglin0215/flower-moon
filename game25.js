/* =========================================
   Game25《連珠拾字》(Path-Pearl Verse)
   ----------------------------------------
   花月版 A2 路徑連消版 ── 源自 Puzzle & Dragons / Bejeweled Twist 的「拖曳路徑連消」玩法。
   玩家按住起點字塊不放，沿八方向拖曳路徑穿過**同字**字塊，放開時整條 ≥3 連消除。
   按住起點時棋盤所有同字塊發光提示（依難度可關閉）。
   拖曳順序若符合詩句字序則給予 ×3~×5 倍率（順序成詩）。
   消除後重力下落 → 加權補位 → 連鎖偵測（自然三連）。
   依字頻達標完整收集整首詩過關。
   ----------------------------------------
   依《.agent/skills/花月開發常見錯誤與解法.md §4》規範撰寫：
   - 全域 class 前綴 game25-
   - loadCSS() 動態防護
   - overlay 掛載 document.body 且套用 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 完整支援關卡挑戰模式
   - 時限以「實際詩詞字數 × timeLimitRate」計算
   ========================================= */

(function () {
    const Game25 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // ── 詩詞相關 ──
        currentPoem: null,       // 當前選中的詩詞物件
        poemLines: [],           // 詩句陣列（每行為一句純文字）
        targetChars: [],         // 全詩所有字（不含標點）── 用於計算時限與字序
        charFreqTarget: {},      // 每字目標需收集次數（=該字在全詩中的出現次數）
        charFreqGot: {},         // 每字已收集次數

        // ── 棋盤相關 ──
        rows: 8,
        cols: 7,
        board: [],               // 二維陣列：{ char, verseIndex:int|null, id }
        cellElements: [],        // 對應 DOM
        cellIdCounter: 0,

        // ── 玩家互動 ──
        isDragging: false,
        dragStartChar: null,     // 起點字
        currentPath: [],         // 拖曳路徑 [{ r, c }, ...]
        isAnimating: false,      // 連鎖/補位動畫鎖
        movesLeft: 0,            // 剩餘步數（步數模式）

        // ── 計時器 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        // ── 拖曳秒數（單次拖曳時限） ──
        dragTimer: null,         // setTimeout 控制單次拖曳逾時
        dragBarInterval: null,   // 拖曳秒數條更新
        dragStartTime: 0,
        dragLimitMs: 5000,

        /*
         * 難度設定（嚴格依企劃書 §7）
         * timeLimitRate ：每字時間倍率（秒）。0 = 不使用時限（步數模式）。
         *                 實際時限 = targetChars.length × timeLimitRate
         * moveLimit     ：步數上限。0 = 不使用步數限制（時間模式）。
         * poemMinRating ：詩評下限
         * rowsCfg/colsCfg：棋盤尺寸
         * dragLimitMs   ：單次拖曳時限（毫秒）
         * sameHint      ：同字提示方式 'all'/'half'/'none'
         * verseMult     ：順序成詩倍率
         * refillBias    ：加權補位強度（0~1）
         */
        difficultySettings: {
            '小學':   { timeLimitRate: 0,   moveLimit: 20, poemMinRating: 6, rowsCfg: 7, colsCfg: 6, dragLimitMs: 8000, sameHint: 'all',  verseMult: 3, refillBias: 0.80, hintDelay: 3, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '中學':   { timeLimitRate: 0,   moveLimit: 18, poemMinRating: 5, rowsCfg: 7, colsCfg: 7, dragLimitMs: 6000, sameHint: 'all',  verseMult: 3, refillBias: 0.60, hintDelay: 3, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '高中':   { timeLimitRate: 0,   moveLimit: 15, poemMinRating: 4, rowsCfg: 8, colsCfg: 7, dragLimitMs: 5000, sameHint: 'half', verseMult: 3, refillBias: 0.50, hintDelay: 5, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '大學':   { timeLimitRate: 3,   moveLimit: 0,  poemMinRating: 3, rowsCfg: 8, colsCfg: 8, dragLimitMs: 5000, sameHint: 'none', verseMult: 5, refillBias: 0.30, hintDelay: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '研究所': { timeLimitRate: 2,   moveLimit: 0,  poemMinRating: 3, rowsCfg: 9, colsCfg: 8, dragLimitMs: 3000, sameHint: 'none', verseMult: 5, refillBias: 0.00, hintDelay: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 }
        },

        // 連鎖讚辭詞庫
        chainPraises: ['妙手', '神來', '絕唱', '生花', '驚鴻', '繞樑', '吟絕', '入聖'],

        // 全詩去重後字陣列（依首次出現順序）— 用作 360° HUE 等分基準
        // 同字必同色：相同字在 uniquePoemChars 的索引相同 → 計算出同樣的色相
        uniquePoemChars: [],
        // 本局起始步數（仿 game24，用於紅白倒數框分段）
        maxMoves: 0,
        // 閒置提示計時器與當前發光格
        hintTimer: null,
        hintedCells: [],

        // 依字塊字元計算色相：以 uniquePoemChars 索引 × (360 / 字種數) + 12° 偏移
        // 同字永遠同色；干擾字（不在 unique 中）退化為灰調
        getHueForChar: function (ch) {
            if (!ch) return 40;
            const idx = this.uniquePoemChars.indexOf(ch);
            if (idx >= 0) {
                const n = this.uniquePoemChars.length || 1;
                return Math.round((360 / n) * idx + 12) % 360;
            }
            // 干擾字：穩定 hash → 一律走灰調（renderBoard 會額外套低彩度）
            let h = 0;
            for (let i = 0; i < ch.length; i++) h = (h * 31 + ch.charCodeAt(i)) >>> 0;
            return h % 360;
        },

        // ── CSS 載入防護（避免重複載入造成全域污染） ──
        loadCSS: function () {
            if (!document.getElementById('game25-css')) {
                const link = document.createElement('link');
                link.id = 'game25-css';
                link.rel = 'stylesheet';
                link.href = 'game25.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game25-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game25-container');
        },

        // 建立 overlay DOM 並掛載至 document.body（非 #stage，避免 scale 重複縮放）
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game25-container';
            div.className = 'game25-overlay hidden';
            div.innerHTML = `
                <div class="game25-header">
                    <div class="game25-score-board">分數: <span id="game25-score">0</span></div>
                    <div class="game25-controls">
                        <button class="game25-difficulty-tag" id="game25-diff-tag">小學</button>
                        <button id="game25-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game25-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game25-sub-header">
                    <div id="game25-poem-info" class="game25-poem-info"></div>
                    <div id="game25-progress-text" class="game25-progress-text"></div>
                    <div id="game25-freq-line" class="game25-freq-line"></div>
                    <div id="game25-path-preview" class="game25-path-preview">&nbsp;</div>
                    <div class="game25-drag-bar-wrapper">
                        <div id="game25-drag-bar" class="game25-drag-bar"></div>
                    </div>
                    <div id="game25-hearts-line" class="game25-hearts-line"></div>
                </div>
                <div class="game25-area">
                    <div id="game25-grid-wrapper" class="game25-grid-wrapper">
                        <svg id="game25-timer-ring">
                            <rect id="game25-timer-path" x="3" y="3"></rect>
                            <rect id="game25-moves-path-white" x="3" y="3"></rect>
                            <rect id="game25-moves-path-red" x="3" y="3"></rect>
                        </svg>
                        <svg class="game25-svg-layer">
                            <path id="game25-current-path" class="game25-path"></path>
                        </svg>
                        <div id="game25-grid" class="game25-grid"></div>
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
            document.getElementById('game25-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game25-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game25-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 拖曳事件（同時支援滑鼠與觸控）
            const wrapper = document.getElementById('game25-grid-wrapper');
            wrapper.addEventListener('mousedown', this.onDragStart.bind(this));
            wrapper.addEventListener('touchstart', this.onDragStart.bind(this), { passive: false });
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
                'game20-container', 'game21-container', 'game22-container', 'game23-container',
                'game24-container'];
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
            this.stopDragTimer();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('連珠拾字', (selectedLevel, levelIndex) => {
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
            const diffTag = document.getElementById('game25-diff-tag');
            const retryBtn = document.getElementById('game25-retryGame-btn');
            const newBtn = document.getElementById('game25-newGame-btn');
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
            this.stopDragTimer();
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
                'game25'
            );
            if (!result) return false;
            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            // 全詩字陣列（不含標點）── 用於計算時限與字序索引
            this.targetChars = this.poemLines.join('').split('');
            // 全詩去重後字陣列（依首次出現順序）— 同字同色的 HUE 索引基準
            const seen = {};
            this.uniquePoemChars = [];
            for (const ch of this.targetChars) {
                if (!seen[ch]) { seen[ch] = true; this.uniquePoemChars.push(ch); }
            }

            const poemInfo = document.getElementById('game25-poem-info');
            const fullName = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            // 截到 16 字內避免換行 / 與其他資訊重疊；全名放 title 屬性
            poemInfo.textContent = fullName.length > 16 ? (fullName.slice(0, 15) + '…') : fullName;
            poemInfo.title = fullName;
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
            this.isAnimating = false;
            this.currentPath = [];
            this.dragStartChar = null;
            this.isDragging = false;

            const settings = this.difficultySettings[this.difficulty];
            this.rows = settings.rowsCfg;
            this.cols = settings.colsCfg;
            this.movesLeft = settings.moveLimit;
            this.maxMoves = settings.moveLimit;
            this.dragLimitMs = settings.dragLimitMs;

            // 計算每字目標次數（=該字在全詩中的出現次數）
            this.charFreqTarget = {};
            this.charFreqGot = {};
            this.targetChars.forEach(ch => {
                this.charFreqTarget[ch] = (this.charFreqTarget[ch] || 0) + 1;
                this.charFreqGot[ch] = 0;
            });

            document.getElementById('game25-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            // 啟用按鈕
            document.getElementById('game25-retryGame-btn').disabled = false;
            document.getElementById('game25-newGame-btn').disabled = false;

            // 路徑預覽 / 拖曳秒數條重置
            this.setPathPreview('');
            this.setDragBar(0);

            // ⚠️ 時限必須在抽詩之後、用實際 targetChars.length 計算（§1.1 規範）
            const timerSvg = document.getElementById('game25-timer-ring');
            const timerPath = document.getElementById('game25-timer-path');
            const movesPathRed = document.getElementById('game25-moves-path-red');
            const movesPathWhite = document.getElementById('game25-moves-path-white');
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

            // 步數模式 → 啟用紅白雙框；時限模式 → 隱藏紅白框
            if (settings.moveLimit > 0) {
                timerSvg.style.display = 'block';
                if (movesPathRed) movesPathRed.style.display = 'block';
                if (movesPathWhite) movesPathWhite.style.display = 'block';
            } else {
                if (movesPathRed) movesPathRed.style.display = 'none';
                if (movesPathWhite) movesPathWhite.style.display = 'none';
            }

            // 渲染紅心 = 顯示剩餘步數（步數模式）
            this.renderHeartsAsMoves();

            // 依 rows/cols 設定 grid-wrapper 高度（每格正方形）
            this._resizeBoardWrapper();

            // 生成棋盤
            this.generateBoard();
            this.renderBoard();
            this.updateProgressText();
            this.updateFreqLine();
            // 等 DOM 佈局完成後計算紅白框 dash 段落 + 啟動 hint 倒數
            requestAnimationFrame(() => this.updateMovesRing());
            this.scheduleHint();
        },

        // ── 渲染紅心列（步數模式：以紅心數顯示剩餘步數） ──
        renderHeartsAsMoves: function () {
            const heartsLine = document.getElementById('game25-hearts-line');
            const settings = this.difficultySettings[this.difficulty];
            if (!heartsLine) return;
            heartsLine.innerHTML = '';
            if (settings.moveLimit > 0) {
                heartsLine.style.display = 'flex';
                for (let i = 0; i < settings.moveLimit; i++) {
                    const span = document.createElement('span');
                    span.className = 'game25-heart';
                    span.textContent = '♥';
                    heartsLine.appendChild(span);
                }
            } else {
                heartsLine.style.display = 'none';
            }
        },

        updateHeartsAsMoves: function () {
            const hearts = document.querySelectorAll('#game25-hearts-line .game25-heart');
            const settings = this.difficultySettings[this.difficulty];
            const used = settings.moveLimit - this.movesLeft;
            hearts.forEach((h, i) => {
                if (i < used) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        // ── 棋盤生成 ──
        // 棋盤字塊配置：以全詩字頻為主軸，少量加入其他干擾字
        generateBoard: function () {
            this.board = [];
            for (let r = 0; r < this.rows; r++) {
                const row = [];
                for (let c = 0; c < this.cols; c++) {
                    row.push(this.makeNewTile(true));
                }
                this.board.push(row);
            }
            // 初始洗到至少存在一條 ≥3 的「同字相鄰可達路徑」
            for (let i = 0; i < 5; i++) {
                if (this.hasPossiblePath()) break;
                this.shuffleBoard();
            }
        },

        // 產生一個新字塊；初始洗牌時避免立刻形成自然三連
        makeNewTile: function (avoidPreTriple) {
            const ch = this.pickWeightedChar();
            const tile = {
                char: ch,
                verseIndex: this.pickVerseIndexFor(ch), // 隨機指派一個該字的詩中位置
                id: ++this.cellIdCounter
            };
            return tile;
        },

        // 從詩中該字的出現位置中隨機選一個作為 verseIndex
        pickVerseIndexFor: function (ch) {
            const positions = [];
            for (let i = 0; i < this.targetChars.length; i++) {
                if (this.targetChars[i] === ch) positions.push(i);
            }
            if (positions.length === 0) return null;
            return positions[Math.floor(Math.random() * positions.length)];
        },

        // 加權字塊抽選：依當前缺口字、refillBias 動態加權
        pickWeightedChar: function () {
            const settings = this.difficultySettings[this.difficulty];
            const bias = settings.refillBias;

            // 計算每字缺口（target - got）
            const chars = Object.keys(this.charFreqTarget);
            const deficits = chars.map(ch => Math.max(0, (this.charFreqTarget[ch] || 0) - (this.charFreqGot[ch] || 0)));
            const totalDeficit = deficits.reduce((a, b) => a + b, 0);

            if (totalDeficit === 0) {
                // 全收集完 → 隨機從詩中選
                return this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
            }

            // bias 機率使用加權偏袒缺口字
            if (Math.random() < bias) {
                let pick = Math.random() * totalDeficit;
                for (let i = 0; i < chars.length; i++) {
                    pick -= deficits[i];
                    if (pick <= 0) return chars[i];
                }
                return chars[chars.length - 1];
            }
            // 均勻隨機從詩中字選
            return chars[Math.floor(Math.random() * chars.length)];
        },

        // 渲染棋盤 DOM
        // animateNew：是否對「新生」字塊（自上方掉落補位）加 spawn 動畫
        renderBoard: function (animateNew) {
            const boardEl = document.getElementById('game25-grid');
            boardEl.innerHTML = '';
            boardEl.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
            boardEl.style.gridTemplateRows = `repeat(${this.rows}, 1fr)`;
            this.cellElements = [];
            // 動態計算 cell 邊長 → 字體 = 80% 方框（不同難度仍維持比例）
            let bw = boardEl.offsetWidth, bh = boardEl.offsetHeight;
            if (!bw || !bh) { const rb = boardEl.getBoundingClientRect(); bw = rb.width; bh = rb.height; }
            const cellSize = Math.min((bw - this.cols * 4) / this.cols, (bh - this.rows * 4) / this.rows);
            const cellFontPx = Math.max(12, Math.floor(cellSize * 0.8));
            // 用於同字同色：把 uniquePoemChars 中的字當作目標字
            const targetSet = {};
            this.uniquePoemChars.forEach(ch => { targetSet[ch] = true; });
            for (let r = 0; r < this.rows; r++) {
                const rowEls = [];
                for (let c = 0; c < this.cols; c++) {
                    const div = document.createElement('div');
                    div.className = 'game25-cell';
                    div.dataset.r = r;
                    div.dataset.c = c;
                    div.style.fontSize = cellFontPx + 'px';
                    const t = this.board[r][c];
                    if (t) {
                        div.textContent = t.char;
                        // 套用色相（依字在 uniquePoemChars 的索引等分 360°；相同字必為相同底色）
                        const hue = this.getHueForChar(t.char);
                        div.style.setProperty('--g25-h', hue);
                        if (targetSet[t.char]) {
                            // 目標字：高亮度 + 中彩度 + 深色字（與 game24 同款）
                            div.style.setProperty('--g25-s', '65%');
                            div.style.setProperty('--g25-l', '75%');
                            div.style.setProperty('--g25-text', 'hsl(220, 30%, 16%)');
                        } else {
                            div.classList.add('decoy');
                        }
                        // 階梯式 spawn / fall 動畫（仿 game24 重力感）
                        if (animateNew && t._isNew) {
                            div.classList.add('spawn');
                            const delay = t._spawnDelay || 0;
                            if (delay > 0) div.style.setProperty('--g25-delay', delay + 'ms');
                            setTimeout(() => { div.classList.remove('spawn'); div.style.removeProperty('--g25-delay'); }, 460 + delay);
                            delete t._isNew; delete t._spawnDelay;
                        } else if (animateNew && t._isFalling) {
                            div.classList.add('fall');
                            const delay = t._fallDelay || 0;
                            if (delay > 0) div.style.setProperty('--g25-delay', delay + 'ms');
                            setTimeout(() => { div.classList.remove('fall'); div.style.removeProperty('--g25-delay'); }, 360 + delay);
                            delete t._isFalling; delete t._fallDelay;
                        }
                    } else {
                        div.classList.add('empty');
                    }
                    boardEl.appendChild(div);
                    rowEls.push(div);
                }
                this.cellElements.push(rowEls);
            }
            requestAnimationFrame(() => this.updateTimerRing(this.maxTimer ? this.timer / this.maxTimer : 1));
        },

        // 依 rows/cols 計算 grid-wrapper 高度，保證 cell = 正方形
        // wrapper width 已透過 CSS 96%/max-width 設定 → 內部 grid 等比例分格 →
        // 設 wrapperHeight = wrapperWidth × (rows/cols) 即可
        _resizeBoardWrapper: function () {
            const wrapper = document.getElementById('game25-grid-wrapper');
            if (!wrapper || !this.rows || !this.cols) return;
            let w = wrapper.offsetWidth;
            if (!w) w = wrapper.getBoundingClientRect().width;
            if (!w) return;
            wrapper.style.height = Math.round(w * this.rows / this.cols) + 'px';
        },

        // ── 拖曳輸入 ──
        getCellFromPoint: function (clientX, clientY) {
            const el = document.elementFromPoint(clientX, clientY);
            if (el && el.classList && el.classList.contains('game25-cell')) {
                const r = parseInt(el.dataset.r);
                const c = parseInt(el.dataset.c);
                if (isNaN(r) || isNaN(c)) return null;
                return { r, c, el };
            }
            return null;
        },

        getEventXY: function (e) {
            if (e.touches && e.touches.length > 0) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches.length > 0) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        },

        onDragStart: function (e) {
            if (!this.isActive || this.isAnimating) return;
            e.preventDefault();
            const { x, y } = this.getEventXY(e);
            const cell = this.getCellFromPoint(x, y);
            if (!cell) return;
            const tile = this.board[cell.r][cell.c];
            if (!tile) return;

            // 起點：押住起點，依難度提示同字
            this.isDragging = true;
            this.dragStartChar = tile.char;
            this.currentPath = [{ r: cell.r, c: cell.c }];
            cell.el.classList.add('start-selected');
            cell.el.classList.add('in-path');
            this.applySameHints(tile.char);
            this.setPathPreview(tile.char);
            this.drawCurrentPath();

            // 啟動拖曳秒數計時
            this.startDragTimer();
            if (window.SoundManager) window.SoundManager.playOpenItem();
            if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
        },

        onDragMove: function (e) {
            if (!this.isDragging || !this.isActive) return;
            if (e.cancelable) e.preventDefault();
            const { x, y } = this.getEventXY(e);
            const cell = this.getCellFromPoint(x, y);
            if (!cell) return;

            const last = this.currentPath[this.currentPath.length - 1];
            if (cell.r === last.r && cell.c === last.c) return;

            const tile = this.board[cell.r][cell.c];
            if (!tile) return;

            // 必須與起點同字
            if (tile.char !== this.dragStartChar) return;

            // 八方向相鄰判定（與路徑末端格相鄰）
            const dr = Math.abs(cell.r - last.r);
            const dc = Math.abs(cell.c - last.c);
            const isNeighbor = (dr <= 1 && dc <= 1 && (dr + dc) > 0);
            if (!isNeighbor) {
                // 嘗試「拖回上一格」── 視為撤銷
                const prevIdx = this.currentPath.findIndex(p => p.r === cell.r && p.c === cell.c);
                if (prevIdx !== -1 && prevIdx === this.currentPath.length - 2) {
                    this.undoLastStep();
                }
                return;
            }

            // 是否已經在路徑中
            const inPathIdx = this.currentPath.findIndex(p => p.r === cell.r && p.c === cell.c);
            if (inPathIdx !== -1) {
                // 拖回上一步 → 撤銷
                if (inPathIdx === this.currentPath.length - 2) {
                    this.undoLastStep();
                }
                return;
            }

            // 合法新步：加入路徑
            this.currentPath.push({ r: cell.r, c: cell.c });
            cell.el.classList.add('in-path');
            // 路徑預覽：以同字串聯顯示（用於玩家確認路徑長度）
            this.setPathPreview(this.dragStartChar.repeat(this.currentPath.length));
            this.drawCurrentPath();
            if (window.SoundManager && window.SoundManager.playMelodyNote) {
                window.SoundManager.playMelodyNote((this.currentPath.length - 1) % 21);
            }
            if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(8);
        },

        // 撤銷路徑最後一步（拖回手勢）
        undoLastStep: function () {
            if (this.currentPath.length <= 1) return;
            const popped = this.currentPath.pop();
            const el = this.cellElements[popped.r] && this.cellElements[popped.r][popped.c];
            if (el) el.classList.remove('in-path');
            this.setPathPreview(this.dragStartChar.repeat(this.currentPath.length));
            this.drawCurrentPath();
        },

        onDragEnd: function (e) {
            if (!this.isDragging) return;
            this.isDragging = false;
            this.stopDragTimer();

            const path = this.currentPath.slice();
            const startChar = this.dragStartChar;
            this.currentPath = [];
            this.dragStartChar = null;
            this.clearSameHints();
            this.clearPathHighlights();
            this.setPathPreview('');
            this.drawCurrentPath();

            // 路徑 < 3 → 失效不消除（無懲罰）
            if (path.length < 3) {
                if (window.SoundManager) window.SoundManager.playFailure && window.SoundManager.playFailure();
                return;
            }

            // 有效路徑：扣步數（步數模式）→ 同步更新紅白外框
            const settings = this.difficultySettings[this.difficulty];
            if (settings.moveLimit > 0) {
                this.movesLeft--;
                this.updateHeartsAsMoves();
                this.updateMovesRing();
            }
            // 玩家動了 → 清除閒置提示
            this.clearHint();

            // 收集字頻
            const collectTimes = path.length;
            this.charFreqGot[startChar] = (this.charFreqGot[startChar] || 0) + collectTimes;

            // 順序成詩判定：路徑字塊的 verseIndex 是否單調遞增
            const isVerseOrder = this.detectVerseOrder(path);

            // 計分
            const base = (window.ScoreManager && window.ScoreManager.gameSettings && window.ScoreManager.gameSettings.game25)
                ? window.ScoreManager.gameSettings.game25.getPointA : 40;
            let points = base * path.length;
            if (isVerseOrder) {
                points *= settings.verseMult;
                this.showVerseBonus(settings.verseMult);
                if (window.SoundManager && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
            } else {
                if (window.SoundManager) window.SoundManager.playSuccess && window.SoundManager.playSuccess();
            }
            this.score += points;
            document.getElementById('game25-score').textContent = this.score;

            // 套用消除動畫 + 同色粒子 + 字魂飛向對應進度卡
            path.forEach(p => {
                const el = this.cellElements[p.r] && this.cellElements[p.r][p.c];
                if (el) {
                    el.classList.add('clearing');
                    const ch = this.board[p.r] && this.board[p.r][p.c] && this.board[p.r][p.c].char;
                    const hue = this.getHueForChar(ch);
                    this.spawnParticles(el, 7, hue);
                    // 字魂只對「真實目標字」飛升（不在 uniquePoemChars 內的字不飛）
                    if (ch && this.uniquePoemChars.indexOf(ch) >= 0) {
                        this.spawnSoul(el, ch);
                    }
                }
            });

            this.updateFreqLine(true); // animateNewlyLit
            this.updateProgressText();

            // 動畫結束後重力下落 + 補位 + 連鎖偵測（renderBoard(true) → 套階梯動畫）
            this.isAnimating = true;
            setTimeout(() => {
                path.forEach(p => { this.board[p.r][p.c] = null; });
                this.applyGravity();
                this.refillBoard();
                this.renderBoard(true);

                // 勝利條件：全字頻達標 → 走過關動畫
                if (this.isAllCollected()) {
                    this.isAnimating = false;
                    this.playWinSequence();
                    return;
                }

                // 連鎖偵測（自然三連）
                this.resolveMatchesChain(1);
            }, 500);
        },

        // ── 順序成詩判定 ──
        // path 中每格的 verseIndex 是否單調遞增（嚴格遞增、且每格都有 verseIndex）
        detectVerseOrder: function (path) {
            if (path.length < 3) return false;
            let prev = -1;
            for (let i = 0; i < path.length; i++) {
                const tile = this.board[path[i].r][path[i].c];
                if (!tile || tile.verseIndex === null || tile.verseIndex === undefined) return false;
                if (tile.verseIndex <= prev) return false;
                prev = tile.verseIndex;
            }
            return true;
        },

        // ── 同字提示 ──
        applySameHints: function (ch) {
            const settings = this.difficultySettings[this.difficulty];
            if (settings.sameHint === 'none') return;
            const sameCells = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.board[r][c] && this.board[r][c].char === ch) {
                        sameCells.push({ r, c });
                    }
                }
            }
            if (settings.sameHint === 'half') {
                // 隨機亮 50%
                sameCells.sort(() => Math.random() - 0.5);
                const half = Math.ceil(sameCells.length / 2);
                for (let i = 0; i < half; i++) {
                    const el = this.cellElements[sameCells[i].r] && this.cellElements[sameCells[i].r][sameCells[i].c];
                    if (el) el.classList.add('same-hint');
                }
            } else {
                // 'all' → 全亮
                sameCells.forEach(s => {
                    const el = this.cellElements[s.r] && this.cellElements[s.r][s.c];
                    if (el) el.classList.add('same-hint');
                });
            }
        },

        clearSameHints: function () {
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const el = this.cellElements[r] && this.cellElements[r][c];
                    if (el) el.classList.remove('same-hint');
                }
            }
        },

        clearPathHighlights: function () {
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const el = this.cellElements[r] && this.cellElements[r][c];
                    if (el) {
                        el.classList.remove('in-path');
                        el.classList.remove('start-selected');
                    }
                }
            }
        },

        // 路徑 SVG 繪製
        drawCurrentPath: function () {
            const pathEl = document.getElementById('game25-current-path');
            if (!pathEl) return;
            if (this.currentPath.length === 0) {
                pathEl.setAttribute('d', '');
                return;
            }
            const wrapper = document.getElementById('game25-grid-wrapper');
            const w = wrapper.offsetWidth;
            const h = wrapper.offsetHeight;
            const cellW = w / this.cols;
            const cellH = h / this.rows;
            let d = '';
            this.currentPath.forEach((p, i) => {
                const cx = (p.c + 0.5) * cellW;
                const cy = (p.r + 0.5) * cellH;
                d += (i === 0 ? 'M ' : 'L ') + cx + ' ' + cy + ' ';
            });
            pathEl.setAttribute('d', d);
        },

        // 路徑預覽文字
        setPathPreview: function (txt) {
            const el = document.getElementById('game25-path-preview');
            if (el) el.textContent = txt || ' ';
        },

        // 拖曳秒數條
        setDragBar: function (ratio) {
            const el = document.getElementById('game25-drag-bar');
            if (el) el.style.width = (Math.max(0, Math.min(1, ratio)) * 100) + '%';
        },

        startDragTimer: function () {
            this.stopDragTimer();
            this.dragStartTime = Date.now();
            this.setDragBar(1);
            this.dragBarInterval = setInterval(() => {
                const elapsed = Date.now() - this.dragStartTime;
                const ratio = 1 - (elapsed / this.dragLimitMs);
                if (ratio <= 0) {
                    this.setDragBar(0);
                    // 逾時 → 路徑自動失效
                    this.cancelDragByTimeout();
                } else {
                    this.setDragBar(ratio);
                }
            }, 50);
        },

        stopDragTimer: function () {
            if (this.dragBarInterval) {
                clearInterval(this.dragBarInterval);
                this.dragBarInterval = null;
            }
        },

        // 拖曳逾時：強制結束、不消除
        cancelDragByTimeout: function () {
            this.stopDragTimer();
            if (!this.isDragging) return;
            this.isDragging = false;
            this.currentPath = [];
            this.dragStartChar = null;
            this.clearSameHints();
            this.clearPathHighlights();
            this.setPathPreview('');
            this.drawCurrentPath();
            this.setDragBar(0);
            if (window.SoundManager) window.SoundManager.playFailure && window.SoundManager.playFailure();
        },

        // 順序成詩特效：在棋盤中央彈出 ×N 標
        showVerseBonus: function (mult) {
            const wrapper = document.getElementById('game25-grid-wrapper');
            if (!wrapper) return;
            const el = document.createElement('div');
            el.className = 'game25-verse-bonus';
            el.textContent = `順序成詩 ×${mult}`;
            wrapper.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1300);
        },

        // 連鎖讚辭
        showChainPraise: function (chainCount) {
            const wrapper = document.getElementById('game25-grid-wrapper');
            if (!wrapper) return;
            const praise = this.chainPraises[(chainCount - 2) % this.chainPraises.length];
            const el = document.createElement('div');
            el.className = 'game25-chain-popup';
            el.textContent = `${praise} ×${chainCount}`;
            wrapper.appendChild(el);
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 950);
        },

        // ── 重力與補位 ──
        // 重力：每欄非 null 字塊往下沉；移動的 tile 標記 _isFalling + _fallDelay
        //   （越上方的 tile 越晚下落 → 「一層一層依序滑落」的視覺節奏，每層 40ms 階梯）
        applyGravity: function () {
            for (let c = 0; c < this.cols; c++) {
                const stack = []; // { tile, originRow }
                for (let r = this.rows - 1; r >= 0; r--) {
                    if (this.board[r][c] !== null && this.board[r][c] !== undefined) {
                        stack.push({ tile: this.board[r][c], originRow: r });
                    }
                }
                let stagger = 0;
                for (let r = this.rows - 1; r >= 0; r--) {
                    const item = stack.shift();
                    if (item) {
                        if (item.originRow !== r) {
                            item.tile._isFalling = true;
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

        // 補位：所有 null 格生成新字塊；_spawnDelay 依欄內由下往上遞增，
        //   下方新格先進、上方新格後進 → 「由上滑落」的層次感
        refillBoard: function () {
            for (let c = 0; c < this.cols; c++) {
                let spawnIdx = 0;
                for (let r = this.rows - 1; r >= 0; r--) {
                    if (this.board[r][c] === null || this.board[r][c] === undefined) {
                        const t = this.makeNewTile(false);
                        t._isNew = true;
                        t._spawnDelay = 80 + spawnIdx * 60;
                        spawnIdx++;
                        this.board[r][c] = t;
                    }
                }
            }
        },

        // ── 自然三連連鎖偵測（橫向/縱向） ──
        findAllMatches: function () {
            const matches = [];
            // 橫向掃描
            for (let r = 0; r < this.rows; r++) {
                let runStart = 0;
                for (let c = 1; c <= this.cols; c++) {
                    const prevTile = this.board[r][c - 1];
                    const curTile = (c < this.cols) ? this.board[r][c] : null;
                    const prev = prevTile ? prevTile.char : null;
                    const cur = curTile ? curTile.char : null;
                    if (cur !== prev || c === this.cols) {
                        const len = c - runStart;
                        if (prev !== null && len >= 3) {
                            const cells = [];
                            for (let k = runStart; k < c; k++) cells.push({ r, c: k });
                            matches.push({ cells, char: prev, length: len });
                        }
                        runStart = c;
                    }
                }
            }
            // 縱向掃描
            for (let c = 0; c < this.cols; c++) {
                let runStart = 0;
                for (let r = 1; r <= this.rows; r++) {
                    const prevTile = this.board[r - 1][c];
                    const curTile = (r < this.rows) ? this.board[r][c] : null;
                    const prev = prevTile ? prevTile.char : null;
                    const cur = curTile ? curTile.char : null;
                    if (cur !== prev || r === this.rows) {
                        const len = r - runStart;
                        if (prev !== null && len >= 3) {
                            const cells = [];
                            for (let k = runStart; k < r; k++) cells.push({ r: k, c });
                            matches.push({ cells, char: prev, length: len });
                        }
                        runStart = r;
                    }
                }
            }
            return matches;
        },

        // 連鎖反應結算（補位後若形成自然三連則自動消除）
        resolveMatchesChain: function (chainCount) {
            const matches = this.findAllMatches();
            if (matches.length === 0) {
                this.isAnimating = false;
                this.afterChainSettle();
                return;
            }

            const toRemove = {};
            const chainMult = Math.min(chainCount, 5);
            const multTable = [1, 2, 3, 5, 8, 13];

            matches.forEach(m => {
                m.cells.forEach(cell => { toRemove[cell.r + ',' + cell.c] = true; });
                // 收集字頻（連鎖自然消除一次算一次）
                if (this.charFreqTarget[m.char] !== undefined) {
                    this.charFreqGot[m.char] = (this.charFreqGot[m.char] || 0) + m.length;
                }
                const base = (window.ScoreManager && window.ScoreManager.gameSettings && window.ScoreManager.gameSettings.game25)
                    ? window.ScoreManager.gameSettings.game25.getPointA : 40;
                this.score += base * m.length * multTable[chainMult];
            });

            if (chainCount >= 2) this.showChainPraise(chainCount);
            if (window.SoundManager) window.SoundManager.playSuccess && window.SoundManager.playSuccess();

            Object.keys(toRemove).forEach(k => {
                const [r, c] = k.split(',').map(Number);
                const el = this.cellElements[r] && this.cellElements[r][c];
                if (el) {
                    el.classList.add('clearing');
                    const ch = this.board[r] && this.board[r][c] && this.board[r][c].char;
                    const hue = this.getHueForChar(ch);
                    this.spawnParticles(el, 6, hue);
                    if (ch && this.uniquePoemChars.indexOf(ch) >= 0) this.spawnSoul(el, ch);
                }
            });

            document.getElementById('game25-score').textContent = this.score;
            this.updateFreqLine(true);
            this.updateProgressText();

            setTimeout(() => {
                Object.keys(toRemove).forEach(k => {
                    const [r, c] = k.split(',').map(Number);
                    this.board[r][c] = null;
                });
                this.applyGravity();
                this.refillBoard();
                this.renderBoard(true);

                if (this.isAllCollected()) {
                    this.isAnimating = false;
                    this.playWinSequence();
                    return;
                }
                setTimeout(() => this.resolveMatchesChain(chainCount + 1), 200);
            }, 300);
        },

        // 連鎖結束後的整理
        afterChainSettle: function () {
            // 死局檢查 → 自動洗牌（找不到任何 ≥3 同字連通群）
            if (!this.hasPossiblePath()) {
                this.shuffleBoard();
                this.renderBoard();
                if (window.SoundManager) window.SoundManager.playOpenItem();
            }
            const settings = this.difficultySettings[this.difficulty];
            if (settings.moveLimit > 0 && this.movesLeft <= 0 && !this.isAllCollected()) {
                this.gameOver(false, '步數用盡');
            }
        },

        // ── 死局偵測：是否存在任一字的「八方向同字連通群 ≥3」 ──
        hasPossiblePath: function () {
            const visited = Array(this.rows).fill().map(() => Array(this.cols).fill(false));
            const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (visited[r][c] || !this.board[r][c]) continue;
                    const ch = this.board[r][c].char;
                    // BFS 找同字八方向連通群
                    let size = 0;
                    const queue = [{ r, c }];
                    visited[r][c] = true;
                    while (queue.length > 0) {
                        const cur = queue.shift();
                        size++;
                        if (size >= 3) return true;
                        for (const d of dirs) {
                            const nr = cur.r + d[0], nc = cur.c + d[1];
                            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
                            if (visited[nr][nc]) continue;
                            if (this.board[nr][nc] && this.board[nr][nc].char === ch) {
                                visited[nr][nc] = true;
                                queue.push({ r: nr, c: nc });
                            }
                        }
                    }
                }
            }
            return false;
        },

        // 洗牌
        shuffleBoard: function () {
            const flat = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) if (this.board[r][c]) flat.push(this.board[r][c]);
            }
            for (let i = flat.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [flat[i], flat[j]] = [flat[j], flat[i]];
            }
            let idx = 0;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) this.board[r][c] = flat[idx++] || this.makeNewTile(false);
            }
        },

        // ── 進度顯示 ──
        isAllCollected: function () {
            for (const ch in this.charFreqTarget) {
                if ((this.charFreqGot[ch] || 0) < this.charFreqTarget[ch]) return false;
            }
            return true;
        },

        updateProgressText: function () {
            const txt = document.getElementById('game25-progress-text');
            if (!txt) return;
            // 計算已收齊字數 / 總字種數
            const chars = Object.keys(this.charFreqTarget);
            let done = 0;
            chars.forEach(ch => { if ((this.charFreqGot[ch] || 0) >= this.charFreqTarget[ch]) done++; });
            txt.textContent = `收集進度：${done} / ${chars.length} 字`;
        },

        // 多卡橫排進度（仿 game24）：每張卡 = 上方彩色字塊（同棋盤色）+ 下方 X/Y
        // animateNewlyLit：若 true，對「本次新達標」的卡片加 just-lit 彈跳
        updateFreqLine: function (animateNewlyLit) {
            const line = document.getElementById('game25-freq-line');
            if (!line) return;
            const prevGot = this._prevFreqSnap || {};
            let html = '';
            this.uniquePoemChars.forEach(ch => {
                const target = this.charFreqTarget[ch] || 0;
                const got = Math.min(target, this.charFreqGot[ch] || 0);
                const prev = Math.min(target, prevGot[ch] || 0);
                const done = target > 0 && got >= target;
                const justDone = animateNewlyLit && done && prev < target;
                const hue = this.getHueForChar(ch);
                html += `<span class="game25-char-group ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g25-h:${hue}">`
                    + `<span class="game25-char-tile">${ch}</span>`
                    + `<span class="game25-char-count"><span class="game25-char-num">${got}</span>/<span class="game25-char-den">${target}</span></span>`
                    + `</span>`;
            });
            line.innerHTML = html;
            this._prevFreqSnap = Object.assign({}, this.charFreqGot);
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

        // 更新計時器矩形邊框（順時鐘環繞棋盤）
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game25-timer-path');
            const wrapper = document.getElementById('game25-grid-wrapper');
            const svg = document.getElementById('game25-timer-ring');
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
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        // ── 紅白步數倒數框（仿 game9 / game24） ──
        //   依 maxMoves 將外框等分成 N 段；奇紅偶白交替；每走一步從尾段開始扣除
        updateMovesRing: function () {
            const rectRed = document.getElementById('game25-moves-path-red');
            const rectWhite = document.getElementById('game25-moves-path-white');
            const wrapper = document.getElementById('game25-grid-wrapper');
            const svg = document.getElementById('game25-timer-ring');
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
            rectRed.setAttribute('width', w - 6); rectRed.setAttribute('height', h - 6);
            rectWhite.setAttribute('width', w - 6); rectWhite.setAttribute('height', h - 6);
            const totalLength = (w - 6 + h - 6) * 2;
            const segment = totalLength / this.maxMoves;
            const dashArrayRed = [], dashArrayWhite = [];
            for (let i = 1; i <= this.maxMoves; i++) {
                const isVisible = i <= this.movesLeft;
                const isRedSlot = (i % 2 === 0);
                if (isVisible) {
                    if (isRedSlot) { dashArrayWhite.push(0, segment); dashArrayRed.push(segment, 0); }
                    else { dashArrayWhite.push(segment, 0); dashArrayRed.push(0, segment); }
                } else { dashArrayWhite.push(0, segment); dashArrayRed.push(0, segment); }
            }
            rectRed.style.strokeDasharray = dashArrayRed.join(' ');
            rectWhite.style.strokeDasharray = dashArrayWhite.join(' ');
        },

        // ── 閒置提示（hintDelay 秒未操作 → 為可形成最長路徑的同字塊發光） ──
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
                this.hintedCells.forEach(el => { if (el) el.classList.remove('hint'); });
                this.hintedCells = [];
            }
        },
        // 尋找棋盤上「最大同字相鄰群」其中一格（DFS 連通分量），對群內所有格發光
        showHint: function () {
            if (!this.isActive || this.isAnimating || this.isDragging) return;
            const visited = {};
            let best = null; // { cells: [{r,c}], size }
            const dirs8 = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const key = r + ',' + c;
                    if (visited[key]) continue;
                    const t = this.board[r][c];
                    if (!t || this.uniquePoemChars.indexOf(t.char) < 0) { visited[key] = true; continue; }
                    // DFS 同字連通分量（八方向）
                    const stack = [{ r, c }];
                    const cluster = [];
                    while (stack.length) {
                        const cur = stack.pop();
                        const ck = cur.r + ',' + cur.c;
                        if (visited[ck]) continue;
                        visited[ck] = true;
                        const ct = this.board[cur.r][cur.c];
                        if (!ct || ct.char !== t.char) continue;
                        cluster.push(cur);
                        for (const [dr, dc] of dirs8) {
                            const nr = cur.r + dr, nc = cur.c + dc;
                            if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
                            stack.push({ r: nr, c: nc });
                        }
                    }
                    if (cluster.length >= 3 && (!best || cluster.length > best.size)) {
                        best = { cells: cluster, size: cluster.length };
                    }
                }
            }
            if (best) {
                best.cells.forEach(p => {
                    const el = this.cellElements[p.r] && this.cellElements[p.r][p.c];
                    if (el) { el.classList.add('hint'); this.hintedCells.push(el); }
                });
            }
        },

        // ── FX 輔助：座標已除以 stageScale，避免 transform: scale 雙重縮放偏移 ──
        getFxLayer: function () {
            return document.getElementById('game25-grid-wrapper');
        },
        getCellCenter: function (cellEl) {
            const wrapper = this.getFxLayer();
            if (!cellEl || !wrapper) return { x: 0, y: 0 };
            const cr = cellEl.getBoundingClientRect();
            const wr = wrapper.getBoundingClientRect();
            const scale = window.stageScale || 1;
            return {
                x: ((cr.left - wr.left) + cr.width / 2) / scale,
                y: ((cr.top - wr.top) + cr.height / 2) / scale,
                w: cr.width / scale, h: cr.height / scale
            };
        },
        // 粒子：從消除字塊向外拋灑 N 個亮點；hue 為字塊同色相
        spawnParticles: function (cellEl, count, hue) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const c = this.getCellCenter(cellEl);
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game25-particle';
                const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
                const dist = 35 + Math.random() * 35;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist - 8;
                p.style.left = c.x + 'px';
                p.style.top = c.y + 'px';
                p.style.setProperty('--g25-dx', dx + 'px');
                p.style.setProperty('--g25-dy', dy + 'px');
                if (typeof hue === 'number') p.style.setProperty('--g25-ph', hue);
                const scale = 0.8 + Math.random() * 0.6;
                p.style.width = (8 * scale) + 'px';
                p.style.height = (8 * scale) + 'px';
                wrapper.appendChild(p);
                setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
            }
        },
        // 字魂：消除字塊飛向頂端對應進度卡（.game25-char-group[data-char="X"]）
        spawnSoul: function (cellEl, ch) {
            const wrapper = this.getFxLayer();
            if (!wrapper) return;
            const start = this.getCellCenter(cellEl);
            const groupEl = document.querySelector(`.game25-char-group[data-char="${ch}"]`);
            let endX, endY;
            if (groupEl) {
                const gr = groupEl.getBoundingClientRect();
                const wr = wrapper.getBoundingClientRect();
                const scale = window.stageScale || 1;
                endX = ((gr.left - wr.left) + gr.width / 2) / scale;
                endY = ((gr.top - wr.top) + gr.height / 2) / scale;
            } else { endX = start.x; endY = -20; }
            const soul = document.createElement('div');
            soul.className = 'game25-soul';
            soul.textContent = ch;
            soul.style.left = start.x + 'px';
            soul.style.top = start.y + 'px';
            wrapper.appendChild(soul);
            requestAnimationFrame(() => {
                soul.style.opacity = '0.95';
                soul.style.transform = 'translate(-50%, -50%) scale(1.2)';
                soul.style.transition = 'top 0.2s ease-out, opacity 0.15s ease, transform 0.2s ease';
                soul.style.top = (start.y - 30) + 'px';
            });
            setTimeout(() => {
                soul.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, transform 0.4s ease';
                soul.style.left = endX + 'px';
                soul.style.top = endY + 'px';
                soul.style.transform = 'translate(-50%, -50%) scale(0.8)';
            }, 210);
            setTimeout(() => {
                soul.style.opacity = '0';
                if (groupEl) {
                    groupEl.style.transform = 'scale(1.25)';
                    groupEl.style.transition = 'transform 0.2s ease';
                    setTimeout(() => { groupEl.style.transform = ''; }, 220);
                }
            }, 720);
            setTimeout(() => { if (soul.parentNode) soul.parentNode.removeChild(soul); }, 900);
        },

        // ── 過關動畫：進度卡逐一發金光 → 呼叫 gameOver(true) → ScoreManager 加分 + 星星 → MessageBox ──
        playWinSequence: function () {
            this.isAnimating = true;
            this.clearHint();
            const cards = Array.from(document.querySelectorAll('#game25-freq-line .game25-char-group'));
            const GAP = 180;
            cards.forEach((g, i) => setTimeout(() => g.classList.add('stage-flash'), i * GAP));
            const total = cards.length * GAP + 500;
            setTimeout(() => {
                this.isAnimating = false;
                this.gameOver(true, '');
            }, total);
        },

        // ── 遊戲結束（勝/敗）統一處理 ──
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);
            this.stopDragTimer();
            this.clearHint();

            // 失敗時寫入 game_logs；勝利由 ScoreManager.saveScore 寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 25,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game25-retryGame-btn').disabled = true;
                document.getElementById('game25-newGame-btn').disabled = true;
            } else {
                document.getElementById('game25-retryGame-btn').disabled = false;
                document.getElementById('game25-newGame-btn').disabled = false;
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '珠散字落！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game25', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game25', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game25',
                    timerContainerId: 'game25-grid-wrapper',
                    scoreElementId: 'game25-score',
                    heartsSelector: '#game25-hearts-line .game25-heart:not(.empty)',
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

    window.Game25 = Game25;

    // 透過 ?game=25 URL 參數自動啟動（支援挑戰關卡直連）
    if (new URLSearchParams(window.location.search).get('game') === '25') {
        setTimeout(() => {
            if (window.Game25) window.Game25.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
