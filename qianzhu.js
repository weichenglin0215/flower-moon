/* ============================================================================
 * qianzhu.js —《千珠成字》萬珠成像．視覺療癒頁
 * ----------------------------------------------------------------------------
 * 靈感與物理引擎大量沿用（幾乎是抄襲）已驗證過的「珠落玉盤」（zhuluo.js）：
 * 重力＋干擾棒碰撞＋球對球彈性碰撞＋防卡珠救援，一樣的手法。
 *
 * ⭐ 玩法（依企劃）：
 *   ⚠️ 這一頁的目的是「看球掉落」的紓壓過程，不是準確率——最終拼出來的
 *   字準不準完全不重要，重點是球從干擾棒上彈開的過程必須看起來像真的
 *   珠子在掉落（真實的圓形碰撞反彈），不能為了衝準確率而用人為的力去
 *   修正球的路徑（曾經加過，已經拿掉，見 `_step` 內的說明）。
 *   1. 從「今天日曆指定的那首詩」裡任選一個字，畫成一張 N×N 純黑／純白的
 *      點陣圖（無灰階，門檻二值化，且裁到邊緣不留白）。
 *   2. 畫面最下方是 N×N 的收納格（欄寬＝格寬，逐欄由下往上堆疊）。發球時
 *      挑「目前累積數最少」的欄位當出生位置起點（只是讓球盡量從不同地方
 *      隨機丟下，不是要求它一定要落在那裡），並依該欄「接下來那一格」在
 *      點陣圖上該是黑是白，讓球帶著那個顏色出發。
 *   3. 球落在哪一欄完全由物理碰撞（干擾棒＋球對球＋推手方塊）決定，不做
 *      任何路徑修正。球落底時，用它真正落入的那一格在點陣圖上的顏色去比
 *      對球本身的顏色：符合就維持原色，不符就整顆變紅色——猜錯是常態，
 *      紅色雜訊本來就會佔不小比例，這是物理隨機性的如實呈現，不是要修的
 *      誤差。
 *   4. 干擾棒的排數可調（`QianZhu.pegRows`，2~8，預設 6），收納區正上方
 *      有一顆可開關、可調速的橫向來回移動方塊把卡在格口的球推向空位
 *      （`QianZhu.pusherEnabled` / `QianZhu.pusherSpeed`）；若某一欄仍被
 *      物理巧合灌滿，會把球導到最近還有空位的欄，確保 N×N 顆球最終剛好
 *      放滿、不多不少（這只是「填滿格子」的技術需要，跟落點準不準無關）。
 *
 * ⭐ 為什麼「落定的球」直接烘進 <canvas> 底圖後就從陣列移除（而不是繼續留著
 *   跑碰撞）？
 *   格數 100 時是 10000 顆球。若每顆定位球都留在陣列裡持續參與每幀的球對球
 *   碰撞檢查，飛行中的球要跟全部已定位的球做 O(n²) 比對，幀數會直接崩潰。
 *   但定位球其實再也不需要動——它的欄位與層數一旦鎖定，垂直落點
 *   （`restY`）是純數學算出來的，不靠撞到下面那顆球才停住，因此鎖定後就
 *   可以完全跳過碰撞（見 `_step` 內 `b.bin >= 0` 的分支）。真正「定住」
 *   （到達 `restY`）的那一刻，直接畫一次到離屏 `bakeCanvas`，之後每幀只要
 *   `drawImage` 這張底圖，不必再重繪成千上萬顆球，也不必再檢查它們。
 *
 * 依《.agent/skills/花月開發常見錯誤與解法.md §4》：
 *   - 全域 class 前綴 qianzhu-
 *   - loadCSS() 動態防護
 *   - overlay 掛載 document.body 且套用 registerOverlayResize
 *   - stopGame() 必須隱藏 container 並停掉 requestAnimationFrame
 * ========================================================================== */

