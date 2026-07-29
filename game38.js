/* =========================================
   Game38《推枰成詩》(Tap-to-Slide Poem Puzzle)
   ----------------------------------------
   花月版互動推盤遊戲 ── 源自舒壓頁「詩仙推敲」的拆字推盤概念，改由玩家親自
   動手：整首詩拆成一格一格的彩色方塊、缺一格，盤面打亂後，玩家點擊緊鄰空格
   的方塊即可把它推入空格。在步數限制內把整首詩推回正確順序即過關得分。

   ⭐ 計步方式比照《三字成珠》(game24) 的步數模式：紅白相間的雙框（fmd-moves-
      path-red/white）依「已用/剩餘步數」逐段點亮或熄滅；逾時（5 秒沒有任何
      有效操作）比照 game24 的怠功機制自動扣 1 步。

      ⭐⭐ 打亂方式改用「倒推法」（比照 game9 詩韻鎖扣）：不再是「打亂後才去
      估計要幾步解開」，而是反過來——先把盤面擺成解答狀態，再隨機做「T 步合法
      滑動」把它打亂，T 直接從難度表的 [scrambleMin, scrambleMax] 隨機挑一個值。
      因為是「用 T 步從解答狀態走出來的」，所以真正的最短解一定「小於等於」T
      （把這 T 步反過來走就是一組合法解），玩家的步數上限只要抓 T 的一個生成
      係數（moveBudgetMul）就有把握、可控的難度範圍，不會像「先打亂再估計」那樣
      忽大忽小、有時輕鬆有時根本走不完。這正是手機玩家需要的：**知道自己大概
      要花多少步、多少時間才能玩完一局，才不會被切斷在玩到一半**。
      步數上限 = round(T × moveBudgetMul)。
      每一難度的 scrambleMin／scrambleMax／moveBudgetMul 都在 difficultySettings
      裡，可自行調整。

      ⚠️ 打亂時避免「同一顆方塊來回搬動」這種無效移動：不只排除「空格立刻走回
      上一格」（等於撤銷上一步），還排除「空格走回最近 N 步內去過的格子」，讓
      隨機走的路徑盡量往盤面各處擴散、而非在小範圍內原地打轉——小學步數少，
      擾亂範圍難免侷限在局部，但至少會盡量往外擴，而不是死守在角落。

      ⭐⭐⭐ 允許「從左邊開始排也算對」：傳統直排由右至左，但玩家不見得知道
      這個慣例。因此判定過關／方塊落位／整句完成時，同時接受「原始方向」與
      「左右鏡射」兩種排列皆視為正確──只要句子的內部順序（由上而下）沒有錯，
      句子擺在最右邊那欄或最左邊那欄都算數。詳見 _mirrorCell()。

   跟「詩仙推敲」（純觀賞、李白自動推）的差異：
   - 沒有自動解法演算法 ── 打亂只需保證合法可達（從已解盤面做隨機合法滑動），
     解題完全交給玩家操作，不需要 tuiqiao.js 那套「逐層歸位＋表演風格」邏輯。
   - 有時限、有分數、可重來/開新局，並整合 ScoreManager／GameMessage／
     DifficultySelector，屬於正式的可過關遊戲，而非無勝負的視覺療癒頁。

   美術風格套用《三字成珠》(game24) 的墨色主題：
   - 外殼（overlay/資訊列/控制鈕/難度標籤/計時框）一律用共用的 .fmd-* class
     （定義於 theme_dark.css），不重複定義。
   - 方塊視覺（圓角、單色底、內光澤、依句著色）沿用 game24 的 .game24-char-tile
     語彙，並依《遊戲類型介面設計與程式碼規範.md》§3.1 加上 game38- 前綴。

   ⚠️ 依規範 §6，一般遊戲應使用 getSharedRandomPoem 取詩；但本作是「整首詩拆成
      矩形網格」，需要每一句的字數完全相同（例如四句、每句都恰好 5 字）才能排成
      矩形棋盤，getSharedRandomPoem 的 minChars/maxChars 只保證「總字數」落在範圍
      內、不保證「每句字數相同」。因此改用自訂掃描（與同專案的 tuiqiao.js 相同
      作法，屬於同一種先例）：直接在 POEMS 內尋找「連續 N 句、每句恰好 W 字」的
      詩，找不到才降級使用固定備援詩。

   依《.agent/skills/花月開發常見錯誤與解法.md §4》規範撰寫：
   - 全域 class 前綴 game38-
   - loadCSS() 動態防護
   - overlay 掛載 document.body 且套用 registerOverlayResize
   - stopGame() 必須隱藏 container
   - ⚠️ 本作未實作「關卡挑戰」模式（僅一般難度模式），已於 README 版本紀錄中載明
   ========================================= */

