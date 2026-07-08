/* =========================================
   Game27《詩磚壘塔》(Verse-Brick Tower)
   ----------------------------------------
   花月版 A4 俄羅斯方塊 ── 源自 Tetris。
   6×N 垂直棋盤，含 2~4 漢字的磚塊持續下落，
   方向滑動操作（左/右移動、上旋轉、下加速）。
   磚塊落定後掃描全棋盤同字 3 連橫向/縱向消除，
   重力下落觸發連鎖；堆疊觸頂則失敗。
   ----------------------------------------
   依《花月開發常見錯誤與解法.md §4》規範：
   - class 全前綴 game27-
   - loadCSS() 動態防護（id=game27-css）
   - overlay 掛載 document.body 並套 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 完整支援關卡挑戰模式（callback 接 (selectedLevel, levelIndex)）
   - timeLimit = targetChars.length × timeLimitRate（作為總時限上限）
   - 詩透過 getSharedRandomPoem 抽取
   ========================================= */

(function () {
    const Game27 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // ── 詩詞與目標收集 ──
        currentPoem: null,
        poemLines: [],
        targetChars: [],          // 全詩字陣列（去標點），用於時限計算與加權生成
        currentLineIndex: 0,
        currentLineChars: [],     // 當前句去重後的目標字
        collectProgress: {},      // { 字: 已收集次數 }
        collectTarget: 1,         // 每字所需收集次數（每次消除 +1）

        // ── 棋盤 ──
        cols: 6,
        rows: 12,
        grid: [],                 // [row][col] = { char } 或 null

        // ── 當前下落磚塊 ──
        currentBrick: null,       // { shape: [[r,c],...], chars: [str,...], pivot:[r,c], r, c }
        nextBrick: null,
        afterNextBrick: null,

        // ── 節奏控制 ──
        fallInterval: 1000,       // 毫秒/格
        softDropInterval: 60,     // 速降時的間距
        fallTimer: 0,
        lastTickTime: 0,
        rafId: null,
        isSoftDropping: false,

        // ── 輸入控制 ──
        touchStartX: 0,
        touchStartY: 0,
        touchLastX: 0,
        touchLastY: 0,
        touchActive: false,
        SWIPE_TRIGGER: 40,        // 觸發單格水平移動的最小距離（px in canvas coords）

        // ── 動畫狀態 ──
        chainCount: 0,
        animLocked: false,        // 消除/重力動畫進行中時鎖定下落

        // ── 計時器（總時限） ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        // ── 委派給 window.TilePresentation：跨 game24~game30 統一的色相/配色實作 ──
        getHueForChar: function (ch) {
            return window.TilePresentation.getHueForChar(ch, this.currentLineChars);
        },
        getColorForChar: function (ch) {
            return window.TilePresentation.getColorForChar(ch, this.currentLineChars);
        },
        isTargetChar: function (ch) {
            return this.currentLineChars.indexOf(ch) >= 0;
        },

        // ── canvas ──
        canvasWidth: 312,         // 6 欄 × 52
        canvasHeight: 624,        // 12 列 × 52
        cellSize: 52,

        /*
         * 難度設定（依企劃書 §7）
         * fallInterval ：下落速度（毫秒/格）
         * poemMinRating：詩評下限
         * boardRows    ：棋盤列數
         * previewCount ：預覽格數（0/1/2）
         * decoyRatio   ：干擾字比例
         * wallKick     ：是否啟用壁踢容錯
         * timeLimitRate：每字時間倍率（作為總時限上限；0=不使用）
         */
        difficultySettings: {
            // ⚠️ decoyRatio 統一歸零：答案區所有字必須來自當前詩句（不再有詩外干擾字）
            '小學':   { fallInterval: 1000, poemMinRating: 6, boardRows: 10, previewCount: 2, decoyRatio: 0.0, wallKick: true,         timeLimitRate: 8, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 24 },
            '中學':   { fallInterval: 700,  poemMinRating: 5, boardRows: 11, previewCount: 2, decoyRatio: 0.0, wallKick: true,         timeLimitRate: 7, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 24 },
            '高中':   { fallInterval: 500,  poemMinRating: 4, boardRows: 12, previewCount: 2, decoyRatio: 0.0, wallKick: true,         timeLimitRate: 6, minLines: 2, maxLines: 4, minChars: 10, maxChars: 28 },
            '大學':   { fallInterval: 350,  poemMinRating: 3, boardRows: 12, previewCount: 1, decoyRatio: 0.0, wallKick: 'partial',    timeLimitRate: 5, minLines: 2, maxLines: 4, minChars: 10, maxChars: 28 },
            '研究所': { fallInterval: 200,  poemMinRating: 3, boardRows: 14, previewCount: 0, decoyRatio: 0.0, wallKick: false,        timeLimitRate: 4, minLines: 2, maxLines: 4, minChars: 10, maxChars: 28 }
        },

        // ── 磚塊形狀（類 Tetromino 7 種） ──
        // 每個形狀以「相對於 pivot (0,0) 的 (row, col) 偏移」表示
        brickShapes: [
            // I：橫向四連（落地後可旋轉為直立）
            { name: 'I', cells: [[0,-1],[0,0],[0,1],[0,2]], size: 4 },
            // O：2×2
            { name: 'O', cells: [[0,0],[0,1],[1,0],[1,1]], size: 4 },
            // T
            { name: 'T', cells: [[0,-1],[0,0],[0,1],[1,0]], size: 4 },
            // L
            { name: 'L', cells: [[0,-1],[0,0],[0,1],[1,-1]], size: 4 },
            // J
            { name: 'J', cells: [[0,-1],[0,0],[0,1],[1,1]], size: 4 },
            // S
            { name: 'S', cells: [[0,0],[0,1],[1,-1],[1,0]], size: 4 },
            // Z
            { name: 'Z', cells: [[0,-1],[0,0],[1,0],[1,1]], size: 4 },
            // 小三連（2~3 字版本，較易處理）
            { name: 'i3', cells: [[0,0],[0,1],[0,2]], size: 3 },
            // 雙字（最小磚）
            { name: 'd2', cells: [[0,0],[0,1]], size: 2 }
        ],

        // ── CSS 載入防護 ──
        loadCSS: function () {
            if (!document.getElementById('game27-css')) {
                const link = document.createElement('link');
                link.id = 'game27-css';
                link.rel = 'stylesheet';
                link.href = 'game27.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game27-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game27-container');
        },

        // 建立 overlay DOM（掛 document.body）
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game27-container';
            div.className = 'game27-overlay hidden';
            div.innerHTML = `
                <div class="game27-header">
                    <div class="game27-score-board">分數: <span id="game27-score">0</span></div>
                    <div class="game27-controls">
                        <button class="game27-difficulty-tag" id="game27-diff-tag">小學</button>
                        <button id="game27-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game27-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game27-sub-header">
                    <div id="game27-moves-label" class="game27-moves-label" style="display:none">盤面:<span id="game27-stage-text">1/1</span> 步數:<span id="game27-moves">0</span>/<span id="game27-max-moves">0</span></div>
                    <div id="game27-poem-info" class="poem-info"></div>
                </div>
                <div class="game27-info-bar">
                    <div id="game27-line-text" class="game27-line-text" style="display:none"></div>
                    <div id="game27-progress-text" class="game27-progress-text"></div>
                    <div id="game27-collect-bar" class="game27-collect-bar"></div>
                </div>
                <div class="game27-area">
                    <div class="game27-info"></div>
                    <div class="game27-play-area">
                        <div id="game27-board-wrapper" class="game27-board-wrapper">
                            <svg id="game27-timer-ring">
                                <rect id="game27-timer-path" x="3" y="3"></rect>
                            </svg>
                            <canvas id="game27-canvas" width="312" height="624"></canvas>
                        </div>
                        <div class="game27-side-panel">
                            <div id="game27-next-box" class="game27-preview-box">
                                <div class="preview-label">下一塊</div>
                                <div id="game27-next-grid" class="game27-preview-grid"></div>
                            </div>
                            <div id="game27-after-box" class="game27-preview-box">
                                <div class="preview-label">下下塊</div>
                                <div id="game27-after-grid" class="game27-preview-grid"></div>
                            </div>
                        </div>
                    </div>
                    <div class="game27-hint-bar">← → 左右移動 ↑ 旋轉 ↓ 速降</div>
                </div>
            `;
            document.body.appendChild(div);

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

            // 按鈕綁定
            document.getElementById('game27-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game27-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game27-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // ── 輸入：canvas swipe（觸控 + 滑鼠） ──
            const canvas = document.getElementById('game27-canvas');
            canvas.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
            canvas.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
            canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
            canvas.addEventListener('mousedown', this.onTouchStart.bind(this));
            window.addEventListener('mousemove', this.onTouchMove.bind(this));
            window.addEventListener('mouseup', this.onTouchEnd.bind(this));

            // 鍵盤：方便桌機測試
            window.addEventListener('keydown', this.onKeyDown.bind(this));
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container',
                'game4-container', 'game5-container', 'game6-container', 'game7-container',
                'game8-container', 'game9-container', 'game10-container', 'game11-container',
                'game12-container', 'game13-container', 'game14-container', 'game15-container',
                'game16-container', 'game17-container', 'game18-container', 'game19-container',
                'game20-container', 'game21-container', 'game22-container', 'game23-container',
                'game24-container', 'game25-container', 'game26-container'];
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
            this.stopRAF();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩磚壘塔', (selectedLevel, levelIndex) => {
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

        updateUIForMode: function () {
            const diffTag = document.getElementById('game27-diff-tag');
            const retryBtn = document.getElementById('game27-retryGame-btn');
            const newBtn = document.getElementById('game27-newGame-btn');
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

        hide: function () { this.stopGame(); },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，必須隱藏 container
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopRAF();
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

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

        // 抽詩（共用 getSharedRandomPoem，種子=挑戰關卡時帶入 levelIndex）
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
                'game27'
            );
            if (!result) return false;
            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.targetChars = this.poemLines.join('').split('');

            const poemInfo = document.getElementById('game27-poem-info');
            const fullName = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            poemInfo.textContent = fullName.length > 16 ? (fullName.slice(0, 15) + '…') : fullName;
            poemInfo.title = fullName;
            poemInfo.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.currentLineIndex = 0;
            this.chainCount = 0;
            this.animLocked = false;
            this.isSoftDropping = false;

            const settings = this.difficultySettings[this.difficulty];
            this.rows = settings.boardRows;
            this.fallInterval = settings.fallInterval;

            // 動態計算 cellSize：盤面高 624px 容納 rows 列、寬 312px 容納 6 欄
            this.cellSize = Math.min(Math.floor(312 / this.cols), Math.floor(624 / this.rows));
            this.canvasWidth = this.cellSize * this.cols;
            this.canvasHeight = this.cellSize * this.rows;
            const canvas = document.getElementById('game27-canvas');
            canvas.width = this.canvasWidth;
            canvas.height = this.canvasHeight;
            // wrapper 比例調整
            const wrapper = document.getElementById('game27-board-wrapper');
            wrapper.style.width = this.canvasWidth + 'px';
            wrapper.style.height = this.canvasHeight + 'px';

            // 初始化棋盤
            this.grid = [];
            for (let r = 0; r < this.rows; r++) {
                this.grid.push(new Array(this.cols).fill(null));
            }

            document.getElementById('game27-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            document.getElementById('game27-retryGame-btn').disabled = false;
            document.getElementById('game27-newGame-btn').disabled = false;

            // 時限（依規範必須在抽詩之後用 targetChars.length 計算）
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game27-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                this.maxTimer = 0;
                document.getElementById('game27-timer-ring').style.display = 'none';
                clearInterval(this.timerInterval);
            }

            // 啟動當前句、磚塊序列
            this.startCurrentLine();
            this.startRAF();
        },

        // ── 進入當前句的收集 ──
        startCurrentLine: function () {
            const line = this.poemLines[this.currentLineIndex] || '';
            const uniqueChars = [];
            const seen = {};
            for (const ch of line) {
                if (!seen[ch]) { seen[ch] = true; uniqueChars.push(ch); }
            }
            this.currentLineChars = uniqueChars;
            this.collectProgress = {};
            uniqueChars.forEach(ch => { this.collectProgress[ch] = 0; });
            this.collectTarget = 1; // 每字僅需消除 1 組 3 連即計 1 次

            this.updateProgressDisplay();

            // 初始磚塊序列：當前、下一、下下
            this.currentBrick = this.spawnBrick();
            this.nextBrick = this.generateBrick();
            this.afterNextBrick = this.generateBrick();
            this.updatePreview();

            this.lastTickTime = performance.now();
            this.fallTimer = 0;
        },

        // ── 進度顯示：多卡橫排（仿 game24） ──
        //   每張卡 = 上方彩色字塊（與磚塊同色 HUE）+ 下方 X/Y 計數
        //   達標卡片整體變金色 + 金光脈動；剛達標套 just-lit 彈跳
        //   字魂 spawnSoul 終點 = .game27-char-group[data-char="X"]
        updateProgressDisplay: function (animateNewlyLit) {
            const txt = document.getElementById('game27-progress-text');
            const line = this.poemLines[this.currentLineIndex] || '';
            txt.innerHTML = `〈第 ${this.currentLineIndex + 1}/${this.poemLines.length} 句〉<span style="color:hsl(45,80%,75%); letter-spacing:4px; margin-left:6px;">${line}</span>`;

            const bar = document.getElementById('game27-collect-bar');
            const prevGot = this._prevCollectSnap || {};
            let html = '';
            this.currentLineChars.forEach(ch => {
                const got = Math.min(this.collectTarget, this.collectProgress[ch] || 0);
                const prev = Math.min(this.collectTarget, prevGot[ch] || 0);
                const done = got >= this.collectTarget;
                const justDone = animateNewlyLit && done && prev < this.collectTarget;
                // ⚠️ 使用共用 TilePresentation 取得完整分組配色（同 game24 頂端字塊）
                const c = this.getColorForChar(ch) || { hue: this.getHueForChar(ch), sat: 60, lum: 75, textColor: 'hsl(220, 30%, 14%)' };
                html += `<span class="game27-char-group ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g27-h:${c.hue};--g27-s:${c.sat}%;--g27-l:${c.lum}%;--g27-text:${c.textColor}">`
                    + `<span class="game27-char-tile">${ch}</span>`
                    + `<span class="game27-char-count"><span class="game27-char-num">${got}</span>/<span class="game27-char-den">${this.collectTarget}</span></span>`
                    + `</span>`;
            });
            bar.innerHTML = html;
            this._prevCollectSnap = Object.assign({}, this.collectProgress);
        },

        // ── 磚塊產生：依形狀庫隨機抽選並填入加權字 ──
        generateBrick: function () {
            // 隨機選一個形狀（小學/中學偏向小磚塊較易上手；簡化為均勻隨機）
            const shape = this.brickShapes[Math.floor(Math.random() * this.brickShapes.length)];
            const cells = shape.cells.map(c => [c[0], c[1]]);
            const chars = cells.map(() => this.pickBrickChar());
            return {
                shapeName: shape.name,
                cells: cells,        // 相對偏移 [row, col]
                chars: chars,        // 與 cells 同 index
                r: 0,                // 出生點 row（落點為 grid 的列）
                c: Math.floor(this.cols / 2) // 出生點 col（pivot）
            };
        },

        // 將下一塊轉為「即將下落」狀態，並把 r 設為 0（出生點）
        spawnBrick: function () {
            let brick;
            if (this.nextBrick) {
                brick = this.nextBrick;
                this.nextBrick = this.afterNextBrick || this.generateBrick();
                this.afterNextBrick = this.generateBrick();
            } else {
                brick = this.generateBrick();
            }
            brick.r = 0;
            brick.c = Math.floor(this.cols / 2);
            // 確保出生不直接與堆疊衝突
            if (this.collidesAt(brick, brick.r, brick.c, brick.cells)) {
                // 若一出生就重疊，視為觸頂失敗
                this.handleGameOver(false, '堆疊觸頂！');
                return brick;
            }
            this.updatePreview();
            return brick;
        },

        // 加權字塊：缺口字 70% / 全詩其他字 20% / 干擾字 10%
        pickBrickChar: function () {
            const settings = this.difficultySettings[this.difficulty];
            const useDecoy = Math.random() < settings.decoyRatio * 0.5;  // 干擾字機率（受 decoyRatio 控）
            if (useDecoy) {
                // 干擾字：取其他句字（簡化做法）
                const others = [];
                this.poemLines.forEach((ln, i) => {
                    if (i !== this.currentLineIndex) {
                        for (const ch of ln) others.push(ch);
                    }
                });
                if (others.length > 0) return others[Math.floor(Math.random() * others.length)];
            }
            const r = Math.random();
            const deficits = this.currentLineChars.filter(ch => (this.collectProgress[ch] || 0) < this.collectTarget);
            if (r < 0.7 && deficits.length > 0) {
                return deficits[Math.floor(Math.random() * deficits.length)];
            } else if (r < 0.9 && this.targetChars.length > 0) {
                return this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
            }
            if (this.currentLineChars.length > 0) {
                return this.currentLineChars[Math.floor(Math.random() * this.currentLineChars.length)];
            }
            return '詩';
        },

        // ── 碰撞檢測 ──
        // 給定磚塊參考、嘗試 (r, c) 位置與 cells 偏移，回傳是否衝突（出界或撞堆疊）
        collidesAt: function (brick, r, c, cells) {
            for (const [dr, dc] of cells) {
                const rr = r + dr;
                const cc = c + dc;
                if (rr < 0) continue;                    // 上方出界視為合法（剛出生時磚塊可能有負 row）
                if (rr >= this.rows) return true;
                if (cc < 0 || cc >= this.cols) return true;
                if (this.grid[rr][cc] !== null) return true;
            }
            return false;
        },

        // ── 順時針旋轉 90°（含 wall-kick） ──
        // (r, c) → (c, -r)；對所有 cells 套用
        rotateBrickCW: function (brick) {
            const settings = this.difficultySettings[this.difficulty];
            if (settings.wallKick === false) {
                // 無壁踢：直接嘗試原位旋轉，失敗即返回
                const newCells = brick.cells.map(([r, c]) => [c, -r]);
                if (!this.collidesAt(brick, brick.r, brick.c, newCells)) {
                    brick.cells = newCells;
                    if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
                }
                return;
            }
            const newCells = brick.cells.map(([r, c]) => [c, -r]);
            const tries = (settings.wallKick === 'partial')
                ? [[0, 0], [0, -1], [0, 1]]
                : [[0, 0], [0, -1], [0, 1], [0, -2], [0, 2], [-1, 0]];
            for (const [dr, dc] of tries) {
                if (!this.collidesAt(brick, brick.r + dr, brick.c + dc, newCells)) {
                    brick.cells = newCells;
                    brick.r += dr;
                    brick.c += dc;
                    if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
                    return;
                }
            }
            // 旋轉失敗（壁踢全失敗）：靜默；研究所無壁踢時更為殘酷
            if (window.SoundManager && window.SoundManager.playFailure) {/* 不發音以免吵 */}
        },

        // ── 水平移動 ──
        moveBrick: function (deltaCol) {
            if (!this.currentBrick || this.animLocked) return;
            const b = this.currentBrick;
            const step = deltaCol > 0 ? 1 : -1;
            const n = Math.abs(deltaCol);
            for (let i = 0; i < n; i++) {
                if (this.collidesAt(b, b.r, b.c + step, b.cells)) break;
                b.c += step;
            }
        },

        // ── 速降：每幀往下一格直到落地 ──
        hardDropOneStep: function () {
            if (!this.currentBrick || this.animLocked) return false;
            const b = this.currentBrick;
            if (!this.collidesAt(b, b.r + 1, b.c, b.cells)) {
                b.r++;
                return true;
            }
            // 落定
            this.lockBrick();
            return false;
        },

        // ── 鎖定磚塊到棋盤、檢查消除、連鎖 ──
        lockBrick: function () {
            const b = this.currentBrick;
            if (!b) return;
            for (let i = 0; i < b.cells.length; i++) {
                const [dr, dc] = b.cells[i];
                const rr = b.r + dr;
                const cc = b.c + dc;
                if (rr < 0) {
                    // 出生時就有格子留在棋盤外上方 → 觸頂失敗
                    this.handleGameOver(false, '堆疊觸頂！');
                    return;
                }
                if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) {
                    this.grid[rr][cc] = { char: b.chars[i] };
                }
            }
            if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
            this.currentBrick = null;
            this.animLocked = true;
            this.chainCount = 0;

            // 進入消除/連鎖流程
            this.processClearAndChain(() => {
                this.animLocked = false;
                // 若當前句已收集完成 → 推進句子
                if (this.checkLineComplete()) {
                    this.advanceLine();
                    return;
                }
                // 否則生新磚塊
                this.currentBrick = this.spawnBrick();
            });
        },

        // ── 消除掃描：橫向 + 縱向，相鄰 3+ 同字 ──
        scanSameCharLines: function () {
            const toClear = [];
            const mark = new Set();
            const key = (r, c) => `${r},${c}`;

            // 橫向掃描
            for (let r = 0; r < this.rows; r++) {
                let runStart = 0;
                while (runStart < this.cols) {
                    if (this.grid[r][runStart] === null) { runStart++; continue; }
                    const ch = this.grid[r][runStart].char;
                    let runEnd = runStart + 1;
                    while (runEnd < this.cols && this.grid[r][runEnd] && this.grid[r][runEnd].char === ch) {
                        runEnd++;
                    }
                    if (runEnd - runStart >= 3) {
                        for (let cc = runStart; cc < runEnd; cc++) {
                            if (!mark.has(key(r, cc))) {
                                mark.add(key(r, cc));
                                toClear.push({ r, c: cc, char: ch });
                            }
                        }
                    }
                    runStart = runEnd;
                }
            }
            // 縱向掃描
            for (let c = 0; c < this.cols; c++) {
                let runStart = 0;
                while (runStart < this.rows) {
                    if (this.grid[runStart][c] === null) { runStart++; continue; }
                    const ch = this.grid[runStart][c].char;
                    let runEnd = runStart + 1;
                    while (runEnd < this.rows && this.grid[runEnd][c] && this.grid[runEnd][c].char === ch) {
                        runEnd++;
                    }
                    if (runEnd - runStart >= 3) {
                        for (let rr = runStart; rr < runEnd; rr++) {
                            if (!mark.has(key(rr, c))) {
                                mark.add(key(rr, c));
                                toClear.push({ r: rr, c: c, char: ch });
                            }
                        }
                    }
                    runStart = runEnd;
                }
            }
            return toClear;
        },

        // 重力下落（消除後）
        applyGravity: function () {
            for (let c = 0; c < this.cols; c++) {
                let writeR = this.rows - 1;
                for (let r = this.rows - 1; r >= 0; r--) {
                    if (this.grid[r][c] !== null) {
                        if (writeR !== r) {
                            this.grid[writeR][c] = this.grid[r][c];
                            this.grid[r][c] = null;
                        }
                        writeR--;
                    }
                }
            }
        },

        // 連鎖處理：scan → 消除 → 加分/收集 → gravity → 再 scan，直到無消除
        processClearAndChain: function (onDone) {
            const step = () => {
                const toClear = this.scanSameCharLines();
                if (toClear.length === 0) {
                    if (onDone) onDone();
                    return;
                }
                this.chainCount++;

                // 收集字頻：每組同字消除每群 +1
                const clearedCharCount = {};
                toClear.forEach(o => { clearedCharCount[o.char] = (clearedCharCount[o.char] || 0) + 1; });
                for (const ch in clearedCharCount) {
                    if (this.currentLineChars.indexOf(ch) >= 0) {
                        // ⚠️ 每字每次消除只算 1 次
                        this.collectProgress[ch] = (this.collectProgress[ch] || 0)
                            + window.EliminateScore.getCollectTimes();
                    }
                }

                // ⚠️ 計分：對每種被消除字以 (2N−5) 分別加分，再乘連鎖倍率
                const base = this.getPointA();
                const multiplier = Math.min(this.chainCount, 5);
                let pts = 0;
                for (const ch in clearedCharCount) {
                    pts += window.EliminateScore.getMatchScore(clearedCharCount[ch], base, multiplier);
                }
                this.score += pts;
                document.getElementById('game27-score').textContent = this.score;

                // 連鎖視覺
                if (this.chainCount >= 2) this.showChainPopup(this.chainCount);
                if (window.SoundManager && window.SoundManager.playSuccess && toClear.length >= 5) {
                    window.SoundManager.playSuccess();
                } else if (window.SoundManager && window.SoundManager.playSuccessShort) {
                    window.SoundManager.playSuccessShort();
                }

                // 動畫先閃 0.25s 再清除 + 下落；同步噴出同色粒子 + 字魂飛入進度卡
                this.render(toClear);
                const S = this.cellSize;
                toClear.forEach(({ r, c, char }) => {
                    const cx = c * S + S / 2;
                    const cy = r * S + S / 2;
                    const hue = this.getHueForChar(char);
                    this.spawnParticles(cx, cy, 6, hue);
                    if (char && this.isTargetChar(char)) this.spawnSoul(cx, cy, char);
                });
                setTimeout(() => {
                    toClear.forEach(({ r, c }) => { this.grid[r][c] = null; });
                    this.applyGravity();
                    this.updateProgressDisplay(true); // animateNewlyLit
                    this.render();
                    setTimeout(step, 120);
                }, 350);
            };
            step();
        },

        // 連鎖倍率彈出
        showChainPopup: function (n) {
            const wrap = document.getElementById('game27-board-wrapper');
            if (!wrap) return;
            const div = document.createElement('div');
            div.className = 'game27-chain-popup';
            div.textContent = `${n} 連鎖！`;
            wrap.appendChild(div);
            setTimeout(() => { if (div.parentNode) div.parentNode.removeChild(div); }, 800);
        },

        // 當前句是否全部收集完成
        checkLineComplete: function () {
            for (const ch of this.currentLineChars) {
                if ((this.collectProgress[ch] || 0) < this.collectTarget) return false;
            }
            return true;
        },

        // ── FX 輔助 ──
        // canvas 內部固定 312×624 座標 → wrapper 本地未縮放座標
        // 修正舞台 transform: scale + canvas DOM scale 雙重套用造成的偏移
        canvasToWrapperCoords: function (cx, cy) {
            const canvas = document.getElementById('game27-canvas');
            const wrapper = document.getElementById('game27-board-wrapper');
            if (!canvas || !wrapper) return { x: 0, y: 0 };
            const cRect = canvas.getBoundingClientRect();
            const wRect = wrapper.getBoundingClientRect();
            const scale = window.stageScale || 1;
            const cw = cRect.width / scale;
            const ch = cRect.height / scale;
            const ratioX = cw / this.canvasWidth;
            const ratioY = ch / this.canvasHeight;
            const offX = (cRect.left - wRect.left) / scale;
            const offY = (cRect.top - wRect.top) / scale;
            return { x: offX + cx * ratioX, y: offY + cy * ratioY };
        },

        // 同色系粒子：消除字塊時噴灑
        spawnParticles: function (cx, cy, count, hue) {
            const wrapper = document.getElementById('game27-board-wrapper');
            if (!wrapper) return;
            const c = this.canvasToWrapperCoords(cx, cy);
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game27-particle';
                const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
                const dist = 32 + Math.random() * 36;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist - 8;
                p.style.left = c.x + 'px';
                p.style.top = c.y + 'px';
                p.style.setProperty('--g27-dx', dx + 'px');
                p.style.setProperty('--g27-dy', dy + 'px');
                if (typeof hue === 'number') p.style.setProperty('--g27-ph', hue);
                const scl = 0.8 + Math.random() * 0.6;
                p.style.width = (8 * scl) + 'px';
                p.style.height = (8 * scl) + 'px';
                wrapper.appendChild(p);
                setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
            }
        },

        // 字魂：消除字塊飛入頂端對應進度卡
        spawnSoul: function (cx, cy, ch) {
            const wrapper = document.getElementById('game27-board-wrapper');
            if (!wrapper) return;
            const start = this.canvasToWrapperCoords(cx, cy);
            const groupEl = document.querySelector(`.game27-char-group[data-char="${ch}"]`);
            let endX, endY;
            if (groupEl) {
                const gr = groupEl.getBoundingClientRect();
                const wr = wrapper.getBoundingClientRect();
                const scale = window.stageScale || 1;
                endX = ((gr.left - wr.left) + gr.width / 2) / scale;
                endY = ((gr.top - wr.top) + gr.height / 2) / scale;
            } else { endX = start.x; endY = -20; }
            const soul = document.createElement('div');
            soul.className = 'game27-soul';
            soul.textContent = ch;
            soul.style.left = start.x + 'px';
            soul.style.top = start.y + 'px';
            wrapper.appendChild(soul);
            requestAnimationFrame(() => {
                soul.style.opacity = '0.95';
                soul.style.transform = 'translate(-50%, -50%) scale(1.2)';
                soul.style.transition = 'top 0.2s ease-out, opacity 0.15s ease, transform 0.2s ease';
                soul.style.top = (start.y - 24) + 'px';
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

        // 過關動畫：進度卡逐一發金光 → 呼叫 handleGameOver(true) → ScoreManager → MessageBox
        playWinSequence: function () {
            const cards = Array.from(document.querySelectorAll('#game27-collect-bar .game27-char-group'));
            const GAP = 180;
            cards.forEach((g, i) => setTimeout(() => g.classList.add('stage-flash'), i * GAP));
            const total = cards.length * GAP + 500;
            setTimeout(() => this.handleGameOver(true, ''), total);
        },

        advanceLine: function () {
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
            this.currentLineIndex++;
            if (this.currentLineIndex >= this.poemLines.length) {
                // 最後一句完成 → 走過關動畫（進度卡逐一發光 → ScoreManager → MessageBox）
                this.playWinSequence();
                return;
            }
            // 進下一句：清空棋盤上半部、保留下半，並重置目標
            setTimeout(() => {
                if (!this.isActive) return;
                this.startCurrentLine();
            }, 500);
        },

        // 取分基數
        getPointA: function () {
            return (window.ScoreManager && window.ScoreManager.gameSettings && window.ScoreManager.gameSettings.game27)
                ? window.ScoreManager.gameSettings.game27.getPointA : 25;
        },

        // ── RAF 主迴圈：下落節奏 ──
        startRAF: function () {
            this.stopRAF();
            this.lastTickTime = performance.now();
            const loop = (now) => {
                if (!this.isActive) return;
                const dt = now - this.lastTickTime;
                this.lastTickTime = now;
                this.tick(dt);
                this.render();
                this.rafId = requestAnimationFrame(loop);
            };
            this.rafId = requestAnimationFrame(loop);
        },

        stopRAF: function () {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
        },

        tick: function (dt) {
            if (this.animLocked || !this.currentBrick) return;
            this.fallTimer += dt;
            const interval = this.isSoftDropping ? this.softDropInterval : this.fallInterval;
            while (this.fallTimer >= interval) {
                this.fallTimer -= interval;
                if (!this.hardDropOneStep()) break;
            }
        },

        // ── 渲染 canvas ──
        render: function (highlightCells) {
            const canvas = document.getElementById('game27-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const W = this.canvasWidth, H = this.canvasHeight, S = this.cellSize;
            ctx.clearRect(0, 0, W, H);

            // 棋盤背景格線
            ctx.strokeStyle = 'hsla(40, 30%, 25%, 0.25)';
            ctx.lineWidth = 1;
            for (let r = 0; r <= this.rows; r++) {
                ctx.beginPath();
                ctx.moveTo(0, r * S);
                ctx.lineTo(W, r * S);
                ctx.stroke();
            }
            for (let c = 0; c <= this.cols; c++) {
                ctx.beginPath();
                ctx.moveTo(c * S, 0);
                ctx.lineTo(c * S, H);
                ctx.stroke();
            }

            // 觸頂警示：上方 2 列有堆疊則顯示紅框
            let nearTop = false;
            for (let c = 0; c < this.cols; c++) {
                if (this.grid[1] && this.grid[1][c] !== null) { nearTop = true; break; }
            }
            const wrap = document.getElementById('game27-board-wrapper');
            if (nearTop) wrap.classList.add('warning');
            else wrap.classList.remove('warning');

            // 已堆疊磚塊
            const highlightSet = new Set();
            if (highlightCells) highlightCells.forEach(o => highlightSet.add(`${o.r},${o.c}`));
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cell = this.grid[r][c];
                    if (!cell) continue;
                    const isHighlight = highlightSet.has(`${r},${c}`);
                    this.drawCell(ctx, r, c, cell.char, isHighlight ? 'clearing' : 'stacked');
                }
            }

            // 落下中的當前磚塊
            if (this.currentBrick && !this.animLocked) {
                const b = this.currentBrick;
                for (let i = 0; i < b.cells.length; i++) {
                    const [dr, dc] = b.cells[i];
                    const rr = b.r + dr;
                    const cc = b.c + dc;
                    if (rr < 0 || rr >= this.rows || cc < 0 || cc >= this.cols) continue;
                    this.drawCell(ctx, rr, cc, b.chars[i], 'falling');
                }
            }
        },

        // 繪製單一格子：同字必同色（HUE 依字在 currentLineChars 等分 360°）
        //   state = 'stacked' | 'falling' | 'clearing'
        //   目標字：彩度 60% / 亮度 75% + 漸層立體 + 高光
        //   干擾字：彩度 12% / 灰調 → 視覺退後
        //   'falling' 略亮、'clearing' 全白閃光（消除瞬間）
        drawCell: function (ctx, r, c, ch, state) {
            const S = this.cellSize;
            const x = c * S, y = r * S;
            const isTarget = this.isTargetChar(ch);
            const hue = this.getHueForChar(ch);
            // 狀態調整
            let sat = isTarget ? 60 : 12;
            let baseL = isTarget ? 72 : 60;
            if (state === 'falling') baseL = Math.min(88, baseL + 8);
            // 漸層底（135° 對角光）
            if (state === 'clearing') {
                // 消除瞬間：金白閃光
                ctx.fillStyle = 'hsl(50, 100%, 78%)';
                ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
            } else {
                const grad = ctx.createLinearGradient(x + 1, y + 1, x + S - 1, y + S - 1);
                grad.addColorStop(0, `hsl(${hue}, ${sat}%, ${Math.min(95, baseL + 12)}%)`);
                grad.addColorStop(0.5, `hsl(${hue}, ${sat}%, ${baseL}%)`);
                grad.addColorStop(1, `hsl(${hue}, ${sat}%, ${Math.max(25, baseL - 18)}%)`);
                ctx.fillStyle = grad;
                ctx.fillRect(x + 1, y + 1, S - 2, S - 2);
            }
            // 上方白色高光（左上 ~30%）
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.35)';
            ctx.fillRect(x + 2, y + 2, S - 4, Math.floor(S * 0.22));
            // 邊框：用同色相深色，描繪磚塊邊緣
            ctx.strokeStyle = state === 'clearing'
                ? 'hsl(45, 100%, 50%)'
                : `hsla(${hue}, ${Math.max(40, sat)}%, 25%, 0.7)`;
            ctx.lineWidth = state === 'clearing' ? 2 : 1.5;
            ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
            // 字（line-height 修正：y 微下偏 0.03S 補中文基線視覺）
            ctx.fillStyle = isTarget ? 'hsl(220, 30%, 14%)' : 'hsl(220, 18%, 28%)';
            const fontSize = Math.floor(S * 0.6);
            ctx.font = `900 ${fontSize}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch || '', x + S / 2, y + S / 2 + S * 0.03);
        },

        // ── 預覽：將下一塊、下下塊畫進 4×4 mini grid ──
        updatePreview: function () {
            const settings = this.difficultySettings[this.difficulty];
            const nextBox = document.getElementById('game27-next-box');
            const afterBox = document.getElementById('game27-after-box');
            if (settings.previewCount >= 1) {
                nextBox.style.display = '';
                this.renderPreviewGrid('game27-next-grid', this.nextBrick);
            } else {
                nextBox.style.display = 'none';
            }
            if (settings.previewCount >= 2) {
                afterBox.style.display = '';
                this.renderPreviewGrid('game27-after-grid', this.afterNextBrick);
            } else {
                afterBox.style.display = 'none';
            }
        },

        renderPreviewGrid: function (containerId, brick) {
            const el = document.getElementById(containerId);
            if (!el || !brick) return;
            el.innerHTML = '';
            // 計算 cells bounding box，置中於 4×4
            let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
            brick.cells.forEach(([r, c]) => {
                if (r < minR) minR = r; if (r > maxR) maxR = r;
                if (c < minC) minC = c; if (c > maxC) maxC = c;
            });
            const offR = Math.floor((4 - (maxR - minR + 1)) / 2) - minR;
            const offC = Math.floor((4 - (maxC - minC + 1)) / 2) - minC;
            const charMap = {};
            brick.cells.forEach(([r, c], i) => { charMap[`${r + offR},${c + offC}`] = brick.chars[i]; });
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    const div = document.createElement('div');
                    div.className = 'game27-preview-cell';
                    const ch = charMap[`${r},${c}`];
                    if (ch) {
                        div.classList.add('filled');
                        div.textContent = ch;
                    }
                    el.appendChild(div);
                }
            }
        },

        // ── 輸入：手勢 swipe ──
        getCanvasPoint: function (e) {
            const canvas = document.getElementById('game27-canvas');
            const rect = canvas.getBoundingClientRect();
            let cx, cy;
            if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
            else { cx = e.clientX; cy = e.clientY; }
            const scaleX = this.canvasWidth / rect.width;
            const scaleY = this.canvasHeight / rect.height;
            return { x: (cx - rect.left) * scaleX, y: (cy - rect.top) * scaleY };
        },

        onTouchStart: function (e) {
            if (!this.isActive) return;
            if (e.cancelable) e.preventDefault();
            const p = this.getCanvasPoint(e);
            this.touchStartX = p.x; this.touchStartY = p.y;
            this.touchLastX = p.x; this.touchLastY = p.y;
            this.touchActive = true;
            this.isSoftDropping = false;
        },

        onTouchMove: function (e) {
            if (!this.touchActive || !this.isActive) return;
            if (e.cancelable) e.preventDefault();
            const p = this.getCanvasPoint(e);
            const dx = p.x - this.touchLastX;
            const dy = p.y - this.touchLastY;
            // 水平離散移動：每 SWIPE_TRIGGER 個 canvas px 移一格
            if (Math.abs(dx) >= this.SWIPE_TRIGGER && Math.abs(dx) >= Math.abs(dy)) {
                const cells = Math.trunc(dx / this.SWIPE_TRIGGER);
                if (cells !== 0) {
                    this.moveBrick(cells);
                    this.touchLastX = p.x;
                }
            }
            // 下滑：啟動速降（持續至放開）
            if (dy - (this.touchStartY - this.touchStartY) > this.SWIPE_TRIGGER && Math.abs(dy) > Math.abs(dx)) {
                if ((p.y - this.touchStartY) > this.SWIPE_TRIGGER) {
                    this.isSoftDropping = true;
                }
            }
        },

        onTouchEnd: function (e) {
            if (!this.touchActive || !this.isActive) { this.touchActive = false; return; }
            this.touchActive = false;
            this.isSoftDropping = false;
            const p = this.getCanvasPoint(e);
            const totalDx = p.x - this.touchStartX;
            const totalDy = p.y - this.touchStartY;
            const absDx = Math.abs(totalDx), absDy = Math.abs(totalDy);
            // 若移動總距離很短，視為點擊 → 不動作
            if (absDx < this.SWIPE_TRIGGER && absDy < this.SWIPE_TRIGGER) return;
            // 上滑（總位移為主）= 旋轉
            if (absDy >= this.SWIPE_TRIGGER && absDy > absDx && totalDy < 0) {
                if (this.currentBrick && !this.animLocked) this.rotateBrickCW(this.currentBrick);
            }
        },

        onKeyDown: function (e) {
            if (!this.isActive) return;
            if (this.animLocked || !this.currentBrick) return;
            switch (e.key) {
                case 'ArrowLeft':  e.preventDefault(); this.moveBrick(-1); break;
                case 'ArrowRight': e.preventDefault(); this.moveBrick(1);  break;
                case 'ArrowUp':    e.preventDefault(); this.rotateBrickCW(this.currentBrick); break;
                case 'ArrowDown':  e.preventDefault(); this.hardDropOneStep(); break;
            }
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
                    this.handleGameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game27-timer-path');
            const wrapper = document.getElementById('game27-board-wrapper');
            const svg = document.getElementById('game27-timer-ring');
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
                const el = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * el)}%, ${Math.round(22 + 32 * el)}%)`;
            }
        },

        // ── 遊戲結束 ──
        handleGameOver: function (win, reason) {
            if (!this.isActive) return;
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);
            this.stopRAF();

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 27,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game27-retryGame-btn').disabled = true;
                document.getElementById('game27-newGame-btn').disabled = true;
            } else {
                document.getElementById('game27-retryGame-btn').disabled = false;
                document.getElementById('game27-newGame-btn').disabled = false;
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '塔已壘崩！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game27', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game27', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game27',
                    timerContainerId: 'game27-board-wrapper',
                    scoreElementId: 'game27-score',
                    heartsSelector: '.game27-no-hearts',  // 本作無紅心 — 永不命中但語法合法，避免 querySelectorAll('') 拋例外
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

    window.Game27 = Game27;

    // ?game=27 自動啟動（支援挑戰關卡直連）
    if (new URLSearchParams(window.location.search).get('game') === '27') {
        setTimeout(() => {
            if (window.Game27) window.Game27.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
