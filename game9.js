/* game9.js - 詩韻鎖扣 (Nuts & Bolts: Verse) */

(function () {
    'use strict';

    const Game9 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,
        timer: 0,
        maxTimer: 0,
        timerInterval: null,

        moveInfo: [], // for undo

        // difficulty config
        // 難度設定：星星數、螺絲數、空槽數、時間(秒)、是否有提示、是否有撤銷、移動次數上限、每回合可交換螺絲數
        /*難度參數詳細說明，hasHint: true表示有提示，undo: true表示有撤銷，moveLimit: 0表示沒有移動次數上限，exchangeQuantity: 2表示控制題目難度的預先的交換螺絲數，totalNumberOfExchange: 16表示題目總共預先交換的次數(越多次越難)*/
        //color: hard, expert 可使用深色且難以辨識的顏色
        difficultySettings: {
            '小學': { stars: 6, bolts: 6, emptyBolts: 2, time: 90, hasHint: 'all', undo: true, moveLimit: 0, exchangeQuantity: 2, totalNumberOfExchange: 16 },
            '中學': { stars: 5, bolts: 6, emptyBolts: 2, time: 120, hasHint: 'firstEnd', undo: true, moveLimit: 0, exchangeQuantity: 3, totalNumberOfExchange: 32 },
            '高中': { stars: 4, bolts: 6, emptyBolts: 2, time: 150, hasHint: 'first', undo: true, moveLimit: 0, exchangeQuantity: 4, totalNumberOfExchange: 64 },
            '大學': { stars: 4, bolts: 6, emptyBolts: 2, time: 180, hasHint: 'end', undo: true, moveLimit: 0, exchangeQuantity: 5, totalNumberOfExchange: 96 },
            '研究所': { stars: 3, bolts: 6, emptyBolts: 2, time: 240, hasHint: 'none', undo: false, moveLimit: 0, color: 'hard', exchangeQuantity: 7, totalNumberOfExchange: 128 }
        },

        currentPoem: null,
        lines: [], // array of objects parsing the poem into lines

        // Nuts state: array of bolts, each bolt is an array of nuts
        bolts: [],
        completedBolts: [], // Track completed bolts to prevent repeated animations
        newlyCompletedBoltIdx: -1, // Specifically for the one-time jump animation
        selectedNut: null,
        selectedBoltIndex: -1,
        selectedNutCount: 0, // Track how many nuts are selected
        movesMade: 0,

        container: null,

        // Audio notes for clink
        audioCtx: null,

        init: function () {
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
                        <button id="game9-undo-btn" class="nav-btn game9-undo-btn" disabled>撤銷</button>
                        <button id="game9-restart-btn" class="nav-btn">重來</button>
                        <button id="game9-newGame-btn" class="nav-btn newGame-btn">開新局</button>
                    </div>
                </div>
                <div class="game9-sub-header">
                    <div id="game9-hearts" class="game9-hearts"></div>
                </div>
                <div class="game9-area">
                    <svg id="game9-timer-ring">
                        <rect id="game9-timer-path" x="2" y="2"></rect>
                    </svg>
                    <div class="game9-difficulty-tag" id="game9-diff-tag">小學</div>
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

        bindEvents: function () {
            document.getElementById('game9-restart-btn').onclick = () => this.retryGame();
            document.getElementById('game9-newGame-btn').onclick = () => this.startNewGame();
            document.getElementById('game9-msg-btn').onclick = () => {
                document.getElementById('game9-message').classList.add('hidden');
                this.startNewGame();
            };
            document.getElementById('game9-poem-info').onclick = () => {
                if (window.PoemDialog && this.currentPoem) window.PoemDialog.openById(this.currentPoem.id);
            };
            document.getElementById('game9-undo-btn').onclick = () => {
                this.undoMove();
            };
        },

        show: function () {
            this.init();
            if (window.DifficultySelector) {
                window.DifficultySelector.show('遊戲九：詩韻鎖扣', (level) => {
                    this.difficulty = level;
                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.initAudio();
                    this.startNewGame();
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

        startNewGame: function () {
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        selectRandomPoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.stars;

            // 建立所有符合條件的 (poem, startIndex) 候選組合
            // 條件：從奇數索引（0, 2, 4...）開始的連續4句，每句的 line_ratings 都 >= minRating
            const candidates = [];
            POEMS.forEach(poem => {
                if (!poem.content || poem.content.length < 4) return;
                const lineRatings = poem.line_ratings || [];

                // 從奇數起始點（索引0, 2, 4...）嘗試連續取4句
                for (let i = 0; i <= poem.content.length - 4; i += 2) {
                    // 檢查這4句的每一句 line_ratings 是否都符合難度要求
                    let allQualify = [0, 1, 2, 3].every(offset => {
                        const lr = lineRatings[i + offset];
                        return lr !== undefined && lr >= minRating;
                    });

                    if (!allQualify) {
                        // 檢查前2句的每一句 line_ratings 是否都符合難度要求
                        allQualify = [0, 1].every(offset => {
                            const lr = lineRatings[i + offset];
                            return lr !== undefined && lr >= minRating;
                        });
                    }
                    if (!allQualify) {
                        // 檢查後2句的每一句 line_ratings 是否都符合難度要求
                        allQualify = [2, 3].every(offset => {
                            const lr = lineRatings[i + offset];
                            return lr !== undefined && lr >= minRating;
                        });
                    }

                    if (allQualify) {
                        candidates.push({ poem, startIndex: i });
                    }
                }
            });

            // 若無完全符合的候選，降級：只要詩整體評分 >= minRating 且有4句即可
            let finalCandidates = candidates;
            if (finalCandidates.length === 0) {
                POEMS.forEach(poem => {
                    if (!poem.content || poem.content.length < 4) return;
                    if ((poem.rating || 0) >= minRating) {
                        for (let i = 0; i <= poem.content.length - 4; i += 2) {
                            finalCandidates.push({ poem, startIndex: i });
                        }
                    }
                });
            }

            // 最終 fallback：任意有4句的詩
            if (finalCandidates.length === 0) {
                POEMS.forEach(poem => {
                    if (poem.content && poem.content.length >= 4) {
                        finalCandidates.push({ poem, startIndex: 0 });
                    }
                });
            }

            if (finalCandidates.length === 0) return false;

            // 隨機挑一個候選
            const chosen = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
            this.currentPoem = chosen.poem;
            const startIndex = chosen.startIndex;

            // 取連續4句
            this.lines = [];
            for (let i = 0; i < 4; i++) {
                const rawLine = chosen.poem.content[startIndex + i];
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

        startGameProcess: function (isRetry) {
            // 啟用重來按鈕
            document.getElementById('game9-restart-btn').disabled = false;
            this.isActive = true;
            this.score = 0;
            this.movesMade = 0;
            this.moveInfo = [];

            const settings = this.difficultySettings[this.difficulty];
            document.getElementById('game9-diff-tag').textContent = this.difficulty;
            document.getElementById('game9-score').textContent = this.score;
            document.getElementById('game9-message').classList.add('hidden');

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

            if (settings.time > 0) {
                this.maxTimer = settings.time;
                this.timer = this.maxTimer;
                document.getElementById('game9-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game9-timer-ring').style.display = 'none';
            }
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

                    // Only apply animation class if it's the one that JUST finished
                    if (this.newlyCompletedBoltIdx === boltIdx) {
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
            if (settings.moveLimit > 0) {
                p.textContent = `步數: ${this.movesMade}/${settings.moveLimit}`;
            } else {
                p.textContent = `步數: ${this.movesMade}`;
            }
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
                    this.selectedBoltIndex = -1;
                    this.selectedNutCount = 0;

                    if (this.checkBoltCompleted(targetBolt)) {
                        this.playNote('complete');
                        // Add to completed session trackers if newly completed
                        if (!this.completedBolts.includes(boltIdx)) {
                            this.completedBolts.push(boltIdx);
                            this.newlyCompletedBoltIdx = boltIdx; // Mark for animation
                        }
                        // Score formula calculation for completing a stack
                        //this.score += 20 * count / this.lines[targetBolt[0].colorGroup].length;
                        //我把計分改成以該螺絲串的長度為基礎
                        this.score += 20 * (this.lines[targetBolt[0].colorGroup].length - difficultySettings[this.difficulty].exchangeQuantity);
                        document.getElementById('game9-score').textContent = Math.round(this.score);
                    } else {
                        // If it WAS completed but now we pulled something out (not possible if pick blocked), but for safety:
                        const cIdx = this.completedBolts.indexOf(boltIdx);
                        if (cIdx !== -1) {
                            this.completedBolts.splice(cIdx, 1);
                        }
                        this.playNote('drop');
                    }

                    this.updateProgressText();
                    this.renderLevel();

                    // Reset newly completed flag after one render pass
                    this.newlyCompletedBoltIdx = -1;

                    this.checkGameEnd();
                } else {
                    this.playNote('error');
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
            this.lastTime = Date.now();
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
                const now = Date.now();
                const dt = (now - this.lastTime) / 1000;
                this.lastTime = now;
                this.timer -= dt;

                this.updateTimerRing();

                if (this.timer <= 0) {
                    this.timer = 0;
                    this.updateTimerRing();
                    clearInterval(this.timerInterval);
                    this.gameOver(false, "時辰已到。");
                }
            }, 50);
        },

        updateTimerRing: function () {
            const ratio = this.timer / this.maxTimer;
            const rect = document.getElementById('game9-timer-path');
            const wrapper = document.querySelector('.game9-area');
            const svg = document.getElementById('game9-timer-ring');
            if (!rect || !wrapper || !svg) return;

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

            rect.setAttribute('width', w - 4);
            rect.setAttribute('height', h - 4);

            const perimeter = (w - 4 + h - 4) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - Math.max(0, Math.min(1, ratio)));
        },

        gameWin: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            // 禁用重來按鈕
            document.getElementById('game9-restart-btn').disabled = true;   // 必須在得分表演之前就先禁用重來按鈕

            // Using standard win animation
            if (window.ScoreManager && typeof window.ScoreManager.playWinAnimation === 'function') {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game9',
                    timerContainerId: 'game9-timer-ring', // Optional, depends on game structure, using ring container
                    scoreElementId: 'game9-score',
                    heartsSelector: '#game9-hearts .game9-heart.score', // Ensure we only count active hearts if any (game9 doesn't use hearts strictly, but we can pass it if we add them later)
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
            // 僅在挑戰成功 isWin 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game9-restart-btn').disabled = true; // 必須在得分表演之前就先禁用重來按鈕
            } else {
                document.getElementById('game9-restart-btn').disabled = false;
            }
            clearInterval(this.timerInterval);

            const msg = document.getElementById('game9-message');
            document.getElementById('game9-msg-title').textContent = win ? "鎖扣解開" : "錯綜難解";
            document.getElementById('game9-msg-title').style.color = win ? "hsl(145, 66%, 30%)" : "hsl(0, 60%, 50%)";
            document.getElementById('game9-msg-content').textContent = win ? `得分：${reason}` : (reason || "無法繼續");

            setTimeout(() => {
                msg.classList.remove('hidden');
            }, 500);
        }
    };

    window.Game9 = Game9;

    if (window.location.search.includes('game=9')) {
        setTimeout(() => {
            if (window.Game9) window.Game9.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);
    }
})();
