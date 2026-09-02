/* ==========================================================================
   花月 · 各遊戲得分推算工具 (tools/estimate_game_scores.js)
   --------------------------------------------------------------------------
   用法：node tools/estimate_game_scores.js
        node tools/estimate_game_scores.js md   → 產生 note/各遊戲得分推算表.md

   ── 這支工具在做什麼 ──────────────────────────────────────────────────
   不實際遊玩，而是依照 scoreManager.js 的結算公式，配合每款遊戲
   difficultySettings 的時限／紅心／題目長度設定，推算「完美通關」時
   各難度大約可以拿到幾分。目的是檢查各遊戲在同一難度（尤其是小學）
   的得分是否落在相近的區間。

   ── 結算公式（scoreManager.js playWinAnimation）─────────────────────
       最終得分 = ( 遊戲中累計分
                  + base
                  + 剩餘紅心數 × heart
                  + 剩餘秒數   × time ) × 難度倍率

       難度倍率：小學 1、中學 2、高中 3、大學 4、研究所 5

   ⚠️ 三個必須說明的推算前提 ────────────────────────────────────────────
   (1) 一律假設「完美通關」：紅心全滿、遊戲中該拿的分都拿到。
       實際遊玩會低於此值，因此本表是**上限**而非期望值。

   (2) 「剩餘秒數」是最大的變數，也是本工具最不確定的地方。
       同一款遊戲，玩家花 20% 或 80% 的時間完成，分數可能差好幾倍。
       因此下方一律輸出三種情境（速通／中等／壓線），不給單一數字。

   (3) 「遊戲中累計分」的觸發次數是依程式碼推估的，各遊戲精確度不同，
       每一列都標了信心等級：
         高 = 觸發次數可由設定值直接算出（例如每個遮字加一次分）
         中 = 觸發次數與題目長度相關，已依實際抽樣的詩句長度估算
         低 = 觸發次數取決於玩家操作（連鎖、combo），僅取保守下限
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

const POEMS = eval(fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8') + '; POEMS');

// 取 scoreManager.js 的 gameSettings / multipliers（該檔結尾會掛上 window）
global.window = global.window || {};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.document = { getElementById: () => null, querySelectorAll: () => [], head: { appendChild() {} }, createElement: () => ({ style: {} }) };
eval(fs.readFileSync(path.join(rootDir, 'scoreManager.js'), 'utf8'));
const SM = global.window.ScoreManager;

const TIERS = ['小學', '中學', '高中', '大學', '研究所'];
const PUNCT = /[，。？！、：；「」『』\s]/g;
const clean = s => (s || '').replace(PUNCT, '');

/** 從 gameXX.js 原始碼取出 difficultySettings */
function loadSettings(no) {
    const p = path.join(rootDir, 'game' + no + '.js');
    if (!fs.existsSync(p)) return null;
    const src = fs.readFileSync(p, 'utf8');
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
 * 依選詩條件抽樣 N 組題目，回傳每一組的 { chars, lines }。
 * 擴充邏輯比照 script.js getSharedRandomPoem：自起始句取 minLines 句，
 * 再以「兩句一聯」往下擴充到 maxLines / maxChars 為止。
 */
function sampleQuestions(req, n) {
    const out = [];
    const pool = POEMS.filter(p => (p.rating || 0) >= (req.minRating || 0) && p.content);
    for (const poem of pool) {
        const c = poem.content;
        for (let s = 0; s + req.minLines <= c.length; s += 2) {
            let chars = 0, ok = true;
            for (let j = 0; j < req.minLines; j++) {
                const cl = clean(c[s + j]);
                if (!cl.length) { ok = false; break; }
                chars += cl.length;
            }
            if (!ok || chars < req.minChars || chars > req.maxChars) continue;
            // 往下擴充
            let lines = req.minLines;
            while (s + lines + 1 < c.length && lines + 2 <= req.maxLines) {
                const a = clean(c[s + lines]), b = clean(c[s + lines + 1]);
                if (!a.length || !b.length) break;
                if (chars + a.length + b.length > req.maxChars) break;
                chars += a.length + b.length;
                lines += 2;
            }
            out.push({ chars, lines });
            break;   // 一首詩只取一組，讓樣本涵蓋較多不同的詩
        }
        if (out.length >= n) break;
    }
    return out;
}

// ══════════════════════════════════════════════════════════════════════
//  各遊戲的推算模型
//  每個模型回傳 { hearts, maxTimer, inGame, confidence, note }
//  ⚠️ 公式後方註記的行號為撰寫當下 gameXX.js 的來源位置，供日後核對。
// ══════════════════════════════════════════════════════════════════════
const MODELS = {
    // ── 有時限、有紅心，遊戲中無累計分 ────────────────────────────────
    1: (s, q) => ({ hearts: s.maxMistakeCount, maxTimer: s.timeLimit, inGame: 0,
        confidence: '高', note: '固定時限 timeLimit；無遊戲中得分' }),
    20: (s, q) => ({ hearts: s.maxMistakeCount, maxTimer: s.timeLimit, inGame: 0,
        confidence: '高', note: '固定時限；單題決勝，heart 高達 50' }),

    // ── 時限 = 題目長度 × 倍率 ────────────────────────────────────────
    2: (s, q, d) => ({ hearts: s.maxMistakeCount,
        // 時限 = 答案行字數 × timeLimitRate（game2.js:298）；答案行約為半句
        maxTimer: Math.round((q.chars / q.lines) * s.timeLimitRate),
        inGame: SM.getPointA('game2', d) * s.questionCount,
        confidence: '中', note: '時限只看「答案那一行」的字數，非整題' }),

    4: (s, q, d) => ({ hearts: s.maxMistakeCount,
        // 時限 = 遮罩字數 × timeLimitRate（game4.js:241）
        maxTimer: Math.round(s.maxMaskCount * s.timeLimitRate),
        inGame: SM.getPointA('game4', d) * s.maxMaskCount,
        confidence: '中', note: '時限與得分皆以 maxMaskCount 估算' }),

    5: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(s.answerLen * s.timeLimitRate),
        inGame: SM.getPointA('game5', d) * s.answerLen,
        confidence: '中', note: '以 answerLen（收集字數）估算' }),

    6: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(q.chars * s.timeLimitRate),
        inGame: SM.getPointA('game6', d) * q.chars,
        confidence: '中', note: '每擊落一字得分；連擊倍率未計入（保守下限）' }),

    7: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(q.chars * s.timeLimitRate),
        inGame: SM.getPointA('game7', d) * q.chars,
        confidence: '中', note: '每字一次（game7.js:711）' }),

    8: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.ceil(q.chars * s.timeLimitRate),
        // getPointA × 路徑長度，整局路徑總長≈總字數（game8.js:1155）
        inGame: SM.getPointA('game8', d) * q.chars,
        confidence: '中', note: 'getPointA 已含 getPointAMul 難度倍率' }),

    // ⚠️ game9 的 #game9-hearts 容器建立後就被清空且從未填入紅心（game9.js:378），
    //    因此 gameSettings 的 heart:10 對這款遊戲實際上不生效，紅心一律以 0 計。
    9: (s, q, d) => ({ hearts: 0,
        // game9 的 timer 是「剩餘步數」maxMoves，非秒數（game9.js:958）
        maxTimer: s.totalNumberOfExchange,
        // ⚠️ 每次得分 = getPointA × exchangeQuantity × totalNumberOfExchange（game9.js:719）
        inGame: SM.getPointA('game9', d) * s.exchangeQuantity * s.totalNumberOfExchange,
        confidence: '低', note: '⚠ 無紅心（容器未填入）；time 換算的是剩餘「步數」不是秒；得分公式含兩層相乘' }),

    12: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(s.minTotalHideCount * s.timeLimitRate * 2),
        inGame: SM.getPointA('game12', d) * s.minTotalHideCount,
        confidence: '中', note: '每答對一個遮字得分（game12.js:686）' }),

    13: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round((s.metaHideCount + s.charHideCount) * s.timeLimitRate),
        inGame: SM.getPointA('game13', d) * (s.metaHideCount + s.charHideCount),
        confidence: '高', note: '時限與得分同以 meta+char 隱藏數計算' }),

    14: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.ceil(q.chars * s.timeMutiply),
        inGame: SM.getPointA('game14', d) * q.lines,
        confidence: '高', note: '每答對一行加一次（game14.js:449）' }),

    15: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(q.chars * s.timeLimitRate),
        inGame: SM.getPointA('game15', d) * q.chars,
        confidence: '中', note: '每字一次' }),

    16: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: 0,   // 無時限
        inGame: SM.getPointA('game16', d) * q.chars,
        confidence: '中', note: '無時限（time:0）；combo>5 會加倍，此處未計入' }),

    17: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(q.chars * s.timeLimitRate),
        inGame: SM.getPointA('game17', d) * q.chars,
        confidence: '中', note: '每字一次' }),

    19: (s, q, d) => ({ hearts: s.maxLives,
        maxTimer: 0,   // gameSettings time:0
        inGame: SM.getPointA('game19', d) * q.chars,
        confidence: '中', note: '無時間加成（time:0）' }),

    31: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(q.chars * s.timeLimitRate),
        // 每句挑出 minDecoy~maxDecoy 個替身字，答對一個加一次
        inGame: SM.getPointA('game31', d) * s.lineCount *
                ((s.minDecoyCount + s.maxDecoyCount) / 2),
        confidence: '中', note: '替身字數取 min/max 平均' }),

    37: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.ceil(q.chars * s.timeMutiply),
        // getPointA 會再依宮格邊長倍增（見 scoreManager 註解），此處取邊長≈√字數
        inGame: SM.getPointA('game37', d) * q.chars * Math.round(Math.sqrt(q.chars)),
        confidence: '低', note: '⚠ getPointA 依宮格邊長倍增，邊長以 √字數 近似' }),

    40: (s, q, d) => ({ hearts: s.maxMistakeCount,
        maxTimer: Math.round(s.charsPerLine * 2 * s.timeLimitRate),
        // A：點對一塊字；B：某字全數點齊。兩句共 charsPerLine*2 個字
        inGame: SM.getPointA('game40', d) * s.charsPerLine * 2 * s.showQuestion +
                SM.getPointB('game40', d) * s.charsPerLine * 2,
        confidence: '中', note: 'A 依 showQuestion 次數估算' }),

    // ── 無紅心、時限較長的單題決勝型 ──────────────────────────────────
    22: (s, q, d) => ({ hearts: 0, maxTimer: s.timeLimit,
        inGame: SM.getPointA('game22', d) * s.gridLines,
        confidence: '低', note: '⚠ 拼圖片數與得分次數關聯不明，以 gridLines 估' }),
};

