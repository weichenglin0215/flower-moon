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
    var MAX_PARTICLES = 1000;        // 粒子池上限（手機安全值）
    var MAX_DPR = 1.5;              // canvas 解析度倍率上限
    var SPAWN_SPACING = 3;          // 拖曳時每移動多少 px 生成一顆粒子
    var SPAWN_PER_EVENT = 20;        // 單次 move 事件最多生成顆數（防止快速滑動爆量）
    var GRAVITY = 24;               // 每秒往下的重力加速度（px/s^2）
    var MAX_FALL_SPEED = 80;        // 下落終端速度（px/s），維持「慢慢散落」
    var DRAG = 0.2;                // 每秒速度阻尼（模擬水的黏滯感）
    var SWAY_AMP_MIN = 3;           // 水波紋左右擺動振幅下限（px/s）
    var SWAY_AMP_MAX = 6;          // 擺動振幅上限
    var STIR_RADIUS = 90;          // 手指攪動影響半徑（px）
    var STIR_PUSH = 0.2;           // 手指移動速度傳遞給粒子的比例（推力）
    var STIR_SWIRL = 9;            // 繞著手指旋轉的切線力道（px/s^2）
    var LIFE_MIN = 2.2;             // 粒子壽命下限（秒）
    var LIFE_MAX = 4.5;             // 粒子壽命上限（秒）
    var SIZE_MIN = 1.0;             // 粒子半徑下限（px）
    var SIZE_MAX = 3.0;               // 粒子半徑上限（px）
    var COLOR_SAMPLE_MS = 60;       // 顏色取樣節流間隔（毫秒）

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
            amp: 0                  // 擺動振幅
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

    // ====== 畫面顏色取樣 ======
    // 從觸控點下方的 DOM 元素取得顏色：優先找有實色背景的元素，
    // 偶爾改取文字顏色增加多彩感（像沾到不同顏料）。
    var colorRegex = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[,/ ]+([\d.]+))?\)/;

    function parseColor(str) {
        var m = colorRegex.exec(str);
        if (!m) return null;
        var a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a < 0.1) return null; // 幾乎全透明視為無色
        return { r: +m[1], g: +m[2], b: +m[3] };
    }

    function sampleColorAt(x, y) {
        var el = document.elementFromPoint(x, y);
        var depth = 0;
        while (el && el !== document.documentElement && depth < 8) {
            var cs = getComputedStyle(el);
            // 約 1/3 機率取文字色，讓筆觸更繽紛（僅在該元素文字色可解析時）
            if (Math.random() < 0.33) {
                var tc = parseColor(cs.color);
                if (tc) return tc;
            }
            var bg = parseColor(cs.backgroundColor);
            if (bg) return bg;
            el = el.parentElement;
            depth++;
        }
        // 找不到實色時，退回宣紙底色（--fm 主題的米白）
        return { r: 232, g: 222, b: 200 };
    }

    // ====== 粒子生成 ======
    function spawnParticle(x, y, baseColor, pvx, pvy) {
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
        // 顏色帶少量明暗抖動，避免同色粒子過於死板
        //var jitR = (Math.random() - 0.5) * 64;
        //var jitG = (Math.random() - 0.5) * 64;
        //var jitB = (Math.random() - 0.5) * 64;
        //p.r = Math.max(0, Math.min(255, baseColor.r + jitR));
        //p.g = Math.max(0, Math.min(255, baseColor.g + jitG));
        //p.b = Math.max(0, Math.min(255, baseColor.b + jitB));
        var jitR = (Math.random()) * 255;
        var jitG = (Math.random()) * 255;
        var jitB = (Math.random()) * 255;
        p.r = jitR;
        p.g = jitG;
        p.b = jitB;
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
            color: sampleColorAt(e.clientX, e.clientY)
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
            pt.color = sampleColorAt(e.clientX, e.clientY);
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

            // 掉出畫面底部即回收
            if (p.y - p.size > window.innerHeight) { p.alive = false; aliveCount--; continue; }

            // --- 繪製：淡出 + 輕微縮小，模擬顏料在水中化開 ---
            var alpha = 1.0; //lifeRatio * 0.65;
            var size = p.size * (0.6 + 0.4 * lifeRatio) * dpr;
            ctx.beginPath();
            ctx.arc(p.x * dpr, p.y * dpr, size, 0, 6.2832);
            ctx.fillStyle = 'rgba(' + (p.r | 0) + ',' + (p.g | 0) + ',' + (p.b | 0) + ',' + alpha.toFixed(3) + ')';
            ctx.fill();
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
