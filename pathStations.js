/* ==========================================================================
   花月 · 青雲梯站點計算 (pathStations.js)
   --------------------------------------------------------------------------
   對應企畫書：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md 第二章「青雲梯的結構」
     第八章 必通關卡：定義與規則

   ── 這個模組做什麼 ──────────────────────────────────────────────────
   把「玩家已經學會幾首詩」換算成青雲梯上的一連串站點。

   ⚠️ 與舊版最大的差異：站點不再由積分推算 ───────────────────────────
      舊版：站點 = 積分區間（積分差 ÷ 每關得分 = 該站題數）。
            這代表玩家反覆刷低難度遊戲累積積分就能一路升到大儒，
            並沒有真的學會詩詞。
      新版：站點 = 已學詩詞數的里程碑。積分完全不參與進度判定，
            只留在排行榜與統計（見企畫書第六章「四種數值的角色分工」）。

   ── 節奏設計：直接填表（2026-08-28 定案）─────────────────────────
      文位間距與小站步調不再由公式（積分、或「每週學幾首×難度層週數」）
      反推，改成 RANK_TABLE 一張表直接填「這段要切幾個小站」「一站放幾
      首」，詩詞跨距是算出來的結果，不是輸入。
      理由：舊的「難度層驅動」公式曾經在文位里程碑剛好卡在難度分界線
      附近時，讓小站數無預警翻倍或腰斬（同樣跨距 12 首，一段切 5 站、
      隔壁段卻只切 2 站，純粹是分界線落點的巧合，不是刻意的節奏設計）。
      直接填表後，之後詩詞庫擴充只需要調整 RANK_TABLE 的數字，不必再去
      猜測或理解難度分界線落在哪裡。
   ========================================================================== */

