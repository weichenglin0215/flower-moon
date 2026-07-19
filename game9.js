/* game9.js - 詩韻鎖扣 (Nuts & Bolts: Verse)
   ----------------------------------------
   遊戲玩法簡介（給新手看）：
   畫面上有好幾根「螺絲樁」，每根樁上疊了好幾顆寫著詩詞文字的「螺帽」。
   玩家的目標是把「同一句詩」的所有文字，依照正確順序（由上往下讀出來要
   是正確的詩句）疊到同一根螺絲樁上；當某一根樁上的字剛好排成一句完整
   詩句時，這根樁就算「完成」。四根樁（一首詩四句）全部完成即為過關。

   程式碼的核心資料結構是 this.bolts：
     this.bolts = [ 樁0的螺帽陣列, 樁1的螺帽陣列, 樁2的螺帽陣列, ... ]
   每個「螺帽陣列」由下到上排列，例如 this.bolts[0] = [底部螺帽, ..., 頂部螺帽]。
   ---------------------------------------- */

(function () {
    'use strict';

    const Game9 = {
        isActive: false, //遊戲是否啟動
        difficulty: '小學', //難度
        currentLevelIndex: 1, //目前關卡數
        isLevelMode: false, //是否為挑戰關卡模式
        score: 0, //分數
        mistakeCount: 0, //錯誤次數
        timer: 0, //計時器
        maxTimer: 0, //最大計時
        timerInterval: null, //計時器間隔

        movesLeft: 0, //剩餘移動次數
        maxMoves: 0, //最大移動次數
        lastActionTime: 0, //上次操作時間
        inactivityThreshold: 5000, //無操作時間閾值，超過秒數無移動步伐就罰一次移動步數。

        // ── 螺帽的高度與間隔（畫面排版用，新手請特別注意這兩個數值） ──
        // NUT_HEIGHT 必須和 game9.css 裡 .game9-nut 的 height 完全一致！
        //   若你在 CSS 改了螺帽的高度，這裡也要跟著改成同一個數字，
        //   否則螺帽疊起來的間隔會跑掉（黏在一起、或縫隙太大）。
        NUT_HEIGHT: 60,   // 螺帽本身的高度 (px)，需與 game9.css 的 .game9-nut { height: 72px } 一致
        NUT_GAP: 8,      // 相鄰兩顆螺帽之間，留給玩家「看得出來是分開兩顆」的可見縫隙 (px)

        moveInfo: [], // 用來記錄「上一步移動」的歷史，讓玩家可以按「撤銷」回到上一步
        gameStartTime: null, // 本局開始時的時間戳（Date.now()），用於計算 duration_s

        // 難度設定：
        // timeLimit 時間限制
        // poemMinRating 最低詩詞評分
        // bolts 螺絲數
        // emptyBolts 空槽數
        // hasHint 是否有提示
        // undo 是否有撤銷
        // moveLimit 移動次數上限
        // exchangeQuantity 每回合可交換螺絲數
        //難度參數詳細說明，hasHint: true表示有提示，undo: true表示有撤銷，moveLimit: 0表示沒有移動次數上限，exchangeQuantity: 2表示控制題目難度的預先的交換螺絲數，totalNumberOfExchange: 16表示題目總共預先交換的次數(越多次越難)
        //color: hard, expert 可使用深色且難以辨識的顏色
        difficultySettings: {
            '小學': { timeLimit: 90, poemMinRating: 6, bolts: 6, emptyBolts: 2, hasHint: 'all', undo: true, moveLimit: 0, exchangeQuantity: 2, totalNumberOfExchange: 16 },
            '中學': { timeLimit: 120, poemMinRating: 5, bolts: 6, emptyBolts: 2, hasHint: 'firstEnd', undo: true, moveLimit: 0, exchangeQuantity: 3, totalNumberOfExchange: 24 },
            '高中': { timeLimit: 150, poemMinRating: 4, bolts: 6, emptyBolts: 2, hasHint: 'first', undo: true, moveLimit: 0, exchangeQuantity: 4, totalNumberOfExchange: 32 },
            '大學': { timeLimit: 180, poemMinRating: 3, bolts: 6, emptyBolts: 2, hasHint: 'end', undo: true, moveLimit: 0, exchangeQuantity: 5, totalNumberOfExchange: 48 },
            '研究所': { timeLimit: 240, poemMinRating: 2, bolts: 6, emptyBolts: 2, hasHint: 'none', undo: false, moveLimit: 0, color: 'hard', exchangeQuantity: 7, totalNumberOfExchange: 56 }
        },

        loadCSS: function () {
            if (!document.getElementById('game9-css')) {
                const link = document.createElement('link');
                link.id = 'game9-css';
                link.rel = 'stylesheet';
                link.href = 'game9.css';
                document.head.appendChild(link);
            }
        },
        currentPoem: null,
        lines: [], // 把抽到的詩詞拆解成一行一行文字的陣列，例如 ["床前明月光","疑是地上霜", ...]

        // 所有螺絲樁與螺帽的目前狀態：
        //   bolts 是一個陣列，每個元素代表「一根螺絲樁」；
        //   每根樁本身又是一個陣列，由「底部」排到「頂部」，
        //   陣列裡的每一項是一顆螺帽物件 { char, colorGroup, index }。
        bolts: [],
        completedBolts: [], // 記錄「已經完成（排對一整句詩）」的樁編號，避免同一根樁重複播放完成動畫
        newlyCompletedBoltIdx: -1, // 記錄「剛剛才完成」的那一根樁編號，只讓它播放一次跳躍慶祝動畫
        isWinning: false, // 是否正在播放「全部過關」的勝利動畫
        selectedNut: null,
        selectedBoltIndex: -1, // 玩家目前選取（拿起）的是哪一根樁，-1 表示目前沒有選取任何樁
        selectedNutCount: 0, // 玩家這次選取，總共拿起了幾顆螺帽（可能一次拿好幾顆同色螺帽）
        movesMade: 0,

        container: null,

        // 用來播放「叮」一聲音效的音訊物件（螺帽被選取/放下/完成時會發出提示音）
        audioCtx: null,

        init: function () {
            this.loadCSS();
            if (this.container) return;
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game9-container';
            div.className = 'game9-overlay fm-overlay hidden';
            div.innerHTML = `
                <div class="fm-header">
                    <div class="fm-scoreboard">分數: <span id="game9-score">0</span></div>
                    <div class="fm-controls">
                        <button class="fm-difficulty-tag" id="game9-diff-tag" data-level="小學">小學</button>
                        <button id="game9-retryGame-btn" class="fm-nav-btn">重來</button>
                        <button id="game9-newGame-btn" class="fm-nav-btn newGame-btn">開新局</button>
                    </div>
                </div>
                <div class="fm-sub-header">
                    <div id="game9-hearts" class="fm-hearts"></div>
                    <div class="game9-info">
                        <!-- 詩名/朝代/作者：已移至 fm-sub-header 右側，見上方 -->
                        <span id="game9-progress-text" class="game9-progress-text"></span>
                        <span>　</span>
                        <span id="game9-poem-info" class="fm-poem-info"></span>
                    </div>
                </div>
                <div class="game9-area">
                    <svg id="game9-timer-ring" class="fm-timer-ring">
                        <rect id="game9-timer-path-white" class="fm-timer-path-white" x="3" y="3"></rect>
                        <rect id="game9-timer-path-red" class="fm-timer-path-red" x="3" y="3"></rect>
                    </svg>
                    <button id="game9-undo-btn" class="game9-undo-btn" disabled>撤銷</button>
                    <div id="game9-play-area" class="game9-play-area">
                        <div id="game9-bolt-container" class="game9-bolt-container"></div>
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
            this.container = div;
        },

        // 初始化瀏覽器內建的音訊功能（用來播放選取/放下/完成等提示音效）
        initAudio: function () {
            if (!this.audioCtx) {
                try {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    this.audioCtx = new AudioContext();
                } catch (e) {
                    console.warn("這個瀏覽器不支援 AudioContext（音效功能）");
                }
            }
        },

        // 播放一個簡短的提示音（select=選取／drop=放下／error=錯誤／complete=完成一整句）
        playNote: function (type) {
            if (!this.audioCtx) return;
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') ctx.resume();

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            let freq = 800;
            if (type === 'select') freq = 1200;
            else if (type === 'drop') freq = 600;
            else if (type === 'error') freq = 200;
            else if (type === 'complete') freq = 1500;

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            if (type === 'complete') {
                osc.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.3);
            }

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (type === 'complete' ? 0.3 : 0.1));

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩韻鎖扣', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    const settings = this.difficultySettings[selectedLevel];
                    if (!settings) return;

                    this.updateUIForMode();

                    const container = document.getElementById('game9-container');
                    if (container) {
                        container.classList.remove('hidden');
                        document.body.classList.add('overlay-active');
                    }

                    /* updateResponsiveLayout replaced */
                    setTimeout(() => {
                        this.startNewGame();
                    }, 50);
                });
            }
        },

        updateUIForMode: function () {
            const diffTag = document.getElementById('game9-diff-tag');
            const retryBtn = document.getElementById('game9-retryGame-btn');
            const newBtn = document.getElementById('game9-newGame-btn');
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

        bindEvents: function () {
            document.getElementById('game9-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game9-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            // 結算訊息視窗（過關/失敗提示框）的按鈕由共用元件 GameMessage 自己處理，這裡不用另外綁定
            document.getElementById('game9-poem-info').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (window.PoemDialog && this.currentPoem) window.PoemDialog.openById(this.currentPoem.id);
            };
            document.getElementById('game9-undo-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.undoMove();
            };
            document.getElementById('game9-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
        },

        show: function () {
            this.init();
            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩韻鎖扣', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;

                    this.updateUIForMode();

                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.initAudio();
                    setTimeout(() => {
                        this.startNewGame();
                    }, 50);
                });
            }
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
            if (levelIndex !== undefined) this.currentLevelIndex = levelIndex;
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
            if (typeof POEMS === 'undefined' || POEMS.length === 0) return false;
            const settings = this.difficultySettings[this.difficulty];
            const minRating = settings.stars || 4;

            // 使用共用邏輯取得隨機詩詞，傳入種子
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                4, 4, 16, 40, "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game9'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            const poem = result.poem;
            const startIndex = result.startIndex;

            // 取連續 4 句
            this.lines = [];
            for (let i = 0; i < 4; i++) {
                const rawLine = poem.content[startIndex + i];
                if (!rawLine) break;
                const text = rawLine.replace(/[，。？！、：；「」『』\s]/g, "");
                this.lines.push(text);
            }

            // 計算最長行字數（決定螺絲管容量）
            this.maxLineLength = Math.max(...this.lines.map(l => l.length));
            this.maxLineLength = Math.max(this.maxLineLength, 5);

            let _title9 = this.currentPoem.title;
            if (_title9.length > 8) _title9 = _title9.substring(0, 8) + "…";
            document.getElementById('game9-poem-info').textContent =
                `${_title9} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
            this.updatePoemInfoVisibility(false);
            return true;
        },

        // 小學難度維持顯示詩詞出處供提示；中學以上開局隱藏，勝利後才顯示
        updatePoemInfoVisibility: function (revealed) {
            const info = document.getElementById('game9-poem-info');
            if (!info) return;
            info.style.display = (this.difficulty === '小學' || revealed) ? '' : 'none';
        },
        //game9只有startGameProcess() 透過isRetry控制是否重來或是開新局
        startGameProcess: function (isRetry) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            this.isActive = true;
            this.gameStartTime = Date.now(); // 記錄本局開始時間（用於計算 duration_s）
            this.score = 0;
            this.moveInfo = [];
            this.isWinning = false;
            this.newlyCompletedBoltIdx = -1;

            this.updateUIForMode();
            document.getElementById('game9-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            const settings = this.difficultySettings[this.difficulty];
            const undoBtn = document.getElementById('game9-undo-btn');
            if (settings.undo) {
                undoBtn.style.display = 'block';
                undoBtn.disabled = true;
            } else {
                undoBtn.style.display = 'none';
            }

            document.getElementById('game9-hearts').innerHTML = '';

            this.selectedNut = null;
            this.selectedBoltIndex = -1;

            this.completedBolts = [];
            this.newlyCompletedBoltIdx = -1;
            if (!isRetry || !this.initialBoltsState) {
                this.generateLevel();
                // deep copy for retry
                this.initialBoltsState = JSON.parse(JSON.stringify(this.bolts));
            } else {
                this.bolts = JSON.parse(JSON.stringify(this.initialBoltsState));
                // Initial check for completed bolts in retry
                this.bolts.forEach((b, i) => {
                    if (this.checkBoltCompleted(b)) this.completedBolts.push(i);
                });
            }

            this.renderLevel();
            this.updateProgressText();

            // 設定玩家的移動次數等於 totalNumberOfExchange 題目預先交換的次數，本來是1.5倍次數，太容易改成*1.0倍
            this.maxMoves = (settings.totalNumberOfExchange || 16) * 1.0;
            this.movesLeft = this.maxMoves;
            this.updateProgressText(); //起動遊戲時更新剩餘步數
            this.lastActionTime = Date.now();

            if (this.maxMoves > 0) {
                document.getElementById('game9-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game9-timer-ring').style.display = 'none';
            }
            // 啟用重來按鈕
            document.getElementById('game9-retryGame-btn').disabled = false;
            document.getElementById('game9-newGame-btn').disabled = false;
        },

        // 產生一局新的關卡盤面（把答案先「排好」，再故意打亂成題目）。
        // 整體流程分三大步驟，讓玩家有機會用「交換」把打亂的字移回正確位置：
        //   步驟 1：先把每句詩的文字依正確順序疊好，再從每根樁的「最上面」抽出一部分（可移動的部分）
        //   步驟 2：把抽出來的這些螺帽，隨機分配到各根樁（含原本空著的樁）
        //   步驟 3：再額外做一些隨機但合法的搬移，讓盤面更混亂（次數越多，難度越高）
        generateLevel: function () {
            const settings = this.difficultySettings[this.difficulty];
            const numBolts = settings.bolts;
            const emptyBolts = settings.emptyBolts;
            const fullBolts = numBolts - emptyBolts; // 「有詩句的樁」數量（例如 4 根樁對應 4 句詩，其餘為空樁）

            this.bolts = [];
            for (let i = 0; i < numBolts; i++) {
                this.bolts.push([]);
            }

            // 一開始先把每句詩的文字，依照「正確答案」的順序整齊疊好
            for (let i = 0; i < 4; i++) {
                if (i >= fullBolts) break;
                const lineChars = this.lines[i];
                // 由底部往頂部疊：陣列最後一個字元（句尾）最先疊上去，變成最底層；
                //   陣列第一個字元（句首）最後疊上去，變成最頂層。
                //   這樣「由上往下讀」螺絲樁上的字，就會讀出正確的詩句。
                for (let j = lineChars.length - 1; j >= 0; j--) {
                    this.bolts[i].push({
                        char: lineChars[j],
                        colorGroup: i,   // 同一句詩的字都用同一個顏色分組（決定螺帽顏色）
                        index: j         // 這個字在這句詩裡「原本」是第幾個字（用來還原順序）
                    });
                }
            }

            // ── 步驟 1：把每根樁「最上面」的幾顆螺帽抽出來，準備打亂 ──
            //   底部剩下的字（不被抽出的部分）固定不動，玩家不需要移動它們；
            //   這樣可以控制題目難度：exchangeQty 越大，需要打亂/歸位的字就越多。
            const exchangeQty = settings.exchangeQuantity || 5;
            const mobileNuts = []; // 存放「被抽出來、之後會被打亂」的螺帽

            for (let i = 0; i < fullBolts; i++) {
                const lineLen = this.lines[i].length;
                // 這根樁最多隻能抽出「exchangeQty」顆，但如果整句詩字數更少，就以字數為準
                const countToPull = Math.min(this.bolts[i].length, exchangeQty);
                for (let j = 0; j < countToPull; j++) {
                    mobileNuts.push(this.bolts[i].pop()); // pop() 從陣列最後一項（即最頂層）取出
                }
            }

            // ── 步驟 2：把剛剛抽出來的螺帽，隨機分配到各根樁（含原本空著的樁） ──
            //   這裡先做一輪「粗略隨機分配」，讓螺帽先亂數散開；
            //   之後步驟 3 還會再做更多次隨機且合法的搬移，讓盤面更難、更亂。
            const targetBoltsIdx = [];
            for (let i = 0; i < numBolts; i++) targetBoltsIdx.push(i);

            while (mobileNuts.length > 0) {
                const nut = mobileNuts.pop();
                // 找出「目前還沒疊滿」的樁（樁的高度上限是 maxLineLength，即全詩最長那句的字數）
                let validBolts = targetBoltsIdx.filter(idx => this.bolts[idx].length < this.maxLineLength);
                if (validBolts.length === 0) break; // 理論上不該發生（代表所有樁都疊滿了）
                const targetIdx = validBolts[Math.floor(Math.random() * validBolts.length)];
                this.bolts[targetIdx].push(nut);
            }

            // ── 步驟 3：額外執行多次隨機但合法的搬移，讓盤面更混亂（次數越多，題目越難） ──
            //   「合法搬移」的意思是：只搬「可移動部分」的螺帽（不會動到步驟 1 保留不動的底部），
            //   目標樁也不能疊得比 maxLineLength 還高。
            let scrambles = 0;
            const maxScrambles = settings.totalNumberOfExchange || 100;
            while (scrambles < maxScrambles) {
                const nonEmpty = [];
                const notFull = [];
                for (let i = 0; i < numBolts; i++) {
                    const lineLen = (i < fullBolts) ? this.lines[i].length : 0;
                    const fixedSize = i < fullBolts ? Math.max(0, lineLen - exchangeQty) : 0;
                    if (this.bolts[i].length > fixedSize) nonEmpty.push(i);
                    if (this.bolts[i].length < this.maxLineLength) notFull.push(i);
                }

                if (nonEmpty.length === 0) break;

                const fromIdx = nonEmpty[Math.floor(Math.random() * nonEmpty.length)];
                let toIdx = notFull[Math.floor(Math.random() * notFull.length)];

                if (fromIdx !== toIdx) {
                    const nut = this.bolts[fromIdx].pop();
                    this.bolts[toIdx].push(nut);
                    scrambles++;
                }
            }
        },

        // 依照難度設定，決定這顆螺帽該套用哪一種顏色的 CSS class
        //   （一般難度每句詩用不同顏色區分；大學/研究所難度改用更難分辨的深色系，增加難度）
        getColorClass: function (colorGroup) {
            const settings = this.difficultySettings[this.difficulty];
            if (settings.color === 'expert') {
                return 'nut-color-expert';
            } else if (settings.color === 'hard') {
                return `nut-color-hard-${(colorGroup % 4) + 1}`;
            } else {
                return `nut-color-${(colorGroup % 7) + 1}`;
            }
        },

        // 把 this.bolts 目前的資料，實際畫成畫面上一根根螺絲樁與一顆顆螺帽。
        // 每次盤面有變化（選取、移動、撤銷…）都會重新呼叫這個函式整個重畫一次。
        renderLevel: function () {
            const container = document.getElementById('game9-bolt-container');
            container.innerHTML = '';

            const settings = this.difficultySettings[this.difficulty];

            // ── 螺帽疊放間隔計算（新手重點註解） ──
            // interval：兩顆螺帽「疊放起點」之間的垂直距離（單位 px）。
            //   interval = 螺帽本身高度(NUT_HEIGHT) + 想要留的可見縫隙(NUT_GAP)。
            //   如果 interval 跟 NUT_HEIGHT 一樣大，螺帽會緊緊黏在一起（0 縫隙）；
            //   interval 越大，螺帽之間的縫隙就越明顯。
            // ⚠️ 若之後又手動調整了 game9.css 的 .game9-nut height，
            //    請同步更新上面 Game9.NUT_HEIGHT 這個值，這裡的間隔就會自動跟著算對，
            //    不需要再改這段程式碼本身。
            const nutInterval = this.NUT_HEIGHT + this.NUT_GAP;

            this.bolts.forEach((boltStack, boltIdx) => {
                const boltEl = document.createElement('div');
                boltEl.className = 'game9-bolt';
                boltEl.dataset.idx = boltIdx;
                // 螺絲樁的高度：依「這首詩最長一句的字數」(maxLineLength) 動態計算，
                //   確保最長的那句詩、疊到最高時，樁的高度仍然裝得下所有螺帽，
                //   另外再加 40px 作為頂部留白（避免最上面那顆螺帽貼著樁頂看起來太擠）。
                boltEl.style.height = `${(this.maxLineLength * nutInterval) + 40}px`;

                // 由下往上，依序把每顆螺帽的 DOM 元素建立出來
                // boltStack 陣列本身就是 [最底部的螺帽, ..., 最頂部的螺帽] 的順序
                for (let i = 0; i < boltStack.length; i++) {
                    const nutData = boltStack[i];
                    const nutEl = document.createElement('div');
                    nutEl.className = `game9-nut ${this.getColorClass(nutData.colorGroup)}`;
                    // 補充說明：CSS 裡 .game9-bolt 設定了 flex-direction: column-reverse，
                    //   所以雖然我們是「依序」把螺帽 appendChild 進去，畫面上仍會自然由下往上疊放。
                    nutEl.textContent = nutData.char;
                    nutEl.dataset.nutGroup = nutData.colorGroup;
                    nutEl.dataset.nutIndex = nutData.index;
                    nutEl.dataset.stackIndex = i; // 記錄這顆螺帽目前疊在第幾層（從 0 開始，0 = 最底層）

                    let showHint = false;
                    const hType = settings.hasHint;
                    const lineLen = this.lines[nutData.colorGroup].length;
                    if (hType === 'all') showHint = true;
                    else if (hType === 'first' && nutData.index === 0) showHint = true;
                    else if (hType === 'end' && nutData.index === lineLen - 1) showHint = true;
                    else if (hType === 'firstEnd' && (nutData.index === 0 || nutData.index === lineLen - 1)) showHint = true;

                    if (showHint) {
                        const hintEl = document.createElement('div');
                        hintEl.className = 'game9-nut-hint';
                        hintEl.textContent = nutData.index + 1;
                        nutEl.appendChild(hintEl);
                    }

                    // 每顆螺帽的垂直位置（bottom）：第 i 層螺帽的起始高度 = i × 間隔 + 20px 基礎偏移。
                    //   20px 基礎偏移讓最底層螺帽不會緊貼樁的最底部，留一點視覺呼吸空間。
                    nutEl.style.bottom = `${(i * nutInterval) + 20}px`;

                    // 如果這顆螺帽是玩家目前選取（拿起）的其中一顆，讓它視覺上浮起來
                    if (this.selectedBoltIndex === boltIdx && i >= (this.bolts[boltIdx].length - this.selectedNutCount)) {
                        nutEl.classList.add('selected');
                        nutEl.style.transform = 'translateY(-30px)';
                    }

                    boltEl.appendChild(nutEl);
                }

                if (this.completedBolts.includes(boltIdx)) {
                    boltEl.classList.add('is-completed'); // 標準的「已完成」外觀（沒有動畫，只是換個樣式）

                    // 只有「剛剛才完成」的這一根樁，或是整局遊戲正在播放勝利動畫時，才加上動畫效果
                    if (this.newlyCompletedBoltIdx === boltIdx || this.isWinning) {
                        boltEl.classList.add('completed');
                    }
                }

                boltEl.onclick = (e) => this.handleBoltClick(boltIdx, e);
                container.appendChild(boltEl);
            });

            const undoBtn = document.getElementById('game9-undo-btn');
            if (settings.undo) {
                undoBtn.disabled = this.moveInfo.length === 0;
            }
        },

        updateProgressText: function () {
            const settings = this.difficultySettings[this.difficulty];
            const p = document.getElementById('game9-progress-text');
            p.textContent = `剩餘步數: ${this.movesLeft}`;
        },

        // 玩家點擊某一根螺絲樁時的處理邏輯。
        //   這個函式依「目前狀態」分成三種情境（狀況一/二/三），
        //   概念很像「兩次點擊」：第一次點擊選取要拿起的螺帽，第二次點擊決定要放到哪根樁。
        handleBoltClick: function (boltIdx, e) {
            if (!this.isActive) return;

            // ── 狀況一：目前手上沒有拿著螺帽 → 這次點擊是要「選取／拿起」螺帽 ──
            if (this.selectedBoltIndex === -1) {
                const bolt = this.bolts[boltIdx];
                if (bolt.length === 0 || this.completedBolts.includes(boltIdx)) {
                    this.playNote('error'); // 樁是空的，或這根樁已經完成了，不能再選
                    return;
                }

                // 預設拿起「最頂端那一顆」；k 記錄「要拿起的螺帽，是從第幾層開始（含）往上」
                let k = bolt.length - 1;
                // 如果玩家點的是「某一顆特定的螺帽」（不是點空白處），就改成從那一層開始拿
                const nutEl = e && e.target.closest('.game9-nut');
                if (nutEl) {
                    k = parseInt(nutEl.dataset.stackIndex);
                }

                // 檢查從第 k 層到最頂層，是不是「同一句詩（同一個顏色分組）」的螺帽。
                //   規則：只能一次拿起「連續且同色」的一疊螺帽，不能中間夾雜別句詩的字。
                const targetColor = bolt[k].colorGroup;
                for (let i = k; i < bolt.length; i++) {
                    if (bolt[i].colorGroup !== targetColor) {
                        // 玩家點的那顆螺帽，上面疊著別句詩（不同顏色）的螺帽，不能整疊拿起
                        this.playNote('error');
                        if (window.SoundManager) window.SoundManager.playFailure();
                        return;
                    }
                }

                this.playNote('select');
                this.selectedBoltIndex = boltIdx;
                this.selectedNutCount = bolt.length - k; // 這次總共拿起了幾顆螺帽
                this.renderLevel();
            }
            // ── 狀況二：又點了同一根樁 → 玩家反悔，取消選取（把手上的螺帽放回原位） ──
            else if (this.selectedBoltIndex === boltIdx) {
                this.selectedBoltIndex = -1;
                this.selectedNutCount = 0;
                this.playNote('drop');
                this.renderLevel();
            }
            // ── 狀況三：點了另一根樁 → 玩家要把手上拿著的螺帽，移動過去疊到這根樁上 ──
            else {
                const sourceBolt = this.bolts[this.selectedBoltIndex]; // 來源樁（拿螺帽的那根）
                const targetBolt = this.bolts[boltIdx];                // 目標樁（要放螺帽的那根）
                const count = this.selectedNutCount;                  // 這次要搬幾顆螺帽
                const movingNutSet = sourceBolt.slice(sourceBolt.length - count);
                const baseNut = movingNutSet[0]; // 這疊螺帽最底下（最先接觸目標樁）的那一顆

                // 檢查「目標樁的空間夠不夠」：放進去後總數不能超過 maxLineLength（樁的容量上限）
                if (targetBolt.length + count > this.maxLineLength) {
                    this.playNote('error');
                    if (window.SoundManager) window.SoundManager.playFailure();
                    const trgEl = document.querySelector(`.game9-bolt[data-idx="${boltIdx}"]`);
                    if (trgEl) {
                        trgEl.classList.add('shake'); // 搖晃動畫提示「這裡放不下」
                        setTimeout(() => trgEl.classList.remove('shake'), 300);
                    }
                    return; // 目標樁裝不下，中止這次移動
                }

                let canMove = false;
                if (targetBolt.length === 0) {
                    canMove = true; // 目標樁是空的，什麼顏色的螺帽都可以放上去
                } else {
                    const targetTopNut = targetBolt[targetBolt.length - 1];
                    // 檢查顏色分組是否相同：只有「同一句詩」的螺帽，才能疊在一起
                    if (targetTopNut.colorGroup === baseNut.colorGroup) {
                        canMove = true;
                    }
                }

                if (canMove) {
                    // 真正執行搬移：一次搬 count 顆（可能同時搬好幾顆螺帽過去）
                    const nuts = sourceBolt.splice(sourceBolt.length - count, count);
                    targetBolt.push(...nuts);

                    // 記錄這一步移動，供「撤銷」功能使用
                    this.moveInfo.push({ from: this.selectedBoltIndex, to: boltIdx, count: count });

                    this.movesMade++;
                    this.movesLeft--; // 消耗掉一次移動次數
                    this.lastActionTime = Date.now(); // 重新計時「無操作時間」（避免被判定為發呆而扣步數）
                    this.selectedBoltIndex = -1;
                    this.selectedNutCount = 0;

                    this.updateProgressText();
                    this.renderLevel();

                    if (this.checkBoltCompleted(targetBolt)) {
                        this.playNote('complete');
                        if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
                        // 如果這根樁是「剛剛才完成」的（之前還沒列在完成清單裡），才加進去並播放慶祝動畫
                        if (!this.completedBolts.includes(boltIdx)) {
                            this.completedBolts.push(boltIdx);
                            this.newlyCompletedBoltIdx = boltIdx; // 標記它，讓 renderLevel 知道要播放動畫
                            // 重繪以顯示完成動畫
                            this.renderLevel();
                        }
                        // 完成一整根樁的得分公式：
                        // 擊中文字，根據window.ScoreManager.gameSettings['game9'].getPointA加分
                        this.score += window.ScoreManager.gameSettings['game9'].getPointA * this.difficultySettings[this.difficulty].exchangeQuantity * this.difficultySettings[this.difficulty].totalNumberOfExchange;
                        document.getElementById('game9-score').textContent = Math.round(this.score);
                    } else {
                        // 如果這根樁「原本已經完成」，但玩家又從裡面拿走了螺帽（弄亂了），
                        //   就要把它從「已完成」清單中移除，恢復成未完成狀態
                        const cIdx = this.completedBolts.indexOf(boltIdx);
                        if (cIdx !== -1) {
                            this.completedBolts.splice(cIdx, 1);
                        }
                        this.playNote('drop');
                    }

                    // 慶祝動畫只需要播放一次，播完後把「剛完成」的標記清掉
                    setTimeout(() => {
                        this.newlyCompletedBoltIdx = -1;
                    }, 600);

                    // ⚠️ 順序很重要：先檢查是否勝利，再判定步數是否用盡
                    // 否則「最後一步剛好解謎完成」會被誤判為失敗。
                    this.checkGameEnd();

                    // 勝利時 gameOver 會把 isActive 設為 false，這裡就不會再觸發失敗
                    if (this.isActive && this.movesLeft <= 0) {
                        setTimeout(() => {
                            if (this.isActive && this.movesLeft <= 0) {
                                this.gameOver(false, "步數已用盡！");
                            }
                        }, 500);
                    }
                } else {
                    this.playNote('error');
                    if (window.SoundManager) window.SoundManager.playFailure();
                    const trgEl = document.querySelector(`.game9-bolt[data-idx="${boltIdx}"]`);
                    if (trgEl) {
                        trgEl.classList.add('shake');
                        setTimeout(() => trgEl.classList.remove('shake'), 300);
                    }
                }
            }
        },

        // 「撤銷」功能：把上一步的移動反過來做一次，回到移動之前的狀態
        undoMove: function () {
            if (!this.isActive || this.moveInfo.length === 0) return;

            const lastMove = this.moveInfo.pop();
            // 注意這裡刻意把 from/to 對調：因為要「反向」執行上一步移動
            const fromBoltIdx = lastMove.to;   // 上一步的目的地，現在變成撤銷時的來源
            const toBoltIdx = lastMove.from;   // 上一步的來源，現在變成撤銷時要送回去的地方
            const count = lastMove.count || 1;
            const fromBolt = this.bolts[fromBoltIdx];
            const toBolt = this.bolts[toBoltIdx];

            if (fromBolt.length >= count) {
                const nuts = fromBolt.splice(fromBolt.length - count, count);
                toBolt.push(...nuts);

                // 撤銷後，這兩根受影響的樁，各自的「是否完成」狀態都可能改變，需要重新檢查更新
                [fromBoltIdx, toBoltIdx].forEach(idx => {
                    const isComp = this.checkBoltCompleted(this.bolts[idx]);
                    const trackerIdx = this.completedBolts.indexOf(idx);
                    if (isComp && trackerIdx === -1) this.completedBolts.push(idx);
                    else if (!isComp && trackerIdx !== -1) this.completedBolts.splice(trackerIdx, 1);
                });

                this.movesMade++;
                this.movesLeft++; // 撤銷會把「移動次數」退還給玩家（不算浪費一次機會）
                this.lastActionTime = Date.now(); // 重新計時「無操作時間」
                this.selectedBoltIndex = -1;
                this.selectedNutCount = 0;
                this.playNote('drop');
                this.updateProgressText();
                this.renderLevel();
            }
        },

        // 判斷「某一根樁」目前是否已經完成（疊出一句完整、順序正確的詩句）
        checkBoltCompleted: function (boltStack) {
            if (boltStack.length === 0) return false;

            // 條件 1：這根樁上所有螺帽必須是「同一句詩」（同一個顏色分組）
            const targetColorGroup = boltStack[0].colorGroup;
            const targetLineString = this.lines[targetColorGroup];

            if (boltStack.length !== targetLineString.length) return false; // 字數不對，一定不算完成

            for (let i = 0; i < boltStack.length; i++) {
                if (boltStack[i].colorGroup !== targetColorGroup) return false; // 混到別句詩的字
            }

            // 條件 2：把螺帽由上到下的文字接起來，必須剛好等於這句詩的正確文字
            //   boltStack 陣列順序是「由下到上」，所以要先 reverse() 反轉成「由上到下」再組成字串比對。
            const currentString = boltStack.map(n => n.char).reverse().join('');

            return currentString === targetLineString;
        },

        // 檢查整局遊戲是否該結束（贏了，或是步數用完輸了）
        checkGameEnd: function () {
            const settings = this.difficultySettings[this.difficulty];

            // 先檢查「是否獲勝」：所有非空的樁都必須是「已完成」狀態
            let allCompleted = true;
            for (let i = 0; i < this.bolts.length; i++) {
                if (this.bolts[i].length > 0 && !this.checkBoltCompleted(this.bolts[i])) {
                    allCompleted = false;
                    break;
                }
            }

            if (allCompleted) {
                this.gameOver(true, '');
                return;
            }

            // 再檢查「是否因為超過步數上限而失敗」（moveLimit 為 0 表示沒有這項限制）
            if (settings.moveLimit > 0 && this.movesMade >= settings.moveLimit) {
                this.gameOver(false, `步數超過上限 ${settings.moveLimit} 步`);
                return;
            }
        },

        // 啟動倒數計時器：每 0.1 秒檢查一次「玩家是否發呆太久沒有動作」
        //   若超過 inactivityThreshold（預設 5 秒）沒有任何移動，就自動扣一次移動次數作為懲罰。
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;

                const now = Date.now();
                // 檢查是否「發呆超過 5 秒」（inactivityThreshold）
                if (now - this.lastActionTime >= this.inactivityThreshold) {
                    this.movesLeft--;
                    this.lastActionTime = now; // 重新給玩家 5 秒的思考時間
                    this.playNote('error');
                    this.updateProgressText();
                    this.updateTimerRing();

                    if (this.movesLeft <= 0) {
                        setTimeout(() => {
                            if (this.isActive && this.movesLeft <= 0) {
                                this.gameOver(false, "步數已用盡(怠功)。");
                            }
                        }, 500);
                    }
                }

                this.updateTimerRing();
            }, 100);
        },

        updateTimerRing: function (ratio) {
            // 如果傳入了比例（例如結算動畫時），則更新 movesLeft 以便同步顯示
            if (typeof ratio === 'number') {
                this.movesLeft = Math.round(ratio * this.maxMoves);
            }

            const rectRed = document.getElementById('game9-timer-path-red');
            const rectWhite = document.getElementById('game9-timer-path-white');
            const wrapper = document.querySelector('.game9-area');
            const svg = document.getElementById('game9-timer-ring');
            if (!rectRed || !rectWhite || !wrapper || !svg) return;

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

            rectRed.setAttribute('width', w - 6);
            rectRed.setAttribute('height', h - 6);
            rectWhite.setAttribute('width', w - 6);
            rectWhite.setAttribute('height', h - 6);

            const totalLength = (w - 6 + h - 6) * 2;
            const segment = totalLength / this.maxMoves;

            const dashArrayWhite = [];
            const dashArrayRed = [];

            // 根據 maxMoves 產生固定數量的段落，確保 transition 平滑
            for (let i = 1; i <= this.maxMoves; i++) {
                const isVisible = i <= this.movesLeft;
                // 奇數格為白色，偶數格為紅色 (假設 maxMoves 為偶數，則最後一格為紅色)
                // 第一次交換 (32->31) 會移除最後一格 (i=32)，即紅線
                const isRedSlot = (i % 2 === 0);

                if (isVisible) {
                    if (isRedSlot) {
                        // 此格顯示紅色：白環此處為 Gap(0, segment)，紅環此處為 Dash(segment, 0)
                        dashArrayWhite.push(0, segment);
                        dashArrayRed.push(segment, 0);
                    } else {
                        // 此格顯示白色：白環此處為 Dash(segment, 0)，紅環此處為 Gap(0, segment)
                        dashArrayWhite.push(segment, 0);
                        dashArrayRed.push(0, segment);
                    }
                } else {
                    // 已消耗步數：兩環皆為 Gap
                    dashArrayWhite.push(0, segment);
                    dashArrayRed.push(0, segment);
                }
            }

            rectRed.style.strokeDasharray = dashArrayRed.join(' ');
            rectWhite.style.strokeDasharray = dashArrayWhite.join(' ');
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
                    gameNo: 9,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);
            if (win) this.updatePoemInfoVisibility(true);

            if (win) {
                this.isWinning = true;
                this.renderLevel();
                this.timer = this.movesLeft;
                this.maxTimer = this.maxMoves;

                document.getElementById('game9-retryGame-btn').disabled = true;
                document.getElementById('game9-newGame-btn').disabled = true;
                if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
            } else {
                document.getElementById('game9-retryGame-btn').disabled = false;
                document.getElementById('game9-newGame-btn').disabled = false;
                if (window.SoundManager) window.SoundManager.playSadTriple();
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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "無法繼續"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game9', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game9', this.currentLevelIndex, () => showMessage(finalScore));
                    } else {
                        showMessage(finalScore);
                    }
                } else {
                    showMessage(finalScore);
                }
            };

            if (win) {
                if (window.ScoreManager && typeof window.ScoreManager.playWinAnimation === 'function') {
                    window.ScoreManager.playWinAnimation({
                        game: this,
                        difficulty: this.difficulty,
                        gameKey: 'game9',
                        timerContainerId: 'game9-timer-ring',
                        scoreElementId: 'game9-score',
                        heartsSelector: '#game9-hearts .game9-heart.score',
                        onComplete: (finalScore) => {
                            this.score = finalScore;
                            checkAchievementsAndShow(finalScore);
                        }
                    });
                } else {
                    this.score += 100;
                    checkAchievementsAndShow(this.score);
                }
            } else {
                checkAchievementsAndShow();
            }
        }
    };

    window.Game9 = Game9;

    if (new URLSearchParams(window.location.search).get('game') === '9') {
        setTimeout(() => {
            if (window.Game9) window.Game9.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
