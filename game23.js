(function () {
    // ============================================================
    // 遊戲二十三：縱橫集句 (Verses Woven in Crossword)
    // 9×9 交叉填字：中央軸線置主句，每個字延伸出一條副句（共用該字），
    // 剩餘空格依難度填入干擾字，再以拼圖切割／打亂／拖曳組裝。
    //
    // 規格要點：
    //   ① 棋盤固定 9×9，主句置於第 5 行（橫）或第 5 欄（直）
    //   ② 副句沿主句的垂直軸向插入，與主句共用對應的字格
    //   ③ 干擾字填入指定數量的剩餘空格
    //   ④ 切割／拖曳／自動置換／復原／暫存區皆繼承 game22 的設計
    //   ⑤ 勝利判定：逐格比對 expected 矩陣
    // ============================================================

    const GRID_SIZE = 9;
    const MIDDLE_IDX = 4;             // 0-based 第 5 行/欄
    const CELL_PX = 50;               // 9×42 = 378 寬，可放入 500 舞台
    const HOLD_CELL_PX = 24;
    const HISTORY_LIMIT = 20;
    const DRAG_THRESHOLD = 3;

    // ⚠️ 所有形狀必須包含 [0,0]，否則切割掃描會在錨點留下無人認領的字元。
    // L4 = [[0,1],[1,0],[1,1]] 違反此規則已移除。
    const SHAPES = {
        '1x1': [[0, 0]],
        '1x2H': [[0, 0], [0, 1]],
        '1x2V': [[0, 0], [1, 0]],
        '1x3H': [[0, 0], [0, 1], [0, 2]],
        '1x3V': [[0, 0], [1, 0], [2, 0]],
        '1x4H': [[0, 0], [0, 1], [0, 2], [0, 3]],
        '1x4V': [[0, 0], [1, 0], [2, 0], [3, 0]],
        '2x2': [[0, 0], [0, 1], [1, 0], [1, 1]],
        'L1': [[0, 0], [0, 1], [1, 0]],
        'L2': [[0, 0], [0, 1], [1, 1]],
        'L3': [[0, 0], [1, 0], [1, 1]]
    };
    const SHAPE_AREA = {
        '1x1': 1, '1x2H': 2, '1x2V': 2, '1x3H': 3, '1x3V': 3,
        '1x4H': 4, '1x4V': 4, '2x2': 4, 'L1': 3, 'L2': 3, 'L3': 3
    };

    const Game23 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,

        timer: 200, maxTimer: 200,
        timerInterval: null,
        startTime: null,
        score: 0,
        gameStartTime: null,

        currentPoem: null,
        mainLine: '',                 // 主句字串
        mainOrientation: 'H',         // 'H' 橫 or 'V' 直
        expected: null,               // expected[r][c]：預期字元 或 null（空）
        crossCells: null,             // crossCells[r][c]：true = 主副句交叉格
        mainCells: null,              // mainCells[r][c]：true = 主句格
        pieces: [],
        gridState: null,
        holdPieces: [],
        hintCharRevealed: 0,
        hintDelayHandle: null,
        hintTimer: null,
        _hintSession: 0,

        history: [],

        container: null,
        gridEl: null,
        holdEl: null,
        hintEl: null,

        drag: null,
        _pieceIdSeq: 1,
        _emptyHintTimer: null,    // 顯示地圖空區域的計時器
        _showEmptyHintsFlag: false,// true = 空白格已顯示淡灰色提示

        // ---- 難度設定 ----
        // poemType       : '五言' 固定五言主句；'七言' 隨機五言或七言（同 game21）
        // mainOrient     : 'H' 橫向固定 / 'random' 隨機
        // subMinRating   : 副句最低評分（傳給 getSharedBarLine 的 minRating）
        // decoyCharCount : 干擾字數量
        // hintCharCount  : 提示字數（999=全顯，0=不顯示）
        // hintLineDelay  : 提示行延遲秒數（999=永不）
        // showHintInGrid : 主句行/欄底色 + 交叉格鑽石標記
        // minPieceArea   : 切割最小片格數
        // showEmptyDelay : N秒後在空白格顯示25%灰色提示（0=不顯示）
        difficultySettings: {
            '小學': {
                timeLimit: 120, poemMinRating: 6, poemType: '五言', mainOrient: 'H',
                subMinRating: 5, hintLineDelay: 0, hintCharCount: 999, showHintInGrid: true,
                decoyCharCount: 0, minPieceArea: 4, showEmptyDelay: 10
            },
            '中學': {
                timeLimit: 150, poemMinRating: 5, poemType: '五言', mainOrient: 'H',
                subMinRating: 4, hintLineDelay: 10, hintCharCount: 5, showHintInGrid: true,
                decoyCharCount: 5, minPieceArea: 3, showEmptyDelay: 30
            },
            '高中': {
                timeLimit: 200, poemMinRating: 4, poemType: '七言', mainOrient: 'random',
                subMinRating: 3, hintLineDelay: 20, hintCharCount: 4, showHintInGrid: true,
                decoyCharCount: 7, minPieceArea: 2, showEmptyDelay: 60
            },
            '大學': {
                timeLimit: 250, poemMinRating: 3, poemType: '七言', mainOrient: 'random',
                subMinRating: 2, hintLineDelay: 30, hintCharCount: 2, showHintInGrid: false,
                decoyCharCount: 10, minPieceArea: 1, showEmptyDelay: 120
            },
            '研究所': {
                timeLimit: 300, poemMinRating: 3, poemType: '七言', mainOrient: 'random',
                subMinRating: 1, hintLineDelay: 999, hintCharCount: 0, showHintInGrid: false,
                decoyCharCount: 14, minPieceArea: 1, showEmptyDelay: 0
            }
        },

        loadCSS: function () {
            if (!document.getElementById('game23-css')) {
                const link = document.createElement('link');
                link.id = 'game23-css';
                link.rel = 'stylesheet';
                link.href = 'game23.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game23-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game23-container');
            this.gridEl = document.getElementById('game23-grid');
            this.holdEl = document.getElementById('game23-hold');
            this.hintEl = document.getElementById('game23-hint');

            document.getElementById('game23-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game23-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game23-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            document.getElementById('game23-undo-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.undo();
            };
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game23-container';
            div.className = 'game23-overlay hidden';
            div.innerHTML = `
                <div class="game23-header">
                    <div class="game23-score-board">分數: <span id="game23-score">0</span></div>
                    <div class="game23-controls">
                        <button id="game23-undo-btn" class="nav-btn game23-undo-btn" title="復原">↩</button>
                        <button class="game23-difficulty-tag" id="game23-diff-tag">小學</button>
                        <button id="game23-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game23-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game23-sub-header">
                    <span id="game23-orient-icon" class="game23-orient-icon">↔</span>
                    <div id="game23-hint" class="game23-hint"></div>
                </div>
                <div id="game23-poem-info" class="game23-poem-info"></div>
                <div id="game23-area" class="game23-area">
                    <div id="game23-grid-container" class="game23-grid-container">
                        <svg id="game23-timer-ring">
                            <rect id="game23-timer-path" x="4" y="4"></rect>
                        </svg>
                        <div id="game23-grid" class="game23-grid"></div>
                    </div>
                    <div id="game23-hold-wrap" class="game23-hold-wrap">
                        <div class="game23-hold-label">暫存區 <span id="game23-hold-count">0</span></div>
                        <div id="game23-hold" class="game23-hold"></div>
                    </div>
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

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) clearInterval(this.hintTimer);
            if (this.hintDelayHandle) clearTimeout(this.hintDelayHandle);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('縱橫集句', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    const s = this.difficultySettings[selectedLevel];
                    this.maxTimer = s.timeLimit;
                    this.timer = s.timeLimit;
                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    this.startNewGame();
                });
            } else {
                this.container.classList.remove('hidden');
                this.startNewGame();
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game23-diff-tag');
            const retryBtn = document.getElementById('game23-retryGame-btn');
            const newBtn = document.getElementById('game23-newGame-btn');
            if (this.isLevelMode) {
                if (diffTag) {
                    diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                    diffTag.setAttribute('data-level', this.difficulty);
                }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) {
                    diffTag.textContent = this.difficulty;
                    diffTag.setAttribute('data-level', this.difficulty);
                }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },
        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        // 啟動「空白格提示」計時器：N 秒後在 expected==null 的格子顯示淡灰色
        _startEmptyHintTimer: function () {
            this._stopEmptyHintTimer();
            const s = this.difficultySettings[this.difficulty];
            const delay = s.showEmptyDelay || 0;
            if (delay <= 0) return; // 0 = 永不顯示（研究所）
            this._emptyHintTimer = setTimeout(() => {
                this._emptyHintTimer = null;
                if (!this.isActive) return;
                this._showEmptyHintsFlag = true;
                this.renderGrid(); // 只重繪格子層，不重繪暫存區/提示行
            }, delay * 1000);
        },

        // 清除空白格提示計時器
        _stopEmptyHintTimer: function () {
            if (this._emptyHintTimer) {
                clearTimeout(this._emptyHintTimer);
                this._emptyHintTimer = null;
            }
        },

        // 清除拖曳狀態與殘留 ghost
        _clearDrag: function () {
            if (this.drag) {
                if (this.drag.ghost) {
                    try { document.body.removeChild(this.drag.ghost); } catch (_) { }
                    this.drag.ghost = null;
                }
                if (this.drag.el) this.drag.el.style.opacity = '';
                this.drag = null;
            }
            document.querySelectorAll('.game23-piece.dragging').forEach(g => {
                if (g.style.position === 'fixed') {
                    try { document.body.removeChild(g); } catch (_) { }
                }
            });
        },

        stopGame: function () {
            this._clearDrag();
            this._stopEmptyHintTimer();
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) { clearInterval(this.hintTimer); this.hintTimer = null; }
            if (this.hintDelayHandle) { clearTimeout(this.hintDelayHandle); this.hintDelayHandle = null; }
            this._hintSession++;
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        startNewGame: function (levelIndex) {
            this._clearDrag();
            this._stopEmptyHintTimer();
            this._showEmptyHintsFlag = false;
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            document.getElementById('game23-score').textContent = '0';
            if (window.GameMessage) window.GameMessage.hide();
            this.gameStartTime = Date.now();
            this.history = [];

            this.prepareChallenge();
            this.startHintReveal();
            this.startTimer();
            document.getElementById('game23-retryGame-btn').disabled = false;
            document.getElementById('game23-newGame-btn').disabled = false;
        },

        retryGame: function () {
            this._clearDrag();
            this._stopEmptyHintTimer();
            this._showEmptyHintsFlag = false;
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            document.getElementById('game23-score').textContent = '0';
            if (window.GameMessage) window.GameMessage.hide();
            this.history = [];
            this.scramblePieces();
            this.renderAll();
            this.startHintReveal();
            this.startTimer();
            document.getElementById('game23-retryGame-btn').disabled = false;
            document.getElementById('game23-newGame-btn').disabled = false;
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // ------------------------------------------------------------
        // 題目準備：選主句 → 為每字找副句 → 填干擾字 → 切割 → 打亂
        // ------------------------------------------------------------
        prepareChallenge: function () {
            const s = this.difficultySettings[this.difficulty];

            // 1. 主句：poemType '五言' 固定 5 字；'七言' 從 [5,7] 隨機抽（同 game21 邏輯）
            const possibleLens = (s.poemType === '五言') ? [5] : [5, 7];
            const wantLen = possibleLens[Math.floor(Math.random() * possibleLens.length)];
            // 主句方向
            this.mainOrientation = (s.mainOrient === 'H')
                ? 'H'
                : (Math.random() < 0.5 ? 'H' : 'V');

            const ratedPoems = (typeof POEMS !== 'undefined' ? POEMS : [])
                .filter(p => (p.rating || 0) >= s.poemMinRating);
            const validMains = [];
            for (const p of ratedPoems) {
                const lineRatings = p.line_ratings || [];
                const content = p.content || [];
                for (let li = 0; li < content.length; li++) {
                    const clean = this.stripPunct(content[li]);
                    if (clean.length !== wantLen) continue;
                    if ((lineRatings[li] || 0) < s.poemMinRating) continue;
                    if (typeof window.countIsolatedChars === 'function'
                        && window.countIsolatedChars(clean) > 1) continue;
                    validMains.push({ poem: p, clean });
                }
            }
            if (validMains.length === 0) {
                for (const p of ratedPoems) {
                    for (const line of (p.content || [])) {
                        const clean = this.stripPunct(line);
                        if (clean.length === wantLen) validMains.push({ poem: p, clean });
                    }
                }
            }
            if (validMains.length === 0) {
                alert('找不到符合條件的詩詞。');
                return;
            }
            const pickIdx = this.isLevelMode
                ? (this.currentLevelIndex * 6151) % validMains.length
                : Math.floor(Math.random() * validMains.length);
            const chosen = validMains[pickIdx];
            this.currentPoem = chosen.poem;
            this.mainLine = chosen.clean;

            // 2. 建 expected / crossCells / mainCells
            this.expected = [];
            this.crossCells = [];
            this.mainCells = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                this.expected.push(new Array(GRID_SIZE).fill(null));
                this.crossCells.push(new Array(GRID_SIZE).fill(false));
                this.mainCells.push(new Array(GRID_SIZE).fill(false));
            }

            // 主句置於中軸：橫向→第 MIDDLE_IDX 行；直向→第 MIDDLE_IDX 欄
            // 為了讓主句置中，起始偏移 = (GRID_SIZE - wantLen) / 2
            const startOffset = Math.floor((GRID_SIZE - wantLen) / 2);
            const mainPositions = [];
            for (let i = 0; i < wantLen; i++) {
                const r = (this.mainOrientation === 'H') ? MIDDLE_IDX : (startOffset + i);
                const c = (this.mainOrientation === 'H') ? (startOffset + i) : MIDDLE_IDX;
                this.expected[r][c] = this.mainLine[i];
                this.mainCells[r][c] = true;
                mainPositions.push({ r, c, ch: this.mainLine[i] });
            }

            // 3. 副句：對主句的每個字 ch 找一條含 ch 的詩句，垂直方向插入
            const usedLines = new Set([this.mainLine]);
            const _dbgSubLines = []; // 供 console debug 使用
            for (const pos of mainPositions) {
                const subLine = window.getSharedBarLine(pos.ch, {
                    minLen: 4, maxLen: 9,
                    excludePoemId: this.currentPoem.id,
                    excludeLines: usedLines,
                    preferMid: true,
                    minRating: s.subMinRating || 0   // 優先挑高評分副句
                });
                if (!subLine) continue;
                usedLines.add(subLine);
                // 找 ch 在 subLine 中的位置（取最接近中段者）
                const mid = subLine.length / 2;
                let bestIdx = -1, bestDist = Infinity;
                for (let k = 0; k < subLine.length; k++) {
                    if (subLine[k] === pos.ch) {
                        const d = Math.abs(k - mid);
                        if (d < bestDist) { bestDist = d; bestIdx = k; }
                    }
                }
                if (bestIdx < 0) continue;
                // 副句方向 = 主句方向的垂直方向
                const subOrient = (this.mainOrientation === 'H') ? 'V' : 'H';
                // 副句起始位置：使 subLine[bestIdx] 落在 (pos.r, pos.c)
                let startR, startC;
                if (subOrient === 'V') {
                    startR = pos.r - bestIdx;
                    startC = pos.c;
                } else {
                    startR = pos.r;
                    startC = pos.c - bestIdx;
                }
                // 邊界檢查與截斷：只放入能放進 9×9 的部分
                for (let k = 0; k < subLine.length; k++) {
                    const rr = (subOrient === 'V') ? (startR + k) : startR;
                    const cc = (subOrient === 'V') ? startC : (startC + k);
                    if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) continue;
                    const ch = subLine[k];
                    if (this.expected[rr][cc] != null) {
                        // 若已有字且不相符 → 跳過該格
                        if (this.expected[rr][cc] !== ch) continue;
                        // 字相符 → 標為交叉格
                        if (this.mainCells[rr][cc]) this.crossCells[rr][cc] = true;
                    } else {
                        this.expected[rr][cc] = ch;
                    }
                }
                // 收集 debug 資訊
                _dbgSubLines.push({ mainCh: pos.ch, mainR: pos.r, mainC: pos.c, subLine, crossIdx: bestIdx, subOrient });
            }

            // 4. 干擾字：填入空白格的子集
            const emptyPositions = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (this.expected[r][c] == null) emptyPositions.push({ r, c });
                }
            }
            // 隨機洗牌
            for (let i = emptyPositions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [emptyPositions[i], emptyPositions[j]] = [emptyPositions[j], emptyPositions[i]];
            }
            const usedCharSet = new Set();
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (this.expected[r][c] != null) usedCharSet.add(this.expected[r][c]);
                }
            }
            const decoyCount = Math.min(s.decoyCharCount, emptyPositions.length);
            const decoyChars = this.pickDecoyChars(decoyCount, usedCharSet);
            const decoySet = new Set(); // 供 debug 使用：記錄干擾字位置
            for (let i = 0; i < decoyChars.length; i++) {
                const pos = emptyPositions[i];
                this.expected[pos.r][pos.c] = decoyChars[i];
                decoySet.add(pos.r + ',' + pos.c);
            }

            // 詩詞資訊
            let title = this.currentPoem.title;
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const info = document.getElementById('game23-poem-info');
            info.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            info.onclick = () => {
                if (window.PoemDialog) window.PoemDialog.openById(this.currentPoem.id);
            };
            // 開局先隱藏詩名（避免直接看作者推題目作弊）
            // 解鎖時機：① 上方提示字完全顯示  ② 玩家過關
            info.style.visibility = 'hidden';
            // 方向指示
            const orient = document.getElementById('game23-orient-icon');
            if (orient) orient.textContent = (this.mainOrientation === 'H') ? '↔' : '↕';

            // === Console Debug：在切割前輸出完整題目資訊 ===
            this._debugLogPuzzle(_dbgSubLines, decoySet, decoyChars);

            this.cutPieces();
            // 啟動「顯示空白格提示」計時器
            this._startEmptyHintTimer();
            this.scramblePieces();
            this.renderAll();
        },

        // ------------------------------------------------------------
        // Debug 輸出：在 console 顯示題目全貌與解題說明
        // ------------------------------------------------------------
        // subLines  : 副句資訊陣列（建立時收集）
        // decoySet  : 干擾字位置 Set（'r,c' 格式）
        // decoyChars: 干擾字元陣列（用於列表顯示）
        _debugLogPuzzle: function (subLines, decoySet, decoyChars) {
            const G = GRID_SIZE;
            const orientLabel = this.mainOrientation === 'H' ? '↔ 橫向（第5列）' : '↕ 直向（第5欄）';
            const poem = this.currentPoem;

            // ── 1. 主句資訊 ──────────────────────────────────────
            console.group('%c🀄 GAME23 縱橫集句 — 題目解析', 'color:#f0c040;font-size:14px;font-weight:bold');
            console.log(`%c【主句】「${this.mainLine}」`, 'color:#f0c040;font-size:13px;font-weight:bold');
            console.log(`  出自：《${poem.title}》${poem.dynasty} · ${poem.author}`);
            console.log(`  方向：${orientLabel}，共 ${this.mainLine.length} 字`);

            // ── 2. 副句列表 ──────────────────────────────────────
            console.group(`%c【副句】共 ${subLines.length} 條（垂直穿過主句的各字）`, 'color:#80e0ff;font-size:12px');
            subLines.forEach(({ mainCh, mainR, mainC, subLine, crossIdx, subOrient }) => {
                const marked = subLine.split('').map((ch, i) =>
                    i === crossIdx ? `[${ch}]` : ch
                ).join('');
                const axisLabel = subOrient === 'V'
                    ? `欄 ${mainC} 垂直放置，[${mainCh}] 在 row${mainR} 與主句交叉`
                    : `列 ${mainR} 水平放置，[${mainCh}] 在 col${mainC} 與主句交叉`;
                console.log(`  「${mainCh}」← ${marked}   （${axisLabel}）`);
            });
            console.groupEnd();

            // ── 3. 9×9 格子視覺化 ────────────────────────────────
            // 圖例：★=主句  ◆=主副交叉  ·=干擾  　=副句  □=空格
            console.group('%c【9×9 格局圖】★主句  ◆交叉  ·干擾  　副句  □空格', 'color:#a0ffa0;font-size:12px');
            const colHeader = '      col: ' + Array.from({ length: G }, (_, i) => String(i).padStart(2)).join('');
            console.log('%c' + colHeader, 'color:#666');
            for (let r = 0; r < G; r++) {
                let line = `  row ${r}: `;
                for (let c = 0; c < G; c++) {
                    const ch = this.expected[r][c];
                    const key = r + ',' + c;
                    if (ch == null) {
                        line += ' □';
                    } else if (this.crossCells[r][c]) {
                        line += `◆${ch}`;           // 主副交叉格
                    } else if (this.mainCells[r][c]) {
                        line += `★${ch}`;           // 主句格
                    } else if (decoySet.has(key)) {
                        line += `·${ch}`;           // 干擾字（以位置Set判斷，最精確）
                    } else {
                        line += ` ${ch}`;           // 副句格
                    }
                }
                // 主句所在列/欄以金色高亮
                const isMainAxis = (this.mainOrientation === 'H' && r === MIDDLE_IDX)
                    || (this.mainOrientation === 'V'); // 直向時每列都可能有主句欄，不特別高亮
                const style = (this.mainOrientation === 'H' && r === MIDDLE_IDX)
                    ? 'color:#f0c040;font-weight:bold'
                    : 'color:#b0b0b0';
                console.log('%c' + line, style);
            }
            console.groupEnd();

            // ── 4. 干擾字列表 ────────────────────────────────────
            if (decoyChars && decoyChars.length > 0) {
                console.log(`%c【干擾字】${decoyChars.length} 個：${decoyChars.join('、')}`, 'color:#ff9060');
                console.log('  ↑ 這些字的格子（標記為 ·）：只要放入任意拼圖片即可，字元不需正確');
            } else {
                console.log('%c【干擾字】本難度無干擾字（小學難度）', 'color:#888');
            }

            // ── 5. 解題說明 ──────────────────────────────────────
            console.group('%c【解題說明】', 'color:#ffb0ff;font-size:12px');
            console.log('  題目是把上方格局圖打散成拼圖片，你需要把它們還原');
            console.log('  ★ 主句格 → 必須放正確字（如「床前明月光」的每個字都要在對的格子）');
            console.log('  ◆ 交叉格 → 同時屬於主句與副句，放對字有特殊音效（三連音）');
            console.log('  　副句格 → 非主句、非干擾的字，同樣必須放在正確位置才能過關');
            console.log('  · 干擾格 → 只要有拼圖片放在此格即可，字元無所謂');
            console.log('  □ 空格   → 此格不需要任何拼圖片，放了也不影響判定');
            console.log('');
            console.log('  ✅ 勝利條件：暫存區清空，且所有★◆及副句格字元完全正確');
            console.log('  ↩  復原按鈕（↩）最多 20 步，拖錯了可以撤銷');
            console.groupEnd();

            console.groupEnd();
        },

        stripPunct: function (s) {
            return (s || '').replace(/[，。？！、：；「」『』\s]/g, '');
        },

        // 隨機從詩庫挑 n 個字元，要求不在 excludeSet 中
        pickDecoyChars: function (n, excludeSet) {
            if (n <= 0) return [];
            const s = this.difficultySettings[this.difficulty];
            const pool = [];
            const seen = new Set();
            const poems = (typeof POEMS !== 'undefined' ? POEMS : [])
                .filter(p => (p.rating || 0) >= s.poemMinRating);
            for (const p of poems) {
                for (const line of (p.content || [])) {
                    const clean = this.stripPunct(line);
                    for (const ch of clean) {
                        if (excludeSet.has(ch)) continue;
                        if (seen.has(ch)) continue;
                        seen.add(ch);
                        pool.push(ch);
                    }
                }
            }
            // 隨機洗牌取前 n
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            return pool.slice(0, n);
        },

        // ------------------------------------------------------------
        // 切割（同 game22）
        // ------------------------------------------------------------
        cutPieces: function () {
            const s = this.difficultySettings[this.difficulty];
            const occupied = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                const row = [];
                for (let c = 0; c < GRID_SIZE; c++) row.push(this.expected[r][c] == null);
                occupied.push(row);
            }
            this.pieces = [];
            this._pieceIdSeq = 1;

            const shapeKeys = Object.keys(SHAPES).filter(k => SHAPE_AREA[k] >= s.minPieceArea);
            const usedKeys = (this.difficulty === '小學')
                ? ['2x2', '1x4H', '1x4V']
                : shapeKeys;

            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (occupied[r][c]) continue;
                    const tryOrder = this.shuffleCopy(usedKeys).concat(['1x1']);
                    for (const k of tryOrder) {
                        const cells = SHAPES[k];
                        // 安全防護：形狀必須包含錨點 [0,0]
                        if (!cells.some(([dr, dc]) => dr === 0 && dc === 0)) continue;
                        if (this.canPlace(occupied, r, c, cells)) {
                            const chars = cells.map(([dr, dc]) => this.expected[r + dr][c + dc]);
                            const piece = {
                                id: this._pieceIdSeq++,
                                shape: k, cells, chars,
                                anchorRow: r, anchorCol: c,
                                inHold: false,
                                originRow: r, originCol: c
                            };
                            cells.forEach(([dr, dc]) => { occupied[r + dr][c + dc] = true; });
                            this.pieces.push(piece);
                            break;
                        }
                    }
                }
            }
        },

        canPlace: function (occupied, r, c, cells) {
            for (const [dr, dc] of cells) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
                if (occupied[rr][cc]) return false;
            }
            return true;
        },

        shuffleCopy: function (arr) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },

        scramblePieces: function () {
            this.gridState = this.makeEmptyGridState();
            this.holdPieces = [];
            const order = this.shuffleCopy(this.pieces);
            for (const piece of order) {
                piece.inHold = false;
                piece.anchorRow = -1;
                piece.anchorCol = -1;
                let placed = false;
                for (let t = 0; t < 40; t++) {
                    const r = Math.floor(Math.random() * GRID_SIZE);
                    const c = Math.floor(Math.random() * GRID_SIZE);
                    if (this.canPlacePieceOnGrid(piece, r, c, null)) {
                        this.putPieceOnGrid(piece, r, c);
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    outer: for (let r = 0; r < GRID_SIZE; r++) {
                        for (let c = 0; c < GRID_SIZE; c++) {
                            if (this.canPlacePieceOnGrid(piece, r, c, null)) {
                                this.putPieceOnGrid(piece, r, c);
                                placed = true;
                                break outer;
                            }
                        }
                    }
                }
                if (!placed) {
                    piece.inHold = true;
                    this.holdPieces.push(piece);
                }
            }
        },

        makeEmptyGridState: function () {
            const g = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                const row = [];
                for (let c = 0; c < GRID_SIZE; c++) row.push(null);
                g.push(row);
            }
            return g;
        },

        canPlacePieceOnGrid: function (piece, r, c, ignorePieceId) {
            // GAME23：允許放置在 9×9 任意格，不限制 expected 是否為 null
            // 勝利判定只對有 expected 值的格子做字元比對
            for (const [dr, dc] of piece.cells) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
                const occ = this.gridState[rr][cc];
                if (occ != null && occ !== ignorePieceId) return false;
            }
            return true;
        },

        putPieceOnGrid: function (piece, r, c) {
            piece.inHold = false;
            piece.anchorRow = r;
            piece.anchorCol = c;
            for (const [dr, dc] of piece.cells) {
                this.gridState[r + dr][c + dc] = piece.id;
            }
        },

        removePieceFromGrid: function (piece) {
            if (piece.inHold) return;
            for (const [dr, dc] of piece.cells) {
                const rr = piece.anchorRow + dr, cc = piece.anchorCol + dc;
                if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
                    if (this.gridState[rr][cc] === piece.id) this.gridState[rr][cc] = null;
                }
            }
        },

        // ------------------------------------------------------------
        // 渲染
        // ------------------------------------------------------------
        renderAll: function () {
            this.renderGrid();
            this.renderHold();
            this.renderHint();
            setTimeout(() => this.updateTimerRing(1), 0);
        },

        renderGrid: function () {
            const grid = this.gridEl;
            if (!grid) return;
            grid.innerHTML = '';
            grid.style.width = (GRID_SIZE * CELL_PX + 4) + 'px'; //加 4 因為最右邊的答案棒有點凸出去
            grid.style.height = (GRID_SIZE * CELL_PX + 4) + 'px'; //加 4 因為最下面的答案棒有點凸出去

            // ── 空白格提示層（showEmptyDelay 觸發後才顯示）──
            // 用無邊框的淡灰色格子，緊密相鄰，看起來像一大片灰色區域
            if (this._showEmptyHintsFlag) {
                for (let r = 0; r < GRID_SIZE; r++) {
                    for (let c = 0; c < GRID_SIZE; c++) {
                        if (this.expected[r][c] != null) continue; // 只畫空格
                        const hint = document.createElement('div');
                        hint.className = 'game23-cell-empty-hint';
                        hint.style.left = (c * CELL_PX) + 'px';
                        hint.style.top = (r * CELL_PX) + 'px';
                        hint.style.width = CELL_PX + 'px';
                        hint.style.height = CELL_PX + 'px';
                        grid.appendChild(hint);
                    }
                }
            }

            const s = this.difficultySettings[this.difficulty];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (this.expected[r][c] == null) continue;
                    const cellBg = document.createElement('div');
                    cellBg.className = 'game23-cell-bg';
                    cellBg.style.left = (c * CELL_PX) + 'px';
                    cellBg.style.top = (r * CELL_PX) + 'px';
                    cellBg.style.width = CELL_PX + 'px';
                    cellBg.style.height = CELL_PX + 'px';
                    if (s.showHintInGrid && this.mainCells[r][c]) {
                        cellBg.classList.add('main-row');
                    }
                    if (s.showHintInGrid && this.crossCells[r][c]) {
                        cellBg.classList.add('cross-cell');
                        cellBg.textContent = '◆';
                    }
                    grid.appendChild(cellBg);
                }
            }

            this.pieces.forEach(piece => {
                if (piece.inHold) return;
                const el = this.buildPieceEl(piece, CELL_PX);
                this.applyPiecePosition(el, piece);
                grid.appendChild(el);
                piece._el = el;
                this.attachDragHandlers(el, piece);
            });
        },

        pieceHue: function (piece) {
            return Math.floor((piece.id * 137.508) % 360);
        },

        // 計算 polyomino 外框頂點陣列（順時針，[[x,y]...] 格式）
        getPolyominoHullPts: function (cells, cellPx) {
            const p = cellPx;
            const set = new Set(cells.map(([r, c]) => r + ',' + c));
            const edges = [];
            for (const [r, c] of cells) {
                if (!set.has((r - 1) + ',' + c)) edges.push([[c * p, r * p], [(c + 1) * p, r * p]]);
                if (!set.has(r + ',' + (c + 1))) edges.push([[(c + 1) * p, r * p], [(c + 1) * p, (r + 1) * p]]);
                if (!set.has((r + 1) + ',' + c)) edges.push([[(c + 1) * p, (r + 1) * p], [c * p, (r + 1) * p]]);
                if (!set.has(r + ',' + (c - 1))) edges.push([[c * p, (r + 1) * p], [c * p, r * p]]);
            }
            if (!edges.length) return null;
            const nextMap = new Map();
            edges.forEach(([[x1, y1], [x2, y2]]) => nextMap.set(x1 + ',' + y1, [x2, y2]));
            const start = edges[0][0];
            const pts = [start];
            let cur = nextMap.get(start[0] + ',' + start[1]);
            for (let i = 1; i < edges.length; i++) {
                if (!cur || (cur[0] === start[0] && cur[1] === start[1])) break;
                pts.push(cur);
                cur = nextMap.get(cur[0] + ',' + cur[1]);
            }
            return pts;
        },

        // 將頂點陣列轉為含圓角弧線的 SVG path d 字串
        buildPieceOutlinePath: function (cells, cellPx) {
            const pts = this.getPolyominoHullPts(cells, cellPx);
            if (!pts || pts.length < 3) return null;
            const r = Math.max(3, Math.round(cellPx * 0.12));
            const n = pts.length;
            let d = '';
            for (let i = 0; i < n; i++) {
                const p0 = pts[(i - 1 + n) % n];
                const p1 = pts[i];
                const p2 = pts[(i + 1) % n];
                const dx1 = Math.sign(p1[0] - p0[0]), dy1 = Math.sign(p1[1] - p0[1]);
                const dx2 = Math.sign(p2[0] - p1[0]), dy2 = Math.sign(p2[1] - p1[1]);
                const sx = p1[0] - r * dx1, sy = p1[1] - r * dy1;
                const ex = p1[0] + r * dx2, ey = p1[1] + r * dy2;
                if (i === 0) d += `M ${sx} ${sy}`;
                else d += ` L ${sx} ${sy}`;
                const cross = dx1 * dy2 - dy1 * dx2;
                d += ` A ${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${ex} ${ey}`;
            }
            return d + ' Z';
        },

        buildPieceEl: function (piece, cellPx, extraClass) {
            const el = document.createElement('div');
            el.className = 'game23-piece';
            if (extraClass) extraClass.split(' ').forEach(c => c && el.classList.add(c));
            let maxR = 0, maxC = 0;
            for (const [dr, dc] of piece.cells) {
                if (dr > maxR) maxR = dr;
                if (dc > maxC) maxC = dc;
            }
            const w = (maxC + 1) * cellPx, h = (maxR + 1) * cellPx;
            el.style.width = w + 'px';
            el.style.height = h + 'px';

            const hue = this.pieceHue(piece);
            const ns = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(ns, 'svg');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible';
            const pathD = this.buildPieceOutlinePath(piece.cells, cellPx);
            if (pathD) {
                const pathEl = document.createElementNS(ns, 'path');
                pathEl.setAttribute('d', pathD);
                pathEl.setAttribute('fill', `hsla(${hue},55%,30%,0.88)`);
                pathEl.setAttribute('stroke', `hsl(${hue},75%,65%)`);
                pathEl.setAttribute('stroke-width', '2');
                svg.appendChild(pathEl);
            }
            el.appendChild(svg);

            piece.cells.forEach(([dr, dc], i) => {
                const cell = document.createElement('div');
                cell.className = 'game23-piece-cell';
                cell.textContent = piece.chars[i];
                cell.style.cssText =
                    `left:${dc * cellPx}px;top:${dr * cellPx}px;` +
                    `width:${cellPx}px;height:${cellPx}px;` +
                    `font-size:${Math.round(cellPx * 0.8)}px`;
                el.appendChild(cell);
            });
            return el;
        },

        applyPiecePosition: function (el, piece) {
            el.style.left = (piece.anchorCol * CELL_PX) + 'px';
            el.style.top = (piece.anchorRow * CELL_PX) + 'px';
        },

        renderHold: function () {
            const hold = this.holdEl;
            if (!hold) return;
            hold.innerHTML = '';
            this.holdPieces.forEach(piece => {
                const el = this.buildPieceEl(piece, HOLD_CELL_PX, 'hold');
                hold.appendChild(el);
                piece._el = el;
                this.attachDragHandlers(el, piece);
            });
            const cnt = document.getElementById('game23-hold-count');
            if (cnt) cnt.textContent = this.holdPieces.length + '/' + this.pieces.length;
        },

        renderHint: function () {
            if (!this.hintEl) return;
            const len = this.mainLine.length;
            const html = [];
            for (let i = 0; i < len; i++) {
                if (i < this.hintCharRevealed) {
                    html.push(`<span class="game23-hint-char shown">${this.mainLine[i]}</span>`);
                } else {
                    html.push(`<span class="game23-hint-char hidden">_</span>`);
                }
            }
            this.hintEl.innerHTML = html.join('');
            // 提示字全部顯示後解鎖詩名
            if (this.hintCharRevealed >= len) {
                const info = document.getElementById('game23-poem-info');
                if (info) info.style.visibility = '';
            }
        },

        // ------------------------------------------------------------
        // 拖曳：ghost 方式（position:fixed on body），游標偏移決定目標格
        // ghost 的游標接觸點與玩家點擊片的位置相對應（自然手感）
        // ------------------------------------------------------------
        attachDragHandlers: function (el, piece) {
            const onDown = (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                // 每次按下前先清除可能殘留的上一次 ghost
                this._clearDrag();
                const scale = window.stageScale || 1;
                const elRect = el.getBoundingClientRect();
                const oxScreen = e.clientX - elRect.left;
                const oyScreen = e.clientY - elRect.top;
                this.drag = {
                    piece, el,
                    startX: e.clientX, startY: e.clientY,
                    scale, moved: false,
                    fromHold: piece.inHold,
                    ghost: null,
                    oxScreen, oyScreen
                };
                if (el.setPointerCapture && e.pointerId != null) {
                    try { el.setPointerCapture(e.pointerId); } catch (_) { }
                }
            };

            const onMove = (e) => {
                if (!this.drag || this.drag.piece !== piece) return;
                e.preventDefault();
                const d = this.drag;
                const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
                if (!d.moved) {
                    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
                    d.moved = true;
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    const ghost = this.buildPieceEl(piece, CELL_PX);
                    ghost.classList.add('dragging');
                    ghost.style.position = 'fixed';
                    ghost.style.pointerEvents = 'none';
                    ghost.style.zIndex = '9999';
                    ghost.style.transform = `scale(${d.scale})`;
                    ghost.style.transformOrigin = 'top left';
                    // 暫存片 el 使用 HOLD_CELL_PX，ghost 使用 CELL_PX，偏移等比放大
                    const cellRatio = d.fromHold ? (CELL_PX / HOLD_CELL_PX) : 1;
                    d.ghostOffX = d.oxScreen * cellRatio;
                    d.ghostOffY = d.oyScreen * cellRatio;
                    ghost.style.left = (e.clientX - d.ghostOffX) + 'px';
                    ghost.style.top = (e.clientY - d.ghostOffY) + 'px';
                    document.body.appendChild(ghost);
                    d.ghost = ghost;
                    el.style.opacity = '0.25';
                    if (!d.fromHold) this.removePieceFromGrid(piece);
                }
                if (d.ghost) {
                    d.ghost.style.left = (e.clientX - d.ghostOffX) + 'px';
                    d.ghost.style.top = (e.clientY - d.ghostOffY) + 'px';
                }
            };

            const onUp = (e) => {
                if (!this.drag || this.drag.piece !== piece) return;
                const d = this.drag;
                this.drag = null;
                if (d.ghost) { document.body.removeChild(d.ghost); d.ghost = null; }
                el.style.opacity = '';
                if (!d.moved) return;

                const holdWrap = document.getElementById('game23-hold-wrap');
                const holdRect = holdWrap.getBoundingClientRect();
                if (e.clientY >= holdRect.top && e.clientY <= holdRect.bottom
                    && e.clientX >= holdRect.left && e.clientX <= holdRect.right) {
                    this.commitMoveToHold(piece, d);
                    return;
                }
                // 以 ghost 左上角（= 游標 - 偏移）計算目標格
                const ghostOffX = d.ghostOffX || 0;
                const ghostOffY = d.ghostOffY || 0;
                const gridRect = this.gridEl.getBoundingClientRect();
                const scale = d.scale;
                const xInGrid = (e.clientX - ghostOffX - gridRect.left) / scale;
                const yInGrid = (e.clientY - ghostOffY - gridRect.top) / scale;
                const targetCol = Math.round(xInGrid / CELL_PX);
                const targetRow = Math.round(yInGrid / CELL_PX);
                this.commitMoveToGrid(piece, targetRow, targetCol, d);
            };

            el.addEventListener('pointerdown', onDown);
            el.addEventListener('pointermove', onMove);
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onUp);
        },

        commitMoveToGrid: function (piece, targetRow, targetCol, d) {
            const snapshot = this.snapshot();
            const conflictIds = new Set();
            for (const [dr, dc] of piece.cells) {
                const rr = targetRow + dr, cc = targetCol + dc;
                if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) {
                    this.restoreSnapshot(snapshot);
                    this.renderAll();
                    return;
                }
                const occ = this.gridState[rr][cc];
                if (occ != null && occ !== piece.id) conflictIds.add(occ);
            }
            const conflictPieces = this.pieces.filter(p => conflictIds.has(p.id));
            conflictPieces.forEach(p => this.removePieceFromGrid(p));

            this.putPieceOnGrid(piece, targetRow, targetCol);

            for (const cp of conflictPieces) {
                const spot = this.findNearestSpot(cp, targetRow, targetCol);
                if (spot) {
                    this.putPieceOnGrid(cp, spot.r, spot.c);
                } else {
                    cp.anchorRow = -1; cp.anchorCol = -1;
                    cp.inHold = true;
                    this.holdPieces.push(cp);
                }
            }
            const holdIdx = this.holdPieces.indexOf(piece);
            if (holdIdx >= 0) this.holdPieces.splice(holdIdx, 1);

            this.pushHistory(snapshot);
            if (window.SoundManager) {
                // 若落入交叉格且字符正確，使用三連音慶祝
                const idx = piece.cells.findIndex(([dr, dc]) =>
                    this.crossCells[targetRow + dr] && this.crossCells[targetRow + dr][targetCol + dc]);
                if (idx >= 0 && piece.chars[idx] === this.expected[targetRow + piece.cells[idx][0]][targetCol + piece.cells[idx][1]]) {
                    window.SoundManager.playJoyfulTriple();
                } else {
                    window.SoundManager.playSuccessShort();
                }
            }
            this.renderAll();
            if (this.checkWin()) this.handleWin();
        },

        commitMoveToHold: function (piece, d) {
            const snapshot = this.snapshot();
            if (!piece.inHold) {
                this.removePieceFromGrid(piece);
                piece.inHold = true;
                this.holdPieces.push(piece);
                this.pushHistory(snapshot);
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.renderAll();
            } else {
                this.renderAll();
            }
        },

        findNearestSpot: function (piece, originRow, originCol) {
            for (let d = 0; d <= GRID_SIZE * 2; d++) {
                for (let dr = -d; dr <= d; dr++) {
                    for (let dc = -d; dc <= d; dc++) {
                        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
                        const r = originRow + dr, c = originCol + dc;
                        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
                        if (this.canPlacePieceOnGrid(piece, r, c, null)) return { r, c };
                    }
                }
            }
            return null;
        },

        // ------------------------------------------------------------
        // 歷史/復原（與 game22 同）
        // ------------------------------------------------------------
        snapshot: function () {
            return {
                pieces: this.pieces.map(p => ({
                    id: p.id, anchorRow: p.anchorRow, anchorCol: p.anchorCol, inHold: p.inHold
                })),
                holdOrder: this.holdPieces.map(p => p.id)
            };
        },

        pushHistory: function (snap) {
            this.history.push(snap);
            if (this.history.length > HISTORY_LIMIT) this.history.shift();
        },

        restoreSnapshot: function (snap) {
            const byId = new Map(this.pieces.map(p => [p.id, p]));
            this.gridState = this.makeEmptyGridState();
            this.holdPieces = [];
            snap.pieces.forEach(rec => {
                const p = byId.get(rec.id);
                if (!p) return;
                p.anchorRow = rec.anchorRow;
                p.anchorCol = rec.anchorCol;
                p.inHold = rec.inHold;
                if (!p.inHold && p.anchorRow >= 0) {
                    for (const [dr, dc] of p.cells) {
                        const rr = p.anchorRow + dr, cc = p.anchorCol + dc;
                        if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
                            this.gridState[rr][cc] = p.id;
                        }
                    }
                }
            });
            this.holdPieces = snap.holdOrder.map(id => byId.get(id)).filter(Boolean);
        },

        undo: function () {
            if (!this.isActive) return;
            if (this.history.length === 0) return;
            this.restoreSnapshot(this.history.pop());
            this.renderAll();
        },

        // ------------------------------------------------------------
        checkWin: function () {
            if (this.holdPieces.length > 0) return false;
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    const exp = this.expected[r][c];
                    if (exp == null) continue;
                    const pid = this.gridState[r][c];
                    if (pid == null) return false;
                    const piece = this.pieces.find(p => p.id === pid);
                    if (!piece) return false;
                    const idx = piece.cells.findIndex(([dr, dc]) =>
                        piece.anchorRow + dr === r && piece.anchorCol + dc === c);
                    if (idx < 0) return false;
                    if (piece.chars[idx] !== exp) return false;
                }
            }
            return true;
        },

        handleWin: function () {
            if (!this.isActive) return;
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) clearInterval(this.hintTimer);

            // 過關加分：每片拼圖 × getPointA（已套用難度倍率）
            const perPiece = window.ScoreManager.getPointA('game23', this.difficulty);
            this.score += perPiece * this.pieces.length;
            document.getElementById('game23-score').textContent = Math.floor(this.score);

            // 過關解鎖詩名顯示
            const info = document.getElementById('game23-poem-info');
            if (info) info.style.visibility = '';

            const cells = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (this.expected[r][c] == null) continue;
                    const pid = this.gridState[r][c];
                    const piece = this.pieces.find(p => p.id === pid);
                    if (!piece || !piece._el) continue;
                    const idx = piece.cells.findIndex(([dr, dc]) =>
                        piece.anchorRow + dr === r && piece.anchorCol + dc === c);
                    if (idx >= 0) {
                        const cellEls = piece._el.querySelectorAll('.game23-piece-cell');
                        if (cellEls[idx]) cells.push(cellEls[idx]);
                    }
                }
            }
            cells.forEach((el, i) => {
                setTimeout(() => {
                    el.classList.add('win-flash');
                    if (window.SoundManager && i % 5 === 0) {
                        window.SoundManager.playGuzheng(i % 7, 0.6);
                    }
                }, i * 60);
            });
            setTimeout(() => {
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();
            }, cells.length * 60);

            document.getElementById('game23-retryGame-btn').disabled = true;
            document.getElementById('game23-newGame-btn').disabled = true;

            setTimeout(() => {
                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game23',
                    timerContainerId: 'game23-grid-container',
                    scoreElementId: 'game23-score',
                    heartsSelector: null,
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.gameOver(true, '');
                    }
                });
            }, cells.length * 60 + 500);
        },

        startHintReveal: function () {
            if (this.hintTimer) { clearInterval(this.hintTimer); this.hintTimer = null; }
            if (this.hintDelayHandle) { clearTimeout(this.hintDelayHandle); this.hintDelayHandle = null; }
            this._hintSession++;
            const mySession = this._hintSession;
            this.hintCharRevealed = 0;

            const s = this.difficultySettings[this.difficulty];
            if (s.hintCharCount <= 0 || s.hintLineDelay >= 999) {
                this.renderHint();
                return;
            }
            const revealCount = Math.min(s.hintCharCount, this.mainLine.length);
            const reveal = () => {
                if (mySession !== this._hintSession) return;
                if (!this.isActive) return;
                this.hintCharRevealed = revealCount;
                this.renderHint();
            };
            if (s.hintLineDelay <= 0) reveal();
            else this.hintDelayHandle = setTimeout(reveal, s.hintLineDelay * 1000);
            this.renderHint();
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    clearInterval(this.timerInterval);
                    if (this.hintTimer) clearInterval(this.hintTimer);
                    setTimeout(() => this.gameOver(false, '時間到！'), 1000);
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game23-timer-path');
            const container = document.getElementById('game23-grid-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game23-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            const rw = Math.max(0, w - 8);
            const rh = Math.max(0, h - 8);
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);
            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
            const elapsed = 1 - Math.max(0, Math.min(1, ratio));
            rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 23,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game23-retryGame-btn').disabled = true;
                document.getElementById('game23-newGame-btn').disabled = true;
            } else {
                document.getElementById('game23-retryGame-btn').disabled = false;
                document.getElementById('game23-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMessage = () => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? this.score : 0,
                        reason: win ? '' : reason,
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game23', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game23', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        }
    };

    window.Game23 = Game23;

    if (new URLSearchParams(window.location.search).get('game') === '23') {
        setTimeout(() => {
            if (window.Game23) window.Game23.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
