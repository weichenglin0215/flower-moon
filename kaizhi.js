/* ============================================================================
 * kaizhi.js —《開枝散葉》色塊推理．舒壓觀想頁
 * ----------------------------------------------------------------------------
 * ⭐ 這是什麼玩法
 *   N×N 的盤面被分割成 N 個顏色區域，每個區域都是「緊密相連」的一整塊
 *   （上下左右相連，斜角不算）。開局時整個盤面是白紙，每個顏色只露出**一格**，
 *   格子上寫著這個顏色**總共有幾格**。要做的事就是把每個顏色的地盤找出來，
 *   從那一格開枝散葉，長成正確的形狀。
 *
 *   ⚠️ 這一頁**沒有炸彈**，跟《抽絲剝繭》是完全不同的題型，別把兩邊的規則搞混。
 *   這裡唯一的規則是：① 同色格子必須連成一塊 ② 每個顏色的格數必須剛好等於
 *   它的數字 ③ 每一格最後都必須屬於某個顏色。
 *
 * ⭐ 這一頁是舒壓頁，不是遊戲
 *   玩家不用動手，看 AI 一格一格把顏色鋪出來。重點是「看起來像不像一個人在解」，
 *   所以 AI 會走錯、會卡住、會把畫錯的部分擦掉重來（見下面「表演」一節）。
 *   數字用 `已畫格數 / 目標格數` 的格式即時更新，玩家隨時知道每個顏色還差多少。
 *
 * ⭐ 出題（`_genBoard`）
 *   1. 先抽每個顏色的目標格數（總和固定 = N×N，各自落在 [minCells, maxCells]）。
 *   2. 用「最遠點採樣」挑 N 個彼此盡量分散的種子格——隨機挑會讓種子擠成一團，
 *      長出來的區域一邊瘦一邊胖很難看。
 *   3. 以種子為起點做洪水填充，永遠餵「離目標格數最遠」的那一區，直到填滿。
 *      ⚠️ 還沒吃到 minCells 的區絕對優先，否則 minCells 這個難度參數會形同虛設。
 *   4. 每一區隨機挑一格當「提示格」，那格就是開局唯一露出來的顏色。
 *
 * ⭐ 表演（`_buildScript`）—— 這一頁真正的重點
 *   AI 其實知道答案，但要「演得像不知道」。做法不是照著答案畫一遍（那很無聊），
 *   而是：
 *     ① **真正的演繹**（`_deduce`）：兩條完全靠邏輯、不需要猜的規則——
 *        「某個顏色能碰到的空白剛好等於它還缺的格數」→ 那些空白全是它的；
 *        「某個空白格只有一個顏色碰得到」→ 那格就是它的。這兩條會優先執行，
 *        推得出來就不用猜。
 *     ② **挑最緊的顏色先畫**：挑「可用空白 − 還缺格數」最小的那一區。這是
 *        標準的 fail-fast 啟發式，而且講得出理由（旁白會說「它的活動空間只比
 *        目標多 N 格，最緊」），看起來就很像一個有章法的人。
 *     ③ **故意走錯，但錯得有道理**（`_findMistake`）：在動筆前先**私下模擬**
 *        一條錯路，只有在確認它「真的會撞牆」時才演出來。所以畫面上看到的每
 *        一次失敗都是被真正的規則檢查抓到的（某個顏色空間不夠了／某格被圍死
 *        沒有顏色到得了），不是硬演的。
 *     ④ **擦掉重來**：撞牆後先在要刪掉的格子上打紅色 ✕、同時用綠色虛線框標出
 *        「改成要畫這裡」，讓玩家看清楚意圖，停一拍之後才真的一格一格擦掉。
 *   ⚠️ 保證會結束：故意走錯的路一定先驗證過會失敗（所以一定會被擦掉），而
 *     「正確」的那條路直接照真解走，因此不會無限迴圈，也不會演到一半卡死。
 *
 * 依《.agent/skills/花月開發常見錯誤與解法.md §4》：
 *   - 全域 class 前綴 kaizhi-
 *   - loadCSS() 動態防護
 *   - overlay 掛載 document.body 且套用 registerOverlayResize
 *   - stopGame() 必須隱藏 container 並停掉 requestAnimationFrame
 * ========================================================================== */

