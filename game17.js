// ============================================================
// game17.js — 青蛙過河 (Frog on the Verse)
// 改編自 Frogger (1981)，以詩詞字序為核心玩法
// 玩家點擊漂流的荷葉，依序踩出詩句所有文字，渡河過關
// ============================================================

(function () {
    'use strict';

    const Game17 = {
        // ─── 狀態 ────────────────────────────────────────────────
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        hearts: 5,
        timer: 0,
        maxTimer: 0,
        lastTimestamp: 0,

        // ─── 詩詞 ────────────────────────────────────────────────
        currentPoem: null,
        poemLines: [],
        fullPoemText: '',
        targetIndex: 0,

        // ─── Canvas 狀態 ─────────────────────────────────────────
        canvas: null,
        ctx: null,
        animFrameId: null,
        canvasH: 660,
        rowH: 0,
        jumpRange: 200,

        // ─── 遊戲物件 ────────────────────────────────────────────
        lilyPads: [],
        frog: null,

        // ─── 視覺特效 ────────────────────────────────────────────
        splashes: [],
        floatTexts: [],

        // ─── 佈局常數 ────────────────────────────────────────────
        BANK_W: 55, // 左右岸台寬度（px）

        // ─── 難度設定 ────────────────────────────────────────────
        difficultySettings: {
            '小學':   { timeLimit: 90,  baseSpeed: 50,  decoyRatio: 0.25, hint: 'all',      padsPerRow: 3, sinkDelay: 3000, padRadius: 25, numRows: 4, poemMinRating: 6, minLines: 2, maxLines: 4,  minChars: 10, maxChars: 24  },
            '中學':   { timeLimit: 80,  baseSpeed: 80,  decoyRatio: 0.35, hint: 'sentence', padsPerRow: 3, sinkDelay: 2500, padRadius: 23, numRows: 4, poemMinRating: 5, minLines: 2, maxLines: 4,  minChars: 16, maxChars: 45  },
            '高中':   { timeLimit: 70,  baseSpeed: 110, decoyRatio: 0.45, hint: 'none',     padsPerRow: 2, sinkDelay: 2000, padRadius: 21, numRows: 5, poemMinRating: 4, minLines: 4, maxLines: 6,  minChars: 20, maxChars: 32  },
            '大學':   { timeLimit: 60,  baseSpeed: 140, decoyRatio: 0.55, hint: 'none',     padsPerRow: 2, sinkDelay: 1500, padRadius: 19, numRows: 5, poemMinRating: 3, minLines: 4, maxLines: 8,  minChars: 40, maxChars: 60  },
            '研究所': { timeLimit: 50,  baseSpeed: 200, decoyRatio: 0.65, hint: 'none',     padsPerRow: 2, sinkDelay: 800,  padRadius: 17, numRows: 6, poemMinRating: 3, minLines: 6, maxLines: 12, minChars: 60, maxChars: 100 },
        },

        // ── 載入 CSS ─────────────────────────────────────────────
        loadCSS: function () {
            if (!document.getElementById('game17-css')) {
                const link = document.createElement('link');
                link.id   = 'game17-css';
                link.rel  = 'stylesheet';
                link.href = 'game17.css';
                document.head.appendChild(link);
            }
        },

        // ── 初始化 ───────────────────────────────────────────────
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game17-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game17-container');
        },

        // ── 建立 DOM ─────────────────────────────────────────────
        createDOM: function () {
            const div = document.createElement('div');
            div.id        = 'game17-container';
            div.className = 'game17-overlay hidden';
            div.innerHTML = `
                <div class="game17-header">
                    <div class="game17-score-board">分數:&nbsp;<span id="game17-score">0</span></div>
                    <div id="game17-hearts" class="hearts"></div>
                    <div class="game17-controls">
                        <button class="game17-difficulty-tag" id="game17-diff-tag">小學</button>
                        <button id="game17-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game17-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game17-poem-bar">
                    <div id="game17-poem-info" class="game17-poem-info"></div>
                    <div class="game17-progress-row">
                        <div class="game17-progress-track">
                            <div id="game17-progress-fill" class="game17-progress-fill"></div>
                        </div>
                        <span id="game17-progress-text">0/0</span>
                    </div>
                </div>
                <div id="game17-hint-bar" class="game17-hint-bar"></div>
                <div id="game17-canvas-wrap" class="game17-canvas-wrap">
                    <canvas id="game17-canvas"></canvas>
                </div>
                <div class="game17-timer-wrap">
                    <div class="game17-timer-track">
                        <div id="game17-timer-bar"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放座標（跟隨 stage）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left            = r.left + 'px';
                    div.style.top             = r.top  + 'px';
                    div.style.width           = '500px';
                    div.style.height          = '850px';
                    div.style.transform       = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }

            document.getElementById('game17-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game17-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game17-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // Canvas 觸控優先（pointerdown 比 click 靈敏）
            document.getElementById('game17-canvas').addEventListener('pointerdown', (e) => {
                e.preventDefault();
                this.onCanvasClick(e);
            });
        },

        // ── 顯示遊戲 ─────────────────────────────────────────────
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // ── 難度選擇 ─────────────────────────────────────────────
        showDifficultySelector: function () {
            this.isActive = false;
            this.stopLoop();
            if (window.GameMessage) window.GameMessage.hide();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('青蛙過河', (selectedLevel, levelIndex) => {
                    this.difficulty        = selectedLevel;
                    this.isLevelMode       = (levelIndex !== undefined);
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

        // ── 更新難度標籤與按鈕顯示 ──────────────────────────────
        updateUIForMode: function () {
            const tag    = document.getElementById('game17-diff-tag');
            const newBtn = document.getElementById('game17-newGame-btn');
            const retBtn = document.getElementById('game17-retryGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#e2b800' };

            if (this.isLevelMode) {
                if (tag) { tag.textContent = `挑戰第 ${this.currentLevelIndex} 關`; tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50'; tag.style.color = this.difficulty === '研究所' ? '#333' : '#fff'; tag.dataset.level = this.difficulty; }
                if (newBtn) newBtn.style.display = 'none';
                if (retBtn) retBtn.style.display = 'inline-block';
            } else {
                if (tag) { tag.textContent = this.difficulty; tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50'; tag.style.color = this.difficulty === '研究所' ? '#333' : '#fff'; tag.dataset.level = this.difficulty; }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retBtn) retBtn.style.display = 'inline-block';
            }
        },

        // ── 停止遊戲（menu.js 全域清理用）──────────────────────
        stopGame: function () {
            this.isActive = false;
            this.stopLoop();
            // ⚠️ 必須在此隱藏：menu.js 全域清理只呼叫 stopGame()，不呼叫 hide()
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        stopLoop: function () {
            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
        },

        // ── 重來 ─────────────────────────────────────────────────
        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        // ── 開新局 ───────────────────────────────────────────────
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.updateUIForMode();
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗，請重試。');
                this.stopGame();
            }
        },

        // ── 選詩 ─────────────────────────────────────────────────
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') return false;
            const s = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(
                s.poemMinRating, s.minLines, s.maxLines,
                s.minChars, s.maxChars,
                '', this.isLevelMode ? this.currentLevelIndex : null, 'game17'
            );
            if (!result) return false;

            this.currentPoem  = result.poem;
            this.poemLines    = result.lines;
            this.fullPoemText = this.poemLines.join('');

            let title = this.currentPoem.title;
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const infoEl = document.getElementById('game17-poem-info');
            infoEl.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            infoEl.dataset.poemId = this.currentPoem.id;
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // ── 啟動遊戲流程 ─────────────────────────────────────────
        startGameProcess: function (isRetry) {
            const s = this.difficultySettings[this.difficulty];
            this.isActive      = true;
            this.score         = 0;
            this.targetIndex   = 0;
            this.hearts        = 5;
            this.splashes      = [];
            this.floatTexts    = [];
            this.timer         = s.timeLimit;
            this.maxTimer      = s.timeLimit;
            this.lastTimestamp = 0;

            document.getElementById('game17-score').textContent      = '0';
            document.getElementById('game17-retryGame-btn').disabled = false;
            document.getElementById('game17-newGame-btn').disabled   = false;
            if (window.GameMessage) window.GameMessage.hide();

            this.updateHintBar(s);   // 先設定提示欄顯示狀態，再讀 offsetHeight
            this.setupCanvas(s);
            this.buildLilyPads(s);
            this.resetFrog();
            this.updateProgress();
            this.renderHearts();
            this.updateTimerBar(1);

            this.stopLoop();
            this.animFrameId = requestAnimationFrame((ts) => {
                this.lastTimestamp = ts;
                this.gameLoop(ts);
            });
        },

        // ── 設置 Canvas ──────────────────────────────────────────
        setupCanvas: function (s) {
            const wrap = document.getElementById('game17-canvas-wrap');
            this.canvas    = document.getElementById('game17-canvas');
            this.ctx       = this.canvas.getContext('2d');
            const wrapH    = wrap.offsetHeight;
            this.canvasH   = (wrapH > 50) ? wrapH : 660;
            this.canvas.width  = 500;
            this.canvas.height = this.canvasH;
            // 計算列高與跳躍距離（相鄰列可達即可）
            this.rowH      = this.canvasH / s.numRows;
            this.jumpRange = this.rowH * 1.5 + s.padRadius * 2;
        },

        // ── 建立荷葉 ─────────────────────────────────────────────
        buildLilyPads: function (s) {
            this.lilyPads = [];
            const chars   = this.fullPoemText.split('');
            const riverX  = this.BANK_W;
            const riverW  = 500 - this.BANK_W * 2; // 390px

            // 計算混淆字數量，確保每片正確字荷葉周圍有混淆字
            const numDecoys = Math.ceil(chars.length * s.decoyRatio / (1 - s.decoyRatio));
            let decoyChars = [];
            if (window.SharedDecoy) {
                decoyChars = window.SharedDecoy.getDecoyChars(
                    chars, numDecoys, [], s.poemMinRating
                );
            }
            while (decoyChars.length < numDecoys) decoyChars.push('虛');

            // 合併正確字與混淆字，隨機分配到各列荷葉
            const allChars = chars.map((c, i) => ({ char: c, charIndex: i, isCorrect: true }))
                .concat(decoyChars.map(c => ({ char: c, charIndex: -1, isCorrect: false })));

            // Fisher-Yates 洗牌
            for (let i = allChars.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allChars[i], allChars[j]] = [allChars[j], allChars[i]];
            }

            // 依序分配到各列
            const padsPerRow = Math.ceil(allChars.length / s.numRows) + s.padsPerRow;
            const step       = riverW / padsPerRow;
            let charIdx      = 0;

            for (let row = 0; row < s.numRows; row++) {
                const dir   = (row % 2 === 0) ? 1 : -1; // 偶數列向右，奇數列向左
                const speed = s.baseSpeed * (0.7 + Math.random() * 0.6) * dir;
                const cy    = this.rowH * row + this.rowH / 2;
                const isLog = (row % 2 === 1); // 奇數列用木頭造型

                for (let col = 0; col < padsPerRow; col++) {
                    if (charIdx >= allChars.length) break;
                    const info   = allChars[charIdx++];
                    const startX = riverX + step * col + Math.random() * (step * 0.5);

                    this.lilyPads.push({
                        id:       this.lilyPads.length,
                        row,
                        isLog,
                        char:     info.char,
                        charIndex: info.charIndex,
                        isCorrect: info.isCorrect,
                        x:        startX,
                        y:        cy,
                        vx:       speed,
                        radius:   s.padRadius,
                        state:    'normal', // 'normal' | 'sinking' | 'sunken'
                        sinkAlpha: 1,
                        sinkTimer: 0,       // 下沉剩餘時間（ms）
                        glowPhase: Math.random() * Math.PI * 2, // 發光動畫相位差
                    });
                }
            }
        },

        // ── 重置青蛙至左岸 ───────────────────────────────────────
        resetFrog: function () {
            this.frog = {
                x:             this.BANK_W - 20,
                y:             this.canvasH / 2,
                isJumping:     false,
                jumpElapsed:   0,
                jumpDuration:  300,
                jumpFromX:     0,
                jumpFromY:     0,
                jumpToX:       0,
                jumpToY:       0,
                pendingLandPad: null,
                currentPad:    null,
                isOnLeftBank:  true,
                isOnRightBank: false,
            };
        },

        // ── 遊戲主循環 ───────────────────────────────────────────
        gameLoop: function (timestamp) {
            if (!this.isActive) return;
            const dt = Math.min(timestamp - this.lastTimestamp, 80); // 最大 80ms 防卡頓暴走
            this.lastTimestamp = timestamp;

            this.update(dt);
            this.draw();

            this.animFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
        },

        // ── 更新邏輯 ─────────────────────────────────────────────
        update: function (dt) {
            const s       = this.difficultySettings[this.difficulty];
            const riverX  = this.BANK_W;
            const riverEnd = 500 - this.BANK_W;

            // 倒數計時
            this.timer -= dt / 1000;
            if (this.timer <= 0) {
                this.timer = 0;
                this.updateTimerBar(0);
                this.gameOver(false, 'timeout');
                return;
            }
            this.updateTimerBar(this.timer / this.maxTimer);

            // 更新各荷葉位置與狀態
            const now = performance.now();
            for (const pad of this.lilyPads) {
                if (pad.state === 'sunken') continue;

                // 水平漂移並循環
                pad.x += pad.vx * dt / 1000;
                if (pad.vx > 0 && pad.x - pad.radius > riverEnd) {
                    pad.x = riverX - pad.radius;
                } else if (pad.vx < 0 && pad.x + pad.radius < riverX) {
                    pad.x = riverEnd + pad.radius;
                }

                // 下沉倒數
                if (pad.state === 'sinking') {
                    pad.sinkTimer -= dt;
                    pad.sinkAlpha = Math.max(0, pad.sinkTimer / s.sinkDelay);
                    if (pad.sinkTimer <= 0) {
                        pad.state     = 'sunken';
                        pad.sinkAlpha = 0;
                        // 青蛙仍在此荷葉上 → 落水
                        if (this.frog.currentPad === pad && !this.frog.isJumping) {
                            this.frogFallInWater();
                        }
                    }
                }
            }

            // 青蛙跟著荷葉移動（水平）
            if (!this.frog.isJumping && this.frog.currentPad) {
                const pad = this.frog.currentPad;
                if (pad.state !== 'sunken') {
                    this.frog.x = pad.x;
                    this.frog.y = pad.y;
                }
            }

            // 跳躍拋物線動畫（二次貝茲曲線）
            if (this.frog.isJumping) {
                this.frog.jumpElapsed += dt;
                const t     = Math.min(this.frog.jumpElapsed / this.frog.jumpDuration, 1);
                const ease  = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOut
                const dist  = Math.hypot(this.frog.jumpToX - this.frog.jumpFromX, this.frog.jumpToY - this.frog.jumpFromY);
                const arcH  = Math.max(30, dist * 0.4);
                const midX  = (this.frog.jumpFromX + this.frog.jumpToX) / 2;
                const midY  = Math.min(this.frog.jumpFromY, this.frog.jumpToY) - arcH;

                // 二次貝茲：P(t) = (1-t)²P0 + 2(1-t)t·P1 + t²P2
                const bt    = ease;
                this.frog.x = (1 - bt) * (1 - bt) * this.frog.jumpFromX + 2 * (1 - bt) * bt * midX + bt * bt * this.frog.jumpToX;
                this.frog.y = (1 - bt) * (1 - bt) * this.frog.jumpFromY + 2 * (1 - bt) * bt * midY  + bt * bt * this.frog.jumpToY;

                if (t >= 1) {
                    this.frog.isJumping = false;
                    this.frog.x = this.frog.jumpToX;
                    this.frog.y = this.frog.jumpToY;
                    this.onFrogLanded();
                }
            }

            // 更新特效（過濾已結束的）
            this.splashes   = this.splashes.filter(sp => { sp.t += dt; return sp.t < sp.duration; });
            this.floatTexts = this.floatTexts.filter(ft => { ft.t  += dt; return ft.t  < ft.duration; });
        },

        // ── 青蛙落地 ─────────────────────────────────────────────
        onFrogLanded: function () {
            const pad = this.frog.pendingLandPad;
            this.frog.pendingLandPad = null;

            if (!pad) {
                // 落在右岸（通關跳躍）
                if (this.frog.isOnRightBank) this.gameOver(true, 'complete');
                return;
            }

            this.frog.currentPad = pad;

            if (pad.isCorrect && pad.charIndex === this.targetIndex) {
                this.onCorrectChar(pad);
            } else {
                this.onWrongChar(pad);
            }
        },

        // ── 踩到正確字 ───────────────────────────────────────────
        onCorrectChar: function (pad) {
            if (window.SoundManager) window.SoundManager.playSuccessShort();

            const pts = this.getPointA();
            this.score += pts;
            document.getElementById('game17-score').textContent = Math.floor(this.score);
            this.addFloatText('+' + pts, pad.x, pad.y - 25);

            // 荷葉開始下沉倒數
            const s       = this.difficultySettings[this.difficulty];
            pad.state     = 'sinking';
            pad.sinkTimer = s.sinkDelay;

            this.targetIndex++;
            this.updateProgress();
            this.updateHintBar(s);

            // 踩完最後一字後自動跳向右岸
            if (this.targetIndex >= this.fullPoemText.length) {
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();
                setTimeout(() => { if (this.isActive) this.jumpToRightBank(); }, 350);
            }
        },

        // ── 踩到錯誤字 ───────────────────────────────────────────
        onWrongChar: function (pad) {
            if (window.SoundManager) window.SoundManager.playFailure();
            this.triggerShake();
            this.hearts--;
            this.renderHearts();
            if (this.hearts <= 0) {
                setTimeout(() => this.gameOver(false, 'heartless'), 500);
            }
        },

        // ── 青蛙落水 ─────────────────────────────────────────────
        frogFallInWater: function () {
            if (!this.isActive) return;
            if (window.SoundManager) window.SoundManager.playFailure();

            this.splashes.push({ x: this.frog.x, y: this.frog.y, t: 0, duration: 700, r: 5 });
            this.triggerShake();

            // 青蛙回到左岸
            this.frog.currentPad   = null;
            this.frog.isOnLeftBank  = true;
            this.frog.isOnRightBank = false;
            this.frog.isJumping     = false;
            this.frog.x = this.BANK_W - 20;
            this.frog.y = this.canvasH / 2;

            this.hearts--;
            this.renderHearts();
            if (this.hearts <= 0) {
                setTimeout(() => this.gameOver(false, 'heartless'), 500);
            }
        },

        // ── 跳向右岸（所有字踩完後自動觸發）──────────────────────
        jumpToRightBank: function () {
            if (!this.isActive) return;
            const destX = 500 - this.BANK_W + 20;
            const destY = this.canvasH / 2;
            this.frog.isJumping     = true;
            this.frog.jumpElapsed   = 0;
            this.frog.jumpFromX     = this.frog.x;
            this.frog.jumpFromY     = this.frog.y;
            this.frog.jumpToX       = destX;
            this.frog.jumpToY       = destY;
            this.frog.pendingLandPad = null;
            this.frog.currentPad    = null;
            this.frog.isOnRightBank  = true;
            this.frog.isOnLeftBank   = false;
            this.frog.jumpDuration   = 500;
        },

        // ── Canvas 點擊處理 ───────────────────────────────────────
        onCanvasClick: function (e) {
            if (!this.isActive || this.frog.isJumping) return;

            // 將螢幕座標轉換成 canvas 邏輯座標
            const rect  = this.canvas.getBoundingClientRect();
            const scale = this.canvas.width / rect.width;
            const cx    = (e.clientX - rect.left) * scale;
            const cy    = (e.clientY - rect.top)  * scale;

            // 找最近的可踩荷葉（已沉沒的忽略）
            let nearest     = null;
            let nearestDist = Infinity;
            for (const pad of this.lilyPads) {
                if (pad.state === 'sunken') continue;
                const d = Math.hypot(cx - pad.x, cy - pad.y);
                if (d < pad.radius + 14 && d < nearestDist) {
                    nearestDist = d;
                    nearest     = pad;
                }
            }

            if (!nearest) {
                // 點擊水面，產生水花效果（不扣血，只是視覺反饋）
                this.splashes.push({ x: cx, y: cy, t: 0, duration: 400, r: 3 });
                return;
            }

            // 確認跳躍距離在範圍內
            const jumpDist = Math.hypot(nearest.x - this.frog.x, nearest.y - this.frog.y);
            if (jumpDist > this.jumpRange) return;

            // 啟動跳躍
            const duration = Math.max(200, Math.min(500, jumpDist * 1.8));
            this.frog.isJumping      = true;
            this.frog.jumpElapsed    = 0;
            this.frog.jumpDuration   = duration;
            this.frog.jumpFromX      = this.frog.x;
            this.frog.jumpFromY      = this.frog.y;
            this.frog.jumpToX        = nearest.x;
            this.frog.jumpToY        = nearest.y;
            this.frog.pendingLandPad = nearest;
            this.frog.currentPad     = null;
            this.frog.isOnLeftBank   = false;
            this.frog.isOnRightBank  = false;
        },

        // ── 繪製 ─────────────────────────────────────────────────
        draw: function () {
            const ctx = this.ctx;
            const W   = 500;
            const H   = this.canvasH;
            ctx.clearRect(0, 0, W, H);

            this.drawRiver(W, H);
            this.drawBanks(W, H);
            this.drawLilyPads();
            this.drawFrog();
            this.drawSplashes();
            this.drawFloatTexts();
        },

        // ── 繪製河流底色與波紋 ───────────────────────────────────
        drawRiver: function (W, H) {
            const ctx = this.ctx;
            const grad = ctx.createLinearGradient(0, 0, 0, H);
            grad.addColorStop(0, 'hsl(210, 65%, 16%)');
            grad.addColorStop(1, 'hsl(220, 70%, 10%)');
            ctx.fillStyle = grad;
            ctx.fillRect(this.BANK_W, 0, W - this.BANK_W * 2, H);

            // 水波紋（橫向正弦波，隨時間滾動）
            const t = performance.now() / 1000;
            ctx.strokeStyle = 'hsla(200, 80%, 70%, 0.07)';
            ctx.lineWidth   = 1;
            for (let row = 0; row < 14; row++) {
                const y = (H / 13) * row + ((t * 15) % (H / 13));
                ctx.beginPath();
                ctx.moveTo(this.BANK_W, y);
                for (let x = this.BANK_W; x <= W - this.BANK_W; x += 6) {
                    ctx.lineTo(x, y + Math.sin((x * 0.08) + t * 1.5) * 2.5);
                }
                ctx.stroke();
            }
        },

        // ── 繪製左右岸台 ─────────────────────────────────────────
        drawBanks: function (W, H) {
            const ctx = this.ctx;

            // 左岸
            const lg = ctx.createLinearGradient(0, 0, this.BANK_W, 0);
            lg.addColorStop(0, 'hsl(95, 40%, 20%)');
            lg.addColorStop(1, 'hsl(90, 35%, 16%)');
            ctx.fillStyle = lg;
            ctx.fillRect(0, 0, this.BANK_W, H);

            // 右岸
            const rg = ctx.createLinearGradient(W - this.BANK_W, 0, W, 0);
            rg.addColorStop(0, 'hsl(90, 35%, 16%)');
            rg.addColorStop(1, 'hsl(95, 40%, 20%)');
            ctx.fillStyle = rg;
            ctx.fillRect(W - this.BANK_W, 0, this.BANK_W, H);

            // 岸台分隔線（稍微發光的綠邊）
            ctx.strokeStyle = 'hsla(100, 60%, 45%, 0.5)';
            ctx.lineWidth   = 2;
            ctx.beginPath(); ctx.moveTo(this.BANK_W, 0); ctx.lineTo(this.BANK_W, H); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(W - this.BANK_W, 0); ctx.lineTo(W - this.BANK_W, H); ctx.stroke();

            // 岸台文字
            ctx.font      = 'bold 15px "Noto Serif TC", serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'hsl(95, 55%, 62%)';
            ctx.fillText('起', this.BANK_W / 2, H / 2 - 8);
            ctx.fillText('點', this.BANK_W / 2, H / 2 + 12);
            ctx.fillText('終', W - this.BANK_W / 2, H / 2 - 8);
            ctx.fillText('點', W - this.BANK_W / 2, H / 2 + 12);
        },

        // ── 繪製所有荷葉/木頭 ────────────────────────────────────
        drawLilyPads: function () {
            const ctx = this.ctx;
            const s   = this.difficultySettings[this.difficulty];
            const now = performance.now() / 1000;

            for (const pad of this.lilyPads) {
                if (pad.state === 'sunken') continue;

                ctx.save();
                ctx.globalAlpha = pad.sinkAlpha;

                const r         = pad.radius;
                const isTarget  = pad.isCorrect && pad.charIndex === this.targetIndex;

                // 目標字金色光暈（小學模式全亮）
                if (isTarget && s.hint === 'all') {
                    const pulse  = 0.5 + 0.5 * Math.sin(now * 3 + pad.glowPhase);
                    const glowR  = r + 8 + pulse * 5;
                    const gGrad  = ctx.createRadialGradient(pad.x, pad.y, r * 0.3, pad.x, pad.y, glowR);
                    gGrad.addColorStop(0, 'hsla(48, 100%, 70%, 0.7)');
                    gGrad.addColorStop(1, 'hsla(48, 100%, 70%, 0)');
                    ctx.fillStyle = gGrad;
                    ctx.beginPath();
                    ctx.ellipse(pad.x, pad.y, glowR, glowR, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (pad.isLog) {
                    // 木頭造型（圓角矩形）
                    const lw = r * 1.9;
                    const lh = r * 0.75;
                    ctx.fillStyle = isTarget
                        ? 'hsl(32, 72%, 38%)'
                        : 'hsl(25, 50%, 28%)';
                    this.drawRoundedRect(ctx, pad.x - lw / 2, pad.y - lh / 2, lw, lh, 7);
                    ctx.fill();
                    ctx.strokeStyle = 'hsla(30, 60%, 55%, 0.4)';
                    ctx.lineWidth   = 1.5;
                    ctx.stroke();

                    // 木紋
                    ctx.strokeStyle = 'hsla(30, 40%, 50%, 0.2)';
                    ctx.lineWidth   = 0.8;
                    for (let i = -1; i <= 1; i++) {
                        ctx.beginPath();
                        ctx.moveTo(pad.x - lw * 0.4, pad.y + i * lh * 0.3);
                        ctx.lineTo(pad.x + lw * 0.4, pad.y + i * lh * 0.3);
                        ctx.stroke();
                    }
                } else {
                    // 荷葉造型（橢圓）
                    ctx.fillStyle = isTarget
                        ? 'hsl(118, 58%, 28%)'
                        : 'hsl(120, 42%, 19%)';
                    ctx.beginPath();
                    ctx.ellipse(pad.x, pad.y, r, r * 0.65, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'hsla(120, 70%, 48%, 0.4)';
                    ctx.lineWidth   = 1.5;
                    ctx.stroke();

                    // 荷葉葉脈
                    ctx.strokeStyle = 'hsla(120, 60%, 42%, 0.22)';
                    ctx.lineWidth   = 0.8;
                    for (let i = 0; i < 6; i++) {
                        const angle = (i / 6) * Math.PI * 2;
                        ctx.beginPath();
                        ctx.moveTo(pad.x, pad.y);
                        ctx.lineTo(pad.x + Math.cos(angle) * r * 0.85, pad.y + Math.sin(angle) * r * 0.6);
                        ctx.stroke();
                    }
                }

                // 字符
                const fontSize = Math.max(13, r * 0.85);
                ctx.font          = `bold ${fontSize}px "Noto Serif TC", serif`;
                ctx.textAlign     = 'center';
                ctx.textBaseline  = 'middle';
                if (isTarget && s.hint === 'all') {
                    ctx.fillStyle = 'hsl(50, 100%, 78%)';
                } else if (pad.isCorrect) {
                    ctx.fillStyle = 'hsl(55, 85%, 88%)';
                } else {
                    ctx.fillStyle = 'hsl(38, 55%, 78%)';
                }
                ctx.fillText(pad.char, pad.x, pad.y + 1);

                ctx.restore();
            }
        },

        // ── 繪製青蛙 ─────────────────────────────────────────────
        drawFrog: function () {
            const ctx = this.ctx;
            const x   = this.frog.x;
            const y   = this.frog.y;
            const r   = 15;

            // 跳躍時身體前傾角
            const tilt = this.frog.isJumping
                ? Math.sin(this.frog.jumpElapsed / this.frog.jumpDuration * Math.PI) * 0.4
                : 0;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(tilt);

            // 身體橢圓
            ctx.fillStyle = 'hsl(138, 52%, 30%)';
            ctx.beginPath();
            ctx.ellipse(0, 2, r, r * 0.78, 0, 0, Math.PI * 2);
            ctx.fill();

            // 腹部高光
            ctx.fillStyle = 'hsl(138, 40%, 42%)';
            ctx.beginPath();
            ctx.ellipse(0, 4, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();

            // 眼睛（突起）
            const eyeY = -r * 0.45;
            for (let side of [-1, 1]) {
                const ex = side * r * 0.46;
                ctx.fillStyle = 'hsl(75, 70%, 68%)';
                ctx.beginPath(); ctx.arc(ex, eyeY, 5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(ex, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
            }

            ctx.restore();
        },

        // ── 繪製水花特效 ─────────────────────────────────────────
        drawSplashes: function () {
            const ctx = this.ctx;
            for (const sp of this.splashes) {
                const prog = sp.t / sp.duration;
                ctx.save();
                ctx.globalAlpha = (1 - prog) * 0.75;
                ctx.strokeStyle = 'hsl(200, 75%, 72%)';
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, sp.r + prog * 22, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        },

        // ── 繪製浮動得分文字 ─────────────────────────────────────
        drawFloatTexts: function () {
            const ctx = this.ctx;
            for (const ft of this.floatTexts) {
                const prog = ft.t / ft.duration;
                ctx.save();
                ctx.globalAlpha  = 1 - prog;
                ctx.font         = 'bold 18px "Noto Serif TC", serif';
                ctx.fillStyle    = 'hsl(50, 100%, 70%)';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ft.text, ft.x, ft.y - prog * 35);
                ctx.restore();
            }
        },

        // ── 手繪圓角矩形（兼容舊版瀏覽器）───────────────────────
        drawRoundedRect: function (ctx, x, y, w, h, r) {
            ctx.beginPath();
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
        },

        // ── 更新提示欄 ───────────────────────────────────────────
        updateHintBar: function (s) {
            const bar = document.getElementById('game17-hint-bar');
            if (!bar) return;

            if (s.hint === 'none') {
                bar.style.display = 'none';
                return;
            }
            bar.style.display = '';

            if (this.targetIndex >= this.fullPoemText.length) {
                bar.textContent = '全詩完成，跳往對岸！';
                return;
            }

            const nextChar = this.fullPoemText[this.targetIndex];
            if (s.hint === 'all') {
                bar.textContent = `下一字：「${nextChar}」`;
            } else {
                // sentence：顯示目標字所在的詩句
                let count = 0;
                for (const line of this.poemLines) {
                    count += line.length;
                    if (count > this.targetIndex) {
                        bar.textContent = `本句：${line}`;
                        break;
                    }
                }
            }
        },

        // ── 更新進度條 ───────────────────────────────────────────
        updateProgress: function () {
            const total = this.fullPoemText.length;
            const done  = this.targetIndex;
            const fill  = document.getElementById('game17-progress-fill');
            const text  = document.getElementById('game17-progress-text');
            if (fill) fill.style.width = (total > 0 ? done / total * 100 : 0) + '%';
            if (text) text.textContent = `${done}/${total}`;
        },

        // ── 更新計時條 ───────────────────────────────────────────
        updateTimerBar: function (ratio) {
            const bar = document.getElementById('game17-timer-bar');
            if (!bar) return;
            bar.style.width = (ratio * 100) + '%';
            if (ratio > 0.33) {
                bar.style.backgroundColor = 'hsl(193, 72%, 42%)';
                bar.classList.remove('game17-timer-urgent');
            } else if (ratio > 0.15) {
                bar.style.backgroundColor = 'hsl(28, 90%, 50%)';
                bar.classList.remove('game17-timer-urgent');
            } else {
                bar.classList.add('game17-timer-urgent');
            }
        },

        // ── 渲染生命值 ───────────────────────────────────────────
        renderHearts: function () {
            const el = document.getElementById('game17-hearts');
            if (!el) return;
            el.innerHTML = '';
            for (let i = 0; i < 5; i++) {
                const span = document.createElement('span');
                span.className  = i < this.hearts ? 'heart' : 'heart empty';
                span.textContent = i < this.hearts ? '♥' : '♡';
                el.appendChild(span);
            }
        },

        // ── 震動效果 ─────────────────────────────────────────────
        triggerShake: function () {
            const el = document.getElementById('game17-canvas-wrap');
            if (!el) return;
            el.classList.remove('game17-shake');
            void el.offsetWidth; // 強制 reflow 確保動畫重啟
            el.classList.add('game17-shake');
            setTimeout(() => el.classList.remove('game17-shake'), 450);
        },

        // ── 新增浮動文字 ─────────────────────────────────────────
        addFloatText: function (text, x, y) {
            this.floatTexts.push({ text, x, y, t: 0, duration: 950 });
        },

        // ── 取得每次正確踩字基礎分 ──────────────────────────────
        getPointA: function () {
            const s = window.ScoreManager && window.ScoreManager.gameSettings['game17'];
            return s ? (s.getPointA || 10) : 10;
        },

        // ── 遊戲結束 ─────────────────────────────────────────────
        gameOver: function (win, reason) {
            if (!this.isActive) return;
            this.isActive = false;
            this.stopLoop();

            const onConfirm = () => {
                if (win && this.isLevelMode) {
                    this.currentLevelIndex++;
                    this.updateUIForMode();
                    this.startNewGame();
                } else if (win) {
                    this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMsg = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin:   win,
                        score:   win ? (finalScore || Math.floor(this.score)) : 0,
                        reason:  win ? '' : (reason === 'timeout' ? '時間到！' : '詩心未竟！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm
                    });
                }
            };

            const showAfterAch = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game17', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game17', this.currentLevelIndex, () => showMsg(finalScore));
                        return;
                    }
                }
                showMsg(finalScore);
            };

            if (win) {
                document.getElementById('game17-retryGame-btn').disabled = true;
                document.getElementById('game17-newGame-btn').disabled   = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();

                if (window.ScoreManager) {
                    window.ScoreManager.playWinAnimation({
                        game:             this,
                        difficulty:       this.difficulty,
                        gameKey:          'game17',
                        timerContainerId: 'game17-canvas-wrap',
                        scoreElementId:   'game17-score',
                        heartsSelector:   '#game17-hearts .heart:not(.empty)',
                        onComplete: (finalScore) => {
                            this.score = finalScore;
                            showAfterAch(finalScore);
                        }
                    });
                } else {
                    showAfterAch(Math.floor(this.score));
                }
            } else {
                document.getElementById('game17-retryGame-btn').disabled = false;
                document.getElementById('game17-newGame-btn').disabled   = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
                showAfterAch(0);
            }
        }
    };

    window.Game17 = Game17;

    // URL 自動啟動（?game=17）
    document.addEventListener('DOMContentLoaded', () => {
        if (new URLSearchParams(window.location.search).get('game') === '17') {
            setTimeout(() => {
                if (window.Game17) window.Game17.show();
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 50);
        }
    });
})();
