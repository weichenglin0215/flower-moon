/**
 * waterFlow.js — 游標水流特效（獨立模組，WebGL 流體模擬）
 *
 * 功能說明：
 *   參考 https://fish.bluecatbot.com/ 的水流效果：
 *   玩家手指（或滑鼠）在畫面上滑動時，於接觸點注入「染料 + 速度」，
 *   由 GPU 解算 Navier-Stokes 穩定流體（Stable Fluids），
 *   形成會被游標推動、迴旋、慢慢擴散消散的水流／墨暈。
 *
 * 技術架構（經典 GPU 流體管線）：
 *   1. 平流 (Advection)        — 速度場與染料場沿流線移動（半拉格朗日法）
 *   2. 散度 (Divergence)       — 計算速度場的散度
 *   3. 壓力求解 (Pressure)      — Jacobi 迭代解泊松方程
 *   4. 梯度修正 (Gradient Sub) — 減去壓力梯度使流場無散度（不可壓縮）
 *   5. 潑濺 (Splat)            — 游標移動時注入速度與顏色
 *   6. 顯示 (Display)          — 染料以透明度合成疊在頁面上
 *
 * 設計原則（手機效能優先）：
 *   1. 覆蓋層 canvas 設 pointer-events:none，完全不干擾底下任何遊戲操作。
 *   2. 模擬網格解析度極低（速度場 96、染料 384），手機 GPU 輕鬆負擔。
 *   3. 閒置（放開手指數秒、染料淡出）後 rAF 完全停止，不耗電。
 *   4. 頁面切到背景（visibilitychange）時立即暫停。
 *   5. 裝置不支援半浮點紋理渲染時，模組安靜停用，不影響遊戲。
 *
 * 使用方式：
 *   由 index.html 載入後自動啟用。可呼叫 WaterFlow.disable() / enable() 開關。
 *   若要與 touchInk.js 粒子特效擇一使用，可呼叫 TouchInk.disable()。
 */