(function () {
    'use strict';

    // =====================================================================
    // 可調參數
    // =====================================================================
    const STAGE_W = 500, STAGE_H = 850;   // 舞台（overlay）的邏輯尺寸，供 registerOverlayResize 縮放
    const BOARD_PX = 460;                 // 棋盤畫布的邊長（正方形）

    const GRID_PRESETS = [5, 7, 9];       // 盤面寬度格數選項（一律正方形）
    const DEFAULT_GRID = 7;               // 預設盤面
    const DEFAULT_MIN_CELLS = 2;          // 預設的最小區塊格數

    /** 最小區塊格數的可選上限。夾在 min(6, N)：N 個顏色、每色至少 minCells 格，
     *  總格數 N×N 才夠分，所以上限不能超過 N；6 是另一條硬上限。 */
    const minCellsMax = (N) => Math.min(6, N);

    /** 顏色區塊的最大格數 = max(最小格數+2, N×2)。不設上限會長出佔掉半個盤面
     *  的巨獸區塊（醜，而且數字大到玩家沒感覺），設太死則生長演算法容易失敗。 */
    const maxCellsOf = (N, minCells) => Math.max(minCells + 2, N * 2);

    const SPEED_PRESETS = {
        // stepMs：講完一句旁白後停多久才開始動筆（讓觀眾讀完）
        // markMs：連續畫格子／擦格子時，每一格之間間隔多久
        slow: { label: '慢', stepMs: 3000, markMs: 400 },
        normal: { label: '正常', stepMs: 1500, markMs: 200 },
        fast: { label: '快', stepMs: 500, markMs: 50 },
    };
    const DEFAULT_SPEED = 'normal';

    const SAY_MS = 240;                   // 旁白本身出現前的極短停頓
    const AUTO_NEXT_MS = 5000;            // 全部畫完後，隔多久自動換下一題
    const FLASH_MS = 420;                 // 每一格剛畫上去時的擴散圓環持續時間

    const GEN_SLICE_MS = 60;              // 出題時每個 setTimeout 分片最多跑多久（毫秒）
    const GEN_MAX_ATTEMPTS = 400;         // 出題的總嘗試次數上限

    /** 一輪最多演幾次「畫錯再擦掉」。太少看起來像開外掛，太多會拖戲。 */
    const mistakeBudget = (N) => (N <= 5 ? 1 : (N <= 7 ? 2 : 3));

    /** 幾格以上的區域，提示格要盡量避開自己的邊緣（9 格以內幾何上不可能有內部格）。 */
    const CLUE_INTERIOR_MIN = 10;

    /** 解題順序的兩種路數，每一輪隨機挑一種，看起來才不會每次都同一套。
     *    small —— 先畫格數少的顏色。範圍好掌握，但小顏色先佔了位置之後，
     *             輪到大顏色時常常會發現空間不夠，得回頭把小的拆掉重畫，
     *             這種「後知後覺」的來回最像真人在解題。
     *    tight —— 先畫「可用空白 − 還缺格數」最小（最吃緊）的顏色，是標準的
     *             fail-fast 解法。⚠️ 副作用是開局幾乎都從最大的顏色下手，而且
     *             會自然繞開小顏色的位置，看起來像「早就知道答案」。 */
    const STRATEGIES = ['small', 'tight'];

    /** 私下模擬錯路時，最多試幾個候選方向。 */
    const MISTAKE_TRIES = 6;

    /** 私下模擬時，往下多解幾個顏色才判定「這條路走不通」。
     *  ⚠️ 設 0（只看當下這一區）會讓大部分盤面一次錯誤都演不出來——盤面前期
     *    空白很多，畫錯一格當場不會爆炸，要再往下走個一兩區才看得出來卡死。 */
    const LOOKAHEAD_REGIONS = 3;

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
    const KaiZhi = {
        container: null,      // 外層 overlay（div#kaizhi-container）
        canvas: null,         // 棋盤畫布
        ctx: null,            // 棋盤畫布的 2D context
        frameEl: null,        // 木框裝飾層（全部畫完時加上金光呼吸動畫）
        narrEl: null,         // 旁白文字節點
        tagEl: null,          // 旁白左側的標籤徽章

        // ── 設定 ──
        speedKey: DEFAULT_SPEED,
        gridN: DEFAULT_GRID,
        minCells: DEFAULT_MIN_CELLS,

        // ── 本輪題目 ──
        puzzle: null,         // { N, owner, sizes, clues }
        cell: 0,              // 每一格的像素邊長
        hues: null,           // hues[g] = 第 g 個顏色的色相（度）

        // ── 畫面狀態 ──
        paint: null,          // Int16Array：目前畫在盤面上的顏色（-1 = 還是白紙）
        counts: null,         // counts[g] = 目前畫了幾格（提示格上顯示的分子）
        marks: null,          // Set：目前打著紅色 ✕、等著被擦掉的格
        plan: null,           // { del:[cells], add:[cells] } 修正意圖預覽，null = 沒有
        flashes: [],          // 剛動筆的格子的擴散圓環 {cell, t0, kind}

        // ── 播放狀態 ──
        queue: [],            // 微動作佇列
        qi: 0,                // 目前播到第幾個
        nextAt: 0,            // 下一個微動作的預定執行時間
        finished: false,
        finishedAt: 0,
        paused: false,
        lastTickAt: 0,        // 上一幀時間戳，暫停時用來把所有到期時間往後推

        // ── 出題狀態 ──
        generating: false,
        genToken: 0,          // 出題流水號：切換設定時遞增，讓舊的出題分片自動作廢
        genAttempts: 0,

        active: false,
        rafId: null,

        // =================================================================
        // DOM
        // =================================================================
        loadCSS: function () {
            if (!document.getElementById('kaizhi-css')) {
                const link = document.createElement('link');
                link.id = 'kaizhi-css';
                link.rel = 'stylesheet';
                link.href = 'kaizhi.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            const isFirst = !document.getElementById('kaizhi-container');
            if (isFirst) this.createDOM();
            this.container = document.getElementById('kaizhi-container');
            this.canvas = document.getElementById('kaizhi-canvas');
            this.frameEl = document.getElementById('kaizhi-canvas-frame');
            this.narrEl = document.getElementById('kaizhi-narration-text');
            this.tagEl = document.getElementById('kaizhi-narration-tag');
            this.ctx = this.canvas.getContext('2d');
            if (isFirst) { this.bindEvents(); this._paintLegend(); }
        },

        /** 圖例的符號用畫棋盤的同一組函式畫在小 canvas 上，確保跟盤面完全一致 */
        _paintLegend: function () {
            const paint = (id, fn) => {
                const cv = document.getElementById(id);
                if (!cv) return;
                const c = cv.getContext('2d');
                c.clearRect(0, 0, 26, 26);
                fn(c);
            };
            paint('kaizhi-legend-blank', c => {
                c.fillStyle = 'hsl(40, 30%, 96%)';
                c.fillRect(2, 2, 22, 22);
                c.strokeStyle = 'hsla(216, 30%, 30%, 0.35)';
                c.lineWidth = 1;
                c.strokeRect(2.5, 2.5, 21, 21);
            });
            paint('kaizhi-legend-fill', c => {
                c.fillStyle = 'hsl(134, 60%, 62%)';
                c.fillRect(2, 2, 22, 22);
                c.strokeStyle = 'hsl(216, 48%, 16%)';
                c.lineWidth = 2;
                c.strokeRect(3, 3, 20, 20);
            });
            paint('kaizhi-legend-del', c => {
                c.fillStyle = 'hsla(0, 85%, 55%, 0.22)';
                c.fillRect(2, 2, 22, 22);
                this._drawCross(c, 13, 13, 26);
            });
            paint('kaizhi-legend-add', c => {
                c.strokeStyle = 'hsl(142, 80%, 45%)';
                c.lineWidth = 2.5;
                c.setLineDash([4, 3]);
                c.strokeRect(3.5, 3.5, 19, 19);
            });
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'kaizhi-container';
            div.className = 'kaizhi-overlay hidden';
            div.innerHTML = `
                <div class="kaizhi-header">
                    <div class="kaizhi-title">開枝散葉</div>
                    <div class="kaizhi-subtitle">每個顏色只露一格，數字是它的總格數</div>
                </div>
                <div id="kaizhi-close" class="kaizhi-close" aria-label="關閉">✕</div>

                <div id="kaizhi-canvas-frame" class="kaizhi-canvas-frame">
                    <canvas id="kaizhi-canvas" width="${BOARD_PX}" height="${BOARD_PX}"></canvas>
                </div>

                <div class="kaizhi-legend">
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-blank" width="26" height="26"></canvas>還沒探索</span>
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-fill" width="26" height="26"></canvas>已畫上</span>
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-del" width="26" height="26"></canvas>準備擦掉</span>
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-add" width="26" height="26"></canvas>改畫這裡</span>
                </div>

                <div class="kaizhi-narration">
                    <div id="kaizhi-narration-tag" class="kaizhi-narration-tag">—</div>
                    <div id="kaizhi-narration-text" class="kaizhi-narration-text">準備出題…</div>
                </div>

                <div class="kaizhi-panel">
                    <div class="kaizhi-progress-wrap">
                        <div id="kaizhi-progress-bar" class="kaizhi-progress-bar"></div>
                        <div id="kaizhi-progress-text" class="kaizhi-progress-text"></div>
                    </div>
                    <div class="kaizhi-row">
                        <span class="kaizhi-row-label">盤面</span>
                        <div id="kaizhi-grid-group" class="kaizhi-btn-group"></div>
                        <span class="kaizhi-row-label">速度</span>
                        <div id="kaizhi-speed-group" class="kaizhi-btn-group"></div>
                    </div>
                    <div class="kaizhi-row">
                        <span class="kaizhi-row-label">最小區塊</span>
                        <div id="kaizhi-min-group" class="kaizhi-btn-group"></div>
                        <button id="kaizhi-pause" class="kaizhi-action-btn">暫停</button>
                        <button id="kaizhi-again" class="kaizhi-action-btn">換一題</button>
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
            document.getElementById('kaizhi-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('kaizhi-again').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playConfirmItem(); }
                this.newRound();
            });
            document.getElementById('kaizhi-pause').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                this.paused = !this.paused;
                this._syncPauseBtn();
                this._updateProgress();
            });

            const gridGroup = document.getElementById('kaizhi-grid-group');
            GRID_PRESETS.forEach(n => {
                const btn = document.createElement('button');
                btn.className = 'kaizhi-chip kaizhi-chip-narrow';
                btn.dataset.grid = n;
                btn.textContent = `${n}×${n}`;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.gridN = n;
                    this.minCells = clamp(this.minCells, 1, minCellsMax(n));
                    this._buildMinChips();
                    this._syncChips();
                    this.newRound();
                });
                gridGroup.appendChild(btn);
            });

            const speedGroup = document.getElementById('kaizhi-speed-group');
            Object.keys(SPEED_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'kaizhi-chip kaizhi-chip-narrow';
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
            const group = document.getElementById('kaizhi-min-group');
            group.innerHTML = '';
            const top = minCellsMax(this.gridN);
            for (let m = 1; m <= top; m++) {
                const btn = document.createElement('button');
                btn.className = 'kaizhi-chip kaizhi-chip-mini';
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
            const b = document.getElementById('kaizhi-pause');
            if (!b) return;
            b.textContent = this.paused ? '繼續' : '暫停';
            b.classList.toggle('kaizhi-action-btn-on', this.paused);
        },

        _syncChips: function () {
            document.querySelectorAll('#kaizhi-grid-group .kaizhi-chip').forEach(b => {
                b.classList.toggle('active', Number(b.dataset.grid) === this.gridN);
            });
            document.querySelectorAll('#kaizhi-min-group .kaizhi-chip').forEach(b => {
                b.classList.toggle('active', Number(b.dataset.min) === this.minCells);
            });
            document.querySelectorAll('#kaizhi-speed-group .kaizhi-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.speed === this.speedKey);
            });
        },

        // =================================================================
        // 顏色
        // =================================================================
        /** 色相分配：用一個與 N 互質的步幅打散，避免編號相近的顏色也相近 */
        _hueOf: function (N, g) {
            const stride = Math.floor(N / 2);
            return ((g * stride) % N) * (360 / N) + 14;
        },

        /** 把色相角度換成玩家看得懂的顏色名稱（旁白要講得出「綠色那一區」） */
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

        _colorName: function (N, g) { return this._hueName(this._hueOf(N, g)); },

        // =================================================================
        // 小工具：鄰格
        // =================================================================
        _nbs: function (N, i) {
            const r = (i / N) | 0, c = i % N, out = [];
            if (r > 0) out.push(i - N);
            if (r < N - 1) out.push(i + N);
            if (c > 0) out.push(i - 1);
            if (c < N - 1) out.push(i + 1);
            return out;
        },

        // =================================================================
        // 出題
        // =================================================================
        /**
         * 回傳 { N, owner, sizes, clues } 或 null（這次沒長成，交給外層重試）。
         *   owner[i] = 第 i 格屬於哪個顏色
         *   sizes[g] = 第 g 個顏色的總格數（＝提示格上的分母）
         *   clues[g] = 第 g 個顏色的提示格位置
         */
        _genBoard: function (N, minCells) {
            const total = N * N;
            const maxCells = maxCellsOf(N, minCells);

            // ① 先抽每個顏色的目標格數：全部從平均值 N 出發，再隨機互相搬移，
            //    總和恆等於 N×N，且每個都留在 [minCells, maxCells] 內。
            const target = new Array(N).fill(N);
            for (let k = 0; k < N * 12; k++) {
                const a = (Math.random() * N) | 0, b = (Math.random() * N) | 0;
                if (a === b) continue;
                const mv = 1 + ((Math.random() * Math.max(1, Math.floor(N / 2))) | 0);
                if (target[a] - mv >= minCells && target[b] + mv <= maxCells) {
                    target[a] -= mv; target[b] += mv;
                }
            }

            // ② 最遠點採樣挑種子。⚠️ 純隨機挑種子會擠成一團，長出來的區域一邊
            //    瘦一邊胖，畫面很難看，而且小區域全被擠到角落。
            const seeds = [(Math.random() * total) | 0];
            while (seeds.length < N) {
                let best = -1, bestD = -1;
                for (let i = 0; i < total; i++) {
                    if (seeds.indexOf(i) >= 0) continue;
                    const r = (i / N) | 0, c = i % N;
                    let d = Infinity;
                    for (const s of seeds) {
                        const sr = (s / N) | 0, sc = s % N;
                        d = Math.min(d, Math.abs(r - sr) + Math.abs(c - sc));
                    }
                    // 加一點隨機擾動，免得每次的種子分布都一模一樣
                    d += Math.random() * 0.9;
                    if (d > bestD) { bestD = d; best = i; }
                }
                seeds.push(best);
            }

            const owner = new Int16Array(total).fill(-1);
            const size = new Array(N).fill(1);
            seeds.forEach((s, g) => { owner[s] = g; });
            let assigned = N;

            const frontierOf = (g) => {
                const out = [];
                for (let i = 0; i < total; i++) {
                    if (owner[i] !== g) continue;
                    for (const nb of this._nbs(N, i)) {
                        if (owner[nb] === -1 && out.indexOf(nb) < 0) out.push(nb);
                    }
                }
                return out;
            };

            while (assigned < total) {
                // 階段一：還沒吃到 minCells 的顏色絕對優先（否則 minCells 形同虛設）
                // 階段二：挑「離目標格數最遠」的顏色
                const starving = [];
                for (let g = 0; g < N; g++) if (size[g] < minCells) starving.push(g);
                // ⚠️ 階段二一定要濾掉「已經吃到 maxCells 的顏色」。少了這個上限檢查，
                //   當某些顏色提早被包住、沒路可走時，剩下的格子會全部灌進同一個
                //   顏色，長出遠超過上限的巨獸區塊（實測 N=7／最小 1 就會超標）。
                const pool = starving.length
                    ? starving
                    : Array.from({ length: N }, (_, g) => g).filter(g => size[g] < maxCells);

                let best = -1, bestDef = -Infinity, bestFr = null;
                for (const g of pool) {
                    const fr = frontierOf(g);
                    if (!fr.length) continue;
                    const def = target[g] - size[g] + Math.random() * 0.5;
                    if (def > bestDef) { bestDef = def; best = g; bestFr = fr; }
                }
                // 沒有任何「還沒滿又有路可走」的顏色，但格子還沒填完
                // → 這張圖救不回來（硬填下去就會破壞 minCells／maxCells），放棄重生成
                if (best < 0) return null;

                const pick = bestFr[(Math.random() * bestFr.length) | 0];
                owner[pick] = best; size[best]++; assigned++;
            }
            if (assigned !== total) return null;
            for (let g = 0; g < N; g++) if (size[g] < minCells) return null;

            // ③ 每一區挑一格當提示格
            // ⚠️ 大區域的提示格要盡量避開自己的邊緣。9 格以內的區域怎麼挑都一定
            //   貼著邊（3×3 正好才有一個內部格），那是幾何上的必然；但 10 格以上
            //   若也總是落在邊緣，看起來就很假、很像刻意安排的。
            const clues = new Array(N).fill(-1);
            const sameNb = (i, g) => this._nbs(N, i).filter(j => owner[j] === g).length;
            for (let g = 0; g < N; g++) {
                const cells = [];
                for (let i = 0; i < total; i++) if (owner[i] === g) cells.push(i);
                let pool = cells;
                if (cells.length >= CLUE_INTERIOR_MIN) {
                    // 首選：四周（含盤面邊界）全是自己人的真正內部格
                    const inner = cells.filter(i => {
                        const nb = this._nbs(N, i);
                        return nb.length === 4 && nb.every(j => owner[j] === g);
                    });
                    if (inner.length) {
                        pool = inner;
                    } else {
                        // 細長的區域可能連一個內部格都沒有，退而求其次挑「同色鄰居最多」的
                        let best = 0;
                        for (const i of cells) best = Math.max(best, sameNb(i, g));
                        pool = cells.filter(i => sameNb(i, g) === best);
                    }
                }
                clues[g] = pool[(Math.random() * pool.length) | 0];
            }
            return { N, owner, sizes: size.slice(), clues };
        },

        // =================================================================
        // 解題引擎的共用計算
        // =================================================================
        /** 從第 g 色目前的格子出發、沿著空白格擴散，回傳「碰得到的空白格」清單。
         *  這是所有判斷的基礎：一個顏色未來只可能長進它碰得到的空白裡。 */
        _reach: function (N, paint, g) {
            const total = N * N;
            const seen = new Uint8Array(total);
            const stack = [];
            for (let i = 0; i < total; i++) if (paint[i] === g) { seen[i] = 1; stack.push(i); }
            const free = [];
            while (stack.length) {
                const i = stack.pop();
                for (const nb of this._nbs(N, i)) {
                    if (seen[nb]) continue;
                    if (paint[nb] === -1) { seen[nb] = 1; free.push(nb); stack.push(nb); }
                    else if (paint[nb] === g) { seen[nb] = 1; stack.push(nb); }
                }
            }
            return free;
        },

        /** 目前盤面有沒有已經走不通的地方。回傳 null 代表還有救。
         *  兩種矛盾都是真的規則衝突，不是硬演的：
         *    space  —— 某個顏色還缺的格數，比它碰得到的空白還多
         *    orphan —— 某個空白格已經沒有任何未完成的顏色碰得到，永遠填不了 */
        _findFail: function (N, paint, sizes, counts) {
            const total = N * N;
            const cover = new Uint8Array(total);
            for (let g = 0; g < N; g++) {
                const need = sizes[g] - counts[g];
                if (need <= 0) continue;
                const rs = this._reach(N, paint, g);
                if (rs.length < need) return { type: 'space', g, need, avail: rs.length };
                for (const i of rs) cover[i] = 1;
            }
            for (let i = 0; i < total; i++) {
                if (paint[i] === -1 && !cover[i]) return { type: 'orphan', cell: i };
            }
            return null;
        },

        /** 把一批格子排成「每一格放下去時都貼著已畫區域」的順序（BFS）。
         *  ⚠️ 不排序直接畫的話，會出現顏色憑空跳到不相連的地方，看起來像作弊。 */
        _bfsOrder: function (N, paint, g, allow) {
            const allowSet = new Set(allow);
            const seen = new Set();
            const q = [];
            for (let i = 0; i < N * N; i++) if (paint[i] === g) q.push(i);
            const out = [];
            for (let h = 0; h < q.length; h++) {
                for (const nb of this._nbs(N, q[h])) {
                    if (allowSet.has(nb) && !seen.has(nb)) {
                        seen.add(nb); out.push(nb); q.push(nb);
                    }
                }
            }
            return out;
        },

        /** 第 g 色目前可以往外長的空白格 */
        _frontier: function (N, paint, g) {
            const out = [];
            for (let i = 0; i < N * N; i++) {
                if (paint[i] !== g) continue;
                for (const nb of this._nbs(N, i)) {
                    if (paint[nb] === -1 && out.indexOf(nb) < 0) out.push(nb);
                }
            }
            return out;
        },

        /**
         * 純邏輯演繹，完全不用猜。推得出來就回傳 { g, cells, why }。
         *   D1 剛好夠：某個顏色碰得到的空白剛好等於它還缺的格數 → 那些空白全是它的
         *   D2 只有它到得了：某個空白格只有一個未完成的顏色碰得到 → 那格就是它的
         * ⚠️ 這兩條在「每一個合法解」裡都成立，所以推出來的結果一定跟真解一致，
         *   不會把盤面帶到跟答案衝突的狀態。
         */
        _deduce: function (N, paint, sizes, counts) {
            const total = N * N;
            const reachOf = [];
            for (let g = 0; g < N; g++) {
                reachOf[g] = (sizes[g] - counts[g] > 0) ? this._reach(N, paint, g) : null;
            }
            // D1：剛好夠
            for (let g = 0; g < N; g++) {
                const need = sizes[g] - counts[g];
                if (need <= 0 || !reachOf[g]) continue;
                if (reachOf[g].length === need) {
                    return {
                        g, cells: this._bfsOrder(N, paint, g, reachOf[g]),
                        why: `${this._colorName(N, g)}色還缺 ${need} 格，而它碰得到的空白剛好也只有 ${need} 格——那這些空白全都是它的，不用猜`
                    };
                }
            }
            // D2：只有它到得了
            const cnt = new Int16Array(total);
            const who = new Int16Array(total).fill(-1);
            for (let g = 0; g < N; g++) {
                if (!reachOf[g]) continue;
                for (const i of reachOf[g]) { cnt[i]++; who[i] = g; }
            }
            for (let i = 0; i < total; i++) {
                if (paint[i] !== -1 || cnt[i] !== 1) continue;
                const g = who[i];
                // 只有貼著該色的格子才畫得下去（維持連通，畫面才不會跳格）
                if (!this._nbs(N, i).some(nb => paint[nb] === g)) continue;
                return {
                    g, cells: [i],
                    why: `這一格只有${this._colorName(N, g)}色連得過來，其他顏色都被擋住了，所以它一定是${this._colorName(N, g)}色的`
                };
            }
            return null;
        },

        /** 某個顏色目前的處境：還缺幾格、碰得到多少空白、寬裕度 */
        _statsOf: function (N, paint, sizes, counts, g) {
            const need = sizes[g] - counts[g];
            const avail = this._reach(N, paint, g).length;
            return { need, avail, slack: avail - need };
        },

        /** 挑下一個要動筆的顏色，依當輪的路數（見 STRATEGIES 的說明）：
         *    tight —— 寬裕度（可用空白 − 還缺格數）最小的先畫
         *    small —— 還缺格數最少的先畫，平手時再比寬裕度 */
        _pickRegion: function (N, paint, sizes, counts, strategy) {
            let best = -1, bestKey = null, bestSlack = 0, bestAvail = 0, bestNeed = 0;
            for (let g = 0; g < N; g++) {
                const need = sizes[g] - counts[g];
                if (need <= 0) continue;
                const avail = this._reach(N, paint, g).length;
                const slack = avail - need;
                const key = (strategy === 'small') ? [need, slack] : [slack, need];
                if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
                    bestKey = key; best = g; bestSlack = slack; bestAvail = avail; bestNeed = need;
                }
            }
            return best < 0 ? null : { g: best, slack: bestSlack, avail: bestAvail, need: bestNeed };
        },

        /** 貪心挑一個往外長的格子：優先挑「周圍空白最少」的，也就是貼著牆邊
         *  或已畫區域長。這是標準的填充啟發式，可以避免留下填不滿的小洞。 */
        _greedyCell: function (N, paint, g) {
            const fr = this._frontier(N, paint, g);
            if (!fr.length) return -1;
            let best = -1, bestScore = -Infinity;
            for (const i of fr) {
                const nb = this._nbs(N, i);
                let closed = 4 - nb.length;               // 貼到盤面邊界
                for (const j of nb) if (paint[j] !== -1) closed++;
                const score = closed + Math.random() * 0.5;
                if (score > bestScore) { bestScore = score; best = i; }
            }
            return best;
        },

        /**
         * 私下把一條路走完看看會不會撞牆。
         *   firstCell >= 0 → 先硬塞這一格給第 g 色，再貪心把 g 長完
         *   firstCell <  0 → 照真解把 g 填完（拿來當「基準線」用）
         * 接著再貪心往下解 LOOKAHEAD_REGIONS 個顏色，因為很多錯誤不會當場爆炸，
         * 要再往下走個一兩區才看得出來卡死。
         * 回傳 { fail, used }；used 是這條路上實際畫下去的每一格 {cell, g}。
         */
        _simRun: function (N, paint, counts, sizes, trueOwner, g, firstCell, strategy) {
            const total = N * N;
            const sp = Int16Array.from(paint);
            const sc = counts.slice();
            const used = [];
            const put = (c, gg) => { sp[c] = gg; sc[gg]++; used.push({ cell: c, g: gg }); };

            if (firstCell >= 0) {
                put(firstCell, g);
                let fail = this._findFail(N, sp, sizes, sc);
                let guard = 0;
                while (!fail && sc[g] < sizes[g] && guard++ < total) {
                    const c = this._greedyCell(N, sp, g);
                    if (c < 0) { fail = { type: 'stuck', g }; break; }
                    put(c, g);
                    fail = this._findFail(N, sp, sizes, sc);
                }
                if (fail) return { fail, used };
            } else {
                const rest = [];
                for (let i = 0; i < total; i++) if (trueOwner[i] === g && sp[i] === -1) rest.push(i);
                for (const c of this._bfsOrder(N, sp, g, rest)) put(c, g);
                const f = this._findFail(N, sp, sizes, sc);
                if (f) return { fail: f, used };
            }

            // 再往下解幾個顏色。⚠️ 這裡要跟正式表演用同一套策略——先做演繹、
            //   推不動才貪心——否則「預看」比實際解法笨，基準線動不動就撞牆，
            //   結果大半盤面都演不出任何一次試錯（實測純貪心預看時，有四成的
            //   局從頭到尾一次錯誤都沒有）。
            for (let k = 0; k < LOOKAHEAD_REGIONS; k++) {
                let dGuard = 0, d;
                while ((d = this._deduce(N, sp, sizes, sc)) && d.cells.length && dGuard++ < total) {
                    for (const c of d.cells) put(c, d.g);
                    const f = this._findFail(N, sp, sizes, sc);
                    if (f) return { fail: f, used };
                }
                const pick = this._pickRegion(N, sp, sizes, sc, strategy);
                if (!pick) break;
                const h = pick.g;
                let guard = 0;
                while (sc[h] < sizes[h] && guard++ < total) {
                    const c = this._greedyCell(N, sp, h);
                    if (c < 0) return { fail: { type: 'stuck', g: h }, used };
                    put(c, h);
                    const f = this._findFail(N, sp, sizes, sc);
                    if (f) return { fail: f, used };
                }
            }
            return { fail: null, used };
        },

        /**
         * 私下模擬一條錯路，只有在確認它「真的會撞牆」時才回傳。
         *
         * ⚠️ 這是整個表演誠實與否的關鍵，有兩層把關：
         *   ① 候選格一定是「其實不屬於這個顏色」的格（`trueOwner[i] !== g`），
         *      所以待會擦掉的絕對不會是畫對的格子。
         *   ② 先跑一次**基準線**：照真解走、用同樣的預看深度，必須**不會**撞牆。
         *      若連正確答案在這個深度下也會撞牆，代表撞牆是「貪心預看」本身能力
         *      不足造成的，不能歸咎於這一步的選擇——這種情況就不演錯誤，免得
         *      畫面上講出一個假的理由。
         * 回傳 { cells:[{cell,g}], fail } 或 null。
         */
        _findMistake: function (N, paint, sizes, counts, trueOwner, g, strategy) {
            if (sizes[g] - counts[g] <= 0) return null;
            const cand = this._frontier(N, paint, g).filter(i => trueOwner[i] !== g);
            if (!cand.length) return null;

            // 基準線：正確答案在同樣的預看深度下必須走得通
            if (this._simRun(N, paint, counts, sizes, trueOwner, g, -1, strategy).fail) return null;

            shuffle(cand);
            const cap = Math.max(8, N + 5);   // 一次錯誤最多畫這麼多格，免得擦太久拖戲
            for (let t = 0; t < Math.min(MISTAKE_TRIES, cand.length); t++) {
                const r = this._simRun(N, paint, counts, sizes, trueOwner, g, cand[t], strategy);
                if (r.fail && r.used.length <= cap) return { cells: r.used, fail: r.fail };
            }
            return null;
        },

        /** 把矛盾翻譯成玩家看得懂的一句話。
         *  ⚠️ 這裡只回傳「原因本身」，不要自帶「糟了——」之類的開頭；開頭由呼叫端
         *    依情境接（跨顏色的情況會先講一段前因），否則會接出
         *    「才發現不對——糟了——…」這種疊字。 */
        _failText: function (N, fail) {
            if (fail.type === 'space') {
                return `${this._colorName(N, fail.g)}色還需要 ${fail.need} 格，可是它現在碰得到的空白只剩 ${fail.avail} 格，怎麼樣都不夠`;
            }
            if (fail.type === 'orphan') {
                return `有一格被圍死了，已經沒有任何還沒畫完的顏色連得過去，永遠填不上`;
            }
            return `${this._colorName(N, fail.g)}色四周被堵住，沒有地方可以繼續長了`;
        },

        // =================================================================
        // 產生整場表演的腳本
        // =================================================================
        /**
         * 回傳事件陣列。事件種類：
         *   say      旁白（tag = 左側徽章文字）
         *   place    把某一格畫成某個顏色
         *   plan     顯示修正意圖（紅 ✕ 要刪的、綠虛線框要加的），停一拍讓玩家看
         *   markX    在某一格打上紅色 ✕
         *   erase    把某一格擦回白紙
         *   clearPlan 收掉修正意圖預覽
         */
        _buildScript: function (p) {
            const N = p.N, total = N * N, trueOwner = p.owner, sizes = p.sizes;
            const paint = new Int16Array(total).fill(-1);
            const counts = new Array(N).fill(0);
            p.clues.forEach((c, g) => { paint[c] = g; counts[g] = 1; });

            const ev = [];
            const say = (tag, text) => ev.push({ type: 'say', tag, text });
            const place = (cell, g) => {
                paint[cell] = g; counts[g]++;
                ev.push({ type: 'place', cell, g });
            };

            // 每一輪隨機挑一種解題路數，看起來才不會每次都同一套（見 STRATEGIES）
            const strategy = STRATEGIES[(Math.random() * STRATEGIES.length) | 0];
            say('開始', strategy === 'small'
                ? `盤面上 ${N} 個顏色各露了一格，數字是那個顏色的總格數。我先從格數少的顏色下手，範圍比較好掌握。`
                : `盤面上 ${N} 個顏色各露了一格，數字是那個顏色的總格數。我先挑活動空間最吃緊的顏色下手。`);

            let mistakes = mistakeBudget(N);
            let guard = 0;
            while (guard++ < 6000) {
                const doneAll = counts.every((c, g) => c >= sizes[g]);
                if (doneAll) break;

                // ── ① 先試純邏輯演繹，推得出來就不用猜 ──
                const d = this._deduce(N, paint, sizes, counts);
                if (d && d.cells.length) {
                    say('推理', d.why);
                    for (const c of d.cells) place(c, d.g);
                    continue;
                }

                // ── ② 挑要動筆的顏色，順便看看有沒有可以演的試錯 ──
                const pick = this._pickRegion(N, paint, sizes, counts, strategy);
                if (!pick) break;
                let g = pick.g;
                let m = null;
                if (mistakes > 0) {
                    m = this._findMistake(N, paint, sizes, counts, trueOwner, g, strategy);
                    if (!m) {
                        // ⚠️ 最緊的那一區通常沒得試錯——它四周的空白幾乎都是自己的
                        //   （實測有 54% 的機會連一個「錯的候選格」都找不到）。
                        //   所以再看看其他還沒完成的顏色；少了這一段，實測有一半的
                        //   局從頭到尾一次試錯都演不出來，整場就只是照著填，很無聊。
                        const others = [];
                        for (let h = 0; h < N; h++) if (h !== g && sizes[h] - counts[h] > 0) others.push(h);
                        shuffle(others);
                        for (let k = 0; k < Math.min(4, others.length); k++) {
                            const mm = this._findMistake(N, paint, sizes, counts, trueOwner, others[k], strategy);
                            if (mm) { m = mm; g = others[k]; break; }
                        }
                    }
                }
                const name = this._colorName(N, g);
                const st = this._statsOf(N, paint, sizes, counts, g);
                // 旁白要講實話：只有真的挑到「該路數選中的那一區」才說得出那個理由
                if (g !== pick.g) {
                    say('動筆', `換${name}色來看：還缺 ${st.need} 格，能用的空白有 ${st.avail} 格，這一區的走法比較微妙，先把它試出來。`);
                } else if (strategy === 'small') {
                    say('動筆', `輪到${name}色：總共才 ${sizes[g]} 格、還缺 ${st.need} 格，是目前剩下最小的一塊，範圍最好掌握，先把它定下來。`);
                } else {
                    say('動筆', `輪到${name}色：還缺 ${st.need} 格，能用的空白有 ${st.avail} 格，寬裕度只有 ${st.slack}，是目前最吃緊的一個，先處理它。`);
                }

                // ── ③ 要不要演一次「走錯再擦掉」 ──
                let didMistake = false;
                {
                    if (m) {
                        mistakes--;
                        didMistake = true;
                        say('嘗試', `先往這個方向試試看，把${name}色沿著邊長出去。`);
                        // m.cells 可能包含「再往下多解幾個顏色」時畫的格子——那是這次
                        // 探索的一部分，一起畫出來、待會也一起擦掉，玩家才看得懂前因後果
                        for (const u of m.cells) place(u.cell, u.g);

                        // 撞牆點常常不在剛畫的那個顏色身上，而是後面接著畫的顏色才爆掉。
                        // 這種「先畫小的、輪到大的才發現不夠用」正是最像真人的地方，
                        // 但旁白一定要把因果講清楚，否則玩家看不懂為什麼要擦前面畫好的。
                        const involved = [...new Set(m.cells.map(u => u.g))];
                        const spanned = involved.length > 1;
                        say('撞牆', (spanned ? '沿著這條路把後面的顏色也接著畫下去，才發現不對——' : '糟了——')
                            + this._failText(N, m.fail));

                        // 正確的方向：好在預覽裡標出「改畫這裡」。
                        // ⚠️ 必須用「擦掉之後」的盤面來算：這次試錯畫下去的格子裡，
                        //   有些其實**本來就是這個顏色的**，擦掉後會重新變成空白。
                        //   若直接拿當下的盤面判斷 paint[i] === -1，那些格子會被漏掉，
                        //   極端情況下整個提示會變成空的（實測 5×5 就會出現）。
                        const tried = new Set(m.cells.map(u => u.cell));
                        const post = Int16Array.from(paint);
                        for (const c of tried) post[c] = -1;
                        const remainTrue = [];
                        for (let i = 0; i < total; i++) {
                            if (trueOwner[i] === g && post[i] === -1) remainTrue.push(i);
                        }
                        const delCells = m.cells.map(u => u.cell);
                        // 依「貼著現有色塊往外長」的順序取前幾格，提示才落在合理的位置
                        const ordered = this._bfsOrder(N, post, g, remainTrue);
                        const addHint = (ordered.length ? ordered : remainTrue).slice(0, 3);

                        ev.push({ type: 'plan', del: delCells, add: addHint });
                        const involvedNames = involved.map(h => this._colorName(N, h) + '色').join('、');
                        say('修正', spanned
                            ? `這一輪試出來的 ${delCells.length} 格（${involvedNames}）整批收回來，連前面畫好的也要一起拆，改往綠色虛線框那個方向重走。`
                            : `把剛剛試錯的 ${delCells.length} 格擦掉（紅色 ✕ 的部分），改往綠色虛線框那個方向走。`);
                        for (const c of delCells) ev.push({ type: 'markX', cell: c });
                        // ⚠️ 反序擦除：畫的時候是由內往外長，擦的時候由外往內收，
                        //   每一步都不會讓已畫的色塊斷成兩截，看起來才自然
                        for (let k = delCells.length - 1; k >= 0; k--) {
                            const c = delCells[k];
                            counts[paint[c]]--; paint[c] = -1;
                            ev.push({ type: 'erase', cell: c });
                        }
                        ev.push({ type: 'clearPlan' });
                    }
                }

                // ── ④ 照正確答案把這個顏色補完 ──
                //   （走錯的那條路一定先驗證過會失敗，所以這裡永遠走得通，
                //     整場表演保證會結束、也保證最後完全正確）
                const rest = [];
                for (let i = 0; i < total; i++) if (trueOwner[i] === g && paint[i] === -1) rest.push(i);
                const ordered = this._bfsOrder(N, paint, g, rest);
                if (ordered.length) {
                    if (didMistake) say('重畫', `${name}色改從這個方向長，這樣才接得起來。`);
                    for (const c of ordered) place(c, g);
                }
                if (ordered.length !== rest.length) {
                    // 理論上不會發生（真解本來就是連通的）；真的發生就補上剩下的，
                    // 寧可畫面稍微跳一下，也不要卡在這裡永遠畫不完
                    for (const c of rest) if (paint[c] === -1) place(c, g);
                }
            }

            say('完成', `全部 ${total} 格都歸位了，每個顏色的格數都剛好對上它的數字。`);
            return ev;
        },

        // =================================================================
        // 開新的一題
        // =================================================================
        newRound: function () {
            const N = this.gridN;
            this.genToken++;
            this.generating = true;
            this.genAttempts = 0;
            this.puzzle = null;
            this.finished = false;
            this.queue = []; this.qi = 0;
            this.flashes = [];
            this.marks = new Set();
            this.plan = null;
            this.cell = BOARD_PX / N;
            this.paint = new Int16Array(N * N).fill(-1);
            this.counts = new Array(N).fill(0);
            this.hues = null;
            this.paused = false;
            this.lastTickAt = 0;
            this._syncPauseBtn();
            if (this.frameEl) this.frameEl.classList.remove('kaizhi-all-done');
            this._say('—', '正在安排盤面…');
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
                const p = this._genBoard(this.gridN, minCells);
                if (p) { this._onPuzzleReady(p); return; }
                if (this.genAttempts >= GEN_MAX_ATTEMPTS) {
                    const relaxed = Math.max(1, minCells - 1);
                    console.warn('[開枝散葉] 出題超過上限，將最小區塊放寬為', relaxed);
                    this.genAttempts = 0;
                    setTimeout(() => this._genTick(token, relaxed), 0);
                    return;
                }
            }
            setTimeout(() => this._genTick(token, minCells), 0);
        },

        _onPuzzleReady: function (p) {
            this.generating = false;
            this.puzzle = p;
            const N = p.N;

            this.hues = new Array(N);
            for (let g = 0; g < N; g++) this.hues[g] = this._hueOf(N, g);

            // 開局畫面：只有提示格露出顏色，其餘全是白紙
            this.paint = new Int16Array(N * N).fill(-1);
            this.counts = new Array(N).fill(0);
            p.clues.forEach((c, g) => { this.paint[c] = g; this.counts[g] = 1; });
            this.marks = new Set();
            this.plan = null;
            this.flashes = [];

            this.queue = this._buildScript(p);
            this.qi = 0;
            this.nextAt = performance.now() + 600;
            this._updateProgress();
        },

        // =================================================================
        // 播放
        // =================================================================
        /** 每個事件要等多久才執行。⚠️ 在「消費事件的當下」才依目前速度檔位計算，
         *  這樣玩家中途改速度可以立刻生效，不必等下一題。 */
        _waitOf: function (a) {
            const sp = SPEED_PRESETS[this.speedKey];
            if (a.type === 'say') return SAY_MS;
            if (a.type === 'plan') return sp.stepMs;
            if (a.type === 'clearPlan') return sp.markMs;
            // place / markX / erase：接在旁白後的第一筆要停久一點讓人讀完
            const prev = this.queue[this.qi - 2];
            return (prev && prev.type === 'say') ? sp.stepMs : sp.markMs;
        },

        _advance: function (now) {
            if (!this.puzzle || this.finished) return;
            let guard = 0;
            while (this.qi < this.queue.length && now >= this.nextAt && guard++ < 200) {
                const a = this.queue[this.qi++];
                if (a.type === 'say') {
                    this._say(a.tag, a.text);
                } else if (a.type === 'place') {
                    this.paint[a.cell] = a.g;
                    this.counts[a.g]++;
                    this.flashes.push({ cell: a.cell, t0: now, kind: 'place' });
                } else if (a.type === 'plan') {
                    this.plan = { del: a.del.slice(), add: a.add.slice() };
                } else if (a.type === 'markX') {
                    this.marks.add(a.cell);
                    this.flashes.push({ cell: a.cell, t0: now, kind: 'mark' });
                } else if (a.type === 'erase') {
                    const g = this.paint[a.cell];
                    if (g >= 0) this.counts[g]--;
                    this.paint[a.cell] = -1;
                    this.marks.delete(a.cell);
                    this.flashes.push({ cell: a.cell, t0: now, kind: 'erase' });
                } else if (a.type === 'clearPlan') {
                    this.plan = null;
                    this.marks.clear();
                }
                this._updateProgress();
                const next = this.queue[this.qi];
                this.nextAt = now + (next ? this._waitOf(next) : 0);
            }
            if (this.qi >= this.queue.length && !this.finished) {
                this.finished = true;
                this.finishedAt = now;
                this.plan = null;
                this.marks.clear();
                if (this.frameEl) this.frameEl.classList.add('kaizhi-all-done');
            }
        },

        _say: function (tag, text) {
            if (this.tagEl) this.tagEl.textContent = tag;
            if (this.narrEl) this.narrEl.textContent = text;
        },

        _updateProgress: function () {
            const bar = document.getElementById('kaizhi-progress-bar');
            const txt = document.getElementById('kaizhi-progress-text');
            if (!bar || !txt) return;
            if (this.generating) {
                bar.style.width = '100%';
                txt.textContent = '安排盤面中…';
                return;
            }
            const N = this.puzzle ? this.puzzle.N : this.gridN;
            const total = N * N;
            let filled = 0;
            for (let i = 0; i < total; i++) if (this.paint[i] >= 0) filled++;
            bar.style.width = (filled / total * 100).toFixed(1) + '%';
            txt.textContent = (this.paused ? '⏸ 已暫停　' : '') + `已畫 ${filled} / ${total} 格`;
        },

        // =================================================================
        // 繪製
        // =================================================================
        _draw: function (now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);
            if (!this.puzzle) { this._drawWaiting(ctx, now); return; }

            const N = this.puzzle.N, cs = this.cell;

            // ① 白紙底
            ctx.fillStyle = 'hsl(40, 30%, 96%)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

            // ② 已畫上的顏色
            for (let i = 0; i < N * N; i++) {
                const g = this.paint[i];
                if (g < 0) continue;
                ctx.fillStyle = `hsl(${this.hues[g]}, 60%, 62%)`;
                ctx.fillRect((i % N) * cs, ((i / N) | 0) * cs, cs + 0.6, cs + 0.6);
            }

            // ③ 細格線
            ctx.strokeStyle = 'hsla(216, 30%, 30%, 0.22)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let k = 1; k < N; k++) {
                ctx.moveTo(k * cs, 0); ctx.lineTo(k * cs, BOARD_PX);
                ctx.moveTo(0, k * cs); ctx.lineTo(BOARD_PX, k * cs);
            }
            ctx.stroke();

            // ④ 粗邊界：只畫在「兩邊顏色不同」的地方，讓已成形的色塊輪廓分明
            ctx.strokeStyle = 'hsl(216, 48%, 16%)';
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'square';
            ctx.beginPath();
            for (let r = 0; r < N; r++) {
                for (let c = 0; c < N; c++) {
                    const g = this.paint[r * N + c];
                    if (c + 1 < N && this.paint[r * N + c + 1] !== g) {
                        ctx.moveTo((c + 1) * cs, r * cs); ctx.lineTo((c + 1) * cs, (r + 1) * cs);
                    }
                    if (r + 1 < N && this.paint[(r + 1) * N + c] !== g) {
                        ctx.moveTo(c * cs, (r + 1) * cs); ctx.lineTo((c + 1) * cs, (r + 1) * cs);
                    }
                }
            }
            ctx.stroke();
            ctx.strokeRect(1.75, 1.75, BOARD_PX - 3.5, BOARD_PX - 3.5);

            // ⑤ 修正意圖預覽：要刪的鋪紅底、要加的畫綠色虛線框
            this._drawPlan(ctx, now);

            // ⑥ 準備擦掉的格子打上紅色 ✕
            for (const i of this.marks) {
                this._drawCross(ctx, (i % N) * cs + cs / 2, ((i / N) | 0) * cs + cs / 2, cs);
            }

            // ⑦ 提示格的數字「已畫/目標」
            for (let g = 0; g < N; g++) {
                const i = this.puzzle.clues[g];
                this._drawClue(ctx, (i % N) * cs + cs / 2, ((i / N) | 0) * cs + cs / 2, cs,
                    this.counts[g], this.puzzle.sizes[g]);
            }

            // ⑧ 剛動筆的格子的擴散圓環
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
            ctx.fillText('安　排　盤　面', cx, cy);
            ctx.restore();
        },

        /** 修正意圖預覽。⚠️ 一定要「先讓玩家看到要刪哪些、要改畫哪裡」再動手，
         *  否則畫面上只會看到一片顏色突然消失，玩家完全不知道發生什麼事。 */
        _drawPlan: function (ctx, now) {
            if (!this.plan) return;
            const N = this.puzzle.N, cs = this.cell;
            ctx.save();
            // 要刪掉的：鋪一層紅
            ctx.fillStyle = 'hsla(0, 85%, 52%, 0.34)';
            for (const i of this.plan.del) {
                ctx.fillRect((i % N) * cs, ((i / N) | 0) * cs, cs, cs);
            }
            // 要改畫的：綠色流動虛線框
            ctx.strokeStyle = 'hsl(142, 85%, 42%)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 5]);
            ctx.lineDashOffset = -(now / 55) % 11;
            for (const i of this.plan.add) {
                ctx.strokeRect((i % N) * cs + 2.5, ((i / N) | 0) * cs + 2.5, cs - 5, cs - 5);
            }
            ctx.restore();
        },

        /** 準備擦掉：紅色粗叉 */
        _drawCross: function (ctx, x, y, cs) {
            const h = cs * 0.22;
            ctx.save();
            ctx.strokeStyle = 'hsla(0, 92%, 42%, 0.95)';
            ctx.lineWidth = Math.max(2, cs * 0.11);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - h, y - h); ctx.lineTo(x + h, y + h);
            ctx.moveTo(x + h, y - h); ctx.lineTo(x - h, y + h);
            ctx.stroke();
            ctx.restore();
        },

        /** 提示格：白底圓角牌＋「已畫/目標」。畫完時轉成金色，一眼看得出哪些收工了。 */
        _drawClue: function (ctx, x, y, cs, done, target) {
            const w = cs * 0.86, h = cs * 0.44, rr = Math.min(6, cs * 0.12);
            const full = done >= target;
            ctx.save();
            ctx.beginPath();
            const x0 = x - w / 2, y0 = y - h / 2;
            ctx.moveTo(x0 + rr, y0);
            ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, rr);
            ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, rr);
            ctx.arcTo(x0, y0 + h, x0, y0, rr);
            ctx.arcTo(x0, y0, x0 + w, y0, rr);
            ctx.closePath();
            ctx.fillStyle = full ? 'hsla(45, 92%, 88%, 0.97)' : 'hsla(0, 0%, 100%, 0.92)';
            ctx.fill();
            ctx.strokeStyle = full ? 'hsl(38, 80%, 38%)' : 'hsla(216, 45%, 18%, 0.55)';
            ctx.lineWidth = full ? 2 : 1.2;
            ctx.stroke();

            ctx.fillStyle = full ? 'hsl(30, 75%, 26%)' : 'hsl(216, 45%, 18%)';
            ctx.font = `bold ${(cs * 0.26).toFixed(1)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${done}/${target}`, x, y + cs * 0.01);
            ctx.restore();
        },

        _drawFlashes: function (ctx, now) {
            const N = this.puzzle.N, cs = this.cell;
            ctx.save();
            for (let k = this.flashes.length - 1; k >= 0; k--) {
                const f = this.flashes[k];
                // 夾在 [0,1]：now 若因任何理由早於 t0，負數會讓 arc() 收到負半徑而拋例外
                const p = clamp((now - f.t0) / FLASH_MS, 0, 1);
                if (p >= 1) { this.flashes.splice(k, 1); continue; }
                const x = (f.cell % N) * cs + cs / 2, y = ((f.cell / N) | 0) * cs + cs / 2;
                const hue = f.kind === 'place' ? 142 : (f.kind === 'mark' ? 0 : 30);
                ctx.beginPath();
                ctx.arc(x, y, cs * (0.16 + p * 0.44), 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${hue}, 95%, 55%, ${(1 - p) * 0.85})`;
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
                    // ⚠️ 暫停不能只是「不呼叫 _advance」：所有到期時間都是絕對時間戳，
                    //   只跳過推進的話，恢復的瞬間會發現一大批動作全部過期而一次噴完。
                    //   正確做法是把每一個到期時間戳同步往後推 dt。
                    this.nextAt += dt;
                    this.finishedAt += dt;
                    for (const f of this.flashes) f.t0 += dt;
                } else {
                    this._advance(now);
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

        hide: function () { this.stopGame(); },

        stopGame: function () {
            this.active = false;
            this.genToken++;   // 讓還在跑的出題分片自動作廢
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.KaiZhi = KaiZhi;

    if (new URLSearchParams(window.location.search).get('page') === 'kaizhi') {
        const start = () => {
            if (window.KaiZhi) window.KaiZhi.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
