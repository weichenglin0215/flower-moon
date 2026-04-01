
(function () {
    // 遊戲狀態
    const Game3 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        speed: 0.1, // 初始速度 (rem/幀)
        baseSpeed: 0.06,//初始速度
        incrementSpeed: 0.005,//速度增長量
        maxSpeed: 0.2,//最大速度
        rows: [], // 存放行元素的陣列
        currentRowIndex: 0, // 當前需要點擊的行索引
        animationId: null,
        poemChars: [], // 詩詞的所有字
        container: null,
        gameArea: null,
        historyContainer: null,
        historyData: [], // 紀錄每個字的狀態 { char, status, isSep }
        mistakeCount: 0,//錯誤次數
        updateLayoutMetrics: function () { }, // deprecated
        // 按鈕高度 CSS 定義為 3.5rem，垂直間距固定為 0.8rem
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
            '小學': { poemMinRating: 6, maxMistakeCount: 10, sentenceMinRating: 5, minOptions: 1, maxOptions: 2, isStrictOrder: false, incrementSpeed: 0.003, maxSpeed: 0.07 },
            '中學': { poemMinRating: 5, maxMistakeCount: 9, sentenceMinRating: 3, minOptions: 1, maxOptions: 3, isStrictOrder: false, incrementSpeed: 0.004, maxSpeed: 0.09 },
            '高中': { poemMinRating: 4, maxMistakeCount: 8, sentenceMinRating: 2, minOptions: 2, maxOptions: 3, isStrictOrder: false, incrementSpeed: 0.005, maxSpeed: 0.11 },
            '大學': { poemMinRating: 3, maxMistakeCount: 7, sentenceMinRating: 1, minOptions: 3, maxOptions: 4, isStrictOrder: true, incrementSpeed: 0.006, maxSpeed: 0.13 },
            '研究所': { poemMinRating: 3, maxMistakeCount: 6, sentenceMinRating: 1, minOptions: 3, maxOptions: 5, isStrictOrder: true, incrementSpeed: 0.008, maxSpeed: 0.15 }
        },

        loadCSS: function () {
            if (!document.getElementById('game3-css')) {
                const link = document.createElement('link');
                link.id = 'game3-css';
                link.rel = 'stylesheet';
                link.href = 'game3.css';
                document.head.appendChild(link);
            }
        },

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

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game3-container';
            //檢查responsive.css是否有包括game3 - overlay.aspect - 5 - 8
            div.className = 'game3-overlay aspect-5-8 hidden';
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

            this.renderHearts();
        },

        show: function () {
            this.init(); // 確保 DOM 存在

            // 显示难度选择器
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.gameArea.innerHTML = '';
            if (window.GameMessage) window.GameMessage.hide();

            // 隐藏主页和其他游戏
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
                        window.updateResponsiveLayout();
                    }
                    this.startNewGame();
                });
            } else {
                console.warn('[Game3] DifficultySelector not found');
            }
        },

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
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
        },

        hideOtherContents: function () {
            // 隐藏主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隐藏其他遊戲
            const game1 = document.getElementById('game1-container');
            const game2 = document.getElementById('game2-container');
            if (game1) game1.classList.add('hidden');
            if (game2) game2.classList.add('hidden');
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
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            // 恢復其他內容
            this.showOtherContents();
        },

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem || this.rows.length === 0) return;
            this.isActive = true;
            this.score = 0;
            this.speed = this.baseSpeed + this.difficultySettings[this.difficulty].incrementSpeed;
            this.maxSpeed = this.difficultySettings[this.difficulty].maxSpeed;
            this.currentRowIndex = 0;
            this.mistakeCount = 0;
            document.getElementById('game3-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            if (this.historyContainer) this.historyContainer.style.display = '';
            this.renderHearts();

            // 重置歷史紀錄狀態
            this.historyData.forEach(item => {
                item.status = 'hidden';
            });
            this.renderHistory();

            // 重置每一行的狀態與位置
            this.rows.forEach(row => {
                row.clicked = false;
                row.y = row.originalY;
                row.element.style.transform = `translateY(${row.y}rem)`;
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
            document.getElementById('game3-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            if (this.historyContainer) this.historyContainer.style.display = '';
            this.renderHearts();

            this.gameArea.innerHTML = '';
            this.selectAndPreparePoem();

            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.loop();
            // 啟用按鈕
            document.getElementById('game3-retryGame-btn').disabled = false;
            document.getElementById('game3-newGame-btn').disabled = false;
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        selectAndPreparePoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) {
                alert('找不到詩詞資料');
                return;
            }

            const setting = this.difficultySettings[this.difficulty];
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

            const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            const gameAreaHeightPx = this.gameArea.offsetHeight || (rootFontSize * 35);
            const gameAreaHeightRem = gameAreaHeightPx / rootFontSize;

            this.gameAreaHeightRem = gameAreaHeightRem;
            let currentY = gameAreaHeightRem;

            chars.forEach((char, index) => {
                const isNewSentence = firstIndices.has(index);
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
                    numOptions = Math.floor(Math.random() * (maxO - minO + 1)) + minO;
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

        createRow: function (correctChar, index, numOptions, startY, decoyPool) {
            const rowEl = document.createElement('div');
            rowEl.className = 'ladder-row';
            rowEl.style.transform = `translateY(${startY}rem)`;

            let options = [correctChar];

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
                btn.addEventListener('click', (e) => this.handleBtnClick(e, char, index, rowEl));
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

        handleBtnClick: function (e, char, rowIndex, rowEl) {
            if (!this.isActive) return;

            const setting = this.difficultySettings[this.difficulty];
            const clickedRow = this.rows[rowIndex];

            if (clickedRow.clicked) return;
            if (setting.isStrictOrder && rowIndex !== this.currentRowIndex) {
                return;
            }

            if (char === clickedRow.correctChar) {
                if (window.SoundManager) window.SoundManager.playSuccessShort();
                e.target.classList.add('correct');
                this.score += 5;
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
                if (window.SoundManager) window.SoundManager.playFailure();
                e.target.classList.add('wrong');
                e.target.disabled = true;
                this.mistakeCount += 1;
                this.updateHearts();

                if (this.mistakeCount >= setting.maxMistakeCount) {
                    this.gameOver(false, `失誤 ${this.mistakeCount} 次`);
                    return;
                }

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

            this.rows.forEach(row => {
                row.y -= this.speed;
                row.element.style.transform = `translateY(${row.y}rem)`;

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

                const visibleThreshold = this.gameAreaHeightRem || 30;
                if (row.y < visibleThreshold && !row.clicked) {
                    this.updateHistoryStatus(row.index, 'waiting');
                }
            });

            this.renderHistory();
            this.animationId = requestAnimationFrame(() => this.loop());
        },

        updateHistoryStatus: function (charIndex, status) {
            let realIdx = 0;
            for (let i = 0; i < this.historyData.length; i++) {
                if (!this.historyData[i].isSep) {
                    if (realIdx === charIndex) {
                        const currentStatus = this.historyData[i].status;
                        if (currentStatus === 'correct' || currentStatus === 'wrong') return;
                        if (currentStatus === 'wrong_attempt' && status === 'waiting') return;
                        this.historyData[i].status = status;
                        return;
                    }
                    realIdx++;
                }
            }
        },

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

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
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
                    <div class="game3-result-poem-info" style="text-align: center; margin-bottom: 0.2rem;">
                        <h3 style="margin: 0; color: #333; font-size: 1.2rem; cursor: pointer; text-decoration: underline;"
                            onclick="if(window.openPoemDialogById) window.openPoemDialogById('${this.currentPoem.id}')">
                            ${this.currentPoem.title}
                        </h3>
                        <p style="margin: 0.1rem 0; color: #666; font-size: 1rem;">${this.currentPoem.dynasty} · ${this.currentPoem.author}</p>
                    </div>
                    <div class="game3-result-content" style="background: rgba(255,255,255,0.5); padding: 0.5rem; border-radius: 0.5rem;">
                `;

                let currentLine = '';
                this.historyData.forEach(item => {
                    if (item.isSep) {
                        resultHtml += `<div style="margin-bottom: 0.3rem;">${currentLine}${item.char}</div>`;
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

        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${newSize}rem`;
            } else {
                element.style.fontSize = `${baseFontSizeRem}rem`;
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