// 這些遊戲的得分與玩家操作（連鎖、combo、路徑長度）高度相關，
// 無法只憑設定值推算出有意義的數字，因此不列入表格，改於報告中說明。
const UNMODELED = {
    3:  '字爬梯：無時限（time:0），得分次數取決於玩家爬升距離',
    10: '擊石鳴詩：無時限，磚塊數與消行次數取決於實際碰撞',
    11: '翻墨識蹤：無時限，得分次數取決於翻牌輪數',
    21: '橫批成詩：未接 getSharedRandomPoem，題目來源不同',
    23: '縱橫集句：未接 getSharedRandomPoem',
    24: '三字成珠：三消連鎖，(2N−5)×倍率，變異極大',
    25: '連珠拾字：同上',
    26: '投珠破句：同上',
    27: '詩磚壘塔：俄羅斯方塊，得分取決於堆疊表現',
    28: '兩心相印：連連看，配對次數依版面而定',
    29: '字龍盤環：滾球收集，連鎖等級變異大',
    30: '層巒疊翠：麻將疊疊',
    32: '尋詩地圖：地圖故事型，無標準結算',
    33: '作者是誰：得分 = 未翻開線索卡數，取決於玩家何時猜中',
    34: '猜猜詩題：多題問答，questionCount 為題數但每題得分僅 1',
    35: '詩人心情：情境推理，無標準結算',
    36: '轉輪覓詩：Wordle 型，無紅心且得分僅來自時間',
    38: '推枰成詩：無紅心，方塊落點得分依玩家操作',
    39: '彈珠成詩：time 換算的是「剩餘彈珠數」不是秒數',
};

