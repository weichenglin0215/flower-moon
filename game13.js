(function () {
    const Game13 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // 遊戲狀態
        currentPoem: null,
        hiddenMeta: [], // { type: 'dynasty'|'author'|'title', value: string, isSolved: boolean }
        hiddenChars: [], // { char: string, posIdx: number, isSolved: boolean }

        candidates: [], // { text: string, type: 'meta'|'char', id: string }
        nextHole: null, // 當前待填寫的空格 { type: 'meta'|'char', index: number }

        timeLimit: 60,
        timeLeft: 60,
        timerInterval: null,

        container: null,
        gameArea: null,
        gameStartTime: null,

        // 遊戲參數設定
        // timeLimitRate: 每題空格時間倍率（秒），實際時限 = 實際(meta+char)隱藏數 × timeLimitRate
        // poemMinRating:詩詞最低評分,
        // maxMistakeCount:最大錯誤次數,
        // metaHideCount:隱藏欄位數量,
        // charHideCount:隱藏字數量,
        // metaDistractors:每個隱藏欄位額外增加的干擾項,
        // charDistractors:每個隱藏字額外增加的干擾項
        difficultySettings: {
            '小學': { timeLimitRate: 6, poemMinRating: 6, maxMistakeCount: 3, metaHideCount: 1, charHideCount: 1, metaDistractors: 2, charDistractors: 5 },
            '中學': { timeLimitRate: 5, poemMinRating: 5, maxMistakeCount: 3, metaHideCount: 2, charHideCount: 3, metaDistractors: 2, charDistractors: 3 },
            '高中': { timeLimitRate: 4, poemMinRating: 4, maxMistakeCount: 2, metaHideCount: 3, charHideCount: 5, metaDistractors: 2, charDistractors: 3 },
            '大學': { timeLimitRate: 3, poemMinRating: 3, maxMistakeCount: 2, metaHideCount: 3, charHideCount: 7, metaDistractors: 2, charDistractors: 2 },
            '研究所': { timeLimitRate: 2, poemMinRating: 3, maxMistakeCount: 1, metaHideCount: 3, charHideCount: 9, metaDistractors: 2, charDistractors: 1 }
        },

        // 動態載入本遊戲專屬的 CSS 檔（game13.css），避免重複插入 <link>
        loadCSS: function () {
            if (!document.getElementById('game13-css')) {
                const link = document.createElement('link');
                link.id = 'game13-css';
                link.rel = 'stylesheet';
                link.href = 'game13.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入樣式表、建立（若尚未存在）DOM 結構、綁定難度標籤點擊事件
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game13-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game13-container');
            this.gameArea = document.getElementById('game13-area');

            // 點擊難度標籤 → 播放音效並重新開啟難度選擇畫面
            document.getElementById('game13-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立本遊戲的整個 DOM 結構（外層容器、頂列分數/控制鈕、題目區、答案按鈕池）
        // 只在頁面上尚無 #game13-container 時呼叫一次
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game13-container';
            // game13-overlay 保留為本遊戲私有 hook；fm-overlay 承載共用外觀（詳見 theme_xuanzhi.css）
            div.className = 'game13-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game13-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game13-diff-tag" data-level="小學">小學</button>
                        <button id="game13-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game13-newGame-btn" class="fm-nav-btn">新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game13-hearts" class="fm-hearts"></div>
                    <!-- 註：game13 無詩詞出處連結；#game13-meta（人事時地題目本體）保留於題目區 -->
                </div>
                <div id="game13-area" class="game13-area">
                    <div id="game13-question" class="game13-question-area">
                        <div class="game13-meta-info" id="game13-meta"></div>
                        <div id="game13-poem-text" class="game13-poem-text">
                            <div id="game13-line1" class="game13-poem-lines"></div>
                            <div id="game13-line2" class="game13-poem-lines"></div>
                        </div>
                    </div>
                    <!-- 答案區域 (含邊框倒數) — 三層同心圓結構（同 game1）：
                         ① 最外圈：紅色 SVG timer stroke（10px）
                         ② 中間圈：3px 邊框 + 徑向漸層底色 + border-radius 20px
                         ③ 內圈：答案字/元資訊按鈕池（20px padding） -->
                    <div class="game13-answer-section">
                        <div class="game13-answer-pool-container" style="width:96%;">
                            <svg id="game13-timer-ring" class="fm-timer-ring">
                                <rect id="game13-timer-path" class="fm-timer-path" x="5" y="5"></rect>
                            </svg>
                            <div class="game13-answer-pool-inner-ring">
                                <div id="game13-answer-pool" class="game13-answer-pool"></div>
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
                    div.style.width = 500 + 'px';
                    div.style.height = 850 + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }

            document.getElementById('game13-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game13-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
        },

        // 對外進入點：外部呼叫 Game13.show() 即可啟動本遊戲（初始化 + 顯示難度選擇畫面）
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度選擇畫面；玩家選定難度後的 callback 會設定難度/關卡模式並開新局
        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            if (window.MenuManager) window.MenuManager.closeAll();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('人事時地', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.updateUIForMode();
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    /* updateResponsiveLayout replaced */
                    this.startNewGame();
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game13-diff-tag');
            const newBtn = document.getElementById('game13-newGame-btn');
            // 難度標籤色彩改由 CSS 依 data-level 套色（見 theme_xuanzhi.css 的 .fm-difficulty-tag[data-level=...]）
            if (diffTag) {
                diffTag.setAttribute('data-level', this.difficulty);
                diffTag.textContent = this.isLevelMode ? `挑戰第 ${this.currentLevelIndex} 關` : this.difficulty;
            }
            // 挑戰模式下隱藏「新局」按鈕，避免玩家意外跳出挑戰流程
            if (newBtn) newBtn.style.display = this.isLevelMode ? 'none' : 'inline-block';
        },

        // 停止遊戲並隱藏遊戲畫面（清除計時器、還原頁面捲動狀態）
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        // 開始全新一局：重置分數/錯誤次數、隨機選詩、產生題目與答案池，並啟動倒數計時
        startNewGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.mistakeCount = 0;
            document.getElementById('game13-score').textContent = this.score;
            // 每次開新局都同步更新 UI（含挑戰關卡編號與按鈕顯示狀態）
            this.updateUIForMode();
            this.renderHearts();
            if (window.GameMessage) window.GameMessage.hide();
            if (this.selectRandomPoem()) {
                this.generateProblem();
                this.renderAnswerPool(); // 新題目：重建按鈕池（含 8 行收斂）
                this.renderUI();
                this.adjustFontSize(document.getElementById('game13-line1'), this.lines[0].length);
                this.adjustFontSize(document.getElementById('game13-line2'), this.lines[1].length);
                // 依實際隱藏題目數量動態計算時間限制（(meta+char) × timeLimitRate）
                const settings13 = this.difficultySettings[this.difficulty];
                this.timeLimit = (this.hiddenMeta.filter(m => m.isHidden).length + this.hiddenChars.length) * settings13.timeLimitRate;
                this.startTimer();
            } else {
                alert('載入詩詞失敗');
                this.showDifficultySelector();
            }
        },

        // 重來本題：沿用同一首詩與同一組候選按鈕，只重設作答狀態並重新洗牌按鈕位置
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.mistakeCount = 0;
            document.getElementById('game13-score').textContent = this.score;
            this.renderHearts();
            if (window.GameMessage) window.GameMessage.hide();
            // 重設狀態但不變更題目與選項內容
            this.hiddenMeta.forEach(m => m.isSolved = false);
            this.hiddenChars.forEach(c => c.isSolved = false);
            this.candidates.forEach(cand => cand.isClickedCorrect = false);

            // 隨機打亂按鍵位置
            this.candidates.sort(() => Math.random() - 0.5);

            this.refreshNextHole();
            this.renderAnswerPool(); // 重來：候選陣列被 sort 打亂 → 重建按鈕池
            this.renderUI();
            // 依實際隱藏題目數量動態計算時間限制（(meta+char) × timeLimitRate）
            const settings13r = this.difficultySettings[this.difficulty];
            this.timeLimit = (this.hiddenMeta.filter(m => m.isHidden).length + this.hiddenChars.length) * settings13r.timeLimitRate;
            this.startTimer();
        },

        // 依目前難度設定，從共用詩詞庫隨機挑選一首符合條件（評分、行數、字數限制）的詩
        // 成功則設定 this.currentPoem / this.lines 並回傳 true，失敗回傳 false
        selectRandomPoem: function () {
            const settings = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(settings.poemMinRating, 2, 2, 10, 40, "", this.isLevelMode ? this.currentLevelIndex : null, 'game13');
            if (!result) return false;
            this.currentPoem = result.poem;
            // 限制詩詞名稱長度為 7 個字
            // 詩詞名稱最多 8 字（與 game1/game4 的 fm-poem-info 保持一致）
            if (this.currentPoem.title.length > 8) {
                this.currentPoem.title = this.currentPoem.title.substring(0, 8);
            }
            this.lines = result.lines;
            return true;
        },

        // 依難度設定產生本局題目：決定要隱藏哪些元數據（朝代/作者/詩名）與哪些詩句字元，
        // 並產生對應的候選答案按鈕（含正確答案與干擾項），最後設定第一個待填的空格
        generateProblem: function () {
            const settings = this.difficultySettings[this.difficulty];

            // 1. 決定隱藏哪些元數據 (朝代、作者、詩名)
            const metaTypes = ['dynasty', 'author', 'title'];
            const shuffledMeta = metaTypes.sort(() => Math.random() - 0.5);
            const hidMetaCount = Math.min(settings.metaHideCount, metaTypes.length);
            this.hiddenMeta = metaTypes.map(type => {
                const isHidden = shuffledMeta.indexOf(type) < hidMetaCount;
                return { type, value: this.currentPoem[type], isHidden, isSolved: false };
            });

            // 2. 決定隱藏哪些詩句字元
            this.hiddenChars = [];
            let allText = this.lines.join('');
            let charIndices = [];
            for (let i = 0; i < allText.length; i++) charIndices.push(i);

            const shuffledIndices = charIndices.sort(() => Math.random() - 0.5);
            const hidCharCount = Math.min(settings.charHideCount, allText.length);
            const pickedIndices = shuffledIndices.slice(0, hidCharCount).sort((a, b) => a - b);

            this.hiddenChars = pickedIndices.map(idx => ({
                char: allText[idx],
                posIdx: idx,
                isSolved: false
            }));

            // 3. 產生候選按鈕 (正確答案 + 干擾項)
            this.candidates = [];

            // 加入隱藏的元數據候選
            this.hiddenMeta.filter(m => m.isHidden).forEach(m => {
                this.candidates.push({
                    text: m.value,
                    type: m.type,
                    isCorrect: true,
                    isClickedCorrect: false,
                    id: Math.random().toString(36).substr(2, 9)
                });
                // 加入干擾項 (從其他詩詞中隨機選取)
                for (let i = 0; i < settings.metaDistractors; i++) {
                    let decoy = this.getRandomMetaDecoy(m.type, m.value);
                    this.candidates.push({
                        text: decoy,
                        type: m.type,
                        isCorrect: false,
                        isClickedCorrect: false,
                        id: Math.random().toString(36).substr(2, 9)
                    });
                }
            });

            // 加入隱藏的字元候選
            const correctChars = this.hiddenChars.map(c => c.char);
            correctChars.forEach(char => {
                this.candidates.push({
                    text: char,
                    type: 'char',
                    isCorrect: true,
                    isClickedCorrect: false,
                    id: Math.random().toString(36).substr(2, 9)
                });
            });

            // 加入字元干擾項
            const decoysNeeded = settings.charDistractors * this.hiddenChars.length;
            if (window.SharedDecoy) {
                // 排除目前兩行詩句中出現的所有字
                const exclusionList = Array.from(new Set(this.lines.join('').split('')));
                const decoys = window.SharedDecoy.getDecoyChars(correctChars, decoysNeeded, exclusionList, settings.poemMinRating);
                decoys.forEach(d => {
                    this.candidates.push({
                        text: d,
                        type: 'char',
                        isCorrect: false,
                        isClickedCorrect: false,
                        id: Math.random().toString(36).substr(2, 9)
                    });
                });
            }

            // 隨機打亂所有候選按鈕
            this.candidates.sort(() => Math.random() - 0.5);

            // 設定下一個要填入的洞 (優先元數據，再詩句)
            this.refreshNextHole();
        },

        // 從全部詩詞資料庫中，為指定的元數據類型（朝代/作者/詩名）隨機取一個「非正確答案」的干擾值
        // 作者類型會先過濾掉只有單一作品的作者，避免干擾項過於冷門
        getRandomMetaDecoy: function (type, correctValue) {
            if (typeof POEMS === 'undefined') return "未知";

            let pool;
            if (type === 'author') {
                // 統計作者作品數量
                const authorCounts = {};
                POEMS.forEach(p => {
                    if (p.author) authorCounts[p.author] = (authorCounts[p.author] || 0) + 1;
                });
                // 過濾作品數量大於 1 的作者
                pool = Array.from(new Set(POEMS.map(p => p.author).filter(v => v && v !== correctValue && authorCounts[v] > 1)));
            } else {
                pool = Array.from(new Set(POEMS.map(p => p[type]).filter(v => v && v !== correctValue)));
            }

            if (pool.length === 0) return "佚名";
            let val = pool[Math.floor(Math.random() * pool.length)];
            // 限制干擾項的詩名長度為 7
            if (type === 'title' && val.length > 7) {
                val = val.substring(0, 7);
            }
            return val;
        },

        // 重新計算「下一個待填入的空格」：優先找尚未解出的元數據，其次才找尚未解出的詩句字元
        // 若全部都已解出，則將 nextHole 設為 null
        refreshNextHole: function () {
            // 尋找第一個未解決的元數據洞
            const nextMetaIdx = this.hiddenMeta.findIndex(m => m.isHidden && !m.isSolved);
            if (nextMetaIdx !== -1) {
                this.nextHole = { type: 'meta', index: nextMetaIdx, typeName: this.hiddenMeta[nextMetaIdx].type };
                return;
            }
            // 尋找第一個未解決的字元洞
            const nextCharIdx = this.hiddenChars.findIndex(c => !c.isSolved);
            if (nextCharIdx !== -1) {
                this.nextHole = { type: 'char', index: nextCharIdx };
                return;
            }
            this.nextHole = null; // 全都填完了
        },

        // 依目前遊戲狀態重新繪製畫面：元數據方塊（朝代/作者/詩名）與詩句文字
        // 注意：此函式不會重建答案按鈕池，只更新題目顯示區
        renderUI: function () {
            // 1. 渲染元數據區域
            const metaContainer = document.getElementById('game13-meta');
            metaContainer.innerHTML = '';
            this.hiddenMeta.forEach((m, idx) => {
                const box = document.createElement('div');
                box.className = 'meta-box';
                if (m.isHidden) {
                    box.classList.add('hidden-meta');
                    if (m.isSolved) {
                        box.textContent = m.value.length > 5 ? m.value.slice(0, 4) + '…' : m.value;
                        box.classList.add('correct');
                    } else {
                        // 顯示類型提示
                        const labels = { dynasty: '朝代', author: '作者', title: '詩名' };
                        box.textContent = labels[m.type];
                    }
                } else {
                    box.textContent = m.value.length > 5 ? m.value.slice(0, 4) + '…' : m.value;
                    box.classList.add('correct'); // 不列入問題時，以綠色顯示
                }
                metaContainer.appendChild(box);
            });

            // 2. 渲染詩句區域
            const l1 = document.getElementById('game13-line1');
            const l2 = document.getElementById('game13-line2');

            const renderText = (lineText, lineIdx) => {
                let html = "";
                let globalOffset = lineIdx === 0 ? 0 : this.lines[0].length;
                for (let i = 0; i < lineText.length; i++) {
                    const char = lineText[i];
                    const globalIdx = globalOffset + i;
                    const hInfoIdx = this.hiddenChars.findIndex(h => h.posIdx === globalIdx);
                    if (hInfoIdx !== -1) {
                        const hInfo = this.hiddenChars[hInfoIdx];
                        if (hInfo.isSolved) {
                            html += `<span class="correct-char">${hInfo.char}</span>`;
                        } else {
                            html += `<span class="hidden-char">◎</span>`;
                        }
                    } else {
                        html += char;
                    }
                }
                return html;
            };

            l1.innerHTML = renderText(this.lines[0], 0);
            l2.innerHTML = renderText(this.lines[1], 1);

            // ⚠️ 過去這裡會整個重建按鈕池，導致每次答對後所有按鈕都重新播放出場動畫、
            //    看起來像「答案區重新洗排」。現已改為：只有 startNewGame/retryGame 才會
            //    透過 renderAnswerPool() 重建；答對時由 handleInput 就地更新該顆按鈕即可。
        },

        // 只在「新題目 / 重來」時呼叫：重建整個按鈕池並套版面收斂邏輯
        renderAnswerPool: function () {
            const pool = document.getElementById('game13-answer-pool');
            if (!pool) return;
            pool.innerHTML = '';
            pool.classList.remove('compact-layout');    // 每次重建先回歸標準尺寸
            const N = this.candidates.length;
            this.candidates.forEach((cand, idx) => {
                const btn = document.createElement('button');
                btn.className = 'ans-btn-13';
                if (cand.type === 'char') {
                    btn.classList.add('char-btn');
                } else {
                    btn.classList.add('meta-btn');
                }
                // ⚠️ 出場動畫：所有卡片啟動時機壓進 0~0.5 秒之間，每片動畫本身 0.5s，
                //   中心點整體 XY 放大（scale 0→1）
                btn.classList.add('ans-btn-13-appear');
                const delay = (N > 1) ? (idx / (N - 1)) * 0.5 : 0;
                btn.style.animationDelay = delay.toFixed(3) + 's';
                btn.textContent = cand.text;

                if (cand.isClickedCorrect) {
                    btn.classList.add('disabled', 'correct');
                }

                btn.onclick = () => this.handleInput(cand, btn);
                // 把 candidate 掛到 DOM 上，供 packAnswerPool 反查（不動 candidates 陣列本身的順序）
                btn._g13Cand = cand;
                pool.appendChild(btn);
            });

            // 版面收斂：以 FFD 裝箱演算法把按鈕塞進 8 行；不夠再刪干擾字候選
            this.packAnswerPool();
        },

        // 依詩句長度調整字體大小：字數較多時縮小字體，避免超出顯示區域
        adjustFontSize: function (element, length) {
            if (!element) return;
            if (length <= 8) {
                element.style.fontSize = '50px';
            } else if (length > 8) {
                element.style.fontSize = '40px';
            }
        },

        // 目標：把答案方塊擠進 8 行內（實際上受 .game13-answer-pool 固定 height 500px 限制）。
        //   Step 1 —— 若溢出則套用 compact-layout（按鈕/間距縮小 → 每行可塞更多按鈕）
        //   Step 2 —— 若 compact 仍溢出，才逐一刪除干擾字候選（isCorrect=false）直到剛好放得下
        //   ⚠️ 只刪 isCorrect=false 的干擾字；正確答案（含已按對的）一律保留，避免玩家無法通關。
        //   ⚠️ 此函式只在 renderAnswerPool（新題目 / 重來）呼叫一次；答對時 handleInput 就地更新按鈕，
        //      不再重跑此函式，因此不會「多次觸發後累積刪過頭」。
        // ⚠️ 為何不能用「flex-wrap 貪婪左到右 + 只看有沒有 overflow」的舊做法：
        //    flex-wrap 依 DOM 順序把按鈕由左至右塞，遇到第一個放不下的就換行。
        //    若某顆較寬的 meta-btn（如「李商隱」）出現在中段，它會被擠到下一行、
        //    留下一行只有它一顆的稀疏行 → 明明所有按鈕總寬能塞進 8 行卻塞不下。
        //
        // 正確作法：把「排幾行」當成 Bin Packing 用 First-Fit-Decreasing（FFD）：
        //   1. 量測每顆按鈕實際寬度、pool 內寬、gap；
        //   2. 依寬度從大到小排，依序放進「還塞得下」的第一個既有行；都塞不下才開新行；
        //   3. 把 DOM 依 FFD 分行順序（row1 全部, row2 全部, ...）重排，
        //      flex-wrap 貪婪左到右就會忠實重現 FFD 的分行結果。
        //   4. 若 FFD 需要的行數 > 8：先套 compact-layout（按鈕/間距縮小）再重算；
        //   5. compact 仍 > 8 行：才刪一顆干擾字候選（isCorrect=false）重算，
        //      直到裝得下或無干擾字可刪。正確答案（含已按對的）一律保留。
        //
        // ⚠️ 只在 renderAnswerPool 呼叫一次；答對時 handleInput 就地更新按鈕（不重跑此函式）。
        packAnswerPool: function () {
            const pool = document.getElementById('game13-answer-pool');
            if (!pool) return;
            const MAX_ROWS = 8;

            // 量測「當前 CSS 模式下」每顆按鈕寬度、pool 可用內寬、gap
            const measure = () => {
                const btns = Array.from(pool.querySelectorAll('.ans-btn-13'));
                const cs = getComputedStyle(pool);
                const poolInnerWidth = pool.clientWidth
                    - parseFloat(cs.paddingLeft || 0)
                    - parseFloat(cs.paddingRight || 0);
                const gap = parseFloat(cs.columnGap || cs.gap || 10);
                const widths = btns.map(b => b.offsetWidth);
                return { btns, widths, poolInnerWidth, gap };
            };

            // FFD 裝箱：回傳 rows: [{ items: [btnIndex, ...], total: usedWidth }, ...]
            //   items 內按鈕的索引指向傳入 btns 的位置。
            const packFFD = (btns, widths, poolInnerWidth, gap) => {
                const rows = [];
                // 由大到小排；穩定排序保留同寬按鈕的原順序（保持玩家視覺上的隨機感）
                const order = widths
                    .map((w, i) => ({ w, i }))
                    .sort((a, b) => b.w - a.w);
                for (const { w, i } of order) {
                    let placed = false;
                    for (const row of rows) {
                        const need = row.items.length > 0 ? w + gap : w;
                        if (row.total + need <= poolInnerWidth + 0.5) {
                            row.items.push(i);
                            row.total += need;
                            placed = true;
                            break;
                        }
                    }
                    if (!placed) rows.push({ items: [i], total: w });
                }
                return rows;
            };

            // 依 rows 重排 pool 子節點：row1 全部 → row2 全部 → ...
            //   appendChild 已存在節點會把它搬到最後，class/事件/animationDelay 保留
            const reorderPool = (btns, rows) => {
                for (const row of rows) {
                    for (const idx of row.items) pool.appendChild(btns[idx]);
                }
            };

            // 找一顆「isCorrect=false 且尚未按對」的干擾字按鈕，從 DOM 與 this.candidates 一併移除
            const removeOneDecoy = () => {
                const btns = Array.from(pool.querySelectorAll('.ans-btn-13'));
                for (let i = btns.length - 1; i >= 0; i--) {
                    const cand = btns[i]._g13Cand;
                    if (!cand) continue;
                    if (cand.isCorrect) continue;
                    if (cand.isClickedCorrect) continue;
                    btns[i].remove();
                    const candIdx = this.candidates.indexOf(cand);
                    if (candIdx >= 0) this.candidates.splice(candIdx, 1);
                    return true;
                }
                return false;
            };

            // Step 1：以標準尺寸做一次 FFD
            pool.classList.remove('compact-layout');
            let m = measure();
            let rows = packFFD(m.btns, m.widths, m.poolInnerWidth, m.gap);

            // Step 2：> 8 行 → 套 compact-layout（按鈕/間距縮小）後重算
            if (rows.length > MAX_ROWS) {
                pool.classList.add('compact-layout');
                m = measure();
                rows = packFFD(m.btns, m.widths, m.poolInnerWidth, m.gap);
            }

            // Step 3：compact 仍 > 8 行 → 逐顆刪干擾字，重算，直到裝得下或無干擾字可刪
            let safety = 0;
            while (rows.length > MAX_ROWS && safety < 200) {
                safety++;
                if (!removeOneDecoy()) break;
                m = measure();
                rows = packFFD(m.btns, m.widths, m.poolInnerWidth, m.gap);
            }

            // Step 4：位置混淆（打破 FFD 產生的「詩名／作者集中在上、單字集中在下」的呆板排列）
            //   FFD 為了塞得最緊，會讓大 meta 集中在前幾行、小的 char 集中在後幾行。
            //   此處在**不新增行數、不撐爆任何一行**的前提下做兩步打散：
            //     (a) 每顆 2/3 字 meta-btn 嘗試與另一行連續 2/3 顆 char-btn 交換位置；
            //     (b) 打亂 rows 陣列的上下順序。
            this.scrambleAnswerPool(m.btns, rows, m.poolInnerWidth, m.gap);

            // 最後：依 FFD 分行結果把 DOM 按 row1→row2→... 順序重排，交給 flex-wrap 忠實重現
            reorderPool(m.btns, rows);
        },

        // 位置混淆器：在 FFD 分行的基礎上做「兩顆／三顆等寬區塊互換」與「行序打亂」，
        //   讓玩家看到的不是「meta 全在上、char 全在下」的呆板佈局，同時保證不增加行數。
        //
        // 步驟：
        //   1. 蒐集所有 2 字／3 字 meta-btn 的位置（1 字 meta 視覺上與 char-btn 相同，不必換）；
        //   2. 對每顆這種 meta，隨機在**別行**找一段連續 N 顆 char-btn（N = 該 meta 字數），
        //      模擬交換後計算兩行寬度：只要都 ≤ pool 內寬 → 交換 items 順序；
        //   3. 洗亂 rows 陣列上下順序（避免題名總在最上、單字總在最下）。
        scrambleAnswerPool: function (btns, rows, poolInnerWidth, gap) {
            const shuffle = (arr) => {
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                return arr;
            };

            // 計算一整行的寬度（含 items 之間的 gap）
            const computeRowWidth = (itemIndices) => {
                if (itemIndices.length === 0) return 0;
                let w = 0;
                for (let i = 0; i < itemIndices.length; i++) {
                    w += btns[itemIndices[i]].offsetWidth;
                    if (i > 0) w += gap;
                }
                return w;
            };

            // 蒐集所有可交換的 meta-btn 位置：字數為 2 或 3 者才處理
            //   （字數 1 的 meta 與 char-btn 視覺上難以區分，混淆意義不大；> 3 字的 meta（長詩名）
            //    因寬度過大、不易找到對稱的字塊組來交換，此處也略過。）
            const metaLocations = [];
            for (let r = 0; r < rows.length; r++) {
                for (let i = 0; i < rows[r].items.length; i++) {
                    const btn = btns[rows[r].items[i]];
                    if (!btn.classList.contains('meta-btn')) continue;
                    const cc = (btn.textContent || '').length;
                    if (cc === 2 || cc === 3) metaLocations.push({ rowIdx: r, itemIdx: i, charCount: cc });
                }
            }
            shuffle(metaLocations);

            // 對每顆 meta，嘗試在別行找連續 N 顆 char-btn 交換
            for (const meta of metaLocations) {
                const N = meta.charCount;
                const srcRow = rows[meta.rowIdx];
                // 若 srcRow 已被前面的交換動過，itemIdx 可能已失效 → 用 btn 反查最新位置
                const metaBtnIdx = srcRow.items[meta.itemIdx];
                if (!metaBtnIdx && metaBtnIdx !== 0) continue;
                const metaBtn = btns[metaBtnIdx];
                // 反查在 srcRow 內的當前 itemIdx（前面交換可能改動）
                const currentMetaItemIdx = srcRow.items.indexOf(metaBtnIdx);
                if (currentMetaItemIdx < 0) continue;

                // 在別行找「連續 N 顆 char-btn」的所有起點
                const candidateSlots = [];
                for (let r = 0; r < rows.length; r++) {
                    if (r === meta.rowIdx) continue;
                    const items = rows[r].items;
                    for (let i = 0; i + N <= items.length; i++) {
                        let allChar = true;
                        for (let k = 0; k < N; k++) {
                            if (!btns[items[i + k]].classList.contains('char-btn')) {
                                allChar = false; break;
                            }
                        }
                        if (allChar) candidateSlots.push({ rowIdx: r, startItemIdx: i });
                    }
                }
                if (candidateSlots.length === 0) continue;
                shuffle(candidateSlots);

                // 嘗試每個候選：模擬交換後兩行都須 ≤ poolInnerWidth 才實際交換
                for (const slot of candidateSlots) {
                    const dstRow = rows[slot.rowIdx];
                    const charBtnIndices = [];
                    for (let k = 0; k < N; k++) charBtnIndices.push(dstRow.items[slot.startItemIdx + k]);

                    const srcItemsAfter = srcRow.items.slice();
                    srcItemsAfter.splice(currentMetaItemIdx, 1, ...charBtnIndices);
                    const dstItemsAfter = dstRow.items.slice();
                    dstItemsAfter.splice(slot.startItemIdx, N, metaBtnIdx);

                    const newSrcWidth = computeRowWidth(srcItemsAfter);
                    const newDstWidth = computeRowWidth(dstItemsAfter);
                    if (newSrcWidth > poolInnerWidth + 0.5) continue;
                    if (newDstWidth > poolInnerWidth + 0.5) continue;

                    // 落實交換
                    srcRow.items = srcItemsAfter;
                    srcRow.total = newSrcWidth;
                    dstRow.items = dstItemsAfter;
                    dstRow.total = newDstWidth;
                    break;
                }
            }

            // 最後把 rows 陣列上下順序洗亂（避免上寬下窄的固定觀感）
            shuffle(rows);
        },

        // 處理玩家點擊某個候選答案按鈕：比對此答案是否能填入任何一個尚未解出的空格
        // （元數據或詩句字元皆可能同時有多個相同的洞），命中則加分並更新畫面，
        // 未命中則扣血並視難度決定按鈕是否可再次點擊
        handleInput: function (cand, btn) {
            if (!this.isActive) return;

            // 尋找所有匹配的洞 (不再依序，而是全場比對)
            let matchesFound = 0;

            // 檢查元數據
            this.hiddenMeta.forEach(m => {
                if (m.isHidden && !m.isSolved && m.type === cand.type && m.value === cand.text) {
                    m.isSolved = true;
                    matchesFound++;
                }
            });

            // 檢查字元
            this.hiddenChars.forEach(c => {
                if (!c.isSolved && cand.type === 'char' && c.char === cand.text) {
                    c.isSolved = true;
                    matchesFound++;
                }
            });

            if (matchesFound > 0) {
                if (window.SoundManager) window.SoundManager.playSuccess();
                cand.isClickedCorrect = true; // 標記此按鈕已正確使用
                this.score += window.ScoreManager.gameSettings['game13'].getPointA;
                //this.score += 20 * matchesFound * (window.ScoreManager ? window.ScoreManager.multipliers[this.difficulty] : 1);

                document.getElementById('game13-score').textContent = this.score;
                this.refreshNextHole();
                // ⚠️ 就地更新被點的按鈕：不重建整個按鈕池，才不會每次答對都重播出場動畫
                //    看起來像「答案區重新洗排」。renderUI 只負責更新元數據與詩句區。
                btn.classList.add('disabled', 'correct');
                this.renderUI();

                // 檢查是否全解
                const allMetaDone = this.hiddenMeta.every(m => !m.isHidden || m.isSolved);
                const allCharDone = this.hiddenChars.every(c => c.isSolved);

                if (allMetaDone && allCharDone) {
                    this.gameOver(true, '恭喜過關！');
                }
            } else {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.mistakeCount++;
                this.updateHearts();

                const isEasyMode = (this.difficulty === '小學' || this.difficulty === '中學');
                if (isEasyMode) {
                    // 中小學難度，按錯不移除紅色狀態且禁用
                    btn.classList.add('wrong', 'disabled');
                } else {
                    // 高階難度，按錯後回復
                    btn.classList.add('wrong');
                    setTimeout(() => btn.classList.remove('wrong'), 500);
                }

                if (this.mistakeCount >= this.difficultySettings[this.difficulty].maxMistakeCount) {
                    this.gameOver(false, '失誤次數過多');
                }
            }
        },

        // 啟動倒數計時器：每 100ms 更新一次計時環，時間耗盡則判定遊戲失敗
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.timeLimit * 1000;
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, "時間到！");
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        /**
         * 讀取計時框的基準色（來源：theme_xuanzhi.css 的 --fm-timer-* 變數）。
         * 解析成 { h, s, l }；解析失敗時回退到 fallback，確保計時框仍有可見顏色。
         * 與 scoreManager.js 的 getStarBaseColor() 同一套「以 CSS 變數為基準色」的做法。
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
            const rect = document.getElementById('game13-timer-path');
            const container = document.querySelector('.game13-answer-pool-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game13-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            // ⚠️ 對齊三層結構最外圈：rect x=5 y=5、stroke-width=10 → 覆蓋 container 外緣 10px 環帶
            rect.setAttribute('width', Math.max(0, w - 10));
            rect.setAttribute('height', Math.max(0, h - 10));
            const perimeter = (Math.max(0, w - 10) + Math.max(0, h - 10)) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                // 色相／飽和度取自主題金黃 --fm-timer-gold；亮度隨剩餘比例掃動（base.l-15 → base.l+5），
                // 並以 25 為亮度保底避免主題值過暗時變黑。
                const base = this.getTimerBaseColor('--fm-timer-gold', { h: 45, s: 95, l: 70 });
                const lum = Math.max(25, Math.round(base.l - 15 + 20 * clamped));
                rect.style.stroke = `hsl(${base.h}, ${base.s}%, ${lum}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 色相／飽和度／亮度取自主題朱紅 --fm-timer-red；透明度隨消逝比例掃動（5% → 50%）。
                const base = this.getTimerBaseColor('--fm-timer-red', { h: 0, s: 90, l: 50 });
                const alpha = Math.round(5 + 45 * elapsed);
                rect.style.stroke = `hsla(${base.h}, ${base.s}%, ${base.l}%, ${alpha}%)`;
            }
        },

        // 依目前難度的「最大允許錯誤次數」畫出對應數量的紅心圖示（生命值）
        renderHearts: function () {
            const container = document.getElementById('game13-hearts');
            if (!container) return;
            container.innerHTML = '';
            const max = this.difficultySettings[this.difficulty].maxMistakeCount;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        // 依目前錯誤次數，將對應數量的紅心圖示切換為「空心」狀態
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game13-hearts .fm-heart');
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

        // 結束本局遊戲：記錄結果（失敗時寫入 game_logs）、更新按鈕狀態，
        // 並依勝負顯示對應訊息與後續動作（下一關 / 開新局 / 再試一次）
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            // 失敗時寫入 game_logs（score=0，記錄本局時長）
            // 過關時 LOG 已由 ScoreManager.saveScore 負責寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 13,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);

            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game13-retryGame-btn').disabled = true;
                document.getElementById('game13-newGame-btn').disabled = true;
            } else {
                document.getElementById('game13-retryGame-btn').disabled = false;
                document.getElementById('game13-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                // 恢復按鈕狀態
                document.getElementById('game13-retryGame-btn').disabled = false;
                document.getElementById('game13-newGame-btn').disabled = false;

                if (win) {
                    if (this.isLevelMode) {
                        this.currentLevelIndex++;
                        this.startNewGame();
                    } else {
                        this.startNewGame();
                    }
                } else {
                    this.retryGame();
                }
            };

            const showMessage = () => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? this.score : 0,
                        reason: reason || (win ? "" : "挑戰結束"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "開新局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game13',
                    timerContainerId: 'game13-answer-pool',
                    scoreElementId: 'game13-score',
                    heartsSelector: '#game13-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        if (this.isLevelMode) {
                            const achId = window.ScoreManager.completeLevel('game13', this.difficulty, this.currentLevelIndex);
                            if (achId && window.AchievementDialog) {
                                window.AchievementDialog.showInstantAchievementPop(achId, 'game13', this.currentLevelIndex, showMessage);
                            } else {
                                showMessage();
                            }
                        } else {
                            showMessage();
                        }
                    }
                });
            } else {
                showMessage();
            }
        }
    };

    window.Game13 = Game13;

    if (new URLSearchParams(window.location.search).get('game') === '13') {
        setTimeout(() => {
            if (window.Game13) window.Game13.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
