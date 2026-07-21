(function () {
    // ============================================================
    // 遊戲二十二：詩詞拼圖 (Poetry Mosaic)
    // 將一首詩切割成 1×1、1×2、1×3、L型、1×4、2×2 等多格形拼圖片，
    // 打亂後由玩家以拖曳方式組裝回原詩。
    //
    // 規格要點：
    //   ① 棋盤寬度 = 詩句字數（5 或 7），高度 = 詩句行數（4~8）
    //   ② 拼圖片不旋轉，維持切割時原始朝向
    //   ③ 暫存區位於棋盤下方，溢出的片以縮小尺寸顯示
    //   ④ 拖入已有片的格子 → 觸發自動置換（被擠走的片找最近空位或進暫存區）
    //   ⑤ 復原最多 20 步
    //   ⑥ 勝利判定：逐格比對字元（不比對「哪片在哪格」，疊字情況也正確判定）
    // ============================================================

    const CELL_PX = 68;                 // 邏輯像素：每格寬高
    const HOLD_CELL_PX = 28;            // 暫存區縮小尺寸
    const HISTORY_LIMIT = 20;           // 復原步數上限
    const DRAG_THRESHOLD = 3;           // 拖曳啟動所需位移

    // 拼圖片形狀：每種形狀以「相對於左上錨點的格子偏移座標 [row,col]」表示
    // ⚠️ 規則：所有形狀的 cells 必須包含 [0,0]，
    //          否則切割掃描（左→右 上→下）會在錨點格留下無人認領的字元。
    //          L4 (┘) 違反此規則已移除。
    const SHAPES = {
        '1x1': [[0, 0]],
        '1x2H': [[0, 0], [0, 1]],
        '1x2V': [[0, 0], [1, 0]],
        '1x3H': [[0, 0], [0, 1], [0, 2]],
        '1x3V': [[0, 0], [1, 0], [2, 0]],
        '1x4H': [[0, 0], [0, 1], [0, 2], [0, 3]],
        '1x4V': [[0, 0], [1, 0], [2, 0], [3, 0]],
        '2x2': [[0, 0], [0, 1], [1, 0], [1, 1]],
        'L1': [[0, 0], [0, 1], [1, 0]],  // ┌
        'L2': [[0, 0], [0, 1], [1, 1]],  // ┐
        'L3': [[0, 0], [1, 0], [1, 1]]   // └
        // L4 = [[0,1],[1,0],[1,1]] 已移除：不含 [0,0]，會造成錨點字元缺失
    };
    const SHAPE_AREA = {
        '1x1': 1, '1x2H': 2, '1x2V': 2, '1x3H': 3, '1x3V': 3,
        '1x4H': 4, '1x4V': 4, '2x2': 4, 'L1': 3, 'L2': 3, 'L3': 3
    };

    const Game22 = {
        // ---- 基本狀態 ----
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,

        // ---- 計時計分 ----
        timer: 180, maxTimer: 180,
        timerInterval: null,
        startTime: null,
        score: 0,
        gameStartTime: null,

        // ---- 題目資料 ----
        currentPoem: null,
        gridRows: 4,
        gridCols: 5,
        expected: null,         // expected[r][c] = 預期字元
        pieces: [],             // 所有拼圖片
        gridState: null,        // gridState[r][c] = 該格現在被哪片佔用（pieceId or null）
        holdPieces: [],         // 暫存區的片（依加入順序）
        hintLine: '',           // 提示行（一句完整詩句）
        hintCharRevealed: 0,
        hintDelayHandle: null,
        hintTimer: null,
        _hintSession: 0,

        // ---- 歷史紀錄 ----
        history: [],

        // ---- DOM 參考 ----
        container: null,
        gridEl: null,
        holdEl: null,
        hintEl: null,

        // ---- 拖曳狀態 ----
        drag: null,
        _pieceIdSeq: 1,

        // ---- 難度設定 ----
        // poemType       : '五言' 固定五言；'七言' 隨機五言或七言（同 game21）
        // hintLineDelay  : 提示行延遲秒數（s）
        // hintCharCount  : 提示字數，999 = 全顯
        // showHintInGrid : 主句格子是否以黃色底色標示
        // minPieceArea   : 切割時的最小片格數（避免過小片）
        // gridLines      : 詩句行數
        difficultySettings: {
            '小學': { timeLimit: 60, poemMinRating: 6, poemType: '五言', hintLineDelay: 10, hintCharCount: 999, showHintInGrid: true, minPieceArea: 3, gridLines: 4 },
            '中學': { timeLimit: 90, poemMinRating: 5, poemType: '五言', hintLineDelay: 20, hintCharCount: 7, showHintInGrid: true, minPieceArea: 2, gridLines: 6 },
            '高中': { timeLimit: 130, poemMinRating: 4, poemType: '七言', hintLineDelay: 30, hintCharCount: 5, showHintInGrid: false, minPieceArea: 2, gridLines: 6 },
            '大學': { timeLimit: 160, poemMinRating: 3, poemType: '七言', hintLineDelay: 40, hintCharCount: 3, showHintInGrid: false, minPieceArea: 2, gridLines: 8 },
            '研究所': { timeLimit: 200, poemMinRating: 3, poemType: '七言', hintLineDelay: 999, hintCharCount: 0, showHintInGrid: false, minPieceArea: 2, gridLines: 8 }
        },

        // ------------------------------------------------------------
        // 動態載入本遊戲專屬 CSS（若尚未載入過才插入 <link>，避免重複載入）
        loadCSS: function () {
            if (!document.getElementById('game22-css')) {
                const link = document.createElement('link');
                link.id = 'game22-css';
                link.rel = 'stylesheet';
                link.href = 'game22.css';
                document.head.appendChild(link);
            }
        },

        // 初始化：載入 CSS、建立 DOM（若尚未建立）、快取常用元素、綁定按鈕事件
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game22-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game22-container');
            this.gridEl = document.getElementById('game22-grid');
            this.holdEl = document.getElementById('game22-hold');
            this.hintEl = document.getElementById('game22-hint');

            document.getElementById('game22-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game22-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game22-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            document.getElementById('game22-undo-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.undo();
            };
        },

        // 建立遊戲主容器 DOM 結構（頂部資訊列、提示列、棋盤區、暫存區），並註冊縮放/定位回呼
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game22-container';
            div.className = 'game22-overlay hidden';
            div.innerHTML = `
                <div class="game22-header">
                    <div class="game22-score-board">分數: <span id="game22-score">0</span></div>
                    <div class="game22-controls">
                        <button id="game22-undo-btn" class="nav-btn game22-undo-btn" title="復原">↩</button>
                        <button class="game22-difficulty-tag" id="game22-diff-tag">小學</button>
                        <button id="game22-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game22-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game22-sub-header">
                    <div id="game22-hint" class="game22-hint"></div>
                </div>
                <div id="game22-poem-info" class="game22-poem-info"></div>
                <div id="game22-area" class="game22-area">
                    <div id="game22-grid-container" class="game22-grid-container">
                        <svg id="game22-timer-ring">
                            <rect id="game22-timer-path" x="4" y="4"></rect>
                        </svg>
                        <div id="game22-grid" class="game22-grid"></div>
                    </div>
                    <div id="game22-hold-wrap" class="game22-hold-wrap">
                        <div class="game22-hold-label">暫存區 <span id="game22-hold-count">0</span></div>
                        <div id="game22-hold" class="game22-hold"></div>
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

        // 對外進入點：初始化並顯示難度選擇畫面
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度／關卡選擇器，選定後套用計時設定並開始新局
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) clearInterval(this.hintTimer);
            if (this.hintDelayHandle) clearTimeout(this.hintDelayHandle);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩詞拼圖', (selectedLevel, levelIndex) => {
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

        // 依「一般難度模式」或「關卡挑戰模式」切換頂部標籤文字與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game22-diff-tag');
            const retryBtn = document.getElementById('game22-retryGame-btn');
            const newBtn = document.getElementById('game22-newGame-btn');
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

        // 進入遊戲時隱藏底層卡片列表，避免與遊戲畫面重疊
        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },
        // 離開遊戲時恢復顯示底層卡片列表
        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        // 清除拖曳狀態與殘留 ghost（任何情況下都可安全呼叫）
        _clearDrag: function () {
            if (this.drag) {
                if (this.drag.ghost) {
                    try { document.body.removeChild(this.drag.ghost); } catch (_) { }
                    this.drag.ghost = null;
                }
                if (this.drag.el) this.drag.el.style.opacity = '';
                this.drag = null;
            }
            // 額外保險：掃描 body 移除所有殘留 ghost（依 class 識別）
            document.querySelectorAll('.game22-piece.dragging').forEach(g => {
                if (g.style.position === 'fixed') {
                    try { document.body.removeChild(g); } catch (_) { }
                }
            });
        },

        // 停止遊戲：清除拖曳/計時器/提示計時器，隱藏容器並還原頁面捲動狀態
        stopGame: function () {
            this._clearDrag();
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

        // ------------------------------------------------------------
        // 開新局 / 重來 / 下一關
        // ------------------------------------------------------------
        // 開新局：重置分數與歷史紀錄，重新抽詩、切割、打亂並啟動計時器與提示揭示
        startNewGame: function (levelIndex) {
            this._clearDrag();
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            document.getElementById('game22-score').textContent = '0';
            if (window.GameMessage) window.GameMessage.hide();
            this.gameStartTime = Date.now();
            this.history = [];

            this.prepareChallenge();
            this.startHintReveal();
            this.startTimer();
            document.getElementById('game22-retryGame-btn').disabled = false;
            document.getElementById('game22-newGame-btn').disabled = false;
        },

        // 重來：沿用同一首詩與同樣的切割結果，只重新打亂拼圖位置（不重新抽詩）
        retryGame: function () {
            this._clearDrag();
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            document.getElementById('game22-score').textContent = '0';
            if (window.GameMessage) window.GameMessage.hide();
            this.history = [];
            // 重來：保持同一首詩、同樣的切割，重新打亂位置
            this.scramblePieces();
            this.renderAll();
            this.startHintReveal();
            this.startTimer();
            document.getElementById('game22-retryGame-btn').disabled = false;
            document.getElementById('game22-newGame-btn').disabled = false;
        },

        // 關卡模式專用：關卡編號 +1 後直接開新局
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // ------------------------------------------------------------
        // 題目準備：取詩 + 建立 expected 字陣 + 切割 + 打亂
        // ------------------------------------------------------------
        // 準備本局題目：依難度抽一首符合行數/字數條件的詩、建立 expected 字元矩陣、
        // 選定提示行、更新詩詞資訊列，最後呼叫切割與打亂
        prepareChallenge: function () {
            const s = this.difficultySettings[this.difficulty];
            const lines = s.gridLines;
            // poemType：'五言' 固定 5 字；'七言' 從 [5,7] 隨機抽（同 game21 邏輯）
            const possibleLens = (s.poemType === '五言') ? [5] : [5, 7];
            const wantCharsPerLine = possibleLens[Math.floor(Math.random() * possibleLens.length)];

            const minChars = lines * wantCharsPerLine;
            const maxChars = lines * wantCharsPerLine;
            const seed = this.isLevelMode ? this.currentLevelIndex : null;
            let pick = null;
            // 三段式退讓
            for (const minR of [s.poemMinRating, Math.max(1, s.poemMinRating - 1), 1]) {
                pick = window.getSharedRandomPoem(minR, lines, lines, minChars, maxChars, '', seed, 'game22');
                if (pick) break;
            }
            // 終極退讓：放寬行數
            if (!pick) {
                pick = window.getSharedRandomPoem(1, Math.max(2, lines - 2), lines + 2, 0, 9999, '', seed, 'game22');
            }
            if (!pick) {
                alert('找不到符合條件的詩詞。');
                return;
            }
            this.currentPoem = pick.poem;
            // 取得 lines 行乾淨字串；若實際行數不同，截取或補
            const cleanLines = pick.lines.slice(0, lines);
            // 對齊每行字數為 wantCharsPerLine（截短／不足則丟棄該行）
            const validLines = cleanLines.filter(ln => ln.length === wantCharsPerLine);
            const actualLines = validLines.length >= 2 ? validLines : cleanLines;
            this.gridRows = actualLines.length;
            this.gridCols = Math.max(...actualLines.map(ln => ln.length));

            // 建 expected 矩陣（不足的格子為 null）
            this.expected = [];
            for (let r = 0; r < this.gridRows; r++) {
                const row = [];
                const ln = actualLines[r] || '';
                for (let c = 0; c < this.gridCols; c++) {
                    row.push(c < ln.length ? ln[c] : null);
                }
                this.expected.push(row);
            }

            // 選一句作為提示行（隨機選一行）
            const hintIdx = Math.floor(Math.random() * actualLines.length);
            this.hintLine = actualLines[hintIdx];
            this.hintLineRow = hintIdx;

            // 詩詞資訊
            let title = this.currentPoem.title;
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const info = document.getElementById('game22-poem-info');
            info.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            info.onclick = () => {
                if (window.PoemDialog) window.PoemDialog.openById(this.currentPoem.id);
            };
            // 開局先隱藏詩名（避免直接看作者推題目作弊）
            // 解鎖時機：① 上方提示字完全顯示  ② 玩家過關
            info.style.visibility = 'hidden';

            // 切割
            this.cutPieces();
            // 打亂
            this.scramblePieces();
            this.renderAll();
        },

        // ------------------------------------------------------------
        // 隨機多格形切割：以貪婪掃描方式覆蓋整個 expected 矩陣
        // ------------------------------------------------------------
        // 將 expected 矩陣切割成多格形拼圖片：由左至右、由上至下掃描，
        // 對每個尚未分配的格子隨機嘗試各種形狀，成功放入即建立一片，最終保底可用 1x1
        cutPieces: function () {
            const s = this.difficultySettings[this.difficulty];
            const rows = this.gridRows, cols = this.gridCols;
            // 標記陣列：true = 已分配
            const occupied = [];
            for (let r = 0; r < rows; r++) {
                const row = [];
                for (let c = 0; c < cols; c++) {
                    // 空格（expected 為 null）視為已分配，跳過
                    row.push(this.expected[r][c] == null);
                }
                occupied.push(row);
            }

            this.pieces = [];
            this._pieceIdSeq = 1;

            // 形狀池依 minPieceArea 過濾
            const shapeKeys = Object.keys(SHAPES).filter(k => SHAPE_AREA[k] >= s.minPieceArea);
            // 小學專屬：只用 2x2 與 1x4
            const usedKeys = (this.difficulty === '小學')
                ? ['2x2', '1x4H', '1x4V']
                : shapeKeys;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (occupied[r][c]) continue;
                    // 嘗試形狀：隨機洗牌後依序試，必有 1x1 保底
                    const tryOrder = this.shuffleCopy(usedKeys).concat(['1x1']);
                    let placed = false;
                    for (const k of tryOrder) {
                        const cells = SHAPES[k];
                        // 安全防護：形狀必須包含錨點 [0,0]，否則跳過
                        if (!cells.some(([dr, dc]) => dr === 0 && dc === 0)) continue;
                        if (this.canPlace(occupied, r, c, cells)) {
                            // 建立片
                            const chars = cells.map(([dr, dc]) => this.expected[r + dr][c + dc]);
                            const piece = {
                                id: this._pieceIdSeq++,
                                shape: k,
                                cells: cells,           // 相對偏移
                                chars: chars,           // 字元（與 cells 同序）
                                anchorRow: r,           // 在棋盤的左上錨點（打亂後會被改）
                                anchorCol: c,
                                inHold: false,
                                originRow: r,           // 原始正確位置（不變）
                                originCol: c
                            };
                            cells.forEach(([dr, dc]) => { occupied[r + dr][c + dc] = true; });
                            this.pieces.push(piece);
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) {
                        // 不應發生（1x1 必能放）
                        occupied[r][c] = true;
                    }
                }
            }
        },

        // 檢查以 (r,c) 為錨點放置指定形狀 cells 時，是否都落在棋盤範圍內且尚未被佔用（切割階段用）
        canPlace: function (occupied, r, c, cells) {
            const rows = occupied.length, cols = occupied[0].length;
            for (const [dr, dc] of cells) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) return false;
                if (occupied[rr][cc]) return false;
            }
            return true;
        },

        // 回傳陣列的隨機打亂複本（Fisher-Yates 洗牌法，不修改原陣列）
        shuffleCopy: function (arr) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },

        // ------------------------------------------------------------
        // 打亂：先將所有片移出棋盤，再依隨機順序逐片嘗試放回；
        //        放不下的片進暫存區
        // ------------------------------------------------------------
        scramblePieces: function () {
            this.gridState = this.makeEmptyGridState();
            this.holdPieces = [];
            // 隨機順序
            const order = this.shuffleCopy(this.pieces);
            for (const piece of order) {
                piece.inHold = false;
                piece.anchorRow = -1;
                piece.anchorCol = -1;
                // 嘗試 30 個隨機位置
                let placed = false;
                for (let t = 0; t < 30; t++) {
                    const r = Math.floor(Math.random() * this.gridRows);
                    const c = Math.floor(Math.random() * this.gridCols);
                    if (this.canPlacePieceOnGrid(piece, r, c, null)) {
                        this.putPieceOnGrid(piece, r, c);
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    // 線性掃描找空位
                    outer: for (let r = 0; r < this.gridRows; r++) {
                        for (let c = 0; c < this.gridCols; c++) {
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
            // 確認原始位置沒被完全保留（避免一開始就解開）：若所有片都在原位則重新打亂
            if (this.holdPieces.length === 0 && this.allPiecesAtOrigin()) {
                this.scramblePieces();
            }
        },

        // 判斷是否所有拼圖片都剛好落在原始（正確）位置——用來避免打亂後意外變回已解答狀態
        allPiecesAtOrigin: function () {
            return this.pieces.every(p => !p.inHold && p.anchorRow === p.originRow && p.anchorCol === p.originCol);
        },

        // 建立一個全為 null 的棋盤佔用狀態矩陣（gridRows × gridCols）
        makeEmptyGridState: function () {
            const g = [];
            for (let r = 0; r < this.gridRows; r++) {
                const row = [];
                for (let c = 0; c < this.gridCols; c++) row.push(null);
                g.push(row);
            }
            return g;
        },

        // 檢查某片以 (r,c) 為錨點放上棋盤是否合法：需在範圍內、對應格非空格（expected 非 null）、
        // 且未被其他片佔用（ignorePieceId 用於「忽略自己」的情境，例如同片重新試放）
        canPlacePieceOnGrid: function (piece, r, c, ignorePieceId) {
            for (const [dr, dc] of piece.cells) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || rr >= this.gridRows || cc < 0 || cc >= this.gridCols) return false;
                // 空格（expected null）不能放
                if (this.expected[rr][cc] == null) return false;
                const occ = this.gridState[rr][cc];
                if (occ != null && occ !== ignorePieceId) return false;
            }
            return true;
        },

        // 將指定片放置到棋盤上 (r,c) 錨點位置，更新片本身狀態與 gridState 佔用標記
        putPieceOnGrid: function (piece, r, c) {
            piece.inHold = false;
            piece.anchorRow = r;
            piece.anchorCol = c;
            for (const [dr, dc] of piece.cells) {
                this.gridState[r + dr][c + dc] = piece.id;
            }
        },

        // 將指定片從棋盤的 gridState 中移除（清空其佔用的格子），不影響片本身的錨點座標
        removePieceFromGrid: function (piece) {
            if (piece.inHold) return;
            for (const [dr, dc] of piece.cells) {
                const rr = piece.anchorRow + dr, cc = piece.anchorCol + dc;
                if (rr >= 0 && rr < this.gridRows && cc >= 0 && cc < this.gridCols) {
                    if (this.gridState[rr][cc] === piece.id) this.gridState[rr][cc] = null;
                }
            }
        },

        // ------------------------------------------------------------
        // 渲染
        // ------------------------------------------------------------
        // 一次重繪棋盤、暫存區、提示列，並在下一個 tick 更新計時圈（等待版面確定尺寸後再量測）
        renderAll: function () {
            this.renderGrid();
            this.renderHold();
            this.renderHint();
            setTimeout(() => this.updateTimerRing(1), 0);
        },

        // 重繪整個棋盤：先畫每格背景（含提示行高亮與已揭示提示字），
        // 再依「彎曲片在底層、直排片在頂層」規則排序並畫出所有在棋盤上的拼圖片
        renderGrid: function () {
            const grid = this.gridEl;
            if (!grid) return;
            grid.innerHTML = '';
            grid.style.width = (this.gridCols * CELL_PX + 4) + 'px';//加 4 因為最右邊的答案棒有點凸出去
            grid.style.height = (this.gridRows * CELL_PX + 4) + 'px';//加 4 因為最下面的答案棒有點凸出去

            // 1. 底層：每格的背景（顯示提示字、提示行高亮）
            const s = this.difficultySettings[this.difficulty];
            for (let r = 0; r < this.gridRows; r++) {
                for (let c = 0; c < this.gridCols; c++) {
                    if (this.expected[r][c] == null) continue;
                    const cellBg = document.createElement('div');
                    cellBg.className = 'game22-cell-bg';
                    cellBg.style.left = (c * CELL_PX) + 'px';
                    cellBg.style.top = (r * CELL_PX) + 'px';
                    cellBg.style.width = CELL_PX + 'px';
                    cellBg.style.height = CELL_PX + 'px';
                    // 提示行底色（showHintInGrid 啟用時）
                    if (s.showHintInGrid && r === this.hintLineRow) {
                        cellBg.classList.add('hint-row');
                        // 已揭示字元同時顯示在格子背景
                        const colInHint = c;
                        if (colInHint < this.hintCharRevealed && this.hintLine[colInHint]) {
                            cellBg.textContent = this.hintLine[colInHint];
                            cellBg.classList.add('hint-char');
                        }
                    }
                    grid.appendChild(cellBg);
                }
            }

            // 2. 拼圖片
            //   ⚠️ 排序規則（外層 = 大類別，內層 = 大小）：
            //     A. 大類別：彎曲片（L / S / T / 2×2 …）→ 先渲染、在底層；
            //                 直排片（1×N 或 N×1）→ 後渲染、在頂層。
            //        因為直排片的 bounding box 就是它自己，不會侵蝕鄰片；
            //        彎曲片的空角落才是造成「相鄰小片被吃掉點擊」的兇手。
            //     B. 同類別內：大先渲、小後渲（小片壓在同類大片之上）。
            //   加上 z-index 保底：直排 200 − size / 彎曲 100 − size，
            //   任何直排永遠壓在任何彎曲之上。
            const isStraight = (p) => {
                if (p.cells.length <= 1) return true;
                const allSameR = p.cells.every(([dr]) => dr === 0);
                const allSameC = p.cells.every(([, dc]) => dc === 0);
                return allSameR || allSameC;
            };
            const onBoard = this.pieces.filter(p => !p.inHold);
            const sorted = onBoard.slice().sort((a, b) => {
                const aBent = !isStraight(a), bBent = !isStraight(b);
                if (aBent !== bBent) return aBent ? -1 : 1;  // 彎曲片先 → 底層
                return b.cells.length - a.cells.length;       // 同類內大先
            });
            sorted.forEach(piece => {
                const el = this.buildPieceEl(piece, CELL_PX);
                this.applyPiecePosition(el, piece);
                el.style.zIndex = (isStraight(piece) ? 200 : 100) - piece.cells.length;
                grid.appendChild(el);
                piece._el = el;
                this.attachDragHandlers(el, piece);
            });
        },

        // 為片配色：以 piece.id 乘黃金角產生均勻分散的 hue
        pieceHue: function (piece) {
            return Math.floor((piece.id * 137.508) % 360);
        },

        // 計算 polyomino 外框多邊形頂點（順時針，SVG 座標）
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
        // cross > 0 = 凸角（外角）sweep=1；cross < 0 = 凹角（L型內角）sweep=0
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
                const cross = dx1 * dy2 - dy1 * dx2; // >0 凸角 <0 凹角
                d += ` A ${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${ex} ${ey}`;
            }
            return d + ' Z';
        },

        // 建立拼圖片 DOM：SVG 圓角外框 + 文字 cell div
        buildPieceEl: function (piece, cellPx, extraClass) {
            const el = document.createElement('div');
            el.className = 'game22-piece';
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
                cell.className = 'game22-piece-cell';
                cell.textContent = piece.chars[i];
                cell.style.cssText =
                    `left:${dc * cellPx}px;top:${dr * cellPx}px;` +
                    `width:${cellPx}px;height:${cellPx}px;` +
                    `font-size:${Math.round(cellPx * 0.55)}px`;
                el.appendChild(cell);
            });
            return el;
        },

        // 依片的棋盤錨點座標（anchorRow/anchorCol）設定其 DOM 元素的 left/top 像素位置
        applyPiecePosition: function (el, piece) {
            el.style.left = (piece.anchorCol * CELL_PX) + 'px';
            el.style.top = (piece.anchorRow * CELL_PX) + 'px';
        },

        // 重繪暫存區：清空後依 holdPieces 順序以縮小尺寸（HOLD_CELL_PX）畫出每片，並更新片數顯示
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
            const cnt = document.getElementById('game22-hold-count');
            if (cnt) cnt.textContent = this.holdPieces.length + '/' + this.pieces.length;
        },

        // 重繪上方提示列：已揭示字元正常顯示，未揭示的以底線佔位符呈現；
        // 提示字全部揭示後解除詩名的 visibility 隱藏
        renderHint: function () {
            if (!this.hintEl) return;
            const len = this.hintLine.length;
            const html = [];
            for (let i = 0; i < len; i++) {
                if (i < this.hintCharRevealed) {
                    html.push(`<span class="game22-hint-char shown">${this.hintLine[i]}</span>`);
                } else {
                    html.push(`<span class="game22-hint-char hidden">_</span>`);
                }
            }
            this.hintEl.innerHTML = html.join('');
            // 提示字全部顯示後解鎖詩名
            if (this.hintCharRevealed >= len) {
                const info = document.getElementById('game22-poem-info');
                if (info) info.style.visibility = '';
            }
        },

        // ------------------------------------------------------------
        // 拖曳：ghost 方式（position:fixed on body），支援棋盤 ↔ 暫存區雙向
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

                    // ghost 在 body 上，使用 CSS scale 縮放至與 stage 相同比例
                    const ghost = this.buildPieceEl(piece, CELL_PX);
                    ghost.classList.add('dragging');
                    ghost.style.position = 'fixed';
                    ghost.style.pointerEvents = 'none';
                    ghost.style.zIndex = '9999';
                    ghost.style.transform = `scale(${d.scale})`;
                    ghost.style.transformOrigin = 'top left';

                    // 計算 ghost 左上角的螢幕位置：
                    // 若為棋盤片：ghost CELL_PX 與 el CELL_PX 相同，直接用偏移
                    // 若為暫存片：el 使用 HOLD_CELL_PX（較小），ghost 使用 CELL_PX，
                    //             需等比放大偏移量（CELL_PX / HOLD_CELL_PX 倍）
                    const cellRatio = d.fromHold ? (CELL_PX / HOLD_CELL_PX) : 1;
                    d.ghostOffX = d.oxScreen * cellRatio;
                    d.ghostOffY = d.oyScreen * cellRatio;

                    ghost.style.left = (e.clientX - d.ghostOffX) + 'px';
                    ghost.style.top = (e.clientY - d.ghostOffY) + 'px';
                    document.body.appendChild(ghost);
                    d.ghost = ghost;

                    // 原始 el 半透明（仍在原位，不移動）
                    el.style.opacity = '0.25';
                    // 棋盤片：從 gridState 移除（讓目標格顯示為空）
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

                const holdWrap = document.getElementById('game22-hold-wrap');
                const holdRect = holdWrap.getBoundingClientRect();
                // 若游標在暫存區 → 進暫存
                if (e.clientY >= holdRect.top && e.clientY <= holdRect.bottom
                    && e.clientX >= holdRect.left && e.clientX <= holdRect.right) {
                    this.commitMoveToHold(piece, d);
                    return;
                }
                // 以 ghost 左上角（= 游標 - 偏移）計算目標格，對齊自然手感
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

        // ------------------------------------------------------------
        // 提交移動：寫入歷史、處理自動置換
        // ------------------------------------------------------------
        // 提交「放到棋盤」的操作：檢查目標位置是否越界（越界則整片彈回原位），
        // 找出與目標形狀重疊的既有片並移除，放置主片後為被擠走的片尋找最近空位（找不到則丟入暫存區），
        // 最後寫入歷史紀錄、重繪並檢查是否已勝利
        commitMoveToGrid: function (piece, targetRow, targetCol, d) {
            const snapshot = this.snapshot();
            // 嘗試直接放到 (targetRow, targetCol)
            const displaced = [];
            // 找出與目標形狀重疊的所有片
            const conflictIds = new Set();
            for (const [dr, dc] of piece.cells) {
                const rr = targetRow + dr, cc = targetCol + dc;
                if (rr < 0 || rr >= this.gridRows || cc < 0 || cc >= this.gridCols
                    || this.expected[rr][cc] == null) {
                    // 越界 → 整片回原位
                    this.restoreSnapshot(snapshot);
                    this.renderAll();
                    return;
                }
                const occ = this.gridState[rr][cc];
                if (occ != null && occ !== piece.id) conflictIds.add(occ);
            }
            // 把衝突片從 grid 移除（待會兒找空位）
            const conflictPieces = this.pieces.filter(p => conflictIds.has(p.id));
            conflictPieces.forEach(p => this.removePieceFromGrid(p));

            // 放置主片
            this.putPieceOnGrid(piece, targetRow, targetCol);

            // 為每個衝突片找最近空位（螺旋外擴）；找不到 → 進暫存區
            for (const cp of conflictPieces) {
                const spot = this.findNearestSpot(cp, targetRow, targetCol);
                if (spot) {
                    this.putPieceOnGrid(cp, spot.r, spot.c);
                    displaced.push({ piece: cp, r: spot.r, c: spot.c });
                } else {
                    cp.anchorRow = -1; cp.anchorCol = -1;
                    cp.inHold = true;
                    this.holdPieces.push(cp);
                }
            }

            // 從暫存區移除（若主片來自暫存）
            const holdIdx = this.holdPieces.indexOf(piece);
            if (holdIdx >= 0) this.holdPieces.splice(holdIdx, 1);

            this.pushHistory(snapshot);
            if (window.SoundManager) window.SoundManager.playSuccessShort();
            this.renderAll();
            if (this.checkWin()) this.handleWin();
        },

        // 提交「放到暫存區」的操作：若片原本在棋盤上，將其移除並加入暫存區並寫入歷史紀錄；
        // 若片本來就在暫存區內移動，則視為無實際變化，僅重繪
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
                // 暫存區內部移動：無變化
                this.renderAll();
            }
        },

        // 螺旋外擴搜尋最近的可容納片的空位（以主片落點為原點）
        findNearestSpot: function (piece, originRow, originCol) {
            const maxDist = this.gridRows + this.gridCols;
            for (let d = 0; d <= maxDist; d++) {
                for (let dr = -d; dr <= d; dr++) {
                    for (let dc = -d; dc <= d; dc++) {
                        if (Math.max(Math.abs(dr), Math.abs(dc)) !== d) continue;
                        const r = originRow + dr, c = originCol + dc;
                        if (r < 0 || r >= this.gridRows || c < 0 || c >= this.gridCols) continue;
                        if (this.canPlacePieceOnGrid(piece, r, c, null)) {
                            return { r, c };
                        }
                    }
                }
            }
            return null;
        },

        // ------------------------------------------------------------
        // 歷史/復原
        // ------------------------------------------------------------
        // 擷取目前所有拼圖片的位置狀態（棋盤座標/是否在暫存區）與暫存區排列順序，供復原功能使用
        snapshot: function () {
            return {
                pieces: this.pieces.map(p => ({
                    id: p.id,
                    anchorRow: p.anchorRow,
                    anchorCol: p.anchorCol,
                    inHold: p.inHold
                })),
                holdOrder: this.holdPieces.map(p => p.id)
            };
        },

        // 將快照推入歷史堆疊，超過 HISTORY_LIMIT 步數上限時捨棄最舊的一筆
        pushHistory: function (snapshot) {
            this.history.push(snapshot);
            if (this.history.length > HISTORY_LIMIT) this.history.shift();
        },

        // 依快照內容還原所有拼圖片的位置與暫存區狀態，並重建 gridState 佔用矩陣
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
                        if (rr >= 0 && rr < this.gridRows && cc >= 0 && cc < this.gridCols) {
                            this.gridState[rr][cc] = p.id;
                        }
                    }
                }
            });
            this.holdPieces = snap.holdOrder.map(id => byId.get(id)).filter(Boolean);
        },

        // 復原上一步操作：從歷史堆疊彈出最近一筆快照並還原、重繪
        undo: function () {
            if (!this.isActive) return;
            if (this.history.length === 0) return;
            const snap = this.history.pop();
            this.restoreSnapshot(snap);
            this.renderAll();
        },

        // ------------------------------------------------------------
        // 勝利判定：逐格字元比對
        // ------------------------------------------------------------
        // 檢查是否已完成拼圖：暫存區必須為空，且棋盤上每一格的實際字元都要與 expected 相符
        // （逐格比對字元本身，而非比對「哪一片」在哪格，因此疊字情況也能正確判定過關）
        checkWin: function () {
            // 暫存區還有片 → 一定還沒贏
            if (this.holdPieces.length > 0) return false;
            for (let r = 0; r < this.gridRows; r++) {
                for (let c = 0; c < this.gridCols; c++) {
                    const exp = this.expected[r][c];
                    if (exp == null) continue;
                    const pid = this.gridState[r][c];
                    if (pid == null) return false;
                    const piece = this.pieces.find(p => p.id === pid);
                    if (!piece) return false;
                    // 找出該格在片內的 chars 索引
                    const idx = piece.cells.findIndex(([dr, dc]) =>
                        piece.anchorRow + dr === r && piece.anchorCol + dc === c
                    );
                    if (idx < 0) return false;
                    if (piece.chars[idx] !== exp) return false;
                }
            }
            return true;
        },

        // 處理過關流程：停止計時、依片數加分、解鎖詩名顯示、播放金光逐格閃爍動畫與音效，
        // 最後呼叫 ScoreManager 播放得分動畫並在完成後進入 gameOver(true, ...)
        handleWin: function () {
            if (!this.isActive) return;
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.hintTimer) clearInterval(this.hintTimer);

            // 過關加分：每片拼圖 × getPointA（已套用難度倍率）
            const perPiece = window.ScoreManager.getPointA('game22', this.difficulty);
            this.score += perPiece * this.pieces.length;
            document.getElementById('game22-score').textContent = Math.floor(this.score);

            // 過關解鎖詩名顯示
            const info = document.getElementById('game22-poem-info');
            if (info) info.style.visibility = '';

            // 金光由左上向右下逐格亮起
            const cells = [];
            for (let r = 0; r < this.gridRows; r++) {
                for (let c = 0; c < this.gridCols; c++) {
                    if (this.expected[r][c] == null) continue;
                    const pid = this.gridState[r][c];
                    const piece = this.pieces.find(p => p.id === pid);
                    if (!piece || !piece._el) continue;
                    const idx = piece.cells.findIndex(([dr, dc]) =>
                        piece.anchorRow + dr === r && piece.anchorCol + dc === c
                    );
                    if (idx >= 0) {
                        const cellEls = piece._el.querySelectorAll('.game22-piece-cell');
                        if (cellEls[idx]) cells.push(cellEls[idx]);
                    }
                }
            }
            cells.forEach((el, i) => {
                setTimeout(() => {
                    el.classList.add('win-flash');
                    if (window.SoundManager && i % 4 === 0) {
                        window.SoundManager.playGuzheng(i % 7, 0.7);
                    }
                }, i * 60);
            });
            setTimeout(() => {
                if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
            }, cells.length * 60);

            document.getElementById('game22-retryGame-btn').disabled = true;
            document.getElementById('game22-newGame-btn').disabled = true;

            setTimeout(() => {
                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game22',
                    timerContainerId: 'game22-grid-container',
                    scoreElementId: 'game22-score',
                    heartsSelector: null,
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.gameOver(true, '');
                    }
                });
            }, cells.length * 60 + 500);
        },

        // ------------------------------------------------------------
        // 提示行揭示
        // ------------------------------------------------------------
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
            const revealCount = Math.min(s.hintCharCount, this.hintLine.length);

            const reveal = () => {
                if (mySession !== this._hintSession) return;
                if (!this.isActive) return;
                this.hintCharRevealed = revealCount;
                this.renderHint();
                // 若 showHintInGrid，重繪格子背景以顯示提示字
                this.renderGrid();
            };

            if (s.hintLineDelay <= 0) {
                reveal();
            } else {
                this.hintDelayHandle = setTimeout(reveal, s.hintLineDelay * 1000);
            }
            this.renderHint();
        },

        // ------------------------------------------------------------
        // 計時器
        // ------------------------------------------------------------
        // 啟動倒數計時器：每 100ms 更新一次計時圈，時間歸零時停止計時並延遲觸發遊戲失敗結算
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

        // 依剩餘時間比例（ratio：1=剛開始，0=時間到）更新計時圈 SVG 的外框尺寸、
        // 虛線位移量（呈現讀秒效果）與顏色（隨時間流逝逐漸變紅變濃）
        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game22-timer-path');
            const container = document.getElementById('game22-grid-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game22-timer-ring');
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
            rect.style.stroke = `hsla(0, 90%, 50%, ${Math.round(5 + 45 * elapsed)}%)`;
        },

        // ------------------------------------------------------------
        // 遊戲結束統一處理：勝利或失敗都會走到這裡。
        // 失敗時記錄遊戲紀錄（若有 SupabaseClient），並依模式決定顯示訊息與確認後的行為
        // （關卡模式勝利 → 檢查是否解鎖成就 → 進下一關；一般模式 → 開新局；失敗 → 重來）
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 22,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game22-retryGame-btn').disabled = true;
                document.getElementById('game22-newGame-btn').disabled = true;
            } else {
                document.getElementById('game22-retryGame-btn').disabled = false;
                document.getElementById('game22-newGame-btn').disabled = false;
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
                const achId = window.ScoreManager.completeLevel('game22', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game22', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        }
    };

    window.Game22 = Game22;

    if (new URLSearchParams(window.location.search).get('game') === '22') {
        setTimeout(() => {
            if (window.Game22) window.Game22.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
