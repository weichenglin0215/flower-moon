/* game6.js - 詩陣侵略 (Poetry Invaders) */

(function () {
    'use strict';

    const Game6 = {
        isActive: false, // 遊戲是否啟動
        difficulty: '小學', // 遊戲難度
        currentLevelIndex: 1, // 當前關卡索引
        isLevelMode: false, // 是否為關卡模式
        score: 0, // 遊戲得分
        mistakeCount: 0, // 遊戲錯誤次數
        maxMistakeCount: 3, // 最大錯誤次數
        timeLimit: 60, // 遊戲時間限制
        timeLeft: 60, // 剩餘時間
        timerInterval: null, // 計時器間隔
        nextEnemyId: 0, // 下一個敵人ID

        // 佈局單位定義 (以 rem 為基礎)
        ui: {
            // 敵人相關
            enemySize: 1.5,        // 敵人大小
            enemySpacingX: 1.2,    // 橫向間距
            enemySpacingY: 1.2,    // 縱向間距

            // 敵人子彈
            enemyBulletSize: 0.2,  // 子彈大小

            // 掩體（碑林）
            monumentBlockSize: 0.4, // 碑林方塊大小
            monumentCols: 8,       // 掩體橫列數
            monumentRows: 4,       // 掩體縱列數

            // 玩家外觀控制
            playerWidth: 2.0,      // 玩家寬度
            playerHeight: 0.8,     // 玩家高度
            gunWidth: 0.3,         // 槍管寬度
            gunHeight: 0.3,        // 槍管高度

            // 玩家攻擊設定
            bulletSize: 0.3,       // 子彈大小
            bulletSizePierce: 0.3, // 穿透子彈大小

            // 寶箱界面參數
            powerUpBoxSizeWidth: 5,    // 寶箱寬度
            powerUpBoxSizeHeight: 6    // 寶箱高度
        },

        // 玩家與怪物
        player: {
            x: 0,
            width: 50,
            height: 20,
            bullets: [],
            fireRate: 0.5, // 射速 (每秒射擊次數)
            lastFired: 0,
            // 玩家狀態設定
            isFiring: false,   // 是否正在射擊/連按射擊
            swiftLevel: 0,     // 玩家移動速度等級
            multiShotLevel: 1, // 多重射擊等級
            pierceLevel: 0,    // 穿透射擊等級
            powerUpTime: 0,
            hitTimer: 0       // 受傷閃爍計時器
        },
        enemies: [], // { char, x, y, hp, alpha, rowIdx }
        enemyProjectiles: [],
        chestItems: [], // { type, x, y, width, height }
        monuments: [], // { blocks: [] }
        particles: [], // { x, y, color, life, vx, vy } 粒子效果
        isPausedForPowerUp: false, // 是否因寶箱介面而暫停

        // 渲染與控制變數
        canvas: null,
        ctx: null,
        container: null,
        lastTime: 0,
        requestID: null,
        touchStartX: 0,
        dragStartX: 0,

        // 難度等級設定
        difficultySettings: {
            //timeLimit: 時間限制
            //poemMinRating: 詩詞評分要求
            //maxMistakeCount: 最大錯誤次數
            //fireRate: 射擊頻率
            //baseSpeed: 基礎速度
            //speedInc: 速度增量
            //maxSpeed: 最大速度
            //lineCount: 敵人波次詩句數
            '小學': { timeLimit: 120, poemMinRating: 6, maxMistakeCount: 6, fireRate: 0.8, baseSpeed: 50, speedInc: 5, maxSpeed: 200, lineCount: 2 },
            '中學': { timeLimit: 120, poemMinRating: 5, maxMistakeCount: 5, fireRate: 0.75, baseSpeed: 50, speedInc: 6, maxSpeed: 250, lineCount: 4 },
            '高中': { timeLimit: 120, poemMinRating: 4, maxMistakeCount: 4, fireRate: 0.7, baseSpeed: 50, speedInc: 7, maxSpeed: 300, lineCount: 6 },
            '大學': { timeLimit: 120, poemMinRating: 3, maxMistakeCount: 3, fireRate: 0.65, baseSpeed: 50, speedInc: 8, maxSpeed: 350, lineCount: 8 },
            '研究所': { timeLimit: 120, poemMinRating: 3, maxMistakeCount: 3, fireRate: 0.6, baseSpeed: 50, speedInc: 9, maxSpeed: 400, lineCount: 8 }
        },

        enemyDirection: 1, // 1 向右, -1 向左
        currentEnemySpeed: 0,

        init: function () {
            if (this.container) return;
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game6-container';
            div.className = 'game6-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game6-header">
                    <div class="game6-score-board">得分: <span id="game6-score">0</span></div>
                    <div class="game6-controls">
                        <button class="game6-difficulty-tag" id="game6-diff-tag">小學</button>
                        <button id="game6-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game6-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game6-sub-header">
                    <div id="game6-hearts" class="game6-hearts"></div>
                </div>
                <div id="game6-progress" class="game6-progress-strip">
                </div>
                <div class="game6-area">
                    <svg id="game6-timer-ring">
                        <rect id="game6-timer-path" x="3" y="3"></rect>
                    </svg>
                    <canvas id="game6-canvas"></canvas>
                </div>
                <div class="game6-footer">
                    <div class="game6-drag-hint">左右拖曳以移動玩家 (按住或連按以發動連按)</div>
                </div>
                </div>
            `;
            document.body.appendChild(div);
            this.container = div;
            this.canvas = document.getElementById('game6-canvas');
            this.ctx = this.canvas.getContext('2d');
        },

        bindEvents: function () {
            document.getElementById('game6-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game6-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game6-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 綁定容器事件以支援拖曳與連發
            const dragArea = this.container;

            // 觸控事件
            dragArea.addEventListener('touchstart', (e) => {
                this.touchStartX = e.touches[0].clientX;
                this.dragStartX = this.player.x;
                this.player.isFiring = true; // 開始連發射擊
            }, { passive: true });

            dragArea.addEventListener('touchmove', (e) => {
                if (!this.isActive || this.isPausedForPowerUp) return;
                const dx = e.touches[0].clientX - this.touchStartX;
                this.movePlayer(this.dragStartX + dx);
            }, { passive: true });

            dragArea.addEventListener('touchend', () => {
                this.player.isFiring = false; // 停止連發射擊
            });
            dragArea.addEventListener('touchcancel', () => {
                this.player.isFiring = false;
            });

            // 滑鼠事件
            let isDragging = false;
            dragArea.addEventListener('mousedown', (e) => {
                // 如果是在點擊獎勵選擇時，不執行連發行為
                if (this.isPausedForPowerUp) return;
                isDragging = true;
                this.touchStartX = e.clientX;
                this.dragStartX = this.player.x;
                this.player.isFiring = true; // 滑鼠按下開始射擊
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging || !this.isActive || this.isPausedForPowerUp) return;
                const dx = e.clientX - this.touchStartX;
                this.movePlayer(this.dragStartX + dx);
            });

            window.addEventListener('mouseup', () => {
                isDragging = false;
                this.player.isFiring = false; // 放開按鍵停止射擊
            });

            // 獎勵點擊事件
            this.canvas.addEventListener('mousedown', (e) => {
                if (!this.isActive || !this.isPausedForPowerUp) return;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const clickX = (e.clientX - rect.left) * scaleX;
                const clickY = (e.clientY - rect.top) * scaleY;

                this.handleChestClick(clickX, clickY);
            });

            this.canvas.addEventListener('touchstart', (e) => {
                if (!this.isActive || !this.isPausedForPowerUp) return;
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const clickX = (e.touches[0].clientX - rect.left) * scaleX;
                const clickY = (e.touches[0].clientY - rect.top) * scaleY;

                this.handleChestClick(clickX, clickY);
            }, { passive: true });
        },

        movePlayer: function (targetX) {
            if (this.isPausedForPowerUp) return; // 暫停時不能移動
            const margin = 10;
            const minX = margin + this.player.width / 2;
            const maxX = this.canvas.width - margin - this.player.width / 2;
            this.player.x = Math.max(minX, Math.min(maxX, targetX));
        },

        handleChestClick: function (x, y) {
            const boxSizeWidth = this.ui.powerUpBoxSizeWidth * this.u;
            const boxSizeHeight = this.ui.powerUpBoxSizeHeight * this.u;
            for (let i = 0; i < this.chestItems.length; i++) {
                const c = this.chestItems[i];
                // 檢查是否點擊到寶箱區域
                if (x > c.x - boxSizeWidth / 2 && x < c.x + boxSizeWidth / 2 && y > c.y - boxSizeHeight / 2 && y < c.y + boxSizeHeight / 2) {
                    this.applyPowerUp(c.type);
                    this.chestItems = [];
                    break;
                }
            }
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();


            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩陣侵略', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    const container = document.getElementById('game6-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.style.overflow = 'hidden';
                        document.body.classList.add('overlay-active');
                    }

                    this.setupCanvas();
                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game6-diff-tag');
            const retryBtn = document.getElementById('game6-retryGame-btn');
            const newBtn = document.getElementById('game6-newGame-btn');
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
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
        },

        show: function () {
            this.init();

            // 確保主頁面的 IntroOverlay 隱藏
            const intro = document.getElementById('introOverlay');
            if (intro && !intro.classList.contains('hidden')) {
                intro.classList.add('hidden', 'hide-fade');
                document.body.classList.remove('overlay-active');
            }

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩陣侵略', (level, levelIndex) => {
                    this.difficulty = level;
                    this.isLevelMode = (levelIndex !== undefined); // Set isLevelMode here too
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[level];
                    if (!settings) return;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden'; // Add this line
                    document.body.classList.add('overlay-active');
                    this.setupCanvas();
                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            }
        },

        setupCanvas: function () {
            const area = document.querySelector('.game6-area');
            this.canvas.width = area.offsetWidth;
            this.canvas.height = area.offsetHeight;

            // 使用 rem 作為基本單位，確保在不同解析度下有一致的顯示效果
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            this.u = rootFontSize;

            // 初始化玩家尺寸
            this.player.width = this.ui.playerWidth * this.u;
            this.player.height = this.ui.playerHeight * this.u;
            this.player.x = this.canvas.width / 2;
        },

        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            } else if (!this.isLevelMode) { // If not explicitly starting a level, and not already in level mode, reset to default difficulty
                // 移除強制重置為小學的邏輯，保留使用者在選單中選定的難度
                this.currentLevelIndex = 1;
            }

            this.updateUIForMode();
            this.score = 0;
            this.mistakeCount = 0;
            this.isWin = false;
            this.resetGameStates();
            this.loadLevel();
            this.startLoop();
            this.startTimer();
            this.renderHearts();
            this.updateScoreUI();
            // 啟用按鈕
            document.getElementById('game6-retryGame-btn').disabled = false;
            document.getElementById('game6-newGame-btn').disabled = false;
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.score = 0;
            this.mistakeCount = 0;
            this.isWin = false;
            this.resetGameStates();
            this.loadLevel(true); // 傳入 true 保持同一首詩
            this.startLoop();
            this.startTimer();
            this.renderHearts();
            this.updateScoreUI();
            // 啟用按鈕
            document.getElementById('game6-retryGame-btn').disabled = false;
            document.getElementById('game6-newGame-btn').disabled = false;
        },

        resetGameStates: function () {
            this.isActive = true;
            this.isPausedForPowerUp = false;
            this.enemies = [];
            this.player.bullets = [];
            this.enemyProjectiles = [];
            this.chestItems = [];
            this.monuments = [];
            this.particles = [];
            // 重置玩家狀態
            this.player.isFiring = false; // 重置射擊狀態
            this.player.swiftLevel = 0;
            this.player.multiShotLevel = 1;
            this.player.pierceLevel = 0;
            this.player.powerUpTime = 0;
            this.player.hitTimer = 0;
            this.lastFired = 0;
            this.isEnding = false; // 重置結束狀態
            if (window.GameMessage) window.GameMessage.hide();
        },

        loadLevel: function (isRetry) {
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.poemMinRating || 4; // Use poemMinRating from settings

            // 如果是重來且已有詩詞，則直接使用目前的題目
            if (isRetry && this.currentPoem) {
                this.createEnemies(this.currentPoem, this.currentPoemLineStart);
            } else {
                // 使用共用函式來取得詩詞，傳入種子
                if (typeof POEMS !== 'undefined') {
                    const result = getSharedRandomPoem(
                        minRating,
                        settings.lineCount, settings.lineCount, 8, 200, "", // 確保選取符合 lineCount 參數的行數，並放寬最大字數限制
                        this.isLevelMode ? this.currentLevelIndex : null, // Seed only in level mode
                        'game6'
                    );
                    if (result) {
                        this.currentPoem = result.poem;
                        this.createEnemies(result.poem, result.startIndex);
                    } else {
                        // 備用方案：確保備用詩詞至少擁有 lineCount 數量的詩句
                        const eligible = POEMS.filter(p => (p.rating || 0) >= minRating && p.content && p.content.length >= settings.lineCount);
                        const fallbackPool = eligible.length > 0 ? eligible : POEMS.filter(p => p.content && p.content.length >= settings.lineCount);
                        const poem = fallbackPool.length > 0 ? fallbackPool[Math.floor(Math.random() * fallbackPool.length)] : POEMS[0];
                        this.currentPoem = poem;
                        this.createEnemies(poem, undefined);
                    }
                }
            }

            // 設置敵人的速度與方向，並依據 rem 縮放速度以確保跨裝置一致
            this.enemyDirection = 1;
            this.currentEnemySpeed = settings.baseSpeed * (this.u / 16);

            // 建立掩體：石碑陣
            const mCount = 4;
            const blockW = this.ui.monumentBlockSize * this.u;
            const blockH = this.ui.monumentBlockSize * this.u;
            const mCols = this.ui.monumentCols;
            const mRows = this.ui.monumentRows;
            const mTotalWidth = mCols * blockW;
            const spacing = this.canvas.width / (mCount + 1);

            for (let i = 0; i < mCount; i++) {
                const startX = spacing * (i + 1) - mTotalWidth / 2;
                const startY = this.canvas.height - 7.5 * this.u; // 底部高度調整
                const blocks = [];
                // 每個掩體由方塊組成
                for (let r = 0; r < mRows; r++) {
                    for (let c = 0; c < mCols; c++) {
                        blocks.push({
                            x: startX + c * blockW,
                            y: startY + r * blockH,
                            w: blockW,
                            h: blockH,
                            alive: true
                        });
                    }
                }
                this.monuments.push({ blocks });
            }
        },

        createEnemies: function (poem, lineStart) {
            const settings = this.difficultySettings[this.difficulty];
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const fontSize = this.ui.enemySize * rootFontSize;
            this.enemyFontSize = fontSize;

            const startY = fontSize / 1; // 1. 文字渲染位置
            const charSpacing = fontSize * this.ui.enemySpacingX; // 敵人字元間距
            const rowSpacing = fontSize * this.ui.enemySpacingY; // 敵人列間距

            // 如果沒有指定 lineStart，則隨機挑選起始行
            if (lineStart === undefined) {
                const possibleStarts = [];
                for (let i = 0; i < poem.content.length; i += 2) {
                    if (i + settings.lineCount - 1 < poem.content.length) possibleStarts.push(i);
                }
                lineStart = possibleStarts.length > 0 ? possibleStarts[Math.floor(Math.random() * possibleStarts.length)] : 0;
            }

            const poemContent = poem.content;
            const linesToShow = [];
            for (let i = 0; i < settings.lineCount; i++) {
                const line = poemContent[lineStart + i];
                if (line) linesToShow.push(line);
            }
            const totalLines = linesToShow.length;
            this.totalEnemyLines = totalLines; // 記錄總行數供之後使用
            this.currentPoemLineStart = lineStart; // 記錄起始行索引

            linesToShow.forEach((line, rowIdx) => {
                const cleanLine = line.replace(/[，。？！、；：「」（）《》]/g, '');
                const rowWidth = cleanLine.length * charSpacing;
                const startX = (this.canvas.width - rowWidth) / 2 + charSpacing / 2;

                // 血量設計：最下層 1, 向上遞增 3, 5, 7...
                const rowHP = ((totalLines - rowIdx) * 2) - 1;

                for (let i = 0; i < cleanLine.length; i++) {
                    this.enemies.push({
                        id: this.nextEnemyId++,
                        char: cleanLine[i],
                        x: startX + i * charSpacing,
                        y: startY + rowIdx * rowSpacing,
                        colIdx: i,
                        hp: rowHP,
                        maxHp: rowHP,
                        alpha: 1.0,
                        rowIdx: rowIdx
                    });
                }
            });

            this.updateProgressUI();
        },

        updateProgressUI: function () {
            const progress = document.getElementById('game6-progress');
            const settings = this.difficultySettings[this.difficulty];
            if (this.currentPoem) {
                // 使用 createEnemies 的起始行
                const lineStart = this.currentPoemLineStart || 0;
                const linesToShow = [];
                for (let i = 0; i < settings.lineCount; i++) {
                    const line = this.currentPoem.content[lineStart + i];
                    if (line) linesToShow.push(line);
                }
                let html = '';

                // 每兩句顯示為一行 (Progress UI)
                for (let i = 0; i < linesToShow.length; i += 2) {
                    const row1 = linesToShow[i].replace(/[，。？！、；：「」（）《》]/g, '');
                    const row2 = linesToShow[i + 1] ? linesToShow[i + 1].replace(/[，。？！、；：「」（）《》]/g, '') : '';

                    html += `<div class="game6-poem-row">`;
                    // 第一句
                    for (let char of row1) {
                        html += `<span class="game6-poem-char" data-row="${i}" data-char="${char}">${char}</span>`;
                    }
                    // 間隔
                    if (row2) html += `<span style="margin: 0 0.5rem; opacity: 0.5;"></span>`;
                    // 第二句
                    for (let char of row2) {
                        html += `<span class="game6-poem-char" data-row="${i + 1}" data-char="${char}">${char}</span>`;
                    }
                    html += `</div>`;
                }
                progress.innerHTML = html;
            }
        },

        startLoop: function () {
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.lastTime = performance.now();
            const loop = (time) => {
                if (!this.isActive) return;
                const dt = (time - this.lastTime) / 1000;
                this.lastTime = time;
                this.update(dt);
                this.draw();
                this.requestID = requestAnimationFrame(loop);
            };
            this.requestID = requestAnimationFrame(loop);
        },

        update: function (dt) {
            const settings = this.difficultySettings[this.difficulty];

            // 如果是獎勵選擇，則暫停更新
            if (this.isPausedForPowerUp) return;

            // 受傷閃爍計時
            if (this.player.hitTimer > 0) {
                this.player.hitTimer -= dt;
            }

            // 更新粒子：在 isEnding 結束前，確保爆炸效果完整
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const part = this.particles[i];
                part.x += part.vx * dt;
                part.y += part.vy * dt;
                part.life -= dt;
                if (part.life <= 0) this.particles.splice(i, 1);
            }

            // 如果是結算畫面，則停止移動物件
            if (this.isEnding) return;

            // 1. 自動發射
            this.player.lastFired += dt;
            const speedMult = 1 + (this.player.swiftLevel * 0.5);
            const rate = settings.fireRate / speedMult;

            if (this.player.isFiring && this.player.lastFired >= rate) {
                this.fireBullet();
                this.player.lastFired = 0;
            }

            // 2. 更新子彈位置
            this.player.bullets.forEach((b, idx) => {
                b.y -= b.speed * dt;
                if (b.y < 0) this.player.bullets.splice(idx, 1);
            });

            // 3. 更新敵人子彈位置
            this.enemyProjectiles.forEach((p, idx) => {
                p.y += p.speed * dt;
                if (p.y > this.canvas.height) this.enemyProjectiles.splice(idx, 1);
            });

            // 敵人移動邏輯 (Space Invaders 經典模式)
            let edgeHit = false;
            const fontSize = this.enemyFontSize || 36;
            const margin = 20;

            // 1. 檢查是否撞牆
            this.enemies.forEach(e => {
                e.x += this.enemyDirection * this.currentEnemySpeed * dt;
                if ((this.enemyDirection > 0 && e.x > this.canvas.width - margin) ||
                    (this.enemyDirection < 0 && e.x < margin)) {
                    edgeHit = true;
                }
            });

            // 2. 執行轉向、加速與下移
            let shiftDown = false;
            if (edgeHit) {
                this.enemyDirection *= -1;
                const maxSpd = settings.maxSpeed * (this.u / 16);
                const incSpd = settings.speedInc * (this.u / 16);
                if (this.currentEnemySpeed < maxSpd) this.currentEnemySpeed += incSpd;
                shiftDown = true;
            }

            // 3. 執行下移與檢測
            let lowestY = 0;
            const px = this.player.x - this.player.width / 2;
            const py = this.canvas.height - this.player.height - 20;

            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                if (shiftDown) {
                    e.y += fontSize / 4; // 每次撞牆下移 1/4 字體高度
                }
                if (e.y > lowestY) lowestY = e.y;

                // 敵人碰撞掩體
                this.monuments.forEach(m => {
                    m.blocks.forEach(b => {
                        if (b.alive && this.rectIntersect(b.x, b.y, b.w, b.h, e.x - 15, e.y - 15, 30, 30)) {
                            b.alive = false;
                        }
                    });
                });

                // 敵人碰撞玩家：觸發失敗
                if (this.rectIntersect(px, py, this.player.width, this.player.height, e.x - 15, e.y - 15, 30, 30)) {
                    this.triggerFailAnimation("詩陣陷落...");
                }
            }

            // 3. 敵人射擊：只有最下層的敵人才會發射子彈
            // 尋找每一行中最下方的敵人
            const bottomEnemies = {};
            this.enemies.forEach(e => {
                if (!bottomEnemies[e.colIdx] || e.rowIdx > bottomEnemies[e.colIdx].rowIdx) {
                    bottomEnemies[e.colIdx] = e;
                }
            });

            Object.values(bottomEnemies).forEach(e => {
                // 產出敵人砲彈機率
                if (Math.random() < 0.0066) {
                    const radius = (this.ui.enemyBulletSize / 2) * this.u;
                    //產出敵人砲彈，速度 = 50 + 0~150 的隨機值
                    this.enemyProjectiles.push({ x: e.x, y: e.y, speed: (50 + Math.random() * 150) * (this.u / 16), radius: radius });
                }
            });

            // 3. 碰撞檢測已移至 enemies.forEach

            // 處理碰撞
            this.checkCollisions();

            // 更新寶箱
            this.chestItems.forEach((c, idx) => {
                // 檢查玩家是否獲得
                const px = this.player.x - this.player.width / 2;
                const py = this.canvas.height - this.player.height - 1.25 * this.u;
                const hitSize = 2.5 * this.u;
                if (this.rectIntersect(px, py, this.player.width, this.player.height, c.x - hitSize / 2, c.y - hitSize / 2, hitSize, hitSize)) {
                    this.applyPowerUp(c.type);
                    this.chestItems = []; // 獲得一項後消失
                }
            });

            // 更新 PowerUp 時間
            if (this.player.powerUp) {
                this.player.powerUpTime -= dt;
                if (this.player.powerUpTime <= 0) this.player.powerUp = null;
            }
        },
        //玩家發射子彈
        fireBullet: function () {
            const bSpeed = 400 * (this.u / 16); // 隨 rem 縮放子彈速度
            const count = this.player.multiShotLevel;
            const spread = 0.5 * this.u; // 玩家發射多發子彈的寬度間隔，與 draw 保持一致
            const gunH = this.ui.gunHeight * this.u;
            const py = this.canvas.height - this.player.height - 1.25 * this.u;

            for (let i = 0; i < count; i++) {
                const off = (i - (count - 1) / 2) * spread;
                this.player.bullets.push({
                    x: this.player.x + off,
                    y: py - gunH,
                    speed: bSpeed,
                    type: this.player.pierceLevel > 0 ? 'pierce' : 'normal',
                    pierceCount: this.player.pierceLevel, // 穿透次數
                    hitHistory: [] // 記錄已命中敵人 ID
                });
            }
        },

        // 產生炸裂粒子效果
        spawnExplosion: function (x, y, color, count) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = (Math.random() * 100 + 50) * (this.u / 16);
                this.particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    color: color,
                    life: Math.random() * 0.5 + 0.2
                });
            }
        },

        checkCollisions: function () {
            // 玩家子彈 vs 敵人
            for (let i = this.player.bullets.length - 1; i >= 0; i--) {
                const b = this.player.bullets[i];
                let hitAny = false;
                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];

                    // 檢查是否已命中此敵人
                    if (b.hitHistory.includes(e.id)) continue;

                    const dist = Math.hypot(b.x - e.x, b.y - e.y);
                    if (dist < 25) {
                        e.hp--;
                        b.hitHistory.push(e.id); // 記錄此敵人已命中

                        // 敵人血量對應透明度
                        e.alpha = 0.1 + (e.hp / e.maxHp) * 0.9;

                        // 普通命中噴發粒子
                        this.spawnExplosion(b.x, b.y, 'yellow', 12);
                        if (window.SoundManager) window.SoundManager.playHit(15, 1.0);

                        if (e.hp <= 0) {
                            // 敵人報銷噴發大量粒子
                            this.spawnExplosion(b.x, b.y, 'yellow', 36);
                            this.destroyEnemy(j, e);
                            if (window.SoundManager) setTimeout(() => window.SoundManager.playHit(22, 2.0), 150);
                        }

                        hitAny = true;
                        if (b.type === 'pierce') {
                            b.pierceCount--;
                            if (b.pierceCount < 0) hitAny = true; // 穿透次數用完，子彈消失
                            else hitAny = false; // 穿透子彈繼續
                        }
                        break;
                    }
                }
                if (hitAny) {
                    this.player.bullets.splice(i, 1);
                    continue; // 已命中，不處理其他
                }

                // 玩家子彈 vs 掩體
                let hitBlock = false;
                for (let j = 0; j < this.monuments.length; j++) {
                    const m = this.monuments[j];
                    for (let k = 0; k < m.blocks.length; k++) {
                        const bNode = m.blocks[k];
                        if (bNode.alive && this.rectIntersect(bNode.x, bNode.y, bNode.w, bNode.h, b.x - 2, b.y - 2, 4, 4)) {
                            bNode.alive = false;
                            hitBlock = true;
                            break;
                        }
                    }
                    if (hitBlock) break;
                }
                if (hitBlock) {
                    this.spawnExplosion(b.x, b.y, 'white', 12); // 命中粒子
                    this.player.bullets.splice(i, 1);
                    if (window.SoundManager) window.SoundManager.playHit(5, 0.6);
                }
            }

            // 雙方子彈攔截，取消，避免玩家不閃躲只以強火力進攻。
            /*
            for (let i = this.player.bullets.length - 1; i >= 0; i--) {
                const b = this.player.bullets[i];
                let hitAny = false;
                for (let j = this.enemyProjectiles.length - 1; j >= 0; j--) {
                    const p = this.enemyProjectiles[j];
                    const dist = Math.hypot(b.x - p.x, b.y - p.y);
                    if (dist < (p.radius + 5)) {
                        // 產生對撞粒子
                        this.spawnExplosion(b.x, b.y, 'yellow', 12);
                        this.spawnExplosion(p.x, p.y, 'white', 12);
                        this.enemyProjectiles.splice(j, 1);
                        if (window.SoundManager) window.SoundManager.playHit(24, 0.15);

                        hitAny = true;
                        if (b.type === 'pierce') {
                            b.pierceCount--;
                            if (b.pierceCount < 0) hitAny = true; // 穿透次數用完，子彈消失
                            else hitAny = false; // 穿透子彈繼續
                        }
                        if (hitAny || b.type === 'pierce') break; // 穿透子彈可攔截多個敵人子彈
                    }
                }
                if (hitAny) {
                    this.player.bullets.splice(i, 1);
                }
            }
            */

            // 敵人子彈 vs 掩體/玩家
            for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
                const p = this.enemyProjectiles[i];

                // 掩體受損檢測
                let hitBlock = false;
                for (let j = 0; j < this.monuments.length; j++) {
                    const m = this.monuments[j];
                    for (let k = 0; k < m.blocks.length; k++) {
                        const bNode = m.blocks[k];
                        if (bNode.alive && this.rectIntersect(bNode.x, bNode.y, bNode.w, bNode.h, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2)) {
                            bNode.alive = false;
                            hitBlock = true;
                            // 敵人命中掩體效果
                            this.spawnExplosion(p.x, p.y, 'white', 12);
                            if (window.SoundManager) window.SoundManager.playHit(5, 0.6);
                            break;
                        }
                    }
                    if (hitBlock) break;
                }
                if (hitBlock) {
                    this.enemyProjectiles.splice(i, 1);
                    continue;
                }

                // 玩家受傷檢測
                const px = this.player.x - this.player.width / 2;
                const py = this.canvas.height - this.player.height - 1.25 * this.u;
                if (this.rectIntersect(px, py, this.player.width, this.player.height, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2)) {
                    this.enemyProjectiles.splice(i, 1);
                    // 敵人命中玩家粒子效果
                    this.spawnExplosion(p.x, p.y, 'hsl(0, 100%, 66%)', 36);
                    this.handlePlayerHit();
                    if (window.SoundManager) window.SoundManager.playHit(2, 1.0);
                    if (window.SoundManager) setTimeout(() => window.SoundManager.playHit(6, 1.5), 150);
                    if (window.SoundManager) setTimeout(() => window.SoundManager.playHit(10, 2.0), 300);
                }
            }
        },

        destroyEnemy: function (idx, e) {
            this.enemies.splice(idx, 1);
            // 敵人死亡得分按行數加成
            // rowIdx 0 為頂端
            const multiplier = (this.totalEnemyLines || 1) - e.rowIdx;
            this.score += 5 * Math.max(1, multiplier);
            this.updateScoreUI();

            // 更新 UI 進度顯示
            const charSpan = document.querySelector(`.game6-poem-char[data-row="${e.rowIdx}"][data-char="${e.char}"]:not(.collected)`);
            if (charSpan) charSpan.classList.add('collected');

            // 檢查是否清場一列，並掉落寶箱
            const remainingInRow = this.enemies.filter(enemy => enemy.rowIdx === e.rowIdx).length;
            if (remainingInRow === 0 && this.enemies.length > 0) {
                this.isPausedForPowerUp = true; // 暫停遊戲
                this.spawnPowerUps();
            }

            if (this.enemies.length === 0) {
                this.isEnding = true;
                // 勝利噴發大量粒子
                const lastX = e.x;
                const lastY = e.y;
                for (let k = 0; k < 3; k++) {
                    setTimeout(() => {
                        // 勝利效果
                        this.spawnExplosion(lastX + (Math.random() - 0.5) * 24, lastY + (Math.random() - 0.5) * 24, 'yellow', 180);
                        if (window.SoundManager) window.SoundManager.playHit(10 * (k + 1), 1.0);
                    }, k * 300);
                }
                setTimeout(() => {
                    this.gameWin();
                }, 1500); // 延遲顯示勝利畫面
            }
        },

        spawnPowerUps: function () {
            const types = ['Swift', 'Multi-shot', 'Pierce'];
            const spacing = this.canvas.width / 4;
            this.chestItems = types.map((t, i) => ({
                type: t,
                x: spacing * (i + 1),
                y: this.canvas.height / 2
            }));
            // 移除延遲，直接顯示讓玩家點擊
        },

        applyPowerUp: function (type) {
            if (window.SoundManager) window.SoundManager.playSuccess();
            // 玩家強化效果
            if (type === 'Swift') {
                this.player.swiftLevel++;
            } else if (type === 'Multi-shot') {
                this.player.multiShotLevel++;
            } else if (type === 'Pierce') {
                this.player.pierceLevel++;
            }
            this.isPausedForPowerUp = false; // 恢復遊戲
            this.lastTime = performance.now(); // 修正時間差
        },

        handlePlayerHit: function () {
            if (window.SoundManager) window.SoundManager.playFailure();
            this.mistakeCount++;
            this.player.hitTimer = 0.5; // 受傷閃爍
            this.renderHearts();
            if (this.mistakeCount >= (this.difficultySettings[this.difficulty].maxMistakeCount || 3)) {
                this.triggerFailAnimation("詩陣失守...");
            }
        },

        triggerFailAnimation: function (reason) {
            if (this.isEnding) return;
            this.isEnding = true;
            this.player.hitTimer = 2.0; // 失败受傷效果
            const px = this.player.x;
            const py = this.canvas.height - this.player.height - 1.25 * this.u;

            // 失敗爆炸效果
            for (let k = 0; k < 3; k++) {
                setTimeout(() => {
                    // 失敗粒子
                    this.spawnExplosion(px + (Math.random() - 0.5) * 24, py + (Math.random() - 0.5) * 24, 'red', 180);
                }, k * 300);
            }
            setTimeout(() => {
                this.gameOver(false, reason);
            }, 1500);
        },

        rectIntersect: function (x1, y1, w1, h1, x2, y2, w2, h2) {
            return x2 < x1 + w1 && x2 + w2 > x1 && y2 < y1 + h1 && y2 + h2 > y1;
        },

        draw: function () {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // 繪製掩體
            this.monuments.forEach(m => {
                m.blocks.forEach(b => {
                    if (b.alive) {
                        this.ctx.fillStyle = 'hsl(45, 50%, 50%)';
                        this.ctx.fillRect(b.x, b.y, b.w, b.h);
                        this.ctx.strokeStyle = 'hsla(45, 50%, 80%, 1.00)';
                        this.ctx.strokeRect(b.x, b.y, b.w, b.h);
                    }
                });
            });

            // 繪製敵人
            const fontSize = this.enemyFontSize || 36;
            this.ctx.font = `${fontSize}px 'Noto Serif TC'`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.enemies.forEach(e => {
                // 發光效果
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = 'hsla(270, 50%, 40%, 0.50)';
                this.ctx.fillStyle = `hsla(0, 0%, 100%, ${e.alpha})`;
                this.ctx.fillText(e.char, e.x, e.y);
            });
            this.ctx.shadowBlur = 0;

            // 繪製粒子
            this.particles.forEach(p => {
                this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = Math.max(0, p.life * 2);
                this.ctx.fillRect(p.x, p.y, 3, 3);
            });
            this.ctx.globalAlpha = 1.0;

            // 繪製玩家子彈
            this.player.bullets.forEach(b => {
                this.ctx.fillStyle = b.type === 'pierce' ? 'gold' : 'yellow';
                this.ctx.beginPath();
                const diameter = b.type === 'pierce' ? this.ui.bulletSizePierce : this.ui.bulletSize;
                const radius = (diameter / 2) * this.u;
                this.ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // 繪製敵人子彈
            this.enemyProjectiles.forEach(p => {
                this.ctx.fillStyle = 'hsl(270, 0%, 80%)';
                this.ctx.beginPath();
                const radius = (this.ui.enemyBulletSize / 2) * this.u;
                this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = 'hsl(270, 0%, 100%)';
                this.ctx.stroke();
            });

            // 繪製玩家
            this.ctx.fillStyle = this.player.hitTimer > 0 ? 'red' : 'hsl(36, 80%, 50%)';
            const px = this.player.x - this.player.width / 2;
            const py = this.canvas.height - this.player.height - 1.25 * this.u;
            this.ctx.fillRect(px, py, this.player.width, this.player.height);
            // 槍管
            const mCount = this.player.multiShotLevel;
            const gunW = this.ui.gunWidth * this.u;
            const gunH = this.ui.gunHeight * this.u;
            const spread = 0.5 * this.u; // 玩家發射多發子彈的寬度間隔，與 fireBullet 保持一致
            for (let i = 0; i < mCount; i++) {
                const off = (i - (mCount - 1) / 2) * spread;
                this.ctx.fillRect(this.player.x + off - gunW / 2, py - gunH, gunW, gunH);
            }

            // 繪製寶箱 UI
            if (this.isPausedForPowerUp) {
                this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold 2rem 'Noto Serif TC'`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText("請選擇強化項目", this.canvas.width / 2, this.canvas.height / 2 - 6.25 * this.u);

                this.chestItems.forEach(c => {
                    const boxSizeWidth = this.ui.powerUpBoxSizeWidth * this.u;
                    const boxSizeHeight = this.ui.powerUpBoxSizeHeight * this.u;
                    this.ctx.fillStyle = 'gold';
                    this.ctx.fillRect(c.x - boxSizeWidth / 2, c.y - boxSizeHeight / 2, boxSizeWidth, boxSizeHeight);
                    this.ctx.strokeStyle = 'white';
                    this.ctx.lineWidth = 2;
                    this.ctx.strokeRect(c.x - boxSizeWidth / 2, c.y - boxSizeHeight / 2, boxSizeWidth, boxSizeHeight);

                    this.ctx.fillStyle = 'black';
                    this.ctx.font = `bold ${1.1 * this.u}px sans-serif`;
                    let label1 = "";
                    let label2 = "";
                    let val = "";
                    if (c.type === 'Swift') {
                        label1 = "快速";
                        label2 = "發射";
                        val = (1.5 + this.player.swiftLevel * 0.5).toFixed(1) + "x";
                    } else if (c.type === 'Multi-shot') {
                        label1 = "多重";
                        label2 = "發射";
                        val = (this.player.multiShotLevel + 1) + " 發";
                    } else if (c.type === 'Pierce') {
                        label1 = "穿透";
                        label2 = "攻擊";
                        val = (this.player.pierceLevel + 1) + " 層";
                    }
                    this.ctx.fillText(label1, c.x, c.y - 1.8 * this.u);
                    this.ctx.fillText(label2, c.x, c.y);
                    this.ctx.fillText(val, c.x, c.y + 2.25 * this.u);
                });
            }

            // 顯示當前狀態值
            this.ctx.fillStyle = 'gold';
            this.ctx.font = "0.75rem sans-serif";
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`速 ${(1.0 + this.player.swiftLevel * 0.5).toFixed(1)}x | 彈 ${this.player.multiShotLevel} | 穿 ${this.player.pierceLevel}`, 10, this.canvas.height - 10);
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            const settings = this.difficultySettings[this.difficulty];
            this.timeLimit = settings.timeLimit;
            this.timeLeft = settings.timeLimit;

            const start = Date.now();
            this.timerInterval = setInterval(() => {
                if (this.isPausedForPowerUp) return; // 暫停時停止計時
                const elapsed = (Date.now() - start) / 1000;
                this.timeLeft = this.timeLimit - elapsed;
                const ratio = Math.max(0, this.timeLeft / this.timeLimit);
                this.updateTimerRing(ratio);

                if (this.timeLeft <= 0) {
                    this.gameOver(false, "時間到！");
                }
            }, 100);
        },

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game6-timer-path');
            const area = document.querySelector('.game6-area');
            if (!rect || !area) return;

            const w = area.offsetWidth;
            const h = area.offsetHeight;
            const svg = document.getElementById('game6-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            rect.setAttribute('width', w - 6);
            rect.setAttribute('height', h - 6);

            const perimeter = (w - 6 + h - 6) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - ratio);
        },

        renderHearts: function () {
            const container = document.getElementById('game6-hearts');
            if (!container) return;
            container.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart' + (i < this.mistakeCount ? ' empty' : '');
                span.textContent = i < this.mistakeCount ? '♡' : '❤️';
                //span.textContent = i < this.mistakeCount ? '💔' : '❤️';
                container.appendChild(span);
            }
        },

        updateScoreUI: function () {
            const el = document.getElementById('game6-score');
            if (el) el.textContent = this.score;
        },

        gameWin: function () {
            this.isActive = false;
            this.isWin = true;
            clearInterval(this.timerInterval);
            document.getElementById('game6-retryGame-btn').disabled = true; // 避免結算時重複點擊
            document.getElementById('game6-newGame-btn').disabled = true;//避免結算時重複點擊
            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game6',
                timerContainerId: 'game6-area',
                scoreElementId: 'game6-score',
                heartsSelector: '#game6-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.score = finalScore;
                    // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                    this.gameOver(true, '');
                }
            });
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            if (win) {
                document.getElementById('game6-retryGame-btn').disabled = true;
                document.getElementById('game6-newGame-btn').disabled = true;
            } else {
                document.getElementById('game6-retryGame-btn').disabled = false;
                document.getElementById('game6-newGame-btn').disabled = false;
            }
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
                    gameKey: 'game6',
                    timerContainerId: 'game6-area',
                    scoreElementId: 'game6-score',
                    heartsSelector: '#game6-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        if (this.isLevelMode) {
                            window.ScoreManager.completeLevel('game6', this.difficulty, this.currentLevelIndex);
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
            if (this.container) this.container.classList.add('hidden');
            document.body.classList.remove('overlay-active');
        }
    };

    window.Game6 = Game6;

    if (new URLSearchParams(window.location.search).get('game') === '6') {
        setTimeout(() => {
            if (window.Game6) window.Game6.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
