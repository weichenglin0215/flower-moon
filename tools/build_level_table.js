/* ==========================================================================
   花月 · 跨遊戲共用關卡表生成器 (build_level_table.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路與關卡模式_企畫書.md 第五章「關卡模式建置流程」
     步驟① 先定每個難度層的關卡數量  → 本檔的 MAX_LEVELS_PER_TIER / 實際容量
     步驟② 依「詩詞題目群」把詩句片段依序塞進格子 → 本檔的 buildTier()

   核心觀念：
   1. 「關卡表」是唯一的內容來源，所有遊戲共用。
      例如「小學 第 1 關」對 game1、game13、game22 而言都是同一組詩句，
      只是呈現方式不同 —— 這就是「同一首詩派給不同遊戲練習」的實作方式。
   2. 「詩詞題目群 (cluster)」= 3~6 首詩為一組（此處取 4），
      讓玩家在同一群詩詞裡透過不同遊戲反覆相遇，練熟了才推進下一群。
   3. 「題目單位 (unit)」= 一組連續兩句（由偶數索引起算），
      與 script.js 的 getSharedRandomPoem 之 `i += 2` 慣例一致。

   執行方式：
      node tools/build_level_table.js
   輸出：
      data/level_table.js
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

// ── 難度層 → 詩詞評價下限 ────────────────────────────────────────────────
// 沿用既有的「累積下限抽樣」(rating >= minRating)，高難度池天然包含所有更容易
// 的詩，內建複習機制。⚠️ 絕不可改成互斥分層（如「小學只含評價 7」），
// 那會與現有設計互相矛盾（企畫書第三章原則 4）。
// ⚠️ 2026-08-24 改版：由「累積下限」改為「評價區間」
//
//   舊作法 rating >= minRating 會讓中學池包含**全部**評價 7 的詩，
//   加上依評價由高到低排序，導致每一個難度層的第 1 關都是同一首（靜夜思）。
//
//   新作法改用區間，相鄰兩層刻意重疊一級評價以保留複習效果，
//   但各層的「核心新教材」不同，第 1 關自然就不會重複。
const TIERS = [
    { name: '小學', minRating: 7, maxRating: 7 },
    { name: '中學', minRating: 6, maxRating: 7 },
    { name: '高中', minRating: 5, maxRating: 6 },
    { name: '大學', minRating: 4, maxRating: 5 },
    { name: '研究所', minRating: 2, maxRating: 4 }
];

// 一個「詩詞題目群」的詩詞數。企畫書定 3~6 首，此處取中間值 4。
// （企畫書第十章 Q2：確切數字待實際測試後調整，改這個常數即可重新生成。）
const CLUSTER_SIZE = 4;

// 每個難度層的關卡數上限（避免研究所因詩量龐大而產生上千關，拖慢選關介面渲染）
const MAX_LEVELS_PER_TIER = 2000;

// 學習道路各難度層「至少」需要的關卡數（= 該層涵蓋的文位站 + 小站總數）
// 來源：企畫書第 6.5 節的小站分段計算結果。
//   小學   書僮..縣案首 ：小站 1+1+3+3 = 8  ＋ 文位 5 = 13
//   中學   ..秀才       ：小站 1+3+8   = 12 ＋ 文位 3 = 15
//   高中   ..進士       ：小站 7+15+31 = 53 ＋ 文位 3 = 56
//   大學   ..榜眼       ：小站 25+50   = 75 ＋ 文位 2 = 77
//   研究所 ..大儒       ：小站 48+97   = 145＋ 文位 2 = 147
const MIN_LEVELS_REQUIRED = {
    '小學': 13, '中學': 15, '高中': 56, '大學': 77, '研究所': 147
};

// 標點符號正則 —— 必須與 script.js 的 getSharedRandomPoem 完全一致，
// 否則兩邊算出的「乾淨字數」會不同，導致關卡表與實際出題判定不符。
// 一個「題目單位」（連續兩句）至少要有幾個字才堪用。
// 取 8 是因為多數 2 句制遊戲的 minChars 為 8（game1／game4／game11）。
const MIN_UNIT_CHARS = 8;

const PUNCT = /[，。？！、：；「」『』\s]/g;
const cleanLine = (s) => (s || '').replace(PUNCT, '');

/**
 * 讀取並解析 data/poems.js。
 * poems.js 的內容形如 `const POEMS = [...]`，直接以 eval 取出陣列。
 */
function loadPoems(rootDir) {
    const src = fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8');
    // eslint-disable-next-line no-eval
    return eval(src + '; POEMS');
}

/**
 * 計算一首詩的「詩句總評價」平均值，作為同詩詞評價內的次要排序依據。
 * （企畫書第 2.3 節：主要排序鍵 = rating，次要排序鍵 = 詩句總評價）
 * 採平均而非加總，避免長詩僅因句數多就排前面。
 */
