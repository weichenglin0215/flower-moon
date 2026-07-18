/* ============================================================================
 * zhexianren.js — 謫仙人 (Beaded Poem Curtain / 珠簾詩)
 * ----------------------------------------------------------------------------
 * 一頁「舒壓」介面（非遊戲、無計分）。畫面上方懸掛「謫仙人」匾額，
 * 匾額下方垂掛數條「珠簾」，每一條由幾首詩的詩句組合而成（每次開啟隨機），
 * 且每條長短不一。
 *
 * 互動：
 *   - 以手指（或滑鼠）撥弄珠簾 → 珠子如串珠般上下相連擺動（Verlet 繩索模擬）。
 *   - 每一條珠簾各自獨立：只有「同一條的上下字」互相牽引，左右不同條彼此不碰撞。
 *   - 雙指縮放（pinch）可放大縮小整個畫面觀看；雙指平移可移動視角。
 *
 * 慣例：所有 CSS class 加 zhexianren- 前綴；overlay 掛於 document.body（非 #stage，
 *       因 stage 有 transform 會造成 position:fixed 二次縮放）；透過
 *       registerOverlayResize 同步舞台縮放；window.ZheXianRen 掛全域供 menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;

    // ── 匾額（懸掛珠簾的橫樑）──
    const PLAQUE_CX = STAGE_W / 2;   // 匾額中心 X
    const PLAQUE_CY = 92;            // 匾額中心 Y
    const PLAQUE_W = 300;            // 匾額寬
    const PLAQUE_H = 96;             // 匾額高
    const ANCHOR_Y = PLAQUE_CY + PLAQUE_H / 2 + 6;  // 珠簾錨點（匾額底緣下方）

    // ── 珠簾配置 ──
    //   條數改為依玩家文位動態決定（書僮=1 … 大儒=15），見 buildColumns。
    const COL_MARGIN = 40;           // 左右留白
    const SEG_LEN = 23;              // 珠與珠的間距（繩段長）
    const BEAD_FONT = 19;            // 珠上文字大小 (px)
    const MIN_BEADS = 10;            // 每條最少字數（含標點）
    const MAX_BEADS = 32;            // 每條最多字數（含標點）28+4

    // ── Verlet 物理參數 ──
    //   每一條珠簾各自於 [MIN,MAX] 範圍隨機取用重力與阻尼，使擺動各異、更自然。
    const GRAVITY_MIN = 0.20;        // 重力下限
    const GRAVITY_MAX = 0.5;        // 重力上限
    const DAMPING_MIN = 0.980;       // 阻尼下限（越小越快靜止）
    const DAMPING_MAX = 0.996;       // 阻尼上限（越接近 1 擺盪越久＝越舒壓）
    const CONSTRAINT_ITERS = 3;      // 繩段約束迭代次數（越多越硬挺）
    const MAX_STEP = 26;             // 單幀單珠最大位移（防爆開）

    // ── 撥弄互動 ──
    const FLICK_RADIUS = 44;         // 手指影響半徑（世界座標 px）
    const FLICK_STRENGTH = 0.85;     // 撥弄力道

    // ── 微風（讓珠簾末端更易吹動、形成曲線）──
    //   微風力道沿深度遞增（末端最大）＋沿珠往下的相位差（行進波），
    //   使每條呈 S 形曲線而非直線傾斜，且各條相位/振幅不同→擺動互異。
    const BREEZE_AMP = 0.15;         // 微風基礎力道
    const BREEZE_SPEED = 0.0011;     // 微風擺動頻率
    const BREEZE_WAVE_K = -0.3;      // 沿珠往下的相位差（形成行進波）
    const BREEZE_DEPTH_POW = 1.5;    // 受力隨深度的次方（越大→越集中末端→越彎）

    // ── 自動陣風（一陣風「橫掃」過畫面，由左至右或右至左，形成風吹過的感覺）──
    const GUST_MIN_MS = 4000;         // 兩陣風之間的最短間隔
    const GUST_MAX_MS = 10000;        // 兩陣風之間的最長間隔
    const GUST_STRENGTH_MIN = 0.5;   // 陣風力道下限
    const GUST_STRENGTH_MAX = 3.0;   // 陣風力道上限
    const GUST_DURATION_MIN = 1000;   // 一陣風橫掃全畫面所需最短時間 (ms)
    const GUST_DURATION_MAX = 4000;  // 一陣風橫掃全畫面所需最長時間 (ms)
    const GUST_BAND = 72;           // 風鋒影響半寬（世界座標 px）：距風鋒此範圍內的珠簾受力
    const GUST_FORCE_SCALE = 0.33;   // 將陣風力道換算為「每幀持續推力」的係數（因改為持續施力）

    // ── 縮放參數 ──
    const MIN_ZOOM = 0.5;
    const MAX_ZOOM = 3.0;

    const ZheXianRen = {

        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,
        hintEl: null,

        // ── 資料 ──
        columns: [],          // [{ beads:[{x,y,px,py,ch}], anchorX, ink, gravity, damping, breezePhase, breezeAmp }]
        rankName: '書僮',     // 玩家文位（顯示於匾額、決定條數）
        _nextGustAt: 0,       // 下次自動陣風的時間戳
        _gust: null,          // 進行中的橫掃陣風 { start, duration, dir, strength }

        // ── 相機 ──
        zoom: 1,
        panX: 0,
        panY: 0,

        // ── 執行狀態 ──
        active: false,
        rafId: null,
        dpr: 1,
        _t0: 0,

        // ── 手勢暫存 ──
        _pointerDown: false,
        _lastWX: 0, _lastWY: 0,        // 上一次手指世界座標
        _pinching: false,
        _pinchStartDist: 0,
        _pinchStartZoom: 1,
        _pinchMidWX: 0, _pinchMidWY: 0,
        _lastMidSX: 0, _lastMidSY: 0,  // 上一次雙指中點（畫布邏輯座標）

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('zhexianren-css')) {
                const link = document.createElement('link');
                link.id = 'zhexianren-css';
                link.rel = 'stylesheet';
                link.href = 'zhexianren.css';
                document.head.appendChild(link);
            }
        },

        // ========================================================
        // 初始化（僅一次）
        // ========================================================
        init: function () {
            this.loadCSS();
            if (!document.getElementById('zhexianren-container')) {
                this.createDOM();
                this.bindEvents();
            }
            this.container = document.getElementById('zhexianren-container');
            this.canvas = document.getElementById('zhexianren-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.hintEl = document.getElementById('zhexianren-hint');
            this._setupCanvasSize();
        },

        // 依 devicePixelRatio 設定畫布解析度，維持高 DPI 清晰
        _setupCanvasSize: function () {
            this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
            this.canvas.width = STAGE_W * this.dpr;
            this.canvas.height = STAGE_H * this.dpr;
            this.canvas.style.width = STAGE_W + 'px';
            this.canvas.style.height = STAGE_H + 'px';
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'zhexianren-container';
            div.className = 'zhexianren-overlay hidden';
            div.innerHTML = `
                <canvas id="zhexianren-canvas" class="zhexianren-canvas"></canvas>
                <div id="zhexianren-close" class="zhexianren-close" aria-label="關閉">✕</div>
                <div id="zhexianren-hint" class="zhexianren-hint">手指撥弄珠簾 · 雙指縮放畫面</div>
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

        // ========================================================
        // 事件綁定
        // ========================================================
        bindEvents: function () {
            const cv = document.getElementById('zhexianren-canvas');

            // 關閉鍵
            document.getElementById('zhexianren-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });

            // ── 滑鼠（桌機）：撥弄 ──
            cv.addEventListener('mousedown', (e) => {
                const w = this._canvasToWorld(e.clientX, e.clientY);
                this._pointerDown = true;
                this._lastWX = w.x; this._lastWY = w.y;
            });
            window.addEventListener('mousemove', (e) => {
                if (!this._pointerDown) return;
                const w = this._canvasToWorld(e.clientX, e.clientY);
                this._flick(w.x, w.y, this._lastWX, this._lastWY);
                this._lastWX = w.x; this._lastWY = w.y;
            });
            window.addEventListener('mouseup', () => { this._pointerDown = false; });

            // ── 滾輪縮放（桌機輔助）──
            cv.addEventListener('wheel', (e) => {
                e.preventDefault();
                const c = this._canvasCoords(e.clientX, e.clientY);
                this._zoomAt(e.deltaY < 0 ? 1.08 : 0.92, c.x, c.y);
            }, { passive: false });

            // ── 觸控 ──
            cv.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    this._pointerDown = false;
                    this._pinching = true;
                    const a = this._canvasCoords(e.touches[0].clientX, e.touches[0].clientY);
                    const b = this._canvasCoords(e.touches[1].clientX, e.touches[1].clientY);
                    this._pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
                    this._pinchStartZoom = this.zoom;
                    this._lastMidSX = (a.x + b.x) / 2;
                    this._lastMidSY = (a.y + b.y) / 2;
                } else if (e.touches.length === 1) {
                    const w = this._canvasToWorld(e.touches[0].clientX, e.touches[0].clientY);
                    this._pointerDown = true;
                    this._lastWX = w.x; this._lastWY = w.y;
                }
                e.preventDefault();
            }, { passive: false });

            cv.addEventListener('touchmove', (e) => {
                if (this._pinching && e.touches.length === 2) {
                    const a = this._canvasCoords(e.touches[0].clientX, e.touches[0].clientY);
                    const b = this._canvasCoords(e.touches[1].clientX, e.touches[1].clientY);
                    const dist = Math.hypot(a.x - b.x, a.y - b.y);
                    const midX = (a.x + b.x) / 2;
                    const midY = (a.y + b.y) / 2;
                    // 縮放（以雙指中點為錨）
                    if (this._pinchStartDist > 0) {
                        const target = this._pinchStartZoom * (dist / this._pinchStartDist);
                        this._setZoomAt(target, midX, midY);
                    }
                    // 雙指平移
                    this.panX += midX - this._lastMidSX;
                    this.panY += midY - this._lastMidSY;
                    this._lastMidSX = midX; this._lastMidSY = midY;
                } else if (this._pointerDown && e.touches.length === 1) {
                    const w = this._canvasToWorld(e.touches[0].clientX, e.touches[0].clientY);
                    this._flick(w.x, w.y, this._lastWX, this._lastWY);
                    this._lastWX = w.x; this._lastWY = w.y;
                }
                e.preventDefault();
            }, { passive: false });

            cv.addEventListener('touchend', (e) => {
                if (e.touches.length === 0) { this._pinching = false; this._pointerDown = false; }
                else if (e.touches.length === 1) {
                    // 由雙指變單指：重新起算撥弄基準
                    this._pinching = false;
                    const w = this._canvasToWorld(e.touches[0].clientX, e.touches[0].clientY);
                    this._pointerDown = true;
                    this._lastWX = w.x; this._lastWY = w.y;
                }
            }, { passive: false });
        },

        // ========================================================
        // 座標轉換
        // ========================================================
        // clientX/Y → 畫布邏輯座標（0..500, 0..850），已抵銷 stage 的 CSS 縮放
        _canvasCoords: function (clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) / rect.width * STAGE_W,
                y: (clientY - rect.top) / rect.height * STAGE_H,
            };
        },

        // clientX/Y → 世界座標（抵銷相機縮放/平移）
        _canvasToWorld: function (clientX, clientY) {
            const c = this._canvasCoords(clientX, clientY);
            return {
                x: (c.x - this.panX) / this.zoom,
                y: (c.y - this.panY) / this.zoom,
            };
        },

        // ========================================================
        // 相機縮放
        // ========================================================
        _setZoomAt: function (target, sx, sy) {
            target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, target));
            // 保持螢幕點 (sx,sy) 對應的世界座標不動
            const wx = (sx - this.panX) / this.zoom;
            const wy = (sy - this.panY) / this.zoom;
            this.zoom = target;
            this.panX = sx - wx * this.zoom;
            this.panY = sy - wy * this.zoom;
        },

        _zoomAt: function (factor, sx, sy) {
            this._setZoomAt(this.zoom * factor, sx, sy);
        },

        // ========================================================
        // 撥弄：推動撥動半徑內的珠子（只影響同條珠簾的上下相連珠）
        // ========================================================
        _flick: function (wx, wy, lastWX, lastWY) {
            let dx = wx - lastWX;
            let dy = wy - lastWY;
            if (dx === 0 && dy === 0) return;
            // 限制單次推力，避免瞬移爆開
            const mag = Math.hypot(dx, dy);
            if (mag > MAX_STEP) { dx = dx / mag * MAX_STEP; dy = dy / mag * MAX_STEP; }

            const r2 = FLICK_RADIUS * FLICK_RADIUS;
            for (const col of this.columns) {
                const beads = col.beads;
                for (let i = 1; i < beads.length; i++) {  // i=0 為錨點，固定不動
                    const b = beads[i];
                    const ddx = b.x - wx;
                    const ddy = b.y - wy;
                    const d2 = ddx * ddx + ddy * ddy;
                    if (d2 < r2) {
                        const f = (1 - Math.sqrt(d2) / FLICK_RADIUS) * FLICK_STRENGTH;
                        // 直接位移座標（不動 px）→ Verlet 下一幀自動獲得速度
                        b.x += dx * f;
                        b.y += dy * f;
                    }
                }
            }
            this._wake();
        },

        _wake: function () {
            if (this.hintEl && !this.hintEl.classList.contains('faded')) {
                this.hintEl.classList.add('faded');
            }
        },

        // ========================================================
        // 建構珠簾（每次開啟隨機組合）
        // ========================================================
        _poems: function () {
            return (typeof POEMS !== 'undefined' && POEMS) ? POEMS : [];
        },

        buildColumns: function () {
            const poems = this._poems();
            this.columns = [];
            if (poems.length === 0) return;

            // 依玩家文位決定條數：書僮=1 … 大儒=15
            const colCount = this._rankColumnCount();

            for (let c = 0; c < colCount; c++) {
                const anchorX = (colCount === 1)
                    ? STAGE_W / 2
                    : COL_MARGIN + c * (STAGE_W - COL_MARGIN * 2) / (colCount - 1);

                // 本條由「同一首詩」串成：句間加「，」、句末加「。」，長度 10~28 字
                const chars = this._buildPoemString();
                if (chars.length === 0) continue;
                this._pushColumn(anchorX, chars, this._inkForSegment(c));
            }

            // 文位在「童生」(含)以下時，左右兩側各加一條勵志珠簾，鼓勵玩家提升文位
            if (this._rankIndex() <= 3) {
                const tip = Array.from('提升文位可以增加串珠的數量，加油吧！');
                // 金褐色以與詩句區別、更醒目
                const tipInk = 'hsl(32, 60%, 34%)';
                this._pushColumn(20, tip, tipInk);                 // 左側
                this._pushColumn(STAGE_W - 20, tip.slice(), tipInk); // 右側
            }
        },

        // 建立一條珠簾並加入 this.columns（含各自隨機的重力/阻尼/微風參數）
        _pushColumn: function (anchorX, chars, ink) {
            const gravity = GRAVITY_MIN + Math.random() * (GRAVITY_MAX - GRAVITY_MIN);
            const damping = DAMPING_MIN + Math.random() * (DAMPING_MAX - DAMPING_MIN);
            const breezePhase = Math.random() * Math.PI * 2;
            const breezeAmp = 0.7 + Math.random() * 0.7;

            // 建立珠子：第 0 顆為錨點（固定於匾額底緣），其後依序垂下
            const beads = [];
            beads.push({ x: anchorX, y: ANCHOR_Y, px: anchorX, py: ANCHOR_Y, ch: null, pinned: true });
            for (let k = 0; k < chars.length; k++) {
                const y = ANCHOR_Y + (k + 1) * SEG_LEN;
                beads.push({ x: anchorX, y, px: anchorX, py: y, ch: chars[k], pinned: false });
            }

            this.columns.push({ beads, anchorX, ink, gravity, damping, breezePhase, breezeAmp });
        },

        // 玩家文位在 ranks 中的索引（書僮=0 … 大儒=14）
        _rankIndex: function () {
            const ranks = (window.ScoreManager && window.ScoreManager.ranks) || null;
            if (!ranks) return 0;
            const idx = ranks.findIndex(r => r.name === this.rankName);
            return idx >= 0 ? idx : 0;
        },

        // 依玩家文位回傳珠簾條數（1~15）
        _rankColumnCount: function () {
            return Math.max(1, Math.min(15, this._rankIndex() + 1));
        },

        // 取得玩家目前文位名稱（供匾額與條數使用）
        _effectiveRankName: function () {
            try {
                if (window.ScoreManager) {
                    const data = window.ScoreManager.loadPlayerData();
                    return window.ScoreManager.getEffectiveRank
                        ? window.ScoreManager.getEffectiveRank(data)
                        : (data.globalRank || '書僮');
                }
            } catch (e) { /* ignore */ }
            return '書僮';
        },

        // 由「同一首詩」湊出長度 10~32 的字串（含標點），回傳字元陣列
        _buildPoemString: function () {
            const poems = this._poems();
            for (let attempt = 0; attempt < 16; attempt++) {
                const poem = poems[Math.floor(Math.random() * poems.length)];
                if (!poem || !Array.isArray(poem.content) || poem.content.length === 0) continue;

                const n = poem.content.length;
                const start = Math.floor(Math.random() * n);
                const lines = [];
                for (let step = 0; step < n; step++) {
                    const line = poem.content[(start + step) % n] || '';
                    if (!line) continue;
                    // 若加入此句會超過上限且已有內容 → 收尾
                    if (this._joinedLen(lines.concat([line])) > MAX_BEADS && lines.length > 0) break;
                    lines.push(line);
                    // 已達最短長度後，40% 機率收尾，製造長短變化
                    if (this._joinedLen(lines) >= MIN_BEADS && Math.random() < 0.4) break;
                }

                let arr = Array.from(lines.join('，') + '。');
                if (arr.length > MAX_BEADS) {
                    // 極端長句：截斷並補回句末「。」
                    arr = arr.slice(0, MAX_BEADS - 1);
                    arr.push('。');
                }
                if (arr.length >= MIN_BEADS) return arr;
            }
            return [];
        },

        // 計算 lines 以「，」相連、末尾加「。」後的總字數
        _joinedLen: function (lines) {
            let sum = 0;
            for (const l of lines) sum += Array.from(l).length;
            return sum + (lines.length - 1) + 1;   // 句間逗號 + 句末句號
        },

        // 依條序給予墨色（深淺交錯，讓相鄰珠簾略有區別）
        _inkForSegment: function (seed) {
            // 以水墨為主：色相偏暖褐，明度在 18%~30% 間交錯
            const light = 18 + (seed % 3) * 6;
            return `hsl(28, 22%, ${light}%)`;
        },

        // ========================================================
        // 物理更新（Verlet 積分 + 繩段約束）
        // ========================================================
        _updatePhysics: function (time) {
            // 更新橫掃陣風（啟動 / 結束 / 排程下一陣）
            this._updateGust(time);

            for (const col of this.columns) {
                const beads = col.beads;
                const n = beads.length;
                const gravity = col.gravity;
                const damping = col.damping;

                // 本條珠簾此幀受到的陣風基礎力道（依風鋒與本條 x 距離決定，全條相同）
                const gustBase = this._gustForceForColumn(col.anchorX, time);

                // 1) Verlet 積分（含沿深度遞增的微風 → 末端最易吹動、形成 S 形曲線）
                for (let i = 1; i < n; i++) {
                    const b = beads[i];
                    let vx = (b.x - b.px) * damping;
                    let vy = (b.y - b.py) * damping;
                    // 限速
                    const v = Math.hypot(vx, vy);
                    if (v > MAX_STEP) { vx = vx / v * MAX_STEP; vy = vy / v * MAX_STEP; }

                    // 深度比：越接近末端越大；行進波相位隨珠往下遞移
                    const depth = n > 2 ? (i / (n - 1)) : 1;
                    const wave = Math.sin(time * BREEZE_SPEED + col.breezePhase + i * BREEZE_WAVE_K);
                    const wind = BREEZE_AMP * col.breezeAmp * wave * Math.pow(depth, BREEZE_DEPTH_POW);
                    // 陣風亦沿深度加成（末端擺動最大）
                    const gust = gustBase * (0.35 + depth);

                    b.px = b.x; b.py = b.y;
                    b.x += vx + wind + gust; // 微風 + 橫掃陣風（皆末端最強）
                    b.y += vy + gravity;     // 重力
                }

                // 2) 繩段約束（固定相鄰珠間距；只在同條上下相連 → 左右不互動）
                for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
                    for (let i = 1; i < n; i++) {
                        const a = beads[i - 1];
                        const b = beads[i];
                        let dx = b.x - a.x;
                        let dy = b.y - a.y;
                        let dist = Math.hypot(dx, dy) || 0.0001;
                        const diff = (dist - SEG_LEN) / dist;
                        if (a.pinned) {
                            // 上一顆固定：只移動本顆
                            b.x -= dx * diff;
                            b.y -= dy * diff;
                        } else {
                            const hx = dx * diff * 0.5;
                            const hy = dy * diff * 0.5;
                            a.x += hx; a.y += hy;
                            b.x -= hx; b.y -= hy;
                        }
                    }
                    // 錨點珠釘死
                    const anchor = beads[0];
                    anchor.x = col.anchorX;
                    anchor.y = ANCHOR_Y;
                }
            }
        },

        // 橫掃陣風狀態機：時間到 → 啟動一陣；陣風走完 → 排下一陣
        _updateGust: function (time) {
            if (this._gust) {
                if (time - this._gust.start >= this._gust.duration) {
                    // 本陣結束，排程下一陣
                    this._gust = null;
                    this._nextGustAt = time + GUST_MIN_MS + Math.random() * (GUST_MAX_MS - GUST_MIN_MS);
                }
                return;
            }
            if (time >= this._nextGustAt) {
                this._gust = {
                    start: time,
                    duration: GUST_DURATION_MIN + Math.random() * (GUST_DURATION_MAX - GUST_DURATION_MIN),
                    dir: Math.random() < 0.5 ? 1 : -1,   // 1=左→右，-1=右→左
                    strength: GUST_STRENGTH_MIN + Math.random() * (GUST_STRENGTH_MAX - GUST_STRENGTH_MIN),
                };
            }
        },

        // 計算某條珠簾（以 anchorX 定位）此幀受到的橫掃陣風水平力道。
        // 風鋒在 duration 內自畫面一側移動到另一側；珠簾越接近風鋒受力越大，
        // 形成「風吹過」的先後波及感（非全畫面同時抖動）。
        _gustForceForColumn: function (anchorX, time) {
            const g = this._gust;
            if (!g) return 0;
            const p = (time - g.start) / g.duration;   // 進度 0~1
            if (p < 0 || p > 1) return 0;

            // 風鋒 x：由一側（含 BAND 緩衝）掃到另一側
            const from = g.dir > 0 ? -GUST_BAND : STAGE_W + GUST_BAND;
            const to = g.dir > 0 ? STAGE_W + GUST_BAND : -GUST_BAND;
            const frontX = from + (to - from) * p;

            const dist = Math.abs(anchorX - frontX);
            if (dist > GUST_BAND) return 0;

            // 距風鋒越近力道越強（餘弦鐘形，進出平滑不突兀）
            const intensity = 0.5 * (1 + Math.cos(Math.PI * dist / GUST_BAND));
            return g.dir * g.strength * GUST_FORCE_SCALE * intensity;
        },

        // ========================================================
        // 繪製
        // ========================================================
        _render: function () {
            const ctx = this.ctx;
            const dpr = this.dpr;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // 宣紙底色
            this._drawPaper(ctx);

            // 相機轉換
            ctx.save();
            ctx.translate(this.panX, this.panY);
            ctx.scale(this.zoom, this.zoom);

            // 珠簾細線（絲線）
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'hsla(30, 25%, 30%, 0.25)';
            for (const col of this.columns) {
                const beads = col.beads;
                ctx.beginPath();
                ctx.moveTo(beads[0].x, beads[0].y);
                for (let i = 1; i < beads.length; i++) ctx.lineTo(beads[i].x, beads[i].y);
                ctx.stroke();
            }

            // 珠上文字
            ctx.font = `${BEAD_FONT}px 'Noto Serif TC', serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (const col of this.columns) {
                const beads = col.beads;
                ctx.fillStyle = col.ink;
                for (let i = 1; i < beads.length; i++) {
                    const b = beads[i];
                    if (!b.ch) continue;
                    ctx.fillText(b.ch, b.x, b.y);
                }
            }

            // 匾額（畫在珠簾之上，遮住錨點）
            this._drawPlaque(ctx);

            ctx.restore();
        },

        // 宣紙背景（暖米色 + 邊緣暈影）
        _drawPaper: function (ctx) {
            const g = ctx.createRadialGradient(
                STAGE_W / 2, STAGE_H * 0.42, 80,
                STAGE_W / 2, STAGE_H * 0.42, STAGE_H * 0.7
            );
            g.addColorStop(0, 'hsl(42, 34%, 90%)');
            g.addColorStop(1, 'hsl(38, 30%, 80%)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        },

        // 匾額「謫仙人」
        _drawPlaque: function (ctx) {
            const x = PLAQUE_CX - PLAQUE_W / 2;
            const y = PLAQUE_CY - PLAQUE_H / 2;

            // 木底
            const wood = ctx.createLinearGradient(0, y, 0, y + PLAQUE_H);
            wood.addColorStop(0, 'hsl(20, 45%, 26%)');
            wood.addColorStop(0.5, 'hsl(22, 50%, 20%)');
            wood.addColorStop(1, 'hsl(18, 42%, 15%)');
            this._roundRect(ctx, x, y, PLAQUE_W, PLAQUE_H, 12);
            ctx.fillStyle = wood;
            ctx.fill();

            // 金框（雙線）
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'hsl(45, 78%, 58%)';
            this._roundRect(ctx, x, y, PLAQUE_W, PLAQUE_H, 12);
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'hsla(45, 70%, 70%, 0.6)';
            this._roundRect(ctx, x + 6, y + 6, PLAQUE_W - 12, PLAQUE_H - 12, 8);
            ctx.stroke();

            // 匾額文字＝玩家文位（橫排，依字數自動縮放以免超出匾額）
            const rank = this.rankName || '書僮';
            ctx.fillStyle = 'hsl(45, 82%, 62%)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'hsla(45, 80%, 50%, 0.5)';
            ctx.shadowBlur = 8;
            let fontPx = 48;
            const maxTextW = PLAQUE_W - 36;
            ctx.font = `bold ${fontPx}px 'Noto Serif TC', serif`;
            while (ctx.measureText(rank).width > maxTextW && fontPx > 20) {
                fontPx -= 2;
                ctx.font = `bold ${fontPx}px 'Noto Serif TC', serif`;
            }
            ctx.fillText(rank, PLAQUE_CX, PLAQUE_CY + 2);
            ctx.shadowBlur = 0;
        },

        _roundRect: function (ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        },

        // ========================================================
        // 主迴圈
        // ========================================================
        _loop: function (time) {
            if (!this.active) return;
            this._updatePhysics(time);
            this._render();
            this.rafId = requestAnimationFrame((t) => this._loop(t));
        },

        _startLoop: function () {
            if (this.rafId) return;
            this._t0 = performance.now();
            this.rafId = requestAnimationFrame((t) => this._loop(t));
        },

        _stopLoop: function () {
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            // 相機復位
            this.zoom = 1; this.panX = 0; this.panY = 0;
            // 讀取玩家文位（決定匾額文字與珠簾條數）
            this.rankName = this._effectiveRankName();
            this._gust = null;
            this._nextGustAt = performance.now() + 800;
            this.buildColumns();
            this._startLoop();
            // 手勢提示 6 秒後淡出
            if (this.hintEl) {
                this.hintEl.classList.remove('faded');
                clearTimeout(this._hintTimer);
                this._hintTimer = setTimeout(() => {
                    if (this.hintEl) this.hintEl.classList.add('faded');
                }, 6000);
            }
        },

        hide: function () {
            this.stopGame();
        },

        // menu.js 全域清理只呼叫 stopGame()
        stopGame: function () {
            this.active = false;
            this._stopLoop();
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.ZheXianRen = ZheXianRen;

    // URL 參數啟動（與其他模組一致，精確比對）
    if (new URLSearchParams(window.location.search).get('page') === 'zhexianren') {
        const start = () => {
            if (window.ZheXianRen) window.ZheXianRen.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
