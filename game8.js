(function () {
    const Game8 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,

        // Game state
        currentPoem: null,
        fullPoemText: "", // Just the raw characters without punctuation
        poemLines: [],    // Array of strings (raw characters per line)
        gridData: [],     // 6x8 array of objects: { char, isTarget, targetIndex, isObstacle }
        gridElements: [], // 6x8 array of DOM elements

        // Interaction state
        isDragging: false,
        currentPath: [],  // Array of { row, col }
        completedTargetIndex: 0, // How many target characters have been successfully connected
        currentPhase: 0,  // For primary/middle school (split phases)
        phases: [],       // Array of { startIndex, length }
        successfulStrokes: [], // Array of arrays of { row, col }

        // Timer
        timer: 0,
        timerInterval: null,
        startTime: 0,
        maxTimer: 0,

        // Audio Context (for zither notes)
        audioCtx: null,
        notes: [261.63, 293.66, 329.63, 392.00, 440.00], // C D E G A (Pentatonic)
        /*hints 提示方式：all 提示黃光在開頭與結尾字且整句都用粗體顯示、start 提示黃光在開頭且只顯示開頭、startEnd顯示提示黃光在開頭與結尾字、none 不顯示
        splitPath 斷句：true 可以斷句連接(只完成一句、兩句、三句或是整個題目，由程式自動判斷玩家的輸入)、false 連續(強制必須一次完成整個題目的所有字)
        maxMistake 最大錯誤次數：999 無限制、3 三次、2 兩次、1 一次、0 零次
        time 時間限制：0 無限制、90 九十秒、60 六十秒、45 四十五秒
        obstacles 障礙物數量：0 無障礙、10 十個、20 二十個
        decoyPool 誘餌池：normal 普通、hard 困難*/
        difficultySettings: {
            '小學': { hints: 'all', splitPath: true, maxMistake: 8, time: 70, obstacles: 0, decoyPool: 'normal', stars: 6 },
            '中學': { hints: 'startEnd', splitPath: true, maxMistake: 6, time: 60, obstacles: 0, decoyPool: 'normal', stars: 5 },
            '高中': { hints: 'start', splitPath: true, maxMistake: 4, time: 50, obstacles: 0, decoyPool: 'normal', stars: 4 },
            '大學': { hints: 'startEnd', splitPath: false, maxMistake: 2, time: 45, obstacles: 0, decoyPool: 'normal', stars: 4 },
            '研究所': { hints: 'none', splitPath: false, maxMistake: 1, time: 40, obstacles: 0, decoyPool: 'hard', stars: 3 }
        },

        decoySets: {
            people: "你妳我他她它父母爺娘公婆兄弟姊妹人子吾余夫妻婦妾君卿爾奴汝彼此伊客君主翁",
            season: "春夏秋冬晨晝暮夜夕宵日月星辰漢輝曦雲霓虹雷電霽霄昊蒼溟",
            weather: "陰晴風雨雪霜露霧霞虹暖寒涼暑晦暗亮光明清冽空氣嵐",
            environment: "山嶺峰嶽丘陵原野石岩磐礫沙塵泥壤漠海江河川溪瀑澗流湖泊沼澤水淵深潭泉",
            color: "紅絳朱丹彤緋橙黃綠碧翠蔥藍縹蒼靛紫白皓素皚黑玄緇黛烏墨金銀銅鐵灰",
            plant: "花草梅蘭竹菊荷蓮桂桃李杏梨棠芍薔榴葵蘆荻芷蕙蘅薇薔薇柳松",
            common: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長"
        },

        loadCSS: function () {
            if (!document.getElementById('game8-css')) {
                const link = document.createElement('link');
                link.id = 'game8-css';
                link.rel = 'stylesheet';
                link.href = 'game8.css';
                document.head.appendChild(link);
            }
        },

        initAudio: function () {
            try {
                if (!this.audioCtx) {
                    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                }
            } catch (e) {
                console.warn("Web Audio API not supported", e);
            }
        },

        playNote: function (index) {
            if (!this.audioCtx) return;
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            const freq = this.notes[index % this.notes.length];
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

            gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 1);

            osc.start();
            osc.stop(this.audioCtx.currentTime + 1);
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game8-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game8-container');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game8-container';
            div.className = 'game8-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game8-header">
                    <div class="game8-score-board">分數: <span id="game8-score">0</span></div>
                    <div class="game8-controls">
                        <button id="game8-restart-btn" class="nav-btn">重來</button>
                        <button id="game8-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game8-sub-header">
                    <div id="game8-hearts" class="hearts"></div>
                </div>
                <div class="game8-area">
                    <div class="game8-difficulty-tag" id="game8-diff-tag">小學</div>
                    <div class="game8-info">
                        <div id="game8-poem-info" class="poem-info" style="cursor: pointer; text-decoration: underline; opacity: 0.8;"></div>
                        <div id="game8-progress-text" class="game8-progress-text"></div>
                    </div>
                    <div id="game8-grid-wrapper" class="game8-grid-wrapper">
                        <svg id="game8-timer-ring">
                            <rect id="game8-timer-path" x="3" y="3"></rect>
                        </svg>
                        <svg class="game8-svg-layer">
                            <path id="game8-current-path" class="game8-path"></path>
                        </svg>
                        <svg class="game8-svg-layer">
                            <path id="game8-completed-path" class="game8-path"></path>
                        </svg>
                        <div id="game8-grid" class="game8-grid"></div>
                    </div>
                </div>
                <div id="game8-message" class="game8-message hidden">
                    <h2 id="game8-msg-title">遊戲結束</h2>
                    <p id="game8-msg-content"></p>
                    <button id="game8-msg-btn" class="nav-btn">繼續</button>
                </div>
            `;
            document.body.appendChild(div);

            document.getElementById('game8-newGame-btn').onclick = () => this.startNewGame();
            document.getElementById('game8-restart-btn').onclick = () => this.retryGame();
            document.getElementById('game8-msg-btn').onclick = () => {
                document.getElementById('game8-message').classList.add('hidden');
                this.startNewGame();
            };

            const gridWrapper = document.getElementById('game8-grid-wrapper');
            gridWrapper.addEventListener('mousedown', this.onDragStart.bind(this));
            gridWrapper.addEventListener('mousemove', this.onDragMove.bind(this));
            window.addEventListener('mouseup', this.onDragEnd.bind(this));
            gridWrapper.addEventListener('touchstart', this.onDragStart.bind(this), { passive: false });
            gridWrapper.addEventListener('touchmove', this.onDragMove.bind(this), { passive: false });
            window.addEventListener('touchend', this.onDragEnd.bind(this));
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            document.getElementById('game8-message').classList.add('hidden');
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('遊戲八：一筆裁詩', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    this.initAudio();
                    this.restartGame();
                });
            }
        },

        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) {
                this.container.classList.add('hidden');
            }
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

        restartGame: function () {
            this.startNewGame();
        },

        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.completedTargetIndex = 0;
            this.currentPhase = 0;
            this.successfulStrokes = [];

            document.getElementById('game8-score').textContent = this.score;
            document.getElementById('game8-message').classList.add('hidden');
            document.getElementById('game8-current-path').setAttribute('d', '');
            document.getElementById('game8-completed-path').setAttribute('d', '');
            document.getElementById('game8-current-path').style.opacity = 1;

            const settings = this.difficultySettings[this.difficulty];
            this.renderHearts();

            if (!isRetry) {
                this.generateLevel();
            } else {
                this.renderGrid();
            }

            this.updateProgressText();
            this.applyHints();

            const diffTag = document.getElementById('game8-diff-tag');
            if (diffTag) diffTag.textContent = this.difficulty;

            if (settings.time > 0) {
                this.maxTimer = settings.time;
                this.timer = this.maxTimer;
                document.getElementById('game8-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game8-timer-ring').style.display = 'none';
            }
        },

        selectRandomPoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;

            const settings = this.difficultySettings[this.difficulty];

            // Choose poems that have 20 or 40 chars (5-char or 7-char quatrain)
            // and filter by rating (stars) similar to Game 6
            let validPoems = POEMS.filter(p => {
                const text = p.content.join('').replace(/[，。？！、：；「」『』\s]/g, "");
                return (text.length >= 20 && text.length <= 40) && (p.rating >= settings.stars);
            });

            // Fallback: if no poems match BOTH criteria, loosen the rating requirement
            if (validPoems.length === 0) {
                validPoems = POEMS.filter(p => {
                    const text = p.content.join('').replace(/[，。？！、：；「」『』\s]/g, "");
                    return (text.length >= 20 && text.length <= 40);
                });
            }

            if (validPoems.length === 0) return false;

            this.currentPoem = validPoems[Math.floor(Math.random() * validPoems.length)];
            this.fullPoemText = this.currentPoem.content.join('').replace(/[，。？！、：；「」『』\s]/g, "");

            this.poemLines = [];
            this.currentPoem.content.forEach(line => {
                const pureLine = line.replace(/[，。？！、：；「」『』\s]/g, "");
                if (pureLine.length > 0) this.poemLines.push(pureLine);
            });

            // Set up phases
            this.phases = [];
            document.getElementById('game8-poem-info').textContent = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            document.getElementById('game8-poem-info').onclick = () => {
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        generateLevel: function () {
            // Setup grid data matrix (8 rows x 6 cols)
            this.gridData = Array(8).fill().map(() => Array(6).fill(null));
            const settings = this.difficultySettings[this.difficulty];

            let pathLength = this.fullPoemText.length;
            let generatedPath = this.generateRandomPath(pathLength, settings.obstacles);

            if (!generatedPath) {
                // Fallback simply generate again without obstacles
                generatedPath = this.generateRandomPath(pathLength, 0);
            }

            // Fill target path
            for (let i = 0; i < pathLength; i++) {
                const p = generatedPath[i];
                this.gridData[p.row][p.col] = {
                    char: this.fullPoemText[i],
                    isTarget: true,
                    targetIndex: i,
                    isObstacle: false
                };
            }

            // Define phases based on difficulty
            if (settings.splitPath) {
                let currentIndex = 0;
                for (let i = 0; i < this.poemLines.length; i++) {
                    this.phases.push({
                        startIndex: currentIndex,
                        length: this.poemLines[i].length
                    });
                    currentIndex += this.poemLines[i].length;
                }
            } else {
                this.phases.push({
                    startIndex: 0,
                    length: pathLength
                });
            }

            // Generate decoys pool
            let decoyPool = [];
            if (settings.decoyPool === 'hard') {
                // Hard mode: similar characters
                // Fallback to pool based on components, here simplified to mixed sets
                const sets = Object.values(this.decoySets).join('');
                for (let i = 0; i < sets.length; i++) decoyPool.push(sets[i]);
            } else {
                decoyPool = this.decoySets.common.split('');
            }
            decoyPool.sort(() => Math.random() - 0.5);

            // Fill empty spots and obstacles
            let obstacleCountDecided = settings.obstacles;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 6; c++) {
                    if (this.gridData[r][c] === null) {
                        if (obstacleCountDecided > 0 && Math.random() < 0.2) {
                            this.gridData[r][c] = {
                                char: '',
                                isTarget: false,
                                targetIndex: -1,
                                isObstacle: true
                            };
                            obstacleCountDecided--;
                        } else {
                            this.gridData[r][c] = {
                                char: decoyPool.pop() || '之',
                                isTarget: false,
                                targetIndex: -1,
                                isObstacle: false
                            };
                        }
                    }
                }
            }

            this.renderGrid();
        },

        generateRandomPath: function (length, numObstacles) {
            // Very simple back-tracking to find a path of length `length` in 6x8 board
            let path = [];
            let visited = Array(8).fill().map(() => Array(6).fill(false));

            // Try random starts
            const starts = [];
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 6; c++) starts.push({ r, c });
            }
            starts.sort(() => Math.random() - 0.5);

            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

            const dfs = (r, c, depth) => {
                path.push({ row: r, col: c });
                visited[r][c] = true;

                if (depth === length) return true;

                // Randomize directions
                let d = [...dirs].sort(() => Math.random() - 0.5);
                for (let i = 0; i < 4; i++) {
                    const nr = r + d[i][0];
                    const nc = c + d[i][1];
                    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 6 && !visited[nr][nc]) {
                        if (dfs(nr, nc, depth + 1)) return true;
                    }
                }

                path.pop();
                visited[r][c] = false;
                return false;
            };

            for (let s of starts) {
                if (dfs(s.r, s.c, 1)) {
                    return path;
                }
            }
            return null;
        },

        renderGrid: function () {
            const container = document.getElementById('game8-grid');
            container.innerHTML = '';
            this.gridElements = Array(8).fill().map(() => Array(6).fill(null));

            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 6; c++) {
                    const cellData = this.gridData[r][c];
                    const div = document.createElement('div');
                    div.className = 'game8-cell';
                    div.dataset.r = r;
                    div.dataset.c = c;

                    if (cellData.isObstacle) {
                        div.classList.add('obstacle');
                    } else {
                        div.textContent = cellData.char;
                    }
                    container.appendChild(div);
                    this.gridElements[r][c] = div;
                }
            }
            this.completedTargetIndex = 0;
            this.currentPhase = 0;
            this.currentPath = [];
            this.successfulStrokes = [];

            // clear success paths layout
            const svgLayer = document.querySelector('.game8-svg-layer');
            if (svgLayer) {
                const paths = svgLayer.querySelectorAll('.game8-path.success-path');
                paths.forEach(p => p.remove());
            }

            this.updateCompletedPath();
        },

        updateProgressText: function () {
            if (this.currentPhase >= this.phases.length) {
                document.getElementById('game8-progress-text').textContent = '全詩連線：已完成';
                return;
            }

            const phase = this.phases[this.currentPhase];
            if (!phase) return;

            let targetWordCount = phase.length;
            let currentPathLength = this.currentPath.length;

            // IF splitPath is true, maybe path goes into next phases!
            const settings = this.difficultySettings[this.difficulty];
            if (settings.splitPath) {
                let checkIdx = phase.startIndex;
                for (let i = this.currentPhase; i < this.phases.length; i++) {
                    if (currentPathLength >= (checkIdx + this.phases[i].length - phase.startIndex)) {
                        targetWordCount = (checkIdx + this.phases[i].length - phase.startIndex);
                        checkIdx += this.phases[i].length;
                        // Check if still going...
                        if (currentPathLength === targetWordCount) break;
                    } else if (currentPathLength > 0) {
                        targetWordCount = (checkIdx + this.phases[i].length - phase.startIndex);
                        break; // We are in the middle of completing an extended phase
                    } else {
                        break;
                    }
                }
            }

            const txt = document.getElementById('game8-progress-text');
            if (settings.splitPath) {
                // To accurately tell the user which phases they are drawing, calculate end phase
                let startPhaseLabel = this.currentPhase + 1;
                let endPhaseLabel = startPhaseLabel;

                let checkLength = 0;
                for (let i = this.currentPhase; i < this.phases.length; i++) {
                    checkLength += this.phases[i].length;
                    if (targetWordCount >= checkLength) {
                        endPhaseLabel = i + 1;
                    }
                }

                let phaseLabelStr = `第 ${startPhaseLabel} 句`;
                if (endPhaseLabel > startPhaseLabel) phaseLabelStr = `第 ${startPhaseLabel}~${endPhaseLabel} 句`;

                txt.textContent = `${phaseLabelStr}：已連 ${currentPathLength} / ${targetWordCount} 字`;
            } else {
                txt.textContent = `全詩連線：已連 ${currentPathLength} / ${targetWordCount} 字`;
            }
        },

        applyHints: function () {
            const settings = this.difficultySettings[this.difficulty];
            const phase = this.phases[this.currentPhase];
            if (!phase) return;

            // Clear hints
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 6; c++) {
                    if (this.gridElements[r][c]) {
                        this.gridElements[r][c].classList.remove('start-hint', 'target-hint');
                    }
                }
            }

            if (settings.hints === 'all') {
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 6; c++) {
                        const d = this.gridData[r][c];
                        if (d.isTarget && d.targetIndex >= phase.startIndex && d.targetIndex < phase.startIndex + phase.length) {
                            this.gridElements[r][c].classList.add('target-hint'); // bold whole sentence/poem
                            if (d.targetIndex === phase.startIndex || d.targetIndex === phase.startIndex + phase.length - 1) {
                                this.gridElements[r][c].classList.add('start-hint'); // highlight start and end
                            }
                        }
                    }
                }
            } else if (settings.hints === 'start') {
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 6; c++) {
                        const d = this.gridData[r][c];
                        if (d.isTarget && d.targetIndex === phase.startIndex) {
                            this.gridElements[r][c].classList.add('start-hint');
                        }
                    }
                }
            } else if (settings.hints === 'startEnd') {
                for (let r = 0; r < 8; r++) {
                    for (let c = 0; c < 6; c++) {
                        const d = this.gridData[r][c];
                        if (d.isTarget && (d.targetIndex === phase.startIndex || d.targetIndex === phase.startIndex + phase.length - 1)) {
                            this.gridElements[r][c].classList.add('start-hint');
                        }
                    }
                }
            }
        },

        getCellFromEvent: function (e) {
            let src = e.target;
            if (e.touches && e.touches.length > 0) {
                const touch = e.touches[0];
                src = document.elementFromPoint(touch.clientX, touch.clientY);
            }
            if (src && src.classList && src.classList.contains('game8-cell')) {
                return {
                    r: parseInt(src.dataset.r),
                    c: parseInt(src.dataset.c),
                    el: src
                };
            }
            return null;
        },

        onDragStart: function (e) {
            if (!this.isActive) return;
            e.preventDefault(); // Prevent scrolling on touch

            const cell = this.getCellFromEvent(e);
            if (!cell) return;

            const d = this.gridData[cell.r][cell.c];
            if (d.isObstacle) return;

            // Must start at the expected target index
            const expectedIndex = this.phases[this.currentPhase].startIndex;

            // We allow starting the path anywhere, validity is checked on end
            // But if they didn't even tap the first character correct, we still draw lines visually 
            // and fail them on mouse up.

            this.isDragging = true;
            this.currentPath = [{ row: cell.r, col: cell.c }];
            cell.el.classList.add('selected');

            let currentIdx = this.successfulStrokes.length;
            cell.el.classList.add(`cell-color-${(currentIdx % 8) + 1}`);

            this.playNote(0);
            this.updateCurrentPathDraw();
            this.updateProgressText();

            document.getElementById('game8-current-path').style.opacity = 1;

            if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
        },

        onDragMove: function (e) {
            if (!this.isDragging || !this.isActive) return;
            if (e.cancelable) e.preventDefault();

            const cell = this.getCellFromEvent(e);
            if (!cell) return;

            const lastNode = this.currentPath[this.currentPath.length - 1];

            if (cell.r === lastNode.row && cell.c === lastNode.col) return; // Same cell as last

            const d = this.gridData[cell.r][cell.c];
            if (d.isObstacle) return;

            // Check if adjacent (not diagonal)
            const isAdjacent = Math.abs(cell.r - lastNode.row) + Math.abs(cell.c - lastNode.col) === 1;

            if (isAdjacent) {
                // Check if unvisited in current path
                const visitedIndex = this.currentPath.findIndex(p => p.row === cell.r && p.col === cell.c);
                if (visitedIndex === -1) {
                    // Valid step
                    this.currentPath.push({ row: cell.r, col: cell.c });
                    cell.el.classList.add('selected');
                    let currentIdx = this.successfulStrokes.length;
                    cell.el.classList.add(`cell-color-${(currentIdx % 8) + 1}`);

                    this.playNote(this.currentPath.length - 1);
                    this.updateCurrentPathDraw();
                    this.updateProgressText();
                    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
                } else if (visitedIndex === this.currentPath.length - 2) {
                    // Backtracking (undo last step)
                    const popped = this.currentPath.pop();
                    this.gridElements[popped.row][popped.col].classList.remove('selected');
                    let currentIdx = this.successfulStrokes.length;
                    this.gridElements[popped.row][popped.col].classList.remove(`cell-color-${(currentIdx % 8) + 1}`);

                    this.updateCurrentPathDraw();
                    this.updateProgressText();
                    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(5);
                }
            }
        },

        onDragEnd: function (e) {
            if (!this.isDragging || !this.isActive) return;
            this.isDragging = false;

            const phase = this.phases[this.currentPhase];

            const settings = this.difficultySettings[this.difficulty];

            // Validate Path
            let isValid = false;
            let phasesCompleted = 0;

            if (settings.splitPath) {
                // If splitPath is true, allow completing multiple phases at once
                let targetIdx = phase.startIndex;
                for (let i = 0; i < this.currentPath.length; i++) {
                    const p = this.currentPath[i];
                    const d = this.gridData[p.row][p.col];
                    // Compare character instead of exact targetIndex to handle duplicates
                    if (d.char !== this.fullPoemText[targetIdx]) {
                        break; // Incorrect character
                    }
                    targetIdx++;
                }

                // See how many FULL phases we completed
                let checkIdx = phase.startIndex;
                for (let i = this.currentPhase; i < this.phases.length; i++) {
                    if (targetIdx >= checkIdx + this.phases[i].length) {
                        phasesCompleted++;
                        checkIdx += this.phases[i].length;
                    } else {
                        break;
                    }
                }

                if (phasesCompleted > 0 && this.currentPath.length === (checkIdx - phase.startIndex)) {
                    isValid = true;
                }
            } else {
                // If splitPath is false, strict exactly 1 phase completion logic
                if (this.currentPath.length === phase.length) {
                    isValid = true;
                    for (let i = 0; i < this.currentPath.length; i++) {
                        const p = this.currentPath[i];
                        const d = this.gridData[p.row][p.col];
                        // Compare character instead of exact targetIndex to handle duplicates
                        if (d.char !== this.fullPoemText[phase.startIndex + i]) {
                            isValid = false;
                            break;
                        }
                    }
                    if (isValid) {
                        phasesCompleted = 1;
                    }
                }
            }

            if (isValid) {
                this.handlePhaseWin(phasesCompleted);
            } else {
                this.handleMistake();
            }

            // Temporary variable cleanup is now handled manually inside handlePhaseWin on success or here on fail
            if (!isValid) {
                // If mistake happen, remove selections
                let currentIdx = this.successfulStrokes.length;
                let colorClass = `cell-color-${(currentIdx % 8) + 1}`;
                this.currentPath.forEach(p => {
                    this.gridElements[p.row][p.col].classList.remove('selected');
                    this.gridElements[p.row][p.col].classList.remove(colorClass);
                });
                this.currentPath = [];
                this.updateCurrentPathDraw();
                this.updateProgressText();
            }
        },

        handlePhaseWin: function (phasesCompletedCount) {
            // Apply visual classes for correct color
            let currentColorClass = `path-color-${(this.successfulStrokes.length % 8) + 1}`;
            let currentCellColorClass = `cell-color-${(this.successfulStrokes.length % 8) + 1}`;

            // Commit to completed path visually
            for (let i = 0; i < this.currentPath.length; i++) {
                const p = this.currentPath[i];
                const el = this.gridElements[p.row][p.col];
                // Remove potential current drawing colors
                for (let c = 1; c <= 8; c++) el.classList.remove(`cell-color-${c}`);
                el.classList.remove('selected');

                el.classList.add('permanent-selected');
                el.classList.add(currentCellColorClass);

                // Requirement: Bold only the first char
                if (i === 0) el.classList.add('stroke-start');
                else el.classList.remove('stroke-start');

                this.completedTargetIndex++;
            }

            // Save this stroke
            this.successfulStrokes.push([...this.currentPath]);
            /*分數計算*/
            let points = 5 * this.currentPath.length;
            if (phasesCompletedCount >= 2) {
                points *= 2; // user request: 一筆完成兩句以上(splitPath = true)把這筆成績乘以2
            }
            this.score += points;
            document.getElementById('game8-score').textContent = this.score;

            this.currentPhase += phasesCompletedCount;
            this.updateCompletedPath();

            // Needs to be empty after handling phase logic
            this.currentPath = [];
            this.updateCurrentPathDraw();
            this.updateProgressText();

            if (this.currentPhase >= this.phases.length) {
                this.gameWin();
            } else {
                this.applyHints();
            }
        },

        handleMistake: function () {
            // Mistake effect
            const currentPathEl = document.getElementById('game8-current-path');
            currentPathEl.style.opacity = '0.3';
            setTimeout(() => {
                if (!this.isDragging) {
                    currentPathEl.setAttribute('d', '');
                    currentPathEl.style.opacity = '1';
                }
            }, 300);

            this.mistakeCount++;
            this.updateHearts();

            const maxM = this.difficultySettings[this.difficulty].maxMistake;
            if (this.mistakeCount >= maxM) {
                this.gameOver(false, '錯誤次數過多');
            }
        },

        updateCurrentPathDraw: function () {
            const d = this.generateSvgPathString(this.currentPath);
            const el = document.getElementById('game8-current-path');
            el.setAttribute('d', d);

            // Set dynamic color for current stroke
            let currentColorIdx = this.successfulStrokes.length;
            const colors = ['path-color-1', 'path-color-2', 'path-color-3', 'path-color-4', 'path-color-5', 'path-color-6', 'path-color-7', 'path-color-8'];
            const currentColorClass = colors[currentColorIdx % colors.length];

            // Remove previous color classes
            colors.forEach(clr => el.classList.remove(clr));
            el.classList.add(currentColorClass);
        },

        updateCompletedPath: function () {
            const completedPathEl = document.getElementById('game8-completed-path');
            if (!completedPathEl) return;
            const svgLayer = completedPathEl.parentElement;

            // clear old dynamically generated success paths
            const paths = svgLayer.querySelectorAll('.game8-path.success-path');
            paths.forEach(p => p.remove());

            const colors = ['path-color-1', 'path-color-2', 'path-color-3', 'path-color-4', 'path-color-5', 'path-color-6', 'path-color-7', 'path-color-8'];

            // Iterate over all successful strokes
            this.successfulStrokes.forEach((stroke, index) => {
                const dString = this.generateSvgPathString(stroke);
                const colorClass = colors[index % colors.length];

                const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
                pathEl.setAttribute('d', dString);

                // Add the class for the color and animation
                pathEl.setAttribute('class', `game8-path success-path ${colorClass}`);

                svgLayer.insertBefore(pathEl, completedPathEl);
            });
        },

        generateSvgPathString: function (pathArray) {
            if (pathArray.length === 0) return '';
            const gridWrapper = document.getElementById("game8-grid-wrapper");
            const w = gridWrapper.offsetWidth;
            const h = gridWrapper.offsetHeight;
            const cellW = w / 6;
            const cellH = h / 8;

            let d = '';
            pathArray.forEach((p, idx) => {
                const cx = (p.col + 0.5) * cellW;
                const cy = (p.row + 0.5) * cellH;
                if (idx === 0) d += `M ${cx} ${cy} `;
                else d += `L ${cx} ${cy} `;
            });
            return d;
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
                    this.gameOver(false, "時間到！");
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game8-timer-path');
            const wrapper = document.getElementById('game8-grid-wrapper');
            const svg = document.getElementById('game8-timer-ring');
            if (!rect || !wrapper || !svg) return;

            let w = wrapper.offsetWidth;
            let h = wrapper.offsetHeight;

            // If it's 0 (could happen at boot), try to fallback or wait
            if (w === 0 || h === 0) {
                const rectBox = wrapper.getBoundingClientRect();
                w = rectBox.width;
                h = rectBox.height;
            }
            if (w === 0) return;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block'; // Force visible if logic says so

            rect.setAttribute('width', w - 6);
            rect.setAttribute('height', h - 6);

            const perimeter = (w - 6 + h - 6) * 2;
            rect.style.strokeDasharray = perimeter;
            rect.style.strokeDashoffset = perimeter * (1 - Math.max(0, Math.min(1, ratio)));
        },

        renderHearts: function () {
            const container = document.getElementById('game8-hearts');
            if (!container) return;
            container.innerHTML = '';
            let max = this.difficultySettings[this.difficulty].maxMistake;
            if (max > 10) max = 0; // Don't show if unlimited
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game8-hearts .heart');
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

            // Using standard win animation
            ScoreManager.playWinAnimation({
                game: this,
                difficulty: this.difficulty,
                gameKey: 'game8',
                timerContainerId: 'game8-grid-wrapper',
                scoreElementId: 'game8-score',
                heartsSelector: '#game8-hearts .heart:not(.empty)',
                onComplete: (finalScore) => {
                    this.gameOver(true, finalScore);
                }
            });
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            clearInterval(this.timerInterval);

            const msgDiv = document.getElementById('game8-message');
            const title = document.getElementById('game8-msg-title');
            const content = document.getElementById('game8-msg-content');

            setTimeout(() => {
                msgDiv.classList.remove('hidden');
                if (win) {
                    title.textContent = "裁詩圓滿！";
                    title.style.color = "hsl(145, 66%, 30%)";
                    content.textContent = `得分：${reason}`;
                } else {
                    title.textContent = "功敗垂成";
                    title.style.color = "hsl(0, 60%, 50%)";
                    content.textContent = reason || "墨跡已散！";
                }
            }, 500);
        }
    };

    window.Game8 = Game8;

    if (window.location.search.includes('game=8')) {
        setTimeout(() => {
            if (window.Game8) window.Game8.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
