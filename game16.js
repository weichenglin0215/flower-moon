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

        // 失誤字索引集合：擊中混淆字 / 連續漏失超限時記錄，該位置字不再出現，hint-bar 紅色標示
        errorIndices: null,

        // 地洞資料陣列：{ el, pitEl, bubbleEl, state, char, timeout }
        holes: [],
        cols: 3,
        rows: 3,

        // 計時器 ID
        targetTimeout: null,    // 目標字超時計時器
        nextTargetTimer: null,  // 下一個字的排程計時器
        frenzyTimeout: null,    // 混亂期觸發計時器

        isFrenzy: false,
        cycleId: 0,              // 用於取消上一批延遲字的 setTimeout
        currentBatchRemaining: 0, // 本批次尚未被擊中的正確字數（含 target + target-preview）

        // -------------------------------------------------------------------
        // 難度設定
        // cols×rows：地洞佈局
        // minStayDuration：目標字停留毫秒
        // maxStayDuration：目標字停留毫秒
        // minDecoys/maxDecoys：同時出現的混淆字數量
        // maxMissPerTarget：連續漏失幾次才扣血（99=不扣），全改成0，因為與原版遊戲規格不符。
        // maxHearts：生命值
        // hintMode：提示模式 'full'|'sentence-first'|'none'
        // frenzyInterval：混亂期觸發間隔（毫秒），全改成9999999，取消混亂期。
        // frenzyDecoys：混亂期額外噴出的混淆字數
        // poemMinRating:詩詞最低評分
        // minLines/maxLines:詩詞行數範圍
        // maxChars:詩詞最大字數
        // maxTargetCount:目標字數
        // -------------------------------------------------------------------
        difficultySettings: {
            '小學': {
                cols: 3, rows: 3, minStayDuration: 2000, maxStayDuration: 2500, minDecoys: 1, maxDecoys: 2,
                maxMissPerTarget: 0, maxHearts: 6, hintMode: 'full', frenzyInterval: 9999999, frenzyDecoys: 1,
                poemMinRating: 6, minLines: 4, maxLines: 4, maxChars: 28, maxTargetCount: 1,
                targetCharPreview: true   // 預覽正確字顯示橙色，方便辨別順序
            },
            '中學': {
                cols: 4, rows: 3, minStayDuration: 1500, maxStayDuration: 2500, minDecoys: 2, maxDecoys: 4,
                maxMissPerTarget: 0, maxHearts: 5, hintMode: 'full', frenzyInterval: 9999999, frenzyDecoys: 1,
                poemMinRating: 5, minLines: 4, maxLines: 6, maxChars: 42, maxTargetCount: 2,
                targetCharPreview: true   // 預覽正確字顯示橙色，方便辨別順序
            },
            '高中': {
                cols: 4, rows: 4, minStayDuration: 1500, maxStayDuration: 2500, minDecoys: 2, maxDecoys: 4,
                maxMissPerTarget: 0, maxHearts: 4, hintMode: 'full', frenzyInterval: 9999999, frenzyDecoys: 1,
                poemMinRating: 4, minLines: 4, maxLines: 8, maxChars: 56, maxTargetCount: 3,
                targetCharPreview: true  // 正確字一律金色，玩家須自行判斷順序
            },
            '大學': {
                cols: 5, rows: 4, minStayDuration: 2500, maxStayDuration: 3500, minDecoys: 2, maxDecoys: 4,
                maxMissPerTarget: 0, maxHearts: 3, hintMode: 'sentence-first', frenzyInterval: 9999999, frenzyDecoys: 1,
                poemMinRating: 3, minLines: 8, maxLines: 12, maxChars: 56, maxTargetCount: 3,
                targetCharPreview: false  // 正確字一律金色，玩家須自行判斷順序
            },
            '研究所': {
                cols: 5, rows: 5, minStayDuration: 3000, maxStayDuration: 5000, minDecoys: 2, maxDecoys: 4,
                maxMissPerTarget: 0, maxHearts: 2, hintMode: 'none', frenzyInterval: 9999999, frenzyDecoys: 1,
                poemMinRating: 3, minLines: 8, maxLines: 20, maxChars: 80, maxTargetCount: 4,
                targetCharPreview: false  // 正確字一律金色，玩家須自行判斷順序
            }
        },
        gameStartTime: null,

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
                <div id="game16-poem-info" class="game16-poem-info"></div>
                <div id="game16-hint-bar" class="game16-hint-bar"></div>
                <div id="game16-area" class="game16-area">
                    <div id="game16-holes-grid" class="game16-holes-grid"></div>
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
            this.gameStartTime = Date.now();
            this.score = 0;
            this.comboCount = 0;
            this.comboMultiplier = 1;
            this.targetIndex = 0;
            this.consecutiveMiss = 0;
            this.errorIndices = new Set();
            this.isFrenzy = false;
            this.cycleId = 0;
            this.currentBatchRemaining = 0;
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
            const areaH = 850 - 44 - 44 - 52 - 40 - 8; // header(44)+sub-header(44)+poem-bar(52)+hint-bar(40)+padding(8)
            const cellW = Math.floor(480 / this.cols); // 480 = 500 - padding
            const cellH = Math.floor(areaH / this.rows);
            const minCell = Math.min(cellW, cellH);
            const pitSize = Math.round(minCell * 0.60);
            const bubbleSize = Math.round(minCell * 0.75);
            const fontSize = Math.round(minCell * 0.50);

            // 透過 CSS 變數傳遞尺寸；橢圓地洞：高度 = 寬度的 1/3，向下偏移使下緣位置不變
            const pitHeight = Math.round(pitSize / 3);
            const pitShift = Math.round((pitSize - pitHeight) / 2);
            grid.style.setProperty('--pit-size', pitSize + 'px');
            grid.style.setProperty('--pit-height', pitHeight + 'px');
            grid.style.setProperty('--pit-shift', pitShift + 'px');
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

                const holeData = { el: holeEl, pitEl, bubbleEl, state: 'idle', char: '', timeout: null, hitId: 0, seqOffset: -1 };
                this.holes.push(holeData);

                // pointerdown 立即響應，手機觸控優先
                holeEl.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    this.onHoleClick(i);
                });
            }
        },

        // ── 更新提示欄（全文逐字顯示進度：已擊灰色 / 目標金色 / 未擊淺綠）──
        updateHint: function () {
            const bar = document.getElementById('game16-hint-bar');
            if (!bar) return;
            bar.style.display = '';
            if (!this.currentPoem || !this.poemLines.length) {
                bar.innerHTML = '';
                return;
            }

            bar.innerHTML = '';
            let globalIdx = 0;
            this.poemLines.forEach((line, lineIdx) => {
                // 句與句之間插入空隙
                if (lineIdx > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'game16-hint-sep';
                    bar.appendChild(sep);
                }
                for (let i = 0; i < line.length; i++) {
                    const span = document.createElement('span');
                    span.className = 'game16-hint-char';
                    span.textContent = line[i];
                    if (this.errorIndices && this.errorIndices.has(globalIdx)) {
                        span.dataset.state = 'error';
                    } else if (globalIdx < this.targetIndex) {
                        span.dataset.state = 'done';
                    } else if (globalIdx === this.targetIndex) {
                        span.dataset.state = 'target';
                        span.id = 'game16-hint-current';
                    } else {
                        span.dataset.state = 'future';
                    }
                    bar.appendChild(span);
                    globalIdx++;
                }
            });
            // 自動水平捲動至目前目標字，保持置中顯示
            const current = document.getElementById('game16-hint-current');
            if (current) {
                current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
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

        // ── 排程下一個目標字（A–G 週期批次邏輯，支援多正確字同時顯示）────
        scheduleNextTarget: function () {
            if (!this.isActive) return;
            if (this.targetIndex >= this.fullPoemText.length) {
                this.gameOver(true, 'complete');
                return;
            }

            const settings = this.difficultySettings[this.difficulty];

            // A. 取得空閒洞口索引（'hit-wrong' 動畫中的洞不算空閒）
            const idle = this.holes.reduce((acc, h, i) => { if (h.state === 'idle') acc.push(i); return acc; }, []);

            if (idle.length === 0) {
                this.nextTargetTimer = setTimeout(() => this.scheduleNextTarget(), 250);
                return;
            }

            // B-new. 決定本批次要同時顯示的正確字數（受剩餘詩句長度與空閒洞口數限制）
            // 先以亂數決定每批要出幾個字正確字
            const maxTargets = Math.floor(Math.random() * settings.maxTargetCount) + 1;
            //剩餘詩句長度
            const remaining = this.fullPoemText.length - this.targetIndex;
            //空閒洞口數限制
            const batchTargetCount = Math.min(maxTargets, remaining, idle.length);
            this.currentBatchRemaining = batchTargetCount; // 追蹤本批未擊中正確字數，供 handleCycleMiss 使用

            // 取出本批次所有正確字（依詩句順序）
            const targetChars = [];
            for (let t = 0; t < batchTargetCount; t++) {
                targetChars.push(this.fullPoemText[this.targetIndex + t]);
            }

            // B. 決定混淆字數量（扣除正確字佔用的洞口數）
            const decoyCount = Math.min(
                settings.minDecoys + Math.floor(Math.random() * (settings.maxDecoys - settings.minDecoys + 1)),
                idle.length - batchTargetCount
            );
            let decoyChars = [];
            if (window.SharedDecoy && decoyCount > 0) {
                decoyChars = window.SharedDecoy.getDecoyChars(
                    this.fullPoemText.split(''),
                    decoyCount,
                    targetChars,      // 排除本批次所有正確字
                    settings.poemMinRating
                );
            }
            while (decoyChars.length < decoyCount) decoyChars.push('虛');

            // C. 建立所有項目：主要正確字 + 預覽正確字 + 混淆字，打亂位置
            const allItems = [
                { char: targetChars[0], type: 'target', seqOffset: 0 },
                ...targetChars.slice(1).map((c, i) => ({ char: c, type: 'target-preview', seqOffset: i + 1 })),
                ...decoyChars.map(c => ({ char: c, type: 'decoy', seqOffset: -1 }))
            ];
            // Fisher-Yates 洗牌
            for (let i = allItems.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
            }
            const shuffledIdle = [...idle].sort(() => Math.random() - 0.5);
            const assignedHoles = shuffledIdle.slice(0, allItems.length);

            // 更新週期 ID
            this.cycleId++;
            const thisCycleId = this.cycleId;

            // D + E. 正確字同時出現；混淆字各自隨機延遲，出現順序打亂
            // 多個正確字的核心玩法是「讓玩家自行判斷打擊順序」，
            // 若正確字依序出現玩家只需按出現順序擊打，完全失去難度。
            // 因此同一批所有正確字共用同一個隨機延遲（同時冒出），混淆字則各自隨機散佈。
            // maxDelay 依 minStayDuration 等比縮放：困難關卡字停留短，延遲也要短以保留足夠反應時間。
            const maxDelay = Math.min(Math.floor(settings.minStayDuration * 0.25), 450);
            const targetDelay = Math.floor(Math.random() * maxDelay); // 本批所有正確字共用此延遲
            assignedHoles.forEach((hIdx, i) => {
                const item = allItems[i];
                const isTargetType = (item.type === 'target' || item.type === 'target-preview');
                const delay = isTargetType ? targetDelay : Math.floor(Math.random() * maxDelay);
                const stayDuration = settings.minStayDuration +
                    Math.random() * (settings.maxStayDuration - settings.minStayDuration);

                setTimeout(() => {
                    if (!this.isActive || this.cycleId !== thisCycleId) return;
                    if (this.holes[hIdx] && this.holes[hIdx].state === 'idle') {
                        this.activateHole(hIdx, item.char, item.type, stayDuration, item.seqOffset);
                    }
                }, delay);
            });

            // F. 週期計時器：超時視為漏失（跳過 hit-wrong 動畫中的洞）
            const cycleDuration = settings.maxStayDuration + 500;
            this.targetTimeout = setTimeout(() => {
                if (!this.isActive) return;
                this.holes.forEach((h, i) => {
                    if (h.state !== 'idle' && h.state !== 'hit-wrong') this.deactivateHole(i, 'sink');
                });
                this.handleCycleMiss();
            }, cycleDuration);
        },

        // ── 激活洞口（字從洞底升起）─────────────────────────────
        // stayDuration：此字的停留時間（ms），到期後自動縮回；正確字與混淆字皆適用
        // seqOffset：-1=混淆字，0=主要正確字，1+=預覽正確字（尚未輪到）
        activateHole: function (idx, char, type, stayDuration, seqOffset = -1) {
            const hole = this.holes[idx];
            if (!hole || hole.state !== 'idle') return;

            hole.char = char;
            hole.state = type;       // 'target' | 'target-preview' | 'decoy'
            hole.seqOffset = seqOffset;
            hole.hitId = (hole.hitId || 0) + 1; // 遞增版本號，失效任何先前擊中動畫的計時器
            hole.bubbleEl.textContent = char;

            // 依 hintMode 與 type 決定泡泡視覺樣式
            // target：依 hintMode 決定金色或白色
            // target-preview：淺暖橙色（即將要打但尚未輪到）
            // decoy：白底黑字
            let visualClass = 'game16-char-neutral';
            if (type === 'target') {
                const mode = this.difficultySettings[this.difficulty].hintMode;
                if (mode === 'full' ||
                    (mode === 'sentence-first' && this.isFirstOfSentence(this.targetIndex))) {
                    visualClass = 'game16-char-target';
                }
            } else if (type === 'target-preview') {
                // targetCharPreview: true  → 顯示橙色（game16-char-preview），方便辨別順序（小學/中學）
                // targetCharPreview: false → 顯示黑白中性色（game16-char-neutral），與混淆字外觀相同，
                //                           玩家無法從顏色辨別哪些是預覽正確字，必須靠記憶詩句判斷（高中以上）
                const settings2 = this.difficultySettings[this.difficulty];
                visualClass = (settings2.targetCharPreview === false)
                    ? 'game16-char-neutral'
                    : 'game16-char-preview';
            }

            // 先清除舊動畫類，再設定新的，確保 animation 重新觸發
            hole.bubbleEl.className = 'game16-char-bubble';
            void hole.bubbleEl.offsetWidth; // 強制 reflow
            hole.bubbleEl.className = `game16-char-bubble ${visualClass} game16-rise`;

            // 所有字都有各自的停留時間，到期後自動縮回
            // 條件改為「洞口非空閒且非 hit-wrong」而非「state 完全吻合」：
            // 這樣 target-preview 升格為 target 後，state 雖然改變，計時器仍能正常觸發縮回，
            // 不會因升格後 state 與 type 不符而讓字永遠停在畫面上。
            if (stayDuration) {
                hole.timeout = setTimeout(() => {
                    if (hole.state !== 'idle' && hole.state !== 'hit-wrong') this.deactivateHole(idx, 'sink');
                }, stayDuration);
            }
        },

        // ── 停用洞口（字縮回）───────────────────────────────────
        deactivateHole: function (idx, animClass) {
            const hole = this.holes[idx];
            if (!hole) return;
            if (hole.timeout) { clearTimeout(hole.timeout); hole.timeout = null; }

            // 縮回時保留視覺顏色：
            //   正確字（game16-char-target）→ 繼續顯示金色，讓玩家知道哪個是正確字
            //   預覽正確字（game16-char-preview）→ 繼續顯示橙色
            //   混淆字／中性字 → 改為深色半透明，讓玩家知道縮回的是混淆字
            const currentClass = hole.bubbleEl.className;
            let colorClass;
            if (currentClass.includes('game16-char-target')) {
                colorClass = 'game16-char-target';
            } else if (currentClass.includes('game16-char-preview')) {
                colorClass = 'game16-char-preview';
            } else {
                colorClass = 'game16-char-sink-dark';  // 混淆字：黑色半透明
            }

            hole.state = 'idle';
            hole.char = '';

            void hole.bubbleEl.offsetWidth;  // 強制 reflow，確保動畫重新觸發
            hole.bubbleEl.className = `game16-char-bubble ${colorClass} game16-${animClass || 'sink'}`;

            // 動畫結束後清空泡泡（fast-sink 動畫較短，提早清除）
            const clearDelay = animClass === 'fast-sink' ? 100 : 200;
            setTimeout(() => {
                if (hole.bubbleEl) {
                    hole.bubbleEl.className = 'game16-char-bubble';
                    hole.bubbleEl.textContent = '';
                }
            }, clearDelay);
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
            } else if (hole.state === 'decoy' || hole.state === 'target-preview') {
                // 混淆字 或 順序錯誤的預覽正確字：均視為擊錯
                this.hitWrong(idx);
            }
            // 'hit-wrong' 動畫進行中：忽略點擊
        },

        // ── 擊中正確字 ───────────────────────────────────────────
        hitCorrect: function (idx) {
            if (window.SoundManager) {
                this.comboCount >= 4
                    ? window.SoundManager.playJoyfulTriple()
                    : window.SoundManager.playSuccessShort();
            }

            // 取消週期計時器；遞增 cycleId 使本批尚在延遲中的字不再出現
            clearTimeout(this.targetTimeout);
            this.targetTimeout = null;
            this.cycleId++;

            // 播放擊中動畫：正確字放大停留 0.5 秒，再快速往下鑽入地洞
            const hole = this.holes[idx];
            hole.state = 'idle'; // 立即標為空閒，防止重複點擊
            if (hole.timeout) { clearTimeout(hole.timeout); hole.timeout = null; }
            hole.hitId = (hole.hitId || 0) + 1;         // 遞增版本號，使 500ms 後的計時器能識別是否仍有效
            const capturedHitId = hole.hitId;
            void hole.bubbleEl.offsetWidth;
            hole.bubbleEl.className = 'game16-char-bubble game16-char-target game16-hit-enlarge';
            setTimeout(() => {
                // 只有版本號一致且泡泡仍有內容時才切換動畫（防止閃爍金色 bug）
                if (hole.hitId !== capturedHitId || !hole.bubbleEl || !hole.bubbleEl.textContent) return;
                hole.bubbleEl.className = 'game16-char-bubble game16-char-target game16-hit-sink-down';
                setTimeout(() => {
                    if (hole.hitId === capturedHitId && hole.bubbleEl) {
                        hole.bubbleEl.className = 'game16-char-bubble';
                        hole.bubbleEl.textContent = '';
                    }
                }, 100);
            }, 200);

            // 更新連擊與分數
            this.comboCount++;
            this.consecutiveMiss = 0;
            this.updateCombo();

            // COMBO 加成最多只允許 2 倍：保持連擊中(連5以上) → ×2，否則 ×1
            const pts = this.comboMultiplier > 5 ? this.getPointA() * 2 : this.getPointA();
            this.score += pts;
            document.getElementById('game16-score').textContent = Math.floor(this.score);
            this.showFloatingScore(idx, '+' + pts);

            this.targetIndex++;
            this.currentBatchRemaining = Math.max(0, this.currentBatchRemaining - 1); // 已擊中一個，剩餘數遞減
            this.updateProgress();
            this.updateHint();

            // 勝利判斷
            if (this.targetIndex >= this.fullPoemText.length) {
                setTimeout(() => this.gameOver(true, 'complete'), 750);
                return;
            }

            // 嘗試將預覽正確字（target-preview）升格為主要目標
            const promoted = this.promotePreviewTarget();

            if (promoted) {
                // 預覽字已升格，但本批尚有正確字待擊：
                // 混淆字【不】立刻清除，讓玩家仍需在混淆字中辨別下一個正確字。
                // 各混淆字的 stayDuration 計時器依舊在跑，時間到自然縮回；
                // 若玩家誤擊混淆字仍會扣血。
                // 只設定新週期計時器，超時視為漏失並清空剩餘字。
                this.cycleId++;
                const newCycleId = this.cycleId;
                const settings = this.difficultySettings[this.difficulty];
                this.targetTimeout = setTimeout(() => {
                    if (!this.isActive || this.cycleId !== newCycleId) return;
                    this.holes.forEach((h, i) => {
                        if (h.state !== 'idle' && h.state !== 'hit-wrong') this.deactivateHole(i, 'sink');
                    });
                    this.handleCycleMiss();
                }, settings.maxStayDuration + 300);
            } else {
                // 本批所有正確字已擊完：立刻清除剩餘混淆字，排程下一批
                this.holes.forEach((h, i) => {
                    if (i !== idx && h.state === 'decoy') this.deactivateHole(i, 'fast-sink');
                });
                this.nextTargetTimer = setTimeout(() => this.scheduleNextTarget(), 200);
            }
        },

        // ── 將 seqOffset 最低的 target-preview 升格為主要目標 ────────
        promotePreviewTarget: function () {
            let bestHole = null;
            let bestOffset = Infinity;
            this.holes.forEach(h => {
                if (h.state === 'target-preview' && h.seqOffset < bestOffset) {
                    bestOffset = h.seqOffset;
                    bestHole = h;
                }
            });
            if (!bestHole) return false;

            bestHole.state = 'target';
            bestHole.seqOffset = 0;

            // 根據 hintMode 切換為金黃色目標樣式
            const mode = this.difficultySettings[this.difficulty].hintMode;
            if (mode === 'full' ||
                (mode === 'sentence-first' && this.isFirstOfSentence(this.targetIndex))) {
                bestHole.bubbleEl.className = bestHole.bubbleEl.className
                    .replace('game16-char-preview', 'game16-char-target')
                    .replace('game16-char-neutral', 'game16-char-target');
            }
            return true;
        },

        // ── 擊中混淆字（或順序錯誤的預覽正確字）───────────────────
        hitWrong: function (idx) {
            if (window.SoundManager) window.SoundManager.playFailure();

            const hole = this.holes[idx];
            // 設為 hit-wrong 狀態：防止重複點擊；週期計時器與其他字不受影響
            hole.state = 'hit-wrong';
            if (hole.timeout) { clearTimeout(hole.timeout); hole.timeout = null; }

            // 被擊中的字：變紅色 + 晃動，1 秒後快速鑽入地洞
            // 其他字（正確字與其他混淆字）繼續保有預設的顯示時間，不受干擾
            hole.bubbleEl.classList.add('game16-wrong-flash');
            hole.el.classList.add('game16-shake');
            hole.timeout = setTimeout(() => {
                hole.el.classList.remove('game16-shake');
                this.deactivateHole(idx, 'fast-sink');
            }, 1000);

            this.hearts--;
            this.breakCombo();
            this.renderHearts();

            if (this.hearts <= 0) {
                setTimeout(() => this.gameOver(false, 'heartless'), 1200);
                return;
            }
            // 不取消 targetTimeout、不清除其他字、不推進 targetIndex
            // 玩家仍有機會在週期結束前擊中正確字
        },

        // ── 週期結束漏失處理（由週期計時器 targetTimeout 呼叫）────
        // 注意：漏失跟打錯混淆字都會中斷連擊
        handleCycleMiss: function () {
            this.consecutiveMiss++;
            const settings = this.difficultySettings[this.difficulty];

            // missCount：本批尚未擊中的正確字數（至少 1）
            // 若批次有 2 個正確字且玩家一個都沒打到，需跳過 2 個；
            // 若已擊中第 1 個（currentBatchRemaining 已遞減為 1），只跳過剩下 1 個。
            const missCount = Math.max(1, this.currentBatchRemaining);
            this.currentBatchRemaining = 0;

            // 連續漏失超過容忍上限 → 扣血 + 標記所有本批未擊中的正確字
            if (settings.maxMissPerTarget < 99 && this.consecutiveMiss > settings.maxMissPerTarget) {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.hearts--;
                this.breakCombo();
                this.renderHearts();
                this.consecutiveMiss = 0;

                if (this.hearts <= 0) {
                    setTimeout(() => this.gameOver(false, 'heartless'), 400);
                    return;
                }

                // 標記本批所有未擊中的正確字：不再重複出現，hint-bar 以紅色標示
                for (let i = 0; i < missCount; i++) {
                    this.errorIndices.add(this.targetIndex + i);
                }
                this.targetIndex += missCount;
                this.updateProgress();
                this.updateHint();
            }

            // G. 重複進入下一個 A–F 週期
            this.nextTargetTimer = setTimeout(() => this.scheduleNextTarget(), 350);
        },

        // ── 更新連擊倍率顯示 ─────────────────────────────────────
        updateCombo: function () {
            // 直接顯示真實連擊數，最低為 1（不會顯示 ×0）
            this.comboMultiplier = Math.max(1, this.comboCount);

            const el = document.getElementById('game16-combo');
            if (el) {
                el.textContent = '×' + this.comboMultiplier;
                // 連擊達 5 以上才觸發最高階視覺特效
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
            // 失敗時寫入 game_logs（score=0，記錄本局時長）
            // 過關時 LOG 已由 ScoreManager.saveScore 負責寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 16,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

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
