/* =========================================
   遊戲33：作者是誰 (Author-Verse Match)
   風格辨識訓練 — 螢幕中央顯示一句詩，玩家點擊正確詩人姓名
   ========================================= */
(function () {
    // 內建詩人朝代映射表（約 40 位常見詩人 / 詞人）
    // 未來可擴展為「同朝代同風格」分群（目前以朝代為主，註記 TODO）
    const AUTHOR_DYNASTY = {
        // 唐
        '李白': '唐', '杜甫': '唐', '王維': '唐', '孟浩然': '唐',
        '白居易': '唐', '李商隱': '唐', '杜牧': '唐', '王昌齡': '唐',
        '高適': '唐', '岑參': '唐', '韋應物': '唐', '柳宗元': '唐',
        '韓愈': '唐', '劉禹錫': '唐', '元稹': '唐', '李賀': '唐',
        '賀知章': '唐', '王勃': '唐', '張九齡': '唐', '陳子昂': '唐',
        // 宋
        '蘇軾': '宋', '李清照': '宋', '辛棄疾': '宋', '陸游': '宋',
        '王安石': '宋', '歐陽修': '宋', '范仲淹': '宋', '柳永': '宋',
        '楊萬里': '宋', '黃庭堅': '宋', '秦觀': '宋', '晏殊': '宋',
        '晏幾道': '宋', '周邦彥': '宋', '姜夔': '宋', '朱熹': '宋',
        '蘇轍': '宋', '文天祥': '宋',
        // 魏晉南北朝 / 漢
        '陶淵明': '晉', '曹操': '漢', '曹植': '漢',
        // 元明清
        '馬致遠': '元', '關漢卿': '元', '唐寅': '明', '于謙': '明',
        '納蘭性德': '清', '鄭板橋': '清', '龔自珍': '清'
    };

    // 依朝代分組（用於高中以上難度抽同朝代干擾項）
    const DYNASTY_GROUPS = {};
    Object.keys(AUTHOR_DYNASTY).forEach(name => {
        const dyn = AUTHOR_DYNASTY[name];
        if (!DYNASTY_GROUPS[dyn]) DYNASTY_GROUPS[dyn] = [];
        DYNASTY_GROUPS[dyn].push(name);
    });
    const ALL_AUTHORS = Object.keys(AUTHOR_DYNASTY);

    const Game33 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // --- 遊戲狀態 ---
        questions: [],          // 題目陣列：{ poem, verse, correctAuthor, candidates[] }
        currentQuestionIdx: 0,  // 當前題目索引
        combo: 0,               // 連擊數
        maxCombo: 0,            // 本局最高連擊
        locked: false,          // 答題後鎖定避免重複點

        // --- 計時器 ---
        timer: 0,
        timerInterval: null,
        startTime: 0,
        maxTimer: 0,
        gameStartTime: null,

        // 5 難度設定（依企劃書 §7）
        // timeLimitRate 每題秒數；questionCount 局內題數；candidateCount 候選詩人數
        // decoyType: crossDynasty / sameDynastyDiffStyle / sameDynastySameStyle / sameStyleWithFake
        // comboCap 連擊倍率封頂
        difficultySettings: {
            '小學': { timeLimitRate: 30, poemMinRating: 6, maxMistakeCount: 5, questionCount: 10, candidateCount: 4, decoyType: 'crossDynasty', comboCap: 2 },
            '中學': { timeLimitRate: 25, poemMinRating: 5, maxMistakeCount: 5, questionCount: 12, candidateCount: 4, decoyType: 'crossDynasty', comboCap: 3 },
            '高中': { timeLimitRate: 20, poemMinRating: 4, maxMistakeCount: 4, questionCount: 15, candidateCount: 6, decoyType: 'sameDynastyDiffStyle', comboCap: 3 },
            '大學': { timeLimitRate: 15, poemMinRating: 3, maxMistakeCount: 3, questionCount: 18, candidateCount: 8, decoyType: 'sameDynastySameStyle', comboCap: 5 },
            '研究所': { timeLimitRate: 10, poemMinRating: 3, maxMistakeCount: 3, questionCount: 20, candidateCount: 8, decoyType: 'sameStyleWithFake', comboCap: 10 }
        },

        // 動態載入本遊戲專屬 CSS（僅載入一次，避免重複插入 <link>）
        loadCSS: function () {
            if (!document.getElementById('game33-css')) {
                const link = document.createElement('link');
                link.id = 'game33-css';
                link.rel = 'stylesheet';
                link.href = 'game33.css';
                document.head.appendChild(link);
            }
        },

        // 初始化遊戲：載入 CSS 並建立（若尚未建立）遊戲主 DOM 容器
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game33-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game33-container');
        },

        // 建立遊戲畫面的 DOM 結構（標題列、計時外環、詩句卡、候選按鈕區等），並綁定按鈕事件
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game33-container';
            div.className = 'game33-overlay hidden';
            div.innerHTML = `
                <div class="game33-header">
                    <div class="game33-score-board">分數: <span id="game33-score">0</span></div>
                    <div class="game33-controls">
                        <button class="game33-difficulty-tag" id="game33-diff-tag">小學</button>
                        <button id="game33-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game33-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game33-sub-header">
                    <div id="game33-hearts" class="hearts"></div>
                    <div id="game33-combo" class="game33-combo">連擊 ×1</div>
                </div>
                <div class="game33-area">
                    <div class="game33-info">
                        <div id="game33-poem-info" class="poem-info"></div>
                        <div id="game33-progress-text" class="game33-progress-text"></div>
                    </div>
                    <div id="game33-game-wrapper" class="game33-game-wrapper">
                        <svg id="game33-timer-ring">
                            <rect id="game33-timer-path" x="3" y="3"></rect>
                        </svg>
                        <div class="game33-question-box">
                            <div class="game33-question-title">這句詩是誰寫的？</div>
                            <div id="game33-verse" class="game33-verse"></div>
                        </div>
                        <div id="game33-candidates" class="game33-candidates"></div>
                        <div id="game33-feedback" class="game33-feedback hidden"></div>
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

        // 對外進入點：初始化遊戲並顯示難度選擇畫面
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度／關卡選擇器；玩家選定後才正式開始新的一局
        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('作者是誰', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.SoundManager) window.SoundManager.init();
                    this.startNewGame();
                });
            }
        },

        // 依「自由難度模式」或「關卡挑戰模式」更新標題列的難度標籤與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game33-diff-tag');
            const retryBtn = document.getElementById('game33-retryGame-btn');
            const newBtn = document.getElementById('game33-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };

            if (this.isLevelMode) {
                if (diffTag) {
                    diffTag.textContent = `挑戰第 ${this.currentLevelIndex} 關`;
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'none';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            } else {
                if (diffTag) {
                    diffTag.textContent = this.difficulty;
                    diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                    diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
                }
                if (newBtn) newBtn.style.display = 'inline-block';
                if (retryBtn) retryBtn.style.display = 'inline-block';
            }
        },

        // 開啟本遊戲畫面前，先隱藏主選單卡片與其他遊戲的容器，避免畫面重疊
        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container', 'game8-container', 'game33-container'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        // 停止遊戲：清除計時器、隱藏本遊戲畫面並還原主選單卡片顯示（供全域清理呼叫）
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            // ⚠️ 必須隱藏 overlay：menu.js 全域清理只呼叫 stopGame()
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // 重玩本局：沿用已生成的題目陣列，重新開始計分與計時
        retryGame: function () {
            if (this.questions.length === 0) return;
            this.startGameProcess(true);
        },

        // 開始全新一局：可帶入 levelIndex 進入指定關卡（挑戰模式），否則依目前難度隨機出題
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            if (this.generateQuestions()) {
                this.startGameProcess(false);
            } else {
                alert('載入詩詞失敗。');
                this.stopGame();
            }
        },

        // 過關後推進至下一關卡編號，並開始新局
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 重置本局狀態（分數、失誤數、連擊、題號）並渲染第一題、啟動計時器
        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.mistakeCount = 0;
            this.combo = 0;
            this.maxCombo = 0;
            this.currentQuestionIdx = 0;
            this.locked = false;

            document.getElementById('game33-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            const settings = this.difficultySettings[this.difficulty];
            this.renderHearts();
            this.updateComboDisplay();

            // 顯示當前題目
            this.renderQuestion();

            document.getElementById('game33-retryGame-btn').disabled = false;
            document.getElementById('game33-newGame-btn').disabled = false;

            // 時限 = questionCount × timeLimitRate
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(settings.questionCount * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game33-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game33-timer-ring').style.display = 'none';
            }
        },

        // 生成本局所有題目 — 每題抽一首詩、隨機選一句（或對聯）、生成候選詩人
        generateQuestions: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error("需要先載入 script.js 中的 getSharedRandomPoem 函數");
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            this.questions = [];

            for (let q = 0; q < settings.questionCount; q++) {
                // 每題使用不同 seed 確保挑戰模式可重現但題目不同
                const seed = this.isLevelMode ? (this.currentLevelIndex * 100 + q) : null;
                // 抽 2~10 行、字數 5~56，最低 rating 由難度決定
                const result = getSharedRandomPoem(
                    settings.poemMinRating, 2, 10, 5, 56,
                    "", seed, 'game33_' + q
                );
                if (!result) continue;

                const poem = result.poem;
                const author = (poem.author || '').trim();
                if (!author) continue;

                // 隨機抽取一句（或一聯）做為題目
                const lines = result.lines;
                // 若行數 >= 2 隨機決定顯示「單句」或「兩句聯」
                const useTwoLines = (lines.length >= 2 && Math.random() < 0.6);
                let verseLines;
                if (useTwoLines) {
                    // 從偶數位置抽兩句連續對聯
                    const maxStart = lines.length - 2;
                    const startIdx = Math.floor(Math.random() * (maxStart + 1));
                    verseLines = [lines[startIdx], lines[startIdx + 1]];
                } else {
                    const idx = Math.floor(Math.random() * lines.length);
                    verseLines = [lines[idx]];
                }

                const candidates = this.generateDecoyAuthors(author, settings);

                this.questions.push({
                    poem: poem,
                    verseLines: verseLines,
                    correctAuthor: author,
                    candidates: candidates
                });
            }

            return this.questions.length > 0;
        },

        // 生成候選詩人陣列（含正確答案 + 干擾項）
        generateDecoyAuthors: function (correctAuthor, settings) {
            const count = settings.candidateCount;
            const decoyType = settings.decoyType;
            const correctDyn = AUTHOR_DYNASTY[correctAuthor] || null;

            let pool = [];
            if (decoyType === 'crossDynasty' || !correctDyn) {
                // 跨朝代：全池隨機
                pool = ALL_AUTHORS.filter(n => n !== correctAuthor);
            } else if (decoyType === 'sameDynastyDiffStyle') {
                // 同朝代不同風格（簡化：同朝代其他人）
                pool = (DYNASTY_GROUPS[correctDyn] || []).filter(n => n !== correctAuthor);
                // 不足則補跨朝代
                if (pool.length < count - 1) {
                    const extra = ALL_AUTHORS.filter(n => n !== correctAuthor && !pool.includes(n));
                    pool = pool.concat(extra);
                }
            } else if (decoyType === 'sameDynastySameStyle') {
                // 同朝代同風格（TODO: 未來擴展風格分群；目前同朝代隨機）
                pool = (DYNASTY_GROUPS[correctDyn] || []).filter(n => n !== correctAuthor);
                if (pool.length < count - 1) {
                    const extra = ALL_AUTHORS.filter(n => n !== correctAuthor && !pool.includes(n));
                    pool = pool.concat(extra);
                }
            } else if (decoyType === 'sameStyleWithFake') {
                // 同朝代同風格 + 1 位偽托（不同朝代的大家）
                pool = (DYNASTY_GROUPS[correctDyn] || []).filter(n => n !== correctAuthor);
                // 強制混入 1 位他朝代偽托
                const otherDynasties = Object.keys(DYNASTY_GROUPS).filter(d => d !== correctDyn);
                if (otherDynasties.length > 0) {
                    const fakeDyn = otherDynasties[Math.floor(Math.random() * otherDynasties.length)];
                    const fakeCandidates = DYNASTY_GROUPS[fakeDyn].filter(n => n !== correctAuthor);
                    if (fakeCandidates.length > 0) {
                        const fake = fakeCandidates[Math.floor(Math.random() * fakeCandidates.length)];
                        pool.unshift(fake); // 確保偽托進入
                    }
                }
                if (pool.length < count - 1) {
                    const extra = ALL_AUTHORS.filter(n => n !== correctAuthor && !pool.includes(n));
                    pool = pool.concat(extra);
                }
            }

            // 洗牌 + 取 (count - 1) 位干擾
            pool.sort(() => Math.random() - 0.5);
            const decoys = pool.slice(0, count - 1);

            // 與正確答案合併並洗牌
            const result = [correctAuthor, ...decoys];
            result.sort(() => Math.random() - 0.5);
            return result;
        },

        // 渲染當前題目的詩句與候選按鈕（同時重置出處顯示、進度文字與答題鎖定狀態）
        renderQuestion: function () {
            if (this.currentQuestionIdx >= this.questions.length) return;
            const q = this.questions[this.currentQuestionIdx];

            // 詩句卡（隱藏作者與標題避免暴露答案）
            const verseEl = document.getElementById('game33-verse');
            verseEl.innerHTML = q.verseLines.map(l => `<div class="game33-verse-line">${l}</div>`).join('');

            // 出處先隱藏，答完才顯示
            const infoEl = document.getElementById('game33-poem-info');
            infoEl.textContent = '出處：？？？';
            infoEl.onclick = null;
            infoEl.style.cursor = 'default';
            infoEl.style.textDecoration = 'none';

            // 進度
            const settings = this.difficultySettings[this.difficulty];
            document.getElementById('game33-progress-text').textContent =
                `第 ${this.currentQuestionIdx + 1} / ${settings.questionCount} 題`;

            // 候選按鈕
            const candWrap = document.getElementById('game33-candidates');
            candWrap.innerHTML = '';
            candWrap.classList.remove('cols-4', 'cols-6', 'cols-8');
            candWrap.classList.add('cols-' + q.candidates.length);
            q.candidates.forEach(name => {
                const btn = document.createElement('button');
                btn.className = 'game33-cand-btn';
                btn.textContent = name;
                btn.dataset.author = name;
                btn.onclick = () => this.handleSelect(name, btn);
                candWrap.appendChild(btn);
            });

            // 隱藏 feedback
            const fb = document.getElementById('game33-feedback');
            fb.classList.add('hidden');
            fb.textContent = '';

            this.locked = false;
        },

        // 玩家點擊候選詩人：判定對錯、更新分數與連擊、顯示詩詞出處，
        // 答對加分並累計連擊倍率；答錯扣心並標示正解，失誤達上限則結束遊戲；
        // 最後延遲 1 秒後自動進入下一題或結算本局
        handleSelect: function (selectedAuthor, btnEl) {
            if (!this.isActive || this.locked) return;
            this.locked = true;

            const q = this.questions[this.currentQuestionIdx];
            const isCorrect = (selectedAuthor === q.correctAuthor);

            // 顯示出處
            const infoEl = document.getElementById('game33-poem-info');
            infoEl.textContent = `${q.poem.title} / ${q.poem.dynasty} / ${q.poem.author}`;
            infoEl.style.cursor = 'pointer';
            infoEl.style.textDecoration = 'underline';
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(q.poem.id);
            };

            if (isCorrect) {
                btnEl.classList.add('correct');
                this.combo++;
                if (this.combo > this.maxCombo) this.maxCombo = this.combo;

                // 連擊倍率
                const settings = this.difficultySettings[this.difficulty];
                let multi = 1;
                if (this.combo >= 10) multi = 5;
                else if (this.combo >= 5) multi = 3;
                else if (this.combo >= 3) multi = 2;
                multi = Math.min(multi, settings.comboCap);

                const basePts = (window.ScoreManager && window.ScoreManager.gameSettings.game33)
                    ? window.ScoreManager.gameSettings.game33.getPointA : 50;
                const points = basePts * multi;
                this.score += points;
                document.getElementById('game33-score').textContent = this.score;

                this.updateComboDisplay();

                if (window.SoundManager) window.SoundManager.playSuccess();
            } else {
                btnEl.classList.add('wrong');
                this.combo = 0;
                this.updateComboDisplay();

                // 標示正確答案
                const allBtns = document.querySelectorAll('#game33-candidates .game33-cand-btn');
                allBtns.forEach(b => {
                    if (b.dataset.author === q.correctAuthor) {
                        b.classList.add('flash-correct');
                    }
                });

                // 底部提示
                const fb = document.getElementById('game33-feedback');
                fb.textContent = `這句其實是 ${q.correctAuthor} 寫的`;
                fb.classList.remove('hidden');

                this.mistakeCount++;
                this.updateHearts();

                if (window.SoundManager) window.SoundManager.playFailure();

                const maxM = this.difficultySettings[this.difficulty].maxMistakeCount;
                if (this.mistakeCount >= maxM) {
                    setTimeout(() => this.gameOver(false, '失誤過多'), 1000);
                    return;
                }
            }

            // 1 秒鎖定後進下一題
            setTimeout(() => {
                this.currentQuestionIdx++;
                if (this.currentQuestionIdx >= this.questions.length) {
                    this.gameOver(true, '');
                } else {
                    this.renderQuestion();
                }
            }, 1000);
        },

        // 更新畫面上的連擊顯示文字與倍率，連擊數達 3 以上時觸發彈出動畫特效
        updateComboDisplay: function () {
            const el = document.getElementById('game33-combo');
            if (!el) return;
            const settings = this.difficultySettings[this.difficulty];
            let multi = 1;
            if (this.combo >= 10) multi = 5;
            else if (this.combo >= 5) multi = 3;
            else if (this.combo >= 3) multi = 2;
            multi = Math.min(multi, settings ? settings.comboCap : 10);
            el.textContent = `連擊 ×${multi}（${this.combo}）`;

            // 連擊 >= 3 時彈出特效
            if (this.combo >= 3) {
                el.classList.remove('combo-pop');
                void el.offsetWidth; // 重新觸發動畫
                el.classList.add('combo-pop');
            }
        },

        // 依當前難度的最大失誤次數，於畫面上繪製對應數量的愛心圖示（上限 10 顆，超過則不顯示）
        renderHearts: function () {
            const container = document.getElementById('game33-hearts');
            if (!container) return;
            container.innerHTML = '';
            let max = this.difficultySettings[this.difficulty].maxMistakeCount;
            if (max > 10) max = 0;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        // 依目前累計失誤次數，將對應數量的愛心圖示切換為「已失去」的空心樣式
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game33-hearts .heart');
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

        // 啟動計時器
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration);
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        // 依剩餘時間比例（ratio）繪製計時外環的進度與顏色；
        // mode 為 'win' 時使用過關動畫的填色邏輯，其餘（一般倒數）則依剩餘時間由綠轉紅
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game33-timer-path');
            const wrapper = document.getElementById('game33-game-wrapper');
            const svg = document.getElementById('game33-timer-ring');
            if (!rect || !wrapper || !svg) return;

            let w = wrapper.offsetWidth;
            let h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rectBox = wrapper.getBoundingClientRect();
                w = rectBox.width;
                h = rectBox.height;
            }
            if (w === 0) return;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';

            rect.setAttribute('width', w - 6);
            rect.setAttribute('height', h - 6);

            const perimeter = (w - 6 + h - 6) * 2;
            rect.style.strokeDasharray = perimeter;

            if (mode === 'win') {
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        // 結算本局：停用互動、依勝負記錄戰績（輸局才記錄到 Supabase）、
        // 播放過關動畫（若獲勝）、檢查成就並顯示結算訊息視窗，
        // 依「關卡模式／自由難度模式」決定下一步是進下一關、開新局或重試
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
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
            clearInterval(this.timerInterval);

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

            const showMessage = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore || this.score) : 0,
                        reason: win ? "" : (typeof reason === 'string' ? reason : "風格未識！"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game33', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game33', this.currentLevelIndex, () => showMessage(finalScore));
                    } else {
                        showMessage(finalScore);
                    }
                } else {
                    showMessage(finalScore);
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game33',
                    timerContainerId: 'game33-game-wrapper',
                    scoreElementId: 'game33-score',
                    heartsSelector: '#game33-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        checkAchievementsAndShow(finalScore);
                    }
                });
            } else {
                checkAchievementsAndShow();
            }
        }
    };

    window.Game33 = Game33;

    if (new URLSearchParams(window.location.search).get('game') === '33') {
        setTimeout(() => {
            if (window.Game33) window.Game33.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