(function () {
    'use strict';

    // 塾生（含）以後的文位站需通過考試。
    // ⚠️ 2026-08-28 由「縣案首」整段前移到「塾生」，目的是讓玩家**提早**
    //    接觸考試流程：塾生／童生的考試題數少、及格線也只有 2/3，
    //    等於一場低風險的教學局，免得玩家第一次遇到考試就是縣案首那種
    //    高門檻場合而慌張失常。
    //    只有蒙童維持免考（書僮是起點站、不算取得文位）。
    //    這裡刻意維持「單一門檻」而非白名單：文位一旦跳著要考、跳著不考，
    //    這個常數就撐不住，得整組改成逐一列舉——目前沒有那個需求。
    const EXAM_FROM_RANK = '塾生';

    // ── 文位區間表：小站節奏的唯一來源（作者定案）───────────────────
    // 每一列＝「從上一個文位走到這個文位」要放幾個小站（stationCount）、
    // 以及每個小站放幾首詩（perStation）。詩詞跨距（這段總共要學幾首）
    // 完全由這兩欄推算：span = (stationCount + 1) × perStation
    // （+1 是把「抵達這個文位本身」也算成最後一份）。
    //
    // ⚠️ 作者要直接控制的是「這段要切幾個小站」與「一站放幾首」，
    //    不是詩詞跨距本身——跨距只是算出來的結果，改表只需要調這兩欄。
    //    這裡故意**不**存 span，就是為了不必自己手算、也不會兩份數字對不上。
    //    這是全模組唯一一張要手動維護的表，日後詩詞庫擴充只需要調整
    //    這裡的 stationCount／perStation，不需要再改別的地方。
    // ⚠️ 每一站的「主要難度層」（st.tier）不是這張表的欄位，一律由
    //    _finalizeStations 依這一站實際涵蓋的詩自動算出（見該函式），
    //    就算某個文位區間橫跨兩個難度層也沒關係——區間內本來就有好幾個
    //    小站可以自然分開難易度，不需要在這張表裡人工指定難度層。
    // ⚠️ 最後一列（大儒）不受推算出的 span 上限：實際跨距永遠取「題庫剩餘
    //    全部」，這裡的 stationCount／perStation 只用來決定小站步調該多大——
    //    即使題庫還沒補到目標量，大儒也照樣涵蓋到題庫實際上限
    //    （見 _buildMilestones）。
    const RANK_TABLE = [
        { name: '書僮', stationCount: 0, perStation: 0 },   // 起點站，前面無跨距
        { name: '蒙童', stationCount: 3, perStation: 2 },
        { name: '塾生', stationCount: 3, perStation: 2 },
        { name: '童生', stationCount: 3, perStation: 2 },
        { name: '縣案首', stationCount: 3, perStation: 2 },
        { name: '府案首', stationCount: 3, perStation: 3 },
        { name: '文童', stationCount: 3, perStation: 3 },
        { name: '秀才', stationCount: 4, perStation: 3 },
        { name: '舉人', stationCount: 4, perStation: 4 },
        { name: '貢士', stationCount: 4, perStation: 4 },
        { name: '進士', stationCount: 5, perStation: 4 },
        { name: '探花', stationCount: 5, perStation: 5 },
        { name: '榜眼', stationCount: 6, perStation: 6 },
        { name: '狀元', stationCount: 7, perStation: 7 },
        { name: '大儒', stationCount: 10, perStation: 8 }
    ];

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

    // 標點符號正則 —— 與 levelTable.js / script.js 的清洗規則保持一致，
    // 否則算出來的「字數」會把標點一起算進去，長短判斷就會失準。
    const PUNCT = /[，。？！、：；「」『』\s]/g;

    /** 一首詩去除標點後的總字數（排序的次要依據） */
    function countChars(poem) {
        return (poem.content || []).reduce(
            (sum, line) => sum + (line || '').replace(PUNCT, '').length, 0);
    }

    /** 一首詩的實際句數（空行是分段標記，不計） */
    function countLines(poem) {
        return (poem.content || []).filter(
            line => (line || '').replace(PUNCT, '').length > 0).length;
    }

    // ── 長篇的判準：句數 ───────────────────────────────────────────────
    // 題庫的句數中位數是 4~8 句（絕句 4 句、律詩 8 句），
    // 12 句約為律詩的 1.5 倍，超過就明顯是需要多花力氣啃的長篇。
    // ⚠️ 不用字數判斷：必通關卡是依詩句評價挑的，還有 MAX_UNITS_PER_POEM
    //    上限，所以 840 字的〈長恨歌〉與 176 字的〈將進酒〉工作量相同
    //    （皆為 6 個單元）。真正造成疲乏的是連續站都在啃長篇。
    const LONG_POEM_LINES = 12;

    // 「超長篇」——〈將進酒〉30 句、〈滕王閣序〉60 句、〈琵琶行〉88 句、
    // 〈長恨歌〉120 句這一級。長篇的站數在中後期會多到無法全部拉開
    // （評價 5 有 15 首長篇卻只有 20 站），此時優先保證這一級彼此離最遠。
    const SUPER_LONG_POEM_LINES = 20;

    /**
     * 把 items 平均擺進一個長度 n 的陣列，回傳該陣列（未填處為 null）。
     * 第 k 個放在 (k+0.5)/len 的位置，撞位就往後找 —— 兩兩之間的間隔
     * 因此接近 n/len，是「平均散開」能達到的最大值。
     */
    function placeEvenly(items, n) {
        const placed = new Array(n).fill(null);
        items.forEach((it, k) => {
            let s = Math.min(n - 1, Math.floor((k + 0.5) * n / items.length));
            while (placed[s]) s = (s + 1) % n;
            placed[s] = it;
        });
        return placed;
    }

    // 兩首長篇之間至少要隔幾站。
    // 之所以不是「不同站就好」：出題有機會取用上一站或下一站的題目當作
    // 溫習，長篇排在隔壁站時連複習都是長篇，玩家沒有喘息空間。
    const LONG_POEM_MIN_GAP = 2;

    // ── 一個題目單元要玩幾局（企畫書 8.2）─────────────────────────────
    // 必通關卡數 = 該詩的題目單元數 × 每個單元 3 局。
    // 這 3 局必須用 3 款不同的遊戲（見 learningPath.pickGame）——
    // 同樣兩句話用同一款遊戲玩第二次就沒有難度了。
    // ⚠️ 「通道」種類的保證在站的層級（一站十幾局涵蓋 3 種通道），不在這裡。
    const PLAYS_PER_UNIT = 3;

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
            const charsById = {};
            const linesById = {};
            poems.forEach(p => {
                ratingById[p.id] = p.rating || 0;
                charsById[p.id] = countChars(p);
                linesById[p.id] = countLines(p);
            });

            const seen = {};
            const order = [];

            TIER_SEQ.forEach(tier => {
                const fresh = [];
                LT.getTierPoemOrder(tier).forEach((pid, idx) => {
                    if (seen[pid]) return;
                    seen[pid] = true;
                    fresh.push({
                        id: pid, tier: tier, ord: idx,
                        rating: ratingById[pid] || 0,
                        chars: charsById[pid] || 0,
                        lines: linesById[pid] || 0
                    });
                });
                // 評價高（易）者先學；同評價則短詩先學（篇幅是評價之外的第二道難度）
                fresh.sort((a, b) =>
                    (b.rating - a.rating) || (a.lines - b.lines) || (a.chars - b.chars) || (a.ord - b.ord));
                this.spreadLongPoems(fresh).forEach(f => order.push({
                    id: f.id, tier: f.tier, rating: f.rating, chars: f.chars, lines: f.lines
                }));
            });

            this._learnOrder = order;
            return order;
        },

        /**
         * 同評價內把「長篇」平均散開。
         *
         * ── 判準是句數，不是字數 ────────────────────────────────────────
         * 一首詩的實際工作量不等於字數：必通關卡是由 selectUnitsForPoem
         * 依**詩句評價**挑出來的，而且上限為 MAX_UNITS_PER_POEM。
         * 〈長恨歌〉雖有 840 字 120 句，達到評價門檻的聯句只有少數，
         * 最後也只產生 6 個必修單元 —— 與 176 字的〈將進酒〉完全一樣。
         * 所以真正讓玩家疲乏的是「連續好幾站都在啃長篇」這件事本身，
         * 不是某一站的字數總量。判準因此取句數（LONG_POEM_LINES）。
         *
         * ── 為什麼光排序不夠 ────────────────────────────────────────────
         * 若只依長度由短到長排，長篇會全部擠在同評價的尾端，變成連續好幾站
         * 都是長篇。實測舊版就出現過站 28~31 連四站分別是〈將進酒〉30 句、
         * 〈滕王閣序〉60 句、〈琵琶行〉88 句、〈長恨歌〉120 句。
         *
         * 這還會連帶影響複習品質 —— 出題有機會取用上一站或下一站的題目
         * 當作溫習，長篇連站時連「複習」都是長篇，玩家完全沒有喘息。
         *
         * ── 作法 ────────────────────────────────────────────────────────
         * 把長篇平均插進整個評價區段（第 k 首長篇放在 (k+0.5)/L 的位置），
         * 空檔全部由短詩依長度遞增填滿。這樣相鄰兩首長篇之間會隔進最多的
         * 短詩，難度也仍隨站數穩定遞增。
         *
         * ⚠️ 能拉開多遠取決於題庫本身：某個評價若長篇佔比太高，就算平均
         *    散開也還是會靠得很近。因此 build() 之後一律以 getLoadReport()
         *    複查實際的站距，不能改完就假設它對了。
         */
        spreadLongPoems: function (list) {
            const out = [];
            let i = 0;
            while (i < list.length) {
                let j = i;
                while (j < list.length && list[j].rating === list[i].rating) j++;
                const bucket = list.slice(i, j);          // 已依長度由短到長
                i = j;

                const longs = bucket.filter(p => p.lines >= LONG_POEM_LINES);
                const shorts = bucket.filter(p => p.lines < LONG_POEM_LINES);

                // 沒有長篇（例如評價 7 全是絕句），或全部都是長篇 —— 都無從散開，
                // 維持原順序即可，免得平白打亂既有的學習序列。
                if (!longs.length || !shorts.length) {
                    bucket.forEach(b => out.push(b));
                    continue;
                }

                // ── 第一層：先把「超長篇」在長篇序列裡彼此拉到最開 ──────
                // 中後期一站放 4~6 首，站數變少而長篇比例反而上升
                // （評價 5：15 首長篇對 20 站），此時不可能每一首都拉開 2 站。
                // 既然只能取捨，就優先保證〈長恨歌〉〈琵琶行〉這一級離最遠，
                // 12~19 句的中長篇則容許靠近一些。
                const supers = longs.filter(p => p.lines >= SUPER_LONG_POEM_LINES);
                const mids = longs.filter(p => p.lines < SUPER_LONG_POEM_LINES);
                let longOrder = longs;
                if (supers.length && mids.length) {
                    longOrder = placeEvenly(supers, longs.length);
                    let mi = 0;
                    for (let s = 0; s < longOrder.length; s++) {
                        if (!longOrder[s]) longOrder[s] = mids[mi++];
                    }
                }

                // ── 第二層：把長篇序列平均插進整個評價區段，空檔填短詩 ──
                const slots = placeEvenly(longOrder, bucket.length);
                let si = 0;
                for (let s = 0; s < slots.length; s++) {
                    if (!slots[s]) slots[s] = shorts[si++];
                }
                slots.forEach(p => out.push(p));
            }
            return out;
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

            const learnOrder = this.buildLearnOrder();
            const total = learnOrder.length;
            if (!total) return [];

            const milestones = this._buildMilestones(total);
            const stations = this._buildStationShells(milestones, total);

            this._finalizeStations(stations, learnOrder, total);
            this._cache = stations;
            return stations;
        },

        /**
         * 依 RANK_TABLE 累加出里程碑表：每個文位「累積應學會幾首詩」，
         * 以及走到這個文位的路上每個小站放幾首詩（見 RANK_TABLE 開頭註解）。
         *
         * ⚠️ 最後一列（大儒）不受累加出的目標值限制：不管題庫目前有沒有補到
         *    目標總量，大儒永遠涵蓋「題庫實際剩下的全部」——用
         *    `Math.max(cum, total)` 讓題庫還沒補齊時取累積目標值（再被
         *    下一行的 `Math.min(..., total)` 夾回題庫實際上限），
         *    未來題庫長過目標值時則直接取實際上限，兩種情況都對。
         */
        _buildMilestones: function (total) {
            let cum = 0;
            const out = [];
            RANK_TABLE.forEach((r, i) => {
                // +1：stationCount 只算「小站」，不含抵達這個文位本身那一份。
                const span = (r.stationCount + 1) * r.perStation;
                cum += span;
                const isLast = i === RANK_TABLE.length - 1;
                const target = isLast ? Math.max(cum, total) : cum;
                out.push({ name: r.name, poems: Math.min(target, total), perStation: r.perStation });
            });
            return out;
        },

        /**
         * 依里程碑表建出「文位站 + 各階小站」的骨架（尚未填入 poemIds／units）。
         *
         * @param {Array} milestones
         * @param {number} total
         */
        _buildStationShells: function (milestones, total) {
            const examFromIdx = milestones.findIndex(m => m.name === EXAM_FROM_RANK);
            const stations = [];

            for (let i = 0; i < milestones.length; i++) {
                const cur = milestones[i];
                const next = milestones[i + 1];

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
                // 階數與每階詩數直接查 RANK_TABLE（next.perStation），
                // 不再由公式反推。
                const span = next.poems - cur.poems;
                if (span <= 0) continue;

                const perStation = next.perStation;
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
            return stations;
        },

        /** 後處理：算出每一站涵蓋的詩、必通關卡與難度層 */
        _finalizeStations: function (stations, learnOrder, total) {
            for (let i = 0; i < stations.length; i++) {
                const st = stations[i];
                const next = stations[i + 1];
                st.poemTo = next ? next.poemFrom : total;

                const slice = learnOrder.slice(st.poemFrom, st.poemTo);
                st.poemIds = slice.map(p => p.id);
                st.tier = slice.length ? slice[0].tier : (stations[i - 1] ? stations[i - 1].tier : '小學');
                // 這一站要背的總字數，供 getLoadReport 檢查相鄰站的負荷是否失衡
                st.chars = slice.reduce((sum, p) => sum + (p.chars || 0), 0);

                // 必通關卡：把這一站的詩，依各自所屬的難度層取出全部關卡。
                // ⚠️ 一站有可能跨難度層（例如小學只有 12 首，塾生那一站就會
                //    橫跨小學與中學），因此關卡必須連同 tier 一起記錄。
                const units = [];
                slice.forEach(p => {
                    this.selectUnitsForPoem(p.id, p.tier).forEach(u => units.push(u));
                });

                st.units = units;
                st.requiredClears = units.length * PLAYS_PER_UNIT;
            }
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
         * @returns {number} 必通關卡總次數（= 關卡數 × getPlaysPerUnit()）
         */
        getCumulativeUnits: function (rankName) {
            const ms = this.getMilestones();
            const idx = ms.findIndex(m => m.name === rankName);
            if (idx < 0) return 0;
            const list = this.getPoemUnits().slice(0, ms[idx].poems);
            let total = 0;
            list.forEach(p => { total += (p.units || []).length; });
            return total * this.getPlaysPerUnit();
        },

        /**
         * 一個題目單元要玩幾局才算完成（每一局必須是不同的遊戲）。
         *
         * ⚠️ 舊名為 getPlaysPerUnit，語意是「幾種通道」。通道種類的保證
         *    已上移到「站」的層級（一站十幾局涵蓋 3 種通道），單元層改為
         *    「3 款不同遊戲」，因此更名以免誤導。
         */
        getPlaysPerUnit: function () {
            return PLAYS_PER_UNIT;
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
            return this._buildMilestones(this.getTotalPoems())
                .map(m => ({ name: m.name, poems: m.poems }));
        },

        // ══════════════════════════════════════════════════════════════
        //  文位晉升獎勵（note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md）
        //
        //  ⚠️ 為什麼獎勵計算放在 pathStations.js：
        //     發放獎勵的時機有兩個完全不同的入口 ——
        //       · 青雲梯走到新站（learningPath.js）
        //       · 考棚考試通過（exam.js）
        //     兩邊都需要「這個文位值多少文錢」「小站該分多少」的同一套算法。
        //     站點與文位的權威資料本來就在本檔，把算法放這裡才不會出現
        //     兩份會各自飄移的實作。
        // ══════════════════════════════════════════════════════════════

        /**
         * 某個文位的晉升獎勵文錢總額。
         *
         * ⚠️ 數字來源是 achievement.js 的 rankRewards 表，本檔只取其中的
         *    silver 欄位、**刻意不取 score** —— 新規則下晉升只給文錢，
         *    積分退回純統計用途（企劃書 §2）。
         *    之所以不把數字複製一份到本檔，是為了避免同一組獎勵金額在兩處
         *    各自維護而慢慢對不上；achievement.js 在 index.html 的載入順序
         *    雖然在本檔之後，但本函式只在玩家實際晉升時才被呼叫，
         *    那時所有模組早已載入完畢。
         *
         * @param {string} rankName 文位名稱，例如 '蒙童'
         * @returns {number} 文錢總額；查無資料時回 0
         */
        getRankSilver: function (rankName) {
            const table = (window.AchievementDialog && window.AchievementDialog.rankRewards) || null;
            if (!table || !table[rankName]) return 0;
            return Math.max(0, Math.floor(table[rankName].silver || 0));
        },

        /**
         * 取得「通往某個文位的路上」夾了幾個小站，以及那些小站的索引。
         *
         * ⚠️ 站點陣列的排法是：
         *      [文位A] [A二階] [A三階] [準B] [文位B] [B二階] …
         *    也就是說「通往文位 B 的小站」，它們的 rankName 其實是 **A**
         *    （小站掛在前一個文位底下，見 build()）。這一點很容易寫反，
         *    因此這支函式一律以「目標文位」為參數，內部自行往前找。
         *
         * @param {string} rankName 目標文位名稱（例如 '蒙童'）
         * @returns {{count:number, indexes:number[], prevRankName:string}}
         */
        getGradeStationsBeforeRank: function (rankName) {
            const stations = this.build();
            const empty = { count: 0, indexes: [], prevRankName: '' };

            // 先找到目標文位站的位置
            let rankIdx = -1;
            for (let i = 0; i < stations.length; i++) {
                if (stations[i].type === 'rank' && stations[i].name === rankName) { rankIdx = i; break; }
            }
            if (rankIdx <= 0) return empty;  // 找不到，或它是第一個文位（書僮，前面沒有小站）

            // 從它往前數，直到碰到上一個文位站為止
            const indexes = [];
            for (let i = rankIdx - 1; i >= 0; i--) {
                if (stations[i].type === 'rank') {
                    return { count: indexes.length, indexes: indexes.reverse(), prevRankName: stations[i].name };
                }
                indexes.push(i);
            }
            return { count: indexes.length, indexes: indexes.reverse(), prevRankName: '' };
        },

        /**
         * 某個小站（grade 站）該發多少文錢。
         *
         * 規則（企劃書 §4.1）：
         *   每小站文錢 = floor(目標文位獎勵總額 / 該文位前面的小站數)
         *   · 一律無條件捨去小數，不四捨五入
         *   · 捨去後若為 0，一律改發 1 —— 不能出現「晉升卻得 0 文錢」
         *   · 除不盡的餘數直接丟棄，不併入任何一站
         *     （因此走完一個文位的所有小站，累計會 ≤ 該文位總額）
         *
         * @param {object} station build() 產出的站點物件，需為 type==='grade'
         * @returns {number} 該站應發的文錢，非小站或查無資料時回 0
         */
        getGradeStationSilver: function (station) {
            if (!station || station.type !== 'grade') return 0;

            // 小站掛在「前一個文位」底下，它要通往的是**下一個**文位
            const targetRank = this.getNextRankNameAfter(station.rankName);
            if (!targetRank) return 0;

            const total = this.getRankSilver(targetRank);
            if (total <= 0) return 0;

            const info = this.getGradeStationsBeforeRank(targetRank);
            const n = info.count > 0 ? info.count : 1;

            return Math.max(1, Math.floor(total / n));
        },

        /** 某個文位的「下一個」文位名稱；已是最後一個則回空字串 */
        getNextRankNameAfter: function (rankName) {
            for (let i = 0; i < RANK_TABLE.length - 1; i++) {
                if (RANK_TABLE[i].name === rankName) return RANK_TABLE[i + 1].name;
            }
            return '';
        },

        /** 這個文位是否需要通過考試才能取得（塾生起） */
        isExamRank: function (rankName) {
            const from = RANK_TABLE.findIndex(m => m.name === EXAM_FROM_RANK);
            const at = RANK_TABLE.findIndex(m => m.name === rankName);
            return from >= 0 && at >= 0 && at >= from;
        },

        /* ====================================================================
         *  ⭐⭐ 文位名單的唯一真實來源（Single Source of Truth）⭐⭐
         *  ------------------------------------------------------------------
         *  ⚠️⚠️ 在此之前，「文位順序」這份名單在專案裡**各自抄了四份**：
         *        · pathStations.js  RANK_TABLE            （全部 15 個文位）
         *        · examConfig.js    EXAM_RANK_ORDER       （需應試的 13 個）
         *        · collection.js    EXAM_RANKS_ORDER      （需應試的 13 個）
         *        · scoreManager.js  EXAM_RANK_NAMES       （需應試的 13 個）
         *      三份副本的註解都寫著「三處任一漏改都會產生難以察覺的錯位」，
         *      而那正是實際發生過的事：2026-08-28 把 EXAM_FROM_RANK 從
         *      「縣案首」前移到「塾生」時，副本雖然都補上了塾生與童生，
         *      卻沒有人注意到 grantStationReward 會因此開始跳過這兩個文位，
         *      於是越級考試靜靜地漏發了 240 文錢（見企畫書附錄 F 問題④）。
         *
         *      根治的方法不是「更小心地維護四份」，而是**只留一份**。
         *      需應試的文位本來就完全等於「RANK_TABLE 中 EXAM_FROM_RANK
         *      以後的所有文位」，是可以推導出來的，不該手寫。
         *
         *  ⚠️ 本區塊的函式**只讀 RANK_TABLE**，不碰詩詞資料，因此可以在
         *     模組載入當下就安全呼叫（pathStations.js 在 index.html 的
         *     載入順序早於 examConfig／collection／achievement／scoreManager）。
         * ================================================================= */

        /** 全部文位名稱，由低到高（書僮 … 大儒） */
        getAllRankNames: function () {
            return RANK_TABLE.map(r => r.name);
        },

        /** 需通過考試的文位名稱，由低到高（塾生 … 大儒） */
        getExamRankNames: function () {
            const from = RANK_TABLE.findIndex(r => r.name === EXAM_FROM_RANK);
            return from < 0 ? [] : RANK_TABLE.slice(from).map(r => r.name);
        },

        /** 免考文位名稱，由低到高（書僮／蒙童） */
        getFreeRankNames: function () {
            const from = RANK_TABLE.findIndex(r => r.name === EXAM_FROM_RANK);
            return from < 0 ? RANK_TABLE.map(r => r.name) : RANK_TABLE.slice(0, from).map(r => r.name);
        },

        /** 從哪個文位開始需要考試 */
        getExamFromRank: function () { return EXAM_FROM_RANK; },

        /**
         * 站點負荷檢查（供 tools/dump_path.js 與企畫書對帳用）。
         *
         * 交錯排序只保證「相鄰兩首不會同時是長詩」，但站點邊界是由文位里程碑
         * 切出來的，不保證落在偶數位；一旦錯位，仍可能有某一站同時吃到兩首長詩。
         * 這個函式把這種站點揪出來，讓排序規則的效果可以被實際驗證，
         * 而不是「改完就相信它對了」。
         *
         * @returns {Array<{index, name, chars, units, poems, reasons:string[]}>}
         *          只回傳有問題的站；空陣列 = 全部通過。
         */
        getLoadReport: function () {
            const stations = this.build();
            const LT = this.getLevelTable();
            const poems = LT && LT.getPoems ? LT.getPoems() : [];
            const linesById = {};
            const titleById = {};
            poems.forEach(p => {
                linesById[p.id] = countLines(p);
                titleById[p.id] = p.title || ('#' + p.id);
            });

            const out = [];
            let lastLongAt = -99;          // 上一個含長篇的站索引
            let lastLongName = '';

            stations.forEach((st, i) => {
                const ids = st.poemIds || [];
                const n = ids.length || 1;
                const longs = ids.filter(id => (linesById[id] || 0) >= LONG_POEM_LINES);
                const reasons = [];

                // (1) 同一站塞了太多長篇
                if (longs.length > 1 && longs.length > n / 2) {
                    reasons.push('這一站 ' + n + ' 首裡有 ' + longs.length + ' 首長篇（' +
                        longs.map(id => titleById[id] + ' ' + linesById[id] + '句').join('、') + '）');
                }

                // (2) 兩個「超長篇」站靠太近 —— 溫習會取用鄰站題目，
                //     超長篇連站等於連複習都在啃長篇。
                //
                // ⚠️ 只對超長篇把關。中長篇（12~19 句）在中後期密度太高，
                //    數學上不可能全部拉開（評價 5 有 15 首長篇卻只有 20 站，
                //    不相鄰最多只能用 10 站），全部列出來只是噪音。
                const supers = ids.filter(id => (linesById[id] || 0) >= SUPER_LONG_POEM_LINES);
                if (supers.length) {
                    const gap = i - lastLongAt;
                    if (gap < LONG_POEM_MIN_GAP) {
                        reasons.push('距上一個超長篇站僅 ' + gap + ' 站（' + lastLongName +
                            '），需至少相隔 ' + LONG_POEM_MIN_GAP + ' 站');
                    }
                    lastLongAt = i;
                    lastLongName = titleById[supers[0]] + ' ' + linesById[supers[0]] + '句';
                }

                // (3) 與前一站相比必通關卡暴增（玩家會感覺突然卡死）
                const prev = stations[i - 1];
                if (prev && prev.requiredClears &&
                    st.requiredClears >= prev.requiredClears * 2.5) {
                    reasons.push('必通關卡 ' + prev.requiredClears +
                        ' → ' + st.requiredClears + '，較前一站暴增');
                }

                if (reasons.length) {
                    out.push({
                        index: i, name: st.name, chars: st.chars,
                        units: st.requiredClears,
                        poems: ids.map(id => titleById[id] + '(' + linesById[id] + '句)'),
                        reasons: reasons
                    });
                }
            });
            return out;
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

    /* ========================================================================
     *  文位名單一致性自我檢查
     *  ------------------------------------------------------------------
     *  RANK_TABLE 已經是文位名單的唯一真本，但 scoreManager.js 的 `ranks`
     *  （積分階級表）出於另一個用途，仍然各自列了一份**同名**的 15 個階級。
     *  那張表本身合法（它是排行榜用的積分門檻），可是只要兩邊的名字或順序
     *  對不上，getEffectiveRank／成就頁的文位比對就會靜靜地錯位 ——
     *  正是本專案吃過大虧的那一類錯誤。
     *
     *  與其寫註解叫人「記得同步」（實測無效），不如讓程式自己在每次載入時
     *  對帳一次：不一致就在主控台印出紅字，指出差在哪裡。
     *  這段只讀資料、不修改任何東西，對正式環境沒有副作用。
     * ===================================================================== */
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('load', function () {
            try {
                const SM = window.ScoreManager;
                if (!SM || !Array.isArray(SM.ranks)) return;
                const fromTable = PathStations.getAllRankNames();
                const fromScore = SM.ranks.map(r => r.name);
                const same = fromTable.length === fromScore.length
                    && fromTable.every((n, i) => n === fromScore[i]);
                if (!same) {
                    console.error(
                        '[文位名單不一致] pathStations.RANK_TABLE 與 scoreManager.ranks 對不上，'
                        + '文位判定會錯位，請立即修正：',
                        { RANK_TABLE: fromTable, 'ScoreManager.ranks': fromScore }
                    );
                }
            } catch (e) {
                console.warn('[文位名單] 一致性檢查失敗:', e);
            }
        });
    }
})();
