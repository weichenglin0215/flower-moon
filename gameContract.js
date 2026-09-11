/**
 * gameContract.js —— 全遊戲共同契約（window.FMGame）
 * ============================================================================
 *
 * 【為什麼要有這個檔案】
 *
 * 2026-09-11 玩家回報：「考試中途某一題突然跳出難度選單，考試就沒了、報名費白花」。
 * 根因是 game13「人事時地」的開局流程裡有一行 `MenuManager.closeAll()` ——
 * **40 款遊戲裡唯一這樣寫的**。全域清理會順手呼叫 `ExamEngine.forceStop()`，
 * 於是考試抽到 game13 出題時，等於在開局那一刻把自己這場考試殺掉。
 *
 * 這不是「game13 寫錯一行」那麼單純。它暴露的是結構問題：
 * **每一款遊戲都各自決定「要怎麼離開」「要怎麼推進關卡」「要怎麼記分」，
 * 沒有任何一份共同的東西可以呼叫，於是每多一款遊戲就多一次寫歪的機會。**
 * 青雲梯與考試是靠「覆寫遊戲身上的那幾支函式」來接管遊戲的，
 * 只要有一款遊戲用了別人沒有的寫法，接管就會在那一款身上破掉，
 * 而且不會有任何錯誤訊息 —— 只有玩家會發現。
 *
 * 所以這個檔案要做的是：
 *   ① 把「所有遊戲都必須長什麼樣子」寫成**程式可讀的常數**（不是文件裡的表格），
 *      讓 `tools/verify_learning_path.js` 直接拿它去驗 39 款，一款都不放過。
 *   ② 把遊戲**共同會做的那幾件事**收成共用函式，讓各遊戲呼叫而不是各寫一份。
 *      往後要改行為（例如「離開前要先確認」），改這裡一個地方就全站生效。
 *
 * 【契約本體】—— 39 款遊戲一律相同，沒有例外
 *
 *   必備函式（名稱、參數、語意都必須一致）
 *     show()                  開啟遊戲介面
 *     stopGame()              關閉遊戲並自行隱藏 overlay（全域清理只呼叫這支）
 *     startNewGame()          開新局（抽新題）
 *     retryGame()             重來（保留本題）
 *     startNextLevel()        關卡模式過關後推進下一關 ★青雲梯會暫時覆寫它
 *     gameOver(win, reason)   判定勝負（唯一的結算入口）
 *
 *   必備變數
 *     isLevelMode            {boolean} 是否為關卡模式（青雲梯／考試派局時為 true）
 *     currentLevelIndex      {number}  目前關卡編號（＝ getSharedRandomPoem 的種子）
 *     difficultySettings     {object}  五個難度層都要有
 *
 * ⚠️ 這份契約的權威來源是**本檔案的常數**，不是任何一份 .md。
 *    文件會過時，常數會被測試拿去驗。
 *
 * 相關文件：
 *   - note/青雲梯與獎勵企畫書/青雲梯遊戲接入規範與已知錯誤.md
 *   - .agent/skills/遊戲類型介面設計與程式碼規範.md §7.3
 */
