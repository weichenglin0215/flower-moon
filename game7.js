/* game7.js - 青鳥雲梯 (Flappy Poetry) 大改版 */

(function () {
    'use strict';

    const Game7 = {
        isActive: false,
        state: 'START', // START, PLAYING, LANDED, GAME_OVER, DYING
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
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
        // timeLimit:時間限制
        // poemMinRating:詩詞星等
        // maxMistakeCount:最大錯誤次數, 
        // g:重力,
        // jump:跳躍力,
        // width:方塊寬度, 
        // maxDist:最大間距, 
        // heightVar:高度變異, 
        // move:移動, 
        // speed:速度, 
        // minChars:最少字數, 
        // maxChars:最多字數, 
        // stopOnLand:是否停留, 
        difficultySettings: {
            '小學': { timeLimit: 100, poemMinRating: 6, maxMistakeCount: 5, g: 0.4, jump: 8.0, width: 90, maxDist: 300, heightVar: 200, move: false, speed: 100, minChars: 10, maxChars: 14, stopOnLand: true },
            '中學': { timeLimit: 110, poemMinRating: 5, maxMistakeCount: 4, g: 0.45, jump: 10, width: 80, maxDist: 275, heightVar: 300, move: false, speed: 120, minChars: 14, maxChars: 20, stopOnLand: true },
            '高中': { timeLimit: 120, poemMinRating: 4, maxMistakeCount: 3, g: 0.5, jump: 12.0, width: 70, maxDist: 250, heightVar: 400, move: false, speed: 140, minChars: 20, maxChars: 28, stopOnLand: false },
            '大學': { timeLimit: 135, poemMinRating: 3, maxMistakeCount: 2, g: 0.65, jump: 14.0, width: 60, maxDist: 225, heightVar: 500, move: true, speed: 160, minChars: 20, maxChars: 56, stopOnLand: false },
            '研究所': { timeLimit: 150, poemMinRating: 2, maxMistakeCount: 1, g: 0.7, jump: 16.0, width: 50, maxDist: 200, heightVar: 600, move: true, speed: 180, minChars: 28, maxChars: 70, stopOnLand: false }
        },

        init: function () {
            if (this.container) return;
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game7-container';
            div.className = 'game7-overlay  hidden';
            div.innerHTML = `
                <div class="game7-bg-layer bg-morning" id="game7-bg"></div>
                <div class="game7-header">
                    <div class="game7-score-board">
                        <span id="game7-score">0</span>
                    </div>
                    <div class="game7-controls">
                        <button class="game7-difficulty-tag" id="game7-diff-tag">小學</button>
                        <button id="game7-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game7-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game7-sub-header">
                    <div id="game7-hearts" class="game7-hearts"></div>
                </div>
                <div class="game7-area">
                    <div class="game7-poem-info">
                        <div class="game7-poem-name" id="game7-poem-display"></div>
                    </div>
                    <svg id="game7-timer-container" style="display: none;">
                        <path id="game7-timer-path"></path>
                    </svg>
                    <canvas id="game7-canvas"></canvas>
                </div>

            `;
            document.body.appendChild(div);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left   = r.left   + 'px';
                    div.style.top    = r.top    + 'px';
                    div.style.width  = 500 + 'px';
                    div.style.height = 850 + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
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
            document.getElementById('game7-retryGame-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game7-newGame-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.newGame();
            };
            document.getElementById('game7-diff-tag').onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
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

        showDifficultySelector: function () {
            this.isActive = false;
            if (window.GameMessage) window.GameMessage.hide();


            if (window.DifficultySelector) {
                window.DifficultySelector.show('青鳥雲梯', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');

                    // 核心修復：使用 setTimeout 確保 DOM 已渲染且 offsetWidth/Height 不為 0
                    setTimeout(() => {
                        this.setupCanvas();
                        this.setupTimerPath();
                        this.resetGame();
                        this.showStartMessage();
                    }, 50);
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game7-diff-tag');
            const retryBtn = document.getElementById('game7-retryGame-btn');
            const newBtn = document.getElementById('game7-newGame-btn');
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
            this.showDifficultySelector();
        },

        stopGame: function () {
            this.isActive = false;
            if (this.requestID) cancelAnimationFrame(this.requestID);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();

            document.body.classList.remove('overlay-active');
            document.body.style.overflow = '';
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
            this.state = 'START';
            if (window.RuleNoteDialog) {
                window.RuleNoteDialog.show({
                    title: '青鳥雲梯',
                    lines: [
                        '點擊螢幕向上跳躍<br>依序降落在文字方塊上',
                        '錯過方塊將會損血<br>降落在最後一塊黃金平台',
                        '完成整首詩詞即獲勝'
                    ],
                    btnText: '開始挑戰',
                    styles: {
                        top: '50%',
                        left: '66%',
                        width: '60%',
                        height: '70%',
                        bg: 'hsla(210, 80%, 25%, 0.6)',
                        titleColor: 'hsl(45, 100%, 70%)',
                        textColor: 'hsl(45, 30%, 90%)',
                        btnBg: 'hsl(210, 70%, 75%)',
                        btnColor: 'hsl(220, 60%, 33%)'
                    },
                    onConfirm: () => {
                        this.startGame();
                    }
                });
            }
            this.startLoop(); // 啟動渲染循環，讓背景雲朵與初始場景顯示出來
        },

        //game7只有resetGame() 透過isRetry控制是否重來或是開新局
        resetGame: function (isRetry = false, levelIndex) {
            if (levelIndex !== undefined) this.currentLevelIndex = levelIndex;
            this.updateUIForMode();
            const settings = this.difficultySettings[this.difficulty];
            this.score = 0;
            this.mistakeCount = 0;
            this.maxMistakeCount = settings.maxMistakeCount;
            this.charIndex = 0;
            this.blocks = [];
            this.isActive = true;
            this.gravity = settings.g;
            this.jumpForce = settings.jump;
            this.cameraX = 0;
            this.targetCameraX = 0;
            this.scrollSpeed = settings.speed;
            this.stopOnLand = settings.stopOnLand;
            this.timeLeft = settings.timeLimit;
            this.maxTime = settings.timeLimit;

            this.updateScoreUI();
            this.renderHearts();
            if (!isRetry) {
                this.loadPoem();
            } else {
                // 如果是重來，重置命中狀態
                this.hitStatus = new Array(this.poemChars.length).fill(0);
            }
            this.timer = settings.timeLimit;
            this.timeLeft = settings.timeLimit;
            this.maxTime = settings.timeLimit;
            this.startTime = null; // 重置計時點

            this.particles = []; // 確保重來或開新局時先清空所有雲
            this.setupCanvas(); // 確保畫布尺寸正確
            this.initClouds();
            this.createInitialBlock();
            // 隨機抽選一首樂譜
            if (window.SoundManager && window.SoundManager.melodyPlayer && window.SoundManager.MelodyScores) {
                const melodies = Object.keys(window.SoundManager.MelodyScores);
                const randomMelody = melodies[Math.floor(Math.random() * melodies.length)];
                window.SoundManager.melodyPlayer.setMelody(randomMelody);
            }
            // 重置樂曲進度
            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }
            // 遊戲盤面準備完成後才啟用重來按鈕
            document.getElementById('game7-retryGame-btn').disabled = false;
            document.getElementById('game7-newGame-btn').disabled = false;
        },

        newGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.resetGame(false, levelIndex);
            if (window.GameMessage) window.GameMessage.hide();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            
            // 開新局顯示規則摘要
            setTimeout(() => {
                this.showStartMessage();
            }, 50);
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.newGame();
        },

        loadPoem: function () {
            if (typeof POEMS !== 'undefined') {
                const settings = this.difficultySettings[this.difficulty];
                const minChars = settings.minChars;
                const maxChars = settings.maxChars;
                const minRating = settings.poemMinRating || 4;

                // 使用共用邏輯取得隨機詩詞，傳入種子
                const result = getSharedRandomPoem(
                    settings.poemMinRating || 4,
                    2, 2, 8, 30, "",
                    this.isLevelMode ? this.currentLevelIndex : null, // 僅在關卡模式下進行種子化
                    'game7'
                );
                if (result) {
                    this.currentPoem = result.poem;
                } else {
                    let eligible = POEMS.filter(p => {
                        if ((p.rating || 0) < minRating) return false;
                        let text = p.content.join('').replace(/[，。？！、：；「」『』\s]/g, '');
                        return text.length >= minChars && text.length <= maxChars;
                    });
                    if (eligible.length === 0) eligible = POEMS; // fallback
                    this.currentPoem = eligible[Math.floor(Math.random() * eligible.length)];
                }

                // 處理詩詞內容：從 startIndex 開始，擷取兩兩一對的句子 (1+2, 3+4...)
                const rawContent = this.currentPoem.content;
                let usedLines = [];
                let totalCharsNoPunct = 0;
                let startIndex = result ? result.startIndex : 0;
                // 確保從偶數行開始 (對應 1,3,5,7 句，即索引 0,2,4,6)
                startIndex = startIndex - (startIndex % 2);

                for (let i = startIndex; i < rawContent.length; i += 2) {
                    if (i + 1 < rawContent.length) {
                        usedLines.push(rawContent[i]);
                        usedLines.push(rawContent[i + 1]);
                        totalCharsNoPunct = usedLines.join('').replace(/[，。？！、：；「」『』\s]/g, '').length;
                        //
                        if (this.difficulty !== '研究所' && totalCharsNoPunct >= minChars) break;
                    }
                }

                this.fullPoemRaw = usedLines;
                const textNoPunct = usedLines.join('').replace(/[，。？！、：；「」『』\s]/g, '');
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
                moving: false,
                isDisplayCollision: true
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
            if (!this.poemChars || this.poemChars.length === 0) return;
            const settings = this.difficultySettings[this.difficulty];
            const size = settings.width;
            const lastB = this.blocks[this.blocks.length - 1];

            // 下一個方塊的索引
            const nextIdx = lastB.index + 1;
            if (nextIdx >= this.poemChars.length) return; // 已全部生成

            // 是否為最後一個 (Goal)
            const isGoal = (nextIdx === this.poemChars.length - 1);

            // 計算水平距離 (增加些微隨機性)
            let dist = size + 80 + Math.random() * settings.maxDist;
            if (this.difficulty === '研究所' || this.difficulty === '大學') dist *= 1.2;

            const x = lastB.x + dist;

            // y 軸變異
            let y = lastB.y + (Math.random() - 0.5) * settings.heightVar;
            // 限制 y 軸範圍，避免超出畫布或太靠頂部
            y = Math.min(this.canvas.height - 120, Math.max(120, y));

            const nextChar = this.poemChars[nextIdx];

            const block = {
                text: nextChar,
                x: x,
                y: y,
                size: size,
                isLanded: false,
                isGoal: isGoal,
                index: nextIdx,
                moving: settings.move,
                moveRange: 40 + Math.random() * 60,
                moveSpeed: 1 + Math.random() * 1.5,
                initialY: y,
                time: Math.random() * Math.PI * 2,
                isDisplayCollision: true
            };

            this.blocks.push(block);
        },

        startGame: function () {
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();
            if (window.GameMessage) window.GameMessage.hide();

            this.state = 'LANDED';
            this.startTime = Date.now(); // 記錄開始時間
            if (this.requestID) cancelAnimationFrame(this.requestID);
            this.startLoop();
        },

        jump: function () {
            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.playNextNote();
            } else if (window.SoundManager) {
                window.SoundManager.playSuccessShort();
            }
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
            // 在任何活躍狀態下都更新雲朵，讓背景有動態感
            this.updateClouds(dt);
            if (this.state === 'GAME_OVER' || this.state === 'START' || this.state === 'GOAL_MISSED') return;

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
                    this.gameOver(false, "時間到！");
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
        },

        checkSkippedBlocks: function () {
            // 如果鳥已經飛過方塊的右緣，且該方塊未著陸，則視為錯過
            const birdLeft = this.bird.x - this.bird.width / 2;
            this.blocks.forEach(b => {
                if (b.index >= 0 && !b.isLanded && !b.isGhost && birdLeft > b.x + b.size) {
                    b.isGhost = true; // 標記為錯過
                    this.hitStatus[b.index] = 2; // skipped
                    if (window.SoundManager) window.SoundManager.playFailure();

                    // 檢查是否為終點平台
                    if (b.isGoal) {
                        this.state = 'GOAL_MISSED'; // 停止飛行物理更新
                        this.goalMissedNotice = true;
                        setTimeout(() => {
                            this.goalMissedNotice = false;
                            this.handleDeath(); // 進入死亡程序 (扣血與判定勝負)
                        }, 4000);
                        return; // 中斷後續判定
                    }

                    this.mistakeCount++;
                    this.renderHearts();
                    if (this.mistakeCount >= this.maxMistakeCount) {
                        if (window.SoundManager) window.SoundManager.playSadTriple();
                        this.gameOver(false, "體力耗盡！");
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
                        //if (window.SoundManager) window.SoundManager.playHit(22, 1.5);
                        if (window.SoundManager && window.SoundManager.melodyPlayer) {
                            window.SoundManager.melodyPlayer.playNextNote();
                        } else if (window.SoundManager) {
                            window.SoundManager.playSuccessShort();
                        }
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
                // 擊中文字，根據window.ScoreManager.gameSettings['game7'].getPointA加分
                this.score += window.ScoreManager.gameSettings['game7'].getPointA;
                this.hitStatus[block.index] = 1; // hit
                this.updateScoreUI();
                if (block.isGoal) this.gameOver(true, '');
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
                    this.gameOver(false, "墜落九泉！");
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

                        // 核心修復：重設前方所有錯過的方塊 (解除灰色傾斜狀態)，確保可重新挑戰終點
                        this.blocks.forEach(b => {
                            if (b.x > lastLanded.x && b.isGhost) {
                                b.isGhost = false;
                                b.isDisplayCollision = true;
                                if (b.index >= 0) this.hitStatus[b.index] = 0;
                            }
                        });
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

            // 顯示錯過終點提示
            if (this.goalMissedNotice) {
                this.ctx.save();
                this.ctx.fillStyle = "hsla(210, 50%, 40%, 0.70)";
                this.ctx.fillRect(0, this.canvas.height / 2 - 80, this.canvas.width, 160);
                this.ctx.fillStyle = "white";
                this.ctx.font = "bold 20px 'Noto Serif TC'";
                this.ctx.textAlign = "center";
                this.ctx.textBaseline = "middle";

                // 1. 將文字拆分為陣列
                const lines = [
                    "已錯過終點平台，停止飛行",
                    "重新開始",
                    "請降落在黃金平台上"
                ];

                // 2. 設定行高 (line height)
                const lineHeight = 40;
                const startY = this.canvas.height / 2 - (lines.length - 1) * lineHeight / 2;

                // 3. 使用迴圈逐行繪製
                lines.forEach((line, index) => {
                    this.ctx.fillText(line, this.canvas.width / 2, startY + index * lineHeight);
                });

                this.ctx.restore();
            }
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
        //在訊息框上顯示完整的詩句
        renderResultPoem: function () {
            let html = '<div style="font-family: serif; line-height: 1.8; font-size: 1.1em;">';
            let charPos = 0;
            this.fullPoemRaw.forEach(line => {
                for (let char of line) {
                    if (/[，。？！、：；]/.test(char)) {
                        html += `<span style="opacity: 0.5;">${char}</span>`;
                    } else {
                        const status = this.hitStatus[charPos] || 0;
                        const color = status === 1 ? '#27ae60' : (status === 2 ? '#c0392b' : '#95a5a6');
                        const weight = status === 1 ? 'bold' : 'normal';
                        html += `<span style="color: ${color}; font-weight: ${weight}; margin: 0 1px;">${char}</span>`;
                        charPos++;
                    }
                }
                html += "<br>";
            });
            html += "</div>";
            return html;
        },

        gameOver: function (isWin, message) {
            this.isActive = false;
            this.isWin = isWin;
            this.state = 'GAME_OVER';

            if (isWin) {
                document.getElementById('game7-retryGame-btn').disabled = true;
                document.getElementById('game7-newGame-btn').disabled = true;
            } else {
                document.getElementById('game7-retryGame-btn').disabled = false;
                document.getElementById('game7-newGame-btn').disabled = false;
            }

            const showMessage = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: isWin,
                        score: isWin ? (finalScore || this.score) : 0,
                        reason: isWin ? "" : (typeof message === 'string' ? message : "挑戰結束"),
                        btnText: isWin ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: () => {
                            if (isWin) {
                                if (this.isLevelMode) this.startNextLevel();
                                else this.newGame();
                            } else {
                                this.retryGame();
                            }
                        }
                    });
                }
            };

            if (isWin && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    gameKey: 'game7',
                    difficulty: this.difficulty,
                    scoreElementId: 'game7-score',
                    timerContainerId: 'game7-timer-container',
                    heartsSelector: '#game7-hearts .heart:not(.empty)',
                    getStarStartPoint: (ratio) => {
                        if (!this.canvas) return null;
                        const rect = this.canvas.getBoundingClientRect();
                        return {
                            x: rect.left + (this.bird.x - this.cameraX),
                            y: rect.top + this.bird.y
                        };
                    },
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        showMessage(finalScore);
                    }
                });
            } else {
                showMessage();
            }
        },

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.resetGame(true); // 傳入 true 表示維持同一首詩
            if (window.GameMessage) window.GameMessage.hide();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            // 延遲重啟循環
            setTimeout(() => {
                this.startLoop();
            }, 50);
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
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart' + (i < this.mistakeCount ? ' empty' : '');
                span.textContent = i < this.mistakeCount ? '♡' : '♥';
                container.appendChild(span);
            }
        }
    };

    window.Game7 = Game7;

    if (new URLSearchParams(window.location.search).get('game') === '7') {
        setTimeout(() => {
            if (window.Game7) window.Game7.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
