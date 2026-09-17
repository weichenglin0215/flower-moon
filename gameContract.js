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
 *   必備變數（一律宣告在物件上，不可等 init() 才長出來）
 *     isLevelMode            {boolean} 是否為關卡模式（青雲梯／考試派局時為 true）
 *     currentLevelIndex      {number}  目前關卡編號（＝ getSharedRandomPoem 的種子）
 *     difficultySettings     {object}  五個難度層都要有
 *     container              {Element|null} 遊戲 overlay 的 DOM，於 init() 賦值
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
    // ⚠️ `container` 是 2026-09-17 補進來的。它從一開始就被 `FMGame.stop()`／
    //    `FMGame.nextLevel()` 讀寫，青雲梯的 `launchGame` 也靠它判斷「別款遊戲
    //    是不是還開著」（learningPath.js 的「新舊兩層 overlay 疊著」修正），
    //    卻一直沒列進契約，`audit()` 因此抓不到漏宣告的那 15 款。
    //    漏宣告的後果是靜默的：`if (game.container)` 直接跳過，遊戲關不掉、
    //    捲動鎖不釋放，全程沒有任何錯誤訊息。
    //    ⚠️ 必須宣告在**物件上**（`container: null`），不可以只在 `init()` 裡
    //    第一次賦值 —— `audit()` 與青雲梯都可能在 `init()` 之前就讀它。
    const REQUIRED_FIELDS = ['isLevelMode', 'currentLevelIndex', 'difficultySettings', 'container'];
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
            // ⚠️ 容器若在中途被別的流程 stopGame() 藏起來（例如青雲梯站點
            //    跨過應試文位站、考試沙箱收場時關閉正在用的那一款遊戲），
            //    這裡呼叫的 startNewGame() 完全不會重新掀開 container ——
            //    那一步向來只有 showDifficultySelector() 的回呼在做。
            //    少了這行，玩家只會看到接下來的規則說明彈窗浮在別的畫面
            //    （例如青雲梯）上方，遊戲本體卻仍是 hidden，點什麼都沒反應。
            //
            // ⚠️⚠️ 只有「真的把一個 hidden 的容器重新掀開」時才 holdOverlayActive()。
            //    那種情況代表先前有人 stopGame() → FMGame.stop() → release 過一次，
            //    這裡補回來才配得上對。若無條件 hold，自由練習連過 N 關就是
            //    N 次 hold 對上離場時僅一次 release，_overlayActiveCount 永遠
            //    回不到 0，body 的 inline `overflow: hidden` 從此鎖死
            //    —— 正是下面 holdOverlayActive 註解警告的那個失效模式。
            if (game.container && game.container.classList.contains('hidden')) {
                game.container.classList.remove('hidden');
                FMGame.holdOverlayActive();
            }
            // 有些遊戲的難度標籤／按鈕顯示依賴關卡編號，推進後要同步
            if (typeof game.updateUIForMode === 'function') game.updateUIForMode();
            if (typeof game.startNewGame === 'function') game.startNewGame();
            else if (typeof game.startGameProcess === 'function') game.startGameProcess(false);
        },

        /**
         * 關閉遊戲的共同善後。**各遊戲的 `stopGame()` 只留下自己專屬的部分**
         * （清自己的 `timerInterval`／`requestAnimationFrame`、`isActive = false`、
         * 遊戲特有的畫面重置…），結尾一律呼叫這支，不要各自手刻下面這幾行：
         *
         * ```javascript
         * stopGame: function () {
         *     this.isActive = false;
         *     if (this.timerInterval) clearInterval(this.timerInterval);
         *     window.FMGame.stop(this);
         * },
         * ```
         *
         * ⚠️ 這是「考試通過後跳出『下一關』／『步步為陣』空彈窗」這個 bug 補的洞：
         *    39 款遊戲的 `stopGame()` 從來沒有人取消 `ScoreManager` 的結算動畫。
         *    遊戲被外部關掉時（青雲梯跨過應試站、考試沙箱收場、漢堡選單全域清理），
         *    飛行中的星星依然會在幾秒後降落、觸發 `completeLevel`／彈出「下一關」
         *    訊息框——那時畫面早已經是別的東西了，遊戲本體卻還是 hidden，
         *    玩家點什麼都沒反應。`RuleNoteDialog`／`GameMessage` 同理：
         *    它們是跨遊戲共用的 singleton，沒有人在「關閉遊戲」的當下順手收掉，
         *    就可能被留在畫面上等一個永遠不會被回應的狀態。
         *
         * @param {object} game 遊戲物件（傳 this）
         */
        stop: function (game) {
            if (!game) return;
            if (window.ScoreManager && typeof window.ScoreManager.cancelAnimation === 'function') {
                window.ScoreManager.cancelAnimation();
            }
            if (window.RuleNoteDialog && typeof window.RuleNoteDialog.hide === 'function') {
                window.RuleNoteDialog.hide();
            }
            if (window.GameMessage && typeof window.GameMessage.hide === 'function') {
                window.GameMessage.hide();
            }
            if (game.container) game.container.classList.add('hidden');
            FMGame.releaseOverlayActive();
        },

        /**
         * 疊加式的「body 捲動鎖」開關。
         *
         * ⚠️ 全站對「鎖住 body 捲動」有兩種寫法並存：`responsive.css` 的
         *    `body.overlay-active { overflow: hidden; }`（class），以及 33 款
         *    遊戲各自在難度選擇回呼裡直接設的 `document.body.style.overflow =
         *    'hidden'`（inline style）。inline style 的優先權高於 class，
         *    **只清 class、不清 inline，body 會永遠鎖死**——這裡兩個都管，
         *    才能跟現有 33 款遊戲的既有寫法相容。
         *
         *    這裡先只包住 `FMGame` 自己這兩支共用函式（`nextLevel`／`stop`），
         *    跟現有各遊戲各自手寫的 raw `classList`／`style.overflow`
         *    設定混用時，最壞情況只是捲動鎖提早或延後解除，不會造成畫面錯誤。
         *    各批次遷移遊戲時，把該遊戲原本手寫的
         *    `document.body.classList.add/remove('overlay-active')` 與
         *    `document.body.style.overflow = 'hidden'/''` 一併換成這兩支，
         *    逐步把 raw 呼叫點清零。
         */
        _overlayActiveCount: 0,
        holdOverlayActive: function () {
            FMGame._overlayActiveCount++;
            document.body.classList.add('overlay-active');
            document.body.style.overflow = 'hidden';
        },
        releaseOverlayActive: function () {
            FMGame._overlayActiveCount = Math.max(0, FMGame._overlayActiveCount - 1);
            if (FMGame._overlayActiveCount === 0) {
                document.body.classList.remove('overlay-active');
                document.body.style.overflow = '';
            }
        },

        /**
         * 「先跳規則說明、玩家按下確認才真正開局」的共用彈窗。
         * 取代 6 款遊戲（`game3/7/14/36/37/40`）目前 3 種互不相同的手寫法
         * （具名 `showStartMessage()`+`gameStart()`／`onConfirm` 內聯匿名函式／
         * `startNewGame()` 內的未具名區域閉包）。
         *
         * @param {object} game        遊戲物件（供未來擴充使用，傳 this）
         * @param {object} config      同 `RuleNoteDialog.show()` 的參數
         *                             （`title`／`lines`／`btnText`／`styles`）
         * @param {Function} onConfirm 玩家按下確認鈕後要做的事（通常是真正開始計時的函式）
         */
        showRuleIntro: function (game, config, onConfirm) {
            if (!window.RuleNoteDialog) { if (onConfirm) onConfirm(); return; }
            window.RuleNoteDialog.show(Object.assign({}, config, { onConfirm: onConfirm }));
        },

        /**
         * 贏了／輸了之後的共同流程：按鈕防呆 →（贏的話）播結算動畫 → 記分 →
         * 即時成就彈窗 → 顯示結算訊息框 → 訊息框按鈕接 `FMGame.advance`。
         *
         * 已收斂原本兩套互不相容的寫法（10 款遊戲先播完動畫才呼叫
         * `gameOver(true,'')` 純記錄；29 款遊戲的 `gameOver()` 自己觸發動畫），
         * 39 款現在一律走這一支。
         *
         * ⚠️ 考試是靠**覆寫遊戲身上的 `gameOver`** 把勝負接回考場的
         *    （見 `examEngine._patchGame`），所以遊戲內部判定勝負時一定要呼叫
         *    **自己的 `this.gameOver(win, reason)`**，不可以跳過它直接呼叫本函式
         *    —— 那樣考試攔不到，考場會停在那一題等一個永遠不會來的結果。
         *
         * 各遊戲的 `gameOver(win, reason)` 應該只是一行轉呼叫：
         *
         * ```javascript
         * gameOver: function (win, reason) {
         *     window.FMGame.gameOver(this, win, reason, {
         *         gameNo: 24, gameKey: 'game24',
         *         anim: { scoreElementId: 'game24-score', timerContainerId: 'game24-timer-ring',
         *                 heartsSelector: '#game24-hearts .heart:not(.empty)' },
         *         setButtons: (win) => {
         *             document.getElementById('game24-retryGame-btn').disabled = win;
         *             document.getElementById('game24-newGame-btn').disabled = win;
         *         }
         *     });
         * },
         * ```
         *
         * @param {object} game   遊戲物件（傳 this）
         * @param {boolean} win
         * @param {string} reason 失敗原因（贏的話 GameMessage 不會顯示它，留空字串即可）
         * @param {object} opts
         *   gameNo {number}       輸了時要記錄 game_logs 用的遊戲編號（省略＝不記）
         *   gameKey {string}      `completeLevel`／`playWinAnimation` 用的鍵，
         *                         必須與檔名一致（例如 `'game24'`）
         *   anim {object|false}   傳給 `ScoreManager.playWinAnimation` 的選項
         *                         （`scoreElementId`／`timerContainerId`／
         *                         `heartsSelector`／`getStarStartPoint`…）。
         *                         贏的話預設一定會播；極少數沒有分數動畫的遊戲可傳 `false` 跳過。
         *   setButtons {Function} `(win) => void`，遊戲自己的按鈕防呆邏輯
         *   message {object}      覆寫／附加給 `GameMessage.show()` 的欄位（例如 `customContent`）
         */
        gameOver: function (game, win, reason, opts) {
            if (!game) return;
            const o = opts || {};
            game.isActive = false;
            game.isWin = win;

            if (!win && window.SupabaseClient && o.gameNo) {
                const durationS = game.gameStartTime
                    ? Math.floor((Date.now() - game.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: o.gameNo, difficulty: game.difficulty || '',
                    score: 0, isWin: false, durationS: durationS
                });
            }
            if (typeof o.setButtons === 'function') o.setButtons(win);

            const proceed = (finalScore) => {
                if (finalScore !== undefined) game.score = finalScore;
                const onConfirm = () => window.FMGame.advance(game, win);
                const showMessage = () => {
                    if (!window.GameMessage) return;
                    window.GameMessage.show(Object.assign({
                        isWin: win,
                        score: win ? Math.floor(game.score || 0) : 0,
                        reason: reason,
                        btnText: win ? (game.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    }, o.message || {}));
                };
                // ⚠️ 通關紀錄必須在顯示結算訊息之前寫下去：青雲梯的進度
                //    完全由 levelCleared 推導，漏記等於這一局白打。
                if (win && game.isLevelMode) window.FMGame.completeLevel(o.gameKey, game);
                showMessage();
            };

            if (win && o.anim !== false && window.ScoreManager) {
                window.ScoreManager.playWinAnimation(Object.assign(
                    { game: game, difficulty: game.difficulty, gameKey: o.gameKey },
                    o.anim || {},
                    { onComplete: proceed }
                ));
            } else {
                proceed();
            }
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
         * @returns {null} 恆為 null。「關卡挑戰里程碑成就」這個獎狀類別已隨
         *          青雲梯改版取消（見 `scoreManager.completeLevel` 的說明），
         *          底層的 `ScoreManager.completeLevel()` 因此不再回傳 achId，
         *          而 `AchievementDialog.showInstantAchievementPop` 也已從
         *          achievement.js 移除。呼叫端請**不要**再寫
         *          `if (achId) …彈窗…` 的分支，那是永遠不會成立的死碼。
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
