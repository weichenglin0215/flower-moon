/* ============================================================================
 * tuibo.js — 推波助瀾（字粒推擠水波．視覺療癒頁）
 * ----------------------------------------------------------------------------
 * 脫胎自「一池春水」(yichichunshui.js)，同樣用 2D 波動方程式在文字格點上跑漣漪，
 * 但關注點完全不同：
 *
 *   一池春水 → 看的是「亮度」：波峰變亮、波谷變暗，字的位置固定不動。
 *   推波助瀾 → 看的是「尺寸與位移」：
 *     1. 字數只有一池春水的 1/4（25×43），因此每個字的尺寸放大成 200%，
 *        尺寸變化才看得清楚。
 *     2. 波峰處的字放大、波谷處的字縮小（與一池春水相同）。
 *     3. ⭐ 每個字的位置會被「相鄰的字的尺寸」推擠或吸引：
 *        鄰居脹大 → 把我往外推；鄰居縮小 → 把我往它那邊吸。
 *        數學上就是「位移 = −(尺寸場的梯度)」，因此位移量隨位置連續變化，
 *        不會有一格一格的接縫。
 *     4. 點擊畫面時是「往下凹」（負振幅）：被點的字先縮小 50%，相鄰的字被
 *        吸往中央；下一幀震波往外傳，換相鄰的字縮小、再吸引更外圈的字。
 *     5. 字一律白色、不透明度固定，先只呈現尺寸與位移的變化。
 *
 * 【物理模型】與一池春水相同：
 *       u_next = 2u − u_prev + c² · ∇²u ，再乘上阻尼係數
 *   邊界為 Neumann（鏡射）條件 → 波撞到畫面邊緣會同相反射自然回彈。
 *
 * 【效能】字形圖集（glyph atlas）預繪一次，每幀只做 1075 次 drawImage。
 *   雖然字大了 4 倍面積，但字數少了 4 倍，填色率與一池春水相當。
 *
 * 慣例：所有 CSS class 加 tuibo- 前綴；overlay 掛於 document.body（非 #stage，
 *       因 stage 有 transform 會造成 position:fixed 二次縮放）；透過
 *       registerOverlayResize 同步舞台縮放；window.TuiBo 掛全域供 menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;

    // ── 文字格點：字數為一池春水（50×85=4250）的約 1/4 ──
    const COLS = 25;                       // 橫向字數（一池春水的一半）
    const ROWS = 43;                       // 縱向字數（一池春水的一半）
    const CELL_W = STAGE_W / COLS;         // 每格寬度 = 20px
    const CELL_H = STAGE_H / ROWS;         // 每格高度 ≈ 19.77px（接近正方格）
    const TOTAL = COLS * ROWS;             // 1075 個字

    // 字級 = 一池春水的 200%（9.8 → 19.6）。格子也剛好變成兩倍寬，因此整體的
    // 覆蓋密度不變，但單字放大後尺寸變化才看得明顯。
    const FONT_BASE = 19.6;

    // ── 字形圖集參數 ──
    const ATLAS_PAD = 1.25;                // 圖集單格邊長 = 字級 × 此係數（留白避免裁切）
    const ATLAS_L = FONT_BASE * ATLAS_PAD; // 圖集單格「邏輯」邊長
    // 圖集解析度倍率：字數只剩 1/4，可以比一池春水（1.4）畫得清楚一些，
    // 讓放大到波峰的字不至於糊掉。
    const ATLAS_RES = 1.6;

    // ── 波動方程式參數 ──
    // ⭐ 漣漪每幀往外前進幾「格」。格數只剩一半，若沿用一池春水的 0.125，
    //    漣漪橫越畫面的時間會只剩一半（看起來快一倍），因此這裡減半。
    const WAVE_SPEED = 0.0625;

    // 由 WAVE_SPEED 反推模擬參數：單步波速受穩定條件限制（正方格 C2 ≤ 0.5，
    // 即每步最多 0.707 格），超過就自動拆成多個子步驟。
    const SUBSTEPS = Math.max(1, Math.ceil(WAVE_SPEED / 0.65));
    const WAVE_C2 = (WAVE_SPEED / SUBSTEPS) * (WAVE_SPEED / SUBSTEPS);

    // 兩軸耦合強度依格子長寬比調整，否則漣漪會被拉成橢圓。
    const WAVE_KX = 1.0;
    const WAVE_KY = (CELL_W / CELL_H) * (CELL_W / CELL_H);

    // 每個子步驟的阻尼（越接近 1 漣漪存活越久）。
    // ⚠️ 這是「每步」而非「每秒」：WAVE_SPEED 調慢後漣漪要走更多步才到得了邊緣，
    //    衰減也就更多，故取得比一池春水（0.985）更接近 1。
    const WAVE_DAMP = 0.995;
    // 波場振幅硬上限。⚠️ 不可省略：波的能量取決於 (u − u_prev)，狂點同一點時
    // 每次都把 u 拉到上限、u_prev 還在谷底，等於持續灌入巨大初速度。
    const U_MAX = 1.66;

    // ── 視覺映射：尺寸 ──
    const SCALE_K = 0.95;        // 振幅 → 縮放的敏感度
    const SCALE_MIN = 0.22;      // 波谷最小縮放
    const SCALE_MAX = 36.0;      // 波峰最大縮放
    const CHAR_ALPHA = 1.0;     // 字的不透明度（固定，不隨波形改變 → 一律白色）

    // ── 視覺映射：位移（本頁的主角）──
    // 位移 = −(尺寸場的梯度) × PUSH_K × 格寬。
    //   鄰居比我大（梯度指向鄰居）→ 我被往反方向推開；
    //   鄰居比我小 → 梯度反向 → 我被吸過去。
    const PUSH_K = 4.0;                     // 推擠強度
    const MAX_SHIFT = CELL_W * 10.0;         // 位移量上限（px），避免字疊成一團

    // ── 互動擾動參數 ──
    // ⚠️ 負值：點下去是「凹一個坑」——被點的字先縮小，鄰居被吸往中央，
    //    下一幀震波才往外傳。這正是本頁與一池春水（點擊隆起）最直觀的差別。
    // ⚠️ 振幅刻意取 −0.6：s = 1 + u × SCALE_K = 1 − 0.51 ≈ 0.49，剛好是「被點的字
    //    縮小 50%」，而且沒有撞到 SCALE_MIN 的夾限。振幅再大（例如 −1.2）時中央
    //    好幾格會一起被夾在 SCALE_MIN，坑底變成一片平的，反而失去尺寸梯度、
    //    鄰居也就不會被吸進來——推擠效果會消失。
    const TAP_AMP = -0.6;
    const DRAG_AMP = -0.18;      // 拖曳每個取樣點的振幅（比點擊小很多：快速滑動
    // 會在短時間灑下數十個取樣點，太大會整片糊成一團）
    const IMPULSE_R = 2.4;       // 擾動半徑（單位：格；格數減半故取一池春水的一半）
    const DRAG_STEP = 1.5;       // 拖曳每移動幾格補一次擾動（需與 IMPULSE_R 一起看：
    // 取樣點間距遠小於半徑時同一格會被多個高斯疊加）

    // ── 環境氛圍：偶爾自己落下一滴水（讓靜置畫面仍有生命感）──
    const AMBIENT_MIN_MS = 10000;
    const AMBIENT_MAX_MS = 20000;
    const AMBIENT_AMP = -0.35;

    // ── 詩詞取材 ──
    const NEED_CHARS = TOTAL;
    const PUNCT_RE = /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g;

    const TuiBo = {

        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,

        // ── 文字與圖集 ──
        gridChars: [],        // 長度 TOTAL 的字元陣列（索引 = r * COLS + c）
        gridGlyph: null,      // Int16Array：每格對應的圖集索引
        atlas: null,          // 字形圖集 canvas
        atlasCols: 0,         // 圖集每列幾格
        atlasG: 0,            // 圖集單格的「實體」像素邊長

        // ── 波場（Float32Array，長度 TOTAL）──
        uCur: null,
        uPrev: null,
        uNext: null,
        sField: null,         // 每格的縮放值（繪製時先算一輪，供梯度推擠使用）

        // ── 執行狀態 ──
        active: false,
        rafId: null,
        dpr: 1,
        _lastTime: 0,
        _nextAmbient: 0,
        _frameAvg: 16.7,      // 幀時間移動平均（效能自動降級用）
        _lowQuality: false,
        _frameCount: 0,       // 已繪製幀數（避免開場長幀誤判為效能不足）

        // ── 拖曳狀態 ──
        _dragging: false,
        _pointerId: null,
        _lastCx: 0, _lastCy: 0,

        // ========================================================
        // CSS 載入防護（唯一 id，避免重複載入）
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('tuibo-css')) {
                const link = document.createElement('link');
                link.id = 'tuibo-css';
                link.rel = 'stylesheet';
                link.href = 'tuibo.css';
                document.head.appendChild(link);
            }
        },

        // ========================================================
        // 初始化（DOM 只建立一次）
        // ========================================================
        init: function () {
            this.loadCSS();
            const isFirstInit = !document.getElementById('tuibo-container');
            if (isFirstInit) this.createDOM();

            // ⚠️ 必須先取得 DOM 參照再 bindEvents（監聽器內要用到 this.canvas）
            this.container = document.getElementById('tuibo-container');
            this.canvas = document.getElementById('tuibo-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });

            if (isFirstInit) this.bindEvents();
            this._setupCanvasSize();
        },

        _setupCanvasSize: function () {
            // 成本幾乎全來自填色率，而填色率與 dpr² 成正比（手機 dpr 3 是 dpr 1 的 9 倍）。
            // 字級 19.6px 比一池春水大，故上限略提高到 2.0；降級模式壓到 1.25。
            const cap = this._lowQuality ? 1.25 : 2.0;
            this.dpr = Math.max(1, Math.min(cap, window.devicePixelRatio || 1));
            this.canvas.width = Math.round(STAGE_W * this.dpr);
            this.canvas.height = Math.round(STAGE_H * this.dpr);
            this.canvas.style.width = STAGE_W + 'px';
            this.canvas.style.height = STAGE_H + 'px';
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'tuibo-container';
            div.className = 'tuibo-overlay hidden';
            div.innerHTML = `
                <canvas id="tuibo-canvas" class="tuibo-canvas"></canvas>
                <div id="tuibo-close" class="tuibo-close" aria-label="關閉">✕</div>
                <div class="tuibo-title">推波助瀾</div>
                <div id="tuibo-hint" class="tuibo-hint">輕觸/拖曳畫面</div>
                <div id="tuibo-refresh" class="tuibo-refresh" aria-label="換一批詩">換詩</div>
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
            document.getElementById('tuibo-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });

            document.getElementById('tuibo-refresh').addEventListener('click', () => {
                if (window.SoundManager) {
                    window.SoundManager.init();
                    window.SoundManager.playConfirmItem();
                }
                this._newRound();
            });

            // ── 擾動：Pointer Events 同時涵蓋滑鼠與觸控 ──
            const cv = this.canvas;

            cv.addEventListener('pointerdown', (e) => {
                const p = this._toCell(e.clientX, e.clientY);
                this._dragging = true;
                this._pointerId = e.pointerId;
                this._lastCx = p.cx; this._lastCy = p.cy;
                this._splash(p.cx, p.cy, TAP_AMP);
                this._hideHint();
                try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 部分瀏覽器不支援，忽略 */ }
                e.preventDefault();
            });

            cv.addEventListener('pointermove', (e) => {
                if (!this._dragging || e.pointerId !== this._pointerId) return;
                const p = this._toCell(e.clientX, e.clientY);
                // 沿手指路徑補間灑下擾動，避免快速滑動時漣漪斷成一顆一顆
                const dx = p.cx - this._lastCx;
                const dy = p.cy - this._lastCy;
                const dist = Math.hypot(dx, dy);
                if (dist < DRAG_STEP) return;
                const steps = Math.min(12, Math.floor(dist / DRAG_STEP));
                for (let s = 1; s <= steps; s++) {
                    const t = s / steps;
                    this._splash(this._lastCx + dx * t, this._lastCy + dy * t, DRAG_AMP);
                }
                this._lastCx = p.cx; this._lastCy = p.cy;
                e.preventDefault();
            });

            const endDrag = (e) => {
                if (e.pointerId !== this._pointerId) return;
                this._dragging = false;
                this._pointerId = null;
            };
            cv.addEventListener('pointerup', endDrag);
            cv.addEventListener('pointercancel', endDrag);
            cv.addEventListener('pointerleave', endDrag);
        },

        // clientX/Y → 格點座標（浮點，0..COLS / 0..ROWS），已抵銷 stage 的 CSS 縮放
        _toCell: function (clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                cx: (clientX - rect.left) / rect.width * COLS,
                cy: (clientY - rect.top) / rect.height * ROWS,
            };
        },

        _hideHint: function () {
            const hint = document.getElementById('tuibo-hint');
            if (hint && !hint.classList.contains('hidden')) hint.classList.add('hidden');
        },

        // ========================================================
        // 詩詞取材：混合多首詩，湊滿 TOTAL 字
        // ========================================================
        _pickChars: function () {
            const buf = [];
            try {
                if (typeof POEMS !== 'undefined' && Array.isArray(POEMS) && POEMS.length > 0) {
                    let guard = 0;
                    while (buf.length < NEED_CHARS && guard < 4000) {
                        guard++;
                        const poem = POEMS[Math.floor(Math.random() * POEMS.length)];
                        if (!poem || !Array.isArray(poem.content)) continue;
                        for (const line of poem.content) {
                            const clean = (line || '').replace(PUNCT_RE, '');
                            for (let i = 0; i < clean.length; i++) buf.push(clean[i]);
                        }
                    }
                }
            } catch (e) {
                console.warn('[推波助瀾] 取詩失敗', e);
            }

            // 降級保護：題庫不可用時仍要有東西可以看
            if (buf.length === 0) {
                const fallback = '風乍起吹皺一池春水閒引鴛鴦香徑裡手挼紅杏蕊鬥鴨闌干獨倚碧玉搔頭斜墜';
                while (buf.length < NEED_CHARS) buf.push(fallback[buf.length % fallback.length]);
            }
            // 不足 NEED_CHARS 也無妨：_layoutGrid 會以取餘數的方式循環使用
            return buf;
        },

        // 將字流依「直排、由右至左」填入格點（符合古典排版習慣）
        _layoutGrid: function (stream) {
            this.gridChars = new Array(TOTAL);
            let k = 0;
            for (let c = COLS - 1; c >= 0; c--) {
                for (let r = 0; r < ROWS; r++) {
                    this.gridChars[r * COLS + c] = stream[k++ % stream.length];
                }
            }
        },

        // ========================================================
        // 字形圖集：所有不重複的字只 fillText 一次
        // ========================================================
        _buildAtlas: function () {
            // 收集不重複字元
            const indexOf = new Map();
            const uniq = [];
            this.gridGlyph = new Int16Array(TOTAL);
            for (let i = 0; i < TOTAL; i++) {
                const ch = this.gridChars[i];
                let gi = indexOf.get(ch);
                if (gi === undefined) {
                    gi = uniq.length;
                    indexOf.set(ch, gi);
                    uniq.push(ch);
                }
                this.gridGlyph[i] = gi;
            }

            const G = Math.ceil(ATLAS_L * this.dpr * ATLAS_RES);
            const cols = Math.ceil(Math.sqrt(uniq.length)) || 1;
            const rows = Math.ceil(uniq.length / cols);

            const cv = document.createElement('canvas');
            cv.width = cols * G;
            cv.height = rows * G;
            const g = cv.getContext('2d');
            // 圖集內的字級 = 單格邊長 / 留白係數（保留邊距，縮放時不會被裁切）
            g.font = `${(G / ATLAS_PAD).toFixed(2)}px 'Noto Serif TC', 'Noto TC', serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = '#ffffff';
            for (let i = 0; i < uniq.length; i++) {
                g.fillText(uniq[i], (i % cols) * G + G / 2, Math.floor(i / cols) * G + G / 2);
            }

            this.atlas = cv;
            this.atlasCols = cols;
            this.atlasG = G;
        },

        // ========================================================
        // 波場
        // ========================================================
        _resetWave: function () {
            this.uCur = new Float32Array(TOTAL);
            this.uPrev = new Float32Array(TOTAL);
            this.uNext = new Float32Array(TOTAL);
            this.sField = new Float32Array(TOTAL);
        },

        // 在 (cx, cy)（格座標）落下一滴水：以高斯分布加到位移場上。
        // 只加在 uCur 而不動 uPrev → 下一步自然產生向外擴散的環狀波。
        // amp 為負值時是「往下凹」：中心的字先縮小，鄰居被吸過去。
        _splash: function (cx, cy, amp) {
            const R = IMPULSE_R;
            // 格子非正方形，縱向距離需換算成「橫向格」單位，水滴才會是正圓
            const AR = CELL_H / CELL_W;
            const rSpan = R / AR;
            const r0 = Math.max(0, Math.floor(cy - rSpan));
            const r1 = Math.min(ROWS - 1, Math.ceil(cy + rSpan));
            const c0 = Math.max(0, Math.floor(cx - R));
            const c1 = Math.min(COLS - 1, Math.ceil(cx + R));
            const inv = 1 / (R * R * 0.5);
            const u = this.uCur;
            for (let r = r0; r <= r1; r++) {
                const dy = (r + 0.5 - cy) * AR;
                for (let c = c0; c <= c1; c++) {
                    const dx = c + 0.5 - cx;
                    const d2 = dx * dx + dy * dy;
                    if (d2 > R * R) continue;
                    const i = r * COLS + c;
                    u[i] += amp * Math.exp(-d2 * inv);
                    // 雙向夾住振幅，避免快速拖曳時同一格被多個高斯疊加而爆掉
                    if (u[i] > U_MAX) u[i] = U_MAX; else if (u[i] < -U_MAX) u[i] = -U_MAX;
                }
            }
        },

        // 波動方程式一個子步驟。
        // 邊界採 Neumann（鏡射）條件：ghost 值取內側鄰居 → 波以同相位反射，
        // 這就是「漣漪撞到螢幕邊緣會回彈」的來源，不需任何特例程式碼。
        _stepWave: function () {
            const u = this.uCur, p = this.uPrev, n = this.uNext;
            for (let r = 0; r < ROWS; r++) {
                const base = r * COLS;
                const upBase = (r > 0 ? r - 1 : 1) * COLS;
                const dnBase = (r < ROWS - 1 ? r + 1 : ROWS - 2) * COLS;
                for (let c = 0; c < COLS; c++) {
                    const i = base + c;
                    const l = u[base + (c > 0 ? c - 1 : 1)];
                    const rr = u[base + (c < COLS - 1 ? c + 1 : COLS - 2)];
                    const up = u[upBase + c];
                    const dn = u[dnBase + c];
                    const lap = WAVE_KX * (l + rr - 2 * u[i]) + WAVE_KY * (up + dn - 2 * u[i]);
                    let v = (2 * u[i] - p[i] + WAVE_C2 * lap) * WAVE_DAMP;
                    if (v > U_MAX) v = U_MAX; else if (v < -U_MAX) v = -U_MAX;
                    n[i] = v;
                }
            }
            // 三個緩衝區輪替，避免每幀配置新陣列
            this.uPrev = u;
            this.uCur = n;
            this.uNext = p;
        },

        _updateWave: function (now) {
            for (let s = 0; s < SUBSTEPS; s++) this._stepWave();

            // 環境氛圍：偶爾自己落下一滴水
            if (now >= this._nextAmbient) {
                this._splash(
                    2 + Math.random() * (COLS - 4),
                    2 + Math.random() * (ROWS - 4),
                    AMBIENT_AMP
                );
                this._nextAmbient = now + AMBIENT_MIN_MS + Math.random() * (AMBIENT_MAX_MS - AMBIENT_MIN_MS);
            }
        },

        // ========================================================
        // 繪製
        // ========================================================
        _render: function () {
            const ctx = this.ctx;
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = '#000000';
            ctx.globalAlpha = 1;
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);

            const u = this.uCur;
            const s = this.sField;

            // ── 第一輪：先把每格的縮放值算出來 ──
            // ⚠️ 必須整場先算完才能畫，因為下一輪的位移要用到「鄰居的縮放值」；
            //    邊畫邊算會讓右側／下方的鄰居還是上一幀的值，推擠方向會不對稱。
            for (let i = 0; i < TOTAL; i++) {
                let v = 1 + u[i] * SCALE_K;
                if (v < SCALE_MIN) v = SCALE_MIN; else if (v > SCALE_MAX) v = SCALE_MAX;
                s[i] = v;
            }

            // ── 第二輪：依「縮放場的梯度」位移並貼圖 ──
            const atlas = this.atlas;
            const G = this.atlasG;
            const aCols = this.atlasCols;
            ctx.globalAlpha = CHAR_ALPHA;   // 一律白色、固定不透明度

            for (let r = 0; r < ROWS; r++) {
                const base = r * COLS;
                const upBase = (r > 0 ? r - 1 : 1) * COLS;      // 邊界鏡射，與波場一致
                const dnBase = (r < ROWS - 1 ? r + 1 : ROWS - 2) * COLS;
                const y = (r + 0.5) * CELL_H;
                for (let c = 0; c < COLS; c++) {
                    const i = base + c;

                    // 推擠／吸引：左鄰居比右鄰居大 → 我被往右推；左鄰居比右鄰居小 → 我被往左吸。
                    // 即 offset = −∇s，量值換算成像素（× 格寬）。
                    const sl = s[base + (c > 0 ? c - 1 : 1)];
                    const sr = s[base + (c < COLS - 1 ? c + 1 : COLS - 2)];
                    const su = s[upBase + c];
                    const sd = s[dnBase + c];

                    let ox = (sl - sr) * 0.5 * PUSH_K * CELL_W;
                    let oy = (su - sd) * 0.5 * PUSH_K * CELL_H;
                    if (ox > MAX_SHIFT) ox = MAX_SHIFT; else if (ox < -MAX_SHIFT) ox = -MAX_SHIFT;
                    if (oy > MAX_SHIFT) oy = MAX_SHIFT; else if (oy < -MAX_SHIFT) oy = -MAX_SHIFT;

                    const gi = this.gridGlyph[i];
                    const size = ATLAS_L * s[i];
                    ctx.drawImage(
                        atlas,
                        (gi % aCols) * G, ((gi / aCols) | 0) * G, G, G,
                        (c + 0.5) * CELL_W - size / 2 + ox, y - size / 2 + oy, size, size
                    );
                }
            }
            ctx.globalAlpha = 1;
        },

        // ========================================================
        // 主迴圈（含效能自動降級）
        // ========================================================
        _loop: function (time) {
            if (!this.active) return;
            if (!this._lastTime) this._lastTime = time;
            const dt = time - this._lastTime;
            this._lastTime = time;

            // ⚠️ 前 60 幀不列入判斷：剛開啟時第一幀 dt 常有上百 ms（建圖集、字型載入），
            //    會誤判成效能不足而立刻降級。
            this._frameCount++;
            this._frameAvg = this._frameAvg * 0.92 + Math.min(100, dt) * 0.08;
            if (!this._lowQuality && this._frameCount > 60 && this._frameAvg > 26) {
                this._downgrade();
            }

            this._updateWave(time);
            this._render();

            this.rafId = requestAnimationFrame((t) => this._loop(t));
        },

        _downgrade: function () {
            this._lowQuality = true;
            console.info('[推波助瀾] 偵測到效能不足，已自動降低繪製品質');
            this._setupCanvasSize();
            // dpr 改變後圖集解析度也要跟著重建，否則放大時會糊
            this._buildAtlas();
        },

        _startLoop: function () {
            if (this.rafId) return;
            this._lastTime = 0;
            this.rafId = requestAnimationFrame((t) => this._loop(t));
        },

        _stopLoop: function () {
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        },

        // ========================================================
        // 一輪 = 一批新的詩
        // ========================================================
        _newRound: function () {
            this._layoutGrid(this._pickChars());
            this._buildAtlas();
            this._resetWave();
            this._nextAmbient = performance.now() + 900;
            // 開場先自己滴一滴，讓使用者立刻看見字會被推擠
            this._splash(COLS * 0.5, ROWS * 0.42, TAP_AMP * 0.9);
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this._dragging = false;
            this._pointerId = null;
            const hint = document.getElementById('tuibo-hint');
            if (hint) hint.classList.remove('hidden');
            this._newRound();
            this._startLoop();
        },

        // 玩家按 ✕ 主動關閉 → 回到首頁「青雲梯」。
        // （只有這條路徑回首頁；menu.js 的全域清理走 stopGame()，不受影響）
        hide: function () {
            this.stopGame();
            if (typeof window.FMGoHome === 'function') window.FMGoHome();
        },

        // menu.js 的全域清理只呼叫 stopGame()，因此這裡必須自行隱藏 overlay
        stopGame: function () {
            this.active = false;
            this._stopLoop();
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.TuiBo = TuiBo;

    // URL 參數啟動（與其他模組一致，精確比對）
    if (new URLSearchParams(window.location.search).get('page') === 'tuibo') {
        const start = () => {
            if (window.TuiBo) window.TuiBo.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