/** 該遊戲在該難度的選詩條件（與 tools/verify_game_params.js 邏輯一致） */
function reqOf(no, s) {
    const base = { minRating: s.poemMinRating || 0 };
    switch (no) {
        case 22: {
            const c = (s.poemType === '五言') ? 5 : 7;
            return { ...base, minLines: s.gridLines, maxLines: s.gridLines,
                     minChars: s.gridLines * c, maxChars: s.gridLines * c };
        }
        case 31: return { ...base, minLines: s.lineCount, maxLines: s.maxLines,
                          minChars: s.minChars, maxChars: s.maxChars };
        case 40: return { ...base, minLines: s.minLines, maxLines: s.maxLines,
                          minChars: s.charsPerLine * 2, maxChars: s.charsPerLine * 2 };
        case 6:  return { ...base, minLines: s.lineCount, maxLines: s.lineCount,
                          minChars: s.minChars, maxChars: s.maxChars };
        case 17: case 19:
            return { ...base, minLines: s.lineCount, maxLines: s.lineCount,
                     minChars: s.minChars, maxChars: s.maxChars };
        case 7:  return { ...base, minLines: s.anchorMinLines, maxLines: s.anchorMaxLines,
                          minChars: s.anchorMinChars, maxChars: s.anchorMaxChars };
        case 16: return { ...base, minLines: s.minLines, maxLines: s.maxLines,
                          minChars: s.minChars, maxChars: s.maxChars };
        default: return { ...base, minLines: s.minLines || 2, maxLines: s.maxLines || 2,
                          minChars: s.minChars || 8, maxChars: s.maxChars || 30 };
    }
}

