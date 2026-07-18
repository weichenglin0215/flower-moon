/* =========================================
   Game28《兩心相印》(Twin-Heart Pairing)
   ----------------------------------------
   花月版 A5 連連看 ── 源自 Shisen-Sho（四川省）。
   靜態盤面排滿漢字字牌，玩家點選兩張同字牌；
   若兩牌之間能以 ≤3 折角直線路徑連通（路徑經過的格子必須為空），
   則消除該對並累加分數。盤面全清即過關。
   ----------------------------------------
   依《花月開發常見錯誤與解法.md §4》規範：
   - class 全前綴 game28-
   - loadCSS() 動態防護（id=game28-css）
   - overlay 掛載 document.body 並套 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 完整支援關卡挑戰模式（callback 接 (selectedLevel, levelIndex)）
   - timeLimit = targetChars.length × timeLimitRate
   - 詩透過 getSharedRandomPoem 抽取
   ========================================= */

(function () {
    const Game28 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // ── 詩詞與目標 ──
        currentPoem: null,
        poemLines: [],
        targetChars: [],            // 全詩去標點後的字陣列（用於時限計算）

        // ── 盤面 ──
        rows: 6,
        cols: 6,
        board: [],                  // [row][col] = { char } 或 null（已消除）
        cellElements: [],           // [row][col] = DOM 元素
        tilesLeft: 0,               // 剩餘字牌數量

        // ── 玩家互動 ──
        firstPick: null,            // { r, c } 第一張待選
        hintsLeft: 5,
        animLocked: false,

        // ── 順序加成 ──
        orderProgress: 0,           // 已依序連對的字數（對應 targetChars 的索引）
        orderStreak: 0,             // 連續符合字序的對數

        // ── 計時 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        // 全詩去重後字陣列（首次出現順序）— 同字同色的 HUE 索引基準
        uniquePoemChars: [],

        // ── 委派給 window.TilePresentation：跨 game24~game30 統一的色相/配色實作 ──
        //   game28 以「整首詩去重字」為分組基準（連連看無明確逐句階段）
        getHueForChar: function (ch) {
            return window.TilePresentation.getHueForChar(ch, this.uniquePoemChars);
        },
        getColorForChar: function (ch) {
            return window.TilePresentation.getColorForChar(ch, this.uniquePoemChars);
        },
        isPoemChar: function (ch) {
            return this.uniquePoemChars.indexOf(ch) >= 0;
        },

        /*
         * 難度設定（依企劃書 §7）
         * boardRows / boardCols：盤面尺寸
         * decoyRatio     ：干擾字佔比
         * hintsMax       ：提示次數上限
         * orderBonus     ：順序加成倍率（達標時的倍率）
         * timeLimitRate  ：每字時間倍率
         * maxAdjacentSame：允許「兩張相同字牌相鄰擺放」的最高次數上限（實際盤面可少於此值）。
         *                  數字越小越難（相鄰同牌可直接消，等於送分）。生成盤面時會檢查並修正到 ≤ 此值。
         */
        difficultySettings: {
            '小學': { boardRows: 8, boardCols: 7, decoyRatio: 0.0, hintsMax: 5, orderBonus: 2, timeLimitRate: 10, poemMinRating: 6, minLines: 2, maxLines: 4, minChars: 10, maxChars: 14, maxAdjacentSame: 3 },
            '中學': { boardRows: 8, boardCols: 8, decoyRatio: 0.0, hintsMax: 3, orderBonus: 2, timeLimitRate: 9, poemMinRating: 5, minLines: 2, maxLines: 4, minChars: 10, maxChars: 20, maxAdjacentSame: 2 },
            '高中': { boardRows: 8, boardCols: 7, decoyRatio: 0.0, hintsMax: 2, orderBonus: 3, timeLimitRate: 8, poemMinRating: 4, minLines: 4, maxLines: 4, minChars: 20, maxChars: 28, maxAdjacentSame: 1 },
            '大學': { boardRows: 7, boardCols: 6, decoyRatio: 0.0, hintsMax: 1, orderBonus: 3, timeLimitRate: 7, poemMinRating: 3, minLines: 4, maxLines: 6, minChars: 20, maxChars: 42, maxAdjacentSame: 0 },
            '研究所': { boardRows: 8, boardCols: 7, decoyRatio: 0.0, hintsMax: 0, orderBonus: 5, timeLimitRate: 6, poemMinRating: 3, minLines: 4, maxLines: 8, minChars: 20, maxChars: 56, maxAdjacentSame: 0 }
        },

        // ── 共用干擾字池（簡易備援） ──
        decoyPool: '山水雲月風花雪夜春秋江湖天地人心夢酒詩書情思路愁影歸客孤舟鴻雁柳松青白紅黃綠寒暖暮朝晨暮窗門簾燈樓臺亭閣岸渡橋池塘草木林泉石玉珠香韻聲鐘鼓笛簫琴瑟絲竹',

        // ── CSS 載入防護 ──
        loadCSS: function () {
            if (!document.getElementById('game28-css')) {
                const link = document.createElement('link');
                link.id = 'game28-css';
                link.rel = 'stylesheet';
                link.href = 'game28.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game28-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game28-container');
        },

        // ── 建立 overlay DOM（掛 document.body） ──
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game28-container';
            div.className = 'game28-overlay hidden';
            div.innerHTML = `
                <div class="game28-header">
                    <div class="game28-score-board">分數: <span id="game28-score">0</span></div>
                    <div class="game28-controls">
                        <button class="game28-difficulty-tag" id="game28-diff-tag">小學</button>
                        <button id="game28-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game28-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game28-sub-header">
                    <div id="game28-moves-label" class="game28-moves-label" style="display:none">盤面:<span id="game28-stage-text">1/1</span> 步數:<span id="game28-moves">0</span>/<span id="game28-max-moves">0</span></div>
                    <div id="game28-line-text" class="game28-line-text" style="display:none"></div>
                    <div id="game28-progress-text" class="game28-progress-text">剩餘：0 對</div>
                    <div id="game28-bonus-text" class="game28-bonus-text">順序加成 ×1</div>
                    <div id="game28-poem-info" class="poem-info"></div>
                </div>
                <div class="game28-info-bar">
                    <div id="game28-char-bar" class="game28-char-bar"></div>
                </div>
                <div class="game28-area">
                    <div class="game28-info"></div>
                    <div class="game28-board-wrapper" id="game28-board-wrapper">
                        <svg id="game28-timer-ring">
                            <rect id="game28-timer-path" x="3" y="3"></rect>
                        </svg>
                        <svg id="game28-path-svg" class="game28-path-svg"></svg>
                        <div id="game28-board" class="game28-board"></div>
                    </div>
                    <div class="game28-bottom-bar">
                        <button id="game28-hint-btn" class="game28-action-btn">💡提示 <span id="game28-hint-count">(5)</span></button>
                        <button id="game28-shuffle-btn" class="game28-action-btn">🔀重排 (-30)</button>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

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
            document.getElementById('game28-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game28-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game28-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            document.getElementById('game28-hint-btn').onclick = () => {
                this.useHint();
            };
            document.getElementById('game28-shuffle-btn').onclick = () => {
                this.useShuffle();
            };
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        hide: function () {
            this.stopGame();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('兩心相印', (selectedLevel, levelIndex) => {
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
            const diffTag = document.getElementById('game28-diff-tag');
            const retryBtn = document.getElementById('game28-retryGame-btn');
            const newBtn = document.getElementById('game28-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };

            if (this.isLevelMode) {
                if (diffTag) {
                    diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                    diffTag.setAttribute('data-level', this.difficulty);
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) {
                    diffTag.textContent = this.difficulty;
                    diffTag.setAttribute('data-level', this.difficulty);
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        hideOtherContents: function () {
            const els = ['cardContainer'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，因此本函式必須隱藏 overlay
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }

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

        // 透過 isRetry 控制是否重新生成詩或維持上一局
        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.firstPick = null;
            this.orderProgress = 0;
            this.orderStreak = 0;
            this.animLocked = false;

            const settings = this.difficultySettings[this.difficulty];
            this.hintsLeft = settings.hintsMax;
            this.rows = settings.boardRows;
            this.cols = settings.boardCols;

            document.getElementById('game28-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.clearPathSvg();

            if (!isRetry) {
                this.generateBoard();
            } else {
                this.generateBoard();   // 重來也重生盤面（連連看屬於每局都需新盤面）
            }

            this.renderBoard();
            this.updateProgressText();
            this.updateBonusText();
            this.updateHintBtn();
            this.updateCharBar(false);

            document.getElementById('game28-retryGame-btn').disabled = false;
            document.getElementById('game28-newGame-btn').disabled = false;

            // 計算時限：targetChars.length × timeLimitRate（取詩之後才計算）
            if (settings.timeLimitRate > 0 && this.targetChars.length > 0) {
                this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game28-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game28-timer-ring').style.display = 'none';
            }
        },

        // ── 抽詩 ──
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要 script.js 的 getSharedRandomPoem');
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
                'game28'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.targetChars = this.poemLines.join('').split('');
            // 全詩去重後字（首次出現順序）— 同字同色 HUE 索引基準
            const seen = {};
            this.uniquePoemChars = [];
            for (const ch of this.targetChars) {
                if (!seen[ch]) { seen[ch] = true; this.uniquePoemChars.push(ch); }
            }

            // 顯示詩名 — 全名截 12 字 + 全名放 title 屬性供 hover 顯示
            const fullName = `${this.currentPoem.title}/${this.currentPoem.dynasty}/${this.currentPoem.author}`;
            const infoText = fullName.length > 12 ? (fullName.slice(0, 11) + '…') : fullName;
            const infoEl = document.getElementById('game28-poem-info');
            infoEl.textContent = infoText;
            infoEl.title = fullName;
            infoEl.dataset.poemId = this.currentPoem.id;
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // ── 盤面生成 ──
        // 規則：盤面總格數 = rows × cols（偶數）
        // 由「詩字（每字偶數張） + 干擾字（每字偶數張）」湊滿盤面，洗牌後填入。
        generateBoard: function () {
            const settings = this.difficultySettings[this.difficulty];
            const total = this.rows * this.cols;
            // 確保總數為偶數（rows*cols 必為偶數，因 difficultySettings 已設計）
            const decoyCount = Math.floor(total * settings.decoyRatio / 2) * 2; // 取偶數
            const poemCount = total - decoyCount;

            // 1) 詩字陣列：循環取自 targetChars，每字偶數張
            const charBag = [];
            const uniqChars = Array.from(new Set(this.targetChars));
            // 至少每字 2 張
            let idx = 0;
            while (charBag.length < poemCount) {
                charBag.push(uniqChars[idx % uniqChars.length]);
                idx++;
            }
            // 確保每字數量為偶數：若奇數則加一張（並從別字扣一張）
            const countMap = {};
            charBag.forEach(ch => { countMap[ch] = (countMap[ch] || 0) + 1; });
            // 修正奇數
            const oddChars = Object.keys(countMap).filter(c => countMap[c] % 2 === 1);
            // 兩兩配對奇數字：把後一個改為前一個（保持偶數）
            for (let i = 0; i + 1 < oddChars.length; i += 2) {
                // 在 charBag 找到 oddChars[i+1] 的某一張，改成 oddChars[i]
                const j = charBag.lastIndexOf(oddChars[i + 1]);
                if (j >= 0) {
                    charBag[j] = oddChars[i];
                    countMap[oddChars[i]]++;
                    countMap[oddChars[i + 1]]--;
                }
            }
            // 若還有 1 個落單奇數字（可能性低），加一張同字頂掉某個偶數字（偶數字仍須偶數，所以挑「次數≥4」者扣 1）
            const stillOdd = Object.keys(countMap).filter(c => countMap[c] % 2 === 1);
            if (stillOdd.length === 1) {
                // 找一個 ≥2 的偶數字替換
                const candidate = Object.keys(countMap).find(c => c !== stillOdd[0] && countMap[c] >= 2);
                if (candidate) {
                    const j = charBag.lastIndexOf(candidate);
                    if (j >= 0) {
                        charBag[j] = stillOdd[0];
                        countMap[stillOdd[0]]++;
                        countMap[candidate]--;
                    }
                }
            }

            // 2) 干擾字：從 decoyPool 隨機抽，每字 2 張
            const decoyBag = [];
            const decoySet = new Set(uniqChars);  // 排除詩字
            const decoyAvailable = this.decoyPool.split('').filter(c => !decoySet.has(c));
            // 洗牌
            for (let i = decoyAvailable.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [decoyAvailable[i], decoyAvailable[j]] = [decoyAvailable[j], decoyAvailable[i]];
            }
            let dIdx = 0;
            while (decoyBag.length < decoyCount) {
                const ch = decoyAvailable[dIdx % decoyAvailable.length];
                decoyBag.push(ch, ch);
                dIdx++;
            }
            // 若 decoyBag 超出 1，捨棄一張並調整（理論不會）
            while (decoyBag.length > decoyCount) decoyBag.pop();

            // 3) 合併並洗牌
            const allBag = charBag.concat(decoyBag);
            for (let i = allBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allBag[i], allBag[j]] = [allBag[j], allBag[i]];
            }

            // 4) 填入棋盤 board[r][c]
            this.board = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            let k = 0;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    this.board[r][c] = { char: allBag[k++] };
                }
            }
            this.tilesLeft = this.rows * this.cols;

            // 計算每字總張數（用於進度卡片上的剩餘計數；只統計詩字、不含干擾字）
            this.charCountTotal = {};
            this.charCountLeft = {};
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const ch = this.board[r][c].char;
                    if (this.isPoemChar(ch)) {
                        this.charCountTotal[ch] = (this.charCountTotal[ch] || 0) + 1;
                        this.charCountLeft[ch] = (this.charCountLeft[ch] || 0) + 1;
                    }
                }
            }

            // 5) 兩道限制同時滿足才接受此盤面：
            //    (a) 相鄰同牌數 ≤ 該難度 maxAdjacentSame（相鄰同牌可直接消＝送分，難度越高允許越少）
            //    (b) 整盤可完全清除（isBoardSolvable：實際找到一條完整清盤解法）
            //    先修正相鄰重複，再驗證可解；不合則重排位置重試，數次仍失敗才接受（遊戲中死局自動重排為後備）。
            const maxAdj = this.getMaxAdjacentSame();
            this.reduceAdjacentSamePairs(maxAdj);
            let genTry = 0;
            while ((this.countAdjacentSamePairs() > maxAdj || !this.isBoardSolvable(15)) && genTry < 30) {
                this._shuffleOccupied();
                this.reduceAdjacentSamePairs(maxAdj);
                genTry++;
            }
        },

        // ── 相鄰同牌限制（difficultySettings.maxAdjacentSame） ──
        // 取得目前難度允許的「相鄰同牌」最高次數；未設定時視為不限制
        getMaxAdjacentSame: function () {
            const s = this.difficultySettings[this.difficulty];
            return (s && typeof s.maxAdjacentSame === 'number') ? s.maxAdjacentSame : Infinity;
        },

        // 統計盤面上「上下或左右相鄰且同字」的對數（每對只計一次：只往右、往下看）
        countAdjacentSamePairs: function () {
            let count = 0;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cell = this.board[r][c];
                    if (!cell) continue;
                    const right = (c + 1 < this.cols) ? this.board[r][c + 1] : null;
                    const down = (r + 1 < this.rows) ? this.board[r + 1][c] : null;
                    if (right && right.char === cell.char) count++;
                    if (down && down.char === cell.char) count++;
                }
            }
            return count;
        },

        // 隨機挑一個「與某相鄰格同字」的格子（供修正用）
        _findAdjacentSameCell: function () {
            const bad = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const cell = this.board[r][c];
                    if (!cell) continue;
                    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                    for (const [nr, nc] of nb) {
                        if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols &&
                            this.board[nr][nc] && this.board[nr][nc].char === cell.char) {
                            bad.push({ r, c });
                            break;
                        }
                    }
                }
            }
            return bad.length ? bad[Math.floor(Math.random() * bad.length)] : null;
        },

        // 打散「已佔用格子」的字（保留哪些格有牌、只重排字），供生成/重排時使用
        _shuffleOccupied: function () {
            const chars = [];
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    if (this.board[r][c]) chars.push(this.board[r][c].char);
            for (let i = chars.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [chars[i], chars[j]] = [chars[j], chars[i]];
            }
            let k = 0;
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    if (this.board[r][c]) this.board[r][c] = { char: chars[k++] };
        },

        // 以「交換兩格字」的爬山法把相鄰同牌數壓到 ≤ maxAllowed（保留字牌多重集合，不影響可解性驗證的字數分布）
        reduceAdjacentSamePairs: function (maxAllowed, maxSwaps) {
            if (!(maxAllowed >= 0) || maxAllowed === Infinity) return;   // 不限制則不處理
            maxSwaps = maxSwaps || 3000;
            const cells = [];
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    if (this.board[r][c]) cells.push({ r, c });
            if (cells.length < 2) return;

            let swaps = 0;
            let cur = this.countAdjacentSamePairs();
            while (cur > maxAllowed && swaps < maxSwaps) {
                const bad = this._findAdjacentSameCell();
                if (!bad) break;
                const other = cells[Math.floor(Math.random() * cells.length)];
                // 交換兩格的字
                const t = this.board[bad.r][bad.c].char;
                this.board[bad.r][bad.c].char = this.board[other.r][other.c].char;
                this.board[other.r][other.c].char = t;
                const after = this.countAdjacentSamePairs();
                if (after < cur) {
                    cur = after;            // 有改善 → 保留
                } else {
                    // 無改善 → 還原
                    const t2 = this.board[bad.r][bad.c].char;
                    this.board[bad.r][bad.c].char = this.board[other.r][other.c].char;
                    this.board[other.r][other.c].char = t2;
                }
                swaps++;
            }
        },

        // ── 可解性驗證（保證盤面可被完全清除） ──
        // 為何需要：只確認「盤面存在一組可連牌」(hasAnyMatch) 並不能保證整盤清得完 —
        //   貪婪地亂消可能把自己逼進死局。真正的保證是：能實際「找出」一條把牌全部消掉的順序。
        // 作法：以隨機貪婪解算器嘗試多次（restarts 次）。只要任一次成功清空整盤，
        //   即為「此盤可解」的建構性證明（我們手上就握有一組解）。全部失敗才視為（很可能）不可解。
        //   —— 因此被接受的盤面「必定」至少存在一條解法。
        isBoardSolvable: function (restarts) {
            const snap = () => this.board.map(row => row.map(cell => cell ? { char: cell.char } : null));
            const original = snap();
            const restore = (s) => { this.board = s.map(row => row.map(cell => cell ? { char: cell.char } : null)); };

            let solved = false;
            for (let attempt = 0; attempt < restarts && !solved; attempt++) {
                restore(original);
                solved = this._greedyClear();
            }
            restore(original);   // 還原真正盤面（解算過程會清空 this.board）
            return solved;
        },

        // 隨機貪婪清盤：反覆隨機挑一組可連牌消除，直到清空（成功）或無牌可連（失敗）
        _greedyClear: function () {
            let remaining = 0;
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    if (this.board[r][c]) remaining++;

            while (remaining > 0) {
                const pair = this._findRandomMatch();
                if (!pair) return false;   // 死局：此貪婪路線清不完
                this.board[pair[0].r][pair[0].c] = null;
                this.board[pair[1].r][pair[1].c] = null;
                remaining -= 2;
            }
            return true;
        },

        // 隨機挑一組「可連通」的同字牌（供解算器用）；以隨機順序掃描以增加不同貪婪路線的多樣性
        _findRandomMatch: function () {
            const positions = [];
            for (let r = 0; r < this.rows; r++)
                for (let c = 0; c < this.cols; c++)
                    if (this.board[r][c]) positions.push({ r, c, char: this.board[r][c].char });
            // 洗牌位置
            for (let i = positions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [positions[i], positions[j]] = [positions[j], positions[i]];
            }
            const byChar = {};
            positions.forEach(p => { (byChar[p.char] = byChar[p.char] || []).push(p); });
            const chars = Object.keys(byChar);
            for (let i = chars.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [chars[i], chars[j]] = [chars[j], chars[i]];
            }
            for (const ch of chars) {
                const arr = byChar[ch];
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (this.findPath(arr[i].r, arr[i].c, arr[j].r, arr[j].c)) {
                            return [arr[i], arr[j]];
                        }
                    }
                }
            }
            return null;
        },

        // 重新洗牌（保留剩餘字牌、僅打散位置）；同時盡量滿足「相鄰同牌 ≤ 難度上限」且非死局
        reshuffleBoard: function () {
            const maxAdj = this.getMaxAdjacentSame();
            this._shuffleOccupied();
            this.reduceAdjacentSamePairs(maxAdj);
            // 重排後須確保仍有可連的一步（非死局），並盡量維持相鄰同牌上限
            let safety = 0;
            while ((!this.hasAnyMatch() || this.countAdjacentSamePairs() > maxAdj) && safety < 15) {
                this._shuffleOccupied();
                this.reduceAdjacentSamePairs(maxAdj);
                safety++;
            }
        },

        // ── 渲染盤面 ──
        // 版面模型：四邊各保留半個格子 → 格距 cellW = 盤寬/(cols+1)，
        //   字牌 (r,c) 中心 = ((c+1)·cellW, (r+1)·cellH)；
        //   如此「盤外繞行環」的索引 -1 對應座標 0（盤面左/上緣），索引 cols/rows 對應盤寬/盤高（右/下緣），
        //   連線繞行時剛好落在四周保留的半格空間內，且與 drawPath 的座標完全一致。
        renderBoard: function () {
            const container = document.getElementById('game28-board');
            const W = container.clientWidth || container.offsetWidth;
            const H = container.clientHeight || container.offsetHeight;
            // 版面尚未定案（尺寸為 0）時，等下一影格再排（絕對定位模型需要真實像素尺寸）
            if (W < 10 || H < 10) {
                requestAnimationFrame(() => this.renderBoard());
                return;
            }
            container.innerHTML = '';
            this.cellElements = Array(this.rows).fill().map(() => Array(this.cols).fill(null));
            const cellW = W / (this.cols + 1);
            const cellH = H / (this.rows + 1);
            // 字塊本體略小於格距，露出間隙供連線與立體感
            const gap = Math.max(3, Math.min(cellW, cellH) * 0.14);
            const tileW = Math.max(1, cellW - gap);
            const tileH = Math.max(1, cellH - gap);
            // 供 drawPath 沿用同一組度量
            this._cellW = cellW; this._cellH = cellH; this._boardW = W; this._boardH = H;

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    const div = document.createElement('div');
                    div.className = 'game28-cell';
                    div.dataset.r = r;
                    div.dataset.c = c;
                    // 絕對定位：以格中心回推左上角
                    const cx = (c + 1) * cellW;
                    const cy = (r + 1) * cellH;
                    div.style.left = (cx - tileW / 2) + 'px';
                    div.style.top = (cy - tileH / 2) + 'px';
                    div.style.width = tileW + 'px';
                    div.style.height = tileH + 'px';
                    const data = this.board[r][c];
                    if (data) {
                        div.textContent = data.char;
                        // 同字同色：依字在 uniquePoemChars 索引等分 360°
                        const hue = this.getHueForChar(data.char);
                        div.style.setProperty('--g28-h', hue);
                        if (this.isPoemChar(data.char)) {
                            div.style.setProperty('--g28-s', '60%');
                            div.style.setProperty('--g28-l', '75%');
                            div.style.setProperty('--g28-text', 'hsl(220, 30%, 14%)');
                            // 同字同形：依字在 uniquePoemChars 索引套五種形狀之一
                            const shpIdx = this.uniquePoemChars.indexOf(data.char);
                            if (shpIdx >= 0) window.TileStyleUtils.applyShape(div, window.TileStyleUtils.getGroupShape(shpIdx));
                        } else {
                            div.classList.add('decoy');
                        }
                    } else {
                        div.classList.add('empty');
                    }
                    div.onclick = () => this.onCellClick(r, c);
                    container.appendChild(div);
                    this.cellElements[r][c] = div;
                }
            }

            // 字體大小依格距動態調整
            const fontSize = Math.max(16, Math.min(38, Math.floor(Math.min(tileW, tileH) * 0.62)));
            container.style.fontSize = fontSize + 'px';
        },

        // ── 點擊處理 ──
        onCellClick: function (r, c) {
            if (!this.isActive || this.animLocked) return;
            const data = this.board[r][c];
            if (!data) return;   // 空格

            // ⚠️ 不再以「四邊是否有空側」限制選取：
            //   連連看的合法性完全由「能否以 ≤2 折的路徑穿過空格連通」決定（findPath）。
            //   舊的 hasEmptySide 規則會誤擋「相鄰但四周被包圍」的一對牌（它們其實可直接相連），
            //   造成解算器判定可解、玩家卻無法執行 → 過不了關。改由 findPath 統一裁定。
            if (window.SoundManager) window.SoundManager.playOpenItem();

            if (!this.firstPick) {
                // 第一張
                this.firstPick = { r, c };
                this.cellElements[r][c].classList.add('selected');
                return;
            }

            // 點到同一張：取消
            if (this.firstPick.r === r && this.firstPick.c === c) {
                this.cellElements[r][c].classList.remove('selected');
                this.firstPick = null;
                return;
            }

            const firstData = this.board[this.firstPick.r][this.firstPick.c];
            // 不同字：第二張取代成為待選
            if (firstData.char !== data.char) {
                this.cellElements[this.firstPick.r][this.firstPick.c].classList.remove('selected');
                this.firstPick = { r, c };
                this.cellElements[r][c].classList.add('selected');
                return;
            }

            // 同字：判路徑
            const path = this.findPath(this.firstPick.r, this.firstPick.c, r, c);
            if (path) {
                // 成功配對
                this.handleMatchSuccess(this.firstPick, { r, c }, path);
            } else {
                // 同字但路徑不通：紅閃，第二張取代
                const aEl = this.cellElements[this.firstPick.r][this.firstPick.c];
                const bEl = this.cellElements[r][c];
                aEl.classList.add('flash-red');
                bEl.classList.add('flash-red');
                if (window.SoundManager) window.SoundManager.playFailure();
                setTimeout(() => {
                    aEl.classList.remove('flash-red');
                    bEl.classList.remove('flash-red');
                    aEl.classList.remove('selected');
                    this.firstPick = { r, c };
                    bEl.classList.add('selected');
                }, 280);
            }
        },

        // ── 進度字卡列（仿 game24 — 每張卡 = 上方彩色字塊 + 下方 剩餘/總計） ──
        //   每張卡顯示「該字剩餘張數 / 該字總張數」；歸零（全消除完）→ 金光達標狀態
        updateCharBar: function (animateNewlyLit) {
            const el = document.getElementById('game28-char-bar');
            if (!el) return;
            const prev = this._prevCharCountLeft || {};
            let html = '';
            this.uniquePoemChars.forEach(ch => {
                const total = this.charCountTotal[ch] || 0;
                if (total === 0) return; // 該字未出現在牌堆 → 不顯示
                const left = this.charCountLeft[ch] || 0;
                const got = total - left;
                const done = left === 0;
                const justDone = animateNewlyLit && done && (prev[ch] === undefined ? total : prev[ch]) > 0;
                // ⚠️ 使用共用 TilePresentation 取得完整分組配色（同 game24 頂端字塊）
                const c = this.getColorForChar(ch) || { hue: this.getHueForChar(ch), sat: 60, lum: 75, textColor: 'hsl(220, 30%, 14%)' };
                html += `<span class="game28-char-group ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g28-h:${c.hue};--g28-s:${c.sat}%;--g28-l:${c.lum}%;--g28-text:${c.textColor}">`
                    + `<span class="game28-char-tile">${ch}</span>`
                    + `<span class="game28-char-count"><span class="game28-char-num">${got}</span>/<span class="game28-char-den">${total}</span></span>`
                    + `</span>`;
            });
            el.innerHTML = html;
            // 進度字卡超過 14 個 → 改為可換行（上下兩行以上），避免字塊被壓縮／裁切
            const shownCount = this.uniquePoemChars.filter(ch => (this.charCountTotal[ch] || 0) > 0).length;
            el.classList.toggle('game28-char-bar--wrap', shownCount > 14);
            this._prevCharCountLeft = Object.assign({}, this.charCountLeft);
        },

        // ── FX：DOM cell → wrapper 本地座標（修正舞台 scale 雙重縮放） ──
        getCellCenter: function (cellEl) {
            const wrapper = document.getElementById('game28-board-wrapper');
            if (!cellEl || !wrapper) return { x: 0, y: 0 };
            const cr = cellEl.getBoundingClientRect();
            const wr = wrapper.getBoundingClientRect();
            const scale = window.stageScale || 1;
            return {
                x: ((cr.left - wr.left) + cr.width / 2) / scale,
                y: ((cr.top - wr.top) + cr.height / 2) / scale,
                w: cr.width / scale, h: cr.height / scale
            };
        },
        spawnParticles: function (cellEl, count, hue) {
            const wrapper = document.getElementById('game28-board-wrapper');
            if (!wrapper) return;
            const c = this.getCellCenter(cellEl);
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game28-particle';
                const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
                const dist = 32 + Math.random() * 36;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist - 8;
                p.style.left = c.x + 'px';
                p.style.top = c.y + 'px';
                p.style.setProperty('--g28-dx', dx + 'px');
                p.style.setProperty('--g28-dy', dy + 'px');
                if (typeof hue === 'number') p.style.setProperty('--g28-ph', hue);
                const scl = 0.8 + Math.random() * 0.6;
                p.style.width = (8 * scl) + 'px';
                p.style.height = (8 * scl) + 'px';
                wrapper.appendChild(p);
                setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
            }
        },
        spawnSoul: function (cellEl, ch) {
            const wrapper = document.getElementById('game28-board-wrapper');
            if (!wrapper) return;
            const start = this.getCellCenter(cellEl);
            // 飛入對應 char-bar 的進度卡（外部 DOM；座標需要重新換算 viewport→wrapper local）
            const groupEl = document.querySelector(`#game28-char-bar .game28-char-group[data-char="${ch}"]`);
            let endX, endY;
            if (groupEl) {
                const gr = groupEl.getBoundingClientRect();
                const wr = wrapper.getBoundingClientRect();
                const scale = window.stageScale || 1;
                endX = ((gr.left - wr.left) + gr.width / 2) / scale;
                endY = ((gr.top - wr.top) + gr.height / 2) / scale;
            } else { endX = start.x; endY = -20; }
            const soul = document.createElement('div');
            soul.className = 'game28-soul';
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

        // 過關動畫：進度字卡逐一發金光 → 呼叫 gameOver(true) → ScoreManager → MessageBox
        playWinSequence: function () {
            this.animLocked = true;
            const cards = Array.from(document.querySelectorAll('#game28-char-bar .game28-char-group'));
            const GAP = 160;
            cards.forEach((g, i) => setTimeout(() => g.classList.add('stage-flash'), i * GAP));
            const total = cards.length * GAP + 500;
            setTimeout(() => this.gameOver(true, ''), total);
        },

        // ── 配對成功處理 ──
        handleMatchSuccess: function (a, b, path) {
            this.animLocked = true;
            const charMatched = this.board[a.r][a.c].char;

            // 繪製綠色光帶
            this.drawPath(path);

            // 順序加成判定
            const settings = this.difficultySettings[this.difficulty];
            let bonus = 1;
            if (this.orderProgress < this.targetChars.length &&
                this.targetChars[this.orderProgress] === charMatched) {
                this.orderProgress++;
                this.orderStreak++;
                if (this.orderStreak >= 2) bonus = settings.orderBonus;
            } else {
                this.orderStreak = 0;
            }

            // 分數
            const baseGain = (window.ScoreManager && window.ScoreManager.gameSettings.game28)
                ? window.ScoreManager.gameSettings.game28.getPointA : 20;
            const gain = baseGain * bonus;
            this.score += gain;
            document.getElementById('game28-score').textContent = this.score;

            // 飛分動畫（簡）
            this.spawnFloatScore(a, gain, bonus);

            if (window.SoundManager) {
                if (bonus > 1) window.SoundManager.playJoyfulTriple();
                else window.SoundManager.playSuccessShort();
            }

            // 套用消除動畫
            const elA = this.cellElements[a.r][a.c];
            const elB = this.cellElements[b.r][b.c];
            elA.classList.add('matched');
            elB.classList.add('matched');
            elA.classList.remove('selected');
            elB.classList.remove('selected');

            setTimeout(() => {
                // 真正清除 — 在資料清除前先觸發粒子/字魂（同色系 + 飛入進度卡）
                const hue = this.getHueForChar(charMatched);
                this.spawnParticles(elA, 6, hue);
                this.spawnParticles(elB, 6, hue);
                if (this.isPoemChar(charMatched)) {
                    this.spawnSoul(elA, charMatched);
                    this.spawnSoul(elB, charMatched);
                }
                this.board[a.r][a.c] = null;
                this.board[b.r][b.c] = null;
                this.tilesLeft -= 2;
                // 更新該字剩餘張數
                if (this.charCountLeft[charMatched] !== undefined) {
                    this.charCountLeft[charMatched] = Math.max(0, this.charCountLeft[charMatched] - 2);
                }
                elA.textContent = '';
                elB.textContent = '';
                elA.classList.add('empty');
                elB.classList.add('empty');
                elA.classList.remove('matched');
                elB.classList.remove('matched');

                this.clearPathSvg();
                this.firstPick = null;
                this.updateProgressText();
                this.updateBonusText();
                this.updateCharBar(true); // animateNewlyLit

                // 勝利 → 走過關動畫（進度卡逐一發金光 → ScoreManager → MessageBox）
                if (this.tilesLeft === 0) {
                    this.playWinSequence();
                    return;
                }

                // 死局偵測 → 自動重排
                if (!this.hasAnyMatch()) {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    this.reshuffleBoard();
                    this.renderBoard();
                }
                this.animLocked = false;
            }, 380);
        },

        // ── 路徑搜尋（≤3 折角） ──
        // 兩牌之間可由不超過 3 段折線連接，且除了端點所在格之外，
        // 路徑經過的「格子」必須為空（this.board[r][c] === null）或位於盤面外。
        // 採用：從起點先沿四方向掃描可達點集合 P1；
        //       再從 P1 沿其他方向掃描得 P2；
        //       最後從 P2 沿任意方向掃描是否能到達終點。
        // 為視覺繪線，我們會在成功時實際回傳路徑點序列（含轉折點）。
        findPath: function (r1, c1, r2, c2) {
            // 嘗試不同折角數 0,1,2,3
            // 直線（0 折）
            if (this.isStraightClear(r1, c1, r2, c2)) {
                return [{ r: r1, c: c1 }, { r: r2, c: c2 }];
            }
            // 1 折：經過 (r1, c2) 或 (r2, c1)
            const corner1 = [
                { r: r1, c: c2 },
                { r: r2, c: c1 }
            ];
            for (const k of corner1) {
                if (this.isCellPassable(k.r, k.c, r1, c1, r2, c2) &&
                    this.isStraightClear(r1, c1, k.r, k.c) &&
                    this.isStraightClear(k.r, k.c, r2, c2)) {
                    return [{ r: r1, c: c1 }, k, { r: r2, c: c2 }];
                }
            }
            // 2 折：經過兩個轉折點。
            // 含「沿盤面外繞行」 → 盤面擴展為虛擬一圈外邊（索引 -1 與 rows/cols）。
            // 兩段平行直線：先從起點沿某方向走到 (r1, x)/(x, c1)，再從終點沿同方向得到 (r2, x)/(x, c2)。
            // ⚠️ 掃描順序改為「離兩端點最近者優先」：讓連線優先走最近的通道／最近的保留側，
            //    避免總是從 -1 起掃而繞去遠端；此僅改變回傳路徑外觀，不影響是否存在路徑（解局判定不受影響）。
            const near = (x, a, b) => Math.min(Math.abs(x - a), Math.abs(x - b));

            // 列掃描（共同行 row = x，範圍 -1 ~ rows）
            const rowCands = [];
            for (let x = -1; x <= this.rows; x++) {
                if (x === r1 || x === r2) continue;
                rowCands.push(x);
            }
            rowCands.sort((a, b) => near(a, r1, r2) - near(b, r1, r2));
            for (const x of rowCands) {
                // ⚠️ 關鍵修正：兩個「轉折格」(x,c1)、(x,c2) 本身也必須是空的（或盤外），
                //    否則路徑會在該處「轉彎穿過一張牌」——這正是「兩牌之間有牌卻直接連過去」的成因。
                if (this.isCellPassable(x, c1) && this.isCellPassable(x, c2) &&
                    this.isStraightClear(r1, c1, x, c1) &&
                    this.isStraightClear(x, c1, x, c2) &&
                    this.isStraightClear(x, c2, r2, c2)) {
                    return [{ r: r1, c: c1 }, { r: x, c: c1 }, { r: x, c: c2 }, { r: r2, c: c2 }];
                }
            }
            // 欄掃描（共同欄 col = x，範圍 -1 ~ cols）
            const colCands = [];
            for (let x = -1; x <= this.cols; x++) {
                if (x === c1 || x === c2) continue;
                colCands.push(x);
            }
            colCands.sort((a, b) => near(a, c1, c2) - near(b, c1, c2));
            for (const x of colCands) {
                // ⚠️ 同上：兩個轉折格 (r1,x)、(r2,x) 本身也必須為空（或盤外）才能轉彎
                if (this.isCellPassable(r1, x) && this.isCellPassable(r2, x) &&
                    this.isStraightClear(r1, c1, r1, x) &&
                    this.isStraightClear(r1, x, r2, x) &&
                    this.isStraightClear(r2, x, r2, c2)) {
                    return [{ r: r1, c: c1 }, { r: r1, c: x }, { r: r2, c: x }, { r: r2, c: c2 }];
                }
            }
            return null;
        },

        // 判斷格子是否可作為中繼點（必須為空格或盤面外）
        isCellPassable: function (r, c, sr1, sc1, sr2, sc2) {
            if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return true; // 外側
            // 不可是任何字牌（含端點）
            if (this.board[r][c]) return false;
            return true;
        },

        // 判斷起終兩點之間是否為直線（同行/同列），且中間所有「中繼格」皆可通過
        // 起終點本身允許是字牌（端點本就是要消除的牌）
        isStraightClear: function (r1, c1, r2, c2) {
            if (r1 !== r2 && c1 !== c2) return false;
            if (r1 === r2 && c1 === c2) return true;

            if (r1 === r2) {
                const r = r1;
                const cStart = Math.min(c1, c2);
                const cEnd = Math.max(c1, c2);
                for (let c = cStart + 1; c < cEnd; c++) {
                    // 中繼格必須為空（盤面外不會在此循環，因起終都在盤面內）
                    // 但 r 可能 = -1 或 rows（盤面外），此時整列都視為空
                    if (r < 0 || r >= this.rows) continue;
                    if (this.board[r][c]) return false;
                }
                return true;
            } else {
                const c = c1;
                const rStart = Math.min(r1, r2);
                const rEnd = Math.max(r1, r2);
                for (let r = rStart + 1; r < rEnd; r++) {
                    if (c < 0 || c >= this.cols) continue;
                    if (this.board[r][c]) return false;
                }
                return true;
            }
        },

        // ── 死局偵測 ──
        hasAnyMatch: function () {
            const positions = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.board[r][c]) positions.push({ r, c, char: this.board[r][c].char });
                }
            }
            // 按字分組
            const byChar = {};
            positions.forEach(p => {
                if (!byChar[p.char]) byChar[p.char] = [];
                byChar[p.char].push(p);
            });
            for (const ch in byChar) {
                const arr = byChar[ch];
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (this.findPath(arr[i].r, arr[i].c, arr[j].r, arr[j].c)) {
                            return true;
                        }
                    }
                }
            }
            return false;
        },

        // 找出第一組可配對牌（給提示用）
        findFirstMatch: function () {
            const positions = [];
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.board[r][c]) positions.push({ r, c, char: this.board[r][c].char });
                }
            }
            const byChar = {};
            positions.forEach(p => {
                if (!byChar[p.char]) byChar[p.char] = [];
                byChar[p.char].push(p);
            });
            // 優先回傳「字序前段」字
            const targets = [...new Set(this.targetChars)];
            const order = targets.concat(Object.keys(byChar).filter(c => !targets.includes(c)));
            for (const ch of order) {
                const arr = byChar[ch];
                if (!arr) continue;
                for (let i = 0; i < arr.length; i++) {
                    for (let j = i + 1; j < arr.length; j++) {
                        if (this.findPath(arr[i].r, arr[i].c, arr[j].r, arr[j].c)) {
                            return [arr[i], arr[j]];
                        }
                    }
                }
            }
            return null;
        },

        // ── 提示 ──
        useHint: function () {
            if (!this.isActive || this.animLocked) return;
            if (this.hintsLeft <= 0) {
                if (window.SoundManager) window.SoundManager.playFailure();
                return;
            }
            const pair = this.findFirstMatch();
            if (!pair) return;
            this.hintsLeft--;
            this.score = Math.max(0, this.score - 10);
            document.getElementById('game28-score').textContent = this.score;
            this.updateHintBtn();

            const [a, b] = pair;
            const elA = this.cellElements[a.r][a.c];
            const elB = this.cellElements[b.r][b.c];
            elA.classList.add('hint-glow');
            elB.classList.add('hint-glow');
            if (window.SoundManager) window.SoundManager.playOpenItem();
            setTimeout(() => {
                elA.classList.remove('hint-glow');
                elB.classList.remove('hint-glow');
            }, 1500);
        },

        updateHintBtn: function () {
            const span = document.getElementById('game28-hint-count');
            if (span) span.textContent = `(${this.hintsLeft})`;
            const btn = document.getElementById('game28-hint-btn');
            if (btn) btn.disabled = (this.hintsLeft <= 0);
        },

        // ── 重排 ──
        useShuffle: function () {
            if (!this.isActive || this.animLocked) return;
            this.score = Math.max(0, this.score - 30);
            document.getElementById('game28-score').textContent = this.score;
            this.reshuffleBoard();
            this.renderBoard();
            // 重排後仍要清除選取與光帶
            this.firstPick = null;
            this.clearPathSvg();
            if (window.SoundManager) window.SoundManager.playConfirmItem();
        },

        // ── 光帶繪製 ──
        drawPath: function (pathPoints) {
            const svg = document.getElementById('game28-path-svg');
            const board = document.getElementById('game28-board');
            const bw = board.clientWidth || board.offsetWidth;
            const bh = board.clientHeight || board.offsetHeight;
            // 與 renderBoard 相同的半格保留模型：cellW = 盤寬/(cols+1)，字牌中心 = (c+1)·cellW
            const cellW = bw / (this.cols + 1);
            const cellH = bh / (this.rows + 1);
            svg.setAttribute('viewBox', `0 0 ${bw} ${bh}`);
            svg.setAttribute('width', bw);
            svg.setAttribute('height', bh);
            svg.innerHTML = '';

            const toXY = (p) => {
                // 盤內字牌：中心 = (c+1)·cellW；盤外繞行環：索引 -1 → 0（左/上緣），索引 cols/rows → 盤寬/盤高（右/下緣）
                const x = (p.c + 1) * cellW;
                const y = (p.r + 1) * cellH;
                return { x, y };
            };

            let d = '';
            pathPoints.forEach((p, i) => {
                const { x, y } = toXY(p);
                d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
            });
            const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathEl.setAttribute('d', d);
            pathEl.setAttribute('class', 'game28-path-line');
            svg.appendChild(pathEl);
        },

        clearPathSvg: function () {
            const svg = document.getElementById('game28-path-svg');
            if (svg) svg.innerHTML = '';
        },

        // ── 飛分顯示 ──
        spawnFloatScore: function (pos, gain, bonus) {
            const board = document.getElementById('game28-board');
            const cell = this.cellElements[pos.r][pos.c];
            if (!cell || !board) return;
            const span = document.createElement('div');
            span.className = 'game28-float-score';
            span.textContent = (bonus > 1 ? `+${gain} ×${bonus}` : `+${gain}`);
            span.style.left = cell.offsetLeft + cell.offsetWidth / 2 + 'px';
            span.style.top = cell.offsetTop + 'px';
            board.parentElement.appendChild(span);
            setTimeout(() => { if (span.parentNode) span.parentNode.removeChild(span); }, 900);
        },

        // ── UI 文字 ──
        updateProgressText: function () {
            const pairs = this.tilesLeft / 2;
            const el = document.getElementById('game28-progress-text');
            if (el) el.textContent = `剩餘:${pairs}對`;
        },

        updateBonusText: function () {
            const settings = this.difficultySettings[this.difficulty];
            const el = document.getElementById('game28-bonus-text');
            if (!el) return;
            const mult = this.orderStreak >= 2 ? settings.orderBonus : 1;
            el.textContent = `順序加成 ${this.orderStreak}/${mult}`;
        },

        // ── 計時 ──
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
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
            const rect = document.getElementById('game28-timer-path');
            const wrapper = document.getElementById('game28-board-wrapper');
            const svg = document.getElementById('game28-timer-ring');
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
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        // ── 結束 ──
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);
            this.firstPick = null;
            this.clearPathSvg();

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 28,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game28-retryGame-btn').disabled = true;
                document.getElementById('game28-newGame-btn').disabled = true;
            } else {
                document.getElementById('game28-retryGame-btn').disabled = false;
                document.getElementById('game28-newGame-btn').disabled = false;
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '兩心未連！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game28', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game28', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game28',
                    timerContainerId: 'game28-board-wrapper',
                    scoreElementId: 'game28-score',
                    heartsSelector: '.game28-no-hearts',  // 本作無紅心 — 永不命中但語法合法，避免 querySelectorAll 例外
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

    window.Game28 = Game28;

    if (new URLSearchParams(window.location.search).get('game') === '28') {
        setTimeout(() => {
            if (window.Game28) window.Game28.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
