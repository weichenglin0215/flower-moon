(function () {
    // 遊戲一：慢思快選 (Slow Thought, Fast Choice)
    const Game1 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        timer: 10,
        maxTimer: 10, // 每轮的最大时间（根据难度设置）
        timerInterval: null,
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 3,
        currentPoem: null,
        correctAnswer: "",
        options: [],

        container: null,
        game1Area: null,
        timerBar: null,
        timerText: null,


        // 难度设置
        //timeLimit: 時間限制
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount: 最大錯誤次數
        //answerAtLine: 答案出現在第幾行，0=第一行或第二行，1=第一行，2=第二行，3=第一行和第二行
        //minMaskCount: 最少遮罩數量
        //maxMaskCount: 最多遮罩數量
        difficultySettings: {
            '小學': { timeLimit: 30, poemMinRating: 6, maxMistakeCount: 4, answerAtLine: 2, minMaskCount: 1, maxMaskCount: 1 },
            '中學': { timeLimit: 25, poemMinRating: 5, maxMistakeCount: 3, answerAtLine: 0, minMaskCount: 2, maxMaskCount: 3 },
            '高中': { timeLimit: 20, poemMinRating: 4, maxMistakeCount: 2, answerAtLine: 0, minMaskCount: 3, maxMaskCount: 5 },
            '大學': { timeLimit: 15, poemMinRating: 3, maxMistakeCount: 2, answerAtLine: 1, minMaskCount: 4, maxMaskCount: 6 },
            '研究所': { timeLimit: 10, poemMinRating: 2, maxMistakeCount: 1, answerAtLine: 1, minMaskCount: 8, maxMaskCount: 10 }
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
            document.getElementById('game1-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame(); // 重來：保留題目
            };
            document.getElementById('game1-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame(); // 開新局：換新題目
            };
            document.getElementById('game1-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game1-container';
            //檢查responsive.css是否有包括game1 - overlay.aspect - 5 - 8
            div.className = 'game1-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <!-- <div class="debug-frame"></div> -->
                
                <div class="game1-header">
                    <div class="game1-score-board">分數: <span id="game1-score">0</span></div>
                    <div class="game1-controls">
                        <button class="game1-difficulty-tag" id="game1-diff-tag">小學</button>
                        <button id="game1-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game1-newGame-btn" class="nav-btn">開新局</button>
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
            </div>
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
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            // 隐藏主页和其他游戏
            this.hideOtherContents();
            // 顯示難度選擇器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('慢思快選', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    const settings = this.difficultySettings[selectedLevel];
                    this.maxTimer = settings.timeLimit; // 设置最大时间
                    this.timer = settings.timeLimit;
                    this.maxMistakeCount = settings.maxMistakeCount;

                    this.updateUIForMode();

                    // 顯示遊戲容器
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    // 觸發響應式佈局更新
                    if (window.updateResponsiveLayout) {
                        window.updateResponsiveLayout();
                    }
                    this.startNewGame();
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
                this.startNewGame();
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game1-diff-tag');
            const retryBtn = document.getElementById('game1-retryGame-btn');
            const newBtn = document.getElementById('game1-newGame-btn');
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

        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.renderHearts();
            document.getElementById('game1-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();


            // 重新渲染當前題目 (不重新準備)
            this.renderChallenge();
            // 重設計時器
            this.startTimer();
            // 啟用重來按鈕
            document.getElementById('game1-retryGame-btn').disabled = false;
            document.getElementById('game1-newGame-btn').disabled = false;
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
            this.renderHearts();
            document.getElementById('game1-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();


            // 準備新題目並開始
            this.prepareChallenge();
            this.startTimer();
            // 啟用按鈕
            document.getElementById('game1-retryGame-btn').disabled = false;
            document.getElementById('game1-newGame-btn').disabled = false;
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
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

            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.poemMinRating || 4;

            // 使用全域共用邏輯取得隨機詩詞 (要求至少            // 傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating || 4,
                2, 2, 8, 30, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game1'
            );
            if (!result) {
                alert('找不到符合評分的詩詞。');
                return;
            }
            this.currentPoem = result.poem;
            const content = result.poem.content;
            const startIdx = result.startIndex;
            let line1 = content[startIdx];
            let line2 = content[startIdx + 1];

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
            const getMaskIndices = (text, min, max) => {
                const chars = text.split('');
                let validIndices = [];
                chars.forEach((c, i) => {
                    if (!/[，。？！、：；]/.test(c)) validIndices.push(i);
                });

                //const maxPossible = Math.max(1, validIndices.length - 1); //原先作法至少會留一個字不遮罩，現已取消
                const maxPossible = validIndices.length;
                const actualMin = Math.min(maxPossible, Math.max(1, min));
                const actualMax = Math.min(maxPossible, Math.max(actualMin, max));
                const maskCount = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;

                let maskedIndices = [];
                while (maskedIndices.length < maskCount) {
                    let r = validIndices[Math.floor(Math.random() * validIndices.length)];
                    if (!maskedIndices.includes(r)) maskedIndices.push(r);
                }
                return maskedIndices;
            };

            this.maskedIndices = getMaskIndices(this.correctAnswer, settings.minMaskCount, settings.maxMaskCount);
            // 純文字版 (供產生成選項邏輯使用)
            this.maskedLinePlain = this.correctAnswer.split('').map((c, i) => this.maskedIndices.includes(i) ? "◎" : c).join('');
            // HTML 版 (供題目顯示使用)
            this.maskedLineHTML = this.correctAnswer.split('').map((c, i) => this.maskedIndices.includes(i) ? `<span class="hidden-char">◎</span>` : c).join('');

            this.displayedLine = displayedLine;
            this.hideFirst = hideFirst;

            // 生成選項數據 - 使用純文字版計算
            this.generateOptionsData(this.correctAnswer, this.maskedLinePlain);

            // 渲染 UI
            this.renderChallenge();
        },

        renderChallenge: function () {
            const qDiv = document.getElementById('game1-question-lines');
            qDiv.innerHTML = '';

            const l1Text = this.hideFirst ? this.maskedLineHTML : this.displayedLine;
            const l2Text = this.hideFirst ? this.displayedLine : this.maskedLineHTML;

            const l1Div = document.createElement('div');
            l1Div.className = 'poem-lines';
            // 動態縮小字體 (需過濾掉 HTML 標籤)
            const l1Len = l1Text.replace(/<[^>]*>/g, '').length;
            this.adjustFontSize(l1Div, l1Len, 7, 2.5);
            l1Div.innerHTML = l1Text;
            qDiv.appendChild(l1Div);

            const l2Div = document.createElement('div');
            l2Div.className = 'poem-lines';
            // 動態縮小字體 (需過濾掉 HTML 標籤)
            const l2Len = l2Text.replace(/<[^>]*>/g, '').length;
            this.adjustFontSize(l2Div, l2Len, 7, 2.5);
            l2Div.innerHTML = l2Text;
            qDiv.appendChild(l2Div);

            //詩詞名稱只能顯示前12個字
            let title = this.currentPoem.title;
            if (title.length > 12) {
                title = title.substring(0, 10) + "...";
            }
            const infoText = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            const infoEl = document.getElementById('game1-poem-info');
            infoEl.textContent = infoText;
            infoEl.dataset.poemId = this.currentPoem.id;
            //this.adjustFontSize(infoEl, infoText.length, 20, 1.0); //取消，若詩詞資料過長，改以刪減詩詞名稱字數替代

            // 渲染選項
            this.renderOptions();
        },

        generateOptionsData: function (correct, masked) {
            const correctClean = correct.replace(/[，。？！、：；]/g, '');
            const lineLen = correctClean.length;
            const poemType = this.currentPoem.type || "";

            // 取得遮罩模式
            const getMaskPattern = (original, maskedText) => {
                let p = [];
                for (let i = 0; i < original.length; i++) {
                    p.push(maskedText[i] === "◎");
                }
                return p;
            };
            const pattern = getMaskPattern(correct, masked);

            // 選取顯示反向遮罩的字
            const applyOptionMask = (targetLine, isCorrect = false) => {
                const targetClean = targetLine.replace(/[，。？！、：；]/g, '');
                const correctStructure = correct;

                let result = "";
                let cleanIdx = 0;
                for (let i = 0; i < correctStructure.length; i++) {
                    const isPunct = /[，。？！、：；]/.test(correctStructure[i]);
                    if (isPunct) {
                        result += correctStructure[i];
                    } else if (cleanIdx < targetClean.length) {
                        result += pattern[i] ? targetClean[cleanIdx] : "◎";
                        cleanIdx++;
                    }
                }
                return result;
            };

            const correctText = applyOptionMask(correct, true);
            let finalOptions = [{ text: correctText, isCorrect: true }];
            let usedLines = [correct];
            let usedTexts = new Set([correctText]);

            // 使用 SharedDecoy 產生相似句子
            if (window.SharedDecoy) {
                const targetChars = correctClean.split('');
                const minRating = this.difficultySettings[this.difficulty].poemMinRating || 4;
                const distractorPool = window.SharedDecoy.getDecoyChars(targetChars, 20, [], minRating);

                // 嘗試從 POEMS 中尋找相似句
                let candidates = [];
                const searchPool = POEMS.filter(p => (p.rating || 0) >= minRating && p.id !== this.currentPoem.id);

                for (const p of searchPool) {
                    for (const line of p.content) {
                        const clean = line.replace(/[，。？！、：；]/g, '');
                        if (clean.length === lineLen && !usedLines.includes(line)) {
                            // 計算相似度
                            let similarity = 0;
                            for (const char of clean) {
                                if (distractorPool.includes(char)) similarity++;
                                if (targetChars.includes(char)) similarity += 2;
                            }
                            if (similarity > 0) {
                                candidates.push({ line, similarity });
                            }
                        }
                    }
                }

                // 優先選擇相似度高的句子
                candidates.sort((a, b) => b.similarity - a.similarity);

                for (let i = 0; i < candidates.length; i++) {
                    if (finalOptions.length >= 4) break;
                    const decoyLine = candidates[i].line;
                    const maskedText = applyOptionMask(decoyLine);
                    if (!usedTexts.has(maskedText)) {
                        finalOptions.push({ text: maskedText, isCorrect: false });
                        usedLines.push(decoyLine);
                        usedTexts.add(maskedText);
                    }
                }
            }

            // 如果不夠 4 個，補充隨機項
            let attempts = 0;
            while (finalOptions.length < 4 && attempts < 200) {
                attempts++;
                const rndPoem = POEMS[Math.floor(Math.random() * POEMS.length)];
                if (!rndPoem || !rndPoem.content) continue;
                const rndLine = rndPoem.content[Math.floor(Math.random() * rndPoem.content.length)];
                const clean = rndLine.replace(/[，。？！、：；]/g, '');

                // 嘗試找長度相同且未被選中的句子
                if ((clean.length === lineLen || attempts > 150) && !usedLines.includes(rndLine)) {
                    const maskedText = applyOptionMask(rndLine);
                    if (!usedTexts.has(maskedText)) {
                        finalOptions.push({ text: maskedText, isCorrect: false });
                        usedLines.push(rndLine);
                        usedTexts.add(maskedText);
                    }
                }
            }

            // 洗牌
            finalOptions.sort(() => Math.random() - 0.5);
            this.currentOptions = finalOptions;
        },

        renderOptions: function () {
            // 渲染
            const optDiv = document.getElementById('game1-answer-grid');
            optDiv.innerHTML = '';

            // 每次生成選項時重置 SVG 大小
            setTimeout(() => this.updateTimerRing(1), 0);

            this.currentOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'game1-option-btn';
                btn.textContent = opt.text;
                // 動態縮小字體
                this.adjustFontSize(btn, opt.text.length, 7, 2.0);
                btn.dataset.isCorrect = opt.isCorrect; // 標記是否正確
                btn.addEventListener('click', () => {
                    if (window.SoundManager) {
                        if (opt.isCorrect) window.SoundManager.playSuccess();
                        else window.SoundManager.playFailure();
                    }
                    this.handleChoice(opt.isCorrect, btn);
                });
                optDiv.appendChild(btn);
            });
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    clearInterval(this.timerInterval);
                    this.mistakeCount++;
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

            // 邊框預留 (stroke-width: 8) -> 0.1rem margin inside
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

                // 答對之後將題目中的 ◎ 改成綠色的正確文字
                const qDiv = document.getElementById('game1-question-lines');
                const lines = qDiv.querySelectorAll('.poem-lines');
                const targetLineIdx = this.hideFirst ? 0 : 1;
                const targetLineEl = lines[targetLineIdx];

                // 直接根據 maskedIndices 重新渲染該行
                targetLineEl.innerHTML = this.correctAnswer.split('').map((c, i) => {
                    if (this.maskedIndices.includes(i)) {
                        return `<span class="correct-char">${c}</span>`;
                    }
                    return c;
                }).join('');

                document.getElementById('game1-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game1-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game1',
                    timerContainerId: 'game1-answer-grid-container',
                    scoreElementId: 'game1-score',
                    heartsSelector: '#game1-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                        this.gameOver(true, '');
                    }
                });
            } else {
                if (btn.classList.contains('wrong')) return;
                btn.classList.add('wrong');
                this.mistakeCount++;
                //this.updateLives();
                this.updateHearts();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    clearInterval(this.timerInterval);

                    // 取消揭曉答案：將正確答案以 .hint 顯示
                    this.revealAnswer(false);

                    setTimeout(() => {
                        this.gameOver(false, "失誤過多！");
                    }, 1000);
                }
            }
        },

        updateLives: function () {
            const livesSpan = document.getElementById('game1-lives');
            livesSpan.textContent = "♥".repeat(this.maxMistakeCount - this.mistakeCount) + "♡".repeat(this.mistakeCount);
        },
        renderHearts: function () {
            const hearts = document.getElementById('game1-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.difficultySettings[this.difficulty].maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game1-hearts .heart');
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
                document.getElementById('game1-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game1-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game1-retryGame-btn').disabled = false;
                document.getElementById('game1-newGame-btn').disabled = false;
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
                        score: win ? this.score : 0, // ScoreManager would have updated it, but the local score is fine too
                        reason: win ? "" : reason,
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game1', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game1', this.currentLevelIndex, showMessage);
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

    window.Game1 = Game1;

    // 自動檢查是否需要啟動 (從 URL 參數)
    if (new URLSearchParams(window.location.search).get('game') === '1') {
        setTimeout(() => {
            if (window.Game1) window.Game1.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
