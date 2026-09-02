/* =========================================
   遊戲33：作者是誰 (Who Wrote These?)
   ----------------------------------------
   每局用 getSharedRandomPoem 鎖定一首詩（青雲梯／考試情境下即站點白名單／
   單詩鎖定的那首），再隨機混合兩種玩法（各半機率）：

   mode==='author'（猜作者，原玩法）：
     題目區依倒數時間逐一「上下翻出」最多 8 張線索卡
     （朝代 / 詩名 / 詩句，詩名與詩句取自同一位作者的「多首」不同詩詞，
       彼此之間沒有連貫性），評價越高（越有名）的線索越晚出現，
     讓玩家在越早的階段猜中作者可獲得越高分數。
     答案區：以「由左至右的直條方格」呈現候選詩人姓名（最多 7 條），
     開局即依序左右翻開；外框為 SVG 倒數計時框。

   mode==='line'（猜詩句，新玩法）：
     題目區同時顯示「作者／朝代／詩名」三張資訊條（不做漸進揭露）。
     答案區：4 條橫條詩句（樣式抄 game1 答案卡），只有一句真的是該作者
     寫的（且來自題目指定的那首詩），其餘 3 句是其他作者的干擾句；
     依剩餘時間比例計分。

   介面風格：比照 game20「丟三落一」（宣紙淺色 fm-* 共用主題）。
   ⚠️ 本遊戲不顯示 fm-poem-info（線索可能來自多首詩，顯示單一出處會造成誤解）。
   ========================================= */
