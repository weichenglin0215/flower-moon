(function () {
    // Game2「飛花令」主物件：以單例（singleton）模式管理整個小遊戲的
    // 狀態、DOM 產生、事件綁定與遊戲流程控制。所有屬性與方法皆掛在
    // 同一個物件上，最後透過 window.Game2 對外暴露。
    const Game2 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        questionCount: 3, // 每行要問幾個字
        answerAtLine: 2, // 答案出現在第幾行，0=第一行或第二行，1=第二行，2=第三行
        mistakeCount: 0,
        selectedKeyword: '花',
        keywords: ['花', '月', '清', '雲', '玉', '霞', '國', '家', '酒', '愛', '恨', '春', '雨', '山', '水', '夢'],
        gameStartTime: null, // 本局開始時的時間戳（Date.now()），用於計算 duration_s

        // 遊戲狀態
        currentPoem: null,
        hiddenIndices: [], // 在目標行中被隱藏的字符索引
        currentInputIndex: 0, // 當前玩家正在輸入 hiddenIndices 中的第幾個
        timer: 40,
        timeLeft: 40,
        timerInterval: null,

        isRevealed: false, // 是否已顯示答案
        container: null, // 遊戲容器
        game2Area: null, // 遊戲區域

        //timeLimitRate: 每題每字時間倍率（秒），實際時限 = 答案行實際字數 × timeLimitRate
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount: 最大錯誤次數
        //answerAtLine: 答案出現在第幾行，0=第一行或第二行，1=第一行，2=第二行，3=第一行和第二行
        //grid: [行, 列]
        //questionCount: 每行要問幾個字
        difficultySettings: {
            '小學': { timeLimitRate: 8, poemMinRating: 6, maxMistakeCount: 5, answerAtLine: 2, grid: [3, 2], questionCount: 1 },
            '中學': { timeLimitRate: 4, poemMinRating: 5, maxMistakeCount: 4, answerAtLine: 2, grid: [3, 3], questionCount: 3 },
            '高中': { timeLimitRate: 3, poemMinRating: 4, maxMistakeCount: 3, answerAtLine: 0, grid: [4, 3], questionCount: 4 },
            '大學': { timeLimitRate: 2, poemMinRating: 3, maxMistakeCount: 2, answerAtLine: 0, grid: [4, 4], questionCount: 6 },
            '研究所': { timeLimitRate: 1, poemMinRating: 3, maxMistakeCount: 1, answerAtLine: 1, grid: [5, 4], questionCount: 7 }
        },

        // 動態載入 game2.css：若頁面尚未載入過此樣式表，才建立 <link> 標籤插入 <head>，
        // 避免重複載入同一份樣式。
        loadCSS: function () {
            if (!document.getElementById('game2-css')) {
                const link = document.createElement('link');
                link.id = 'game2-css';
                link.rel = 'stylesheet';
                link.href = 'game2.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入樣式、若尚未建立遊戲 DOM 則建立，並快取常用節點的參考，
        // 最後綁定難度標籤的點擊事件（點擊後開啟難度選擇器）。
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game2-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game2-container');
            this.game2Area = document.getElementById('game2-area');
            document.getElementById('game2-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立整個遊戲畫面的 DOM 結構（只會執行一次）：
        // 包含頂部計分列、控制按鈕、主字選擇區、題目顯示區，以及答案矩陣（含計時圈）。
        // 建立完成後掛到 document.body，並註冊響應式縮放回呼、綁定按鈕事件。
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game2-container';
            div.className = 'game2-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game2-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game2-diff-tag" data-level="小學">小學</button>
                        <button id="game2-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game2-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game2-hearts" class="fm-hearts"></div>
                    <div id="game2-info" class="fm-poem-info"></div>
                </div>
                <div id="game2-area" class="game2-area">
                    <!-- 遊戲內容將在此生成 -->
                    <div class="game2-keyword-selector" id="game2-keywords">
                        <!-- 主字按鈕將在此生成 -->
                    </div>
                    <div id="game2-question" class="game2-question-area">
                        <div id="game2-line1" class="game2-poem-lines"></div>
                        <div id="game2-line2" class="game2-poem-lines"></div>
                        <!-- 詩名/朝代/作者：已移至 fm-sub-header 右側，見上方 -->
                    </div>
                    <!-- 答案區域 (含邊框倒數) — 三層同心圓結構（同 game1）：
                         ① 最外圈：紅色 SVG timer stroke（10px）
                         ② 中間圈：3px 邊框 + 徑向漸層底色 + border-radius 20px
                         ③ 內圈：答案卡（20px padding） -->
                    <div class="game2-answer-area">
                        <div id="game2-answer-grid-container" class="game2-answer-grid-container">
                            <svg id="game2-timer-ring" class="fm-timer-ring">
                                <rect id="game2-timer-path" class="fm-timer-path" x="5" y="5"></rect>
                            </svg>
                            <div class="game2-answer-inner-ring">
                                <div class="game2-answer-grid" id="game2-answer-grid">
                                    <!-- JS 動態插入 -->
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

            // 綁定事件
            document.getElementById('game2-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame(); // 重來：保留題目
            };
            document.getElementById('game2-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame(); // 開新局：換新題目
            };

            // 初始化主字按鈕
            this.renderKeywords();
            this.renderHearts();
        },

        // 依 this.keywords 清單重繪主字（關鍵字）選擇按鈕列。
        // 目前選中的關鍵字會加上 active 樣式；點擊切換關鍵字後，若遊戲進行中則立即重新開局。
        renderKeywords: function () {
            const container = document.getElementById('game2-keywords');
            container.innerHTML = '';
            this.keywords.forEach(kw => {
                const btn = document.createElement('button');
                btn.className = 'kw-btn' + (kw === this.selectedKeyword ? ' active' : '');
                btn.textContent = kw;
                btn.onclick = () => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    if (this.selectedKeyword === kw) return;
                    this.selectedKeyword = kw;
                    this.renderKeywords();
                    if (this.isActive) this.startGame();
                };
                container.appendChild(btn);
            });
        },

        // 對外進入點：外部呼叫 Game2.show() 即可啟動本遊戲。
        // 會先初始化 DOM，再顯示難度選擇器讓玩家挑選難度／關卡。
        show: function () {
            this.init();

            // 顯示難度選擇器
            this.showDifficultySelector();
        },

        // 停止遊戲：關閉計時器、隱藏遊戲容器、還原頁面捲動與其他內容的顯示狀態。
        // 通常在玩家離開遊戲畫面（返回主頁）時呼叫。
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            // 恢复其他内容
            this.showOtherContents();
        },

        // 開啟共用的難度選擇器元件，讓玩家選擇「小學～研究所」難度或指定關卡。
        // 選定後的 callback 會設定難度／關卡模式，更新 UI，並開始新的一局。
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            // 隱藏主頁和其他遊戲畫面，避免畫面重疊
            this.hideOtherContents();

            // 使用全域共用的難度選擇器元件
            if (window.DifficultySelector) {
                window.DifficultySelector.show('飛花令', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.updateResponsiveLayout) {
                        /* updateResponsiveLayout replaced */
                    }
                    this.startNewGame();
                });
            } else {
                console.warn('[Game2] DifficultySelector not found');
            }
        },

        // 依「一般難度模式」或「關卡挑戰模式」更新頂部 UI：
        // 難度標籤文字、開新局／重來按鈕的顯示與否、主字選擇區是否隱藏。
        // 關卡模式下，關鍵字由關卡序號固定決定，不可讓玩家自由切換（避免破壞關卡確定性）。
        updateUIForMode: function () {
            const diffTag = document.getElementById('game2-diff-tag');
            const retryBtn = document.getElementById('game2-retryGame-btn');
            const newBtn = document.getElementById('game2-newGame-btn');
            const kwSelector = document.getElementById('game2-keywords');
            if (diffTag) diffTag.setAttribute('data-level', this.difficulty);

            if (this.isLevelMode) {
                if (diffTag) diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
                // 關卡模式下固定關鍵字，避免玩家切換關鍵字導致確定性消失
                if (kwSelector) kwSelector.style.display = 'none';

                // 根據關卡序號決定關鍵字
                const kwIdx = (this.currentLevelIndex - 1) % this.keywords.length;
                this.selectedKeyword = this.keywords[kwIdx];
            } else {
                if (diffTag) diffTag.textContent = this.difficulty;
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
                if (kwSelector) kwSelector.style.display = 'flex';
            }
            /* updateResponsiveLayout replaced */
        },

        // 進入本遊戲時，隱藏主頁卡片容器與其他遊戲（game1、game3）的畫面，避免互相干擾。
        hideOtherContents: function () {
            // 隱藏主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隱藏其他遊戲
            const game1 = document.getElementById('game1-container');
            const game3 = document.getElementById('game3-container');
            if (game1) game1.classList.add('hidden');
            if (game3) game3.classList.add('hidden');
        },

        // 離開本遊戲時，恢復主頁卡片容器的顯示。
        showOtherContents: function () {
            // 恢復主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        // 「重來」：沿用目前已選定的詩詞（this.currentPoem）與隱藏字，
        // 重設分數、失誤次數、輸入進度與計時器後重新開始本局，不重新抽題。
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;

            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.gameStartTime = Date.now(); // 重試也重設本局計時
            this.currentInputIndex = 0;
            this.isRevealed = false;
            document.getElementById('game2-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];

            this.renderQuestion();
            this.updatePoemInfoVisibility(false);
            this.renderGrid(true); // 使用舊有的 gridChars
            // 實際時限 = 答案行實際字數 × timeLimitRate
            const targetLine2r = this.answerLine === 1 ? this.line1 : this.line2;
            const calcTimeLimit = targetLine2r.replace(/[，。？！、；：「」（）《》]/g, '').length * settings.timeLimitRate;
            this.timeLeft = calcTimeLimit;
            this.timer = calcTimeLimit;
            this.startTimer();
            // 啟用重來按鈕
            document.getElementById('game2-retryGame-btn').disabled = false;
            document.getElementById('game2-newGame-btn').disabled = false;
        },

        // 「開新局」：重新抽選一首符合條件的詩詞（呼叫 selectPoem），
        // 重設分數／失誤／輸入進度，並依難度設定計算本局時限後啟動計時器。
        // 若傳入 levelIndex，代表進入指定關卡的挑戰模式；若選詩失敗，
        // 關卡模式下會自動跳到下一關，一般模式則提示玩家更換主字。
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
            document.getElementById('game2-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];

            // 記錄本局開始時間（用於計算 duration_s）
            this.gameStartTime = Date.now();
            if (this.selectPoem()) {
                this.renderQuestion();
                this.updatePoemInfoVisibility(false);
                this.renderGrid(false); // 生成新的 gridChars
                // 實際時限 = 答案行實際字數 × timeLimitRate
                const targetLine2 = this.answerLine === 1 ? this.line1 : this.line2;
                const calcTimeLimit = targetLine2.replace(/[，。？！、；：「」（）《》]/g, '').length * settings.timeLimitRate;
                this.timeLeft = calcTimeLimit;
                this.timer = calcTimeLimit;
                this.startTimer();
            } else {
                if (this.isLevelMode) {
                    console.log("[Game2] 關卡模式選詩失敗，嘗試放寬關鍵字或跳過");
                    this.startNextLevel(); // 遞增跳過
                    return;
                }
                alert(`找不到包含「${this.selectedKeyword}」且符合進度的詩詞，請換個主字試試。`);
                this.showDifficultySelector();
            }
            // 啟用按鈕
            document.getElementById('game2-retryGame-btn').disabled = false;
            document.getElementById('game2-newGame-btn').disabled = false;
        },

        // 前進到下一關：關卡序號加一後直接開始新的一局。
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },


        // 核心選題邏輯：依目前難度與所選關鍵字，向全域詩詞庫抽出一組相鄰兩句（line1、line2），
        // 並決定要隱藏（挖空）哪些字讓玩家作答。
        // 回傳 true 表示成功選好詩詞並設定好 this.line1/this.line2/this.hiddenIndices/this.targetChars；
        // 回傳 false 表示找不到符合條件的詩詞。
        selectPoem: function () {
            if (typeof POEMS === 'undefined') return false;

            const settings = this.difficultySettings[this.difficulty];
            // 使用全域共用邏輯（getSharedRandomPoem）取得隨機詩詞，
            // 關鍵字模式（isLevelMode）下會額外傳入關卡序號，確保每關詩詞可重現。
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                2, 2, 8, 30,
                this.selectedKeyword,
                this.isLevelMode ? this.currentLevelIndex : null,
                'game2'
            );

            if (!result) return false;

            this.currentPoem = result.poem;
            const content = result.poem.content;
            const startIdx = result.startIndex;

            // getSharedRandomPoem 保證從 startIdx 開始的 2 句包含關鍵字且評分達標
            // 我們判斷這 2 句中哪一句包含關鍵字
            const hasL1 = content[startIdx].includes(this.selectedKeyword);
            const hasL2 = content[startIdx + 1] && content[startIdx + 1].includes(this.selectedKeyword);

            // 優先找包含關鍵字的行作為答案行
            if (hasL1) {
                this.line1 = content[startIdx];
                this.line2 = content[startIdx + 1] || "";
                this.answerLine = 1;
            } else if (hasL2) {
                this.line1 = content[startIdx];
                this.line2 = content[startIdx + 1];
                this.answerLine = 2;
            } else {
                // 回退保護 (理論上不會發生)
                this.line1 = content[startIdx];
                this.line2 = content[startIdx + 1] || "";
                this.answerLine = 1;
            }

            // 根據 answerAtLine 設定決定問題出現在哪一行
            // 0 = 隨機選擇第一行或第二行，1 = 第一行，2 = 第二行
            if (settings.answerAtLine === 0) {
                // 隨機選擇，保持原有邏輯
                // this.answerLine 已經在上面設定好了
            } else if (settings.answerAtLine === 1) {
                // 強制使用第一行
                this.answerLine = 1;
            } else if (settings.answerAtLine === 2) {
                // 強制使用第二行
                this.answerLine = 2;
            }


            // 決定隱藏哪些字
            // 使用 questionCount 參數決定要隱藏幾個字
            const targetLine = this.answerLine === 1 ? this.line1 : this.line2;
            const chars = targetLine.replace(/[，。？！、：；「」『』]/g, '').split('');
            const cleanLine = targetLine.replace(/[，。？！、：；「」『』]/g, '');

            const indices = [];

            // 找出所有 關鍵字 的位置
            for (let i = 0; i < cleanLine.length; i++) {
                if (cleanLine[i] === this.selectedKeyword) indices.push(i);
            }

            // 根據 questionCount 參數決定總共要隱藏幾個字
            const totalQuestionsNeeded = settings.questionCount;

            // 計算還需要添加多少個額外的字（除了關鍵字之外）
            const numExtra = Math.max(0, totalQuestionsNeeded - indices.length);

            const available = [];
            for (let i = 0; i < cleanLine.length; i++) {
                if (!indices.includes(i)) available.push(i);
            }

            // 洗牌 available 取前 numExtra 個
            available.sort(() => Math.random() - 0.5);
            for (let i = 0; i < Math.min(numExtra, available.length); i++) {
                indices.push(available[i]);
            }

            // 如果關鍵字太多，只取前 questionCount 個
            if (indices.length > totalQuestionsNeeded) {
                indices.length = totalQuestionsNeeded;
            }

            // 排序，玩家需要依序輸入
            this.hiddenIndices = indices.sort((a, b) => a - b);
            this.targetChars = this.hiddenIndices.map(i => cleanLine[i]);

            return true;
        },

        // 重繪題目區（兩行詩句）：非答案行原樣顯示；答案行則依 hiddenIndices 挖空，
        // 已答對的字顯示綠色（correct-char），尚未作答的字以「◎」佔位，
        // 若 isRevealed 為 true（遊戲結束揭曉答案）則改以橘黃色顯示正確字（hidden-char）。
        // 同時更新詩詞出處資訊（標題／朝代／作者）文字。
        renderQuestion: function () {
            const l1 = document.getElementById('game2-line1');
            const l2 = document.getElementById('game2-line2');
            const info = document.getElementById('game2-info');

            const renderLine = (line, isAnswer) => {
                if (!isAnswer) return line;
                const cleanLine = line.replace(/[，。？！、：；「」『』]/g, '');
                let result = '';
                let cleanIdx = 0;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (/[，。？！、：；「」『』]/.test(char)) {
                        result += char;
                    } else {
                        if (this.hiddenIndices.includes(cleanIdx)) {
                            // 檢查是否已經答對
                            const hiddenIdxPos = this.hiddenIndices.indexOf(cleanIdx);
                            if (hiddenIdxPos < this.currentInputIndex) {
                                result += `<span class="correct-char">${cleanLine[cleanIdx]}</span>`;
                            } else if (this.isRevealed) {
                                // 揭曉答案，保留橘黃色 (hidden-char)
                                result += `<span class="hidden-char">${cleanLine[cleanIdx]}</span>`;
                            } else {
                                result += '<span class="hidden-char">◎</span>';
                            }
                        } else {
                            result += char;
                        }
                        cleanIdx++;
                    }
                }
                return result;
            };
            // 動態縮小字體
            this.adjustFontSize(l1, this.line1.length, 7, 2.5);
            this.adjustFontSize(l2, this.line2.length, 7, 2.5);

            l1.innerHTML = renderLine(this.line1, this.answerLine === 1);
            l2.innerHTML = renderLine(this.line2, this.answerLine === 2);

            let _title2 = this.currentPoem.title;
            if (_title2.length > 8) _title2 = _title2.substring(0, 8) + "…";
            info.textContent = `${_title2} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            info.dataset.poemId = this.currentPoem.id;
        },

        // 小學難度維持顯示詩詞出處供提示；中學以上開局隱藏，勝利後才顯示
        updatePoemInfoVisibility: function (revealed) {
            const info = document.getElementById('game2-info');
            if (!info) return;
            info.style.display = (this.difficulty === '小學' || revealed) ? '' : 'none';
        },

        // 產生答案矩陣（可點擊的字卡按鈕）：
        // - isRetry 為 true 時沿用上一輪已產生的字卡（this.currentGridChars），確保重來時版面不變；
        // - 否則將正確答案字（targetChars）與干擾字（decoys，優先透過 SharedDecoy 產生）
        //   混合、隨機打亂後產生新的一組字卡。
        // 每張卡片附帶出場動畫延遲，並綁定點擊事件呼叫 handleInput 進行答題判斷。
        renderGrid: function (isRetry = false) {
            const container = document.getElementById('game2-answer-grid');
            const settings = this.difficultySettings[this.difficulty];
            const [cols, rows] = settings.grid;

            container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            container.innerHTML = '';

            let allChars;
            if (isRetry && this.currentGridChars) {
                allChars = this.currentGridChars;
            } else {
                const totalCells = cols * rows;
                const answerChars = [...this.targetChars];
                const neededDecoys = totalCells - answerChars.length;

                // 使用 SharedDecoy 產生干擾字，以 keywords 作為 targetChars
                const decoys = window.SharedDecoy ? window.SharedDecoy.getDecoyChars(this.keywords, neededDecoys, answerChars, settings.minRating) : [];

                // 如果 SharedDecoy 沒傳回足夠的字，補充隨機項
                if (decoys.length < neededDecoys) {
                    const used = new Set([...answerChars, ...decoys]);
                    while (decoys.length < neededDecoys) {
                        const rnd = this.decoyChars[Math.floor(Math.random() * this.decoyChars.length)];
                        if (!used.has(rnd)) {
                            decoys.push(rnd);
                            used.add(rnd);
                        }
                    }
                }

                allChars = [...answerChars, ...decoys].sort(() => Math.random() - 0.5);
                this.currentGridChars = allChars;
            }

            const N = allChars.length;
            allChars.forEach((char, i) => {
                const btn = document.createElement('button');
                btn.className = 'game2-ans-btn';
                btn.textContent = char;
                // ⚠️ 出場動畫：所有卡片的啟動時機都壓進 0~0.5 秒之間
                //   （第一片 0s、最後一片 0.5s，其餘平均分布），每片動畫 0.5s
                //   從中心點整體 XY 放大（scale 0.0 → 1.0）
                btn.classList.add('game2-ans-appear');
                const delay = (N > 1) ? (i / (N - 1)) * 0.5 : 0;
                btn.style.animationDelay = delay.toFixed(3) + 's';
                // 如果是 retry，且該字已經被正確輸入過了，則需要標記為 disabled
                // 但為了簡單起見，retry 時 currentInputIndex 被重置為 0 了，所以全部按鈕都是可用狀態
                btn.onclick = (e) => {
                    if (window.SoundManager) {
                        const targetChar = this.targetChars[this.currentInputIndex];
                        if (char === targetChar) window.SoundManager.playConfirmItem();
                        else window.SoundManager.playFailure();
                    }
                    this.handleInput(char, e.target);
                };
                container.appendChild(btn);
            });

            // 重設計時器路徑
            this.updateTimerRing(1);
        },

        // 處理玩家點擊答案字卡：
        // - 答對：卡片標記為已答對並鎖定，加分、推進輸入進度並重繪題目；
        //   若所有目標字皆已答對，停止計時器並播放勝利動畫，動畫結束後呼叫 gameOver(true, ...)。
        // - 答錯：卡片短暫閃紅、增加失誤次數並更新愛心顯示；
        //   若失誤次數達到難度上限，呼叫 gameOver(false, ...) 結束本局。
        handleInput: function (char, btn) {
            if (!this.isActive) return;

            const targetChar = this.targetChars[this.currentInputIndex];
            if (char === targetChar) {
                // 答對
                btn.classList.add('correct', 'disabled');
                // 擊中文字，根據window.ScoreManager.gameSettings['game2'].getPointA加分
                this.score += window.ScoreManager.gameSettings['game2'].getPointA;
                document.getElementById('game2-score').textContent = this.score;
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.currentInputIndex === this.targetChars.length) {
                    clearInterval(this.timerInterval);
                    document.getElementById('game2-retryGame-btn').disabled = true; //必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                    document.getElementById('game2-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數

                    ScoreManager.playWinAnimation({
                        game: this,
                        difficulty: this.difficulty,
                        gameKey: 'game2',
                        timerContainerId: 'game2-answer-grid-container',
                        scoreElementId: 'game2-score',
                        heartsSelector: '#game2-hearts .fm-heart:not(.empty)',
                        onComplete: (finalScore) => {
                            this.score = finalScore;
                            // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                            this.gameOver(true, '');
                        }
                    });
                }
            } else {
                // 答錯
                btn.classList.add('wrong');
                setTimeout(() => btn.classList.remove('wrong'), 400);
                this.mistakeCount++;
                this.updateHearts();

                const settings = this.difficultySettings[this.difficulty];
                if (this.mistakeCount >= settings.maxMistakeCount) {
                    this.gameOver(false, `失誤 ${this.mistakeCount} 次`);
                }
            }
        },

        // 啟動倒數計時器：以 100ms 為間隔輪詢已經過時間，換算成剩餘比例（ratio，1→0）
        // 更新計時圈視覺（updateTimerRing）；ratio 歸零時視為時間到，判定本局失敗。
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.timer * 1000;

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

        // 更新答案矩陣外圍的計時圈（SVG 矩形描邊）視覺效果。
        // ratio：剩餘時間比例（1=剛開始，0=時間用盡）。
        // mode 為 'win' 時代表播放勝利動畫，顯示黃色弧段隨剩餘時間縮短；
        // 否則為一般倒數計時，顯示朱紅色弧段隨經過時間增長（顏色/透明度依主題 CSS 變數計算）。
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game2-timer-path');
            const container = document.getElementById('game2-answer-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;

            // 更新 SVG 大小
            const svg = document.getElementById('game2-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            // ⚠️ 對齊三層結構最外圈：rect x=5 y=5、stroke-width=10 → 覆蓋 container 外緣 10px 環帶
            rect.setAttribute('width', w - 10);
            rect.setAttribute('height', h - 10);

            const perimeter = (w - 10 + h - 10) * 2;
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

        // 依難度設定的最大失誤次數（maxMistakeCount）產生對應數量的愛心圖示，
        // 用於直觀顯示玩家還剩幾次答錯機會。
        renderHearts: function () {
            const hearts = document.getElementById('game2-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            const settings = this.difficultySettings[this.difficulty];
            for (let i = 0; i < settings.maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        // 依目前失誤次數（mistakeCount）更新愛心圖示：已消耗的愛心變為空心（♡），
        // 其餘維持實心（♥）。
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game2-hearts .fm-heart');
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

        // 結束本局：停用遊戲互動、清除計時器、揭曉答案。
        // win=false 時，若已連線 Supabase，會記錄一筆失敗的遊戲紀錄（分數 0、本局耗時）；
        // 過關的紀錄則由 ScoreManager.saveScore 負責寫入，此處不重複記錄。
        // 最後依是否為關卡模式、是否過關，決定顯示的訊息框與「下一步」行為
        // （關卡模式過關→下一關；一般模式過關→開新局；失敗→重來）。
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
                    gameNo: 2,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game2-retryGame-btn').disabled = true; //必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game2-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game2-retryGame-btn').disabled = false;
                document.getElementById('game2-newGame-btn').disabled = false;
            }
            clearInterval(this.timerInterval);
            this.isRevealed = true;
            if (win) this.updatePoemInfoVisibility(true);
            //取消顯示答案
            //this.renderQuestion();

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
                        reason: win ? "" : reason,
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game2', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game2', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        },

        // 依文字長度動態調整字級：若字數超過 threshold（門檻字數），
        // 字級依比例縮小（threshold / textLen），避免過長詩句超出容器寬度；
        // 未超過門檻則維持基準字級 baseFontSizeRem。
        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${(newSize) * 20}px`;
            } else {
                element.style.fontSize = `${(baseFontSizeRem) * 20}px`;
            }
        }
    };

    // 將 Game2 物件掛到全域 window，供其他模組（如主頁選單）呼叫 Game2.show() 啟動遊戲。
    window.Game2 = Game2;

    // 自動檢查網址參數：若 URL 帶有 ?game=2，頁面載入後自動啟動本遊戲，
    // 並清除該參數避免重新整理時重複觸發。
    if (new URLSearchParams(window.location.search).get('game') === '2') {
        setTimeout(() => {
            window.Game2.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