(function () {
    'use strict';

    // ── 契約常數（驗證工具的唯一權威來源）──────────────────────────────
    const REQUIRED_METHODS = [
        'show', 'stopGame', 'startNewGame', 'retryGame', 'startNextLevel', 'gameOver'
    ];
    const REQUIRED_FIELDS = ['isLevelMode', 'currentLevelIndex', 'difficultySettings'];
    const DIFFICULTY_TIERS = ['小學', '中學', '高中', '大學', '研究所'];

    /**
     * 遊戲**不得**自行呼叫的東西（原始碼指紋用）。
     *
     * 這些都是「全站層級」的動作：切頁、清空所有 overlay、回首頁。
     * 由遊戲自己發動時，青雲梯與考試完全無從得知，於是：
     *   · 進行中的考試會被 ExamEngine.forceStop() 靜默殺掉（報名費白花）
     *   · 進行中的課程局不會被記成失敗，離場守門也不會解鎖
     * 要離開一律改呼叫 FMGame.exit()，它會判斷現在有沒有局在進行。
     */
    const FORBIDDEN_IN_GAMES = [
        { re: /MenuManager\s*\.\s*closeAll/, why: 'MenuManager.closeAll()' },
        { re: /closeAllActiveOverlays\s*\(/, why: 'closeAllActiveOverlays()' },
        { re: /FMGoHome\s*\(/, why: 'FMGoHome()' },
        { re: /MenuManager\s*\.\s*goHome/, why: 'MenuManager.goHome()' },
        { re: /localStorage\s*\./, why: 'localStorage（模組外禁止直呼，見 SKILL.md）' }
    ];

    const FMGame = {

        REQUIRED_METHODS: REQUIRED_METHODS,
        REQUIRED_FIELDS: REQUIRED_FIELDS,
        DIFFICULTY_TIERS: DIFFICULTY_TIERS,
        FORBIDDEN_IN_GAMES: FORBIDDEN_IN_GAMES,

        // ═══════════════════════════════════════════════════════════════
        //  一、關卡與結算 —— 遊戲流程的共用寫法
        // ═══════════════════════════════════════════════════════════════

        /**
         * 關卡模式過關後推進下一關。**全專案唯一允許 currentLevelIndex++ 的地方。**
         *
         * ⚠️ 各遊戲的 `startNextLevel()` 請一律寫成 `FMGame.nextLevel(this)`。
         *    不要把 `currentLevelIndex++` 直接寫在 gameOver 的 onConfirm 裡 ——
         *    青雲梯只覆寫 `startNextLevel`，寫在 onConfirm 等於繞過攔截點，
         *    遊戲會自己一路打下去，青雲梯完全失去控制權
         *    （歷史災情：game16「打地詩」連出 4 局同一首詩，見接入規範 §4 №1）。
         *
         * @param {object} game 遊戲物件（傳 this）
         */
        nextLevel: function (game) {
            if (!game) return;
            game.currentLevelIndex = (game.currentLevelIndex || 0) + 1;
            // 有些遊戲的難度標籤／按鈕顯示依賴關卡編號，推進後要同步
            if (typeof game.updateUIForMode === 'function') game.updateUIForMode();
            if (typeof game.startNewGame === 'function') game.startNewGame();
            else if (typeof game.startGameProcess === 'function') game.startGameProcess(false);
        },

        /**
         * 結算彈窗按下按鈕之後要做什麼。**全 39 款共用同一份判斷。**
         *
         * ⚠️ 必須用 `game.startNextLevel()` 這種**當下取屬性**的寫法呼叫，
         *    不可以事先把函式存到區域變數 —— 青雲梯／考試是靠「暫時把
         *    遊戲身上的 startNextLevel 換掉」來接管的，先存起來就會呼叫到舊的那一支。
         *
         * @param {object} game 遊戲物件（傳 this）
         * @param {boolean} win 這一局是否過關
         */
        advance: function (game, win) {
            if (!game) return;
            if (win) {
                if (game.isLevelMode) game.startNextLevel();
                else game.startNewGame();
            } else {
                game.retryGame();
            }
        },

        /**
         * 關卡模式的通關紀錄。青雲梯的進度**完全**由這裡寫下的 levelCleared 推導，
         * 漏記等於這一局白打。
         *
         * @param {string} gameKey 必須與檔名一致（'game13'），打錯會記到別款頭上
         * @param {object} game    遊戲物件（傳 this）
         * @returns {string|null}  若因此解鎖成就則回傳 achId，否則 null
         */
        completeLevel: function (gameKey, game) {
            if (!game || !game.isLevelMode) return null;
            if (!window.ScoreManager || typeof window.ScoreManager.completeLevel !== 'function') return null;
            return window.ScoreManager.completeLevel(
                gameKey, game.difficulty, game.currentLevelIndex) || null;
        },

        // ═══════════════════════════════════════════════════════════════
        //  二、離開遊戲 —— 唯一的合法出口
        // ═══════════════════════════════════════════════════════════════

        /**
         * 遊戲想要離開自己時，一律呼叫這支，**不要**自行呼叫
         * `MenuManager.closeAll()` / `FMGoHome()` / `closeAllActiveOverlays()`。
         *
         * 為什麼：那些是全站層級的動作，會連帶觸發 `ExamEngine.forceStop()`。
         * 考試進行中被這樣清掉，報名費與今日應試次數就白白損失，
         * 而且玩家只會看到畫面莫名其妙跳走（2026-09-11 的 game13 災情）。
         *
         * 這支會先問「現在有沒有課程／考試在進行」：
         *   有 → 交給青雲梯跳確認彈窗，講清楚會損失什麼，玩家點頭才離開。
         *   沒有 → 才是單純的回首頁。
         */
        exit: function () {
            const LP = window.LearningPath;
            if (LP && typeof LP.isSessionActive === 'function' && LP.isSessionActive()) {
                if (typeof LP.confirmAbandonSession === 'function') {
                    LP.confirmAbandonSession();
                    return;
                }
            }
            if (window.MenuManager && typeof window.MenuManager.goHome === 'function') {
                window.MenuManager.goHome();
            }
        },

        // ═══════════════════════════════════════════════════════════════
        //  三、積分與文錢 —— 全站唯一的讀取收口
        // ═══════════════════════════════════════════════════════════════
        //
        // ⚠️ 改版前這三件事散落在各檔各寫一份：
        //      collection.js  getCurrentScore()      （死程式碼，沒人呼叫）
        //      learningPath.js getTotalScore()/getSilver()
        //      achievement.js  data.totalScore（直接讀欄位，18 處）
        //    欄位名稱一旦改動，得同時找齊所有地方。收口之後只要改這裡。
        //    寫入端早已收口（文錢＝FMCollectionSave.addSilver、積分＝ScoreManager），
        //    這裡補的是**讀取端**。

        /** 目前總積分（顯示與排行榜用，不參與任何進度判定） */
        getScore: function () {
            try {
                if (window.ScoreManager && typeof window.ScoreManager.loadPlayerData === 'function') {
                    const d = window.ScoreManager.loadPlayerData();
                    return (d && d.totalScore) || 0;
                }
            } catch (e) { /* 存檔尚未初始化時視為 0 */ }
            return 0;
        },

        /** 目前文錢餘額 */
        getSilver: function () {
            try {
                if (window.FMCollectionSave && typeof window.FMCollectionSave.load === 'function') {
                    return window.FMCollectionSave.load().silver || 0;
                }
            } catch (e) { /* 收集系統尚未初始化時視為 0 */ }
            return 0;
        },

        /**
         * 文錢異動（正值＝獲得，負值＝花費）。
         * ⚠️ 內部仍走 `FMCollectionSave.addSilver`（雲端流水帳的唯一收口），
         *    這裡只是幫呼叫端把 load / save 包起來，省得每個地方各寫三行。
         * @returns {number} 異動後的餘額
         */
        addSilver: function (amount, source, note) {
            try {
                const CS = window.FMCollectionSave;
                if (!CS || typeof CS.addSilver !== 'function') return 0;
                const data = CS.load();
                const after = CS.addSilver(data, amount, source, note);
                CS.save(data);
                return after;
            } catch (e) {
                console.warn('[FMGame] 文錢異動失敗:', e);
                return 0;
            }
        },

        /** 目前積分階級的中文名（書僮／蒙童／…／大儒） */
        getRankName: function () {
            try {
                if (window.ScoreManager && typeof window.ScoreManager.getCurrentRank === 'function') {
                    const r = window.ScoreManager.getCurrentRank(this.getScore());
                    return (r && (r.name || r.title)) || '';
                }
            } catch (e) { /* 同上 */ }
            return '';
        },

        // ═══════════════════════════════════════════════════════════════
        //  四、自我健檢
        // ═══════════════════════════════════════════════════════════════

        /**
         * 掃描所有已掛載的 window.GameXX，回報不符契約之處。
         *
         * 用途有二：
         *   · 主控台輸入 `FMGame.audit()` 就能當場看到哪一款不合規。
         *   · `tools/verify_learning_path.js` 拿它驗 39 款（見第 1 節）。
         *
         * @param {number} [max=60] 掃到 GameN 為止
         * @returns {Array<{game:string, problem:string}>} 空陣列代表全數合規
         */
        audit: function (max) {
            const out = [];
            const top = max || 60;
            for (let n = 1; n <= top; n++) {
                const G = (typeof window !== 'undefined') ? window['Game' + n] : null;
                if (!G || typeof G !== 'object') continue;
                const key = 'game' + n;
                REQUIRED_METHODS.forEach(function (m) {
                    if (typeof G[m] !== 'function') out.push({ game: key, problem: '缺少函式 ' + m + '()' });
                });
                REQUIRED_FIELDS.forEach(function (f) {
                    if (typeof G[f] === 'undefined') out.push({ game: key, problem: '缺少變數 ' + f });
                });
                if (G.difficultySettings) {
                    DIFFICULTY_TIERS.forEach(function (t) {
                        if (!G.difficultySettings[t]) {
                            out.push({ game: key, problem: 'difficultySettings 缺難度層「' + t + '」' });
                        }
                    });
                }
                // startNextLevel 必須可寫 —— 青雲梯是靠「暫時替換再還原」接管的，
                // 唯讀屬性會讓覆寫靜靜失效，完全沒有錯誤訊息。
                if (typeof G.startNextLevel === 'function') {
                    const d = Object.getOwnPropertyDescriptor(G, 'startNextLevel');
                    if (d && !d.writable && !d.set) {
                        out.push({ game: key, problem: 'startNextLevel 不可寫，青雲梯無法接管' });
                    }
                }
            }
            return out;
        }
    };

    if (typeof window !== 'undefined') window.FMGame = FMGame;
    if (typeof module !== 'undefined' && module.exports) module.exports = FMGame;
})();