function avgLineRating(poem) {
    const lr = poem.line_ratings || [];
    if (lr.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < lr.length; i++) sum += (lr[i] || 0);
    return sum / lr.length;
}

/**
 * 列出一首詩所有合法的「題目單位」起始索引。
 * 規則：由偶數索引起算（維持古典詩詞「兩句一聯」的完整性），
 *       且該兩句去除標點後皆須有實際字元。
 */
function validUnits(poem) {
    const units = [];
    const content = poem.content || [];
    for (let i = 0; i + 1 < content.length; i += 2) {
        const a = cleanLine(content[i]);
        const b = cleanLine(content[i + 1]);
        if (a.length === 0 || b.length === 0) continue;

        // ⚠️ 過短的句對不能當錨定：詞牌常有「轉朱閣，低綺戶」這種三字短句，
        //    兩句合計僅 6 字，低於幾乎所有遊戲的字數下限（game1 要 8 字、
        //    game13 要 10 字），錨定後必定觸發 B 案改挑同詩的其他句，
        //    結果就是同一首詩的第一組句子被重複指派到多個關卡。
        //    在生成階段先濾掉，關卡序列才不會出現「看起來跳回開頭」的重複。
        if (a.length + b.length < MIN_UNIT_CHARS) continue;

        units.push(i);
    }
    return units;
}

/**
 * 建立單一難度層的關卡表。
 * @returns {{minRating:number, clusters:number[][], levels:{c:number,p:number,s:number}[]}}
 */
function buildTier(poems, tier) {
    // 步驟 1：以評價「區間」篩出該層的詩詞池
    const pool = poems.filter(p =>
        (p.rating || 0) >= tier.minRating &&
        (p.rating || 0) <= tier.maxRating &&
        p.content && p.content.length >= 2
    );

    // 步驟 2：排序 —— 「該層的核心新教材優先」
    //
    //   主要鍵：詩詞評價**由低到高**。
    //     這是刻意的：例如中學區間為 6~7，評價 6 才是中學這一層真正要教的
    //     新內容，評價 7 是從小學延續下來的複習素材。若照評價由高到低排，
    //     中學又會從評價 7 的靜夜思開始，與小學第 1 關完全重複。
    //   次要鍵：詩句總評價由高到低（同評價時，佳句多的詩先教）。
    //   決勝鍵：id 遞增，確保每次生成結果完全一致（決定性）。
    pool.sort((a, b) =>
        (a.rating || 0) - (b.rating || 0) ||
        avgLineRating(b) - avgLineRating(a) ||
        (a.id || 0) - (b.id || 0)
    );

    // 步驟 3：切成「詩詞題目群」，且刻意讓每一群的詩詞長短搭配
    //
    // ⚠️ 為什麼不能單純每 4 首切一群：
    //   各遊戲對「句數」的需求差異極大 —— game1 只要 2 句，game22 大學要 8 句，
    //   game31 研究所甚至要 16 句。若一群裡剛好全是四句絕句，那些需要長詩的
    //   遊戲在這一關就完全無詩可用，只能退回隨機選詩，
    //   「同一關 = 同一個題目群」的保證就破功了。
    //   （實測：純依評價分群時，研究所 × 步步為陣 的失敗率高達 100%。）
    //
    // 解法：先依句數分成三個桶，每一群固定抽
    //   1 首長詩(>=16句) + 1 首中長詩(8~15句) + 其餘短詩
    // 桶內仍維持評價高→低的順序，因此「先學高評價的詩」的原則不變。
    const veryLong = pool.filter(p => p.content.length >= 16);
    const long = pool.filter(p => p.content.length >= 8 && p.content.length < 16);
    const short = pool.filter(p => p.content.length < 8);

    const clusters = [];
    const clusterCount = Math.ceil(pool.length / CLUSTER_SIZE);
    let vi = 0, li = 0, si = 0;

    for (let ci = 0; ci < clusterCount; ci++) {
        const group = [];
        if (vi < veryLong.length) group.push(veryLong[vi++]);
        if (li < long.length) group.push(long[li++]);
        while (group.length < CLUSTER_SIZE && si < short.length) group.push(short[si++]);
        // 短詩用完時，改由剩餘的中長詩／長詩補滿
        while (group.length < CLUSTER_SIZE && li < long.length) group.push(long[li++]);
        while (group.length < CLUSTER_SIZE && vi < veryLong.length) group.push(veryLong[vi++]);
        if (group.length === 0) break;
        clusters.push(group);
    }

    // 步驟 4：逐群、逐詩、逐單位依序填入關卡格子。
    //   刻意採「同一首詩的單位連續排列」而非跨詩輪替，因為背詩本來就是
    //   一首一首背 —— 例如靜夜思會佔用連續兩關：
    //     第 1 關「床前明月光，疑是地上霜」
    //     第 2 關「舉頭望明月，低頭思故鄉」
    const levels = [];
    outer:
    for (let ci = 0; ci < clusters.length; ci++) {
        // ⚠️ 群「成員」與群內「出題順序」是兩回事：
        //   成員刻意混入長詩，是為了讓需要 8~16 句的遊戲有詩可用（見步驟 3）；
        //   但出題順序必須「短詩優先」，因為初學者該先背四句絕句，
        //   而不是一開場就碰到十六句的水調歌頭。
        //   同長度時再依評價高低，最後以 id 決勝以確保決定性。
        const ordered = clusters[ci].slice().sort((a, b) =>
            a.content.length - b.content.length ||
            (b.rating || 0) - (a.rating || 0) ||
            (a.id || 0) - (b.id || 0)
        );
        for (const poem of ordered) {
            for (const s of validUnits(poem)) {
                levels.push({ c: ci, p: poem.id, s: s });
                if (levels.length >= MAX_LEVELS_PER_TIER) break outer;
            }
        }
    }

    return {
        minRating: tier.minRating,
        // 只保留實際被關卡引用到的題目群（避免 MAX 截斷後留下大量無用群組）
        clusters: clusters.slice(0, (levels[levels.length - 1] || { c: 0 }).c + 1)
            .map(c => c.map(p => p.id)),
        levels: levels
    };
}

