// ============================================================
// game16.js — 打地詩 (Whac-A-Verse)
// 改編自打地鼠（Whac-A-Mole），以詩詞字序為遊戲核心
// ============================================================

(function () {
    const Game16 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // 詩詞狀態
        currentPoem: null,
        poemLines: [],
        fullPoemText: '',  // 去除標點後所有字的合併字串
        targetIndex: 0,    // 當前要擊打的字在 fullPoemText 的索引

        // 心跳計時器（scoreManager 讀取 this.timer / this.maxTimer）
        timer: 0,
        maxTimer: 0,
        timerInterval: null,

        // 連擊
        comboCount: 0,
        comboMultiplier: 1,

        // 生命
        hearts: 6,

        // 漏失計數（連續漏失同一個字）
        consecutiveMiss: 0,

        // 地洞資料陣列：{ el, pitEl, bubbleEl, state, char, timeout }
        holes: [],
        cols: 3,
        rows: 3,

        // 計時器 ID
        targetTimeout: null,    // 目標字超時計時器
        nextTargetTimer: null,  // 下一個字的排程計時器
        frenzyTimeout: null,    // 混亂期觸發計時器

        isFrenzy: false,
        cycleId: 0,           // 用於取消上一批延遲字的 setTimeout

        // -------------------------------------------------------------------
        // 難度設定
        // cols×rows：地洞佈局
        // minStayDuration：目標字停留毫秒
        // maxStayDuration：目標字停留毫秒
        // minDecoys/maxDecoys：同時出現的混淆字數量
        // maxMissPerTarget：連續漏失幾次才扣血（99=不扣）
        // maxHearts：生命值
        // hintMode：提示模式 'full'|'sentence-first'|'none'
        // frenzyInterval：混亂期觸發間隔（毫秒）
        // frenzyDecoys：混亂期額外噴出的混淆字數
        // timeLimit：限時（秒）
        // -------------------------------------------------------------------
        difficultySettings: {
            '小學': { cols: 3, rows: 3, minStayDuration: 2000, maxStayDuration: 3500, minDecoys: 1, maxDecoys: 2, maxMissPerTarget: 99, maxHearts: 6, hintMode: 'full', frenzyInterval: 30000, frenzyDecoys: 3, timeLimit: 90, poemMinRating: 6, minLines: 2, maxLines: 4, maxChars: 36 },
            '中學': { cols: 4, rows: 3, minStayDuration: 1500, maxStayDuration: 2500, minDecoys: 2, maxDecoys: 3, maxMissPerTarget: 3, maxHearts: 5, hintMode: 'sentence-first', frenzyInterval: 25000, frenzyDecoys: 4, timeLimit: 80, poemMinRating: 5, minLines: 2, maxLines: 4, maxChars: 40 },
            '高中': { cols: 4, rows: 4, minStayDuration: 800, maxStayDuration: 1800, minDecoys: 3, maxDecoys: 5, maxMissPerTarget: 2, maxHearts: 4, hintMode: 'sentence-first', frenzyInterval: 20000, frenzyDecoys: 6, timeLimit: 70, poemMinRating: 4, minLines: 4, maxLines: 8, maxChars: 56 },
            '大學': { cols: 5, rows: 4, minStayDuration: 500, maxStayDuration: 1200, minDecoys: 5, maxDecoys: 8, maxMissPerTarget: 1, maxHearts: 3, hintMode: 'none', frenzyInterval: 15000, frenzyDecoys: 8, timeLimit: 60, poemMinRating: 3, minLines: 4, maxLines: 8, maxChars: 56 },
            '研究所': { cols: 5, rows: 5, minStayDuration: 300, maxStayDuration: 900, minDecoys: 8, maxDecoys: 12, maxMissPerTarget: 0, maxHearts: 3, hintMode: 'none', frenzyInterval: 10000, frenzyDecoys: 12, timeLimit: 60, poemMinRating: 3, minLines: 4, maxLines: 8, maxChars: 56 }
        },

        // ── 載入 CSS ────────────────────────────────────────────
        loadCSS: function () {
            if (!document.getElementById('game16-css')) {
                const link = document.createElement('link');
                link.id = 'game16-css';
                link.rel = 'stylesheet';
                link.href = 'game16.css';
                document.head.appendChild(link);
            }
        },

        // ── 初始化 ──────────────────────────────────────────────
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game16-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game16-container');
        },

        // ── 建立 DOM ─────────────────────────────────────────────
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game16-container';
            div.className = 'game16-overlay hidden';
            div.innerHTML = `
                <div class="game16-header">
                    <div class="game16-score-board">分數:&nbsp;<span id="game16-score">0</span></div>
                    <div class="game16-controls">
                        <button class="game16-difficulty-tag" id="game16-diff-tag">小學</button>
                        <button id="game16-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game16-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game16-sub-header">
                    <div class="game16-combo-row">
                        <div id="game16-hearts" class="hearts"></div>
                        <div class="game16-combo-wrap">連擊&nbsp;<span id="game16-combo">×1</span></div>
                    </div>
                </div>
                <div class="game16-poem-bar">
                    <div id="game16-poem-info" class="game16-poem-info"></div>
                    <div class="game16-progress-row">
                        <div class="game16-progress-track">
                            <div id="game16-progress-fill" class="game16-progress-fill"></div>
                        </div>
                        <span id="game16-progress-text">0/0</span>
                    </div>
                </div>
                <div id="game16-hint-bar" class="game16-hint-bar"></div>
                <div id="game16-area" class="game16-area">
                    <div id="game16-holes-grid" class="game16-holes-grid"></div>
                </div>
                <div class="game16-timer-wrap">
                    <div class="game16-timer-track">
                        <div id="game16-timer-bar"></div>
                    </div>
                    <span id="game16-timer-label">60s</span>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放座標（跟隨 stage）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }

            document.getElementById('game16-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game16-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game16-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // ── 顯示遊戲 ─────────────────────────────────────────────
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // ── 難度選擇 ─────────────────────────────────────────────
        showDifficultySelector: function () {
            this.isActive = false;
            this.clearAllTimers();
            if (window.GameMessage) window.GameMessage.hide();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('打地詩', (selectedLevel, levelIndex) => {
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

        // ── 更新難度標籤與按鈕顯示 ──────────────────────────────
        updateUIForMode: function () {
            const tag = document.getElementById('game16-diff-tag');
            const newBtn = document.getElementById('game16-newGame-btn');
            const retryBtn = document.getElementById('game16-retryGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#e2b800' };

            if (this.isLevelMode) {
                if (tag) {
                    tag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                    tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    tag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                    tag.dataset.level = this.difficulty;
                }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (tag) {
                    tag.textContent = this.difficulty;
                    tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    tag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                    tag.dataset.level = this.difficulty;
                }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        // ── 停止遊戲（menu.js 全域清理用）──────────────────────
        stopGame: function () {
            this.isActive = false;
            this.clearAllTimers();
            // ⚠️ 必須在此隱藏：menu.js 全域清理只呼叫 stopGame()，不呼叫 hide()
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        // ── 清除所有計時器 ───────────────────────────────────────
        clearAllTimers: function () {
            clearInterval(this.timerInterval);
            clearTimeout(this.targetTimeout);
            clearTimeout(this.nextTargetTimer);
            clearTimeout(this.frenzyTimeout);
            this.holes.forEach(h => { if (h.timeout) { clearTimeout(h.timeout); h.timeout = null; } });
            this.timerInterval = null;
            this.targetTimeout = null;
            this.nextTargetTimer = null;
            this.frenzyTimeout = null;
        },

        // ── 重來（同一首詩再玩一次）──────────────────────────────
        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        // ── 開新局 ──────────────────────────────────────────────
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗，請重試。');
                this.stopGame();
            }
        },

        // ── 啟動遊戲流程 ─────────────────────────────────────────
        startGameProcess: function (isRetry) {
            const settings = this.difficultySettings[this.difficulty];

            this.isActive = true;
            this.score = 0;
            this.comboCount = 0;
            this.comboMultiplier = 1;
            this.targetIndex = 0;
            this.consecutiveMiss = 0;
            this.isFrenzy = false;
            this.cycleId = 0;
            this.cols = settings.cols;
            this.rows = settings.rows;
            this.hearts = settings.maxHearts;

            this.clearAllTimers();

            document.getElementById('game16-score').textContent = '0';
            document.getElementById('game16-combo').textContent = '×1';
            document.getElementById('game16-combo').className = '';
            document.getElementById('game16-retryGame-btn').disabled = false;
            document.getElementById('game16-newGame-btn').disabled = false;
            if (window.GameMessage) window.GameMessage.hide();

            this.updateUIForMode();
            this.renderHearts();
            this.buildHoles();
            this.updateHint();
            this.updateProgress();
            this.updateTimerBar(1);

            // 計時器初始化（scoreManager 讀取 this.timer / this.maxTimer）
            this.timer = settings.timeLimit;
            this.maxTimer = settings.timeLimit;
            this.startTimer();

            // 排程第一次混亂期
            this.frenzyTimeout = setTimeout(() => this.startFrenzy(), settings.frenzyInterval);

            // 短暫延遲後彈出第一個目標字
            this.nextTargetTimer = setTimeout(() => {
                if (this.isActive) this.scheduleNextTarget();
            }, 600);
        },

        // ── 隨機選詩 ─────────────────────────────────────────────
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要先載入 script.js');
                return false;
            }
            const s = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(
                s.poemMinRating, s.minLines, s.maxLines, 8, s.maxChars,
                '', this.isLevelMode ? this.currentLevelIndex : null, 'game16'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.fullPoemText = this.poemLines.join('');

            let title = this.currentPoem.title;
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const infoEl = document.getElementById('game16-poem-info');
            infoEl.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            infoEl.dataset.poemId = this.currentPoem.id;
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // ── 建立地洞 DOM ─────────────────────────────────────────
        buildHoles: function () {
            const grid = document.getElementById('game16-holes-grid');
            grid.innerHTML = '';
            this.holes = [];

            // 動態計算洞口尺寸（提示欄始終顯示，固定佔 32px）
            const areaH = 850 - 44 - 44 - 52 - 32 - 28 - 8; // 8px for area padding
            const cellW = Math.floor(480 / this.cols); // 480 = 500 - padding
            const cellH = Math.floor(areaH / this.rows);
            const minCell = Math.min(cellW, cellH);
            const pitSize = Math.round(minCell * 0.58);
            const bubbleSize = Math.round(minCell * 0.48);
            const fontSize = Math.round(minCell * 0.25);

            // 透過 CSS 變數傳遞尺寸
            grid.style.setProperty('--pit-size', pitSize + 'px');
            grid.style.setProperty('--bubble-size', bubbleSize + 'px');
            grid.style.setProperty('--char-font-size', fontSize + 'px');
            grid.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
            grid.style.gridTemplateRows = `repeat(${this.rows}, 1fr)`;

            for (let i = 0; i < this.cols * this.rows; i++) {
                const holeEl = document.createElement('div');
                holeEl.className = 'game16-hole';

                const pitEl = document.createElement('div');
                pitEl.className = 'game16-hole-pit';

                const bubbleEl = document.createElement('div');
                bubbleEl.className = 'game16-char-bubble';

                holeEl.appendChild(pitEl);
                holeEl.appendChild(bubbleEl);
                grid.appendChild(holeEl);

                const holeData = { el: holeEl, pitEl, bubbleEl, state: 'idle', char: '', timeout: null };
                this.holes.push(holeData);

                // pointerdown 立即響應，手機觸控優先
                holeEl.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    this.onHoleClick(i);
                });
            }
        },

        // ── 更新提示欄（顯示已擊完的詩句）───────────────────────
        // 無論 hintMode 為何，欄位始終顯示；遊戲開始時為空，
        // 每完成一整句詩後才會累積顯示。
        updateHint: function () {
            const bar = document.getElementById('game16-hint-bar');
            if (!bar) return;
            bar.style.display = '';
            if (!this.currentPoem || !this.poemLines.length) {
                bar.textContent = '';
                return;
            }
            // 累積已完成的句子：targetIndex 已超過整句尾端才算完成
            let completedText = '';
            let charCount = 0;
            for (let l = 0; l < this.poemLines.length; l++) {
                const lineEnd = charCount + this.poemLines[l].length;
                if (this.targetIndex >= lineEnd) {
                    completedText += (completedText ? '　' : '') + this.poemLines[l];
                } else {
                    break;
                }
                charCount = lineEnd;
            }
            bar.textContent = completedText;
        },

        // ── 判斷目標字是否為某句詩的第一個字 ───────────────────
        isFirstOfSentence: function (targetIdx) {
            let count = 0;
            for (let l = 0; l < this.poemLines.length; l++) {
                if (count === targetIdx) return true;
                count += this.poemLines[l].length;
                if (count > targetIdx) return false;
            }
            return false;
        },

        // ── 更新進度條 ───────────────────────────────────────────
        updateProgress: function () {
            const total = this.fullPoemText.length;
            const done = this.targetIndex;
            const fill = document.getElementById('game16-progress-fill');
            const text = document.getElementById('game16-progress-text');
            if (fill) fill.style.width = (total > 0 ? done / total * 100 : 0) + '%';
            if (text) text.textContent = `${done}/${total}`;
        },

        // ── 更新計時條 ───────────────────────────────────────────
        updateTimerBar: function (ratio) {
            const bar = document.getElementById('game16-timer-bar');
            const label = document.getElementById('game16-timer-label');
            if (!bar) return;
            bar.style.width = (ratio * 100) + '%';

            // 顏色：充裕→金→橙→朱紅
            if (ratio > 0.33) {
                bar.style.backgroundColor = 'hsl(38, 80%, 44%)';
                bar.classList.remove('game16-timer-urgent');
            } else if (ratio > 0.15) {
                bar.style.backgroundColor = 'hsl(28, 90%, 50%)';
                bar.classList.remove('game16-timer-urgent');
            } else {
                bar.classList.add('game16-timer-urgent');
            }

            if (label) label.textContent = Math.ceil(this.timer) + 's';
        },

        // ── 啟動計時器 ───────────────────────────────────────────
        startTimer: function () {
            const step = 100;
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
                this.timer -= step / 1000;
                if (this.timer <= 0) {
                    this.timer = 0;
                    this.updateTimerBar(0);
                    clearInterval(this.timerInterval);
                    this.gameOver(false, 'timeout');
                } else {
                    this.updateTimerBar(this.timer / this.maxTimer);
                }
            }, step);
        },

        // ── 渲染生命值 ───────────────────────────────────────────
        renderHearts: function () {
            const el = document.getElementById('game16-hearts');
            if (!el) return;
            el.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxHearts;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = i < this.hearts ? 'heart' : 'heart empty';
                span.textContent = i < this.hearts ? '♥' : '♡';
                el.appendChild(span);
            }
        },

        // ── 排程下一個目標字（A–G 週期批次邏輯）────────────────────
        scheduleNextTarget: function () {
            if (!this.isActive) return;
            if (this.targetIndex >= this.fullPoemText.length) {
                this.gameOver(true, 'complete');
                return;
            }

            const settings = this.difficultySettings[this.difficulty];
            const targetChar = this.fullPoemText[this.targetIndex];

            // A. 取得空閒洞口索引
            const idle = this.holes.reduce((acc, h, i) => { if (h.state === 'idle') acc.push(i); return acc; }, []);

            if (idle.length === 0) {
                // 全部洞口被佔用，稍後重試
                this.nextTargetTimer = setTimeout(() => this.scheduleNextTarget(), 250);
                return;
            }

            // B. 決定混淆字數量並生成混淆字
            const decoyCount = Math.min(
                settings.minDecoys + Math.floor(Math.random() * (settings.maxDecoys - settings.minDecoys + 1)),
                idle.length - 1  // 至少保留一個洞給正確字
            );
            let decoyChars = [];
            if (window.SharedDecoy && decoyCount > 0) {
                decoyChars = window.SharedDecoy.getDecoyChars(
                    this.fullPoemText.split(''),
                    decoyCount,
                    [targetChar],
                    settings.poemMinRating
                );
            }
            while (decoyChars.length < decoyCount) decoyChars.push('虛');

            // C. 正確字加入混淆字，打亂顯示順序，分配各洞口位置
            const allItems = [
                { char: targetChar, isTarget: true },
                ...decoyChars.map(c => ({ char: c, isTarget: false }))
            ];
            // Fisher-Yates 洗牌：確保正確字的洞口位置無規律
            for (let i = allItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
            }
            // 從空閒洞口隨機取對應數量
            const shuffledIdle = [...idle].sort(() => Math.random() - 0.5);
            const assignedHoles = shuffledIdle.slice(0, allItems.length);

            // 更新週期 ID：防止上一批延遲的字在新週期中誤入畫面
            this.cycleId++;
            const thisCycleId = this.cycleId;

            // D + E. 每個字各自決定停留時間（min~max 隨機值）與出現延遲（0–500ms）
            assignedHoles.forEach((hIdx, i) => {
                const item = allItems[i];
                const delay = Math.floor(Math.random() * 500);
                const stayDuration = settings.minStayDuration +
                    Math.random() * (settings.maxStayDuration - settings.minStayDuration);

                setTimeout(() => {
                    // 確認仍在同一週期且遊戲仍在進行
                    if (!this.isActive || this.cycleId !== thisCycleId) return;
                    if (this.holes[hIdx] && this.holes[hIdx].state === 'idle') {
                        this.activateHole(hIdx, item.char, item.isTarget ? 'target' : 'decoy', stayDuration);
                    }
                }, delay);
            });

            // F. 週期計時器 = maxStayDuration + 500ms
            // 若正確字在此週期內未被擊中 → 漏失，G. 重複進入下一輪 A–F
            const cycleDuration = settings.maxStayDuration + 500;
            this.targetTimeout = setTimeout(() => {
                if (!this.isActive) return;
                // 清除本批次中仍存在的所有字
                this.holes.forEach((h, i) => {
                    if (h.state !== 'idle') this.deactivateHole(i, 'sink');
                });
                this.handleCycleMiss();
            }, cycleDuration);
        },

        // ── 激活洞口（字從洞底升起）─────────────────────────────
        // stayDuration：此字的停留時間（ms），到期後自動縮回；正確字與混淆字皆適用
        activateHole: function (idx, char, type, stayDuration) {
            const hole = this.holes[idx];
            if (!hole || hole.state !== 'idle') return;

            hole.char = char;
            hole.state = type;
            hole.bubbleEl.textContent = char;

            // 依 hintMode 決定泡泡視覺樣式
            // 'full'：正確字→黃色，混淆字→白底黑字
            // 'sentence-first'：正確字且為句首→黃色，其餘→白底黑字
            // 'none'：全部→白底黑字
            let visualClass = 'game16-char-neutral';
            if (type === 'target') {
                const mode = this.difficultySettings[this.difficulty].hintMode;
                if (mode === 'full' ||
                    (mode === 'sentence-first' && this.isFirstOfSentence(this.targetIndex))) {
                    visualClass = 'game16-char-target';
                }
            }

            // 先清除舊動畫類，再設定新的，確保 animation 重新觸發
            hole.bubbleEl.className = 'game16-char-bubble';
            void hole.bubbleEl.offsetWidth; // 強制 reflow
            hole.bubbleEl.className = `game16-char-bubble ${visualClass} game16-rise`;

            // 所有字（正確字與混淆字）都有各自的停留時間，到期後自動縮回
            if (stayDuration) {
                hole.timeout = setTimeout(() => {
                    if (hole.state === type) this.deactivateHole(idx, 'sink');
                }, stayDuration);
            }
        },

        // ── 停用洞口（字縮回）───────────────────────────────────
        deactivateHole: function (idx, animClass) {
            const hole = this.holes[idx];
            if (!hole) return;
            if (hole.timeout) { clearTimeout(hole.timeout); hole.timeout = null; }

            hole.state = 'idle';
            hole.char = '';

            void hole.bubbleEl.offsetWidth;
            hole.bubbleEl.className = `game16-char-bubble game16-${animClass || 'sink'}`;

            // 動畫結束後清空泡泡
            setTimeout(() => {
                if (hole.bubbleEl) {
                    hole.bubbleEl.className = 'game16-char-bubble';
                    hole.bubbleEl.textContent = '';
                }
            }, 320);
        },

        // ── 點擊洞口 ─────────────────────────────────────────────
        onHoleClick: function (idx) {
            if (!this.isActive) return;
            const hole = this.holes[idx];
            if (!hole) return;

            if (hole.state === 'idle') {
                // 點擊空洞：中斷連擊但不扣血
                this.breakCombo();
            } else if (hole.state === 'target') {
                this.hitCorrect(idx);
            } else if (hole.state === 'decoy') {
                this.hitWrong(idx);
            }
        },

        // ── 擊中正確字 ───────────────────────────────────────────
        hitCorrect: function (idx) {
            if (window.SoundManager) {
                this.comboCount >= 4
                    ? window.SoundManager.playJoyfulTriple()
                    : window.SoundManager.playSuccessShort();
            }

            // 取消週期計時器
            clearTimeout(this.targetTimeout);
            this.targetTimeout = null;
            // 遞增 cycleId：使本批尚在延遲中的字不再出現
            this.cycleId++;

            // 播放擊中動畫
            const hole = this.holes[idx];
            hole.state = 'idle'; // 立即標為空閒，防止重複點擊
            if (hole.timeout) { clearTimeout(hole.timeout); hole.timeout = null; } // 清除此洞的停留計時器
            void hole.bubbleEl.offsetWidth;
            hole.bubbleEl.className = 'game16-char-bubble game16-char-target game16-hit';
            setTimeout(() => {
                if (hole.bubbleEl) { hole.bubbleEl.className = 'game16-char-bubble'; hole.bubbleEl.textContent = ''; }
            }, 420);

            // 清除所有混淆字
            this.holes.forEach((h, i) => {
                if (i !== idx && h.state === 'decoy') this.deactivateHole(i, 'sink');
            });

            // 更新連擊與分數
            this.comboCount++;
            this.consecutiveMiss = 0;
            this.updateCombo();

            const pts = this.getPointA() * this.comboMultiplier;
            this.score += pts;
            document.getElementById('game16-score').textContent = Math.floor(this.score);
            this.showFloatingScore(idx, '+' + pts);

            this.targetIndex++;
            this.updateProgress();
            this.updateHint();

            // 勝利判斷
            if (this.targetIndex >= this.fullPoemText.length) {
                setTimeout(() => this.gameOver(true, 'complete'), 400);
                return;
            }

            // 排程下一個目標字
            this.nextTargetTimer = setTimeout(() => this.scheduleNextTarget(), 180);
        },

        // ── 擊中混淆字 ───────────────────────────────────────────
        hitWrong: function (idx) {
            if (window.SoundManager) window.SoundManager.playFailure();

            const hole = this.holes[idx];
            hole.bubbleEl.classList.add('game16-wrong-flash');
            hole.el.classList.add('game16-shake');
            setTimeout(() => {
                hole.el.classList.remove('game16-shake');
                this.deactivateHole(idx, 'sink');
            }, 450);

            this.hearts--;
            this.breakCombo();
            this.renderHearts();

            if (this.hearts <= 0) {
                setTimeout(() => this.gameOver(false, 'heartless'), 600);
            }
        },

        // ── 週期結束漏失處理（由週期計時器 targetTimeout 呼叫）────
        // 注意：漏失不斷連擊，只有打錯混淆字才斷連擊
        handleCycleMiss: function () {
            this.consecutiveMiss++;
            const settings = this.difficultySettings[this.difficulty];

            // 連續漏失超過容忍上限 → 扣血
            if (settings.maxMissPerTarget < 99 && this.consecutiveMiss > settings.maxMissPerTarget) {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.hearts--;
                this.renderHearts();
                this.consecutiveMiss = 0;

                if (this.hearts <= 0) {
                    setTimeout(() => this.gameOver(false, 'heartless'), 400);
                    return;
                }
            }

            // G. 重複進入下一個 A–F 週期
            this.nextTargetTimer = setTimeout(() => this.scheduleNextTarget(), 350);
        },

        // ── 更新連擊倍率顯示 ─────────────────────────────────────
        updateCombo: function () {
            if (this.comboCount >= 5) this.comboMultiplier = 5;
            else if (this.comboCount >= 3) this.comboMultiplier = 3;
            else if (this.comboCount >= 2) this.comboMultiplier = 2;
            else this.comboMultiplier = 1;

            const el = document.getElementById('game16-combo');
            if (el) {
                el.textContent = '×' + this.comboMultiplier;
                el.className = this.comboCount >= 5 ? 'game16-combo-max' : '';
            }
        },

        // ── 中斷連擊 ─────────────────────────────────────────────
        breakCombo: function () {
            this.comboCount = 0;
            this.comboMultiplier = 1;
            this.updateCombo();
        },

        // ── 取得每次正確擊打的基礎分 ─────────────────────────────
        getPointA: function () {
            const s = window.ScoreManager && window.ScoreManager.gameSettings['game16'];
            return s ? (s.getPointA || 15) : 15;
        },

        // ── 浮動得分特效 ─────────────────────────────────────────
        showFloatingScore: function (idx, text) {
            const hole = this.holes[idx];
            if (!hole) return;
            const el = document.createElement('div');
            el.className = 'game16-float-score';
            el.textContent = text;
            hole.el.appendChild(el);
            setTimeout(() => el.remove(), 950);
        },

        // ── 混亂期（地詩混亂期）─────────────────────────────────
        startFrenzy: function () {
            if (!this.isActive) return;
            this.isFrenzy = true;
            const settings = this.difficultySettings[this.difficulty];
            const grid = document.getElementById('game16-holes-grid');
            if (grid) grid.classList.add('game16-frenzy');

            // 取得空閒洞口，批次噴出額外混淆字
            const idle = this.holes.reduce((acc, h, i) => { if (h.state === 'idle') acc.push(i); return acc; }, []);
            let decoys = [];
            if (window.SharedDecoy && idle.length > 0) {
                decoys = window.SharedDecoy.getDecoyChars(
                    this.fullPoemText.split(''),
                    Math.min(settings.frenzyDecoys, idle.length),
                    [],
                    settings.poemMinRating
                );
            }

            // 以 100~500ms 的隨機間隔錯開彈出，製造「字如雨下」
            idle.slice(0, settings.frenzyDecoys).forEach((hIdx, i) => {
                setTimeout(() => {
                    if (this.isActive && this.holes[hIdx] && this.holes[hIdx].state === 'idle') {
                        this.activateHole(hIdx, decoys[i] || '虛', 'decoy');
                    }
                }, 100 + Math.random() * 400);
            });

            // 混亂期持續 5~8 秒後進入靜洞緩衝
            const duration = 5000 + Math.random() * 3000;
            setTimeout(() => {
                if (!this.isActive) return;
                this.isFrenzy = false;
                if (grid) grid.classList.remove('game16-frenzy');

                // 0.5 秒靜洞緩衝：清除所有混淆字
                this.holes.forEach((h, i) => {
                    if (h.state === 'decoy') this.deactivateHole(i, 'sink');
                });

                // 排程下一次混亂期
                this.frenzyTimeout = setTimeout(() => this.startFrenzy(), settings.frenzyInterval);
            }, duration);
        },

        // ── 遊戲結束 ─────────────────────────────────────────────
        gameOver: function (win, reason) {
            if (!this.isActive) return;
            this.isActive = false;
            this.clearAllTimers();

            // 清除所有洞口
            this.holes.forEach((h, i) => { if (h.state !== 'idle') this.deactivateHole(i, 'sink'); });
            const grid = document.getElementById('game16-holes-grid');
            if (grid) grid.classList.remove('game16-frenzy');

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
                        isWin: win,
                        score: win ? (finalScore || Math.floor(this.score)) : 0,
                        reason: win ? '' : (reason === 'timeout' ? '時間到！' : '詩沒擊完！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm
                    });
                }
            };

            const showAfterAch = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game16', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game16', this.currentLevelIndex, () => showMsg(finalScore));
                        return;
                    }
                }
                showMsg(finalScore);
            };

            if (win) {
                document.getElementById('game16-retryGame-btn').disabled = true;
                document.getElementById('game16-newGame-btn').disabled = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();

                if (window.ScoreManager) {
                    window.ScoreManager.playWinAnimation({
                        game: this,
                        difficulty: this.difficulty,
                        gameKey: 'game16',
                        timerContainerId: 'game16-area',
                        scoreElementId: 'game16-score',
                        heartsSelector: '#game16-hearts .heart:not(.empty)',
                        onComplete: (finalScore) => {
                            this.score = finalScore;
                            showAfterAch(finalScore);
                        }
                    });
                } else {
                    showAfterAch(Math.floor(this.score));
                }
            } else {
                document.getElementById('game16-retryGame-btn').disabled = false;
                document.getElementById('game16-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
                showAfterAch(0);
            }
        }
    };

    window.Game16 = Game16;

    // URL 自動啟動（?game=16）
    document.addEventListener('DOMContentLoaded', () => {
        if (new URLSearchParams(window.location.search).get('game') === '16') {
            setTimeout(() => {
                if (window.Game16) window.Game16.show();
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 50);
        }
    });
})();
