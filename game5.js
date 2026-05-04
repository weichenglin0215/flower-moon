/* game5.js - 詩詞小精靈 (Poetry Pac-Man) */

(function () {
    'use strict';

    const Game5 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakes: 0,
        maxMistakes: 5,
        timer: 0,
        timeLimit: 0,
        timerInterval: null,

        // Maze configuration
        gridSize: 20, // pixels per cell (will be adjusted)
        rows: 21,
        cols: 19,
        maze: [], // 2D array: 0 = path, 1 = wall

        // Entities
        player: null,
        monsters: [],
        playerPath: [], // 記錄玩家移動的路徑資料
        isGhostHouseClosed: false, // 鬼屋是否已經關閉
        foods: [], // { char, row, col, index }
        collectedCount: 0,
        targetPoem: null,
        targetChars: [], // The characters to collect in order

        // Effects
        enemyDirection: 1, // 1 向右, -1 向左
        trails: [], // {x, y, alpha}

        // Animation
        requestID: null,
        lastTime: 0,

        // Input
        touchStart: { x: 0, y: 0 },
        minSwipeDist: 30,

        // 地圖比例調整 (1.0 = 原始寬度比例, 2.0 = 兩倍寬度)
        mapScale: 1.0,

        // 失誤後冷卻與閃爍
        mistakePenaltyDuration: 150,
        // 難度設定對照表
        // timeLimit: 倒計時秒數,
        // poemMinRating: 詩詞評分要求, 
        // maxMistakeCount: 最大錯誤次數,
        // monsters: 怪物數量, 
        // answerLen: 需收集的文字長度,
        // hintDuration: 下一個字提示閃爍持續時間, 
        // lostInt/lostDur: 小精靈故意失誤的相隔時間與失誤持續時間
        difficultySettings: {
            '小學': { timeLimit: 120, poemMinRating: 6, maxMistakeCount: 7, monsters: 2, answerLen: 5, hintDuration: -1, lostInt: -2000, lostDur: 1500 },
            '中學': { timeLimit: 120, poemMinRating: 5, maxMistakeCount: 6, monsters: 3, answerLen: 7, hintDuration: -1, lostInt: -1000, lostDur: 1000 },
            '高中': { timeLimit: 120, poemMinRating: 4, maxMistakeCount: 5, monsters: 4, answerLen: 10, hintDuration: -1, lostInt: -500, lostDur: 500 },
            '大學': { timeLimit: 120, poemMinRating: 3, maxMistakeCount: 4, monsters: 4, answerLen: 12, hintDuration: -1, lostInt: 0, lostDur: 500 },
            '研究所': { timeLimit: 120, poemMinRating: 3, maxMistakeCount: 3, monsters: 4, answerLen: 14, hintDuration: -1, lostInt: 0, lostDur: 0 }
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
            container.className = 'game5-overlay  hidden';
            container.innerHTML = `
                <div class="game5-header">
                    <div class="game5-score-board">得分: <span id="game5-score">0</span></div>
                    <div class="game5-controls">
                        <button class="game5-difficulty-tag" id="game5-diff-tag">小學</button>
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
                    <div id="game5-timer" class="game5-timer-container">時間：-</div>
                    <div class="game5-instruction">拖曳或滑動以移動角色</div>
                </div>
                
                </div>
            `;
            document.body.appendChild(container);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    container.style.left   = r.left   + 'px';
                    container.style.top    = r.top    + 'px';
                    container.style.width  = 500 + 'px';
                    container.style.height = 850 + 'px';
                    container.style.transform = 'scale(' + r.scale + ')';
                    container.style.transformOrigin = 'top left';
                });
            }

            this.canvas = document.getElementById('game5-canvas');
            this.ctx = this.canvas.getContext('2d');
        },

        bindEvents: function () {
            //綁定game5-diff-tag按鍵
            document.getElementById('game5-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.showDifficultySelector();
            };
            //綁定game5-retryGame-btn按鍵
            document.getElementById('game5-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            //綁定game5-newGame-btn按鍵
            document.getElementById('game5-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
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
                    isMouseDown = false; // 避免重複觸發
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

            const mazeCont = document.querySelector('.game5-maze-container');
            if (!mazeCont) return;
            const cw = mazeCont.offsetWidth || document.getElementById('game5-container').offsetWidth;

            this.gridSize = Math.floor(cw / this.cols) * this.mapScale;

            this.canvas.width = this.cols * this.gridSize;
            this.canvas.height = this.rows * this.gridSize;

            this.updateTimerRing(1);

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

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);
            if (window.GameMessage) window.GameMessage.hide();


            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩詞精靈', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    const container = document.getElementById('game5-container');
                    container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    /* updateResponsiveLayout replaced */
                    this.startNewGame();
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game5-diff-tag');
            const retryBtn = document.getElementById('game5-retryGame-btn');
            const newBtn = document.getElementById('game5-newGame-btn');
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
            /* updateResponsiveLayout replaced */
        },

        show: function () {
            this.init();

            const intro = document.getElementById('introOverlay');
            if (intro && !intro.classList.contains('hidden')) {
                intro.classList.add('hidden', 'hide-fade');
                document.body.classList.remove('overlay-active');
            }

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩詞小精靈', (level, levelIndex) => {
                    this.difficulty = level;
                    this.isLevelMode = (levelIndex !== undefined); // Set isLevelMode here
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[level];
                    if (!settings) {
                        console.error('Invalid difficulty:', level);
                        return;
                    }
                    this.maxMistakes = settings.maxMistakeCount;
                    this.timeLimit = settings.timeLimit;

                    this.updateUIForMode();

                    const container = document.getElementById('game5-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.classList.add('overlay-active');
                    }

                    this.setupMaze();
                    /* updateResponsiveLayout replaced */
                    this.startNewGame(this.isLevelMode ? this.currentLevelIndex : undefined); // Pass levelIndex if in level mode
                });
            }
        },

        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            } else {
                // If levelIndex is not provided, it's not level mode unless previously set
                // Ensure isLevelMode is reset if starting a non-level game
                if (!this.isLevelMode) { // Only reset if not already in level mode
                    this.isLevelMode = false;
                    this.currentLevelIndex = 1; // Reset level index for non-level mode
                }
            }

            this.updateUIForMode();
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
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();
            this.renderTargetPoem();

            this.lastTime = performance.now();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            // 確保重來/開新局按鈕在遊戲結束時可以再次點擊
            document.getElementById('game5-retryGame-btn').disabled = false;
            document.getElementById('game5-newGame-btn').disabled = false;
            this.gameLoop(this.lastTime);
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame(this.currentLevelIndex); // Pass currentLevelIndex to maintain level mode
        },

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.mistakes = 0;
            this.collectedCount = 0;
            this.resetEntities();
            this.startTimer();
            this.isActive = true;
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();
            // Reset food visibility
            this.foods.forEach(f => f.collected = false);

            // 確保重來/開新局按鈕在遊戲結束時可以再次點擊
            document.getElementById('game5-retryGame-btn').disabled = false;
            document.getElementById('game5-newGame-btn').disabled = false;
            this.lastTime = performance.now();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.gameLoop(this.lastTime);
        },
        //放置精靈
        preparePoem: function () {
            if (typeof POEMS === 'undefined') return;
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.poemMinRating || 4;
            const anserlength = settings.answerLen;

            // 使用共享的隨機詩詞，傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                2, 4, 10, 100, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game5'
            );
            if (!result) return;

            const poem = result.poem;
            this.targetPoem = poem;

            // getSharedRandomPoem 預設會從偶數行開始 (例如 0, 2, 4...)
            let fullStr = "";
            let startLineIndex = result.startIndex;
            for (let i = startLineIndex; i < poem.content.length; i += 1) {
                fullStr += poem.content[i].replace(/[，。？！、；：「」（）《》s]/g, '');
                if (fullStr.length > anserlength) break;
            }

            // 如果隨機選取的行數不夠，則從頭開始選取
            if (fullStr.length <= anserlength) {
                fullStr = "";
                for (let i = 0; i < poem.content.length; i += 1) {
                    fullStr += poem.content[i].replace(/[，。？！、；：「」（）《》s]/g, '');
                    if (fullStr.length > anserlength) break;
                }
            }

            // [待辦] 確保選取後的字串長度不超過 16 個字，否則截斷
            if (fullStr.length > 16) {
                fullStr = fullStr.substring(fullStr.length - 16);
            }
            this.hitTimer = 0;       // 受傷閃爍計時器
            // 根據難度設定，將字串分為提示和答案
            const totalLen = fullStr.length;
            const promptStr = fullStr.substring(0, totalLen - anserlength);
            const answerStr = fullStr.substring(totalLen - anserlength);

            this.promptChars = promptStr.split('');
            this.targetChars = answerStr.split('');
            this.hintStartTime = Date.now(); // 提示字閃爍計時

            // 佈局單位定義 (以 rem 為基礎)
            this.foods = [];
            const quadrants = [[], [], [], []]; // [TL, TR, BL, BR]
            const midR = Math.floor(this.rows / 2);
            const midC = Math.floor(this.cols / 2);

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    // 根據要求，避免在精靈重生位置附近 (大約 row 7~12，col 7~11) 放置食物
                    const inRestrictedArea = (r >= 7 && r <= 10) && (c >= 6 && c <= 12);

                    if (this.maze[r][c] === 0 && !this.isGhostHouse(r, c) && !inRestrictedArea) {
                        let qIdx = 0;
                        if (r < midR) qIdx = (c < midC ? 0 : 1);
                        else qIdx = (c < midC ? 2 : 3);
                        quadrants[qIdx].push({ r, c });
                    }
                }
            }
            this.enemySpacingX = 1.4;    // 橫向間距
            this.enemySpacingY = 1.4;    // 縱向間距
            // 由於內部需要重複嘗試與改變流程，改用標準 for 迴圈
            for (let index = 0; index < this.targetChars.length; index++) {
                const char = this.targetChars[index];
                const qIdx = index % 4; // 確保平均分配到四個象限
                let pool = quadrants[qIdx];
                let pos = null;

                // 建立一個檢查相鄰的函數
                const hasAdjacentFood = (r, c) => {
                    return this.foods.some(f =>
                        (f.row === r && Math.abs(f.col - c) === 1) ||
                        (f.col === c && Math.abs(f.row - r) === 1)
                    );
                };

                // 在該象限中，先過濾出「沒有相鄰食物」的可用位置
                let validPool = pool.filter(p => !hasAdjacentFood(p.r, p.c));

                if (validPool.length > 0) {
                    // 有完美位置，隨機抽一個
                    const posIdx = Math.floor(Math.random() * validPool.length);
                    pos = validPool[posIdx];
                    // 從原本的 pool 移除該位置避免重複使用
                    const realIdx = pool.findIndex(p => p.r === pos.r && p.c === pos.c);
                    pool.splice(realIdx, 1);
                } else if (pool.length > 0) {
                    // 該象限找不到不相鄰的位置了，只好妥協，隨機抽一個
                    const posIdx = Math.floor(Math.random() * pool.length);
                    pos = pool.splice(posIdx, 1)[0];
                } else {
                    // 如果整個象限都空了，從其他剩餘象限尋找
                    let allRemaining = quadrants.flat();
                    let allValid = allRemaining.filter(p => !hasAdjacentFood(p.r, p.c));

                    if (allValid.length > 0) {
                        const posIdx = Math.floor(Math.random() * allValid.length);
                        pos = allValid[posIdx];
                    } else if (allRemaining.length > 0) {
                        const posIdx = Math.floor(Math.random() * allRemaining.length);
                        pos = allRemaining[posIdx];
                    } else {
                        console.error("迷宮沒有足夠的空間放置文字！");
                        continue;
                    }

                    // 從原陣列中剔除
                    const targetQ = quadrants.find(q => q.some(p => p.r === pos.r && p.c === pos.c));
                    if (targetQ) {
                        const realIdx = targetQ.findIndex(p => p.r === pos.r && p.c === pos.c);
                        targetQ.splice(realIdx, 1);
                    }
                }

                this.foods.push({
                    char: char,
                    row: pos.r,
                    col: pos.c,
                    index: index,
                    collected: false
                });
            }
        },

        isGhostHouse: function (r, c) {
            return this.mazeLayout[r][c] === 2;
        },

        resetEntities: function () {
            this.openGhostHouse(); // 確保鬼屋門是開的
            this.isDying = false;
            this.deathStartTime = 0;
            this.trails = [];
            this.playerPath = []; // 重置玩家路徑

            // Player starts at bottom center
            this.player = {
                x: 9 * this.gridSize + this.gridSize / 2,
                y: 15 * this.gridSize + this.gridSize / 2,
                dir: 'LEFT',
                nextDir: 'LEFT',
                speedDefault: this.gridSize * 0.08, // 預設移動速度
                speed: this.gridSize * 0.08, // 當前移動速度
                radius: this.gridSize * 0.5
            };

            // Monsters start in cage (row 9, col 8-10)
            this.monsters = [];
            const settings = this.difficultySettings[this.difficulty];
            const ghostSpawns = [{ r: 9, c: 8 }, { r: 9, c: 9 }, { r: 9, c: 10 }, { r: 9, c: 9 }];

            // 根據難度設定怪物數量與行為
            const ghostConfigs = [
                { ai: 'chase', color: 'hsl(0, 100%, 50%)', lostInt: 6000, lostDur: 1000 }, // 紅色 追擊
                { ai: 'trail', color: 'hsl(180, 100%, 75%)', lostInt: 3000, lostDur: 1500 }, // 青色: 追蹤玩家路徑
                { ai: 'ambush', color: 'hsl(120, 100%, 50%)', lostInt: 4000, lostDur: 2000 }, // 綠色 伏擊
                { ai: 'distant', color: 'hsl(280, 100%, 60%)', lostInt: 3000, lostDur: 2500 }  // 紫色 遠離玩家
            ];

            for (let i = 0; i < settings.monsters; i++) {
                const config = ghostConfigs[i % ghostConfigs.length];
                const spawn = ghostSpawns[i % ghostSpawns.length];
                this.monsters.push({
                    x: spawn.c * this.gridSize + this.gridSize / 2,
                    y: spawn.r * this.gridSize + this.gridSize / 2,
                    dir: 'UP',
                    speed: this.player.speed * 0.7, // 怪物速度是玩家的 0.7 倍
                    color: config.color,
                    ai: config.ai,
                    lastLostTime: Date.now() + Math.random() * 3000, // 初始隨機失去方向時間
                    lostInterval: config.lostInt + settings.lostInt, // 失去方向間隔時間 (受難度影響)
                    lostDuration: config.lostDur + settings.lostDur, // 失去方向持續時間 (受難度影響)
                    isStunned: false
                });
            }
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            if (this.timeLimit <= 0) {
                document.getElementById('game5-timer').textContent = '時間：無限';
                this.updateTimerRing(1);
                return;
            }
            this.timer = this.timeLimit;
            this.updateTimerUI();
            this.startTime = Date.now();
            const duration = this.timeLimit * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                this.timer = Math.ceil(this.timeLimit - (elapsed / 1000));
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
                span.textContent = i < this.mistakes ? '💔' : '❤️';
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
                this.updatePlayerPath(); // 更新玩家路徑資料
                this.monsters.forEach(m => this.moveMonster(m));
                this.checkCollisions();

                // 檢查是否所有怪物都已離開鬼屋，如果是則關閉鬼屋
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

            // 檢查是否到達中心點附近 (用於轉彎)
            // 增加容忍度 (Tolerance) 以避免因浮點數誤差導致無法轉彎
            const turnTolerance = this.gridSize * 0.45;
            const offX = ent.x - centerX;
            const offY = ent.y - centerY;
            const isNearCenter = Math.abs(offX) < turnTolerance && Math.abs(offY) < turnTolerance;

            // 嘗試轉彎 (如果靠近中心點且有下一個方向)
            if (isNearCenter && ent.nextDir && ent.nextDir !== ent.dir) {
                if (this.canMoveFromCell(gp.r, gp.c, ent.nextDir, isPlayer)) {
                    // 轉彎時將實體精確對齊到中心點
                    ent.x = centerX;
                    ent.y = centerY;
                    ent.dir = ent.nextDir;
                    ent.nextDir = null;
                }
            }

            // 確保實體在移動時保持對齊 (Alignment)
            // 避免因速度過快導致偏離中心線
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

            // 處理傳送門 (Warp tunnel)
            const isWarpRow = gp.r === this.warpRowIndex;

            if (isWarpRow && (nextX < 0 || nextX > this.canvas.width)) {
                if (nextX < -ent.speed) ent.x = this.canvas.width;
                else if (nextX > this.canvas.width + ent.speed) ent.x = 0;
                else ent.x = nextX;
            } else if (this.canMove(nextX, nextY, ent.dir, isPlayer)) {
                ent.x = nextX;
                ent.y = nextY;

                // 玩家移動軌跡
                if (isPlayer && Math.random() < 0.3) {
                    this.trails.push({ x: ent.x, y: ent.y, alpha: 0.5 });
                }
            } else {
                // 撞牆
                if (!isPlayer) {
                    // 怪物撞牆時隨機改變方向
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

            // 更新怪物失去方向狀態 (Lost/Stunned state)
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
                    // 如果怪物處於失去方向狀態或只有一個方向可走，則隨機選擇方向
                    if (m.isStunned || options.length === 1) {
                        m.dir = options[Math.floor(Math.random() * options.length)];
                    } else {
                        // 根據AI行為設定目標方塊 (Target Tile)
                        let targetR = pg.r;
                        let targetC = pg.c;

                        if (m.ai === 'trail') { // 青色: 追蹤玩家路徑
                            if (distToPlayer >= 6 && this.playerPath.length > 0) {
                                // 如果距離玩家超過 6 格，追蹤玩家路徑的起點
                                const pNode = this.playerPath[0];
                                targetR = pNode.r;
                                targetC = pNode.c;
                            }
                            // 否則追蹤玩家
                        } else if (m.ai === 'ambush') { // 綠色 伏擊
                            if (distToPlayer >= 6) {
                                // 如果距離玩家超過 6 格，預測玩家前方 5 格
                                const offsets = { 'UP': [-5, 0], 'DOWN': [5, 0], 'LEFT': [0, -5], 'RIGHT': [0, 5] };
                                const off = offsets[this.player.dir] || [0, 0];
                                targetR = Math.max(0, Math.min(this.rows - 1, pg.r + off[0]));
                                targetC = Math.max(0, Math.min(this.cols - 1, pg.c + off[1]));
                            }
                            // 否則追蹤玩家
                        } else if (m.ai === 'distant') { // 紫色 遠離玩家
                            if (distToPlayer < 9) {
                                // 如果距離玩家小於 9 格，則隨機選擇方向遠離玩家 (逃跑)
                                m.dir = options[Math.floor(Math.random() * options.length)];
                                this.moveEntity(m, false);
                                return;
                            }
                        }

                        // 追擊 (chase) AI 或其他AI的預設行為是追蹤玩家
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

            // 避免怪物立即掉頭
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
                        this.maze[r][c] = 1; // 將鬼屋入口變成牆壁 (1)
                    }
                }
            }
        },

        openGhostHouse: function () {
            this.isGhostHouseClosed = false;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.mazeLayout[r][c] === 2) {
                        this.maze[r][c] = 2; // 重置鬼屋入口為可通行 (2)
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
            if (isPlayer) return cell === 0; // 玩家只能走通道
            return cell === 0 || cell === 2; // 怪物可以走通道或鬼屋
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
                if (isPlayer) return cell === 0; // 玩家不能穿牆 (1)
                return cell !== 1; // 怪物不能穿牆 (1)
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
            // Monster collision 怪物碰撞
            for (let m of this.monsters) {
                const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
                if (dist < this.gridSize * 0.8) {
                    this.handleHit();
                    return;
                }
            }
            this.monumentCols = 8;       // 掩體橫列數
            this.monumentRows = 4;       // 掩體縱列數
            // Food collision 食物碰撞
            const pg = this.getGridPos(this.player.x, this.player.y);
            this.foods.forEach(f => {
                if (!f.collected && f.row === pg.r && f.col === pg.c) {
                    if (f.index === this.collectedCount) {
                        if (window.SoundManager) window.SoundManager.playSuccess();
                        // Correct order
                        f.collected = true;
                        this.collectedCount++;
                        //收集一字得分
                        // 擊中文字，根據window.ScoreManager.gameSettings['game5'].getPointA加分
                        this.score += window.ScoreManager.gameSettings['game5'].getPointA;
                        document.getElementById('game5-score').textContent = this.score;
                        this.hintStartTime = Date.now(); // 重置提示計時

                        if (this.collectedCount === this.targetChars.length) {
                            // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                            this.gameOver(true, '');
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
                        // 錯誤收集的懲罰 (penalty)
                        this.player.speed *= 0.5; // 減速懲罰
                        setTimeout(() => this.player.speed = this.player.speedDefault, this.mistakePenaltyDuration);
                    }
                }
            });
        },

        handleHit: function () {
            if (this.isDying) return;
            if (window.SoundManager) window.SoundManager.playSadTriple(); // 玩家受傷
            this.isDying = true;
            this.deathStartTime = Date.now();
            this.mistakes++;
            this.renderHearts();

            if (this.mistakes >= this.maxMistakes) {
                setTimeout(() => this.gameOver(false, '墨香耗盡！'), 1000);
            } else {
                // 玩家重生的處理
                setTimeout(() => {
                    this.resetEntities(); // 重置地圖物件
                    this.isDying = false;  // 結束受傷狀態
                }, 1500);
            }
        },

        draw: function () {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // 繪製牆壁
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
            //this.ctx.font = `bold ${Math.floor(this.gridSize * 0.8)}px 'Noto Serif TC'`; //宋體字尺寸
            this.ctx.font = `bold ${Math.floor(this.gridSize * 1.0)}px 'Microsoft JhengHei'`; //微軟正黑體字尺寸
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
                        this.ctx.font = `bold ${Math.floor(this.gridSize * 1.2)}px 'Microsoft JhengHei'`; //微軟正黑體字尺寸
                    } else {
                        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                        this.ctx.shadowBlur = 0;
                        this.ctx.font = `bold ${Math.floor(this.gridSize * 1.0)}px 'Microsoft JhengHei'`; //微軟正黑體字尺寸
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
                this.ctx.globalAlpha = 1.0; // 重置透明度
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
            if (win) {
                document.getElementById('game5-retryGame-btn').disabled = true;
                document.getElementById('game5-newGame-btn').disabled = true;
            } else {
                document.getElementById('game5-retryGame-btn').disabled = false;
                document.getElementById('game5-newGame-btn').disabled = false;
            }
            this.isWin = win;
            clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);

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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "挑戰結束"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game5',
                    timerContainerId: 'game5-timer',
                    scoreElementId: 'game5-score',
                    heartsSelector: '#game5-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        if (this.isLevelMode) {
                            window.ScoreManager.completeLevel('game5', this.difficulty, this.currentLevelIndex);
                        }
                        showMessage(finalScore);
                    }
                });
            } else {
                showMessage();
            }
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);
            const container = document.getElementById('game5-container');
            if (container) {
                container.classList.add('hidden');
            }
            document.body.classList.remove('overlay-active');
            // Restore main page
            const mainContainer = document.getElementById('calendarCardContainer') || document.getElementById('cardContainer');
            if (mainContainer) mainContainer.style.display = '';
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
