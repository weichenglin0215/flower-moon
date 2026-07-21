/* =========================================
   遊戲三十二：尋詩地圖 (Verse-Treasure Atlas)
   兩階段單擊：
     階段一 — 在簡化中國古地圖上選擇發光地點
     階段二 — 閱讀故事卡，點擊詩中發光關鍵字將其飛回地圖對應位置
   每處集滿 3 個關鍵字插旗、完成本局指定地點數即勝利。
   ========================================= */
(function () {

    // -----------------------------------------------------------------
    // 內嵌地點資料庫（未來可擴展為外部 JSON：/data/atlas_locations.json）
    // 每筆：{ name, x, y, story, author, dynasty, title, verses, keywords }
    //  - x / y : 相對 SVG viewBox (0~500, 0~700) 的座標
    //  - verses: 字串陣列，每行一句（已含或不含標點皆可，標點不參與點擊）
    //  - keywords: 3 個關鍵字，會在詩中發光、供玩家點擊
    // -----------------------------------------------------------------
    const LOCATIONS = [
        {
            name: '廬山', x: 305, y: 405,
            story: '唐玄宗開元年間，李白南遊江南，登廬山見香爐峰下瀑布如銀河直瀉。詩仙仰首吟詠，遂成千古絕唱〈望廬山瀑布〉。',
            author: '李白', dynasty: '唐', title: '望廬山瀑布',
            verses: ['日照香爐生紫煙', '遙看瀑布掛前川', '飛流直下三千尺', '疑是銀河落九天'],
            keywords: ['香爐', '瀑布', '銀河']
        },
        {
            name: '長安', x: 210, y: 290,
            story: '盛唐長安為當時世界第一大城。王維居於此，每逢佳節思念家鄉兄弟，作〈九月九日憶山東兄弟〉，道盡遊子心境。',
            author: '王維', dynasty: '唐', title: '九月九日憶山東兄弟',
            verses: ['獨在異鄉為異客', '每逢佳節倍思親', '遙知兄弟登高處', '遍插茱萸少一人'],
            keywords: ['異鄉', '兄弟', '茱萸']
        },
        {
            name: '揚州', x: 360, y: 335,
            story: '李白於黃鶴樓送別好友孟浩然東下揚州，目送孤帆遠影沒入碧空，唯見長江滔滔東流，遂寫此送別名篇。',
            author: '李白', dynasty: '唐', title: '黃鶴樓送孟浩然之廣陵',
            verses: ['故人西辭黃鶴樓', '煙花三月下揚州', '孤帆遠影碧空盡', '唯見長江天際流'],
            keywords: ['黃鶴樓', '揚州', '長江']
        },
        {
            name: '洛陽', x: 270, y: 285,
            story: '東都洛陽乃花都，唐人賞牡丹之風盛極一時。劉禹錫感慨春色短暫，於洛陽城中作詠花之句，寄託浮生若夢之嘆。',
            author: '劉禹錫', dynasty: '唐', title: '賞牡丹',
            verses: ['庭前芍藥妖無格', '池上芙蕖淨少情', '唯有牡丹真國色', '花開時節動京城'],
            keywords: ['牡丹', '芍藥', '京城']
        },
        {
            name: '岳陽樓', x: 305, y: 380,
            story: '范仲淹受好友滕子京之請，為重修之岳陽樓作記。雖未親至，但憑想像繪洞庭湖煙波浩渺，並抒「先憂後樂」之志。',
            author: '杜甫', dynasty: '唐', title: '登岳陽樓',
            verses: ['昔聞洞庭水', '今上岳陽樓', '吳楚東南坼', '乾坤日夜浮'],
            keywords: ['洞庭', '岳陽樓', '乾坤']
        },
        {
            name: '寒山寺', x: 385, y: 340,
            story: '張繼科考落榜，夜泊蘇州城外楓橋下，秋夜霜寒、漁火明滅，遠處寒山寺鐘聲穿過江面而來，孤客愁緒於此凝為千古絕唱。',
            author: '張繼', dynasty: '唐', title: '楓橋夜泊',
            verses: ['月落烏啼霜滿天', '江楓漁火對愁眠', '姑蘇城外寒山寺', '夜半鐘聲到客船'],
            keywords: ['江楓', '寒山寺', '鐘聲']
        },
        {
            name: '黃鶴樓', x: 295, y: 360,
            story: '崔顥登武昌黃鶴樓，俯瞰江漢晴川、芳草萋萋，遙望故鄉，唯見煙波浩渺。傳李白見此詩亦讚嘆「眼前有景道不得」。',
            author: '崔顥', dynasty: '唐', title: '黃鶴樓',
            verses: ['昔人已乘黃鶴去', '此地空餘黃鶴樓', '黃鶴一去不復返', '白雲千載空悠悠'],
            keywords: ['黃鶴', '白雲', '黃鶴樓']
        },
        {
            name: '白帝城', x: 240, y: 380,
            story: '李白流放夜郎，行至白帝城時逢赦免，喜出望外。乘輕舟順三峽江流而下，兩岸猿聲未絕，已過萬重山，作此千古快意之詩。',
            author: '李白', dynasty: '唐', title: '早發白帝城',
            verses: ['朝辭白帝彩雲間', '千里江陵一日還', '兩岸猿聲啼不住', '輕舟已過萬重山'],
            keywords: ['白帝', '江陵', '猿聲']
        },
        {
            name: '姑蘇', x: 380, y: 350,
            story: '姑蘇即蘇州，水鄉澤國、粉牆黛瓦。歷代詩人於此留下無數江南情懷。寒山寺亦坐落此處，鐘聲與煙雨成為姑蘇之魂。',
            author: '杜牧', dynasty: '唐', title: '寄揚州韓綽判官',
            verses: ['青山隱隱水迢迢', '秋盡江南草未凋', '二十四橋明月夜', '玉人何處教吹簫'],
            keywords: ['青山', '江南', '明月']
        },
        {
            name: '九江', x: 320, y: 410,
            story: '白居易貶江州司馬，秋夜送客於潯陽江頭，忽聞舟中琵琶聲，遂邀至船上聆聽。琵琶女自訴身世，與詩人天涯淪落之感共鳴。',
            author: '白居易', dynasty: '唐', title: '琵琶行',
            verses: ['潯陽江頭夜送客', '楓葉荻花秋瑟瑟', '主人下馬客在船', '舉酒欲飲無管絃'],
            keywords: ['潯陽', '楓葉', '管絃']
        },
        {
            name: '金陵', x: 355, y: 365,
            story: '金陵即南京，六朝古都。劉禹錫遊烏衣巷，見昔日王謝豪門之地已是尋常百姓家，感懷盛衰興亡，作下千古名篇。',
            author: '劉禹錫', dynasty: '唐', title: '烏衣巷',
            verses: ['朱雀橋邊野草花', '烏衣巷口夕陽斜', '舊時王謝堂前燕', '飛入尋常百姓家'],
            keywords: ['朱雀橋', '烏衣巷', '夕陽']
        },
        {
            name: '嶺南', x: 320, y: 530,
            story: '蘇軾貶謫嶺南惠州，雖處瘴癘之地卻能苦中作樂，日啖荔枝三百顆，自言不辭長作嶺南人，展現曠達樂觀之胸懷。',
            author: '蘇軾', dynasty: '宋', title: '惠州一絕',
            verses: ['羅浮山下四時春', '盧橘楊梅次第新', '日啖荔枝三百顆', '不辭長作嶺南人'],
            keywords: ['羅浮', '荔枝', '嶺南']
        }
    ];

    const Game32 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,

        // 本局狀態
        roundLocations: [],     // 本局選用的地點（複製自 LOCATIONS）
        currentLocationIdx: -1, // 當前正在閱讀的地點 index（對應 roundLocations）
        completedSet: null,     // Set<index> 已完成的地點 index
        collectedKeywords: null,// 當前地點已點擊的關鍵字 Set<string>
        decoyChars: [],         // 當前地點干擾發光字串列

        timer: 0,
        maxTimer: 0,
        timerInterval: null,
        startTime: 0,
        gameStartTime: null,

        // 難度設定（依企劃書 §7）
        //  timeLimitRate: 每處地點對應秒數，總時限 = localCount × timeLimitRate
        //  poemMinRating: 詩評最低（留作未來擴充用）
        //  localCount   : 本局指定地點數
        //  decoyCount   : 干擾發光字數量
        //  hintMode     : 'large'/'small'/'weak'/'none' 關鍵字提示強度
        difficultySettings: {
            '小學':   { timeLimitRate: 120, poemMinRating: 6, localCount: 5,  decoyCount: 0, hintMode: 'large' },
            '中學':   { timeLimitRate: 60,  poemMinRating: 5, localCount: 8,  decoyCount: 0, hintMode: 'small' },
            '高中':   { timeLimitRate: 36,  poemMinRating: 4, localCount: 10, decoyCount: 2, hintMode: 'weak'  },
            '大學':   { timeLimitRate: 18,  poemMinRating: 3, localCount: 12, decoyCount: 4, hintMode: 'none'  },
            '研究所': { timeLimitRate: 9,   poemMinRating: 3, localCount: 12, decoyCount: 6, hintMode: 'none'  }
        },

        // ----------------- 初始化與 DOM ------------------
        // 動態載入本遊戲專屬的 CSS 檔（game32.css），避免重複插入 <link>
        loadCSS: function () {
            if (!document.getElementById('game32-css')) {
                const link = document.createElement('link');
                link.id = 'game32-css';
                link.rel = 'stylesheet';
                link.href = 'game32.css';
                document.head.appendChild(link);
            }
        },

        // 遊戲初始化入口：載入樣式並在第一次執行時建立 DOM，之後只取得容器參照
        init: function () {
            this.loadCSS();
            if (!document.getElementById('game32-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game32-container');
        },

        // 建立整個遊戲畫面的 DOM 結構（頂部列、地圖階段、故事卡階段），並綁定按鈕事件
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game32-container';
            div.className = 'game32-overlay hidden';
            div.innerHTML = `
                <div class="game32-header">
                    <div class="game32-score-board">分數: <span id="game32-score">0</span></div>
                    <div class="game32-controls">
                        <button class="game32-difficulty-tag" id="game32-diff-tag">小學</button>
                        <button id="game32-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game32-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game32-sub-header">
                    <div id="game32-progress-text" class="game32-progress-text">尋寶進度 0/0</div>
                </div>
                <div class="game32-area" id="game32-area">
                    <svg id="game32-timer-ring">
                        <rect id="game32-timer-path" x="3" y="3"></rect>
                    </svg>

                    <!-- 階段一：地圖 -->
                    <div id="game32-map-stage" class="game32-stage">
                        <svg id="game32-map-svg" viewBox="0 0 500 700" preserveAspectRatio="xMidYMid meet">
                            <!-- 海/河水底色 -->
                            <rect x="0" y="0" width="500" height="700" fill="hsl(200, 35%, 22%)"/>
                            <!-- 簡化中國輪廓（粗略示意，非地理精準） -->
                            <path d="M 70,140 Q 120,80 220,90 Q 320,90 400,140
                                     Q 450,200 440,300 Q 430,400 380,470
                                     Q 360,540 330,580 Q 290,620 240,610
                                     Q 180,600 140,540 Q 90,460 80,360
                                     Q 70,260 70,140 Z"
                                  fill="hsl(40, 35%, 60%)" stroke="hsl(35, 40%, 35%)" stroke-width="2"/>
                            <!-- 長城（橫越北方） -->
                            <path d="M 120,170 Q 200,150 290,165 Q 360,175 410,200"
                                  fill="none" stroke="hsl(20, 30%, 30%)" stroke-width="3" stroke-dasharray="6 4"/>
                            <!-- 黃河 -->
                            <path d="M 130,240 Q 220,260 290,250 Q 360,235 410,260"
                                  fill="none" stroke="hsl(45, 60%, 45%)" stroke-width="3"/>
                            <!-- 長江 -->
                            <path d="M 130,380 Q 220,400 320,390 Q 380,380 430,400"
                                  fill="none" stroke="hsl(210, 55%, 55%)" stroke-width="3"/>
                            <!-- 圖名 -->
                            <text x="250" y="50" text-anchor="middle"
                                  fill="hsl(45, 60%, 80%)" font-family="Noto Serif TC, serif"
                                  font-size="22" font-weight="bold">詩詞地圖</text>
                            <!-- 地點圖層 (動態插入) -->
                            <g id="game32-locations-layer"></g>
                            <!-- 飛行字動畫圖層 -->
                            <g id="game32-fly-layer"></g>
                        </svg>
                        <div class="game32-map-tip">點選一個發光地點開始尋寶</div>
                    </div>

                    <!-- 階段二+三：故事卡 + 詩文 -->
                    <div id="game32-story-stage" class="game32-stage hidden">
                        <div class="game32-story-card" id="game32-story-card">
                            <div class="game32-story-title" id="game32-story-title"></div>
                            <div class="game32-story-text" id="game32-story-text"></div>
                            <div class="game32-poem-meta" id="game32-poem-meta"></div>
                            <div class="game32-poem-verses" id="game32-poem-verses"></div>
                            <div class="game32-keyword-progress" id="game32-keyword-progress"></div>
                            <button class="game32-back-btn" id="game32-back-btn" disabled>三字集滿後返回地圖</button>
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

            document.getElementById('game32-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game32-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game32-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };
            document.getElementById('game32-back-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.backToMap();
            };
        },

        // 對外開啟遊戲的入口（由選單呼叫）：先初始化 DOM，再顯示難度選擇畫面
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 對外關閉遊戲的入口（由選單呼叫）：停止遊戲並隱藏畫面
        hide: function () {
            this.stopGame();
        },

        // 顯示難度選擇器；玩家選定難度／關卡後才會真正開始新的一局
        showDifficultySelector: function () {
            this.isActive = false;
            clearInterval(this.timerInterval);
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                window.DifficultySelector.show('尋詩地圖', (selectedLevel, levelIndex) => {
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

        // 依目前是「一般難度模式」或「關卡挑戰模式」更新頂部標籤與按鈕顯示狀態
        updateUIForMode: function () {
            const diffTag = document.getElementById('game32-diff-tag');
            const retryBtn = document.getElementById('game32-retryGame-btn');
            const newBtn = document.getElementById('game32-newGame-btn');
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

        // 隱藏其他遊戲與主選單卡片容器，避免畫面重疊
        hideOtherContents: function () {
            const els = ['cardContainer', 'game1-container', 'game2-container', 'game3-container',
                         'game4-container', 'game5-container', 'game6-container', 'game7-container',
                         'game8-container', 'game32-container'];
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
            // ⚠️ 必須隱藏 overlay：menu.js 全域清理只呼叫 stopGame()
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        // 重玩本局：沿用目前已選定的 roundLocations，重新計時與計分
        retryGame: function () {
            this.startGameProcess(true);
        },

        // 開始新的一局：可傳入 levelIndex 指定進入關卡挑戰模式，否則依目前難度隨機出題
        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            this.selectRoundLocations();
            this.startGameProcess(false);
        },

        // 前往下一關：關卡編號 +1 後重新開局
        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        // 依難度選 N 個地點作為本局內容
        selectRoundLocations: function () {
            const settings = this.difficultySettings[this.difficulty];
            const count = Math.min(settings.localCount, LOCATIONS.length);

            // 以關卡編號 / 隨機產生洗牌種子
            const seed = this.isLevelMode ? this.currentLevelIndex : Math.floor(Math.random() * 99999);
            const arr = LOCATIONS.map((loc, i) => ({ loc, key: this.seededRandom(seed + i * 17) }));
            arr.sort((a, b) => a.key - b.key);
            this.roundLocations = arr.slice(0, count).map(o => o.loc);
        },

        seededRandom: function (s) {
            // 簡易線性同餘
            let x = Math.sin(s) * 10000;
            return x - Math.floor(x);
        },

        // 實際啟動一局遊戲的共用流程：重置分數/進度/計時器並渲染地圖（retryGame 與 startNewGame 皆會呼叫）
        startGameProcess: function (isRetry) {
            this.isActive = true;
            this.gameStartTime = Date.now();
            this.score = 0;
            this.completedSet = new Set();
            this.currentLocationIdx = -1;
            this.collectedKeywords = null;

            document.getElementById('game32-score').textContent = 0;
            if (window.GameMessage) window.GameMessage.hide();
            this.updateUIForMode();
            this.renderMap();
            this.showMapStage();
            this.updateProgressText();

            document.getElementById('game32-retryGame-btn').disabled = false;
            document.getElementById('game32-newGame-btn').disabled = false;

            const settings = this.difficultySettings[this.difficulty];
            // ⚠️ 時限 = 地點數 × timeLimitRate（依本局實際 localCount）
            const realCount = this.roundLocations.length;
            this.maxTimer = Math.ceil(realCount * settings.timeLimitRate);
            this.timer = this.maxTimer;
            document.getElementById('game32-timer-ring').style.display = 'block';
            this.startTimer();
        },

        // ----------------- 地圖渲染 ------------------
        renderMap: function () {
            const layer = document.getElementById('game32-locations-layer');
            layer.innerHTML = '';
            this.roundLocations.forEach((loc, idx) => {
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('class', 'game32-loc-group');
                g.dataset.idx = idx;

                if (this.completedSet.has(idx)) {
                    // 已完成：紅旗
                    const flag = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    flag.setAttribute('x', loc.x);
                    flag.setAttribute('y', loc.y + 6);
                    flag.setAttribute('text-anchor', 'middle');
                    flag.setAttribute('font-size', '26');
                    flag.textContent = '🚩';
                    g.appendChild(flag);
                } else {
                    // 未完成：發光圓點 + 脈動
                    const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    halo.setAttribute('cx', loc.x);
                    halo.setAttribute('cy', loc.y);
                    halo.setAttribute('r', 12);
                    halo.setAttribute('class', 'game32-loc-halo');
                    g.appendChild(halo);

                    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    dot.setAttribute('cx', loc.x);
                    dot.setAttribute('cy', loc.y);
                    dot.setAttribute('r', 6);
                    dot.setAttribute('class', 'game32-loc-dot');
                    g.appendChild(dot);

                    g.style.cursor = 'pointer';
                    g.addEventListener('click', () => this.onLocationClick(idx));
                }

                // 地點名稱
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', loc.x);
                label.setAttribute('y', loc.y - 16);
                label.setAttribute('text-anchor', 'middle');
                label.setAttribute('class', 'game32-loc-label');
                label.textContent = loc.name;
                g.appendChild(label);

                layer.appendChild(g);
            });
        },

        // 切換顯示：地圖階段（隱藏故事卡階段）
        showMapStage: function () {
            document.getElementById('game32-map-stage').classList.remove('hidden');
            document.getElementById('game32-story-stage').classList.add('hidden');
        },

        // 切換顯示：故事卡＋詩文階段（隱藏地圖階段）
        showStoryStage: function () {
            document.getElementById('game32-map-stage').classList.add('hidden');
            document.getElementById('game32-story-stage').classList.remove('hidden');
        },

        // ----------------- 玩家點擊地點 ------------------
        onLocationClick: function (idx) {
            if (!this.isActive) return;
            if (this.completedSet.has(idx)) return;
            if (window.SoundManager) window.SoundManager.playOpenItem();
            this.currentLocationIdx = idx;
            this.collectedKeywords = new Set();
            this.prepareDecoys();
            this.renderStoryCard();
            this.showStoryStage();
        },

        // 為當前地點抽取干擾字（從詩中其它非關鍵字裡挑）
        prepareDecoys: function () {
            const settings = this.difficultySettings[this.difficulty];
            const loc = this.roundLocations[this.currentLocationIdx];
            const kwChars = new Set();
            loc.keywords.forEach(kw => { for (const ch of kw) kwChars.add(ch); });

            // 收集詩中所有不在關鍵字裡的單字（排除標點）
            const pool = [];
            const punct = /[，。？！、：；「」『』\s,.?!:;"']/;
            const fullText = loc.verses.join('');
            for (const ch of fullText) {
                if (punct.test(ch)) continue;
                if (!kwChars.has(ch)) pool.push(ch);
            }
            // 洗牌取前 N 個
            pool.sort(() => Math.random() - 0.5);
            this.decoyChars = pool.slice(0, settings.decoyCount);
        },

        // ----------------- 故事卡渲染 ------------------
        renderStoryCard: function () {
            const loc = this.roundLocations[this.currentLocationIdx];
            const settings = this.difficultySettings[this.difficulty];

            document.getElementById('game32-story-title').textContent =
                `${loc.name} —〈${loc.title}〉`;
            document.getElementById('game32-story-text').textContent = loc.story;
            document.getElementById('game32-poem-meta').textContent =
                `${loc.dynasty}・${loc.author}`;

            // 詩文渲染：將關鍵字字元 + 干擾字字元包成可點擊 <span>
            const versesContainer = document.getElementById('game32-poem-verses');
            versesContainer.innerHTML = '';
            const kwSet = new Set();
            loc.keywords.forEach(kw => { for (const ch of kw) kwSet.add(ch); });
            const decoySet = new Set(this.decoyChars);

            // 提示強度 class
            const hintClassByMode = {
                'large': 'game32-kw-large',
                'small': 'game32-kw-small',
                'weak':  'game32-kw-weak',
                'none':  'game32-kw-none'
            };
            const kwClass = hintClassByMode[settings.hintMode] || 'game32-kw-small';

            loc.verses.forEach(line => {
                const lineDiv = document.createElement('div');
                lineDiv.className = 'game32-verse-line';
                for (const ch of line) {
                    const span = document.createElement('span');
                    span.className = 'game32-verse-char';
                    span.textContent = ch;

                    if (kwSet.has(ch)) {
                        span.classList.add('game32-kw');
                        span.classList.add(kwClass);
                        span.dataset.role = 'keyword';
                        span.dataset.char = ch;
                        span.addEventListener('click', (e) => this.onCharClick(e, ch, true));
                    } else if (decoySet.has(ch)) {
                        span.classList.add('game32-kw');
                        span.classList.add(kwClass);
                        span.classList.add('game32-decoy');
                        span.dataset.role = 'decoy';
                        span.dataset.char = ch;
                        span.addEventListener('click', (e) => this.onCharClick(e, ch, false));
                    }
                    lineDiv.appendChild(span);
                }
                versesContainer.appendChild(lineDiv);
            });

            this.updateKeywordProgress();
        },

        // 更新「已收集關鍵字」的進度文字，並依是否三詞皆集滿來啟用/停用返回地圖按鈕
        updateKeywordProgress: function () {
            const loc = this.roundLocations[this.currentLocationIdx];
            const collected = this.collectedKeywords;
            const parts = loc.keywords.map(kw => {
                const hit = [...kw].every(ch => collected.has(ch));
                return `[${kw}]${hit ? '✓' : '?'}`;
            });
            document.getElementById('game32-keyword-progress').textContent =
                `點出詩中景物：${parts.join(' ')}（已標 ${collected.size} 字）`;

            const backBtn = document.getElementById('game32-back-btn');
            // 三個關鍵字全部命中（每個 keyword 的所有字都收齊）才可返回
            const allHit = loc.keywords.every(kw => [...kw].every(ch => collected.has(ch)));
            if (allHit) {
                backBtn.disabled = false;
                backBtn.textContent = '✦ 集滿三字 返回地圖插旗 ✦';
            } else {
                backBtn.disabled = true;
                backBtn.textContent = '三字集滿後返回地圖';
            }
        },

        // ----------------- 玩家點擊詩中發光字 ------------------
        onCharClick: function (e, ch, isKeyword) {
            if (!this.isActive) return;
            const span = e.currentTarget;
            if (span.classList.contains('game32-collected')) return;

            if (isKeyword) {
                // 正確：飛入地圖
                if (window.SoundManager) window.SoundManager.playSuccess();
                this.collectedKeywords.add(ch);
                span.classList.add('game32-collected');
                this.flyCharToMap(span, ch);
                // 加分
                const pts = (window.ScoreManager && window.ScoreManager.gameSettings.game32)
                    ? window.ScoreManager.gameSettings.game32.getPointA : 100;
                this.score += pts;
                document.getElementById('game32-score').textContent = this.score;
                this.updateKeywordProgress();
            } else {
                // 干擾字：扣分（取得 getPointA/2）
                if (window.SoundManager) window.SoundManager.playFailure();
                span.classList.add('game32-wrong');
                setTimeout(() => span.classList.remove('game32-wrong'), 600);
                const penalty = Math.floor(((window.ScoreManager && window.ScoreManager.gameSettings.game32)
                    ? window.ScoreManager.gameSettings.game32.getPointA : 100) / 2);
                this.score = Math.max(0, this.score - penalty);
                document.getElementById('game32-score').textContent = this.score;
            }
        },

        // 毛筆字飛入地圖動畫：在 SVG fly-layer 加一個 <text>，沿弧線移動
        flyCharToMap: function (sourceSpan, ch) {
            const mapSvg = document.getElementById('game32-map-svg');
            const flyLayer = document.getElementById('game32-fly-layer');
            const loc = this.roundLocations[this.currentLocationIdx];
            if (!mapSvg || !flyLayer || !loc) return;

            // 以 SVG viewBox 內部座標做動畫，從畫面下方中央起飛 → 地點位置
            const startX = loc.x + (Math.random() - 0.5) * 60;
            const startY = 670;  // 螢幕下方
            const endX = loc.x;
            const endY = loc.y;
            const midX = (startX + endX) / 2 + (Math.random() - 0.5) * 80;
            const midY = Math.min(startY, endY) - 120;

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'game32-fly-char');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('x', startX);
            text.setAttribute('y', startY);
            text.textContent = ch;
            flyLayer.appendChild(text);

            const duration = 800;
            const t0 = performance.now();
            const animate = (now) => {
                const t = Math.min(1, (now - t0) / duration);
                // 二次貝茲：B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
                const omt = 1 - t;
                const x = omt * omt * startX + 2 * omt * t * midX + t * t * endX;
                const y = omt * omt * startY + 2 * omt * t * midY + t * t * endY;
                text.setAttribute('x', x);
                text.setAttribute('y', y);
                text.setAttribute('opacity', 1 - t * 0.5);
                if (t < 1) requestAnimationFrame(animate);
                else text.remove();
            };
            requestAnimationFrame(animate);
        },

        // ----------------- 返回地圖（過關該地點） ------------------
        backToMap: function () {
            const idx = this.currentLocationIdx;
            if (idx < 0) return;
            this.completedSet.add(idx);
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) {
                window.SoundManager.playJoyfulTriple();
            } else if (window.SoundManager) {
                window.SoundManager.playSuccess();
            }
            this.currentLocationIdx = -1;
            this.renderMap();
            this.showMapStage();
            this.updateProgressText();

            // 是否全部完成
            if (this.completedSet.size >= this.roundLocations.length) {
                this.gameOver(true, '');
            }
        },

        // 更新頂部「尋寶進度 done/total」文字
        updateProgressText: function () {
            const total = this.roundLocations.length;
            const done = this.completedSet ? this.completedSet.size : 0;
            document.getElementById('game32-progress-text').textContent =
                `尋寶進度 ${done}/${total}`;
        },

        // ----------------- 計時器（矩形邊框，沿用 game8 樣式邏輯） ------------------
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
            }, 100);
        },

        // 依剩餘時間比例（ratio）繪製矩形計時外框；mode='win' 時改用過關動畫的漸層配色
        updateTimerRing: function (ratio, mode) {
            const rect = document.getElementById('game32-timer-path');
            const wrapper = document.getElementById('game32-area');
            const svg = document.getElementById('game32-timer-ring');
            if (!rect || !wrapper || !svg) return;
            let w = wrapper.offsetWidth;
            let h = wrapper.offsetHeight;
            if (w === 0 || h === 0) {
                const r2 = wrapper.getBoundingClientRect();
                w = r2.width; h = r2.height;
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
                const c = Math.max(0, Math.min(1, ratio));
                rect.style.transition = 'stroke 0.3s ease';
                rect.style.strokeDasharray = `${c * perimeter}, ${(1 - c) * perimeter}`;
                rect.style.strokeDashoffset = c * perimeter;
                rect.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * c)}%)`;
            } else {
                rect.style.transition = '';
                rect.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                rect.style.stroke = `hsl(0, ${Math.round(40 + 50 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        // ----------------- 勝負結算 ------------------
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            clearInterval(this.timerInterval);

            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({
                    gameNo: 32, difficulty: this.difficulty || '',
                    score: 0, isWin: false, durationS: durationS
                });
            }

            if (win) {
                document.getElementById('game32-retryGame-btn').disabled = true;
                document.getElementById('game32-newGame-btn').disabled = true;
            } else {
                document.getElementById('game32-retryGame-btn').disabled = false;
                document.getElementById('game32-newGame-btn').disabled = false;
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
                        reason: win ? '' : (typeof reason === 'string' ? reason : '探索失敗！'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            const checkAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game32', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog) {
                        window.AchievementDialog.showInstantAchievementPop(
                            achId, 'game32', this.currentLevelIndex, () => showMessage(finalScore));
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
                    gameKey: 'game32',
                    timerContainerId: 'game32-area',
                    scoreElementId: 'game32-score',
                    heartsSelector: null,
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        checkAndShow(finalScore);
                    }
                });
            } else {
                checkAndShow();
            }
        }
    };

    window.Game32 = Game32;

    // ?game=32 自動啟動
    if (new URLSearchParams(window.location.search).get('game') === '32') {
        setTimeout(() => {
            if (window.Game32) window.Game32.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }
})();
