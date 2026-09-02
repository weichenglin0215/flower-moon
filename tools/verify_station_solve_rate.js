/* ==========================================================================
   花月 · 青雲梯站點出題解出率報告 (tools/verify_station_solve_rate.js)
   --------------------------------------------------------------------------
   用法：node tools/verify_station_solve_rate.js
        node tools/verify_station_solve_rate.js md   → 另外輸出 note/青雲梯出題解出率報告.md

   ── 這支工具跟 tools/verify_game_params.js 有什麼不同 ──────────────────
   verify_game_params.js 是「以遊戲為單位」：檢查某一款遊戲在某個難度層，
   對「該難度層全部關卡」的解出率——用來抓出某款遊戲本身的參數設計問題。

   這支工具是「以青雲梯的站為單位」：站點只會用該文位已解鎖的遊戲池
   （learningPath.js 的 GAME_UNLOCK 累加表）去玩該站的必通關卡，
   因此算出來的才是玩家在那一站實際會遇到的解出率——
   同一款遊戲在同一個難度層，在「書僮」站和「文童」站解出率可能不同
   （因為兩站的可用遊戲池不同，pickGame 的候選組合也不同）。

   ⚠️ 這裡的「解出率」跟站進度、pickGame 的隨機挑選無關，純粹是靜態驗算：
      對這一站的每個必通單元，逐一檢查「該站可用的每一款遊戲」能不能解出題目。
      解不出來的組合，玩家實際遊玩時 pickGame 仍可能選中它、退回全域隨機——
      這裡算的就是這種情況的比例。
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

const POEMS = eval(fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8') + '; POEMS');
const LevelTable = require(path.join(rootDir, 'levelTable.js'));
LevelTable.inject(POEMS, require(path.join(rootDir, 'data', 'level_table.js')));
const PathStations = require(path.join(rootDir, 'pathStations.js'));
PathStations.injectLevelTable(LevelTable);

// learningPath.js 沒有 module.exports，但也沒有頂層 DOM 操作，
// 給一個空殼 window 就能在 Node 直接載入取用 GAME_UNLOCK / GAME_CHANNELS 等常數。
global.window = global.window || {};
eval(fs.readFileSync(path.join(rootDir, 'learningPath.js'), 'utf8'));
const LearningPath = global.window.LearningPath;

const byId = {};
POEMS.forEach(p => { byId[p.id] = p; });

/** 從 gameXX.js 原始碼取出 difficultySettings 物件（同 verify_game_params.js 的作法） */
function loadSettings(no) {
    const src = fs.readFileSync(path.join(rootDir, 'game' + no + '.js'), 'utf8');
    const i = src.indexOf('difficultySettings:');
    if (i < 0) return null;
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
 * 求出某款遊戲在某難度層的行數／字數需求（可能不只一種，見下方各 case）。
 * ⚠️ 與 tools/verify_game_params.js 的同名函式保持邏輯一致；
 *    這裡只涵蓋青雲梯會用到的 14 款遊戲。
 */
function requirementsOf(no, s) {
    if (!s) return [];
    switch (no) {
        case 20: {
            return (s.formats || ['A']).map(f => {
                const need = (f === 'A' ? 2 : f === 'B' ? 3 : 4);
                return {
                    minLines: need, maxLines: Math.max(need, s.maxLines),
                    minChars: s.minChars, maxChars: s.maxChars
                };
            });
        }
        case 22:  // 2026-09 移除 poemType：不再限制每句字數，缺格由 UI 的 null 補格處理
            return [{
                minLines: s.gridLines, maxLines: s.gridLines,
                minChars: s.gridLines * 2, maxChars: s.gridLines * 9
            }];
        case 31:
            return [{
                minLines: s.lineCount, maxLines: s.maxLines,
                minChars: s.minChars, maxChars: s.maxChars
            }];
        case 40: {  // 2026-09 移除 charsPerLine：五言／七言都嘗試，任一成功即可（OR，非平均機率），
            // 且要複驗兩句是否真的等長（見 game40.js 的事後檢查）
            const arr = [5, 7].map(c => ({
                minLines: s.minLines, maxLines: s.maxLines,
                minChars: c * 2, maxChars: c * 2, _c: c
            }));
            arr.orMode = true;
            arr.verify = (r, req) => r.lines.length === 2 &&
                r.lines[0].length === req._c && r.lines[1].length === req._c;
            return arr;
        }
        case 12:  // 公式需與 game12.js 的 requiredChars 一致：minShowCount 用 ?? 而非 ||（0 是合法值）
            return [{
                minLines: s.minLines, maxLines: s.maxLines,
                minChars: Math.max(s.minChars,
                    (s.minTotalHideCount || 2) + (s.minShowCount ?? 1) * 2),
                maxChars: s.maxChars
            }];
        default:
            return [{
                minLines: s.minLines, maxLines: s.maxLines,
                minChars: s.minChars, maxChars: s.maxChars
            }];
    }
}

const rankGames = LearningPath.buildRankGames();
const GAME_CHANNELS = LearningPath.GAME_CHANNELS;
const GAME_NAMES = LearningPath.GAME_NAMES;
const REVIEW_ONLY_GAMES = LearningPath.REVIEW_ONLY_GAMES;
const settingsCache = {};
function settingsOf(no) {
    if (!(no in settingsCache)) settingsCache[no] = loadSettings(no);
    return settingsCache[no];
}

const stations = PathStations.build();
const rows = [];

stations.forEach((st, idx) => {
    const pool = (rankGames[st.rankName] || [])
        .filter(g => GAME_CHANNELS[g] && !REVIEW_ONLY_GAMES[g]);
    if (!pool.length || !st.units.length) return;

    let tries = 0, solved = 0, onTarget = 0;
    const badGames = {};   // gameNo -> { tries, solved }

    st.units.forEach(u => {
        pool.forEach(g => {
            const s = settingsOf(g);
            const tier = u.tier; // 該單元自己的難度層（一站可能跨層）
            const reqs = requirementsOf(g, s && s[tier]);
            if (!reqs.length) return;
            if (!badGames[g]) badGames[g] = { tries: 0, solved: 0 };

            // orMode（如 G40）：這幾種需求都試，任一成功就用，以「每個關卡單元」為
            // 一次嘗試，不能像其餘遊戲那樣把每個 req 當成獨立的機率分開計次。
            if (reqs.orMode) {
                tries++;
                badGames[g].tries++;
                let hit = null;
                for (const req of reqs) {
                    const r = LevelTable.resolve(tier, u.level, req);
                    if (r && (!reqs.verify || reqs.verify(r, req))) { hit = r; break; }
                }
                if (hit) {
                    solved++;
                    badGames[g].solved++;
                    if (hit.fallback !== 'same-cluster') onTarget++;
                }
                return;
            }

            reqs.forEach(req => {
                tries++;
                badGames[g].tries++;
                const r = LevelTable.resolve(tier, u.level, req);
                if (r) {
                    solved++;
                    badGames[g].solved++;
                    if (r.fallback !== 'same-cluster') onTarget++;
                }
            });
        });
    });

    const worst = Object.keys(badGames)
        .map(g => ({ g, ...badGames[g], rate: badGames[g].solved / badGames[g].tries }))
        .filter(x => x.rate < 0.999)
        .sort((a, b) => a.rate - b.rate);

    rows.push({
        index: idx, name: st.name, rankName: st.rankName, tier: st.tier,
        poems: st.poemIds.map(id => (byId[id] && byId[id].title) || ('#' + id)),
        units: st.units.length, gamesInPool: pool.length,
        solveRate: tries ? solved / tries : 1,
        onTargetRate: tries ? onTarget / tries : 1,
        worstGames: worst.map(w => `G${w.g}${GAME_NAMES[w.g] ? '(' + GAME_NAMES[w.g] + ')' : ''} ${Math.round(w.rate * 100)}%`)
    });
});

// ── 主控台摘要 ──────────────────────────────────────────────────────────
const pct = x => (x * 100).toFixed(1) + '%';
const avgSolve = rows.reduce((a, r) => a + r.solveRate, 0) / rows.length;
const avgTarget = rows.reduce((a, r) => a + r.onTargetRate, 0) / rows.length;
console.log('花月 · 青雲梯站點出題解出率報告');
console.log(`共檢查 ${rows.length} 站　平均解出率 ${pct(avgSolve)}　平均拿到指定詩 ${pct(avgTarget)}`);
console.log('');

const worstStations = rows.slice().sort((a, b) => a.solveRate - b.solveRate).slice(0, 15);
console.log('解出率最低的 15 站：');
worstStations.forEach(r => {
    console.log(`  站${String(r.index).padStart(2)} ${r.name.padEnd(9)} ${r.tier}　` +
        `解出 ${pct(r.solveRate).padStart(6)}　指定詩 ${pct(r.onTargetRate).padStart(6)}　` +
        `教：${r.poems.slice(0, 3).join('、')}${r.poems.length > 3 ? '…' : ''}`);
    if (r.worstGames.length) console.log('      表現最差：' + r.worstGames.slice(0, 4).join('  '));
});

// ── Markdown 輸出（可選）───────────────────────────────────────────────
if ((process.argv[2] || '') === 'md') {
    const out = [];
    out.push('# 花月 · 青雲梯出題解出率報告');
    out.push('');
    out.push('> 本檔由 `tools/verify_station_solve_rate.js md` 自動產生，請勿手動編輯。');
    out.push('> 產生時間：' + new Date().toISOString().slice(0, 10));
    out.push('');
    out.push('## 名詞說明');
    out.push('');
    out.push('- **解出率**：該站可用的每一款遊戲，對該站每個必通單元嘗試出題，能成功解出（不必退回全域隨機）的比例。');
    out.push('- **拿到指定詩**：解出的題目裡，真的是該站要教的那首詩（而非同題目群裡的其他詩）的比例。');
    out.push('- 兩者都是 100% 才代表玩家在這一站一定會學到規劃中的教材；解出率偏低代表玩家可能被退回全域隨機、完全學到不相干的詩。');
    out.push('');
    out.push(`## 總覽`);
    out.push('');
    out.push(`共檢查 **${rows.length}** 站，平均解出率 **${pct(avgSolve)}**，平均拿到指定詩 **${pct(avgTarget)}**。`);
    out.push('');

    // 依遊戲彙總：哪些遊戲整體拖累最多站的解出率
    const byGame = {};
    rows.forEach(r => r.worstGames.forEach(w => {
        const m = w.match(/^G(\d+)/);
        if (m) byGame[m[1]] = (byGame[m[1]] || 0) + 1;
    }));
    const gameRank = Object.keys(byGame).sort((a, b) => byGame[b] - byGame[a]);
    if (gameRank.length) {
        out.push('### 出現在「表現最差」清單次數最多的遊戲');
        out.push('');
        out.push('| 遊戲 | 出現站數（滿分 ' + rows.length + ' 站） |');
        out.push('|---|---|');
        gameRank.forEach(g => {
            out.push(`| G${g}${GAME_NAMES[g] ? '（' + GAME_NAMES[g] + '）' : ''} | ${byGame[g]} |`);
        });
        out.push('');
        out.push('這份排行不是說這些遊戲本身有問題——它們大多是「整首詩逐字/逐句」類型');
        out.push('（步步驚心、步步為陣、疏影橫斜、詩詞拼圖、點兵成詩），結構上需要較長或較規則的句數，');
        out.push('題庫裡短小的絕句天生就配不齊。真正該關注的是「解出率」欄本身偏低的站，');
        out.push('而不是這張次數排行。');
        out.push('');
    }

    const badPoems = POEMS.filter(p => !p.title);
    if (badPoems.length) {
        out.push('### 資料缺陷（與出題邏輯無關，記錄供後續補齊）');
        out.push('');
        out.push('`data/poems.js` 有 ' + badPoems.length + ' 首詩缺少標題（id：' +
            badPoems.map(p => p.id).join('、') + '），下方明細表會顯示為 `#編號`。');
        out.push('');
    }
    out.push('## 逐站明細');
    out.push('');
    out.push('| 站 | 站名 | 難度層 | 解出率 | 拿到指定詩 | 教學詩詞 | 表現最差的遊戲 |');
    out.push('|---|---|---|---|---|---|---|');
    rows.forEach(r => {
        out.push(`| ${r.index} | ${r.name} | ${r.tier} | ${pct(r.solveRate)} | ${pct(r.onTargetRate)} | ` +
            `${r.poems.join('、')} | ${r.worstGames.join('、') || '—'} |`);
    });
    const target = path.join(rootDir, 'note', '青雲梯出題解出率報告.md');
    fs.writeFileSync(target, out.join('\n'), 'utf8');
    console.log('');
    console.log('已輸出：' + path.relative(rootDir, target));
}
