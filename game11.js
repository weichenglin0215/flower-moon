(function () {
    const Game11 = {
        isActive: false,        // 遊戲是否進行中
        difficulty: '小學',    // 當前難度
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,              // 當前分數
        mistakes: 0,           // 當前失誤次數
        maxMistakes: 5,        // 最大允許失誤次數
        currentPoem: null,     // 當前挑戰的詩詞資料

        poemChars: [], // 儲存詩詞字元及其在網格中的索引 [{char, gridIdx}, ...]
        tiles: [], // 儲存網格 DOM 元素及其狀態

        currentStep: 1,      // 當前輪次需要記住的字元個數 (從 1 開始遞增)
        playerProgress: 0,   // 玩家在當前輪次中已點擊的正確個數
        isPlayerPhase: false, // 是否為玩家輸入階段

        lastClickTime: 0,    // 防止連點的計時器
        timerInterval: null,
        turnId: 0,

        // 獲取各難度配置參數
        //poemMinRating 最低詩詞評分
        //maxMistakeCount 最多錯誤次數
        //rows:總行數, cols:每行字數
        //mode: all:全部顯示, seq:依序顯示
        //feedback: keep:翻開之後保留翻開狀態, hide:翻開之後再蓋回
        //minLines:最少顯示行數, maxLines:最多顯示行數
        //minChars:最少顯示字數, maxChars:最多顯示字數
        //slowFlipChars:翻開較慢的字數，預設為35，避免拖慢翻開時間長度，可改成3。
        //舉例：若slowFlipChars = 3，欲翻開文字數為10個(不包括新增翻開字)，前7個字以0.2秒速度翻開，最後3個字會以0.5秒速度翻開。
        //passChars:起始顯示字數，一開始翻開較多字數來加快遊戲進行節奏，預設為0
        //revealStep:每輪增加顯示的字數
        difficultySettings: {
            '小學': { poemMinRating: 6, maxMistakeCount: 6, rows: 4, cols: 3, mode: 'all', feedback: 'keep', minLines: 1, maxLines: 2, minChars: 5, maxChars: 10, slowFlipChars: 7, passChars: 0, revealStep: 1 },
            '中學': { poemMinRating: 5, maxMistakeCount: 8, rows: 5, cols: 3, mode: 'all', feedback: 'keep', minLines: 2, maxLines: 2, minChars: 10, maxChars: 14, slowFlipChars: 7, passChars: 3, revealStep: 1 },
            '高中': { poemMinRating: 4, maxMistakeCount: 10, rows: 5, cols: 4, mode: 'all', feedback: 'keep', minLines: 2, maxLines: 4, minChars: 14, maxChars: 21, slowFlipChars: 7, passChars: 6, revealStep: 2 },
            '大學': { poemMinRating: 3, maxMistakeCount: 12, rows: 6, cols: 5, mode: 'all', feedback: 'hide', minLines: 3, maxLines: 4, minChars: 20, maxChars: 28, slowFlipChars: 7, passChars: 9, revealStep: 2 },
            '研究所': { poemMinRating: 2, maxMistakeCount: 14, rows: 7, cols: 5, mode: 'seq', feedback: 'hide', minLines: 4, maxLines: 6, minChars: 28, maxChars: 35, slowFlipChars: 7, passChars: 12, revealStep: 3 }
        },

        loadCSS: function () {
            if (!document.getElementById('game11-css')) {
                const link = document.createElement('link');
                link.id = 'game11-css';
                link.rel = 'stylesheet';
                link.href = 'game11.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game11-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game11-container');
            this.gridContainer = document.getElementById('game11-grid');

            document.getElementById('game11-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game11-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            // Message button handled by GameMessage
            document.getElementById('game11-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game11-container';
            div.className = 'game11-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game11-header">
                    <div class="game11-score-board">分數: <span id="game11-score">0</span></div>
                    <div class="game11-controls">
                        <button class="game11-difficulty-tag" id="game11-diff-tag">小學</button>
                        <button id="game11-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game11-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game11-sub-header">
                    <div id="game11-hearts" class="hearts"></div>
                </div>
                <div id="game11-area" class="game11-area">
                    <div id="game11-poem-info" class="game11-poem-info"></div>
                    <div id="game11-status" class="game11-status-msg">準備中...</div>
                    <div id="game11-grid" class="game11-grid-container"></div>
                </div>

                </div>
            `;
            document.body.appendChild(div);
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('翻墨識蹤', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[selectedLevel];
                    if (!settings) return;
                    this.maxMistakes = settings.maxMistakeCount;

                    this.updateUIForMode();

                    const container = document.getElementById('game11-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.classList.add('overlay-active');
                    }

                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game11-diff-tag');
            const retryBtn = document.getElementById('game11-retryGame-btn');
            const newBtn = document.getElementById('game11-newGame-btn');
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

        show: function () {
            this.init();

            // 確保主頁面的 IntroOverlay 隱藏
            const intro = document.getElementById('introOverlay');
            if (intro && !intro.classList.contains('hidden')) {
                intro.classList.add('hidden', 'hide-fade');
                document.body.classList.remove('overlay-active');
            }

            if (window.DifficultySelector) {
                window.DifficultySelector.show('翻墨識蹤', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[selectedLevel];
                    if (!settings) {
                        console.error("Invalid difficulty level selected:", selectedLevel);
                        return;
                    }
                    this.maxMistakes = settings.maxMistakeCount; // Update maxMistakes based on selected difficulty

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active'); // Ensure overlay-active is added
                    if (window.updateResponsiveLayout) {
                        window.updateResponsiveLayout();
                    }
                    this.startNewGame();
                });
            } else {
                this.hideOtherContents();
                this.startGameFlow();
            }
        },

        startGameFlow: function () {
            this.container.classList.remove('hidden');
            if (window.updateResponsiveLayout) {
                window.updateResponsiveLayout();
            }
            setTimeout(() => {
                this.startNewGame();
            }, 100);
        },

        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },
        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        stopGame: function () {
            this.isActive = false;
            this.stopAllTimers();
            if (this.container) {
                this.container.classList.add('hidden');
            }
            this.showOtherContents();
        },

        stopAllTimers: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.turnId++;
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = null;
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakes = 0;
            this.resetGameRound(true);
        },

        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }

            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            this.mistakes = 0;
            if (this.prepareChallenge()) {
                this.resetGameRound();
            }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        prepareChallenge: function () {
            const settings = this.difficultySettings[this.difficulty];
            this.maxMistakes = settings.maxMistakeCount;

            // Generate Poem，傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                2, 2, 8, 30, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game11'
            );
            if (!result) {
                alert('找不到符合評分的詩詞。');
                return;
            }
            this.currentPoem = result.poem;

            const info = document.getElementById('game11-poem-info');
            info.innerHTML = `<span>${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}</span>`;
            info.onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };

            // Extract pure chars up to maxChars available, but bounded by grid capacity
            const rawChars = result.lines.join('').split('').slice(0, settings.maxChars);
            const numGrids = settings.rows * settings.cols;

            this.poemChars = [];

            // Randomly map chars to unique grid indices
            let availableIndices = [];
            for (let i = 0; i < numGrids; i++) availableIndices.push(i);

            // Shuffle
            for (let i = availableIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
            }

            for (let i = 0; i < rawChars.length; i++) {
                if (i >= numGrids) break; // Safe check
                this.poemChars.push({
                    char: rawChars[i],
                    gridIdx: availableIndices[i]
                });
            }

            this.setupGrid(settings.rows, settings.cols, numGrids);
            return true;
        },

        // 初始化網格與字塊
        setupGrid: function (rows, cols, numGrids) {
            this.gridContainer.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            this.gridContainer.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
            this.gridContainer.innerHTML = '';
            this.tiles = [];

            for (let i = 0; i < numGrids; i++) {
                const el = document.createElement('div');
                el.className = 'game11-tile';
                el.dataset.idx = i;

                // 隨機分配一個格子的視覺顏色 (HSL)
                const hue = Math.floor(Math.random() * 360);
                const lum = Math.floor(Math.random() * 30) + 50;
                const frontColor = `hsl(${hue}, 70%, ${lum}%)`;

                // 為每一格指定一個固定的音調索引，強化聽覺記憶
                // 規則：從左下角開始編號 (1,2,3...21)，超過 21 則重回 1。
                // 座標計算：r 為列 (0-rows-1, 0是頂部), c 為欄 (0-cols-1)
                // 左下角座標為 (rows-1, 0)，編號 1 應對應到此位置。
                const r = Math.floor(i / cols);
                const c = i % cols;
                // 轉換為從底部開始的 row index (0是底部)
                const bottomUpRow = (rows - 1) - r;
                // 計算格子在「左下起算」邏輯下的序號 (1-based)
                const gridSequenceNum = (bottomUpRow * cols) + c + 1;
                // 音符索引採 21 音循環 (1-21)
                const pitchMode = ((gridSequenceNum - 1) % 21) + 1;
                // 最終傳給 SoundManager 的索引偏移：
                // 使用 playGuzhengLow() 並維持先前 5-25 的範圍感受，故 +4 (讓 1-21 變成 5-25)
                const audioIdx = pitchMode + 4;

                // 檢查此格子是否對應到詩詞字元
                const mappedCharObj = this.poemChars.find(pc => pc.gridIdx === i);
                const charText = mappedCharObj ? mappedCharObj.char : '';

                el.innerHTML = `
                    <div class="game11-tile-inner">
                        <div class="game11-tile-front" style="background: ${frontColor}"></div>
                        <div class="game11-tile-back">${charText}</div>
                    </div>
                `;

                el.onclick = () => this.handleTileClick(i);

                this.gridContainer.appendChild(el);
                this.tiles.push({ el, charText, isOpen: false, audioIdx });
            }
        },

        renderHearts: function () {
            const hearts = document.getElementById('game11-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.maxMistakes; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game11-hearts .heart');
            hearts.forEach((h, i) => {
                if (i < this.mistakes) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        resetGameRound: function (isRetry = false) {
            this.stopAllTimers();
            document.getElementById('game11-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.renderHearts();
            this.updateHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.currentStep = Math.min((settings.passChars || 0) + 1, this.poemChars.length);
            this.playerProgress = 0;
            this.isPlayerPhase = false;

            document.getElementById('game11-retryGame-btn').disabled = false;
            document.getElementById('game11-newGame-btn').disabled = false;

            this.setAllTilesState(false);

            this.startShowPhase();
        },

        setAllTilesState: function (isOpen) {
            this.tiles.forEach(t => {
                t.isOpen = isOpen;
                if (isOpen && t.charText) {
                    t.el.classList.add('flipped');
                } else {
                    t.el.classList.remove('flipped');
                }
            });
        },

        // 開始「展示階段」：翻開順序讓玩家記憶
        startShowPhase: async function () {
            const currentTurn = this.turnId;
            if (!this.isActive) return;
            this.isPlayerPhase = false; // 鎖定點擊
            this.gridContainer.classList.remove('is-player-phase');
            const statusEl = document.getElementById('game11-status');
            statusEl.textContent = `第 ${this.currentStep} 輪：請記住順序...共 ${this.poemChars.length} 個字`;

            document.getElementById('game11-retryGame-btn').disabled = true;
            document.getElementById('game11-newGame-btn').disabled = true;

            const settings = this.difficultySettings[this.difficulty];
            const currentSequence = this.poemChars.slice(0, this.currentStep);

            await this.delay(800); // 準備時間

            if (settings.mode === 'all') {
                // 'all' 模式：逐一翻開，但翻開後保持不蓋上，直到全部顯示完畢
                for (let i = 0; i < currentSequence.length; i++) {
                    if (!this.isActive || this.turnId !== currentTurn) return;
                    const item = currentSequence[i];
                    const t = this.tiles[item.gridIdx];
                    t.el.classList.add('flipped');
                    this.playPitchSound(t.audioIdx);

                    // 判斷是否屬於最後幾張需要放慢進度的字數
                    const isSlow = (currentSequence.length - i) <= (settings.slowFlipChars || 3);
                    await this.delay(isSlow ? 500 : 300);
                }

                await this.delay(1000); // 全部顯示後的記憶停留時間

                if (!this.isActive || this.turnId !== currentTurn) return;
                // 展示結束，全部蓋上
                for (let item of currentSequence) {
                    const t = this.tiles[item.gridIdx];
                    t.el.classList.remove('flipped');
                }
            } else {
                // 'seq' 模式：一次只翻開一個，蓋上後才翻下一個
                for (let i = 0; i < currentSequence.length; i++) {
                    if (!this.isActive || this.turnId !== currentTurn) return;
                    const item = currentSequence[i];
                    const t = this.tiles[item.gridIdx];
                    t.el.classList.add('flipped');
                    this.playPitchSound(t.audioIdx);

                    const isSlow = (currentSequence.length - i) <= (settings.slowFlipChars || 3);
                    await this.delay(isSlow ? 800 : 500); // seq 模式整體較慢，但也按比例加速

                    if (this.turnId !== currentTurn) return;

                    t.el.classList.remove('flipped');
                    await this.delay(isSlow ? 200 : 100);
                }
            }

            if (!this.isActive || this.turnId !== currentTurn) return;
            // 轉入玩家階段
            this.playerProgress = 0;
            this.isPlayerPhase = true;
            this.gridContainer.classList.add('is-player-phase');
            statusEl.textContent = `第 ${this.currentStep} 輪，玩家回合：依序點擊 ${this.playerProgress} / ${this.currentStep}`;
            document.getElementById('game11-retryGame-btn').disabled = false;
            document.getElementById('game11-newGame-btn').disabled = false;
        },

        // 處理字塊點擊事件
        handleTileClick: function (idx) {
            if (!this.isActive || !this.isPlayerPhase) return;

            // 防止過快重複點擊 (Debounce)
            const now = Date.now();
            if (now - this.lastClickTime < 100) return;
            this.lastClickTime = now;

            // 取得目前的目標字元資訊與點擊的字塊
            const expectedItem = this.poemChars[this.playerProgress];
            const clickedTile = this.tiles[idx];

            if (idx === expectedItem.gridIdx) {
                // 正確：執行正確點擊邏輯
                this.handleCorrectClick(idx);
            } else {
                // 錯誤：執行錯誤懲罰邏輯
                this.handleWrongClick(idx);
            }
        },

        handleCorrectClick: function (idx) {
            const tile = this.tiles[idx];
            tile.el.classList.add('flipped');
            // 播放該格固定的音調
            this.playPitchSound(tile.audioIdx);

            const settings = this.difficultySettings[this.difficulty];

            if (settings.feedback === 'hide') {
                // 蓋上一個字: If playerProgress > 0, hide the (playerProgress - 1) tile
                if (this.playerProgress > 0) {
                    const prevItem = this.poemChars[this.playerProgress - 1];
                    this.tiles[prevItem.gridIdx].el.classList.remove('flipped');
                }
            }

            this.playerProgress++;
            this.score += 5; // 每一句增加得分
            document.getElementById('game11-status').textContent = `第 ${this.currentStep} 輪，玩家回合：依序點擊 ${this.playerProgress} / ${this.currentStep}`;
            document.getElementById('game11-score').textContent = this.score;
            // 檢查是否完成所有回合
            if (this.playerProgress >= this.currentStep) {
                // Round Complete
                this.isPlayerPhase = false;
                document.getElementById('game11-status').textContent = `第 ${this.currentStep} 輪，正確！`;

                // 已取消，每一輪完成之後增加得分
                //this.score += 50;
                document.getElementById('game11-score').textContent = this.score;

                setTimeout(() => {
                    this.setAllTilesState(false);
                    const settings = this.difficultySettings[this.difficulty];
                    const stepInc = settings.revealStep || 1;

                    // 若剛完成的這一輪已經是整首詩的字數，則獲勝
                    if (this.currentStep >= this.poemChars.length) {
                        this.handleWin();
                    } else {
                        // 否則增加字數挑戰，並確保最後一輪一定會包含到詩詞的所有字元
                        this.currentStep = Math.min(this.currentStep + stepInc, this.poemChars.length);
                        this.startShowPhase();
                    }
                }, 1000);
            }
        },
        // 處理錯誤點擊事件
        handleWrongClick: function (idx) {
            const tile = this.tiles[idx];

            // Error visual
            tile.el.classList.remove('error');
            void tile.el.offsetWidth;
            tile.el.classList.add('error');

            if (window.SoundManager) window.SoundManager.playFailure();

            this.mistakes++;
            this.updateHearts();

            if (this.mistakes >= this.maxMistakes) {
                this.gameOver(false, "失誤過多！");
            } else {
                // Retry round
                this.isPlayerPhase = false;
                document.getElementById('game11-status').textContent = `第 ${this.currentStep} 輪，點錯了！再看一次...`;

                setTimeout(() => {
                    this.setAllTilesState(false);
                    this.startShowPhase();
                }, 1000);
            }
        },
        // 播放音調
        playPitchSound: function (audioIdx) {
            if (!window.SoundManager) return;
            // 使用固定的古箏音階索引播放，增強空間音律記憶
            if (typeof window.SoundManager.playGuzhengLow === 'function') {
                window.SoundManager.playGuzhengLow(audioIdx);
            } else {
                window.SoundManager.playOpenItem();
            }
        },
        // 延遲
        delay: function (ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },
        // 處理勝利事件
        handleWin: function () {
            this.isActive = false;
            this.gridContainer.classList.remove('is-player-phase');
            document.getElementById('game11-retryGame-btn').disabled = true;
            document.getElementById('game11-newGame-btn').disabled = true;
            document.getElementById('game11-status').textContent = "完美！全數過目不忘！";

            // Show all characters
            this.poemChars.forEach(item => {
                this.tiles[item.gridIdx].el.classList.add('flipped');
            });

            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game11',
                timerContainerId: 'game11-grid',
                scoreElementId: 'game11-score',
                heartsSelector: '#game11-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.score = finalScore;
                    // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                    this.gameOver(true, '');
                }
            });
        },
        // 處理遊戲結束事件
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            this.gridContainer.classList.remove('is-player-phase');

            if (win) {
                document.getElementById('game11-retryGame-btn').disabled = true;
                document.getElementById('game11-newGame-btn').disabled = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
            } else {
                document.getElementById('game11-retryGame-btn').disabled = false;
                document.getElementById('game11-newGame-btn').disabled = false;
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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "再試一次"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game11', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game11', this.currentLevelIndex, () => showMessage(reason));
                } else {
                    showMessage(reason);
                }
            } else {
                showMessage(reason);
            }
        }
    };

    window.Game11 = Game11;

    if (new URLSearchParams(window.location.search).get('game') === '11') {
        setTimeout(() => {
            if (window.Game11) window.Game11.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
