/* game6.js - 詩陣侵略 (Poetry Invaders) */

(function () {
    'use strict';

    const Game6 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 3,
        timer: 60,
        timeLeft: 60,
        timerInterval: null,

        // 介面物件尺寸設定 (單位為 rem, 相對於根字體大小)
        ui: {
            // 敵人文字
            enemySize: 1.5,        // 尺寸
            enemySpacingX: 1.4,    // 橫向間隔倍數 (文字尺寸 * 此值)
            enemySpacingY: 1.4,    // 縱向間隔倍數 (文字尺寸 * 此值)

            // 落下砲彈
            enemyBulletSize: 0.2,  // 直徑

            // 地面防禦石碑
            monumentBlockSize: 0.4, // 每一小格的尺寸
            monumentCols: 8,       // 橫向顆數
            monumentRows: 4,       // 縱向顆數

            // 我方砲台
            playerWidth: 2.0,      // 寬度
            playerHeight: 0.8,     // 高度
            gunWidth: 0.3,         // 砲管寬度
            gunHeight: 0.3,        // 砲管高度

            // 我方射擊飛彈
            bulletSize: 0.3,       // 一般彈直徑
            bulletSizePierce: 0.3, // 穿透彈直徑

            // 獎勵介面
            powerUpBoxSizeWidth: 5,    // 黃底白框尺寸
            powerUpBoxSizeHeight: 6    // 黃底白框尺寸
        },

        // 核心遊戲對象
        player: {
            x: 0,
            width: 50,
            height: 20,
            bullets: [],
            fireRate: 0.5, // 秒/發 (由難度設定)
            lastFired: 0,
            // 獎勵能力等級 (可疊加)
            isFiring: false,   // 是否正在按住/觸碰發射
            swiftLevel: 0,     // 射擊速度提升次數
            multiShotLevel: 1, // 同時發射子彈數量
            pierceLevel: 0,    // 穿透敵人數量
            powerUpTime: 0,
            hitTimer: 0       // 受傷閃紅計時器
        },
        enemies: [], // { char, x, y, hp, alpha, rowIdx }
        enemyProjectiles: [],
        chestItems: [], // { type, x, y, width, height }
        monuments: [], // { blocks: [] }
        particles: [], // { x, y, color, life, vx, vy } 爆炸特效
        isPausedForPowerUp: false, // 是否因為選擇獎勵而暫停

        // 視覺與佈局
        canvas: null,
        ctx: null,
        container: null,
        lastTime: 0,
        requestID: null,
        touchStartX: 0,
        dragStartX: 0,

        // 遊戲難度設定
        difficultySettings: {
            // stars: 詩詞星等, lineCount: 敵人由幾句詩組成, baseSpeed: 初始左右移動速度, speedInc: 撞牆後的增加速度, 
            '小學': { time: 90, hearts: 6, fireRate: 0.8, baseSpeed: 60, speedInc: 6, stars: 7, lineCount: 2 },
            '中學': { time: 90, hearts: 5, fireRate: 0.7, baseSpeed: 65, speedInc: 7, stars: 6, lineCount: 4 },
            '高中': { time: 90, hearts: 4, fireRate: 0.6, baseSpeed: 70, speedInc: 8, stars: 5, lineCount: 8 },
            '大學': { time: 105, hearts: 3, fireRate: 0.5, baseSpeed: 75, speedInc: 9, stars: 4, lineCount: 8 },
            '研究所': { time: 120, hearts: 2, fireRate: 0.4, baseSpeed: 80, speedInc: 10, stars: 3, lineCount: 8 }
        },

        enemyDirection: 1, // 1 為右, -1 為左
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
                    <div class="game6-score-board">分數: <span id="game6-score">0</span></div>
                    <div class="game6-controls">
                        <button id="game6-restart-btn" class="nav-btn">重來</button>
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
                    <div class="game6-difficulty-tag" id="game6-diff-tag">小學</div>
                    <div class="game6-drag-hint">左右滑動控制砲台 (按住或拖曳時發射飛彈)</div>
                </div>
                <div id="game6-message" class="game6-message hidden">
                    <h2 id="game6-msg-title">訊息</h2>
                    <p id="game6-msg-content"></p>
                    <button id="game6-msg-btn" class="game6-msg-btn">繼續</button>
                </div>
            `;
            document.body.appendChild(div);
            this.container = div;
            this.canvas = document.getElementById('game6-canvas');
            this.ctx = this.canvas.getContext('2d');
        },

        bindEvents: function () {
            document.getElementById('game6-restart-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game6-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game6-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game6-message').classList.add('hidden');
                if (this.isWin) this.startNewGame();
                else this.retryGame();
            };

            // 改為整個 container 都可以偵測拖曳與發射
            const dragArea = this.container;

            // 觸控事件
            dragArea.addEventListener('touchstart', (e) => {
                this.touchStartX = e.touches[0].clientX;
                this.dragStartX = this.player.x;
                this.player.isFiring = true; // 觸碰開始發射
            }, { passive: true });

            dragArea.addEventListener('touchmove', (e) => {
                if (!this.isActive || this.isPausedForPowerUp) return;
                const dx = e.touches[0].clientX - this.touchStartX;
                this.movePlayer(this.dragStartX + dx);
            }, { passive: true });

            dragArea.addEventListener('touchend', () => {
                this.player.isFiring = false; // 觸碰結束停止發射
            });
            dragArea.addEventListener('touchcancel', () => {
                this.player.isFiring = false;
            });

            // 滑鼠模仿事件
            let isDragging = false;
            dragArea.addEventListener('mousedown', (e) => {
                // 如果是在點擊獎勵方塊，不觸發加速拖曳 (雖然 handleChestClick 也在 canvas 上)
                if (this.isPausedForPowerUp) return;
                isDragging = true;
                this.touchStartX = e.clientX;
                this.dragStartX = this.player.x;
                this.player.isFiring = true; // 滑鼠按住開始發射
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging || !this.isActive || this.isPausedForPowerUp) return;
                const dx = e.clientX - this.touchStartX;
                this.movePlayer(this.dragStartX + dx);
            });

            window.addEventListener('mouseup', () => {
                isDragging = false;
                this.player.isFiring = false; // 放開按鈕停止發射
            });

            // 獎勵選擇點擊事件 (在畫布上點擊)
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
                // 檢查是否點擊到金黃色方塊
                if (x > c.x - boxSizeWidth / 2 && x < c.x + boxSizeWidth / 2 && y > c.y - boxSizeHeight / 2 && y < c.y + boxSizeHeight / 2) {
                    this.applyPowerUp(c.type);
                    this.chestItems = [];
                    break;
                }
            }
        },

        show: function () {
            this.init();
            if (window.DifficultySelector) {
                window.DifficultySelector.show('遊戲六：詩陣侵略', (level) => {
                    this.difficulty = level;
                    this.container.classList.remove('hidden');
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

            // 使用 rem 作為基準單位，確保在不同裝置上比例與視覺效果一致
            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            this.u = rootFontSize;

            // 砲塔尺寸根據 ui 設定調整
            this.player.width = this.ui.playerWidth * this.u;
            this.player.height = this.ui.playerHeight * this.u;
            this.player.x = this.canvas.width / 2;
        },

        startNewGame: function () {
            document.getElementById('game6-diff-tag').textContent = this.difficulty;
            this.score = 0;
            this.mistakeCount = 0;
            this.isWin = false;
            this.resetGameStates();
            this.loadLevel();
            this.startLoop();
            this.startTimer();
            this.renderHearts();
            this.updateScoreUI();
            // 啟用重來按鈕
            document.getElementById('game6-restart-btn').disabled = false;
            document.getElementById('game6-newGame-btn').disabled = false;
        },

        retryGame: function () {

            this.mistakeCount = 0;
            this.resetGameStates();
            this.loadLevel(); // 可以考慮重複同一首詩，或換一首
            this.startLoop();
            this.startTimer();
            this.renderHearts();
            // 啟用重來按鈕
            document.getElementById('game6-restart-btn').disabled = false;
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
            // 重置獎勵等級
            this.player.isFiring = false; // 初始為不發射
            this.player.swiftLevel = 0;
            this.player.multiShotLevel = 1;
            this.player.pierceLevel = 0;
            this.player.powerUpTime = 0;
            this.player.hitTimer = 0;
            this.lastFired = 0;
            this.isEnding = false; // 重置結束狀態
            document.getElementById('game6-message').classList.add('hidden');
        },

        loadLevel: function () {
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.stars || 4;

            // 使用共用邏輯取得隨機詩詞
            if (typeof POEMS !== 'undefined') {
                const result = getSharedRandomPoem(minRating, 4, 8, 20, 200);
                if (result) {
                    this.currentPoem = result.poem;
                    this.createEnemies(result.poem, result.startIndex);
                } else {
                    // 備用方案
                    const eligible = POEMS.filter(p => (p.rating || 0) >= minRating);
                    const poem = eligible.length > 0 ? eligible[Math.floor(Math.random() * eligible.length)] : POEMS[Math.floor(Math.random() * POEMS.length)];
                    this.currentPoem = poem;
                    this.createEnemies(poem, 0);
                }
            }

            // 根據難度設定初始速度與方向
            this.enemyDirection = 1;
            this.currentEnemySpeed = settings.baseSpeed;

            // 創建石碑：四組橫向排列
            const mCount = 4;
            const blockW = this.ui.monumentBlockSize * this.u;
            const blockH = this.ui.monumentBlockSize * this.u;
            const mCols = this.ui.monumentCols;
            const mRows = this.ui.monumentRows;
            const mTotalWidth = mCols * blockW;
            const spacing = this.canvas.width / (mCount + 1);

            for (let i = 0; i < mCount; i++) {
                const startX = spacing * (i + 1) - mTotalWidth / 2;
                const startY = this.canvas.height - 7.5 * this.u; // 底部高度比例
                const blocks = [];
                // 每個石碑由設定的行列數組成
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

            const startY = fontSize / 1; // 1. 緊貼畫布上緣
            const charSpacing = fontSize * this.ui.enemySpacingX; //敵人字的左右間隔
            const rowSpacing = fontSize * this.ui.enemySpacingY; //敵人字的上下間隔

            // 如果沒有傳入 lineStart，則使用隨機策略 (回退用)
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
            this.currentPoemLineStart = lineStart; // 記録起始句索引

            linesToShow.forEach((line, rowIdx) => {
                const cleanLine = line.replace(/[，。？！、：；]/g, '');
                const rowWidth = cleanLine.length * charSpacing;
                const startX = (this.canvas.width - rowWidth) / 2 + charSpacing / 2;

                // 5. 血量計算：最下方 2, 往上 4, 8, 16...
                const rowHP = Math.pow(2, (totalLines - rowIdx));

                for (let i = 0; i < cleanLine.length; i++) {
                    this.enemies.push({
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
                // 使用與 createEnemies 相同的起始句索引
                const lineStart = this.currentPoemLineStart || 0;
                const linesToShow = [];
                for (let i = 0; i < settings.lineCount; i++) {
                    const line = this.currentPoem.content[lineStart + i];
                    if (line) linesToShow.push(line);
                }
                let html = '';

                // 每兩句詩顯示成同一行 (Progress UI 的視覺分行)
                for (let i = 0; i < linesToShow.length; i += 2) {
                    const row1 = linesToShow[i].replace(/[，。？！、：；]/g, '');
                    const row2 = linesToShow[i + 1] ? linesToShow[i + 1].replace(/[，。？！、：；]/g, '') : '';

                    html += `<div class="game6-poem-row">`;
                    // 第一句
                    for (let char of row1) {
                        html += `<span class="game6-poem-char" data-row="${i}" data-char="${char}">${char}</span>`;
                    }
                    // 逗號或間隔
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

            // 如果正在選擇獎勵，則暫停物理更新
            if (this.isPausedForPowerUp) return;

            // 受傷紅閃計時
            if (this.player.hitTimer > 0) {
                this.player.hitTimer -= dt;
            }

            // 更新粒子：在 isEnding 判定之前，確保爆炸特效持續演出
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const part = this.particles[i];
                part.x += part.vx * dt;
                part.y += part.vy * dt;
                part.life -= dt;
                if (part.life <= 0) this.particles.splice(i, 1);
            }

            // 如果正在結束動畫（成功/失敗），則停止其餘物理更新 (子彈、敵人、玩家移動)
            if (this.isEnding) return;

            // 1. 砲台發射：玩家點擊或按住時才發射
            this.player.lastFired += dt;
            const speedMult = 1 + (this.player.swiftLevel * 1.0);
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

            // 敵人整體移動逻辑 (Space Invaders 經典模式)
            let edgeHit = false;
            const fontSize = this.enemyFontSize || 36;
            const margin = 20;

            // 1. 檢查是否碰牆
            this.enemies.forEach(e => {
                e.x += this.enemyDirection * this.currentEnemySpeed * dt;
                if ((this.enemyDirection > 0 && e.x > this.canvas.width - margin) ||
                    (this.enemyDirection < 0 && e.x < margin)) {
                    edgeHit = true;
                }
            });

            // 2. 若碰牆則轉向、加速、準備下移
            let shiftDown = false;
            if (edgeHit) {
                this.enemyDirection *= -1;
                this.currentEnemySpeed += settings.speedInc;
                shiftDown = true;
            }

            // 3. 處理下移與碰撞
            let lowestY = 0;
            const px = this.player.x - this.player.width / 2;
            const py = this.canvas.height - this.player.height - 20;

            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                if (shiftDown) {
                    e.y += fontSize / 4; // 碰牆時向下移動 1/4 字體高度
                }
                if (e.y > lowestY) lowestY = e.y;

                // 文字敵人碰到防禦石碑
                this.monuments.forEach(m => {
                    m.blocks.forEach(b => {
                        if (b.alive && this.rectIntersect(b.x, b.y, b.w, b.h, e.x - 15, e.y - 15, 30, 30)) {
                            b.alive = false;
                        }
                    });
                });

                // 文字敵人碰到砲塔：任務失敗，演出爆破並轉為紅色
                if (this.rectIntersect(px, py, this.player.width, this.player.height, e.x - 15, e.y - 15, 30, 30)) {
                    this.triggerFailAnimation("詩陣入侵，防線崩潰...");
                }
            }

            // 3. 敵人射擊邏輯：只有最下方的敵人會往下方發射子彈
            // 先找出每一列中 rowIdx 最大的敵人
            const bottomEnemies = {};
            this.enemies.forEach(e => {
                if (!bottomEnemies[e.colIdx] || e.rowIdx > bottomEnemies[e.colIdx].rowIdx) {
                    bottomEnemies[e.colIdx] = e;
                }
            });

            Object.values(bottomEnemies).forEach(e => {
                // 基礎發射機率隨難度與石碑數量調整
                if (Math.random() < 0.005) {
                    this.enemyProjectiles.push({ x: e.x, y: e.y, speed: 180, radius: 5 });
                }
            });

            // 3. 取消地平線失敗判斷，目前判斷已移動至 enemies.forEach 內的撞擊砲塔判斷

            // 碰撞檢測
            this.checkCollisions();

            // 更新寶箱
            this.chestItems.forEach((c, idx) => {
                // 檢查玩家是否碰觸
                const px = this.player.x - this.player.width / 2;
                const py = this.canvas.height - this.player.height - 1.25 * this.u;
                const hitSize = 2.5 * this.u;
                if (this.rectIntersect(px, py, this.player.width, this.player.height, c.x - hitSize / 2, c.y - hitSize / 2, hitSize, hitSize)) {
                    this.applyPowerUp(c.type);
                    this.chestItems = []; // 撿起一個，其餘消失
                }
            });

            // 更新 PowerUp 時間
            if (this.player.powerUp) {
                this.player.powerUpTime -= dt;
                if (this.player.powerUpTime <= 0) this.player.powerUp = null;
            }
        },

        fireBullet: function () {
            const bSpeed = 400;
            const count = this.player.multiShotLevel;
            const spread = 0.9 * this.u; // 與 draw 函式中的間距保持一致
            const gunH = this.ui.gunHeight * this.u;
            const py = this.canvas.height - this.player.height - 1.25 * this.u;

            for (let i = 0; i < count; i++) {
                const off = (i - (count - 1) / 2) * spread;
                this.player.bullets.push({
                    x: this.player.x + off,
                    y: py - gunH,
                    speed: bSpeed,
                    type: this.player.pierceLevel > 0 ? 'pierce' : 'normal',
                    pierceCount: this.player.pierceLevel // 剩餘穿透數
                });
            }
        },

        // 產生爆炸特效渲染
        spawnExplosion: function (x, y, color, count) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 100 + 50;
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
                    const dist = Math.hypot(b.x - e.x, b.y - e.y);
                    if (dist < 25) {
                        e.hp--;
                        //敵人血量越低，透明度越低
                        e.alpha = 0.1 + (e.hp / e.maxHp) * 0.9;

                        // 4. 砲彈碰到文字敵人會出現黃色的爆炸特效
                        this.spawnExplosion(b.x, b.y, 'yellow', 12);
                        if (window.SoundManager) window.SoundManager.playHit(15, 1.0);

                        if (e.hp <= 0) {
                            // 4. 砲彈碰到文字敵人死亡了，會出現更大的黃色的爆炸特效
                            this.spawnExplosion(b.x, b.y, 'yellow', 36);
                            this.destroyEnemy(j, e);
                            if (window.SoundManager) setTimeout(() => window.SoundManager.playHit(22, 2.0), 150);
                        }

                        hitAny = true;
                        if (b.type === 'pierce') {
                            b.pierceCount--;
                            if (b.pierceCount < 0) hitAny = true; // 穿透數用完，子彈消失
                            else hitAny = false; // 繼續前進
                        }
                        break;
                    }
                }
                if (hitAny && b.type !== 'pierce') {
                    this.player.bullets.splice(i, 1);
                    continue; // 已經擊中敵人，檢查下一顆子彈
                }

                // 玩家子彈 vs 石碑小方塊 (子彈也會破壞石碑)
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
                    this.spawnExplosion(b.x, b.y, 'white', 12); // 子彈射中石碑的小特效
                    this.player.bullets.splice(i, 1);
                    if (window.SoundManager) window.SoundManager.playHit(5, 0.6);
                }
            }

            // 4. 飛彈與敵人砲彈互相抵消
            for (let i = this.player.bullets.length - 1; i >= 0; i--) {
                const b = this.player.bullets[i];
                for (let j = this.enemyProjectiles.length - 1; j >= 0; j--) {
                    const p = this.enemyProjectiles[j];
                    const dist = Math.hypot(b.x - p.x, b.y - p.y);
                    if (dist < (p.radius + 5)) {
                        // 同時觸發白色與黃色特效
                        this.spawnExplosion(b.x, b.y, 'yellow', 12);
                        this.spawnExplosion(p.x, p.y, 'white', 12);
                        this.player.bullets.splice(i, 1);
                        this.enemyProjectiles.splice(j, 1);
                        if (window.SoundManager) window.SoundManager.playHit(24, 0.15);
                        break;
                    }
                }
            }

            // 敵人攻擊 vs 石碑/玩家
            for (let i = this.enemyProjectiles.length - 1; i >= 0; i--) {
                const p = this.enemyProjectiles[i];

                // 石碑小方塊碰撞 (子彈可破壞個別方塊)
                let hitBlock = false;
                for (let j = 0; j < this.monuments.length; j++) {
                    const m = this.monuments[j];
                    for (let k = 0; k < m.blocks.length; k++) {
                        const bNode = m.blocks[k];
                        if (bNode.alive && this.rectIntersect(bNode.x, bNode.y, bNode.w, bNode.h, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2)) {
                            bNode.alive = false;
                            hitBlock = true;
                            // 3. 敵人砲彈碰到防禦石碑出現白色的爆炸特效
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

                // 玩家碰撞
                const px = this.player.x - this.player.width / 2;
                const py = this.canvas.height - this.player.height - 1.25 * this.u;
                if (this.rectIntersect(px, py, this.player.width, this.player.height, p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2)) {
                    this.enemyProjectiles.splice(i, 1);
                    // 3. 敵人砲彈碰到砲塔會出現紅色的爆炸特效
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
            this.score += 10;
            this.updateScoreUI();

            // 標記進度區已收集 (使用屬性選擇器精確匹配該排的該字)
            const charSpan = document.querySelector(`.game6-poem-char[data-row="${e.rowIdx}"][data-char="${e.char}"]:not(.collected)`);
            if (charSpan) charSpan.classList.add('collected');

            // 2. 檢查是否清空一整排，且非最後一位敵人時才出現三選一獎勵
            const remainingInRow = this.enemies.filter(enemy => enemy.rowIdx === e.rowIdx).length;
            if (remainingInRow === 0 && this.enemies.length > 0) {
                this.isPausedForPowerUp = true; // 暫停遊戲
                this.spawnPowerUps();
            }

            if (this.enemies.length === 0) {
                this.isEnding = true;
                // 完整表演三倍數量的爆破特效 (約 1 秒)
                const lastX = e.x;
                const lastY = e.y;
                for (let k = 0; k < 3; k++) {
                    setTimeout(() => {
                        // 範圍加大兩倍，數量加倍 (原本 30, 分散 50 -> 現在 60, 分散 120)
                        this.spawnExplosion(lastX + (Math.random() - 0.5) * 24, lastY + (Math.random() - 0.5) * 24, 'yellow', 180);
                        if (window.SoundManager) window.SoundManager.playHit(10 * (k + 1), 1.0);
                    }, k * 300);
                }
                setTimeout(() => {
                    this.gameWin();
                }, 1500); // 增加一點停留時間，讓最後的大火光完全燃盡
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
            // 移除原本的 setTimeout，直到選擇獎勵為止都保持暫停
        },

        applyPowerUp: function (type) {
            if (window.SoundManager) window.SoundManager.playSuccess();
            // 獎勵累積邏輯
            if (type === 'Swift') {
                this.player.swiftLevel++;
            } else if (type === 'Multi-shot') {
                this.player.multiShotLevel++;
            } else if (type === 'Pierce') {
                this.player.pierceLevel++;
            }
            this.isPausedForPowerUp = false; // 恢復遊戲
            this.lastTime = performance.now(); // 修正暫停後的 dt
        },

        handlePlayerHit: function () {
            if (window.SoundManager) window.SoundManager.playFailure();
            this.mistakeCount++;
            this.player.hitTimer = 0.5; // 受傷紅閃 0.5 秒
            this.renderHearts();
            if (this.mistakeCount >= (this.difficultySettings[this.difficulty].hearts || 3)) {
                this.triggerFailAnimation("砲塔受損嚴重，墨跡斑駁...");
            }
        },

        triggerFailAnimation: function (reason) {
            if (this.isEnding) return;
            this.isEnding = true;
            this.player.hitTimer = 2.0; // 確保砲塔在表演期間保持紅色
            const px = this.player.x;
            const py = this.canvas.height - this.player.height - 1.25 * this.u;

            // 完整表演三倍數量的紅色被擊中爆破特效 (約 1 秒)
            for (let k = 0; k < 3; k++) {
                setTimeout(() => {
                    // 範圍加大兩倍，數量加倍 (原本 40, 分散 40 -> 現在 80, 分散 100)
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

            // 畫石碑 (每個石碑由 8*3 小正方塊組成)
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

            // 畫敵人
            const fontSize = this.enemyFontSize || 36;
            this.ctx.font = `${fontSize}px 'Noto Serif TC'`;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.enemies.forEach(e => {
                // 紫色霧氣效果
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = 'hsla(270, 50%, 40%, 0.50)';
                this.ctx.fillStyle = `hsla(0, 0%, 100%, ${e.alpha})`;
                this.ctx.fillText(e.char, e.x, e.y);
            });
            this.ctx.shadowBlur = 0;

            // 畫粒子
            this.particles.forEach(p => {
                this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = Math.max(0, p.life * 2);
                this.ctx.fillRect(p.x, p.y, 3, 3);
            });
            this.ctx.globalAlpha = 1.0;

            // 畫玩家子彈
            this.player.bullets.forEach(b => {
                this.ctx.fillStyle = b.type === 'pierce' ? 'gold' : 'yellow';
                this.ctx.beginPath();
                const diameter = b.type === 'pierce' ? this.ui.bulletSizePierce : this.ui.bulletSize;
                const radius = (diameter / 2) * this.u;
                this.ctx.arc(b.x, b.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // 畫敵人墨點
            this.enemyProjectiles.forEach(p => {
                this.ctx.fillStyle = 'hsl(270, 0%, 80%)';
                this.ctx.beginPath();
                const radius = (this.ui.enemyBulletSize / 2) * this.u;
                this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = 'hsl(270, 0%, 100%)';
                this.ctx.stroke();
            });

            // 畫玩家砲台
            this.ctx.fillStyle = this.player.hitTimer > 0 ? 'red' : 'hsl(36, 80%, 50%)';
            const px = this.player.x - this.player.width / 2;
            const py = this.canvas.height - this.player.height - 1.25 * this.u;
            this.ctx.fillRect(px, py, this.player.width, this.player.height);
            // 砲管
            const mCount = this.player.multiShotLevel;
            const gunW = this.ui.gunWidth * this.u;
            const gunH = this.ui.gunHeight * this.u;
            const spread = 0.9 * this.u;
            for (let i = 0; i < mCount; i++) {
                const off = (i - (mCount - 1) / 2) * spread;
                this.ctx.fillRect(this.player.x + off - gunW / 2, py - gunH, gunW, gunH);
            }

            // 畫獎勵 UI
            if (this.isPausedForPowerUp) {
                this.ctx.fillStyle = 'rgba(0,0,0,0.6)';
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillStyle = 'white';
                this.ctx.font = `bold 2rem 'Noto Serif TC'`;
                this.ctx.textAlign = 'center';
                this.ctx.fillText("請選擇獎勵", this.canvas.width / 2, this.canvas.height / 2 - 6.25 * this.u);

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
                        label2 = "射擊";
                        val = (2.0 + this.player.swiftLevel * 1.0).toFixed(1) + "x";
                    } else if (c.type === 'Multi-shot') {
                        label1 = "多發";
                        label2 = "子彈";
                        val = (this.player.multiShotLevel + 1) + " 發";
                    } else if (c.type === 'Pierce') {
                        label1 = "穿透";
                        label2 = "敵機";
                        val = (this.player.pierceLevel + 1) + " 架";
                    }
                    this.ctx.fillText(label1, c.x, c.y - 1.8 * this.u);
                    this.ctx.fillText(label2, c.x, c.y);
                    this.ctx.fillText(val, c.x, c.y + 2.25 * this.u);
                });
            }

            // 顯示目前能力狀態
            this.ctx.fillStyle = 'gold';
            this.ctx.font = "0.75rem sans-serif";
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`速: ${(1.0 + this.player.swiftLevel * 1.0).toFixed(1)}x | 彈: ${this.player.multiShotLevel} | 穿: ${this.player.pierceLevel}`, 10, this.canvas.height - 10);
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            const settings = this.difficultySettings[this.difficulty];
            this.timer = settings.time;
            this.timeLeft = settings.time;

            const start = Date.now();
            this.timerInterval = setInterval(() => {
                if (this.isPausedForPowerUp) return; // 暫停時不計時
                const elapsed = (Date.now() - start) / 1000;
                this.timeLeft = this.timer - elapsed;
                const ratio = Math.max(0, this.timeLeft / this.timer);
                this.updateTimerRing(ratio);

                if (this.timeLeft <= 0) {
                    this.gameOver(false, "時限已過！功虧一簣。");
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
            const max = this.difficultySettings[this.difficulty].hearts;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart' + (i < this.mistakeCount ? ' empty' : '');
                span.textContent = i < this.mistakeCount ? '♡' : '♥';
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
            document.getElementById('game6-restart-btn').disabled = true; // 必須在得分表演之前就先禁用重來按鈕
            document.getElementById('game6-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕
            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game6',
                timerContainerId: 'game6-area',
                scoreElementId: 'game6-score',
                heartsSelector: '#game6-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.gameOver(true, finalScore);
                }
            });
        },

        gameOver: function (win, msg) {
            this.isActive = false;
            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game6-restart-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game6-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game6-restart-btn').disabled = false;
                document.getElementById('game6-newGame-btn').disabled = false;
            }
            clearInterval(this.timerInterval);
            const msgDiv = document.getElementById('game6-message');
            document.getElementById('game6-msg-title').textContent = win ? "擊退詩陣" : "防禦失敗";
            document.getElementById('game6-msg-content').textContent = win ? `詩陣已破！得分：${msg}` : msg;
            msgDiv.classList.remove('hidden');
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

    if (window.location.search.includes('game=6')) {
        setTimeout(() => {
            if (window.Game6) window.Game6.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);
    }
})();
