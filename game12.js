(function () {
    const Game12 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // 遊戲狀態
        currentPoem: null,
        line1: "",
        line2: "",
        hiddenPositions: [], // [{char, originalIdx, gridIdx}] - 題目要求連續
        currentInputIndex: 0,
        timerInterval: null,
        memoryTimerRef: null,
        turnId: 0,
        startTime: 0,
        maxTimer: 0,

        isRevealed: false,
        isMemoryPhase: false,
        isPlayerPhase: false,

        container: null,
        gridArea: null,
        currentGridChars: [], // 儲存網格中的字元物件 {char, gridIdx, isSolution, audioIdx}
        //timeLimitRate: 每字牌時間倍率（秒），實際時限 = total × timeLimitRate
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount 最多錯誤次數
        //minShowCount 最少顯示字數
        //maxShowCount 最多顯示字數
        //minTotalHideCount 最少隱藏字數
        //memorySeconds 記憶秒數
        //isSequentialOpen 是否依序顯示答案卡
        //isSequentialHide 是否依序隱藏答案卡
        //hasDistractors 是否有干擾字
        //showDelay 顯示延遲
        //hideMode 隱藏模式 line2:第二行, random1or2:隨機只有第一行或只有第二行, line1or12:隨機第一行或第一加第二行, both:第一行與第二行
        //total:總字數, cols:每行字數
        difficultySettings: {
            '小學': { timeLimitRate: 3, poemMinRating: 6, maxMistakeCount: 4, minShowCount: 1, maxShowCount: 4, minTotalHideCount: 4, memorySeconds: 5, isSequentialOpen: true, isSequentialHide: true, hasDistractors: false, showDelay: 0, hideMode: 'line2', total: 6, cols: 3 },
            '中學': { timeLimitRate: 2, poemMinRating: 5, maxMistakeCount: 6, minShowCount: 1, maxShowCount: 3, minTotalHideCount: 6, memorySeconds: 7, isSequentialOpen: true, isSequentialHide: false, hasDistractors: false, showDelay: 8, hideMode: 'random1or2', total: 8, cols: 4 },
            '高中': { timeLimitRate: 1, poemMinRating: 4, maxMistakeCount: 8, minShowCount: 2, maxShowCount: 3, minTotalHideCount: 8, memorySeconds: 10, isSequentialOpen: true, isSequentialHide: false, hasDistractors: true, showDelay: 16, hideMode: 'line1or12', total: 10, cols: 5 },
            '大學': { timeLimitRate: 2, poemMinRating: 3, maxMistakeCount: 12, minShowCount: 1, maxShowCount: 2, minTotalHideCount: 10, memorySeconds: 12, isSequentialOpen: false, isSequentialHide: false, hasDistractors: true, showDelay: 24, hideMode: 'both', total: 12, cols: 4 },
            '研究所': { timeLimitRate: 3, poemMinRating: 2, maxMistakeCount: 14, minShowCount: 0, maxShowCount: 0, minTotalHideCount: 10, memorySeconds: 15, isSequentialOpen: false, isSequentialHide: false, hasDistractors: true, showDelay: 32, hideMode: 'both', total: 16, cols: 4 }
        },
        showTimeout: null,
        cluesRevealed: false,
        gameStartTime: null,

        // 動態載入 game12.css（若尚未載入過），避免重複插入 <link>
        loadCSS: function () {
            if (!document.getElementById('game12-css')) {
                const link = document.createElement('link');
                link.id = 'game12-css';
                link.rel = 'stylesheet';
                link.href = 'game12.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入 CSS、建立 DOM（若尚未建立），並快取容器與網格元素參照
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game12-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game12-container');
            this.gridArea = document.getElementById('game12-grid');
        },

        // 建立遊戲整體 DOM 結構（分數列、控制按鈕、詩句題目區、答案翻牌網格），
        // 並綁定重來/開新局/難度選擇等按鈕事件，只會執行一次
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game12-container';
            div.className = 'game12-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game12-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game12-diff-tag" data-level="小學">小學</button>
                        <button id="game12-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game12-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game12-hearts" class="fm-hearts"></div>
                    <div id="game12-info" class="fm-poem-info"></div>
                </div>
                <div id="game12-area" class="game12-area">
                    <div id="game12-question" class="game12-question-area">
                        <div id="game12-line1" class="game12-poem-lines"></div>
                        <div id="game12-line2" class="game12-poem-lines"></div>
                        <!-- 詩名/朝代/作者：已移至 fm-sub-header 右側，見上方 -->
                    </div>
                    <div id="game12-status" class="game12-status-msg"></div>
                    <!-- 答案區域 (含邊框倒數) — 三層同心圓結構（同 game1）：
                         ① 最外圈：紅色 SVG timer stroke（10px）
                         ② 中間圈：3px 邊框 + 徑向漸層底色 + border-radius 20px
                         ③ 內圈：翻牌字塊（20px padding） -->
                    <div class="game12-answer-section">
                        <div id="game12-grid-container" class="game12-grid-container">
                            <svg id="game12-timer-ring" class="fm-timer-ring">
                                <rect id="game12-timer-path" class="fm-timer-path" x="5" y="5"></rect>
                            </svg>
                            <div class="game12-grid-inner-ring">
                                <div class="game12-answer-grid" id="game12-grid"></div>
                            </div>
                        </div>
                    </div>
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
            document.getElementById('game12-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game12-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            // Message button handled by GameMessage
            document.getElementById('game12-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            this.renderHearts();
        },

        // 外部呼叫的遊戲進入點：初始化並顯示難度選擇畫面
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度選擇器；使用者選定難度／關卡後更新 UI 並開始新遊戲
        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('疏影橫斜', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    /* updateResponsiveLayout replaced */
                    this.startNewGame();
                });
            }
        },

        // 依「一般難度模式」或「關卡挑戰模式」切換難度標籤文字與按鈕顯示
        updateUIForMode: function () {
            const diffTag = document.getElementById('game12-diff-tag');
            const retryBtn = document.getElementById('game12-retryGame-btn');
            const newBtn = document.getElementById('game12-newGame-btn');
            if (diffTag) diffTag.setAttribute('data-level', this.difficulty);

            if (this.isLevelMode) {
                if (diffTag) diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) diffTag.textContent = this.difficulty;
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
            /* updateResponsiveLayout replaced */
        },

        // 隱藏首頁卡片與其他遊戲的容器，避免與本遊戲畫面重疊
        hideOtherContents: function () {
            ['cardContainer', 'calendarCardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container', 'game8-container', 'game9-container', 'game10-container', 'game11-container'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id.includes('Container')) el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        // 離開遊戲時還原首頁卡片顯示
        showOtherContents: function () {
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // 完全停止遊戲：清除計時器、隱藏容器、還原頁面捲動與其他內容顯示
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.memoryTimerRef) clearInterval(this.memoryTimerRef);
            if (this.showTimeout) clearTimeout(this.showTimeout);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        // 停止所有計時器與異步程序
        stopAllTimers: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.turnId++; // 增加回合 ID，讓啟動中的 async 程序停止
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.memoryTimerRef) clearInterval(this.memoryTimerRef);
            if (this.showTimeout) clearTimeout(this.showTimeout);
            this.timerInterval = null;
            this.memoryTimerRef = null;
        },

        // 開始全新一局：重置分數/錯誤次數/回合狀態，隨機選詩後初始化第一回合
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }

            this.updateUIForMode();
            // 啟用按鈕 (修正 Rule 3)
            document.getElementById('game12-retryGame-btn').disabled = false;
            document.getElementById('game12-newGame-btn').disabled = false;

            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.stopAllTimers();

            document.getElementById('game12-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.renderHearts();

            if (this.selectRandomPoem()) {
                this.initTurn();
                this.updatePoemInfoVisibility(false);
            } else {
                this.showDifficultySelector();
            }
        },

        // 小學難度維持顯示詩詞出處供提示；中學以上開局隱藏，勝利後才顯示
        updatePoemInfoVisibility: function (revealed) {
            const info = document.getElementById('game12-info');
            if (!info) return;
            info.style.display = (this.difficulty === '小學' || revealed) ? '' : 'none';
        },

        // 關卡模式過關後，進入下一關（關卡編號 +1 並重新開局）
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 重新挑戰同一首詩（沿用 currentPoem/隱藏字設定），僅重置分數與錯誤次數
        retryGame: function () {
            if (!this.currentPoem) return;
            // 啟用按鈕 (修正 Rule 3)
            document.getElementById('game12-retryGame-btn').disabled = false;
            document.getElementById('game12-newGame-btn').disabled = false;

            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.stopAllTimers();

            document.getElementById('game12-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.renderHearts();
            this.initTurn(true);
            this.updatePoemInfoVisibility(false);
        },

        // 依難度設定隨機挑選一首合格詩詞，並依 hideMode 決定要隱藏第一句／第二句／兩句，
        // 再依 minShow/maxShow 篩選每句要「保留提示」的字數模式，
        // 最終將被隱藏的字組成 this.hiddenPositions（供玩家作答用），最多重試 100 次
        selectRandomPoem: function () {
            const settings = this.difficultySettings[this.difficulty];
            const processLine = (line, lineIdx) => {
                const chars = [];
                for (let i = 0; i < line.length; i++) {
                    if (!/[，。？！、：；「」『』]/.test(line[i])) {
                        chars.push({ char: line[i], originalIdx: i, lineIndex: lineIdx });
                    }
                }
                return chars;
            };

            let attempts = 0; //嘗試次數
            while (attempts < 100) {
                attempts++;
                // 傳入種子
                const requiredChars = Math.max(8, (settings.minTotalHideCount || 2) + (settings.minShowCount || 1) * 2);
                const result = getSharedRandomPoem(
                    settings.poemMinRating || 4,
                    2,
                    2,
                    requiredChars,
                    30,
                    "",
                    this.isLevelMode ? this.currentLevelIndex : null,
                    'game12'
                );
                if (!result) return false;

                this.currentPoem = result.poem;
                this.line1 = result.lines[0];
                this.line2 = result.lines[1] || "";

                // 決定隱藏哪幾句 (Rule 1)
                let hideIndices = [];
                const modeStr = settings.hideMode;
                if (modeStr === 'line2') hideIndices = [1];
                else if (modeStr === 'random1or2') hideIndices = [Math.random() < 0.5 ? 0 : 1];
                else if (modeStr === 'line1or12') {
                    const rand = Math.random();
                    hideIndices = rand < 0.5 ? [0] : [0, 1];
                } else if (modeStr === 'both') hideIndices = [0, 1];

                // 如果單行無法滿足 minTotalHideCount，強制使用兩行以避免陷入無窮迴圈
                const maxHidePerLine = 7 - (settings.minShowCount || 1);
                if (hideIndices.length === 1 && (settings.minTotalHideCount || 2) > maxHidePerLine) {
                    hideIndices = [0, 1];
                }

                this.hiddenPositions = [];
                const minShow = settings.minShowCount;
                const maxShow = settings.maxShowCount;
                const minTotalHideCount = settings.minTotalHideCount || 2;

                // 收集每個選定句子的可隱藏位元組
                for (let idx of hideIndices) {
                    const line = idx === 0 ? this.line1 : this.line2;
                    const cleanChars = processLine(line, idx);
                    const n = cleanChars.length;

                    // 篩選模式，必須符合顯示字數限制
                    let modes = [];
                    if (n === 5) modes = [[0, 1], [0, 1, 2], [2, 3, 4], [4], [0], []];
                    else if (n === 7) modes = [[0, 1], [0, 1, 2, 3], [4, 5, 6], [6], [0], []];
                    else modes = [[0, 1], [0, 1, 2], [0, 1, 2, 3], [n - 1], [0], []];

                    // 在滿足 maxShow 的前提下，隨機挑選一個模式
                    const validModes = modes.filter(m => m.length >= minShow && m.length <= maxShow);
                    if (validModes.length === 0) continue; // 這一句無法滿足，重新選詩

                    const showIdx = validModes[Math.floor(Math.random() * validModes.length)];
                    const hiddenInLine = cleanChars.filter((c, i) => !showIdx.includes(i));
                    this.hiddenPositions.push(...hiddenInLine);
                }

                // 檢查總隱藏字數是否足夠
                if (this.hiddenPositions.length >= minTotalHideCount && this.hiddenPositions.length >= 2) {
                    this.hiddenPositions.sort((a, b) => (a.lineIndex === b.lineIndex) ? (a.originalIdx - b.originalIdx) : (a.lineIndex - b.lineIndex));
                    return true;
                }
            }
            return false;
        },

        // 初始化一個回合：重置作答進度、渲染題目、建立翻牌網格，並進入記憶階段
        initTurn: function (isRetry = false) {
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.renderQuestion();
            this.setupGrid(isRetry);
            this.startMemoryPhase();
        },

        // 渲染詩句題目區：已作答正確的字顯示綠字，未作答的隱藏字顯示◎符號（或答案揭曉時顯示原字），
        // 提示句（無隱藏字的句子）依 showDelay 設定延遲顯示；同時處理字體自動縮放與詩詞出處資訊
        renderQuestion: function () {
            const l1 = document.getElementById('game12-line1');
            const l2 = document.getElementById('game12-line2');
            const info = document.getElementById('game12-info');
            const settings = this.difficultySettings[this.difficulty];

            const renderLine = (lineText, lineIdx) => {
                let html = "";
                // 檢查是否為提示句 (無隱藏字)
                const isClueLine = !this.hiddenPositions.some(p => p.lineIndex === lineIdx);
                const lineEl = lineIdx === 0 ? l1 : l2;

                lineEl.className = 'game12-poem-lines';
                if (isClueLine && settings.showDelay > 0 && !this.isRevealed) {
                    if (!this.cluesRevealed) lineEl.classList.add('game12-hidden-line');
                    else lineEl.classList.add('game12-hidden-line', 'revealed');
                }

                for (let i = 0; i < lineText.length; i++) {
                    const char = lineText[i];
                    if (/[，。？！、：；「」『』]/.test(char)) {
                        html += char;
                    } else {
                        const hInfo = this.hiddenPositions.find(p => p.lineIndex === lineIdx && p.originalIdx === i);
                        if (hInfo) {
                            const hIdx = this.hiddenPositions.indexOf(hInfo);
                            if (hIdx < this.currentInputIndex) {
                                html += `<span class="correct-char">${char}</span>`;
                            } else if (this.isRevealed) {
                                html += `<span class="hidden-char">${char}</span>`;
                            } else {
                                html += `<span class="hidden-char">◎</span>`;
                            }
                        } else {
                            html += char;
                        }
                    }
                }
                return html;
            };

            l1.innerHTML = renderLine(this.line1, 0);
            l2.innerHTML = renderLine(this.line2, 1);

            // 動態縮小字體 (需過濾掉 HTML 標籤)
            const l1Len = l1.innerHTML.replace(/<[^>]*>/g, '').length;
            this.adjustFontSize(l1, l1Len, 7, 2.5);

            const l2Len = l2.innerHTML.replace(/<[^>]*>/g, '').length;
            this.adjustFontSize(l2, l2Len, 7, 2.5);

            // showDelay 邏輯 (修正 Rule 4)
            if (settings.showDelay > 0 && !this.cluesRevealed) {
                if (this.showTimeout) clearTimeout(this.showTimeout);
                this.showTimeout = setTimeout(() => {
                    this.cluesRevealed = true;
                    this.renderQuestion();
                }, settings.showDelay * 1000);
            }

            // 詩詞名稱最多顯示 8 字（避免在 fm-sub-header 右側與左邊紅心重疊）
            let _title12 = this.currentPoem.title;
            if (_title12.length > 8) _title12 = _title12.substring(0, 8) + "…";
            const infoText = `${_title12} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            info.textContent = infoText;
            this.adjustFontSize(info, infoText.length, 20, 1.0);

            info.onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
        },

        // 建立翻牌網格資料：將待答字（solutionChars）與干擾字（decoys）混合、洗牌，
        // 並為每張牌配置座標、音階索引（由下而上、由左而右編號後對應 21 音循環）與隨機正面顏色；
        // isRetry 為 true 且已有現成網格時則沿用舊資料，只重新渲染畫面
        setupGrid: function (isRetry) {
            const settings = this.difficultySettings[this.difficulty];
            const config = settings;

            if (!isRetry || !this.currentGridChars.length) {
                const solutionChars = this.hiddenPositions.map((p, idx) => ({
                    char: p.char,
                    isSolution: true,
                    solutionIdx: idx
                }));

                let decoys = [];
                if (settings.hasDistractors && window.SharedDecoy) {
                    const needed = config.total - solutionChars.length;
                    decoys = window.SharedDecoy.getDecoyChars(solutionChars.map(s => s.char), needed, [], 4)
                        .map(c => ({ char: c, isSolution: false }));
                } else {
                    const needed = config.total - solutionChars.length;
                    for (let i = 0; i < needed; i++) decoys.push({ char: '', isSolution: false });
                }

                const all = [...solutionChars, ...decoys].sort(() => Math.random() - 0.5);

                // 分配音效與座標，參考 Game 11 (Rule 5 & 7)
                const cols = config.cols;
                const rows = Math.ceil(config.total / cols);
                this.currentGridChars = all.map((item, i) => {
                    const r = Math.floor(i / cols);
                    const c = i % cols;
                    const bottomUpRow = (rows - 1) - r;
                    const gridSequenceNum = (bottomUpRow * cols) + c + 1;
                    //音階索引採 21 音循環 (1-21)，並偏移10，提高音階從C4開始
                    const audioIdx = ((gridSequenceNum - 1) % 21) + 10;

                    // 隨機 HSL 顏色 (Rule 5)
                    const hue = Math.floor(Math.random() * 360);
                    const lum = Math.floor(Math.random() * 30) + 50;
                    const frontColor = `hsl(${hue}, 70%, ${lum}%)`;

                    return { ...item, gridIdx: i, audioIdx, frontColor };
                });
            }

            this.renderGridDisplay(config.cols);
        },

        // 依 currentGridChars 資料渲染實際的翻牌 DOM 元素，並設定出場動畫延遲與點擊事件
        renderGridDisplay: function (cols) {
            const container = document.getElementById('game12-grid');
            container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            container.innerHTML = '';

            const N = this.currentGridChars.length;
            this.currentGridChars.forEach((item, i) => {
                const tile = document.createElement('div');
                tile.className = 'game12-tile';
                tile.id = `tile-${item.gridIdx}`;
                tile.audioIdx = item.audioIdx; // 綁定音階索引以供後續播放使用
                // ⚠️ 出場動畫：所有字塊啟動時機壓進 0~0.5 秒之間，每片動畫本身 0.5s，
                //   中心點整體 XY 放大（scale 0→1）。與稍後的翻牌 rotateY 動畫
                //   作用於不同元素（本層 vs .game12-tile-inner），互不衝突。
                tile.classList.add('game12-tile-appear');
                const delay = (N > 1) ? (i / (N - 1)) * 0.5 : 0;
                tile.style.animationDelay = delay.toFixed(3) + 's';
                // 空格也不要加 disabled，讓它可欺騙玩家 (Rule 2)

                tile.innerHTML = `
                    <div class="game12-tile-inner">
                        <div class="game12-tile-front" style="background: ${item.frontColor}"></div>
                        <div class="game12-tile-back">${item.char}</div>
                    </div>
                `;
                tile.onclick = () => this.handleTileClick(item, tile);
                container.appendChild(tile);
            });
        },
        // 記憶階段
        startMemoryPhase: async function () {
            const currentTurn = this.turnId;
            if (this.memoryTimerRef) clearInterval(this.memoryTimerRef);
            this.isMemoryPhase = true;
            this.isPlayerPhase = false;
            const settings = this.difficultySettings[this.difficulty];
            const statusEl = document.getElementById('game12-status');
            statusEl.textContent = "請記住答案文字的位置";
            // 隱藏倒數框 (Rule 6)
            document.getElementById('game12-timer-ring').classList.add('hidden');

            // 翻開所有字塊
            const tiles = Array.from(document.querySelectorAll('.game12-tile'));
            //依序顯示答案卡
            if (settings.isSequentialOpen) {
                // 依序打開答案字，再打開干擾字 (提示順序)
                const solTiles = this.hiddenPositions.map(hp => {
                    const gc = this.currentGridChars.find(g => g.isSolution && g.solutionIdx === this.hiddenPositions.indexOf(hp));
                    return document.getElementById(`tile-${gc.gridIdx}`);
                });
                const otherTiles = tiles.filter(t => !solTiles.includes(t));

                for (let t of solTiles) {
                    await this.delay(500);
                    if (this.turnId !== currentTurn) return; // 檢查是否有新的一局開始
                    t.classList.add('flipped');
                    // 播放音階
                    this.playPitchSound(t.audioIdx);
                }
                for (let t of otherTiles) {
                    await this.delay(200);
                    if (this.turnId !== currentTurn) return; // 檢查是否有新的一局開始
                    t.classList.add('flipped');
                }
            } else {
                tiles.forEach(t => t.classList.add('flipped'));
                await this.delay(300);
            }

            // 動態更新秒數文字 (Rule 6)
            let remain = settings.memorySeconds;
            const updateMsg = () => {
                statusEl.textContent = `請記住答案文字的位置，倒數 ${remain} 秒`;
            };
            updateMsg();

            const memTimer = setInterval(() => {
                if (!this.isActive || this.turnId !== currentTurn) {
                    clearInterval(memTimer);
                    return;
                }
                remain--;
                if (remain <= 0) {
                    clearInterval(memTimer);
                    this.startActionPhase();
                } else {
                    updateMsg();
                }
            }, 1000);
            this.memoryTimerRef = memTimer;
        },

        // 記憶階段結束後進入作答階段：依序（或一次性）蓋回所有字塊，
        // 接著啟動總計時器，並顯示倒數框，允許玩家開始依序點擊答案字
        startActionPhase: async function () {
            const currentTurn = this.turnId;
            if (this.memoryTimerRef) clearInterval(this.memoryTimerRef);
            this.isMemoryPhase = false;
            const settings = this.difficultySettings[this.difficulty];
            const statusEl = document.getElementById('game12-status');
            statusEl.textContent = "";
            const tiles = Array.from(document.querySelectorAll('.game12-tile'));

            if (settings.isSequentialHide) {
                // 依序蓋上答案字，再蓋上干擾字 (提示順序)
                const solTiles = this.hiddenPositions.map(hp => {
                    const gc = this.currentGridChars.find(g => g.isSolution && g.solutionIdx === this.hiddenPositions.indexOf(hp));
                    return document.getElementById(`tile-${gc.gridIdx}`);
                });
                const otherTiles = tiles.filter(t => !solTiles.includes(t));

                for (let t of solTiles) {
                    await this.delay(500);
                    if (this.turnId !== currentTurn) return; // 檢查是否有新的一局開始
                    t.classList.remove('flipped');
                    // 播放音階
                    this.playPitchSound(t.audioIdx);
                }
                for (let t of otherTiles) {
                    await this.delay(100);
                    if (this.turnId !== currentTurn) return; // 檢查是否有新的一局開始
                    t.classList.remove('flipped');
                }
            } else {
                // 一次性蓋上
                tiles.forEach(t => t.classList.remove('flipped'));
                await this.delay(300);
                if (this.turnId !== currentTurn) return;
            }
            statusEl.textContent = "請依序點擊答案文字";

            this.isPlayerPhase = true;
            document.getElementById('game12-grid').classList.add('is-player-phase');
            // 開始遊戲總計時
            // 依牌數動態計算時間限制（total × timeLimitRate）
            this.startTimer(settings.total * settings.timeLimitRate, () => {
                if (this.turnId === currentTurn) {
                    this.gameOver(false, "時間到！");
                }
            });

            // 顯示倒數框 (Rule 6)
            document.getElementById('game12-timer-ring').classList.remove('hidden');
        },

        // 處理玩家點擊字塊：若點對目前該填的答案字則翻開計分並推進進度（全部答對即獲勝）；
        // 若點錯則扣血、翻開錯字並震動警示，短暫延遲後重置作答進度並重新進入記憶階段
        handleTileClick: function (item, tileEl) {
            if (!this.isActive || !this.isPlayerPhase) return;
            if (tileEl.classList.contains('disabled') || tileEl.classList.contains('flipped')) return;

            const target = this.hiddenPositions[this.currentInputIndex];
            if (item.char === target.char) {
                // 正確 (Rule 3)
                tileEl.classList.add('flipped', 'correct', 'disabled');
                //撥放音階
                this.playPitchSound(item.audioIdx);
                // 擊中文字，根據window.ScoreManager.gameSettings['game12'].getPointA加分
                this.score += window.ScoreManager.gameSettings['game12'].getPointA;
                document.getElementById('game12-score').textContent = this.score;
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.currentInputIndex === this.hiddenPositions.length) {
                    this.gameOver(true, '');
                }
            } else {
                // 錯誤 (Rule 1 & 4)
                this.mistakeCount++;
                this.updateHearts();

                // 翻開該字，顯示暗紅色，震動 (Rule 4)
                tileEl.classList.add('flipped', 'wrong-reveal', 'error');
                if (navigator.vibrate) navigator.vibrate(1000);
                if (window.SoundManager) window.SoundManager.playFailure();

                this.isPlayerPhase = false; // 暫停點擊
                const currentTurnAtWrong = this.turnId;

                setTimeout(() => {
                    if (this.turnId !== currentTurnAtWrong) return;
                    tileEl.classList.remove('error');
                    if (this.mistakeCount >= this.difficultySettings[this.difficulty].maxMistakeCount) {
                        this.gameOver(false, "失誤次數過多");
                    } else {
                        // 重置進度並送回記憶階段
                        this.currentInputIndex = 0;
                        clearInterval(this.timerInterval);
                        document.getElementById('game12-grid').classList.remove('is-player-phase');
                        this.renderQuestion();

                        const allTiles = document.querySelectorAll('.game12-tile');
                        allTiles.forEach(t => {
                            t.classList.remove('flipped', 'correct', 'disabled', 'wrong-reveal');
                        });

                        setTimeout(() => {
                            if (this.turnId === currentTurnAtWrong) this.startMemoryPhase();
                        }, 800);
                    }
                }, 1500); // 留點時間讓玩家看錯在哪
            }
        },

        // 啟動作答總倒數計時器，每 50ms 更新一次剩餘比例並刷新計時環；時間到則呼叫 onComplete
        startTimer: function (seconds, onComplete) {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            this.maxTimer = seconds;
            const duration = seconds * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                if (ratio <= 0) {
                    clearInterval(this.timerInterval);
                    this.updateTimerRing(0);
                    onComplete();
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
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

        // 更新計時環的 SVG 描邊顯示：一般模式顯示「消逝時間」（暗紅漸鮮紅），
        // 勝利模式（mode='win'）則顯示「剩餘時間」的金黃色弧段並隨比例縮短
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game12-timer-path');
            const container = document.getElementById('game12-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game12-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            // ⚠️ 對齊三層結構最外圈：rect x=5 y=5、stroke-width=10 → 覆蓋 container 外緣 10px 環帶
            rect.setAttribute('width', Math.max(0, w - 10));
            rect.setAttribute('height', Math.max(0, h - 10));

            const perimeter = (Math.max(0, w - 10) + Math.max(0, h - 10)) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
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
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 色相／飽和度／亮度取自主題朱紅 --fm-timer-red；透明度隨消逝比例掃動（5% → 50%）。
                const base = this.getTimerBaseColor('--fm-timer-red', { h: 0, s: 90, l: 50 });
                const alpha = Math.round(5 + 45 * elapsed);
                rect.style.stroke = `hsla(${base.h}, ${base.s}%, ${base.l}%, ${alpha}%)`;
            }
        },

        // 依難度的 maxMistakeCount 建立對應數量的紅心圖示（生命值）
        renderHearts: function () {
            const container = document.getElementById('game12-hearts');
            if (!container) return;
            container.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        // 依目前錯誤次數，將已用完的紅心改為空心（♡）
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game12-hearts .fm-heart');
            hearts.forEach((h, i) => {
                if (i > this.mistakeCount) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        // 播放音調
        playPitchSound: function (audioIdx) {
            if (!window.SoundManager) return;
            // 使用固定的古箏音階索引播放，增強空間音律記憶
            if (typeof window.SoundManager.playGuzheng === 'function') {
                window.SoundManager.playGuzheng(audioIdx);
            } else {
                window.SoundManager.playOpenItem();
            }
        },
        // 回合結束處理：勝利時觸發計分動畫、成就檢查、並依模式進入下一關或下一局；
        // 失敗時記錄遊戲紀錄（分數 0）、播放失敗音效，並提供重試按鈕
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            // 失敗時寫入 game_logs（score=0，記錄本局時長）
            // 過關時 LOG 已由 ScoreManager.saveScore 負責寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 12,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);
            this.isRevealed = true;
            this.renderQuestion();
            if (win) this.updatePoemInfoVisibility(true);

            if (win) {
                document.getElementById('game12-retryGame-btn').disabled = true;
                document.getElementById('game12-newGame-btn').disabled = true;
            } else {
                document.getElementById('game12-retryGame-btn').disabled = false;
                document.getElementById('game12-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "再試一次吧！"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "勸君更進一杯酒",
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game12', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game12', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game12',
                    timerContainerId: 'game12-grid-container',
                    scoreElementId: 'game12-score',
                    heartsSelector: '#game12-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        checkAchievementsAndShow(finalScore);
                    }
                });
            } else {
                checkAchievementsAndShow();
            }
        },

        // 通用延遲工具，回傳 Promise，供 async 函式中 await 使用以製造動畫節奏
        delay: function (ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        // 依文字長度動態縮小字體：超過 threshold 字數時，依比例縮小 baseFontSizeRem
        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${(newSize) * 20}px`;
            } else {
                element.style.fontSize = `${(baseFontSizeRem) * 20}px`;
            }
        }
    };

    window.Game12 = Game12;

    if (new URLSearchParams(window.location.search).get('game') === '12') {
        setTimeout(() => {
            if (window.Game12) window.Game12.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
