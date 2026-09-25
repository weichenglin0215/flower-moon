/* ============================================================================
 * map.js — 詩路地圖 (Poem Geography Map)
 * ----------------------------------------------------------------------------
 * 一頁「資料探索」介面（非遊戲、無計分、無難度），共三個 TAB 分頁，共用同一張
 * 底圖與同一組相機（縮放/平移）系統，只有畫布上「畫什麼」與點擊時「做什麼」
 * 依 this.activeTab 分流：
 *   1. 一詩名山河（explore，預設）：在中國地圖上標出曾出現在詩詞裡的地點，
 *      點選地標 → 顯示該處相關詩詞列表 → 點擊詩詞 → 開啟既有的「詩詞資料」
 *      對話框（poem_dialog.js 的 window.openPoemDialogById）。
 *      資料來源：data/poem_locations.js（評價 3～7，202 首詩、217 個地點）。
 *   2. 詩人旅圖（journey）：播放詩人生平行跡動畫，赭紅色路線＋金黃箭頭沿線
 *      移動，時間軸可拖拉／可播放暫停，顯示「事件　年齡　年號（西元）」。
 *      資料來源：data/author_journeys.js（李白、杜甫、白居易、柳宗元、蘇軾）。
 *   3. 詩人故鄉（hometown）：綠點＋詩人名稱標示每位詩人的籍貫，點擊開啟既有的
 *      「名人列傳」（author_bio.js 的 window.AuthorBio.showAndSelect），
 *      關閉名人列傳後回到詩人故鄉。資料來源：data/author_hometowns.js。
 *
 * 底圖：images/中國古地圖.png
 *   這是一張 1932×1392px 的高德地圖網頁截圖，採 Web Mercator 投影。
 *   geoToPixel() 把 (lat,lng) 換算成這張底圖的像素座標，換底圖時只需要
 *   重新校準 MAP_CALIB 這幾個常數（校準方法見 note/詩路地圖_地點候選清單與底圖校準.md）。
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

    // ── 底圖資訊 ──
    const IMG_SRC = 'images/中國古地圖.png';
    const IMG_W = 1932;
    const IMG_H = 1392;
    // 畫布底色＝底圖邊緣的陸地灰（實際取樣底圖上緣像素），拖曳或縮小到底圖之外時不突兀；
    // ⚠️ 換成手繪底圖時記得一併改成新底圖的邊緣色
    const MAP_BG = 'hsla(0, 58%, 24%, 1.00)';

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
    const MAX_ZOOM = 16;
    // 開啟分頁時自動對焦地標分布，最多放大到這個倍率（避免點位很少時放得太大）
    const FIT_MAX_ZOOM = 2;

    // ── 點擊地標的容錯半徑（螢幕像素，換算成世界座標時需除以 zoom）──
    const HIT_RADIUS_SCREEN = 14;

    // ── 浮動面板（彈窗／播放列）與提示列之間的間距 ──
    const PANEL_GAP = 12;

    // ========================================================
    // ⚠️ 校準除錯用測試點（2026-09 暫時新增，校準確認無誤後可整段移除）
    //   網址加上 &debug=1（即 index.html?page=map&debug=1）即會在地圖上疊加
    //   這些藍色菱形＋常駐地名標籤，方便直接對照 Gaode 地圖檢查座標準不準。
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

    // 放大到這個倍率（含）以上時：一詩名山河的地標旁常駐顯示「詩詞寫作時當代地名」；
    // 詩人故鄉的綠點旁由「詩人名字」擴充為「詩人名字 古地名（今日地名）」
    const LABEL_MIN_ZOOM = 1.25;

    // 詩句總評價（line_ratings 平均）：與 achievement.js 收藏排序用的計算方式完全一致，
    // 確保「詩詞評價相同時，比詩句總評價高低」在全站呈現一致的排序結果。
    function avgLineRating(p) {
        const lr = (p && p.line_ratings) || [];
        if (!lr.length) return 0;
        let s = 0;
        for (let i = 0; i < lr.length; i++) s += (lr[i] || 0);
        return s / lr.length;
    }

    // ── 分頁常駐提示文字（底部 .map-hint 依 activeTab 切換）──
    const HINT_TEXT = {
        explore: '拖曳平移・滾輪/雙指縮放・點選地標看詩',
        journey: '拖曳時間軸或按播放鍵看旅程・點選路線上的站點看詳情',
        hometown: '拖曳平移・滾輪/雙指縮放・點選綠點看該詩人的名人列傳',
    };

    // ========================================================
    // 詩人故鄉：綠點尺寸
    //   依詩人所有收錄詩詞的評價加總決定（開根號讓成長曲線平緩），
    //   但加總超過 AUTHOR_RATING_CAP 就不再變大——否則李白（214）、杜甫（112）
    //   會大到蓋住周圍一整片詩人，封頂後與王維（93）差不多大。
    // ========================================================
    const AUTHOR_RATING_CAP = 100;
    function authorDotRadius(sumRating) {
        return 5 + Math.sqrt(Math.min(sumRating, AUTHOR_RATING_CAP)) * 1.6;
    }

    // ========================================================
    // 詩人旅圖：年號換算
    // ========================================================
    // 每筆 {start, end, name, unit}：start~end（含）西元年區間對應的年號。
    // 一年之中改元的年份以整年近似，歸給「該年大部分時間所用」或「通行年譜慣用」的年號。
    // unit 預設「年」；天寶三載～至德二載（744~757）唐玄宗詔改「年」為「載」。
    // ⚠️ 新增其他時代的詩人（見 data/author_journeys.js）前，須先在這裡補上年號區間。
    const ERAS = [
        // ── 唐（李白、杜甫、白居易、柳宗元）──
        { start: 701, end: 704, name: '長安' },
        { start: 705, end: 706, name: '神龍' },
        { start: 707, end: 709, name: '景龍' },
        { start: 710, end: 711, name: '景雲' },
        { start: 712, end: 712, name: '先天' },
        { start: 713, end: 741, name: '開元' },
        { start: 742, end: 743, name: '天寶' },
        { start: 744, end: 755, name: '天寶', unit: '載', offset: 2 },
        { start: 756, end: 757, name: '至德', unit: '載' },
        { start: 758, end: 759, name: '乾元' },
        { start: 760, end: 761, name: '上元' },
        { start: 762, end: 762, name: '寶應' },
        { start: 763, end: 764, name: '廣德' },
        { start: 765, end: 765, name: '永泰' },
        { start: 766, end: 779, name: '大曆' },
        { start: 780, end: 783, name: '建中' },
        { start: 784, end: 784, name: '興元' },
        { start: 785, end: 804, name: '貞元' },
        { start: 805, end: 805, name: '永貞' },
        { start: 806, end: 820, name: '元和' },
        { start: 821, end: 824, name: '長慶' },
        { start: 825, end: 826, name: '寶曆' },
        { start: 827, end: 835, name: '大和' },
        { start: 836, end: 840, name: '開成' },
        { start: 841, end: 846, name: '會昌' },
        // ── 北宋（蘇軾）──
        { start: 1034, end: 1037, name: '景祐' },
        { start: 1038, end: 1039, name: '寶元' },
        { start: 1040, end: 1040, name: '康定' },
        { start: 1041, end: 1048, name: '慶曆' },
        { start: 1049, end: 1053, name: '皇祐' },
        { start: 1054, end: 1055, name: '至和' },
        { start: 1056, end: 1063, name: '嘉祐' },
        { start: 1064, end: 1067, name: '治平' },
        { start: 1068, end: 1077, name: '熙寧' },
        { start: 1078, end: 1085, name: '元豐' },
        { start: 1086, end: 1093, name: '元祐' },
        { start: 1094, end: 1097, name: '紹聖' },
        { start: 1098, end: 1100, name: '元符' },
        { start: 1101, end: 1101, name: '建中靖國' },
    ];

    // 阿拉伯數字（1~99）轉中文數字，供年號標示用（例如 18 → "十八"）
    function cnNumeral(n) {
        const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        if (n < 10) return digits[n];
        if (n < 20) return '十' + (n % 10 ? digits[n % 10] : '');
        const tens = Math.floor(n / 10), ones = n % 10;
        return digits[tens] + '十' + (ones ? digits[ones] : '');
    }

    // 西元年（整數）→ "開元十八年" 這類年號標示；表格範圍外就回傳空字串
    // ⚠️ 每個年號的第一年依中文慣例稱「元年」（例如「天寶元年」），不是「天寶一年」。
    //    天寶拆成兩段（年／載），第二段以 offset 接續序數（744 年是天寶三載，不是天寶元載）。
    function eraLabel(y) {
        for (let i = 0; i < ERAS.length; i++) {
            const e = ERAS[i];
            if (y >= e.start && y <= e.end) {
                const n = y - e.start + 1 + (e.offset || 0);
                return e.name + (n === 1 ? '元' : cnNumeral(n)) + (e.unit || '年');
            }
        }
        return '';
    }

    // ========================================================
    // 詩人旅圖：播放節奏
    //   時間軸本身是「真實年代」，但播放時若照年代等速前進，停留二十幾年的出生地
    //   會播很久、兩站之間的移動卻一閃而過。所以播放改用「分段節奏」：
    //   每段停留依年數給一段播放時間（有上限），每段移動固定一段播放時間，
    //   箭頭在地圖上移動的過程才看得清楚。拖曳時間軸則仍是真實年代。
    // ========================================================
    const TICK_MS = 50;
    const STAY_MS_BASE = 400;
    const STAY_MS_PER_YEAR = 60;
    const STAY_MS_MAX = 1800;
    const TRAVEL_MS = 900;
    const TRAVEL_MS_SAME_PLACE = 250;

    // ========================================================
    // 開場動畫：開啟或切換分頁時，地標依序「彈出」
    //   一詩名山河／詩人故鄉：由評價最低的點依序到最高（陣列已依評價低→高排序）
    //   詩人旅圖：由起點依序到終點，路線跟著一段段延伸
    //   第 i 個項目在 i × 間隔 毫秒後開始出現，花 INTRO_FADE_MS 由小放大（略為回彈）＋淡入。
    //   間隔依項目數量自動縮放，讓整段動畫大約落在 INTRO_TOTAL_MS 內。
    //   計時同樣用 setInterval（理由見 _journeyPlay 上方註解）。
    // ========================================================
    const INTRO_TICK_MS = 30;
    const INTRO_FADE_MS = 320;
    const INTRO_TOTAL_MS = { explore: 1500, hometown: 1500, journey: 2400 };
    const INTRO_STEP_MAX_MS = { explore: 60, hometown: 60, journey: 180 };

    // 由小放大時略為超過原尺寸再回彈（easeOutBack）
    function easeOutBack(t) {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    const PoemMap = {
        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,
        dpr: 1,

        // ── 版面（由 _layout() 依標題列／提示列實際高度計算）──
        headerH: 50,
        hintH: 40,
        canvasH: STAGE_H - 90,

        // ── 底圖 ──
        mapImage: null,
        imageLoaded: false,

        // ── 相機（縮放/平移）──
        zoom: 1,
        panX: 0,
        panY: 0,

        // ── 一詩名山河：地標（buildMarkers() 依座標分群產生）──
        markers: [],
        selectedKey: null,

        // ── 詩人故鄉：綠點（buildAuthorMarkers() 產生）──
        authorMarkers: [],
        // 從詩人故鄉開啟名人列傳後，關閉名人列傳時要回到詩人故鄉
        _returnFromBioPending: false,
        _bioCloseHooked: false,

        // ── 詩人旅圖 ──
        journeyPoetKey: null,
        journeyYear: 0,
        journeyMs: 0,
        journeyPlaying: false,
        journeySelectedDotKey: null,
        _journeyTimerId: null,

        // ── 開場動畫（見 INTRO_* 常數）：_introStart 為 null 表示沒有在播 ──
        _introStart: null,
        _introStepMs: 0,
        _introTotalMs: 0,
        _introTimerId: null,
        _jStops: [],   // 目前詩人的站點（附 x/y 畫面座標）
        _jDots: [],    // 同座標合併後的站點圓點（一個地點可能造訪多次）
        _jTrack: [],   // 播放節奏分段（見 _buildJourneyTrack）
        _jTotalMs: 0,

        // ── 目前作用中的分頁：explore=一詩名山河／journey=詩人旅圖／hometown=詩人故鄉 ──
        activeTab: 'explore',
        // 各分頁離開時的相機 { zoom, panX, panY }（見 _switchTab），重新開啟詩路地圖時清空
        _tabCameras: {},

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
                // ⚠️ 第一次開啟時 CSS 還在下載，_layout() 量到的是未套樣式的標題列高度，
                //    畫布會錯位；等 CSS 載入完成再重新排版、對焦一次
                link.addEventListener('load', () => {
                    if (!this.active) return;
                    this._layout();
                    this._resetCamera();
                    this._render();
                });
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
                this.container = document.getElementById('map-container');
                this.canvas = document.getElementById('map-canvas');
                this.ctx = this.canvas.getContext('2d');
                this.bindEvents();
                this.buildMarkers();
                this.buildAuthorMarkers();
                this._setupJourneyUI();
                this._loadImage();
            }
        },

        // ========================================================
        // 版面：依標題列／提示列的「實際」高度擺放畫布
        //   ⚠️ 不寫死高度常數：之前標題列在 CSS 改成 50px，畫布仍從 60px 開始、
        //      高度也照舊，上方就露出一條 10px 空白。改成量測實際高度後，
        //      之後怎麼調整 CSS 畫布都會自動貼齊。必須在 overlay 顯示後呼叫
        //      （display:none 時 offsetHeight 為 0）。
        // ========================================================
        _layout: function () {
            const header = this.container.querySelector('.map-header');
            const hint = document.getElementById('map-hint');
            this.headerH = header ? header.offsetHeight : 50;
            this.hintH = hint ? hint.offsetHeight : 40;
            this.canvasH = STAGE_H - this.headerH - this.hintH;

            this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
            this.canvas.width = STAGE_W * this.dpr;
            this.canvas.height = this.canvasH * this.dpr;
            this.canvas.style.top = this.headerH + 'px';
            this.canvas.style.width = STAGE_W + 'px';
            this.canvas.style.height = this.canvasH + 'px';

            document.getElementById('map-journey-bar').style.bottom = (this.hintH + PANEL_GAP) + 'px';
            this._positionPopup();
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
                    <div class="map-tabs">
                        <div class="map-tab active" data-tab="explore">一詩名山河</div>
                        <div class="map-tab" data-tab="journey">詩人旅圖</div>
                        <div class="map-tab" data-tab="hometown">詩人故鄉</div>
                    </div>
                    <div id="map-close" class="map-close" aria-label="關閉">✕</div>
                </div>
                <canvas id="map-canvas" class="map-canvas"></canvas>
                <div id="map-hint" class="map-hint"></div>
                <div id="map-journey-bar" class="map-journey-bar hidden">
                    <div class="map-journey-row">
                        <select id="map-journey-poet" class="map-journey-poet-select"></select>
                        <div id="map-journey-playbtn" class="map-journey-playbtn" aria-label="播放/暫停">▶</div>
                        <input id="map-journey-slider" class="map-journey-slider" type="range" min="0" max="1" step="0.05" value="0">
                    </div>
                    <div class="map-journey-info">
                        <span id="map-journey-event" class="map-journey-event"></span><span id="map-journey-date" class="map-journey-date"></span>
                    </div>
                </div>
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
            const poemById = {};
            POEMS.forEach((p) => { poemById[p.id] = p; });

            const clusters = {};
            Object.keys(POEM_LOCATIONS).forEach((idStr) => {
                const poem = poemById[Number(idStr)];
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
                // 地標評價＝該地最高的詩詞評價，同分再比該地詩詞評價加總（詩多的地方較高）
                const rating = c.poems[0].rating;
                const ratingSum = c.poems.reduce((s, p) => s + p.rating, 0);
                return { key: key, x: px.x, y: px.y, modern: c.modern, oldPlace: c.oldPlace, poems: c.poems, hasReal: hasReal, rating: rating, ratingSum: ratingSum };
            })
                // 評價低→高排序：開場動畫依陣列順序出現（由評價最低依序到最高），
                // 繪製時評價高的地標也會疊在最上層
                .sort((a, b) => a.rating - b.rating || a.ratingSum - b.ratingSum);
        },

        // ========================================================
        // 資料：把 AUTHOR_HOMETOWNS 轉成「詩人故鄉」分頁用的地標
        //   多位詩人籍貫剛好落在同一座標時（例如都標「長安」），以小圓周稍微分散。
        // ========================================================
        buildAuthorMarkers: function () {
            if (typeof AUTHOR_HOMETOWNS === 'undefined' || typeof POEMS === 'undefined') {
                console.error('[PoemMap] 找不到 AUTHOR_HOMETOWNS 或 POEMS，請確認 data/author_hometowns.js 已在 index.html 中載入');
                this.authorMarkers = [];
                return;
            }
            const ratingSum = {};
            POEMS.forEach((p) => { ratingSum[p.author] = (ratingSum[p.author] || 0) + (p.rating || 0); });

            const seenAtKey = {};
            this.authorMarkers = Object.keys(AUTHOR_HOMETOWNS)
                .filter((name) => ratingSum[name]) // 只畫 POEMS 裡實際有收錄作品的詩人
                .map((name) => {
                    const h = AUTHOR_HOMETOWNS[name];
                    const px = geoToPixel(h.lat, h.lng);
                    const key = h.lat.toFixed(2) + '_' + h.lng.toFixed(2);
                    const idx = seenAtKey[key] || 0;
                    seenAtKey[key] = idx + 1;
                    // 同座標第 2 位以後的詩人，以小圓周錯開座標，避免圓點完全重疊
                    const jitterR = idx === 0 ? 0 : 16;
                    const angle = idx * 2.4;
                    return {
                        author: name,
                        x: px.x + Math.cos(angle) * jitterR,
                        y: px.y + Math.sin(angle) * jitterR,
                        r: authorDotRadius(ratingSum[name]),
                        sumRating: ratingSum[name],
                        // 綠點右側標籤：詩人名字＋古地名＋（今日地名），例如「李白 綿州昌隆（今四川省江油市）」
                        label: name + ' ' + h.place + '（今' + h.modern + '）',
                    };
                })
                // 評價加總低→高排序，讓知名詩人畫在最後（疊在最上層），
                // 縮小看整張地圖時，重疊區域優先看得到李白、杜甫這些詩人
                .sort((a, b) => a.sumRating - b.sumRating);
        },

        // ========================================================
        // 事件綁定
        // ========================================================
        bindEvents: function () {
            const cv = this.canvas;

            document.getElementById('map-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('map-popup-close').addEventListener('click', () => this._closePopup());

            // ── 分頁切換 ──
            this.container.querySelectorAll('.map-tab').forEach((el) => {
                el.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    this._switchTab(el.dataset.tab);
                });
            });

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
        // clientX/Y → 畫布邏輯座標（0..500, 0..canvasH），已抵銷 stage 的 CSS 縮放
        _canvasCoords: function (clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) / rect.width * STAGE_W,
                y: (clientY - rect.top) / rect.height * this.canvasH,
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
        // 相機自動對焦：讓一組地標（世界座標）剛好完整落在畫布可視範圍內並置中
        //   pad：四邊保留的螢幕像素（右邊通常要多留給地名標籤，詩人旅圖下方要讓開播放列）
        //   clamp：盡量讓底圖蓋滿畫布，不露出底圖外的空白（前提是不把地標推出畫面）
        // ========================================================
        _fitCamera: function (points, pad, clamp) {
            if (!points.length) return this._fitWholeMap();
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            points.forEach((p) => {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            });
            const availW = STAGE_W - pad.left - pad.right;
            const availH = this.canvasH - pad.top - pad.bottom;
            const zoom = Math.min(availW / Math.max(1, maxX - minX), availH / Math.max(1, maxY - minY));
            this.zoom = Math.max(MIN_ZOOM, Math.min(FIT_MAX_ZOOM, zoom));
            this.panX = pad.left + availW / 2 - ((minX + maxX) / 2) * this.zoom;
            this.panY = pad.top + availH / 2 - ((minY + maxY) / 2) * this.zoom;

            if (clamp) {
                const imgW = IMG_W * this.zoom, imgH = IMG_H * this.zoom;
                if (imgW >= STAGE_W) this.panX = Math.min(0, Math.max(STAGE_W - imgW, this.panX));
                if (imgH >= this.canvasH) {
                    this.panY = Math.min(0, Math.max(this.canvasH - imgH, this.panY));
                } else {
                    // 依寬度對焦後底圖比畫布矮：改成底圖貼齊畫布下緣，把多出來的空間留在最上方
                    // （底圖上緣整排都是陸地灰，與 MAP_BG 同色，看起來就像地圖延續，不會露出一條空白）；
                    // 前提是地標仍全部落在可視範圍內，否則維持置中
                    const bottomPanY = this.canvasH - imgH;
                    if (minY * this.zoom + bottomPanY >= pad.top && maxY * this.zoom + bottomPanY <= this.canvasH - pad.bottom) {
                        this.panY = bottomPanY;
                    }
                }
            }
        },

        // 整張底圖完整縮小顯示（debug 模式／沒有地標時）
        _fitWholeMap: function () {
            this.zoom = Math.min(STAGE_W / IMG_W, this.canvasH / IMG_H);
            this.panX = (STAGE_W - IMG_W * this.zoom) / 2;
            this.panY = (this.canvasH - IMG_H * this.zoom) / 2;
        },

        // 依目前分頁把相機對焦到該分頁的地標分布
        _resetCamera: function () {
            if (this.debugMode) return this._fitWholeMap();
            if (this.activeTab === 'hometown') {
                this._fitCamera(this.authorMarkers, { left: 30, right: 70, top: 30, bottom: 30 }, true);
            } else if (this.activeTab === 'journey') {
                const bar = document.getElementById('map-journey-bar');
                const barCover = (bar ? bar.offsetHeight : 90) + PANEL_GAP;
                this._fitCamera(this._jStops, { left: 30, right: 80, top: 30, bottom: barCover + 20 }, false);
            } else {
                this._fitCamera(this.markers, { left: 30, right: 30, top: 30, bottom: 30 }, true);
            }
        },

        // ========================================================
        // 點擊判定：依目前分頁分流到對應的處理方式
        // ========================================================
        _handleTap: function (sx, sy) {
            if (this.activeTab === 'hometown') return this._handleHometownTap(sx, sy);
            if (this.activeTab === 'journey') return this._handleJourneyTap(sx, sy);
            return this._handleExploreTap(sx, sy);
        },

        // 在 items 中找出點擊位置容錯半徑內最近的一個；radiusOf(item) 回傳該項的螢幕半徑
        _nearest: function (items, sx, sy, radiusOf) {
            const w = this._canvasToWorld(sx, sy);
            let best = null;
            let bestDist = Infinity;
            items.forEach((m) => {
                const hitR = Math.max(HIT_RADIUS_SCREEN, radiusOf ? radiusOf(m) : 0) / this.zoom;
                const d = Math.hypot(m.x - w.x, m.y - w.y);
                if (d <= hitR && d < bestDist) { best = m; bestDist = d; }
            });
            return best;
        },

        // 一詩名山河：點選地標 → 金黃色強調＋詩詞列表彈窗
        _handleExploreTap: function (sx, sy) {
            const best = this._nearest(this.markers, sx, sy);
            this.selectedKey = best ? best.key : null;
            this._render();
            if (best) this._openPopup(best);
            else this._closePopup();
        },

        // 詩人故鄉：點選綠點 → 直接開啟名人列傳（不經過彈窗）
        _handleHometownTap: function (sx, sy) {
            const best = this._nearest(this.authorMarkers, sx, sy, (m) => m.r);
            if (best) this._openAuthorBio(best.author);
        },

        // 詩人旅圖：點選路線上的站點 → 列出在此地的每一次停留
        _handleJourneyTap: function (sx, sy) {
            const dot = this._nearest(this._jDots, sx, sy);
            if (!dot) return;
            this._journeyPause();
            this.journeySelectedDotKey = dot.key;
            // 時間軸跳到「離目前時間最近」的那一次造訪
            const visit = dot.visits.reduce((a, b) =>
                Math.abs(this._jStops[b].from - this.journeyYear) < Math.abs(this._jStops[a].from - this.journeyYear) ? b : a);
            this._journeySetYear(this._jStops[visit].from);
            this._openJourneyPopup(dot);
        },

        // ========================================================
        // 開啟既有的「名人列傳」並自動選取該詩人（見 author_bio.js）
        //   ⚠️ 兩者 z-index 同層級（2100），名人列傳不會自動疊在上層，所以比照
        //      poem_dialog.js 的做法先把自己藏起來再開。
        //   ⚠️ 關閉名人列傳時要回到詩人故鄉：只攔截名人列傳「✕ 關閉鈕」的點擊，
        //      不監看它被隱藏——menu.js 切換頁面時也會隱藏名人列傳，那時不該跳回地圖。
        //      切換頁面會先呼叫 stopGame()，清掉 _returnFromBioPending，雙重保險。
        // ========================================================
        _openAuthorBio: function (authorName) {
            if (!window.AuthorBio || !window.AuthorBio.showAndSelect) return;
            this._journeyPause();
            this.active = false;
            this.container.classList.add('hidden');
            this._returnFromBioPending = true;
            window.AuthorBio.showAndSelect(authorName);
            this._hookBioClose();
        },

        _hookBioClose: function () {
            if (this._bioCloseHooked) return;
            const btn = document.querySelector('#authorBioPage .page-close-btn');
            if (!btn) return;
            this._bioCloseHooked = true;
            btn.addEventListener('click', () => {
                if (!this._returnFromBioPending) return;
                this._returnFromBioPending = false;
                // 分頁、相機位置都保持原樣，玩家回到剛才看的那一塊地圖
                this.active = true;
                this.container.classList.remove('hidden');
                this._render();
            });
        },

        // ========================================================
        // 彈窗（三個分頁共用同一組 DOM，只替換內容）
        // ========================================================
        // 彈窗貼在提示列上方；詩人旅圖的播放列顯示中時，再往上讓開播放列
        _positionPopup: function () {
            const popup = document.getElementById('map-popup');
            const bar = document.getElementById('map-journey-bar');
            let bottom = this.hintH + PANEL_GAP;
            if (bar && !bar.classList.contains('hidden')) bottom += bar.offsetHeight + 10;
            popup.style.bottom = bottom + 'px';
        },

        _showPopup: function (title) {
            document.getElementById('map-popup-place').textContent = title;
            const listEl = document.getElementById('map-popup-list');
            listEl.innerHTML = '';
            document.getElementById('map-popup').classList.remove('hidden');
            this._positionPopup();
            return listEl;
        },

        // 一詩名山河：列出該地標所有相關詩詞（已依評價排序），點擊詩詞 → 開啟詩詞資料對話框
        _openPopup: function (marker) {
            // 標題：詩詞寫作時當代地名（或景點/建築物）＋現代地名，例如「長安（今陝西省西安市）」
            const listEl = this._showPopup(marker.oldPlace + '（今' + marker.modern + '）');
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
        },

        // 詩人旅圖：列出詩人在這個地點的每一次停留（事件、年齡年號、說明、當時寫下的詩）
        //   點停留那一列 → 時間軸跳到那次抵達；點詩名 → 開啟詩詞資料
        _openJourneyPopup: function (dot) {
            const listEl = this._showPopup(dot.place + '（今' + dot.modern + '）');
            const poemById = {};
            if (typeof POEMS !== 'undefined') POEMS.forEach((p) => { poemById[p.id] = p; });

            dot.visits.forEach((i) => {
                const s = this._jStops[i];
                const item = document.createElement('div');
                item.className = 'map-popup-item';
                item.dataset.stop = i;
                const stayYears = Math.floor(s.to) - Math.floor(s.from);
                const placeNote = s.place !== dot.place ? '【' + s.place + '】' : '';
                item.innerHTML =
                    '<div class="map-popup-item-title">' + s.event + '</div>' +
                    '<div class="map-popup-item-meta">' + this._journeyDateText(s.from) +
                    (stayYears >= 1 ? '，停留至西元' + Math.floor(s.to) + '年' : '') + '</div>' +
                    '<div class="map-popup-item-meta">' + placeNote + s.note + '</div>';
                (s.poemIds || []).forEach((id) => {
                    const poem = poemById[id];
                    if (!poem) return;
                    const row = document.createElement('div');
                    row.className = 'map-popup-poem';
                    row.textContent = '📖 ' + poem.title;
                    row.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (window.openPoemDialogById) window.openPoemDialogById(poem.id);
                    });
                    item.appendChild(row);
                });
                item.addEventListener('click', () => {
                    this._journeyPause();
                    this._journeySetYear(s.from);
                });
                listEl.appendChild(item);
            });
            this._highlightJourneyPopupVisit();
        },

        // 彈窗中標示目前時間點所在的那次停留
        _highlightJourneyPopupVisit: function () {
            const popup = document.getElementById('map-popup');
            if (popup.classList.contains('hidden') || this.journeySelectedDotKey === null) return;
            const state = this._journeyState(this.journeyYear);
            popup.querySelectorAll('.map-popup-item').forEach((el) => {
                el.classList.toggle('selected', Number(el.dataset.stop) === state.stayIdx);
            });
        },

        _closePopup: function () {
            const panel = document.getElementById('map-popup');
            if (panel) panel.classList.add('hidden');
            if (this.selectedKey !== null || this.journeySelectedDotKey !== null) {
                this.selectedKey = null;
                this.journeySelectedDotKey = null;
                this._render();
            }
        },

        // ========================================================
        // 分頁切換：三個分頁共用同一張畫布與相機系統，
        //   切換時只需同步分頁按鈕／提示文字／播放列，再把相機對焦到該分頁的地標。
        // ========================================================
        _applyTabUI: function (tab) {
            this.container.querySelectorAll('.map-tab').forEach((el) => {
                el.classList.toggle('active', el.dataset.tab === tab);
            });
            document.getElementById('map-hint').textContent = HINT_TEXT[tab] || '';
            document.getElementById('map-journey-bar').classList.toggle('hidden', tab !== 'journey');
        },

        // 切換分頁時，每個分頁各自記住離開時的縮放與位置，切回來時原樣還原；
        // 第一次進入該分頁（或重新開啟詩路地圖後）才自動對焦到該分頁的地標分布
        _switchTab: function (tab) {
            if (this.activeTab === tab) return;
            this._journeyPause();
            this._closePopup();
            this._tabCameras[this.activeTab] = { zoom: this.zoom, panX: this.panX, panY: this.panY };
            this.activeTab = tab;
            this._applyTabUI(tab);
            const cam = this._tabCameras[tab];
            if (cam) {
                this.zoom = cam.zoom;
                this.panX = cam.panX;
                this.panY = cam.panY;
            } else {
                this._resetCamera();
            }
            this._startIntro();
        },

        // ========================================================
        // 開場動畫（說明見 INTRO_* 常數）
        // ========================================================
        _introItemCount: function () {
            if (this.activeTab === 'hometown') return this.authorMarkers.length;
            if (this.activeTab === 'journey') return this._jStops.length;
            return this.markers.length;
        },

        _startIntro: function () {
            this._stopIntro();
            const tab = this.activeTab;
            const n = this._introItemCount();
            this._introStepMs = n > 1 ? Math.min(INTRO_STEP_MAX_MS[tab], (INTRO_TOTAL_MS[tab] - INTRO_FADE_MS) / (n - 1)) : 0;
            this._introTotalMs = this._introStepMs * Math.max(0, n - 1) + INTRO_FADE_MS;
            this._introStart = Date.now();
            this._introTimerId = setInterval(() => {
                if (Date.now() - this._introStart >= this._introTotalMs) this._stopIntro();
                this._render();
            }, INTRO_TICK_MS);
            this._render();
        },

        _stopIntro: function () {
            if (this._introTimerId) { clearInterval(this._introTimerId); this._introTimerId = null; }
            this._introStart = null;
        },

        // 第 order 個項目的出現進度 0（尚未出現）~ 1（完全出現）；沒有在播開場動畫時一律為 1
        _introProgress: function (order) {
            if (this._introStart === null) return 1;
            const t = (Date.now() - this._introStart - order * this._introStepMs) / INTRO_FADE_MS;
            return Math.max(0, Math.min(1, t));
        },

        // ========================================================
        // 繪製
        // ========================================================
        _render: function () {
            if (!this.ctx) return;
            const ctx = this.ctx;
            const dpr = this.dpr;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = MAP_BG;
            ctx.fillRect(0, 0, STAGE_W, this.canvasH);

            ctx.save();
            ctx.translate(this.panX, this.panY);
            ctx.scale(this.zoom, this.zoom);

            if (this.imageLoaded) {
                ctx.drawImage(this.mapImage, 0, 0, IMG_W, IMG_H);
            }

            // 第二個參數是開場動畫的出現順序（陣列已依評價低→高排序）
            if (this.activeTab === 'hometown') {
                this.authorMarkers.forEach((m, i) => this._drawAuthorMarker(m, i));
            } else if (this.activeTab === 'journey') {
                this._drawJourneyRoute();
            } else {
                this.markers.forEach((m, i) => this._drawMarker(m, i));
            }

            if (this.debugMode) {
                DEBUG_POINTS.forEach((p) => this._drawDebugPoint(p));
            }

            ctx.restore();
        },

        // 地名/人名標籤：畫在 (x, y) 右側、帶半透明底色；尺寸以螢幕像素指定（內部除以 zoom）
        _drawLabel: function (text, x, y, fontPx, bg, fg) {
            const ctx = this.ctx;
            const z = this.zoom;
            const fontSize = fontPx / z;
            ctx.font = 'bold ' + fontSize + 'px sans-serif';
            ctx.textBaseline = 'middle';
            const textW = ctx.measureText(text).width;
            ctx.fillStyle = bg;
            ctx.fillRect(x - 2 / z, y - fontSize / 2 - 2 / z, textW + 4 / z, fontSize + 4 / z);
            ctx.fillStyle = fg;
            ctx.fillText(text, x, y);
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
            this._drawLabel(p.name, px.x + 10 / this.zoom, px.y, 24, 'hsla(0, 0%, 100%, 0.85)', 'hsl(210, 90%, 30%)');
        },

        _drawMarker: function (m, order) {
            const p = this._introProgress(order);
            if (p <= 0) return;
            const ctx = this.ctx;
            ctx.save();
            ctx.globalAlpha = p;
            const isSelected = m.key === this.selectedKey;
            // 螢幕上視覺大小固定：世界座標半徑除以 zoom，畫出來的螢幕像素才不會隨縮放暴增
            // 尺寸依「這個地標有幾首詩」決定，用平方根讓成長曲線平緩（避免長安這種大站太過巨大）
            const r = (5 + Math.sqrt(m.poems.length) * 3.7) / this.zoom * easeOutBack(p);
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
                // 純延伸連結（如故鄉、借古諷今的典故地）→ 虛線空心圓，明確跟實景區分
                ctx.setLineDash([3 / this.zoom, 2.5 / this.zoom]);
                ctx.lineWidth = 2 / this.zoom;
                ctx.strokeStyle = 'hsl(0, 55%, 42%)';
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // 放大到 LABEL_MIN_ZOOM 以上時，常駐顯示「詩詞寫作時當代地名」
            if (this.zoom >= LABEL_MIN_ZOOM) {
                this._drawLabel(m.oldPlace, m.x + r + 4 / this.zoom, m.y, 24, 'hsla(40, 30%, 97%, 0.85)', 'hsl(0, 60%, 24%)');
            }
            ctx.restore();
        },

        // 詩人故鄉：綠點＋「詩人名字 古地名（今日地名）」（常駐顯示，擁擠區域可放大後自然散開）
        _drawAuthorMarker: function (m, order) {
            const p = this._introProgress(order);
            if (p <= 0) return;
            const ctx = this.ctx;
            ctx.save();
            ctx.globalAlpha = p;
            const r = m.r / this.zoom * easeOutBack(p);
            ctx.beginPath();
            ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
            ctx.fillStyle = 'hsl(140, 55%, 38%)';
            ctx.fill();
            ctx.lineWidth = 1.5 / this.zoom;
            ctx.strokeStyle = 'hsl(140, 60%, 96%)';
            ctx.stroke();
            // 縮放未達 LABEL_MIN_ZOOM 只顯示詩人名字；放大後才加上古地名＋（今日地名），避免畫面擁擠
            const text = this.zoom >= LABEL_MIN_ZOOM ? m.label : m.author;
            this._drawLabel(text, m.x + r + 4 / this.zoom, m.y, 24, 'hsla(140, 30%, 97%, 0.85)', 'hsl(140, 60%, 20%)');
            ctx.restore();
        },

        // ========================================================
        // 詩人旅圖：路線＋站點＋金黃箭頭
        //   整條路線先以淡色畫出，已走過的部分再以實線赭紅色覆蓋，看得出旅程進度；
        //   尚未抵達的站點畫成空心。
        // ========================================================
        _drawJourneyRoute: function () {
            const ctx = this.ctx;
            const stops = this._jStops;
            if (!stops.length) return;
            const z = this.zoom;
            const ROUTE = 'hsl(20, 55%, 38%)';
            const state = this._journeyState(this.journeyYear);

            const intro = this._introStart !== null;

            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            // 全程路線（淡）；開場動畫期間由起點一段段延伸：第 i 段隨第 i 站的出現進度長出來
            ctx.beginPath();
            ctx.moveTo(stops[0].x, stops[0].y);
            for (let i = 1; i < stops.length; i++) {
                const p = this._introProgress(i);
                if (p <= 0) break;
                const a = stops[i - 1], b = stops[i];
                ctx.lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);
                if (p < 1) break;
            }
            ctx.strokeStyle = 'hsla(20, 55%, 38%, 0.3)';
            ctx.lineWidth = 3 / z;
            ctx.stroke();

            // 已走過的路線（實）：所有已抵達的站點，再接到箭頭目前位置（開場動畫結束後才畫）
            if (!intro) {
                ctx.beginPath();
                ctx.moveTo(stops[0].x, stops[0].y);
                for (let i = 1; i < stops.length && stops[i].from <= this.journeyYear; i++) ctx.lineTo(stops[i].x, stops[i].y);
                ctx.lineTo(state.x, state.y);
                ctx.strokeStyle = ROUTE;
                ctx.lineWidth = 3 / z;
                ctx.stroke();
            }

            // 站點圓點＋地名（同一地點多次造訪只畫一次，隨「第一次造訪」的順序出現）
            this._jDots.forEach((d) => {
                const p = this._introProgress(d.visits[0]);
                if (p <= 0) return;
                ctx.save();
                ctx.globalAlpha = p;
                const visited = stops[d.visits[0]].from <= this.journeyYear;
                const isSelected = d.key === this.journeySelectedDotKey;
                const r = (isSelected ? 7 : 5) / z * easeOutBack(p);
                ctx.beginPath();
                ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? 'hsl(45, 90%, 50%)' : (visited ? ROUTE : 'hsl(40, 55%, 96%)');
                ctx.fill();
                ctx.lineWidth = 1.5 / z;
                ctx.strokeStyle = visited || isSelected ? 'hsl(40, 55%, 96%)' : ROUTE;
                ctx.stroke();
                this._drawLabel(d.place, d.x + r + 3 / z, d.y, 24,
                    'hsla(30, 30%, 97%, 0.85)', visited ? 'hsl(20, 60%, 26%)' : 'hsla(20, 40%, 30%, 0.6)');
                ctx.restore();
            });

            // 金黃箭頭（開場動畫結束、路線全部出現後才顯示）
            if (intro) return;
            const arrowLen = 10 / z;
            ctx.save();
            ctx.translate(state.x, state.y);
            ctx.rotate(state.angle);
            ctx.beginPath();
            ctx.moveTo(arrowLen, 0);
            ctx.lineTo(-arrowLen * 0.6, arrowLen * 0.65);
            ctx.lineTo(-arrowLen * 0.6, -arrowLen * 0.65);
            ctx.closePath();
            ctx.fillStyle = 'hsl(45, 90%, 50%)';
            ctx.fill();
            ctx.lineWidth = 1.5 / z;
            ctx.strokeStyle = 'hsl(0, 62%, 30%)';
            ctx.stroke();
            ctx.restore();
        },

        // ========================================================
        // 詩人旅圖：資料準備
        // ========================================================
        _journeyData: function () {
            if (typeof AUTHOR_JOURNEYS === 'undefined') return null;
            return AUTHOR_JOURNEYS[this.journeyPoetKey] || null;
        },

        // 站點換算畫面座標、同座標站點合併成一個圓點、建立播放節奏分段
        _prepareJourney: function () {
            const j = this._journeyData();
            const wps = (j && j.waypoints) || [];
            this._jStops = wps.map((w) => {
                const px = geoToPixel(w.lat, w.lng);
                return Object.assign({}, w, { x: px.x, y: px.y });
            });

            const dotByKey = {};
            this._jDots = [];
            this._jStops.forEach((s, i) => {
                const key = s.lat.toFixed(2) + '_' + s.lng.toFixed(2);
                if (!dotByKey[key]) {
                    dotByKey[key] = { key: key, x: s.x, y: s.y, place: s.place, modern: s.modern, visits: [] };
                    this._jDots.push(dotByKey[key]);
                }
                dotByKey[key].visits.push(i);
            });

            this._buildJourneyTrack();
        },

        // 播放節奏分段：[{ y0, y1, ms0, ms1 }]，停留段與移動段交錯（說明見 TICK_MS 上方）
        _buildJourneyTrack: function () {
            const stops = this._jStops;
            const track = [];
            let ms = 0;
            stops.forEach((s, i) => {
                const stayMs = Math.min(STAY_MS_MAX, STAY_MS_BASE + STAY_MS_PER_YEAR * (s.to - s.from));
                track.push({ y0: s.from, y1: s.to, ms0: ms, ms1: ms + stayMs });
                ms += stayMs;
                const next = stops[i + 1];
                if (next) {
                    const travelMs = Math.hypot(next.x - s.x, next.y - s.y) < 1 ? TRAVEL_MS_SAME_PLACE : TRAVEL_MS;
                    track.push({ y0: s.to, y1: next.from, ms0: ms, ms1: ms + travelMs });
                    ms += travelMs;
                }
            });
            this._jTrack = track;
            this._jTotalMs = ms;
        },

        _yearToMs: function (year) {
            const t = this._jTrack;
            for (let i = 0; i < t.length; i++) {
                const g = t[i];
                if (year <= g.y1) {
                    if (year <= g.y0 || g.y1 === g.y0) return g.ms0;
                    return g.ms0 + (year - g.y0) / (g.y1 - g.y0) * (g.ms1 - g.ms0);
                }
            }
            return this._jTotalMs;
        },

        _msToYear: function (ms) {
            const t = this._jTrack;
            for (let i = 0; i < t.length; i++) {
                const g = t[i];
                if (ms <= g.ms1) {
                    if (g.ms1 === g.ms0) return g.y1;
                    return g.y0 + (ms - g.ms0) / (g.ms1 - g.ms0) * (g.y1 - g.y0);
                }
            }
            return t.length ? t[t.length - 1].y1 : 0;
        },

        // 某個時間點詩人在哪：停留中 → 該站；移動中 → 兩站之間內插
        // 回傳 { x, y, angle, stayIdx（停留中的站點索引，移動中為 -1）, nextIdx（移動中的下一站） }
        _journeyState: function (year) {
            const stops = this._jStops;
            if (!stops.length) return { x: 0, y: 0, angle: 0, stayIdx: -1, nextIdx: -1 };
            for (let i = 0; i < stops.length; i++) {
                const s = stops[i];
                if (year <= s.to) {
                    return { x: s.x, y: s.y, angle: this._journeyAngleInto(i), stayIdx: i, nextIdx: -1 };
                }
                const next = stops[i + 1];
                if (next && year < next.from) {
                    const t = (year - s.to) / (next.from - s.to);
                    const moving = Math.hypot(next.x - s.x, next.y - s.y) >= 1;
                    return {
                        x: s.x + (next.x - s.x) * t,
                        y: s.y + (next.y - s.y) * t,
                        angle: moving ? Math.atan2(next.y - s.y, next.x - s.x) : this._journeyAngleInto(i),
                        stayIdx: -1,
                        nextIdx: i + 1,
                    };
                }
            }
            const last = stops.length - 1;
            return { x: stops[last].x, y: stops[last].y, angle: this._journeyAngleInto(last), stayIdx: last, nextIdx: -1 };
        },

        // 停留時箭頭朝向「抵達這一站時的行進方向」；同地點連續兩站（例如柳宗元兩段長安）
        // 往前找最近一次真正移動；出生地則朝向第一段旅程
        _journeyAngleInto: function (i) {
            const stops = this._jStops;
            for (let k = i; k > 0; k--) {
                const a = stops[k - 1], b = stops[k];
                if (Math.hypot(b.x - a.x, b.y - a.y) >= 1) return Math.atan2(b.y - a.y, b.x - a.x);
            }
            for (let k = 0; k < stops.length - 1; k++) {
                const a = stops[k], b = stops[k + 1];
                if (Math.hypot(b.x - a.x, b.y - a.y) >= 1) return Math.atan2(b.y - a.y, b.x - a.x);
            }
            return 0;
        },

        // 「25歲　開元十三年（西元725年）」：年齡採虛歲（西元年 − 出生年 ＋ 1），與傳統「享年」一致
        _journeyDateText: function (year) {
            const j = this._journeyData();
            const y = Math.floor(year + 1e-6);
            const age = j ? (y - j.born + 1) + '歲　' : '';
            return age + eraLabel(y) + '（西元' + y + '年）';
        },

        // ========================================================
        // 詩人旅圖：播放控制列（詩人選單、播放/暫停鍵、時間軸）
        // ========================================================
        _setupJourneyUI: function () {
            if (typeof AUTHOR_JOURNEYS === 'undefined') return;
            const selectEl = document.getElementById('map-journey-poet');
            const playBtn = document.getElementById('map-journey-playbtn');
            const slider = document.getElementById('map-journey-slider');

            Object.keys(AUTHOR_JOURNEYS).forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                selectEl.appendChild(opt);
            });
            selectEl.addEventListener('change', () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this._journeySetPoet(selectEl.value);
                this._resetCamera();
                this._startIntro();
            });

            playBtn.addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this._journeyToggle();
            });

            slider.addEventListener('input', () => {
                this._journeyPause();
                this._journeySetYear(Number(slider.value));
            });

            this._journeySetPoet(Object.keys(AUTHOR_JOURNEYS)[0]);
        },

        // 切換詩人：重建站點資料、重設時間軸範圍、回到出生那一年
        _journeySetPoet: function (name) {
            this._journeyPause();
            this._closePopup();
            this.journeyPoetKey = name;
            this._prepareJourney();
            const stops = this._jStops;
            const slider = document.getElementById('map-journey-slider');
            if (slider && stops.length) {
                slider.min = stops[0].from;
                slider.max = stops[stops.length - 1].to;
            }
            this._journeySetYear(stops.length ? stops[0].from : 0);
        },

        // 依真實年代設定時間點（拖曳時間軸、點選站點時使用）
        _journeySetYear: function (year) {
            const stops = this._jStops;
            if (stops.length) year = Math.max(stops[0].from, Math.min(stops[stops.length - 1].to, year));
            this._journeyApply(year, this._yearToMs(year));
        },

        // 同步時間軸、事件與年齡年號文字、彈窗標示，並重繪
        _journeyApply: function (year, ms) {
            this.journeyYear = year;
            this.journeyMs = ms;
            const slider = document.getElementById('map-journey-slider');
            if (slider) slider.value = year;

            const state = this._journeyState(year);
            const eventEl = document.getElementById('map-journey-event');
            const dateEl = document.getElementById('map-journey-date');
            if (eventEl && this._jStops.length) {
                eventEl.textContent = state.stayIdx >= 0
                    ? this._jStops[state.stayIdx].event
                    : '前往' + this._jStops[state.nextIdx].place;
            }
            if (dateEl && this._jStops.length) dateEl.textContent = this._journeyDateText(year);

            this._highlightJourneyPopupVisit();
            if (this.activeTab === 'journey') this._render();
        },

        _journeyToggle: function () {
            if (this.journeyPlaying) this._journeyPause(); else this._journeyPlay();
        },

        // ⚠️ 播放動畫刻意用 setInterval 而非 requestAnimationFrame：
        //   rAF 綁在瀏覽器的畫面合成時機上，分頁被判定為非使用中畫面時（或某些
        //   自動化測試/預覽環境）可能完全不觸發，播放鍵會看似沒反應。
        _journeyPlay: function () {
            if (!this._jStops.length || this.journeyPlaying) return;
            // 播放到終點後再按播放 → 從頭開始
            if (this.journeyMs >= this._jTotalMs) this._journeySetYear(this._jStops[0].from);
            this.journeyPlaying = true;
            document.getElementById('map-journey-playbtn').textContent = '❚❚';
            this._journeyTimerId = setInterval(() => {
                const ms = Math.min(this._jTotalMs, this.journeyMs + TICK_MS);
                this._journeyApply(this._msToYear(ms), ms);
                if (ms >= this._jTotalMs) this._journeyPause();
            }, TICK_MS);
        },

        _journeyPause: function () {
            this.journeyPlaying = false;
            if (this._journeyTimerId) { clearInterval(this._journeyTimerId); this._journeyTimerId = null; }
            const playBtn = document.getElementById('map-journey-playbtn');
            if (playBtn) playBtn.textContent = '▶';
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this._returnFromBioPending = false;
            this.container.classList.remove('hidden');
            this._journeyPause();
            this._closePopup();

            // 每次重新開啟一律回到「一詩名山河」分頁，相機對焦到紅點分布；
            // 各分頁記住的相機位置也一併清空，其他分頁第一次切入時重新自動對焦
            this.activeTab = 'explore';
            this._tabCameras = {};
            this._applyTabUI('explore');
            this._layout();
            this._resetCamera();
            this._startIntro();
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
            this._returnFromBioPending = false;
            this._journeyPause();
            this._stopIntro();
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
