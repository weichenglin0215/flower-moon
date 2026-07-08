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
        targetChars: [],         // 全詩所有字（不含標點）── 用於計算時限（timeLimitRate × 字數）

        // ── 逐句出題（抄襲 GAME24：一次只出一句，完成後表演過場再出下一句）──
        currentLineIndex: 0,     // 當前正在收集的句子索引
        currentLineChars: [],    // 當前句去重後的目標字陣列
        collectTarget: 0,        // 當前難度每字需收集次數
        collectProgress: {},     // 當前句每字已收集次數
        _prevCollectProgress: {},// 進度快照（用於 just-lit 彈跳判定）

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
        // ── 5 秒閒置扣步（抄襲 GAME24／仿 GAME9）──
        lastActionTime: 0,
        idleInterval: null,
        idleThreshold: 5000,

        // ── 計時器 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        /*
         * 難度設定（抄襲 GAME24 §7 — 使用 moveLimitRate 動態計算步數）
         * timeLimitRate ：每字時間倍率（秒）。0 = 不使用時限（步數模式）。
         *                 實際時限 = targetChars.length × timeLimitRate
         * moveLimitRate ：步數倍率。總步數 = round(全詩字數 × moveLimitRate × collectTarget)
         *                 首句 ≥7 字時再 × 1.3 倍
         * poemMinRating ：詩評下限
         * rowsCfg/colsCfg：棋盤尺寸
         * sameHint      ：同字提示方式 'all'/'half'/'none'
         * verseMult     ：順序成詩倍率（GAME25 專屬）
         * refillBias    ：加權補位強度（0~1）
         * collectTarget ：每字需收集次數
         */
        difficultySettings: {
            '小學':   { timeLimitRate: 0, moveLimitRate: 0.8,  poemMinRating: 6, rowsCfg: 7, colsCfg: 7, sameHint: 'all',  verseMult: 3, refillBias: 0.80, hintDelay: 3, minLines: 2, maxLines: 2, minChars: 5,  maxChars: 14, collectTarget: 2 },
            '中學':   { timeLimitRate: 0, moveLimitRate: 0.7,  poemMinRating: 5, rowsCfg: 7, colsCfg: 7, sameHint: 'all',  verseMult: 3, refillBias: 0.60, hintDelay: 3, minLines: 2, maxLines: 2, minChars: 5,  maxChars: 14, collectTarget: 3 },
            '高中':   { timeLimitRate: 0, moveLimitRate: 0.6,  poemMinRating: 4, rowsCfg: 8, colsCfg: 7, sameHint: 'half', verseMult: 3, refillBias: 0.50, hintDelay: 5, minLines: 4, maxLines: 4, minChars: 7,  maxChars: 28, collectTarget: 3 },
            '大學':   { timeLimitRate: 0, moveLimitRate: 0.55, poemMinRating: 3, rowsCfg: 9, colsCfg: 7, sameHint: 'none', verseMult: 5, refillBias: 0.30, hintDelay: 0, minLines: 4, maxLines: 4, minChars: 7,  maxChars: 28, collectTarget: 4 },
            '研究所': { timeLimitRate: 0, moveLimitRate: 0.5,  poemMinRating: 3, rowsCfg: 10, colsCfg: 8, sameHint: 'none', verseMult: 5, refillBias: 0.00, hintDelay: 0, minLines: 4, maxLines: 4, minChars: 7,  maxChars: 28, collectTarget: 5 }
        },

        // 全詩去重後字陣列（依首次出現順序）— 用作 360° HUE 等分基準
        // 同字必同色：相同字在 uniquePoemChars 的索引相同 → 計算出同樣的色相
        uniquePoemChars: [],
        // 本局起始步數（仿 game24，用於紅白倒數框分段）
        maxMoves: 0,
        // 閒置提示計時器與當前發光格
        hintTimer: null,
        hintedCells: [],

        // ── 委派給 window.TilePresentation：跨 game24~game30 統一的色相/配色實作 ──
        getHueForChar: function (ch) {
            return window.TilePresentation.getHueForChar(ch, this.currentLineChars);
        },
        getColorForChar: function (ch) {
            return window.TilePresentation.getColorForChar(ch, this.currentLineChars);
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
                    <div id="game25-moves-label" class="game25-moves-label" style="display:none">盤面:<span id="game25-stage-text">1/1</span> 步數:<span id="game25-moves">0</span>/<span id="game25-max-moves">0</span></div>
                    <div id="game25-poem-info" class="game25-poem-info"></div>
                </div>
                <div class="game25-info-bar">
                    <div id="game25-freq-line" class="game25-freq-line"></div>
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
                        <div id="game25-chain-praise" class="game25-chain-praise hidden"></div>
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
            this.stopIdleWatcher();
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
            // 逐句出題：從第一句開始，每字需收集 collectTarget 次
            this.currentLineIndex = 0;
            this.collectTarget = settings.collectTarget;
            // 總步數（抄襲 GAME24）：round(全詩字數 × moveLimitRate × collectTarget) × (首句≥7字?1.3:1)
            const totalChars = (this.targetChars && this.targetChars.length) || 0;
            const firstLineLen = (this.poemLines && this.poemLines[0]) ? this.poemLines[0].length : 0;
            const longLineBonus = (firstLineLen >= 7) ? 1.3 : 1.0;
            this.maxMoves = settings.moveLimitRate > 0
                ? Math.max(1, Math.round(totalChars * settings.moveLimitRate * this.collectTarget * longLineBonus))
                : 0;
            this.movesLeft = this.maxMoves;
            console.log('[game25] 總步數計算：' + totalChars + ' 字 × ' + settings.moveLimitRate + ' × ' + this.collectTarget
                + (longLineBonus > 1 ? ' × 1.3（首句 ' + firstLineLen + ' 字 ≥7）' : '')
                + ' = ' + this.maxMoves + ' 步');

            document.getElementById('game25-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            // 啟用按鈕
            document.getElementById('game25-retryGame-btn').disabled = false;
            document.getElementById('game25-newGame-btn').disabled = false;

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

            // 步數模式 → 顯示步數標籤 + 啟用紅白雙框；時限模式 → 隱藏
            const movesLabel = document.getElementById('game25-moves-label');
            if (this.maxMoves > 0) {
                if (movesLabel) movesLabel.style.display = 'inline-block';
                timerSvg.style.display = 'block';
                if (movesPathRed) movesPathRed.style.display = 'block';
                if (movesPathWhite) movesPathWhite.style.display = 'block';
            } else {
                if (movesLabel) movesLabel.style.display = 'none';
                if (movesPathRed) movesPathRed.style.display = 'none';
                if (movesPathWhite) movesPathWhite.style.display = 'none';
            }

            // 依 rows/cols 設定 grid-wrapper 高度（每格正方形）
            this._resizeBoardWrapper();
            // 等 DOM 佈局完成後計算紅白框 dash 段落
            requestAnimationFrame(() => this.updateMovesRing());

            // 開始收集第一句（抄襲 GAME24：一次只出一句）
            this.startCurrentLine();
        },

        // ── 開始收集當前句（抄襲 GAME24.startCurrentLine） ──
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
            this._prevCollectProgress = {};

            this.updateFreqLine();
            this.generateBoard();
            this.renderBoard();
            this.updateMovesLabel();
            this.scheduleHint();
            this.startIdleWatcher();
        },

        // ── 5 秒閒置扣步（抄襲 GAME24／仿 GAME9） ──
        //   步數模式生效；動畫或拖曳中不計；達 idleThreshold 扣 1 步、播放失敗音、更新框與標籤
        startIdleWatcher: function () {
            this.stopIdleWatcher();
            if (!this.maxMoves || this.maxMoves <= 0) return;
            this.lastActionTime = Date.now();
            this.idleInterval = setInterval(() => {
                if (!this.isActive) return;
                if (this.isDragging || this.isAnimating) {
                    this.lastActionTime = Date.now();
                    return;
                }
                if (Date.now() - this.lastActionTime < this.idleThreshold) return;
                this.movesLeft = Math.max(0, this.movesLeft - 1);
                this.lastActionTime = Date.now();
                this.updateMovesLabel();
                this.updateMovesRing();
                if (window.SoundManager && window.SoundManager.playFailure) window.SoundManager.playFailure();
                if (this.movesLeft <= 0 && !this.isLineComplete()) {
                    this.gameOver(false, '怠功！步數用盡');
                }
            }, 200);
        },
        stopIdleWatcher: function () {
            if (this.idleInterval) { clearInterval(this.idleInterval); this.idleInterval = null; }
        },
        resetIdleTimer: function () {
            this.lastActionTime = Date.now();
        },

        // 更新「盤面:X/Y 步數:n/N」標籤（開新句、每走一步呼叫）
        updateMovesLabel: function () {
            const stageEl = document.getElementById('game25-stage-text');
            const movesEl = document.getElementById('game25-moves');
            const maxEl = document.getElementById('game25-max-moves');
            const totalLines = this.poemLines ? this.poemLines.length : 1;
            if (stageEl) stageEl.textContent = (this.currentLineIndex + 1) + '/' + totalLines;
            if (movesEl) movesEl.textContent = this.movesLeft;
            if (maxEl) maxEl.textContent = this.maxMoves;
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

        // 產生一個新字塊（字皆取自「當前句」目標字；抄襲 GAME24 逐句棋盤）
        makeNewTile: function (avoidPreTriple) {
            const ch = this.pickWeightedChar();
            const tile = {
                char: ch,
                verseIndex: this.pickVerseIndexFor(ch), // 該字在當前句中的位置（供順序成詩判定）
                id: ++this.cellIdCounter
            };
            return tile;
        },

        // 從「當前句」中該字的出現位置隨機選一個作為 verseIndex（順序成詩以句內字序為準）
        pickVerseIndexFor: function (ch) {
            const line = this.poemLines[this.currentLineIndex] || '';
            const positions = [];
            for (let i = 0; i < line.length; i++) {
                if (line[i] === ch) positions.push(i);
            }
            if (positions.length === 0) return null;
            return positions[Math.floor(Math.random() * positions.length)];
        },

        // 加權字塊抽選：僅取自當前句目標字，依「尚缺次數」加權（refillBias 控制加權強度）
        pickWeightedChar: function () {
            const settings = this.difficultySettings[this.difficulty];
            const bias = settings.refillBias;
            const chars = this.currentLineChars.slice();
            if (chars.length === 0) return '字';

            // 計算每字缺口（collectTarget - 已收集）
            const deficits = chars.map(ch => Math.max(0, this.collectTarget - (this.collectProgress[ch] || 0)));
            const totalDeficit = deficits.reduce((a, b) => a + b, 0);

            if (totalDeficit === 0) {
                // 當前句全達標 → 均勻隨機（過場前的補位，畫面用）
                return chars[Math.floor(Math.random() * chars.length)];
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
            // 均勻隨機從當前句字選
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
                        // 套用共用 TileStyleUtils 分組配色，與上方進度字塊(char-tile)保持一致
                        const col = this.getColorForChar(t.char);
                        if (col) {
                            div.style.setProperty('--g25-h', col.hue);
                            div.style.setProperty('--g25-s', col.sat + '%');
                            div.style.setProperty('--g25-l', col.lum + '%');
                            div.style.setProperty('--g25-text', col.textColor);
                            // 依當前句字序套用五種形狀之一（同字同形）
                            const shpIdx = this.currentLineChars.indexOf(t.char);
                            if (shpIdx >= 0) window.TileStyleUtils.applyShape(div, window.TileStyleUtils.getGroupShape(shpIdx));
                        } else {
                            // 非當前句字（理論上不會出現）→ 灰調 decoy
                            div.style.setProperty('--g25-h', this.getHueForChar(t.char));
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
        //   抄襲 GAME24：wrapper 有 padding:14px，須把左右各 14px 從可用寬度扣除
        //   cell 邊長 = (wrapperWidth − 28) / cols
        //   wrapperHeight = cell × rows + 28  → 讓上下也留出 14px 給 SVG 倒數框
        _resizeBoardWrapper: function () {
            const wrapper = document.getElementById('game25-grid-wrapper');
            if (!wrapper || !this.rows || !this.cols) return;
            const PAD = 14 * 2;
            let w = wrapper.offsetWidth;
            if (!w) w = wrapper.getBoundingClientRect().width;
            if (!w) return;
            const cell = (w - PAD) / this.cols;
            const targetH = Math.round(cell * this.rows + PAD);
            wrapper.style.height = targetH + 'px';
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

            // 起點：押住起點，依難度提示「起點連通群」中的同字塊
            this.isDragging = true;
            this.dragStartChar = tile.char;
            this.currentPath = [{ r: cell.r, c: cell.c }];
            cell.el.classList.add('start-selected');
            cell.el.classList.add('in-path');
            this.applySameHints(cell.r, cell.c);
            this.setPathPreview(tile.char);
            this.drawCurrentPath();

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

            // 有效路徑：扣步數（步數模式）→ 同步更新紅白外框與步數標籤
            const settings = this.difficultySettings[this.difficulty];
            // 有效路徑 → 重置怠功計時
            this.resetIdleTimer();
            if (this.maxMoves > 0) {
                this.movesLeft--;
                this.updateMovesLabel();
                this.updateMovesRing();
            }
            // 玩家動了 → 清除閒置提示
            this.clearHint();

            // ⚠️ 收集次數：每次消除只算 1 次（不論拖曳長度）
            if (this.currentLineChars.indexOf(startChar) >= 0) {
                this.collectProgress[startChar] = Math.min(
                    this.collectTarget,
                    (this.collectProgress[startChar] || 0) + window.EliminateScore.getCollectTimes()
                );
            }

            // 順序成詩判定：路徑字塊的 verseIndex 是否單調遞增
            const isVerseOrder = this.detectVerseOrder(path);

            // ⚠️ 分數：(2N−5) × getPointA — 3連=1, 4連=3, 5連=5, 6連=7…
            const base = window.ScoreManager
                ? window.ScoreManager.getPointA('game25', this.difficulty) : 40;
            let points = window.EliminateScore.getMatchScore(path.length, base, 1);
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
                    // 字魂只對「當前句目標字」飛升
                    if (ch && this.currentLineChars.indexOf(ch) >= 0) {
                        this.spawnSoul(el, ch);
                    }
                }
            });

            this.updateFreqLine(true); // animateNewlyLit

            // 動畫結束後重力下落 + 補位（renderBoard(true) → 套階梯動畫）
            // ⚠️ 不做「自然三連」自動連鎖偵測：新掉落 / 補位的字塊即使排成三個一列也不會自動消除，
            //     一律等玩家自己拖曳連線才會消除（與 GAME24 的「交換觸發連鎖」不同）。
            this.isAnimating = true;
            setTimeout(() => {
                path.forEach(p => { this.board[p.r][p.c] = null; });
                this.applyGravity();
                this.refillBoard();
                this.renderBoard(true);

                // 當前句完成 → 走逐句過場（最後一句則接勝利動畫）
                if (this.isLineComplete()) {
                    this.completeLine();
                    return;
                }

                // 收尾：死局檢查（觸發重組動畫）+ 步數歸零判定 + 重啟閒置提示
                this.isAnimating = false;
                this.afterChainSettle();
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

        // ── 同字提示：僅亮起「從起點八方向連通的同字塊」──
        //   規則：BFS 從 (startR, startC) 出發，只擴散至 char 相同的鄰格。
        //   視覺：CSS `.game25-cell.same-hint` 只加粗白外框，不改動底色。
        //   sameHint 難度細分：
        //     'all'  → 整個連通群全亮
        //     'half' → 連通群隨機亮一半
        //     'none' → 不提示
        applySameHints: function (startR, startC) {
            const settings = this.difficultySettings[this.difficulty];
            if (settings.sameHint === 'none') return;
            const startTile = this.board[startR] && this.board[startR][startC];
            if (!startTile) return;
            const ch = startTile.char;

            // BFS 從起點蔓延至所有 char 相同的八方向鄰居（連通群，含起點）
            const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            const visited = {};
            const cluster = [];
            const queue = [{ r: startR, c: startC }];
            visited[startR + ',' + startC] = true;
            while (queue.length > 0) {
                const cur = queue.shift();
                cluster.push(cur);
                for (const [dr, dc] of dirs) {
                    const nr = cur.r + dr, nc = cur.c + dc;
                    if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
                    const key = nr + ',' + nc;
                    if (visited[key]) continue;
                    const t = this.board[nr][nc];
                    if (t && t.char === ch) {
                        visited[key] = true;
                        queue.push({ r: nr, c: nc });
                    }
                }
            }

            // 起點本身已用 .start-selected；.same-hint 只加給其他連通群成員
            let targets = cluster.filter(p => !(p.r === startR && p.c === startC));
            if (settings.sameHint === 'half') {
                targets.sort(() => Math.random() - 0.5);
                targets = targets.slice(0, Math.ceil(targets.length / 2));
            }
            targets.forEach(s => {
                const el = this.cellElements[s.r] && this.cellElements[s.r][s.c];
                if (el) el.classList.add('same-hint');
            });
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

        // 拖曳結束後的整理（本作已取消自然三連自動消除，只做死局檢查與步數判定）
        afterChainSettle: function () {
            // 死局檢查 → 自動洗牌（含「重組盤面，請稍待」提示橫幅與掃出/滑入動畫）
            if (!this.hasPossiblePath()) {
                this.reshuffleWithAnimation();
                return;
            }
            const settings = this.difficultySettings[this.difficulty];
            if (this.maxMoves > 0 && this.movesLeft <= 0 && !this.isLineComplete()) {
                this.gameOver(false, '步數用盡');
                return;
            }
            this.scheduleHint();
        },

        // ── 當前句是否全字達標 ──
        isLineComplete: function () {
            if (!this.currentLineChars || this.currentLineChars.length === 0) return false;
            for (const ch of this.currentLineChars) {
                if ((this.collectProgress[ch] || 0) < this.collectTarget) return false;
            }
            return true;
        },

        // ─────────────────────────────────────────────────────────────────
        // 進入下一句：嚴格的階段完成過場（抄襲 GAME24.completeLine，鎖操作直到過場完成）
        //   最後一句 → 進度卡逐一發光後接勝利動畫
        //   非最後一句 → 7 階段：卡片發光→棋盤掃出→恭喜橫幅→舊卡消失→切句生新卡→生新盤面→恢復操作
        // ─────────────────────────────────────────────────────────────────
        completeLine: function () {
            this.isAnimating = true;
            this.isDragging = false;
            this.dragStartChar = null;
            this.currentPath = [];
            this.clearHint();
            this.clearSameHints();
            this.clearPathHighlights();
            this.setPathPreview('');
            this.drawCurrentPath();
            this._cleanupStageRemnants();
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();

            const progEl = document.getElementById('game25-freq-line');
            const oldGroups = progEl ? Array.from(progEl.querySelectorAll('.game25-char-group')) : [];

            // ── 最後一句 → 走勝利流程（進度卡逐一發光 → playWinSequence 已含 gameOver(true)） ──
            const isLastLine = (this.currentLineIndex + 1) >= this.poemLines.length;
            if (isLastLine) {
                this.currentLineIndex++; // 標記全詩完成
                this.playWinSequence();
                return;
            }

            const TILE_FLASH_GAP = 160;
            const ROW_DROP_GAP = 80;
            const TILE_FADE_GAP = 110;
            const TILE_SHOW_GAP = 130;
            const ROW_LAND_GAP = 80;
            const stages = [];

            // STAGE 1：上方進度卡逐一發光
            stages.push((next) => {
                if (oldGroups.length === 0) { next(); return; }
                oldGroups.forEach((g, i) => setTimeout(() => g.classList.add('stage-flash'), i * TILE_FLASH_GAP));
                setTimeout(next, oldGroups.length * TILE_FLASH_GAP + 350);
            });
            // STAGE 2：棋盤由下往上逐列掃出
            stages.push((next) => {
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        const el = this.cellElements[r] && this.cellElements[r][c];
                        if (!el) continue;
                        el.style.setProperty('--g25-delay', ((this.rows - 1 - r) * ROW_DROP_GAP) + 'ms');
                        el.classList.add('sweep-out');
                    }
                }
                setTimeout(next, this.rows * ROW_DROP_GAP + 550);
            });
            // STAGE 3：「恭喜！」橫幅 2 秒
            stages.push((next) => {
                const banner = document.getElementById('game25-chain-praise');
                if (banner) {
                    banner.textContent = '恭喜！進入下一句盤面。';
                    banner.className = 'game25-chain-praise stage-banner animate';
                }
                setTimeout(() => { if (banner) banner.classList.add('hidden'); next(); }, 2000);
            });
            // STAGE 4：舊進度卡逐一消失
            stages.push((next) => {
                if (oldGroups.length === 0) { next(); return; }
                oldGroups.forEach((g, i) => setTimeout(() => g.classList.add('stage-fade-out'), i * TILE_FADE_GAP));
                setTimeout(next, oldGroups.length * TILE_FADE_GAP + 300);
            });
            // STAGE 5：切句、生新進度卡（先隱藏，再依序顯示）
            stages.push((next) => {
                this.currentLineIndex++;
                if (this.currentLineIndex >= this.poemLines.length) {
                    this.isAnimating = false;
                    this.gameOver(true, '');
                    return;
                }
                const line = this.poemLines[this.currentLineIndex] || '';
                const uniqueChars = [];
                const seen = {};
                for (const ch of line) if (!seen[ch]) { seen[ch] = true; uniqueChars.push(ch); }
                this.currentLineChars = uniqueChars;
                this.collectProgress = {};
                uniqueChars.forEach(ch => { this.collectProgress[ch] = 0; });
                this._prevCollectProgress = {};
                this.updateFreqLine();
                this.updateMovesLabel();

                const newGroups = progEl ? Array.from(progEl.querySelectorAll('.game25-char-group')) : [];
                newGroups.forEach(g => g.classList.add('stage-pre-appear'));
                newGroups.forEach((g, i) => setTimeout(() => {
                    g.classList.remove('stage-pre-appear');
                    g.classList.add('stage-appear');
                }, i * TILE_SHOW_GAP));
                setTimeout(next, newGroups.length * TILE_SHOW_GAP + 400);
            });
            // STAGE 6：生新盤面，全盤由上滑落
            stages.push((next) => {
                this.generateBoard();
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        const t = this.board[r][c];
                        if (!t) continue;
                        t._isNew = true;
                        t._spawnDelay = (this.rows - 1 - r) * ROW_LAND_GAP;
                    }
                }
                this.renderBoard(true);
                setTimeout(next, this.rows * ROW_LAND_GAP + 500);
            });
            // STAGE 7：恢復玩家操作
            stages.push(() => {
                this.isAnimating = false;
                this.scheduleHint();
            });

            const runner = (i) => { if (i >= stages.length) return; stages[i](() => runner(i + 1)); };
            runner(0);
        },

        // ── 死局重組：顯示「重組盤面，請稍待」橫幅 + 棋盤掃出/滑入動畫（抄襲 GAME24.reshuffleWithAnimation） ──
        reshuffleWithAnimation: function () {
            this.isAnimating = true;
            this.isDragging = false;
            this.dragStartChar = null;
            this.currentPath = [];
            this.clearHint();
            this.clearSameHints();
            this.clearPathHighlights();
            this.setPathPreview('');
            this.drawCurrentPath();
            this._cleanupStageRemnants();
            if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();

            const ROW_GAP = 60;
            const banner = document.getElementById('game25-chain-praise');
            if (banner) {
                banner.textContent = '重組盤面，請稍待';
                banner.className = 'game25-chain-praise stage-banner animate';
            }

            // STAGE 1：舊盤面逐列掃出
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const el = this.cellElements[r] && this.cellElements[r][c];
                    if (!el) continue;
                    el.style.setProperty('--g25-delay', ((this.rows - 1 - r) * ROW_GAP) + 'ms');
                    el.classList.add('sweep-out');
                }
            }
            const sweepTotal = this.rows * ROW_GAP + 550;

            setTimeout(() => {
                // 洗牌，最多 5 次直到出現可解盤面
                for (let i = 0; i < 5; i++) {
                    this.shuffleBoard();
                    if (this.hasPossiblePath()) break;
                }
                // STAGE 2：新盤面全盤由上滑落
                for (let r = 0; r < this.rows; r++) {
                    for (let c = 0; c < this.cols; c++) {
                        const t = this.board[r][c];
                        if (!t) continue;
                        t._isNew = true;
                        t._spawnDelay = (this.rows - 1 - r) * ROW_GAP;
                    }
                }
                this.renderBoard(true);
                const dropTotal = this.rows * ROW_GAP + 500;

                setTimeout(() => {
                    if (banner) banner.classList.add('hidden');
                    this.isAnimating = false;
                    const settings = this.difficultySettings[this.difficulty];
                    if (this.maxMoves > 0 && this.movesLeft <= 0 && !this.isLineComplete()) {
                        this.gameOver(false, '步數用盡');
                        return;
                    }
                    this.scheduleHint();
                }, dropTotal);
            }, sweepTotal);
        },

        // 過場前清除棋盤殘留 class 與 FX 層特效元素
        _cleanupStageRemnants: function () {
            const wrapper = document.getElementById('game25-grid-wrapper');
            if (wrapper) {
                wrapper.querySelectorAll(
                    '.game25-particle, .game25-soul, .game25-verse-bonus'
                ).forEach(n => n.remove());
            }
            if (this.cellElements) {
                this.cellElements.forEach(row => row.forEach(el => {
                    if (!el) return;
                    el.classList.remove('clearing', 'selected', 'start-selected', 'in-path', 'same-hint', 'spawn', 'fall', 'hint');
                    el.style.transform = '';
                    el.style.zIndex = '';
                }));
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

        // ── 進度顯示：當前句多卡橫排（抄襲 GAME24.updateLineDisplay 的字卡） ──
        // 每張卡 = 上方彩色字塊（與棋盤同色）+ 下方 X/Y；animateNewlyLit=true 時對新達標卡加 just-lit
        updateFreqLine: function (animateNewlyLit) {
            const line = document.getElementById('game25-freq-line');
            if (!line) return;
            const prevGot = this._prevCollectProgress || {};
            let html = '';
            this.currentLineChars.forEach(ch => {
                const target = this.collectTarget;
                const got = Math.min(target, this.collectProgress[ch] || 0);
                const prev = Math.min(target, prevGot[ch] || 0);
                const done = target > 0 && got >= target;
                const justDone = animateNewlyLit && done && prev < target;
                const col = this.getColorForChar(ch);
                html += `<span class="game25-char-group ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g25-h:${col.hue};--g25-s:${col.sat}%;--g25-l:${col.lum}%;--g25-text:${col.textColor}">`
                    + `<span class="game25-char-tile">${ch}</span>`
                    + `<span class="game25-char-count"><span class="game25-char-num">${got}</span>/<span class="game25-char-den">${target}</span></span>`
                    + `</span>`;
            });
            line.innerHTML = html;
            this._prevCollectProgress = Object.assign({}, this.collectProgress);
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
            const dirs8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const key = r + ',' + c;
                    if (visited[key]) continue;
                    const t = this.board[r][c];
                    if (!t || this.currentLineChars.indexOf(t.char) < 0) { visited[key] = true; continue; }
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
            this.stopIdleWatcher();
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
                    heartsSelector: '.game25-no-hearts',  // 本作無紅心列（改用步數紅白框）— 用永不命中的 selector 避免例外
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
