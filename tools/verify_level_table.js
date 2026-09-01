/* ==========================================================================
   花月 · 關卡表逐遊戲驗證 (verify_level_table.js)
   --------------------------------------------------------------------------
   對應企畫書：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md
     「逐遊戲驗證是否能正常出題」＋ B 案（同題目群內重選）失敗率統計

   ⚠️ 關鍵前提：難度層 == 難度設定
     兩欄式難度選單中，右欄「小學關卡模式」跑的就是各遊戲的『小學』
     difficultySettings。因此每個難度層只需驗證「該層自己的難度設定」，
     絕不是所有難度都要對所有層驗證一次
     （例如 game31 在小學層是 lineCount:4，不會是研究所的 16）。

   需求參數來源：
     下方 PROFILES 逐項自各 gameN.js 的 difficultySettings 與
     getSharedRandomPoem 呼叫端抄錄（2026-08-23）。

   執行方式：
      node tools/verify_level_table.js
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// eslint-disable-next-line no-eval
const POEMS = eval(fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8') + '; POEMS');
const LEVEL_TABLE = require(path.join(rootDir, 'data', 'level_table.js'));
const LevelTable = require(path.join(rootDir, 'levelTable.js'));

LevelTable.inject(POEMS, LEVEL_TABLE);

const TIER_NAMES = ['小學', '中學', '高中', '大學', '研究所'];

// ── 各遊戲 × 各難度的題目需求 [minLines, maxLines, minChars, maxChars] ──
// 每一列的五個元素依序對應 小學／中學／高中／大學／研究所。
const PROFILES = {
    // 固定引數（不隨難度變動）的遊戲
    'game1  慢思快選': [[2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30]],
    'game4  眾裡尋他': [[2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30]],
    'game11 翻墨識蹤': [[2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 8, 30]],
    'game13 人事時地': [[2, 2, 10, 40], [2, 2, 10, 40], [2, 2, 10, 40], [2, 2, 10, 40], [2, 2, 10, 40]],
    'game3  字爬梯': [[4, 10, 20, 100], [4, 10, 20, 100], [4, 10, 20, 100], [4, 10, 20, 100], [4, 10, 20, 100]],
    'game9  詩韻鎖扣': [[4, 4, 16, 40], [4, 4, 16, 40], [4, 4, 16, 40], [4, 4, 16, 40], [4, 4, 16, 40]],
    // game20：format A 取 2 句、其餘取 6 句，此處以較嚴苛的 6 句版本驗證
    'game20 丟三落一': [[6, 6, 8, 60], [6, 6, 8, 60], [6, 6, 8, 60], [6, 6, 8, 60], [6, 6, 8, 60]],

    // game8：minLines 隨難度提高（4/4/4/6/8），maxChars 固定 56，minChars 字面量 20
    'game8  一筆裁詩': [[4, 10, 20, 56], [4, 10, 20, 56], [4, 10, 20, 56], [6, 10, 20, 56], [8, 10, 20, 56]],

    // game12：requiredChars = max(8, minTotalHideCount + minShowCount*2)
    'game12 疏影橫斜': [[2, 2, 8, 30], [2, 2, 8, 30], [2, 2, 12, 30], [2, 2, 12, 30], [2, 2, 10, 30]],

    // game14 / game37：minLines 4、maxLines 8，字數上下限取自 difficultySettings
    'game14 步步驚心': [[4, 8, 10, 20], [4, 8, 20, 28], [4, 8, 28, 40], [4, 8, 28, 56], [4, 8, 28, 120]],
    'game37 步步為陣': [[4, 8, 10, 20], [4, 8, 20, 28], [4, 8, 28, 40], [4, 8, 28, 56], [4, 8, 40, 120]],

    // game31：(lineCount, max(lineCount+4,14), lineCount*3, 100)，lineCount = 4/6/8/12/16
    'game31 詩眼覓蹤': [[4, 14, 12, 100], [6, 14, 18, 100], [8, 14, 24, 100], [12, 16, 36, 100], [16, 20, 48, 100]],

    // game22：minChars === maxChars === gridLines × 每句字數（五言 5／七言 7）
    'game22 詩詞拼圖': [[4, 4, 20, 20], [6, 6, 30, 30], [6, 6, 42, 42], [8, 8, 56, 56], [8, 8, 56, 56]],

    // game40：totalChars = n*2（小學~高中五言 n=5、大學/研究所七言 n=7）
    'game40 點兵成詩': [[2, 2, 10, 10], [2, 2, 10, 10], [2, 2, 10, 10], [2, 2, 14, 14], [2, 2, 14, 14]]
};

console.log('=== 花月關卡表 · 逐遊戲驗證（企畫書步驟③）===');
console.log('每個難度層僅驗證「該層自己的難度設定」\n');

let grandFail = 0;
let grandTotal = 0;
const failRows = [];

for (let ti = 0; ti < TIER_NAMES.length; ti++) {
    const tier = TIER_NAMES[ti];
    const levelCount = LevelTable.getLevelCount(tier);
    console.log(`── ${tier}（共 ${levelCount} 關）` + '─'.repeat(44));
    console.log(
        '  遊戲'.padEnd(20) + '需求'.padEnd(20) +
        'anchor'.padStart(7) + 'same-poem'.padStart(10) +
        'B案'.padStart(7) + 'FAIL'.padStart(7)
    );

    for (const gameName of Object.keys(PROFILES)) {
        const [minLines, maxLines, minChars, maxChars] = PROFILES[gameName][ti];
        const req = { minLines, maxLines, minChars, maxChars, keyword: '' };
        const stat = { anchor: 0, 'same-poem': 0, 'same-cluster': 0, FAIL: 0 };

        for (let lv = 1; lv <= levelCount; lv++) {
            const r = LevelTable.resolve(tier, lv, req);
            if (!r) stat.FAIL++;
            else stat[r.fallback]++;
        }

        grandTotal += levelCount;
        grandFail += stat.FAIL;

        const reqStr = `${minLines}-${maxLines}句 ${minChars}-${maxChars}字`;
        const flag = stat.FAIL > 0 ? '  ✗' : '';
        if (stat.FAIL > 0) {
            failRows.push({
                tier, gameName, reqStr,
                fail: stat.FAIL, total: levelCount
            });
        }
        console.log(
            '  ' + gameName.padEnd(18) + reqStr.padEnd(20) +
            String(stat.anchor).padStart(7) +
            String(stat['same-poem']).padStart(10) +
            String(stat['same-cluster']).padStart(7) +
            String(stat.FAIL).padStart(7) + flag
        );
    }
    console.log('');
}

// ── 一致性驗證：解析出的詩必須屬於該關指定的詩詞題目群 ───────────────────
// 這是整個改版的核心保證：「同一關 = 同一個題目群」，跨遊戲複習才成立。
console.log('── 跨遊戲一致性驗證（解析結果是否都落在該關的題目群內）' + '─'.repeat(14));
let clusterMismatch = 0;
let clusterChecked = 0;
for (let ti = 0; ti < TIER_NAMES.length; ti++) {
    const tier = TIER_NAMES[ti];
    const levelCount = LevelTable.getLevelCount(tier);
    for (let lv = 1; lv <= levelCount; lv++) {
        const clusterIds = LevelTable.getClusterPoemIds(tier, lv);
        for (const gameName of Object.keys(PROFILES)) {
            const [a, b, c, d] = PROFILES[gameName][ti];
            const r = LevelTable.resolve(tier, lv, { minLines: a, maxLines: b, minChars: c, maxChars: d, keyword: '' });
            if (!r) continue;
            clusterChecked++;
            if (clusterIds.indexOf(r.poem.id) === -1) clusterMismatch++;
        }
    }
}
console.log(`  已檢查 ${clusterChecked.toLocaleString()} 組（關卡 × 遊戲），` +
    `跨群錯誤 ${clusterMismatch} 筆 ${clusterMismatch === 0 ? '✓' : '✗'}`);

// ── 決定性驗證：同一關連續解析兩次，結果必須完全相同 ─────────────────────
console.log('\n── 決定性驗證（同一關永遠出同一題）' + '─'.repeat(33));
let nonDeterministic = 0;
for (let ti = 0; ti < TIER_NAMES.length; ti++) {
    const tier = TIER_NAMES[ti];
    const levelCount = LevelTable.getLevelCount(tier);
    for (let lv = 1; lv <= levelCount; lv++) {
        const req = { minLines: 2, maxLines: 2, minChars: 8, maxChars: 30, keyword: '' };
        const a = LevelTable.resolve(tier, lv, req);
        const b = LevelTable.resolve(tier, lv, req);
        if (!a || !b) continue;
        if (a.poem.id !== b.poem.id || a.startIndex !== b.startIndex) nonDeterministic++;
    }
}
console.log(`  非決定性關卡：${nonDeterministic} 個 ${nonDeterministic === 0 ? '✓' : '✗'}`);

// ── 範例輸出：小學前 6 關（2 句制遊戲視角）───────────────────────────────
console.log('\n── 小學前 6 關實際題目（2 句制遊戲視角）' + '─'.repeat(28));
for (let lv = 1; lv <= Math.min(6, LevelTable.getLevelCount('小學')); lv++) {
    const r = LevelTable.resolve('小學', lv, { minLines: 2, maxLines: 2, minChars: 8, maxChars: 30, keyword: '' });
    console.log(r
        ? `  第 ${lv} 關｜${r.poem.title}（${r.poem.author}）｜${r.lines.join('，')}`
        : `  第 ${lv} 關｜FAIL`);
}

// ── 總結 ────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
const failRate = grandTotal > 0 ? (grandFail / grandTotal * 100) : 0;
console.log(`總驗證組數：${grandTotal.toLocaleString()}　失敗 ${grandFail} 筆（${failRate.toFixed(2)}%）`);

if (failRows.length) {
    console.log('\n未能固定關卡內容的組合（將退回隨機選詩，遊戲仍可正常遊玩）：');
    for (const r of failRows) {
        console.log(`  · ${r.tier} × ${r.gameName}（${r.reqStr}）` +
            ` ${r.fail}/${r.total} 關 = ${(r.fail / r.total * 100).toFixed(0)}%`);
    }
}

const structureOk = clusterMismatch === 0 && nonDeterministic === 0;
console.log('\n結構性保證：' + (structureOk
    ? '✓ 跨遊戲共用與決定性皆成立'
    : '✗ 結構性驗證未通過'));
process.exit(structureOk ? 0 : 1);
