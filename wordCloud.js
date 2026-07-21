/* ============================================================================
 * wordCloud.js — 文字雲 (Poetry Cosmos / 3D Word Cloud Navigator)
 * ----------------------------------------------------------------------------
 * 三層沉浸式 3D 導覽介面：朝代 → 詩人 → 詩詞，最終開啟既有的「詩詞資料」對話框。
 *
 * 依《文字雲_企劃書與遊戲心得.md》實作，重點：
 *   - 費波納契球面均勻分佈（最高分項目置於球體正面中心）
 *   - 累積評價驅動字體大小（朝代=旗下詩人評價總和；詩人=旗下詩詞 rating 總和；詩詞=單篇 rating）
 *   - 拖曳旋轉 + 慣性衰減 + idle 自轉
 *   - 滾輪 / 雙指縮放（含 touch-action:none 防護）
 *   - 位移/耗時雙閾值判定「拖曳 vs 點擊」
 *   - 兩段式點擊狀態機（IDLE / PREVIEW_LOCKED / CONFIRMED）
 *   - 關聯提示線（僅在「合併顯示」層級啟用）
 *   - 縮放過小自動返回上一層（投影直徑 < 畫面短邊 1/4）
 *   - 麵包屑導覽 + 返回鍵
 *   - 15 秒無操作脈動提示
 *
 * 慣例：所有 CSS class 加 wordcloud- 前綴；overlay 掛於 document.body（非 #stage）；
 *       透過 registerOverlayResize 同步縮放；window.WordCloud 掛全域供 menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;

    // ── 球面中心（保留頂部麵包屑列的空間）──
    const CENTER_X = STAGE_W / 2;   // 250
    const CENTER_Y = 470;           // 略偏下，避開頂列
    // 虛擬鏡頭距離（以球半徑為單位）。越小＝廣角越大＝前後透視差越明顯。
    //   前/後尺寸比 = (CAM+1)/(CAM-1)。CAM=2.3 → 比值約 2.5（前約 ×1.76、後約 ×0.70）。
    const CAM = 2.3;
    const STAR_CAM = 6;             // 星空用較弱透視，維持背景鋪展不飛出畫面

    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

    // ── 縮放參數 ──
    const MAX_ZOOM = 2.5;
    const MIN_ZOOM_TOP = 0.5;   // 最外層（無上一層）縮放下限
    const MIN_ZOOM_SUB = 0.2;   // 子層允許縮更小，好觸發自動返回（須低於各層的返回觸發縮放）
    const AUTO_RETURN_RATIO = 0.25; // 投影直徑 < 畫面短邊 × 此值 → 自動返回

    // ── 手勢判定閾值 ──
    const TAP_MOVE_PX = 8;      // 位移超過此值視為拖曳
    const TAP_TIME_MS = 300;    // 耗時超過此值不算點擊

    // ── 各層級視覺參數（radius/參考字體，已為 500px 舞台調校）──
    //   refFont：評價中位項目的基準字體；實際字體 = refFont × 評價縮放 × 景深 × 鏡頭縮放
    const LAYER_PARAMS = {
        dynasty: { radius: 150, refFont: 26, cap: 9999 },
        poet: { radius: 205, refFont: 21, cap: 70 },
        poem: { radius: 245, refFont: 19, cap: 100 },
    };

    // ── 依詩詞評價決定項目大小：最高評價 = 2 倍、最低 = 0.5 倍（將最低放大為原 0.1 的 250%）──
    const SCORE_MIN_SCALE = 0.8;
    const SCORE_MAX_SCALE = 2.4;
    const FONT_MIN_PX = 7;    // 可讀性下限
    const FONT_MAX_PX = 120;   // 上限放寬，讓最高評價項目在最前方仍能展現完整透視放大

    const WIRE_NEIGHBORS = 3;        // 每個項目連向最近的 N 個鄰居，構成球面線框
    const LABEL_MAX_CHARS = 5;       // 標題最長字數，超過以 … 省略

    // ── 防重疊：球面鬆弛（force-directed relaxation）參數 ──
    const RELAX_ITERS = 120;         // 鬆弛迭代次數（一次性，僅在載入層級時執行）
    const RELAX_PAD = 0.95;          // 項目角半徑的縮放（越大越不重疊、但越稀疏）

    const INERTIA_DECAY = 0.995;      // 慣性每幀衰減

    // ── 狀態機常數 ──
    const S_IDLE = 'IDLE';
    const S_LOCKED = 'PREVIEW_LOCKED';
    const S_TRANSITION = 'TRANSITION';   // 進層 / 返回 / 聚焦動畫中

    const WordCloud = {

        // ── DOM 參照 ──
        container: null,
        cloudEl: null,        // 承載所有文字項目的層
        svgEl: null,          // 關聯線 SVG 疊層
        breadcrumbEl: null,
        backBtnEl: null,
        dynastyChk: null,
        poetChk: null,
        hintEl: null,
        zoomLabelEl: null,

        // ── 資料 / 導覽 ──
        items: [],            // 當前層項目：{ id,label,score,parentKey,type,ux,uy,uz,el,_sx,_sy,_depth }
        navStack: [],         // [{ type, filter, label }]（不含當前層；當前層為 stack 末端）
        currentLayer: null,   // { type, filter, label, merged }

        // ── 3D / 互動狀態 ──
        // 以「旋轉矩陣」表示鏡頭朝向，避免歐拉角在極點的萬向鎖（gimbal lock），
        // 讓玩家可無限制、順暢地朝任意方向拖曳。
        rotMat: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        velAx: 0, velAy: 0,          // 慣性：每幀繞螢幕 X / Y 軸的旋轉角
        zoom: 1,
        state: S_IDLE,
        lockedItem: null,
        centerItem: null,            // 預覽鎖定時要帶到正面中心的項目
        centering: false,
        rafId: null,
        lastInteraction: 0,
        idleHintActive: false,
        stars: [],                   // 隨鏡頭旋轉的 3D 星點

        // ── 手勢暫存 ──
        _dragging: false,
        _downX: 0, _downY: 0,
        _downT: 0,
        _lastX: 0, _lastY: 0,
        _pinchStartDist: 0,
        _pinchStartZoom: 1,
        _pinching: false,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('wordcloud-css')) {
                const link = document.createElement('link');
                link.id = 'wordcloud-css';
                link.rel = 'stylesheet';
                link.href = 'wordCloud.css';
                document.head.appendChild(link);
            }
        },

        // ========================================================
        // 初始化（僅一次）
        // ========================================================
        init: function () {
            this.loadCSS();
            if (!document.getElementById('wordcloud-container')) {
                this.createDOM();
                this.bindEvents();
            }
            this.container = document.getElementById('wordcloud-container');
            this.cloudEl = document.getElementById('wordcloud-cloud');
            this.svgEl = document.getElementById('wordcloud-lines');
            this.wireGroup = document.getElementById('wordcloud-wire');
            this.siblingGroup = document.getElementById('wordcloud-sibling');
            this.breadcrumbEl = document.getElementById('wordcloud-breadcrumb');
            this.backBtnEl = document.getElementById('wordcloud-back');
            this.dynastyChk = document.getElementById('wordcloud-chk-dynasty');
            this.poetChk = document.getElementById('wordcloud-chk-poet');
            this.hintEl = document.getElementById('wordcloud-gesture-hint');
            this.zoomLabelEl = document.getElementById('wordcloud-zoom-label');
            this.starSphereEl = document.getElementById('wordcloud-starsphere');
            if (this.stars.length === 0) this._buildStars();
        },

        // 生成隨鏡頭旋轉的 3D 星點（構成一圈環繞的星空）
        _buildStars: function () {
            const N = 110;
            this.stars = [];
            const frag = document.createDocumentFragment();
            for (let i = 0; i < N; i++) {
                // 均勻分佈於單位球面
                const u = Math.random() * 2 - 1;
                const theta = Math.random() * Math.PI * 2;
                const r = Math.sqrt(1 - u * u);
                const el = document.createElement('div');
                el.className = 'wordcloud-star';
                const size = 0.8 + Math.random() * 1.8;
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                const star = { ux: r * Math.cos(theta), uy: r * Math.sin(theta), uz: u, el, base: 0.4 + Math.random() * 0.6 };
                this.stars.push(star);
                frag.appendChild(el);
            }
            this.starSphereEl.appendChild(frag);
        },

        // 每幀更新星點（與文字用同一旋轉矩陣，達成「鏡頭轉動、星空同轉」）
        _updateStars: function () {
            if (!this.stars.length) return;
            const R = 300;   // 星空半徑（大於文字球，形成背景）
            for (const s of this.stars) {
                const rp = this._rotate(s);
                const persp = STAR_CAM / (STAR_CAM - rp.z);
                const sx = CENTER_X + rp.x * R * persp;
                const sy = CENTER_Y + rp.y * R * persp;
                const depthT = (rp.z + 1) / 2;
                s.el.style.left = sx + 'px';
                s.el.style.top = sy + 'px';
                s.el.style.opacity = (s.base * (0.25 + 0.75 * depthT)).toFixed(2);
            }
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'wordcloud-container';
            div.className = 'wordcloud-overlay hidden';
            div.innerHTML = `
                <div class="wordcloud-starfield"></div>
                <div id="wordcloud-starsphere" class="wordcloud-starsphere"></div>
                <div class="wordcloud-topbar">
                    <button id="wordcloud-back" class="wordcloud-back-btn" aria-label="返回上一層">‹ 返回</button>
                    <div id="wordcloud-breadcrumb" class="wordcloud-breadcrumb"></div>
                    <label class="wordcloud-chk-label">
                        <input type="checkbox" id="wordcloud-chk-dynasty" checked> 朝代
                    </label>
                    <label class="wordcloud-chk-label">
                        <input type="checkbox" id="wordcloud-chk-poet" checked> 詩人
                    </label>
                </div>
                <div class="wordcloud-stage">
                    <svg id="wordcloud-lines" class="wordcloud-lines" viewBox="0 0 ${STAGE_W} ${STAGE_H}" preserveAspectRatio="none"><g id="wordcloud-wire"></g><g id="wordcloud-sibling"></g></svg>
                    <div id="wordcloud-cloud" class="wordcloud-cloud"></div>
                    <div id="wordcloud-zoom-label" class="wordcloud-zoom-label"></div>
                    <div class="wordcloud-edge-glow"></div>
                </div>
                <div id="wordcloud-gesture-hint" class="wordcloud-gesture-hint">空白處拖曳旋轉 · 滾輪/雙指縮放 · 點兩下進入</div>
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
            const stage = document.querySelector('#wordcloud-container .wordcloud-stage');

            // 返回鍵
            document.getElementById('wordcloud-back').addEventListener('click', () => {
                this.goToParentLayer();
            });

            // 勾選框：改變後從第一層重建
            const rebuild = () => { this.buildInitialLayer(); };
            document.getElementById('wordcloud-chk-dynasty').addEventListener('change', rebuild);
            document.getElementById('wordcloud-chk-poet').addEventListener('change', rebuild);

            // ── 滑鼠（桌機）：拖曳旋轉 ──
            stage.addEventListener('mousedown', (e) => {
                if (e.target.closest('.wordcloud-topbar')) return;
                this._startDrag(e.clientX, e.clientY);
            });
            window.addEventListener('mousemove', (e) => {
                if (this._downT) this._moveDrag(e.clientX, e.clientY);
            });
            window.addEventListener('mouseup', (e) => {
                if (this._downT) this._endDrag(e.clientX, e.clientY, e.target);
            });

            // ── 滾輪縮放 ──
            stage.addEventListener('wheel', (e) => {
                e.preventDefault();
                this._applyZoomDelta(e.deltaY < 0 ? 1.08 : 0.92);
            }, { passive: false });

            // ── 觸控 ──
            stage.addEventListener('touchstart', (e) => {
                if (e.target.closest('.wordcloud-topbar')) return;
                if (e.touches.length === 2) {
                    this._pinching = true;
                    this._pinchStartDist = this._touchDist(e.touches);
                    this._pinchStartZoom = this.zoom;
                    this._downT = 0;            // 取消單指拖曳判定
                    this._dragging = false;
                } else if (e.touches.length === 1) {
                    this._startDrag(e.touches[0].clientX, e.touches[0].clientY);
                }
                e.preventDefault();
            }, { passive: false });

            stage.addEventListener('touchmove', (e) => {
                if (this._pinching && e.touches.length === 2) {
                    const d = this._touchDist(e.touches);
                    if (this._pinchStartDist > 0) {
                        const target = this._pinchStartZoom * (d / this._pinchStartDist);
                        this._setZoom(target);
                    }
                } else if (this._downT && e.touches.length === 1) {
                    this._moveDrag(e.touches[0].clientX, e.touches[0].clientY);
                }
                e.preventDefault();
            }, { passive: false });

            stage.addEventListener('touchend', (e) => {
                if (this._pinching) {
                    if (e.touches.length === 0) this._pinching = false;
                    return;
                }
                if (this._downT) {
                    const t = e.changedTouches[0];
                    // 觸控結束時以 elementFromPoint 找命中項目
                    const el = document.elementFromPoint(t.clientX, t.clientY);
                    this._endDrag(t.clientX, t.clientY, el);
                }
                e.preventDefault();
            }, { passive: false });
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.container.classList.remove('hidden');
            this.buildInitialLayer();
            this._startLoop();
            // 手勢提示 5 秒後淡出
            if (this.hintEl) {
                this.hintEl.classList.remove('faded');
                clearTimeout(this._hintTimer);
                this._hintTimer = setTimeout(() => {
                    if (this.hintEl) this.hintEl.classList.add('faded');
                }, 5000);
            }
        },

        hide: function () {
            this.stopGame();
        },

        // menu.js 全域清理只呼叫 stopGame()，故此處須主動隱藏
        stopGame: function () {
            this._stopLoop();
            if (this.container) this.container.classList.add('hidden');
        },

        // ========================================================
        // 資料聚合
        // ========================================================
        // POEMS 是全域 const（非掛在 window），以 typeof 安全取用
        _poems: function () {
            return (typeof POEMS !== 'undefined' && POEMS) ? POEMS : [];
        },

        aggregateDynastyScores: function () {
            const map = new Map();
            this._poems().forEach(p => {
                const dyn = p.dynasty || '未知';
                if (!map.has(dyn)) map.set(dyn, { id: dyn, label: dyn, score: 0, type: 'dynasty', parentKey: null });
                map.get(dyn).score += (p.rating || 0);
            });
            return Array.from(map.values());
        },

        aggregatePoetScores: function (dynastyFilter) {
            const map = new Map();
            this._poems().forEach(p => {
                if (dynastyFilter && (p.dynasty || '未知') !== dynastyFilter) return;
                const author = p.author || '佚名';
                if (!map.has(author)) {
                    map.set(author, { id: author, label: author, score: 0, type: 'poet', parentKey: p.dynasty || '未知' });
                }
                map.get(author).score += (p.rating || 0);
            });
            return Array.from(map.values());
        },

        aggregatePoemItems: function (filter) {
            const out = [];
            this._poems().forEach(p => {
                if (filter) {
                    if (filter.author && (p.author || '佚名') !== filter.author) return;
                    if (filter.dynasty && (p.dynasty || '未知') !== filter.dynasty) return;
                }
                out.push({
                    id: p.id,
                    label: p.title || '（無題）',
                    score: (p.rating || 0),
                    type: 'poem',
                    parentKey: p.author || '佚名',
                    poemId: p.id
                });
            });
            return out;
        },

        // ========================================================
        // 導覽層級建立
        // ========================================================
        // 依勾選框決定起始層並重建
        buildInitialLayer: function () {
            const useDynasty = this.dynastyChk.checked;
            const usePoet = this.poetChk.checked;
            this.navStack = [];
            let layer;
            if (useDynasty) {
                layer = { type: 'dynasty', filter: null, label: null };
            } else if (usePoet) {
                layer = { type: 'poet', filter: null, label: null };
            } else {
                layer = { type: 'poem', filter: null, label: null };
            }
            this.navStack.push(layer);
            this._loadLayer(layer);
        },

        // 進入某項目的下一層
        _drillInto: function (item) {
            const usePoet = this.poetChk.checked;
            let next;
            if (item.type === 'dynasty') {
                next = usePoet
                    ? { type: 'poet', filter: { dynasty: item.id }, label: item.label }
                    : { type: 'poem', filter: { dynasty: item.id }, label: item.label };
            } else if (item.type === 'poet') {
                next = { type: 'poem', filter: { author: item.id }, label: item.label };
            } else {
                // 詩詞層 → 開啟既有詩詞資料對話框
                if (window.openPoemDialogById) window.openPoemDialogById(item.poemId);
                else if (window.PoemDialog) window.PoemDialog.openById(item.poemId);
                return;
            }
            this.navStack.push(next);
            this._playSound('playConfirmItem');
            this._focusZoomTransition(item, () => this._loadLayer(next));
        },

        goToParentLayer: function () {
            if (this.navStack.length <= 1) {
                // 已在最外層 → 返回主選單
                this.hide();
                if (window.MenuController && window.MenuController.closeAll) {
                    // 不強制，交給 menu 流程
                }
                return;
            }
            if (this.state === S_TRANSITION) return;
            this._playSound('playOpenItem');
            this.navStack.pop();
            const prev = this.navStack[this.navStack.length - 1];
            this.zoom = 1;
            this._loadLayer(prev, true);
        },

        // 載入指定層：計算項目、球面佈局、渲染
        _loadLayer: function (layer, isBack) {
            this.currentLayer = layer;
            let raw;
            if (layer.type === 'dynasty') {
                raw = this.aggregateDynastyScores();
                layer.merged = false;
            } else if (layer.type === 'poet') {
                raw = this.aggregatePoetScores(layer.filter && layer.filter.dynasty);
                layer.merged = !(layer.filter && layer.filter.dynasty);
            } else {
                raw = this.aggregatePoemItems(layer.filter);
                layer.merged = !(layer.filter && layer.filter.author);
            }

            // 依分數由高到低排序，並套用數量上限
            raw.sort((a, b) => b.score - a.score);
            const cap = LAYER_PARAMS[layer.type].cap;
            if (raw.length > cap) raw = raw.slice(0, cap);

            this.items = raw;
            this._layoutSphere();
            this._renderItems();
            this._updateBreadcrumb();
            this._updateBackBtn();

            // 重置互動狀態
            this.state = S_IDLE;
            this.lockedItem = null;
            this.centerItem = null;
            this.centering = false;
            this.rotMat = [1, 0, 0, 0, 1, 0, 0, 0, 1];
            this.velAx = 0;
            this.velAy = 0;
            if (this.navStack.length <= 1) this.zoom = Math.max(this.zoom, MIN_ZOOM_TOP);
            this.lastInteraction = performance.now();
            this._clearIdleHint();
            this._clearLines();
        },

        // ── 球面佈局：費波納契初始分佈 → 依尺寸做防重疊鬆弛 ──
        _layoutSphere: function () {
            const n = this.items.length;
            const params = LAYER_PARAMS[this.currentLayer.type];
            let minS = Infinity, maxS = -Infinity;
            for (const it of this.items) {
                if (it.score < minS) minS = it.score;
                if (it.score > maxS) maxS = it.score;
            }
            for (let i = 0; i < n; i++) {
                const it = this.items[i];
                // 1. 費波納契球面均勻分佈（i=0 在極點 → 正面中心）
                const py = n === 1 ? 1 : 1 - (i / (n - 1)) * 2;
                const r = Math.sqrt(Math.max(0, 1 - py * py));
                const theta = GOLDEN_ANGLE * i;
                it.ux = Math.cos(theta) * r;
                it.uy = Math.sin(theta) * r;
                it.uz = py;
                // 2. 依評價計算固定大小倍率
                const t = (maxS === minS) ? 1 : (it.score - minS) / (maxS - minS);
                it.scoreScale = SCORE_MIN_SCALE + (SCORE_MAX_SCALE - SCORE_MIN_SCALE) * t;
                // 3. 顯示標題（截斷）與字數
                it.displayLabel = this._truncateLabel(it.label);
                it.charCount = Array.from(it.displayLabel).length;
                // 4. 估算該項目在球面上所需的「角半徑」：以中景字體推算螢幕尺寸再換算成角度。
                //    寬 ≈ 字數×字體、高 ≈ 字體；換算成角度時除以球半徑（透視係數在前後相消）。
                const font = params.refFont * it.scoreScale;
                const wHalf = 0.5 * it.charCount * font;
                const hHalf = 0.5 * font;
                it.angR = RELAX_PAD * Math.hypot(wHalf, hHalf) / params.radius;
            }
            // 5. 防重疊鬆弛：大項目佔更多角空間，把鄰居推開，消除文字重疊
            this._relaxSphere();
            this._computeWireEdges();
        },

        // ── 球面防重疊鬆弛（size-aware force-directed relaxation）──
        //    以「兩項目角距 < 角半徑之和」判定重疊，沿測地線把彼此推開，反覆數十次收斂。
        _relaxSphere: function () {
            const items = this.items;
            const n = items.length;
            if (n < 2) return;
            const dx = new Float64Array(n), dy = new Float64Array(n), dz = new Float64Array(n);
            for (let iter = 0; iter < RELAX_ITERS; iter++) {
                dx.fill(0); dy.fill(0); dz.fill(0);
                for (let i = 0; i < n; i++) {
                    const a = items[i];
                    for (let j = i + 1; j < n; j++) {
                        const b = items[j];
                        let cos = a.ux * b.ux + a.uy * b.uy + a.uz * b.uz;
                        cos = Math.max(-1, Math.min(1, cos));
                        const ang = Math.acos(cos);
                        const minAng = a.angR + b.angR;
                        if (ang >= minAng) continue;
                        const push = (minAng - ang) * 0.5 * 0.5;   // 各推一半，再乘鬆弛強度
                        // a 沿「指向 b 的切線」反方向移動（遠離 b）
                        let tax = b.ux - a.ux * cos, tay = b.uy - a.uy * cos, taz = b.uz - a.uz * cos;
                        let tl = Math.hypot(tax, tay, taz);
                        if (tl < 1e-9) {   // 幾乎重合：給隨機切向避免卡死
                            tax = Math.random() - 0.5; tay = Math.random() - 0.5; taz = Math.random() - 0.5;
                            const d = tax * a.ux + tay * a.uy + taz * a.uz;
                            tax -= d * a.ux; tay -= d * a.uy; taz -= d * a.uz;
                            tl = Math.hypot(tax, tay, taz) || 1;
                        }
                        tax /= tl; tay /= tl; taz /= tl;
                        dx[i] -= tax * push; dy[i] -= tay * push; dz[i] -= taz * push;
                        // b 沿「指向 a 的切線」反方向移動（遠離 a）
                        let tbx = a.ux - b.ux * cos, tby = a.uy - b.uy * cos, tbz = a.uz - b.uz * cos;
                        let tbl = Math.hypot(tbx, tby, tbz) || 1;
                        tbx /= tbl; tby /= tbl; tbz /= tbl;
                        dx[j] -= tbx * push; dy[j] -= tby * push; dz[j] -= tbz * push;
                    }
                }
                // 套用位移並重新投影回單位球
                for (let i = 0; i < n; i++) {
                    const it = items[i];
                    let x = it.ux + dx[i], y = it.uy + dy[i], z = it.uz + dz[i];
                    const l = Math.hypot(x, y, z) || 1;
                    it.ux = x / l; it.uy = y / l; it.uz = z / l;
                }
            }
        },

        // ── 計算球面線框：每個項目連向最近的 N 個鄰居（去重）──
        _computeWireEdges: function () {
            const items = this.items;
            const n = items.length;
            const edgeSet = new Set();
            const edges = [];
            for (let i = 0; i < n; i++) {
                const a = items[i];
                const dots = [];
                for (let j = 0; j < n; j++) {
                    if (j === i) continue;
                    const b = items[j];
                    const d = a.ux * b.ux + a.uy * b.uy + a.uz * b.uz; // 點積越大越近
                    dots.push({ j, d });
                }
                dots.sort((p, q) => q.d - p.d);
                const k = Math.min(WIRE_NEIGHBORS, dots.length);
                for (let m = 0; m < k; m++) {
                    const j = dots[m].j;
                    const lo = Math.min(i, j), hi = Math.max(i, j);
                    const key = lo + '_' + hi;
                    if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([lo, hi]); }
                }
            }
            this.wireEdges = edges;
        },

        // ========================================================
        // 3D 數學（旋轉矩陣 / 無萬向鎖）
        // ========================================================
        // 以目前旋轉矩陣轉換單位座標
        _rotate: function (p) {
            const m = this.rotMat;
            return {
                x: m[0] * p.ux + m[1] * p.uy + m[2] * p.uz,
                y: m[3] * p.ux + m[4] * p.uy + m[5] * p.uz,
                z: m[6] * p.ux + m[7] * p.uy + m[8] * p.uz,
            };
        },

        // 3×3 矩陣相乘 A×B
        _matMul: function (A, B) {
            const C = new Array(9);
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 3; c++) {
                    C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
                }
            }
            return C;
        },

        // 繞任意單位軸旋轉 angle（Rodrigues 公式）
        _matAxisAngle: function (x, y, z, angle) {
            const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
            return [
                t * x * x + c, t * x * y - s * z, t * x * z + s * y,
                t * x * y + s * z, t * y * y + c, t * y * z - s * x,
                t * x * z - s * y, t * y * z + s * x, t * z * z + c,
            ];
        },

        // 在「螢幕空間」施加一次增量旋轉（前乘）：水平拖曳→繞 Y、垂直拖曳→繞 X
        _applyScreenRotation: function (ax, ay) {
            if (ax === 0 && ay === 0) return;
            // 繞螢幕 Y 軸（0,1,0）與 X 軸（1,0,0）的增量旋轉，前乘至現有朝向
            const ry = this._matAxisAngle(0, 1, 0, ay);
            const rx = this._matAxisAngle(1, 0, 0, ax);
            this.rotMat = this._matMul(this._matMul(rx, ry), this.rotMat);
        },

        // ========================================================
        // 渲染
        // ========================================================
        _renderItems: function () {
            this.cloudEl.innerHTML = '';
            const frag = document.createDocumentFragment();
            this.items.forEach(it => {
                const el = document.createElement('div');
                el.className = 'wordcloud-item';
                el.textContent = it.displayLabel || this._truncateLabel(it.label);
                el.title = it.label;   // 完整名稱保留於 tooltip
                el.dataset.id = String(it.id);
                it.el = el;
                frag.appendChild(el);
            });
            this.cloudEl.appendChild(frag);
            this._buildWire();
        },

        // 標題超過 LABEL_MAX_CHARS 字以「…」省略
        _truncateLabel: function (label) {
            const chars = Array.from(label || '');
            if (chars.length <= LABEL_MAX_CHARS) return label;
            return chars.slice(0, LABEL_MAX_CHARS).join('') + '…';
        },

        // 建立藍色球面線框的 SVG line 元素（每層重建一次）
        _buildWire: function () {
            if (!this.wireGroup) return;
            this.wireGroup.innerHTML = '';
            this.wireLines = [];
            (this.wireEdges || []).forEach(([a, b]) => {
                const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                ln.setAttribute('class', 'wordcloud-wire-line');
                this.wireGroup.appendChild(ln);
                this.wireLines.push({ a, b, el: ln });
            });
        },

        // 每幀更新所有項目的位置/字體/透明度
        _updateFrame: function () {
            const params = LAYER_PARAMS[this.currentLayer.type];
            const baseR = params.radius;
            for (const it of this.items) {
                const rp = this._rotate(it);
                const persp = CAM / (CAM - rp.z);
                const sx = CENTER_X + rp.x * baseR * this.zoom * persp;
                const sy = CENTER_Y + rp.y * baseR * this.zoom * persp;
                const depthT = (rp.z + 1) / 2;               // 0(後) → 1(前)
                // 字體 = 參考字體 × 評價倍率 × 鏡頭縮放 × 透視係數。
                //   與位置使用「同一個透視係數 persp」，等同真實鏡頭：前大後小的比例由 CAM 決定。
                let font = params.refFont * it.scoreScale * this.zoom * persp;
                font = Math.max(FONT_MIN_PX, Math.min(FONT_MAX_PX, font));
                const opacity = 0.128 + 0.872 * depthT;
                it._sx = sx; it._sy = sy; it._depth = rp.z;

                const el = it.el;
                el.style.left = sx + 'px';
                el.style.top = sy + 'px';
                el.style.fontSize = font.toFixed(1) + 'px';
                el.style.opacity = opacity.toFixed(2);
                el.style.zIndex = String(Math.round((rp.z + 1) * 500));
                // 太朦朧的背景字停用點擊，避免誤觸
                el.style.pointerEvents = opacity < 0.32 ? 'none' : 'auto';
            }
            // 星空隨鏡頭旋轉
            this._updateStars();
            // 藍色球面線框跟隨旋轉
            this._updateWire();
            // 關聯線跟隨（鎖定期間持續顯示，拖曳轉動時亦維持）
            if (this.state === S_LOCKED && this.currentLayer.merged && this.lockedItem) {
                this._updateLines();
            }
        },

        // 每幀更新藍色線框端點
        _updateWire: function () {
            if (!this.wireLines) return;
            const items = this.items;
            for (const w of this.wireLines) {
                const a = items[w.a], b = items[w.b];
                if (!a || !b) continue;
                w.el.setAttribute('x1', a._sx);
                w.el.setAttribute('y1', a._sy);
                w.el.setAttribute('x2', b._sx);
                w.el.setAttribute('y2', b._sy);
                // 依兩端平均景深淡化背面線條，強化球體立體感
                const avgDepth = (a._depth + b._depth) / 2;
                const op = 0.08 + 0.32 * ((avgDepth + 1) / 2);
                w.el.style.opacity = op.toFixed(2);
            }
        },

        // ========================================================
        // 主迴圈
        // ========================================================
        _startLoop: function () {
            if (this.rafId) return;
            const loop = () => {
                this._tick();
                this.rafId = requestAnimationFrame(loop);
            };
            this.rafId = requestAnimationFrame(loop);
        },
        _stopLoop: function () {
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
        },

        _tick: function () {
            // 鏡頭置中動畫（預覽鎖定）：以軸角旋轉把選取項目平順帶到正面中心
            if (this.centering && this.centerItem) {
                const v = this._rotate(this.centerItem);   // 目前朝向下該項目的位置
                const dot = Math.max(-1, Math.min(1, v.z)); // 與正面 (0,0,1) 的夾角餘弦
                const angle = Math.acos(dot);
                if (angle < 0.01) {
                    this.centering = false;
                } else {
                    // 旋轉軸 = v × f（f = 0,0,1）
                    let ax = v.y, ay = -v.x, az = 0;
                    const len = Math.hypot(ax, ay, az);
                    if (len > 1e-6) {
                        ax /= len; ay /= len; az /= len;
                        const step = this._matAxisAngle(ax, ay, az, angle * 0.2);
                        this.rotMat = this._matMul(step, this.rotMat);
                    } else {
                        this.centering = false;
                    }
                }
            } else if (!this._dragging && !this.centering) {
                // 鬆手後的慣性衰減（不做 idle 自轉，靜止時完全靜止）
                if (Math.abs(this.velAx) > 0.00005 || Math.abs(this.velAy) > 0.00005) {
                    this._applyScreenRotation(this.velAx, this.velAy);
                    this.velAx *= INERTIA_DECAY;
                    this.velAy *= INERTIA_DECAY;
                }
            }

            this._updateFrame();
        },

        // ========================================================
        // 手勢：拖曳旋轉 / 點擊判定
        // ========================================================
        _startDrag: function (x, y) {
            this._downX = this._lastX = x;
            this._downY = this._lastY = y;
            this._downT = performance.now();
            this._dragging = false;
            this.lastInteraction = performance.now();
            this._clearIdleHint();
        },

        _moveDrag: function (x, y) {
            const scale = (window.stageScale || 1);
            const dxTotal = x - this._downX;
            const dyTotal = y - this._downY;
            if (!this._dragging && Math.hypot(dxTotal, dyTotal) > TAP_MOVE_PX) {
                this._dragging = true;
                // 開始拖曳：停止鏡頭置中，但保留預覽鎖定（白框、連接線、虛線框持續顯示）
                this.centering = false;
            }
            if (this._dragging) {
                const dx = (x - this._lastX) / scale;
                const dy = (y - this._lastY) / scale;
                // 水平拖曳 → 繞螢幕 Y 軸；垂直拖曳 → 繞螢幕 X 軸（負號：往上拖曳讓球體往上轉）
                const ay = dx * 0.008;
                const ax = -dy * 0.008;
                this._applyScreenRotation(ax, ay);
                this.velAx = ax;
                this.velAy = ay;
                this._lastX = x;
                this._lastY = y;
            }
        },

        _endDrag: function (x, y, targetEl) {
            const dt = performance.now() - this._downT;
            const moved = Math.hypot(x - this._downX, y - this._downY);
            this._downT = 0;

            if (this._dragging || moved > TAP_MOVE_PX || dt > TAP_TIME_MS) {
                this._dragging = false;
                return; // 視為拖曳，不觸發點擊
            }
            this._dragging = false;
            if (this.state === S_TRANSITION) return;

            // 命中判定：找到 wordcloud-item
            const itemEl = targetEl && targetEl.closest ? targetEl.closest('.wordcloud-item') : null;
            if (!itemEl) { this._unlock(); return; }   // 點空白 → 解除鎖定
            const item = this.items.find(it => it.el === itemEl);
            if (!item) { this._unlock(); return; }
            this._handleTap(item);
        },

        // 兩段式點擊狀態機
        _handleTap: function (item) {
            if (this.state === S_LOCKED && this.lockedItem === item) {
                // 第二次點同一項 → 確認進入
                this._drillInto(item);
                return;
            }
            // 第一次點（或改點別項）→ 鎖定預覽
            this._lockItem(item);
        },

        _lockItem: function (item) {
            this._clearLines();
            if (this.lockedItem && this.lockedItem.el) this.lockedItem.el.classList.remove('locked');
            this.lockedItem = item;
            this.state = S_LOCKED;
            item.el.classList.add('locked');
            this._playSound('playOpenItem');
            // 鏡頭置中動畫（以軸角旋轉將此項目帶到正面中心）
            this.centerItem = item;
            this.centering = true;
            this.velAx = this.velAy = 0;
            // 關聯線（僅合併顯示層級）
            if (this.currentLayer.merged) this._buildLines(item);
        },

        _unlock: function () {
            if (this.lockedItem && this.lockedItem.el) this.lockedItem.el.classList.remove('locked');
            this.lockedItem = null;
            this.centerItem = null;
            this.centering = false;
            if (this.state === S_LOCKED) this.state = S_IDLE;
            this._clearLines();
        },

        // ========================================================
        // 關聯提示線（同源項目）
        // ========================================================
        _buildLines: function (item) {
            this._clearLines();
            const key = item.parentKey;
            if (key == null) return;
            const siblings = this.items.filter(it => it !== item && it.parentKey === key);
            item._siblings = siblings;
            siblings.forEach(s => {
                s.el.classList.add('sibling');
                const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                ln.setAttribute('class', 'wordcloud-line');
                s._line = ln;
                this.siblingGroup.appendChild(ln);
            });
            this._playSound('playOpenItem');
        },

        _updateLines: function () {
            const a = this.lockedItem;
            if (!a || !a._siblings) return;
            a._siblings.forEach(s => {
                if (!s._line) return;
                s._line.setAttribute('x1', a._sx);
                s._line.setAttribute('y1', a._sy);
                s._line.setAttribute('x2', s._sx);
                s._line.setAttribute('y2', s._sy);
                // 依 sibling 深度調整線條透明度
                const op = 0.15 + 0.35 * ((s._depth + 1) / 2);
                s._line.style.opacity = op.toFixed(2);
            });
        },

        _clearLines: function () {
            if (this.siblingGroup) this.siblingGroup.innerHTML = '';   // 只清關聯線，保留藍色球面線框
            this.items.forEach(it => {
                if (it.el) it.el.classList.remove('sibling');
                it._line = null;
                it._siblings = null;
            });
        },

        // ========================================================
        // 聚焦轉場（確認進入下一層）
        // ========================================================
        _focusZoomTransition: function (item, done) {
            this.state = S_TRANSITION;
            this._clearLines();
            // 其餘項目淡出
            this.items.forEach(it => {
                if (it !== item) it.el.classList.add('fading-out');
            });
            // 目標項目放大填滿
            item.el.classList.remove('locked');
            item.el.classList.add('focus-zoom');
            setTimeout(() => {
                done && done();
            }, 620);
        },

        // ========================================================
        // 縮放
        // ========================================================
        _applyZoomDelta: function (factor) {
            this._setZoom(this.zoom * factor);
        },

        _setZoom: function (target) {
            const hasParent = this.navStack.length > 1;
            const params = LAYER_PARAMS[this.currentLayer.type];
            const shortSide = Math.min(STAGE_W, STAGE_H);

            // 以「請求的目標縮放」判定自動返回：不受縮放下限 clamp 影響，
            // 因此各層 radius 不同時（詩詞層球較大）也能可靠觸發返回。
            if (hasParent && this.state !== S_TRANSITION &&
                2 * params.radius * target < shortSide * AUTO_RETURN_RATIO) {
                this.container.classList.remove('near-return');
                this.goToParentLayer();
                return;
            }

            const minZoom = hasParent ? MIN_ZOOM_SUB : MIN_ZOOM_TOP;
            this.zoom = Math.max(minZoom, Math.min(MAX_ZOOM, target));
            this.lastInteraction = performance.now();
            this._clearIdleHint();
            this._showZoomLabel();

            // 縮放臨界警示（接近返回門檻時畫面邊緣泛光）
            const nearThreshold = 2 * params.radius * this.zoom < shortSide * (AUTO_RETURN_RATIO + 0.08);
            this.container.classList.toggle('near-return', hasParent && nearThreshold);
        },

        _showZoomLabel: function () {
            if (!this.zoomLabelEl) return;
            this.zoomLabelEl.textContent = this.zoom.toFixed(1) + 'x';
            this.zoomLabelEl.classList.add('visible');
            clearTimeout(this._zoomLabelTimer);
            this._zoomLabelTimer = setTimeout(() => {
                this.zoomLabelEl.classList.remove('visible');
            }, 600);
        },

        // ========================================================
        // 麵包屑 / 返回鍵
        // ========================================================
        _updateBreadcrumb: function () {
            const parts = ['文字雲'];
            this.navStack.forEach(layer => {
                if (layer.label) parts.push(layer.label);
            });
            this.breadcrumbEl.innerHTML = '';
            parts.forEach((p, idx) => {
                if (idx > 0) {
                    const sep = document.createElement('span');
                    sep.className = 'wordcloud-crumb-sep';
                    sep.textContent = '›';
                    this.breadcrumbEl.appendChild(sep);
                }
                const span = document.createElement('span');
                span.className = 'wordcloud-crumb';
                span.textContent = p;
                // 可點擊跳回該層（idx 對應 navStack 索引；idx 0 = 根，跳回起始層）
                span.addEventListener('click', () => {
                    if (this.state === S_TRANSITION) return;
                    const targetLen = Math.max(1, idx);
                    if (this.navStack.length > targetLen) {
                        this.navStack = this.navStack.slice(0, targetLen);
                        this.zoom = 1;
                        this._loadLayer(this.navStack[this.navStack.length - 1], true);
                    }
                });
                this.breadcrumbEl.appendChild(span);
            });
        },

        _updateBackBtn: function () {
            // 最外層時返回鍵改為「離開」語意，仍保留可點
            this.backBtnEl.textContent = this.navStack.length > 1 ? '‹ 返回' : '‹ 離開';
        },

        // ========================================================
        // 15 秒無操作提示
        // ========================================================
        _checkIdleHint: function () {
            if (this.state !== S_IDLE) return;
            const idle = performance.now() - this.lastInteraction;
            if (idle > IDLE_HINT_MS && !this.idleHintActive) {
                this.idleHintActive = true;
                // 分數最高的前 3 項脈動
                const top = this.items.slice().sort((a, b) => b.score - a.score).slice(0, 3);
                top.forEach(it => it.el && it.el.classList.add('idle-pulse'));
            }
        },

        _clearIdleHint: function () {
            if (this.idleHintActive) {
                this.items.forEach(it => it.el && it.el.classList.remove('idle-pulse'));
                this.idleHintActive = false;
            }
            this.lastInteraction = performance.now();
        },

        // ========================================================
        // 工具
        // ========================================================
        _touchDist: function (touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.hypot(dx, dy);
        },

        _angDiff: function (a, b) {
            let d = (b - a) % (2 * Math.PI);
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            return d;
        },
        _angLerp: function (a, b, t) {
            return a + this._angDiff(a, b) * t;
        },

        _playSound: function (fn) {
            try { if (window.SoundManager && window.SoundManager[fn]) window.SoundManager[fn](); }
            catch (e) { /* 靜默 */ }
        },
    };

    // ── 掛載全域 ──
    window.WordCloud = WordCloud;

    // URL 自動啟動（?page=wordcloud）
    document.addEventListener('DOMContentLoaded', () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('page') === 'wordcloud') {
            setTimeout(() => {
                if (window.WordCloud) window.WordCloud.show();
                window.history.replaceState({}, document.title, window.location.pathname);
            }, 80);
        }
    });

})();
