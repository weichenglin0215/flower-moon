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
        //timeLimit: 時間限制
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount: 最大錯誤次數
        //answerAtLine: 答案出現在第幾行，0=第一行或第二行，1=第一行，2=第二行，3=第一行和第二行
        //maxMaskCount: 最多遮罩數量
        //maxAddDecoyChars: 最多干擾字數量
        //showDelay: 顯示延遲時間
        //singleCharReaction: 單字反應對錯，true=單字反應對錯，false=整句反應對錯
        difficultySettings: {
            '小學': { timeLimit: 20, poemMinRating: 6, maxMistakeCount: 4, answerAtLine: 2, maxMaskCount: 3, maxAddDecoyChars: 6, showDelay: 0, singleCharReaction: true },
            '中學': { timeLimit: 40, poemMinRating: 5, maxMistakeCount: 5, answerAtLine: 2, maxMaskCount: 5, maxAddDecoyChars: 8, showDelay: 20, singleCharReaction: true },
            '高中': { timeLimit: 60, poemMinRating: 4, maxMistakeCount: 6, answerAtLine: 0, maxMaskCount: 7, maxAddDecoyChars: 12, showDelay: 30, singleCharReaction: false },
            //'大學': { timeLimit: 80, poemMinRating: 4, maxMistakeCount: 7, answerAtLine: 1, maxMaskCount: 10, maxAddDecoyChars: 15, showDelay: 10, singleCharReaction: false },
            //'研究所': { timeLimit: 100, poemMinRating: 3, maxMistakeCount: 8, answerAtLine: 3, maxMaskCount: 14, maxAddDecoyChars: 20, showDelay: 12, singleCharReaction: false }
            '大學': { timeLimit: 160, poemMinRating: 4, maxMistakeCount: 7, answerAtLine: 1, maxMaskCount: 10, maxAddDecoyChars: 15, showDelay: 200, singleCharReaction: false },
            '研究所': { timeLimit: 200, poemMinRating: 3, maxMistakeCount: 8, answerAtLine: 3, maxMaskCount: 14, maxAddDecoyChars: 20, showDelay: 200, singleCharReaction: false }
        },

        // 常用字庫已移至 script.js 的 window.SharedDecoy 中

        loadCSS: function () {
            if (!document.getElementById('game4-css')) {
                const link = document.createElement('link');
                link.id = 'game4-css';
                link.rel = 'stylesheet';
                link.href = 'game4.css';
                document.head.appendChild(link);
            }
        },

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

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game4-container';
            //檢查responsive.css是否有包括game4 - overlay.aspect - 5 - 8
            div.className = 'game4-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <!-- <div class="debug-frame"></div> -->
                <div class="game4-header">
                    <div class="game4-score-board">分數: <span id="game4-score">0</span></div>
                    <div class="game4-controls">
                        <button class="game4-difficulty-tag" id="game4-diff-tag">小學</button>
                        <button id="game4-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game4-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game4-sub-header">
                    <div id="game4-hearts" class="hearts"></div>
                </div>
                <div id="game4-area" class="game4-area">
                    <div id="game4-question" class="game4-question-area">
                        <div id="game4-line1" class="poem-lines"></div>
                        <div id="game4-line2" class="poem-lines"></div>
                        <div id="game4-info" class="poem-info"></div>
                    </div>
                    <div class="game4-answer-section">
                        <div id="game4-grid-container" class="grid-container">
                            <svg id="game4-timer-ring">
                                <rect id="game4-timer-path" x="3" y="3"></rect>
                            </svg>
                            <div class="answer-grid" id="game4-grid"></div>
                        </div>
                    </div>
                </div>
                <div id="game4-message" class="game4-message hidden">
                    <h2 id="game4-msg-title">遊戲結束</h2>
                    <p id="game4-msg-content"></p>
                    <button id="game4-msg-btn" class="nav-btn">勸君更進一杯酒</button>
                </div>
            `;
            document.body.appendChild(div);
            document.getElementById('game4-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game4-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game4-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game4-message').classList.add('hidden');
                if (this.isWin) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            this.renderHearts();
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game4-message').classList.add('hidden');
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
                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.startNewGame();
                });
            } else {
                console.warn('[Game4] DifficultySelector not found');
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game4-diff-tag');
            const retryBtn = document.getElementById('game4-retryGame-btn');
            const newBtn = document.getElementById('game4-newGame-btn');
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

        maskOtherContents: function () {
            ['cardContainer', 'game1-container', 'game2-container', 'game3-container'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        showOtherContents: function () {
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

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
            document.getElementById('game4-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.timeLimit;
            this.timeLimit = settings.timeLimit;

            this.renderQuestion();
            this.renderGrid(true); // 使用舊有的 gridChars
            this.startTimer();

            // 處理完整句子的延遲顯示
            this.cluesRevealed = settings.showDelay === 0;
            if (this.showTimeout) clearTimeout(this.showTimeout);
            if (settings.showDelay > 0) {
                this.showTimeout = setTimeout(() => {
                    this.cluesRevealed = true;
                    const hiddenLines = document.querySelectorAll('.poem-lines.game4-hidden-line');
                    hiddenLines.forEach(line => line.classList.add('revealed'));
                }, settings.showDelay * 1000);
            }
            // 啟用重來按鈕
            document.getElementById('game4-retryGame-btn').disabled = false;
            document.getElementById('game4-newGame-btn').disabled = false;
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
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            this.userInputs = [];
            this.evaluationResult = null;
            document.getElementById('game4-score').textContent = this.score;
            document.getElementById('game4-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.timeLimit;
            this.timeLimit = settings.timeLimit;

            if (this.selectRandomPoem()) {
                this.renderQuestion();
                this.renderGrid(false); // 生成新的 gridChars
                this.startTimer();

                this.cluesRevealed = settings.showDelay === 0;
                if (this.showTimeout) clearTimeout(this.showTimeout);
                if (settings.showDelay > 0) {
                    this.showTimeout = setTimeout(() => {
                        this.cluesRevealed = true;
                        const hiddenLines = document.querySelectorAll('.poem-lines.game4-hidden-line');
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
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

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

        renderQuestion: function () {
            const l1 = document.getElementById('game4-line1');
            const l2 = document.getElementById('game4-line2');
            const info = document.getElementById('game4-info');
            const settings = this.difficultySettings[this.difficulty];

            const renderText = (lineText, lineNum) => {
                let html = "";
                // 找出該行被隱藏的索引
                const lineHiddens = this.hiddenPositions.filter(p => p.line === lineNum);

                // 如果該行完全沒有隱藏字(題目句)，則增加 game4-hidden-line class
                const isFullLine = lineHiddens.length === 0;
                const lineEl = lineNum === 1 ? l1 : l2;
                lineEl.className = 'poem-lines';
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

            //info.innerHTML = `<span style="cursor: pointer; text-decoration: underline; opacity: 0.8;">${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}</span>`;
            info.innerHTML = `<span style="cursor: pointer; text-decoration: underline; opacity: 0.8;">
                                ${this.currentPoem.title.length > 12 ? this.currentPoem.title.slice(0, 10)
                    + "..." : this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}
                            </span>`;

            info.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
        },

        renderGrid: function (isRetry = false) {
            const container = document.getElementById('game4-grid');
            const gridConfigs = {
                '小學': { total: 9, cols: 3 },
                '中學': { total: 12, cols: 4 },
                '高中': { total: 20, cols: 5 },
                //'大學': { total: 20, cols: 5 },
                //'研究所': { total: 25, cols: 5 }
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

            allChars.forEach(char => {
                const btn = document.createElement('button');
                btn.className = 'ans-btn';
                //難度是"大學"或"研究所"設定按鍵的間距
                if (this.difficulty === '大學' || this.difficulty === '研究所') {
                    btn.style.width = '3rem';
                    btn.style.height = '3rem';
                    btn.style.margin = '0.2rem';
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
                            if (window.SoundManager.playClick) window.SoundManager.playClick();
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

        handleInput: function (char, btn) {
            if (!this.isActive) return;
            if (btn.classList.contains('disabled')) return;

            const settings = this.difficultySettings[this.difficulty];

            if (!settings.singleCharReaction) {
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
                        this.score += 10 * this.userInputs.length;
                        document.getElementById('game4-score').textContent = this.score;
                        if (window.SoundManager) window.SoundManager.playSuccess();
                        this.gameWin();
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
                            }, 1500);
                        }
                    }
                }
                return;
            }

            const target = this.hiddenPositions[this.currentInputIndex];
            if (char === target.char) {
                btn.classList.add('correct', 'disabled');
                this.score += 10;
                document.getElementById('game4-score').textContent = this.score;
                this.currentInputIndex++;
                this.renderQuestion();

                if (this.currentInputIndex === this.hiddenPositions.length) {
                    this.gameWin();
                }
            } else {
                this.mistakeCount++;
                this.updateHearts();

                const isEasyMode = (this.difficulty === '小學' || this.difficulty === '中學');
                // Check if the character is in the list of hidden characters (part of the answer)
                const isSolutionChar = this.hiddenPositions.some(h => h.char === char);

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

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game4-timer-path');
            const container = document.getElementById('game4-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game4-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            rect.setAttribute('width', Math.max(0, w - 6));
            rect.setAttribute('height', Math.max(0, h - 6));

            const perimeter = (Math.max(0, w - 6) + Math.max(0, h - 6)) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - ratio);
        },

        renderHearts: function () {
            const container = document.getElementById('game4-hearts');
            if (!container) return;
            container.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game4-hearts .heart');
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

        gameWin: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.showTimeout) clearTimeout(this.showTimeout);
            document.getElementById('game4-retryGame-btn').disabled = true;// 必須在得分表演之前就先禁用重來按鈕
            document.getElementById('game4-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕
            // 立即顯示隱藏的題目內容
            this.isRevealed = true;
            this.cluesRevealed = true;
            this.renderQuestion();

            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game4',
                timerContainerId: 'game4-grid-container',
                scoreElementId: 'game4-score',
                heartsSelector: '#game4-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.gameOver(true, finalScore);
                }
            });
        },



        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game4-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game4-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game4-retryGame-btn').disabled = false;
                document.getElementById('game4-newGame-btn').disabled = false;
            }
            clearInterval(this.timerInterval);
            if (this.showTimeout) clearTimeout(this.showTimeout);
            if (win) {
                this.isRevealed = true;
            }
            this.renderQuestion();

            const msgDiv = document.getElementById('game4-message');
            const title = document.getElementById('game4-msg-title');
            const content = document.getElementById('game4-msg-content');

            setTimeout(() => {
                msgDiv.classList.remove('hidden');
                if (win) {
                    title.textContent = "尋覓成功！";
                    title.style.color = "#2ecc71";
                    content.textContent = `得分：${reason}`;
                } else {
                    title.textContent = "功敗垂成";
                    title.style.color = "#ff4757";
                    content.textContent = reason || "再試一次吧！";
                }
                const msgBtn = document.getElementById('game4-msg-btn');
                if (win) {
                    if (this.isLevelMode) {
                        msgBtn.textContent = "下一關";
                        if (window.ScoreManager) {
                            window.ScoreManager.completeLevel('game4', this.difficulty, this.currentLevelIndex);
                        }
                    } else {
                        msgBtn.textContent = "下一局";
                    }
                } else {
                    msgBtn.textContent = "再試一次";
                }
            }, 500);
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
