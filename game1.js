(function () {
    // 遊戲一：慢思快選（先冷靜細讀題目詩句，再快速選出正確答案）
    // Game1 物件：以「模組物件」的方式封裝本遊戲的所有狀態與方法，
    // 掛載於 window.Game1，供 index 頁面呼叫 show() 啟動遊戲。
    const Game1 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        timer: 10, // 目前剩餘時間（秒），會隨倒數而變動
        maxTimer: 10, // 每輪的最大時間（根據難度設置，即倒數起始秒數）
        timerInterval: null, // setInterval 的計時器代號，供 clearInterval 清除用
        score: 0, // 本局目前累積分數
        mistakeCount: 0, // 本局目前已答錯次數
        maxMistakeCount: 3, // 本局允許的最大錯誤次數，超過即遊戲結束
        currentPoem: null, // 目前題目所使用的詩詞物件（來自 POEMS 資料）
        correctAnswer: "", // 目前題目的正確答案句子（完整未遮罩文字）
        options: [], // （保留欄位，實際選項資料存於 currentOptions）

        container: null, // 遊戲最外層容器 DOM（#game1-container）
        game1Area: null, // 遊戲內容區域 DOM（#game1-area）
        timerBar: null, // （目前未使用，舊版計時條殘留欄位）
        timerText: null, // （目前未使用，舊版計時文字殘留欄位）
        gameStartTime: null, // 本局開始時的時間戳（Date.now()），用於計算 duration_s

        //timeLimit: 時間限制
        //poemMinRating: 最低詩詞評分
        //maxMistakeCount: 最大錯誤次數
        //answerAtLine: 答案出現在第幾行，0=第一行或第二行，1=第一行，2=第二行，3=第一行和第二行
        //minMaskCount: 最少遮罩數量
        //maxMaskCount: 最多遮罩數量
        difficultySettings: {
            '小學': { timeLimit: 30, poemMinRating: 6, maxMistakeCount: 4, answerAtLine: 2, minMaskCount: 1, maxMaskCount: 1 },
            '中學': { timeLimit: 25, poemMinRating: 5, maxMistakeCount: 3, answerAtLine: 0, minMaskCount: 2, maxMaskCount: 3 },
            '高中': { timeLimit: 20, poemMinRating: 4, maxMistakeCount: 2, answerAtLine: 0, minMaskCount: 3, maxMaskCount: 5 },
            '大學': { timeLimit: 15, poemMinRating: 3, maxMistakeCount: 2, answerAtLine: 1, minMaskCount: 4, maxMaskCount: 6 },
            '研究所': { timeLimit: 10, poemMinRating: 2, maxMistakeCount: 1, answerAtLine: 1, minMaskCount: 8, maxMaskCount: 10 }
        },

        // 動態載入本遊戲專屬的 CSS 檔（game1.css），避免重複載入（用 id 判斷是否已存在）
        loadCSS: function () {
            if (!document.getElementById('game1-css')) {
                const link = document.createElement('link');
                link.id = 'game1-css';
                link.rel = 'stylesheet';
                link.href = 'game1.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入樣式表、建立（或取用既有）DOM，並綁定各按鈕事件
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game1-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game1-container');
            this.game1Area = document.getElementById('game1-area');
            this.container = document.getElementById('game1-container');
            this.game1Area = document.getElementById('game1-area');
            // 舊版計時器相關的 DOM 參照已移除（改由 SVG 計時環 updateTimerRing 取代）

            // 綁定按鈕
            document.getElementById('game1-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame(); // 重來：保留題目
            };
            document.getElementById('game1-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame(); // 開新局：換新題目
            };
            document.getElementById('game1-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // 建立遊戲的整體 DOM 結構（頂部資訊列、題目區、答案區、計時環），
        // 並掛入 body。只在 init() 偵測到尚未建立時呼叫一次。
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game1-container';
            // game1-overlay 保留為本遊戲私有 hook；fm-overlay 承載共用外觀（詳見 theme_xuanzhi.css）
            div.className = 'game1-overlay fm-overlay hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <!-- <div class="debug-frame"></div> -->
                
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game1-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game1-diff-tag" data-level="小學">小學</button>
                        <button id="game1-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game1-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game1-hearts" class="fm-hearts"></div>
                    <div id="game1-poem-info" class="fm-poem-info"></div>
                </div>
                <div id="game1-area" class="game1-area">
                    <!-- 遊戲內容將在此生成 -->
                    <!-- 問題區域 -->
                    <div class="game1-question-area">
                        <div id="game1-question-lines" class="game1-question-lines">
                            <!-- JS 動態插入 -->
                        </div>
                        <!-- 詩名/朝代/作者：已移至 fm-sub-header 右側，見上方 -->
                    </div>

                    <!-- 答案區域 (含邊框倒數)
                         三層結構：
                         ① 最外圈：紅色 SVG timer stroke（10px）
                         ② 中間圈：3px 邊框 + 徑向漸層底色 + border-radius 20px
                         ③ 內圈：4 個答案卡（20px padding） -->
                    <div class="game1-answer-area">
                        <div id="game1-answer-grid-container" class="game1-answer-grid-container">
                            <svg id="game1-timer-ring" class="fm-timer-ring">
                                <rect id="game1-timer-path" class="fm-timer-path" x="5" y="5"></rect>
                            </svg>
                            <div class="game1-answer-inner-ring">
                                <div id="game1-answer-grid" class="game1-answer-grid">
                                    <!-- JS 動態插入 -->
                                </div>
                            </div>
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
            this.renderHearts();
        },

        // 對外進入點：外部頁面呼叫 Game1.show() 啟動本遊戲
        show: function () {
            this.init(); // 確保 DOM 存在

            // 顯示難度選擇器，讓玩家先選難度再開始遊戲
            this.showDifficultySelector();
        },

        // 顯示難度選擇彈窗；玩家選定難度後，套用該難度的設定值（時限、錯誤上限等），
        // 並顯示遊戲容器、開始新的一局。若 DifficultySelector 模組不存在則降級直接開始。
        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            // 隐藏主页和其他游戏
            this.hideOtherContents();
            // 顯示難度選擇器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('慢思快選', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    const settings = this.difficultySettings[selectedLevel];
                    this.maxTimer = settings.timeLimit; // 設置最大時間
                    this.timer = settings.timeLimit;
                    this.maxMistakeCount = settings.maxMistakeCount;

                    this.updateUIForMode();

                    // 顯示遊戲容器
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    // 觸發響應式佈局更新
                    if (window.updateResponsiveLayout) {
                        /* updateResponsiveLayout replaced */
                    }
                    this.startNewGame();
                });
            } else {
                // 降級處理：直接開始遊戲
                console.warn('[Game1] DifficultySelector not found, using default difficulty');
                this.container.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                document.body.classList.add('overlay-active');
                if (window.updateResponsiveLayout) {
                    /* updateResponsiveLayout replaced */
                }
                this.startNewGame();
            }
        },

        // 根據目前模式（一般難度模式 or 關卡挑戰模式）更新頂部按鈕與難度標籤的顯示內容
        updateUIForMode: function () {
            const diffTag = document.getElementById('game1-diff-tag');
            const retryBtn = document.getElementById('game1-retryGame-btn');
            const newBtn = document.getElementById('game1-newGame-btn');
            // 難度標籤色彩已改由 CSS 依 data-level 屬性套色（見 theme_xuanzhi.css 的 .fm-difficulty-tag[data-level=...]）
            // 這裡只負責更新文字與同步 data-level；避免 JS 硬寫顏色覆蓋主題。
            if (diffTag) diffTag.setAttribute('data-level', this.difficulty);

            if (this.isLevelMode) {
                if (diffTag) diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) diffTag.textContent = this.difficulty;
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
            /* updateResponsiveLayout replaced */
        },

        // 進入本遊戲前，隱藏主頁卡片與其他遊戲的容器，避免畫面重疊
        hideOtherContents: function () {
            // 隱藏主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隱藏其他遊戲
            const game2 = document.getElementById('game2-container');
            const game3 = document.getElementById('game3-container');
            if (game2) game2.classList.add('hidden');
            if (game3) game3.classList.add('hidden');
        },

        // 離開本遊戲時，恢復主頁卡片容器的顯示
        showOtherContents: function () {
            // 恢復主頁容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        // 停止遊戲並關閉本遊戲畫面，恢復頁面捲動與其他內容顯示
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            // 恢復其他內容
            this.showOtherContents();
        },

        // 「重來」：沿用目前題目（不重新抽詩），重設分數／錯誤數／計時器後重新開始作答
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.gameStartTime = Date.now(); // 重試也重設本局計時
            this.renderHearts();
            document.getElementById('game1-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();


            // 重新渲染當前題目 (不重新準備)
            this.renderChallenge();
            // 重設計時器
            this.startTimer();
            // 啟用重來按鈕
            document.getElementById('game1-retryGame-btn').disabled = false;
            document.getElementById('game1-newGame-btn').disabled = false;
        },

        // 「開新局」：重設分數／錯誤數，並抽取全新一題（levelIndex 有值時代表切換為指定關卡）
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }

            this.updateUIForMode();
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.renderHearts();
            document.getElementById('game1-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();


            // 記錄本局開始時間（用於計算 duration_s）
            this.gameStartTime = Date.now();

            // 準備新題目並開始
            this.prepareChallenge();
            this.startTimer();
            // 啟用按鈕
            document.getElementById('game1-retryGame-btn').disabled = false;
            document.getElementById('game1-newGame-btn').disabled = false;
        },

        // 關卡模式下過關成功，前進到下一關並開始新的一局
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 切換到下一題（保留目前分數／錯誤數，不重設整局），僅重新抽題並重設計時器
        nextQuestion: function () {
            if (!this.isActive) return;

            // 選擇詩詞
            this.prepareChallenge();

            // 重設計時器
            this.startTimer();
        },

        // 準備一道新題目：抽取符合難度條件的詩詞、決定要遮罩的句子與遮罩位置、
        // 產生選項資料，最後呼叫 renderChallenge() 將題目畫面渲染出來。
        prepareChallenge: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return;

            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.poemMinRating || 4;

            // 使用全域共用邏輯取得隨機詩詞 (要求至少            // 傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating || 4,
                2, 2, 8, 30, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game1'
            );
            if (!result) {
                alert('找不到符合評分的詩詞。');
                return;
            }
            this.currentPoem = result.poem; // 記錄目前題目所屬的完整詩詞物件
            const content = result.poem.content; // 詩詞內文（依句拆成陣列）
            const startIdx = result.startIndex; // 本題所取用的起始句索引
            let line1 = content[startIdx]; // 題目第一句
            let line2 = content[startIdx + 1]; // 題目第二句（與第一句相鄰，通常為對句）

            // 根據 answerAtLine 決定哪一句被部分隱藏
            // 2: 答案在第二行, 1: 答案在第一行, 0: 隨機
            let hideFirst;
            if (settings.answerAtLine === 1) {
                hideFirst = true;
            } else if (settings.answerAtLine === 2) {
                hideFirst = false;
            } else {
                hideFirst = Math.random() < 0.5;
            }

            this.correctAnswer = hideFirst ? line1 : line2;
            const displayedLine = hideFirst ? line2 : line1;

            // 處理隱藏文字 (◎)
            // 內部函式：從一句詩中隨機挑選若干個字元位置作為「遮罩位置」，
            // 標點符號不參與遮罩；實際遮罩數量會在 [min, max] 範圍內隨機決定。
            const getMaskIndices = (text, min, max) => {
                const chars = text.split('');
                let validIndices = [];
                chars.forEach((c, i) => {
                    if (!/[，。？！、：；]/.test(c)) validIndices.push(i);
                });

                //const maxPossible = Math.max(1, validIndices.length - 1); //原先作法至少會留一個字不遮罩，現已取消
                const maxPossible = validIndices.length;
                const actualMin = Math.min(maxPossible, Math.max(1, min));
                const actualMax = Math.min(maxPossible, Math.max(actualMin, max));
                const maskCount = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;

                let maskedIndices = [];
                while (maskedIndices.length < maskCount) {
                    let r = validIndices[Math.floor(Math.random() * validIndices.length)];
                    if (!maskedIndices.includes(r)) maskedIndices.push(r);
                }
                return maskedIndices;
            };

            this.maskedIndices = getMaskIndices(this.correctAnswer, settings.minMaskCount, settings.maxMaskCount);
            // 純文字版 (供產生成選項邏輯使用)
            this.maskedLinePlain = this.correctAnswer.split('').map((c, i) => this.maskedIndices.includes(i) ? "◎" : c).join('');
            // HTML 版 (供題目顯示使用)
            this.maskedLineHTML = this.correctAnswer.split('').map((c, i) => this.maskedIndices.includes(i) ? `<span class="hidden-char">◎</span>` : c).join('');

            this.displayedLine = displayedLine;
            this.hideFirst = hideFirst;

            // 生成選項數據 - 使用純文字版計算
            this.generateOptionsData(this.correctAnswer, this.maskedLinePlain);

            // 渲染 UI
            this.renderChallenge();
        },

        // 將目前題目（含遮罩的兩句詩）與詩詞資訊渲染到畫面上，並觸發選項渲染
        renderChallenge: function () {
            const qDiv = document.getElementById('game1-question-lines');
            qDiv.innerHTML = '';

            const l1Text = this.hideFirst ? this.maskedLineHTML : this.displayedLine;
            const l2Text = this.hideFirst ? this.displayedLine : this.maskedLineHTML;

            const l1Div = document.createElement('div');
            l1Div.className = 'game1-poem-lines';
            // 動態縮小字體 (需過濾掉 HTML 標籤)
            const l1Len = l1Text.replace(/<[^>]*>/g, '').length;
            this.adjustFontSize(l1Div, l1Len, 7, 2.5);
            l1Div.innerHTML = l1Text;
            qDiv.appendChild(l1Div);

            const l2Div = document.createElement('div');
            l2Div.className = 'game1-poem-lines';
            // 動態縮小字體 (需過濾掉 HTML 標籤)
            const l2Len = l2Text.replace(/<[^>]*>/g, '').length;
            this.adjustFontSize(l2Div, l2Len, 7, 2.5);
            l2Div.innerHTML = l2Text;
            qDiv.appendChild(l2Div);

            // 詩詞名稱最多顯示 8 字（避免在 fm-sub-header 右側與左邊紅心重疊）
            let title = this.currentPoem.title;
            if (title.length > 8) {
                title = title.substring(0, 8) + "…";
            }
            const infoText = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            const infoEl = document.getElementById('game1-poem-info');
            infoEl.textContent = infoText;
            infoEl.dataset.poemId = this.currentPoem.id;
            //this.adjustFontSize(infoEl, infoText.length, 20, 1.0); //取消，若詩詞資料過長，改以刪減詩詞名稱字數替代

            // 渲染選項
            this.renderOptions();
        },

        // 產生本題的四個選項資料（1 個正解 + 3 個干擾項），每個選項都套用與正解
        // 相同的遮罩位置樣式（讓玩家比對「遮罩後外觀」而非直接看到完整句子）。
        // 干擾項優先透過 SharedDecoy 取得相似字，並在 POEMS 中搜尋長度相同、相似度高的句子；
        // 若仍不足 4 個，則隨機補足。
        generateOptionsData: function (correct, masked) {
            const correctClean = correct.replace(/[，。？！、：；]/g, ''); // 正解去除標點後的純文字
            const lineLen = correctClean.length; // 正解句子的字數（不含標點），用來篩選長度相同的干擾句
            const poemType = this.currentPoem.type || "";

            // 取得遮罩模式
            // 內部函式：比對原句與遮罩後文字，回傳一個布林陣列，
            // true 代表該位置在遮罩後仍為原字（未被蓋住），false 代表被遮罩（顯示◎）
            const getMaskPattern = (original, maskedText) => {
                let p = [];
                for (let i = 0; i < original.length; i++) {
                    p.push(maskedText[i] === "◎");
                }
                return p;
            };
            const pattern = getMaskPattern(correct, masked);

            // 選取顯示反向遮罩的字
            // 內部函式：將任一候選句子（干擾句或正解）依正解的遮罩位置樣式（pattern）套用遮罩，
            // 使每個選項按鈕呈現出與題目相同的「部分字被◎遮住」外觀
            const applyOptionMask = (targetLine, isCorrect = false) => {
                const targetClean = targetLine.replace(/[，。？！、：；]/g, '');
                const correctStructure = correct;

                let result = "";
                let cleanIdx = 0;
                for (let i = 0; i < correctStructure.length; i++) {
                    const isPunct = /[，。？！、：；]/.test(correctStructure[i]);
                    if (isPunct) {
                        result += correctStructure[i];
                    } else if (cleanIdx < targetClean.length) {
                        result += pattern[i] ? targetClean[cleanIdx] : "◎";
                        cleanIdx++;
                    }
                }
                return result;
            };

            const correctText = applyOptionMask(correct, true);
            let finalOptions = [{ text: correctText, isCorrect: true }];
            let usedLines = [correct];
            let usedTexts = new Set([correctText]);

            // 使用 SharedDecoy（共用干擾字模組）產生一批「形似字」，
            // 再從 POEMS 全庫中搜尋長度相同、與正解字元重疊度高的句子作為干擾項候選
            if (window.SharedDecoy) {
                const targetChars = correctClean.split('');
                const minRating = this.difficultySettings[this.difficulty].poemMinRating || 4;
                const distractorPool = window.SharedDecoy.getDecoyChars(targetChars, 20, [], minRating);

                // 嘗試從 POEMS 中尋找相似句
                let candidates = [];
                const searchPool = POEMS.filter(p => (p.rating || 0) >= minRating && p.id !== this.currentPoem.id);

                for (const p of searchPool) {
                    for (const line of p.content) {
                        const clean = line.replace(/[，。？！、：；]/g, '');
                        if (clean.length === lineLen && !usedLines.includes(line)) {
                            // 計算相似度
                            let similarity = 0;
                            for (const char of clean) {
                                if (distractorPool.includes(char)) similarity++;
                                if (targetChars.includes(char)) similarity += 2;
                            }
                            if (similarity > 0) {
                                candidates.push({ line, similarity });
                            }
                        }
                    }
                }

                // 優先選擇相似度高的句子
                candidates.sort((a, b) => b.similarity - a.similarity);

                for (let i = 0; i < candidates.length; i++) {
                    if (finalOptions.length >= 4) break;
                    const decoyLine = candidates[i].line;
                    const maskedText = applyOptionMask(decoyLine);
                    if (!usedTexts.has(maskedText)) {
                        finalOptions.push({ text: maskedText, isCorrect: false });
                        usedLines.push(decoyLine);
                        usedTexts.add(maskedText);
                    }
                }
            }

            // 如果不夠 4 個，從全體詩詞中隨機抽句補足（最多嘗試 200 次以避免無窮迴圈）
            let attempts = 0;
            while (finalOptions.length < 4 && attempts < 200) {
                attempts++;
                const rndPoem = POEMS[Math.floor(Math.random() * POEMS.length)];
                if (!rndPoem || !rndPoem.content) continue;
                const rndLine = rndPoem.content[Math.floor(Math.random() * rndPoem.content.length)];
                const clean = rndLine.replace(/[，。？！、：；]/g, '');

                // 嘗試找長度相同且未被選中的句子
                if ((clean.length === lineLen || attempts > 150) && !usedLines.includes(rndLine)) {
                    const maskedText = applyOptionMask(rndLine);
                    if (!usedTexts.has(maskedText)) {
                        finalOptions.push({ text: maskedText, isCorrect: false });
                        usedLines.push(rndLine);
                        usedTexts.add(maskedText);
                    }
                }
            }

            // 洗牌：打亂選項順序，避免正解永遠出現在固定位置
            finalOptions.sort(() => Math.random() - 0.5);
            this.currentOptions = finalOptions;
        },

        // 將 currentOptions 中的每個選項渲染成可點擊按鈕，並套用進場動畫與點擊事件
        renderOptions: function () {
            // 渲染
            const optDiv = document.getElementById('game1-answer-grid');
            optDiv.innerHTML = '';

            // 每次生成選項時重置 SVG 大小
            setTimeout(() => this.updateTimerRing(1), 0);

            const N = this.currentOptions.length;
            this.currentOptions.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.className = 'game1-option-btn';
                btn.textContent = opt.text;
                // 動態縮小字體
                this.adjustFontSize(btn, opt.text.length, 7, 2.0);
                btn.dataset.isCorrect = opt.isCorrect; // 標記是否正確
                // ⚠️ 出場動畫：所有卡片的啟動時機都被壓進 0~0.5 秒之間
                //   （不管幾片，第一片延遲 0、最後一片延遲 0.5s；中間平均分布）
                //   每片動畫本身仍為 0.5s，從中心點同時向上/向下放大（scaleY 0.1→1）
                btn.classList.add('game1-option-appear');
                const delay = (N > 1) ? (i / (N - 1)) * 0.5 : 0;
                btn.style.animationDelay = delay.toFixed(3) + 's';
                btn.addEventListener('click', () => {
                    if (window.SoundManager) {
                        if (opt.isCorrect) window.SoundManager.playSuccess();
                        else window.SoundManager.playFailure();
                    }
                    this.handleChoice(opt.isCorrect, btn);
                });
                optDiv.appendChild(btn);
            });
        },

        // 啟動倒數計時：每 100ms 更新一次計時環，時間歸零則判定本題失敗（時間到）
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);

                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    clearInterval(this.timerInterval);
                    this.mistakeCount++;
                    this.updateHearts();
                    // 取消揭曉答案
                    //this.revealAnswer(false);
                    // 延遲顯示結束
                    setTimeout(() => {
                        this.gameOver(false, "時間到！");
                    }, 1500);
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 100);
        },

        /**
         * 讀取計時框的基準色。
         * 來源：theme_xuanzhi.css 的 --fm-timer-* 變數（計時色集中管理，不再寫死於各遊戲）。
         * 解析成 { h, s, l } 供 updateTimerRing 使用；解析失敗時回退到 fallback，
         * 確保即使主題未載入或變數異常，計時框仍有可見顏色。
         * 與 scoreManager.js 的 getStarBaseColor() 同一套「以 CSS 變數為基準色」的做法。
         */
        getTimerBaseColor: function (varName, fallback) {
            try {
                const raw = getComputedStyle(document.documentElement)
                    .getPropertyValue(varName).trim();
                // 支援 hsl()/hsla() 形式，例如 hsl(0, 90%, 50%)
                const m = raw.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
                if (m) {
                    return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
                }
            } catch (e) {
                /* 忽略解析錯誤，改用後備色 */
            }
            return fallback;
        },

        // 依剩餘時間比例（ratio, 0~1）更新 SVG 計時環的長度與顏色。
        // mode='win' 時改為播放「答對後」的黃色收尾動畫；否則為一般倒數計時（暗紅→鮮紅）。
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game1-timer-path');
            const container = document.getElementById('game1-answer-grid-container');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;

            // 更新 SVG 大小
            const svg = document.getElementById('game1-timer-ring');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            // ⚠️ Timer rect 對齊三層結構的最外圈：rect x=5 y=5，stroke-width=10
            //   → stroke 中心線於 (5, 5) 位置，向外 5px + 向內 5px = 覆蓋 0~10 這一圈
            //   → 剛好落在 container 外緣 10px 帶狀區
            const rw = w - 10;
            const rh = h - 10;
            if (rw < 0 || rh < 0) return;

            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);

            const perimeter = (rw + rh) * 2;
            rect.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
                // 二段 dasharray：[剩餘*P, 消逝*P]，dashoffset=剩餘*P
                // → 可見弧段 = 路徑的「消逝%→100%」區段（正確接在紅色之後）
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease'; // dashoffset/dasharray 立即更新，僅顏色過渡
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                // 色相／飽和度取自主題金黃 --fm-timer-gold；亮度隨剩餘比例 clamped 掃動（base.l-15 → base.l+5），
                // 作為動畫的明暗變化維度，並以 25 為亮度保底避免主題值過暗時變黑。
                const base = this.getTimerBaseColor('--fm-timer-gold', { h: 40, s: 66, l: 45 });
                const lum = Math.max(25, Math.round(base.l - 15 + 20 * clamped));
                rect.style.stroke = `hsl(${base.h}, ${base.s}%, ${lum}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                rect.style.transition = ''; // 恢復 CSS 定義的過渡效果
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 色相／飽和度／亮度取自主題朱紅 --fm-timer-red；透明度隨消逝比例 elapsed 掃動（5% → 50%），
                // 作為「暗紅→鮮紅」的漸強維度。
                const base = this.getTimerBaseColor('--fm-timer-red', { h: 0, s: 90, l: 50 });
                const alpha = Math.round(5 + 45 * elapsed);
                rect.style.stroke = `hsla(${base.h}, ${base.s}%, ${base.l}%, ${alpha}%)`;
            }
        },

        // 揭曉正確答案：將標記為正確的按鈕加上 hint 樣式並停用所有按鈕（目前呼叫點已被註解停用）
        revealAnswer: function (isWin) {
            const btns = document.querySelectorAll('#game1-answer-grid .game1-option-btn');
            btns.forEach(btn => {
                const isCorrect = btn.dataset.isCorrect === 'true';
                if (isCorrect) btn.classList.add('hint');
                btn.disabled = true;
            });
        },

        // 處理玩家點擊選項按鈕：
        // 答對 → 停止計時、將題目中的遮罩字揭曉為正確文字、播放得分動畫，動畫完成後進入下一步；
        // 答錯 → 標記該按鈕為錯誤、扣血（updateHearts），錯誤次數達上限則判定遊戲失敗。
        handleChoice: function (isCorrect, btn) {
            if (!this.isActive) return;

            if (isCorrect) {
                btn.classList.add('correct');
                clearInterval(this.timerInterval);

                // 答對之後將題目中的 ◎ 改成綠色的正確文字
                const qDiv = document.getElementById('game1-question-lines');
                const lines = qDiv.querySelectorAll('.game1-poem-lines');
                const targetLineIdx = this.hideFirst ? 0 : 1;
                const targetLineEl = lines[targetLineIdx];

                // 直接根據 maskedIndices 重新渲染該行
                targetLineEl.innerHTML = this.correctAnswer.split('').map((c, i) => {
                    if (this.maskedIndices.includes(i)) {
                        return `<span class="correct-char">${c}</span>`;
                    }
                    return c;
                }).join('');

                document.getElementById('game1-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game1-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game1',
                    timerContainerId: 'game1-answer-grid-container',
                    scoreElementId: 'game1-score',
                    heartsSelector: '#game1-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        // 勝利時，第二參數請留空白，會自動帶入分數參數，副標題只顯示得分，不顯示情緒文字。
                        this.gameOver(true, '');
                    }
                });
            } else {
                if (btn.classList.contains('wrong')) return;
                btn.classList.add('wrong');
                this.mistakeCount++;
                //this.updateLives();
                this.updateHearts();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    clearInterval(this.timerInterval);

                    // 取消揭曉答案：將正確答案以 .hint 顯示
                    //this.revealAnswer(false);

                    setTimeout(() => {
                        this.gameOver(false, "失誤過多！");
                    }, 1000);
                }
            }
        },

        // （目前未被呼叫的舊版生命顯示邏輯，以文字方式呈現愛心，已由 renderHearts/updateHearts 取代）
        updateLives: function () {
            const livesSpan = document.getElementById('game1-lives');
            livesSpan.textContent = "♥".repeat(this.maxMistakeCount - this.mistakeCount) + "♡".repeat(this.mistakeCount);
        },
        // 依目前難度的最大錯誤次數，重新產生對應數量的紅心圖示（新局／換難度時呼叫）
        renderHearts: function () {
            const hearts = document.getElementById('game1-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.difficultySettings[this.difficulty].maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        // 依目前已答錯次數（mistakeCount），將對應數量的紅心切換為「空心」狀態
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game1-hearts .fm-heart');
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
        // 本局結束處理（勝利或失敗皆會呼叫）：
        // 失敗時透過 SupabaseClient 記錄本局遊玩紀錄；勝利的紀錄則由 ScoreManager.saveScore 負責。
        // 接著依勝負決定按鈕禁用狀態，並顯示結算訊息視窗；若為關卡模式過關，
        // 會先呼叫 completeLevel 判斷是否解鎖成就，再顯示結算視窗。
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
                    gameNo: 1,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game1-retryGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
                document.getElementById('game1-newGame-btn').disabled = true;//必須在得分表演之前就先禁用重來按鈕，避免答對又洗分數
            } else {
                document.getElementById('game1-retryGame-btn').disabled = false;
                document.getElementById('game1-newGame-btn').disabled = false;
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
                        score: win ? this.score : 0, // ScoreManager 播放動畫時已更新過 this.score，這裡直接讀取本地變數即可
                        reason: win ? "" : reason,
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            if (win && this.isLevelMode && window.ScoreManager) {
                const achId = window.ScoreManager.completeLevel('game1', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game1', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        },

        // 依文字長度動態縮小字型：字數超過 threshold 時等比例縮小字型（避免超長句子溢出容器），
        // 否則維持基準字級 baseFontSizeRem（單位為 rem，換算成 px 時乘以 20）。
        adjustFontSize: function (element, textLen, threshold, baseFontSizeRem) {
            if (textLen > threshold) {
                const newSize = baseFontSizeRem * (threshold / textLen);
                element.style.fontSize = `${(newSize) * 20}px`;
            } else {
                element.style.fontSize = `${(baseFontSizeRem) * 20}px`;
            }
        }
    };

    window.Game1 = Game1;

    // 自動檢查是否需要啟動 (從 URL 參數)
    if (new URLSearchParams(window.location.search).get('game') === '1') {
        setTimeout(() => {
            if (window.Game1) window.Game1.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