// ── 三種「剩餘時間」情境 ────────────────────────────────────────────────
const SCENARIOS = [
    { key: 'fast', name: '速通', ratio: 0.70, desc: '只花 30% 時限完成（高手／簡單題）' },
    { key: 'mid',  name: '中等', ratio: 0.40, desc: '花 60% 時限完成（一般玩家）' },
    { key: 'slow', name: '壓線', ratio: 0.10, desc: '花 90% 時限完成（勉強過關）' },
];

const SAMPLE_N = 10;
const results = {};   // no -> tier -> { fast, mid, slow, parts, conf, note }

Object.keys(MODELS).map(Number).sort((a, b) => a - b).forEach(no => {
    const settings = loadSettings(no);
    const gs = SM.gameSettings['game' + no];
    if (!settings || !gs) return;
    results[no] = {};
    TIERS.forEach(tier => {
        const s = settings[tier];
        if (!s) return;
        const qs = sampleQuestions(reqOf(no, s), SAMPLE_N);
        if (!qs.length) { results[no][tier] = null; return; }

        const mult = SM.multipliers[tier];
        const acc = { fast: 0, mid: 0, slow: 0, base: 0, heart: 0, time: 0, inGame: 0 };
        let conf = '高', note = '';
        qs.forEach(q => {
            const m = MODELS[no](s, q, tier);
            conf = m.confidence; note = m.note;
            const baseP = gs.base;
            const heartP = m.hearts * gs.heart;
            const inGameP = m.inGame;
            acc.base += baseP; acc.heart += heartP; acc.inGame += inGameP;
            SCENARIOS.forEach(sc => {
                const timeP = Math.floor(m.maxTimer * sc.ratio) * gs.time;
                acc[sc.key] += Math.floor((inGameP + baseP + heartP + timeP) * mult);
            });
            acc.time += Math.floor(m.maxTimer * 0.40) * gs.time;
        });
        const n = qs.length;
        results[no][tier] = {
            fast: Math.round(acc.fast / n), mid: Math.round(acc.mid / n), slow: Math.round(acc.slow / n),
            parts: { base: Math.round(acc.base / n), heart: Math.round(acc.heart / n),
                     time: Math.round(acc.time / n), inGame: Math.round(acc.inGame / n) },
            conf, note, samples: n
        };
    });
});

