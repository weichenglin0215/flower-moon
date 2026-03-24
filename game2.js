(function () {
    const Game2 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        questionCount: 3, // 每行要問幾個字
        answerAtLine: 2, // 答案出現在第幾行，0=第一行或第二行，1=第二行，2=第三行
        mistakeCount: 0,
        selectedKeyword: '花',
        keywords: ['花', '月', '清', '雲', '玉', '霞', '國', '家', '酒', '愛', '恨', '春', '雨', '山', '水', '夢'],

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

        //timeLimit: 時間限制
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount: 最大錯誤次數
        //answerAtLine: 答案出現在第幾行，0=第一行或第二行，1=第一行，2=第二行，3=第一行和第二行
        //grid: [行, 列]
        //questionCount: 每行要問幾個字
        difficultySettings: {
            '小學': { timeLimit: 60, poemMinRating: 6, maxMistakeCount: 4, answerAtLine: 2, grid: [3, 2], questionCount: 1 },
            '中學': { timeLimit: 45, poemMinRating: 5, maxMistakeCount: 5, answerAtLine: 2, grid: [3, 3], questionCount: 3 },
            '高中': { timeLimit: 30, poemMinRating: 4, maxMistakeCount: 6, answerAtLine: 0, grid: [4, 3], questionCount: 4 },
            '大學': { timeLimit: 20, poemMinRating: 3, maxMistakeCount: 7, answerAtLine: 0, grid: [4, 4], questionCount: 6 },
            '研究所': { timeLimit: 15, poemMinRating: 2, maxMistakeCount: 8, answerAtLine: 1, grid: [5, 4], questionCount: 7 }
        },

        loadCSS: function () {
            if (!document.getElementById('game2-css')) {
                const link = document.createElement('link');
                link.id = 'game2-css';
                link.rel = 'stylesheet';
                link.href = 'game2.css';
                document.head.appendChild(link);
            }
        },

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

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game2-container';
            //檢查responsive.css是否有包括game2 - overlay.aspect - 5 - 8
            div.className = 'game2-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <div class="debug-frame"></div>
                
                <div class="game2-header">
                    <div class="game2-score-board">分數: <span id="game2-score">0</span></div>
                    <div class="game2-controls">
                        <button class="game2-difficulty-tag" id="game2-diff-tag">小學</button>
                        <button id="game2-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game2-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game2-sub-header">
                    <div id="game2-hearts" class="hearts"></div>
                </div>
                <div id="game2-area" class="game2-area">
                    <!-- 遊戲內容將在此生成 -->
                    <div class="game2-keyword-selector" id="game2-keywords">
                        <!-- 主字按鈕將在此生成 -->
                    </div>
                    <div id="game2-question" class="game2-question-area">
                        <div id="game2-line1" class="game2-poem-lines"></div>
                        <div id="game2-line2" class="game2-poem-lines"></div>
                        <div id="game2-info" class="game2-poem-info" ></div>
                    </div>
                    <div class="game2-answer-area">
                        <div id="game2-answer-grid-container" class="game2-answer-grid-container">
                            <svg id="game2-timer-ring">
                                <rect id="game2-timer-path" x="4" y="4"></rect>
                            </svg>
                            <div class="game2-answer-grid" id="game2-answer-grid">
                                <!-- JS 動態插入 -->
                            </div>
                        </div>
                    </div>
                </div>

                <div id="game2-message" class="game2-message hidden">
                    <h2 id="game2-msg-title">遊戲結束</h2>
                    <p id="game2-msg-content"></p>
                    <button id="game2-msg-btn" class="nav-btn">再來一局</button>
                </div>
            `;
            document.body.appendChild(div);

            // 綁定事件
            document.getElementById('game2-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame(); // 重來：保留題目
            };
            document.getElementById('game2-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame(); // 開新局：換新題目
            };
            document.getElementById('game2-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game2-message').classList.add('hidden');
                if (this.isWin) this.startNewGame();
                else this.retryGame();
            };

            // 初始化主字按鈕
            this.renderKeywords();
            this.renderHearts();
        },

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

        show: function () {
            this.init();

            // 显示难度选择器
            this.showDifficultySelector();
        },

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

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game2-message').classList.add('hidden');

            // 隐藏主页和其他游戏
            this.hideOtherContents();

            // 使用全局难度选择器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('遊戲二：飛花令', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.updateResponsiveLayout) {
                        window.updateResponsiveLayout();
                    }
                    this.startNewGame();
                });
            } else {
                console.warn('[Game2] DifficultySelector not found');
            }
        },

        hideOtherContents: function () {
            // 隐藏主页容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隐藏其他游戏
            const game1 = document.getElementById('game1-container');
            const game3 = document.getElementById('game3-container');
            if (game1) game1.classList.add('hidden');
            if (game3) game3.classList.add('hidden');
        },

        showOtherContents: function () {
            // 恢复主页容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;

            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            document.getElementById('game2-score').textContent = this.score;
            document.getElementById('game2-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.timeLimit; // 遊戲時間
            this.timer = settings.timeLimit; // 倒數計時

            this.renderQuestion();
            this.renderGrid(true); // 使用舊有的 gridChars
            this.startTimer();
            // 啟用重來按鈕
            document.getElementById('game2-retryGame-btn').disabled = false;
            document.getElementById('game2-newGame-btn').disabled = false;
        },

        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            const diffTag = document.getElementById('game2-diff-tag');
            if (diffTag) {
                diffTag.textContent = this.difficulty;
                diffTag.setAttribute('data-level', this.difficulty);
            }
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            document.getElementById('game2-score').textContent = this.score;
            document.getElementById('game2-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.timeLimit; // 遊戲時間
            this.timer = settings.timeLimit; // 倒數計時

            if (this.selectPoem()) {
                this.renderQuestion();
                this.renderGrid(false); // 生成新的 gridChars
                this.startTimer();
            } else {
                alert(`找不到包含「${this.selectedKeyword}」且符合進度的詩詞，請換個主字試試。`);
                this.showDifficultySelector();
            }
            // 啟用重來按鈕
            document.getElementById('game2-retryGame-btn').disabled = false;
            document.getElementById('game2-newGame-btn').disabled = false;
        },


        selectPoem: function () {
            if (typeof POEMS === 'undefined') return false;

            const settings = this.difficultySettings[this.difficulty];
            // 使用共用邏輯取得隨機詩詞，並要求包含關鍵字
            const result = getSharedRandomPoem(settings.minRating, 2, 4, 10, 100, this.selectedKeyword);

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

            l1.innerHTML = renderLine(this.line1, this.answerLine === 1);
            l2.innerHTML = renderLine(this.line2, this.answerLine === 2);
            info.textContent = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            info.dataset.poemId = this.currentPoem.id;
        },

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

            allChars.forEach(char => {
                const btn = document.createElement('button');
                btn.className = 'game2-ans-btn';
                btn.textContent = char;
                // 如果是 retry，且該字已經被正確輸入過了，則需要標記為 disabled
                // 但為了簡單起見，retry 時 currentInputIndex 被重置為 0 了，所以全部按鈕都是可用狀態
                btn.onclick = (e) => {
                    if (window.SoundManager) {
                        const targetChar = this.targetChars[this.currentInputIndex];
                        if (char === targetChar) window.SoundManager.playSuccess();
                        else window.SoundManager.playFailure();
                    }
                    this.handleInput(char, e.target);
                };
                container.appendChild(btn);
            });

            // 重設計時器路徑
            this.updateTimerRing(1);
        },

        handleInput: function (char, btn) {
            if (!this.isActive) return;

            const targetChar = this.targetChars[this.currentInputIndex];
            if (char === targetChar) {
                // 答對
                btn.classList.add('correct', 'disabled');
                this.score += 10;
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
                        heartsSelector: '#game2-hearts .heart:not(.empty)',
                        onComplete: (finalScore) => {
                            this.gameOver(true, finalScore);
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
                    this.gameOver(false, `按錯次數達 ${this.mistakeCount} 次`);
                }
            }
        },

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

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game2-timer-path');
            const container = document.getElementById('game2-answer-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;

            // 更新 SVG 大小
            const svg = document.getElementById('game2-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            rect.setAttribute('width', w - 8);
            rect.setAttribute('height', h - 8);

            const perimeter = (w - 8 + h - 8) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - ratio);
        },

        renderHearts: function () {
            const hearts = document.getElementById('game2-hearts');
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

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game2-hearts .heart');
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

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
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
            this.renderQuestion();

            const msgDiv = document.getElementById('game2-message');
            const title = document.getElementById('game2-msg-title');
            const content = document.getElementById('game2-msg-content');

            msgDiv.classList.remove('hidden');
            if (win) {
                title.textContent = "恭喜過關！";
                title.style.color = "#4CAF50";
                content.textContent = `完成了飛花令！得分：${reason}`;
            } else {
                title.textContent = "遊戲結束";
                title.style.color = "#f44336";
                content.textContent = reason || "再接再厲！";
            }

            const msgBtn = document.getElementById('game2-msg-btn');
            if (win) {
                msgBtn.textContent = "下一局";
            } else {
                msgBtn.textContent = "再試一次";
            }
        }
    };

    window.Game2 = Game2;

    // 自動檢查是否需要啟動
    if (new URLSearchParams(window.location.search).get('game') === '2') {
        setTimeout(() => {
            window.Game2.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