function main() {
    const rootDir = path.resolve(__dirname, '..');
    const poems = loadPoems(rootDir);

    const table = {
        version: '1.0',
        generatedAt: new Date().toISOString().slice(0, 10),
        clusterSize: CLUSTER_SIZE,
        tiers: {}
    };

    console.log('=== 花月關卡表生成 ===');
    console.log(`詩詞總數：${poems.length}\n`);

    let hasError = false;

    for (const tier of TIERS) {
        const built = buildTier(poems, tier);
        table.tiers[tier.name] = built;

        const poolSize = poems.filter(p =>
            (p.rating || 0) >= tier.minRating && (p.rating || 0) <= tier.maxRating).length;
        const need = MIN_LEVELS_REQUIRED[tier.name];
        const ok = built.levels.length >= need;
        if (!ok) hasError = true;

        console.log(
            `${tier.name.padEnd(4)} 評價 ${tier.minRating}~${tier.maxRating}  ` +
            `詩詞 ${String(poolSize).padStart(3)} 首  ` +
            `題目群 ${String(built.clusters.length).padStart(3)} 群  ` +
            `關卡 ${String(built.levels.length).padStart(3)} 關  ` +
            `(學習道路需 ${String(need).padStart(3)}) ${ok ? '✓' : '✗ 關卡數不足！'}`
        );
    }

    const outPath = path.join(rootDir, 'data', 'level_table.js');
    const out =
        '/* ==========================================================================\n' +
        '   花月 · 跨遊戲共用關卡表（自動生成，請勿手動編輯）\n' +
        '   由 tools/build_level_table.js 產生；要修改請改生成器後重新執行：\n' +
        '       node tools/build_level_table.js\n' +
        '\n' +
        '   資料結構：\n' +
        '     tiers[難度].minRating  該層的詩詞評價下限（累積下限抽樣）\n' +
        '     tiers[難度].clusters   詩詞題目群，每群 3~6 首詩的 poem id 陣列\n' +
        '     tiers[難度].levels     關卡陣列（索引 0 = 第 1 關），每筆：\n' +
        '                              c = 所屬題目群索引\n' +
        '                              p = 錨定詩詞 id\n' +
        '                              s = 錨定起始句索引（偶數，取連續兩句）\n' +
        '\n' +
        '   ⚠️ 錨定 (anchor) 只是「首選」。實際出題時由 levelTable.js 的 resolve()\n' +
        '      依各遊戲的行數/字數需求驗證；若錨定詩句不符該遊戲需求，會在\n' +
        '      「同一個題目群」內改挑其他詩句（企畫書第五章步驟③ B 案）。\n' +
        '   ========================================================================== */\n\n' +
        'const LEVEL_TABLE = ' + JSON.stringify(table) + ';\n\n' +
        "if (typeof module !== 'undefined' && module.exports) module.exports = LEVEL_TABLE;\n";

    fs.writeFileSync(outPath, out, 'utf8');

    const totalLevels = Object.values(table.tiers).reduce((n, t) => n + t.levels.length, 0);
    console.log(`\n總關卡數：${totalLevels}`);
    console.log(`已輸出：data/level_table.js (${(out.length / 1024).toFixed(1)} KB)`);

    if (hasError) {
        console.error('\n✗ 有難度層的關卡數不足以支撐學習道路，請調整 CLUSTER_SIZE 或評價分層。');
        process.exit(1);
    }
    console.log('✓ 所有難度層的關卡數皆足夠支撐學習道路。');
}

main();
