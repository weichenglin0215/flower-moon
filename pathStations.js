/* ==========================================================================
   花月 · 學習道路站點計算 (pathStations.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路與關卡模式_企畫書.md 第六章「積分節奏與文位門檻推算」

   ── 這個模組做什麼 ──────────────────────────────────────────────────
   把 scoreManager.js 既有的 15 個文位門檻（倍增數列），
   依「每隔幾天該有一個小站」的節奏，切成一連串可視化的站點，
   讓玩家每天玩完都能看到自己在路上往前挪一格。

   ⚠️ 絕對不可更動既有文位門檻：
      門檻表是 scoreManager.js 的 ranks 陣列（書僮 0 ～ 大儒 81,920,000），
      本模組只在「兩個既有文位之間」插入小站，不新增也不修改任何文位。

   ── 小站密度（依作者指定）────────────────────────────────────────────
      書僮～童生      每 1 天一個小站
      童生～縣案首    每 2 天一個小站
      府案首～秀才    每 3 天一個小站
      舉人～進士      每 4 天一個小站
      探花～榜眼      每 5 天一個小站
      狀元～大儒      每 7 天一個小站

   ── 每日產出估計（企畫書第 6.1 節）──────────────────────────────────
      以「蒙童 10,000 分需兩天」為錨點反推摩擦係數 ≈ 0.667，
      得各難度層每天實際可得分數：小學 5,000／中學 12,000／
      高中 20,000／大學 40,000／研究所 60,000。
   ========================================================================== */

