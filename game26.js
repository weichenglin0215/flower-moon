/* =========================================
   Game26《投珠破句》(Shoot-Verse Bubbles)
   ----------------------------------------
   花月版 A3 泡泡龍版 ── 源自 Bubble Shooter / Puzzle Bobble。
   玩家自畫面下方發射台朝上方漢字泡泡牆射出字泡泡，
   命中相同字 3 顆以上即整組消除並收集對應字頻；
   泡泡牆每隔 N 秒整體下推一格，觸及壓力線即失敗。
   ----------------------------------------
   依《.agent/skills/花月開發常見錯誤與解法.md §4》規範：
   - 全域 class 前綴 game26-
   - loadCSS() 動態防護（id=game26-css）
   - overlay 掛載 document.body 並套用 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 完整支援關卡挑戰模式（callback 接 selectedLevel, levelIndex）
   - 時限 = targetChars.length × timeLimitRate
   - 詩透過 getSharedRandomPoem 抽取
   ========================================= */

(function () {
    const Game26 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // ── 詩詞 ──
        currentPoem: null,
        poemLines: [],            // 詩句陣列
        targetChars: [],          // 全詩字陣列（去標點）── 用於時限計算
        currentLineIndex: 0,      // 當前句索引
        currentLineChars: [],     // 當前句去重後的目標字
        collectProgress: {},      // { 字: 已收集次數 }
        collectTarget: 1,         // 每字需收集次數（泡泡龍每消除一群算 +1）

        // ── 蜂窩棋盤（六邊形排列） ──
        // 偶數列 cols 顆，奇數列 cols-1 顆（縮排半格）
        rows: 0,                  // 當前已有泡泡的列數
        cols: 8,                  // 偶數列泡泡數
        maxRows: 14,              // 棋盤最大列數（觸頂判定）
        cellsByRow: [],           // [row][col] = { char, alive } 或 null
        bubbleR: 30,              // 泡泡半徑（邏輯像素）
        rowHeight: 0,             // 行距（√3 × R）
        boardOriginX: 0,          // 棋盤起點 X
        boardOriginY: 0,          // 棋盤起點 Y（含下推偏移）
        boardOffsetY: 0,          // 下推累積偏移（每次推 rowHeight）
        boardWidth: 0,            // 蜂窩繪製區寬
        boardHeight: 0,           // 蜂窩繪製區高（不含發射台）
        canvasWidth: 480,         // 邏輯 canvas 寬
        canvasHeight: 720,        // 邏輯 canvas 高
        pressureLineY: 0,         // 壓力線 Y（畫面下方）

        // ── 發射台 ──
        launcherX: 0,
        launcherY: 0,
        aimAngle: Math.PI / 2,    // 0=右, π/2=上, π=左
        nextChar: '',             // 下一顆泡泡字
        afterNextChar: '',        // 「下下顆」（顯示備援）
        isAiming: false,
        flyingBubble: null,       // { x, y, vx, vy, char }

        // ── 動畫/節奏 ──
        rafId: null,
        lastTickTime: 0,
        pushTimer: 0,             // 下推倒數（毫秒）
        emergencyUsed: false,     // 緊急救援是否已使用
        chainCountThisShot: 0,    // 本發消除/墜落顆數

        // ── 計時 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        /*
         * 難度設定（嚴格依企劃書 §7）
         * pushInterval ：泡泡牆推進間隔（毫秒）
         * poemMinRating：詩評下限
         * wallCols     ：牆面寬度（偶數列泡泡數）
         * decoyRatio   ：干擾字比例
         * reflectMax   ：瞄準虛線反彈預判次數（0/1/2）
         * emergencyRescue：是否啟用緊急救援（觸壓力線前自動清屏一次）
         * timeLimitRate：每字時間倍率（0=不使用，以推進壓力為主）
         * initRows     ：初始泡泡牆列數
         */
        difficultySettings: {
            '小學':   { pushInterval: 15000, poemMinRating: 6, wallCols: 8,  decoyRatio: 0.10, reflectMax: 2, emergencyRescue: true,  timeLimitRate: 0, initRows: 4, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 28 },
            '中學':   { pushInterval: 12000, poemMinRating: 5, wallCols: 9,  decoyRatio: 0.20, reflectMax: 2, emergencyRescue: true,  timeLimitRate: 0, initRows: 5, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 28 },
            '高中':   { pushInterval: 10000, poemMinRating: 4, wallCols: 10, decoyRatio: 0.30, reflectMax: 1, emergencyRescue: true,  timeLimitRate: 0, initRows: 5, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 28 },
            '大學':   { pushInterval: 8000,  poemMinRating: 3, wallCols: 11, decoyRatio: 0.40, reflectMax: 1, emergencyRescue: false, timeLimitRate: 0, initRows: 6, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 28 },
            '研究所': { pushInterval: 5000,  poemMinRating: 3, wallCols: 12, decoyRatio: 0.50, reflectMax: 0, emergencyRescue: false, timeLimitRate: 0, initRows: 6, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 28 }
        },

        // ── CSS 載入防護 ──
        loadCSS: function () {
            if (!document.getElementById('game26-css')) {
                const link = document.createElement('link');
                link.id = 'game26-css';
                link.rel = 'stylesheet';
                link.href = 'game26.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game26-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game26-container');
        },

        // 建立 overlay DOM（掛 document.body 而非 #stage，避免 scale 重複縮放）
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game26-container';
            div.className = 'game26-overlay hidden';
            div.innerHTML = `
                <div class="game26-header">
                    <div class="game26-score-board">分數: <span id="game26-score">0</span></div>
                    <div class="game26-controls">
                        <button class="game26-difficulty-tag" id="game26-diff-tag">小學</button>
                        <button id="game26-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game26-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game26-sub-header">
                    <div id="game26-poem-info" class="poem-info" style="cursor:pointer; text-decoration:underline; opacity:0.85;"></div>
                </div>
                <div class="game26-info-bar">
                    <div id="game26-line-text" class="game26-line-text"></div>
                    <div id="game26-progress" class="game26-progress"></div>
                    <div id="game26-next-preview" class="game26-next-preview">即將發射：<span id="game26-next-char">－</span></div>
                </div>
                <div class="game26-area">
                    <div id="game26-board-wrapper" class="game26-board-wrapper">
                        <svg id="game26-timer-ring">
                            <rect id="game26-timer-path" x="3" y="3"></rect>
                        </svg>
                        <canvas id="game26-canvas" width="480" height="720"></canvas>
                        <div id="game26-warning-overlay" class="game26-warning-overlay hidden"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放
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
            document.getElementById('game26-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game26-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game26-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 瞄準輸入：mousedown/touchstart 開始瞄準，move 調整，up/end 放開射出
            const canvas = document.getElementById('game26-canvas');
            canvas.addEventListener('mousedown', this.onAimStart.bind(this));
            canvas.addEventListener('touchstart', this.onAimStart.bind(this), { passive: false });
            window.addEventListener('mousemove', this.onAimMove.bind(this));
            window.addEventListener('touchmove', this.onAimMove.bind(this), { passive: false });
            window.addEventListener('mouseup', this.onAimEnd.bind(this));
            window.addEventListener('touchend', this.onAimEnd.bind(this));
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
                'game24-container', 'game25-container'];
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
                window.DifficultySelector.show('投珠破句', (selectedLevel, levelIndex) => {
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
            const diffTag = document.getElementById('game26-diff-tag');
            const retryBtn = document.getElementById('game26-retryGame-btn');
            const newBtn = document.getElementById('game26-newGame-btn');
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
                'game26'
            );
            if (!result) return false;
            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.targetChars = this.poemLines.join('').split('');

            const poemInfo = document.getElementById('game26-poem-info');
            poemInfo.textContent = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
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
            this.emergencyUsed = false;
            this.flyingBubble = null;
            this.isAiming = false;
            this.aimAngle = Math.PI / 2;

            const settings = this.difficultySettings[this.difficulty];
            this.cols = settings.wallCols;
            this.collectTarget = 1; // 泡泡龍以「消除即收集 1 次」為主，靠墜落連鎖補足

            document.getElementById('game26-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            document.getElementById('game26-retryGame-btn').disabled = false;
            document.getElementById('game26-newGame-btn').disabled = false;

            // 時限（依規範必須在抽詩之後用 targetChars.length 計算）
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game26-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                this.maxTimer = 0;
                document.getElementById('game26-timer-ring').style.display = 'none';
                clearInterval(this.timerInterval);
            }

            // 初始化棋盤幾何
            this.initBoardGeometry();
            this.startCurrentLine();
            this.startRAF();
        },

        // 初始化蜂窩幾何
        initBoardGeometry: function () {
            this.canvasWidth = 480;
            this.canvasHeight = 720;
            // 泡泡半徑：依牆面寬度動態計算（保證 cols 顆寬度撐滿）
            this.bubbleR = Math.floor((this.canvasWidth - 8) / (this.cols * 2));
            this.rowHeight = Math.floor(this.bubbleR * Math.sqrt(3));
            this.boardOriginX = this.bubbleR + 4;
            this.boardOriginY = this.bubbleR + 4;
            this.boardOffsetY = 0;
            this.boardWidth = this.cols * this.bubbleR * 2;
            // 發射台位置（底部正中）
            this.launcherX = this.canvasWidth / 2;
            this.launcherY = this.canvasHeight - this.bubbleR - 10;
            // 壓力線：發射台上方一格
            this.pressureLineY = this.launcherY - this.bubbleR * 2 - 4;
        },

        // 開始當前句的收集
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

            this.updateLineDisplay();
            this.generateWall();
            this.pickNextChar();
            this.updateNextPreview();

            // 重置下推節奏
            const settings = this.difficultySettings[this.difficulty];
            this.pushTimer = settings.pushInterval;
            this.lastTickTime = performance.now();
        },

        // 字頻顯示
        updateLineDisplay: function () {
            const lineEl = document.getElementById('game26-line-text');
            const progEl = document.getElementById('game26-progress');
            const line = this.poemLines[this.currentLineIndex] || '';
            lineEl.innerHTML = `〈第 ${this.currentLineIndex + 1}/${this.poemLines.length} 句〉<span class="game26-line-poem">${line}</span>`;
            let html = '';
            this.currentLineChars.forEach(ch => {
                const got = this.collectProgress[ch] || 0;
                const done = got >= this.collectTarget;
                html += `<span class="game26-char-group ${done ? 'done' : ''}">${ch}${done ? '✓' : '○'}</span>`;
            });
            progEl.innerHTML = html;
        },

        updateNextPreview: function () {
            const el = document.getElementById('game26-next-char');
            if (el) el.textContent = this.nextChar || '－';
        },

        // 生成初始泡泡牆
        generateWall: function () {
            const settings = this.difficultySettings[this.difficulty];
            this.cellsByRow = [];
            this.rows = settings.initRows;
            for (let r = 0; r < this.maxRows; r++) {
                this.cellsByRow.push([]);
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    if (r < settings.initRows) {
                        this.cellsByRow[r].push({ char: this.pickWallChar(), alive: true });
                    } else {
                        this.cellsByRow[r].push(null);
                    }
                }
            }
        },

        // 牆面字塊抽選（加權：當前句缺口字 60% / 全詩其他字 30% / 干擾字 10%）
        pickWallChar: function () {
            const settings = this.difficultySettings[this.difficulty];
            const useDecoy = Math.random() < settings.decoyRatio;
            if (useDecoy) {
                // 干擾字：從全詩外的常用詩詞字池中抽（簡化：取目前不在當前句的其他句字）
                const otherChars = [];
                this.poemLines.forEach((ln, i) => {
                    if (i !== this.currentLineIndex) {
                        for (const ch of ln) otherChars.push(ch);
                    }
                });
                if (otherChars.length > 0) return otherChars[Math.floor(Math.random() * otherChars.length)];
            }
            // 60% 機率走「缺口字」，30% 走「全詩字」，10% 走 fallback
            const r = Math.random();
            const deficits = this.currentLineChars.filter(ch => (this.collectProgress[ch] || 0) < this.collectTarget);
            if (r < 0.6 && deficits.length > 0) {
                return deficits[Math.floor(Math.random() * deficits.length)];
            } else if (r < 0.9 && this.targetChars.length > 0) {
                return this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
            }
            if (this.currentLineChars.length > 0) {
                return this.currentLineChars[Math.floor(Math.random() * this.currentLineChars.length)];
            }
            return '詩';
        },

        // 抽下一顆字（加權生成：缺口字 60% / 牆面已有字 30% / 干擾 10%）
        pickNextChar: function () {
            const r = Math.random();
            const deficits = this.currentLineChars.filter(ch => (this.collectProgress[ch] || 0) < this.collectTarget);
            // 統計牆面已有字
            const wallChars = {};
            for (let row = 0; row < this.cellsByRow.length; row++) {
                for (let col = 0; col < this.cellsByRow[row].length; col++) {
                    const cell = this.cellsByRow[row][col];
                    if (cell && cell.alive) wallChars[cell.char] = (wallChars[cell.char] || 0) + 1;
                }
            }
            const wallCharList = Object.keys(wallChars);
            if (r < 0.6 && deficits.length > 0) {
                // 從缺口字中找牆面也有的
                const both = deficits.filter(ch => wallChars[ch]);
                if (both.length > 0) {
                    this.nextChar = both[Math.floor(Math.random() * both.length)];
                    return;
                }
                this.nextChar = deficits[Math.floor(Math.random() * deficits.length)];
                return;
            } else if (r < 0.9 && wallCharList.length > 0) {
                this.nextChar = wallCharList[Math.floor(Math.random() * wallCharList.length)];
                return;
            }
            // 干擾：targetChars 隨抽
            if (this.targetChars.length > 0) {
                this.nextChar = this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
                return;
            }
            this.nextChar = '詩';
        },

        // ── 蜂窩座標換算 ──
        getCellCenter: function (row, col) {
            const offsetX = (row % 2 === 1) ? this.bubbleR : 0;
            const x = this.boardOriginX + offsetX + col * this.bubbleR * 2;
            const y = this.boardOriginY + this.boardOffsetY + row * this.rowHeight;
            return { x, y };
        },

        // 找最近的可吸附蜂窩格
        snapToGrid: function (x, y) {
            let best = null;
            let bestDist = Infinity;
            for (let r = 0; r < this.maxRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    if (this.cellsByRow[r][c] && this.cellsByRow[r][c].alive) continue;
                    const ctr = this.getCellCenter(r, c);
                    const d = (ctr.x - x) ** 2 + (ctr.y - y) ** 2;
                    if (d < bestDist) {
                        bestDist = d;
                        best = { r, c };
                    }
                }
            }
            return best;
        },

        // 取得六邊形鄰居（六個方向）
        getNeighbors: function (r, c) {
            const isOdd = (r % 2 === 1);
            // 偶數列：左上(r-1,c-1) 右上(r-1,c) 左(r,c-1) 右(r,c+1) 左下(r+1,c-1) 右下(r+1,c)
            // 奇數列：左上(r-1,c)   右上(r-1,c+1) 左(r,c-1) 右(r,c+1) 左下(r+1,c)   右下(r+1,c+1)
            const offsets = isOdd
                ? [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]]
                : [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
            const result = [];
            for (const [dr, dc] of offsets) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= this.maxRows) continue;
                const rowCols = (nr % 2 === 0) ? this.cols : (this.cols - 1);
                if (nc < 0 || nc >= rowCols) continue;
                result.push({ r: nr, c: nc });
            }
            return result;
        },

        // ── 瞄準輸入 ──
        getCanvasPoint: function (e) {
            const canvas = document.getElementById('game26-canvas');
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX; clientY = e.clientY;
            }
            const scaleX = this.canvasWidth / rect.width;
            const scaleY = this.canvasHeight / rect.height;
            return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
        },

        onAimStart: function (e) {
            if (!this.isActive || this.flyingBubble) return;
            if (e.cancelable) e.preventDefault();
            this.isAiming = true;
            this.updateAimAngle(e);
            if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
        },

        onAimMove: function (e) {
            if (!this.isAiming || !this.isActive || this.flyingBubble) return;
            if (e.cancelable) e.preventDefault();
            this.updateAimAngle(e);
        },

        onAimEnd: function (e) {
            if (!this.isAiming || !this.isActive) return;
            this.isAiming = false;
            if (this.flyingBubble) return;
            this.updateAimAngle(e);
            this.fireBubble();
        },

        updateAimAngle: function (e) {
            const p = this.getCanvasPoint(e);
            const dx = p.x - this.launcherX;
            const dy = p.y - this.launcherY;
            // atan2 回傳 -π~π；本作以「向上=π/2」為基準
            // 螢幕座標 y 向下為正，所以對於朝上射擊，dy<0
            let angle = Math.atan2(-dy, dx); // 0=右, π/2=上, π=左
            // 限制 10°~170°
            const minA = 10 * Math.PI / 180;
            const maxA = 170 * Math.PI / 180;
            if (angle < minA) angle = minA;
            if (angle > maxA) angle = maxA;
            this.aimAngle = angle;
        },

        // 發射泡泡
        fireBubble: function () {
            if (this.flyingBubble) return;
            const speed = 14;
            const vx = Math.cos(this.aimAngle) * speed;
            const vy = -Math.sin(this.aimAngle) * speed; // 螢幕座標 y 向下，所以取負
            this.flyingBubble = {
                x: this.launcherX,
                y: this.launcherY,
                vx, vy,
                char: this.nextChar
            };
            if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
        },

        // ── RAF 主循環 ──
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

        // 每幀邏輯
        tick: function (dt) {
            // 飛行泡泡推進
            if (this.flyingBubble) {
                const b = this.flyingBubble;
                // 多步細分模擬以避免穿透
                const steps = 4;
                for (let s = 0; s < steps; s++) {
                    b.x += b.vx / steps;
                    b.y += b.vy / steps;
                    // 牆面反彈（左右）
                    if (b.x - this.bubbleR < 2) { b.x = 2 + this.bubbleR; b.vx = -b.vx; }
                    if (b.x + this.bubbleR > this.canvasWidth - 2) { b.x = this.canvasWidth - 2 - this.bubbleR; b.vx = -b.vx; }
                    // 頂端：吸附到最近格
                    if (b.y - this.bubbleR < this.boardOriginY + this.boardOffsetY - 4) {
                        this.attachBubble(b);
                        return;
                    }
                    // 與既有泡泡碰撞
                    if (this.checkBubbleCollision(b)) {
                        this.attachBubble(b);
                        return;
                    }
                }
            }

            // 牆面下推節奏
            if (!this.flyingBubble) {
                this.pushTimer -= dt;
                if (this.pushTimer <= 0) {
                    this.pushWallDown();
                    const settings = this.difficultySettings[this.difficulty];
                    this.pushTimer = settings.pushInterval;
                }
            }

            // 失敗警示：泡泡牆最底列接近壓力線時閃爍
            const lowestY = this.getLowestBubbleY();
            const warningEl = document.getElementById('game26-warning-overlay');
            if (warningEl) {
                if (lowestY >= this.pressureLineY - this.rowHeight) {
                    warningEl.classList.remove('hidden');
                } else {
                    warningEl.classList.add('hidden');
                }
            }
        },

        // 檢查飛行泡泡與既有泡泡的碰撞
        checkBubbleCollision: function (b) {
            const minDist = this.bubbleR * 2 - 2;
            for (let r = 0; r < this.maxRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    const cell = this.cellsByRow[r][c];
                    if (!cell || !cell.alive) continue;
                    const ctr = this.getCellCenter(r, c);
                    const dx = ctr.x - b.x, dy = ctr.y - b.y;
                    if (dx * dx + dy * dy < minDist * minDist) return true;
                }
            }
            return false;
        },

        // 把飛行泡泡吸附到蜂窩格
        attachBubble: function (b) {
            const snap = this.snapToGrid(b.x, b.y);
            if (!snap) {
                this.flyingBubble = null;
                return;
            }
            this.cellsByRow[snap.r][snap.c] = { char: b.char, alive: true };
            this.flyingBubble = null;
            if (window.SoundManager && window.SoundManager.playSuccessShort) window.SoundManager.playSuccessShort();

            // 從吸附點 flood-fill 同字
            const group = this.findSameCharGroup(snap.r, snap.c);
            if (group.length >= 3) {
                // 消除這群
                group.forEach(g => {
                    this.cellsByRow[g.r][g.c].alive = false;
                    this.cellsByRow[g.r][g.c] = null;
                });
                this.collectChar(b.char, 1);
                this.score += this.getPointA() * group.length;

                // 墜落判定
                const dropped = this.gravityCheck();
                if (dropped.length > 0) {
                    // 對每個墜落字 +1 收集（若屬於當前句）
                    dropped.forEach(d => {
                        const ch = this.cellsByRow[d.r] && this.cellsByRow[d.r][d.c] ? this.cellsByRow[d.r][d.c].char : null;
                        if (ch) this.collectChar(ch, 1);
                        this.cellsByRow[d.r][d.c] = null;
                    });
                    this.score += this.getPointA() * dropped.length * 2;

                    // 碎句成詩偵測（×3 加成）
                    if (this.detectVerseInDrop(dropped)) {
                        this.score += this.getPointA() * dropped.length * 3;
                        if (window.SoundManager && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
                    } else {
                        if (window.SoundManager && window.SoundManager.playSuccess) window.SoundManager.playSuccess();
                    }
                }

                document.getElementById('game26-score').textContent = this.score;
                this.updateLineDisplay();

                if (this.isLineComplete()) {
                    this.completeLine();
                    return;
                }
            }

            // 失敗：泡泡牆觸及壓力線
            this.checkPressureLineFail();

            // 抽下一顆
            this.pickNextChar();
            this.updateNextPreview();
        },

        // BFS 同字群
        findSameCharGroup: function (startR, startC) {
            const target = this.cellsByRow[startR][startC];
            if (!target || !target.alive) return [];
            const ch = target.char;
            const visited = {};
            const queue = [{ r: startR, c: startC }];
            const result = [];
            visited[startR + ',' + startC] = true;
            while (queue.length > 0) {
                const cur = queue.shift();
                const cell = this.cellsByRow[cur.r] && this.cellsByRow[cur.r][cur.c];
                if (!cell || !cell.alive || cell.char !== ch) continue;
                result.push(cur);
                this.getNeighbors(cur.r, cur.c).forEach(nb => {
                    const key = nb.r + ',' + nb.c;
                    if (!visited[key]) {
                        visited[key] = true;
                        queue.push(nb);
                    }
                });
            }
            return result;
        },

        // 墜落判定：BFS 從頂列出發，找出所有「連到頂」的泡泡；其餘墜落
        gravityCheck: function () {
            const reachable = {};
            const queue = [];
            // 頂列所有 alive 泡泡入隊
            const topCols = (0 % 2 === 0) ? this.cols : (this.cols - 1);
            for (let c = 0; c < topCols; c++) {
                const cell = this.cellsByRow[0][c];
                if (cell && cell.alive) {
                    queue.push({ r: 0, c });
                    reachable['0,' + c] = true;
                }
            }
            while (queue.length > 0) {
                const cur = queue.shift();
                this.getNeighbors(cur.r, cur.c).forEach(nb => {
                    const key = nb.r + ',' + nb.c;
                    if (reachable[key]) return;
                    const cell = this.cellsByRow[nb.r] && this.cellsByRow[nb.r][nb.c];
                    if (cell && cell.alive) {
                        reachable[key] = true;
                        queue.push(nb);
                    }
                });
            }
            // 收集所有 alive 但不在 reachable 的泡泡
            const dropped = [];
            for (let r = 0; r < this.maxRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    const cell = this.cellsByRow[r][c];
                    if (cell && cell.alive && !reachable[r + ',' + c]) {
                        dropped.push({ r, c });
                    }
                }
            }
            return dropped;
        },

        // 碎句成詩偵測：墜落泡泡群是否含詩句連續字段（≥3 字）
        detectVerseInDrop: function (dropped) {
            const chars = dropped.map(d => {
                const cell = this.cellsByRow[d.r] && this.cellsByRow[d.r][d.c];
                return cell ? cell.char : '';
            }).filter(c => c);
            if (chars.length < 3) return false;
            const charSet = {};
            chars.forEach(ch => { charSet[ch] = true; });
            // 對每句檢查是否有 3 字連續字段全部在 charSet 中
            for (const line of this.poemLines) {
                for (let i = 0; i + 3 <= line.length; i++) {
                    const slice = line.substr(i, 3);
                    if ([...slice].every(ch => charSet[ch])) return true;
                }
            }
            return false;
        },

        // 收集字（更新進度）
        collectChar: function (ch, times) {
            if (this.collectProgress[ch] !== undefined) {
                this.collectProgress[ch] = Math.min(this.collectTarget, this.collectProgress[ch] + times);
            }
        },

        isLineComplete: function () {
            for (const ch of this.currentLineChars) {
                if ((this.collectProgress[ch] || 0) < this.collectTarget) return false;
            }
            return true;
        },

        // 推進牆面：每隔 pushInterval 整體下推一格
        pushWallDown: function () {
            this.boardOffsetY += this.rowHeight;
            this.checkPressureLineFail();
        },

        getLowestBubbleY: function () {
            let lowest = 0;
            for (let r = 0; r < this.maxRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    const cell = this.cellsByRow[r][c];
                    if (cell && cell.alive) {
                        const y = this.getCellCenter(r, c).y;
                        if (y > lowest) lowest = y;
                    }
                }
            }
            return lowest;
        },

        // 壓力線失敗檢查
        checkPressureLineFail: function () {
            const lowest = this.getLowestBubbleY();
            if (lowest + this.bubbleR >= this.pressureLineY) {
                const settings = this.difficultySettings[this.difficulty];
                if (settings.emergencyRescue && !this.emergencyUsed) {
                    // 緊急救援：清空整面牆，重新生成精簡版
                    this.emergencyUsed = true;
                    if (window.SoundManager && window.SoundManager.playWarning) window.SoundManager.playWarning();
                    this.activateEmergencyRescue();
                    return;
                }
                this.gameOver(false, '泡泡觸底！');
            }
        },

        // 緊急救援：全螢幕清除一次，重置 offsetY 與行
        activateEmergencyRescue: function () {
            this.boardOffsetY = 0;
            for (let r = 0; r < this.maxRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    this.cellsByRow[r][c] = null;
                }
            }
            // 重新生成精簡 3 列泡泡
            const settings = this.difficultySettings[this.difficulty];
            const newRows = Math.max(3, Math.floor(settings.initRows / 2));
            for (let r = 0; r < newRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    this.cellsByRow[r][c] = { char: this.pickWallChar(), alive: true };
                }
            }
        },

        // 取分基數
        getPointA: function () {
            return (window.ScoreManager && window.ScoreManager.gameSettings && window.ScoreManager.gameSettings.game26)
                ? window.ScoreManager.gameSettings.game26.getPointA : 30;
        },

        // 進入下一句
        completeLine: function () {
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
            this.currentLineIndex++;
            if (this.currentLineIndex >= this.poemLines.length) {
                this.gameOver(true, '');
                return;
            }
            // 進下一句：刷新牆面
            setTimeout(() => this.startCurrentLine(), 600);
        },

        // ── 渲染：canvas 2D 全繪 ──
        render: function () {
            const canvas = document.getElementById('game26-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

            // 壓力線
            ctx.strokeStyle = 'hsla(0, 90%, 50%, 0.7)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(4, this.pressureLineY);
            ctx.lineTo(this.canvasWidth - 4, this.pressureLineY);
            ctx.stroke();
            ctx.setLineDash([]);

            // 牆面泡泡
            for (let r = 0; r < this.maxRows; r++) {
                const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                for (let c = 0; c < rowCols; c++) {
                    const cell = this.cellsByRow[r][c];
                    if (!cell || !cell.alive) continue;
                    const ctr = this.getCellCenter(r, c);
                    this.drawBubble(ctx, ctr.x, ctr.y, cell.char);
                }
            }

            // 飛行泡泡
            if (this.flyingBubble) {
                this.drawBubble(ctx, this.flyingBubble.x, this.flyingBubble.y, this.flyingBubble.char, true);
            }

            // 瞄準虛線（含反彈預判）
            if (!this.flyingBubble && this.isActive) {
                this.drawAimLine(ctx);
            }

            // 發射台底座
            ctx.fillStyle = 'hsl(45, 60%, 35%)';
            ctx.beginPath();
            ctx.arc(this.launcherX, this.launcherY, this.bubbleR + 4, 0, Math.PI * 2);
            ctx.fill();
            // 即將發射的字
            this.drawBubble(ctx, this.launcherX, this.launcherY, this.nextChar);
        },

        // 繪製單顆字泡泡
        drawBubble: function (ctx, x, y, ch, isFlying) {
            ctx.beginPath();
            ctx.arc(x, y, this.bubbleR - 1, 0, Math.PI * 2);
            ctx.fillStyle = isFlying ? 'hsla(45, 90%, 70%, 1)' : 'hsla(45, 30%, 90%, 1)';
            ctx.fill();
            ctx.strokeStyle = 'hsla(20, 50%, 30%, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 字
            ctx.fillStyle = 'hsl(20, 70%, 15%)';
            ctx.font = `bold ${Math.floor(this.bubbleR * 1.1)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch || '', x, y);
        },

        // 繪製瞄準虛線：含反彈預判（依難度）
        drawAimLine: function (ctx) {
            const settings = this.difficultySettings[this.difficulty];
            const maxReflect = settings.reflectMax;
            const speed = 14;
            let x = this.launcherX;
            let y = this.launcherY;
            let vx = Math.cos(this.aimAngle) * speed;
            let vy = -Math.sin(this.aimAngle) * speed;
            let reflects = 0;
            let hit = null;

            ctx.strokeStyle = 'hsla(0, 0%, 100%, 0.55)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.moveTo(x, y);

            const maxSteps = 600;
            for (let s = 0; s < maxSteps; s++) {
                x += vx * 0.5;
                y += vy * 0.5;
                if (x - this.bubbleR < 2) {
                    if (reflects >= maxReflect) { hit = { x, y }; break; }
                    x = 2 + this.bubbleR; vx = -vx; reflects++;
                    ctx.lineTo(x, y);
                }
                if (x + this.bubbleR > this.canvasWidth - 2) {
                    if (reflects >= maxReflect) { hit = { x, y }; break; }
                    x = this.canvasWidth - 2 - this.bubbleR; vx = -vx; reflects++;
                    ctx.lineTo(x, y);
                }
                if (y - this.bubbleR < this.boardOriginY + this.boardOffsetY - 4) {
                    hit = { x, y }; break;
                }
                // 與牆面碰撞偵測
                let collided = false;
                const minDist = this.bubbleR * 2 - 2;
                for (let r = 0; r < this.maxRows && !collided; r++) {
                    const rowCols = (r % 2 === 0) ? this.cols : (this.cols - 1);
                    for (let c = 0; c < rowCols; c++) {
                        const cell = this.cellsByRow[r][c];
                        if (!cell || !cell.alive) continue;
                        const ctr = this.getCellCenter(r, c);
                        const dx = ctr.x - x, dy = ctr.y - y;
                        if (dx * dx + dy * dy < minDist * minDist) {
                            hit = { x, y };
                            collided = true; break;
                        }
                    }
                }
                if (collided) break;
                if (y > this.launcherY) { hit = { x, y }; break; }
            }
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.setLineDash([]);
            // 命中十字標記
            if (hit) {
                ctx.strokeStyle = 'hsl(0, 90%, 60%)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(hit.x - 8, hit.y); ctx.lineTo(hit.x + 8, hit.y);
                ctx.moveTo(hit.x, hit.y - 8); ctx.lineTo(hit.x, hit.y + 8);
                ctx.stroke();
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
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game26-timer-path');
            const wrapper = document.getElementById('game26-board-wrapper');
            const svg = document.getElementById('game26-timer-ring');
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

        // ── 遊戲結束（勝/敗） ──
        gameOver: function (win, reason) {
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
                    gameNo: 26,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game26-retryGame-btn').disabled = true;
                document.getElementById('game26-newGame-btn').disabled = true;
            } else {
                document.getElementById('game26-retryGame-btn').disabled = false;
                document.getElementById('game26-newGame-btn').disabled = false;
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '泡泡觸底！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game26', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game26', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game26',
                    timerContainerId: 'game26-board-wrapper',
                    scoreElementId: 'game26-score',
                    heartsSelector: '',
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

    window.Game26 = Game26;

    // ?game=26 自動啟動（支援挑戰關卡直連）
    if (new URLSearchParams(window.location.search).get('game') === '26') {
        setTimeout(() => {
            if (window.Game26) window.Game26.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