(function () {
    'use strict';

    const Game38 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        score: 0,
        isWin: false,

        // ── 詩詞與棋盤 ──
        currentPoem: null,
        poemLines: [],        // 每句已去標點的純文字（每句字數相同）
        LINES: 4,             // 句數（畫面上的「寬」，直排、由右至左）
        CHARS: 5,             // 每句字數（畫面上的「高」）
        tileChar: [],         // tileChar[方塊編號] = 字（缺格為 null）
        board: [],             // board[格子] = 方塊編號；目標為 board[i] === i
        holeTile: 0,           // 空格的方塊編號（＝其目標格子索引）
        lineDone: [],          // 每句是否已完成（用於逐句獎勵與音效）
        tileEls: [],
        tileInnerEls: [],
        tileSize: 60,
        moveCount: 0,          // 玩家實際點擊次數（含扣步用不到，純供顯示/紀錄）
        mirrored: false,       // 本輪是否採「左右鏡射」的解答方向（見 _mirrorCell）
        scrambleSteps: 0,      // 本輪倒推打亂實際走的步數 T（除錯／紀錄用）

        // ── 步數限制（比照 game24 的紅白步數框） ──
        movesLeft: 0,
        maxMoves: 0,
        idleInterval: null,
        lastActionTime: 0,
        idleThreshold: 10000,   // 10 秒沒有有效操作 → 扣 1 步（同 game24 的怠功機制）

        // ── playWinAnimation 需要的欄位 ──
        // ⚠️ ScoreManager.playWinAnimation 原生是「剩餘秒數」換算加分動畫；比照
        //    game24 的手法，在勝利當下把 movesLeft/maxMoves 灌進 timer/maxTimer，
        //    讓同一套「剩餘資源飛星轉分數」動畫直接沿用在步數模式上，不必另外
        //    重寫一套動畫邏輯。startTime 固定為 0，繞過它内部的「經過秒數」換算。
        timer: 0,
        maxTimer: 0,
        startTime: 0,
        gameStartTime: null,

        /*
         * ⭐ 難度設定（歡迎自行調整）：
         *   boardKey      ：棋盤尺寸（對應 BOARD_SIZES，寬＝句數、高＝每句字數）
         *   scrambleMin/Max：本輪打亂步數 T 的隨機範圍（含頭尾），每輪重新抽一次。
         *                    T 就是「倒推打亂」实際走的合法滑動次數，也是這一盤
         *                    真正解得開所需的步數上限（見檔頭「倒推法」說明）。
         *   moveBudgetMul ：步數上限 = round(T × moveBudgetMul)。1.0 代表完全不
         *                    給容錯空間（必須抓到接近最短路徑才解得完）；數字越大
         *                    容錯越多。
         *   poemMinRating ：詩評下限
         */
        difficultySettings: {
            '小學': { boardKey: '4x5', scrambleMin: 12, scrambleMax: 16, moveBudgetMul: 1.6, poemMinRating: 6 },
            '中學': { boardKey: '4x5', scrambleMin: 20, scrambleMax: 24, moveBudgetMul: 1.8, poemMinRating: 5 },
            '高中': { boardKey: '4x7', scrambleMin: 28, scrambleMax: 32, moveBudgetMul: 2.0, poemMinRating: 4 },
            '大學': { boardKey: '4x7', scrambleMin: 42, scrambleMax: 48, moveBudgetMul: 2.5, poemMinRating: 3 },
            '研究所': { boardKey: '4x7', scrambleMin: 54, scrambleMax: 60, moveBudgetMul: 3.0, poemMinRating: 3 },
        },

        BOARD_SIZES: {
            '4x5': { lines: 4, chars: 5 },
            '4x7': { lines: 4, chars: 7 },
            '8x5': { lines: 8, chars: 5 },
            '8x7': { lines: 8, chars: 7 },
        },

        // ── 版面（邏輯像素，舞台 500×850）──
        BOARD_AREA_TOP: 108,
        BOARD_AREA_H: 660,
        BOARD_MAX_W: 460,
        TILE_GAP: 4,

        PUNCT_RE: /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('theme-dark-css')) {
                const themeLink = document.createElement('link');
                themeLink.id = 'theme-dark-css';
                themeLink.rel = 'stylesheet';
                themeLink.href = 'theme_dark.css';
                document.head.appendChild(themeLink);
            }
            if (!document.getElementById('game38-css')) {
                const link = document.createElement('link');
                link.id = 'game38-css';
                link.rel = 'stylesheet';
                link.href = 'game38.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game38-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game38-container');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game38-container';
            div.className = 'game38-overlay fmd-overlay hidden';
            div.innerHTML = `
                <div class="fmd-header">
                    <div class="fmd-score-board">分數: <span id="game38-score">0</span></div>
                    <div class="fmd-controls">
                        <button class="fmd-difficulty-tag" id="game38-diff-tag">小學</button>
                        <button id="game38-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game38-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fmd-sub-header">
                    <div id="game38-moves-label" class="fmd-moves-label">步數:<span id="game38-moves">0</span>/<span id="game38-max-moves">0</span></div>
                    <div id="game38-poem-info" class="fmd-poem-info"></div>
                </div>
                <div class="fmd-area">
                    <div id="game38-board-wrapper" class="fmd-board-wrapper game38-board-wrapper">
                        <svg id="game38-timer-ring" class="fmd-timer-ring">
                            <rect id="game38-moves-path-white" class="fmd-moves-path-white" x="3" y="3"></rect>
                            <rect id="game38-moves-path-red" class="fmd-moves-path-red" x="3" y="3"></rect>
                        </svg>
                        <div id="game38-board" class="game38-board"></div>
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

            document.getElementById('game38-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game38-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game38-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 點擊方塊（委派在棋盤容器上，涵蓋滑鼠與觸控的合成 click）
            document.getElementById('game38-board').addEventListener('click', (e) => {
                const el = e.target.closest('.game38-tile');
                if (el) this.onTileClick(el);
            });
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 隱藏其他頁面 overlay，避免畫面疊加（涵蓋既有遊戲清單）
        hideOtherContents: function () {
            const els = [];
            for (let i = 1; i <= 37; i++) els.push('game' + i + '-container');
            els.push('cardContainer', 'tuiqiao-container', 'yichichunshui-container',
                'suiyuean-container', 'zhexianren-container', 'wordcloud-container');
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
            this.stopIdleWatcher();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('推枰成詩', (selectedLevel) => {
                    this.difficulty = selectedLevel;
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
            const diffTag = document.getElementById('game38-diff-tag');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (diffTag) {
                diffTag.textContent = this.difficulty;
                diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
        },

        hide: function () { this.stopGame(); },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，必須在此隱藏 container
        stopGame: function () {
            this.isActive = false;
            this.stopIdleWatcher();
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) { this.startNewGame(); return; }
            this.startGameProcess();
        },

        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (this.selectRandomPoem()) {
                this.startGameProcess();
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        // ========================================================
        // 取詩：找出連續 LINES 句、每句剛好 CHARS 字的詩（理由見檔頭註解）
        // ========================================================
        selectRandomPoem: function () {
            const settings = this.difficultySettings[this.difficulty];
            const size = this.BOARD_SIZES[settings.boardKey];
            this.LINES = size.lines;
            this.CHARS = size.chars;
            const need = this.LINES, width = this.CHARS;

            const pool = [];
            try {
                if (typeof POEMS !== 'undefined' && Array.isArray(POEMS)) {
                    for (const p of POEMS) {
                        if (!Array.isArray(p.content)) continue;
                        if ((p.rating || 0) < settings.poemMinRating) continue;
                        const lines = p.content.map(l => (l || '').replace(this.PUNCT_RE, '')).filter(l => l.length > 0);
                        for (let s = 0; s + need <= lines.length; s += 2) {
                            const seg = lines.slice(s, s + need);
                            if (seg.every(l => l.length === width)) {
                                pool.push({ poem: p, lines: seg });
                                break;
                            }
                        }
                    }
                }
            } catch (e) { console.warn('[推枰成詩] 取詩失敗', e); }

            let picked;
            if (pool.length === 0) {
                // 降級保護：找不到符合尺寸的詩時，用固定備援詩，畫面仍可運作
                const fallback5 = ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉'];
                const fallback7 = ['朝辭白帝彩雲間', '千里江陵一日還', '兩岸猿聲啼不住', '輕舟已過萬重山'];
                const base = width === 5 ? fallback5 : fallback7;
                const lines = [];
                while (lines.length < need) lines.push(base[lines.length % base.length]);
                picked = { poem: { id: 0, title: '靜夜思', dynasty: '唐', author: '李白' }, lines: lines };
            } else {
                picked = pool[Math.floor(Math.random() * pool.length)];
            }

            this.currentPoem = picked.poem;
            this.poemLines = picked.lines;

            const poemInfo = document.getElementById('game38-poem-info');
            let title = this.currentPoem.title || '';
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const fullName = `${title} / ${this.currentPoem.dynasty || ''} / ${this.currentPoem.author || ''}`;
            poemInfo.textContent = fullName;
            poemInfo.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById && this.currentPoem.id) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // ========================================================
        // 開局：建立目標盤面、打亂、渲染
        // ========================================================
        startGameProcess: function () {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.moveCount = 0;
            document.getElementById('game38-score').textContent = 0;
            document.getElementById('game38-moves').textContent = 0;
            if (window.GameMessage) window.GameMessage.hide();
            document.getElementById('game38-retryGame-btn').disabled = false;
            document.getElementById('game38-newGame-btn').disabled = false;

            const cols = this.CHARS, rows = this.LINES, N = cols * rows;
            const settings = this.difficultySettings[this.difficulty];

            // 缺格固定在右下角（＝最後一句的最後一字，也是視覺上最自然的收尾位置）
            this.holeTile = N - 1;
            this.tileChar = new Array(N);
            for (let i = 0; i < N; i++) {
                this.tileChar[i] = (i === this.holeTile) ? null : this.poemLines[Math.floor(i / cols)][i % cols];
            }

            // ⭐ 每輪隨機決定本局是「原始方向」還是「左右鏡射」（見 _mirrorCell 與檔頭
            //   「允許從左邊開始排」說明）。打亂要從「這一輪真正認定的解答盤面」倒推，
            //   這樣步數上限的估計（T 步）才會對得上玩家實際要走的方向。
            this.mirrored = Math.random() < 0.5;
            const refBoard = new Array(N);
            for (let i = 0; i < N; i++) refBoard[i] = this.mirrored ? this._mirrorCell(i) : i;

            // ⭐ 倒推打亂：從解答盤面出發，隨機走 T 步合法滑動（T 由難度表決定範圍），
            //   走完之後這一盤「一定」在 T 步之內解得開（把這 T 步反過來走就是解答）。
            //   ⚠️ 避免無效的來回移動：不只排除「空格立刻走回上一格」，還排除「最近
            //   RECENT_WINDOW 步內去過的格子」，讓打亂路徑盡量往盤面各處擴散，而不是
            //   在小範圍內原地打轉（步數少時仍會侷限在局部，但至少會盡量往外擴）。
            const T = settings.scrambleMin + Math.floor(Math.random() * (settings.scrambleMax - settings.scrambleMin + 1));
            const RECENT_WINDOW = 6;
            const start = refBoard.slice();
            let sbp = this.mirrored ? this._mirrorCell(this.holeTile) : this.holeTile;
            let last = -1;
            const recent = [sbp];
            for (let s = 0; s < T; s++) {
                const r = Math.floor(sbp / cols), c = sbp % cols;
                const cand = [];
                if (r > 0) cand.push(sbp - cols);
                if (r < rows - 1) cand.push(sbp + cols);
                if (c > 0) cand.push(sbp - 1);
                if (c < cols - 1) cand.push(sbp + 1);
                let free = cand.filter(x => !recent.includes(x));
                if (free.length === 0) free = cand.filter(x => x !== last);
                if (free.length === 0) free = cand;
                const pick = free[Math.floor(Math.random() * free.length)];
                start[sbp] = start[pick]; start[pick] = this.holeTile;
                last = sbp; sbp = pick;
                recent.push(sbp);
                if (recent.length > RECENT_WINDOW) recent.shift();
            }
            this.board = start;
            this.scrambleSteps = T;   // 除錯／紀錄用：本輪實際打亂步數
            this.lineDone = new Array(rows).fill(false);

            this.maxMoves = Math.max(1, Math.round(T * settings.moveBudgetMul));
            this.movesLeft = this.maxMoves;

            this._buildBoardDOM();
            this._updateMovesLabel();
            requestAnimationFrame(() => this.updateMovesRing());
            this.startIdleWatcher();
        },

        /** 座標鏡射：把「第 rs 句」換成「倒數第 rs 句」（句子內部由上而下的字序不變，
         *  只反轉句子之間的左右順序）。用來讓「從左邊開始排」也被判定為正確解答——
         *  傳統直排由右至左，但玩家不見得知道這個慣例。cell 是解法器座標
         *  （rs*cols+cs，rs=第幾句、cs=句中第幾字），回傳鏡射後的解法器座標。
         *  是自身的反函式（鏡射兩次等於沒鏡射）。 */
        _mirrorCell: function (cell) {
            const cols = this.CHARS, rows = this.LINES;
            const rs = Math.floor(cell / cols), cs = cell % cols;
            return (rows - 1 - rs) * cols + cs;
        },

        // ========================================================
        // 盤面 DOM（結構沿用 tuiqiao.js 的座標轉置：解法器 [句][字] → 畫面直排、由右至左）
        // ========================================================
        _screenPos: function (cell) {
            const cols = this.CHARS;
            const rs = Math.floor(cell / cols);
            const cs = cell % cols;
            return { row: cs, col: this.LINES - 1 - rs };
        },

        _buildBoardDOM: function () {
            const board = document.getElementById('game38-board');
            board.innerHTML = '';
            const N = this.LINES * this.CHARS;

            const tw = Math.floor((this.BOARD_MAX_W - this.TILE_GAP * (this.LINES - 1)) / this.LINES);
            const th = Math.floor((this.BOARD_AREA_H - this.TILE_GAP * (this.CHARS - 1)) / this.CHARS);
            this.tileSize = Math.max(24, Math.min(tw, th, 96));
            const bw = this.tileSize * this.LINES + this.TILE_GAP * (this.LINES - 1);
            const bh = this.tileSize * this.CHARS + this.TILE_GAP * (this.CHARS - 1);
            board.style.width = bw + 'px';
            board.style.height = bh + 'px';

            this.tileEls = new Array(N).fill(null);
            this.tileInnerEls = new Array(N).fill(null);
            const totalLines = this.LINES;
            for (let tile = 0; tile < N; tile++) {
                const ch = this.tileChar[tile];
                if (ch === null || ch === undefined) continue;

                const lineIdx = Math.floor(tile / this.CHARS);
                const color = (window.TileStyleUtils && window.TileStyleUtils.getGroupColor)
                    ? window.TileStyleUtils.getGroupColor(lineIdx, totalLines)
                    : { hue: (lineIdx * 47) % 360, sat: 90, lum: 70, textColor: 'hsl(0,0%,12%)' };

                const el = document.createElement('div');
                el.className = 'game38-tile';
                el.dataset.tile = tile;
                el.style.width = el.style.height = this.tileSize + 'px';
                el.style.fontSize = Math.round(this.tileSize * 0.58) + 'px';

                const inner = document.createElement('div');
                inner.className = 'game38-tile-inner';
                inner.textContent = ch;
                inner.style.setProperty('--g38-h', color.hue);
                inner.style.setProperty('--g38-s', color.sat + '%');
                inner.style.setProperty('--g38-l', color.lum + '%');
                inner.style.setProperty('--g38-text', color.textColor);
                el.appendChild(inner);

                board.appendChild(el);
                this.tileEls[tile] = el;
                this.tileInnerEls[tile] = inner;
            }

            this._layoutTiles(true);
            this._playEntrance();
        },

        _layoutTiles: function (instant) {
            const step = this.tileSize + this.TILE_GAP;
            for (let cell = 0; cell < this.board.length; cell++) {
                const tile = this.board[cell];
                const el = this.tileEls[tile];
                if (!el) continue;
                const p = this._screenPos(cell);
                if (instant) el.style.transition = 'none';
                el.style.transform = `translate(${p.col * step}px, ${p.row * step}px)`;
                if (instant) { void el.offsetWidth; el.style.transition = ''; }
            }
            this._updateAdjacentHighlight();
        },

        /** 開局進場：依畫面左上→右下順序，方塊一個接一個由小放大到正確尺寸（同 tuiqiao.js 手法） */
        _playEntrance: function () {
            const order = [];
            for (let cell = 0; cell < this.board.length; cell++) {
                const p = this._screenPos(cell);
                order.push({ tile: this.board[cell], key: p.row * this.LINES + p.col });
            }
            order.sort((a, b) => a.key - b.key);
            const appearing = order.filter(o => this.tileInnerEls[o.tile]);
            const total = Math.max(1, appearing.length - 1);
            const WINDOW_MS = 550, TILE_MS = 360;
            appearing.forEach((o, k) => {
                const inner = this.tileInnerEls[o.tile];
                const delay = (k / total) * (WINDOW_MS / 1000);
                inner.style.setProperty('--g38-appear-dur', (TILE_MS / 1000).toFixed(3) + 's');
                inner.style.animationDelay = delay.toFixed(3) + 's';
                inner.classList.add('game38-tile-appear');
                const cleanup = () => inner.classList.remove('game38-tile-appear');
                inner.addEventListener('animationend', function onEnd(e) {
                    if (e.animationName !== 'game38-tile-grow') return;
                    cleanup();
                    inner.removeEventListener('animationend', onEnd);
                });
                setTimeout(cleanup, delay * 1000 + TILE_MS + 80);
            });
        },

        /** 標示緊鄰空格、可點擊推動的方塊（視覺提示，讓玩家一眼看出能點哪裡） */
        _updateAdjacentHighlight: function () {
            const cols = this.CHARS, rows = this.LINES;
            const holeCell = this.board.indexOf(this.holeTile);
            const hr = Math.floor(holeCell / cols), hc = holeCell % cols;
            this.tileEls.forEach(el => { if (el) el.classList.remove('adjacent'); });
            const neighbours = [];
            if (hr > 0) neighbours.push(holeCell - cols);
            if (hr < rows - 1) neighbours.push(holeCell + cols);
            if (hc > 0) neighbours.push(holeCell - 1);
            if (hc < cols - 1) neighbours.push(holeCell + 1);
            for (const cell of neighbours) {
                const el = this.tileEls[this.board[cell]];
                if (el) el.classList.add('adjacent');
            }
        },

        // ========================================================
        // 玩家點擊方塊
        // ========================================================
        onTileClick: function (el) {
            if (!this.isActive) return;
            const tile = parseInt(el.dataset.tile, 10);
            const fromCell = this.board.indexOf(tile);
            const holeCell = this.board.indexOf(this.holeTile);
            const cols = this.CHARS;
            const dr = Math.floor(fromCell / cols) - Math.floor(holeCell / cols);
            const dc = (fromCell % cols) - (holeCell % cols);
            if (Math.abs(dr) + Math.abs(dc) !== 1) {
                // 不緊鄰空格：不是合法的一步，輕輕晃一下表示無效，不扣分不罰步數
                el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
                setTimeout(() => el.classList.remove('shake'), 260);
                return;
            }

            // 滑動：方塊移到空格原位，空格移到方塊原位
            const step = this.tileSize + this.TILE_GAP;
            const p = this._screenPos(holeCell);
            el.style.transition = 'transform 150ms cubic-bezier(0.34, 1.2, 0.64, 1)';
            el.style.transform = `translate(${p.col * step}px, ${p.row * step}px)`;
            this.board[holeCell] = tile;
            this.board[fromCell] = this.holeTile;
            this.moveCount++;
            if (window.SoundManager) window.SoundManager.playHit(this.moveCount % 5, 0.04);

            this._updateAdjacentHighlight();
            this.resetIdleTimer();
            this.movesLeft = Math.max(0, this.movesLeft - 1);
            this._updateMovesLabel();
            this.updateMovesRing();

            setTimeout(() => {
                this._checkLanded(tile, holeCell);
                this._checkLineDone();
                if (this._checkWin()) {
                    this.gameOver(true);
                } else if (this.movesLeft <= 0) {
                    this.gameOver(false, '步數用盡');
                }
            }, 160);
        },

        // 方塊落在「正確位置」的判定：接受原始方向（cell===tile）或左右鏡射
        // （cell===_mirrorCell(tile)）兩種——玩家不見得知道要從哪一邊開始排。
        _isCorrectCell: function (tile, cell) {
            return cell === tile || cell === this._mirrorCell(tile);
        },

        _checkLanded: function (tile, cell) {
            if (!this._isCorrectCell(tile, cell)) return;
            const el = this.tileEls[tile];
            if (!el) return;
            el.classList.remove('landed');
            void el.offsetWidth;
            el.classList.add('landed');
            setTimeout(() => el && el.classList.remove('landed'), 460);

            if (window.ScoreManager) this.score += window.ScoreManager.getPointA('game38', this.difficulty);
            document.getElementById('game38-score').textContent = Math.floor(this.score);
            if (window.SoundManager) window.SoundManager.playGuzheng(3 + (cell % 5), 0.2);
        },

        // 一句是否已完成：這一句的每個字都各自落在「原始方向」的目標格，或都落在
        // 「鏡射方向」的目標格──兩種方向各自獨立檢查（不能一半落原始、一半落鏡射，
        // 那樣句子內部順序仍然是錯的），只要其中一種方向全對就算這句完成。
        _isLineDone: function (line) {
            const cols = this.CHARS;
            let okOriginal = true, okMirrored = true;
            for (let c = 0; c < cols; c++) {
                const tile = line * cols + c;
                if (this.board[tile] !== tile) okOriginal = false;
                if (this.board[this._mirrorCell(tile)] !== tile) okMirrored = false;
                if (!okOriginal && !okMirrored) return false;
            }
            return okOriginal || okMirrored;
        },

        _checkLineDone: function () {
            const cols = this.CHARS;
            for (let line = 0; line < this.LINES; line++) {
                if (this.lineDone[line]) continue;
                if (!this._isLineDone(line)) continue;
                this.lineDone[line] = true;
                for (let c = 0; c < cols; c++) {
                    const tile = line * cols + c;
                    const el = this.tileEls[tile];
                    if (!el) continue;
                    setTimeout(() => {
                        el.classList.add('line-done');
                        setTimeout(() => el.classList.remove('line-done'), 700);
                    }, c * 50);
                }
                if (window.ScoreManager) this.score += window.ScoreManager.getPointB('game38', this.difficulty);
                document.getElementById('game38-score').textContent = Math.floor(this.score);
                if (window.SoundManager) window.SoundManager.playSuccessShort();
            }
        },

        // 過關判定：整盤符合「原始方向」或整盤符合「左右鏡射方向」皆算解開。
        // ⚠️ 不可以逐格各自比對兩種方向再全部 OR 起來（那樣會誤判「一半原始、
        //   一半鏡射」的混合盤面為過關）──必須分開驗證兩個完整方向，其中一個
        //   整體成立才算數。
        _checkWin: function () {
            let okOriginal = true, okMirrored = true;
            for (let i = 0; i < this.board.length; i++) {
                if (this.board[i] !== i) okOriginal = false;
                if (this.board[this._mirrorCell(i)] !== i) okMirrored = false;
                if (!okOriginal && !okMirrored) return false;
            }
            return okOriginal || okMirrored;
        },

        _updateMovesLabel: function () {
            const movesEl = document.getElementById('game38-moves');
            const maxEl = document.getElementById('game38-max-moves');
            if (movesEl) movesEl.textContent = this.movesLeft;
            if (maxEl) maxEl.textContent = this.maxMoves;
        },

        // ========================================================
        // 步數限制：10 秒沒有有效操作自動扣 1 步（比照 game24 的怠功機制）
        // ========================================================
        startIdleWatcher: function () {
            this.stopIdleWatcher();
            this.lastActionTime = Date.now();
            this.idleInterval = setInterval(() => {
                if (!this.isActive) return;
                if (Date.now() - this.lastActionTime < this.idleThreshold) return;
                this.movesLeft = Math.max(0, this.movesLeft - 1);
                this.lastActionTime = Date.now();
                this._updateMovesLabel();
                this.updateMovesRing();
                if (window.SoundManager && window.SoundManager.playFailure) window.SoundManager.playFailure();
                if (this.movesLeft <= 0 && !this._checkWin()) {
                    this.gameOver(false, '怠功！步數用盡');
                }
            }, 200);
        },

        stopIdleWatcher: function () {
            if (this.idleInterval) { clearInterval(this.idleInterval); this.idleInterval = null; }
        },

        // 有效操作（成功滑動一步）時呼叫：把閒置起算點推回現在
        resetIdleTimer: function () {
            this.lastActionTime = Date.now();
        },

        // ── 紅白步數倒數框（完全比照 game24／game9）──
        //   依 maxMoves 將外框等分成 N 段；奇紅偶白交替；每走一步從尾段開始扣除
        updateMovesRing: function () {
            const rectRed = document.getElementById('game38-moves-path-red');
            const rectWhite = document.getElementById('game38-moves-path-white');
            const wrapper = document.getElementById('game38-board-wrapper');
            const svg = document.getElementById('game38-timer-ring');
            if (!rectRed || !rectWhite || !wrapper || !svg) return;
            if (!this.maxMoves || this.maxMoves <= 0) return;

            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rb = wrapper.getBoundingClientRect();
                w = rb.width; h = rb.height;
            }
            if (w === 0) return;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';
            // ⚠️ .fmd-moves-path-red/white 在共用主題裡預設 display:none（讓純時間制
            //    的遊戲不會平白多兩個看不見的 SVG rect）。本作全程都是步數模式，
            //    第一次算 ring 時就要主動打開，否則紅白框永遠不會出現。
            rectRed.style.display = 'block';
            rectWhite.style.display = 'block';
            rectRed.setAttribute('width', w - 6);
            rectRed.setAttribute('height', h - 6);
            rectWhite.setAttribute('width', w - 6);
            rectWhite.setAttribute('height', h - 6);

            const totalLength = (w - 6 + h - 6) * 2;
            const segment = totalLength / this.maxMoves;
            const dashArrayRed = [];
            const dashArrayWhite = [];
            for (let i = 1; i <= this.maxMoves; i++) {
                const isVisible = i <= this.movesLeft;
                const isRedSlot = (i % 2 === 0);
                if (isVisible) {
                    if (isRedSlot) { dashArrayWhite.push(0, segment); dashArrayRed.push(segment, 0); }
                    else { dashArrayWhite.push(segment, 0); dashArrayRed.push(0, segment); }
                } else {
                    dashArrayWhite.push(0, segment); dashArrayRed.push(0, segment);
                }
            }
            rectRed.style.strokeDasharray = dashArrayRed.join(' ');
            rectWhite.style.strokeDasharray = dashArrayWhite.join(' ');
        },

        // ScoreManager.playWinAnimation 於勝利動畫中呼叫（'win' 模式）：
        // 依剩餘資源比例 ratio 反推 movesLeft、重畫紅白框。本作全程都是步數模式，
        // 不像 game24 還保留時間模式分支，因此任何呼叫一律走這個換算。
        updateTimerRing: function (ratio) {
            if (typeof ratio === 'number') this.movesLeft = Math.round(ratio * this.maxMoves);
            this.updateMovesRing();
        },

        // ========================================================
        // 結算（勝／敗）
        // ========================================================
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            this.stopIdleWatcher();

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({ gameNo: 38, difficulty: this.difficulty || '', score: 0, isWin: false, durationS: durationS });
            }

            if (win) {
                document.getElementById('game38-retryGame-btn').disabled = true;
                document.getElementById('game38-newGame-btn').disabled = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
            } else {
                document.getElementById('game38-retryGame-btn').disabled = false;
                document.getElementById('game38-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playFailure();
            }

            const onConfirm = () => { if (win) this.startNewGame(); else this.retryGame(); };

            const showMessage = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore || this.score) : 0,
                        reason: win ? '' : (typeof reason === 'string' ? reason : '步數用盡'),
                        btnText: win ? '下一局' : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && window.ScoreManager) {
                // ⚠️ playWinAnimation 原生是「剩餘秒數」換算加分動畫；比照 game24 的
                //    手法，把 movesLeft/maxMoves 灌進 timer/maxTimer、startTime 設 0，
                //    讓同一套「剩餘資源飛星轉分數」動畫直接沿用在步數模式上。
                this.timer = this.movesLeft;
                this.maxTimer = this.maxMoves;
                this.startTime = 0;
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game38',
                    timerContainerId: 'game38-board-wrapper',
                    scoreElementId: 'game38-score',
                    heartsSelector: '.game38-no-hearts', // 本作無紅心機制 —— 用永不命中的 selector
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        showMessage(finalScore);
                    }
                });
            } else {
                showMessage();
            }
        },
    };

    window.Game38 = Game38;

    // 透過 ?game=38 URL 參數自動啟動（精確比對，避免 game=3 誤觸）
    if (new URLSearchParams(window.location.search).get('game') === '38') {
        setTimeout(() => {
            if (window.Game38) window.Game38.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
