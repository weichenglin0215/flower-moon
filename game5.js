/* game5.js - 詩詞小精靈 (Poetry Pac-Man) */

(function () {
    'use strict';

    const Game5 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakes: 0,
        maxMistakes: 5,
        timer: 0,
        maxTimer: 0,
        timerInterval: null,

        // Maze configuration
        gridSize: 20, // pixels per cell (will be adjusted)
        rows: 21,
        cols: 19,
        maze: [], // 2D array: 0 = path, 1 = wall

        // Entities
        player: null,
        monsters: [],
        playerPath: [], // 記錄玩家經過的最後 4 個網格位置
        isGhostHouseClosed: false, // 基地是否已封裝為牆壁
        foods: [], // { char, row, col, index }
        collectedCount: 0,
        targetPoem: null,
        targetChars: [], // The characters to collect in order

        // Effects
        trails: [], // {x, y, alpha}

        // Animation
        requestID: null,
        lastTime: 0,

        // Input
        touchStart: { x: 0, y: 0 },
        minSwipeDist: 30,

        // 放大倍率調整 (1.0 = 充滿寬度, 2.0 = 雙倍寬度)
        mapScale: 1.0,

        // 撞擊錯誤文字時的停頓時間 (毫秒)
        mistakePenaltyDuration: 150,
        //time遊戲時間，heart生命數，monster怪物數，star詩詞星等，answerLen答案長度，hintDuration下一個文字黃色發光提示時間, lostInt 負值縮短小精靈們頭暈間隔時間表示越弱，lostDur 正值延長小精靈們持續頭昏時間表示越弱。
        difficultySettings: {
            '小學': { time: 120, hearts: 5, monsters: 2, stars: 6, answerLen: 5, hintDuration: -1, lostInt: -2000, lostDur: 1500 },
            '中學': { time: 120, hearts: 3, monsters: 3, stars: 5, answerLen: 7, hintDuration: -1, lostInt: -1000, lostDur: 1000 },
            '高中': { time: 120, hearts: 3, monsters: 4, stars: 4, answerLen: 10, hintDuration: -1, lostInt: -500, lostDur: 500 },
            '大學': { time: 120, hearts: 3, monsters: 4, stars: 3, answerLen: 14, hintDuration: -1, lostInt: 0, lostDur: 0 },
            '研究所': { time: 120, hearts: 3, monsters: 4, stars: 2, answerLen: 14, hintDuration: -1, lostInt: 0, lostDur: 0 }
        },

        // Maze layout (1 = wall, 0 = path, 2 = ghost house)
        mazeLayout: [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
            [1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1],
            [1, 1, 1, 1, 0, 1, 0, 1, 2, 2, 2, 1, 0, 1, 0, 1, 1, 1, 1], // Warp tunnel row
            [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1],
            [1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
            [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ],

        init: function () {
            if (document.getElementById('game5-container')) return;
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const container = document.createElement('div');
            container.id = 'game5-container';
            container.className = 'game5-overlay aspect-5-8 hidden';
            container.innerHTML = `
                <div class="game5-header">
                    <div class="game5-score-board">分數: <span id="game5-score">0</span></div>
                    <div class="game5-controls">
                        <button id="game5-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game5-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                
                <div class="game5-sub-header">
                    <div id="game5-hearts" class="game5-hearts"></div>
                </div>
                <div id="game5-target-poem" class="game5-target-poem">
                </div>

                <div class="game5-maze-container">
                    <svg id="game5-timer-ring">
                        <rect id="game5-timer-path" x="3" y="3"></rect>
                    </svg>
                    <canvas id="game5-canvas"></canvas>
                </div>
                
                <div class="game5-ui-area">
                    <div class="game5-difficulty-tag" id="game5-diff-tag">小學</div>
                    <div id="game5-timer" class="game5-timer-container">時間：--</div>
                    <div class="game5-instruction">滑動螢幕改變方向</div>
                </div>
                
                <div id="game5-message" class="game5-message hidden">
                    <h2 id="game5-msg-title">訊息</h2>
                    <div id="game5-msg-poem-info" class="game5-msg-poem-info"></div>
                    <p id="game5-msg-content"></p>
                    <button id="game5-msg-btn" class="game5-msg-btn">繼續</button>
                </div>
            `;
            document.body.appendChild(container);

            this.canvas = document.getElementById('game5-canvas');
            this.ctx = this.canvas.getContext('2d');
        },

        bindEvents: function () {
            document.getElementById('game5-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game5-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game5-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game5-message').classList.add('hidden');
                if (this.isWin) this.startNewGame();
                else this.retryGame();
            };
            const msgPoemInfo = document.getElementById('game5-msg-poem-info');
            msgPoemInfo.onclick = () => {
                if (this.targetPoem) {
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    if (window.openPoemDialogById) window.openPoemDialogById(this.targetPoem.id);
                }
            };

            // Mouse Swipe
            let isMouseDown = false;
            let mouseStart = { x: 0, y: 0 };
            const container = document.getElementById('game5-container');

            container.addEventListener('mousedown', (e) => {
                isMouseDown = true;
                mouseStart.x = e.clientX;
                mouseStart.y = e.clientY;
            });

            window.addEventListener('mousemove', (e) => {
                if (!isMouseDown) return;
                const dx = e.clientX - mouseStart.x;
                const dy = e.clientY - mouseStart.y;
                if (Math.abs(dx) > this.minSwipeDist || Math.abs(dy) > this.minSwipeDist) {
                    if (Math.abs(dx) > Math.abs(dy)) this.handleInput(dx > 0 ? 'RIGHT' : 'LEFT');
                    else this.handleInput(dy > 0 ? 'DOWN' : 'UP');
                    isMouseDown = false; // 觸發後重置
                }
            });

            window.addEventListener('mouseup', () => isMouseDown = false);

            // Touch Swipe
            container.addEventListener('touchstart', (e) => {
                this.touchStart.x = e.touches[0].clientX;
                this.touchStart.y = e.touches[0].clientY;
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (!this.isActive) return;
                const dx = e.touches[0].clientX - this.touchStart.x;
                const dy = e.touches[0].clientY - this.touchStart.y;
                if (Math.abs(dx) > this.minSwipeDist || Math.abs(dy) > this.minSwipeDist) {
                    if (Math.abs(dx) > Math.abs(dy)) this.handleInput(dx > 0 ? 'RIGHT' : 'LEFT');
                    else this.handleInput(dy > 0 ? 'DOWN' : 'UP');

                    this.touchStart.x = e.touches[0].clientX;
                    this.touchStart.y = e.touches[0].clientY;
                }
            }, { passive: true });

            // Keyboard for testing
            window.addEventListener('keydown', (e) => {
                if (!this.isActive) return;
                switch (e.key) {
                    case 'ArrowUp': this.handleInput('UP'); break;
                    case 'ArrowDown': this.handleInput('DOWN'); break;
                    case 'ArrowLeft': this.handleInput('LEFT'); break;
                    case 'ArrowRight': this.handleInput('RIGHT'); break;
                }
            });
        },

        setupMaze: function () {
            this.rows = this.mazeLayout.length;
            this.cols = this.mazeLayout[0].length;
            this.maze = this.mazeLayout.map(row => [...row]);

            // 取得容器寬度
            const mazeCont = document.querySelector('.game5-maze-container');
            const cw = mazeCont.offsetWidth || document.getElementById('game5-container').offsetWidth;

            // 計算格子大小：滿版寬度除以總欄數，再乘以放大倍率
            // 修改此處的 this.mapScale 即可控制地圖放大倍率
            this.gridSize = Math.floor(cw / this.cols) * this.mapScale;

            this.canvas.width = this.cols * this.gridSize;
            this.canvas.height = this.rows * this.gridSize;

            this.updateTimerRing(1);

            // 動態找出傳送道所在的列
            this.warpRowIndex = -1;
            for (let r = 0; r < this.rows; r++) {
                if (this.maze[r][0] === 0 && this.maze[r][this.cols - 1] === 0) {
                    this.warpRowIndex = r;
                    break;
                }
            }
        },

        handleInput: function (dir) {
            if (!this.isActive || !this.player) return;
            this.player.nextDir = dir;
        },

        show: function () {
            this.init();

            // 修正第一次載入時，AboutDialog 尚未完全消失導致 UI 遮擋的問題
            // 如果 AboutDialog 還在 DOM 中且正在顯示，先強制隱藏
            const intro = document.getElementById('introOverlay');
            if (intro && !intro.classList.contains('hidden')) {
                intro.classList.add('hidden', 'hide-fade');
                document.body.classList.remove('overlay-active');
            }

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩詞小精靈', (level) => {
                    this.difficulty = level;
                    const settings = this.difficultySettings[level];
                    this.maxMistakes = settings.hearts;
                    this.maxTimer = settings.time;

                    document.getElementById('game5-container').classList.remove('hidden');
                    document.body.classList.add('overlay-active');

                    // 必須在顯示容器後才計算地圖大小，否則 offsetWidth 會是 0
                    this.setupMaze();
                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            }
        },

        startNewGame: function () {
            document.getElementById('game5-diff-tag').textContent = this.difficulty;
            this.score = 0;
            this.mistakes = 0;
            this.collectedCount = 0;
            this.isDying = false; // 確保重啟時狀態重置
            this.preparePoem();
            this.resetEntities();
            this.startTimer();
            this.isActive = true;
            this.isWin = false;
            document.getElementById('game5-score').textContent = '0';
            document.getElementById('game5-message').classList.add('hidden');
            this.renderHearts();
            this.renderTargetPoem();

            this.lastTime = performance.now();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            // 所有遊戲資源準備完畢後才啟用重來按鈕
            document.getElementById('game5-retryGame-btn').disabled = false;
            document.getElementById('game5-newGame-btn').disabled = false;
            this.gameLoop(this.lastTime);
        },

        retryGame: function () {
            this.mistakes = 0;
            this.collectedCount = 0;
            this.resetEntities();
            this.startTimer();
            this.isActive = true;
            document.getElementById('game5-message').classList.add('hidden');
            this.renderHearts();
            // Reset food visibility
            this.foods.forEach(f => f.collected = false);

            // 重置完成後才啟用重來按鈕
            document.getElementById('game5-retryGame-btn').disabled = false;
            document.getElementById('game5-newGame-btn').disabled = false;
            this.lastTime = performance.now();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.gameLoop(this.lastTime);
        },

        preparePoem: function () {
            if (typeof POEMS === 'undefined') return;
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.stars || 4;

            // 使用共用邏輯取得隨機詩詞
            const result = getSharedRandomPoem(minRating, 4, 8, 20, 200);
            if (!result) return;

            const poem = result.poem;
            this.targetPoem = poem;

            // 從 getSharedRandomPoem 找到的起始句開始挑選 (僅挑選單數句子：1, 3, 5...)
            let fullStr = "";
            let startLineIndex = result.startIndex;
            for (let i = startLineIndex; i < poem.content.length; i += 2) {
                fullStr += poem.content[i].replace(/[，。？！、：；「」『』\s]/g, '');
                if (fullStr.length > settings.answerLen) break;
            }

            // 如果從 random 開始湊不夠，從頭開始湊 (僅挑選單數句子)
            if (fullStr.length <= settings.answerLen) {
                fullStr = "";
                for (let i = 0; i < poem.content.length; i += 2) {
                    fullStr += poem.content[i].replace(/[，。？！、：；「」『』\s]/g, '');
                    if (fullStr.length > settings.answerLen) break;
                }
            }

            // [優化] 限制總字數最高為 16 字，避免介面位置排版錯誤
            if (fullStr.length > 16) {
                fullStr = fullStr.substring(fullStr.length - 16);
            }

            // 分割為題目(提示)與答案(迷宮字)
            const totalLen = fullStr.length;
            const promptStr = fullStr.substring(0, totalLen - settings.answerLen);
            const answerStr = fullStr.substring(totalLen - settings.answerLen);

            this.promptChars = promptStr.split('');
            this.targetChars = answerStr.split('');
            this.hintStartTime = Date.now(); // 記錄當前提示開始時間

            // 分散放置食物 (劃分地圖為四個象限)
            this.foods = [];
            const quadrants = [[], [], [], []]; // [TL, TR, BL, BR]
            const midR = Math.floor(this.rows / 2);
            const midC = Math.floor(this.cols / 2);

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.maze[r][c] === 0 && !this.isGhostHouse(r, c)) {
                        let qIdx = 0;
                        if (r < midR) qIdx = (c < midC ? 0 : 1);
                        else qIdx = (c < midC ? 2 : 3);
                        quadrants[qIdx].push({ r, c });
                    }
                }
            }

            // 平均分配到各象限
            this.targetChars.forEach((char, index) => {
                const qIdx = index % 4; // 依序取 0,1,2,3 象限
                const pool = quadrants[qIdx];
                if (pool.length > 0) {
                    const posIdx = Math.floor(Math.random() * pool.length);
                    const pos = pool.splice(posIdx, 1)[0];
                    this.foods.push({
                        char: char,
                        row: pos.r,
                        col: pos.c,
                        index: index,
                        collected: false
                    });
                } else {
                    // 若象限沒位置，找隨機剩餘位置
                    const allRemaining = quadrants.flat();
                    const posIdx = Math.floor(Math.random() * allRemaining.length);
                    const pos = allRemaining.splice(posIdx, 1)[0];
                    this.foods.push({ char, row: pos.r, col: pos.c, index, collected: false });
                }
            });
        },

        isGhostHouse: function (r, c) {
            return this.mazeLayout[r][c] === 2;
        },

        resetEntities: function () {
            this.openGhostHouse(); // 開啟基地供怪物出發
            this.isDying = false;
            this.deathStartTime = 0;
            this.trails = [];
            this.playerPath = []; // 重置路徑記錄

            // Player starts at bottom center
            this.player = {
                x: 9 * this.gridSize + this.gridSize / 2,
                y: 15 * this.gridSize + this.gridSize / 2,
                dir: 'LEFT',
                nextDir: 'LEFT',
                speedDefault: this.gridSize * 0.08, // 黃色小球預設速度
                speed: this.gridSize * 0.08, // 黃色小球當前速度
                radius: this.gridSize * 0.5
            };

            // Monsters start in cage (row 9, col 8-10)
            this.monsters = [];
            const settings = this.difficultySettings[this.difficulty];
            const ghostSpawns = [{ r: 9, c: 8 }, { r: 9, c: 9 }, { r: 9, c: 10 }, { r: 9, c: 9 }];

            // 定義四隻小精靈的特色與參數
            const ghostConfigs = [
                { ai: 'chase', color: 'hsl(0, 100%, 50%)', lostInt: 6000, lostDur: 1000 }, // 紅: 追擊
                { ai: 'trail', color: 'hsl(180, 100%, 75%)', lostInt: 3000, lostDur: 1500 }, // 淺藍: 跟蹤
                { ai: 'ambush', color: 'hsl(120, 100%, 50%)', lostInt: 4000, lostDur: 2000 }, // 綠: 伏擊
                { ai: 'distant', color: 'hsl(280, 100%, 60%)', lostInt: 3000, lostDur: 2500 }  // 紫: 遠距離追擊
            ];

            for (let i = 0; i < settings.monsters; i++) {
                const config = ghostConfigs[i % ghostConfigs.length];
                const spawn = ghostSpawns[i % ghostSpawns.length];
                this.monsters.push({
                    x: spawn.c * this.gridSize + this.gridSize / 2,
                    y: spawn.r * this.gridSize + this.gridSize / 2,
                    dir: 'UP',
                    speed: this.player.speed * 0.7, // 速度預設為玩家的 0.7
                    color: config.color,
                    ai: config.ai,
                    lastLostTime: Date.now() + Math.random() * 3000, // 初始恍神時間隨機偏移
                    lostInterval: config.lostInt + settings.lostInt, // 間隔觸發時間，加上難度設定的時間
                    lostDuration: config.lostDur + settings.lostDur, // 觸發後的恍神時間，加上難度設定的時間
                    isStunned: false
                });
            }
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            if (this.maxTimer <= 0) {
                document.getElementById('game5-timer').textContent = '時間：不限時';
                this.updateTimerRing(1);
                return;
            }
            this.timer = this.maxTimer;
            this.updateTimerUI();
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                this.timer = Math.ceil(this.maxTimer - (elapsed / 1000));
                this.updateTimerUI();

                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        updateTimerUI: function () {
            // Text timer update
            const el = document.getElementById('game5-timer');
            if (this.timer <= 10) el.style.color = 'red';
            else el.style.color = '';
            el.textContent = `時間：${this.timer < 0 ? '--' : this.timer + 's'}`;
        },

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game5-timer-path');
            const container = document.querySelector('.game5-maze-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game5-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            rect.setAttribute('width', Math.max(0, w - 6));
            rect.setAttribute('height', Math.max(0, h - 6));

            const perimeter = (Math.max(0, w - 6) + Math.max(0, h - 6)) * 2;
            rect.style.strokeDasharray = perimeter;
            // Counter-clockwise: reverse the offset logic
            // Start from top-right or top-center? Pacman usually start top-left for rects.
            // Game 4 logic: perimeter * (1 - ratio)
            rect.style.strokeDashoffset = perimeter * (1 - ratio);

            // For counter-clockwise, we can use transform scaleX(-1) or just flip the ratio
            // But if we want it to "shrink" counter-clockwise, it's about the dashoffset.
            rect.style.transform = 'scaleX(1)';
            rect.style.transformOrigin = 'center';
        },

        renderHearts: function () {
            const cont = document.getElementById('game5-hearts');
            cont.innerHTML = '';
            for (let i = 0; i < this.maxMistakes; i++) {
                const span = document.createElement('span');
                span.className = 'heart' + (i < this.mistakes ? ' empty' : '');
                span.textContent = i < this.mistakes ? '♡' : '♥';
                cont.appendChild(span);
            }
        },

        renderTargetPoem: function () {
            const cont = document.getElementById('game5-target-poem');
            let html = this.promptChars.map(c => `<span class="game5-char-hint prompt">${c}</span>`).join('');
            html += this.targetChars.map((c, i) =>
                `<span class="game5-char-hint answer ${i === 0 ? 'active' : ''}" id="hint-${i}">${c}</span>`
            ).join('');
            cont.innerHTML = html;
        },

        gameLoop: function (now) {
            if (!this.isActive) return;
            const dt = now - this.lastTime;
            this.lastTime = now;

            this.update(dt);
            this.draw();

            this.requestID = requestAnimationFrame((t) => this.gameLoop(t));
        },

        update: function (dt) {
            if (!this.isDying) {
                this.moveEntity(this.player, true);
                this.updatePlayerPath(); // 更新玩家歷史路徑
                this.monsters.forEach(m => this.moveMonster(m));
                this.checkCollisions();

                // 檢查是否所有小精靈都已離開基地
                if (!this.isGhostHouseClosed && this.monsters.length > 0) {
                    const anyInside = this.monsters.some(m => this.isInsideGhostHouse(m.x, m.y));
                    if (!anyInside) {
                        this.closeGhostHouse();
                    }
                }
            }
        },

        moveEntity: function (ent, isPlayer) {
            const gridMid = this.gridSize / 2;
            const gp = this.getGridPos(ent.x, ent.y);
            const centerX = gp.c * this.gridSize + gridMid;
            const centerY = gp.r * this.gridSize + gridMid;

            // 檢查是否處於中心點附近 (用於轉彎)
            // 增加容差 (Tolerance) 確保在接近路口時即可預約轉向
            const turnTolerance = this.gridSize * 0.45;
            const offX = ent.x - centerX;
            const offY = ent.y - centerY;
            const isNearCenter = Math.abs(offX) < turnTolerance && Math.abs(offY) < turnTolerance;

            // 處理轉向 (包含預約轉向 nextDir)
            if (isNearCenter && ent.nextDir && ent.nextDir !== ent.dir) {
                if (this.canMoveFromCell(gp.r, gp.c, ent.nextDir, isPlayer)) {
                    // 轉向時對齊中線，避免卡進牆壁
                    ent.x = centerX;
                    ent.y = centerY;
                    ent.dir = ent.nextDir;
                    ent.nextDir = null;
                }
            }

            // 自動校準中線 (Alignment)：垂直走位時修正水平偏移，反之亦然
            // 這能確保玩家即使微偏也能順暢通過窄道而不卡住
            const alignSpeed = ent.speed * 0.8;
            if (ent.dir === 'UP' || ent.dir === 'DOWN') {
                if (Math.abs(offX) < alignSpeed) ent.x = centerX;
                else ent.x += (offX > 0 ? -alignSpeed : alignSpeed);
            } else if (ent.dir === 'LEFT' || ent.dir === 'RIGHT') {
                if (Math.abs(offY) < alignSpeed) ent.y = centerY;
                else ent.y += (offY > 0 ? -alignSpeed : alignSpeed);
            }

            // 移動
            let nextX = ent.x;
            let nextY = ent.y;
            if (ent.dir === 'UP') nextY -= ent.speed;
            if (ent.dir === 'DOWN') nextY += ent.speed;
            if (ent.dir === 'LEFT') nextX -= ent.speed;
            if (ent.dir === 'RIGHT') nextX += ent.speed;

            // 傳送道邏輯 (支援動態列索引)
            const isWarpRow = gp.r === this.warpRowIndex;

            if (isWarpRow && (nextX < 0 || nextX > this.canvas.width)) {
                if (nextX < -ent.speed) ent.x = this.canvas.width;
                else if (nextX > this.canvas.width + ent.speed) ent.x = 0;
                else ent.x = nextX;
            } else if (this.canMove(nextX, nextY, ent.dir, isPlayer)) {
                ent.x = nextX;
                ent.y = nextY;

                // 玩家墨跡效果
                if (isPlayer && Math.random() < 0.3) {
                    this.trails.push({ x: ent.x, y: ent.y, alpha: 0.5 });
                }
            } else {
                // 撞牆了
                if (!isPlayer) {
                    // 怪物撞牆後隨機轉向
                    ent.dir = this.getRandomValidDir(gp.r, gp.c);
                }
            }
        },

        moveMonster: function (m) {
            const gp = this.getGridPos(m.x, m.y);
            const gridMid = this.gridSize / 2;
            const offX = Math.abs(m.x - (gp.c * this.gridSize + gridMid));
            const offY = Math.abs(m.y - (gp.r * this.gridSize + gridMid));
            const isAtCenter = offX < m.speed && offY < m.speed;

            // 更新恍神狀態邏輯 (Lost/Stunned state)
            const now = Date.now();
            if (m.isStunned) {
                if (now - m.lostTriggerTime > m.lostDuration) {
                    m.isStunned = false;
                    m.lastLostTime = now;
                }
            } else {
                if (now - m.lastLostTime > m.lostInterval) {
                    m.isStunned = true;
                    m.lostTriggerTime = now;
                }
            }

            if (isAtCenter) {
                const options = this.getAvailableDirs(gp.r, gp.c, m.dir);
                const pg = this.getGridPos(this.player.x, this.player.y);
                const distToPlayer = Math.abs(gp.r - pg.r) + Math.abs(gp.c - pg.c);

                if (options.length > 0) {
                    // 如果恍神或是路徑只有一條，隨機或順著走
                    if (m.isStunned || options.length === 1) {
                        m.dir = options[Math.floor(Math.random() * options.length)];
                    } else {
                        // 根據小精靈特色決定目標格子 (Target Tile)
                        let targetR = pg.r;
                        let targetC = pg.c;

                        if (m.ai === 'trail') { // 淺藍: 跟蹤包抄
                            if (distToPlayer >= 6 && this.playerPath.length > 0) {
                                // 目標是玩家 4 步前的位置
                                const pNode = this.playerPath[0];
                                targetR = pNode.r;
                                targetC = pNode.c;
                            }
                            // 距離小於 6 直接追擊
                        } else if (m.ai === 'ambush') { // 綠: 伏擊前方
                            if (distToPlayer >= 6) {
                                // 推測未來 5 格位置
                                const offsets = { 'UP': [-5, 0], 'DOWN': [5, 0], 'LEFT': [0, -5], 'RIGHT': [0, 5] };
                                const off = offsets[this.player.dir] || [0, 0];
                                targetR = Math.max(0, Math.min(this.rows - 1, pg.r + off[0]));
                                targetC = Math.max(0, Math.min(this.cols - 1, pg.c + off[1]));
                            }
                            // 距離小於 6 直接追擊
                        } else if (m.ai === 'distant') { // 紫: 遠距離追擊
                            if (distToPlayer < 9) {
                                // 距離小於 9 則在路口自由選擇方向 (隨機)
                                m.dir = options[Math.floor(Math.random() * options.length)];
                                this.moveEntity(m, false);
                                return;
                            }
                        }

                        // 紅色 (chase) 或其他追擊邏輯: 尋找離目標最近的方向
                        let bestDir = options[0];
                        let minDist = Infinity;
                        options.forEach(d => {
                            let nr = gp.r, nc = gp.c;
                            if (d === 'UP') nr--; if (d === 'DOWN') nr++; if (d === 'LEFT') nc--; if (d === 'RIGHT') nc++;
                            const d2 = Math.pow(nr - targetR, 2) + Math.pow(nc - targetC, 2);
                            if (d2 < minDist) {
                                minDist = d2;
                                bestDir = d;
                            }
                        });
                        m.dir = bestDir;
                    }
                }
            }
            this.moveEntity(m, false);
        },

        updatePlayerPath: function () {
            const pg = this.getGridPos(this.player.x, this.player.y);
            if (this.playerPath.length === 0 ||
                this.playerPath[this.playerPath.length - 1].r !== pg.r ||
                this.playerPath[this.playerPath.length - 1].c !== pg.c) {

                this.playerPath.push({ r: pg.r, c: pg.c });
                if (this.playerPath.length > 4) {
                    this.playerPath.shift();
                }
            }
        },

        getAvailableDirs: function (r, c, currentDir) {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            const opposite = { 'UP': 'DOWN', 'DOWN': 'UP', 'LEFT': 'RIGHT', 'RIGHT': 'LEFT' };
            const valid = dirs.filter(d => this.canMoveFromCell(r, c, d));

            // 除非是死路，否則不走回頭路
            if (valid.length > 1) {
                return valid.filter(d => d !== opposite[currentDir]);
            }
            return valid;
        },

        getRandomValidDir: function (r, c) {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            const valid = dirs.filter(d => this.canMoveFromCell(r, c, d));
            return valid[Math.floor(Math.random() * valid.length)] || 'UP';
        },

        isInsideGhostHouse: function (x, y) {
            const gp = this.getGridPos(x, y);
            return this.mazeLayout[gp.r] && this.mazeLayout[gp.r][gp.c] === 2;
        },

        closeGhostHouse: function () {
            if (this.isGhostHouseClosed) return;
            this.isGhostHouseClosed = true;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.mazeLayout[r][c] === 2) {
                        this.maze[r][c] = 1; // 封閉後地圖邏輯變為牆壁 (1)
                    }
                }
            }
        },

        openGhostHouse: function () {
            this.isGhostHouseClosed = false;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.mazeLayout[r][c] === 2) {
                        this.maze[r][c] = 2; // 重置為基地狀態 (2)
                    }
                }
            }
        },

        canMoveFromCell: function (r, c, dir, isPlayer = false) {
            let nr = r, nc = c;
            if (dir === 'UP') nr--;
            if (dir === 'DOWN') nr++;
            if (dir === 'LEFT') nc--;
            if (dir === 'RIGHT') nc++;
            const cell = (this.maze[nr] && this.maze[nr][nc] !== undefined) ? this.maze[nr][nc] : 1;
            if (isPlayer) return cell === 0; // 玩家只准走一般路徑
            return cell === 0 || cell === 2; // 怪物可走一般路徑或開放中的基地
        },

        canMove: function (x, y, dir, isPlayer = false) {
            const buffer = this.gridSize * 0.4;
            let checkPoints = [];
            if (dir === 'UP') checkPoints = [{ x: x - buffer, y: y - buffer }, { x: x + buffer, y: y - buffer }];
            if (dir === 'DOWN') checkPoints = [{ x: x - buffer, y: y + buffer }, { x: x + buffer, y: y + buffer }];
            if (dir === 'LEFT') checkPoints = [{ x: x - buffer, y: y - buffer }, { x: x - buffer, y: y + buffer }];
            if (dir === 'RIGHT') checkPoints = [{ x: x + buffer, y: y - buffer }, { x: x + buffer, y: y + buffer }];

            return checkPoints.every(p => {
                const gp = this.getGridPos(p.x, p.y);
                if (gp.c < 0 || gp.c >= this.cols) return true; // Tunnel
                const cell = this.maze[gp.r] ? this.maze[gp.r][gp.c] : 1;
                if (isPlayer) return cell === 0; // 玩家物物理碰撞僅限路徑 (0)
                return cell !== 1; // 怪物物理碰撞排除牆壁 (1)
            });
        },

        getGridPos: function (x, y) {
            return {
                r: Math.floor(y / this.gridSize),
                c: Math.floor(x / this.gridSize)
            };
        },

        getRandomDir: function () {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            return dirs[Math.floor(Math.random() * dirs.length)];
        },

        checkCollisions: function () {
            // Monster collision 小精靈碰撞
            for (let m of this.monsters) {
                const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
                if (dist < this.gridSize * 0.8) {
                    this.handleHit();
                    return;
                }
            }

            // Food collision 食物碰撞
            const pg = this.getGridPos(this.player.x, this.player.y);
            this.foods.forEach(f => {
                if (!f.collected && f.row === pg.r && f.col === pg.c) {
                    if (f.index === this.collectedCount) {
                        if (window.SoundManager) window.SoundManager.playSuccess();
                        // Correct order
                        f.collected = true;
                        this.collectedCount++;
                        this.score += 20; // 答對一個字加20分
                        document.getElementById('game5-score').textContent = this.score;
                        this.hintStartTime = Date.now(); // 重置提示時間

                        if (this.collectedCount === this.targetChars.length) {
                            this.gameOver(true, '墨蹤已續，文心復位！');
                        } else {
                            // Update UI hints
                            const prevHint = document.getElementById(`hint-${f.index}`);
                            if (prevHint) prevHint.classList.replace('active', 'collected');
                            const nextHint = document.getElementById(`hint-${f.index + 1}`);
                            if (nextHint) nextHint.classList.add('active');
                        }
                    } else {
                        //if (window.SoundManager) window.SoundManager.playFailure();
                        //if (window.SoundManager) window.SoundManager.playCloseItem();
                        // Wrong order - subtle penalty or shake?
                        //document.querySelector('.game5-maze-container').classList.add('shake');
                        setTimeout(() => document.querySelector('.game5-maze-container').classList.remove('shake'), 100);
                        // 撞擊錯誤文字時的懲罰停頓時間 (penalty)
                        this.player.speed *= 0.5; // 降低移動速度
                        setTimeout(() => this.player.speed = this.player.speedDefault, this.mistakePenaltyDuration);
                    }
                }
            });
        },

        handleHit: function () {
            if (this.isDying) return;
            if (window.SoundManager) window.SoundManager.playSadTriple(); //被抓到了
            this.isDying = true;
            this.deathStartTime = Date.now();
            this.mistakes++;
            this.renderHearts();

            if (this.mistakes >= this.maxMistakes) {
                setTimeout(() => this.gameOver(false, '靈感耗盡，墨跡散亂...'), 1000);
            } else {
                // 播放死亡動畫後重生
                setTimeout(() => {
                    this.resetEntities(); // 先重置位置
                    this.isDying = false;  // 再取消死亡狀態
                }, 1500);
            }
        },

        draw: function () {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw Maze Walls with Watermark/Ink effect畫牆壁
            this.ctx.strokeStyle = 'hsl(240, 70%, 36%)';
            this.ctx.lineWidth = 3;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.maze[r][c] === 1) {
                        this.ctx.fillStyle = 'hsl(240, 50%, 18%)';
                        this.ctx.fillRect(c * this.gridSize + 1, r * this.gridSize + 1, this.gridSize - 2, this.gridSize - 2);
                        this.ctx.strokeRect(c * this.gridSize + 3, r * this.gridSize + 3, this.gridSize - 5, this.gridSize - 5);
                    }
                }
            }

            // Draw Trails (Ink effect)
            this.ctx.fillStyle = 'hsla(50, 100%, 80%, 0.50)';
            for (let i = this.trails.length - 1; i >= 0; i--) {
                const t = this.trails[i];
                this.ctx.globalAlpha = t.alpha;
                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, this.player.radius * t.alpha, 0, Math.PI * 2);
                this.ctx.fill();
                t.alpha -= 0.02;
                if (t.alpha <= 0) this.trails.splice(i, 1);
            }
            this.ctx.globalAlpha = 1.0;

            // Draw Foods
            // PC gridSize ~21px, Mobile gridSize ~15px. Font size should follow gridSize.
            this.ctx.font = `bold ${Math.floor(this.gridSize * 0.8)}px 'Noto Serif TC'`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const settings = this.difficultySettings[this.difficulty];
            const elapsed = Date.now() - this.hintStartTime;
            const isHinting = settings.hintDuration === -1 || elapsed < settings.hintDuration;

            this.foods.forEach(f => {
                if (!f.collected) {
                    const isNext = f.index === this.collectedCount;
                    if (isNext && isHinting) {
                        this.ctx.fillStyle = 'hsl(45, 100%, 65%)';
                        this.ctx.shadowBlur = 15;
                        this.ctx.shadowColor = 'gold';
                    } else {
                        this.ctx.fillStyle = 'rgba(255,255,255,0.4)';
                        this.ctx.shadowBlur = 0;
                    }
                    this.ctx.fillText(f.char, f.col * this.gridSize + this.gridSize / 2, f.row * this.gridSize + this.gridSize / 2);
                }
            });
            this.ctx.shadowBlur = 0;

            // Draw Monsters (Ink Ghost style)
            this.monsters.forEach(m => {
                this.ctx.save();
                this.ctx.translate(m.x, m.y);
                this.ctx.fillStyle = m.color;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = m.color;

                this.ctx.beginPath();
                this.ctx.arc(0, 0, this.gridSize * 0.4, Math.PI, 0);
                this.ctx.lineTo(this.gridSize * 0.4, this.gridSize * 0.5);
                // Wavy bottom
                for (let i = 1; i <= 3; i++) {
                    this.ctx.lineTo(this.gridSize * 0.4 - (i * 0.25 * this.gridSize), this.gridSize * (i % 2 ? 0.4 : 0.6));
                }
                this.ctx.lineTo(-this.gridSize * 0.4, this.gridSize * 0.5);
                this.ctx.fill();

                // Eyes (Calligraphy style dots)
                this.ctx.fillStyle = 'white';
                this.ctx.beginPath();
                this.ctx.arc(-4, -2, 4, 0, Math.PI * 2);
                this.ctx.arc(4, -2, 4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            });

            // Draw Player (Gold Ink Drop)
            if (!this.player) return;

            if (this.isDying) {
                const elapsed = Date.now() - this.deathStartTime;
                const scale = Math.max(0, 1 - elapsed / 1500);
                this.ctx.save();
                this.ctx.translate(this.player.x, this.player.y);
                this.ctx.scale(scale * 1.5, scale * 1.5);
                this.ctx.globalAlpha = scale;
            } else {
                this.ctx.save();
                this.ctx.translate(this.player.x, this.player.y);
                this.ctx.globalAlpha = 1.0; // 強制重置透明度，確保重生後可見
            }

            this.ctx.fillStyle = 'hsl(45, 100%, 60%)';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = 'gold';

            // Rotating ink blob
            const rotation = (performance.now() / 200) % (Math.PI * 2);
            this.ctx.rotate(rotation);

            this.ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const r = this.player.radius * (0.8 + 0.2 * Math.sin(performance.now() / 100 + i));
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game5-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game5-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game5-retryGame-btn').disabled = false;
                document.getElementById('game5-newGame-btn').disabled = false;
            }
            this.isWin = win;
            clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);

            const msgDiv = document.getElementById('game5-message');
            document.getElementById('game5-msg-title').textContent = win ? '才思泉湧！' : '筆底乾坤盡';
            document.getElementById('game5-msg-content').textContent = reason;

            const msgPoemInfo = document.getElementById('game5-msg-poem-info');
            if (this.targetPoem) {
                msgPoemInfo.innerHTML = `<span style="cursor: pointer; text-decoration: underline; opacity: 0.8;">《${this.targetPoem.title}》 / ${this.targetPoem.dynasty} / ${this.targetPoem.author}</span>`;
            } else {
                msgPoemInfo.innerHTML = '';
            }

            msgDiv.classList.remove('hidden');

            const msgBtn = document.getElementById('game5-msg-btn');
            if (win) {
                msgBtn.textContent = "下一局";
            } else {
                msgBtn.textContent = "再試一次";
            }

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game5',
                    timerContainerId: 'game5-timer', // We don't have a ring but it needs a ref
                    scoreElementId: 'game5-score',
                    heartsSelector: '#game5-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        document.getElementById('game5-msg-content').textContent = `得分：${finalScore}\n${reason}`;
                    }
                });
            }
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);
            document.getElementById('game5-container').classList.add('hidden');
            document.body.classList.remove('overlay-active');
            // Restore main page
            const container = document.getElementById('calendarCardContainer') || document.getElementById('cardContainer');
            if (container) container.style.display = '';
        }
    };

    window.Game5 = Game5;

    // Auto-start check
    if (new URLSearchParams(window.location.search).get('game') === '5') {
        setTimeout(() => {
            if (window.Game5) window.Game5.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }

})();
