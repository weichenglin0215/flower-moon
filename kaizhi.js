/* ============================================================================
 * kaizhi.js —《開枝散葉》色塊推理．舒壓觀想頁
 * ----------------------------------------------------------------------------
 * ⭐ 這是什麼玩法
 *   N×N 的盤面被分割成 N 個顏色區域，**每個區域都必須是一個長方形（含正方形）**，
 *   不能是任意形狀。開局時整個盤面是白紙，每個顏色只露出**一格**，格子上寫著
 *   這個顏色**總共有幾格**。要做的事就是把每個顏色的長方形找出來。
 *
 *   ⚠️ 這一頁**沒有炸彈**，跟《抽絲剝繭》是完全不同的題型，別把兩邊的規則搞混。
 *   這裡的規則是：① 每個顏色是一個長方形 ② 長方形的面積必須剛好等於它的數字
 *   ③ 長方形要蓋住自己的提示格 ④ 彼此不重疊，且剛好鋪滿整個盤面。
 *   （這正是日式邏輯謎題 **Shikaku／四角に切れ** 的規則。）
 *
 * ⭐ 這一頁是舒壓頁，不是遊戲
 *   玩家不用動手，看 AI 一格一格把顏色鋪出來。重點是「看起來像不像一個人在解」，
 *   所以 AI 會走錯、會卡住、會把擺錯的部分擦掉重來（見下面「表演」一節）。
 *   數字用 `已畫格數 / 目標格數` 的格式即時更新，玩家隨時知道每個顏色還差多少。
 *
 * ⭐ 出題（`_genBoard` → `_genPartition`）—— 大塊種中央＋逐格回溯填滿
 *   ① 先挑幾塊大面積的長方形，種在盤面中央附近（離中心最近的合法位置）。
 *   ② 剩下的空格用逐格回溯填滿：永遠從 row-major 第一個空格開始，那一格必定
 *      是某個長方形的左上角，列舉「以它為左上角」的所有形狀即可涵蓋所有分割。
 *   「每塊都是長方形」「不重疊」「剛好鋪滿」三件事天生成立，不必事後檢查，
 *   生成也永遠不會失敗到卡住（放置時不會留下孤立的單格空間，剩餘空間永遠能
 *   用小面積填滿）。每一塊再挑一格當提示格（大塊的盡量避開邊緣）。
 *   ⚠️ 面積 4/6/8/9/10 這種合成數會刻意避開 1×a 長條形、優先挑方正的拆法。
 *
 * ⭐ 難度（`_confusionScore`）—— 不是靠能不能解開評分
 *   直接量測畫面本身的視覺混淆程度：多個大尺寸、非長條形的區域彼此相鄰時，
 *   數字擠在一起最容易讓人選錯，這才是難度的來源，跟「能不能被邏輯推出來」
 *   沒有關係（盤面本來就保證解得開，見上）。
 *
 * ⭐ 表演（`_buildScript`）—— 這一頁真正的重點
 *   AI 其實知道答案，但要「演得像不知道」。做法不是照著答案畫一遍（那很無聊），
 *   而是：
 *     ① **真正的演繹**（`_deduce`）：兩條完全靠邏輯、不需要猜的規則——
 *        「某個顏色的長方形只剩一個位置放得下」→ 就是它；
 *        「某個空白格只有唯一一個長方形蓋得到」→ 那個長方形非放不可。
 *        這兩條在每一個合法解裡都成立，推得出來就不用猜。
 *     ② **挑選擇最少的顏色先畫**：挑目前可擺位置最少（或格數最少）的那一塊，
 *        是標準的 fail-fast 啟發式，而且講得出理由，看起來就很有章法。
 *     ③ **故意走錯，但錯得有道理**（`_findMistake`）：在動筆前先**私下模擬**
 *        一條錯路，只有在確認它「真的會撞牆」時才演出來。所以畫面上看到的每
 *        一次失敗都是被真正的規則檢查抓到的（某個顏色再也擺不下／某格再也沒有
 *        長方形蓋得到），不是硬演的。
 *     ④ **擦掉重來**：撞牆後先在要刪掉的格子上打紅色 ✕、同時用綠色虛線框標出
 *        「改成要擺這裡」，讓玩家看清楚意圖，停一拍之後才真的一格一格擦掉。
 *   ⚠️ 保證會結束：故意走錯的路一定先驗證過會失敗（所以一定會被擦掉），而
 *     「正確」的那條路直接照真解走，因此不會無限迴圈，也不會演到一半卡死。
 *
 * 依《.agent/skills/花月開發常見錯誤與解法.md §4》：
 *   - 全域 class 前綴 kaizhi-
 *   - loadCSS() 動態防護
 *   - overlay 掛載 document.body 且套用 registerOverlayResize
 *   - stopGame() 必須隱藏 container 並停掉 requestAnimationFrame
 * ========================================================================== */

