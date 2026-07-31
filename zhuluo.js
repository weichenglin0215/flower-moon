/* ============================================================================
 * zhuluo.js —《珠落玉盤》台式小彈珠．視覺療癒頁
 * ----------------------------------------------------------------------------
 * 靈感來自台灣童玩「木製小彈珠台（Plinko）」：整首詩拆成一顆一顆的字珠，從台面
 * 上方隨機位置落下，穿過四排干擾棒的碰撞，最後掉進下方七個直式收納格裡。
 *
 * ⭐ 核心規則（依企劃）：
 *   1. 收納格固定 7 格，一格對應「一句詩的第幾個字」。
 *      ⚠️ 注意：格子對應的是「字的位置」，不是「句」——所以七言用滿 7 格、
 *      五言只用中間 5 格，最左與最右兩格是「沒有底」的，珠子會直接穿過消失。
 *      每一格由下往上堆疊，最底下是「最後一句」的字、最上面是「第一句」的字，
 *      因此整個盤面看起來就是「由上而下、由右至左」的一首完整的詩。
 *   2. 同一個「字的位置」＝同一個顏色：第一個字紅、第二個字橙/黃……
 *      五言五色（紅黃綠藍紫）、七言七色（紅橙黃綠藍靛紫）。
 *   3. 發球順序：先發「最後一句」的每一個字（依序輪流），某一格接到正確的字之後，
 *      該格就改發「上一句」同位置的字，一路往上推到第一句。
 *   4. 珠子掉進正確的格子 → 停住堆疊；掉進錯誤的格子 → 先停留 WRONG_HOLD_MS，
 *      再花 WRONG_FADE_MS 縮小消失（兩個秒數都是本檔開頭的可調參數）。
 *
 * ⭐ 為什麼玩法主體畫在 canvas 而不是 DOM？
 *   本頁同時要有「連續物理模擬（重力／碰撞／彈跳）＋每顆珠子的半透明彩色軌跡＋
 *   大量粒子」。若用 DOM，每一顆珠子每一幀都要改 transform、軌跡還得再開十幾個
 *   節點，數十顆珠子時 layout 成本會直接讓手機掉幀。canvas 逐幀重繪反而單純。
 *   外殼（標題／關閉鈕／控制面板）仍維持 DOM，樣式寫在 zhuluo.css。
 *
 * ⭐ 珠子的美術風格抄自 game26《投珠破句》：徑向漸層圓珠＋左上白色高光＋深色
 *   描邊＋墨黑字，半徑也對齊 game26「小學」難度的泡泡尺寸（29px 邏輯像素）。
 *   ⚠️ 八句的律詩因為要疊八層，會自動縮小半徑，否則收納格會吃掉整個台面。
 *
 * ⚠️ 依規範 §6，一般遊戲應使用 getSharedRandomPoem 取詩；但本頁需要「連續 N 句、
 *   每句字數完全相同」才能排成矩形收納格，getSharedRandomPoem 只保證總字數落在
 *   範圍內、不保證每句等長。因此改用自訂掃描（與 tuiqiao.js／game38.js 相同作法，
 *   屬同一種先例）：直接在 POEMS 內找「連續 N 句、每句恰好 W 字」，找不到才降級
 *   使用固定備援詩。
 *
 * 依《.agent/skills/花月開發常見錯誤與解法.md §4》：
 *   - 全域 class 前綴 zhuluo-
 *   - loadCSS() 動態防護
 *   - overlay 掛載 document.body 且套用 registerOverlayResize
 *   - stopGame() 必須隱藏 container 並停掉 requestAnimationFrame
 * ========================================================================== */

