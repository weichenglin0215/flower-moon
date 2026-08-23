/* =========================================
   Game40《點兵成詩》(Muster the Verse)
   ----------------------------------------
   考驗「眼、腦、手」並用的辨識 ＋ 連點遊戲。介面沿用 GAME24《三字成珠》
   的墨色外殼（.fmd-* 共用主題）與字塊視覺語彙。

   ── 玩法 ──
   題目為「兩句同長度的詩」（五言或七言）。答案區是一整面亂序字塊：
     每一句的第 1 個字有 1 塊、第 2 個字有 2 塊、第 3 個字有 3 塊 …
     第 N 個字有 N 塊。
   以「床前明月光／疑是地上霜」為例，答案區共有
     床×1、前×2、明×3、月×4、光×5、疑×1、是×2、地×3、上×4、霜×5 ＝ 30 塊，
   剛好鋪滿 5 欄 × 6 列。玩家必須「依序」把它們點完：
     先連續點 1 個「床」→ 2 個「前」→ 3 個「明」→ … → 5 個「霜」。
   點錯（點到非當前目標字的字塊）扣一顆紅心，紅心用盡即敗北。

   ── 為什麼盤面一定塞得剛好 ──
     五言：(1+2+3+4+5) × 2 句 = 30 = 5 欄 × 6 列
     七言：(1+2+…+7) × 2 句 = 56 = 7 欄 × 8 列
   即 N 言 → N 欄 ×(N+1) 列，恆等式 2 × N(N+1)/2 = N(N+1)。

   ── 難度參數（顏色 / 形狀 / 題目揭示字數 三軸遞增） ──
     小學  ：五言、七彩 ＋ 七形（雙重線索最好認）、題目全部揭示
     中學  ：五言、七彩 ＋ 七形、題目每句只揭示前 4 字
     高中  ：五言、七彩、形狀全同（少一條線索）、題目每句只揭示前 3 字
     大學  ：七言、全部白底黑字（顏色形狀線索全失，只能讀字）、每句揭示前 3 字
     研究所：七言、刻意一半白底黑字、一半黑底白字混淆，且
             ⚠️「同一個字」的字塊必定同時存在兩種配色（絕不以句子或字為單位整批同色），
             讓玩家無法用底色去分群，只能真的一個字一個字讀。

   依《.agent/skills/花月開發常見錯誤與解法.md §4》規範撰寫：
   - 全域 class 前綴 game40-
   - loadCSS() 動態防護
   - overlay 掛載 document.body 且套用 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 時限以「實際題目字數 × timeLimitRate」計算（在取詩之後）
   - 完整支援關卡挑戰模式
   ========================================= */

