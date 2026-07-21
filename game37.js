/* ============================================================================
 * game37.js — 步步為陣
 * ----------------------------------------------------------------------------
 * 玩法與 game14「步步驚心」完全相同（逐字往上攀爬、答對加分答錯扣血），
 * 唯一差異在於「答案按鈕的介面擺放」：
 *   第1字 → 1 個答案按鈕（寬度=介面80%）
 *   第2字 → 2 個按鈕左右並排（寬度=介面80%）
 *   第3字 → 4 個按鈕排成 2×2（寬度=介面80%）
 *   第4字 → 9 個按鈕排成 3×3
 *   第5字 → 16 個按鈕排成 4×4
 *   第6字 → 25 個按鈕排成 5×5
 *   第7字（以上）→ 36 個按鈕排成 6×6，之後維持 36 宮格不再增加
 * 選項越多、答對分數倍率越高（依宮格邊長 side 計算）。
 * 各難度另有 maxOptionCount 上限：若當前步數原本應出現的按鈕數超過該難度上限，
 * 會被縮減為「不超過上限的最大合法宮格」（1/2/4/9/16/25/36 其中之一），藉此降低低難度的視覺搜尋負擔。
 * ========================================================================== */

(function () {
    const GRID_WIDTH = 400;      // 答案容器固定寬度（500 邏輯舞台的 80%）
    const GRID_GAP = 6;          // 宮格間距 (px)
    const FLAT_ROW_HEIGHT = 140; // 第1/2字（單顆或左右並排）的按鈕高度 (px)
    const FONT_HEIGHT_RATIO = 0.8; // 字級＝按鈕高度的 80%

    // 依「第幾個字」(1-based) 與該難度的 maxOptionCount 上限，回傳答案宮格的欄數/列數。
    // maxOptionCount 必為 1/2/4/9/16/25/36 其中之一，取「原本應有數量」與「上限」兩者較小值，
    // 確保結果永遠落在合法的宮格序列上（不會出現無法排成正方形的中間值）。
    function getGridDims(stepNumber, maxOptionCount) {
        let total;
        if (stepNumber === 1) total = 1;
        else if (stepNumber === 2) total = 2;
        else {
            const side = Math.min(stepNumber - 1, 6);
            total = side * side;
        }
        total = Math.min(total, maxOptionCount || 36);

        if (total <= 1) return { cols: 1, rows: 1 };
        if (total <= 2) return { cols: 2, rows: 1 };
        const side = Math.round(Math.sqrt(total));
        return { cols: side, rows: side };
    }

    const Game37 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 5,
        currentPoem: null,
        rows: [],
        currentIndex: 0,
        container: null,
        gameArea: null,
        historyContainer: null,
        historyData: [], // { char, status }
        timer: 120,
        maxTimer: 120,
        timerInterval: null,
        startTime: null,
        //timeMutiply:時間倍率
        //poemMinRating:詩詞最低評分
        //maxMistakeCount:最大錯誤次數
        //minChars:最少字數
        //maxChars:最多字數
        //maxOptionCount:答案宮格最多可出現的按鈕數（1/2/4/9/16/25/36），超過此數會被縮減為不超過上限的最大合法宮格
        difficultySettings: {
            '小學': { timeMutiply: 1.6, poemMinRating: 6, maxMistakeCount: 6, minChars: 10, maxChars: 20, maxOptionCount: 9 },
            '中學': { timeMutiply: 2.0, poemMinRating: 5, maxMistakeCount: 5, minChars: 20, maxChars: 28, maxOptionCount: 16 },
            '高中': { timeMutiply: 2.4, poemMinRating: 4, maxMistakeCount: 4, minChars: 28, maxChars: 40, maxOptionCount: 25 },
            '大學': { timeMutiply: 2.8, poemMinRating: 3, maxMistakeCount: 3, minChars: 28, maxChars: 56, maxOptionCount: 36 },
            '研究所': { timeMutiply: 3.2, poemMinRating: 3, maxMistakeCount: 2, minChars: 40, maxChars: 120, maxOptionCount: 36 }
        },
        gameStartTime: null,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('game37-css')) {
                const link = document.createElement('link');
                link.id = 'game37-css';
                link.rel = 'stylesheet';
                link.href = 'game37.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入 CSS、建立 DOM（若尚未建立）、取得容器參照，並綁定各按鈕事件
        init: function () {
            this.loadCSS();
            if (!this.container) {
                this.createDOM();
            }
            this.container = document.getElementById('game37-container');
            this.gameArea = document.getElementById('game37-area');
            this.historyContainer = document.getElementById('game37-history');

            document.getElementById('game37-retryGame-btn').onclick = () => this.retryGame();
            document.getElementById('game37-newGame-btn').onclick = () => this.startNewGame();
            document.getElementById('game37-diff-tag').onclick = () => this.showDifficultySelector();
        },

        // 建立遊戲整體 DOM 結構（外殼 header／控制列／生命值列／遊戲區／歷程列），
        // 並向共用的螢幕自適應模組註冊縮放回呼，讓 500x850 的邏輯舞台可依裝置比例縮放
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game37-container';
            div.className = 'game37-overlay fmd-overlay hidden';
            div.innerHTML = `
                <div class="fmd-header">
                    <div class="fmd-score-board">分數: <span id="game37-score">0</span></div>
                    <div class="fmd-controls">
                        <button class="fmd-difficulty-tag" id="game37-diff-tag">小學</button>
                        <button id="game37-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game37-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fmd-sub-header">
                    <div id="game37-hearts" class="hearts"></div>
                </div>
                <div id="game37-area" class="game37-area">
                    <div id="game37-timer-display" class="timer-text-37">0</div>
                    <svg id="game37-timer-ring" class="fmd-timer-ring">
                        <rect id="game37-timer-path" class="fmd-timer-path" x="4" y="4"></rect>
                    </svg>
                    <div id="game37-poem-info" class="game37-poem-info"></div>
                </div>
                <div id="game37-history" class="game37-history"></div>
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
            this.renderHearts();
        },

        // 對外進入點：初始化並直接跳出難度選擇視窗
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 開啟難度選擇器；玩家選定難度（或關卡）後記錄狀態並開始新的一局
        showDifficultySelector: function () {
            if (window.DifficultySelector) {
                window.DifficultySelector.show('步步為陣', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.startNewGame();
                });
            }
        },

        // 依「一般難度模式」或「關卡挑戰模式」更新難度標籤文字/顏色，
        // 並在挑戰模式下隱藏「開新局」按鈕，避免玩家中途跳出挑戰流程
        updateUIForMode: function () {
            const diffTag = document.getElementById('game37-diff-tag');
            const newBtn = document.getElementById('game37-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (diffTag) {
                diffTag.textContent = this.isLevelMode ? `挑戰第 ${this.currentLevelIndex} 關` : this.difficulty;
                diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
            // 挑戰模式下隱藏「新局」按鈕，避免玩家意外跳出挑戰流程
            if (newBtn) newBtn.style.display = this.isLevelMode ? 'none' : 'inline-block';
        },

        // 強制中止遊戲：停用計時器、隱藏遊戲畫面與規則說明視窗
        stopGame: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.classList.remove('overlay-active');
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();
        },

        // 開始全新一局：重置分數/錯誤次數/進度等所有狀態，重新挑選一首詩並建立階梯題目，
        // 最後顯示開場規則說明（玩家按下確認才會真正開始計時，見 showStartMessage → gameStart）
        startNewGame: function () {
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (window.GameMessage) window.GameMessage.hide();

            this.isActive = false;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentIndex = 0;
            this.rows = [];
            this.historyData = [];
            this.timer = 0;
            this.maxTimer = 0;
            this.startTime = null;

            document.getElementById('game37-score').textContent = "0";

            this.updateUIForMode();

            document.getElementById('game37-retryGame-btn').disabled = false;
            document.getElementById('game37-newGame-btn').disabled = false;

            const settings = this.difficultySettings[this.difficulty] || this.difficultySettings['小學'];
            this.maxMistakeCount = settings.maxMistakeCount;
            this.renderHearts();

            if (this.selectPoem(settings)) {
                this.prepareLadder(settings);
                this.showStartMessage();
            }

            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }
        },

        // 重玩同一首詩：沿用原本的 currentPoem 與 maxTimer，重置分數/錯誤次數/進度後直接開始計時
        // （與 startNewGame 的差異：不重新選詩、不顯示規則說明視窗）
        retryGame: function () {
            if (!this.currentPoem) return;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (window.GameMessage) window.GameMessage.hide();

            this.isActive = false;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentIndex = 0;
            this.rows = [];
            this.historyData = [];
            this.timer = this.maxTimer;
            this.startTime = null;

            document.getElementById('game37-score').textContent = "0";
            document.getElementById('game37-timer-display').textContent = this.timer;
            this.updateTimerRing(1);

            document.getElementById('game37-retryGame-btn').disabled = false;
            document.getElementById('game37-newGame-btn').disabled = false;

            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty] || this.difficultySettings['小學'];
            this.prepareLadder(settings);
            this.gameStart();

            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }
        },

        // 正式開始計時：記錄開始時間戳、顯示計時圓環，並啟動每秒更新一次的倒數計時器；
        // 倒數歸零時判定遊戲失敗（時間到）
        gameStart: function () {
            this.isActive = true;
            this.startTime = Date.now();
            this.gameStartTime = Date.now();
            const ring = document.getElementById('game37-timer-ring');
            if (ring) ring.style.display = 'block';
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                this.timer = Math.max(0, this.maxTimer - elapsed);
                document.getElementById('game37-timer-display').textContent = this.timer;
                this.updateTimerRing(this.timer / this.maxTimer);
                if (this.timer <= 0) {
                    this.gameOver(false, "時間到！");
                }
            }, 1000);
        },

        // 更新計時圓環（實際上是矩形描邊）的視覺進度：
        // ratio 為剩餘時間比例（0~1）；mode='win' 時代表過關動畫的正向填色（金色漸層），
        // 其餘情況為一般倒數的警示色（隨時間流逝由綠轉紅、由亮轉暗）
        updateTimerRing: function (ratio, mode) {
            const path = document.getElementById('game37-timer-path');
            const svg = document.getElementById('game37-timer-ring');
            const area = document.getElementById('game37-area');
            if (!path || !svg || !area) return;

            const w = area.offsetWidth;
            const h = area.offsetHeight;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            const rw = Math.max(0, w - 8);
            const rh = Math.max(0, h - 8);

            path.setAttribute('width', rw);
            path.setAttribute('height', rh);

            const perimeter = 2 * (rw + rh);
            path.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                const clamped = Math.max(0, Math.min(1, ratio));
                path.style.transition = 'stroke 0.3s ease';
                path.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                path.style.strokeDashoffset = clamped * perimeter;
                path.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                path.style.transition = '';
                path.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                path.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        // 依當前難度設定，透過共用的隨機選詩函式挑選一首符合條件的詩詞，
        // 並依總字數與難度時間倍率計算本局的倒數計時上限（maxTimer）
        selectPoem: function (settings) {
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                4,
                8,
                settings.minChars,
                settings.maxChars,
                "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game37'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            this.poemLines = result.lines;

            const chars = result.lines.join('').split('');
            this.maxTimer = Math.ceil(chars.length * settings.timeMutiply);
            this.timer = this.maxTimer;
            return true;
        },

        // 核心題目建構函式：將整首詩拆成一字一題的「階梯」（this.rows），
        // 每一題依「句內第幾個字」決定答案宮格大小（getGridDims），並產生混淆字選項、
        // 建立對應的 DOM 節點（但先不掛入畫面，只有當前題目才會被 renderCurrentRow 顯示）
        prepareLadder: function (settings) {
            const area = document.getElementById('game37-area');
            if (!area) return;
            const elementsToRemove = area.querySelectorAll('.ladder-row-37');
            elementsToRemove.forEach(el => area.removeChild(el));

            document.getElementById('game37-timer-display').textContent = this.timer;
            this.updateTimerRing(1);

            let title = this.currentPoem.title;
            if (title.length > 12) {
                title = title.substring(0, 10) + "...";
            }
            const infoEl = document.getElementById('game37-poem-info');
            if (infoEl) {
                infoEl.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
                infoEl.onclick = () => {
                    if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
                };
            }

            // 攤平為「每個字附帶所屬句子內位置」的陣列：宮格規則以「每一句」為單位重新起算，
            // 每一句的第一個字都要回到 1 個按鈕（不是整首詩只有第一個字才是 1 個按鈕）
            const charMeta = [];
            this.poemLines.forEach((line) => {
                Array.from(line).forEach((ch, posInLine) => charMeta.push({ char: ch, posInLine: posInLine }));
            });
            const chars = charMeta.map(m => m.char);
            const baseCommon = window.SharedDecoy ? window.SharedDecoy.decoyCharsSets.common.split('') : "的一是在不了有和人這中".split('');
            const fallbackPool = baseCommon.filter(c => !chars.includes(c));

            this.rows = [];
            this.historyData = [];

            charMeta.forEach((meta, idx) => {
                const char = meta.char;
                const stepNumber = meta.posInLine + 1; // 句內第幾個字（1-based，每句重新起算）
                const dims = getGridDims(stepNumber, settings.maxOptionCount);
                const total = dims.cols * dims.rows;
                const isStartRow = (stepNumber === 1);

                let options;
                if (total === 1) {
                    options = [char];
                } else {
                    const decoyCount = total - 1;
                    const decoys = window.SharedDecoy
                        ? window.SharedDecoy.getDecoyChars(chars, decoyCount)
                        : Array.from({ length: decoyCount }, () => fallbackPool[Math.floor(Math.random() * fallbackPool.length)]);
                    options = decoys.slice(0, decoyCount);
                    // 隨機插入正確答案
                    const correctPos = Math.floor(Math.random() * total);
                    options.splice(correctPos, 0, char);
                    // 補齊（極端情況混淆字不足時，用題目字重複填充避免格子留白）
                    while (options.length < total) options.push(fallbackPool[Math.floor(Math.random() * fallbackPool.length)] || char);
                }

                const rowEl = document.createElement('div');
                rowEl.className = 'ladder-row-37' + (isStartRow ? ' start-row' : '');

                const gridEl = document.createElement('div');
                gridEl.className = 'game37-grid' + (total <= 2 ? ' game37-grid-flat' : ' game37-grid-square');
                gridEl.style.width = GRID_WIDTH + 'px';

                // 字級一律＝按鈕實際高度的 80%（單顆/並排固定高 140px；宮格則高＝寬＝cellSize）
                let cellFontPx;
                if (total <= 2) {
                    gridEl.style.gap = GRID_GAP + 'px';
                    cellFontPx = FLAT_ROW_HEIGHT * FONT_HEIGHT_RATIO;
                } else {
                    const side = dims.cols;
                    const cellSize = (GRID_WIDTH - (side - 1) * GRID_GAP) / side;
                    gridEl.style.gridTemplateColumns = `repeat(${side}, ${cellSize}px)`;
                    gridEl.style.gridTemplateRows = `repeat(${side}, ${cellSize}px)`;
                    gridEl.style.gap = GRID_GAP + 'px';
                    cellFontPx = cellSize * FONT_HEIGHT_RATIO;
                }

                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'ladder-btn-37' + (isStartRow ? ' double-wide' : '');
                    btn.style.fontSize = cellFontPx + 'px';
                    if (total <= 2) btn.style.flex = '1';

                    if (this.difficulty === '小學' && opt !== char) {
                        btn.classList.add('wrong-hint');
                    }

                    btn.textContent = opt;
                    btn.addEventListener('pointerdown', (e) => {
                        if (e.pointerType === 'touch') e.preventDefault();
                        this.handleBtnClick(opt, char, idx, btn, rowEl, total);
                    });
                    gridEl.appendChild(btn);
                });

                rowEl.appendChild(gridEl);
                this.rows.push({ element: rowEl, char: char, index: idx });
                this.historyData.push({ char: char, status: 'waiting' });
                // ⚠️ 不在此處掛入畫面：僅保留在記憶體中，只有「當前這一題」才會被
                // renderCurrentRow() 掛到 area，答案字一律置中顯示、上一題消失不留痕跡
            });

            this.renderCurrentRow();
            this.renderHistory();
        },

        // 只顯示「當前這一題」的答案字，並置中於遊戲區正中央；
        // 上一題（不論答對答錯）在新題出現的同時直接移除，不做堆疊或漸隱效果
        renderCurrentRow: function () {
            const area = document.getElementById('game37-area');
            if (!area) return;
            const old = area.querySelector('.ladder-row-37');
            if (old) old.remove();

            const row = this.rows[this.currentIndex];
            if (!row) return;
            row.element.classList.add('active-row');
            area.appendChild(row.element);
        },

        // 處理玩家點擊答案按鈕：判斷對錯、更新分數／生命值／歷程紀錄，
        // 並在短暫延遲（讓玩家看清楚回饋色彩）後推進到下一題或結束遊戲
        handleBtnClick: function (selected, correct, index, btn, rowEl, optionCount) {
            if (!this.isActive || index !== this.currentIndex) return;

            Array.from(rowEl.querySelectorAll('button')).forEach(b => b.disabled = true);

            if (selected === correct) {
                btn.classList.add('correct');
                // 選項越多（宮格越大）分數倍率越高，約等同宮格邊長
                const side = Math.max(1, Math.round(Math.sqrt(optionCount)));
                const basePoint = (window.ScoreManager && window.ScoreManager.gameSettings['game37'])
                    ? window.ScoreManager.gameSettings['game37'].getPointA : 5;
                this.score += basePoint * side;
                document.getElementById('game37-score').textContent = Math.floor(this.score);
                this.historyData[index].status = 'correct';
                if (window.SoundManager) {
                    if (window.SoundManager.melodyPlayer) window.SoundManager.melodyPlayer.playNextNote();
                    else window.SoundManager.playSuccessShort();
                }
            } else {
                btn.classList.add('wrong-clicked');
                this.mistakeCount++;
                this.updateHearts();
                this.historyData[index].status = 'wrong';
                if (window.SoundManager) window.SoundManager.playFailure();

                if (this.mistakeCount >= this.maxMistakeCount) {
                    this.gameOver(false, "體力耗盡");
                    return;
                }
            }

            // 延遲時間留給玩家看清楚剛剛點擊的綠色（答對）／紅色（答錯）回饋，
            // 時間到才把這一題整個移除、換上下一題（見 renderCurrentRow）
            setTimeout(() => {
                this.currentIndex++;
                this.renderHistory();

                if (this.currentIndex >= this.rows.length) {
                    this.gameOver(true, "步步為陣");
                } else {
                    this.renderCurrentRow();
                }
            }, 450);
        },

        // 顯示開場規則說明視窗；玩家按下「開始佈陣」後才真正呼叫 gameStart 開始計時
        showStartMessage: function () {
            if (window.RuleNoteDialog) {
                window.RuleNoteDialog.show({
                    title: '步步為陣',
                    lines: [
                        '依序點擊正確文字。',
                        '選項會隨字數逐漸增多：',
                        '1個→2個→4個→9個…最多36個。',
                        '　',
                        '選項越多，答對得分越高。',
                        '錯誤扣紅心。'
                    ],
                    btnText: '開始佈陣',
                    styles: { height: '60%', top: '60%' },
                    onConfirm: () => {
                        this.gameStart();
                    }
                });
            } else {
                this.gameStart();
            }
        },

        // 重繪左側直排的「答題歷程」欄：已答對顯示綠字、答錯顯示紅字加粗、尚未作答顯示空心方框
        renderHistory: function () {
            if (!this.historyContainer) return;
            let html = '';
            this.historyData.forEach(item => {
                const cls = `history-char ${item.status}`;
                html += `<span class="${cls}">${item.status === 'waiting' ? '□' : item.char}</span>`;
            });
            this.historyContainer.innerHTML = html;
        },

        // 依目前錯誤次數重繪生命值（愛心）列：剩餘生命顯示實心♥，已消耗的顯示空心♡
        renderHearts: function () {
            const container = document.getElementById('game37-hearts');
            if (!container) return;
            container.innerHTML = '';
            for (let i = 0; i < this.maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = i < (this.maxMistakeCount - this.mistakeCount) ? '♥' : '♡';
                if (i >= (this.maxMistakeCount - this.mistakeCount)) span.classList.add('empty');
                container.appendChild(span);
            }
        },

        // 生命值變動後的更新入口（目前實作即直接重繪整列愛心）
        updateHearts: function () {
            this.renderHearts();
        },

        // 遊戲結束處理：停止計時、依勝負記錄/顯示結果訊息；
        // 若獲勝且有 ScoreManager，會先播放獲勝動畫（含關卡完成判定與成就彈窗）才顯示結果視窗；
        // 若失敗則上傳遊戲紀錄（分數以 0 計）並提供「再試一次」按鈕重玩同一首詩
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 37,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            if (this.timerInterval) clearInterval(this.timerInterval);

            if (win) {
                document.getElementById('game37-retryGame-btn').disabled = true;
                document.getElementById('game37-newGame-btn').disabled = true;
            } else {
                document.getElementById('game37-retryGame-btn').disabled = false;
                document.getElementById('game37-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                document.getElementById('game37-retryGame-btn').disabled = false;
                document.getElementById('game37-newGame-btn').disabled = false;

                if (win) {
                    if (this.isLevelMode) {
                        this.currentLevelIndex++;
                        this.startNewGame();
                    } else {
                        this.startNewGame();
                    }
                } else {
                    this.retryGame();
                }
            };

            const showMessage = () => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? Math.floor(this.score) : 0,
                        reason: reason,
                        btnText: win ? (this.isLevelMode ? "下一關" : "開新局") : "再試一次",
                        onConfirm: onConfirm
                    });
                } else {
                    alert((win ? "答對了！" : "輸了！") + reason);
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game37',
                    scoreElementId: 'game37-score',
                    timerContainerId: 'game37-timer-ring',
                    heartsSelector: '#game37-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        if (this.isLevelMode) {
                            const achId = window.ScoreManager.completeLevel('game37', this.difficulty, this.currentLevelIndex);
                            if (achId && window.AchievementDialog) {
                                window.AchievementDialog.showInstantAchievementPop(achId, 'game37', this.currentLevelIndex, showMessage);
                            } else {
                                showMessage();
                            }
                        } else {
                            showMessage();
                        }
                    }
                });
            } else {
                showMessage();
            }
        }
    };

    window.Game37 = Game37;

    if (new URLSearchParams(window.location.search).get('game') === '37') {
        setTimeout(() => {
            if (window.Game37) window.Game37.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);
    }
})();
