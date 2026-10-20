/* ============================================================================
 * game36.js — 轉輪覓詩 (Verse Reel / Poetry Wordle)
 * ----------------------------------------------------------------------------
 * Wordle 式詩句猜謎：候選詩句會由系統自動陸續送進上方題目區，逐格翻牌染三色
 * （綠=位置對、藍=字在但位置錯、灰=字不存在）；玩家依線索推敲，再按「手動輸入答案」
 * 自行鍵入整句答案。無次數上限、無失敗，答對即勝；時限只影響分數。
 * （2026-10 取消下方的詩句轉輪：原本玩家轉輪挑句提交，改成候選池依序自動出現。）
 *
 * 依《note/game36_轉輪覓詩_企劃書與遊戲心得.md》實作，重點：
 *   - 候選池：複用 window.getSharedBarLine（逐字元反查詩句）+ 等長過濾；混淆句移植
 *     game21 的 pickDecoyLine（不含任何目標字），比例隨難度遞增（§5）
 *   - 顏色判定兩輪法，正確處理重複字（§5.6）
 *   - 判定網格（題目區）固定 8 格高、可垂直捲動，隨詩句出現自動延伸新列（§2、§4）
 *   - 美術完全沿用 game1 米白宣紙主題（theme_xuanzhi.css 的 --fm-* 變數）
 *
 * 慣例：class 加 game36- 前綴；overlay 掛 document.body；registerOverlayResize 縮放；
 *       window.Game36 掛全域。
 * ========================================================================== */