// ══════════════════════════════════════════════════════════════════════
//  輸出
// ══════════════════════════════════════════════════════════════════════
const NAMES = {
    1:'慢思快選',2:'飛花令',4:'眾裡尋他',5:'詩詞小精靈',6:'詩陣侵略',7:'青鳥雲梯',
    8:'一筆裁詩',9:'詩韻鎖扣',12:'疏影橫斜',13:'人事時地',14:'步步驚心',15:'墨韻游龍',
    16:'打地詩',17:'青蛙過河',19:'詩碟狂襲',20:'丟三落一',22:'詩詞拼圖',31:'詩眼覓蹤',
    37:'步步為陣',40:'點兵成詩',
};
const nums = Object.keys(results).map(Number).sort((a, b) => a - b);
const fmt = v => v == null ? '—' : String(v);

function tableFor(scKey) {
    const lines = [];
    lines.push('| 遊戲 | ' + TIERS.join(' | ') + ' | 信心 |');
    lines.push('|---|' + TIERS.map(() => '---:').join('|') + '|:--:|');
    nums.forEach(no => {
        const r = results[no];
        const cells = TIERS.map(t => r[t] ? fmt(r[t][scKey]) : '—');
        const anyRow = TIERS.map(t => r[t]).find(Boolean);
        lines.push(`| G${no} ${NAMES[no] || ''} | ${cells.join(' | ')} | ${anyRow ? anyRow.conf : '—'} |`);
    });
    return lines.join('\n');
}

console.log('花月 · 各遊戲得分推算（完美通關上限，非期望值）');
console.log('');
SCENARIOS.forEach(sc => {
    console.log(`── 情境「${sc.name}」：${sc.desc} ──`);
    const head = '遊戲'.padEnd(16) + TIERS.map(t => t.padStart(9)).join('');
    console.log(head);
    nums.forEach(no => {
        const r = results[no];
        const cells = TIERS.map(t => (r[t] ? String(r[t][sc.key]) : '—').padStart(9)).join('');
        console.log(`G${no} ${NAMES[no] || ''}`.padEnd(16) + cells);
    });
    console.log('');
});

// 小學橫向比較（本工具的主要目的）
console.log('── 小學難度橫向比較（情境「中等」）──');
const elem = nums.map(no => ({ no, v: results[no]['小學'] ? results[no]['小學'].mid : null }))
    .filter(x => x.v != null).sort((a, b) => b.v - a.v);
elem.forEach(x => {
    const r = results[x.no]['小學'];
    console.log(`  G${String(x.no).padStart(2)} ${(NAMES[x.no] || '').padEnd(6)} ${String(x.v).padStart(6)} ` +
        `（base ${r.parts.base} + 紅心 ${r.parts.heart} + 時間 ${r.parts.time} + 遊戲中 ${r.parts.inGame}）`);
});
const vals = elem.map(x => x.v);
console.log(`  → 最高 ${Math.max(...vals)}　最低 ${Math.min(...vals)}　中位數 ${vals[Math.floor(vals.length / 2)]}`);

