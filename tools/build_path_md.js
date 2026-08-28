/* ==========================================================================
   花月 · 青雲梯站點清單產生器 (build_path_md.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路_重新規劃企劃書.md 第五、八章

   ── 這支檔案存在的理由 ──────────────────────────────────────────────
   note/青雲梯站點清單.md 是**人類唯一能用來核對「每一站該出哪些詩」的依據**。
   一旦詩詞資料（data/poems.js）或關卡表（data/level_table.js）更新，
   這份清單就必須跟著重產，否則人工比對會拿舊表去驗新資料，
   結論全部作廢 —— 實務上已經發生過。

   因此產生邏輯集中在這裡，由兩個入口共用：
     · tools/dump_path.js    （命令列：node tools/dump_path.js md）
     · tools/converter.html  （網頁：轉換詩詞資料時一併產生）
   ⚠️ 千萬不要在 converter.html 裡另外抄一份 —— 兩邊實作遲早走鐘，
      這正是 build_level_table.js 當初被抽出來共用的同一個理由。

   ── 用法 ────────────────────────────────────────────────────────────
   Node：
       const { generate } = require('./build_path_md.js');
       const r = generate(POEMS, LEVEL_TABLE);
       fs.writeFileSync('note/青雲梯站點清單.md', r.markdown, 'utf8');

   瀏覽器：
       <script src="../levelTable.js"></script>
       <script src="../pathStations.js"></script>
       <script src="build_path_md.js"></script>
       const r = window.FMPathMd.generate(poems, levelTableObj);
   ========================================================================== */