(function () {
    'use strict';

    const GRID_COLS = 7;         // 判定網格固定 7 欄（七言全填、五言左起填 5 格右留 2 空）
    const GRID_CELL = 54;        // 格子邊長（px，邏輯舞台）
    const GRID_GAP = 8;
    const GRID_VISIBLE_ROWS = 8;     // 網格（題目區）可視高度：8 列
    const PLACEHOLDER_ROWS = 8;      // 開局虛線佔位列數（剛好填滿 8 列可視高度）

    const AUTO_FIRST_DELAY_MS = 800;     // 按下「開始挑戰」後，第一句詩出現的等待時間
    const AUTO_LINE_INTERVAL_MS = 2000;  // 之後每隔多久自動送出下一句候選詩
    const FLIP_STEP_MS = 150;    // 逐格翻牌間隔

    const Game36 = {
        // 重來時沿用同一句目標（見 retryGame / _pickTarget）
        _keepTarget: false,
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,

        // ── 題目 / 候選 ──
        targetPoem: null,
        targetLine: '',
        targetChars: [],
        N: 5,
        pool: [],
        settings: null,

        // ── 進度 ──
        guessedLines: null,   // Set<string>（已出現在題目區的句子，自動與手動都記）
        tries: 0,             // 玩家手動輸入答案的次數（自動出現的詩句不算）
        score: 0,
        finishing: false,     // 已答對、正在翻牌收尾 → 鎖住一切新提交與自動出句
        gameStartTime: null,

        // ── 計時（僅影響分數，不會失敗）──
        timer: 0,
        maxTimer: 0,
        startTime: null,
        timerInterval: null,

        // ── 自動出句：候選池（pool）依序一句句送進題目區 ──
        autoTimer: null,   // 下一句出現的 setTimeout ID
        autoIndex: 0,      // 下一個要出現的 pool 索引

        // ── 正確答案區（頂端常駐 7 格摘要）──
        //   solvedGreen[i]：位置 i 已確認的綠字（含孤立字提示）；空字串代表未知
        //   solvedBlue[i] ：位置 i 被猜過的藍字集合（供手動輸入彈窗提示）
        solvedGreen: null,   // string[7]
        solvedBlue: null,    // Set<string>[7]

        // ── 手動輸入 ──
        manualOpen: false,

        container: null,

        // 難度設定（對照企劃書 §7）
        // maxIsolatedChars: 每局最多容許幾個孤立字（無法透過候選詩句找到，會以綠字提示補在正確答案區）
        difficultySettings: {
            '小學':   { wordLens: [5], poemMinRating: 6, poolSize: 16, decoyRatio: 0.15, timeLimit: 240, hint: 'title',   maxIsolatedChars: 2 },
            '中學':   { wordLens: [5], poemMinRating: 5, poolSize: 20, decoyRatio: 0.20, timeLimit: 210, hint: 'dynasty', maxIsolatedChars: 2 },
            '高中':   { wordLens: [7], poemMinRating: 5, poolSize: 24, decoyRatio: 0.30, timeLimit: 200, hint: 'none',    maxIsolatedChars: 1 },
            '大學':   { wordLens: [7], poemMinRating: 4, poolSize: 28, decoyRatio: 0.38, timeLimit: 180, hint: 'none',    maxIsolatedChars: 1 },
            '研究所': { wordLens: [7], poemMinRating: 3, poolSize: 32, decoyRatio: 0.45, timeLimit: 150, hint: 'none',    maxIsolatedChars: 0 },
        },

        // ========================================================
        // 初始化
        // ========================================================
        // ── 動態載入 game36.css（避免重複插入 <link>）──
        loadCSS: function () {
            if (!document.getElementById('game36-css')) {
                const link = document.createElement('link');
                link.id = 'game36-css';
                link.rel = 'stylesheet';
                link.href = 'game36.css';
                document.head.appendChild(link);
            }
        },

        // ── 遊戲初始化：載入 CSS、建立 DOM（若尚未建立）、綁定所有按鈕事件 ──
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game36-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game36-container');
            document.getElementById('game36-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game36-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            // 手動輸入按鈕
            document.getElementById('game36-manual-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this._openManualDialog();
            };
            document.getElementById('game36-manual-close').onclick = () => {
                if (window.SoundManager) window.SoundManager.playCloseItem && window.SoundManager.playCloseItem();
                this._closeManualDialog();
            };
            document.getElementById('game36-manual-confirm').onclick = () => this._submitManualInput();
            document.getElementById('game36-manual-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._submitManualInput();
            });
            // 網格捲動：滑鼠/觸控拖曳 + 慣性（參考 author_bio.js）
            this._setupGridMomentumScroll(document.getElementById('game36-grid-scroll'));
        },

        // ── 建立遊戲整體 DOM 結構（頂部分數列、正確答案區、判定網格、手動輸入按鈕與彈窗）並註冊縮放 ──
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game36-container';
            div.className = 'game36-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game36-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game36-diff-tag" data-level="小學">小學</button>
                        <button id="game36-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game36-tries" class="game36-tries">已嘗試 0 次</div>
                    <div id="game36-poem-info" class="fm-poem-info"></div>
                </div>
                <div class="game36-solved-area">
                    <div class="game36-solved-label">正確答案</div>
                    <div id="game36-solved-row" class="game36-solved-row"></div>
                </div>
                <div class="game36-grid-area">
                    <div id="game36-grid-viewport" class="game36-grid-viewport">
                        <svg id="game36-timer-ring"><rect id="game36-timer-path" x="5" y="5"></rect></svg>
                        <div id="game36-grid-scroll" class="game36-grid-scroll">
                            <div id="game36-grid" class="game36-grid"></div>
                        </div>
                    </div>
                </div>
                <div class="game36-action-area">
                    <button id="game36-manual-btn" class="fm-nav-btn game36-manual-btn">手動輸入答案</button>
                    <div class="game36-hint">詩句會自動陸續出現 · 依線索推敲後手動輸入答案</div>
                </div>
                <!-- 手動輸入彈窗（位於上半部，不遮蔽正確答案區）-->
                <div id="game36-manual-overlay" class="game36-manual-overlay hidden">
                    <div class="game36-manual-title">手動輸入答案</div>
                    <div class="game36-manual-blue-label">已知線索（藍字，在答案中但位置未定）</div>
                    <div id="game36-manual-blue-row" class="game36-manual-blue-row"></div>
                    <div class="game36-manual-input-row">
                        <input type="text" id="game36-manual-input" class="game36-manual-input"
                               placeholder="輸入你猜的答案（取前 7 字判定）">
                        <button id="game36-manual-confirm" class="fm-nav-btn game36-manual-confirm">確定</button>
                    </div>
                    <button id="game36-manual-close" class="game36-manual-close" aria-label="關閉">×</button>
                </div>
            `;
            document.body.appendChild(div);
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
        },

        // ========================================================
        // 顯示 / 難度
        // ========================================================
        // ── 對外進入點：初始化並顯示難度選擇畫面 ──
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // ── 顯示難度選擇彈窗，選定難度／關卡後才真正開新局 ──
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            this._stopAutoLines();
            if (window.GameMessage) window.GameMessage.hide();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('轉輪覓詩', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    window.FMGame.holdOverlayActive();
                    this.startNewGame();
                });
            } else {
                this.container.classList.remove('hidden');
                this.startNewGame();
            }
        },

        // ── 依「一般難度模式」或「關卡模式」切換上方標籤文字與「開新局」按鈕顯示 ──
        updateUIForMode: function () {
            const diffTag = document.getElementById('game36-diff-tag');
            const newBtn = document.getElementById('game36-newGame-btn');
            if (diffTag) diffTag.setAttribute('data-level', this.difficulty);
            if (this.isLevelMode) {
                if (diffTag) diffTag.textContent = `${window.FMRoundLabel(this.currentLevelIndex)}`;
                if (newBtn) newBtn.style.display = 'none';   // 關卡模式由「下一關」推進
            } else {
                if (diffTag) diffTag.textContent = this.difficulty;
                if (newBtn) newBtn.style.display = 'inline-block';
            }
        },

        // ── 停止遊戲：清計時器、停自動出句、隱藏遊戲畫面並還原頁面捲動狀態 ──
        stopGame: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            this._stopAutoLines();
            window.FMGame.stop(this);
        },

        // ── 對外隱藏介面（等同 stopGame）──
        hide: function () { this.stopGame(); },

        // ========================================================
        // 開局
        // ========================================================
        // ── 開新局主流程：重置狀態 → 挑目標詩句 → 產生候選池 → 佈局網格與正確答案區 → 顯示規則彈窗後才開始計時與自動出句 ──
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) { this.currentLevelIndex = levelIndex; this.isLevelMode = true; }
            this.updateUIForMode();

            this.settings = this.difficultySettings[this.difficulty];
            this.isActive = true;
            this.score = 0;
            this.tries = 0;
            this.finishing = false;
            this.autoIndex = 0;
            this.guessedLines = new Set();
            this._closeManualDialog();
            document.getElementById('game36-score').textContent = '0';
            document.getElementById('game36-tries').textContent = '已嘗試 0 次';
            document.getElementById('game36-grid').innerHTML = '';
            document.getElementById('game36-solved-row').innerHTML = '';
            document.getElementById('game36-newGame-btn').disabled = false;
            if (window.GameMessage) window.GameMessage.hide();

            if (!this._pickTarget()) { alert('找不到符合條件的詩句。'); return; }
            this._generatePool();
            this._layoutGrid();
            // 初始化正確答案區與孤立字提示
            this.solvedGreen = new Array(GRID_COLS).fill('');
            this.solvedBlue = new Array(GRID_COLS).fill(null).map(() => new Set());
            this._populateOrphans();     // 把孤立字直接填入 solvedGreen 作為免費提示
            this._renderSolvedRow();
            this._showPoemInfo(false);

            this.maxTimer = this.settings.timeLimit;
            this.timer = this.settings.timeLimit;
            this.gameStartTime = Date.now();

            // 顯示開局提示畫面（RuleNoteDialog），玩家按下開始才啟動計時與自動出句
            const startPlaying = () => {
                this._startTimer();
                this._scheduleNextAutoLine(AUTO_FIRST_DELAY_MS);
            };
            this._stopAutoLines();
            if (this.timerInterval) clearInterval(this.timerInterval);
            window.FMGame.showRuleIntro(this, {
                title: '轉輪覓詩',
                lines: [
                    '詩句會自動陸續出現在上方題目區，',
                    '綠色＝字位置正確；藍色＝字在但位置錯；灰色＝字不存在。',
                    '　',
                    '依線索推敲，點「手動輸入答案」',
                    '鍵入你猜的整句答案。'
                ],
                btnText: '開始挑戰',
                styles: {
                    top: '50%', left: '50%', width: '80%', height: '55%',
                    bg: 'hsla(38, 60%, 90%, 0.96)',
                    titleColor: 'hsl(28, 60%, 25%)',
                    textColor: 'hsl(28, 40%, 20%)',
                    btnBg: 'hsl(38, 80%, 55%)',
                    btnColor: 'hsl(28, 60%, 15%)'
                }
            }, startPlaying);
        },

        /**
         * 重來 —— 保留同一句目標重新開局（與其餘 38 款語意一致）。
         *
         * ⚠️ 2026-09-11 補上。本作沒有失敗條件，畫面上也沒有「重來」按鈕，
         *    但契約要求 39 款一律具備同名同義的 retryGame()：
         *    青雲梯與考試是以「每一款都長一樣」為前提在接管遊戲的，
         *    少一支就是一個必須特判的例外。
         */
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.targetLine) { this.startNewGame(); return; }
            this._keepTarget = true;
            try { this.startNewGame(); } finally { this._keepTarget = false; }
        },

        // ── 進入下一關（關卡模式）：關卡序號 +1 後重新開局 ──
        startNextLevel: function () {
            window.FMGame.nextLevel(this);
        },

        // ── 挑選目標詩句（等長 + 評分達標 + 孤立字數限制；關卡模式以序號確定性挑選）──
        _pickTarget: function () {
            // 重來（retryGame）：沿用上一局的目標句，不重新抽題。
            if (this._keepTarget && this.targetLine) {
                this.N = this.targetLine.length;
                this.targetChars = this.targetLine.split('');
                return true;
            }
            if (typeof POEMS === 'undefined' || !POEMS.length) return false;
            const s = this.settings;
            const lens = s.wordLens;
            const wantLen = lens[this.isLevelMode ? (this.currentLevelIndex % lens.length) : Math.floor(Math.random() * lens.length)];
            this.N = wantLen;

            const collect = (minRating, maxIso) => {
                const out = [];
                for (const p of POEMS) {
                    if ((p.rating || 0) < minRating) continue;
                    for (const line of (p.content || [])) {
                        const clean = this._strip(line);
                        if (clean.length !== wantLen) continue;
                        // 孤立字數上限（依難度設定；若未提供 countIsolatedChars 則不做此限制）
                        if (maxIso !== null && typeof window.countIsolatedChars === 'function'
                            && window.countIsolatedChars(clean) > maxIso) continue;
                        out.push({ poem: p, clean });
                    }
                }
                return out;
            };
            // 分段 fallback：先嚴格套用 maxIsolatedChars，找不到時逐步放寬
            const maxIso = (typeof s.maxIsolatedChars === 'number') ? s.maxIsolatedChars : null;
            let cands = [];
            if (maxIso !== null) {
                cands = collect(s.poemMinRating, maxIso);                // 嚴格
                if (!cands.length) cands = collect(s.poemMinRating, maxIso + 1);  // 放寬 +1
                if (!cands.length) cands = collect(s.poemMinRating, maxIso + 2);  // 放寬 +2
            }
            if (!cands.length) cands = collect(s.poemMinRating, null);   // 完全不管孤立字
            if (!cands.length) cands = collect(0, null);                 // 最後降級：忽略評分
            if (!cands.length) return false;

            const idx = this.isLevelMode
                ? (this.currentLevelIndex * 7919) % cands.length
                : Math.floor(Math.random() * cands.length);
            const chosen = cands[idx];
            this.targetPoem = chosen.poem;
            this.targetLine = chosen.clean;
            this.targetChars = chosen.clean.split('');
            return true;
        },

        // ── 生成候選池（逐字元反查 + 混淆句；混合 5 言與 7 言，避免玩家憑答案卡長度反推題目字數）──
        _generatePool: function () {
            const s = this.settings;
            const N = this.N;
            const otherLen = N === 5 ? 7 : 5;
            const used = new Set([this.targetLine]);
            const pool = [this.targetLine];

            const pullShared = (ch, len) => {
                if (typeof window.getSharedBarLine !== 'function') return null;
                return window.getSharedBarLine(ch, {
                    minLen: len, maxLen: len,
                    excludePoemId: this.targetPoem.id,
                    excludeLines: used,
                    preferMid: true
                });
            };

            const nonDecoyQuota = Math.max(0, Math.round(s.poolSize * (1 - s.decoyRatio)) - 1);
            // 非混淆配額分割：約 60% 為題目字數、40% 為另一字數
            const otherLenQuota = Math.round(nonDecoyQuota * 0.4);
            const sameLenQuota = nonDecoyQuota - otherLenQuota;

            // 1) 題目字數的非混淆候選：每個目標字反查 K 句
            const perCharSame = Math.max(1, Math.floor(sameLenQuota / N));
            for (const ch of this.targetChars) {
                for (let k = 0; k < perCharSame; k++) {
                    if (pool.length - 1 >= sameLenQuota) break;
                    const line = pullShared(ch, N);
                    if (line && !used.has(line)) { used.add(line); pool.push(line); }
                }
            }
            // 補足 sameLenQuota
            let guard = 0;
            while (pool.length - 1 < sameLenQuota && guard < N * 8) {
                const ch = this.targetChars[guard % N];
                const line = pullShared(ch, N);
                guard++;
                if (line && !used.has(line)) { used.add(line); pool.push(line); }
            }

            // 2) 另一字數的非混淆候選：同樣含目標字（避免長度洩題）
            const perCharOther = Math.max(1, Math.floor(otherLenQuota / N));
            const baseAfterSame = pool.length;
            for (const ch of this.targetChars) {
                for (let k = 0; k < perCharOther; k++) {
                    if (pool.length - baseAfterSame >= otherLenQuota) break;
                    const line = pullShared(ch, otherLen);
                    if (line && !used.has(line)) { used.add(line); pool.push(line); }
                }
            }

            // 3) 混淆句：不含任何目標字；長度隨機在 5/7 之間，避免長度洩題
            const targetSet = new Set(this.targetChars);
            let dguard = 0;
            while (pool.length < s.poolSize && dguard < s.poolSize * 5) {
                dguard++;
                const useLen = Math.random() < 0.5 ? N : otherLen;
                const d = this._pickDecoyLine(targetSet, used, useLen);
                if (!d) break;
                used.add(d); pool.push(d);
            }

            // 洗牌
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            // 從候選池移除正確答案，自動出現的詩句裡不會直接冒出正解（要求 §1）
            this.pool = pool.filter(l => l !== this.targetLine);
        },

        // ── 把孤立字（`getCharLineCount(ch) <= 1`）填入 solvedGreen 作為免費綠字提示 ──
        _populateOrphans: function () {
            if (typeof window.getCharLineCount !== 'function') return;
            const padTarget = this._padCenter7(this.targetLine);
            for (let i = 0; i < GRID_COLS; i++) {
                const ch = padTarget[i];
                if (ch === ' ') continue;
                if (window.getCharLineCount(ch) <= 1) {
                    this.solvedGreen[i] = ch;   // 孤立字 → 玩家永遠找不到，直接送
                }
            }
        },

        // ── 渲染頂端「正確答案」摘要行（7 格，位置對齊，僅顯示已知綠字）──
        _renderSolvedRow: function () {
            const row = document.getElementById('game36-solved-row');
            row.innerHTML = '';
            row.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${GRID_CELL}px)`;
            const font = Math.round(GRID_CELL * 0.9);
            for (let i = 0; i < GRID_COLS; i++) {
                const c = document.createElement('div');
                c.className = 'game36-cell game36-solved-cell';
                c.style.width = GRID_CELL + 'px';
                c.style.height = GRID_CELL + 'px';
                const ch = (this.solvedGreen && this.solvedGreen[i]) || '';
                if (ch) {
                    c.classList.add('g-green');
                    c.style.fontSize = font + 'px';
                    c.textContent = ch;
                }
                row.appendChild(c);
            }
        },

        // ── 把某次判定的綠字/藍字合併進 solvedGreen / solvedBlue ──
        //   result 為 7 格判定；padGuess 為對應的 7 字（含空白）
        _mergeSolvedFromResult: function (padGuess, result) {
            for (let i = 0; i < GRID_COLS; i++) {
                if (result[i] === 'green' && padGuess[i] !== ' ') {
                    this.solvedGreen[i] = padGuess[i];
                }
                if (result[i] === 'yellow' && padGuess[i] !== ' ') {
                    this.solvedBlue[i].add(padGuess[i]);
                }
            }
        },

        // ── 混淆句選取：等長、不含任何目標字、評分加權隨機（移植 game21）──
        _pickDecoyLine: function (excludeSet, usedLines, N) {
            const candidates = [];
            for (const p of POEMS) {
                for (const line of (p.content || [])) {
                    const clean = this._strip(line);
                    if (clean.length !== N) continue;
                    if (usedLines.has(clean)) continue;
                    let bad = false;
                    for (const c of clean) { if (excludeSet.has(c)) { bad = true; break; } }
                    if (!bad) candidates.push({ clean, rating: p.rating || 0 });
                }
            }
            if (!candidates.length) return null;
            const totalW = candidates.reduce((sum, it) => sum + (it.rating + 1), 0);
            let r = Math.random() * totalW;
            for (const it of candidates) { r -= (it.rating + 1); if (r <= 0) return it.clean; }
            return candidates[candidates.length - 1].clean;
        },

        // ── 顏色判定（兩輪法，正確處理重複字，§5.6）──
        _judge: function (guessChars, targetChars) {
            const result = new Array(guessChars.length).fill('gray');
            const remain = targetChars.slice();
            for (let i = 0; i < guessChars.length; i++) {
                if (guessChars[i] === targetChars[i]) { result[i] = 'green'; remain[i] = null; }
            }
            for (let i = 0; i < guessChars.length; i++) {
                if (result[i] === 'green') continue;
                const idx = remain.indexOf(guessChars[i]);
                if (idx !== -1) { result[i] = 'yellow'; remain[idx] = null; }
            }
            return result;
        },

        // ========================================================
        // 判定網格
        // ========================================================
        _layoutGrid: function () {
            this._cell = GRID_CELL;
            // 固定 7 欄寬、8 列高（不因五言/七言而改變）
            const width = GRID_COLS * GRID_CELL + (GRID_COLS - 1) * GRID_GAP + 24;
            const height = Math.round(GRID_VISIBLE_ROWS * (GRID_CELL + GRID_GAP) + 16);
            const vp = document.getElementById('game36-grid-viewport');
            vp.style.width = width + 'px';
            vp.style.height = height + 'px';
            // 開局預先渲染 PLACEHOLDER_ROWS（8）列虛線佔位，讓玩家清楚知道題目區在哪
            this._renderPlaceholders(PLACEHOLDER_ROWS);
        },

        _renderPlaceholders: function (n) {
            const grid = document.getElementById('game36-grid');
            for (let r = 0; r < n; r++) {
                const row = document.createElement('div');
                row.className = 'game36-row game36-row-placeholder';
                row.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${this._cell}px)`;
                for (let i = 0; i < GRID_COLS; i++) {
                    const c = document.createElement('div');
                    c.className = 'game36-cell game36-cell-placeholder';
                    c.style.width = this._cell + 'px';
                    c.style.height = this._cell + 'px';
                    row.appendChild(c);
                }
                grid.appendChild(row);
            }
        },

        // 將字串置中補空格至 7 字寬（用於顯示與比對，統一填入 7 欄格網）
        _padCenter7: function (s) {
            if (s.length >= GRID_COLS) return s;
            const total = GRID_COLS - s.length;
            const left = Math.floor(total / 2);
            const right = total - left;
            return ' '.repeat(left) + s + ' '.repeat(right);
        },

        // ── 把一句詩送進題目區並判定顏色 ──
        //   isManual=false：系統自動出現的候選詩句（只給線索，不計次數、不會獲勝）
        //   isManual=true ：玩家手動輸入的答案（計入嘗試次數；與目標句完全相同才獲勝）
        _submitGuess: function (line, isManual) {
            if (this.finishing || !this.isActive) return;
            if (this.guessedLines.has(line)) return;   // 已出現過不可重複
            this.guessedLines.add(line);
            if (isManual) {
                this.tries++;
                document.getElementById('game36-tries').textContent = `已嘗試 ${this.tries} 次`;
                if (window.SoundManager) window.SoundManager.playConfirmItem();
            }

            // 一律於「置中補空至 7 字寬」的空間中比對，
            // 讓玩家無法從答案卡長度反推題目字數（要求 §3、§4）
            const padGuess = this._padCenter7(line).split('');
            const padTarget = this._padCenter7(this.targetLine).split('');
            const result = this._judge(padGuess, padTarget);
            // 把新綠字/藍字合併進頂端摘要
            this._mergeSolvedFromResult(padGuess, result);
            this._renderSolvedRow();
            // 勝利判定：答案必須由玩家手動輸入，且與目標句完全相同。
            //   自動出現的詩句即使把「正確答案」那排綠字湊齊，也不會替玩家過關。
            const winThis = isManual && padGuess.join('') === padTarget.join('');
            if (winThis) {
                this.finishing = true;
                this._stopAutoLines();
            }

            // 建立新列（固定 7 格，五言居中填入：格 1 空、格 2-6 填五字、格 7 空）
            const grid = document.getElementById('game36-grid');
            const row = document.createElement('div');
            row.className = 'game36-row';
            row.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${this._cell}px)`;
            const font = Math.round(this._cell * 0.9);
            const cells = [];
            for (let i = 0; i < GRID_COLS; i++) {
                const c = document.createElement('div');
                c.className = 'game36-cell';
                c.style.width = this._cell + 'px';
                c.style.height = this._cell + 'px';
                if (padGuess[i] !== ' ') {
                    c.style.fontSize = font + 'px';
                    c.textContent = padGuess[i];
                } else {
                    c.classList.add('game36-cell-empty');   // 左右留空格
                }
                row.appendChild(c);
                cells.push(c);
            }
            // 插入新列前先看玩家是不是停在最底：手動輸入一律捲到最新列；
            // 自動出現的詩句只在玩家本來就停在底部時才跟著捲，避免打斷正在往上翻看舊線索的人
            const sc = document.getElementById('game36-grid-scroll');
            const stickToBottom = isManual
                || (sc.scrollHeight - sc.scrollTop - sc.clientHeight <= this._cell + GRID_GAP);
            // 移除一個佔位列（若有）、把新列插在剩餘佔位列之前
            const firstPh = grid.querySelector('.game36-row-placeholder');
            if (firstPh) firstPh.remove();
            const nextPh = grid.querySelector('.game36-row-placeholder');
            if (nextPh) grid.insertBefore(row, nextPh);
            else grid.appendChild(row);
            if (stickToBottom) sc.scrollTop = sc.scrollHeight;   // 自動捲到最新列

            // 逐格翻牌染色（只翻有實字的格；空白格永遠保持中性空格外觀）
            for (let i = 0; i < GRID_COLS; i++) {
                if (padGuess[i] === ' ') continue;
                const c = cells[i];
                setTimeout(() => {
                    c.classList.add('reveal');
                    const cls = result[i] === 'green' ? 'g-green' : result[i] === 'yellow' ? 'g-blue' : 'g-gray';
                    c.classList.add(cls);
                }, i * FLIP_STEP_MS);
            }

            // 翻牌收尾：只有玩家手動輸入才播成功／失敗音效（自動出句每 2 秒一句，不加音效打擾）
            setTimeout(() => {
                if (isManual && window.SoundManager) {
                    if (!winThis && result.every(r => r === 'gray')) {
                        if (window.SoundManager.playFailure) window.SoundManager.playFailure();
                    } else if (!winThis && result.some(r => r === 'green')) {
                        if (window.SoundManager.playSuccess) window.SoundManager.playSuccess();
                    }
                }
                if (winThis) this.gameOver(true, '');
            }, GRID_COLS * FLIP_STEP_MS + 260);
        },

        // ========================================================
        // 自動出句（取代舊的詩句轉輪）
        // ========================================================
        // ── 排程下一句候選詩出現；全部出完、已獲勝或遊戲停止就不再排程 ──
        _scheduleNextAutoLine: function (delay) {
            clearTimeout(this.autoTimer);
            this.autoTimer = null;
            if (!this.isActive || this.finishing || this.autoIndex >= this.pool.length) return;
            this.autoTimer = setTimeout(() => this._autoTick(), delay === undefined ? AUTO_LINE_INTERVAL_MS : delay);
        },

        // ── 把候選池的下一句送進題目區（玩家已手動輸入過的句子直接略過；手動輸入視窗開著時暫停）──
        _autoTick: function () {
            this.autoTimer = null;
            if (!this.isActive || this.finishing) return;
            // 輸入視窗上的藍字線索是開窗當下的快照，視窗開著時題目區不該再變動，所以先暫停出句
            if (!this.manualOpen) {
                while (this.autoIndex < this.pool.length && this.guessedLines.has(this.pool[this.autoIndex])) {
                    this.autoIndex++;
                }
                if (this.autoIndex >= this.pool.length) return;
                this._submitGuess(this.pool[this.autoIndex++], false);
            }
            this._scheduleNextAutoLine();
        },

        // ── 停止自動出句 ──
        _stopAutoLines: function () {
            if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
        },

        // ========================================================
        // 計時（僅影響分數，時間到不失敗）
        // ========================================================
        // ── 啟動倒數計時（每 100ms 更新一次計時環；時間到只停止加成，不會判失敗）──
        _startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.updateTimerRing(1);
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - elapsed / duration;
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    clearInterval(this.timerInterval);   // 只停止時間加成，不結束遊戲
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        /**
         * 讀取計時框的基準色（來源：theme_xuanzhi.css 的 --fm-timer-* 變數）。
         * 解析成 { h, s, l }；解析失敗時回退到 fallback，確保計時框仍有可見顏色。
         * 與 scoreManager.js 的 getStarBaseColor() 同一套「以 CSS 變數為基準色」的做法。
         */
        getTimerBaseColor: function (varName, fallback) {
            try {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue(varName).trim();
                const m = raw.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
                if (m) return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
            } catch (e) { /* 忽略解析錯誤，改用後備色 */ }
            return fallback;
        },

        // ── 更新計時外框 SVG 矩形的描邊長度與顏色；mode='win' 時為得分結算動畫（金色漸亮），
        //    平時為倒數模式（朱紅色隨剩餘時間變化透明度）──
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game36-timer-path');
            const container = document.getElementById('game36-grid-viewport');
            if (!rect || !container) return;
            const w = container.offsetWidth, h = container.offsetHeight;
            // ⚠️ .game36-grid-viewport 的尺寸定義在 game36.css（loadCSS() 動態載入），
            //   青雲梯零延遲同步呼叫時該檔可能還在下載，量到 0 就整組跳過不畫，
            //   等下一次 100ms tick 量到合理值再補上，避免把 SVG 環先設成 0×0
            //   （詳見 game40.js renderBoard 的同類根因說明）。
            if (!w || !h) return;
            const svg = document.getElementById('game36-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            const rw = w - 10, rh = h - 10;
            if (rw < 0 || rh < 0) return;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);
            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                // 色相／飽和度取自主題金黃 --fm-timer-gold；亮度隨剩餘比例掃動（base.l-15 → base.l+5），
                // 並以 25 為亮度保底避免主題值過暗時變黑。
                const base = this.getTimerBaseColor('--fm-timer-gold', { h: 45, s: 95, l: 70 });
                const lum = Math.max(25, Math.round(base.l - 15 + 20 * clamped));
                rect.style.stroke = `hsl(${base.h}, ${base.s}%, ${lum}%)`;
            } else {
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 色相／飽和度／亮度取自主題朱紅 --fm-timer-red；透明度隨消逝比例掃動（5% → 50%）。
                const base = this.getTimerBaseColor('--fm-timer-red', { h: 0, s: 90, l: 50 });
                const alpha = Math.round(5 + 45 * elapsed);
                rect.style.stroke = `hsla(${base.h}, ${base.s}%, ${base.l}%, ${alpha}%)`;
            }
        },

        // ========================================================
        // 詩詞資訊（依提示模式 / 勝利揭曉）
        // ========================================================
        // ── 顯示詩詞資訊列：reveal=true 時（獲勝後）完整揭曉標題/朝代/作者並可點擊開詩詞詳情；
        //    reveal=false 時依難度設定的 hint 類型只顯示局部提示或完全不顯示 ──
        _showPoemInfo: function (reveal) {
            const el = document.getElementById('game36-poem-info');
            if (!this.targetPoem) { el.textContent = ''; return; }
            const p = this.targetPoem;
            let title = p.title || '';
            if (title.length > 8) title = title.substring(0, 8) + '…';
            if (reveal) {
                el.textContent = `${title} / ${p.dynasty} / ${p.author}`;
                el.dataset.poemId = p.id;
                el.onclick = () => { if (window.PoemDialog) window.PoemDialog.openById(p.id); };
                el.style.cursor = 'pointer';
            } else {
                const hint = this.settings.hint;
                if (hint === 'title') el.textContent = `${title} / ${p.author}`;
                else if (hint === 'dynasty') el.textContent = `${p.dynasty}`;
                else el.textContent = '';
                el.onclick = null;
                el.style.cursor = 'default';
            }
        },

        // ========================================================
        // 勝利
        // ========================================================
        /**
         * 判定勝負 —— 全 39 款遊戲統一的結算入口（契約見 gameContract.js）。
         *
         * ⚠️ 本作沒有失敗條件：時間到只是停止時間加成，不會結束遊戲，
         *    因此 win 恆為 true、reason 恆為空字串。
         *    參數仍與其餘 38 款保持一致 —— 青雲梯、考試與共用工具
         *    是以「所有遊戲都長一樣」為前提在呼叫的，少一個參數就是一個例外，
         *    而例外正是 game13 那類災情的來源。
         *
         * 2026-09-11 由 _win() 更名（原本是私有函式，物件上看不出結算入口）。
         */
        // ⚠️ 本作沒有失敗條件，全站只有一處呼叫點且固定傳 win=true（見 _submitGuess）。
        gameOver: function (win, reason) {
            if (this.timerInterval) clearInterval(this.timerInterval);
            this._stopAutoLines();
            this._showPoemInfo(true);

            window.FMGame.gameOver(this, win, reason || '', {
                gameNo: 36,
                gameKey: 'game36',
                anim: {
                    timerContainerId: 'game36-grid-viewport',
                    scoreElementId: 'game36-score',
                    heartsSelector: '#game36-no-hearts'   // 本作無紅心，選不到 → 直接跳過紅心加成
                },
                setButtons: (win) => {
                    document.getElementById('game36-newGame-btn').disabled = win;
                }
            });
        },

        // ========================================================
        // 手動輸入彈窗
        // ========================================================
        // ── 開啟手動輸入彈窗：先渲染上排「藍字提示」（各位置目前已知的藍字集合），再顯示輸入框並聚焦 ──
        _openManualDialog: function () {
            if (this.finishing || !this.isActive) return;
            this.manualOpen = true;
            // 上排：藍字提示（每格顯示位置 i 曾出現的藍字集合）
            const blueRow = document.getElementById('game36-manual-blue-row');
            blueRow.innerHTML = '';
            blueRow.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${GRID_CELL}px)`;
            for (let i = 0; i < GRID_COLS; i++) {
                const c = document.createElement('div');
                c.className = 'game36-cell game36-manual-blue-cell';
                c.style.width = GRID_CELL + 'px';
                c.style.height = GRID_CELL + 'px';
                const blues = this.solvedBlue[i];
                if (blues && blues.size) {
                    c.classList.add('g-blue');
                    const arr = Array.from(blues);
                    c.textContent = arr.join('');
                    // 依字數縮字體：1 字大字；2～4 字每行 2 字；5～6 字每行 3 字；更多再縮小
                    const ratio = arr.length === 1 ? 0.85 : arr.length <= 4 ? 0.42 : arr.length <= 6 ? 0.30 : 0.26;
                    const font = Math.round(GRID_CELL * ratio);
                    c.style.fontSize = font + 'px';
                }
                blueRow.appendChild(c);
            }
            document.getElementById('game36-manual-overlay').classList.remove('hidden');
            const input = document.getElementById('game36-manual-input');
            input.value = '';
            setTimeout(() => input.focus(), 50);
        },

        // ── 關閉手動輸入彈窗 ──
        _closeManualDialog: function () {
            this.manualOpen = false;
            const ov = document.getElementById('game36-manual-overlay');
            if (ov) ov.classList.add('hidden');
        },

        // ── 提交手動輸入的答案：去除標點/空白後，多於 7 字只取前 7 字，交由 _submitGuess 走與自動出句相同的判定流程 ──
        _submitManualInput: function () {
            const input = document.getElementById('game36-manual-input');
            const raw = (input.value || '').trim();
            // 去除標點與空白，不限字數；不管輸入幾個字都取前 7 字判定（要求 §1）
            const clean = raw.replace(/[，。？！、：；「」『』\s]/g, '');
            if (!clean.length) {
                input.classList.add('game36-manual-input-error');
                setTimeout(() => input.classList.remove('game36-manual-input-error'), 500);
                return;
            }
            // > 7 字取前 7 字；< 7 字交給 _padCenter7 補齊置中
            const guess = clean.length > 7 ? clean.slice(0, 7) : clean;
            this._closeManualDialog();
            // 手動輸入走 _submitGuess 同樣的流程（isManual=true：計次、可獲勝）
            // 若題目區已出現過相同字串（自動或先前手動），仍算一次（先從 guessedLines 移除，避免被去重擋掉）
            this.guessedLines.delete(guess);
            this._submitGuess(guess, true);
        },

        // ========================================================
        // 網格手指拖曳＋慣性（移植 author_bio.js setupMomentumScroll）
        // ========================================================
        _setupGridMomentumScroll: function (container) {
            let isDown = false, startY, scrollTop, velocity = 0, lastY = 0, lastTime = 0, momentumID = null;
            const scale = () => (window.stageScale || 1);
            const startInertia = () => {
                const friction = 0.95;
                const step = () => {
                    if (Math.abs(velocity) < 0.1) { cancelAnimationFrame(momentumID); return; }
                    container.scrollTop -= velocity;
                    velocity *= friction;
                    momentumID = requestAnimationFrame(step);
                };
                momentumID = requestAnimationFrame(step);
            };
            container.addEventListener('mousedown', (e) => {
                isDown = true;
                startY = e.pageY;
                scrollTop = container.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.pageY; lastTime = Date.now();
            });
            const endDrag = () => { if (!isDown) return; isDown = false; startInertia(); };
            container.addEventListener('mouseleave', endDrag);
            container.addEventListener('mouseup', endDrag);
            container.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                container.scrollTop = scrollTop - (e.pageY - startY) / scale();
                const now = Date.now(), dt = now - lastTime;
                if (dt > 0) { velocity = (e.pageY - lastY) / scale() * 0.8; lastTime = now; lastY = e.pageY; }
            });
            container.addEventListener('touchstart', (e) => {
                isDown = true;
                startY = e.touches[0].pageY;
                scrollTop = container.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.touches[0].pageY; lastTime = Date.now();
            }, { passive: true });
            container.addEventListener('touchmove', (e) => {
                if (!isDown) return;
                container.scrollTop = scrollTop - (e.touches[0].pageY - startY) / scale();
                const now = Date.now(), dt = now - lastTime;
                if (dt > 0) { velocity = (e.touches[0].pageY - lastY) / scale() * 0.8; lastTime = now; lastY = e.touches[0].pageY; }
            }, { passive: true });
            container.addEventListener('touchend', endDrag);
        },

        // ========================================================
        // 工具
        // ========================================================
        // ── 去除詩句中的標點符號與空白，僅保留純文字（用於等長比對、生成候選池）──
        _strip: function (s) {
            return (s || '').replace(/[，。？！、：；「」『』\s]/g, '');
        },
    };

    window.Game36 = Game36;

    // URL 自動啟動（?game=36）
    document.addEventListener('DOMContentLoaded', () => {
        if (new URLSearchParams(window.location.search).get('game') === '36') {
            setTimeout(() => {
                if (window.Game36) window.Game36.show();
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 50);
        }
    });

})();