(function () {

    // ── 七種色相（依規格「最多七種顏色」）────────────────────────────
    //   刻意挑選在深墨底上彼此距離夠遠的色相，避免相鄰色相互混淆。
    const HUES = [0, 32, 55, 130, 192, 262, 320];

    // ── 七種形狀（依規格「最多七種形狀」）────────────────────────────
    //   ⚠️ 刻意避開會把中央漢字裁掉的形狀（如菱形、三角形）：
    //   octagon / hexagon 用 clip-path 但中央區域完整；其餘皆以 border-radius
    //   變形，完全不裁切字體。
    const SHAPES = ['rsquare', 'circle', 'octagon', 'hexagon', 'ssquare', 'leaf', 'ellipse'];

    const Game40 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        isWin: false,
        container: null,

        // ── 紅心 ──
        mistakeCount: 0,
        maxMistakeCount: 5,

        // ── 詩詞 / 題目 ──
        currentPoem: null,
        poemLines: [],        // 兩句（已去標點）
        charsPerLine: 5,      // 每句字數（5 或 7）
        uniqueChars: [],      // 兩句去重後的字（決定配色 / 形狀分組）
        targets: [],          // [{ char, count, line, pos }] 依點擊順序排列
        targetIndex: 0,       // 當前要點的目標索引
        clicksInTarget: 0,    // 當前目標已點中幾個

        // ── 棋盤 ──
        rows: 6,
        cols: 5,
        tiles: [],            // [{ char, cleared, inverse }]，長度 = rows × cols

        // ── 計時器 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        /*
         * 難度設定
         *   timeLimitRate  ：每字（＝每個字塊）時間倍率（秒）。
         *                    實際時限 = 實際字塊總數 × timeLimitRate，必須在取詩後計算。
         *   poemMinRating  ：詩評下限
         *   charsPerLine   ：每句字數，5＝五言（5×6 盤）、7＝七言（7×8 盤）
         *   useColor       ：字塊是否依「字」分七彩（false → 單一白底黑字）
         *   useShape       ：字塊是否依「字」分七形（false → 全部圓角方形）
         *   invertMix      ：true＝研究所專用，同一個字的字塊刻意一半白底黑字、
         *                    一半黑底白字，製造混淆
         *   showQuestion   ：題目區每一句揭示前幾個字（其餘顯示為〇）
         *   maxMistakeCount：可點錯幾次（紅心數）
         */
        difficultySettings: {
            '小學': { timeLimitRate: 3.0, poemMinRating: 6, charsPerLine: 5, useColor: true, useShape: true, invertMix: false, showQuestion: 5, maxMistakeCount: 6 },
            '中學': { timeLimitRate: 2.6, poemMinRating: 5, charsPerLine: 5, useColor: true, useShape: true, invertMix: false, showQuestion: 4, maxMistakeCount: 5 },
            '高中': { timeLimitRate: 2.2, poemMinRating: 4, charsPerLine: 5, useColor: true, useShape: false, invertMix: false, showQuestion: 3, maxMistakeCount: 4 },
            '大學': { timeLimitRate: 2.0, poemMinRating: 3, charsPerLine: 7, useColor: false, useShape: false, invertMix: false, showQuestion: 3, maxMistakeCount: 3 },
            '研究所': { timeLimitRate: 1.8, poemMinRating: 3, charsPerLine: 7, useColor: false, useShape: false, invertMix: true, showQuestion: 2, maxMistakeCount: 2 }
        },

        // ====================================================================
        // 樣式工具
        // ====================================================================

        /*
         * 取得某個字的「分組視覺樣式」。
         * 分組依據＝該字在 uniqueChars 中的索引（相同字必定同色同形）。
         *   色相 = HUES[idx % 7]   → 最多七種顏色（規格上限）
         *   形狀 = SHAPES[idx % 7] → 最多七種形狀（規格上限）
         *
         * ⚠️ 一句詩最多 7 字、兩句去重後最多 14 個字，會超過 7 種的循環週期。
         *    第 8 個字起（idx ≥ 7）色相與形狀都會與第 1~7 個字重覆，因此改以
         *    「明度」作為第三軸區分（亮色系 / 暗色系），維持每個字都有唯一外觀，
         *    同時仍嚴守「顏色最多七種、形狀最多七種」的規格。
         */
        getStyleForChar: function (ch) {
            const settings = this.difficultySettings[this.difficulty];
            const idx = this.uniqueChars.indexOf(ch);
            const safeIdx = idx < 0 ? 0 : idx;
            const isSecondCycle = safeIdx >= HUES.length; // 第 8 個字起進入第二輪
            return {
                hue: settings.useColor ? HUES[safeIdx % HUES.length] : 0,
                sat: settings.useColor ? 85 : 0,
                lum: settings.useColor ? (isSecondCycle ? 46 : 72) : 96,
                // 深色底改用淺字，確保對比度足夠
                text: (settings.useColor && isSecondCycle) ? 'hsl(0, 0%, 97%)' : 'hsl(0, 0%, 12%)',
                shape: settings.useShape ? SHAPES[safeIdx % SHAPES.length] : SHAPES[0]
            };
        },

        /*
         * 把分組樣式套到 DOM 元素上（CSS 變數 + 形狀 class）。
         * inverse=true 時改為黑底白字（研究所混淆模式）。
         */
        applyTileStyle: function (el, ch, inverse) {
            const st = this.getStyleForChar(ch);
            SHAPES.forEach(s => el.classList.remove('game40-shape-' + s));
            el.classList.add('game40-shape-' + st.shape);
            if (inverse) {
                // 黑底白字：不套色相，純粹以明暗製造混淆
                el.classList.add('game40-inverse');
                el.style.setProperty('--g40-h', st.hue);
                el.style.setProperty('--g40-s', '0%');
                el.style.setProperty('--g40-l', '12%');
                el.style.setProperty('--g40-text', 'hsl(0, 0%, 96%)');
            } else {
                el.classList.remove('game40-inverse');
                el.style.setProperty('--g40-h', st.hue);
                el.style.setProperty('--g40-s', st.sat + '%');
                el.style.setProperty('--g40-l', st.lum + '%');
                el.style.setProperty('--g40-text', st.text);
            }
        },

        // ====================================================================
        // 初始化與 DOM
        // ====================================================================

        // CSS 載入防護：先確保共用墨色主題（.fmd-*）存在，再載入本作專屬樣式
        loadCSS: function () {
            if (!document.getElementById('theme-dark-css')) {
                const themeLink = document.createElement('link');
                themeLink.id = 'theme-dark-css';
                themeLink.rel = 'stylesheet';
                themeLink.href = 'theme_dark.css';
                document.head.appendChild(themeLink);
            }
            if (!document.getElementById('game40-css')) {
                const link = document.createElement('link');
                link.id = 'game40-css';
                link.rel = 'stylesheet';
                link.href = 'game40.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game40-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game40-container');
        },

        // 建立 overlay DOM 並掛載至 document.body（非 #stage，避免 scale 重複縮放）
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game40-container';
            div.className = 'game40-overlay fmd-overlay hidden';
            div.innerHTML = `
                <div class="fmd-header">
                    <div class="fmd-score-board">分數: <span id="game40-score">0</span></div>
                    <div class="fmd-controls">
                        <button class="fmd-difficulty-tag" id="game40-diff-tag">小學</button>
                        <button id="game40-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game40-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fmd-sub-header">
                    <div id="game40-hearts" class="hearts"></div>
                    <div id="game40-poem-info" class="fmd-poem-info"></div>
                </div>
                <div class="fmd-info-bar">
                    <div id="game40-question" class="game40-question"></div>
                    <div id="game40-hint" class="game40-hint"></div>
                </div>
                <div class="fmd-area">
                    <div id="game40-board-wrapper" class="fmd-board-wrapper">
                        <svg id="game40-timer-ring" class="fmd-timer-ring">
                            <rect id="game40-timer-path" class="fmd-timer-path" x="3" y="3"></rect>
                        </svg>
                        <div id="game40-board" class="game40-board"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放（依 stage 視窗適配系統 §3.1）
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

            document.getElementById('game40-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game40-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game40-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 以事件委派接住整面棋盤的點擊（字塊會被反覆重繪，委派最穩）
            const board = document.getElementById('game40-board');
            board.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'touch') e.preventDefault();
                const cell = e.target.closest('.game40-cell');
                if (!cell) return;
                this.handleTileClick(parseInt(cell.dataset.idx, 10), cell);
            });
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 隱藏其他頁面 overlay，避免畫面疊加
        hideOtherContents: function () {
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = 'none';
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('點兵成詩', (selectedLevel, levelIndex) => {
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

        // 更新 UI 模式（挑戰模式 vs 一般模式）
        updateUIForMode: function () {
            const diffTag = document.getElementById('game40-diff-tag');
            const retryBtn = document.getElementById('game40-retryGame-btn');
            const newBtn = document.getElementById('game40-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };

            if (diffTag) {
                diffTag.textContent = this.isLevelMode ? `${window.FMRoundLabel(this.currentLevelIndex)}` : this.difficulty;
                diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
            // 挑戰模式隱藏「開新局」，避免玩家意外跳出挑戰流程
            if (newBtn) newBtn.style.display = this.isLevelMode ? 'none' : 'inline-block';
            if (retryBtn) retryBtn.style.display = 'inline-block';
        },

        hide: function () {
            this.stopGame();
        },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，必須在此隱藏 container
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // ====================================================================
        // 局流程
        // ====================================================================

        // 重來：使用同一首詩重新洗牌發牌（不重新取詩，因此沿用上一局的 maxTimer）
        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess();
            this.gameStart();
        },

        // 開新局：重抽詩詞，並顯示開場規則說明
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (this.selectRandomPoem()) {
                this.startGameProcess();
                this.showStartMessage();
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        /*
         * 抽詩：本作要求「兩句、且兩句字數相同（皆為 5 或皆為 7）」，
         * 否則盤面 N×(N+1) 的恆等式不成立、字塊會塞不滿或溢出。
         * getSharedRandomPoem 只保證總字數區間，仍可能抽到 4+6 這種不對稱的長短句
         * （詞牌類作品），因此加上驗證與重試。
         *   ⚠️ 關卡挑戰模式必須是「同一關永遠同一首詩」，所以重試時把
         *      種子偏移為 currentLevelIndex + attempt × 1000（仍為確定性），
         *      而不是退回 Math.random()。
         */
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要先載入 script.js 中的 getSharedRandomPoem 函數');
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            const n = settings.charsPerLine;
            const totalChars = n * 2;

            let result = null;
            for (let attempt = 0; attempt < 40; attempt++) {
                const seed = this.isLevelMode ? (this.currentLevelIndex + attempt * 1000) : null;
                const r = getSharedRandomPoem(
                    settings.poemMinRating, 2, 2, totalChars, totalChars, '', seed, 'game40'
                );
                if (r && r.lines && r.lines.length === 2 &&
                    r.lines[0].length === n && r.lines[1].length === n) {
                    result = r;
                    break;
                }
            }
            if (!result) {
                console.warn('[game40] 找不到兩句皆為 ' + n + ' 字的詩，改用寬鬆條件');
                return false;
            }

            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.charsPerLine = n;

            // 詩名（依規範最多顯示 12 字）
            let title = this.currentPoem.title;
            if (title.length > 12) title = title.substring(0, 10) + '...';
            const infoEl = document.getElementById('game40-poem-info');
            infoEl.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            infoEl.title = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };

            // ⚠️ 時限必須在取詩之後、用「實際字塊總數」計算（§1.1 規範）
            //    字塊總數 = 2 × (1+2+…+n) = n × (n+1)
            const tileCount = n * (n + 1);
            this.maxTimer = Math.ceil(tileCount * settings.timeLimitRate);
            this.timer = this.maxTimer;
            return true;
        },

        // 建構本局的題目、盤面與 UI（不啟動計時，計時由 gameStart 開始）
        startGameProcess: function () {
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            const settings = this.difficultySettings[this.difficulty];
            this.isActive = false;
            this.isWin = false;
            this.score = 0;
            this.mistakeCount = 0;
            this.maxMistakeCount = settings.maxMistakeCount;
            this.targetIndex = 0;
            this.clicksInTarget = 0;
            this.timer = this.maxTimer;

            const n = this.charsPerLine;
            this.cols = n;
            this.rows = n + 1;

            // 去重後的字（決定配色與形狀分組；相同字必定同色同形）
            this.uniqueChars = [];
            this.poemLines.join('').split('').forEach(ch => {
                if (this.uniqueChars.indexOf(ch) < 0) this.uniqueChars.push(ch);
            });

            // 目標序列：第 L 句第 i 個字需連續點 (i+1) 次
            this.targets = [];
            this.poemLines.forEach((line, L) => {
                Array.from(line).forEach((ch, i) => {
                    this.targets.push({ char: ch, count: i + 1, line: L, pos: i });
                });
            });

            this.buildTiles();

            document.getElementById('game40-score').textContent = '0';
            document.getElementById('game40-retryGame-btn').disabled = false;
            document.getElementById('game40-newGame-btn').disabled = false;

            this.updateUIForMode();
            this.renderHearts();
            this.renderQuestion();
            this.renderHint();

            // ⚠️ 必須先依 rows/cols 設好 wrapper 高度（確保每格正方形），再渲染棋盤
            this._resizeBoardWrapper();
            this.renderBoard();

            const svg = document.getElementById('game40-timer-ring');
            if (svg) svg.style.display = 'block';
            requestAnimationFrame(() => this.updateTimerRing(1));
        },

        // 顯示開場規則說明；按下確認才真正開始計時
        showStartMessage: function () {
            const n = this.charsPerLine;
            if (window.RuleNoteDialog) {
                window.RuleNoteDialog.show({
                    title: '點兵成詩',
                    lines: [
                        `題目是兩句${n === 5 ? '五' : '七'}言詩。`,
                        '答案區裡，每句的第 1 個字有 1 塊、',
                        '第 2 個字有 2 塊…以此類推。',
                        '　',
                        '請照著提示，依序把它們點完。',
                        '點錯字扣一顆紅心。'
                    ],
                    btnText: '開始點兵',
                    styles: { height: '60%', top: '60%' },
                    onConfirm: () => this.gameStart()
                });
            } else {
                this.gameStart();
            }
        },

        // 正式開始：啟動倒數
        gameStart: function () {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.startTimer();
        },

        // ====================================================================
        // 盤面
        // ====================================================================

        /*
         * 產生字塊陣列並洗牌。
         * 每個目標貢獻 count 塊同字的字塊，總數必定等於 rows × cols。
         */
        buildTiles: function () {
            const tiles = [];
            this.targets.forEach(t => {
                for (let k = 0; k < t.count; k++) {
                    tiles.push({ char: t.char, cleared: false, inverse: false });
                }
            });

            // 研究所混淆模式：以「字」為單位分半上黑白兩色。
            // ⚠️ 規格明訂：不可用句子或整個字為單位整批同色 ——
            //    同一個字若有 2 塊以上，必定同時出現白底黑字與黑底白字。
            if (this.difficultySettings[this.difficulty].invertMix) {
                let singleToggle = 0; // 只有 1 塊的字（每句首字）無法自我分半，改用全域交替維持整體比例
                this.uniqueChars.forEach(ch => {
                    const group = tiles.filter(t => t.char === ch);
                    if (group.length === 1) {
                        group[0].inverse = (singleToggle++ % 2 === 1);
                        return;
                    }
                    // 先打亂同字群組，再取前半數設為反色，確保兩種配色都存在
                    this.shuffle(group);
                    const invCount = Math.floor(group.length / 2);
                    for (let i = 0; i < invCount; i++) group[i].inverse = true;
                });
            }

            this.shuffle(tiles);
            this.tiles = tiles;
        },

        // Fisher-Yates 洗牌（就地）
        shuffle: function (arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
            return arr;
        },

        /*
         * 依 rows/cols 計算 wrapper 高度，保證每格為正方形。
         *   cell 邊長  = (wrapper 寬 − 28px padding) / cols
         *   wrapper 高 = cell 邊長 × rows + 28px padding
         */
        _resizeBoardWrapper: function () {
            const wrapper = document.getElementById('game40-board-wrapper');
            if (!wrapper) return;
            const PAD = 14 * 2; // CSS .fmd-board-wrapper padding: 14px
            let w = wrapper.offsetWidth || wrapper.getBoundingClientRect().width;
            if (!w || !this.cols || !this.rows) return;
            const cell = (w - PAD) / this.cols;
            wrapper.style.height = Math.round(cell * this.rows + PAD) + 'px';
        },

        // 渲染整面棋盤
        renderBoard: function () {
            const boardEl = document.getElementById('game40-board');
            if (!boardEl) return;
            boardEl.innerHTML = '';
            boardEl.style.gridTemplateColumns = `repeat(${this.cols}, 1fr)`;
            boardEl.style.gridTemplateRows = `repeat(${this.rows}, 1fr)`;

            // 字級＝格子邊長的 68%（依規範避免超出格子）
            let bw = boardEl.offsetWidth, bh = boardEl.offsetHeight;
            if (!bw || !bh) {
                const rb = boardEl.getBoundingClientRect();
                bw = rb.width; bh = rb.height;
            }
            const cellSize = Math.min((bw - this.cols * 3) / this.cols, (bh - this.rows * 3) / this.rows);
            const fontPx = Math.max(12, Math.floor(cellSize * 0.68));

            this.tiles.forEach((t, idx) => {
                const div = document.createElement('div');
                div.className = 'game40-cell';
                div.dataset.idx = idx;
                div.textContent = t.char;
                div.style.fontSize = fontPx + 'px';
                this.applyTileStyle(div, t.char, t.inverse);
                if (t.cleared) div.classList.add('cleared');
                boardEl.appendChild(div);
            });
        },

        // ====================================================================
        // 題目區 / 提示列
        // ====================================================================

        /*
         * 題目區：兩句各一行，每個字一張小卡（上方字、下方所需點擊次數）。
         * 依難度只揭示每句前 showQuestion 個字，其餘顯示為「〇」——
         * 但次數永遠可見，因為那是玩家最需要記住的節奏。
         * 已完成的字轉為金色打勾態，當前目標字加脈動外框。
         */
        renderQuestion: function () {
            const el = document.getElementById('game40-question');
            if (!el) return;
            const settings = this.difficultySettings[this.difficulty];
            const cur = this.targets[this.targetIndex];
            let html = '';

            this.poemLines.forEach((line, L) => {
                html += '<div class="game40-q-line">';
                Array.from(line).forEach((ch, i) => {
                    const revealed = i < settings.showQuestion;
                    const done = this.isSlotDone(L, i);
                    const isCur = cur && cur.line === L && cur.pos === i;
                    const cls = 'game40-q-char'
                        + (revealed ? '' : ' masked')
                        + (done ? ' done' : '')
                        + (isCur ? ' current' : '');
                    html += `<span class="${cls}" data-line="${L}" data-pos="${i}">`
                        + `<span class="game40-q-tile">${(revealed || done || isCur) ? ch : '〇'}</span>`
                        + `<span class="game40-q-num">${i + 1}</span>`
                        + `</span>`;
                });
                html += '</div>';
            });
            el.innerHTML = html;

            // 已揭示（或已完成／當前）的字，套上與棋盤一致的分組配色與形狀，
            // 讓玩家能用顏色/形狀在盤面上快速定位
            el.querySelectorAll('.game40-q-char').forEach(span => {
                const L = parseInt(span.dataset.line, 10);
                const i = parseInt(span.dataset.pos, 10);
                const tile = span.querySelector('.game40-q-tile');
                const shown = !span.classList.contains('masked') || span.classList.contains('done') || span.classList.contains('current');
                if (shown && tile) this.applyTileStyle(tile, this.poemLines[L][i], false);
            });
        },

        // 第 L 句第 i 個字是否已完成（目標序列是嚴格線性推進的，比索引即可）
        isSlotDone: function (L, i) {
            const slot = L * this.charsPerLine + i;
            return slot < this.targetIndex;
        },

        /*
         * 提示列：「請連續點擊 X 個【Y】字」＋ X 顆進度點，
         * 已點中的點會亮起，讓玩家不必分心數數。
         */
        renderHint: function () {
            const el = document.getElementById('game40-hint');
            if (!el) return;
            const t = this.targets[this.targetIndex];
            if (!t) { el.innerHTML = '<span class="game40-hint-done">全數點齊！</span>'; return; }

            let dots = '';
            for (let k = 0; k < t.count; k++) {
                dots += `<i class="game40-dot${k < this.clicksInTarget ? ' on' : ''}"></i>`;
            }
            el.innerHTML = `請連續點擊 <b class="game40-hint-num">${t.count}</b> 個`
                + `<b class="game40-hint-char">【${t.char}】</b>字`
                + `<span class="game40-dots">${dots}</span>`;
        },

        // ====================================================================
        // 玩家互動
        // ====================================================================

        handleTileClick: function (idx, cellEl) {
            if (!this.isActive) return;
            const tile = this.tiles[idx];
            if (!tile || tile.cleared) return; // 已消去的格子不判定對錯，也不扣心

            const target = this.targets[this.targetIndex];
            if (!target) return;

            if (tile.char === target.char) {
                // ── 答對 ──
                tile.cleared = true;
                cellEl.classList.add('cleared');
                this.clicksInTarget++;

                const pointA = window.ScoreManager ? window.ScoreManager.getPointA('game40', this.difficulty) : 2;
                this.score += pointA;

                if (window.SoundManager) {
                    if (window.SoundManager.melodyPlayer) window.SoundManager.melodyPlayer.playNextNote();
                    else window.SoundManager.playSuccessShort();
                }

                if (this.clicksInTarget >= target.count) {
                    // 該字全數點齊 → 額外獎勵，推進到下一個字
                    const pointB = window.ScoreManager ? window.ScoreManager.getPointB('game40', this.difficulty) : 20;
                    this.score += pointB;
                    this.targetIndex++;
                    this.clicksInTarget = 0;
                    if (window.SoundManager) window.SoundManager.playSuccess();
                    this.renderQuestion();
                }

                document.getElementById('game40-score').textContent = Math.floor(this.score);
                this.renderHint();

                if (this.targetIndex >= this.targets.length) {
                    this.gameOver(true, '點兵成詩');
                }
            } else {
                // ── 答錯 ── 扣一顆紅心
                cellEl.classList.add('wrong');
                setTimeout(() => cellEl.classList.remove('wrong'), 420);
                this.mistakeCount++;
                this.renderHearts();
                if (window.SoundManager) window.SoundManager.playFailure();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    this.gameOver(false, '眼花撩亂！');
                }
            }
        },

        // 依目前錯誤次數重繪紅心列：剩餘顯示實心♥、已消耗顯示空心♡
        renderHearts: function () {
            const container = document.getElementById('game40-hearts');
            if (!container) return;
            container.innerHTML = '';
            const left = this.maxMistakeCount - this.mistakeCount;
            for (let i = 0; i < this.maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = i < left ? '♥' : '♡';
                if (i >= left) span.classList.add('empty');
                container.appendChild(span);
            }
        },

        // ====================================================================
        // 計時器
        // ====================================================================

        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
                const elapsed = Date.now() - this.startTime;
                this.timer = Math.max(0, this.maxTimer - Math.floor(elapsed / 1000));
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        // 更新計時矩形邊框（環繞棋盤）；mode='win' 為過關動畫的金色正向填色
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game40-timer-path');
            const wrapper = document.getElementById('game40-board-wrapper');
            const svg = document.getElementById('game40-timer-ring');
            if (!rect || !wrapper || !svg) return;

            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (!w || !h) {
                const rb = wrapper.getBoundingClientRect();
                w = rb.width; h = rb.height;
            }
            if (!w) return;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';

            const rw = Math.max(0, w - 6);
            const rh = Math.max(0, h - 6);
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);

            const perimeter = (rw + rh) * 2;
            const clamped = Math.max(0, Math.min(1, ratio));
            if (mode === 'win') {
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                rect.style.transition = '';
                rect.style.strokeDasharray = perimeter;
                rect.style.strokeDashoffset = perimeter * clamped;
                const passed = 1 - clamped;
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * passed)}%, ${Math.round(22 + 32 * passed)}%)`;
            }
        },

        // ====================================================================
        // 結算
        // ====================================================================

        gameOver: function (win, reason) {
            if (!this.isActive) return; // 防止重複觸發（如最後一擊同時撞到時間到）
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);

            // 失敗時寫入 game_logs；勝利由 ScoreManager.saveScore 寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 40,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            // 勝利時立刻禁用按鈕，防止動畫期間連點刷分
            document.getElementById('game40-retryGame-btn').disabled = win;
            document.getElementById('game40-newGame-btn').disabled = win;

            const onConfirm = () => {
                document.getElementById('game40-retryGame-btn').disabled = false;
                document.getElementById('game40-newGame-btn').disabled = false;
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
                        score: win ? Math.floor(finalScore || this.score) : 0,
                        reason: win ? '' : (reason || '點錯了！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '開新局') : '再試一次',
                        onConfirm: onConfirm
                    });
                } else {
                    alert((win ? '過關！' : '失敗！') + reason);
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game40', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game40', this.currentLevelIndex, () => showMessage(finalScore));
                        return;
                    }
                }
                showMessage(finalScore);
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game40',
                    scoreElementId: 'game40-score',
                    timerContainerId: 'game40-board-wrapper',
                    heartsSelector: '#game40-hearts .heart:not(.empty)',
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

    window.Game40 = Game40;

    // 透過 ?game=40 URL 參數自動啟動（支援挑戰關卡直連）
    if (new URLSearchParams(window.location.search).get('game') === '40') {
        setTimeout(() => {
            if (window.Game40) window.Game40.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