(function () {
    'use strict';

    /**
     * 取得 LevelTable / PathStations 兩個模組。
     * Node 用 require，瀏覽器用全域變數（由 <script> 事先載入）。
     */
    function resolveModules(opts) {
        const o = opts || {};
        let LT = o.LevelTable;
        let PS = o.PathStations;

        if (!LT || !PS) {
            if (typeof window !== 'undefined') {
                LT = LT || window.LevelTable;
                PS = PS || window.PathStations;
            } else if (typeof require !== 'undefined') {
                const path = require('path');
                const rootDir = path.resolve(__dirname, '..');
                LT = LT || require(path.join(rootDir, 'levelTable.js'));
                PS = PS || require(path.join(rootDir, 'pathStations.js'));
            }
        }
        if (!LT) throw new Error('找不到 LevelTable 模組（瀏覽器請先載入 ../levelTable.js）');
        if (!PS) throw new Error('找不到 PathStations 模組（瀏覽器請先載入 ../pathStations.js）');
        return { LevelTable: LT, PathStations: PS };
    }

    // ── 總覽 ────────────────────────────────────────────────────────────
    function buildSummary(ctx) {
        const { PathStations, stats, order } = ctx;
        const lines = [];
        lines.push('══ 青雲梯 · 站點總覽 ══');
        lines.push('題庫可學詩詞總數：' + stats.totalPoems + ' 首');
        lines.push('站點總數：' + stats.total + '（文位站 ' + stats.rank + '／階站 ' + stats.grade + '）');
        lines.push('');

        // 學習序列的評價分布（用來驗證累積首數的斷點是否符合預期）
        const cum = {};
        let n = 0;
        const marks = [];
        let lastRating = null;
        order.forEach(function (p) {
            n++;
            cum[p.rating] = (cum[p.rating] || 0) + 1;
            if (lastRating !== null && p.rating !== lastRating) {
                marks.push('  評價 ' + lastRating + ' 結束於第 ' + (n - 1) + ' 首');
            }
            lastRating = p.rating;
        });
        marks.push('  評價 ' + lastRating + ' 結束於第 ' + n + ' 首');
        lines.push('學習序列（評價由高到低）：');
        lines.push.apply(lines, marks);
        lines.push('  各評價首數：' + JSON.stringify(cum));
        lines.push('');

        // 每個文位需要的必通關卡數：區段值（這個文位自己）與累積值（從開局到此）
        // ⚠️ 這兩欄過去被誤合併成一欄「累積」，數字其實是區段值，探花看起來比秀才少
        //    就是這樣算錯的。能否參加考試看的是「累積」欄，不是「區段」欄。
        lines.push('文位晉升所需必通關卡：');
        lines.push('  （區段 = 這個文位自己 4 階的關卡總和；累積 = 從開局到此文位的總量，決定能否應試）');
        PathStations.getMilestones().forEach(function (m) {
            const segUnits = PathStations.getRankUnits(m.name).length;
            const segNeed = segUnits * PathStations.getPlaysPerUnit();
            const cumNeed = PathStations.getCumulativeUnits(m.name);
            lines.push('  ' + padEnd(m.name, 4, '　') + ' 累積詩 ' + padStart(String(m.poems), 3) + ' 首' +
                '　區段必通 ' + padStart(String(segNeed), 4) + ' 次　→　累積必通 ' +
                padStart(String(cumNeed), 5) + ' 次');
        });
        return lines.join('\n');
    }

    // ── 站點負荷檢查 ────────────────────────────────────────────────────
    /**
     * 學習序列會在同評價內把長篇平均散開（見 pathStations.spreadLongPoems），
     * 目的是避免連續好幾站都在啃長篇 —— 出題有機會取用鄰站題目當溫習，
     * 長篇連站等於連複習都沒得喘息。但能拉開多遠受題庫本身的密度限制，
     * 所以必須實際驗證，不能改完就當它對了。空清單代表全部通過。
     */
    function buildLoadReport(ctx) {
        const report = ctx.PathStations.getLoadReport();
        const lines = ['', '══ 站點負荷檢查 ══'];
        if (!report.length) {
            lines.push('✅ 沒有失衡的站點');
            return lines.join('\n');
        }
        lines.push('⚠ ' + report.length + ' 個站點負荷偏重（多半是題庫裡本來就有的超長篇，無法再拆）：');
        report.forEach(function (r) {
            lines.push('  站' + r.index + ' ' + r.name + '　' + r.poems.join('、') + '　必通 ' + r.units + ' 次');
            r.reasons.forEach(function (m) { lines.push('      → ' + m); });
        });
        return lines.join('\n');
    }

    // ── 站點明細（命令列版的文字輸出）───────────────────────────────────
    function buildDetail(ctx, limit) {
        const { stations, byId } = ctx;
        const lines = [];
        lines.push('');
        lines.push('══ 站點明細 ══');
        stations.slice(0, limit).forEach(function (st, i) {
            const poems = st.poemIds.map(function (id) { return (byId[id] && byId[id].title) || ('#' + id); });
            const ratings = st.poemIds.map(function (id) { return (byId[id] && byId[id].rating) || '?'; });
            lines.push(
                padStart(String(i + 1), 3) + '. ' + padEnd(st.name, 6, '　') + ' ' +
                '[' + (st.type === 'rank' ? '文位' : '階') + (st.isExam ? '·考' : '　') + '] ' +
                padEnd(st.tier, 3, '　') + ' 第 ' + (st.poemFrom + 1) + '~' + st.poemTo + ' 首　' +
                '關卡 ' + padStart(String(st.units.length), 3) + ' 關／必通 ' +
                padStart(String(st.requiredClears), 3) + ' 次'
            );
            lines.push('      詩：' + poems.join('、') + '（評價 ' + ratings.join('/') + '）');
        });
        if (limit < stations.length) {
            lines.push('      …（其餘 ' + (stations.length - limit) +
                ' 站省略，執行 node tools/dump_path.js all 檢視全部）');
        }
        return lines.join('\n');
    }

    // ── Markdown 全文 ───────────────────────────────────────────────────
    function buildMarkdown(ctx) {
        const { stations, byId } = ctx;
        const out = [];
        out.push('# 花月 · 青雲梯站點清單');
        out.push('');
        out.push('> 本檔為自動產生，請勿手動編輯。');
        out.push('> 產生方式擇一：`node tools/dump_path.js md`，或用 `tools/converter.html`');
        out.push('> 轉換詩詞資料時一併下載（詩詞資料一改就必須重產，否則人工核對會拿舊表驗新資料）。');
        out.push('> 對應企畫書：`note/學習道路_重新規劃企劃書.md`');
        out.push('');
        out.push('## 一、總覽');
        out.push('');
        out.push('```');
        out.push(buildSummary(ctx));
        out.push('```');
        out.push('');
        out.push('## 二、站點清單');
        out.push('');
        out.push('| 編號 | 站名 | 型態 | 難度層 | 詩詞序號 | 詩名（評價） | 關卡 | 必通次數 | 累加必通次數 |');
        out.push('|---|---|---|---|---|---|---|---|---|');
        // 累加必通次數 = 從第 1 站到本站為止的必通次數總和。
        // ⚠️ 與「一、總覽」裡文位那張表的「累積必通」語意不同：
        //    那邊算的是「抵達該文位**之前**」的總量（決定能否應試），
        //    因此文位站的累加值會比總覽的數字多出該站自己的必通次數。
        //    兩者都對，只是切點不同，核對時別互相對照。
        let cumClears = 0;
        stations.forEach(function (st, i) {
            const poems = st.poemIds.map(function (id) {
                const p = byId[id];
                return p ? (p.title + '(' + p.rating + ')') : ('#' + id);
            });
            cumClears += st.requiredClears;
            out.push(
                '| ' + (i + 1) + ' | **' + st.name + '** | ' +
                (st.type === 'rank' ? (st.isExam ? '文位·需考試' : '文位') : '階') + ' ' +
                '| ' + st.tier + ' | ' + (st.poemFrom + 1) + '~' + st.poemTo + ' | ' + poems.join('、') + ' ' +
                '| ' + st.units.length + ' | ' + st.requiredClears + ' | ' + cumClears + ' |'
            );
        });
        return out.join('\n');
    }

    // ── 小工具：padEnd/padStart 相容寫法 ────────────────────────────────
    function padEnd(s, len, ch) {
        s = String(s);
        while (s.length < len) s += (ch || ' ');
        return s;
    }
    function padStart(s, len, ch) {
        s = String(s);
        while (s.length < len) s = (ch || ' ') + s;
        return s;
    }

    /**
     * 依詩詞與關卡表產生青雲梯站點清單。
     *
     * @param {Array}  poems       詩詞陣列（data/poems.js 的 POEMS）
     * @param {object} levelTable  關卡表物件（data/level_table.js 的 LEVEL_TABLE，
     *                             或 FMLevelTableBuilder.generate() 回傳的 .table）
     * @param {object} [opts]      { LevelTable, PathStations } 可手動注入模組
     * @returns {{markdown:string, summary:string, loadReport:string,
     *            detail:Function, stations:Array, stats:object}}
     */
    function generate(poems, levelTable, opts) {
        if (!poems || !poems.length) throw new Error('沒有詩詞資料');
        if (!levelTable) throw new Error('沒有關卡表資料');

        const mods = resolveModules(opts);
        const LevelTable = mods.LevelTable;
        const PathStations = mods.PathStations;

        // ⚠️ injectLevelTable 會一併清掉 PathStations 內部的 _cache 與 _learnOrder，
        //    所以同一個頁面重複產生（例如使用者連續轉換兩次）不會拿到上一次的舊結果。
        LevelTable.inject(poems, levelTable);
        PathStations.injectLevelTable(LevelTable);

        const byId = {};
        poems.forEach(function (p) { byId[p.id] = p; });

        const ctx = {
            LevelTable: LevelTable,
            PathStations: PathStations,
            byId: byId,
            stations: PathStations.build(),
            stats: PathStations.getStats(),
            order: PathStations.buildLearnOrder()
        };

        return {
            markdown: buildMarkdown(ctx),
            summary: buildSummary(ctx),
            loadReport: buildLoadReport(ctx),
            detail: function (limit) { return buildDetail(ctx, limit); },
            stations: ctx.stations,
            stats: ctx.stats
        };
    }

    if (typeof window !== 'undefined') {
        window.FMPathMd = { generate: generate };
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { generate: generate };
    }
})();
