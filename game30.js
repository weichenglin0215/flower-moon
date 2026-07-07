/* =========================================
   Game30《層巒疊翠》(Mountain-Verse Mahjong)
   ----------------------------------------
   花月版 A7 麻將疊疊版 ── 偽 3D 立體字牌山。
   單擊「最上層、左右未遮擋」的字牌 → 飛入暫存槽；
   暫存槽集滿 3 張同字自動消除；
   順序加成：消除字序符合詩句字序時觸發 ×N。
   ----------------------------------------
   依《花月開發常見錯誤與解法.md §4》規範：
   - class 全前綴 game30-
   - loadCSS() 動態防護（id=game30-css）
   - overlay 掛載 document.body 並套 registerOverlayResize
   - stopGame() 必須隱藏 container
   - 完整支援關卡挑戰模式（callback 接 (selectedLevel, levelIndex)）
   - 時限 = targetChars.length × timeLimitRate（取詩後計算）
   - 詩透過 getSharedRandomPoem 抽取
   ========================================= */

(function () {
    const Game30 = {
        // ── 共用狀態 ──
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // ── 詩詞與目標 ──
        currentPoem: null,
        poemLines: [],
        targetChars: [],          // 全詩去標點後的字陣列（含順序）
        collectProgress: {},      // { 字: 已收集次數（每字最終目標 = 出現次數） }

        // ── 牌山 ──
        tiles: [],                // 牌山所有字牌 { id, char, layer, x, y, w, h, el, removed }
        TILE_W: 50,
        TILE_H: 60,
        // 牌山內邏輯區寬 / 高（CSS 中 wrapper height=460, 我們留邊距）
        TOWER_W: 460,
        TOWER_H: 440,
        LAYER_OFFSET_X: 4,
        LAYER_OFFSET_Y: 5,

        // ── 暫存槽 ──
        buffer: [],               // 槽中字陣列（保持插入順序，渲染時依字排序集群）
        bufferCapacity: 7,

        // ── 順序加成 ──
        orderIdx: 0,              // 已順序消除到第幾字（targetChars 的索引）
        orderStreak: 0,           // 連續符合字序的「組」數

        // ── 計時 ──
        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        animLocked: false,

        // 全詩去重後字陣列（首次出現順序）— 同字同色 HUE 索引基準
        uniquePoemChars: [],

        // 同字必同色：依字在 uniquePoemChars 索引等分 360°
        getHueForChar: function (ch) {
            if (!ch) return 40;
            const idx = this.uniquePoemChars.indexOf(ch);
            if (idx >= 0) {
                const n = this.uniquePoemChars.length || 1;
                return window.TileStyleUtils.getGroupColor(idx, n).hue;
            }
            let h = 0;
            for (let i = 0; i < ch.length; i++) h = (h * 31 + ch.charCodeAt(i)) >>> 0;
            return h % 360;
        },
        isPoemChar: function (ch) {
            return this.uniquePoemChars.indexOf(ch) >= 0;
        },

        /*
         * 難度設定（依企劃書 §7）
         * totalTiles    ：牌山總牌數
         * layers        ：牌山層數
         * decoyRatio    ：干擾字佔比
         * bufferCapacity：暫存槽容量
         * orderBonus    ：順序加成倍率
         * timeLimitRate ：每字時間倍率（× targetChars.length 為總秒數）
         */
        difficultySettings: {
            '小學':   { totalTiles: 30, layers: 3, decoyRatio: 0.10, bufferCapacity: 7, orderBonus: 2, timeLimitRate: 12, poemMinRating: 6, minLines: 2, maxLines: 4, minChars: 8,  maxChars: 16 },
            '中學':   { totalTiles: 36, layers: 3, decoyRatio: 0.20, bufferCapacity: 7, orderBonus: 2, timeLimitRate: 10, poemMinRating: 5, minLines: 2, maxLines: 4, minChars: 10, maxChars: 20 },
            '高中':   { totalTiles: 45, layers: 4, decoyRatio: 0.30, bufferCapacity: 7, orderBonus: 3, timeLimitRate: 9,  poemMinRating: 4, minLines: 2, maxLines: 4, minChars: 12, maxChars: 24 },
            '大學':   { totalTiles: 54, layers: 4, decoyRatio: 0.40, bufferCapacity: 6, orderBonus: 3, timeLimitRate: 8,  poemMinRating: 3, minLines: 2, maxLines: 4, minChars: 16, maxChars: 28 },
            '研究所': { totalTiles: 60, layers: 5, decoyRatio: 0.50, bufferCapacity: 5, orderBonus: 5, timeLimitRate: 7,  poemMinRating: 3, minLines: 2, maxLines: 4, minChars: 18, maxChars: 32 }
        },

        // 干擾字備援池
        decoyPool: '山水雲月風花雪夜春秋江湖天地人心夢酒詩書情思路愁影歸客孤舟鴻雁柳松青白紅黃綠寒暖暮朝晨窗門簾燈樓臺亭閣岸渡橋池塘草木林泉石玉珠香韻聲鐘鼓笛簫琴瑟絲竹翠嶺峰巒嵐霧露',

        // ── CSS 載入防護 ──
        loadCSS: function () {
            if (!document.getElementById('game30-css')) {
                const link = document.createElement('link');
                link.id = 'game30-css';
                link.rel = 'stylesheet';
                link.href = 'game30.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game30-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game30-container');
        },

        // ── 建立 overlay DOM（掛 document.body） ──
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game30-container';
            div.className = 'game30-overlay hidden';
            div.innerHTML = `
                <div class="game30-header">
                    <div class="game30-score-board">分數: <span id="game30-score">0</span></div>
                    <div class="game30-controls">
                        <button class="game30-difficulty-tag" id="game30-diff-tag">小學</button>
                        <button id="game30-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game30-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game30-sub-header">
                    <div id="game30-moves-label" class="game30-moves-label" style="display:none">盤面:<span id="game30-stage-text">1/1</span> 步數:<span id="game30-moves">0</span>/<span id="game30-max-moves">0</span></div>
                    <div id="game30-poem-info" class="poem-info"></div>
                </div>
                <div class="game30-info-bar">
                    <div id="game30-line-text" class="game30-line-text" style="display:none"></div>
                    <div id="game30-progress-text" class="game30-progress-text">剩餘牌：0</div>
                    <div id="game30-bonus-text" class="game30-bonus-text">順序加成 ×1</div>
                    <div id="game30-tracker" class="game30-tracker"></div>
                </div>
                <div class="game30-area">
                    <div class="game30-info"></div>
                    <div class="game30-tower-wrapper" id="game30-tower-wrapper">
                        <svg id="game30-timer-ring">
                            <rect id="game30-timer-path" x="3" y="3"></rect>
                        </svg>
                        <div id="game30-tower" class="game30-tower"></div>
                    </div>
                    <div id="game30-buffer" class="game30-buffer"></div>
                    <div class="game30-bottom-bar">
                        <button id="game30-hint-btn" class="game30-action-btn">💡提示 (-10)</button>
                        <button id="game30-undo-btn" class="game30-action-btn">↩ 撤回 (-15)</button>
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

            document.getElementById('game30-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game30-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game30-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            document.getElementById('game30-hint-btn').onclick = () => { this.useHint(); };
            document.getElementById('game30-undo-btn').onclick = () => { this.useUndo(); };
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },
        hide: function () { this.stopGame(); },

        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('層巒疊翠', (selectedLevel, levelIndex) => {
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
            const diffTag = document.getElementById('game30-diff-tag');
            const retryBtn = document.getElementById('game30-retryGame-btn');
            const newBtn = document.getElementById('game30-newGame-btn');
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
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = 'none';
        },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，因此本函式必須隱藏 overlay
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

        // ── 啟動局內流程 ──
        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.updateUIForMode();
            this.score = 0;
            this.orderIdx = 0;
            this.orderStreak = 0;
            this.buffer = [];
            this.animLocked = false;

            const settings = this.difficultySettings[this.difficulty];
            this.bufferCapacity = settings.bufferCapacity;

            document.getElementById('game30-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            // 初始化收集進度：每個詩字目標 = 出現次數
            this.collectProgress = {};
            this.targetChars.forEach(ch => {
                this.collectProgress[ch] = this.collectProgress[ch] || { need: 0, have: 0 };
                this.collectProgress[ch].need++;
            });
            // 重置 have
            Object.keys(this.collectProgress).forEach(k => this.collectProgress[k].have = 0);

            // 重新生成牌山（重來也重生）
            this.generateTower();
            this.renderTower();
            this.renderBuffer();
            this.renderTracker();
            this.updateProgressText();
            this.updateBonusText();
            this.updateVisibility();

            document.getElementById('game30-retryGame-btn').disabled = false;
            document.getElementById('game30-newGame-btn').disabled = false;

            // 時限 = targetChars.length × timeLimitRate
            if (settings.timeLimitRate > 0 && this.targetChars.length > 0) {
                this.maxTimer = Math.ceil(this.targetChars.length * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game30-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game30-timer-ring').style.display = 'none';
            }
        },

        // ── 抽詩 ──
        selectRandomPoem: function () {
            if (typeof getSharedRandomPoem !== 'function') {
                console.error('需要 script.js 的 getSharedRandomPoem');
                return false;
            }
            const settings = this.difficultySettings[this.difficulty];
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                settings.minLines,
                settings.maxLines,
                settings.minChars,
                settings.maxChars,
                '',
                this.isLevelMode ? this.currentLevelIndex : null,
                'game30'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            this.poemLines = result.lines;
            this.targetChars = this.poemLines.join('').split('');

            // 詩名截斷 16 字 + 全名 title（與 game24/game28 統一規則）
            const fullName = `${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            const infoText = fullName.length > 16 ? (fullName.slice(0, 15) + '…') : fullName;
            const infoEl = document.getElementById('game30-poem-info');
            infoEl.textContent = infoText;
            infoEl.title = fullName;
            infoEl.dataset.poemId = this.currentPoem.id;

            // 全詩去重後字（首次出現順序）— 同字同色 HUE 索引基準
            const seen = {};
            this.uniquePoemChars = [];
            for (const ch of this.targetChars) {
                if (!seen[ch]) { seen[ch] = true; this.uniquePoemChars.push(ch); }
            }
            infoEl.onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
            };
            return true;
        },

        // ── 牌山生成 ──
        // 1) 字袋（charBag）：每字 3 的倍數張
        //    詩字佔 (1 - decoyRatio)，干擾佔 decoyRatio
        //    詩字數量 ∝ 字頻
        // 2) 多層分布：上層較少張、下層較多張（金字塔型）
        // 3) 各層位置採梅花樁式錯位（layer 偶/奇 半格偏移）
        generateTower: function () {
            const settings = this.difficultySettings[this.difficulty];
            const total = settings.totalTiles;
            const layers = settings.layers;

            // ── (A) 計算「3 的倍數」總張數 ──
            // total 不一定是 3 的倍數，調整：取最接近且 ≤ total 的 3 倍數
            const totalAdj = Math.floor(total / 3) * 3;

            // ── (B) 詩字 / 干擾字數量分配（皆為 3 的倍數） ──
            let decoyTriples = Math.floor((totalAdj * settings.decoyRatio) / 3);
            let poemTriples = totalAdj / 3 - decoyTriples;
            if (poemTriples < 1) { poemTriples = 1; decoyTriples = totalAdj / 3 - 1; }

            // ── (C) 詩字選哪些？依字頻加權，每字配 N 個 triple ──
            // 統計詩字字頻
            const freq = {};
            this.targetChars.forEach(ch => { freq[ch] = (freq[ch] || 0) + 1; });
            const uniqPoemChars = Object.keys(freq);

            // 為了「保證每個詩字至少 3 張」，先給每個詩字 1 個 triple
            const tripleAlloc = {};   // char -> triple 個數
            uniqPoemChars.forEach(ch => { tripleAlloc[ch] = 0; });

            let remainingPoemTriples = poemTriples;
            // 每個詩字至少 1 triple（若 triple 不夠則優先給字頻高者）
            const orderedByFreq = uniqPoemChars.slice().sort((a, b) => freq[b] - freq[a]);
            for (const ch of orderedByFreq) {
                if (remainingPoemTriples <= 0) break;
                tripleAlloc[ch] = 1;
                remainingPoemTriples--;
            }
            // 剩餘 triple 依字頻權重輪流分配
            let safety = 0;
            while (remainingPoemTriples > 0 && safety < 500) {
                for (const ch of orderedByFreq) {
                    if (remainingPoemTriples <= 0) break;
                    tripleAlloc[ch]++;
                    remainingPoemTriples--;
                }
                safety++;
            }

            // ── (D) 干擾字三連 ──
            const decoyAvailable = this.decoyPool.split('').filter(c => !uniqPoemChars.includes(c));
            // 洗牌
            for (let i = decoyAvailable.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [decoyAvailable[i], decoyAvailable[j]] = [decoyAvailable[j], decoyAvailable[i]];
            }
            const decoyChars = [];
            for (let i = 0; i < decoyTriples; i++) {
                decoyChars.push(decoyAvailable[i % decoyAvailable.length]);
            }

            // ── (E) 組裝完整字袋（每字 3 張） ──
            const charBag = [];
            Object.keys(tripleAlloc).forEach(ch => {
                for (let i = 0; i < tripleAlloc[ch] * 3; i++) charBag.push(ch);
            });
            decoyChars.forEach(ch => {
                for (let i = 0; i < 3; i++) charBag.push(ch);
            });
            // 若實際數量不足 totalAdj，補干擾字
            while (charBag.length < totalAdj) {
                const ch = decoyAvailable[Math.floor(Math.random() * decoyAvailable.length)] || '山';
                charBag.push(ch, ch, ch);
            }
            // 洗牌字袋
            for (let i = charBag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [charBag[i], charBag[j]] = [charBag[j], charBag[i]];
            }

            // ── (F) 各層牌數：金字塔（上少下多） ──
            // 平均分配後將「上層」減量、下層補回
            const perLayer = new Array(layers).fill(0);
            const baseEach = Math.floor(totalAdj / layers);
            for (let i = 0; i < layers; i++) perLayer[i] = baseEach;
            let leftover = totalAdj - baseEach * layers;
            // 金字塔調整：頂層減 / 底層加（每層差 2~3）
            for (let i = 0; i < layers; i++) {
                const delta = Math.round((i - (layers - 1) / 2) * 2); // 底大頂小
                perLayer[i] += delta;
            }
            // 修正以確保總和 = totalAdj 且每層 ≥ 1
            let sum = perLayer.reduce((a, b) => a + b, 0);
            let diff = totalAdj - sum;
            perLayer[layers - 1] += diff;
            for (let i = 0; i < layers; i++) {
                if (perLayer[i] < 1) {
                    const need = 1 - perLayer[i];
                    perLayer[i] = 1;
                    perLayer[layers - 1] -= need;
                }
            }

            // ── (G) 位置生成：每層產生 perLayer[i] 個不重疊位置 ──
            // 採半格錯位網格：基礎格 (TILE_W * 0.55, TILE_H * 0.55)
            // layer 越高 → 範圍越窄、位置往中央集中（金字塔形）
            this.tiles = [];
            let tileIdCounter = 0;
            let bagIdx = 0;

            const slotW = this.TILE_W * 0.55;
            const slotH = this.TILE_H * 0.55;

            for (let l = 0; l < layers; l++) {
                const count = perLayer[l];

                // 該層中央區域：層越高 → 寬高越小
                const shrinkFactor = 1 - l * 0.12;
                const usableW = this.TOWER_W * shrinkFactor - this.TILE_W;
                const usableH = this.TOWER_H * shrinkFactor - this.TILE_H;
                const baseX = (this.TOWER_W - usableW - this.TILE_W) / 2;
                const baseY = (this.TOWER_H - usableH - this.TILE_H) / 2;

                // 該層格數
                const cols = Math.max(3, Math.floor(usableW / slotW));
                const rows = Math.max(3, Math.floor(usableH / slotH));

                // 生成候選格子（含 0.5 偏移以實現梅花樁交錯）
                const candidates = [];
                for (let rr = 0; rr < rows; rr++) {
                    for (let cc = 0; cc < cols; cc++) {
                        // 奇數列向右偏移 0.5
                        const offsetX = (rr % 2 === 1) ? slotW * 0.5 : 0;
                        const x = baseX + cc * slotW + offsetX + l * this.LAYER_OFFSET_X;
                        const y = baseY + rr * slotH + l * this.LAYER_OFFSET_Y;
                        // 確認不超出 wrapper
                        if (x + this.TILE_W > this.TOWER_W) continue;
                        if (y + this.TILE_H > this.TOWER_H) continue;
                        candidates.push({ x, y });
                    }
                }
                // 洗牌候選
                for (let i = candidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
                }

                // 取 count 個候選位置（若不夠則所有候選都用）
                const used = candidates.slice(0, Math.min(count, candidates.length));

                used.forEach(pos => {
                    if (bagIdx >= charBag.length) return;
                    this.tiles.push({
                        id: tileIdCounter++,
                        char: charBag[bagIdx++],
                        layer: l,
                        x: pos.x,
                        y: pos.y,
                        w: this.TILE_W,
                        h: this.TILE_H,
                        el: null,
                        removed: false
                    });
                });
            }
        },

        // ── 渲染牌山 ──
        renderTower: function () {
            const tower = document.getElementById('game30-tower');
            tower.innerHTML = '';

            // 依 layer 排序（低層先繪 → 高層後繪 → 視覺上覆蓋）
            const sorted = this.tiles.slice().sort((a, b) => a.layer - b.layer);
            sorted.forEach(t => {
                const el = document.createElement('div');
                el.className = 'game30-tile';
                el.textContent = t.char;
                el.style.left = t.x + 'px';
                el.style.top = t.y + 'px';
                el.style.zIndex = 10 + t.layer * 10;
                el.dataset.tid = t.id;
                el.onclick = () => this.onTileClick(t.id);
                // 同字必同色（HUE 依字在 uniquePoemChars 等分 360°）
                const hue = this.getHueForChar(t.char);
                el.style.setProperty('--g30-h', hue);
                if (this.isPoemChar(t.char)) {
                    el.style.setProperty('--g30-s', '60%');
                    el.style.setProperty('--g30-l', '75%');
                    el.style.setProperty('--g30-text', 'hsl(220, 30%, 14%)');
                    // 同字同形：依字在 uniquePoemChars 索引套五種形狀之一
                    const shpIdx = this.uniquePoemChars.indexOf(t.char);
                    if (shpIdx >= 0) window.TileStyleUtils.applyShape(el, window.TileStyleUtils.getGroupShape(shpIdx));
                } else {
                    el.classList.add('decoy');
                }
                tower.appendChild(el);
                t.el = el;
            });
        },

        // ── 可見性判定 ──
        // 規則：
        //  (1) 上層遮擋：任何 layer 更高的牌，若 bounding box 與本牌重疊 → 本牌不可點
        //  (2) 左右遮擋：同層的另一張牌，若其位置與本牌大幅重疊本牌的左半或右半 → 本牌不可點
        updateVisibility: function () {
            const alive = this.tiles.filter(t => !t.removed);
            alive.forEach(t => {
                let blocked = false;
                for (const o of alive) {
                    if (o.id === t.id) continue;
                    // (1) 上層覆蓋
                    if (o.layer > t.layer && this.rectsOverlap(t, o)) {
                        blocked = true;
                        break;
                    }
                }
                if (!blocked) {
                    // (2) 同層左右遮擋（覆蓋本牌一半以上）
                    let leftBlocked = false, rightBlocked = false;
                    for (const o of alive) {
                        if (o.id === t.id) continue;
                        if (o.layer !== t.layer) continue;
                        // 垂直重疊才算
                        const vOverlap = Math.min(t.y + t.h, o.y + o.h) - Math.max(t.y, o.y);
                        if (vOverlap < t.h * 0.4) continue;
                        // 左側遮擋：o 在 t 左邊且水平重疊 > t.w * 0.3
                        const hOverlap = Math.min(t.x + t.w, o.x + o.w) - Math.max(t.x, o.x);
                        if (hOverlap < t.w * 0.3) continue;
                        if (o.x < t.x) leftBlocked = true;
                        else if (o.x > t.x) rightBlocked = true;
                    }
                    blocked = leftBlocked && rightBlocked;
                }
                t.accessible = !blocked;
                if (!t.el) return;
                if (blocked) {
                    t.el.classList.remove('accessible');
                    t.el.classList.add('blocked');
                } else {
                    t.el.classList.add('accessible');
                    t.el.classList.remove('blocked');
                }
            });
        },

        rectsOverlap: function (a, b) {
            // 嚴格 bounding-box 交集（>0 視為重疊）
            return !(a.x + a.w <= b.x || b.x + b.w <= a.x ||
                     a.y + a.h <= b.y || b.y + b.h <= a.y);
        },

        // ── 點擊字牌 ──
        onTileClick: function (tileId) {
            if (!this.isActive || this.animLocked) return;
            const t = this.tiles.find(x => x.id === tileId);
            if (!t || t.removed) return;
            if (!t.accessible) {
                // 抖動提示
                t.el.classList.add('shake');
                if (window.SoundManager) window.SoundManager.playFailure();
                setTimeout(() => t.el && t.el.classList.remove('shake'), 320);
                return;
            }
            // 暫存槽滿
            if (this.buffer.length >= this.bufferCapacity) {
                if (window.SoundManager) window.SoundManager.playFailure();
                return;
            }
            if (window.SoundManager) window.SoundManager.playOpenItem();
            this.flyTileToBuffer(t);
        },

        // ── 字牌飛入暫存槽 ──
        flyTileToBuffer: function (t) {
            this.animLocked = true;
            t.removed = true;

            // 預先 push 到 buffer 並排序，計算字牌應飛抵之 slot 位置
            this.buffer.push({ char: t.char, tileId: t.id });
            this.sortBuffer();
            this.renderBuffer();

            // 找到該字在 buffer 中的目標 slot DOM 位置
            const slotIdx = this.buffer.findIndex(b => b.tileId === t.id);
            const slots = document.querySelectorAll('#game30-buffer .game30-slot');
            const targetSlot = slots[slotIdx];

            const tower = document.getElementById('game30-tower');
            const towerRect = tower.getBoundingClientRect();
            const slotRect = targetSlot ? targetSlot.getBoundingClientRect() : null;

            // 計算 buffer slot 在 tower 座標系中的 x/y（不考慮 stage scale，因兩者在同一縮放容器內）
            // 改採：以 wrapper 為相對基準
            const wrapper = document.getElementById('game30-tower-wrapper');
            const wRect = wrapper.getBoundingClientRect();
            const scale = window.stageScale || 1;
            let targetX = t.x;
            let targetY = t.y + 200;
            if (slotRect) {
                targetX = (slotRect.left - wRect.left) / scale;
                targetY = (slotRect.top - wRect.top) / scale;
            }

            t.el.classList.add('flying');
            t.el.classList.remove('accessible');
            // 觸發 transition：先抬一下
            requestAnimationFrame(() => {
                t.el.style.left = targetX + 'px';
                t.el.style.top = targetY + 'px';
                t.el.style.transform = 'scale(0.95)';
            });

            setTimeout(() => {
                // 移除原字牌 DOM
                if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el);
                t.el = null;

                // 重新計算可見性
                this.updateVisibility();
                this.updateProgressText();

                // 檢查三連消除
                this.checkAndMerge();

                // 死局 / 失敗檢查
                if (this.buffer.length >= this.bufferCapacity && !this.canMergeAfter()) {
                    // 暫存槽塞滿且無法再湊三連
                    this.animLocked = false;
                    this.gameOver(false, '暫存槽塞滿！');
                    return;
                }

                // 警示狀態
                this.updateBufferWarning();

                this.animLocked = false;
            }, 560);
        },

        // 槽內字按字排序，使同字靠攏
        sortBuffer: function () {
            this.buffer.sort((a, b) => {
                if (a.char < b.char) return -1;
                if (a.char > b.char) return 1;
                return a.tileId - b.tileId;
            });
        },

        // ── 渲染暫存槽 ──
        renderBuffer: function () {
            const container = document.getElementById('game30-buffer');
            container.innerHTML = '';
            for (let i = 0; i < this.bufferCapacity; i++) {
                const slot = document.createElement('div');
                slot.className = 'game30-slot';
                if (i < this.buffer.length) {
                    slot.classList.add('filled');
                    slot.textContent = this.buffer[i].char;
                    slot.dataset.tid = this.buffer[i].tileId;
                }
                container.appendChild(slot);
            }
        },

        updateBufferWarning: function () {
            const el = document.getElementById('game30-buffer');
            const remain = this.bufferCapacity - this.buffer.length;
            if (remain <= 1 && this.buffer.length > 0) {
                el.classList.add('warning');
                if (window.SoundManager && window.SoundManager.playWarning) window.SoundManager.playWarning();
            } else {
                el.classList.remove('warning');
            }
        },

        // ── 三連消除偵測 ──
        checkAndMerge: function () {
            // 統計字數
            const countByChar = {};
            this.buffer.forEach(b => {
                if (!countByChar[b.char]) countByChar[b.char] = [];
                countByChar[b.char].push(b);
            });
            const toMerge = Object.keys(countByChar).filter(c => countByChar[c].length >= 3);
            if (toMerge.length === 0) {
                this.updateBufferWarning();
                return;
            }
            // 一次處理一個字（若同時湊滿多字則依序）
            toMerge.forEach(ch => {
                this.mergeOneChar(ch);
            });
        },

        // 消除三張同字
        mergeOneChar: function (ch) {
            const settings = this.difficultySettings[this.difficulty];

            // 找出 buffer 中該字前 3 張
            const indices = [];
            this.buffer.forEach((b, i) => {
                if (b.char === ch && indices.length < 3) indices.push(i);
            });

            // 播放消除動畫
            const slots = document.querySelectorAll('#game30-buffer .game30-slot');
            indices.forEach(i => {
                if (slots[i]) slots[i].classList.add('merging');
            });

            // 順序加成判定
            let bonus = 1;
            const isPoemChar = this.collectProgress[ch] !== undefined;
            if (isPoemChar) {
                if (this.orderIdx < this.targetChars.length &&
                    this.targetChars[this.orderIdx] === ch) {
                    // 完美命中順序
                    this.orderIdx++;
                    this.orderStreak++;
                    if (this.orderStreak >= 2) bonus = settings.orderBonus;
                } else {
                    this.orderStreak = 0;
                }
                // 收集進度
                this.collectProgress[ch].have = Math.min(
                    this.collectProgress[ch].need,
                    this.collectProgress[ch].have + 3
                );
            } else {
                // 干擾字消除不計入順序
                this.orderStreak = 0;
            }

            // 分數
            const baseGain = (window.ScoreManager && window.ScoreManager.gameSettings.game30)
                ? window.ScoreManager.gameSettings.game30.getPointA : 30;
            const gain = baseGain * bonus * (isPoemChar ? 1 : 0.5);
            const gainInt = Math.round(gain);
            this.score += gainInt;
            document.getElementById('game30-score').textContent = this.score;

            this.spawnFloatScore(gainInt, bonus);

            if (window.SoundManager) {
                if (bonus > 1 && window.SoundManager.playJoyfulTriple) window.SoundManager.playJoyfulTriple();
                else if (window.SoundManager.playSuccessShort) window.SoundManager.playSuccessShort();
                else if (window.SoundManager.playSuccess) window.SoundManager.playSuccess();
            }

            // 動畫結束後從 buffer 中移除 — 同步噴粒子 + 字魂飛入頂端進度卡
            setTimeout(() => {
                const hue = this.getHueForChar(ch);
                // 對 buffer 中將被消除的 3 個 slot 噴粒子 + 字魂
                indices.forEach(i => {
                    const slotEl = slots[i];
                    if (slotEl) {
                        this.spawnSlotParticles(slotEl, 6, hue);
                        if (this.isPoemChar(ch)) this.spawnSoulFromSlot(slotEl, ch);
                    }
                });
                // 從尾端開始 splice 避免索引錯位
                indices.slice().reverse().forEach(i => this.buffer.splice(i, 1));
                this.renderBuffer();
                this.renderTracker(true); // animateNewlyLit
                this.updateBonusText();
                this.updateBufferWarning();
                this.updateProgressText();

                // 勝利判定：所有詩字都已收集足夠 → 走過關動畫
                if (this.isWinCondition()) {
                    this.playWinSequence();
                }
            }, 400);
        },

        // ── FX 輔助 ──
        // slot DOM → overlay 本地座標（slot 位於 game30-buffer 內，FX 元素掛 game30-container）
        // 兩者都被舞台 transform: scale 縮放 → 除 stageScale 還原本地座標
        spawnSlotParticles: function (slotEl, count, hue) {
            const overlay = this.container;
            if (!overlay || !slotEl) return;
            const sr = slotEl.getBoundingClientRect();
            const orect = overlay.getBoundingClientRect();
            const scale = window.stageScale || 1;
            const cx = ((sr.left - orect.left) + sr.width / 2) / scale;
            const cy = ((sr.top - orect.top) + sr.height / 2) / scale;
            for (let i = 0; i < count; i++) {
                const p = document.createElement('div');
                p.className = 'game30-particle';
                const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
                const dist = 32 + Math.random() * 36;
                const dx = Math.cos(angle) * dist;
                const dy = Math.sin(angle) * dist - 8;
                p.style.left = cx + 'px';
                p.style.top = cy + 'px';
                p.style.setProperty('--g30-dx', dx + 'px');
                p.style.setProperty('--g30-dy', dy + 'px');
                if (typeof hue === 'number') p.style.setProperty('--g30-ph', hue);
                const scl = 0.8 + Math.random() * 0.6;
                p.style.width = (8 * scl) + 'px';
                p.style.height = (8 * scl) + 'px';
                overlay.appendChild(p);
                setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 620);
            }
        },
        spawnSoulFromSlot: function (slotEl, ch) {
            const overlay = this.container;
            if (!overlay || !slotEl) return;
            const sr = slotEl.getBoundingClientRect();
            const orect = overlay.getBoundingClientRect();
            const scale = window.stageScale || 1;
            const sx = ((sr.left - orect.left) + sr.width / 2) / scale;
            const sy = ((sr.top - orect.top) + sr.height / 2) / scale;
            const groupEl = document.querySelector(`#game30-tracker .game30-tracker-item[data-char="${ch}"]`);
            let endX, endY;
            if (groupEl) {
                const gr = groupEl.getBoundingClientRect();
                endX = ((gr.left - orect.left) + gr.width / 2) / scale;
                endY = ((gr.top - orect.top) + gr.height / 2) / scale;
            } else { endX = sx; endY = -20; }
            const soul = document.createElement('div');
            soul.className = 'game30-soul';
            soul.textContent = ch;
            soul.style.left = sx + 'px';
            soul.style.top = sy + 'px';
            overlay.appendChild(soul);
            requestAnimationFrame(() => {
                soul.style.opacity = '0.95';
                soul.style.transform = 'translate(-50%, -50%) scale(1.2)';
                soul.style.transition = 'top 0.2s ease-out, opacity 0.15s ease, transform 0.2s ease';
                soul.style.top = (sy - 24) + 'px';
            });
            setTimeout(() => {
                soul.style.transition = 'left 0.5s cubic-bezier(0.4, 0, 0.2, 1), top 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, transform 0.4s ease';
                soul.style.left = endX + 'px';
                soul.style.top = endY + 'px';
                soul.style.transform = 'translate(-50%, -50%) scale(0.8)';
            }, 210);
            setTimeout(() => {
                soul.style.opacity = '0';
                if (groupEl) {
                    groupEl.style.transform = 'scale(1.25)';
                    groupEl.style.transition = 'transform 0.2s ease';
                    setTimeout(() => { groupEl.style.transform = ''; }, 220);
                }
            }, 720);
            setTimeout(() => { if (soul.parentNode) soul.parentNode.removeChild(soul); }, 900);
        },

        // 過關動畫：進度卡逐一發金光 → gameOver(true) → ScoreManager → MessageBox
        playWinSequence: function () {
            this.animLocked = true;
            const cards = Array.from(document.querySelectorAll('#game30-tracker .game30-tracker-item'));
            const GAP = 180;
            cards.forEach((g, i) => setTimeout(() => g.classList.add('stage-flash'), i * GAP));
            const total = cards.length * GAP + 500;
            setTimeout(() => this.gameOver(true, ''), total);
        },

        // 勝利條件：所有詩字 have >= need
        isWinCondition: function () {
            return Object.keys(this.collectProgress).every(
                ch => this.collectProgress[ch].have >= this.collectProgress[ch].need
            );
        },

        // 失敗檢查輔助：在 buffer 滿且當前牌山可點牌中無同字湊三連時失敗
        canMergeAfter: function () {
            // 暫存槽內各字計數
            const cnt = {};
            this.buffer.forEach(b => { cnt[b.char] = (cnt[b.char] || 0) + 1; });
            // 加上牌山中目前可點之牌
            const accessible = this.tiles.filter(t => !t.removed && t.accessible);
            accessible.forEach(t => { cnt[t.char] = (cnt[t.char] || 0) + 1; });
            // 任一字 ≥ 3 → 還有救
            return Object.values(cnt).some(v => v >= 3);
        },

        // ── 進度燈渲染 ──
        // 多卡橫排進度（仿 game24）：每張卡 = 上方彩色字塊（與牌同色）+ 下方 have/need
        renderTracker: function (animateNewlyLit) {
            const el = document.getElementById('game30-tracker');
            if (!el) return;
            const prev = this._prevTrackerSnap || {};
            let html = '';
            this.uniquePoemChars.forEach(ch => {
                const p = this.collectProgress[ch];
                if (!p) return;
                const have = Math.min(p.need, p.have);
                const prevHave = Math.min(p.need, prev[ch] || 0);
                const done = have >= p.need;
                const justDone = animateNewlyLit && done && prevHave < p.need;
                const hue = this.getHueForChar(ch);
                html += `<span class="game30-tracker-item ${done ? 'done' : ''}${justDone ? ' just-lit' : ''}" data-char="${ch}" style="--g30-h:${hue}">`
                    + `<span class="game30-tracker-tile">${ch}</span>`
                    + `<span class="game30-tracker-count"><span class="game30-tracker-num">${have}</span>/<span class="game30-tracker-den">${p.need}</span></span>`
                    + `</span>`;
            });
            el.innerHTML = html;
            // 快照本次的 have 數，供下次判斷 just-lit
            this._prevTrackerSnap = {};
            this.uniquePoemChars.forEach(ch => {
                if (this.collectProgress[ch]) this._prevTrackerSnap[ch] = this.collectProgress[ch].have;
            });
        },

        updateProgressText: function () {
            const alive = this.tiles.filter(t => !t.removed).length;
            const el = document.getElementById('game30-progress-text');
            if (el) el.textContent = `剩餘牌：${alive}`;
        },

        updateBonusText: function () {
            const settings = this.difficultySettings[this.difficulty];
            const el = document.getElementById('game30-bonus-text');
            if (!el) return;
            const mult = this.orderStreak >= 2 ? settings.orderBonus : 1;
            el.textContent = `順序加成 ×${mult}（連 ${this.orderStreak}）`;
        },

        // ── 飛分動畫 ──
        spawnFloatScore: function (gain, bonus) {
            const buf = document.getElementById('game30-buffer');
            if (!buf) return;
            const span = document.createElement('div');
            span.className = 'game30-float-score';
            span.textContent = (bonus > 1 ? `+${gain} ×${bonus}` : `+${gain}`);
            span.style.left = (buf.offsetLeft + buf.offsetWidth / 2) + 'px';
            span.style.top = (buf.offsetTop - 8) + 'px';
            buf.parentElement.appendChild(span);
            setTimeout(() => { if (span.parentNode) span.parentNode.removeChild(span); }, 900);
        },

        // ── 提示：隨機高亮一張「詩字順序最前」的可點牌 ──
        useHint: function () {
            if (!this.isActive || this.animLocked) return;
            const accessible = this.tiles.filter(t => !t.removed && t.accessible);
            if (accessible.length === 0) return;

            // 找順序最前的詩字
            let target = null;
            for (let i = this.orderIdx; i < this.targetChars.length; i++) {
                const ch = this.targetChars[i];
                const candidate = accessible.find(t => t.char === ch);
                if (candidate) { target = candidate; break; }
            }
            if (!target) target = accessible[Math.floor(Math.random() * accessible.length)];

            this.score = Math.max(0, this.score - 10);
            document.getElementById('game30-score').textContent = this.score;
            if (window.SoundManager) window.SoundManager.playOpenItem();

            const el = target.el;
            if (el) {
                el.style.boxShadow = '0 0 20px 6px hsla(45, 100%, 65%, 0.95)';
                setTimeout(() => { if (el) el.style.boxShadow = ''; }, 1500);
            }
        },

        // ── 撤回：把暫存槽最後一張變回牌山頂層（簡化版） ──
        useUndo: function () {
            if (!this.isActive || this.animLocked) return;
            if (this.buffer.length === 0) return;
            this.score = Math.max(0, this.score - 15);
            document.getElementById('game30-score').textContent = this.score;
            // 取最後加入者：依 tileId 最大者
            let lastIdx = 0;
            for (let i = 1; i < this.buffer.length; i++) {
                if (this.buffer[i].tileId > this.buffer[lastIdx].tileId) lastIdx = i;
            }
            const item = this.buffer[lastIdx];
            // 找回原 tile
            const t = this.tiles.find(x => x.id === item.tileId);
            if (t) {
                t.removed = false;
                // 重建 DOM
                const tower = document.getElementById('game30-tower');
                const el = document.createElement('div');
                el.className = 'game30-tile';
                el.textContent = t.char;
                el.style.left = t.x + 'px';
                el.style.top = t.y + 'px';
                el.style.zIndex = 10 + t.layer * 10;
                el.dataset.tid = t.id;
                el.onclick = () => this.onTileClick(t.id);
                // 同字同色（與 renderTower 同樣套用 HUE）
                const hue = this.getHueForChar(t.char);
                el.style.setProperty('--g30-h', hue);
                if (this.isPoemChar(t.char)) {
                    el.style.setProperty('--g30-s', '60%');
                    el.style.setProperty('--g30-l', '75%');
                    el.style.setProperty('--g30-text', 'hsl(220, 30%, 14%)');
                    // 同字同形：依字在 uniquePoemChars 索引套五種形狀之一
                    const shpIdx = this.uniquePoemChars.indexOf(t.char);
                    if (shpIdx >= 0) window.TileStyleUtils.applyShape(el, window.TileStyleUtils.getGroupShape(shpIdx));
                } else {
                    el.classList.add('decoy');
                }
                tower.appendChild(el);
                t.el = el;
            }
            this.buffer.splice(lastIdx, 1);
            this.renderBuffer();
            this.updateVisibility();
            this.updateProgressText();
            this.updateBufferWarning();
            if (window.SoundManager) window.SoundManager.playOpenItem();
        },

        // ── 計時 ──
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
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
            const rect = document.getElementById('game30-timer-path');
            const wrapper = document.getElementById('game30-tower-wrapper');
            const svg = document.getElementById('game30-timer-ring');
            if (!rect || !wrapper || !svg) return;
            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const rb = wrapper.getBoundingClientRect();
                w = rb.width; h = rb.height;
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

        // ── 結束 ──
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 30,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game30-retryGame-btn').disabled = true;
                document.getElementById('game30-newGame-btn').disabled = true;
                if (window.SoundManager && window.SoundManager.melodyPlayer
                    && window.SoundManager.melodyPlayer.playFullMelody) {
                    try { window.SoundManager.melodyPlayer.playFullMelody('望春風'); } catch (e) {}
                }
            } else {
                document.getElementById('game30-retryGame-btn').disabled = false;
                document.getElementById('game30-newGame-btn').disabled = false;
                if (window.SoundManager && window.SoundManager.playSadTriple) {
                    window.SoundManager.playSadTriple();
                }
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '層巒崩塌！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game30', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game30', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game30',
                    timerContainerId: 'game30-tower-wrapper',
                    scoreElementId: 'game30-score',
                    heartsSelector: '.game30-no-hearts',  // 本作無紅心 — 永不命中但語法合法，避免 querySelectorAll(null) 例外
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

    window.Game30 = Game30;

    if (new URLSearchParams(window.location.search).get('game') === '30') {
        setTimeout(() => {
            if (window.Game30) window.Game30.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
