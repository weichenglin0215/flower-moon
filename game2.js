(function () {
    const Game2 = {
        isActive: false,
        difficulty: '幼稚園',
        score: 0,
        questionCount: 3, // 每行要問幾個字
        questionAtLine: 2, // 問題出現在第幾行，0=第一行或第二行，1=第二行，2=第三行
        mistakeCount: 0,
        selectedKeyword: '花',
        keywords: ['花', '月', '清', '雲', '玉', '霞', '國', '家', '酒', '愛', '恨', '雲', '雨', '山', '水', '夢'],

        // 遊戲狀態
        currentPoem: null,
        hiddenIndices: [], // 在目標行中被隱藏的字符索引
        currentInputIndex: 0, // 當前玩家正在輸入 hiddenIndices 中的第幾個
        timer: 40,
        timeLeft: 40,
        timerInterval: null,

        container: null,
        game2Area: null,

        difficultySettings: {
            '幼稚園': { grid: [3, 3], time: 120, questionCount: 1, questionAtLine: 2, minRating: 3, maxMistakeCount: 8 },
            '小學': { grid: [4, 3], time: 90, questionCount: 2, questionAtLine: 2, minRating: 3, maxMistakeCount: 10 },
            '中學': { grid: [4, 4], time: 60, questionCount: 3, questionAtLine: 0, minRating: 2, maxMistakeCount: 8 },
            '大學': { grid: [5, 4], time: 30, questionCount: 4, questionAtLine: 0, minRating: 1, maxMistakeCount: 8 },
            '研究所': { grid: [5, 4], time: 15, questionCount: 5, questionAtLine: 1, minRating: 0, maxMistakeCount: 4 }
        },

        decoyChars: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長",

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
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game2-container';
            div.className = 'game2-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <div class="debug-frame"></div>
                
                <div class="game2-header">
                    <div class="score-board">分數: <span id="game2-score">0</span></div>
                    <div class="game2-controls">
                        <button id="game2-restart-btn" class="nav-btn">重來</button>
                        <button id="game2-close-btn" class="nav-btn close-btn">退出</button>
                    </div>
                </div>
                <div class="game2-sub-header">
                    <div id="game2-hearts" class="hearts"></div>
                </div>
                <div id="game2-area" class="game2-area">
                    <!-- 遊戲內容將在此生成 -->
                    <div class="keyword-selector" id="game2-keywords">
                        <!-- 主字按鈕將在此生成 -->
                    </div>
                    <div id="game2-question" class="question-area">
                        <div id="game2-line1" class="poem-lines"></div>
                        <div id="game2-line2" class="poem-lines"></div>
                        <div id="game2-info" class="poem-info" ></div>
                    </div>
                    <div class="answer-section">
                        <div id="game2-grid-container" class="grid-container">
                            <svg id="timer-ring">
                                <rect id="timer-path" x="4" y="4"></rect>
                            </svg>
                            <div class="answer-grid" id="game2-grid"></div>
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
            document.getElementById('game2-close-btn').addEventListener('click', () => this.stopGame());
            document.getElementById('game2-restart-btn').addEventListener('click', () => this.restartGame());
            document.getElementById('game2-msg-btn').addEventListener('click', () => {
                document.getElementById('game2-message').classList.add('hidden');
                this.showDifficultySelector();
            });

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
            this.container.classList.add('hidden');
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
                    this.restartGame();
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

        restartGame: function () {
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            document.getElementById('game2-score').textContent = this.score;
            document.getElementById('game2-message').classList.add('hidden');
            this.renderHearts();
            
            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.time;
            this.timer = settings.time;

            if (this.selectPoem()) {
                this.renderQuestion();
                this.renderGrid();
                this.startTimer();
            } else {
                alert(`找不到包含「${this.selectedKeyword}」且符合進度的詩詞，請換個主字試試。`);
                this.showDifficultySelector();
            }
        },

        selectPoem: function () {
            if (typeof POEMS === 'undefined') return false;

            const settings = this.difficultySettings[this.difficulty];
            // 篩選包含關鍵字的詩詞
            const eligible = POEMS.filter(p => {
                if ((p.rating || 0) < settings.minRating) return false;
                return p.content.some(line => line.includes(this.selectedKeyword));
            });

            if (eligible.length === 0) return false;

            // 隨機選一個
            const poem = eligible[Math.floor(Math.random() * eligible.length)];

            // 找包含關鍵字的行
            const matchingLines = [];
            poem.content.forEach((line, idx) => {
                if (line.includes(this.selectedKeyword)) {
                    matchingLines.push(idx);
                }
            });

            const targetIdx = matchingLines[Math.floor(Math.random() * matchingLines.length)];
            const otherIdx = (targetIdx % 2 === 0) ? targetIdx + 1 : targetIdx - 1;

            // 確保 index 有效
            const l1Idx = Math.min(targetIdx, otherIdx);
            const l2Idx = Math.max(targetIdx, otherIdx);

            if (l2Idx >= poem.content.length) {
                // 如果是奇數行且是最後一行，取前一行
                this.line1 = poem.content[targetIdx - 1];
                this.line2 = poem.content[targetIdx];
                this.answerLine = 2; // 目標在第二行
            } else {
                this.line1 = poem.content[l1Idx];
                this.line2 = poem.content[l2Idx];
                this.answerLine = (targetIdx === l1Idx) ? 1 : 2;
            }

            // 根據 questionAtLine 設定決定問題出現在哪一行
            // 0 = 隨機選擇第一行或第二行，1 = 第一行，2 = 第二行
            if (settings.questionAtLine === 0) {
                // 隨機選擇，保持原有邏輯
                // this.answerLine 已經在上面設定好了
            } else if (settings.questionAtLine === 1) {
                // 強制使用第一行
                this.answerLine = 1;
            } else if (settings.questionAtLine === 2) {
                // 強制使用第二行
                this.answerLine = 2;
            }

            this.currentPoem = poem;

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
        },

        renderGrid: function () {
            const container = document.getElementById('game2-grid');
            const settings = this.difficultySettings[this.difficulty];
            const [cols, rows] = settings.grid;

            container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            container.innerHTML = '';

            const totalCells = cols * rows;
            const answerChars = [...this.targetChars];

            // 干擾字
            const decoys = [];
            while (decoys.length < totalCells - answerChars.length) {
                const char = this.decoyChars[Math.floor(Math.random() * this.decoyChars.length)];
                if (!answerChars.includes(char) && !decoys.includes(char)) {
                    decoys.push(char);
                }
            }

            const allChars = [...answerChars, ...decoys].sort(() => Math.random() - 0.5);

            allChars.forEach(char => {
                const btn = document.createElement('button');
                btn.className = 'ans-btn';
                btn.textContent = char;
                btn.onclick = (e) => this.handleInput(char, e.target);
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
                    this.gameOver(true);
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
            const startTime = Date.now();
            const duration = this.timer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
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
            const rect = document.getElementById('timer-path');
            const container = document.getElementById('game2-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;

            // 更新 SVG 大小
            const svg = document.getElementById('timer-ring');
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
            clearInterval(this.timerInterval);

            const msgDiv = document.getElementById('game2-message');
            const title = document.getElementById('game2-msg-title');
            const content = document.getElementById('game2-msg-content');

            msgDiv.classList.remove('hidden');
            if (win) {
                title.textContent = "恭喜過關！";
                title.style.color = "#4CAF50";
                content.textContent = `完成了飛花令！得分：${this.score}`;
            } else {
                title.textContent = "遊戲結束";
                title.style.color = "#f44336";
                content.textContent = reason || "再接再厲！";
            }
        }
    };

    window.Game2 = Game2;

    // 自動檢查是否需要啟動
    if (window.location.search.includes('game=2')) {
        setTimeout(() => {
            window.Game2.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 300);
    }
})();
