(function () {
    const Game2 = {
        isActive: false,
        difficulty: '幼稚園',
        selectedKeyword: '花',
        keywords: ['花', '月', '清', '春', '酒', '愛', '恨', '雲', '雨', '山', '水', '夢'],

        // 遊戲狀態
        currentPoem: null,
        hiddenIndices: [], // 在目標行中被隱藏的字符索引
        currentInputIndex: 0, // 當前玩家正在輸入 hiddenIndices 中的第幾個
        timer: 40,
        timeLeft: 40,
        timerInterval: null,

        difficultySettings: {
            '幼稚園': { grid: [3, 3], time: 40, minRating: 3 },
            '小學': { grid: [4, 3], time: 30, minRating: 3 },
            '中學': { grid: [4, 4], time: 25, minRating: 2 },
            '大學': { grid: [5, 4], time: 20, minRating: 1 },
            '研究所': { grid: [5, 4], time: 10, minRating: 0 }
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
            this.showDifficultySelector();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game2-container';
            div.className = 'game-overlay hidden';
            div.innerHTML = `
                <div class="game-header">
                    <button id="game2-restart-btn" class="nav-btn">重新開始</button>
                    <button id="game2-close-btn" class="nav-btn">離開</button>
                </div>
                <div class="keyword-selector" id="game2-keywords">
                    <!-- 主字按鈕將在此生成 -->
                </div>
                <div class="question-area" id="game2-question">
                    <div id="game2-line1" class="poem-line"></div>
                    <div id="game2-line2" class="poem-line"></div>
                    <div class="poem-info" id="game2-info"></div>
                </div>
                <div class="answer-section">
                    <div class="grid-container" id="game2-grid-container">
                        <svg id="timer-ring">
                            <rect id="timer-path" x="4" y="4"></rect>
                        </svg>
                        <div class="answer-grid" id="game2-grid"></div>
                    </div>
                </div>
                
                <div id="game2-difficulty-selector" class="game-message">
                    <h2 style="color:#f0e6d2">請選擇難度</h2>
                    <div class="difficulty-buttons">
                        <button class="diff-btn" data-level="幼稚園">幼稚園</button>
                        <button class="diff-btn" data-level="小學">小學</button>
                        <button class="diff-btn" data-level="中學">中學</button>
                        <button class="diff-btn" data-level="大學">大學</button>
                        <button class="diff-btn" data-level="研究所">研究所</button>
                    </div>
                </div>

                <div id="game2-result" class="game-message hidden">
                    <h2 id="game2-res-title"></h2>
                    <p id="game2-res-content" style="color:#f0e6d2"></p>
                    <button id="game2-res-btn" class="nav-btn" style="margin-top:20px">再來一局</button>
                </div>
            `;
            document.body.appendChild(div);

            // 綁定事件
            document.getElementById('game2-close-btn').addEventListener('click', () => this.hide());
            document.getElementById('game2-restart-btn').addEventListener('click', () => this.restartGame());
            document.getElementById('game2-res-btn').addEventListener('click', () => {
                document.getElementById('game2-result').classList.add('hidden');
                this.showDifficultySelector();
            });

            // 難度選擇
            const diffBtns = div.querySelectorAll('#game2-difficulty-selector .diff-btn');
            diffBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.difficulty = e.target.getAttribute('data-level');
                    document.getElementById('game2-difficulty-selector').classList.add('hidden');
                    this.startGame();
                });
            });

            // 初始化主字按鈕
            this.renderKeywords();
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
            this.container.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        },

        hide: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.container.classList.add('hidden');
            document.body.style.overflow = '';
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game2-difficulty-selector').classList.remove('hidden');
            document.getElementById('game2-result').classList.add('hidden');
        },

        startGame: function () {
            this.isActive = true;
            this.currentInputIndex = 0;
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

        restartGame: function () {
            this.startGame();
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

            this.currentPoem = poem;

            // 決定隱藏哪些字
            // 隱藏包含關鍵字的那個字，再加上隨機 1-2 個字 (視難度)
            const targetLine = this.answerLine === 1 ? this.line1 : this.line2;
            const chars = targetLine.replace(/[，。？！、：；「」『』]/g, '').split('');
            const cleanLine = targetLine.replace(/[，。？！、：；「」『』]/g, '');

            const indices = [];
            // 找出所有 關鍵字 的位置
            for (let i = 0; i < cleanLine.length; i++) {
                if (cleanLine[i] === this.selectedKeyword) indices.push(i);
            }

            // 隨機加幾個
            const numExtra = this.difficulty === '幼稚園' ? 0 :
                this.difficulty === '小學' ? 1 :
                    this.difficulty === '中學' ? 2 : 3;

            const available = [];
            for (let i = 0; i < cleanLine.length; i++) {
                if (!indices.includes(i)) available.push(i);
            }

            // 洗牌 available 取前 numExtra 個
            available.sort(() => Math.random() - 0.5);
            for (let i = 0; i < Math.min(numExtra, available.length); i++) {
                indices.push(available[i]);
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
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.currentInputIndex === this.targetChars.length) {
                    this.gameOver(true);
                }
            } else {
                // 答錯
                //btn.classList.add('wrong', 'disabled');
                btn.classList.add('wrong');
                setTimeout(() => btn.classList.remove('wrong'), 400);
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

        gameOver: function (win, reason) {
            this.isActive = false;
            clearInterval(this.timerInterval);

            const resDiv = document.getElementById('game2-result');
            const title = document.getElementById('game2-res-title');
            const content = document.getElementById('game2-res-content');

            resDiv.classList.remove('hidden');
            if (win) {
                title.textContent = "恭喜過關！";
                title.style.color = "#27ae60";
                content.textContent = "您成功填寫了所有缺字。";
            } else {
                title.textContent = "遊戲結束";
                title.style.color = "#c0392b";
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
