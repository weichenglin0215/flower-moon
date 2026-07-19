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
        SCROLL_PX_PER_STEP: 60, // 每滑動一格候選字所需的像素距離；拉長為原本(30)的 200%，避免手指太靈敏誤跳過正確字

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
           minDecoyCount / maxDecoyCount：每一句最少 / 最多有多少個替身（混淆）字
             —— 若某句字數少於 minDecoyCount，則以該句字數為上限（保底至少 1）
             —— 玩家答對「該句所有替身字」才進入下一句；只要答錯其中任何一個 → 扣心 + 揭示 + 進下一句
        */
        difficultySettings: {
            '小學': {
                timeLimitRate: 9, poemMinRating: 6, maxMistakeCount: 5, decoyLevel: 1,
                distractorLevel: 1, showDecoyHint: true, lineCount: 4,
                minDecoyCount: 1, maxDecoyCount: 1
            },
            '中學': {
                timeLimitRate: 9, poemMinRating: 5, maxMistakeCount: 4, decoyLevel: 2,
                distractorLevel: 2, showDecoyHint: true, lineCount: 6,
                minDecoyCount: 1, maxDecoyCount: 2
            },
            '高中': {
                timeLimitRate: 9, poemMinRating: 4, maxMistakeCount: 3, decoyLevel: 3,
                distractorLevel: 3, showDecoyHint: false, lineCount: 8,
                minDecoyCount: 1, maxDecoyCount: 2
            },
            '大學': {
                timeLimitRate: 9, poemMinRating: 3, maxMistakeCount: 2, decoyLevel: 4,
                distractorLevel: 4, showDecoyHint: false, lineCount: 12,
                minDecoyCount: 1, maxDecoyCount: 3
            },
            '研究所': {
                timeLimitRate: 9, poemMinRating: 3, maxMistakeCount: 1, decoyLevel: 5,
                distractorLevel: 5, showDecoyHint: false, lineCount: 16,
                minDecoyCount: 2, maxDecoyCount: 3
            }
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
            // game31-overlay 保留為本遊戲私有 hook；fm-overlay 承載共用米色宣紙外觀（詳見 theme_xuanzhi.css）
            div.className = 'game31-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game31-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game31-diff-tag" data-level="小學">小學</button>
                        <button id="game31-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game31-newGame-btn" class="fm-nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game31-hearts" class="fm-hearts"></div>
                    <div id="game31-poem-info" class="fm-poem-info"></div>
                </div>
                <div class="game31-area">
                    <div class="game31-info">
                        <div id="game31-progress-text" class="game31-progress-text"></div>
                    </div>
                    <div id="game31-stage" class="game31-stage">
                        <svg id="game31-timer-ring" class="fm-timer-ring">
                            <rect id="game31-timer-path" class="fm-timer-path" x="3" y="3"></rect>
                        </svg>
                        <!-- 候選字直排浮現於詩句上方（紅線已刪除，改以「淺藍放大 1.5x」標示選中候選） -->
                        <div id="game31-candidates" class="game31-candidates hidden"></div>
                        <!-- 詩句橫排：移至遊戲區偏上方（約 1/3 高度） -->
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

            // 詩詞名稱最多顯示 8 字（避免在 fm-sub-header 右側與左邊紅心重疊，同 game1/game20 慣例）
            let title31 = this.currentPoem.title;
            if (title31.length > 8) title31 = title31.substring(0, 8) + "…";
            document.getElementById('game31-poem-info').textContent =
                `${title31} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
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

        /* 為每行詩生成一題：依難度決定該句要放幾個替身字（1~3 個不等）→
           每個替身各自生成一個「替身字」；候選字集會在玩家按下時針對「當下按的位置」
           即時重新生成（見 regenerateCandidatesForPress），這裡不再預先算 candidates。
        */
        generateQuestions: function () {
            this.questions = [];
            const settings = this.difficultySettings[this.difficulty];
            for (let i = 0; i < this.poemLines.length; i++) {
                const line = this.poemLines[i];
                if (!line || line.length === 0) continue;

                // 依難度隨機決定該句要放幾個替身：
                //   ⚠️ 無論字數多短、難度多高，該句至少要保留 2 個「正確字」（非替身），
                //   避免例如三字句只剩 1 個正確字時玩法難以理解（無從判斷句意、失去對照基準）。
                //   故替身數上限 = min(難度設定的 maxDecoyCount, 該句字數 - 2)。
                const minD = Math.max(1, settings.minDecoyCount || 1);
                const maxD = Math.max(minD, settings.maxDecoyCount || minD);
                const cap = Math.min(maxD, Math.max(1, line.length - 2));
                const floor = Math.min(minD, cap);
                const decoyCount = Math.floor(Math.random() * (cap - floor + 1)) + floor;

                // 從該句所有字位隨機挑 decoyCount 個不重複位置
                const available = [];
                for (let k = 0; k < line.length; k++) available.push(k);
                this.shuffleInPlace(available);
                const positions = available.slice(0, decoyCount).sort((a, b) => a - b);

                // 為每個替身位置各自生成「該位置原字 → 替身字」
                //   同一句不同替身彼此不衝突：後生成者的替身若剛好等於前者的原字，
                //   會在字池篩選階段被排除（pickDecoyChar 只保證 !== 該位置原字，故此處再過濾）
                const usedDecoys = new Set();
                const decoys = positions.map(charIdx => {
                    const original = line[charIdx];
                    let decoy = this.pickDecoyChar(original, settings.decoyLevel);
                    // 避免同一句兩個替身字撞在一起，且替身不能剛好等於句中其他字（會混淆玩家）
                    let safety = 20;
                    while (safety-- > 0 &&
                        (usedDecoys.has(decoy) || line.indexOf(decoy) >= 0)) {
                        decoy = this.pickDecoyChar(original, settings.decoyLevel);
                    }
                    usedDecoys.add(decoy);
                    return { charIdx, original, decoy, solved: false };
                });

                // 煉字典故（隨機選一則占位）
                const lore = this.loreDB[Math.floor(Math.random() * this.loreDB.length)];

                this.questions.push({
                    lineIdx: i,
                    decoys: decoys,   // [{ charIdx, original, decoy, solved }, ...]
                    lore: lore
                });
            }
        },

        // 供 generateQuestions 內部用：對陣列原地洗牌（不生新陣列）
        shuffleInPlace: function (arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
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

        /* 渲染當前題目（橫排詩句，該句所有替身位置都換成替身字；已答對的替身位置顯示原字並套綠字外框） */
        renderCurrentQuestion: function () {
            const verse = document.getElementById('game31-verse');
            verse.innerHTML = '';
            if (this.currentQuestionIdx >= this.questions.length) return;

            const q = this.questions[this.currentQuestionIdx];
            const line = this.poemLines[q.lineIdx];
            const settings = this.difficultySettings[this.difficulty];

            // 建 charIdx → decoy 物件的對照表，方便迴圈中快速查該位置是否為替身
            const decoyMap = {};
            q.decoys.forEach(d => { decoyMap[d.charIdx] = d; });

            for (let i = 0; i < line.length; i++) {
                // 每個字為「垂直堆疊：字 + 向下箭頭」，箭頭提示玩家往下拖曳（避免手指遮住字）
                const wrapper = document.createElement('span');
                wrapper.className = 'game31-verse-cell';

                const span = document.createElement('span');
                span.className = 'game31-verse-char';
                span.dataset.idx = i;

                const d = decoyMap[i];
                if (d && d.solved) {
                    // 該位置已被玩家在本輪內答對過 → 顯示原字，套綠字外框（本輪不再重播動畫）
                    span.textContent = d.original;
                    span.classList.add('game31-reveal-static');
                } else if (d) {
                    // 該位置為未解替身 → 顯示替身字，並依難度決定是否高亮
                    span.textContent = d.decoy;
                    span.classList.add('game31-decoy');
                    if (settings.showDecoyHint) span.classList.add('game31-decoy-hint');
                } else {
                    // 一般字（非替身位置）
                    span.textContent = line[i];
                }
                wrapper.appendChild(span);

                const arrow = document.createElement('span');
                arrow.className = 'game31-drag-arrow';
                arrow.textContent = '▼';
                arrow.setAttribute('aria-hidden', 'true');
                wrapper.appendChild(arrow);

                verse.appendChild(wrapper);
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
            // 兼容點擊到箭頭：往上找到 .game31-verse-cell 再取內部字
            if (target && target.classList && target.classList.contains('game31-drag-arrow')) {
                target = target.parentElement && target.parentElement.querySelector('.game31-verse-char');
            }
            if (!target || !target.classList || !target.classList.contains('game31-verse-char')) return;

            e.preventDefault();
            const charIdx = parseInt(target.dataset.idx);

            // 已解替身位置（顯示綠字）不可再點 —— 避免玩家誤點導致「已答對又扣心」
            const q0 = this.questions[this.currentQuestionIdx];
            if (q0) {
                const already = q0.decoys.find(d => d.charIdx === charIdx && d.solved);
                if (already) return;
            }

            this.isDragging = true;
            this.dragCharElement = target;
            this.dragCharIndex = charIdx;
            this.candidateOffset = 0;

            const pt = this.getPointer(e);
            this.dragStartY = pt.y;
            this.dragCurrentY = pt.y;

            // 玩家按下的字暫時隱藏（原本改金色 → 現在直接看不到，避免手指未遮住時仍見到字影響思考）
            target.classList.add('game31-pressed');

            // 每次點擊都重新生成候選字（避免玩家用試探比對「候選集」找出正確答案）
            this.regenerateCandidatesForPress(charIdx);
            this.showCandidates(target);

            if (window.SoundManager) window.SoundManager.playOpenItem();
        },

        // 依玩家按下的字位置生成當次候選字集：
        //   - 若按到「未解替身位置」→ 候選集含該位置的原字 + 3 個相關干擾（打亂）
        //   - 若按到「非替身位置」或「已解替身位置」→ 候選集不含任何未解替身的原字（避免直接暴露答案）
        //   → 不同位置候選集完全不同，玩家無法用「哪個候選集出現正確答案」來作弊
        //   ⚠️ 多替身題：需同時排除「該句所有未解替身的原字 / 替身字」，避免玩家從候選字反推
        regenerateCandidatesForPress: function (charIdx) {
            const q = this.questions[this.currentQuestionIdx];
            const line = this.poemLines[q.lineIdx] || '';
            const settings = this.difficultySettings[this.difficulty];

            // 找出「玩家按下的是否為某個未解替身」
            const activeDecoy = q.decoys.find(d => d.charIdx === charIdx && !d.solved);

            // 蒐集當句所有「未解替身」的原字與替身字，供後續過濾用
            const unsolvedOriginals = new Set(q.decoys.filter(d => !d.solved).map(d => d.original));
            const unsolvedDecoys = new Set(q.decoys.filter(d => !d.solved).map(d => d.decoy));

            // 玩家按下的位置目前顯示的字（若為未解替身則是替身字；否則為原詩字）
            const shownChar = activeDecoy ? activeDecoy.decoy : line[charIdx];

            let base;
            if (activeDecoy) {
                // 未解替身位置：候選集必含該替身「自己」的原字，其餘 3 個為相關干擾
                base = [activeDecoy.original].concat(
                    this.pickDistractors(activeDecoy.original, activeDecoy.decoy, 3, settings.distractorLevel)
                );
                // 排除「其他未解替身」的原字（保留自己的）— 避免暴露別題答案
                base = base.filter(c => c === activeDecoy.original || !unsolvedOriginals.has(c));
            } else {
                // 非替身位置（或已解位置）：不能出現任何未解替身的原字（否則暴露答案）
                let distractors = this.pickDistractors(shownChar, null, 4, settings.distractorLevel);
                distractors = distractors.filter(c =>
                    c !== shownChar && !unsolvedOriginals.has(c) && !unsolvedDecoys.has(c)
                );
                while (distractors.length < 4) {
                    const pool = this.decoyPool['其他'];
                    const pick = pool[Math.floor(Math.random() * pool.length)];
                    if (pick !== shownChar && !unsolvedOriginals.has(pick) && !unsolvedDecoys.has(pick) && !distractors.includes(pick)) {
                        distractors.push(pick);
                    }
                }
                base = distractors.slice(0, 4);
            }

            // 保險：任何情況下都移除 shownChar
            base = base.filter(c => c !== shownChar);
            // 若過濾後不足 4 個，用「其他」池補齊（同樣避開所有未解替身原字/替身字）
            while (base.length < 4) {
                const pool = this.decoyPool['其他'];
                const pick = pool[Math.floor(Math.random() * pool.length)];
                const isSelfOriginal = activeDecoy && pick === activeDecoy.original;
                const conflictsOriginal = !isSelfOriginal && unsolvedOriginals.has(pick);
                if (pick !== shownChar && !conflictsOriginal && !unsolvedDecoys.has(pick) && !base.includes(pick)) {
                    base.push(pick);
                }
            }
            this.currentCandidates = this.shuffle(base);

            // 替身位置的正解不能停在中央（提交預設位置），強制玩家至少拖曳一次
            if (activeDecoy) {
                const N = this.currentCandidates.length;
                const centerIdx = Math.floor(N / 2);
                if (this.currentCandidates[centerIdx] === activeDecoy.original) {
                    let swapIdx;
                    do { swapIdx = Math.floor(Math.random() * N); } while (swapIdx === centerIdx);
                    [this.currentCandidates[centerIdx], this.currentCandidates[swapIdx]]
                        = [this.currentCandidates[swapIdx], this.currentCandidates[centerIdx]];
                }
            }
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

            // 點擊即判定（即使玩家沒有拖曳，也要判勝負；沒拖曳＝停在正中央候選字）
            const q = this.questions[this.currentQuestionIdx];
            const cands = this.currentCandidates || [];
            const N = cands.length;
            const centerIdx = Math.floor(N / 2);
            const pickIdx = ((centerIdx - this.candidateOffset) % N + N) % N;
            const submitted = cands[pickIdx];

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

        /* 顯示候選字直排於指定字元上方（候選由 regenerateCandidatesForPress 於按下瞬間即時生成） */
        showCandidates: function (charEl) {
            const cands = this.currentCandidates || [];
            const cont = document.getElementById('game31-candidates');
            const stage = document.getElementById('game31-stage');
            const stageRect = stage.getBoundingClientRect();
            const charRect = charEl.getBoundingClientRect();

            // 詩句字左邊位置（轉成 stage 內座標，需要除以 stageScale）
            const scale = window.stageScale || 1;
            const left = (charRect.left - stageRect.left) / scale + (charRect.width / scale) / 2;

            cont.innerHTML = '';
            for (let i = 0; i < cands.length; i++) {
                const div = document.createElement('div');
                div.className = 'game31-candidate-char';
                div.textContent = cands[i];
                div.dataset.idx = i;
                cont.appendChild(div);
            }
            cont.style.left = left + 'px';
            cont.classList.remove('hidden');

            this.candidateOffset = 0;
            this.updateCandidatesScroll();
        },

        hideCandidates: function () {
            const cont = document.getElementById('game31-candidates');
            if (cont) cont.classList.add('hidden');
        },

        /* 根據 candidateOffset 重新排列候選字位置，並標出「選定字」（active）。
           ⚠️ 顯示規則：無論輪盤如何循環轉動，畫面固定呈現 4 個字：
              - 最下方 slot（slot 3）：選定字（game31-cand-active）
              - 上方 slot 0~2：緊鄰選定字之前 3 個候選字（灰白色）
              - 其餘候選字（距離 ≥ 4）一律隱藏
         */
        updateCandidatesScroll: function () {
            const cont = document.getElementById('game31-candidates');
            if (!cont) return;
            const items = cont.querySelectorAll('.game31-candidate-char');
            const N = items.length;
            if (N === 0) return;
            const CELL_H = 72;
            const centerIdx = Math.floor(N / 2);
            const offset = this.candidateOffset;
            // 選定字位置的候選 = 第 (centerIdx - offset) mod N
            const redIdx = ((centerIdx - offset) % N + N) % N;
            items.forEach((el, i) => {
                // dist = 該候選要再等 dist 步才輪到（沿輪盤順向）
                //   dist=0：選定字        → slot 3（最下）
                //   dist=1,2,3：灰白字    → slot 2,1,0（依序往上）
                //   dist≥4：目前不可見    → 隱藏
                const dist = ((redIdx - i) % N + N) % N;
                if (dist <= 3) {
                    const slotIdx = 3 - dist;  // 0→3, 1→2, 2→1, 3→0
                    el.style.transform = `translateY(${slotIdx * CELL_H}px)`;
                    el.style.opacity = '1';
                } else {
                    // 隱藏：置於頂端外並淡出，讓進入 / 離開視覺順滑
                    el.style.transform = `translateY(${-CELL_H}px)`;
                    el.style.opacity = '0';
                }
                el.classList.toggle('game31-cand-active', i === redIdx);
            });
        },

        /* 判定答案（多替身版）：
             - 玩家按到「未解替身位置」+ 選中該位置的原字 → 該替身標記為 solved，加分並綠字亮起
                 · 若該句仍有其他未解替身 → 停在該句繼續讓玩家找下一個替身
                 · 若該句所有替身皆已 solved → 進下一句
             - 其他情況（按到非替身位置 / 按到替身位置但選了錯字）→ 扣心，把該句剩餘未解替身
               全部揭示為紅字原字，進下一句（或達失敗上限則遊戲結束）
        */
        judgeAnswer: function (q, submitted) {
            const verse = document.getElementById('game31-verse');

            // 玩家按到的位置若是某個「未解替身」，即為本次要判定的目標
            const activeDecoy = q.decoys.find(d => d.charIdx === this.dragCharIndex && !d.solved);
            const pickedRight = !!activeDecoy && (submitted === activeDecoy.original);

            this.hideCandidates();

            if (pickedRight) {
                // 本次替身答對 → 標記 solved、綠字浮現、加分
                if (window.SoundManager) window.SoundManager.playSuccess();
                activeDecoy.solved = true;

                if (this.dragCharElement) {
                    this.dragCharElement.textContent = activeDecoy.original;
                    this.dragCharElement.classList.remove('game31-decoy', 'game31-decoy-hint');
                    this.dragCharElement.classList.add('game31-reveal');
                }

                const pts = (window.ScoreManager && window.ScoreManager.gameSettings.game31)
                    ? window.ScoreManager.gameSettings.game31.getPointA : 50;
                this.score += pts;
                document.getElementById('game31-score').textContent = this.score;

                // 若該句所有替身皆已 solved → 延遲後進下一句（換句動畫期間才需要鎖住輸入）；
                // 否則該句還有其他未解替身 → ⚠️ 不設 isAnimating，讓玩家可以立刻拖曳下一個替身，
                //   不必等這顆字的 0.6s 綠字浮現動畫播完，避免浪費玩家時間。
                const allSolved = q.decoys.every(d => d.solved);
                if (allSolved) {
                    this.isAnimating = true;
                    setTimeout(() => {
                        this.isAnimating = false;
                        this.nextQuestion();
                    }, 900);
                }

            } else {
                // 答錯（不論是按錯位置、還是按對位置但選錯原字）→ 扣心 + 揭示 + 進下一句
                // ⚠️ 答錯情境仍需鎖住輸入：揭示動畫與扣心結算期間不應允許玩家繼續拖曳。
                this.isAnimating = true;
                if (window.SoundManager) window.SoundManager.playFailure();
                if (this.dragCharElement) {
                    this.dragCharElement.classList.add('game31-wrong');
                    setTimeout(() => {
                        if (this.dragCharElement) this.dragCharElement.classList.remove('game31-wrong');
                    }, 800);
                }
                // 揭示該句所有「未解替身」的原字（已解替身維持綠字，不動）
                setTimeout(() => {
                    q.decoys.forEach(d => {
                        if (d.solved) return;
                        const el = verse.querySelector(`.game31-verse-char[data-idx="${d.charIdx}"]`);
                        if (el) {
                            el.textContent = d.original;
                            el.classList.add('game31-revealed-wrong');
                        }
                    });
                }, 400);
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
            // 舊句先左至右一格一格縮小消失（0.05s 錯開、每格 0.3s），
            // 再切換並讓新句以相同節奏放大浮現。避免題目間的視覺跳切。
            this._animateVerseOut(() => {
                this.currentQuestionIdx++;
                if (this.currentQuestionIdx >= this.questions.length) {
                    this.gameOver(true, '');
                    return;
                }
                this.renderCurrentQuestion();
                this.updateProgressText();
                this._animateVerseIn();
            });
        },

        // 舊句消失：由左至右依序 scale→0
        _animateVerseOut: function (done) {
            const cells = document.querySelectorAll('#game31-verse .game31-verse-cell');
            if (!cells.length) { done && done(); return; }
            const stagger = 50, dur = 300;
            cells.forEach((cell, i) => {
                setTimeout(() => {
                    cell.style.transition = `transform ${dur}ms ease-in, opacity ${dur}ms ease-in`;
                    cell.style.transformOrigin = 'center center';
                    cell.style.transform = 'scale(0)';
                    cell.style.opacity = '0';
                }, i * stagger);
            });
            const total = (cells.length - 1) * stagger + dur + 40;
            setTimeout(() => { done && done(); }, total);
        },

        // 新句浮現：初始 scale=0，由左至右依序 scale→1
        _animateVerseIn: function () {
            const cells = document.querySelectorAll('#game31-verse .game31-verse-cell');
            if (!cells.length) return;
            const stagger = 50, dur = 300;
            // 先全部設為隱藏（不觸發過渡）
            cells.forEach(cell => {
                cell.style.transition = 'none';
                cell.style.transformOrigin = 'center center';
                cell.style.transform = 'scale(0)';
                cell.style.opacity = '0';
            });
            // 強制重排以套用初始狀態
            void document.getElementById('game31-verse').offsetHeight;
            cells.forEach((cell, i) => {
                setTimeout(() => {
                    cell.style.transition = `transform ${dur}ms ease-out, opacity ${dur}ms ease-out`;
                    cell.style.transform = 'scale(1)';
                    cell.style.opacity = '1';
                }, i * stagger);
            });
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
                // 勝利動畫：黃色弧段順時針縮短
                const clamped = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                rect.style.strokeDashoffset = clamped * perimeter;
                // 色相／飽和度取自主題金黃 --fm-timer-gold；亮度隨剩餘比例掃動（base.l-15 → base.l+5），
                // 並以 25 為亮度保底避免主題值過暗時變黑。
                const base = this.getTimerBaseColor('--fm-timer-gold', { h: 40, s: 66, l: 45 });
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

        /* === 紅心 === */
        renderHearts: function () {
            const container = document.getElementById('game31-hearts');
            if (!container) return;
            container.innerHTML = '';
            let max = this.difficultySettings[this.difficulty].maxMistakeCount;
            if (max > 10) max = 0;
            for (let i = 0; i < max; i++) {
                const span = document.createElement('span');
                span.className = 'fm-heart';
                span.textContent = '♥';
                container.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game31-hearts .fm-heart');
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
                    heartsSelector: '#game31-hearts .fm-heart:not(.empty)',
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
