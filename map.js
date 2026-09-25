/* ============================================================================
 * map.js — 詩路地圖 (Poem Geography Map)
 * ----------------------------------------------------------------------------
 * 一頁「資料探索」介面（非遊戲、無計分、無難度）。在中國地圖上標出曾出現在
 * 詩詞裡的地點：點選地標 → 顯示該處相關詩詞列表 → 點擊詩詞 → 開啟既有的
 * 「詩詞資料」對話框（poem_dialog.js 的 window.openPoemDialogById）。
 *
 * 資料來源：data/poem_locations.js
 *   目前只收錄 data/poems.js 中 rating>=6 的詩詞裡，考據把握足夠的地點
 *   （52 首詩、62 個地點）。完整考據過程與「哪些詩故意不標點」的理由，
 *   見 note/詩路地圖_地點候選清單與底圖校準.md。
 *
 * 底圖：images/中國地圖_高德暫代版.png（暫代版，未來會替換成手繪地圖）
 *   這是一張 1932×1392px 的高德地圖網頁截圖，採 Web Mercator 投影。
 *   geoToPixel() 把 (lat,lng) 換算成這張底圖的像素座標，換底圖時只需要
 *   重新校準 MAP_CALIB 這三個常數（校準方法同樣寫在上面那份文件裡）。
 *
 * 慣例：所有 class 加 map- 前綴；overlay 掛於 document.body（非 #stage，
 *       因 stage 有 transform 會造成 position:fixed 雙重縮放）；透過
 *       registerOverlayResize 同步舞台縮放；window.PoemMap 掛全域供 menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;

    // ── 版面配置：頂部標題列 + 中間地圖畫布 + 底部手勢提示列 ──
    const HEADER_H = 60;
    const HINT_H = 40;
    const CANVAS_H = STAGE_H - HEADER_H - HINT_H;

    // ── 底圖資訊 ──
    const IMG_SRC = 'images/中國地圖_高德暫代版.png';
    const IMG_W = 1932;
    const IMG_H = 1392;

    // ── 底圖座標校準（Web Mercator）──
    // KX（經度→x）與 A（緯度→y）刻意分開估計、不強制相等：這張截圖疑似非等比縮放
    // （可能是瀏覽器截圖時的縮放/壓縮造成），實測 X 與 Y 方向比例尺確實有落差。
    //
    // ⚠️ 2026-09 三度校正：前兩版都是靠比對底圖地形細節推算，玩家實測後證實
    // 仍有明顯偏差（成都、北京都偏北偏東）。這次改用最可靠的方法：
    // 在 map.js 加入 DEBUG_POINTS 除錯模式（&debug=1），把北京/上海/廣州/重慶
    // 等已知城市直接畫在地圖上，玩家對照 Gaode 截圖標出每個點「實際該在哪」，
    // 再用畫面上同時可見的其他詩詞地標（例如上海畫面裡同時看得到楓橋、武康、
    // 杭州、紹興）當內部參考點，反推當下截圖的縮放／平移（4 個點殘差通常在
    // 1px 以內，非常穩定），才換算出玩家標出的座標對應的真實世界座標。
    // 最後用北京／上海／廣州／重慶四個分散全國的樣本重新做最小平方法回歸，
    // 全部殘差 < 4px。換底圖時比照這個流程（debug 模式＋玩家標註＋內部參考點
    // 反推）重做一次即可，遠比自己看地形猜測可靠。
    const MAP_CALIB = { A: 1678.62, BX: -2121.83, BY: 1891.51, KX: 29.6885 };

    function geoToPixel(lat, lng) {
        const RAD = Math.PI / 180;
        const x = MAP_CALIB.KX * lng + MAP_CALIB.BX;
        const mercY = Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));
        const y = -MAP_CALIB.A * mercY + MAP_CALIB.BY;
        return { x, y };
    }

    // ── 縮放範圍 ──
    // 0.2：讓校準除錯模式下可以縮到看見整張底圖（含最北/最南/最東/最西四個測試點）
    const MIN_ZOOM = 0.2;
    const MAX_ZOOM = 4;

    // ── 點擊地標的容錯半徑（螢幕像素，換算成世界座標時需除以 zoom）──
    const HIT_RADIUS_SCREEN = 14;

    // ========================================================
    // ⚠️ 校準除錯用測試點（2026-09 暫時新增，校準確認無誤後可整段移除）
    //   網址加上 &debug=1（即 index.html?page=map&debug=1）即會在地圖上疊加
    //   這些藍色菱形＋常駐地名標籤，方便直接對照 Gaode 地圖檢查座標準不準，
    //   不需要再靠點擊才看得到座標是否正確。
    // ========================================================
    const DEBUG_POINTS = [
        { name: '北京', lat: 39.9042, lng: 116.4074 },
        { name: '上海', lat: 31.2304, lng: 121.4737 },
        { name: '重慶', lat: 29.5630, lng: 106.5516 },
        { name: '武漢', lat: 30.5928, lng: 114.3055 },
        { name: '廣州', lat: 23.1291, lng: 113.2644 },
        { name: '廈門', lat: 24.4798, lng: 118.0894 },
        { name: '最北●漠河北極村', lat: 53.5500, lng: 122.3400 },
        { name: '最東●黑龍江烏蘇里江口', lat: 48.2400, lng: 134.7700 },
        { name: '最西●帕米爾高原(烏恰縣)', lat: 39.7100, lng: 73.9600 },
        { name: '最南●曾母暗沙', lat: 3.7900, lng: 112.3400 },
    ];

    // ── 關係欄位的中文標籤（對照 data/poem_locations.js 的 relation 欄位）──
    const RELATION_LABEL = { scene: '實景', hometown: '故鄉', exile: '貶謫', destination: '目的地' };

    // 放大到這個倍率（含）以上時，地標旁常駐顯示「詩詞寫作時當代地名」
    const LABEL_MIN_ZOOM = 2.0;

    // 詩句總評價（line_ratings 平均）：與 achievement.js 收藏排序用的計算方式完全一致，
    // 確保「詩詞評價相同時，比詩句總評價高低」在全站呈現一致的排序結果。
    function avgLineRating(p) {
        const lr = (p && p.line_ratings) || [];
        if (!lr.length) return 0;
        let s = 0;
        for (let i = 0; i < lr.length; i++) s += (lr[i] || 0);
        return s / lr.length;
    }

    const PoemMap = {
        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,
        dpr: 1,

        // ── 底圖 ──
        mapImage: null,
        imageLoaded: false,

        // ── 相機（縮放/平移）──
        zoom: 1,
        panX: 0,
        panY: 0,

        // ── 地標資料（由 buildMarkers() 依座標分群產生）──
        markers: [],
        // 目前被點擊、以金黃色強調顯示的地標 key（見 buildMarkers 的 key 欄位）
        selectedKey: null,

        // ── 執行狀態 ──
        active: false,
        // 網址帶 &debug=1 時開啟：疊加 DEBUG_POINTS 校準測試點
        debugMode: new URLSearchParams(window.location.search).get('debug') === '1',

        // ── 手勢暫存 ──
        _pointerDown: false,
        _dragged: false,
        _lastSX: 0, _lastSY: 0,
        _downSX: 0, _downSY: 0,
        _pinching: false,
        _pinchStartDist: 0,
        _pinchStartZoom: 1,
        _lastMidSX: 0, _lastMidSY: 0,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('map-css')) {
                const link = document.createElement('link');
                link.id = 'map-css';
                link.rel = 'stylesheet';
                link.href = 'map.css';
                document.head.appendChild(link);
            }
        },

        // ========================================================
        // 初始化（僅一次）
        // ========================================================
        init: function () {
            this.loadCSS();
            if (!document.getElementById('map-container')) {
                this.createDOM();
                this.bindEvents();
                this.buildMarkers();
                this._loadImage();
            }
            this.container = document.getElementById('map-container');
            this.canvas = document.getElementById('map-canvas');
            this.ctx = this.canvas.getContext('2d');
            this._setupCanvasSize();
        },

        // 依 devicePixelRatio 設定畫布解析度，維持高 DPI 清晰
        _setupCanvasSize: function () {
            this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
            this.canvas.width = STAGE_W * this.dpr;
            this.canvas.height = CANVAS_H * this.dpr;
            this.canvas.style.width = STAGE_W + 'px';
            this.canvas.style.height = CANVAS_H + 'px';
        },

        // 底圖是外部 PNG，非同步載入完成前先讓畫面保持空白背景，載完後補畫一次
        _loadImage: function () {
            const img = new Image();
            img.onload = () => {
                this.mapImage = img;
                this.imageLoaded = true;
                if (this.active) this._render();
            };
            img.onerror = () => {
                console.error('[PoemMap] 底圖載入失敗：' + IMG_SRC);
            };
            img.src = IMG_SRC;
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'map-container';
            div.className = 'map-overlay hidden';
            div.innerHTML = `
                <div class="map-header">
                    <div class="map-title">詩路地圖</div>
                    <div id="map-close" class="map-close" aria-label="關閉">✕</div>
                </div>
                <canvas id="map-canvas" class="map-canvas"></canvas>
                <div id="map-hint" class="map-hint">拖曳平移・滾輪/雙指縮放・點選地標看詩</div>
                <div id="map-popup" class="map-popup hidden">
                    <div class="map-popup-header">
                        <div id="map-popup-place" class="map-popup-place"></div>
                        <div id="map-popup-close" class="map-popup-close" aria-label="關閉">✕</div>
                    </div>
                    <div id="map-popup-list" class="map-popup-list"></div>
                </div>
            `;
            // ⚠️ 必須掛於 body：#stage 有 CSS transform，掛在裡面會讓 position:fixed 雙重縮放
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
        // 資料：把 POEM_LOCATIONS 依座標分群成「地標」
        //   同一座標（例如多首詩都寫長安）合併成一個地標、內含多首詩，
        //   避免同一個城市疊出好幾個重疊的圓點。
        // ========================================================
        buildMarkers: function () {
            if (typeof POEM_LOCATIONS === 'undefined' || typeof POEMS === 'undefined') {
                console.error('[PoemMap] 找不到 POEM_LOCATIONS 或 POEMS，請確認 data/poem_locations.js 已在 index.html 中載入');
                this.markers = [];
                return;
            }
            const clusters = {};
            Object.keys(POEM_LOCATIONS).forEach((idStr) => {
                const id = Number(idStr);
                const poem = POEMS.find((p) => p.id === id);
                if (!poem) return;
                POEM_LOCATIONS[idStr].locs.forEach((loc) => {
                    // 用經緯度四捨五入到小數點後兩位當分群 key（約 1 公里誤差內視為同一地點）
                    const key = loc.lat.toFixed(2) + '_' + loc.lng.toFixed(2);
                    if (!clusters[key]) {
                        // oldPlace 取這個座標第一次出現時的古地名（POEM_LOCATIONS 的 key 會依 id 升冪列舉，
                        // 即同一地點的最小 id 詩詞決定代表古地名；同座標偶有不同建築物/景點時的簡化取捨）
                        clusters[key] = { lat: loc.lat, lng: loc.lng, modern: loc.modern || loc.place, oldPlace: loc.place, poems: [] };
                    }
                    clusters[key].poems.push({
                        id: poem.id,
                        title: poem.title,
                        author: poem.author,
                        rating: poem.rating || 0,
                        lineRatingAvg: avgLineRating(poem),
                        oldPlace: loc.place,
                        relation: loc.relation,
                        certainty: loc.certainty,
                        note: loc.note,
                    });
                });
            });

            this.markers = Object.keys(clusters).map((key) => {
                const c = clusters[key];
                const px = geoToPixel(c.lat, c.lng);
                // 詩詞評價（高→低）為主鍵，詩句總評價（同 achievement.js 收藏排序）為次鍵
                c.poems.sort((a, b) =>
                    (b.rating || 0) - (a.rating || 0) ||
                    (b.lineRatingAvg - a.lineRatingAvg) ||
                    (a.id || 0) - (b.id || 0)
                );
                // hasReal：這一群裡只要有一首詩不是「延伸連結」，地標就畫成實心
                const hasReal = c.poems.some((p) => p.certainty !== 'symbolic');
                return { key: key, x: px.x, y: px.y, modern: c.modern, oldPlace: c.oldPlace, poems: c.poems, hasReal: hasReal };
            });
        },

        // ========================================================
        // 事件綁定
        // ========================================================
        bindEvents: function () {
            const cv = document.getElementById('map-canvas');

            document.getElementById('map-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('map-popup-close').addEventListener('click', () => this._closePopup());

            // ── 滑鼠（桌機）：拖曳平移 ／ 點擊地標 ──
            cv.addEventListener('mousedown', (e) => {
                const c = this._canvasCoords(e.clientX, e.clientY);
                this._pointerDown = true;
                this._dragged = false;
                this._lastSX = c.x; this._lastSY = c.y;
                this._downSX = c.x; this._downSY = c.y;
            });
            window.addEventListener('mousemove', (e) => {
                if (!this._pointerDown) return;
                const c = this._canvasCoords(e.clientX, e.clientY);
                this.panX += c.x - this._lastSX;
                this.panY += c.y - this._lastSY;
                if (Math.hypot(c.x - this._downSX, c.y - this._downSY) > 4) this._dragged = true;
                this._lastSX = c.x; this._lastSY = c.y;
                this._render();
            });
            window.addEventListener('mouseup', (e) => {
                if (!this._pointerDown) return;
                this._pointerDown = false;
                if (!this._dragged) {
                    const c = this._canvasCoords(e.clientX, e.clientY);
                    this._handleTap(c.x, c.y);
                }
            });

            // ── 滾輪縮放（桌機輔助，以游標為錨點）──
            cv.addEventListener('wheel', (e) => {
                e.preventDefault();
                const c = this._canvasCoords(e.clientX, e.clientY);
                this._zoomAt(e.deltaY < 0 ? 1.12 : 0.88, c.x, c.y);
            }, { passive: false });

            // ── 觸控：單指拖曳平移／點擊地標，雙指縮放＋平移 ──
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
                    const c = this._canvasCoords(e.touches[0].clientX, e.touches[0].clientY);
                    this._pointerDown = true;
                    this._dragged = false;
                    this._lastSX = c.x; this._lastSY = c.y;
                    this._downSX = c.x; this._downSY = c.y;
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
                    if (this._pinchStartDist > 0) {
                        this._setZoomAt(this._pinchStartZoom * (dist / this._pinchStartDist), midX, midY);
                    }
                    this.panX += midX - this._lastMidSX;
                    this.panY += midY - this._lastMidSY;
                    this._lastMidSX = midX; this._lastMidSY = midY;
                    this._render();
                } else if (this._pointerDown && e.touches.length === 1) {
                    const c = this._canvasCoords(e.touches[0].clientX, e.touches[0].clientY);
                    this.panX += c.x - this._lastSX;
                    this.panY += c.y - this._lastSY;
                    if (Math.hypot(c.x - this._downSX, c.y - this._downSY) > 6) this._dragged = true;
                    this._lastSX = c.x; this._lastSY = c.y;
                    this._render();
                }
                e.preventDefault();
            }, { passive: false });

            cv.addEventListener('touchend', (e) => {
                if (e.touches.length === 0) {
                    if (this._pointerDown && !this._dragged) {
                        const t = e.changedTouches && e.changedTouches[0];
                        if (t) {
                            const c = this._canvasCoords(t.clientX, t.clientY);
                            this._handleTap(c.x, c.y);
                        }
                    }
                    this._pinching = false;
                    this._pointerDown = false;
                } else if (e.touches.length === 1) {
                    // 由雙指變單指：重新起算平移基準
                    this._pinching = false;
                    const c = this._canvasCoords(e.touches[0].clientX, e.touches[0].clientY);
                    this._pointerDown = true;
                    this._dragged = false;
                    this._lastSX = c.x; this._lastSY = c.y;
                    this._downSX = c.x; this._downSY = c.y;
                }
            }, { passive: false });
        },

        // ========================================================
        // 座標轉換
        // ========================================================
        // clientX/Y → 畫布邏輯座標（0..500, 0..CANVAS_H），已抵銷 stage 的 CSS 縮放
        _canvasCoords: function (clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) / rect.width * STAGE_W,
                y: (clientY - rect.top) / rect.height * CANVAS_H,
            };
        },

        // 畫布邏輯座標 → 世界座標（抵銷相機縮放/平移，即底圖像素座標）
        _canvasToWorld: function (sx, sy) {
            return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
        },

        // ========================================================
        // 相機縮放（保持錨點螢幕位置不動）
        // ========================================================
        _setZoomAt: function (target, sx, sy) {
            target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, target));
            const w = this._canvasToWorld(sx, sy);
            this.zoom = target;
            this.panX = sx - w.x * this.zoom;
            this.panY = sy - w.y * this.zoom;
        },

        _zoomAt: function (factor, sx, sy) {
            this._setZoomAt(this.zoom * factor, sx, sy);
            this._render();
        },

        // ========================================================
        // 點擊判定：找出點擊位置容錯半徑內最近的地標
        // ========================================================
        _handleTap: function (sx, sy) {
            const w = this._canvasToWorld(sx, sy);
            const hitR = HIT_RADIUS_SCREEN / this.zoom;
            let best = null;
            let bestDist = Infinity;
            this.markers.forEach((m) => {
                const d = Math.hypot(m.x - w.x, m.y - w.y);
                if (d <= hitR && d < bestDist) { best = m; bestDist = d; }
            });
            this.selectedKey = best ? best.key : null;
            this._render();
            if (best) this._openPopup(best);
            else this._closePopup();
        },

        // ========================================================
        // 地點彈窗：列出該地標所有相關詩詞（已依評價排序），點擊詩詞 → 開啟詩詞資料對話框
        // ========================================================
        _openPopup: function (marker) {
            const placeEl = document.getElementById('map-popup-place');
            const listEl = document.getElementById('map-popup-list');
            // 標題：詩詞寫作時當代地名（或景點/建築物）＋現代地名，例如「長安（今陝西省西安市）」
            placeEl.textContent = marker.oldPlace + '（今' + marker.modern + '）';
            listEl.innerHTML = '';
            marker.poems.forEach((p) => {
                const item = document.createElement('div');
                item.className = 'map-popup-item';
                const relLabel = RELATION_LABEL[p.relation] || '';
                const tagClass = p.certainty === 'symbolic' ? 'map-tag-symbolic' : 'map-tag-real';
                item.innerHTML =
                    '<div class="map-popup-item-title">' + p.title +
                    '<span class="map-popup-item-author">' + p.author + '</span></div>' +
                    '<div class="map-popup-item-meta"><span class="map-tag ' + tagClass + '">' + relLabel + '</span>' + p.note + '</div>';
                item.addEventListener('click', () => {
                    if (window.openPoemDialogById) window.openPoemDialogById(p.id);
                });
                listEl.appendChild(item);
            });
            document.getElementById('map-popup').classList.remove('hidden');
        },

        _closePopup: function () {
            const panel = document.getElementById('map-popup');
            if (panel) panel.classList.add('hidden');
            if (this.selectedKey !== null) {
                this.selectedKey = null;
                this._render();
            }
        },

        // ========================================================
        // 繪製
        // ========================================================
        _render: function () {
            if (!this.ctx) return;
            const ctx = this.ctx;
            const dpr = this.dpr;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = 'hsl(200, 20%, 90%)';
            ctx.fillRect(0, 0, STAGE_W, CANVAS_H);

            ctx.save();
            ctx.translate(this.panX, this.panY);
            ctx.scale(this.zoom, this.zoom);

            if (this.imageLoaded) {
                ctx.drawImage(this.mapImage, 0, 0, IMG_W, IMG_H);
            }

            this.markers.forEach((m) => this._drawMarker(m));

            if (this.debugMode) {
                DEBUG_POINTS.forEach((p) => this._drawDebugPoint(p));
            }

            ctx.restore();
        },

        // 校準除錯用：藍色菱形＋常駐地名標籤（見 DEBUG_POINTS 說明）
        _drawDebugPoint: function (p) {
            const ctx = this.ctx;
            const px = geoToPixel(p.lat, p.lng);
            const r = 7 / this.zoom;
            ctx.save();
            ctx.translate(px.x, px.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = 'hsl(210, 90%, 45%)';
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5 / this.zoom;
            ctx.fillRect(-r, -r, r * 2, r * 2);
            ctx.strokeRect(-r, -r, r * 2, r * 2);
            ctx.restore();

            const fontSize = 15 / this.zoom;
            ctx.font = 'bold ' + fontSize + 'px sans-serif';
            ctx.textBaseline = 'middle';
            const labelX = px.x + (10 / this.zoom);
            const labelY = px.y;
            const textW = ctx.measureText(p.name).width;
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.85)';
            ctx.fillRect(labelX - 2 / this.zoom, labelY - fontSize / 2 - 2 / this.zoom, textW + 4 / this.zoom, fontSize + 4 / this.zoom);
            ctx.fillStyle = 'hsl(210, 90%, 30%)';
            ctx.fillText(p.name, labelX, labelY);
        },

        _drawMarker: function (m) {
            const ctx = this.ctx;
            const isSelected = m.key === this.selectedKey;
            // 螢幕上視覺大小固定：世界座標半徑除以 zoom，畫出來的螢幕像素才不會隨縮放暴增
            // 尺寸依「這個地標有幾首詩」決定，用平方根讓成長曲線平緩（避免長安這種 9 首的
            // 大站太過巨大）：1 首 ≈ 8px，4 首 ≈ 12px，9 首 ≈ 16px。
            const baseR = 5 + Math.sqrt(m.poems.length) * 3.7;
            const r = baseR / this.zoom;
            ctx.beginPath();
            ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
            if (isSelected) {
                // 目前被點擊的地標 → 金黃色強調顯示
                ctx.fillStyle = 'hsl(45, 90%, 50%)';
                ctx.fill();
                ctx.lineWidth = 2 / this.zoom;
                ctx.strokeStyle = 'hsl(0, 62%, 30%)';
                ctx.stroke();
            } else if (m.hasReal) {
                // 實景／傳統箋注 → 實心硃紅圓點
                ctx.fillStyle = 'hsl(0, 62%, 42%)';
                ctx.fill();
                ctx.lineWidth = 1.5 / this.zoom;
                ctx.strokeStyle = 'hsl(40, 55%, 94%)';
                ctx.stroke();
            } else {
                // 純延伸連結（如故鄉、無實寫地點）→ 虛線空心圓，明確跟實景區分
                ctx.setLineDash([3 / this.zoom, 2.5 / this.zoom]);
                ctx.lineWidth = 2 / this.zoom;
                ctx.strokeStyle = 'hsl(0, 55%, 42%)';
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 放大到 LABEL_MIN_ZOOM 以上時，常駐顯示「詩詞寫作時當代地名」
            if (this.zoom >= LABEL_MIN_ZOOM) {
                const fontSize = 14 / this.zoom;
                ctx.font = 'bold ' + fontSize + 'px sans-serif';
                ctx.textBaseline = 'middle';
                const labelX = m.x + (r + 4 / this.zoom);
                const labelY = m.y;
                const textW = ctx.measureText(m.oldPlace).width;
                ctx.fillStyle = 'hsla(40, 30%, 97%, 0.85)';
                ctx.fillRect(labelX - 2 / this.zoom, labelY - fontSize / 2 - 2 / this.zoom, textW + 4 / this.zoom, fontSize + 4 / this.zoom);
                ctx.fillStyle = 'hsl(0, 60%, 24%)';
                ctx.fillText(m.oldPlace, labelX, labelY);
            }
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this._closePopup();

            // 相機復位：以「鋪滿整個畫布」的方式縮放（類似 CSS background-size:cover），
            // 讓玩家一開始就能看到足夠細節，再靠拖曳/縮放探索其他區域。
            // ⚠️ debug 模式改用「整張底圖完整縮小顯示」，方便一次截圖比對所有測試點。
            const fitScale = this.debugMode
                ? Math.min(STAGE_W / IMG_W, CANVAS_H / IMG_H)
                : Math.max(STAGE_W / IMG_W, CANVAS_H / IMG_H);
            this.zoom = fitScale;
            this.panX = (STAGE_W - IMG_W * this.zoom) / 2;
            this.panY = (CANVAS_H - IMG_H * this.zoom) / 2;

            this._render();
        },

        // 玩家按 ✕ 主動關閉 → 回到首頁「青雲梯」
        hide: function () {
            this.stopGame();
            if (typeof window.FMGoHome === 'function') window.FMGoHome();
        },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，不呼叫 hide()：
        //    stopGame() 自身必須隱藏 overlay，否則切換頁面後畫面仍被遮蔽
        stopGame: function () {
            this.active = false;
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.PoemMap = PoemMap;

    // URL 參數啟動（與其他資料類模組一致，精確比對 ?page=map）
    if (new URLSearchParams(window.location.search).get('page') === 'map') {
        const start = () => {
            if (window.PoemMap) window.PoemMap.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }
})();
