/**
 * 江南書院（收集系統）— 主場景與遊戲循環
 * 依專案規範：所有 class 加 fm-collection 前綴；不直呼 localStorage
 *
 * 架構：
 *   - 純 Canvas 2D 等角投影渲染（無外部引擎）
 *   - 真實時間驅動成長；玩家回訪結算
 *   - 點擊場景物體觸發互動（無常駐按鈕 UI）
 *   - 行動裝置：單指拖曳平移、雙指 pinch 縮放
 *
 * 公開：window.CollectionDialog.show() / hide()
 */
(function () {
    'use strict';

    /* =====================================================
     * 常數定義（依《收集系統企畫書六版》§5.7）
     * ===================================================== */
    const TIERS = ['下品', '中品', '上品', '極品'];
    const TIER_IDX = { '下品': 0, '中品': 1, '上品': 2, '極品': 3 };

    // 種子→成品產出機率分佈（行=種子等級，列=產出等級）
    const TIER_ROLL = {
        '下品': [0.60, 0.30, 0.08, 0.02],
        '中品': [0.20, 0.50, 0.25, 0.05],
        '上品': [0.05, 0.25, 0.55, 0.15],
        '極品': [0.02, 0.08, 0.30, 0.60]
    };

    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    /** 盆景 — 蘭/菊(短)、竹(中)、梅(長) */
    const POT_KINDS = {
        '蘭': { period: 1 * DAY, harvestWindow: 12 * HOUR, prices: { '下品':[20,80], '中品':[40,160], '上品':[80,320], '極品':[160,640] } },
        '菊': { period: 1 * DAY, harvestWindow: 12 * HOUR, prices: { '下品':[20,80], '中品':[40,160], '上品':[80,320], '極品':[160,640] } },
        '竹': { period: 3 * DAY, harvestWindow: 18 * HOUR, prices: { '下品':[60,240], '中品':[120,480], '上品':[240,960], '極品':[480,1920] } },
        '梅': { period: 7 * DAY, harvestWindow: 24 * HOUR, prices: { '下品':[140,560], '中品':[280,1120], '上品':[560,2240], '極品':[1120,4480] } }
    };

    const TEA_KINDS = {
        '龍井': { period: 1 * DAY, dryWindow: 6 * HOUR,  prices: { '下品':[8,30],  '中品':[15,60],  '上品':[30,120], '極品':[60,240] } },
        '烏龍': { period: 3 * DAY, dryWindow: 12 * HOUR, prices: { '下品':[25,100],'中品':[50,200], '上品':[100,400],'極品':[200,800] } },
        '紅茶': { period: 7 * DAY, dryWindow: 18 * HOUR, prices: { '下品':[60,240],'中品':[120,480],'上品':[240,960],'極品':[480,1920] } }
    };

    const WINE_KINDS = {
        '米酒':   { period: 3 * DAY, openWindow: 24 * HOUR, prices: { '下品':[13,50], '中品':[25,100],'上品':[50,200],'極品':[100,400] } },
        '黃酒':   { period: 5 * DAY, openWindow: 24 * HOUR, prices: { '下品':[25,100],'中品':[50,200],'上品':[100,400],'極品':[200,800] } },
        '女兒紅': { period: 7 * DAY, openWindow: 24 * HOUR, prices: { '下品':[50,200],'中品':[100,400],'上品':[200,800],'極品':[400,1600] } }
    };

    const SCRIBE_KINDS = {
        '四書': { period: 1 * HOUR, claimWindow: 6 * HOUR, prices: { '下品':[2,6], '中品':[3,12], '上品':[6,24], '極品':[12,48] } },
        '五經': { period: 1 * HOUR, claimWindow: 6 * HOUR, prices: { '下品':[3,10],'中品':[5,20], '上品':[10,40],'極品':[20,80] } }
    };

    const WATER_INTERVAL = 6 * HOUR;
    const NIGHT_START_H = 22, NIGHT_END_H = 6;  // 22:00 ~ 6:00 夜安息

    /** 考試費表（依 minScore × 1.5 / 100 / 4，上限 10,000 文） */
    const EXAM_FEES = {
        '縣案首':  300, '府案首': 600, '文童': 1200, '秀才': 2400,
        '舉人': 4800, '貢士': 9600,
        '進士': 10000, '探花': 10000, '榜眼': 10000, '狀元': 10000
    };
    const EXAM_RANKS_ORDER = ['縣案首','府案首','文童','秀才','舉人','貢士','進士','探花','榜眼','狀元'];

    /** 小院區域地價（雙鉤子：通過考試後還需湊地價） */
    const PLOT_PRICES = {
        '茶寮': { rank: '童生', price: 500 },
        '酒窖': { rank: '童生', price: 800 },
        '雅玩架': { rank: '秀才', price: 2000 },
        '廂房': { rank: '秀才', price: 5000 },
        '廚房': { rank: '秀才', price: 3000 },
        '客廳': { rank: '舉人', price: 15000 },
        '水池': { rank: '舉人', price: 10000 },
        '園林': { rank: '進士', price: 50000 }
    };

    /* =====================================================
     * 主物件
     * ===================================================== */
    const CollectionDialog = {
        overlay: null,
        canvas: null,
        ctx: null,
        data: null,
        camera: { x: 0, y: 0, scale: 1, minScale: 0.5, maxScale: 2.0 },
        gestures: null,
        objects: [],         // 場景互動物件 (hitbox)
        loopHandle: null,
        playerSurname: '林', // 漢字頭，可從 ScoreManager.nickname 抽首字
        toast: null,
        toastTimer: 0,

        /* ---- 初始化 ---- */
        init: function () {
            if (this.overlay) return;
            if (!document.getElementById('collection-css')) {
                const link = document.createElement('link');
                link.id = 'collection-css';
                link.rel = 'stylesheet';
                link.href = 'collection.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.attachInput();
        },

        show: function () {
            this.init();
            this.data = window.FMCollectionSave.load();
            // 從 ScoreManager 拉暱稱首字
            try {
                if (window.ScoreManager) {
                    const pd = window.ScoreManager.loadPlayerData();
                    if (pd.nickname) this.playerSurname = pd.nickname.charAt(0) || '林';
                }
            } catch (e) { /* ignore */ }
            this.overlay.classList.remove('hidden');
            // overlay 從 hidden 切回顯示後，canvas 才有實際尺寸，補一次 resize
            requestAnimationFrame(() => this.resizeCanvas());
            this.refreshHUD();
            this.startLoop();
        },

        hide: function () {
            if (!this.overlay) return;
            this.overlay.classList.add('hidden');
            this.stopLoop();
            if (this.data) {
                window.FMCollectionSave.markSeen(this.data);
                window.FMCollectionSave.save(this.data);
            }
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.className = 'fm-collection-overlay hidden';
            overlay.innerHTML = `
                <div class="fm-collection-container" id="fmCollectionContainer">
                    <div class="fm-collection-header">
                        <div class="fm-collection-title">江南書院</div>
                        <div class="fm-collection-close" id="fmCollectionClose">✕</div>
                    </div>
                    <div class="fm-collection-hud">
                        <div class="fm-collection-hud-cell">
                            <div id="fmHudRank">書僮</div>
                            <div class="fm-collection-hud-cell-label">文位</div>
                        </div>
                        <div class="fm-collection-hud-cell">
                            <div id="fmHudSilver">0 文</div>
                            <div class="fm-collection-hud-cell-label">銀兩</div>
                        </div>
                        <div class="fm-collection-hud-cell">
                            <div id="fmHudTime">—</div>
                            <div class="fm-collection-hud-cell-label">時辰</div>
                        </div>
                    </div>
                    <div class="fm-collection-stage" id="fmCollectionStage">
                        <canvas class="fm-collection-canvas" id="fmCollectionCanvas"></canvas>
                        <div class="fm-collection-toast" id="fmCollectionToast"></div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            this.overlay = overlay;
            this.canvas = overlay.querySelector('#fmCollectionCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.toast = overlay.querySelector('#fmCollectionToast');

            overlay.querySelector('#fmCollectionClose').addEventListener('click', () => this.hide());

            // 跟著 stage 縮放（沿用其他模組的 registerOverlayResize）
            const cont = overlay.querySelector('#fmCollectionContainer');
            const self = this;
            if (window.registerOverlayResize) {
                window.registerOverlayResize(function (r) {
                    cont.style.width = (500 * 0.96) + 'px';
                    cont.style.height = (850 * 0.96) + 'px';
                    cont.style.left = (r.left + 500 * 0.02 * r.scale) + 'px';
                    cont.style.top = (r.top + 850 * 0.02 * r.scale) + 'px';
                    cont.style.transform = 'scale(' + r.scale + ')';
                    cont.style.transformOrigin = 'top left';
                    // 取消 transform 後再調整 canvas 邏輯解析度
                    requestAnimationFrame(() => self.resizeCanvas());
                });
            } else {
                this.resizeCanvas();
            }
        },

        resizeCanvas: function () {
            if (!this.canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const rect = this.canvas.getBoundingClientRect();
            const cssW = rect.width || 480, cssH = rect.height || 700;
            this.canvas.width = Math.round(cssW * dpr);
            this.canvas.height = Math.round(cssH * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        },

        /* =====================================================
         * 主循環（每 500ms 結算一次 + 重繪）
         * ===================================================== */
        startLoop: function () {
            if (this.loopHandle) return;
            const tick = () => {
                if (!this.data) return;
                this.simulate();
                this.draw();
                this.refreshHUD();
                this.loopHandle = setTimeout(tick, 500);
            };
            tick();
        },

        stopLoop: function () {
            if (this.loopHandle) clearTimeout(this.loopHandle);
            this.loopHandle = null;
        },

        /** 結算所有真實時間驅動的狀態 */
        simulate: function () {
            const now = window.FMCollectionSave.normalizeNow(this.data);

            // 盆景：判斷成熟、過窗降品
            this.data.plots.forEach(p => this.tickPot(p, now));
            this.data.teas.forEach(t => this.tickTea(t, now));
            this.data.wines.forEach(w => this.tickWine(w, now));
            this.tickScribe(this.data.scribe, now);
        },

        tickPot: function (p, now) {
            if (!p.kind || p.stage === 'empty') return;
            const def = POT_KINDS[p.kind];
            if (!def) return;
            const age = now - p.plantedTs;
            if (age >= def.period) {
                p.harvestable = true;
                p.stage = 'ripe';
                // 計算錯過澆水次數（用於品質降級）
                const expectedWaters = Math.floor(def.period / WATER_INTERVAL);
                p.missedWater = Math.max(p.missedWater || 0, 0);
                // 計算採收逾時降品
                const overdueMs = age - def.period;
                p.overdueLevel = this.overdueLevel(overdueMs, def.harvestWindow);
            } else {
                p.stage = (age < def.period * 0.3) ? 'seedling'
                       : (age < def.period * 0.7) ? 'budding' : 'flowering';
            }
        },

        tickTea: function (t, now) {
            if (!t.kind || t.stage === 'empty') return;
            const def = TEA_KINDS[t.kind];
            if (!def) return;
            if (t.stage === 'growing') {
                const age = now - t.plantedTs;
                if (age >= def.period) {
                    t.stage = 'pickable';
                    t.pickableTs = t.plantedTs + def.period;
                }
            } else if (t.stage === 'drying') {
                const dryAge = now - t.dryStartTs;
                t.dryOverdueLevel = this.overdueLevel(Math.max(0, dryAge - def.dryWindow), def.dryWindow);
            }
        },

        tickWine: function (w, now) {
            if (!w.kind || w.stage === 'empty') return;
            const def = WINE_KINDS[w.kind];
            if (!def) return;
            const age = now - w.startTs;
            if (age >= def.period) {
                w.stage = 'open';
                w.openOverdueLevel = (age - def.period > def.openWindow)
                    ? 2  // 酒類特例：超 24 小時直降 2 級
                    : 0;
            }
        },

        tickScribe: function (s, now) {
            if (!s) return;
            // 每 1 小時自動完成 1 本，若上限滿則停止
            if (!s.books) s.books = [];
            if (!s.lastClaimTs) s.lastClaimTs = now;
            // 計算自上次起應產生幾本
            const elapsed = now - s.lastClaimTs;
            const shouldHave = Math.min(s.deskCap || 1, Math.floor(elapsed / HOUR));
            const have = s.books.length;
            if (shouldHave > have) {
                for (let i = have; i < shouldHave; i++) {
                    s.books.push({
                        kind: (Math.random() < 0.5) ? '四書' : '五經',
                        finishedTs: s.lastClaimTs + (i + 1) * HOUR,
                        tier: '下品'  // 預設下品，未來可由文位/工具加成升級
                    });
                }
            }
        },

        overdueLevel: function (overdueMs, fullWindow) {
            if (overdueMs <= fullWindow)       return 0;
            if (overdueMs <= 2 * fullWindow)   return 1;
            if (overdueMs <= 4 * fullWindow)   return 2;
            return 3; // 直降下品
        },

        /* =====================================================
         * HUD 更新
         * ===================================================== */
        refreshHUD: function () {
            if (!this.data || !this.overlay) return;
            const silverEl = this.overlay.querySelector('#fmHudSilver');
            const rankEl   = this.overlay.querySelector('#fmHudRank');
            const timeEl   = this.overlay.querySelector('#fmHudTime');
            if (silverEl) silverEl.textContent = this.fmtSilver(this.data.silver);
            if (rankEl)   rankEl.textContent   = this.currentRank();
            if (timeEl)   timeEl.textContent   = this.currentShichen();
        },

        currentRank: function () {
            const passed = (this.data.ranks && this.data.ranks.passed) || [];
            if (passed.length === 0) {
                // 沒通過任何考試 → 用 ScoreManager 的 globalRank（積分代理）
                try {
                    if (window.ScoreManager) {
                        const pd = window.ScoreManager.loadPlayerData();
                        return pd.globalRank || '書僮';
                    }
                } catch (e) { /* ignore */ }
                return '書僮';
            }
            return passed[passed.length - 1];
        },

        currentShichen: function () {
            const h = new Date().getHours();
            const map = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
            return map[Math.floor(((h + 1) % 24) / 2)] + '時';
        },

        fmtSilver: function (s) {
            s = Math.floor(s || 0);
            if (s >= 1000) return (Math.floor(s / 100) / 10).toFixed(1) + ' 兩';
            return s + ' 文';
        },

        /* =====================================================
         * 等角投影
         * ===================================================== */
        ISO_TILE_W: 64,
        ISO_TILE_H: 32,
        ORIGIN_X: 240,
        ORIGIN_Y: 250,

        iso: function (gx, gy) {
            const sx = this.ORIGIN_X + (gx - gy) * (this.ISO_TILE_W / 2) * this.camera.scale + this.camera.x;
            const sy = this.ORIGIN_Y + (gx + gy) * (this.ISO_TILE_H / 2) * this.camera.scale + this.camera.y;
            return { x: sx, y: sy };
        },

        /* =====================================================
         * 渲染
         * ===================================================== */
        draw: function () {
            const ctx = this.ctx;
            const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
            ctx.clearRect(0, 0, w, h);

            // 背景天井（草地紋）
            ctx.save();
            this.objects = [];

            // 繪製 9×9 地磚
            for (let gy = -4; gy <= 4; gy++) {
                for (let gx = -4; gx <= 4; gx++) {
                    this.drawTile(gx, gy);
                }
            }

            // 四盆景
            const potPos = [ [-3, -1], [-2, -1], [-1, -1], [0, -1] ];
            this.data.plots.forEach((p, i) => this.drawPot(p, i, potPos[i][0], potPos[i][1]));

            // 兩茶圃
            const teaPos = [ [-3, 1], [-2, 1] ];
            this.data.teas.forEach((t, i) => this.drawTea(t, i, teaPos[i][0], teaPos[i][1]));

            // 三酒甕
            const winePos = [ [1, -1], [2, -1], [3, -1] ];
            this.data.wines.forEach((w, i) => this.drawWine(w, i, winePos[i][0], winePos[i][1]));

            // 書桌
            this.drawScribeDesk(0, 1);

            // 水井（澆水入口）
            this.drawWell(-4, 0);

            // 商店招牌
            this.drawShopSign(4, 0);

            // 考棚
            this.drawExamHall(0, -3);

            // 漢字頭書生（站中央）
            this.drawScholar(0, 0);

            ctx.restore();
        },

        drawTile: function (gx, gy) {
            const ctx = this.ctx;
            const tw = this.ISO_TILE_W * this.camera.scale;
            const th = this.ISO_TILE_H * this.camera.scale;
            const p = this.iso(gx, gy);
            ctx.beginPath();
            ctx.moveTo(p.x,         p.y);
            ctx.lineTo(p.x + tw/2,  p.y + th/2);
            ctx.lineTo(p.x,         p.y + th);
            ctx.lineTo(p.x - tw/2,  p.y + th/2);
            ctx.closePath();
            ctx.fillStyle = ((gx + gy) & 1) ? 'hsl(95, 30%, 78%)' : 'hsl(95, 30%, 82%)';
            ctx.fill();
            ctx.strokeStyle = 'hsla(95, 30%, 60%, 0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();
        },

        drawPot: function (p, idx, gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            // 盆 (棕色梯形)
            ctx.fillStyle = 'hsl(25, 50%, 38%)';
            const w = 22 * s, w2 = 16 * s, hP = 14 * s;
            ctx.beginPath();
            ctx.moveTo(pos.x - w,  pos.y);
            ctx.lineTo(pos.x + w,  pos.y);
            ctx.lineTo(pos.x + w2, pos.y + hP);
            ctx.lineTo(pos.x - w2, pos.y + hP);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = 'hsl(25, 50%, 25%)';
            ctx.stroke();
            // 植物
            if (p.kind && p.stage !== 'empty') {
                const isRipe = (p.stage === 'ripe');
                const colors = { '蘭': 'hsl(50, 70%, 60%)', '菊': 'hsl(40, 80%, 55%)', '竹': 'hsl(110, 50%, 40%)', '梅': 'hsl(0, 70%, 55%)' };
                ctx.fillStyle = colors[p.kind] || 'hsl(110, 50%, 40%)';
                const rad = isRipe ? 16 * s : (p.stage === 'flowering' ? 12 * s : 7 * s);
                ctx.beginPath();
                ctx.arc(pos.x, pos.y - rad / 2, rad, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = 'hsl(0, 60%, 26%)';
                ctx.font = (10 * s).toFixed(0) + 'px serif';
                ctx.textAlign = 'center';
                ctx.fillText(p.kind, pos.x, pos.y - rad - 3);
                if (isRipe) {
                    // 成熟金光
                    ctx.fillStyle = 'hsla(48, 100%, 60%, 0.5)';
                    ctx.beginPath();
                    ctx.arc(pos.x, pos.y - rad/2, rad + 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else {
                ctx.fillStyle = 'hsl(0, 30%, 40%)';
                ctx.font = (10 * s).toFixed(0) + 'px serif';
                ctx.textAlign = 'center';
                ctx.fillText('空盆', pos.x, pos.y - 4);
            }
            this.objects.push({ type: 'pot', idx, hit: { x: pos.x - w, y: pos.y - 32 * s, w: w * 2, h: 50 * s } });
        },

        drawTea: function (t, idx, gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            ctx.fillStyle = 'hsl(110, 35%, 30%)';
            ctx.fillRect(pos.x - 16 * s, pos.y - 4 * s, 32 * s, 12 * s);
            if (t.kind && t.stage !== 'empty') {
                ctx.fillStyle = 'hsl(110, 60%, 35%)';
                const bumps = 3;
                for (let i = 0; i < bumps; i++) {
                    ctx.beginPath();
                    ctx.arc(pos.x - 10 * s + i * 10 * s, pos.y - 2 * s, 5 * s, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = 'hsl(0, 60%, 26%)';
                ctx.font = (10 * s).toFixed(0) + 'px serif';
                ctx.textAlign = 'center';
                ctx.fillText(t.kind + (t.stage === 'pickable' ? '★' : t.stage === 'drying' ? '☉' : ''), pos.x, pos.y - 12 * s);
            } else {
                ctx.fillStyle = 'hsl(0, 30%, 40%)';
                ctx.font = (10 * s).toFixed(0) + 'px serif';
                ctx.textAlign = 'center';
                ctx.fillText('茶圃', pos.x, pos.y - 8 * s);
            }
            this.objects.push({ type: 'tea', idx, hit: { x: pos.x - 18 * s, y: pos.y - 16 * s, w: 36 * s, h: 32 * s } });
        },

        drawWine: function (w, idx, gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            // 酒甕
            ctx.fillStyle = 'hsl(25, 35%, 28%)';
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y - 6 * s, 12 * s, 16 * s, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'hsl(25, 40%, 18%)';
            ctx.stroke();
            ctx.fillStyle = 'hsl(0, 60%, 26%)';
            ctx.font = (10 * s).toFixed(0) + 'px serif';
            ctx.textAlign = 'center';
            if (w.kind && w.stage !== 'empty') {
                ctx.fillText(w.kind + (w.stage === 'open' ? '★' : ''), pos.x, pos.y - 22 * s);
            } else {
                ctx.fillStyle = 'hsl(0, 30%, 70%)';
                ctx.fillText('空甕', pos.x, pos.y - 22 * s);
            }
            this.objects.push({ type: 'wine', idx, hit: { x: pos.x - 14 * s, y: pos.y - 28 * s, w: 28 * s, h: 36 * s } });
        },

        drawScribeDesk: function (gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            ctx.fillStyle = 'hsl(25, 50%, 32%)';
            ctx.fillRect(pos.x - 22 * s, pos.y - 10 * s, 44 * s, 18 * s);
            ctx.strokeStyle = 'hsl(25, 50%, 20%)';
            ctx.strokeRect(pos.x - 22 * s, pos.y - 10 * s, 44 * s, 18 * s);
            ctx.fillStyle = '#fdfaf6';
            ctx.fillRect(pos.x - 18 * s, pos.y - 7 * s, 36 * s, 10 * s);
            ctx.fillStyle = 'hsl(0, 60%, 26%)';
            ctx.font = (10 * s).toFixed(0) + 'px serif';
            ctx.textAlign = 'center';
            const cnt = (this.data.scribe.books || []).length;
            ctx.fillText('書桌 ' + cnt + '/' + (this.data.scribe.deskCap || 1), pos.x, pos.y - 14 * s);
            this.objects.push({ type: 'scribe', hit: { x: pos.x - 22 * s, y: pos.y - 16 * s, w: 44 * s, h: 28 * s } });
        },

        drawWell: function (gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            ctx.fillStyle = 'hsl(210, 50%, 45%)';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 16 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'hsl(0, 0%, 30%)';
            ctx.lineWidth = 2 * s;
            ctx.stroke();
            ctx.fillStyle = 'hsl(0, 60%, 26%)';
            ctx.font = (10 * s).toFixed(0) + 'px serif';
            ctx.textAlign = 'center';
            ctx.fillText('井', pos.x, pos.y - 22 * s);
            this.objects.push({ type: 'well', hit: { x: pos.x - 16 * s, y: pos.y - 24 * s, w: 32 * s, h: 40 * s } });
        },

        drawShopSign: function (gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            ctx.fillStyle = 'hsl(0, 60%, 36%)';
            ctx.fillRect(pos.x - 18 * s, pos.y - 30 * s, 36 * s, 28 * s);
            ctx.fillStyle = '#fdfaf6';
            ctx.font = (12 * s).toFixed(0) + 'px serif';
            ctx.textAlign = 'center';
            ctx.fillText('商', pos.x, pos.y - 18 * s);
            ctx.fillText('店', pos.x, pos.y - 6 * s);
            this.objects.push({ type: 'shop', hit: { x: pos.x - 18 * s, y: pos.y - 30 * s, w: 36 * s, h: 36 * s } });
        },

        drawExamHall: function (gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            ctx.fillStyle = 'hsl(36, 50%, 70%)';
            ctx.fillRect(pos.x - 30 * s, pos.y - 24 * s, 60 * s, 28 * s);
            ctx.fillStyle = 'hsl(0, 60%, 36%)';
            ctx.fillRect(pos.x - 32 * s, pos.y - 30 * s, 64 * s, 8 * s);
            ctx.fillStyle = '#fdfaf6';
            ctx.font = (11 * s).toFixed(0) + 'px serif';
            ctx.textAlign = 'center';
            ctx.fillText('考棚', pos.x, pos.y - 8 * s);
            this.objects.push({ type: 'exam', hit: { x: pos.x - 32 * s, y: pos.y - 32 * s, w: 64 * s, h: 38 * s } });
        },

        drawScholar: function (gx, gy) {
            const ctx = this.ctx;
            const pos = this.iso(gx, gy);
            const s = this.camera.scale;
            // 身體（青布長衫）
            ctx.fillStyle = 'hsl(210, 30%, 35%)';
            ctx.beginPath();
            ctx.moveTo(pos.x - 10 * s, pos.y - 8 * s);
            ctx.lineTo(pos.x + 10 * s, pos.y - 8 * s);
            ctx.lineTo(pos.x + 14 * s, pos.y + 18 * s);
            ctx.lineTo(pos.x - 14 * s, pos.y + 18 * s);
            ctx.closePath();
            ctx.fill();
            // 漢字頭
            ctx.fillStyle = 'hsl(36, 40%, 88%)';
            ctx.beginPath();
            ctx.arc(pos.x, pos.y - 22 * s, 16 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'hsl(0, 0%, 15%)';
            ctx.font = 'bold ' + (22 * s).toFixed(0) + 'px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.playerSurname || '林', pos.x, pos.y - 22 * s);
            ctx.textBaseline = 'alphabetic';
        },

        /* =====================================================
         * 輸入處理：點擊 / 拖曳 / pinch
         * ===================================================== */
        attachInput: function () {
            const c = this.canvas;
            const self = this;
            this.gestures = { mode: 'idle', lastX: 0, lastY: 0, startDist: 0, startScale: 1, downX: 0, downY: 0, downTs: 0 };

            // 將事件座標轉成 canvas-local CSS 像素（抵銷外層 container 的 transform: scale）
            const toLocal = (clientX, clientY) => {
                const r = c.getBoundingClientRect();
                const sx = r.width ? (c.clientWidth / r.width) : 1;
                const sy = r.height ? (c.clientHeight / r.height) : 1;
                return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
            };

            const onStart = (touches) => {
                if (touches.length === 1) {
                    this.gestures.mode = 'pan';
                    this.gestures.lastX = touches[0].x;
                    this.gestures.lastY = touches[0].y;
                    this.gestures.downX = touches[0].x;
                    this.gestures.downY = touches[0].y;
                    this.gestures.downTs = Date.now();
                    c.classList.add('grabbing');
                } else if (touches.length === 2) {
                    this.gestures.mode = 'pinch';
                    const dx = touches[1].x - touches[0].x;
                    const dy = touches[1].y - touches[0].y;
                    this.gestures.startDist = Math.sqrt(dx*dx + dy*dy);
                    this.gestures.startScale = this.camera.scale;
                }
            };
            const onMove = (touches) => {
                if (this.gestures.mode === 'pan' && touches.length === 1) {
                    const dx = touches[0].x - this.gestures.lastX;
                    const dy = touches[0].y - this.gestures.lastY;
                    this.camera.x += dx;
                    this.camera.y += dy;
                    this.gestures.lastX = touches[0].x;
                    this.gestures.lastY = touches[0].y;
                } else if (this.gestures.mode === 'pinch' && touches.length === 2) {
                    const dx = touches[1].x - touches[0].x;
                    const dy = touches[1].y - touches[0].y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (this.gestures.startDist > 0) {
                        const ratio = dist / this.gestures.startDist;
                        const ns = Math.max(this.camera.minScale, Math.min(this.camera.maxScale, this.gestures.startScale * ratio));
                        this.camera.scale = ns;
                    }
                }
            };
            const onEnd = (touches) => {
                // 短按視為點擊（移動小於 8px 且時間 < 250ms）
                if (this.gestures.mode === 'pan' && touches.length === 0) {
                    const dx = this.gestures.lastX - this.gestures.downX;
                    const dy = this.gestures.lastY - this.gestures.downY;
                    const dt = Date.now() - this.gestures.downTs;
                    if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && dt < 250) {
                        self.handleClick(this.gestures.downX, this.gestures.downY);
                    }
                }
                c.classList.remove('grabbing');
                this.gestures.mode = 'idle';
            };

            c.addEventListener('mousedown', e => {
                onStart([ toLocal(e.clientX, e.clientY) ]);
                e.preventDefault();
            });
            window.addEventListener('mousemove', e => {
                if (this.gestures.mode !== 'pan') return;
                onMove([ toLocal(e.clientX, e.clientY) ]);
            });
            window.addEventListener('mouseup', e => {
                if (this.gestures.mode !== 'pan') return;
                onEnd([]);
            });

            c.addEventListener('touchstart', e => {
                const ts = Array.from(e.touches).map(t => toLocal(t.clientX, t.clientY));
                onStart(ts);
                e.preventDefault();
            }, { passive: false });
            c.addEventListener('touchmove', e => {
                const ts = Array.from(e.touches).map(t => toLocal(t.clientX, t.clientY));
                onMove(ts);
                e.preventDefault();
            }, { passive: false });
            c.addEventListener('touchend', e => {
                const ts = Array.from(e.touches).map(t => toLocal(t.clientX, t.clientY));
                onEnd(ts);
                e.preventDefault();
            });

            // 桌面：滾輪縮放
            c.addEventListener('wheel', e => {
                const delta = e.deltaY < 0 ? 1.1 : 0.9;
                this.camera.scale = Math.max(this.camera.minScale,
                    Math.min(this.camera.maxScale, this.camera.scale * delta));
                e.preventDefault();
            }, { passive: false });
        },

        handleClick: function (sx, sy) {
            // 從尾巴往前掃，後繪製的優先（書生疊在地磚上）
            for (let i = this.objects.length - 1; i >= 0; i--) {
                const o = this.objects[i];
                if (sx >= o.hit.x && sx <= o.hit.x + o.hit.w &&
                    sy >= o.hit.y && sy <= o.hit.y + o.hit.h) {
                    this.onObjectClick(o);
                    return;
                }
            }
        },

        onObjectClick: function (o) {
            switch (o.type) {
                case 'pot':    return this.openPotMenu(o.idx);
                case 'tea':    return this.openTeaMenu(o.idx);
                case 'wine':   return this.openWineMenu(o.idx);
                case 'well':   return this.waterAll();
                case 'scribe': return this.openScribeMenu();
                case 'shop':   return this.openShop();
                case 'exam':   return this.openExam();
            }
        },

        /* =====================================================
         * 互動操作（盆景、茶、酒、抄書、商店、考試）
         * ===================================================== */
        waterAll: function () {
            const now = Date.now();
            const hh = new Date().getHours();
            const isNight = (hh >= NIGHT_START_H) || (hh < NIGHT_END_H);
            let watered = 0;
            this.data.plots.forEach(p => {
                if (p.kind && p.stage !== 'empty') {
                    const due = (now - (p.lastWaterTs || 0)) >= WATER_INTERVAL;
                    if (due) { p.lastWaterTs = now; watered++; }
                }
            });
            this.data.teas.forEach(t => {
                if (t.kind && t.stage === 'growing') {
                    const due = (now - (t.lastWaterTs || 0)) >= WATER_INTERVAL;
                    if (due) { t.lastWaterTs = now; watered++; }
                }
            });
            this.showToast(watered > 0
                ? '已澆水 ' + watered + ' 處' + (isNight ? '（夜安息）' : '')
                : '尚未到澆水時辰');
            window.FMCollectionSave.save(this.data);
        },

        openPotMenu: function (idx) {
            const p = this.data.plots[idx];
            const def = p.kind ? POT_KINDS[p.kind] : null;
            let html = '<div class="fm-collection-popup-title">第 ' + (idx + 1) + ' 號花盆</div>';
            if (!p.kind || p.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">空盆，請至商店買種子。</div>';
            } else {
                html += '<div class="fm-collection-popup-row"><span>' + p.kind + '</span><span>' + p.seedTier + ' 種</span></div>';
                html += '<div class="fm-collection-popup-row"><span>狀態</span><span>' + this.potStageLabel(p) + '</span></div>';
                if (p.stage === 'ripe') {
                    html += '<button class="fm-collection-popup-btn" data-act="harvest" data-idx="' + idx + '">採收</button>';
                }
                html += '<button class="fm-collection-popup-btn" data-act="remove" data-idx="' + idx + '">移除</button>';
            }
            this.showPopup(html, e => {
                const act = e.target.getAttribute('data-act');
                if (act === 'harvest') this.harvestPot(idx);
                else if (act === 'remove') { this.data.plots[idx] = window.FMCollectionSave.emptyPlot(); window.FMCollectionSave.save(this.data); }
                this.hidePopup();
            });
        },

        potStageLabel: function (p) {
            const map = { seedling:'萌芽', budding:'含苞', flowering:'盛開中', ripe:'可採收 ★' };
            return map[p.stage] || p.stage;
        },

        harvestPot: function (idx) {
            const p = this.data.plots[idx];
            if (!p.kind || p.stage !== 'ripe') return;
            const def = POT_KINDS[p.kind];
            const tier = this.rollTier(p.seedTier, p.overdueLevel || 0);
            const price = def.prices[tier][1];
            this.data.silver += price;
            // 入庫
            const ikey = p.kind + '_' + tier;
            this.data.inventory[ikey] = (this.data.inventory[ikey] || 0) + 1;
            // 重置
            this.data.plots[idx] = window.FMCollectionSave.emptyPlot();
            this.showToast('採得 ' + p.kind + '（' + tier + '），售 ' + price + ' 文');
            window.FMCollectionSave.save(this.data);
        },

        openTeaMenu: function (idx) {
            const t = this.data.teas[idx];
            let html = '<div class="fm-collection-popup-title">茶圃 ' + (idx + 1) + '</div>';
            if (!t.kind || t.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">空圃，請至商店買茶種。</div>';
            } else {
                html += '<div class="fm-collection-popup-row"><span>' + t.kind + '</span><span>' + t.seedTier + ' 種</span></div>';
                html += '<div class="fm-collection-popup-row"><span>狀態</span><span>' + this.teaStageLabel(t) + '</span></div>';
                if (t.stage === 'pickable') {
                    html += '<button class="fm-collection-popup-btn" data-act="pick" data-idx="' + idx + '">採茶</button>';
                } else if (t.stage === 'drying') {
                    html += '<button class="fm-collection-popup-btn" data-act="dry" data-idx="' + idx + '">入庫（烘焙完成）</button>';
                }
            }
            this.showPopup(html, e => {
                const act = e.target.getAttribute('data-act');
                if (act === 'pick')  this.pickTea(idx);
                else if (act === 'dry') this.finishTea(idx);
                this.hidePopup();
            });
        },

        teaStageLabel: function (t) {
            const map = { growing:'生長中', pickable:'可採摘 ★', drying:'烘焙中' };
            return map[t.stage] || t.stage;
        },

        pickTea: function (idx) {
            const t = this.data.teas[idx];
            if (!t.kind || t.stage !== 'pickable') return;
            t.stage = 'drying';
            t.dryStartTs = Date.now();
            t.dryOverdueLevel = 0;
            window.FMCollectionSave.save(this.data);
        },

        finishTea: function (idx) {
            const t = this.data.teas[idx];
            if (!t.kind || t.stage !== 'drying') return;
            const def = TEA_KINDS[t.kind];
            const tier = this.rollTier(t.seedTier, t.dryOverdueLevel || 0);
            const price = def.prices[tier][1];
            this.data.silver += price;
            const ikey = t.kind + '_' + tier;
            this.data.inventory[ikey] = (this.data.inventory[ikey] || 0) + 1;
            this.data.teas[idx] = window.FMCollectionSave.emptyTea();
            this.showToast('烘得 ' + t.kind + '（' + tier + '），售 ' + price + ' 文');
            window.FMCollectionSave.save(this.data);
        },

        openWineMenu: function (idx) {
            const w = this.data.wines[idx];
            let html = '<div class="fm-collection-popup-title">酒甕 ' + (idx + 1) + '</div>';
            if (!w.kind || w.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">空甕，請至商店買米。</div>';
            } else {
                html += '<div class="fm-collection-popup-row"><span>' + w.kind + '</span><span>' + w.riceTier + ' 米</span></div>';
                html += '<div class="fm-collection-popup-row"><span>狀態</span><span>' + (w.stage === 'open' ? '可開甕 ★' : '釀製中') + '</span></div>';
                if (w.stage === 'open') {
                    html += '<button class="fm-collection-popup-btn" data-act="open" data-idx="' + idx + '">開甕入庫</button>';
                }
            }
            this.showPopup(html, e => {
                const act = e.target.getAttribute('data-act');
                if (act === 'open') this.openWine(idx);
                this.hidePopup();
            });
        },

        openWine: function (idx) {
            const w = this.data.wines[idx];
            if (!w.kind || w.stage !== 'open') return;
            const def = WINE_KINDS[w.kind];
            const tier = this.rollTier(w.riceTier, w.openOverdueLevel || 0);
            const price = def.prices[tier][1];
            this.data.silver += price;
            const ikey = w.kind + '_' + tier;
            this.data.inventory[ikey] = (this.data.inventory[ikey] || 0) + 1;
            this.data.wines[idx] = window.FMCollectionSave.emptyWine();
            this.showToast('得 ' + w.kind + '（' + tier + '），售 ' + price + ' 文');
            window.FMCollectionSave.save(this.data);
        },

        openScribeMenu: function () {
            const s = this.data.scribe;
            let html = '<div class="fm-collection-popup-title">書桌</div>';
            html += '<div class="fm-collection-popup-row"><span>書桌容量</span><span>' + (s.deskCap || 1) + ' 本</span></div>';
            html += '<div class="fm-collection-popup-row"><span>已完成</span><span>' + (s.books || []).length + ' 本</span></div>';
            if ((s.books || []).length > 0) {
                html += '<button class="fm-collection-popup-btn" data-act="claimAll">全部取回入庫</button>';
            } else {
                html += '<div class="fm-collection-popup-row" style="color:#888">尚無完成的抄本，每小時會自動完成 1 本（上限為書桌容量）。</div>';
            }
            this.showPopup(html, e => {
                const act = e.target.getAttribute('data-act');
                if (act === 'claimAll') this.claimScribe();
                this.hidePopup();
            });
        },

        claimScribe: function () {
            const s = this.data.scribe;
            if (!s.books || s.books.length === 0) return;
            let total = 0;
            s.books.forEach(b => {
                const def = SCRIBE_KINDS[b.kind] || SCRIBE_KINDS['四書'];
                const price = def.prices[b.tier][1];
                total += price;
                const ikey = b.kind + '_' + b.tier;
                this.data.inventory[ikey] = (this.data.inventory[ikey] || 0) + 1;
            });
            this.data.silver += total;
            s.books = [];
            s.lastClaimTs = Date.now();
            this.showToast('取回抄本，共得 ' + total + ' 文');
            window.FMCollectionSave.save(this.data);
        },

        /* ---- 種子 → 成品品級擲骰 ---- */
        rollTier: function (seedTier, overdueLevel) {
            const dist = TIER_ROLL[seedTier] || TIER_ROLL['下品'];
            const r = Math.random();
            let acc = 0, picked = 0;
            for (let i = 0; i < dist.length; i++) {
                acc += dist[i];
                if (r < acc) { picked = i; break; }
            }
            // 逾時降品
            picked = Math.max(0, picked - (overdueLevel || 0));
            return TIERS[picked];
        },

        /* =====================================================
         * 商店
         * ===================================================== */
        openShop: function () {
            this.hidePopup();
            this.hideShop();
            const shop = document.createElement('div');
            shop.className = 'fm-collection-shop';
            shop.id = 'fmCollectionShop';
            shop.innerHTML = `
                <div class="fm-collection-shop-header">
                    <span>商店</span>
                    <span style="cursor:pointer" id="fmShopClose">✕</span>
                </div>
                <div class="fm-collection-shop-tabs">
                    <div class="fm-collection-shop-tab active" data-cat="pot">花種</div>
                    <div class="fm-collection-shop-tab" data-cat="tea">茶種</div>
                    <div class="fm-collection-shop-tab" data-cat="wine">米</div>
                    <div class="fm-collection-shop-tab" data-cat="inv">出售存貨</div>
                </div>
                <div class="fm-collection-shop-body" id="fmShopBody"></div>`;
            this.overlay.querySelector('#fmCollectionStage').appendChild(shop);
            shop.querySelector('#fmShopClose').addEventListener('click', () => this.hideShop());
            shop.querySelectorAll('.fm-collection-shop-tab').forEach(t => {
                t.addEventListener('click', () => {
                    shop.querySelectorAll('.fm-collection-shop-tab').forEach(x => x.classList.remove('active'));
                    t.classList.add('active');
                    this.renderShopBody(t.getAttribute('data-cat'));
                });
            });
            this.renderShopBody('pot');
        },

        hideShop: function () {
            const old = this.overlay && this.overlay.querySelector('#fmCollectionShop');
            if (old) old.remove();
        },

        renderShopBody: function (cat) {
            const body = this.overlay.querySelector('#fmShopBody');
            if (!body) return;
            const self = this;
            body.innerHTML = '';
            if (cat === 'pot' || cat === 'tea' || cat === 'wine') {
                const kinds = (cat === 'pot') ? POT_KINDS : (cat === 'tea') ? TEA_KINDS : WINE_KINDS;
                Object.keys(kinds).forEach(name => {
                    const def = kinds[name];
                    TIERS.forEach(tier => {
                        const seedPrice = def.prices[tier][0];
                        const row = document.createElement('div');
                        row.className = 'fm-collection-shop-row';
                        row.innerHTML =
                            '<span class="fm-collection-shop-name ' +
                            'fm-collection-shop-tier-' + tier + '">' + name + ' · ' + tier + (cat === 'wine' ? '米' : '種') + '</span>' +
                            '<span class="fm-collection-shop-price">' + seedPrice + ' 文</span>';
                        const btn = document.createElement('button');
                        btn.className = 'fm-collection-shop-btn';
                        btn.textContent = '購買';
                        if (self.data.silver < seedPrice) btn.disabled = true;
                        btn.addEventListener('click', () => self.buy(cat, name, tier, seedPrice));
                        row.appendChild(btn);
                        body.appendChild(row);
                    });
                });
            } else if (cat === 'inv') {
                const keys = Object.keys(this.data.inventory).filter(k => this.data.inventory[k] > 0);
                if (keys.length === 0) {
                    body.innerHTML = '<div style="color:#888;text-align:center;padding:20px">尚無存貨。</div>';
                    return;
                }
                keys.forEach(k => {
                    const [name, tier] = k.split('_');
                    const def = POT_KINDS[name] || TEA_KINDS[name] || WINE_KINDS[name] || SCRIBE_KINDS[name];
                    if (!def) return;
                    const price = def.prices[tier][1];
                    const cnt = this.data.inventory[k];
                    const row = document.createElement('div');
                    row.className = 'fm-collection-shop-row';
                    row.innerHTML =
                        '<span class="fm-collection-shop-name fm-collection-shop-tier-' + tier + '">' + name + ' · ' + tier + ' ×' + cnt + '</span>' +
                        '<span class="fm-collection-shop-price">' + price + ' 文/件</span>';
                    const btn = document.createElement('button');
                    btn.className = 'fm-collection-shop-btn';
                    btn.textContent = '賣出 1';
                    btn.addEventListener('click', () => {
                        this.data.inventory[k]--;
                        if (this.data.inventory[k] <= 0) delete this.data.inventory[k];
                        this.data.silver += price;
                        window.FMCollectionSave.save(this.data);
                        this.renderShopBody('inv');
                        this.refreshHUD();
                        this.showToast('賣出 ' + name + ' ' + tier + '，得 ' + price + ' 文');
                    });
                    row.appendChild(btn);
                    body.appendChild(row);
                });
            }
        },

        buy: function (cat, name, tier, seedPrice) {
            if (this.data.silver < seedPrice) {
                this.showToast('盤纏不足');
                return;
            }
            // 找空槽
            let slot = -1;
            if (cat === 'pot') slot = this.data.plots.findIndex(p => !p.kind || p.stage === 'empty');
            else if (cat === 'tea') slot = this.data.teas.findIndex(t => !t.kind || t.stage === 'empty');
            else if (cat === 'wine') slot = this.data.wines.findIndex(w => !w.kind || w.stage === 'empty');
            if (slot < 0) { this.showToast('已無空位'); return; }
            this.data.silver -= seedPrice;
            const now = Date.now();
            if (cat === 'pot') {
                this.data.plots[slot] = { kind: name, seedTier: tier, plantedTs: now, lastWaterTs: now, missedWater: 0, stage: 'seedling' };
            } else if (cat === 'tea') {
                this.data.teas[slot] = { kind: name, seedTier: tier, plantedTs: now, lastWaterTs: now, missedWater: 0, stage: 'growing', dryStartTs: 0 };
            } else if (cat === 'wine') {
                this.data.wines[slot] = { kind: name, riceTier: tier, startTs: now, stage: 'brewing' };
            }
            window.FMCollectionSave.save(this.data);
            this.refreshHUD();
            this.renderShopBody(cat);
            this.showToast('已種 ' + name + ' ' + tier);
        },

        /* =====================================================
         * 考試（雙鉤子）
         * ===================================================== */
        openExam: function () {
            this.hidePopup();
            const score = this.getCurrentScore();
            const nextRank = this.nextExamRank();
            let html = '<div class="fm-collection-popup-title">考棚</div>';
            html += '<div class="fm-collection-popup-row"><span>目前積分</span><span>' + score.toLocaleString() + '</span></div>';
            if (!nextRank) {
                html += '<div class="fm-collection-popup-row">已達狀元極位，無更高功名可考。</div>';
            } else {
                const fee = EXAM_FEES[nextRank.name];
                const need = nextRank.minScore;
                html += '<div class="fm-collection-popup-row"><span>下一文位</span><span>' + nextRank.name + '</span></div>';
                html += '<div class="fm-collection-popup-row"><span>積分門檻</span><span>' + need.toLocaleString() + '</span></div>';
                html += '<div class="fm-collection-popup-row"><span>入場費</span><span>' + fee + ' 文</span></div>';
                const okScore = (score >= need);
                const okSilver = (this.data.silver >= fee);
                if (!okScore) {
                    html += '<div class="fm-collection-popup-row" style="color:#888">學問未足，請再勤工。</div>';
                } else if (!okSilver) {
                    html += '<div class="fm-collection-popup-row" style="color:#aa3">學問已成，盤纏未足。請再勤工或變賣盆中之物。</div>';
                } else {
                    html += '<button class="fm-collection-popup-btn" data-act="exam">報考 ' + nextRank.name + '（扣 ' + fee + ' 文）</button>';
                }
            }
            this.showPopup(html, e => {
                if (e.target.getAttribute('data-act') === 'exam') this.takeExam(nextRank);
                this.hidePopup();
            });
        },

        getCurrentScore: function () {
            try {
                if (window.ScoreManager) {
                    const pd = window.ScoreManager.loadPlayerData();
                    return pd.totalScore || 0;
                }
            } catch (e) { /* ignore */ }
            return 0;
        },

        nextExamRank: function () {
            // 找下一個尚未通過的、玩家積分可能達到的文位
            const passed = this.data.ranks.passed || [];
            const ranks = (window.ScoreManager && window.ScoreManager.ranks) || [];
            // 從 ranks 中找第一個尚未通過、且名字在 EXAM_RANKS_ORDER 內的
            for (const r of ranks) {
                if (EXAM_RANKS_ORDER.indexOf(r.name) >= 0 && passed.indexOf(r.name) < 0) {
                    return r;
                }
            }
            return null;
        },

        takeExam: function (rank) {
            const fee = EXAM_FEES[rank.name];
            if (this.data.silver < fee) { this.showToast('盤纏不足'); return; }
            this.data.silver -= fee;
            // 命中率：依目前積分相對於門檻的比例（門檻 +0% ~ +50% 之間線性遞增）
            const score = this.getCurrentScore();
            const ratio = score / rank.minScore;  // ≥ 1
            const passProb = Math.min(0.95, Math.max(0.4, 0.4 + (ratio - 1) * 0.5));
            const pass = (Math.random() < passProb);
            this.data.examLog.push({ rank: rank.name, ts: Date.now(), pass });
            if (pass) {
                this.data.ranks.passed.push(rank.name);
                this.showToast('金榜題名！晉升 ' + rank.name);
            } else {
                this.showToast('名落孫山，扣費 ' + fee + ' 文，可再試。');
            }
            window.FMCollectionSave.save(this.data);
            this.refreshHUD();
        },

        /* =====================================================
         * 浮層工具：popup / toast
         * ===================================================== */
        showPopup: function (html, onClick) {
            this.hidePopup();
            const stage = this.overlay.querySelector('#fmCollectionStage');
            const popup = document.createElement('div');
            popup.className = 'fm-collection-popup';
            popup.id = 'fmCollectionPopup';
            popup.style.left = '50%';
            popup.style.top = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
            popup.innerHTML = html + '<button class="fm-collection-popup-btn" data-act="close" style="background:#888;margin-top:6px">關閉</button>';
            stage.appendChild(popup);
            popup.addEventListener('click', e => {
                if (e.target.getAttribute('data-act') === 'close') { this.hidePopup(); return; }
                if (onClick) onClick(e);
            });
        },

        hidePopup: function () {
            const old = this.overlay && this.overlay.querySelector('#fmCollectionPopup');
            if (old) old.remove();
        },

        showToast: function (msg) {
            if (!this.toast) return;
            this.toast.textContent = msg;
            this.toast.classList.add('show');
            if (this.toastTimer) clearTimeout(this.toastTimer);
            this.toastTimer = setTimeout(() => this.toast.classList.remove('show'), 2200);
        }
    };

    window.CollectionDialog = CollectionDialog;
})();