(function () {
    'use strict';

    // =====================================================================
    // 可調參數
    // =====================================================================
    const STAGE_W = 500, STAGE_H = 850;   // 舞台（overlay）的邏輯尺寸，供 registerOverlayResize 縮放
    const BOARD_PX = 460;                 // 棋盤畫布的邊長（正方形）

    /**
     * ⭐ 盤面尺寸，以及每種尺寸**允許使用的面積**。這份表是照實際 Shikaku 遊戲的
     *   設定抄的，不是我自己推的：
     *     5×5 → 2,3,4          7×7 → 2,3,4,5,6
     *     9×9 → 2,3,4,5,6,8    11×11 → 2..9        13×13 → 2..10
     *   幾個看起來奇怪但有道理的地方：
     *   ⚠️ **9×9 跳過 7**：7 是質數，只有 1×7／7×1 兩種形狀，在 9 格寬的盤面上
     *      會變成一條幾乎貫穿全場的長條，又醜又突兀；但 8 有四種形狀（1×8/2×4/
     *      4×2/8×1）反而好用，所以留 8 去 7。
     *   ⚠️ **面積上限遠小於盤面寬度**（5×5 最大才 4、13×13 最大才 10）：避免出現
     *      一條打通整個盤面的長條。
     *   ⚠️ **完全不放行面積 1**：1 格的提示等於直接把答案寫在臉上。
     */
    const AREA_SETS = {
        5: [2, 3, 4],
        7: [2, 3, 4, 5, 6],
        9: [2, 3, 4, 5, 6, 8],
        11: [2, 3, 4, 5, 6, 7, 8, 9],
        13: [2, 3, 4, 5, 6, 7, 8, 9, 10],
    };
    const GRID_PRESETS = [5, 7, 9, 11, 13];   // 盤面寬度格數選項（一律正方形）

    /**
     * ⚠️ 長條形（1×a／a×1）洩漏的嚴重程度跟**長度**成正比：長度越長，光看兩端跟
     *   延伸方向就越容易反推出真正位置。分兩級處理：
     *   ① **質數面積（只拆得出長條，沒有方正選項可換）**：5、7 用配額限制每盤最多
     *      出現 LEAKY_QUOTA 次。2、3 不限制——它們是填滿零碎空間的主力，禁掉會讓
     *      回溯法填不滿，而且只有 2~3 格短，洩漏有限。
     *   ② **合成面積（4/6/9，本來就有方正選項可選）**：長條扣分依面積（＝長度）
     *      加重，見下方 dfs 內的 `strip` 分支。
     *   ③ **8、10 直接從候選形狀裡整個拿掉長條選項**——⚠️ 這兩個不能只靠「機率性
     *      扣分」壓低：扣分只在同一格有其他形狀可選時才有效，一旦剩餘空間剛好
     *      窄到只有長條塞得下，扣分再重也會被硬選中（這正是先前只調 5、7 配額、
     *      卻讓 8、10 的長條比例不降反升的根因——並非優先權跑掉，而是扣分機制
     *      本來就防不了「別無選擇」的情況）。8、10 都還有方正選項（2×4／4×2、
     *      2×5／5×2），拿掉長條選項後回溯法只是換一個形狀或換一格繼續找，
     *      不會讓生成整個失敗。
     */
    const LEAKY_AREAS = [5, 7];
    const LEAKY_QUOTA = 2;
    const STRIP_BANNED_AREAS = [8, 10];
    const DEFAULT_GRID = 7;               // 預設盤面
    const DEFAULT_DIFF = 'normal';        // 預設難度

    /** 一個面積有幾種「長×寬」的拆法。⚠️ 這是難度的核心指標之一：
     *  面積 8 有 1×8/2×4/4×2/8×1 四種，面積 7（質數）只有兩種——
     *  拆法越多，同一個數字能擺的位置就越多，越難。 */
    const shapeCount = (a) => { let n = 0; for (let h = 1; h <= a; h++) if (a % h === 0) n++; return n; };

    /**
     * ⭐ 難度定義。分成兩個層次：
     *   ① **出題偏好**（pref）——只是「讓題目比較可能落在目標難度」的引導，不是
     *      保證。⚠️ 允許的面積集合由 AREA_SETS 決定、**不隨難度改變**；難度只調整
     *      「在允許的面積裡偏好挑哪些」。偏好高合成數（擺法多）＋讓大小集中在
     *      平均值附近（大小相近才會互相干擾）＝難；偏好小面積與質數＝好啃的錨點。
     *   ② **實際評級**（tier）——⚠️ **不是靠能不能解開來評分**。使用者明確指出：
     *      放置時只要不留下孤立的單格空間（`_genPartition` 的逐格回溯本來就保證
     *      這件事），盤面一定生得出來、也一定解得開，不需要另外驗證；真正影響
     *      「這題感覺起來難不難」的，是玩家會不會被提示數字的位置搞混——多個大
     *      尺寸、非長條形的區域彼此相鄰時，數字擠在一起最容易讓人選錯。所以每
     *      一題都會跑 `_confusionScore` 直接從畫面本身量出「大塊非長條形區域彼此
     *      相鄰」的密集程度，換算成 1~4 級（見 `_tierOf`），顯示的是**實測出來的**
     *      難度，不是設定值。
     */
    /**
     * ⚠️ `pref` 只影響「挑哪些面積」，不影響「大塊擺在哪裡」——實測發現光靠 pref
     *   四種難度的混淆分數幾乎沒有差異（中位數都卡在 1.3~1.45），因為分數的來源
     *   是「大塊彼此相不相鄰」，那是空間擺放問題，不是面積挑選問題。所以另外加
     *   `cluster`：種大塊的階段直接控制「要不要往其他大塊旁邊靠」——正值＝越大
     *   越往其他大塊旁邊擠（越容易相鄰、越混淆＝越難），負值＝往其他大塊遠處躲
     *   （越不容易相鄰＝越簡單）。這才是真正決定畫面混淆程度的旋鈕。
     */
    const DIFFICULTIES = [
        {
            key: 'easy', label: '入門', tier: 1, cluster: -2.2,
            /** 偏好「形狀少」的面積（質數只有 1×a／a×1 兩種），擺法自然就少、好推。
             *  ⚠️ 不能像原本那樣重壓「面積 ≤3」：那會把盤面鋪滿 2 格骨牌，
             *    骨牌可以互相調換位置，題目幾乎不可能唯一，實測 9×9 以上連續
             *    80 次全部生不出唯一解。所以反而要**輕微避開面積 2**。 */
            pref: (a, avg) => (shapeCount(a) === 2 ? 3 : 0) - shapeCount(a) * 0.8 - (a === 2 ? 1.5 : 0),
        },
        {
            key: 'normal', label: '普通', tier: 2, cluster: 0,
            pref: () => 0,   // 不引導，純隨機
        },
        {
            key: 'hard', label: '困難', tier: 3, cluster: 2.2,
            pref: (a, avg) => shapeCount(a) - Math.abs(a - avg) * 0.4,
        },
        {
            key: 'expert', label: '專家', tier: 4, cluster: 4,
            pref: (a, avg) => shapeCount(a) * 1.5 - Math.abs(a - avg) * 0.8,
        },
    ];
    const diffOf = (key) => DIFFICULTIES.find(d => d.key === key) || DIFFICULTIES[1];
    const TIER_NAME = ['', '入門', '普通', '困難', '專家'];

    const SPEED_PRESETS = {
        // stepMs：講完一句旁白後停多久才開始動筆（讓觀眾讀完）
        // markMs：連續畫格子／擦格子時，每一格之間間隔多久
        slow: { label: '慢', stepMs: 3000, markMs: 400 },
        normal: { label: '正常', stepMs: 1500, markMs: 200 },
        fast: { label: '快', stepMs: 500, markMs: 50 },
    };
    const DEFAULT_SPEED = 'normal';

    const SAY_MS = 240;                   // 旁白本身出現前的極短停頓
    const AUTO_NEXT_MS = 5000;            // 全部畫完後，隔多久自動換下一題
    const FLASH_MS = 420;                 // 每一格剛畫上去時的擴散圓環持續時間

    const GEN_SLICE_MS = 60;              // 出題時每個 setTimeout 分片最多跑多久（毫秒）
    const GEN_MAX_ATTEMPTS = 400;         // 出題的總嘗試次數上限
    /** 整輪出題（含「一直重試直到命中目標難度」）的總時間上限。
     *  ⚠️ 只靠次數上限不夠：13×13 單題分析就可能要 400ms，400 次等於讓玩家
     *    乾等好幾十秒。時間到就採用目前最接近目標難度的那一題。 */
    const GEN_TOTAL_MS = 2500;
    /** 已經生出這麼多張「合格但難度沒中」的題目之後，就認賠採用最接近的那一張。
     *  ⚠️ 有些組合的目標難度**在數學上根本達不到**（大盤面切出二三十塊時，不可能
     *    整局只靠 D1 就推完，所以 9×9 以上永遠拿不到「入門」；5×5 太小則拿不到
     *    「專家」）。少了這個早停，那些組合每一輪都要空轉滿 2.5 秒才肯放棄。 */
    const GEN_ENOUGH = 25;

    /** 一輪最多演幾次「畫錯再擦掉」。太少看起來像開外掛，太多會拖戲。 */
    const mistakeBudget = (N) => (N <= 5 ? 1 : (N <= 7 ? 2 : 3));

    /** 幾格以上的長方形，提示格要盡量避開自己的邊緣（9 格以內幾何上頂多一個內部格）。 */
    const CLUE_INTERIOR_MIN = 10;

    /** 解題順序的兩種路數，每一輪隨機挑一種，看起來才不會每次都同一套。
     *    small —— 先擺格數少的顏色。小塊先佔了位置之後，輪到大塊時常常會發現
     *             放不下，得回頭把小的拆掉重擺，這種「後知後覺」的來回最像真人。
     *    tight —— 先擺目前可擺位置最少（選擇最受限）的顏色，是標準的 fail-fast
     *             解法。⚠️ 副作用是它很少走錯，看起來像「早就知道答案」。 */
    const STRATEGIES = ['small', 'tight'];

    /** 私下模擬錯路時，最多試幾個候選方向。 */
    const MISTAKE_TRIES = 6;

    /** 私下模擬時，往下多解幾個顏色才判定「這條路走不通」。
     *  ⚠️ 設 0（只看當下這一區）會讓大部分盤面一次錯誤都演不出來——盤面前期
     *    空白很多，畫錯一格當場不會爆炸，要再往下走個一兩區才看得出來卡死。 */
    const LOOKAHEAD_REGIONS = 3;

    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const shuffle = (a) => {
        for (let i = a.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    };

    // =====================================================================
    // 主模組
    // =====================================================================
    const KaiZhi = {
        container: null,      // 外層 overlay（div#kaizhi-container）
        canvas: null,         // 棋盤畫布
        ctx: null,            // 棋盤畫布的 2D context
        frameEl: null,        // 木框裝飾層（全部畫完時加上金光呼吸動畫）
        narrEl: null,         // 旁白文字節點
        tagEl: null,          // 旁白左側的標籤徽章

        // ── 設定 ──
        speedKey: DEFAULT_SPEED,
        gridN: DEFAULT_GRID,
        diffKey: DEFAULT_DIFF,

        // ── 本輪題目 ──
        puzzle: null,         // { N, owner, sizes, clues }
        cell: 0,              // 每一格的像素邊長
        hues: null,           // hues[g] = 第 g 個顏色的色相（度）

        // ── 畫面狀態 ──
        paint: null,          // Int16Array：目前畫在盤面上的顏色（-1 = 還是白紙）
        counts: null,         // counts[g] = 目前畫了幾格（提示格上顯示的分子）
        marks: null,          // Set：目前打著紅色 ✕、等著被擦掉的格
        plan: null,           // { del:[cells], add:[cells] } 修正意圖預覽，null = 沒有
        flashes: [],          // 剛動筆的格子的擴散圓環 {cell, t0, kind}

        // ── 播放狀態 ──
        queue: [],            // 微動作佇列
        qi: 0,                // 目前播到第幾個
        nextAt: 0,            // 下一個微動作的預定執行時間
        finished: false,
        finishedAt: 0,
        paused: false,
        lastTickAt: 0,        // 上一幀時間戳，暫停時用來把所有到期時間往後推

        // ── 出題狀態 ──
        generating: false,
        genToken: 0,          // 出題流水號：切換設定時遞增，讓舊的出題分片自動作廢
        genAttempts: 0,
        genBest: null,        // 目前試到「最接近目標難度」的一題，預算用完時的退路
        genStart: 0,          // 本輪出題的起始時間（總時間上限用）
        genValid: 0,          // 本輪已生出幾張合格但難度沒中的題（早停用）

        active: false,
        rafId: null,

        // =================================================================
        // DOM
        // =================================================================
        loadCSS: function () {
            if (!document.getElementById('kaizhi-css')) {
                const link = document.createElement('link');
                link.id = 'kaizhi-css';
                link.rel = 'stylesheet';
                link.href = 'kaizhi.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            const isFirst = !document.getElementById('kaizhi-container');
            if (isFirst) this.createDOM();
            this.container = document.getElementById('kaizhi-container');
            this.canvas = document.getElementById('kaizhi-canvas');
            this.frameEl = document.getElementById('kaizhi-canvas-frame');
            this.narrEl = document.getElementById('kaizhi-narration-text');
            this.tagEl = document.getElementById('kaizhi-narration-tag');
            this.ctx = this.canvas.getContext('2d');
            if (isFirst) { this.bindEvents(); this._paintLegend(); }
        },

        /** 圖例的符號用畫棋盤的同一組函式畫在小 canvas 上，確保跟盤面完全一致 */
        _paintLegend: function () {
            const paint = (id, fn) => {
                const cv = document.getElementById(id);
                if (!cv) return;
                const c = cv.getContext('2d');
                c.clearRect(0, 0, 26, 26);
                fn(c);
            };
            paint('kaizhi-legend-blank', c => {
                c.fillStyle = 'hsl(40, 30%, 96%)';
                c.fillRect(2, 2, 22, 22);
                c.strokeStyle = 'hsla(216, 30%, 30%, 0.35)';
                c.lineWidth = 1;
                c.strokeRect(2.5, 2.5, 21, 21);
            });
            paint('kaizhi-legend-fill', c => {
                c.fillStyle = 'hsl(134, 60%, 62%)';
                c.fillRect(2, 2, 22, 22);
                c.strokeStyle = 'hsl(216, 48%, 16%)';
                c.lineWidth = 2;
                c.strokeRect(3, 3, 20, 20);
            });
            paint('kaizhi-legend-del', c => {
                c.fillStyle = 'hsla(0, 85%, 55%, 0.22)';
                c.fillRect(2, 2, 22, 22);
                this._drawCross(c, 13, 13, 26);
            });
            paint('kaizhi-legend-add', c => {
                c.strokeStyle = 'hsl(142, 80%, 45%)';
                c.lineWidth = 2.5;
                c.setLineDash([4, 3]);
                c.strokeRect(3.5, 3.5, 19, 19);
            });
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'kaizhi-container';
            div.className = 'kaizhi-overlay hidden';
            div.innerHTML = `
                <div class="kaizhi-header">
                    <div class="kaizhi-title">開枝散葉</div>
                    <div class="kaizhi-subtitle">每個顏色都是一個長方形，數字是它的格數</div>
                </div>
                <div id="kaizhi-close" class="kaizhi-close" aria-label="關閉">✕</div>

                <div id="kaizhi-canvas-frame" class="kaizhi-canvas-frame">
                    <canvas id="kaizhi-canvas" width="${BOARD_PX}" height="${BOARD_PX}"></canvas>
                </div>

                <div class="kaizhi-legend">
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-blank" width="26" height="26"></canvas>還沒探索</span>
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-fill" width="26" height="26"></canvas>已畫上</span>
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-del" width="26" height="26"></canvas>準備擦掉</span>
                    <span class="kaizhi-legend-item"><canvas class="kaizhi-legend-icon" id="kaizhi-legend-add" width="26" height="26"></canvas>改畫這裡</span>
                </div>

                <div class="kaizhi-narration">
                    <div id="kaizhi-narration-tag" class="kaizhi-narration-tag">—</div>
                    <div id="kaizhi-narration-text" class="kaizhi-narration-text">準備出題…</div>
                </div>

                <div class="kaizhi-panel">
                    <div class="kaizhi-progress-wrap">
                        <div id="kaizhi-progress-bar" class="kaizhi-progress-bar"></div>
                        <div id="kaizhi-progress-text" class="kaizhi-progress-text"></div>
                    </div>
                    <div class="kaizhi-row">
                        <span class="kaizhi-row-label">盤面</span>
                        <div id="kaizhi-grid-group" class="kaizhi-btn-group"></div>
                        <span class="kaizhi-row-label">速度</span>
                        <div id="kaizhi-speed-group" class="kaizhi-btn-group"></div>
                    </div>
                    <div class="kaizhi-row">
                        <span class="kaizhi-row-label">難度</span>
                        <div id="kaizhi-diff-group" class="kaizhi-btn-group"></div>
                        <button id="kaizhi-pause" class="kaizhi-action-btn">暫停</button>
                        <button id="kaizhi-again" class="kaizhi-action-btn">換一題</button>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = STAGE_W + 'px';
                    div.style.height = STAGE_H + 'px';
                    div.style.transform = `scale(${r.scale})`;
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        bindEvents: function () {
            document.getElementById('kaizhi-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('kaizhi-again').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playConfirmItem(); }
                this.newRound();
            });
            document.getElementById('kaizhi-pause').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                this.paused = !this.paused;
                this._syncPauseBtn();
                this._updateProgress();
            });

            const gridGroup = document.getElementById('kaizhi-grid-group');
            GRID_PRESETS.forEach(n => {
                const btn = document.createElement('button');
                // ⚠️ 五種盤面 ＋ 速度三顆要擠在同一列，所以盤面鈕改窄、只寫數字
                //   （前面有「盤面」標籤，寫 5 就看得懂，寫 5×5 會排不下）
                btn.className = 'kaizhi-chip kaizhi-chip-tiny';
                btn.dataset.grid = n;
                btn.textContent = `${n}`;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.gridN = n;
                    this._syncChips();
                    this.newRound();
                });
                gridGroup.appendChild(btn);
            });

            const speedGroup = document.getElementById('kaizhi-speed-group');
            Object.keys(SPEED_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'kaizhi-chip kaizhi-chip-narrow';
                btn.dataset.speed = k;
                btn.textContent = SPEED_PRESETS[k].label;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.speedKey = k;
                    this._syncChips();
                });
                speedGroup.appendChild(btn);
            });

            const diffGroup = document.getElementById('kaizhi-diff-group');
            DIFFICULTIES.forEach(d => {
                const btn = document.createElement('button');
                btn.className = 'kaizhi-chip kaizhi-chip-narrow';
                btn.dataset.diff = d.key;
                btn.textContent = d.label;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.diffKey = d.key;
                    this._syncChips();
                    this.newRound();
                });
                diffGroup.appendChild(btn);
            });

            this._syncChips();
        },

        _syncPauseBtn: function () {
            const b = document.getElementById('kaizhi-pause');
            if (!b) return;
            b.textContent = this.paused ? '繼續' : '暫停';
            b.classList.toggle('kaizhi-action-btn-on', this.paused);
        },

        _syncChips: function () {
            document.querySelectorAll('#kaizhi-grid-group .kaizhi-chip').forEach(b => {
                b.classList.toggle('active', Number(b.dataset.grid) === this.gridN);
            });
            document.querySelectorAll('#kaizhi-diff-group .kaizhi-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.diff === this.diffKey);
            });
            document.querySelectorAll('#kaizhi-speed-group .kaizhi-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.speed === this.speedKey);
            });
        },

        // =================================================================
        // 顏色
        // =================================================================
        /**
         * ⚠️ 區域數量不再等於盤面寬度（13×13 可能切出三十幾塊），所以**不能再用
         *   「把 360° 平均分給每一塊」的做法**——三十幾塊時相鄰色相只差 10 度，
         *   根本分不出來。改用固定的一組色相 ＋ **貪心圖著色**：先算出哪些矩形彼此
         *   相鄰，再逐一指派「鄰居沒用過的最小色號」。矩形的相鄰關係是平面圖，
         *   理論上四色就夠，這裡給九色所以永遠夠用，而且保證**相鄰的兩塊絕不同色**。
         *   代價是同一種顏色會在盤面上重複出現——所以旁白改用「第幾行第幾列的幾」
         *   來指稱一塊，不再說「綠色那一塊」（那會有歧義）。
         */
        _assignHues: function (N, owner, count) {
            const PALETTE = [14, 44, 74, 134, 174, 204, 254, 294, 324];
            const adj = Array.from({ length: count }, () => new Set());
            for (let i = 0; i < N * N; i++) {
                const r = (i / N) | 0, c = i % N, g = owner[i];
                if (c + 1 < N) { const h = owner[i + 1]; if (h !== g) { adj[g].add(h); adj[h].add(g); } }
                if (r + 1 < N) { const h = owner[i + N]; if (h !== g) { adj[g].add(h); adj[h].add(g); } }
            }
            // 先處理鄰居最多的（標準貪心著色啟發式，用色數比較省）
            const order = Array.from({ length: count }, (_, g) => g)
                .sort((a, b) => adj[b].size - adj[a].size);
            const idx = new Array(count).fill(-1);
            for (const g of order) {
                const used = new Set();
                for (const h of adj[g]) if (idx[h] >= 0) used.add(idx[h]);
                let k = 0;
                while (used.has(k)) k++;
                idx[g] = k % PALETTE.length;
            }
            return idx.map(k => PALETTE[k]);
        },

        /** 用「第幾行第幾列的幾」指稱一塊長方形。⚠️ 顏色會重複，不能拿來當名字。 */
        _rectName: function (N, clues, sizes, g) {
            const c = clues[g];
            return `第 ${((c / N) | 0) + 1} 行第 ${(c % N) + 1} 列的 ${sizes[g]}`;
        },

        // =================================================================
        // 小工具：鄰格
        // =================================================================
        _nbs: function (N, i) {
            const r = (i / N) | 0, c = i % N, out = [];
            if (r > 0) out.push(i - N);
            if (r < N - 1) out.push(i + N);
            if (c > 0) out.push(i - 1);
            if (c < N - 1) out.push(i + 1);
            return out;
        },
        // =================================================================
        // 出題
        // =================================================================
        /**
         * 把 N×N 切成一堆互不重疊、剛好鋪滿的長方形。
         *
         * ⚠️ **矩形數量不固定**，由面積自己決定——這是照實際 Shikaku 的規則。
         *   （舊版把數量寫死成 N，那是我自己加的人為限制：7×7 只切 7 塊，每塊平均
         *     7 格，長出來的東西跟真正的 Shikaku 差很多。實際盤面 7×7 大約會切出
         *     十幾塊。）
         *
         * ⚠️ **這裡曾經有一個決定性的 bug，不是機率問題**：舊版只有「逐格回溯」
         *   一種手法，永遠從左上角開始，每一格貪心挑「pref(面積,平均) + 一點點
         *   隨機抖動」分數最高的形狀。實測 5×5～13×13、困難／專家難度，面積 6
         *   （因數最多、又最靠近可用面積集合的平均值）的分數永遠領先第二名超過
         *   1 分，而抖動只有 0～1.2——結構性地保證 6 永遠贏。又因為回溯法「往下
         *   走幾乎必定成功、極少真的要回頭」，「排序第一名」就等於「幾乎每一格
         *   都選它」，長出來的整張盤面幾乎全是同一種尺寸，8／9／10 這種大面積
         *   實際上幾乎不會出現。
         *
         * ⭐ 現在改成兩階段：
         *   ① **先把大塊種在盤面中央附近**（挑面積前 40% 大的形狀，找「矩形中心
         *      離盤面中心最近」的合法位置放下去），讓大塊真的出現、而且落在視覺
         *      上最顯眼的位置，不會被回溯法排擠到邊角。
         *   ② **再用回溯法填滿剩下的空間**，但挑選順序改成 **Efraimidis–Spirakis
         *      加權隨機抽樣**（key = random()^(1/weight)）取代「排序取最高分」。
         *      權重仍然反映 pref 的偏好方向，但不再是贏家全拿——同一種面積不會
         *      每次都贏，盤面才會有真正的尺寸多樣性。
         *   逐格回溯本身的性質（row-major 第一個空格必定是矩形左上角，所以列舉
         *   「以它為左上角」的形狀即可涵蓋所有分割、且做得出互相咬合的排法）維持
         *   不變。
         */
        _genPartition: function (N, areas, pref, cluster) {
            const total = N * N;
            const owner = new Int16Array(total).fill(-1);
            const avg = areas.reduce((a, b) => a + b, 0) / areas.length;
            let count = 0, nodes = 0;
            cluster = cluster || 0;

            // ── 第一階段：大塊優先，種在盤面中央附近 ──
            // ⚠️ `cluster` 控制大塊要不要往其他大塊旁邊靠：正值＝越靠近其他已種下
            //   的大塊分數越好（容易相鄰、容易讓玩家混淆＝難）；負值＝越遠離其他
            //   大塊分數越好（互相散開、不容易混淆＝簡單）。這是唯一真正會影響
            //   混淆分數的旋鈕——面積挑選（pref）只決定用哪些數字，不影響擺放位置。
            // ⚠️ 種子階段只挑「拆得出方正形狀」的面積。5、7 這種質數只有 1×a 長條，
            //   拿來當「大塊種子」根本違背這個階段的目的（要的是方正大塊去製造
            //   相鄰混淆），而且長條本身就會洩漏方向。
            const hasSquarish = (a) => {
                for (let h = 2; h <= N; h++) {
                    if (a % h) continue;
                    const w = a / h;
                    if (w >= 2 && w <= N) return true;
                }
                return false;
            };
            let bigAreas = [...areas].sort((a, b) => b - a)
                .slice(0, Math.max(1, Math.ceil(areas.length * 0.4)));
            const bigSquarish = bigAreas.filter(hasSquarish);
            if (bigSquarish.length) bigAreas = bigSquarish;
            const cx = (N - 1) / 2, cy = (N - 1) / 2;
            // ⚠️ 使用者明確要求：優先「先放大塊、故意讓它們相鄰，再用小塊填滿剩下的
            //   空間」，這應該是生成的主軸，不是次要點綴——所以種子數放寬到接近
            //   總塊數的一半，讓大部分畫面由這個「特意安排」的階段決定，回溯法
            //   填充只負責收尾（剩餘空間只要不留孤立單格，一定填得滿）。
            const seedTarget = Math.max(2, Math.round(N / 1.8));
            const seedCenters = [];   // 已種下的大塊中心點，供 cluster 計算距離
            let seedTries = 0;
            while (count < seedTarget && seedTries < seedTarget * 40) {
                seedTries++;
                const a = bigAreas[(Math.random() * bigAreas.length) | 0];
                const shapesA = [];
                for (let h = 1; h <= N; h++) {
                    if (a % h) continue;
                    const w = a / h;
                    if (w <= N) shapesA.push({ h, w });
                }
                if (!shapesA.length) continue;
                // ⚠️ 面積有方正選項（4／6／8／9／10 這種合成數）時，優先只從方正
                //   選項裡挑——不然隨機挑到 1×a 的機率跟 2D 選項一樣高，長條形就
                //   會多到很突兀。質數面積（2/3/5/7）本來就沒有方正選項，不受影響。
                const squarish = shapesA.filter(s => s.h >= 2 && s.w >= 2);
                const shapePool = squarish.length ? squarish : shapesA;
                const s = shapePool[(Math.random() * shapePool.length) | 0];
                let best = null, bestD = Infinity;
                for (let r0 = 0; r0 <= N - s.h; r0++) {
                    for (let c0 = 0; c0 <= N - s.w; c0++) {
                        let ok = true;
                        for (let rr = r0; rr < r0 + s.h && ok; rr++) {
                            for (let cc = c0; cc < c0 + s.w; cc++) if (owner[rr * N + cc] >= 0) { ok = false; break; }
                        }
                        if (!ok) continue;
                        const rcx = r0 + (s.h - 1) / 2, rcy = c0 + (s.w - 1) / 2;
                        let nearestSeed = Infinity;
                        for (const sc of seedCenters) nearestSeed = Math.min(nearestSeed, Math.hypot(rcx - sc.x, rcy - sc.y));
                        if (!isFinite(nearestSeed)) nearestSeed = Math.hypot(N, N);   // 第一塊沒有鄰居可比，當作很遠
                        // cluster>0：離其他大塊越近分數越好（鼓勵相鄰）；<0：越遠越好（鼓勵散開）
                        const d = Math.hypot(rcx - cx, rcy - cy) - cluster / (1 + nearestSeed) + Math.random() * 0.8;
                        if (d < bestD) { bestD = d; best = { r0, c0, s, rcx, rcy }; }
                    }
                }
                if (!best) continue;
                seedCenters.push({ x: best.rcx, y: best.rcy });
                for (let rr = best.r0; rr < best.r0 + best.s.h; rr++) {
                    for (let cc = best.c0; cc < best.c0 + best.s.w; cc++) owner[rr * N + cc] = count;
                }
                count++;
            }

            // ── 第二階段：回溯法把剩下的空格填滿（加權隨機，不贏家全拿）──
            const shapes = [];
            for (const a of areas) {
                const banStrip = STRIP_BANNED_AREAS.indexOf(a) >= 0;
                for (let h = 1; h <= N; h++) {
                    if (a % h) continue;
                    const w = a / h;
                    if (w > N) continue;
                    if (banStrip && (h === 1 || w === 1)) continue;   // 8/10 的長條選項整個不列入候選
                    shapes.push({ h, w, a });
                }
            }
            if (!shapes.length) return null;

            // ⚠️ 光在種子階段（上面）套 cluster 不夠：種子只有 2~4 塊，畫面上大部分
            //   「大塊會不會相鄰」其實是這裡（第二階段回溯填充）隨機湊出來的，
            //   種子階段的偏好完全管不到。所以這裡也要用同一套 cluster 訊號：
            //   每放一塊「大塊又方正」的形狀，都記下它的面積與是否方正，供後面
            //   的候選判斷「貼著我的這塊鄰居，算不算大塊」。
            const pieceArea = [], pieceChunky = [];
            const isBigChunky = (a, h, w) => a >= avg && h >= 2 && w >= 2;
            // 種子階段放的那些塊也要記進來，否則回溯填充時貼著種子塊的候選測不出來
            // ——反推它們的外接矩形（seedTarget 通常只有 2~4 塊，掃描成本可忽略）
            {
                const box = [];
                for (let g = 0; g < count; g++) box[g] = { r0: N, c0: N, r1: -1, c1: -1, n: 0 };
                for (let i = 0; i < total; i++) {
                    const g = owner[i];
                    if (g < 0) continue;
                    const rr = (i / N) | 0, cc = i % N, b = box[g];
                    if (rr < b.r0) b.r0 = rr; if (rr > b.r1) b.r1 = rr;
                    if (cc < b.c0) b.c0 = cc; if (cc > b.c1) b.c1 = cc;
                    b.n++;
                }
                for (let g = 0; g < count; g++) {
                    const b = box[g];
                    pieceArea[g] = b.n;
                    pieceChunky[g] = isBigChunky(b.n, b.r1 - b.r0 + 1, b.c1 - b.c0 + 1);
                }
            }

            // 洩漏型面積（5／7）目前用掉幾次。⚠️ 必須跟著 DFS 一起回溯增減，
            // 否則走過的失敗分支會把配額吃光，後面就再也擺不出 5／7。
            const leakyUsed = {};
            for (const a of LEAKY_AREAS) leakyUsed[a] = 0;
            for (let g = 0; g < count; g++) {
                if (LEAKY_AREAS.indexOf(pieceArea[g]) >= 0) leakyUsed[pieceArea[g]]++;
            }

            const dfs = (start) => {
                if (++nodes > 60000) return false;
                let i = start;
                while (i < total && owner[i] >= 0) i++;
                if (i >= total) return true;

                const r = (i / N) | 0, c = i % N;
                const opts = [];
                for (const s of shapes) {
                    if (r + s.h > N || c + s.w > N) continue;
                    let ok = true;
                    for (let rr = r; rr < r + s.h && ok; rr++) {
                        for (let cc = c; cc < c + s.w; cc++) if (owner[rr * N + cc] >= 0) { ok = false; break; }
                    }
                    if (ok) {
                        // ⚠️ 面積有方正選項時（4/6/9 這種合成數；8/10 的長條選項已經在
                        //   shapes 列表建立時整個排除，這裡不會再看到），長條形（h 或 w
                        //   為 1）額外扣分。⚠️ 扣分要**跟著長度（＝面積本身）加重**——
                        //   長度越長洩漏越嚴重，固定扣分對 9（1×9）跟對 4（1×4）一樣重，
                        //   等於沒有分別對待。質數面積（2/3/5/7）本來只有長條可選，不扣
                        //   （5/7 另外用配額處理，見下）。
                        const strip = (s.h === 1 || s.w === 1) && shapeCount(s.a) > 2;
                        let w = pref(s.a, avg) + 4;   // 平移成正數，避免 pow 出錯
                        if (strip) w -= 5 + Math.max(0, s.a - 4) * 0.8;
                        // 5／7 用超過配額就重罰（不硬禁，否則剩餘空間可能鋪不滿）
                        if (leakyUsed[s.a] >= LEAKY_QUOTA) w -= 8;

                        // cluster 偏移：這塊本身要「大又方正」才算數，然後看它貼著的
                        // 鄰居裡有沒有同樣「大又方正」的塊——cluster>0 貼著加分（鼓勵
                        // 相鄰、製造混淆＝難），cluster<0 貼著扣分（鼓勵散開＝簡單）。
                        if (cluster && isBigChunky(s.a, s.h, s.w)) {
                            // 掃這塊外框一圈的鄰格
                            const neigh = new Set();
                            for (let cc = c - 1; cc <= c + s.w; cc++) {
                                if (r - 1 >= 0 && cc >= 0 && cc < N) neigh.add(owner[(r - 1) * N + cc]);
                                if (r + s.h < N && cc >= 0 && cc < N) neigh.add(owner[(r + s.h) * N + cc]);
                            }
                            for (let rr = r - 1; rr <= r + s.h; rr++) {
                                if (c - 1 >= 0 && rr >= 0 && rr < N) neigh.add(owner[rr * N + c - 1]);
                                if (c + s.w < N && rr >= 0 && rr < N) neigh.add(owner[rr * N + c + s.w]);
                            }
                            let touchBig = 0;
                            for (const ng of neigh) if (ng >= 0 && pieceChunky[ng]) touchBig++;
                            w += cluster * touchBig;
                        }

                        w = Math.max(0.05, w);
                        opts.push({ s, key: Math.pow(Math.random(), 1 / w) });
                    }
                }
                opts.sort((a, b) => b.key - a.key);

                for (const o of opts) {
                    const s = o.s;
                    const id = count;
                    for (let rr = r; rr < r + s.h; rr++) for (let cc = c; cc < c + s.w; cc++) owner[rr * N + cc] = id;
                    pieceArea[id] = s.a; pieceChunky[id] = isBigChunky(s.a, s.h, s.w);
                    if (leakyUsed[s.a] !== undefined) leakyUsed[s.a]++;
                    count++;
                    if (dfs(i + 1)) return true;
                    count--;
                    if (leakyUsed[s.a] !== undefined) leakyUsed[s.a]--;
                    for (let rr = r; rr < r + s.h; rr++) for (let cc = c; cc < c + s.w; cc++) owner[rr * N + cc] = -1;
                }
                return false;
            };
            if (!dfs(0)) return null;
            return { owner, count };
        },

        /**
         * ⚠️ 挑提示格位置真正該用的評分函式。
         *
         *   使用者用實例指出一個我完全沒考慮到的洩漏管道：**兩個提示格只要對齊
         *   在同一直行或橫排，人類就能透過「旁邊那塊區域的邊界＋對齊關係」反推
         *   出這一塊的方向與延伸方向**，完全不用真的解題──例如「上面的 5 跟中間
         *   的 6 對在同一直行，代表 5 一定是橫的；5 左邊貼著的 4 又限制了 5 只能
         *   往右延伸」。`_freeCandCount` 是在**空盤面**上算擺法數，完全看不到「其
         *   他已經放好的提示格」這件事，自然抓不到這種對齊洩漏。
         *
         *   真正該算的是：這個面積、包含這一格的所有長方形擺法裡，有幾種**不會
         *   蓋住任何一個已經放好的提示格**（不管方向、不管距離，不是只看正上下
         *   左右緊鄰）。這樣「對齊＋邊界」造成的隱性排除會自動反映成候選數變少，
         *   選提示格位置時只要挑候選數最多的，就會自動避開洩漏最嚴重的位置。
         *   使用者的目標很明確：**每個區域至少要留下兩種看起來都說得通的擺法**
         *   （即使是長條形，也要讓橫向與縱向兩種解讀都暫時成立），這裡就是直接
         *   針對這個目標去最大化。
         */
        _constrainedCandCount: function (N, area, cell, forbidden) {
            const cr = (cell / N) | 0, cc = cell % N;
            let n = 0;
            for (let h = 1; h <= N; h++) {
                if (area % h) continue;
                const w = area / h;
                if (w > N) continue;
                const r0min = Math.max(0, cr - h + 1), r0max = Math.min(cr, N - h);
                const c0min = Math.max(0, cc - w + 1), c0max = Math.min(cc, N - w);
                for (let r0 = r0min; r0 <= r0max; r0++) {
                    for (let c0 = c0min; c0 <= c0max; c0++) {
                        let ok = true;
                        for (const f of forbidden) {
                            const fr = (f / N) | 0, fc = f % N;
                            if (fr >= r0 && fr < r0 + h && fc >= c0 && fc < c0 + w) { ok = false; break; }
                        }
                        if (ok) n++;
                    }
                }
            }
            return n;
        },

        /**
         * 回傳 { N, owner, sizes, clues, rects, count } 或 null。
         *
         * ⭐ 提示格的挑法：
         *   ① 候選格先用兩條幾何前提篩過一輪——**不要寫在直線長條的兩端**（頭尾
         *      直接洩漏延伸方向）、2D 矩形優先擺在內部（不貼自己的邊）。
         *   ② **在剩下的候選裡，用 `_constrainedCandCount` 挑「考慮目前已經放好的
         *      所有提示格之後，還有幾種擺法說得通」最多的那一格**——這才是決定
         *      「玩家看得出真正位置」與否的關鍵。⚠️ 這裡曾經只算「空盤面」上的
         *      擺法數（`_freeCandCount`），完全沒看見其他提示格，抓不到「兩個
         *      數字對在同一直行／橫排、配上鄰居區域的邊界，就能反推方向」這種
         *      洩漏（使用者用實例指出的問題）。換成 `_constrainedCandCount` 之後，
         *      這種洩漏會自動反映成候選數變少，挑「候選數最多」自然就避開它，
         *      目標是**每個區域至少留下兩種站得住腳的擺法**，長條形也不例外
         *      （橫向、縱向兩種讀法都該暫時成立）。
         *   依「可選位置最少」的矩形優先處理：先放的區域看到的已放提示格最少、
         *   選擇最自由，晚放的區域才會被前面已經定案的提示格牽制，這個順序本身
         *   就是在保護最容易被卡死的那些區域。
         */
        _genBoard: function (N, diffKey) {
            const D = diffOf(diffKey);
            const areas = AREA_SETS[N];
            if (!areas) return null;
            const total = N * N;

            const part = this._genPartition(N, areas, D.pref, D.cluster);
            if (!part) return null;
            const M = part.count;

            // 顏色編號重新洗牌，免得編號跟掃描順序相關
            const perm = shuffle(Array.from({ length: M }, (_, i) => i));
            const owner = new Int16Array(total);
            for (let i = 0; i < total; i++) owner[i] = perm[part.owner[i]];

            const rects = new Array(M), sizes = new Array(M).fill(0);
            for (let g = 0; g < M; g++) rects[g] = { r0: N, c0: N, r1: -1, c1: -1 };
            for (let i = 0; i < total; i++) {
                const g = owner[i], r = (i / N) | 0, c = i % N, R = rects[g];
                if (r < R.r0) R.r0 = r;
                if (r > R.r1) R.r1 = r;
                if (c < R.c0) R.c0 = c;
                if (c > R.c1) R.c1 = c;
                sizes[g]++;
            }
            for (let g = 0; g < M; g++) {
                const R = rects[g];
                if ((R.r1 - R.r0 + 1) * (R.c1 - R.c0 + 1) !== sizes[g]) return null;   // 保險
            }

            // ── 提示格 ──
            const clues = new Array(M).fill(-1);
            const placedClues = [];   // 依序放好的提示格座標，供 _constrainedCandCount 當「已知資訊」
            // 先處理「可選位置最少」的矩形，免得它們最後被相鄰限制逼到沒得選
            const poolOf = (g) => {
                const R = rects[g];
                const h = R.r1 - R.r0 + 1, w = R.c1 - R.c0 + 1;
                let cells = this._rectCells(N, R);
                if (h >= 3 && w >= 3) {
                    const inner = cells.filter(i => {
                        const r = (i / N) | 0, c = i % N;
                        return r > R.r0 && r < R.r1 && c > R.c0 && c < R.c1;
                    });
                    if (inner.length) cells = inner;
                } else if ((h === 1 || w === 1) && sizes[g] >= 3) {
                    // 直線長條：砍掉頭尾兩端
                    const mid = cells.filter(i => {
                        const r = (i / N) | 0, c = i % N;
                        if (h === 1) return c > R.c0 && c < R.c1;
                        return r > R.r0 && r < R.r1;
                    });
                    if (mid.length) cells = mid;
                }
                return cells;
            };
            const order = Array.from({ length: M }, (_, g) => g)
                .sort((a, b) => poolOf(a).length - poolOf(b).length);

            for (const g of order) {
                const pool = poolOf(g);
                let best = -1, bestN = -1;
                for (const i of pool) {
                    const n = this._constrainedCandCount(N, sizes[g], i, placedClues) + Math.random() * 0.5;
                    if (n > bestN) { bestN = n; best = i; }
                }
                clues[g] = best;
                placedClues.push(best);
            }

            // ⚠️ 上面是貪心的：先放的區域看不到後放的提示格，可能事後才被別人的
            //   提示格卡到只剩一種擺法（＝位置完全洩漏）。所以再掃兩輪修補，
            //   對「拿全盤提示格重算後候選數 < 2」的區域，換到候選數最多的位置。
            //   跑兩輪是因為搬動任何一個提示格都會改變其他區域的候選數。
            for (let pass = 0; pass < 2; pass++) {
                for (let g = 0; g < M; g++) {
                    const others = clues.filter((c, h) => h !== g);
                    if (this._constrainedCandCount(N, sizes[g], clues[g], others) >= 2) continue;
                    let best = clues[g], bestN = -1;
                    for (const i of poolOf(g)) {
                        const n = this._constrainedCandCount(N, sizes[g], i, others);
                        if (n > bestN) { bestN = n; best = i; }
                    }
                    clues[g] = best;
                }
            }
            return { N, owner, sizes, clues, rects, count: M };
        },

        // =================================================================
        // 難度評級
        // =================================================================
        /**
         * ⚠️ 難度改成**直接量測畫面本身的視覺混淆程度**，不再靠「能不能解開」評分。
         *
         *   使用者明確指出：不需要這麼在意能不能解開——放置區域時只要不留下孤立
         *   的單格空間，剩餘空間永遠可以用 2、3 格區域填滿，盤面一定生得出來、
         *   也一定解得開（`_genPartition` 的逐格回溯本來就保證這件事：它永遠從
         *   「row-major 第一個空格」找完整矩形去蓋，不可能留下填不滿的孤立格）。
         *   舊版另外疊了一層「唯一解檢查＋假設法解題深度分級」，是過度工程——
         *   真正影響「這題感覺起來難不難」的，是玩家會不會被提示數字的位置搞混：
         *   當多個大尺寸、非長條形的區域彼此相鄰時，數字擠在一起，很難一眼看出
         *   哪個數字屬於哪一塊，這才是真正的難度來源，而且跟「能不能被邏輯推出來」
         *   沒有關係。
         *
         * 做法：兩種混淆來源相加：
         *   ① **相鄰**：把每一對「相鄰、都算大塊」的區域算一次分數，兩塊都不是
         *      長條形（長寬都 ≥2）給滿分，只要有一塊是長條形就打折（長條形的數字
         *      位置比較容易靠邊界判斷歸屬，不太會混淆）。
         *   ② **孤立**（⚠️ 使用者額外提醒的第二種混淆來源，跟①是互補、不是取代）：
         *      一個大塊往外擴一格的範圍內，如果完全沒有**別的區域的提示格**，人類
         *      沒有鄰近的數字可以拿來定位邊界到底在哪（例如一個 2×2 的「4」四周
         *      一整片空白，根本看不出它是貼著九宮格的哪一邊）。這跟①講的是完全
         *      不同的情境：①是「數字太擠分不清歸屬」，②是「數字太空曠找不到
         *      參考點」，兩種都會讓人判斷不出絕對位置，所以都要加分。
         *   ⚠️ 正規化**不能**除以「大塊非長條形的塊數」——踩過這個坑：入門難度本來
         *     就刻意讓大塊很少，一旦只出現 1、2 塊又剛好相鄰，分母小到單一次相鄰
         *     就讓比例暴衝（實測入門出現過 10.00 的離群值，中位數反而比困難／專家
         *     還高，完全倒反）。改成除以「總區塊數」，分母不會因為某個難度刻意
         *     壓低大塊數量而崩塌，數值才穩定。
         */
        _confusionScore: function (N, owner, rects, sizes, clues) {
            const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
            const isBig = (g) => sizes[g] >= avg;
            const isChunky = (g) => {
                const R = rects[g];
                return (R.r1 - R.r0 + 1) >= 2 && (R.c1 - R.c0 + 1) >= 2;
            };
            // ① 相鄰的大塊
            let score = 0;
            const seen = new Set();
            for (let i = 0; i < N * N; i++) {
                const g = owner[i];
                for (const nb of this._nbs(N, i)) {
                    const h = owner[nb];
                    if (h === g) continue;
                    const key = g < h ? g * 10000 + h : h * 10000 + g;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    if (!isBig(g) || !isBig(h)) continue;
                    score += (isChunky(g) && isChunky(h)) ? 1 : 0.4;
                }
            }
            // ② 孤立在一片空白裡的大塊——外擴一格範圍內找不到別區的提示格
            for (let g = 0; g < sizes.length; g++) {
                if (!isBig(g)) continue;
                const R = rects[g];
                const r0 = Math.max(0, R.r0 - 1), r1 = Math.min(N - 1, R.r1 + 1);
                const c0 = Math.max(0, R.c0 - 1), c1 = Math.min(N - 1, R.c1 + 1);
                let hasNearbyClue = false;
                for (let h = 0; h < sizes.length; h++) {
                    if (h === g) continue;
                    const cr = (clues[h] / N) | 0, cc = clues[h] % N;
                    if (cr >= r0 && cr <= r1 && cc >= c0 && cc <= c1) { hasNearbyClue = true; break; }
                }
                if (!hasNearbyClue) score += isChunky(g) ? 1 : 0.4;
            }
            return score / sizes.length;
        },

        /** 把混淆分數換成 1~4 的難度級距。⚠️ 門檻必須跟著出題規則一起重新校準——
         *  限制 5／7 的出現次數之後面積分布改變，整體分數往上位移（中位數從
         *  0.23/0.31/0.35/0.38 變成 0.32/0.43/0.56/0.61），沿用舊門檻會讓
         *  13×13 困難的命中率掉到 2/4。門檻取相鄰難度中位數的中點。 */
        _tierOf: function (score) {
            if (score < 0.375) return 1;
            if (score < 0.495) return 2;
            if (score < 0.585) return 3;
            return 4;
        },

        /** 出一題：能生成就好，難度直接從畫面本身量出來，不再額外驗證解得開。 */
        _tryGenerate: function (N, diffKey) {
            const p = this._genBoard(N, diffKey);
            if (!p) return null;
            const score = this._confusionScore(N, p.owner, p.rects, p.sizes, p.clues);
            p.tier = this._tierOf(score);
            p.confusion = score;
            return p;
        },

        // =================================================================
        // 解題引擎（矩形版）
        // =================================================================
        /** 某個矩形涵蓋的所有格子 */
        _rectCells: function (N, R) {
            const out = [];
            for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) out.push(r * N + c);
            return out;
        },

        /** 矩形內從提示格往外的 BFS 順序（不含提示格本身）。
         *  ⚠️ 一定要從提示格往外長，畫面上才會看到顏色「從數字那一格暈開」；
         *    直接照 row-major 畫會出現顏色憑空從角落冒出來的怪樣子。 */
        _rectOrder: function (N, R, clue) {
            const inRect = (i) => {
                const r = (i / N) | 0, c = i % N;
                return r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1;
            };
            const seen = new Set([clue]);
            const q = [clue], out = [];
            for (let h = 0; h < q.length; h++) {
                for (const nb of this._nbs(N, q[h])) {
                    if (inRect(nb) && !seen.has(nb)) { seen.add(nb); out.push(nb); q.push(nb); }
                }
            }
            return out;
        },

        /**
         * 第 g 色目前所有「擺得下」的矩形。這是整個解題引擎的核心：
         *   ① 面積必須剛好等於它的數字（所以只需列舉該數字的因數分解）
         *   ② 必須蓋住自己的提示格
         *   ③ 不能壓到別色已經畫好的格子
         *   ④ 不能吃掉別色的提示格
         * 列舉量很小（因數分解 × 位置），所以可以放心在演繹與預看裡反覆呼叫。
         */
        _candidatesOf: function (N, paint, clueOwner, clues, sizes, g) {
            const area = sizes[g];
            const cell = clues[g];
            const cr = (cell / N) | 0, cc = cell % N;
            const out = [];
            for (let h = 1; h <= N; h++) {
                if (area % h) continue;
                const w = area / h;
                if (w > N) continue;
                const r0min = Math.max(0, cr - h + 1), r0max = Math.min(cr, N - h);
                const c0min = Math.max(0, cc - w + 1), c0max = Math.min(cc, N - w);
                for (let r0 = r0min; r0 <= r0max; r0++) {
                    for (let c0 = c0min; c0 <= c0max; c0++) {
                        let ok = true;
                        for (let r = r0; r < r0 + h && ok; r++) {
                            for (let c = c0; c < c0 + w; c++) {
                                const i = r * N + c;
                                if (paint[i] !== -1 && paint[i] !== g) { ok = false; break; }
                                if (clueOwner[i] >= 0 && clueOwner[i] !== g) { ok = false; break; }
                            }
                        }
                        if (ok) out.push({ r0, c0, r1: r0 + h - 1, c1: c0 + w - 1, h, w });
                    }
                }
            }
            return out;
        },

        /** 目前盤面有沒有已經走不通的地方。回傳 null 代表還有救。
         *    nofit  —— 某個顏色的矩形已經沒有任何擺得下的位置
         *    orphan —— 某個空白格沒有任何矩形蓋得到，永遠填不上 */
        _findFail: function (N, paint, clueOwner, clues, sizes, isPlaced) {
            const total = N * N;
            const cover = new Uint8Array(total);
            for (let g = 0; g < sizes.length; g++) {
                if (isPlaced[g]) continue;
                const cands = this._candidatesOf(N, paint, clueOwner, clues, sizes, g);
                if (!cands.length) return { type: 'nofit', g };
                for (const R of cands) {
                    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) cover[r * N + c] = 1;
                }
            }
            for (let i = 0; i < total; i++) {
                if (paint[i] === -1 && !cover[i]) return { type: 'orphan', cell: i };
            }
            return null;
        },

        /**
         * 純邏輯演繹，完全不用猜。推得出來就回傳 { g, rect, why }。
         *   D1 只剩一種擺法：某個顏色的矩形只有一個位置放得下 → 就是它
         *   D2 非它不可：某個空白格只有唯一一個矩形蓋得到 → 那個矩形非放不可
         * ⚠️ 這兩條在「每一個合法解」裡都成立，所以推出來的結果一定跟真解一致，
         *   不會把盤面帶到跟答案衝突的狀態。
         */
        _deduce: function (N, paint, clueOwner, clues, sizes, isPlaced) {
            return this._deduceD1(N, paint, clueOwner, clues, sizes, isPlaced)
                || this._deduceD2(N, paint, clueOwner, clues, sizes, isPlaced);
        },

        /** D1：某個顏色的長方形只剩一個位置放得下。
         *  這是「一眼就看得出來」的推理——盯著一個數字，把它的擺法數一數就好，
         *  所以表演時永遠優先用它。 */
        _deduceD1: function (N, paint, clueOwner, clues, sizes, isPlaced) {
            for (let g = 0; g < sizes.length; g++) {
                if (isPlaced[g]) continue;
                const cands = this._candidatesOf(N, paint, clueOwner, clues, sizes, g);
                if (cands.length === 1) {
                    const R = cands[0];
                    return {
                        g, rect: R,
                        why: `${this._rectName(N, clues, sizes, g)} 只剩一個位置放得下（${R.h}×${R.w}），直接定下來。`
                    };
                }
            }
            return null;
        },

        /** D2：某個空白格只有唯一一個長方形蓋得到 → 那個長方形非放不可。
         *  ⚠️ 這條要把「所有顏色的所有擺法」都攤開來比對才看得出來，對人腦來說
         *    是相當費力的全盤搜索，不是隨手就能看出來的。所以表演時把它排在
         *    「試著擺擺看」之後——真人也是先試、卡住了才回頭做這種全盤比對。
         *    （擺在最前面的話，盤面幾乎會被它一路推到底，整場完全沒有試錯。） */
        _deduceD2: function (N, paint, clueOwner, clues, sizes, isPlaced) {
            const total = N * N;
            const all = [];
            for (let g = 0; g < sizes.length; g++) {
                all.push(isPlaced[g] ? null : this._candidatesOf(N, paint, clueOwner, clues, sizes, g));
            }
            const cnt = new Int16Array(total);
            const whoG = new Int16Array(total).fill(-1);
            const whoR = new Array(total).fill(null);
            for (let g = 0; g < sizes.length; g++) {
                if (!all[g]) continue;
                for (const R of all[g]) {
                    for (let r = R.r0; r <= R.r1; r++) for (let c = R.c0; c <= R.c1; c++) {
                        const i = r * N + c;
                        cnt[i]++; whoG[i] = g; whoR[i] = R;
                    }
                }
            }
            for (let i = 0; i < total; i++) {
                if (paint[i] !== -1 || cnt[i] !== 1) continue;
                const R = whoR[i], g = whoG[i];
                return {
                    g, rect: R,
                    why: `這一格只有一種長方形蓋得到——${this._rectName(N, clues, sizes, g)} 的 ${R.h}×${R.w}，非它不可。`
                };
            }
            return null;
        },

        /** 挑下一個要動筆的顏色，依當輪的路數（見 STRATEGIES 的說明）：
         *    tight —— 可擺的位置最少（選擇最受限）的先畫
         *    small —— 格數最少的先畫，平手時再比可擺位置數 */
        _pickRegion: function (N, paint, clueOwner, clues, sizes, isPlaced, strategy) {
            let best = -1, bestKey = null, bestN = 0;
            for (let g = 0; g < sizes.length; g++) {
                if (isPlaced[g]) continue;
                const nc = this._candidatesOf(N, paint, clueOwner, clues, sizes, g).length;
                const key = (strategy === 'small') ? [sizes[g], nc] : [nc, sizes[g]];
                if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
                    bestKey = key; best = g; bestN = nc;
                }
            }
            return best < 0 ? null : { g: best, cands: bestN };
        },

        /** 貪心挑一個擺法：優先挑「擺下去之後全盤還活得下去」的，避免預看一開始
         *  就自己走死。都活不下去才隨便回一個，讓上層去偵測撞牆。 */
        _greedyRect: function (N, paint, clueOwner, clues, sizes, isPlaced, g) {
            const cands = this._candidatesOf(N, paint, clueOwner, clues, sizes, g);
            if (!cands.length) return null;
            shuffle(cands);
            for (const R of cands) {
                const cells = this._rectCells(N, R);
                const undo = [];
                for (const i of cells) { undo.push(paint[i]); paint[i] = g; }
                isPlaced[g] = true;
                const f = this._findFail(N, paint, clueOwner, clues, sizes, isPlaced);
                isPlaced[g] = false;
                cells.forEach((i, k) => { paint[i] = undo[k]; });
                if (!f) return R;
            }
            return cands[0];
        },

        /**
         * 私下把一條路走完看看會不會撞牆。
         *   firstRect 非 null → 先硬把第 g 色擺成這個（錯的）位置
         *   firstRect 為 null → 照真解擺（拿來當「基準線」用）
         * 接著再往下解 LOOKAHEAD_REGIONS 個顏色（先演繹、推不動才貪心），因為很多
         * 錯誤不會當場爆炸，要再往下走個一兩塊才看得出來卡死。
         * 回傳 { fail, used }；used 是這條路上實際擺下去的每一塊 {g, rect}。
         */
        _simRun: function (N, paint, clueOwner, clues, sizes, isPlaced, trueRects, g, firstRect, strategy) {
            const sp = Int16Array.from(paint);
            const sPlaced = isPlaced.slice();
            const used = [];
            const put = (gg, R) => {
                for (const i of this._rectCells(N, R)) sp[i] = gg;
                sPlaced[gg] = true;
                used.push({ g: gg, rect: R });
            };

            put(g, firstRect || trueRects[g]);
            let fail = this._findFail(N, sp, clueOwner, clues, sizes, sPlaced);
            if (fail) return { fail, used };

            for (let k = 0; k < LOOKAHEAD_REGIONS; k++) {
                let dGuard = 0, d;
                while ((d = this._deduce(N, sp, clueOwner, clues, sizes, sPlaced)) && dGuard++ < N) {
                    put(d.g, d.rect);
                    const f = this._findFail(N, sp, clueOwner, clues, sizes, sPlaced);
                    if (f) return { fail: f, used };
                }
                const pick = this._pickRegion(N, sp, clueOwner, clues, sizes, sPlaced, strategy);
                if (!pick) break;
                const R = this._greedyRect(N, sp, clueOwner, clues, sizes, sPlaced, pick.g);
                if (!R) return { fail: { type: 'nofit', g: pick.g }, used };
                put(pick.g, R);
                const f = this._findFail(N, sp, clueOwner, clues, sizes, sPlaced);
                if (f) return { fail: f, used };
            }
            return { fail: null, used };
        },

        /**
         * 私下模擬一條錯路，只有在確認它「真的會撞牆」時才回傳。
         *
         * ⚠️ 這是整個表演誠實與否的關鍵，有兩層把關：
         *   ① 候選一定是「跟真解不同」的擺法，所以待會擦掉的絕對不會是擺對的。
         *   ② 先跑一次**基準線**：照真解擺、用同樣的預看深度，必須**不會**撞牆。
         *      若連正確答案在這個深度下也會撞牆，代表撞牆是「貪心預看」本身能力
         *      不足造成的，不能歸咎於這一步的選擇——這種情況就不演錯誤，免得
         *      畫面上講出一個假的理由。
         * 回傳 { cells:[{g,rect}], fail } 或 null。
         */
        _findMistake: function (N, paint, clueOwner, clues, sizes, isPlaced, trueRects, g, strategy) {
            if (isPlaced[g]) return null;
            const T = trueRects[g];
            const cand = this._candidatesOf(N, paint, clueOwner, clues, sizes, g)
                .filter(R => !(R.r0 === T.r0 && R.c0 === T.c0 && R.r1 === T.r1 && R.c1 === T.c1));
            if (!cand.length) return null;

            if (this._simRun(N, paint, clueOwner, clues, sizes, isPlaced, trueRects, g, null, strategy).fail) return null;

            shuffle(cand);
            // 一次錯誤最多畫這麼多格，免得擦太久拖戲。
            // ⚠️ 矩形版一塊動輒 N 格上下，上限抓太低（原本 N+5）會把「連前面擺好的
            //   一起拆」這種跨多塊的探索全部濾掉，那正是最好看的橋段。
            const cap = Math.max(12, N * 2);
            let fallback = null;
            for (let t = 0; t < Math.min(MISTAKE_TRIES, cand.length); t++) {
                const r = this._simRun(N, paint, clueOwner, clues, sizes, isPlaced, trueRects, g, cand[t], strategy);
                if (!r.fail) continue;
                const cells = r.used.reduce((a, u) => a + sizes[u.g] - 1, 0);
                if (cells > cap) continue;
                // 優先挑「擺了不只一塊才發現不對」的路：那會演成「連前面擺好的
                // 也要一起拆」，比當場就爆掉的單塊錯誤好看得多，也更像真人。
                if (r.used.length > 1) return { cells: r.used, fail: r.fail };
                if (!fallback) fallback = { cells: r.used, fail: r.fail };
            }
            return fallback;
        },

        /** 把矛盾翻譯成玩家看得懂的一句話。
         *  ⚠️ 這裡只回傳「原因本身」，不要自帶「糟了——」之類的開頭；開頭由呼叫端
         *    依情境接（跨顏色的情況會先講一段前因），否則會接出
         *    「才發現不對——糟了——…」這種疊字。 */
        _failText: function (N, clues, sizes, fail) {
            if (fail.type === 'nofit') {
                return `${this._rectName(N, clues, sizes, fail.g)} 已經沒有任何位置放得下了`;
            }
            // 講出是哪一格，玩家才對得上畫面（只講「有一格」的話根本找不到在哪）
            const r = ((fail.cell / N) | 0) + 1, c = (fail.cell % N) + 1;
            return `第 ${r} 行第 ${c} 列那一格再也沒有任何長方形蓋得到，永遠填不上`;
        },

        // =================================================================
        // 產生整場表演的腳本
        // =================================================================
        /**
         * 回傳事件陣列。事件種類：
         *   say      旁白（tag = 左側徽章文字）
         *   place    把某一格畫成某個顏色
         *   plan     顯示修正意圖（紅 ✕ 要刪的、綠虛線框要加的），停一拍讓玩家看
         *   markX    在某一格打上紅色 ✕
         *   erase    把某一格擦回白紙
         *   clearPlan 收掉修正意圖預覽
         */
        _buildScript: function (p) {
            const N = p.N, total = N * N, sizes = p.sizes, clues = p.clues;
            const trueRects = p.rects;
            const paint = new Int16Array(total).fill(-1);
            const isPlaced = new Array(p.count).fill(false);
            const clueOwner = new Int16Array(total).fill(-1);
            clues.forEach((c, g) => { paint[c] = g; clueOwner[c] = g; });

            const ev = [];
            const say = (tag, text) => ev.push({ type: 'say', tag, text });
            /** 擺下一整塊矩形：邏輯上一次到位，畫面上一格一格從提示格往外長 */
            const putRect = (g, R) => {
                for (const c of this._rectOrder(N, R, clues[g])) {
                    paint[c] = g;
                    ev.push({ type: 'place', cell: c, g });
                }
                isPlaced[g] = true;
            };
            const undoRect = (g, R) => {
                for (const i of this._rectCells(N, R)) if (i !== clues[g]) paint[i] = -1;
                isPlaced[g] = false;
            };

            const strategy = STRATEGIES[(Math.random() * STRATEGIES.length) | 0];
            // 難度顯示的是「實際解一遍量出來的」階層，不是出題時的設定值
            const lv = p.tier ? `（難度：${TIER_NAME[p.tier]}）` : '';
            say('開始', strategy === 'small'
                ? `盤面被切成 ${p.count} 個長方形，每一塊只露一格、上面寫著它的格數${lv}。我先從格數少的下手，能擺的位置比較少。`
                : `盤面被切成 ${p.count} 個長方形，每一塊只露一格、上面寫著它的格數${lv}。我先挑能擺的位置最少的下手。`);

            let mistakes = mistakeBudget(N);   // 依盤面大小給預算
            let guard = 0;
            while (guard++ < 400) {
                if (isPlaced.every(Boolean)) break;

                // ── ① 先用「一眼看得出來」的 D1（某色只剩一個位置放得下）──
                const d1 = this._deduceD1(N, paint, clueOwner, clues, sizes, isPlaced);
                if (d1) {
                    say('推理', d1.why);
                    putRect(d1.g, d1.rect);
                    continue;
                }

                // ── ② 挑要動筆的顏色，順便看看有沒有可以演的試錯 ──
                const pick = this._pickRegion(N, paint, clueOwner, clues, sizes, isPlaced, strategy);
                if (!pick) break;
                let g = pick.g;
                let m = null;
                if (mistakes > 0) {
                    m = this._findMistake(N, paint, clueOwner, clues, sizes, isPlaced, trueRects, g, strategy);
                    if (!m) {
                        // 這一區沒得試錯就看看別的顏色，否則有不少局會從頭到尾都沒試錯
                        const others = [];
                        for (let h = 0; h < p.count; h++) if (h !== g && !isPlaced[h]) others.push(h);
                        shuffle(others);
                        for (let k = 0; k < Math.min(4, others.length); k++) {
                            const mm = this._findMistake(N, paint, clueOwner, clues, sizes, isPlaced, trueRects, others[k], strategy);
                            if (mm) { m = mm; g = others[k]; break; }
                        }
                    }
                }

                // ── ③ 沒有試錯可演，才回頭做 D2 那種費力的全盤比對 ──
                //   ⚠️ 順序很重要：D2 若排在最前面，盤面幾乎會被它一路推到底，
                //     整場完全沒有試錯（實測無試錯的局高達 138/255）。真人也是
                //     先試著擺擺看、卡住了才回頭做全盤搜索，這個順序反而更真實。
                if (!m) {
                    const d2 = this._deduceD2(N, paint, clueOwner, clues, sizes, isPlaced);
                    if (d2) {
                        say('推理', d2.why);
                        putRect(d2.g, d2.rect);
                        continue;
                    }
                }
                // ⚠️ 用「第幾行第幾列的幾」指稱一塊，不用顏色——顏色會重複（見 _assignHues）
                const name = this._rectName(N, clues, sizes, g);
                const nc = this._candidatesOf(N, paint, clueOwner, clues, sizes, g).length;
                if (g !== pick.g) {
                    say('動筆', `換 ${name} 來看：目前有 ${nc} 種擺法，這一塊的位置比較微妙，先把它試出來。`);
                } else if (strategy === 'small') {
                    say('動筆', `輪到 ${name}：是目前剩下最小的一塊，有 ${nc} 種擺法，先把它定下來。`);
                } else {
                    say('動筆', `輪到 ${name}：目前只有 ${nc} 種擺法，是選擇最少的一個，先處理它。`);
                }

                // ── ③ 要不要演一次「擺錯再擦掉」 ──
                let didMistake = false;
                if (m) {
                    mistakes--;
                    didMistake = true;
                    const first = m.cells[0].rect;
                    say('嘗試', `先試試看把 ${name} 擺成 ${first.h}×${first.w} 放在這裡。`);
                    // m.cells 可能包含「再往下多解幾塊」時擺的矩形——那是這次探索的
                    // 一部分，一起畫出來、待會也一起擦掉，玩家才看得懂前因後果
                    for (const u of m.cells) putRect(u.g, u.rect);

                    const involved = [...new Set(m.cells.map(u => u.g))];
                    const spanned = involved.length > 1;
                    // 撞牆點常常不在剛擺的那一塊身上，而是後面接著擺的顏色才爆掉。
                    // 這種「先擺小的、輪到大的才發現放不下」正是最像真人的地方，
                    // 但旁白一定要把因果講清楚，否則玩家看不懂為什麼要擦前面擺好的。
                    say('撞牆', (spanned ? '沿著這條路把後面幾塊也接著擺下去，才發現不對——' : '糟了——')
                        + this._failText(N, clues, sizes, m.fail));

                    const delCells = [];
                    for (const u of m.cells) {
                        for (const i of this._rectCells(N, u.rect)) if (i !== clues[u.g]) delCells.push(i);
                    }
                    // 先把這次探索整個收回來，才算得出「改畫這裡」的正確位置
                    for (const u of m.cells) undoRect(u.g, u.rect);
                    const addHint = this._rectCells(N, trueRects[g]).filter(i => paint[i] === -1).slice(0, 3);
                    // 收回來只是為了算提示，畫面上還沒擦，先把狀態還原回去
                    for (const u of m.cells) {
                        for (const i of this._rectCells(N, u.rect)) paint[i] = u.g;
                        isPlaced[u.g] = true;
                    }

                    ev.push({ type: 'plan', del: delCells, add: addHint });
                    const involvedNames = involved.map(h => this._rectName(N, clues, sizes, h)).join('、');
                    say('修正', spanned
                        ? `這一輪試出來的 ${delCells.length} 格（${involvedNames}）整批收回來，連前面擺好的也要一起拆，改往綠色虛線框那個方向重擺。`
                        : `把剛剛試錯的 ${delCells.length} 格擦掉（紅色 ✕ 的部分），改往綠色虛線框那個方向擺。`);
                    for (const c of delCells) ev.push({ type: 'markX', cell: c });
                    // 反序擦除：擺的時候由內往外長，擦的時候由外往內收，看起來才自然
                    for (let k = delCells.length - 1; k >= 0; k--) {
                        paint[delCells[k]] = -1;
                        ev.push({ type: 'erase', cell: delCells[k] });
                    }
                    for (const u of m.cells) isPlaced[u.g] = false;
                    ev.push({ type: 'clearPlan' });
                }

                // ── ④ 照正確答案把這一塊擺好 ──
                //   （故意走錯的路一定先驗證過會失敗，所以這裡永遠走得通，
                //     整場表演保證會結束、也保證最後完全正確）
                if (didMistake) say('重擺', `${name} 改擺這裡，這樣才不會擋到別人。`);
                putRect(g, trueRects[g]);
            }

            say('完成', `全部 ${total} 格都歸位了，每個顏色都圍成一個長方形，格數也剛好對上它的數字。`);
            return ev;
        },
        // =================================================================
        // 開新的一題
        // =================================================================
        newRound: function () {
            const N = this.gridN;
            this.genToken++;
            this.generating = true;
            this.genAttempts = 0;
            this.puzzle = null;
            this.finished = false;
            this.queue = []; this.qi = 0;
            this.flashes = [];
            this.marks = new Set();
            this.plan = null;
            this.cell = BOARD_PX / N;
            this.paint = new Int16Array(N * N).fill(-1);
            this.counts = [];   // 還沒出題，不知道會切成幾塊
            this.hues = null;
            this.paused = false;
            this.lastTickAt = 0;
            this._syncPauseBtn();
            if (this.frameEl) this.frameEl.classList.remove('kaizhi-all-done');
            this._say('—', '正在安排盤面…');
            this._updateProgress();
            this.genBest = null;
            this.genValid = 0;
            this.genStart = performance.now();
            this._genTick(this.genToken, this.diffKey);
            this._startLoop();
        },

        /**
         * 出題分片：每次最多跑 GEN_SLICE_MS 毫秒就讓出主執行緒，避免畫面凍住。
         * ⚠️ 出題參數只能把題目「往目標難度推」，不保證命中——所以這裡的做法是：
         *   實測難度剛好等於目標就立刻採用；否則把「最接近目標」的那一題留著，
         *   試到預算用完就用它。這樣玩家一定拿得到題目，而且畫面上顯示的永遠是
         *   實測出來的難度，不會謊報。
         */
        _genTick: function (token, diffKey) {
            if (token !== this.genToken || !this.active) return;
            const target = diffOf(diffKey).tier;
            const t0 = performance.now();
            while (performance.now() - t0 < GEN_SLICE_MS) {
                this.genAttempts++;
                const p = this._tryGenerate(this.gridN, diffKey);
                if (p) {
                    if (p.tier === target) { this._onPuzzleReady(p); return; }
                    this.genValid++;
                    if (!this.genBest || Math.abs(p.tier - target) < Math.abs(this.genBest.tier - target)) {
                        this.genBest = p;
                    }
                }
                if (this.genAttempts >= GEN_MAX_ATTEMPTS
                    || (this.genValid >= GEN_ENOUGH && this.genBest)
                    || performance.now() - this.genStart > GEN_TOTAL_MS) {
                    if (this.genBest) {
                        console.warn('[開枝散葉] 出題達上限，改用最接近目標難度的一題（實測',
                            TIER_NAME[this.genBest.tier], '／目標', TIER_NAME[target], '）');
                        this._onPuzzleReady(this.genBest);
                    } else {
                        // 連一題都生不出來（理論上不會發生）：放寬成普通再試
                        console.warn('[開枝散葉] 出題達上限且無可用結果，改用普通難度重試');
                        this.genAttempts = 0;
                        setTimeout(() => this._genTick(token, 'normal'), 0);
                    }
                    return;
                }
            }
            setTimeout(() => this._genTick(token, diffKey), 0);
        },

        _onPuzzleReady: function (p) {
            this.generating = false;
            this.puzzle = p;
            const N = p.N;

            this.hues = this._assignHues(N, p.owner, p.count);

            // 開局畫面：只有提示格露出顏色，其餘全是白紙
            this.paint = new Int16Array(N * N).fill(-1);
            this.counts = new Array(p.count).fill(0);
            p.clues.forEach((c, g) => { this.paint[c] = g; this.counts[g] = 1; });
            this.marks = new Set();
            this.plan = null;
            this.flashes = [];

            this.queue = this._buildScript(p);
            this.qi = 0;
            this.nextAt = performance.now() + 600;
            this._updateProgress();
        },

        // =================================================================
        // 播放
        // =================================================================
        /** 每個事件要等多久才執行。⚠️ 在「消費事件的當下」才依目前速度檔位計算，
         *  這樣玩家中途改速度可以立刻生效，不必等下一題。 */
        _waitOf: function (a) {
            const sp = SPEED_PRESETS[this.speedKey];
            if (a.type === 'say') return SAY_MS;
            if (a.type === 'plan') return sp.stepMs;
            if (a.type === 'clearPlan') return sp.markMs;
            // place / markX / erase：接在旁白後的第一筆要停久一點讓人讀完
            const prev = this.queue[this.qi - 2];
            return (prev && prev.type === 'say') ? sp.stepMs : sp.markMs;
        },

        _advance: function (now) {
            if (!this.puzzle || this.finished) return;
            let guard = 0;
            while (this.qi < this.queue.length && now >= this.nextAt && guard++ < 200) {
                const a = this.queue[this.qi++];
                if (a.type === 'say') {
                    this._say(a.tag, a.text);
                } else if (a.type === 'place') {
                    this.paint[a.cell] = a.g;
                    this.counts[a.g]++;
                    this.flashes.push({ cell: a.cell, t0: now, kind: 'place' });
                } else if (a.type === 'plan') {
                    this.plan = { del: a.del.slice(), add: a.add.slice() };
                } else if (a.type === 'markX') {
                    this.marks.add(a.cell);
                    this.flashes.push({ cell: a.cell, t0: now, kind: 'mark' });
                } else if (a.type === 'erase') {
                    const g = this.paint[a.cell];
                    if (g >= 0) this.counts[g]--;
                    this.paint[a.cell] = -1;
                    this.marks.delete(a.cell);
                    this.flashes.push({ cell: a.cell, t0: now, kind: 'erase' });
                } else if (a.type === 'clearPlan') {
                    this.plan = null;
                    this.marks.clear();
                }
                this._updateProgress();
                const next = this.queue[this.qi];
                this.nextAt = now + (next ? this._waitOf(next) : 0);
            }
            if (this.qi >= this.queue.length && !this.finished) {
                this.finished = true;
                this.finishedAt = now;
                this.plan = null;
                this.marks.clear();
                if (this.frameEl) this.frameEl.classList.add('kaizhi-all-done');
            }
        },

        _say: function (tag, text) {
            if (this.tagEl) this.tagEl.textContent = tag;
            if (this.narrEl) this.narrEl.textContent = text;
        },

        _updateProgress: function () {
            const bar = document.getElementById('kaizhi-progress-bar');
            const txt = document.getElementById('kaizhi-progress-text');
            if (!bar || !txt) return;
            if (this.generating) {
                bar.style.width = '100%';
                txt.textContent = '安排盤面中…';
                return;
            }
            const N = this.puzzle ? this.puzzle.N : this.gridN;
            const total = N * N;
            let filled = 0;
            for (let i = 0; i < total; i++) if (this.paint[i] >= 0) filled++;
            bar.style.width = (filled / total * 100).toFixed(1) + '%';
            txt.textContent = (this.paused ? '⏸ 已暫停　' : '') + `已畫 ${filled} / ${total} 格`;
        },

        // =================================================================
        // 繪製
        // =================================================================
        _draw: function (now) {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, BOARD_PX, BOARD_PX);
            if (!this.puzzle) { this._drawWaiting(ctx, now); return; }

            const N = this.puzzle.N, cs = this.cell;

            // ① 白紙底
            ctx.fillStyle = 'hsl(40, 30%, 96%)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

            // ② 已畫上的顏色
            for (let i = 0; i < N * N; i++) {
                const g = this.paint[i];
                if (g < 0) continue;
                ctx.fillStyle = `hsl(${this.hues[g]}, 60%, 62%)`;
                ctx.fillRect((i % N) * cs, ((i / N) | 0) * cs, cs + 0.6, cs + 0.6);
            }

            // ③ 細格線
            ctx.strokeStyle = 'hsla(216, 30%, 30%, 0.22)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let k = 1; k < N; k++) {
                ctx.moveTo(k * cs, 0); ctx.lineTo(k * cs, BOARD_PX);
                ctx.moveTo(0, k * cs); ctx.lineTo(BOARD_PX, k * cs);
            }
            ctx.stroke();

            // ④ 粗邊界：只畫在「兩邊顏色不同」的地方，讓已成形的色塊輪廓分明
            ctx.strokeStyle = 'hsl(216, 48%, 16%)';
            ctx.lineWidth = 3.5;
            ctx.lineCap = 'square';
            ctx.beginPath();
            for (let r = 0; r < N; r++) {
                for (let c = 0; c < N; c++) {
                    const g = this.paint[r * N + c];
                    if (c + 1 < N && this.paint[r * N + c + 1] !== g) {
                        ctx.moveTo((c + 1) * cs, r * cs); ctx.lineTo((c + 1) * cs, (r + 1) * cs);
                    }
                    if (r + 1 < N && this.paint[(r + 1) * N + c] !== g) {
                        ctx.moveTo(c * cs, (r + 1) * cs); ctx.lineTo((c + 1) * cs, (r + 1) * cs);
                    }
                }
            }
            ctx.stroke();
            ctx.strokeRect(1.75, 1.75, BOARD_PX - 3.5, BOARD_PX - 3.5);

            // ⑤ 修正意圖預覽：要刪的鋪紅底、要加的畫綠色虛線框
            this._drawPlan(ctx, now);

            // ⑥ 準備擦掉的格子打上紅色 ✕
            for (const i of this.marks) {
                this._drawCross(ctx, (i % N) * cs + cs / 2, ((i / N) | 0) * cs + cs / 2, cs);
            }

            // ⑦ 提示格的數字「已畫/目標」
            for (let g = 0; g < this.puzzle.count; g++) {
                const i = this.puzzle.clues[g];
                this._drawClue(ctx, (i % N) * cs + cs / 2, ((i / N) | 0) * cs + cs / 2, cs,
                    this.counts[g], this.puzzle.sizes[g]);
            }

            // ⑧ 剛動筆的格子的擴散圓環
            this._drawFlashes(ctx, now);
        },

        _drawWaiting: function (ctx, now) {
            ctx.save();
            ctx.fillStyle = 'hsla(214, 40%, 10%, 0.6)';
            ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);
            const cx = BOARD_PX / 2, cy = BOARD_PX / 2;
            for (let k = 0; k < 3; k++) {
                const a = (now / 620 + k / 3) % 1;
                ctx.beginPath();
                ctx.arc(cx, cy, 26 + a * 74, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(45, 80%, 68%, ${0.42 * (1 - a)})`;
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
            ctx.fillStyle = 'hsla(45, 70%, 82%, 0.9)';
            ctx.font = '20px "Noto Serif TC", serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('安　排　盤　面', cx, cy);
            ctx.restore();
        },

        /** 修正意圖預覽。⚠️ 一定要「先讓玩家看到要刪哪些、要改畫哪裡」再動手，
         *  否則畫面上只會看到一片顏色突然消失，玩家完全不知道發生什麼事。 */
        _drawPlan: function (ctx, now) {
            if (!this.plan) return;
            const N = this.puzzle.N, cs = this.cell;
            ctx.save();
            // 要刪掉的：鋪一層紅
            ctx.fillStyle = 'hsla(0, 85%, 52%, 0.34)';
            for (const i of this.plan.del) {
                ctx.fillRect((i % N) * cs, ((i / N) | 0) * cs, cs, cs);
            }
            // 要改畫的：綠色流動虛線框
            ctx.strokeStyle = 'hsl(142, 85%, 42%)';
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 5]);
            ctx.lineDashOffset = -(now / 55) % 11;
            for (const i of this.plan.add) {
                ctx.strokeRect((i % N) * cs + 2.5, ((i / N) | 0) * cs + 2.5, cs - 5, cs - 5);
            }
            ctx.restore();
        },

        /** 準備擦掉：紅色粗叉 */
        _drawCross: function (ctx, x, y, cs) {
            const h = cs * 0.22;
            ctx.save();
            ctx.strokeStyle = 'hsla(0, 92%, 42%, 0.95)';
            ctx.lineWidth = Math.max(2, cs * 0.11);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x - h, y - h); ctx.lineTo(x + h, y + h);
            ctx.moveTo(x + h, y - h); ctx.lineTo(x - h, y + h);
            ctx.stroke();
            ctx.restore();
        },

        /** 提示格：白底圓角牌＋「已畫/目標」。畫完時轉成金色，一眼看得出哪些收工了。 */
        _drawClue: function (ctx, x, y, cs, done, target) {
            const w = cs * 0.86, h = cs * 0.44, rr = Math.min(6, cs * 0.12);
            const full = done >= target;
            ctx.save();
            ctx.beginPath();
            const x0 = x - w / 2, y0 = y - h / 2;
            ctx.moveTo(x0 + rr, y0);
            ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, rr);
            ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, rr);
            ctx.arcTo(x0, y0 + h, x0, y0, rr);
            ctx.arcTo(x0, y0, x0 + w, y0, rr);
            ctx.closePath();
            ctx.fillStyle = full ? 'hsla(45, 92%, 88%, 0.97)' : 'hsla(0, 0%, 100%, 0.92)';
            ctx.fill();
            ctx.strokeStyle = full ? 'hsl(38, 80%, 38%)' : 'hsla(216, 45%, 18%, 0.55)';
            ctx.lineWidth = full ? 2 : 1.2;
            ctx.stroke();

            ctx.fillStyle = full ? 'hsl(30, 75%, 26%)' : 'hsl(216, 45%, 18%)';
            ctx.font = `bold ${(cs * 0.26).toFixed(1)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${done}/${target}`, x, y + cs * 0.01);
            ctx.restore();
        },

        _drawFlashes: function (ctx, now) {
            const N = this.puzzle.N, cs = this.cell;
            ctx.save();
            for (let k = this.flashes.length - 1; k >= 0; k--) {
                const f = this.flashes[k];
                // 夾在 [0,1]：now 若因任何理由早於 t0，負數會讓 arc() 收到負半徑而拋例外
                const p = clamp((now - f.t0) / FLASH_MS, 0, 1);
                if (p >= 1) { this.flashes.splice(k, 1); continue; }
                const x = (f.cell % N) * cs + cs / 2, y = ((f.cell / N) | 0) * cs + cs / 2;
                const hue = f.kind === 'place' ? 142 : (f.kind === 'mark' ? 0 : 30);
                ctx.beginPath();
                ctx.arc(x, y, cs * (0.16 + p * 0.44), 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${hue}, 95%, 55%, ${(1 - p) * 0.85})`;
                ctx.lineWidth = 3 * (1 - p) + 0.8;
                ctx.stroke();
            }
            ctx.restore();
        },

        // =================================================================
        // 主迴圈
        // =================================================================
        _startLoop: function () {
            if (this.rafId) return;
            const tick = () => {
                if (!this.active) { this.rafId = null; this.lastTickAt = 0; return; }
                const now = performance.now();
                const dt = this.lastTickAt ? (now - this.lastTickAt) : 0;
                this.lastTickAt = now;
                if (this.paused) {
                    // ⚠️ 暫停不能只是「不呼叫 _advance」：所有到期時間都是絕對時間戳，
                    //   只跳過推進的話，恢復的瞬間會發現一大批動作全部過期而一次噴完。
                    //   正確做法是把每一個到期時間戳同步往後推 dt。
                    this.nextAt += dt;
                    this.finishedAt += dt;
                    for (const f of this.flashes) f.t0 += dt;
                } else {
                    this._advance(now);
                    if (this.finished && now - this.finishedAt > AUTO_NEXT_MS) this.newRound();
                }
                this._draw(now);
                this.rafId = requestAnimationFrame(tick);
            };
            this.rafId = requestAnimationFrame(tick);
        },

        // =================================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this.newRound();
        },

        // 玩家按 ✕ 主動關閉 → 回到首頁「青雲梯」。
        // （只有這條路徑回首頁；menu.js 的全域清理走 stopGame()，不受影響）
        hide: function () {
            this.stopGame();
            if (typeof window.FMGoHome === 'function') window.FMGoHome();
        },

        stopGame: function () {
            this.active = false;
            this.genToken++;   // 讓還在跑的出題分片自動作廢
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.KaiZhi = KaiZhi;

    if (new URLSearchParams(window.location.search).get('page') === 'kaizhi') {
        const start = () => {
            if (window.KaiZhi) window.KaiZhi.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
