(function () {
    const Game8 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,

        // --- 遊戲狀態變數 ---
        currentPoem: null,     // 當前選中的詩詞物件
        fullPoemText: "",     // 乾淨的詩詞全文（過濾掉標點符號後的所有字）
        poemLines: [],        // 詩句陣列（存儲各行純文字，供分段判斷使用）
        gridData: [],         // 9x7 網格邏輯數據：{ char, isTarget, targetIndex, isObstacle }
        gridElements: [],     // 9x7 網格對應的 DOM 元素陣列

        // --- 玩家互動狀態 ---
        isDragging: false,    // 是否正在拖曳繪製路徑
        currentPath: [],      // 當前正在拖曳的路徑座標陣列 [{ row, col }, ...]
        completedTargetIndex: 0, // 累計已成功連線的目標字元索引
        currentPhase: 0,      // 當前正在挑戰的句數或階段索引
        phases: [],           // 遊戲階段定義：{ startIndex, length }
        successfulStrokes: [], // 已確認提交成功的筆畫路徑存檔

        // --- 計時器與進度控制 ---
        timer: 0,             // 剩餘時間百分比或數值
        timerInterval: null,  // 計時器節拍實例
        startTime: 0,         // 本局遊戲開始的時間戳
        maxTimer: 0,          // 根據困難度設定的總限時（秒）

        // --- 計時器與進度控制 ---
        /*hints 提示方式：all/startEnd/start/none
        splitPath 斷句：true=可分句完成、false=必須一次連完整首
        maxMistake 最大錯誤次數
        time 時間限制（秒，0=無限）
        obstacles 障礙物數量
        decoyPool 誘餌池：normal/hard
        stars 最低詩評rating
        minLines 最少句數（必須偶數，從奇數句開始連續挑選）
        maxChars 總字數上限*/
        difficultySettings: {
            '小學': { hints: 'all', splitPath: true, maxMistake: 6, time: 80, obstacles: 0, decoyPool: 'normal', stars: 6, minLines: 4, maxChars: 56 },
            '中學': { hints: 'startEnd', splitPath: true, maxMistake: 5, time: 75, obstacles: 0, decoyPool: 'normal', stars: 5, minLines: 4, maxChars: 56 },
            '高中': { hints: 'startEnd', splitPath: true, maxMistake: 4, time: 70, obstacles: 0, decoyPool: 'normal', stars: 4, minLines: 4, maxChars: 56 },
            '大學': { hints: 'start', splitPath: false, maxMistake: 3, time: 65, obstacles: 0, decoyPool: 'normal', stars: 3, minLines: 6, maxChars: 56 },
            '研究所': { hints: 'start', splitPath: false, maxMistake: 2, time: 60, obstacles: 0, decoyPool: 'hard', stars: 2, minLines: 8, maxChars: 56 }
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
                        <button id="game8-retryGame-btn" class="nav-btn">重來</button>
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

            document.getElementById('game8-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game8-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game8-msg-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                document.getElementById('game8-message').classList.add('hidden');
                if (this.isWin) this.startNewGame();
                else this.retryGame();
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
                    if (window.SoundManager) window.SoundManager.init();
                    this.startNewGame();
                });
            }
        },

        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container', 'game8-container'];
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

        //game8只有startGameProcess() 透過isRetry控制是否重來或是開新局
        startGameProcess: function (isRetry) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
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
            // 格子、提示、進度都準備完畢後才啟用重來按鈕
            document.getElementById('game8-retryGame-btn').disabled = false;
            document.getElementById('game8-newGame-btn').disabled = false;

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
            if (typeof getSharedRandomPoem !== 'function') {
                console.error("需要先載入 script.js 中的 getSharedRandomPoem 函數");
                return false;
            }

            const settings = this.difficultySettings[this.difficulty];
            const minLines = settings.minLines;
            const maxChars = settings.maxChars;
            const reqStars = settings.stars;

            // 呼叫全局選詩函數，maxLines 給 100 代表無上限，minChars 設定為 8 字
            const result = getSharedRandomPoem(reqStars, minLines, 100, 20, maxChars);

            if (!result) return false;

            this.currentPoem = result.poem;
            this.poemLines = result.lines;

            // fullPoemText：所選句子的所有字合併
            this.fullPoemText = this.poemLines.join('');

            // Set up phases
            this.phases = [];
            document.getElementById('game8-poem-info').textContent =
                `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            document.getElementById('game8-poem-info').onclick = () => {
                if (window.SoundManager) window.SoundManager.playGuzheng(4);
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // 生成關卡數據：建立 9x7 網格，產出隨機路徑填充目標文字，並填補誘餌文字
        generateLevel: function () {
            // 初始化網格數據矩陣 (9 列 x 7 欄)
            this.gridData = Array(9).fill().map(() => Array(7).fill(null));
            const settings = this.difficultySettings[this.difficulty];
            const pathLength = this.fullPoemText.length;

            // --- 新增：強迫強迫路徑迂迴規則 ---
            // 在設計路徑之前，先取出非答案文字的 1/3 字數，隨機擺放位置，強迫路徑繞道。
            const totalCells = 63; // 9x7
            const emptyCount = totalCells - pathLength;
            const preDecoyCount = Math.ceil(emptyCount / 3);
            const preOccupied = [];

            // 隨機抽選預放位置
            const allCoords = [];
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 7; c++) allCoords.push({ r, c });
            }
            allCoords.sort(() => Math.random() - 0.5);

            for (let i = 0; i < preDecoyCount; i++) {
                const coord = allCoords.pop();
                preOccupied.push(coord);
                // 暫時標記為預放誘餌
                this.gridData[coord.r][coord.c] = { isPreDecoy: true };
            }

            // 獲取路徑 (傳入預放位置資訊)
            let generatedPath = this.generateRandomPath(pathLength, settings.obstacles, preOccupied);

            if (!generatedPath) {
                // 如果預設權重導致死棋，則清除預放標記進行保底重試
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 7; c++) {
                        if (this.gridData[r][c] && this.gridData[r][c].isPreDecoy) this.gridData[r][c] = null;
                    }
                }
                generatedPath = this.generateRandomPath(pathLength, 0);
            }

            // 將目標路徑填入網格數據中
            for (let i = 0; i < pathLength; i++) {
                const p = generatedPath[i];
                this.gridData[p.row][p.col] = {
                    char: this.fullPoemText[i],
                    isTarget: true,
                    targetIndex: i,
                    isObstacle: false
                };
            }

            // 根據難度設定來劃分遊戲階段（是否分句挑戰）
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
                // 大學/研究所等高難度：必須一次連完整首詩
                this.phases.push({
                    startIndex: 0,
                    length: pathLength
                });
            }

            // 使用新的混淆字取用方法進行填充，參考鄰近正確路徑字元
            let obstacleCountDecided = settings.obstacles;
            const targetChars = this.fullPoemText.split('');
            const usedDecoys = new Set();

            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 7; c++) {
                    const existing = this.gridData[r][c];
                    if (existing === null || (existing && existing.isPreDecoy)) {
                        if (obstacleCountDecided > 0 && Math.random() < 0.2 && !(existing && existing.isPreDecoy)) {
                            this.gridData[r][c] = {
                                char: '',
                                isTarget: false,
                                targetIndex: -1,
                                isObstacle: true
                            };
                            obstacleCountDecided--;
                        } else {
                            // 搜尋周圍八格中的正確路徑字
                            let neighbors = [];
                            for (let dr = -1; dr <= 1; dr++) {
                                for (let dc = -1; dc <= 1; dc++) {
                                    if (dr === 0 && dc === 0) continue;
                                    const nr = r + dr, nc = c + dc;
                                    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 7) {
                                        const n = this.gridData[nr][nc];
                                        if (n && n.isTarget) {
                                            neighbors.push(n.char);
                                        }
                                    }
                                }
                            }

                            // 排除題目字與已用過的混淆字
                            const excludeChars = [...targetChars, ...Array.from(usedDecoys)];
                            const bestDecoy = window.SharedDecoy.getThematicDecoy(neighbors, excludeChars);
                            usedDecoys.add(bestDecoy);

                            this.gridData[r][c] = {
                                char: bestDecoy,
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

        generateRandomPath: function (length, numObstacles, preOccupied = []) {
            const ROWS = 9, COLS = 7;
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            const dirNames = ['U', 'D', 'L', 'R'];

            // 取得九宮格區塊編號 (盤面 9x7 分為 3x3 個區塊)
            const getRegion = (r, c) => {
                const rr = Math.floor(r / 3); // 0, 1, 2
                // 把 7欄 切成 3區：2欄, 3欄, 2欄 -> (0,1), (2,3,4), (5,6)
                const cc = c < 2 ? 0 : (c < 5 ? 1 : 2);
                return rr * 3 + cc;
            };

            // 內部函式：評估路徑品質 (指標包括：轉彎節奏、區域分佈、直線長度)
            const evaluatePath = (path) => {
                const regionCounts = Array(9).fill(0); // 記錄九個區塊各自被佔用的格數
                let currentStraight = 0;              // 當前連續直行的長度
                let lastDir = null;                   // 上一次移動的方向

                let perfectTurns = 0;   // 理想情況：走滿三格後進行一次 90 度轉彎
                let badStraights = 0;   // 扣分項：直線過長 (超過三格) 顯得無聊
                let prematureTurns = 0; // 扣分項：走不到三格就猴急轉彎，路徑會太破碎

                for (let i = 0; i < path.length; i++) {
                    const p = path[i];
                    regionCounts[getRegion(p.row, p.col)]++;

                    if (i > 0) {
                        const dr = p.row - path[i - 1].row;
                        const dc = p.col - path[i - 1].col;
                        const dir = `${dr},${dc}`;

                        if (dir === lastDir) {
                            currentStraight++;
                        } else {
                            if (lastDir !== null) {
                                if (currentStraight === 3) perfectTurns++;
                                else if (currentStraight < 3) prematureTurns++;
                                else badStraights++;
                            }
                            currentStraight = 1;
                            lastDir = dir;
                        }
                    } else {
                        currentStraight = 1;
                    }
                }

                if (currentStraight > 3) badStraights++;

                // 評估九宮格分佈均勻度
                let emptyRegions = 0;
                let singleCellRegions = 0;
                for (let i = 0; i < 9; i++) {
                    if (regionCounts[i] === 0) emptyRegions++;
                    if (regionCounts[i] === 1) singleCellRegions++;
                }

                // 檢查是否有兩個相鄰的空區域 (完全無路徑)
                let adjacentEmpty = 0;
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 3; c++) {
                        const idx = r * 3 + c;
                        if (regionCounts[idx] === 0) {
                            if (c < 2 && regionCounts[r * 3 + c + 1] === 0) adjacentEmpty++; // 右側
                            if (r < 2 && regionCounts[(r + 1) * 3 + c] === 0) adjacentEmpty++; // 下方
                        }
                    }
                }

                return { emptyRegions, singleCellRegions, adjacentEmpty, perfectTurns, badStraights, prematureTurns };
            };

            // 啟發式 DFS，嘗試生成單條路徑
            const tryGenerate = (startR, startC) => {
                let path = [];
                let visited = Array(ROWS).fill().map(() => Array(COLS).fill(false));

                // 將預放的誘餌文字標記為已訪問，強迫路徑繞道
                preOccupied.forEach(coord => {
                    visited[coord.r][coord.c] = true;
                });

                // 如果起點剛好被預放位佔用，則此次嘗試失敗
                if (visited[startR][startC]) return null;

                let iterations = 0;
                const MAX_ITER = 4000; // 設定上限避免過度消耗效能

                // 內部函式：深度優先搜尋 (DFS) 用於探測路徑
                const dfs = (r, c, depth, lastDir, currentStraight) => {
                    iterations++;
                    if (iterations > MAX_ITER) return false; // 預防遞迴過深導致瀏覽器卡死

                    path.push({ row: r, col: c });
                    visited[r][c] = true;
                    if (depth === length) return true; // 順利找齊目標長度，成功回傳

                    let candidates = [];
                    for (let di = 0; di < dirs.length; di++) {
                        const d = dirs[di];
                        const nr = r + d[0], nc = c + d[1];
                        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || visited[nr][nc]) continue;

                        let exits = 0;
                        for (const dd of dirs) {
                            const nnr = nr + dd[0], nnc = nc + dd[1];
                            if (nnr >= 0 && nnr < ROWS && nnc >= 0 && nnc < COLS && !visited[nnr][nnc]) exits++;
                        }

                        // 判斷出路，若周圍無出路且尚未達到目標長度，剪枝
                        if (exits === 0 && depth + 1 < length) continue;

                        const thisDir = dirNames[di];
                        const isStraight = (lastDir === thisDir);
                        const newStraight = isStraight ? currentStraight + 1 : 1;

                        // 取消之前的 Warnsdorff 規則 (也就是哪裡出路少走哪裡)，因為網格中最少出路的地方永遠是邊緣和角落。
                        // 我們要建立自己的趨中性與轉彎計分系統。
                        let prefScore = 0;

                        if (exits === 1 && depth + 1 < length) {
                            // 唯一出路，為了避免製造死棋，這步必須給予極高分數絕對優先走。
                            prefScore += 1000;
                        } else {
                            // 1. 基礎趨中性：避免過度貼牆，稍微引導回中央腹地
                            const distToCenter = Math.abs(nr - 4) + Math.abs(nc - 3);
                            prefScore += (10 - distToCenter) * 2;

                            // 2. 對角發展性 (新規則)：傾向朝目前位置的對角線對應區發展，使路徑更活潑且橫跨各區
                            // 例如：在左上 (0,0) 時，目標朝向右下 (8,6) 引導
                            const targetR = 8 - r;
                            const targetC = 6 - c;
                            const distToDiagonalTarget = Math.abs(nr - targetR) + Math.abs(nc - targetC);
                            prefScore += (14 - distToDiagonalTarget) * 5;

                            // 3. 節奏控制：不要急著轉彎，三格直線再轉彎是最適合的
                            if (lastDir !== null) {
                                if (isStraight) {
                                    if (currentStraight < 3) prefScore += 20; // 鼓勵保持直走達到3格
                                    else prefScore -= 20;                     // 超過3格則極力勸退
                                } else {
                                    if (currentStraight === 3) prefScore += 30; // 走滿三格後轉彎給予獎勵
                                    else prefScore += 5;                         // 未滿三格轉彎給予微小分數
                                }
                            }
                        }

                        // 加入隨機性，讓不同嘗試能走不同分支
                        prefScore += Math.random() * 40;

                        candidates.push({ nr, nc, dir: thisDir, straight: newStraight, prefScore });
                    }

                    // 完全依照我們的自訂喜好分數進行排序 (分數高的優先)
                    candidates.sort((a, b) => b.prefScore - a.prefScore);

                    for (const cand of candidates) {
                        if (dfs(cand.nr, cand.nc, depth + 1, cand.dir, cand.straight)) {
                            return true;
                        }
                    }

                    path.pop();
                    visited[r][c] = false;
                    return false;
                };

                if (dfs(startR, startC, 1, null, 1)) return path;
                return null;
            };

            // 1. 確實地隨機從 7x9 中準備所有的格子候選名單，打亂順序以確保隨機抽出
            const allCoords = [];
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    allCoords.push({ r, c });
                }
            }
            allCoords.sort(() => Math.random() - 0.5);

            let bestPath = null;
            let bestScore = -Infinity;
            const maxAttemptsPerStart = 60; // 在同一個起點下，反覆嘗試不同方向以找出完美路線的次數

            // 隨機抽選起點
            for (let sIdx = 0; sIdx < allCoords.length; sIdx++) {
                const startR = allCoords[sIdx].r;
                const startC = allCoords[sIdx].c;

                let foundAnyPath = false;

                // 2. 任何嘗試新路徑都要以上述選定的單一「起始位置」開始，才能公平比較
                for (let attempt = 0; attempt < maxAttemptsPerStart; attempt++) {
                    const path = tryGenerate(startR, startC);
                    if (!path) continue; // 這條死胡同

                    foundAnyPath = true;
                    const metrics = evaluatePath(path);

                    let quality = 0;

                    // 正分項：越符合「三格一轉」就加越多分
                    quality += metrics.perfectTurns * 25;

                    // 負分項：嚴厲懲罰沒有做好的擴散或太長無聊的直線
                    quality -= metrics.emptyRegions * 200; //評估九宮格分佈均勻度，找到第一個宮格空格就減分較多
                    quality -= metrics.singleCellRegions * 100; //持續評估是否仍有九宮格的空洞，每一格扣分。
                    quality -= metrics.adjacentEmpty * 600; //評估是否有相鄰九宮格的皆是空洞，嚴重扣分
                    quality -= metrics.badStraights * 30; //評估是否有太長的直線(等於或超過四格)，略為減分

                    if (quality > bestScore) {
                        bestScore = quality;
                        bestPath = path;
                    }
                }

                // 一旦「這一個起點」有成功產出任何路線並挑出最佳解，遊戲就結束尋找，固定這個起點。
                if (foundAnyPath) {
                    break;
                }
            }

            // Fallback (若多次嘗試都在同一起點死胡同失敗，則更換起點進行保底演算)
            if (!bestPath) {
                let allStarts = [];
                for (let r = 0; r < ROWS; r++) {
                    for (let c = 0; c < COLS; c++) {
                        allStarts.push({ r, c });
                    }
                }
                allStarts.sort(() => Math.random() - 0.5);

                for (let attempt = 0; attempt < allStarts.length; attempt++) {
                    const { r, c } = allStarts[attempt];
                    let path = this.tryGenerateFallback(r, c, ROWS, COLS, length);
                    if (path) {
                        bestPath = path;
                        break;
                    }
                }
            }

            return bestPath;
        },

        // 保底演算法：純 Warnsdorff 規則，保證能產出路徑
        tryGenerateFallback: function (startR, startC, ROWS, COLS, length) {
            let path = [];
            let visited = Array(ROWS).fill().map(() => Array(COLS).fill(false));
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];

            const dfs = (r, c, depth) => {
                path.push({ row: r, col: c });
                visited[r][c] = true;
                if (depth === length) return true;

                let candidates = [];
                for (let di = 0; di < dirs.length; di++) {
                    const d = dirs[di];
                    const nr = r + d[0], nc = c + d[1];
                    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || visited[nr][nc]) continue;

                    let exits = 0;
                    for (const dd of dirs) {
                        const nnr = nr + dd[0], nnc = nc + dd[1];
                        if (nnr >= 0 && nnr < ROWS && nnc >= 0 && nnc < COLS && !visited[nnr][nnc]) exits++;
                    }

                    // 加上微小的隨機擾動防止完全固定
                    candidates.push({ nr, nc, exits: exits + Math.random() * 0.5 });
                }

                // 出路越少的越優先
                candidates.sort((a, b) => a.exits - b.exits);

                for (const cand of candidates) {
                    if (dfs(cand.nr, cand.nc, depth + 1)) return true;
                }

                path.pop();
                visited[r][c] = false;
                return false;
            };

            if (dfs(startR, startC, 1)) return path;
            return null;
        },

        renderGrid: function () {
            const container = document.getElementById('game8-grid');
            container.innerHTML = '';
            this.gridElements = Array(9).fill().map(() => Array(7).fill(null));

            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 7; c++) {
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

            // 清除上次遊戲留下的舊路徑 SVG 元素
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

            // 若啟用了分句路徑 (splitPath)，則需要判斷當前輸入是否跨越多個階段
            const settings = this.difficultySettings[this.difficulty];
            if (settings.splitPath) {
                let checkIdx = phase.startIndex;
                for (let i = this.currentPhase; i < this.phases.length; i++) {
                    // 檢查當前連線長度是否已涵蓋至下一句
                    if (currentPathLength >= (checkIdx + this.phases[i].length - phase.startIndex)) {
                        targetWordCount = (checkIdx + this.phases[i].length - phase.startIndex);
                        checkIdx += this.phases[i].length;
                        // 若剛好連到句子末端則跳出
                        if (currentPathLength === targetWordCount) break;
                    } else if (currentPathLength > 0) {
                        targetWordCount = (checkIdx + this.phases[i].length - phase.startIndex);
                        break; // 正在連線某個跨句路徑中
                    } else {
                        break;
                    }
                }
            }

            const txt = document.getElementById('game8-progress-text');
            if (settings.splitPath) {
                // 精確計算並顯示玩家目前正橫跨哪些句子
                let startPhaseLabel = this.currentPhase + 1;
                let endPhaseLabel = startPhaseLabel;

                let checkLength = 0;
                for (let i = this.currentPhase; i < this.phases.length; i++) {
                    checkLength += this.phases[i].length;
                    if (targetWordCount >= checkLength) {
                        endPhaseLabel = i + 1;
                    }
                }

                let phaseLabelStr = `第 ${startPhaseLabel}/${this.phases.length} 句`;
                if (endPhaseLabel > startPhaseLabel) phaseLabelStr = `第 ${startPhaseLabel}~${endPhaseLabel}/${this.phases.length} 句`;

                txt.textContent = `${phaseLabelStr}：已連 ${currentPathLength} / ${targetWordCount} 字`;
            } else {
                txt.textContent = `全詩連線：已連 ${currentPathLength} / ${targetWordCount} 字`;
            }
        },

        applyHints: function () {
            const settings = this.difficultySettings[this.difficulty];
            const phase = this.phases[this.currentPhase];
            if (!phase) return;

            // 清除地圖上所有舊的提示樣式
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 7; c++) {
                    if (this.gridElements[r][c]) {
                        this.gridElements[r][c].classList.remove('start-hint', 'target-hint');
                    }
                }
            }

            if (settings.hints === 'all') {
                // 「全文提示」：加粗顯示當前整句的所有字串。
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 7; c++) {
                        const d = this.gridData[r][c];
                        // 檢查格子是否為目標字，且其索引在當前詩句的範圍內。
                        if (d.isTarget && d.targetIndex >= phase.startIndex && d.targetIndex < phase.startIndex + phase.length) {
                            this.gridElements[r][c].classList.add('target-hint'); // 全句加粗。
                            // 如果是詩句的起點或終點，則額外加上「start-hint」樣式，使其更突出。
                            if (d.targetIndex === phase.startIndex || d.targetIndex === phase.startIndex + phase.length - 1) {
                                this.gridElements[r][c].classList.add('start-hint'); // 起點與終點加光圈。
                            }
                        }
                    }
                }
            } else if (settings.hints === 'start') {
                // 「起點提示」：只提示當前詩句的第一個字。
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 7; c++) {
                        const d = this.gridData[r][c];
                        // 檢查格子是否為目標字，且其索引是當前詩句的起始索引。
                        if (d.isTarget && d.targetIndex === phase.startIndex) {
                            this.gridElements[r][c].classList.add('start-hint'); // 提示起點。
                        }
                    }
                }
            } else if (settings.hints === 'startEnd') {
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 7; c++) {
                        const d = this.gridData[r][c];
                        if (d.isTarget && (d.targetIndex === phase.startIndex || d.targetIndex === phase.startIndex + phase.length - 1)) {
                            this.gridElements[r][c].classList.add('start-hint');
                        }
                    }
                }
            }
        },

        // 從滑鼠或觸控事件中取得對應的網格座標與 DOM 元素
        getCellFromEvent: function (e) {
            let src = e.target;
            if (e.touches && e.touches.length > 0) {
                const touch = e.touches[0];
                // 觸控模式下使用 elementFromPoint 識別座標下的元素
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

        // 處理拖曳開始事件：初始化路徑並播放起點音效
        onDragStart: function (e) {
            if (!this.isActive) return;
            e.preventDefault(); // 阻擋觸控時的頁面捲動

            const cell = this.getCellFromEvent(e);
            if (!cell) return;

            const d = this.gridData[cell.r][cell.c];
            if (d.isObstacle) return; // 障礙物不可作為起點

            // 設定拖曳狀態為真，並初始化路徑
            this.isDragging = true;
            this.currentPath = [{ row: cell.r, col: cell.c }];
            cell.el.classList.add('selected');

            // 根據當前已完成的筆畫數量決定本次路徑的顏色
            let currentIdx = this.successfulStrokes.length;
            cell.el.classList.add(`cell-color-${(currentIdx % 8) + 1}`);

            if (window.SoundManager) window.SoundManager.playGuzheng(0); // 播放宮聲
            this.updateCurrentPathDraw();
            this.updateProgressText();

            document.getElementById('game8-current-path').style.opacity = 1;

            if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
        },

        // 處理拖曳過程中的移動事件：計算鄰近性並支援「原路退回」撤銷操作
        onDragMove: function (e) {
            if (!this.isDragging || !this.isActive) return;
            if (e.cancelable) e.preventDefault();

            const cell = this.getCellFromEvent(e);
            if (!cell) return;

            const lastNode = this.currentPath[this.currentPath.length - 1];

            if (cell.r === lastNode.row && cell.c === lastNode.col) return; // 停留在同一格則忽略

            const d = this.gridData[cell.r][cell.c];
            if (d.isObstacle) return; // 障礙物不可滑入

            // 檢查是否為相鄰格子 (僅限上下左右)
            const isAdjacent = Math.abs(cell.r - lastNode.row) + Math.abs(cell.c - lastNode.col) === 1;

            if (isAdjacent) {
                // 檢查該格是否已在當前路徑中
                const visitedIndex = this.currentPath.findIndex(p => p.row === cell.r && p.col === cell.c);
                if (visitedIndex === -1) {
                    // 合法的新步：加入路徑併播放音階
                    this.currentPath.push({ row: cell.r, col: cell.c });
                    cell.el.classList.add('selected');
                    let currentIdx = this.successfulStrokes.length;
                    cell.el.classList.add(`cell-color-${(currentIdx % 8) + 1}`);
                    // 播放音階，最高21階，避免太刺耳。
                    if (window.SoundManager) window.SoundManager.playGuzheng((this.currentPath.length - 1) % 21);
                    this.updateCurrentPathDraw();
                    this.updateProgressText();

                    // 自動判斷是否過關 (當連到全題目最後一個字且內容正確時)
                    this.checkAutoWin();

                    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(10);
                } else if (visitedIndex === this.currentPath.length - 2) {
                    // 原路退回：這代表玩家後悔了，移除最後一步以達成撤銷
                    const popped = this.currentPath.pop();
                    this.gridElements[popped.row][popped.col].classList.remove('selected');
                    let currentIdx = this.successfulStrokes.length;
                    this.gridElements[popped.row][popped.col].classList.remove(`cell-color-${(currentIdx % 8) + 1}`);
                    // 播放音階，最高21階，避免太刺耳。
                    if (window.SoundManager) window.SoundManager.playGuzheng((this.currentPath.length - 1) % 21);

                    this.updateCurrentPathDraw();
                    this.updateProgressText();
                    if (window.navigator && window.navigator.vibrate) window.navigator.vibrate(5);
                }
            }
        },

        // 處理拖曳結束：驗證玩家劃出的路徑是否與目標詩句文字吻合
        onDragEnd: function (e) {
            if (!this.isDragging || !this.isActive) return;
            this.isDragging = false;

            const phase = this.phases[this.currentPhase];
            const settings = this.difficultySettings[this.difficulty];

            // 驗證邏輯
            let isValid = false;
            let phasesCompleted = 0;

            if (settings.splitPath) {
                // 分句挑戰模式：允許一筆劃完成多個句子
                let targetIdx = phase.startIndex;
                for (let i = 0; i < this.currentPath.length; i++) {
                    const p = this.currentPath[i];
                    const d = this.gridData[p.row][p.col];
                    // 根據字元進行内容比對（而非 targetIndex，以應對同字異位的重疊可能）
                    if (d.char !== this.fullPoemText[targetIdx]) {
                        break; // 內容不符
                    }
                    targetIdx++;
                }

                // 計算本次操作總共完整完成了多少個階段/句子
                let checkIdx = phase.startIndex;
                for (let i = this.currentPhase; i < this.phases.length; i++) {
                    if (targetIdx >= checkIdx + this.phases[i].length) {
                        phasesCompleted++;
                        checkIdx += this.phases[i].length;
                    } else {
                        break;
                    }
                }

                // 只有在剛好完成多個完整句數，且路徑長度與內容完全吻合時才判為有效
                if (phasesCompleted > 0 && this.currentPath.length === (checkIdx - phase.startIndex)) {
                    isValid = true;
                }
            } else {
                // 嚴格模式：一次只能挑戰當前定義的一個階段（整首詩）
                if (this.currentPath.length === phase.length) {
                    isValid = true;
                    for (let i = 0; i < this.currentPath.length; i++) {
                        const p = this.currentPath[i];
                        const d = this.gridData[p.row][p.col];
                        if (d.char !== this.fullPoemText[phase.startIndex + i]) {
                            isValid = false;
                            break;
                        }
                    }
                    if (isValid) phasesCompleted = 1;
                }
            }

            if (isValid) {
                this.handlePhaseWin(phasesCompleted);
            } else {
                this.handleMistake();
            }

            // 若驗證失敗，清除所有選取效果並重置路徑
            if (!isValid) {
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
            if (window.SoundManager) window.SoundManager.playSuccess();
        },

        // 自動過關檢測：判斷當前一筆劃是否正確畫到了全詩的最後一個字
        checkAutoWin: function () {
            if (this.currentPath.length === 0) return;

            const lastPoemCharIndex = this.fullPoemText.length - 1;
            const lastCellInPath = this.currentPath[this.currentPath.length - 1];
            const lastCellData = this.gridData[lastCellInPath.row][lastCellInPath.col];

            // 必須畫到全詩最後一個字
            if (!lastCellData.isTarget || lastCellData.targetIndex !== lastPoemCharIndex) return;

            // 檢查當前路徑內容是否與剩下的詩句完全相符
            let isValid = true;
            let targetIdx = this.completedTargetIndex;
            for (let i = 0; i < this.currentPath.length; i++) {
                const p = this.currentPath[i];
                if (this.gridData[p.row][p.col].char !== this.fullPoemText[targetIdx]) {
                    isValid = false;
                    break;
                }
                targetIdx++;
            }

            // 如果正確且完成全文
            if (isValid && targetIdx === this.fullPoemText.length) {
                const phasesRemaining = this.phases.length - this.currentPhase;
                this.isDragging = false; // 停止拖曳狀態，避免 onDragEnd 再次處理
                this.handlePhaseWin(phasesRemaining);
            }
        },

        // 發生錯誤時的處理：震動效果、扣心、以及判斷是否遊戲結束
        handleMistake: function () {
            if (window.SoundManager) window.SoundManager.playFailure();
            // 閃爍效果：路徑變淡後消失
            const currentPathEl = document.getElementById('game8-current-path');
            currentPathEl.style.opacity = '0.3';
            setTimeout(() => {
                if (!this.isDragging) {
                    currentPathEl.setAttribute('d', '');
                    currentPathEl.style.opacity = '1';
                }
            }, 300);

            this.mistakeCount++;
            this.updateHearts(); // 更新心心顯示

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
            const cellW = w / 7;  // 7 欄
            const cellH = h / 9;  // 9 列

            let d = '';
            pathArray.forEach((p, idx) => {
                const cx = (p.col + 0.5) * cellW;
                const cy = (p.row + 0.5) * cellH;
                if (idx === 0) d += `M ${cx} ${cy} `;
                else d += `L ${cx} ${cy} `;
            });
            return d;
        },

        // 啟動計時器：定時計算流逝時間並更新計時環
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

        // 更新計時環的 SVG 樣式：計算周長並根據剩餘比例設定 stroke-dashoffset
        updateTimerRing: function (ratio) {
            const rect = document.getElementById('game8-timer-path');
            const wrapper = document.getElementById('game8-grid-wrapper');
            const svg = document.getElementById('game8-timer-ring');
            if (!rect || !wrapper || !svg) return;

            let w = wrapper.offsetWidth;
            let h = wrapper.offsetHeight;

            // 若寬度為 0 (可能剛載入尚未渲染)，嘗試備用方案
            if (w === 0 || h === 0) {
                const rectBox = wrapper.getBoundingClientRect();
                w = rectBox.width;
                h = rectBox.height;
            }
            if (w === 0) return;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';

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
            // 禁用重來按鈕
            document.getElementById('game8-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            document.getElementById('game8-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數

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
            this.isWin = win;
            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game8-retryGame-btn').disabled = true; // 必須在得分表演之前就先禁用重來按鈕
                document.getElementById('game8-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game8-retryGame-btn').disabled = false;
                document.getElementById('game8-newGame-btn').disabled = false;
            }
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
                const msgBtn = document.getElementById('game8-msg-btn');
                if (win) {
                    msgBtn.textContent = "下一局";
                } else {
                    msgBtn.textContent = "再試一次";
                }
            }, 500);
        }
    };

    window.Game8 = Game8;

    if (new URLSearchParams(window.location.search).get('game') === '8') {
        setTimeout(() => {
            if (window.Game8) window.Game8.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
