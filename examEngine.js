/* ============================================================================
 * examEngine.js —《花月》遊戲化考試引擎
 * ----------------------------------------------------------------------------
 * 對應規劃：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md
 * 規則層在 examConfig.js（純資料），本檔只負責「把考試跑起來」。
 *
 * ⭐ 一場考試長什麼樣
 *     一題 ＝ 用八款遊戲之一，玩一局指定的詩。
 *     贏了那一局＝答對，輸了（紅心用完／時間到）＝答錯。
 *     全部題目跑完後統計答對數，達到及格線就通過。
 *
 * ⭐ 三種模式
 *     mock  模擬考：不收費、不寫任何正式紀錄，純練手感
 *     real  正式考：收費、通過即冊封文位
 *     skip  越級考試：收費、無模擬考、遊戲調嚴、通過直接補發沿途所有文位
 *
 * ⭐⭐ 最重要的一件事：考試局**絕對不能**污染青雲梯進度 ⭐⭐
 *     五款遊戲在過關時會自己呼叫 ScoreManager.saveScore()，那會：
 *       · 把該關記進 levelCleared → 青雲梯站點進度前進
 *       · 發積分與文錢
 *       · 寫 game_logs（且因為 LevelTable 有情境，會被標成晉升局）
 *     考試是「驗收」不是「練習」，上述通通不該發生 ——
 *     否則玩家考一次塾生，青雲梯進度會莫名其妙往前跳一大段。
 *     ScoreManager 既有的「溫習模式」只擋 pathRounds，擋不掉其餘三項，
 *     因此本檔改用「考試期間直接把 saveScore／logGame 換成空函式」的作法，
 *     考完再原樣還原（見 _installSandbox / _removeSandbox）。
 * ========================================================================== */

