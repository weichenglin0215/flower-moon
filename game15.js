(function () {
    'use strict';

    // ================================================================
    // 遊戲十五：墨韻游龍（貪食詩句）
    // 玩法：控制「筆頭」（蛇頭）收集詩句的下一個正確字，
    //       吃錯字或撞牆/撞自身則扣一顆錯誤次數，蛇頭回到起始位置，
    //       已吃到的字仍跟著蛇頭。收集完整詩句即過關。
    // ================================================================

    const Game15 = {

        // ── 遊戲整體狀態 ──
        isActive: false,
        pendingWin: false,          // 本幀吃到最後一字後，等下一次渲染再結算
        difficulty: '小學',
        score: 0,
        hearts: 7,
        maxHearts: 7,

        // ── 計時器 ──
        timeLimit: 30,
        timer: 30,
        maxTimer: 30,
        startTime: null,
        gameStartTime: null,

        // ── 詩詞資料 ──
        currentPoem: null,
        targetChars: [],        // 目標詩句所有字（去標點，flat 陣列）
        poemLines: [],          // 各句去標點字元陣列（用於 hint bar 句間分隔）
        currentCharIdx: 0,      // 下一個要收集的字的索引

        // ── 蛇的狀態 ──
        snake: [],
        bodyChars: [],          // 已吃到的字（保留至過關，撞牆不清空）
        direction: { dc: 1, dr: 0 },
        nextDirection: { dc: 1, dr: 0 },
        waitingForInput: true,  // 開局或撞牆後等待玩家輸入方向

        // ── 食物（字塊）──
        foods: [],
        targetFoodPositions: [], // 每個目標字的格位（懶加載：可見時才分配，確保遠離龍頭）
        allDecoyFoods: [],       // 干擾字的固定格位與字元（遊戲開始時一次預分配，失誤後不移位）

        // ── Canvas 格子設定（13格寬×18格高，格子 36px）──
        COLS: 13,
        ROWS: 18,
        CELL: 36,
        CANVAS_W: 500,
        CANVAS_H: 700,
        GRID_X: 16,   // (500 - 13*36) / 2 = 16
        GRID_Y: 26,   // (700 - 18*36) / 2 = 26

        // 龍頭固定起始格（0-based）：對應 1-based 第7列/第13行，D-pad 中心位置
        START_COL: 6,
        START_ROW: 12,

        // ── 動畫與計時 ──
        gameLoopId: null,
        lastMoveTime: 0,
        pulsePhase: 0,
        lastFrameTime: 0,

        // ── 觸控輸入暫存 ──
        touchStartX: 0,
        touchStartY: 0,

        // ── D-pad 淡出計時器 ──
        dpadFadeTimeoutId: null,      // 10 秒後觸發淡出的 setTimeout id
        _dpadFadeStarted: false,      // 本局已啟動計時器，避免重複啟動

        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,

        // ── 難度設定說明 ──
        /*
        speed:移動間隔，數字越小越快。
        decoyCount:干擾字數量。
        poemMinRating:詩詞最低評分。
        minChars:詩詞最少字數。
        maxChars:詩詞最多字數。
        timeLimitRate:每字時間倍率（秒），實際時限 = 題目字數 × timeLimitRate。
        showHint:目標字金黃底色提示持續秒數（0=不顯示，999=永遠顯示）。
        maxShowCount:最大顯示數量。
        maxMistakeCount:最大錯誤次數。
        wallMargin:邊界間距。
        showFadding:漸隱數量。
        gridTransparency:格線透明度。
        */
        difficultySettings: {
            '小學': {
                speed: 400, decoyCount: 0, poemMinRating: 6, minChars: 10, maxChars: 14,
                timeLimitRate: 6, showHint: 999, maxShowCount: 4, maxMistakeCount: 5,
                wallMargin: 3, showFadding: 3, gridTransparency: 0.8   // showHint金黃底色永遠顯示
            },
            '中學': {
                speed: 360, decoyCount: 0, poemMinRating: 5, minChars: 14, maxChars: 20,
                timeLimitRate: 6, showHint: 10, maxShowCount: 8, maxMistakeCount: 4,
                wallMargin: 2, showFadding: 4, gridTransparency: 0.4   // showHint金黃底色顯示 10 秒後回復白底
            },
            '高中': {
                speed: 340, decoyCount: 0, poemMinRating: 4, minChars: 20, maxChars: 28,
                timeLimitRate: 6, showHint: 3, maxShowCount: 12, maxMistakeCount: 3,
                wallMargin: 1, showFadding: 3, gridTransparency: 0.2   // showHint金黃底色顯示 3 秒後回復白底
            },
            '大學': {
                speed: 320, decoyCount: 2, poemMinRating: 4, minChars: 20, maxChars: 56,
                timeLimitRate: 6, showHint: 1, maxShowCount: 16, maxMistakeCount: 2,
                wallMargin: 1, showFadding: 5, gridTransparency: 0.1   // showHint金黃底色僅顯示 1 秒
            },
            '研究所': {
                speed: 300, decoyCount: 6, poemMinRating: 3, minChars: 28, maxChars: 56,
                timeLimitRate: 6, showHint: 0, maxShowCount: 20, maxMistakeCount: 1,
                wallMargin: 0, showFadding: 7, gridTransparency: 0.0   // showHint完全不顯示金黃提示
            },
        },

        // ── 目前難度快取 ──
        showHint: 0,           // 目標字金黃提示持續秒數（由 difficultySettings 載入）
        hintStartTime: 0,      // 當前目標字出現（或重設）的時間戳（performance.now()）
        maxShowCount: 3,
        maxMistakeCount: 7,
        mistakeCount: 0,
        wallMargin: 2,
        showFadding: 0,           // 前 N 個目標字維持白底，其後漸隱（0=不套用）

        // ── 失誤暫停閃爍 ──
        mistakePause: false,      // 失誤後2秒暫停閃爍中
        mistakePauseEnd: 0,       // 暫停閃爍結束時間（ms）

        // ── 吃到字後的逐格發光動畫 ──
        eatAnimStart: -1,         // 動畫開始時間（-1=未激活）
        eatAnimSegCount: 0,       // 動畫時的蛇身節數
        EAT_ANIM_PER_SEG: 65,    // 每節發光持續時間（ms）

        // ── 九宮格分區（目標字均勻散布用）──
        targetZones: [],          // 每個目標字的分區編號（0-8）

        // ================================================================
        // CSS 載入保護
        // ================================================================
        // ── 動態載入 game15.css（若尚未載入過，避免重複插入 <link>）──
        loadCSS: function () {
            if (!document.getElementById('game15-css')) {
                const link = document.createElement('link');
                link.id = 'game15-css';
                link.rel = 'stylesheet';
                link.href = 'game15.css';
                document.head.appendChild(link);
            }
        },

        // ================================================================
        // 初始化：建立 DOM 與綁定事件（僅執行一次）
        // ================================================================
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game15-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game15-container');
            this.canvas = document.getElementById('game15-canvas');
            this.ctx = this.canvas.getContext('2d');

            document.getElementById('game15-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game15-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game15-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            this.setupInput();
        },

        // ================================================================
        // 建立 DOM 結構（掛載於 #stage 或 body）
        // ================================================================
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game15-container';
            div.className = 'game15-overlay hidden';
            div.innerHTML = `
                <div class="game15-header">
                    <div class="game15-score-board">分數：<span id="game15-score">0</span></div>
                    <div class="game15-controls">
                        <button class="game15-difficulty-tag" id="game15-diff-tag" data-level="小學">小學</button>
                        <button id="game15-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game15-newGame-btn"  class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game15-sub-header">
                    <div id="game15-hearts" class="hearts"></div>
                </div>
                <div class="game15-hint-bar" id="game15-hint-bar"></div>
                <div id="game15-poem-info" class="game15-poem-info" ></div>
                <div class="game15-canvas-wrapper" id="game15-canvas-wrapper">
                    <canvas id="game15-canvas" width="500" height="700"></canvas>
                    <svg id="game15-timer-ring" style="display:none">
                        <rect id="game15-timer-path" x="3" y="3"></rect>
                    </svg>
                    <div class="game15-dpad" id="game15-dpad">
                        <button class="game15-dpad-btn game15-dpad-up" id="game15-up" aria-label="上">
                            <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true"><path d="M 4,76 L 40,4 L 76,76" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/></svg>
                        </button>
                        <div class="game15-dpad-row">
                            <button class="game15-dpad-btn game15-dpad-left" id="game15-left" aria-label="左">
                                <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true"><path d="M 76,4  L4,40 L 76,76" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/></svg>
                            </button>
                            <div class="game15-dpad-center"></div>
                            <button class="game15-dpad-btn game15-dpad-right" id="game15-right" aria-label="右">
                                <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true"><path d="M 4,4 L 76,40 L 4,76" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                        <button class="game15-dpad-btn game15-dpad-down" id="game15-down" aria-label="下">
                            <svg viewBox="0 0 80 80" width="72" height="72" aria-hidden="true"><path d="M 4,4 L 40,76 L 76,4 " fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round"/></svg>
                        </button>
                    </div>
                </div>
            `;

            // 掛載於 body（不可掛 #stage：stage 有 transform 會讓 position:fixed 相對 stage 定位，造成雙重縮放）
            document.body.appendChild(div);

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = `scale(${r.scale})`;
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        // ================================================================
        // 顯示 / 隱藏
        // ================================================================
        show: function () {
            this.init();
            this.container.classList.remove('hidden');
            const params = new URLSearchParams(window.location.search);
            if (params.get('game') === '15') {
                this.startNewGame();
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                this.showDifficultySelector();
            }
        },

        hide: function () {
            this.stopGame();
            if (this.container) this.container.classList.add('hidden');
            if (window.GameMessage) window.GameMessage.hide();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            this.stopGameLoop();
            if (window.GameMessage) window.GameMessage.hide();
            if (window.DifficultySelector) {
                // 接收 levelIndex：若玩家選了挑戰關卡，levelIndex 為全域關卡編號（1-300）
                window.DifficultySelector.show('墨韻游龍', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();
                    this.startNewGame();
                });
            } else {
                this.startNewGame();
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game15-diff-tag');
            const newBtn = document.getElementById('game15-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (diffTag) {
                diffTag.textContent = this.isLevelMode ? `挑戰第 ${this.currentLevelIndex} 關` : this.difficulty;
                diffTag.setAttribute('data-level', this.difficulty);
                diffTag.style.backgroundColor = colors[this.difficulty] || '#27ae60';
                diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
            // 挑戰模式下隱藏「新局」按鈕，避免玩家意外跳出挑戰流程
            if (newBtn) newBtn.style.display = this.isLevelMode ? 'none' : 'inline-block';
        },

        // ================================================================
        // 選取詩詞（開新局專用）：抽詩並解析，成功傳回 true
        // ================================================================
        selectPoem: function () {
            const settings = this.difficultySettings[this.difficulty];
            const minLines = settings.minChars <= 14 ? 2 : 4;
            const seed = this.isLevelMode ? this.currentLevelIndex : null;
            const result = (typeof getSharedRandomPoem === 'function')
                ? getSharedRandomPoem(settings.poemMinRating, minLines, 4,
                    settings.minChars, settings.maxChars, '', seed, 'game15')
                : null;

            if (!result || !result.lines || result.lines.length === 0) {
                console.error('[Game15] 無法取得詩詞');
                return false;
            }
            this.currentPoem = result.poem;
            // 逐句過濾標點，保留句結構以供 hint bar 加分隔符
            this.poemLines = result.lines.map(l => [...l].filter(c => /[一-鿿]/.test(c)));
            this.targetChars = this.poemLines.flat();
            if (this.targetChars.length === 0) {
                console.error('[Game15] 詩句解析後無有效漢字');
                return false;
            }
            return true;
        },

        // ================================================================
        // 重來（保留當前詩詞，僅重置遊戲狀態）
        // ================================================================
        retryGame: function () {
            if (!this.currentPoem) return;
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.startGameProcess(true);
        },

        // ================================================================
        // 開新局（抽新詩 + 重置）
        // ================================================================
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.updateUIForMode();
            if (!this.selectPoem()) return;
            this.startGameProcess(false);
        },

        // ================================================================
        // 啟動遊戲流程
        // isRetry=true：保留 this.currentPoem / this.targetChars，回到第一字重玩
        // isRetry=false：詩詞已由 selectPoem() 選好，直接重置並開始
        // ================================================================
        startGameProcess: function (isRetry) {
            this.stopGameLoop();
            if (window.GameMessage) window.GameMessage.hide();

            // 同步 UI（含挑戰關卡編號與按鈕顯示狀態）
            this.updateUIForMode();

            // 解鎖按鈕（若上局已鎖定）
            document.getElementById('game15-retryGame-btn').disabled = false;
            document.getElementById('game15-newGame-btn').disabled = false;

            const settings = this.difficultySettings[this.difficulty];

            // 套用難度參數
            this.showHint = settings.showHint;
            this.hintStartTime = performance.now();
            this.maxShowCount = settings.maxShowCount;
            this.maxMistakeCount = settings.maxMistakeCount;
            this.wallMargin = settings.wallMargin;
            this.mistakeCount = 0;
            this.maxHearts = settings.maxMistakeCount;
            this.hearts = settings.maxMistakeCount;

            // 依題目字數動態計算時間限制（字數 × timeLimitRate）
            const calcTimeLimit = this.targetChars.length * settings.timeLimitRate;
            this.timeLimit = calcTimeLimit;
            this.timer = calcTimeLimit;
            this.maxTimer = calcTimeLimit;

            // 更新詩詞資訊欄（重來時 poem 已存在，直接更新 UI；確保 onclick 指向正確 poem）
            const poemInfoEl = document.getElementById('game15-poem-info');
            if (poemInfoEl && this.currentPoem) {
                poemInfoEl.textContent = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
                poemInfoEl.onclick = () => {
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
                };
            }

            // 重置 D-pad 淡出計時器（新局/重來後 D-pad 重新可見）
            if (this.dpadFadeTimeoutId !== null) {
                clearTimeout(this.dpadFadeTimeoutId);
                this.dpadFadeTimeoutId = null;
            }
            this._dpadFadeStarted = false;
            const dpadEl = document.getElementById('game15-dpad');
            if (dpadEl) {
                dpadEl.style.transition = 'none';
                dpadEl.style.opacity = '1';
            }

            // 重置狀態
            this.currentCharIdx = 0;
            this.score = 0;
            this.pulsePhase = 0;
            this.foods = [];
            this.bodyChars = [];
            this.allDecoyFoods = [];
            this.targetFoodPositions = [];
            this.targetZones = [];
            this.waitingForInput = true;
            this.pendingWin = false;
            this.mistakePause = false;
            this.mistakePauseEnd = 0;
            this.eatAnimStart = -1;
            this.eatAnimSegCount = 0;
            this.showFadding = settings.showFadding || 0;
            this.startTime = Date.now();
            this.gameStartTime = Date.now();

            // 初始化蛇（只有頭）
            this._resetSnakeToStart();
            this.direction = { dc: 1, dr: 0 };
            this.nextDirection = { dc: 1, dr: 0 };

            // 懶加載：先分配初始可見目標字格位，後續在 spawnFoods 時再分配
            this._initTargetPositions();
            // 預先分配干擾字格位（固定不移動，失誤時不重排）
            this._initDecoyPositions();

            // 更新 UI
            document.getElementById('game15-score').textContent = '0';
            this.updateHearts();
            this.updateHintBar();
            this.updateTimerBorder(1);

            // 生成初始食物（含可見目標字 + 干擾字）
            this.spawnFoods();

            // 啟動迴圈
            this.isActive = true;
            this.lastMoveTime = performance.now();
            this.lastFrameTime = performance.now();
            this.startGameLoop();
        },

        stopGame: function () {
            this.isActive = false;
            this.stopGameLoop();
            // Game15 的 overlay 掛在 document.body 而非 #stage，
            // menu.js 全域清理只呼叫 stopGame()，不呼叫 hide()，
            // 因此必須在此主動隱藏，防止 overlay 遮蔽 calendar/card/author_bio 等頁面。
            if (this.container) this.container.classList.add('hidden');
        },

        stopGameLoop: function () {
            if (this.gameLoopId !== null) {
                cancelAnimationFrame(this.gameLoopId);
                this.gameLoopId = null;
            }
        },

        // ── 將蛇頭重置到起始格，蛇身跟著 bodyChars 數量向左排列 ──
        _resetSnakeToStart: function () {
            const SC = this.START_COL;
            const SR = this.START_ROW;
            this.snake = [{ col: SC, row: SR }];

            // 計算目前場上可見目標字的格位集合（蛇身不得遮蓋這些格）
            const endIdx = Math.min(this.currentCharIdx + this.maxShowCount, this.targetChars.length);
            const targetPosSet = new Set();
            for (let t = this.currentCharIdx; t < endIdx; t++) {
                const pos = this.targetFoodPositions[t];
                if (pos) targetPosSet.add(`${pos.col},${pos.row}`);
            }

            // 蛇身蛇形排列：向左排列，越界時換行；遇目標字格位則跳過（不放蛇身）
            let c = SC - 1;
            let r = SR;
            let goLeft = true;
            const maxIter = this.COLS * this.ROWS * 3;  // 安全上限，防止極端情況下無限迴圈

            for (let i = 0, iter = 0; i < this.bodyChars.length && iter < maxIter; iter++) {
                // 越界換行
                if (goLeft && c < 0) { c = 0; r = Math.max(0, r - 1); goLeft = false; }
                else if (!goLeft && c >= this.COLS) { c = this.COLS - 1; r = Math.max(0, r - 1); goLeft = true; }

                // 若此格是目前場上可見的目標字，跳過（不放蛇身，繼續找下一個可用格）
                if (targetPosSet.has(`${c},${r}`)) {
                    goLeft ? c-- : c++;
                    continue;
                }

                this.snake.push({ col: c, row: r });
                goLeft ? c-- : c++;
                i++;
            }
        },

        // ── 懶加載：初始化陣列與九宮格分區，並分配初始可見範圍內的格位 ──
        _initTargetPositions: function () {
            // 全部先設為 null，等到該格位要出現時再分配（確保遠離當前龍頭）
            this.targetFoodPositions = new Array(this.targetChars.length).fill(null);

            // 九宮格分區：每9個為一批次，每批次洗牌後依序指定分區（確保全圖均勻散布）
            this.targetZones = [];
            for (let batch = 0; batch * 9 < this.targetChars.length; batch++) {
                const zones = this.shuffleArray([0, 1, 2, 3, 4, 5, 6, 7, 8]);
                for (let j = 0; j < 9 && batch * 9 + j < this.targetChars.length; j++) {
                    this.targetZones.push(zones[j]);
                }
            }

            const visCount = Math.min(this.maxShowCount, this.targetChars.length);
            for (let i = 0; i < visCount; i++) {
                this._assignTargetPosition(i);
            }
        },

        // ── 判斷格位是否在指定的九宮格分區內 ──
        _inZone: function (pos, zone) {
            const zRow = Math.floor(zone / 3);
            const zCol = zone % 3;
            const rStart = Math.floor(this.ROWS * zRow / 3);
            const rEnd = Math.floor(this.ROWS * (zRow + 1) / 3);
            const cStart = Math.floor(this.COLS * zCol / 3);
            const cEnd = Math.floor(this.COLS * (zCol + 1) / 3);
            return pos.row >= rStart && pos.row < rEnd && pos.col >= cStart && pos.col < cEnd;
        },

        // ── 為索引 idx 的目標字分配一個格位
        //    原則：① 遠離當前龍頭（Manhattan >= MIN_DIST）
        //           ② 四鄰最多2個其他目標字（避免目標字包圍導致龍頭無法接近）
        _assignTargetPosition: function (idx) {
            if (idx >= this.targetChars.length) return;
            if (this.targetFoodPositions[idx] !== null) return;  // 已分配

            const margin = this.wallMargin;
            const headCol = (this.snake[0] ? this.snake[0].col : this.START_COL);
            const headRow = (this.snake[0] ? this.snake[0].row : this.START_ROW);
            const MIN_DIST = 4;  // 最小 Manhattan 距離（遠離龍頭）

            // 已佔用格位（已分配目標字 + 干擾字 + 蛇身）
            const occupiedSet = new Set();
            this.targetFoodPositions.forEach((p, i) => {
                if (p !== null && i !== idx) occupiedSet.add(`${p.col},${p.row}`);
            });
            if (this.allDecoyFoods) {
                this.allDecoyFoods.forEach(d => occupiedSet.add(`${d.col},${d.row}`));
            }
            this.snake.forEach(s => occupiedSet.add(`${s.col},${s.row}`));

            // 僅目標字集合（用於相鄰計數，干擾字不算）
            const targetSet = new Set();
            this.targetFoodPositions.forEach((p, i) => {
                if (p !== null && i !== idx) targetSet.add(`${p.col},${p.row}`);
            });

            const candidates = [];
            const SC = this.START_COL, SR = this.START_ROW;
            for (let r = margin; r < this.ROWS - margin; r++) {
                for (let c = margin; c < this.COLS - margin; c++) {
                    if (occupiedSet.has(`${c},${r}`)) continue;
                    // 排除龍頭起始格及其周邊共 9 格（3×3），確保玩家起始區域淨空
                    if (Math.abs(c - SC) <= 1 && Math.abs(r - SR) <= 1) continue;
                    // ── 相鄰限制：四鄰目標字最多 2 個 ──
                    let adjTargets = 0;
                    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dc, dr]) => {
                        if (targetSet.has(`${c + dc},${r + dr}`)) adjTargets++;
                    });
                    if (adjTargets >= 3) continue;
                    const dist = Math.abs(c - headCol) + Math.abs(r - headRow);
                    candidates.push({ col: c, row: r, dist });
                }
            }

            // 備援：放寬所有限制（格子用盡時）
            if (candidates.length === 0) {
                for (let r = 0; r < this.ROWS; r++) {
                    for (let c = 0; c < this.COLS; c++) {
                        if (!occupiedSet.has(`${c},${r}`)) {
                            candidates.push({ col: c, row: r, dist: Math.abs(c - headCol) + Math.abs(r - headRow) });
                        }
                    }
                }
            }

            if (candidates.length === 0) {
                this.targetFoodPositions[idx] = { col: 0, row: 0 };
                return;
            }

            // 優先選取距龍頭 >= MIN_DIST 的格子
            const farPool = candidates.filter(p => p.dist >= MIN_DIST);
            let pool = farPool.length > 0 ? farPool : candidates;

            // 進一步偏好落在指定九宮格分區內的格子（確保全圖均勻散布）
            const zone = this.targetZones ? this.targetZones[idx] : undefined;
            if (zone !== undefined) {
                const zonePool = pool.filter(p => this._inZone(p, zone));
                if (zonePool.length > 0) pool = zonePool;
            }

            const chosen = this.shuffleArray(pool)[0];
            this.targetFoodPositions[idx] = { col: chosen.col, row: chosen.row };
        },

        // ── 在遊戲開始時，為干擾字一次性預分配固定格位（避開已分配的目標字格）──
        _initDecoyPositions: function () {
            const count = this.difficultySettings[this.difficulty].decoyCount;
            if (count === 0) { this.allDecoyFoods = []; return; }

            const margin = this.wallMargin;

            // 已分配目標字的格位集合
            const targetSet = new Set();
            this.targetFoodPositions.forEach(p => {
                if (p !== null) targetSet.add(`${p.col},${p.row}`);
            });

            // 可用格（避開目標字格位 + 龍頭起始周邊 3×3 格）
            const SC2 = this.START_COL, SR2 = this.START_ROW;
            const available = [];
            for (let r = margin; r < this.ROWS - margin; r++) {
                for (let c = margin; c < this.COLS - margin; c++) {
                    if (targetSet.has(`${c},${r}`)) continue;
                    // 排除龍頭起始格及其周邊共 9 格（3×3）
                    if (Math.abs(c - SC2) <= 1 && Math.abs(r - SR2) <= 1) continue;
                    available.push({ col: c, row: r });
                }
            }
            // 備援：margin 內格位補充
            if (available.length < count) {
                for (let r = 0; r < this.ROWS; r++) {
                    for (let c = 0; c < this.COLS; c++) {
                        const key = `${c},${r}`;
                        if (!targetSet.has(key) && !available.find(p => p.col === c && p.row === r)) {
                            available.push({ col: c, row: r });
                        }
                    }
                }
            }

            const shuffled = this.shuffleArray(available);
            // 干擾字來源：排除所有目標字，以免干擾字與目標字外觀混淆
            const decoyChars = this.getDecoyChars(this.targetChars, count);

            this.allDecoyFoods = [];
            for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                this.allDecoyFoods.push({
                    col: shuffled[i].col,
                    row: shuffled[i].row,
                    char: decoyChars[i] || '之',
                    isTarget: false,
                    targetIdx: -1
                });
            }
        },

        // ================================================================
        // 主遊戲迴圈
        // ================================================================
        startGameLoop: function () {
            const loop = (timestamp) => {
                if (!this.isActive) return;

                // delta 時間（秒）
                const delta = Math.min((timestamp - this.lastFrameTime) / 1000, 0.1);
                this.lastFrameTime = timestamp;

                // ── 失誤暫停：龍頭閃爍2秒，計時器與移動全暫停 ──
                if (this.mistakePause) {
                    this.pulsePhase = (this.pulsePhase + 0.22) % (Math.PI * 2);
                    if (performance.now() >= this.mistakePauseEnd) {
                        // 暫停結束 → 重設蛇身到起始位置
                        this.mistakePause = false;
                        this.lastFrameTime = timestamp;  // 重設基準，避免 delta 突然暴增
                        this._resetSnakeToStart();
                        this.direction = { dc: 1, dr: 0 };
                        this.nextDirection = { dc: 1, dr: 0 };
                        this.waitingForInput = true;      // 強制等待新方向輸入（防止暫停期間累積的按鍵）
                        this.hintStartTime = performance.now();  // 重設金黃提示計時器（讓玩家重新看清目標字位置）
                        this.refreshDecoys();
                    }
                    this.renderCanvas();
                    this.gameLoopId = requestAnimationFrame(loop);
                    return;
                }

                // 倒數計時（pendingWin 等待動畫期間暫停計時，避免在過關動畫中超時）
                if (!this.pendingWin) {
                    this.timer -= delta;
                    if (this.timer <= 0) {
                        this.timer = 0;
                        this.updateTimerBorder(0);
                        this.gameOver(false, '時間到！');
                        return;
                    }
                    this.updateTimerBorder(this.timer / this.timeLimit);
                }

                // 脈衝相位（加快：閃爍速度兩倍）
                this.pulsePhase = (this.pulsePhase + 0.12) % (Math.PI * 2);

                // 蛇移動（等待輸入時不移動；pendingWin 過關動畫期間也不移動）
                if (!this.waitingForInput && !this.pendingWin) {
                    const interval = this.difficultySettings[this.difficulty].speed;
                    if (timestamp - this.lastMoveTime >= interval) {
                        this.lastMoveTime = timestamp;
                        this.moveSnake();
                    }
                }

                if (this.isActive) this.renderCanvas();

                // 待勝利旗標：等吃字發光動畫完全播完再觸發結算
                // renderCanvas 會在動畫結束時將 eatAnimStart 重設為 -1
                if (this.pendingWin && this.eatAnimStart < 0) {
                    this.pendingWin = false;
                    this.gameOver(true, '');
                    return;
                }

                this.gameLoopId = requestAnimationFrame(loop);
            };
            this.gameLoopId = requestAnimationFrame(loop);
        },

        // ================================================================
        // 蛇移動邏輯
        // ================================================================
        moveSnake: function () {
            this.direction = { ...this.nextDirection };

            const head = this.snake[0];
            const newHead = {
                col: head.col + this.direction.dc,
                row: head.row + this.direction.dr
            };

            // 碰牆
            if (newHead.col < 0 || newHead.col >= this.COLS ||
                newHead.row < 0 || newHead.row >= this.ROWS) {
                this.handleMistake('牆');
                return;
            }

            // 碰自身（不含最後一格，因為尾巴本幀會移走）
            for (let i = 0; i < this.snake.length - 1; i++) {
                if (this.snake[i].col === newHead.col && this.snake[i].row === newHead.row) {
                    this.handleMistake('自身');
                    return;
                }
            }

            // 食物碰撞
            const foodIdx = this.foods.findIndex(
                f => f.col === newHead.col && f.row === newHead.row
            );

            if (foodIdx >= 0) {
                const food = this.foods[foodIdx];

                if (food.isTarget && food.targetIdx === this.currentCharIdx) {
                    // ── 吃到正確的目標字 ──
                    this.snake.unshift(newHead);
                    this.bodyChars.push(food.char);   // push 確保頭→尾 = 詩句正序
                    this.foods.splice(foodIdx, 1);
                    this.currentCharIdx++;
                    this.hintStartTime = performance.now();  // 下一個目標字出現，重新計提示倒數

                    // 觸發逐格發光動畫（從頭節到尾節依序 brightness 1.5）
                    this.eatAnimStart = performance.now();
                    this.eatAnimSegCount = this.bodyChars.length;

                    // 加分（讀取 ScoreManager.gameSettings.game15.getPointA）
                    const pointA = window.ScoreManager?.gameSettings?.game15?.getPointA ?? 15;
                    this.score += pointA;
                    document.getElementById('game15-score').textContent = Math.floor(this.score);

                    if (window.SoundManager) window.SoundManager.playMelodyNote(this.currentCharIdx);
                    this.updateHintBar();

                    if (this.currentCharIdx >= this.targetChars.length) {
                        // 不立即結算，讓本幀先渲染龍頭覆蓋最後目標字的畫面
                        this.pendingWin = true;
                        return;
                    }
                    // 補充新的可見目標字與干擾字
                    this.spawnFoods();

                } else if (food.isTarget) {
                    // 吃到順序錯誤的目標字 → 失誤
                    this.snake.unshift(newHead);
                    this.snake.pop();
                    this.handleMistake('順序錯誤');

                } else {
                    // 干擾字 → 失誤
                    this.snake.unshift(newHead);
                    this.snake.pop();
                    this.handleMistake('干擾字');
                }

            } else {
                // 正常移動
                this.snake.unshift(newHead);
                this.snake.pop();
            }
        },

        // ================================================================
        // 統一失誤處理：扣心 → 龍頭閃爍2秒 → 回到起始位置
        // ================================================================
        handleMistake: function (reason) {
            if (window.SoundManager) window.SoundManager.playFailure();
            this.mistakeCount++;
            this.hearts = Math.max(0, this.maxMistakeCount - this.mistakeCount);
            this.updateHearts();

            if (this.mistakeCount >= this.maxMistakeCount) {
                this.gameOver(false, reason);
                return;
            }

            // 取消進行中的吃字動畫
            this.eatAnimStart = -1;

            // 暫停2秒，讓龍頭在碰撞處黃/紅閃爍，讓玩家清楚看見碰撞位置
            // 實際的蛇身重設延遲到暫停結束（在 startGameLoop 中執行）
            this.mistakePause = true;
            this.mistakePauseEnd = performance.now() + 2000;
            this.waitingForInput = true;  // 暫停結束後需重新輸入方向
        },

        // ================================================================
        // 統一勝敗流程（規格對應 gameOver(win, reason)）
        // ================================================================
        gameOver: function (win, reason) {
            this.isActive = false;
            this.stopGameLoop();
            // 失敗時寫入 game_logs（score=0，記錄本局時長）
            // 過關時 LOG 已由 ScoreManager.saveScore 負責寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 15,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game15-retryGame-btn').disabled = true;
                document.getElementById('game15-newGame-btn').disabled = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();
            } else {
                document.getElementById('game15-retryGame-btn').disabled = false;
                document.getElementById('game15-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
            }

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) {
                        // 挑戰模式：關卡編號遞增後繼續下一關
                        this.currentLevelIndex++;
                        this.startNewGame();
                    } else {
                        this.startNewGame();
                    }
                } else {
                    this.retryGame();
                }
            };

            const showMsg = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore ?? Math.floor(this.score)) : 0,
                        reason: win ? '' : (reason || '墨跡已散！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game15',
                    timerContainerId: 'game15-canvas-wrapper',
                    scoreElementId: 'game15-score',
                    heartsSelector: '#game15-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        // 挑戰模式：記錄關卡通關進度到 levelProgress
                        if (this.isLevelMode) {
                            const achId = window.ScoreManager.completeLevel('game15', this.difficulty, this.currentLevelIndex);
                            if (achId && window.AchievementDialog) {
                                window.AchievementDialog.showInstantAchievementPop(achId, 'game15', this.currentLevelIndex, showMsg);
                            } else {
                                showMsg(finalScore);
                            }
                        } else {
                            showMsg(finalScore);
                        }
                    }
                });
            } else {
                showMsg();
            }
        },

        // ================================================================
        // 更新 SVG 計時框（ratio 0→1）
        // ================================================================
        updateTimerBorder: function (ratio, mode) {
            const rect = document.getElementById('game15-timer-path');
            const wrapper = document.getElementById('game15-canvas-wrapper');
            const svg = document.getElementById('game15-timer-ring');
            if (!rect || !wrapper || !svg) return;

            let w = wrapper.offsetWidth || 500;
            let h = wrapper.offsetHeight || 700;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';

            const rw = w - 6;
            const rh = h - 6;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);

            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 刻意加亮倒數框
                rect.style.stroke = `hsla(0, 90%, 50%, ${Math.round(10 + 80 * elapsed)}%)`;
            }
            rect.classList.remove('game15-timer-urgent'); // 停用舊閃爍效果
        },

        // scoreManager 透過 updateTimerRing 呼叫，此 alias 轉發給 updateTimerBorder
        updateTimerRing: function (ratio, mode) { this.updateTimerBorder(ratio, mode); },

        // ================================================================
        // 生成食物：目標字懶加載分配格位，干擾字使用預分配固定格位
        // ================================================================
        spawnFoods: function () {
            const endIdx = Math.min(this.currentCharIdx + this.maxShowCount, this.targetChars.length);

            // 確保本次可見範圍內每個目標字的格位都已分配（懶加載）
            for (let i = this.currentCharIdx; i < endIdx; i++) {
                if (!this.targetFoodPositions[i]) {
                    this._assignTargetPosition(i);
                }
            }

            const snakeSet = new Set(this.snake.map(s => `${s.col},${s.row}`));

            // 可見目標字（從預分配格位讀取）
            // ★ 不過濾蛇身下的目標字：蛇身節段移走後目標字會自然重新出現；
            //   龍頭自碰檢測確保頭部無法直接到達被蛇身覆蓋的格位
            const targetFoods = [];
            const targetSet = new Set();
            for (let i = this.currentCharIdx; i < endIdx; i++) {
                const pos = this.targetFoodPositions[i];
                if (!pos) continue;
                const key = `${pos.col},${pos.row}`;
                targetFoods.push({
                    col: pos.col, row: pos.row,
                    char: this.targetChars[i],
                    isTarget: true,
                    targetIdx: i
                });
                targetSet.add(key);
            }

            // 干擾字：從預分配的固定格位讀取，排除被蛇身或目標字佔據的格
            const decoyFoods = (this.allDecoyFoods || []).filter(d => {
                const key = `${d.col},${d.row}`;
                return !snakeSet.has(key) && !targetSet.has(key);
            });

            this.foods = [...targetFoods, ...decoyFoods];
        },

        // ── 失誤後重建食物列表
        //    從 targetFoodPositions[] 完整重建目標字（確保蛇移開後目標字自然重現）
        refreshDecoys: function () {
            const endIdx = Math.min(this.currentCharIdx + this.maxShowCount, this.targetChars.length);

            // 確保可見範圍內格位都已分配
            for (let i = this.currentCharIdx; i < endIdx; i++) {
                if (!this.targetFoodPositions[i]) this._assignTargetPosition(i);
            }

            // 從預分配格位重建目標字（不依賴 this.foods，避免蛇身覆蓋時目標字被丟失）
            const targetFoods = [];
            const targetSet = new Set();
            for (let i = this.currentCharIdx; i < endIdx; i++) {
                const pos = this.targetFoodPositions[i];
                if (!pos) continue;
                targetFoods.push({
                    col: pos.col, row: pos.row,
                    char: this.targetChars[i],
                    isTarget: true,
                    targetIdx: i
                });
                targetSet.add(`${pos.col},${pos.row}`);
            }

            // 干擾字：固定格位，過濾被蛇身或目標字重疊的格
            const snakeSet = new Set(this.snake.map(s => `${s.col},${s.row}`));
            const decoyFoods = (this.allDecoyFoods || []).filter(d => {
                const key = `${d.col},${d.row}`;
                return !snakeSet.has(key) && !targetSet.has(key);
            });
            this.foods = [...targetFoods, ...decoyFoods];
        },

        // ================================================================
        // 取得干擾字（附備用字庫）
        // ================================================================
        getDecoyChars: function (excludeChars, count) {
            const excludeSet = new Set(Array.isArray(excludeChars) ? excludeChars : [excludeChars]);
            const charPool = new Set();

            if (window.POEMS) {
                window.POEMS.forEach(poem => {
                    if (!poem.content) return;
                    poem.content.forEach(line => {
                        line.split('').forEach(c => {
                            if (/[一-鿿]/.test(c) && !excludeSet.has(c)) charPool.add(c);
                        });
                    });
                });
            }

            // 備用字庫（防止高難度字池不足）
            if (charPool.size < count * 2) {
                '人之初性本善水火木金土山川雲風日月星天地花草樹石心志仁義禮智信忠孝悌廉恥勇敬讀書道德功名詩詞歌賦春夏秋冬東西南北'.split('').forEach(c => {
                    if (!excludeSet.has(c)) charPool.add(c);
                });
            }
            return this.shuffleArray([...charPool]).slice(0, count);
        },

        // ================================================================
        // 更新紅心 UI
        // ================================================================
        updateHearts: function () {
            const el = document.getElementById('game15-hearts');
            if (!el) return;
            let html = '';
            for (let i = 0; i < this.maxMistakeCount; i++) {
                // 剩餘命：紅心實心♥；已扣除：空心♡（顏色淡化）
                if (i < this.hearts) {
                    html += `<span class="heart">♥</span>`;
                } else {
                    html += `<span class="heart empty">♡</span>`;
                }
            }
            el.innerHTML = html;
        },

        // ================================================================
        // 更新詩文進度欄（同 game16 updateHint 寫法）
        // ================================================================
        updateHintBar: function () {
            const bar = document.getElementById('game15-hint-bar');
            if (!bar) return;
            bar.innerHTML = '';

            let globalIdx = 0;
            this.poemLines.forEach((line, lineIdx) => {
                // 句與句之間插入空隙（同 game16-hint-sep）
                if (lineIdx > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'game15-hint-sep';
                    bar.appendChild(sep);
                }
                line.forEach(char => {
                    const span = document.createElement('span');
                    span.className = 'game15-hint-char';
                    span.textContent = char;
                    if (globalIdx < this.currentCharIdx) {
                        span.dataset.state = 'done';
                    } else if (globalIdx === this.currentCharIdx) {
                        span.dataset.state = 'target';
                        span.id = 'game15-hint-current';
                    } else {
                        span.dataset.state = 'future';
                    }
                    bar.appendChild(span);
                    globalIdx++;
                });
            });

            // 自動水平捲動至目前目標字（同 game16）
            const current = document.getElementById('game15-hint-current');
            if (current) {
                current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        },

        // ================================================================
        // Canvas 繪製（每幀）
        // ================================================================
        renderCanvas: function () {
            const ctx = this.ctx;
            const W = this.CANVAS_W;
            const H = this.CANVAS_H;
            const C = this.CELL;
            const GX = this.GRID_X;
            const GY = this.GRID_Y;

            ctx.clearRect(0, 0, W, H);

            // ── 背景格線 ──
            // 格線透明度隨難度遞減
            // 小學：0.8（淡粉紅格，不干擾）
            // 中學：0.6（近乎消失）
            // 高中：0.4（只剩淡淡紋理）
            // 大學：0.2（幾乎隱形）
            // 研究所：0.0（幾乎看不見，只有邊框）
            const gt = this.difficultySettings[this.difficulty].gridTransparency;
            ctx.strokeStyle = `rgba(255, 220, 130, ${gt})`;
            ctx.lineWidth = 0.5;
            for (let c = 0; c <= this.COLS; c++) {
                ctx.beginPath();
                ctx.moveTo(GX + c * C, GY);
                ctx.lineTo(GX + c * C, GY + this.ROWS * C);
                ctx.stroke();
            }
            for (let r = 0; r <= this.ROWS; r++) {
                ctx.beginPath();
                ctx.moveTo(GX, GY + r * C);
                ctx.lineTo(GX + this.COLS * C, GY + r * C);
                ctx.stroke();
            }

            // ── 每幀時間戳（供吃字動畫 + showHint 倒數共用）──
            const now = performance.now();

            // ── 食物（目標字 + 干擾字）──
            const pulse = 0.55 + 0.45 * Math.sin(this.pulsePhase);
            // 可見目標字範圍（用於 showFadding 計算）
            const endIdx = Math.min(this.currentCharIdx + this.maxShowCount, this.targetChars.length);
            const totalVisible = endIdx - this.currentCharIdx;

            // 白底黑字（通用）
            const drawFoodCell = (char, fx, fy) => {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.93)';
                this.fillRoundRect(ctx, fx + 2, fy + 2, C - 4, C - 4, 6);
                ctx.fillStyle = 'hsl(0, 0%, 8%)';
                ctx.font = `bold ${Math.floor(C * 0.77)}px 'Noto Serif TC', serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(char, fx + C / 2, fy + C / 2 + 1);
            };

            // 黃底閃爍（showHint 當前目標字）
            const drawHintCell = (char, fx, fy) => {
                const bright = 48 + pulse * 14;
                ctx.fillStyle = `hsla(50, 100%, ${bright}%, 0.96)`;
                this.fillRoundRect(ctx, fx + 2, fy + 2, C - 4, C - 4, 6);
                ctx.strokeStyle = `rgba(255, 230, 0, ${0.5 + pulse * 0.5})`;
                ctx.lineWidth = 2;
                this.strokeRoundRect(ctx, fx + 2, fy + 2, C - 4, C - 4, 6);
                ctx.fillStyle = 'hsl(0, 0%, 5%)';
                ctx.font = `bold ${Math.floor(C * 0.80)}px 'Noto Serif TC', serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(char, fx + C / 2, fy + C / 2 + 1);
            };

            // 漸隱（showFadding 超出範圍的目標字：50%灰底、白字，統一不漸變）
            const drawFadedCell = (char, fx, fy) => {
                ctx.fillStyle = 'hsl(0, 0%, 50%)';   // 50% 灰色底
                this.fillRoundRect(ctx, fx + 2, fy + 2, C - 4, C - 4, 6);
                ctx.fillStyle = 'hsl(0, 0%, 75%)';  // 75% 白色字
                ctx.font = `bold ${Math.floor(C * 0.77)}px 'Noto Serif TC', serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(char, fx + C / 2, fy + C / 2 + 1);
            };

            this.foods.forEach(food => {
                const fx = GX + food.col * C;
                const fy = GY + food.row * C;
                const visPos = food.isTarget ? food.targetIdx - this.currentCharIdx : -1;

                // showHint（秒數）：當前目標字在 showHint 秒內以金黃底色顯示，時間到後回復白底黑字
                const hintElapsedS = (now - this.hintStartTime) / 1000;
                const isHinted = food.isTarget && visPos === 0 && this.showHint > 0 && hintElapsedS < this.showHint;
                // showFadding：目標字超出前 N 個 → 50%灰底白字（統一，不漸變）
                const isFaded = this.showFadding > 0 && food.isTarget && visPos >= this.showFadding;

                if (isHinted) {
                    drawHintCell(food.char, fx, fy);
                } else if (isFaded) {
                    drawFadedCell(food.char, fx, fy);
                } else {
                    drawFoodCell(food.char, fx, fy);
                }
            });

            // ── 蛇身（snake[1] 以後，彩虹龍，吃到字後逐節發光）──
            // bodyChars 以 push 累積：bodyChars[0]=第1個吃到的字
            // snake[i] 對應 bodyChars[i-1]，頭→尾 = 詩序
            const totalBody = this.snake.length - 1;

            // 計算吃到字後的逐格發光動畫狀態
            const eatElapsed = this.eatAnimStart >= 0 ? now - this.eatAnimStart : -1;
            // 動畫完成後自動關閉
            if (eatElapsed >= 0 && eatElapsed > this.eatAnimSegCount * this.EAT_ANIM_PER_SEG + 100) {
                this.eatAnimStart = -1;
            }
            // 當前應發光的節索引（1-based，從頭節 i=1 到尾節 i=totalBody）
            const litSegIdx = eatElapsed >= 0
                ? Math.floor(eatElapsed / this.EAT_ANIM_PER_SEG) + 1
                : -1;

            for (let i = totalBody; i >= 1; i--) {
                const seg = this.snake[i];
                const sx = GX + seg.col * C;
                const sy = GY + seg.row * C;
                const scx = sx + C / 2;
                const scy = sy + C / 2;
                const char = this.bodyChars[i - 1] || '';

                // 彩虹 hue：head側(i=1) → 0°(紅)，tail側 → 270°(紫)
                const hue = Math.round(((i - 1) / Math.max(totalBody, 1)) * 270);
                const isLit = litSegIdx === i;  // 本節是否在發光動畫中

                if (isLit) {
                    ctx.save();
                    ctx.filter = 'brightness(3.0)';  // 300% 亮度（桌面效果）
                }
                ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
                this.fillRoundRect(ctx, sx + 2, sy + 2, C - 4, C - 4, 5);
                if (char) {
                    ctx.fillStyle = `hsl(${(hue + 180) % 360}, 80%, 10%)`;
                    ctx.font = `bold ${Math.floor(C * 0.72)}px 'Noto Serif TC', serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(char, scx, scy + 1);
                }
                if (isLit) {
                    // 白色粗邊框（5px）：手機若不支援 filter 時的備援發光效果，兩者同時呈現
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                    ctx.lineWidth = 5;
                    this.strokeRoundRect(ctx, sx + 2, sy + 2, C - 4, C - 4, 5);
                    ctx.restore();
                }
            }

            // ── 蛇頭（snake[0]）：黃色空心方框 ──
            if (this.snake.length > 0) {
                const head = this.snake[0];
                const hx = GX + head.col * C;
                const hy = GY + head.row * C;

                // 半透明背景（讓下方食物字可透視）
                ctx.fillStyle = 'rgba(255, 220, 50, 0.06)';
                this.fillRoundRect(ctx, hx + 1, hy + 1, C - 2, C - 2, 8);

                // 失誤暫停期間：黃/紅框快速閃爍（每150ms切換）
                if (this.mistakePause) {
                    const flashOn = Math.floor(performance.now() / 150) % 2 === 0;
                    ctx.strokeStyle = flashOn
                        ? 'rgba(255, 220, 50, 0.95)'   // 黃框
                        : 'rgba(255, 55, 45, 0.95)';   // 紅框
                } else {
                    ctx.strokeStyle = 'rgba(255, 220, 50, 0.95)';  // 常態：黃框
                }
                ctx.lineWidth = 2.5;
                this.strokeRoundRect(ctx, hx + 1, hy + 1, C - 2, C - 2, 8);
            }

            // ── 等待輸入時顯示提示文字 ──
            if (this.waitingForInput && this.isActive && !this.mistakePause) {
                const tipY = GY + (this.START_ROW - 2) * C + C / 2;
                ctx.fillStyle = 'hsla(150, 50%, 75%, 1.00)';
                ctx.font = `bold 32px 'Noto Serif TC', serif`;
                ctx.strokeStyle = 'hsla(48, 100%, 0%, 0.66)';
                ctx.lineWidth = 6;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.strokeText('以手指朝 上 下 左 右 滑動', W / 2, tipY); // 若需要描邊
                ctx.fillText('以手指朝 上 下 左 右 滑動', W / 2, tipY);
            }
        },

        // ── Canvas 輔助：圓角填充 ──
        fillRoundRect: function (ctx, x, y, w, h, r) {
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, w, h, r);
            } else {
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
            }
            ctx.fill();
        },

        // ── Canvas 輔助：圓角描邊 ──
        strokeRoundRect: function (ctx, x, y, w, h, r) {
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, w, h, r);
            } else {
                ctx.moveTo(x + r, y);
                ctx.lineTo(x + w - r, y);
                ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                ctx.lineTo(x + w, y + h - r);
                ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                ctx.lineTo(x + r, y + h);
                ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                ctx.lineTo(x, y + r);
                ctx.quadraticCurveTo(x, y, x + r, y);
                ctx.closePath();
            }
            ctx.stroke();
        },

        // ================================================================
        // 輸入設定：觸控滑動 + 鍵盤
        // 說明：D-pad 箭頭圖形純作裝飾（指引視覺），不綁定任何點擊事件。
        //       手機以手指在畫布上滑動可達最佳操作體驗；桌面以鍵盤方向鍵操控。
        // ================================================================
        setupInput: function () {
            const canvas = document.getElementById('game15-canvas');

            // 觸控滑動
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                // 玩家首次碰觸畫布，啟動 D-pad 淡出倒數（10 秒後開始淡出）
                this._startDpadFadeTimer();
            }, { passive: false });

            canvas.addEventListener('touchend', (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                const dx = e.changedTouches[0].clientX - this.touchStartX;
                const dy = e.changedTouches[0].clientY - this.touchStartY;
                if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
                this.processSwipe(dx, dy);
            }, { passive: false });

            // 鍵盤
            window.addEventListener('keydown', (e) => {
                if (!this.isActive) return;
                switch (e.key) {
                    case 'ArrowUp': case 'w': case 'W':
                        this._startDpadFadeTimer();
                        this.tryChangeDirection(0, -1); e.preventDefault(); break;
                    case 'ArrowDown': case 's': case 'S':
                        this._startDpadFadeTimer();
                        this.tryChangeDirection(0, 1); e.preventDefault(); break;
                    case 'ArrowLeft': case 'a': case 'A':
                        this._startDpadFadeTimer();
                        this.tryChangeDirection(-1, 0); e.preventDefault(); break;
                    case 'ArrowRight': case 'd': case 'D':
                        this._startDpadFadeTimer();
                        this.tryChangeDirection(1, 0); e.preventDefault(); break;
                }
            });

            // D-pad 按鈕僅作裝飾，不綁定任何事件
            // （手機改用畫布滑動；桌面改用鍵盤方向鍵）
        },

        // ── 依滑動位移向量判斷主要方向（比較水平/垂直位移絕對值，取較大者為滑動方向）──
        processSwipe: function (dx, dy) {
            if (Math.abs(dx) >= Math.abs(dy)) {
                this.tryChangeDirection(dx > 0 ? 1 : -1, 0);
            } else {
                this.tryChangeDirection(0, dy > 0 ? 1 : -1);
            }
        },

        // ── D-pad 淡出：玩家首次滑動後 10 秒開始，5 秒淡至全透明 ──
        _startDpadFadeTimer: function () {
            // 本局已啟動過，不重複計時
            if (this._dpadFadeStarted) return;
            this._dpadFadeStarted = true;

            this.dpadFadeTimeoutId = setTimeout(() => {
                const dpad = document.getElementById('game15-dpad');
                if (dpad) {
                    // 設定過渡動畫再歸零透明度
                    dpad.style.transition = 'opacity 5s ease';
                    dpad.style.opacity = '0';
                }
                this.dpadFadeTimeoutId = null;
            }, 10000);  // 10 秒後開始淡出
        },

        // ── 嘗試改變方向（禁止 180° 迴轉，失誤暫停期間忽略輸入）──
        tryChangeDirection: function (dc, dr) {
            // 失誤暫停期間忽略所有方向輸入，防止暫停結束後龍立刻衝出去
            if (this.mistakePause) return;
            // 禁止直接掉頭（若蛇長度 > 1）
            if (this.snake.length > 1 &&
                dc === -this.direction.dc && dr === -this.direction.dr) return;
            this.nextDirection = { dc, dr };
            this.waitingForInput = false;   // 有了方向輸入，蛇開始移動
        },

        // ── 費雪-耶茨（Fisher-Yates）洗牌演算法：回傳打亂順序後的新陣列副本 ──
        shuffleArray: function (array) {
            const a = [...array];
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        }
    };

    // ── 掛載全域物件 ──
    window.Game15 = Game15;

    // URL 自動啟動（?game=15）
    document.addEventListener('DOMContentLoaded', () => {
        if (new URLSearchParams(window.location.search).get('game') === '15') {
            setTimeout(() => {
                if (window.Game15) window.Game15.show();
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 50);
        }
    });

})();
