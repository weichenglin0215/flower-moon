/* ==========================================================================
   花月 · 青雲梯與文位升等 全流程自動驗證 (verify_learning_path.js)
   --------------------------------------------------------------------------
   對應文件：
     note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md
     note/青雲梯與獎勵企畫書/青雲梯遊戲接入規範與已知錯誤.md
     note/青雲梯與獎勵企畫書/文位升等已知錯誤紀錄.md

   ── 這支程式在驗什麼 ──────────────────────────────────────────────────
   ① 遊戲接入契約：GAME1~GAME40 是否都具備青雲梯會呼叫的變數與函式，
      而且**真的能被正確呼叫**（不是只有名字在）。
      起因：game16「打地詩」是 16 款課程遊戲中唯一沒有 startNextLevel() 的，
      青雲梯覆寫不到它，於是它一被派出就自己一路打下去 —— 同一款遊戲連玩
      四五局不換、而且每一關都解析到同一首詩。這種錯誤純看程式碼很難發現，
      必須有機器每次都掃一遍。
   ② 青雲梯設定表一致性：通道表／解鎖表／考試題庫／長題目表互相對得上。
   ③ 站點結構：詩詞分配無缺口、必通關卡自洽、應試站分佈正確。
   ④ 文位升等流程：用**真正的** learningPath.js 跑完整條青雲梯，
      在五種劇本下檢查十餘條不變式（晉升彈窗不得跳號、應試站絕不可
      直接發獎狀、獎勵不得漏發或重複發…）。
   ⑤ 考試與越級考試：冊封、獎勵冪等、沿途補發。

   ⚠️ 這支程式**不重寫任何規則**。所有邏輯都直接載入專案線上的模組來跑
      （見 tools/fm_env.js 的說明）。驗證程式自己抄一份規則，就等於把規格
      變成兩份，兩邊飄移之後「驗證通過」不再代表遊戲是對的。

   ── 執行方式 ────────────────────────────────────────────────────────
      node tools/verify_learning_path.js            # 全部
      node tools/verify_learning_path.js games      # 只驗遊戲接入契約
      node tools/verify_learning_path.js poems      # 只驗「每款遊戲在每一站真的出得了題」
      node tools/verify_learning_path.js path       # 只驗設定表與站點結構
      node tools/verify_learning_path.js flow       # 只驗升等流程（含完整生涯劇本）
      node tools/verify_learning_path.js exam       # 只驗考試與越級考試
      node tools/verify_learning_path.js abuse      # 只驗破壞性測試（玩家不照規則操作考試）
      node tools/verify_learning_path.js chaos      # 只驗亂序操作模擬（fuzz；FM_CHAOS_SEEDS／FM_CHAOS_STEPS 可調）
      node tools/verify_learning_path.js hygiene    # 只驗狀態潔淨度
      node tools/verify_learning_path.js money      # 只驗文錢收支（應試負擔）
      node tools/verify_learning_path.js keys       # 只驗關卡編號穩定性（題庫擴充不會毀進度）
      node tools/verify_learning_path.js report     # 跑一趟完整生涯並輸出玩家歷程 LOG

   ── 環境變數 ────────────────────────────────────────────────────────
      FM_EXAM_ATTEMPTS=N   每個文位考幾次才通過（預設 4，前 N-1 次刻意落榜）
      FM_REPORT_OUT=path   報表輸出路徑（預設 tools/out/青雲梯歷程LOG.txt）
      node tools/verify_learning_path.js -v         # 連通過的項目也列出

   ── 回傳值 ──────────────────────────────────────────────────────────
      0 = 全數通過（可能仍有 ⚠ 提醒）
      1 = 有 ❌ 必須修正的項目
   ========================================================================== */

'use strict';

const env = require('./fm_env.js');

const argv = process.argv.slice(2);
const VERBOSE = argv.indexOf('-v') >= 0 || argv.indexOf('--verbose') >= 0;
const only = argv.filter(a => a[0] !== '-')[0] || 'all';
const runGames = (only === 'all' || only === 'games');
const runPoems = (only === 'all' || only === 'poems');
const runPath = (only === 'all' || only === 'path');
const runFlow = (only === 'all' || only === 'flow');
const runExam = (only === 'all' || only === 'exam');
const runAbuse = (only === 'all' || only === 'abuse');
const runChaos = (only === 'all' || only === 'chaos');
const runHygiene = (only === 'all' || only === 'hygiene');
const runMoney = (only === 'all' || only === 'money');
const runReport = (only === 'report');
const runKeys = (only === 'all' || only === 'keys');

// ── 結果收集 ────────────────────────────────────────────────────────────
const results = { pass: 0, fail: [], warn: [] };

function ok(scope, msg) {
    results.pass++;
    if (VERBOSE) console.log('  ✓ [' + scope + '] ' + msg);
}
function fail(scope, msg, hint) {
    results.fail.push({ scope, msg, hint: hint || '' });
    console.log('  ❌ [' + scope + '] ' + msg + (hint ? '\n       → ' + hint : ''));
}
function warn(scope, msg, hint) {
    results.warn.push({ scope, msg, hint: hint || '' });
    console.log('  ⚠  [' + scope + '] ' + msg + (hint ? '\n       → ' + hint : ''));
}
function check(cond, scope, msg, hint) {
    if (cond) ok(scope, msg); else fail(scope, msg, hint);
    return !!cond;
}
function section(title) {
    console.log('\n' + '─'.repeat(74));
    console.log(title);
    console.log('─'.repeat(74));
}

// ══════════════════════════════════════════════════════════════════════
//  第 0 節　載入環境與模組
// ══════════════════════════════════════════════════════════════════════
console.log('花月 · 青雲梯與文位升等 全流程自動驗證');
console.log('（載入的是專案線上的模組本身，不是驗證程式自備的複製品）');

section('第 0 節　模組載入');
env.boot();
env.loadCore().forEach(r => {
    check(r.ok, '載入', r.file, r.ok ? '' : r.error);
});
const gameLoads = env.loadGames();
gameLoads.forEach(r => {
    if (!r.ok) fail('載入', r.file + ' 無法在 Node 環境載入', r.error);
});
if (!results.fail.length) ok('載入', '核心模組 12 個、遊戲 ' + gameLoads.length + ' 個全部載入成功');

const LP = global.LearningPath;
const PS = global.PathStations;
const LT = global.LevelTable;
const SM = global.ScoreManager;
const CS = global.FMCollectionSave;
const EC = global.FMExamConfig;

if (!LP || !PS || !LT || !SM) {
    console.log('\n核心模組缺失，無法繼續。');
    process.exit(1);
}

// ── 雲端攔截：整支程式只裝一次 ──────────────────────────────────────
// 把 supabaseClient 的「真的送出去」那一步換掉，payload 仍由線上程式組裝。
// 一次性安裝的好處是任何路徑（劇本、越級、單元測試、考試）都會被錄到，
// 而且不會再噴「Supabase SDK 未載入」的警告。
const CLOUD = env.captureCloud();

const CHANNELS = LP.GAME_CHANNELS;
const NAMES = LP.GAME_NAMES;
const REVIEW_ONLY = LP.REVIEW_ONLY_GAMES;
const UNLOCK = LP.GAME_UNLOCK;
// 課程遊戲 = 有通道、且沒被移出必通關卡的那幾款
const COURSE_GAMES = Object.keys(CHANNELS).map(Number)
    .filter(n => !REVIEW_ONLY[n]).sort((a, b) => a - b);
const TIERS = ['小學', '中學', '高中', '大學', '研究所'];

// 劇本 F 的每個文位要考幾次才通過（前 N-1 次刻意落榜）。
// 作者關心「每個文位都考三、四次才過會不會沒錢」，因此預設就跑 4 次。
// 可用 FM_EXAM_ATTEMPTS=1 之類的環境變數改，第 8 節則一律列出 1~4 次的收支。
const EXAM_ATTEMPTS = Math.max(1, parseInt(process.env.FM_EXAM_ATTEMPTS || '4', 10));

// ── 一局勝利的得分（作者提供的推算值）──────────────────────────────────
// 文錢由 scoreManager.saveScore 依「100 分 = 1 文錢」自行換算，
// 因此這裡只給分數，不給文錢 —— 換算規則必須是線上那一份，不可以另抄。
const SCORE_BY_TIER = { '小學': 200, '中學': 600, '高中': 1000, '大學': 2000, '研究所': 3000 };
const DURATION_BY_TIER = { '小學': 45, '中學': 60, '高中': 75, '大學': 90, '研究所': 120 };

// ── 開場快照：用來偵測「跑完之後有沒有把全域狀態弄髒」──────────────
// 青雲梯派局時會暫時覆寫好幾個全域函式（遊戲的 startNextLevel、
// DifficultySelector.show、window.alert…），考試沙箱又會再覆寫一輪
// ScoreManager.saveScore / completeLevel。任何一支沒還原，
// 玩家從漢堡選單進入的自由練習就會出現無法解釋的行為，
// 而且**不會有任何錯誤訊息**。第 7 節靠這份快照逐一比對。
const PRISTINE = {
    startNextLevel: {},
    dsShow: global.DifficultySelector && global.DifficultySelector.show,
    alert: global.alert,
    saveScore: SM.saveScore,
    completeLevel: SM.completeLevel
};
gameLoads.forEach(function (g) {
    const G = global['Game' + g.no];
    if (G && typeof G.startNextLevel === 'function') PRISTINE.startNextLevel[g.no] = G.startNextLevel;
});

/**
 * 自動找出一款遊戲裡「真正負責選詩」的那一支函式。
 *
 * ⚠️ 刻意不維護一張「gameXX → 選詩函式名」的對照表：那張表就是第二份規格，
 *    新增遊戲時一定會忘了加。改成掃描物件上每一支函式的原始碼，
 *    誰的內文出現 getSharedRandomPoem( 誰就是。
 *    （實測 16 款課程遊戲各自只有一支命中，名字五花八門：
 *      prepareChallenge / selectRandomPoem / selectPoem / selectAndPreparePoem…）
 */
function findPoemFn(G) {
    for (const k in G) {
        try {
            if (typeof G[k] === 'function' && G[k].toString().indexOf('getSharedRandomPoem') >= 0) return k;
        } catch (e) { /* getter 之類的存取失敗就跳過 */ }
    }
    return null;
}

// ══════════════════════════════════════════════════════════════════════
//  第 1 節　遊戲接入契約（GAME1 ~ GAME40）
// ══════════════════════════════════════════════════════════════════════

/**
 * 剝掉註解後再比對 —— 原始碼指紋檢查一律先過這一關。
 *
 * ⚠️ 為什麼一定要：修 bug 時留下的說明註解裡，往往一字不差地寫著
 *    正要禁止的那串字（例如「絕不可在這裡自行 currentLevelIndex++」）。
 *    不剝註解就會把自己的說明當成罪證，測試永遠紅著 —— 實測踩過兩次
 *    （2026-09-11 的 10.13，以及同日的 1.6）。
 */
function stripComments(txt) {
    return String(txt || '')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** 取出原始碼中某個具名函式的整段本體（大括號配對，不用正規表示式硬猜） */
function fnBody(src, name) {
    const key = name + ': function';
    const at = src.indexOf(key);
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
    }
    return null;
}

/**
 * 抓出 `DifficultySelector.show(遊戲名, 回呼)` 那個回呼的函式主體。
 *
 * ⚠️ 青雲梯（learningPath.launchGame）與考試（examEngine._installSandbox）
 *    都是靠「暫時把 DifficultySelector.show 換成立刻回呼指定難度與關卡」
 *    來派局的，所以這個回呼就是**被編排時的實際開局路徑**。
 */
function dsCallbackBody(src) {
    const at = src.indexOf('DifficultySelector.show(');
    if (at < 0) return null;
    const arrow = src.indexOf('=>', at);
    const open = src.indexOf('{', arrow);
    if (arrow < 0 || open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
    }
    return null;
}

/** 取出 `const onConfirm = ` 之後那一整個箭頭函式本體 */
function onConfirmBody(src) {
    const at = src.indexOf('const onConfirm');
    if (at < 0) return null;
    const open = src.indexOf('{', at);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
    }
    return null;
}

/** 找出某段字串在原始碼中出現的所有位置 */
function allIndexOf(src, needle) {
    const out = [];
    let i = src.indexOf(needle);
    while (i >= 0) { out.push(i); i = src.indexOf(needle, i + 1); }
    return out;
}

