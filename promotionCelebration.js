/* ============================================================================
 * promotionCelebration.js —《花月》文位／小站晉升的全畫面慶祝動畫
 * ----------------------------------------------------------------------------
 * 對應規劃：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md 第七章「晉升演出」
 *
 * ⭐ 這支動畫在演什麼（三幕，且各幕之間可以「重疊」）
 *
 *   第一幕【詩句浮現】
 *     把玩家在這個文位期間學會的詩句鋪滿整個畫面，由上而下依序排列，
 *     每一行左右位置刻意錯開、每個字的大小刻意不一致，避免看起來像
 *     排版工整的說明文字。每個字在隨機時間點出現，由小放大並帶一點回彈。
 *
 *   第二幕【拖曳表演】
 *     兩支看不見的「手指」各自在畫面上「寫」數字／英文字母（6 2 8 9 3 5 S Z G J），
 *     每支筆自己洗牌抽字形、起始時間也錯開，所以兩邊各走各的、不會鏡射。
 *     字形之間會提筆（不畫、不潑），下一個字形換位置、換大小、換傾角重新落筆。
 *     沿途同時產生三種東西：
 *       · 彩色煙霧  → WaterFlow.splatAt()（WebGL 流體染料）
 *       · 拖曳曲線  → 本檔自繪的 10 條彩帶（頭部不斷生長、尾巴逐漸消失）
 *       · 文字擾動  → 以很輕的力道持續帶動附近的字，像水中的顏料
 *
 *   第三幕【獎狀浮現】
 *     浮現獎狀與獎勵說明（沿用 achievement.js 的 showCert）。
 *
 * ⭐ 三幕的銜接可以是負數（重疊）
 *     T_APPEAR_TO_DRAG_SEC 與 T_DRAG_TO_CERT_SEC 允許填負值，
 *     例如 -0.5 代表「詩句還沒浮現完，煙霧就先進場」。
 *     這是刻意支援的，見下方【表演可調參數】。
 *
 * ⭐ 灑星星（TouchInk.burst）已經不在這支表演裡
 *     改用拖曳曲線取代。TouchInk.burst 這個 API 仍然保留給其他用途，
 *     不要因為這裡沒用到就把它刪掉。
 *
 * ⭐ 為什麼不直接用 CSS animation
 *   第二幕的每個字都有各自的速度、阻尼與重力，且要被拖曳持續推擠，
 *   這是逐影格的物理積分，CSS 關鍵影格做不到。因此第一幕用 CSS 過場
 *   （便宜、GPU 合成），第二幕改由 rAF 逐格更新 transform 與彩帶畫布。
 *
 * ⭐ 座標系統
 *   全程使用 500×850 的舞台邏輯座標（與 screen_adaptive.js 一致），
 *   由 registerOverlayResize 統一縮放。只有潑煙霧時需要換算成螢幕座標，
 *   因為 WaterFlow 的 canvas 是鋪滿整個視窗的（見 _stageToScreen）。
 * ========================================================================== */

