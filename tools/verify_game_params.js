/* ==========================================================================
   花月 · 遊戲選詩參數健檢 (tools/verify_game_params.js)
   --------------------------------------------------------------------------
   用法：node tools/verify_game_params.js

   ── 這支工具解決什麼問題 ──────────────────────────────────────────────
   每款遊戲都會把「要幾句、幾個字」送進 getSharedRandomPoem，
   而這些數字彼此之間有隱含的算術關係。例如：
       minLines: 4 配 maxChars: 14
   在五言詩上就是 4 × 5 = 20 > 14 —— 數學上無解。
   一旦無解，levelTable.resolve() 會回傳 null，遊戲便退回全域隨機選詩，
   青雲梯指定的那首詩就再也出不來（實際發生過：小學層的「步步驚心」
   因此永遠只抽得到三言的〈花非花〉）。

   這種錯誤不會噴任何例外，只會安靜地讓玩家一直看到同一首詩，
   所以必須用工具檢查，不能靠人眼看設定表。

   ── 判讀輸出 ──────────────────────────────────────────────────────────
   每格顯示「拿到指定詩 / 解出率」：
     解出率     關卡表能為這款遊戲解出題目的比例。低於 100% = 有關卡會退回
                全域隨機，青雲梯失去對出題的控制 → ❌
     拿到指定詩 解出來的題目仍是關卡表指定的那首詩的比例。
                （換句不換詩算通過 —— 那是企畫書第五章的 B 案，屬正常行為；
                  只有換成「同題目群的別首詩」才算失準。）
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const POEMS = eval(fs.readFileSync(path.join(ROOT, 'data', 'poems.js'), 'utf8') + '; POEMS');
const LevelTable = require(path.join(ROOT, 'levelTable.js'));
LevelTable.inject(POEMS, require(path.join(ROOT, 'data', 'level_table.js')));
const PathStations = require(path.join(ROOT, 'pathStations.js'));
PathStations.injectLevelTable(LevelTable);

const TIERS = ['小學', '中學', '高中', '大學', '研究所'];

// 14 款列入青雲梯必通關卡的遊戲
const GAMES = {
    1: '慢思快選', 3: '字爬梯', 4: '眾裡尋他', 8: '一筆裁詩', 9: '詩韻鎖扣',
    11: '翻墨識蹤', 12: '疏影橫斜', 13: '人事時地', 14: '步步驚心', 20: '丟三落一',
    22: '詩詞拼圖', 31: '詩眼覓蹤', 37: '步步為陣', 40: '點兵成詩'
};

/** 從 gameXX.js 原始碼裡取出 difficultySettings 物件 */
function loadSettings(no) {
    const src = fs.readFileSync(path.join(ROOT, 'game' + no + '.js'), 'utf8');
    const i = src.indexOf('difficultySettings:');
    if (i < 0) throw new Error('game' + no + '.js 找不到 difficultySettings');
    const open = src.indexOf('{', i);
    let depth = 0, end = -1;
    for (let j = open; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (!depth) { end = j; break; } }
    }
    // eslint-disable-next-line no-eval
    return eval('(' + src.slice(open, end + 1) + ')');
}

/**
 * 求出某款遊戲在某難度層實際送進 getSharedRandomPoem 的行數／字數需求。
 *
 * ⚠️ 回傳的是**陣列**：少數遊戲每一局的需求不固定，同一個難度層會在
 *    幾種需求之間隨機（例如詩詞拼圖的 poemType 若為「七言」，每局會在
 *    5 字與 7 字之間隨機挑）。只驗其中一種會嚴重高估解出率 ——
 *    因此這裡把所有可能性都列出來，統計時一併平均。
 *
 * ⚠️ 少數參數不是直接取設定值而是推算出來的（題型、網格大小、每句字數），
 *    這裡必須比照呼叫端的算法，否則檢查結果會與實際行為對不上。
 */