(function () {
    'use strict';

    // =====================================================================
    // 可調參數
    // =====================================================================

    /** ⭐ 珠子落入「錯誤」格子後，停留在格底不動的時間（毫秒） */
    const WRONG_HOLD_MS = 300;
    /** ⭐ 停留結束後，縮小消失所花的時間（毫秒） */
    const WRONG_FADE_MS = 200;

    const STAGE_W = 500, STAGE_H = 850;
    /** canvas 的邏輯尺寸（與 CSS 的顯示尺寸一致，1:1 對應，不另做 DPR 放大） */
    const CW = 468, CH = 652;

    const BIN_COUNT = 7;           // 收納格固定七格
    const BALL_R_MAX = 29;         // 對齊 game26 小學難度的泡泡半徑
    /**
     * ⭐ 珠子縮放比例。
     * 干擾棒改成「以格寬為間距」的交錯格子之後（見 _layout），同排相鄰棒子的通道
     * 淨寬 = 格寬 − 2×棒半徑 = 66.9 − 10 = 56.9px，比原本 58px 的球徑還窄，球會
     * 直接卡死在兩根棒子中間。縮到 85% 後球徑 49.3px，左右各留 3.8px 餘裕，
     * 既過得去又仍然會被打得東倒西歪。（90% 時只剩 2.3px 餘裕，實測仍會卡。）
     */
    const BALL_SCALE = 0.85;
    const PEG_R = 5;               // 干擾棒（圓頭）半徑
    const WALL_BUMP_R = 13;        // 側牆導珠塊（半圓）半徑
    /** 收納格隔板的半厚度（實心擋板，珠子跨不過去；見 _collideDividers） */
    const DIVIDER_HW = 3;
    const PEG_FIELD_TOP = 96;      // 干擾棒區起始 y
    /** 安全閥：一顆球最多在台面上飛這麼久，超過就強制消失（正常情況不該發生） */
    const BALL_TTL_MS = 14000;
    const SPAWN_Y = 42;            // 珠子出生高度

    const GRAVITY = 0.62;          // 重力（px / frame²）
    const REST_PEG = 0.62;         // 撞干擾棒的彈性係數（調高＝彈得更兇、落點更難預測）
    const REST_WALL = 0.42;        // 撞牆的彈性係數
    const REST_BALL = 0.25;        // 球對球的彈性係數（偏低：位置修正本身會灌能量，太彈會抖個不停）
    /** 法線速度低於這個值就視為「靜置接觸」而非撞擊（見 _collidePegs 的長註解） */
    const CONTACT_V = 0.55;
    /** 靜置在棒子頂端時，每個子步給的滑落助推（讓球脫離不穩定平衡） */
    const ROLL_ASSIST = 0.09;
    const AIR = 0.999;             // 空氣阻力
    const MAX_SPEED = 16;          // 速度上限（避免穿透）
    const SUBSTEPS = 4;            // 每幀物理子步數（提高碰撞穩定度）
    const TRAIL_LEN = 14;          // 軌跡取樣點數

    /**
     * ⭐ 極輕微的「歸巢」側向加速度（px / frame²）。
     * 純粹的彈珠台是全機率的：五言時一顆球只有 1/5 機率掉進正確的格子，七律
     * 更只有 1/7，整首詩要落定得丟掉好幾百顆球。本頁是「看的」療癒頁而非考驗
     * 手氣的賭局，看不到詩成形就失去意義，因此給每顆球一點點朝自己目標格偏移
     * 的傾向。數值刻意壓到很小（約重力的 2%），球仍然被干擾棒打得東倒西歪、
     * 路徑仍然無法預測，只是長期而言比較容易回到自己的家。設 0 即為純機率。
     */
    const GUIDE_ACCEL = 0.014;

    /** 速度預設：scale 同時影響物理步進與發球間隔 */
    const SPEED_PRESETS = {
        slow: { label: '慢', scale: 0.70, emitMs: 900 },
        normal: { label: '正常', scale: 1.00, emitMs: 520 },
        fast: { label: '快', scale: 1.45, emitMs: 330 },
    };
    const DEFAULT_SPEED = 'normal';

    /** 詩體：lines = 句數（＝收納格堆疊層數）、chars = 每句字數（＝用到幾格） */
    const POEM_FORMS = [
        { key: '4x5', label: '五絕', sub: '四句五言', lines: 4, chars: 5 },
        { key: '4x7', label: '七絕', sub: '四句七言', lines: 4, chars: 7 },
        { key: '8x5', label: '五律', sub: '八句五言', lines: 8, chars: 5 },
        { key: '8x7', label: '七律', sub: '八句七言', lines: 8, chars: 7 },
    ];
    const DEFAULT_FORM = '4x5';

    /** 字位色相：五言五色（紅黃綠藍紫）、七言七色（紅橙黃綠藍靛紫） */
    const HUES_5 = [0, 44, 128, 212, 288];
    const HUES_7 = [0, 26, 50, 132, 202, 252, 298];

    const PUNCT_RE = /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g;

    /** 全詩完成後，隔多久自動換下一首（毫秒） */
    const AUTO_NEXT_MS = 6000;

    // =====================================================================
    // 小工具
    // =====================================================================
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const rnd = (a, b) => a + Math.random() * (b - a);

    // =====================================================================
    // 主模組
    // =====================================================================
    const ZhuLuo = {

        container: null,
        canvas: null,
        ctx: null,
        frameEl: null,

        // ── 設定 ──
        formKey: DEFAULT_FORM,
        speedKey: DEFAULT_SPEED,

        // ── 本輪資料 ──
        LINES: 4,
        CHARS: 5,
        binOffset: 1,        // 第 0 個字對應到第幾個收納格（五言置中 → 1）
        poemLines: [],
        poemMeta: null,
        hues: HUES_5,

        // ── 版面（每輪依詩體重算）──
        ballR: BALL_R_MAX,
        colW: CW / BIN_COUNT,
        binTop: 0,
        pegs: [],            // [{x, y, flash}]

        // ── 執行狀態 ──
        balls: [],           // 場上所有珠子
        stacks: [],          // stacks[bin] = 已定位的正確珠子（由下往上）
        nextLine: [],        // nextLine[字位] = 接下來要發第幾句（rows-1 → -1 代表該格完成）
        placed: [],          // placed[字位] = 已正確堆疊幾顆
        lineDone: [],        // lineDone[句] = 該句是否已完成
        particles: [],
        rings: [],
        emitCursor: 0,
        lastEmitAt: 0,
        finished: false,
        finishedAt: 0,
        active: false,
        rafId: null,
        lastFrameAt: 0,
        lastPegSoundAt: 0,
        seq: 0,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('zhuluo-css')) {
                const link = document.createElement('link');
                link.id = 'zhuluo-css';
                link.rel = 'stylesheet';
                link.href = 'zhuluo.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            const isFirst = !document.getElementById('zhuluo-container');
            if (isFirst) this.createDOM();
            this.container = document.getElementById('zhuluo-container');
            this.canvas = document.getElementById('zhuluo-canvas');
            this.frameEl = document.getElementById('zhuluo-canvas-frame');
            this.ctx = this.canvas.getContext('2d');
            if (isFirst) this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'zhuluo-container';
            div.className = 'zhuluo-overlay hidden';
            div.innerHTML = `
                <div class="zhuluo-header">
                    <div class="zhuluo-title">珠落玉盤</div>
                    <div id="zhuluo-poem-meta" class="zhuluo-poem-meta"></div>
                </div>
                <div id="zhuluo-close" class="zhuluo-close" aria-label="關閉">✕</div>

                <div class="zhuluo-stage-area">
                    <div id="zhuluo-canvas-frame" class="zhuluo-canvas-frame">
                        <canvas id="zhuluo-canvas" width="${CW}" height="${CH}"></canvas>
                    </div>
                </div>

                <div class="zhuluo-panel">
                    <div class="zhuluo-progress-wrap">
                        <div id="zhuluo-progress-bar" class="zhuluo-progress-bar"></div>
                        <div id="zhuluo-progress-text" class="zhuluo-progress-text"></div>
                    </div>
                    <div class="zhuluo-row">
                        <span class="zhuluo-row-label">詩體</span>
                        <div id="zhuluo-form-group" class="zhuluo-btn-group"></div>
                    </div>
                    <div class="zhuluo-row">
                        <span class="zhuluo-row-label">速度</span>
                        <div id="zhuluo-speed-group" class="zhuluo-btn-group"></div>
                        <button id="zhuluo-again" class="zhuluo-action-btn">換一首</button>
                    </div>
                </div>
            `;
            // ⚠️ 掛於 body（非 #stage：stage 有 transform 會造成 position:fixed 雙重縮放）
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
            document.getElementById('zhuluo-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('zhuluo-again').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playConfirmItem(); }
                this.newRound();
            });

            const formGroup = document.getElementById('zhuluo-form-group');
            POEM_FORMS.forEach(f => {
                const btn = document.createElement('button');
                btn.className = 'zhuluo-chip';
                btn.dataset.form = f.key;
                btn.innerHTML = `${f.label}<span class="zhuluo-chip-sub">${f.sub}</span>`;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.formKey = f.key;
                    this._syncChips();
                    this.newRound();
                });
                formGroup.appendChild(btn);
            });

            const speedGroup = document.getElementById('zhuluo-speed-group');
            Object.keys(SPEED_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'zhuluo-chip zhuluo-chip-narrow';
                btn.dataset.speed = k;
                btn.textContent = SPEED_PRESETS[k].label;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.speedKey = k;
                    this._syncChips();
                });
                speedGroup.appendChild(btn);
            });

            this._syncChips();
        },

        _syncChips: function () {
            document.querySelectorAll('#zhuluo-form-group .zhuluo-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.form === this.formKey);
            });
            document.querySelectorAll('#zhuluo-speed-group .zhuluo-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.speed === this.speedKey);
            });
        },

        // ========================================================
        // 取詩：找出連續 LINES 句、每句剛好 CHARS 字的詩（理由見檔頭註解）
        // ========================================================
        _pickPoem: function () {
            const need = this.LINES, width = this.CHARS;
            const pool = [];
            try {
                if (typeof POEMS !== 'undefined' && Array.isArray(POEMS)) {
                    for (const p of POEMS) {
                        if (!Array.isArray(p.content)) continue;
                        const lines = p.content.map(l => (l || '').replace(PUNCT_RE, '')).filter(l => l.length > 0);
                        // 從奇數句（index 偶數）起算，符合「兩句一聯」的詩詞原則
                        for (let s = 0; s + need <= lines.length; s += 2) {
                            const seg = lines.slice(s, s + need);
                            if (seg.every(l => l.length === width)) {
                                pool.push({ lines: seg, meta: { title: p.title || '', author: p.author || '', dynasty: p.dynasty || '' } });
                                break;
                            }
                        }
                    }
                }
            } catch (e) { console.warn('[珠落玉盤] 取詩失敗', e); }

            if (pool.length === 0) {
                // 降級保護：題庫不可用時給一首固定的詩，畫面仍可運作
                const f5 = ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉'];
                const f7 = ['朝辭白帝彩雲間', '千里江陵一日還', '兩岸猿聲啼不住', '輕舟已過萬重山'];
                const base = width === 5 ? f5 : f7;
                const lines = [];
                while (lines.length < need) lines.push(base[lines.length % base.length]);
                return { lines: lines, meta: { title: '靜夜思', author: '李白', dynasty: '唐' } };
            }
            return pool[Math.floor(Math.random() * pool.length)];
        },

        // ========================================================
        // 開新的一輪
        // ========================================================
        newRound: function () {
            const form = POEM_FORMS.find(f => f.key === this.formKey) || POEM_FORMS[0];
            this.LINES = form.lines;
            this.CHARS = form.chars;
            this.binOffset = Math.floor((BIN_COUNT - this.CHARS) / 2);
            this.hues = this.CHARS === 5 ? HUES_5 : HUES_7;

            const picked = this._pickPoem();
            this.poemLines = picked.lines;
            this.poemMeta = picked.meta;

            this._layout();

            // 重置所有執行狀態
            this.balls = [];
            this.particles = [];
            this.rings = [];
            this.stacks = new Array(BIN_COUNT);
            for (let i = 0; i < BIN_COUNT; i++) this.stacks[i] = [];
            this.nextLine = new Array(this.CHARS).fill(this.LINES - 1);
            this.placed = new Array(this.CHARS).fill(0);
            this.lineDone = new Array(this.LINES).fill(false);
            this.emitCursor = 0;
            this.lastEmitAt = 0;
            this.finished = false;
            this.finishedAt = 0;
            this.seq = 0;
            this.ttlKills = 0;

            if (this.frameEl) this.frameEl.classList.remove('all-done');
            this._updateMeta();
            this._updateProgress();

            this.lastFrameAt = performance.now();
            if (!this.rafId) this._loop();
        },

        /**
         * 版面計算：依句數決定珠子半徑與收納格高度。
         * ⚠️ 八句律詩要疊八層，若仍用 29px 半徑，收納格會吃掉整個台面、上方
         *    完全沒有干擾棒的空間，因此半徑會依 rows 自動縮小（收納區最多佔
         *    台面高度的 50%）。
         */
        _layout: function () {
            const rows = this.LINES;
            this.colW = CW / BIN_COUNT;
            const rByHeight = Math.floor((CH * 0.50 - 8) / (2 * rows));
            const rByWidth = Math.floor(this.colW / 2 - 4);
            // ⚠️ 最後再乘上 BALL_SCALE：干擾棒的通道寬是由格寬決定的固定值，
            //    球必須小於通道才過得去（理由見 BALL_SCALE 註解）。
            this.ballR = Math.max(10, Math.min(BALL_R_MAX, rByHeight, rByWidth) * BALL_SCALE);

            const binH = rows * this.ballR * 2 + 8;
            this.binTop = CH - binH;

            // ── 干擾棒：四排、上下等距、奇偶排左右錯開半個間距（參考實體彈珠台）──
            // ⚠️ 這裡的間距不能寫死，必須由「球一定要過得去」反推：
            //    每一條通道（含最外側那根棒子與側牆之間的那條）的淨寬都必須大於
            //    球徑。實測寫死 108 時，最外側的棒子距側牆只有 54px、通道僅 48px，
            //    比 58px 的球徑還窄——球一衝到邊上就永久楔死在牆與棒之間，該字位
            //    因為「同時只發一顆球」的規則從此再也不發球，整台就這樣停擺。
            //    因此改成：先算出合法的圓心可用範圍，再把棒子平均擺進去。
            // ══════════════════════════════════════════════════════════════
            // 干擾棒：以「收納格寬度」為間距的交錯格子（依《珠落玉盤軌道》標記）
            // ══════════════════════════════════════════════════════════════
            //  ⭐ 這是實體彈珠台的經典排法，兩種排交替出現：
            //      · 隔板排 (divider row)：棒子對齊每一片隔板的正上方（6 根）
            //      · 格心排 (centre row) ：棒子對齊每一格的正中央（5 根）＋兩側牆導珠塊
            //    最底下那一排剛好落在格口，也就是隔板本身的圓頭——所以隔板圓頭
            //    不是額外加的東西，它本來就是這個格子的最後一排。
            //
            //  ⭐ 為什麼這樣排是對的：格心排在上、隔板排在下，球被格心排打散之後，
            //    下一排的棒子正好站在隔板上方，等於替每一格做出一個漏斗口，把球
            //    導進格子而不是擋在格口。早期版本的棒子位置與格子完全無關，曾經
            //    出現「某一排的棒子正好站在正中央那格的正上方」而把整格封死的慘況。
            //
            //  ⚠️ 通道淨寬 = 格寬 − 2×棒半徑 = 66.9 − 10 = 56.9px，比原本 58px 的
            //    球徑還窄，球會直接卡死。因此球半徑統一乘上 BALL_SCALE（0.85）：
            //    球徑 49.3px，左右各留 3.8px 餘裕，既過得去又會被打得東倒西歪。
            this.pegs = [];
            const LEVELS = 5;                                  // 交錯格子的層數（最後一層＝格口）
            const gapY = (this.binTop - PEG_FIELD_TOP) / (LEVELS - 1);
            for (let lv = 0; lv < LEVELS; lv++) {
                const y = PEG_FIELD_TOP + lv * gapY;
                if (lv % 2 === 0) {
                    // 隔板排：對齊每一片隔板（最後一層剛好就是格口的隔板圓頭）
                    for (let i = 1; i < BIN_COUNT; i++) {
                        this.pegs.push({ x: i * this.colW, y: y, flash: 0, divider: (lv === LEVELS - 1) });
                    }
                } else {
                    // 格心排：對齊每一格中央，但最外側兩格改用側牆導珠塊
                    // （若在最外格中央也放棒子，牆與棒之間的縫隙比球徑還窄，會卡珠）
                    for (let i = 1; i < BIN_COUNT - 1; i++) {
                        this.pegs.push({ x: (i + 0.5) * this.colW, y: y, flash: 0 });
                    }
                    // 側牆導珠塊（半圓，圓心正好落在牆上）：背後沒有縫隙、不可能卡珠，
                    // 又能把貼著牆下來的球推回台面中央，避免兩側形成無障礙的直落通道。
                    this.pegs.push({ x: 0, y: y, flash: 0, wall: true, r: WALL_BUMP_R });
                    this.pegs.push({ x: CW, y: y, flash: 0, wall: true, r: WALL_BUMP_R });
                }
            }
        },

        _updateMeta: function () {
            const el = document.getElementById('zhuluo-poem-meta');
            if (!el || !this.poemMeta) return;
            let title = this.poemMeta.title || '';
            if (title.length > 12) title = title.substring(0, 10) + '...';
            el.textContent = `${title} ／ ${this.poemMeta.dynasty || ''} ／ ${this.poemMeta.author || ''}`;
        },

        _updateProgress: function () {
            const total = this.LINES * this.CHARS;
            let done = 0;
            for (let c = 0; c < this.CHARS; c++) done += this.placed[c];
            const bar = document.getElementById('zhuluo-progress-bar');
            const txt = document.getElementById('zhuluo-progress-text');
            if (bar) bar.style.width = (total ? (done / total * 100) : 0) + '%';
            if (txt) txt.textContent = this.finished ? '全詩歸位' : `${done} / ${total} 字`;
        },

        // ========================================================
        // 座標小工具
        // ========================================================
        /** 字位 c（0-based）對應的收納格編號 */
        _binOf: function (c) { return c + this.binOffset; },
        /** 收納格 b 的中心 x */
        _binCx: function (b) { return (b + 0.5) * this.colW; },
        /** 該格第 s 層（由下往上，0 起算）的珠心 y */
        _slotCy: function (s) { return CH - 4 - this.ballR - s * this.ballR * 2; },
        /** 收納格 b 是不是「沒有底」的空格（五言時最左最右兩格） */
        _isDeadBin: function (b) { return b < this.binOffset || b >= this.binOffset + this.CHARS; },

        // ========================================================
        // 發球
        // ========================================================
        /**
         * 依序輪流從還沒完成的字位發球。
         * ⚠️ 同一個字位同時間只允許一顆球在場上：否則兩顆同色球可能同時落入同一格，
         *    堆疊層數會算錯（第二顆會疊到第一顆還沒定位的位置上）。
         */
        _tryEmit: function (now) {
            const preset = SPEED_PRESETS[this.speedKey] || SPEED_PRESETS[DEFAULT_SPEED];
            if (now - this.lastEmitAt < preset.emitMs) return;

            // 台面上同時飛行的球數上限：純粹是畫面整潔與效能考量（球互撞是 O(n²)）
            let live = 0;
            for (const b of this.balls) if (b.state === 'fly' || b.state === 'settling') live++;
            if (live >= this.CHARS + 3) return;

            // ⚠️ 只要球已經鎖定了「不是自己的格子」（或正從無底的空格漏下去），這一顆
            //    就註定不會歸位了，該字位可以立刻補發下一顆，不必等它演完消失動畫——
            //    否則整台的出球節奏會被那 1.5 秒的停留＋淡出硬生生拖慢一倍以上。
            const inFlight = new Set();
            for (const b of this.balls) {
                if (b.state !== 'fly' && b.state !== 'settling') continue;
                if (b.passThrough) continue;
                if (b.bin >= 0 && b.bin !== b.targetBin) continue;
                inFlight.add(b.col);
            }

            for (let k = 0; k < this.CHARS; k++) {
                const c = (this.emitCursor + k) % this.CHARS;
                if (this.nextLine[c] < 0) continue;      // 這一格已經完成
                if (inFlight.has(c)) continue;           // 這一格已經有球在路上
                this._spawnBall(c, this.nextLine[c], now);
                this.emitCursor = (c + 1) % this.CHARS;
                this.lastEmitAt = now;
                return;
            }
        },

        _spawnBall: function (col, line, now) {
            const r = this.ballR;
            this.balls.push({
                id: ++this.seq,
                bornAt: now,
                col: col,
                line: line,
                targetBin: this._binOf(col),
                ch: this.poemLines[line][col],
                hue: this.hues[col],
                // ⚠️ 出球範圍只涵蓋「有底的那幾格」正上方：五言時最左最右兩格是空的，
                //    若還從整個台面寬度隨機出球，等於有一大部分的球一出生就注定往
                //    無底洞掉，命中率被白白稀釋。
                x: rnd(this.binOffset * this.colW + r + 4,
                    (this.binOffset + this.CHARS) * this.colW - r - 4),
                y: SPAWN_Y,
                vx: rnd(-1.4, 1.4),
                vy: 0,
                r: r,
                scale: 1,
                state: 'fly',       // fly → settling → settled ／ wrong ／ dead
                bin: -1,            // 進入收納格後鎖定的格號
                restY: 0,
                stackIndex: -1,
                wrongAt: 0,
                trail: [],
            });
            if (window.SoundManager && window.SoundManager.playOpenItem) {
                // 出球：極輕的木質「叩」聲
                window.SoundManager.playHit(0, 0.02);
            }
        },

        // ========================================================
        // 物理主迴圈
        // ========================================================
        _loop: function () {
            this.rafId = requestAnimationFrame(() => this._loop());
            if (!this.active) return;

            const now = performance.now();
            // dt 以「幀」為單位，並夾在 [0.2, 2.5] 之間避免分頁切回時一次跳太多
            let dt = clamp((now - this.lastFrameAt) / 16.667, 0.2, 2.5);
            this.lastFrameAt = now;
            const preset = SPEED_PRESETS[this.speedKey] || SPEED_PRESETS[DEFAULT_SPEED];
            dt *= preset.scale;

            if (!this.finished) this._tryEmit(now);
            this._step(dt, now);
            this._stepEffects(dt);
            this._draw(now);

            // 全詩完成後隔一段時間自動換下一首（療癒頁：不需要玩家操作）
            if (this.finished && this.finishedAt && now - this.finishedAt > AUTO_NEXT_MS) {
                this.newRound();
            }
        },

        _step: function (dt, now) {
            const h = dt / SUBSTEPS;
            for (let s = 0; s < SUBSTEPS; s++) {
                for (const b of this.balls) {
                    if (b.state === 'settled' || b.state === 'wrong' || b.state === 'dead') continue;
                    b.vy += GRAVITY * h;
                    // 極輕微地朝自己的目標格偏（理由見 GUIDE_ACCEL 註解）
                    if (b.bin < 0) {
                        const tx = this._binCx(b.targetBin);
                        if (Math.abs(tx - b.x) > 2) b.vx += Math.sign(tx - b.x) * GUIDE_ACCEL * h;
                    }
                    b.vx *= AIR;
                    // 速度上限（避免高速穿透干擾棒）
                    const sp = Math.hypot(b.vx, b.vy);
                    if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
                    b.x += b.vx * h;
                    b.y += b.vy * h;
                    this._collideWalls(b);
                    this._collidePegs(b);
                    this._collideDividers(b);
                }
                this._collideBalls();
                this._resolveBins(now);
            }
            // 軌跡取樣（每幀一次，不必每個子步）
            for (const b of this.balls) {
                if (b.state === 'fly' || b.state === 'settling') {
                    // ⚠️ 卡珠救援：同排干擾棒的間距只比球徑寬一點點，球有可能正好楔在
                    //    兩根棒子中間、兩邊法線互相抵銷而懸在半空來回微震。偵測到球
                    //    幾乎不動就給一記隨機側推，把它敲下來（實體彈珠台也是用震的）。
                    if (Math.hypot(b.vx, b.vy) < 0.6) {
                        b.stuck = (b.stuck || 0) + 1;
                        if (b.stuck > 18) {
                            b.vx += rnd(-4.5, 4.5);
                            b.vy += 3.0;
                            b.stuck = 0;
                        }
                    } else {
                        b.stuck = 0;
                    }
                    // 安全閥：真的怎麼樣都下不來的球（理論上不該發生）就讓它化掉，
                    // 免得該字位因為「同時只發一顆」的規則從此永遠不再出球。
                    if (now - b.bornAt > BALL_TTL_MS) {
                        b.state = 'dead';
                        this.ttlKills++;
                        this._spark(b.x, b.y, b.hue, 10);
                    }
                    b.trail.push(b.x, b.y);
                    if (b.trail.length > TRAIL_LEN * 2) b.trail.splice(0, 2);
                } else if (b.trail.length) {
                    b.trail.splice(0, 2);
                }
            }
            // 清掉已消失的球
            this.balls = this.balls.filter(b => b.state !== 'dead');
        },

        _collideWalls: function (b) {
            const r = b.r;
            if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * REST_WALL; this._spark(b.x, b.y, b.hue, 3); }
            if (b.x > CW - r) { b.x = CW - r; b.vx = -Math.abs(b.vx) * REST_WALL; this._spark(b.x, b.y, b.hue, 3); }
            if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * REST_WALL; }
        },

        /**
         * ⭐ 收納格之間的隔板：從格口一路延伸到台底的實心擋板，珠子絕對跨不過去。
         *
         * 先前隔板只是「畫出來的木條」，實際擋住珠子的是 _resolveBins 裡「跨過格口
         * 時鎖定格號、之後把 x 夾在該格範圍內」的邏輯——功能上雖然也跨不過去，但那是
         * 瞬間的位置修正，珠子在格口附近會有一瞬間壓在隔板上、甚至看起來像從隔板中間
         * 穿過去。改成真正的碰撞之後，珠子會實實在在地撞在隔板上彈開。
         *
         * 幾何上把隔板當成「垂直的膠囊」（線段 + 半徑），線段由格口延伸到台底。
         * ⚠️ 淨寬檢查：格寬 66.9 − 2×隔板半厚 6 = 60.9px，大於球徑 49.3px，
         *    球進得去也不會卡在隔板與隔板之間。
         */
        _collideDividers: function (b) {
            if (b.y + b.r < this.binTop) return;      // 還沒到格口高度
            const hw = DIVIDER_HW;
            for (let i = 1; i < BIN_COUNT; i++) {
                const x = i * this.colW;
                const dx = b.x - x;
                const rr = b.r + hw;
                if (Math.abs(dx) > rr) continue;
                // 線段上離球心最近的點（超出兩端就取端點，形成圓角）
                const cy = clamp(b.y, this.binTop, CH);
                const dy = b.y - cy;
                const d = Math.hypot(dx, dy);
                if (d >= rr) continue;
                let nx, ny;
                if (d === 0) { nx = (dx >= 0 ? 1 : -1); ny = 0; }
                else { nx = dx / d; ny = dy / d; }
                b.x += nx * (rr - d);
                b.y += ny * (rr - d);
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) {
                    b.vx -= (1 + REST_WALL) * vn * nx;
                    b.vy -= (1 + REST_WALL) * vn * ny;
                }
            }
        },

        _collidePegs: function (b) {
            // 正在從無底空格漏下去的珠子不再與任何東西互動（見 _collideBalls 註解）
            if (b.passThrough) return;
            for (const p of this.pegs) {
                // ⚠️ 隔板圓頭（最後一排）只在球還沒進格時有效：球一旦鎖定了格子就
                //    由 _resolveBins 接手把它吸到格中央，此時再撞隔板只會打架。
                if (p.divider && b.bin >= 0) continue;
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
                if (vn >= 0) continue;               // 正在離開，不算碰撞

                if (vn < -CONTACT_V) {
                    // ── 真正的撞擊：反彈 ＋ 火花 ＋ 音效 ──
                    b.vx -= (1 + REST_PEG) * vn * nx;
                    b.vy -= (1 + REST_PEG) * vn * ny;
                    // ⚠️ 一點點隨機側向：完全對稱地正中干擾棒時球會垂直原地彈跳，
                    //    這個擾動是打破對稱的關鍵。
                    b.vx += rnd(-0.5, 0.5);
                    p.flash = 1;
                    this._spark(p.x, p.y, b.hue, 5);
                    this._pegSound();
                } else {
                    // ── 靜置接觸（球停在棒子頂端）──
                    // ⚠️ 這一段是整個模擬能不能跑的關鍵。若把「靜置接觸」也當成撞擊
                    //    處理，球每一個子步都會被彈性係數重新抵銷掉速度、又被隨機側推
                    //    左右拉扯，於是永遠平衡在棒子頂端下不來；後面同字位的球因為
                    //    「一格同時只發一顆」的規則就再也不發，整台癱瘓（實測 600 秒
                    //    只發得出 79 顆球）。正確做法是：只消掉法線方向的速度、不加
                    //    彈性、不放特效，讓重力的切線分量自然把球帶著滑下去，並在球
                    //    幾乎正對棒子頂端（切線方向趨近 0）時給一個固定方向的微推，
                    //    加速脫離這個不穩定平衡點。
                    b.vx -= vn * nx;
                    b.vy -= vn * ny;
                    b.vx += (Math.abs(nx) < 0.25 ? (nx >= 0 ? 1 : -1) : Math.sign(nx)) * ROLL_ASSIST;
                }
            }
        },

        /** 球與球的彈性碰撞（等質量）：只處理仍在飛的球，已定位的視為靜止障礙 */
        _collideBalls: function () {
            const arr = this.balls;
            for (let i = 0; i < arr.length; i++) {
                const a = arr[i];
                // ⚠️ 已判定要「穿過無底空格」的珠子必須完全不參與碰撞。
                //    否則它會卡在該格已定位珠子的頭頂上永遠掉不下去（實測這正是
                //    安全閥被大量觸發的元兇），而那個字位因為「同時只發一顆」的
                //    規則也就跟著停擺。
                if (a.state === 'dead' || a.passThrough) continue;
                for (let j = i + 1; j < arr.length; j++) {
                    const b = arr[j];
                    if (b.state === 'dead' || b.passThrough) continue;
                    const aStatic = (a.state === 'settled' || a.state === 'wrong');
                    const bStatic = (b.state === 'settled' || b.state === 'wrong');
                    if (aStatic && bStatic) continue;

                    const dx = b.x - a.x, dy = b.y - a.y;
                    const rr = a.r * a.scale + b.r * b.scale;
                    if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
                    const d = Math.hypot(dx, dy);
                    if (d >= rr || d === 0) continue;

                    const nx = dx / d, ny = dy / d;
                    const overlap = rr - d;
                    // 靜止的一方不被推開，全部位移由會動的那一方吸收
                    if (aStatic) { b.x += nx * overlap; b.y += ny * overlap; }
                    else if (bStatic) { a.x -= nx * overlap; a.y -= ny * overlap; }
                    else {
                        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
                        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
                    }

                    const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
                    const vn = rvx * nx + rvy * ny;
                    if (vn >= 0) continue;
                    const imp = -(1 + REST_BALL) * vn / ((aStatic ? 0 : 1) + (bStatic ? 0 : 1) || 1);
                    if (!aStatic) { a.vx -= imp * nx; a.vy -= imp * ny; }
                    if (!bStatic) { b.vx += imp * nx; b.vy += imp * ny; }
                    // 珠子互撞：小小的白色火花
                    this._spark((a.x + b.x) / 2, (a.y + b.y) / 2, 45, 3, true);
                }
            }
        },

        /** 收納格區域：鎖定格號、對齊格心、判定正確／錯誤、堆疊定位 */
        _resolveBins: function (now) {
            for (const b of this.balls) {
                if (b.state === 'settled' || b.state === 'wrong' || b.state === 'dead') continue;

                // 尚未到達格口
                if (b.y + b.r < this.binTop) continue;

                // 第一次跨過格口 → 鎖定落入哪一格
                if (b.bin < 0) {
                    b.bin = clamp(Math.floor(b.x / this.colW), 0, BIN_COUNT - 1);
                    b.state = 'settling';
                    if (this._isDeadBin(b.bin)) {
                        // 沒有底的空格：直接穿過去
                        b.passThrough = true;
                    } else if (b.bin === b.targetBin) {
                        // ⚠️ 正確的珠子進場時，把這一格裡「掉錯進來、正在等著消失」的
                        //    那顆立刻打散：否則正確的珠子會疊在一顆即將憑空消失的球
                        //    上面，等它消失後就變成浮在半空。順便也是個好看的特效。
                        // ⚠️ 必須清掉「全部」的錯珠而不只是第一顆：錯珠是可以互相
                        //    堆疊的，只清一顆的話上面那幾顆會擋住正確珠的落點。
                        for (const o of this.balls) {
                            if (o !== b && o.bin === b.bin && !o.passThrough &&
                                (o.state === 'wrong' || (o.state === 'settling' && o.bin !== o.targetBin))) {
                                o.state = 'dead';
                                this._spark(o.x, o.y, 0, 12);
                            }
                        }
                        b.stackIndex = this.stacks[b.bin].length;
                        b.restY = this._slotCy(b.stackIndex);
                    } else if (this._incomingCorrect(b.bin)) {
                        // ⚠️ 這一格已經有「正確的」珠子在路上了：讓這顆掉錯的當場彈散，
                        //    把落點讓出來。否則正確的珠子會停在錯珠的頭頂上，等錯珠
                        //    1.5 秒後消失，它就變成浮在半空中。
                        b.state = 'dead';
                        this._spark(b.x, b.y, 0, 10);
                        if (window.SoundManager) window.SoundManager.playHit(4, 0.04);
                        continue;
                    } else {
                        // ⚠️ 掉錯的珠子「不」預先算好自己該停在第幾層。
                        //    早期版本是在鎖定當下用「已有的錯珠數」算層數，但前面幾顆
                        //    當時還在半空（尚未計入），於是同一格的錯珠全算出同一層、
                        //    互相擋著誰也到不了定位，那一格就永久塞死。
                        //    改成：只給一個「地板高度」（正確堆疊的頂端），能掉多低就
                        //    掉多低，剩下的交給球與球的碰撞自然把它撐住，再用
                        //    「幾乎不動了」來判定停穩。這樣才能真的疊得起來。
                        b.stackIndex = this.stacks[b.bin].length;
                        b.restY = this._slotCy(b.stackIndex);
                        b.restCheck = 0;
                        b.lastY = b.y;
                    }
                }

                if (b.passThrough) {
                    if (b.y - b.r > CH) b.state = 'dead';
                    continue;
                }

                // 在格內：橫向逐漸吸附到格中心，讓堆疊整齊
                const cx = this._binCx(b.bin);
                b.x += (cx - b.x) * 0.22;
                b.vx *= 0.6;
                // 隔板側牆
                const left = b.bin * this.colW + 3 + b.r;
                const right = (b.bin + 1) * this.colW - 3 - b.r;
                if (left <= right) b.x = clamp(b.x, left, right);

                if (b.bin === b.targetBin) {
                    // 正確的珠子一定要到達自己那一層的精確高度（落點已預先淨空）
                    if (b.y >= b.restY) {
                        b.y = b.restY;
                        b.vx = 0; b.vy = 0;
                        this._onCorrect(b, now);
                    }
                } else {
                    // 掉錯的珠子：碰到地板、或被下面的珠子撐住而幾乎不動了，就停在原地
                    if (b.y >= b.restY) {
                        b.y = b.restY;
                        b.vx = 0; b.vy = 0;
                        this._onWrong(b, now);
                    } else {
                        if (Math.abs(b.y - b.lastY) < 0.12 && Math.abs(b.vy) < 0.6) b.restCheck++;
                        else b.restCheck = 0;
                        b.lastY = b.y;
                        if (b.restCheck > 10 * SUBSTEPS) { b.vx = 0; b.vy = 0; this._onWrong(b, now); }
                    }
                }
            }

            // 錯誤球的停留 → 縮小 → 消失
            for (const b of this.balls) {
                if (b.state !== 'wrong') continue;
                const age = now - b.wrongAt;
                if (age <= WRONG_HOLD_MS) { b.scale = 1; continue; }
                const t = (age - WRONG_HOLD_MS) / WRONG_FADE_MS;
                if (t >= 1) { b.state = 'dead'; this._spark(b.x, b.y, 0, 8); }
                else b.scale = 1 - t;
            }
        },

        /** 該格裡是否已經有一顆「掉錯進來」的珠子（停著或正在落下） */
        _pendingIn: function (bin) {
            for (const b of this.balls) {
                if (b.bin !== bin || b.passThrough) continue;
                if (b.state === 'wrong') return b;
                if (b.state === 'settling' && b.bin !== b.targetBin) return b;
            }
            return null;
        },

        /**
         * 這一格裡是不是已經有一顆「正確的」珠子在格內下落。
         * ⚠️ 判斷依據是 b.bin（已經進到這一格），不是 b.targetBin——用 targetBin 會
         *    幾乎永遠成立（「一個字位同時只發一顆球」意味著該格的正確珠幾乎總是在
         *    路上），於是所有掉錯的珠子都被當場清掉，使用者指定的「錯誤停留 1 秒再
         *    縮小消失」效果就幾乎看不到了（實測 199 顆裡有 171 顆被誤殺）。
         */
        _incomingCorrect: function (bin) {
            for (const b of this.balls) {
                if (b.passThrough || b.state !== 'settling') continue;
                if (b.bin === bin && b.bin === b.targetBin) return true;
            }
            return false;
        },

        // ── 落入正確格子 ──
        _onCorrect: function (b, now) {
            b.state = 'settled';
            b.scale = 1;
            b.trail.length = 0;
            this.stacks[b.bin].push(b);

            const c = b.col;
            this.placed[c]++;
            this.nextLine[c]--;

            // ⚠️ 這一格若還壓著別人掉錯進來的球，立刻讓它們開始消失：
            //    否則正確的珠子會疊在一顆即將憑空消失的球上面，看起來像浮空。
            for (const o of this.balls) {
                if (o.state === 'wrong' && o.bin === b.bin && o.wrongAt > 0) {
                    o.wrongAt = Math.min(o.wrongAt, now - WRONG_HOLD_MS);
                }
            }

            this._ring(b.x, b.y, b.hue, this.ballR * 2.6);
            this._spark(b.x, b.y, 45, 14);
            if (window.SoundManager) window.SoundManager.playSuccessShort();

            this._updateProgress();
            this._checkLineDone(now);
        },

        // ── 落入錯誤格子 ──
        _onWrong: function (b, now) {
            b.state = 'wrong';
            b.wrongAt = now;
            this._ring(b.x, b.y, 0, this.ballR * 1.8);
            this._spark(b.x, b.y, 0, 8);
            if (window.SoundManager) window.SoundManager.playHit(3, 0.05);
        },

        /** 檢查是否有整句完成／全詩完成 */
        _checkLineDone: function (now) {
            for (let k = this.LINES - 1; k >= 0; k--) {
                if (this.lineDone[k]) continue;
                // 第 k 句位於堆疊的第 (LINES-1-k) 層 → 需要 placed >= LINES-k
                let ok = true;
                for (let c = 0; c < this.CHARS; c++) {
                    if (this.placed[c] < this.LINES - k) { ok = false; break; }
                }
                if (!ok) continue;
                this.lineDone[k] = true;
                this._celebrateLine(k);
            }

            let all = true;
            for (let c = 0; c < this.CHARS; c++) if (this.placed[c] < this.LINES) { all = false; break; }
            if (all && !this.finished) {
                this.finished = true;
                this.finishedAt = now;
                this._celebrateAll();
            }
        },

        _celebrateLine: function (k) {
            const s = this.LINES - 1 - k;      // 該句在堆疊中的層數
            const cy = this._slotCy(s);
            for (let c = 0; c < this.CHARS; c++) {
                const b = this._binOf(c);
                const cx = this._binCx(b);
                // 由左至右一顆一顆亮起來
                setTimeout(() => {
                    if (!this.active) return;
                    this._ring(cx, cy, this.hues[c], this.ballR * 3.2);
                    this._spark(cx, cy, this.hues[c], 10);
                }, c * 90);
            }
            if (window.SoundManager) window.SoundManager.playJoyfulTriple();
        },

        _celebrateAll: function () {
            if (this.frameEl) this.frameEl.classList.add('all-done');
            if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
            // 由下往上，一層一層掀起金色浪花
            for (let s = 0; s < this.LINES; s++) {
                setTimeout(() => {
                    if (!this.active) return;
                    const cy = this._slotCy(s);
                    for (let c = 0; c < this.CHARS; c++) {
                        this._ring(this._binCx(this._binOf(c)), cy, 45, this.ballR * 4);
                        this._spark(this._binCx(this._binOf(c)), cy, 45, 12);
                    }
                    if (window.SoundManager) window.SoundManager.playGuzheng(s % 7, 0.5);
                }, s * 220);
            }
            this._updateProgress();
        },

        // ========================================================
        // 特效：粒子與擴散圓環
        // ========================================================
        _spark: function (x, y, hue, count, white) {
            for (let i = 0; i < count; i++) {
                const a = rnd(0, Math.PI * 2);
                const sp = rnd(0.6, 3.6);
                this.particles.push({
                    x: x, y: y,
                    vx: Math.cos(a) * sp,
                    vy: Math.sin(a) * sp - 0.6,
                    life: 1, decay: rnd(0.02, 0.055),
                    size: rnd(1.6, 3.8),
                    hue: hue, white: !!white,
                });
            }
            // 粒子上限：避免長時間播放後數量無限成長拖慢畫面
            if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
        },

        _ring: function (x, y, hue, maxR) {
            this.rings.push({ x: x, y: y, r: this.ballR * 0.6, maxR: maxR, life: 1, hue: hue });
            if (this.rings.length > 40) this.rings.splice(0, this.rings.length - 40);
        },

        _stepEffects: function (dt) {
            for (const p of this.particles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vy += 0.10 * dt;
                p.vx *= 0.985;
                p.life -= p.decay * dt;
            }
            this.particles = this.particles.filter(p => p.life > 0);

            for (const r of this.rings) {
                r.r += (r.maxR - r.r) * 0.16 * dt;
                r.life -= 0.045 * dt;
            }
            this.rings = this.rings.filter(r => r.life > 0);

            for (const p of this.pegs) if (p.flash > 0) p.flash = Math.max(0, p.flash - 0.09 * dt);
        },

        _pegSound: function () {
            const now = performance.now();
            if (now - this.lastPegSoundAt < 55) return;   // 節流：碰撞極密集時不要疊音
            this.lastPegSoundAt = now;
            if (window.SoundManager) window.SoundManager.playHit(Math.floor(rnd(0, 5)), 0.03);
        },

        // ========================================================
        // 繪製
        // ========================================================
        _draw: function (now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, CW, CH);
            this._drawBoard(ctx, now);
            this._drawBins(ctx);
            this._drawPegs(ctx);
            this._drawTrails(ctx);
            this._drawRings(ctx);
            for (const b of this.balls) this._drawBall(ctx, b);
            this._drawParticles(ctx);
        },

        /** 台面：淺色檜木底＋細木紋 */
        _drawBoard: function (ctx, now) {
            const g = ctx.createLinearGradient(0, 0, 0, CH);
            g.addColorStop(0, 'hsl(38, 44%, 82%)');
            g.addColorStop(0.55, 'hsl(35, 40%, 74%)');
            g.addColorStop(1, 'hsl(32, 36%, 66%)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, CW, CH);

            // 木紋：幾條極淡的縱向弧線
            ctx.save();
            ctx.globalAlpha = 0.10;
            ctx.strokeStyle = 'hsl(28, 45%, 42%)';
            ctx.lineWidth = 1.4;
            for (let i = 0; i < 9; i++) {
                const x = (i + 0.5) * (CW / 9);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.bezierCurveTo(x + 16, CH * 0.3, x - 16, CH * 0.7, x + 5, CH);
                ctx.stroke();
            }
            ctx.restore();

            // 出球區的淡淡陰影，暗示「珠子從這裡落下」
            ctx.save();
            const sg = ctx.createLinearGradient(0, 0, 0, SPAWN_Y + 30);
            sg.addColorStop(0, 'hsla(28, 40%, 30%, 0.30)');
            sg.addColorStop(1, 'hsla(28, 40%, 30%, 0)');
            ctx.fillStyle = sg;
            ctx.fillRect(0, 0, CW, SPAWN_Y + 30);
            ctx.restore();
        },

        /** 收納格：隔板＋每一格每一層的「底圖字」（淡淡的目標字，作為視覺引導） */
        _drawBins: function (ctx) {
            const r = this.ballR;
            // 格底凹槽
            ctx.save();
            for (let b = 0; b < BIN_COUNT; b++) {
                const x0 = b * this.colW + 3;
                const w = this.colW - 6;
                ctx.fillStyle = this._isDeadBin(b)
                    ? 'hsla(28, 30%, 40%, 0.16)'   // 沒有底的空格：更暗，暗示「會漏下去」
                    : 'hsla(30, 35%, 52%, 0.26)';
                ctx.fillRect(x0, this.binTop, w, CH - this.binTop);
            }
            ctx.restore();

            // 底圖字：由上而下＝第一句到最後一句
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.floor(r * 1.5)}px "Noto Serif TC", serif`;
            for (let c = 0; c < this.CHARS; c++) {
                const bin = this._binOf(c);
                const cx = this._binCx(bin);
                for (let k = 0; k < this.LINES; k++) {
                    const s = this.LINES - 1 - k;
                    if (this.placed[c] > s) continue;   // 已經被真珠子蓋住了，不必畫底圖
                    // 底圖字帶一點該字位的顏色，暗示「這一格是紅／黃／綠……的家」
                    ctx.fillStyle = `hsla(${this.hues[c]}, 72%, 34%, 0.66)`;
                    ctx.fillText(this.poemLines[k][c], cx, this._slotCy(s) + r * 0.04);
                }
            }
            ctx.restore();

            // 隔板（木條）
            ctx.save();
            for (let i = 1; i < BIN_COUNT; i++) {
                const x = i * this.colW;
                // ⚠️ 寬度必須與 DIVIDER_HW 的碰撞厚度一致，玩家看到的擋板才等於
                //    實際擋住珠子的擋板（畫得比碰撞窄會看起來像穿模）。
                const gr = ctx.createLinearGradient(x - DIVIDER_HW, 0, x + DIVIDER_HW, 0);
                gr.addColorStop(0, 'hsl(28, 42%, 46%)');
                gr.addColorStop(0.45, 'hsl(36, 50%, 88%)');
                gr.addColorStop(1, 'hsl(26, 42%, 38%)');
                ctx.fillStyle = gr;
                ctx.fillRect(x - DIVIDER_HW, this.binTop, DIVIDER_HW * 2, CH - this.binTop);
                // 圓頭不在這裡畫：它已經是干擾棒格子的最後一排，交給 _drawPegs 畫
            }
            // 台底橫木（只畫在有底的格子下面）
            for (let c = 0; c < this.CHARS; c++) {
                const bin = this._binOf(c);
                ctx.fillStyle = 'hsl(28, 42%, 44%)';
                ctx.fillRect(bin * this.colW + 3, CH - 4, this.colW - 6, 4);
            }
            ctx.restore();
        },

        _drawPegs: function (ctx) {
            for (const p of this.pegs) {
                // 側牆導珠塊的圓心在畫布外，只會畫出朝內的那半邊，正是想要的樣子
                const r = (p.r || PEG_R) + p.flash * 2.5;
                // 金屬圓頭：上亮下暗的小球
                const g = ctx.createRadialGradient(p.x - r * 0.4, p.y - r * 0.45, r * 0.1, p.x, p.y, r);
                g.addColorStop(0, 'hsl(40, 30%, 96%)');
                g.addColorStop(0.6, 'hsl(34, 22%, 72%)');
                g.addColorStop(1, 'hsl(28, 25%, 42%)');
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();
                if (p.flash > 0) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r + 5 * p.flash, 0, Math.PI * 2);
                    ctx.strokeStyle = `hsla(45, 100%, 70%, ${0.75 * p.flash})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        },

        /** 半透明彩色軌跡線：越舊越淡越細 */
        _drawTrails: function (ctx) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const b of this.balls) {
                const t = b.trail;
                if (t.length < 4) continue;
                const n = t.length / 2;
                for (let i = 1; i < n; i++) {
                    const a = i / n;
                    ctx.beginPath();
                    ctx.moveTo(t[(i - 1) * 2], t[(i - 1) * 2 + 1]);
                    ctx.lineTo(t[i * 2], t[i * 2 + 1]);
                    ctx.strokeStyle = `hsla(${b.hue}, 85%, 62%, ${0.42 * a})`;
                    ctx.lineWidth = b.r * 0.9 * a;
                    ctx.stroke();
                }
            }
            ctx.restore();
        },

        _drawRings: function (ctx) {
            ctx.save();
            for (const r of this.rings) {
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${r.hue}, 95%, 65%, ${0.75 * r.life})`;
                ctx.lineWidth = 3 * r.life + 1;
                ctx.stroke();
            }
            ctx.restore();
        },

        /** 珠子：沿用 game26 的圓珠語彙（徑向漸層＋左上高光＋深色描邊＋墨黑字） */
        _drawBall: function (ctx, b) {
            const r = b.r * b.scale;
            if (r <= 0.5) return;
            const hue = b.hue;
            const sat = 62, baseL = 74;

            ctx.save();
            ctx.globalAlpha = (b.state === 'wrong' && b.scale < 1) ? Math.max(0, b.scale) : 1;

            // 落地陰影
            ctx.beginPath();
            ctx.ellipse(b.x, b.y + r * 0.92, r * 0.8, r * 0.22, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.fill();

            const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
            g.addColorStop(0, `hsl(${hue}, ${sat}%, ${Math.min(98, baseL + 18)}%)`);
            g.addColorStop(0.55, `hsl(${hue}, ${sat}%, ${baseL}%)`);
            g.addColorStop(1, `hsl(${hue}, ${sat}%, ${Math.max(20, baseL - 26)}%)`);
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();

            // 已定位的珠子：金色描邊，和還在飛的區隔開
            ctx.strokeStyle = (b.state === 'settled')
                ? 'hsla(45, 100%, 55%, 0.95)'
                : `hsla(${hue}, 55%, 24%, 0.85)`;
            ctx.lineWidth = (b.state === 'settled') ? 2.4 : 1.5;
            ctx.stroke();

            // 上方白色高光
            ctx.beginPath();
            ctx.arc(b.x - r * 0.35, b.y - r * 0.4, r * 0.32, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.55)';
            ctx.fill();

            // 字（textBaseline middle + 微下偏補中文字視覺基線）
            ctx.fillStyle = 'hsl(220, 30%, 14%)';
            ctx.font = `900 ${Math.floor(r * 1.33)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.ch || '', b.x, b.y + r * 0.04);
            ctx.restore();
        },

        _drawParticles: function (ctx) {
            ctx.save();
            for (const p of this.particles) {
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.white
                    ? 'hsla(0, 0%, 100%, 0.95)'
                    : `hsl(${p.hue}, 95%, 68%)`;
                ctx.fill();
            }
            ctx.restore();
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this.newRound();
        },

        hide: function () { this.stopGame(); },

        // ⚠️ menu.js 的全域清理只呼叫 stopGame()，因此這裡必須自行隱藏 overlay
        stopGame: function () {
            this.active = false;
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.ZhuLuo = ZhuLuo;

    // URL 參數啟動（與其他模組一致，精確比對）
    if (new URLSearchParams(window.location.search).get('page') === 'zhuluo') {
        const start = () => {
            if (window.ZhuLuo) window.ZhuLuo.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
