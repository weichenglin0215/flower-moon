/* ==========================================================================
   花月 · 青雲梯站點計算 (pathStations.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路_重新規劃企劃書.md
     第五章 文位節奏與四階小稱號
     第八章 必通關卡：定義與規則

   ── 這個模組做什麼 ──────────────────────────────────────────────────
   把「玩家已經學會幾首詩」換算成青雲梯上的一連串站點。

   ⚠️ 與舊版最大的差異：站點不再由積分推算 ───────────────────────────
      舊版：站點 = 積分區間（積分差 ÷ 每關得分 = 該站題數）。
            這代表玩家反覆刷低難度遊戲累積積分就能一路升到大儒，
            並沒有真的學會詩詞。
      新版：站點 = 已學詩詞數的里程碑。積分完全不參與進度判定，
            只留在排行榜與統計（見企畫書第六章「四種數值的角色分工」）。

   ── 節奏設計（企畫書 5.1 / 5.2）────────────────────────────────────
      每週學 1~2 首、每月約 8 首 → 前八個文位剛好一個月一個。
      每個文位再切成 4 階（本階／二階／三階／準下一階），
      一階 = 該文位所需詩數 ÷ 4，前期恰好一週一階。
   ========================================================================== */

(function () {
    'use strict';

    // ── 文位里程碑：累積「已學會（⭑⭑ 以上）」的詩詞首數 ────────────────
    // 依企畫書第 5.1 節。前八個文位每月一個（每月 8 首），
    // 之後拉長到 2~3.5 個月一個 —— 後期玩家內在動機已足，不需密集外部獎勵。
    // ⚠️ 這張表取代了舊版以 scoreManager.ranks 積分門檻推算站點的作法。
    //    ranks 的積分數值本身**完全保留不動**，只是不再作為升等判定依據。
    const RANK_MILESTONES = [
        { name: '書僮', poems: 0 },
        { name: '蒙童', poems: 8 },
        { name: '塾生', poems: 16 },
        { name: '童生', poems: 24 },
        { name: '縣案首', poems: 32 },   // 自此起需通過考試才能取得
        { name: '府案首', poems: 40 },
        { name: '文童', poems: 52 },
        { name: '秀才', poems: 64 },    // 評價 7~6 全數完成
        { name: '舉人', poems: 84 },
        { name: '貢士', poems: 110 },
        { name: '進士', poems: 142 },   // 評價 7~5 全數完成
        { name: '探花', poems: 170 },
        { name: '榜眼', poems: 198 },
        { name: '狀元', poems: 226 },   // 評價 7~4 全數完成
        { name: '大儒', poems: -1 }     // -1 = 取實際題庫上限（見 build）
    ];

    // 縣案首（含）以後的文位站需通過考試（沿用 exam.js 既有的四步驟流程）
    const EXAM_FROM_RANK = '縣案首';

    // ── 小站節奏（作者定案）──────────────────────────────────────────
    // 小站的用途是讓玩家有短期成就感，因此改以**時間**為準而非固定階數：
    //   小學、中學程度 → 每 1 週一小站
    //   高中程度       → 每 2 週一小站
    //   大學、研究所   → 每 3 週一小站
    // 以「每週學 2 首」換算，即可得出一站該放幾首詩。
    const POEMS_PER_WEEK = 2;
    const WEEKS_PER_STATION = {
        '小學': 1, '中學': 1, '高中': 2, '大學': 3, '研究所': 3
    };

    // ── 必通關卡的單元挑選（作者定案）────────────────────────────────
    // 一首詩不是每一聯都值得列入必修 ——〈長恨歌〉有 120 句，
    // 全列入的話一站要通關 192 次，是隔壁站（兩首絕句只要 12 次）的 16 倍。
    //
    // 正確的判準是**詩句評價**：只取「詩句評價夠得上這首詩水準」的句子。
    //   例：〈長恨歌〉詩評價 6，取詩句評價 6 或 5 的句子，
    //       正好涵蓋「天生麗質難自棄／一朝選在君王側／
    //       回眸一笑百媚生／六宮粉黛無顏色」這幾聯。
    //
    // 寬容度 RATING_TOLERANCE：避免某些詩只有一兩句剛好達標。
    // 若放寬後仍不足 MIN_UNITS，就改取該詩「詩句評價最高」的前幾聯。
    const RATING_TOLERANCE = 1;
    const MIN_UNITS_PER_POEM = 2;
    const MAX_UNITS_PER_POEM = 6;

    // 中文數字（階序顯示用）
    const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
        '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

    // 難度層的學習順序。青雲梯依此把整個題庫串成一條「學習序列」。
    const TIER_SEQ = ['小學', '中學', '高中', '大學', '研究所'];

    // ── 一關要用幾種不同的提取方式通過（企畫書 8.2）────────────────────
    // 必通關卡數 = 該詩的題目單元數 × 3 種不同提取方式。
    // 這個「×3」不只是計數，它保證每一首詩都被三種不同的記憶通道各碰過一次。
    const CHANNELS_PER_LEVEL = 3;

    const PathStations = {
        _cache: null,
        _learnOrder: null,
        _poemUnits: null,
        _levelTable: null,   // Node 環境注入用

        /** Node 環境（驗證腳本）注入 LevelTable */
        injectLevelTable: function (lt) {
            this._levelTable = lt;
            this._cache = null;
            this._learnOrder = null;
            this._poemUnits = null;
        },

        getLevelTable: function () {
            if (this._levelTable) return this._levelTable;
            if (typeof window !== 'undefined' && window.LevelTable) return window.LevelTable;
            return null;
        },

        /**
         * 建立「學習序列」：把整個題庫串成一條由易到難的詩詞清單。
         *
         * ── 排列規則 ────────────────────────────────────────────────────
         * 1. 依難度層順序走過每一層，只取「這一層才第一次出現」的詩。
         *    因為各層的評價區間刻意重疊（中學 6~7、高中 5~6 …），
         *    重疊的部分是複習用的，不該重複計入「已學首數」。
         * 2. 同一層內新出現的詩再依**評價由高到低**排序（易→難）。
         *    ⚠️ 關卡表本身是評價遞增排序（該層核心新教材優先），
         *       這在中學（6~7）是對的，但研究所（2~4）會把最艱澀的
         *       評價 2 排到評價 3 前面。青雲梯是課程順序，必須由易到難。
         *
         * 產出的累積首數：12 / 64 / 142 / 226 / 301 / 346
         * （評價 7→2。評價 1 的 35 首未納入任何難度層，故題庫上限為 346。）
         *
         * @returns {Array<{id:number, tier:string, rating:number}>}
         */
        buildLearnOrder: function () {
            if (this._learnOrder) return this._learnOrder;

            const LT = this.getLevelTable();
            if (!LT) return [];

            const poems = LT.getPoems ? LT.getPoems() : [];
            const ratingById = {};
            poems.forEach(p => { ratingById[p.id] = p.rating || 0; });

            const seen = {};
            const order = [];

            TIER_SEQ.forEach(tier => {
                const fresh = [];
                LT.getTierPoemOrder(tier).forEach((pid, idx) => {
                    if (seen[pid]) return;
                    seen[pid] = true;
                    fresh.push({ id: pid, tier: tier, rating: ratingById[pid] || 0, ord: idx });
                });
                // 評價高（易）者先學；同評價則維持關卡表原本的順序
                fresh.sort((a, b) => (b.rating - a.rating) || (a.ord - b.ord));
                fresh.forEach(f => order.push({ id: f.id, tier: f.tier, rating: f.rating }));
            });

            this._learnOrder = order;
            return order;
        },

        /** 題庫實際可供學習的詩詞總數 */
        getTotalPoems: function () {
            return this.buildLearnOrder().length;
        },

        /**
         * 建立完整站點清單，依學習順序由前往後排列。
         *
         * 每一站的欄位：
         *   type          'rank' = 正式文位站／'grade' = 文位內的階
         *   name          顯示名稱（「蒙童」「蒙童二階」「準塾生」）
         *   rankName      所屬文位
         *   gradeIndex    在該文位內是第幾階（0 = 文位本身）
         *   poemFrom      這一站開始時玩家應已學會的首數（= 進入門檻）
         *   poemTo        走完這一站時應學會的首數
         *   poemIds       這一站要學的詩（id 陣列）
         *   tier          主要難度層（跨層時取第一首詩所屬的層）
         *   units         必通關卡清單 [{ tier, level }]
         *   requiredClears 必通關卡總數 = units.length × 3（三種提取方式）
         *   isExam        是否需要通過考試（縣案首以後的文位站）
         *
         * @returns {Array}
         */
        build: function () {
            if (this._cache) return this._cache;

            const LT = this.getLevelTable();
            if (!LT) return [];

            const learnOrder = this.buildLearnOrder();
            const total = learnOrder.length;
            if (!total) return [];

            // 大儒 = 題庫上限
            const milestones = RANK_MILESTONES.map(m =>
                ({ name: m.name, poems: m.poems < 0 ? total : Math.min(m.poems, total) }));

            const examFromIdx = milestones.findIndex(m => m.name === EXAM_FROM_RANK);

            const stations = [];

            for (let i = 0; i < milestones.length; i++) {
                const cur = milestones[i];
                const next = milestones[i + 1];

                // 文位站本身
                stations.push({
                    type: 'rank',
                    name: cur.name,
                    rankName: cur.name,
                    gradeIndex: 0,
                    poemFrom: cur.poems,
                    isExam: examFromIdx >= 0 && i >= examFromIdx
                });

                if (!next) break;

                // ── 文位內的各階（二階／三階／…／準下一個文位）──────────
                // 階數不再固定，改由「幾週該有一小站」推算：
                //   一站的詩數 = 每週學幾首 × 該難度層幾週一站
                //   → 小學/中學 2 首、高中 4 首、大學/研究所 6 首
                // 難度層取這一段**最後一首詩**所屬的層（較進階的內容主導節奏）。
                const span = next.poems - cur.poems;
                if (span <= 0) continue;

                const segTier = learnOrder[Math.min(next.poems - 1, total - 1)].tier;
                const perStation = POEMS_PER_WEEK * (WEEKS_PER_STATION[segTier] || 1);
                const gradeCount = Math.max(1, Math.ceil(span / perStation));

                for (let k = 1; k < gradeCount; k++) {
                    const at = cur.poems + Math.round(span * k / gradeCount);
                    if (at <= cur.poems || at >= next.poems) continue;
                    stations.push({
                        type: 'grade',
                        // 最後一階一律叫「準X」，讓玩家知道下一站就是新文位
                        name: (k === gradeCount - 1)
                            ? '準' + next.name
                            : cur.name + (CN_NUM[k + 1] || String(k + 1)) + '階',
                        rankName: cur.name,
                        gradeIndex: k,
                        poemFrom: at,
                        isExam: false
                    });
                }
            }

            // ── 後處理：算出每一站涵蓋的詩、必通關卡與難度層 ────────────
            for (let i = 0; i < stations.length; i++) {
                const st = stations[i];
                const next = stations[i + 1];
                st.poemTo = next ? next.poemFrom : total;

                const slice = learnOrder.slice(st.poemFrom, st.poemTo);
                st.poemIds = slice.map(p => p.id);
                st.tier = slice.length ? slice[0].tier : (stations[i - 1] ? stations[i - 1].tier : '小學');

                // 必通關卡：把這一站的詩，依各自所屬的難度層取出全部關卡。
                // ⚠️ 一站有可能跨難度層（例如小學只有 12 首，塾生那一站就會
                //    橫跨小學與中學），因此關卡必須連同 tier 一起記錄。
                const units = [];
                slice.forEach(p => {
                    this.selectUnitsForPoem(p.id, p.tier).forEach(u => units.push(u));
                });

                st.units = units;
                st.requiredClears = units.length * CHANNELS_PER_LEVEL;
            }

            this._cache = stations;
            return stations;
        },

        /**
         * 挑出某首詩要列入必通關卡的單元（關卡編號）。
         *
         * ── 判準：詩句評價 ──────────────────────────────────────────────
         * 只取「詩句評價夠得上這首詩水準」的聯句，門檻 = 詩評價 − 寬容度。
         * 例：〈長恨歌〉詩評價 6 → 門檻 5 → 取到「天生麗質難自棄／
         *     一朝選在君王側／回眸一笑百媚生／六宮粉黛無顏色」等聯。
         *
         * ⚠️ 一個「單元」是關卡表裡的一關，起始句由關卡表決定；
         *    本函式只負責從該詩既有的關卡中挑選，不會自行造關，
         *    因此挑出來的一定是合法且**連續**的句組
         *    （levelTable 的 _expandLines 一律自起始句往後連續擴充，
         *      遇到空行即停，絕不跨段落拼接 —— 字爬梯這類整首／整段
         *      題型因此不會拿到東拼西湊的句子）。
         *
         * @returns {Array<{tier:string, level:number}>}
         */
        selectUnitsForPoem: function (poemId, tier) {
            const LT = this.getLevelTable();
            if (!LT) return [];

            const levels = LT.getLevelsForPoems(tier, [poemId]);
            if (!levels.length) return [];

            const poems = LT.getPoems ? LT.getPoems() : [];
            let poem = null;
            for (let i = 0; i < poems.length; i++) {
                if (poems[i].id === poemId) { poem = poems[i]; break; }
            }
            if (!poem) return levels.slice(0, MIN_UNITS_PER_POEM)
                .map(lv => ({ tier: tier, level: lv }));

            const lr = poem.line_ratings || [];
            // 每一關的分數 = 該關起始兩句的詩句評價取較低者
            const scored = levels.map(lv => {
                const entry = LT.getLevelEntry(tier, lv);
                const s = entry ? entry.s : 0;
                const a = lr[s] || 0, b = lr[s + 1] || 0;
                return { level: lv, score: Math.min(a, b), start: s };
            });

            const threshold = (poem.rating || 0) - RATING_TOLERANCE;
            let picked = scored.filter(x => x.score >= threshold);

            // 達標的聯句太少 → 改取詩句評價最高的前幾聯（評價相同則取較前面的）
            if (picked.length < MIN_UNITS_PER_POEM) {
                picked = scored.slice()
                    .sort((x, y) => (y.score - x.score) || (x.start - y.start))
                    .slice(0, Math.min(MIN_UNITS_PER_POEM, scored.length));
            }

            // 達標的聯句太多（長篇古詩、詞）→ 取評價最高的前幾聯，
            // 其餘關卡仍會出現在複習與自由練習中，只是不列為必修。
            if (picked.length > MAX_UNITS_PER_POEM) {
                picked = picked.slice()
                    .sort((x, y) => (y.score - x.score) || (x.start - y.start))
                    .slice(0, MAX_UNITS_PER_POEM);
            }

            // 一律依詩中順序輸出，讓玩家由前往後學
            picked.sort((x, y) => x.start - y.start);
            return picked.map(x => ({ tier: tier, level: x.level }));
        },

        /**
         * 依玩家「已學會的詩詞首數」取得目前所在的站。
         * 回傳最後一個「進入門檻已達成」的站點索引。
         */
        getCurrentIndex: function (learnedCount) {
            const stations = this.build();
            let idx = 0;
            for (let i = 0; i < stations.length; i++) {
                if (learnedCount >= stations[i].poemFrom) idx = i;
                else break;
            }
            return idx;
        },

        /** 取得某個文位的所有站點（文位站 + 其下三階） */
        getStationsOfRank: function (rankName) {
            return this.build().filter(st => st.rankName === rankName);
        },

        /**
         * 取得某個文位「自身這一段」的必通關卡 = 該文位四階的關卡總和。
         * ⚠️ 這是單一文位的區段值，不是從遊戲開局累積到此的總量。
         *    要判斷「能不能參加考試」請用 getCumulativeUnits，
         *    此函式僅供顯示「這個文位本身有多重」等區段性用途。
         */
        getRankUnits: function (rankName) {
            const units = [];
            this.getStationsOfRank(rankName).forEach(st => {
                (st.units || []).forEach(u => units.push(u));
            });
            return units;
        },

        /**
         * 取得「從遊戲開局到某文位里程碑」累積的必通關卡總數（靜態值，不看玩家進度）。
         *
         * 這才是「能不能參加考試」的真正判準所依據的關卡總量 ——
         * `LearningPath.getRankExamProgress()` 用的就是同一段學習序列切片，
         * 只是那邊還要交叉比對玩家目前的通關紀錄。這裡只回傳「總共需要幾關」，
         * 不含玩家進度，可在沒有 window/localStorage 的 Node 環境下使用。
         *
         * @returns {number} 必通關卡總次數（= 關卡數 × getChannelsPerLevel()）
         */
        getCumulativeUnits: function (rankName) {
            const ms = this.getMilestones();
            const idx = ms.findIndex(m => m.name === rankName);
            if (idx < 0) return 0;
            const list = this.getPoemUnits().slice(0, ms[idx].poems);
            let total = 0;
            list.forEach(p => { total += (p.units || []).length; });
            return total * this.getChannelsPerLevel();
        },

        /** 每一關需要幾種不同的提取方式才算完成 */
        getChannelsPerLevel: function () {
            return CHANNELS_PER_LEVEL;
        },

        /**
         * 取得「每一首詩各自的必通關卡」，順序與學習序列一致。
         * 青雲梯用它判斷某首詩是否已達 ⭑⭑ 熟練（該詩所有必通關卡皆完成）。
         *
         * @returns {Array<{id:number, tier:string, rating:number, units:Array}>}
         */
        getPoemUnits: function () {
            if (this._poemUnits) return this._poemUnits;

            const LT = this.getLevelTable();
            if (!LT) return [];

            const out = this.buildLearnOrder().map(p => ({
                id: p.id,
                tier: p.tier,
                rating: p.rating,
                units: this.selectUnitsForPoem(p.id, p.tier)
            }));

            this._poemUnits = out;
            return out;
        },

        /** 文位里程碑表（供 UI 與考試模組查詢） */
        getMilestones: function () {
            const total = this.getTotalPoems();
            return RANK_MILESTONES.map(m =>
                ({ name: m.name, poems: m.poems < 0 ? total : Math.min(m.poems, total) }));
        },

        /** 統計資訊（供驗證腳本與企畫書對帳用） */
        getStats: function () {
            const stations = this.build();
            const stats = {
                total: stations.length,
                rank: stations.filter(s => s.type === 'rank').length,
                grade: stations.filter(s => s.type === 'grade').length,
                totalPoems: this.getTotalPoems(),
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