(function () {
    const Game33 = {
        // ---- 基本狀態 ----
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,

        // ---- 計時與計分 ----
        timer: 30,
        maxTimer: 30,
        timerInterval: null,
        startTime: null,
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 3,

        // ---- 題目資料 ----
        currentPoem: null,      // 本局鎖定的詩（由 getSharedRandomPoem 取得；examEngine 靠此欄位驗證鎖題）
        mode: 'author',         // 'author'＝猜作者（原玩法）｜'line'＝猜詩句（新玩法），每局隨機決定
        correctAuthor: '',      // 本局正解詩人
        clues: [],              // 線索卡陣列 {type:'朝代'|'詩名'|'詩句', text, rating}（mode==='author' 用）
        revealedCount: 0,       // 已翻開的線索卡數量
        revealTimeouts: [],     // 線索卡逐一翻開的計時器控制代碼
        revealInterval: 2,      // 每張線索卡的間隔秒數（= 總時間 / 10）
        candidates: [],         // 候選詩人姓名陣列（mode==='author' 用）
        correctLine: '',        // 正解詩句（mode==='line' 用）
        lineOptions: [],        // 4 個詩句選項（含正解，已洗牌，mode==='line' 用）

        // ---- DOM 參考 ----
        container: null,
        gameArea: null,
        gameStartTime: null,

        // ---- 難度設定 ----
        // timeLimit:       時間限制（秒），線索卡間隔 = timeLimit / 10
        //                  （例：20 秒 → 開局翻第一張，之後每 2 秒翻一張）
        // poemMinRating:   線索／干擾句的最低評價門檻；線索由此評價開始，逐步往高評價揭露
        //                  （例：高中為 4 → 先出現評價 4 的詩句，再 5，再 6/7）
        // maxMistakeCount: 最大錯誤次數
        // answerCount:     猜作者模式的答案直條數量（小學 2／中學 3／高中 5／大學 6／研究所 7）
        // clueCount:       猜作者模式的題目線索卡上限（最多 8 張；作者詩詞不足時允許少於此數）
        // minLines/maxLines/minChars/maxChars：
        //   鎖定本局考哪首詩用的 getSharedRandomPoem 參數，只需要抓到「一句代表句」，
        //   ⚠️ 刻意用寬鬆區間、不鎖死五言／七言（見遊戲類型介面設計與程式碼規範.md §6.1），
        //   避免青雲梯站點剛好都是另一種詩體時整站出不了題。
        difficultySettings: {
            '小學': { timeLimit: 30, poemMinRating: 6, maxMistakeCount: 2, answerCount: 4, clueCount: 8, minLines: 2, maxLines: 2, minChars: 4, maxChars: 40 },
            '中學': { timeLimit: 25, poemMinRating: 5, maxMistakeCount: 2, answerCount: 4, clueCount: 8, minLines: 2, maxLines: 2, minChars: 4, maxChars: 40 },
            '高中': { timeLimit: 20, poemMinRating: 4, maxMistakeCount: 2, answerCount: 5, clueCount: 8, minLines: 2, maxLines: 2, minChars: 4, maxChars: 40 },
            '大學': { timeLimit: 15, poemMinRating: 3, maxMistakeCount: 2, answerCount: 5, clueCount: 8, minLines: 2, maxLines: 2, minChars: 4, maxChars: 40 },
            '研究所': { timeLimit: 10, poemMinRating: 3, maxMistakeCount: 1, answerCount: 5, clueCount: 8, minLines: 2, maxLines: 2, minChars: 4, maxChars: 40 }
        },

        // ------------------------------------------------------------
        // CSS 載入防護 — 避免在非 index.html 環境下 CSS 失效
        // ------------------------------------------------------------
        loadCSS: function () {
            if (!document.getElementById('game33-css')) {
                const link = document.createElement('link');
                link.id = 'game33-css';
                link.rel = 'stylesheet';
                link.href = 'game33.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game33-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game33-container');
            this.gameArea = document.getElementById('game33-area');

            document.getElementById('game33-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game33-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game33-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // ------------------------------------------------------------
        // 建立 DOM（掛 document.body，避免 #stage 的 transform 雙重縮放）
        // 版面比照 game20：fm-header / fm-sub-header / 遊戲區 / 答案區
        // ⚠️ 刻意不放 fm-poem-info（線索橫跨多首詩）
        // ------------------------------------------------------------
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game33-container';
            div.className = 'game33-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game33-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game33-diff-tag" data-level="小學">小學</button>
                        <button id="game33-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game33-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game33-hearts" class="fm-hearts"></div>
                </div>
                <div id="game33-area" class="game33-area">
                    <!-- 題目區：最多 8 張線索卡，隨倒數逐一上下翻出 -->
                    <div class="game33-question-area">
                        <div id="game33-clue-list" class="game33-clue-list">
                            <!-- 由 renderClues() 注入 -->
                        </div>
                    </div>

                    <!-- 答案區：SVG 計時邊框 + 由左至右的直條答案 -->
                    <div class="game33-answer-area">
                        <div id="game33-answer-grid-container" class="game33-answer-grid-container">
                            <svg id="game33-timer-ring" class="fm-timer-ring">
                                <rect id="game33-timer-path" class="fm-timer-path" x="4" y="4"></rect>
                            </svg>
                            <div id="game33-answer-grid" class="game33-answer-grid">
                                <!-- 由 renderAnswers() 注入 -->
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
            this.renderHearts();
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            this.clearAllTimers();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('作者是誰', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    // 挑戰關卡模式判定：levelIndex 有值即為關卡模式
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    const settings = this.difficultySettings[selectedLevel];
                    this.maxTimer = settings.timeLimit;
                    this.timer = settings.timeLimit;
                    this.maxMistakeCount = settings.maxMistakeCount;

                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.SoundManager) window.SoundManager.init();
                    this.startNewGame();
                });
            } else {
                this.container.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                document.body.classList.add('overlay-active');
                this.startNewGame();
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game33-diff-tag');
            const retryBtn = document.getElementById('game33-retryGame-btn');
            const newBtn = document.getElementById('game33-newGame-btn');
            // 難度標籤顏色由 theme_xuanzhi.css 依 data-level 套色，JS 只負責文字與屬性同步
            if (diffTag) diffTag.setAttribute('data-level', this.difficulty);

            if (this.isLevelMode) {
                if (diffTag) diffTag.textContent = `${window.FMRoundLabel(this.currentLevelIndex)}`;
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) diffTag.textContent = this.difficulty;
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },

        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        // 清除倒數計時與所有線索卡的翻牌排程
        clearAllTimers: function () {
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = null;
            this.revealTimeouts.forEach(t => clearTimeout(t));
            this.revealTimeouts = [];
        },

        // ⚠️ 必須在此隱藏 overlay：menu.js 全域清理只呼叫 stopGame()
        stopGame: function () {
            this.isActive = false;
            this.clearAllTimers();
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        // ------------------------------------------------------------
        // 重來：沿用同一位作者與線索，重新計分、重新洗牌答案位置
        // ------------------------------------------------------------
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.correctAuthor) return;
            this.clearAllTimers();
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.gameStartTime = Date.now();
            this.renderHearts();
            document.getElementById('game33-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            // ⚠️ 重來時把答案重新洗牌，避免玩家靠「上次答錯的位置」直接排除
            this.shuffleInPlace(this.candidates);

            this.renderClues();
            this.renderAnswers();
            this.scheduleClueReveals();
            this.startTimer();
            document.getElementById('game33-retryGame-btn').disabled = false;
            document.getElementById('game33-newGame-btn').disabled = false;
        },

        // ------------------------------------------------------------
        // 開新局：重新抽作者與線索
        // ------------------------------------------------------------
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            this.clearAllTimers();
            this.updateUIForMode();

            const settings = this.difficultySettings[this.difficulty];
            this.maxTimer = settings.timeLimit;
            this.timer = settings.timeLimit;
            this.maxMistakeCount = settings.maxMistakeCount;

            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.renderHearts();
            document.getElementById('game33-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.gameStartTime = Date.now();

            if (!this.prepareChallenge()) {
                alert('載入詩詞失敗。');
                this.stopGame();
                return;
            }

            this.renderClues();
            this.renderAnswers();
            this.scheduleClueReveals();
            this.startTimer();
            document.getElementById('game33-retryGame-btn').disabled = false;
            document.getElementById('game33-newGame-btn').disabled = false;
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // ------------------------------------------------------------
        // 亂數產生器：挑戰模式用關卡序號當種子（確定性），自由模式用 Math.random
        // ------------------------------------------------------------
        makeRng: function (seed) {
            if (seed === null || seed === undefined) return Math.random;
            let t = (seed * 2654435761) >>> 0;
            return function () {
                t = (t + 0x6D2B79F5) >>> 0;
                let r = Math.imul(t ^ (t >>> 15), 1 | t);
                r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
                return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
            };
        },

        // ------------------------------------------------------------
        // 題目準備：先用 getSharedRandomPoem 鎖定本局要考的詩（青雲梯／考試
        // 情境下由 LevelTable 的站點白名單／單詩鎖定決定；自由練習下全庫隨機），
        // 再依這首詩的作者，隨機選一種玩法：
        //   'author' — 從該作者「多首」詩詞蒐集線索，猜出作者是誰（原玩法）
        //   'line'   — 給定作者／朝代／詩名，從 4 句詩中選出真正是他寫的那句（新玩法）
        // ------------------------------------------------------------
        prepareChallenge: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;
            const settings = this.difficultySettings[this.difficulty];
            const seed = this.isLevelMode ? this.currentLevelIndex : null;
            const rng = this.makeRng(this.isLevelMode ? (this.currentLevelIndex * 7919 + 33) : null);

            const result = getSharedRandomPoem(settings.poemMinRating, settings.minLines, settings.maxLines,
                settings.minChars, settings.maxChars, "", seed, 'game33');
            if (!result) return false;
            // ⚠️ examEngine._tryCombo() 靠這個欄位比對是否真的鎖到指定詩，考試模式下必須設定
            this.currentPoem = result.poem;

            const correctAuthor = (result.poem.author || '').trim();
            // ⚠️ 排除「佚名」、「西鄙人」、「無名氏」：代表作者不詳，不能拿來當正解
            if (!correctAuthor || correctAuthor === '佚名' || correctAuthor === '西鄙人' || correctAuthor === '無名氏') {
                return false;
            }
            const dynasty = result.poem.dynasty || '';
            this.correctAuthor = correctAuthor;

            this.mode = rng() < 0.5 ? 'author' : 'line';

            // ⚠️ 'author' 玩法需要這位作者在全庫至少有 2 首詩才湊得出跨詩線索，
            //    但這首詩已經是被鎖定的（青雲梯／考試情境下不能換），失敗時不能直接
            //    判定整局出不了題——退而求其次改用 'line' 玩法（只需要這一首詩，
            //    干擾句取自全庫、有 200 次重試備援，幾乎不會失敗）。
            if (this.mode === 'author') {
                if (this.prepareAuthorChallenge(correctAuthor, dynasty, settings, rng)) return true;
                this.mode = 'line';
            }
            return this.prepareLineChallenge(result, correctAuthor, dynasty, settings, rng);
        },

        // ------------------------------------------------------------
        // 'author' 玩法：從鎖定作者的「多首」詩詞蒐集線索 → 生成候選姓名
        // ------------------------------------------------------------
        prepareAuthorChallenge: function (correctAuthor, dynasty, settings, rng) {
            // 依作者彙整詩詞（排除無作者、或作者僅一首詩者，確保線索能跨多首詩）
            const byAuthor = {};
            POEMS.forEach(p => {
                const a = (p.author || '').trim();
                if (!a || a === '佚名' || a === '西鄙人' || a === '無名氏' || !p.content || p.content.length === 0) return;
                if (!byAuthor[a]) byAuthor[a] = [];
                byAuthor[a].push(p);
            });

            const authorPoems = byAuthor[correctAuthor] || [];
            // 鎖定的這首詩，作者在全庫裡不到 2 首詩 → 湊不出跨詩線索，判定這局出不了題
            if (authorPoems.length < 2) return false;

            // ---- 蒐集線索（評價越高＝越有名，之後會排在越後面） ----
            const clues = this.collectClues(authorPoems, dynasty, settings, rng);
            if (clues.length < 2) return false;
            this.clues = clues;

            // ---- 生成候選詩人（正解 + 干擾項；優先同朝代，避免用朝代直接排除） ----
            this.candidates = this.generateCandidates(correctAuthor, dynasty, byAuthor, settings.answerCount, rng);

            this.revealedCount = 0;
            // 線索間隔：總時間 / 10（例：20 秒 → 2 秒一張）
            this.revealInterval = this.maxTimer / 10;
            return true;
        },

        // ------------------------------------------------------------
        // 'line' 玩法：從鎖定的詩裡挑一句當正解，另外從全庫找 3 句非本作者的
        // 干擾句（演算法比照 game1.js 的 generateOptionsData：同長度優先、
        // 不足則全庫隨機補滿，確保這一步幾乎不會失敗）
        // ------------------------------------------------------------
        prepareLineChallenge: function (result, correctAuthor, dynasty, settings, rng) {
            const lines = result.lines || [];
            if (lines.length === 0) return false;
            const correctLine = lines[Math.floor(rng() * lines.length)];
            this.correctLine = correctLine;
            this.lineOptions = this.generateLineDecoys(correctLine, correctAuthor, settings.poemMinRating, rng);
            return this.lineOptions.length >= 2;   // 至少要有正解 + 1 個干擾句才成局
        },

        // ------------------------------------------------------------
        // 蒐集線索卡（8 格＝1 格朝代 + 7 格詩名／詩句）：
        //   ① 「朝代」1 格 — ⚠️ 插入位置隨機，避免玩家看到「固定第一格」的規律
        //   ② 依配額分配其餘 7 格：詩名約佔 1/3（2 格）、詩句約佔 2/3（5 格），
        //      詩句資訊量較低、較適合當主要線索，故佔多數但不會獨佔全部。
        //   ③ 詩句優先「每首詩各取 1 句」讓線索分散於多首詩；不足才從其餘詩句補。
        //   ④ 任一類數量不足時，改由另一類遞補，盡量湊滿 8 格；兩類皆用盡才允許少於 8 格。
        //   ⑤ 最後一律以評價由低到高排序，讓玩家越晚越容易猜出；朝代插入後不破壞其餘相對順序。
        // ------------------------------------------------------------
        collectClues: function (authorPoems, dynasty, settings, rng) {
            const needCount = settings.clueCount - 1;   // 扣掉「朝代」那一格
            const minRating = settings.poemMinRating;
            // 配額：詩名約 1/3、詩句約 2/3（needCount=7 → 詩名 2、詩句 5）
            const titleQuota = Math.max(1, Math.round(needCount / 3));
            const lineQuota = needCount - titleQuota;

            // ---- 詩名候選池：優先達到評價門檻者，不足則放寬取全部 ----
            const allTitles = authorPoems.map(p => ({
                type: '詩名', text: p.title, rating: p.rating || 0, poemId: p.id
            }));
            let titlePool = allTitles.filter(t => t.rating >= minRating);
            if (titlePool.length < titleQuota) titlePool = allTitles.slice();
            this.shuffleInPlace(titlePool, rng);

            // ---- 詩句候選池：分兩層，第一層「每首詩各取 1 句」，第二層為其餘詩句 ----
            const linesTier1 = [];   // 每首詩代表句（線索分散於多首詩）
            const linesTier2 = [];   // 同一首詩的其餘詩句（不足時才動用）
            authorPoems.forEach(p => {
                const withRating = (p.content || []).map((line, idx) => ({
                    type: '詩句',
                    text: line,
                    rating: (p.line_ratings && p.line_ratings[idx] !== undefined) ? p.line_ratings[idx] : 0,
                    poemId: p.id
                }));
                if (withRating.length === 0) return;
                // 優先從達到門檻的詩句中挑代表句；沒有達標者才從全部詩句挑
                const qualified = withRating.filter(l => l.rating >= minRating);
                const source = qualified.length > 0 ? qualified : withRating;
                const rep = source[Math.floor(rng() * source.length)];
                linesTier1.push(rep);
                withRating.forEach(l => { if (l !== rep) linesTier2.push(l); });
            });
            this.shuffleInPlace(linesTier1, rng);
            this.shuffleInPlace(linesTier2, rng);
            // 第二層同樣讓達標的詩句排前面，維持「評價高的線索留到後面才用完」的品質
            linesTier2.sort((a, b) => (b.rating >= minRating ? 1 : 0) - (a.rating >= minRating ? 1 : 0));
            const linePool = linesTier1.concat(linesTier2);

            // ---- 依配額取用，任一類不足則由另一類遞補 ----
            const takeTitles = Math.min(titleQuota, titlePool.length);
            const takeLines = Math.min(lineQuota, linePool.length);
            const pool = titlePool.slice(0, takeTitles).concat(linePool.slice(0, takeLines));

            let shortfall = needCount - pool.length;
            if (shortfall > 0 && linePool.length > takeLines) {
                // 詩名不夠 → 多拿詩句
                const extra = linePool.slice(takeLines, takeLines + shortfall);
                pool.push(...extra);
                shortfall -= extra.length;
            }
            if (shortfall > 0 && titlePool.length > takeTitles) {
                // 詩句不夠 → 多拿詩名
                pool.push(...titlePool.slice(takeTitles, takeTitles + shortfall));
            }

            // 依評價由低到高排序（同分則隨機）
            pool.sort((a, b) => (a.rating - b.rating) || (rng() - 0.5));
            const picked = pool.slice(0, needCount);
            // 「朝代」插入隨機位置（不固定在第一格），插入後不打亂其餘線索的低→高評價順序
            const dynastyClue = { type: '朝代', text: dynasty, rating: -1 };
            const insertAt = Math.floor(rng() * (picked.length + 1));
            picked.splice(insertAt, 0, dynastyClue);
            return picked;
        },

        // ------------------------------------------------------------
        // 候選詩人：正解 + 干擾項
        //   優先同朝代（避免玩家用「朝代」線索直接刷掉一半選項），不足才跨朝代補滿
        // ------------------------------------------------------------
        generateCandidates: function (correctAuthor, dynasty, byAuthor, count, rng) {
            const all = Object.keys(byAuthor).filter(a => a !== correctAuthor);
            const sameDyn = all.filter(a => (byAuthor[a][0].dynasty || '') === dynasty);
            const others = all.filter(a => (byAuthor[a][0].dynasty || '') !== dynasty);

            this.shuffleInPlace(sameDyn, rng);
            this.shuffleInPlace(others, rng);

            const decoys = sameDyn.concat(others).slice(0, Math.max(0, count - 1));
            const result = [correctAuthor].concat(decoys);
            this.shuffleInPlace(result, rng);
            return result;
        },

        // ------------------------------------------------------------
        // 'line' 玩法的干擾句：抄 game1.js 的 generateOptionsData 演算法——
        //   ① 優先找「非本作者、達評價門檻、字數與正解相同」的句子（迷惑性最高）
        //   ② 不足 4 個則全庫隨機抽句補滿（僅排除本作者），最多嘗試 200 次
        // 兩層備援疊加，這一步幾乎不會失敗，不會成為「出不了題」的原因。
        // ------------------------------------------------------------
        generateLineDecoys: function (correctLine, correctAuthor, minRating, rng) {
            const PUNCT = /[，。？！、：；「」『』\s]/g;
            const lineLen = correctLine.length;
            const used = new Set([correctLine]);
            const candidates = [];

            POEMS.forEach(p => {
                const author = (p.author || '').trim();
                if (author === correctAuthor) return;
                if ((p.rating || 0) < minRating) return;
                (p.content || []).forEach(raw => {
                    const clean = raw.replace(PUNCT, '');
                    if (clean.length !== lineLen || used.has(clean)) return;
                    candidates.push(clean);
                });
            });
            this.shuffleInPlace(candidates, rng);

            const result = [correctLine];
            for (let i = 0; i < candidates.length && result.length < 4; i++) {
                if (used.has(candidates[i])) continue;
                result.push(candidates[i]);
                used.add(candidates[i]);
            }

            // 備援：全庫隨機抽句補足（不限字數／評價，只排除本作者與已用過的句子）
            let attempts = 0;
            while (result.length < 4 && attempts < 200) {
                attempts++;
                const p = POEMS[Math.floor(rng() * POEMS.length)];
                if (!p || !p.content || !p.content.length) continue;
                if ((p.author || '').trim() === correctAuthor) continue;
                const clean = p.content[Math.floor(rng() * p.content.length)].replace(PUNCT, '');
                if (!clean || used.has(clean)) continue;
                result.push(clean);
                used.add(clean);
            }

            this.shuffleInPlace(result, rng);
            return result;
        },

        shuffleInPlace: function (arr, rng) {
            const rand = rng || Math.random;
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        },

        // ------------------------------------------------------------
        // 題目區渲染：
        //   mode==='author' → 建立所有線索卡（皆為未翻開狀態，逐張翻開見 scheduleClueReveals）
        //   mode==='line'   → 直接同時顯示「作者／朝代／詩名」三張資訊條，不做漸進揭露
        // ------------------------------------------------------------
        renderClues: function () {
            const list = document.getElementById('game33-clue-list');
            list.innerHTML = '';
            this.revealedCount = 0;

            if (this.mode === 'line') {
                const poem = this.currentPoem || {};
                const items = [
                    { type: '作者', text: this.correctAuthor },
                    { type: '朝代', text: poem.dynasty || '' },
                    { type: '詩名', text: poem.title || '' }
                ];
                items.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'game33-clue-card game33-clue-flip';
                    card.dataset.type = item.type;
                    const size = this.clueFontSize(item.text.length);
                    card.innerHTML = `
                        <span class="game33-clue-label">${item.type}</span>
                        <span class="game33-clue-text" style="font-size:${size}px;">${item.text}</span>
                    `;
                    list.appendChild(card);
                });
                return;
            }

            this.clues.forEach((clue, i) => {
                const card = document.createElement('div');
                // ⚠️ 線索卡刻意不使用按鈕外觀（無立體陰影、雙線描邊 + 標籤），與可點擊的答案直條做出區別
                card.className = 'game33-clue-card game33-clue-hidden';
                card.dataset.index = i;
                // 左方色塊依線索類別上色（朝代=朱紅／詩名=靛藍／詩句=青碧），由 CSS 依此屬性套色
                card.dataset.type = clue.type;
                const size = this.clueFontSize(clue.text.length);
                card.innerHTML = `
                    <span class="game33-clue-label">${clue.type}</span>
                    <span class="game33-clue-text" style="font-size:${size}px;">${clue.text}</span>
                `;
                list.appendChild(card);
            });
        },

        // 線索文字字級：字數越多字級越小，避免超出卡片寬度（整體已放大為原本的 110%）
        clueFontSize: function (len) {
            if (len <= 9) return 37;
            if (len <= 11) return 33;
            if (len <= 13) return 29;
            if (len <= 15) return 24;
            return 20;
        },

        // ------------------------------------------------------------
        // 線索卡翻牌排程：開局立刻翻第一張，之後每 revealInterval 秒翻一張
        // （⚠️ 作者詩詞不足時線索少於 8 張，屬允許狀況）
        // ------------------------------------------------------------
        scheduleClueReveals: function () {
            this.revealTimeouts.forEach(t => clearTimeout(t));
            this.revealTimeouts = [];
            if (this.mode === 'line') return;   // 'line' 玩法的三張資訊條已在 renderClues 同時顯示
            this.clues.forEach((clue, i) => {
                const delayMs = i * this.revealInterval * 1000;
                const t = setTimeout(() => this.revealClue(i), delayMs);
                this.revealTimeouts.push(t);
            });
        },

        // 翻開第 i 張線索卡（上下翻動放大：scaleY 0 → 1，比照 game1 答案卡的翻轉手法）
        revealClue: function (i) {
            if (!this.isActive) return;
            const card = document.querySelector(`#game33-clue-list .game33-clue-card[data-index="${i}"]`);
            if (!card) return;
            card.classList.remove('game33-clue-hidden');
            card.classList.add('game33-clue-flip');
            this.revealedCount = Math.max(this.revealedCount, i + 1);
            if (window.SoundManager) window.SoundManager.playOpenItem();
        },

        // ------------------------------------------------------------
        // 答案區渲染：
        //   mode==='author' → 由左至右的直條方格（文字直書），開局依序左右翻開
        //   mode==='line'   → 由上至下的 4 條橫條（樣式抄 game1 答案卡），依序出場
        // ------------------------------------------------------------
        renderAnswers: function () {
            const grid = document.getElementById('game33-answer-grid');
            grid.innerHTML = '';
            // 重置 SVG 計時邊框大小
            setTimeout(() => this.updateTimerRing(1), 0);

            if (this.mode === 'line') {
                grid.classList.add('game33-line-list');
                const N = this.lineOptions.length;
                this.lineOptions.forEach((line, i) => {
                    const btn = document.createElement('button');
                    btn.className = 'game33-line-btn game33-line-appear';
                    btn.style.fontSize = this.lineFontSize(line.length) + 'px';
                    btn.textContent = line;
                    // ⚠️ 出場動畫：所有橫條的啟動時機一律壓進 0~0.5 秒之間（比照 game1）
                    const delay = (N > 1) ? (i / (N - 1)) * 0.5 : 0;
                    btn.style.animationDelay = delay.toFixed(3) + 's';
                    btn.addEventListener('click', () => this.handleLineChoice(line, btn));
                    grid.appendChild(btn);
                });
                return;
            }
            grid.classList.remove('game33-line-list');

            const N = this.candidates.length;
            this.candidates.forEach((name, i) => {
                const col = document.createElement('button');
                col.className = 'game33-ans-col game33-ans-appear';
                col.dataset.author = name;
                // 直條寬度隨數量壓縮，字級同步縮小（7 條時最窄）
                col.style.fontSize = this.answerFontSize(N, name.length) + 'px';
                col.textContent = name;
                // ⚠️ 出場動畫：所有直條的啟動時機一律壓進 0~0.5 秒之間（比照 game1）
                const delay = (N > 1) ? (i / (N - 1)) * 0.5 : 0;
                col.style.animationDelay = delay.toFixed(3) + 's';
                col.addEventListener('click', () => this.handleChoice(name, col));
                grid.appendChild(col);
            });
        },

        // 直條字級：依直條數量（寬度）與姓名長度決定
        answerFontSize: function (colCount, nameLen) {
            let size = colCount <= 2 ? 56
                : colCount <= 3 ? 50
                    : colCount <= 5 ? 42
                        : colCount <= 6 ? 38
                            : 34;
            if (nameLen >= 4) size = Math.floor(size * 0.8);
            return size;
        },

        // 橫條字級：固定 4 條，字級只依句長縮放（詩句可能是 4~9 字以上）
        lineFontSize: function (len) {
            if (len <= 5) return 48;
            if (len <= 7) return 42;
            if (len <= 9) return 36;
            return 22;
        },

        // ------------------------------------------------------------
        // 判定：答對進入勝利動畫；答錯扣紅心並停用該直條
        // ------------------------------------------------------------
        handleChoice: function (name, col) {
            if (!this.isActive) return;
            if (col.disabled || col.classList.contains('wrong')) return;

            if (name === this.correctAuthor) {
                if (window.SoundManager) window.SoundManager.playSuccess();
                col.classList.add('correct');
                this.clearAllTimers();

                // 越早猜中（翻出的線索卡越少）分數越高
                // ⚠️ 必須透過 ScoreManager.getPointA(gameKey, difficulty) 取得，
                //    直接讀 gameSettings.game33.getPointA 會使 getPointAMul 難度倍率失效
                const basePts = (window.ScoreManager && window.ScoreManager.getPointA)
                    ? window.ScoreManager.getPointA('game33', this.difficulty) : 50;
                const unrevealed = Math.max(0, this.clues.length - this.revealedCount);
                // 浮點累計（getPointAMul 可能為小數），顯示時才無條件捨去
                this.score += basePts * (unrevealed + 1);
                document.getElementById('game33-score').textContent = Math.floor(this.score);

                // 通關前先禁用按鈕，防止連點刷分
                document.getElementById('game33-retryGame-btn').disabled = true;
                document.getElementById('game33-newGame-btn').disabled = true;
                document.querySelectorAll('#game33-answer-grid .game33-ans-col').forEach(b => b.disabled = true);

                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game33',
                    timerContainerId: 'game33-answer-grid-container',
                    scoreElementId: 'game33-score',
                    heartsSelector: '#game33-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.gameOver(true, '');
                    }
                });
            } else {
                if (window.SoundManager) window.SoundManager.playFailure();
                col.classList.add('wrong');
                col.disabled = true;
                this.mistakeCount++;
                this.updateHearts();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    this.clearAllTimers();
                    this.disableAllAnswers();
                    setTimeout(() => this.gameOver(false, "失誤過多！"), 1500);
                }
            }
        },

        // ------------------------------------------------------------
        // 'line' 玩法判定：答對進入勝利動畫（依剩餘時間比例加分，取代
        // 'author' 玩法用的「剩餘未翻線索數」算法）；答錯扣紅心並停用該橫條
        // ------------------------------------------------------------
        handleLineChoice: function (line, btn) {
            if (!this.isActive) return;
            if (btn.disabled || btn.classList.contains('wrong')) return;

            if (line === this.correctLine) {
                if (window.SoundManager) window.SoundManager.playSuccess();
                btn.classList.add('correct');
                this.clearAllTimers();

                // 越早（剩餘時間比例越高）分數越高，邏輯比照 mode==='author' 的
                // 「剩餘未翻線索數 + 1」倍率，只是換算基準從線索數改成剩餘時間比例
                const basePts = (window.ScoreManager && window.ScoreManager.getPointA)
                    ? window.ScoreManager.getPointA('game33', this.difficulty) : 50;
                const remainRatio = this.maxTimer > 0 ? Math.max(0, this.timer / this.maxTimer) : 0;
                this.score += basePts * (1 + remainRatio);
                document.getElementById('game33-score').textContent = Math.floor(this.score);

                // 通關前先禁用按鈕，防止連點刷分
                document.getElementById('game33-retryGame-btn').disabled = true;
                document.getElementById('game33-newGame-btn').disabled = true;
                document.querySelectorAll('#game33-answer-grid .game33-line-btn').forEach(b => b.disabled = true);

                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game33',
                    timerContainerId: 'game33-answer-grid-container',
                    scoreElementId: 'game33-score',
                    heartsSelector: '#game33-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.gameOver(true, '');
                    }
                });
            } else {
                if (window.SoundManager) window.SoundManager.playFailure();
                btn.classList.add('wrong');
                btn.disabled = true;
                this.mistakeCount++;
                this.updateHearts();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    this.clearAllTimers();
                    this.disableAllAnswers();
                    setTimeout(() => this.gameOver(false, "失誤過多！"), 1500);
                }
            }
        },

        // 失敗時：⚠️ 不劇透正解，僅停用所有答案（依 mode 停用直條或橫條）
        disableAllAnswers: function () {
            document.querySelectorAll('#game33-answer-grid .game33-ans-col').forEach(b => b.disabled = true);
            document.querySelectorAll('#game33-answer-grid .game33-line-btn').forEach(b => b.disabled = true);
        },

        // ------------------------------------------------------------
        // 計時器（SVG 邊框倒數，與 game20 相同實作）
        // ------------------------------------------------------------
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.clearAllTimers();
                    this.disableAllAnswers();
                    setTimeout(() => this.gameOver(false, "時間到！"), 1500);
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        /**
         * 讀取計時框的基準色（來源：theme_xuanzhi.css 的 --fm-timer-* 變數）。
         * 解析失敗時回退到 fallback，確保計時框仍有可見顏色。
         */
        getTimerBaseColor: function (varName, fallback) {
            try {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue(varName).trim();
                const m = raw.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
                if (m) return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
            } catch (e) { /* 忽略解析錯誤，改用後備色 */ }
            return fallback;
        },

        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game33-timer-path');
            const container = document.getElementById('game33-answer-grid-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game33-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            const rw = w - 8;
            const rh = h - 8;
            if (rw < 0 || rh < 0) return;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);
            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：金黃弧段順時針縮短
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                const base = this.getTimerBaseColor('--fm-timer-gold', { h: 45, s: 95, l: 70 });
                const lum = Math.max(25, Math.round(base.l - 15 + 20 * clamped));
                rect.style.stroke = `hsl(${base.h}, ${base.s}%, ${lum}%)`;
            } else {
                // 正常倒數：朱紅由淡轉濃
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                const base = this.getTimerBaseColor('--fm-timer-red', { h: 0, s: 90, l: 50 });
                const alpha = Math.round(5 + 45 * elapsed);
                rect.style.stroke = `hsla(${base.h}, ${base.s}%, ${base.l}%, ${alpha}%)`;
            }
        },

        // ------------------------------------------------------------
        // 紅心渲染與更新
        // ------------------------------------------------------------
        renderHearts: function () {
            const hearts = document.getElementById('game33-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game33-hearts .fm-heart');
            hearts.forEach((h, i) => {
                if (i < this.mistakeCount) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        // ------------------------------------------------------------
        // 結算：勝利→關卡推進；失敗→記錄 LOG、可重試
        // ------------------------------------------------------------
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            this.clearAllTimers();

            // 失敗時補寫 game_logs；勝利時 ScoreManager.saveScore 會自動處理
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 33,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game33-retryGame-btn').disabled = true;
                document.getElementById('game33-newGame-btn').disabled = true;
            } else {
                document.getElementById('game33-retryGame-btn').disabled = false;
                document.getElementById('game33-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                if (win) {
                    if (this.isLevelMode) this.startNextLevel();
                    else this.startNewGame();
                } else {
                    this.retryGame();
                }
            };

            const showMessage = () => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? this.score : 0,
                        reason: win ? "" : reason,
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game33', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game33', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        }
    };

    window.Game33 = Game33;

    // URL 自動啟動：嚴格比對防止 game=3 與 game=33 衝突
    if (new URLSearchParams(window.location.search).get('game') === '33') {
        setTimeout(() => {
            if (window.Game33) window.Game33.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
