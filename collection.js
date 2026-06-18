/**
 * 江南小院（收集系統）— 主場景與遊戲循環
 * 依專案規範：所有 class 加 fm-collection 前綴；不直呼 localStorage
 *
 * ───────────────────────────────────────────────────────────
 * 高效能渲染架構（為「大量 sprite」最佳化，純 Canvas2D 零依賴）
 * ───────────────────────────────────────────────────────────
 *  1. world-space 相機：整個世界用 ctx.translate + ctx.scale 一次套用。
 *  2. 靜態背景烘焙：地磚畫進一張離屏 bitmap，每幀 1 次 drawImage。
 *  3. sprite atlas 預烘焙（含 DPR×2 倍率，文字/圖案不糊）：
 *       (key + 種類 + 狀態) 第一次出現時烘焙，之後 drawImage。
 *  4. dirty-flag + requestAnimationFrame：閒置時 0 繪製，需要時才畫。
 *  5. 視口裁剪：螢幕外 sprite 跳過。
 *
 *  ※ sprite 量級若進入「萬」級可換 WebGL（PixiJS），遊戲邏輯與渲染解耦。
 *
 * 公開：window.CollectionDialog.show() / hide()
 */
(function () {
    'use strict';

    /* =====================================================
     * 常數定義（依《收集系統企畫書六版》§5.7）
     * ===================================================== */
    const TIERS = ['下品', '中品', '上品', '極品'];

    const TIER_ROLL = {
        '下品': [0.60, 0.30, 0.08, 0.02],
        '中品': [0.20, 0.50, 0.25, 0.05],
        '上品': [0.05, 0.25, 0.55, 0.15],
        '極品': [0.02, 0.08, 0.30, 0.60]
    };

    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;

    const POT_KINDS = {
        '蘭': { period: 1 * DAY, harvestWindow: 12 * HOUR, prices: { '下品':[20,80],   '中品':[40,160],  '上品':[80,320],  '極品':[160,640] } },
        '菊': { period: 1 * DAY, harvestWindow: 12 * HOUR, prices: { '下品':[20,80],   '中品':[40,160],  '上品':[80,320],  '極品':[160,640] } },
        '竹': { period: 3 * DAY, harvestWindow: 18 * HOUR, prices: { '下品':[60,240],  '中品':[120,480], '上品':[240,960], '極品':[480,1920] } },
        '梅': { period: 7 * DAY, harvestWindow: 24 * HOUR, prices: { '下品':[140,560], '中品':[280,1120],'上品':[560,2240],'極品':[1120,4480] } }
    };

    const TEA_KINDS = {
        '龍井': { period: 1 * DAY, dryWindow: 6 * HOUR,  prices: { '下品':[8,30],  '中品':[15,60],  '上品':[30,120],  '極品':[60,240] } },
        '烏龍': { period: 3 * DAY, dryWindow: 12 * HOUR, prices: { '下品':[25,100],'中品':[50,200], '上品':[100,400], '極品':[200,800] } },
        '紅茶': { period: 7 * DAY, dryWindow: 18 * HOUR, prices: { '下品':[60,240],'中品':[120,480],'上品':[240,960], '極品':[480,1920] } }
    };

    const WINE_KINDS = {
        '米酒':   { period: 3 * DAY, openWindow: 24 * HOUR, prices: { '下品':[13,50], '中品':[25,100],'上品':[50,200], '極品':[100,400] } },
        '黃酒':   { period: 5 * DAY, openWindow: 24 * HOUR, prices: { '下品':[25,100],'中品':[50,200],'上品':[100,400],'極品':[200,800] } },
        '女兒紅': { period: 7 * DAY, openWindow: 24 * HOUR, prices: { '下品':[50,200],'中品':[100,400],'上品':[200,800],'極品':[400,1600] } }
    };

    const SCRIBE_KINDS = {
        '四書': { period: 1 * HOUR, claimWindow: 6 * HOUR, prices: { '下品':[2,6], '中品':[3,12], '上品':[6,24], '極品':[12,48] } },
        '五經': { period: 1 * HOUR, claimWindow: 6 * HOUR, prices: { '下品':[3,10],'中品':[5,20], '上品':[10,40],'極品':[20,80] } }
    };

    /* 古玩：buy=展示價，sell=同價（收藏品，無投機獲利） */
    const CURIO_KINDS = {
        '筆':   { prices: { '下品':[10,10],  '中品':[25,25],  '上品':[60,60],  '極品':[140,140] } },
        '墨':   { prices: { '下品':[12,12],  '中品':[30,30],  '上品':[70,70],  '極品':[160,160] } },
        '紙':   { prices: { '下品':[8,8],    '中品':[20,20],  '上品':[50,50],  '極品':[120,120] } },
        '硯':   { prices: { '下品':[15,15],  '中品':[40,40],  '上品':[90,90],  '極品':[220,220] } },
        '印章': { prices: { '下品':[20,20],  '中品':[55,55],  '上品':[130,130],'極品':[300,300] } },
        '茶壺': { prices: { '下品':[25,25],  '中品':[70,70],  '上品':[170,170],'極品':[400,400] } },
        '茶杯': { prices: { '下品':[8,8],    '中品':[18,18],  '上品':[45,45],  '極品':[110,110] } },
        '香爐': { prices: { '下品':[30,30],  '中品':[80,80],  '上品':[200,200],'極品':[480,480] } }
    };

    const PLANT_COLORS = { '蘭': 'hsl(50, 70%, 60%)', '菊': 'hsl(40, 80%, 55%)', '竹': 'hsl(110, 50%, 40%)', '梅': 'hsl(0, 70%, 55%)' };

    const WATER_INTERVAL = 6 * HOUR;
    const NIGHT_START_H = 22, NIGHT_END_H = 6;

    const EXAM_FEES = {
        '縣案首':  300, '府案首': 600, '文童': 1200, '秀才': 2400,
        '舉人': 4800, '貢士': 9600,
        '進士': 10000, '探花': 10000, '榜眼': 10000, '狀元': 10000
    };
    const EXAM_RANKS_ORDER = ['縣案首','府案首','文童','秀才','舉人','貢士','進士','探花','榜眼','狀元'];

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

    /* 等角磚尺寸與 sprite atlas 規格（CSS 世界座標，scale=1 基準） */
    const TILE_W = 64, TILE_H = 32;
    const ATLAS_W = 96, ATLAS_H = 128, AX = 48, AY = 80;

    /* 場景固定佈局；命中框相對該磚頂點
       錯開設計：物件分散於 5 列，相鄰物件至少隔 2 格 (=64 世界 px)，避免擠在一起。
       想調整任何物件位置，改下方 gx/gy 即可（X→東南、Y→西南，等角投影）。 */
    const LAYOUT = [
        // ── 北：考棚（單獨一列，最遠處） ──
        { type: 'exam', gx:  0, gy: -5, rect: [-36, -36, 72, 44] },

        // ── 北中：4 個花盆，橫向 spread by 3 grid ──
        { type: 'pot',  idx: 0, gx: -5, gy: -3, rect: [-26, -40, 52, 58] },
        { type: 'pot',  idx: 1, gx: -2, gy: -3, rect: [-26, -40, 52, 58] },
        { type: 'pot',  idx: 2, gx:  1, gy: -3, rect: [-26, -40, 52, 58] },
        { type: 'pot',  idx: 3, gx:  4, gy: -3, rect: [-26, -40, 52, 58] },

        // ── 中央：井（西） + 商店（東） + 書生在 (0,0) ──
        { type: 'well', gx: -6, gy:  0, rect: [-18, -26, 36, 44] },
        { type: 'shop', gx:  6, gy:  0, rect: [-22, -38, 44, 46] },

        // ── 中南：釀酒 3 甕 ──
        { type: 'wine', idx: 0, gx: -4, gy:  2, rect: [-18, -32, 36, 44] },
        { type: 'wine', idx: 1, gx: -1, gy:  2, rect: [-18, -32, 36, 44] },
        { type: 'wine', idx: 2, gx:  2, gy:  2, rect: [-18, -32, 36, 44] },

        // ── 南區：茶圃 + 茶寮 ──
        { type: 'tea', idx: 0, gx: -5, gy:  4, rect: [-22, -22, 44, 36] },
        { type: 'tea', idx: 1, gx: -2, gy:  4, rect: [-22, -22, 44, 36] },
        { type: 'teaHouse', idx: 0, gx: 1, gy: 4, rect: [-22, -36, 44, 50] },
        { type: 'teaHouse', idx: 1, gx: 4, gy: 4, rect: [-22, -36, 44, 50] },

        // ── 最南：書桌 ──
        { type: 'scribe', gx: 0, gy:  6, rect: [-26, -34, 52, 44] }
    ];

    /* =====================================================
     * 主物件
     * ===================================================== */
    const CollectionDialog = {
        overlay: null,
        canvas: null,
        ctx: null,
        data: null,
        // 預設 1.5x 放大鏡頭
        camera: { x: 0, y: 0, scale: 1.5, minScale: 0.5, maxScale: 3.0 },
        originScreenX: 240,
        originScreenY: 300,
        gestures: null,
        playerSurname: '林',
        toast: null,
        toastTimer: 0,

        currentTool: 'tool',   // 'tool' | 'detail'
        hoverObj: null,

        dirty: true,
        running: false,
        raf: 0,
        simTimer: 0,
        spriteCache: {},
        bg: null,
        lastSig: '',

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
            this.buildBackground();
            this.attachInput();
        },

        show: function () {
            this.init();
            this.closePeerDialogs();
            document.body.classList.add('overlay-active');
            this.data = window.FMCollectionSave.load();
            try {
                if (window.ScoreManager) {
                    const pd = window.ScoreManager.loadPlayerData();
                    if (pd.nickname) this.playerSurname = pd.nickname.charAt(0) || '林';
                }
            } catch (e) { /* ignore */ }
            this.overlay.classList.remove('hidden');
            requestAnimationFrame(() => { this.resizeCanvas(); this.dirty = true; });
            this.refreshHUD();
            this.dirty = true;
            this.startLoop();
        },

        hide: function () {
            if (!this.overlay) return;
            this.overlay.classList.add('hidden');
            document.body.classList.remove('overlay-active');
            this.stopLoop();
            if (this.data) {
                window.FMCollectionSave.markSeen(this.data);
                window.FMCollectionSave.save(this.data);
            }
        },

        /** 開啟前關掉其他三個對話框（成就、群英榜、名人列傳） */
        closePeerDialogs: function () {
            try {
                if (window.AchievementDialog && window.AchievementDialog.overlay &&
                    !window.AchievementDialog.overlay.classList.contains('hidden')) {
                    window.AchievementDialog.hide();
                }
                if (window.LeaderboardDialog && window.LeaderboardDialog.overlay &&
                    !window.LeaderboardDialog.overlay.classList.contains('hidden')) {
                    window.LeaderboardDialog.hide();
                }
                const ab = document.getElementById('authorBioPage');
                if (window.AuthorBio && ab && !ab.classList.contains('hidden')) {
                    window.AuthorBio.hide();
                }
            } catch (e) { /* ignore */ }
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.className = 'fm-collection-overlay hidden';
            overlay.innerHTML = `
                <div class="fm-collection-container" id="fmCollectionContainer">
                    <div class="fm-collection-header">
                        <div class="fm-collection-title">江南小院</div>
                        <div class="fm-collection-close" id="fmCollectionClose">✕</div>
                    </div>
                    <div class="fm-collection-hud">
                        <div class="fm-collection-hud-cell">
                            <div id="fmHudRank">書僮</div>
                        </div>
                        <div class="fm-collection-hud-cell">
                            <div id="fmHudSilver">0 文錢</div>
                        </div>
                        <div class="fm-collection-hud-cell">
                            <div id="fmHudTime">—</div>
                        </div>
                    </div>
                    <div class="fm-collection-stage" id="fmCollectionStage">
                        <canvas class="fm-collection-canvas" id="fmCollectionCanvas"></canvas>
                        <div class="fm-collection-toolbar" id="fmCollectionToolbar">
                            <div class="fm-collection-tool-btn active" data-tool="tool" title="工具：點擊物件直接執行">🔧</div>
                            <div class="fm-collection-tool-btn" data-tool="detail" title="詳情：點擊物件查看細節">🔍</div>
                        </div>
                        <div class="fm-collection-toast" id="fmCollectionToast"></div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            this.overlay = overlay;
            this.canvas = overlay.querySelector('#fmCollectionCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.toast = overlay.querySelector('#fmCollectionToast');

            overlay.querySelector('#fmCollectionClose').addEventListener('click', () => this.hide());

            // 工具列切換
            const self = this;
            overlay.querySelectorAll('.fm-collection-tool-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    overlay.querySelectorAll('.fm-collection-tool-btn').forEach(x => x.classList.remove('active'));
                    btn.classList.add('active');
                    self.currentTool = btn.getAttribute('data-tool');
                });
            });

            const cont = overlay.querySelector('#fmCollectionContainer');
            if (window.registerOverlayResize) {
                window.registerOverlayResize(function (r) {
                    cont.style.width = (500 * 0.96) + 'px';
                    cont.style.height = (850 * 0.96) + 'px';
                    cont.style.left = (r.left + 500 * 0.02 * r.scale) + 'px';
                    cont.style.top = (r.top + 850 * 0.02 * r.scale) + 'px';
                    cont.style.transform = 'scale(' + r.scale + ')';
                    cont.style.transformOrigin = 'top left';
                    requestAnimationFrame(() => self.resizeCanvas());
                });
            }
        },

        resizeCanvas: function () {
            if (!this.canvas) return;
            const dpr = window.devicePixelRatio || 1;
            const cssW = this.canvas.clientWidth || 480;
            const cssH = this.canvas.clientHeight || 700;
            this.canvas.width = Math.max(1, Math.round(cssW * dpr));
            this.canvas.height = Math.max(1, Math.round(cssH * dpr));
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this.originScreenX = cssW / 2;
            this.originScreenY = cssH * 0.42;
            this.dirty = true;
        },

        /* =====================================================
         * 主迴圈
         * ===================================================== */
        startLoop: function () {
            if (this.running) return;
            this.running = true;
            const self = this;
            const render = () => {
                if (!self.running) return;
                self.raf = requestAnimationFrame(render);
                // 為了讓進度條/警告符號隨時間更新，每秒重畫一次；其他時候依 dirty
                if (self.dirty || (Date.now() - (self._lastTick || 0)) > 1000) {
                    self.draw();
                    self.dirty = false;
                    self._lastTick = Date.now();
                }
            };
            render();
            this.simTimer = setInterval(() => {
                if (!self.data) return;
                self.simulate();
                self.refreshHUD();
            }, 1500);
        },

        stopLoop: function () {
            this.running = false;
            if (this.raf) cancelAnimationFrame(this.raf);
            if (this.simTimer) clearInterval(this.simTimer);
            this.raf = 0; this.simTimer = 0;
        },

        simulate: function () {
            const now = window.FMCollectionSave.normalizeNow(this.data);
            this.data.plots.forEach(p => this.tickPot(p, now));
            this.data.teas.forEach(t => this.tickTea(t, now));
            this.data.teaHouses.forEach(h => this.tickTeaHouse(h, now));
            this.data.wines.forEach(w => this.tickWine(w, now));
            this.tickScribe(this.data.scribe, now);

            const sig = this.sceneSignature();
            if (sig !== this.lastSig) { this.lastSig = sig; this.dirty = true; }
        },

        sceneSignature: function () {
            const d = this.data;
            let s = '';
            d.plots.forEach(p => s += (p.kind || '_') + (p.stage || '_') + '|');
            d.teas.forEach(t => s += (t.kind || '_') + (t.stage || '_') + '|');
            d.teaHouses.forEach(h => s += (h.kind || '_') + (h.stage || '_') + '|');
            d.wines.forEach(w => s += (w.kind || '_') + (w.stage || '_') + '|');
            s += 'sc' + (d.scribe.books || []).length + '/' + (d.scribe.deskCap || 1);
            return s;
        },

        tickPot: function (p, now) {
            if (!p.kind || p.stage === 'empty') return;
            const def = POT_KINDS[p.kind]; if (!def) return;
            const age = now - p.plantedTs;
            if (age >= def.period) {
                p.stage = 'ripe';
                p.overdueLevel = this.overdueLevel(age - def.period, def.harvestWindow);
            } else {
                p.stage = (age < def.period * 0.3) ? 'seedling'
                       : (age < def.period * 0.7) ? 'budding' : 'flowering';
            }
        },

        tickTea: function (t, now) {
            if (!t.kind || t.stage === 'empty') return;
            const def = TEA_KINDS[t.kind]; if (!def) return;
            if (t.stage === 'growing') {
                if (now - t.plantedTs >= def.period) t.stage = 'pickable';
            }
        },

        tickTeaHouse: function (h, now) {
            if (!h.kind || h.stage === 'empty') return;
            const def = TEA_KINDS[h.kind]; if (!def) return;
            if (h.stage === 'baking') {
                // 烘焙時間 = 茶葉生長時間的一半
                const bakeMs = def.period / 2;
                if (now - h.bakeStartTs >= bakeMs) {
                    h.stage = 'done';
                    h.overdueLevel = this.overdueLevel(Math.max(0, (now - h.bakeStartTs) - bakeMs), def.dryWindow);
                }
            }
        },

        tickWine: function (w, now) {
            if (!w.kind || w.stage === 'empty') return;
            const def = WINE_KINDS[w.kind]; if (!def) return;
            if (now - w.startTs >= def.period) {
                w.stage = 'open';
                w.openOverdueLevel = ((now - w.startTs) - def.period > def.openWindow) ? 2 : 0;
            }
        },

        tickScribe: function (s, now) {
            if (!s) return;
            if (!s.books) s.books = [];
            if (!s.lastClaimTs) s.lastClaimTs = now;
            const elapsed = now - s.lastClaimTs;
            const shouldHave = Math.min(s.deskCap || 1, Math.floor(elapsed / HOUR));
            for (let i = s.books.length; i < shouldHave; i++) {
                s.books.push({
                    kind: (Math.random() < 0.5) ? '四書' : '五經',
                    finishedTs: s.lastClaimTs + (i + 1) * HOUR,
                    tier: '下品'
                });
            }
        },

        overdueLevel: function (overdueMs, fullWindow) {
            if (overdueMs <= 0) return 0;
            if (overdueMs <= fullWindow)     return 0;
            if (overdueMs <= 2 * fullWindow) return 1;
            if (overdueMs <= 4 * fullWindow) return 2;
            return 3;
        },

        /* =====================================================
         * HUD
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
                try { if (window.ScoreManager) return window.ScoreManager.loadPlayerData().globalRank || '書僮'; }
                catch (e) {}
                return '書僮';
            }
            return passed[passed.length - 1];
        },

        currentShichen: function () {
            const h = new Date().getHours();
            const map = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
            return map[Math.floor(((h + 1) % 24) / 2)] + '時';
        },

        /** 銀兩格式：1000 文錢以上換算兩，否則顯示 N 文錢 */
        fmtSilver: function (s) {
            s = Math.floor(s || 0);
            if (s >= 1000) return (Math.floor(s / 100) / 10).toFixed(1) + ' 兩';
            return s + ' 文錢';
        },

        /** HH:MM:SS 倒數格式（井上方用） */
        fmtHMS: function (ms) {
            const total = Math.max(0, Math.floor(ms / 1000));
            const h = Math.floor(total / 3600);
            const m = Math.floor((total % 3600) / 60);
            const s = total % 60;
            return String(h).padStart(2, '0') + ':' +
                   String(m).padStart(2, '0') + ':' +
                   String(s).padStart(2, '0');
        },

        /**
         * 井倒數：完全只看 data.wellTimerEndTs 這個玩家行為驅動的時間戳。
         * - 玩家「點井澆水」 → wellTimerEndTs = now + 6 小時
         * - 玩家「種下第一棵作物」（井未啟動） → wellTimerEndTs = now + 6 小時
         * - 倒數到期不會自動重置；唯有玩家再次點井才會重啟。
         * 這樣才能逼玩家準時回來澆水。
         */
        wellNextDue: function () {
            const now = Date.now();
            const hasGrowing = this.data.plots.some(p => p.kind && p.stage !== 'empty' && p.stage !== 'ripe')
                            || this.data.teas.some(t => t.kind && t.stage === 'growing');
            if (!hasGrowing) return { overdue: false, msUntilDue: null };
            const end = this.data.wellTimerEndTs || 0;
            if (end <= 0)   return { overdue: true,  msUntilDue: null };   // 從未澆過 / 倒數未啟動
            if (end <= now) return { overdue: true,  msUntilDue: null };   // 已逾期，停在「請澆水」
            return { overdue: false, msUntilDue: end - now };
        },

        /* =====================================================
         * 等角投影
         * ===================================================== */
        isoWorld: function (gx, gy) {
            return { x: (gx - gy) * (TILE_W / 2), y: (gx + gy) * (TILE_H / 2) };
        },

        screenToWorld: function (sx, sy) {
            return {
                x: (sx - this.originScreenX - this.camera.x) / this.camera.scale,
                y: (sy - this.originScreenY - this.camera.y) / this.camera.scale
            };
        },

        /* =====================================================
         * 高 DPR 烘焙：背景 + sprite atlas
         * ===================================================== */
        bakeFactor: function () {
            // sprite 內部以 DPR×2 倍率繪製，避免縮放與 Retina 模糊
            return (window.devicePixelRatio || 1) * 2;
        },

        buildBackground: function () {
            const R = 7;  // 覆蓋 LAYOUT 中 gx/gy 最大絕對值 (6) 再加 1
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let gy = -R; gy <= R; gy++) {
                for (let gx = -R; gx <= R; gx++) {
                    const p = this.isoWorld(gx, gy);
                    minX = Math.min(minX, p.x - TILE_W/2);
                    maxX = Math.max(maxX, p.x + TILE_W/2);
                    minY = Math.min(minY, p.y);
                    maxY = Math.max(maxY, p.y + TILE_H);
                }
            }
            const w = Math.ceil(maxX - minX), h = Math.ceil(maxY - minY);
            const f = this.bakeFactor();
            const c = document.createElement('canvas');
            c.width = w * f; c.height = h * f;
            const cx = c.getContext('2d');
            cx.scale(f, f);
            cx.translate(-minX, -minY);
            for (let gy = -R; gy <= R; gy++) {
                for (let gx = -R; gx <= R; gx++) {
                    const p = this.isoWorld(gx, gy);
                    cx.beginPath();
                    cx.moveTo(p.x,            p.y);
                    cx.lineTo(p.x + TILE_W/2, p.y + TILE_H/2);
                    cx.lineTo(p.x,            p.y + TILE_H);
                    cx.lineTo(p.x - TILE_W/2, p.y + TILE_H/2);
                    cx.closePath();
                    cx.fillStyle = ((gx + gy) & 1) ? 'hsl(95, 30%, 78%)' : 'hsl(95, 30%, 82%)';
                    cx.fill();
                    cx.strokeStyle = 'hsla(95, 30%, 60%, 0.4)';
                    cx.lineWidth = 1;
                    cx.stroke();
                }
            }
            this.bg = { canvas: c, worldX: minX, worldY: minY, cssW: w, cssH: h };
        },

        /** drawFn(cx) 內以 (0,0) 為磚頂點繪製；輸出 canvas 內部尺寸 = ATLAS_W * f × ATLAS_H * f */
        getSprite: function (key, drawFn) {
            if (this.spriteCache[key]) return this.spriteCache[key];
            const f = this.bakeFactor();
            const c = document.createElement('canvas');
            c.width = ATLAS_W * f; c.height = ATLAS_H * f;
            const cx = c.getContext('2d');
            cx.scale(f, f);
            cx.translate(AX, AY);
            cx.textAlign = 'center';
            // 預設文字字型 — 統一用宋體確保字面清晰
            cx.font = '12px "Noto Serif TC", serif';
            drawFn(cx);
            this.spriteCache[key] = c;
            return c;
        },

        /* ---- 各種 sprite ---- */
        potSprite: function (p) {
            const key = (p.kind && p.stage !== 'empty') ? ('pot_' + p.kind + '_' + p.stage) : 'pot_empty';
            return this.getSprite(key, cx => {
                cx.fillStyle = 'hsl(25, 50%, 38%)';
                cx.beginPath();
                cx.moveTo(-22, 0); cx.lineTo(22, 0); cx.lineTo(16, 14); cx.lineTo(-16, 14);
                cx.closePath(); cx.fill();
                cx.strokeStyle = 'hsl(25, 50%, 25%)'; cx.stroke();
                if (p.kind && p.stage !== 'empty') {
                    const isRipe = (p.stage === 'ripe');
                    const rad = isRipe ? 16 : (p.stage === 'flowering' ? 12 : 7);
                    if (isRipe) {
                        cx.fillStyle = 'hsla(48, 100%, 60%, 0.5)';
                        cx.beginPath(); cx.arc(0, -rad/2, rad + 4, 0, Math.PI*2); cx.fill();
                    }
                    cx.fillStyle = PLANT_COLORS[p.kind] || 'hsl(110, 50%, 40%)';
                    cx.beginPath(); cx.arc(0, -rad/2, rad, 0, Math.PI*2); cx.fill();
                    cx.fillStyle = 'hsl(0, 60%, 26%)';
                    cx.font = 'bold 13px "Noto Serif TC", serif';
                    cx.fillText(p.kind, 0, -rad - 4);
                } else {
                    cx.fillStyle = 'hsl(0, 30%, 40%)';
                    cx.font = '12px "Noto Serif TC", serif';
                    cx.fillText('空盆', 0, -4);
                }
            });
        },

        teaSprite: function (t) {
            const key = (t.kind && t.stage !== 'empty') ? ('tea_' + t.kind + '_' + t.stage) : 'tea_empty';
            return this.getSprite(key, cx => {
                cx.fillStyle = 'hsl(110, 35%, 30%)';
                cx.fillRect(-18, -4, 36, 14);
                if (t.kind && t.stage !== 'empty') {
                    cx.fillStyle = 'hsl(110, 60%, 35%)';
                    for (let i = 0; i < 3; i++) { cx.beginPath(); cx.arc(-12 + i*12, -2, 6, 0, Math.PI*2); cx.fill(); }
                    cx.fillStyle = 'hsl(0, 60%, 26%)';
                    cx.font = 'bold 13px "Noto Serif TC", serif';
                    cx.fillText(t.kind + (t.stage === 'pickable' ? '★' : ''), 0, -14);
                } else {
                    cx.fillStyle = 'hsl(0, 30%, 40%)';
                    cx.font = '12px "Noto Serif TC", serif';
                    cx.fillText('茶圃', 0, -8);
                }
            });
        },

        teaHouseSprite: function (h) {
            const key = (h.kind && h.stage !== 'empty') ? ('th_' + h.kind + '_' + h.stage) : 'th_empty';
            return this.getSprite(key, cx => {
                // 屋頂
                cx.fillStyle = 'hsl(0, 40%, 32%)';
                cx.beginPath();
                cx.moveTo(-22, -16); cx.lineTo(0, -30); cx.lineTo(22, -16);
                cx.closePath(); cx.fill();
                // 屋身
                cx.fillStyle = 'hsl(36, 50%, 78%)';
                cx.fillRect(-18, -16, 36, 18);
                cx.strokeStyle = 'hsl(25, 40%, 30%)'; cx.strokeRect(-18, -16, 36, 18);
                // 門
                cx.fillStyle = 'hsl(25, 40%, 30%)';
                cx.fillRect(-5, -10, 10, 12);
                cx.fillStyle = 'hsl(0, 60%, 26%)';
                cx.font = 'bold 13px "Noto Serif TC", serif';
                if (h.kind && h.stage !== 'empty') {
                    cx.fillText(h.kind + (h.stage === 'done' ? '★' : ''), 0, -34);
                    cx.font = '11px "Noto Serif TC", serif';
                    cx.fillText('茶寮', 0, 10);
                } else {
                    cx.fillStyle = 'hsl(0, 30%, 40%)';
                    cx.font = '12px "Noto Serif TC", serif';
                    cx.fillText('茶寮', 0, -34);
                }
            });
        },

        wineSprite: function (w) {
            const key = (w.kind && w.stage !== 'empty') ? ('wine_' + w.kind + '_' + w.stage) : 'wine_empty';
            return this.getSprite(key, cx => {
                cx.fillStyle = 'hsl(25, 35%, 28%)';
                cx.beginPath(); cx.ellipse(0, -8, 14, 18, 0, 0, Math.PI*2); cx.fill();
                cx.strokeStyle = 'hsl(25, 40%, 18%)'; cx.stroke();
                cx.font = 'bold 13px "Noto Serif TC", serif';
                if (w.kind && w.stage !== 'empty') {
                    cx.fillStyle = 'hsl(0, 60%, 26%)';
                    cx.fillText(w.kind + (w.stage === 'open' ? '★' : ''), 0, -28);
                } else {
                    cx.fillStyle = 'hsl(0, 30%, 70%)';
                    cx.fillText('空甕', 0, -28);
                }
            });
        },

        wellSprite: function () {
            return this.getSprite('well', cx => {
                cx.fillStyle = 'hsl(210, 50%, 45%)';
                cx.beginPath(); cx.arc(0, 0, 16, 0, Math.PI*2); cx.fill();
                cx.strokeStyle = 'hsl(0, 0%, 30%)'; cx.lineWidth = 2; cx.stroke();
                cx.fillStyle = 'hsl(0, 60%, 26%)';
                cx.font = 'bold 13px "Noto Serif TC", serif';
                cx.fillText('井', 0, -22);
            });
        },

        shopSprite: function () {
            return this.getSprite('shop', cx => {
                cx.fillStyle = 'hsl(0, 60%, 36%)';
                cx.fillRect(-20, -34, 40, 32);
                cx.fillStyle = '#fdfaf6';
                cx.font = 'bold 14px "Noto Serif TC", serif';
                cx.fillText('商', 0, -22); cx.fillText('店', 0, -8);
            });
        },

        examSprite: function () {
            return this.getSprite('exam', cx => {
                cx.fillStyle = 'hsl(36, 50%, 70%)'; cx.fillRect(-32, -28, 64, 32);
                cx.fillStyle = 'hsl(0, 60%, 36%)'; cx.fillRect(-34, -34, 68, 8);
                cx.fillStyle = '#fdfaf6';
                cx.font = 'bold 13px "Noto Serif TC", serif';
                cx.fillText('考棚', 0, -10);
            });
        },

        deskSprite: function () {
            return this.getSprite('desk', cx => {
                cx.fillStyle = 'hsl(25, 50%, 32%)'; cx.fillRect(-24, -12, 48, 22);
                cx.strokeStyle = 'hsl(25, 50%, 20%)'; cx.strokeRect(-24, -12, 48, 22);
                cx.fillStyle = '#fdfaf6'; cx.fillRect(-20, -8, 40, 12);
            });
        },

        /** 人物縮小到 70% — 在 sprite 內就只畫 0.7 比例的書生 */
        scholarSprite: function () {
            const key = 'scholar_' + (this.playerSurname || '林');
            return this.getSprite(key, cx => {
                cx.save();
                cx.scale(0.7, 0.7);
                cx.fillStyle = 'hsl(210, 30%, 35%)';
                cx.beginPath();
                cx.moveTo(-10, -8); cx.lineTo(10, -8); cx.lineTo(14, 18); cx.lineTo(-14, 18);
                cx.closePath(); cx.fill();
                cx.fillStyle = 'hsl(36, 40%, 88%)';
                cx.beginPath(); cx.arc(0, -22, 16, 0, Math.PI*2); cx.fill();
                cx.strokeStyle = 'hsl(0, 0%, 25%)'; cx.stroke();
                cx.fillStyle = 'hsl(0, 0%, 10%)';
                cx.font = 'bold 22px "Noto Serif TC", serif';
                cx.textBaseline = 'middle';
                cx.fillText(this.playerSurname || '林', 0, -22);
                cx.textBaseline = 'alphabetic';
                cx.restore();
            });
        },

        /** 筆 / 書 圖示：疊在書桌上方 */
        penSprite: function () {
            return this.getSprite('icon_pen', cx => {
                cx.fillStyle = 'hsl(36, 40%, 95%)';
                cx.beginPath();
                cx.moveTo(-2, -28); cx.lineTo(2, -28); cx.lineTo(6, -8); cx.lineTo(-6, -8);
                cx.closePath(); cx.fill();
                cx.fillStyle = 'hsl(0, 0%, 15%)';
                cx.beginPath();
                cx.moveTo(-3, -8); cx.lineTo(3, -8); cx.lineTo(0, 0);
                cx.closePath(); cx.fill();
            });
        },

        bookSprite: function () {
            return this.getSprite('icon_book', cx => {
                cx.fillStyle = 'hsl(36, 30%, 95%)';
                cx.fillRect(-12, -28, 24, 18);
                cx.strokeStyle = 'hsl(0, 50%, 30%)'; cx.lineWidth = 1.5; cx.strokeRect(-12, -28, 24, 18);
                cx.fillStyle = 'hsl(0, 50%, 30%)';
                cx.fillRect(-1, -28, 2, 18);
                cx.font = 'bold 10px "Noto Serif TC", serif';
                cx.fillStyle = 'hsl(0, 50%, 30%)';
                cx.fillText('書', 0, -16);
            });
        },

        /* =====================================================
         * 渲染主流程
         * ===================================================== */
        draw: function () {
            const ctx = this.ctx;
            const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
            ctx.clearRect(0, 0, W, H);

            ctx.save();
            ctx.translate(this.originScreenX + this.camera.x, this.originScreenY + this.camera.y);
            ctx.scale(this.camera.scale, this.camera.scale);

            // 背景
            if (this.bg) ctx.drawImage(this.bg.canvas, this.bg.worldX, this.bg.worldY, this.bg.cssW, this.bg.cssH);

            // 收集可見物件
            const items = [];
            LAYOUT.forEach(o => items.push({ o, depth: o.gx + o.gy }));
            items.push({ scholar: true, gx: 0, gy: 0, depth: 0 });
            items.sort((a, b) => a.depth - b.depth);

            const sc = this.camera.scale;
            for (const it of items) {
                const gx = it.scholar ? 0 : it.o.gx;
                const gy = it.scholar ? 0 : it.o.gy;
                const wpos = this.isoWorld(gx, gy);

                // 視口裁剪
                const screenX = this.originScreenX + this.camera.x + wpos.x * sc;
                const screenY = this.originScreenY + this.camera.y + wpos.y * sc;
                if (screenX + ATLAS_W * sc < 0 || screenX - ATLAS_W * sc > W ||
                    screenY + ATLAS_H * sc < 0 || screenY - ATLAS_H * sc > H) continue;

                let sprite;
                if (it.scholar) sprite = this.scholarSprite();
                else            sprite = this.spriteForObject(it.o);
                // 以 CSS 邏輯尺寸 ATLAS_W × ATLAS_H 繪製（sprite 內部已 DPR×2 倍率）
                ctx.drawImage(sprite, wpos.x - AX, wpos.y - AY, ATLAS_W, ATLAS_H);

                if (!it.scholar) this.drawObjectOverlay(ctx, it.o, wpos);
            }

            ctx.restore();
        },

        spriteForObject: function (o) {
            switch (o.type) {
                case 'pot':      return this.potSprite(this.data.plots[o.idx]);
                case 'tea':      return this.teaSprite(this.data.teas[o.idx]);
                case 'teaHouse': return this.teaHouseSprite(this.data.teaHouses[o.idx]);
                case 'wine':     return this.wineSprite(this.data.wines[o.idx]);
                case 'well':     return this.wellSprite();
                case 'shop':     return this.shopSprite();
                case 'exam':     return this.examSprite();
                case 'scribe':   return this.deskSprite();
            }
            return this.getSprite('blank', () => {});
        },

        /** 疊加：進度條、警告符號、書桌計數與筆/書圖示 */
        drawObjectOverlay: function (ctx, o, wpos) {
            const pr = this.objProgress(o);
            const warn = this.objWarn(o);

            // 進度條 — 白底紅條，紅條由右向左
            if (pr !== null) {
                const barW = 40, barH = 5;
                const bx = wpos.x - barW / 2;
                const by = wpos.y + 4;
                ctx.fillStyle = '#fdfaf6';
                ctx.fillRect(bx, by, barW, barH);
                ctx.strokeStyle = 'hsl(0, 50%, 25%)';
                ctx.lineWidth = 1;
                ctx.strokeRect(bx, by, barW, barH);
                const redW = Math.max(0, Math.min(1, pr)) * barW;
                ctx.fillStyle = 'hsl(0, 75%, 50%)';
                ctx.fillRect(bx + barW - redW, by, redW, barH);
            }

            // 警告符號（缺水 / 過期）
            if (warn) {
                ctx.save();
                ctx.fillStyle = 'hsl(48, 95%, 55%)';
                ctx.strokeStyle = 'hsl(0, 0%, 15%)';
                ctx.lineWidth = 1.5;
                const cx = wpos.x + 18, cy = wpos.y - 38;
                ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI*2);
                ctx.fill(); ctx.stroke();
                ctx.fillStyle = 'hsl(0, 0%, 15%)';
                ctx.font = 'bold 14px "Noto Serif TC", serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('！', cx, cy);
                ctx.textBaseline = 'alphabetic';
                ctx.restore();
            }

            // 井：上方顯示「下一次澆水倒數」（藍 HH:MM:SS） 或「請澆水」（紅）
            if (o.type === 'well') {
                const wd = this.wellNextDue();
                ctx.save();
                ctx.textAlign = 'center';
                if (wd.overdue) {
                    ctx.fillStyle = 'hsl(0, 80%, 45%)';
                    ctx.font = 'bold 14px "Noto Serif TC", serif';
                    ctx.fillText('請澆水', wpos.x, wpos.y - 40);
                } else if (wd.msUntilDue !== null) {
                    ctx.fillStyle = 'hsl(210, 90%, 38%)';
                    ctx.font = 'bold 13px "Courier New", monospace';
                    ctx.fillText(this.fmtHMS(wd.msUntilDue), wpos.x, wpos.y - 40);
                }
                ctx.restore();
            }

            // 書桌：頂端疊筆(抄寫中) 或書(已完成)，並顯示計數
            if (o.type === 'scribe') {
                const s = this.data.scribe;
                const cnt = (s.books || []).length;
                ctx.fillStyle = 'hsl(0, 60%, 26%)';
                ctx.font = 'bold 12px "Noto Serif TC", serif';
                ctx.textAlign = 'center';
                ctx.fillText('書桌 ' + cnt + '/' + (s.deskCap || 1), wpos.x, wpos.y - 16);
                if (cnt > 0) {
                    ctx.drawImage(this.bookSprite(), wpos.x - AX, wpos.y - AY - 18, ATLAS_W, ATLAS_H);
                } else if (cnt < (s.deskCap || 1)) {
                    ctx.drawImage(this.penSprite(), wpos.x - AX, wpos.y - AY - 18, ATLAS_W, ATLAS_H);
                }
            }
        },

        /** 物件的當前生長進度（0~1）；無進度概念則回 null */
        objProgress: function (o) {
            const now = Date.now();
            if (o.type === 'pot') {
                const p = this.data.plots[o.idx];
                if (!p.kind || p.stage === 'empty') return null;
                const def = POT_KINDS[p.kind];
                return Math.min(1, (now - p.plantedTs) / def.period);
            }
            if (o.type === 'tea') {
                const t = this.data.teas[o.idx];
                if (!t.kind || t.stage === 'empty') return null;
                const def = TEA_KINDS[t.kind];
                return Math.min(1, (now - t.plantedTs) / def.period);
            }
            if (o.type === 'teaHouse') {
                const h = this.data.teaHouses[o.idx];
                if (!h.kind || h.stage === 'empty') return null;
                const def = TEA_KINDS[h.kind];
                const bake = def.period / 2;
                return Math.min(1, (now - h.bakeStartTs) / bake);
            }
            if (o.type === 'wine') {
                const w = this.data.wines[o.idx];
                if (!w.kind || w.stage === 'empty') return null;
                const def = WINE_KINDS[w.kind];
                return Math.min(1, (now - w.startTs) / def.period);
            }
            if (o.type === 'scribe') {
                const s = this.data.scribe;
                if ((s.books || []).length >= (s.deskCap || 1)) return 1;
                const targetTs = (s.lastClaimTs || now) + (s.books.length + 1) * HOUR;
                const total = HOUR;
                const remaining = targetTs - now;
                return Math.max(0, Math.min(1, (total - remaining) / total));
            }
            return null;
        },

        /** 警告符號條件 */
        objWarn: function (o) {
            const now = Date.now();
            const hh = new Date(now).getHours();
            const isNight = (hh >= NIGHT_START_H) || (hh < NIGHT_END_H);
            if (o.type === 'pot') {
                const p = this.data.plots[o.idx];
                if (!p.kind || p.stage === 'empty') return false;
                // 過期未採
                if (p.stage === 'ripe') {
                    const def = POT_KINDS[p.kind];
                    if (now - p.plantedTs - def.period > def.harvestWindow) return true;
                }
                // 缺水（白日才警告）
                if (!isNight && (now - (p.lastWaterTs || 0)) > WATER_INTERVAL * 1.5) return true;
                return false;
            }
            if (o.type === 'tea') {
                const t = this.data.teas[o.idx];
                if (!t.kind || t.stage === 'empty') return false;
                if (t.stage === 'pickable') {
                    const def = TEA_KINDS[t.kind];
                    if (now - t.plantedTs - def.period > def.dryWindow) return true;
                }
                if (t.stage === 'growing' && !isNight && (now - (t.lastWaterTs || 0)) > WATER_INTERVAL * 1.5) return true;
                return false;
            }
            if (o.type === 'teaHouse') {
                const h = this.data.teaHouses[o.idx];
                if (!h.kind || h.stage === 'empty') return false;
                if (h.stage === 'done') {
                    const def = TEA_KINDS[h.kind];
                    if (now - h.bakeStartTs - (def.period / 2) > def.dryWindow) return true;
                }
                return false;
            }
            if (o.type === 'wine') {
                const w = this.data.wines[o.idx];
                if (!w.kind || w.stage === 'empty') return false;
                if (w.stage === 'open') {
                    const def = WINE_KINDS[w.kind];
                    if (now - w.startTs - def.period > def.openWindow) return true;
                }
                return false;
            }
            if (o.type === 'scribe') {
                const s = this.data.scribe;
                return (s.books || []).length >= (s.deskCap || 1);  // 抄本待取
            }
            return false;
        },

        /* =====================================================
         * 輸入：點擊 / 拖曳 / pinch / 滾輪 / hover
         * ===================================================== */
        attachInput: function () {
            const c = this.canvas;
            const self = this;
            this.gestures = { mode: 'idle', lastX: 0, lastY: 0, startDist: 0, startScale: 1, downX: 0, downY: 0, downTs: 0 };

            const toLocal = (clientX, clientY) => {
                const r = c.getBoundingClientRect();
                const sx = r.width ? (c.clientWidth / r.width) : 1;
                const sy = r.height ? (c.clientHeight / r.height) : 1;
                return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
            };
            const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

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
                    const dx = touches[1].x - touches[0].x, dy = touches[1].y - touches[0].y;
                    this.gestures.startDist = Math.sqrt(dx*dx + dy*dy);
                    this.gestures.startScale = this.camera.scale;
                }
            };
            const onMove = (touches) => {
                if (this.gestures.mode === 'pan' && touches.length === 1) {
                    this.camera.x += touches[0].x - this.gestures.lastX;
                    this.camera.y += touches[0].y - this.gestures.lastY;
                    this.gestures.lastX = touches[0].x;
                    this.gestures.lastY = touches[0].y;
                    this.dirty = true;
                } else if (this.gestures.mode === 'pinch' && touches.length === 2) {
                    const dx = touches[1].x - touches[0].x, dy = touches[1].y - touches[0].y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    if (this.gestures.startDist > 0) {
                        const ns = Math.max(this.camera.minScale, Math.min(this.camera.maxScale,
                            this.gestures.startScale * dist / this.gestures.startDist));
                        const mid = midpoint(touches[0], touches[1]);
                        this.applyZoom(ns, mid.x, mid.y);
                    }
                }
            };
            const onEnd = (touches) => {
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

            c.addEventListener('mousedown', e => { onStart([ toLocal(e.clientX, e.clientY) ]); e.preventDefault(); });
            window.addEventListener('mousemove', e => {
                if (this.gestures.mode === 'pan') onMove([ toLocal(e.clientX, e.clientY) ]);
                // Hover：偵測游標下的物件以切換 cursor
                if (this.overlay && !this.overlay.classList.contains('hidden') && this.gestures.mode !== 'pan') {
                    const p = toLocal(e.clientX, e.clientY);
                    this.updateHover(p.x, p.y);
                }
            });
            window.addEventListener('mouseup', () => { if (this.gestures.mode === 'pan') onEnd([]); });

            c.addEventListener('touchstart', e => {
                onStart(Array.from(e.touches).map(t => toLocal(t.clientX, t.clientY))); e.preventDefault();
            }, { passive: false });
            c.addEventListener('touchmove', e => {
                onMove(Array.from(e.touches).map(t => toLocal(t.clientX, t.clientY))); e.preventDefault();
            }, { passive: false });
            c.addEventListener('touchend', e => {
                onEnd(Array.from(e.touches).map(t => toLocal(t.clientX, t.clientY))); e.preventDefault();
            });

            c.addEventListener('wheel', e => {
                const p = toLocal(e.clientX, e.clientY);
                const ns = Math.max(this.camera.minScale, Math.min(this.camera.maxScale,
                    this.camera.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
                this.applyZoom(ns, p.x, p.y);
                e.preventDefault();
            }, { passive: false });
        },

        applyZoom: function (newScale, focusX, focusY) {
            const wx = (focusX - this.originScreenX - this.camera.x) / this.camera.scale;
            const wy = (focusY - this.originScreenY - this.camera.y) / this.camera.scale;
            this.camera.scale = newScale;
            this.camera.x = focusX - this.originScreenX - wx * newScale;
            this.camera.y = focusY - this.originScreenY - wy * newScale;
            this.dirty = true;
        },

        updateHover: function (sx, sy) {
            const obj = this.hitTest(sx, sy);
            if (obj === this.hoverObj) return;
            this.hoverObj = obj;
            this.canvas.classList.remove('hover-tool', 'hover-detail');
            if (obj) this.canvas.classList.add(this.currentTool === 'detail' ? 'hover-detail' : 'hover-tool');
        },

        hitTest: function (sx, sy) {
            const wp = this.screenToWorld(sx, sy);
            for (let i = LAYOUT.length - 1; i >= 0; i--) {
                const o = LAYOUT[i];
                const c = this.isoWorld(o.gx, o.gy);
                const x0 = c.x + o.rect[0], y0 = c.y + o.rect[1];
                if (wp.x >= x0 && wp.x <= x0 + o.rect[2] && wp.y >= y0 && wp.y <= y0 + o.rect[3]) return o;
            }
            return null;
        },

        handleClick: function (sx, sy) {
            const o = this.hitTest(sx, sy);
            if (!o) return;
            if (this.currentTool === 'detail') {
                this.openDetailPopup(o);
                return;
            }
            // 預設工具：執行該物件的「主要動作」
            this.executeTool(o);
        },

        /* =====================================================
         * 工具模式：點擊即動作
         * ===================================================== */
        executeTool: function (o) {
            switch (o.type) {
                case 'pot': {
                    const p = this.data.plots[o.idx];
                    if (!p.kind || p.stage === 'empty') return this.openSeedPicker('pot', o.idx);
                    if (p.stage === 'ripe') return this.harvestPot(o.idx);
                    return this.waterOne(o);
                }
                case 'tea': {
                    const t = this.data.teas[o.idx];
                    if (!t.kind || t.stage === 'empty') return this.openSeedPicker('tea', o.idx);
                    if (t.stage === 'pickable') return this.pickTea(o.idx);
                    return this.waterOne(o);
                }
                case 'teaHouse': {
                    const h = this.data.teaHouses[o.idx];
                    if (!h.kind || h.stage === 'empty') { this.showToast('茶寮閒置，需先採茶才會自動入此烘焙'); return; }
                    if (h.stage === 'done') return this.claimTeaHouse(o.idx);
                    this.showToast('烘焙中，請耐心等待');
                    return;
                }
                case 'wine': {
                    const w = this.data.wines[o.idx];
                    if (!w.kind || w.stage === 'empty') return this.openSeedPicker('wine', o.idx);
                    if (w.stage === 'open') return this.openWine(o.idx);
                    this.showToast('釀製中，請耐心等待');
                    return;
                }
                case 'well':   return this.waterAll();
                case 'scribe': return this.toggleScribe();
                case 'shop':   return this.openShop();
                case 'exam':   return this.openExam();
            }
        },

        /** 點空盆/空圃/空甕時：列出倉庫中對應品類的種子讓玩家選 */
        openSeedPicker: function (cat, slotIdx) {
            const kinds = (cat === 'pot') ? POT_KINDS : (cat === 'tea') ? TEA_KINDS : WINE_KINDS;
            const slotName = (cat === 'pot') ? '花盆' : (cat === 'tea') ? '茶圃' : '酒甕';
            const items = [];
            Object.keys(kinds).forEach(name => {
                TIERS.forEach(tier => {
                    const k = name + '_' + tier;
                    const n = this.data.seedBag[k] || 0;
                    if (n > 0) items.push({ name, tier, n });
                });
            });
            if (items.length === 0) {
                const tag = (cat === 'wine') ? '米' : (cat === 'tea') ? '茶種' : '花種';
                this.showToast('倉庫無 ' + tag + '，請至商店購買');
                return;
            }
            let html = '<div class="fm-collection-popup-title">' + slotName + '：選擇下種</div>';
            items.forEach((it, i) => {
                html += '<button class="fm-collection-popup-btn" data-act="plant" data-i="' + i + '">' +
                        it.name + ' · ' + it.tier + (cat === 'wine' ? '米' : '種') +
                        '（擁有 ' + it.n + '）</button>';
            });
            this.showPopup(html, e => {
                const idxStr = e.target.getAttribute('data-i');
                if (idxStr != null) {
                    const sel = items[parseInt(idxStr, 10)];
                    this.plantToSlot(cat, slotIdx, sel.name, sel.tier);
                    this.hidePopup();
                }
            });
        },

        /** 將倉庫一個種子下到指定槽位 */
        plantToSlot: function (cat, slotIdx, name, tier) {
            const k = name + '_' + tier;
            if ((this.data.seedBag[k] || 0) <= 0) { this.showToast('倉庫無此種子'); return; }
            this.data.seedBag[k]--;
            if (this.data.seedBag[k] <= 0) delete this.data.seedBag[k];
            const now = Date.now();
            if (cat === 'pot') {
                this.data.plots[slotIdx] = { kind: name, seedTier: tier, plantedTs: now, lastWaterTs: now, missedWater: 0, stage: 'seedling' };
            } else if (cat === 'tea') {
                this.data.teas[slotIdx] = { kind: name, seedTier: tier, plantedTs: now, lastWaterTs: now, missedWater: 0, stage: 'growing' };
            } else if (cat === 'wine') {
                this.data.wines[slotIdx] = { kind: name, riceTier: tier, startTs: now, stage: 'brewing' };
            }
            // 首次有作物或井倒數從未啟動 → 啟動井倒數
            if ((cat === 'pot' || cat === 'tea') && (!this.data.wellTimerEndTs || this.data.wellTimerEndTs <= 0)) {
                this.data.wellTimerEndTs = now + WATER_INTERVAL;
            }
            window.FMCollectionSave.save(this.data);
            this.refreshHUD();
            this.dirty = true;
            this.showToast('已下種 ' + name + ' ' + tier);
        },

        /** 針對單一物件澆水（工具模式） */
        waterOne: function (o) {
            const now = Date.now();
            let target = null;
            if (o.type === 'pot') target = this.data.plots[o.idx];
            else if (o.type === 'tea') target = this.data.teas[o.idx];
            if (!target) return;
            if ((now - (target.lastWaterTs || 0)) < WATER_INTERVAL) { this.showToast('尚未到澆水時辰'); return; }
            target.lastWaterTs = now;
            this.showToast('已澆水');
            window.FMCollectionSave.save(this.data);
            this.dirty = true;
        },

        waterAll: function () {
            const now = Date.now();
            const hh = new Date().getHours();
            const isNight = (hh >= NIGHT_START_H) || (hh < NIGHT_END_H);
            let watered = 0;
            // 玩家點井：一律刷新所有作物的 lastWaterTs（不再有「尚未到澆水時辰」之拒絕）
            this.data.plots.forEach(p => {
                if (p.kind && p.stage !== 'empty') { p.lastWaterTs = now; watered++; }
            });
            this.data.teas.forEach(t => {
                if (t.kind && t.stage === 'growing') { t.lastWaterTs = now; watered++; }
            });
            // 重置井倒數計時 — 僅在此刻、由玩家動作驅動
            this.data.wellTimerEndTs = now + WATER_INTERVAL;
            this.showToast(watered > 0
                ? '已澆水 ' + watered + ' 處' + (isNight ? '（夜安息）' : '')
                : '無作物可澆，井已續備');
            window.FMCollectionSave.save(this.data);
            this.dirty = true;
        },

        /* =====================================================
         * 詳情模式：彈窗顯示
         * ===================================================== */
        openDetailPopup: function (o) {
            switch (o.type) {
                case 'pot': {
                    const p = this.data.plots[o.idx];
                    if (!p.kind || p.stage === 'empty') return this.openSeedPicker('pot', o.idx);
                    return this.openPotMenu(o.idx);
                }
                case 'tea': {
                    const t = this.data.teas[o.idx];
                    if (!t.kind || t.stage === 'empty') return this.openSeedPicker('tea', o.idx);
                    return this.openTeaMenu(o.idx);
                }
                case 'wine': {
                    const w = this.data.wines[o.idx];
                    if (!w.kind || w.stage === 'empty') return this.openSeedPicker('wine', o.idx);
                    return this.openWineMenu(o.idx);
                }
                case 'teaHouse': return this.openTeaHouseMenu(o.idx);
                case 'well':     return this.openWellMenu();
                case 'scribe':   return this.openScribeMenu();
                case 'shop':     return this.openShop();
                case 'exam':     return this.openExam();
            }
        },

        /* =====================================================
         * 倒數時間文字工具
         * ===================================================== */
        fmtDuration: function (ms) {
            ms = Math.max(0, Math.floor(ms));
            if (ms >= DAY) return Math.floor(ms / DAY) + ' 日 ' + Math.floor((ms % DAY) / HOUR) + ' 小時';
            const h = Math.floor(ms / HOUR);
            const m = Math.floor((ms % HOUR) / 60000);
            if (h > 0) return h + ' 小時' + (m ? ' ' + m + ' 分' : '');
            return m + ' 分';
        },

        /* =====================================================
         * 各物件詳情彈窗
         * ===================================================== */
        openPotMenu: function (idx) {
            const p = this.data.plots[idx];
            const now = Date.now();
            let html = '<div class="fm-collection-popup-title">第 ' + (idx + 1) + ' 號花盆</div>';
            if (!p.kind || p.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">空盆，請至商店買種子。</div>';
            } else {
                const def = POT_KINDS[p.kind];
                const age = now - p.plantedTs;
                html += '<div class="fm-collection-popup-row"><span>' + p.kind + '</span><span>' + p.seedTier + ' 種</span></div>';
                html += '<div class="fm-collection-popup-row"><span>狀態</span><span>' + this.potStageLabel(p) + '</span></div>';
                if (age < def.period) {
                    html += '<div class="fm-collection-popup-row"><span>距離成熟</span><span>' + this.fmtDuration(def.period - age) + '</span></div>';
                } else {
                    const overdue = age - def.period;
                    if (overdue <= def.harvestWindow) {
                        html += '<div class="fm-collection-popup-row"><span>採收期剩</span><span>' + this.fmtDuration(def.harvestWindow - overdue) + '</span></div>';
                    } else {
                        html += '<div class="fm-collection-popup-row" style="color:#a33">已超過採收期 ' + this.fmtDuration(overdue - def.harvestWindow) + '</div>';
                    }
                }
                // 澆水提示
                if (p.stage !== 'ripe' && (now - (p.lastWaterTs || 0)) >= WATER_INTERVAL) {
                    html += '<div class="fm-collection-popup-row" style="color:#a33">請澆水</div>';
                }
                if (p.stage === 'ripe') {
                    html += '<div class="fm-collection-popup-row" style="color:#a33">請收割</div>';
                    html += '<button class="fm-collection-popup-btn" data-act="harvest">採收</button>';
                }
                html += '<button class="fm-collection-popup-btn" data-act="remove">移除</button>';
            }
            this.showPopup(html, e => {
                const act = e.target.getAttribute('data-act');
                if (act === 'harvest') this.harvestPot(idx);
                else if (act === 'remove') {
                    this.data.plots[idx] = window.FMCollectionSave.emptyPlot();
                    window.FMCollectionSave.save(this.data); this.dirty = true;
                }
                this.hidePopup();
            });
        },

        potStageLabel: function (p) {
            return ({ seedling:'萌芽', budding:'含苞', flowering:'盛開中', ripe:'可採收 ★' })[p.stage] || p.stage;
        },

        harvestPot: function (idx) {
            const p = this.data.plots[idx];
            if (!p.kind || p.stage !== 'ripe') return;
            const def = POT_KINDS[p.kind];
            const tier = this.rollTier(p.seedTier, p.overdueLevel || 0);
            const price = def.prices[tier][1];
            this.data.silver += price;
            this.addInv(p.kind, tier);
            this.data.plots[idx] = window.FMCollectionSave.emptyPlot();
            this.showToast('採得 ' + p.kind + '（' + tier + '），售 ' + price + ' 文錢');
            window.FMCollectionSave.save(this.data);
            this.refreshHUD(); this.dirty = true;
        },

        openTeaMenu: function (idx) {
            const t = this.data.teas[idx];
            const now = Date.now();
            let html = '<div class="fm-collection-popup-title">茶圃 ' + (idx + 1) + '</div>';
            if (!t.kind || t.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">空圃，請至商店買茶種。</div>';
            } else {
                const def = TEA_KINDS[t.kind];
                const age = now - t.plantedTs;
                html += '<div class="fm-collection-popup-row"><span>' + t.kind + '</span><span>' + t.seedTier + ' 種</span></div>';
                html += '<div class="fm-collection-popup-row"><span>狀態</span><span>' + this.teaStageLabel(t) + '</span></div>';
                if (t.stage === 'growing') {
                    html += '<div class="fm-collection-popup-row"><span>距離可採</span><span>' + this.fmtDuration(def.period - age) + '</span></div>';
                    if ((now - (t.lastWaterTs || 0)) >= WATER_INTERVAL) {
                        html += '<div class="fm-collection-popup-row" style="color:#a33">請澆水</div>';
                    }
                } else if (t.stage === 'pickable') {
                    const overdue = age - def.period;
                    if (overdue <= def.dryWindow) html += '<div class="fm-collection-popup-row"><span>採摘期剩</span><span>' + this.fmtDuration(def.dryWindow - overdue) + '</span></div>';
                    else html += '<div class="fm-collection-popup-row" style="color:#a33">已超過採摘期 ' + this.fmtDuration(overdue - def.dryWindow) + '</div>';
                    html += '<div class="fm-collection-popup-row" style="color:#a33">請採茶</div>';
                    html += '<button class="fm-collection-popup-btn" data-act="pick">採茶（送至茶寮烘焙）</button>';
                }
            }
            this.showPopup(html, e => {
                if (e.target.getAttribute('data-act') === 'pick') this.pickTea(idx);
                this.hidePopup();
            });
        },

        teaStageLabel: function (t) {
            return ({ growing:'生長中', pickable:'可採摘 ★' })[t.stage] || t.stage;
        },

        pickTea: function (idx) {
            const t = this.data.teas[idx];
            if (!t.kind || t.stage !== 'pickable') return;
            // 找一個空茶寮
            const slot = this.data.teaHouses.findIndex(h => !h.kind || h.stage === 'empty');
            if (slot < 0) { this.showToast('茶寮已滿，無法接收新茶葉'); return; }
            this.data.teaHouses[slot] = { kind: t.kind, seedTier: t.seedTier, bakeStartTs: Date.now(), stage: 'baking' };
            this.data.teas[idx] = window.FMCollectionSave.emptyTea();
            this.showToast('已採茶，送至第 ' + (slot + 1) + ' 號茶寮烘焙');
            window.FMCollectionSave.save(this.data); this.dirty = true;
        },

        openTeaHouseMenu: function (idx) {
            const h = this.data.teaHouses[idx];
            const now = Date.now();
            let html = '<div class="fm-collection-popup-title">茶寮 ' + (idx + 1) + '</div>';
            if (!h.kind || h.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">閒置中。採茶後會自動送入此處烘焙。</div>';
            } else {
                const def = TEA_KINDS[h.kind];
                const bake = def.period / 2;
                const age = now - h.bakeStartTs;
                html += '<div class="fm-collection-popup-row"><span>' + h.kind + '</span><span>' + h.seedTier + ' 種</span></div>';
                if (h.stage === 'baking') {
                    html += '<div class="fm-collection-popup-row"><span>狀態</span><span>烘焙中</span></div>';
                    html += '<div class="fm-collection-popup-row"><span>距離完成</span><span>' + this.fmtDuration(bake - age) + '</span></div>';
                } else if (h.stage === 'done') {
                    const overdue = age - bake;
                    html += '<div class="fm-collection-popup-row"><span>狀態</span><span>可收取 ★</span></div>';
                    if (overdue <= def.dryWindow) html += '<div class="fm-collection-popup-row"><span>收取期剩</span><span>' + this.fmtDuration(def.dryWindow - overdue) + '</span></div>';
                    else html += '<div class="fm-collection-popup-row" style="color:#a33">已超過收取期 ' + this.fmtDuration(overdue - def.dryWindow) + '</div>';
                    html += '<button class="fm-collection-popup-btn" data-act="claim">收取烘茶</button>';
                }
            }
            this.showPopup(html, e => {
                if (e.target.getAttribute('data-act') === 'claim') this.claimTeaHouse(idx);
                this.hidePopup();
            });
        },

        claimTeaHouse: function (idx) {
            const h = this.data.teaHouses[idx];
            if (!h.kind || h.stage !== 'done') return;
            const def = TEA_KINDS[h.kind];
            const tier = this.rollTier(h.seedTier, h.overdueLevel || 0);
            const price = def.prices[tier][1];
            this.data.silver += price;
            this.addInv(h.kind, tier);
            this.data.teaHouses[idx] = window.FMCollectionSave.emptyTeaHouse();
            this.showToast('取得 ' + h.kind + '（' + tier + '），售 ' + price + ' 文錢');
            window.FMCollectionSave.save(this.data);
            this.refreshHUD(); this.dirty = true;
        },

        openWineMenu: function (idx) {
            const w = this.data.wines[idx];
            const now = Date.now();
            let html = '<div class="fm-collection-popup-title">酒甕 ' + (idx + 1) + '</div>';
            if (!w.kind || w.stage === 'empty') {
                html += '<div class="fm-collection-popup-row">空甕，請至商店買米。</div>';
            } else {
                const def = WINE_KINDS[w.kind];
                const age = now - w.startTs;
                html += '<div class="fm-collection-popup-row"><span>' + w.kind + '</span><span>' + w.riceTier + ' 米</span></div>';
                html += '<div class="fm-collection-popup-row"><span>狀態</span><span>' + (w.stage === 'open' ? '可開甕 ★' : '釀製中') + '</span></div>';
                if (age < def.period) {
                    html += '<div class="fm-collection-popup-row"><span>距離開甕</span><span>' + this.fmtDuration(def.period - age) + '</span></div>';
                } else {
                    const overdue = age - def.period;
                    if (overdue <= def.openWindow) html += '<div class="fm-collection-popup-row"><span>開甕期剩</span><span>' + this.fmtDuration(def.openWindow - overdue) + '</span></div>';
                    else html += '<div class="fm-collection-popup-row" style="color:#a33">已超過開甕期 ' + this.fmtDuration(overdue - def.openWindow) + '（酒酸降 2 級）</div>';
                    html += '<div class="fm-collection-popup-row" style="color:#a33">請開甕收取</div>';
                    html += '<button class="fm-collection-popup-btn" data-act="open">開甕入庫</button>';
                }
            }
            this.showPopup(html, e => {
                if (e.target.getAttribute('data-act') === 'open') this.openWine(idx);
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
            this.addInv(w.kind, tier);
            this.data.wines[idx] = window.FMCollectionSave.emptyWine();
            this.showToast('得 ' + w.kind + '（' + tier + '），售 ' + price + ' 文錢');
            window.FMCollectionSave.save(this.data);
            this.refreshHUD(); this.dirty = true;
        },

        openWellMenu: function () {
            this.showPopup(
                '<div class="fm-collection-popup-title">水井</div>' +
                '<div class="fm-collection-popup-row">點擊此處可一次替所有作物澆水。</div>' +
                '<button class="fm-collection-popup-btn" data-act="waterAll">澆水（全部）</button>',
                e => { if (e.target.getAttribute('data-act') === 'waterAll') this.waterAll(); this.hidePopup(); }
            );
        },

        openScribeMenu: function () {
            const s = this.data.scribe;
            const now = Date.now();
            let html = '<div class="fm-collection-popup-title">書桌</div>';
            html += '<div class="fm-collection-popup-row"><span>書桌容量</span><span>' + (s.deskCap || 1) + ' 本</span></div>';
            html += '<div class="fm-collection-popup-row"><span>已完成</span><span>' + (s.books || []).length + ' 本</span></div>';
            if ((s.books || []).length < (s.deskCap || 1)) {
                const targetTs = (s.lastClaimTs || now) + ((s.books || []).length + 1) * HOUR;
                html += '<div class="fm-collection-popup-row"><span>下一本完成</span><span>' + this.fmtDuration(targetTs - now) + '</span></div>';
            }
            if ((s.books || []).length > 0) {
                html += '<div class="fm-collection-popup-row" style="color:#a33">請取回抄本</div>';
                html += '<button class="fm-collection-popup-btn" data-act="claimAll">全部取回入庫（自動續抄）</button>';
            } else {
                html += '<div class="fm-collection-popup-row" style="color:#888">每小時自動完成 1 本（上限為書桌容量）。</div>';
            }
            this.showPopup(html, e => {
                if (e.target.getAttribute('data-act') === 'claimAll') this.claimScribe();
                this.hidePopup();
            });
        },

        /** 工具模式按書桌：有書就取，否則跳開抄寫提示 */
        toggleScribe: function () {
            const s = this.data.scribe;
            if ((s.books || []).length > 0) return this.claimScribe();
            this.showToast('抄寫中，每小時完成 1 本');
        },

        claimScribe: function () {
            const s = this.data.scribe;
            if (!s.books || s.books.length === 0) return;
            let total = 0;
            s.books.forEach(b => {
                const def = SCRIBE_KINDS[b.kind] || SCRIBE_KINDS['四書'];
                const price = def.prices[b.tier][1];
                total += price;
                this.addInv(b.kind, b.tier);
            });
            this.data.silver += total;
            s.books = [];
            s.lastClaimTs = Date.now();   // 自動續抄：時間戳重設
            this.showToast('取回抄本，共得 ' + total + ' 文錢，已續抄');
            window.FMCollectionSave.save(this.data);
            this.refreshHUD(); this.dirty = true;
        },

        addInv: function (name, tier) {
            const k = name + '_' + tier;
            this.data.inventory[k] = (this.data.inventory[k] || 0) + 1;
        },

        addSeedBag: function (name, tier) {
            const k = name + '_' + tier;
            this.data.seedBag[k] = (this.data.seedBag[k] || 0) + 1;
        },

        rollTier: function (seedTier, overdueLevel) {
            const dist = TIER_ROLL[seedTier] || TIER_ROLL['下品'];
            const r = Math.random();
            let acc = 0, picked = 0;
            for (let i = 0; i < dist.length; i++) { acc += dist[i]; if (r < acc) { picked = i; break; } }
            picked = Math.max(0, picked - (overdueLevel || 0));
            return TIERS[picked];
        },

        /* =====================================================
         * 商店（含 古玩 列表、擁有數量、可捲動）
         * ===================================================== */
        openShop: function () {
            this.hidePopup(); this.hideShop();
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
                    <div class="fm-collection-shop-tab" data-cat="curio">古玩</div>
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
            // 商店列表加上拖曳捲動 + 慣性滑行（抄成就紀錄的實作）
            this.attachDragScroll(shop.querySelector('#fmShopBody'));
        },

        /**
         * 為任意 overflow:auto 容器加上「拖曳捲動 + 慣性滑行」效果。
         * 邏輯完全抄自 achievement.js 「遊戲紀錄」面板，包括摩擦係數與權重。
         */
        attachDragScroll: function (el) {
            if (!el || el._fmDragScrollAttached) return;
            el._fmDragScrollAttached = true;

            let isDown = false, startY = 0, scrollTop = 0;
            let velocity = 0, lastY = 0, lastTime = 0;
            let momentumID = null;

            const startInertia = () => {
                const friction = 0.97;
                const step = () => {
                    if (Math.abs(velocity) < 0.1) { cancelAnimationFrame(momentumID); return; }
                    el.scrollTop -= velocity;
                    velocity *= friction;
                    momentumID = requestAnimationFrame(step);
                };
                momentumID = requestAnimationFrame(step);
            };

            el.addEventListener('mousedown', (e) => {
                if (e.target.tagName.toLowerCase() === 'button') return;
                isDown = true;
                startY = e.pageY - el.offsetTop;
                scrollTop = el.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.pageY; lastTime = Date.now();
            });
            el.addEventListener('mouseleave', () => { if (isDown) { isDown = false; startInertia(); } });
            el.addEventListener('mouseup',    () => { if (isDown) { isDown = false; startInertia(); } });
            el.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const y = e.pageY - el.offsetTop;
                const walk = (y - startY) * 1.5;
                el.scrollTop = scrollTop - walk;
                const now = Date.now(), dt = now - lastTime;
                if (dt > 0) {
                    const dy = e.pageY - lastY;
                    velocity = dy * 0.8;
                    lastTime = now; lastY = e.pageY;
                }
            });

            el.addEventListener('touchstart', (e) => {
                if (e.target.tagName.toLowerCase() === 'button') return;
                isDown = true;
                startY = e.touches[0].pageY - el.offsetTop;
                scrollTop = el.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.touches[0].pageY; lastTime = Date.now();
            }, { passive: false });
            el.addEventListener('touchmove', (e) => {
                if (!isDown) return;
                const y = e.touches[0].pageY - el.offsetTop;
                const walk = (y - startY) * 1.5;
                el.scrollTop = scrollTop - walk;
                const now = Date.now(), dt = now - lastTime;
                if (dt > 0) {
                    const dy = e.touches[0].pageY - lastY;
                    velocity = dy * 0.8;
                    lastTime = now; lastY = e.touches[0].pageY;
                }
            }, { passive: true });
            el.addEventListener('touchend', () => { if (isDown) { isDown = false; startInertia(); } });
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

            if (cat === 'pot' || cat === 'tea' || cat === 'wine' || cat === 'curio') {
                const kinds = (cat === 'pot') ? POT_KINDS
                            : (cat === 'tea') ? TEA_KINDS
                            : (cat === 'wine') ? WINE_KINDS
                            : CURIO_KINDS;
                const isCurio = (cat === 'curio');
                Object.keys(kinds).forEach(name => {
                    const def = kinds[name];
                    TIERS.forEach(tier => {
                        const buyPrice = def.prices[tier][0];
                        const ownKey = name + '_' + tier;
                        const own = isCurio
                            ? (self.data.inventory[ownKey] || 0)
                            : (self.data.seedBag[ownKey] || 0);
                        const tag = isCurio ? '' : (cat === 'wine' ? '米' : '種');
                        const row = document.createElement('div');
                        row.className = 'fm-collection-shop-row';
                        row.innerHTML =
                            '<span class="fm-collection-shop-name fm-collection-shop-tier-' + tier + '">' +
                            name + ' · ' + tier + tag +
                            ' <span class="fm-collection-shop-own">(擁有 ' + own + ')</span></span>' +
                            '<span class="fm-collection-shop-price">' + buyPrice + ' 文錢</span>';
                        const btn = document.createElement('button');
                        btn.className = 'fm-collection-shop-btn';
                        btn.textContent = '購買';
                        if (self.data.silver < buyPrice) btn.disabled = true;
                        btn.addEventListener('click', () => self.buy(cat, name, tier, buyPrice));
                        row.appendChild(btn);
                        body.appendChild(row);
                    });
                });

                // 種子/米：附「將擁有種子放下」按鈕
                if (!isCurio) {
                    Object.keys(kinds).forEach(name => {
                        TIERS.forEach(tier => {
                            const ownKey = name + '_' + tier;
                            const own = self.data.seedBag[ownKey] || 0;
                            if (own <= 0) return;
                            const row = document.createElement('div');
                            row.className = 'fm-collection-shop-row';
                            row.style.background = 'hsla(48, 60%, 88%, 1)';
                            row.innerHTML =
                                '<span class="fm-collection-shop-name fm-collection-shop-tier-' + tier + '">' +
                                '【倉】 ' + name + ' · ' + tier + (cat === 'wine' ? '米' : '種') + ' ×' + own +
                                '</span>' +
                                '<span class="fm-collection-shop-price">下種</span>';
                            const btn = document.createElement('button');
                            btn.className = 'fm-collection-shop-btn';
                            btn.textContent = '下種';
                            btn.addEventListener('click', () => self.plantFromBag(cat, name, tier));
                            row.appendChild(btn);
                            body.appendChild(row);
                        });
                    });
                }
            } else if (cat === 'inv') {
                const keys = Object.keys(this.data.inventory).filter(k => this.data.inventory[k] > 0);
                if (keys.length === 0) {
                    body.innerHTML = '<div style="color:#888;text-align:center;padding:20px">尚無存貨。</div>';
                    return;
                }
                keys.forEach(k => {
                    const parts = k.split('_'); const name = parts[0], tier = parts[1];
                    const def = POT_KINDS[name] || TEA_KINDS[name] || WINE_KINDS[name] || SCRIBE_KINDS[name] || CURIO_KINDS[name];
                    if (!def) return;
                    const price = def.prices[tier][1];
                    const cnt = this.data.inventory[k];
                    const row = document.createElement('div');
                    row.className = 'fm-collection-shop-row';
                    row.innerHTML =
                        '<span class="fm-collection-shop-name fm-collection-shop-tier-' + tier + '">' + name + ' · ' + tier + ' ×' + cnt + '</span>' +
                        '<span class="fm-collection-shop-price">' + price + ' 文錢/件</span>';
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
                        this.showToast('賣出 ' + name + ' ' + tier + '，得 ' + price + ' 文錢');
                    });
                    row.appendChild(btn);
                    body.appendChild(row);
                });
            }
        },

        /** 購買：花/茶/米 → 入種子袋(seedBag)；古玩 → 直接入存貨(inventory) */
        buy: function (cat, name, tier, buyPrice) {
            if (this.data.silver < buyPrice) { this.showToast('盤纏不足'); return; }
            this.data.silver -= buyPrice;
            if (cat === 'curio') {
                this.addInv(name, tier);
                this.showToast('購得 ' + name + ' ' + tier);
            } else {
                this.addSeedBag(name, tier);
                this.showToast('購得 ' + name + ' ' + tier + (cat === 'wine' ? '米' : '種') + '，已入倉庫');
            }
            window.FMCollectionSave.save(this.data);
            this.refreshHUD();
            this.renderShopBody(cat);
        },

        /** 從種子袋取出一個，下種到空槽 */
        plantFromBag: function (cat, name, tier) {
            const ownKey = name + '_' + tier;
            if ((this.data.seedBag[ownKey] || 0) <= 0) { this.showToast('倉庫無此種子'); return; }
            let slot = -1;
            if (cat === 'pot')  slot = this.data.plots.findIndex(p => !p.kind || p.stage === 'empty');
            else if (cat === 'tea')  slot = this.data.teas.findIndex(t => !t.kind || t.stage === 'empty');
            else if (cat === 'wine') slot = this.data.wines.findIndex(w => !w.kind || w.stage === 'empty');
            if (slot < 0) { this.showToast('已無空位'); return; }
            this.data.seedBag[ownKey]--;
            if (this.data.seedBag[ownKey] <= 0) delete this.data.seedBag[ownKey];
            const now = Date.now();
            if (cat === 'pot')  this.data.plots[slot] = { kind: name, seedTier: tier, plantedTs: now, lastWaterTs: now, missedWater: 0, stage: 'seedling' };
            else if (cat === 'tea')  this.data.teas[slot] = { kind: name, seedTier: tier, plantedTs: now, lastWaterTs: now, missedWater: 0, stage: 'growing' };
            else if (cat === 'wine') this.data.wines[slot] = { kind: name, riceTier: tier, startTs: now, stage: 'brewing' };
            // 首次有作物 → 啟動井倒數
            if ((cat === 'pot' || cat === 'tea') && (!this.data.wellTimerEndTs || this.data.wellTimerEndTs <= 0)) {
                this.data.wellTimerEndTs = now + WATER_INTERVAL;
            }
            window.FMCollectionSave.save(this.data);
            this.refreshHUD(); this.renderShopBody(cat); this.dirty = true;
            this.showToast('已下種 ' + name + ' ' + tier);
        },

        /* =====================================================
         * 考棚（積分、入場費、雙鉤子顯示）
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
                const scoreGap = score - need;
                const silverGap = this.data.silver - fee;
                const scoreCell = (scoreGap >= 0)
                    ? need.toLocaleString() + ' <span class="fm-collection-gap-ok">(已達)</span>'
                    : need.toLocaleString() + ' <span class="fm-collection-gap-red">(' + scoreGap.toLocaleString() + ')</span>';
                const feeCell = (silverGap >= 0)
                    ? fee + ' 文錢 <span class="fm-collection-gap-ok">(已達)</span>'
                    : fee + ' 文錢 <span class="fm-collection-gap-red">(' + silverGap.toLocaleString() + ')</span>';
                html += '<div class="fm-collection-popup-row"><span>下一文位</span><span>' + nextRank.name + '</span></div>';
                html += '<div class="fm-collection-popup-row"><span>積分門檻</span><span>' + scoreCell + '</span></div>';
                html += '<div class="fm-collection-popup-row"><span>入場費</span><span>' + feeCell + '</span></div>';
                const okScore = (scoreGap >= 0), okSilver = (silverGap >= 0);
                if (!okScore) html += '<div class="fm-collection-popup-row" style="color:#888">學問未足，請再勤工。</div>';
                else if (!okSilver) html += '<div class="fm-collection-popup-row" style="color:#aa3">學問已成，盤纏未足。請再勤工或變賣盆中之物。</div>';
                else html += '<button class="fm-collection-popup-btn" data-act="exam">報考 ' + nextRank.name + '（扣 ' + fee + ' 文錢）</button>';
            }
            this.showPopup(html, e => {
                if (e.target.getAttribute('data-act') === 'exam') this.takeExam(nextRank);
                this.hidePopup();
            });
        },

        getCurrentScore: function () {
            try { if (window.ScoreManager) return window.ScoreManager.loadPlayerData().totalScore || 0; }
            catch (e) {}
            return 0;
        },

        nextExamRank: function () {
            const passed = this.data.ranks.passed || [];
            const ranks = (window.ScoreManager && window.ScoreManager.ranks) || [];
            for (const r of ranks) {
                if (EXAM_RANKS_ORDER.indexOf(r.name) >= 0 && passed.indexOf(r.name) < 0) return r;
            }
            return null;
        },

        takeExam: function (rank) {
            const fee = EXAM_FEES[rank.name];
            if (this.data.silver < fee) { this.showToast('盤纏不足'); return; }
            this.data.silver -= fee;
            const score = this.getCurrentScore();
            const ratio = score / rank.minScore;
            const passProb = Math.min(0.95, Math.max(0.4, 0.4 + (ratio - 1) * 0.5));
            const pass = (Math.random() < passProb);
            this.data.examLog.push({ rank: rank.name, ts: Date.now(), pass });
            if (pass) { this.data.ranks.passed.push(rank.name); this.showToast('金榜題名！晉升 ' + rank.name); }
            else this.showToast('名落孫山，扣費 ' + fee + ' 文錢，可再試。');
            window.FMCollectionSave.save(this.data);
            this.refreshHUD();
        },

        /* =====================================================
         * popup / toast
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
