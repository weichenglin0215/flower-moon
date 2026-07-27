/* ============================================================================
 * yichichunshui.js — 一池春水（水波紋視覺療癒頁）
 * ----------------------------------------------------------------------------
 * 「風乍起，吹皺一池春水」——一頁純舒壓介面（非遊戲、無計分、無時間限制）。
 *
 * 【畫面構成】
 *   整個畫面鋪滿 55(寬) × 80(高) = 4400 個詩詞文字（多首詩詞混合、直排、由右至左），
 *   黑底白字。共分兩層：
 *     第 1 層（水面）：文字本身。手指點擊或拖曳會在水面激起漣漪，一圈一圈往外
 *                      擴散；位於「波峰」的字放大且變亮，位於「波谷」的字縮小且
 *                      變暗。漣漪撞到畫面邊緣會反射回彈，與真實水面一致。
 *     第 2 層（池底）：同一批文字的模糊放大投影，逐字依水面的「斜率」（梯度）做
 *                      折射位移，並依「曲率」（拉普拉斯）做聚焦亮度變化，形成水
 *                      底扭曲、模糊、散開的散射光影（caustics）。
 *
 * 【物理模型】
 *   採用 2D 波動方程式（wave equation）在 55×80 的格點上做數值積分：
 *       u_next = 2u - u_prev + c² · ∇²u ，再乘上阻尼係數
 *   邊界使用 Neumann（鏡射）條件 → 波撞到邊緣會「同相反射」，自然產生回彈效果，
 *   不需要另外寫任何反射特例程式碼。
 *
 * 【效能考量（手機優先）】
 *   1. 字形圖集（glyph atlas）：所有不重複的字只用 fillText 預先繪製一次到離屏
 *      canvas，之後每幀都只用 drawImage 貼圖，避免 4400 次 fillText 的高成本。
 *   2. 白字黑底 → 亮度直接用 globalAlpha 表現，免去逐字改 fillStyle 的字串解析。
 *   3. 波谷過暗（alpha 低於門檻）的字直接跳過不畫。
 *   4. 池底層只取 1/4 的字（每隔 2 格一個）用預先模糊好的字形圖集放大貼圖，
 *      而非逐像素折射計算，成本約為水面層的 1/4。
 *   5. 依實際幀時間自動降級：偵測到持續卡頓時自動降低裝置像素比（填色率 ∝ dpr²）。
 *
 * 慣例：所有 CSS class 加 yichichunshui- 前綴；overlay 掛於 document.body（非
 *       #stage，因 stage 有 transform 會造成 position:fixed 二次縮放）；透過
 *       registerOverlayResize 同步舞台縮放；window.YiChiChunShui 掛全域供
 *       menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;

    // ── 文字格點 ──
    const COLS = 55;                       // 橫向字數
    const ROWS = 80;                       // 縱向字數
    const CELL_W = STAGE_W / COLS;         // 每格寬度 ≈ 9.09px
    const CELL_H = STAGE_H / ROWS;         // 每格高度 = 10.625px
    const TOTAL = COLS * ROWS;             // 4400 個字
    const FONT_BASE = 9.2;                 // 字級（px，靜止時）

    // ── 字形圖集參數 ──
    const ATLAS_PAD = 1.25;                // 圖集單格邊長 = 字級 × 此係數（留白避免裁切）
    const ATLAS_L = FONT_BASE * ATLAS_PAD; // 圖集單格「邏輯」邊長
    const MAX_SCALE = 1.75;                // 波峰最大放大倍率（決定圖集需要的解析度）

    // ── 波動方程式參數 ──
    const WAVE_C2 = 0.27;        // 波速平方係數（需滿足 C2·2·(KX+KY) < 1 才穩定）
    // 格子不是正方形（9.09 × 10.625），若兩軸用同樣的耦合強度，漣漪在畫面上會被
    // 縱向拉長成橢圓。這裡依 (dx/dy)² 調降縱向耦合，讓波在「螢幕座標」上是正圓。
    const WAVE_KX = 1.0;
    const WAVE_KY = (CELL_W / CELL_H) * (CELL_W / CELL_H);
    const WAVE_DAMP = 0.9976;    // 每個子步驟的阻尼（越接近 1 漣漪存活越久）
    // 每幀模擬的子步驟數（越多波速越快）。1 步 ≈ 漣漪 1 秒橫越整個畫面，
    // 實測 2 步太快（0.5 秒就撞到邊緣），少了舒緩感。
    const SUBSTEPS = 1;

    // ── 水面視覺映射 ──
    const SCALE_K = 0.60;        // 振幅 → 縮放的敏感度
    const SCALE_MIN = 0.50;      // 波谷最小縮放
    const BRIGHT_REST = 0.46;    // 靜止水面的字的不透明度（偏暗，讓漣漪的亮更突出）
    const BRIGHT_K = 0.62;       // 振幅 → 亮度的敏感度
    const ALPHA_SKIP = 0.05;     // 低於此不透明度就不畫（省效能）

    // ── 池底散射層參數 ──
    // ⚠️ 實作歷程：最初用「把整張池底影像切成 11×16 個方塊各自平移」來近似折射，
    //    但相鄰方塊位移量不同會產生明顯的直角接縫，畫面變成一格一格的磁磚，非常醜。
    //    改為「逐字投影」：每個字自己依所在位置的水面斜率位移，位移量連續變化，
    //    完全沒有接縫；再用模糊字形 + 放大 + lighter 疊加做出水下散開的光暈。
    const FLOOR_STEP = 3;        // 每隔幾格取一個字投影（3 → 只畫 1/9 的字，省效能）
    const FLOOR_SPREAD = 3.0;    // 池底字相對水面字的放大倍率（越大越散開）
    const FLOOR_BLUR = 0.09;     // 模糊字形圖集的模糊半徑（相對圖集單格邊長的比例）
    const FLOOR_REFRACT = 60;    // 水面斜率 → 池底位移量的倍率（越大扭曲越明顯）
    const FLOOR_MAX_SHIFT = 16;  // 位移量上限（px），避免劇烈擾動時整片飛出畫面
    const FLOOR_ALPHA = 0.22;    // 池底投影基礎不透明度
    const FLOOR_CAUSTIC = 3.2;   // 曲率 → 亮度變化的倍率（波形聚焦處變亮，即焦散）

    // ── 互動擾動參數 ──
    const TAP_AMP = 1.05;        // 單次點擊的振幅
    const DRAG_AMP = 0.20;       // 拖曳過程中每個取樣點的振幅（比點擊小很多：快速滑動
                                 // 會在短時間內灑下數十個取樣點，太大會整片過曝變白）
    const IMPULSE_R = 4.5;       // 擾動半徑（單位：格）。半徑越大 → 波長越長 → 漣漪越
                                 // 柔和；太小會像雜訊般的細碎閃爍。
    const DRAG_STEP = 2.2;       // 拖曳每移動幾格才補一次擾動。⚠️ 這個值必須和 IMPULSE_R
                                 // 一起看：取樣點間距遠小於擾動半徑時，同一格會被十幾個
                                 // 高斯疊加，快速滑動就會整片過曝變白。

    // ── 環境氛圍：偶爾自己落下一滴水（讓靜置畫面仍有生命感）──
    const AMBIENT_MIN_MS = 2600;
    const AMBIENT_MAX_MS = 7000;
    const AMBIENT_AMP = 0.34;

    // ── 詩詞取材 ──
    const NEED_CHARS = TOTAL;    // 需要填滿的字數
    const PUNCT_RE = /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g;

    const YiChiChunShui = {

        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,

        // ── 文字與圖集 ──
        gridChars: [],        // 長度 TOTAL 的字元陣列（索引 = r * COLS + c）
        gridGlyph: null,      // Int16Array：每格對應的圖集索引
        atlas: null,          // 水面用：清晰字形圖集 canvas
        atlasBlur: null,      // 池底用：模糊字形圖集 canvas（同一份排版）
        atlasCols: 0,         // 圖集每列幾格
        atlasG: 0,            // 圖集單格的「實體」像素邊長

        // ── 波場（Float32Array，長度 TOTAL）──
        uCur: null,
        uPrev: null,
        uNext: null,

        // ── 執行狀態 ──
        active: false,
        rafId: null,
        dpr: 1,
        _lastTime: 0,
        _nextAmbient: 0,
        _frameAvg: 16.7,      // 幀時間移動平均（效能自動降級用）
        _lowQuality: false,   // 是否已降級
        _frameCount: 0,       // 已繪製幀數（降級判斷用，避免開場的長幀誤判）

        // ── 拖曳狀態 ──
        _dragging: false,
        _pointerId: null,
        _lastCx: 0, _lastCy: 0,

        // ========================================================
        // CSS 載入防護（唯一 id，避免重複載入）
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('yichichunshui-css')) {
                const link = document.createElement('link');
                link.id = 'yichichunshui-css';
                link.rel = 'stylesheet';
                link.href = 'yichichunshui.css';
                document.head.appendChild(link);
            }
        },

        // ========================================================
        // 初始化（DOM 只建立一次）
        // ========================================================
        init: function () {
            this.loadCSS();
            const isFirstInit = !document.getElementById('yichichunshui-container');
            if (isFirstInit) this.createDOM();

            // ⚠️ 必須先取得 DOM 參照再 bindEvents（監聽器內要用到 this.canvas）
            this.container = document.getElementById('yichichunshui-container');
            this.canvas = document.getElementById('yichichunshui-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });

            if (isFirstInit) this.bindEvents();
            this._setupCanvasSize();
        },

        _setupCanvasSize: function () {
            // 全畫面 5000 次貼圖的成本幾乎全來自填色率，而填色率與 dpr² 成正比，
            // 手機上的 dpr 3 會讓成本變成 dpr 1 的 9 倍。字級本來就只有 9px 的裝飾性
            // 紋理，dpr 1.75 已足夠清晰；降級模式再壓到 1.15。
            const cap = this._lowQuality ? 1.15 : 1.75;
            this.dpr = Math.max(1, Math.min(cap, window.devicePixelRatio || 1));
            this.canvas.width = Math.round(STAGE_W * this.dpr);
            this.canvas.height = Math.round(STAGE_H * this.dpr);
            this.canvas.style.width = STAGE_W + 'px';
            this.canvas.style.height = STAGE_H + 'px';
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'yichichunshui-container';
            div.className = 'yichichunshui-overlay hidden';
            div.innerHTML = `
                <canvas id="yichichunshui-canvas" class="yichichunshui-canvas"></canvas>
                <div id="yichichunshui-close" class="yichichunshui-close" aria-label="關閉">✕</div>
                <div class="yichichunshui-title">一池春水</div>
                <div id="yichichunshui-hint" class="yichichunshui-hint">輕觸或滑動水面</div>
                <div id="yichichunshui-refresh" class="yichichunshui-refresh" aria-label="換一池詩">換水</div>
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
            document.getElementById('yichichunshui-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });

            document.getElementById('yichichunshui-refresh').addEventListener('click', () => {
                if (window.SoundManager) {
                    window.SoundManager.init();
                    window.SoundManager.playConfirmItem();
                }
                this._newRound();
            });

            // ── 水面擾動：Pointer Events 同時涵蓋滑鼠與觸控 ──
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
                // 沿著手指移動路徑補間灑下擾動，避免快速滑動時漣漪斷成一顆一顆
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
            const hint = document.getElementById('yichichunshui-hint');
            if (hint && !hint.classList.contains('hidden')) hint.classList.add('hidden');
        },

        // ========================================================
        // 詩詞取材：混合多首詩，湊滿 4400 字
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
                console.warn('[一池春水] 取詩失敗', e);
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

            // 圖集解析度需滿足「最大放大倍率下仍不糊」
            const G = Math.ceil(ATLAS_L * this.dpr * MAX_SCALE);
            const cols = Math.ceil(Math.sqrt(uniq.length)) || 1;
            const rows = Math.ceil(uniq.length / cols);

            // 清晰版（水面用）與模糊版（池底用）排版完全相同，只差一個 blur filter，
            // 因此可以共用同一組 gridGlyph 索引。
            this.atlas = this._paintAtlas(uniq, cols, rows, G, 0);
            this.atlasBlur = this._paintAtlas(uniq, cols, rows, G, G * FLOOR_BLUR);
            this.atlasCols = cols;
            this.atlasG = G;
        },

        _paintAtlas: function (uniq, cols, rows, G, blurPx) {
            const cv = document.createElement('canvas');
            cv.width = cols * G;
            cv.height = rows * G;
            const g = cv.getContext('2d');
            // 若瀏覽器支援 filter 就套模糊；不支援也無妨（池底本來就會被放大而變糊）
            if (blurPx > 0) {
                try { g.filter = `blur(${blurPx.toFixed(2)}px)`; } catch (e) { /* 忽略 */ }
            }
            // 圖集內的字級 = 單格邊長 / 留白係數（保留邊距，縮放時不會被裁切）
            g.font = `${(G / ATLAS_PAD).toFixed(2)}px 'Noto Serif TC', 'Noto TC', serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillStyle = '#ffffff';
            for (let i = 0; i < uniq.length; i++) {
                g.fillText(uniq[i], (i % cols) * G + G / 2, Math.floor(i / cols) * G + G / 2);
            }
            return cv;
        },

        // ========================================================
        // 波場
        // ========================================================
        _resetWave: function () {
            this.uCur = new Float32Array(TOTAL);
            this.uPrev = new Float32Array(TOTAL);
            this.uNext = new Float32Array(TOTAL);
        },

        // 在 (cx, cy)（格座標）落下一滴水：以高斯分布加到位移場上。
        // 只加在 uCur 而不動 uPrev → 下一步自然產生向外擴散的環狀波。
        _splash: function (cx, cy, amp) {
            const R = IMPULSE_R;
            // 格子非正方形，縱向距離需換算成「橫向格」單位，水滴才會是正圓而非橢圓
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
                    // 雙向夾住振幅：避免使用者狂點或快速拖曳時能量無限累積，
                    // 導致數值發散（模擬爆掉）或畫面整片過曝變白
                    if (u[i] > 1.15) u[i] = 1.15; else if (u[i] < -1.15) u[i] = -1.15;
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
                    n[i] = (2 * u[i] - p[i] + WAVE_C2 * lap) * WAVE_DAMP;
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
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);

            this._drawFloorLayer(ctx);   // 第 2 層：池底散射（先畫，位於下方）
            this._drawSurfaceLayer(ctx); // 第 1 層：水面文字
        },

        // ── 第 2 層：池底扭曲模糊的散射投影 ──
        // 逐字投影：每個取樣到的字用「模糊字形」放大後畫在池底，位置依該處水面的
        // 斜率（梯度）平移＝折射；亮度依水面曲率（拉普拉斯）變化＝焦散聚光；
        // 以 lighter 疊加使相鄰的模糊字互相堆疊成連續散開的光暈。
        // 位移量隨位置連續變化，因此完全沒有接縫。
        _drawFloorLayer: function (ctx) {
            if (!this.atlasBlur) return;
            const u = this.uCur;
            const G = this.atlasG;
            const aCols = this.atlasCols;
            const size = ATLAS_L * FLOOR_SPREAD;
            const half = size / 2;

            ctx.globalCompositeOperation = 'lighter';
            for (let r = 1; r < ROWS - 1; r += FLOOR_STEP) {
                const y = (r + 0.5) * CELL_H;
                const base = r * COLS;
                for (let c = 1; c < COLS - 1; c += FLOOR_STEP) {
                    const i = base + c;
                    const lap = u[i - 1] + u[i + 1] + u[i - COLS] + u[i + COLS] - 4 * u[i];

                    // 焦散：波形向下凹（lap > 0）處光線發散變暗，向上凸處聚焦變亮
                    let a = FLOOR_ALPHA * (1 - lap * FLOOR_CAUSTIC);
                    if (a < 0.015) continue;       // 太暗就不畫，省效能
                    if (a > 0.42) a = 0.42;

                    // 折射：位移量正比於水面斜率
                    let ox = (u[i + 1] - u[i - 1]) * 0.5 * FLOOR_REFRACT;
                    let oy = (u[i + COLS] - u[i - COLS]) * 0.5 * FLOOR_REFRACT;
                    if (ox > FLOOR_MAX_SHIFT) ox = FLOOR_MAX_SHIFT; else if (ox < -FLOOR_MAX_SHIFT) ox = -FLOOR_MAX_SHIFT;
                    if (oy > FLOOR_MAX_SHIFT) oy = FLOOR_MAX_SHIFT; else if (oy < -FLOOR_MAX_SHIFT) oy = -FLOOR_MAX_SHIFT;

                    const gi = this.gridGlyph[i];
                    ctx.globalAlpha = a;
                    ctx.drawImage(
                        this.atlasBlur,
                        (gi % aCols) * G, ((gi / aCols) | 0) * G, G, G,
                        (c + 0.5) * CELL_W - half + ox, y - half + oy, size, size
                    );
                }
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
        },

        // ── 第 1 層：水面文字（波峰放大變亮、波谷縮小變暗）──
        _drawSurfaceLayer: function (ctx) {
            const u = this.uCur;
            const atlas = this.atlas;
            const G = this.atlasG;
            const aCols = this.atlasCols;

            for (let r = 0; r < ROWS; r++) {
                const y = (r + 0.5) * CELL_H;
                const base = r * COLS;
                for (let c = 0; c < COLS; c++) {
                    const i = base + c;
                    const h = u[i];

                    // 亮度：波峰接近全白，波谷幾乎沉入水中
                    let a = BRIGHT_REST + h * BRIGHT_K;
                    if (a <= ALPHA_SKIP) continue;
                    if (a > 1) a = 1;

                    // 縮放：波峰放大、波谷縮小
                    let s = 1 + h * SCALE_K;
                    if (s < SCALE_MIN) s = SCALE_MIN; else if (s > MAX_SCALE) s = MAX_SCALE;

                    const gi = this.gridGlyph[i];
                    const size = ATLAS_L * s;
                    ctx.globalAlpha = a;
                    ctx.drawImage(
                        atlas,
                        (gi % aCols) * G, ((gi / aCols) | 0) * G, G, G,
                        (c + 0.5) * CELL_W - size / 2, y - size / 2, size, size
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

            // 幀時間移動平均：持續偏慢就降級。
            // ⚠️ 前 60 幀不列入判斷：剛開啟時的第一幀 dt 往往有上百 ms（建圖集、字型
            //    載入），會誤判成效能不足而立刻降級。
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
            console.info('[一池春水] 偵測到效能不足，已自動降低繪製品質');
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
        // 一輪 = 一池新的詩
        // ========================================================
        _newRound: function () {
            this._layoutGrid(this._pickChars());
            this._buildAtlas();
            this._resetWave();
            this._nextAmbient = performance.now() + 900;
            // 開場先自己滴一滴，讓使用者立刻看見這是水面
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
            const hint = document.getElementById('yichichunshui-hint');
            if (hint) hint.classList.remove('hidden');
            this._newRound();
            this._startLoop();
        },

        hide: function () {
            this.stopGame();
        },

        // menu.js 的全域清理只呼叫 stopGame()，因此這裡必須自行隱藏 overlay
        stopGame: function () {
            this.active = false;
            this._stopLoop();
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.YiChiChunShui = YiChiChunShui;

    // URL 參數啟動（與其他模組一致，精確比對）
    if (new URLSearchParams(window.location.search).get('page') === 'yichichunshui') {
        const start = () => {
            if (window.YiChiChunShui) window.YiChiChunShui.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
