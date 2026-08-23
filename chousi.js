/* ============================================================================
 * chousi.js —《抽絲剝繭》色區推理．舒壓觀想頁
 * ----------------------------------------------------------------------------
 * ⭐ 這是什麼玩法
 *   N×N 的盤面上藏著 N 顆炸彈，規則有三條：
 *     ① 每一橫行恰好一顆炸彈
 *     ② 每一直列恰好一顆炸彈
 *     ③ 盤面被塗成 N 種顏色的色區，每個色區恰好一顆炸彈
 *   另外加上「炸彈不能互相貼著」（任意 3×3 範圍內最多一顆），這條規則同時
 *   讓題目更容易收斂到唯一解，也讓推理多一個好用的著力點。
 *
 *   玩家（在這一頁是「觀看 AI 推理」）要做的事，就是純粹靠色區的形狀去推算
 *   炸彈在哪裡。核心洞見是：**一個色區提供的資訊量幾乎只由它的外接矩形決定**
 *   ——一個只佔一橫行的色區等於直接宣告「這一行的炸彈在我這裡」，資訊量最大；
 *   一個橫跨整個盤面的大色區則幾乎不提供任何資訊。所以出題時刻意讓多數色區
 *   長成扁長條（見 `_genRegions` 的「性格」機制）。
 *
 * ⭐ 這一頁是舒壓頁，不是遊戲
 *   玩家不用動手，看 AI 一步一步把標記打上去就好。畫面上有三種標記：
 *     「確實炸彈」💣 ── 已推理確定的炸彈；會用該色區的顏色，畫出虛線的
 *                       九宮格框、整條直列框、整條橫行框（這三個框正是規則
 *                       ①②③＋不相鄰規則所「宣告」的地盤）
 *     「可疑」？    ── 還沒排除、仍有可能是炸彈的格
 *     「不可能」✕   ── 已被排除的格
 *   每一步都會在下方旁白框說明「這一步用了哪一條推理」，而且標記是一格一格
 *   慢慢打上去的（不是整批瞬間出現），這是這一頁的觀賞重點。
 *
 * ⭐ 難度參數（面板上可即時切換）
 *   - 盤面：5 / 7 / 9（一律正方形）
 *   - 最小區塊：色區的最小格數。設成 1 會出現「只有一格的色區」＝直接把炸彈
 *     位置送給你，最適合小學生；數字越大色區越平均、資訊量越低、越難。
 *   - ⚠️ 最大區塊格數不開放調整，固定為 max(最小格數+2, N×2)。理由：不設上限
 *     會長出佔掉半個盤面的巨獸色區（資訊量趨近零、視覺上也很醜），設太死則
 *     會讓生長演算法頻繁失敗、重試次數暴增，這個相對值是實測後的平衡點。
 *
 * ⭐ 出題流程（`_tryGenerate` 單次嘗試）
 *   1. `_genBombs`   隨機排列 ＋ 不相鄰檢查，得到 N 顆炸彈的位置
 *   2. `_genRegions` 以炸彈為種子做各向異性洪水填充，長出 N 個緊密相連的色區
 *   3. `_repairUnique` 爬山法把「解的個數」壓到 1（⚠️ 關鍵步驟，見該函式註解）
 *   4. `_humanSolve` 用純邏輯規則試解，解不完就丟掉重來；解得完就順便得到
 *      播放用的推理步驟
 *   ⚠️ 出題可能要花上一兩秒（N=9 時），所以整個流程是切成小塊、用 setTimeout
 *      分批跑的（`_genTick`），避免把畫面凍住。
 *
 * 依《.agent/skills/花月開發常見錯誤與解法.md §4》：
 *   - 全域 class 前綴 chousi-
 *   - loadCSS() 動態防護
 *   - overlay 掛載 document.body 且套用 registerOverlayResize
 *   - stopGame() 必須隱藏 container 並停掉 requestAnimationFrame
 * ========================================================================== */

