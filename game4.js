(function () {
    const Game4 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,

        // 遊戲狀態
        currentPoem: null,
        line1: "",
        line2: "",
        hiddenPositions: [], // [{line: 1|2, charIdx, char}]
        currentInputIndex: 0,
        timer: 60,
        timeLeft: 60,
        timerInterval: null,
        showTimeout: null, // 用於延遲顯示完整句子的計時器

        isRevealed: false,
        cluesRevealed: false, // 題目提示句是否已過延遲時間而顯示
        container: null,
        game4Area: null,

        difficultySettings: {
            '小學': { time: 60, maxMistakeCount: 4, maxHideCount: 3, maxAddDecoyChars: 6, hideLines: 2, minRating: 7, showDelay: 0 },
            '中學': { time: 45, maxMistakeCount: 5, maxHideCount: 5, maxAddDecoyChars: 8, hideLines: 2, minRating: 6, showDelay: 4 },
            '高中': { time: 30, maxMistakeCount: 6, maxHideCount: 7, maxAddDecoyChars: 12, hideLines: 2, minRating: 5, showDelay: 8 },
            '大學': { time: 20, maxMistakeCount: 7, maxHideCount: 10, maxAddDecoyChars: 15, hideLines: 0, minRating: 3, showDelay: 10 },
            '研究所': { time: 15, maxMistakeCount: 8, maxHideCount: 12, maxAddDecoyChars: 20, hideLines: 3, minRating: 1, showDelay: 12 }
        },

        // 常用字庫 (用於生成干擾項)
        decoyCharsSets: {
            people: "你妳我他她它父母爺娘公婆兄弟姊妹人子吾余夫妻婦妾君卿爾奴汝彼此伊客君主翁",
            season: "春夏秋冬晨晝暮夜夕宵日月星辰漢輝曦雲霓虹雷電霽霄昊蒼溟",
            weather: "陰晴風雨雪霜露霧霞虹暖寒涼暑晦暗亮光明清冽空氣嵐",
            environment: "山嶺峰嶽丘陵原野石岩磐礫沙塵泥壤漠海江河川溪瀑澗流湖泊沼澤水淵深潭泉",
            color: "紅絳朱丹彤緋橙黃綠碧翠蔥藍縹蒼靛紫白皓素皚黑玄緇黛烏墨金銀銅鐵灰",
            plant: "花草梅蘭竹菊荷蓮桂桃李杏梨棠芍薔榴葵蘆荻芷蕙蘅薇薔薇柳松",
            common: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長"
        },

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
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game4-container';
            //檢查responsive.css是否有包括game4 - overlay.aspect - 5 - 8
            div.className = 'game4-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="debug-frame"></div>
                <div class="game4-header">
                    <div class="game4-score-board">分數: <span id="game4-score">0</span></div>
                    <div class="game4-controls">
                        <button id="game4-restart-btn" class="nav-btn">重來</button>
                        <button id="game4-close-btn" class="nav-btn close-btn">開新局</button>
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

            document.getElementById('game4-close-btn').onclick = () => this.startNewGame();
            document.getElementById('game4-restart-btn').onclick = () => this.retryGame();
            document.getElementById('game4-msg-btn').onclick = () => {
                document.getElementById('game4-message').classList.add('hidden');
                this.startNewGame();
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
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('遊戲四：眾裡尋他千百度', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    this.restartGame();
                });
            } else {
                console.warn('[Game4] DifficultySelector not found');
            }
        },

        hideOtherContents: function () {
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
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            document.getElementById('game4-score').textContent = this.score;
            document.getElementById('game4-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.time;
            this.timer = settings.time;

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
        },

        startNewGame: function () {
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false;
            document.getElementById('game4-score').textContent = this.score;
            document.getElementById('game4-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.time;
            this.timer = settings.time;

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
        },

        restartGame: function () {
            this.startNewGame();
        },

        selectRandomPoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;
            const settings = this.difficultySettings[this.difficulty];
            const minR = settings.minRating;

            // 1. 篩選符合條件的詩詞與有效的對聯 (句對)
            const eligiblePool = [];
            POEMS.forEach(p => {
                const pairs = [];
                const pairCount = Math.floor(p.content.length / 2);
                for (let i = 0; i < pairCount; i++) {
                    const idx1 = i * 2;
                    const idx2 = idx1 + 1;

                    // 取得每句的評分，若無則參考詩詞總評
                    const r1 = (p.line_ratings && p.line_ratings[idx1] !== undefined) ? p.line_ratings[idx1] : (p.rating || 0);
                    const r2 = (p.line_ratings && p.line_ratings[idx2] !== undefined) ? p.line_ratings[idx2] : (p.rating || 0);

                    // 只要其中一句符合最低評分即視為有效題對
                    if (Math.max(r1, r2) >= minR) {
                        pairs.push({ l1: p.content[idx1], l2: p.content[idx2] });
                    }
                }
                if (pairs.length > 0) {
                    eligiblePool.push({ poem: p, validPairs: pairs });
                }
            });

            if (eligiblePool.length === 0) return false;

            // 2. 隨機選一個詩詞及其中的有效句對
            const pick = eligiblePool[Math.floor(Math.random() * eligiblePool.length)];
            const pair = pick.validPairs[Math.floor(Math.random() * pick.validPairs.length)];

            this.currentPoem = pick.poem;
            this.line1 = pair.l1;
            this.line2 = pair.l2;

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

            let linesToHide = [];
            if (settings.hideLines === 1) {
                linesToHide = [1];
            } else if (settings.hideLines === 2) {
                linesToHide = [2];
            } else if (settings.hideLines === 3) {
                linesToHide = [1, 2];
            } else {
                // hideLines === 0: 隨機選第一行或第二行
                linesToHide = [Math.random() < 0.5 ? 1 : 2];
            }

            linesToHide.forEach(lineNum => {
                const lineChars = lineNum === 1 ? chars1 : chars2;
                // 洗牌選取要隱藏的字
                const shuffled = [...lineChars].sort(() => Math.random() - 0.5);
                const numToHide = Math.min(lineChars.length, settings.maxHideCount);
                const picked = shuffled.slice(0, numToHide).map(c => ({ ...c, line: lineNum }));
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
                            if (posIdx < this.currentInputIndex) {
                                html += `<span class="correct-char">${char}</span>`;
                            } else if (this.isRevealed) {
                                html += `<span class="hidden-char">${char}</span>`;
                            } else {
                                html += `<span class="hidden-char">◎</span>`;
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

            info.innerHTML = `<span style="cursor: pointer; text-decoration: underline; opacity: 0.8;">${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}</span>`;
            info.onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
        },

        renderGrid: function (isRetry = false) {
            const container = document.getElementById('game4-grid');
            const gridConfigs = {
                '小學': { total: 9, cols: 3 },
                '中學': { total: 12, cols: 4 },
                '高中': { total: 16, cols: 4 },
                '大學': { total: 20, cols: 5 },
                '研究所': { total: 25, cols: 5 }
            };
            const config = gridConfigs[this.difficulty] || gridConfigs['小學'];

            let allChars;
            if (isRetry && this.currentGridChars) {
                allChars = this.currentGridChars;
            } else {
                const answerChars = this.hiddenPositions.map(p => p.char);
                const targetTotal = config.total;

                // 干擾字生成
                const decoys = [];
                const neededDecoys = Math.max(0, targetTotal - answerChars.length);

                const sets = Object.values(this.decoyCharsSets);
                answerChars.forEach(targetChar => {
                    if (decoys.length >= neededDecoys) return;
                    if (Math.random() < 0.6) {
                        const matchedSet = sets.find(s => s.includes(targetChar));
                        if (matchedSet) {
                            const candidates = matchedSet.split('').filter(c => !answerChars.includes(c) && !decoys.includes(c));
                            candidates.sort(() => Math.random() - 0.5);
                            const count = Math.min(2, neededDecoys - decoys.length, candidates.length);
                            for (let i = 0; i < count; i++) decoys.push(candidates[i]);
                        }
                    }
                });

                while (decoys.length < neededDecoys) {
                    const pool = this.decoyCharsSets.common;
                    const char = pool[Math.floor(Math.random() * pool.length)];
                    if (!answerChars.includes(char) && !decoys.includes(char)) decoys.push(char);
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
                btn.textContent = char;
                btn.onclick = (e) => this.handleInput(char, e.target);
                container.appendChild(btn);
            });

            this.updateTimerRing(1);
        },

        handleInput: function (char, btn) {
            if (!this.isActive) return;
            if (btn.classList.contains('disabled')) return;

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
            clearInterval(this.timerInterval);
            if (this.showTimeout) clearTimeout(this.showTimeout);
            this.isRevealed = true;
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
            }, 500);
        }
    };

    window.Game4 = Game4;

    if (window.location.search.includes('game=4')) {
        setTimeout(() => {
            if (window.Game4) window.Game4.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
