/* =========================================
   遊戲 31：詩眼覓蹤 (Verse-Eye Detective)
   ---------------------------------------------
   玩法：橫排詩句中某字被換成「替身字」，玩家按住可疑字往下拖曳，
   字上方浮現直排候選字（含正確原字 + 3 干擾字），紅線位置即玩家選擇。
   ========================================= */
(function () {
    const Game31 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // --- 詩詞與題目狀態 ---
        currentPoem: null,
        poemLines: [],          // 篩選後的詩句陣列（每行已去除標點）
        targetChars: [],        // 全部題目字（將每行展開），長度 = 本局題數
        questions: [],          // 題庫陣列 [{ lineIdx, charIdx, original, decoy, candidates, lore }]
        currentQuestionIdx: 0,  // 當前題目索引

        // --- 拖曳互動 ---
        isDragging: false,
        dragStartY: 0,
        dragCurrentY: 0,
        dragCharElement: null,  // 玩家按住的字 DOM
        dragCharIndex: -1,      // 玩家按住的字在當前句中的位置
        candidateOffset: 0,     // 候選字捲動偏移（格）
        SCROLL_PX_PER_STEP: 30,

        // --- 計時器 ---
        timer: 0,
        timerInterval: null,
        maxTimer: 0,
        startTime: 0,
        gameStartTime: null,

        // --- 動畫鎖 ---
        isAnimating: false,

        /* 5 難度設定（依企劃書 §7）
           timeLimitRate：每字時間倍率（秒）
           poemMinRating：最低詩評
           maxMistakeCount：最大錯誤次數（紅心）
           decoyLevel：替身字相似度等級 1~5
           distractorLevel：干擾字相似度等級 1~5
           showDecoyHint：是否高亮替身字
           lineCount：局內題數（=要拿幾句來出題）
        */
        difficultySettings: {
            '小學': { timeLimitRate: 12, poemMinRating: 6, maxMistakeCount: 5, decoyLevel: 1, distractorLevel: 1, showDecoyHint: true, lineCount: 5 },
            '中學': { timeLimitRate: 9, poemMinRating: 5, maxMistakeCount: 4, decoyLevel: 2, distractorLevel: 2, showDecoyHint: true, lineCount: 6 },
            '高中': { timeLimitRate: 7, poemMinRating: 4, maxMistakeCount: 4, decoyLevel: 3, distractorLevel: 3, showDecoyHint: false, lineCount: 8 },
            '大學': { timeLimitRate: 5, poemMinRating: 3, maxMistakeCount: 3, decoyLevel: 4, distractorLevel: 4, showDecoyHint: false, lineCount: 10 },
            '研究所': { timeLimitRate: 3, poemMinRating: 3, maxMistakeCount: 3, decoyLevel: 5, distractorLevel: 5, showDecoyHint: false, lineCount: 12 }
        },

        /* 替身字池（約 100 字常用字，未來可擴展為外部 JSON 資料庫）
           分群以利近似挑選：天象、時節、景物、情緒、動作、數量、其他常用字
        */
        decoyPool: {
            天象: ['月', '日', '星', '辰', '雲', '霜', '露', '雪', '雨', '風', '霞', '霧', '虹', '陽'],
            時節: ['春', '夏', '秋', '冬', '晨', '昏', '夜', '曉', '暮', '朝', '夕', '宵'],
            景物: ['山', '川', '江', '河', '湖', '海', '林', '溪', '原', '野', '峰', '岸', '谷', '川'],
            草木: ['花', '草', '柳', '松', '竹', '梅', '蘭', '菊', '桃', '李', '楓', '葉', '枝', '蓮'],
            禽獸: ['鳥', '鴉', '鶯', '燕', '雁', '鶴', '鷗', '魚', '蝶', '馬', '蟬', '鵑'],
            情緒: ['愁', '思', '念', '憶', '夢', '醉', '醒', '悲', '喜', '怨', '惆', '悵'],
            動作: ['歸', '去', '來', '行', '坐', '臥', '望', '看', '聽', '見', '逢', '別'],
            其他: ['人', '客', '家', '門', '窗', '燈', '酒', '杯', '琴', '書', '舟', '橋', '路', '城', '樓', '臺', '亭', '院']
        },

        /* 煉字典故占位陣列（未來可擴展為外部 JSON 資料庫） */
        loreDB: [
            '此字為全句詩眼，一字定全篇氣象，換作他字則意境全失。',
            '詩人煉此字煞費苦心，看似平淡，實則無可替代。',
            '此字精準傳達詩人當時心境，換作近義字便少了那分情味。',
            '看似尋常之字，置於此處卻成神來之筆，是古典詩詞煉字典範。',
            '此字音、形、義三美俱足，為千古傳誦之關鍵。',
            '詩眼在此，全句因此字而生動傳神，難以替換。',
            '此字承上啟下，意脈相連，他字皆不及其妙。',
            '一字千金，正是此字之謂——讀者反覆吟詠方知其美。',
            '詩人擇此字而非其他近義字，正顯示其敏銳語感與深厚功力。',
            '此字寫盡心中所思，借景言情，融情入景，妙不可言。'
        ],

        /* 常用備用字池（生成干擾字用） */
        commonCharPool: '春夏秋冬風花雪月山水雲煙日星辰夜朝暮人客家國門窗燈酒書琴歸來去望思愁夢醉醒鳥魚蝶馬柳松梅竹江河湖海',

        loadCSS: function () {
            if (!document.getElementById('game31-css')) {
                const link = document.createElement('link');
                link.id = 'game31-css';
                link.rel = 'stylesheet';
                link.href = 'game31.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game31-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game31-container');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game31-container';
            div.className = 'game31-overlay hidden';
            div.innerHTML = `
                <div class="game31-header">
                    <div class="game31-score-board">分數: <span id="game31-score">0</span></div>
                    <div class="game31-controls">
                        <button class="game31-difficulty-tag" id="game31-diff-tag">小學</button>
                        <button id="game31-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game31-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game31-sub-header">
                    <div id="game31-hearts" class="hearts"></div>
                </div>
                <div class="game31-area">
                    <div class="game31-info">
                        <div id="game31-poem-info" class="poem-info"></div>
                        <div id="game31-progress-text" class="game31-progress-text"></div>
                    </div>
                    <div id="game31-stage" class="game31-stage">
                        <svg id="game31-timer-ring">
                            <rect id="game31-timer-path" x="3" y="3"></rect>
                        </svg>
                        <!-- 候選字直排浮現於詩句上方 -->
                        <div id="game31-candidates" class="game31-candidates hidden"></div>
                        <!-- 紅線（對齊基準） -->
                        <div id="game31-redline" class="game31-redline hidden"></div>
                        <!-- 詩句橫排 -->
                        <div id="game31-verse" class="game31-verse"></div>
                    </div>
                    <!-- 煉字典故卡 -->
                    <div id="game31-lore-card" class="game31-lore-card hidden"></div>
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

            document.getElementById('game31-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game31-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game31-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 全域拖曳事件（mouse + touch）
            const stage = document.getElementById('game31-stage');
            stage.addEventListener('mousedown', this.onDragStart.bind(this));
            window.addEventListener('mousemove', this.onDragMove.bind(this));
            window.addEventListener('mouseup', this.onDragEnd.bind(this));
            stage.addEventListener('touchstart', this.onDragStart.bind(this), { passive: false });
            window.addEventListener('touchmove', this.onDragMove.bind(this), { passive: false });
            window.addEventListener('touchend', this.onDragEnd.bind(this));
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩眼覓蹤', (selectedLevel, levelIndex) => {
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
            const diffTag = document.getElementById('game31-diff-tag');
            const retryBtn = document.getElementById('game31-retryGame-btn');
            const newBtn = document.getElementById('game31-newGame-btn');
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
            const els = ['cardContainer'];
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
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) return;
            this.startGameProcess(true);
        },

        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            if (this.selectRandomPoem()) {
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

        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要先載入 script.js 中的 getSharedRandomPoem 函數');
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            // 取得至少 settings.lineCount 句的詩
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                settings.lineCount,
                Math.max(settings.lineCount + 4, 14),
                settings.lineCount * 3,
                100,
                '',
                this.isLevelMode ? this.currentLevelIndex : null,
                'game31'
            );
            if (!result) return false;
            this.currentPoem = result.poem;
            // 只取所需句數
            this.poemLines = result.lines.slice(0, settings.lineCount);
            // targetChars：把每行第一個字塞入（用於時間計算，長度 = 局內題數 = 字數）
            this.targetChars = this.poemLines.map(line => line[0] || '');

            document.getElementById('game31-poem-info').textContent =
                `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            document.getElementById('game31-poem-info').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.mistakeCount = 0;
            this.currentQuestionIdx = 0;
            this.isAnimating = false;
            this.isDragging = false;

            document.getElementById('game31-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();
            this.hideLoreCard();
            this.hideCandidates();

            this.renderHearts();
            this.updateUIForMode();

            // 生成題目
            this.generateQuestions();

            // 渲染第一題
            this.renderCurrentQuestion();
            this.updateProgressText();

            document.getElementById('game31-retryGame-btn').disabled = false;
            document.getElementById('game31-newGame-btn').disabled = false;

            const settings = this.difficultySettings[this.difficulty];
            // 時限 = targetChars.length × timeLimitRate
            this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
            this.timer = this.maxTimer;
            document.getElementById('game31-timer-ring').style.display = 'block';
            this.startTimer();
        },

        /* 為每行詩生成一題：選一個詩眼字 → 生成替身 → 生成 3 個干擾字 */
        generateQuestions: function () {
            this.questions = [];
            const settings = this.difficultySettings[this.difficulty];
            for (let i = 0; i < this.poemLines.length; i++) {
                const line = this.poemLines[i];
                if (!line || line.length === 0) continue;

                // 隨機選一字作為詩眼（非標點，已由 getSharedRandomPoem 過濾）
                const charIdx = Math.floor(Math.random() * line.length);
                const original = line[charIdx];

                // 生成替身字
                const decoy = this.pickDecoyChar(original, settings.decoyLevel);

                // 生成 3 干擾字（不含 original、不含 decoy）
                const distractors = this.pickDistractors(original, decoy, 3, settings.distractorLevel);

                // 候選字陣列（原字 + 3 干擾）打亂順序
                const candidates = this.shuffle([original, ...distractors]);

                // 煉字典故（隨機選一則占位）
                const lore = this.loreDB[Math.floor(Math.random() * this.loreDB.length)];

                this.questions.push({
                    lineIdx: i,
                    charIdx: charIdx,
                    original: original,
                    decoy: decoy,
                    candidates: candidates,
                    lore: lore
                });
            }
        },

        /* 從替身字池挑出與 original 不同的近義字（依等級控制相似度） */
        pickDecoyChar: function (original, level) {
            // 找出 original 所在的字群
            let group = null;
            for (const k in this.decoyPool) {
                if (this.decoyPool[k].includes(original)) { group = k; break; }
            }
            // level 1~2 從異群隨機選（差異大）；level 3~5 從同群選（差異小）
            let pool;
            if (group && level >= 3) {
                pool = this.decoyPool[group].filter(c => c !== original);
            } else {
                // 從整體池中隨機取
                pool = [];
                for (const k in this.decoyPool) {
                    if (k !== group) pool = pool.concat(this.decoyPool[k]);
                }
                pool = pool.filter(c => c !== original);
            }
            if (pool.length === 0) {
                // 兜底：commonCharPool 隨機
                const cs = this.commonCharPool.split('').filter(c => c !== original);
                return cs[Math.floor(Math.random() * cs.length)];
            }
            return pool[Math.floor(Math.random() * pool.length)];
        },

        /* 挑 N 個干擾字：1 近義 + 1 同類 + 1 隨機常用，皆不重複也不等於 original/decoy */
        pickDistractors: function (original, decoy, n, level) {
            const exclude = new Set([original, decoy]);
            const result = [];
            // 1 個近義（同群）
            let group = null;
            for (const k in this.decoyPool) {
                if (this.decoyPool[k].includes(original)) { group = k; break; }
            }
            if (group) {
                const pool = this.decoyPool[group].filter(c => !exclude.has(c));
                if (pool.length > 0) {
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    result.push(pick); exclude.add(pick);
                }
            }
            // 1 個同類（異群但屬替身池）
            const otherKeys = Object.keys(this.decoyPool).filter(k => k !== group);
            if (otherKeys.length > 0) {
                const k = otherKeys[Math.floor(Math.random() * otherKeys.length)];
                const pool = this.decoyPool[k].filter(c => !exclude.has(c));
                if (pool.length > 0) {
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    result.push(pick); exclude.add(pick);
                }
            }
            // 剩下補隨機常用字
            const commonChars = this.commonCharPool.split('').filter(c => !exclude.has(c));
            while (result.length < n && commonChars.length > 0) {
                const idx = Math.floor(Math.random() * commonChars.length);
                const pick = commonChars.splice(idx, 1)[0];
                if (!exclude.has(pick)) {
                    result.push(pick); exclude.add(pick);
                }
            }
            return result;
        },

        shuffle: function (arr) {
            const a = arr.slice();
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [a[i], a[j]] = [a[j], a[i]];
            }
            return a;
        },

        /* 渲染當前題目（橫排詩句，其中詩眼字被換成替身字） */
        renderCurrentQuestion: function () {
            const verse = document.getElementById('game31-verse');
            verse.innerHTML = '';
            if (this.currentQuestionIdx >= this.questions.length) return;

            const q = this.questions[this.currentQuestionIdx];
            const line = this.poemLines[q.lineIdx];
            const settings = this.difficultySettings[this.difficulty];

            for (let i = 0; i < line.length; i++) {
                const span = document.createElement('span');
                span.className = 'game31-verse-char';
                span.dataset.idx = i;
                if (i === q.charIdx) {
                    // 替身字
                    span.textContent = q.decoy;
                    span.classList.add('game31-decoy');
                    if (settings.showDecoyHint) {
                        span.classList.add('game31-decoy-hint');
                    }
                } else {
                    span.textContent = line[i];
                }
                verse.appendChild(span);
            }
        },

        updateProgressText: function () {
            const txt = document.getElementById('game31-progress-text');
            if (!txt) return;
            const total = this.questions.length;
            const cur = Math.min(this.currentQuestionIdx + 1, total);
            txt.textContent = `第 ${cur} / ${total} 句`;
        },

        /* === 拖曳互動 === */

        onDragStart: function (e) {
            if (!this.isActive || this.isAnimating) return;
            if (this.currentQuestionIdx >= this.questions.length) return;

            let target = e.target;
            if (e.touches && e.touches.length > 0) {
                const t = e.touches[0];
                target = document.elementFromPoint(t.clientX, t.clientY);
            }
            if (!target || !target.classList || !target.classList.contains('game31-verse-char')) return;

            e.preventDefault();
            const charIdx = parseInt(target.dataset.idx);
            this.isDragging = true;
            this.dragCharElement = target;
            this.dragCharIndex = charIdx;
            this.candidateOffset = 0;

            const pt = this.getPointer(e);
            this.dragStartY = pt.y;
            this.dragCurrentY = pt.y;

            target.classList.add('game31-pressed');

            // 顯示候選字直排與紅線
            this.showCandidates(target);

            if (window.SoundManager) window.SoundManager.playOpenItem();
        },

        onDragMove: function (e) {
            if (!this.isDragging || !this.isActive) return;
            if (e.cancelable) e.preventDefault();
            const pt = this.getPointer(e);
            this.dragCurrentY = pt.y;
            const dy = this.dragCurrentY - this.dragStartY;
            // 向下為正 → 候選字向下捲動
            const step = Math.round(dy / this.SCROLL_PX_PER_STEP);
            if (step !== this.candidateOffset) {
                this.candidateOffset = step;
                this.updateCandidatesScroll();
                if (window.SoundManager) window.SoundManager.playMelodyNote && window.SoundManager.playMelodyNote(0);
            }
        },

        onDragEnd: function (e) {
            if (!this.isDragging || !this.isActive) return;
            this.isDragging = false;
            if (this.dragCharElement) this.dragCharElement.classList.remove('game31-pressed');

            const dy = this.dragCurrentY - this.dragStartY;
            // 取消手勢：拖曳距離 < 20px
            if (Math.abs(dy) < 20) {
                this.hideCandidates();
                return;
            }

            // 紅線位置候選字 = 玩家提交答案
            const q = this.questions[this.currentQuestionIdx];
            const N = q.candidates.length;
            // candidateOffset 正值 = 候選字向下捲 = 紅線指到較前面的字
            // 取 (centerIdx - offset) 經 mod
            const centerIdx = Math.floor(N / 2);
            let pickIdx = ((centerIdx - this.candidateOffset) % N + N) % N;
            const submitted = q.candidates[pickIdx];

            this.judgeAnswer(q, submitted);
        },

        getPointer: function (e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            if (e.changedTouches && e.changedTouches.length > 0) {
                return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        },

        /* 顯示候選字直排於指定字元上方 */
        showCandidates: function (charEl) {
            const q = this.questions[this.currentQuestionIdx];
            const cont = document.getElementById('game31-candidates');
            const redline = document.getElementById('game31-redline');
            const stage = document.getElementById('game31-stage');
            const stageRect = stage.getBoundingClientRect();
            const charRect = charEl.getBoundingClientRect();

            // 詩句字左邊位置（轉成 stage 內座標，需要除以 stageScale）
            const scale = window.stageScale || 1;
            const left = (charRect.left - stageRect.left) / scale + (charRect.width / scale) / 2;

            cont.innerHTML = '';
            for (let i = 0; i < q.candidates.length; i++) {
                const div = document.createElement('div');
                div.className = 'game31-candidate-char';
                div.textContent = q.candidates[i];
                div.dataset.idx = i;
                cont.appendChild(div);
            }
            cont.style.left = left + 'px';
            cont.classList.remove('hidden');
            redline.classList.remove('hidden');

            this.candidateOffset = 0;
            this.updateCandidatesScroll();
        },

        hideCandidates: function () {
            const cont = document.getElementById('game31-candidates');
            const redline = document.getElementById('game31-redline');
            if (cont) cont.classList.add('hidden');
            if (redline) redline.classList.add('hidden');
        },

        /* 根據 candidateOffset 重新排列候選字位置，並標出紅線位置者 */
        updateCandidatesScroll: function () {
            const cont = document.getElementById('game31-candidates');
            if (!cont) return;
            const items = cont.querySelectorAll('.game31-candidate-char');
            const N = items.length;
            if (N === 0) return;
            const CELL_H = 50;
            const centerIdx = Math.floor(N / 2);
            const offset = this.candidateOffset;
            // 紅線位置的候選 = 第 (centerIdx - offset) mod N
            const redIdx = ((centerIdx - offset) % N + N) % N;
            items.forEach((el, i) => {
                // 在直排中將 redIdx 那一格放到中央，其他依序上下排列
                let rel = i - redIdx;
                // 取最短繞行距離（捲動感）
                if (rel > N / 2) rel -= N;
                if (rel < -N / 2) rel += N;
                const y = rel * CELL_H;
                el.style.transform = `translateY(${y}px)`;
                el.classList.toggle('game31-cand-active', i === redIdx);
            });
        },

        /* 判定答案 */
        judgeAnswer: function (q, submitted) {
            this.isAnimating = true;
            const verse = document.getElementById('game31-verse');
            const decoyEl = verse.querySelector('.game31-decoy');

            // 玩家是否拖曳到替身字 = this.dragCharIndex === q.charIdx
            const pickedRightDecoy = (this.dragCharIndex === q.charIdx);
            const pickedRightOriginal = (submitted === q.original);

            this.hideCandidates();

            if (pickedRightDecoy && pickedRightOriginal) {
                // 全對：滲血碎裂 + 毛筆原字浮現 + 典故卡
                if (window.SoundManager) window.SoundManager.playSuccess();
                if (decoyEl) {
                    decoyEl.classList.add('game31-bleed');
                    setTimeout(() => {
                        decoyEl.textContent = q.original;
                        decoyEl.classList.remove('game31-bleed', 'game31-decoy', 'game31-decoy-hint');
                        decoyEl.classList.add('game31-reveal');
                    }, 600);
                }
                // 加分
                const pts = (window.ScoreManager && window.ScoreManager.gameSettings.game31)
                    ? window.ScoreManager.gameSettings.game31.getPointA : 50;
                this.score += pts;
                document.getElementById('game31-score').textContent = this.score;

                this.showLoreCard(q.original, q.lore, () => {
                    this.isAnimating = false;
                    this.nextQuestion();
                });
            } else {
                // 答錯：紅光閃爍 + 扣心 + 揭示
                if (window.SoundManager) window.SoundManager.playFailure();
                if (this.dragCharElement) {
                    this.dragCharElement.classList.add('game31-wrong');
                    setTimeout(() => {
                        if (this.dragCharElement) this.dragCharElement.classList.remove('game31-wrong');
                    }, 800);
                }
                // 揭示正確答案：將替身字以紅色閃爍替換為原字
                if (decoyEl) {
                    setTimeout(() => {
                        decoyEl.textContent = q.original;
                        decoyEl.classList.add('game31-revealed-wrong');
                    }, 400);
                }
                this.mistakeCount++;
                this.updateHearts();

                const maxM = this.difficultySettings[this.difficulty].maxMistakeCount;
                if (this.mistakeCount >= maxM) {
                    setTimeout(() => {
                        this.isAnimating = false;
                        this.gameOver(false, '失誤過多');
                    }, 1200);
                } else {
                    setTimeout(() => {
                        this.isAnimating = false;
                        this.nextQuestion();
                    }, 1500);
                }
            }
        },

        nextQuestion: function () {
            this.currentQuestionIdx++;
            if (this.currentQuestionIdx >= this.questions.length) {
                this.gameOver(true, '');
                return;
            }
            this.renderCurrentQuestion();
            this.updateProgressText();
        },

        /* 顯示煉字典故卡 */
        showLoreCard: function (charText, loreText, onDone) {
            const card = document.getElementById('game31-lore-card');
            card.innerHTML = `
                <div class="game31-lore-title">煉字典故：「${charText}」</div>
                <div class="game31-lore-body">${loreText}</div>
                <div class="game31-lore-hint">（點擊繼續）</div>
            `;
            card.classList.remove('hidden');
            card.classList.add('game31-lore-show');

            let closed = false;
            const close = () => {
                if (closed) return;
                closed = true;
                card.classList.add('hidden');
                card.classList.remove('game31-lore-show');
                card.onclick = null;
                if (onDone) onDone();
            };
            card.onclick = close;
            // 自動 3 秒後關閉
            setTimeout(close, 3000);
        },

        hideLoreCard: function () {
            const card = document.getElementById('game31-lore-card');
            if (card) {
                card.classList.add('hidden');
                card.classList.remove('game31-lore-show');
            }
        },

        /* === 計時器 === */
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
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game31-timer-path');
            const wrapper = document.getElementById('game31-stage');
            const svg = document.getElementById('game31-timer-ring');
            if (!rect || !wrapper || !svg) return;
            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const box = wrapper.getBoundingClientRect();
                w = box.width; h = box.height;
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
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        /* === 紅心 === */
        renderHearts: function () {
            const container = document.getElementById('game31-hearts');
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
            const hearts = document.querySelectorAll('#game31-hearts .heart');
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

        /* === 遊戲結束 === */
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 31,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);
            this.hideCandidates();
            this.hideLoreCard();

            if (win) {
                document.getElementById('game31-retryGame-btn').disabled = true;
                document.getElementById('game31-newGame-btn').disabled = true;
            } else {
                document.getElementById('game31-retryGame-btn').disabled = false;
                document.getElementById('game31-newGame-btn').disabled = false;
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '詩眼難辨！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game31', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game31', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game31',
                    timerContainerId: 'game31-stage',
                    scoreElementId: 'game31-score',
                    heartsSelector: '#game31-hearts .heart:not(.empty)',
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

    window.Game31 = Game31;

    if (new URLSearchParams(window.location.search).get('game') === '31') {
        setTimeout(() => {
            if (window.Game31) window.Game31.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
