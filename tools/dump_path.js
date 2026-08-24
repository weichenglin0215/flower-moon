/* ==========================================================================
   花月 · 青雲梯站點清單輸出 (dump_path.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路_重新規劃企劃書.md 第五、八章

   執行方式：
      node tools/dump_path.js            → 摘要 + 前 20 站明細
      node tools/dump_path.js all        → 全部站點明細
      node tools/dump_path.js md         → 產生 note/青雲梯站點清單.md
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// eslint-disable-next-line no-eval
const POEMS = eval(fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8') + '; POEMS');
const LEVEL_TABLE = require(path.join(rootDir, 'data', 'level_table.js'));
const LevelTable = require(path.join(rootDir, 'levelTable.js'));
const PathStations = require(path.join(rootDir, 'pathStations.js'));

LevelTable.inject(POEMS, LEVEL_TABLE);
PathStations.injectLevelTable(LevelTable);

const byId = {};
POEMS.forEach(p => { byId[p.id] = p; });

const stations = PathStations.build();
const stats = PathStations.getStats();
const order = PathStations.buildLearnOrder();

const mode = (process.argv[2] || '').toLowerCase();

// ── 摘要 ────────────────────────────────────────────────────────────────
function summary() {
    const lines = [];
    lines.push('══ 青雲梯 · 站點總覽 ══');
    lines.push(`題庫可學詩詞總數：${stats.totalPoems} 首`);
    lines.push(`站點總數：${stats.total}（文位站 ${stats.rank}／階站 ${stats.grade}）`);
    lines.push('');

    // 學習序列的評價分布（驗證累積首數是否為 12/64/142/226/301/346）
    const cum = {};
    let n = 0;
    const marks = [];
    let lastRating = null;
    order.forEach(p => {
        n++;
        cum[p.rating] = (cum[p.rating] || 0) + 1;
        if (lastRating !== null && p.rating !== lastRating) {
            marks.push(`  評價 ${lastRating} 結束於第 ${n - 1} 首`);
        }
        lastRating = p.rating;
    });
    marks.push(`  評價 ${lastRating} 結束於第 ${n} 首`);
    lines.push('學習序列（評價由高到低）：');
    lines.push(...marks);
    lines.push('  各評價首數：' + JSON.stringify(cum));
    lines.push('');

    // 每個文位需要的必通關卡數：區段值（這個文位自己）與累積值（從開局到此）
    // ⚠️ 這兩欄過去被誤合併成一欄「累積」，數字其實是區段值，探花看起來比秀才少
    //    就是這樣算錯的。能否參加考試看的是「累積」欄，不是「區段」欄。
    lines.push('文位晉升所需必通關卡：');
    lines.push('  （區段 = 這個文位自己 4 階的關卡總和；累積 = 從開局到此文位的總量，決定能否應試）');
    PathStations.getMilestones().forEach(m => {
        const segUnits = PathStations.getRankUnits(m.name).length;
        const segNeed = segUnits * PathStations.getPlaysPerUnit();
        const cumNeed = PathStations.getCumulativeUnits(m.name);
        lines.push(`  ${m.name.padEnd(4, '　')} 累積詩 ${String(m.poems).padStart(3)} 首` +
            `　區段必通 ${String(segNeed).padStart(4)} 次　→　累積必通 ${String(cumNeed).padStart(5)} 次`);
    });
    return lines.join('\n');
}

// ── 站點明細 ────────────────────────────────────────────────────────────
function detail(limit) {
    const lines = [];
    lines.push('');
    lines.push('══ 站點明細 ══');
    stations.slice(0, limit).forEach((st, i) => {
        const poems = st.poemIds.map(id => (byId[id] && byId[id].title) || ('#' + id));
        const ratings = st.poemIds.map(id => (byId[id] && byId[id].rating) || '?');
        lines.push(
            `${String(i + 1).padStart(3)}. ${st.name.padEnd(6, '　')} ` +
            `[${st.type === 'rank' ? '文位' : '階'}${st.isExam ? '·考' : '　'}] ` +
            `${st.tier.padEnd(3, '　')} 第 ${st.poemFrom + 1}~${st.poemTo} 首　` +
            `關卡 ${String(st.units.length).padStart(3)} 關／必通 ${String(st.requiredClears).padStart(3)} 次`
        );
        lines.push(`      詩：${poems.join('、')}（評價 ${ratings.join('/')}）`);
    });
    if (limit < stations.length) {
        lines.push(`      …（其餘 ${stations.length - limit} 站省略，執行 node tools/dump_path.js all 檢視全部）`);
    }
    return lines.join('\n');
}

// ── Markdown 輸出 ───────────────────────────────────────────────────────
function toMarkdown() {
    const out = [];
    out.push('# 花月 · 青雲梯站點清單');
    out.push('');
    out.push('> 本檔由 `tools/dump_path.js` 自動產生，請勿手動編輯。');
    out.push('> 對應企畫書：`note/學習道路_重新規劃企劃書.md`');
    out.push('');
    out.push('## 一、總覽');
    out.push('');
    out.push('```');
    out.push(summary());
    out.push('```');
    out.push('');
    out.push('## 二、站點清單');
    out.push('');
    out.push('| 編號 | 站名 | 型態 | 難度層 | 詩詞序號 | 詩名（評價） | 關卡 | 必通次數 |');
    out.push('|---|---|---|---|---|---|---|---|');
    stations.forEach((st, i) => {
        const poems = st.poemIds.map(id => {
            const p = byId[id];
            return p ? `${p.title}(${p.rating})` : `#${id}`;
        });
        out.push(
            `| ${i + 1} | **${st.name}** | ${st.type === 'rank' ? (st.isExam ? '文位·需考試' : '文位') : '階'} ` +
            `| ${st.tier} | ${st.poemFrom + 1}~${st.poemTo} | ${poems.join('、')} ` +
            `| ${st.units.length} | ${st.requiredClears} |`
        );
    });
    return out.join('\n');
}

/**
 * 站點負荷檢查報告。
 *
 * 學習序列會在同評價內把長篇平均散開（見 pathStations.spreadLongPoems），
 * 目的是避免連續好幾站都在啃長篇 —— 出題有機會取用鄰站題目當溫習，
 * 長篇連站等於連複習都沒得喘息。但能拉開多遠受題庫本身的密度限制，
 * 所以必須實際驗證，不能改完就當它對了。空清單代表全部通過。
 */
function loadReport() {
    const report = PathStations.getLoadReport();
    const lines = ['', '══ 站點負荷檢查 ══'];
    if (!report.length) {
        lines.push('✅ 沒有失衡的站點');
        return lines.join('\n');
    }
    lines.push(`⚠ ${report.length} 個站點負荷偏重（多半是題庫裡本來就有的超長篇，無法再拆）：`);
    report.forEach(r => {
        lines.push(`  站${r.index} ${r.name}　${r.poems.join('、')}　必通 ${r.units} 次`);
        r.reasons.forEach(m => lines.push(`      → ${m}`));
    });
    return lines.join('\n');
}

if (mode === 'md') {
    const target = path.join(rootDir, 'note', '青雲梯站點清單.md');
    fs.writeFileSync(target, toMarkdown(), 'utf8');
    console.log('已輸出：' + path.relative(rootDir, target));
    console.log('');
    console.log(summary());
    console.log(loadReport());
} else {
    console.log(summary());
    console.log(detail(mode === 'all' ? stations.length : 20));
    console.log(loadReport());
}