(function () {
    'use strict';

    if (!document.getElementById('exam-engine-css')) {
        const link = document.createElement('link');
        link.id = 'exam-engine-css';
        link.rel = 'stylesheet';
        link.href = 'examEngine.css';
        document.head.appendChild(link);
    }

    const ExamEngine = {

        _plan: null,
        _questions: [],
        _qi: 0,
        _correct: 0,
        _mode: 'real',
        _onDone: null,
        _sandbox: null,
        _patchedGame: null,
        _overlay: null,
        _aborted: false,
        _navLockedGameNo: null, // 目前被鎖住「難度標籤／開新局」鈕的遊戲編號

        // 這一場考試是否已經結算過。_finish() 靠它做冪等。
        // ⚠️ 破壞性測試找到的問題：_finish() 被重複觸發（例如結算後又被
        //    abort()、或任何路徑二次呼叫）時，會把 examStats 的 passCount／
        //    failCount 與 examLog 各再寫一次，玩家的考試次數統計會憑空變多。
        _finished: false,
        // 非正常入場時要顯示的原因（例如入場當下盤纏已不足）
        _abortReason: '',
        // 玩家是否真的按過「入場應試」（＝報名費與今日次數已經扣掉）。
        // 「←放棄」的確認彈窗靠它決定要不要警告「報名費不予退還」。
        _entered: false,
        // 正在派出某一題的遊戲（_tryCombo 內 GameObj.show() 那段）。
        // ⚠️ 存在的理由見 forceStop()：遊戲自己的啟動流程有可能反過來
        //    觸發全域清理，那一瞬間絕不能讓考試被自己殺掉。
        _launching: false,

        // 這場考試「正在進行」的旗標：true 的區間＝ start() 到 _finish()。
        // ⚠️ 存在的理由：考試期間逐題實際玩的那五款遊戲，右上角原本會顯示
        //    「第 X 局」（見 scoreManager.js 的 window.FMRoundLabel）。那個數字
        //    讀的是 pathRounds，但考試沙箱把 completeLevel 換成空函式
        //    （見 _installSandbox），pathRounds 整場考試都不會變動——
        //    於是玩家會看到同一個局號從第一題重複到最後一題，很困惑。
        //    FMRoundLabel 用這個旗標判斷「現在是不是在考試」，
        //    是的話改顯示「考試／越級考試／模擬考」而不是局號。
        _active: false,

        // ══════════════════════════════════════════════════════════
        //  對外介面
        // ══════════════════════════════════════════════════════════

        /**
         * 開始一場考試。
         *
         * @param {object} opts
         *   rankName {string}   應試文位
         *   mode     {string}   'mock' | 'real' | 'skip'
         *   onEnter  {Function} 玩家在簡介畫面按下「入場應試」時呼叫一次，
         *                       負責真正扣報名費／記今日已應試。
         *                       ⚠️ 呼叫端（learningPath.js）不可以在呼叫
         *                       start() 之前就先扣——簡介畫面按「先回家
         *                       苦讀」取消是**還沒入場**，不該收費或算掉
         *                       今日名額（2026-09 實測回報：模擬考按取消
         *                       仍損失當日名額）。
         *   onDone   {Function} (result) => void
         *                       result = { passed, correct, total, aborted, mode, rankName }
         */
        start: function (opts) {
            const o = opts || {};
            const C = window.FMExamConfig;
            if (!C) { console.warn('[考試] examConfig.js 未載入'); return false; }

            // ⚠️⚠️ 重入防護（2026-09 破壞性測試找到）：一場考試還在進行時
            //    再呼叫 start()，舊版會直接把 _plan／_questions／_onDone 全部
            //    覆蓋掉——前一場考試等於被無聲吃掉：已經扣掉的報名費拿不回來、
            //    前一場的 onDone（負責演出晉升與回到青雲梯）永遠不會被呼叫，
            //    而沙箱因為 `if (this._sandbox) return` 只會安裝一次，
            //    拆除時序也跟著錯亂。實際觸發路徑：連點兩下考試標記、
            //    或考試中從別的入口（江南小院／越級選單）再開一場。
            //    正確作法是拒絕，讓呼叫端自己提示玩家。
            if (this._active) {
                console.warn('[考試] 已有考試進行中，拒絕重複開考：', o.rankName);
                return false;
            }

            // ⚠️ 2026-09-06 起考卷一律由「站點」算出來：文位考的站名剛好等於
            //    文位名，小考則只有站名。opts.rankName 傳的就是站名。
            const PS = window.PathStations;
            const station = (PS && typeof PS.getStationByName === 'function')
                ? PS.getStationByName(o.rankName) : null;
            const plan = (station && typeof C.getPlanForStation === 'function')
                ? C.getPlanForStation(station, o.mode === 'skip')
                : C.getPlan(o.rankName, o.mode === 'skip');
            if (!plan || !plan.poemIds.length) {
                console.warn('[考試] 取不到考試範圍：', o.rankName);
                if (typeof o.onDone === 'function') o.onDone({ passed: false, error: 'no-scope' });
                return false;
            }

            this._plan = plan;
            this._mode = o.mode || 'real';
            this._onDone = (typeof o.onDone === 'function') ? o.onDone : null;
            this._onEnter = (typeof o.onEnter === 'function') ? o.onEnter : null;
            this._questions = C.buildQuestions(plan);
            this._qi = 0;
            this._correct = 0;
            this._aborted = false;
            this._finished = false;
            this._abortReason = '';
            this._entered = false;
            this._active = true;

            this._installSandbox();
            this._buildOverlay();
            this._showIntro();
            // 考試開始 → 鎖住漢堡選單，改顯示「←（放棄考試）」。
            // ⚠️ 從簡介畫面就鎖：那裡雖然還沒扣錢，但玩家若從漢堡選單切走，
            //    這場考試一樣會被 closeAllActiveOverlays 靜默收掉。
            this._syncSessionGuard();
            return true;
        },

        /**
         * 現在是不是有考試正在進行（含還停在簡介畫面的狀態）。
         * 呼叫端（learningPath／collection）在開考前應先問一次，
         * 才能用自己的提示列告訴玩家「考試進行中」，而不是靜靜地失敗。
         */
        isBusy: function () {
            return !!this._active;
        },

        /** 中止考試（玩家按「棄考」，會顯示結算卡並照常呼叫 onDone） */
        abort: function () {
            this._aborted = true;
            this._finish();
        },

        /**
         * 供全域清理呼叫（menu.js 的 closeAllActiveOverlays）的靜默中止。
         *
         * ⚠️⚠️ 為什麼不能直接呼叫 abort()：玩家這時已經在離開這個畫面
         *    （例如從漢堡選單切到別的頁面），abort() 會顯示「棄考」結算卡、
         *    考完再呼叫 onDone（通常是 LearningPath.show()）——那會在玩家
         *    要去的新頁面上疊出一層不該出現的舊畫面。
         *    這裡只做「別讓沙箱繼續污染其餘功能」這件事：拆沙箱（還原
         *    ScoreManager.completeLevel／saveScore、SupabaseClient.logGame、
         *    window.alert、LevelTable 情境）、還原被考試劫持的遊戲
         *    gameOver／startNextLevel、收掉考試自己的 overlay。
         *
         * ⚠️ 這是 2026-09 實測回報的根因修復：玩家在考試中途從漢堡選單
         *    離開後，ScoreManager.completeLevel 會永久停在考試沙箱的空函式，
         *    導致回到青雲梯後打贏任何一局都不會真的記進度——站點卡住原地
         *    不動、同一課程反覆重派，玩家會誤以為「資料亂了」。
         */
        forceStop: function () {
            // ⚠️⚠️ 派題當下（_tryCombo 正在跑 GameObj.show()）一律忽略。
            //    2026-09-11 實測：game13「人事時地」的 showDifficultySelector()
            //    裡有一行 `MenuManager.closeAll()`，而全域清理會呼叫本函式——
            //    考試抽到它出題時，等於在開局那一刻把自己這場考試殺掉，
            //    接著真正的難度選單就彈到玩家臉上。那一行已經移除，
            //    但任何遊戲日後都可能再寫出同樣的呼叫，因此這裡留一道防線：
            //    **考試正在派題的瞬間，不接受任何外部中止**。
            //    玩家真的要離開時走的是「←放棄」或切頁，那時 _launching 是 false，
            //    中止照常生效。
            if (this._launching) {
                console.warn('[考試] 正在派題，忽略這次 forceStop（避免考試殺掉自己）');
                return;
            }
            // ⚠️ 考試通過後的晉升動畫（PromotionCelebration，見 _celebrate）是在
            //    _finish() 已經把 _active／_sandbox／_overlay 都清掉之後才播放的，
            //    下面那行「沒有東西在跑就提早 return」擋不住它——播到一半玩家從
            //    漢堡選單離開，它會繼續在背景播完、彈出獎狀蓋在別的畫面上。
            //    因此這兩行必須放在提早 return 之前，不受那個守門條件限制。
            if (window.PromotionCelebration && typeof window.PromotionCelebration.stop === 'function') {
                window.PromotionCelebration.stop(true);
            }
            if (window.AchievementDialog && typeof window.AchievementDialog.forceCloseCert === 'function') {
                window.AchievementDialog.forceCloseCert();
            }
            if (!this._active && !this._sandbox && !this._overlay) return;
            this._active = false;
            this._aborted = true;
            this._onDone = null;
            this._onEnter = null;
            this._unpatchGame();
            this._removeSandbox();
            this._teardown();
            this._syncSessionGuard();   // 被全域清理收掉 → 也要還原漢堡選單
        },

        /**
         * 通知青雲梯依當下狀態重算「要不要鎖漢堡選單」。
         * ⚠️ 判斷邏輯集中在 LearningPath.updateSessionGuard()（由狀態推導），
         *    這裡只負責在狀態變動時戳它一下，不自己複製一份判斷。
         */
        _syncSessionGuard: function () {
            const LP = window.LearningPath;
            if (LP && typeof LP.updateSessionGuard === 'function') LP.updateSessionGuard();
        },

        // ══════════════════════════════════════════════════════════
        //  沙箱：考試期間隔離所有會寫入進度的呼叫
        // ══════════════════════════════════════════════════════════

        /**
         * ⚠️ 這是本檔最關鍵的一段，改動前務必先讀檔頭的說明。
         *    少了它，考試會實際推進青雲梯進度、發文錢、灌排行榜。
         */
        _installSandbox: function () {
            if (this._sandbox) return;
            const box = {};

            if (window.ScoreManager) {
                box.saveScore = window.ScoreManager.saveScore;
                box.completeLevel = window.ScoreManager.completeLevel;
                // 回傳 0 而不是 undefined：部分遊戲會拿回傳值去算顯示分數
                window.ScoreManager.saveScore = function () { return 0; };
                window.ScoreManager.completeLevel = function () { return null; };
            }
            if (window.SupabaseClient) {
                box.logGame = window.SupabaseClient.logGame;
                // 考試的每一局都不進 game_logs；整場考試只在結束時記一筆總結
                window.SupabaseClient.logGame = function () { return Promise.resolve(); };
            }
            // ── 難度選擇器：整場考試都攔住 ──
            // ⚠️⚠️ 這裡以前是「每開一局才攔一次、而且攔到第一次呼叫就立刻還原」
            //    的一次性作法，實測會漏：玩家在越級考試中途看到**真的難度選單**
            //    跳出來（主控台可見 "[DifficultySelector] 正在開啟難度選擇器"）。
            //    只要有任何一條路徑在還原之後又呼叫一次 show（例如遊戲內部
            //    重試、或 closeAllActiveOverlays 連帶觸發第二次流程），
            //    玩家就會被丟進難度選單，考試等於中斷。
            //    改成「整場考試從頭攔到尾」，呼叫幾次都不會漏。
            const DS = window.DifficultySelector;
            if (DS && typeof DS.show === 'function') {
                // ⚠️ 回推到真正的原版：青雲梯的 launchGame 也會暫時覆寫
                //    DS.show（注入難度與關卡）。若把它的替身當成原版存起來，
                //    考完拆沙箱時就會把那個替身永久裝回去，玩家從漢堡選單
                //    進自由練習會選不了難度。作法與遊戲方法的覆寫相同。
                box.dsShow = DS.show.__fmOriginal || DS.show;
                const self = this;
                const patchedDsShow = function (name, cb) {
                    const p = self._pending;
                    if (!p) { return box.dsShow.apply(DS, arguments); }

                    // ⚠️⚠️ 防遞迴：有的遊戲在「取不到詩」時會自己再叫一次
                    //    難度選擇器當作補救 —— game13（人事時地）的 startNewGame
                    //    失敗分支就是 `alert('載入詩詞失敗'); this.showDifficultySelector();`。
                    //    正式環境下那會把**真的難度選單**彈到玩家面前，
                    //    考試等於中斷（實測回報：越級考試中途跳出難度選單）。
                    //    但若照單全收地再回呼一次，就會變成
                    //    show → cb → startNewGame → 取不到詩 → show → …
                    //    無限遞迴直接爆堆疊。
                    //    因此同一次開局嘗試只回呼一次；第二次以後直接忽略，
                    //    讓 startNewGame 自然結束，交由外層的「換組合」邏輯處理。
                    self._dsCalls = (self._dsCalls || 0) + 1;
                    if (self._dsCalls > 1) return;

                    // 每次被呼叫都重新鎖題：closeAllActiveOverlays 會在這之前
                    // 清掉白名單（見 learningPath.stopGame），不重鎖就會洩題。
                    self._lockPoem(p);
                    if (typeof cb === 'function') cb(p.tier, p.level);
                };
                patchedDsShow.__fmOriginal = box.dsShow;
                DS.show = patchedDsShow;
            }

            // ── alert：整場考試都攔住 ──
            // 遊戲取不到詩時會 alert（例如「載入詩詞失敗」）。考試中不該讓
            // 這種系統提示彈到玩家臉上，改成記錄下來供換遊戲判斷用。
            box.alert = window.alert;
            const self2 = this;
            window.alert = function (m) { self2._lastAlert = String(m); };

            // 青雲梯的白名單／情境在考試期間由本檔全權控制，
            // 考完必須還原，否則玩家回到青雲梯會沿用考試最後一題的情境。
            box.hadContext = !!(window.LevelTable && window.LevelTable.getContext());
            this._sandbox = box;
        },

        _removeSandbox: function () {
            const box = this._sandbox;
            if (!box) return;
            if (window.ScoreManager) {
                if (box.saveScore) window.ScoreManager.saveScore = box.saveScore;
                if (box.completeLevel) window.ScoreManager.completeLevel = box.completeLevel;
            }
            if (window.SupabaseClient && box.logGame) {
                window.SupabaseClient.logGame = box.logGame;
            }
            if (box.dsShow && window.DifficultySelector) {
                window.DifficultySelector.show = box.dsShow;
            }
            if (box.alert) window.alert = box.alert;
            if (window.LevelTable) {
                window.LevelTable.clearContext();          // 一併清掉白名單
            }
            this._pending = null;
            this._sandbox = null;
        },

        /**
         * 把出題死鎖在指定的那一首詩。
         * ⚠️ 必須可以重複呼叫：遊戲啟動途中的 closeAllActiveOverlays()
         *    會清掉白名單，所以難度選擇器的回呼裡還要再鎖一次。
         */
        _lockPoem: function (p) {
            const LT = window.LevelTable;
            if (!LT || !p) return;
            LT.setContext(p.tier, p.level);
            if (typeof LT.setAllowedPoemIds === 'function') {
                LT.setAllowedPoemIds([p.poemId]);
            }
        },

        // ══════════════════════════════════════════════════════════
        //  介面
        // ══════════════════════════════════════════════════════════

        _buildOverlay: function () {
            if (this._overlay) return;
            const ov = document.createElement('div');
            ov.className = 'exg-overlay';
            ov.innerHTML = '<div class="exg-card" id="exgCard"></div>';
            document.body.appendChild(ov);
            if (window.registerOverlayResize) {
                window.registerOverlayResize(function (r) {
                    if (!ov.isConnected) return;
                    ov.style.left = r.left + 'px';
                    ov.style.top = r.top + 'px';
                    ov.style.width = '500px';
                    ov.style.height = '850px';
                    ov.style.transform = 'scale(' + r.scale + ')';
                    ov.style.transformOrigin = 'top left';
                });
            }
            this._overlay = ov;
        },

        _card: function (html) {
            if (!this._overlay) this._buildOverlay();
            this._overlay.style.display = 'flex';
            this._overlay.querySelector('#exgCard').innerHTML = html;
        },

        _hideCard: function () {
            if (this._overlay) this._overlay.style.display = 'none';
        },

        _modeLabel: function () {
            return this._mode === 'mock' ? '模擬考'
                : this._mode === 'skip' ? '越級考試' : '正式考試';
        },

        _showIntro: function () {
            const p = this._plan;
            const isMock = this._mode === 'mock';
            const strictNote = this._mode === 'skip'
                ? '<div class="exg-row exg-warn">越級考試：紅心減半，及格線 ' + p.passRateText + '</div>'
                : '';
            const mockNote = isMock
                ? '<div class="exg-row exg-note">模擬考不扣文錢，成績不列入正式紀錄。</div>'
                : '';

            this._card(
                '<h2>' + this._modeLabel() + '　' + p.rankName + '</h2>'
                + '<div class="exg-row"><span>考試範圍</span><span>' + p.stationNames[0]
                + ' ～ ' + p.stationNames[p.stationNames.length - 1] + '</span></div>'
                + '<div class="exg-row"><span>涵蓋詩詞</span><span>' + p.poemIds.length + ' 首</span></div>'
                + '<div class="exg-row"><span>題目數</span><span>' + p.totalQuestions
                + ' 題（每首 ' + p.perPoem + ' 題）</span></div>'
                + '<div class="exg-row"><span>及格</span><span>答對 ' + p.passCount
                + ' 題（' + p.passRateText + '）</span></div>'
                + strictNote + mockNote
                + '<div class="exg-note">每題以「人事時地／丟三落一／字爬梯／步步驚心／步步為陣／作者是誰／'
                + '眾裡尋他／打地詩」八款之一出題，過關即為答對。</div>'
                + '<div class="exg-footer">'
                + '<button class="exg-btn exg-btn-sub" id="exgQuit">先回家苦讀</button>'
                + '<button class="exg-btn" id="exgGo">入場應試</button>'
                + '</div>'
            );

            const self = this;
            this._overlay.querySelector('#exgGo').onclick = function () {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                // 真正「入場」的這一刻才扣報名費／記今日名額，見 start() 的
                // onEnter 說明。只能觸發一次，避免玩家萬一重複點擊時被扣兩次。
                //
                // ⚠️ onEnter 回傳 false ＝「現在不能入場」（例如玩家在簡介
                //    畫面停留期間把文錢花掉了，餘額已經不夠）。這時絕不能
                //    硬扣下去讓文錢變負數，改成當作沒有入場、直接離場。
                if (self._onEnter) {
                    const fn = self._onEnter;
                    self._onEnter = null;
                    if (fn() === false) {
                        self._aborted = true;
                        self._finish();
                        return;
                    }
                }
                self._entered = true;   // 報名費／今日次數已經扣掉
                self._nextQuestion();
            };
            this._overlay.querySelector('#exgQuit').onclick = function () {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                self._aborted = true;
                self._finish();
            };
        },

        // ══════════════════════════════════════════════════════════
        //  逐題執行
        // ══════════════════════════════════════════════════════════

        _nextQuestion: function () {
            if (this._aborted) return;
            if (this._qi >= this._questions.length) { this._finish(); return; }

            const q = this._questions[this._qi];
            // 每一題各自重算「哪些詩試過了」，否則前一題排除掉的詩
            // 會一路累積下去，到後面可換的詩愈來愈少。
            this._badPoems = {};
            this._hideCard();
            this._launch(q);
        },

        /**
         * 把某一題派給某一款遊戲。
         *
         * @param {object} q      題目 { poemId, gameNo }
         * @param {Array}  tried  已經試過但出不了題的遊戲（避免無限重試）
         */
        _launch: function (q) {
            const C = window.FMExamConfig;
            const PS = window.PathStations;

            // ── 把「這首詩的每個關卡 × 五款遊戲」排成候選組合 ──
            // ⚠️ 不能只換遊戲、不換關卡。同一首詩的不同關卡起始句不同，
            //    句數與字數也就不同，能不能被某款遊戲用是逐「關卡」而異的
            //    （實測同一首〈短歌行〉在第 157／160／171 關的結果都不一樣）。
            //    只換遊戲的話，五款試完就放棄，明明還有別的關卡可用。
            const entry = (PS.getPoemUnits() || []).find(function (x) { return x.id === q.poemId; });
            if (!entry || !entry.units || !entry.units.length) {
                console.warn('[考試] 這首詩沒有可用關卡：', q.poemId);
                return this._substitutePoem(q);
            }

            const combos = [];
            entry.units.forEach(function (u) {
                C.EXAM_GAMES.forEach(function (g) { combos.push({ unit: u, gameNo: g }); });
            });
            // 洗牌，避免每次都從同一個關卡／同一款遊戲開始試
            for (let i = combos.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = combos[i]; combos[i] = combos[j]; combos[j] = t;
            }
            // 讓這一題原本抽到的遊戲優先（維持「每題隨機挑一款」的設計），
            // 只有它出不了題時才會用到後面的候選。
            combos.sort(function (a, b) {
                return (b.gameNo === q.gameNo ? 1 : 0) - (a.gameNo === q.gameNo ? 1 : 0);
            });

            for (let i = 0; i < combos.length; i++) {
                if (this._tryCombo(q, combos[i])) return;   // 成功開局就結束
            }

            // 這首詩所有關卡 × 五款遊戲都出不了題 → 換一首同範圍的詩
            console.warn('[考試] 這首詩所有關卡與遊戲都出不了題，改考別首：', q.poemId);
            this._substitutePoem(q);
        },

        /**
         * 試著用某個「關卡 × 遊戲」組合開局。
         *
         * @returns {boolean} true = 成功開局（畫面已交給遊戲）
         */
        _tryCombo: function (q, combo) {
            const GameObj = window['Game' + combo.gameNo];
            if (!GameObj || typeof GameObj.show !== 'function') return false;

            const unit = combo.unit;
            // 難度選擇器的攔截器會讀這個，據以回呼正確的難度層與關卡，
            // 並在回呼前重新鎖題（closeAllActiveOverlays 會清掉白名單）。
            this._pending = { tier: unit.tier, level: unit.level, poemId: q.poemId };
            this._lockPoem(this._pending);

            this._applySkipOverrides(GameObj, unit.tier);
            this._patchGame(GameObj, q);

            this._lastAlert = null;
            this._dsCalls = 0;      // 這一次開局嘗試允許回呼一次難度選擇器
            // ⚠️ 開局期間豎起 _launching：遊戲的 show() 有可能（直接或間接）
            //    呼叫 menu.js 的全域清理，那會把這場考試中止掉（見 forceStop）。
            this._launching = true;
            try {
                GameObj.show();
            } finally {
                this._launching = false;
            }

            // ── 正面確認這一局真的拿到了指定的那一首詩 ──
            // ⚠️ 不可以只靠 alert 判斷失敗：五款裡有三款（13／14／37）
            //    在取不到詩時是「安靜地 return false」，完全不會 alert。
            //    那時 startNewGame 會提早結束（不呼叫 prepareLadder，
            //    也不呼叫 showStartMessage），gameStart() 從未執行、
            //    isActive 永遠是 false，但容器已經顯示出來了 ——
            //    畫面上留著上一局的殘影（答題歷程停在第 11 個字、
            //    倒數停在舊秒數），玩家怎麼點都沒反應，考試就卡死。
            //    （實測回報：塾生越級考到第 10 題遇到「步步為陣」時卡住。）
            //
            //    也因為失敗時 currentPoem 不會被更新，這裡讀到的往往是
            //    **上一局的詩**（log 中的「實得 332」就是這樣來的），
            //    所以必須比對 id 是否等於指定值，不能只檢查有沒有值。
            const gotPoem = GameObj.currentPoem && GameObj.currentPoem.id;
            if (this._lastAlert || gotPoem !== q.poemId) {
                console.warn('[考試] Game' + combo.gameNo + ' 在「' + unit.tier + '」第 '
                    + unit.level + ' 關出不了指定的詩（要 ' + q.poemId
                    + '，實得 ' + gotPoem + '）'
                    + (this._lastAlert ? '：' + this._lastAlert : '（未跳提示）') + ' → 換組合');
                this._unpatchGame();
                if (typeof GameObj.stopGame === 'function') GameObj.stopGame();
                return false;
            }
            q.gameNo = combo.gameNo;

            // 禁止點擊這款遊戲自己的「難度標籤」與「開新局」鈕，避免玩家
            // 考試中途岔去跳出真正的難度選單。只擋點擊、照常顯示——
            // 難度標籤這時顯示的是「考試／越級考試／模擬考」，玩家要靠它
            // 知道自己正在考試（見 LearningPath.setGameNavLocked 的說明，
            // 考試沿用同一套鎖）。
            if (window.LearningPath && typeof window.LearningPath.setGameNavLocked === 'function') {
                this._navLockedGameNo = combo.gameNo;
                window.LearningPath.setGameNavLocked(combo.gameNo, true);
            }
            return true;
        },

        /**
         * 這首詩怎麼樣都出不了題 → 換一首「同一場考試範圍內」的詩。
         *
         * ⚠️ 刻意不直接算答錯：玩家根本沒機會作答就被扣一題，
         *    在題數少、及格線又高的考試裡足以害人落榜，很不公平。
         *    換一首同範圍的詩既保住公告的總題數，考的也仍是這個文位該會的詩。
         */
        _substitutePoem: function (q) {
            const pool = (this._plan && this._plan.poemIds) || [];
            const tried = this._badPoems || (this._badPoems = {});
            tried[q.poemId] = true;
            const alt = pool.filter(function (id) { return !tried[id]; });
            if (!alt.length) {
                console.warn('[考試] 範圍內已無可用的詩，該題以答錯計。');
                return this._record(false);
            }
            q.poemId = alt[Math.floor(Math.random() * alt.length)];
            this._launch(q);
        },

        /**
         * 覆寫遊戲的 gameOver，把「這一局贏了沒」接回考試流程。
         *
         * ⚠️ 刻意**不呼叫原本的 gameOver**：原版會跳自己的過關／失敗訊息框，
         *    還會在失敗時自己寫一筆 game_logs，兩者在考試裡都不該發生。
         *    startNextLevel 也一併擋掉，否則遊戲會自己接著開下一關。
         */
        _patchGame: function (GameObj, q) {
            this._unpatchGame();
            const self = this;
            // ⚠️ 一律回推到「真正的原版」再存（2026-09 亂序模擬抓到）：
            //    青雲梯的 launchGame 也會覆寫同一支 startNextLevel。
            //    若兩邊都把「我覆寫前看到的那一個」當成原版，交錯還原時
            //    會互相把對方的替身當成原版裝回去，那款遊戲就永久停在
            //    別人的閉包上。替身身上掛 __fmOriginal 指向真正的原版，
            //    不論誰先誰後都拿得回同一個原版（learningPath.js 同一套作法）。
            const trueOrig = (fn) => (fn && fn.__fmOriginal) ? fn.__fmOriginal : fn;
            const saved = {
                obj: GameObj,
                gameOver: trueOrig(GameObj.gameOver),
                startNextLevel: trueOrig(GameObj.startNextLevel)
            };
            const patchedOver = function (win) {
                self._unpatchGame();
                if (typeof GameObj.stopGame === 'function') GameObj.stopGame();
                self._record(!!win);
            };
            const patchedNext = function () { /* 考試中不自動進下一關 */ };
            patchedOver.__fmOriginal = saved.gameOver;
            patchedNext.__fmOriginal = saved.startNextLevel;
            GameObj.gameOver = patchedOver;
            GameObj.startNextLevel = patchedNext;
            this._patchedGame = saved;
        },

        _unpatchGame: function () {
            const s = this._patchedGame;
            this._patchedGame = null;
            if (this._navLockedGameNo !== null) {
                if (window.LearningPath && typeof window.LearningPath.setGameNavLocked === 'function') {
                    window.LearningPath.setGameNavLocked(this._navLockedGameNo, false);
                }
                this._navLockedGameNo = null;
            }
            if (!s || !s.obj) return;
            s.obj.gameOver = s.gameOver;
            s.obj.startNextLevel = s.startNextLevel;
            this._restoreSkipOverrides(s.obj);
        },

        // ── 越級考試的難度覆寫 ────────────────────────────────────────
        _applySkipOverrides: function (GameObj, tier) {
            if (this._mode !== 'skip') return;
            const C = window.FMExamConfig;
            const ds = GameObj.difficultySettings && GameObj.difficultySettings[tier];
            if (!ds) return;
            const over = C.getSkipOverrides(ds);
            if (!Object.keys(over).length) return;
            // 原值存在遊戲物件上，_restoreSkipOverrides 會原樣放回
            const backup = {};
            Object.keys(over).forEach(function (k) { backup[k] = ds[k]; ds[k] = over[k]; });
            GameObj.__examSkipBackup = { tier: tier, backup: backup };
        },

        _restoreSkipOverrides: function (GameObj) {
            const b = GameObj && GameObj.__examSkipBackup;
            if (!b) return;
            const ds = GameObj.difficultySettings && GameObj.difficultySettings[b.tier];
            if (ds) Object.keys(b.backup).forEach(function (k) { ds[k] = b.backup[k]; });
            delete GameObj.__examSkipBackup;
        },

        // ══════════════════════════════════════════════════════════
        //  計分與過場
        // ══════════════════════════════════════════════════════════

        _record: function (win) {
            if (this._aborted) return;
            if (win) this._correct++;
            this._qi++;

            const p = this._plan;
            const done = this._qi;
            const left = p.totalQuestions - done;
            // 還有沒有機會及格？只用來提示，不再拿來提早結束考試——
            // 玩家已經付了應試費用，就算篤定落榜也該讓他把剩下的題目
            // 當作練習考完，而不是被腰斬趕出考場（實際回報：花錢應試
            // 卻一下子就被判離場，玩家會很不爽）。
            const stillPossible = (this._correct + left) >= p.passCount;

            const self = this;
            this._card(
                '<div class="exg-mark ' + (win ? 'exg-ok' : 'exg-bad') + '">'
                + (win ? '✓' : '✗') + '</div>'
                + '<div class="exg-prog">第 ' + done + ' / ' + p.totalQuestions + ' 題</div>'
                + '<div class="exg-score">答對 <b>' + this._correct + '</b>　'
                + '及格需 <b>' + p.passCount + '</b></div>'
                + (stillPossible ? '' : '<div class="exg-row exg-warn">已無法達到及格線，仍可作答至考畢</div>')
                + '<div class="exg-footer"><button class="exg-btn" id="exgNext">知道了</button></div>'
            );

            // 改為玩家自行點擊才進入下一題，看清楚這一題的對錯再繼續。
            // 及格／落榜的評定彈窗永遠留到所有題目考完才顯示（見上方註解）。
            this._overlay.querySelector('#exgNext').onclick = function () {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (self._aborted) return;
                if (done >= p.totalQuestions) self._finish();
                else self._nextQuestion();
            };
        },

        // ══════════════════════════════════════════════════════════
        //  結算
        // ══════════════════════════════════════════════════════════

        _finish: function () {
            // ⚠️ 冪等：重複結算會把 examStats 的 passCount／failCount 與
            //    examLog 各再寫一次（破壞性測試 F1 實測到 1→2）。
            //    只有第一次呼叫算數，之後一律忽略。
            if (this._finished) return;
            this._finished = true;
            this._active = false;
            this._unpatchGame();
            this._removeSandbox();
            this._syncSessionGuard();   // 考完 → 把漢堡選單還給玩家

            const p = this._plan;
            const passed = !this._aborted && this._correct >= p.passCount;
            const result = {
                passed: passed,
                correct: this._correct,
                total: p.totalQuestions,
                aborted: this._aborted,
                mode: this._mode,
                rankName: p.rankName
            };

            // 正式考／越級考才寫紀錄；模擬考完全不留痕跡
            //
            // ⚠️ _writeResult 的回傳值（實際發放的文錢）一定要接住並放進
            //    result.silverGained —— 慶祝動畫要靠它顯示「得文錢 N 枚」。
            //    舊版沒接，result.silverGained 永遠是 undefined，_celebrate
            //    的 `result.silverGained || 0` 就永遠傳 0 給動畫，於是
            //    **考試通過的表演一律顯示不出獎勵**（存檔其實有加錢，
            //    只有畫面沒顯示，所以完全不會有錯誤訊息，極難察覺）。
            if (!this._aborted && this._mode !== 'mock') {
                result.silverGained = this._writeResult(passed) || 0;
            }

            const self = this;
            const isMinor = (this._plan && this._plan.kind === 'minor');
            const title = this._aborted ? '棄考'
                : passed ? (this._mode === 'mock' ? '模擬考通過'
                    : (isMinor ? '小試身手' : '金榜題名'))
                    : (isMinor ? '尚需溫書' : '名落孫山');
            const body = this._aborted
                ? '<div class="exg-note">'
                + (this._abortReason ? this._abortReason + '<br>' : '')
                + '本次未完成，未列入紀錄。</div>'
                : '<div class="exg-row"><span>答對</span><span>' + this._correct
                + ' / ' + p.totalQuestions + ' 題</span></div>'
                + '<div class="exg-row"><span>及格線</span><span>' + p.passCount + ' 題</span></div>'
                + (passed
                    ? (this._mode === 'mock'
                        ? '<div class="exg-note">模擬考成績不列入正式紀錄，可放心前往正式應試。</div>'
                        : '')
                    : '<div class="exg-note">' + (this._mode === 'mock'
                        ? '再多練幾次，模擬考不扣文錢。'
                        : '入場費不予退還，<br>請重複溫習課程內容，賺取考試費用。<br>充分準備，明日可再應試。') + '</div>');

            this._card('<h2>' + title + '</h2>' + body
                + '<div class="exg-footer"><button class="exg-btn" id="exgClose">' +
                (passed && this._mode !== 'mock' ? (isMinor ? '繼續前行' : '敬受榮銜') : '離場') + '</button></div>');

            this._overlay.querySelector('#exgClose').onclick = function () {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                self._teardown();
                if (passed && self._mode !== 'mock') self._celebrate(result);
                else if (self._onDone) self._onDone(result);
            };
        },

        _teardown: function () {
            this._hideCard();
            if (this._overlay) { this._overlay.remove(); this._overlay = null; }
        },

        /** 通過後播放晉升動畫，播完再把控制權交回呼叫端 */
        _celebrate: function (result) {
            const self = this;
            const back = function () { if (self._onDone) self._onDone(result); };
            // ⚠️ 小考通過**不播獎狀動畫**：獎狀是功名的象徵，小考沒有功名。
            //    玩家看到的是結算卡片上的「通過」與文錢，然後直接回青雲梯。
            if (this._plan && this._plan.kind === 'minor') { back(); return; }
            if (window.LearningPath && typeof window.LearningPath.playPromotionCelebration === 'function') {
                window.LearningPath.playPromotionCelebration(
                    { type: 'rank', name: result.rankName, isExam: true },
                    result.silverGained || 0, back);
            } else {
                back();
            }
        },

        /**
         * 寫入考試結果。
         *   · 正式考通過 → 冊封該文位、發文位獎勵
         *   · 越級考通過 → 額外補發沿途所有被跳過的文位與小站獎勵
         *
         * @returns {number} 這一場考試實際發出去的文錢總額（供慶祝動畫顯示）
         */
        _writeResult: function (passed) {
            const S = window.FMCollectionSave;
            const C = window.FMExamConfig;
            if (!S) return 0;
            const coll = S.load();
            // ⚠️ 小考走另一條路：只記通過、只給文錢，不碰 ranks.passed。
            //    混進 ranks.passed 會讓 getEffectiveRank 誤判成升等。
            if (this._plan.kind === 'minor') return this._writeMinorResult(passed, coll);
            const rank = this._plan.rankName || this._plan.examId;

            if (!coll.ranks) coll.ranks = { passed: [] };
            if (!Array.isArray(coll.ranks.passed)) coll.ranks.passed = [];
            if (!coll.examStats) coll.examStats = S.emptyExamStats();
            if (!coll.examStats[rank]) coll.examStats[rank] = { passCount: 0, failCount: 0, lastAttemptTs: 0 };
            if (!Array.isArray(coll.examLog)) coll.examLog = [];

            coll.examStats[rank][passed ? 'passCount' : 'failCount']++;
            coll.examStats[rank].lastAttemptTs = Date.now();
            coll.examLog.push({
                rank: rank, ts: Date.now(), pass: passed,
                mode: this._mode, correct: this._correct, total: this._plan.totalQuestions
            });

            // ⚠️⚠️ 順序極其重要：**先把 coll 存檔，之後才發獎勵**。
            //    發獎勵的那些函式（grantPromotionSilver／grantStationReward）
            //    內部各自會 load() 一份存檔、加完文錢再 save() 回去。
            //    若在它們之後才 S.save(coll)，就等於拿一份「發獎勵之前」的
            //    舊資料覆蓋回去，剛發的文錢全部消失。
            //    這與本專案 FMCollectionSave.addSilver 當初刻意設計成
            //    「收 data、不自己存檔」是同一個坑，實測過確實會把獎勵吃掉
            //    （越級補發 34 首詩的沿途獎勵，結果文錢一毛都沒增加）。
            if (passed) {
                if (this._mode === 'skip') {
                    // ⚠️ 2026-09-06 改版：越級考試改成**嚴格依序**（見
                    //    FMExamConfig.getSkipMenu），一次只能考「下一場」，
                    //    因此這裡不再一口氣補冊封沿途所有文位 ——
                    //    越級省掉的是「修課」，不是「考試」。
                    //    紀錄方式與正式考完全相同，差別只在及格線更嚴、費用更高，
                    //    以及通過後會把沿途課程標記為視同修畢（_grantSkipStations）。
                    if (coll.ranks.passed.indexOf(rank) < 0) coll.ranks.passed.push(rank);
                } else if (coll.ranks.passed.indexOf(rank) < 0) {
                    coll.ranks.passed.push(rank);
                }
            }
            S.save(coll);

            let gained = 0;
            if (passed) {
                // 越級：把「這一站（含）之前」的課程標記為視同修畢並補發站點獎勵
                if (this._mode === 'skip') gained += this._grantSkipStations(rank);

                // 文位獎勵走 LearningPath 的統一收口（冪等，不會重複發）
                // ⚠️ 越級時這一筆通常已經由 _grantSkipStations 發過了，
                //    此處會因冪等而回傳 0，不會重複計算。
                if (window.LearningPath
                    && typeof window.LearningPath.grantPromotionSilver === 'function') {
                    const total = (window.PathStations && window.PathStations.getRankSilver)
                        ? window.PathStations.getRankSilver(rank) : 0;
                    gained += window.LearningPath.grantPromotionSilver('rank', rank, total) || 0;
                }
            }

            // 整場考試只寫一筆總結到 game_logs（每一局的 LOG 已被沙箱擋掉）
            if (window.SupabaseClient && typeof window.SupabaseClient.logGame === 'function') {
                window.SupabaseClient.logGame({
                    gameNo: 99, difficulty: rank, score: this._correct,
                    isWin: passed, durationS: 0
                });
            }
            return gained;
        },

        /**
         * 小考（小站考試）的結果寫入。
         *
         * 通過 → 記進 `collection.exams.minorPassed`（以**站名**為鍵）＋ 發文錢。
         * **不寫 ranks.passed、不發獎狀** —— 小考只是章節檢核，不是功名。
         *
         * ⚠️ 存檔順序與文位考同一個坑：必須**先 save(coll)，之後才發文錢**。
         *    發文錢的 grantPromotionSilver 內部會自己 load/save 一份存檔，
         *    順序寫反等於拿舊資料把剛發的錢蓋掉（見 _writeResult 的說明）。
         *
         * @returns {number} 實際發出去的文錢
         */
        _writeMinorResult: function (passed, coll) {
            // ⚠️ 越級考的小考走的也是這裡：紀錄方式相同，
            //    差別在通過後 _writeResult 不會被呼叫，因此沿途課程的
            //    「視同修畢」要在這一支自己補（見下方 _grantSkipStations）。
            const S = window.FMCollectionSave;
            const name = this._plan.examId;
            if (!coll.exams || typeof coll.exams !== 'object') coll.exams = { minorPassed: [] };
            if (!Array.isArray(coll.exams.minorPassed)) coll.exams.minorPassed = [];
            if (!coll.examStats) coll.examStats = S.emptyExamStats();
            if (!coll.examStats[name]) coll.examStats[name] = { passCount: 0, failCount: 0, lastAttemptTs: 0 };
            if (!Array.isArray(coll.examLog)) coll.examLog = [];

            coll.examStats[name][passed ? 'passCount' : 'failCount']++;
            coll.examStats[name].lastAttemptTs = Date.now();
            coll.examLog.push({
                rank: name, ts: Date.now(), pass: passed, kind: 'minor',
                mode: this._mode, correct: this._correct, total: this._plan.totalQuestions
            });
            if (passed && coll.exams.minorPassed.indexOf(name) < 0) {
                coll.exams.minorPassed.push(name);
            }
            S.save(coll);          // ⚠️ 一定要先存，再發錢

            let gained = 0;
            if (passed && window.LearningPath) {
                const LP = window.LearningPath;
                const PS = window.PathStations;
                const st = (PS && typeof PS.getStationByName === 'function')
                    ? PS.getStationByName(name) : null;
                const amount = (st && typeof LP.getMinorExamSilver === 'function')
                    ? LP.getMinorExamSilver(st) : 0;
                if (typeof LP.grantPromotionSilver === 'function') {
                    gained = LP.grantPromotionSilver('minor', name, amount) || 0;
                }
                // 越級的小考：把這一站（含）之前的課程標記為視同修畢
                if (this._mode === 'skip') gained += this._grantSkipStations(name);
            }

            if (window.SupabaseClient && typeof window.SupabaseClient.logGame === 'function') {
                window.SupabaseClient.logGame({
                    gameNo: 99, difficulty: name, score: this._correct,
                    isWin: passed, durationS: 0
                });
            }
            return gained;
        },

        /**
         * 越級考試通過：把沿途跳過的站點一次補齊。
         *
         * 作者定案：「越級成功＝讓玩家達到該文位，之後所有課程規則
         * 都跟依序上升的玩家一樣。」因此這裡做兩件事：
         *   ① 把沿途所有站點的必通關卡標記為「視同完成」
         *   ② 補發沿途所有站點的獎勵
         *
         * ⚠️ 「沿途文位記為已通過」不在這裡做 —— 那一步只動 coll，
         *    必須在 _writeResult 的 S.save(coll) **之前**完成；
         *    本函式則相反，必須在 save **之後**才能跑（它會自己 load/save）。
         *    兩者混在同一支函式裡就是先前把獎勵吃掉的原因。
         *
         * ⚠️ 用既有的「捐納跳關」機制（markLevelDonated）標記，而不是偽造
         *    levelCleared —— 後者會污染成就系統的「某遊戲通關 N 次」統計。
         * ⚠️ 被跳過的詩仍然留在複習池與漢堡選單裡，只是不再是必修；
         *    這與「玩家自己一路打上來但中途沒練到的詩」待遇完全一致，
         *    所以不需要為越級玩家另外維護任何特例分支。
         */
        _grantSkipStations: function (targetName) {
            const PS = window.PathStations;
            const SM = window.ScoreManager;
            if (!PS) return 0;

            const stations = PS.build();
            // ⚠️ 目標可能是文位站，也可能是小考站（2026-09-06 起小考也能越級），
            //    因此以**站名**比對，不再限定 type === 'rank'。
            let at = -1;
            for (let i = 0; i < stations.length; i++) {
                if (stations[i].name === targetName) { at = i; break; }
            }
            if (at < 0) return 0;

            let gained = 0;
            for (let i = 0; i <= at; i++) {
                const st = stations[i];
                (st.units || []).forEach(function (u) {
                    if (SM && typeof SM.markLevelDonated === 'function') {
                        SM.markLevelDonated(u.tier, u.level);
                    }
                });
                // 站點獎勵同樣走統一收口，冪等；已經發過的站不會重複發。
                //
                // ⚠️ 第二個參數 true ＝「連需應試的文位站也要發」。
                //    grantStationReward 預設會跳過 isExam 的文位站，因為
                //    平常「抵達那一站」只代表取得應試資格、還沒考過，本來
                //    就不該發獎。但越級考試在上一步已經把沿途這些文位
                //    **全部寫進 ranks.passed**（視同考過了），這時再跳過就變成
                //    「文位給了、獎勵卻沒發，成就也沒標記」——玩家的
                //    「領取獎狀」CTA 會一直掛在成就頁上，而且那筆文錢
                //    再也沒有任何機會補發。
                if (window.LearningPath && typeof window.LearningPath.grantStationReward === 'function') {
                    gained += window.LearningPath.grantStationReward(st, true) || 0;
                }
            }
            return gained;
        }
    };

    window.ExamEngine = ExamEngine;

})();
