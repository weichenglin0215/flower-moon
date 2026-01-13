(function () {
    // 遊戲一：慢思快選 (Slow Thought, Fast Choice)
    const Game1 = {
        isActive: false,
        difficulty: '小學',
        timer: 10,
        maxTimer: 10, // 每轮的最大时间（根据难度设置）
        timerInterval: null,
        score: 0,
        mistakes: 0,
        maxMistakes: 3,
        currentPoem: null,
        correctAnswer: "",
        options: [],

        container: null,
        game1Area: null,
        timerBar: null,
        timerText: null,

        // 难度设置
        difficultySettings: {
            '小學': { time: 60, minRating: 7, maxMistakes: 4, answerAtLine: 2, minMaskCount: 1, maxMaskCount: 1 },
            '中學': { time: 40, minRating: 6, maxMistakes: 3, answerAtLine: 2, minMaskCount: 2, maxMaskCount: 3 },
            '高中': { time: 20, minRating: 5, maxMistakes: 2, answerAtLine: 0, minMaskCount: 3, maxMaskCount: 4 },
            '大學': { time: 10, minRating: 4, maxMistakes: 2, answerAtLine: 0, minMaskCount: 4, maxMaskCount: 5 },
            '研究所': { time: 6, minRating: 1, maxMistakes: 1, answerAtLine: 0, minMaskCount: 6, maxMaskCount: 7 }
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
            this.game1Area = document.getElementById('game1-area');
            this.container = document.getElementById('game1-container');
            this.game1Area = document.getElementById('game1-area');
            // Old timer references removed

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
            //檢查responsive.css是否有包括game1 - overlay.aspect - 5 - 8
            div.className = 'game1-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <div class="debug-frame"></div>
                
                <div class="game1-header">
                    <div class="game1-score-board">分數: <span id="game1-score">0</span></div>
                    <div class="game1-controls">
                        <button id="game1-restart-btn" class="nav-btn">重來</button>
                        <button id="game1-close-btn" class="nav-btn close-btn">退出</button>
                    </div>
                </div>
                <div class="game1-sub-header">
                    <div id="game1-hearts" class="hearts"></div>
                </div>
                <div id="game1-area" class="game1-area">
                    <!-- 遊戲內容將在此生成 -->
                    <!-- 問題區域 -->
                    <div class="game1-question-area">
                        <div id="game1-question-lines" class="game1-question-lines">
                            <!-- JS 動態插入 -->
                        </div>
                        <div id="game1-poem-info" class="game1-poem-info">
                            <!-- 詩名/朝代/作者 -->
                        </div>
                    </div>

                    <!-- 答案區域 (含邊框倒數) -->
                    <div class="game1-answer-area">
                        <div id="game1-answer-grid-container" class="game1-answer-grid-container">
                            <svg id="game1-timer-ring">
                                <rect id="game1-timer-path" x="4" y="4"></rect>
                            </svg>
                            <div id="game1-answer-grid" class="game1-answer-grid">
                                <!-- JS 動態插入 -->
                            </div>
                        </div>
                    </div>
                </div>

                <div id="game1-message" class="game1-message hidden">
                    <h2 id="game1-msg-title">時間到！</h2>
                    <p id="game1-msg-content"></p>
                    <button id="game1-msg-btn" class="nav-btn">勸君更進一杯酒</button>
                </div>
            `;
            document.body.appendChild(div);
            document.getElementById('game1-msg-btn').addEventListener('click', () => {
                document.getElementById('game1-message').classList.add('hidden');
                this.restartGame(); // 直接以相同難度開啟下一局
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
            // 顯示難度選擇器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('慢思快選', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    const settings = this.difficultySettings[selectedLevel];
                    this.maxTimer = settings.time; // 设置最大时间
                    this.timer = settings.time;
                    this.maxMistakes = settings.maxMistakes;

                    // 顯示遊戲容器
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    // 觸發響應式佈局更新
                    if (window.updateResponsiveLayout) {
                        window.updateResponsiveLayout();
                    }
                    this.restartGame();
                });
            } else {
                // 降級處理：直接開始遊戲
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
            // 隱藏主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隱藏其他遊戲
            const game2 = document.getElementById('game2-container');
            const game3 = document.getElementById('game3-container');
            if (game2) game2.classList.add('hidden');
            if (game3) game3.classList.add('hidden');
        },

        showOtherContents: function () {
            // 恢復主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            // 恢復其他內容
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

            // 根據難度篩選詩詞
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.minRating;

            // 優先選擇常見詩詞
            const eligiblePoems = POEMS.filter(p =>
                p.content && p.content.length >= 2 && p.type &&
                (p.type.includes('五言') || p.type.includes('七言') || p.type.includes('詞') || p.type.includes('古詩')) &&
                (p.rating || 0) >= minRating
            );

            let poem = eligiblePoems[Math.floor(Math.random() * eligiblePoems.length)];
            this.currentPoem = poem;

            // 隨機選相鄰兩句 (偶數句一對)，即問題和答案
            const numLines = poem.content.length;
            const pairIdx = Math.floor(Math.random() * Math.floor(numLines / 2));
            const startIdx = pairIdx * 2;
            let line1 = poem.content[startIdx];
            let line2 = poem.content[startIdx + 1];

            // 根據 answerAtLine 決定哪一句被部分隱藏
            // 2: 答案在第二行, 1: 答案在第一行, 0: 隨機
            let hideFirst;
            if (settings.answerAtLine === 1) {
                hideFirst = true;
            } else if (settings.answerAtLine === 2) {
                hideFirst = false;
            } else {
                hideFirst = Math.random() < 0.5;
            }

            this.correctAnswer = hideFirst ? line1 : line2;
            const displayedLine = hideFirst ? line2 : line1;

            // 處理隱藏文字 (◎)
            const maskLine = (text, min, max) => {
                const chars = text.split('');
                // 找出非標點的位置
                let validIndices = [];
                chars.forEach((c, i) => {
                    if (!/[，。？！、：；]/.test(c)) validIndices.push(i);
                });

                // 判斷遮蔽數量
                // 限制不能遮蔽全部文字，至少留下一個字
                const maxPossible = Math.max(1, validIndices.length - 1);
                const actualMin = Math.min(maxPossible, Math.max(1, min));
                const actualMax = Math.min(maxPossible, Math.max(actualMin, max));

                const maskCount = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;

                let maskedIndices = [];
                while (maskedIndices.length < maskCount) {
                    let r = validIndices[Math.floor(Math.random() * validIndices.length)];
                    if (!maskedIndices.includes(r)) maskedIndices.push(r);
                }

                return chars.map((c, i) => maskedIndices.includes(i) ? "◎" : c).join('');
            };

            const maskedLineText = maskLine(this.correctAnswer, settings.minMaskCount, settings.maxMaskCount);

            // 更新 UI
            const qDiv = document.getElementById('game1-question-lines');
            qDiv.innerHTML = '';

            const l1Text = hideFirst ? maskedLineText : displayedLine;
            const l2Text = hideFirst ? displayedLine : maskedLineText;

            const l1Div = document.createElement('div');
            l1Div.className = 'poem-lines';
            l1Div.textContent = l1Text;
            qDiv.appendChild(l1Div);

            const l2Div = document.createElement('div');
            l2Div.className = 'poem-lines';
            l2Div.textContent = l2Text;
            qDiv.appendChild(l2Div);

            // 動態縮小字體
            const maxLineLen = Math.max(l1Text.length, l2Text.length);
            this.adjustFontSize(qDiv, maxLineLen, 7, 2.5);

            const infoText = `${poem.title} / ${poem.dynasty} / ${poem.author}`;
            const infoEl = document.getElementById('game1-poem-info');
            infoEl.textContent = infoText;
            infoEl.dataset.poemId = poem.id; // 綁定 ID 以便點擊呼叫 dialog
            this.adjustFontSize(infoEl, infoText.length, 20, 1.0);

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
            const optDiv = document.getElementById('game1-answer-grid');
            optDiv.innerHTML = '';

            // 每次生成選項時重置 SVG 大小
            setTimeout(() => this.updateTimerRing(1), 0);

            finalOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'game1-option-btn';
                btn.textContent = opt.text;
                // 動態縮小字體
                this.adjustFontSize(btn, opt.text.length, 7, 2.0);
                btn.dataset.isCorrect = opt.isCorrect; // 標記是否正確
                btn.addEventListener('click', () => this.handleChoice(opt.isCorrect, btn));
                optDiv.appendChild(btn);
            });
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            const startTime = Date.now();
            const duration = this.maxTimer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const ratio = 1 - (elapsed / duration);

                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    clearInterval(this.timerInterval);
                    this.mistakes++;
                    this.updateHearts();
                    // 揭曉答案
                    this.revealAnswer(false);
                    // 延遲顯示結束
                    setTimeout(() => {
                        this.gameOver(false, "時間到！");
                    }, 1500);
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game1-timer-path');
            const container = document.getElementById('game1-answer-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;

            // 更新 SVG 大小
            const svg = document.getElementById('game1-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            // 邊框預留 (stroke-width: 8) -> 4px margin inside
            // Rect 實際大小
            const rw = w - 8;
            const rh = h - 8;
            if (rw < 0 || rh < 0) return;

            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);

            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - ratio);
        },

        revealAnswer: function (isWin) {
            const btns = document.querySelectorAll('#game1-answer-grid .game1-option-btn');
            btns.forEach(btn => {
                const isCorrect = btn.dataset.isCorrect === 'true';
                if (isCorrect) btn.classList.add('hint');
                btn.disabled = true;
            });
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

                    // 揭曉答案：將正確答案以 .hint 顯示
                    // 揭曉答案
                    this.revealAnswer(false);

                    setTimeout(() => {
                        this.gameOver(false, "正確答案是：" + this.correctAnswer);
                    }, 1000);
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
                title.textContent = "恭喜過關！";
                title.style.color = "#28a745";
                content.textContent = "更上一層樓！";
            } else {
                title.textContent = "再接再厲！";
                title.style.color = "#dc3545";
                content.textContent = reason;
            }
        },

        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${newSize}rem`;
            } else {
                element.style.fontSize = `${baseFontSizeRem}rem`;
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
        }, 50);
    }
})();
