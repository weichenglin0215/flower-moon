(function () {
    // 遊戲一：慢思快選 (Slow Thought, Fast Choice)
    const Game1 = {
        isActive: false,
        difficulty: '幼稚園',
        timer: 10,
        timerInterval: null,
        score: 0,
        mistakes: 0,
        maxMistakes: 3,
        currentPoem: null,
        correctAnswer: "",
        options: [],

        container: null,
        gameArea: null,
        timerBar: null,
        timerText: null,

        // 难度设置
        difficultySettings: {
            '幼稚園': { time: 15, minRating: 3, maxMistakes: 4 },
            '小學': { time: 12, minRating: 3, maxMistakes: 3 },
            '中學': { time: 10, minRating: 2, maxMistakes: 2 },
            '大學': { time: 8, minRating: 1, maxMistakes: 2 },
            '研究所': { time: 6, minRating: 0, maxMistakes: 1 }
        },

        loadCSS: function () {
            if (!document.getElementById('game1-css')) {
                const link = document.createElement('link');
                link.id = 'game1-css';
                link.rel = 'stylesheet';
                link.href = 'game1.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game1-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game1-container');
            this.gameArea = document.getElementById('game1-area');
            this.timerBar = document.getElementById('game1-timer-bar');
            this.timerText = document.getElementById('game1-timer-text');

            // 綁定按鈕
            document.getElementById('game1-restart-btn').addEventListener('click', () => this.restartGame());
            document.getElementById('game1-close-btn').addEventListener('click', () => this.stopGame());
            document.getElementById('game1-msg-btn').addEventListener('click', () => {
                document.getElementById('game1-message').classList.add('hidden');
                this.restartGame();
            });
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game1-container';
            div.className = 'game1-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <div class="debug-frame"></div>
                
                <div class="game1-header">
                    <div class="score-board">分數: <span id="game1-score">0</span></div>
                    <div class="game1-controls">
                        <button id="game1-restart-btn" class="nav-btn">重來</button>
                        <button id="game1-close-btn" class="nav-btn close-btn">退出</button>
                    </div>
                </div>
                <div class="game1-sub-header">
                    <div id="game1-hearts" class="hearts"></div>
                </div>
                <div id="game1-area" class="game-area">
                    <!-- 遊戲內容將在此生成 -->
                    <!-- 倒數計時 -->
                    <div class="timer-container">
                        <svg class="timer-svg" width="100" height="100">
                            <circle class="timer-bg" cx="50" cy="50" r="45"></circle>
                            <circle id="game1-timer-bar" class="timer-bar" cx="50" cy="50" r="45" 
                                stroke-dasharray="282.7" stroke-dashoffset="0"></circle>
                        </svg>
                        <div id="game1-timer-text" class="timer-text">10</div>
                    </div>

                    <!-- 問題區域 -->
                    <div class="question-area">
                        <div id="game1-question-lines" class="poem-lines">
                            <!-- JS 動態插入 -->
                        </div>
                        <div id="game1-poem-info" class="poem-info">
                            <!-- 詩名/朝代/作者 -->
                        </div>
                    </div>

                    <!-- 答案區域 -->
                    <div id="game1-options" class="options-area">
                        <!-- JS 動態插入 -->
                    </div>
                </div>

                <div id="game1-message" class="game1-message hidden">
                    <h2 id="game1-msg-title">時間到！</h2>
                    <p id="game1-msg-content"></p>
                    <button id="game1-msg-btn" class="msg-btn">再來一次</button>
                </div>
            `;
            document.body.appendChild(div);
            document.getElementById('game1-msg-btn').addEventListener('click', () => {
                document.getElementById('game1-message').classList.add('hidden');
                this.showDifficultySelector();
            });

            this.renderHearts();
        },

        show: function () {
            this.init(); // 確保 DOM 存在

            // 显示难度选择器
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game1-message').classList.add('hidden');

            // 隐藏主页和其他游戏
            this.hideOtherContents();
            // 显示难度选择器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('游戏一：慢思快选', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    const settings = this.difficultySettings[selectedLevel];
                    this.timer = settings.time;
                    this.maxMistakes = settings.maxMistakes;
                    
                    // 显示游戏容器
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    // 触发响应式布局更新
                    if (window.updateResponsiveLayout) {
                        window.updateResponsiveLayout();
                    }
                    this.restartGame();
                });
            } else {
                // 降级处理：直接开始游戏
                console.warn('[Game1] DifficultySelector not found, using default difficulty');
                this.container.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                document.body.classList.add('overlay-active');
                if (window.updateResponsiveLayout) {
                    window.updateResponsiveLayout();
                }
                this.restartGame();
            }
        },

        hideOtherContents: function () {
            // 隐藏主页容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }
            
            // 隐藏其他游戏
            const game2 = document.getElementById('game2-container');
            const game3 = document.getElementById('game3-container');
            if (game2) game2.classList.add('hidden');
            if (game3) game3.classList.add('hidden');
        },

        showOtherContents: function () {
            // 恢复主页容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            // 恢复其他内容
            this.showOtherContents();
        },

        restartGame: function () {
            this.isActive = true;
            this.score = 0;
            this.mistakes = 0;
            //this.updateLives();
            this.renderHearts();
            document.getElementById('game1-score').textContent = this.score;
            document.getElementById('game1-message').classList.add('hidden');
            // 清空遊戲區域
            //this.gameArea.innerHTML = '';
            this.nextQuestion();
        },

        nextQuestion: function () {
            if (!this.isActive) return;

            // 選擇詩詞
            this.prepareChallenge();

            // 重設計時器
            this.startTimer();
        },

        prepareChallenge: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return;

            // 根据难度筛选诗词
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.minRating;

            // 優先選擇常見詩體
            const eligiblePoems = POEMS.filter(p =>
                p.content && p.content.length >= 2 && p.type &&
                (p.type.includes('五言') || p.type.includes('七言')) &&
                (p.rating || 0) >= minRating
            );

            let poem = eligiblePoems[Math.floor(Math.random() * eligiblePoems.length)];
            this.currentPoem = poem;

            // 隨機選相鄰兩句 (偶數句一對)
            const numLines = poem.content.length;
            const pairIdx = Math.floor(Math.random() * Math.floor(numLines / 2));
            const startIdx = pairIdx * 2;
            let line1 = poem.content[startIdx];
            let line2 = poem.content[startIdx + 1];

            // 隨機決定哪一句被部分隱藏
            const hideFirst = Math.random() < 0.5;
            this.correctAnswer = hideFirst ? line1 : line2;
            const displayedLine = hideFirst ? line2 : line1;

            // 處理隱藏文字 (◎)
            const maskLine = (text) => {
                const chars = text.split('');
                // 找出非標點的位置
                let validIndices = [];
                chars.forEach((c, i) => {
                    if (!/[，。？！、：；]/.test(c)) validIndices.push(i);
                });

                // 隨機隱藏 2-3 個字 (不要全遮，也不要只遮一個)
                const maskCount = Math.min(validIndices.length - 1, Math.max(2, Math.floor(validIndices.length / 2)));

                let maskedIndices = [];
                while (maskedIndices.length < maskCount) {
                    let r = validIndices[Math.floor(Math.random() * validIndices.length)];
                    if (!maskedIndices.includes(r)) maskedIndices.push(r);
                }

                return chars.map((c, i) => maskedIndices.includes(i) ? "◎" : c).join('');
            };

            const maskedLineText = maskLine(this.correctAnswer);

            // 更新 UI
            const qDiv = document.getElementById('game1-question-lines');
            qDiv.innerHTML = '';

            const l1Div = document.createElement('div');
            l1Div.className = 'poem-line';
            l1Div.textContent = hideFirst ? maskedLineText : displayedLine;
            qDiv.appendChild(l1Div);

            const l2Div = document.createElement('div');
            l2Div.className = 'poem-line';
            l2Div.textContent = hideFirst ? displayedLine : maskedLineText;
            qDiv.appendChild(l2Div);

            document.getElementById('game1-poem-info').textContent =
                `${poem.title} / ${poem.dynasty} / ${poem.author}`;

            // 生成選項
            this.generateOptions(this.correctAnswer, maskedLineText);
        },

        generateOptions: function (correct, masked) {
            const correctClean = correct.replace(/[，。？！、：；]/g, '');
            const lineLen = correctClean.length;
            const poemType = this.currentPoem.type || "";

            // 從相同長度且類型相似的詩中找干擾項
            let potentialDecoys = POEMS.filter(p =>
                p.type === poemType && p.id !== this.currentPoem.id
            ).flatMap(p => p.content);

            // 如果同類型的詩不夠，就全庫找長度相同的句
            if (potentialDecoys.length < 10) {
                potentialDecoys = POEMS.flatMap(p => p.content).filter(l =>
                    l.replace(/[，。？！、：；]/g, '').length === lineLen
                );
            }

            // 取得遮罩模式 (true 代表在問題中是隱藏的)
            const getMaskPattern = (original, maskedText) => {
                let p = [];
                for (let i = 0; i < original.length; i++) {
                    p.push(maskedText[i] === "◎");
                }
                return p;
            };

            const pattern = getMaskPattern(correct, masked);

            // 選取顯示反向遮罩的字 (即問題中隱藏的字)
            const applyOptionMask = (targetLine) => {
                // targetLine 可能長度與 correct 不一致 (雖然 filter 過但標點可能不同)
                // 為了保險，我們先 clean 再 map
                const targetClean = targetLine.replace(/[，。？！、：；]/g, '');
                const correctStructure = correct; // 用正確句的結構

                let result = "";
                let cleanIdx = 0;
                for (let i = 0; i < correctStructure.length; i++) {
                    const isPunct = /[，。？！、：；]/.test(correctStructure[i]);
                    if (isPunct) {
                        result += correctStructure[i];
                    } else if (cleanIdx < targetClean.length) {
                        // 反向映射：問題顯示的字在選項中隱藏，問題隱藏的字在選項中顯示
                        result += pattern[i] ? targetClean[cleanIdx] : "◎";
                        cleanIdx++;
                    }
                }
                return result;
            };

            let finalOptions = [{ text: applyOptionMask(correct), isCorrect: true }];
            let usedLines = [correct];

            // 隨機選出 3 個干擾項
            const decoys = [];
            while (decoys.length < 3) {
                const raw = potentialDecoys[Math.floor(Math.random() * potentialDecoys.length)];
                const clean = raw.replace(/[，。？！、：；]/g, '');
                if (clean.length === lineLen && !usedLines.includes(raw)) {
                    decoys.push(raw);
                    usedLines.push(raw);
                    finalOptions.push({ text: applyOptionMask(raw), isCorrect: false });
                }
            }

            // 洗牌
            finalOptions.sort(() => Math.random() - 0.5);

            // 渲染
            const optDiv = document.getElementById('game1-options');
            optDiv.innerHTML = '';
            finalOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'option-btn';
                btn.textContent = opt.text;
                btn.dataset.isCorrect = opt.isCorrect; // 標記是否正確
                btn.addEventListener('click', () => this.handleChoice(opt.isCorrect, btn));
                optDiv.appendChild(btn);
            });
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            this.timer = 10;
            this.updateTimerUI();

            this.timerInterval = setInterval(() => {
                this.timer--;
                this.updateTimerUI();
                if (this.timer <= 0) {
                    clearInterval(this.timerInterval);
                    this.mistakes++;
                    this.updateHearts();
                    //this.updateLives();

                    // 揭曉答案：正確綠色，錯誤紅色
                    const btns = document.querySelectorAll('#game1-options .option-btn');
                    btns.forEach(btn => {
                        const isCorrect = btn.dataset.isCorrect === 'true';
                        btn.classList.add(isCorrect ? 'correct' : 'wrong');
                        btn.disabled = true; // 禁用按鈕
                    });

                    // 稍微延遲顯示結束畫面，讓讀者看清答案
                    setTimeout(() => {
                        this.gameOver(false, "時間到！");
                    }, 1500);
                }
            }, 1000);
        },

        updateTimerUI: function () {
            this.timerText.textContent = this.timer.toString().padStart(2, '0');
            // SVG 圈圈：stroke-dashoffset = circumference * (1 - timeLeft/totalTime)
            // 順時針消失 = dashoffset 從 0 變到 282.7 (全消失)
            const circumference = 282.7;
            const offset = circumference * (1 - this.timer / 10);
            this.timerBar.style.strokeDashoffset = offset;
        },

        handleChoice: function (isCorrect, btn) {
            if (!this.isActive) return;

            if (isCorrect) {
                btn.classList.add('correct');
                clearInterval(this.timerInterval);
                setTimeout(() => {
                    this.gameOver(true);
                }, 500);
            } else {
                if (btn.classList.contains('wrong')) return;
                btn.classList.add('wrong');
                this.mistakes++;
                //this.updateLives();
                this.updateHearts();
                if (this.mistakes >= this.maxMistakes) {
                    clearInterval(this.timerInterval);
                    setTimeout(() => {
                        this.gameOver(false, "挑戰失敗！正確答案是：" + this.correctAnswer);
                    }, 500);
                }
            }
        },

        updateLives: function () {
            const livesSpan = document.getElementById('game1-lives');
            livesSpan.textContent = "♥".repeat(this.maxMistakes - this.mistakes) + "♡".repeat(this.mistakes);
        },
        renderHearts: function () {
            const hearts = document.getElementById('game1-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.difficultySettings[this.difficulty].maxMistakes; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game1-hearts .heart');
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
        gameOver: function (win, reason) {
            this.isActive = false;
            const msgDiv = document.getElementById('game1-message');
            const title = document.getElementById('game1-msg-title');
            const content = document.getElementById('game1-msg-content');

            msgDiv.classList.remove('hidden');
            if (win) {
                title.textContent = "恭喜獲勝！";
                title.style.color = "#28a745";
                content.textContent = "思緒敏捷，觀察入微！";
            } else {
                title.textContent = "遊戲結束";
                title.style.color = "#dc3545";
                content.textContent = reason;
            }
        }
    };

    window.Game1 = Game1;

    // 自動檢查是否需要啟動 (從 URL 參數)
    if (window.location.search.includes('game=1')) {
        setTimeout(() => {
            if (window.Game1) window.Game1.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 300);
    }
})();