function requirementsOf(no, s) {
    switch (no) {
        case 20: {  // minLines 由題型 A=2 / B=3 / C=4 決定，逐一驗證該難度開放的題型
            return (s.formats || ['A']).map(f => {
                const need = (f === 'A' ? 2 : f === 'B' ? 3 : 4);
                return { minLines: need, maxLines: Math.max(need, s.maxLines),
                         minChars: s.minChars, maxChars: s.maxChars, note: '題型' + f };
            });
        }
        case 22: {  // 行數 = gridLines；每句字數五言固定 5，七言則每局在 5/7 之間隨機
            const lens = (s.poemType === '五言') ? [5] : [5, 7];
            return lens.map(c => ({
                minLines: s.gridLines, maxLines: s.gridLines,
                minChars: s.gridLines * c, maxChars: s.gridLines * c, note: c + '字'
            }));
        }
        case 31:
            return [{ minLines: s.lineCount, maxLines: s.maxLines,
                      minChars: s.minChars, maxChars: s.maxChars }];
        case 40:  // 兩句必須等長，總字數恰為 charsPerLine × 2
            return [{ minLines: s.minLines, maxLines: s.maxLines,
                      minChars: s.charsPerLine * 2, maxChars: s.charsPerLine * 2 }];
        case 12:  // 題目要留得下要遮的字
            return [{ minLines: s.minLines, maxLines: s.maxLines,
                      minChars: Math.max(s.minChars,
                          (s.minTotalHideCount || 2) + (s.minShowCount || 1) * 2),
                      maxChars: s.maxChars }];
        default:
            return [{ minLines: s.minLines, maxLines: s.maxLines,
                      minChars: s.minChars, maxChars: s.maxChars }];
    }
}

// 各難度層的青雲梯必通關卡
const unitsByTier = {};
PathStations.build().forEach(st => (st.units || []).forEach(u => {
    (unitsByTier[u.tier] = unitsByTier[u.tier] || []).push(u.level);
}));
TIERS.forEach(t => { unitsByTier[t] = Array.from(new Set(unitsByTier[t] || [])); });

console.log('花月 · 遊戲選詩參數健檢');
console.log('每格＝「拿到指定詩 / 解出率」，括號內為涵蓋的不同詩詞數\n');
const header = '遊戲'.padEnd(15) + TIERS.map(t => t.padEnd(19)).join('');
console.log(header);
console.log('─'.repeat(header.length));

const fatal = [], warn = [];

Object.keys(GAMES).map(Number).sort((a, b) => a - b).forEach(no => {
    const settings = loadSettings(no);
    let row = ('G' + no + ' ' + GAMES[no]).padEnd(15);
    TIERS.forEach(tier => {
        const levels = unitsByTier[tier] || [];
        const s = settings[tier];
        if (!s) { row += '(無此難度)'.padEnd(19); return; }
        const reqs = requirementsOf(no, s);

        // 每一種可能的需求都要驗，最後取平均 —— 遊戲每局是隨機挑其中一種，
        // 只看最寬鬆的那一種會嚴重高估。
        let solved = 0, onTarget = 0, tries = 0;
        const poems = {};
        reqs.forEach(req => {
            levels.forEach(lv => {
                tries++;
                const r = LevelTable.resolve(tier, lv, req);
                if (!r) return;
                solved++;
                poems[r.poem.id] = true;
                if (r.fallback !== 'same-cluster') onTarget++;
            });
        });
        const sPct = tries ? Math.round(solved / tries * 100) : 100;
        const tPct = tries ? Math.round(onTarget / tries * 100) : 100;

        let mark = '  ';
        const desc = reqs.map(q =>
            `${q.minLines}~${q.maxLines}句 ${q.minChars}~${q.maxChars}字` +
            (q.note ? '(' + q.note + ')' : '')).join(' / ');
        if (sPct < 100) {
            mark = '❌';
            fatal.push(`G${no} ${GAMES[no]} / ${tier}：解出率 ${sPct}%（${desc}），` +
                `僅涵蓋 ${Object.keys(poems).length} 首 —— 其餘關卡會退回全域隨機`);
        } else if (tPct < 70) {
            mark = '⚠ ';
            warn.push(`G${no} ${GAMES[no]} / ${tier}：僅 ${tPct}% 拿到指定詩（${desc}）`);
        }
        row += (mark + `${tPct}%/${sPct}% (${Object.keys(poems).length}首)`).padEnd(19);
    });
    console.log(row);
});

if (fatal.length) {
    console.log('\n❌ 必須修正（關卡表失效，青雲梯無法控制出題）');
    fatal.forEach(m => console.log('   ' + m));
}
if (warn.length) {
    console.log('\n⚠  可再調整（題目解得出來，但常換成同題目群的別首詩）');
    warn.forEach(m => console.log('   ' + m));
}
if (!fatal.length && !warn.length) console.log('\n✅ 全部通過');

process.exitCode = fatal.length ? 1 : 0;
