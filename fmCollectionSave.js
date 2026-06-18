/**
 * 江南小院收集系統 — 存檔層（SaveManager）
 * 依專案規範：模組外禁止直呼 localStorage，請統一透過 window.FMCollectionSave
 *
 * 存檔結構（v1）：
 * {
 *   version: 1,
 *   silver: number,                  // 文錢（不是兩）
 *   ranks: { passed: ['縣案首', ...] },// 已通過考試的文位
 *   plots:  [ Plot, Plot, Plot, Plot ],
 *   teas:   [ Tea,  Tea  ],
 *   wines:  [ Wine, Wine, Wine ],
 *   scribe: { books: [ Book ], deskCap: 4 },
 *   inventory: { '蘭_上品': 3, ... },
 *   examLog: [ { rank, ts, pass } ],
 *   timestamps: { lastSeen: number, lastSaved: number }
 * }
 */
(function () {
    'use strict';

    const KEY = 'flowerMoon_collection_v1';

    const FMCollectionSave = {
        defaultData: function () {
            return {
                version: 2,
                silver: 200,  // 初始給少量盤纏
                ranks: { passed: [] },
                plots:  [ this.emptyPlot(), this.emptyPlot(), this.emptyPlot(), this.emptyPlot() ],
                teas:   [ this.emptyTea(), this.emptyTea() ],
                teaHouses: [ this.emptyTeaHouse(), this.emptyTeaHouse() ],
                wines:  [ this.emptyWine(), this.emptyWine(), this.emptyWine() ],
                scribe: { books: [], deskCap: 1, lastClaimTs: 0 },
                inventory: {},      // 一般收成
                seedBag: {},        // 從商店買的種子/米/古玩存放處（key='品種_品級'）
                examLog: [],
                wellTimerEndTs: 0,  // 井倒數到期時間；只在玩家點井澆水時才重置
                timestamps: { lastSeen: Date.now(), lastSaved: Date.now() }
            };
        },

        emptyPlot:     function () { return { kind: null, seedTier: null, plantedTs: 0, lastWaterTs: 0, missedWater: 0, stage: 'empty' }; },
        emptyTea:      function () { return { kind: null, seedTier: null, plantedTs: 0, lastWaterTs: 0, missedWater: 0, stage: 'empty' }; },
        emptyTeaHouse: function () { return { kind: null, seedTier: null, bakeStartTs: 0, stage: 'empty' }; },
        emptyWine:     function () { return { kind: null, riceTier: null, startTs: 0, stage: 'empty' }; },

        load: function () {
            let raw = null;
            try { raw = localStorage.getItem(KEY); } catch (e) { /* iOS private mode */ }
            if (!raw) return this.defaultData();
            try {
                const d = JSON.parse(raw);
                return this.migrate(d);
            } catch (e) {
                console.warn('[FMCollectionSave] 解析失敗，重置:', e);
                return this.defaultData();
            }
        },

        save: function (data) {
            if (!data) return false;
            data.timestamps = data.timestamps || {};
            data.timestamps.lastSaved = Date.now();
            try {
                localStorage.setItem(KEY, JSON.stringify(data));
                return true;
            } catch (e) {
                console.error('[FMCollectionSave] 寫入失敗:', e);
                return false;
            }
        },

        /** 時間戳防回撥：玩家若調快系統時間 → 不認帳，視為與上次 lastSeen 相同 */
        normalizeNow: function (data) {
            const now = Date.now();
            const last = (data.timestamps && data.timestamps.lastSeen) || now;
            if (now < last) return last;  // 時間倒退 → 鎖在 last
            return now;
        },

        markSeen: function (data) {
            data.timestamps = data.timestamps || {};
            data.timestamps.lastSeen = Date.now();
        },

        migrate: function (data) {
            const def = this.defaultData();
            if (!data || typeof data !== 'object') return def;
            data.version = 2;
            data.silver = (typeof data.silver === 'number') ? data.silver : def.silver;
            data.ranks = data.ranks || def.ranks;
            if (!Array.isArray(data.ranks.passed)) data.ranks.passed = [];
            ['plots','teas','wines','teaHouses'].forEach(k => { if (!Array.isArray(data[k])) data[k] = def[k]; });
            while (data.plots.length < 4) data.plots.push(this.emptyPlot());
            while (data.teas.length  < 2) data.teas.push(this.emptyTea());
            while (data.teaHouses.length < 2) data.teaHouses.push(this.emptyTeaHouse());
            while (data.wines.length < 3) data.wines.push(this.emptyWine());
            data.scribe = data.scribe || def.scribe;
            if (!Array.isArray(data.scribe.books)) data.scribe.books = [];
            if (typeof data.scribe.deskCap !== 'number') data.scribe.deskCap = 1;
            if (typeof data.scribe.lastClaimTs !== 'number') data.scribe.lastClaimTs = 0;
            data.inventory = data.inventory || {};
            data.seedBag   = data.seedBag   || {};
            data.examLog = Array.isArray(data.examLog) ? data.examLog : [];
            if (typeof data.wellTimerEndTs !== 'number') data.wellTimerEndTs = 0;
            data.timestamps = data.timestamps || { lastSeen: Date.now(), lastSaved: Date.now() };
            return data;
        },

        /** 匯出存檔成 JSON 字串（給玩家備份） */
        exportJSON: function () {
            const d = this.load();
            return JSON.stringify(d, null, 2);
        },

        importJSON: function (str) {
            try {
                const d = JSON.parse(str);
                const safe = this.migrate(d);
                return this.save(safe);
            } catch (e) {
                console.error('[FMCollectionSave] importJSON 失敗:', e);
                return false;
            }
        },

        reset: function () {
            try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        }
    };

    window.FMCollectionSave = FMCollectionSave;
})();
