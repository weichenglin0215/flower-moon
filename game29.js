/* =========================================
   Game29《字龍盤環》(Verse-Dragon Coil)
   ----------------------------------------
   花月版 A6 滾球收集版 ── 源自 Zuma / Marble Blast。
   偽 3D 環形軌道上字球長龍沿軌道流動，玩家點擊軌道
   任一位置，中心發射台朝該方向旋轉並射出字球，
   命中插入長龍後 3 顆同字相連即消除並收集對應字。
   連鎖 ≥ 設定階數時觸發救援倒退（長龍後退 5 格弧長）。
   ----------------------------------------
   依《.agent/skills/花月開發常見錯誤與解法.md §4》規範：
   - 全域 class 前綴 game29-
   - loadCSS() 動態防護（id=game29-css）
   - overlay 掛載 document.body 並套用 registerOverlayResize
   - stopGame() 必須隱藏 container 且停止 RAF
   - 完整支援關卡挑戰模式（callback 接 selectedLevel, levelIndex）
   - 時限 = targetChars.length × timeLimitRate
   - 詩透過 getSharedRandomPoem 抽取
   ========================================= */

(function () {
    const Game29 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        isWin: false,

        // ── 詩詞 ──
        currentPoem: null,
        poemLines: [],            // 詩句陣列
        targetChars: [],          // 全詩字陣列（去標點）── 用於時限計算
        currentLineIndex: 0,      // 當前句索引
        currentLineChars: [],     // 當前句去重後的目標字
        collectProgress: {},      // { 字: 已收集次數 }
        collectTarget: 1,         // 每字需收集次數

        // ── Canvas 與軌道幾何 ──
        canvasWidth: 480,
        canvasHeight: 600,
        trackPoints: [],          // 軌道採樣點 [{x, y, t}]，t 為沿軌道弧長累積（0 → totalLen）
        trackTotalLen: 0,         // 軌道總弧長
        ballR: 16,                // 字球半徑（邏輯像素）
        centerX: 240,             // 中心發射台 X
        centerY: 300,             // 中心發射台 Y

        // ── 字球長龍 ──
        dragon: [],               // [{char, s}]，s = 沿軌道弧長位置（0 為入口，trackTotalLen 為終點）
        dragonSpeed: 0,           // 每毫秒沿軌道前進的弧長（px/ms）

        // ── 發射台 ──
        launcherAngle: -Math.PI / 2,  // 發射台朝向角（弧度）
        launcherTargetAngle: -Math.PI / 2,
        launcherRotateUntil: 0,   // 旋轉中倒數（毫秒，>0 期間不發射）
        nextChar: '',             // 下一顆字
        afterNextChar: '',        // 下下顆字
        lastFireTime: 0,          // 上次發射時間（用於 0.3 秒節流）
        flyingBall: null,         // { x, y, vx, vy, char }

        // ── 動畫/節奏 ──
        rafId: null,
        lastTickTime: 0,
        chainPause: 0,            // 連鎖期間長龍暫停倒數（毫秒）
        warningActive: false,     // 末端警示

        // ── 計時 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        // 同字必同色：依字在 currentLineChars 索引等分 360°
        // 目標字 → 在 drawBall 中採高彩度高亮度；干擾字（不在 currentLineChars） → 低彩度灰調
        getHueForChar: function (ch) {
            if (!ch) return 40;
            const idx = this.currentLineChars.indexOf(ch);
            if (idx >= 0) {
                const n = this.currentLineChars.length || 1;
                return Math.round((360 / n) * idx + 12) % 360;
            }
            let h = 0;
            for (let i = 0; i < ch.length; i++) h = (h * 31 + ch.charCodeAt(i)) >>> 0;
            return h % 360;
        },
        isTargetChar: function (ch) {
            return this.currentLineChars.indexOf(ch) >= 0;
        },

        /*
         * 難度設定（嚴格依企劃書 §7）
         * flowSpeed     ：長龍流動速度（px/ms）
         * poemMinRating ：詩評下限
         * trackLengthGrid：軌道長度（以字球直徑為單位的格數）── 影響軌道實際長度
         * decoyRatio    ：干擾字比例
         * previewCount  ：預覽顆數（0/1/2）
         * chainRescueThreshold：救援倒退所需連鎖階數
         * timeLimitRate ：每字時間倍率（0=不用時限，以長龍頭觸終點為主）
         * minLines/maxLines/minChars/maxChars：詩詞篩選
         */
        difficultySettings: {
            '小學':   { flowSpeed: 0.020, poemMinRating: 6, trackLengthGrid: 30, decoyRatio: 0.10, previewCount: 2, chainRescueThreshold: 2, timeLimitRate: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '中學':   { flowSpeed: 0.030, poemMinRating: 5, trackLengthGrid: 35, decoyRatio: 0.20, previewCount: 2, chainRescueThreshold: 3, timeLimitRate: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '高中':   { flowSpeed: 0.040, poemMinRating: 4, trackLengthGrid: 40, decoyRatio: 0.30, previewCount: 1, chainRescueThreshold: 3, timeLimitRate: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '大學':   { flowSpeed: 0.055, poemMinRating: 3, trackLengthGrid: 45, decoyRatio: 0.40, previewCount: 1, chainRescueThreshold: 4, timeLimitRate: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 },
            '研究所': { flowSpeed: 0.075, poemMinRating: 3, trackLengthGrid: 50, decoyRatio: 0.50, previewCount: 0, chainRescueThreshold: 5, timeLimitRate: 0, minLines: 2, maxLines: 4, minChars: 8, maxChars: 28 }
        },

        // ── CSS 載入防護 ──
        loadCSS: function () {
            if (!document.getElementById('game29-css')) {
                const link = document.createElement('link');
                link.id = 'game29-css';
                link.rel = 'stylesheet';
                link.href = 'game29.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game29-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game29-container');
        },

        // 建立 overlay DOM（掛 document.body 而非 #stage，避免 scale 重複縮放）
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game29-container';
            div.className = 'game29-overlay hidden';
            div.innerHTML = `
                <div class="game29-header">
                    <div class="game29-score-board">分數: <span id="game29-score">0</span></div>
                    <div class="game29-controls">
                        <button class="game29-difficulty-tag" id="game29-diff-tag">小學</button>
                        <button id="game29-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game29-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game29-sub-header">
                    <div id="game29-poem-info" class="poem-info" style="cursor:pointer; text-decoration:underline; opacity:0.85;"></div>
                </div>
                <div class="game29-info-bar">
                    <div id="game29-line-text" class="game29-line-text"></div>
                    <div id="game29-progress" class="game29-progress"></div>
                    <div id="game29-next-preview" class="game29-next-preview">
                        下一顆：<span id="game29-next-char">－</span>
                        <span class="game29-after-wrap">下下顆：<span id="game29-after-next-char">－</span></span>
                    </div>
                </div>
                <div class="game29-area">
                    <div id="game29-board-wrapper" class="game29-board-wrapper">
                        <svg id="game29-timer-ring">
                            <rect id="game29-timer-path" x="3" y="3"></rect>
                        </svg>
                        <canvas id="game29-canvas" width="480" height="600"></canvas>
                        <div id="game29-warning-overlay" class="game29-warning-overlay hidden"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放（避開 #stage 的 transform 雙重縮放）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = 500 + 'px';
                    div.style.height = 850 + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }

            // 按鈕綁定
            document.getElementById('game29-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game29-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game29-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 點擊射擊：單擊即發射（不需 drag）
            const canvas = document.getElementById('game29-canvas');
            canvas.addEventListener('mousedown', this.onShoot.bind(this));
            canvas.addEventListener('touchstart', this.onShoot.bind(this), { passive: false });
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container',
                'game4-container', 'game5-container', 'game6-container', 'game7-container',
                'game8-container', 'game9-container', 'game10-container', 'game11-container',
                'game12-container', 'game13-container', 'game14-container', 'game15-container',
                'game16-container', 'game17-container', 'game18-container', 'game19-container',
                'game20-container', 'game21-container', 'game22-container', 'game23-container',
                'game24-container', 'game25-container', 'game26-container', 'game27-container',
                'game28-container'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopRAF();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('字龍盤環', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
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

        updateUIForMode: function () {
            const diffTag = document.getElementById('game29-diff-tag');
            const retryBtn = document.getElementById('game29-retryGame-btn');
            const newBtn = document.getElementById('game29-newGame-btn');
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
        },

        hide: function () { this.stopGame(); },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，必須隱藏 container 且停 RAF
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopRAF();
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 抽詩（共用 getSharedRandomPoem，依 §4 規範）
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要先載入 script.js 中的 getSharedRandomPoem 函數');
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                settings.minLines,
                settings.maxLines,
                settings.minChars,
                settings.maxChars,
                '',
                this.isLevelMode ? this.currentLevelIndex : null,
                'game29'
            );
            if (!result) return false;
            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.targetChars = this.poemLines.join('').split('');

            const poemInfo = document.getElementById('game29-poem-info');
            const fullName = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            poemInfo.textContent = fullName.length > 16 ? (fullName.slice(0, 15) + '…') : fullName;
            poemInfo.title = fullName;
            poemInfo.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.isWin = false;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.currentLineIndex = 0;
            this.flyingBall = null;
            this.chainPause = 0;
            this.warningActive = false;
            this.launcherAngle = -Math.PI / 2;
            this.launcherTargetAngle = -Math.PI / 2;
            this.launcherRotateUntil = 0;
            this.lastFireTime = 0;

            const settings = this.difficultySettings[this.difficulty];
            this.collectTarget = 1; // 消除一群即收集 1 次

            document.getElementById('game29-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            document.getElementById('game29-retryGame-btn').disabled = false;
            document.getElementById('game29-newGame-btn').disabled = false;

            // 時限（依規範必須在抽詩之後用 targetChars.length 計算）
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game29-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                this.maxTimer = 0;
                document.getElementById('game29-timer-ring').style.display = 'none';
                clearInterval(this.timerInterval);
            }

            // 初始化軌道
            this.buildTrack();
            this.dragonSpeed = settings.flowSpeed;
            this.startCurrentLine();
            this.startRAF();
        },

        // ── 軌道生成：以中心為原點，繞行的開放曲線（從外緣入口 → 螺旋 → 終點漏斗）
        // 採用「外環半周 + 內環半周」的 S 形螺旋，以參數 u∈[0,1] 表示
        buildTrack: function () {
            this.canvasWidth = 480;
            this.canvasHeight = 600;
            this.centerX = this.canvasWidth / 2;
            this.centerY = this.canvasHeight / 2;

            // 軌道形狀：以 Catmull-Rom 控制的螺旋曲線；以採樣方式建立等距弧長表
            const settings = this.difficultySettings[this.difficulty];
            // 字球直徑作為單位，軌道格數 = trackLengthGrid
            const grid = settings.trackLengthGrid;
            // 動態調整字球半徑（讓軌道塞得下 grid 顆球）
            this.ballR = 16;

            // 螺旋參數：外半徑 → 內半徑，環繞圈數依 grid 決定
            const outerR = Math.min(this.canvasWidth, this.canvasHeight) * 0.46;
            const innerR = this.ballR * 2.2; // 接近發射台
            const turns = 1.6; // 環繞圈數（小數）── 螺旋盤環

            // 先用密集樣本計算曲線，再依弧長等距重採樣
            const dense = [];
            const denseN = 2000;
            for (let i = 0; i <= denseN; i++) {
                const u = i / denseN;
                // r 從 outerR 線性降到 innerR
                const r = outerR + (innerR - outerR) * u;
                // 角度從 PI（左方入口）順時針旋轉 turns 圈
                const angle = Math.PI + u * turns * Math.PI * 2;
                const x = this.centerX + Math.cos(angle) * r;
                const y = this.centerY + Math.sin(angle) * r;
                dense.push({ x, y });
            }
            // 計算累積弧長
            const denseLen = [0];
            for (let i = 1; i < dense.length; i++) {
                const dx = dense[i].x - dense[i - 1].x;
                const dy = dense[i].y - dense[i - 1].y;
                denseLen.push(denseLen[i - 1] + Math.sqrt(dx * dx + dy * dy));
            }
            const total = denseLen[denseLen.length - 1];
            this.trackTotalLen = total;

            // 等距採樣：每 1px 取一點，方便後續查詢
            const stepPx = 1;
            const sampleN = Math.ceil(total / stepPx);
            this.trackPoints = [];
            let cursor = 0;
            for (let i = 0; i <= sampleN; i++) {
                const targetLen = (i / sampleN) * total;
                while (cursor < dense.length - 1 && denseLen[cursor + 1] < targetLen) cursor++;
                const segLen = denseLen[cursor + 1] - denseLen[cursor];
                const ratio = segLen > 0 ? (targetLen - denseLen[cursor]) / segLen : 0;
                const x = dense[cursor].x + (dense[cursor + 1].x - dense[cursor].x) * ratio;
                const y = dense[cursor].y + (dense[cursor + 1].y - dense[cursor].y) * ratio;
                this.trackPoints.push({ x, y, t: targetLen });
            }
        },

        // 由弧長 s 取對應的 canvas 座標
        getTrackPos: function (s) {
            if (this.trackPoints.length === 0) return { x: this.centerX, y: this.centerY };
            const total = this.trackTotalLen;
            const clamped = Math.max(0, Math.min(total, s));
            const ratio = clamped / total;
            const idx = Math.floor(ratio * (this.trackPoints.length - 1));
            const next = Math.min(this.trackPoints.length - 1, idx + 1);
            const frac = ratio * (this.trackPoints.length - 1) - idx;
            const p0 = this.trackPoints[idx];
            const p1 = this.trackPoints[next];
            return { x: p0.x + (p1.x - p0.x) * frac, y: p0.y + (p1.y - p0.y) * frac };
        },

        // 給點 (x,y)，找最近的軌道弧長 s（投射）
        projectToTrack: function (x, y) {
            let bestS = 0;
            let bestD = Infinity;
            // 粗掃：每 6 個樣本
            const N = this.trackPoints.length;
            for (let i = 0; i < N; i += 6) {
                const p = this.trackPoints[i];
                const d = (p.x - x) ** 2 + (p.y - y) ** 2;
                if (d < bestD) { bestD = d; bestS = p.t; }
            }
            return bestS;
        },

        // ── 開始當前句的收集 ──
        startCurrentLine: function () {
            const line = this.poemLines[this.currentLineIndex] || '';
            const uniqueChars = [];
            const seen = {};
            for (const ch of line) {
                if (!seen[ch]) { seen[ch] = true; uniqueChars.push(ch); }
            }
            this.currentLineChars = uniqueChars;
            this.collectProgress = {};
            uniqueChars.forEach(ch => { this.collectProgress[ch] = 0; });

            this.updateLineDisplay();
            this.generateDragon();
            this.pickNextChar();
            this.pickAfterNextChar();
            this.updateNextPreview();

            this.lastTickTime = performance.now();
        },

        // 字頻顯示：多卡橫排（仿 game24） — 每張卡 = 上方彩色字球（同字龍同色 HUE）+ 下方 X/Y
        updateLineDisplay: function (animateNewlyLit) {
            const lineEl = document.getElementById('game29-line-text');
            const progEl = document.getElementById('game29-progress');
            const line = this.poemLines[this.currentLineIndex] || '';
            lineEl.innerHTML = `〈第 ${this.currentLineIndex + 1}/${this.poemLines.length} 句〉<span class="game29-line-poem">${line}</span>`;
            const prevGot = this._prevProgressSnap || {};
            let html = '';
            this.currentLineChars.forEach(ch => {
                const got = Math.min(this.collectTarget, this.collectProgress[ch] || 0);
                const prev = Math.min(this.collectTarget, prevGot[ch] || 0);
                const done = got >= this.collectTarget;
                const justDone = animateNewlyLit && done && prev < this.collectTarget;
                const hue = this.getHueForChar(ch);
                html += `<span class="game29-char-group ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g29-h:${hue}">`
                    + `<span class="game29-char-tile">${ch}</span>`
                    + `<span class="game29-char-count"><span class="game29-char-num">${got}</span>/<span class="game29-char-den">${this.collectTarget}</span></span>`
                    + `</span>`;
            });
            progEl.innerHTML = html;
            this._prevProgressSnap = Object.assign({}, this.collectProgress);
        },

        updateNextPreview: function () {
            const settings = this.difficultySettings[this.difficulty];
            const el = document.getElementById('game29-next-char');
            const el2 = document.getElementById('game29-after-next-char');
            const afterWrap = document.querySelector('.game29-after-wrap');
            if (settings.previewCount >= 1) {
                if (el) el.textContent = this.nextChar || '－';
            } else {
                if (el) el.textContent = '？';
            }
            if (settings.previewCount >= 2) {
                if (afterWrap) afterWrap.style.display = '';
                if (el2) el2.textContent = this.afterNextChar || '－';
            } else {
                if (afterWrap) afterWrap.style.display = 'none';
            }
        },

        // 生成初始長龍：依字球直徑為間距，從軌道入口（s=0）排起，
        // 初始填到軌道的 30%
        generateDragon: function () {
            this.dragon = [];
            const step = this.ballR * 2;
            const initLen = this.trackTotalLen * 0.3;
            let s = 0;
            while (s < initLen) {
                this.dragon.push({ char: this.pickDragonChar(), s });
                s += step;
            }
        },

        // 長龍字球加權生成：當前句缺口字 65% / 全詩其他字 25% / 純干擾 10%
        pickDragonChar: function () {
            const settings = this.difficultySettings[this.difficulty];
            const useDecoy = Math.random() < settings.decoyRatio;
            if (useDecoy) {
                // 干擾字：其他句字
                const otherChars = [];
                this.poemLines.forEach((ln, i) => {
                    if (i !== this.currentLineIndex) for (const ch of ln) otherChars.push(ch);
                });
                if (otherChars.length > 0) return otherChars[Math.floor(Math.random() * otherChars.length)];
            }
            const r = Math.random();
            const deficits = this.currentLineChars.filter(ch => (this.collectProgress[ch] || 0) < this.collectTarget);
            if (r < 0.65 && deficits.length > 0) return deficits[Math.floor(Math.random() * deficits.length)];
            if (r < 0.9 && this.targetChars.length > 0) return this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
            if (this.currentLineChars.length > 0) return this.currentLineChars[Math.floor(Math.random() * this.currentLineChars.length)];
            return '詩';
        },

        // 抽下一顆（玩家發射用）：偏向長龍上已有的字以利消除
        pickNextChar: function () {
            // 沿用 afterNextChar 銜接（若有的話）
            if (this.afterNextChar) {
                this.nextChar = this.afterNextChar;
                this.afterNextChar = '';
                return;
            }
            this.nextChar = this.pickPlayerChar();
        },

        pickAfterNextChar: function () {
            this.afterNextChar = this.pickPlayerChar();
        },

        pickPlayerChar: function () {
            const r = Math.random();
            const deficits = this.currentLineChars.filter(ch => (this.collectProgress[ch] || 0) < this.collectTarget);
            // 統計長龍上的字
            const dragonChars = {};
            this.dragon.forEach(b => { dragonChars[b.char] = (dragonChars[b.char] || 0) + 1; });
            const dragonKeys = Object.keys(dragonChars);

            if (r < 0.6 && deficits.length > 0) {
                // 找長龍上也有的缺口字
                const both = deficits.filter(ch => dragonChars[ch]);
                if (both.length > 0) return both[Math.floor(Math.random() * both.length)];
                return deficits[Math.floor(Math.random() * deficits.length)];
            } else if (r < 0.9 && dragonKeys.length > 0) {
                return dragonKeys[Math.floor(Math.random() * dragonKeys.length)];
            }
            if (this.targetChars.length > 0) return this.targetChars[Math.floor(Math.random() * this.targetChars.length)];
            return '詩';
        },

        // ── 點擊發射 ──
        getCanvasPoint: function (e) {
            const canvas = document.getElementById('game29-canvas');
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX; clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX; clientY = e.clientY;
            }
            const scaleX = this.canvasWidth / rect.width;
            const scaleY = this.canvasHeight / rect.height;
            return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
        },

        onShoot: function (e) {
            if (!this.isActive) return;
            if (e.cancelable) e.preventDefault();
            const now = performance.now();
            if (now - this.lastFireTime < 300) return; // 0.3 秒節流
            if (this.flyingBall) return;
            if (this.launcherRotateUntil > now) return;

            const p = this.getCanvasPoint(e);
            const dx = p.x - this.centerX;
            const dy = p.y - this.centerY;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);
            // 點擊發射台範圍：跳過此球
            if (distFromCenter < this.ballR * 2) {
                this.skipBall();
                return;
            }

            const angle = Math.atan2(dy, dx);
            this.launcherTargetAngle = angle;
            this.launcherRotateUntil = now + 200; // 0.2 秒旋轉
            this.lastFireTime = now;

            // 0.2 秒後發射
            setTimeout(() => {
                if (!this.isActive) return;
                this.fireBall(angle);
            }, 200);

            if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
        },

        // 跳過此球：扣少量分數，換下一顆
        skipBall: function () {
            const penalty = Math.max(5, Math.floor(this.getPointA() / 3));
            this.score = Math.max(0, this.score - penalty);
            document.getElementById('game29-score').textContent = this.score;
            this.pickNextChar();
            this.pickAfterNextChar();
            this.updateNextPreview();
            if (window.SoundManager && window.SoundManager.playFailure) window.SoundManager.playFailure();
        },

        // 發射字球
        fireBall: function (angle) {
            const speed = 8; // px/frame
            this.flyingBall = {
                x: this.centerX,
                y: this.centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                char: this.nextChar
            };
            if (window.SoundManager && window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
        },

        // ── RAF 主循環 ──
        startRAF: function () {
            this.stopRAF();
            this.lastTickTime = performance.now();
            const loop = (now) => {
                if (!this.isActive) return;
                const dt = Math.min(50, now - this.lastTickTime);
                this.lastTickTime = now;
                this.tick(dt);
                this.render();
                this.rafId = requestAnimationFrame(loop);
            };
            this.rafId = requestAnimationFrame(loop);
        },

        stopRAF: function () {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = null;
            }
        },

        // ── 每幀邏輯 ──
        tick: function (dt) {
            // 發射台平滑旋轉
            const angDiff = ((this.launcherTargetAngle - this.launcherAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            this.launcherAngle += angDiff * Math.min(1, dt / 100);

            // 連鎖暫停期間長龍不動
            if (this.chainPause > 0) {
                this.chainPause -= dt;
            } else {
                // 長龍整體推進
                for (let i = 0; i < this.dragon.length; i++) {
                    this.dragon[i].s += this.dragonSpeed * dt;
                }
                // 防止重疊（前後球距離不能 < 字球直徑）
                this.resolveDragonOverlap();
            }

            // 失敗：長龍頭 s 達總長
            if (this.dragon.length > 0) {
                const head = this.dragon[this.dragon.length - 1];
                if (head.s >= this.trackTotalLen) {
                    this.gameOver(false, '字龍抵達終點！');
                    return;
                }
                // 警示：頭部離終點 < 字球直徑 × 5
                this.warningActive = (this.trackTotalLen - head.s) < this.ballR * 10;
                const warningEl = document.getElementById('game29-warning-overlay');
                if (warningEl) {
                    if (this.warningActive) warningEl.classList.remove('hidden');
                    else warningEl.classList.add('hidden');
                }
            }

            // 飛行字球推進
            if (this.flyingBall) {
                const b = this.flyingBall;
                const steps = 4;
                for (let s = 0; s < steps; s++) {
                    b.x += b.vx / steps;
                    b.y += b.vy / steps;
                    // 飛出畫面範圍 → 銷毀
                    if (b.x < -40 || b.x > this.canvasWidth + 40 || b.y < -40 || b.y > this.canvasHeight + 40) {
                        this.flyingBall = null;
                        this.advanceQueue();
                        return;
                    }
                    // 與長龍碰撞
                    const hitIdx = this.checkFlyingHit(b);
                    if (hitIdx >= 0) {
                        this.insertIntoDragon(b, hitIdx);
                        this.flyingBall = null;
                        return;
                    }
                }
            }
        },

        // 防止長龍內球重疊
        resolveDragonOverlap: function () {
            const step = this.ballR * 2;
            // 從頭部往後推：頭部最先到達終點，後續球必須距前球 >= step
            // dragon 陣列順序：dragon[0] 是最尾（s 最小），dragon[len-1] 是最頭（s 最大）
            this.dragon.sort((a, b) => a.s - b.s);
            for (let i = this.dragon.length - 2; i >= 0; i--) {
                if (this.dragon[i + 1].s - this.dragon[i].s < step) {
                    this.dragon[i].s = this.dragon[i + 1].s - step;
                }
            }
        },

        // 飛行球碰撞偵測：回傳被命中字球的索引，否則 -1
        checkFlyingHit: function (b) {
            const minDist = this.ballR * 2 - 2;
            for (let i = 0; i < this.dragon.length; i++) {
                const pos = this.getTrackPos(this.dragon[i].s);
                const dx = pos.x - b.x;
                const dy = pos.y - b.y;
                if (dx * dx + dy * dy < minDist * minDist) return i;
            }
            return -1;
        },

        // 插入到長龍隊列（找到最近字球後判斷插入前/後）
        insertIntoDragon: function (b, hitIdx) {
            const hit = this.dragon[hitIdx];
            // 飛行球座標 vs 命中球座標：用「飛行球更接近 hitIdx-1 還是 hitIdx+1」判斷
            const hitPos = this.getTrackPos(hit.s);
            // 飛行球的「沿軌道弧長投影位置」
            const projS = this.projectToTrack(b.x, b.y);
            let insertS;
            const step = this.ballR * 2;
            if (projS < hit.s) {
                // 插在 hit 前方（s 較小一側）
                insertS = hit.s - step;
                // 將 hit 之前（s < hit.s）所有球往後推
                for (let i = 0; i < this.dragon.length; i++) {
                    if (this.dragon[i].s < hit.s && this.dragon[i].s > insertS - step) {
                        this.dragon[i].s -= step;
                    }
                }
            } else {
                // 插在 hit 後方（s 較大一側）── 即朝終點方向推進整段
                insertS = hit.s + step;
                for (let i = 0; i < this.dragon.length; i++) {
                    if (this.dragon[i].s > hit.s) {
                        this.dragon[i].s += step;
                    }
                }
            }
            this.dragon.push({ char: b.char, s: insertS });
            this.resolveDragonOverlap();

            if (window.SoundManager && window.SoundManager.playSuccessShort) window.SoundManager.playSuccessShort();

            // 觸發消除掃描（含連鎖）
            this.chainScanAfterMerge(b.char);

            // 換下一顆
            this.advanceQueue();
        },

        // 換下一顆 + 下下顆
        advanceQueue: function () {
            this.pickNextChar();
            this.pickAfterNextChar();
            this.updateNextPreview();
        },

        // 消除掃描（含連鎖）── 從整條龍中找 ≥3 顆同字相連，遞迴消除
        chainScanAfterMerge: function (lastChar) {
            const settings = this.difficultySettings[this.difficulty];
            let chainLevel = 0;
            const step = this.ballR * 2;

            while (true) {
                this.dragon.sort((a, b) => a.s - b.s);
                // 找連續同字段（前後球距離 < step + 2 視為相連）
                let runStart = 0;
                let bestRun = null;
                for (let i = 1; i <= this.dragon.length; i++) {
                    const prev = this.dragon[i - 1];
                    const cur = this.dragon[i];
                    const connected = cur && (cur.s - prev.s) <= step + 2 && cur.char === prev.char;
                    if (!connected) {
                        const runLen = i - runStart;
                        if (runLen >= 3) {
                            bestRun = { start: runStart, end: i };
                            break;
                        }
                        runStart = i;
                    }
                }
                if (!bestRun) break;

                const removed = this.dragon.slice(bestRun.start, bestRun.end);
                const removedChar = removed[0].char;
                // 在 splice 前收集被消除球的座標 + HUE，供粒子/字魂使用
                const removedHue = this.getHueForChar(removedChar);
                const removedPositions = removed.map(b => this.getTrackPos(b.s));
                this.dragon.splice(bestRun.start, bestRun.end - bestRun.start);
                chainLevel++;

                // 兩端自動靠攏：消除後，bestRun.start 之後所有球往前移動 (removed.length × step) 距離
                const moveAmount = removed.length * step;
                for (let i = bestRun.start; i < this.dragon.length; i++) {
                    this.dragon[i].s -= moveAmount;
                }
                this.resolveDragonOverlap();

                // 收集字 + FX（同色粒子噴灑 + 字魂飛入進度卡）
                this.collectChar(removedChar, 1);
                removedPositions.forEach(pos => {
                    this.spawnParticles(pos.x, pos.y, 6, removedHue);
                    if (this.isTargetChar(removedChar)) this.spawnSoul(pos.x, pos.y, removedChar);
                });
                this.score += this.getPointA() * removed.length * chainLevel;
                document.getElementById('game29-score').textContent = this.score;
                this.updateLineDisplay(true); // animateNewlyLit

                // 連鎖暫停 0.5 秒（依企劃 §D 矛盾三）
                this.chainPause = 500;

                if (window.SoundManager) {
                    if (chainLevel >= 3 && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
                    else if (window.SoundManager.playSuccess) window.SoundManager.playSuccess();
                }

                if (this.isLineComplete()) {
                    this.completeLine();
                    return;
                }
            }

            // 救援倒退：連鎖階數 ≥ threshold
            if (chainLevel >= settings.chainRescueThreshold) {
                this.rescueRetreat();
            }
        },

        // 救援倒退：長龍整體沿軌道倒退 5 格弧長
        rescueRetreat: function () {
            const retreat = this.ballR * 2 * 5;
            for (let i = 0; i < this.dragon.length; i++) {
                this.dragon[i].s = Math.max(0, this.dragon[i].s - retreat);
            }
            this.resolveDragonOverlap();
            if (window.SoundManager && window.SoundManager.playWarning) window.SoundManager.playWarning();
        },

        // 收集字
        collectChar: function (ch, times) {
            if (this.collectProgress[ch] !== undefined) {
                this.collectProgress[ch] = Math.min(this.collectTarget, this.collectProgress[ch] + times);
            }
        },

        isLineComplete: function () {
            for (const ch of this.currentLineChars) {
                if ((this.collectProgress[ch] || 0) < this.collectTarget) return false;
            }
            return true;
        },

        // 取分基數
        getPointA: function () {
            return (window.ScoreManager && window.ScoreManager.gameSettings && window.ScoreManager.gameSettings.game29)
                ? window.ScoreManager.gameSettings.game29.getPointA : 35;
        },

        // 進入下一句
        completeLine: function () {
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
            // 最後一句 → 走過關動畫（進度卡逐一發金光 → ScoreManager → MessageBox）
            if (this.currentLineIndex + 1 >= this.poemLines.length) {
                this.currentLineIndex++;
                this.playWinSequence();
                return;
            }
            this.currentLineIndex++;
            this.chainPause = 600;
            setTimeout(() => {
                if (this.isActive) this.startCurrentLine();
            }, 600);
        },

        // ── FX：canvas 內部固定 480×600 座標 → wrapper 本地未縮放座標 ──
        canvasToWrapperCoords: function (cx, cy) {
            const canvas = document.getElementById('game29-canvas');
            const wrapper = document.getElementById('game29-board-wrapper');
            if (!canvas || !wrapper) return { x: 0, y: 0 };
            const cRect = canvas.getBoundingClientRect();
            const wRect = wrapper.getBoundingClientRect();
            const scale = window.stageScale || 1;
            const cw = cRect.width / scale;
            const ch = cRect.height / scale;
            // canvas 內部固定 480×600（見 createDOM 中 <canvas width="480" height="600">）
            const ratioX = cw / 480;
            const ratioY = ch / 600;
            const offX = (cRect.left - wRect.left) / scale;
            const offY = (cRect.top - wRect.top) / scale;
            return { x: offX + cx * ratioX, y: offY + cy * ratioY };
        },
        // 同色系粒子（消除字球時噴灑）
        spawnParticles: function (cx, cy, count, hue) {
            const wrapper = document.getElementById('game29-board-wrapper');
            if (!wrapper) return;
            const c = this.canvasToWrapperCoords(cx, cy);
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game29-particle';
                const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
                const dist = 32 + Math.random() * 36;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist - 8;
                p.style.left = c.x + 'px';
                p.style.top = c.y + 'px';
                p.style.setProperty('--g29-dx', dx + 'px');
                p.style.setProperty('--g29-dy', dy + 'px');
                if (typeof hue === 'number') p.style.setProperty('--g29-ph', hue);
                const scl = 0.8 + Math.random() * 0.6;
                p.style.width = (8 * scl) + 'px';
                p.style.height = (8 * scl) + 'px';
                wrapper.appendChild(p);
                setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
            }
        },
        // 字魂：飛入頂端對應進度卡
        spawnSoul: function (cx, cy, ch) {
            const wrapper = document.getElementById('game29-board-wrapper');
            if (!wrapper) return;
            const start = this.canvasToWrapperCoords(cx, cy);
            const groupEl = document.querySelector(`#game29-progress .game29-char-group[data-char="${ch}"]`);
            let endX, endY;
            if (groupEl) {
                const gr = groupEl.getBoundingClientRect();
                const wr = wrapper.getBoundingClientRect();
                const scale = window.stageScale || 1;
                endX = ((gr.left - wr.left) + gr.width / 2) / scale;
                endY = ((gr.top - wr.top) + gr.height / 2) / scale;
            } else { endX = start.x; endY = -20; }
            const soul = document.createElement('div');
            soul.className = 'game29-soul';
            soul.textContent = ch;
            soul.style.left = start.x + 'px';
            soul.style.top = start.y + 'px';
            wrapper.appendChild(soul);
            requestAnimationFrame(() => {
                soul.style.opacity = '0.95';
                soul.style.transform = 'translate(-50%, -50%) scale(1.2)';
                soul.style.transition = 'top 0.2s ease-out, opacity 0.15s ease, transform 0.2s ease';
                soul.style.top = (start.y - 24) + 'px';
            });
            setTimeout(() => {
                soul.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, transform 0.4s ease';
                soul.style.left = endX + 'px';
                soul.style.top = endY + 'px';
                soul.style.transform = 'translate(-50%, -50%) scale(0.8)';
            }, 210);
            setTimeout(() => {
                soul.style.opacity = '0';
                if (groupEl) {
                    groupEl.style.transform = 'scale(1.25)';
                    groupEl.style.transition = 'transform 0.2s ease';
                    setTimeout(() => { groupEl.style.transform = ''; }, 220);
                }
            }, 720);
            setTimeout(() => { if (soul.parentNode) soul.parentNode.removeChild(soul); }, 900);
        },
        // 過關動畫
        playWinSequence: function () {
            const cards = Array.from(document.querySelectorAll('#game29-progress .game29-char-group'));
            const GAP = 180;
            cards.forEach((g, i) => setTimeout(() => g.classList.add('stage-flash'), i * GAP));
            const total = cards.length * GAP + 500;
            setTimeout(() => this.gameOver(true, ''), total);
        },

        // ── 渲染：canvas 2D 全繪（偽 3D） ──
        render: function () {
            const canvas = document.getElementById('game29-canvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

            // 背景：徑向漸層偽 3D 凹陷
            const bgGrad = ctx.createRadialGradient(this.centerX, this.centerY, 20, this.centerX, this.centerY, this.canvasWidth * 0.6);
            bgGrad.addColorStop(0, 'hsl(220, 35%, 18%)');
            bgGrad.addColorStop(1, 'hsl(220, 30%, 8%)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

            // 軌道繪製：以漸層色（藍→紅）表現流動方向
            this.drawTrack(ctx);

            // 終點紅標
            this.drawEndMarker(ctx);

            // 字球長龍
            this.drawDragon(ctx);

            // 飛行字球（含尾焰）
            if (this.flyingBall) {
                this.drawFlyingBall(ctx);
            }

            // 中心發射台（旋轉的水墨輪盤）
            this.drawLauncher(ctx);
        },

        drawTrack: function (ctx) {
            if (this.trackPoints.length === 0) return;
            // 外發光底層
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // 繪製寬軌道（漸層色）
            const segCount = 60;
            const step = Math.floor(this.trackPoints.length / segCount);
            for (let i = 0; i < segCount; i++) {
                const idx0 = i * step;
                const idx1 = Math.min(this.trackPoints.length - 1, (i + 1) * step);
                const u = i / segCount;
                // 藍 → 紅
                const hue = 210 - u * 210;
                const sat = 60;
                const light = 30 + u * 10;
                ctx.strokeStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
                ctx.lineWidth = this.ballR * 2 + 6;
                ctx.beginPath();
                ctx.moveTo(this.trackPoints[idx0].x, this.trackPoints[idx0].y);
                for (let j = idx0; j <= idx1; j += 3) {
                    ctx.lineTo(this.trackPoints[j].x, this.trackPoints[j].y);
                }
                ctx.stroke();
            }

            // 內側陰影（偽 3D 凹槽）
            ctx.strokeStyle = 'hsla(0, 0%, 0%, 0.35)';
            ctx.lineWidth = this.ballR * 2 + 2;
            ctx.beginPath();
            ctx.moveTo(this.trackPoints[0].x, this.trackPoints[0].y);
            for (let i = 4; i < this.trackPoints.length; i += 4) {
                ctx.lineTo(this.trackPoints[i].x, this.trackPoints[i].y);
            }
            ctx.stroke();

            // 高光（上方反射）
            ctx.strokeStyle = 'hsla(45, 100%, 80%, 0.15)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.trackPoints[0].x, this.trackPoints[0].y - this.ballR * 0.5);
            for (let i = 4; i < this.trackPoints.length; i += 4) {
                ctx.lineTo(this.trackPoints[i].x, this.trackPoints[i].y - this.ballR * 0.5);
            }
            ctx.stroke();
        },

        drawEndMarker: function (ctx) {
            const end = this.trackPoints[this.trackPoints.length - 1];
            if (!end) return;
            // 紅色閃爍漏斗
            const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 200);
            ctx.fillStyle = `hsla(0, 90%, 50%, ${pulse})`;
            ctx.beginPath();
            ctx.arc(end.x, end.y, this.ballR * 1.6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'hsl(0, 80%, 40%)';
            ctx.lineWidth = 2;
            ctx.stroke();
            // 文字標記
            ctx.fillStyle = 'hsl(45, 90%, 90%)';
            ctx.font = 'bold 14px "Noto Serif TC", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('終', end.x, end.y);
        },

        drawDragon: function (ctx) {
            // 由尾至頭繪製（頭在上層）
            for (let i = 0; i < this.dragon.length; i++) {
                const b = this.dragon[i];
                const pos = this.getTrackPos(b.s);
                // 同字必同色（HUE 依字在 currentLineChars 等分 360°）；目標字傳 isTarget=true 強化彩度
                const hue = this.getHueForChar(b.char);
                this.drawBall(ctx, pos.x, pos.y, b.char, hue, this.isTargetChar(b.char));
            }
        },

        // 繪製字球：以 char 決定 hue，target/decoy 不同彩度
        drawBall: function (ctx, x, y, ch, hue, isTarget) {
            const R = this.ballR;
            const target = (isTarget === undefined) ? this.isTargetChar(ch) : isTarget;
            const sat = target ? 60 : 12;
            const baseL = target ? 72 : 60;
            // 陰影（偽 3D）
            ctx.beginPath();
            ctx.arc(x + 2, y + 3, R, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(0, 0%, 0%, 0.35)';
            ctx.fill();
            // 球體漸層（中央亮 → 外圈以 char hue 深色收尾）
            const h = (hue !== undefined) ? hue : 45;
            const grad = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.2, x, y, R);
            grad.addColorStop(0, `hsl(${h}, ${sat}%, ${Math.min(98, baseL + 22)}%)`);
            grad.addColorStop(0.55, `hsl(${h}, ${sat}%, ${baseL}%)`);
            grad.addColorStop(1, `hsl(${h}, ${sat}%, ${Math.max(20, baseL - 25)}%)`);
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = `hsla(${h}, ${Math.max(40, sat)}%, 22%, 0.85)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // 高光
            ctx.beginPath();
            ctx.arc(x - R * 0.35, y - R * 0.35, R * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.55)';
            ctx.fill();
            // 字（中文基線視覺修正：y 微下偏 0.04R）
            ctx.fillStyle = target ? 'hsl(220, 30%, 14%)' : 'hsl(220, 18%, 28%)';
            ctx.font = `900 ${Math.floor(R * 1.1)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ch || '', x, y + R * 0.04);
        },

        drawFlyingBall: function (ctx) {
            const b = this.flyingBall;
            const flyHue = this.getHueForChar(b.char);
            // 尾焰（同色系）
            const tailLen = 5;
            for (let i = tailLen; i >= 1; i--) {
                const ratio = i / tailLen;
                const tx = b.x - b.vx * i * 0.8;
                const ty = b.y - b.vy * i * 0.8;
                ctx.beginPath();
                ctx.arc(tx, ty, this.ballR * (1 - ratio * 0.7), 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${flyHue}, 90%, 75%, ${0.5 * (1 - ratio)})`;
                ctx.fill();
            }
            this.drawBall(ctx, b.x, b.y, b.char, flyHue, this.isTargetChar(b.char));
        },

        drawLauncher: function (ctx) {
            const cx = this.centerX;
            const cy = this.centerY;
            const R = this.ballR * 1.8;
            // 底座（水墨輪盤）
            const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R);
            grad.addColorStop(0, 'hsl(45, 60%, 70%)');
            grad.addColorStop(0.7, 'hsl(45, 50%, 50%)');
            grad.addColorStop(1, 'hsl(35, 60%, 25%)');
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = 'hsl(35, 70%, 20%)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // 旋轉刻紋
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(this.launcherAngle);
            ctx.strokeStyle = 'hsla(35, 80%, 15%, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(R, 0);
            ctx.stroke();
            // 砲口
            ctx.fillStyle = 'hsl(0, 60%, 45%)';
            ctx.beginPath();
            ctx.arc(R * 0.95, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // 中心待發射的字球（HUE 同 char）
            const nextHue = this.getHueForChar(this.nextChar);
            this.drawBall(ctx, cx, cy, this.nextChar, nextHue, this.isTargetChar(this.nextChar));
        },

        // ── 計時器 ──
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game29-timer-path');
            const wrapper = document.getElementById('game29-board-wrapper');
            const svg = document.getElementById('game29-timer-ring');
            if (!rect || !wrapper || !svg) return;
            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rb = wrapper.getBoundingClientRect();
                w = rb.width; h = rb.height;
            }
            if (w === 0) return;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';
            rect.setAttribute('width', w - 6);
            rect.setAttribute('height', h - 6);
            const perimeter = (w - 6 + h - 6) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const el = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * el)}%, ${Math.round(22 + 32 * el)}%)`;
            }
        },

        // ── 遊戲結束 ──
        gameOver: function (win, reason) {
            if (!this.isActive) return;
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);
            this.stopRAF();

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 29,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game29-retryGame-btn').disabled = true;
                document.getElementById('game29-newGame-btn').disabled = true;
            } else {
                document.getElementById('game29-retryGame-btn').disabled = false;
                document.getElementById('game29-newGame-btn').disabled = false;
            }

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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '字龍抵達終點！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game29', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game29', this.currentLevelIndex, () => showMessage(finalScore));
                    } else {
                        showMessage(finalScore);
                    }
                } else {
                    showMessage(finalScore);
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game29',
                    timerContainerId: 'game29-board-wrapper',
                    scoreElementId: 'game29-score',
                    heartsSelector: '.game29-no-hearts',  // 本作無紅心 — 永不命中但語法合法，避免 querySelectorAll('') 拋例外
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        checkAchievementsAndShow(finalScore);
                    }
                });
            } else {
                checkAchievementsAndShow();
            }
        }
    };

    window.Game29 = Game29;

    // ?game=29 自動啟動（支援挑戰關卡直連）
    if (new URLSearchParams(window.location.search).get('game') === '29') {
        setTimeout(() => {
            if (window.Game29) window.Game29.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