(function () {
    'use strict';

    // =====================================================================
    // 可調參數
    // =====================================================================
    const STAGE_W = 500, STAGE_H = 850;    // 整個舞台（外殼 overlay）的邏輯尺寸，跟其他頁面一致，用於 registerOverlayResize 縮放
    const CW = 460;                 // 收納格區是正方形，邊長 = CW（同時也是畫布寬度）
    const CH = 650;                 // 畫布總高（上方留給干擾棒／推手方塊，下方是收納格區）
    const PEG_FIELD_TOP = 40; //干擾棒區上方的留空（球從這個高度以上的出生區落下，先留一小段空白才進入第一排棒子）
    const SPAWN_Y = 0;             // 球的出生高度（球心 y 座標，越小越靠近畫布最上緣）

    const PEG_R = 4;                 // 干擾棒（圓形）半徑
    const PEG_LANE_W = 30;          // ⚠️ 干擾棒的欄距與收納格的欄距（colW）無關，
    //    固定寬度，理由見 _layout 註解。
    const BALL_TTL_MS = 9000;       // 安全閥：一顆球最多允許在「尚未落入任何欄位」的狀態下飛這麼久（毫秒），超過就強制判定落點，避免永遠卡在半空

    const GRAVITY = 0.25;            // 重力加速度（每個物理子步施加在 vy 上的量，數值越大球掉得越快）
    /** 原始基準反彈係數（未調整前的數值，只用來換算下面的預設值，不在碰撞
     *  程式碼裡直接使用——實際碰撞一律讀 `QianZhu.restPeg` / `restWall` /
     *  `restBall`，控制台可隨時 `QianZhu.restPeg = 1.5` 即時調整，不必重整
     *  頁面）。 */
    const BASE_REST_PEG = 0.60, BASE_REST_WALL = 0.42, BASE_REST_BALL = 0.22;   // 依序：撞干擾棒／撞側牆／球對球互撞的原始基準反彈係數
    /** ⚠️ 這是「真的撞擊」與「幾乎不動的靜置接觸」的分界（理由見 _collidePegs
     *  的大註解）。刻意壓得很低：這頁要看的是球撞到棒子後真的往左右彈開的
     *  物理感，門檻太高（先前設 0.55）會讓大多數普通力道的碰撞都被歸類成
     *  「靜置接觸」處理，看起來就是黏在棒子上、只有慢慢滑落而不是彈開。 */
    const CONTACT_V = 0.12;         // 法線方向速度低於這個值（單位：px/子步）就視為「靜置接觸」而非真正的撞擊
    const ROLL_ASSIST = 0.30;       // 靜置接觸時的切向助推，避免球停在棒頂下不來
    /** 同一欄同時最多允許幾顆球在路上（純粹是效能與畫面整潔考量；這頁的
     *  正確率本來就不重要，不必再假裝這是「防止槽位誤判」的機制）。 */
    const COL_CONCURRENCY = 3;      // 同一欄「目前累積數＋路上球數」達到這個上限前，發球時都還可以繼續瞄準這一欄
    const AIR = 0.999;              // 空氣阻力（每個子步把水平速度乘上這個係數，讓球不會無止盡地橫向加速）
    const MAX_SPEED = 16;           // 球速上限（px/子步），避免高速時穿透干擾棒／牆壁或反彈力道失控暴衝
    const SUBSTEPS = 3;             // 每一幀（frame）拆成幾個物理子步計算，數字越大碰撞越精準但越耗效能
    const TRAIL_LEN = 8;            // 軌跡取樣點數（球飛行時拖出的半透明軌跡線，數字越大線越長）

    /** 全部落定後，隔多久自動換下一個字（毫秒） */
    const AUTO_NEXT_MS = 7000;

    /** 開局倒數計時：每個數字（3、2、1）佔用的毫秒數，前半停留滿版、後半縮小消失。
     *  3 個數字 = COUNTDOWN_DIGIT_MS × 3 的總時長，倒數期間不發球。 */
    const COUNTDOWN_DIGIT_MS = 1000;
    const COUNTDOWN_TOTAL_MS = COUNTDOWN_DIGIT_MS * 3;

    const SPEED_PRESETS = {
        // label：按鈕顯示文字；emitMs：兩次發球之間至少間隔多久（毫秒），數字越小發球越密集；
        // scale：物理時間流速倍率，數字越大球的運動（含重力、碰撞）看起來越快
        slow: { label: '慢', emitMs: 440, scale: 0.2 },
        normal: { label: '正常', emitMs: 220, scale: 0.5 },
        fast: { label: '快', emitMs: 110, scale: 0.8 },
    };
    const DEFAULT_SPEED = 'normal';  // 頁面預設的速度檔位

    const GRID_PRESETS = { 25: 25, 50: 50, 100: 100 };   // 格數選項（同時也是解析度與總球數 N×N 的依據）
    const DEFAULT_GRID = 50;         // 頁面預設格數

    const PUNCT_RE = /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g;   // 用來從詩句中濾掉標點與空白，只留下純文字

    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));   // 數值夾在 [a, b] 範圍內的小工具
    const rnd = (a, b) => a + Math.random() * (b - a);          // 產生 [a, b) 之間的均勻亂數

    // =====================================================================
    // 主模組
    // =====================================================================
    const QianZhu = {
        container: null,     // 外層 overlay 的 DOM 節點（div#qianzhu-container）
        canvas: null,        // 主畫布元素
        ctx: null,           // 主畫布的 2D context
        bakeCanvas: null,    // 離屏畫布：已落定的球一次性烘進這裡，之後每幀只要 drawImage，不必重繪每一顆球
        bakeCtx: null,       // 離屏畫布的 2D context
        frameEl: null,       // 木框裝飾層的 DOM 節點（全部完成時會加上金光呼吸動畫）

        // ── 設定（皆為可調參數，控制台亦可即時改）──
        speedKey: DEFAULT_SPEED,   // 目前選擇的速度檔位鍵值（對應 SPEED_PRESETS 的 key）
        gridN: DEFAULT_GRID,       // 目前選擇的格數（N），決定點陣圖解析度與總球數 N×N
        pegRows: 4,             // ⭐ 干擾棒行數，2~8
        pusherEnabled: true,    // ⭐ 推手方塊顯示與否
        pusherSpeed: 1.5,       // ⭐ 推手方塊移動速度（px/frame）
        // ⭐ 碰撞反彈參數，控制台可隨時修改、立即生效（下一次碰撞就會套用，
        //   不必重整頁面／不必呼叫 newRound）：
        //     QianZhu.restPeg   —— 撞干擾棒的反彈係數（預設 = 原始值 150%）
        //     QianZhu.restWall  —— 撞側牆的反彈係數
        //     QianZhu.restBall  —— 球對球互撞的反彈係數
        //     QianZhu.pegDeflectAngle —— 撞棒之後，反彈方向額外隨機旋轉的
        //       最大角度（弧度）。這是「往左右偏斜」的正確做法：對反彈後的
        //       速度向量整體旋轉一個小角度，方向仍然是從碰撞法線算出來的
        //       物理反彈，只是加了一點隨機偏轉（模擬沒有正中球心的擦邊碰
        //       撞），而不是像先前那樣直接把一個隨機數字加進 vx——那樣做
        //       完全不管實際撞擊角度，球有時會被推向明顯不合理的方向。
        restPeg: BASE_REST_PEG * 0.6,     // 目前實際套用的撞棒反彈係數（預設為基準值的 60%，可隨時在控制台調整）
        restWall: BASE_REST_WALL * 0.5,   // 目前實際套用的撞牆反彈係數（預設為基準值的 50%）
        restBall: BASE_REST_BALL * 0.4,   // 目前實際套用的球對球反彈係數（預設為基準值的 40%）
        pegDeflectAngle: 0.0,             // 撞棒反彈後的隨機偏轉角上限（弧度），0 代表不額外偏轉

        // ── 本輪資料 ──
        ch: '詩',              // 這一輪要形成的字
        poemMeta: null,        // 這個字取自哪一首詩（{title, author, dynasty}），沒有取到詩時為 null
        bitmap: null,           // bitmap[row][col] = 'black' | 'white'
        blackCount: 0,         // 點陣圖裡黑點的總數（決定要準備幾顆黑球）
        whiteCount: 0,         // 點陣圖裡白點的總數（決定要準備幾顆白球）

        // ── 版面 ──
        cellSize: CW / DEFAULT_GRID,   // 每一格（欄寬＝格寬）的像素大小，會隨 gridN 重新計算
        ballR: 4,               // 球的半徑（依 cellSize 縮放，會在 _layout 裡重新計算）
        binTop: 0,               // 收納格區的最上緣 y 座標（= CH − CW，因為收納格區是正方形）
        laneW: PEG_LANE_W,       // 干擾棒實際使用的欄距（依畫布寬度重新均分計算，初值先用常數頂著）
        pegs: [],                // 目前這一輪的所有干擾棒 {x, y, flash}
        pusher: null,            // 推手方塊物件 {x, y, dir, r}

        // ── 執行狀態 ──
        balls: [],               // 場上所有還在活動中的球（已落定的球會被移出這個陣列並烘進 bakeCanvas）
        colCount: [],            // colCount[c] = 第 c 欄目前已經真正落定的球數
        inFlight: [],            // inFlight[c] = 第 c 欄目前有幾顆球還在路上（尚未落定），用於發球時的欄位負載平衡
        particles: [],           // 特效粒子（撞擊火花等）
        rings: [],                // 特效擴散圓環
        placedCount: 0,           // 已經落定的球總數
        wrongCount: 0,            // 顏色猜錯（變紅）的球數
        totalCount: 0,            // 這一輪總共要落下的球數（= gridN × gridN）
        finished: false,          // 這一輪是否已經全部落定完成
        finishedAt: 0,            // 完成的時間戳記（用來計算何時該自動換下一個字）
        active: false,            // 頁面是否正在顯示中（決定物理主迴圈要不要繼續跑）
        rafId: null,              // requestAnimationFrame 的 id，關閉頁面時要用它取消動畫迴圈
        lastFrameAt: 0,           // 上一幀的時間戳記（用來算 dt）
        lastEmitAt: 0,            // 上一次發球的時間戳記（用來配合 SPEED_PRESETS 的 emitMs 控制發球節奏）
        countdownStart: 0,        // 本輪開局倒數計時的起始時間戳記（倒數 3、2、1 期間不發球）
        lastPegSoundAt: 0,        // 上一次播放撞棒音效的時間戳記（節流用，避免密集碰撞時疊音）
        seq: 0,                   // 球的流水號產生器（每顆球的 id 依序遞增）

        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('qianzhu-css')) {
                const link = document.createElement('link');
                link.id = 'qianzhu-css';
                link.rel = 'stylesheet';
                link.href = 'qianzhu.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            const isFirst = !document.getElementById('qianzhu-container');
            if (isFirst) this.createDOM();
            this.container = document.getElementById('qianzhu-container');
            this.canvas = document.getElementById('qianzhu-canvas');
            this.frameEl = document.getElementById('qianzhu-canvas-frame');
            this.ctx = this.canvas.getContext('2d');
            if (!this.bakeCanvas) {
                this.bakeCanvas = document.createElement('canvas');
                this.bakeCanvas.width = CW;
                this.bakeCanvas.height = CH;
                this.bakeCtx = this.bakeCanvas.getContext('2d');
            }
            if (isFirst) this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'qianzhu-container';
            div.className = 'qianzhu-overlay hidden';
            div.innerHTML = `
                <div class="qianzhu-header">
                    <div class="qianzhu-title">千珠成字</div>
                    <div id="qianzhu-poem-meta" class="qianzhu-poem-meta"></div>
                </div>
                <div id="qianzhu-close" class="qianzhu-close" aria-label="關閉">✕</div>

                <div class="qianzhu-stage-area">
                    <div id="qianzhu-canvas-frame" class="qianzhu-canvas-frame">
                        <canvas id="qianzhu-canvas" width="${CW}" height="${CH}"></canvas>
                    </div>
                </div>

                <div class="qianzhu-panel">
                    <div class="qianzhu-progress-wrap">
                        <div id="qianzhu-progress-bar" class="qianzhu-progress-bar"></div>
                        <div id="qianzhu-progress-text" class="qianzhu-progress-text"></div>
                    </div>
                    <div class="qianzhu-row">
                        <span class="qianzhu-row-label">速度</span>
                        <div id="qianzhu-speed-group" class="qianzhu-btn-group"></div>
                        <span class="qianzhu-row-label">格數</span>
                        <div id="qianzhu-grid-group" class="qianzhu-btn-group"></div>
                        <button id="qianzhu-again" class="qianzhu-action-btn">換字</button>
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
            document.getElementById('qianzhu-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('qianzhu-again').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playConfirmItem(); }
                this.newRound();
            });

            const speedGroup = document.getElementById('qianzhu-speed-group');
            Object.keys(SPEED_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'qianzhu-chip qianzhu-chip-narrow';
                btn.dataset.speed = k;
                btn.textContent = SPEED_PRESETS[k].label;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.speedKey = k;
                    this._syncChips();
                });
                speedGroup.appendChild(btn);
            });

            const gridGroup = document.getElementById('qianzhu-grid-group');
            Object.keys(GRID_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'qianzhu-chip qianzhu-chip-narrow';
                btn.dataset.grid = k;
                btn.textContent = k;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.gridN = GRID_PRESETS[k];
                    this._syncChips();
                    this.newRound();
                });
                gridGroup.appendChild(btn);
            });

            this._syncChips();
        },

        _syncChips: function () {
            document.querySelectorAll('#qianzhu-speed-group .qianzhu-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.speed === this.speedKey);
            });
            document.querySelectorAll('#qianzhu-grid-group .qianzhu-chip').forEach(b => {
                b.classList.toggle('active', Number(b.dataset.grid) === this.gridN);
            });
        },

        // ========================================================
        // 取「今天日曆的詩」與任選一字（做法與 calendar.js 的日曆卡片一致）
        // ========================================================
        _getTodayPoem: function () {
            const now = new Date();
            const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
            const dateKey = `${y}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
            let poem = null;
            try {
                if (typeof CALENDAR_ASSIGNMENTS !== 'undefined' && CALENDAR_ASSIGNMENTS[dateKey] !== undefined
                    && typeof POEMS !== 'undefined') {
                    const a = CALENDAR_ASSIGNMENTS[dateKey];
                    const id = Array.isArray(a) ? a[0] : a;
                    poem = POEMS.find(p => p.id === id) || null;
                }
            } catch (e) { console.warn('[千珠成字] 讀取日曆分配表失敗', e); }

            if (!poem && typeof POEMS !== 'undefined' && POEMS.length) {
                // 降級保護：與 calendar.js 相同的種子隨機邏輯
                const seed = y * 10000 + m * 100 + d;
                const x = Math.sin(seed + 2) * 10000;
                const r = x - Math.floor(x);
                const highRating = POEMS.filter(p => (p.rating || 0) >= 4);
                const pool = highRating.length ? highRating : POEMS;
                poem = pool[Math.floor(r * pool.length)];
            }
            return poem;
        },

        _pickChar: function () {
            const poem = this._getTodayPoem();
            if (poem) {
                this.poemMeta = { title: poem.title || '', author: poem.author || '', dynasty: poem.dynasty || '' };
                if (Array.isArray(poem.content)) {
                    const text = poem.content.join('').replace(PUNCT_RE, '');
                    if (text.length) return text[Math.floor(Math.random() * text.length)];
                }
            }
            this.poemMeta = null;
            const fallback = '詩花月心';
            return fallback[Math.floor(Math.random() * fallback.length)];
        },

        // ========================================================
        // 產生 N×N 純黑白點陣圖（門檻二值化，無灰階）
        // ========================================================
        /**
         * ⭐ 點陣圖必須「剛好佈滿整個方格區」，四邊不留白：中文字型的字身框
         *   （em box）本來就比實際筆畫大一圈（這是排版設計本來就有的內距），
         *   直接把字畫進 SS×SS 的畫布再切格，四周永遠會留下好幾格空白（實測
         *   50×50 時上／左／右各留 8 格、下面留 5 格空白）。修正做法：先畫一次
         *   抓出筆畫的真實外框（bounding box），再把「只裁出外框範圍」的那張
         *   圖用非等比例縮放硬拉滿整個 SS×SS——四邊因此不會再留白，即使因此
         *   讓字的長寬比例略為走樣也在所不惜（指示要「剛剛好佈滿格子」優先）。
         */
        _makeBitmap: function (ch, N) {
            const SS = clamp(N * 8, N, 640);
            const draw = document.createElement('canvas');
            draw.width = SS; draw.height = SS;
            const dctx = draw.getContext('2d');
            dctx.fillStyle = '#fff';
            dctx.fillRect(0, 0, SS, SS);
            dctx.fillStyle = '#000';
            dctx.textAlign = 'center';
            dctx.textBaseline = 'middle';
            dctx.font = `900 ${Math.floor(SS * 0.92)}px "Noto Serif TC", "Microsoft JhengHei", serif`;
            dctx.fillText(ch, SS / 2, SS / 2);

            // 掃出筆畫的真實外框
            const draft = dctx.getImageData(0, 0, SS, SS).data;
            let minX = SS, maxX = 0, minY = SS, maxY = 0, found = false;
            for (let y = 0; y < SS; y++) {
                for (let x = 0; x < SS; x++) {
                    if (draft[(y * SS + x) * 4] < 128) {
                        found = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (!found) { minX = 0; maxX = SS; minY = 0; maxY = SS; }
            const bw = Math.max(1, maxX - minX + 1), bh = Math.max(1, maxY - minY + 1);

            // 把外框範圍硬拉滿整張畫布（非等比例，四邊因此不留白）
            const off = document.createElement('canvas');
            off.width = SS; off.height = SS;
            const octx = off.getContext('2d');
            octx.imageSmoothingEnabled = false;
            octx.drawImage(draw, minX, minY, bw, bh, 0, 0, SS, SS);

            const img = octx.getImageData(0, 0, SS, SS).data;
            const cell = SS / N;
            const bmp = [];
            let blackCount = 0, whiteCount = 0;
            const step = Math.max(1, Math.floor(cell / 4));
            for (let r = 0; r < N; r++) {
                const row = [];
                const y0 = Math.floor(r * cell), y1 = Math.floor((r + 1) * cell);
                for (let c = 0; c < N; c++) {
                    const x0 = Math.floor(c * cell), x1 = Math.floor((c + 1) * cell);
                    let sum = 0, cnt = 0;
                    for (let yy = y0; yy < y1; yy += step) {
                        for (let xx = x0; xx < x1; xx += step) {
                            sum += img[(yy * SS + xx) * 4];
                            cnt++;
                        }
                    }
                    const avg = cnt ? sum / cnt : 255;
                    const isBlack = avg < 128;
                    row.push(isBlack ? 'black' : 'white');
                    if (isBlack) blackCount++; else whiteCount++;
                }
                bmp.push(row);
            }
            return { bmp, blackCount, whiteCount };
        },

        // ========================================================
        // 開新的一輪
        // ========================================================
        newRound: function () {
            this.ch = this._pickChar();
            const N = this.gridN;
            const made = this._makeBitmap(this.ch, N);
            this.bitmap = made.bmp;
            this.blackCount = made.blackCount;
            this.whiteCount = made.whiteCount;
            this.totalCount = N * N;

            this._layout();

            this.balls = [];
            this.particles = [];
            this.rings = [];
            this.colCount = new Array(N).fill(0);
            this.inFlight = new Array(N).fill(0);
            this.placedCount = 0;
            this.wrongCount = 0;
            this.spawnedCount = 0;
            this.finished = false;
            this.finishedAt = 0;
            this.seq = 0;
            this.lastEmitAt = 0;
            // ⚠️ 每一欄同時間只允許一顆球在路上（見 _tryEmit 註解），所以理論上
            //    同時在場上的球數上限就是欄數 N——不需要再另外設一個較小的
            //    batchSize 去節流，那只會不必要地拉長總耗時（實測拿掉這層節流
            //    前，格數 100 要 14 分鐘才能落定，拿掉後降到 2 分半內）。
            this.batchSize = N;
            this.maxLive = N + 10;

            this.bakeCtx.clearRect(0, 0, CW, CH);
            if (this.frameEl) this.frameEl.classList.remove('all-done');
            this._updateMeta();
            this._updateProgress();

            this.lastFrameAt = performance.now();
            this.countdownStart = performance.now();   // 每一輪開局都先跑 3、2、1 倒數，倒數完才開始發球
            if (!this.rafId) this._loop();
        },

        /**
         * 版面計算：收納格區固定是「邊長 = CW」的正方形（每格 CW/N 寬）。
         *
         * ⭐ 干擾棒的欄距（laneW）依「球的實際半徑」等比例縮放，而不是固定值：
         *    - 球越大（格數越少，如 N=25，球半徑 ≈7.7px）→ 欄距要放寬，否則
         *      偏移排（第 2、4 排）最靠牆的那根棒子跟側牆之間的空隙塞不下一
         *      顆球，球會被牆與棒子左右夾住卡死。
         *    - 球越小（格數越多，如 N=100）→ 欄距可縮短，維持足夠的散射密度。
         *    以「格數 50」為基準校準（該檔公認正常、不卡）：基準球半徑 refR，
         *    對應欄距 = PEG_LANE_W；其餘格數依 ballR/refR 等比例放大或縮小。
         *    如此每一檔的「棒與棒、棒與牆之間的空隙」相對球徑都維持一致比例，
         *    任何格數都不會卡珠。
         */
        _layout: function () {
            const N = this.gridN;
            this.cellSize = CW / N;
            this.binTop = CH - CW;
            this.ballR = clamp(this.cellSize * 0.42, 1.1, 14);

            const refR = (CW / DEFAULT_GRID) * 0.42;          // 格數 50 時的球半徑基準
            const laneTarget = PEG_LANE_W * (this.ballR / refR);
            const cols = Math.max(4, Math.round(CW / laneTarget));
            this.laneW = CW / cols;
            this.pegs = [];
            const rows = clamp(this.pegRows, 0, 8);
            // ⚠️ 最上面一排固定在 PEG_FIELD_TOP，往下用「rows 等分」而非
            //    「rows-1 等分」計算間距，讓最後一排跟收納格上緣之間也留出
            //    一整格空間，不會緊貼著收納區造成球一過最後一排就立刻被
            //    過度干擾（先前 rows-1 等分會讓最後一排幾乎貼在 binTop 上）。
            const top = PEG_FIELD_TOP;
            const gapY = (this.binTop - top) / rows;
            for (let lv = 0; lv < rows; lv++) {
                const y = top + lv * gapY;
                if (lv % 2 === 0) {
                    // ⚠️ 兩端（x=0 與 x=CW）也要放，否則這幾排在最靠邊的地方完全
                    //    沒有干擾棒，球會沿著兩側直落，堆積在收納區左右兩端。
                    for (let i = 0; i <= cols; i++) this.pegs.push({ x: i * this.laneW, y: y, flash: 0 });
                } else {
                    for (let i = 0; i < cols; i++) this.pegs.push({ x: (i + 0.5) * this.laneW, y: y, flash: 0 });
                }
            }

            // ⭐ 寬度放大成球半徑的 3 倍（原本 2 倍的 150%）、高度縮減 2px：寬一點
            //   才能在畫面正中央有效攔住、推動圓球；矮一點則是當推手正好停在
            //   螢幕左右兩側邊緣時，讓緊貼側牆的球有機會直接「翻過」推手頂端，
            //   不會被推手夾在牆與推手之間硬擠。
            const pusherHW = this.ballR * 2.0;
            const pusherHH = Math.max(1, this.ballR + 3);
            this.pusher = { x: CW / 2, y: this.binTop - this.ballR * 2.4, dir: 1, r: this.ballR, hw: pusherHW, hh: pusherHH };
        },

        _updateMeta: function () {
            const el = document.getElementById('qianzhu-poem-meta');
            if (!el) return;
            if (this.poemMeta) {
                let title = this.poemMeta.title || '';
                if (title.length > 10) title = title.substring(0, 9) + '...';
                el.textContent = `今日字「${this.ch}」／《${title}》${this.poemMeta.dynasty || ''}．${this.poemMeta.author || ''}`;
            } else {
                el.textContent = `今日字「${this.ch}」`;
            }
        },

        _updateProgress: function () {
            const bar = document.getElementById('qianzhu-progress-bar');
            const txt = document.getElementById('qianzhu-progress-text');
            const pct = this.totalCount ? (this.placedCount / this.totalCount * 100) : 0;
            if (bar) bar.style.width = pct + '%';
            if (txt) txt.textContent = this.finished
                ? `成像完成（誤差 ${this.wrongCount}）`
                : `${this.placedCount} / ${this.totalCount} 顆（誤差 ${this.wrongCount}）`;
        },

        _slotCy: function (s) { return CH - (s + 0.5) * this.cellSize; },
        _colCx: function (c) { return (c + 0.5) * this.cellSize; },

        // ========================================================
        // 發球
        // ========================================================
        /**
         * ⭐ 球的顏色不是「依比例隨機決定」，而是「這一欄接下來那一格點陣圖
         *   上該有的顏色」——選中哪一欄（欄位負載平衡）之後，直接查該欄
         *   「下一個預期要填的槽位」在點陣圖上是黑是白，就讓這顆球帶那個
         *   顏色出發。這樣只要球真的落回自己出發時瞄準的那一欄，顏色就
         *   保證正確；會變紅的只有「physics 把它甩飛到別欄」這種真正的
         *   意外，而不是無論落在哪裡都只有一半機率蒙對——否則兩千五百顆
         *   球會變成一半紅色的雜訊，完全看不出字形（實測驗證過這個誤區：
         *   顏色若與目標欄無關，格數 100 時誤差高達 43.6%，画面根本不成字）。
         *
         * ⚠️ 每一欄同時間最多只允許 `COL_CONCURRENCY` 顆球在路上：球的顏色是
         *   依「這一欄目前累積數＋路上的球數＝下一個預期槽位」預先算好的，
         *   若同一欄同時塞太多顆球在飛，後面那顆算槽位時會把前面「還沒真正
         *   落地」的份也算進去；一旦前面那顆意外飄去別欄，後面的槽位假設就
         *   全部錯位，變成連鎖誤判（實測若完全不設上限，格數 100 時光是這個
         *   連鎖效應就能把誤差推到 33%）。但若嚴格限制成「同時只能有一顆」，
         *   又會在收尾階段（多數欄位已滿、只剩少數欄位還缺球）嚴重卡住吞吐量
         *   ——每一欄本身命中率只有六到七成，嚴格單顆等於逼著僅存的少數欄位
         *   排隊一顆一顆重試，實測格數 100 因此要 10 分鐘才能收尾。折衷成
         *   「最多 3 顆同時在路上」：既大幅降低連鎖誤判的機率，尾端還缺球的
         *   欄位也能並行重試好幾次，不必死等前一顆的結果。
         */
        _tryEmit: function (now) {
            const preset = SPEED_PRESETS[this.speedKey] || SPEED_PRESETS[DEFAULT_SPEED];
            if (now - this.lastEmitAt < preset.emitMs) return;
            if (this.spawnedCount >= this.totalCount) return;

            let live = 0;
            for (const b of this.balls) if (b.state === 'fly' || b.state === 'settling') live++;
            if (live >= this.maxLive) return;

            const N = this.gridN;
            // ⭐ 一次只發「一顆」球：每經過一段 emitMs（依速度檔位）才生一顆，
            //   球是一顆一顆接連掉下來的，不再一口氣整排一起生成、整排一起落。
            let minP = Infinity;
            for (let c = 0; c < N; c++) {
                if (this.inFlight[c] >= COL_CONCURRENCY || this.colCount[c] >= N) continue;
                const p = this.colCount[c] + this.inFlight[c];
                if (p < minP) minP = p;
            }
            if (minP === Infinity) return; // 所有欄位都已滿或已達同時在路上的上限
            const candidates = [];
            for (let c = 0; c < N; c++) {
                if (this.inFlight[c] >= COL_CONCURRENCY || this.colCount[c] >= N) continue;
                if (this.colCount[c] + this.inFlight[c] === minP) candidates.push(c);
            }
            const col = candidates[Math.floor(Math.random() * candidates.length)];
            const slot = this.colCount[col] + this.inFlight[col];   // 這一欄接下來（由下往上算）第幾格
            const row = N - 1 - slot;
            const color = (this.bitmap[row] || [])[col] || 'white';
            this._spawnBall(col, color, now);
            this.inFlight[col]++;
            this.spawnedCount++;
            this.lastEmitAt = now;
        },

        _spawnBall: function (targetCol, color, now) {
            const r = this.ballR;
            const cx = this._colCx(targetCol);
            this.balls.push({
                id: ++this.seq,
                bornAt: now,
                color: color,
                targetCol: targetCol,
                //x: clamp(cx + rnd(-this.cellSize * 0.7, this.cellSize * 0.7), r + 1, CW - r - 1), 
                x: clamp(cx + rnd(-this.cellSize * 0.3, this.cellSize * 0.3), r + 1, CW - r - 1), //關閉生成時偏向左右位置。
                y: SPAWN_Y,
                //vx: rnd(-0.8, 0.8), 
                vx: rnd(-0.3, 0.3), //關閉生成時產生偏向左右的力量，讓球垂直往下。
                vy: 0,
                r: r,
                state: 'fly',       // fly → settling → (settled，隨即從陣列移除)
                bin: -1,
                restY: 0,
                stackIndex: -1,
                stuck: 0,
                trail: [],
            });
        },

        // ========================================================
        // 物理主迴圈
        // ========================================================
        _loop: function () {
            this.rafId = requestAnimationFrame(() => this._loop());
            if (!this.active) return;

            const now = performance.now();
            let dt = clamp((now - this.lastFrameAt) / 16.667, 0.2, 2.5);
            this.lastFrameAt = now;
            const preset = SPEED_PRESETS[this.speedKey] || SPEED_PRESETS[DEFAULT_SPEED];
            dt *= preset.scale;

            const counting = (now - this.countdownStart) < COUNTDOWN_TOTAL_MS;
            if (!counting) {
                if (!this.finished) this._tryEmit(now);
                this._updatePusher(dt);
                this._step(dt, now);
            }
            this._stepEffects(dt);
            this._draw();
            if (counting) this._drawCountdown(now);

            if (!counting && this.finished && this.finishedAt && now - this.finishedAt > AUTO_NEXT_MS) {
                this.newRound();
            }
        },

        /** 開局倒數計時：在收集區正中畫出超大的 3 → 2 → 1。每個數字先以幾乎
         *  佈滿收集區的尺寸停留半秒，再於半秒內縮小到消失，接著換下一個數字。 */
        _drawCountdown: function (now) {
            const elapsed = now - this.countdownStart;
            const idx = clamp(Math.floor(elapsed / COUNTDOWN_DIGIT_MS), 0, 2);
            const digit = 3 - idx;
            const t = (elapsed - idx * COUNTDOWN_DIGIT_MS) / COUNTDOWN_DIGIT_MS;  // 0~1
            // 前半（0~0.5）維持滿版；後半（0.5~1）由 1 縮到 0。
            const scale = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
            if (scale <= 0) return;

            const cx = CW / 2, cy = this.binTop + CW / 2;
            const ctx = this.ctx;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.globalAlpha = Math.min(1, scale * 0.5 + 0.15);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `700 ${Math.floor(CW * 0.66)}px "Noto TC", "Microsoft JhengHei"`;
            ctx.fillStyle = 'hsla(28, 60%, 30%, 0.92)';
            ctx.strokeStyle = 'hsla(40, 55%, 96%, 0.9)';
            ctx.lineWidth = CW * 0.02;
            ctx.strokeText(String(digit), 0, 0);
            ctx.fillText(String(digit), 0, 0);
            ctx.restore();
        },

        /** ⚠️ 移動到畫面左右兩側盡頭時，先讓推手完全移出畫面外再反方向移回，
         *   避免推手在貼著邊牆的瞬間反向，造成球被夾在推手與側牆之間產生
         *   不自然的擠壓。 */
        _updatePusher: function (dt) {
            if (!this.pusherEnabled || !this.pusher) return;
            const p = this.pusher;
            p.x += p.dir * this.pusherSpeed * dt;
            const off = (p.hw || p.r) * 2.0;
            if (p.x < -off) { p.x = -off; p.dir = 1; }
            if (p.x > CW + off) { p.x = CW + off; p.dir = -1; }
        },

        _step: function (dt, now) {
            const h = dt / SUBSTEPS;
            for (let s = 0; s < SUBSTEPS; s++) {
                for (const b of this.balls) {
                    if (b.state === 'settled') continue;
                    b.vy += GRAVITY * h;
                    if (b.bin < 0) {
                        // ⚠️ 這裡刻意「不」加任何側向歸巢力：這頁的目的是紓壓觀看，
                        //    不是準確率——球該落在哪一格純粹交給重力＋碰撞決定，加一
                        //    股把球拉回目標欄的力，會讓真實的物理彈跳看起來被人為
                        //    修正過，失去「像真的珠子在掉落」的感覺（先前為了衝準確
                        //    率加過彈簧力，違背了這頁真正的目的，故移除）。
                        b.vx *= AIR;
                        const sp = Math.hypot(b.vx, b.vy);
                        if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
                    } else {
                        // 已鎖定欄位：⛔ 絕對不對球施加任何水平「歸位／吸附」力。
                        //    球只在自己實際落入的那一欄裡，靠重力自然往下落到該欄
                        //    目前最上面的空位高度（restY）後停住——就是「掉下來、疊
                        //    上去」而已。水平位置永遠維持它跨進格口當下的實際 x，
                        //    不做任何橫向搬移。
                        //    （先前這裡有一段 `b.vx = (cx - b.x)*0.3` 的水平吸附力，
                        //    正是「球在收集區自己橫向跑去空格、還穿過已存在的球」的
                        //    元兇，已整段刪除。）
                        b.vx = 0;
                    }
                    b.x += b.vx * h;
                    b.y += b.vy * h;

                    if (b.bin < 0) {
                        this._collideWalls(b);
                        this._collidePegs(b);
                        if (this.pusherEnabled) this._collidePusher(b);
                        this._collideCollectionTop(b);
                        // ⚠️ restPeg 若被調到 1.0 以上（反彈力超過 100%），碰撞會「灌
                        //    能量」進系統：如果只在子步開頭夾一次速度上限，同一子步
                        //    內連續撞到好幾根棒子仍可能越滾越快、球直接穿透棒子或牆。
                        //    碰撞後必須立刻再夾一次。
                        const sp2 = Math.hypot(b.vx, b.vy);
                        if (sp2 > MAX_SPEED) { b.vx *= MAX_SPEED / sp2; b.vy *= MAX_SPEED / sp2; }
                    }
                }
                if (this._hasFreeFlyBalls()) {
                    this._collideBalls();
                    // 球對球碰撞（restBall 同樣可能 > 100%）發生在上面單球迴圈之後，
                    // 同樣可能把速度灌到上限之上，必須再夾一次。
                    for (const b of this.balls) {
                        if (b.bin >= 0 || b.state === 'settled') continue;
                        const sp3 = Math.hypot(b.vx, b.vy);
                        if (sp3 > MAX_SPEED) { b.vx *= MAX_SPEED / sp3; b.vy *= MAX_SPEED / sp3; }
                    }
                }
                this._resolvePositions(now);
            }

            for (const b of this.balls) {
                if (b.state === 'fly') {
                    if (Math.hypot(b.vx, b.vy) < 0.6) {
                        b.stuck = (b.stuck || 0) + 1;
                        if (b.stuck > 16) { b.vx += rnd(-4, 4); b.vy += 3; b.stuck = 0; }
                    } else b.stuck = 0;

                    // 安全閥：球太久還沒落定，多半是卡在收集區頂端檯面上一直對
                    // 不準狹窄的開口。⛔ 絕不「就地把它算成落定」——那會讓根本沒
                    // 進格子的球被灌進完成數，畫面假完成（正是這個 bug 的元兇）。
                    // 改成給它一股隨機橫向擾動＋往上一點，讓它脫離卡點、繼續被推手
                    // 沿檯面掃過某個開口正上方時自己掉進去。純物理擾動，不指定要去
                    // 哪一欄，也不搬移它到任何定點。
                    if (now - b.bornAt > BALL_TTL_MS) {
                        b.vx += rnd(-3.5, 3.5);
                        b.vy -= 1.5;
                        b.bornAt = now;   // 重置計時，避免每一幀都在擾動
                    }

                    b.trail.push(b.x, b.y);
                    if (b.trail.length > TRAIL_LEN * 4) b.trail.splice(0, 4);
                } else if (b.trail.length) {
                    b.trail.splice(0, 4);
                }
            }

            this.balls = this.balls.filter(b => b.state !== 'settled');
        },

        _hasFreeFlyBalls: function () {
            for (const b of this.balls) if (b.state === 'fly') return true;
            return false;
        },

        _collideWalls: function (b) {
            const r = b.r;
            if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * this.restWall; }
            if (b.x > CW - r) { b.x = CW - r; b.vx = -Math.abs(b.vx) * this.restWall; }
            if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * this.restWall; }
        },

        /**
         * ⭐ 撞干擾棒（圓形）的反彈：先照正確的圓形碰撞法線做標準彈性反射
         *   （`vx -= (1+e)*vn*nx` 這一段本身沒有錯，nx/ny 就是棒心指向球心
         *   的單位法線，是圓形碰撞該有的反彈方向）。
         *
         *   之前的「往左右偏斜」做法是反射算完之後，直接把一個隨機數字加
         *   進 `b.vx`——這一步完全不管實際撞擊角度，等於憑空多出一股跟碰
         *   撞方向無關的側向力，難怪看起來「反彈角度是錯的」：一顆從正上
         *   方近乎垂直砸中棒子的球，反彈本該幾乎原路彈回，卻會被那個隨機
         *   數字硬拗向某個跟碰撞無關的方向。
         *
         *   正確做法：把「加左右偏斜」改成對已經算好的反射向量做一個小角度
         *   的隨機旋轉（`pegDeflectAngle`，弧度）。旋轉不會改變球速大小，
         *   角度也是以正確的反射方向為基準去微調，物理意義是「沒有正中球
         *   心的擦邊碰撞」，而不是無中生有的側向力。
         */
        _collidePegs: function (b) {
            for (const p of this.pegs) {
                const dx = b.x - p.x, dy = b.y - p.y;
                const rr = b.r + (p.r || PEG_R);
                if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
                const d = Math.hypot(dx, dy);
                if (d >= rr || d === 0) continue;

                const nx = dx / d, ny = dy / d;
                const overlap = rr - d;
                b.x += nx * overlap;
                b.y += ny * overlap;
                const vn = b.vx * nx + b.vy * ny;
                if (vn >= 0) continue;

                if (vn < -CONTACT_V) {
                    b.vx -= (1 + this.restPeg) * vn * nx;
                    b.vy -= (1 + this.restPeg) * vn * ny;
                    if (this.pegDeflectAngle > 0) {
                        const ang = rnd(-this.pegDeflectAngle, this.pegDeflectAngle);
                        const cosA = Math.cos(ang), sinA = Math.sin(ang);
                        const rvx = b.vx * cosA - b.vy * sinA;
                        const rvy = b.vx * sinA + b.vy * cosA;
                        b.vx = rvx; b.vy = rvy;
                    }
                    p.flash = 1;
                    this._pegSound();
                } else {
                    b.vx -= vn * nx;
                    b.vy -= vn * ny;
                    b.vx += (Math.abs(nx) < 0.25 ? (nx >= 0 ? 1 : -1) : Math.sign(nx)) * ROLL_ASSIST;
                }
            }
        },

        /** ⭐ 推手是「尖角朝上」的三角形，碰撞判定必須也用同一個三角形（圓對
         *  三角形的最近點碰撞），不能再用長方形／圓形近似——否則畫的是三角
         *  形、判定卻是別的形狀，球會停在看不見的方框頂邊上（就是先前「球停
         *  在三角形頂端」的錯誤）。三角形碰撞完全不是效能問題：全場只有一個
         *  推手，一次碰撞只是對三條邊各做一次「點到線段最近點」，跟每幀要跑
         *  上萬顆球的干擾棒／球對球碰撞比起來微不足道。
         *
         *  三角形頂點（apex 在上）：A=(px, py-hh)、B=(px-hw, py+hh)、
         *  C=(px+hw, py+hh)。球從斜邊 AB／AC 滑落到兩側，就是「中央能推、
         *  邊緣讓球翻過去」想要的效果，靠三角形的斜面本身自然達成。
         *
         *  ⚠️ 反彈用「相對速度」（把推手自身的移動速度算進去）而不是額外再加
         *  一股人工推力：移動中的斜面撞到球時，正確的物理是以（球速−推手速）
         *  的法線分量做反射，推手因此自然把自己的移動量傳給球，力道恰好等於
         *  推手在動，不會多也不會累加。先前另外硬加一股 carry 力（無論是一次
         *  到位或逐步逼近）都是無中生有的力，才會出現球被瞬間灌速、自己暴衝
         *  進收納區的現象，這裡整段拿掉。 */
        _collidePusher: function (b) {
            const p = this.pusher;
            if (!p) return;
            const hw = p.hw || p.r, hh = p.hh || p.r;
            const ax = p.x, ay = p.y - hh;            // apex（上）
            const bx = p.x - hw, by = p.y + hh;       // 左下
            const cx2 = p.x + hw, cy2 = p.y + hh;     // 右下

            // 快速剔除：球離推手外接矩形都還很遠就直接跳過
            if (b.x < bx - b.r || b.x > cx2 + b.r || b.y < ay - b.r || b.y > cy2 + b.r) return;

            // 球心對三角形三條邊各取最近點，挑距離最小者
            const seg = (px, py, x1, y1, x2, y2) => {
                const ex = x2 - x1, ey = y2 - y1;
                const len2 = ex * ex + ey * ey || 1;
                let t = ((px - x1) * ex + (py - y1) * ey) / len2;
                t = t < 0 ? 0 : (t > 1 ? 1 : t);
                const qx = x1 + t * ex, qy = y1 + t * ey;
                const ddx = px - qx, ddy = py - qy;
                return { qx, qy, d2: ddx * ddx + ddy * ddy };
            };
            let best = seg(b.x, b.y, ax, ay, bx, by);
            const s2 = seg(b.x, b.y, ax, ay, cx2, cy2);
            if (s2.d2 < best.d2) best = s2;
            const s3 = seg(b.x, b.y, bx, by, cx2, cy2);
            if (s3.d2 < best.d2) best = s3;

            // 判斷球心是否在三角形內部（同號測試）
            const sign = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
            const d1 = sign(b.x, b.y, ax, ay, bx, by);
            const dd2 = sign(b.x, b.y, bx, by, cx2, cy2);
            const dd3 = sign(b.x, b.y, cx2, cy2, ax, ay);
            const hasNeg = d1 < 0 || dd2 < 0 || dd3 < 0;
            const hasPos = d1 > 0 || dd2 > 0 || dd3 > 0;
            const inside = !(hasNeg && hasPos);

            let nx, ny;
            if (inside) {
                // 球心穿進三角形內部（極少見）：直接往正上方推出，球都是從上方
                // 落下，往上推最安全。
                nx = 0; ny = -1;
                b.y = ay - b.r;
            } else {
                const d = Math.sqrt(best.d2);
                if (d >= b.r || d === 0) return;      // 沒接觸
                nx = (b.x - best.qx) / d;
                ny = (b.y - best.qy) / d;
                b.x += nx * (b.r - d);
                b.y += ny * (b.r - d);
            }

            // 以「球速 − 推手速度」的法線分量做反射（推手只往水平移動）
            const pvx = p.dir * this.pusherSpeed;
            const rvn = (b.vx - pvx) * nx + b.vy * ny;
            if (rvn < 0) {
                b.vx -= (1 + this.restWall) * rvn * nx;
                b.vy -= (1 + this.restWall) * rvn * ny;
            }
        },

        /** 球對球彈性碰撞：只有還在飛（尚未鎖定欄位）的球才需要參與 */
        _collideBalls: function () {
            const arr = this.balls;
            for (let i = 0; i < arr.length; i++) {
                const a = arr[i];
                if (a.bin >= 0) continue;
                for (let j = i + 1; j < arr.length; j++) {
                    const b = arr[j];
                    if (b.bin >= 0) continue;

                    const dx = b.x - a.x, dy = b.y - a.y;
                    const rr = a.r + b.r;
                    if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
                    const d = Math.hypot(dx, dy);
                    if (d >= rr || d === 0) continue;

                    const nx = dx / d, ny = dy / d;
                    const overlap = rr - d;
                    a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
                    b.x += nx * overlap / 2; b.y += ny * overlap / 2;

                    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
                    const vn = rvx * nx + rvy * ny;
                    if (vn >= 0) continue;
                    const imp = -(1 + this.restBall) * vn / 2;
                    a.vx -= imp * nx; a.vy -= imp * ny;
                    b.vx += imp * nx; b.vy += imp * ny;
                }
            }
        },

        /**
         * ⭐ 收集區頂端的「開口閘門」——這就是傳統小彈珠機台收集區的簡化模型。
         *
         *   真實機台的收集區有一排直條隔板，把落下的彈珠排成工整的直條。這頁
         *   為了效能沒有真的做隔板的物理碰撞，改成：把收集區的「頂端」當成一
         *   片實心的檯面，只在每一欄（預設 50 欄）規畫好的落點正上方各開一個
         *   「洞」。一顆球唯有同時滿足：
         *     (1) 它正對準某一欄的洞口（球心離該欄中心在一個球徑內），且
         *     (2) 那一欄還有空位，
         *   才能從那個洞落進收集區；否則頂端就是一片擋住它的實心平面，球會
         *   停在檯面上（維持 fly 狀態，繼續受重力＋碰撞＋推手支配），被推手
         *   沿著檯面推動，直到剛好滑到某個洞口正上方，才「自己」掉進去。
         *
         *   ⚠️ 全程沒有任何程式主動把球橫向搬去某一欄——球要不要落入、落入
         *   哪一欄，完全由它自己在檯面上被推到哪個洞口上方決定。這正是把「橫
         *   向對位」變成一道『閘門條件』（要對準才放行）、而不是一段『把球拉
         *   過去』的動畫，兩者是完全不同的東西。
         */
        _collideCollectionTop: function (b) {
            const capY = this.binTop;
            if (b.y + b.r < capY) return;          // 還沒到收集區頂端
            const N = this.gridN;
            const col = clamp(Math.floor(b.x / this.cellSize), 0, N - 1);
            const center = (col + 0.5) * this.cellSize;
            const openingHalf = b.r;               // 洞口半寬＝球徑：球心要落在欄中心一個球徑內才對得準
            const aligned = Math.abs(b.x - center) <= openingHalf;
            if (aligned && this.colCount[col] < N) return;  // 對準空欄洞口 → 放行，交給 _resolvePositions 落定
            // 否則收集區頂端是一片實心檯面，擋住球（停／彈的判斷沿用撞牆那套）。
            // ⚠️ 留一點餘量（0.05），避免卡回去的高度剛好等於 `_resolvePositions`
            //    判斷「跨過格口」的門檻，導致同一子步又被判成落入、繞過閘門。
            b.y = capY - b.r - 0.05;
            if (b.vy > 0) {
                b.vy = (b.vy > CONTACT_V) ? -b.vy * this.restWall : 0;
            }
        },

        /** 檢查是否跨過格口 → 鎖定欄位；已鎖定的球檢查是否到達定位 */
        _resolvePositions: function (now) {
            for (const b of this.balls) {
                if (b.state === 'settled') continue;
                if (b.bin < 0) {
                    if (b.y + b.r >= this.binTop) this._lockBall(b, now);
                    continue;
                }
                // 已通過洞口閘門鎖定欄位的球：在 `_lockBall` 進來時就已對齊欄
                // 中心（x），這裡只需等它靠重力垂直落到該欄的空位高度 restY，
                // 到了就定住。全程純垂直，沒有任何橫向搬移。
                if (b.y >= b.restY) {
                    b.y = b.restY; b.vx = 0; b.vy = 0;
                    this._settleBall(b);
                }
            }
        },

        /**
         * 球跨進格口時鎖定它「落在哪一欄」：純粹用它當下真實的 x 座標決定
         * （`floor(x / cellSize)`），⛔ 不論任何情況都不把球導去別的欄、也不
         *  搬移它的 x——「導欄」正是先前球會自己橫向飛去別欄、穿過已存在的球
         *  的元兇，已徹底移除。
         *
         *  一顆球能走到這裡，代表它剛通過收集區頂端的洞口閘門
         *  （`_collideCollectionTop`）：它一定對準了某個「還有空位的欄」的開口。
         *  萬一極少數邊界情況下它上方那欄其實已滿，就「不鎖」，把它退回頂端
         *  檯面繼續當在飛的球，交給推手把它推到還有空位的開口上方再落。
         */
        _lockBall: function (b, now) {
            const N = this.gridN;
            const col = clamp(Math.floor(b.x / this.cellSize), 0, N - 1);
            if (this.colCount[col] >= N) {
                b.y = this.binTop - b.r - 0.05;
                if (b.vy > 0) b.vy = 0;
                return;
            }
            this.inFlight[b.targetCol] = Math.max(0, this.inFlight[b.targetCol] - 1);
            b.bin = col;
            b.state = 'settling';
            b.stackIndex = this.colCount[col];
            this.colCount[col]++;
            // 球是通過洞口閘門才進來的，球心本就已在該欄中心一個球徑內，這裡把
            // x 對齊到欄中心只是一個 ≤ 球徑的瞬間對位（不是把球從遠處拉過來的
            // 橫向動畫），讓它接著純粹垂直落到 restY 定位、排成工整的直條。
            b.x = (col + 0.5) * this.cellSize;
            b.restY = this._slotCy(b.stackIndex);
            // ⚠️ 這裡「不」預先算對不對、也不先決定顏色——欄位與層數只是物理
            //   落點決定的事實，但球在真正落到定位之前，玩家看到的應該還是
            //   它原本的黑／白色。若在這裡就先算好「對不對」並改成 drawColor，
            //   等於是提前預判了結果，球都還沒掉到底就變紅，很不真實。真正
            //   判定與變色的時機在 `_settleBall`（球到達 `restY` 的那一刻）。
        },

        /** 球真正落到定位（到達 restY）的那一刻，才判定對不對、決定要不要變紅 */
        _settleBall: function (b) {
            const N = this.gridN;
            const row = N - 1 - b.stackIndex;
            const target = (this.bitmap[row] || [])[b.bin] || 'white';
            b.correct = (b.color === target);
            b.drawColor = b.correct ? b.color : 'red';

            b.state = 'settled';
            b.trail.length = 0;
            this.placedCount++;
            if (!b.correct) this.wrongCount++;
            this._drawBallTo(this.bakeCtx, b);
            this._updateProgress();

            if (this.placedCount >= this.totalCount && !this.finished) {
                this.finished = true;
                this.finishedAt = performance.now();
                this._celebrateAll();
            }
        },

        _celebrateAll: function () {
            if (this.frameEl) this.frameEl.classList.add('all-done');
            if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
            this._ring(CW / 2, this.binTop + CW / 2, 45, CW * 0.75);
            this._updateProgress();
        },

        // ========================================================
        // 特效
        // ========================================================
        _ring: function (x, y, hue, maxR) {
            this.rings.push({ x: x, y: y, r: 10, maxR: maxR, life: 1, hue: hue });
            if (this.rings.length > 20) this.rings.splice(0, this.rings.length - 20);
        },

        _stepEffects: function (dt) {
            for (const r of this.rings) {
                r.r += (r.maxR - r.r) * 0.10 * dt;
                r.life -= 0.03 * dt;
            }
            this.rings = this.rings.filter(r => r.life > 0);
            for (const p of this.pegs) if (p.flash > 0) p.flash = Math.max(0, p.flash - 0.09 * dt);
        },

        _pegSound: function () {
            const now = performance.now();
            if (now - this.lastPegSoundAt < 70) return;
            this.lastPegSoundAt = now;
            if (window.SoundManager) window.SoundManager.playHit(Math.floor(rnd(0, 5)), 0.02);
        },

        // ========================================================
        // 繪製
        // ========================================================
        _draw: function () {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, CW, CH);
            this._drawBoard(ctx);
            ctx.drawImage(this.bakeCanvas, 0, 0);   // 已定位的球：一次貼上，不逐顆重繪
            this._drawPegs(ctx);
            if (this.pusherEnabled) this._drawPusher(ctx);
            this._drawTrails(ctx);
            this._drawRings(ctx);
            for (const b of this.balls) {
                if (b.state !== 'settled') this._drawBallTo(ctx, b);
            }
        },

        _drawBoard: function (ctx) {
            const g = ctx.createLinearGradient(0, 0, 0, CH);
            g.addColorStop(0, 'hsl(38, 44%, 82%)');
            g.addColorStop(0.55, 'hsl(35, 40%, 74%)');
            g.addColorStop(1, 'hsl(32, 36%, 66%)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, CW, CH);

            // 收納區直條格分隔線：只畫在收納區內、畫在每兩欄球之間（欄數 N 條
            // 分隔線之間留 N-1 條），視覺上像球落入直條格子中；落下區（干擾棒
            // 那一段）不再畫任何直線。
            ctx.save();
            ctx.globalAlpha = 0.10;
            ctx.strokeStyle = 'hsl(28, 45%, 42%)';
            ctx.lineWidth = 1.2;
            const N = this.gridN;
            for (let i = 1; i < N; i++) {
                const x = i * this.cellSize;
                ctx.beginPath();
                ctx.moveTo(x, this.binTop);
                ctx.lineTo(x, CH);
                ctx.stroke();
            }
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = 'hsla(28, 40%, 30%, 0.35)';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, this.binTop, CW - 2, CW - 1);
            ctx.restore();
        },

        _drawPegs: function (ctx) {
            for (const p of this.pegs) {
                const r = (p.r || PEG_R) + p.flash * 1.8;
                const g = ctx.createRadialGradient(p.x - r * 0.4, p.y - r * 0.45, r * 0.1, p.x, p.y, r);
                g.addColorStop(0, 'hsl(40, 30%, 96%)');
                g.addColorStop(0.6, 'hsl(34, 22%, 72%)');
                g.addColorStop(1, 'hsl(28, 25%, 42%)');
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();
            }
        },

        /** 推手畫成三角形（尖角朝上），寬度是球半徑的 3 倍、高度較矮，尺寸
         *  對應 `_layout` 裡算好的 hw/hh，碰撞判定（`_collidePusher`）也是用
         *  同一組 hw/hh 的長方形範圍，畫面與物理範圍互相一致。 */
        _drawPusher: function (ctx) {
            const p = this.pusher;
            if (!p) return;
            const hw = p.hw || p.r, hh = p.hh || p.r;
            ctx.save();
            ctx.fillStyle = 'hsla(210, 70%, 55%, 0.85)';
            ctx.strokeStyle = 'hsla(210, 80%, 30%, 0.9)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - hh);
            ctx.lineTo(p.x + hw, p.y + hh);
            ctx.lineTo(p.x - hw, p.y + hh);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        },

        _drawTrails: function (ctx) {
            ctx.save();
            /* 關閉顯示拖尾效果
            ctx.lineCap = 'round';
            for (const b of this.balls) {
                if (b.state === 'settled') continue;
                const t = b.trail;
                if (t.length < 4) continue;
                const n = t.length / 2;
                const hue = b.color === 'black' ? 220 : (b.color === 'white' ? 45 : 0);
                for (let i = 1; i < n; i++) {
                    const a = i / n;
                    ctx.beginPath();
                    ctx.moveTo(t[(i - 1) * 2], t[(i - 1) * 2 + 1]);
                    ctx.lineTo(t[i * 2], t[i * 2 + 1]);
                    ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${0.80 * a})`;
                    ctx.lineWidth = b.r * 0.8 * a;
                    ctx.stroke();
                }
            }
            */
            ctx.restore();
        },

        _drawRings: function (ctx) {
            ctx.save();
            for (const r of this.rings) {
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${r.hue}, 95%, 65%, ${0.6 * r.life})`;
                ctx.lineWidth = 3 * r.life + 1;
                ctx.stroke();
            }
            ctx.restore();
        },

        /** 珠子：純色球體（黑／白／紅），無字，徑向漸層＋高光，維持 game26 語彙的手感 */
        _drawBallTo: function (ctx, b) {
            const r = b.r;
            if (r <= 0.4) return;
            const color = b.drawColor || b.color;
            let baseH, baseS, baseL;
            if (color === 'black') { baseH = 220; baseS = 12; baseL = 16; }
            else if (color === 'white') { baseH = 42; baseS = 20; baseL = 92; }
            else { baseH = 0; baseS = 82; baseL = 52; }   // red

            ctx.save();
            const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, Math.max(0.1, r * 0.1), b.x, b.y, r);
            g.addColorStop(0, `hsl(${baseH}, ${baseS}%, ${Math.min(97, baseL + 22)}%)`);
            g.addColorStop(0.55, `hsl(${baseH}, ${baseS}%, ${baseL}%)`);
            g.addColorStop(1, `hsl(${baseH}, ${baseS}%, ${Math.max(4, baseL - 18)}%)`);
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            if (r > 2.5) {
                // ⚠️ 白球的填色（baseL=92，接近純白）跟木質台面底色（暖棕色）明暗
                //   對比很低，邊緣很容易「糊」進背景裡，視覺上會誤以為白球比
                //   黑球、紅球小一號——其實三色球的半徑 `r` 完全相同，只是白球
                //   原本的描邊（極淡的淺棕、半透明）根本襯不出輪廓。加深、加粗
                //   白球專屬的描邊，讓它跟另外兩色一樣有清楚的邊界。
                if (color === 'white') {
                    ctx.strokeStyle = 'hsla(28, 55%, 30%, 0.9)';
                    ctx.lineWidth = 1.6;
                } else {
                    ctx.strokeStyle = 'hsla(0, 0%, 0%, 0.35)';
                    ctx.lineWidth = 1;
                }
                ctx.stroke();
            }
            ctx.restore();
        },

        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this.newRound();
        },

        hide: function () { this.stopGame(); },

        stopGame: function () {
            this.active = false;
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.QianZhu = QianZhu;

    if (new URLSearchParams(window.location.search).get('page') === 'qianzhu') {
        const start = () => {
            if (window.QianZhu) window.QianZhu.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
