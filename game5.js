/* game5.js - 詩詞小精靈 (Poetry Pac-Man) */

(function () {
    'use strict';

    const Game5 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakes: 0,
        maxMistakes: 5,
        timer: 0,
        timeLimit: 0,
        timerInterval: null,

        // 迷宮設定
        gridSize: 20, // 每格像素大小（會依畫面尺寸動態調整）
        rows: 21,
        cols: 19,
        maze: [], // 二維陣列：0 = 通道, 1 = 牆壁

        // 遊戲物件（玩家與怪物等）
        player: null,
        monsters: [],
        playerPath: [], // 記錄玩家移動的路徑資料
        isGhostHouseClosed: false, // 鬼屋是否已經關閉
        foods: [], // 場上文字精靈清單，每筆為 { char, row, col, index }
        collectedCount: 0,
        targetPoem: null,
        targetChars: [], // 需要依序收集的目標文字（答案字）

        // 視覺效果
        enemyDirection: 1, // 1 向右, -1 向左
        trails: [], // 玩家移動軌跡，每筆為 {x, y, alpha}

        // 動畫控制
        requestID: null,
        lastTime: 0,

        // 自動遊玩（Auto-Play）相關狀態
        isAutoPlaying: false,
        autoPlayPath: [],
        evasionPath: [],             // 新增：儲存避險路徑
        autoPlayState: 'SEEKING',     // SEEKING, EVADING
        dangerousMonsters: [],
        dangerousMonstersPaths: [],   // 記錄威脅小精靈的攔截路徑
        isPaused: false,              // 新增：遊戲暫停狀態
        gameStartTime: null,          // 本局開始時的時間戳（Date.now()），用於計算 duration_s

        // 輸入控制（觸控滑動）
        touchStart: { x: 0, y: 0 },
        minSwipeDist: 30,

        // 地圖比例調整 (1.0 = 原始寬度比例, 2.0 = 兩倍寬度)
        mapScale: 1.0,

        // 失誤後冷卻與閃爍
        mistakePenaltyDuration: 150,
        // 難度設定對照表
        // timeLimitRate: 每字時間倍率（秒），實際時限 = 實際收集字數 × timeLimitRate
        // poemMinRating: 詩詞評分要求,
        // maxMistakeCount: 最大錯誤次數,
        // monsters: 怪物數量,
        // answerLen: 需收集的文字長度,
        // hintDuration: 下一個字提示閃爍持續時間,
        // lostInt/lostDur: 小精靈故意失誤的相隔時間與失誤持續時間
        difficultySettings: {
            '小學': { timeLimitRate: 10, poemMinRating: 6, maxMistakeCount: 7, monsters: 2, answerLen: 5, hintDuration: -1, lostInt: -2000, lostDur: 1500 },
            '中學': { timeLimitRate: 9, poemMinRating: 5, maxMistakeCount: 6, monsters: 3, answerLen: 7, hintDuration: -1, lostInt: -1000, lostDur: 1000 },
            '高中': { timeLimitRate: 8, poemMinRating: 4, maxMistakeCount: 5, monsters: 4, answerLen: 10, hintDuration: -1, lostInt: -500, lostDur: 500 },
            '大學': { timeLimitRate: 7, poemMinRating: 3, maxMistakeCount: 4, monsters: 4, answerLen: 12, hintDuration: -1, lostInt: 0, lostDur: 500 },
            '研究所': { timeLimitRate: 6, poemMinRating: 3, maxMistakeCount: 3, monsters: 4, answerLen: 14, hintDuration: -1, lostInt: 0, lostDur: 0 }
        },

        // 迷宮版面配置 (1 = 牆壁, 0 = 通道, 2 = 鬼屋)
        mazeLayout: [
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1],
            [1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1],
            [1, 1, 1, 1, 0, 1, 0, 1, 2, 2, 2, 1, 0, 1, 0, 1, 1, 1, 1], // 傳送隧道所在列
            [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
            [1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1],
            [1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1],
            [1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
            [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1],
            [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            [1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1],
            [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        ],

        // 初始化遊戲：若容器已存在則略過，否則建立 DOM 並綁定事件
        init: function () {
            if (document.getElementById('game5-container')) return;
            this.createDOM();
            this.bindEvents();
        },

        // 建立遊戲畫面所需的 DOM 結構（頭部、紅心、目標詩句、迷宮畫布、計時器等）
        createDOM: function () {
            const container = document.createElement('div');
            container.id = 'game5-container';
            container.className = 'game5-overlay  hidden';
            container.innerHTML = `
                <div class="game5-header">
                    <div class="game5-score-board">得分: <span id="game5-score">0</span></div>
                    <div class="game5-controls">
                        <button class="game5-difficulty-tag" id="game5-diff-tag">小學</button>
                        <button id="game5-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game5-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                
                <div class="game5-sub-header">
                    <div id="game5-hearts" class="game5-hearts"></div>
                </div>
                <div id="game5-target-poem" class="game5-target-poem">
                </div>

                <div class="game5-maze-container">
                    <svg id="game5-timer-ring">
                        <rect id="game5-timer-path" x="3" y="3"></rect>
                    </svg>
                    <canvas id="game5-canvas"></canvas>
                </div>
                
                <div class="game5-ui-area">
                    <div id="game5-timer" class="game5-timer-container">時間：-</div>
                    <div class="game5-instruction">拖曳或滑動以移動角色</div>
                </div>
                
                </div>
            `;
            document.body.appendChild(container);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    container.style.left = r.left + 'px';
                    container.style.top = r.top + 'px';
                    container.style.width = 500 + 'px';
                    container.style.height = 850 + 'px';
                    container.style.transform = 'scale(' + r.scale + ')';
                    container.style.transformOrigin = 'top left';
                });
            }

            this.canvas = document.getElementById('game5-canvas');
            this.ctx = this.canvas.getContext('2d');
        },

        // 綁定所有互動事件：按鈕點擊、滑鼠拖曳、觸控滑動、鍵盤操作
        bindEvents: function () {
            //綁定game5-diff-tag按鍵
            document.getElementById('game5-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.showDifficultySelector();
            };
            //綁定game5-retryGame-btn按鍵
            document.getElementById('game5-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            //綁定game5-newGame-btn按鍵
            document.getElementById('game5-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };

            // 滑鼠拖曳滑動偵測（供桌機測試使用）
            let isMouseDown = false;
            let mouseStart = { x: 0, y: 0 };
            const container = document.getElementById('game5-container');

            container.addEventListener('mousedown', (e) => {
                isMouseDown = true;
                mouseStart.x = e.clientX;
                mouseStart.y = e.clientY;
            });

            window.addEventListener('mousemove', (e) => {
                if (!isMouseDown) return;
                const dx = e.clientX - mouseStart.x;
                const dy = e.clientY - mouseStart.y;
                if (Math.abs(dx) > this.minSwipeDist || Math.abs(dy) > this.minSwipeDist) {
                    if (Math.abs(dx) > Math.abs(dy)) this.handleInput(dx > 0 ? 'RIGHT' : 'LEFT');
                    else this.handleInput(dy > 0 ? 'DOWN' : 'UP');
                    isMouseDown = false; // 避免重複觸發
                }
            });

            window.addEventListener('mouseup', () => isMouseDown = false);

            // 觸控滑動偵測（供行動裝置使用）
            container.addEventListener('touchstart', (e) => {
                this.touchStart.x = e.touches[0].clientX;
                this.touchStart.y = e.touches[0].clientY;
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (!this.isActive) return;
                const dx = e.touches[0].clientX - this.touchStart.x;
                const dy = e.touches[0].clientY - this.touchStart.y;
                if (Math.abs(dx) > this.minSwipeDist || Math.abs(dy) > this.minSwipeDist) {
                    if (Math.abs(dx) > Math.abs(dy)) this.handleInput(dx > 0 ? 'RIGHT' : 'LEFT');
                    else this.handleInput(dy > 0 ? 'DOWN' : 'UP');

                    this.touchStart.x = e.touches[0].clientX;
                    this.touchStart.y = e.touches[0].clientY;
                }
            }, { passive: true });

            // 鍵盤操作（供測試使用：方向鍵移動、Alt+A 切換自動遊玩、空白鍵暫停）
            window.addEventListener('keydown', (e) => {
                if (!this.isActive) return;
                switch (e.key) {
                    case 'ArrowUp': this.handleInput('UP'); break;
                    case 'ArrowDown': this.handleInput('DOWN'); break;
                    case 'ArrowLeft': this.handleInput('LEFT'); break;
                    case 'ArrowRight': this.handleInput('RIGHT'); break;
                }

                // Alt + A to toggle Auto-Play
                if (e.altKey && (e.key === 'a' || e.key === 'A')) {
                    e.preventDefault();
                    this.toggleAutoPlay();
                }

                // Space to toggle Pause
                if (e.key === ' ') {
                    e.preventDefault();
                    this.togglePause();
                }
            }
            );
        },

        // 切換遊戲暫停/繼續狀態
        togglePause: function () {
            if (!this.isActive) return;
            this.isPaused = !this.isPaused;
            this.showAutoPlayStatus(this.isPaused ? "遊戲暫停" : "遊戲繼續");
        },


        // 切換自動遊玩（AI 代打）開關
        toggleAutoPlay: function () {
            if (!this.isActive) return;
            this.isAutoPlaying = !this.isAutoPlaying;
            this.showAutoPlayStatus(this.isAutoPlaying ? "自動遊玩：開啟" : "自動遊玩：關閉");
        },

        // 在畫面中央短暫顯示狀態提示文字（例如「遊戲暫停」「自動遊玩：開啟」）
        showAutoPlayStatus: function (text) {
            let statusEl = document.getElementById('game5-autoplay-status');
            if (!statusEl) {
                statusEl = document.createElement('div');
                statusEl.id = 'game5-autoplay-status';
                statusEl.style.cssText = `
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0,0,0,0.7);
                    color: gold;
                    padding: 10px 20px;
                    border-radius: 20px;
                    font-weight: bold;
                    pointer-events: none;
                    z-index: 1000;
                    opacity: 0;
                    transition: opacity 0.3s;
                `;
                document.getElementById('game5-container').appendChild(statusEl);
            }
            statusEl.textContent = text;
            statusEl.style.opacity = '1';
            setTimeout(() => { statusEl.style.opacity = '0'; }, 1000);
        },

        // 自動遊玩每幀呼叫：判斷玩家是否位於格子中心（可轉彎時機），
        // 若是則呼叫 findBestDirection 計算下一步該往哪個方向走
        autoPlayMove: function () {
            if (!this.player || !this.isActive || this.isDying) return;

            const pg = this.getGridPos(this.player.x, this.player.y);
            const gridMid = this.gridSize / 2;
            const offX = Math.abs(this.player.x - (pg.c * this.gridSize + gridMid));
            const offY = Math.abs(this.player.y - (pg.r * this.gridSize + gridMid));
            const isAtCenter = offX < this.player.speed && offY < this.player.speed;

            // 只在中心點或是目前方向被阻擋時才計算新方向
            const canContinue = this.canMoveFromCell(pg.r, pg.c, this.player.dir, true);

            if (isAtCenter || !canContinue) {
                const target = this.foods.find(f => f.index === this.collectedCount);
                if (!target) return;
                const targetPos = { r: target.row, c: target.col };
                const nextDir = this.findBestDirection(pg, targetPos);
                if (nextDir) {
                    this.player.nextDir = nextDir;
                }
            }
        },


        // * 核心 AI 決策邏輯：遵循 3 步驟循環尋找安全路徑
        // * 此函數負責計算玩家的最佳移動方向，並產生黃色（計畫）、藍色（繞道）、紅色（危險） 路徑視覺化。

        findBestDirection: function (start, target) {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

            // --- 0. 初始化可視化清單 ---
            // 這些清單會被 draw() 函數用來渲染 AI 的「思維」
            this.autoPlayPath = [];         // 步驟 1：黃色計畫路徑 (原始意圖)
            this.evasionPath = [];          // 步驟 3：藍色避險路徑 (成功的繞道)
            this.dangerousMonsters = [];    // 紅圈：當前對玩家構成威脅的小精靈
            this.dangerousMonstersPaths = []; // 紅點：威脅小精靈預計攔截玩家的路徑

            const target1 = target;

            // --- 步驟 1. 獲取初始路徑 (加入 持久化邏輯 以消除抖動) ---
            // 為了防止 AI 在兩個路徑之間反覆猶豫（抖動），我們有高機率延用上一幀的路徑
            let initialPath = null;

            // 隨機決定是否延用上一幀的路徑 (80%~95% 延用，視當前設定而定)
            const shouldReuse = Math.random() < 0.95 && this.lastCalculatedPath && this.lastCalculatedPath.length > 0;

            if (shouldReuse) {
                // 從緩存中複製一份路徑
                initialPath = this.lastCalculatedPath.map(p => ({ ...p }));

                // 檢查目前位置是否已經走到路徑的第一步，如果是則裁剪掉
                if (initialPath.length > 0 && initialPath[0].r === start.r && initialPath[0].c === start.c) {
                    initialPath.shift();
                }

                // 驗證延用的路徑是否仍然有效（是否通往正確的目標）
                if (initialPath.length > 0) {
                    const lastStep = initialPath[initialPath.length - 1];
                    if (lastStep.r !== target1.r || lastStep.c !== target1.c) {
                        initialPath = null; // 目標變更，此路徑失效
                    }
                } else {
                    initialPath = null; // 路徑已走完
                }
            }

            // 如果不延用、路徑失效或路徑為空，則重新執行 BFS 尋找最短路徑 (避開目前小精靈位置)
            if (!initialPath) {
                initialPath = this.findShortestPath(start, target1, [], true);
            }

            // 將此原始計畫存入黃色路徑清單，供視覺化渲染
            this.autoPlayPath = initialPath ? initialPath.map(p => ({ ...p })) : [];

            let currentForbidden = []; // 儲存被判定為危險的禁止通行格點
            let retryCount = 0;        // 繞道嘗試次數
            let currentBestPath = initialPath;
            let dangerAt = -1;         // 危險發生在路徑的第幾步

            // --- 步驟 3. 循環繞道機制 (最多嘗試 5 次避開危險點) ---
            while (retryCount <= 5) {
                // 根據當前的禁止區清單，重新計算一條「繞道」路徑 (避開危險點與目前小精靈位置)
                let path = this.findShortestPath(start, target1, currentForbidden, true);
                if (!path) break; // 如果完全找不到路徑，跳出循環

                currentBestPath = path;

                // --- 步驟 2. 預判未來 4 步的風險 (安全性分析) ---
                dangerAt = -1;
                const checkLen = Math.min(path.length, 4);

                for (let i = 0; i < checkLen; i++) {
                    const step = path[i];
                    const stepsToReach = i + 1; // 玩家到達這一格所需的步數

                    // 檢查每一隻小精靈是否能在玩家到達之前，也到達這一格
                    for (let g of this.monsters) {
                        const ggp = this.getGridPos(g.x, g.y);
                        // 使用 BFS 計算小精靈的實際移動距離
                        const gPath = this.findShortestPath(ggp, { r: step.r, c: step.c });

                        if (gPath && gPath.length <= stepsToReach) {
                            // 發現威脅：小精靈會先到或同時到達！
                            dangerAt = i;
                            step.isDangerous = true; // 標示為「實心不透明紅點」

                            // 記錄這隻威脅小精靈及其攔截路線，用於視覺化
                            if (!this.dangerousMonsters.includes(g)) {
                                this.dangerousMonsters.push(g);
                                this.dangerousMonstersPaths.push(gPath);
                            }
                            break;
                        }
                    }
                    if (dangerAt !== -1) break; // 如果此步危險，不需再檢查後面的步數
                }

                // 如果目前路徑是安全的 (dangerAt === -1) 或已達重試上限
                if (dangerAt === -1 || retryCount === 5) {
                    if (retryCount > 0) {
                        this.evasionPath = path; // 成功繞道後，標示為「藍色半透明圓點」
                    }
                    return path.length > 0 ? path[0].dir : null;
                }

                // --- 步驟 2-1. 處理不安全狀況：尋找交叉路口以避開危險 ---
                const dangerPos = path[dangerAt];
                // 將這個撞擊點加入禁止通行清單，下次循環時路徑將繞過它
                currentForbidden.push({ r: dangerPos.r, c: dangerPos.c });

                // 檢查危險點之前是否有任何岔路口可以逃生
                let hasAlternative = false;
                for (let j = dangerAt; j >= 0; j--) {
                    const pos = (j === 0) ? start : path[j - 1];
                    // 找出該點除了原計畫方向外，是否還有其他合法移動方向
                    const exits = dirs.filter(d => this.canMoveFromCell(pos.r, pos.c, d, true));

                    // 如果可用方向數 > 2 (或在起點且 > 1)，代表有岔路可供繞道
                    if (exits.length > 2 || (j === 0 && exits.length > 1)) {
                        hasAlternative = true;
                        break;
                    }
                }

                // --- 步驟 2-1-1. 如果完全沒有岔路 (例如在窄長的隧道內) ---
                if (!hasAlternative) {
                    // 將整段路徑標示為極度危險
                    for (let k = 0; k <= dangerAt; k++) {
                        path[k].isExtremeDanger = true; // 標示為「紅色半透明圓點」
                    }
                    this.evasionPath = path;
                    break; // 既然無路可逃，不再進行繞道嘗試
                }

                retryCount++; // 進入下一次繞道計算
            }

            // --- 最終保底與緩存機制 ---
            if (currentBestPath && currentBestPath.length > 0) {
                // 如果找到的是完全安全的計畫，將其存入緩存供下一幀延用
                if (dangerAt === -1) {
                    this.lastCalculatedPath = currentBestPath.map(p => ({ ...p }));
                } else {
                    // 若路徑仍具風險，則清除緩存，強迫下一幀重新思考
                    this.lastCalculatedPath = null;
                }
                return currentBestPath[0].dir;
            }

            // 如果真的完全無路可走，隨機選擇一個可移動的方向
            this.lastCalculatedPath = null;
            return this.getRandomValidDir(start.r, start.c);
        },

        // 廣度優先搜尋 (BFS)：計算兩點間的最短路徑
        // @param {Object} start 起點座標 {r, c}
        // @param {Object} target 終點座標 {r, c}
        // @param {Array} forbiddenCells 可選的禁行格點清單
        // @returns {Array|null} 路徑步數清單 [{r, c, dir}, ...]，若不可達則返回 null



        findShortestPath: function (start, target, forbiddenCells = [], avoidGhosts = false) {
            // 如果起點就是終點，返回空路徑
            if (start.r === target.r && start.c === target.c) return [];

            const queue = [{ r: start.r, c: start.c, path: [] }];
            const visited = new Set();
            visited.add(`${start.r},${start.c}`);

            // 將禁止通行格點預先加入已訪問名單，使搜尋不會經過這些危險點
            if (forbiddenCells && forbiddenCells.length > 0) {
                forbiddenCells.forEach(cell => visited.add(`${cell.r},${cell.c}`));
            }

            // 如果設定為避開小精靈，將所有小精靈目前的座標也加入禁止名單
            if (avoidGhosts) {
                this.monsters.forEach(m => {
                    const ggp = this.getGridPos(m.x, m.y);
                    visited.add(`${ggp.r},${ggp.c}`);
                });
            }

            let limit = 2000; // 限制最大搜尋次數，防止特殊情況下的死循環
            while (queue.length > 0 && limit > 0) {
                limit--;
                const curr = queue.shift();

                // 檢查是否抵達目標
                if (curr.r === target.r && curr.c === target.c) return curr.path;

                // 嘗試向四個方向擴散
                for (let dir of ['UP', 'DOWN', 'LEFT', 'RIGHT']) {
                    let nr = curr.r, nc = curr.c;
                    if (dir === 'UP') nr--; else if (dir === 'DOWN') nr++; else if (dir === 'LEFT') nc--; else if (dir === 'RIGHT') nc++;

                    // 處理迷宮兩側的傳送隧道
                    if (curr.r === this.warpRowIndex) {
                        if (nc < 0) nc = this.cols - 1;
                        else if (nc >= this.cols) nc = 0;
                    }

                    // 檢查目標格子是否可通行 (無牆壁)
                    if (this.canMoveFromCell(curr.r, curr.c, dir, true)) {
                        const key = `${nr},${nc}`;
                        if (!visited.has(key)) {
                            visited.add(key);
                            const newPath = [...curr.path, { r: nr, c: nc, dir: dir }];
                            queue.push({ r: nr, c: nc, path: newPath });
                        }
                    }
                }
            }
            return null; // 目標不可達
        },

        // 依容器實際寬度計算格子大小(gridSize)，重設畫布尺寸，並找出傳送隧道所在列
        setupMaze: function () {
            this.rows = this.mazeLayout.length;
            this.cols = this.mazeLayout[0].length;
            this.maze = this.mazeLayout.map(row => [...row]);

            const mazeCont = document.querySelector('.game5-maze-container');
            if (!mazeCont) return;
            const cw = mazeCont.offsetWidth || document.getElementById('game5-container').offsetWidth;

            this.gridSize = Math.floor(cw / this.cols) * this.mapScale;

            this.canvas.width = this.cols * this.gridSize;
            this.canvas.height = this.rows * this.gridSize;

            this.updateTimerRing(1);

            this.warpRowIndex = -1;
            for (let r = 0; r < this.rows; r++) {
                if (this.maze[r][0] === 0 && this.maze[r][this.cols - 1] === 0) {
                    this.warpRowIndex = r;
                    break;
                }
            }
        },

        // 記錄玩家想要移動的下一個方向（實際轉向會在 moveEntity 中依迷宮牆壁判斷是否可行）
        handleInput: function (dir) {
            if (!this.isActive || !this.player) return;
            this.player.nextDir = dir;
        },

        // 顯示難度選擇畫面，選擇完成後套用設定並開始新遊戲
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);
            if (window.GameMessage) window.GameMessage.hide();


            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩詞精靈', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    const container = document.getElementById('game5-container');
                    container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    /* updateResponsiveLayout replaced */
                    this.startNewGame();
                });
            }
        },

        // 依目前模式（一般難度模式 / 關卡模式）更新難度標籤與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game5-diff-tag');
            const retryBtn = document.getElementById('game5-retryGame-btn');
            const newBtn = document.getElementById('game5-newGame-btn');
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
            /* updateResponsiveLayout replaced */
        },

        // 對外進入點：顯示遊戲畫面，隱藏首頁介紹頁，並開啟難度選擇器
        show: function () {
            this.init();

            const intro = document.getElementById('introOverlay');
            if (intro && !intro.classList.contains('hidden')) {
                intro.classList.add('hidden', 'hide-fade');
                document.body.classList.remove('overlay-active');
            }

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩詞小精靈', (level, levelIndex) => {
                    this.difficulty = level;
                    this.isLevelMode = (levelIndex !== undefined); // Set isLevelMode here
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[level];
                    if (!settings) {
                        console.error('Invalid difficulty:', level);
                        return;
                    }
                    this.maxMistakes = settings.maxMistakeCount;

                    this.updateUIForMode();

                    const container = document.getElementById('game5-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.classList.add('overlay-active');
                    }

                    this.setupMaze();
                    /* updateResponsiveLayout replaced */
                    this.startNewGame(this.isLevelMode ? this.currentLevelIndex : undefined); // Pass levelIndex if in level mode
                });
            }
        },

        // 開始一局新遊戲：重置分數/生命/收集進度，重新抽取詩詞與怪物，並啟動計時與遊戲主迴圈
        // @param {number} [levelIndex] 若有傳入，代表以「關卡模式」開始指定關卡
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            } else {
                // 若未傳入 levelIndex，則非關卡模式（除非先前已是關卡模式）
                // 確保開始非關卡遊戲時 isLevelMode 會被正確重置
                if (!this.isLevelMode) { // 只有在尚未處於關卡模式時才重置
                    this.isLevelMode = false;
                    this.currentLevelIndex = 1; // 非關卡模式時重置關卡索引
                }
            }

            this.updateUIForMode();
            this.score = 0;
            this.mistakes = 0;
            this.collectedCount = 0;
            this.isDying = false; // 確保重啟時狀態重置
            this.preparePoem();
            // 實際時限 = 實際收集字數 × timeLimitRate
            const settings5 = this.difficultySettings[this.difficulty];
            this.timeLimit = this.targetChars.length * settings5.timeLimitRate;
            this.resetEntities();
            this.startTimer();
            this.isActive = true;
            this.isWin = false;
            document.getElementById('game5-score').textContent = '0';
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();
            this.renderTargetPoem();

            this.lastTime = performance.now();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            // 確保重來/開新局按鈕在遊戲結束時可以再次點擊
            document.getElementById('game5-retryGame-btn').disabled = false;
            document.getElementById('game5-newGame-btn').disabled = false;
            // 記錄本局開始時間（用於計算 duration_s）
            this.gameStartTime = Date.now();
            this.gameLoop(this.lastTime);
        },

        // 進入下一關：關卡索引 +1 後以關卡模式重新開局
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame(this.currentLevelIndex); // 傳入 currentLevelIndex 以維持關卡模式
        },

        // 重玩本局：沿用相同的目標詩詞與版面，僅重置生命值、收集進度與物件位置
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.mistakes = 0;
            this.collectedCount = 0;
            this.resetEntities();
            this.startTimer();
            this.isActive = true;
            if (window.GameMessage) window.GameMessage.hide();

            this.renderHearts();
            // 重置所有文字精靈為「未收集」狀態
            this.foods.forEach(f => f.collected = false);

            // 確保重來/開新局按鈕在遊戲結束時可以再次點擊
            document.getElementById('game5-retryGame-btn').disabled = false;
            document.getElementById('game5-newGame-btn').disabled = false;
            this.lastTime = performance.now();
            if (this.requestID) cancelAnimationFrame(this.requestID);
            // 重試也重設本局計時
            this.gameStartTime = Date.now();
            this.gameLoop(this.lastTime);
        },
        // 準備本局詩詞：隨機抽取符合難度的詩詞、切分出提示字與答案字，
        // 並將答案文字精靈依象限平均分配到迷宮空地上（放置精靈）
        preparePoem: function () {
            if (typeof POEMS === 'undefined') return;
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.poemMinRating || 4;
            const anserlength = settings.answerLen;

            // 使用共享的隨機詩詞，傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                2, 4, 10, 100, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game5'
            );
            if (!result) return;

            const poem = result.poem;
            this.targetPoem = poem;

            // getSharedRandomPoem 預設會從偶數行開始 (例如 0, 2, 4...)
            let fullStr = "";
            let startLineIndex = result.startIndex;
            for (let i = startLineIndex; i < poem.content.length; i += 1) {
                fullStr += poem.content[i].replace(/[，。？！、；：「」（）《》s]/g, '');
                if (fullStr.length > anserlength) break;
            }

            // 如果隨機選取的行數不夠，則從頭開始選取
            if (fullStr.length <= anserlength) {
                fullStr = "";
                for (let i = 0; i < poem.content.length; i += 1) {
                    fullStr += poem.content[i].replace(/[，。？！、；：「」（）《》s]/g, '');
                    if (fullStr.length > anserlength) break;
                }
            }

            // [待辦] 確保選取後的字串長度不超過 16 個字，否則截斷
            if (fullStr.length > 16) {
                fullStr = fullStr.substring(fullStr.length - 16);
            }
            this.hitTimer = 0;       // 受傷閃爍計時器
            // 根據難度設定，將字串分為提示和答案
            const totalLen = fullStr.length;
            const promptStr = fullStr.substring(0, totalLen - anserlength);
            const answerStr = fullStr.substring(totalLen - anserlength);

            this.promptChars = promptStr.split('');
            this.targetChars = answerStr.split('');
            this.hintStartTime = Date.now(); // 提示字閃爍計時

            // 佈局單位定義 (以 rem 為基礎)
            this.foods = [];
            const quadrants = [[], [], [], []]; // [TL, TR, BL, BR]
            const midR = Math.floor(this.rows / 2);
            const midC = Math.floor(this.cols / 2);

            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    // 根據要求，避免在精靈重生位置附近 (大約 row 7~12，col 7~11) 放置食物
                    const inRestrictedArea = (r >= 7 && r <= 10) && (c >= 6 && c <= 12);

                    if (this.maze[r][c] === 0 && !this.isGhostHouse(r, c) && !inRestrictedArea) {
                        let qIdx = 0;
                        if (r < midR) qIdx = (c < midC ? 0 : 1);
                        else qIdx = (c < midC ? 2 : 3);
                        quadrants[qIdx].push({ r, c });
                    }
                }
            }
            this.enemySpacingX = 1.4;    // 橫向間距
            this.enemySpacingY = 1.4;    // 縱向間距
            // 由於內部需要重複嘗試與改變流程，改用標準 for 迴圈
            for (let index = 0; index < this.targetChars.length; index++) {
                const char = this.targetChars[index];
                const qIdx = index % 4; // 確保平均分配到四個象限
                let pool = quadrants[qIdx];
                let pos = null;

                // 建立一個檢查相鄰的函數
                const hasAdjacentFood = (r, c) => {
                    return this.foods.some(f =>
                        (f.row === r && Math.abs(f.col - c) === 1) ||
                        (f.col === c && Math.abs(f.row - r) === 1)
                    );
                };

                // 在該象限中，先過濾出「沒有相鄰食物」的可用位置
                let validPool = pool.filter(p => !hasAdjacentFood(p.r, p.c));

                if (validPool.length > 0) {
                    // 有完美位置，隨機抽一個
                    const posIdx = Math.floor(Math.random() * validPool.length);
                    pos = validPool[posIdx];
                    // 從原本的 pool 移除該位置避免重複使用
                    const realIdx = pool.findIndex(p => p.r === pos.r && p.c === pos.c);
                    pool.splice(realIdx, 1);
                } else if (pool.length > 0) {
                    // 該象限找不到不相鄰的位置了，只好妥協，隨機抽一個
                    const posIdx = Math.floor(Math.random() * pool.length);
                    pos = pool.splice(posIdx, 1)[0];
                } else {
                    // 如果整個象限都空了，從其他剩餘象限尋找
                    let allRemaining = quadrants.flat();
                    let allValid = allRemaining.filter(p => !hasAdjacentFood(p.r, p.c));

                    if (allValid.length > 0) {
                        const posIdx = Math.floor(Math.random() * allValid.length);
                        pos = allValid[posIdx];
                    } else if (allRemaining.length > 0) {
                        const posIdx = Math.floor(Math.random() * allRemaining.length);
                        pos = allRemaining[posIdx];
                    } else {
                        console.error("迷宮沒有足夠的空間放置文字！");
                        continue;
                    }

                    // 從原陣列中剔除
                    const targetQ = quadrants.find(q => q.some(p => p.r === pos.r && p.c === pos.c));
                    if (targetQ) {
                        const realIdx = targetQ.findIndex(p => p.r === pos.r && p.c === pos.c);
                        targetQ.splice(realIdx, 1);
                    }
                }

                this.foods.push({
                    char: char,
                    row: pos.r,
                    col: pos.c,
                    index: index,
                    collected: false
                });
            }
        },

        // 判斷指定格子是否為鬼屋（怪物出生地）
        isGhostHouse: function (r, c) {
            return this.mazeLayout[r][c] === 2;
        },

        // 重置玩家與怪物到初始位置與狀態（開新局或玩家死亡重生時呼叫）
        resetEntities: function () {
            this.openGhostHouse(); // 確保鬼屋門是開的
            this.isDying = false;
            this.deathStartTime = 0;
            this.trails = [];
            this.playerPath = []; // 重置玩家路徑

            // 玩家從畫面下方中央出發
            this.player = {
                x: 9 * this.gridSize + this.gridSize / 2,
                y: 15 * this.gridSize + this.gridSize / 2,
                dir: 'LEFT',
                nextDir: 'LEFT',
                speedDefault: this.gridSize * 0.08, // 預設移動速度
                speed: this.gridSize * 0.08, // 當前移動速度
                radius: this.gridSize * 0.5
            };

            // 怪物從鬼屋出生（第 9 列，第 8~10 欄）
            this.monsters = [];
            const settings = this.difficultySettings[this.difficulty];
            const ghostSpawns = [{ r: 9, c: 8 }, { r: 9, c: 9 }, { r: 9, c: 10 }, { r: 9, c: 9 }];

            // 根據難度設定怪物數量與行為
            const ghostConfigs = [
                { ai: 'chase', color: 'hsl(0, 100%, 50%)', lostInt: 6000, lostDur: 1000 }, // 紅色 追擊
                { ai: 'trail', color: 'hsl(180, 100%, 75%)', lostInt: 3000, lostDur: 1500 }, // 青色: 追蹤玩家路徑
                { ai: 'ambush', color: 'hsl(120, 100%, 50%)', lostInt: 4000, lostDur: 2000 }, // 綠色 伏擊
                { ai: 'distant', color: 'hsl(280, 100%, 60%)', lostInt: 3000, lostDur: 2500 }  // 紫色 遠離玩家
            ];

            for (let i = 0; i < settings.monsters; i++) {
                const config = ghostConfigs[i % ghostConfigs.length];
                const spawn = ghostSpawns[i % ghostSpawns.length];
                this.monsters.push({
                    x: spawn.c * this.gridSize + this.gridSize / 2,
                    y: spawn.r * this.gridSize + this.gridSize / 2,
                    dir: 'UP',
                    speed: this.player.speed * 0.7, // 怪物速度是玩家的 0.7 倍
                    color: config.color,
                    ai: config.ai,
                    lastLostTime: Date.now() + Math.random() * 3000, // 初始隨機失去方向時間
                    lostInterval: config.lostInt + settings.lostInt, // 失去方向間隔時間 (受難度影響)
                    lostDuration: config.lostDur + settings.lostDur, // 失去方向持續時間 (受難度影響)
                    isStunned: false
                });
            }
        },

        // 啟動倒數計時：每 100ms 更新一次剩餘時間文字與計時環，時間到則判定失敗
        startTimer: function () {
            clearInterval(this.timerInterval);
            if (this.timeLimit <= 0) {
                document.getElementById('game5-timer').textContent = '時間：無限';
                this.updateTimerRing(1);
                return;
            }
            this.timer = this.timeLimit;
            this.updateTimerUI();
            this.startTime = Date.now();
            const duration = this.timeLimit * 1000;

            this.timerInterval = setInterval(() => {
                if (this.isPaused) {
                    // 如果暫停，則補償 startTime 使得 elapsed 不會增加
                    this.startTime += 100;
                    return;
                }
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                this.timer = Math.ceil(this.timeLimit - (elapsed / 1000));
                this.updateTimerUI();

                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        // 更新文字倒數計時顯示，剩餘 10 秒以內變紅色提醒
        updateTimerUI: function () {
            // 更新文字型倒數計時
            const el = document.getElementById('game5-timer');
            if (this.timer <= 10) el.style.color = 'red';
            else el.style.color = '';
            el.textContent = `時間：${this.timer < 0 ? '--' : this.timer + 's'}`;
        },

        // 更新迷宮外框的計時環顯示：ratio 為剩餘時間比例(0~1)，mode='win' 時顯示勝利收尾動畫樣式
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game5-timer-path');
            const container = document.querySelector('.game5-maze-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game5-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            rect.setAttribute('width', Math.max(0, w - 6));
            rect.setAttribute('height', Math.max(0, h - 6));

            const perimeter = (Math.max(0, w - 6) + Math.max(0, h - 6)) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 刻意加亮倒數框
                rect.style.stroke = `hsla(0, 90%, 50%, ${Math.round(10 + 80 * elapsed)}%)`;
            }
        },

        // 依剩餘生命值繪製紅心圖示（已失去的生命顯示為破碎愛心）
        renderHearts: function () {
            const cont = document.getElementById('game5-hearts');
            cont.innerHTML = '';
            for (let i = 0; i < this.maxMistakes; i++) {
                const span = document.createElement('span');
                span.className = 'heart' + (i < this.mistakes ? ' empty' : '');
                span.textContent = i < this.mistakes ? '💔' : '❤️';
                cont.appendChild(span);
            }
        },

        // 渲染畫面上方的目標詩句：提示字（半透明不需收集）與答案字（需依序收集），
        // 第一個答案字預設標記為 active（目前要收集的目標）
        renderTargetPoem: function () {
            const cont = document.getElementById('game5-target-poem');
            let html = this.promptChars.map(c => `<span class="game5-char-hint prompt">${c}</span>`).join('');
            html += this.targetChars.map((c, i) =>
                `<span class="game5-char-hint answer ${i === 0 ? 'active' : ''}" id="hint-${i}">${c}</span>`
            ).join('');
            cont.innerHTML = html;
        },


        // 遊戲主迴圈：使用 requestAnimationFrame 持續更新邏輯並重繪畫面
        gameLoop: function (now) {
            if (!this.isActive) return;
            let dt = now - this.lastTime;
            if (dt > 100) dt = 16.67; // 防止分頁切換後的突跳
            this.lastTime = now;

            this.update(dt);
            this.draw();

            this.requestID = requestAnimationFrame((t) => this.gameLoop(t));
        },

        // 每幀更新遊戲邏輯：移動玩家與怪物、檢查碰撞、管理鬼屋開關狀態
        update: function (dt) {
            if (this.isPaused) return; // 暫停時不更新邏輯

            if (!this.isDying) {
                if (this.isAutoPlaying) this.autoPlayMove();
                this.moveEntity(this.player, true, dt);
                this.updatePlayerPath(); // 更新玩家路徑資料
                this.monsters.forEach(m => this.moveMonster(m, dt));
                this.checkCollisions();

                // 檢查是否所有怪物都已離開鬼屋，如果是則關閉鬼屋
                if (!this.isGhostHouseClosed && this.monsters.length > 0) {
                    const anyInside = this.monsters.some(m => this.isInsideGhostHouse(m.x, m.y));
                    if (!anyInside) {
                        this.closeGhostHouse();
                    }
                }
            }
        },

        // 通用實體移動邏輯（玩家與怪物共用）：處理轉彎判定、格線對齊、
        // 實際位移、傳送隧道穿越，以及撞牆時的處理
        moveEntity: function (ent, isPlayer, dt = 16.67) {
            const gridMid = this.gridSize / 2;
            const gp = this.getGridPos(ent.x, ent.y);
            const centerX = gp.c * this.gridSize + gridMid;
            const centerY = gp.r * this.gridSize + gridMid;

            // 速度標準化 (以 60fps 為基準)
            const speedFactor = dt / 16.67;
            const currentSpeed = ent.speed * speedFactor;

            // 檢查是否到達中心點附近 (用於轉彎)
            const turnTolerance = Math.max(currentSpeed, this.gridSize * 0.45);
            const offX = ent.x - centerX;
            const offY = ent.y - centerY;
            const isNearCenter = Math.abs(offX) < turnTolerance && Math.abs(offY) < turnTolerance;

            // 嘗試轉彎 (如果靠近中心點且有下一個方向)
            if (isNearCenter && ent.nextDir && ent.nextDir !== ent.dir) {
                if (this.canMoveFromCell(gp.r, gp.c, ent.nextDir, isPlayer)) {
                    // 轉彎時將實體精確對齊到中心點
                    ent.x = centerX;
                    ent.y = centerY;
                    ent.dir = ent.nextDir;
                    ent.nextDir = null;
                }
            }

            // 確保實體在移動時保持對齊 (Alignment)
            // 避免因速度過快導致偏離中心線
            const alignSpeed = currentSpeed * 0.8;
            if (ent.dir === 'UP' || ent.dir === 'DOWN') {
                if (Math.abs(offX) < alignSpeed) ent.x = centerX;
                else ent.x += (offX > 0 ? -alignSpeed : alignSpeed);
            } else if (ent.dir === 'LEFT' || ent.dir === 'RIGHT') {
                if (Math.abs(offY) < alignSpeed) ent.y = centerY;
                else ent.y += (offY > 0 ? -alignSpeed : alignSpeed);
            }

            // 移動
            let nextX = ent.x;
            let nextY = ent.y;
            if (ent.dir === 'UP') nextY -= currentSpeed;
            if (ent.dir === 'DOWN') nextY += currentSpeed;
            if (ent.dir === 'LEFT') nextX -= currentSpeed;
            if (ent.dir === 'RIGHT') nextX += currentSpeed;

            // 處理傳送門 (Warp tunnel)
            const isWarpRow = gp.r === this.warpRowIndex;

            if (isWarpRow && (nextX < 0 || nextX > this.canvas.width)) {
                if (nextX < -currentSpeed) ent.x = this.canvas.width;
                else if (nextX > this.canvas.width + currentSpeed) ent.x = 0;
                else ent.x = nextX;
            } else if (this.canMove(nextX, nextY, ent.dir, isPlayer)) {
                ent.x = nextX;
                ent.y = nextY;

                // 玩家移動軌跡
                if (isPlayer && Math.random() < 0.3) {
                    this.trails.push({ x: ent.x, y: ent.y, alpha: 0.5 });
                }
            } else {
                // 撞牆
                if (!isPlayer) {
                    // 怪物撞牆時隨機改變方向
                    ent.dir = this.getRandomValidDir(gp.r, gp.c);
                } else if (this.isAutoPlaying) {
                    // 自動遊玩撞牆時立即重新計算
                    this.autoPlayMove();
                }
            }
        },

        // 怪物 AI 移動邏輯：於格子中心點依 AI 類型（追擊/追蹤路徑/伏擊/遠離）決定下一步方向，
        // 並處理「失去方向(isStunned)」狀態下的隨機移動
        moveMonster: function (m, dt) {
            const gp = this.getGridPos(m.x, m.y);
            const gridMid = this.gridSize / 2;
            const offX = Math.abs(m.x - (gp.c * this.gridSize + gridMid));
            const offY = Math.abs(m.y - (gp.r * this.gridSize + gridMid));
            const isAtCenter = offX < m.speed && offY < m.speed;

            // 更新怪物失去方向狀態 (Lost/Stunned state)
            const now = Date.now();
            if (m.isStunned) {
                if (now - m.lostTriggerTime > m.lostDuration) {
                    m.isStunned = false;
                    m.lastLostTime = now;
                }
            } else {
                if (now - m.lastLostTime > m.lostInterval) {
                    m.isStunned = true;
                    m.lostTriggerTime = now;
                }
            }

            if (isAtCenter) {
                const options = this.getAvailableDirs(gp.r, gp.c, m.dir);
                const pg = this.getGridPos(this.player.x, this.player.y);
                const distToPlayer = Math.abs(gp.r - pg.r) + Math.abs(gp.c - pg.c);

                if (options.length > 0) {
                    // 如果怪物處於失去方向狀態或只有一個方向可走，則隨機選擇方向
                    if (m.isStunned || options.length === 1) {
                        m.dir = options[Math.floor(Math.random() * options.length)];
                    } else {
                        // 根據AI行為設定目標方塊 (Target Tile)
                        let targetR = pg.r;
                        let targetC = pg.c;

                        if (m.ai === 'trail') { // 青色: 追蹤玩家路徑
                            if (distToPlayer >= 6 && this.playerPath.length > 0) {
                                // 如果距離玩家超過 6 格，追蹤玩家路徑的起點
                                const pNode = this.playerPath[0];
                                targetR = pNode.r;
                                targetC = pNode.c;
                            }
                            // 否則追蹤玩家
                        } else if (m.ai === 'ambush') { // 綠色 伏擊
                            if (distToPlayer >= 6) {
                                // 如果距離玩家超過 6 格，預測玩家前方 5 格
                                const offsets = { 'UP': [-5, 0], 'DOWN': [5, 0], 'LEFT': [0, -5], 'RIGHT': [0, 5] };
                                const off = offsets[this.player.dir] || [0, 0];
                                targetR = Math.max(0, Math.min(this.rows - 1, pg.r + off[0]));
                                targetC = Math.max(0, Math.min(this.cols - 1, pg.c + off[1]));
                            }
                            // 否則追蹤玩家
                        } else if (m.ai === 'distant') { // 紫色 遠離玩家
                            if (distToPlayer < 9) {
                                // 如果距離玩家小於 9 格，則隨機選擇方向遠離玩家 (逃跑)
                                m.dir = options[Math.floor(Math.random() * options.length)];
                                this.moveEntity(m, false, dt);
                                return;
                            }
                        }

                        // 追擊 (chase) AI 或其他AI的預設行為是追蹤玩家
                        let bestDir = options[0];
                        let minDist = Infinity;
                        options.forEach(d => {
                            let nr = gp.r, nc = gp.c;
                            if (d === 'UP') nr--; if (d === 'DOWN') nr++; if (d === 'LEFT') nc--; if (d === 'RIGHT') nc++;
                            const d2 = Math.pow(nr - targetR, 2) + Math.pow(nc - targetC, 2);
                            if (d2 < minDist) {
                                minDist = d2;
                                bestDir = d;
                            }
                        });
                        m.dir = bestDir;
                    }
                }
            }
            this.moveEntity(m, false, dt);
        },

        // 記錄玩家最近走過的格點路徑（最多保留 4 筆），供 'trail' AI 怪物追蹤使用
        updatePlayerPath: function () {
            const pg = this.getGridPos(this.player.x, this.player.y);
            if (this.playerPath.length === 0 ||
                this.playerPath[this.playerPath.length - 1].r !== pg.r ||
                this.playerPath[this.playerPath.length - 1].c !== pg.c) {

                this.playerPath.push({ r: pg.r, c: pg.c });
                if (this.playerPath.length > 4) {
                    this.playerPath.shift();
                }
            }
        },

        // 取得指定格點可移動的方向清單，並排除「立即掉頭」的選項（若還有其他方向可選）
        getAvailableDirs: function (r, c, currentDir) {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            const opposite = { 'UP': 'DOWN', 'DOWN': 'UP', 'LEFT': 'RIGHT', 'RIGHT': 'LEFT' };
            const valid = dirs.filter(d => this.canMoveFromCell(r, c, d));

            // 避免怪物立即掉頭
            if (valid.length > 1) {
                return valid.filter(d => d !== opposite[currentDir]);
            }
            return valid;
        },

        // 從指定格點的所有合法可走方向中隨機選一個（找不到時預設回傳 'UP'）
        getRandomValidDir: function (r, c) {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            const valid = dirs.filter(d => this.canMoveFromCell(r, c, d));
            return valid[Math.floor(Math.random() * valid.length)] || 'UP';
        },

        // 判斷指定像素座標是否位於鬼屋範圍內
        isInsideGhostHouse: function (x, y) {
            const gp = this.getGridPos(x, y);
            return this.mazeLayout[gp.r] && this.mazeLayout[gp.r][gp.c] === 2;
        },

        // 關閉鬼屋：所有怪物離開後，將鬼屋入口封閉為牆壁，避免玩家誤闖
        closeGhostHouse: function () {
            if (this.isGhostHouseClosed) return;
            this.isGhostHouseClosed = true;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.mazeLayout[r][c] === 2) {
                        this.maze[r][c] = 1; // 將鬼屋入口變成牆壁 (1)
                    }
                }
            }
        },

        // 開啟鬼屋：將鬼屋入口還原為可通行狀態（新局或重生時呼叫）
        openGhostHouse: function () {
            this.isGhostHouseClosed = false;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.mazeLayout[r][c] === 2) {
                        this.maze[r][c] = 2; // 重置鬼屋入口為可通行 (2)
                    }
                }
            }
        },

        // 判斷從格點 (r,c) 往 dir 方向移動一格是否合法（依牆壁與是否為玩家/怪物而異）
        canMoveFromCell: function (r, c, dir, isPlayer = false) {
            let nr = r, nc = c;
            if (dir === 'UP') nr--;
            else if (dir === 'DOWN') nr++;
            else if (dir === 'LEFT') nc--;
            else if (dir === 'RIGHT') nc++;

            // 處理左右隧道傳送（環繞至對側）
            if (r === this.warpRowIndex) {
                if (nc < 0) nc = this.cols - 1;
                else if (nc >= this.cols) nc = 0;
            }

            const cell = (this.maze[nr] && this.maze[nr][nc] !== undefined) ? this.maze[nr][nc] : 1;
            if (isPlayer) return cell === 0; // 玩家只能走通道
            return cell === 0 || cell === 2; // 怪物可以走通道或鬼屋
        },

        // 依像素座標檢查實體是否能朝 dir 方向繼續移動（用矩形邊角的兩個檢查點判斷是否碰牆）
        canMove: function (x, y, dir, isPlayer = false) {
            const buffer = this.gridSize * 0.4;
            let checkPoints = [];
            if (dir === 'UP') checkPoints = [{ x: x - buffer, y: y - buffer }, { x: x + buffer, y: y - buffer }];
            if (dir === 'DOWN') checkPoints = [{ x: x - buffer, y: y + buffer }, { x: x + buffer, y: y + buffer }];
            if (dir === 'LEFT') checkPoints = [{ x: x - buffer, y: y - buffer }, { x: x - buffer, y: y + buffer }];
            if (dir === 'RIGHT') checkPoints = [{ x: x + buffer, y: y - buffer }, { x: x + buffer, y: y + buffer }];

            return checkPoints.every(p => {
                const gp = this.getGridPos(p.x, p.y);
                if (gp.c < 0 || gp.c >= this.cols) return true; // 隧道範圍，視為可通行
                const cell = this.maze[gp.r] ? this.maze[gp.r][gp.c] : 1;
                if (isPlayer) return cell === 0; // 玩家不能穿牆 (1)
                return cell !== 1; // 怪物不能穿牆 (1)
            });
        },

        // 將像素座標轉換為迷宮的格點座標 {r, c}
        getGridPos: function (x, y) {
            return {
                r: Math.floor(y / this.gridSize),
                c: Math.floor(x / this.gridSize)
            };
        },

        // 隨機回傳一個方向（不檢查是否可通行，僅用於簡單的隨機決策）
        getRandomDir: function () {
            const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
            return dirs[Math.floor(Math.random() * dirs.length)];
        },

        // 檢查每幀的碰撞：玩家與怪物碰撞（受傷）、玩家與文字精靈碰撞（收集文字）
        checkCollisions: function () {
            // 怪物碰撞判定
            for (let m of this.monsters) {
                const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
                if (dist < this.gridSize * 0.8) {
                    this.handleHit();
                    return;
                }
            }
            this.monumentCols = 8;       // 掩體橫列數
            this.monumentRows = 4;       // 掩體縱列數
            // 文字精靈碰撞判定
            const pg = this.getGridPos(this.player.x, this.player.y);
            this.foods.forEach(f => {
                if (!f.collected && f.row === pg.r && f.col === pg.c) {
                    if (f.index === this.collectedCount) {
                        if (window.SoundManager) window.SoundManager.playSuccess();
                        // 收集順序正確
                        f.collected = true;
                        this.collectedCount++;
                        //收集一字得分
                        // 擊中文字，根據window.ScoreManager.gameSettings['game5'].getPointA加分
                        this.score += window.ScoreManager.gameSettings['game5'].getPointA;
                        document.getElementById('game5-score').textContent = this.score;
                        this.hintStartTime = Date.now(); // 重置提示計時

                        if (this.collectedCount === this.targetChars.length) {
                            // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                            this.gameOver(true, '');
                        } else {
                            // 更新提示文字的顯示狀態
                            const prevHint = document.getElementById(`hint-${f.index}`);
                            if (prevHint) prevHint.classList.replace('active', 'collected');
                            const nextHint = document.getElementById(`hint-${f.index + 1}`);
                            if (nextHint) nextHint.classList.add('active');
                        }
                    } else {
                        //if (window.SoundManager) window.SoundManager.playFailure();
                        //if (window.SoundManager) window.SoundManager.playCloseItem();
                        // 收集順序錯誤 - 給予輕微懲罰或畫面震動效果？
                        //document.querySelector('.game5-maze-container').classList.add('shake');
                        setTimeout(() => document.querySelector('.game5-maze-container').classList.remove('shake'), 100);
                        // 錯誤收集的懲罰 (penalty)
                        this.player.speed *= 0.5; // 減速懲罰
                        setTimeout(() => this.player.speed = this.player.speedDefault, this.mistakePenaltyDuration);
                    }
                }
            });
        },

        // 處理玩家被怪物碰到時的受傷邏輯：扣一顆心，若心數用盡則遊戲失敗，否則短暫延遲後重生
        handleHit: function () {
            if (this.isDying) return;
            if (window.SoundManager) window.SoundManager.playSadTriple(); // 玩家受傷
            this.isDying = true;
            this.deathStartTime = Date.now();
            this.mistakes++;
            this.renderHearts();

            if (this.mistakes >= this.maxMistakes) {
                setTimeout(() => this.gameOver(false, '墨香耗盡！'), 1000);
            } else {
                // 玩家重生的處理
                setTimeout(() => {
                    this.resetEntities(); // 重置地圖物件
                    this.isDying = false;  // 結束受傷狀態
                }, 1500);
            }
        },

        // 每幀繪製整個畫面：牆壁、玩家軌跡、文字精靈、怪物、AI 路徑視覺化、玩家角色
        draw: function () {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            // 繪製牆壁
            this.ctx.strokeStyle = 'hsl(240, 70%, 36%)';
            this.ctx.lineWidth = 3;
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (this.maze[r][c] === 1) {
                        this.ctx.fillStyle = 'hsl(240, 50%, 18%)';
                        this.ctx.fillRect(c * this.gridSize + 1, r * this.gridSize + 1, this.gridSize - 2, this.gridSize - 2);
                        this.ctx.strokeRect(c * this.gridSize + 3, r * this.gridSize + 3, this.gridSize - 5, this.gridSize - 5);
                    }
                }
            }

            // 繪製玩家移動軌跡（水墨暈染效果）
            this.ctx.fillStyle = 'hsla(50, 100%, 80%, 0.50)';
            for (let i = this.trails.length - 1; i >= 0; i--) {
                const t = this.trails[i];
                this.ctx.globalAlpha = t.alpha;
                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, this.player.radius * t.alpha, 0, Math.PI * 2);
                this.ctx.fill();
                t.alpha -= 0.02;
                if (t.alpha <= 0) this.trails.splice(i, 1);
            }
            this.ctx.globalAlpha = 1.0;

            // 繪製文字精靈（食物）
            // 桌機 gridSize 約 21px，行動裝置約 15px，字體大小需隨 gridSize 縮放
            //this.ctx.font = `bold ${Math.floor(this.gridSize * 0.8)}px 'Noto Serif TC'`; //宋體字尺寸
            this.ctx.font = `bold ${Math.floor(this.gridSize * 1.0)}px 'Microsoft JhengHei'`; //微軟正黑體字尺寸
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const settings = this.difficultySettings[this.difficulty];
            const elapsed = Date.now() - this.hintStartTime;
            const isHinting = settings.hintDuration === -1 || elapsed < settings.hintDuration;

            this.foods.forEach(f => {
                if (!f.collected) {
                    const isNext = f.index === this.collectedCount;
                    if (isNext && isHinting) {
                        this.ctx.fillStyle = 'hsl(45, 100%, 65%)';
                        this.ctx.shadowBlur = 15;
                        this.ctx.shadowColor = 'gold';
                        this.ctx.font = `bold ${Math.floor(this.gridSize * 1.2)}px 'Microsoft JhengHei'`; //微軟正黑體字尺寸
                    } else {
                        this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                        this.ctx.shadowBlur = 0;
                        this.ctx.font = `bold ${Math.floor(this.gridSize * 1.0)}px 'Microsoft JhengHei'`; //微軟正黑體字尺寸
                    }
                    this.ctx.fillText(f.char, f.col * this.gridSize + this.gridSize / 2, f.row * this.gridSize + this.gridSize / 2);
                }
            });
            this.ctx.shadowBlur = 0;

            // 繪製怪物（水墨鬼魂造型）
            this.monsters.forEach(m => {
                this.ctx.save();
                this.ctx.translate(m.x, m.y);
                this.ctx.fillStyle = m.color;
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = m.color;

                this.ctx.beginPath();
                this.ctx.arc(0, 0, this.gridSize * 0.4, Math.PI, 0);
                this.ctx.lineTo(this.gridSize * 0.4, this.gridSize * 0.5);
                // 波浪狀底部（鬼魂裙擺）
                for (let i = 1; i <= 3; i++) {
                    this.ctx.lineTo(this.gridSize * 0.4 - (i * 0.25 * this.gridSize), this.gridSize * (i % 2 ? 0.4 : 0.6));
                }
                this.ctx.lineTo(-this.gridSize * 0.4, this.gridSize * 0.5);
                this.ctx.fill();

                // 眼睛（書法圓點風格）
                this.ctx.fillStyle = 'white';
                this.ctx.beginPath();
                this.ctx.arc(-4, -2, 4, 0, Math.PI * 2);
                this.ctx.arc(4, -2, 4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            });

            // --- 同時顯示所有 AI 路徑規劃 (遵循 3 步驟視覺化規則) ---
            if (this.isAutoPlaying) {
                this.ctx.save();

                // 1. 畫黃色路徑 (步驟1：原始尋字計畫)
                if (this.autoPlayPath) {
                    for (let step of this.autoPlayPath) {
                        // 步驟2-1：如果該點被判定為攔截點，顯示為「不透明實心紅點」
                        this.ctx.fillStyle = step.isDangerous ? 'rgba(255, 0, 0, 1.0)' : 'rgba(255, 255, 0, 0.4)';
                        this.ctx.shadowBlur = step.isDangerous ? 15 : 5;
                        this.ctx.shadowColor = step.isDangerous ? 'red' : 'yellow';
                        this.ctx.beginPath();
                        this.ctx.arc(step.c * this.gridSize + this.gridSize / 2,
                            step.r * this.gridSize + this.gridSize / 2,
                            this.gridSize * (step.isDangerous ? 0.25 : 0.15), 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }

                // 2. 畫青藍色/紅色路徑 (步驟3：繞道計畫 或 步驟2-1-1：極度危險路徑)
                if (this.evasionPath && this.evasionPath.length > 0) {
                    for (let step of this.evasionPath) {
                        // 步驟2-1-1：如果完全無路可逃，顯示為「半透明紅點」
                        // 步驟3：成功繞道，顯示為「藍色半透明圓點」
                        this.ctx.fillStyle = step.isExtremeDanger ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 255, 255, 0.8)';
                        this.ctx.shadowBlur = 5;
                        this.ctx.shadowColor = step.isExtremeDanger ? 'red' : 'cyan';
                        this.ctx.beginPath();
                        this.ctx.arc(step.c * this.gridSize + this.gridSize / 2,
                            step.r * this.gridSize + this.gridSize / 2,
                            this.gridSize * 0.12, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                }

                // 3. 畫威脅指示 (紅圈與紅點)
                if (this.dangerousMonsters.length > 0) {
                    // 紅圈
                    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
                    this.ctx.lineWidth = 3;
                    this.ctx.setLineDash([5, 5]);
                    for (let m of this.dangerousMonsters) {
                        this.ctx.beginPath();
                        this.ctx.arc(m.x, m.y, this.gridSize * 0.7, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                    // 小精靈的攔截紅點
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 1)';
                    for (let gPath of this.dangerousMonstersPaths) {
                        for (let step of gPath) {
                            this.ctx.beginPath();
                            this.ctx.arc(step.c * this.gridSize + this.gridSize / 2,
                                step.r * this.gridSize + this.gridSize / 2,
                                this.gridSize * 0.2, 0, Math.PI * 2);
                            this.ctx.fill();
                        }
                    }
                }

                this.ctx.restore();
            }

            // 繪製玩家角色（金色墨滴造型）
            if (!this.player) return;

            if (this.isDying) {
                const elapsed = Date.now() - this.deathStartTime;
                const scale = Math.max(0, 1 - elapsed / 1500);
                this.ctx.save();
                this.ctx.translate(this.player.x, this.player.y);
                this.ctx.scale(scale * 1.5, scale * 1.5);
                this.ctx.globalAlpha = scale;
            } else {
                this.ctx.save();
                this.ctx.translate(this.player.x, this.player.y);
                this.ctx.globalAlpha = 1.0; // 重置透明度
            }

            this.ctx.fillStyle = 'hsl(45, 100%, 60%)';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = 'gold';

            // Rotating ink blob
            const rotation = (performance.now() / 200) % (Math.PI * 2);
            this.ctx.rotate(rotation);

            this.ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const r = this.player.radius * (0.8 + 0.2 * Math.sin(performance.now() / 100 + i));
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.restore();
        },

        // 遊戲結束處理：停止計時與動畫迴圈，依勝負記錄戰績並顯示結果訊息，
        // 勝利時可能觸發得分動畫與過關紀錄
        gameOver: function (win, reason) {
            this.isActive = false;
            if (win) {
                document.getElementById('game5-retryGame-btn').disabled = true;
                document.getElementById('game5-newGame-btn').disabled = true;
            } else {
                document.getElementById('game5-retryGame-btn').disabled = false;
                document.getElementById('game5-newGame-btn').disabled = false;
            }
            this.isWin = win;

            // 失敗時寫入 game_logs（score=0，記錄本局時長）
            // 過關時 LOG 已由 ScoreManager.saveScore 負責寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 5,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMessage = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore || this.score) : 0,
                        reason: win ? "" : (typeof reason === 'string' ? reason : "挑戰結束"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game5',
                    timerContainerId: 'game5-timer',
                    scoreElementId: 'game5-score',
                    heartsSelector: '#game5-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        if (this.isLevelMode) {
                            window.ScoreManager.completeLevel('game5', this.difficulty, this.currentLevelIndex);
                        }
                        showMessage(finalScore);
                    }
                });
            } else {
                showMessage();
            }
        },

        // 停止遊戲並隱藏遊戲畫面，還原回主頁面（離開遊戲時呼叫）
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.requestID) cancelAnimationFrame(this.requestID);
            const container = document.getElementById('game5-container');
            if (container) {
                container.classList.add('hidden');
            }
            document.body.classList.remove('overlay-active');
            // 還原主頁面顯示
            const mainContainer = document.getElementById('calendarCardContainer') || document.getElementById('cardContainer');
            if (mainContainer) mainContainer.style.display = '';
        }
    };

    window.Game5 = Game5;

    // 自動啟動檢查：若網址帶有 ?game=5 參數，則自動開啟本遊戲
    if (new URLSearchParams(window.location.search).get('game') === '5') {
        setTimeout(() => {
            if (window.Game5) window.Game5.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }

})();
