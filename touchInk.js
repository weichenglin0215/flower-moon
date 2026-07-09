/**
 * touchInk.js — 觸控水彩粒子特效（獨立模組）
 *
 * 功能說明：
 *   玩家手指（或滑鼠）接觸/拖曳畫面時，依「接觸點下方的畫面顏色」生成
 *   大量會緩緩往下飄落的粒子。粒子帶有類似水波紋的正弦擺動拖尾律動，
 *   且尚在畫面上的粒子會被「拖曳中的手指」持續攪動（類似水彩筆在水中攪動）。
 *
 * 設計原則（手機效能優先）：
 *   1. 覆蓋層 canvas 設 pointer-events:none，完全不干擾底下任何遊戲操作。
 *   2. 粒子使用固定大小的物件池（MAX_PARTICLES），零 GC 壓力。
 *   3. 沒有任何存活粒子時，requestAnimationFrame 完全停止（不耗電）。
 *   4. canvas 解析度上限 devicePixelRatio 1.5，避免高 DPR 手機過度繪製。
 *   5. 顏色取樣（elementFromPoint + getComputedStyle）以節流方式進行，
 *      避免每次 pointermove 都觸發樣式計算。
 *   6. 頁面切到背景（visibilitychange）時立即暫停。
 *
 * 使用方式：
 *   由 index.html 載入後自動啟用。可呼叫 TouchInk.disable() / enable() 開關。
 */