function verifyGames() {
    section('第 1 節　遊戲接入契約（青雲梯會呼叫的變數與函式）');

    const indexHtml = env.readSource('index.html') || '';
    const menuSrc = env.readSource('menu.js') || '';
    const achSrc = env.readSource('achievement.js') || '';
    const smSrc = env.readSource('scoreManager.js') || '';
    const dbViewer = env.readSource('tools/db_viewer.html') || '';

    // ── 三個等級的要求 ─────────────────────────────────────────────────
    //   課程（★）：列入必通關卡，青雲梯會派它出場 → 契約全部必須成立（❌）
    //   複習     ：REVIEW_ONLY_GAMES，只出現在複習池與自由練習 → 只要共同項
    //   自由     ：完全不屬於青雲梯 → 共同項為 ❌，關卡模式相關只給 ⚠
    //              （⚠ 的意思是「現在沒事，但要把它納入青雲梯之前必須先補齊」）
    function tierOf(n) {
        if (COURSE_GAMES.indexOf(n) >= 0) return '課程';
        if (REVIEW_ONLY[n]) return '複習';
        return '自由';
    }
    const summary = { '課程': 0, '複習': 0, '自由': 0 };
    let notReady = 0;

    gameLoads.forEach(info => {
        const n = info.no;
        const key = 'game' + n;
        const G = global['Game' + n];
        const src = env.readSource(key + '.js') || '';
        const lv = tierOf(n);
        summary[lv]++;
        const tag = 'G' + n + (lv === '課程' ? '★' : '');

        // 課程遊戲不合格＝真的壞了；其他等級只提醒
        const must = (cond, msg, hint) => {
            if (cond) { ok(tag, msg); return true; }
            if (lv === '課程') fail(tag, msg, hint);
            else { warn(tag, msg + '　←（' + lv + '類，尚未納入青雲梯，暫不影響）', hint); notReady++; }
            return false;
        };
        // 不分等級都必須成立的共同項（漏了會讓選單／全域清理出事）
        const always = (cond, msg, hint) => { check(cond, tag, msg, hint); return !!cond; };

        // ── 1.1 全域掛載與基本入口（所有遊戲都必須有）──────────────────
        if (!always(G && typeof G === 'object', 'window.Game' + n + ' 已掛載至全域',
            '模組結尾要有 window.Game' + n + ' = Game' + n + '；否則 menu.js 與 learningPath.js 都叫不動它')) {
            return;
        }
        always(typeof G.show === 'function', 'show() 存在',
            'menu.js 與 learningPath.launchGame 都靠它開局');
        always(typeof G.stopGame === 'function', 'stopGame() 存在',
            'menu.js 的全域清理只呼叫這一支；青雲梯換遊戲時也靠它關掉上一款');

        // stopGame 必須自己隱藏 overlay（見「花月開發常見錯誤與解法」§4.1）。
        // ⚠️ 2026-09 起有兩種合格寫法：自己 classList.add('hidden')，
        //    或委派給共用的 FMGame.stop(this)（gameContract.js 內部一定會做
        //    這件事，且同時會取消結算動畫／收掉 RuleNoteDialog／GameMessage——
        //    見它自己的說明）。逐批遷移到 FMGame.stop 的遊戲不該被這裡擋下。
        const sg = fnBody(src, 'stopGame');
        if (sg) {
            always(/classList\.add\(\s*'hidden'\s*\)/.test(sg) || /FMGame\.stop\(\s*this\s*\)/.test(sg),
                "stopGame() 內有 classList.add('hidden') 或委派 FMGame.stop(this)",
                'menu.js 的全域清理只呼叫 stopGame()、不呼叫 hide()；'
                + '不自己隱藏（或沒有委派給會隱藏的共用函式）的話，'
                + '切換頁面後 overlay 會留在畫面上');
        }

        // ── 1.1b 開新局與重來都必須取消「還在飛」的結算動畫 ─────────────
        //
        // ⚠️⚠️ 這是催生「統一遊戲生命週期契約」那整個專案的原始 bug。
        //    ScoreManager.playWinAnimation 的飛星各自跑完整趟 requestAnimationFrame
        //    軌跡，不受任何 interval 追蹤，光是把遊戲藏起來擋不住它。
        //    玩家在結算動畫還沒播完時按「重來」或「開新局」，舊的那批星星
        //    會在幾秒後降落、觸發 completeLevel 並彈出「下一關」訊息框 ——
        //    那時玩家早已在新的一局（甚至已經回到青雲梯）了，畫面就憑空
        //    跳出一個對不上的彈窗。玩家原始回報：「青雲梯考試通過、領完獎狀
        //    之後回到青雲梯，卻跳出『下一關』與『步步為陣』的空彈窗」。
        //
        //    2026-09 遷移前有 17 款只在 startNewGame() 取消、retryGame() 漏掉，
        //    **其中包含官方文件指定「新遊戲抄這款」的範本 game8** ——
        //    範本帶病，這個洞就會一直被複製到新遊戲裡。
        //    這一項是那 17 款的回歸防線：手工修好但沒有機器把關，等於沒修。
        //
        //    兩種寫法都算合格：函式體內直接呼叫 cancelAnimation()，
        //    或（間接幾層都可以）呼叫一個會做這件事的自家輔助函式。
        //    實際存在的間接鏈：game9 的 startGameProcess、game12 的 stopAllTimers、
        //    game36 的 retryGame → startNewGame、
        //    game11 的 retryGame → resetGameRound → stopAllTimers（兩層）。
        //    ⚠️ 所以這裡必須是真正的遞迴走訪，不能只追一層 ——
        //    追一層會把 game11 誤判成不合格（實測過）。
        const srcNoCmt = stripComments(src);
        const reachesCancel = (fnName, seen) => {
            const visited = seen || Object.create(null);
            if (visited[fnName]) return false;   // 防止 A→B→A 互呼造成無限遞迴
            visited[fnName] = true;
            const body = fnBody(srcNoCmt, fnName);
            if (!body) return false;
            if (/cancelAnimation\s*\(/.test(body)) return true;
            const calls = body.match(/this\.([A-Za-z_$][\w$]*)\s*\(/g) || [];
            return calls.some(c => reachesCancel(c.slice(5).replace(/\s*\($/, ''), visited));
        };
        ['startNewGame', 'retryGame'].forEach(fnName => {
            // 函式根本不存在的情況由 REQUIRED_METHODS 那一項負責報，這裡不重複
            if (!fnBody(srcNoCmt, fnName)) return;
            always(reachesCancel(fnName),
                fnName + '() 會取消還在飛的結算動畫（ScoreManager.cancelAnimation）',
                '上一局的飛星會在幾秒後降落，憑空觸發 completeLevel 與「下一關」彈窗，'
                + '而且完全不會有錯誤訊息。請在 ' + fnName + '() 開頭加上 '
                + 'if (window.ScoreManager) window.ScoreManager.cancelAnimation();'
                + '（或呼叫一個會做這件事的自家輔助函式）');
        });

        // ── 1.1c 難度選擇回呼必須「同步」把題目選好 ─────────────────────
        //
        // ⚠️⚠️ 2026-09-17 實測抓到的活體 bug：考試的 examEngine._tryCombo 在
        //    `GameObj.show()` 一回來就**同步**讀 `this.currentPoem.id`，用來
        //    正面確認「這一局有沒有出到考試指定的那首詩」（那道正面確認本身
        //    是必要的：13／14／37 取不到詩時是安靜地 return，不會 alert）。
        //
        //    若遊戲把開局丟進 setTimeout，那一刻 currentPoem 還是上一局的
        //    （或 null），比對必然不相等，於是**這一款永遠會被判定「出不了
        //    指定的詩」而被換掉 —— 它從此不會出現在任何考試裡，而且完全
        //    沒有錯誤訊息**。game9「詩韻鎖扣」就是這樣靜靜缺席的
        //    （已於 2026-09-17 改為同步開局）。
        //
        //    ⚠️ 混沌模擬那一節（第 11 節）驗不到這件事：它把每一款的 show()
        //    都換成「同步設好 currentPoem」的替身，真實的非同步行為被替身
        //    蓋掉了。所以這一項只能靠原始碼指紋擋。
        //
        //    延後「量版面」的動作沒問題（例如等 offsetWidth 不為 0），
        //    但**選詩／開局**必須同步完成。game7 的 setTimeout 屬於前者，
        //    且它不在青雲梯內，因此只是提醒。
        const dsCb = dsCallbackBody(srcNoCmt);
        if (dsCb) {
            must(!/setTimeout/.test(dsCb),
                '難度選擇回呼內同步開局（沒有把選題延後到 setTimeout）',
                '考試在 show() 回來的那一刻就讀 currentPoem.id 做正面確認，'
                + '延後選題會讓這一款永遠被判定「出不了指定的詩」而從所有考試中缺席，'
                + '且不會有任何錯誤訊息。請把 startNewGame() 直接同步呼叫，'
                + '只把需要量測版面的動作留在 setTimeout 裡');
        }

        // ── 1.1d 選到的詩必須放在 `this.currentPoem` 這個名字上 ──────────
        //
        // ⚠️ 考試唯一的「正面確認出題成功」手段就是讀 `GameObj.currentPoem.id`
        //    （examEngine._tryCombo）。欄位換個名字，考試就再也確認不了，
        //    這一款會被永遠判定出不了題。目前實際存在的不一致命名：
        //    game5 用 `targetPoem`、game36 用 `targetLine`／`targetPoem`
        //    （兩款都不在考試池 EXAM_GAMES 內，所以只是提醒）。
        //
        //    ⚠️ 這裡刻意驗「有沒有寫 this.currentPoem =」而不是驗執行後的值：
        //    Node 環境跑不動大部分遊戲的完整 show()（canvas／量版面），
        //    第 11 節混沌模擬也是拿替身 show() 取代真品。
        must(/this\.currentPoem\s*=/.test(srcNoCmt),
            '選到的詩存放在 this.currentPoem（考試正面確認出題用）',
            'examEngine._tryCombo 靠 GameObj.currentPoem.id 確認「有沒有出到指定的那首詩」；'
            + '用別的欄位名（例如 targetPoem）的話，這一款會被永遠判定出不了題、'
            + '從所有考試中靜默缺席');

        // ── 1.2 跨檔註冊（漏一項就是靜默性 bug）────────────────────────
        always(indexHtml.indexOf('src="' + key + '.js"') >= 0,
            'index.html 已加入 <script src="' + key + '.js">', '沒載入就整個叫不到');
        always(new RegExp("'Game" + n + "'").test(menuSrc),
            "menu.js closeAllActiveOverlays 陣列含 'Game" + n + "'",
            '漏掉的話切到其他頁面時這款遊戲的 overlay 不會被清掉');
        always(new RegExp("case '" + key + "'").test(menuSrc),
            "menu.js 導航 switch 有 case '" + key + "'", '選單點下去不會有反應');
        always(new RegExp("'" + key + "'\\s*:").test(achSrc),
            "achievement.js gameNames 有 '" + key + "'", '成就頁會顯示 game' + n + ' 而不是中文名');
        always(new RegExp("'" + key + "'\\s*:\\s*\\{").test(smSrc),
            "scoreManager.js gameSettings 有 '" + key + "'",
            'playWinAnimation 會退回預設分數，且 getPointA 讀取會拋出 undefined 錯誤');
        always(new RegExp('(^|[^0-9])' + n + ":\\s*'").test(dbViewer),
            'tools/db_viewer.html GAME_NAMES 有第 ' + n + ' 款', '資料檢視器會顯示編號而非名稱');

        // ── 1.3 共同契約：39 款一律相同，沒有例外 ───────────────────────
        //
        // ⚠️⚠️ 2026-09-11 由 `must`（課程遊戲才 ❌，其餘只 ⚠）改為 `always`（一律 ❌）。
        //    作者指示：「即使是目前尚未納入學習或考試的遊戲也要先統一規範，
        //    避免後續增加遊戲時造成困擾」。
        //    理由是真實災情：青雲梯與考試是以「每一款遊戲都長一樣」為前提
        //    在接管遊戲的（暫時覆寫 startNextLevel／DifficultySelector.show）。
        //    只要有一款自成一格，接管就會在那一款身上靜靜破掉 ——
        //    game13 那行 MenuManager.closeAll()、game7 把開新局叫成 newGame()、
        //    game15／17／19 沒有 startNextLevel，都是同一個病。
        //    等到「要納入課程時再補」已經太晚：那時它早就被自由練習用了幾個月。
        //
        //    契約的權威來源是 gameContract.js 的 FMGame.REQUIRED_METHODS／
        //    REQUIRED_FIELDS，不是這裡的字面列表 —— 這裡直接拿它來驗。
        const CONTRACT = global.FMGame;
        always(!!CONTRACT, 'gameContract.js 已載入（FMGame 契約來源）',
            '沒有它就沒有共同契約可驗，而且 39 款遊戲的 startNextLevel／onConfirm 都會炸');
        (CONTRACT ? CONTRACT.REQUIRED_METHODS : []).forEach(fn => {
            always(typeof G[fn] === 'function', fn + '() 存在（共同契約）',
                '39 款遊戲必須具備同名同義的 ' + fn + '()；'
                + '少一支，青雲梯／考試就得為這一款特判，而特判正是 bug 的來源');
        });

        // gameOver 的簽章也要一致 —— 名字對了但參數順序不同，一樣是例外
        const goSig = (stripComments(src).match(/gameOver\s*:\s*function\s*\(([^)]*)\)/) || [])[1];
        if (goSig !== undefined) {
            always(goSig.replace(/\s+/g, '') === 'win,reason',
                'gameOver(win, reason) 的參數名與其餘 38 款一致',
                '實際是 gameOver(' + goSig + ')。規範 §7.3 明定結算入口為 gameOver(win, reason)；'
                + '參數不同代表這一款的結算語意得另外讀一次程式碼才知道');
        }

        // ★★ 最關鍵：青雲梯靠「暫時覆寫 startNextLevel」收回關卡推進的控制權
        const hasSNL = typeof G.startNextLevel === 'function';
        must(hasSNL, 'startNextLevel() 存在（青雲梯覆寫用）',
            '這是 2026-09 game16 那個 bug 的成因：沒有這一支，青雲梯攔不到過關事件，'
            + '該遊戲會自己一路打下去（同款遊戲連玩、每一關都是同一首詩）。'
            + '請新增 startNextLevel: function () { this.currentLevelIndex++; this.startNewGame(); }');

        // ── 1.4 執行層級：startNextLevel 真的做對事情了嗎 ────────────────
        if (hasSNL) {
            // 這些遊戲的 startNextLevel 常順手更新畫面標籤，Node 裡 getElementById
            // 回 null 會炸掉 —— 暫時給它一個假元素，才驗得到真正的邏輯。
            const realGet = global.document.getElementById;
            global.document.getElementById = () => env.makeEl();
            const origNew = G.startNewGame, origProc = G.startGameProcess;
            const origIdx = G.currentLevelIndex, origMode = G.isLevelMode, origDiff = G.difficulty;
            let called = 0;
            try {
                G.startNewGame = function () { called++; };
                if (origProc) G.startGameProcess = function () { called++; };
                G.isLevelMode = true;
                G.difficulty = G.difficulty || '小學';
                G.currentLevelIndex = 5;
                G.startNextLevel();
                must(G.currentLevelIndex === 6, 'startNextLevel() 會把 currentLevelIndex 加一',
                    '實際結果 ' + G.currentLevelIndex + '（預期 6）；沒加一的話青雲梯會一直派同一關');
                must(called > 0, 'startNextLevel() 會接著開下一局',
                    '沒呼叫 startNewGame()／startGameProcess()，過關後畫面會停住');
            } catch (e) {
                must(false, 'startNextLevel() 可以正常執行', '丟出例外：' + e.message);
            } finally {
                global.document.getElementById = realGet;
                G.startNewGame = origNew;
                if (origProc) G.startGameProcess = origProc;
                G.currentLevelIndex = origIdx; G.isLevelMode = origMode; G.difficulty = origDiff;
            }

            // 青雲梯是「暫時覆寫再還原」，因此這個屬性必須可寫
            let writable = false;
            try {
                const keep = G.startNextLevel;
                G.startNextLevel = function () { };
                writable = (G.startNextLevel !== keep);
                G.startNextLevel = keep;
            } catch (e) { writable = false; }
            must(writable, 'startNextLevel 可被覆寫（青雲梯攔截的前提）',
                '不可寫的話 learningPath.launchGame 的覆寫會靜靜失效，而且不會有任何錯誤訊息');
        }

        // ── 1.5 關卡模式旗標與難度設定 ──────────────────────────────────
        //
        // ⚠️ 同 1.3，2026-09-11 起這三個欄位對 39 款一律 ❌。
        //    「只在回呼裡才第一次賦值」不算數：物件上看不到欄位，
        //    任何在賦值之前就讀取的路徑都會拿到 undefined，而且不會報錯
        //    （game15 原本就是這樣）。
        (CONTRACT ? CONTRACT.REQUIRED_FIELDS : []).forEach(f => {
            if (f === 'difficultySettings') return;    // 下面另外驗五個難度層
            always((f in G), '具備 ' + f + ' 欄位（共同契約）',
                f === 'isLevelMode'
                    ? '青雲梯一律以關卡模式開局；沒有這個旗標，選詩會退回隨機'
                    : '關卡編號同時是 getSharedRandomPoem 的種子，缺了就查不到關卡表');
        });

        const ds = G.difficultySettings;
        if (must(ds && typeof ds === 'object', 'difficultySettings 存在',
            '青雲梯把站點的難度層直接當難度傳進去，缺這張表就開不了局')) {
            const missing = TIERS.filter(t => !ds[t]);
            must(missing.length === 0, 'difficultySettings 五個難度層齊全',
                '缺少：' + missing.join('、') + '；青雲梯的站點會跨到這些層');
            TIERS.forEach(t => {
                const st = ds[t];
                if (!st) return;
                if (typeof st.minChars === 'number' && typeof st.maxChars === 'number'
                    && st.minChars > st.maxChars) {
                    fail(tag, t + ' 的 minChars(' + st.minChars + ') > maxChars(' + st.maxChars + ')',
                        '這種組合數學上無解，該難度層一進去就會「載入詩詞失敗」');
                }
            });
        }

        // ── 1.6 原始碼層級：物件上看不出來的行為 ─────────────────────────
        // (a) 難度選擇器回呼必須收兩個參數，否則 isLevelMode 永遠是 false
        must(/DifficultySelector\.show\(\s*['"][^'"]*['"]\s*,\s*(?:function\s*)?\(\s*\w+\s*,\s*\w+\s*\)/.test(src),
            'DifficultySelector.show 的回呼收 (難度, 關卡) 兩個參數',
            '青雲梯是靠暫時替換 DifficultySelector.show、把指定的難度層與關卡回呼回去來開局的；'
            + '回呼只收一個參數的話關卡編號會遺失，isLevelMode 永遠是 false');
        must(src.indexOf('levelIndex !== undefined') >= 0,
            '以 (levelIndex !== undefined) 判定關卡模式', '這是全專案一致的寫法');

        // ⚠️ 以下的原始碼指紋一律比對「剝掉註解後」的版本。
        //    修 bug 時留下的說明註解裡就寫著正要禁止的那串字，
        //    不剝就會把自己的說明當成罪證（見 stripComments 的說明）。
        const srcNC = stripComments(src);

        // (b) ★ game16 那個 bug 的精準指紋（2026-09-11 升級版）：
        //     關卡推進一律委由 gameContract.js 的 FMGame.nextLevel()，
        //     **遊戲檔內不得再出現任何 currentLevelIndex++**。
        //
        //     舊版規則是「currentLevelIndex++ 只能寫在 startNextLevel 裡」。
        //     那條規則擋得住 game16，卻擋不住 game15／17／19 —— 它們根本
        //     沒有 startNextLevel，`if (incs.length)` 底下的比對就整段跳過，
        //     三款把 currentLevelIndex++ 寫死在 onConfirm 裡的遊戲因此一路
        //     通過驗證。收口成一支共用函式之後，規則變成「一處都不准有」，
        //     沒有「剛好沒有那支函式所以不用驗」的漏洞。
        always(allIndexOf(srcNC, 'currentLevelIndex++').length === 0
            && allIndexOf(srcNC, 'currentLevelIndex +=').length === 0,
            '沒有自行遞增 currentLevelIndex（一律委由 FMGame.nextLevel）',
            '關卡推進的唯一實作在 gameContract.js。自己 ++ 就代表繞過了'
            + '青雲梯的攔截點 —— game16 就是這樣連玩四局同一款、每關都是同一首詩的。');

        if (hasSNL) {
            const snlNC = stripComments(fnBody(src, 'startNextLevel') || '');
            always(/window\.FMGame\.nextLevel\(\s*this\s*\)/.test(snlNC),
                'startNextLevel() 委由 FMGame.nextLevel(this)',
                '39 款必須用同一份實作；各寫各的就會像 game5／7／16 那樣'
                + '長出三種不同的變體，日後改行為得逐檔找齊');
        }

        // ★ startNextLevel 是青雲梯／考試用來攔截「玩家過關了」的那一支。
        //   遊戲自己呼叫它，等於在非過關的情境下通報「這一關過了」。
        //
        //   2026-09-11 由 39 款全掃找出唯一一個違規者：`game2`「飛花令」
        //   在「關卡模式選不到詩」時寫著 `this.startNextLevel(); // 遞增跳過`。
        //   game2 目前不在 GAME_CHANNELS 所以還沒出事，但只要哪天納入課程，
        //   選不到詩就會變成「玩家一題沒玩、局數 +1、站點往前推進」，
        //   而且完全不會報錯。正確作法是發出「載入詩詞失敗」，
        //   交給 launchGame 既有的安全網自動改派另一款遊戲。
        //
        //   唯一合法的呼叫點是結算彈窗，而結算彈窗已經收口到
        //   FMGame.advance ——所以遊戲檔內應該一處 this.startNextLevel() 都沒有。
        always(allIndexOf(srcNC, 'this.startNextLevel()').length === 0,
            '沒有自行呼叫 this.startNextLevel()（只有 FMGame.advance 可以）',
            'startNextLevel 是青雲梯／考試攔截「過關」的掛鉤點。'
            + '在非過關的情境呼叫它（例如選詩失敗時「遞增跳過」），'
            + '等於通報玩家過關了：局數 +1、站點往前推進，而且不會報錯。'
            + '出不了題請改成 alert(\'載入詩詞失敗，請重試。\') + stopGame()，'
            + '讓 learningPath.launchGame 的安全網自動改派其他遊戲。');

        const ocb = onConfirmBody(src);
        if (ocb) {
            always(/window\.FMGame\.advance\(\s*this\s*,\s*(win|true)\s*\)/.test(stripComments(ocb)),
                '過關結算（onConfirm）委由 FMGame.advance(this, win)',
                '結算按鈕的分支判斷 39 款共用同一份（gameContract.js）。'
                + '自己寫一份的風險在 game15／17／19 身上實際發生過：'
                + '三款都在這裡直接 currentLevelIndex++，青雲梯攔不到。');
        }

        // (c) 選詩必須把關卡編號當種子傳進去，否則跨遊戲共用關卡表整組失效。
        //     兩種合格寫法：三元運算式，或 if (isLevelMode) 分支內帶入 currentLevelIndex
        //     （game40 是後者）。刻意排除「賦值」的場合（showDifficultySelector 裡的
        //     this.isLevelMode = …），否則每一款都會誤判成通過。
        const seedOk = /isLevelMode\s*\?\s*this\.currentLevelIndex/.test(src)
            || /isLevelMode\b(?!\s*=[^=])[\s\S]{0,120}?this\.currentLevelIndex\b(?!\s*=[^=])/.test(src);
        const usesShared = src.indexOf('getSharedRandomPoem') >= 0;
        must(seedOk && usesShared,
            'getSharedRandomPoem 以「關卡模式才給種子」的方式取詩',
            usesShared
                ? ('有呼叫 getSharedRandomPoem 但沒把關卡編號當種子傳進去，'
                    + 'LevelTable 查表不會啟動，青雲梯指定的那首詩根本不會出現；'
                    + '合格寫法：this.isLevelMode ? this.currentLevelIndex : null')
                : ('這款遊戲完全沒有使用 getSharedRandomPoem（自行實作選詩），'
                    + '因此無法保證「同一關＝同一首詩」，不能列入必通關卡。'
                    + '這正是 21／23／36 被放進 REVIEW_ONLY_GAMES 的原因'));

        // (d) 通關紀錄：不記錄就永遠推不動青雲梯的進度
        //     2026-09-11 起一律走 FMGame.completeLevel（gameContract.js），
        //     並且對 39 款都是 ❌ —— game7 原本整款漏記，關卡模式贏了也不算，
        //     將來要納入課程時會整款白打，而且不會有任何錯誤訊息。
        // ⚠️ 2026-09 起多一種合格寫法：整段結算委派給 FMGame.gameOver(this,
        //    win, reason, {gameKey, ...})，它內部一定會呼叫 FMGame.completeLevel
        //    ——見 gameContract.js 的說明。gameKey 正確性的驗法也要跟著多一種。
        const usesGameOverShared = /window\.FMGame\.gameOver\(/.test(srcNC);
        always(/window\.FMGame\.completeLevel\(/.test(srcNC) || usesGameOverShared,
            '過關時呼叫 FMGame.completeLevel()（共同契約，可直接呼叫或委派 FMGame.gameOver）',
            '青雲梯的站點進度完全由 levelCleared 推導，沒記錄等於這一局白打');
        const cl = srcNC.match(/completeLevel\(\s*'([^']+)'\s*,/);
        if (cl) {
            always(cl[1] === key, "completeLevel 的 gameKey 是 '" + key + "'",
                '實際傳的是 ' + cl[1] + '，通關紀錄會記到別款遊戲頭上');
        } else if (usesGameOverShared) {
            const go = fnBody(srcNC, 'gameOver');
            const gk = go && go.match(/gameKey\s*:\s*'([^']+)'/);
            always(!!gk && gk[1] === key, "FMGame.gameOver() 傳入的 gameKey 是 '" + key + "'",
                gk ? ('實際傳的是 ' + gk[1] + '，通關紀錄會記到別款遊戲頭上')
                    : '委派給 FMGame.gameOver() 卻沒有在 opts 帶 gameKey，completeLevel 會用 undefined 當鍵值');
        }

        // ── 1.6-(e) 禁用指紋：遊戲不得自行發動全站層級的動作 ────────────
        //
        // 2026-09-11 玩家回報：「考試中途某一題突然跳出難度選單，考試就沒了、
        // 報名費白花」。根因是 game13「人事時地」的開局流程裡有一行
        // `MenuManager.closeAll()` —— 39 款裡唯一這樣寫的。
        // 全域清理會呼叫 `ExamEngine.forceStop()`，考試抽到它出題時，
        // 等於在開局那一刻把自己這場考試殺掉。
        //
        // ⚠️⚠️ 當初的補丁只驗**八款考試遊戲**的**開局函式**（見第 10.13 節）。
        //    那是兩重不夠：
        //      ① 另外 31 款雖然不會被考試派出，**卻會被課程局派出** ——
        //         同一行寫在它們身上，毀掉的是課程局與離場守門。
        //      ② 同一行寫在開局以外的地方（例如結算、暫停、返回鈕）一樣會炸。
        //    作者指示「其餘 32 款的開局流程沒驗，必須驗」，因此這裡改為
        //    **39 款 × 整個檔案**全驗，禁用清單以 gameContract.js 為唯一來源。
        //
        // 要離開遊戲一律改呼叫 FMGame.exit()：它會先問「現在有沒有課程／考試
        // 在進行」，有的話交給青雲梯跳確認彈窗，講清楚會損失什麼才離開。
        (CONTRACT ? CONTRACT.FORBIDDEN_IN_GAMES : []).forEach(rule => {
            always(!rule.re.test(srcNC), '沒有自行呼叫 ' + rule.why,
                '這是全站層級的動作，青雲梯與考試完全無從得知：'
                + '進行中的考試會被 ExamEngine.forceStop() 靜默殺掉（報名費白花）、'
                + '課程局不會被記成失敗、離場守門也不會解鎖。'
                + '要離開請改呼叫 FMGame.exit()（gameContract.js）。'
                + '　← 2026-09-11 game13 實測災情');
        });

        // ── 1.6-(f) overlay 的 position 最終必須是 fixed ──────────────────
        //
        // 2026-09-14 玩家回報：手機上往左／左上一滑，整個介面偏移並露出紅色底色。
        // 根因是 game3／game7／game14 的 `.gameX-overlay` 規則裡 position 寫了兩次
        // （先 fixed、後 relative），後者勝出，未縮放的 500×850 排版盒被撐進 body，
        // 寬度不到 500px 的手機上 body 因此可以被拖動 125×38px。
        // 瀏覽器排版在 Node 裡驗不到，所以用原始碼驗「同一規則裡最後一個 position」。
        {
            const css = stripComments(env.readSource(key + '.css') || '');
            const re = new RegExp('\\.' + key + '-overlay\\s*\\{([^}]*)\\}', 'g');
            let m, finals = [];
            while ((m = re.exec(css))) {
                const ps = m[1].match(/(?:^|[;\s])position\s*:\s*([\w-]+)/g) || [];
                if (ps.length) finals.push(ps[ps.length - 1].replace(/.*:\s*/, ''));
            }
            if (finals.length) {
                always(finals.every(p => p === 'fixed'),
                    '.' + key + '-overlay 的 position 最終是 fixed',
                    '實際為 ' + finals.join('、') + '。overlay 不是 fixed 就會把未縮放的 500×850 '
                    + '撐進 body，手機上往左／左上滑會整個偏移並露出紅色底色（2026-09-14 實測）。'
                    + '請檢查同一規則裡是否寫了第二個 position。');
            }
        }

        // ── 1.7 課程遊戲專屬 ────────────────────────────────────────────
        if (lv === '課程') {
            check(!!NAMES[n], tag, '在 learningPath.GAME_NAMES 有顯示名稱',
                'launchGame 靠 Object.keys(GAME_NAMES) 逐一關掉還開著的其他青雲梯遊戲；'
                + '漏列的那一款 overlay 永遠不會被關掉，玩家會同時看到兩層遊戲畫面'
                + '（2026-09 game16 實測）');
            check(UNLOCK.filter(seg => seg.add.indexOf(n) >= 0).length > 0, tag,
                '在 GAME_UNLOCK 有解鎖文位',
                '有通道卻沒有任何文位解鎖它 —— 這款遊戲永遠不會被派出來');
        }
    });

    console.log('\n  分類：課程遊戲 ' + summary['課程'] + ' 款（★，契約必須全數成立）／'
        + '複習池 ' + summary['複習'] + ' 款／青雲梯外 ' + summary['自由'] + ' 款');
    if (notReady) {
        console.log('  另有 ' + notReady + ' 項 ⚠：那些遊戲目前不在青雲梯裡所以不影響，'
            + '但要納入課程之前必須先補齊。');
    }

    // 反向檢查：設定表裡列到、但檔案根本不存在的遊戲
    Object.keys(CHANNELS).map(Number).forEach(n => {
        if (!env.exists('game' + n + '.js')) {
            fail('設定表', 'GAME_CHANNELS 列有 game' + n + '，但 game' + n + '.js 不存在');
        }
    });
    Object.keys(NAMES).map(Number).forEach(n => {
        if (!env.exists('game' + n + '.js')) {
            fail('設定表', 'GAME_NAMES 列有 game' + n + '，但 game' + n + '.js 不存在');
        }
    });
}

// ══════════════════════════════════════════════════════════════════════
//  第 2 節　遊戲真實出題驗證
//  —— 驅動每一款課程遊戲**真正的選詩函式**，不是猜它的參數
// ══════════════════════════════════════════════════════════════════════

/**
 * 對「每一站 × 該站可用的每一款課程遊戲 × 該站的每一個必通關卡」
 * 呼叫該遊戲真正的選詩函式，檢查三件事：
 *
 *   ① 出得了題（拿得到詩）
 *   ② 出的是**這一站安排的詩**（不會洩題到站外，
 *      這是「書僮站玩到將進酒」那一類錯誤的守門員）
 *   ③ 決定性：同一關、同一款遊戲，重複呼叫必須永遠拿到同一首詩的同一段
 *      （跨遊戲共用關卡表的立身之本；不成立的話玩家每次進同一關都在背不同的句子）
 *
 * ⚠️ 為什麼要真的呼叫遊戲的函式，而不是自己組一份參數去查表：
 *    參數（minLines/maxLines/minChars/maxChars/poemMinRating）散落在各遊戲的
 *    difficultySettings 與 getSharedRandomPoem 呼叫端，兩者還常常不一致
 *    （game40 就是把字數在呼叫端另外算出來的）。驗證程式自己抄一份參數，
 *    抄錯了會驗出一個「假的通過」。直接呼叫遊戲本人最準。
 *
 * ⚠️ 遊戲的選詩函式選完詩之後通常會接著畫版面，在 Node 裡會丟例外 ——
 *    那是預期的，只要**選詩那一段已經跑完**就夠了，因此例外一律吞掉，
 *    改看攔截器有沒有收到結果。
 */
function verifyPoemDispatch() {
    section('第 2 節　遊戲真實出題驗證（驅動每款課程遊戲真正的選詩函式）');

    const fns = {};
    COURSE_GAMES.forEach(n => {
        const G = global['Game' + n];
        fns[n] = G ? findPoemFn(G) : null;
        check(!!fns[n], 'G' + n + '★', '找得到選詩函式（內含 getSharedRandomPoem 的那一支）',
            '掃不到代表這款遊戲沒有直接呼叫 getSharedRandomPoem，'
            + '無法保證「同一關＝同一首詩」，不該列入必通關卡');
    });

    // 攔截 getSharedRandomPoem，記下「這一次呼叫實際拿到哪一首詩的哪一段」
    const realPick = global.getSharedRandomPoem;
    let last = null;
    global.getSharedRandomPoem = function () {
        const r = realPick.apply(null, arguments);
        if (r) last = r;
        return r;
    };
    // 遊戲畫版面時會大量 getElementById；給它假元素才走得到選詩之後的程式碼
    const realGet = global.document.getElementById;
    global.document.getElementById = () => env.makeEl();
    // 出不了題時 getSharedRandomPoem 會 console.error 說明原因（正確行為），
    // 這裡自己會統計，不需要滿版印出來
    const realErr = console.error, realWarn = console.warn;
    console.error = () => { }; console.warn = () => { };

    const stations = PS.build();
    const rankGames = LP.buildRankGames();
    let total = 0, noPoem = 0, outside = 0, nonDet = 0;
    const noPoemRows = [], outsideRows = [], nonDetRows = [];
    // key =「站名 難度層#關卡」→ 這一關有沒有**任何一款**遊戲出得了題
    const unitOk = {};

    try {
        stations.forEach((st, si) => {
            if (!st.units || !st.units.length) return;
            LT.setAllowedPoemIds(st.poemIds);
            const avail = (rankGames[st.rankName] || []).filter(g => COURSE_GAMES.indexOf(g) >= 0);
            avail.forEach(n => {
                const G = global['Game' + n];
                const fn = fns[n];
                if (!G || !fn) return;
                st.units.forEach(u => {
                    total++;
                    LT.setContext(u.tier, u.level);
                    G.difficulty = u.tier;
                    G.isLevelMode = true;
                    G.currentLevelIndex = u.level;
                    // 有些遊戲的選詩函式收 settings 參數（game14／game37），
                    // 多傳一個對零參數的版本無害。
                    const args = G.difficultySettings ? [G.difficultySettings[u.tier]] : [];
                    last = null;
                    try { G[fn].apply(G, args); } catch (e) { /* 選完詩之後的畫版面例外 */ }
                    const first = last;
                    const uk = st.name + ' ' + u.tier + '#' + u.level;
                    if (unitOk[uk] === undefined) unitOk[uk] = false;
                    if (first) unitOk[uk] = true;
                    if (!first) {
                        noPoem++;
                        if (noPoemRows.length < 8) {
                            noPoemRows.push('站' + si + ' ' + st.name + ' game' + n + ' ' + u.tier + '#' + u.level);
                        }
                        return;
                    }
                    if ((st.poemIds || []).indexOf(first.poem.id) < 0) {
                        outside++;
                        if (outsideRows.length < 8) {
                            outsideRows.push('站' + si + ' ' + st.name + ' game' + n + ' ' + u.tier + '#' + u.level
                                + ' → 詩 ' + first.poem.id + '〈' + first.poem.title + '〉（本站只該有 '
                                + st.poemIds.join('、') + '）');
                        }
                    }
                    // ③ 決定性：再叫一次必須拿到完全一樣的東西
                    last = null;
                    try { G[fn].apply(G, args); } catch (e) { /* 同上 */ }
                    if (!last || last.poem.id !== first.poem.id || last.startIndex !== first.startIndex) {
                        nonDet++;
                        if (nonDetRows.length < 8) {
                            nonDetRows.push('站' + si + ' ' + st.name + ' game' + n + ' ' + u.tier + '#' + u.level
                                + '：兩次分別拿到 ' + first.poem.id + '@' + first.startIndex + ' 與 '
                                + (last ? last.poem.id + '@' + last.startIndex : '(無)'));
                        }
                    }
                });
            });
        });
    } finally {
        global.getSharedRandomPoem = realPick;
        global.document.getElementById = realGet;
        console.error = realErr; console.warn = realWarn;
        LT.clearAllowedPoemIds();
        LT.clearContext();
    }

    console.log('  驗證組合：' + total.toLocaleString() + ' 組（站 × 遊戲 × 必通關卡）');
    // ⚠️ 嚴重度分兩級：
    //    ・ 某一款遊戲在某一關出不了題 → ⚠（launchGame 會自動改派，
    //      玩家不會卡住，只是那一關少了一種提取方式）。
    //      站點縮小到 3 首之後，game40「兩句必須等長」這種嚴格條件
    //      比較容易在小站落空。
    //    ・ 整整一關**所有**遊戲都出不了題 → ❌（那一關玩家真的走不下去）
    if (noPoem > 0) {
        warn('真實出題', noPoem + ' 組（' + (noPoem / total * 100).toFixed(1) + '%）出不了題，'
            + '由 launchGame 自動改派其他遊戲',
            noPoemRows.join('\n       → '));
    } else {
        ok('真實出題', '每一組合都出得了題');
    }
    const deadRows = Object.keys(unitOk).filter(k => !unitOk[k]);
    check(deadRows.length === 0, '真實出題',
        '沒有任何一個必通關卡是「所有遊戲都出不了題」',
        deadRows.slice(0, 8).join('\n       → ')
        + '\n       → 這種關卡玩家真的走不下去，必須調整該站的詩或遊戲難度設定');
    check(outside === 0, '真實出題', '出的一律是本站安排的詩（沒有洩題到站外）',
        outside + ' 組出到站外的詩：\n       → ' + outsideRows.join('\n       → ')
        + '\n       → 青雲梯是課程，只能學這一站排定的詩（見 LevelTable.setAllowedPoemIds）');
    check(nonDet === 0, '真實出題', '同一關同一遊戲永遠拿到同一首詩的同一段（決定性）',
        nonDet + ' 組不具決定性：\n       → ' + nonDetRows.join('\n       → ')
        + '\n       → 跨遊戲共用關卡表的前提就是決定性，不成立等於關卡表失效');
}

// ══════════════════════════════════════════════════════════════════════
//  第 3 節　青雲梯設定表一致性
// ══════════════════════════════════════════════════════════════════════
function verifyTables() {
    section('第 3 節　青雲梯設定表一致性');

    // 2.1 通道表 ↔ 名稱表
    Object.keys(CHANNELS).map(Number).forEach(n => {
        check(!!NAMES[n], '通道表', 'game' + n + ' 在 GAME_NAMES 有名字',
            'GAME_NAMES 少了它，關閉其他遊戲的迴圈就跳不到它');
    });

    // 2.2 解鎖表：每一款都必須有通道，否則 pickGame 永遠選不到它
    const rankNames = PS.getAllRankNames();
    const seen = {};
    UNLOCK.forEach(seg => {
        seg.ranks.forEach(r => {
            check(rankNames.indexOf(r) >= 0, '解鎖表', '文位「' + r + '」存在於 RANK_TABLE',
                'GAME_UNLOCK 寫了一個不存在的文位，那一段解鎖會整組失效');
            seen[r] = true;
        });
        seg.add.forEach(n => {
            check(!!CHANNELS[n] || !!REVIEW_ONLY[n], '解鎖表',
                'game' + n + ' 有登記提取方式（GAME_CHANNELS）',
                'pickGame 只從 GAME_CHANNELS 裡挑，沒登記的遊戲解鎖了也不會被派出');
        });
    });
    rankNames.forEach(r => {
        check(!!seen[r], '解鎖表', '文位「' + r + '」在 GAME_UNLOCK 有對應',
            '沒對應的文位會拿不到累加解鎖結果，pickGame 會退回只有 game1');
    });

    // 2.3 每個文位可用的通道數必須 >= MIN_CHANNELS_PER_STATION，
    //     否則「一站至少涵蓋 3 種通道」這條規則在那些站永遠不可能達成
    const rankGames = LP.buildRankGames();
    rankNames.forEach(r => {
        const games = (rankGames[r] || []).filter(g => CHANNELS[g] && !REVIEW_ONLY[g]);
        const chs = {};
        games.forEach(g => { chs[CHANNELS[g]] = true; });
        const cnt = Object.keys(chs).length;
        if (cnt < LP.MIN_CHANNELS_PER_STATION) {
            warn('通道覆蓋', '文位「' + r + '」只有 ' + cnt + ' 種提取方式（要求 '
                + LP.MIN_CHANNELS_PER_STATION + '）',
                '該文位的站點永遠湊不滿通道種類；若這是刻意的（起步文位），可忽略');
        } else {
            ok('通道覆蓋', '文位「' + r + '」有 ' + cnt + ' 種提取方式');
        }
    });

    // 2.4 權重表要涵蓋所有出現過的通道
    const usedCh = {};
    Object.keys(CHANNELS).forEach(n => { usedCh[CHANNELS[n]] = true; });
    Object.keys(usedCh).forEach(c => {
        check(typeof LP.CHANNEL_WEIGHTS[c] === 'number', '權重表',
            '通道「' + c + '」有出現權重',
            'pickChannelByWeight 會退回權重 1，等於這個通道的比例失控');
    });

    // 2.5 長題目表
    Object.keys(LP.LONG_GAMES).map(Number).forEach(n => {
        check(!!CHANNELS[n] || !!REVIEW_ONLY[n], '長題目表',
            'LONG_GAMES 的 game' + n + ' 是已知遊戲', '寫了一個不存在的編號，該規則等於沒作用');
    });

    // 2.6 捐納費用表要涵蓋所有難度層
    TIERS.forEach(t => {
        check(typeof LP.SKIP_FEE_BY_TIER[t] === 'number', '捐納',
            '難度層「' + t + '」有捐納費用', '會退回預設 100 文錢');
    });

    // 2.7 考試題庫 ⊆ 課程遊戲
    if (EC) {
        (EC.EXAM_GAMES || []).forEach(n => {
            check(COURSE_GAMES.indexOf(n) >= 0, '考試題庫',
                'game' + n + ' 同時也是青雲梯的課程遊戲',
                '考試考的是課程沒教過的遊戲，或考了一款無法固定出題的遊戲');
            check(typeof (EC.EXAM_GAME_WEIGHTS || {})[n] === 'number', '考試題庫',
                'game' + n + ' 有考試出題權重', '權重表漏列會被當成 0，永遠抽不到');
            check(typeof global['Game' + n] === 'object', '考試題庫',
                'game' + n + ' 已載入', '');
        });
        // 應試文位清單三處必須一致
        const psExam = PS.getExamRankNames();
        const ecOrder = EC.EXAM_RANK_ORDER || [];
        check(JSON.stringify(psExam) === JSON.stringify(ecOrder), '考試文位',
            'PathStations.getExamRankNames() 與 FMExamConfig.EXAM_RANK_ORDER 一致',
            'PathStations: ' + psExam.join(',') + '\n         FMExamConfig: ' + ecOrder.join(','));
    }

    // 2.8 獎勵金額表：每個免考文位之後的小站都要分得到錢
    const stations = PS.build();
    stations.forEach(st => {
        if (st.type !== 'grade') return;
        const s = PS.getGradeStationSilver(st);
        check(s >= 1, '獎勵金額', '小站「' + st.name + '」的晉升文錢 ≥ 1',
            '算出 ' + s + '；企畫書 §4.1 規定不得出現「晉升卻得 0 文錢」');
    });
    PS.getAllRankNames().forEach(r => {
        if (r === PS.getAllRankNames()[0]) return;   // 書僮是起點站，不發獎
        check(PS.getRankSilver(r) > 0, '獎勵金額', '文位「' + r + '」有獎勵金額',
            'achievement.js 的 rankRewards 少了這一列，晉升會發 0 文錢');
    });
}

// ══════════════════════════════════════════════════════════════════════
//  第 4 節　站點結構
// ══════════════════════════════════════════════════════════════════════
function verifyStations() {
    section('第 4 節　站點結構');
    const stations = PS.build();
    const total = PS.getTotalPoems();

    check(stations.length > 0, '站點', '站點表建得出來（共 ' + stations.length + ' 站）');

    // 3.1 詩詞分配必須連續、不重疊、不漏
    let bad = 0;
    for (let i = 0; i < stations.length; i++) {
        const st = stations[i];
        const next = stations[i + 1];
        if (next && st.poemTo !== next.poemFrom) {
            fail('站點', '第 ' + i + ' 站「' + st.name + '」的 poemTo(' + st.poemTo
                + ') 與下一站的 poemFrom(' + next.poemFrom + ') 不銜接',
                '中間那幾首詩不屬於任何一站，玩家永遠學不到');
            bad++;
        }
        if (st.poemFrom > st.poemTo) {
            fail('站點', '第 ' + i + ' 站「' + st.name + '」的 poemFrom > poemTo'); bad++;
        }
    }
    if (!bad) ok('站點', '所有站點的詩詞區間連續銜接、無缺口與重疊');
    check(stations[stations.length - 1].poemTo === total, '站點',
        '最後一站涵蓋到題庫上限（' + total + ' 首）',
        '實際 ' + stations[stations.length - 1].poemTo + '；尾端有詩沒被排進任何站');

    // 3.2 必通關卡自洽：每一站的單元都必須屬於這一站安排的詩
    let outside = 0;
    stations.forEach((st, i) => {
        (st.units || []).forEach(u => {
            const entry = LT.getLevelEntry(u.tier, u.level);
            if (!entry) { outside++; fail('必通關卡', '第 ' + i + ' 站的關卡 ' + u.tier + '#' + u.level + ' 在關卡表中不存在'); return; }
            if ((st.poemIds || []).indexOf(entry.p) < 0) {
                outside++;
                fail('必通關卡', '第 ' + i + ' 站「' + st.name + '」的關卡 ' + u.tier + '#' + u.level
                    + ' 錨定詩 ' + entry.p + ' 不在這一站的詩單裡',
                    '這一關會派出站外的詩，等於課程亂掉');
            }
        });
    });
    if (!outside) ok('必通關卡', '所有站點的必通關卡都指向自己那一站的詩');

    // 3.3 除了最後一站，每一站都必須有課程可上
    stations.forEach((st, i) => {
        if (i === stations.length - 1) return;
        if (!st.units || !st.units.length) {
            fail('必通關卡', '第 ' + i + ' 站「' + st.name + '」沒有任何必通關卡',
                '玩家點進去會無事發生，而且這一站永遠無法完成');
        }
    });

    // 3.3b requiredClears 必須等於 units.length × getPlaysPerUnit()
    const per = PS.getPlaysPerUnit();
    let rcBad = 0;
    stations.forEach((st, i) => {
        if (st.requiredClears !== (st.units || []).length * per) {
            rcBad++;
            fail('必通關卡', '第 ' + i + ' 站「' + st.name + '」的 requiredClears='
                + st.requiredClears + '，但 units=' + (st.units || []).length + ' × ' + per
                + ' = ' + (st.units || []).length * per,
                '晉升進度條的分母會顯示錯的數字');
        }
    });
    if (!rcBad) ok('必通關卡', 'requiredClears 一律等於 units × ' + per);

    // 3.4 應試站分佈：EXAM_FROM_RANK 之後的文位站都要 isExam
    const from = PS.getExamFromRank();
    const all = PS.getAllRankNames();
    const fromIdx = all.indexOf(from);
    stations.filter(s => s.type === 'rank').forEach(st => {
        const shouldExam = all.indexOf(st.name) >= fromIdx;
        check(!!st.isExam === shouldExam, '應試站',
            '文位站「' + st.name + '」的 isExam = ' + shouldExam,
            '實際 ' + !!st.isExam + '；應試門檻是「' + from + '」（含）以後');
    });

    // 3.5 文位站順序必須與 RANK_TABLE 一致
    const rankOrder = stations.filter(s => s.type === 'rank').map(s => s.name);
    check(JSON.stringify(rankOrder) === JSON.stringify(all), '站點',
        '文位站的排列順序與 RANK_TABLE 一致',
        rankOrder.join(',') + '\n         vs ' + all.join(','));

    // 3.6 站點定位與「依序連續學會首數」自洽
    let posOk = true;
    for (let i = 0; i < stations.length; i++) {
        if (PS.getCurrentIndex(stations[i].poemFrom) !== i && stations[i].poemFrom !== (stations[i + 1] || {}).poemFrom) {
            posOk = false;
            fail('站點定位', '學會 ' + stations[i].poemFrom + ' 首時，getCurrentIndex 回傳 '
                + PS.getCurrentIndex(stations[i].poemFrom) + '（預期 ' + i + '）');
        }
    }
    if (posOk) ok('站點定位', 'getCurrentIndex() 在每一站的門檻上都指到正確的站');
}

// ══════════════════════════════════════════════════════════════════════
//  第 5 節　文位升等流程模擬
// ══════════════════════════════════════════════════════════════════════

/**
 * 應考一次，走的是**真正的**考試程式。
 *
 * ⚠️ 只有「逐題作答的畫面互動」被跳過（那需要真的按鈕與 canvas）。
 *    報名費、每日次數、沙箱安裝與拆除、及格判定、冊封、獎勵發放、
 *    越級沿途補發 —— 全都是線上那一份 examConfig.js / examEngine.js。
 *    作法是暫時替換 ExamEngine.start，讓它照原本的順序跑完
 *    plan → buildQuestions → _installSandbox → （直接填答對題數）→
 *    _removeSandbox → _writeResult，並在沙箱內外各驗一次狀態。
 *
 * @param {string} rankName 應試文位
 * @param {string} mode     'mock' | 'real' | 'skip'
 * @param {boolean} wantPass 這一場要不要及格
 * @param {object} log      紀錄容器
 * @returns {{passed:boolean, plan:object, gained:number, feePaid:number}}
 */
function sitExam(rankName, mode, wantPass, log) {
    const EE = global.ExamEngine;
    const out = { passed: false, plan: null, gained: 0, feePaid: 0, sandboxOk: true, restoreOk: true };
    if (!EE || !EC || !CS) return out;
    // 2026-09-06 起 rankName 其實是**站名**：文位考的站名等於文位名，小考只有站名
    const examStation = PS.getStationByName(rankName);
    out.kind = examStation ? examStation.examKind : null;

    const silverBefore = CS.load().silver || 0;
    const fee = (mode === 'mock') ? 0
        : LP.getExamFee(rankName) * (mode === 'skip' ? (EC.SKIP_FEE_MULTIPLIER || 1) : 1);
    // ⚠️ 模擬環境沒有「打遊戲賺文錢」與「江南小院經營」這兩條收入來源，
    //    因此劇本走到後段一定付不出報名費。這裡照實記下缺口再補錢讓劇本繼續，
    //    缺口本身由第 8 節專章分析（那才是真正要回答「文錢夠不夠」的地方）。
    out.affordable = (silverBefore >= fee);
    out.shortfall = Math.max(0, fee - silverBefore);
    if (!out.affordable) {
        if (log) {
            log.silverLow.push({ rank: rankName, need: fee, had: silverBefore });
            log.toppedUp += (fee - silverBefore) + 10;
        }
        const c = CS.load(); c.silver = fee + 10; CS.save(c);
    }

    // ⚠️ 報名費**不可以**用「餘額前後差」來判定。考試結束時 onDone 會呼叫
    //    LearningPath.show() → render() → settleArrivedRewards()，把先前
    //    累積未發的晉升文錢一併補上，餘額差因此混了兩筆完全不同的帳
    //    （實測：落榜扣 75，餘額卻反而多了 45）。
    //    改成攔 FMCollectionSave.addSilver 的流水帳，依 source 分開記。
    const ledger = [];
    const origAdd = CS.addSilver;
    CS.addSilver = function (data, amount, source, note) {
        ledger.push({ amount: amount, source: source, note: note });
        return origAdd.apply(CS, arguments);
    };

    // ⚠️ 慶祝動畫（獎狀）需要真的畫面與計時器，在 Node 裡跑不動。
    //    這裡由 sitExam 自己接管，任何呼叫端（劇本迴圈、越級劇本、單元測試）
    //    都一體適用；同時把「這一張獎狀是不是考試通過發的」記進紀錄，
    //    落榜不得出現獎狀正是靠這一筆在驗。
    const origCeleb = LP.playPromotionCelebration;
    LP.playPromotionCelebration = function (station, silver, onDone) {
        const nb = LP._getPrevNextStationNames(station);
        if (log && log.celebrations) {
            log.celebrations.push({
                name: station && station.name, type: station && station.type,
                silver: silver, isExamPass: !!nb.isExamPass
            });
        }
        out.celebrated = { name: station && station.name, silver: silver, isExamPass: !!nb.isExamPass };
        if (log && log.events) {
            log.events.push({
                t: 'cert', name: station && station.name,
                silver: silver, isExamPass: !!nb.isExamPass
            });
        }
        if (typeof onDone === 'function') onDone();
    };

    const origStart = EE.start;
    EE.start = function (opts) {
        const plan = examStation
            ? EC.getPlanForStation(examStation, opts.mode === 'skip')
            : EC.getPlan(opts.rankName, opts.mode === 'skip');
        out.plan = plan;
        if (!plan) { if (opts.onDone) opts.onDone({ passed: false, error: 'no-scope' }); return; }

        this._plan = plan;
        this._mode = opts.mode || 'real';
        this._onDone = opts.onDone || null;
        this._questions = EC.buildQuestions(plan);
        this._qi = 0; this._correct = 0; this._aborted = false; this._active = true;

        // ⚠️ 2026-09 起報名費／今日名額改成「玩家按下入場應試」才扣
        // （見 examEngine.js／learningPath.js 的 onEnter 說明），不再在
        // start() 一開始就扣。這裡的模擬完全跳過畫面互動，等同玩家一定
        // 會按下入場應試，因此直接呼叫一次，行為與真正入場一致。
        if (typeof opts.onEnter === 'function') opts.onEnter();

        if (log && log.events) {
            log.events.push({
                t: 'exam-start', rank: opts.rankName, mode: this._mode,
                total: plan.totalQuestions, passCount: plan.passCount,
                poems: plan.poemIds.length, perPoem: plan.perPoem,
                scope: plan.stationNames, fee: fee, silver: CS.load().silver || 0
            });
        }

        this._installSandbox();
        // ── 沙箱驗收（企畫書 §6.5：考試是驗收不是練習，絕不可污染進度）──
        const pathBefore = LP.getPathRounds();
        const idxBefore = LP.getCurrentStationIndex();
        SM.completeLevel('game1', '小學', 1);       // 考試中的一局「過關」
        const sc = SM.saveScore ? SM.saveScore({}) : 0;
        LP.invalidateProgress();
        if (LP.getPathRounds() !== pathBefore) { out.sandboxOk = false; out.sandboxWhy = '累計局數被考試局推進了'; }
        if (LP.getCurrentStationIndex() !== idxBefore) { out.sandboxOk = false; out.sandboxWhy = '青雲梯站點被考試局推進了'; }
        if (sc !== 0) { out.sandboxOk = false; out.sandboxWhy = 'saveScore 沒有被中和（回傳 ' + sc + '）'; }

        // ── 逐題作答 ──────────────────────────────────────────────────
        // 畫面互動（每題玩一局真的遊戲）在 Node 裡跑不動，因此改成
        // 「走過真正排出來的每一道題，決定答對或答錯」。
        // 題目本身（哪一首詩、派哪一款遊戲）完全由 EC.buildQuestions 排定，
        // 不是驗證程式自己編的，因此考卷內容仍然是線上那一份。
        const need = wantPass ? plan.passCount : Math.max(0, plan.passCount - 1);
        this._questions.forEach(function (q, qi) {
            const correct = (this._correct < need);
            if (correct) this._correct++;
            this._qi++;
            if (log && log.events) {
                log.events.push({
                    t: 'exam-q', rank: opts.rankName, i: qi + 1,
                    total: plan.totalQuestions, gameNo: q.gameNo, poemId: q.poemId,
                    correct: correct
                });
            }
        }, this);
        this._active = false;
        this._removeSandbox();

        // ── 拆箱驗收：所有被覆寫的東西都要還原 ──
        if (SM.completeLevel !== PRISTINE.completeLevel) { out.restoreOk = false; out.restoreWhy = 'ScoreManager.completeLevel 沒還原'; }
        if (SM.saveScore !== PRISTINE.saveScore) { out.restoreOk = false; out.restoreWhy = 'ScoreManager.saveScore 沒還原'; }
        if (global.alert !== PRISTINE.alert) { out.restoreOk = false; out.restoreWhy = 'window.alert 沒還原'; }
        if (LT.getContext() !== null) { out.restoreOk = false; out.restoreWhy = 'LevelTable 情境沒清掉（回到青雲梯會沿用考試最後一題的情境）'; }

        const passed = this._correct >= plan.passCount;
        const result = {
            passed: passed, correct: this._correct, total: plan.totalQuestions,
            mode: this._mode, rankName: opts.rankName
        };
        if (this._mode !== 'mock') result.silverGained = this._writeResult(passed) || 0;
        out.passed = passed;
        out.gained = result.silverGained || 0;
        // ⚠️ 與 examEngine._finish 的收尾順序一致：通過且非模擬考才播獎狀動畫，
        //    否則直接回呼。走真正的 _celebrate 才驗得到「考過有沒有發獎狀」。
        if (log && log.events) {
            log.events.push({
                t: 'exam-result', rank: opts.rankName, mode: this._mode,
                passed: passed, correct: this._correct, total: plan.totalQuestions,
                passCount: plan.passCount, gained: result.silverGained || 0,
                silver: CS.load().silver || 0,
                rankNow: SM.getEffectiveRank(SM.loadPlayerData()),
                kind: plan.kind
            });
        }
        if (passed && this._mode !== 'mock') this._celebrate(result);
        else if (opts.onDone) opts.onDone(result);
    };
    try {
        // 走真正的入口：報名費、每日次數限制都由它負責
        if (mode === 'skip') LP.startSkipExam(rankName);
        else LP.startExam(rankName, mode);
    } finally {
        EE.start = origStart;
        CS.addSilver = origAdd;
        LP.playPromotionCelebration = origCeleb;
    }
    out.ledger = ledger;
    if (log && log.events && !out.affordable) {
        log.events.push({ t: 'silver-short', rank: rankName, need: fee, had: silverBefore });
    }
    out.feePaid = -ledger.filter(e => e.source === 'exam_fee')
        .reduce((a, e) => a + e.amount, 0);
    out.expectFee = fee;
    if (log) log.exams.push({
        rank: rankName, kind: out.kind, mode: mode,
        passed: out.passed, gained: out.gained, fee: out.feePaid
    });
    return out;
}

/**
 * 劇本執行器。
 *
 * ⚠️ 這裡跑的是**真正的** LearningPath：pickUnit / pickGame / advanceAfterWin /
 *    showPromotionQueue / grantStationReward / settleArrivedRewards 全部原封不動。
 *    只換掉三件在 Node 裡不可能成立的事：
 *      ① 遊戲的 show()：改成「假裝開好局了」的替身，但**仍然走一次
 *         DifficultySelector.show 的回呼**，藉此驗證青雲梯的難度／關卡注入。
 *      ② _makePopup()：改成能記下 HTML、並讓我們「按下按鈕」的假彈窗。
 *      ③ playPromotionCelebration()：動畫需要畫面與計時器，改成立即完成。
 *
 * @param {object} opt
 *        maxTurns   最多進站幾次
 *        failRate   每一局失敗的機率
 *        quitRate   過關後直接關掉遊戲（不按「下一關」）的機率
 *        reviewRate 回頭溫習舊站的機率
 *        stopAtIdx  走到第幾站就停
 *        seed       亂數種子（同一個種子結果完全一致）
 * @returns {object} 這一輪的紀錄
 */
const _poemFnCache = {};
function poemFnOf(G) {
    const key = G && G.container !== undefined ? (G.__fmKey || '') : '';
    if (!G) return null;
    if (G.__fmPoemFn !== undefined) return G.__fmPoemFn;
    G.__fmPoemFn = findPoemFn(G);
    return G.__fmPoemFn;
}

/**
 * 把「第 idx 站之前」的所有考試標記為已通過。
 *
 * ⚠️ 2026-09-06 起小考也是硬性關卡，因此任何「把玩家放到第 N 站」的前置，
 *    都必須連沿途的考試一起處理 —— 只灌通關紀錄的話，站點會被關卡壓在
 *    第一個沒考過的考試站，測試根本走不到要驗的地方。
 */
function passExamsBefore(idx) {
    const stations = PS.build();
    const coll = CS.load();
    if (!coll.exams) coll.exams = { minorPassed: [] };
    if (!Array.isArray(coll.exams.minorPassed)) coll.exams.minorPassed = [];
    if (!coll.ranks) coll.ranks = { passed: [] };
    for (let i = 0; i < idx && i < stations.length; i++) {
        const st = stations[i];
        if (st.examKind === 'rank' && coll.ranks.passed.indexOf(st.name) < 0) {
            coll.ranks.passed.push(st.name);
        } else if (st.examKind === 'minor' && coll.exams.minorPassed.indexOf(st.name) < 0) {
            coll.exams.minorPassed.push(st.name);
        }
    }
    CS.save(coll);
    LP.invalidateProgress();
}

function runScenario(opt) {
    const o = opt || {};
    const stations = PS.build();
    env.resetSave();

    let lastEntered = -1;
    const cloud = CLOUD;
    cloud.logs.length = 0;          // 每個劇本從乾淨的 LOG 開始
    let rnd = o.seed || 20260904;
    const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

    const log = {
        plays: [],          // 每一局：{ game, tier, level, station }
        promos: [],         // 每一次晉升彈窗：{ batch, idx, name, type, isExam, kind, silver }
        batches: [],        // 每一批晉升佇列：{ id, from, to }
        celebrations: [],   // 播過慶祝動畫的站
        idxTrail: [],       // 站點索引軌跡
        silverBy: {},       // 站名 → 累計發放文錢
        exams: [],          // 每一場考試：{ rank, mode, passed, gained, fee }
        silverLow: [],      // 曾經付不出報名費的時刻：{ rank, need, had }
        toppedUp: 0,        // 為了讓劇本走得下去而灌進去的文錢總額
        events: [],         // 依時間排列的完整事件流（report 模式輸出用）
        cloudLogs: [],      // supabaseClient.logGame 實際組出的 game_logs payload
        ranks: [],          // 每次文位變動：{ station, rank }
        errors: []
    };
    let batchId = -1;
    const err = (m) => { if (log.errors.indexOf(m) < 0) log.errors.push(m); };

    // ── ① 遊戲替身 ──────────────────────────────────────────────────
    let pending = null;
    const savedShow = {};
    COURSE_GAMES.forEach(n => {
        const G = global['Game' + n];
        if (!G) return;
        savedShow[n] = G.show;
        G.show = function () {
            // 真實遊戲就是在 show() 裡叫難度選擇器，青雲梯靠暫時替換它注入難度與關卡
            let got = null;
            if (global.DifficultySelector && typeof global.DifficultySelector.show === 'function') {
                global.DifficultySelector.show(NAMES[n] || ('game' + n), function (tier, levelIndex) {
                    got = { tier: tier, levelIndex: levelIndex };
                });
            }
            if (!got) { err('game' + n + '：青雲梯沒有把難度與關卡注入 DifficultySelector 回呼'); return; }
            if (got.levelIndex === undefined) err('game' + n + '：回呼沒收到關卡編號，isLevelMode 會是 false');
            const ctx = LT.getContext();
            if (ctx && (ctx.tier !== got.tier || ctx.levelIndex !== got.levelIndex)) {
                err('game' + n + '：DifficultySelector 收到 ' + got.tier + '#' + got.levelIndex
                    + '，但 LevelTable 情境是 ' + ctx.tier + '#' + ctx.levelIndex + '（兩者必須一致）');
            }
            if (LT._allowedPoemIds === null) {
                err('game' + n + '：開局時候選詩白名單是空的，B 案會端出站外的詩');
            }
            this.difficulty = got.tier;
            this.isLevelMode = (got.levelIndex !== undefined);
            this.currentLevelIndex = got.levelIndex || 1;

            // ⚠️ 真的把這一局的詩選出來。
            //    不是為了驗選詩（那是第 2 節的事），而是為了讓
            //    LevelTable.setLastPoemId() 被呼叫 —— supabaseClient.logGame
            //    的 poem_id 欄位讀的就是它。少了這一步，整份 LOG 的 poem_id
            //    會全是 null，玩家歷程就看不出「哪一局在背哪一首詩」。
            if (o.captureLog) {
                const fn = poemFnOf(this);
                if (fn) {
                    const realGet = global.document.getElementById;
                    global.document.getElementById = () => env.makeEl();
                    const realErr = console.error;
                    console.error = () => { };
                    try {
                        this[fn].call(this, this.difficultySettings
                            ? this.difficultySettings[this.difficulty] : undefined);
                    } catch (e) { /* 選完詩之後的畫版面例外，預期之內 */ }
                    finally {
                        global.document.getElementById = realGet;
                        console.error = realErr;
                    }
                }
            }
            if (o.failToLoad && o.failToLoad.indexOf(n) >= 0) {
                // 模擬「這一關出不了題」，驗證 launchGame 的自動換遊戲安全網
                global.alert('載入詩詞失敗。');
                return;
            }
            pending = { game: n, tier: this.difficulty, level: this.currentLevelIndex };
        };
    });

    // ── ② 假彈窗 ────────────────────────────────────────────────────
    const origMakePopup = LP._makePopup;
    let lastPop = null;
    LP._makePopup = function (innerHTML) {
        const els = {};
        const pop = {
            html: innerHTML,
            querySelector: function (sel) {
                if (sel[0] !== '#') return env.makeEl();
                const id = sel.slice(1);
                if (innerHTML.indexOf('id="' + id + '"') < 0) return null;
                return els[id] || (els[id] = env.makeEl());
            },
            querySelectorAll: function () { return []; },
            remove: function () { pop.removed = true; }
        };
        lastPop = pop;
        return pop;
    };

    // ── ③ 慶祝動畫替身 ──────────────────────────────────────────────
    const origCeleb = LP.playPromotionCelebration;
    LP.playPromotionCelebration = function (station, silver, onDone) {
        // _getPrevNextStationNames 用「isExam 且不在站點陣列裡」判定
        //   「這是考試剛通過」——考試通過時 examEngine 傳的是合成物件。
        const nb = LP._getPrevNextStationNames(station);
        log.celebrations.push({
            name: station && station.name, type: station && station.type,
            silver: silver, isExamPass: !!nb.isExamPass
        });
        if (typeof onDone === 'function') onDone();
    };
    const origScroll = LP.scrollToCurrent;
    LP.scrollToCurrent = function () { };

    // ── ④ 攔截晉升佇列：記下「這一局跨過了哪一段站」──────────────────
    //    真正要驗的不是「彈窗總數」，而是「跨過的每一站都有演到」。
    //    玩家過關後直接關掉遊戲時本來就不會有彈窗（獎勵改由
    //    settleArrivedRewards 靜默補發），那不是錯誤；
    //    錯的是「明明走了兩站，卻只演最後一站」。
    const origQueue = LP.showPromotionQueue;
    LP.showPromotionQueue = function (from, to) {
        batchId++;
        log.batches.push({ id: batchId, from: from, to: to });
        return origQueue.call(this, from, to);
    };

    const origPopup = LP.showPromotionPopup;
    LP.showPromotionPopup = function (station, onNext) {
        const before = CS ? (CS.load().silver || 0) : 0;
        origPopup.call(this, station, onNext);
        const after = CS ? (CS.load().silver || 0) : 0;
        const html = (lastPop && lastPop.html) || '';
        const kind = html.indexOf('入室升堂') >= 0 ? 'ENROLL'
            : html.indexOf('學問已成，可赴科場') >= 0 ? 'EXAM'
                : html.indexOf('積學有成') >= 0 ? 'RANK'
                    : html.indexOf('更上一層') >= 0 ? 'GRADE' : 'UNKNOWN';
        const idx = stations.indexOf(station);
        log.promos.push({
            batch: batchId, idx: idx, name: station && station.name,
            // 抵達當下這一站的課程是不是已經修畢（大儒沒有課程；
            // 也可能是玩家先在自由練習裡把這一站打完了）
            preQualified: !!(station && station.isExam
                && LP.getRankExamProgress(station.name).ok),
            type: station && station.type,
            isExam: !!(station && station.isExam), kind: kind, silver: after - before
        });
        if (after - before > 0) {
            log.silverBy[station.name] = (log.silverBy[station.name] || 0) + (after - before);
        }
        log.events.push({
            t: 'promo', idx: idx, name: station && station.name,
            type: station && station.type, isExam: !!(station && station.isExam),
            kind: kind, silver: after - before, silverAfter: after
        });
        // 代替玩家按下按鈕，讓佇列往下走（應試站一律選「容後再議」，
        // 這樣才驗得到「後面那幾站的彈窗有沒有繼續演」）
        const btn = lastPop && (lastPop.querySelector('#lpPopLater') || lastPop.querySelector('#lpPopClaim'));
        if (btn && typeof btn.onclick === 'function') btn.onclick();
        else err('晉升彈窗「' + (station && station.name) + '」沒有可以按的按鈕，流程會卡住');
    };

    // ── ⑤ 記錄每一次派局 ────────────────────────────────────────────
    const origLaunch = LP.launchGame;
    LP.launchGame = function (gameNo, tier, levelIndex, tried) {
        const st = LP._currentStation;
        log.plays.push({ game: gameNo, tier: tier, level: levelIndex, station: st && st.name });
        // 不變式：派出的關卡必須屬於這一站的必通關卡
        if (st && !(st.units || []).some(u => u.tier === tier && u.level === levelIndex)) {
            err('派出站外關卡：站「' + st.name + '」派了 ' + tier + '#' + levelIndex);
        }
        // 不變式：派出的遊戲必須是該文位已解鎖、且列入必通關卡的
        if (st) {
            const allowed = (LP.buildRankGames()[st.rankName] || []);
            if (allowed.indexOf(gameNo) < 0) err('派出未解鎖的遊戲：站「' + st.name + '」派了 game' + gameNo);
            if (REVIEW_ONLY[gameNo]) err('派出僅供複習的遊戲：game' + gameNo);
        }
        return origLaunch.call(this, gameNo, tier, levelIndex, tried);
    };

    // ── 主迴圈 ──────────────────────────────────────────────────────
    // 青雲梯遇到「這一關出不了題」時會用 console.warn 留紀錄（那是正確行為），
    // 但劇本 E 會刻意製造幾十次，全部印出來會把驗證輸出洗掉 —— 收集起來就好。
    const realWarn = console.warn;
    log.warns = [];
    console.warn = function () { log.warns.push(Array.prototype.join.call(arguments, ' ')); };

    const stopAt = (o.stopAtIdx === undefined) ? stations.length - 1 : o.stopAtIdx;
    let turns = 0;
    try {
        while (turns++ < (o.maxTurns || 4000)) {
            const idx = LP.getCurrentStationIndex();
            log.idxTrail.push(idx);

            // ⚠️ 考試的判斷必須放在「走到底就收工」之前。
            //    最後一站「大儒」自己沒有課程（poemFrom === poemTo、units 為空），
            //    玩家抵達之後唯一還能做的事就是應考 —— 先 break 再考，
            //    等於整條青雲梯永遠停在狀元，最後一個文位拿不到。
            // ── 逢「需應試的文位站」就先去考場 ────────────────────────
            //    這是真實玩家的行為：站點推進到文位站只是取得應試資格，
            //    不去考就永遠停在上一個免考文位。劇本 F 靠這一段走完 13 場考試。
            // ⚠️ 時機是「**修完這一站的課程**」而不是「抵達這一站」。
            //    抵達只是入學；資格由 getRankExamProgress().ok 認定
            //    （見 learningPath.getExamGateIndex 的規則說明）。
            if (o.takeExams) {
                const here = stations[idx];
                const collNow = CS.load();
                // ⚠️ 2026-09-06 起「有考試的站」不只文位站：每約 12 首有一場小考。
                const qualified = here && here.examKind
                    && !EC.isExamPassed(collNow, here)
                    && LP.getStationExamProgress(here).ok;
                if (qualified) {
                    const here2 = here;
                    log.events.push({
                        t: 'exam-qualified', rank: here2.name, kind: here2.examKind, idx: idx,
                        units: (here2.units || []).length,
                        requiredClears: here2.requiredClears,
                        silver: CS.load().silver || 0
                    });
                    // ── 先落榜幾次，驗落榜路徑不會誤發文位／獎勵 ──────────
                    // 小考免報名費、風險低，劇本只讓文位考落榜（小考一次就過）
                    const fails = (here2.examKind === 'rank')
                        ? Math.max(0, (o.examAttempts || 1) - 1) : 0;
                    for (let k = 0; k < fails; k++) {
                        const bad = sitExam(here2.name, 'real', false, log);
                        if (bad.passed) err('「' + here2.name + '」刻意落榜卻被判及格');
                        if (bad.gained !== 0) err('「' + here2.name + '」落榜卻發了 ' + bad.gained + ' 文錢');
                        const p2 = (CS.load().ranks || {}).passed || [];
                        if (p2.indexOf(here2.name) >= 0) err('「' + here2.name + '」落榜卻被冊封');
                        LP.invalidateProgress();
                        if (LP.getCurrentStationIndex() !== idx) {
                            err('「' + here2.name + '」落榜後站點竟然前進了（關卡應該還鎖著）');
                        }
                        if (bad.feePaid !== bad.expectFee) {
                            err('「' + here2.name + '」落榜的報名費不符：扣了 ' + bad.feePaid
                                + '，應為 ' + bad.expectFee);
                        }
                    }
                    const r = sitExam(here2.name, 'real', true, log);
                    if (!r.sandboxOk) err('考試沙箱失效：' + (r.sandboxWhy || ''));
                    if (!r.restoreOk) err('考試拆箱不完全：' + (r.restoreWhy || ''));
                    if (!r.passed) err('考試「' + here2.name + '」判定為落榜（劇本要求及格）');
                    const eff = SM.getEffectiveRank(SM.loadPlayerData());
                    if (here2.examKind === 'rank') {
                        if (eff !== here2.name) {
                            err('通過「' + here2.name + '」文位考後，getEffectiveRank 卻是「' + eff + '」');
                        }
                        log.ranks.push({ station: idx, rank: eff });
                    } else {
                        // ★ 小考絕不可以給文位
                        const p3 = (CS.load().ranks || {}).passed || [];
                        if (p3.indexOf(here2.name) >= 0) {
                            err('小考「' + here2.name + '」竟然被寫進 ranks.passed（小考不給文位）');
                        }
                        if (r.celebrated && r.celebrated.isExamPass) {
                            err('小考「' + here2.name + '」竟然播放了獎狀動畫');
                        }
                    }
                    LP.invalidateProgress();
                    const isLastStation = (idx === stations.length - 1);
                    const advanced = LP.getCurrentStationIndex() > idx;
                    if (!isLastStation && !advanced) {
                        err('通過「' + here2.name + '」考試後站點仍停在原地（考試關卡沒有解除）');
                    }
                    log.exams[log.exams.length - 1].unlocked = advanced;
                    log.exams[log.exams.length - 1].kind = here2.examKind;
                    // ⚠️ 中式之後關卡解除、站點會往前跳，這一輪的 idx 已經過期。
                    //    不重新取就會拿舊索引去進「剛走過的那一站」空轉。
                    continue;
                }
                // 卡在考試關卡而課程還沒修完 → 繼續修課（下面的正常流程）
            }
            if (idx >= stopAt) break;

            const review = (o.reviewRate && idx > 0 && rand() < o.reviewRate);
            const enterIdx = review ? Math.floor(rand() * idx) : idx;
            if (o.captureLog && !review && lastEntered !== enterIdx) {
                lastEntered = enterIdx;
                const est = stations[enterIdx];
                log.events.push({
                    t: 'station-enter', idx: enterIdx, name: est.name, type: est.type,
                    isExam: !!est.isExam, tier: est.tier,
                    poemFrom: est.poemFrom, poemTo: est.poemTo,
                    poemIds: est.poemIds, units: (est.units || []).length,
                    requiredClears: est.requiredClears,
                    silver: CS.load().silver || 0,
                    rank: SM.getEffectiveRank(SM.loadPlayerData())
                });
            }
            pending = null;
            LP.enterStation(enterIdx, review);

            // 一路打到「這一輪結束」為止：pending 由遊戲替身設定
            let guard = 0;
            while (pending && guard++ < 500) {
                const p = pending; pending = null;
                if (o.failRate && rand() < o.failRate) { LP.show(); break; }   // 沒過就離開
                // ── 這一局的完整結算，順序與線上一致 ─────────────────────
                //    playWinAnimation → saveScore（積分＋文錢＋雲端 game_logs）
                //    → showAfterAch  → completeLevel（課程進度）
                //
                // ⚠️ 舊版只呼叫 completeLevel，等於整趟旅程一分積分、一文錢
                //    都沒進帳 —— 第 8 節的收支表因此完全失真（實測差了
                //    三十幾萬文錢）。青雲梯的每一局都是有收入的。
                const score = SCORE_BY_TIER[p.tier] || 200;
                const dur = DURATION_BY_TIER[p.tier] || 60;
                const silverBefore = o.captureLog ? (CS.load().silver || 0) : 0;
                SM.saveScore('game' + p.game, p.tier, score,
                    LT.getLastPoemId ? LT.getLastPoemId() : null, dur);
                SM.completeLevel('game' + p.game, p.tier, p.level);
                log.wins = (log.wins || 0) + 1;
                log.playScore = (log.playScore || 0) + score;
                // ⚠️ 逐局讀存檔換算餘額很貴（每次都要 JSON.parse 整份存檔，
                //    走完一趟是好幾千次），因此只有要輸出完整 LOG 時才做。
                if (o.captureLog) {
                    const newLog = cloud.logs[cloud.logs.length - 1];
                    if (newLog) log.cloudLogs.push(newLog);
                    log.events.push({
                        t: 'play', station: p.station, level: p.level, tier: p.tier,
                        game: p.game, score: score,
                        silverGain: (CS.load().silver || 0) - silverBefore,
                        silver: CS.load().silver || 0,
                        totalScore: SM.loadPlayerData().totalScore || 0,
                        rounds: LP.getPathRounds(),
                        cloud: newLog || null
                    });
                }
                LP.invalidateProgress();
                if (o.quitRate && rand() < o.quitRate) { LP.show(); break; }   // 過關後直接關掉遊戲
                const G = global['Game' + p.game];
                if (!G || typeof G.startNextLevel !== 'function') {
                    err('game' + p.game + ' 沒有 startNextLevel()，青雲梯無法收回控制權');
                    LP.show(); break;
                }
                G.startNextLevel();      // ← 真實遊戲過關後做的事；已被青雲梯覆寫
            }
            LP.show();
        }
    } finally {
        console.warn = realWarn;
        LP._makePopup = origMakePopup;
        LP.showPromotionQueue = origQueue;
        LP.showPromotionPopup = origPopup;
        LP.playPromotionCelebration = origCeleb;
        LP.scrollToCurrent = origScroll;
        LP.launchGame = origLaunch;
        COURSE_GAMES.forEach(n => { if (global['Game' + n]) global['Game' + n].show = savedShow[n]; });
        LP.restorePatchedGame();
    }

    log.finalIdx = LP.getCurrentStationIndex();
    log.pathRounds = (SM.loadPlayerData() || {}).pathRounds || 0;
    log.finalSilver = (CS.load().silver || 0);
    log.finalScore = (SM.loadPlayerData() || {}).totalScore || 0;
    return log;
}

/** 對一輪劇本結果套用共通不變式 */
function assertInvariants(name, log, opt) {
    const stations = PS.build();
    const o = opt || {};

    // I0 模擬過程中沒有記到任何硬錯誤
    check(log.errors.length === 0, name, '流程中沒有出現規則違反',
        log.errors.join('\n       → '));

    // I1 站點索引只增不減
    let mono = true;
    for (let i = 1; i < log.idxTrail.length; i++) {
        if (log.idxTrail[i] < log.idxTrail[i - 1]) { mono = false; break; }
    }
    check(mono, name, '站點索引單調不減', '出現退站，代表進度判定被污染');

    // I2 ★ 每一批晉升佇列都必須把「這一局跨過的每一站」逐站演完，不得跳號。
    //    這正是玩家回報的「完成童生課程卻沒叫我去考試」那個 bug 的驗收條件：
    //    當年只演最後一站，中間的應試文位站被整個吃掉。
    const badBatch = [];
    log.batches.forEach(b => {
        const got = log.promos.filter(p => p.batch === b.id).map(p => p.idx);
        const want = [];
        for (let i = b.from; i <= b.to; i++) want.push(i);
        if (JSON.stringify(got) !== JSON.stringify(want)) {
            badBatch.push('第 ' + b.id + ' 批應演 [' + want.join(',') + ']，實際 [' + got.join(',') + ']');
        }
    });
    check(badBatch.length === 0, name,
        '每一局跨過的站都逐站演出晉升彈窗（共 ' + log.batches.length + ' 批）',
        badBatch.slice(0, 5).join('；')
        + '\n       → 跳號代表中間那一站的獎勵與提示被吃掉（見「文位升等已知錯誤紀錄」№2）');

    // I2b 站點索引順序：彈窗整體仍必須由小到大
    let seq = true, prev = -1;
    log.promos.forEach(p => { if (p.idx <= prev) seq = false; prev = p.idx; });
    check(seq, name, '晉升彈窗的站點索引由小到大',
        '實際順序：' + log.promos.map(p => p.idx).join(','));

    // I3 ★ 抵達需應試的文位站 ＝ **入學**（規則第一步），
    //    既不是「可赴科場」（那要修完這一站的課程才對），
    //    更不可以是獎狀分支（那要考過才對）。
    // 抵達當下課程就已修畢的應試站（大儒、或先在自由練習打完的站）
    // 直接給應試引導才是對的，不必先演一次「入室升堂」。
    const wrongExam = log.promos.filter(p => p.isExam
        && p.kind !== (p.preQualified ? 'EXAM' : 'ENROLL'));
    check(wrongExam.length === 0, name,
        '抵達應試文位站時演出的是「入室升堂」（入學），不是應試引導、更不是獎狀',
        wrongExam.map(p => p.name + ' → ' + p.kind).join('、')
        + '\n       → 抵達只是入學；「可赴科場」必須等到修完這一站的課程（showExamQualifiedPopup）');
    // ⚠️ 應試文位有兩個時機會走到慶祝動畫，只有一個是對的：
    //      · **抵達站點**（傳進來的是 PathStations.build() 裡的真身，isExamPass=false）
    //        → 絕對不可以發獎狀，考試都還沒考。
    //      · **通過考試**（examEngine 傳的是合成物件，isExamPass=true）
    //        → 這才是該發獎狀的那一刻。
    //    兩者的分辨完全交給 _getPrevNextStationNames（見 №11），
    //    這裡順便驗那支函式有沒有分對。
    const celebOnArrive = log.celebrations.filter(c => {
        if (c.isExamPass) return false;
        const st = stations.find(s2 => s2.name === c.name && s2.type === c.type);
        return st && st.type === 'rank' && st.isExam;
    });
    check(celebOnArrive.length === 0, name, '應試文位站「抵達時」不播放獎狀動畫',
        celebOnArrive.map(c => c.name).join('、') + '（考試都還沒考就發獎狀）');

    // I4 應試文位站在抵達當下不得發文錢
    const paidExam = log.promos.filter(p => p.isExam && p.silver > 0);
    check(paidExam.length === 0, name, '應試文位站抵達時不發文錢（考過才發）',
        paidExam.map(p => p.name + ' +' + p.silver).join('、'));

    // I5 每一個已抵達的小站／免考文位站，文錢恰好發一次且金額正確
    const claimed = ((SM.loadPlayerData().achievements || {}).claimed) || [];
    const missing = [], wrongAmt = [];
    for (let i = 1; i <= log.finalIdx; i++) {
        const st = stations[i];
        if (st.type === 'rank' && st.isExam) continue;
        const id = st.type === 'grade' ? ('lpgrade_' + st.name) : ('rank_' + st.name);
        if (claimed.indexOf(id) < 0) { missing.push(st.name); continue; }
        const should = st.type === 'grade' ? PS.getGradeStationSilver(st) : PS.getRankSilver(st.name);
        const got = log.silverBy[st.name];
        // 沒經過彈窗的站是由 settleArrivedRewards 靜靜補發的，log 記不到，
        // 因此只檢查「有經過彈窗的站金額對不對」＋「全部站都已標記已發」
        if (got !== undefined && got !== should) wrongAmt.push(st.name + '：發了 ' + got + '，應為 ' + should);
        if (claimed.filter(x => x === id).length > 1) wrongAmt.push(st.name + '：重複發放');
    }
    check(missing.length === 0, name, '已抵達的每一站都拿到了晉升文錢',
        '漏發：' + missing.join('、') + '（見「文位升等已知錯誤紀錄」№3）');
    check(wrongAmt.length === 0, name, '晉升文錢金額正確、無重複發放', wrongAmt.join('；'));

    // I6 同一款遊戲不得連續超過上限
    let mx = 1, cur = 1;
    for (let i = 1; i < log.plays.length; i++) {
        if (log.plays[i].game === log.plays[i - 1].game) { cur++; mx = Math.max(mx, cur); } else cur = 1;
    }
    check(mx <= LP.MAX_SAME_GAME_STREAK, name,
        '同一款遊戲最長連續 ' + mx + ' 局（上限 ' + LP.MAX_SAME_GAME_STREAK + '）',
        '超過上限代表青雲梯沒收回關卡推進的控制權 —— '
        + '多半是某款遊戲缺 startNextLevel()，見「青雲梯遊戲接入規範」§2');

    // I7 每一站整體要涵蓋足夠的提取方式（只檢查有打滿的站）
    const byStation = {};
    log.plays.forEach(p => {
        if (!p.station) return;
        (byStation[p.station] = byStation[p.station] || {})[CHANNELS[p.game]] = true;
    });
    const thin = Object.keys(byStation).filter(k => {
        const st = stations.find(s => s.name === k);
        if (!st) return false;
        const done = log.plays.filter(p => p.station === k).length;
        if (done < st.requiredClears) return false;    // 沒打完的站不算
        return Object.keys(byStation[k]).length < LP.MIN_CHANNELS_PER_STATION;
    });
    check(thin.length === 0, name,
        '每個打滿的站都涵蓋 ≥ ' + LP.MIN_CHANNELS_PER_STATION + ' 種提取方式', thin.join('、'));

    // I8 溫習不得增加累計局數
    if (o.expectRoundsEqualPlays) {
        check(log.pathRounds === log.plays.filter(p => p.win !== false).length
            || log.pathRounds <= log.plays.length, name,
            '累計局數（pathRounds ' + log.pathRounds + '）沒有超過實際局數 ' + log.plays.length, '');
    }
}

function verifyFlow() {
    section('第 5 節　文位升等流程模擬（跑的是真正的 learningPath.js）');

    // ── 劇本 A：理想玩家 —— 每局都贏、每次都按「下一關」──────────────
    console.log('\n▍劇本 A：每局都贏、每次按「下一關」、逢資格就應考，一路走到大儒');
    const A = runScenario({ seed: 1001, takeExams: true });
    check(A.finalIdx === PS.build().length - 1, '劇本A',
        '走完全部 ' + PS.build().length + ' 站（最終站 ' + A.finalIdx + '）', '');
    // ⚠️ 「靠考試解鎖」而進入的站也要補演晉升彈窗（見 startExam 的 onDone）——
    //    否則緊接在小考後面的免考文位（蒙童）獎狀會整個不見。
    //    因此這裡的期望就是「每一站都有一次彈窗」。
    check(A.promos.length === PS.build().length - 1, '劇本A',
        '每一站都演出了晉升彈窗（' + A.promos.length + ' 次）',
        '應為 ' + (PS.build().length - 1) + ' 次；少的那幾站獎勵與提示都被吃掉了');
    assertInvariants('劇本A', A, { expectRoundsEqualPlays: true });
    console.log('    共 ' + A.plays.length + ' 局、' + A.promos.length + ' 次晉升');

    // ── 劇本 B：亂流 —— 會失敗、會中途離開、會回頭溫習 ────────────────
    console.log('\n▍劇本 B：25% 失敗、15% 過關後直接關掉遊戲、10% 回頭溫習舊站（逢資格應考）');
    const B = runScenario({ seed: 2002, failRate: 0.25, quitRate: 0.15, reviewRate: 0.10, takeExams: true });
    check(B.finalIdx === PS.build().length - 1, '劇本B', '仍然走得完整條青雲梯', '');
    assertInvariants('劇本B', B, {});
    console.log('    共 ' + B.plays.length + ' 局、' + B.promos.length + ' 次晉升（其餘為靜默補發）');

    // ── 劇本 C：一局同時完成兩站 ─────────────────────────────────────
    // ⚠️ 這個劇本原本是「中間夾著應試文位站」——那正是玩家回報的
    //    「完成童生課程卻沒叫我去考試」的重現條件。
    //    2026-09-05 加上考試關卡之後，**一局已經不可能跨過應試文位站**
    //    （getExamGateIndex 會把站點壓在那一站），所以改成驗兩件事：
    //      C-1 兩個相鄰小站被一局同時完成時，兩個晉升彈窗都要依序演出
    //      C-2 應試文位站在任何情況下都跨不過去（關卡的結構性保證）
    console.log('\n▍劇本 C：一局同時完成兩個小站；並確認應試文位站跨不過去');
    (function () {
        const stations = PS.build();
        // 兩個相鄰、中間沒有考試擋路的小站（考試會把跨站跳躍切斷）
        let a = -1;
        for (let i = 1; i + 1 < stations.length; i++) {
            if (stations[i].units.length && stations[i + 1].units.length
                && !stations[i].examKind && !stations[i + 1].examKind
                && !stations[i - 1].examKind) { a = i; break; }
        }
        if (a < 0) { warn('劇本C', '找不到兩個相鄰且無考試的小站，略過'); return; }
        const b = a + 1;

        env.resetSave();
        const clear = (t, l, gs) => gs.forEach(g => SM.completeLevel('game' + g, t, l));
        const units = PS.getPoemUnits();
        for (let i = 0; i < stations[a].poemFrom; i++) {
            units[i].units.forEach(u => clear(u.tier, u.level, [1, 4, 8]));
        }
        // a 站只差最後一個單元的第三款遊戲
        const ua = stations[a].units;
        ua.forEach((u, i) => clear(u.tier, u.level, i === ua.length - 1 ? [1, 4] : [1, 4, 8]));
        // b 站早就在自由練習裡打完了（這正是跨站跳躍的成因）
        stations[b].units.forEach(u => clear(u.tier, u.level, [1, 4, 8]));
        // ⚠️ a 站之前的考試（含小考）必須先通過，否則關卡會把站點壓在前面，
        //    根本走不到 a 站，這個劇本就驗不到跨站跳躍。
        const cC = CS.load();
        for (let i = 0; i < a; i++) {
            const st2 = stations[i];
            if (st2.examKind === 'rank') {
                if (cC.ranks.passed.indexOf(st2.name) < 0) cC.ranks.passed.push(st2.name);
            } else if (st2.examKind === 'minor') {
                if (cC.exams.minorPassed.indexOf(st2.name) < 0) cC.exams.minorPassed.push(st2.name);
            }
        }
        CS.save(cC);
        LP.invalidateProgress();

        const startIdx = LP.getCurrentStationIndex();
        check(startIdx === a, '劇本C', '起始站是第 ' + a + ' 站「' + stations[a].name + '」',
            '實際第 ' + startIdx + ' 站');

        const seen = [];
        const origPopup = LP.showPromotionPopup;
        const origMake = LP._makePopup;
        const origCeleb = LP.playPromotionCelebration;
        const origScroll = LP.scrollToCurrent;
        let lastHtml = '';
        LP._makePopup = function (html) {
            lastHtml = html;
            const els = {};
            return {
                querySelector: (sel) => (sel[0] === '#' && html.indexOf('id="' + sel.slice(1) + '"') >= 0)
                    ? (els[sel] || (els[sel] = env.makeEl())) : (sel[0] === '#' ? null : env.makeEl()),
                querySelectorAll: () => [], remove() { }
            };
        };
        LP.playPromotionCelebration = (st2, s2, done) => { if (done) done(); };
        LP.scrollToCurrent = () => { };
        LP.showPromotionPopup = function (st2, onNext) {
            origPopup.call(this, st2, onNext);
            seen.push(st2.name);
            if (typeof onNext === 'function') onNext();
        };
        try {
            LP._stationIdxAtLaunch = startIdx;
            LP._currentStation = stations[a];
            LP._reviewMode = false;
            const last = ua[ua.length - 1];
            clear(last.tier, last.level, [8]);
            LP.invalidateProgress();
            const origLaunch = LP.launchGame;
            LP.launchGame = function () { };      // 這一輪只驗晉升，不再派新局
            try { LP.advanceAfterWin(8); } finally { LP.launchGame = origLaunch; }
        } finally {
            LP.showPromotionPopup = origPopup;
            LP._makePopup = origMake;
            LP.playPromotionCelebration = origCeleb;
            LP.scrollToCurrent = origScroll;
        }

        const endIdx = LP.getCurrentStationIndex();
        check(endIdx > startIdx + 1, '劇本C',
            '這一局確實跨過了不只一站（' + startIdx + ' → ' + endIdx + '）',
            '沒跨站就驗不到這個情境；題庫或站點配置可能已變');
        const expect = [];
        for (let i = startIdx + 1; i <= endIdx; i++) expect.push(stations[i].name);
        check(JSON.stringify(seen) === JSON.stringify(expect), '劇本C',
            '跨過的每一站都依序演出晉升彈窗',
            '實際：' + seen.join(' → ') + '\n       → 應為：' + expect.join(' → ')
            + '\n       → 只演最後一站，就是玩家回報的「中間那一站的獎勵與提示被吃掉」');
    })();

    // ── C-2 考試站的結構性保證：詩學再多也跨不過去 ────────────────────
    (function () {
        const stations = PS.build();
        const firstExam = stations.findIndex(s2 => !!s2.examKind);
        env.resetSave();
        const units = PS.getPoemUnits();
        // 把「遠遠超過」該站的詩全部學完（模擬玩家在自由練習裡亂打一通）
        const far = Math.min(units.length, stations[firstExam].poemTo + 40);
        for (let i = 0; i < far; i++) {
            units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        LP.invalidateProgress();
        check(LP.getCurrentStationIndex() === firstExam, '劇本C',
            '就算多學了 ' + (far - stations[firstExam].poemTo) + ' 首詩，站點仍被壓在第 '
            + firstExam + ' 站「' + stations[firstExam].name + '」（'
            + (stations[firstExam].examKind === 'rank' ? '文位考' : '小考') + '）',
            '實際第 ' + LP.getCurrentStationIndex() + ' 站；考試關卡失效，'
            + '玩家可以完全不考試就一路走到大儒（改版前正是如此）');
        check(PS.getCurrentIndex(LP.getPathPoemCount()) > firstExam, '劇本C',
            '（對照）純看詩詞數的話本來會走到第 ' + PS.getCurrentIndex(LP.getPathPoemCount()) + ' 站',
            '這個對照組沒成立就代表題庫不夠遠，上面那一條驗不到東西');
    })();


    // ── 劇本 D：捐納跳關補完一站 ─────────────────────────────────────
    console.log('\n▍劇本 D：捐納跳關剛好補完一站（不經過任何晉升彈窗）');
    (function () {
        const stations = PS.build();
        env.resetSave();
        const st = stations[0];
        const coll = CS.load(); coll.silver = 999999; CS.save(coll);
        st.units.forEach(u => SM.markLevelDonated(u.tier, u.level));
        LP.invalidateProgress();
        const idx = LP.getCurrentStationIndex();
        check(idx >= 1, '劇本D', '捐納補完第 0 站後站點前進到 ' + idx, '');
        const before = CS.load().silver;
        const gained = LP.settleArrivedRewards();
        const claimed = ((SM.loadPlayerData().achievements || {}).claimed) || [];
        check(claimed.indexOf(stations[1].type === 'grade'
            ? 'lpgrade_' + stations[1].name : 'rank_' + stations[1].name) >= 0, '劇本D',
            '「' + stations[1].name + '」的晉升文錢已補發',
            '沒有晉升彈窗的路徑（捐納、自由練習、過關後直接離開）過去會永遠拿不到這筆錢');
        check(CS.load().silver === before + gained, '劇本D', '補發金額與帳面一致', '');
        check(LP.settleArrivedRewards() === 0, '劇本D', '重複呼叫不會重複發放（冪等）',
            '冪等失效會讓玩家靠反覆開關青雲梯刷文錢');
    })();

    // ── 劇本 G：完全不考試 —— 必須卡在第一個應試文位站 ────────────────
    // 這是「考試擋路」的正向驗收（作者 2026-09-05 定案）。
    // 改版前這個劇本可以一路走到大儒，文位卻始終停在「蒙童」。
    console.log('\n▍劇本 G：每局都贏但一場考試都不考 —— 應該卡在第一個應試文位站');
    (function () {
        const stationsG = PS.build();
        // ⚠️ 2026-09-06 起第一個關卡站不一定是文位站 —— 小考也是硬性關卡，
        //    而且第一場小考通常出現在第一個應試文位之前。
        const firstExamIdx = stationsG.findIndex(s2 => !!s2.examKind);
        const firstExam = stationsG[firstExamIdx];
        const G = runScenario({ seed: 7007, takeExams: false, maxTurns: 20 });
        check(G.finalIdx === firstExamIdx, '劇本G',
            '停在第 ' + firstExamIdx + ' 站「' + firstExam.name + '」（'
            + (firstExam.examKind === 'rank' ? '文位考' : '小考') + '擋路）',
            '實際停在第 ' + G.finalIdx + ' 站「' + (stationsG[G.finalIdx] || {}).name + '」'
            + '；越過了就代表沒考試也能繼續修課');
        const allRanks = PS.getAllRankNames();
        const rankNow = SM.getEffectiveRank(SM.loadPlayerData());
        check(allRanks.indexOf(rankNow) <= allRanks.indexOf(firstExam.rankName), '劇本G',
            '文位沒有越過關卡站所屬的文位（目前「' + rankNow + '」）', '');
        check(LP.getStationExamProgress(firstExam).ok === true, '劇本G',
            '該站課程已修畢、應試資格已成立（只差沒去考）', '');
        console.log('    共 ' + G.plays.length + ' 局，停在「' + stationsG[G.finalIdx].name
            + '」，文位「' + rankNow + '」');
    })();

    // ── 劇本 F：完整生涯 —— 一位玩家從「書僮」走到「大儒」──────────────
    // 這是整支驗證程式的旗艦劇本：不是抽樣、不是片段，而是把一位玩家
    // 從全新存檔開始的**每一站、每一場考試**都真的走過一遍。
    console.log('\n▍劇本 F：完整生涯 —— 從「書僮」逐站打到「大儒」，每個文位落榜 '
        + (EXAM_ATTEMPTS - 1) + ' 次後通過（共 ' + (13 * EXAM_ATTEMPTS) + ' 場考試）');
    const F = runScenario({ seed: 6006, takeExams: true, examAttempts: EXAM_ATTEMPTS });
    (function () {
        const stations = PS.build();
        const last = stations.length - 1;
        check(F.finalIdx === last, '劇本F',
            '走到最後一站「' + stations[last].name + '」（第 ' + F.finalIdx + ' 站）',
            '停在第 ' + F.finalIdx + ' 站「' + (stations[F.finalIdx] || {}).name + '」');

        // ① 13 場考試全部考過，而且只考一次
        const examRanks = PS.getExamRankNames();
        const passed = (CS.load().ranks || {}).passed || [];
        const missed = examRanks.filter(r => passed.indexOf(r) < 0);
        check(missed.length === 0, '劇本F', '需應試的 ' + examRanks.length + ' 個文位全部通過考試',
            '沒考過：' + missed.join('、'));
        const wrongCount = examRanks.filter(r => F.exams.filter(e => e.rank === r).length !== EXAM_ATTEMPTS);
        check(wrongCount.length === 0, '劇本F',
            '每個文位考都考了 ' + EXAM_ATTEMPTS + ' 次（前 ' + (EXAM_ATTEMPTS - 1) + ' 次落榜）',
            '次數不符：' + wrongCount.map(r => r + '×' + F.exams.filter(e => e.rank === r).length).join('、'));
        const dupPass = examRanks.filter(r => F.exams.filter(e => e.rank === r && e.passed).length !== 1);
        check(dupPass.length === 0, '劇本F', '每個文位只通過一次', '通過次數不符：' + dupPass.join('、'));

        // 小考：每一場都考過，而且一場都沒被跳過
        const minorStations = stations.filter(x => x.examKind === 'minor');
        const minorPassed = ((CS.load().exams || {}).minorPassed) || [];
        const missMinor = minorStations.filter(x => minorPassed.indexOf(x.name) < 0).map(x => x.name);
        check(missMinor.length === 0, '劇本F',
            '全部 ' + minorStations.length + ' 場小考都通過了', '沒考過：' + missMinor.join('、'));
        // ★ 小考絕不可以寫進文位
        const rankPassed = (CS.load().ranks || {}).passed || [];
        const leaked = minorStations.filter(x => rankPassed.indexOf(x.name) >= 0).map(x => x.name);
        check(leaked.length === 0, '劇本F', '小考沒有被誤寫進 ranks.passed（小考不給文位）',
            '被誤寫：' + leaked.join('、'));

        // ② 文位最終等於最後一個文位
        const allRanks = PS.getAllRankNames();
        const finalRank = SM.getEffectiveRank(SM.loadPlayerData());
        check(finalRank === allRanks[allRanks.length - 1], '劇本F',
            '最終文位為「' + allRanks[allRanks.length - 1] + '」', '實際「' + finalRank + '」');

        // ③ 文位是依序取得的：每一場考試通過後的文位必須恰好是那一個
        const order = F.ranks.map(x => x.rank);
        check(JSON.stringify(order) === JSON.stringify(examRanks), '劇本F',
            '文位依序晉升，沒有跳級也沒有倒退',
            '實際：' + order.join(' → ') + '\n       → 應為：' + examRanks.join(' → '));

        // ④ 詩詞全部學會
        const totalPoems = PS.getTotalPoems();
        check(LP.getPathPoemCount() === totalPoems, '劇本F',
            '依學習順序連續學會全部 ' + totalPoems + ' 首詩',
            '實際 ' + LP.getPathPoemCount() + ' 首');
        check(LP.getLearnedPoemCount() === totalPoems, '劇本F',
            '已學詩詞總數 = ' + totalPoems + ' 首', '實際 ' + LP.getLearnedPoemCount() + ' 首');

        // ⑤ 每一站的晉升獎勵旗標都齊全（小站 + 免考文位 + 應試文位）
        const claimed = ((SM.loadPlayerData().achievements || {}).claimed) || [];
        const noFlag = [];
        stations.forEach((st, i) => {
            if (i === 0) return;                       // 書僮是起點站，不發獎
            const id = st.type === 'grade' ? ('lpgrade_' + st.name) : ('rank_' + st.name);
            if (claimed.indexOf(id) < 0) noFlag.push(st.name);
        });
        check(noFlag.length === 0, '劇本F', '全部 ' + (stations.length - 1) + ' 站的晉升獎勵都已發放',
            '漏發：' + noFlag.join('、'));
        const dupFlag = claimed.filter((x, i) => claimed.indexOf(x) !== i);
        check(dupFlag.length === 0, '劇本F', '沒有任何一站的獎勵被發兩次', '重複：' + dupFlag.join('、'));

        // ⑥ 累計局數：只增不減，而且等於「非溫習的勝場數」
        // ⚠️ 比的是「實際過關次數」而不是 log.plays 的長度：某一款遊戲在某一關
        //    出不了題時，launchGame 會自動改派另一款，log.plays 會多記一筆派局
        //    但那一局並沒有過關。
        check(F.pathRounds === (F.wins || 0), '劇本F',
            '累計局數 ' + F.pathRounds.toLocaleString() + ' = 實際過關次數 ' + (F.wins || 0).toLocaleString(),
            '兩者不符代表 pathRounds 的累計時機有問題');

        // ⑥b 考試擋路：全程不曾在「該考的試還沒考過」時越過那一站
        const gateViolations = [];
        F.idxTrail.forEach(function (i2) {
            const seen = F.ranks.filter(x => x.station < i2).map(x => x.rank);
            for (let k = 0; k < i2 && k < stations.length; k++) {
                const st2 = stations[k];
                if (st2.type === 'rank' && st2.isExam && seen.indexOf(st2.name) < 0) {
                    if (gateViolations.indexOf(st2.name) < 0) gateViolations.push(st2.name);
                }
            }
        });
        check(gateViolations.length === 0, '劇本F',
            '全程沒有在「考試未通過」時越過任何應試文位站',
            '越過了：' + gateViolations.join('、') + '（考試關卡失效）');

        // ⑥c 覆蓋率：每一個文位站與每一個小站都必須被實際走過
        const visited = {};
        F.plays.forEach(p => { if (p.station) visited[p.station] = true; });
        F.promos.forEach(p => { visited[p.name] = true; });
        const rankMissed = stations.filter(x => x.type === 'rank' && !visited[x.name]).map(x => x.name);
        const gradeMissed = stations.filter(x => x.type === 'grade' && !visited[x.name]).map(x => x.name);
        check(rankMissed.length === 0, '劇本F',
            '全部 ' + stations.filter(x => x.type === 'rank').length + ' 個文位站都走過',
            '沒走到：' + rankMissed.join('、'));
        check(gradeMissed.length === 0, '劇本F',
            '全部 ' + stations.filter(x => x.type === 'grade').length + ' 個小站都走過',
            '沒走到：' + gradeMissed.join('、'));

        // ⑥d 落榜與通過都要發生過，且落榜不得冊封
        const failed = F.exams.filter(e => !e.passed);
        const passedEx = F.exams.filter(e => e.passed);
        const minorCount = stations.filter(x => x.examKind === 'minor').length;
        check(failed.length === 13 * (EXAM_ATTEMPTS - 1), '劇本F',
            '落榜 ' + failed.length + ' 場（每個**文位考** ' + (EXAM_ATTEMPTS - 1) + ' 次；小考不刻意落榜）',
            '實際 ' + failed.length + ' 場');
        check(passedEx.length === 13 + minorCount, '劇本F',
            '通過 ' + (13 + minorCount) + ' 場（文位考 13 ＋ 小考 ' + minorCount + '）',
            '實際 ' + passedEx.length + ' 場');
        check(failed.every(e => e.gained === 0), '劇本F', '落榜一律不發文位獎勵', '');

        // ⑥e 獎狀（慶祝動畫）：免考文位抵達時放、應試文位考過時放
        const celebNames = {};
        F.celebrations.forEach(c => { celebNames[c.name] = true; });
        const freeRanks = PS.getFreeRankNames().slice(1);   // 書僮是起點站，不發獎
        const noCert = freeRanks.filter(r => !celebNames[r]);
        check(noCert.length === 0, '劇本F',
            '免考文位（' + freeRanks.join('、') + '）抵達時播放了獎狀動畫',
            '沒播到：' + noCert.join('、'));

        // 應試文位：**通過考試**時才播獎狀，而且必須被判定成「考試剛通過」
        const examCerts = F.celebrations.filter(c => c.isExamPass);
        const examCertNames = examCerts.map(c => c.name);
        const missCert = examRanks.filter(r => examCertNames.indexOf(r) < 0);
        check(missCert.length === 0, '劇本F',
            '13 個應試文位通過考試時都播放了獎狀動畫', '沒播到：' + missCert.join('、'));
        check(examCerts.length === 13, '劇本F',
            '獎狀動畫剛好 13 張（落榜 ' + F.exams.filter(e => !e.passed).length
            + ' 場與 ' + minorCount + ' 場小考都不發）',
            '實際 ' + examCerts.length + ' 張；落榜或小考也發獎狀＝考試形同虛設');

        // ⑦ 每一款課程遊戲都真的被派出過（設定表沒有死角）
        const used = {};
        F.plays.forEach(p => { used[p.game] = (used[p.game] || 0) + 1; });
        const never = COURSE_GAMES.filter(g => !used[g]);
        check(never.length === 0, '劇本F', '全部 ' + COURSE_GAMES.length + ' 款課程遊戲都被派出過',
            '從未被派出：' + never.map(g => 'game' + g + '（' + (NAMES[g] || '') + '）').join('、')
            + '\n       → 檢查 GAME_UNLOCK 有沒有解鎖它、GAME_CHANNELS 有沒有登記通道');

        assertInvariants('劇本F', F, {});
        console.log('    共 ' + F.plays.length.toLocaleString() + ' 局、' + F.promos.length
            + ' 次晉升、' + F.exams.length + ' 場考試（落榜 ' + F.exams.filter(e => !e.passed).length
            + '）　最終文位：' + finalRank);
        if (F.silverLow.length) {
            console.log('    ⚠ 有 ' + F.silverLow.length + ' 場考試在模擬環境下付不出報名費，'
                + '共補了 ' + F.toppedUp.toLocaleString() + ' 文錢才走得完'
                + '（模擬沒有「玩遊戲賺文錢」與「江南小院」兩條收入，詳見第 8 節）');
        }
        console.log('    遊戲分布：' + COURSE_GAMES.map(g => 'G' + g + ':' + (used[g] || 0)).join('　'));
    })();

    // ── 劇本 H：越級考試 —— 不修課，逐場依序把考試考過去 ───────────────
    // ⚠️ 2026-09-06 改版：越級不再是「一口氣跳到某個文位」。
    //    越級省掉的是**修課**，不是**考試** —— 每一場（含小考）都要親自考過，
    //    而且必須依序。舊版可以從書僮直接報考進士，等於用錢買掉中間十幾場驗收。
    console.log('\n▍劇本 H：越級考試 —— 完全不修課，逐場依序考到「探花」');
    (function () {
        env.resetSave();
        const stations = PS.build();
        const c0 = CS.load(); c0.silver = 99999999; CS.save(c0);
        const log = { exams: [], silverLow: [], toppedUp: 0, celebrations: [], events: [] };

        // ① 選單一次只開放一場，而且是「下一個沒通過的考試站」
        let menu = EC.getSkipMenu();
        const examStations = stations.filter(x => x.examKind);
        check(menu.length === examStations.length, '劇本H',
            '越級選單列出全部 ' + examStations.length + ' 場考試（含小考）',
            '實際 ' + menu.length + ' 項');
        check(menu.filter(m => m.enabled).length === 1, '劇本H',
            '同一時間只有一場可以應考（必須依序）',
            '可點的有 ' + menu.filter(m => m.enabled).length + ' 項');
        check(menu[0].enabled && menu[0].name === examStations[0].name, '劇本H',
            '可應考的是第一場「' + examStations[0].name + '」', '');

        // ② 想跳著考會被擋下來
        const far = menu.filter(m => !m.enabled)[3];
        let blocked = true;
        const origStart = global.ExamEngine.start;
        global.ExamEngine.start = function () { blocked = false; };
        const origToast = LP.toast; LP.toast = function () { };
        try { LP.startSkipExam(far.name); } finally {
            global.ExamEngine.start = origStart; LP.toast = origToast;
        }
        check(blocked, '劇本H', '想直接跳考「' + far.name + '」會被擋下（須依序應考）',
            '跳考成功＝越級可以買掉中間所有驗收');

        // ③ 一場一場考過去，直到「探花」
        const stopAt = stations.findIndex(x => x.type === 'rank' && x.name === '探花');
        let guard = 0;
        while (guard++ < 60) {
            menu = EC.getSkipMenu();
            const nextOne = menu.filter(m => m.enabled)[0];
            if (!nextOne) break;
            const r = sitExam(nextOne.name, 'skip', true, log);
            if (!r.passed) { fail('劇本H', '越級考「' + nextOne.name + '」未通過', ''); break; }
            LP.invalidateProgress();
            const st = PS.getStationByName(nextOne.name);
            if (stations.indexOf(st) >= stopAt) break;
        }
        LP.invalidateProgress();
        check(SM.getEffectiveRank(SM.loadPlayerData()) === '探花', '劇本H',
            '逐場越級之後文位為「探花」',
            '實際「' + SM.getEffectiveRank(SM.loadPlayerData()) + '」');
        check(LP.getCurrentStationIndex() > stopAt, '劇本H',
            '站點越過「探花」站（第 ' + stopAt + ' 站），實際第 ' + LP.getCurrentStationIndex() + ' 站',
            '沿途課程沒有被標記為視同修畢，越級等於白花錢');

        // ④ 沿途課程用捐納標記，不可偽造 levelCleared
        const lc = SM.loadPlayerData().levelCleared || {};
        const faked = Object.keys(lc).filter(k => Object.keys(lc[k] || {})
            .some(t => (lc[k][t] || []).length));
        check(faked.length === 0, '劇本H', '沒有偽造 levelCleared（改用 markLevelDonated）',
            '被偽造的遊戲：' + faked.join('、'));

        // ⑤ 沿途每一站的晉升獎勵都補發了
        const claimed = ((SM.loadPlayerData().achievements || {}).claimed) || [];
        const miss = [];
        for (let i = 1; i <= stopAt; i++) {
            const st2 = stations[i];
            const id = st2.type === 'grade' ? ('lpgrade_' + st2.name) : ('rank_' + st2.name);
            if (claimed.indexOf(id) < 0) miss.push(st2.name);
        }
        check(miss.length === 0, '劇本H', '沿途 ' + stopAt + ' 站的晉升獎勵全部補發',
            '漏發：' + miss.join('、'));

        console.log('    逐場越級 ' + log.exams.length + ' 場（文位考 '
            + log.exams.filter(e => e.kind === 'rank').length + '、小考 '
            + log.exams.filter(e => e.kind === 'minor').length + '）→ 文位「'
            + SM.getEffectiveRank(SM.loadPlayerData()) + '」');
    })();

    // ── 劇本 E：某款遊戲在這一關出不了題 ─────────────────────────────
    console.log('\n▍劇本 E：被派到的遊戲出不了題，青雲梯必須自動改派別款');
    (function () {
        const before = results.fail.length;
        // ⚠️ 停在「第一個考試站」之前：這個劇本不考試（takeExams 預設 false），
        //    停點若設在考試站之後，關卡會把玩家壓住而永遠走不到，
        //    迴圈只能空轉到 maxTurns 為止（實測會跑掉好幾分鐘）。
        const firstExamE = PS.build().findIndex(x => !!x.examKind);
        const E = runScenario({
            seed: 5005, stopAtIdx: Math.max(1, firstExamE), maxTurns: 60,
            failToLoad: [COURSE_GAMES[0]]
        });
        const usedBad = E.plays.filter(p => p.game === COURSE_GAMES[0]).length;
        check(E.finalIdx >= 1, '劇本E',
            '就算 game' + COURSE_GAMES[0] + ' 完全出不了題，玩家仍然走得動（走到站 ' + E.finalIdx + '）',
            '卡住代表 launchGame 的自動換遊戲安全網失效');
        check(E.errors.length === 0, '劇本E', '換遊戲過程沒有違反出題規則', E.errors.join('；'));
        if (results.fail.length === before) {
            console.log('    game' + COURSE_GAMES[0] + ' 被派出 ' + usedBad
                + ' 次全部出不了題，青雲梯留下 ' + (E.warns || []).length + ' 則警告並全部自動改派成功');
        }
    })();
}

// ══════════════════════════════════════════════════════════════════════
//  第 5 節　考試與越級考試
// ══════════════════════════════════════════════════════════════════════
function verifyExam() {
    section('第 6 節　考試與越級考試');
    if (!EC || !CS) { warn('考試', '考試模組未載入，略過'); return; }

    const stations = PS.build();
    const examRanks = PS.getExamRankNames();
    const firstExam = examRanks[0];

    // 5.1 ★ 升等三階段的時序（作者 2026-09-05 定案）
    //     ① 抵達文位站      ＝ 入學，**還沒有**應試資格
    //     ② 修完文位站課程  ＝ 取得應試資格
    //     ③ 通過考試        ＝ 冊封，並解除考試關卡、得以續修下一階
    const units = PS.getPoemUnits();
    const examStIdx = stations.findIndex(s => s.type === 'rank' && s.name === firstExam);
    const examSt = stations[examStIdx];
    const freeNames = PS.getFreeRankNames();
    const lastFree = freeNames[freeNames.length - 1];

    // ── 階段①：剛抵達文位站 ──
    env.resetSave();
    for (let i = 0; i < examSt.poemFrom; i++) {
        units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
    }
    passExamsBefore(examStIdx);
    check(LP.getCurrentStationIndex() === examStIdx, '升等時序①',
        '學完 ' + examSt.poemFrom + ' 首後抵達「' + firstExam + '」站（入學）',
        '實際站 ' + LP.getCurrentStationIndex());
    check(LP.getRankExamProgress(firstExam).ok === false, '升等時序①',
        '剛入學時**尚未**取得「' + firstExam + '」應試資格',
        '抵達即給資格＝玩家會被叫去考一份含 ' + (examSt.poemTo - examSt.poemFrom)
        + ' 首沒學過的詩的考卷（這一站自己的課程還沒修）');
    check(SM.getEffectiveRank(SM.loadPlayerData()) === lastFree, '升等時序①',
        '尚未應試時文位封頂在最後一個免考文位「' + lastFree + '」',
        '實際 ' + SM.getEffectiveRank(SM.loadPlayerData()) + '；走到站就給文位＝考試制度整個失效');

    // ── 階段②：修完文位站自己的課程 ──
    examSt.units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
    LP.invalidateProgress();
    check(LP.getRankExamProgress(firstExam).ok === true, '升等時序②',
        '修完「' + firstExam + '」站的 ' + examSt.units.length + ' 個必通關卡後取得應試資格', '');
    check(LP.getCurrentStationIndex() === examStIdx, '升等時序②',
        '課程修畢但尚未中式，站點仍停在「' + firstExam + '」（考試擋路）',
        '實際站 ' + LP.getCurrentStationIndex() + '；沒考過就能續修下一階＝考試不擋路');
    const gs = LP.getExamGateState();
    check(gs.blocked && gs.qualified && gs.station && gs.station.name === firstExam,
        '升等時序②', 'getExamGateState() 回報「卡在' + firstExam + '、已具資格」',
        JSON.stringify({ blocked: gs.blocked, qualified: gs.qualified, station: gs.station && gs.station.name }));
    check(SM.getEffectiveRank(SM.loadPlayerData()) === lastFree, '升等時序②',
        '課程修畢但還沒考，文位仍是「' + lastFree + '」', '修完課就給文位＝考試形同虛設');

    // 就算再多學十首詩，也不得越過這道關卡
    for (let i = examSt.poemTo; i < Math.min(examSt.poemTo + 10, units.length); i++) {
        units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
    }
    LP.invalidateProgress();
    check(LP.getCurrentStationIndex() === examStIdx, '升等時序②',
        '再多學 10 首詩仍然停在「' + firstExam + '」（考試是硬性關卡）',
        '實際站 ' + LP.getCurrentStationIndex());

    // ── 階段③：通過考試 ──
    (function () {
        const c = CS.load();
        c.ranks = { passed: [firstExam] };
        CS.save(c);
        LP.invalidateProgress();
        check(SM.getEffectiveRank(SM.loadPlayerData()) === firstExam, '升等時序③',
            '通過考試後文位變成「' + firstExam + '」', '');
        check(LP.getCurrentStationIndex() > examStIdx, '升等時序③',
            '通過考試後關卡解除，站點得以前進（第 ' + LP.getCurrentStationIndex() + ' 站）',
            '仍停在第 ' + LP.getCurrentStationIndex() + ' 站');
    })();

    // 5.1b 考卷範圍必須全部落在「取得資格時已經學過」的詩裡
    (function () {
        const bad = [];
        examRanks.forEach(r => {
            const stI = stations.findIndex(x => x.type === 'rank' && x.name === r);
            if (stI < 0) return;
            const learned = PS.getPoemUnits().slice(0, stations[stI].poemTo).map(x => x.id);
            const plan = EC.getPlan(r, false);
            if (!plan) return;
            const unseen = plan.poemIds.filter(id => learned.indexOf(id) < 0);
            if (unseen.length) bad.push(r + '（' + unseen.length + ' 首）');
        });
        check(bad.length === 0, '考試範圍',
            '每一場考試都只考「取得資格時已經修習過」的詩',
            '仍有沒學過的：' + bad.join('、')
            + '\n       → 資格看的是文位站的 poemTo，範圍看的是 getScopeStations()，兩者必須吻合');
    })();

    // 5.2 文位獎勵冪等：呼叫兩次只會發一次
    env.resetSave();
    for (let i = 0; i < examSt.poemTo; i++) {
        units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
    }
    passExamsBefore(examStIdx);
    const before = CS.load().silver;
    const first = LP.grantPromotionSilver('rank', firstExam, PS.getRankSilver(firstExam));
    const second = LP.grantPromotionSilver('rank', firstExam, PS.getRankSilver(firstExam));
    check(first === PS.getRankSilver(firstExam), '考試獎勵',
        '通過考試發放「' + firstExam + '」文錢 ' + first + ' 枚', '');
    check(second === 0, '考試獎勵', '重複發放被冪等擋下', '會讓玩家反覆考試刷文錢');
    check(CS.load().silver === before + first, '考試獎勵', '帳面金額正確', '');

    // 5.3 冪等旗標與成就頁共用：rank_X 一旦被誤寫進 claimed，晉升文錢就永遠領不到
    const data = SM.loadPlayerData();
    check((data.achievements.claimed || []).filter(x => x === 'rank_' + firstExam).length === 1,
        '考試獎勵', 'claimed 中 rank_' + firstExam + ' 只有一筆', '重複寫入代表冪等判斷有漏');

    // 5.4 越級考試：沿途站點與文位一併補發
    env.resetSave();
    const target = examRanks[Math.min(2, examRanks.length - 1)];
    const targetIdx = stations.findIndex(s => s.type === 'rank' && s.name === target);
    const coll = CS.load();
    coll.ranks = { passed: examRanks.slice(0, examRanks.indexOf(target) + 1) };
    CS.save(coll);
    const silverBefore = CS.load().silver;
    let backfill = 0;
    for (let i = 0; i <= targetIdx; i++) backfill += LP.grantStationReward(stations[i], true) || 0;
    check(backfill > 0, '越級考試', '沿途站點獎勵補發 ' + backfill + ' 文錢',
        '第二個參數 includeExamRanks 必須傳 true，否則沿途應試文位站的獎勵永遠拿不到');
    check(CS.load().silver === silverBefore + backfill, '越級考試', '補發金額與帳面一致', '');
    let again = 0;
    for (let i = 0; i <= targetIdx; i++) again += LP.grantStationReward(stations[i], true) || 0;
    check(again === 0, '越級考試', '補發是冪等的，不會重複給', '');

    // 5.5 應試站在「平常抵達」時不得發獎（includeExamRanks 不傳）
    env.resetSave();
    check(LP.grantStationReward(examSt) === 0, '考試獎勵',
        '平常抵達應試文位站「' + firstExam + '」不發文錢',
        '抵達只代表取得應試資格，通過考試才算晉升');

    // 5.6 考試題目數與及格線設定齊全
    examRanks.forEach(r => {
        const rule = (typeof EC.getExamRule === 'function') ? EC.getExamRule(r) : null;
        if (!check(rule && typeof rule.perPoem === 'number', '考試設定',
            '文位「' + r + '」有每首詩題數設定', 'getExamRule 回傳不完整')) return;
        // ⚠️ 及格比例一定要用分數陣列 [分子, 分母]，不可以寫成 0.67 這種小數
        //    （24 題 × 0.67 無條件進位會變成 17 題，比 2/3 的 16 題多要一題）
        check(Array.isArray(rule.pass) && rule.pass.length === 2
            && rule.pass[0] > 0 && rule.pass[1] > 0 && rule.pass[0] <= rule.pass[1],
            '考試設定', '文位「' + r + '」的及格比例是合法分數 '
            + (Array.isArray(rule.pass) ? rule.pass.join('/') : String(rule.pass)),
            '必須寫成 [分子, 分母]；寫成小數會因為無條件進位而多要一題');
        check(EC.isExamRank(r) === true, '考試設定',
            '文位「' + r + '」被判定為需要應試',
            'PathStations 說它要考、FMExamConfig 卻說不用，兩邊對不上');
    });
    // 反向：免考文位不可以被判定成要考試
    PS.getFreeRankNames().forEach(r => {
        check(EC.isExamRank(r) === false, '考試設定',
            '免考文位「' + r + '」不會被要求應試', '');
    });

    // 5.7 考試規格合理性：題數、及格線、範圍
    examRanks.forEach(r => {
        const plan = EC.getPlan(r, false);
        if (!check(plan && plan.totalQuestions > 0, '考試規格',
            '文位「' + r + '」排得出考卷', '')) return;
        check(plan.passCount > 0 && plan.passCount <= plan.totalQuestions, '考試規格',
            '「' + r + '」及格線 ' + plan.passCount + ' / ' + plan.totalQuestions + ' 題合理',
            '及格線不可以是 0，也不可以超過總題數');
        check(plan.poemIds.length > 0, '考試規格', '「' + r + '」的考試範圍有詩',
            '範圍是空的，考卷會排不出來');
        const skipPlan = EC.getPlan(r, true);
        check(skipPlan && skipPlan.passCount >= plan.passCount, '考試規格',
            '「' + r + '」越級考的及格線不低於正式考（' + (skipPlan ? skipPlan.passCount : '?')
            + ' ≥ ' + plan.passCount + '）', '越級應該更嚴，不是更鬆');
    });

    // 5.8 沙箱：考試局絕對不能污染青雲梯進度（企畫書 §6.5）
    (function () {
        env.resetSave();
        const units2 = PS.getPoemUnits();
        const exIdx = stations.findIndex(s2 => s2.type === 'rank' && s2.isExam);
        // ⚠️ 要修完該文位站**自己的**課程（poemTo）才有應試資格，不是抵達（poemFrom）
        for (let i = 0; i < stations[exIdx].poemTo; i++) {
            units2[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        passExamsBefore(exIdx);
        const rank = stations[exIdx].name;
        const roundsBefore = LP.getPathRounds();
        const poemsBefore = LP.getPathPoemCount();
        const clearedBefore = JSON.stringify(SM.loadPlayerData().levelCleared);

        const r = sitExam(rank, 'real', true, null);
        check(r.sandboxOk, '考試沙箱', '考試中的每一局都不會推進青雲梯進度',
            r.sandboxWhy || '' + '（企畫書 §6.5：考試是驗收不是練習）');
        check(r.restoreOk, '考試沙箱', '考完之後被覆寫的函式全部還原', r.restoreWhy || '');
        LP.invalidateProgress();
        check(LP.getPathRounds() === roundsBefore, '考試沙箱',
            '整場考試沒有增加累計局數（' + roundsBefore + '）', '實際 ' + LP.getPathRounds());
        // ⚠️ 站點索引**會**因為「考試通過→關卡解除」而前進，那是正確的；
        //    要驗的是「考試中的那幾局沒有推進課程進度」，因此比對的是
        //    已學詩詞數與通關紀錄，不是站點索引。
        //    （站點在考試期間有沒有被推進，由 sitExam 在沙箱內就地檢查。）
        check(LP.getPathPoemCount() === poemsBefore, '考試沙箱',
            '整場考試沒有推進課程進度（' + poemsBefore + ' 首）',
            '實際 ' + LP.getPathPoemCount() + ' 首');
        check(JSON.stringify(SM.loadPlayerData().levelCleared) === clearedBefore, '考試沙箱',
            '整場考試沒有寫入任何通關紀錄', 'levelCleared 被考試局污染了');
        check(r.passed && r.gained === PS.getRankSilver(rank), '考試獎勵',
            '通過「' + rank + '」發放 ' + PS.getRankSilver(rank) + ' 文錢', '實際 ' + r.gained);
        check(Math.abs(r.feePaid - r.expectFee) < 1, '考試報名費',
            '正式考「' + rank + '」收取報名費 ' + r.expectFee + ' 文錢', '實際扣了 ' + r.feePaid);
    })();

    // 5.9 落榜：不冊封、不發獎、報名費不退
    (function () {
        env.resetSave();
        const units2 = PS.getPoemUnits();
        const exIdx = stations.findIndex(s2 => s2.type === 'rank' && s2.isExam);
        for (let i = 0; i < stations[exIdx].poemTo; i++) {
            units2[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        passExamsBefore(exIdx);
        const rank = stations[exIdx].name;
        const r = sitExam(rank, 'real', false, null);
        check(r.passed === false, '考試落榜', '答對數低於及格線時判定為落榜', '');
        check(r.gained === 0, '考試落榜', '落榜不發文位獎勵', '實際發了 ' + r.gained);
        const passed2 = (CS.load().ranks || {}).passed || [];
        check(passed2.indexOf(rank) < 0, '考試落榜', '落榜不會被冊封「' + rank + '」', '');
        check(SM.getEffectiveRank(SM.loadPlayerData()) !== rank, '考試落榜',
            '落榜後文位仍停在免考文位', '');
        check(Math.abs(r.feePaid - r.expectFee) < 1, '考試落榜',
            '落榜的報名費不予退還（扣了 ' + r.expectFee + '）', '實際 ' + r.feePaid);
        const st2 = CS.load().examStats || {};
        check(st2[rank] && st2[rank].failCount === 1, '考試落榜', '落榜有記入 examStats.failCount', '');
    })();

    // 5.10 模擬考：完全不留痕跡
    (function () {
        env.resetSave();
        const units2 = PS.getPoemUnits();
        const exIdx = stations.findIndex(s2 => s2.type === 'rank' && s2.isExam);
        for (let i = 0; i < stations[exIdx].poemTo; i++) {
            units2[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        passExamsBefore(exIdx);
        const rank = stations[exIdx].name;
        const silverBefore = CS.load().silver || 0;
        const r = sitExam(rank, 'mock', true, null);
        check(r.gained === 0, '模擬考', '模擬考通過不發文位獎勵', '實際發了 ' + r.gained);
        const passed3 = (CS.load().ranks || {}).passed || [];
        check(passed3.indexOf(rank) < 0, '模擬考', '模擬考通過不會冊封文位',
            '模擬考成績列入正式紀錄＝考試制度失效');
        check(r.feePaid === 0 && !(r.ledger || []).some(e => e.source === 'exam_fee'),
            '模擬考', '模擬考不收報名費',
            '流水帳出現 exam_fee：' + JSON.stringify((r.ledger || []).filter(e => e.source === 'exam_fee')));
        // ── 每日次數（作者 2026-09-11 定案：正式不限／模擬 5 次／越級 5 次）──
        const mockLimit = EC.dailyLimit('mock');
        check(mockLimit === 5, '模擬考', '模擬考每日上限為 5 次',
            '目前設定為 ' + mockLimit + '，與定案不符');
        check(EC.canAttemptToday(CS.load(), 'mock', rank) === true, '模擬考',
            '考過一次之後今天還能再考（沒有被舊的「一天一次」擋住）',
            '每日次數沒有改成計次制');
        check(EC.remainingToday(CS.load(), 'mock', rank) === mockLimit - 1, '模擬考',
            '考一次之後剩餘次數正確遞減',
            '剩餘 ' + EC.remainingToday(CS.load(), 'mock', rank) + '，應為 ' + (mockLimit - 1));
        (function () {
            // 用光額度：必須剛好在第 mockLimit 次之後才擋下來
            const c = CS.load();
            for (let i = 1; i < mockLimit; i++) EC.markAttemptToday(c, 'mock', rank);
            CS.save(c);
            check(EC.remainingToday(CS.load(), 'mock', rank) === 0
                && EC.canAttemptToday(CS.load(), 'mock', rank) === false, '模擬考',
                '模擬考用滿 ' + mockLimit + ' 次之後今天不能再考',
                '剩餘 ' + EC.remainingToday(CS.load(), 'mock', rank));
            // 正式考不受每日次數限制（節流只有文錢）
            check(EC.dailyLimit('real') === 0
                && EC.canAttemptToday(CS.load(), 'real', rank) === true, '正式考',
                '正式考不限每日次數', '正式考被加上了每日上限');
            check(EC.dailyLimit('skip') === 5, '越級考', '越級考試每日上限為 5 次',
                '目前設定為 ' + EC.dailyLimit('skip'));
            // 舊存檔相容：一天一次時代存的是日期字串，應視為「今天已考 1 次」
            const c2 = CS.load();
            c2.examDaily.mock[rank] = EC.today();          // 舊格式
            CS.save(c2);
            check(EC.remainingToday(CS.load(), 'mock', rank) === mockLimit - 1, '模擬考',
                '舊存檔（日期字串）相容：視為今天已考 1 次',
                '實際剩餘 ' + EC.remainingToday(CS.load(), 'mock', rank));
            const c3 = CS.load();
            c3.examDaily.mock[rank] = '2000-01-01';        // 舊格式、但不是今天
            CS.save(c3);
            check(EC.remainingToday(CS.load(), 'mock', rank) === mockLimit, '模擬考',
                '舊存檔若不是今天，額度完整回復',
                '實際剩餘 ' + EC.remainingToday(CS.load(), 'mock', rank));
        })();
    })();

    // 5.11 越級考試：必須依序，不能跳場（完整的端到端驗收在劇本 H）
    (function () {
        env.resetSave();
        const c = CS.load(); c.silver = 9999999; CS.save(c);
        const menu = EC.getSkipMenu();
        const examStations = stations.filter(x => x.examKind);
        check(menu.length === examStations.length, '越級考試',
            '選單列出全部 ' + examStations.length + ' 場考試（含小考）',
            '實際 ' + menu.length + ' 項');
        check(menu.filter(m => m.enabled).length === 1, '越級考試',
            '同一時間只有「下一場」可以應考', '可點的有 ' + menu.filter(m => m.enabled).length + ' 項');
        check(menu[0].enabled, '越級考試', '可應考的是第一場「' + menu[0].name + '」', '');
        const later = menu.filter(m => !m.enabled)[2];
        let started = false;
        const origStart = global.ExamEngine.start;
        global.ExamEngine.start = function () { started = true; };
        const origToast = LP.toast; LP.toast = function () { };
        try { LP.startSkipExam(later.name); } finally {
            global.ExamEngine.start = origStart; LP.toast = origToast;
        }
        check(!started, '越級考試', '想跳過中間場次直接考「' + later.name + '」會被擋下',
            '越級省的是修課，不是考試');
        check(menu.some(m => m.kind === 'minor'), '越級考試', '選單包含小考站', '');
    })();

    // 參考資訊：報名費與文位獎勵的比例（作者定案的節流設計，非錯誤）
    if (VERBOSE) {
        console.log('\n  參考：報名費 / 文位獎勵');
        examRanks.forEach(r => {
            console.log('    ' + r + '　報名費 ' + LP.getExamFee(r).toLocaleString()
                + '　獎勵 ' + PS.getRankSilver(r).toLocaleString());
        });
    }
}

// ══════════════════════════════════════════════════════════════════════
//  第 10 節　破壞性測試：玩家不照企劃規則操作考試
//
//  ── 為什麼要有這一節 ────────────────────────────────────────────────
//  前面幾節驗的是「照著流程走會不會對」。但玩家不會照著走：他會連點兩下
//  考試鈕、會在簡介畫面反悔、會在答題到一半從漢堡選單跑掉、會在別的頁面
//  把文錢花光再回來入場、會對已經考過的文位再點一次。
//  這一節專門驗這些「亂來」的路徑，每一條都對應一個實際找到過的漏洞：
//    · 重入      → 進行中的考試被無聲取代，已付的報名費消失
//    · 重複結算  → examStats／examLog 被寫兩次，考試次數憑空變多
//    · 延後扣款  → 入場當下沒重驗餘額，文錢被扣成負數
//    · 中途離開  → 考試沙箱沒拆，completeLevel 永久停在空函式
//  這些全都不會拋錯、畫面上也看不出來，只能靠機器每次都掃一遍。
// ══════════════════════════════════════════════════════════════════════
function verifyExamAbuse() {
    section('第 10 節　破壞性測試（玩家不照規則操作考試／越級考試）');

    const EE = global.ExamEngine;
    if (!EE || !EC || !CS) {
        warn('破壞性', '考試模組未載入，略過本節');
        return;
    }

    // ── 替身：把需要真畫面的東西換掉，本節結束一律還原 ────────────────
    const saved = {
        launch: EE._launch,
        celeb: LP.playPromotionCelebration,
        scroll: LP.scrollToCurrent,
        show: LP.show,
        queue: LP.showPromotionQueue,
        popup: LP.showPromotionPopup,
        qualified: LP.showExamQualifiedPopup,
        toast: LP.toast
    };
    const toasts = [];
    LP.playPromotionCelebration = (s, v, d) => { if (d) d(); };
    LP.scrollToCurrent = () => { };
    LP.show = () => { };
    LP.showPromotionQueue = () => { };
    LP.showPromotionPopup = (s, n) => { if (n) n(); };
    LP.showExamQualifiedPopup = () => { };
    LP.toast = (m) => { toasts.push(String(m)); };

    /** 把考試引擎徹底歸零（含測試自己塞的殘留欄位） */
    const clearEngine = () => {
        EE.forceStop();
        EE._plan = null; EE._questions = []; EE._qi = 0; EE._correct = 0;
        EE._aborted = false; EE._active = false; EE._finished = false;
        EE._abortReason = '';
    };

    /** 同步把玩家放到第 idx 站，且該站課程已修畢（具應試資格） */
    const seedAt = (idx) => {
        clearEngine();
        env.resetSave();
        const stations = PS.build();
        for (let i = 0; i <= idx && i < stations.length; i++) {
            (stations[i].units || []).forEach(u => SM.markLevelDonated(u.tier, u.level));
        }
        passExamsBefore(idx);
        const c = CS.load(); c.silver = 9999999; CS.save(c);
        LP.invalidateProgress();
        return stations[idx];
    };

    /** 模擬玩家按下「入場應試」（與 examEngine 的 onclick 同一套流程） */
    const enter = () => {
        if (!EE._onEnter) return undefined;
        const fn = EE._onEnter;
        EE._onEnter = null;
        return fn();
    };

    /** 走完整場考試（逐題判定 → 結算） */
    const drive = (win) => {
        EE._launch = function () { this._record(!!win); };
        const total = EE._plan ? EE._plan.totalQuestions : 0;
        let guard = 0;
        while (EE._active && EE._qi < total && guard++ < 500) EE._record(!!win);
        if (EE._active) EE._finish();
    };

    const EXAM_ST = 6;      // 塾生（第一個需應試的文位站）
    let stName = '';

    try {
        {
            const st = seedAt(EXAM_ST);
            stName = st.name;
        }

        // ── 10.1 重入：考試進行中不得再開一場 ──────────────────────────
        {
            seedAt(EXAM_ST);
            const fee = LP.getExamFee(stName);
            const silver0 = CS.load().silver;
            LP.startExam(stName, 'real');
            enter();                                   // 第一場已入場、已扣費
            const modeA = EE._mode, doneA = EE._onDone;

            LP.startExam(stName, 'mock');              // 玩家又點了一次
            check(EE._mode === modeA && EE._onDone === doneA, '破壞性',
                '考試進行中再點考試鈕，進行中的那一場不受影響',
                '正在進行的考試被無聲取代：已扣的報名費拿不回來，'
                + '而且原本的 onDone（演出晉升、回到青雲梯）永遠不會被呼叫');

            LP.startSkipExam(stName);                  // 換成越級再試一次
            check(EE._mode === modeA, '破壞性',
                '考試進行中開越級考試會被拒絕', '進行中的考試被越級考取代');

            // ⚠️ 上面兩條驗的是 learningPath 那一層的擋門。考試引擎自己也必須
            //    擋（防禦兩層）——否則任何繞過 learningPath 的入口（江南小院、
            //    測試熱鍵、未來新增的捷徑）都會直接把進行中的考試吃掉。
            //    這一條刻意**直接呼叫引擎**，不經過 learningPath。
            const reentry = EE.start({ rankName: stName, mode: 'mock' });
            check(reentry === false && EE._mode === modeA, '破壞性',
                'ExamEngine.start() 自己也會拒絕重入',
                '引擎層沒有擋，繞過 learningPath 的入口就能取代進行中的考試');

            check((silver0 - CS.load().silver) === fee, '破壞性',
                '重入被拒時不會重複扣報名費',
                '共扣了 ' + (silver0 - CS.load().silver) + '，應為 ' + fee);
            clearEngine();
        }

        // ── 10.2 已通過的考試不得再報名 ────────────────────────────────
        {
            seedAt(EXAM_ST);
            const c = CS.load();
            if (c.ranks.passed.indexOf(stName) < 0) c.ranks.passed.push(stName);
            CS.save(c);
            LP.invalidateProgress();
            const silver0 = CS.load().silver;
            LP.startExam(stName, 'real');
            check(!EE.isBusy(), '破壞性', '已通過的文位不得再報名正式考',
                '照收報名費卻毫無意義：通過紀錄已經在了，考過也不會再發文位或獎勵');
            check(CS.load().silver === silver0, '破壞性',
                '被拒絕時不得扣報名費', '扣了 ' + (silver0 - CS.load().silver));
            clearEngine();
        }

        // ── 10.3 入場當下餘額不足：拒絕入場、不得扣成負數 ───────────────
        {
            seedAt(EXAM_ST);
            const fee = LP.getExamFee(stName);
            const c0 = CS.load(); c0.silver = fee; CS.save(c0);   // 剛好夠
            LP.startExam(stName, 'real');                          // 通過資格檢查
            const c1 = CS.load(); c1.silver = 0; CS.save(c1);      // 入場前錢被花光
            const okEnter = enter();
            check(okEnter === false, '破壞性', '入場當下餘額不足會被拒絕入場',
                'onEnter 沒有重新驗餘額');
            check((CS.load().silver || 0) >= 0, '破壞性', '文錢不會被扣成負數',
                '餘額 = ' + CS.load().silver);
            clearEngine();
        }

        // ── 10.4 結算冪等：_finish() 重複呼叫不得重複寫紀錄 ─────────────
        {
            seedAt(EXAM_ST);
            LP.startExam(stName, 'real');
            enter();
            drive(true);
            const c1 = CS.load();
            const pass1 = (c1.examStats[stName] || {}).passCount;
            const log1 = c1.examLog.length;
            EE._finish();                                   // 二次結算
            const c2 = CS.load();
            check((c2.examStats[stName] || {}).passCount === pass1
                && c2.examLog.length === log1, '破壞性',
                '重複結算不會重複寫入考試紀錄',
                'passCount ' + pass1 + '→' + (c2.examStats[stName] || {}).passCount
                + '、examLog ' + log1 + '→' + c2.examLog.length);
            check(c2.ranks.passed.filter(x => x === stName).length === 1, '破壞性',
                'ranks.passed 不得出現重複項',
                JSON.stringify(c2.ranks.passed));
            clearEngine();
        }

        // ── 10.5 取消／被清理：不扣費、不耗名額 ────────────────────────
        {
            seedAt(EXAM_ST);
            const s0 = CS.load().silver;
            LP.startExam(stName, 'real');
            EE._aborted = true; EE._finish();               // 「先回家苦讀」
            check(CS.load().silver === s0, '破壞性',
                '在簡介畫面按「先回家苦讀」不扣報名費',
                '玩家還沒入場就被收錢');
            clearEngine();

            seedAt(EXAM_ST);
            LP.startExam(stName, 'mock');
            EE._aborted = true; EE._finish();
            check(EC.canAttemptToday(CS.load(), 'mock', stName), '破壞性',
                '模擬考在簡介畫面取消不耗掉今日名額',
                '玩家按取消卻損失了當天唯一一次模擬考機會');
            clearEngine();

            seedAt(EXAM_ST);
            const s1 = CS.load().silver;
            LP.startExam(stName, 'real');
            EE.forceStop();                                  // 從漢堡選單離開簡介
            check(CS.load().silver === s1, '破壞性',
                '簡介畫面被全域清理時不扣報名費', '');
            clearEngine();
        }

        // ── 10.6 答題中途離開：不得留紀錄、沙箱要拆乾淨、之後一切正常 ──
        {
            seedAt(EXAM_ST);
            LP.startExam(stName, 'real');
            enter();
            EE._launch = function () { this._record(true); };
            EE._record(true); EE._record(true);              // 才答兩題就跑了
            EE.forceStop();

            const c = CS.load();
            check(c.ranks.passed.indexOf(stName) < 0, '破壞性',
                '中途離開不得留下通過紀錄', JSON.stringify(c.ranks.passed));
            check(!EE._active && !EE._sandbox && !EE._patchedGame, '破壞性',
                '中途離開後考試狀態與沙箱全部清乾淨',
                'active=' + EE._active + ' sandbox=' + !!EE._sandbox);
            check(SM.completeLevel === PRISTINE.completeLevel, '破壞性',
                '中途離開後 ScoreManager.completeLevel 已還原',
                '沒還原的話，玩家回到青雲梯打贏任何一局都不會記進度 ——'
                + '站點卡住原地不動、同一課程反覆重派');

            const rounds0 = SM.loadPlayerData().pathRounds || 0;
            SM.completeLevel('game1', '中學', 40);
            check((SM.loadPlayerData().pathRounds || 0) > rounds0, '破壞性',
                '中途離開後課程進度能正常記錄',
                'pathRounds 沒有增加，代表沙箱還卡著');

            LP.startExam(stName, 'real');
            check(EE.isBusy(), '破壞性', '中途離開後還能再開一場新考試',
                '被誤判成「考試進行中」而永遠開不了：' + toasts[toasts.length - 1]);
            clearEngine();
        }

        // ── 10.7 落榜／模擬考不得寫入正式文位 ──────────────────────────
        {
            seedAt(EXAM_ST);
            LP.startExam(stName, 'real');
            enter();
            drive(false);
            check(CS.load().ranks.passed.indexOf(stName) < 0, '破壞性',
                '落榜不得取得文位', JSON.stringify(CS.load().ranks.passed));
            clearEngine();

            seedAt(EXAM_ST);
            LP.startExam(stName, 'mock');
            enter();
            drive(true);
            check(CS.load().ranks.passed.indexOf(stName) < 0, '破壞性',
                '模擬考通過不得寫入正式文位', JSON.stringify(CS.load().ranks.passed));
            clearEngine();
        }

        // ── 10.8 越級考試：跳序與重複應試都要被擋 ──────────────────────
        {
            seedAt(EXAM_ST);
            const s0 = CS.load().silver;
            const stations = PS.build();
            // 找一個「還輪不到」的考試站
            let farName = '';
            for (let i = EXAM_ST + 1; i < stations.length; i++) {
                if (stations[i].examKind) { farName = stations[i].name; break; }
            }
            if (farName) {
                LP.startSkipExam(farName);
                check(!EE.isBusy(), '破壞性',
                    '越級考試不得跳過順序（' + farName + '）',
                    '越級省的是修課，不是考試；跳序等於用錢買掉中間的驗收');
                check(CS.load().silver === s0, '破壞性',
                    '越級被拒時不得扣費', '');
            }
            clearEngine();

            seedAt(EXAM_ST);
            const c = CS.load();
            if (c.ranks.passed.indexOf(stName) < 0) c.ranks.passed.push(stName);
            CS.save(c);
            LP.invalidateProgress();
            LP.startSkipExam(stName);
            check(!EE.isBusy(), '破壞性', '已通過的考試不得再越級應試', '');
            clearEngine();
        }

        // ── 10.9 越級通過後，沿途站點獎勵必須冪等 ──────────────────────
        {
            clearEngine();
            env.resetSave();
            const c = CS.load(); c.silver = 9999999; CS.save(c);
            LP.invalidateProgress();

            const first = PS.getExamStations()[0];
            LP.startSkipExam(first.name);
            const opened = EE.isBusy();
            enter();
            if (opened) drive(true);
            const silver1 = CS.load().silver;
            const again = (typeof EE._grantSkipStations === 'function')
                ? EE._grantSkipStations(first.name) : 0;
            check(opened, '破壞性', '全新玩家可以越級應考第一場考試',
                '越級入口整個不通');
            check(again === 0 && CS.load().silver === silver1, '破壞性',
                '越級沿途獎勵重複補發時不會重複給錢',
                '重複補發拿到 ' + again + ' 文錢（應為 0）');
            clearEngine();
        }

        // ── 10.11 課程修完、考試還沒過時再進站 → 必須當成溫習 ──────────
        //
        // 玩家回報的災情：修完「塾生」課程後在「可赴科場」彈窗按了
        // 「容後再議」，回到青雲梯再點一次塾生站，會被當成正常課程開局，
        // pathRounds 一路往上加（第 50 局、第 51 局…），但那些局數對應的
        // 內容全是早就學完的舊課程 —— 局號與實際進度完全脫鉤。
        {
            const st = seedAt(EXAM_ST);          // 這一站的必通關卡已全數完成
            // onStationClick 讀的是 render() 建好的 this.stations；
            // Node 沒有畫面、不會跑 render()，這裡補上（內容與線上一致）。
            LP.stations = PS.build();
            const idx = LP.getCurrentStationIndex();
            check(idx === EXAM_ST, '破壞性',
                '課程修完但考試未過時，站點被考試關卡擋在原地',
                '目前站點 ' + idx + '，預期 ' + EXAM_ST);

            const p = LP.getStationProgress(st);
            check(p.total > 0 && p.done >= p.total, '破壞性',
                '前置條件：這一站的課程確實已修畢',
                p.done + ' / ' + p.total);

            // 攔下溫習確認彈窗，記下它有沒有被叫出來、用的是哪一種文案
            const origConfirm = LP.showReviewConfirm;
            let confirmArgs = null;
            LP.showReviewConfirm = function (station, onAgree, reason) {
                confirmArgs = { name: station && station.name, reason: reason };
                if (typeof onAgree === 'function') onAgree();     // 玩家按「同意溫習」
            };
            const origLaunch2 = LP.launchGame;
            LP.launchGame = function () { };                      // 不真的開遊戲
            try {
                LP.onStationClick(EXAM_ST);
            } finally {
                LP.showReviewConfirm = origConfirm;
                LP.launchGame = origLaunch2;
            }

            check(!!confirmArgs, '破壞性',
                '再次進入已修畢的站會先跳「溫故知新」確認',
                '沒有跳確認，直接當成正常課程開局 —— 局數會憑空增加');
            check(confirmArgs && confirmArgs.reason === 'done', '破壞性',
                '「溫故知新」用的是「課程已修畢、只差考試」的文案',
                '用到了「回頭點舊站」的文案，會叫玩家「點道路最上方的站」，'
                + '但這裡的出路是去應試 —— 等於把玩家導到死路');
            check(LP._reviewMode === true && SM.isReviewMode() === true, '破壞性',
                '同意後以溫習模式進入（LearningPath 與 ScoreManager 同步）',
                'LP._reviewMode=' + LP._reviewMode + '、SM=' + SM.isReviewMode());

            // 核心不變式：溫習重玩不得增加晉升局數
            const rounds0 = SM.loadPlayerData().pathRounds || 0;
            const u = (st.units || [])[0];
            if (u) SM.completeLevel('game1', u.tier, u.level);
            const rounds1 = SM.loadPlayerData().pathRounds || 0;
            check(rounds1 === rounds0, '破壞性',
                '溫習已修畢的課程不會增加晉升局數',
                'pathRounds ' + rounds0 + '→' + rounds1
                + '　→ 玩家會看到局號一直跳、站點卻永遠不動');

            SM.setReviewMode(false);
            LP._reviewMode = false;
            clearEngine();
        }

        // ── 10.12 兩個模組交錯覆寫同一款遊戲，還原後必須回到原版 ────────
        //
        // 青雲梯（launchGame）會覆寫遊戲的 startNextLevel 來接管關卡推進；
        // 考試引擎（_patchGame）會覆寫 gameOver 與 startNextLevel 來接管答題。
        // 兩邊若各自把「我覆寫前看到的那一個」當成原版存起來，交錯還原時
        // 就會互相把對方的替身當成原版裝回去 —— 那款遊戲從此永久停在別人的
        // 閉包上，玩家自由練習過關會被導回青雲梯的流程，而且毫無錯誤訊息。
        //
        // ⚠️ 這個交錯在正常操作下已經被 onStationClick 的「考試進行中不得
        //    開課程局」擋住了，亂序模擬也因此打不出來。但擋門只擋得住
        //    「目前已知的入口」，機制本身的正確性必須獨立驗 ——
        //    否則日後任何新入口都可能重新打開這個洞。
        {
            const no = COURSE_GAMES[0];
            const G = global['Game' + no];
            if (G && typeof G.startNextLevel === 'function' && typeof G.gameOver === 'function') {
                const pristine = { over: G.gameOver, next: G.startNextLevel };
                const savedShow = G.show;
                G.show = function () { };                 // 不要真的開畫面
                try {
                    // ① 青雲梯先派局（真正的 launchGame，會覆寫 startNextLevel）
                    const u = (PS.build()[0].units || [])[0] || { tier: '小學', level: 1 };
                    LP.launchGame(no, u.tier, u.level);
                    // ② 考試接著接管同一款遊戲（真正的 _patchGame）
                    EE._patchGame(G, { poemId: 1, gameNo: no });
                    // ③ 用「錯的順序」還原：先青雲梯、後考試
                    LP.restorePatchedGame();
                    EE._unpatchGame();

                    check(G.startNextLevel === pristine.next && G.gameOver === pristine.over,
                        '破壞性', '交錯覆寫同一款遊戲後還原得回原版（青雲梯先、考試後）',
                        'Game' + no + ' 的方法沒有回到原版 —— 之後玩家自由練習'
                        + '過關時會被導進別的模組的流程，且不會有任何錯誤訊息');

                    // ④ 反向順序再驗一次：考試先接管，青雲梯才派局。
                    //    兩種順序都必須安全，只驗一種等於只保護了一半。
                    G.gameOver = pristine.over;
                    G.startNextLevel = pristine.next;
                    LP._patched = null;
                    EE._patchedGame = null;

                    EE._patchGame(G, { poemId: 1, gameNo: no });
                    LP.launchGame(no, u.tier, u.level);
                    EE._unpatchGame();
                    LP.restorePatchedGame();

                    check(G.startNextLevel === pristine.next && G.gameOver === pristine.over,
                        '破壞性', '交錯覆寫同一款遊戲後還原得回原版（考試先、青雲梯後）',
                        'Game' + no + ' 的方法沒有回到原版');
                } finally {
                    G.show = savedShow;
                    G.gameOver = pristine.over;
                    G.startNextLevel = pristine.next;
                    LP._patched = null;
                    EE._patchedGame = null;
                    LP.stopGame();
                }
            }
        }

        // ── 10.13 遊戲的啟動流程不得觸發全域清理（考試會被自己殺掉）──────
        //
        // 2026-09-11 玩家回報：「考試中途某一題突然跳出難度選單，考試就沒了、
        // 報名費白花」。根因是 game13「人事時地」的 showDifficultySelector()
        // 裡有一行 `MenuManager.closeAll()`（40 款裡唯一這樣寫的），
        // 而全域清理會呼叫 `ExamEngine.forceStop()` —— 考試抽到它出題時，
        // 等於在開局那一刻把自己這場考試殺掉；沙箱被拆、DS.show 還原之後，
        // 下一行的難度選擇器就變成**真的**難度選單彈到玩家臉上。
        //
        // ⚠️ 這條用「原始碼指紋」驗，不靠跑起來 —— 因為亂序模擬把遊戲的
        //    show() 換成了替身，**剛好跳過引發 bug 的那一行**，跑再多次也抓不到。
        //    這正是當初漏掉它的原因，記在這裡免得重蹈覆轍。
        //
        // ⚠️⚠️ 2026-09-11 第二次修正：掃描本體已移到 **第 1.6-(e) 節**，
        //    範圍由「八款考試遊戲的開局函式」擴大為「39 款 × 整個檔案」。
        //    舊版的兩個漏洞：
        //      ① 只驗八款考試遊戲。另外 31 款不會被考試派出，
        //         但**會被課程局派出** —— 同一行寫在它們身上，
        //         毀掉的是課程局與離場守門，一樣是玩家的損失。
        //      ② 只驗開局函式。同一行寫在結算、暫停、返回鈕一樣會炸。
        //
        // 這裡改為守住「那份禁用清單本身不可以被掏空」——
        // 否則有人把 FORBIDDEN_IN_GAMES 清空，1.6-(e) 就會變成永遠通過的空檢查，
        // 而且不會有任何測試變紅（這種「檢查被靜靜廢掉」比 bug 本身更難發現）。
        {
            const FG = global.FMGame;
            const list = (FG && FG.FORBIDDEN_IN_GAMES) || [];
            check(list.length > 0, '破壞性',
                'gameContract.js 的遊戲禁用清單不是空的',
                '清單一空，第 1.6-(e) 節對 39 款的掃描就變成永遠通過的空檢查');
            // 用一段假的遊戲原始碼反過來驗「這份清單真的攔得住 game13 那一行」
            const bait = "showDifficultySelector: function () { MenuManager.closeAll(); }";
            check(list.some(r => r.re.test(bait)), '破壞性',
                '禁用清單仍攔得住 game13 那一行（MenuManager.closeAll）',
                '清單還在，但已經攔不住當初造成「考試中途跳出難度選單、'
                + '報名費白花」的那一行了');
            const baitHome = "onBack: function () { FMGoHome(); }";
            check(list.some(r => r.re.test(baitHome)), '破壞性',
                '禁用清單仍攔得住遊戲自行回首頁（FMGoHome）',
                '遊戲自己回首頁，進行中的考試會被靜默清掉、離場守門也不會解鎖');
        }

        // ── 10.14 派題當下不接受外部中止（_launching 守衛）────────────────
        {
            seedAt(EXAM_ST);
            LP.startExam(stName, 'real');
            enter();
            EE._launching = true;
            EE.forceStop();                       // 模擬遊戲開局途中觸發全域清理
            const survived = EE.isBusy();
            EE._launching = false;
            check(survived, '破壞性',
                '考試派題當下不會被全域清理殺掉',
                '只要有任何一款遊戲在自己的 show() 裡觸發全域清理，'
                + '考試就會在開局那一刻自盡（見 10.13）');
            EE.forceStop();
            check(!EE.isBusy(), '破壞性',
                '派題結束後全域清理照常生效',
                '_launching 沒有還原，考試從此殺不掉、漢堡選單也永遠解不開');
            clearEngine();
        }

        // ── 10.15 離場守門：進行中必鎖選單、結束後必須解鎖 ────────────────
        //
        // ⚠️ 這一條的下半段（結束後必須解鎖）比上半段更重要：
        //    鎖住選單卻忘了解鎖，玩家會永遠回不了首頁 —— 比原本的 bug 更嚴重。
        {
            const realMM = global.MenuManager;
            let locked = null;
            global.MenuManager = { setNavLocked: function (v) { locked = !!v; } };
            try {
                seedAt(EXAM_ST);
                LP.updateSessionGuard();
                check(locked === false, '破壞性', '地圖上不鎖漢堡選單', '玩家在地圖上被鎖住了');

                LP.startExam(stName, 'real');
                check(locked === true, '破壞性', '考試一開始就鎖住漢堡選單',
                    '玩家可以從選單切走，考試會被靜默中止且報名費不退');
                enter();
                check(locked === true, '破壞性', '入場作答期間維持鎖定', '');

                EE._aborted = true; EE._finish();
                check(locked === false, '破壞性', '考試結束後解除鎖定',
                    '⚠️ 漢堡選單沒還回去＝玩家永遠回不了首頁，比原本的 bug 更嚴重');
                clearEngine();

                // forceStop 這條路也必須解鎖
                seedAt(EXAM_ST);
                LP.startExam(stName, 'real');
                enter();
                EE.forceStop();
                check(locked === false, '破壞性', 'forceStop 收掉考試後也會解除鎖定', '');
                clearEngine();

                // 課程局：由 _pendingUnit 推導
                LP._pendingUnit = { tier: '中學', level: 1, playsBefore: 0 };
                LP.updateSessionGuard();
                check(locked === true, '破壞性', '課程局進行中鎖住漢堡選單', '');
                LP._pendingUnit = null;
                LP.updateSessionGuard();
                check(locked === false, '破壞性', '課程局結束後解除鎖定', '');
            } finally {
                global.MenuManager = realMM;
            }
        }

        // ── 10.10 考試流水帳必須有上限 ────────────────────────────────
        {
            seedAt(EXAM_ST);
            const cap = CS.EXAM_LOG_MAX || 0;
            const c = CS.load();
            c.examLog = [];
            for (let i = 0; i < cap + 30; i++) {
                c.examLog.push({ rank: stName, ts: Date.now(), pass: false });
            }
            CS.save(c);
            check(cap > 0 && CS.load().examLog.length <= cap, '破壞性',
                '考試流水帳 examLog 有筆數上限（' + (cap || '未設定') + '）',
                '沒有上限的話，反覆落榜會讓整包存檔無止境變大，'
                + '而且每次存檔都會把它整包同步上雲');
            clearEngine();
        }
    } finally {
        // 還原替身，避免污染後面的章節與第 7 節的潔淨度檢查
        EE._launch = saved.launch;
        LP.playPromotionCelebration = saved.celeb;
        LP.scrollToCurrent = saved.scroll;
        LP.show = saved.show;
        LP.showPromotionQueue = saved.queue;
        LP.showPromotionPopup = saved.popup;
        LP.showExamQualifiedPopup = saved.qualified;
        LP.toast = saved.toast;
        clearEngine();
        env.resetSave();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  第 11 節　亂序操作模擬（fuzz）：玩家在任何介面亂點
//
//  ── 為什麼需要這一節（作者反覆遇到「無法預期的錯誤」的根本原因）──────
//  第 1~10 節都是「我想得到的情境」。但實際踩到的每一個 bug 都不是
//  規格算錯，而是**狀態機的轉移沒人列舉到**：
//      · 考試中途從漢堡選單離開 → 沙箱沒拆（№17）
//      · 報名費扣在「還沒入場」的時間點（№18）
//      · 考試重入沒有防護（№19）
//      · _finish() 不冪等（№20）
//      · onStationClick 漏掉「課程已修完」這第三種狀態（№24）
//  手寫情境永遠只能覆蓋「想得到的那幾條路」，補不完。
//
//  ── 作法 ────────────────────────────────────────────────────────────
//  改成「不變式 ＋ 亂序模擬」：
//    ① 定義一組**任何時刻都必須成立**的規則（checkInvariants）。
//    ② 用固定亂數種子隨機挑動作亂點（開關青雲梯、點各種站、開考、
//       入場、答對答錯、中途離開、模擬重新整理、越級…），
//       **每動一步就把所有不變式全檢查一次**。
//    ③ 一旦違反，印出種子與完整動作序列 —— 因為亂數是固定種子，
//       同一個種子必定重現同一串操作，可以直接拿去除錯。
//
//  ⚠️ 這一節不是要取代前面幾節，而是補上「沒人想到的轉移」。
//     它抓到的每一個違規，都應該回頭在第 10 節補一條具名的測試。
//  ⚠️ 遊戲的 show() 用替身（Node 沒有畫面），但青雲梯與考試引擎
//     本身的流程完全是線上那一份 —— 歷來的 bug 也都出在這兩支。
// ══════════════════════════════════════════════════════════════════════
function verifyChaos() {
    section('第 11 節　亂序操作模擬（fuzz）：玩家在任何介面亂點');

    const EE = global.ExamEngine;
    if (!EE || !EC || !CS) { warn('亂序', '考試模組未載入，略過本節'); return; }

    const SEEDS = (process.env.FM_CHAOS_SEEDS || '')
        .split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n));
    const seeds = SEEDS.length ? SEEDS : [1, 2, 3, 4, 5, 6, 7, 8];
    const STEPS = Math.max(10, parseInt(process.env.FM_CHAOS_STEPS || '90', 10));

    // ── 基準快照：用來判斷「有沒有人把全域函式劫持了沒還回來」──────────
    //
    // ⚠️ 先把「可能還掛著替身」的那幾支回推到真正的原版再取樣。
    //    前面幾節（第 5、6 節）會替換遊戲的 show()，而 launchGame 覆寫
    //    DifficultySelector.show 後，是靠「遊戲的 show() 會呼叫它」來還原的；
    //    某些替身不會呼叫，於是替身留到本節開場。基準值若取到替身，
    //    本節就會把「修好」誤判成「壞掉」。替身身上都有 __fmOriginal。
    if (global.DifficultySelector && global.DifficultySelector.show
        && global.DifficultySelector.show.__fmOriginal) {
        global.DifficultySelector.show = global.DifficultySelector.show.__fmOriginal;
    }
    const BASE = {
        completeLevel: SM.completeLevel,
        saveScore: SM.saveScore,
        alert: global.alert,
        logGame: global.SupabaseClient && global.SupabaseClient.logGame,
        dsShow: global.DifficultySelector && global.DifficultySelector.show,
        gameOver: {},
        startNextLevel: {}
    };
    COURSE_GAMES.forEach(n => {
        const G = global['Game' + n];
        if (!G) return;
        BASE.gameOver[n] = G.gameOver;
        BASE.startNextLevel[n] = G.startNextLevel;
    });

    // ── 替身：遊戲的 show()／stopGame() ────────────────────────────────
    const savedGame = {};
    COURSE_GAMES.forEach(n => {
        const G = global['Game' + n];
        if (!G) return;
        savedGame[n] = { show: G.show, stopGame: G.stopGame };
        G.show = function () {
            // 真實遊戲就是在 show() 裡叫難度選擇器；青雲梯／考試靠暫時替換
            // 它來注入難度與關卡，這裡照走一次，才驗得到那條注入路徑。
            if (global.DifficultySelector && typeof global.DifficultySelector.show === 'function') {
                global.DifficultySelector.show(NAMES[n] || ('game' + n), (tier, levelIndex) => {
                    this.difficulty = tier;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                });
            }
            // 考試的 _tryCombo 會比對 currentPoem.id 是否等於指定的詩，
            // 這裡照著白名單回報，讓真正的出題流程跑得下去。
            const allow = LT._allowedPoemIds;
            this.currentPoem = { id: (allow && allow.length) ? allow[0] : null };
            this.__chaosOpen = true;
        };
        G.stopGame = function () { this.__chaosOpen = false; };
    });

    // 假的 MenuManager：記錄「漢堡選單有沒有被鎖住」供不變式 ⑨-2 比對。
    // Node 載不動 menu.js（它在模組層就抓 DOM），因此這裡自備一個替身。
    const GUARD = { locked: null };
    const savedMenuManager = global.MenuManager;
    global.MenuManager = Object.assign({}, savedMenuManager, {
        setNavLocked: function (v) { GUARD.locked = !!v; }
    });

    const savedLP = {
        celeb: LP.playPromotionCelebration, scroll: LP.scrollToCurrent,
        popup: LP.showPromotionPopup, queue: LP.showPromotionQueue,
        qualified: LP.showExamQualifiedPopup, review: LP.showReviewConfirm,
        skipMenu: LP.showSkipExamMenu, toast: LP.toast, makePopup: LP._makePopup,
        render: LP.render
    };
    const savedEEcard = EE._card;

    // 彈窗一律「立刻同意」或「立刻關閉」，由亂數決定（見動作表）
    let autoAgree = true;
    LP.playPromotionCelebration = (s, v, d) => { if (d) d(); };
    LP.scrollToCurrent = () => { };
    LP.showPromotionPopup = (s, n) => { if (n) n(); };
    LP.showPromotionQueue = () => { };
    LP.showExamQualifiedPopup = () => { };
    LP.showReviewConfirm = (s, onAgree) => { if (autoAgree && onAgree) onAgree(); };
    LP.showSkipExamMenu = () => { };
    LP.toast = () => { };
    LP._makePopup = () => ({ querySelector: () => env.makeEl(), remove() { } });
    LP.render = function () { this.stations = PS.build(); };
    EE._card = () => { };

    // ── 不變式 ────────────────────────────────────────────────────────
    let hi = { rounds: 0, station: 0, passed: 0 };
    /**
     * @param {boolean} leftEverything 上一個動作是不是「玩家已經完全離開」
     *        （漢堡選單離開／重新整理）。只有這種時候才要求關卡情境清乾淨——
     *        還停在青雲梯地圖上時，情境要留給結算動畫期間的 logGame 判斷
     *        is_ranked（見 supabaseClient.js 的說明），提早清掉反而會把
     *        真正的晉升局記成自由練習。
     */
    function checkInvariants(leftEverything) {
        const bad = [];
        const examOn = !!EE._active;
        let coll = null;
        try { coll = CS.load(); } catch (e) { bad.push('存檔讀不出來：' + e.message); return bad; }
        const data = SM.loadPlayerData();

        // ① 沙箱與考試狀態必須同進同出
        if (!!EE._sandbox !== examOn) {
            bad.push('沙箱與 _active 不一致（sandbox=' + !!EE._sandbox + ' active=' + examOn + '）');
        }
        // ② 沒在考試時，被沙箱換掉的全域函式必須是原版
        if (!examOn) {
            if (SM.completeLevel !== BASE.completeLevel) bad.push('ScoreManager.completeLevel 沒還原');
            if (SM.saveScore !== BASE.saveScore) bad.push('ScoreManager.saveScore 沒還原');
            if (global.alert !== BASE.alert) bad.push('window.alert 沒還原');
            if (global.SupabaseClient && BASE.logGame
                && global.SupabaseClient.logGame !== BASE.logGame) bad.push('SupabaseClient.logGame 沒還原');
            // 難度選擇器同樣被兩個模組各自暫時覆寫（青雲梯注入難度／考試鎖題），
            // 殘留的話玩家從漢堡選單進自由練習會選不了難度。
            if (global.DifficultySelector && BASE.dsShow
                && global.DifficultySelector.show !== BASE.dsShow) {
                bad.push('DifficultySelector.show 沒還原');
            }
        }
        // ③ 沒在考試、青雲梯也沒派局時，遊戲不得還被劫持
        if (!examOn && !LP._patched) {
            COURSE_GAMES.forEach(n => {
                const G = global['Game' + n];
                if (!G) return;
                if (BASE.gameOver[n] && G.gameOver !== BASE.gameOver[n]) {
                    bad.push('Game' + n + '.gameOver 沒還原');
                }
                if (BASE.startNextLevel[n] && G.startNextLevel !== BASE.startNextLevel[n]) {
                    bad.push('Game' + n + '.startNextLevel 沒還原');
                }
            });
        }
        // ④ 局數只增不減
        const rounds = data.pathRounds || 0;
        if (rounds < hi.rounds) bad.push('局數倒退（' + hi.rounds + '→' + rounds + '）');
        hi.rounds = Math.max(hi.rounds, rounds);

        // ⑤ 站點索引不得超過考試關卡（考試必須擋得住）
        const idx = LP.getCurrentStationIndex();
        const gate = LP.getExamGateIndex();
        if (idx > gate) bad.push('站點 ' + idx + ' 越過了考試關卡 ' + gate);
        // ⑥ 站點只增不減
        if (idx < hi.station) bad.push('站點倒退（' + hi.station + '→' + idx + '）');
        hi.station = Math.max(hi.station, idx);

        // ⑦ 文錢不得為負
        if ((coll.silver || 0) < 0) bad.push('文錢變成負數（' + coll.silver + '）');

        // ⑧ 通過紀錄：無重複、只增不減、必須是合法站名
        const passed = (coll.ranks && coll.ranks.passed) || [];
        const minor = (coll.exams && coll.exams.minorPassed) || [];
        if (new Set(passed).size !== passed.length) bad.push('ranks.passed 有重複項：' + passed.join('、'));
        if (new Set(minor).size !== minor.length) bad.push('minorPassed 有重複項：' + minor.join('、'));
        const total = passed.length + minor.length;
        if (total < hi.passed) bad.push('已通過的考試變少了（' + hi.passed + '→' + total + '）');
        hi.passed = Math.max(hi.passed, total);
        passed.concat(minor).forEach(nm => {
            const st = PS.getStationByName(nm);
            if (!st || !st.examKind) bad.push('通過紀錄裡有不存在或不需考試的站：' + nm);
        });

        // ⑨ 考試進行中，再開一場必須被拒絕
        if (examOn) {
            const mode0 = EE._mode;
            if (EE.start({ rankName: EE._plan && EE._plan.examId, mode: 'mock' }) !== false
                || EE._mode !== mode0) {
                bad.push('考試進行中竟然可以再開一場');
            }
        }

        // ⑨-2 離場守門：課程／考試進行中必須鎖住漢堡選單；否則必須解鎖。
        //
        // ⚠️ 這條是 2026-09-11 玩家回報「考試中途從選單切走 → 考試被靜默中止、
        //    報名費白花」之後補的。舊版的不變式全都在檢查「程式有沒有壞」
        //    （沙箱、全域函式、旗標），沒有一條在檢查「**玩家的權益有沒有被
        //    默默拿走**」—— 那次就是這樣漏掉的。
        //    下半段（沒在進行時必須解鎖）同樣重要：鎖住卻沒還，玩家會永遠
        //    回不了首頁，比原本的 bug 更嚴重。
        {
            const shouldLock = examOn || !!LP._pendingUnit;
            if (GUARD.locked !== null && GUARD.locked !== shouldLock) {
                bad.push('離場守門狀態不對：漢堡選單 ' + (GUARD.locked ? '鎖著' : '沒鎖')
                    + '，但目前' + (shouldLock ? '有課程／考試進行中（應鎖）' : '沒有任何進行中的局（應解鎖）'));
            }
        }

        // ⑩ 玩家離開之後，LevelTable 的情境與候選詩白名單必須清乾淨。
        //    殘留的話：自由練習會被記成晉升局（logGame 的 is_ranked 讀的
        //    就是「有沒有情境」）、難度標籤會冒出「第 X 局」、選詩範圍
        //    也會被上一局的情境限縮。
        if (leftEverything) {
            if (LT.getContext()) {
                bad.push('已經離開青雲梯，LevelTable 情境卻還鎖著 '
                    + JSON.stringify(LT.getContext()));
            }
            if (LT._allowedPoemIds) {
                bad.push('已經離開青雲梯，候選詩白名單卻還鎖著 '
                    + JSON.stringify(LT._allowedPoemIds));
            }
        }
        return bad;
    }

    // ── 動作表：玩家在各介面「可能做的事」，含不合規的操作 ──────────────
    function buildActions(rnd) {
        const stations = PS.build();
        const idx = () => LP.getCurrentStationIndex();
        const A = [];
        const add = (name, fn) => A.push({ name, fn });

        add('開啟青雲梯', () => { LP.stations = PS.build(); LP.checkPendingUnit(); LP.render(); });
        add('關閉青雲梯', () => LP.hide());
        add('漢堡選單離開', () => {
            COURSE_GAMES.forEach(n => { const G = global['Game' + n]; if (G && G.stopGame) G.stopGame(); });
            LP.stopGame();
            EE.forceStop();
        });
        add('點目前站', () => { LP.stations = PS.build(); LP.onStationClick(idx()); });
        add('點已走過的舊站', () => {
            LP.stations = PS.build();
            const i = idx(); if (i <= 0) return '（無舊站）';
            LP.onStationClick(Math.floor(rnd() * i));
        });
        add('點未解鎖的站', () => {
            LP.stations = PS.build();
            const i = idx();
            const j = Math.min(stations.length - 1, i + 1 + Math.floor(rnd() * 10));
            if (j <= i) return '（無未解鎖站）';
            LP.onStationClick(j);
        });
        add('打贏這一局', () => {
            const u = LP._pendingUnit;
            if (!u) return '（沒有進行中的局）';
            SM.completeLevel('game' + (LP._lastGame || 1), u.tier, u.level);
            LP.advanceAfterWin(LP._lastGame || 1);
        });
        add('這一局輸掉／直接關掉遊戲', () => {
            if (!LP._pendingUnit) return '（沒有進行中的局）';
            COURSE_GAMES.forEach(n => { const G = global['Game' + n]; if (G && G.stopGame) G.stopGame(); });
            LP.stations = PS.build(); LP.checkPendingUnit(); LP.render();
        });
        add('開模擬考', () => { LP.stations = PS.build(); LP.startExam(stations[idx()].name, 'mock'); });
        add('開正式考', () => { LP.stations = PS.build(); LP.startExam(stations[idx()].name, 'real'); });
        add('開越級考', () => {
            const menu = EC.getSkipMenu();
            const row = menu.filter(m => m.enabled)[0];
            if (!row) return '（沒有可越級的場次）';
            LP.startSkipExam(row.name);
        });
        add('考試：入場應試', () => {
            if (!EE._active || !EE._onEnter) return '（不在簡介畫面）';
            const fn = EE._onEnter; EE._onEnter = null;
            if (fn() === false) { EE._aborted = true; EE._finish(); return '（餘額不足，退場）'; }
            EE._nextQuestion();
        });
        add('考試：先回家苦讀', () => {
            if (!EE._active) return '（不在考試）';
            EE._aborted = true; EE._finish();
        });
        add('考試：答對一題', () => {
            if (!EE._active || EE._onEnter) return '（還沒入場）';
            EE._record(true);
            if (EE._qi >= (EE._plan ? EE._plan.totalQuestions : 0)) EE._finish();
            else EE._nextQuestion();
        });
        add('考試：答錯一題', () => {
            if (!EE._active || EE._onEnter) return '（還沒入場）';
            EE._record(false);
            if (EE._qi >= (EE._plan ? EE._plan.totalQuestions : 0)) EE._finish();
            else EE._nextQuestion();
        });
        add('考試：考到一半跑掉', () => {
            if (!EE._active) return '（不在考試）';
            EE.forceStop();
        });
        add('捐納跳關', () => {
            const st = stations[idx()];
            const u = LP.findStuckUnit(st) || (st.units || []).filter(x => !LP.isUnitDone(x))[0];
            if (!u) return '（沒有可捐納的關卡）';
            LP.donateSkip(u, 1);
        });
        add('模擬重新整理頁面', () => {
            // 重新整理只清掉記憶體狀態，存檔留著。
            EE.forceStop();
            LP.restorePatchedGame();
            LP.stopGame();
            EE._plan = null; EE._questions = []; EE._qi = 0; EE._correct = 0;
            EE._aborted = false; EE._active = false; EE._finished = false;
            LP._pendingUnit = null; LP._currentStation = null; LP._reviewMode = false;
            LP._stationIdxAtLaunch = -1; LP._examPrompted = null;
            SM.setReviewMode(false);
            LP.invalidateProgress();
        });
        add('補足文錢', () => { const c = CS.load(); c.silver = 9999999; CS.save(c); });
        add('把文錢花光', () => { const c = CS.load(); c.silver = 0; CS.save(c); });
        return A;
    }

    // ── 執行一個種子的亂點劇本 ────────────────────────────────────────
    function runOne(seed) {
        // mulberry32：同一個種子必定產生同一串操作，違規才能重播
        let s = seed >>> 0;
        const rnd = () => {
            s |= 0; s = (s + 0x6D2B79F5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        // ⚠️⚠️ 連 Math.random 一起接管：青雲梯自己的 pickUnit／pickGame、
        //    考試的 buildQuestions 與組合洗牌全都吃 Math.random()。
        //    不接管的話，同一個種子每次跑出來的內部選擇都不一樣 ——
        //    亂序測試會變成「這次抓到、下次抓不到」，印出來的種子也重播不了。
        //    實測就踩過：種子 36 在整批跑時違規，單獨重播卻通過。
        //    可重播是 fuzz 能不能用來除錯的前提，這一行是本節的關鍵。
        const realRandom = Math.random;
        Math.random = rnd;
        try {
            return runSession(seed, rnd);
        } finally {
            Math.random = realRandom;
        }
    }

    function runSession(seed, rnd) {
        env.resetSave();
        EE.forceStop();
        EE._plan = null; EE._active = false; EE._finished = false; EE._aborted = false;
        LP._pendingUnit = null; LP._currentStation = null; LP._reviewMode = false;
        LP._stationIdxAtLaunch = -1; LP._examPrompted = null; LP._navLockedGameNo = null;
        LP._recent = []; LP._lastGame = null; LP._sameGameStreak = 0;
        GUARD.locked = null;
        SM.setReviewMode(false);
        // 種子之間不得互相污染：上一個種子若停在「情境還鎖著」的狀態，
        // 下一個種子一開場就會踩到別人留下的殘局（實測發生過）。
        LT.clearContext();
        if (typeof LT.clearAllowedPoemIds === 'function') LT.clearAllowedPoemIds();
        LP.invalidateProgress();
        hi = { rounds: 0, station: 0, passed: 0 };

        // 起始給一點文錢，否則大部分考試動作都只會被「盤纏不足」擋掉
        const c0 = CS.load(); c0.silver = 50000; CS.save(c0);

        const actions = buildActions(rnd);
        const trail = [];
        for (let step = 0; step < STEPS; step++) {
            autoAgree = rnd() < 0.7;
            const act = actions[Math.floor(rnd() * actions.length)];
            let note = '';
            try {
                note = act.fn() || '';
            } catch (e) {
                trail.push(act.name + ' ← 拋出例外');
                return { seed, step, trail, bad: ['動作拋出未捕捉的例外：' + e.message] };
            }
            trail.push(act.name + note);
            const left = (act.name === '漢堡選單離開' || act.name === '模擬重新整理頁面');
            const bad = checkInvariants(left);
            if (bad.length) return { seed, step, trail, bad };
        }
        return null;
    }

    try {
        let firstFail = null;
        let done = 0;
        seeds.forEach(sd => {
            if (firstFail) return;              // 先修好第一個再繼續，避免洗版
            const r = runOne(sd);
            done++;
            if (r) firstFail = r;
        });

        if (firstFail) {
            const tail = firstFail.trail.slice(-12)
                .map((t, i) => '          ' + (firstFail.trail.length - 12 + i + 1) + '. ' + t)
                .join('\n');
            fail('亂序', '種子 ' + firstFail.seed + ' 第 ' + (firstFail.step + 1) + ' 步違反不變式',
                firstFail.bad.join('\n       → ')
                + '\n       → 重播：FM_CHAOS_SEEDS=' + firstFail.seed
                + ' node tools/verify_learning_path.js chaos'
                + '\n       → 最後幾步操作：\n' + tail);
        } else {
            ok('亂序', seeds.length + ' 個種子 × ' + STEPS + ' 步亂點，'
                + (seeds.length * STEPS) + ' 次操作全程沒有違反任何不變式');
            if (VERBOSE) {
                console.log('        檢查的不變式：沙箱同進同出／全域函式還原／遊戲未被劫持／'
                    + '局數只增不減／站點不越過考試關卡／站點只增不減／文錢非負／'
                    + '通過紀錄無重複且只增不減／考試不得重入／情境不得殘留');
            }
        }
    } finally {
        COURSE_GAMES.forEach(n => {
            const G = global['Game' + n];
            if (!G || !savedGame[n]) return;
            G.show = savedGame[n].show;
            G.stopGame = savedGame[n].stopGame;
        });
        LP.playPromotionCelebration = savedLP.celeb;
        LP.scrollToCurrent = savedLP.scroll;
        LP.showPromotionPopup = savedLP.popup;
        LP.showPromotionQueue = savedLP.queue;
        LP.showExamQualifiedPopup = savedLP.qualified;
        LP.showReviewConfirm = savedLP.review;
        LP.showSkipExamMenu = savedLP.skipMenu;
        LP.toast = savedLP.toast;
        LP._makePopup = savedLP.makePopup;
        LP.render = savedLP.render;
        EE._card = savedEEcard;
        EE.forceStop();
        LP.stopGame();
        SM.setReviewMode(false);
        global.MenuManager = savedMenuManager;
        env.resetSave();
    }
}

// ══════════════════════════════════════════════════════════════════════
//  第 7 節　狀態潔淨度
//  —— 青雲梯與考試都會「暫時覆寫全域函式再還原」，漏還原是靜默災難
// ══════════════════════════════════════════════════════════════════════
function verifyHygiene() {
    section('第 7 節　狀態潔淨度（暫時覆寫的東西有沒有全部還原）');

    // 7.1 前面幾節跑了幾千局遊戲與十幾場考試，全域函式必須跟開場時一模一樣
    const leaks = [];
    COURSE_GAMES.forEach(n => {
        const G = global['Game' + n];
        if (!G || !PRISTINE.startNextLevel[n]) return;
        if (G.startNextLevel !== PRISTINE.startNextLevel[n]) leaks.push('Game' + n + '.startNextLevel');
    });
    if (global.DifficultySelector && PRISTINE.dsShow
        && global.DifficultySelector.show !== PRISTINE.dsShow) leaks.push('DifficultySelector.show');
    if (global.alert !== PRISTINE.alert) leaks.push('window.alert');
    if (SM.saveScore !== PRISTINE.saveScore) leaks.push('ScoreManager.saveScore');
    if (SM.completeLevel !== PRISTINE.completeLevel) leaks.push('ScoreManager.completeLevel');
    check(leaks.length === 0, '潔淨度', '所有被暫時覆寫的全域函式都已還原',
        '還被別人佔著：' + leaks.join('、')
        + '\n       → 玩家從漢堡選單進自由練習時會出現無法解釋的行為，而且不會有錯誤訊息');

    // 7.2 離開青雲梯必須解除候選詩白名單，否則自由練習會被鎖在最後一站的詩裡
    LT.setContext('小學', 1);
    LT.setAllowedPoemIds([1, 2, 3]);
    LP.stopGame();
    check(LT._allowedPoemIds === null, '潔淨度',
        'LearningPath.stopGame() 會解除候選詩白名單',
        '白名單殘留會讓漢堡選單的自由練習只抽得到最後一站那幾首詩');
    LT.clearContext();

    // 7.3 溫習模式：不得增加累計局數（否則玩家可以回頭刷簡單題灌局數）
    (function () {
        env.resetSave();
        const stations = PS.build();
        const units = PS.getPoemUnits();
        for (let i = 0; i < stations[2].poemFrom; i++) {
            units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        LP.invalidateProgress();
        const before = LP.getPathRounds();
        SM.setReviewMode(true);
        const u0 = stations[0].units[0];
        [11, 12, 13].forEach(g => SM.completeLevel('game' + g, u0.tier, u0.level));
        SM.setReviewMode(false);
        check(LP.getPathRounds() === before, '溫習模式',
            '溫習舊站不會增加累計局數（維持 ' + before + '）',
            '實際變成 ' + LP.getPathRounds() + '；局數就失去「我學到哪裡」的意義');
        // 但通關紀錄仍然照記（溫習照樣給文錢與積分）
        check(LP.getUnitPlays(u0.tier, u0.level) >= 3, '溫習模式',
            '溫習仍然照常記錄通關紀錄', '');
    })();

    // 7.4 捐納跳關：失敗未達門檻不得開放，達門檻後必須開放
    (function () {
        env.resetSave();
        const st = PS.build()[0];
        const u = st.units[0];
        const th = LP.SKIP_FAIL_THRESHOLD;
        for (let i = 1; i < th; i++) {
            SM.recordLevelFail(u.tier, u.level);
            check(LP.findStuckUnit(st) === null, '捐納跳關',
                '失敗 ' + i + ' 次（未達門檻 ' + th + '）不開放捐納', '提早開放等於門檻形同虛設');
        }
        SM.recordLevelFail(u.tier, u.level);
        const stuck = LP.findStuckUnit(st);
        check(stuck && stuck.tier === u.tier && stuck.level === u.level, '捐納跳關',
            '失敗滿 ' + th + ' 次後開放捐納', '玩家會被硬牆永久卡死（企畫書 §3.5 的逃生口）');
        // 捐納後該關視同通過
        SM.markLevelDonated(u.tier, u.level);
        LP.invalidateProgress();
        check(LP.isUnitDone(u) === true, '捐納跳關', '捐納後該關視同通過', '');
        check(LP.findStuckUnit(st) === null, '捐納跳關', '捐納後不再提示卡關', '');
    })();

    // 7.5 站點圖示的「可應試」標記：資格成立才亮，成立前不得亮
    //
    // ⚠️ 這一條在 2026-09-05 改過：舊規則是「抵達即可應試」，因此舊版驗的是
    //    「玩家走過頭好幾站之後入口還在不在」。新規則下考試會擋路，
    //    玩家根本走不過去，要驗的變成「亮的時機對不對」。
    (function () {
        const stations = PS.build();
        const units = PS.getPoemUnits();
        const exIdx = stations.findIndex(s2 => s2.type === 'rank' && s2.isExam);
        const exSt = stations[exIdx];

        // ① 剛入學（抵達站點、課程未修）→ 不得出現應試入口
        env.resetSave();
        for (let i = 0; i < exSt.poemFrom; i++) {
            units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        passExamsBefore(exIdx);
        let gate = LP.getExamGateState();
        check(gate.blocked && !gate.qualified, '考試入口',
            '剛入學「' + exSt.name + '」時，應試入口尚未開放',
            JSON.stringify({ blocked: gate.blocked, qualified: gate.qualified })
            + '；提早開放等於叫玩家去考還沒學過的內容');
        check(LP.getRankExamProgress(exSt.name).ok === false, '考試入口',
            '此時 getRankExamProgress 也判定為未達資格', '');

        // ② 修完這一站的課程 → 應試入口開放
        exSt.units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        LP.invalidateProgress();
        gate = LP.getExamGateState();
        check(gate.blocked && gate.qualified && gate.station.name === exSt.name, '考試入口',
            '修完「' + exSt.name + '」課程後應試入口開放', JSON.stringify(gate.station && gate.station.name));

        // ③ startExam 這一支自己也要擋：資格未成立時不得開考、不得扣文錢
        env.resetSave();
        for (let i = 0; i < exSt.poemFrom; i++) {
            units[i].units.forEach(u => [1, 4, 8].forEach(g => SM.completeLevel('game' + g, u.tier, u.level)));
        }
        passExamsBefore(exIdx);
        const c = CS.load(); c.silver = 999999; CS.save(c);
        const before = CS.load().silver;
        let started = false;
        const origStart = global.ExamEngine.start;
        global.ExamEngine.start = function () { started = true; };
        const origToast = LP.toast; LP.toast = function () { };
        try { LP.startExam(exSt.name, 'real'); } finally {
            global.ExamEngine.start = origStart; LP.toast = origToast;
        }
        check(!started, '考試入口', 'startExam() 在資格未成立時拒絕開考',
            '只靠畫面擋是不夠的：任何新入口（測試熱鍵、外部呼叫）都會經過這一支');
        check(CS.load().silver === before, '考試入口', '被擋下時不會扣報名費',
            '文錢從 ' + before + ' 變成 ' + CS.load().silver);
    })();

    // 7.6 晉升動畫（PromotionCelebration）播到一半被強制關閉時必須真的停止
    //
    // ⚠️ 這是「考試通過後跳出『下一關』／『步步為陣』空彈窗」同一類洞的
    //    第二個活體案例：PromotionCelebration 有正確的 stop(true)（清 rAF、
    //    清五個 setTimeout、清 onDone、拆自己的 overlay），但過去三條
    //    「關閉一切」的路徑（LearningPath.stopGame／abandonSession、
    //    ExamEngine.forceStop）都沒有人呼叫它——玩家晉升後立刻離開，
    //    動畫會繼續在背景播完，彈出獎狀蓋在別的畫面上。
    //
    //    這裡不真的等 9 秒的 setTimeout 鏈跑完（也等不到：fm_env.js 的
    //    requestAnimationFrame 是永遠不會被呼叫的空函式，跟真實瀏覽器
    //    分頁被切到背景時的行為一致），而是直接戳內部狀態模擬「動畫播到
    //    一半」，確認三條路徑都會把它停乾淨。
    (function () {
        const PC = global.PromotionCelebration;
        if (!PC) { warn('潔淨度', 'PromotionCelebration 未載入，略過 7.6', ''); return; }

        function simulateMidFlight() {
            PC._running = true;
            PC._rafId = 999999;               // 假的 rAF handle，只用來確認 stop() 會歸零
            PC._timerCert = setTimeout(() => { }, 60000); // 假裝還卡在等獎狀被點擊那一幕
            PC._onDone = () => { };           // 假裝還掛著回呼，確認會被清掉
        }
        function stillMidFlight() {
            return PC._running === true || PC._rafId !== 0 || PC._timerCert !== 0 || PC._onDone !== null;
        }

        simulateMidFlight();
        LP.stopGame();
        check(!stillMidFlight(), '潔淨度',
            'LearningPath.stopGame() 會中止還在播的晉升動畫',
            '玩家晉升後立刻離開青雲梯，動畫會繼續在背景播完、彈出獎狀蓋在別的畫面上');

        simulateMidFlight();
        LP.abandonSession();
        check(!stillMidFlight(), '潔淨度',
            'LearningPath.abandonSession() 會中止還在播的晉升動畫', '');

        const EE = global.ExamEngine;
        if (EE) {
            EE._launching = false; // 確保不會被 forceStop() 的派題防線誤擋
            simulateMidFlight();
            EE.forceStop();
            check(!stillMidFlight(), '潔淨度',
                'ExamEngine.forceStop() 會中止還在播的晉升動畫',
                '考試通過後的慶祝動畫是在 _finish() 已經把 _active／_sandbox／_overlay '
                + '都清掉之後才播的，forceStop() 若只看「有沒有考試在進行」就會放過它');
        }

        PC.stop(true); // 收尾，避免殘留影響後面的章節
    })();
}

// ══════════════════════════════════════════════════════════════════════
//  第 8 節　文錢收支（應試負擔）
// ══════════════════════════════════════════════════════════════════════

/**
 * 玩家付不付得起報名費？
 *
 * ── 文錢的四條收入 ──────────────────────────────────────────────────
 *   ① 晉升文錢    小站 + 免考文位（抵達即發）+ 應試文位（考過才發）  ← 可精算
 *   ② 遊戲得分    scoreManager.saveScore：floor(該局分數 / 100) 文錢   ← 隨玩家表現
 *   ③ 成就獎狀    achievement.js 的 cert 獎勵                        ← 隨解鎖情況
 *   ④ 江南小院    種植／製茶／釀酒／抄書／變賣                        ← 隨時間累積
 *
 * 這一節只精算①（唯一與青雲梯直接相關、且完全決定性的那條），
 * 然後回答：**剩下的缺口要靠②③④補多少**。
 * 把缺口除以「走到該文位所需的累積局數」，就得到
 * 「平均每一局要淨賺幾文錢」——那是可以拿去跟實際遊戲得分對照的數字。
 *
 * ⚠️ 這裡不判定對錯（報名費與獎勵金額都是作者定案的平衡數值），
 *    只把帳算清楚列出來，因此一律是 ⚠／資訊，不會讓驗證失敗。
 *    唯一會判定失敗的是「前四個應試文位光靠晉升收入就該付得起」——
 *    新手不該在剛接觸考試制度時就先卡錢。
 */
function verifyMoney() {
    section('第 8 節　文錢收支（應試負擔）');
    if (!CS || !EC) { warn('文錢', '收集／考試模組未載入，略過'); return; }

    const stations = PS.build();
    const examRanks = PS.getExamRankNames();
    const startSilver = (function () { env.resetSave(); return CS.load().silver || 0; })();

    /**
     * 走一遍青雲梯，算出每一場考試當下的帳。
     *
     * ⚠️⚠️ 收入必須含「每一局的遊戲文錢」。這一條 2026-09-06 之前漏掉了 ——
     *    青雲梯課程的每一局過關都會走 scoreManager.saveScore，
     *    依「100 分 = 1 文錢」入帳，走完全程是四萬多文錢。
     *    漏算它會讓整張收支表嚴重失真，把「其實付得起」的文位算成付不起。
     *    每局得分見檔頭的 SCORE_BY_TIER（作者提供的推算值）。
     */
    function cashflow(attempts) {
        const rows = [];
        let fee = 0, promo = startSilver, rounds = 0, play = 0;
        stations.forEach(function (st, i) {
            rounds += st.requiredClears;
            // 這一站的課程會打幾局、每局賺幾文錢（100 分 = 1 文錢）
            play += st.requiredClears * Math.floor((SCORE_BY_TIER[st.tier] || 200) / 100);
            if (i > 0) {
                promo += (st.type === 'grade')
                    ? PS.getGradeStationSilver(st)
                    : (st.isExam ? 0 : PS.getRankSilver(st.name));
            }
            if (st.type === 'rank' && st.isExam) {
                fee += LP.getExamFee(st.name) * attempts;
                const income = promo + play;
                const gap = fee - income;
                rows.push({
                    rank: st.name, fee: fee, income: income, promo: promo, play: play,
                    rounds: rounds, gap: gap, perRound: rounds > 0 ? gap / rounds : 0
                });
                promo += PS.getRankSilver(st.name);   // 考過才入帳
            }
        });
        return rows;
    }

    // ── 硬性檢查：前四個應試文位必須光靠晉升收入就付得起 ────────────────
    const base = cashflow(1);
    const earlyBad = base.slice(0, 4).filter(r => r.gap > 0);
    check(earlyBad.length === 0, '文錢',
        '前四個應試文位（' + base.slice(0, 4).map(r => r.rank).join('、')
        + '）光靠青雲梯自身的收入（遊戲文錢＋晉升文錢）就付得起報名費',
        '付不起的：' + earlyBad.map(r => r.rank + ' 缺 ' + Math.round(r.gap)).join('、')
        + '\n       → 新手剛接觸考試制度就卡錢，會直接放棄');

    // ── 資訊：1~4 次應試的收支表 ────────────────────────────────────────
    console.log('\n  「每個文位考 N 次才通過」的累積缺口（負值＝有餘）');
    console.log('  收入 = 起始 888 ＋ 每局遊戲文錢（100 分 = 1 文錢）＋ 小站晉升 ＋ 已冊封文位獎勵');
    console.log('  ' + '文位'.padEnd(7) + 'N=1'.padStart(11) + 'N=2'.padStart(11)
        + 'N=3'.padStart(11) + 'N=4'.padStart(11) + '　（缺口／每局需淨賺）');
    const tables = [1, 2, 3, 4].map(cashflow);
    examRanks.forEach(function (rk, i) {
        const cells = tables.map(function (t) {
            const r = t[i];
            return (r.gap <= 0) ? '　　　 —' : String(Math.round(r.gap)).padStart(11);
        });
        const r0 = tables[0][i];
        console.log('  ' + rk.padEnd(6) + cells.join('')
            + '　累計 ' + r0.rounds.toLocaleString().padStart(5) + ' 局'
            + '　收入 ' + r0.income.toLocaleString().padStart(8)
            + '（遊戲 ' + r0.play.toLocaleString() + '）');
    });

    [1, 2, 3, 4].forEach(function (n, k) {
        const last = tables[k][tables[k].length - 1];
        const line = 'N=' + n + '：總報名費 ' + last.fee.toLocaleString()
            + '　總收入 ' + last.income.toLocaleString()
            + '（遊戲 ' + last.play.toLocaleString() + ' ＋ 晉升 ' + last.promo.toLocaleString() + '）'
            + (last.gap > 0
                ? ('　缺口 ' + Math.round(last.gap).toLocaleString()
                    + '，尚須每局再多賺 ' + last.perRound.toFixed(1) + ' 文錢')
                : ('　結餘 ' + Math.abs(Math.round(last.gap)).toLocaleString() + '　✓ 付得起'));
        if (last.gap > 0) warn('文錢', line, ''); else ok('文錢', line);
    });

    // ── 各難度層的課程局數與遊戲收入 ────────────────────────────────
    const byTier = {};
    stations.forEach(function (st) { byTier[st.tier] = (byTier[st.tier] || 0) + st.requiredClears; });
    console.log('');
    console.log('  各難度層的課程局數與遊戲文錢（每局得分為作者提供的推算值）：');
    let totalPlay = 0, totalRounds = 0;
    TIERS.forEach(function (t) {
        const n = byTier[t] || 0;
        const per = Math.floor((SCORE_BY_TIER[t] || 0) / 100);
        totalPlay += n * per; totalRounds += n;
        console.log('    ' + t.padEnd(4) + String(n).padStart(6) + ' 局 × '
            + String(SCORE_BY_TIER[t]).padStart(5) + ' 分／' + String(per).padStart(2)
            + ' 文錢 = ' + (n * per).toLocaleString().padStart(8) + ' 文錢');
    });
    console.log('    合計' + String(totalRounds).padStart(6) + ' 局'
        + ' '.repeat(22) + '= ' + totalPlay.toLocaleString().padStart(8) + ' 文錢');
    console.log('');
    console.log('  其餘缺口需由成就獎狀與江南小院（種植／製茶／釀酒／抄書）補足。');
}

// ══════════════════════════════════════════════════════════════════════
//  第 9 節　關卡編號穩定性
// ══════════════════════════════════════════════════════════════════════

/**
 * 題庫擴充之後，玩家的通關紀錄還指不指向同一組詩句？
 *
 * ── 背景 ────────────────────────────────────────────────────────────
 * 關卡編號就是 `LEVEL_TABLE.tiers[層].levels[]` 的陣列位置，而那個陣列由
 * tools/build_level_table.js 依「評價由低到高 → 詩句總評價由高到低 → id」
 * 重新排出來。**只要新增詩詞，編號就會整批位移。**
 * 存檔若存編號，那些數字會「還在、但指向完全不同的詩」——
 * 不會報錯，只會靜靜地全錯。
 *
 * 解法是改存「內容識別碼」`"錨定詩id:起始句"`（見 levelTable.js）。
 * 這一節就是那個保證的回歸測試：真的用 build_level_table 產生一份
 * 「加了 41 首詩」的關卡表，確認識別碼仍然指向同一組詩句。
 */
function verifyLevelKeys() {
    section('第 9 節　關卡編號穩定性（題庫擴充不會毀掉玩家進度）');

    const TIERS_ALL = TIERS;

    // 9.1 識別碼與關卡編號可以互相換算（全表逐關）
    let bad = 0, total = 0;
    TIERS_ALL.forEach(t => {
        const n = LT.getLevelCount(t);
        for (let i = 1; i <= n; i++) {
            total++;
            const k = LT.getLevelKey(t, i);
            if (!k) { bad++; continue; }
            // 反查回來的關卡未必是同一格（同一組詩句可能重複出現），
            // 但內容必須一模一樣。
            const back = LT.getLevelIndexByKey(t, k);
            if (back < 1 || LT.getLevelKey(t, back) !== k) bad++;
        }
    });
    check(bad === 0, '關卡識別碼', '全部 ' + total.toLocaleString() + ' 關都能與識別碼互相換算',
        bad + ' 關換算不回來');

    // 9.2 toLevelKey 對兩種輸入都正確
    const k24 = LT.getLevelKey('中學', 24);
    check(LT.toLevelKey('中學', 24) === k24, '關卡識別碼', 'toLevelKey 吃得下舊格式（關卡編號）', '');
    check(LT.toLevelKey('中學', k24) === k24, '關卡識別碼', 'toLevelKey 吃得下新格式（識別碼原樣回傳）', '');
    check(LT.isLevelKey(k24) && !LT.isLevelKey(24), '關卡識別碼', 'isLevelKey 分得出兩種格式', '');

    // 9.3 舊存檔遷移：轉得對、只轉一次、轉完查得到
    (function () {
        env.resetSave();
        const d = SM.loadPlayerData();
        delete d.levelKeyVersion;                     // 假裝是舊版存檔
        d.levelCleared = { game4: { '中學': [24, 100], '高中': [5, 40] } };
        d.levelDonated = { '中學': [251] };
        d.levelFails = { '中學|24': 2, '高中|5': 3 };
        global.localStorage.setItem('flowerMoon_playerData', JSON.stringify(d));

        const after = SM.loadPlayerData();
        check(after.levelKeyVersion === SM.LEVEL_KEY_VERSION, '存檔遷移',
            '舊存檔載入後被標記為已遷移（版本 ' + SM.LEVEL_KEY_VERSION + '）', '');
        check(JSON.stringify(after.levelCleared.game4['中學'])
            === JSON.stringify([LT.getLevelKey('中學', 24), LT.getLevelKey('中學', 100)]),
            '存檔遷移', 'levelCleared 已換成識別碼且指向原本那幾組詩句',
            JSON.stringify(after.levelCleared.game4['中學']));
        check(after.levelDonated['中學'][0] === LT.getLevelKey('中學', 251), '存檔遷移',
            'levelDonated 已換成識別碼', JSON.stringify(after.levelDonated));
        check(after.levelFails['中學|' + LT.getLevelKey('中學', 24)] === 2, '存檔遷移',
            'levelFails 的鍵已換成識別碼', JSON.stringify(after.levelFails));
        // 查詢 API 仍以「關卡編號」為輸入，必須查得到
        check(SM.isLevelDonated('中學', 251) === true, '存檔遷移',
            '遷移後 isLevelDonated(中學, 251) 仍為 true', '');
        check(SM.getLevelFails('中學', 24) === 2, '存檔遷移',
            '遷移後 getLevelFails(中學, 24) 仍為 2', '');
        // 冪等
        const snap = JSON.stringify(SM.loadPlayerData());
        check(JSON.stringify(SM.loadPlayerData()) === snap, '存檔遷移', '重複載入不會再轉一次', '');
    })();

    // 9.4 新舊格式混雜也要讀得對（群英榜讀別人的雲端存檔會遇到）
    (function () {
        const mixed = { game4: { '中學': [24, LT.getLevelKey('中學', 100)] } };
        const maps = LP.buildProgressMapsFrom(mixed, {});
        const k1 = '中學|' + LT.getLevelKey('中學', 24);
        const k2 = '中學|' + LT.getLevelKey('中學', 100);
        check(!!maps.games[k1] && !!maps.games[k2], '格式相容',
            'buildProgressMapsFrom 同時吃得下新舊兩種格式',
            '別人的雲端存檔可能還是舊版，讀不到會讓群英榜的文位算錯');
    })();

    // 9.5 ★ 真的擴充題庫，驗識別碼指向的詩句沒有變
    (function () {
        const path = require('path');
        let Builder = null;
        try { Builder = require(path.join(env.rootDir, 'tools', 'build_level_table.js')); }
        catch (e) { warn('題庫擴充', '載入 build_level_table.js 失敗，略過此檢查', e.message); return; }

        // 造 41 首新詩：評價7×5、評價6×8、評價5×10、評價4×18
        let nid = 900000;
        const mk = (rating, lines) => {
            const content = [], lr = [];
            for (let i = 0; i < lines; i++) { content.push('新詩測試句子甲乙丙，'); lr.push(rating); }
            return { id: nid++, title: '擴充測試詩', author: '測試', dynasty: '唐', rating, content, line_ratings: lr };
        };
        const NEW = [];
        for (let i = 0; i < 5; i++) NEW.push(mk(7, 4));
        for (let i = 0; i < 8; i++) NEW.push(mk(6, 4));
        for (let i = 0; i < 10; i++) NEW.push(mk(5, 8));
        for (let i = 0; i < 18; i++) NEW.push(mk(4, 8));

        let before, after;
        try {
            before = Builder.generate(global.POEMS).table;
            after = Builder.generate(global.POEMS.concat(NEW)).table;
        } catch (e) { warn('題庫擴充', '產生關卡表失敗，略過此檢查', e.message); return; }

        const content = (table, tier, idx) => {
            const e = table.tiers[tier] && table.tiers[tier].levels[idx - 1];
            return e ? (e.p + ':' + e.s) : null;
        };
        // 取樣：每層均勻抽 20 關
        const samples = [];
        TIERS_ALL.forEach(t => {
            const n = (before.tiers[t] || { levels: [] }).levels.length;
            for (let i = 1; i <= 20 && i * Math.floor(n / 20) > 0; i++) {
                samples.push({ tier: t, idx: i * Math.floor(n / 20) });
            }
        });

        // ① 對照組：若存的是「關卡編號」，有多少筆會指向不同的詩
        let shifted = 0;
        samples.forEach(sp => {
            if (content(before, sp.tier, sp.idx) !== content(after, sp.tier, sp.idx)) shifted++;
        });

        // ② 實驗組：存識別碼，換上新表之後還指不指向同一組詩句
        const origPoems = LT._poems, origTable = LT._table, origIdx = LT._keyIndex;
        let broken = 0;
        try {
            LT.inject(global.POEMS, before); LT._keyIndex = null;
            const keys = samples.map(sp => LT.toLevelKey(sp.tier, sp.idx));
            LT.inject(global.POEMS.concat(NEW), after); LT._keyIndex = null;
            keys.forEach((k, i) => {
                if (!k) { broken++; return; }
                const nowIdx = LT.getLevelIndexByKey(samples[i].tier, k);
                if (nowIdx < 1 || content(after, samples[i].tier, nowIdx) !== k) broken++;
            });
        } finally {
            LT._poems = origPoems; LT._table = origTable; LT._keyIndex = origIdx;
        }

        console.log('  模擬新增 41 首詩（評價7×5、6×8、5×10、4×18）後，抽樣 '
            + samples.length + ' 關：');
        console.log('    存「關卡編號」→ ' + shifted + ' 關指向不同的詩（'
            + Math.round(shifted / samples.length * 100) + '%）');
        console.log('    存「識別碼」  → ' + broken + ' 關指向不同的詩（'
            + Math.round(broken / samples.length * 100) + '%）');
        check(shifted > 0, '題庫擴充',
            '（對照組）關卡編號確實會位移 —— 這正是必須改用識別碼的理由',
            '沒有位移就代表這個測試沒驗到東西，請確認新詩的評價分布');
        check(broken === 0, '題庫擴充',
            '★ 穩定識別碼在題庫擴充後仍然指向同一組詩句',
            broken + ' 關對不上；玩家的通關紀錄會在下次加詩時全毀');
    })();
}

// ══════════════════════════════════════════════════════════════════════
//  報表：玩家歷程完整 LOG
// ══════════════════════════════════════════════════════════════════════

/**
 * 跑一趟完整生涯，把整段經歷寫成一份可以從頭讀到尾的 LOG。
 *
 * ── 為什麼要有這份報表 ──────────────────────────────────────────────
 * 前面七節回答的是「有沒有錯」，這一份回答的是「玩家到底經歷了什麼」。
 * 兩者不能互相取代：不變式只會在踩到已知地雷時亮紅燈，
 * 而一份逐局的流水帳可以讓人**用眼睛**看出「這一段怎麼怪怪的」——
 * 例如同一首詩連出好幾局、某一站的文錢對不上、考卷考到沒學過的詩。
 *
 * ── 逐局的那一行是什麼 ──────────────────────────────────────────────
 * 完全就是 supabaseClient.logGame 準備送進雲端 game_logs 的那個 payload
 * （player_id / played_at / duration_s / game_no / difficulty / score /
 *   is_win / is_ranked / poem_id / station_name），由線上程式自己組裝，
 * 驗證程式只是把「真的送出去」那一步換成寫進陣列。
 * 因此看到的欄位與線上資料庫完全一致，可以直接拿去對照。
 */
function writeReport() {
    section('報表　玩家歷程完整 LOG');

    const stations = PS.build();
    const poems = LT.getPoems ? LT.getPoems() : (global.POEMS || []);
    const poemById = {};
    poems.forEach(function (p) { poemById[p.id] = p; });
    const titleOf = function (id) {
        const p = poemById[id];
        return p ? (p.title + (p.author ? '·' + p.author : '')) : ('詩' + id);
    };
    const gname = function (n) { return 'G' + String(n).padStart(2, '0') + ' ' + (NAMES[n] || ''); };

    console.log('  正在模擬完整生涯（每個文位考 ' + EXAM_ATTEMPTS + ' 次）…');
    const t0 = Date.now();
    const F = runScenario({ seed: 6006, takeExams: true, examAttempts: EXAM_ATTEMPTS, captureLog: true });
    console.log('  模擬完成，耗時 ' + ((Date.now() - t0) / 1000).toFixed(1) + ' 秒，'
        + '事件 ' + F.events.length.toLocaleString() + ' 筆');

    const L = [];
    const w = function (line) { L.push(line); };
    const money = function (n) { return (n >= 0 ? '+' : '') + n.toLocaleString(); };

    w('═'.repeat(100));
    w('  花月 · 青雲梯 玩家歷程完整 LOG');
    w('═'.repeat(100));
    w('  產生時間　：' + new Date().toISOString());
    w('  模擬設定　：每一局皆勝；每個文位落榜 ' + (EXAM_ATTEMPTS - 1) + ' 次後通過');
    w('  每局得分　：' + Object.keys(SCORE_BY_TIER).map(function (t) {
        return t + ' ' + SCORE_BY_TIER[t] + ' 分／' + Math.floor(SCORE_BY_TIER[t] / 100) + ' 文錢';
    }).join('　'));
    w('  站點總數　：' + stations.length + '（文位站 '
        + stations.filter(function (x) { return x.type === 'rank'; }).length + '／小站 '
        + stations.filter(function (x) { return x.type === 'grade'; }).length + '）');
    w('  逐局那一行 = supabaseClient.logGame 送進雲端 game_logs 的原始 payload');
    w('═'.repeat(100));
    w('');

    let seq = 0;
    F.events.forEach(function (e) {
        if (e.t === 'station-enter') {
            w('');
            w('┌' + '─'.repeat(98));
            w('│ 【第 ' + e.idx + ' 站　' + e.name + '】'
                + (e.type === 'rank' ? (e.isExam ? '　文位站（需應試）' : '　文位站（免考）') : '　小站')
                + '　難度層 ' + e.tier);
            w('│  課程：第 ' + (e.poemFrom + 1) + '~' + e.poemTo + ' 首　'
                + (e.poemIds || []).map(titleOf).join('、'));
            w('│  必通關卡 ' + e.units + ' 個 × ' + PS.getPlaysPerUnit() + ' 款遊戲 = '
                + e.requiredClears + ' 局');
            w('│  進站時：文位「' + e.rank + '」　文錢 ' + e.silver.toLocaleString());
            w('└' + '─'.repeat(98));
        } else if (e.t === 'play') {
            seq++;
            const c = e.cloud || {};
            w('  [局' + String(seq).padStart(5) + '] ' + (c.played_at || '')
                + '  ' + gname(e.game).padEnd(14)
                + ' ' + String(e.tier).padEnd(4) + ' #' + String(e.level).padEnd(4)
                + ' 詩' + String(c.poem_id == null ? '—' : c.poem_id).padStart(4)
                + ' ' + String(titleOf(c.poem_id)).padEnd(18)
                + ' 分' + String(e.score).padStart(5)
                + ' 文錢' + money(e.silverGain).padStart(5) + '→' + String(e.silver).padStart(8)
                + '  累計局數 ' + e.rounds);
            w('           game_logs: ' + JSON.stringify(c));
        } else if (e.t === 'promo') {
            w('  ★ 【晉升】第 ' + e.idx + ' 站「' + e.name + '」'
                + (e.type === 'rank' ? (e.isExam ? '（需應試文位·入學）' : '（免考文位）') : '（小站）')
                + '　彈窗：' + ({
                    ENROLL: '入室升堂', EXAM: '學問已成可赴科場',
                    RANK: '積學有成', GRADE: '更上一層'
                }[e.kind] || e.kind)
                + '　晉升文錢 ' + money(e.silver) + ' → 餘 ' + e.silverAfter.toLocaleString());
        } else if (e.t === 'exam-qualified') {
            w('');
            w('  ◆ 【取得應試資格】「' + e.rank + '」站的 ' + e.units + ' 個必通關卡（'
                + e.requiredClears + ' 局）已全部修畢　文錢 ' + e.silver.toLocaleString());
        } else if (e.t === 'exam-start') {
            w('  ┌─ 【應試】' + e.rank + '　' + ({ real: '正式考', mock: '模擬考', skip: '越級考' }[e.mode] || e.mode)
                + '　報名費 ' + e.fee.toLocaleString() + ' 文錢（付前餘額 ' + e.silver.toLocaleString() + '）');
            w('  │  考卷：' + e.poems + ' 首詩 × ' + e.perPoem + ' 題 = ' + e.total
                + ' 題，及格 ' + e.passCount + ' 題');
            w('  │  範圍：' + (e.scope || []).join('、'));
        } else if (e.t === 'exam-q') {
            w('  │  [第 ' + String(e.i).padStart(3) + '/' + e.total + ' 題] '
                + gname(e.gameNo).padEnd(14) + ' 詩' + String(e.poemId).padStart(4)
                + ' ' + String(titleOf(e.poemId)).padEnd(18) + (e.correct ? ' ✓' : ' ✗'));
        } else if (e.t === 'exam-result') {
            w('  │  結果：答對 ' + e.correct + ' / ' + e.total + '（及格線 ' + e.passCount + '）→ '
                + (e.passed ? '★ 金榜題名' : '落榜'));
            if (e.passed) w('  │  文位獎勵 ' + money(e.gained) + ' 文錢 → 餘 ' + e.silver.toLocaleString());
            else w('  │  報名費不予退還；文錢餘 ' + e.silver.toLocaleString());
            w('  └─ 目前文位：' + e.rankNow);
        } else if (e.t === 'cert') {
            w('  🏆 【獎狀】' + e.name + (e.isExamPass ? '（考試通過·冊封）' : '（抵達晉升）')
                + '　文錢 ' + money(e.silver));
        } else if (e.t === 'silver-short') {
            w('  ⚠ 【盤纏不足】應試「' + e.rank + '」需 ' + e.need.toLocaleString()
                + ' 文錢，實有 ' + e.had.toLocaleString()
                + '（模擬環境自動補足以便繼續；實際玩家必須先賺錢）');
        }
    });

    // ── 收尾統計 ────────────────────────────────────────────────────────
    const examPass = F.exams.filter(function (e) { return e.passed; });
    const examFail = F.exams.filter(function (e) { return !e.passed; });
    const feeTotal = F.exams.reduce(function (a, e) { return a + (e.fee || 0); }, 0);
    const rankSilver = examPass.reduce(function (a, e) { return a + (e.gained || 0); }, 0);
    const promoSilver = Object.keys(F.silverBy).reduce(function (a, k) { return a + F.silverBy[k]; }, 0);

    w('');
    w('═'.repeat(100));
    w('  總結');
    w('═'.repeat(100));
    w('  最終文位　　：' + SM.getEffectiveRank(SM.loadPlayerData())
        + '　（第 ' + F.finalIdx + ' 站「' + stations[F.finalIdx].name + '」）');
    w('  已學詩詞　　：' + LP.getPathPoemCount() + ' / ' + PS.getTotalPoems() + ' 首');
    w('  累計局數　　：' + F.pathRounds.toLocaleString() + ' 局（實際過關 ' + (F.wins || 0).toLocaleString() + '）');
    w('  雲端 LOG 筆數：' + F.cloudLogs.length.toLocaleString() + ' 筆 game_logs');
    w('');
    w('  ── 積分 ──');
    w('    遊戲得分合計　：' + (F.playScore || 0).toLocaleString() + ' 分');
    w('    存檔總積分　　：' + (F.finalScore || 0).toLocaleString() + ' 分');
    w('');
    w('  ── 文錢 ──');
    w('    起始　　　　　：888');
    w('    遊戲收入　　　：' + Math.floor((F.playScore || 0) / 100).toLocaleString()
        + '（100 分 = 1 文錢）');
    w('    小站晉升收入　：' + promoSilver.toLocaleString());
    w('    文位冊封收入　：' + rankSilver.toLocaleString());
    w('    報名費支出　　：-' + feeTotal.toLocaleString()
        + '（' + F.exams.length + ' 場：通過 ' + examPass.length + '、落榜 ' + examFail.length + '）');
    w('    模擬補足　　　：' + (F.toppedUp || 0).toLocaleString()
        + (F.silverLow.length ? ('　← 有 ' + F.silverLow.length + ' 場付不出報名費') : '　（全程都付得起）'));
    w('    最終餘額　　　：' + (F.finalSilver || 0).toLocaleString());
    w('');
    w('  ── 考試 ──');
    F.exams.forEach(function (e, i) {
        if (i === 0 || F.exams[i - 1].rank !== e.rank) {
            const all = F.exams.filter(function (x) { return x.rank === e.rank; });
            w('    ' + e.rank.padEnd(5) + ' 應試 ' + all.length + ' 次　報名費合計 '
                + all.reduce(function (a, x) { return a + x.fee; }, 0).toLocaleString()
                + '　冊封獎勵 ' + all.reduce(function (a, x) { return a + x.gained; }, 0).toLocaleString());
        }
    });
    w('═'.repeat(100));

    const fs = require('fs');
    const path = require('path');
    const outPath = process.env.FM_REPORT_OUT
        || path.join(env.rootDir, 'tools', 'out', '青雲梯歷程LOG.txt');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, L.join('\n'), 'utf8');

    console.log('  報表已輸出：' + outPath);
    console.log('  共 ' + L.length.toLocaleString() + ' 行、'
        + (fs.statSync(outPath).size / 1024 / 1024).toFixed(2) + ' MB');
    console.log('');
    L.slice(-30).forEach(function (line) { console.log('  ' + line); });

    // 報表本身也順便當一次驗收
    check(F.finalIdx === stations.length - 1, '報表', '走完全程到最後一站', '');
    check(F.cloudLogs.length === (F.wins || 0), '報表',
        '每一局勝利都寫了一筆 game_logs（' + F.cloudLogs.length + ' 筆）',
        '實際 ' + F.cloudLogs.length + ' 筆 vs 勝場 ' + (F.wins || 0));
    const noPoem = F.cloudLogs.filter(function (x) { return x.poem_id == null; });
    check(noPoem.length === 0, '報表', '每一筆 game_logs 都記到了 poem_id',
        noPoem.length + ' 筆是 null —— 事後無法稽核「這一局在背哪一首詩」');
    const noStation = F.cloudLogs.filter(function (x) { return !x.station_name; });
    check(noStation.length === 0, '報表', '每一筆 game_logs 都記到了 station_name',
        noStation.length + ' 筆是空的');
    const notRanked = F.cloudLogs.filter(function (x) { return !x.is_ranked; });
    check(notRanked.length === 0, '報表', '青雲梯的每一局都標記為 is_ranked',
        notRanked.length + ' 筆被記成自由練習');
}

// ══════════════════════════════════════════════════════════════════════
//  執行
// ══════════════════════════════════════════════════════════════════════
if (runGames) verifyGames();
if (runPoems) verifyPoemDispatch();
if (runPath) { verifyTables(); verifyStations(); }
if (runFlow) verifyFlow();
if (runExam) verifyExam();
// ⚠️ 破壞性測試必須排在潔淨度（第 7 節）**之前**：它會反覆開關考試沙箱，
//    正好讓第 7 節順便驗證這些亂來的路徑有沒有漏還原全域函式。
if (runAbuse) verifyExamAbuse();
if (runChaos) verifyChaos();
if (runHygiene) verifyHygiene();
if (runKeys) verifyLevelKeys();
if (runMoney) verifyMoney();
if (runReport) writeReport();

// ── 總結 ────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(74));
console.log('通過 ' + results.pass + ' 項　❌ ' + results.fail.length + ' 項　⚠ ' + results.warn.length + ' 項');
if (results.fail.length) {
    console.log('\n必須修正：');
    results.fail.forEach((f, i) => console.log('  ' + (i + 1) + '. [' + f.scope + '] ' + f.msg));
    console.log('\n對照文件：');
    console.log('  · note/青雲梯與獎勵企畫書/青雲梯遊戲接入規範與已知錯誤.md');
    console.log('  · note/青雲梯與獎勵企畫書/文位升等已知錯誤紀錄.md');
}
if (results.warn.length && !VERBOSE) {
    console.log('\n（' + results.warn.length + ' 項提醒不影響通過與否，加 -v 可看完整清單）');
}
console.log(results.fail.length ? '\n結果：✗ 未通過' : '\n結果：✓ 全數通過');
process.exit(results.fail.length ? 1 : 0);
