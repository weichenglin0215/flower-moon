/* ============================================================================
 * suiyuean.js — 隨遇而安 (Free-Floating Poem / 視覺療癒頁)
 * ----------------------------------------------------------------------------
 * 一頁「舒壓」介面（非遊戲、無計分）。取一首詩，將每個字拆散、隨機灑落於
 * 深色畫面中。點擊「隨遇而安」按鈕後，每個字各自以不同速度、方向緩緩漂移，
 * 碰到邊緣會反彈並略微加速；字與字相碰時：
 *   - 若屬同一句的相鄰位置 → 合併成一組，尺寸略為放大，繼續一起漂移碰撞。
 *   - 否則 → 彈開，瞬間略微加速。
 * 每句字第一次合併（湊滿 2 字以上）即依「第幾句完成連接」的順序著色
 * （紅、橙、黃…依句數平均分布色相）；句與句彼此永不合併。
 * 全部句子拼齊後，畫面仍持續漂移碰撞，並再度顯示按鈕，點擊即重新換一首詩。
 * 支援手指/滑鼠拖曳擾動：拖曳畫面時，半徑內的字會被推開（未開始漂移前也有即時
 * 位移回饋，開始漂移後還會附帶一點延續動能），讓玩家能主動撥弄字塊互動。
 *
 * 慣例：所有 CSS class 加 suiyuean- 前綴；overlay 掛於 document.body（非 #stage，
 *       因 stage 有 transform 會造成 position:fixed 二次縮放）；透過
 *       registerOverlayResize 同步舞台縮放；window.SuiYuEAn 掛全域供 menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;
    const EDGE_MARGIN = 14;      // 字離畫面邊緣的最小安全距離

    // ── 詩詞取材參數 ──
    // 畫面希望字數夠多、視覺熱鬧，但單一首詩很少能滿足這麼多字，
    // 因此改為「多首詩詞湊字數」：每次向題庫抽一小段（固定偶數句、至少 2 句，
    // 符合「兩句一聯」的詩詞原則），逐段累加，直到總字數落在目標範圍。
    const POEM_MIN_RATING = 3;
    const TOTAL_MIN_CHARS = 56;   // 全部詩句加總的最少字數
    const TOTAL_MAX_CHARS = 98;   // 全部詩句加總的最多字數
    const PULL_MIN_LINES = 2;     // 每次抽取的最少句數（偶數，至少一聯）
    const PULL_MAX_LINES = 8;     // 每次抽取的最多句數（偶數）
    const MAX_POEMS = 10;         // 最多混合幾首詩，避免無限迴圈
    const MAX_PULL_ATTEMPTS = 30; // 抽取嘗試次數上限，避免無限迴圈

    // ── 字體與成長 ──
    const FONT_START = 16;       // 初始字體大小 (px)
    const FONT_MAX = 40;         // 有效合併後字體上限 (px)
    const FONT_GROWTH = 3;       // 每次有效合併增加的字體 (px)

    // ── 運動參數 ──
    const SPEED_MIN = 0.55;      // 初始速度下限 (px/frame @60fps)
    const SPEED_MAX = 1.35;      // 初始速度上限
    const FRICTION = 0.994;     // 每幀速度衰減（略為減速）
    const MIN_SPEED = 0.32;      // 速度下限，避免完全靜止
    const MAX_SPEED = 1.66;      // 速度上限
    const WALL_BOOST = 1.66;     // 碰邊緣反彈的加速倍率
    const COLLISION_BOOST = 1.33;// 無效碰撞反彈的加速倍率
    const WALL_JITTER = 0.35;    // 碰邊緣時額外隨機偏轉角度上限（弧度），避免陷入完全水平/垂直、永遠撞不到其他字塊的軌跡

    // ── 碰撞特效（存續時間可依需求個別調整，單位 ms）──
    const FLASH_LIFE_EFFECTIVE = 360;    // 有效合併（成句）時的白框存續時間
    const FLASH_LIFE_INEFFECTIVE = 100;  // 無效碰撞（彈開）時的白框存續時間
    const FLASH_PAD = 3;         // 特效框比字塊本身多出的邊距 (px)

    // ── 手指/滑鼠拖曳擾動 ──
    const DRAG_RADIUS = 70;        // 拖曳影響半徑（世界座標 px）
    const DRAG_MAX_STEP = 30;      // 單次移動量上限，避免手指瞬移造成字塊爆衝
    const DRAG_POS_STRENGTH = 0.9; // 直接推動位置的力道（即時視覺回饋，靜止時也感覺得到）
    const DRAG_VEL_STRENGTH = 0.16;// 順帶加到速度上的力道（開始漂移後讓擾動有延續的動能）

    const SuiYuEAn = {

        // ── DOM 參照 ──
        container: null,
        canvas: null,
        ctx: null,
        startBtn: null,

        // ── 資料 ──
        poemLines: [],        // 本輪詩詞乾淨字串陣列（無標點）
        chunks: [],           // 目前所有移動中的字塊
        lineHue: [],          // 每句色相（尚未合併為 null）
        lineFullyDone: [],    // 每句是否已完整拼成
        mergeOrderCounter: 0, // 第幾句完成首次合併的計數器
        flashes: [],          // 白色圓角邊框特效佇列

        // ── 執行狀態 ──
        active: false,
        started: false,       // 是否已開始漂移
        allCompleted: false,  // 是否全部句子已拼齊
        rafId: null,
        dpr: 1,
        _lastTime: 0,

        // ── 拖曳擾動狀態 ──
        _dragging: false,
        _dragPointerId: null,
        _lastDragX: 0, _lastDragY: 0,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('suiyuean-css')) {
                const link = document.createElement('link');
                link.id = 'suiyuean-css';
                link.rel = 'stylesheet';
                link.href = 'suiyuean.css';
                document.head.appendChild(link);
            }
        },

        // ========================================================
        // 初始化（僅一次）
        // ========================================================
        init: function () {
            this.loadCSS();
            const isFirstInit = !document.getElementById('suiyuean-container');
            if (isFirstInit) {
                this.createDOM();
            }
            // ⚠️ 必須在 bindEvents() 之前先取得 DOM 參照：bindEvents 內的拖曳監聽器
            // 需要用到 this.canvas，先呼叫 bindEvents 會拿到尚未賦值的 null。
            this.container = document.getElementById('suiyuean-container');
            this.canvas = document.getElementById('suiyuean-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.startBtn = document.getElementById('suiyuean-start-btn');
            if (isFirstInit) {
                this.bindEvents();
            }
            this._setupCanvasSize();
        },

        _setupCanvasSize: function () {
            this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
            this.canvas.width = STAGE_W * this.dpr;
            this.canvas.height = STAGE_H * this.dpr;
            this.canvas.style.width = STAGE_W + 'px';
            this.canvas.style.height = STAGE_H + 'px';
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'suiyuean-container';
            div.className = 'suiyuean-overlay hidden';
            div.innerHTML = `
                <canvas id="suiyuean-canvas" class="suiyuean-canvas"></canvas>
                <div id="suiyuean-close" class="suiyuean-close" aria-label="關閉">✕</div>
                <div id="suiyuean-title" class="suiyuean-title">隨遇而安</div>
                <button id="suiyuean-start-btn" class="suiyuean-start-btn">隨遇而安</button>
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
            document.getElementById('suiyuean-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });

            document.getElementById('suiyuean-start-btn').addEventListener('click', () => {
                if (window.SoundManager) {
                    window.SoundManager.init();
                    window.SoundManager.playConfirmItem();
                }
                this._onStartClick();
            });

            // ── 手指/滑鼠拖曳擾動字塊（Pointer Events 同時涵蓋滑鼠與觸控）──
            const cv = this.canvas;
            cv.addEventListener('pointerdown', (e) => {
                const p = this._canvasCoords(e.clientX, e.clientY);
                this._dragging = true;
                this._dragPointerId = e.pointerId;
                this._lastDragX = p.x; this._lastDragY = p.y;
                try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 部分瀏覽器可能不支援，忽略即可 */ }
                e.preventDefault();
            });
            cv.addEventListener('pointermove', (e) => {
                if (!this._dragging || e.pointerId !== this._dragPointerId) return;
                const p = this._canvasCoords(e.clientX, e.clientY);
                this._disturbChunks(p.x, p.y, p.x - this._lastDragX, p.y - this._lastDragY);
                this._lastDragX = p.x; this._lastDragY = p.y;
                e.preventDefault();
            });
            const endDrag = (e) => {
                if (e.pointerId !== this._dragPointerId) return;
                this._dragging = false;
                this._dragPointerId = null;
            };
            cv.addEventListener('pointerup', endDrag);
            cv.addEventListener('pointercancel', endDrag);
            cv.addEventListener('pointerleave', endDrag);
        },

        // clientX/Y → 畫布邏輯座標（0..STAGE_W, 0..STAGE_H），已抵銷 stage 的 CSS 縮放
        _canvasCoords: function (clientX, clientY) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: (clientX - rect.left) / rect.width * STAGE_W,
                y: (clientY - rect.top) / rect.height * STAGE_H,
            };
        },

        // 手指/滑鼠拖曳擾動：半徑內的字塊依距離遠近被推動，越靠近拖曳點推力越大；
        // 同時直接位移（讓靜止狀態也有立即回饋）與加一點速度（讓漂移中的字有延續動能）。
        _disturbChunks: function (wx, wy, dx, dy) {
            let mag = Math.hypot(dx, dy);
            if (mag < 0.01) return;
            if (mag > DRAG_MAX_STEP) {
                const s = DRAG_MAX_STEP / mag;
                dx *= s; dy *= s;
            }

            const r2 = DRAG_RADIUS * DRAG_RADIUS;
            for (const c of this.chunks) {
                const ddx = c.x - wx, ddy = c.y - wy;
                const d2 = ddx * ddx + ddy * ddy;
                if (d2 > r2) continue;
                const f = 1 - Math.sqrt(d2) / DRAG_RADIUS;

                c.x += dx * f * DRAG_POS_STRENGTH;
                c.y += dy * f * DRAG_POS_STRENGTH;
                c.vx += dx * f * DRAG_VEL_STRENGTH;
                c.vy += dy * f * DRAG_VEL_STRENGTH;
                this._clampSpeed(c);

                // 拖曳可能把字塊推出畫面，直接夾回邊界內（未啟動漂移時牆壁反彈邏輯不會執行）
                const m = this._metricsOf(c);
                c.x = Math.max(m.halfW, Math.min(STAGE_W - m.halfW, c.x));
                c.y = Math.max(m.halfH, Math.min(STAGE_H - m.halfH, c.y));
            }
        },

        _onStartClick: function () {
            if (!this.started) {
                // 首次點擊：讓已灑落的字開始漂移
                this.started = true;
            } else {
                // 全部完成後再次點擊：重新選詩、重新灑落
                this._newRound();
                this.started = true;
            }
            this.allCompleted = false;
            this.startBtn.classList.add('hidden');
        },

        // ========================================================
        // 詩詞取材
        // ========================================================
        // 混合多首詩詞的句子，直到總字數落在 [TOTAL_MIN_CHARS, TOTAL_MAX_CHARS]；
        // 每次抽取都固定偶數句、至少 2 句（一聯），絕不會只抽到單一句或奇數句。
        _pickPoemLines: function () {
            let lines = [];
            let totalChars = 0;

            try {
                if (typeof getSharedRandomPoem === 'function') {
                    let poemCount = 0;
                    let attempts = 0;
                    while (totalChars < TOTAL_MIN_CHARS && poemCount < MAX_POEMS && attempts < MAX_PULL_ATTEMPTS) {
                        attempts++;
                        const remaining = TOTAL_MAX_CHARS - totalChars;
                        if (remaining < PULL_MIN_LINES * 2) break; // 剩餘空間連最短一聯都放不下，收尾

                        const result = getSharedRandomPoem(
                            POEM_MIN_RATING, PULL_MIN_LINES, PULL_MAX_LINES,
                            PULL_MIN_LINES * 2, remaining, "", null, 'suiyuean'
                        );
                        if (!result || !Array.isArray(result.lines) || result.lines.length === 0) continue;

                        // 保險：getSharedRandomPoem 理論上已保證偶數句，這裡雙重確認，
                        // 若意外拿到奇數句就捨去最後一句，絕不允許單句/奇數句進入畫面
                        let pulled = result.lines;
                        if (pulled.length % 2 !== 0) pulled = pulled.slice(0, pulled.length - 1);
                        if (pulled.length < 2) continue;

                        const pulledChars = pulled.join('').length;
                        if (totalChars + pulledChars > TOTAL_MAX_CHARS) continue; // 超出上限，重抽

                        lines = lines.concat(pulled);
                        totalChars += pulledChars;
                        poemCount++;
                    }
                }
            } catch (e) { console.warn('[隨遇而安] getSharedRandomPoem 失敗', e); }

            if (lines.length === 0 && typeof POEMS !== 'undefined' && Array.isArray(POEMS) && POEMS.length > 0) {
                // 降級保護：直接從題庫任取一首並去除標點
                const poem = POEMS[Math.floor(Math.random() * POEMS.length)];
                if (poem && Array.isArray(poem.content)) {
                    lines = poem.content
                        .map(l => (l || '').replace(/[，。？！、：；「」『』\s]/g, ""))
                        .filter(l => l.length > 0);
                    if (lines.length % 2 !== 0) lines = lines.slice(0, lines.length - 1);
                }
            }
            return lines;
        },

        // ========================================================
        // 建立本輪字塊（散落、靜止或漂移）
        // ========================================================
        _newRound: function () {
            this.poemLines = this._pickPoemLines();
            this._buildChunks();
        },

        _buildChunks: function () {
            this.chunks = [];
            this.flashes = [];
            this.mergeOrderCounter = 0;
            const n = this.poemLines.length;
            this.lineHue = new Array(n).fill(null);
            this.lineFullyDone = new Array(n).fill(false);

            for (let li = 0; li < n; li++) {
                const line = this.poemLines[li];
                for (let pos = 0; pos < line.length; pos++) {
                    this.chunks.push(this._makeSingletonChunk(li, pos, line[pos]));
                }
            }
        },

        _makeSingletonChunk: function (lineIdx, pos, ch) {
            const r = FONT_START * 0.65;
            const x = EDGE_MARGIN + r + Math.random() * (STAGE_W - 2 * (EDGE_MARGIN + r));
            const y = EDGE_MARGIN + r + Math.random() * (STAGE_H - 2 * (EDGE_MARGIN + r));
            const angle = Math.random() * Math.PI * 2;
            const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
            return {
                lineIdx: lineIdx,
                startPos: pos,
                endPos: pos,
                chars: [ch],
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                fontSize: FONT_START,
                hue: null,
                completed: (this.poemLines[lineIdx].length === 1),
            };
        },

        // 字塊的實際外框半寬/半高（合成句子直排，供碰撞判定與特效共用，
        // 確保碰撞範圍緊貼實際文字方框，不再用外接圓造成「還有段距離就碰撞」的失真）
        _metricsOf: function (chunk) {
            const spacing = chunk.fontSize * 1.05;
            const totalHeight = spacing * (chunk.chars.length - 1) + chunk.fontSize;
            const width = chunk.fontSize * 1.15;
            return { halfW: width / 2, halfH: totalHeight / 2 };
        },

        // 限制速度不超過 MAX_SPEED（避免撞牆/碰撞加速倍率無限疊加）
        _clampSpeed: function (c) {
            const speed = Math.hypot(c.vx, c.vy);
            if (speed > MAX_SPEED) {
                const s = MAX_SPEED / speed;
                c.vx *= s;
                c.vy *= s;
            }
        },

        // 將速度向量隨機旋轉一個小角度（碰邊緣時使用），避免字塊落入完全水平／
        // 垂直反覆彈射、永遠不會與其他字塊相撞的軌跡
        _jitterVelocity: function (c, maxAngle) {
            const angle = (Math.random() * 2 - 1) * maxAngle;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const vx = c.vx * cos - c.vy * sin;
            const vy = c.vx * sin + c.vy * cos;
            c.vx = vx; c.vy = vy;
        },

        // ========================================================
        // 物理更新
        // ========================================================
        _updatePhysics: function (dtScale) {
            if (this.started) {
                this._integrate(dtScale);
                this._handleWalls();
                this._handleCollisions();
            }
            this._ageFlashes(dtScale);
        },

        _integrate: function (dtScale) {
            for (const c of this.chunks) {
                const speed = Math.hypot(c.vx, c.vy);
                if (speed > MIN_SPEED && speed < MAX_SPEED) {
                    c.vx *= FRICTION;
                    c.vy *= FRICTION;
                }
                c.x += c.vx * dtScale;
                c.y += c.vy * dtScale;
            }
        },

        _handleWalls: function () {
            for (const c of this.chunks) {
                const m = this._metricsOf(c);
                let bounced = false;
                if (c.x - m.halfW < 0) { c.x = m.halfW; c.vx = -c.vx * WALL_BOOST; bounced = true; }
                else if (c.x + m.halfW > STAGE_W) { c.x = STAGE_W - m.halfW; c.vx = -c.vx * WALL_BOOST; bounced = true; }
                if (c.y - m.halfH < 0) { c.y = m.halfH; c.vy = -c.vy * WALL_BOOST; bounced = true; }
                else if (c.y + m.halfH > STAGE_H) { c.y = STAGE_H - m.halfH; c.vy = -c.vy * WALL_BOOST; bounced = true; }
                // 每次碰邊緣都加一點隨機偏轉，避免軌跡卡在完全水平/垂直而永遠相撞不到別的字塊
                if (bounced) this._jitterVelocity(c, WALL_JITTER);
                this._clampSpeed(c);
            }
        },

        // 判斷兩字塊是否屬於同一句且位置相鄰（可合併）
        _isMergeable: function (a, b) {
            if (a.lineIdx !== b.lineIdx) return false;
            return (a.endPos + 1 === b.startPos) || (b.endPos + 1 === a.startPos);
        },

        _handleCollisions: function () {
            const list = this.chunks;
            const n = list.length;
            const consumed = new Set();
            const toRemove = new Set();
            const toAdd = [];

            for (let i = 0; i < n; i++) {
                const a = list[i];
                if (consumed.has(a)) continue;
                for (let j = i + 1; j < n; j++) {
                    const b = list[j];
                    if (consumed.has(b)) continue;
                    // 以「長方形外框」做碰撞判定（AABB），緊貼實際字塊尺寸，
                    // 避免用外接圓造成句子（長條形）還有段距離就誤判碰撞
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const ma = this._metricsOf(a), mb = this._metricsOf(b);
                    const overlapX = (ma.halfW + mb.halfW) - Math.abs(dx);
                    const overlapY = (ma.halfH + mb.halfH) - Math.abs(dy);
                    if (overlapX <= 0 || overlapY <= 0) continue;

                    if (this._isMergeable(a, b)) {
                        const merged = this._mergeChunks(a, b);
                        this._clampSpeed(merged);
                        consumed.add(a); consumed.add(b);
                        toRemove.add(a); toRemove.add(b);
                        toAdd.push(merged);
                        this._spawnFlashForChunk(merged, true);
                        this._playEffectiveSound();
                        break; // a 已被消耗，換下一個 i
                    } else {
                        // 取穿透較淺的軸作為碰撞法線（MTV，最小平移向量）
                        let nx, ny, overlap;
                        if (overlapX < overlapY) {
                            nx = dx >= 0 ? 1 : -1; ny = 0; overlap = overlapX;
                        } else {
                            nx = 0; ny = dy >= 0 ? 1 : -1; overlap = overlapY;
                        }
                        this._bounceChunks(a, b, nx, ny, overlap);
                        this._clampSpeed(a);
                        this._clampSpeed(b);
                        // 依各自字塊實際長寬各出一個特效框（非同一大小的合併框）
                        this._spawnFlashForChunk(a, false);
                        this._spawnFlashForChunk(b, false);
                        this._playIneffectiveSound();
                    }
                }
            }

            if (toRemove.size > 0) {
                this.chunks = list.filter(c => !toRemove.has(c)).concat(toAdd);
            }

            this._checkAllCompleted();
        },

        _mergeChunks: function (a, b) {
            const left = a.startPos < b.startPos ? a : b;
            const right = a.startPos < b.startPos ? b : a;
            const massA = a.chars.length, massB = b.chars.length;
            const totalMass = massA + massB;

            const merged = {
                lineIdx: left.lineIdx,
                startPos: left.startPos,
                endPos: right.endPos,
                chars: left.chars.concat(right.chars),
                x: (a.x * massA + b.x * massB) / totalMass,
                y: (a.y * massA + b.y * massB) / totalMass,
                vx: (a.vx * massA + b.vx * massB) / totalMass,
                vy: (a.vy * massA + b.vy * massB) / totalMass,
                fontSize: Math.min(FONT_MAX, Math.max(a.fontSize, b.fontSize) + FONT_GROWTH),
                hue: null,
                completed: false,
            };
            merged.completed = (merged.chars.length === this.poemLines[merged.lineIdx].length);

            if (this.lineHue[merged.lineIdx] === null) {
                const total = Math.max(1, this.poemLines.length - 1);
                this.lineHue[merged.lineIdx] = this.poemLines.length <= 1
                    ? 0
                    : (this.mergeOrderCounter * 300 / total);
                this.mergeOrderCounter++;
            }
            merged.hue = this.lineHue[merged.lineIdx];
            if (merged.completed) this.lineFullyDone[merged.lineIdx] = true;

            return merged;
        },

        // nx/ny：碰撞法線（MTV 取得的軸向單位向量）；overlap：該軸的穿透深度
        _bounceChunks: function (a, b, nx, ny, overlap) {
            const massA = a.chars.length, massB = b.chars.length;

            // 位置修正，避免持續重疊
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;

            // 依傳入的碰撞法線（nx, ny）將相對速度分解為法線／切線分量：
            // 只有法線分量會依角度反射（切線分量不變），使反彈方向真正取決於碰撞角度，
            // 而非單純把速度整個反向。
            // ⚠️ 相對速度必須是 (b - a)：當兩者互相靠近時 velAlongNormal < 0，
            //    這樣才會真正進入反彈分支；先前誤寫成 (a - b) 導致條件正負號相反，
            //    使得真正互相靠近的碰撞反而不會套用衝量，只剩下位置推開、速度方向沒變。
            const relVx = b.vx - a.vx, relVy = b.vy - a.vy;
            const velAlongNormal = relVx * nx + relVy * ny;
            if (velAlongNormal < 0) {
                const j = -velAlongNormal * 2 / (1 / massA + 1 / massB);
                const ix = j * nx, iy = j * ny;
                a.vx -= ix / massA; a.vy -= iy / massA;
                b.vx += ix / massB; b.vy += iy / massB;
                // 瞬間略微加速（僅在真正產生反彈作用力時才加速，避免掠過式接觸誤加速）
                a.vx *= COLLISION_BOOST; a.vy *= COLLISION_BOOST;
                b.vx *= COLLISION_BOOST; b.vy *= COLLISION_BOOST;
            }
        },

        _checkAllCompleted: function () {
            if (this.allCompleted) return;
            if (this.lineFullyDone.length === 0) return;
            const done = this.lineFullyDone.every(v => v === true);
            if (done) {
                this.allCompleted = true;
                if (this.startBtn) this.startBtn.classList.remove('hidden');
            }
        },

        // ========================================================
        // 碰撞特效與音效
        // ========================================================
        // 依字塊實際長寬產生一個長方形特效框（單字接近方形，句子則為長條形）
        _spawnFlashForChunk: function (chunk, effective) {
            const m = this._metricsOf(chunk);
            const life = effective ? FLASH_LIFE_EFFECTIVE : FLASH_LIFE_INEFFECTIVE;
            this.flashes.push({
                x: chunk.x, y: chunk.y,
                halfW: m.halfW + FLASH_PAD, halfH: m.halfH + FLASH_PAD,
                life: life, maxLife: life, effective: effective,
                hue: effective ? chunk.hue : null, // 有效合併：套用該句子的顏色；無效碰撞維持白色
            });
        },

        _ageFlashes: function (dtScale) {
            const dtMs = dtScale * 16.67;
            for (let i = this.flashes.length - 1; i >= 0; i--) {
                this.flashes[i].life -= dtMs;
                if (this.flashes[i].life <= 0) this.flashes.splice(i, 1);
            }
        },

        _playEffectiveSound: function () {
            if (!window.SoundManager) return;
            // 音階較高、時間較長（>=1 秒漸弱），每次索引隨機以呈現不同音階
            const idx = 8 + Math.floor(Math.random() * 7); // 高八度區間
            window.SoundManager.playGuzheng(idx, 0.85);
        },

        _playIneffectiveSound: function () {
            if (!window.SoundManager) return;
            // 短促音效
            const idx = Math.floor(Math.random() * 5);
            window.SoundManager.playHit(idx, 0.1);
        },

        // ========================================================
        // 繪製
        // ========================================================
        _render: function () {
            const ctx = this.ctx;
            const dpr = this.dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            this._drawBackground(ctx);

            for (const c of this.chunks) this._drawChunk(ctx, c);
            for (const f of this.flashes) this._drawFlash(ctx, f);
        },

        _drawBackground: function (ctx) {
            const g = ctx.createRadialGradient(
                STAGE_W / 2, STAGE_H * 0.42, 60,
                STAGE_W / 2, STAGE_H * 0.42, STAGE_H * 0.75
            );
            g.addColorStop(0, 'hsl(220, 35%, 14%)');
            g.addColorStop(0.6, 'hsl(220, 40%, 8%)');
            g.addColorStop(1, 'hsl(0, 0%, 2%)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        },

        // 合成的句子直排顯示（由上而下），單字則單獨置中，不受影響
        _drawChunk: function (ctx, c) {
            ctx.font = `${c.fontSize}px 'Noto Serif TC', serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const spacing = c.fontSize * 1.05;
            const totalHeight = spacing * (c.chars.length - 1);
            const startY = c.y - totalHeight / 2;

            if (c.hue !== null) {
                ctx.fillStyle = `hsl(${c.hue}, 78%, 66%)`;
                ctx.shadowColor = `hsla(${c.hue}, 90%, 60%, 0.65)`;
                ctx.shadowBlur = 6;
            } else {
                ctx.fillStyle = 'hsl(0, 0%, 96%)';
                ctx.shadowColor = 'hsla(0, 0%, 100%, 0.35)';
                ctx.shadowBlur = 3;
            }

            for (let k = 0; k < c.chars.length; k++) {
                ctx.fillText(c.chars[k], c.x, startY + spacing * k);
            }
            ctx.shadowBlur = 0;
        },

        _drawFlash: function (ctx, f) {
            const p = 1 - f.life / f.maxLife;      // 0 → 1
            const alpha = Math.max(0, 1 - p) * (f.effective ? 0.9 : 0.7);
            const grow = 1 + p * (f.effective ? 0.12 : 0.05);
            const w = f.halfW * 2 * grow;
            const h = f.halfH * 2 * grow;
            const corner = Math.min(f.halfH, f.halfW) * 0.5;
            ctx.save();
            ctx.globalAlpha = alpha;
            // 有效碰撞（合併成句）：套用該句子的顏色；無效碰撞（彈開）：維持白色以做出區別
            ctx.strokeStyle = (f.effective && f.hue !== null && f.hue !== undefined)
                ? `hsl(${f.hue}, 85%, 68%)`
                : '#ffffff';
            ctx.lineWidth = f.effective ? 5 : 3;
            ctx.lineJoin = 'round';
            this._roundRectPath(ctx, f.x - w / 2, f.y - h / 2, w, h, corner);
            ctx.stroke();
            ctx.restore();
        },

        _roundRectPath: function (ctx, x, y, w, h, r) {
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
            if (!this._lastTime) this._lastTime = time;
            const dt = time - this._lastTime;
            this._lastTime = time;
            const dtScale = Math.max(0, Math.min(2, dt / 16.67));

            this._updatePhysics(dtScale);
            this._render();
            this.rafId = requestAnimationFrame((t) => this._loop(t));
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
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this.started = false;
            this.allCompleted = false;
            this._dragging = false;
            this._dragPointerId = null;
            if (this.startBtn) this.startBtn.classList.remove('hidden');
            this._newRound();
            this._startLoop();
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

    window.SuiYuEAn = SuiYuEAn;

    // URL 參數啟動（與其他模組一致，精確比對）
    if (new URLSearchParams(window.location.search).get('page') === 'suiyuean') {
        const start = () => {
            if (window.SuiYuEAn) window.SuiYuEAn.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
