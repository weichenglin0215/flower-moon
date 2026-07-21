
(function () {
    // 遊戲狀態
    const Game3 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        speed: 0.1, // 執行中的速度 (rem/幀)
        baseSpeed: 0.06,//初始速度
        incrementSpeed: 0.005,//速度增長量
        maxSpeed: 0.3,//最大速度
        rows: [], // 存放行元素的陣列
        currentRowIndex: 0, // 當前需要點擊的行索引
        animationId: null,
        poemChars: [], // 詩詞的所有字
        container: null,
        gameArea: null,
        historyContainer: null,
        historyData: [], // 紀錄每個字的狀態 { char, status, isSep }
        mistakeCount: 0,//錯誤次數
        gameStartTime: null, // 本局開始時的時間戳（Date.now()），用於計算 duration_s
        updateLayoutMetrics: function () { }, // 已棄用（保留空函式以維持相容性）
        // 按鈕高度 CSS 定義為 70px，垂直間距固定為 16px
        btnHeightRem: 3.5,
        verticalGapRem: 0.8,
        currentRowFontColor: 'rgba(24, 23, 0, 1)',
        nextRowFontColor: 'rgba(24, 23, 0, 0.5)',
        // 難度設定
        difficulty: '小學',
        //poemMinRating: 詩詞最低評分
        //maxMistakeCount: 最大錯誤次數
        //sentenceMinRating: 句子最低評分
        //minOptions: 最少選項
        //maxOptions: 最多選項
        //isStrictOrder: 是否嚴格按照順序
        //incrementSpeed: 速度增長量
        //maxSpeed: 最大速度
        difficultySettings: {
            '小學': { poemMinRating: 6, maxMistakeCount: 10, sentenceMinRating: 5, minOptions: 1, maxOptions: 2, isStrictOrder: false, incrementSpeed: 0.006, maxSpeed: 0.10 },
            '中學': { poemMinRating: 5, maxMistakeCount: 9, sentenceMinRating: 3, minOptions: 1, maxOptions: 3, isStrictOrder: false, incrementSpeed: 0.008, maxSpeed: 0.12 },
            '高中': { poemMinRating: 4, maxMistakeCount: 8, sentenceMinRating: 2, minOptions: 2, maxOptions: 3, isStrictOrder: false, incrementSpeed: 0.010, maxSpeed: 0.16 },
            '大學': { poemMinRating: 3, maxMistakeCount: 7, sentenceMinRating: 1, minOptions: 3, maxOptions: 4, isStrictOrder: true, incrementSpeed: 0.012, maxSpeed: 0.2 },
            '研究所': { poemMinRating: 3, maxMistakeCount: 6, sentenceMinRating: 1, minOptions: 3, maxOptions: 5, isStrictOrder: true, incrementSpeed: 0.014, maxSpeed: 0.24 }
        },

        // 動態載入 game3.css 樣式表（避免重複載入）
        loadCSS: function () {
            if (!document.getElementById('game3-css')) {
                const link = document.createElement('link');
                link.id = 'game3-css';
                link.rel = 'stylesheet';
                link.href = 'game3.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入 CSS、建立 DOM（若尚未存在）並綁定按鈕事件
        init: function () {
            this.loadCSS();
            // 創建遊戲 DOM 結構 (如果不存在)
            if (!document.getElementById('game3-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game3-container');
            this.gameArea = document.getElementById('game3-area');
            this.historyContainer = document.getElementById('game3-history');

            // 綁定關閉按鈕
            document.getElementById('game3-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();// 重來：保留題目
            };
            document.getElementById('game3-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();// 開新局：換新題目
            };
            document.getElementById('game3-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立遊戲的整體 DOM 結構（頁首分數列、愛心列、遊戲區域、歷程顯示區），僅在第一次進入遊戲時執行
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game3-container';
            div.className = 'game3-overlay  hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <!-- <div class="debug-frame"></div> -->
                
                <div class="game3-header">
                    <div class="game3-score-board">分數: <span id="game3-score">0</span></div>
                    <div class="game3-controls">
                        <button class="game3-difficulty-tag" id="game3-diff-tag">小學</button>
                        <button id="game3-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game3-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game3-sub-header">
                    <div id="game3-hearts" class="hearts"></div>
                </div>
                <div id="game3-area" class="game3-area">
                    <!-- 遊戲內容將在此生成 -->
                </div>
                <div id="game3-history" class="game3-history"></div>
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

        // 對外的遊戲進入點：確保 DOM 已建立，接著顯示難度選擇畫面
        show: function () {
            this.init(); // 確保 DOM 存在

            // 顯示難度選擇器
            this.showDifficultySelector();
        },

        // 顯示難度／關卡選擇器，並在使用者選定後設定難度、切換為遊戲模式並開始新的一局
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.gameArea.innerHTML = '';
            if (window.GameMessage) window.GameMessage.hide();

            // 隱藏主頁和其他遊戲
            this.hideOtherContents();

            // 使用全局难度选择器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('字爬梯', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.updateResponsiveLayout) {
                        /* updateResponsiveLayout 已由其他機制取代，此處不再需要呼叫 */
                    }
                    this.startNewGame();
                });
            } else {
                console.warn('[Game3] DifficultySelector not found');
            }
        },

        // 根據目前是「一般難度模式」或「關卡挑戰模式」，更新頁首難度標籤文字、顏色與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game3-diff-tag');
            const retryBtn = document.getElementById('game3-retryGame-btn');
            const newBtn = document.getElementById('game3-newGame-btn');
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
            /* updateResponsiveLayout replaced */
        },

        // 進入本遊戲時，隱藏主頁卡片列表與其他遊戲（game1、game2）的容器
        hideOtherContents: function () {
            // 隱藏主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隱藏其他遊戲
            const game1 = document.getElementById('game1-container');
            const game2 = document.getElementById('game2-container');
            if (game1) game1.classList.add('hidden');
            if (game2) game2.classList.add('hidden');
        },

        // 離開本遊戲時，恢復顯示主頁卡片列表
        showOtherContents: function () {
            // 恢復主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        // 停止遊戲並關閉遊戲畫面：取消動畫、隱藏容器、還原頁面捲動與其他內容顯示
        stopGame: function () {
            this.isActive = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();
            // 恢復其他內容
            this.showOtherContents();
        },

        // 重來（保留目前題目）：重置分數、速度、錯誤次數、每一行按鈕的位置與狀態，並重新開始動畫迴圈
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem || this.rows.length === 0) return;
            this.isActive = true;
            this.score = 0;
            this.speed = this.baseSpeed + this.difficultySettings[this.difficulty].incrementSpeed;
            this.maxSpeed = this.difficultySettings[this.difficulty].maxSpeed;
            this.currentRowIndex = 0;
            this.mistakeCount = 0;
            this.gameStartTime = Date.now(); // 重試也重設本局計時
            document.getElementById('game3-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            if (this.historyContainer) this.historyContainer.style.display = '';
            this.renderHearts();

            // 重置歷史紀錄狀態
            this.historyData.forEach(item => {
                item.status = 'hidden';
            });
            this.renderHistory();

            // 重置樂曲進度
            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }

            // 重置每一行的狀態與位置
            this.rows.forEach(row => {
                row.clicked = false;
                row.y = row.originalY;
                row.element.style.transform = `translateY(${(row.y) * 20}px)`;
                row.element.classList.remove('completed');
                Array.from(row.element.querySelectorAll('button')).forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('correct', 'wrong', 'missed');
                    btn.style.color = this.difficultySettings[this.difficulty].isStrictOrder ? this.nextRowFontColor : this.currentRowFontColor;
                });
            });

            // 高亮第一行
            if (this.rows.length > 0) {
                Array.from(this.rows[0].element.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }

            // 開始動畫迴圈
            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.loop();
            // 啟用重來按鈕
            document.getElementById('game3-retryGame-btn').disabled = false;
            document.getElementById('game3-newGame-btn').disabled = false;
        },

        // 顯示開場規則說明對話框，等使用者按下「開始挑戰」後才真正啟動動畫迴圈
        showStartMessage: function () {
            this.isActive = false; // 先暫停循環
            if (window.RuleNoteDialog) {
                window.RuleNoteDialog.show({
                    title: '字爬梯',
                    lines: [
                        '請依序點擊(用點的，不要拖曳)',
                        '上升的文字方塊，',
                        '組成優雅的詩句。',
                        '　　',
                        '綠色代表正確，紅色是錯誤。'
                    ],
                    btnText: '開始挑戰',
                    styles: {
                        top: '50%',
                        left: '50%',
                        width: '75%',
                        height: '55%',
                        bg: 'hsla(145, 60%, 25%, 0.8)',
                        titleColor: 'hsl(145, 80%, 70%)',
                        textColor: 'hsl(145, 30%, 90%)',
                        btnBg: 'hsl(145, 70%, 75%)',
                        btnColor: 'hsl(145, 60%, 33%)'
                    },
                    onConfirm: () => {
                        this.isActive = true;
                        if (this.animationId) cancelAnimationFrame(this.animationId);
                        this.loop();
                    }
                });
            } else {
                this.isActive = true;
                this.loop();
            }
        },

        // 開新局（換新題目）：可選傳入 levelIndex 進入指定關卡挑戰模式；
        // 重置所有遊戲狀態、重新挑選詩詞、隨機選擇背景樂譜，最後顯示開場說明
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }

            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            const settings = this.difficultySettings[this.difficulty];
            this.speed = this.baseSpeed + settings.incrementSpeed;
            this.maxSpeed = settings.maxSpeed;
            this.currentRowIndex = 0;
            this.rows = [];
            this.historyData = [];
            this.mistakeCount = 0;
            // 記錄本局開始時間（用於計算 duration_s）
            this.gameStartTime = Date.now();
            document.getElementById('game3-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            if (this.historyContainer) this.historyContainer.style.display = '';
            this.renderHearts();

            this.gameArea.innerHTML = '';
            this.selectAndPreparePoem();

            // 隨機抽選一首樂譜
            if (window.SoundManager && window.SoundManager.melodyPlayer && window.SoundManager.MelodyScores) {
                const melodies = Object.keys(window.SoundManager.MelodyScores);
                const randomMelody = melodies[Math.floor(Math.random() * melodies.length)];
                window.SoundManager.melodyPlayer.setMelody(randomMelody);
            }

            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.showStartMessage();
            // 啟用按鈕
            document.getElementById('game3-retryGame-btn').disabled = false;
            document.getElementById('game3-newGame-btn').disabled = false;
        },

        // 關卡模式下過關後，進入下一關（關卡索引 +1 並重新開局）
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 核心準備函式：依照難度隨機抽選一首詩詞（並依關卡模式決定固定或隨機取材），
        // 將詩句拆解成單字、產生誘餌字選項，並建立每一行往上飄的按鈕列（rows），
        // 同時初始化歷程紀錄（historyData）供左側直排文字顯示使用。
        selectAndPreparePoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) {
                alert('找不到詩詞資料');
                return;
            }

            const setting = this.difficultySettings[this.difficulty];
            // 依難度設定的最低評分等條件，向共用函式取得隨機（或指定關卡對應）的詩詞片段
            const result = getSharedRandomPoem(
                setting.poemMinRating || 4,
                4,
                10,
                20,
                100,
                "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game3'
            );
            if (!result) {
                alert('找不到符合該難度評分的詩詞');
                return;
            }

            const poem = result.poem;
            this.currentPoem = poem;
            const startIdx = result.startIndex;
            const lineCount = result.lines.length;

            // 從同類型的其他詩詞中取材，額外產生更多誘餌字（增加混淆度）
            const similarPoems = POEMS.filter(p => p.type === poem.type && p.id !== poem.id);
            let extraDecoyChars = "";
            if (similarPoems.length > 0) {
                const shuffledSimilar = similarPoems.sort(() => Math.random() - 0.5).slice(0, 3);
                shuffledSimilar.forEach(p => {
                    p.content.forEach(line => {
                        extraDecoyChars += line.replace(/[，。？！、：；「」『』]/g, '');
                    });
                });
            }

            const baseCommonChars = (window.SharedDecoy && window.SharedDecoy.decoyCharsSets) ? window.SharedDecoy.decoyCharsSets.common : "";
            const currentDecoyPool = (baseCommonChars + extraDecoyChars).split('');

            let chars = [];
            let charRatings = [];
            const firstIndices = new Set();
            this.historyData = [];
            // 處理詩詞，將詩詞拆解成字元，並記錄每個字元的位置
            for (let i = 0; i < lineCount; i++) {
                const lineIdx = startIdx + i;
                const line = poem.content[lineIdx];
                const cleanLine = line.replace(/[，。？！、：；「」『』]/g, '');
                if (!cleanLine) continue;

                const currentCharsStart = chars.length;
                firstIndices.add(currentCharsStart);

                const lineRating = (poem.line_ratings && poem.line_ratings[lineIdx] !== undefined)
                    ? poem.line_ratings[lineIdx]
                    : 0;

                const lineChars = cleanLine.split('');
                chars.push(...lineChars);
                lineChars.forEach((c, charIdx) => {
                    charRatings.push(lineRating);
                    this.historyData.push({ char: c, status: 'hidden', isSep: false });
                    if (charIdx === lineChars.length - 1 && i < lineCount - 1) {
                        this.historyData.push({ char: '，', status: 'correct', isSep: true });
                    }
                });
            }
            this.poemChars = chars;
            this.charRatings = charRatings;
            this.historyContainer = document.getElementById('game3-history');
            this.renderHistory();

            const gameAreaHeightRem = this.btnHeightRem * 9; //遊戲介面高度有9個按鍵高，第一個字放在最下緣。
            this.gameAreaHeightRem = gameAreaHeightRem;
            let currentY = gameAreaHeightRem; // 由下往上排列每一行文字的起始高度

            // 逐字建立對應的按鈕列（row），並依序往上疊加 y 座標
            chars.forEach((char, index) => {
                const isNewSentence = firstIndices.has(index);
                //每句第一個字增加間距
                if (isNewSentence && index > 0) {
                    currentY += this.btnHeightRem / 2;
                }

                let numOptions = 1;
                const sentenceRating = charRatings[index];

                if (isNewSentence || sentenceRating < setting.sentenceMinRating) {
                    numOptions = 1;
                } else {
                    const minO = setting.minOptions || 1;
                    const maxO = setting.maxOptions || 1;
                    //每一行的字數
                    numOptions = Math.floor(Math.random() * (maxO - minO + 1)) + minO;
                    //提高每行字數，尤其是該行只有一個字就會有40%機會變成兩個字
                    if (numOptions == 1) {
                        numOptions = Math.random() < 0.4 ? 2 : 1;
                    }
                }

                const row = this.createRow(char, index, numOptions, currentY, currentDecoyPool);
                this.rows.push(row);
                this.gameArea.appendChild(row.element);

                currentY += this.btnHeightRem * 1.25 + this.verticalGapRem;
            });

            if (this.rows.length > 0) {
                Array.from(this.rows[0].element.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }
        },

        // 建立單一行的按鈕列：包含正確字與若干誘餌字選項，隨機排列後綁定點擊事件
        // correctChar: 該行正確答案字；index: 此字在詩詞中的序號；numOptions: 此行要顯示幾個選項按鈕
        // startY: 此行初始的垂直座標（rem）；decoyPool: 可用的誘餌字候選池
        createRow: function (correctChar, index, numOptions, startY, decoyPool) {
            const rowEl = document.createElement('div');
            rowEl.className = 'ladder-row';
            rowEl.style.transform = `translateY(${(startY) * 20}px)`;

            let options = [correctChar];

            // 有 40% 機率優先從「主題相關字集」挑選誘餌字，讓混淆選項更貼近詩詞意境
            if (numOptions > 1 && Math.random() < 0.4) {
                const thematicSets = (window.SharedDecoy && window.SharedDecoy.decoyCharsSets)
                    ? Object.values(window.SharedDecoy.decoyCharsSets)
                    : [];

                const matchedSet = thematicSets.find(set => set && set.includes(correctChar));
                if (matchedSet) {
                    const themeCandidates = matchedSet.split('').filter(c => c !== correctChar);
                    themeCandidates.sort(() => Math.random() - 0.5);
                    for (const char of themeCandidates) {
                        if (options.length >= numOptions) break;
                        if (!options.includes(char)) options.push(char);
                    }
                }
            }

            const baseCommonArr = (window.SharedDecoy && window.SharedDecoy.decoyCharsSets) ? window.SharedDecoy.decoyCharsSets.common.split('') : [];
            const pool = (decoyPool && decoyPool.length > 0) ? decoyPool : baseCommonArr;
            let safetyCounter = 0;
            // 若選項數量仍不足，從通用誘餌字池中隨機補齊；safetyCounter 避免候選字不足時無限迴圈
            while (options.length < numOptions && safetyCounter < 100) {
                safetyCounter++;
                const decoy = pool[Math.floor(Math.random() * pool.length)];
                if (decoy && !options.includes(decoy)) {
                    options.push(decoy);
                }
            }

            options.sort(() => Math.random() - 0.5);

            options.forEach(char => {
                const btn = document.createElement('button');
                btn.className = 'ladder-btn';
                btn.textContent = char;
                const setting = this.difficultySettings[this.difficulty] || {};
                const initialColor = setting.isStrictOrder ? this.nextRowFontColor : this.currentRowFontColor;
                btn.style.color = initialColor;
                //btn.addEventListener('click', (e) => this.handleBtnClick(e, char, index, rowEl));
                // 修改處：將 'click' 改為 'pointerdown' 碰觸即觸發，不必等到手指離開畫面。
                btn.addEventListener('pointerdown', (e) => {
                    // 防止觸控裝置同時觸發虛擬 click 事件或頁面縮放
                    if (e.pointerType === 'touch') e.preventDefault();
                    this.handleBtnClick(e, char, index, rowEl);
                });
                rowEl.appendChild(btn);
            });

            return {
                element: rowEl,
                y: startY,
                originalY: startY,
                index: index,
                clicked: false,
                correctChar: correctChar
            };
        },

        // 處理玩家點擊某個字按鈕：判斷是否為正確答案，更新分數、心數、歷程紀錄，
        // 並在答對時加速遊戲、在答錯次數超過上限時觸發遊戲結束
        handleBtnClick: function (e, char, rowIndex, rowEl) {
            if (!this.isActive) return; // 遊戲未進行中則忽略點擊

            const setting = this.difficultySettings[this.difficulty];
            const clickedRow = this.rows[rowIndex];

            if (clickedRow.clicked) return; // 此行已完成，不再處理
            if (setting.isStrictOrder && rowIndex !== this.currentRowIndex) {
                return; // 嚴格順序模式下，只允許點擊當前行
            }

            // 答對：加分、播放音效／樂音、標記正確、鎖住該行按鈕並提升遊戲速度
            if (char === clickedRow.correctChar) {
                if (window.SoundManager && window.SoundManager.melodyPlayer) {
                    window.SoundManager.melodyPlayer.playNextNote();
                } else if (window.SoundManager) {
                    window.SoundManager.playSuccessShort();
                }
                e.target.classList.add('correct');
                // 擊中文字，根據window.ScoreManager.gameSettings['game3'].getPointA加分
                this.score += window.ScoreManager.gameSettings['game3'].getPointA;
                document.getElementById('game3-score').textContent = this.score;

                this.updateHistoryStatus(rowIndex, 'correct');
                clickedRow.clicked = true;
                rowEl.classList.add('completed');
                Array.from(rowEl.querySelectorAll('button')).forEach(b => b.disabled = true);

                if (this.speed < this.maxSpeed) this.speed += this.incrementSpeed;

                if (rowIndex === this.currentRowIndex) {
                    this.updateCurrentRowHighlight();
                }
            } else {
                // 答錯：播放失敗音效、標記錯誤、增加失誤次數並更新愛心顯示
                if (window.SoundManager) window.SoundManager.playFailure();
                e.target.classList.add('wrong');
                e.target.disabled = true;
                this.mistakeCount += 1;
                this.updateHearts();

                if (this.mistakeCount >= setting.maxMistakeCount) {
                    this.gameOver(false, `失誤 ${this.mistakeCount} 次`);
                    return;
                }

                // 若該行只剩最後一個按鈕未按（其餘皆已停用），代表正確答案已被找出，自動標示為 missed 並結束該行
                const remainingBtns = Array.from(rowEl.querySelectorAll('button')).filter(btn => !btn.disabled);
                if (remainingBtns.length === 1) {
                    clickedRow.clicked = true;
                    rowEl.classList.add('completed');
                    const correctBtn = remainingBtns[0];
                    correctBtn.disabled = true;
                    correctBtn.classList.add('missed');
                    this.updateHistoryStatus(rowIndex, 'wrong');

                    if (rowIndex === this.currentRowIndex) {
                        this.updateCurrentRowHighlight();
                    }
                } else {
                    this.updateHistoryStatus(rowIndex, 'wrong_attempt');
                }
            }
        },

        // 將目前應該高亮（可點擊）的行索引前進到下一個尚未完成的行；
        // 若所有行皆已完成，代表玩家過關，觸發勝利動畫與結算流程
        updateCurrentRowHighlight: function () {
            while (this.currentRowIndex < this.rows.length && this.rows[this.currentRowIndex].clicked) {
                this.currentRowIndex++;
            }

            if (this.currentRowIndex >= this.rows.length) {
                this.isActive = false;
                document.getElementById('game3-retryGame-btn').disabled = true;
                document.getElementById('game3-newGame-btn').disabled = true;
                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game3',
                    timerContainerId: null,
                    scoreElementId: 'game3-score',
                    heartsSelector: '#game3-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                        this.gameOver(true, '');
                    }
                });
            } else {
                const nextRowEl = this.rows[this.currentRowIndex].element;
                Array.from(nextRowEl.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }
        },

        // 主要動畫迴圈（每一影格執行一次，透過 requestAnimationFrame 驅動）：
        // 1. 若當前行已完成則前進索引；若全部完成則觸發勝利流程
        // 2. 讓所有行按照目前速度往上移動
        // 3. 偵測當前行是否飄出畫面上緣而錯過（自動判定為錯誤）
        // 4. 更新歷程紀錄與畫面顯示，並排程下一影格
        loop: function () {
            if (!this.isActive) return;

            while (this.currentRowIndex < this.rows.length && this.rows[this.currentRowIndex].clicked) {
                this.currentRowIndex++;
                if (this.currentRowIndex >= this.rows.length) {
                    this.isActive = false;
                    document.getElementById('game3-retryGame-btn').disabled = true;
                    document.getElementById('game3-newGame-btn').disabled = true;
                    ScoreManager.playWinAnimation({
                        game: this,
                        difficulty: this.difficulty,
                        gameKey: 'game3',
                        timerContainerId: null,
                        scoreElementId: 'game3-score',
                        heartsSelector: '#game3-hearts .heart:not(.empty)',
                        onComplete: (finalScore) => {
                            this.score = finalScore;
                            // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                            this.gameOver(true, '');
                        }
                    });
                    return;
                }
                const nextRow = this.rows[this.currentRowIndex];
                Array.from(nextRow.element.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }

            const currentSetting = this.difficultySettings[this.difficulty];

            // 逐行更新位置：往上移動 speed 的距離
            this.rows.forEach(row => {
                row.y -= this.speed;
                row.element.style.transform = `translateY(${(row.y) * 20}px)`;

                // 若當前行已飄過判定線（y 小於負的按鈕高度的四分之一）且尚未作答，視為錯過（自動判錯）
                if (!row.clicked && row.index === this.currentRowIndex && row.y < -this.btnHeightRem / 4) {
                    row.clicked = true;
                    row.element.classList.add('completed');
                    Array.from(row.element.querySelectorAll('button')).forEach(btn => {
                        btn.disabled = true;
                        if (btn.textContent === row.correctChar) {
                            btn.classList.add('missed');
                        } else {
                            btn.classList.add('wrong');
                        }
                    });

                    this.mistakeCount += 1;
                    this.updateHearts();

                    if (this.mistakeCount >= currentSetting.maxMistakeCount) {
                        this.gameOver(false, `失誤達 ${this.mistakeCount} 次`);
                    } else {
                        this.updateCurrentRowHighlight();
                    }
                    this.updateHistoryStatus(row.index, 'wrong');
                }

                // 該行進入可視範圍內、尚未作答時，於左側歷程顯示區標示為「等待中」
                const visibleThreshold = this.gameAreaHeightRem || 30;
                if (row.y < visibleThreshold && !row.clicked) {
                    this.updateHistoryStatus(row.index, 'waiting');
                }
            });

            this.renderHistory();
            this.animationId = requestAnimationFrame(() => this.loop());
        },

        // 依詩詞字元索引（跳過分隔符號 isSep）更新歷程紀錄中對應字元的狀態
        // status 可能為 'waiting'（等待中）、'wrong_attempt'（選錯過但未定案）、'correct'（答對）、'wrong'（答錯或錯過）
        updateHistoryStatus: function (charIndex, status) {
            let realIdx = 0;
            for (let i = 0; i < this.historyData.length; i++) {
                if (!this.historyData[i].isSep) {
                    if (realIdx === charIndex) {
                        const currentStatus = this.historyData[i].status;
                        // 已經是最終結果（答對/答錯）就不再覆寫
                        if (currentStatus === 'correct' || currentStatus === 'wrong') return;
                        // 已標記選錯過的字，不會被「等待中」狀態覆蓋回去
                        if (currentStatus === 'wrong_attempt' && status === 'waiting') return;
                        this.historyData[i].status = status;
                        return;
                    }
                    realIdx++;
                }
            }
        },

        // 依 historyData 目前狀態，重新產生左側直排歷程顯示區的 HTML（只有內容變動時才更新 DOM，避免不必要的重繪）
        renderHistory: function () {
            if (!this.historyContainer) return;

            let html = '';
            this.historyData.forEach((item, index) => {
                let shouldShow = item.status !== 'hidden';
                if (item.isSep && index > 0) {
                    const prev = this.historyData[index - 1];
                    if (prev.status !== 'hidden') {
                        shouldShow = true;
                    }
                }

                if (!shouldShow) return;

                if (item.isSep) {
                    html += `<span class="history-separator">${item.char}</span>`;
                } else {
                    let className = 'history-char';
                    let displayChar = item.char;

                    if (item.status === 'waiting') {
                        className += ' waiting';
                        displayChar = '□';
                    } else if (item.status === 'wrong_attempt') {
                        className += ' wrong-attempt';
                        displayChar = '□';
                    } else if (item.status === 'correct') {
                        className += ' correct';
                    } else if (item.status === 'wrong') {
                        className += ' wrong';
                    }
                    html += `<span class="${className}">${displayChar}</span>`;
                }
            });

            if (this.historyContainer.innerHTML !== html) {
                this.historyContainer.innerHTML = html;
            }
        },

        // 依目前難度的最大可失誤次數，重新產生愛心圖示列
        renderHearts: function () {
            const hearts = document.getElementById('game3-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            const settings = this.difficultySettings[this.difficulty];
            for (let i = 0; i < settings.maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        // 依目前的失誤次數（mistakeCount），將對應數量的愛心圖示切換為「空心」狀態
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game3-hearts .heart');
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

        // 遊戲結束處理（勝利或失敗皆會呼叫）：
        // 停止動畫、記錄失敗時的遊戲紀錄（勝利紀錄由 ScoreManager 負責）、
        // 標示所有未完成行的正確答案、組出結算用的詩句 HTML，最後顯示結算對話框
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
                    gameNo: 3,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            if (this.animationId) cancelAnimationFrame(this.animationId);

            this.rows.forEach(row => {
                if (!row.clicked) {
                    Array.from(row.element.querySelectorAll('button')).forEach(btn => {
                        btn.disabled = true;
                        if (btn.textContent === row.correctChar) {
                            btn.classList.add('missed');
                        }
                    });
                }
            });

            if (win) {
                document.getElementById('game3-retryGame-btn').disabled = true;
                document.getElementById('game3-newGame-btn').disabled = true;
            } else {
                document.getElementById('game3-retryGame-btn').disabled = false;
                document.getElementById('game3-newGame-btn').disabled = false;
            }

            let resultHtml = '';
            if (this.currentPoem) {
                resultHtml = `
                    <div class="game3-result-poem-info" style="text-align: center; margin-bottom: 4px;">
                        <h3 style="margin: 0; color: #333; font-size: 24px; cursor: pointer; text-decoration: underline;"
                            onclick="if(window.openPoemDialogById) window.openPoemDialogById('${this.currentPoem.id}')">
                            ${this.currentPoem.title}
                        </h3>
                        <p style="margin: 2px 0; color: #666; font-size: 20px;">${this.currentPoem.dynasty} · ${this.currentPoem.author}</p>
                    </div>
                    <div class="game3-result-content" style="background: rgba(255,255,255,0.5); padding: 10px; border-radius: 10px;">
                `;

                let currentLine = '';
                this.historyData.forEach(item => {
                    if (item.isSep) {
                        resultHtml += `<div style="margin-bottom: 6px;">${currentLine}${item.char}</div>`;
                        currentLine = '';
                    } else if (item.status !== 'hidden') {
                        let color = '#333';
                        if (item.status === 'correct') color = 'hsl(145, 68%, 30%)';
                        else if (item.status === 'wrong' || item.status === 'wrong_attempt') color = 'hsl(0, 68%, 36%)';
                        else if (item.status === 'waiting') color = 'hsl(210, 80%, 45%)';

                        currentLine += `<span style="color: ${color}; font-weight: bold;">${item.char}</span>`;
                    }
                });
                if (currentLine) resultHtml += `<div>${currentLine}</div>`;
                resultHtml += `</div>`;
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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "挑戰結束"),
                        //無論勝負都要顯示對與錯的詩句
                        //customContent: win ? resultHtml : "",
                        customContent: resultHtml,
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game3', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game3', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        },

        // 依文字長度自動縮小字體：超過門檻字數時，字體會依比例縮小，避免文字溢出容器
        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${(newSize) * 20}px`;
            } else {
                element.style.fontSize = `${(baseFontSizeRem) * 20}px`;
            }
        }
    };

    window.Game3 = Game3;

    if (new URLSearchParams(window.location.search).get('game') === '3') {
        setTimeout(() => {
            if (window.Game3) window.Game3.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
