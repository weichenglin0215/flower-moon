// ============================================================
// game17.js — 青蛙過河 (Frog on the Verse)
// 改編自 Frogger (1981)，以詩詞字序為核心玩法
// 玩家點擊漂流的荷葉/浮木，依序踩出拆分後的詩句短句，由下往上渡河過關
// ============================================================

(function () {
    'use strict';

    const Game17 = {
        // ─── 狀態 ────────────────────────────────────────────────
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        hearts: 5,
        timer: 0,
        maxTimer: 0,
        lastTimestamp: 0,

        // ─── 詩詞 ────────────────────────────────────────────────
        currentPoem: null,
        poemLines: [],
        fullPoemText: '',
        targetIndex: 0,         // 當前目標短句索引
        targetSegments: [],     // [{text, line}, ...] 拆分後的短句

        // ─── Canvas 狀態 ─────────────────────────────────────────
        canvas: null,
        ctx: null,
        animFrameId: null,
        canvasH: 660,
        rowH: 0,
        jumpRange: 200,

        // ─── 輸入狀態（觸控滑動 + 鍵盤）──────────────────────────
        touchStartX: 0,
        touchStartY: 0,

        // ─── 遊戲物件 ────────────────────────────────────────────
        lilyPads: [],
        frog: null,

        // ─── 視覺特效 ────────────────────────────────────────────
        splashes: [],
        floatTexts: [],

        // ─── D-pad 淡出計時器 ──────────────────────────────────
        dpadFadeTimeoutId: null,
        _dpadFadeStarted: false,

        // ─── 佈局常數 ────────────────────────────────────────────
        BANK_H: 55,           // 上下岸台高度（px）
        // 浮木碰撞框每側延伸量：讓相鄰 close-gap 浮木的碰撞框完全重疊，
        // 確保青蛙從寬浮木中央以固定步長 44px 跳向緊鄰窄浮木時必定著地
        PAD_HIT_EXTEND: 40,

        // ─── 難度設定 ────────────────────────────────────────────
        difficultySettings: {
            //timeLimitRate：每字時間倍率（秒），實際時限 = fullPoemText 字數 × timeLimitRate
            //baseSpeed：浮木漂流速度（px/s）
            //minPadsPerRow / maxPadsPerRow：每列浮木數量隨機區間（含端點）
            //sinkDelay：浮木下沉延遲（ms）
            //poemMinRating：詩詞難度評分（6=最常見，1=最冷僻），同 game16 用法
            //lineCount：取幾句完整詩句
            //singleCharProb：拆分短句後再切成單字的機率（0=不切, 0.35=35%）
            //closeNeighborProb：左右浮木緊靠（可跨越）的機率（0.9=幾乎全部緊靠, 0.1=大多留空）
            //hint: 正確字提示，all / sentence / none
            //maxMistakeCount：最大失誤次數（即生命值，扣完即遊戲結束）
            '小學': {
                timeLimitRate: 5, baseSpeed: 50, minPadsPerRow: 4, maxPadsPerRow: 5, sinkDelay: 8000,
                poemMinRating: 6, lineCount: 4, singleCharProb: 0.10, closeNeighborProb: 0.70, hint: 'all',
                maxMistakeCount: 8
            },
            '中學': {
                timeLimitRate: 4, baseSpeed: 55, minPadsPerRow: 4, maxPadsPerRow: 5, sinkDelay: 7000,
                poemMinRating: 5, lineCount: 4, singleCharProb: 0.15, closeNeighborProb: 0.50, hint: 'sentence',
                maxMistakeCount: 6
            },
            '高中': {
                timeLimitRate: 3.5, baseSpeed: 60, minPadsPerRow: 3, maxPadsPerRow: 5, sinkDelay: 6000,
                poemMinRating: 4, lineCount: 4, singleCharProb: 0.20, closeNeighborProb: 0.30, hint: 'all',
                maxMistakeCount: 5
            },
            '大學': {
                timeLimitRate: 2, baseSpeed: 75, minPadsPerRow: 3, maxPadsPerRow: 4, sinkDelay: 5000,
                poemMinRating: 3, lineCount: 6, singleCharProb: 0.25, closeNeighborProb: 0.20, hint: 'sentence',
                maxMistakeCount: 4
            },
            '研究所': {
                timeLimitRate: 1.5, baseSpeed: 90, minPadsPerRow: 2, maxPadsPerRow: 4, sinkDelay: 4000,
                poemMinRating: 3, lineCount: 8, singleCharProb: 0.3, closeNeighborProb: 0.10, hint: 'none',
                maxMistakeCount: 3
            },
        },
        gameStartTime: null,

        // ── 載入 CSS ─────────────────────────────────────────────
        loadCSS: function () {
            if (!document.getElementById('game17-css')) {
                const link = document.createElement('link');
                link.id = 'game17-css';
                link.rel = 'stylesheet';
                link.href = 'game17.css';
                document.head.appendChild(link);
            }
        },

        // ── 初始化 ───────────────────────────────────────────────
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game17-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game17-container');
        },

        // ── 建立 DOM ─────────────────────────────────────────────
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game17-container';
            div.className = 'game17-overlay hidden';
            div.innerHTML = `
                <div class="game17-header">
                    <div class="game17-score-board">分數:&nbsp;<span id="game17-score">0</span></div>
                    <div class="game17-controls">
                        <button class="game17-difficulty-tag" id="game17-diff-tag">小學</button>
                        <button id="game17-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game17-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game17-sub-header">
                    <div id="game17-hearts" class="hearts"></div>
                </div>
                <div id="game17-poem-info" class="game17-poem-info"></div>
                <div id="game17-hint-bar" class="game17-hint-bar"></div>
                <div id="game17-canvas-wrap" class="game17-canvas-wrap">
                    <canvas id="game17-canvas"></canvas>
                    <svg id="game17-timer-ring" style="display:none">
                        <rect id="game17-timer-path" x="3" y="3"></rect>
                    </svg>
                    <div class="game17-dpad" id="game17-dpad">
                        <button class="game17-dpad-btn game17-dpad-up" id="game17-dpad-up" aria-label="上">
                            <svg viewBox="0 0 80 80" width="60" height="60" aria-hidden="true"><path d="M 4,76 L 40,4 L 76,76" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>
                        </button>
                        <div class="game17-dpad-row">
                            <button class="game17-dpad-btn game17-dpad-left" id="game17-dpad-left" aria-label="左">
                                <svg viewBox="0 0 80 80" width="60" height="60" aria-hidden="true"><path d="M 76,4 L 4,40 L 76,76" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>
                            </button>
                            <div class="game17-dpad-center"></div>
                            <button class="game17-dpad-btn game17-dpad-right" id="game17-dpad-right" aria-label="右">
                                <svg viewBox="0 0 80 80" width="60" height="60" aria-hidden="true"><path d="M 4,4 L 76,40 L 4,76" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 同步縮放座標（跟隨 stage）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }

            document.getElementById('game17-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game17-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game17-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 輸入設定（觸控滑動 + 鍵盤方向鍵，仿照 game15 手感）
            this.setupInput();
        },

        // ── 顯示遊戲 ─────────────────────────────────────────────
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // ── 難度選擇 ─────────────────────────────────────────────
        showDifficultySelector: function () {
            this.isActive = false;
            this.stopLoop();
            if (window.GameMessage) window.GameMessage.hide();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('青蛙過河', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.SoundManager) window.SoundManager.init();
                    this.startNewGame();
                });
            }
        },

        // ── 更新難度標籤與按鈕顯示 ──────────────────────────────
        updateUIForMode: function () {
            const tag = document.getElementById('game17-diff-tag');
            const newBtn = document.getElementById('game17-newGame-btn');
            const retBtn = document.getElementById('game17-retryGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#e2b800' };

            if (this.isLevelMode) {
                if (tag) { tag.textContent = `挑戰第 ${this.currentLevelIndex} 關`; tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50'; tag.style.color = this.difficulty === '研究所' ? '#333' : '#fff'; tag.dataset.level = this.difficulty; }
                if (newBtn) newBtn.style.display = 'none';
                if (retBtn) retBtn.style.display = 'inline-block';
            } else {
                if (tag) { tag.textContent = this.difficulty; tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50'; tag.style.color = this.difficulty === '研究所' ? '#333' : '#fff'; tag.dataset.level = this.difficulty; }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retBtn) retBtn.style.display = 'inline-block';
            }
        },

        // ── 停止遊戲（menu.js 全域清理用）──────────────────────
        stopGame: function () {
            this.isActive = false;
            this.stopLoop();
            // ⚠️ 必須在此隱藏：menu.js 全域清理只呼叫 stopGame()，不呼叫 hide()
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        stopLoop: function () {
            if (this.animFrameId) {
                cancelAnimationFrame(this.animFrameId);
                this.animFrameId = null;
            }
        },

        // ── 重來 ─────────────────────────────────────────────────
        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        // ── 開新局 ───────────────────────────────────────────────
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.updateUIForMode();
            if (this.selectRandomPoem()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗，請重試。');
                this.stopGame();
            }
        },

        // ── 選詩 ─────────────────────────────────────────────────
        // 仿照 game19 作法：固定 lineCount，放寬 minChars=8、maxChars=9999，大學/研究所才能正常載入
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') return false;
            const s = this.difficultySettings[this.difficulty];
            const seed = this.isLevelMode ? this.currentLevelIndex : null;
            const result = getSharedRandomPoem(
                s.poemMinRating,
                s.lineCount, s.lineCount,   // minLines = maxLines = lineCount
                8, 9999,                    // minChars 固定 8，maxChars 無上限
                '', seed, 'game17'
            );
            if (result) {
                this.currentPoem = result.poem;
                this.poemLines = result.lines;
            } else {
                // 兜底詩句（依 lineCount 截取）
                this.currentPoem = null;
                const fallback = ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉',
                    '春眠不覺曉', '處處聞啼鳥', '夜來風雨聲', '花落知多少'];
                this.poemLines = fallback.slice(0, s.lineCount);
            }
            this.fullPoemText = this.poemLines.join('');

            const poem = this.currentPoem;
            let title = poem ? poem.title : '靜夜思';
            const dynasty = poem ? poem.dynasty : '唐';
            const author = poem ? poem.author : '李白';
            if (title.length > 12) title = title.substring(0, 10) + '...';

            const infoEl = document.getElementById('game17-poem-info');
            infoEl.textContent = `${title} / ${dynasty} / ${author}`;
            infoEl.dataset.poemId = poem ? poem.id : '';
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (poem && window.openPoemDialogById) window.openPoemDialogById(poem.id);
            };
            return true;
        },

        // ── 將一句詩依規則拆分成短句陣列 ─────────────────────────
        // A: <5字 → 保持整句
        // ── 生成所有目標短句（含詩句來源，供提示欄使用）──────────
        // 使用 script.js 公用 sharedSplitLine（規則：5/7/疊字/singleCharProb）
        generateSegments: function () {
            const s = this.difficultySettings[this.difficulty];
            const splitFn = window.sharedSplitLine || ((l) => [l]);
            const allSegs = [];
            for (const line of this.poemLines) {
                const segs = splitFn(line, s.singleCharProb);
                for (const seg of segs) {
                    allSegs.push({ text: seg, line: line });
                }
            }
            // 依可視高度限制最多列數（rowH ≥ 55px）
            const riverH = this.canvasH - this.BANK_H * 2;
            const maxRows = Math.max(4, Math.floor(riverH / 55));
            return allSegs.slice(0, maxRows);
        },

        // ── 為某列生成混淆短句（從詩詞庫取真實詩句片段，讓玩家產生混淆）────
        //
        // 設計規則：
        //  優先1：在其他詩詞中，找含有正確短句任意字的詩句，截取長度 1~4 的片段
        //  優先2：同首詩不同詩句的片段
        //
        //  禁止：
        //   - decoy 是 correct 的前綴（例：correct="明月光", decoy="明月" → 禁止）
        //   - correct 是 decoy 的前綴（例：correct="月", decoy="月光" → 禁止）
        //   - 已被其他列正確答案使用的短句
        buildDecoysForRow: function (correctText, count, allPoemLines, singleCharProb) {
            const DB = (typeof POEMS !== 'undefined') ? POEMS : [];
            const result = [];

            // 本遊戲所有正確短句＋正確答案本身都排除
            const usedSet = new Set([correctText]);
            if (this.targetSegments) {
                for (const seg of this.targetSegments) usedSet.add(seg.text);
            }

            // 判斷候選字是否合法
            const isAllowed = (d) => {
                if (!d || d.length === 0 || usedSet.has(d)) return false;
                // 前綴包含關係 → 禁止（玩家無法分辨字數）
                if (correctText.startsWith(d) || d.startsWith(correctText)) return false;
                return true;
            };

            // 收集候選段：使用 sharedSplitLine 確保產生自然詩句分段（符合 5/7 字規則）
            // 優先1：含正確短句任意字的詩句（高相關性）
            // 優先2：同首詩其他詩句（混淆感最強）
            // 低優先：其他詩句（補足數量）
            const highSet = new Set();
            const lowSet = new Set();
            const sameSet = new Set();
            const splitFn = window.sharedSplitLine || ((l) => [l]);

            for (const poem of DB) {
                if (!poem.content) continue;
                for (const line of poem.content) {
                    if (!line || allPoemLines.includes(line)) continue;
                    const hasKey = correctText.split('').some(ch => line.includes(ch));
                    // 以 sharedSplitLine 拆分，只產生自然詩句段落，不取任意子字串
                    const segs = splitFn(line, singleCharProb || 0);
                    for (const seg of segs) {
                        if (isAllowed(seg)) {
                            (hasKey ? highSet : lowSet).add(seg);
                        }
                    }
                }
            }
            // 同首詩不同詩句（用 sharedSplitLine 確保自然分段）
            for (const line of allPoemLines) {
                if (!line) continue;
                const segs = splitFn(line, singleCharProb || 0);
                for (const seg of segs) {
                    if (isAllowed(seg)) sameSet.add(seg);
                }
            }

            const shuffle = (arr) => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
            };
            const high = [...highSet], same = [...sameSet], low = [...lowSet];
            shuffle(high); shuffle(same); shuffle(low);

            for (const seg of [...high, ...same, ...low]) {
                if (result.length >= count) break;
                if (!usedSet.has(seg)) {
                    result.push(seg);
                    usedSet.add(seg);
                }
            }

            while (result.length < count) result.push('虛');
            return result;
        },

        // ── 啟動遊戲流程 ─────────────────────────────────────────
        startGameProcess: function (isRetry) {
            const s = this.difficultySettings[this.difficulty];
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.targetIndex = 0;
            this.hearts = s.maxMistakeCount || 5;
            this._startRowReplenished = false;
            this.splashes = [];
            this.floatTexts = [];
            // 實際時限 = 全詩字數 × timeLimitRate
            const calcTimeLimit17 = this.fullPoemText.length * s.timeLimitRate;
            this.timer = calcTimeLimit17;
            this.maxTimer = calcTimeLimit17;
            this.lastTimestamp = 0;

            document.getElementById('game17-score').textContent = '0';
            document.getElementById('game17-retryGame-btn').disabled = false;
            document.getElementById('game17-newGame-btn').disabled = false;
            if (window.GameMessage) window.GameMessage.hide();

            // 重置 D-pad 淡出計時器（新局開始，D-pad 重新可見）
            if (this.dpadFadeTimeoutId !== null) { clearTimeout(this.dpadFadeTimeoutId); this.dpadFadeTimeoutId = null; }
            this._dpadFadeStarted = false;
            const dpadEl = document.getElementById('game17-dpad');
            if (dpadEl) { dpadEl.style.transition = 'none'; dpadEl.style.opacity = '1'; }

            // 必須先 setupCanvas 取得 canvasH，再 generateSegments 決定 maxRows
            this.setupCanvas(s);
            this.targetSegments = this.generateSegments();
            this.updateHintBar(s);
            this.buildLilyPads(s);
            this.resetFrog();
            this.updateProgress();
            this.renderHearts();
            this.updateTimerBar(1);

            this.stopLoop();
            this.animFrameId = requestAnimationFrame((ts) => {
                this.lastTimestamp = ts;
                this.gameLoop(ts);
            });
        },

        // ── 設置 Canvas ──────────────────────────────────────────
        setupCanvas: function (s) {
            const wrap = document.getElementById('game17-canvas-wrap');
            this.canvas = document.getElementById('game17-canvas');
            this.ctx = this.canvas.getContext('2d');
            const wrapH = wrap.offsetHeight;
            this.canvasH = (wrapH > 50) ? wrapH : 660;
            this.canvas.width = 500;
            this.canvas.height = this.canvasH;
        },

        // ── 建立浮木（每列：正確短句 + 混淆短句，含兩種間距設計）──────────
        // 間距類型：
        //   'close'  — 緊靠（約 10px 視覺間隔），青蛙可以跳過
        //   'gap'    — 故意留空（≥3字寬 ≈ 66px），青蛙無法跨越
        buildLilyPads: function (s) {
            this.lilyPads = [];

            const numRows = this.targetSegments.length;
            if (numRows === 0) return;

            // 計算列高與跳躍距離
            const riverH = this.canvasH - this.BANK_H * 2;
            this.rowH = riverH / numRows;
            this.jumpRange = this.rowH * 1.5 + this.BANK_H;

            const CHAR_W = 32;   // 每個字的估算寬度（配合 32px 字型）
            const CLOSE_GAP = 10;   // 緊靠間距（px）
            const MIN_BIG_GAP = CHAR_W * 3; // 故意留空最小寬度（3字寬 = 96px）

            for (let row = 0; row < numRows; row++) {
                const seg = this.targetSegments[row];
                const segText = seg.text;
                // 每列浮木數量在 [minPadsPerRow, maxPadsPerRow] 區間隨機（含端點），讓畫面有變化
                const minN = s.minPadsPerRow || s.padsPerRow || 4;
                const maxN = s.maxPadsPerRow || s.padsPerRow || minN;
                const numPads = minN + Math.floor(Math.random() * (maxN - minN + 1));
                // 第一排（最靠近起點岸台）只放正確句，不出現混淆句 → 玩家容易上手
                const numDecoys = (row === 0) ? 0 : numPads - 1;
                const decoys = this.buildDecoysForRow(segText, numDecoys, this.poemLines, s.singleCharProb);

                // 合成浮木列表（正確 + 混淆），Fisher-Yates 洗牌
                const padInfos = [
                    { text: segText, isCorrect: true },
                    ...decoys.map(t => ({ text: t, isCorrect: false }))
                ];
                for (let i = padInfos.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [padInfos[i], padInfos[j]] = [padInfos[j], padInfos[i]];
                }

                const N = padInfos.length;

                // 各浮木寬度（混淆字與正確字數可不同 → 不同寬度）
                const pWidths = padInfos.map(info => Math.max(48, info.text.length * CHAR_W + 16));
                const totalPadW = pWidths.reduce((a, b) => a + b, 0);

                // 決定各相鄰間距類型（index i = 第 i 個浮木右側的間距）
                // closeNeighborProb：每個間距為 close 的機率（難度越高越低）
                const prob = (typeof s.closeNeighborProb === 'number') ? s.closeNeighborProb : 0.5;
                const gapTypes = Array(N).fill('close');
                // 先依機率隨機分配
                for (let i = 0; i < N; i++) {
                    gapTypes[i] = Math.random() < prob ? 'close' : 'gap';
                }
                // 確保至少有 1 個 close（讓玩家不至於完全無法橫移）
                if (!gapTypes.includes('close')) {
                    gapTypes[Math.floor(Math.random() * N)] = 'close';
                }
                // 確保至少有 1 個 gap（讓視覺上有大間距存在）
                if (!gapTypes.includes('gap')) {
                    gapTypes[Math.floor(Math.random() * N)] = 'gap';
                }

                // 計算間距大小
                // ── 核心約束：cycleW 必須 > 500 + 最寬浮木寬度 ──
                // 確保浮木 wrap 回對側時，完全在畫面外，不會在畫面內突然冒出
                const numBig = gapTypes.filter(t => t === 'gap').length;
                const numClose = N - numBig;
                const maxPadW = Math.max(...pWidths);
                const minCycleW = 500 + maxPadW + 20;  // 500 + 最寬浮木 + 20px 緩衝
                const totalForBig = minCycleW - totalPadW - numClose * CLOSE_GAP;
                const bigGap = numBig > 0
                    ? Math.max(MIN_BIG_GAP, Math.floor(totalForBig / numBig))
                    : MIN_BIG_GAP;
                const gapSizes = gapTypes.map(t => t === 'gap' ? bigGap : CLOSE_GAP);

                // cycleW：浮木循環一圈的總寬度（必須 > 500 + 最寬浮木）
                const cycleW = totalPadW + gapSizes.reduce((a, b) => a + b, 0);

                // 計算各浮木相對中心 X（從 gapSizes[0] 後開始排）
                const relCenterXs = [];
                let cursor2 = gapSizes[0];
                for (let i = 0; i < N; i++) {
                    relCenterXs[i] = cursor2 + pWidths[i] / 2;
                    cursor2 += pWidths[i] + (i + 1 < N ? gapSizes[i + 1] : 0);
                }

                // 此列中心 Y、速度
                const cy = this.canvasH - this.BANK_H - (row + 0.5) * this.rowH;
                const dir = (row % 2 === 0) ? 1 : -1;
                const speed = s.baseSpeed * (0.75 + Math.random() * 0.5) * dir;

                // ── 浮木從螢幕外生成（從入口邊滑入，避免在畫面中突然出現）──
                // vx > 0 向右移動：從左側畫面外進入，最左浮木中心剛好在 x=0 左側
                // vx < 0 向左移動：從右側畫面外進入，最右浮木中心剛好在 x=500 右側
                let offShift;
                if (speed > 0) {
                    // 最左浮木的右緣對齊 x=0（整排完全在畫面左側外）
                    offShift = -(relCenterXs[0] + pWidths[0] / 2);
                } else {
                    // 最右浮木的左緣對齊 x=500（整排完全在畫面右側外）
                    offShift = 500 - (relCenterXs[N - 1] - pWidths[N - 1] / 2);
                }
                const padCenterXs = relCenterXs.map(x => x + offShift);

                for (let col = 0; col < N; col++) {
                    const info = padInfos[col];
                    this.lilyPads.push({
                        id: this.lilyPads.length,
                        row,
                        segmentIndex: info.isCorrect ? row : -1,
                        text: info.text,
                        isCorrect: info.isCorrect,
                        x: padCenterXs[col],
                        y: cy,
                        vx: speed,
                        displayW: pWidths[col],
                        state: 'normal',
                        sinkAlpha: 1,
                        sinkTimer: 0,
                        glowPhase: Math.random() * Math.PI * 2,
                        circularOrder: col,        // 本列循環序位（0 ~ N-1，固定不變）
                        circularTotal: N,
                        gapRight: gapTypes[col], // 此浮木右側間距類型
                        cycleW,                    // 用於 wrap 計算
                    });
                }
            }
        },

        // ── 重置青蛙至下方起點岸台中央 ──────────────────────────
        resetFrog: function () {
            this.frog = {
                x: 250,
                y: this.canvasH - this.BANK_H / 2,
                isJumping: false,
                jumpElapsed: 0,
                jumpDuration: 300,
                jumpFromX: 0,
                jumpFromY: 0,
                jumpToX: 0,
                jumpToY: 0,
                pendingLandPad: null,
                pendingPadOffset: 0, // 落地時與浮木中心的 X 偏移
                currentPad: null,
                padOffsetX: 0,       // 青蛙在浮木上的 X 偏移（允許不在正中央）
                isOnBottomBank: true,
                isOnTopBank: false,
                // ── 落水動畫狀態 ──
                fallState: null,     // null | 'jumping' | 'sinking'
                fallElapsed: 0,
                fallAlpha: 1,
                fallFromX: 0,
                fallFromY: 0,
                fallToX: 0,          // 落水動畫目標 X（固定距離跳躍後的落點）
                fallToY: 0,          // 落水動畫目標 Y
                _fallPenaltyPending: false,  // 落水動畫結束才執行扣血
                _pendingRowSkipRow: -1,      // 跳脫未完成列的旗標，動畫結束才扣血
            };
        },

        // ── 遊戲主循環 ───────────────────────────────────────────
        gameLoop: function (timestamp) {
            if (!this.isActive) return;
            const dt = Math.min(timestamp - this.lastTimestamp, 80);
            this.lastTimestamp = timestamp;
            this.update(dt);
            this.draw();
            this.animFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
        },

        // ── 更新邏輯 ─────────────────────────────────────────────
        update: function (dt) {
            const s = this.difficultySettings[this.difficulty];

            // 倒數計時（落水動畫期間暫停，不扣時間）
            if (!this.frog.fallState) {
                this.timer -= dt / 1000;
                if (this.timer <= 0) {
                    this.timer = 0;
                    this.updateTimerBar(0);
                    this.gameOver(false, 'timeout');
                    return;
                }
                this.updateTimerBar(this.timer / this.maxTimer);
            }

            // 更新各浮木位置與狀態（無論是否有落水動畫，浮木繼續漂流）
            for (const pad of this.lilyPads) {
                if (pad.state === 'sunken') continue;

                // 水平漂移並循環
                // 當浮木完全離開畫面右側（右緣 > 500）才換回左側，避免在畫面內突然冒出
                pad.x += pad.vx * dt / 1000;
                const halfW = pad.displayW / 2;
                const cw = pad.cycleW || 500;
                if (pad.vx > 0 && pad.x - halfW > 500) {
                    pad.x -= cw;
                } else if (pad.vx < 0 && pad.x + halfW < 0) {
                    pad.x += cw;
                }

                // 下沉倒數
                if (pad.state === 'sinking') {
                    pad.sinkTimer -= dt;
                    pad.sinkAlpha = Math.max(0, pad.sinkTimer / s.sinkDelay);
                    if (pad.sinkTimer <= 0) {
                        pad.state = 'sunken';
                        pad.sinkAlpha = 0;
                        if (this.frog.currentPad === pad && !this.frog.isJumping && !this.frog.fallState) {
                            this.frogFallInWater();
                        }
                    }
                }
            }

            // ── 落水動畫期間：只更新動畫，跳過一般青蛙邏輯 ──────
            if (this.frog.fallState) {
                this.updateFallAnim(dt);
                this.splashes = this.splashes.filter(sp => { sp.t += dt; return sp.t < sp.duration; });
                this.floatTexts = this.floatTexts.filter(ft => { ft.t += dt; return ft.t < ft.duration; });
                return;
            }

            // 青蛙跟著浮木漂移（保持相對偏移 padOffsetX，不強制對齊中心）
            if (!this.frog.isJumping && this.frog.currentPad) {
                const pad = this.frog.currentPad;
                if (pad.state !== 'sunken') {
                    this.frog.x = pad.x + (this.frog.padOffsetX || 0);
                    this.frog.y = pad.y;
                    if (this.frog.x < -20 || this.frog.x > 520) {
                        this.frogFallOffEdge();
                        return;
                    }
                }
            }

            // 跳躍拋物線動畫（動態追蹤：每幀更新 jumpToX = pad.x + offset）
            if (this.frog.isJumping) {
                this.frog.jumpElapsed += dt;
                const t = Math.min(this.frog.jumpElapsed / this.frog.jumpDuration, 1);
                const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

                // 追蹤目標浮木 + 保持偏移，確保落點準確
                if (this.frog.pendingLandPad && this.frog.pendingLandPad.state !== 'sunken') {
                    this.frog.jumpToX = this.frog.pendingLandPad.x + (this.frog.pendingPadOffset || 0);
                    this.frog.jumpToY = this.frog.pendingLandPad.y;
                }

                const dist = Math.hypot(this.frog.jumpToX - this.frog.jumpFromX, this.frog.jumpToY - this.frog.jumpFromY);
                const arcH = Math.max(30, dist * 0.4);
                const midX = (this.frog.jumpFromX + this.frog.jumpToX) / 2;
                const midY = Math.min(this.frog.jumpFromY, this.frog.jumpToY) - arcH;
                const bt = ease;
                this.frog.x = (1 - bt) * (1 - bt) * this.frog.jumpFromX + 2 * (1 - bt) * bt * midX + bt * bt * this.frog.jumpToX;
                this.frog.y = (1 - bt) * (1 - bt) * this.frog.jumpFromY + 2 * (1 - bt) * bt * midY + bt * bt * this.frog.jumpToY;

                if (t >= 1) {
                    this.frog.isJumping = false;
                    this.frog.x = this.frog.jumpToX;
                    this.frog.y = this.frog.jumpToY;
                    this.onFrogLanded();
                    // 同步到帶偏移的浮木位置（消除一幀偏差）
                    if (this.frog.currentPad) {
                        this.frog.x = this.frog.currentPad.x + (this.frog.padOffsetX || 0);
                        this.frog.y = this.frog.currentPad.y;
                    }
                }
            }

            this.splashes = this.splashes.filter(sp => { sp.t += dt; return sp.t < sp.duration; });
            this.floatTexts = this.floatTexts.filter(ft => { ft.t += dt; return ft.t < ft.duration; });
        },

        // ── 青蛙落地 ─────────────────────────────────────────────
        onFrogLanded: function () {
            const pad = this.frog.pendingLandPad;
            const offset = this.frog.pendingPadOffset || 0;
            this.frog.pendingLandPad = null;
            this.frog.pendingPadOffset = 0;

            if (!pad) {
                if (this.frog.isOnTopBank) this.gameOver(true, 'complete');
                return;
            }

            this.frog.currentPad = pad;
            this.frog.padOffsetX = offset;  // 保留實際落點偏移，不修正

            // 動畫結束才處理跳脫未完成列的扣血
            const skipRow = this.frog._pendingRowSkipRow;
            this.frog._pendingRowSkipRow = -1;
            if (skipRow >= 0) {
                this._applyRowSkipPenalty(skipRow);
                if (this.hearts <= 0) return;
            }

            // 已通過的列（row < targetIndex）：安全踩踏，無懲罰
            if (pad.row < this.targetIndex) return;

            if (pad.isCorrect && pad.segmentIndex === this.targetIndex) {
                this.onCorrectChar(pad);
            } else {
                this.onWrongChar(pad);
            }
        },

        // ── 動畫結束才執行跳脫未完成列的扣血（音效+震動+扣血+進度更新） ──
        _applyRowSkipPenalty: function (skippedRow) {
            if (!this.isActive) return;
            if (window.SoundManager) window.SoundManager.playFailure();
            this.triggerShake();
            this.hearts--;
            this.renderHearts();
            this.targetIndex = skippedRow + 1;
            this.updateProgress();
            this.updateHintBar(this.difficultySettings[this.difficulty]);
            if (this.hearts <= 0) {
                setTimeout(() => { if (this.isActive) this.gameOver(false, 'heartless'); }, 600);
            }
        },

        // ── 踩到正確短句 ──────────────────────────────────────────
        onCorrectChar: function (pad) {
            if (window.SoundManager) window.SoundManager.playSuccessShort();

            const pts = this.getPointA();
            this.score += pts;
            document.getElementById('game17-score').textContent = Math.floor(this.score);
            this.addFloatText('+' + pts, pad.x, pad.y - 25);

            // 浮木開始下沉
            const s = this.difficultySettings[this.difficulty];
            pad.state = 'sinking';
            pad.sinkTimer = s.sinkDelay;

            this.targetIndex++;
            this.updateProgress();
            this.updateHintBar(s);

            // 踩完第一排正確句後，補上空白浮木，確保被送回起點時還有東西可踩
            if (pad.row === 0 && !this._startRowReplenished) {
                this._startRowReplenished = true;
                this._replenishStartRow();
            }

            // 踩完最後一段後，自動跳往上方終點岸台
            if (this.targetIndex >= this.targetSegments.length) {
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();
                setTimeout(() => { if (this.isActive) this.jumpToTopBank(); }, 350);
            }
        },

        // ── 補上第一排空白浮木（玩家通過第一排後，避免回起點時無浮木可踩）──
        // 規則：產生 3~5 片寬度不一的空白浮木（無字、僅造型），與原 row 0 同方向漂流
        _replenishStartRow: function () {
            const row = 0;
            const cy = this.canvasH - this.BANK_H - (row + 0.5) * this.rowH;
            const s = this.difficultySettings[this.difficulty];
            const dir = (row % 2 === 0) ? 1 : -1;
            const speed = s.baseSpeed * (0.75 + Math.random() * 0.5) * dir;

            const CHAR_W = 32;
            const CLOSE_GAP = 10;
            const numBlanks = 3 + Math.floor(Math.random() * 3); // 3 ~ 5

            // 寬度：1~3 個字寬，視覺有變化
            const widths = [];
            for (let i = 0; i < numBlanks; i++) {
                const charCount = 1 + Math.floor(Math.random() * 3);
                widths.push(Math.max(48, charCount * CHAR_W + 16));
            }

            // cycleW：必須 > 500 + 最寬浮木 + 20px，確保循環時完全在畫面外
            const maxW = Math.max(...widths);
            const totalW = widths.reduce((a, b) => a + b, 0);
            // 隨機決定每個間隙是 close 或 big，至少有一個 close
            const gapTypes = [];
            for (let i = 0; i < numBlanks; i++) {
                gapTypes.push(Math.random() < 0.4 ? 'close' : 'big');
            }
            if (!gapTypes.includes('close')) gapTypes[0] = 'close';

            const numBig = gapTypes.filter(t => t === 'big').length;
            const numClose = numBlanks - numBig;
            const minCycleW = 500 + maxW + 20;
            const totalForBig = minCycleW - totalW - numClose * CLOSE_GAP;
            const bigGap = numBig > 0
                ? Math.max(CHAR_W * 3, Math.floor(totalForBig / numBig))
                : CHAR_W * 3;
            const gapSizes = gapTypes.map(t => t === 'big' ? bigGap : CLOSE_GAP);
            const cycleW = totalW + gapSizes.reduce((a, b) => a + b, 0);

            // 計算各浮木中心 X（從畫面外左側開始排，整列在畫面左外側）
            const relCenterXs = [];
            let cursor = gapSizes[0];
            for (let i = 0; i < numBlanks; i++) {
                relCenterXs[i] = cursor + widths[i] / 2;
                cursor += widths[i] + (i + 1 < numBlanks ? gapSizes[i + 1] : 0);
            }
            // 補充浮木直接出現在畫面上（不從外飄入，避免短暫無踏腳處）
            // 隨機相位 offShift 讓整列在 [-cycleW/2, +cycleW/2] 內任意位置
            const offShift = Math.floor(Math.random() * cycleW) - Math.floor(cycleW / 2);
            const padCenterXs = relCenterXs.map(x => {
                let cx = x + offShift;
                // wrap 到 [-cycleW/2, cycleW/2 + 500] 範圍，落在畫面附近
                while (cx < -widths[0]) cx += cycleW;
                while (cx > 500 + maxW) cx -= cycleW;
                return cx;
            });

            for (let i = 0; i < numBlanks; i++) {
                this.lilyPads.push({
                    id: this.lilyPads.length,
                    row,
                    segmentIndex: -1,
                    text: ' ',           // 空白文字：fillText 不顯示可見字符
                    isCorrect: false,
                    x: padCenterXs[i],
                    y: cy,
                    vx: speed,
                    displayW: widths[i],
                    state: 'normal',
                    sinkAlpha: 1,
                    sinkTimer: 0,
                    glowPhase: Math.random() * Math.PI * 2,
                    circularOrder: i,
                    circularTotal: numBlanks,
                    gapRight: gapTypes[i],
                    cycleW: cycleW,
                    isBlank: true,
                });
            }
        },

        // ── 踩到混淆短句 ──────────────────────────────────────────
        // 規則：踩到非正確字不扣心，扣心只來自：A 落水  B 跳過未完成列
        onWrongChar: function (pad) {
            // 無懲罰
        },

        // ── 青蛙落水：先演完跳弧 → 水花 → 下沉淡出，動畫結束才扣血/震動/音效 ──
        // 規則：所有判定（震動、音效、扣血）一律延後到動畫結束（沉入水面後）
        frogFallInWater: function (targetX, targetY) {
            if (!this.isActive) return;
            if (this.frog.fallState) return;

            this.frog.fallState = 'jumping';
            this.frog.fallElapsed = 0;
            this.frog.fallAlpha = 1;
            this.frog.fallFromX = this.frog.x;
            this.frog.fallFromY = this.frog.y;
            this.frog.fallToX = (targetX !== undefined) ? targetX : this.frog.x;
            this.frog.fallToY = (targetY !== undefined) ? targetY : this.frog.y;

            this.frog.currentPad = null;
            this.frog.pendingLandPad = null;
            this.frog.isJumping = false;
            this.frog.isOnBottomBank = false;
            this.frog.isOnTopBank = false;
            // 旗標：等動畫結束才執行真正的失誤判定
            this.frog._fallPenaltyPending = true;
        },

        // ── 落水動畫結束時觸發的真正失誤判定（音效+震動+扣血） ──
        _applyFallPenalty: function () {
            if (!this.isActive) return;
            if (window.SoundManager) window.SoundManager.playFailure();
            this.triggerShake();
            this.hearts--;
            this.renderHearts();
            if (this.hearts <= 0) {
                setTimeout(() => { if (this.isActive) this.gameOver(false, 'heartless'); }, 600);
            }
        },

        // ── 落水動畫更新（每幀呼叫）──────────────────────────────
        // 跳弧期：從 fallFromX/Y 以拋物線飛向 fallToX/Y（固定距離落點）
        updateFallAnim: function (dt) {
            if (!this.frog.fallState) return;
            this.frog.fallElapsed += dt;
            const JUMP_DUR = 280;
            const SINK_DUR = 420;

            if (this.frog.fallState === 'jumping') {
                const t = Math.min(this.frog.fallElapsed / JUMP_DUR, 1);
                const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                const fx = this.frog.fallFromX;
                const fy = this.frog.fallFromY;
                const tx = this.frog.fallToX;
                const ty = this.frog.fallToY;
                const dist = Math.hypot(tx - fx, ty - fy);
                const arcH = Math.max(28, dist * 0.35);
                const midX = (fx + tx) / 2;
                const midY = Math.min(fy, ty) - arcH;
                this.frog.x = (1 - ease) * (1 - ease) * fx + 2 * (1 - ease) * ease * midX + ease * ease * tx;
                this.frog.y = (1 - ease) * (1 - ease) * fy + 2 * (1 - ease) * ease * midY + ease * ease * ty;

                if (this.frog.fallElapsed >= JUMP_DUR) {
                    this.frog.fallState = 'sinking';
                    this.frog.fallElapsed -= JUMP_DUR;
                    this.frog.x = tx;
                    this.frog.y = ty;
                    this.splashes.push({ x: tx, y: ty, t: 0, duration: 700, r: 5 });
                }
            } else if (this.frog.fallState === 'sinking') {
                const t = Math.min(this.frog.fallElapsed / SINK_DUR, 1);
                this.frog.fallAlpha = 1 - t;
                this.frog.y = this.frog.fallToY + t * 20;

                if (this.frog.fallElapsed >= SINK_DUR) {
                    this.frog.fallState = null;
                    this.frog.fallAlpha = 1;
                    this.frog.x = 250;
                    this.frog.y = this.canvasH - this.BANK_H / 2;
                    this.frog.isOnBottomBank = true;
                    // 動畫結束才執行：先跳脫列扣血，再落水扣血
                    const skipRow = this.frog._pendingRowSkipRow;
                    this.frog._pendingRowSkipRow = -1;
                    if (skipRow >= 0 && this.hearts > 0) {
                        this._applyRowSkipPenalty(skipRow);
                    }
                    if (this.frog._fallPenaltyPending) {
                        this.frog._fallPenaltyPending = false;
                        if (this.hearts > 0) this._applyFallPenalty();
                    }
                }
            }
        },

        // ── 青蛙被浮木帶出畫面邊界：扣心後回到當前列最靠近中央的浮木 ──
        frogFallOffEdge: function () {
            if (!this.isActive) return;
            if (window.SoundManager) window.SoundManager.playFailure();

            // 邊緣水花（左邊或右邊）
            const splashX = (this.frog.x < 250) ? 5 : 495;
            this.splashes.push({ x: splashX, y: this.frog.y, t: 0, duration: 700, r: 5 });
            this.triggerShake();

            // 記錄原列，清空跳躍狀態
            const savedRow = this.frog.currentPad ? this.frog.currentPad.row : -1;
            this.frog.currentPad = null;
            this.frog.isJumping = false;
            this.frog.isOnBottomBank = false;
            this.frog.isOnTopBank = false;

            // 找當前列中最靠近 x=250 的非沉沒浮木，傳送青蛙到該浮木上
            let landed = false;
            if (savedRow >= 0) {
                const rowPads = this.lilyPads.filter(p => p.row === savedRow && p.state !== 'sunken');
                if (rowPads.length > 0) {
                    const centerPad = rowPads.reduce((best, p) =>
                        Math.abs(p.x - 250) < Math.abs(best.x - 250) ? p : best
                    );
                    this.frog.x = centerPad.x;
                    this.frog.y = centerPad.y;
                    this.frog.currentPad = centerPad;
                    landed = true;
                }
            }
            if (!landed) {
                // 找不到浮木，退回起點岸台
                this.frog.x = 250;
                this.frog.y = this.canvasH - this.BANK_H / 2;
                this.frog.isOnBottomBank = true;
            }

            this.hearts--;
            this.renderHearts();
            if (this.hearts <= 0) {
                setTimeout(() => this.gameOver(false, 'heartless'), 500);
            }
        },

        // ── 判斷水平相鄰跳躍是否合法（同列、緊鄰、間距 ≤ 2.5字寬）────────
        canJumpHorizontal: function (targetPad, currentPad) {
            if (!currentPad || targetPad.row !== currentPad.row) return false;
            const CHAR_W = 22;
            const MAX_GAP = CHAR_W * 2.5;
            const edgeDist = Math.abs(targetPad.x - currentPad.x)
                - (targetPad.displayW + currentPad.displayW) / 2;
            if (edgeDist > MAX_GAP) return false;
            // 中間不得有其他浮木
            const minX = Math.min(currentPad.x, targetPad.x);
            const maxX = Math.max(currentPad.x, targetPad.x);
            for (const other of this.lilyPads) {
                if (other.row === currentPad.row && other.state !== 'sunken' &&
                    other.id !== currentPad.id && other.id !== targetPad.id &&
                    other.x > minX && other.x < maxX) return false;
            }
            return true;
        },

        // ================================================================
        // 輸入系統（完全仿照 game15：觸控滑動 + 鍵盤方向鍵）
        // 青蛙只能往 上 / 左 / 右 移動，絕對禁止往下或斜跳
        // ================================================================
        setupInput: function () {
            const canvas = document.getElementById('game17-canvas');
            if (!canvas) return;

            // 觸控滑動（passive: false 允許 preventDefault 阻止頁面捲動）
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this._startDpadFadeTimer();
            }, { passive: false });

            canvas.addEventListener('touchend', (e) => {
                if (!this.isActive) return;
                e.preventDefault();
                const dx = e.changedTouches[0].clientX - this.touchStartX;
                const dy = e.changedTouches[0].clientY - this.touchStartY;
                if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // 太短不算滑動
                this.processSwipe(dx, dy);
            }, { passive: false });

            // 鍵盤方向鍵（掛在 window，與 game15 相同）
            window.addEventListener('keydown', (e) => {
                if (!this.isActive) return;
                switch (e.key) {
                    case 'ArrowUp': case 'w': case 'W':
                        this._startDpadFadeTimer();
                        this.jumpUp(); e.preventDefault(); break;
                    case 'ArrowLeft': case 'a': case 'A':
                        this._startDpadFadeTimer();
                        this.jumpLeft(); e.preventDefault(); break;
                    case 'ArrowRight': case 'd': case 'D':
                        this._startDpadFadeTimer();
                        this.jumpRight(); e.preventDefault(); break;
                }
            });
        },

        // ── D-pad 淡出：首次滑動/按鍵後 10 秒開始，5 秒淡至透明 ──
        _startDpadFadeTimer: function () {
            if (this._dpadFadeStarted) return;
            this._dpadFadeStarted = true;
            this.dpadFadeTimeoutId = setTimeout(() => {
                const dpad = document.getElementById('game17-dpad');
                if (dpad) { dpad.style.transition = 'opacity 5s ease'; dpad.style.opacity = '0'; }
                this.dpadFadeTimeoutId = null;
            }, 10000);
        },

        // ── 滑動方向解析（仿 game15 processSwipe）────────────────────
        processSwipe: function (dx, dy) {
            if (Math.abs(dx) >= Math.abs(dy)) {
                // 水平滑動
                if (dx > 0) this.jumpRight();
                else this.jumpLeft();
            } else {
                // 垂直滑動
                if (dy < 0) this.jumpUp();
                // dy > 0（向下滑）→ 忽略，不允許往回跳
            }
        },

        // ── 通用跳躍啟動（設定 frog 跳躍狀態）────────────────────────
        // padOffset：青蛙落地相對於浮木中心的 X 偏移（0=正中央，非零=保持原位）
        startJump: function (targetPad, padOffset) {
            const offX = (padOffset !== undefined) ? padOffset : 0;
            const tx = targetPad.x + offX;
            const ty = targetPad.y;
            const dist = Math.hypot(tx - this.frog.x, ty - this.frog.y);
            this.frog.isJumping = true;
            this.frog.jumpElapsed = 0;
            this.frog.jumpDuration = Math.max(200, Math.min(500, dist * 1.8));
            this.frog.jumpFromX = this.frog.x;
            this.frog.jumpFromY = this.frog.y;
            this.frog.jumpToX = tx;
            this.frog.jumpToY = ty;
            this.frog.pendingLandPad = targetPad;
            this.frog.pendingPadOffset = offX;
            this.frog.currentPad = null;
            this.frog.isOnBottomBank = false;
            this.frog.isOnTopBank = false;
        },

        // ── 起點岸台上的水平 60px 滑動（不離開岸台、無浮木判定） ──────
        _startBankSlide: function (targetX, targetY) {
            const dist = Math.abs(targetX - this.frog.x);
            this.frog.isJumping = true;
            this.frog.jumpElapsed = 0;
            this.frog.jumpDuration = Math.max(160, Math.min(280, dist * 2.5));
            this.frog.jumpFromX = this.frog.x;
            this.frog.jumpFromY = this.frog.y;
            this.frog.jumpToX = targetX;
            this.frog.jumpToY = targetY;
            this.frog.pendingLandPad = null;
            this.frog.pendingPadOffset = 0;
            // 保留 isOnBottomBank = true，動畫結束 onFrogLanded 不會做事
        },

        // ── 向上跳（垂直往上，固定距離 = rowH；保持 X 位置不變）────────
        // 規則：所有判定（包括跳脫未完成列的扣血）一律延後到動畫結束。
        //       落點檢查改用嚴格中心點規則：fromX 必須在浮木視覺範圍內。
        jumpUp: function () {
            if (!this.isActive || this.frog.isJumping || this.frog.fallState) return;

            // 若在某列浮木上且該列目標尚未完成 → 記錄旗標，動畫結束才扣血
            let pendingRowSkipRow = -1;
            if (this.frog.currentPad) {
                const row = this.frog.currentPad.row;
                if (row >= this.targetIndex) {
                    pendingRowSkipRow = row;
                }
            }

            // 決定目標列號
            const targetRow = this.frog.isOnBottomBank ? 0
                : (this.frog.currentPad ? this.frog.currentPad.row + 1 : null);
            if (targetRow === null) return;

            // 所有短句都完成 → 跳往上方終點岸台
            if (targetRow >= this.targetSegments.length) {
                this.jumpToTopBank();
                return;
            }

            // 青蛙垂直上跳：保持原 X 不變，Y 上移 rowH
            const fromX = this.frog.x;
            const targetRowY = this.canvasH - this.BANK_H - (targetRow + 0.5) * this.rowH;

            // 嚴格中心點判定：fromX 必須在浮木視覺範圍 [pad.x − halfW, pad.x + halfW] 內
            const rowPads = this.lilyPads.filter(p => p.row === targetRow && p.state !== 'sunken');
            let hit = null;
            for (const p of rowPads) {
                if (fromX >= p.x - 10 - p.displayW / 2 && fromX <= p.x + 10 + p.displayW / 2) {
                    hit = p;
                    break;
                }
            }

            this._logJump('↑上', this.frog.currentPad, fromX, fromX, rowPads, hit, 0);

            // 記錄跳脫旗標到 frog，等 onFrogLanded / 落水動畫結束再處理
            this.frog._pendingRowSkipRow = pendingRowSkipRow;

            if (hit) {
                this.startJump(hit, fromX - hit.x);
            } else {
                this.frogFallInWater(fromX, targetRowY);
            }
        },

        // ── 向左跳：固定 60px，落點中心點是否在任一浮木的視覺範圍內 ──
        // 規則（嚴格依使用者規格）：
        //   1. 移動距離固定 60px，任何情況不變
        //   2. 用青蛙中心點(targetX)比對是否位於浮木視覺範圍 [pad.x − halfW, pad.x + halfW]
        //   3. 不修正落點，不置中
        //   4. 不論是否落水，先演 60px 跳躍動畫；落水再演沉入動畫
        jumpLeft: function () {
            if (!this.isActive || this.frog.isJumping || this.frog.fallState) return;
            if (this.frog.isOnTopBank) return;

            const JUMP_STEP = 60;
            const fromX = this.frog.x;
            const fromY = this.frog.y;
            const targetX = fromX - JUMP_STEP;

            // 在起點岸台上：純水平 60px 滑動（不離開岸台、不檢查浮木、不會落水）
            if (this.frog.isOnBottomBank) {
                const clampedX = Math.max(20, targetX);
                this._startBankSlide(clampedX, fromY);
                return;
            }

            if (!this.frog.currentPad) return;
            const cur = this.frog.currentPad;

            // 同列所有浮木（含當前浮木，跳 60px 後可能仍在當前浮木上 → 合法）
            const rowPads = this.lilyPads.filter(p =>
                p.row === cur.row && p.state !== 'sunken'
            );
            // 中心點落在哪片浮木的視覺範圍內？
            let hit = null;
            for (const p of rowPads) {
                if (targetX >= p.x - 10 - p.displayW / 2 && targetX <= p.x + 10 + p.displayW / 2) {
                    hit = p;
                    break;
                }
            }

            this._logJump('←左', cur, fromX, targetX, rowPads, hit, 0);
            if (hit) {
                // 落在浮木上：以實際 targetX 為準，不修正
                this.startJump(hit, targetX - hit.x);
            } else {
                // 落水：先演完 60px 跳躍動畫，再沉入
                this.frogFallInWater(targetX, fromY);
            }
        },

        // ── 向右跳：固定 60px，邏輯與 jumpLeft 對稱 ────────────────
        jumpRight: function () {
            if (!this.isActive || this.frog.isJumping || this.frog.fallState) return;
            if (this.frog.isOnTopBank) return;

            const JUMP_STEP = 60;
            const fromX = this.frog.x;
            const fromY = this.frog.y;
            const targetX = fromX + JUMP_STEP;

            // 在起點岸台上：純水平 60px 滑動
            if (this.frog.isOnBottomBank) {
                const clampedX = Math.min(480, targetX);
                this._startBankSlide(clampedX, fromY);
                return;
            }

            if (!this.frog.currentPad) return;
            const cur = this.frog.currentPad;

            const rowPads = this.lilyPads.filter(p =>
                p.row === cur.row && p.state !== 'sunken'
            );
            let hit = null;
            for (const p of rowPads) {
                if (targetX >= p.x - 10 - p.displayW / 2 && targetX <= p.x + 10 + p.displayW / 2) {
                    hit = p;
                    break;
                }
            }

            this._logJump('→右', cur, fromX, targetX, rowPads, hit, 0);
            if (hit) {
                this.startJump(hit, targetX - hit.x);
            } else {
                this.frogFallInWater(targetX, fromY);
            }
        },

        // ── 找浮木：從 pads 中找碰撞框（displayW/2 + ext）涵蓋 targetX 的最近浮木 ──
        // 比 .find() 更可靠：同時有多片浮木的碰撞框重疊時，傳回最靠近的那片
        _nearestPadAt: function (pads, targetX, ext) {
            let best = null;
            let bestDist = Infinity;
            for (const p of pads) {
                const dist = Math.abs(p.x - targetX);
                if (dist <= p.displayW / 2 + ext && dist < bestDist) {
                    best = p;
                    bestDist = dist;
                }
            }
            return best;
        },

        // ── 診斷用：完整記錄每次跳躍（成功 or 落水） ──────────────────────
        // dir      : '↑上' | '←左' | '→右'
        // cur      : 目前踩的浮木（jumpLeft/Right）或 null（jumpUp）
        // fromX    : 青蛙起跳 X
        // targetX  : 預期落點 X
        // rowPads  : 候選浮木陣列（已排除 sunken；jumpLeft/Right 已排除 cur）
        // hitPad   : 命中的浮木或 null
        // ext      : PAD_HIT_EXTEND
        _logJump: function (dir, cur, fromX, targetX, rowPads, hitPad, ext) {
            const status = hitPad ? `✅ 命中 "${hitPad.text}"` : '💀 落水';
            const curInfo = cur
                ? `cur="${cur.text}" padX=${cur.x.toFixed(1)} w=${cur.displayW} offset=${(fromX - cur.x).toFixed(1)}`
                : '（底部岸台）';
            const label = `[game17] 🐸 jump${dir}  ${curInfo}  fromX=${fromX.toFixed(1)} targetX=${targetX.toFixed(1)} → ${status}`;

            const lines = rowPads.map(p => {
                const dist = Math.abs(p.x - targetX);
                const threshold = p.displayW / 2 + ext;
                const h = dist <= threshold;
                const marker = (hitPad && p.id === hitPad.id) ? '★' : (h ? '✅' : '❌');
                return `  ${marker} "${p.text}" padX=${p.x.toFixed(1)} w=${p.displayW} half+ext=${threshold.toFixed(0)} dist=${dist.toFixed(1)}`;
            });

            if (hitPad) {
                console.groupCollapsed(label);
            } else {
                console.group(label);   // 落水時展開，方便立即看到
            }
            if (lines.length === 0) {
                console.log('  （候選浮木：無）');
            } else {
                lines.forEach(l => console.log(l));
            }
            console.groupEnd();
        },

        // ── 跳往上方終點岸台（所有短句踩完後自動觸發）──────────
        jumpToTopBank: function () {
            if (!this.isActive) return;
            this.frog.isJumping = true;
            this.frog.jumpElapsed = 0;
            this.frog.jumpFromX = this.frog.x;
            this.frog.jumpFromY = this.frog.y;
            this.frog.jumpToX = 250;
            this.frog.jumpToY = this.BANK_H / 2;
            this.frog.pendingLandPad = null;
            this.frog.currentPad = null;
            this.frog.isOnTopBank = true;
            this.frog.isOnBottomBank = false;
            this.frog.jumpDuration = 500;
        },

        // ── 繪製 ─────────────────────────────────────────────────
        draw: function () {
            const ctx = this.ctx;
            const W = 500;
            const H = this.canvasH;
            ctx.clearRect(0, 0, W, H);
            this.drawRiver(W, H);
            this.drawBanks(W, H);
            this.drawLilyPads();
            this.drawFrog();
            this.drawSplashes();
            this.drawFloatTexts();
        },

        // ── 繪製河流底色與波紋（上下岸台之間的水域）────────────
        drawRiver: function (W, H) {
            const ctx = this.ctx;
            const y0 = this.BANK_H;
            const rH = H - this.BANK_H * 2;
            const grad = ctx.createLinearGradient(0, y0, 0, y0 + rH);
            grad.addColorStop(0, 'hsl(210, 65%, 16%)');
            grad.addColorStop(1, 'hsl(220, 70%, 10%)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, y0, W, rH);

            // 水波紋（橫向正弦波，隨時間滾動）
            const t = performance.now() / 1000;
            ctx.strokeStyle = 'hsla(200, 80%, 70%, 0.07)';
            ctx.lineWidth = 1;
            const waveSpacing = rH / 12;
            for (let i = 0; i < 13; i++) {
                const yw = y0 + waveSpacing * i + ((t * 15) % waveSpacing);
                if (yw < y0 || yw > y0 + rH) continue;
                ctx.beginPath();
                ctx.moveTo(0, yw);
                for (let x = 0; x <= W; x += 6) {
                    ctx.lineTo(x, yw + Math.sin((x * 0.08) + t * 1.5) * 2.5);
                }
                ctx.stroke();
            }
        },

        // ── 繪製上下岸台 ─────────────────────────────────────────
        drawBanks: function (W, H) {
            const ctx = this.ctx;
            const bH = this.BANK_H;

            // 上岸台（終點）
            const tg = ctx.createLinearGradient(0, 0, 0, bH);
            tg.addColorStop(0, 'hsl(95, 40%, 20%)');
            tg.addColorStop(1, 'hsl(90, 35%, 16%)');
            ctx.fillStyle = tg;
            ctx.fillRect(0, 0, W, bH);

            // 下岸台（起點）
            const bg = ctx.createLinearGradient(0, H - bH, 0, H);
            bg.addColorStop(0, 'hsl(90, 35%, 16%)');
            bg.addColorStop(1, 'hsl(95, 40%, 20%)');
            ctx.fillStyle = bg;
            ctx.fillRect(0, H - bH, W, bH);

            // 分隔線（帶綠色光暈）
            ctx.strokeStyle = 'hsla(100, 60%, 45%, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(0, bH); ctx.lineTo(W, bH); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, H - bH); ctx.lineTo(W, H - bH); ctx.stroke();

            // 岸台文字
            ctx.font = 'bold 15px "Noto Serif TC", serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'hsl(95, 55%, 62%)';
            ctx.fillText('終 點', W / 2, bH / 2 + 6);
            ctx.fillText('起 點', W / 2, H - bH / 2 + 6);
        },

        // ── 繪製所有浮木（短句/單字）─────────────────────────────
        drawLilyPads: function () {
            const ctx = this.ctx;
            const s = this.difficultySettings[this.difficulty];
            const now = performance.now() / 1000;

            for (const pad of this.lilyPads) {
                if (pad.state === 'sunken') continue;

                ctx.save();
                ctx.globalAlpha = pad.sinkAlpha;

                const isTarget = pad.isCorrect && pad.segmentIndex === this.targetIndex;
                const dw = pad.displayW;
                const dh = Math.max(44, Math.min(dw * 0.5, this.rowH * 0.72));

                // 目標短句金色光暈（小學 hint=all 模式）
                if (isTarget && s.hint === 'all') {
                    const pulse = 0.5 + 0.5 * Math.sin(now * 3 + pad.glowPhase);
                    const glowR = dw / 2 + 8 + pulse * 5;
                    const gGrad = ctx.createRadialGradient(pad.x, pad.y, dw * 0.1, pad.x, pad.y, glowR);
                    gGrad.addColorStop(0, 'hsla(48, 100%, 70%, 0.7)');
                    gGrad.addColorStop(1, 'hsla(48, 100%, 70%, 0)');
                    ctx.fillStyle = gGrad;
                    ctx.beginPath();
                    ctx.ellipse(pad.x, pad.y, glowR, glowR, 0, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (pad.text.length === 1) {
                    // 單字：荷葉造型（橢圓）
                    ctx.fillStyle = isTarget ? 'hsl(118, 58%, 28%)' : 'hsl(120, 42%, 19%)';
                    ctx.beginPath();
                    ctx.ellipse(pad.x, pad.y, dw / 2, dh / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'hsla(120, 70%, 48%, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    // 荷葉葉脈
                    ctx.strokeStyle = 'hsla(120, 60%, 42%, 0.2)';
                    ctx.lineWidth = 0.8;
                    for (let i = 0; i < 6; i++) {
                        const angle = (i / 6) * Math.PI * 2;
                        ctx.beginPath();
                        ctx.moveTo(pad.x, pad.y);
                        ctx.lineTo(pad.x + Math.cos(angle) * dw * 0.4, pad.y + Math.sin(angle) * dh * 0.4);
                        ctx.stroke();
                    }
                } else {
                    // 短句：浮木造型（圓角矩形）
                    ctx.fillStyle = isTarget ? 'hsl(32, 72%, 38%)' : 'hsl(25, 50%, 28%)';
                    this.drawRoundedRect(ctx, pad.x - dw / 2, pad.y - dh / 2, dw, dh, 8);
                    ctx.fill();
                    ctx.strokeStyle = 'hsla(30, 60%, 55%, 0.4)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                    // 木紋
                    ctx.strokeStyle = 'hsla(30, 40%, 50%, 0.15)';
                    ctx.lineWidth = 0.8;
                    for (let i = -1; i <= 1; i++) {
                        ctx.beginPath();
                        ctx.moveTo(pad.x - dw * 0.4, pad.y + i * dh * 0.28);
                        ctx.lineTo(pad.x + dw * 0.4, pad.y + i * dh * 0.28);
                        ctx.stroke();
                    }
                }

                // 文字（固定 32px，不依字數縮放）
                ctx.font = 'bold 32px "Noto Serif TC", serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                if (isTarget && s.hint === 'all') {
                    ctx.fillStyle = 'hsl(50, 100%, 78%)';
                } else if (pad.isCorrect) {
                    ctx.fillStyle = 'hsl(55, 85%, 88%)';
                } else {
                    ctx.fillStyle = 'hsl(38, 55%, 78%)';
                }
                ctx.fillText(pad.text, pad.x, pad.y + 1);

                ctx.restore();
            }
        },

        // ── 繪製青蛙 ─────────────────────────────────────────────
        drawFrog: function () {
            const ctx = this.ctx;
            const x = this.frog.x;
            const y = this.frog.y;
            const r = 15;

            const tilt = this.frog.isJumping
                ? Math.sin(this.frog.jumpElapsed / this.frog.jumpDuration * Math.PI) * 0.4
                : 0;

            ctx.save();
            // 落水下沉時套用透明度
            const alpha = (this.frog.fallAlpha !== undefined) ? this.frog.fallAlpha : 1;
            if (alpha < 1) ctx.globalAlpha = alpha;
            ctx.translate(x, y);
            ctx.rotate(tilt);

            // 身體橢圓
            ctx.fillStyle = 'hsl(138, 52%, 30%)';
            ctx.beginPath();
            ctx.ellipse(0, 2, r, r * 0.78, 0, 0, Math.PI * 2);
            ctx.fill();

            // 腹部高光
            ctx.fillStyle = 'hsl(138, 40%, 42%)';
            ctx.beginPath();
            ctx.ellipse(0, 4, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
            ctx.fill();

            // 眼睛（朝上突起）
            const eyeY = -r * 0.45;
            for (const side of [-1, 1]) {
                const ex = side * r * 0.46;
                ctx.fillStyle = 'hsl(75, 70%, 68%)';
                ctx.beginPath(); ctx.arc(ex, eyeY, 5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#111';
                ctx.beginPath(); ctx.arc(ex, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
            }

            ctx.restore();
        },

        // ── 繪製水花特效 ─────────────────────────────────────────
        drawSplashes: function () {
            const ctx = this.ctx;
            for (const sp of this.splashes) {
                const prog = sp.t / sp.duration;
                ctx.save();
                ctx.globalAlpha = (1 - prog) * 0.75;
                ctx.strokeStyle = 'hsl(200, 75%, 72%)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(sp.x, sp.y, sp.r + prog * 22, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        },

        // ── 繪製浮動得分文字 ─────────────────────────────────────
        drawFloatTexts: function () {
            const ctx = this.ctx;
            for (const ft of this.floatTexts) {
                const prog = ft.t / ft.duration;
                ctx.save();
                ctx.globalAlpha = 1 - prog;
                ctx.font = 'bold 18px "Noto Serif TC", serif';
                ctx.fillStyle = 'hsl(50, 100%, 70%)';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(ft.text, ft.x, ft.y - prog * 35);
                ctx.restore();
            }
        },

        // ── 手繪圓角矩形（兼容舊版瀏覽器）───────────────────────
        drawRoundedRect: function (ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        },

        // ── 更新提示欄（逐段顯示，目標段黃底凸顯，可水平捲動）────────────
        // hint='all'   → 全部顯示文字
        // hint='sentence' → 已完成＋當前目標顯示文字，未來用 ？ 佔位
        // hint='none'  → 已完成顯示文字（灰），當前＋未來用 ？ 佔位（永遠不隱藏整條列）
        updateHintBar: function (s) {
            const bar = document.getElementById('game17-hint-bar');
            if (!bar) return;

            // 永遠顯示 hint-bar（hint=none 時仍呈現已完成字）
            bar.style.display = '';
            bar.innerHTML = '';

            if (!this.targetSegments.length) {
                bar.textContent = '全詩已成，躍往對岸！';
                return;
            }

            let prevLine = null;
            for (let i = 0; i < this.targetSegments.length; i++) {
                const seg = this.targetSegments[i];

                // 詩句之間插入分隔（同一詩句的段落不分隔）
                if (prevLine !== null && seg.line !== prevLine) {
                    const sep = document.createElement('span');
                    sep.className = 'game17-hint-sep';
                    sep.textContent = '｜';
                    bar.appendChild(sep);
                }
                prevLine = seg.line;

                const span = document.createElement('span');
                span.className = 'game17-hint-char';

                if (i < this.targetIndex) {
                    // 已完成：永遠顯示實際文字（灰色），即使 hint=none
                    span.dataset.state = 'done';
                    span.textContent = seg.text;
                } else if (i === this.targetIndex) {
                    span.id = 'game17-hint-current';
                    span.dataset.state = 'target';    // 黃底凸顯
                    // hint=none 時目標用 ？ 佔位，不透漏答案
                    span.textContent = (s.hint === 'none')
                        ? '？'.repeat(seg.text.length)
                        : seg.text;
                } else {
                    if (s.hint === 'all') {
                        span.dataset.state = 'future';
                        span.textContent = seg.text;
                    } else {
                        // sentence / none：未來段落用 ？ 佔位
                        span.dataset.state = 'hidden';
                        span.textContent = '？'.repeat(seg.text.length);
                    }
                }
                bar.appendChild(span);
            }

            // 自動水平捲動，讓目標段落置中顯示
            const current = document.getElementById('game17-hint-current');
            if (current) {
                current.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        },

        // ── 更新進度條 ───────────────────────────────────────────
        updateProgress: function () {
            const total = this.targetSegments.length;
            const done = this.targetIndex;
            const fill = document.getElementById('game17-progress-fill');
            const text = document.getElementById('game17-progress-text');
            if (fill) fill.style.width = (total > 0 ? done / total * 100 : 0) + '%';
            if (text) text.textContent = `${done}/${total}`;
        },

        // ── 更新計時條 ───────────────────────────────────────────
        updateTimerBar: function (ratio, mode) {
            const rect = document.getElementById('game17-timer-path');
            const wrapper = document.getElementById('game17-canvas-wrap');
            const svg = document.getElementById('game17-timer-ring');
            if (!rect || !wrapper || !svg) return;

            const w = wrapper.offsetWidth || 500;
            const h = wrapper.offsetHeight || 660;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';

            const rw = w - 6;
            const rh = h - 6;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);

            const perimeter = (rw + rh) * 2;
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
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
            rect.classList.remove('game17-timer-urgent'); // 停用舊閃爍效果
        },

        // scoreManager 透過 updateTimerRing 呼叫，此 alias 轉發給 updateTimerBar
        updateTimerRing: function (ratio, mode) { this.updateTimerBar(ratio, mode); },

        // ── 渲染生命值 ───────────────────────────────────────────
        renderHearts: function () {
            const el = document.getElementById('game17-hearts');
            if (!el) return;
            el.innerHTML = '';
            for (let i = 0; i < this.difficultySettings[this.difficulty].maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = i < this.hearts ? 'heart' : 'heart empty';
                span.textContent = i < this.hearts ? '♥' : '♡';
                el.appendChild(span);
            }
        },

        // ── 震動效果 ─────────────────────────────────────────────
        triggerShake: function () {
            const el = document.getElementById('game17-canvas-wrap');
            if (!el) return;
            el.classList.remove('game17-shake');
            void el.offsetWidth;
            el.classList.add('game17-shake');
            setTimeout(() => el.classList.remove('game17-shake'), 450);
        },

        // ── 新增浮動文字 ─────────────────────────────────────────
        addFloatText: function (text, x, y) {
            this.floatTexts.push({ text, x, y, t: 0, duration: 950 });
        },

        // ── 取得每次正確踩字基礎分 ──────────────────────────────
        getPointA: function () {
            const s = window.ScoreManager && window.ScoreManager.gameSettings['game17'];
            return s ? (s.getPointA || 10) : 10;
        },

        // ── 遊戲結束 ─────────────────────────────────────────────
        gameOver: function (win, reason) {
            if (!this.isActive) return;
            this.isActive = false;
            this.stopLoop();

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 17, difficulty: this.difficulty || '',
                    score: 0, isWin: false, durationS
                });
            }

            const onConfirm = () => {
                if (win && this.isLevelMode) {
                    this.currentLevelIndex++;
                    this.updateUIForMode();
                    this.startNewGame();
                } else if (win) {
                    this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMsg = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore || Math.floor(this.score)) : 0,
                        reason: win ? '' : (reason === 'timeout' ? '時間到！' : '詩心未竟！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm
                    });
                }
            };

            const showAfterAch = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game17', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game17', this.currentLevelIndex, () => showMsg(finalScore));
                        return;
                    }
                }
                showMsg(finalScore);
            };

            if (win) {
                document.getElementById('game17-retryGame-btn').disabled = true;
                document.getElementById('game17-newGame-btn').disabled = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTriple();

                if (window.ScoreManager) {
                    window.ScoreManager.playWinAnimation({
                        game: this,
                        difficulty: this.difficulty,
                        gameKey: 'game17',
                        timerContainerId: 'game17-canvas-wrap',
                        scoreElementId: 'game17-score',
                        heartsSelector: '#game17-hearts .heart:not(.empty)',
                        onComplete: (finalScore) => {
                            this.score = finalScore;
                            showAfterAch(finalScore);
                        }
                    });
                } else {
                    showAfterAch(Math.floor(this.score));
                }
            } else {
                document.getElementById('game17-retryGame-btn').disabled = false;
                document.getElementById('game17-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
                showAfterAch(0);
            }
        }
    };

    window.Game17 = Game17;

    // URL 自動啟動（?game=17）
    document.addEventListener('DOMContentLoaded', () => {
        if (new URLSearchParams(window.location.search).get('game') === '17') {
            setTimeout(() => {
                if (window.Game17) window.Game17.show();
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 50);
        }
    });
})();
