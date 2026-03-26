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
        //timeLimit 時間限制
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
            '小學': { timeLimit: 30, poemMinRating: 6, maxMistakeCount: 4, minShowCount: 1, maxShowCount: 4, minTotalHideCount: 4, memorySeconds: 5, isSequentialOpen: true, isSequentialHide: true, hasDistractors: false, showDelay: 0, hideMode: 'line2', total: 6, cols: 3 },
            '中學': { timeLimit: 30, poemMinRating: 5, maxMistakeCount: 6, minShowCount: 1, maxShowCount: 3, minTotalHideCount: 6, memorySeconds: 7, isSequentialOpen: true, isSequentialHide: false, hasDistractors: false, showDelay: 8, hideMode: 'random1or2', total: 8, cols: 4 },
            '高中': { timeLimit: 30, poemMinRating: 4, maxMistakeCount: 8, minShowCount: 2, maxShowCount: 3, minTotalHideCount: 8, memorySeconds: 10, isSequentialOpen: true, isSequentialHide: false, hasDistractors: true, showDelay: 16, hideMode: 'line1or12', total: 10, cols: 5 },
            '大學': { timeLimit: 30, poemMinRating: 3, maxMistakeCount: 12, minShowCount: 1, maxShowCount: 2, minTotalHideCount: 10, memorySeconds: 12, isSequentialOpen: false, isSequentialHide: false, hasDistractors: true, showDelay: 24, hideMode: 'both', total: 12, cols: 4 },
            '研究所': { timeLimit: 30, poemMinRating: 2, maxMistakeCount: 14, minShowCount: 0, maxShowCount: 0, minTotalHideCount: 10, memorySeconds: 15, isSequentialOpen: false, isSequentialHide: false, hasDistractors: true, showDelay: 32, hideMode: 'both', total: 16, cols: 4 }
        },
        showTimeout: null,
        cluesRevealed: false,

        loadCSS: function () {
            if (!document.getElementById('game12-css')) {
                const link = document.createElement('link');
                link.id = 'game12-css';
                link.rel = 'stylesheet';
                link.href = 'game12.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game12-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game12-container');
            this.gridArea = document.getElementById('game12-grid');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game12-container';
            div.className = 'game12-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game12-header">
                    <div class="game12-score-board">分數: <span id="game12-score">0</span></div>
                    <div class="game12-controls">
                        <button class="game12-difficulty-tag" id="game12-diff-tag">小學</button>
                        <button id="game12-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game12-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game12-sub-header">
                    <div id="game12-hearts" class="hearts"></div>
                </div>
                <div id="game12-area" class="game12-area">
                    <div id="game12-question" class="game12-question-area">
                        <div id="game12-line1" class="poem-lines"></div>
                        <div id="game12-line2" class="poem-lines"></div>
                        <div id="game12-info" class="poem-info"></div>
                    </div>
                    <div id="game12-status" class="game12-status-msg"></div>
                    <div class="game12-answer-section">
                        <div id="game12-grid-container" class="grid-container">
                            <svg id="game12-timer-ring">
                                <rect id="game12-timer-path" x="3" y="3"></rect>
                            </svg>
                            <div class="game12-answer-grid" id="game12-grid"></div>
                        </div>
                    </div>
                </div>
                <div id="game12-message" class="game12-message hidden">
                    <h2 id="game12-msg-title">遊戲結束</h2>
                    <p id="game12-msg-content"></p>
                    <button id="game12-msg-btn" class="nav-btn">勸君更進一杯酒</button>
                </div>
            `;
            document.body.appendChild(div);
            document.getElementById('game12-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game12-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game12-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game12-message').classList.add('hidden');
                if (this.isWin) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };
            document.getElementById('game12-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            this.renderHearts();
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game12-message').classList.add('hidden');
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
                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game12-diff-tag');
            const retryBtn = document.getElementById('game12-retryGame-btn');
            const newBtn = document.getElementById('game12-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };

            if (this.isLevelMode) {
                if (diffTag) {
                    diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) {
                    diffTag.textContent = this.difficulty;
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
        },

        hideOtherContents: function () {
            ['cardContainer', 'calendarCardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container', 'game8-container', 'game9-container', 'game10-container', 'game11-container'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id.includes('Container')) el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        showOtherContents: function () {
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

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
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.stopAllTimers();

            document.getElementById('game12-score').textContent = this.score;
            document.getElementById('game12-message').classList.add('hidden');
            this.renderHearts();

            if (this.selectRandomPoem()) {
                this.initTurn();
            } else {
                this.showDifficultySelector();
            }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            // 啟用按鈕 (修正 Rule 3)
            document.getElementById('game12-retryGame-btn').disabled = false;
            document.getElementById('game12-newGame-btn').disabled = false;

            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.stopAllTimers();

            document.getElementById('game12-score').textContent = this.score;
            document.getElementById('game12-message').classList.add('hidden');
            this.renderHearts();
            this.initTurn(true);
        },

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
            while (attempts < 30) {
                attempts++;
                // 傳入種子
                const result = getSharedRandomPoem(
                    settings.poemMinRating || 4,
                    2,
                    2,
                    8,
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
                if (modeStr === 'line2') hideIndices = [1]; //隱藏字在第二行
                else if (modeStr === 'random1or2') hideIndices = [Math.random() < 0.5 ? 0 : 1]; //隱藏字在第一行或第二行
                else if (modeStr === 'line1or12') { //隱藏字在第一行或第一跟第二行(兩行都有)
                    const rand = Math.random();
                    hideIndices = rand < 0.5 ? [0] : [0, 1];
                } else if (modeStr === 'both') hideIndices = [0, 1]; //隱藏字在第一行和第二行，兩行都有

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

        initTurn: function (isRetry = false) {
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.renderQuestion();
            this.setupGrid(isRetry);
            this.startMemoryPhase();
        },

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

                lineEl.className = 'poem-lines';
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

            // showDelay 邏輯 (修正 Rule 4)
            if (settings.showDelay > 0 && !this.cluesRevealed) {
                if (this.showTimeout) clearTimeout(this.showTimeout);
                this.showTimeout = setTimeout(() => {
                    this.cluesRevealed = true;
                    this.renderQuestion();
                }, settings.showDelay * 1000);
            }

            info.innerHTML = `<span>${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}</span>`;
            info.onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
        },

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
                    const audioIdx = ((gridSequenceNum - 1) % 21) + 5;

                    // 隨機 HSL 顏色 (Rule 5)
                    const hue = Math.floor(Math.random() * 360);
                    const lum = Math.floor(Math.random() * 30) + 50;
                    const frontColor = `hsl(${hue}, 70%, ${lum}%)`;

                    return { ...item, gridIdx: i, audioIdx, frontColor };
                });
            }

            this.renderGridDisplay(config.cols);
        },

        renderGridDisplay: function (cols) {
            const container = document.getElementById('game12-grid');
            container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            container.innerHTML = '';

            this.currentGridChars.forEach(item => {
                const tile = document.createElement('div');
                tile.className = 'game12-tile';
                tile.id = `tile-${item.gridIdx}`;
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
            this.startTimer(settings.timeLimit, () => {
                if (this.turnId === currentTurn) {
                    this.gameOver(false, "時間到！");
                }
            });

            // 顯示倒數框 (Rule 6)
            document.getElementById('game12-timer-ring').classList.remove('hidden');
        },

        handleTileClick: function (item, tileEl) {
            if (!this.isActive || !this.isPlayerPhase) return;
            if (tileEl.classList.contains('disabled') || tileEl.classList.contains('flipped')) return;

            const target = this.hiddenPositions[this.currentInputIndex];
            if (item.char === target.char) {
                // 正確 (Rule 3)
                tileEl.classList.add('flipped', 'correct', 'disabled');
                if (window.SoundManager) {
                    if (window.SoundManager.playGuzhengLow) window.SoundManager.playGuzhengLow(item.audioIdx);
                    else window.SoundManager.playSuccess();
                }
                this.score += 20;
                document.getElementById('game12-score').textContent = this.score;
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.currentInputIndex === this.hiddenPositions.length) {
                    this.gameWin();
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

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game12-timer-path');
            const container = document.getElementById('game12-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game12-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            rect.setAttribute('width', Math.max(0, w - 6));
            rect.setAttribute('height', Math.max(0, h - 6));

            const perimeter = (Math.max(0, w - 6) + Math.max(0, h - 6)) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - ratio);
        },

        renderHearts: function () {
            const container = document.getElementById('game12-hearts');
            if (!container) return;
            container.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game12-hearts .heart');
            hearts.forEach((h, i) => {
                if (i < this.mistakeCount) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        gameWin: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game12-retryGame-btn').disabled = true;
            document.getElementById('game12-newGame-btn').disabled = true;
            this.isRevealed = true;
            this.renderQuestion();

            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game12',
                timerContainerId: 'game12-grid-container',
                scoreElementId: 'game12-score',
                heartsSelector: '#game12-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.gameOver(true, finalScore);
                }
            });
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);
            this.isRevealed = true;
            this.renderQuestion();

            if (win) {
                document.getElementById('game12-retryGame-btn').disabled = true;
                document.getElementById('game12-newGame-btn').disabled = true;
            } else {
                document.getElementById('game12-retryGame-btn').disabled = false;
                document.getElementById('game12-newGame-btn').disabled = false;
            }

            const msgDiv = document.getElementById('game12-message');
            const title = document.getElementById('game12-msg-title');
            const content = document.getElementById('game12-msg-content');

            setTimeout(() => {
                msgDiv.classList.remove('hidden');
                if (win) {
                    title.textContent = "疏影橫斜水清淺";
                    title.style.color = "#2ecc71";
                    content.textContent = `得分：${reason}`;
                } else {
                    title.textContent = "暗香浮動月黃昏";
                    title.style.color = "#ff4757";
                    content.textContent = reason || "再試一次吧！";
                }
                const msgBtn = document.getElementById('game12-msg-btn');
                if (win) {
                    if (this.isLevelMode) {
                        msgBtn.textContent = "下一關";
                        if (window.ScoreManager) {
                            window.ScoreManager.completeLevel('game12', this.difficulty, this.currentLevelIndex);
                        }
                    } else {
                        msgBtn.textContent = "下一局";
                    }
                } else {
                    msgBtn.textContent = "再試一次";
                }
            }, 500);
        },

        delay: function (ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
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