(function () {
    'use strict';

    // ====== 可調參數（集中管理，方便調校效能與手感） ======
    var MAX_PARTICLES = 600;        // 粒子池上限（手機安全值）
    var MAX_DPR = 1.5;              // canvas 解析度倍率上限
    var SPAWN_SPACING = 3;          // 拖曳時每移動多少 px 生成一顆粒子
    var SPAWN_PER_EVENT = 1;        // 單次 move 事件最多生成顆數（防止快速滑動爆量）
    var GRAVITY = 36;               // 每秒往下的重力加速度（px/s^2）
    var MAX_FALL_SPEED = 120;        // 下落終端速度（px/s），維持「慢慢散落」
    var DRAG = 0.2;                // 每秒速度阻尼（模擬水的黏滯感）
    var SWAY_AMP_MIN = 3;           // 水波紋左右擺動振幅下限（px/s）
    var SWAY_AMP_MAX = 6;          // 擺動振幅上限
    var STIR_RADIUS = 90;          // 手指攪動影響半徑（px）
    var STIR_PUSH = 0.2;           // 手指移動速度傳遞給粒子的比例（推力）
    var STIR_SWIRL = 9;            // 繞著手指旋轉的切線力道（px/s^2）
    var LIFE_MIN = 1.0;             // 粒子壽命下限（秒）
    var LIFE_MAX = 3.0;             // 粒子壽命上限（秒）
    var SIZE_MIN = 1.0;             // 粒子半徑下限（px）
    var SIZE_MAX = 3.0;               // 粒子半徑上限（px）
    var COLOR_SAMPLE_MS = 500;      // 畫面顏色取樣節流間隔（毫秒），半秒一次即可
    var COLOR_JITTER = 0.8;        // 取樣色的隨機變化幅度（±30%）
    var LINE_RATIO = 0.4;           // 每顆粒子有 40% 機率生成為線條型（否則為圓點）
    var LINE_LENGTH_SCALE = 6;      // 線條長度 = 粒子單影格移動距離的倍數

    // ====== 模組狀態 ======
    var canvas = null;              // 覆蓋層 canvas
    var ctx = null;                 // 2D 繪圖 context
    var dpr = 1;                    // 實際使用的解析度倍率
    var running = false;            // rAF 迴圈是否運轉中
    var enabled = true;             // 模組總開關
    var lastTime = 0;               // 上一影格時間戳
    var aliveCount = 0;             // 目前存活粒子數

    // 粒子物件池：預先建立固定數量，重複利用，避免執行期配置記憶體
    var pool = [];
    for (var i = 0; i < MAX_PARTICLES; i++) {
        pool.push({
            alive: false,
            x: 0, y: 0,             // 位置
            vx: 0, vy: 0,           // 速度
            size: 0,                // 半徑
            life: 0, maxLife: 0,    // 剩餘壽命 / 總壽命
            r: 0, g: 0, b: 0,       // 顏色（RGB）
            phase: 0,               // 正弦擺動相位（水波紋律動）
            freq: 0,                // 擺動頻率
            amp: 0,                 // 擺動振幅
            isLine: false           // 是否為「線條型」粒子（沿拖尾方向畫直線）
        });
    }
    var recycleCursor = 0;          // 池滿時循環回收最舊粒子的游標

    // 進行中的觸點（支援多指）：pointerId -> {x, y, vx, vy, lastX, lastY, lastT, spawnAcc, color}
    var pointers = {};
    var pointerCount = 0;

    // ====== 建立覆蓋層 canvas ======
    function createCanvas() {
        canvas = document.createElement('canvas');
        canvas.id = 'touch-ink-canvas';
        // 全螢幕固定覆蓋、不攔截任何觸控事件、置於最上層
        canvas.style.cssText =
            'position:fixed;left:0;top:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:99999;';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resize();
    }

    // 視窗尺寸變更時重設 canvas 解析度
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
    }

    // ====== 畫面顏色取樣（實際顯示像素） ======
    // 目標：取得「螢幕上實際顯示」的顏色（含圖片內容），而非物件/文字的樣式色。
    // 瀏覽器無法直接讀取整頁合成後的像素，因此依觸控點下方的元素類型分別處理：
    //   1. <img>     → 依顯示縮放比例映射回原圖座標，讀取該像素
    //   2. <canvas>  → 直接 getImageData 讀取該像素
    //   3. CSS 背景圖 → 載入圖檔（快取），依 background-size 映射後讀取該像素
    //   4. 以上皆無  → 沿祖先鏈找第一個實色 background-color（最終退路）
    // 取樣頻率僅每 COLOR_SAMPLE_MS（500ms）一次，效能負擔極低。
    var colorRegex = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/;
    var urlRegex = /url\(["']?([^"')]+)["']?\)/;

    // 共用 1×1 離屏 canvas：把目標像素畫進來再讀出，避免每次配置記憶體
    var pixelCanvas = document.createElement('canvas');
    pixelCanvas.width = pixelCanvas.height = 1;
    var pixelCtx = pixelCanvas.getContext('2d', { willReadFrequently: true });

    // 背景圖片快取：url -> HTMLImageElement（載入一次重複使用）
    var bgImageCache = {};

    function parseColor(str) {
        var m = colorRegex.exec(str);
        if (!m) return null;
        var a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a < 0.1) return null; // 幾乎全透明視為無色
        return { r: +m[1], g: +m[2], b: +m[3] };
    }

    // 從圖片來源（img 或 Image 物件）的指定原圖座標讀出一顆像素
    function readPixel(source, sx, sy) {
        try {
            pixelCtx.clearRect(0, 0, 1, 1);
            pixelCtx.drawImage(source, sx, sy, 1, 1, 0, 0, 1, 1);
            var d = pixelCtx.getImageData(0, 0, 1, 1).data;
            if (d[3] < 26) return null; // 透明像素視為無色
            return { r: d[0], g: d[1], b: d[2] };
        } catch (err) {
            return null; // 跨域圖片汙染 canvas 時放棄，走退路
        }
    }

    // 取樣 <img>：把螢幕座標映射回原圖座標
    function sampleImg(el, x, y) {
        var rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || !el.naturalWidth) return null;
        var sx = (x - rect.left) / rect.width * el.naturalWidth;
        var sy = (y - rect.top) / rect.height * el.naturalHeight;
        return readPixel(el, sx, sy);
    }

    // 取樣 <canvas>：注意 canvas 內部解析度可能與 CSS 顯示尺寸不同
    function sampleCanvas(el, x, y) {
        var rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || !el.width) return null;
        var sx = (x - rect.left) / rect.width * el.width;
        var sy = (y - rect.top) / rect.height * el.height;
        try {
            var c2d = el.getContext('2d');
            if (!c2d) return readPixel(el, sx, sy); // WebGL canvas 改走 drawImage
            var d = c2d.getImageData(sx | 0, sy | 0, 1, 1).data;
            if (d[3] < 26) return null;
            return { r: d[0], g: d[1], b: d[2] };
        } catch (err) {
            return null;
        }
    }

    // 取樣 CSS 背景圖：依 background-size（cover/contain/其他視為填滿）映射座標
    function sampleBgImage(el, cs, x, y) {
        var m = urlRegex.exec(cs.backgroundImage);
        if (!m) return null;
        var url = m[1];
        var img = bgImageCache[url];
        if (!img) {
            // 首次遇到：開始非同步載入並快取，本次先回 null 走退路
            img = new Image();
            img.src = url;
            bgImageCache[url] = img;
            return null;
        }
        if (!img.complete || !img.naturalWidth) return null;

        var rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return null;
        var rx = (x - rect.left) / rect.width;   // 元素內相對位置 0~1
        var ry = (y - rect.top) / rect.height;
        var size = cs.backgroundSize;
        var sx, sy;
        if (size === 'cover' || size === 'contain') {
            // cover：圖片等比放大填滿（超出部分裁切）；contain：等比縮小完整置入
            var scaleRatio = size === 'cover'
                ? Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight)
                : Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
            var drawW = img.naturalWidth * scaleRatio;
            var drawH = img.naturalHeight * scaleRatio;
            // 預設 background-position: center 置中
            sx = (rx * rect.width - (rect.width - drawW) / 2) / scaleRatio;
            sy = (ry * rect.height - (rect.height - drawH) / 2) / scaleRatio;
            if (sx < 0 || sy < 0 || sx >= img.naturalWidth || sy >= img.naturalHeight) return null;
        } else {
            // 其他情況（100% 100%、auto 等）近似為填滿整個元素
            sx = rx * img.naturalWidth;
            sy = ry * img.naturalHeight;
        }
        return readPixel(img, sx, sy);
    }

    function sampleColorAt(x, y) {
        // elementFromPoint 會自動略過 pointer-events:none 的特效 canvas 本身
        var el = document.elementFromPoint(x, y);
        var depth = 0;
        while (el && el !== document.documentElement && depth < 8) {
            var tag = el.tagName;
            // 1. 圖片元素：直接讀顯示中的像素
            if (tag === 'IMG') {
                var pc = sampleImg(el, x, y);
                if (pc) return pc;
            }
            // 2. canvas 元素（遊戲繪圖區）：直接讀像素
            if (tag === 'CANVAS') {
                var cc = sampleCanvas(el, x, y);
                if (cc) return cc;
            }
            var cs = getComputedStyle(el);
            // 3. CSS 背景圖：映射後讀圖檔像素
            if (cs.backgroundImage && cs.backgroundImage !== 'none') {
                var bc = sampleBgImage(el, cs, x, y);
                if (bc) return bc;
            }
            // 4. 實色背景：這就是該點實際顯示的顏色
            var bg = parseColor(cs.backgroundColor);
            if (bg) return bg;
            el = el.parentElement;
            depth++;
        }
        // 找不到任何顏色時，退回宣紙底色（--fm 主題的米白）
        return { r: 232, g: 222, b: 200 };
    }

    // ====== 粒子生成 ======
    function spawnParticle(x, y, baseColor, pvx, pvy, isLine) {
        var p;
        if (aliveCount < MAX_PARTICLES) {
            // 從池中找一顆未使用的
            do { p = pool[recycleCursor]; recycleCursor = (recycleCursor + 1) % MAX_PARTICLES; } while (p.alive);
            aliveCount++;
        } else {
            // 池滿：循環回收最舊的一顆
            p = pool[recycleCursor];
            recycleCursor = (recycleCursor + 1) % MAX_PARTICLES;
        }
        p.alive = true;
        // 出生位置帶少量抖動，形成筆觸暈開的感覺
        p.x = x + (Math.random() - 0.5) * 10;
        p.y = y + (Math.random() - 0.5) * 10;
        // 初速：繼承一部分手指移動速度 + 隨機噴散
        p.vx = pvx * 0.25 + (Math.random() - 0.5) * 30;
        p.vy = pvy * 0.25 + (Math.random() - 0.5) * 20;
        p.size = SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN);
        p.maxLife = LIFE_MIN + Math.random() * (LIFE_MAX - LIFE_MIN);
        p.life = p.maxLife;
        // 顏色 = 畫面取樣色 ± 30% 隨機變化（各通道獨立抖動）
        p.r = Math.max(0, Math.min(255, baseColor.r * (1 + (Math.random() - 0.5) * 2 * COLOR_JITTER)));
        p.g = Math.max(0, Math.min(255, baseColor.g * (1 + (Math.random() - 0.5) * 2 * COLOR_JITTER)));
        p.b = Math.max(0, Math.min(255, baseColor.b * (1 + (Math.random() - 0.5) * 2 * COLOR_JITTER)));
        // 型態：若呼叫端未指定則以 LINE_RATIO 機率決定為線條型
        p.isLine = (isLine === undefined) ? (Math.random() < LINE_RATIO) : !!isLine;
        // 水波紋擺動參數：各粒子相位/頻率/振幅皆不同，形成自然律動
        p.phase = Math.random() * Math.PI * 2;
        p.freq = 1.5 + Math.random() * 2.5;
        p.amp = SWAY_AMP_MIN + Math.random() * (SWAY_AMP_MAX - SWAY_AMP_MIN);
    }

    // ====== 觸控事件 ======
    function onPointerDown(e) {
        if (!enabled) return;
        pointers[e.pointerId] = {
            x: e.clientX, y: e.clientY,
            vx: 0, vy: 0,
            lastX: e.clientX, lastY: e.clientY,
            lastT: performance.now(),
            lastSample: 0,
            spawnAcc: 0,
            //color: sampleColorAt(e.clientX, e.clientY)
            color: { r: 160, g: 160, b: 160 }
        };
        pointerCount++;
        // 按下當下先噴一小撮
        for (var i = 0; i < 30; i++) spawnParticle(e.clientX, e.clientY, pointers[e.pointerId].color, (Math.random() - 0.5) * 1000.0, (Math.random() - 0.5) * 1000.0);
        startLoop();
    }

    function onPointerMove(e) {
        var pt = pointers[e.pointerId];
        if (!pt || !enabled) return;
        var now = performance.now();
        var dt = Math.max(1, now - pt.lastT);
        // 計算手指速度（px/s），供攪動力與粒子初速使用
        pt.vx = (e.clientX - pt.lastX) / dt * 1000;
        pt.vy = (e.clientY - pt.lastY) / dt * 1000;

        var dx = e.clientX - pt.lastX;
        var dy = e.clientY - pt.lastY;
        var dist = Math.sqrt(dx * dx + dy * dy);

        // 顏色取樣節流：滑動途中每 COLOR_SAMPLE_MS 才重新取一次色
        if (now - pt.lastSample > COLOR_SAMPLE_MS) {
            //pt.color = sampleColorAt(e.clientX, e.clientY);
            pt.lastSample = now;
        }

        // 依移動距離等間距生成粒子（形成連續筆觸），單次事件封頂
        pt.spawnAcc += dist;
        var n = 0;
        while (pt.spawnAcc >= SPAWN_SPACING && n < SPAWN_PER_EVENT) {
            pt.spawnAcc -= SPAWN_SPACING;
            var t = n / SPAWN_PER_EVENT; // 沿移動路徑內插，避免粒子成串斷點
            spawnParticle(pt.lastX + dx * t, pt.lastY + dy * t, pt.color, pt.vx, pt.vy);
            n++;
        }
        if (n === SPAWN_PER_EVENT) pt.spawnAcc = 0;

        pt.lastX = pt.x = e.clientX;
        pt.lastY = pt.y = e.clientY;
        pt.lastT = now;
        startLoop();
    }

    function onPointerUp(e) {
        if (pointers[e.pointerId]) {
            delete pointers[e.pointerId];
            pointerCount--;
        }
    }

    // ====== 主迴圈 ======
    function startLoop() {
        if (running || !enabled) return;
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(tick);
    }

    function tick(now) {
        if (!running) return;
        // dt 上限 50ms：切換分頁回來時避免物理暴衝
        var dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 預先整理進行中的觸點清單（攪動力來源）
        var ptList = [];
        for (var id in pointers) ptList.push(pointers[id]);

        // 連續時間阻尼：DRAG 為「每秒殘餘速度比例」
        var dragK = Math.exp(Math.log(DRAG) * dt);

        var survivors = 0;
        var time = now / 1000;

        for (var i = 0; i < MAX_PARTICLES; i++) {
            var p = pool[i];
            if (!p.alive) continue;

            p.life -= dt;
            if (p.life <= 0) { p.alive = false; aliveCount--; continue; }

            // --- 手指攪動影響：推力 + 繞指尖的漩渦切線力 ---
            for (var j = 0; j < ptList.length; j++) {
                var q = ptList[j];
                var ddx = p.x - q.x;
                var ddy = p.y - q.y;
                var d2 = ddx * ddx + ddy * ddy;
                if (d2 < STIR_RADIUS * STIR_RADIUS && d2 > 1) {
                    var d = Math.sqrt(d2);
                    var falloff = 1 - d / STIR_RADIUS; // 越靠近手指影響越強
                    // 1. 手指移動方向的推力（像攪動水流帶動顏料）
                    p.vx += q.vx * STIR_PUSH * falloff * dt * 8;
                    p.vy += q.vy * STIR_PUSH * falloff * dt * 8;
                    // 2. 繞著指尖旋轉的切線力（漩渦感）
                    p.vx += (-ddy / d) * STIR_SWIRL * falloff * dt;
                    p.vy += (ddx / d) * STIR_SWIRL * falloff * dt;
                }
            }

            // --- 水波紋律動：橫向正弦擺動（隨壽命衰減） ---
            var lifeRatio = p.life / p.maxLife;
            p.vx += Math.sin(time * p.freq + p.phase) * p.amp * dt * 3;

            // --- 重力（緩慢下落，設終端速度） ---
            p.vy += GRAVITY * dt;
            if (p.vy > MAX_FALL_SPEED) p.vy = MAX_FALL_SPEED;

            // --- 水的黏滯阻尼 ---
            p.vx *= dragK;
            p.vy = p.vy > 0 ? p.vy : p.vy * dragK; // 上拋速度也受阻尼

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            // 超出「介面舞台範圍」（邏輯 500×850，經 stageRect 換算為螢幕座標）
            // 任一邊界即回收；stageRect 尚未就緒時退回整個視窗範圍
            var sr = window.stageRect;
            var bL = sr ? sr.left : 0;
            var bT = sr ? sr.top : 0;
            var bR = sr ? sr.left + sr.width : window.innerWidth;
            var bB = sr ? sr.top + sr.height : window.innerHeight;
            var margin = p.size + 40; // 緩衝：避免線條尚有一截在範圍內就被刪
            if (p.y - margin > bB || p.y + margin < bT ||
                p.x - margin > bR || p.x + margin < bL) {
                p.alive = false; aliveCount--; continue;
            }

            // --- 繪製：淡出 + 輕微縮小，模擬顏料在水中化開 ---
            var alpha = 1.0; //lifeRatio * 0.65;
            var size = p.size * (0.6 + 0.4 * lifeRatio) * dpr;
            ctx.fillStyle = ctx.strokeStyle =
                'rgba(' + (p.r | 0) + ',' + (p.g | 0) + ',' + (p.b | 0) + ',' + alpha.toFixed(3) + ')';
            if (p.isLine) {
                // 線條型粒子：沿拖尾方向（速度反方向）畫直線，
                // 長度 = 本影格移動距離的三倍
                var mx = p.vx * dt * LINE_LENGTH_SCALE;
                var my = p.vy * dt * LINE_LENGTH_SCALE;
                ctx.beginPath();
                ctx.moveTo(p.x * dpr, p.y * dpr);
                ctx.lineTo((p.x - mx) * dpr, (p.y - my) * dpr);
                ctx.lineWidth = size;
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(p.x * dpr, p.y * dpr, size, 0, 6.2832);
                ctx.fill();
            }
            survivors++;
        }

        // 沒有存活粒子、也沒有手指按著 → 停止迴圈（省電關鍵）
        if (survivors === 0 && pointerCount === 0) {
            running = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }
        requestAnimationFrame(tick);
    }

    // ====== 生命週期 ======
    function init() {
        createCanvas();
        // passive:true → 不阻擋捲動與遊戲手勢，純旁觀監聽
        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointercancel', onPointerUp, { passive: true });
        window.addEventListener('resize', resize);
        // 頁面進背景：清空所有粒子並停止迴圈，避免背景耗電
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                for (var i = 0; i < MAX_PARTICLES; i++) pool[i].alive = false;
                aliveCount = 0;
                pointers = {};
                pointerCount = 0;
                running = false;
            }
        });
    }

    // ====== 對外介面 ======
    window.TouchInk = {
        /** 除錯用：回傳內部狀態（正式版可移除） */
        _debug: function () {
            var lineN = 0;
            for (var i = 0; i < MAX_PARTICLES; i++) if (pool[i].alive && pool[i].isLine) lineN++;
            return { aliveCount: aliveCount, lineCount: lineN, running: running, enabled: enabled, pointerCount: pointerCount };
        },
        /** 除錯用：直接測試指定螢幕座標的顏色取樣結果（正式版可移除） */
        _sample: function (x, y) { return sampleColorAt(x, y); },
        /** 啟用特效 */
        enable: function () { enabled = true; },
        /** 停用特效並立即清空畫面 */
        disable: function () {
            enabled = false;
            for (var i = 0; i < MAX_PARTICLES; i++) pool[i].alive = false;
            aliveCount = 0;
            pointers = {};
            pointerCount = 0;
            running = false;
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