// ── Markdown ─────────────────────────────────────────────────────────
if ((process.argv[2] || '') === 'md') {
    const out = [];
    out.push('# 花月 · 各遊戲得分推算表');
    out.push('');
    out.push('> 本檔由 `tools/estimate_game_scores.js md` 自動產生，請勿手動編輯。');
    out.push('> 產生時間：' + new Date().toISOString().slice(0, 10));
    out.push('');
    out.push('## 結算公式');
    out.push('');
    out.push('```');
    out.push('最終得分 = ( 遊戲中累計分 + base + 剩餘紅心 × heart + 剩餘秒數 × time ) × 難度倍率');
    out.push('難度倍率：小學 1、中學 2、高中 3、大學 4、研究所 5');
    out.push('```');
    out.push('');
    out.push('## 三個推算前提（請務必先讀）');
    out.push('');
    out.push('1. **一律假設完美通關**：紅心全滿、該拿的分都拿到。實際遊玩會低於此值，本表是**上限**不是期望值。');
    out.push('2. **「剩餘秒數」是最大變數**，同一款遊戲玩家快慢差幾倍，分數就差幾倍。因此下方給三種情境而非單一數字。');
    out.push('3. **「遊戲中累計分」的觸發次數是推估的**，每列都標了信心等級：');
    out.push('   - **高**：觸發次數可由設定值直接算出');
    out.push('   - **中**：觸發次數與題目長度相關，已用實際抽樣的詩句長度估算（每個難度抽 ' + SAMPLE_N + ' 組題目取平均）');
    out.push('   - **低**：觸發次數取決於玩家操作（連鎖、combo、路徑），僅取保守下限');
    out.push('');
    SCENARIOS.forEach(sc => {
        out.push(`## 情境「${sc.name}」—— ${sc.desc}`);
        out.push('');
        out.push(tableFor(sc.key));
        out.push('');
    });
    out.push('## 小學難度橫向比較（情境「中等」）');
    out.push('');
    out.push('這是本工具的主要用途：檢查各遊戲在小學難度的得分是否相近。');
    out.push('');
    out.push('| 遊戲 | 得分 | base | 紅心 | 時間 | 遊戲中 | 信心 |');
    out.push('|---|---:|---:|---:|---:|---:|:--:|');
    elem.forEach(x => {
        const r = results[x.no]['小學'];
        out.push(`| G${x.no} ${NAMES[x.no] || ''} | **${x.v}** | ${r.parts.base} | ${r.parts.heart} | ${r.parts.time} | ${r.parts.inGame} | ${r.conf} |`);
    });
    out.push('');
    out.push(`最高 **${Math.max(...vals)}**、最低 **${Math.min(...vals)}**、中位數 **${vals[Math.floor(vals.length / 2)]}**。`);
    out.push('');
    out.push('## 各遊戲的推算註記');
    out.push('');
    out.push('| 遊戲 | 說明 |');
    out.push('|---|---|');
    nums.forEach(no => {
        const anyRow = TIERS.map(t => results[no][t]).find(Boolean);
        if (anyRow) out.push(`| G${no} ${NAMES[no] || ''} | ${anyRow.note} |`);
    });
    out.push('');
    out.push('## 無法推算的遊戲');
    out.push('');
    out.push('以下遊戲的得分與玩家操作高度相關（連鎖、堆疊、猜中時機），只憑設定值推算不出有意義的數字，因此未列入表格：');
    out.push('');
    out.push('| 遊戲 | 原因 |');
    out.push('|---|---|');
    Object.keys(UNMODELED).map(Number).sort((a, b) => a - b).forEach(no => {
        out.push(`| G${no} | ${UNMODELED[no]} |`);
    });
    const target = path.join(rootDir, 'note', '各遊戲得分推算表.md');
    fs.writeFileSync(target, out.join('\n'), 'utf8');
    console.log('');
    console.log('已輸出：' + path.relative(rootDir, target));
}
