(function () {
    const Game13 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // 遊戲狀態
        currentPoem: null,
        hiddenMeta: [], // { type: 'dynasty'|'author'|'title', value: string, isSolved: boolean }
        hiddenChars: [], // { char: string, posIdx: number, isSolved: boolean }

        candidates: [], // { text: string, type: 'meta'|'char', id: string }
        nextHole: null, // 當前待填寫的空格 { type: 'meta'|'char', index: number }

        timeLimit: 60,
        timeLeft: 60,
        timerInterval: null,

        container: null,
        gameArea: null,

        // 遊戲參數設定
        // timeLimit:遊戲時間(秒), 
        // poemMinRating:詩詞最低評分, 
        // maxMistakeCount:最大錯誤次數, 
        // metaHideCount:隱藏欄位數量, 
        // charHideCount:隱藏字數量, 
        // metaDistractors:每個隱藏欄位額外增加的干擾項, 
        // charDistractors:每個隱藏字額外增加的干擾項
        difficultySettings: {
            '小學': { timeLimit: 30, poemMinRating: 6, maxMistakeCount: 3, metaHideCount: 1, charHideCount: 1, metaDistractors: 2, charDistractors: 5 },
            '中學': { timeLimit: 45, poemMinRating: 5, maxMistakeCount: 4, metaHideCount: 2, charHideCount: 3, metaDistractors: 2, charDistractors: 3 },
            '高中': { timeLimit: 60, poemMinRating: 4, maxMistakeCount: 5, metaHideCount: 3, charHideCount: 5, metaDistractors: 2, charDistractors: 3 },
            '大學': { timeLimit: 80, poemMinRating: 3, maxMistakeCount: 6, metaHideCount: 3, charHideCount: 7, metaDistractors: 2, charDistractors: 2 },
            '研究所': { timeLimit: 100, poemMinRating: 3, maxMistakeCount: 7, metaHideCount: 3, charHideCount: 14, metaDistractors: 2, charDistractors: 1 }
        },

        loadCSS: function () {
            if (!document.getElementById('game13-css')) {
                const link = document.createElement('link');
                link.id = 'game13-css';
                link.rel = 'stylesheet';
                link.href = 'game13.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game13-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game13-container');
            this.gameArea = document.getElementById('game13-area');

            document.getElementById('game13-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game13-container';
            div.className = 'game13-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game13-header">
                    <div class="game13-score-board">分數: <span id="game13-score">0</span></div>
                    <div class="game13-controls">
                        <button class="game13-difficulty-tag" id="game13-diff-tag">小學</button>
                        <button id="game13-retry-btn" class="nav-btn">重來</button>
                        <button id="game13-new-btn" class="nav-btn">新局</button>
                    </div>
                </div>
                <div class="game13-sub-header">
                    <div id="game13-hearts" class="hearts"></div>
                </div>
                <div id="game13-area" class="game13-area">
                    <div id="game13-question" class="game13-question-area">
                        <div class="game13-meta-info" id="game13-meta"></div>
                        <div id="game13-poem-text" class="game13-poem-text">
                            <div id="game13-line1" class="poem-lines"></div>
                            <div id="game13-line2" class="poem-lines"></div>
                        </div>
                    </div>
                    <div class="game13-answer-section">
                        <div class="game13-answer-pool-container" style="position:relative; width:100%;">
                            <svg id="game13-timer-ring">
                                <rect id="game13-timer-path" x="3" y="3"></rect>
                            </svg>
                            <div id="game13-answer-pool" class="game13-answer-pool"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            document.getElementById('game13-retry-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game13-new-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            if (window.MenuManager) window.MenuManager.closeAll();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('人事時地：考驗詩詞背景與記憶', (selectedLevel, levelIndex) => {
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
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game13-diff-tag');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (diffTag) {
                diffTag.textContent = this.isLevelMode ? `挑戰 ${this.currentLevelIndex}` : this.difficulty;
                diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        startNewGame: function () {
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            document.getElementById('game13-score').textContent = this.score;
            this.renderHearts();

            if (this.selectRandomPoem()) {
                this.generateProblem();
                this.renderUI();
                this.startTimer();
            } else {
                alert('載入詩詞失敗');
                this.showDifficultySelector();
            }
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            document.getElementById('game13-score').textContent = this.score;
            this.renderHearts();

            // 重設狀態但不變更題目與選項內容
            this.hiddenMeta.forEach(m => m.isSolved = false);
            this.hiddenChars.forEach(c => c.isSolved = false);
            this.candidates.forEach(cand => cand.isClickedCorrect = false);

            // 隨機打亂按鍵位置
            this.candidates.sort(() => Math.random() - 0.5);

            this.refreshNextHole();
            this.renderUI();
            this.startTimer();
        },

        selectRandomPoem: function () {
            const settings = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(settings.poemMinRating, 2, 2, 10, 40, "", this.isLevelMode ? this.currentLevelIndex : null, 'game13');
            if (!result) return false;
            this.currentPoem = result.poem;
            // 限制詩詞名稱長度為 7 個字
            if (this.currentPoem.title.length > 7) {
                this.currentPoem.title = this.currentPoem.title.substring(0, 7);
            }
            this.lines = result.lines;
            return true;
        },

        generateProblem: function () {
            const settings = this.difficultySettings[this.difficulty];

            // 1. 決定隱藏哪些元數據 (朝代、作者、詩名)
            const metaTypes = ['dynasty', 'author', 'title'];
            const shuffledMeta = metaTypes.sort(() => Math.random() - 0.5);
            const hidMetaCount = Math.min(settings.metaHideCount, metaTypes.length);
            this.hiddenMeta = metaTypes.map(type => {
                const isHidden = shuffledMeta.indexOf(type) < hidMetaCount;
                return { type, value: this.currentPoem[type], isHidden, isSolved: false };
            });

            // 2. 決定隱藏哪些詩句字元
            this.hiddenChars = [];
            let allText = this.lines.join('');
            let charIndices = [];
            for (let i = 0; i < allText.length; i++) charIndices.push(i);

            const shuffledIndices = charIndices.sort(() => Math.random() - 0.5);
            const hidCharCount = Math.min(settings.charHideCount, allText.length);
            const pickedIndices = shuffledIndices.slice(0, hidCharCount).sort((a, b) => a - b);

            this.hiddenChars = pickedIndices.map(idx => ({
                char: allText[idx],
                posIdx: idx,
                isSolved: false
            }));

            // 3. 產生候選按鈕 (正確答案 + 干擾項)
            this.candidates = [];

            // 加入隱藏的元數據候選
            this.hiddenMeta.filter(m => m.isHidden).forEach(m => {
                this.candidates.push({
                    text: m.value,
                    type: m.type,
                    isCorrect: true,
                    isClickedCorrect: false,
                    id: Math.random().toString(36).substr(2, 9)
                });
                // 加入干擾項 (從其他詩詞中隨機選取)
                for (let i = 0; i < settings.metaDistractors; i++) {
                    let decoy = this.getRandomMetaDecoy(m.type, m.value);
                    this.candidates.push({
                        text: decoy,
                        type: m.type,
                        isCorrect: false,
                        isClickedCorrect: false,
                        id: Math.random().toString(36).substr(2, 9)
                    });
                }
            });

            // 加入隱藏的字元候選
            const correctChars = this.hiddenChars.map(c => c.char);
            correctChars.forEach(char => {
                this.candidates.push({
                    text: char,
                    type: 'char',
                    isCorrect: true,
                    isClickedCorrect: false,
                    id: Math.random().toString(36).substr(2, 9)
                });
            });

            // 加入字元干擾項
            const decoysNeeded = settings.charDistractors * this.hiddenChars.length;
            if (window.SharedDecoy) {
                // 排除目前兩行詩句中出現的所有字
                const exclusionList = Array.from(new Set(this.lines.join('').split('')));
                const decoys = window.SharedDecoy.getDecoyChars(correctChars, decoysNeeded, exclusionList, settings.poemMinRating);
                decoys.forEach(d => {
                    this.candidates.push({
                        text: d,
                        type: 'char',
                        isCorrect: false,
                        isClickedCorrect: false,
                        id: Math.random().toString(36).substr(2, 9)
                    });
                });
            }

            // 隨機打亂所有候選按鈕
            this.candidates.sort(() => Math.random() - 0.5);

            // 設定下一個要填入的洞 (優先元數據，再詩句)
            this.refreshNextHole();
        },

        getRandomMetaDecoy: function (type, correctValue) {
            if (typeof POEMS === 'undefined') return "未知";

            let pool;
            if (type === 'author') {
                // 統計作者作品數量
                const authorCounts = {};
                POEMS.forEach(p => {
                    if (p.author) authorCounts[p.author] = (authorCounts[p.author] || 0) + 1;
                });
                // 過濾作品數量大於 1 的作者
                pool = Array.from(new Set(POEMS.map(p => p.author).filter(v => v && v !== correctValue && authorCounts[v] > 1)));
            } else {
                pool = Array.from(new Set(POEMS.map(p => p[type]).filter(v => v && v !== correctValue)));
            }

            if (pool.length === 0) return "佚名";
            let val = pool[Math.floor(Math.random() * pool.length)];
            // 限制干擾項的詩名長度為 7
            if (type === 'title' && val.length > 7) {
                val = val.substring(0, 7);
            }
            return val;
        },

        refreshNextHole: function () {
            // 尋找第一個未解決的元數據洞
            const nextMetaIdx = this.hiddenMeta.findIndex(m => m.isHidden && !m.isSolved);
            if (nextMetaIdx !== -1) {
                this.nextHole = { type: 'meta', index: nextMetaIdx, typeName: this.hiddenMeta[nextMetaIdx].type };
                return;
            }
            // 尋找第一個未解決的字元洞
            const nextCharIdx = this.hiddenChars.findIndex(c => !c.isSolved);
            if (nextCharIdx !== -1) {
                this.nextHole = { type: 'char', index: nextCharIdx };
                return;
            }
            this.nextHole = null; // 全都填完了
        },

        renderUI: function () {
            // 1. 渲染元數據區域
            const metaContainer = document.getElementById('game13-meta');
            metaContainer.innerHTML = '';
            this.hiddenMeta.forEach((m, idx) => {
                const box = document.createElement('div');
                box.className = 'meta-box';
                if (m.isHidden) {
                    box.classList.add('hidden-meta');
                    if (m.isSolved) {
                        box.textContent = m.value;
                        box.classList.add('correct');
                    } else {
                        // 顯示類型提示
                        const labels = { dynasty: '朝代', author: '作者', title: '詩名' };
                        box.textContent = labels[m.type];
                    }
                } else {
                    box.textContent = m.value;
                    box.classList.add('correct'); // 不列入問題時，以綠色顯示
                }
                metaContainer.appendChild(box);
            });

            // 2. 渲染詩句區域
            const l1 = document.getElementById('game13-line1');
            const l2 = document.getElementById('game13-line2');

            const renderText = (lineText, lineIdx) => {
                let html = "";
                let globalOffset = lineIdx === 0 ? 0 : this.lines[0].length;
                for (let i = 0; i < lineText.length; i++) {
                    const char = lineText[i];
                    const globalIdx = globalOffset + i;
                    const hInfoIdx = this.hiddenChars.findIndex(h => h.posIdx === globalIdx);
                    if (hInfoIdx !== -1) {
                        const hInfo = this.hiddenChars[hInfoIdx];
                        if (hInfo.isSolved) {
                            html += `<span class="correct-char">${hInfo.char}</span>`;
                        } else {
                            html += `<span class="hidden-char">◎</span>`;
                        }
                    } else {
                        html += char;
                    }
                }
                return html;
            };

            l1.innerHTML = renderText(this.lines[0], 0);
            l2.innerHTML = renderText(this.lines[1], 1);

            // 3. 渲染按鈕池
            const pool = document.getElementById('game13-answer-pool');
            pool.innerHTML = '';
            this.candidates.forEach((cand, idx) => {
                const btn = document.createElement('button');
                btn.className = 'ans-btn-13';
                if (cand.type === 'char') {
                    btn.classList.add('char-btn');
                } else {
                    btn.classList.add('meta-btn');
                }
                btn.textContent = cand.text;

                if (cand.isClickedCorrect) {
                    btn.classList.add('disabled', 'correct');
                }

                btn.onclick = () => this.handleInput(cand, btn);
                pool.appendChild(btn);
            });

            // 檢查是否超出 8 行，若超出則縮小尺寸
            this.checkAnswerPoolRows();
        },

        checkAnswerPoolRows: function () {
            const pool = document.getElementById('game13-answer-pool');
            if (!pool) return;

            // 先移除之前的緊湊模式類名
            pool.classList.remove('compact-layout');

            // 如果捲動高度大於實際高度，代表超出 8 行 (因為 CSS 中設定了固定高度 27rem)
            if (pool.scrollHeight > pool.offsetHeight + 5) {
                pool.classList.add('compact-layout');
            }
        },

        handleInput: function (cand, btn) {
            if (!this.isActive) return;

            // 尋找所有匹配的洞 (不再依序，而是全場比對)
            let matchesFound = 0;

            // 檢查元數據
            this.hiddenMeta.forEach(m => {
                if (m.isHidden && !m.isSolved && m.type === cand.type && m.value === cand.text) {
                    m.isSolved = true;
                    matchesFound++;
                }
            });

            // 檢查字元
            this.hiddenChars.forEach(c => {
                if (!c.isSolved && cand.type === 'char' && c.char === cand.text) {
                    c.isSolved = true;
                    matchesFound++;
                }
            });

            if (matchesFound > 0) {
                if (window.SoundManager) window.SoundManager.playSuccess();
                cand.isClickedCorrect = true; // 標記此按鈕已正確使用
                this.score += window.ScoreManager.gameSettings['game13'].getPointA;
                //this.score += 20 * matchesFound * (window.ScoreManager ? window.ScoreManager.multipliers[this.difficulty] : 1);

                document.getElementById('game13-score').textContent = this.score;
                this.refreshNextHole();
                this.renderUI();

                // 檢查是否全解
                const allMetaDone = this.hiddenMeta.every(m => !m.isHidden || m.isSolved);
                const allCharDone = this.hiddenChars.every(c => c.isSolved);

                if (allMetaDone && allCharDone) {
                    this.gameOver(true, '恭喜過關！');
                }
            } else {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.mistakeCount++;
                this.updateHearts();

                const isEasyMode = (this.difficulty === '小學' || this.difficulty === '中學');
                if (isEasyMode) {
                    // 中小學難度，按錯不移除紅色狀態且禁用
                    btn.classList.add('wrong', 'disabled');
                } else {
                    // 高階難度，按錯後回復
                    btn.classList.add('wrong');
                    setTimeout(() => btn.classList.remove('wrong'), 500);
                }

                if (this.mistakeCount >= this.difficultySettings[this.difficulty].maxMistakeCount) {
                    this.gameOver(false, '失誤次數過多');
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
            const rect = document.getElementById('game13-timer-path');
            const container = document.querySelector('.game13-answer-pool-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game13-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            rect.setAttribute('width', Math.max(0, w - 6));
            rect.setAttribute('height', Math.max(0, h - 6));
            const perimeter = (Math.max(0, w - 6) + Math.max(0, h - 6)) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - ratio);
        },

        renderHearts: function () {
            const container = document.getElementById('game13-hearts');
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
            const hearts = document.querySelectorAll('#game13-hearts .heart');
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

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game13',
                    timerContainerId: 'game13-answer-pool',
                    scoreElementId: 'game13-score',
                    heartsSelector: '#game13-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.showMessage(win, reason);
                    }
                });
            } else {
                this.showMessage(win, reason);
            }
        },

        showMessage: function (win, reason) {
            if (window.GameMessage) {
                window.GameMessage.show({
                    isWin: win,
                    score: win ? this.score : 0,
                    reason: reason || (win ? "" : "挑戰結束"),
                    btnText: win ? (this.isLevelMode ? "下一關" : "開新局") : "再試一次",
                    onConfirm: () => {
                        if (win) {
                            if (this.isLevelMode) {
                                this.currentLevelIndex++;
                                this.startNewGame();
                            } else {
                                this.startNewGame();
                            }
                        } else {
                            this.retryGame();
                        }
                    }
                });
            }
        }
    };

    window.Game13 = Game13;

    if (new URLSearchParams(window.location.search).get('game') === '13') {
        setTimeout(() => {
            if (window.Game13) window.Game13.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
