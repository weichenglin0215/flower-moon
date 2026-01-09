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
            '小學': { time: 120, maxHideCount: 3, maxAddDecoyChars: 3, hideLines: 2, minRating: 7, maxMistakeCount: 14, showDelay: 2 },
            '中學': { time: 90, maxHideCount: 5, maxAddDecoyChars: 3, hideLines: 2, minRating: 6, maxMistakeCount: 12, showDelay: 4 },
            '高中': { time: 60, maxHideCount: 7, maxAddDecoyChars: 3, hideLines: 2, minRating: 5, maxMistakeCount: 10, showDelay: 8 },
            '大學': { time: 45, maxHideCount: 10, maxAddDecoyChars: 6, hideLines: 0, minRating: 3, maxMistakeCount: 8, showDelay: 12 },
            '研究所': { time: 30, maxHideCount: 14, maxAddDecoyChars: 10, hideLines: 3, minRating: 1, maxMistakeCount: 6, showDelay: 16 }
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
                    <div class="score-board">分數: <span id="game4-score">0</span></div>
                    <div class="game4-controls">
                        <button id="game4-restart-btn" class="nav-btn">重來</button>
                        <button id="game4-close-btn" class="nav-btn close-btn">退出</button>
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

            document.getElementById('game4-close-btn').addEventListener('click', () => this.stopGame());
            document.getElementById('game4-restart-btn').addEventListener('click', () => this.restartGame());
            document.getElementById('game4-msg-btn').addEventListener('click', () => {
                document.getElementById('game4-message').classList.add('hidden');
                this.restartGame();
            });

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

        restartGame: function () {
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentInputIndex = 0;
            this.isRevealed = false;
            this.cluesRevealed = false; // 重設提示句顯示狀態
            document.getElementById('game4-score').textContent = this.score;
            document.getElementById('game4-message').classList.add('hidden');
            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty];
            this.timeLeft = settings.time;
            this.timer = settings.time;

            if (this.selectRandomPoem()) {
                this.renderQuestion();
                this.renderGrid();
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
            } else {
                alert('載入詩詞失敗。');
                this.showDifficultySelector();
            }
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

        renderGrid: function () {
            const container = document.getElementById('game4-grid');
            const settings = this.difficultySettings[this.difficulty];

            const answerChars = this.hiddenPositions.map(p => p.char);
            const targetTotal = answerChars.length + settings.maxAddDecoyChars;

            // 計算二維矩陣大小 (盡量靠近正方形，Cols 3~5)
            let cols = 3;
            if (targetTotal > 15) cols = 5;
            else if (targetTotal > 9) cols = 4;
            else cols = 3;

            let rows = Math.ceil(targetTotal / cols);
            const totalCells = cols * rows;

            container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
            container.innerHTML = '';

            // 干擾字生成
            const decoys = [];
            const neededDecoys = Math.max(0, totalCells - answerChars.length);

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

            const allChars = [...answerChars, ...decoys].sort(() => Math.random() - 0.5);
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

            // Snapshot time immediately so heart animation doesn't reduce time score
            const duration = this.timer * 1000;
            const elapsed = Date.now() - this.startTime;
            const remainingMs = Math.max(0, duration - elapsed);

            // Phase 2: Convert Time
            const convertTime = () => {
                let remainingSeconds = Math.floor(remainingMs / 1000);

                if (remainingSeconds <= 0) {
                    this.gameOver(true);
                    return;
                }

                let tickDelay = Math.floor(1500 / remainingSeconds);
                if (tickDelay > 100) tickDelay = 100;
                if (tickDelay < 30) tickDelay = 30;

                let starsLaunched = 0;
                let starsLanded = 0;
                let isLaunchComplete = false;

                const winInterval = setInterval(() => {
                    if (remainingSeconds > 0) {
                        const currentRatio = remainingSeconds / this.timer;

                        starsLaunched++;
                        this.createFlyingStar(currentRatio, () => {
                            this.score += 5;
                            document.getElementById('game4-score').textContent = this.score;
                            starsLanded++;
                            if (isLaunchComplete && starsLanded === starsLaunched) {
                                this.gameOver(true);
                            }
                        });

                        remainingSeconds--;
                        const newRatio = remainingSeconds / this.timer;
                        this.updateTimerRing(newRatio);
                    } else {
                        clearInterval(winInterval);
                        this.updateTimerRing(0);
                        isLaunchComplete = true;
                        // In case all stars landed before loop finished (unlikely given logic, but safe to check)
                        if (starsLanded === starsLaunched) {
                            this.gameOver(true);
                        }
                    }
                }, tickDelay);
            };

            // Phase 1: Convert Hearts
            const hearts = Array.from(document.querySelectorAll('#game4-hearts .heart:not(.empty)'));
            if (hearts.length > 0) {
                let hIdx = hearts.length - 1;
                const heartInterval = setInterval(() => {
                    if (hIdx >= 0) {
                        hearts[hIdx].classList.add('score');
                        hearts[hIdx].textContent = '❤';
                        this.score += 10;
                        document.getElementById('game4-score').textContent = this.score;
                        hIdx--;
                    } else {
                        clearInterval(heartInterval);
                        setTimeout(convertTime, 300);
                    }
                }, 333);
            } else {
                convertTime();
            }
        },

        getTimerPathPoint: function (ratio) {
            const container = document.getElementById('game4-grid-container');
            if (!container) return { x: 0, y: 0 };

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const rw = Math.max(0, w - 6);
            const rh = Math.max(0, h - 6);
            const perimeter = 2 * (rw + rh);

            let dist = perimeter * (1 - ratio);

            // CCW Path starting from Top-Left (x=3, y=3)

            // 1. Left Edge (Top -> Bottom)
            if (dist <= rh) {
                return { x: 3, y: 3 + dist };
            }
            dist -= rh;

            // 2. Bottom Edge (Left -> Right)
            if (dist <= rw) {
                return { x: 3 + dist, y: 3 + rh };
            }
            dist -= rw;

            // 3. Right Edge (Bottom -> Top)
            if (dist <= rh) {
                return { x: 3 + rw, y: 3 + rh - dist };
            }
            dist -= rh;

            // 4. Top Edge (Right -> Left)
            return { x: 3 + rw - dist, y: 3 };
        },

        createFlyingStar: function (ratio, onLand) {
            // P0: Start position (Timer endpoint)
            const timerContainer = document.getElementById('game4-grid-container');
            if (!timerContainer) return;
            const tRect = timerContainer.getBoundingClientRect();

            const pointOnRect = this.getTimerPathPoint(ratio);
            const p0 = {
                x: tRect.left + pointOnRect.x,
                y: tRect.top + pointOnRect.y
            };

            // P2: End position (Center of score board)
            const scoreEl = document.getElementById('game4-score');
            if (!scoreEl) return;
            const sRect = scoreEl.getBoundingClientRect();
            const p2 = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 };

            // P1: Midpoint + random offset
            const midX = (p0.x + p2.x) / 2;
            const midY = (p0.y + p2.y) / 2;
            const offsetX = (Math.random() - 0.5) * 300;
            const offsetY = (Math.random() - 0.5) * 300 - 100;
            const p1 = { x: midX + offsetX, y: midY + offsetY };

            // Create Star
            const star = document.createElement('div');
            star.className = 'flying-star';
            star.textContent = '★';
            star.style.left = `${p0.x}px`;
            star.style.top = `${p0.y}px`;
            document.body.appendChild(star);

            // Animation Loop
            const duration = 1000; // 1 second flight time
            const startTime = Date.now();

            const animate = () => {
                const now = Date.now();
                const t = Math.min(1, (now - startTime) / duration);

                // Quadratic Bezier relative to body
                const oneMinusT = 1 - t;
                const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
                const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;

                star.style.left = `${x}px`;
                star.style.top = `${y}px`;

                star.style.transform = `translate(-50%, -50%) scale(${1 - t * 0.5}) rotate(${t * 360}deg)`;
                star.style.opacity = 1 - t * 0.2;

                if (t < 1) {
                    requestAnimationFrame(animate);
                } else {
                    star.remove();
                    // Pulse
                    scoreEl.style.transform = "scale(1.5)";
                    scoreEl.style.color = "#f1c40f";
                    setTimeout(() => {
                        scoreEl.style.transform = "";
                        scoreEl.style.color = "";
                    }, 150);

                    if (onLand) onLand();
                }
            };
            requestAnimationFrame(animate);
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
                    content.textContent = `得分：${this.score}`;
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
            window.Game4.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 300);
    }
})();
