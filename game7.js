/* game7.js - 青鳥雲梯 (Flappy Poetry) 大改版 */

(function () {
    'use strict';

    const Game7 = {
        isActive: false,
        state: 'START', // START, PLAYING, LANDED, GAME_OVER, DYING
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 3,

        // 物理參數
        gravity: 0.25,
        jumpForce: 6,
        bird: {
            x: 0,
            y: 0,
            vy: 0,
            width: 60,
            height: 60,
            radius: 30,
            rotation: 0,
            color: "hsl(190, 80%, 60%)"
        },

        // 遊戲元素
        blocks: [], // { text, x, y, size, isLanded, stampOffset, isGoal, index }
        particles: [], // 雲朵粒子

        // 詩詞資料
        currentPoem: null,
        charIndex: 0, // 目前正在前往第幾個字
        poemChars: [], // 去標點的字陣列
        fullPoemRaw: [], // 原始詩句陣列
        hitStatus: [], // 0: pending, 1: hit, 2: skipped

        // 視覺與佈局
        canvas: null,
        ctx: null,
        container: null,
        lastTime: 0,
        requestID: null,

        // 滾動與偏移
        cameraX: 0,
        targetCameraX: 0,
        bgTime: 'morning',

        // 難度設定
        // g:重力, jump:跳躍力, width:方塊寬度, heightVar:高度變異, move:移動, hearts:生命值, speed:速度, minChars:最少字數, stopOnLand:是否停留, stars:詩詞星等
        difficultySettings: {
            '小學': { g: 0.4, jump: 8.0, width: 100, heightVar: 200, move: false, hearts: 5, speed: 100, minChars: 20, stopOnLand: true, stars: 7, time: 90 },
            '中學': { g: 0.45, jump: 10, width: 80, heightVar: 300, move: false, hearts: 4, speed: 120, minChars: 28, stopOnLand: true, stars: 6, time: 90 },
            '高中': { g: 0.5, jump: 12.0, width: 70, heightVar: 400, move: false, hearts: 3, speed: 140, minChars: 40, stopOnLand: false, stars: 5, time: 100 },
            '大學': { g: 0.65, jump: 14.0, width: 60, heightVar: 500, move: true, hearts: 2, speed: 160, minChars: 56, stopOnLand: false, stars: 3, time: 120 },
            '研究所': { g: 0.7, jump: 16.0, width: 50, heightVar: 600, move: true, hearts: 1, speed: 180, minChars: 56, stopOnLand: false, stars: 1, time: 150 }
        },

        init: function () {
            if (this.container) return;
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game7-container';
            div.className = 'game7-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game7-bg-layer bg-morning" id="game7-bg"></div>
                <div class="game7-header">
                    <div class="game7-score-board">
                        <span id="game7-score">0</span>
                    </div>
                    <div class="game7-controls">
                        <button id="game7-restart-btn" class="nav-btn">重來</button>
                        <button id="game7-newGame-btn" class="nav-btn newGame-btn">開新局</button>
                    </div>
                </div>
                <div class="game7-sub-header">
                    <div id="game7-hearts" class="game7-hearts"></div>
                </div>
                <div class="game7-area">
                    <div class="game7-difficulty-tag" id="game7-diff-tag">小學</div>
                    <div class="game7-poem-info">
                        <div class="game7-poem-name" id="game7-poem-display"></div>
                    </div>
                    <svg id="game7-timer-container">
                        <path id="game7-timer-path"></path>
                    </svg>
                    <canvas id="game7-canvas"></canvas>
                </div>
                <div id="game7-message" class="game7-message hidden">
                    <h2 id="game7-msg-title">青鳥雲梯</h2>
                    <div id="game7-msg-content" class="game7-result-poem"></div>
                    <button id="game7-msg-btn" class="game7-btn">開始飛行</button>
                </div>
            `;
            document.body.appendChild(div);
            this.container = div;
            this.canvas = document.getElementById('game7-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.setupTimerPath();
        },

        setupTimerPath: function () {
            const path = document.getElementById('game7-timer-path');
            const area = document.querySelector('.game7-area');
            if (!path || !area) return;
            const w = area.offsetWidth;
            const h = area.offsetHeight;

            // 逆時針路徑：左上 -> 左下 -> 右下 -> 右上 -> 左上
            const d = `M 3 3 V ${h - 3} H ${w - 3} V 3 H 3 Z`;
            path.setAttribute('d', d);

            const perimeter = 2 * (w - 6 + h - 6);
            path.style.strokeDasharray = perimeter;
            path.style.strokeDashoffset = 0;
        },

        bindEvents: function () {
            document.getElementById('game7-restart-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game7-newGame-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.newGame();
            };
            document.getElementById('game7-msg-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (this.state === 'GAME_OVER') {
                    this.retryGame();
                } else {
                    this.startGame();
                }
            };

            const handleTap = (e) => {
                if (!this.isActive || this.state === 'GAME_OVER' || this.state === 'DYING') return;
                if (this.state === 'START') {
                    this.startGame();
                    return;
                }
                this.jump();
                if (e.cancelable) e.preventDefault();
            };

            this.canvas.addEventListener('touchstart', handleTap, { passive: false });
            this.canvas.addEventListener('mousedown', handleTap);

            // 監聽螢幕大小變化
            window.addEventListener('resize', () => {
                if (this.isActive) {
                    this.setupCanvas();
                    this.setupTimerPath();
                }
            });
        },

        show: function () {
            this.init();
            if (window.DifficultySelector) {
                window.DifficultySelector.show('遊戲七：青鳥雲梯', (level) => {
                    this.difficulty = level;
                    document.getElementById('game7-diff-tag').textContent = level;
                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.setupCanvas();
                    this.setupTimerPath(); // 確保路徑有正確寬高
                    this.resetGame();
                    this.showStartMessage();
                });
            }
        },

        setupCanvas: function () {
            const area = document.querySelector('.game7-area');
            this.canvas.width = area.offsetWidth;
            this.canvas.height = area.offsetHeight;
            this.setupTimerPath();
            // 鳥固定在左側 1/4
            this.bird.x = this.canvas.width / 4;
            this.bird.y = this.canvas.height / 2;
            this.bird.vy = 0;
            this.bird.color = "hsl(210, 100%, 50%)"; //起始藍色
        },

        showStartMessage: function () {
            const msg = document.getElementById('game7-message');
            const title = document.getElementById('game7-msg-title');
            const content = document.getElementById('game7-msg-content');
            const btn = document.getElementById('game7-msg-btn');

            title.textContent = "青鳥雲梯";
            content.innerHTML = `<p style="text-align:center">點擊螢幕向上跳躍<br>依序降落在文字方塊上<br>錯過方塊將會損血<br>完成整首詩詞即獲勝</p>`;
            btn.textContent = "開始挑戰";
            msg.classList.remove('hidden');
            this.state = 'START';
            this.startTime = null; // 待開始飛行後才設置計時
        },

        resetGame: function (isRetry = false) {
            const settings = this.difficultySettings[this.difficulty];
            this.score = 0;
            this.mistakeCount = 0;
            this.maxMistakeCount = settings.hearts;
            this.charIndex = 0;
            this.blocks = [];
            this.isActive = true;
            this.gravity = settings.g;
            this.jumpForce = settings.jump;
            this.cameraX = 0;
            this.targetCameraX = 0;
            this.scrollSpeed = settings.speed;
            this.stopOnLand = settings.stopOnLand;
            this.timeLeft = settings.time;
            this.maxTime = settings.time;

            this.updateScoreUI();
            this.renderHearts();
            if (!isRetry) {
                this.loadPoem();
            } else {
                // 如果是重來，重置命中狀態
                this.hitStatus = new Array(this.poemChars.length).fill(0);
            }
            this.timer = settings.time;
            this.maxTimer = settings.time;
            this.timeLeft = settings.time;
            this.maxTime = settings.time;
            this.startTime = null; // 重置計時點

            this.particles = []; // 確保重來或開新局時先清空所有雲
            this.initClouds();
            this.createInitialBlock();
            // 遊戲盤面準備完成後才啟用重來按鈕
            document.getElementById('game7-restart-btn').disabled = false;
        },

        loadPoem: function () {
            if (typeof POEMS !== 'undefined') {
                const settings = this.difficultySettings[this.difficulty];
                const minChars = settings.minChars;
                const minStars = settings.stars || 1;

                let eligible = POEMS.filter(p => {
                    if (p.rating < minStars) return false;
                    let text = p.content.join('').replace(/[，。？！、：；]/g, '');
                    return text.length >= minChars;
                });

                if (eligible.length === 0) eligible = POEMS; // fallback
                this.currentPoem = eligible[Math.floor(Math.random() * eligible.length)];

                // 處理詩詞內容：擷取單數句子 (1, 3, 5...)
                const rawContent = this.currentPoem.content;
                let usedLines = [];
                let totalCharsNoPunct = 0;

                // 研究所難度直接使用整首 (但依然僅取單數句以維持風格?) 
                // 使用者要求所有遊戲都要從單數句子挑選
                for (let i = 0; i < rawContent.length; i += 2) {
                    usedLines.push(rawContent[i]);
                    totalCharsNoPunct = usedLines.join('').replace(/[，。？！、：；]/g, '').length;
                    if (this.difficulty !== '研究所' && totalCharsNoPunct >= minChars) break;
                }

                this.fullPoemRaw = usedLines;
                const textNoPunct = usedLines.join('').replace(/[，。？！、：；]/g, '');
                this.poemChars = textNoPunct.split('');
                this.hitStatus = new Array(this.poemChars.length).fill(0);

                document.getElementById('game7-poem-display').textContent = `《${this.currentPoem.title}》${this.currentPoem.author}`;
            }
        },

        createInitialBlock: function () {
            const settings = this.difficultySettings[this.difficulty];
            const size = settings.width;

            this.blocks.push({
                text: "起",
                x: this.bird.x - size / 2,
                y: this.canvas.height / 2 + 50,
                size: size,
                isLanded: true, // 被降落過，初始平台固定不動
                isGoal: false,
                index: -1, // 起點不計入詩詞字數
                moving: false
            });

            this.bird.y = this.blocks[0].y - this.bird.height / 2;
            this.bird.color = "hsl(190, 100%, 50%)"; // 著陸狀態淺藍色
            this.state = 'LANDED';

            // 預生成
            for (let i = 0; i < 5; i++) {
                this.spawnNextBlock();
            }
        },

        spawnNextBlock: function () {
            const settings = this.difficultySettings[this.difficulty];
            const lastBlock = this.blocks[this.blocks.length - 1];
            const nextIdx = lastBlock.index + 1;

            if (nextIdx >= this.poemChars.length) return; // 已全部生成
            /*水平間距*/
            const minDist = 100;
            const maxDist = 400;
            const dx = minDist + Math.random() * (maxDist - minDist);
            /*相對於上一塊高度*/
            const dy = (Math.random() * 0.66 + 0.33) * (Math.random() < 0.5 ? 1 : -1) * settings.heightVar;
            let targetY = lastBlock.y + dy;
            /*限制上下範圍，避免超出螢幕或難以操作*/
            targetY = Math.max(120, Math.min(this.canvas.height - 120, targetY));

            const char = this.poemChars[nextIdx];
            const isGoal = nextIdx === this.poemChars.length - 1;

            this.blocks.push({
                text: char,
                x: lastBlock.x + dx,
                y: targetY,
                size: settings.width,
                isLanded: false, // 尚未降落
                isGoal: isGoal, // 是否為終點
                index: nextIdx, // 詩詞字數索引
                moving: settings.move && Math.random() > 0.5, // 是否移動
                moveRange: 40 + Math.random() * 40, // 移動範圍
                moveSpeed: 1 + Math.random(), // 移動速度
                initialY: targetY, // 初始y軸位置
                time: Math.random() * Math.PI * 2, // 時間
                isGhost: false, // 是否為已經通過但未降落的深灰色幽靈方塊
                isDisplayCollision: true//settings.stopOnLand // 是否顯示碰撞區域   
            });
        },

        startGame: function () {
            document.getElementById('game7-message').classList.add('hidden');
            this.state = 'LANDED';
            this.startTime = Date.now(); // 記錄開始時間
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.startLoop();
        },

        jump: function () {
            if (window.SoundManager) window.SoundManager.playHit(7, 2);
            this.bird.vy = -this.jumpForce;
            this.bird.color = "hsl(210, 100%, 50%)"; // 飛行狀態
            if (this.state === 'LANDED') {
                this.state = 'PLAYING';
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
            if (this.state === 'GAME_OVER' || this.state === 'START') return;

            // 1.5 秒延遲重啟/死亡特寫
            if (this.state === 'DYING') {
                this.bird.rotation += 0.1;
                return;
            }

            // 選背景色
            const progress = this.charIndex / this.poemChars.length;
            if (progress < 0.33) this.setBg('morning');
            else if (progress < 0.66) this.setBg('afternoon');
            else this.setBg('evening');

            // 物理
            if (this.state === 'PLAYING') {
                this.bird.vy += this.gravity;
                this.bird.y += this.bird.vy;
                this.bird.x += this.scrollSpeed * dt;
                this.bird.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, this.bird.vy * 0.1));

                // 倒數計時
                this.timeLeft -= dt;
                this.timer = Math.max(0, Math.floor(this.timeLeft)); // 分步更新
                if (this.timeLeft <= 0) {
                    this.timeLeft = 0;
                    this.timer = 0;
                    this.gameOver(false, "時光荏苒，壯志未酬...");
                }
                this.updateTimerUI();
            }

            // 塊更新
            this.blocks.forEach(b => {
                if (b.moving && !b.isLanded) {
                    b.time += dt * b.moveSpeed;
                    b.y = b.initialY + Math.sin(b.time) * b.moveRange;
                }
            });

            // 掉落判定
            if (this.bird.y > this.canvas.height - 15) {
                this.handleDeath();
            }

            // 錯過方塊判定 (Skip penalty)
            this.checkSkippedBlocks();

            // 碰撞檢測
            if (this.state === 'PLAYING' && this.bird.vy >= 0) {
                this.checkCollision();
            }

            // 相機
            this.targetCameraX = this.bird.x - this.canvas.width / 4;
            if (this.state === 'PLAYING') {
                this.cameraX = this.targetCameraX;
            } else {
                this.cameraX += (this.targetCameraX - this.cameraX) * 0.1;
            }

            // 生成新塊
            const lastB = this.blocks[this.blocks.length - 1];
            if (lastB.x - this.cameraX < this.canvas.width + 300) {
                this.spawnNextBlock();
            }

            this.updateClouds(dt);
        },

        checkSkippedBlocks: function () {
            // 如果鳥已經飛過方塊的右緣，且該方塊未著陸，則視為錯過
            const birdLeft = this.bird.x - this.bird.width / 2;
            this.blocks.forEach(b => {
                if (b.index >= 0 && !b.isLanded && !b.isGhost && birdLeft > b.x + b.size) {
                    b.isGhost = true; // 標記為錯過
                    this.hitStatus[b.index] = 2; // skipped
                    if (window.SoundManager) window.SoundManager.playFailure();
                    this.mistakeCount++;
                    this.renderHearts();
                    if (this.mistakeCount >= this.maxMistakeCount) {
                        if (window.SoundManager) window.SoundManager.playSadTriple();
                        this.gameOver(false, "體力耗盡，折翼於詩雲深處...");
                    }
                }
            });
        },

        checkCollision: function () {
            const bx = this.bird.x;
            const by = this.bird.y + 15; // 橢圓形底部 (半長軸 22.5, 半短軸 15)
            const ellipseHalfW = 22.5; // 橢圓形水平半徑

            for (let i = 0; i < this.blocks.length; i++) {
                const b = this.blocks[i];
                if (b.isGhost) continue;

                // 檢查橢圓形與方塊上緣的水平重疊 (簡化碰撞判定為橢圓底部切線)
                if (b.isDisplayCollision && bx + ellipseHalfW > b.x && bx - ellipseHalfW < b.x + b.size) {
                    const barHeight = b.size / 20;
                    const threshold = Math.max(barHeight, this.bird.vy + 5);
                    // 只有在平台頂部邊緣判定著陸
                    if (by >= b.y - threshold && by <= b.y + barHeight) {
                        this.landOn(b);
                        if (window.SoundManager) window.SoundManager.playHit(22, 1.5);
                        break;
                    }
                }
            }
        },

        landOn: function (block) {
            //this.bird.y = block.y - this.bird.height / 2; // 取消鳥的y軸修正
            this.bird.vy = 0;
            this.bird.color = "hsl(190, 100%, 50%)"; // 降落不透明淺藍色

            if (this.stopOnLand) { //著陸後要停止
                this.state = 'LANDED';
            } else { //著陸後不停止
                // 如果降落後不停止，則方塊變藍色，方塊上緣的白色長條形消失，鳥繼續掉
                if (block.index >= 0 && !block.isLanded && !block.isGhost) {
                    //block.isGhost = true;
                    block.isDisplayCollision = false; // 隱藏碰撞區域
                    this.state = 'PLAYING';
                    // 擊中也算分數，但會穿透
                    this.processHit(block);
                }
            }

            if (!block.isLanded) {
                this.processHit(block);
            }
        },

        processHit: function (block) {
            block.isLanded = true;
            if (block.index >= 0) {
                this.charIndex++;
                this.score += 5;
                this.hitStatus[block.index] = 1; // hit
                this.updateScoreUI();
                if (window.SoundManager) window.SoundManager.playSuccess();
                this.playDonSound();
                if (block.isGoal) this.gameWin();
            }
        },

        handleDeath: function () {
            if (window.SoundManager) window.SoundManager.playFailure();
            this.state = 'DYING';
            this.bird.y = this.canvas.height - 30;
            this.bird.vy = 0;
            this.bird.rotation = 0; // 重置俯衝/翻滾角度

            setTimeout(() => {
                this.mistakeCount++;
                this.renderHearts();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    if (window.SoundManager) window.SoundManager.playSadTriple();
                    this.gameOver(false, "墜落九泉，詩意盡失...");
                } else {
                    // 尋找最後一個成功著陸的平台 (Checkpoint)
                    const lastLanded = this.blocks.filter(b => b.isLanded).pop();
                    if (lastLanded) {
                        this.bird.x = lastLanded.x + lastLanded.size / 2;
                        this.bird.y = lastLanded.y - this.bird.height / 2;
                        this.bird.vy = 0;
                        this.bird.rotation = 0;
                        this.bird.color = "hsl(190, 100%, 50%)"; // 降落狀態
                        this.state = 'LANDED';
                        // 修正相機位置
                        this.cameraX = this.bird.x - this.canvas.width / 4;
                    } else {
                        // 回到起點
                        this.bird.x = this.canvas.width / 4;
                        this.bird.y = this.canvas.height / 2;
                        this.bird.vy = 0;
                        this.bird.rotation = 0;
                        this.cameraX = 0;
                        this.targetCameraX = 0;
                        this.resetLevelToLastCheckpoint();
                        this.state = 'START';
                    }
                }
            }, 1500);
        },

        updateTimerUI: function () {
            const path = document.getElementById('game7-timer-path');
            if (!path) return;
            const perimeter = parseFloat(path.style.strokeDasharray);
            const progress = Math.max(0, Math.min(1, this.timeLeft / this.maxTime));
            // 增加 offset 讓線條從左上角開始消失 (CCW)
            path.style.strokeDashoffset = perimeter * (progress - 1);
        },

        resetLevelToLastCheckpoint: function () {
            // 重置塊的狀態，讓玩家可以重新開始飛行
            this.charIndex = 0;
            this.blocks = [];
            this.createInitialBlock();
            this.hitStatus = new Array(this.poemChars.length).fill(0);
        },

        playDonSound: function () {
            if (window.AudioContext || window.webkitAudioContext) {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(150, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.2);
                } catch (e) { }
            }
        },

        draw: function () {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.save();
            this.ctx.translate(-this.cameraX, 0);

            // 畫雲
            this.ctx.fillStyle = "hsla(0, 0%, 100%, 0.2)";
            this.particles.forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });

            // 畫塊
            this.blocks.forEach(b => {
                this.ctx.save();
                this.ctx.translate(b.x + b.size / 2, b.y + b.size / 2);

                if (b.isGhost) {
                    this.ctx.rotate(-30 * Math.PI / 180); // 錯過時向左旋轉 30 度
                    this.ctx.fillStyle = "hsl(0, 0%, 25%)"; // 深灰色
                } else if (b.isGoal) {
                    this.ctx.fillStyle = "gold";
                } else if (b.isLanded) {
                    this.ctx.fillStyle = "hsl(210, 80%, 40%)"; // 藍色
                } else {
                    this.ctx.fillStyle = "hsl(0, 60%, 30%)"; // 預設紅印章色
                }

                // 畫方塊本體
                this.ctx.fillRect(-b.size / 2, -b.size / 2, b.size, b.size);

                // 畫白色頂部著地條
                const barH = b.size / 20;
                let showBar = false;
                if (!b.isGhost && b.isDisplayCollision) {
                    showBar = true;
                }

                if (showBar) {
                    this.ctx.fillStyle = "white";
                    this.ctx.fillRect(-b.size / 2, (-b.size / 2) - barH, b.size, barH);
                }

                // 字 (方塊的 80%)
                const fontSize = b.size * 0.8;
                this.ctx.fillStyle = "white";
                this.ctx.font = `bold ${fontSize}px 'Noto Serif TC'`;
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "middle";
                this.ctx.fillText(b.text, 0, 0);

                this.ctx.restore();
            });

            // 畫鳥
            this.drawBird();
            this.ctx.restore();
        },

        drawBird: function () {
            const b = this.bird;
            this.ctx.save();
            this.ctx.translate(b.x, b.y);
            this.ctx.rotate(b.rotation);

            this.ctx.fillStyle = b.color;
            this.ctx.beginPath();
            this.ctx.ellipse(0, 0, 22.5, 15, 0, 0, Math.PI * 2); // 縮小一半 (原本 45, 30)
            this.ctx.fill();

            this.ctx.fillStyle = "white";
            const wingY = Math.sin(Date.now() * 0.01) * 7.5;
            this.ctx.beginPath();
            this.ctx.moveTo(-7.5, 0);
            this.ctx.quadraticCurveTo(0, -22.5 + wingY, 7.5, 0);
            this.ctx.fill();

            this.ctx.fillStyle = "black";
            this.ctx.beginPath();
            this.ctx.arc(12, -3, 3, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.fillStyle = "orange";
            this.ctx.beginPath();
            this.ctx.moveTo(21, 0);
            this.ctx.lineTo(30, 3);
            this.ctx.lineTo(21, 6);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();
        },

        initClouds: function () {
            this.particles = [];
            for (let i = 0; i < 40; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width * 10,
                    y: Math.random() * this.canvas.height,
                    size: 20 + Math.random() * 60,
                    speed: 0.1 + Math.random() * 0.4
                });
            }
        },

        updateClouds: function (dt) {
            // 刪除超過螢幕左方的雲 (提高執行效率)
            this.particles = this.particles.filter(p => p.x - this.cameraX > -p.size * 2);

            // 如果雲太少，在螢幕右方補充新的雲
            while (this.particles.length < 40) {
                this.particles.push({
                    x: this.cameraX + this.canvas.width + Math.random() * 1000,
                    y: Math.random() * this.canvas.height,
                    size: 20 + Math.random() * 60,
                    speed: 0.1 + Math.random() * 0.4
                });
            }

            this.particles.forEach(p => {
                p.x -= p.speed * dt * 50;
            });
        },

        setBg: function (time) {
            if (this.bgTime === time) return;
            this.bgTime = time;
            document.getElementById('game7-bg').className = `game7-bg-layer bg-${time}`;
        },

        renderResultPoem: function () {
            let html = "";
            let charPos = 0;
            this.fullPoemRaw.forEach(line => {
                for (let char of line) {
                    if (/[，。？！、：；]/.test(char)) {
                        html += `<span class="char-punctuation">${char}</span>`;
                    } else {
                        const status = this.hitStatus[charPos] || 0;
                        const cls = status === 1 ? 'char-hit' : (status === 2 ? 'char-skipped' : 'char-pending');
                        html += `<span class="${cls}">${char}</span>`;
                        charPos++;
                    }
                }
                html += "<br>";
            });
            document.getElementById('game7-msg-content').innerHTML = html;
        },

        gameWin: function () {
            this.isActive = false;
            // 禁用重來按鈕
            document.getElementById('game7-restart-btn').disabled = true;
            if (window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    gameKey: 'game7',
                    difficulty: this.difficulty,
                    scoreElementId: 'game7-score',
                    timerContainerId: 'game7-timer-container',
                    heartsSelector: '#game7-hearts .heart:not(.empty)',
                    onComplete: () => {
                        this.gameOver(true, `大鵬一日同風起，扶搖直上九萬里！<br>成功導讀《${this.currentPoem.title}》`);
                    }
                });
            }
        },

        gameOver: function (isWin, message) {
            this.isActive = false;
            // 僅在挑戰成功 isWin 時停用重來按鍵。失敗則維持可點擊。
            if (isWin) {
                document.getElementById('game7-restart-btn').disabled = true; // 必須在得分表演之前就先禁用重來按鈕
            } else {
                document.getElementById('game7-restart-btn').disabled = false;
            }
            const msg = document.getElementById('game7-message');
            document.getElementById('game7-msg-title').textContent = isWin ? "謫仙凌雲" : "高處不勝寒";
            this.renderResultPoem(); // 顯示有色彩狀態的整首詩
            document.getElementById('game7-msg-btn').textContent = "再次挑戰";
            msg.classList.remove('hidden');
            this.state = 'GAME_OVER';
        },

        retryGame: function () {
            this.resetGame(true); // 傳入 true 表示維持同一首詩
            // 不再自動 startGame，等待玩家點擊後起跳
            document.getElementById('game7-message').classList.add('hidden');
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.startLoop();
        },

        newGame: function () {
            this.resetGame();
            // 不再自動 startGame，等待玩家點擊後起跳
            document.getElementById('game7-message').classList.add('hidden');
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.startLoop();
        },

        updateScoreUI: function () {
            document.getElementById('game7-score').textContent = '得分：' + this.score;
        },

        updateTimerRing: function (ratio) {
            // 這個方法由 ScoreManager 呼叫，用於結算動畫
            this.timeLeft = ratio * this.maxTime;
            this.timer = Math.floor(this.timeLeft);
            this.updateTimerUI();
        },

        renderHearts: function () {
            const container = document.getElementById('game7-hearts');
            if (!container) return;
            container.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].hearts;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart' + (i < this.mistakeCount ? ' empty' : '');
                span.textContent = i < this.mistakeCount ? '♡' : '♥';
                container.appendChild(span);
            }
        }
    };

    window.Game7 = Game7;
})();
