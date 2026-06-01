/* ============================================================
   game19.js — 詩碟狂襲 (Poetry Barrage)
   改編自太空侵略者，進化版：每排只有一個正確字，其餘皆為混淆字
   正確字具備「氣球膨脹」HP 系統，混淆字可投擲炸彈反擊
   ============================================================ */

(function () {
    'use strict';

    const Game19 = {
        // ── 狀態 ──────────────────────────────────────────────────
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        lives: 6,
        maxLives: 6,
        isEnding: false,
        isPausedForPowerUp: false,
        gameStartTime: null,
        isWin: false,

        // ── 詩詞 ──────────────────────────────────────────────────
        currentPoem: null,
        poemChars: [],            // 去除標點後的目標字元陣列
        poemLines: [],            // 原始詩句列表（用於判斷句末位置）
        sentenceEndIndices: null, // 句末字在 poemChars 中的索引集合（Set）
        currentTargetIdx: 0,      // 目前要清除的第幾個字（0-based）
        totalRows: 0,

        // ── Canvas ────────────────────────────────────────────────
        canvas: null,
        ctx: null,
        animFrameId: null,
        lastTime: 0,
        canvasW: 500,
        canvasH: 670,

        // ── 遊戲物件 ──────────────────────────────────────────────
        rows: [],    // 字排陣列，index 0 = 最底排（最先要清除的排）
        player: {
            x: 250,
            y: 600,
            width: 56,
            height: 18,
            isFiring: false,
            lastFired: 0,
            hitTimer: 0,       // 受傷閃紅計時
            invincibleTimer: 0, // 無敵幀計時（護盾 / 受傷後）
            bullets: [],
            bulletsInitSpeed: 2000, //子彈初始速度
            fireRateMultiplier: 1.0, // 快速發射倍率（1.0=正常，最高2.5）
            multiLevel: 1
        },
        bombs: [],       // 敵方炸彈 { x, y, vx, vy, r }
        arcRaiders: [],  // 弧線特攻混淆字
        particles: [],   // 視覺粒子
        screenFlash: 0,  // 全螢幕紅色震盪強度
        bombTimer: 0,
        arcRaiderTimer: 0,

        // ── 獎勵 ──────────────────────────────────────────────────
        powerUpChoices: [],

        // ── 計時器 ────────────────────────────────────────────────
        timeLeft: 0,
        timeLimit: 0,
        timerInterval: null,

        // ── 輸入 ──────────────────────────────────────────────────
        areaRect: { left: 0, top: 0, scale: 1 },
        container: null,

        // ── 難度設定 ──────────────────────────────────────────────
        // timeLimitRate：每字時間倍率（秒），實際時限 = poemChars 字數 × timeLimitRate
        // maxLives：最大生命次數
        // descentSpeed：下降速度（px/s）
        // bombInterval：混淆字投彈間隔（秒）
        // driftMin/Max：排漂移速度範圍（px/s）
        // arcRaiderInterval：弧線特攻出現間隔（秒）
        // poemMinRating：詩詞難度評分（6=最常見，1=最冷僻），同 game16 用法
        // lineCount：取幾句完整詩句（同 game16 的 minLines/maxLines，這裡固定行數）
        //   實際字數 = 詩句長度 × lineCount（五言2句=10字，四言2句=8字）
        //   Canvas 最多容納 11 個字（500px ÷ 44px），超過會在 loadPoem 後自動截除整句
        // goldBorderHint：小/中學在最底排顯示可攻擊提示線
        difficultySettings: {
            '小學': {
                timeLimitRate: 10, maxLives: 6, descentSpeed: 14, bombInterval: 5, driftMin: 20, driftMax: 30,
                arcRaiderInterval: 20, poemMinRating: 6, lineCount: 2, goldBorderHint: true
            },
            '中學': {
                timeLimitRate: 8, maxLives: 5, descentSpeed: 16, bombInterval: 4, driftMin: 40, driftMax: 60,
                arcRaiderInterval: 15, poemMinRating: 5, lineCount: 4, goldBorderHint: true
            },
            '高中': {
                timeLimitRate: 6, maxLives: 4, descentSpeed: 18, bombInterval: 3, driftMin: 60, driftMax: 80,
                arcRaiderInterval: 10, poemMinRating: 4, lineCount: 6, goldBorderHint: false
            },
            '大學': {
                timeLimitRate: 4, maxLives: 3, descentSpeed: 20, bombInterval: 2, driftMin: 80, driftMax: 100,
                arcRaiderInterval: 8, poemMinRating: 3, lineCount: 8, goldBorderHint: false
            },
            '研究所': {
                timeLimitRate: 3, maxLives: 2, descentSpeed: 22, bombInterval: 1, driftMin: 80, driftMax: 100,
                arcRaiderInterval: 5, poemMinRating: 3, lineCount: 10, goldBorderHint: false
            }
        },

        // ── CSS 載入 ──────────────────────────────────────────────
        loadCSS: function () {
            if (!document.getElementById('game19-css')) {
                const link = document.createElement('link');
                link.id = 'game19-css';
                link.rel = 'stylesheet';
                link.href = 'game19.css';
                document.head.appendChild(link);
            }
        },

        // ── 初始化 ────────────────────────────────────────────────
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game19-container')) {
                this.createDOM();
                this.bindEvents();
            }
            this.container = document.getElementById('game19-container');
        },

        // ── 建立 DOM ──────────────────────────────────────────────
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game19-container';
            div.className = 'game19-overlay hidden';
            div.innerHTML = `
                <div class="game19-header">
                    <div class="game19-score-board">得分:&nbsp;<span id="game19-score">0</span></div>
                    <div class="game19-controls">
                        <button class="game19-difficulty-tag" id="game19-diff-tag">小學</button>
                        <button id="game19-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game19-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game19-sub-header">
                    <div id="game19-hearts" class="hearts"></div>
                </div>
                <div class="game19-hint-bar">
                    <div id="game19-poem-info" class="game19-poem-info"></div>
                    <div id="game19-hint-text" class="game19-hint-text"></div>
                </div>
                <div class="game19-area" id="game19-area">
                    <svg id="game19-timer-ring">
                        <rect id="game19-timer-path" x="3" y="3"></rect>
                    </svg>
                    <canvas id="game19-canvas"></canvas>
                </div>
                <div class="game19-footer">
                    <div class="game19-drag-hint">左右拖曳移動砲台・按住射擊</div>
                </div>
            `;
            document.body.appendChild(div);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = `scale(${r.scale})`;
                    div.style.transformOrigin = 'top left';
                    this.areaRect.left = r.left;
                    this.areaRect.top = r.top;
                    this.areaRect.scale = r.scale;
                });
            }
        },

        // ── 事件綁定 ──────────────────────────────────────────────
        bindEvents: function () {
            document.getElementById('game19-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game19-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game19-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            const dragArea = document.getElementById('game19-container');

            dragArea.addEventListener('touchstart', (e) => {
                if (!this.isActive || this.isPausedForPowerUp) return;
                this.player.isFiring = true;
                const logicalX = (e.touches[0].clientX - this.areaRect.left) / (this.areaRect.scale || 1);
                this.movePlayer(logicalX);
            }, { passive: false });

            dragArea.addEventListener('touchmove', (e) => {
                if (!this.isActive || this.isPausedForPowerUp) return;
                e.preventDefault();
                const logicalX = (e.touches[0].clientX - this.areaRect.left) / (this.areaRect.scale || 1);
                this.movePlayer(logicalX);
            }, { passive: false });

            dragArea.addEventListener('touchend', () => { this.player.isFiring = false; });

            dragArea.addEventListener('mousedown', (e) => {
                if (!this.isActive || this.isPausedForPowerUp) return;
                this.player.isFiring = true;
                const logicalX = (e.clientX - this.areaRect.left) / (this.areaRect.scale || 1);
                this.movePlayer(logicalX);
            });
            window.addEventListener('mousemove', (e) => {
                if (!this.isActive || this.isPausedForPowerUp || !this.player.isFiring) return;
                const logicalX = (e.clientX - this.areaRect.left) / (this.areaRect.scale || 1);
                this.movePlayer(logicalX);
            });
            window.addEventListener('mouseup', () => { this.player.isFiring = false; });

            // 獎勵選擇點擊（Canvas 上）
            dragArea.addEventListener('click', (e) => {
                if (!this.isPausedForPowerUp || !this.powerUpChoices.length) return;
                const canvas = this.canvas;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                this.handlePowerUpClick(
                    (e.clientX - rect.left) * scaleX,
                    (e.clientY - rect.top) * scaleY
                );
            });
            dragArea.addEventListener('touchstart', (e) => {
                if (!this.isPausedForPowerUp || !this.powerUpChoices.length) return;
                const canvas = this.canvas;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                this.handlePowerUpClick(
                    (e.touches[0].clientX - rect.left) * scaleX,
                    (e.touches[0].clientY - rect.top) * scaleY
                );
            }, { passive: true });
        },

        movePlayer: function (targetX) {
            const half = this.player.width / 2;
            this.player.x = Math.max(half + 5, Math.min(this.canvasW - half - 5, targetX));
        },

        // ── 顯示難度選擇器 ────────────────────────────────────────
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩碟狂襲', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();
                    document.getElementById('game19-container').classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    this.setupCanvas();
                    this.startNewGame();
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game19-diff-tag');
            const newBtn = document.getElementById('game19-newGame-btn');
            const retryBtn = document.getElementById('game19-retryGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (this.isLevelMode) {
                if (diffTag) { diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`; diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50'; diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff'; }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) { diffTag.textContent = this.difficulty; diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50'; diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff'; }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        // ── 顯示 ──────────────────────────────────────────────────
        show: function () {
            this.init();
            const intro = document.getElementById('introOverlay');
            if (intro && !intro.classList.contains('hidden')) {
                intro.classList.add('hidden', 'hide-fade');
                document.body.classList.remove('overlay-active');
            }
            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩碟狂襲', (level, levelIndex) => {
                    this.difficulty = level;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    this.setupCanvas();
                    this.startNewGame();
                });
            }
        },

        // ── Canvas 設定 ───────────────────────────────────────────
        setupCanvas: function () {
            this.canvas = document.getElementById('game19-canvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            this.canvasW = 500;
            this.canvasH = 660;
            this.canvas.width = this.canvasW;
            this.canvas.height = this.canvasH;
        },

        // ── 開新局 ────────────────────────────────────────────────
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.updateUIForMode();
            this.score = 0;
            this.isWin = false;
            this.isEnding = false;
            this.isPausedForPowerUp = false;
            this.powerUpChoices = [];
            this.bombs = [];
            this.arcRaiders = [];
            this.particles = [];
            this.screenFlash = 0;
            this.bombTimer = 0;
            this.arcRaiderTimer = 0;
            this.gameStartTime = Date.now();
            this.resetPlayerState();

            const settings = this.difficultySettings[this.difficulty];
            this.maxLives = settings.maxLives;
            this.lives = settings.maxLives;

            this.loadPoem();
            this.buildRows();
            this.renderHearts();
            this.updateScoreUI();
            this.updateHintBar();
            this.startTimer();
            this.startLoop();

            document.getElementById('game19-retryGame-btn').disabled = false;
            document.getElementById('game19-newGame-btn').disabled = false;
        },

        // ── 重來（同首詩）─────────────────────────────────────────
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.score = 0;
            this.isWin = false;
            this.isEnding = false;
            this.isPausedForPowerUp = false;
            this.powerUpChoices = [];
            this.bombs = [];
            this.arcRaiders = [];
            this.particles = [];
            this.screenFlash = 0;
            this.bombTimer = 0;
            this.arcRaiderTimer = 0;
            this.gameStartTime = Date.now();
            this.resetPlayerState();

            const settings = this.difficultySettings[this.difficulty];
            this.maxLives = settings.maxLives;
            this.lives = settings.maxLives;

            this.buildRows(); // 同一首詩重新建排
            this.renderHearts();
            this.updateScoreUI();
            this.updateHintBar();
            this.startTimer();
            this.startLoop();

            document.getElementById('game19-retryGame-btn').disabled = false;
            document.getElementById('game19-newGame-btn').disabled = false;
        },

        resetPlayerState: function () {
            this.player.x = this.canvasW / 2;
            this.player.y = this.canvasH - 80; //玩家的y座標
            this.player.isFiring = false;
            this.player.lastFired = 0;
            this.player.hitTimer = 0;
            this.player.invincibleTimer = 0;
            this.player.bullets = [];
            this.player.fireRateMultiplier = 1.0; // 快速發射倍率重置
            this.player.multiLevel = 1;
        },

        // ── 載入詩詞 ──────────────────────────────────────────────
        // 完全比照 game16 selectRandomPoem 的作法（解決找不到詩的根本問題）：
        //   ‣ minChars 固定傳 8 → 確保幾乎所有詩都能被選中（同 game16 hardcode）
        //   ‣ maxChars 傳 9999 → 不設上限，讓 lineCount 控制取幾行
        //   ‣ lineCount（在 difficultySettings）決定取幾句完整詩句，取代不穩定的 minChars/maxChars
        // 寬度上限由 buildRows 的混淆字數量上限（max 6 個）來保護：
        //   每排最多 7 字 × 44px = 308px < 500px，不需在 loadPoem 做截斷
        loadPoem: function () {
            const s = this.difficultySettings[this.difficulty];

            const result = (typeof getSharedRandomPoem === 'function')
                ? getSharedRandomPoem(
                    s.poemMinRating,
                    s.lineCount, s.lineCount, // minLines = maxLines = lineCount（固定取整句數）
                    8,    // 固定 minChars=8（同 game16），確保能找到詩
                    9999, // 固定 maxChars=9999（無上限，行數由 lineCount 控制）
                    '', this.isLevelMode ? this.currentLevelIndex : null, 'game19'
                )
                : null;

            if (result) {
                this.currentPoem = result.poem;
                this.poemLines = result.lines; // getSharedRandomPoem 回傳的已是去標點純字串
            } else {
                // 降級備案：2句完整詩句（同 game16 找不到詩時的慣例）
                this.currentPoem = null;
                this.poemLines = ['床前明月光', '疑是地上霜'];
            }

            // 逐句取出每個字，詩句的每個字會對應到敵陣的一排
            // 不做字數上限截斷（寬度已由 buildRows 的混淆字上限保護）
            const chars = [];
            const ends = new Set();
            for (const line of this.poemLines) {
                // result.lines 已去標點；fallback 也是純字串，仍做輕量防呆清洗
                const clean = line.replace(/[，。？！、；：「」（）《》\s]/g, '');
                if (!clean) continue;
                for (const ch of clean) chars.push(ch);
                ends.add(chars.length - 1); // 記錄此句最後一字的全域 index（=句末字排）
            }

            // 極端防呆：若完全沒有字（poemLines 為空），補入備用內容
            if (chars.length === 0) {
                for (const ch of '床前明月光疑是地上霜') chars.push(ch);
                ends.add(4); // 「床前明月光」5字
                ends.add(9); // 「疑是地上霜」5字
            }

            this.poemChars = chars;
            this.sentenceEndIndices = ends;
            this.totalRows = chars.length;
            this.updatePoemInfo();
        },

        // ── 建立字排 ──────────────────────────────────────────────
        // 最底排(index 0)：1個字 = 首字（正確字）
        // 往上每排遞增1字，正確字即下一個詩句字
        // 優化：每排使用 SharedDecoy 取得獨立混淆字，確保各排不重複且貼近詩詞語境
        buildRows: function () {
            this.currentTargetIdx = 0;
            const settings = this.difficultySettings[this.difficulty];
            const charW = 44;   // 每字寬度（含間距）
            const rowH = 52;    // 排間距

            // 底排位置：約畫面 25% 高處（留給玩家反應時間）
            const bottomY = this.canvasH * 0.25;

            this.rows = [];
            for (let i = 0; i < this.totalRows; i++) {
                const rowNum = i + 1;                   // 1-based，HP 計算用（第1排HP=1，第2排HP=2…）
                // 混淆字數量：由下往上遞增，第0排（最底）0個，最多6個
                // 每排最多 7 字 × 44px = 308px < 500px 畫面寬，不會超出
                const decoyCount = Math.min(i, 6);      // 0-based：row0→0個，row6及以上→6個
                const charCount = decoyCount + 1;      // 正確字1個 + 混淆字
                const correctChar = this.poemChars[i];

                // 每排獨立取得混淆字（各排不共用同一個池，使混淆字更多元）
                let decoyChars = [];
                if (decoyCount > 0) {
                    if (window.SharedDecoy && typeof window.SharedDecoy.getDecoyChars === 'function') {
                        // 以正確字為基準，排除整首詩所有目標字，避免混淆字洩露答案
                        decoyChars = window.SharedDecoy.getDecoyChars(
                            [correctChar], decoyCount, this.poemChars, 3
                        );
                    } else {
                        // SharedDecoy 不可用時降級使用舊方法
                        const pool = this.buildDecoyPool();
                        let di = 0;
                        while (decoyChars.length < decoyCount) {
                            const ch = pool[di % pool.length];
                            if (ch !== correctChar) decoyChars.push(ch);
                            di++;
                        }
                    }
                    // 防呆：若仍不足則補充預留字元
                    while (decoyChars.length < decoyCount) decoyChars.push('○');
                }

                // 隨機插入正確字的位置
                const correctPos = Math.floor(Math.random() * charCount);
                const chars = [];
                let di = 0;
                for (let c = 0; c < charCount; c++) {
                    if (c === correctPos) {
                        chars.push({ char: correctChar, isCorrect: true });
                    } else {
                        chars.push({ char: decoyChars[di] || '○', isCorrect: false });
                        di++;
                    }
                }

                // 判斷此排是否為句末字排（句末=金色顯示+消除後觸發三選一強化選單）
                const isSentenceEnd = this.sentenceEndIndices ? this.sentenceEndIndices.has(i) : false;

                this.rows.push({
                    rowNum,
                    correctChar,
                    chars,
                    isSentenceEnd,              // 句末字排：金色 + 消除後強化選單
                    correctScale: 1.0,          // 正確字膨脹係數（1.0 → 1.5）
                    correctHitCount: 0,
                    maxHits: rowNum,            // HP = 排號
                    baseY: bottomY - i * rowH, // 由下往上堆疊（高 index = 高 y 位置 = 畫面上方）
                    driftX: 0,
                    driftSpeed: settings.driftMin + Math.random() * (settings.driftMax - settings.driftMin),
                    driftDir: (Math.random() < 0.5) ? 1 : -1,
                    active: true
                });
            }
        },

        // ── 混淆字字源池 ──────────────────────────────────────────
        buildDecoyPool: function () {
            const pool = new Set();
            // 優先從詩詞其他內容取字
            if (this.currentPoem && this.currentPoem.content) {
                const all = this.currentPoem.content.join('').replace(/[，。？！、；：「」（）《》\s]/g, '');
                for (const ch of all) {
                    if (!this.poemChars.includes(ch)) pool.add(ch);
                }
            }
            // 補充常用字
            const fallback = '春風花夜江南山水雲霧煙雨霜露日星辰天地情書禮義仁智道德文武思歸夢遠鄉愁月影波浪竹松梅蘭菊荷楓楊柳絮飛燕鴻雁';
            for (const ch of fallback) {
                if (!this.poemChars.includes(ch)) pool.add(ch);
            }
            // 打亂
            const arr = [...pool];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },

        updatePoemInfo: function () {
            const el = document.getElementById('game19-poem-info');
            if (!el || !this.currentPoem) return;
            let title = this.currentPoem.title || '';
            if (title.length > 12) title = title.substring(0, 10) + '...';
            el.textContent = `${title} / ${this.currentPoem.dynasty || ''} / ${this.currentPoem.author || ''}`;
            el.dataset.poemId = this.currentPoem.id;
            el.onclick = () => { if (window.PoemDialog) window.PoemDialog.show(this.currentPoem.id); };
        },

        // ── 詩句提示欄 ────────────────────────────────────────────
        updateHintBar: function () {
            const el = document.getElementById('game19-hint-text');
            if (!el) return;
            const settings = this.difficultySettings[this.difficulty];
            const done = this.currentTargetIdx;
            if (done >= this.poemChars.length) { el.innerHTML = ''; return; }

            if (this.difficulty === '研究所') {
                // 研究所只顯示進度點，不顯示字
                el.innerHTML = `<span class="game19-hint-done">${'●'.repeat(done)}</span><span class="game19-hint-current">▶ 第 ${done + 1} 字</span><span class="game19-hint-next">${'○'.repeat(this.poemChars.length - done - 1)}</span>`;
            } else {
                let html = '';
                for (let i = 0; i < this.poemChars.length; i++) {
                    if (i < done) {
                        html += `<span class="game19-hint-done">${this.poemChars[i]}</span>`;
                    } else if (i === done) {
                        html += `<span class="game19-hint-current">${this.poemChars[i]}</span>`;
                    } else {
                        // 小/中學顯示後續字；高中以上顯示方框
                        html += `<span class="game19-hint-next">${settings.goldBorderHint ? this.poemChars[i] : '□'}</span>`;
                    }
                }
                el.innerHTML = html;
            }
        },

        // ── 主迴圈 ────────────────────────────────────────────────
        startLoop: function () {
            if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
            this.isActive = true;
            this.lastTime = performance.now();
            const loop = (time) => {
                if (!this.isActive) return;
                const dt = Math.min((time - this.lastTime) / 1000, 0.05);
                this.lastTime = time;
                this.update(dt);
                this.draw();
                this.animFrameId = requestAnimationFrame(loop);
            };
            this.animFrameId = requestAnimationFrame(loop);
        },

        stopGameLoop: function () {
            if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
            this.animFrameId = null;
        },

        // ── 更新邏輯 ──────────────────────────────────────────────
        update: function (dt) {
            if (this.isPausedForPowerUp) return;

            // 結束動畫階段：只繼續粒子
            if (this.isEnding) {
                this.updateParticles(dt);
                return;
            }

            const settings = this.difficultySettings[this.difficulty];

            // 無敵幀 & 受傷計時
            if (this.player.hitTimer > 0) this.player.hitTimer -= dt;
            if (this.player.invincibleTimer > 0) this.player.invincibleTimer -= dt;
            if (this.screenFlash > 0) this.screenFlash -= dt;

            // 字排下降 & 各自漂移
            for (const row of this.rows) {
                if (!row.active) continue;
                row.baseY += settings.descentSpeed * dt;

                // 左右漂移（碰壁反彈）
                row.driftX += row.driftSpeed * row.driftDir * dt;
                const rowWidth = row.chars.length * 44;
                const maxDrift = (this.canvasW - rowWidth) / 2 - 10;
                if (row.driftX > maxDrift) { row.driftX = maxDrift; row.driftDir = -1; }
                if (row.driftX < -maxDrift) { row.driftX = -maxDrift; row.driftDir = 1; }
            }

            // 最底排下壓到玩家陣線 → 失敗
            const bottomRow = this.rows.find(r => r.active);
            if (bottomRow && bottomRow.baseY > this.canvasH - 120) {
                this.triggerFail('字陣已壓入陣線！');
                return;
            }

            // 玩家自動連發（按住時）
            if (this.player.isFiring) {
                this.player.lastFired += dt;
                if (this.player.lastFired >= 0.5 / this.player.fireRateMultiplier) {
                    this.player.lastFired = 0;
                    this.fireBullet();
                }
            }

            // 子彈向上移動，子彈速度
            for (let i = this.player.bullets.length - 1; i >= 0; i--) {
                this.player.bullets[i].y -= this.player.bulletsInitSpeed * dt;
                if (this.player.bullets[i].y < -10) this.player.bullets.splice(i, 1);
            }

            // 混淆字炸彈生成（最底排混淆字定時投彈）
            this.bombTimer += dt;
            if (this.bombTimer >= settings.bombInterval && bottomRow) {
                this.bombTimer = 0;
                this.spawnBomb(bottomRow);
            }

            // 炸彈下落（帶重力）
            for (let i = this.bombs.length - 1; i >= 0; i--) {
                const b = this.bombs[i];
                b.vy += 120 * dt;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                if (b.y > this.canvasH + 20) this.bombs.splice(i, 1);
            }

            // 弧線特攻混淆字
            this.arcRaiderTimer += dt;
            if (settings.arcRaiderInterval < 9999 && this.arcRaiderTimer >= settings.arcRaiderInterval) {
                this.arcRaiderTimer = 0;
                this.spawnArcRaider();
            }
            this.updateArcRaiders(dt);

            // 粒子
            this.updateParticles(dt);

            // 碰撞
            this.checkCollisions();
        },

        updateParticles: function (dt) {
            for (let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt;
                if (p.life <= 0) this.particles.splice(i, 1);
            }
        },

        // ── 發射子彈 ──────────────────────────────────────────────
        fireBullet: function () {
            const count = this.player.multiLevel;
            const spread = 14;
            const py = this.player.y - 12; // 砲台頂端
            for (let i = 0; i < count; i++) {
                const off = (i - (count - 1) / 2) * spread;
                this.player.bullets.push({
                    x: this.player.x + off,
                    y: py
                });
            }
            if (window.SoundManager) window.SoundManager.playHit(1, 0.2);
        },

        // ── 生成炸彈（最底排混淆字投彈）────────────────────────
        spawnBomb: function (bottomRow) {
            const decoys = bottomRow.chars.map((c, idx) => ({ ...c, idx })).filter(c => !c.isCorrect);
            if (!decoys.length) return;
            const src = decoys[Math.floor(Math.random() * decoys.length)];
            const x = this.getCharX(bottomRow, src.idx);
            const angle = (Math.random() - 0.5) * 0.5;
            this.bombs.push({ x, y: bottomRow.baseY + 10, vx: Math.sin(angle) * 50, vy: 40, r: 5 });
        },

        // ── 弧線特攻混淆字 ────────────────────────────────────────
        // 優化 #1：持續飛行全程不停頓，沿三次貝茲曲線低掠玩家上方
        // 靠近玩家時（y 較大）投彈更密集，迫使玩家移動閃避
        spawnArcRaider: function () {
            const fromLeft = Math.random() < 0.5;
            const pool = this.buildDecoyPool();
            const char = pool[Math.floor(Math.random() * Math.min(15, pool.length))];
            this.arcRaiders.push({
                char,
                t: 0,
                fromLeft,
                x: 0,
                y: 0,
                lastBombT: 0,                               // 上次投彈時的 t 值
                bombInterval: 0.08 + Math.random() * 0.1  // 遠距投彈間隔（靠近時會縮短）
            });
            if (window.SoundManager) window.SoundManager.playOpenItem();
        },

        updateArcRaiders: function (dt) {
            const speed = 0.25; // 飛行速度（稍慢讓玩家有更長壓迫感）
            for (let i = this.arcRaiders.length - 1; i >= 0; i--) {
                const r = this.arcRaiders[i];
                r.t = Math.min(r.t + speed * dt, 1);

                // 三次貝茲曲線：從一側飛入 → 低掠玩家上方 → 從另一側飛出（全程不停頓）
                const P0x = r.fromLeft ? -60 : this.canvasW + 60;
                const P3x = r.fromLeft ? this.canvasW + 60 : -60;
                // 控制點讓曲線在中段低飛，逼近玩家砲台上方約 160px
                const P1x = r.fromLeft ? this.canvasW * 0.28 : this.canvasW * 0.72;
                const P2x = r.fromLeft ? this.canvasW * 0.72 : this.canvasW * 0.28;
                const { x, y } = this.bezier3(r.t,
                    P0x, 90,
                    P1x, this.canvasH - 160,
                    P2x, this.canvasH - 160,
                    P3x, 90
                );
                r.x = x;
                r.y = y;

                // 靠近玩家（y > canvasH-240）時大幅縮短投彈間隔，形成彈幕壓力
                const nearPlayer = r.y > this.canvasH - 240;
                const effectiveInterval = nearPlayer
                    ? r.bombInterval * 0.35   // 近距：投彈頻率約為遠距 3 倍
                    : r.bombInterval;

                if (r.t - r.lastBombT >= effectiveInterval) {
                    // 靠近時投彈角度更散（強迫玩家大幅閃避）
                    const spread = nearPlayer ? 1.4 : 0.9;
                    const ang = (Math.random() - 0.5) * spread;
                    this.bombs.push({
                        x: r.x, y: r.y,
                        vx: Math.sin(ang) * (nearPlayer ? 85 : 60),
                        vy: 50 + Math.random() * 55,
                        r: 5
                    });
                    r.lastBombT = r.t;
                }

                if (r.t >= 1) this.arcRaiders.splice(i, 1);
            }
        },

        // 二次貝茲曲線（保留，spawnBomb 等地方仍在用）
        bezier: function (t, p0x, p0y, p1x, p1y, p2x, p2y) {
            const mt = 1 - t;
            return {
                x: mt * mt * p0x + 2 * mt * t * p1x + t * t * p2x,
                y: mt * mt * p0y + 2 * mt * t * p1y + t * t * p2y
            };
        },

        // 三次貝茲曲線（供弧線特攻使用）
        bezier3: function (t, p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y) {
            const mt = 1 - t;
            return {
                x: mt * mt * mt * p0x + 3 * mt * mt * t * p1x + 3 * mt * t * t * p2x + t * t * t * p3x,
                y: mt * mt * mt * p0y + 3 * mt * mt * t * p1y + 3 * mt * t * t * p2y + t * t * t * p3y
            };
        },

        // ── 碰撞檢測 ──────────────────────────────────────────────
        checkCollisions: function () {
            const bottomRow = this.rows.find(r => r.active);
            if (!bottomRow) return;

            // 子彈 vs 最底排字元
            for (let bi = this.player.bullets.length - 1; bi >= 0; bi--) {
                const b = this.player.bullets[bi];
                let consumed = false;

                for (let ci = 0; ci < bottomRow.chars.length; ci++) {
                    const cx = this.getCharX(bottomRow, ci);
                    const cy = bottomRow.baseY;
                    const c = bottomRow.chars[ci];
                    const scale = c.isCorrect ? bottomRow.correctScale : 1.0;
                    const hw = (36 * scale + 8) / 2;
                    const hh = (36 * scale + 8) / 2;

                    if (Math.abs(b.x - cx) < hw && Math.abs(b.y - cy) < hh) {
                        if (c.isCorrect) {
                            // 命中正確字：氣球膨脹（每次 +10%，從 100% 開始）
                            bottomRow.correctHitCount++;
                            // 第1次 → 110%，第2次 → 120%，第k次 → 100% + k×10%
                            bottomRow.correctScale = 1.0 + bottomRow.correctHitCount * 0.1;
                            this.spawnParticles(b.x, b.y, 'gold', 6);
                            if (window.SoundManager) window.SoundManager.playHit(15, 0.8);

                            if (bottomRow.correctHitCount >= bottomRow.maxHits) {
                                // 正確字膨脹至 150% → 爆炸，整排消除
                                consumed = true;
                                this.score += (window.ScoreManager ? window.ScoreManager.gameSettings['game19'].getPointA : 5);
                                this.updateScoreUI();
                                this.destroyBottomRow(bottomRow);
                                this.player.bullets.splice(bi, 1);
                                return; // 本幀結束
                            }
                            // 子彈命中正確字後被吸收
                            consumed = true;
                        } else {
                            // 命中混淆字：輕量粒子，無傷害，子彈被擋住
                            this.spawnParticles(b.x, b.y, 'rgba(200,200,200,0.8)', 3);
                            consumed = true;
                        }
                        break;
                    }
                }
                if (consumed) this.player.bullets.splice(bi, 1);
            }

            // 炸彈 vs 玩家（有無敵幀保護）
            if (this.player.invincibleTimer > 0) return;

            for (let i = this.bombs.length - 1; i >= 0; i--) {
                const bomb = this.bombs[i];
                if (Math.abs(bomb.x - this.player.x) < 32 && Math.abs(bomb.y - this.player.y) < 22) {
                    this.bombs.splice(i, 1);
                    this.handlePlayerHit();
                }
            }
        },

        // ── 消除最底排 ────────────────────────────────────────────
        destroyBottomRow: function (row) {
            row.active = false;
            const correctIdx = row.chars.findIndex(c => c.isCorrect);
            this.spawnParticles(this.getCharX(row, correctIdx), row.baseY, 'gold', 28);
            row.chars.forEach((c, idx) => {
                if (!c.isCorrect) this.spawnParticles(this.getCharX(row, idx), row.baseY, 'white', 6);
            });
            if (window.SoundManager) window.SoundManager.playSuccess();

            this.currentTargetIdx++;
            this.updateHintBar();

            const remaining = this.rows.filter(r => r.active);
            if (remaining.length === 0) {
                // 全部清空 → 勝利
                this.isEnding = true;
                if (window.SoundManager) setTimeout(() => window.SoundManager.playJoyfulTripleSlow(), 300);
                setTimeout(() => this.gameOver(true, ''), 1200);
                return;
            }

            // 只有句末字排才觸發三選一強化選單
            // （例如「床前明月光」只有消除「光」那排才出現選單）
            if (row.isSentenceEnd) {
                this.triggerPowerUpScreen();
            }
        },

        // ── 三選一獎勵 ────────────────────────────────────────────
        triggerPowerUpScreen: function () {
            this.isPausedForPowerUp = true;
            this.powerUpChoices = ['快速發射', '雙管齊發', '炸彈護盾'];
            if (window.SoundManager) window.SoundManager.playJoyfulTriple();
        },

        handlePowerUpClick: function (cx, cy) {
            if (!this.powerUpChoices.length) return;
            const boxW = 120, boxH = 155, gap = 20;
            const startX = (this.canvasW - 3 * boxW - 2 * gap) / 2;
            const y = this.canvasH / 2 - 55;
            for (let i = 0; i < 3; i++) {
                const bx = startX + i * (boxW + gap);
                if (cx >= bx && cx <= bx + boxW && cy >= y && cy <= y + boxH) {
                    this.applyPowerUp(this.powerUpChoices[i]);
                    this.powerUpChoices = [];
                    this.isPausedForPowerUp = false;
                    this.lastTime = performance.now(); // 修正時間差，避免 dt 過大
                    break;
                }
            }
        },

        applyPowerUp: function (type) {
            if (window.SoundManager) window.SoundManager.playConfirmItem();
            if (type === '快速發射') {
                // 每次疊加 +1.0 倍率，上限 4.0x（避免射速過快失去遊戲性）
                this.player.fireRateMultiplier = Math.min(this.player.fireRateMultiplier + 1.0, 4.0);
            } else if (type === '雙管齊發') {
                this.player.multiLevel = Math.min(this.player.multiLevel + 1, 3);
            } else if (type === '炸彈護盾') {
                this.player.invincibleTimer += 8;
            }
        },

        // ── 玩家受傷 ──────────────────────────────────────────────
        handlePlayerHit: function () {
            this.lives--;
            this.player.hitTimer = 0.35;
            this.player.invincibleTimer = 1.5;
            this.screenFlash = 0.25;
            this.spawnParticles(this.player.x, this.canvasH - 100, 'hsl(0,80%,60%)', 12);
            this.renderHearts();
            if (window.SoundManager) window.SoundManager.playFailure();
            if (this.lives <= 0) this.triggerFail('生命耗盡...');
        },

        triggerFail: function (reason) {
            if (this.isEnding) return;
            this.isEnding = true;
            this.spawnParticles(this.player.x, this.canvasH - 100, 'red', 36);
            setTimeout(() => this.gameOver(false, reason), 1000);
        },

        // ── 取得字元中心 X 座標 ───────────────────────────────────
        getCharX: function (row, idx) {
            const charW = 44;
            const totalW = row.chars.length * charW;
            const startX = (this.canvasW - totalW) / 2 + row.driftX;
            return startX + idx * charW + charW / 2;
        },

        // ── 粒子生成 ──────────────────────────────────────────────
        spawnParticles: function (x, y, color, count) {
            for (let i = 0; i < count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 130 + 40;
                this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color, life: Math.random() * 0.5 + 0.25 });
            }
        },

        // ── 繪製 ──────────────────────────────────────────────────
        draw: function () {
            const ctx = this.ctx;
            if (!ctx) return;
            ctx.clearRect(0, 0, this.canvasW, this.canvasH);

            // 背景漸層
            const bg = ctx.createRadialGradient(this.canvasW / 2, this.canvasH / 2, 60, this.canvasW / 2, this.canvasH / 2, 380);
            bg.addColorStop(0, 'hsl(210, 30%, 18%)');
            bg.addColorStop(1, 'hsl(210, 15%, 7%)');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, this.canvasW, this.canvasH);

            // 全螢幕紅閃（受傷視覺回饋）
            if (this.screenFlash > 0) {
                ctx.fillStyle = `rgba(220,30,30,${Math.min(0.45, this.screenFlash * 1.5)})`;
                ctx.fillRect(0, 0, this.canvasW, this.canvasH);
            }

            this.drawRows(ctx);
            this.drawBullets(ctx);
            this.drawBombs(ctx);
            this.drawArcRaiders(ctx);
            this.drawParticles(ctx);
            this.drawPlayer(ctx);

            if (this.isPausedForPowerUp && this.powerUpChoices.length > 0) {
                this.drawPowerUpScreen(ctx);
            }
        },

        drawRows: function (ctx) {
            // 設計原則：
            // ─ 每排所有字（正確＋混淆）同一顏色，玩家須靠詩詞記憶辨別正確字
            // ─ 句末字排（isSentenceEnd）顯示金色，其餘排顯示白色
            // ─ 最底排（可攻擊排）下方畫提示線，顏色與字色一致（白排=白線，金排=金線）
            // ─ 正確字命中後：字體逐漸膨脹（+10%/hit）且顏色漸漸轉為紅色
            const bottomRow = this.rows.find(r => r.active);
            const fontSize = 36;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (const row of this.rows) {
                if (!row.active) continue;
                const isBottom = (row === bottomRow);
                const baseOpacity = isBottom ? 1.0 : 0.55;
                const totalW = row.chars.length * 44;
                const startX = (this.canvasW - totalW) / 2 + row.driftX;

                // 此排的基礎顏色（H/S/L 分量，方便後面做紅色內插）
                const isGolden = row.isSentenceEnd;
                // 金色：hsl(45, 88%, 72%)；白色：hsl(220, 15%, 88%)
                const baseH = isGolden ? 45 : 220;
                const baseS = isGolden ? 88 : 15;
                const baseL = isGolden ? 72 : 88;

                // 最底排提示線：顏色與字色相同（優化 #3）
                /*
                if (isBottom) {
                    ctx.strokeStyle = `hsla(${baseH}, ${baseS}%, ${baseL}%, ${baseOpacity})`;
                    ctx.lineWidth = 1.8;
                    ctx.beginPath();
                    ctx.moveTo(startX - 5, row.baseY + 23);
                    ctx.lineTo(startX + totalW + 5, row.baseY + 23);
                    ctx.stroke();
                }
                */
                for (let ci = 0; ci < row.chars.length; ci++) {
                    const c = row.chars[ci];
                    const cx = this.getCharX(row, ci);
                    const cy = row.baseY;

                    if (c.isCorrect && row.correctHitCount > 0) {
                        // 正確字已被命中：膨脹 + 漸紅（優化 #4）
                        // 紅色比例 = correctHitCount / maxHits（每次命中 +1/maxHits）
                        const redFrac = Math.min(row.correctHitCount / row.maxHits, 1);
                        // 從基礎色內插到紅色 hsl(0, 90%, 50%)
                        const h = Math.round(baseH * (1 - redFrac));          // hue → 0（紅）
                        const s = Math.round(baseS + (90 - baseS) * redFrac); // sat → 90
                        const l = Math.round(baseL + (50 - baseL) * redFrac); // lit → 50
                        const scale = row.correctScale;

                        ctx.save();
                        // 頂端對齊膨脹（字往下膨脹，頂端位置固定）
                        ctx.translate(cx, cy - fontSize * (scale - 1) / 2);
                        ctx.scale(scale, scale);
                        ctx.shadowBlur = 10 + 12 * redFrac;
                        ctx.shadowColor = `hsl(${h}, ${s}%, ${Math.max(l - 10, 30)}%)`;
                        ctx.font = `bold ${fontSize}px 'Noto Serif TC'`;
                        ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${baseOpacity})`;
                        ctx.fillText(c.char, 0, 0);
                        ctx.shadowBlur = 0;
                        ctx.restore();
                    } else {
                        // 未命中狀態（含未被命中的正確字）：統一排顏色，無法靠視覺辨認正確字
                        ctx.globalAlpha = baseOpacity;
                        ctx.shadowBlur = isGolden ? 7 : 3;
                        ctx.shadowColor = isGolden
                            ? 'hsla(45, 80%, 52%, 0.5)'
                            : 'rgba(100,120,180,0.3)';
                        ctx.font = `${fontSize}px 'Noto Serif TC'`;
                        ctx.fillStyle = `hsl(${baseH}, ${baseS}%, ${baseL}%)`;
                        ctx.fillText(c.char, cx, cy);
                        ctx.shadowBlur = 0;
                        ctx.globalAlpha = 1.0;
                    }
                }
            }
        },

        drawBullets: function (ctx) {
            ctx.fillStyle = 'hsl(55, 90%, 80%)';
            ctx.shadowBlur = 4;
            ctx.shadowColor = 'gold';
            for (const b of this.player.bullets) {
                ctx.beginPath();
                ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        },

        drawBombs: function (ctx) {
            for (const bomb of this.bombs) {
                ctx.fillStyle = 'hsl(0, 75%, 52%)';
                ctx.strokeStyle = 'hsl(0, 90%, 75%)';
                ctx.lineWidth = 1.5;
                ctx.shadowBlur = 6;
                ctx.shadowColor = 'hsl(0, 80%, 40%)';
                ctx.beginPath();
                ctx.arc(bomb.x, bomb.y, bomb.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
        },

        drawArcRaiders: function (ctx) {
            ctx.font = "bold 30px 'Noto Serif TC'";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (const r of this.arcRaiders) {
                ctx.shadowBlur = 18;
                ctx.shadowColor = 'hsl(0, 80%, 50%)';
                ctx.fillStyle = 'hsl(0, 65%, 72%)';
                ctx.fillText(r.char, r.x, r.y);
            }
            ctx.shadowBlur = 0;
        },

        drawParticles: function (ctx) {
            for (const p of this.particles) {
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
            }
            ctx.globalAlpha = 1.0;
        },

        drawPlayer: function (ctx) {
            const px = this.player.x;
            const py = this.player.y;
            const pw = this.player.width;
            const ph = this.player.height;

            // 無敵幀閃爍
            if (this.player.invincibleTimer > 0 && Math.floor(this.player.invincibleTimer * 9) % 2 === 0) return;

            // 砲台本體
            ctx.fillStyle = this.player.hitTimer > 0 ? 'hsl(0, 80%, 60%)' : 'hsl(36, 80%, 52%)';
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'hsl(36, 80%, 40%)';
            ctx.fillRect(px - pw / 2, py, pw, ph);
            ctx.shadowBlur = 0;

            // 槍管（依多重射擊等級）
            const gunW = 7, gunH = 14, spread = 14;
            ctx.fillStyle = 'hsl(36, 70%, 65%)';
            for (let i = 0; i < this.player.multiLevel; i++) {
                const off = (i - (this.player.multiLevel - 1) / 2) * spread;
                ctx.fillRect(px + off - gunW / 2, py - gunH, gunW, gunH);
            }

            // 炸彈護盾視覺
            if (this.player.invincibleTimer > 0) {
                const alpha = Math.min(0.7, this.player.invincibleTimer * 0.25);
                ctx.strokeStyle = `hsla(200, 80%, 70%, ${alpha})`;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.arc(px, py + ph / 2, 38, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        },

        drawPowerUpScreen: function (ctx) {
            // 半透明遮罩
            ctx.fillStyle = 'rgba(0,0,0,0.68)';
            ctx.fillRect(0, 0, this.canvasW, this.canvasH);

            ctx.fillStyle = 'hsl(50, 85%, 75%)';
            ctx.font = "bold 26px 'Noto Serif TC'";
            ctx.textAlign = 'center';
            ctx.fillText('選擇強化項目', this.canvasW / 2, this.canvasH / 2 - 105);

            const boxW = 120, boxH = 155, gap = 20;
            const startX = (this.canvasW - 3 * boxW - 2 * gap) / 2;
            const y = this.canvasH / 2 - 55;

            const info = {
                '快速發射': { row1: '快速', row2: '發射', note: `射速 ×${Math.min((this.player.fireRateMultiplier + 1.0).toFixed(1), 4.0)}` },
                '雙管齊發': { row1: '雙管', row2: '齊發', note: '多一發' },
                '炸彈護盾': { row1: '炸彈', row2: '護盾', note: '8秒無敵' }
            };

            this.powerUpChoices.forEach((choice, i) => {
                const bx = startX + i * (boxW + gap);
                ctx.fillStyle = 'hsl(220, 30%, 22%)';
                ctx.strokeStyle = 'hsl(45, 70%, 55%)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(bx, y, boxW, boxH, 10);
                else ctx.rect(bx, y, boxW, boxH);
                ctx.fill();
                ctx.stroke();

                const d = info[choice] || { row1: choice, row2: '', note: '' };
                ctx.fillStyle = 'hsl(50, 90%, 85%)';
                ctx.font = "bold 24px 'Noto Serif TC'";
                ctx.textAlign = 'center';
                ctx.fillText(d.row1, bx + boxW / 2, y + 50);
                ctx.fillText(d.row2, bx + boxW / 2, y + 80);
                ctx.font = "15px 'Noto Serif TC'";
                ctx.fillStyle = 'hsl(50, 60%, 68%)';
                ctx.fillText(d.note, bx + boxW / 2, y + 120);
            });
        },

        // ── 計時器 ────────────────────────────────────────────────
        startTimer: function () {
            clearInterval(this.timerInterval);
            const settings = this.difficultySettings[this.difficulty];
            // 實際時限 = 全詩字數 × timeLimitRate
            this.timeLimit = this.poemChars.length * settings.timeLimitRate;
            this.timeLeft = this.timeLimit;
            // 立即把框重置為空（ratio=1 → 無筆觸顯示），避免殘留上一局的框
            this.updateTimerRing(1);
            const start = Date.now();
            this.timerInterval = setInterval(() => {
                if (this.isPausedForPowerUp || !this.isActive) return;
                const elapsed = (Date.now() - start) / 1000;
                this.timeLeft = Math.max(0, this.timeLimit - elapsed);
                this.updateTimerRing(this.timeLeft / this.timeLimit);
                if (this.timeLeft <= 0 && !this.isEnding) this.gameOver(false, '時間到！');
            }, 100);
        },

        // ── 計時框更新 ────────────────────────────────────────────
        // 設計邏輯：框從「空」慢慢增長到「滿」，配合顏色從暗紅→鮮紅
        //   ‣ 一開始框完全不顯示（零壓力）
        //   ‣ 時間流逝 → 框順時針從左上角開始慢慢延伸
        //   ‣ 快時間到 → 框幾乎填滿 + 顏色鮮亮，逐漸加大壓力感
        // ratio = timeLeft / timeLimit（1=剛開始，0=時間到）
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game19-timer-path');
            const svg = document.getElementById('game19-timer-ring');
            if (!rect || !svg) return;
            const w = this.canvasW, h = this.canvasH;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            const rw = w - 6, rh = h - 6;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);
            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
                // 二段 dasharray：[剩餘*P, 消逝*P]，dashoffset=剩餘*P
                // → 可見弧段 = 路徑「消逝%→100%」區段（正確接在紅色弧段之後）
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                // dashoffset = perimeter * ratio：ratio=1→空框，ratio=0→完整框
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                const s = Math.round(50 + 40 * elapsed);
                const l = Math.round(22 + 32 * elapsed);
                rect.style.stroke = `hsl(0, ${s}%, ${l}%)`;
            }
        },

        renderHearts: function () {
            const el = document.getElementById('game19-hearts');
            if (!el) return;
            el.innerHTML = '';
            for (let i = 0; i < this.maxLives; i++) {
                const span = document.createElement('span');
                const lost = this.maxLives - this.lives;
                span.className = 'heart' + (i < lost ? ' empty' : '');
                span.textContent = i < lost ? '♡' : '❤️';
                el.appendChild(span);
            }
        },

        updateScoreUI: function () {
            const el = document.getElementById('game19-score');
            if (el) el.textContent = this.score;
        },

        // ── 遊戲結束 ──────────────────────────────────────────────
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);
            this.stopGameLoop();

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({ gameNo: 19, difficulty: this.difficulty, score: 0, isWin: false, durationS });
            }

            if (win) {
                document.getElementById('game19-retryGame-btn').disabled = true;
                document.getElementById('game19-newGame-btn').disabled = true;
            } else {
                document.getElementById('game19-retryGame-btn').disabled = false;
                document.getElementById('game19-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) { this.currentLevelIndex++; this.startNewGame(); }
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '挑戰結束'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm
                    });
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game19',
                    timerContainerId: 'game19-area',
                    scoreElementId: 'game19-score',
                    heartsSelector: '#game19-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        if (this.isLevelMode) window.ScoreManager.completeLevel('game19', this.difficulty, this.currentLevelIndex);
                        showMessage(finalScore);
                    }
                });
            } else {
                showMessage();
            }
        },

        hide: function () { this.stopGame(); },

        // ⚠️ stopGame 必須主動隱藏 overlay：menu.js 全域清理只呼叫 stopGame()
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopGameLoop();
            if (this.container) this.container.classList.add('hidden');
            document.body.classList.remove('overlay-active');
        }
    };

    window.Game19 = Game19;

    if (new URLSearchParams(window.location.search).get('game') === '19') {
        setTimeout(() => {
            if (window.Game19) window.Game19.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
