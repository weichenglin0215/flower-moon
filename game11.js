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
        gameStartTime: null,

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

        // 動態載入本遊戲專屬的 CSS 檔案（若尚未載入過才會插入 link 標籤）
        loadCSS: function () {
            if (!document.getElementById('game11-css')) {
                const link = document.createElement('link');
                link.id = 'game11-css';
                link.rel = 'stylesheet';
                link.href = 'game11.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入 CSS、建立 DOM（若尚未建立）、綁定各按鈕的點擊事件
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
            // 訊息按鈕由 GameMessage 元件統一處理，此處不需另外綁定
            document.getElementById('game11-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立遊戲的整體 DOM 結構（外層容器、頂列分數/控制鈕、副標題列、遊戲區與網格），並註冊縮放回呼
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game11-container';
            div.className = 'game11-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game11-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game11-diff-tag" data-level="小學">小學</button>
                        <button id="game11-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game11-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game11-hearts" class="fm-hearts"></div>
                    <div id="game11-poem-info" class="fm-poem-info"></div>
                </div>
                <div id="game11-area" class="game11-area">
                    <div id="game11-status" class="game11-status-msg">準備中...</div>
                    <div id="game11-grid" class="game11-grid-container"></div>
                </div>

                </div>
            `;
            document.body.appendChild(div);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left   = r.left   + 'px';
                    div.style.top    = r.top    + 'px';
                    div.style.width  = 500 + 'px';
                    div.style.height = 850 + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        // 顯示難度選擇器：暫停目前遊戲與計時器，選擇完成後套用新難度並開始新局
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

                    /* updateResponsiveLayout replaced */
                    this.startNewGame();
                });
            }
        },

        // 依照目前是「一般難度模式」或「關卡模式」，更新難度標籤文字與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game11-diff-tag');
            const retryBtn = document.getElementById('game11-retryGame-btn');
            const newBtn = document.getElementById('game11-newGame-btn');
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

        // 對外呼叫的進入點：初始化遊戲、隱藏首頁 IntroOverlay，並開啟難度選擇器（若無選擇器則直接開始遊戲流程）
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
                    this.maxMistakes = settings.maxMistakeCount; // 依照所選難度更新最大允許失誤次數

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active'); // Ensure overlay-active is added
                    if (window.updateResponsiveLayout) {
                        /* updateResponsiveLayout replaced */
                    }
                    this.startNewGame();
                });
            } else {
                this.hideOtherContents();
                this.startGameFlow();
            }
        },

        // 無難度選擇器時的備用流程：直接顯示遊戲容器並延遲一小段時間後開始新局
        startGameFlow: function () {
            this.container.classList.remove('hidden');
            if (window.updateResponsiveLayout) {
                /* updateResponsiveLayout replaced */
            }
            setTimeout(() => {
                this.startNewGame();
            }, 100);
        },

        // 隱藏主頁面的卡片容器，避免與本遊戲畫面重疊
        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },
        // 還原主頁面卡片容器的顯示
        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        // 停止遊戲：關閉進行中狀態、清除所有計時器、隱藏遊戲容器並還原主頁面內容
        stopGame: function () {
            this.isActive = false;
            this.stopAllTimers();
            if (this.container) {
                this.container.classList.add('hidden');
            }
            this.showOtherContents();
        },

        // 停止所有計時器與動畫：取消計分動畫、遞增 turnId（讓進行中的非同步展示流程失效）、清除 interval
        stopAllTimers: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.turnId++;
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = null;
        },

        // 重玩同一首詩：重設分數與失誤次數，重新開始本輪遊戲（不重新抽詩）
        retryGame: function () {
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakes = 0;
            this.resetGameRound(true);
        },

        // 開始一場全新的遊戲：可選擇指定關卡索引（進入關卡模式），重設分數並準備新的挑戰
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

        // 進入下一關：關卡索引 +1 並重新開始遊戲
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 準備本次挑戰：抽取符合難度條件的詩詞，並將詩詞文字隨機分配到網格各格子
        prepareChallenge: function () {
            const settings = this.difficultySettings[this.difficulty];
            this.maxMistakes = settings.maxMistakeCount;

            // 產生詩詞題目，並傳入隨機種子（關卡模式下可依關卡索引產生固定題目）
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
            let _title11 = this.currentPoem.title;
            if (_title11.length > 8) _title11 = _title11.substring(0, 8) + "…";
            info.textContent = `${_title11} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            info.onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            this.updatePoemInfoVisibility(false);

            // 取出詩詞純文字，最多取 maxChars 個字，同時不超過網格總格數
            const rawChars = result.lines.join('').split('').slice(0, settings.maxChars);
            const numGrids = settings.rows * settings.cols;

            this.poemChars = [];

            // 建立一組不重複的格子索引，準備隨機打亂後對應到每個字
            let availableIndices = [];
            for (let i = 0; i < numGrids; i++) availableIndices.push(i);

            // 使用 Fisher-Yates 演算法將格子索引隨機打亂
            for (let i = availableIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
            }

            for (let i = 0; i < rawChars.length; i++) {
                if (i >= numGrids) break; // 安全檢查：字數不應超過網格總格數
                this.poemChars.push({
                    char: rawChars[i],
                    gridIdx: availableIndices[i]
                });
            }

            this.setupGrid(settings.rows, settings.cols, numGrids);
            return true;
        },

        // 小學難度維持顯示詩詞出處供提示；中學以上開局隱藏，勝利後才顯示
        updatePoemInfoVisibility: function (revealed) {
            const info = document.getElementById('game11-poem-info');
            if (!info) return;
            info.style.display = (this.difficulty === '小學' || revealed) ? '' : 'none';
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
                // 音符索引採 20 音循環 (1-20)
                const pitchMode = ((gridSequenceNum - 1) % 20) + 1;
                // 最終傳給 SoundManager 的索引偏移：
                // 使用 playGuzheng() 並維持先前 5-25 的範圍感受，故 +4 (讓 1-20 變成 5-24)
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

        // 依 maxMistakes 數量，重新產生對應數量的紅心圖示
        renderHearts: function () {
            const hearts = document.getElementById('game11-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.maxMistakes; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        // 依目前失誤次數，更新紅心顯示為實心（未失誤）或空心（已失誤）
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game11-hearts .fm-heart');
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

        // 重置本局遊戲狀態：清除計時器、重繪分數與紅心、重設目前輪次進度，並開始展示階段
        resetGameRound: function (isRetry = false) {
            this.stopAllTimers();
            this.gameStartTime = Date.now();
            document.getElementById('game11-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.renderHearts();
            this.updateHearts();
            this.updatePoemInfoVisibility(false);

            const settings = this.difficultySettings[this.difficulty];
            this.currentStep = Math.min((settings.passChars || 0) + 1, this.poemChars.length);
            this.playerProgress = 0;
            this.isPlayerPhase = false;

            document.getElementById('game11-retryGame-btn').disabled = false;
            document.getElementById('game11-newGame-btn').disabled = false;

            this.setAllTilesState(false);

            this.startShowPhase();
        },

        // 將所有格子統一設為翻開(isOpen=true)或蓋上(isOpen=false)狀態
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
                    //撥放音階
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
        // 處理玩家點擊字塊：驗證是否點中目前應該點擊的目標格子，分派至正確/錯誤處理邏輯
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

        // 處理點擊正確的情況：翻開字塊、依 feedback 設定決定是否蓋回前一格、加分並檢查本輪是否完成
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
            //每一句增加分數
            // 擊中文字，根據window.ScoreManager.gameSettings['game11'].getPointA加分
            this.score += window.ScoreManager.gameSettings['game11'].getPointA;
            document.getElementById('game11-status').textContent = `第 ${this.currentStep} 輪，玩家回合：依序點擊 ${this.playerProgress} / ${this.currentStep}`;
            document.getElementById('game11-score').textContent = this.score;
            // 檢查是否完成所有回合
            if (this.playerProgress >= this.currentStep) {
                // 本輪完成
                this.isPlayerPhase = false;
                document.getElementById('game11-status').textContent = `第 ${this.currentStep} 輪，正確！`;

                // 已取消，每一輪完成之後增加得分
                // 每一輪完成，根據window.ScoreManager.gameSettings['game11'].getPointB加分
                //this.score += window.ScoreManager.gameSettings['game11'].getPointB;
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
        // 處理錯誤點擊事件：播放錯誤動畫/音效、增加失誤次數，超過上限則遊戲結束，否則重新展示本輪
        handleWrongClick: function (idx) {
            const tile = this.tiles[idx];

            // 錯誤視覺效果：先移除再重新加上 class 以重新觸發動畫
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
            if (typeof window.SoundManager.playGuzheng === 'function') {
                window.SoundManager.playGuzheng(audioIdx);
            } else {
                window.SoundManager.playOpenItem();
            }
        },
        // 延遲
        delay: function (ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },
        // 處理勝利事件：翻開全部字塊、播放得分動畫，完成後進入遊戲結束流程
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
                heartsSelector: '#game11-hearts .fm-heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.score = finalScore;
                    // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                    this.gameOver(true, '');
                }
            });
        },
        // 處理遊戲結束事件
        // 處理遊戲結束事件（win=true 為勝利，false 為失敗）：寫入紀錄、更新按鈕狀態並顯示結果訊息
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
                    gameNo: 11,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            this.gridContainer.classList.remove('is-player-phase');
            if (win) this.updatePoemInfoVisibility(true);

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
