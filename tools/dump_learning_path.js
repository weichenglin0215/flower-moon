/* ==========================================================================
   花月 · 學習道路站點清單輸出 (dump_learning_path.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路與關卡模式_企畫書.md
     第 6.3 節 難度層 × 文位分組
     第 6.6 節 站點題數（一站 = 一段積分區間 = 數十道題）
     第 6.8 節 每站固定學 2~3 首詩，在其中反覆循環

   ⚠️ 兩個容易搞錯的觀念：
     1. **一站不是一題**。一個站點是一段積分區間，例如書僮→書僮一相差
        5,000 分、小學每關約 200 分，因此這一站要玩 25 道題才會升到下一站。
     2. **一站只學 2~3 首詩**。題目在這幾首詩的關卡裡循環，玩家反覆遇到
        同一小批詩才記得住；不是一路往下讀新詩。

   執行方式：
      node tools/dump_learning_path.js [終點文位] [逐題明細站數]
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

// 自 scoreManager.js 取出既有的文位門檻表（絕不另外定義，避免與正式資料脫鉤）
const smSrc = fs.readFileSync(path.join(rootDir, 'scoreManager.js'), 'utf8');
// eslint-disable-next-line no-eval
const RANKS = eval('[' + smSrc.match(/ranks:\s*\[([\s\S]*?)\]/)[1] + ']');

LevelTable.inject(POEMS, LEVEL_TABLE);
PathStations.inject(RANKS);
PathStations.injectLevelTable(LevelTable);

const levelCounts = {};
['小學', '中學', '高中', '大學', '研究所'].forEach(t => { levelCounts[t] = LevelTable.getLevelCount(t); });
PathStations.injectLevelCounts(levelCounts);

// 文位 × 可用遊戲（與 learningPath.js 的 GAME_UNLOCK 保持一致）
const GAME_UNLOCK = [
    { ranks: ['書僮', '蒙童', '塾生', '童生', '縣案首'], add: [1, 4, 8, 11, 14, 22] },
    { ranks: ['府案首', '文童'], add: [3, 9, 12, 31, 40] },
    { ranks: ['秀才', '舉人'], add: [13, 20, 36, 33] },
    { ranks: ['貢士', '進士', '探花', '榜眼', '狀元', '大儒'], add: [21, 23, 37] }
];
const GAME_NAMES = {
    1: '慢思快選', 3: '字爬梯', 4: '眾裡尋他', 8: '一筆裁詩', 9: '詩韻鎖扣',
    11: '翻墨識蹤', 12: '疏影橫斜', 13: '人事時地', 14: '步步驚心', 20: '丟三落一',
    21: '橫批成詩', 22: '詩詞拼圖', 23: '縱橫集句', 31: '詩眼覓蹤', 33: '作者是誰',
    36: '轉輪覓詩', 37: '步步為陣', 40: '點兵成詩'
};
const RANK_GAMES = (() => {
    const map = {}; let acc = [];
    GAME_UNLOCK.forEach(seg => { acc = acc.concat(seg.add); seg.ranks.forEach(r => { map[r] = acc.slice(); }); });
    return map;
})();

const END_RANK = process.argv[2] || '探花';
const DETAIL_STATIONS = parseInt(process.argv[3], 10) || 3;

const REQ = { minLines: 2, maxLines: 2, minChars: 8, maxChars: 30, keyword: '' };
const byId = {};
POEMS.forEach(p => { byId[p.id] = p; });

/** 詩句總評價 = 該首詩所有 line_ratings 的總和 */
function totalLineRating(poem) {
    const lr = (poem && poem.line_ratings) || [];
    let s = 0;
    for (let i = 0; i < lr.length; i++) s += (lr[i] || 0);
    return s;
}

const allStations = PathStations.build();
const stations = [];
for (let i = 0; i < allStations.length; i++) {
    stations.push(allStations[i]);
    if (allStations[i].type === 'rank' && allStations[i].name === END_RANK) break;
}

