/* game9.js - 詩韻鎖扣 (Nuts & Bolts: Verse) */

(function () {
    'use strict';

    const Game9 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,
        timer: 0,
        maxTimer: 0,
        timerInterval: null,

        movesLeft: 0,
        maxMoves: 0,
        lastActionTime: 0,
        inactivityThreshold: 5000,

        moveInfo: [], // for undo

        // 難度設定：
        // timeLimit 時間限制
        // poemMinRating 最低詩詞評分
        // bolts 螺絲數
        // emptyBolts 空槽數
        // hasHint 是否有提示
        // undo 是否有撤銷
        // moveLimit 移動次數上限
        // exchangeQuantity 每回合可交換螺絲數
        //難度參數詳細說明，hasHint: true表示有提示，undo: true表示有撤銷，moveLimit: 0表示沒有移動次數上限，exchangeQuantity: 2表示控制題目難度的預先的交換螺絲數，totalNumberOfExchange: 16表示題目總共預先交換的次數(越多次越難)
        //color: hard, expert 可使用深色且難以辨識的顏色
        difficultySettings: {
            '小學': { timeLimit: 90, poemMinRating: 6, bolts: 6, emptyBolts: 2, hasHint: 'all', undo: true, moveLimit: 0, exchangeQuantity: 2, totalNumberOfExchange: 16 },
            '中學': { timeLimit: 120, poemMinRating: 5, bolts: 6, emptyBolts: 2, hasHint: 'firstEnd', undo: true, moveLimit: 0, exchangeQuantity: 3, totalNumberOfExchange: 24 },
            '高中': { timeLimit: 150, poemMinRating: 4, bolts: 6, emptyBolts: 2, hasHint: 'first', undo: true, moveLimit: 0, exchangeQuantity: 4, totalNumberOfExchange: 32 },
            '大學': { timeLimit: 180, poemMinRating: 3, bolts: 6, emptyBolts: 2, hasHint: 'end', undo: true, moveLimit: 0, exchangeQuantity: 5, totalNumberOfExchange: 48 },
            '研究所': { timeLimit: 240, poemMinRating: 2, bolts: 6, emptyBolts: 2, hasHint: 'none', undo: false, moveLimit: 0, color: 'hard', exchangeQuantity: 7, totalNumberOfExchange: 56 }
        },

        loadCSS: function () {
            if (!document.getElementById('game9-css')) {
                const link = document.createElement('link');
                link.id = 'game9-css';
                link.rel = 'stylesheet';
                link.href = 'game9.css';
                document.head.appendChild(link);
            }
        },
        currentPoem: null,
        lines: [], // array of objects parsing the poem into lines

        // Nuts state: array of bolts, each bolt is an array of nuts
        bolts: [],
        completedBolts: [], // Track completed bolts to prevent repeated animations
        newlyCompletedBoltIdx: -1, // Specifically for the one-time jump animation
        isWinning: false, // Flag for win animation
        selectedNut: null,
        selectedBoltIndex: -1,
        selectedNutCount: 0, // Track how many nuts are selected
        movesMade: 0,

        container: null,

        // Audio notes for clink
        audioCtx: null,

        init: function () {
            this.loadCSS();
            if (this.container) return;
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game9-container';
            div.className = 'game9-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game9-header">
                    <div class="game9-score-board">分數: <span id="game9-score">0</span></div>
                    <div class="game9-controls">
                        <button class="game9-difficulty-tag" id="game9-diff-tag">小學</button>
                        <button id="game9-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game9-newGame-btn" class="nav-btn newGame-btn">開新局</button>
                    </div>
                </div>
                <div class="game9-sub-header">
                    <div id="game9-hearts" class="game9-hearts"></div>

                </div>
                <div class="game9-area">
                    <svg id="game9-timer-ring">
                        <rect id="game9-timer-path-white" x="3" y="3"></rect>
                        <rect id="game9-timer-path-red" x="3" y="3"></rect>
                    </svg>
                    <button id="game9-undo-btn" class="game9-undo-btn" disabled>撤銷</button>
                  <div class="game9-info">
                        <div id="game9-poem-info" class="game9-poem-info"></div>
                        <div id="game9-progress-text" class="game9-progress-text"></div>
                    </div>
                    
                    <div id="game9-play-area" class="game9-play-area">
                        <div id="game9-bolt-container" class="game9-bolt-container"></div>
                    </div>
                </div>
                <div id="game9-message" class="game9-message hidden">
                    <h2 id="game9-msg-title">訊息</h2>
                    <p id="game9-msg-content"></p>
                    <button id="game9-msg-btn" class="nav-btn">繼續</button>
                </div>
            `;
            document.body.appendChild(div);
            this.container = div;
        },

        initAudio: function () {
            if (!this.audioCtx) {
                try {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    this.audioCtx = new AudioContext();
                } catch (e) {
                    console.warn("AudioContext not supported");
                }
            }
        },

        playNote: function (type) {
            if (!this.audioCtx) return;
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            let freq = 800;
            if (type === 'select') freq = 1200;
            else if (type === 'drop') freq = 600;
            else if (type === 'error') freq = 200;
            else if (type === 'complete') freq = 1500;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            if (type === 'complete') {
                osc.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.3);
            }

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (type === 'complete' ? 0.3 : 0.1));

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            document.getElementById('game9-message').classList.add('hidden');

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩韻鎖扣', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[selectedLevel];
                    if (!settings) return;
                    
                    this.updateUIForMode();

                    const container = document.getElementById('game9-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.classList.add('overlay-active');
                    }

                    if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                    setTimeout(() => {
                        this.startNewGame();
                    }, 50);
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game9-diff-tag');
            const retryBtn = document.getElementById('game9-retryGame-btn');
            const newBtn = document.getElementById('game9-newGame-btn');
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

        bindEvents: function () {
            document.getElementById('game9-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game9-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game9-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game9-message').classList.add('hidden');
                if (this.isWin) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };
            document.getElementById('game9-poem-info').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (window.PoemDialog && this.currentPoem) window.PoemDialog.openById(this.currentPoem.id);
            };
            document.getElementById('game9-undo-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.undoMove();
            };
            document.getElementById('game9-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        show: function () {
            this.init();
            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩韻鎖扣', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    
                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.initAudio();
                    setTimeout(() => {
                        this.startNewGame();
                    }, 50);
                });
            }
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        startNewGame: function (levelIndex) {
            if (levelIndex !== undefined) this.currentLevelIndex = levelIndex;
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        selectRandomPoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.stars || 4;

            // 使用共用邏輯取得隨機詩詞，傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                4, 4, 16, 40, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game9'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            const poem = result.poem;
            const startIndex = result.startIndex;

            // 取連續 4 句
            this.lines = [];
            for (let i = 0; i < 4; i++) {
                const rawLine = poem.content[startIndex + i];
                if (!rawLine) break;
                const text = rawLine.replace(/[，。？！、：；「」『』\s]/g, "");
                this.lines.push(text);
            }

            // 計算最長行字數（決定螺絲管容量）
            this.maxLineLength = Math.max(...this.lines.map(l => l.length));
            this.maxLineLength = Math.max(this.maxLineLength, 5);

            document.getElementById('game9-poem-info').textContent =
                `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            return true;
        },
        //game9只有startGameProcess() 透過isRetry控制是否重來或是開新局
        startGameProcess: function (isRetry) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.isActive = true;
            this.score = 0;
            this.moveInfo = [];
            this.isWinning = false;
            this.newlyCompletedBoltIdx = -1;

            this.updateUIForMode();
            document.getElementById('game9-score').textContent = this.score;
            document.getElementById('game9-message').classList.add('hidden');

            const settings = this.difficultySettings[this.difficulty];
            const undoBtn = document.getElementById('game9-undo-btn');
            if (settings.undo) {
                undoBtn.style.display = 'block';
                undoBtn.disabled = true;
            } else {
                undoBtn.style.display = 'none';
            }

            document.getElementById('game9-hearts').innerHTML = '';

            this.selectedNut = null;
            this.selectedBoltIndex = -1;

            this.completedBolts = [];
            this.newlyCompletedBoltIdx = -1;
            if (!isRetry || !this.initialBoltsState) {
                this.generateLevel();
                // deep copy for retry
                this.initialBoltsState = JSON.parse(JSON.stringify(this.bolts));
            } else {
                this.bolts = JSON.parse(JSON.stringify(this.initialBoltsState));
                // Initial check for completed bolts in retry
                this.bolts.forEach((b, i) => {
                    if (this.checkBoltCompleted(b)) this.completedBolts.push(i);
                });
            }

            this.renderLevel();
            this.updateProgressText();

            // Setup Move limits based on totalNumberOfExchange
            this.maxMoves = (settings.totalNumberOfExchange || 16) * 1.5;
            this.movesLeft = this.maxMoves;
            this.updateProgressText(); //起動遊戲時更新剩餘步數
            this.lastActionTime = Date.now();

            if (this.maxMoves > 0) {
                document.getElementById('game9-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game9-timer-ring').style.display = 'none';
            }
            // 啟用重來按鈕
            document.getElementById('game9-retryGame-btn').disabled = false;
            document.getElementById('game9-newGame-btn').disabled = false;
        },

        generateLevel: function () {
            const settings = this.difficultySettings[this.difficulty];
            const numBolts = settings.bolts;
            const emptyBolts = settings.emptyBolts;
            const fullBolts = numBolts - emptyBolts; // Should be 4 for our 20 char poem

            this.bolts = [];
            for (let i = 0; i < numBolts; i++) {
                this.bolts.push([]);
            }

            // Initially place nuts in sorted order
            for (let i = 0; i < 4; i++) {
                if (i >= fullBolts) break;
                const lineChars = this.lines[i];
                // Bottom to top
                for (let j = lineChars.length - 1; j >= 0; j--) {
                    this.bolts[i].push({
                        char: lineChars[j],
                        colorGroup: i,
                        index: j
                    });
                }
            }

            // 1. Separate the fixed bottom and the mobile top parts
            const exchangeQty = settings.exchangeQuantity || 5;
            const mobileNuts = [];

            for (let i = 0; i < fullBolts; i++) {
                const lineLen = this.lines[i].length;
                // Number of nuts to pull from the top
                const countToPull = Math.min(this.bolts[i].length, exchangeQty);
                for (let j = 0; j < countToPull; j++) {
                    mobileNuts.push(this.bolts[i].pop());
                }
            }

            // 2. Scramble ONLY the pulled mobile nuts into the available space (including empty bolts)
            // We use a simple randomization for initial distribution, then do some valid swaps
            // Distribute randomly
            const targetBoltsIdx = [];
            for (let i = 0; i < numBolts; i++) targetBoltsIdx.push(i);

            while (mobileNuts.length > 0) {
                const nut = mobileNuts.pop();
                // Find a bolt that is not full
                let validBolts = targetBoltsIdx.filter(idx => this.bolts[idx].length < this.maxLineLength);
                if (validBolts.length === 0) break;
                const targetIdx = validBolts[Math.floor(Math.random() * validBolts.length)];
                this.bolts[targetIdx].push(nut);
            }

            // 3. Perform additional random valid moves ONLY on the top nuts
            let scrambles = 0;
            const maxScrambles = settings.totalNumberOfExchange || 100;
            while (scrambles < maxScrambles) {
                const nonEmpty = [];
                const notFull = [];
                for (let i = 0; i < numBolts; i++) {
                    const lineLen = (i < fullBolts) ? this.lines[i].length : 0;
                    const fixedSize = i < fullBolts ? Math.max(0, lineLen - exchangeQty) : 0;
                    if (this.bolts[i].length > fixedSize) nonEmpty.push(i);
                    if (this.bolts[i].length < this.maxLineLength) notFull.push(i);
                }

                if (nonEmpty.length === 0) break;

                const fromIdx = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
                let toIdx = notFull[Math.floor(Math.random() * notFull.length)];

                if (fromIdx !== toIdx) {
                    const nut = this.bolts[fromIdx].pop();
                    this.bolts[toIdx].push(nut);
                    scrambles++;
                }
            }
        },

        getColorClass: function (colorGroup) {
            const settings = this.difficultySettings[this.difficulty];
            if (settings.color === 'expert') {
                return 'nut-color-expert';
            } else if (settings.color === 'hard') {
                return `nut-color-hard-${(colorGroup % 4) + 1}`;
            } else {
                return `nut-color-${(colorGroup % 7) + 1}`;
            }
        },

        renderLevel: function () {
            const container = document.getElementById('game9-bolt-container');
            container.innerHTML = '';

            const settings = this.difficultySettings[this.difficulty];

            this.bolts.forEach((boltStack, boltIdx) => {
                const boltEl = document.createElement('div');
                boltEl.className = 'game9-bolt';
                boltEl.dataset.idx = boltIdx;
                // Adjust bolt height based on maxLineLength
                boltEl.style.height = `${(this.maxLineLength * 3.2) + 2}rem`;

                // create nuts from bottom up
                // boltStack: [bottom, ..., top]
                for (let i = 0; i < boltStack.length; i++) {
                    const nutData = boltStack[i];
                    const nutEl = document.createElement('div');
                    nutEl.className = `game9-nut ${this.getColorClass(nutData.colorGroup)}`;
                    // visual stacking logic
                    // CSS: bolt is flex column-reverse, so appending order naturally stacks bottom up.
                    nutEl.textContent = nutData.char;
                    nutEl.dataset.nutGroup = nutData.colorGroup;
                    nutEl.dataset.nutIndex = nutData.index;
                    nutEl.dataset.stackIndex = i; // Store its position in the stack

                    let showHint = false;
                    const hType = settings.hasHint;
                    const lineLen = this.lines[nutData.colorGroup].length;
                    if (hType === 'all') showHint = true;
                    else if (hType === 'first' && nutData.index === 0) showHint = true;
                    else if (hType === 'end' && nutData.index === lineLen - 1) showHint = true;
                    else if (hType === 'firstEnd' && (nutData.index === 0 || nutData.index === lineLen - 1)) showHint = true;

                    if (showHint) {
                        const hintEl = document.createElement('div');
                        hintEl.className = 'game9-nut-hint';
                        hintEl.textContent = nutData.index + 1;
                        nutEl.appendChild(hintEl);
                    }

                    // Fixed spacing of 3.2rem per nut, no squashing
                    nutEl.style.bottom = `${i * 3.2 + 1}rem`;

                    // If it's part of the selected nuts, float it
                    if (this.selectedBoltIndex === boltIdx && i >= (this.bolts[boltIdx].length - this.selectedNutCount)) {
                        nutEl.classList.add('selected');
                        nutEl.style.transform = 'translateY(-1.5rem)';
                    }

                    boltEl.appendChild(nutEl);
                }

                if (this.completedBolts.includes(boltIdx)) {
                    boltEl.classList.add('is-completed'); // Standard completed look (no animation)

                    // Apply animation if it's newly completed OR if we're in winning state
                    if (this.newlyCompletedBoltIdx === boltIdx || this.isWinning) {
                        boltEl.classList.add('completed');
                    }
                }

                boltEl.onclick = (e) => this.handleBoltClick(boltIdx, e);
                container.appendChild(boltEl);
            });

            const undoBtn = document.getElementById('game9-undo-btn');
            if (settings.undo) {
                undoBtn.disabled = this.moveInfo.length === 0;
            }
        },

        updateProgressText: function () {
            const settings = this.difficultySettings[this.difficulty];
            const p = document.getElementById('game9-progress-text');
            p.textContent = `剩餘步數: ${this.movesLeft}`;
        },

        handleBoltClick: function (boltIdx, e) {
            if (!this.isActive) return;

            // Scenario 1: Select a bolt or specific nut
            if (this.selectedBoltIndex === -1) {
                const bolt = this.bolts[boltIdx];
                if (bolt.length === 0 || this.completedBolts.includes(boltIdx)) {
                    this.playNote('error');
                    return;
                }

                // Default pick top one if bolt was clicked itself
                let k = bolt.length - 1;
                // If a nut was clicked, find its stack index
                const nutEl = e && e.target.closest('.game9-nut');
                if (nutEl) {
                    k = parseInt(nutEl.dataset.stackIndex);
                }

                // Verify same color from k to top
                const targetColor = bolt[k].colorGroup;
                for (let i = k; i < bolt.length; i++) {
                    if (bolt[i].colorGroup !== targetColor) {
                        // User clicked a nut that has different colored nuts on top of it
                        this.playNote('error');
                        if (window.SoundManager) window.SoundManager.playFailure();
                        return;
                    }
                }

                this.playNote('select');
                this.selectedBoltIndex = boltIdx;
                this.selectedNutCount = bolt.length - k;
                this.renderLevel();
            }
            // Scenario 2: Unselect same bolt
            else if (this.selectedBoltIndex === boltIdx) {
                this.selectedBoltIndex = -1;
                this.selectedNutCount = 0;
                this.playNote('drop');
                this.renderLevel();
            }
            // Scenario 3: Move to another bolt
            else {
                const sourceBolt = this.bolts[this.selectedBoltIndex];
                const targetBolt = this.bolts[boltIdx];
                const count = this.selectedNutCount;
                const movingNutSet = sourceBolt.slice(sourceBolt.length - count);
                const baseNut = movingNutSet[0];

                // Check constraints
                if (targetBolt.length + count > this.maxLineLength) {
                    this.playNote('error');
                    if (window.SoundManager) window.SoundManager.playFailure();
                    const trgEl = document.querySelector(`.game9-bolt[data-idx="${boltIdx}"]`);
                    if (trgEl) {
                        trgEl.classList.add('shake');
                        setTimeout(() => trgEl.classList.remove('shake'), 300);
                    }
                    return; // Target full
                }

                let canMove = false;
                if (targetBolt.length === 0) {
                    canMove = true; // Can move to empty
                } else {
                    const targetTopNut = targetBolt[targetBolt.length - 1];
                    // check color group compatibility
                    if (targetTopNut.colorGroup === baseNut.colorGroup) {
                        canMove = true;
                    }
                }

                if (canMove) {
                    // DO MULTI MOVE
                    const nuts = sourceBolt.splice(sourceBolt.length - count, count);
                    targetBolt.push(...nuts);

                    // Record undo
                    this.moveInfo.push({ from: this.selectedBoltIndex, to: boltIdx, count: count });

                    this.movesMade++;
                    this.movesLeft--; // Used a move
                    this.lastActionTime = Date.now(); // Reset inactivity timer
                    this.selectedBoltIndex = -1;
                    this.selectedNutCount = 0;

                    this.updateProgressText();
                    this.renderLevel();

                    if (this.movesLeft <= 0) {
                        setTimeout(() => {
                            if (!this.isActive) return; // In case game already won/stopped
                            this.gameOver(false, "步數已用盡。");
                        }, 500);
                        return;
                    }

                    if (this.checkBoltCompleted(targetBolt)) {
                        this.playNote('complete');
                        if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
                        // Add to completed session trackers if newly completed
                        if (!this.completedBolts.includes(boltIdx)) {
                            this.completedBolts.push(boltIdx);
                            this.newlyCompletedBoltIdx = boltIdx; // Mark for animation
                            // 重繪以顯示完成動畫
                            this.renderLevel();
                        }
                        // Score formula calculation for completing a stack
                        this.score += 0.5 * this.difficultySettings[this.difficulty].exchangeQuantity * this.difficultySettings[this.difficulty].totalNumberOfExchange;
                        document.getElementById('game9-score').textContent = Math.round(this.score);
                    } else {
                        // If it WAS completed but now we pulled something out... 
                        const cIdx = this.completedBolts.indexOf(boltIdx);
                        if (cIdx !== -1) {
                            this.completedBolts.splice(cIdx, 1);
                        }
                        this.playNote('drop');
                    }

                    // Reset newly completed flag after one render pass
                    setTimeout(() => {
                        this.newlyCompletedBoltIdx = -1;
                    }, 600);

                    this.checkGameEnd();
                } else {
                    this.playNote('error');
                    if (window.SoundManager) window.SoundManager.playFailure();
                    const trgEl = document.querySelector(`.game9-bolt[data-idx="${boltIdx}"]`);
                    if (trgEl) {
                        trgEl.classList.add('shake');
                        setTimeout(() => trgEl.classList.remove('shake'), 300);
                    }
                }
            }
        },

        undoMove: function () {
            if (!this.isActive || this.moveInfo.length === 0) return;

            const lastMove = this.moveInfo.pop();
            const fromBoltIdx = lastMove.to;
            const toBoltIdx = lastMove.from;
            const count = lastMove.count || 1;
            const fromBolt = this.bolts[fromBoltIdx];
            const toBolt = this.bolts[toBoltIdx];

            if (fromBolt.length >= count) {
                const nuts = fromBolt.splice(fromBolt.length - count, count);
                toBolt.push(...nuts);

                // Update completed state for both affected bolts
                [fromBoltIdx, toBoltIdx].forEach(idx => {
                    const isComp = this.checkBoltCompleted(this.bolts[idx]);
                    const trackerIdx = this.completedBolts.indexOf(idx);
                    if (isComp && trackerIdx === -1) this.completedBolts.push(idx);
                    else if (!isComp && trackerIdx !== -1) this.completedBolts.splice(trackerIdx, 1);
                });

                this.movesMade++;
                this.movesLeft++; // Return the move
                this.lastActionTime = Date.now(); // Reset inactivity timer
                this.selectedBoltIndex = -1;
                this.selectedNutCount = 0;
                this.playNote('drop');
                this.updateProgressText();
                this.renderLevel();
            }
        },

        checkBoltCompleted: function (boltStack) {
            if (boltStack.length === 0) return false;

            // 1. Must be all same color (part of the same line)
            const targetColorGroup = boltStack[0].colorGroup;
            const targetLineString = this.lines[targetColorGroup];

            if (boltStack.length !== targetLineString.length) return false;

            for (let i = 0; i < boltStack.length; i++) {
                if (boltStack[i].colorGroup !== targetColorGroup) return false;
            }

            // 2. The string of characters (top to bottom) must match the target line string
            const currentString = boltStack.map(n => n.char).reverse().join('');

            return currentString === targetLineString;
        },

        checkGameEnd: function () {
            const settings = this.difficultySettings[this.difficulty];

            // Check Win
            let allCompleted = true;
            for (let i = 0; i < this.bolts.length; i++) {
                if (this.bolts[i].length > 0 && !this.checkBoltCompleted(this.bolts[i])) {
                    allCompleted = false;
                    break;
                }
            }

            if (allCompleted) {
                this.gameWin();
                return;
            }

            // Check Failed (Move limit)
            if (settings.moveLimit > 0 && this.movesMade >= settings.moveLimit) {
                this.gameOver(false, `步數超過上限 ${settings.moveLimit} 步`);
                return;
            }
        },

        startTimer: function () {
            clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;

                const now = Date.now();
                // Inactivity check: 5 seconds
                if (now - this.lastActionTime >= this.inactivityThreshold) {
                    this.movesLeft--;
                    this.lastActionTime = now; // Give another 5s
                    this.playNote('error');
                    this.updateProgressText();
                    this.updateTimerRing();

                    if (this.movesLeft <= 0) {
                        setTimeout(() => {
                            if (this.isActive && this.movesLeft <= 0) {
                                this.gameOver(false, "步數已用盡(怠功)。");
                            }
                        }, 500);
                    }
                }

                this.updateTimerRing();
            }, 100);
        },

        updateTimerRing: function (ratio) {
            // 如果傳入了比例（例如結算動畫時），則更新 movesLeft 以便同步顯示
            if (typeof ratio === 'number') {
                this.movesLeft = Math.round(ratio * this.maxMoves);
            }

            const rectRed = document.getElementById('game9-timer-path-red');
            const rectWhite = document.getElementById('game9-timer-path-white');
            const wrapper = document.querySelector('.game9-area');
            const svg = document.getElementById('game9-timer-ring');
            if (!rectRed || !rectWhite || !wrapper || !svg) return;

            let w = wrapper.offsetWidth;
            let h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rectBox = wrapper.getBoundingClientRect();
                w = rectBox.width;
                h = rectBox.height;
            }
            if (w === 0) return;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';

            rectRed.setAttribute('width', w - 6);
            rectRed.setAttribute('height', h - 6);
            rectWhite.setAttribute('width', w - 6);
            rectWhite.setAttribute('height', h - 6);

            const totalLength = (w - 6 + h - 6) * 2;
            const segment = totalLength / this.maxMoves;

            const dashArrayWhite = [];
            const dashArrayRed = [];

            // 根據 maxMoves 產生固定數量的段落，確保 transition 平滑
            for (let i = 1; i <= this.maxMoves; i++) {
                const isVisible = i <= this.movesLeft;
                // 奇數格為白色，偶數格為紅色 (假設 maxMoves 為偶數，則最後一格為紅色)
                // 第一次交換 (32->31) 會移除最後一格 (i=32)，即紅線
                const isRedSlot = (i % 2 === 0);

                if (isVisible) {
                    if (isRedSlot) {
                        // 此格顯示紅色：白環此處為 Gap(0, segment)，紅環此處為 Dash(segment, 0)
                        dashArrayWhite.push(0, segment);
                        dashArrayRed.push(segment, 0);
                    } else {
                        // 此格顯示白色：白環此處為 Dash(segment, 0)，紅環此處為 Gap(0, segment)
                        dashArrayWhite.push(segment, 0);
                        dashArrayRed.push(0, segment);
                    }
                } else {
                    // 已消耗步數：兩環皆為 Gap
                    dashArrayWhite.push(0, segment);
                    dashArrayRed.push(0, segment);
                }
            }

            rectRed.style.strokeDasharray = dashArrayRed.join(' ');
            rectWhite.style.strokeDasharray = dashArrayWhite.join(' ');
        },

        gameWin: function () {
            this.isActive = false;
            this.isWinning = true;
            clearInterval(this.timerInterval);

            // 立即重繪盤面以表演四柱齊跳動畫
            this.renderLevel();

            // 將剩餘步數設定給 timer，讓 ScoreManager 能正確計算加成獎勵
            this.timer = this.movesLeft;
            this.maxTimer = this.maxMoves;

            // 禁用重來按鈕
            document.getElementById('game9-retryGame-btn').disabled = true;
            document.getElementById('game9-newGame-btn').disabled = true;   //必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數

            // Using standard win animation
            if (window.ScoreManager && typeof window.ScoreManager.playWinAnimation === 'function') {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game9',
                    timerContainerId: 'game9-timer-ring',
                    scoreElementId: 'game9-score',
                    heartsSelector: '#game9-hearts .game9-heart.score',
                    onComplete: (finalScore) => {
                        this.gameOver(true, finalScore);
                    }
                });
            } else {
                this.gameOver(true, this.score + 100);
            }
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            // 僅在挑戰成功 isWin 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game9-retryGame-btn').disabled = true; // 必須在得分表演之前就先禁用重來按鈕
                document.getElementById('game9-newGame-btn').disabled = true; //必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();

            } else {
                document.getElementById('game9-retryGame-btn').disabled = false;
                document.getElementById('game9-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
            }
            clearInterval(this.timerInterval);

            const msg = document.getElementById('game9-message');
            document.getElementById('game9-msg-title').textContent = win ? "鎖扣解開" : "錯綜難解";
            document.getElementById('game9-msg-title').style.color = win ? "hsl(145, 66%, 30%)" : "hsl(0, 60%, 50%)";
            document.getElementById('game9-msg-content').textContent = win ? `得分：${reason}` : (reason || "無法繼續");

            setTimeout(() => {
                msg.classList.remove('hidden');
                const msgBtn = document.getElementById('game9-msg-btn');
                if (win) {
                    if (this.isLevelMode) {
                        msgBtn.textContent = "下一關";
                        if (window.ScoreManager) {
                            window.ScoreManager.completeLevel('game9', this.difficulty, this.currentLevelIndex);
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

    window.Game9 = Game9;

    if (new URLSearchParams(window.location.search).get('game') === '9') {
        setTimeout(() => {
            if (window.Game9) window.Game9.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
