/* =========================================
   遊戲35：詩人心情 (A Day with the Poet) — B5 情境推理
   螢幕上半部顯示詩人某日的故事卡（可滑動瀏覽），
   下方顯示「此刻他寫下哪首詩？」與 4 句候選首句。
   玩家單擊正確首句 → 整首詩飛升 + 情境動畫 + Web Speech 朗誦。
   未滑動到故事末端不能答題。
   ========================================= */
(function () {

    // ----- 內嵌示例故事資料（10 段） -----
    // 未來可擴展為外部 JSON 故事資料庫（poet_stories.json）
    // 每段欄位：
    //   author       : 詩人姓名
    //   story        : 100~200 字故事文本（合理推測或符合史實）
    //   poemTitle    : 對應正確詩作標題（用於從 POEMS 中比對抓取首句與全詩）
    //   firstLine    : 正確首句（去標點，作為比對 fallback）
    //   moodTag      : 情境標籤（豪邁/思鄉/隱逸/悲憤/喜悅/離別）
    //   scene        : 對應情境動畫場景代碼（night / snow / tavern / boat / spring / mountain / farewell）
    //   moodHint     : 答錯時提示用「___ 心情」中的詞彙
    const STORIES = [
        {
            author: '李白', poemTitle: '將進酒', firstLine: '君不見黃河之水天上來',
            moodTag: '豪邁', scene: 'tavern', moodHint: '失意中的豪情奔放',
            story: '公元 744 年，李白因得罪權貴，被唐玄宗「賜金放還」離開長安。他騎驢南下，與好友岑勳、元丹丘相聚於嵩山潁陽。三人於酒樓置酒高會，窗外黃河滾滾東流。李白舉杯仰望，心中既有壯志未酬的失意，更有不羈豪情噴薄而出——人生苦短，唯有縱酒高歌方能消胸中塊壘。'
        },
        {
            author: '蘇軾', poemTitle: '念奴嬌·赤壁懷古', firstLine: '大江東去浪淘盡千古風流人物',
            moodTag: '豪邁', scene: 'boat', moodHint: '懷古慨嘆的曠達豪情',
            story: '元豐五年，蘇軾被貶黃州已過兩年。一日他與友人泛舟長江，眺望赤壁磯。雖然此地並非三國赤壁古戰場，但江水滔滔、亂石崩雲，仍讓他想起周瑜雄姿英發、談笑破曹的英雄歲月。對比自己半生功名一場空、鬢髮早生華髮，他在悵惘中又透出一份曠達。'
        },
        {
            author: '杜甫', poemTitle: '春望', firstLine: '國破山河在城春草木深',
            moodTag: '悲憤', scene: 'spring', moodHint: '亡國之痛與憂思',
            story: '至德二年三月，安史之亂尚未平息。杜甫被叛軍困在淪陷的長安城中，已與家人分離數月。春天到了，城中宮殿殘破、草木叢生，鳥語花香卻襯得人心更碎。他登高遠望，遙想鄜州妻兒安否；又見白髮一日比一日稀少，連髮簪都快插不住了——這是國破家亡之人才寫得出的春天。'
        },
        {
            author: '王維', poemTitle: '山居秋暝', firstLine: '空山新雨後天氣晚來秋',
            moodTag: '隱逸', scene: 'mountain', moodHint: '隱逸山林的清靜淡泊',
            story: '王維晚年隱居輞川別業，半官半隱、半佛半儒。一個秋日傍晚，山中剛下過一場新雨，空氣中彌漫著松脂與泥土的清香。月光透過松林灑下斑駁光影，清泉在石上潺潺流淌。遠處傳來浣紗女子的笑語，蓮葉間漁舟悄然而過。他靜坐山齋，覺得世間繁華皆可拋，唯這片山水值得終老。'
        },
        {
            author: '李清照', poemTitle: '聲聲慢·尋尋覓覓', firstLine: '尋尋覓覓冷冷清清淒淒慘慘戚戚',
            moodTag: '悲憤', scene: 'night', moodHint: '南渡喪夫的孤寂哀愁',
            story: '建炎三年，趙明誠病逝於建康，李清照南渡避難。國破、家亡、夫死，平生收藏的金石書畫也大半散佚。她流落臨安，獨坐窗前。秋風乍起又乍歇，她想喝杯淡酒暖身，卻怎也敵不過晚來的風急。雁陣掠過，是舊時相識——只是寄書的人已不在。梧桐細雨點點滴滴，一個「愁」字已說不盡此刻心境。'
        },
        {
            author: '柳宗元', poemTitle: '江雪', firstLine: '千山鳥飛絕萬徑人蹤滅',
            moodTag: '隱逸', scene: 'snow', moodHint: '貶謫中的孤高傲世',
            story: '永貞元年，柳宗元因參與王叔文革新失敗，被貶為永州司馬。一個寒冬，他披著蓑衣走出寓所，眼前是一片浩瀚銀白——千山萬徑、鳥獸絕跡，整個世界彷彿只剩天地與他。江心一葉小舟、一個老翁，獨自垂釣寒江雪。那身影既是孤獨的縮影，也是傲然不屈的化身。'
        },
        {
            author: '王之渙', poemTitle: '登鸛雀樓', firstLine: '白日依山盡黃河入海流',
            moodTag: '喜悅', scene: 'mountain', moodHint: '登高望遠的豪邁進取',
            story: '盛唐開元年間，詩人王之渙漫遊河中府，登上聞名的鸛雀樓。樓高三層，西望可見落日緩緩沈入連綿群山，腳下黃河奔流東去、終將匯入大海。他極目遠眺，胸中湧起無盡壯志——若想看得更遠，唯有繼續向上攀登。短短二十字，道盡盛唐人積極進取、不知疲倦的精神。'
        },
        {
            author: '李白', poemTitle: '靜夜思', firstLine: '床前明月光疑是地上霜',
            moodTag: '思鄉', scene: 'night', moodHint: '羈旅異鄉的思鄉之情',
            story: '開元十四年，李白二十六歲，第一次離開蜀地遠遊揚州。秋夜旅店中，他久久不能入眠。月光透過窗欞灑在床前地上，皎潔得像一層薄霜。他抬頭望見一輪明月高懸夜空，忽然想起遠在巴蜀的家人——這月光此刻是否也照著故鄉的屋簷？千年來最普遍的一種情緒，被他以最簡單的二十字寫盡。'
        },
        {
            author: '王維', poemTitle: '九月九日憶山東兄弟', firstLine: '獨在異鄉為異客每逢佳節倍思親',
            moodTag: '思鄉', scene: 'night', moodHint: '佳節獨處的思親之情',
            story: '開元四年，王維十七歲，獨自一人在長安求取功名。九月初九重陽節，按家鄉風俗，兄弟們應該已聚在一起、頭插茱萸、登高望遠。而他孤身在外，舉目無親。想到兄弟們團聚時定會發現少了自己一人，那份悵惘讓他寫下這首千古佳作——少年人的鄉愁，從來不輸給遲暮之人。'
        },
        {
            author: '王勃', poemTitle: '送杜少府之任蜀州', firstLine: '城闕輔三秦風煙望五津',
            moodTag: '離別', scene: 'farewell', moodHint: '送別中的曠達豁然',
            story: '上元二年，王勃任職長安，他的好友杜少府要赴蜀州任職。送別那日，兩人並馬同行至灞橋。長安宮闕在三秦大地的拱衛下巍峨聳立，而蜀地五津在風煙中若隱若現。一般人送別總是傷感淚下，王勃卻說——只要四海之內還有知己，即便天涯海角也如比鄰。少年豪情寫盡了盛唐式的灑脫。'
        },
        {
            author: '蘇軾', poemTitle: '記承天寺夜遊', firstLine: '元豐六年十月十二日夜解衣欲睡',
            moodTag: '隱逸', scene: 'night', moodHint: '貶謫中的閒適自得',
            story: '元豐六年十月十二日夜，蘇軾在黃州貶所中正準備就寢，忽見月色照入窗戶，皎潔可愛。他披衣起身，無人共賞，便步行至承天寺尋好友張懷民。懷民也未眠，二人遂相與步於中庭。月光如積水空明，竹柏倒影如水中藻荇。他感歎：何夜無月？何處無竹柏？只是少了像我們這樣的「閒人」罷了。'
        },
        {
            author: '杜牧', poemTitle: '泊秦淮', firstLine: '煙籠寒水月籠沙夜泊秦淮近酒家',
            moodTag: '悲憤', scene: 'tavern', moodHint: '憂國而見世人猶醉的悲憤',
            story: '唐朝末年，國勢已衰。杜牧夜泊秦淮河上，岸邊酒家燈火通明，輕煙籠罩著寒涼的河水，月色灑在沙灘上。河邊樓船中傳來商女唱著《後庭花》——那是南朝陳後主亡國之音。商女不知亡國之恨，依舊隔江高歌；而他這位讀史明理的詩人，聽在耳中，卻是無盡的憂憤與蒼涼。'
        }
    ];

    const Game35 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,

        // ---- 遊戲狀態 ----
        questions: [],          // 本局題目陣列 { story, candidates[], correctIdx, poem(optional) }
        currentQuestionIdx: 0,
        combo: 0,
        maxCombo: 0,
        locked: false,           // 答題後鎖定（避免重複點擊）
        storyScrolledEnd: false, // 是否已滑動到故事末端

        // ---- 計時器 ----
        timer: 0,
        timerInterval: null,
        startTime: 0,
        maxTimer: 0,
        gameStartTime: null,

        // 5 難度設定（依企劃書 §7）
        //   timeLimitRate    每題秒數 (90~30)
        //   poemMinRating    詩評下限
        //   maxMistakeCount  最大錯誤次數
        //   questionCount    局內題數
        //   candidateCount   候選首句卡數量
        //   decoyType        干擾類型：crossMood / sameMood / sameAuthor / sameAuthorClose
        //   comboCap         連擊倍率封頂
        difficultySettings: {
            '小學': { timeLimitRate: 90, poemMinRating: 6, maxMistakeCount: 5, questionCount: 8, candidateCount: 4, decoyType: 'crossMood', comboCap: 2 },
            '中學': { timeLimitRate: 75, poemMinRating: 5, maxMistakeCount: 5, questionCount: 10, candidateCount: 4, decoyType: 'crossMood', comboCap: 3 },
            '高中': { timeLimitRate: 60, poemMinRating: 4, maxMistakeCount: 4, questionCount: 12, candidateCount: 4, decoyType: 'sameMood', comboCap: 3 },
            '大學': { timeLimitRate: 45, poemMinRating: 3, maxMistakeCount: 3, questionCount: 15, candidateCount: 4, decoyType: 'sameAuthor', comboCap: 5 },
            '研究所': { timeLimitRate: 30, poemMinRating: 3, maxMistakeCount: 3, questionCount: 18, candidateCount: 4, decoyType: 'sameAuthorClose', comboCap: 10 }
        },

        // ---- 樣式載入防護 ----
        loadCSS: function () {
            if (!document.getElementById('game35-css')) {
                const link = document.createElement('link');
                link.id = 'game35-css';
                link.rel = 'stylesheet';
                link.href = 'game35.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game35-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game35-container');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game35-container';
            div.className = 'game35-overlay hidden';
            div.innerHTML = `
                <div class="game35-header">
                    <div class="game35-score-board">分數: <span id="game35-score">0</span></div>
                    <div class="game35-controls">
                        <button class="game35-difficulty-tag" id="game35-diff-tag">小學</button>
                        <button id="game35-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game35-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game35-sub-header">
                    <div id="game35-hearts" class="hearts"></div>
                    <div id="game35-combo" class="game35-combo">連擊 ×1</div>
                </div>
                <div class="game35-area">
                    <div class="game35-info">
                        <div id="game35-poem-info" class="poem-info"></div>
                        <div id="game35-progress-text" class="game35-progress-text"></div>
                    </div>
                    <div id="game35-game-wrapper" class="game35-game-wrapper">
                        <svg id="game35-timer-ring">
                            <rect id="game35-timer-path" x="3" y="3"></rect>
                        </svg>
                        <!-- 故事卡 -->
                        <div id="game35-story-card" class="game35-story-card" data-scene="night">
                            <div id="game35-story-author" class="game35-story-author"></div>
                            <div id="game35-story-text" class="game35-story-text"></div>
                            <div id="game35-scroll-hint" class="game35-scroll-hint">↓ 滑動讀完整故事 ↓</div>
                        </div>
                        <!-- 提問 -->
                        <div class="game35-question-title">此刻他寫下哪首詩？</div>
                        <!-- 候選首句卡 -->
                        <div id="game35-candidates" class="game35-candidates"></div>
                        <!-- 情境動畫疊層（答對後顯示） -->
                        <div id="game35-scene-overlay" class="game35-scene-overlay hidden">
                            <div id="game35-scene-bg" class="game35-scene-bg"></div>
                            <div id="game35-scene-poem" class="game35-scene-poem"></div>
                        </div>
                    </div>
                </div>
            `;
            // 必須掛載於 document.body（非 #stage），避免雙重 scale
            document.body.appendChild(div);

            // 同步舞台縮放
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

            // 按鈕事件
            document.getElementById('game35-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game35-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game35-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            // 故事卡滑動偵測 — 滑到底才解鎖答題
            const storyCard = document.getElementById('game35-story-card');
            storyCard.addEventListener('scroll', () => this.onStoryScroll());
        },

        // 對外進入點：外部呼叫 Game35.show() 啟動本遊戲
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 顯示難度選擇畫面，選定難度後才真正開始遊戲
        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopSpeech();
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('詩人心情', (selectedLevel, levelIndex) => {
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

        // 依「一般難度模式」或「關卡挑戰模式」切換頂部按鈕文字與顏色
        updateUIForMode: function () {
            const diffTag = document.getElementById('game35-diff-tag');
            const retryBtn = document.getElementById('game35-retryGame-btn');
            const newBtn = document.getElementById('game35-newGame-btn');
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

        // 隱藏其他遊戲/選單容器，避免畫面疊在一起
        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container', 'game4-container', 'game5-container', 'game6-container', 'game7-container', 'game8-container', 'game33-container', 'game34-container', 'game35-container'];
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        // ⚠️ stopGame 必須隱藏 overlay：menu.js 全域清理只呼叫 stopGame()
        stopGame: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            this.stopSpeech();
            if (this.container) {
                this.container.classList.add('hidden');
            }
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // 重玩本局：沿用現有 this.questions（若尚未產生過題目則不動作）
        retryGame: function () {
            if (this.questions.length === 0) return;
            this.startGameProcess(true);
        },

        // 開始新局：重新產生題目後才開始遊戲流程
        // levelIndex：若有帶入，代表進入「關卡模式」的指定關卡
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            if (this.generateQuestions()) {
                this.startGameProcess(false);
            } else {
                alert('載入故事資料失敗。');
                this.stopGame();
            }
        },

        // 關卡模式下前進到下一關
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 初始化並開始一局遊戲的實際流程（分數、生命、計時器歸零並渲染首題）
        // isRetry：是否為「重來」觸發（此參數目前僅供語意標記，流程相同）
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

            document.getElementById('game35-score').textContent = this.score;
            if (window.GameMessage) window.GameMessage.hide();

            const settings = this.difficultySettings[this.difficulty];
            this.renderHearts();
            this.updateComboDisplay();

            // 顯示首題
            this.renderQuestion();

            document.getElementById('game35-retryGame-btn').disabled = false;
            document.getElementById('game35-newGame-btn').disabled = false;

            // 時限 = questionCount × timeLimitRate（依企劃書 §7：每題 30~90 秒）
            if (settings.timeLimitRate > 0) {
                this.maxTimer = Math.ceil(settings.questionCount * settings.timeLimitRate);
                this.timer = this.maxTimer;
                document.getElementById('game35-timer-ring').style.display = 'block';
                this.startTimer();
            } else {
                document.getElementById('game35-timer-ring').style.display = 'none';
            }
        },

        // ---- 生成本局題目 ----
        // 從 STORIES 中隨機（或依關卡 seed）取出 questionCount 段故事
        // 為每段生成 4 句候選首句（含正解）
        generateQuestions: function () {
            const settings = this.difficultySettings[this.difficulty];
            this.questions = [];

            // 取出可用故事池
            const pool = STORIES.slice();

            // 依關卡 seed 進行確定性洗牌；否則純隨機
            const seedBase = this.isLevelMode ? this.currentLevelIndex * 31 : null;
            this.shuffleArray(pool, seedBase);

            const needCount = Math.min(settings.questionCount, pool.length);
            for (let i = 0; i < needCount; i++) {
                const story = pool[i];

                // 生成干擾首句（3 句）
                const decoys = this.generateDecoyLines(story, settings);

                // 候選清單 = 正解 + 干擾，洗牌
                let candidates = [
                    { line: story.firstLine, isCorrect: true, sourceTitle: story.poemTitle, moodHint: story.moodHint }
                ].concat(decoys);
                this.shuffleArray(candidates, seedBase !== null ? seedBase + i * 7 : null);

                // 嘗試從 POEMS 找到對應整首詩物件（朗誦與情境動畫用）
                let poem = null;
                if (typeof POEMS !== 'undefined') {
                    poem = POEMS.find(p => p.title && p.author === story.author && p.title.indexOf(story.poemTitle.replace(/[·・]/g, '')) >= 0);
                    if (!poem) {
                        poem = POEMS.find(p => p.title === story.poemTitle);
                    }
                }

                this.questions.push({
                    story: story,
                    candidates: candidates,
                    poem: poem
                });
            }

            return this.questions.length > 0;
        },

        // 生成 3 句干擾首句
        // decoyType:
        //   crossMood        → 不同情境的故事首句（大差異）
        //   sameMood         → 相同 moodTag 的其他故事首句
        //   sameAuthor       → 同詩人其他詩的首句
        //   sameAuthorClose  → 同詩人同情境（最難）
        generateDecoyLines: function (correctStory, settings) {
            const need = settings.candidateCount - 1;
            const decoys = [];
            const used = new Set([correctStory.firstLine]);

            const tryPushFromStory = (s) => {
                if (used.has(s.firstLine)) return false;
                used.add(s.firstLine);
                decoys.push({
                    line: s.firstLine,
                    isCorrect: false,
                    sourceTitle: s.poemTitle,
                    moodHint: s.moodHint
                });
                return true;
            };

            // 1) 先從 STORIES 池中按 decoyType 偏好抽
            let storyPool = STORIES.filter(s => s.poemTitle !== correctStory.poemTitle);
            if (settings.decoyType === 'sameMood') {
                storyPool = storyPool.sort((a, b) => {
                    const aSame = (a.moodTag === correctStory.moodTag) ? 0 : 1;
                    const bSame = (b.moodTag === correctStory.moodTag) ? 0 : 1;
                    return aSame - bSame;
                });
            } else if (settings.decoyType === 'sameAuthor' || settings.decoyType === 'sameAuthorClose') {
                storyPool = storyPool.sort((a, b) => {
                    const aMatch = (a.author === correctStory.author) ? 0 : 1;
                    const bMatch = (b.author === correctStory.author) ? 0 : 1;
                    if (aMatch !== bMatch) return aMatch - bMatch;
                    if (settings.decoyType === 'sameAuthorClose') {
                        const aMood = (a.moodTag === correctStory.moodTag) ? 0 : 1;
                        const bMood = (b.moodTag === correctStory.moodTag) ? 0 : 1;
                        return aMood - bMood;
                    }
                    return 0;
                });
            } else {
                // crossMood：偏好不同情境
                storyPool = storyPool.sort((a, b) => {
                    const aDiff = (a.moodTag !== correctStory.moodTag) ? 0 : 1;
                    const bDiff = (b.moodTag !== correctStory.moodTag) ? 0 : 1;
                    return aDiff - bDiff;
                });
            }
            for (let i = 0; i < storyPool.length && decoys.length < need; i++) {
                tryPushFromStory(storyPool[i]);
            }

            // 2) 不足以 POEMS 補（從 POEMS 隨機抽首句）
            if (decoys.length < need && typeof POEMS !== 'undefined') {
                const poemsPool = POEMS.slice().sort(() => Math.random() - 0.5);
                for (let i = 0; i < poemsPool.length && decoys.length < need; i++) {
                    const p = poemsPool[i];
                    let firstLine = '';
                    if (Array.isArray(p.content) && p.content.length > 0) {
                        firstLine = String(p.content[0]).replace(/[，。？！、：；「」『』\s]/g, '');
                    } else if (typeof p.content === 'string') {
                        firstLine = p.content.split(/[，。？！\n]/)[0].replace(/[，。？！、：；「」『』\s]/g, '');
                    }
                    if (!firstLine || used.has(firstLine)) continue;
                    used.add(firstLine);
                    decoys.push({
                        line: firstLine,
                        isCorrect: false,
                        sourceTitle: p.title || '不詳',
                        moodHint: '不同情境'
                    });
                }
            }

            // 3) 最壞退化保護：以正解再填（避免崩潰）
            while (decoys.length < need) {
                decoys.push({
                    line: correctStory.firstLine + '（重）',
                    isCorrect: false,
                    sourceTitle: correctStory.poemTitle,
                    moodHint: correctStory.moodHint
                });
            }

            return decoys;
        },

        // 確定性洗牌（Fisher-Yates）：seed 為 null 時為純隨機（Math.random）
        // 有帶 seed 時，用簡易線性同餘產生器（LCG）產生可重現的偽隨機序列，
        // 讓相同關卡每次進入都抽到相同的題目與候選順序
        shuffleArray: function (arr, seed) {
            if (seed === null || seed === undefined) {
                arr.sort(() => Math.random() - 0.5);
                return;
            }
            // 簡易 LCG 確定性隨機：s 為目前狀態種子，每次呼叫 rand() 更新並回傳 0~1 亂數
            let s = seed >>> 0;
            const rand = () => {
                s = (s * 1664525 + 1013904223) >>> 0;
                return (s & 0x7fffffff) / 0x7fffffff;
            };
            // 標準 Fisher-Yates 洗牌：從陣列尾端往前，逐一與隨機位置交換
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
        },

        // ---- 渲染當前題目 ----
        renderQuestion: function () {
            if (this.currentQuestionIdx >= this.questions.length) return;
            const q = this.questions[this.currentQuestionIdx];
            const settings = this.difficultySettings[this.difficulty];

            // 故事卡：依場景換色
            const storyCard = document.getElementById('game35-story-card');
            storyCard.dataset.scene = q.story.scene || 'night';
            storyCard.scrollTop = 0;
            this.storyScrolledEnd = false;

            document.getElementById('game35-story-author').textContent = `詩人：${q.story.author}（${q.story.moodTag}）`;
            document.getElementById('game35-story-text').textContent = q.story.story;

            // 短故事判定：若文字未超出卡片高度，直接視為已讀完
            // 用 requestAnimationFrame 等下一禎再判斷
            requestAnimationFrame(() => {
                if (storyCard.scrollHeight <= storyCard.clientHeight + 4) {
                    this.storyScrolledEnd = true;
                    this.updateScrollHint(true);
                } else {
                    this.updateScrollHint(false);
                }
            });

            // 出處先隱藏
            const infoEl = document.getElementById('game35-poem-info');
            infoEl.textContent = '出處：？？？';
            infoEl.onclick = null;
            infoEl.style.cursor = 'default';
            infoEl.style.textDecoration = 'none';

            // 進度
            document.getElementById('game35-progress-text').textContent =
                `第 ${this.currentQuestionIdx + 1} / ${settings.questionCount} 題`;

            // 候選首句卡（縱向）
            const candWrap = document.getElementById('game35-candidates');
            candWrap.innerHTML = '';
            q.candidates.forEach((c, idx) => {
                const wrap = document.createElement('div');
                wrap.className = 'game35-cand-wrap';

                const btn = document.createElement('button');
                btn.className = 'game35-cand-btn';
                btn.textContent = c.line;
                btn.dataset.idx = idx;
                btn.onclick = () => this.handleSelect(idx, btn, wrap);
                wrap.appendChild(btn);

                // 答錯提示欄（隱藏）
                const hint = document.createElement('div');
                hint.className = 'game35-cand-hint hidden';
                wrap.appendChild(hint);

                candWrap.appendChild(wrap);
            });

            // 隱藏情境動畫疊層
            const sceneOv = document.getElementById('game35-scene-overlay');
            sceneOv.classList.add('hidden');
            document.getElementById('game35-scene-poem').innerHTML = '';

            this.locked = false;
        },

        // 故事卡滑動事件處理 — 偵測捲動是否已到底部
        // remain：距離捲動底部還剩多少像素，<=4 視為已讀完（保留誤差容忍值）
        onStoryScroll: function () {
            const storyCard = document.getElementById('game35-story-card');
            if (!storyCard) return;
            const remain = storyCard.scrollHeight - storyCard.clientHeight - storyCard.scrollTop;
            if (remain <= 4) {
                if (!this.storyScrolledEnd) {
                    this.storyScrolledEnd = true;
                    this.updateScrollHint(true);
                }
            }
        },

        // 更新畫面下方的「滑動讀完整故事」提示文字與樣式
        // done=true 表示已讀完，顯示打勾提示；false 則顯示提醒滑動
        updateScrollHint: function (done) {
            const hint = document.getElementById('game35-scroll-hint');
            if (!hint) return;
            if (done) {
                hint.textContent = '✓ 已讀完，請選擇';
                hint.classList.add('done');
            } else {
                hint.textContent = '↓ 滑動讀完整故事 ↓';
                hint.classList.remove('done');
            }
        },

        // ---- 玩家點擊候選首句 ----
        handleSelect: function (idx, btnEl, wrapEl) {
            if (!this.isActive || this.locked) return;

            // 故事未讀完則阻擋（給提示）
            if (!this.storyScrolledEnd) {
                const hint = document.getElementById('game35-scroll-hint');
                if (hint) {
                    hint.classList.remove('shake');
                    void hint.offsetWidth;
                    hint.classList.add('shake');
                }
                if (window.SoundManager) window.SoundManager.playFailure();
                return;
            }

            this.locked = true;
            const q = this.questions[this.currentQuestionIdx];
            const selected = q.candidates[idx];
            const isCorrect = selected.isCorrect;

            // 顯示出處
            const infoEl = document.getElementById('game35-poem-info');
            const titleForInfo = q.poem ? q.poem.title : q.story.poemTitle;
            const dynasty = q.poem ? q.poem.dynasty : '';
            const author = q.poem ? q.poem.author : q.story.author;
            infoEl.textContent = `${titleForInfo} / ${dynasty} / ${author}`;
            if (q.poem) {
                infoEl.style.cursor = 'pointer';
                infoEl.style.textDecoration = 'underline';
                infoEl.onclick = () => {
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    if (window.openPoemDialogById) window.openPoemDialogById(q.poem.id);
                };
            }

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

                const basePts = (window.ScoreManager && window.ScoreManager.gameSettings.game35)
                    ? window.ScoreManager.gameSettings.game35.getPointA : 80;
                const points = basePts * multi;
                this.score += points;
                document.getElementById('game35-score').textContent = this.score;

                this.updateComboDisplay();
                if (window.SoundManager) window.SoundManager.playSuccess();

                // 整首詩飛升 + 情境動畫
                this.showContextualScene(q);

                // Web Speech 朗誦整首詩
                if (q.poem) this.recitePoem(q.poem);

            } else {
                btnEl.classList.add('wrong');
                this.combo = 0;
                this.updateComboDisplay();

                // 答錯：選錯卡下方淡出顯示「這句出自〈XX〉，當時詩人是在 ___ 心情下寫的」
                const hint = wrapEl.querySelector('.game35-cand-hint');
                if (hint) {
                    hint.innerHTML = `這句出自〈${selected.sourceTitle}〉，當時詩人是在<b>「${selected.moodHint}」</b>心情下寫的`;
                    hint.classList.remove('hidden');
                }

                // 正解卡閃光
                const allBtns = document.querySelectorAll('#game35-candidates .game35-cand-btn');
                allBtns.forEach(b => {
                    const i = parseInt(b.dataset.idx);
                    if (q.candidates[i] && q.candidates[i].isCorrect) {
                        b.classList.add('flash-correct');
                    }
                });

                this.mistakeCount++;
                this.updateHearts();
                if (window.SoundManager) window.SoundManager.playFailure();

                const maxM = this.difficultySettings[this.difficulty].maxMistakeCount;
                if (this.mistakeCount >= maxM) {
                    setTimeout(() => this.gameOver(false, '失誤過多'), 2000);
                    return;
                }
            }

            // 答題後 2 秒鎖定，自動下一題
            setTimeout(() => {
                this.stopSpeech();
                this.currentQuestionIdx++;
                if (this.currentQuestionIdx >= this.questions.length) {
                    this.gameOver(true, '');
                } else {
                    this.renderQuestion();
                }
            }, isCorrect ? 2400 : 2600);
        },

        // ---- 答對後情境動畫 ----
        // 場景：背景換色 + 主要意象，整首詩浮現於中央
        showContextualScene: function (q) {
            const ov = document.getElementById('game35-scene-overlay');
            const bg = document.getElementById('game35-scene-bg');
            const poemBox = document.getElementById('game35-scene-poem');
            if (!ov || !bg || !poemBox) return;

            // 場景配色與意象（簡單背景換色 + 場景圖層 emoji）
            const scene = q.story.scene || 'night';
            bg.dataset.scene = scene;
            // 用 emoji 作為場景圖層的「主要意象」（無外部資源依賴）
            const icons = {
                night: '🌙',
                snow: '❄',
                tavern: '🏮',
                boat: '⛵',
                spring: '🌸',
                mountain: '⛰',
                farewell: '🍃'
            };
            bg.innerHTML = `<span class="game35-scene-icon">${icons[scene] || '✨'}</span>`;

            // 整首詩 — 飛升動畫
            let lines = [];
            if (q.poem && Array.isArray(q.poem.content)) {
                lines = q.poem.content.map(l => String(l).replace(/\s+/g, ''));
            } else if (q.poem && typeof q.poem.content === 'string') {
                lines = q.poem.content.split(/[\n]+/);
            } else {
                // 退化：只顯示首句
                lines = [q.story.firstLine];
            }
            poemBox.innerHTML =
                `<div class="game35-scene-title">〈${q.poem ? q.poem.title : q.story.poemTitle}〉</div>` +
                lines.map(l => `<div class="game35-scene-line">${l}</div>`).join('');

            ov.classList.remove('hidden');
        },

        // ---- Web Speech 朗誦 ----
        recitePoem: function (poem) {
            this.stopSpeech();
            if (!('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return;
            try {
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
                // 朗誦失敗不影響遊戲
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

        // 更新連擊顯示文字（含目前倍率與連擊數），連擊數達 3 以上時觸發彈跳動畫
        updateComboDisplay: function () {
            const el = document.getElementById('game35-combo');
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

        // 依難度的最大錯誤次數，渲染對應數量的愛心圖示（生命值）
        // 若最大錯誤次數超過 10（理論上不會發生），則不顯示愛心，避免版面爆版
        renderHearts: function () {
            const container = document.getElementById('game35-hearts');
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

        // 依目前答錯次數（mistakeCount）更新愛心圖示：已用掉的愛心變成空心
        updateHearts: function () {
            const hearts = document.querySelectorAll('#game35-hearts .heart');
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

        // ---- 計時器 ----
        // 啟動倒數計時：每 50ms 更新一次剩餘比例（ratio），歸零時判定時間到、遊戲結束
        startTimer: function () {
            clearInterval(this.timerInterval);
            this.startTime = Date.now();
            const duration = this.maxTimer * 1000;

            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - this.startTime;
                const ratio = 1 - (elapsed / duration); // 剩餘時間比例（1=剛開始，0=時間到）
                if (ratio <= 0) {
                    this.updateTimerRing(0);
                    this.gameOver(false, '時間到！');
                } else {
                    this.updateTimerRing(ratio);
                }
            }, 50);
        },

        // 依剩餘時間比例（ratio）更新畫面周圍的計時外框（SVG 矩形描邊動畫）
        // mode='win' 時為過關動畫的金色漸亮效果；否則為一般倒數的紅色漸深效果
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game35-timer-path');
            const wrapper = document.getElementById('game35-game-wrapper');
            const svg = document.getElementById('game35-timer-ring');
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

        // ---- 遊戲結束（同 game34 模板，挑戰關卡完整支援）----
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            this.stopSpeech();
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 35,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            clearInterval(this.timerInterval);

            if (win) {
                document.getElementById('game35-retryGame-btn').disabled = true;
                document.getElementById('game35-newGame-btn').disabled = true;
            } else {
                document.getElementById('game35-retryGame-btn').disabled = false;
                document.getElementById('game35-newGame-btn').disabled = false;
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
                        reason: win ? "" : (typeof reason === 'string' ? reason : "未識其心！"),
                        btnText: win ? (this.isLevelMode ? "下一關" : "下一局") : "再試一次",
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAchievementsAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game35', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game35', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game35',
                    timerContainerId: 'game35-game-wrapper',
                    scoreElementId: 'game35-score',
                    heartsSelector: '#game35-hearts .heart:not(.empty)',
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

    window.Game35 = Game35;

    // URL 自動啟動 ?game=35（嚴格比對，避免與 game=3/game=5 混淆）
    if (new URLSearchParams(window.location.search).get('game') === '35') {
        setTimeout(() => {
            if (window.Game35) window.Game35.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
