/* =========================================
   遊戲34：猜猜詩題 (Verse-Title Guess)
   題眼鑑賞訓練 — 螢幕顯示整首詩，標題以〈？？？〉遮蔽
   玩家在 4 張候選標題卡中單擊正確標題
   ========================================= */
(function () {
    const Game34 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // --- 遊戲狀態 ---
        questions: [],          // 題目陣列：{ poem, correctTitle, candidates[], firstLines{title->line} }
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
        // timeLimitRate：每題秒數
        // poemMinRating：詩評下限
        // candidateCount：候選標題數
        // decoyType：crossTopic / sameAuthor / sameAuthorClose（同詩人/微差）
        // comboCap：連擊倍率封頂
        difficultySettings: {
            '小學': { timeLimitRate: 40, poemMinRating: 6, maxMistakeCount: 5, questionCount: 10, candidateCount: 4, decoyType: 'crossTopic', comboCap: 2 },
            '中學': { timeLimitRate: 30, poemMinRating: 5, maxMistakeCount: 5, questionCount: 12, candidateCount: 4, decoyType: 'crossTopic', comboCap: 3 },
            '高中': { timeLimitRate: 25, poemMinRating: 4, maxMistakeCount: 4, questionCount: 15, candidateCount: 4, decoyType: 'crossTopic', comboCap: 3 },
            '大學': { timeLimitRate: 20, poemMinRating: 3, maxMistakeCount: 3, questionCount: 18, candidateCount: 4, decoyType: 'sameAuthor', comboCap: 5 },
            '研究所': { timeLimitRate: 15, poemMinRating: 3, maxMistakeCount: 3, questionCount: 20, candidateCount: 4, decoyType: 'sameAuthorClose', comboCap: 10 }
        },

        loadCSS: function () {
            if (!document.getElementById('game34-css')) {
                const link = document.createElement('link');
                link.id = 'game34-css';
                link.rel = 'stylesheet';
                link.href = 'game34.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game34-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game34-container');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game34-container';
            div.className = 'game34-overlay hidden';
            div.innerHTML = `
                <div class="game34-header">
                    <div class="game34-score-board">分數: <span id="game34-score">0</span></div>
                    <div class="game34-controls">
                        <button class="game34-difficulty-tag" id="game34-diff-tag">小學</button>
                        <button id="game34-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game34-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game34-sub-header">
                    <div id="game34-hearts" class="hearts"></div>
                    <div id="game34-combo" class="game34-combo">連擊 ×1</div>
                </div>
                <div class="game34-area">
                    <div class="game34-info">
                        <div id="game34-poem-info" class="poem-info"></div>
                        <div id="game34-progress-text" class="game34-progress-text"></div>
                    </div>
                    <div id="game34-game-wrapper" class="game34-game-wrapper">
                        <svg id="game34-timer-ring">
                            <rect id="game34-timer-path" x="3" y="3"></rect>
                        </svg>
                        <div class="game34-question-box">
                            <div class="game34-mask-row">
                                <span id="game34-title-mask" class="game34-title-mask">〈？？？〉</span>
                                <span id="game34-recite-icon" class="game34-recite-icon" title="朗誦">🔊</span>
                            </div>
                            <div id="game34-poem-body" class="game34-poem-body"></div>
                        </div>
                        <div class="game34-question-title">這首詩叫什麼？</div>
                        <div id="game34-candidates" class="game34-candidates"></div>
                        <div id="game34-feedback" class="game34-feedback hidden"></div>
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

            document.getElementById('game34-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game34-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game34-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            // 朗誦按鈕：手動再次朗誦本題
            document.getElementById('game34-recite-icon').onclick = () => {
                if (!this.questions[this.currentQuestionIdx]) return;
                this.recitePoem(this.questions[this.currentQuestionIdx].poem);
            };
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopSpeech();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('猜猜詩題', (selectedLevel, levelIndex) => {
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

        updateUIForMode: function () {
            const diffTag = document.getElementById('game34-diff-tag');
            const retryBtn = document.getElementById('game34-retryGame-btn');
            const newBtn = document.getElementById('game34-newGame-btn');
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

        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container', 'game8-container', 'game33-container', 'game34-container'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopSpeech();
            // ⚠️ 必須隱藏 overlay：menu.js 全域清理只呼叫 stopGame()
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (this.questions.length === 0) return;
            this.startGameProcess(true);
        },

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

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

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

            document.getElementById('game34-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            const settings = this.difficultySettings[this.difficulty];
            this.renderHearts();
            this.updateComboDisplay();

            // 顯示首題
            this.renderQuestion();

            document.getElementById('game34-retryGame-btn').disabled = false;
            document.getElementById('game34-newGame-btn').disabled = false;

            // 時限 = questionCount × timeLimitRate（依企劃書）
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(settings.questionCount * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game34-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game34-timer-ring').style.display = 'none';
            }
        },

        // 生成本局題目
        // 策略：每題抽 (candidateCount) 首詩，第一首為正解，其餘標題作干擾
        //  - crossTopic：直接隨機抽不同詩 → 跨主題天然成立
        //  - sameAuthor：先抽正解詩，再從同詩人其他詩抽干擾，不足以全池補
        //  - sameAuthorClose：同 sameAuthor，並偏好「標題字數接近」者
        generateQuestions: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error("需要先載入 script.js 中的 getSharedRandomPoem 函數");
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            this.questions = [];

            const usedPoemIds = new Set();   // 整局已用過詩 id 避免題目重複
            const usedTitles = new Set();    // 整局已用過標題

            for (let q = 0; q < settings.questionCount; q++) {
                // 正解詩
                const seed = this.isLevelMode ? (this.currentLevelIndex * 100 + q) : null;
                let result = null;
                for (let tryI = 0; tryI < 8; tryI++) {
                    const r = getSharedRandomPoem(
                        settings.poemMinRating, 2, 12, 8, 80,
                        "", seed !== null ? (seed + tryI * 7) : null, 'game34_' + q + '_' + tryI
                    );
                    if (!r) continue;
                    const t = (r.poem.title || '').trim();
                    if (!t || usedTitles.has(t) || usedPoemIds.has(r.poem.id)) continue;
                    result = r;
                    break;
                }
                if (!result) continue;
                const poem = result.poem;
                const correctTitle = (poem.title || '').trim();
                if (!correctTitle) continue;
                usedPoemIds.add(poem.id);
                usedTitles.add(correctTitle);

                // 干擾標題
                const decoys = this.generateDecoyTitles(poem, settings, usedTitles);

                // 紀錄每個候選標題的首句（答錯顯示用）
                // 正解詩本身就有；干擾項在 generateDecoyTitles 中順便填上
                const firstLines = decoys.firstLines;
                firstLines[correctTitle] = (result.lines && result.lines[0]) ? result.lines[0] : '';

                // 標題清單 (含正解)；若不足以 candidateCount，用本詩標題湊
                let titles = [correctTitle, ...decoys.titles];
                titles = titles.slice(0, settings.candidateCount);
                while (titles.length < settings.candidateCount) {
                    // 退化保護：重複放入正解避免崩潰（極罕見）
                    titles.push(correctTitle);
                }
                // 洗牌
                titles.sort(() => Math.random() - 0.5);

                // poem.lines：用 getSharedRandomPoem 回傳的清淨句子陣列
                this.questions.push({
                    poem: poem,
                    poemLines: result.lines || [],
                    correctTitle: correctTitle,
                    candidates: titles,
                    firstLines: firstLines
                });
            }

            return this.questions.length > 0;
        },

        // 生成干擾標題與其首句
        // 回傳：{ titles: [t1, t2, ...], firstLines: { title->line } }
        generateDecoyTitles: function (correctPoem, settings, usedTitles) {
            const need = settings.candidateCount - 1;
            const decoyType = settings.decoyType;
            const result = { titles: [], firstLines: {} };
            const seen = new Set([correctPoem.title]);

            // 同詩人池（用於 sameAuthor / sameAuthorClose）
            let sameAuthorPool = [];
            if (typeof POEMS !== 'undefined' && correctPoem.author) {
                sameAuthorPool = POEMS.filter(p =>
                    p.id !== correctPoem.id &&
                    p.author === correctPoem.author &&
                    p.title && p.title.trim().length > 0
                );
            }

            const pushDecoy = (p) => {
                const t = (p.title || '').trim();
                if (!t || seen.has(t) || usedTitles.has(t)) return false;
                seen.add(t);
                result.titles.push(t);
                // 抓首句（去標點）
                let firstLine = '';
                if (Array.isArray(p.content) && p.content.length > 0) {
                    firstLine = String(p.content[0]).replace(/[，。？！、：；「」『』\s]/g, '');
                } else if (typeof p.content === 'string') {
                    const firstSeg = p.content.split(/[，。？！\n]/)[0] || '';
                    firstLine = firstSeg.replace(/[，。？！、：；「」『』\s]/g, '');
                }
                result.firstLines[t] = firstLine;
                return true;
            };

            if (decoyType === 'sameAuthor' || decoyType === 'sameAuthorClose') {
                let pool = sameAuthorPool.slice();
                if (decoyType === 'sameAuthorClose') {
                    // 偏好標題字數接近的詩（差距 <=1）
                    const targetLen = correctPoem.title.length;
                    pool.sort((a, b) => {
                        const da = Math.abs((a.title || '').length - targetLen);
                        const db = Math.abs((b.title || '').length - targetLen);
                        return da - db;
                    });
                    // 但只在前段過度集中時保留隨機性 — 取前 2*need 再洗牌
                    pool = pool.slice(0, Math.max(need * 3, 6));
                    pool.sort(() => Math.random() - 0.5);
                } else {
                    pool.sort(() => Math.random() - 0.5);
                }
                for (let i = 0; i < pool.length && result.titles.length < need; i++) {
                    pushDecoy(pool[i]);
                }
            }

            // 不足（或 crossTopic）：以 getSharedRandomPoem 多次抽詩補齊
            let safety = 0;
            while (result.titles.length < need && safety < 30) {
                safety++;
                const r = getSharedRandomPoem(
                    settings.poemMinRating, 2, 12, 8, 80,
                    "", null, 'game34_decoy_' + safety
                );
                if (!r) break;
                pushDecoy(r.poem);
            }

            return result;
        },

        // 渲染當前題目
        renderQuestion: function () {
            if (this.currentQuestionIdx >= this.questions.length) return;
            const q = this.questions[this.currentQuestionIdx];

            // 標題遮蔽 — 重置毛筆動畫狀態
            const maskEl = document.getElementById('game34-title-mask');
            maskEl.className = 'game34-title-mask';   // 移除 reveal 動畫
            maskEl.textContent = '〈？？？〉';

            // 詩文本體（每句一行，橫排）
            const bodyEl = document.getElementById('game34-poem-body');
            bodyEl.innerHTML = q.poemLines
                .map(l => `<div class="game34-poem-line">${l}</div>`)
                .join('');

            // 出處先隱藏
            const infoEl = document.getElementById('game34-poem-info');
            infoEl.textContent = '出處：？？？';
            infoEl.onclick = null;
            infoEl.style.cursor = 'default';
            infoEl.style.textDecoration = 'none';

            // 進度
            const settings = this.difficultySettings[this.difficulty];
            document.getElementById('game34-progress-text').textContent =
                `第 ${this.currentQuestionIdx + 1} / ${settings.questionCount} 題`;

            // 候選標題卡 — 縱向列出
            const candWrap = document.getElementById('game34-candidates');
            candWrap.innerHTML = '';
            q.candidates.forEach(title => {
                const btn = document.createElement('button');
                btn.className = 'game34-cand-btn';
                btn.textContent = `〈${title}〉`;
                btn.dataset.title = title;
                btn.onclick = () => this.handleSelect(title, btn);
                candWrap.appendChild(btn);
            });

            // 隱藏 feedback
            const fb = document.getElementById('game34-feedback');
            fb.classList.add('hidden');
            fb.innerHTML = '';

            this.locked = false;
        },

        // 玩家點擊候選標題
        handleSelect: function (selectedTitle, btnEl) {
            if (!this.isActive || this.locked) return;
            this.locked = true;

            const q = this.questions[this.currentQuestionIdx];
            const isCorrect = (selectedTitle === q.correctTitle);

            // 顯示出處
            const infoEl = document.getElementById('game34-poem-info');
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

                const basePts = (window.ScoreManager && window.ScoreManager.gameSettings.game34)
                    ? window.ScoreManager.gameSettings.game34.getPointA : 50;
                const points = basePts * multi;
                this.score += points;
                document.getElementById('game34-score').textContent = this.score;

                this.updateComboDisplay();
                if (window.SoundManager) window.SoundManager.playSuccess();

                // 毛筆書寫動畫：標題寫入〈？？？〉
                this.revealTitleWithBrush(q.correctTitle);

                // 朗誦整首詩
                this.recitePoem(q.poem);

            } else {
                btnEl.classList.add('wrong');
                this.combo = 0;
                this.updateComboDisplay();

                // 正確標題卡閃光
                const allBtns = document.querySelectorAll('#game34-candidates .game34-cand-btn');
                allBtns.forEach(b => {
                    if (b.dataset.title === q.correctTitle) {
                        b.classList.add('flash-correct');
                    }
                });

                // 答錯教學：選錯標題的首句
                const wrongLine = q.firstLines[selectedTitle] || '（首句資料缺失）';
                const fb = document.getElementById('game34-feedback');
                fb.innerHTML = `〈${selectedTitle}〉的首句是<br><b>「${wrongLine}」</b>`;
                fb.classList.remove('hidden');

                this.mistakeCount++;
                this.updateHearts();
                if (window.SoundManager) window.SoundManager.playFailure();

                const maxM = this.difficultySettings[this.difficulty].maxMistakeCount;
                if (this.mistakeCount >= maxM) {
                    setTimeout(() => this.gameOver(false, '失誤過多'), 1500);
                    return;
                }
            }

            // 1.5 秒鎖定後進下一題（給朗誦/閱讀時間）
            setTimeout(() => {
                this.stopSpeech();
                this.currentQuestionIdx++;
                if (this.currentQuestionIdx >= this.questions.length) {
                    this.gameOver(true, '');
                } else {
                    this.renderQuestion();
                }
            }, isCorrect ? 1800 : 2200);
        },

        // 毛筆書寫動畫：將〈？？？〉替換為正解標題，金色筆鋒浮現
        revealTitleWithBrush: function (title) {
            const maskEl = document.getElementById('game34-title-mask');
            if (!maskEl) return;
            // 一筆一字逐字浮現
            maskEl.textContent = '';
            maskEl.classList.add('reveal');
            const chars = ('〈' + title + '〉').split('');
            chars.forEach((ch, i) => {
                const span = document.createElement('span');
                span.className = 'game34-brush-ch';
                span.textContent = ch;
                span.style.animationDelay = (i * 0.12) + 's';
                maskEl.appendChild(span);
            });
        },

        // Web Speech API 朗誦詩文；若不支援則略過
        recitePoem: function (poem) {
            this.stopSpeech();
            if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return;
            try {
                // 組合朗誦文本：標題 + 詩文
                let text = (poem.title || '') + '。';
                if (Array.isArray(poem.content)) {
                    text += poem.content.join('，');
                } else if (typeof poem.content === 'string') {
                    text += poem.content;
                }
                const utter = new SpeechSynthesisUtterance(text);
                utter.lang = 'zh-TW';
                utter.rate = 0.85;
                utter.pitch = 1.0;
                utter.volume = 1.0;
                this._currentUtter = utter;
                window.speechSynthesis.speak(utter);
            } catch (e) {
                // 略過：朗誦失敗不影響遊戲
            }
        },

        stopSpeech: function () {
            try {
                if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
                    window.speechSynthesis.cancel();
                }
            } catch (e) { /* ignore */ }
            this._currentUtter = null;
        },

        updateComboDisplay: function () {
            const el = document.getElementById('game34-combo');
            if (!el) return;
            const settings = this.difficultySettings[this.difficulty];
            let multi = 1;
            if (this.combo >= 10) multi = 5;
            else if (this.combo >= 5) multi = 3;
            else if (this.combo >= 3) multi = 2;
            multi = Math.min(multi, settings ? settings.comboCap : 10);
            el.textContent = `連擊 ×${multi}（${this.combo}）`;

            if (this.combo >= 3) {
                el.classList.remove('combo-pop');
                void el.offsetWidth;
                el.classList.add('combo-pop');
            }
        },

        renderHearts: function () {
            const container = document.getElementById('game34-hearts');
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

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game34-hearts .heart');
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

        // 計時器（沿用 game33 模式）
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

        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game34-timer-path');
            const wrapper = document.getElementById('game34-game-wrapper');
            const svg = document.getElementById('game34-timer-ring');
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

        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            this.stopSpeech();
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 34,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);

            if (win) {
                document.getElementById('game34-retryGame-btn').disabled = true;
                document.getElementById('game34-newGame-btn').disabled = true;
            } else {
                document.getElementById('game34-retryGame-btn').disabled = false;
                document.getElementById('game34-newGame-btn').disabled = false;
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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "題眼未識！"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game34', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game34', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game34',
                    timerContainerId: 'game34-game-wrapper',
                    scoreElementId: 'game34-score',
                    heartsSelector: '#game34-hearts .heart:not(.empty)',
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

    window.Game34 = Game34;

    // URL 自動啟動 ?game=34
    if (new URLSearchParams(window.location.search).get('game') === '34') {
        setTimeout(() => {
            if (window.Game34) window.Game34.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
