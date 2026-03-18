(function () {
    // 遊戲十：擊石鳴詩 (Arkanoid Verse)
    const Game10 = {
        isActive: false,        // 遊戲是否進行中
        difficulty: '小學',    // 當前難度
        score: 0,              // 當前分數
        mistakes: 0,           // 當前失誤次數 (掉球)
        maxMistakes: 5,        // 最大允許失誤次數
        currentPoem: null,     // 當前挑戰的詩詞資料

        // 物理與遊戲狀態
        animationFrameId: null, // requestAnimationFrame 的 ID
        lastTime: 0,           // 上一幀的時間戳記
        container: null,       // 遊戲主容器 DOM
        gameArea: null,        // 遊戲遊玩區域 DOM
        paddleEl: null,        // 撞擊條 (Paddle) DOM
        ballEl: null,          // 球 (Ball) DOM
        bricksContainer: null, // 磚塊容器 DOM

        areaRect: { width: 0, height: 0, left: 0, top: 0 }, // 遊玩區域的矩形資訊
        remToPx: 10, // 單位換算：1rem 等於多少像素
        countdown: 0, // 倒數計時秒數
        dropTimer: 0, // 磚塊下移計時器
        pendingSpawnCount: 0, // 正在等待產生的球數 (延遲生成用)

        // 撞擊條狀態 (使用 rem 單位)
        paddle: { x: 0, width: 0, height: 0.8 },
        // 球群狀態
        balls: [],
        ballRadius: 0.4,
        ballSpeed: 0,
        ballMaxSpeed: 0,
        bricks: [], // 磚塊陣列：儲存位置、文字、血量、是否損壞等資訊

        // 難度參數
        difficultySettings: {
            '小學': { stars: 6, growRate: 0.2, dropInterval: 3, dropStep: 0.6, paddleBase: 10, balls: 5, blackHP: 1, lineHeight: 2.0, minLines: 2, minChars: 10, maxChars: 20, maxCharsInLine: 5, ballSpeed: 20, ballMaxSpeed: 30 },
            '中學': { stars: 5, growRate: 0.15, dropInterval: 3, dropStep: 0.5, paddleBase: 9, balls: 5, blackHP: 2, lineHeight: 1.5, minLines: 4, minChars: 14, maxChars: 21, maxCharsInLine: 7, ballSpeed: 22, ballMaxSpeed: 33 },
            '高中': { stars: 4, growRate: 0.1, dropInterval: 3, dropStep: 0.4, paddleBase: 8, balls: 5, blackHP: 3, lineHeight: 1.2, minLines: 4, minChars: 20, maxChars: 28, maxCharsInLine: 9, ballSpeed: 24, ballMaxSpeed: 36 },
            '大學': { stars: 3, growRate: 0.1, dropInterval: 3, dropStep: 0.3, paddleBase: 7, balls: 4, blackHP: 3, lineHeight: 1.0, minLines: 6, minChars: 25, maxChars: 35, maxCharsInLine: 10, ballSpeed: 26, ballMaxSpeed: 39 },
            '研究所': { stars: 2, growRate: 0.1, dropInterval: 3, dropStep: 0.25, paddleBase: 6, balls: 3, blackHP: 3, lineHeight: 1, minLines: 6, minChars: 30, maxChars: 42, maxCharsInLine: 11, ballSpeed: 28, ballMaxSpeed: 42 }
        },

        loadCSS: function () {
            if (!document.getElementById('game10-css')) {
                const link = document.createElement('link');
                link.id = 'game10-css';
                link.rel = 'stylesheet';
                link.href = 'game10.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game10-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game10-container');
            this.gameArea = document.getElementById('game10-area');
            this.paddleEl = document.getElementById('game10-paddle');
            this.ballEl = document.getElementById('game10-ball');
            this.bricksContainer = document.getElementById('game10-bricks-container');

            // 綁定按鈕
            document.getElementById('game10-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game10-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game10-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game10-message').classList.add('hidden');
                if (this.isWin) this.startNewGame();
                else this.retryGame();
            };
            document.getElementById('game10-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 綁定輸入 (Drag)
            this.setupInput();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game10-container';
            div.className = 'game10-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game10-header">
                    <div class="game10-score-board">分數: <span id="game10-score">0</span></div>
                    <div class="game10-controls">
                        <button class="game10-difficulty-tag" id="game10-diff-tag">小學</button>
                        <button id="game10-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game10-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game10-sub-header">
                    <div id="game10-hearts" class="hearts"></div>
                </div>
                <div id="game10-area" class="game10-area">
                    <div id="game10-poem-info" class="game10-poem-info"></div>

                    <!-- 遊玩實體 -->
                    <div id="game10-bricks-container" class="game10-bricks-container"></div>
                    <div id="game10-paddle" class="game10-paddle"></div>
                    <div id="game10-balls-container" class="game10-balls-container"></div>
                    <div id="game10-countdown" class="game10-countdown hidden">3</div>
                </div>

                <div id="game10-message" class="game10-message hidden">
                    <h2 id="game10-msg-title">遊戲結束</h2>
                    <p id="game10-msg-content"></p>
                    <button id="game10-msg-btn" class="nav-btn">再試一次</button>
                </div>
            `;
            document.body.appendChild(div);
        },

        setupInput: function () {
            const handleMove = (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;

                // 將滑鼠座標轉為相對寬度中的座標
                let x = clientX - this.areaRect.left;

                // 轉成 rem
                let remX = x / this.remToPx;

                // 暫存 targetX，在 gameLoop 中平滑移動
                this.paddle.targetX = remX;
            };

            this.gameArea.addEventListener('touchmove', handleMove, { passive: false });
            this.gameArea.addEventListener('mousemove', handleMove);

            const handleDown = (e) => {
                if (!this.isActive) return;
                // e.preventDefault();
                // 遊戲一開始發射球
                if (this.balls.length > 0 && !this.balls[0].isMoving) {
                    this.launchBall();
                }
            };

            this.gameArea.addEventListener('touchstart', handleDown, { passive: false });
            this.gameArea.addEventListener('mousedown', handleDown);
        },

        showDifficultySelector: function () {
            this.isActive = false;
            cancelAnimationFrame(this.animationFrameId);
            document.getElementById('game10-message').classList.add('hidden');

            if (window.DifficultySelector) {
                window.DifficultySelector.show('擊石鳴詩', (level) => {
                    this.difficulty = level;
                    const settings = this.difficultySettings[level];
                    if (!settings) return;
                    // Note: Game 10 uses hearts from settings if available, or default 5
                    this.maxMistakes = settings.maxMistakes || 5;

                    const container = document.getElementById('game10-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.classList.add('overlay-active');
                    }

                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            }
        },

        launchBall: function () {
            if (this.balls.length === 0) return;
            const primaryBall = this.balls[0];
            if (primaryBall.isMoving) return;

            const settings = this.difficultySettings[this.difficulty];
            // 更新目前全域速度為該難度的基準速度 (解決重生速度過快問題)
            this.ballSpeed = settings.ballSpeed;

            primaryBall.isMoving = true;
            // 隨機往左或往右發射
            const angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25); // 向上約75度
            primaryBall.dx = this.ballSpeed * Math.cos(angle);
            primaryBall.dy = this.ballSpeed * Math.sin(angle);

            const cdEl = document.getElementById('game10-countdown');
            if (cdEl) cdEl.classList.add('hidden');
            this.countdown = 0;
        },

        createBall: function (x, y, dx, dy, isMoving = true) {
            const container = document.getElementById('game10-balls-container');
            if (!container) return null;

            const el = document.createElement('div');
            el.className = 'game10-ball';
            container.appendChild(el);

            const ball = {
                x: x,
                y: y,
                dx: dx,
                dy: dy,
                radius: this.ballRadius,
                isMoving: isMoving,
                element: el
            };
            this.balls.push(ball);
            return ball;
        },

        show: function () {
            this.init();

            // 顯示難度選擇器
            if (window.DifficultySelector) {
                this.hideOtherContents();
                window.DifficultySelector.show('擊石鳴詩', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    this.startGameFlow();
                });
            } else {
                this.hideOtherContents();
                this.startGameFlow();
            }
        },

        startGameFlow: function () {
            const settings = this.difficultySettings[this.difficulty];
            this.maxMistakes = settings.balls;

            this.container.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            document.body.classList.add('overlay-active');

            if (window.updateResponsiveLayout) {
                window.updateResponsiveLayout();
            }
            // 等待 layout 計算完成再開始
            setTimeout(() => {
                this.startNewGame();
            }, 100);
        },

        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
            const game1 = document.getElementById('game1-container');
            if (game1) game1.classList.add('hidden');
        },
        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        stopGame: function () {
            this.isActive = false;
            cancelAnimationFrame(this.animationFrameId);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.score = 0;
            this.mistakes = 0;

            // 完全重置磚塊到初始位置與狀態
            this.bricks.forEach(b => {
                b.hp = b.maxHp;
                b.isBroken = false;
                b.y = b.startY; // 回到最初生成的 Y 座標
                if (b.element) {
                    b.element.className = 'game10-brick';
                }
                if (b.innerElement) {
                    b.innerElement.className = 'game10-brick-inner';
                    b.innerElement.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                }
            });

            this.resetGameRound();
        },

        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            const diffTag = document.getElementById('game10-diff-tag');
            if (diffTag) {
                diffTag.textContent = this.difficulty;
                diffTag.setAttribute('data-level', this.difficulty);
            }
            this.score = 0;
            this.mistakes = 0;
            this.prepareChallenge();
            this.resetGameRound();
        },
        //建立敵陣
        prepareChallenge: function () {
            const settings = this.difficultySettings[this.difficulty];
            // 隨機選取詩詞
            const result = getSharedRandomPoem(settings.stars, settings.minLines, settings.minLines + 2, settings.minChars, settings.maxChars);
            if (!result) {
                alert('找不到符合評分的詩詞。');
                return;
            }
            this.currentPoem = result.poem;

            const info = document.getElementById('game10-poem-info');
            info.innerHTML = `<span>${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}</span>`;
            info.onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };

            // 建立敵陣方塊
            this.bricks = [];
            let contentLines = this.currentPoem.content.slice(result.startIndex, result.startIndex + settings.minLines);

            // 計算螢幕尺寸
            const rect = this.gameArea.getBoundingClientRect();
            this.remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
            const wRem = rect.width / this.remToPx;

            let startY = 2.0; // 從頂部向下偏移一點，避開分數列
            const charWidth = 2.5;  // 磚塊寬度
            const charHeight = 2.5; // 磚塊高度

            // 如果行數超過4，就將整個敵人陣營往上移動，只露出下方四個，降低難度。
            if (contentLines.length > 4) {
                startY = 2.0 - (contentLines.length - 4) * (charHeight + settings.lineHeight);
            }

            contentLines.forEach((line, rowIdx) => {
                let chars = line.split('');

                // 將字數補滿至 maxCharsInLine
                if (settings.maxCharsInLine && chars.length < settings.maxCharsInLine) {
                    const diff = settings.maxCharsInLine - chars.length;
                    const frontCount = Math.floor(diff / 2);
                    const backCount = diff - frontCount;

                    const frontPadding = Array(frontCount).fill('■');
                    const backPadding = Array(backCount).fill('■');
                    chars = [...frontPadding, ...chars, ...backPadding];
                }

                // 排版：計算整句所需寬度
                const totalWidth = chars.length * charWidth;
                let startX = (wRem - totalWidth) / 2;
                // 產生磚塊
                chars.forEach((char, colIdx) => {
                    // 如果是標點，略過或設為 isSpace (為了簡單起見，直接不生成)
                    if (/[，。？！、：；]/.test(char)) return;

                    this.bricks.push({
                        row: rowIdx,
                        col: colIdx,
                        text: char,
                        x: startX + colIdx * charWidth + charWidth / 2, // 中心點
                        y: startY + rowIdx * (charHeight + this.difficultySettings[this.difficulty].lineHeight), // 中心點（配合 CSS translate 居中）
                        startY: startY + rowIdx * (charHeight + this.difficultySettings[this.difficulty].lineHeight), // 紀錄初始位置供重來使用
                        width: charWidth - 0.2, // 留邊距
                        height: charHeight - 0.2,
                        hp: this.difficultySettings[this.difficulty].blackHP + (contentLines.length - rowIdx - 1),
                        maxHp: this.difficultySettings[this.difficulty].blackHP + (contentLines.length - rowIdx - 1), // 初始血量
                        isBroken: false,
                        originalLine: line
                    });
                });
            });

            this.totalRows = contentLines.length;
            this.clearedRows = 0;
            this.renderBricks();
        },

        renderBricks: function () {
            this.bricksContainer.innerHTML = '';
            this.bricks.forEach((b, i) => {
                const el = document.createElement('div');
                el.className = 'game10-brick';
                el.style.width = `${b.width}rem`;
                el.style.height = `${b.height}rem`;
                // 初始化位置設為 0，後續由 updateRender 透過 transform 控制
                el.style.left = '0';
                el.style.top = '0';

                // 內層元素：負責邊框、背景、震動動畫與文字顯示
                const inner = document.createElement('div');
                inner.className = 'game10-brick-inner';
                inner.textContent = b.text;

                el.appendChild(inner);
                this.bricksContainer.appendChild(el);

                b.element = el;
                b.innerElement = inner;
            });
        },

        renderHearts: function () {
            const hearts = document.getElementById('game10-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.maxMistakes; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game10-hearts .heart');
            hearts.forEach((h, i) => {
                if (i < this.mistakes) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        resetGameRound: function (keepBricks = false) {
            this.isActive = true;
            document.getElementById('game10-score').textContent = this.score;
            document.getElementById('game10-message').classList.add('hidden');
            this.renderHearts();
            this.updateHearts();

            // 啟用重來按鈕
            document.getElementById('game10-retryGame-btn').disabled = false;
            document.getElementById('game10-newGame-btn').disabled = false;

            // 計算視窗
            this.areaRect = this.gameArea.getBoundingClientRect();
            this.remToPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
            const wRem = this.areaRect.width / this.remToPx;
            const hRem = this.areaRect.height / this.remToPx;

            // 初始化 Paddle
            const settings = this.difficultySettings[this.difficulty];
            // 計算目前長度：根據 mistakes (掉球次數) 進行放大協助
            const currentPaddleWidth = settings.paddleBase * (1 + settings.growRate * this.mistakes) * (this.areaRect.width / 640);

            this.paddle.width = currentPaddleWidth;
            this.paddle.x = wRem / 2;
            this.paddle.prevX = wRem / 2; // 初始化上一幀位置
            this.paddle.targetX = wRem / 2;
            this.paddle.y = hRem - 2.4;
            this.paddle.velX = 0;

            // 初始化 Ball
            const ballsContainer = document.getElementById('game10-balls-container');
            if (ballsContainer) ballsContainer.innerHTML = '';
            this.balls = [];
            this.ballSpeed = settings.ballSpeed;
            this.ballMaxSpeed = settings.ballMaxSpeed;

            // 建立首顆球
            const startBallX = this.paddle.x;
            const startBallY = this.paddle.y - this.paddle.height / 2 - this.ballRadius;
            this.createBall(startBallX, startBallY, 0, 0, false);

            this.dropTimer = 0; // 重置下移計時

            // 開始倒數計時提醒玩家
            this.countdown = 3.9; // 略大於 3，讓玩家看到 3 兩秒
            const cdEl = document.getElementById('game10-countdown');
            if (cdEl) {
                cdEl.textContent = '3';
                cdEl.classList.remove('hidden');
            }

            this.updateRender();

            if (keepBricks) {
                // 回復血量或位置？ 其實重來可以保留位置就好，或者全部重設 HP
                this.bricks.forEach(b => {
                    b.hp = b.maxHp;
                    b.isBroken = false;
                    if (b.element) {
                        b.element.className = 'game10-brick';
                        if (b.innerElement) {
                            b.innerElement.className = 'game10-brick-inner';
                            b.innerElement.style.backgroundColor = 'rgba(255, 255, 255, 1)';
                        }
                    }
                });
            }

            cancelAnimationFrame(this.animationFrameId);
            this.lastTime = performance.now();
            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        },

        // 遊戲主迴圈
        gameLoop: function (timestamp) {
            if (!this.isActive) return;
            const dt = (timestamp - this.lastTime) / 1000; // 計算幀與幀之間的時間差 (秒)
            this.lastTime = timestamp;

            const wRem = this.areaRect.width / this.remToPx;
            const hRem = this.areaRect.height / this.remToPx;

            // 更新撞擊條位置 (跟隨滑鼠/手指，使用平滑補間)
            this.paddle.prevX = this.paddle.x;
            this.paddle.x += (this.paddle.targetX - this.paddle.x) * 0.4;
            this.paddle.velX = (this.paddle.x - this.paddle.prevX) / dt; // 計算目前的左右移動速度

            // 限制撞擊條邊界，不超出畫面
            if (this.paddle.x - this.paddle.width / 2 < 0) {
                this.paddle.x = this.paddle.width / 2;
                this.paddle.velX = 0;
            }
            if (this.paddle.x + this.paddle.width / 2 > wRem) {
                this.paddle.x = wRem - this.paddle.width / 2;
                this.paddle.velX = 0;
            }

            // 讓所有磚塊根據難度設定定期下移，以消除整數偏移造成的抖動感
            const settings = this.difficultySettings[this.difficulty];
            this.dropTimer += dt;
            if (this.dropTimer >= settings.dropInterval) {
                this.dropTimer = 0;
                const step = settings.dropStep;
                this.bricks.forEach(b => {
                    b.y += step;
                });
            }

            // 計算目前活著的最底端磚塊位置，用於失敗判定
            let lowestActiveBrickY = 0;
            this.bricks.forEach(b => {
                if (!b.isBroken && b.y > lowestActiveBrickY) {
                    lowestActiveBrickY = b.y;
                }
            });

            // 失敗判定：若任一存活磚塊碰到撞擊條 (Paddle) 的 Y 座標
            // 以磚塊中心加上一半高度作為邊界判定
            if (lowestActiveBrickY + 1.25 > this.paddle.y) {
                this.gameOver(false, "詩句下沉到底了！");
                return;
            }

            // 處理倒數計時發射球，時間到就自動發球
            if (this.balls.length > 0 && !this.balls[0].isMoving && this.countdown > 0) {
                this.countdown -= dt;
                const cdEl = document.getElementById('game10-countdown');
                if (cdEl) {
                    const displayVal = Math.max(0, Math.floor(this.countdown));
                    cdEl.textContent = displayVal;
                    if (this.countdown <= 0) {
                        cdEl.classList.add('hidden');
                        // 自動發射球
                        this.launchBall();
                    }
                }
            } else if (this.balls.length > 0 && this.balls[0].isMoving) {
                const cdEl = document.getElementById('game10-countdown');
                if (cdEl) cdEl.classList.add('hidden');
            }

            // 更新球的位置與碰撞處理
            this.balls.forEach((ball, bIdx) => {
                if (ball.isMoving) {
                    // 分次檢測碰撞以增加物理穩定性
                    const steps = 2;
                    for (let s = 0; s < steps; s++) {
                        const stepDt = dt / steps;
                        ball.x += ball.dx * stepDt;
                        ball.y += ball.dy * stepDt;

                        // 牆壁碰撞檢測 (左、右、上)
                        if (ball.x - ball.radius < 0) {
                            ball.x = ball.radius;
                            ball.dx *= -1;
                            this.playSound('porcelain');
                        }
                        if (ball.x + ball.radius > wRem) {
                            ball.x = wRem - ball.radius;
                            ball.dx *= -1;
                            this.playSound('porcelain');
                        }
                        if (ball.y - ball.radius < 0) {
                            ball.y = ball.radius;
                            ball.dy *= -1;
                            this.playSound('porcelain');
                        }

                        // 掉落判定 (出界下缘)
                        if (ball.y + ball.radius > hRem) {
                            this.handleBallDrop(bIdx);
                            return; // 結束此球此步進
                        }

                        // 撞擊條碰撞檢測
                        this.checkPaddleCollision(ball);

                        // 磚塊碰撞檢測
                        this.checkBricksCollision(ball);
                    }

                    // 在球後方隨機產生拖尾粒子效果
                    if (Math.random() < 0.3) {
                        this.createTrailParticle(ball.x, ball.y);
                    }
                } else {
                    // 球尚未發射時，固定在撞擊條上方
                    ball.x = this.paddle.x;
                    ball.y = this.paddle.y - this.paddle.height / 2 - ball.radius;
                }
            });

            // 清理已掉落的球 (由 handleBallDrop 標記其速度或狀態？目前 handleBallDrop 直接操作，要注意迴圈安全)
            this.balls = this.balls.filter(b => !b.toRemove);

            // 更新畫面渲染
            this.updateRender();

            // 勝利判定：所有磚塊皆已消除
            const allBroken = this.bricks.every(b => b.isBroken);
            if (allBroken && this.isActive) {
                this.handleWin();
                return;
            }

            this.animationFrameId = requestAnimationFrame(this.gameLoop.bind(this));
        },

        // 撞擊條碰撞檢測：使用 AABB 盒子模型
        checkPaddleCollision: function (ball) {
            const br = ball.radius;
            const px = this.paddle.x - this.paddle.width / 2;
            const py = this.paddle.y - this.paddle.height / 2;

            // 判斷球體是否與撞擊條矩形重疊
            if (ball.x + br > px &&
                ball.x - br < px + this.paddle.width &&
                ball.y + br > py &&
                ball.y - br < py + this.paddle.height) {

                // 物理優化：只在球往下移動時才進行反彈，防止球困在撞擊條內部
                if (ball.dy > 0) {
                    // 計算碰撞點距離撞擊條中心的偏移值 (-1 到 1)
                    const hitPos = (ball.x - this.paddle.x) / (this.paddle.width / 2);

                    //求出速度
                    const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);

                    // 2. 計算基礎反射角 (假設地面在下方，dy 需反轉)
                    // Math.atan2(y, x) 回傳弧度Radian
                    let reflectionRadian = Math.atan2(-ball.dy, ball.dx);
                    let reflectionDegree = reflectionRadian * (180 / Math.PI); //改成角度
                    //每次碰撞讓角度趨向垂直往上(-90度)
                    reflectionDegree = (reflectionDegree - 90) / 2; //每次撞擊就拉回靠近-90度，平均原有角度與-90之中間。

                    const maxBouncDegree = 15; // 最大偏轉約 15 度 (hitPos 從 -1 到 1)

                    // C 規則：若反彈棒正在移動，根據速度增減反射角度
                    let moveInfluenceDegree = (this.paddle.velX || 0) * 10;
                    if (moveInfluenceDegree > (maxBouncDegree * 2)) {
                        moveInfluenceDegree = maxBouncDegree * 2;
                    }
                    if (moveInfluenceDegree < -(maxBouncDegree * 2)) {
                        moveInfluenceDegree = -(maxBouncDegree * 2);
                    }

                    // 3. 產生隨機誤差 (Random Offset)
                    const offsetDegree = (hitPos * maxBouncDegree) + moveInfluenceDegree;

                    // 4. 套用誤差
                    let finalDegree = reflectionDegree + offsetDegree;
                    if (finalDegree > -10) {
                        finalDegree = -10;
                    }
                    if (finalDegree < -170) {
                        finalDegree = -170;
                    }
                    const finalRadian = finalDegree * (Math.PI / 180);
                    ball.dx = speed * Math.cos(finalRadian);
                    ball.dy = speed * Math.sin(finalRadian);

                    // 修正位置：將球置於撞擊條上方邊界，防止黏球現象
                    ball.y = py - br - 0.1;
                    this.playSound('drum'); // 播放撥弦/鼓聲回饋
                }
            }
        },

        // 磚塊碰撞檢測：檢測球體與每塊存活磚塊的距離
        checkBricksCollision: function (ball) {
            const br = ball.radius;

            for (let i = 0; i < this.bricks.length; i++) {
                let b = this.bricks[i];
                if (b.isBroken) continue; // 略過已擊碎的磚塊

                const hw = b.width / 2;
                const hh = b.height / 2;

                // 尋找磚塊上距離球心最近的點
                let testX = ball.x;
                let testY = ball.y;

                if (ball.x < b.x - hw) testX = b.x - hw;
                else if (ball.x > b.x + hw) testX = b.x + hw;

                if (ball.y < b.y - hh) testY = b.y - hh;
                else if (ball.y > b.y + hh) testY = b.y + hh;

                let distX = ball.x - testX;
                let distY = ball.y - testY;
                let distance = Math.sqrt(distX * distX + distY * distY);

                // 若球心到最近點的距離小於半徑，則發生碰撞
                if (distance <= br) {
                    this.handleBrickHit(b, ball);

                    // 簡單反射邏輯：判斷是牆面碰撞還是頂底碰撞
                    if (Math.abs(distX) > Math.abs(distY)) {
                        ball.dx *= -1;
                    } else {
                        ball.dy *= -1;
                    }

                    this.playSound('chimes'); // 播放編鐘/清亮回饋
                    break; // 每幀只處理一個磚塊碰撞，穩定物理解算
                }
            }
        },

        handleBrickHit: function (brick, ball) {
            brick.hp--;
            this.score += 2;
            document.getElementById('game10-score').textContent = this.score;

            if (brick.innerElement) {
                // 對內層元素發動震動動畫，不干擾外層物理容器的位移
                brick.innerElement.classList.remove('shake');
                void brick.innerElement.offsetWidth; // trigger reflow
                brick.innerElement.classList.add('shake');

                // 根據血量更新內層底色透明度: Alpha = hp / maxHp
                const alpha = Math.max(0, brick.hp / brick.maxHp);
                brick.innerElement.style.backgroundColor = `rgba(255, 255, 255, ${alpha})`;

                this.createShatterParticle(brick.x, brick.y);
            }

            if (brick.hp <= 0) {
                brick.isBroken = true;
                if (brick.element) {
                    brick.element.classList.add('broken');
                }
                if (brick.innerElement) {
                    brick.innerElement.style.backgroundColor = 'transparent';
                }
                if (this.ballSpeed < this.ballMaxSpeed) {
                    // 全域速度略微提升
                    this.ballSpeed *= 1.05;
                    // 更新目前球的速度 (保持方向)
                    const curSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                    const ratio = (curSpeed * 1.05) / curSpeed;
                    ball.dx *= ratio;
                    ball.dy *= ratio;
                }
                this.playSound('shatter'); // 撥放擊破高頻音效
                this.checkRowClear(brick.row, brick.x, brick.y);
            }
        },

        checkRowClear: function (rowIdx, spawnX, spawnY) {
            const rowBricks = this.bricks.filter(b => b.row === rowIdx);
            const isCleared = rowBricks.every(b => b.isBroken);

            if (isCleared) {
                this.clearedRows++;

                // 根據消除的行數 (從底層算起) 產生額外白球
                const settings = this.difficultySettings[this.difficulty];
                const numToSpawn = this.totalRows - rowIdx;
                const baseSpeed = settings.ballSpeed; // 使用難度設定的起始速度

                for (let i = 0; i < numToSpawn; i++) {
                    this.pendingSpawnCount++; // 增加等待計數
                    setTimeout(() => {
                        this.pendingSpawnCount--; // 減少等待計數
                        // 檢查遊戲是否還在進行中，避免在 GameOver 後繼續產生球
                        if (!this.isActive) return;

                        const angle = -Math.PI / 2 + (Math.random() * 0.5 - 0.25);
                        const dx = baseSpeed * Math.cos(angle);
                        const dy = baseSpeed * Math.sin(angle);
                        this.createBall(spawnX, spawnY, dx, dy, true);
                    }, i * 100); // 每一顆新增白球之間有0.1秒的時間差
                }

                this.score += 50;
                document.getElementById('game10-score').textContent = this.score;
            }
        },

        handleBallDrop: function (idx) {
            const ball = this.balls[idx];
            if (!ball) return;

            // 移除 DOM
            if (ball.element && ball.element.parentNode) {
                ball.element.parentNode.removeChild(ball.element);
            }
            ball.toRemove = true;

            // 檢查是否還有存活且正在移動的球，以及是否有即將誕生的球
            const activeBalls = this.balls.filter(b => !b.toRemove);
            if (activeBalls.length === 0 && this.pendingSpawnCount === 0) {
                this.mistakes++;
                this.updateHearts();
                this.playSound('failure');

                // 掉球後放大反彈棒以協助玩家
                const settings = this.difficultySettings[this.difficulty];
                const currentPaddleWidth = settings.paddleBase * (1 + settings.growRate * this.mistakes) * (this.areaRect.width / 640);
                this.paddle.width = currentPaddleWidth;

                if (this.mistakes >= this.maxMistakes) {
                    this.gameOver(false, "掉球次數過多！");
                } else {
                    // 重新建立一顆準備發射的球
                    const wRem = this.areaRect.width / this.remToPx;
                    const hRem = this.areaRect.height / this.remToPx;

                    // 確保球群清空
                    this.balls = [];
                    const container = document.getElementById('game10-balls-container');
                    if (container) container.innerHTML = '';

                    const startBallX = this.paddle.x;
                    const startBallY = this.paddle.y - this.paddle.height / 2 - this.ballRadius;
                    this.createBall(startBallX, startBallY, 0, 0, false);

                    // 開始倒數計時
                    this.countdown = 3.9;
                    const cdEl = document.getElementById('game10-countdown');
                    if (cdEl) {
                        cdEl.textContent = '3';
                        cdEl.classList.remove('hidden');
                    }
                }
            }
        },

        handleWin: function () {
            this.isActive = false;
            cancelAnimationFrame(this.animationFrameId);

            document.getElementById('game10-retryGame-btn').disabled = true;
            document.getElementById('game10-newGame-btn').disabled = true;

            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game10',
                timerContainerId: 'game10-bricks-container', // placeholder
                scoreElementId: 'game10-score',
                heartsSelector: '#game10-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.gameOver(true, "最終得分：" + finalScore);
                }
            });

            // 在其中一顆白球附近放置五個大型煙火
            const targetX = this.balls.length > 0 ? this.balls[0].x : wRem / 2;
            const targetY = this.balls.length > 0 ? this.balls[0].y : hRem / 2;

            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    this.createFirework(targetX + (Math.random() * 4 - 2), targetY + (Math.random() * 4 - 2));
                }, i * 200);
            }
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            cancelAnimationFrame(this.animationFrameId);

            if (win) {
                document.getElementById('game10-retryGame-btn').disabled = true;
                document.getElementById('game10-newGame-btn').disabled = true;
            } else {
                document.getElementById('game10-retryGame-btn').disabled = false;
                document.getElementById('game10-newGame-btn').disabled = false;
            }

            const msgDiv = document.getElementById('game10-message');
            const title = document.getElementById('game10-msg-title');
            const content = document.getElementById('game10-msg-content');

            msgDiv.classList.remove('hidden');
            if (win) {
                title.textContent = "破陣成功！";
                title.style.color = "#28a745";
                content.textContent = reason;
            } else {
                title.textContent = "再接再厲！";
                title.style.color = "#dc3545";
                content.textContent = reason;
            }

            const msgBtn = document.getElementById('game10-msg-btn');
            msgBtn.textContent = win ? "下一局" : "再試一次";
        },

        updateRender: function () {
            // Paddle
            if (this.paddleEl) {
                this.paddleEl.style.width = `${this.paddle.width}rem`;
                this.paddleEl.style.left = `${this.paddle.x}rem`;
                this.paddleEl.style.top = `${this.paddle.y}rem`;
            }
            // Balls
            this.balls.forEach(ball => {
                if (ball.element) {
                    ball.element.style.left = `${ball.x}rem`;
                    ball.element.style.top = `${ball.y}rem`;
                }
            });
            // Bricks down render
            this.bricks.forEach(b => {
                if (b.element) {
                    // 使用 transform: translate3d 提高渲染效能並消除抖動
                    // 座標直接映射自物理引擎中的 b.x 與 b.y
                    b.element.style.transform = `translate3d(-50%, -50%, 0) translate(${b.x}rem, ${b.y}rem)`;
                }
            });
        },

        createTrailParticle: function (x, y) {
            const p = document.createElement('div');
            p.className = 'game10-trail-particle';
            p.style.left = `${x}rem`;
            p.style.top = `${y}rem`;
            this.gameArea.appendChild(p);
            setTimeout(() => {
                if (p.parentNode) p.parentNode.removeChild(p);
            }, 500);
        },

        createShatterParticle: function (x, y) {
            for (let i = 0; i < 6; i++) {
                const p = document.createElement('div');
                p.className = 'game10-shatter-particle'; //文字框碎片
                p.style.left = `${x}rem`;
                p.style.top = `${y}rem`;

                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 2 + 1;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;

                this.gameArea.appendChild(p);

                // 動畫
                setTimeout(() => {
                    p.style.transform = `translate(${dx}rem, ${dy}rem)`;
                    p.style.opacity = '0';
                }, 10);

                setTimeout(() => {
                    if (p.parentNode) p.parentNode.removeChild(p);
                }, 1000);
            }
        },

        playSound: function (type) {
            if (!window.SoundManager) return;
            // Map our sounds to existing SoundManager if custom ones don't exist
            switch (type) {
                case 'porcelain': window.SoundManager.playGuzhengLow(4); break; //撞牆
                case 'drum': window.SoundManager.playConfirmItem(); break; //撞到反彈棒
                case 'chimes': window.SoundManager.playOpenItem(); break; //打中磚塊
                case 'shatter': window.SoundManager.playBreakEnemy(); break; // 高頻擊破聲
                case 'failure': window.SoundManager.playFailure(); break;
            }
        },

        createFirework: function (x, y) {
            for (let i = 0; i < 30; i++) {
                const p = document.createElement('div');
                p.className = 'game10-firework-particle';
                const hue = Math.floor(Math.random() * 60) + 10; // 金黃色系
                p.style.backgroundColor = `hsl(${hue}, 100%, 60%)`;
                p.style.left = `${x}rem`;
                p.style.top = `${y}rem`;

                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 4 + 2;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist;

                this.gameArea.appendChild(p);

                setTimeout(() => {
                    p.style.transform = `translate(${dx}rem, ${dy}rem) scale(0)`;
                    p.style.opacity = '0';
                }, 10);

                setTimeout(() => {
                    if (p.parentNode) p.parentNode.removeChild(p);
                }, 1500);
            }
        }
    };

    window.Game10 = Game10;

    // 自動檢查是否需要啟動
    if (new URLSearchParams(window.location.search).get('game') === '10') {
        setTimeout(() => {
            if (window.Game10) window.Game10.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
