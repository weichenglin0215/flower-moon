(function () {
    const Game4 = {
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
        hiddenPositions: [], // [{line: 1|2, charIdx, char}]
        currentInputIndex: 0,
        timeLimit: 60,
        timeLeft: 60,
        timerInterval: null,
        showTimeout: null, // 用於延遲顯示完整句子的計時器

        isRevealed: false,
        cluesRevealed: false, // 題目提示句是否已過延遲時間而顯示
        container: null,
        game4Area: null,
        userInputs: [],
        evaluationResult: null,
        gameStartTime: null, // 本局開始時的時間戳（Date.now()），用於計算 duration_s
        //timeLimitRate: 每遮罩字時間倍率（秒），實際時限 = 實際遮罩字數 × timeLimitRate
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount: 最大錯誤次數
        //answerAtLine: 答案出現在第幾行，0=第一行或第二行，1=第一行，2=第二行，3=第一行和第二行
        //maxMaskCount: 最多遮罩數量
        //maxAddDecoyChars: 最多干擾字數量
        //showDelay: 顯示延遲時間
        //singleCharReaction: 單字反應對錯，true=單字反應對錯，false=整句反應對錯
        difficultySettings: {
            '小學': { timeLimitRate: 6, poemMinRating: 6, maxMistakeCount: 4, answerAtLine: 2, maxMaskCount: 3, maxAddDecoyChars: 6, showDelay: 0, singleCharReaction: true },
            '中學': { timeLimitRate: 5, poemMinRating: 5, maxMistakeCount: 5, answerAtLine: 2, maxMaskCount: 5, maxAddDecoyChars: 8, showDelay: 4, singleCharReaction: true },
            '高中': { timeLimitRate: 4, poemMinRating: 4, maxMistakeCount: 6, answerAtLine: 0, maxMaskCount: 6, maxAddDecoyChars: 12, showDelay: 8, singleCharReaction: false },
            '大學': { timeLimitRate: 3, poemMinRating: 3, maxMistakeCount: 7, answerAtLine: 1, maxMaskCount: 6, maxAddDecoyChars: 15, showDelay: 12, singleCharReaction: false },
            '研究所': { timeLimitRate: 2, poemMinRating: 3, maxMistakeCount: 8, answerAtLine: 3, maxMaskCount: 6, maxAddDecoyChars: 20, showDelay: 200, singleCharReaction: false }
        },

        // 常用字庫已移至 script.js 的 window.SharedDecoy 中

        // 動態載入本遊戲專屬的 CSS 檔（game4.css），避免重複插入 <link>
        loadCSS: function () {
            if (!document.getElementById('game4-css')) {
                const link = document.createElement('link');
                link.id = 'game4-css';
                link.rel = 'stylesheet';
                link.href = 'game4.css';
                document.head.appendChild(link);
            }
        },

        // 遊戲初始化：載入樣式表、建立（若尚未建立）遊戲畫面 DOM，並綁定難度標籤點擊事件
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game4-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game4-container');
            this.game4Area = document.getElementById('game4-area');
            document.getElementById('game4-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立整個遊戲畫面的 DOM 結構（頂列分數/控制鈕、副標紅心與詩詞出處、
        // 題目展示區、答案矩陣與計時圈），並綁定「重來」「開新局」按鈕事件
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game4-container';
            // game4-overlay 保留為本遊戲私有 hook；fm-overlay 承載共用外觀（詳見 theme_xuanzhi.css）
            div.className = 'game4-overlay fm-overlay hidden';
            div.innerHTML = `
                <!-- 除錯用邊框（開發階段用來檢視版面配置範圍，正式版不啟用） -->
                <!-- <div class="debug-frame"></div> -->
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game4-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game4-diff-tag" data-level="小學">小學</button>
                        <button id="game4-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game4-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game4-hearts" class="fm-hearts"></div>
                    <div id="game4-info" class="fm-poem-info"></div>
                </div>
                <div id="game4-area" class="game4-area">
                    <div id="game4-question" class="game4-question-area">
                        <div id="game4-line1" class="game4-poem-lines"></div>
                        <div id="game4-line2" class="game4-poem-lines"></div>
                        <!-- 詩名/朝代/作者：已移至 fm-sub-header 右側，見上方 -->
                    </div>
                    <!-- 答案區域 (含邊框倒數) — 三層同心圓結構（同 game1）：
                         ① 最外圈：紅色 SVG timer stroke（10px）
                         ② 中間圈：3px 邊框 + 徑向漸層底色 + border-radius 20px
                         ③ 內圈：答案卡（20px padding） -->
                    <div class="game4-answer-section">
                        <div id="game4-grid-container" class="game4-grid-container">
                            <svg id="game4-timer-ring" class="fm-timer-ring">
                                <rect id="game4-timer-path" class="fm-timer-path" x="5" y="5"></rect>
                            </svg>
                            <div class="game4-grid-inner-ring">
                                <div class="game4-answer-grid" id="game4-grid"></div>
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
            document.getElementById('game4-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game4-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };

            this.renderHearts();
        },

        // 對外進入點：初始化遊戲並顯示難度選擇畫面
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度選擇器，玩家選定難度／關卡後才正式開新局
        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            this.maskOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('眾裡尋他千百度', (selectedLevel, levelIndex) => {
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
            } else {
                console.warn('[Game4] DifficultySelector not found');
            }
        },

        // 依目前模式（一般難度模式 / 關卡挑戰模式）更新頂列的難度標籤文字與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game4-diff-tag');
            const retryBtn = document.getElementById('game4-retryGame-btn');
            const newBtn = document.getElementById('game4-newGame-btn');
            // 難度標籤色彩改由 CSS 依 data-level 套色（見 theme_xuanzhi.css 的 .fm-difficulty-tag[data-level=...]）
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

        // 進入本遊戲時，隱藏首頁卡片區與其他遊戲的容器，避免畫面重疊
        maskOtherContents: function () {
            ['cardContainer', 'game1-container', 'game2-container', 'game3-container'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        // 離開本遊戲時，恢復顯示首頁卡片容器
        showOtherContents: function () {
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // 停止遊戲：清除計時器、隱藏遊戲容器並恢復頁面捲動與其他內容顯示
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        // 重玩同一題：沿用目前的 this.currentPoem 與已生成的答案矩陣（gridChars），
        // 但重設分數、錯誤次數、玩家輸入與計時器
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.userInputs = [];
            this.evaluationResult = null;
            document.getElementById('game4-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            // 實際時限 = 實際遮罩字數 × timeLimitRate
            const calcTimeLimit4r = this.hiddenPositions.length * settings.timeLimitRate;
            this.timeLeft = calcTimeLimit4r;
            this.timeLimit = calcTimeLimit4r;

            // 重試也重設本局計時
            this.gameStartTime = Date.now();
            this.renderQuestion();
            this.renderGrid(true); // 使用舊有的 gridChars
            this.startTimer();

            // 處理完整句子的延遲顯示
            this.cluesRevealed = settings.showDelay === 0;
            if (this.showTimeout) clearTimeout(this.showTimeout);
            if (settings.showDelay > 0) {
                this.showTimeout = setTimeout(() => {
                    this.cluesRevealed = true;
                    const hiddenLines = document.querySelectorAll('.game4-poem-lines.game4-hidden-line');
                    hiddenLines.forEach(line => line.classList.add('revealed'));
                }, settings.showDelay * 1000);
            }
            // 啟用重來按鈕
            document.getElementById('game4-retryGame-btn').disabled = false;
            document.getElementById('game4-newGame-btn').disabled = false;
        },

        // 開新局：重新隨機選一首詩詞（selectRandomPoem）、重新產生答案矩陣（renderGrid(false)），
        // 並依難度設定重設計時、生命值與延遲顯示提示句等狀態。levelIndex 有帶入時代表進入指定關卡
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }

            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.userInputs = [];
            this.evaluationResult = null;
            document.getElementById('game4-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];

            // 記錄本局開始時間（用於計算 duration_s）
            this.gameStartTime = Date.now();
            if (this.selectRandomPoem()) {
                this.renderQuestion();
                this.renderGrid(false); // 生成新的 gridChars
                // 實際時限 = 實際遮罩字數 × timeLimitRate
                const calcTimeLimit4 = this.hiddenPositions.length * settings.timeLimitRate;
                this.timeLeft = calcTimeLimit4;
                this.timeLimit = calcTimeLimit4;
                this.startTimer();

                this.cluesRevealed = settings.showDelay === 0;
                if (this.showTimeout) clearTimeout(this.showTimeout);
                if (settings.showDelay > 0) {
                    this.showTimeout = setTimeout(() => {
                        this.cluesRevealed = true;
                        const hiddenLines = document.querySelectorAll('.game4-poem-lines.game4-hidden-line');
                        hiddenLines.forEach(line => line.classList.add('revealed'));
                    }, settings.showDelay * 1000);
                }
            } else {
                alert('載入詩詞失敗。');
                this.showDifficultySelector();
            }
            // 啟用按鈕
            document.getElementById('game4-retryGame-btn').disabled = false;
            document.getElementById('game4-newGame-btn').disabled = false;

            //如果是研究所難度，開局時隱藏poem-info，避免玩家作弊
            if (this.difficulty === '研究所' || this.difficulty === '大學') {
                document.getElementById('game4-info').style.display = 'none';
            }
            else {
                document.getElementById('game4-info').style.display = '';
            }
        },

        // 關卡模式過關後，關卡編號 +1 並開始下一關
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 依難度設定的最低評分（poemMinRating）隨機挑選一首至少有兩句的詩詞，
        // 並依 answerAtLine 設定決定要在第一行／第二行／兩行都挖空，
        // 再從該行中隨機挑選最多 maxMaskCount 個字設為隱藏字（this.hiddenPositions）
        selectRandomPoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;
            const settings = this.difficultySettings[this.difficulty];
            const minR = settings.poemMinRating || 4;

            // 使用共用邏輯取得隨機詩詞 (要求至少 2 句)，傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                2, 2, 8, 30, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game4'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            const content = result.poem.content;
            const startIdx = result.startIndex;
            this.line1 = content[startIdx];
            this.line2 = content[startIdx + 1] || "";

            // 決定隱藏那些字
            this.hiddenPositions = [];

            // 內部輔助函式：將一行詩句去除標點符號後，
            // 回傳可挖空的候選字元清單（含每個字在原字串中的位置 originalIdx）
            const processLine = (line, lineNum) => {
                // 過濾標點符號建立純字索引對應
                const cleanChars = [];
                for (let i = 0; i < line.length; i++) {
                    if (!/[，。？！、：；「」『』]/.test(line[i])) {
                        cleanChars.push({ char: line[i], originalIdx: i });
                    }
                }
                return cleanChars;
            };

            const chars1 = processLine(this.line1, 1);
            const chars2 = processLine(this.line2, 2);

            let linesToMask = [];
            if (settings.answerAtLine === 1) {
                linesToMask = [1];
            } else if (settings.answerAtLine === 2) {
                linesToMask = [2];
            } else if (settings.answerAtLine === 3) {
                linesToMask = [1, 2];
            } else {
                // answerAtLine === 0: 隨機選第一行或第二行
                linesToMask = [Math.random() < 0.5 ? 1 : 2];
            }

            linesToMask.forEach(lineNum => {
                const lineChars = lineNum === 1 ? chars1 : chars2;
                // 洗牌選取要隱藏的字
                const shuffled = [...lineChars].sort(() => Math.random() - 0.5);
                const numToMask = Math.min(lineChars.length, settings.maxMaskCount);
                const picked = shuffled.slice(0, numToMask).map(c => ({ ...c, line: lineNum }));
                this.hiddenPositions.push(...picked);
            });

            // 按順序排序
            this.hiddenPositions.sort((a, b) => (a.line === b.line) ? (a.originalIdx - b.originalIdx) : (a.line - b.line));

            return true;
        },

        // 依目前的隱藏字狀態（this.hiddenPositions）與玩家已輸入結果，
        // 重新繪製題目兩行詩句（挖空字以「◎」或彩色字呈現對錯狀態），並更新詩詞出處資訊
        renderQuestion: function () {
            const l1 = document.getElementById('game4-line1');
            const l2 = document.getElementById('game4-line2');
            const info = document.getElementById('game4-info');
            const settings = this.difficultySettings[this.difficulty];

            // 內部輔助函式：組出單一行詩句的 HTML，將挖空字依作答狀態
            // （尚未作答／輸入中／答對／答錯／位置錯）套上對應樣式的 <span>
            const renderText = (lineText, lineNum) => {
                let html = "";
                // 找出該行被隱藏的索引
                const lineHiddens = this.hiddenPositions.filter(p => p.line === lineNum);

                // 如果該行完全沒有隱藏字(題目句)，則增加 game4-hidden-line class
                const isFullLine = lineHiddens.length === 0;
                const lineEl = lineNum === 1 ? l1 : l2;
                lineEl.className = 'game4-poem-lines';
                if (isFullLine && settings.showDelay > 0 && !this.isRevealed) {
                    if (!this.cluesRevealed) {
                        lineEl.classList.add('game4-hidden-line');
                    } else {
                        lineEl.classList.add('game4-hidden-line', 'revealed');
                    }
                }

                let cleanIdx = 0;
                for (let i = 0; i < lineText.length; i++) {
                    const char = lineText[i];
                    if (/[，。？！、：；「」『』]/.test(char)) {
                        html += char;
                    } else {
                        const hInfo = lineHiddens.find(h => h.originalIdx === i);
                        if (hInfo) {
                            const posIdx = this.hiddenPositions.indexOf(hInfo);
                            if (!settings.singleCharReaction) {
                                if (posIdx < this.userInputs.length) {
                                    const inputChar = this.userInputs[posIdx].char;
                                    if (this.evaluationResult) {
                                        const res = this.evaluationResult[posIdx];
                                        if (res === 'correct') {
                                            html += `<span class="correct-char">${inputChar}</span>`;
                                        } else if (res === 'wrong-pos') {
                                            html += `<span class="char-wrong-pos">${inputChar}</span>`;
                                        } else {
                                            html += `<span class="char-wrong">${inputChar}</span>`;
                                        }
                                    } else {
                                        html += `<span class="char-typing">${inputChar}</span>`;
                                    }
                                } else if (this.isRevealed) {
                                    html += `<span class="hidden-char">${char}</span>`;
                                } else {
                                    html += `<span class="hidden-char">◎</span>`;
                                }
                            } else {
                                if (posIdx < this.currentInputIndex) {
                                    html += `<span class="correct-char">${char}</span>`;
                                } else if (this.isRevealed) {
                                    html += `<span class="hidden-char">${char}</span>`;
                                } else {
                                    html += `<span class="hidden-char">◎</span>`;
                                }
                            }
                        } else {
                            html += char;
                        }
                        cleanIdx++;
                    }
                }
                return html;
            };

            l1.innerHTML = renderText(this.line1, 1);
            l2.innerHTML = renderText(this.line2, 2);

            // 自動調整字體大小 (參考 Game 2)
            this.adjustFontSize(l1, this.calculateRawLength(this.line1), 7, 2.5);
            this.adjustFontSize(l2, this.calculateRawLength(this.line2), 7, 2.5);

            //info.innerHTML = `<span style="cursor: pointer; text-decoration: underline; opacity: 0.8;">${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}</span>`;
            // 詩詞名稱最多顯示 8 字（避免在 fm-sub-header 右側與左邊紅心重疊）；連結樣式由 .fm-poem-info 提供
            const _title4 = this.currentPoem.title.length > 8
                ? this.currentPoem.title.slice(0, 8) + "…"
                : this.currentPoem.title;
            info.textContent = `${_title4} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;

            info.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
        },

        // 產生／重繪答案矩陣按鈕：依難度決定格數與欄數（gridConfigs），
        // 首次進場（isRetry=false）時會把「正確答案字」與「干擾字」混合洗牌後放入矩陣，
        // 重來時（isRetry=true）則沿用上一次已產生好的矩陣（this.currentGridChars）
        renderGrid: function (isRetry = false) {
            const container = document.getElementById('game4-grid');
            const gridConfigs = {
                '小學': { total: 9, cols: 3 },
                '中學': { total: 16, cols: 4 },
                '高中': { total: 25, cols: 5 },
                '大學': { total: 42, cols: 6 },
                '研究所': { total: 49, cols: 7 }
            };
            const config = gridConfigs[this.difficulty] || gridConfigs['小學'];

            let allChars;
            if (isRetry && this.currentGridChars) {
                allChars = this.currentGridChars;
            } else {
                const answerChars = this.hiddenPositions.map(p => p.char);
                const targetTotal = config.total;

                // 干擾字生成 (使用共用邏輯)
                const neededDecoys = Math.max(0, targetTotal - answerChars.length);
                let decoys = [];
                if (window.SharedDecoy) {
                    // 使用預設的 poemMinRating 4 來確保混淆句來自高知名度詩詞
                    decoys = window.SharedDecoy.getDecoyChars(answerChars, neededDecoys, [], 4);
                }

                allChars = [...answerChars, ...decoys].sort(() => Math.random() - 0.5);
                this.currentGridChars = allChars;
            }

            // 使用固定的列數
            container.style.gridTemplateColumns = `repeat(${config.cols}, 1fr)`;
            container.innerHTML = '';

            const N = allChars.length;
            allChars.forEach((char, i) => {
                const btn = document.createElement('button');
                btn.className = 'game4-ans-btn';
                // ⚠️ 出場動畫：所有卡片啟動時機壓進 0~0.5 秒之間，每片動畫本身 0.5s，
                //   中心點整體 XY 放大（scale 0→1）
                btn.classList.add('game4-ans-appear');
                const delay = (N > 1) ? (i / (N - 1)) * 0.5 : 0;
                btn.style.animationDelay = delay.toFixed(3) + 's';
                //難度是"大學"或"研究所"設定按鍵的尺寸與間距
                if (this.difficulty === '研究所') {
                    btn.style.width = '56px';
                    btn.style.height = '60px';
                    btn.style.margin = '4px';
                }
                else if (this.difficulty === '大學') {
                    btn.style.width = '60px';
                    btn.style.height = '60px';
                    btn.style.margin = '4px';
                }
                btn.textContent = char;
                btn.onclick = (e) => {
                    if (window.SoundManager) {
                        const settings = this.difficultySettings[this.difficulty];
                        if (settings.singleCharReaction) {
                            const target = this.hiddenPositions[this.currentInputIndex];
                            if (char === target.char) window.SoundManager.playSuccess();
                            else window.SoundManager.playFailure();
                        } else {
                            if (window.SoundManager.playOpenItem) window.SoundManager.playOpenItem();
                        }
                    }
                    this.handleInput(char, e.target);
                };
                container.appendChild(btn);
            });

            document.getElementById('game4-retryGame-btn').disabled = false;
            document.getElementById('game4-newGame-btn').disabled = false;
            this.updateTimerRing(1);
        },

        // 處理玩家點擊答案矩陣中某個字。
        // settings.singleCharReaction 為 true 時採「單字即時判斷對錯」模式（小學/中學難度）；
        // 為 false 時採「整句一次性判斷」模式（高中以上難度），需集滿所有輸入才一起比對評分
        handleInput: function (char, btn) {
            if (!this.isActive) return;
            if (btn.classList.contains('disabled')) return;

            const settings = this.difficultySettings[this.difficulty];

            if (!settings.singleCharReaction) { //須整句答對，非單字答對
                this.userInputs.push({ char, btn });
                btn.classList.add('disabled');
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.userInputs.length === this.hiddenPositions.length) {
                    let isAllCorrect = true;
                    this.evaluationResult = this.userInputs.map((input, idx) => {
                        const target = this.hiddenPositions[idx].char;
                        if (input.char === target) {
                            return 'correct';
                        } else {
                            isAllCorrect = false;
                            const allHiddenChars = this.hiddenPositions.map(h => h.char);
                            if (allHiddenChars.includes(input.char)) {
                                return 'wrong-pos';
                            }
                            return 'wrong';
                        }
                    });

                    this.renderQuestion();

                    if (isAllCorrect) {
                        // 擊中文字，根據window.ScoreManager.gameSettings['game4'].getPointA加分
                        // 高中難度分數再乘以2倍，大學難度分數再乘以3倍，研究所難度分數再乘以4倍
                        let multiplier = 1;
                        if (this.difficulty === '高中') multiplier = 2;
                        else if (this.difficulty === '大學') multiplier = 3;
                        else if (this.difficulty === '研究所') multiplier = 4;
                        this.score += window.ScoreManager.gameSettings['game4'].getPointA * this.userInputs.length * multiplier;
                        document.getElementById('game4-score').textContent = this.score;
                        if (window.SoundManager) window.SoundManager.playSuccess();
                        this.gameOver(true, '');
                    } else {
                        if (window.SoundManager) window.SoundManager.playFailure();
                        this.mistakeCount++;
                        this.updateHearts();

                        this.isActive = false;

                        if (this.mistakeCount >= settings.maxMistakeCount) {
                            setTimeout(() => {
                                this.gameOver(false, `失誤次數過多`);
                            }, 1000);
                        } else {
                            setTimeout(() => {
                                this.userInputs.forEach(input => {
                                    input.btn.classList.remove('disabled');
                                });
                                this.userInputs = [];
                                this.evaluationResult = null;
                                this.currentInputIndex = 0;
                                this.isActive = true;
                                this.renderQuestion();
                            }, 2500);
                        }
                    }
                }
                return;
            }

            const target = this.hiddenPositions[this.currentInputIndex];
            if (char === target.char) {
                btn.classList.add('correct', 'disabled');
                // 擊中文字，根據window.ScoreManager.gameSettings['game4'].getPointA加分
                this.score += window.ScoreManager.gameSettings['game4'].getPointA;
                document.getElementById('game4-score').textContent = this.score;
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.currentInputIndex === this.hiddenPositions.length) {
                    this.gameOver(true, '');
                }
            } else {
                this.mistakeCount++;
                this.updateHearts();

                const isEasyMode = (this.difficulty === '小學' || this.difficulty === '中學');
                // Check if the character is in the list of hidden characters (part of the answer)
                const isSolutionChar = this.hiddenPositions.some(h => h.char === char);
                //中小學難度，按錯不移除，大學難度，按錯移除
                if (isEasyMode && !isSolutionChar) {
                    // For easy modes, if it's a decoy (not in answer), keep it red and disabled
                    btn.classList.add('wrong', 'disabled');
                } else {
                    // Normal behavior: flash red and recover
                    btn.classList.add('wrong');
                    setTimeout(() => btn.classList.remove('wrong'), 400);
                }

                if (this.mistakeCount >= this.difficultySettings[this.difficulty].maxMistakeCount) {
                    this.gameOver(false, `失誤次數過多`);
                }
            }
        },

        // 啟動倒數計時：每 100ms 更新一次計時圈（updateTimerRing），
        // 時間耗盡（ratio <= 0）時觸發遊戲失敗（gameOver(false, "時間到！")）
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.timeLimit * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, "時間到！");
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
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

        // 更新計時圈（SVG 矩形描邊）的長度與顏色。
        // ratio: 剩餘時間比例（0~1）；mode='win' 時為過關後的「剩餘時間換算成分數」動畫，
        // 顏色由暗紅漸變為金黃；一般計時模式下則由淺紅漸變為深紅表示時間流逝
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game4-timer-path');
            const container = document.getElementById('game4-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game4-timer-ring');
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

        // 依目前難度的最大錯誤次數（maxMistakeCount）產生對應數量的紅心圖示
        renderHearts: function () {
            const container = document.getElementById('game4-hearts');
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

        // 依目前已發生的錯誤次數（this.mistakeCount），將對應數量的紅心圖示改為空心
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game4-hearts .fm-heart');
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

        // 遊戲結束處理（過關或失敗皆會呼叫）：
        // 失敗時記錄本局遊玩紀錄（SupabaseClient.logGame），過關時播放得分動畫（ScoreManager.playWinAnimation）
        // 並視情況檢查成就（關卡模式），最後統一透過 GameMessage 顯示結算訊息與下一步按鈕
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
                    gameNo: 4,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);
            if (this.showTimeout) clearTimeout(this.showTimeout);

            if (win) {
                document.getElementById('game4-retryGame-btn').disabled = true;
                document.getElementById('game4-newGame-btn').disabled = true;
                this.isRevealed = true;
                this.cluesRevealed = true;
            } else {
                document.getElementById('game4-retryGame-btn').disabled = false;
                document.getElementById('game4-newGame-btn').disabled = false;
            }
            this.renderQuestion();

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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "挑戰結束"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game4', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game4', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game4',
                    timerContainerId: 'game4-grid-container',
                    scoreElementId: 'game4-score',
                    heartsSelector: '#game4-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        checkAchievementsAndShow(finalScore);
                    }
                });
            } else {
                checkAchievementsAndShow();
            }
        },

        // 輔助函式：計算不含標點符號的字數
        calculateRawLength: function (text) {
            return text.replace(/[，。？！、：；「」『』]/g, '').length;
        },

        // 調整字體大小
        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${(newSize) * 20}px`;
            } else {
                element.style.fontSize = `${(baseFontSizeRem) * 20}px`;
            }
        }
    };

    window.Game4 = Game4;

    if (new URLSearchParams(window.location.search).get('game') === '4') {
        setTimeout(() => {
            if (window.Game4) window.Game4.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
