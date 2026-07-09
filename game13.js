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
            '中學': { timeLimitRate: 5, poemMinRating: 5, maxMistakeCount: 4, metaHideCount: 2, charHideCount: 3, metaDistractors: 2, charDistractors: 3 },
            '高中': { timeLimitRate: 4, poemMinRating: 4, maxMistakeCount: 5, metaHideCount: 3, charHideCount: 5, metaDistractors: 2, charDistractors: 3 },
            '大學': { timeLimitRate: 3, poemMinRating: 3, maxMistakeCount: 6, metaHideCount: 3, charHideCount: 7, metaDistractors: 2, charDistractors: 2 },
            '研究所': { timeLimitRate: 2, poemMinRating: 3, maxMistakeCount: 7, metaHideCount: 3, charHideCount: 9, metaDistractors: 2, charDistractors: 1 }
        },

        loadCSS: function () {
            if (!document.getElementById('game13-css')) {
                const link = document.createElement('link');
                link.id = 'game13-css';
                link.rel = 'stylesheet';
                link.href = 'game13.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game13-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game13-container');
            this.gameArea = document.getElementById('game13-area');

            document.getElementById('game13-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

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
                            <svg id="game13-timer-ring">
                                <rect id="game13-timer-path" x="5" y="5"></rect>
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

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

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

        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

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
            this.renderUI();
            // 依實際隱藏題目數量動態計算時間限制（(meta+char) × timeLimitRate）
            const settings13r = this.difficultySettings[this.difficulty];
            this.timeLimit = (this.hiddenMeta.filter(m => m.isHidden).length + this.hiddenChars.length) * settings13r.timeLimitRate;
            this.startTimer();
        },

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
                        box.textContent = m.value;
                        box.classList.add('correct');
                    } else {
                        // 顯示類型提示
                        const labels = { dynasty: '朝代', author: '作者', title: '詩名' };
                        box.textContent = labels[m.type];
                    }
                } else {
                    box.textContent = m.value;
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

            // 3. 渲染按鈕池
            const pool = document.getElementById('game13-answer-pool');
            pool.innerHTML = '';
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
                pool.appendChild(btn);
            });

            // 檢查是否超出 8 行，若超出則縮小尺寸
            this.checkAnswerPoolRows();
        },

        adjustFontSize: function (element, length) {
            if (!element) return;
            if (length <= 8) {
                element.style.fontSize = '50px';
            } else if (length > 8) {
                element.style.fontSize = '40px';
            }
        },

        checkAnswerPoolRows: function () {
            const pool = document.getElementById('game13-answer-pool');
            if (!pool) return;

            // 先移除之前的緊湊模式類名
            pool.classList.remove('compact-layout');

            // 如果捲動高度大於實際高度，代表超出 8 行 (因為 CSS 中設定了固定高度 540px)
            if (pool.scrollHeight > pool.offsetHeight + 5) {
                pool.classList.add('compact-layout');
            }
        },

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
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsla(0, 90%, 50%, ${Math.round(5 + 45 * elapsed)}%)`;
            }
        },

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
