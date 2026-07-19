(function () {
    // ============================================================
    // 遊戲二十：丟三落一 (Missing from the Sequence)
    // 從詩詞中截取 2~3 句，隱藏其中一句，玩家從 4~7 個完整詩句選項中
    // 選出正確的那一句填回缺位。
    // 三種出題格式：
    //   A：兩句格式 — 顯示第 2 句，隱藏第 1 句（猜前句）
    //   B：三句格式 — 顯示第 1+2 句，隱藏第 3 句（猜後句）
    //   C：三句格式 — 顯示第 3+4 句，隱藏第 2 句（猜中句／逆推）
    // ============================================================
    const Game20 = {
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
        maxMistakeCount: 4,

        // ---- 題目資料 ----
        currentPoem: null,
        currentFormat: 'A',        // 本題實際使用的格式
        visibleLines: [],          // 可見句的原始文字（含標點）
        visibleMaskedHTML: [],     // 可見句帶遮罩 ◎ 的 HTML
        hiddenLine: '',            // 正解（含標點）
        hiddenPosition: 'top',     // 'top' | 'bottom' | 'middle'
        currentOptions: [],        // 答案選項陣列 {text, isCorrect}

        // ---- DOM 參考 ----
        container: null,
        gameArea: null,
        gameStartTime: null,

        // ---- 難度設定 ----
        // timeLimit: 時間限制（秒）
        // poemMinRating: 最低詩詞評分
        // maxMistakeCount: 最大錯誤次數
        // formats: 可用的出題格式陣列（隨機抽取其一）'A'、'B'、'C'
        // A: 2 句即可（顯示第 1 句、隱藏 1 句）
        // B: 3 句（顯示 2 句、隱藏 1 句）
        // C: 4 句（顯示後 2 句、隱藏第 2 句，第 1 句不顯示但需做為錨點）
        // minMaskCount / maxMaskCount: 可見句的字元遮罩數量
        // optionCount: 答案選項總數
        difficultySettings: {
            '小學': { timeLimit: 30, poemMinRating: 6, maxMistakeCount: 3, formats: ['A'], minMaskCount: 0, maxMaskCount: 0, optionCount: 4 },
            '中學': { timeLimit: 25, poemMinRating: 5, maxMistakeCount: 3, formats: ['A', 'B'], minMaskCount: 0, maxMaskCount: 2, optionCount: 5 },
            '高中': { timeLimit: 20, poemMinRating: 4, maxMistakeCount: 2, formats: ['B'], minMaskCount: 1, maxMaskCount: 4, optionCount: 6 },
            '大學': { timeLimit: 15, poemMinRating: 3, maxMistakeCount: 2, formats: ['B', 'C'], minMaskCount: 3, maxMaskCount: 5, optionCount: 7 },
            '研究所': { timeLimit: 10, poemMinRating: 3, maxMistakeCount: 1, formats: ['B', 'C'], minMaskCount: 4, maxMaskCount: 6, optionCount: 8 }
        },

        // ------------------------------------------------------------
        // CSS 載入防護 — 避免在非 index.html 環境下 CSS 失效
        // ------------------------------------------------------------
        loadCSS: function () {
            if (!document.getElementById('game20-css')) {
                const link = document.createElement('link');
                link.id = 'game20-css';
                link.rel = 'stylesheet';
                link.href = 'game20.css';
                document.head.appendChild(link);
            }
        },

        // ------------------------------------------------------------
        // 初始化：建立 DOM、綁定按鈕事件
        // ------------------------------------------------------------
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game20-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game20-container');
            this.gameArea = document.getElementById('game20-area');

            // 控制按鈕
            document.getElementById('game20-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game20-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game20-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        // ------------------------------------------------------------
        // 建立 DOM 結構並掛載至 document.body
        // 注意：必須掛 body 而非 #stage，避免 transform 雙重縮放
        // ------------------------------------------------------------
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game20-container';
            // game20-overlay 保留為本遊戲私有 hook；fm-overlay 承載共用米色宣紙外觀（詳見 theme_xuanzhi.css）
            div.className = 'game20-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game20-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game20-diff-tag" data-level="小學">小學</button>
                        <button id="game20-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game20-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game20-hearts" class="fm-hearts"></div>
                    <div id="game20-poem-info" class="fm-poem-info"></div>
                </div>
                <div id="game20-area" class="game20-area">
                    <!-- 題目區：依出題格式動態顯示 1-2 句可見句 + 隱藏佔位欄 -->
                    <div class="game20-question-area">
                        <div id="game20-question-lines" class="game20-question-lines">
                            <!-- 由 renderChallenge() 注入 -->
                        </div>
                    </div>

                    <!-- 答案區：SVG 計時邊框 + 縱向選項網格 -->
                    <div class="game20-answer-area">
                        <div id="game20-answer-grid-container" class="game20-answer-grid-container">
                            <svg id="game20-timer-ring" class="fm-timer-ring">
                                <rect id="game20-timer-path" class="fm-timer-path" x="4" y="4"></rect>
                            </svg>
                            <div id="game20-answer-grid" class="game20-answer-grid">
                                <!-- 由 renderOptions() 注入 -->
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

            // 跟隨 stage 等比縮放
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

        // ------------------------------------------------------------
        // 對外入口：顯示遊戲（先彈出難度選擇器）
        // ------------------------------------------------------------
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('丟三落一', (selectedLevel, levelIndex) => {
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
                    this.startNewGame();
                });
            } else {
                // 降級處理
                this.container.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                document.body.classList.add('overlay-active');
                this.startNewGame();
            }
        },

        // ------------------------------------------------------------
        // 更新難度標籤與按鈕：關卡模式隱藏「開新局」
        // ------------------------------------------------------------
        updateUIForMode: function () {
            const diffTag = document.getElementById('game20-diff-tag');
            const retryBtn = document.getElementById('game20-retryGame-btn');
            const newBtn = document.getElementById('game20-newGame-btn');
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
        },

        hideOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = 'none';
        },

        showOtherContents: function () {
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) cardContainer.style.display = '';
        },

        // ------------------------------------------------------------
        // 停止遊戲：必須在此隱藏 overlay（menu.js 全域清理只呼叫 stopGame）
        // ------------------------------------------------------------
        stopGame: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            this.showOtherContents();
        },

        // ------------------------------------------------------------
        // 重來：沿用同一題重新計分
        // ------------------------------------------------------------
        retryGame: function () {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (!this.currentPoem) return;
            this.isActive = true;
            this.score = 0;
            this.mistakeCount = 0;
            this.gameStartTime = Date.now();
            this.renderHearts();
            document.getElementById('game20-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            // ⚠️ 重來時把選項重新洗牌，避免玩家靠「上次答錯按鈕的位置」直接排除
            if (this.currentOptions && this.currentOptions.length) {
                this.shuffleInPlace(this.currentOptions);
            }
            this.renderChallenge();
            this.startTimer();
            document.getElementById('game20-retryGame-btn').disabled = false;
            document.getElementById('game20-newGame-btn').disabled = false;
        },

        // ------------------------------------------------------------
        // 開新局：抽取新題目
        // ------------------------------------------------------------
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
            document.getElementById('game20-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            this.gameStartTime = Date.now();

            this.prepareChallenge();
            this.startTimer();
            document.getElementById('game20-retryGame-btn').disabled = false;
            document.getElementById('game20-newGame-btn').disabled = false;
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // ------------------------------------------------------------
        // 題目準備：抽詩、決定格式、生成可見句遮罩、生成干擾選項
        // ------------------------------------------------------------
        prepareChallenge: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return;

            const settings = this.difficultySettings[this.difficulty];

            // 隨機選擇本局的出題格式（從難度允許的格式中抽一個）
            const formats = settings.formats;
            this.currentFormat = formats[Math.floor(Math.random() * formats.length)];

            // 不同格式所需的最少行數
            // A: 2 句即可（顯示第 1 句、隱藏 1 句）
            // B: 3 句（顯示 2 句、隱藏 1 句）
            // C: 4 句（顯示後 2 句、隱藏第 2 句，第 1 句不顯示但需做為錨點）
            const needLines = (this.currentFormat === 'A') ? 2
                : (this.currentFormat === 'B') ? 3
                    : 4;

            // 共用題庫選取，融入 gameKey 確保不同遊戲同關卡題目不同
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                needLines, Math.max(needLines, 6), 8, 60, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game20'
            );
            if (!result) {
                alert('找不到符合評分的詩詞。');
                return;
            }
            this.currentPoem = result.poem;
            const content = result.poem.content;
            const startIdx = result.startIndex;

            // 依格式抽取對應位置的句子
            // 注意：getSharedRandomPoem 已保證 startIdx 起始為奇數句（1-based）
            let visibleLines, hiddenLine, hiddenPosition;
            if (this.currentFormat === 'A') {
                // 格式 A：顯示偶數句（line2），隱藏奇數句（line1）
                hiddenLine = content[startIdx];
                visibleLines = [content[startIdx + 1]];
                hiddenPosition = 'top'; // 隱藏句在可見句上方
            } else if (this.currentFormat === 'B') {
                // 格式 B：顯示 line1+line2，隱藏 line3
                visibleLines = [content[startIdx], content[startIdx + 1]];
                hiddenLine = content[startIdx + 2];
                hiddenPosition = 'bottom';
            } else {
                // 格式 C：顯示 line3+line4，隱藏 line2（夾在 line1 與 line3 之間）
                // line1 不顯示，僅作為詩意錨點
                visibleLines = [content[startIdx + 2], content[startIdx + 3]];
                hiddenLine = content[startIdx + 1];
                hiddenPosition = 'middle'; // 視覺上夾在兩可見句中間
            }
            this.visibleLines = visibleLines;
            this.hiddenLine = hiddenLine;
            this.hiddenPosition = hiddenPosition;

            // 對每一句可見句施加局部字元遮罩
            this.visibleMaskedHTML = visibleLines.map(line =>
                this.applyVisibleMask(line, settings.minMaskCount, settings.maxMaskCount)
            );

            // 生成答案選項（含正解 + 干擾項）
            this.generateOptions(hiddenLine, settings.optionCount, settings.poemMinRating);

            this.renderChallenge();
        },

        // ------------------------------------------------------------
        // 對可見句施加遮罩：隨機選擇若干非標點字元替換為 ◎
        // 回傳含 <span class="hidden-char"> 的 HTML 字串
        // ------------------------------------------------------------
        applyVisibleMask: function (line, minCount, maxCount) {
            const chars = line.split('');
            const validIndices = [];
            chars.forEach((c, i) => {
                if (!/[，。？！、：；]/.test(c)) validIndices.push(i);
            });
            const poemLen = validIndices.length;
            if (maxCount <= 0 || poemLen === 0) {
                return chars.join('');
            }
            // 保底：每句至少留 1 字不遮蔽
            const maxPossible = Math.max(0, poemLen - 1);
            const actualMin = Math.min(maxPossible, Math.max(0, minCount));
            const actualMax = Math.min(maxPossible, Math.max(actualMin, maxCount));
            const maskCount = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
            if (maskCount <= 0) return chars.join('');

            // ── 遮蔽位置規格（依詩句字數與遮蔽字數決定可用樣式，再隨機挑一） ──
            // 樣式以「字位索引 0..poemLen-1」表示，最後透過 validIndices 還原為原字串索引。
            const range = (s, e) => { const a = []; for (let i = s; i < e; i++) a.push(i); return a; };
            const patterns = [];

            switch (maskCount) {
                case 1:
                    patterns.push([0]);
                    patterns.push([poemLen - 1]);
                    break;
                case 2:
                    if (poemLen === 5) { patterns.push([0, 1]); patterns.push([3, 4]); }
                    else if (poemLen === 7) { patterns.push([0, 1]); patterns.push([2, 3]); }
                    else { patterns.push(range(0, 2)); patterns.push(range(poemLen - 2, poemLen)); }
                    break;
                case 3:
                    if (poemLen === 5) { patterns.push([0, 1, 2]); patterns.push([2, 3, 4]); }
                    else if (poemLen === 7) { patterns.push([4, 5, 6]); }
                    else { patterns.push(range(0, 3)); patterns.push(range(poemLen - 3, poemLen)); }
                    break;
                case 4:
                    if (poemLen === 5) { patterns.push([0, 1, 2, 3]); patterns.push([1, 2, 3, 4]); }
                    else if (poemLen === 7) { patterns.push([0, 1, 2, 3]); }
                    else { patterns.push(range(0, 4)); patterns.push(range(poemLen - 4, poemLen)); }
                    break;
                case 5:
                    // 五言只有 5 字，最多遮 4（至少留 1）
                    if (poemLen === 5) { patterns.push([0, 1, 2, 3]); patterns.push([1, 2, 3, 4]); }
                    else if (poemLen === 7) { patterns.push([0, 1, 2, 3]); patterns.push([2, 3, 4, 5, 6]); }
                    else { patterns.push(range(0, 5)); patterns.push(range(poemLen - 5, poemLen)); }
                    break;
                case 6:
                    if (poemLen === 5) { patterns.push([0, 1, 2, 3]); patterns.push([1, 2, 3, 4]); }
                    else if (poemLen === 7) { patterns.push([0, 1, 2, 3, 4, 5]); patterns.push([1, 2, 3, 4, 5, 6]); }
                    else { patterns.push(range(0, 6)); patterns.push(range(poemLen - 6, poemLen)); }
                    break;
                default:
                    // 規格外（>6）：fallback 為前 N 或後 N
                    patterns.push(range(0, Math.min(maskCount, maxPossible)));
                    patterns.push(range(Math.max(0, poemLen - maskCount), poemLen));
            }

            // 過濾：避免越界、避免遮到整句（須留 1 字以上）
            const valid = patterns
                .map(p => p.filter(i => i >= 0 && i < poemLen))
                .filter(p => p.length > 0 && p.length <= maxPossible);
            if (valid.length === 0) return chars.join('');

            const pick = valid[Math.floor(Math.random() * valid.length)];
            const maskedSet = new Set(pick.map(pi => validIndices[pi]));
            // data-char 保留原字，供勝利時 revealMaskedChars() 一鍵揭曉
            return chars.map((c, i) =>
                maskedSet.has(i) ? `<span class="hidden-char" data-char="${c}">－</span>` : c
            ).join('');
        },

        // ------------------------------------------------------------
        // 干擾選項生成：
        //   優先級 ① 同首詩的其他句子（強干擾，字數需相同）
        //   優先級 ② 同朝代且字數相同的詩句
        //   優先級 ③ 任意字數相同的詩句
        //   全部排除：詩中本來就出現過的可見句、正解本身
        // ------------------------------------------------------------
        generateOptions: function (correctLine, optionCount, minRating) {
            const targetLen = correctLine.replace(/[，。？！、：；]/g, '').length;
            const used = new Set([correctLine]);
            // 排除題目中已可見的句子
            this.visibleLines.forEach(l => used.add(l));

            const options = [{ text: correctLine, isCorrect: true }];

            // 共用：把候選句加入選項池
            const tryAdd = (line) => {
                if (options.length >= optionCount) return;
                if (used.has(line)) return;
                const clean = line.replace(/[，。？！、：；]/g, '');
                if (clean.length !== targetLen) return;
                options.push({ text: line, isCorrect: false });
                used.add(line);
            };

            // ① 同首詩
            const samePoem = this.currentPoem.content || [];
            samePoem.forEach(tryAdd);

            // ② 同朝代或同作者
            if (options.length < optionCount) {
                const dynasty = this.currentPoem.dynasty;
                const sameDynasty = POEMS.filter(p =>
                    p.id !== this.currentPoem.id &&
                    p.dynasty === dynasty &&
                    (p.rating || 0) >= minRating
                );
                this.shuffleInPlace(sameDynasty);
                outer:
                for (const p of sameDynasty) {
                    for (const l of (p.content || [])) {
                        tryAdd(l);
                        if (options.length >= optionCount) break outer;
                    }
                }
            }

            // ③ 全題庫遍歷補滿
            if (options.length < optionCount) {
                const pool = POEMS.filter(p =>
                    p.id !== this.currentPoem.id &&
                    (p.rating || 0) >= Math.max(1, minRating - 2)
                );
                this.shuffleInPlace(pool);
                outer:
                for (const p of pool) {
                    for (const l of (p.content || [])) {
                        tryAdd(l);
                        if (options.length >= optionCount) break outer;
                    }
                }
            }

            // ④ 最後保底：放寬字數限制
            let safety = 0;
            while (options.length < optionCount && safety < 500) {
                safety++;
                const p = POEMS[Math.floor(Math.random() * POEMS.length)];
                if (!p || !p.content) continue;
                const l = p.content[Math.floor(Math.random() * p.content.length)];
                if (!used.has(l)) {
                    options.push({ text: l, isCorrect: false });
                    used.add(l);
                }
            }

            this.shuffleInPlace(options);
            this.currentOptions = options;
        },

        shuffleInPlace: function (arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
        },

        // ------------------------------------------------------------
        // 畫面渲染：題目區（含隱藏佔位欄）+ 詩詞資訊 + 選項
        // ------------------------------------------------------------
        renderChallenge: function () {
            const qDiv = document.getElementById('game20-question-lines');
            qDiv.innerHTML = '';

            // 依隱藏位置決定佔位欄與可見句的排列順序
            const slotHTML = this.buildSlotHTML();
            const visibleHTMLs = this.visibleMaskedHTML.map((html, i) =>
                this.buildVisibleLineHTML(html, this.visibleLines[i])
            );

            let lineNodes;
            if (this.hiddenPosition === 'top') {
                // A 格式：佔位欄在上，可見句 1 在下
                lineNodes = [slotHTML, visibleHTMLs[0]];
            } else if (this.hiddenPosition === 'bottom') {
                // B 格式：可見句 1, 2 在上，佔位欄在下
                lineNodes = [visibleHTMLs[0], visibleHTMLs[1], slotHTML];
            } else {
                // C 格式：佔位欄夾在兩可見句中間
                lineNodes = [visibleHTMLs[0], slotHTML, visibleHTMLs[1]];
            }
            qDiv.innerHTML = lineNodes.join('');

            // 詩詞資訊（顯示於 fm-sub-header 右側，最多 8 字避免與紅心重疊）
            let title = this.currentPoem.title;
            if (title.length > 8) title = title.substring(0, 8) + "…";
            const infoText = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            const infoEl = document.getElementById('game20-poem-info');
            infoEl.textContent = infoText;
            infoEl.dataset.poemId = this.currentPoem.id;
            infoEl.onclick = () => {
                if (window.PoemDialog && this.currentPoem) {
                    window.PoemDialog.openById(this.currentPoem.id);
                }
            };

            this.renderOptions();
        },

        // 建立可見句的 div（依字數自動調整字級）
        buildVisibleLineHTML: function (maskedHTML, originalLine) {
            const cleanLen = originalLine.replace(/[，。？！、：；]/g, '').length;
            // 字級：5字→32px, 7字→26px, 更長則自動縮
            const baseSize = 50;
            const threshold = 7;
            const size = cleanLen > threshold
                ? Math.max(50, Math.floor(baseSize * threshold / cleanLen))
                : baseSize;
            return `<div class="game20-poem-line" style="font-size:${size}px;">${maskedHTML}</div>`;
        },

        // 建立隱藏佔位欄
        buildSlotHTML: function () {
            const hint = this.hiddenPosition === 'top' ? '↑ 猜這一句'
                : this.hiddenPosition === 'bottom' ? '↓ 猜這一句'
                    : '？ 猜中間句';
            return `<div class="game20-hidden-slot" data-pos="${this.hiddenPosition}">
                        <span class="game20-slot-hint">${hint}</span>
                    </div>`;
        },

        renderOptions: function () {
            const grid = document.getElementById('game20-answer-grid');
            grid.innerHTML = '';
            // 重置 SVG 計時邊框大小
            setTimeout(() => this.updateTimerRing(1), 0);

            this.currentOptions.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'game20-option-btn';
                btn.textContent = opt.text;
                // 字級自動縮放：選項通常 7-10 字
                const len = opt.text.length;
                const fontSize = len <= 7 ? 40
                    : len <= 9 ? 34
                        : 28;
                btn.style.fontSize = fontSize + 'px';
                btn.dataset.isCorrect = opt.isCorrect;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) {
                        if (opt.isCorrect) window.SoundManager.playSuccess();
                        else window.SoundManager.playFailure();
                    }
                    this.handleChoice(opt.isCorrect, btn);
                });
                grid.appendChild(btn);
            });
        },

        // ------------------------------------------------------------
        // 計時器：與 game1 相同的 SVG 邊框倒數實作
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
                    clearInterval(this.timerInterval);
                    // 超時直接結束（揭曉正解後跳出結算）
                    this.hideChallengeOnLose();
                    setTimeout(() => {
                        this.gameOver(false, "時間到！");
                    }, 1500);
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
            const rect = document.getElementById('game20-timer-path');
            const container = document.getElementById('game20-answer-grid-container');
            if (!rect || !container) return;
            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = document.getElementById('game20-timer-ring');
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
                // 勝利動畫：黃色弧段順時針縮短
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
                // 正常倒數：暗紅→鮮紅（透明度掃動）
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                // 色相／飽和度／亮度取自主題朱紅 --fm-timer-red；透明度隨消逝比例掃動（5% → 50%）。
                const base = this.getTimerBaseColor('--fm-timer-red', { h: 0, s: 90, l: 50 });
                const alpha = Math.round(5 + 45 * elapsed);
                rect.style.stroke = `hsla(${base.h}, ${base.s}%, ${base.l}%, ${alpha}%)`;
            }
        },

        // ------------------------------------------------------------
        // 揭曉正解：超時時把佔位欄填入藍色高亮的正解
        // ------------------------------------------------------------
        // 失敗時的畫面處理：⚠️ 不劇透正解，但題目區與選項仍維持原樣
        //   - 隱藏欄維持灰色佔位框，不填入正解
        //   - 選項按鈕停用（不再可點），但不替正解加 .hint 高亮
        //   - 玩家點「重來」會由 retryGame 重新渲染同一題
        // ------------------------------------------------------------
        hideChallengeOnLose: function () {
            // 僅停用所有選項按鈕，不揭曉任何資訊
            document.querySelectorAll('#game20-answer-grid .game20-option-btn').forEach(b => {
                b.disabled = true;
            });
        },

        // ------------------------------------------------------------
        // 選項判定：答對進入勝利動畫；答錯扣紅心
        // ------------------------------------------------------------
        handleChoice: function (isCorrect, btn) {
            if (!this.isActive) return;
            if (isCorrect) {
                btn.classList.add('correct');
                clearInterval(this.timerInterval);
                // 把佔位欄填入綠色正解
                const slot = document.querySelector('.game20-hidden-slot');
                if (slot) {
                    slot.innerHTML = `<span class="game20-slot-correct">${this.hiddenLine}</span>`;
                }
                // 揭曉題目中被遮蔽的字（用不同顏色與原本顯示的字區別）
                document.querySelectorAll('#game20-question-lines .hidden-char').forEach(el => {
                    const ch = el.getAttribute('data-char');
                    if (ch) {
                        el.textContent = ch;
                        el.classList.add('game20-revealed-char');
                    }
                });
                // 通關前先禁用按鈕，防止連點刷分
                document.getElementById('game20-retryGame-btn').disabled = true;
                document.getElementById('game20-newGame-btn').disabled = true;
                // 禁用所有選項
                document.querySelectorAll('#game20-answer-grid .game20-option-btn').forEach(b => b.disabled = true);

                ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game20',
                    timerContainerId: 'game20-answer-grid-container',
                    scoreElementId: 'game20-score',
                    heartsSelector: '#game20-hearts .fm-heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        this.gameOver(true, '');
                    }
                });
            } else {
                if (btn.classList.contains('wrong')) return;
                btn.classList.add('wrong');
                this.mistakeCount++;
                this.updateHearts();
                if (this.mistakeCount >= this.maxMistakeCount) {
                    clearInterval(this.timerInterval);
                    this.hideChallengeOnLose();
                    setTimeout(() => {
                        this.gameOver(false, "失誤過多！");
                    }, 1500);
                }
            }
        },

        // ------------------------------------------------------------
        // 紅心渲染與更新（依難度設定數量）
        // ------------------------------------------------------------
        renderHearts: function () {
            const hearts = document.getElementById('game20-hearts');
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
            const hearts = document.querySelectorAll('#game20-hearts .fm-heart');
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
        // 遊戲結算：勝利→關卡推進；失敗→記錄 LOG、可重試
        // ------------------------------------------------------------
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;

            // 失敗時補寫 game_logs；勝利時 ScoreManager.saveScore 會自動處理
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 20,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game20-retryGame-btn').disabled = true;
                document.getElementById('game20-newGame-btn').disabled = true;
            } else {
                document.getElementById('game20-retryGame-btn').disabled = false;
                document.getElementById('game20-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                if (win) {
                    // 關卡模式進下一關；自由模式換新題
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
                const achId = window.ScoreManager.completeLevel('game20', this.difficulty, this.currentLevelIndex);
                if (achId && window.AchievementDialog) {
                    window.AchievementDialog.showInstantAchievementPop(achId, 'game20', this.currentLevelIndex, showMessage);
                } else {
                    showMessage();
                }
            } else {
                showMessage();
            }
        }
    };

    window.Game20 = Game20;

    // URL 自動啟動：嚴格比對防止 game=2 與 game=20 衝突
    if (new URLSearchParams(window.location.search).get('game') === '20') {
        setTimeout(() => {
            if (window.Game20) window.Game20.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