(function () {
    'use strict';

    // ── CSS 載入防護（資料類型規範 §3.2）──────────────────────────────
    if (!document.getElementById('promotion-celebration-css')) {
        const link = document.createElement('link');
        link.id = 'promotion-celebration-css';
        link.rel = 'stylesheet';
        link.href = 'promotionCelebration.css';
        document.head.appendChild(link);
    }

    const STAGE_W = 500, STAGE_H = 850;

    /* ========================================================================
     *  ⭐⭐ 表演可調參數 ⭐⭐
     *  ------------------------------------------------------------------
     *  要調整表演節奏與力道，改這一區就好，不必動下面的程式碼。
     *  時間一律用「秒」，方便直接對照感覺。
     * ===================================================================== */

    // ① 文字顯示的過程要花幾秒（所有字必須在這段時間內陸續出現完畢）
    const T_APPEAR_SEC = 1.6;

    // ② 文字顯示 → 煙霧＋拖曳曲線 之間的間隔（秒）
    //    0    ＝ 文字剛好演完，煙霧才進場
    //    -0.5 ＝ 文字還剩 0.5 秒沒演完，煙霧就先進場（兩者重疊）
    //    正數 ＝ 中間留一段空白
    const T_APPEAR_TO_DRAG_SEC = -0.6;

    // ③ 拖曳（煙霧＋曲線）整趟要花幾秒
    //    ⚠️ 這是「往下到底再往上到頂」的**整趟**時間，
    //       不是舊版那種「一個字形 2 秒 × 6 個字形」。
    const T_DRAG_SEC = 4.0;

    // ④ 煙霧表演 → 獎狀出現 之間的間隔（秒）
    //    -1 ＝ 煙霧還在演的時候獎狀就先浮現（兩者重疊）
    const T_DRAG_TO_CERT_SEC = -0.6;

    // ⑤ 煙霧濃度。1.0 ＝ waterFlow.js 手指拖曳時的原始濃度。
    //    ⚠️ 這個倍率只用在這支慶祝表演，不會影響玩家平常拖曳的煙霧。
    const SMOKE_DENSITY = 3.0;

    // ⑥ 拖曳對文字的撞擊力量（加速度係數，越大字被帶得越遠）
    const STIR_PUSH = 4.0;

    // ⑦ 文字下墜的力量（px/s²）。110 是「在水中沉降」，900 才是自由落體。
    const GRAVITY = 360;

    // ⑧ 拖曳對文字的影響範圍半徑（舞台座標 px）
    const STIR_RADIUS = 200;

    /* ── 以下是次要參數，通常不用動 ─────────────────────────────── */

    // ── 第一幕：詩句浮現 ──────────────────────────────────────────────
    const APPEAR_DUR_MS = 420;      // 單一個字由小放大的時間
    const SIZE_JITTER = 0.66;       // 字級隨機浮動幅度（±28%，刻意不工整）
    const ROW_OFFSET_MAX = 100;      // 每行左右錯開的最大位移（px）
    const MAX_CHARS = 260;          // 上限：超過就少放幾首，避免手機負擔過重

    // ── 第二幕：拖曳路徑（數字／英文字母字形）────────────────────────
    //
    // ⭐ 為什麼用「字形」而不是規律的上下搖擺
    //    上下搖擺的正弦路徑太規律，兩支筆又必然左右鏡射，
    //    看起來像機器在掃描，完全沒有手指隨手一劃的感覺。
    //    改回沿著數字／字母的筆順走：本來就有起筆、轉折、收筆，
    //    而且每支筆抽到的字形不同 → 兩邊各走各的，不會對稱。
    //
    const DRAG_PENS = 2;            // 同時有幾支「手指」
    const DRAG_STROKES = 1;         // 每支筆整趟要寫幾個字形
    // 可用的字形庫。每支筆會自己洗牌抽 DRAG_STROKES 個，
    // 兩支筆抽到的順序不同，所以不會同步、也不會鏡射。
    const DRAG_GLYPHS = ['6', '2', '8', '9', '3', '5', 'S', 'Z', 'G', 'J'];
    const DRAG_GAP_RATIO = 0.14;    // 每個字形之間「提筆」的空檔（佔單格時間的比例）
    const DRAG_SCALE_MIN = 0.55;    // 字形大小（佔舞台的比例）下限
    const DRAG_SCALE_MAX = 1.2;    // 上限
    const DRAG_ROT_MAX = 20;        // 字形隨機傾斜的最大角度（度）
    const DRAG_TREMOR = 3.2;        // 手指的細微抖動振幅（px），0 = 完全平滑

    // ── 第二幕：文字物理 ──────────────────────────────────────────────
    // 繞著筆尖旋轉的切線加速度（px/s²）。
    // 這是「顏料在水中被攪出漩渦」的關鍵，少了它字只會被平推、很呆板。
    const STIR_SWIRL = 660; //越高越螺旋
    const STIR_RANDOM = 0.60;       // 隨機亂流（佔筆尖速度的比例，每秒）
    const MAX_FLING_SPEED = 600;    // 速度上限（px/s）：水中不該有東西飛很快
    const MAX_FALL_SPEED = 150;     // 下沉終端速度
    // 黏滯阻尼（每秒殘餘速度比例）。0.12 代表一秒後只剩 12% 的速度，
    // 這個很重的阻尼就是「水」的手感來源：推一下會滑一小段，然後停住。
    const AIR_DRAG = 0.4; //越低越稠，越高越容易滑動。
    const SPIN_MAX = 360;            // 被水流帶動時的最大自轉速度（度/秒）

    // ── 第二幕：煙霧 ──────────────────────────────────────────────────
    const SMOKE_EVERY_MS = 40;      // 每隔多久往流體場潑一次染料
    const SMOKE_HUE_SPEED = 0.10;   // 煙霧色相循環速度（圈/秒）

    // ── 第二幕：拖曳曲線（彩帶）──────────────────────────────────────
    const RIBBON_COUNT = 10;        // 曲線總條數（平均分給每支筆）
    const RIBBON_NODE_MIN = 80;     // 單條曲線的節點數下限（＝尾巴長度）
    const RIBBON_NODE_MAX = 120;    // 節點數上限。上下限不同 → 長短不一
    const RIBBON_WIDTH_MIN = 1.2;   // 線條粗細下限（px）
    const RIBBON_WIDTH_MAX = 6.0;   // 線條粗細上限
    // 每條曲線的「頭」不是貼在筆尖上，而是在筆尖周圍這個半徑內游走。
    // 這是十條線會互相交錯的原因 —— 直接貼著筆尖的話十條會疊成一條。
    const RIBBON_ORIGIN_RADIUS = 46;
    const RIBBON_ORIGIN_SPEED = 1.6;  // 起頭點游走的速度基準（圈/秒）
    const RIBBON_HUE_STEP = 0.005;   // 每長出一個節點，色相前進多少（0~1）
    const RIBBON_ALPHA = 0.9;         // 頭部的不透明度（尾部會漸變到 0）
    const RIBBON_DPR = 2;             // 彩帶畫布的解析度倍率

    // ── 收尾 ──────────────────────────────────────────────────────────
    const CHAR_FADE_MS = 500;       // 詩句淡出的時間（需與 CSS 的 transition 一致）
    const POST_MS = 600;            // 表演結束後再留多久才拆掉圖層

    /**
     * 各種字形的筆順，以 0~1 的正規化座標描述（左上為原點）。
     * 播放時再依隨機的大小、位置、傾角換算成舞台座標，
     * 因此同一個字形每次演出來的位置與大小都不一樣。
     *
     * ⚠️ 這些點是「途經點」，實際播放時會用 Catmull-Rom 曲線內插，
     *    所以點不必很密，但轉折處要放點，否則弧線會被拉成直線。
     */
    const STROKE_PATHS = {
        '6': [[0.82, 0.06], [0.62, 0.20], [0.34, 0.34], [0.26, 0.54], [0.28, 0.72],
        [0.40, 0.83], [0.56, 0.84], [0.68, 0.75], [0.68, 0.62], [0.56, 0.54],
        [0.40, 0.55], [0.30, 0.64], [0.10, 0.84]],
        '2': [[0.94, 0.90], [0.72, 0.81], [0.44, 0.81], [0.26, 0.80], [0.34, 0.66],
        [0.52, 0.52], [0.66, 0.38], [0.68, 0.24], [0.56, 0.15], [0.38, 0.16],
        [0.28, 0.26], [0.08, 0.06]],
        '8': [[0.050, 0.06], [0.16, 0.23], [0.36, 0.36], [0.50, 0.46], [0.64, 0.56],
        [0.66, 0.72], [0.52, 0.83], [0.36, 0.78], [0.34, 0.63], [0.50, 0.46],
        [0.62, 0.36], [0.62, 0.23], [0.50, 0.16], [0.020, 0.06]],
        '9': [[0.74, 0.70], [0.50, 0.56], [0.36, 0.42], [0.32, 0.30], [0.40, 0.19],
        [0.54, 0.16], [0.66, 0.25], [0.70, 0.42], [0.66, 0.62], [0.52, 0.76],
        [0.34, 0.80], [0.04, 0.95]],
        '3': [[0.13, 0.99], [0.50, 0.85], [0.66, 0.76], [0.68, 0.60], [0.54, 0.50],
        [0.38, 0.47], [0.50, 0.44], [0.64, 0.32], [0.62, 0.18], [0.46, 0.14],
        [0.30, 0.20], [0.010, 0.05]],
        '5': [[0.08, 0.96], [0.40, 0.84], [0.58, 0.81], [0.68, 0.66], [0.64, 0.50],
        [0.50, 0.42], [0.34, 0.46], [0.32, 0.34], [0.34, 0.17], [0.48, 0.16],
        [0.68, 0.16], [0.98, 0.06]],
        'S': [[0.28, 0.68], [0.34, 0.80], [0.52, 0.83], [0.66, 0.70], [0.62, 0.55],
        [0.46, 0.45], [0.33, 0.34], [0.36, 0.20], [0.54, 0.15], [0.70, 0.22], [0.90, 0.02]],
        'Z': [[0.82, 0.90], [0.50, 0.81], [0.28, 0.70], [0.36, 0.62], [0.52, 0.42],
        [0.70, 0.30], [0.48, 0.19], [0.28, 0.10], [0.08, 0.05]],
        'G': [[0.90, 0.04], [0.56, 0.15], [0.40, 0.19], [0.30, 0.34], [0.28, 0.55],
        [0.34, 0.74], [0.48, 0.84], [0.64, 0.80], [0.70, 0.66], [0.70, 0.55],
        [0.36, 0.55], [0.06, 0.55]],
        'J': [[0.10, 0.20], [0.30, 0.50], [0.38, 0.82], [0.52, 0.84], [0.63, 0.74],
        [0.66, 0.56], [0.76, 0.34], [0.96, 0.05]]
    };

    const PromotionCelebration = {

        overlay: null,
        _chars: [],          // 目前畫面上的字：{ el, x, y, vx, vy, rot, vrot, size }
        _pens: [],           // 拖曳筆：{ x, y, px, py, ribbons }
        _rafId: 0,
        _running: false,
        _onDone: null,

        // ══════════════════════════════════════════════════════════
        //  對外介面
        // ══════════════════════════════════════════════════════════

        /**
         * 播放晉升慶祝動畫。
         *
         * @param {object} opts
         *   station {object}  站點物件（決定要拿哪些詩、以及是文位還是小站）
         *   silver  {number}  這次獲得的文錢（0 則不顯示獎勵行）
         *   onDone  {Function} 動畫全部結束、獎狀也關閉後的回呼
         */
        play: function (opts) {
            const o = opts || {};
            const station = o.station || null;
            const silver = Math.max(0, Math.floor(o.silver || 0));

            // ⚠️ 順序很重要：stop(true) 會把 _onDone 清成 null，
            //    因此必須「先清場、後登記回呼」。寫反的話回呼會被自己清掉，
            //    動畫播完就再也回不到青雲梯（實測過，玩家會卡在獎狀畫面）。
            this.stop(true);
            this._onDone = (typeof o.onDone === 'function') ? o.onDone : null;

            const lines = this._collectLines(station);
            if (!lines.length) {
                // 取不到詩句就直接跳到獎狀，不要卡住流程
                this._showCert(station, silver);
                return;
            }

            this._build();
            this._layout(lines);
            this._running = true;

            // ── 依【表演可調參數】算出每一幕的絕對時間點（毫秒）──
            // ⚠️ 間隔允許為負（重疊），所以這裡一律用「絕對時間點」計算，
            //    不要寫成一串 setTimeout 互相接力，否則負值會變成立刻觸發。
            const tAppearEnd = T_APPEAR_SEC * 1000 + APPEAR_DUR_MS;
            const tDragStart = Math.max(0, tAppearEnd + T_APPEAR_TO_DRAG_SEC * 1000);
            const tDragEnd = tDragStart + T_DRAG_SEC * 1000;
            const tCert = Math.max(0, tDragEnd + T_DRAG_TO_CERT_SEC * 1000);
            const tEnd = Math.max(tDragEnd, tCert) + POST_MS;

            // 第一幕結束：把還沒定格的字定格
            // （被拖曳帶到的字會在 _stir 裡提早各自定格）
            this._timerSettle = setTimeout(() => this._settleAll(), tAppearEnd);
            // 第二幕開始
            this._timerDrag = setTimeout(() => this._startDrag(), tDragStart);
            // 詩句淡出：讓它在獎狀出現的當下剛好淡完
            this._timerFade = setTimeout(() => this._fadeOutChars(),
                Math.max(0, tCert - CHAR_FADE_MS));
            // 第三幕：獎狀
            this._timerCert = setTimeout(() => this._showCert(station, silver), tCert);
            // 收尾：拆掉詩句與彩帶圖層（煙霧是 WaterFlow 自己的畫布，會自然消散）
            this._timerEnd = setTimeout(() => this._teardownStage(), tEnd);
        },

        /**
         * 中止動畫並清乾淨。
         * @param {boolean} silent true = 不呼叫 onDone（用於重播前的清場）
         */
        stop: function (silent) {
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
            ['_timerSettle', '_timerDrag', '_timerFade', '_timerCert', '_timerEnd']
                .forEach(k => { if (this[k]) { clearTimeout(this[k]); this[k] = 0; } });
            this._running = false;
            this._chars = [];
            this._pens = [];
            this._plans = null;
            this._ribbonCtx = null;
            if (this.overlay) { this.overlay.remove(); this.overlay = null; }
            if (silent) this._onDone = null;
        },

        // ══════════════════════════════════════════════════════════
        //  取材：這個文位／小站學了哪些詩句
        // ══════════════════════════════════════════════════════════

        /**
         * 取出要鋪在畫面上的詩句（字串陣列，一個元素是一行）。
         *
         * ⚠️ 文位站與小站取的範圍不同：
         *    · 小站  → 就取那一站自己的詩（poemIds）
         *    · 文位站 → 取「從上一個文位到這個文位」整段期間學的詩，
         *              因為玩家心裡的成就感是「這個文位我學了這些」，
         *              而不是「最後那一小站學了什麼」。
         */
        _collectLines: function (station) {
            const PS = window.PathStations;
            if (!PS || !station) return [];

            let poemIds = [];
            try {
                if (station.type === 'rank') {
                    // 往前收集，直到碰到上一個文位站為止
                    const stations = PS.build();
                    let at = -1;
                    for (let i = 0; i < stations.length; i++) {
                        if (stations[i].type === 'rank' && stations[i].name === station.name) { at = i; break; }
                    }
                    if (at >= 0) {
                        poemIds = (stations[at].poemIds || []).slice();
                        for (let i = at - 1; i >= 0 && stations[i].type !== 'rank'; i--) {
                            poemIds = (stations[i].poemIds || []).concat(poemIds);
                        }
                    }
                } else {
                    poemIds = (station.poemIds || []).slice();
                }
            } catch (e) {
                console.warn('[晉升動畫] 取詩失敗:', e);
                return [];
            }
            if (!poemIds.length) return [];

            // 由 id 取回詩句內容
            const poems = (window.LevelTable && window.LevelTable.getPoems)
                ? window.LevelTable.getPoems()
                : (window.POEMS || []);
            const byId = {};
            poems.forEach(p => { byId[p.id] = p; });

            const lines = [];
            let charCount = 0;
            for (let i = 0; i < poemIds.length; i++) {
                const p = byId[poemIds[i]];
                if (!p || !Array.isArray(p.content)) continue;
                for (let k = 0; k < p.content.length; k++) {
                    const t = String(p.content[k] || '').trim();
                    if (!t) continue;
                    // ⚠️ 超過上限就停：字數失控時手機會掉幀，
                    //    而且字太小也看不清楚，少放幾首反而好看。
                    if (charCount + t.length > MAX_CHARS) return lines;
                    lines.push(t);
                    charCount += t.length;
                }
            }
            return lines;
        },

        // ══════════════════════════════════════════════════════════
        //  第一幕：鋪字
        // ══════════════════════════════════════════════════════════

        _build: function () {
            const ov = document.createElement('div');
            ov.className = 'pcel-overlay';
            // ⚠️ 彩帶畫布放在詩句層**之後**（蓋在字上面），
            //    因為拖曳曲線在視覺上是「劃過畫面」的，被字擋住就沒意義了。
            ov.innerHTML =
                '<div class="pcel-stage" id="pcelStage"></div>' +
                '<canvas class="pcel-ribbon" id="pcelRibbon"></canvas>';
            document.body.appendChild(ov);

            // 彩帶畫布：CSS 尺寸固定為舞台邏輯尺寸，實際解析度乘上 RIBBON_DPR，
            // 之後畫圖時直接用舞台座標即可（跟字的座標系一致）。
            const cv = ov.querySelector('#pcelRibbon');
            cv.width = STAGE_W * RIBBON_DPR;
            cv.height = STAGE_H * RIBBON_DPR;
            cv.style.width = STAGE_W + 'px';
            cv.style.height = STAGE_H + 'px';
            const cx = cv.getContext('2d');
            cx.scale(RIBBON_DPR, RIBBON_DPR);
            cx.lineCap = 'round';
            cx.lineJoin = 'round';
            this._ribbonCtx = cx;

            // 舞台同步縮放（所有 overlay 的標準作法）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    if (!ov.isConnected) return;
                    ov.style.left = r.left + 'px';
                    ov.style.top = r.top + 'px';
                    ov.style.width = STAGE_W + 'px';
                    ov.style.height = STAGE_H + 'px';
                    ov.style.transform = 'scale(' + r.scale + ')';
                    ov.style.transformOrigin = 'top left';
                });
            }
            this.overlay = ov;
        },

        /**
         * 依行數決定字級，把每一行鋪成一列，並讓每個字帶隨機大小與出現時間。
         *
         * 字級的取法：同時受「行數」與「最長那一行的字數」限制，取兩者較小值，
         * 這樣才會盡量佈滿畫面又不會有任何一行超出左右邊界。
         */
        _layout: function (lines) {
            // lines 在下方可能會被「併句」重新指派，故不使用 const
            const stage = this.overlay.querySelector('#pcelStage');
            const padX = 18, padY = 24;
            const usableW = STAGE_W - padX * 2;
            const usableH = STAGE_H - padY * 2;

            let maxLen = 1;
            lines.forEach(t => { if (t.length > maxLen) maxLen = t.length; });

            // ── 決定「一列要放幾句」──────────────────────────────────
            // ⚠️ 五言詩一句才 5 個字，若固定一句一列，會變成 35 列 × 5 字的
            //    細長條，字級被行高綁死在 20px 左右，畫面左右兩側整片空白，
            //    完全談不上「佈滿畫面」。
            //    中文詩本來就常以「兩句一聯」並排閱讀，因此這裡改成自動選擇
            //    每列放 1~3 句，取讓字級最大的那個排法 —— 句子短就併成一聯，
            //    句子長（詞、古詩）就維持一句一列。
            const pack = (perRow) => {
                const rows = Math.ceil(lines.length / perRow);
                // 併排時句與句之間補一個字寬的間隙
                const cols = maxLen * perRow + (perRow - 1);
                const byRows = (usableH / rows) * 0.92;   // 乘 0.92 留行距
                const byCols = (usableW - ROW_OFFSET_MAX) / cols;
                return { perRow: perRow, rows: rows, font: Math.min(byRows, byCols) };
            };
            let best = pack(1);
            for (let k = 2; k <= 3; k++) {
                const c = pack(k);
                if (c.font > best.font) best = c;
            }

            const perRow = best.perRow;
            const fontSize = Math.max(9, best.font);
            const rowH = usableH / best.rows;

            // 依 perRow 把原始詩句併成實際要顯示的列
            if (perRow > 1) {
                const merged = [];
                for (let i = 0; i < lines.length; i += perRow) {
                    merged.push(lines.slice(i, i + perRow).join(' '));
                }
                lines = merged;
            }

            const frag = document.createDocumentFragment();
            this._chars = [];

            lines.forEach((text, row) => {
                // 每行左右錯開：用 sin 讓錯位有規律地擺盪，比純隨機更耐看
                const offset = Math.sin(row * 0.9) * ROW_OFFSET_MAX * 0.5
                    + (Math.random() - 0.5) * ROW_OFFSET_MAX * 0.5;
                const lineW = text.length * fontSize;
                const startX = padX + (usableW - lineW) / 2 + offset;
                const y = padY + row * rowH + rowH * 0.5;

                for (let i = 0; i < text.length; i++) {
                    // 每個字的大小刻意不一致，讓畫面「隨興」而非工整
                    const scale = 1 + (Math.random() - 0.5) * 2 * SIZE_JITTER;
                    const size = fontSize * scale;
                    const x = startX + i * fontSize + fontSize / 2;

                    // ⚠️ 兩層結構：外層擺位置、內層做縮放動畫。
                    //    合在同一層會讓 JS 的 transform 與 CSS 的 scale 互相覆蓋，
                    //    浮現動畫會整個失效（詳見 promotionCelebration.css 檔頭）。
                    const el = document.createElement('span');
                    el.className = 'pcel-char';
                    el.style.fontSize = size.toFixed(1) + 'px';
                    el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';

                    const glyph = document.createElement('span');
                    glyph.className = 'pcel-glyph';
                    glyph.textContent = text[i];
                    // 每個字在 0~T_APPEAR_SEC 之間的隨機時刻出現
                    glyph.style.animationDelay =
                        (Math.random() * T_APPEAR_SEC * 1000).toFixed(0) + 'ms';
                    el.appendChild(glyph);
                    frag.appendChild(el);

                    this._chars.push({
                        el: el, x: x, y: y,
                        vx: 0, vy: 0, rot: 0, vrot: 0,
                        size: size, flung: false
                    });
                }
            });
            stage.appendChild(frag);
        },

        /**
         * 把所有還沒定格的字定格。
         * ⚠️ 不能在第二幕開始時無條件對「全部」的字這樣做 ——
         *    T_APPEAR_TO_DRAG_SEC 為負時第二幕會提早進場，
         *    那時還有字沒浮現完，一次全定格會讓它們整批「啪」地跳出來。
         *    因此改成由第一幕自己的計時器負責，被拖曳帶到的字則各自提早定格。
         */
        _settleAll: function () {
            this._chars.forEach(c => c.el.classList.add('pcel-char-settled'));
        },

        // ══════════════════════════════════════════════════════════
        //  第二幕：拖曳表演（煙霧 + 彩帶 + 文字擾動）
        // ══════════════════════════════════════════════════════════

        _startDrag: function () {
            if (!this._running) return;

            // 先排好每支筆的表演腳本（要寫哪幾個字形、何時、擺哪裡）
            this._plans = [];
            for (let k = 0; k < DRAG_PENS; k++) this._plans.push(this._buildPenPlan(k));

            // 建立每一支筆與它身上的彩帶
            const perPen = Math.max(1, Math.round(RIBBON_COUNT / DRAG_PENS));
            this._pens = [];
            for (let k = 0; k < DRAG_PENS; k++) {
                const ribbons = [];
                for (let i = 0; i < perPen; i++) {
                    ribbons.push({
                        nodes: [],
                        // 節點數上下限不同 → 十條彩帶長度不一，看起來才自然
                        maxLen: Math.round(RIBBON_NODE_MIN
                            + Math.random() * (RIBBON_NODE_MAX - RIBBON_NODE_MIN)),
                        width: RIBBON_WIDTH_MIN
                            + Math.random() * (RIBBON_WIDTH_MAX - RIBBON_WIDTH_MIN),
                        hue: Math.random(),
                        // 起頭點在筆尖周圍游走用的 Lissajous 參數。
                        // 兩軸用不同頻率，軌跡才不會是單純的圓；
                        // 十條各自不同 → 彼此交錯纏繞。
                        phX: Math.random() * Math.PI * 2,
                        phY: Math.random() * Math.PI * 2,
                        frX: RIBBON_ORIGIN_SPEED * (0.6 + Math.random() * 1.1),
                        frY: RIBBON_ORIGIN_SPEED * (0.6 + Math.random() * 1.1),
                        rad: RIBBON_ORIGIN_RADIUS * (0.35 + Math.random() * 0.65)
                    });
                }
                // 起始位置＝這支筆第一個字形的起筆處
                const first = this._plans[k][0];
                const p0 = this._splinePoint(first.pts, 0);
                this._pens.push({
                    x: p0.x, y: p0.y, px: p0.x, py: p0.y,
                    ribbons: ribbons,
                    active: false      // 是否正在落筆（提筆的空檔為 false）
                });
            }

            this._dragStart = performance.now();
            this._lastT = this._dragStart;
            this._lastSmoke = 0;
            this._lastSmokePt = null;
            this._smokeHue = Math.random();
            this._rafId = requestAnimationFrame((t) => this._tick(t));
        },

        /**
         * 幫第 k 支筆排好整趟的「表演腳本」：要寫哪幾個字形、各自何時開始、
         * 擺在畫面的哪裡、多大、傾斜幾度。
         *
         * ⚠️ 兩支筆各自洗牌抽字形，而且起始時間刻意錯開，
         *    這是「不對稱、不同步」的來源 —— 舊版正弦路徑必然左右鏡射，
         *    看起來像機器掃描，就是敗在這裡。
         */
        _buildPenPlan: function (k) {
            // 洗牌後取前 DRAG_STROKES 個，同一支筆不會重複寫同一個字形
            const bag = DRAG_GLYPHS.slice();
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = bag[i]; bag[i] = bag[j]; bag[j] = tmp;
            }

            // 每支筆整體往後錯開一點，兩支筆的起筆、收筆就不會同時發生
            const offset = (k / DRAG_PENS) * (1 / DRAG_STROKES) * 0.55;
            // ⚠️ 單格時間要扣掉 offset 再均分，否則最後一個字形會超出 p=1，
            //    表演時間到了卻還沒寫完，畫面上會看到那一筆突然斷在半路。
            const slot = (1 - offset) / DRAG_STROKES;

            const plan = [];
            for (let i = 0; i < DRAG_STROKES; i++) {
                const raw = STROKE_PATHS[bag[i % bag.length]];

                // 隨機的大小、位置、傾角 → 同一個字形每次都長得不一樣
                const s = DRAG_SCALE_MIN + Math.random() * (DRAG_SCALE_MAX - DRAG_SCALE_MIN);
                const bw = STAGE_W * s, bh = STAGE_H * s;
                const bx = Math.random() * (STAGE_W - bw);
                const by = Math.random() * (STAGE_H - bh);
                const ang = (Math.random() - 0.5) * 2 * DRAG_ROT_MAX * Math.PI / 180;
                const ca = Math.cos(ang), sa = Math.sin(ang);
                const ccx = bx + bw / 2, ccy = by + bh / 2;

                const pts = raw.map(pt => {
                    const x0 = bx + pt[0] * bw - ccx;
                    const y0 = by + pt[1] * bh - ccy;
                    return [ccx + x0 * ca - y0 * sa, ccy + x0 * sa + y0 * ca];
                });

                plan.push({
                    pts: pts,
                    glyph: bag[i % bag.length],
                    t0: offset + i * slot,
                    t1: offset + i * slot + slot * (1 - DRAG_GAP_RATIO),
                    // 每個字形的抖動相位不同，免得兩支筆抖成一樣
                    tremorPh: Math.random() * Math.PI * 2
                });
            }
            return plan;
        },

        /**
         * 求第 k 支筆在整趟進度 p（0~1）時的位置。
         *
         * @returns {object|null} { x, y } ；若此刻正在「提筆」的空檔則回傳 null
         */
        _penPos: function (k, p) {
            const plan = this._plans[k];
            if (!plan) return null;
            for (let i = 0; i < plan.length; i++) {
                const st = plan[i];
                if (p < st.t0) return null;          // 還沒輪到這一筆
                if (p > st.t1) continue;             // 這一筆寫完了，看下一筆

                // 單筆之內用 smoothstep 緩入緩出：真實的手指是加速、減速的，
                // 等速移動會有「機器手臂」的感覺。
                const u = (p - st.t0) / (st.t1 - st.t0);
                const e = u * u * (3 - 2 * u);
                const pos = this._splinePoint(st.pts, e);

                // 細微抖動：兩個不同頻率的正弦疊加，模擬手指的不穩。
                // 頻率刻意取不整除的數字，避免抖出規律的花樣。
                if (DRAG_TREMOR > 0) {
                    const ph = st.tremorPh;
                    pos.x += Math.sin(u * 37.1 + ph) * DRAG_TREMOR
                        + Math.sin(u * 13.7 + ph * 2) * DRAG_TREMOR * 0.5;
                    pos.y += Math.cos(u * 31.3 + ph) * DRAG_TREMOR
                        + Math.cos(u * 11.3 + ph * 2) * DRAG_TREMOR * 0.5;
                }
                return pos;
            }
            return null;
        },

        /**
         * Catmull-Rom 曲線取點：通過所有途經點的平滑曲線。
         *
         * ⚠️ 之前是線性內插，轉折處會是硬生生的折角，
         *    看起來像折線圖而不是手寫。Catmull-Rom 會自動把折角補成弧線，
         *    而且保證通過每一個途經點，不必重調座標表。
         *
         * @param {Array} pts 途經點 [[x,y], ...]（舞台座標）
         * @param {number} t  0~1
         */
        _splinePoint: function (pts, t) {
            const n = pts.length - 1;
            const f = Math.max(0, Math.min(0.99999, t)) * n;
            const i = Math.floor(f);
            const u = f - i;
            // 端點以自身複製代替，讓曲線頭尾不會往外甩出去
            const p0 = pts[Math.max(0, i - 1)];
            const p1 = pts[i];
            const p2 = pts[Math.min(i + 1, n)];
            const p3 = pts[Math.min(i + 2, n)];
            const u2 = u * u, u3 = u2 * u;
            const cr = (a, b, c, d) => 0.5 * (
                (2 * b) + (-a + c) * u
                + (2 * a - 5 * b + 4 * c - d) * u2
                + (-a + 3 * b - 3 * c + d) * u3
            );
            return { x: cr(p0[0], p1[0], p2[0], p3[0]), y: cr(p0[1], p1[1], p2[1], p3[1]) };
        },

        /** 舞台座標 → 螢幕座標（WaterFlow 的畫布是鋪滿整個視窗的） */
        _stageToScreen: function (x, y) {
            const r = window.stageRect;
            if (!r) return { x: x, y: y };
            return { x: r.left + x * r.scale, y: r.top + y * r.scale };
        },

        _tick: function (now) {
            if (!this._running) return;
            const dt = Math.min(0.05, (now - this._lastT) / 1000);  // 夾住 dt，避免切分頁回來時瞬移
            this._lastT = now;

            const elapsed = now - this._dragStart;
            const p = elapsed / (T_DRAG_SEC * 1000);
            const dragging = p <= 1;

            if (dragging) {
                // ── 推進每一支筆 ──
                for (let k = 0; k < this._pens.length; k++) {
                    const pen = this._pens[k];
                    const cur = this._penPos(k, p);

                    // cur 為 null＝這支筆正在「提筆」的空檔（字形與字形之間）。
                    // 這段期間不畫、不潑、不擾動，但尾巴要繼續縮短。
                    if (!cur) {
                        if (pen.active) {
                            pen.active = false;
                            // 落下斷點：下一個字形的頭不可以跟上一個字形的尾巴連成一線
                            this._breakRibbons(pen);
                        }
                        pen.ribbons.forEach(rb => { if (rb.nodes.length) rb.nodes.shift(); });
                        continue;
                    }

                    // 剛落筆：把「上一影格位置」對齊到現在，
                    // 否則會用上一個字形收筆的舊座標算出一個假的高速度。
                    if (!pen.active) {
                        pen.active = true;
                        pen.x = cur.x; pen.y = cur.y;
                    }

                    pen.px = pen.x; pen.py = pen.y;
                    pen.x = cur.x; pen.y = cur.y;

                    const dx = pen.x - pen.px;
                    const dy = pen.y - pen.py;
                    const speed = Math.sqrt(dx * dx + dy * dy) / Math.max(dt, 0.001);

                    // 持續輕輕擾動附近的字（每一影格都施力，力道乘上 dt）
                    if (speed > 0) this._stir(pen.x, pen.y, dx, dy, speed, dt);

                    // 長出彩帶的新節點
                    this._growRibbons(pen, elapsed / 1000);
                }

                // ── 彩色煙霧（WebGL 流體染料）──
                // ⚠️ 節流到 SMOKE_EVERY_MS 一次：流體模擬比粒子貴得多，
                //    每影格都潑在手機上會掉幀，而且染料會糊成一整片。
                if (window.WaterFlow && window.WaterFlow.splatAt
                    && now - (this._lastSmoke || 0) >= SMOKE_EVERY_MS) {
                    this._smokeHue = ((this._smokeHue || 0)
                        + SMOKE_HUE_SPEED * (now - (this._lastSmoke || now)) / 1000) % 1;
                    const prevList = this._lastSmokePt;
                    const curList = [];
                    for (let k = 0; k < this._pens.length; k++) {
                        const pen = this._pens[k];
                        // 提筆的空檔不潑染料（手指沒碰到畫面）
                        if (!pen.active) { curList.push(this._lastSmokePt && this._lastSmokePt[k]); continue; }
                        const sp = this._stageToScreen(pen.x, pen.y);
                        const prev = (prevList && prevList[k]) || sp;
                        // 每支筆的色相彼此錯開，畫面同時有冷暖兩種染料
                        const hue = (this._smokeHue + k / this._pens.length) % 1;
                        window.WaterFlow.splatAt(sp.x, sp.y,
                            sp.x - prev.x, sp.y - prev.y, hue, SMOKE_DENSITY);
                        curList.push(sp);
                    }
                    this._lastSmoke = now;
                    this._lastSmokePt = curList;
                }
            } else {
                // 拖曳結束後彩帶不再長新節點，但尾巴要繼續消失掉
                for (let k = 0; k < this._pens.length; k++) {
                    this._pens[k].ribbons.forEach(rb => { if (rb.nodes.length) rb.nodes.shift(); });
                }
            }

            // ── 物理：水中漂移 + 緩緩沉降 ──
            const damp = Math.pow(AIR_DRAG, dt);
            for (let i = 0; i < this._chars.length; i++) {
                const c = this._chars[i];
                if (!c.flung) continue;
                c.vx *= damp;
                c.vy = c.vy * damp + GRAVITY * dt;
                if (c.vy > MAX_FALL_SPEED) c.vy = MAX_FALL_SPEED;
                c.x += c.vx * dt;
                c.y += c.vy * dt;
                c.rot += c.vrot * dt;
                c.el.style.transform =
                    'translate3d(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px,0) rotate(' + c.rot.toFixed(1) + 'deg)';
            }

            this._drawRibbons();

            this._rafId = requestAnimationFrame((t) => this._tick(t));
        },

        /**
         * 拖曳擾動：像在水中攪動顏料一樣，持續而輕柔地帶動半徑內的字。
         *
         * ⚠️ 這裡的每一項都是「加速度」，最後都要乘上 dt。
         *    早期版本改成「同一筆軌跡只給一次衝量」，是因為那時軌跡走得很快
         *    （每筆 380ms）、力道又大，每影格施力會讓整首詩在第一筆就被轟出畫面。
         *    現在軌跡放慢、力道降低、阻尼加重，才回到「持續施力」——
         *    因為水的擾動本來就是持續的，一次性衝量看起來像被打了一拳。
         *
         * ⚠️ 字與字之間不做碰撞（見檔頭說明）。
         */
        _stir: function (px, py, dx, dy, speed, dt) {
            const r2 = STIR_RADIUS * STIR_RADIUS;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const ux = dx / len, uy = dy / len;   // 筆尖前進方向的單位向量

            for (let i = 0; i < this._chars.length; i++) {
                const c = this._chars[i];

                const ox = c.x - px, oy = c.y - py;
                const d2 = ox * ox + oy * oy;
                if (d2 > r2) continue;
                const d = Math.sqrt(d2) || 1;

                // 越靠近筆尖，被帶動得越明顯
                const falloff = 1 - d / STIR_RADIUS;

                // ① 順流推力：沿筆尖前進方向，大小與筆尖速度成正比
                const a = speed * STIR_PUSH * falloff * dt;
                c.vx += ux * a;
                c.vy += uy * a;

                // ② 漩渦切線力：繞著筆尖打轉（把 (ox,oy) 旋轉 90° 得到切線方向）。
                //    這是「顏料被攪出漩渦」的關鍵，少了它字只會被平推、非常呆板。
                const sw = STIR_SWIRL * falloff * dt;
                c.vx += (-oy / d) * sw;
                c.vy += (ox / d) * sw;

                // ③ 隨機亂流：讓相鄰的字不會整齊地往同一方向移動
                const rnd = speed * STIR_RANDOM * dt;
                c.vx += (Math.random() - 0.5) * rnd;
                c.vy += (Math.random() - 0.5) * rnd;

                // 多次擾動疊加時速度會不斷累加，這裡夾住上限，
                // 否則會出現「還沒看清楚就已經飛出畫面」的情況。
                const sp = Math.sqrt(c.vx * c.vx + c.vy * c.vy);
                if (sp > MAX_FLING_SPEED) {
                    c.vx = c.vx / sp * MAX_FLING_SPEED;
                    c.vy = c.vy / sp * MAX_FLING_SPEED;
                }
                if (!c.flung) {
                    c.flung = true;
                    c.vrot = (Math.random() - 0.5) * 2 * SPIN_MAX;
                    // ⚠️ flung 只是「這個字已經交給物理積分」的旗標，
                    //    不代表施力結束——之後每一影格仍會繼續被擾動。
                    // 被帶動的字直接定格在完整大小：若浮現動畫還沒播完，
                    // 會出現「一邊飄一邊還在放大」的怪異感。
                    c.el.classList.add('pcel-char-settled');
                }
            }
        },

        // ── 拖曳曲線（彩帶）─────────────────────────────────────────

        /**
         * 讓這支筆身上的每條彩帶長出一個新節點。
         *
         * 頭部的位置不是筆尖本身，而是「在筆尖周圍半徑內游走的一個點」：
         * 用兩個不同頻率的正弦（Lissajous）決定偏移量，
         * 十條各自的頻率、相位、半徑都不同，於是彼此不斷交錯纏繞。
         * ⚠️ 若直接把頭固定在筆尖上，十條會完全重疊、看起來只有一條。
         *
         * @param {object} pen  拖曳筆
         * @param {number} tSec 第二幕開始至今的秒數
         */
        _growRibbons: function (pen, tSec) {
            for (let i = 0; i < pen.ribbons.length; i++) {
                const rb = pen.ribbons[i];
                const ox = Math.cos(tSec * rb.frX + rb.phX) * rb.rad;
                const oy = Math.sin(tSec * rb.frY + rb.phY) * rb.rad;
                // 色相隨著節點一個一個往前推進 → 整條線是連續的漸層
                rb.hue = (rb.hue + RIBBON_HUE_STEP) % 1;
                rb.nodes.push({ x: pen.x + ox, y: pen.y + oy, hue: rb.hue, brk: false });
                // 超過長度就從尾巴砍掉一個 → 「頭不斷衍生、尾巴逐漸消失」
                if (rb.nodes.length > rb.maxLen) rb.nodes.shift();
            }
        },

        /**
         * 在每條彩帶上插一個「斷點」。
         *
         * ⚠️ 手指提筆換寫下一個字形時，新的頭會出現在畫面另一端。
         *    若不做記號，繪製時會把「上一個字形的收筆」與「下一個字形的起筆」
         *    連成一條橫貫畫面的長直線 —— 非常明顯的破綻。
         *    這裡把最後一個節點標成 brk，畫的時候就跳過那一段。
         */
        _breakRibbons: function (pen) {
            pen.ribbons.forEach(rb => {
                if (rb.nodes.length) rb.nodes[rb.nodes.length - 1].brk = true;
            });
        },

        /**
         * 重畫整張彩帶畫布。
         *
         * ⚠️ 逐段（segment）描邊而不是一次 stroke 整條：
         *    因為每一段的顏色與透明度都不同（尾巴要淡到看不見、色相要漸變），
         *    而 canvas 的 strokeStyle 是整條 path 共用的，沒辦法一次畫完。
         *    成本約 10 條 × 100 段 ≈ 每影格 1000 次短線描邊；
         *    若在低階手機上掉幀，優先調降 RIBBON_NODE_MAX 或 RIBBON_COUNT。
         */
        _drawRibbons: function () {
            const cx = this._ribbonCtx;
            if (!cx) return;
            cx.clearRect(0, 0, STAGE_W, STAGE_H);

            for (let k = 0; k < this._pens.length; k++) {
                const ribbons = this._pens[k].ribbons;
                for (let i = 0; i < ribbons.length; i++) {
                    const rb = ribbons[i];
                    const n = rb.nodes.length;
                    if (n < 2) continue;
                    for (let j = 1; j < n; j++) {
                        const a = j / n;              // 0 ＝ 尾巴，1 ＝ 頭
                        const nd = rb.nodes[j], pv = rb.nodes[j - 1];
                        // pv 是提筆前的最後一點 → 這一段跨越了兩個字形，不能畫
                        if (pv.brk) continue;
                        // a 平方：讓尾巴淡得更快，長尾才不會看起來像一條粗管子
                        cx.strokeStyle = 'hsla(' + (nd.hue * 360).toFixed(0)
                            + ',92%,62%,' + (a * a * RIBBON_ALPHA).toFixed(3) + ')';
                        // 尾巴同時變細，錐形收尾比等寬好看
                        cx.lineWidth = rb.width * (0.2 + 0.8 * a);
                        cx.beginPath();
                        cx.moveTo(pv.x, pv.y);
                        cx.lineTo(nd.x, nd.y);
                        cx.stroke();
                    }
                }
            }
        },

        // ══════════════════════════════════════════════════════════
        //  收尾
        // ══════════════════════════════════════════════════════════

        /** 詩句淡出。⚠️ 只淡掉字，不要淡掉整層 —— 彩帶還要繼續演。 */
        _fadeOutChars: function () {
            if (!this.overlay) return;
            const stage = this.overlay.querySelector('#pcelStage');
            if (stage) stage.classList.add('pcel-fading');
        },

        /** 表演完全結束：停掉迴圈、拆掉詩句與彩帶圖層 */
        _teardownStage: function () {
            if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
            if (this.overlay) { this.overlay.remove(); this.overlay = null; }
            this._ribbonCtx = null;
            this._pens = [];
        },

        // ══════════════════════════════════════════════════════════
        //  第三幕：獎狀
        // ══════════════════════════════════════════════════════════

        /**
         * 算出「恭賀已通過◯◯」「即將進入◯◯課程」該填哪個站名，
         * 以及這是不是「考試剛通過」的情境（isExamPass）。
         *
         * ⚠️ 與 learningPath.js 的 _getPrevNextStationNames 是同一套邏輯
         *    （含同一份「isExam 與『不在陣列裡』必須同時成立才算考試剛
         *    通過」的推導理由），這裡另外自己算一份而不是跨檔呼叫，
         *    理由跟 _collectLines 一樣：本檔一貫透過 window.PathStations
         *    自己查表、不依賴呼叫端多傳參數。完整理由見 learningPath.js
         *    同名函式的註解，這裡不重複。
         *
         *   · isExamPass＝false（一般抵達，含小站／免考文位／剛抵達但
         *     還沒考的需應試文位／任何測試預覽用的合成物件）——
         *     已完成的是「上一站」，即將進入的課程就是 station 自己。
         *   · isExamPass＝true（只有 exam.js 的合成物件會落到這裡，代表
         *     考試剛通過）——已完成的就是 station 自己，即將進入的是它
         *     的下一站。isFinal＝true 僅在「大儒」（整條青雲梯最後一站，
         *     沒有下一站可進）。
         *
         * @returns {{prevName:string, nextName:string, isFinal:boolean, isExamPass:boolean}}
         */
        _neighborNames: function (station) {
            const empty = { prevName: '', nextName: '', isFinal: false, isExamPass: false };
            const PS = window.PathStations;
            if (!station || !PS) return empty;
            const stations = PS.build();

            const foundByReference = stations.indexOf(station) >= 0;
            const isExamPass = !!station.isExam && !foundByReference;

            if (isExamPass) {
                const idx = stations.findIndex(s => s.type === 'rank' && s.name === station.name);
                if (idx < 0) return empty;
                const next = stations[idx + 1] || null;
                return { prevName: station.name, nextName: next ? next.name : '', isFinal: !next, isExamPass: true };
            }

            let idx = stations.indexOf(station);
            if (idx < 0) idx = stations.findIndex(s => s.type === station.type && s.name === station.name);
            if (idx < 0) return empty;
            const prev = idx > 0 ? stations[idx - 1] : null;
            return { prevName: prev ? prev.name : '', nextName: station.name, isFinal: false, isExamPass: false };
        },

        _showCert: function (station, silver) {
            const finish = () => {
                // ⚠️ 一定要「先取出回呼、再清場」。
                //    stop(true) 內部會把 _onDone 設成 null，若先呼叫它，
                //    下一行就永遠讀到 null，動畫播完不會回到青雲梯，
                //    玩家會卡在獎狀畫面（這個順序寫反過兩次，特此標註）。
                const cb = this._onDone;
                this._onDone = null;
                this.stop(true);
                if (cb) cb();
            };
            const AD = window.AchievementDialog;
            if (!AD || typeof AD.showCert !== 'function' || !station) { finish(); return; }

            const isRank = station.type === 'rank';
            let imgUrl = null;
            if (isRank && Array.isArray(AD.certImages) && AD.certImages.length) {
                const ms = (window.PathStations && window.PathStations.getMilestones)
                    ? window.PathStations.getMilestones() : [];
                let idx = 0;
                for (let i = 0; i < ms.length; i++) { if (ms[i].name === station.name) { idx = i; break; } }
                imgUrl = AD.certImages[Math.min(idx, AD.certImages.length - 1)];
            }

            // 恭賀「剛通過的文位」、告知「即將進入的新課程」；
            // 大儒是整條青雲梯的終點，考過之後已無新課程，
            // 改成鼓勵玩家轉去漢堡選單挑喜歡的遊戲衝排行榜積分。
            const neighbor = this._neighborNames(station);
            let text;
            if (neighbor.isExamPass) {
                text = neighbor.isFinal
                    ? `恭賀\n寒窗苦讀，終登「${station.name}」之境！\n青雲梯至此已無新詩可修，\n不妨轉戰漢堡選單，挑一款喜愛的遊戲，\n痛快衝一波排行榜積分！`
                    : `恭賀\n寒窗苦讀，終登「${station.name}」文位！\n即將修習「${neighbor.nextName}」課程，\n願君持此文心，再續錦繡華章。`;
            } else if (isRank) {
                text = `恭賀\n已通過「${neighbor.prevName}」全部課程，\n榮登「${station.name}」文位！\n寒窗不負苦心人，願君持此文心，再續錦繡華章。`;
            } else {
                text = `恭賀\n已通過「${neighbor.prevName}」全部課程，\n晉「${station.name}」。\n積跬步以至千里，前路尚有好詩相候。`;
            }

            // 第 4 個參數是積分，新規則不發積分故固定 0，只讓文錢數字跑動
            AD.showCert(imgUrl, text, silver > 0, 0, silver);

            // ⚠️ 獎狀（cert-overlay）的 z-index 是 3000，比本層的 4400 低。
            //    T_DRAG_TO_CERT_SEC 為負時兩者會同時存在，若不處理，
            //    這一層的壓暗背景會把獎狀整個蓋住。
            //    作法是只把「壓暗的底」拿掉、圖層本身留著，
            //    於是彩帶會繼續在獎狀上方劃過 —— 這正是重疊想要的效果。
            if (this.overlay) this.overlay.classList.add('pcel-over-cert');

            const certOv = document.getElementById('certOverlay');
            if (!certOv) { finish(); return; }
            const onClick = () => { certOv.removeEventListener('click', onClick); setTimeout(finish, 60); };
            certOv.addEventListener('click', onClick);
        }
    };

    window.PromotionCelebration = PromotionCelebration;

})();
