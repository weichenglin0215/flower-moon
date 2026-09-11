/* ============================================================================
 * examConfig.js —《花月》考試規則層（純資料與計算，不碰畫面）
 * ----------------------------------------------------------------------------
 * 對應規劃：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md
 *
 * ⭐ 這一層負責回答的問題（全部可單獨驗證，不需要開遊戲）
 *     · 這個文位的考試範圍涵蓋哪些詩？
 *     · 一共幾題？要對幾題才及格？
 *     · 今天還能不能考（模擬考／正式考各自一天一次）？
 *     · 越級考試現在可以考哪些文位？哪些要半透明？
 *     · 越級考試要把遊戲改得多嚴？
 *
 * ⚠️ 刻意與 examEngine.js（實際跑遊戲的引擎）分開：
 *    規則可以用純函式驗證到底，引擎則必須真的開遊戲才能測。
 *    兩者混在一起會導致「規則對不對」永遠只能靠玩一次才知道。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 考試使用的八款遊戲（正式考、模擬考、越級考試共用）──────────────
    // ⚠️ 這八款是作者定案。其餘遊戲（含尚未完工的 26／29／32／34／35）
    //    因為不在這份名單裡，自然不會被抽到，不需要另外維護排除清單。
    // ⚠️ game33「作者是誰」2026-09 加入：原本因為選詩邏輯未接
    //    getSharedRandomPoem 而被排除（見 learningPath.js 的 REVIEW_ONLY_GAMES
    //    註解），已改接 getSharedRandomPoem／LevelTable，同一關能鎖定同一首詩，
    //    符合考試「必須鎖題」的要求，故一併移入必通關卡與此份考試名單。
    // ⚠️ game4「眾裡尋他」、game16「打地詩」2026-09 加入：兩款本來就已經接
    //    getSharedRandomPoem（game4 更早就是青雲梯必通關卡），單純還沒被排進
    //    考試名單，這次一併補上。
    const EXAM_GAMES = [13, 20, 3, 14, 37, 33, 4, 16];   // 人事時地／丟三落一／字爬梯／步步驚心／步步為陣／作者是誰／眾裡尋他／打地詩

    const EXAM_GAME_NAMES = {
        13: '人事時地', 20: '丟三落一', 3: '字爬梯', 14: '步步驚心', 37: '步步為陣', 33: '作者是誰',
        4: '眾裡尋他', 16: '打地詩'
    };

    /* ------------------------------------------------------------------
     *  八款遊戲的出題比例（作者定案 2026-09-01；33 於 2026-09 加入；4／16 於 2026-09 加入）
     *
     *      人事時地 : 丟三落一 : 字爬梯 : 步步驚心 : 步步為陣 : 作者是誰 : 眾裡尋他 : 打地詩
     *          2    :    2    :   1   :    1    :    1   :    1    :    1    :   1
     *
     *  ⚠️ 為什麼要加權：原五款等機率時，字爬梯／步步驚心／步步為陣三款
     *     全都屬於「字序記憶」通道，合計佔了 3/5，整張考卷有六成是
     *     逐字提取的長題目，玩家反應字序類題目過多。
     *     提高人事時地（背景知識）與丟三落一（語感）的比例後，
     *     字序類降到 3/7，考卷的通道分布才接近青雲梯平常的節奏。
     *
     *  作者是誰同屬「背景知識」通道，給權重 1（與字爬梯/步步驚心/步步為陣同級，
     *  不搶人事時地的比重）。眾裡尋他屬「語感」通道、打地詩屬「字序」通道，
     *  同樣各給權重 1，不特別加碼——語感已有丟三落一佔權重 2，字序加入打地詩後
     *  合計 4/9，若都給高權重會把字序比例推回過半，違背當初加權的初衷。
     *
     *  改比例只要改這張表；權重為 0 等同不出這一款（但仍留在候選清單裡，
     *  遇到某首詩只有它出得了題時，examEngine 的改派機制照樣找得到它）。
     * ---------------------------------------------------------------- */
    const EXAM_GAME_WEIGHTS = { 13: 2, 20: 2, 3: 1, 14: 1, 37: 1, 33: 1, 4: 1, 16: 1 };

    /** 依 EXAM_GAME_WEIGHTS 加權隨機挑一款考試遊戲 */
    function pickWeightedExamGame() {
        let total = 0;
        for (let i = 0; i < EXAM_GAMES.length; i++) {
            total += EXAM_GAME_WEIGHTS[EXAM_GAMES[i]] || 0;
        }
        // 全部權重為 0（設定被改壞）時退回等機率，至少不會出不了題
        if (total <= 0) return EXAM_GAMES[Math.floor(Math.random() * EXAM_GAMES.length)];

        let r = Math.random() * total;
        for (let i = 0; i < EXAM_GAMES.length; i++) {
            r -= (EXAM_GAME_WEIGHTS[EXAM_GAMES[i]] || 0);
            if (r < 0) return EXAM_GAMES[i];
        }
        return EXAM_GAMES[EXAM_GAMES.length - 1];   // 浮點誤差保底
    }

    /* ========================================================================
     *  ⭐⭐ 每個文位的考試參數 ⭐⭐
     *  ------------------------------------------------------------------
     *  perPoem : 這個文位的考試，每一首詩出幾題
     *  pass    : 及格比例，用分數表示（不是小數）
     *
     *  ⚠️ 及格比例一定要用分數，不能寫成 0.67 這種小數。
     *     24 題的 2/3 剛好是 16 題，但 24 × 0.67 = 16.08，
     *     無條件進位後變成 17 題 —— 平白多要一題，與作者定案不符。
     *     分數運算則永遠精準。
     * ===================================================================== */
    const RANK_EXAM = {
        '塾生': { perPoem: 2, pass: [2, 3] },
        '童生': { perPoem: 2, pass: [2, 3] },
        '縣案首': { perPoem: 2, pass: [4, 5] },
        '府案首': { perPoem: 2, pass: [4, 5] },
        '文童': { perPoem: 2, pass: [4, 5] },
        '秀才': { perPoem: 2, pass: [17, 20] },
        '舉人': { perPoem: 2, pass: [17, 20] },
        '貢士': { perPoem: 2, pass: [17, 20] },
        '進士': { perPoem: 2, pass: [17, 20] },
        '探花': { perPoem: 2, pass: [17, 20] },
        '榜眼': { perPoem: 2, pass: [17, 20] },
        '狀元': { perPoem: 2, pass: [17, 20] },
        '大儒': { perPoem: 2, pass: [17, 20] }
    };

    // 某個文位在 RANK_EXAM 裡沒有設定時的預設考試規則。
    // ⚠️ 存在的理由：RANK_EXAM 是「規則參數表」，而「有哪些文位要考試」
    //    已改由 PathStations 推導。萬一日後有人在 RANK_TABLE 加了新文位
    //    卻忘了在這裡補參數，有了預設值就只是「用了預設難度」，
    //    而不是 getPlan() 回 null、考試整個開不起來。
    const DEFAULT_EXAM_RULE = { perPoem: 2, pass: [17, 20] };

    /**
     * 需應試文位的順序（由低到高）。
     *
     * ⚠️⚠️ 這裡曾經是一份手抄的字串陣列，與 collection.js、scoreManager.js
     *    各有一份完全相同的副本，三份都靠人力保持同步。實測證明這行不通
     *    （見企畫書附錄 F 問題④：一次前移造成 240 文錢靜默漏發）。
     *    現改為向 PathStations 取得唯一真本。
     *
     * ⚠️ 用函式而非載入時的常數，是為了完全不依賴 script 標籤的先後順序：
     *    就算日後有人把 examConfig.js 移到 pathStations.js 前面，
     *    第一次真正呼叫時 PathStations 也早就載入好了。
     */
    function getExamRankOrder() {
        const PS = (typeof window !== 'undefined') && window.PathStations;
        if (PS && typeof PS.getExamRankNames === 'function') {
            const list = PS.getExamRankNames();
            if (list && list.length) return list;
        }
        // 退路：PathStations 尚未載入時，退回 RANK_EXAM 自己的鍵。
        // 順序與 RANK_TABLE 一致（物件字面值保留插入順序），僅供極端情況保命。
        console.warn('[考試] PathStations 尚未載入，文位順序退回 RANK_EXAM 的鍵');
        return Object.keys(RANK_EXAM);
    }

    /* ========================================================================
     *  ⭐⭐ 越級考試參數 ⭐⭐
     * ===================================================================== */

    // 越級考試的及格比例（比一般考試嚴：90%）
    const SKIP_PASS = [9, 10];

    // 紅心減半：無條件進位，且至少保留 1 顆
    // ⚠️ 原本就只有 1 顆紅心的遊戲，ceil(1/2)=1，等於沒有變嚴。
    //    這是規則本身的自然結果，不是 bug —— 已經只剩一次機會，
    //    沒有更嚴的空間了。目前八款遊戲在各難度層最少是 1 顆，
    //    因此高難度層的越級考試強度與一般考試相同，屬預期行為。
    const SKIP_HEART_DIVISOR = 2;
    const SKIP_HEART_MIN = 1;

    // 沒有紅心的遊戲改為縮短時間到 70%
    // ⚠️ 目前八款遊戲**全部都有** maxMistakeCount，所以這條路徑實際上
    //    不會被走到。保留是為了日後若把沒有紅心的遊戲加進 EXAM_GAMES，
    //    規則已經在這裡、不必臨時補。
    const SKIP_TIME_RATIO = 0.7;

    // ── 小考（小站考試）的規則（作者 2026-09-06 定案）────────────────────
    //   通過 → 文錢 ＋ 解鎖下一站；**不給文位、不給獎狀**。
    //   及格線刻意比文位考寬鬆：它是章節檢核，不是功名考試。
    //   高階文位考是 85%（17/20），小考一律 2/3。
    const MINOR_PASS = [2, 3];
    const MINOR_PER_POEM = 2;
    //   免報名費：小考是課程的一部分，不該再收一次錢；
    //   而且改版後考試場次由 13 場增為 33 場，若每場都收費，
    //   後段文位的盤纏缺口會再擴大一倍以上（見第 8 節收支分析）。
    const MINOR_FEE = 0;
    //   通過獎勵：該文位獎勵的 1/4（無條件捨去，最低 1）。
    const MINOR_REWARD_DIVISOR = 4;

    // 越級考試可以考哪些文位（塾生以上）
    const SKIP_MIN_RANK = '塾生';
    // 「文童以下可任選」的分界；到達這個文位之後只能依序考
    const SKIP_FREE_CHOICE_UNTIL = '文童';
    // 文童之後只能依序考的四階
    const SKIP_SEQUENTIAL_RANKS = ['秀才', '舉人', '貢士', '進士'];

    // 越級考試報名費 = 目標文位的一般報名費 × 這個倍率
    // ⚠️ 作者只說「要收費」沒指定金額，這裡先訂 2 倍並集中在這裡，
    //    要改金額改這一個數字即可。
    const SKIP_FEE_MULTIPLIER = 2;

    /* ========================================================================
     *  ⭐ 文位考的報名費（全站唯一一份）
     *  ------------------------------------------------------------------
     *  ⚠️ 2026-09-11 從 `collection.js` 搬來這裡。
     *     原本這張表住在江南小院，因為報名手續辦在「考棚」；
     *     考棚取消、考試一律改由青雲梯就地進入之後，
     *     費用表留在小院等於讓「規則」寄生在「場景」裡——
     *     小院只要改版就可能把報名費一起弄壞，而且
     *     `learningPath.getExamFee()` 是透過 `CollectionDialog.getExamFee()`
     *     轉呼叫的，小院一旦沒載入，報名費會**靜靜地變成 0**
     *     （fallback `return 0`），所有考試變免費且不會有任何錯誤訊息。
     *     規則層（本檔）才是它該待的地方。
     *
     *  舊版問題：進士～狀元全部卡在 10000 不再成長，但玩家在研究所階段
     *  的文錢收入是小學的 15 倍，等於後期考試形同免費、失去份量。
     *  ⚠️ 塾生／童生是 2026-08-28 考試門檻前移後新增的兩個應試文位。
     *     金額沿用「逐級加倍」的節奏往回推（縣案首 300 → 童生 150 → 塾生 75），
     *     刻意壓得很低：這兩場的定位是「讓新手先熟悉考試流程」的教學局。
     * ===================================================================== */
    const EXAM_FEES = {
        '塾生': 75, '童生': 150,
        '縣案首': 300, '府案首': 600, '文童': 1200, '秀才': 2400,
        '舉人': 4800, '貢士': 7200,
        '進士': 14400, '探花': 28800, '榜眼': 57600,
        '狀元': 115200, '大儒': 230400
    };

    /* ========================================================================
     *  ⭐ 每日應試次數上限（作者 2026-09-11 定案）
     *  ------------------------------------------------------------------
     *    real  正式考   不限次數 —— 節流機制只有「文錢」，考越多次越貴
     *    mock  模擬考   每日 5 次 —— 免費，但不能無限刷，否則等於直接看考卷
     *    skip  越級考   每日 5 次 —— 要收 2 倍報名費，次數限制是第二道閘
     *
     *  ⚠️ 0 代表「不限次數」，不是「不能考」。
     *  ⚠️ 次數是**逐場**計算的（以站名為鍵），不是全域共用：
     *     玩家同一天在不同文位各考 5 次是允許的，
     *     限制的是「同一場考試反覆刷」。
     * ===================================================================== */
    const EXAM_DAILY_LIMITS = { real: 0, mock: 5, skip: 5 };

    const FMExamConfig = {

        EXAM_GAMES: EXAM_GAMES,
        EXAM_GAME_NAMES: EXAM_GAME_NAMES,
        EXAM_GAME_WEIGHTS: EXAM_GAME_WEIGHTS,
        pickWeightedExamGame: pickWeightedExamGame,
        SKIP_SEQUENTIAL_RANKS: SKIP_SEQUENTIAL_RANKS,

        // 需應試文位的順序。用 getter 即時向 PathStations 取，
        // 呼叫端維持 `C.EXAM_RANK_ORDER` 的既有寫法不必改。
        get EXAM_RANK_ORDER() { return getExamRankOrder(); },
        SKIP_FEE_MULTIPLIER: SKIP_FEE_MULTIPLIER,
        SKIP_TIME_RATIO: SKIP_TIME_RATIO,

        /**
         * 這個文位需要考試嗎。
         * ⚠️ 以 PathStations（唯一真本）為準，不再看 RANK_EXAM 有沒有這個鍵 ——
         *    RANK_EXAM 是「考試難度參數表」，不是「哪些文位要考」的名單。
         *    兩件事混用，就會發生「忘了補參數 ⇒ 這個文位悄悄變成免考」。
         */
        isExamRank: function (rankName) {
            const PS = (typeof window !== 'undefined') && window.PathStations;
            if (PS && typeof PS.isExamRank === 'function') return PS.isExamRank(rankName);
            return !!RANK_EXAM[rankName];
        },

        /** 取得某文位的考試規則參數（查無設定時退回預設，不會回 null） */
        getExamRule: function (rankName) {
            return RANK_EXAM[rankName] || DEFAULT_EXAM_RULE;
        },

        /**
         * 這個文位的考試範圍涵蓋哪些站點。
         *
         * 規則：從「上一個文位站的下一站」到「這個文位站」為止。
         *   例：塾生 → 蒙童二階、蒙童三階、準塾生、塾生（4 站 8 首）
         *       大儒 → 狀元二階 … 準大儒、大儒
         *
         * ⚠️ 這與 promotionCelebration._collectLines 的取材範圍是同一套定義
         *    （「這個文位期間學了哪些詩」），兩者刻意一致：
         *    晉升動畫上鋪的詩，就是接下來考試會考的詩。
         *
         * @returns {Array} 站點物件陣列；找不到文位時回空陣列
         */
        getScopeStations: function (rankName) {
            const PS = window.PathStations;
            if (!PS || !this.isExamRank(rankName)) return [];
            const stations = PS.build();

            let at = -1;
            for (let i = 0; i < stations.length; i++) {
                if (stations[i].type === 'rank' && stations[i].name === rankName) { at = i; break; }
            }
            if (at < 0) return [];

            // 從 at 往前收，碰到上一個文位站就停（不含該站）
            let from = at;
            for (let i = at - 1; i >= 0 && stations[i].type !== 'rank'; i--) from = i;
            return stations.slice(from, at + 1);
        },

        /**
         * 這個文位的考試範圍涵蓋哪些詩（poemId 陣列，依學習順序）。
         */
        getScopePoemIds: function (rankName) {
            const out = [];
            this.getScopeStations(rankName).forEach(function (st) {
                (st.poemIds || []).forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
            });
            return out;
        },

        /**
         * 算出一場考試的完整規格。
         *
         * @param {string} rankName 應試文位
         * @param {boolean} [isSkip] 是否為越級考試（及格線改用 90%）
         * @returns {{rankName, poemIds, perPoem, totalQuestions,
         *            passCount, passRateText, stationNames}}
         */
        getPlan: function (rankName, isSkip) {
            // 需不需要考試以 PathStations 為準；難度參數查不到就用預設值。
            if (!this.isExamRank(rankName)) return null;
            const PS = window.PathStations;
            if (!PS || typeof PS.getStationByName !== 'function') return null;
            // ⚠️ 2026-09-06 起考卷一律由「站點」算出來（範圍＝上一場考試之後
            //    到這一站），文位名只是拿來找到那個文位站。舊的
            //    getScopeStations(文位名) 定義是「上一個文位站之後」，
            //    加入小考之後不再成立 —— 同一批詩會被小考與文位考各考一次。
            const st = PS.getStationByName(rankName);
            if (!st || st.type !== 'rank') return null;
            return this.getPlanForStation(st, isSkip);
        },

        MINOR_PASS: MINOR_PASS,
        MINOR_FEE: MINOR_FEE,
        MINOR_REWARD_DIVISOR: MINOR_REWARD_DIVISOR,

        /**
         * 算出「某一站的考試」的完整規格。
         *
         * 這是 2026-09-06 改版後的主要入口：考試不再只掛在文位站上，
         * 每累積約 12 首詩就有一場（見 PathStations._markExams）。
         *
         *   文位考（examKind='rank'） 通過 → 獎狀 ＋ 文位 ＋ 文位獎勵 ＋ 解鎖
         *   小考  （examKind='minor'）通過 → 文錢 ＋ 解鎖（不給文位、不給獎狀）
         *
         * @param {object} station PathStations.build() 裡的站點物件
         * @param {boolean} [isSkip] 越級考（只有文位考會用到）
         * @returns {object|null} 這一站沒有考試時回 null
         */
        getPlanForStation: function (station, isSkip) {
            const PS = window.PathStations;
            if (!PS || !station || !station.examKind) return null;

            const scope = PS.getExamScopeStations(station);
            const poemIds = [];
            scope.forEach(function (st) {
                (st.poemIds || []).forEach(function (id) {
                    if (poemIds.indexOf(id) < 0) poemIds.push(id);
                });
            });

            const isRank = (station.examKind === 'rank');
            const cfg = isRank ? this.getExamRule(station.name) : null;
            const perPoem = isRank ? cfg.perPoem : MINOR_PER_POEM;
            const total = poemIds.length * perPoem;
            const pass = isSkip ? SKIP_PASS : (isRank ? cfg.pass : MINOR_PASS);
            const passCount = Math.ceil(total * pass[0] / pass[1]);

            return {
                // 考試的識別碼一律用**站名**：文位考的站名剛好就是文位名，
                // 小考則沒有文位可用。通過紀錄也以它為鍵。
                examId: station.name,
                kind: station.examKind,
                rankName: isRank ? station.name : null,
                stationName: station.name,
                isSkip: !!isSkip,
                poemIds: poemIds,
                perPoem: perPoem,
                totalQuestions: total,
                passCount: passCount,
                passRateText: Math.round(pass[0] / pass[1] * 100) + '%',
                stationNames: scope.map(function (s) { return s.name; })
            };
        },

        /** 這一站的考試是否已經通過（文位考看 ranks.passed，小考看 exams.minorPassed） */
        isExamPassed: function (coll, station) {
            if (!coll || !station || !station.examKind) return true;
            if (station.examKind === 'rank') {
                return ((coll.ranks && coll.ranks.passed) || []).indexOf(station.name) >= 0;
            }
            return ((coll.exams && coll.exams.minorPassed) || []).indexOf(station.name) >= 0;
        },

        /**
         * 產生題目清單：每一首詩出 perPoem 題，每一題各自**加權**挑一款遊戲。
         *
         * ⚠️ 「每題各自隨機」是作者定案，不是「一首詩固定用同一款遊戲」。
         *    因此同一首詩的多題有機會抽到同一款遊戲兩次，這是預期行為。
         *
         * ⚠️ 挑選走 pickWeightedExamGame()，比例見 EXAM_GAME_WEIGHTS
         *    （人事時地與丟三落一各佔 2/7，其餘三款各 1/7）。
         *
         * @returns {Array<{poemId:number, gameNo:number, index:number}>}
         */
        buildQuestions: function (plan) {
            if (!plan) return [];
            const list = [];
            plan.poemIds.forEach(function (pid) {
                for (let k = 0; k < plan.perPoem; k++) {
                    list.push({ poemId: pid, gameNo: pickWeightedExamGame(), index: 0 });
                }
            });
            // 洗牌，避免同一首詩的題目全部連在一起
            for (let i = list.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = list[i]; list[i] = list[j]; list[j] = t;
            }
            list.forEach(function (q, i) { q.index = i; });
            return list;
        },

        /**
         * 越級考試用：把某一款遊戲在某難度層的設定調嚴。
         *
         * 規則（作者定案）：
         *   · 有紅心 → 紅心數減半，無條件進位，最少保留 1 顆
         *   · 沒紅心 → 遊戲時間縮短為 70%
         *
         * ⚠️ 回傳的是「要覆寫哪些欄位」，不直接改遊戲物件——
         *    由 examEngine 負責套用與還原，避免改壞了留在遊戲身上。
         *
         * @param {object} settings 該遊戲該難度層的 difficultySettings 物件
         * @returns {object} 要覆寫的欄位；沒有可調的就回空物件
         */
        getSkipOverrides: function (settings) {
            if (!settings) return {};
            const out = {};

            if (typeof settings.maxMistakeCount === 'number' && settings.maxMistakeCount > 0) {
                out.maxMistakeCount = Math.max(SKIP_HEART_MIN,
                    Math.ceil(settings.maxMistakeCount / SKIP_HEART_DIVISOR));
                return out;
            }

            // 沒有紅心 → 改縮短時間。各遊戲的時間欄位名稱各不相同，
            // 這裡把已知的都列出來，有哪個就縮哪個。
            ['timeLimit', 'timeLimitRate', 'timeMutiply'].forEach(function (k) {
                if (typeof settings[k] === 'number' && settings[k] > 0) {
                    out[k] = settings[k] * SKIP_TIME_RATIO;
                }
            });
            return out;
        },

        /* ====================================================================
         *  越級考試：可以考哪些文位
         * ================================================================= */

        /**
         * 產生越級考試選單。
         *
         * 規則（作者定案）：
         *   · 一律列出所有可越級的文位（塾生～進士），不能點的半透明顯示
         *   · 玩家目前文位 < 文童 → 塾生～文童之間、且高於目前文位者皆可點
         *   · 玩家目前文位 >= 文童 → 只剩秀才～進士，且只有「下一個」可點
         *
         * @param {string} currentRank 玩家目前的有效文位
         * @returns {Array<{name:string, enabled:boolean, reason:string}>}
         */
        getSkipMenu: function () {
            const PS = window.PathStations;
            const S = window.FMCollectionSave;
            if (!PS || !S) return [];
            let coll = null;
            try { coll = S.load(); } catch (e) { return []; }

            const stations = PS.build();
            const menu = [];
            let nextFound = false;

            for (let i = 0; i < stations.length; i++) {
                const st = stations[i];
                if (!st.examKind) continue;
                const passed = this.isExamPassed(coll, st);

                let enabled = false, reason = '';
                if (passed) {
                    reason = '已通過';
                } else if (!nextFound) {
                    // ⚠️ 只有「下一個還沒通過的考試站」可以越級。
                    //    作者 2026-09-06 定案：越級考試必須**依序**通過每一場考試，
                    //    不能直接跳到某個文位考 —— 越級省的是「修課」，不是「考試」。
                    //    舊版可以從書僮直接報考進士，等於用錢買掉中間十幾場驗收。
                    enabled = true;
                    nextFound = true;
                } else {
                    reason = '須依序應考';
                }

                menu.push({
                    name: st.name,
                    kind: st.examKind,          // 'rank'（文位考）／'minor'（小考）
                    enabled: enabled,
                    reason: reason
                });
            }
            return menu;
        },

        /* ====================================================================
         *  每日應試次數的節流
         *
         *  ⚠️ 2026-09-11 由「一天一次」改為「一天 N 次」（見 EXAM_DAILY_LIMITS）。
         *     存檔格式同步從「日期字串」改為 `{ d: 日期, n: 次數 }`；
         *     舊存檔（字串）一律視為「那天考過 1 次」，見 _slotOf()。
         * ================================================================= */

        EXAM_DAILY_LIMITS: EXAM_DAILY_LIMITS,

        /** 今天的日期字串（Asia/Taipei，與雲端彙總表的分日一致） */
        today: function () {
            const d = new Date();
            // 用本地時間即可：玩家在哪個時區就以哪天為準，比強制台北更符合直覺
            return d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
        },

        /** 這一場考試今天的上限（0 = 不限次數） */
        dailyLimit: function (key) {
            const n = EXAM_DAILY_LIMITS[key];
            return (typeof n === 'number') ? n : 0;
        },

        /**
         * 讀出某一場考試「今天已經考了幾次」。
         *
         * ⚠️ 相容兩種格式：
         *    舊（一天一次時代）：`slot[rankName] = '2026-09-10'`（字串）
         *    新：                `slot[rankName] = { d: '2026-09-10', n: 3 }`
         *    舊格式若日期就是今天，視為已考 1 次；不是今天則視為 0 次。
         */
        _attemptsToday: function (coll, key, rankName) {
            const slot = ((coll && coll.examDaily) || {})[key] || {};
            const rec = slot[rankName];
            if (!rec) return 0;
            if (typeof rec === 'string') return (rec === this.today()) ? 1 : 0;
            if (rec.d !== this.today()) return 0;
            return Math.max(0, parseInt(rec.n, 10) || 0);
        },

        /**
         * 今天還剩幾次可以考。
         * @returns {number} 不限次數時回傳 Infinity
         */
        remainingToday: function (coll, key, rankName) {
            const limit = this.dailyLimit(key);
            if (limit <= 0) return Infinity;
            return Math.max(0, limit - this._attemptsToday(coll, key, rankName));
        },

        /**
         * 今天是否還能考。
         * @param {object} coll  FMCollectionSave.load() 的存檔
         * @param {string} key   'mock' | 'real' | 'skip'
         * @param {string} rankName
         */
        canAttemptToday: function (coll, key, rankName) {
            return this.remainingToday(coll, key, rankName) > 0;
        },

        /** 記下今天又考了一次（呼叫端負責 save） */
        markAttemptToday: function (coll, key, rankName) {
            if (!coll) return;
            if (!coll.examDaily) coll.examDaily = {};
            if (!coll.examDaily[key]) coll.examDaily[key] = {};
            const used = this._attemptsToday(coll, key, rankName);
            coll.examDaily[key][rankName] = { d: this.today(), n: used + 1 };
        },

        /** 報名費（全站唯一來源；小考免費由 LearningPath.getExamFee 處理） */
        getExamFee: function (rankName) {
            return EXAM_FEES[rankName] || 0;
        },

        EXAM_FEES: EXAM_FEES
    };

    if (typeof window !== 'undefined') window.FMExamConfig = FMExamConfig;
    if (typeof module !== 'undefined' && module.exports) module.exports = FMExamConfig;

})();