const md = [];
md.push(`# 花月學習道路站點清單（書僮 → ${END_RANK}）`);
md.push('');
md.push(`> 由 \`tools/dump_learning_path.js\` 自動產生，共 ${stations.length} 站。`);
md.push('> ★ = 正式文位站　🏛 = 需通過科舉考試的文位站　其餘為小站。');
md.push('>');
md.push('> **一站不是一題**：一站是一段積分區間。書僮→書僮一相差 5,000 分、');
md.push('> 小學每關約得 200 分，因此這一站要玩 **25 道題**才會升到下一站。');
md.push('>');
md.push('> **一站只學 2~3 首詩**：題目只在這幾首詩的關卡裡循環，玩家反覆遇到');
md.push('> 同一小批詩才記得住。下一站再往前挪一首，讓舊詩繼續複習幾輪才淡出。');
md.push('>');
md.push('> **遊戲為隨機分配**：不綁定題號，玩家每次進入站點都隨機抽一款該文位可玩的遊戲。');
md.push('');

// ── A. 站點總表 ──
md.push('## A. 站點總表');
md.push('');
md.push('| 編號 | 文位 | 難度層 | 起始題號 | 題數 | 本站學習的詩詞 | 可玩遊戲數 |');
md.push('|---:|---|---|---:|---:|---|---:|');

stations.forEach((st, i) => {
    const mark = st.type === 'rank' ? (st.isExam ? ' 🏛' : ' ★') : '';
    const titles = (st.poemIds || []).map(id => byId[id] ? byId[id].title : ('#' + id));
    const gameCount = (RANK_GAMES[st.rankName] || []).length;
    md.push(`| ${i + 1} | ${st.name}${mark} | ${st.tier} | ${st.startQuestion} | ${st.questionCount} | ` +
        `${titles.join('、')} | ${gameCount} |`);
});

// ── B. 各站詩詞的題目內容 ──
md.push('');
md.push(`## B. 逐站題目內容（前 ${DETAIL_STATIONS} 站）`);
md.push('');

for (let i = 0; i < Math.min(DETAIL_STATIONS, stations.length); i++) {
    const st = stations[i];
    const games = (RANK_GAMES[st.rankName] || []).map(g => GAME_NAMES[g]).join('、');
    const titles = (st.poemIds || []).map(id => byId[id] ? byId[id].title : ('#' + id));

    md.push(`### ${i + 1}. ${st.name}（${st.tier}，第 ${st.startQuestion}~${st.startQuestion + st.questionCount - 1} 題，共 ${st.questionCount} 題）`);
    md.push('');
    md.push(`**本站學習：${titles.join('、')}**　｜　可玩遊戲（隨機抽）：${games}`);
    md.push('');
    md.push(`這 ${st.questionCount} 道題會在以下 ${st.levelPool.length} 個題目之間循環出現：`);
    md.push('');
    md.push('| 關卡編號 | 詩名 | 詩評價 | 詩句總評價 | 詩句 |');
    md.push('|---:|---|---:|---:|---|');
    st.levelPool.forEach(lv => {
        const r = LevelTable.resolve(st.tier, lv, REQ);
        md.push(`| ${lv} | ${r ? r.poem.title + '（' + (r.poem.author || '') + '）' : '—'} | ` +
            `${r ? (r.poem.rating || 0) : '-'} | ${r ? totalLineRating(r.poem) : '-'} | ` +
            `${r ? r.lines.join('，') : '—'} |`);
    });
    md.push('');
}

fs.writeFileSync(path.join(rootDir, 'note', '學習道路站點清單.md'), md.join('\n'), 'utf8');

// ── 主控台摘要 ──
console.log(`# 學習道路站點清單（書僮 → ${END_RANK}）共 ${stations.length} 站\n`);
console.log('| 編號 | 文位 | 難度層 | 起始題號 | 題數 | 本站學習的詩詞 |');
console.log('|---:|---|---|---:|---:|---|');
stations.slice(0, 14).forEach((st, i) => {
    const mark = st.type === 'rank' ? (st.isExam ? ' 🏛' : ' ★') : '';
    const titles = (st.poemIds || []).map(id => byId[id] ? byId[id].title : ('#' + id));
    console.log(`| ${i + 1} | ${st.name}${mark} | ${st.tier} | ${st.startQuestion} | ${st.questionCount} | ${titles.join('、')} |`);
});
console.log(`\n已輸出：note/學習道路站點清單.md`);