(function () {
    'use strict';

    // ====== 可調參數（集中管理，方便調校效能與手感） ======
    var SIM_RES = 96;               // 速度/壓力場解析度（越低越省效能，96 已足夠流暢）
    var DYE_RES = 512;              // 染料場解析度（決定水流視覺細膩度）
    var PRESSURE_ITER = 14;         // 壓力 Jacobi 迭代次數（手機建議 10~20）
    var DENSITY_DISSIPATION = 2.6;  // 染料消散速度（每秒衰減率，越大消失越快）
    var VELOCITY_DISSIPATION = 0.3; // 速度消散速度（越小水流迴旋越持久）
    var SPLAT_RADIUS = 0.0018;      // 潑濺半徑（相對畫面比例）
    var SPLAT_FORCE = 2000;         // 游標速度轉換為流場推力的倍率
    var DYE_INTENSITY = 0.30;       // 每次潑濺注入的染料濃度
    var MAX_ALPHA = 0.75;           // 水流顯示透明度上限（確保底下介面永遠可讀）
    var IDLE_TIMEOUT_MS = 6000;     // 放開手指後多久停止模擬（染料已幾乎消散）
    var HUE_CYCLE_SPEED = 0.12;     // 顏色色相循環速度（圈/秒），多色水彩感

    // ====== 模組狀態 ======
    var canvas = null;
    var gl = null;
    var enabled = true;
    var running = false;
    var supported = false;          // WebGL 半浮點是否可用
    var lastTime = 0;
    var lastActive = 0;             // 最後一次觸控互動時間（閒置停機判斷用）
    var halfFloatType = 0;          // 半浮點紋理型別
    var formatRGBA = null;          // 紋理格式（internalFormat / format）
    var supportLinear = false;      // 半浮點紋理可否線性過濾

    // 進行中的觸點（支援多指）：pointerId -> 觸點資料
    var pointers = {};

    // ====== Shader 原始碼（GLSL ES 1.0，同時相容 WebGL1/2） ======
    var VERT = [
        'precision highp float;',
        'attribute vec2 aPosition;',
        'varying vec2 vUv;',
        'void main(){ vUv = aPosition * 0.5 + 0.5; gl_Position = vec4(aPosition, 0.0, 1.0); }'
    ].join('\n');

    // 平流：把來源場（速度或染料）沿速度場反向取樣搬運
    var FRAG_ADVECTION = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uVelocity;',
        'uniform sampler2D uSource;',
        'uniform vec2 texelSize;',
        'uniform float dt;',
        'uniform float dissipation;',
        'void main(){',
        '  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;',
        '  vec4 result = texture2D(uSource, coord);',
        '  float decay = 1.0 + dissipation * dt;',      // 隨時間衰減（消散）
        '  gl_FragColor = result / decay;',
        '}'
    ].join('\n');

    // 散度：中央差分計算速度場散度
    var FRAG_DIVERGENCE = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uVelocity;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;',
        '  float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;',
        '  float div = 0.5 * (R - L + T - B);',
        '  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);',
        '}'
    ].join('\n');

    // 壓力：Jacobi 迭代解泊松方程
    var FRAG_PRESSURE = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uPressure;',
        'uniform sampler2D uDivergence;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;',
        '  float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;',
        '  float divergence = texture2D(uDivergence, vUv).x;',
        '  float pressure = (L + R + B + T - divergence) * 0.25;',
        '  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);',
        '}'
    ].join('\n');

    // 梯度修正：速度場減去壓力梯度 → 無散度（水的不可壓縮性）
    var FRAG_GRADIENT = [
        'precision mediump float;',
        'varying vec2 vUv;',
        'uniform sampler2D uPressure;',
        'uniform sampler2D uVelocity;',
        'uniform vec2 texelSize;',
        'void main(){',
        '  float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;',
        '  float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;',
        '  float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;',
        '  float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;',
        '  vec2 velocity = texture2D(uVelocity, vUv).xy;',
        '  velocity -= vec2(R - L, T - B) * 0.5;',
        '  gl_FragColor = vec4(velocity, 0.0, 1.0);',
        '}'
    ].join('\n');

    // 潑濺：以高斯衰減把顏色/速度加進目標場
    var FRAG_SPLAT = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTarget;',
        'uniform float aspectRatio;',
        'uniform vec3 color;',
        'uniform vec2 point;',
        'uniform float radius;',
        'void main(){',
        '  vec2 p = vUv - point;',
        '  p.x *= aspectRatio;',                        // 修正長寬比，讓潑濺是正圓
        '  vec3 splat = exp(-dot(p, p) / radius) * color;',
        '  vec3 base = texture2D(uTarget, vUv).xyz;',
        '  gl_FragColor = vec4(base + splat, 1.0);',
        '}'
    ].join('\n');

    // 顯示：染料濃度轉透明度，讓水流疊在頁面上、底下畫面透出來
    var FRAG_DISPLAY = [
        'precision highp float;',
        'varying vec2 vUv;',
        'uniform sampler2D uTexture;',
        'uniform float uMaxAlpha;',
        'void main(){',
        '  vec3 c = texture2D(uTexture, vUv).rgb;',
        '  float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);',
        // 整體乘上透明度上限（顏色同步縮放維持預乘 alpha 正確），
        // 確保水流再濃也不會完全遮住底下的遊戲介面
        '  gl_FragColor = vec4(c * uMaxAlpha, a * uMaxAlpha);',
        '}'
    ].join('\n');

    // ====== WebGL 基礎工具 ======
    function compileShader(type, source) {
        var s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.warn('WaterFlow shader 編譯失敗:', gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    // 建立著色程式並收集所有 uniform 位置
    function createProgram(fragSource) {
        var vs = compileShader(gl.VERTEX_SHADER, VERT);
        var fs = compileShader(gl.FRAGMENT_SHADER, fragSource);
        if (!vs || !fs) return null;
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        var uniforms = {};
        var count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < count; i++) {
            var name = gl.getActiveUniform(prog, i).name;
            uniforms[name] = gl.getUniformLocation(prog, name);
        }
        return { program: prog, uniforms: uniforms };
    }

    // 建立可渲染的浮點 FBO（附紋理）
    function createFBO(w, h) {
        gl.activeTexture(gl.TEXTURE0);
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        var filter = supportLinear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, formatRGBA.internal, w, h, 0, formatRGBA.format, halfFloatType, null);

        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        return {
            texture: texture, fbo: fbo, width: w, height: h,
            texelSizeX: 1 / w, texelSizeY: 1 / h,
            attach: function (id) {
                gl.activeTexture(gl.TEXTURE0 + id);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                return id;
            }
        };
    }

    // 雙緩衝 FBO（讀寫交換，平流/壓力迭代必需）
    function createDoubleFBO(w, h) {
        var a = createFBO(w, h), b = createFBO(w, h);
        return {
            width: w, height: h,
            texelSizeX: 1 / w, texelSizeY: 1 / h,
            get read() { return a; },
            get write() { return b; },
            swap: function () { var t = a; a = b; b = t; }
        };
    }

    // 依畫面長寬比換算模擬解析度（短邊 = res）
    function getResolution(res) {
        var aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
        if (aspect < 1) aspect = 1 / aspect;
        var max = Math.round(res * aspect);
        return (gl.drawingBufferWidth > gl.drawingBufferHeight)
            ? { w: max, h: res } : { w: res, h: max };
    }

    // ====== 模擬資源 ======
    var progAdvection, progDivergence, progPressure, progGradient, progSplat, progDisplay;
    var velocity, dye, divergence, pressure;
    var quadBuffer;

    // 綁定全螢幕四邊形並執行一次繪製到指定 FBO（null = 畫到畫面）
    function blit(target) {
        if (target) {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        } else {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function initGL() {
        // 建立透明背景的 WebGL context（alpha:true 讓底下頁面透出）
        var opts = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        gl = canvas.getContext('webgl2', opts);
        var isWebGL2 = !!gl;
        if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
        if (!gl) return false;

        // ── 半浮點紋理支援偵測（流體模擬必需，速度是有號數值） ──
        if (isWebGL2) {
            var extCBF = gl.getExtension('EXT_color_buffer_float');
            supportLinear = !!gl.getExtension('OES_texture_float_linear') || true; // WebGL2 對 16F 線性過濾為核心功能
            if (!extCBF) return false;
            halfFloatType = gl.HALF_FLOAT;
            formatRGBA = { internal: gl.RGBA16F, format: gl.RGBA };
        } else {
            var extHF = gl.getExtension('OES_texture_half_float');
            if (!extHF) return false;
            supportLinear = !!gl.getExtension('OES_texture_half_float_linear');
            halfFloatType = extHF.HALF_FLOAT_OES;
            formatRGBA = { internal: gl.RGBA, format: gl.RGBA };
        }

        // 驗證半浮點 FBO 真的可渲染（部分舊手機宣稱支援但實際不行）
        var testFBO = createFBO(4, 4);
        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.deleteFramebuffer(testFBO.fbo);
        gl.deleteTexture(testFBO.texture);
        if (status !== gl.FRAMEBUFFER_COMPLETE) return false;

        // ── 編譯所有著色程式 ──
        progAdvection = createProgram(FRAG_ADVECTION);
        progDivergence = createProgram(FRAG_DIVERGENCE);
        progPressure = createProgram(FRAG_PRESSURE);
        progGradient = createProgram(FRAG_GRADIENT);
        progSplat = createProgram(FRAG_SPLAT);
        progDisplay = createProgram(FRAG_DISPLAY);
        if (!progAdvection || !progDivergence || !progPressure || !progGradient || !progSplat || !progDisplay) return false;

        // ── 全螢幕四邊形頂點（TRIANGLE_STRIP） ──
        quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        initFramebuffers();
        return true;
    }

    function initFramebuffers() {
        var simRes = getResolution(SIM_RES);
        var dyeRes = getResolution(DYE_RES);
        velocity = createDoubleFBO(simRes.w, simRes.h);
        dye = createDoubleFBO(dyeRes.w, dyeRes.h);
        divergence = createFBO(simRes.w, simRes.h);
        pressure = createDoubleFBO(simRes.w, simRes.h);
    }

    // ====== 顏色：HSV 色相隨時間循環（多色水彩感） ======
    function hsvToRgb(h, s, v) {
        var i = Math.floor(h * 6), f = h * 6 - i;
        var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
        var r, g, b;
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            default: r = v; g = p; b = q;
        }
        return { r: r, g: g, b: b };
    }

    // ====== 潑濺：在指定位置注入速度與染料 ======
    function splat(x, y, dx, dy, color) {
        // 座標轉換：螢幕 px → 紋理 uv（y 軸翻轉）
        var u = x / canvas.clientWidth;
        var v = 1 - y / canvas.clientHeight;
        var aspect = canvas.clientWidth / canvas.clientHeight;

        // 1. 注入速度（推動流場）
        gl.useProgram(progSplat.program);
        gl.uniform1i(progSplat.uniforms.uTarget, velocity.read.attach(0));
        gl.uniform1f(progSplat.uniforms.aspectRatio, aspect);
        gl.uniform2f(progSplat.uniforms.point, u, v);
        gl.uniform3f(progSplat.uniforms.color, dx, -dy, 0);
        gl.uniform1f(progSplat.uniforms.radius, SPLAT_RADIUS);
        blit(velocity.write);
        velocity.swap();

        // 2. 注入染料（可見的水彩顏色）
        gl.uniform1i(progSplat.uniforms.uTarget, dye.read.attach(0));
        gl.uniform3f(progSplat.uniforms.color, color.r * DYE_INTENSITY, color.g * DYE_INTENSITY, color.b * DYE_INTENSITY);
        blit(dye.write);
        dye.swap();
    }

    // ====== 模擬單步 ======
    function step(dt) {
        // 1. 速度場自我平流 + 消散
        gl.useProgram(progAdvection.program);
        gl.uniform2f(progAdvection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(progAdvection.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(progAdvection.uniforms.uSource, velocity.read.attach(0));
        gl.uniform1f(progAdvection.uniforms.dt, dt);
        gl.uniform1f(progAdvection.uniforms.dissipation, VELOCITY_DISSIPATION);
        blit(velocity.write);
        velocity.swap();

        // 2. 染料平流 + 消散
        gl.uniform1i(progAdvection.uniforms.uVelocity, velocity.read.attach(0));
        gl.uniform1i(progAdvection.uniforms.uSource, dye.read.attach(1));
        gl.uniform1f(progAdvection.uniforms.dissipation, DENSITY_DISSIPATION);
        blit(dye.write);
        dye.swap();

        // 3. 散度
        gl.useProgram(progDivergence.program);
        gl.uniform2f(progDivergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(progDivergence.uniforms.uVelocity, velocity.read.attach(0));
        blit(divergence);

        // 4. 壓力迭代（先衰減上一影格壓力做為初始猜測，加速收斂）
        gl.useProgram(progPressure.program);
        gl.uniform2f(progPressure.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(progPressure.uniforms.uDivergence, divergence.attach(0));
        for (var i = 0; i < PRESSURE_ITER; i++) {
            gl.uniform1i(progPressure.uniforms.uPressure, pressure.read.attach(1));
            blit(pressure.write);
            pressure.swap();
        }

        // 5. 梯度修正 → 無散度流場
        gl.useProgram(progGradient.program);
        gl.uniform2f(progGradient.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
        gl.uniform1i(progGradient.uniforms.uPressure, pressure.read.attach(0));
        gl.uniform1i(progGradient.uniforms.uVelocity, velocity.read.attach(1));
        blit(velocity.write);
        velocity.swap();
    }

    // ====== 主迴圈 ======
    function startLoop() {
        if (running || !enabled || !supported) return;
        running = true;
        lastTime = performance.now();
        requestAnimationFrame(tick);
    }

    function tick(now) {
        if (!running) return;
        var dt = Math.min(0.033, (now - lastTime) / 1000); // dt 上限：分頁切回時防暴衝
        lastTime = now;

        step(dt);

        // 顯示：染料畫到透明 canvas 上
        gl.useProgram(progDisplay.program);
        gl.uniform1i(progDisplay.uniforms.uTexture, dye.read.attach(0));
        gl.uniform1f(progDisplay.uniforms.uMaxAlpha, MAX_ALPHA);
        blit(null);

        // 閒置停機：放開手指超過 IDLE_TIMEOUT_MS（染料早已消散）→ 停止迴圈省電
        var hasPointer = false;
        for (var id in pointers) { hasPointer = true; break; }
        if (!hasPointer && now - lastActive > IDLE_TIMEOUT_MS) {
            running = false;
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            return;
        }
        requestAnimationFrame(tick);
    }

    // ====== 觸控事件 ======
    function onPointerDown(e) {
        if (!enabled || !supported) return;
        pointers[e.pointerId] = {
            x: e.clientX, y: e.clientY,
            lastT: performance.now(),
            hue: Math.random()          // 每根手指起始色相隨機
        };
        lastActive = performance.now();
        startLoop();
    }

    function onPointerMove(e) {
        var pt = pointers[e.pointerId];
        if (!pt || !enabled || !supported) return;
        var now = performance.now();
        var dt = Math.max(1, now - pt.lastT) / 1000;
        var dx = e.clientX - pt.x;
        var dy = e.clientY - pt.y;
        if (dx === 0 && dy === 0) return;

        // 色相隨時間循環 → 拖曳過程顏色漸變（多色水彩）
        pt.hue = (pt.hue + HUE_CYCLE_SPEED * dt) % 1;
        var color = hsvToRgb(pt.hue, 0.85, 1.0);

        // 推力與游標移動速度成正比（除以畫面寬做尺寸無關化）
        var fx = dx / canvas.clientWidth * SPLAT_FORCE;
        var fy = dy / canvas.clientHeight * SPLAT_FORCE;
        splat(e.clientX, e.clientY, fx, fy, color);

        pt.x = e.clientX;
        pt.y = e.clientY;
        pt.lastT = now;
        lastActive = now;
        startLoop();
    }

    function onPointerUp(e) {
        delete pointers[e.pointerId];
    }

    // ====== 視窗尺寸 ======
    function resize() {
        // 流體 canvas 用 1x 解析度即可（流體本身是柔霧狀，高 DPR 無感且耗效能）
        var w = window.innerWidth, h = window.innerHeight;
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            if (supported) initFramebuffers(); // 長寬比變了需重建模擬場
        }
    }

    // ====== 生命週期 ======
    function init() {
        canvas = document.createElement('canvas');
        canvas.id = 'water-flow-canvas';
        // 全螢幕固定覆蓋、不攔截任何觸控、置於特效層（低於 touchInk 的 99999）
        canvas.style.cssText =
            'position:fixed;left:0;top:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:99998;';
        document.body.appendChild(canvas);
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        supported = initGL();
        if (!supported) {
            // 裝置不支援 → 安靜停用並移除 canvas，不影響遊戲
            canvas.remove();
            console.warn('WaterFlow: 此裝置不支援半浮點 WebGL 紋理，水流特效已停用');
            return;
        }

        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointercancel', onPointerUp, { passive: true });
        window.addEventListener('resize', resize);

        // 頁面進背景：停止迴圈省電（染料場保留，回前景繼續）
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) {
                running = false;
                pointers = {};
            }
        });
    }

    // ====== 對外介面 ======
    window.WaterFlow = {
        /** 啟用特效 */
        enable: function () { enabled = true; },
        /** 停用特效並立即清空畫面 */
        disable: function () {
            enabled = false;
            running = false;
            pointers = {};
            if (gl) {
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
        },
        /** 除錯用：回傳內部狀態（正式版可移除） */
        _debug: function () {
            return { supported: supported, running: running, enabled: enabled };
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