(function () {
    'use strict';

    // 每個區段的設定：[起始文位, 難度層, 每日產出, 每幾天一個小站]
    // 區段的「終點」即為下一個文位，門檻直接取自 ScoreManager.ranks。
    const SEGMENTS = [
        ['書僮', '小學', 5000, 1],
        ['蒙童', '小學', 5000, 1],
        ['塾生', '小學', 5000, 1],
        ['童生', '小學', 5000, 2],
        ['縣案首', '中學', 12000, 3],
        ['府案首', '中學', 12000, 3],
        ['文童', '中學', 12000, 3],
        ['秀才', '高中', 20000, 4],
        ['舉人', '高中', 20000, 4],
        ['貢士', '高中', 20000, 4],
        ['進士', '大學', 40000, 5],
        ['探花', '大學', 40000, 5],
        ['榜眼', '研究所', 60000, 7],
        ['狀元', '研究所', 60000, 7]
    ];

    // 中文數字（小站序號顯示用，超過十以阿拉伯數字呈現）
    const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

    // ── 各難度層「玩一關大約可得幾分」──────────────────────────────────
    // ⚠️ 這組數字決定「一個站點裡面有幾道題」，是整個學習道路的節奏基準。
    //   例如小學每關約 200 分，而書僮→書僮一的差距是 5,000 分，
    //   代表玩家要在這一站玩 25 題才會升到下一站。
    //   （早期版本誤把「一站 = 一題」，導致玩家只玩一題靜夜思就要升級，邏輯不通。）
    const POINTS_PER_LEVEL = {
        '小學': 200, '中學': 600, '高中': 1000, '大學': 2000, '研究所': 3000
    };

    const PathStations = {
        _cache: null,
        _ranks: null,   // Node 環境注入用

        /** Node 環境（驗證腳本）注入 ranks */
        inject: function (ranks) {
            this._ranks = ranks;
            this._cache = null;
        },

        getRanks: function () {
            if (this._ranks) return this._ranks;
            if (typeof window !== 'undefined' && window.ScoreManager && window.ScoreManager.ranks) {
                return window.ScoreManager.ranks;
            }
            return [];
        },

        /**
         * 建立完整站點清單（含文位站與小站），依累積分數由低到高排列。
         *
         * 每一站的欄位：
         *   type      'rank' = 正式文位站／'minor' = 小站
         *   name      顯示名稱（小站為「童生 三」這種形式）
         *   rankName  所屬文位（小站沿用其前一個文位的名稱）
         *   score     達成該站所需的累積分數
         *   tier      該站對應的難度層（決定要取哪一層的關卡）
         *   levelIndex 該站要玩關卡表中的第幾關（同一難度層內遞增）
         *   isExam    是否需要通過科舉考試才能取得（縣案首以後的文位站）
         *
         * @returns {Array}
         */
        build: function () {
            if (this._cache) return this._cache;

            const ranks = this.getRanks();
            if (!ranks.length) return [];

            const byName = {};
            ranks.forEach(r => { byName[r.name] = r.minScore; });

            // 縣案首（含）之後的文位必須通過考試才能取得（見 exam.js 四步驟流程）
            const EXAM_FROM = ranks.findIndex(r => r.name === '縣案首');

            const stations = [];
            // 題號與關卡編號改在下方的後處理統一計算（見 startQuestion / levelIndex）
            const pushStation = (st) => { stations.push(st); };

            // 起點：書僮（0 分，自動取得）
            pushStation({
                type: 'rank', name: '書僮', rankName: '書僮',
                score: 0, tier: '小學', isExam: false
            });

            for (let i = 0; i < SEGMENTS.length; i++) {
                const [fromName, tier, dailyRate, intervalDays] = SEGMENTS[i];
                const toName = ranks[ranks.findIndex(r => r.name === fromName) + 1];
                if (!toName) break;

                const fromScore = byName[fromName];
                const toScore = toName.minScore;
                const gap = toScore - fromScore;

                // 這一段要花幾天 → 該切成幾站 → 中間插幾個小站
                const days = gap / dailyRate;
                const stationCount = Math.max(1, Math.round(days / intervalDays));
                const minorCount = Math.max(0, stationCount - 1);

                // 小站：把分數差平均分配
                for (let m = 1; m <= minorCount; m++) {
                    const label = m <= 10 ? CN_NUM[m] : String(m);
                    pushStation({
                        type: 'minor',
                        name: fromName + ' ' + label,
                        rankName: fromName,
                        score: Math.round(fromScore + gap * m / stationCount),
                        tier: tier,
                        isExam: false
                    });
                }

                // 區段終點的正式文位站
                const toIdx = ranks.findIndex(r => r.name === toName.name);
                pushStation({
                    type: 'rank',
                    name: toName.name,
                    rankName: toName.name,
                    score: toScore,
                    tier: tier,
                    isExam: EXAM_FROM >= 0 && toIdx >= EXAM_FROM
                });
            }

            // ── 計算每一站「包含幾道題」與「起始題號」────────────────────
            // 題數 = 該站到下一站的積分差 ÷ 該難度層每關可得分數。
            // 起始題號在**同一個難度層內**連續累計，因此會是
            //   書僮 = 小學 1、書僮一 = 小學 26、蒙童 = 小學 51 …
            // 這正是玩家在介面上看到的編號。
            // ⚠️ 先修正「難度層轉換點」的歸屬：
            //   文位站是前一個區段的終點、同時也是下一個區段的起點。
            //   若沿用前一個區段的難度層，會出現「用小學的每關分數（200）去除
            //   中學規模的積分差（40,000）」而算出 200 道題的荒謬結果。
            //   實際上玩家走到縣案首時就該進入中學內容，因此文位站一律
            //   改採「後面那一段」的難度層。
            for (let i = 0; i < stations.length - 1; i++) {
                if (stations[i].type === 'rank') {
                    stations[i].tier = stations[i + 1].tier;
                }
            }

            const tierQuestionCounter = {};
            for (let i = 0; i < stations.length; i++) {
                const st = stations[i];
                const next = stations[i + 1];
                const per = POINTS_PER_LEVEL[st.tier] || 200;

                if (!tierQuestionCounter[st.tier]) tierQuestionCounter[st.tier] = 1;
                st.startQuestion = tierQuestionCounter[st.tier];

                // 最後一站（大儒）之後沒有下一站，給一個象徵性的題數
                st.questionCount = next
                    ? Math.max(1, Math.round((next.score - st.score) / per))
                    : 50;

                tierQuestionCounter[st.tier] += st.questionCount;
            }

            this.assignPoems(stations);

            this._cache = stations;
            return stations;
        },

        // ── 一個文位站要學幾首詩 ────────────────────────────────────────
        // 作者定案：初學階段 2~3 首混合學習較有趣，超過 3 首就太混淆。
        // 但高文位的一站題數會暴增（研究所單站可達 139 題），
        // 若仍死守 3 首，同一首詩要連續練 20 輪以上，玩家必然生膩。
        // 因此改為「以重複輪數為準」推算：讓每道題大約重複 REPEAT_TARGET 輪，
        // 再以 MIN/MAX 夾住，確保小學仍維持作者驗證過的 3 首。
        POEMS_MIN: 3,
        POEMS_MAX: 10,
        REPEAT_TARGET: 5,      // 每道題大約重複幾輪（越小則詩越多、越不重複）
        AVG_UNITS_PER_POEM: 2.5, // 一首詩平均可拆出幾道題（依實際題庫估算）

        /** 依該站題數推算應該配幾首詩 */
        poemsForStation: function (questionCount) {
            const want = Math.round(questionCount / (this.REPEAT_TARGET * this.AVG_UNITS_PER_POEM));
            return Math.max(this.POEMS_MIN, Math.min(this.POEMS_MAX, want));
        },

        /**
         * 指派每一個站點要學的詩詞，並建立該站的關卡池。
         *
         * ── 為什麼要這樣做 ──────────────────────────────────────────────
         * 初版讓題號在整個難度層裡一路遞增，結果書僮一站就掃過 9 首詩，
         * 玩家等於每題都在讀新詩，根本記不住。
         * 正確作法是：**每個文位只固定學 2~3 首詩，在這幾首裡反覆循環**，
         * 下一個文位再往前挪一點，讓前一站的詩繼續複習幾輪才淡出。
         *
         * 作法是對該難度層的詩詞清單開一個「滑動視窗」：
         *   第 i 站取 poems[i*stride] 起的 3 首。
         * 小學為 12 首詩、12 站，stride 剛好為 1，
         * 因此每首詩會連續出現在 3 個文位中，反覆學 3 輪才換掉。
         *   書僮 = 靜夜思、相思、遊子吟
         *   書僮一 = 相思、遊子吟、水調歌頭
         *   蒙童  = 遊子吟、水調歌頭、春曉 …
         */
        assignPoems: function (stations) {
            const LT = (typeof window !== 'undefined' && window.LevelTable)
                ? window.LevelTable : this._levelTable;
            if (!LT) return;

            // 依難度層分組，計算各層的站數
            const byTier = {};
            stations.forEach(st => {
                if (!byTier[st.tier]) byTier[st.tier] = [];
                byTier[st.tier].push(st);
            });

            Object.keys(byTier).forEach(tier => {
                const list = byTier[tier];
                const poems = LT.getTierPoemOrder(tier);
                if (!poems.length) return;

                // 視窗每站前進多少首詩。取 floor(詩數/站數) 可讓整層的詩盡量被用到；
                // 但不得超過視窗大小，否則會跳過中間的詩。
                const baseWin = Math.min(this.POEMS_MIN, poems.length);
                const stride = Math.max(1, Math.min(baseWin, Math.floor(poems.length / list.length)));

                list.forEach((st, i) => {
                    // 視窗大小依該站題數而定：題數越多、配的詩越多，避免高文位一直重複
                    const win = Math.min(this.poemsForStation(st.questionCount), poems.length);
                    const start = (i * stride) % poems.length;
                    const ids = [];
                    for (let k = 0; k < win; k++) ids.push(poems[(start + k) % poems.length]);
                    st.poemIds = ids;
                    // 這一站可用的關卡（只含這幾首詩的題目），題目在其中隨機挑選
                    st.levelPool = LT.getLevelsForPoems(tier, ids);
                    if (!st.levelPool.length) st.levelPool = [1];
                    st.levelIndex = st.levelPool[0];
                });
            });
        },

        /** Node 環境注入 LevelTable（供離線腳本使用） */
        injectLevelTable: function (lt) {
            this._levelTable = lt;
        },

        /**
         * 取得某一站的第 n 道題該玩哪一關（n 自 1 起算）。
         * 題目在該站的關卡池裡循環，因此玩家會反覆遇到同一小批詩。
         */
        getStationLevel: function (station, n) {
            const pool = (station && station.levelPool) || [1];
            return pool[(n - 1) % pool.length];
        },

        /**
         * 把「累計題號」換算成關卡表中實際的關卡編號。
         *
         * ⚠️ 為什麼需要取餘數：小學只有 12 首詩、約 30 道題，
         *    但小學層總共要供應 13 個站點 × 每站 25 題 ≈ 325 題。
         *    因此同一批題目必然會重複出現 —— 這正是設計本意：
         *    「同一首詩，用不同遊戲反覆學」。重複時搭配的遊戲會輪替，
         *    所以玩家不會覺得是在做完全一樣的事。
         */
        toLevelIndex: function (tier, questionNo) {
            const total = (typeof window !== 'undefined' && window.LevelTable)
                ? window.LevelTable.getLevelCount(tier)
                : (this._levelCounts ? this._levelCounts[tier] : 0);
            if (!total || total <= 0) return 1;
            return ((questionNo - 1) % total) + 1;
        },

        /** Node 環境注入各難度層的關卡數（供離線腳本使用） */
        injectLevelCounts: function (counts) {
            this._levelCounts = counts;
        },

        /** 依玩家目前累積分數，取得所在站的索引（尚未達成第一站時回傳 0） */
        getCurrentIndex: function (totalScore) {
            const stations = this.build();
            let idx = 0;
            for (let i = 0; i < stations.length; i++) {
                if (totalScore >= stations[i].score) idx = i;
                else break;
            }
            return idx;
        },

        /** 統計資訊（供驗證腳本與企畫書對帳用） */
        getStats: function () {
            const stations = this.build();
            const stats = {
                total: stations.length,
                rank: stations.filter(s => s.type === 'rank').length,
                minor: stations.filter(s => s.type === 'minor').length,
                byTier: {}
            };
            stations.forEach(s => {
                stats.byTier[s.tier] = (stats.byTier[s.tier] || 0) + 1;
            });
            return stats;
        }
    };

    if (typeof window !== 'undefined') window.PathStations = PathStations;
    if (typeof module !== 'undefined' && module.exports) module.exports = PathStations;
})();