(function () {
    'use strict';

    // =====================================================================
    // 可調參數
    // =====================================================================
    const STAGE_W = 500, STAGE_H = 850;   // 舞台（overlay）的邏輯尺寸，與其他頁面一致，供 registerOverlayResize 縮放
    const BOARD_PX = 460;                 // 棋盤畫布的邊長（正方形）

    const GRID_PRESETS = [5, 7, 9];       // 盤面寬度格數選項（一律正方形）
    const DEFAULT_GRID = 7;               // 預設盤面
    const DEFAULT_MIN_CELLS = 2;          // 預設的最小色區格數

    /** 最小區塊格數的可選上限。夾在 min(6, N)：N 個色區、每區至少 minCells 格，
     *  總格數 N×N 才夠分，所以上限不能超過 N；6 是另一條硬上限。
     *  ⚠️ 舊版把上限鎖在 4，理由是實測 N=9 選到 5 時出題成功率只剩約六成、
     *    單題要一秒以上——放寬到 5、6 之後同樣的變慢／偶爾失敗風險還在，
     *    只是目前沒有重新驗證，需要留意。 */
    const minCellsMax = (N) => Math.min(6, N);

    /** 色區最大格數 = max(最小格數+2, N×2)。理由見檔頭說明。 */
    const maxCellsOf = (N, minCells) => Math.max(minCells + 2, N * 2);

    const SPEED_PRESETS = {
        // stepMs：每講完一句推理旁白後，停多久才開始打標記（讓觀眾讀完）
        // markMs：連續打標記時，每一格之間間隔多久
        slow: { label: '慢', stepMs: 3000, markMs: 400 },
        normal: { label: '正常', stepMs: 1500, markMs: 200 },
        fast: { label: '快', stepMs: 500, markMs: 50 },
    };
    const DEFAULT_SPEED = 'normal';

    const SAY_MS = 240;                   // 旁白本身出現前的極短停頓
    const AUTO_NEXT_MS = 5000;            // 全部推完後，隔多久自動換下一題
    const FLASH_MS = 420;                 // 每個標記剛打上去時的擴散圓環持續時間

    const GEN_SLICE_MS = 60;              // 出題時每個 setTimeout 分片最多跑多久（毫秒），超過就讓出主執行緒
    const GEN_MAX_ATTEMPTS = 400;         // 出題的總嘗試次數上限，超過就放寬條件（把最小格數降 1）重來
    const REPAIR_BUDGET = 1200;           // 唯一解爬山法的最大嘗試轉讓次數
    const REPAIR_CAP = 40;                // 數解時的上限（能量函數只需要梯度，不必真的數完）

    /** 儲存格狀態。⚠️ UNKNOWN 與 MAYBE 是**兩件不同的事**，不可以合併：
     *    UNKNOWN「尚未判斷」── 還沒有任何推理碰過這一格，畫「？」。這只是格子的
     *              底圖，開局時整個盤面都是這個狀態，不代表任何結論。
     *    MAYBE  「可能有炸彈」── 已經有某一條推理指出「炸彈就在這幾格之中」，
     *              畫半透明炸彈。這是一個**推理成果**，跟開局的「？」意義完全不同。
     *  （曾經一度把 UNKNOWN 直接畫成半透明炸彈，等於宣稱開局就知道每一格都可能
     *    有炸彈——那是廢話，而且把真正有價值的「判斷出來的可能」給淹沒了。） */
    const UNKNOWN = 0, EXCLUDED = 1, BOMB = 2, MAYBE = 3;

    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const shuffle = (a) => {
        for (let i = a.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };

    // =====================================================================
    // 主模組
    // =====================================================================
    const ChouSi = {
        container: null,      // 外層 overlay 的 DOM 節點（div#chousi-container）
        canvas: null,         // 棋盤畫布
        ctx: null,            // 棋盤畫布的 2D context
        frameEl: null,        // 木框裝飾層（全部推完時加上金光呼吸動畫）
        narrEl: null,         // 推理旁白文字節點
        ruleEl: null,         // 推理旁白左側的「規則 N」徽章節點

        // ── 設定 ──
        speedKey: DEFAULT_SPEED,     // 目前的播放速度檔位
        gridN: DEFAULT_GRID,         // 目前的盤面寬度格數 N
        minCells: DEFAULT_MIN_CELLS, // 目前的最小色區格數

        // ── 本輪題目 ──
        puzzle: null,         // { N, bombs, owner, steps, maxRule }
        cell: 0,              // 每一格的像素邊長（= BOARD_PX / N）
        state: null,          // Int8Array，每格的標記狀態（UNKNOWN / EXCLUDED / BOMB）
        hues: null,           // hues[g] = 第 g 個色區的色相（度）

        // ── 播放狀態 ──
        queue: [],            // 待播放的微動作佇列（say / mark）
        qi: 0,                // 佇列目前播到第幾個
        nextAt: 0,            // 下一個微動作預定執行的時間戳
        focus: [],            // 目前這一步「正在推理的格子」，畫面上會發光提示
        flashes: [],          // 剛打上去的標記的擴散圓環 {cell, t0}
        bombOrder: [],        // 已確定的炸彈格（依確定順序）
        claimBomb: -1,        // 「這一步」剛確定的那顆炸彈，用來畫紅色半透明的吃掉範圍；下一步開始時歸 -1
        freshKills: new Set(),// 這一步剛排除掉的格（畫紅色 ✕），下一步開始時清空轉黑
        foundCount: 0,        // 已確定的炸彈數
        stepDone: 0,          // 已播完的推理步數
        stepTotal: 0,         // 本題的推理總步數
        finished: false,      // 本題是否已推完
        finishedAt: 0,        // 推完的時間戳（用來算何時自動換題）
        paused: false,        // 是否暫停（讓玩家把旁白讀完再繼續）
        lastTickAt: 0,        // 上一幀的時間戳，暫停時用來把所有到期時間往後推

        // ── 出題狀態 ──
        generating: false,    // 是否正在出題
        genToken: 0,          // 出題流水號：切換設定時遞增，讓舊的出題分片自動作廢
        genAttempts: 0,       // 本次出題已嘗試次數

        active: false,        // 頁面是否正在顯示
        rafId: null,          // requestAnimationFrame id

        // =================================================================
        // DOM
        // =================================================================
        loadCSS: function () {
            if (!document.getElementById('chousi-css')) {
                const link = document.createElement('link');
                link.id = 'chousi-css';
                link.rel = 'stylesheet';
                link.href = 'chousi.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            const isFirst = !document.getElementById('chousi-container');
            if (isFirst) this.createDOM();
            this.container = document.getElementById('chousi-container');
            this.canvas = document.getElementById('chousi-canvas');
            this.frameEl = document.getElementById('chousi-canvas-frame');
            this.narrEl = document.getElementById('chousi-narration-text');
            this.ruleEl = document.getElementById('chousi-narration-rule');
            this.ctx = this.canvas.getContext('2d');
            if (isFirst) { this.bindEvents(); this._paintLegend(); }
        },

        /** 圖例的三個符號直接用畫棋盤的同一組函式畫在小 canvas 上。
         *  ⚠️ 不用 emoji（💣✕）：emoji 在各平台長得都不一樣，跟棋盤上實際畫出來的
         *    圖案對不起來，圖例反而會誤導。 */
        _paintLegend: function () {
            const paint = (id, fn) => {
                const cv = document.getElementById(id);
                if (!cv) return;
                const c = cv.getContext('2d');
                c.clearRect(0, 0, 26, 26);
                fn(c);
            };
            // 炸彈的引信會往上超出球體，所以中心點壓低一點，留出引信的空間
            paint('chousi-legend-unknown', c => this._drawUnknown(c, 13, 14, 26));
            paint('chousi-legend-maybe', c => this._drawMaybe(c, 13, 16, 24, 0.34));
            paint('chousi-legend-sure', c => this._drawBomb(c, 13, 16, 24, 1));
            paint('chousi-legend-fresh', c => this._drawCross(c, 13, 14, 26, true));
            paint('chousi-legend-no', c => this._drawCross(c, 13, 14, 26, false));
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'chousi-container';
            div.className = 'chousi-overlay hidden';
            div.innerHTML = `
                <div class="chousi-header">
                    <div class="chousi-title">抽絲剝繭</div>
                    <div class="chousi-subtitle">每行每列每色區各藏一顆炸彈，且炸彈不相鄰</div>
                </div>
                <div id="chousi-close" class="chousi-close" aria-label="關閉">✕</div>

                <div id="chousi-canvas-frame" class="chousi-canvas-frame">
                    <canvas id="chousi-canvas" width="${BOARD_PX}" height="${BOARD_PX}"></canvas>
                </div>

                <div class="chousi-legend">
                    <span class="chousi-legend-item"><canvas class="chousi-legend-icon" id="chousi-legend-unknown" width="26" height="26"></canvas>尚未判斷</span>
                    <span class="chousi-legend-item"><canvas class="chousi-legend-icon" id="chousi-legend-maybe" width="26" height="26"></canvas>可能有炸彈</span>
                    <span class="chousi-legend-item"><canvas class="chousi-legend-icon" id="chousi-legend-sure" width="26" height="26"></canvas>確實有炸彈</span>
                    <span class="chousi-legend-item"><canvas class="chousi-legend-icon" id="chousi-legend-fresh" width="26" height="26"></canvas>本步剛排除</span>
                    <span class="chousi-legend-item"><canvas class="chousi-legend-icon" id="chousi-legend-no" width="26" height="26"></canvas>不可能</span>
                </div>

                <div class="chousi-narration">
                    <div id="chousi-narration-rule" class="chousi-narration-rule">—</div>
                    <div id="chousi-narration-text" class="chousi-narration-text">準備出題…</div>
                </div>

                <div class="chousi-panel">
                    <div class="chousi-progress-wrap">
                        <div id="chousi-progress-bar" class="chousi-progress-bar"></div>
                        <div id="chousi-progress-text" class="chousi-progress-text"></div>
                    </div>
                    <div class="chousi-row">
                        <span class="chousi-row-label">盤面</span>
                        <div id="chousi-grid-group" class="chousi-btn-group"></div>
                        <span class="chousi-row-label">速度</span>
                        <div id="chousi-speed-group" class="chousi-btn-group"></div>
                    </div>
                    <div class="chousi-row">
                        <span class="chousi-row-label">最小區塊</span>
                        <div id="chousi-min-group" class="chousi-btn-group"></div>
                        <button id="chousi-pause" class="chousi-action-btn">暫停</button>
                        <button id="chousi-again" class="chousi-action-btn">換一題</button>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = STAGE_W + 'px';
                    div.style.height = STAGE_H + 'px';
                    div.style.transform = `scale(${r.scale})`;
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        bindEvents: function () {
            document.getElementById('chousi-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('chousi-again').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playConfirmItem(); }
                this.newRound();
            });
            document.getElementById('chousi-pause').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                this.paused = !this.paused;
                this._syncPauseBtn();
                this._updateProgress();
            });

            const gridGroup = document.getElementById('chousi-grid-group');
            GRID_PRESETS.forEach(n => {
                const btn = document.createElement('button');
                btn.className = 'chousi-chip chousi-chip-narrow';
                btn.dataset.grid = n;
                btn.textContent = `${n}×${n}`;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.gridN = n;
                    // 盤面變小時，最小區塊要跟著夾回合法範圍
                    this.minCells = clamp(this.minCells, 1, minCellsMax(n));
                    this._buildMinChips();
                    this._syncChips();
                    this.newRound();
                });
                gridGroup.appendChild(btn);
            });

            const speedGroup = document.getElementById('chousi-speed-group');
            Object.keys(SPEED_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'chousi-chip chousi-chip-narrow';
                btn.dataset.speed = k;
                btn.textContent = SPEED_PRESETS[k].label;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.speedKey = k;
                    this._syncChips();
                });
                speedGroup.appendChild(btn);
            });

            this._buildMinChips();
            this._syncChips();
        },

        /** 「最小區塊」的選項數量會隨盤面大小改變，所以每次換盤面都要重建 */
        _buildMinChips: function () {
            const group = document.getElementById('chousi-min-group');
            group.innerHTML = '';
            const top = minCellsMax(this.gridN);
            for (let m = 1; m <= top; m++) {
                const btn = document.createElement('button');
                btn.className = 'chousi-chip chousi-chip-mini';
                btn.dataset.min = m;
                btn.textContent = m;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.minCells = m;
                    this._syncChips();
                    this.newRound();
                });
                group.appendChild(btn);
            }
        },

        _syncPauseBtn: function () {
            const b = document.getElementById('chousi-pause');
            if (!b) return;
            b.textContent = this.paused ? '繼續' : '暫停';
            b.classList.toggle('chousi-action-btn-on', this.paused);
        },

        _syncChips: function () {
            document.querySelectorAll('#chousi-grid-group .chousi-chip').forEach(b => {
                b.classList.toggle('active', Number(b.dataset.grid) === this.gridN);
            });
            document.querySelectorAll('#chousi-min-group .chousi-chip').forEach(b => {
                b.classList.toggle('active', Number(b.dataset.min) === this.minCells);
            });
            document.querySelectorAll('#chousi-speed-group .chousi-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.speed === this.speedKey);
            });
        },

        // =================================================================
        // 出題：① 炸彈擺放
        // =================================================================
        /**
         * 每行每列恰好一顆炸彈 ⇒ 擺法就是一個排列 `p[row] = col`。
         * 再加上「任意 3×3 內最多一顆」：因為每行本來就只有一顆，只有相鄰的
         * 兩行會互相干擾，所以條件簡化成 |p[i+1] − p[i]| ≥ 2。
         * ⚠️ 這條規則會讓合法排列數大幅減少（約只剩 13%）：N=9 還有四萬多種，
         *   但 N=5 只剩 14 種。5×5 玩久了會覺得炸彈位置似曾相識是正常的，
         *   新鮮感主要來自色區的變化而不是炸彈位置。
         */
        _genBombs: function (N) {
            for (let t = 0; t < 20000; t++) {
                const p = shuffle(Array.from({ length: N }, (_, i) => i));
                let ok = true;
                for (let i = 0; i + 1 < N; i++) {
                    if (Math.abs(p[i + 1] - p[i]) < 2) { ok = false; break; }
                }
                if (ok) return p;
            }
            return null;
        },

        // =================================================================
        // 出題：② 色區生成（以炸彈為種子的各向異性洪水填充）
        // =================================================================
        /**
         * 回傳 owner（Int32Array，owner[i] = 第 i 格屬於哪個色區），失敗回傳 null。
         *
         * 三個設計重點：
         *   1. 種子 = 炸彈本身 ⇒「每個色區恰好一顆炸彈」自動成立，不必事後檢查。
         *   2. 「性格」機制：每個色區被指定為 h（扁長）／v（直長）／b（團塊）。
         *      扁長區會優先吃「不會讓 row-span 超過 SPAN_CAP」的格子，長出來的
         *      區域外接矩形很扁 ⇒ 資訊量大 ⇒ 容易收斂到唯一解。刻意只留一個團塊
         *      區，當作「最後靠排除法收尾」的角色。
         *   3. 兩階段挑選：只要還有色區沒吃到 minCells 就絕對優先餵它。
         *      ⚠️ 這一段是實測踩過的坑——原本只用「離目標最遠者優先」，結果
         *      minCells 這個參數形同虛設，經常長出 1 格的色區。
         */
        _genRegions: function (N, bombs, minCells, maxCells) {
            const total = N * N;

            // 2a. 先抽每個色區的目標格數：全部從平均值 N 出發，再隨機互相搬移，
            //     總和恆等於 N×N，且每個都留在 [minCells, maxCells] 內。
            const target = new Array(N).fill(N);
            for (let k = 0; k < N * 12; k++) {
                const a = (Math.random() * N) | 0, b = (Math.random() * N) | 0;
                if (a === b) continue;
                const mv = 1 + ((Math.random() * Math.max(1, Math.floor(N / 2))) | 0);
                if (target[a] - mv >= minCells && target[b] + mv <= maxCells) {
                    target[a] -= mv; target[b] += mv;
                }
            }

            // 2b. 指定性格：只留一個團塊區，其餘一半扁長、一半直長
            const persona = [];
            for (let g = 0; g < N; g++) persona.push(g === 0 ? 'b' : (g % 2 ? 'h' : 'v'));
            shuffle(persona);
            const SPAN_CAP = 2;   // h/v 區的 row-span / col-span 硬上限（真的長不出來時才放寬）

            const owner = new Int32Array(total).fill(-1);
            const size = new Array(N).fill(1);
            const bbox = [];      // 每個色區目前的外接矩形，用來判斷「這一格會不會撐大 span」
            for (let g = 0; g < N; g++) {
                const r = g, c = bombs[g];
                owner[r * N + c] = g;
                bbox.push({ r0: r, r1: r, c0: c, c1: c });
            }
            let assigned = N;

            // 第 g 區目前可以往外吃的所有空格
            const frontierOf = (g) => {
                const out = [];
                for (let i = 0; i < total; i++) {
                    if (owner[i] !== g) continue;
                    const r = (i / N) | 0, c = i % N;
                    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                    for (let k = 0; k < 4; k++) {
                        const nr = nb[k][0], nc = nb[k][1];
                        if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
                        const j = nr * N + nc;
                        if (owner[j] === -1 && out.indexOf(j) < 0) out.push(j);
                    }
                }
                return out;
            };

            while (assigned < total) {
                // 階段一：還沒吃到 minCells 的色區絕對優先；階段二：缺目標格數最多的優先
                const starving = [];
                for (let g = 0; g < N; g++) if (size[g] < minCells) starving.push(g);
                const pool0 = starving.length ? starving : Array.from({ length: N }, (_, g) => g);

                let best = -1, bestDef = -Infinity, bestFr = null;
                for (const g of pool0) {
                    const fr = frontierOf(g);
                    if (!fr.length) continue;
                    const def = target[g] - size[g];
                    if (def > bestDef) { bestDef = def; best = g; bestFr = fr; }
                }
                // 還沒吃飽的區卻已經無路可走 → 這張圖救不回來，直接放棄重生成
                if (best < 0 && starving.length) return null;
                if (best < 0) {
                    for (let g = 0; g < N; g++) {
                        const fr = frontierOf(g);
                        if (fr.length) { best = g; bestFr = fr; break; }
                    }
                }
                if (best < 0) break;   // 理論上不會發生（格子是連通的）

                // 各向異性：優先吃不會讓 span 超標的格子；真的沒得挑才放寬
                const bb = bbox[best], pe = persona[best];
                let pool = bestFr;
                if (pe !== 'b') {
                    const keep = bestFr.filter(j => {
                        const r = (j / N) | 0, c = j % N;
                        const span = pe === 'h'
                            ? Math.max(bb.r1, r) - Math.min(bb.r0, r) + 1
                            : Math.max(bb.c1, c) - Math.min(bb.c0, c) + 1;
                        return span <= SPAN_CAP;
                    });
                    if (keep.length) pool = keep;
                }
                const pick = pool[(Math.random() * pool.length) | 0];
                owner[pick] = best; size[best]++; assigned++;
                const pr = (pick / N) | 0, pc = pick % N;
                bb.r0 = Math.min(bb.r0, pr); bb.r1 = Math.max(bb.r1, pr);
                bb.c0 = Math.min(bb.c0, pc); bb.c1 = Math.max(bb.c1, pc);
            }
            return assigned === total ? owner : null;
        },

        // =================================================================
        // 出題：③ 機器求解器（數解）
        // =================================================================
        /** 逐行 DFS 挑一個 column，同時檢查該欄／該色區是否已被佔用、與上一行是否
         *  相鄰。數到 limit 就提早收工（我們只需要知道「是不是恰好 1 個解」，
         *  以及一個粗略的解數當爬山法的能量值）。 */
        _countSolutions: function (N, owner, limit) {
            let n = 0;
            const usedCol = new Array(N).fill(false);
            const usedReg = new Array(N).fill(false);
            const dfs = (r, prev) => {
                if (n >= limit) return;
                if (r === N) { n++; return; }
                for (let c = 0; c < N; c++) {
                    if (usedCol[c]) continue;
                    if (prev >= 0 && Math.abs(c - prev) < 2) continue;   // 不相鄰規則
                    const g = owner[r * N + c];
                    if (usedReg[g]) continue;
                    usedCol[c] = usedReg[g] = true;
                    dfs(r + 1, c);
                    usedCol[c] = usedReg[g] = false;
                    if (n >= limit) return;
                }
            };
            dfs(0, -1);
            return n;
        },

        // =================================================================
        // 出題：④ 唯一解修補（爬山法）—— ⚠️ 整個出題流程最關鍵的一步
        // =================================================================
        /**
         * 為什麼一定要有這一步？
         *   唯一性完全取決於色區的形狀，隨機長出來的色區幾乎不可能剛好長對。
         *   實測 N=9 用「生成 → 不唯一就整個丟掉重來」的做法，連續 3000 次
         *   全部失敗，一個唯一解都撞不到。
         *
         * 做法：把「解的個數」當能量，反覆把某個邊界格從 A 區轉讓給相鄰的 B 區，
         *   只接受讓解數不變或變少的轉讓，就能穩定收斂到唯一解。實測改用這個
         *   方法後 N=9 的成功率變成接近 100%、單題半秒內完成。
         *
         * 轉讓的三個前置條件：
         *   ① 不能搬炸彈所在的格（否則該色區會失去它唯一的炸彈）
         *   ② 搬走之後原色區必須仍然連通（規則要求色區必須緊密相連）
         *   ③ 兩區的格數都必須留在 [minCells, maxCells] 內
         *
         * 回傳最終的解數（== 1 才算成功）。
         */
        _repairUnique: function (N, owner, bombs, minCells, maxCells) {
            const total = N * N;
            const isBombCell = new Array(total).fill(false);
            bombs.forEach((c, r) => { isBombCell[r * N + c] = true; });

            const sizeOf = () => {
                const s = new Array(N).fill(0);
                for (let i = 0; i < total; i++) s[owner[i]]++;
                return s;
            };
            // 第 g 區是否仍然是一塊完整相連的區域（洪水填充比對格數）
            const connected = (g) => {
                const cells = [];
                for (let i = 0; i < total; i++) if (owner[i] === g) cells.push(i);
                if (!cells.length) return false;
                const seen = new Set([cells[0]]);
                const st = [cells[0]];
                while (st.length) {
                    const i = st.pop(), r = (i / N) | 0, c = i % N;
                    const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                    for (let k = 0; k < 4; k++) {
                        const nr = nb[k][0], nc = nb[k][1];
                        if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
                        const j = nr * N + nc;
                        if (owner[j] === g && !seen.has(j)) { seen.add(j); st.push(j); }
                    }
                }
                return seen.size === cells.length;
            };

            let energy = this._countSolutions(N, owner, REPAIR_CAP);
            for (let step = 0; step < REPAIR_BUDGET && energy > 1; step++) {
                const x = (Math.random() * total) | 0;
                if (isBombCell[x]) continue;
                const r = (x / N) | 0, c = x % N, from = owner[x];
                // 找出這一格周圍有哪些「別的色區」可以接手
                const nbs = [];
                const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
                for (let k = 0; k < 4; k++) {
                    const nr = nb[k][0], nc = nb[k][1];
                    if (nr < 0 || nc < 0 || nr >= N || nc >= N) continue;
                    const g = owner[nr * N + nc];
                    if (g !== from && nbs.indexOf(g) < 0) nbs.push(g);
                }
                if (!nbs.length) continue;
                const to = nbs[(Math.random() * nbs.length) | 0];

                const sz = sizeOf();
                if (sz[from] - 1 < minCells || sz[to] + 1 > maxCells) continue;
                owner[x] = to;
                if (!connected(from)) { owner[x] = from; continue; }
                const e2 = this._countSolutions(N, owner, REPAIR_CAP);
                if (e2 <= energy) energy = e2; else owner[x] = from;
            }
            return energy;
        },

        // =================================================================
        // 出題：⑤ 人類邏輯求解器（同時產生播放用的推理步驟）
        // =================================================================
        /**
         * 「有唯一解」跟「能靠邏輯推出來」是兩回事——有些唯一解的盤面得靠試誤
         * 才解得開，那種題目放在舒壓頁上完全沒有觀賞價值（旁白會講不出理由）。
         * 所以出題最後一關是：用下面四條**純邏輯、完全不猜**的規則試解，解不完
         * 就丟掉重來。
         *
         *   規則1 唯一候選：某橫行／直列／色區的候選格只剩一格 → 那格就是炸彈。
         *                   （確定炸彈後，同行、同列、同色區與周圍八格全部排除）
         *   規則3 單位包含：某色區的候選格全落在同一橫行內 → 該橫行的炸彈必定
         *                   屬於這個色區 → 該橫行其他格全部排除。（行↔區、列↔區
         *                   雙向都檢查）
         *   規則4 鄰行封鎖：不相鄰規則的延伸。某橫行的候選欄位擠成一團時，取這些
         *                   欄位各自「左中右三格」的交集，這些欄位不管炸彈最後落在
         *                   哪一格都會被波及 → 上下相鄰行的這些格可以直接排除。
         *   規則5 廣義隱組：k 個色區的候選格恰好只佔用 k 個橫行 → 這 k 個橫行的
         *                   炸彈全被這些色區用光 → 這些橫行的其他格全部排除。
         *                   （即數獨的 hidden set，行/列/區四種組合都檢查）
         *
         * 規則編號同時就是難度分級：只用到規則 1 的題目最簡單，用到規則 5 的最難。
         * ⚠️ 沒有規則 2 是刻意的——「確定炸彈後的排除」在實作上併進規則 1 的
         *   `placeBomb` 裡了，但編號保留給它，方便旁白說明時對得上概念。
         *
         * 回傳 { solved, steps, maxRule }。steps 就是播放用的腳本。
         */
        _humanSolve: function (N, owner) {
            const total = N * N;
            const cand = new Array(total).fill(true);    // 還可能是炸彈
            const bomb = new Array(total).fill(false);   // 已確定是炸彈
            const steps = [];
            let maxRule = 0, placed = 0;

            const units = [];
            for (let r = 0; r < N; r++) {
                units.push({ kind: 'row', idx: r, cells: Array.from({ length: N }, (_, c) => r * N + c) });
            }
            for (let c = 0; c < N; c++) {
                units.push({ kind: 'col', idx: c, cells: Array.from({ length: N }, (_, r) => r * N + c) });
            }
            for (let g = 0; g < N; g++) {
                const o = [];
                for (let i = 0; i < total; i++) if (owner[i] === g) o.push(i);
                units.push({ kind: 'reg', idx: g, cells: o });
            }
            const rowUnits = units.filter(u => u.kind === 'row');
            const colUnits = units.filter(u => u.kind === 'col');
            const regUnits = units.filter(u => u.kind === 'reg');
            const kindName = { row: '橫行', col: '直列', reg: '色區' };
            const unitHasBomb = u => u.cells.some(i => bomb[i]);
            const candOf = u => u.cells.filter(i => cand[i] && !bomb[i]);
            // ⚠️ 「第 3 色區」對玩家來說毫無意義——盤面上沒有編號，只有顏色。
            //   附上顏色名稱（用跟繪圖時同一套色相公式反查），旁白才能跟玩家眼睛
            //   看到的東西對上。
            const nameOf = u => (u.kind === 'reg'
                ? `第 ${u.idx + 1} 色區（${this._hueName(this._hueOf(N, u.idx))}）`
                : `第 ${u.idx + 1} ${kindName[u.kind]}`);

            /** 放下一顆炸彈，並把它「宣告的地盤」（同行／同列／同色區／周圍八格）全部排除 */
            const placeBomb = (i, rule, desc) => {
                bomb[i] = true; cand[i] = false; placed++;
                const r = (i / N) | 0, c = i % N, g = owner[i];
                const kill = [];
                for (let j = 0; j < total; j++) {
                    if (!cand[j] || bomb[j]) continue;
                    const jr = (j / N) | 0, jc = j % N;
                    const near = Math.abs(jr - r) <= 1 && Math.abs(jc - c) <= 1;   // 不相鄰規則
                    if (jr === r || jc === c || owner[j] === g || near) { cand[j] = false; kill.push(j); }
                }
                maxRule = Math.max(maxRule, rule);
                steps.push({ rule, desc, bomb: i, kill, focus: [] });
            };
            /** 排除一批格子；若這批格子其實早就被排除過就回傳 false（代表這條規則這次沒進展） */
            const elim = (list, rule, desc, focus) => {
                const real = list.filter(i => cand[i] && !bomb[i]);
                if (!real.length) return false;
                real.forEach(i => { cand[i] = false; });
                maxRule = Math.max(maxRule, rule);
                steps.push({ rule, desc, bomb: -1, kill: real, focus: focus || [] });
                return true;
            };

            // 規則1：某單位只剩一個候選 → 那就是炸彈
            const rule1 = () => {
                for (const u of units) {
                    if (unitHasBomb(u)) continue;
                    const cs = candOf(u);
                    if (cs.length === 1) {
                        placeBomb(cs[0], 1, `${nameOf(u)}只剩下一格還有可能，炸彈就在這裡`);
                        return true;
                    }
                }
                return false;
            };

            // 規則3：某單位的候選全落在另一個單位裡 → 另一個單位的其他格排除
            const rule3 = () => {
                const pairs = [[regUnits, rowUnits], [regUnits, colUnits], [rowUnits, regUnits], [colUnits, regUnits]];
                for (const [A, B] of pairs) {
                    for (const ua of A) {
                        if (unitHasBomb(ua)) continue;
                        const cs = candOf(ua);
                        if (!cs.length) continue;
                        for (const ub of B) {
                            if (!cs.every(i => ub.cells.indexOf(i) >= 0)) continue;
                            const out = ub.cells.filter(i => ua.cells.indexOf(i) < 0);
                            // ⚠️ 措辭要對四種配對（行↔區、列↔區）都成立，所以用「兩者的炸彈
                            //   必定是同一顆」這種中性說法，不能寫死成「屬於這個色區」。
                            if (elim(out, 3, `${nameOf(ua)}的候選格全都落在${nameOf(ub)}裡，代表兩者的炸彈必定是同一顆，${nameOf(ub)}的其餘格子排除`, cs)) return true;
                        }
                    }
                }
                return false;
            };

            // 規則4：鄰行／鄰列封鎖（不相鄰規則的延伸）
            const rule4 = () => {
                // 取候選位置各自「前中後三格」的交集：不論炸彈落在哪一個候選格，
                // 交集裡的位置都一定會被 3×3 的禁區蓋到，所以相鄰行／列可以直接排除。
                const shrink = (positions) => {
                    let T = null;
                    for (const s of positions) {
                        const set = new Set([s - 1, s, s + 1]);
                        T = T === null ? set : new Set([...T].filter(x => set.has(x)));
                    }
                    return T || new Set();
                };
                for (const u of rowUnits) {
                    if (unitHasBomb(u)) continue;
                    const cs = candOf(u);
                    if (!cs.length) continue;
                    const T = shrink(cs.map(i => i % N));
                    if (!T.size) continue;
                    const kill = [];
                    for (const dr of [-1, 1]) {
                        const nr = u.idx + dr;
                        if (nr < 0 || nr >= N) continue;
                        for (const c of T) if (c >= 0 && c < N) kill.push(nr * N + c);
                    }
                    if (elim(kill, 4, `${nameOf(u)}的候選格擠在一起，不論炸彈落在哪一格，上下相鄰行的這幾格都會被 3×3 禁區蓋到，排除`, cs)) return true;
                }
                for (const u of colUnits) {
                    if (unitHasBomb(u)) continue;
                    const cs = candOf(u);
                    if (!cs.length) continue;
                    const T = shrink(cs.map(i => (i / N) | 0));
                    if (!T.size) continue;
                    const kill = [];
                    for (const dc of [-1, 1]) {
                        const nc = u.idx + dc;
                        if (nc < 0 || nc >= N) continue;
                        for (const r of T) if (r >= 0 && r < N) kill.push(r * N + nc);
                    }
                    if (elim(kill, 4, `${nameOf(u)}的候選格擠在一起，不論炸彈落在哪一格，左右相鄰列的這幾格都會被 3×3 禁區蓋到，排除`, cs)) return true;
                }
                return false;
            };

            // 規則5：k 個單位的候選恰好只覆蓋 k 個對應單位 → 對應單位的其他格排除
            const rule5 = () => {
                const combos = [[regUnits, rowUnits], [regUnits, colUnits], [rowUnits, regUnits], [colUnits, regUnits]];
                for (const [A, B] of combos) {
                    const openA = A.filter(u => !unitHasBomb(u) && candOf(u).length);
                    const topK = Math.min(4, openA.length - 1);
                    for (let k = 2; k <= topK; k++) {
                        const subs = [];
                        const rec = (start, cur) => {
                            if (cur.length === k) { subs.push(cur.slice()); return; }
                            for (let i = start; i < openA.length; i++) { cur.push(openA[i]); rec(i + 1, cur); cur.pop(); }
                        };
                        rec(0, []);
                        for (const S of subs) {
                            const cells = new Set();
                            S.forEach(u => candOf(u).forEach(i => cells.add(i)));
                            const cover = B.filter(ub => ub.cells.some(i => cells.has(i)));
                            if (cover.length !== k) continue;   // 只有「恰好 k 個」才成立
                            const own = new Set();
                            S.forEach(u => u.cells.forEach(i => own.add(i)));
                            const kill = [];
                            cover.forEach(ub => ub.cells.forEach(i => { if (!own.has(i)) kill.push(i); }));
                            const names = S.map(u => nameOf(u)).join('、');
                            const covNames = cover.map(u => nameOf(u)).join('、');
                            if (elim(kill, 5, `${names} 這 ${k} 個單位的候選格，恰好只佔用 ${covNames}，這 ${k} 個單位的炸彈已被瓜分完畢，其餘格子排除`, [...cells])) return true;
                        }
                    }
                }
                return false;
            };

            const rules = [rule1, rule3, rule4, rule5];
            for (let guard = 0; guard < 4000 && placed < N; guard++) {
                let moved = false;
                for (const f of rules) if (f()) { moved = true; break; }
                if (!moved) break;
            }
            return { solved: placed === N, steps, maxRule };
        },

        // =================================================================
        // 出題：單次嘗試（成功回傳題目物件，失敗回傳 null）
        // =================================================================
        _tryGenerate: function (N, minCells) {
            const maxCells = maxCellsOf(N, minCells);
            const bombs = this._genBombs(N);
            if (!bombs) return null;
            const owner = this._genRegions(N, bombs, minCells, maxCells);
            if (!owner) return null;
            if (this._repairUnique(N, owner, bombs, minCells, maxCells) !== 1) return null;
            const hs = this._humanSolve(N, owner);
            if (!hs.solved) return null;
            return { N, bombs, owner, steps: hs.steps, maxRule: hs.maxRule };
        },

        // =================================================================
        // 開新的一題
        // =================================================================
        newRound: function () {
            const N = this.gridN;
            this.genToken++;                 // 讓還在跑的舊出題分片自動作廢
            this.generating = true;
            this.genAttempts = 0;
            this.puzzle = null;
            this.finished = false;
            this.queue = []; this.qi = 0;
            this.focus = []; this.flashes = []; this.bombOrder = []; this.freshKills = new Set();
            this.claimBomb = -1;
            this.foundCount = 0; this.stepDone = 0; this.stepTotal = 0;
            // 換題時自動恢復播放：玩家按了「換一題」卻拿到一個凍住的新盤面會很困惑
            this.paused = false;
            this.lastTickAt = 0;
            this._syncPauseBtn();
            this.cell = BOARD_PX / N;
            this.state = new Int8Array(N * N).fill(UNKNOWN);
            this.hues = null;
            if (this.frameEl) this.frameEl.classList.remove('chousi-all-done');
            this._say('—', '推演出題中，正在尋找「只有唯一解、而且純靠邏輯推得出來」的盤面…');
            this._updateProgress();
            this._genTick(this.genToken, this.minCells);
            this._startLoop();
        },

        /** 出題分片：每次最多跑 GEN_SLICE_MS 毫秒就讓出主執行緒，避免畫面凍住 */
        _genTick: function (token, minCells) {
            if (token !== this.genToken || !this.active) return;
            const t0 = performance.now();
            while (performance.now() - t0 < GEN_SLICE_MS) {
                this.genAttempts++;
                const p = this._tryGenerate(this.gridN, minCells);
                if (p) { this._onPuzzleReady(p); return; }
                if (this.genAttempts >= GEN_MAX_ATTEMPTS) {
                    // 極端保險：這個難度組合太難撞到，把最小區塊降一級再試
                    // （實測不會走到這裡，但寧可降難度也不要讓畫面永遠空白）
                    const relaxed = Math.max(1, minCells - 1);
                    console.warn('[抽絲剝繭] 出題超過上限，將最小區塊放寬為', relaxed);
                    this.genAttempts = 0;
                    setTimeout(() => this._genTick(token, relaxed), 0);
                    return;
                }
            }
            setTimeout(() => this._genTick(token, minCells), 0);
        },

        /** 色相分配：用一個與 N 互質的步幅打散，避免編號相近的色區顏色也相近。
         *  抽出成獨立函式，因為 `_humanSolve` 的旁白也要用同一套公式反推顏色
         *  名稱（見 `_hueName`），兩處算出來的色相不能有絲毫差異。 */
        _hueOf: function (N, g) {
            const stride = Math.floor(N / 2);
            return ((g * stride) % N) * (360 / N) + 14;
        },

        /** 把色相角度換成玩家看得懂的顏色名稱。⚠️ 只需要粗略對得上人眼直覺
         *  （棋盤本身是 hsl(hue,60%,62%) 的中高彩度色塊），不必是精確的色彩學
         *  分界；區間邊界取在人眼公認的顏色轉換點附近即可。 */
        _hueName: function (deg) {
            const h = ((deg % 360) + 360) % 360;
            if (h < 15 || h >= 345) return '紅';
            if (h < 45) return '橙';
            if (h < 70) return '黃';
            if (h < 100) return '黃綠';
            if (h < 160) return '綠';
            if (h < 200) return '青';
            if (h < 255) return '藍';
            if (h < 290) return '靛';
            return '紫';
        },

        _onPuzzleReady: function (p) {
            this.generating = false;
            this.puzzle = p;
            const N = p.N;

            this.hues = new Array(N);
            for (let g = 0; g < N; g++) this.hues[g] = this._hueOf(N, g);

            // 把推理步驟展開成「一個一個打標記」的微動作佇列
            const sp = SPEED_PRESETS[this.speedKey];
            const q = [];
            p.steps.forEach(st => {
                q.push({ type: 'say', wait: SAY_MS, rule: st.rule, desc: st.desc, focus: st.focus.concat(st.bomb >= 0 ? [st.bomb] : []) });
                if (st.bomb >= 0) q.push({ type: 'mark', wait: sp.stepMs, cell: st.bomb, kind: BOMB });
                st.kill.forEach((c, i) => {
                    q.push({ type: 'mark', wait: (i === 0 && st.bomb < 0) ? sp.stepMs : sp.markMs, cell: c, kind: EXCLUDED });
                });
            });
            this.queue = q;
            this.qi = 0;
            this.nextAt = performance.now() + 500;
            this.stepTotal = p.steps.length;
            const lv = ['', '入門', '', '簡單', '普通', '困難'][p.maxRule] || '普通';
            this._say('—', `題目就緒（${N}×${N}，難度：${lv}）。開始抽絲剝繭…`);
            this._updateProgress();
        },

        // =================================================================
        // 播放
        // =================================================================
        _advance: function (now) {
            if (!this.puzzle || this.finished) return;
            // 一次可能要處理多個到期的微動作（快速檔位時 markMs 可能小於一幀）
            let guard = 0;
            while (this.qi < this.queue.length && now >= this.nextAt && guard++ < 200) {
                const a = this.queue[this.qi++];
                if (a.type === 'say') {
                    // 新的一步開始 → 上一步的紅色 ✕ 轉成黑色併入既有的排除結果，
                    //   上一顆炸彈的紅色半透明範圍也一併收起來（不累積、不殘留）
                    this.freshKills.clear();
                    this.claimBomb = -1;
                    this._say(`規則${a.rule}`, a.desc);
                    this.focus = a.focus || [];
                    this.stepDone++;
                    // ⭐ 這一步被點名的格子，意思正是「這條線索告訴我們，炸彈就在
                    //   這幾格之中」——把它們從「尚未判斷（？）」升級成「可能有
                    //   炸彈（半透明炸彈）」，而且是永久保留的，不會隨著焦點框
                    //   消失而退回問號。之後若被別的推理排除就變成 ✕、被確定就
                    //   變成實心炸彈。
                    for (const i of this.focus) {
                        if (this.state[i] === UNKNOWN) {
                            this.state[i] = MAYBE;
                            this.flashes.push({ cell: i, t0: now, kind: MAYBE });
                        }
                    }
                } else {
                    this.state[a.cell] = a.kind;
                    this.flashes.push({ cell: a.cell, t0: now, kind: a.kind });
                    if (a.kind === EXCLUDED) this.freshKills.add(a.cell);
                    if (a.kind === BOMB) {
                        this.bombOrder.push(a.cell);
                        this.claimBomb = a.cell;
                        this.foundCount++;
                        if (window.SoundManager && window.SoundManager.playConfirmItem) {
                            window.SoundManager.playConfirmItem();
                        }
                    }
                }
                this._updateProgress();
                const next = this.queue[this.qi];
                this.nextAt = now + (next ? next.wait : 0);
            }
            if (this.qi >= this.queue.length && !this.finished) {
                this.finished = true;
                this.finishedAt = now;
                this.focus = [];
                // 最後一步之後不會再有「下一步」把紅色 ✕ 轉黑、把紅色範圍收起來，
                // 所以在這裡收尾，讓完成畫面乾乾淨淨
                this.freshKills.clear();
                this.claimBomb = -1;
                if (this.frameEl) this.frameEl.classList.add('chousi-all-done');
                this._say('完成', `全部 ${this.puzzle.N} 顆炸彈都推理出來了，沒有用到任何猜測。`);
            }
        },

        _say: function (rule, text) {
            if (this.ruleEl) this.ruleEl.textContent = rule;
            if (this.narrEl) this.narrEl.textContent = text;
        },

        _updateProgress: function () {
            const bar = document.getElementById('chousi-progress-bar');
            const txt = document.getElementById('chousi-progress-text');
            if (!bar || !txt) return;
            if (this.generating) {
                bar.style.width = '100%';
                txt.textContent = '出題中…';
                return;
            }
            const N = this.puzzle ? this.puzzle.N : this.gridN;
            const pct = this.queue.length ? (this.qi / this.queue.length * 100) : 0;
            bar.style.width = pct.toFixed(1) + '%';
            txt.textContent = (this.paused ? '⏸ 已暫停　' : '')
                + `炸彈 ${this.foundCount} / ${N}　推理 ${this.stepDone} / ${this.stepTotal} 步`;
        },

        // =================================================================
        // 繪製
        // =================================================================
        _draw: function (now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);
            if (!this.puzzle) { this._drawWaiting(ctx, now); return; }

            const N = this.puzzle.N, cs = this.cell, owner = this.puzzle.owner;

            // ① 色區底色（中高彩度的彩虹色環）
            //   ⚠️ 先鋪一層不透明底色：格寬是 460/N，N=7、9 時會是小數，逐格
            //     fillRect 在格子交界處會留下抗鋸齒造成的半透明細線（實測 alpha
            //     約 246/255）。先鋪底就不會有這個問題。
            ctx.fillStyle = 'hsl(216, 40%, 16%)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
            for (let i = 0; i < N * N; i++) {
                const r = (i / N) | 0, c = i % N;
                ctx.fillStyle = `hsl(${this.hues[owner[i]]}, 60%, 62%)`;
                ctx.fillRect(c * cs, r * cs, cs + 0.6, cs + 0.6);
            }

            // ② 細的格線（同色區內部）
            ctx.strokeStyle = 'hsla(215, 30%, 18%, 0.20)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let k = 1; k < N; k++) {
                ctx.moveTo(k * cs, 0); ctx.lineTo(k * cs, BOARD_PX);
                ctx.moveTo(0, k * cs); ctx.lineTo(BOARD_PX, k * cs);
            }
            ctx.stroke();

            // ③ 粗的色區邊界（只畫在兩側 owner 不同的地方）
            ctx.strokeStyle = 'hsl(216, 48%, 13%)';
            ctx.lineWidth = 4;
            ctx.lineCap = 'square';
            ctx.beginPath();
            for (let r = 0; r < N; r++) {
                for (let c = 0; c < N; c++) {
                    const g = owner[r * N + c];
                    if (c + 1 < N && owner[r * N + c + 1] !== g) {
                        ctx.moveTo((c + 1) * cs, r * cs); ctx.lineTo((c + 1) * cs, (r + 1) * cs);
                    }
                    if (r + 1 < N && owner[(r + 1) * N + c] !== g) {
                        ctx.moveTo(c * cs, (r + 1) * cs); ctx.lineTo((c + 1) * cs, (r + 1) * cs);
                    }
                }
            }
            ctx.stroke();
            ctx.strokeRect(2, 2, BOARD_PX - 4, BOARD_PX - 4);   // 外框

            // ④ 已確定炸彈所「宣告的地盤」：虛線的九宮格框＋整條直列框＋整條橫行框
            this._drawClaims(ctx);

            // ⑤ 三種標記
            for (let i = 0; i < N * N; i++) {
                const r = (i / N) | 0, c = i % N;
                const x = c * cs + cs / 2, y = r * cs + cs / 2;
                if (this.state[i] === UNKNOWN) this._drawUnknown(ctx, x, y, cs);
                else if (this.state[i] === MAYBE) this._drawMaybe(ctx, x, y, cs);
                else if (this.state[i] === EXCLUDED) this._drawCross(ctx, x, y, cs, this.freshKills.has(i));
                else this._drawBomb(ctx, x, y, cs);
            }

            // ⑥ 目前這一步正在推理的格子：金色呼吸外框
            this._drawFocus(ctx, now);

            // ⑦ 剛打上去的標記：擴散圓環（「看到每一個打標示的過程」的視覺回饋）
            this._drawFlashes(ctx, now);
        },

        _drawWaiting: function (ctx, now) {
            ctx.save();
            ctx.fillStyle = 'hsla(214, 40%, 10%, 0.6)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
            const cx = BOARD_PX / 2, cy = BOARD_PX / 2;
            for (let k = 0; k < 3; k++) {
                const a = (now / 620 + k / 3) % 1;
                ctx.beginPath();
                ctx.arc(cx, cy, 26 + a * 74, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(45, 80%, 68%, ${0.42 * (1 - a)})`;
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
            ctx.fillStyle = 'hsla(45, 70%, 82%, 0.9)';
            ctx.font = '20px "Noto Serif TC", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('推　演　中', cx, cy);
            ctx.restore();
        },

        /** 剛確定的那一顆炸彈所「吃掉」的範圍：整條橫行、整條直列、所屬色區、
         *  周圍九宮格（不相鄰規則的禁區），全部鋪上紅色半透明方塊，表示
         *  「這些格子不可能再有別的炸彈」，接著才一格一格畫上 ✕。
         *
         *  ⚠️ 這裡原本畫的是「每顆已確定炸彈都留一組流動虛線框」，而且永久保留。
         *    盤面上炸彈越來越多之後，虛線框會層層疊疊蓋滿整個畫面、還一直在動，
         *    變成純粹的視覺干擾，反而看不出當下這一步在做什麼。改成只顯示
         *    **當下這一步**那一顆的範圍，並在進入下一步時消失。 */
        _drawClaims: function (ctx) {
            const i = this.claimBomb;
            if (i < 0) return;
            const N = this.puzzle.N, cs = this.cell, owner = this.puzzle.owner;
            const r = (i / N) | 0, c = i % N, g = owner[i];
            ctx.save();
            // 一層一層疊上去，重疊處（例如行列交會、色區與九宮格相交）自然更深，
            // 剛好強調出「被吃得最兇」的地方。
            // ⚠️ 不畫外框：只用半透明色塊表達「這些格子確定沒有炸彈」，紅色框線
            //   會跟色塊搶注意力、也容易被誤認成別的意思（例如跟「可能有炸彈」
            //   的焦點框混淆）。透明度提高到 0.6 讓紅色區域本身就夠醒目。
            ctx.fillStyle = 'hsla(0, 88%, 66%, 0.66)'; //「確定炸彈」
            ctx.fillRect(0, r * cs, BOARD_PX, cs);            // 整條橫行
            ctx.fillRect(c * cs, 0, cs, BOARD_PX);            // 整條直列
            for (let k = 0; k < N * N; k++) {                 // 所屬色區
                if (owner[k] !== g) continue;
                ctx.fillRect((k % N) * cs, ((k / N) | 0) * cs, cs, cs);
            }
            const r0 = Math.max(0, r - 1), c0 = Math.max(0, c - 1);
            const r1 = Math.min(N - 1, r + 1), c1 = Math.min(N - 1, c + 1);
            ctx.fillRect(c0 * cs, r0 * cs, (c1 - c0 + 1) * cs, (r1 - r0 + 1) * cs);   // 九宮格
            ctx.restore();
        },

        /** 尚未判斷：半透明白底圓＋問號。這只是格子的底圖，不是結論。 */
        _drawUnknown: function (ctx, x, y, cs) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, cs * 0.27, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.26)';
            ctx.fill();
            ctx.fillStyle = 'hsla(216, 45%, 20%, 0.62)';
            ctx.font = `bold ${(cs * 0.42).toFixed(1)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('？', x, y + cs * 0.02);
            ctx.restore();
        },

        /** 可能有炸彈：半透明的炸彈＋壓在上面的白色「？」。
         *  只有被某一條推理點名過的格子才會變成這樣。
         *  ⚠️ 白色「？」不只是裝飾：半透明的炸彈本身跟色區底色的對比不高，容易看
         *    不清楚；壓一個白色問號上去，既拉高辨識度，也把「炸彈」與「還不確定」
         *    兩層意思疊在同一個符號上——正好就是這個狀態要表達的東西。 */
        _drawMaybe: function (ctx, x, y, cs, alpha) {
            this._drawBomb(ctx, x, y, cs, alpha === undefined ? 0.34 : alpha);
            ctx.save();
            ctx.font = `bold ${(cs * 0.40).toFixed(1)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // 先描一圈深色邊，白字壓在淺色區底上才不會糊掉
            ctx.strokeStyle = 'hsla(216, 60%, 8%, 0.65)';
            ctx.lineWidth = Math.max(1.2, cs * 0.06);
            ctx.lineJoin = 'round';
            ctx.strokeText('？', x, y + cs * 0.02);
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.96)';
            ctx.fillText('？', x, y + cs * 0.02);
            ctx.restore();
        },

        /** 不可能有炸彈：叉叉。
         *  `fresh` = 這一格是**這一步**才被排除的 → 畫成紅色而且粗一點，讓玩家
         *  一眼看出「這一步的推理結論是這幾格」；等下一步開始時就會轉成黑色，
         *  併入既有的排除結果。 */
        _drawCross: function (ctx, x, y, cs, fresh) {
            const h = cs * 0.19;
            ctx.save();
            ctx.strokeStyle = fresh ? 'hsla(0, 90%, 47%, 0.95)' : 'hsla(216, 50%, 14%, 0.48)';
            ctx.lineWidth = Math.max(1.4, cs * (fresh ? 0.105 : 0.075));
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - h, y - h); ctx.lineTo(x + h, y + h);
            ctx.moveTo(x + h, y - h); ctx.lineTo(x - h, y + h);
            ctx.stroke();
            ctx.restore();
        },

        /** 炸彈：深色球體＋高光＋引信＋火花。
         *  alpha < 1 時畫的是「可能有炸彈」的半透明版本（不點火花，避免半透明
         *  的鬼影看起來像真的已經確定）。 */
        _drawBomb: function (ctx, x, y, cs, alpha) {
            const a = (alpha === undefined) ? 1 : alpha;
            const r = cs * 0.30;
            ctx.save();
            ctx.globalAlpha = a;
            // 引信
            ctx.strokeStyle = 'hsl(30, 45%, 30%)';
            ctx.lineWidth = Math.max(1.2, cs * 0.055);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x + r * 0.55, y - r * 0.75);
            ctx.quadraticCurveTo(x + r * 1.25, y - r * 1.35, x + r * 0.75, y - r * 1.75);
            ctx.stroke();
            // 火花
            ctx.beginPath();
            ctx.arc(x + r * 0.75, y - r * 1.9, Math.max(1.2, cs * 0.06), 0, Math.PI * 2);
            ctx.fillStyle = 'hsl(45, 100%, 62%)';
            ctx.fill();
            // 球體
            const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
            g.addColorStop(0, 'hsl(215, 14%, 38%)');
            g.addColorStop(0.6, 'hsl(216, 20%, 15%)');
            g.addColorStop(1, 'hsl(216, 30%, 7%)');
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = 'hsla(0, 0%, 100%, 0.35)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        },

        /** 目前這一步正在推理的格子：紅色外框＋框內一顆較明顯的半透明炸彈。
         *  這幾格的意思是「這一步的推論告訴我們，炸彈就在這幾格之中的某一格」，
         *  所以框內一定要有炸彈圖示，光有外框玩家看不出框起來是什麼意思。
         *  ⚠️ 已經確定是炸彈的格不畫鬼影（實心的那顆已經在那裡了，疊上去會糊）。 */
        _drawFocus: function (ctx, now) {
            if (!this.focus.length) return;
            const N = this.puzzle.N, cs = this.cell;
            const a = 0.55 + 0.35 * Math.sin(now / 220);
            ctx.save();
            for (const i of this.focus) {
                const r = (i / N) | 0, c = i % N;
                if (this.state[i] !== BOMB) {
                    this._drawMaybe(ctx, c * cs + cs / 2, r * cs + cs / 2, cs, 0.62);
                }
                ctx.strokeStyle = `hsla(0, 88%, 52%, ${a.toFixed(3)})`;
                ctx.lineWidth = 6;   // 加粗至原本（3px）的 200%，讓「可能有炸彈」的當下焦點更顯眼
                ctx.strokeRect(c * cs + 3, r * cs + 3, cs - 6, cs - 6);
            }
            ctx.restore();
        },

        _drawFlashes: function (ctx, now) {
            const N = this.puzzle.N, cs = this.cell;
            ctx.save();
            for (let k = this.flashes.length - 1; k >= 0; k--) {
                const f = this.flashes[k];
                // ⚠️ 夾在 [0,1]：若 now 因為任何理由比 t0 還早（時鐘被調整、外部
                //   直接呼叫 _draw 傳入別的時間戳），算出來的負數會讓下面的
                //   arc() 收到負半徑而直接拋例外，整幀畫面都畫不出來。
                const p = clamp((now - f.t0) / FLASH_MS, 0, 1);
                if (p >= 1) { this.flashes.splice(k, 1); continue; }
                const r = (f.cell / N) | 0, c = f.cell % N;
                const x = c * cs + cs / 2, y = r * cs + cs / 2;
                // 金＝確定炸彈、青＝判斷出「可能有」、橘紅＝排除，三種閃光要能分辨
                const hue = f.kind === BOMB ? 45 : (f.kind === MAYBE ? 190 : 8);
                ctx.beginPath();
                ctx.arc(x, y, cs * (0.16 + p * 0.44), 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${hue}, 95%, 62%, ${(1 - p) * 0.85})`;
                ctx.lineWidth = 3 * (1 - p) + 0.8;
                ctx.stroke();
            }
            ctx.restore();
        },

        // =================================================================
        // 主迴圈
        // =================================================================
        _startLoop: function () {
            if (this.rafId) return;
            const tick = () => {
                if (!this.active) { this.rafId = null; this.lastTickAt = 0; return; }
                const now = performance.now();
                const dt = this.lastTickAt ? (now - this.lastTickAt) : 0;
                this.lastTickAt = now;
                if (this.paused) {
                    // ⚠️ 暫停不是「不呼叫 _advance」就好——所有到期時間都是拿絕對
                    //   時間戳跟 performance.now() 比對的，若只是跳過推進，恢復的
                    //   瞬間會發現一大批動作全部過期而一次噴完。正確做法是把每一個
                    //   到期時間戳同步往後推 dt，等於讓這一頁的時間軸整個停住。
                    this.nextAt += dt;
                    this.finishedAt += dt;
                    for (const f of this.flashes) f.t0 += dt;
                } else {
                    this._advance(now);
                    // 推完之後停留一段時間再自動換下一題
                    if (this.finished && now - this.finishedAt > AUTO_NEXT_MS) this.newRound();
                }
                this._draw(now);
                this.rafId = requestAnimationFrame(tick);
            };
            this.rafId = requestAnimationFrame(tick);
        },

        // =================================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this.newRound();
        },

        // 玩家按 ✕ 主動關閉 → 回到首頁「青雲梯」。
        // （只有這條路徑回首頁；menu.js 的全域清理走 stopGame()，不受影響）
        hide: function () {
            this.stopGame();
            if (typeof window.FMGoHome === 'function') window.FMGoHome();
        },

        stopGame: function () {
            this.active = false;
            this.genToken++;   // 讓還在跑的出題分片自動作廢
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.ChouSi = ChouSi;

    if (new URLSearchParams(window.location.search).get('page') === 'chousi') {
        const start = () => {
            if (window.ChouSi) window.ChouSi.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
