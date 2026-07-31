/* =========================================
   Game39《彈珠成詩》(Pinball Poem)
   ----------------------------------------
   舒壓頁「珠落玉盤」(zhuluo.js) 的可過關遊戲版。規則骨架完全相同──整首詩拆成
   一顆一顆的字珠，落進下方七個直式收納格，一格對應「一句詩的第幾個字」，由下
   往上疊成一首完整的詩──差別在於：

   ⭐ 珠子不再從天上自動落下，而是由玩家從畫面右側的發射軌道打上去。
      按住畫面往上拖曳，軌道上會出現半透明的粗箭頭表示力道，拖得越長力道越強；
      放開就發射。珠子沿著軌道衝到頂端，再貼著上方的拱形導軌往左滑行，力道越強
      滑得越遠，最後因重力脫離導軌落下、穿過干擾棒區進入收納格。
      → 也就是說「用什麼力道發射」直接決定落點的大致位置，是一門可以練出來的
        手感，而不是單純碰運氣。

   ⭐ 彈珠數量有限（＝這一局的資源），用完就結束。剩餘彈珠沿用《三字成珠》
      (game24) 的紅白相間外框顯示與換分機制。

   難度＝要完成多少詩句：
      小學 一句五言／中學 一句七言／高中 兩句五言／大學 兩句七言／研究所 四句七言

   ⚠️ 物理模擬的幾個「踩過的坑」（與 zhuluo.js 同源，註解一併保留在此供日後維護）：
      1. 同排干擾棒的通道淨寬必須大於球徑，最外側那根與側牆之間的通道也算。
         寫死間距會讓球楔在棒子之間或牆邊永遠下不來。這裡一律由球半徑反推。
      2. 隔板圓頭「不」納入碰撞：一格只有約 58px 寬，球要同時避開兩側隔板圓頭
         需要的寬度比格子本身還寬，會造成某些格子完全進不去。改成以「跨過格口
         瞬間的 x」決定落入哪格，再平順吸到格中央。
      3. 「靜置接觸」不可當成撞擊處理，否則球會永遠平衡在棒子頂端。

   ⚠️ 依規範 §6，一般遊戲應使用 getSharedRandomPoem 取詩；但本作需要「連續 N 句、
      每句字數完全相同」才排得成矩形收納格，getSharedRandomPoem 只保證總字數落在
      範圍內。因此改用自訂掃描（與 tuiqiao.js／game38.js／zhuluo.js 相同先例）。

   依《.agent/skills/花月開發常見錯誤與解法.md §4》：
      - 全域 class 前綴 game39-
      - loadCSS() 動態防護
      - overlay 掛載 document.body 且套用 registerOverlayResize
      - stopGame() 必須隱藏 container 並停掉 requestAnimationFrame
      - ⚠️ 本作未實作「關卡挑戰」模式（僅一般難度模式），已於 README 版本紀錄載明
   ========================================= */

(function () {
    'use strict';

    // ── 可調參數（錯誤落點的停留／消失秒數，與舒壓頁一致）──
    const WRONG_HOLD_MS = 1000;
    const WRONG_FADE_MS = 500;

    // ── 畫布與版面（邏輯像素）──
    // ⚠️ CH 是「填滿遊戲區」反推出來的固定值：舞台 850 −頂部資訊列 50 −副標 36
    //    −.fmd-area 上下 padding 12 −木框上下 padding 12 ≈ 740，取 736 留一點餘裕。
    const CW = 460, CH = 736;
    const RAIL_W = 52;                 // 右側發射軌道寬度
    const PLAY_W = CW - RAIL_W;        // 左側主台面寬度
    const BIN_COUNT = 7;
    /**
     * ⭐ 收納格固定保留四層（＝最高難度的句數），不隨難度變動。
     * 「五種難度都是相同高度」不只是視覺一致而已——更重要的是整個台面的幾何
     * （拱門、干擾棒、格口位置）因此在五種難度下完全相同，「力道 → 落點」的
     * 對應關係也就完全相同，玩家在小學練出來的手感可以原封不動帶到研究所。
     * 句數少的難度只用到最下面幾層，上面留白。
     */
    const BIN_ROWS = 4;
    /** 珠子半徑：通道淨寬 = 格寬 − 2×棒半徑 = 58.3 − 10 = 48.3px，球徑必須小於它 */
    const BALL_R = 20;
    const PEG_R = 5;
    const WALL_BUMP_R = 11;
    /** 收納格隔板的半厚度（實心擋板，珠子跨不過去；見 _collideDividers） */
    const DIVIDER_HW = 3;

    /**
     * ── 上方拱形導軌：左右對稱的圓弧（圓心落在台面正中央的起拱線上）──
     *
     * 球被限制在這個圓的「內側」：沿著導軌內緣滑行，當速度不足以提供貼著圓弧
     * 所需的向心力時就自然脫離、變成拋體落下。力道越強在導軌上跑得越遠、落點
     * 越偏左；力道越弱越早脫落、落點越偏右——這正是實體彈珠台的手感來源。
     *
     * ⚠️ 圓弧的曲率半徑是這裡最關鍵也最容易踩雷的東西。舊版用的是很扁的橢圓
     *    （半軸 231×165），頂點附近的等效曲率半徑高達 a²/b ≈ 323，維持接觸所需的
     *    速度門檻 √(g·R) ≈ 14 遠高於實際球速，於是球整路「黏」在導軌上滑到最左端，
     *    力道再怎麼變都砸同一格。改成半徑 230 的正圓後門檻降到約 11.9，落在實際
     *    球速範圍內，球才會依力道在不同位置脫離導軌。
     */
    const ARCH_CY = 250;               // 起拱線 y（圓心也在這條線上）
    const ARCH_CX = CW / 2;
    const ARCH_R = CW / 2;             // 半徑＝台面半寬 → 圓弧剛好從左牆跨到右牆

    /** 干擾棒格子最上層的 y（要離拱門下緣夠遠，否則球一脫離導軌就被攔截） */
    const PEG_FIELD_TOP = 312;
    /** 干擾棒格子的層數（最後一層剛好落在格口，也就是隔板圓頭） */
    const PEG_LEVELS = 5;

    /**
     * ── 發射口的單向擋板 ──
     * 一片朝上、向右上傾斜的隱形擋板，架在發射軌道口。球往上衝時從它下方通過
     * （不擋），落下時被它擋住並往左推回台面。沒有它的話，力道小、幾乎垂直落
     * 回來的球會直接掉進發射軌道裡上上下下，玩家白白損失一顆彈珠。
     */
    const GATE_RISE = 40;              // 擋板右端比左端高多少

    // ── 物理 ──
    const GRAVITY = 0.62;
    /**
     * ⭐ 撞干擾棒的彈性係數 —— 這一個數字直接決定「瞄準有沒有用」。
     *
     * 干擾棒改成五層交錯格子之後，球在落到格口前平均要撞好幾次，彈性係數的影響
     * 被放大得非常明顯。實測（每個力道打 60 顆、掃 21 段力道，統計每一格的最佳
     * 命中率）：
     *      0.30 → 太黏，落點幾乎只由拱門決定，彈珠台的味道不見了
     *      0.72 → 太彈，中間幾格的最佳命中率只剩 13~18%（亂猜是 14%），
     *             等於瞄準完全沒有用，而且研究所要 118 顆球才打得完（預算只有 84）
     *      0.52 → 兼顧：仍然會被彈歪一兩格、結果難以預測，但力道與落點的關係
     *             還留得住，每一格都瞄得到
     * 放成物件屬性而非常數，是為了方便在 console 裡即時試不同手感。
     */
    const REST_PEG_DEFAULT = 0.52;
    const REST_WALL = 0.42;
    const REST_BALL = 0.25;
    const REST_ARCH = 0.15;            // 導軌很「黏」，讓球是滑行而非彈開
    const CONTACT_V = 0.55;
    const ROLL_ASSIST = 0.09;
    const AIR = 0.999;
    const MAX_SPEED = 36;              // 發射初速可達 34，上限要留餘裕
    const SUBSTEPS = 6;                // 初速高，子步要比舒壓頁多
    const TRAIL_LEN = 14;
    const BALL_TTL_MS = 14000;

    // ── 發射 ──
    const DRAG_MAX = 240;              // 向上拖曳這麼多像素＝滿力道
    /**
     * ⭐ 按住蓄力：從按下開始，力道在這段時間內由 0 線性長到滿。
     * 手指按著不動也能蓄力（球上方的箭頭會越變越長），不必真的拖曳——手機上
     * 單手拿著也好操作。往上拖曳仍然有效，兩者取較大值，所以想快點蓄滿就拖，
     * 想慢慢微調就按著看箭頭。
     */
    const CHARGE_MS = 1500;
    /**
     * ⭐ 力道 → 「進入拱門時的速度」（不是發射瞬間的速度）。
     *
     * ⚠️ 這裡有個很值得記下來的設計轉折。一開始是老實地把發射當成拋體運動：
     *    給一個初速、讓球在軌道裡受重力減速爬上去。結果完全不能玩——軌道高達
     *    600px，光是爬上去就要 v≈24，而「剛好爬到頂」與「衝過頂端還剩不少速度」
     *    之間只差 3~4 的初速，力道稍微多一點球就一路滑到拱門最左端。實測 0~25%
     *    力道涵蓋了整個可用範圍，25% 以上通通砸在最左邊那格（九成的滑桿是廢的）。
     *
     *    改法：**軌道內不計重力**，力道直接等於「球抵達拱門起拱線時的速度」。
     *    對玩家而言這反而更直覺（拉多長＝球有多快），對設計而言則是把整條滑桿
     *    完整映射到真正有意義的速度區間上。實體彈珠台的發射軌道本來就是靠彈簧
     *    把動能一次給足、軌道本身近乎無損，所以這個簡化也不算違反直覺。
     */
    // ⚠️ 下限刻意設得「一定射得出去」：球在軌道內不受重力，抵達起拱線時的速度就是
    //    V_MIN，之後才開始受重力減速。它必須大於「從起拱線再爬到導軌內緣接觸點」
    //    所需的速度（約 7.9），否則最小力道的球會爬不到導軌就往回落，在發射軌道裡
    //    上上下下，白白浪費一顆彈珠。9.0 有充裕餘裕。
    // ⚠️ 這兩個值是實測掃描出來的，改動拱門半徑或重力就必須重新校準：
    //    v≤10 時球太早脫離導軌，落點在右半邊來回跳、不單調；v≥19.5 之後球一律
    //    貼到最左牆、再加力也沒有變化。真正有意義的區間只有 [11, 19.2]，整條
    //    力道滑桿就對應到這一段，落點才會從第 6 格平順地掃到第 0 格。
    const V_MIN = 11.0;
    const V_MAX = 19.2;

    const HUES_5 = [0, 44, 128, 212, 288];
    const HUES_7 = [0, 26, 50, 132, 202, 252, 298];

    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const rnd = (a, b) => a + Math.random() * (b - a);

    const Game39 = {
        // ── 共用狀態 ──
        container: null,
        canvas: null,
        ctx: null,
        isActive: false,
        difficulty: '小學',
        score: 0,
        isWin: false,
        // ── 關卡挑戰模式 ──
        // ⚠️ 關卡挑戰只要求「同一關永遠出同一道題目（同一首詩）」，並不要求每一顆
        //    彈珠的落點都完全相同 —— 本作的隨機性來自玩家自己的發射力道與台面碰撞，
        //    本來就無法（也不該）固定。因此只有取詩需要以關卡序號當種子做確定性選取。
        isLevelMode: false,
        currentLevelIndex: 1,

        // ── 詩詞與盤面 ──
        currentPoem: null,
        poemLines: [],
        LINES: 1,
        CHARS: 5,
        binOffset: 1,
        hues: HUES_5,
        colW: PLAY_W / BIN_COUNT,
        binTop: 0,
        pegs: [],
        // ── 發射蓄力 ──
        chargeStart: 0,
        dragPower: 0,
        /** 撞干擾棒的彈性係數（可於 console 即時調整試手感，見 REST_PEG_DEFAULT） */
        restPeg: REST_PEG_DEFAULT,

        // ── 執行狀態 ──
        balls: [],
        stacks: [],
        nextLine: [],
        placed: [],
        lineDone: [],
        particles: [],
        rings: [],
        emitCursor: 0,
        loaded: null,          // 目前架在發射台上的字 { col, line, ch, hue }
        charging: false,
        power: 0,
        dragStartY: 0,
        rafId: null,
        lastFrameAt: 0,
        lastPegSoundAt: 0,
        seq: 0,
        gameStartTime: null,

        // ── 彈珠數（比照 game24／game38 的紅白框）──
        ballsLeft: 0,
        maxBalls: 0,

        // ── playWinAnimation 需要的欄位（把「剩餘彈珠」當成「剩餘秒數」餵進去，
        //    沿用 game38 的手法，不必另外重寫一套勝利動畫）──
        timer: 0,
        maxTimer: 0,
        startTime: 0,

        /*
         * ⭐ 難度設定（歡迎自行調整）
         *   lines / chars ：本局要完成幾句、每句幾字（＝收納格用到幾格、疊幾層）
         *   ballMul       ：彈珠總數 = ceil(lines × chars × ballMul)。
         *
         *   ⚠️ 這組倍率是實測校準出來的，改動干擾棒排法或彈性係數就必須重算。
         *      量法：先掃 21 段力道建出「力道 → 落點分布」表，用三點平滑挑出每一格
         *      的最佳力道（不能直接取最大值——21 個帶雜訊的估計取最大值會系統性
         *      高估，實測會高估到 1.4 倍，照著配彈珠數就會配得太少），再以該力道
         *      獨立打 150 顆驗證真實命中率。
         *      結果：各格 16%~44%（亂槍打鳥是 14%），平均一個字要 4.1 顆球（七言）
         *      ／4.5 顆球（五言，最外兩格沒有底、球會漏掉）。倍率在這個基礎上再留
         *      約 1.4 倍給玩家學手感。
         *
         *   ⚠️ 干擾棒改成五層交錯格子之後，球在落進格子前平均要撞好幾次，落點的
         *      隨機性比先前的兩排高很多——這是刻意的（「讓結果更難控制」），代價
         *      就是每一局要打的球數明顯變多。想讓一局短一點，把倍率調小即可。
         *   poemMinRating ：詩評下限
         */
        difficultySettings: {
            '小學': { lines: 1, chars: 5, ballMul: 6.8, poemMinRating: 6 },
            '中學': { lines: 1, chars: 7, ballMul: 6.3, poemMinRating: 5 },
            // 高中是「五言 × 兩句」：最外兩格沒有底、球會漏掉，中間幾格又最難瞄，
            // 實測是五種難度裡最吃緊的一關，倍率特別再放寬一點。
            '高中': { lines: 2, chars: 5, ballMul: 7.4, poemMinRating: 4 },
            '大學': { lines: 2, chars: 7, ballMul: 5.9, poemMinRating: 3 },
            '研究所': { lines: 4, chars: 7, ballMul: 5.4, poemMinRating: 3 },
        },

        PUNCT_RE: /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g,

        // ========================================================
        // CSS 載入防護
        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('theme-dark-css')) {
                const t = document.createElement('link');
                t.id = 'theme-dark-css'; t.rel = 'stylesheet'; t.href = 'theme_dark.css';
                document.head.appendChild(t);
            }
            if (!document.getElementById('game39-css')) {
                const l = document.createElement('link');
                l.id = 'game39-css'; l.rel = 'stylesheet'; l.href = 'game39.css';
                document.head.appendChild(l);
            }
        },

        init: function () {
            this.loadCSS();
            if (!document.getElementById('game39-container')) this.createDOM();
            this.container = document.getElementById('game39-container');
            this.canvas = document.getElementById('game39-canvas');
            this.ctx = this.canvas.getContext('2d');
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game39-container';
            div.className = 'game39-overlay fmd-overlay hidden';
            div.innerHTML = `
                <div class="fmd-header">
                    <div class="fmd-score-board">分數: <span id="game39-score">0</span></div>
                    <div class="fmd-controls">
                        <button class="fmd-difficulty-tag" id="game39-diff-tag">小學</button>
                        <button id="game39-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game39-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="fmd-sub-header">
                    <div id="game39-balls-label" class="fmd-moves-label">彈珠:<span id="game39-balls">0</span>/<span id="game39-max-balls">0</span></div>
                    <div id="game39-poem-info" class="fmd-poem-info"></div>
                </div>
                <div class="fmd-area">
                    <div id="game39-board-wrapper" class="fmd-board-wrapper game39-board-wrapper">
                        <svg id="game39-timer-ring" class="fmd-timer-ring">
                            <rect id="game39-moves-path-white" class="fmd-moves-path-white" x="3" y="3"></rect>
                            <rect id="game39-moves-path-red" class="fmd-moves-path-red" x="3" y="3"></rect>
                        </svg>
                        <canvas id="game39-canvas" width="${CW}" height="${CH}"></canvas>
                    </div>
                </div>
            `;
            document.body.appendChild(div);

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

            document.getElementById('game39-retryGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.retryGame();
            };
            document.getElementById('game39-newGame-btn').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.startNewGame();
            };
            document.getElementById('game39-diff-tag').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.showDifficultySelector();
            };

            this.bindInput(document.getElementById('game39-canvas'));
        },

        // ========================================================
        // 發射操作：按住 → 往上拖曳決定力道 → 放開發射
        // ========================================================
        bindInput: function (cv) {
            // ⚠️ 座標必須用 getBoundingClientRect 換算：overlay 掛在 body 上並被
            //    registerOverlayResize 施加 scale()，直接拿 clientY 相減會隨螢幕
            //    大小而失準（縮放比例沒算進去）。用 rect 高度反推最保險。
            const toLocalY = (clientY) => {
                const r = cv.getBoundingClientRect();
                return (clientY - r.top) * (CH / r.height);
            };

            const down = (clientY) => {
                if (!this.isActive || !this.loaded || this.ballsLeft <= 0) return;
                if (this._railBusy()) return;             // 上一顆還在發射軌道裡
                this.charging = true;
                this.power = 0;
                this.dragPower = 0;
                this.chargeStart = performance.now();
                this.dragStartY = toLocalY(clientY);
            };
            const move = (clientY) => {
                if (!this.charging) return;
                const dy = this.dragStartY - toLocalY(clientY);   // 往上拖為正
                this.dragPower = clamp(dy / DRAG_MAX, 0, 1);
            };
            const up = () => {
                if (!this.charging) return;
                this.charging = false;
                // ⚠️ 不設「力道太小就不發射」的門檻：最小力道本來就足以射出發射軌道
                //    （見 V_MIN 註解），輕輕一點就發射才符合實體彈簧的手感，也不會
                //    讓玩家以為按了沒反應。
                this.fire();
                this.power = 0;
                this.dragPower = 0;
            };

            cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); down(e.clientY); });
            cv.addEventListener('pointermove', (e) => { move(e.clientY); });
            cv.addEventListener('pointerup', () => up());
            cv.addEventListener('pointercancel', () => up());
            // 防止行動裝置上拖曳畫面
            cv.addEventListener('touchmove', (e) => { if (this.charging) e.preventDefault(); }, { passive: false });
        },

        /**
         * ⭐ 能不能發射下一顆，只看「發射軌道裡還有沒有球」。
         * 球一離開軌道（穿出起拱線）就立刻可以裝填下一顆，玩家幾乎不用等——
         * 而不是等它落定。單向擋板保證射出去的球絕不會回到軌道，所以這樣是安全的。
         */
        _railBusy: function () {
            for (const b of this.balls) if (b.inRail && b.state === 'fly') return true;
            return false;
        },

        /** 場上是否還有「有機會歸位」的球（給失敗判定用） */
        _hasLiveBall: function () {
            for (const b of this.balls) {
                if (b.state !== 'fly' && b.state !== 'settling') continue;
                if (b.passThrough) continue;
                if (b.bin >= 0 && b.bin !== b.targetBin) continue;   // 註定失敗，可以先發下一顆
                return true;
            }
            return false;
        },

        fire: function () {
            if (!this.loaded || this.ballsLeft <= 0) return;
            const v0 = V_MIN + this.power * (V_MAX - V_MIN);
            const L = this.loaded;
            this.balls.push({
                id: ++this.seq,
                bornAt: performance.now(),
                col: L.col, line: L.line, ch: L.ch, hue: L.hue,
                targetBin: this._binOf(L.col),
                // ⚠️ 發射時給一點點隨機（速度 ±1.5%、起點 ±2px）。
                //    少了它，同一個力道每次的軌跡幾乎一模一樣，「有沒有正中某一根
                //    干擾棒」變成一翻兩瞪眼的階梯函數：力道 83% 掉第 0 格、92% 卻
                //    跳回第 3 格。加了微擾之後，同一個力道會落成一個以瞄準格為中心
                //    的分布，力道與落點的關係才回得到單調、玩家練得起來。
                //    實體機台的彈簧與鋼珠本來也不可能每次完全一致。
                x: CW - RAIL_W / 2 + rnd(-2, 2),
                y: CH - BALL_R - 8,
                vx: 0, vy: -v0 * rnd(0.985, 1.015),
                r: BALL_R, scale: 1,
                inRail: true, exitedRail: false,
                state: 'fly', bin: -1, restY: 0, stackIndex: -1,
                wrongAt: 0, restCheck: 0, lastY: 0, trail: [],
            });
            this.ballsLeft--;
            this._updateBallsLabel();
            this.updateBallsRing();
            if (window.SoundManager) window.SoundManager.playHit(1, 0.12);
            this._loadNext();
        },

        // ========================================================
        // 生命週期
        // ========================================================
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        hideOtherContents: function () {
            const els = [];
            for (let i = 1; i <= 38; i++) els.push('game' + i + '-container');
            els.push('cardContainer', 'tuiqiao-container', 'zhuluo-container', 'yichichunshui-container',
                'suiyuean-container', 'zhexianren-container', 'wordcloud-container');
            els.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    if (id === 'cardContainer') el.style.display = 'none';
                    else el.classList.add('hidden');
                }
            });
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (window.GameMessage) window.GameMessage.hide();
            this.hideOtherContents();

            if (window.DifficultySelector) {
                // ⚠️ callback 必須接兩個參數：一般難度模式只會傳 selectedLevel，
                //    關卡挑戰（LevelSelector）則會多傳一個全域關卡序號 levelIndex。
                window.DifficultySelector.show('彈珠成詩', (selectedLevel, levelIndex) => {
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
            const tag = document.getElementById('game39-diff-tag');
            const newBtn = document.getElementById('game39-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (tag) {
                // 關卡挑戰模式下標籤改顯示關卡編號，底色仍用該關所屬難度的顏色
                tag.textContent = this.isLevelMode ? `挑戰第 ${this.currentLevelIndex} 關` : this.difficulty;
                tag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                tag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
            // 關卡挑戰時隱藏「開新局」：該關的題目是固定的，換一局沒有意義
            if (newBtn) newBtn.style.display = this.isLevelMode ? 'none' : 'inline-block';
        },

        hide: function () { this.stopGame(); },

        // ⚠️ menu.js 全域清理只呼叫 stopGame()，必須在此隱藏 container
        stopGame: function () {
            this.isActive = false;
            this.charging = false;
            if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
            if (this.container) this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            const el = document.getElementById('cardContainer');
            if (el) el.style.display = '';
        },

        retryGame: function () {
            if (!this.currentPoem) { this.startNewGame(); return; }
            this.startGameProcess();
        },

        startNewGame: function (levelIndex) {
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (levelIndex !== undefined) {
                this.currentLevelIndex = levelIndex;
                this.isLevelMode = true;
            }
            if (this.selectRandomPoem()) this.startGameProcess();
            else { alert('載入詩詞失敗。'); this.stopGame(); }
        },

        startNextLevel: function () {
            this.currentLevelIndex++;
            this.startNewGame();
        },

        /**
         * 關卡序號 → 詩詞池索引的確定性換算。
         *
         * 用 Lehmer 線性同餘產生器（16807 / 2147483647，與 script.js 的
         * getSharedRandomPoem 同一套）產生亂數，種子混入 gameKey 與難度，
         * 確保「不同遊戲」「不同難度」的同一個關卡序號不會撞題。
         *
         * ⚠️ 這裡刻意「先把整個詩詞池洗成一個固定順序，再依關卡序號取第 N 個」，
         *    而不是直接用種子算出一個索引。因為後者只是獨立取樣，會有生日問題：
         *    研究所有 150 關、候選池 161 首，獨立取樣下預期只會出現約 100 首不同的
         *    詩，等於有三分之一的關卡跟別關拿到一模一樣的題目——關卡挑戰就失去意義。
         *    改成取「洗過牌的第 N 張」之後，只要同一難度的關卡數不超過池子大小，
         *    每一關的題目都保證不重複。各難度的關卡數（20/30/50/50/150）在編號上是
         *    連續的區段，所以直接用全域關卡序號取模就能達到這個效果。
         */
        _levelPoemIndex: function (poolLen, gameKey, difficulty, levelIndex) {
            const key = gameKey + '|' + difficulty;
            let h = 0;
            for (let i = 0; i < key.length; i++) {
                h = (h << 5) - h + key.charCodeAt(i);
                h |= 0;
            }
            let s = (Math.abs(h) % 2147483646) + 1;
            for (let k = 0; k < 8; k++) s = (s * 16807) % 2147483647;   // 預熱
            const rand = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

            // Fisher–Yates：同一組 (gameKey, difficulty) 永遠洗出同一個順序
            const order = new Array(poolLen);
            for (let i = 0; i < poolLen; i++) order[i] = i;
            for (let i = poolLen - 1; i > 0; i--) {
                const j = Math.floor(rand() * (i + 1));
                const t = order[i]; order[i] = order[j]; order[j] = t;
            }
            return order[(Math.max(1, Number(levelIndex)) - 1) % poolLen];
        },

        // ========================================================
        // 取詩：連續 LINES 句、每句剛好 CHARS 字（理由見檔頭）
        // ========================================================
        selectRandomPoem: function () {
            const s = this.difficultySettings[this.difficulty];
            this.LINES = s.lines;
            this.CHARS = s.chars;
            const need = this.LINES, width = this.CHARS;
            const pool = [];
            try {
                if (typeof POEMS !== 'undefined' && Array.isArray(POEMS)) {
                    for (const p of POEMS) {
                        if (!Array.isArray(p.content)) continue;
                        if (typeof p.rating === 'number' && p.rating < s.poemMinRating) continue;
                        const lines = p.content.map(l => (l || '').replace(this.PUNCT_RE, '')).filter(l => l.length > 0);
                        for (let i = 0; i + need <= lines.length; i += 2) {
                            const seg = lines.slice(i, i + need);
                            if (seg.every(l => l.length === width)) {
                                pool.push({ poem: p, lines: seg });
                                break;
                            }
                        }
                    }
                }
            } catch (e) { console.warn('[彈珠成詩] 取詩失敗', e); }

            if (pool.length === 0) {
                // 降級保護：先放寬詩評再試一次，仍找不到才用固定備援詩
                const f5 = ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉'];
                const f7 = ['朝辭白帝彩雲間', '千里江陵一日還', '兩岸猿聲啼不住', '輕舟已過萬重山'];
                const base = width === 5 ? f5 : f7;
                const seg = [];
                while (seg.length < need) seg.push(base[seg.length % base.length]);
                this.currentPoem = { title: width === 5 ? '靜夜思' : '早發白帝城', dynasty: '唐', author: '李白', id: null };
                this.poemLines = seg;
                return true;
            }
            // 關卡挑戰：同一關永遠取到同一首詩（見 _levelPoemIndex 註解）
            const picked = this.isLevelMode
                ? pool[this._levelPoemIndex(pool.length, 'game39', this.difficulty, this.currentLevelIndex)]
                : pool[Math.floor(Math.random() * pool.length)];
            this.currentPoem = picked.poem;
            this.poemLines = picked.lines;
            return true;
        },

        // ========================================================
        // 開一局
        // ========================================================
        startGameProcess: function () {
            const s = this.difficultySettings[this.difficulty];
            this.LINES = s.lines;
            this.CHARS = s.chars;
            this.binOffset = Math.floor((BIN_COUNT - this.CHARS) / 2);
            this.hues = this.CHARS === 5 ? HUES_5 : HUES_7;
            // ⚠️ 每一局都要重跑：進入下一關之後標籤上的關卡編號才會跟著更新
            this.updateUIForMode();

            this._layout();

            this.balls = [];
            this.particles = [];
            this.rings = [];
            this.stacks = new Array(BIN_COUNT);
            for (let i = 0; i < BIN_COUNT; i++) this.stacks[i] = [];
            this.nextLine = new Array(this.CHARS).fill(this.LINES - 1);
            this.placed = new Array(this.CHARS).fill(0);
            this.lineDone = new Array(this.LINES).fill(false);
            this.emitCursor = 0;
            this.seq = 0;
            this.score = 0;
            this.isWin = false;
            this.charging = false;
            this.power = 0;

            this.maxBalls = Math.ceil(this.LINES * this.CHARS * s.ballMul);
            this.ballsLeft = this.maxBalls;

            document.getElementById('game39-retryGame-btn').disabled = false;
            document.getElementById('game39-newGame-btn').disabled = false;
            document.getElementById('game39-score').textContent = '0';
            this._updatePoemInfo();
            this._updateBallsLabel();
            this._loadNext();

            this.isActive = true;
            this.gameStartTime = Date.now();
            this.lastFrameAt = performance.now();
            if (!this.rafId) this._loop();
            // ⚠️ 外框要等版面實際量得到寬高才畫得對，延一幀再更新
            setTimeout(() => this.updateBallsRing(), 30);
        },

        /**
         * 版面：五種難度完全共用同一組幾何（見 BIN_ROWS 註解），因此這裡完全
         * 不參考 this.LINES —— 只有「畫幾層底圖字」會依實際句數變化。
         */
        _layout: function () {
            this.colW = PLAY_W / BIN_COUNT;
            this.binTop = CH - (BIN_ROWS * BALL_R * 2 + 8);

            // ══════════════════════════════════════════════════════════════
            // 干擾棒：以「收納格寬度」為間距的交錯格子（依《彈珠檯軌道》標記）
            // ══════════════════════════════════════════════════════════════
            //  兩種排交替：隔板排（對齊每片隔板正上方，6 根）／格心排（對齊每格
            //  正中央，5 根 ＋ 兩側牆導珠塊）。最後一層剛好落在格口，也就是隔板
            //  本身的圓頭——格心排在上、隔板排在下，等於替每一格做出一個漏斗口。
            //
            //  ⚠️ 最外側兩格的中央「不」放棒子而改用側牆導珠塊：若在那裡放棒子，
            //     牆與棒之間的縫隙（29 − 5 = 24px）比球徑 40px 還窄，球會卡死。
            this.pegs = [];
            const gapY = (this.binTop - PEG_FIELD_TOP) / (PEG_LEVELS - 1);
            for (let lv = 0; lv < PEG_LEVELS; lv++) {
                const y = PEG_FIELD_TOP + lv * gapY;
                if (lv % 2 === 0) {
                    for (let i = 1; i < BIN_COUNT; i++) {
                        this.pegs.push({ x: i * this.colW, y: y, flash: 0, divider: (lv === PEG_LEVELS - 1) });
                    }
                } else {
                    for (let i = 1; i < BIN_COUNT - 1; i++) {
                        this.pegs.push({ x: (i + 0.5) * this.colW, y: y, flash: 0 });
                    }
                    this.pegs.push({ x: 0, y: y, flash: 0, r: WALL_BUMP_R });
                    this.pegs.push({ x: PLAY_W, y: y, flash: 0, r: WALL_BUMP_R });
                }
            }
        },

        // ── 發射口單向擋板的幾何（見 GATE_RISE 註解）──
        //   線段由 A（軌道內側牆的頂端）往右上到 B（右牆），法線朝左上。
        _gateA: function () { return { x: PLAY_W - 2, y: ARCH_CY }; },
        _gateB: function () { return { x: CW, y: ARCH_CY - GATE_RISE }; },

        _updatePoemInfo: function () {
            const el = document.getElementById('game39-poem-info');
            if (!el || !this.currentPoem) return;
            let title = this.currentPoem.title || '';
            if (title.length > 12) title = title.substring(0, 10) + '...';
            el.textContent = `${title} / ${this.currentPoem.dynasty || ''} / ${this.currentPoem.author || ''}`;
            if (this.currentPoem.id) el.dataset.poemId = this.currentPoem.id;
        },

        _updateBallsLabel: function () {
            const a = document.getElementById('game39-balls');
            const b = document.getElementById('game39-max-balls');
            if (a) a.textContent = this.ballsLeft;
            if (b) b.textContent = this.maxBalls;
        },

        // ========================================================
        // 座標與裝填
        // ========================================================
        _binOf: function (c) { return c + this.binOffset; },
        _binCx: function (b) { return (b + 0.5) * this.colW; },
        _slotCy: function (s) { return CH - 4 - BALL_R - s * BALL_R * 2; },
        _isDeadBin: function (b) { return b < this.binOffset || b >= this.binOffset + this.CHARS; },

        /** 依序輪流裝填下一個還沒完成的字位（與舒壓頁的發球順序規則相同） */
        _loadNext: function () {
            // ⚠️ 已經有球在飛的字位要跳過。因為「球一離開軌道就能發下一顆」，玩家
            //    手快的話可以連發好幾顆；若不排除，同一個字位可能同時有兩顆球在場上，
            //    兩顆都想停在同一層，堆疊層數就會算錯。
            const inFlight = new Set();
            for (const b of this.balls) {
                if (b.state !== 'fly' && b.state !== 'settling') continue;
                if (b.passThrough) continue;
                if (b.bin >= 0 && b.bin !== b.targetBin) continue;   // 註定失敗，不佔位
                inFlight.add(b.col);
            }
            for (let k = 0; k < this.CHARS; k++) {
                const c = (this.emitCursor + k) % this.CHARS;
                if (this.nextLine[c] < 0) continue;
                if (inFlight.has(c)) continue;
                const line = this.nextLine[c];
                this.loaded = { col: c, line: line, ch: this.poemLines[line][c], hue: this.hues[c] };
                this.emitCursor = (c + 1) % this.CHARS;
                return;
            }
            this.loaded = null;   // 全部完成
        },

        /**
         * ⚠️ 每次有字位完成時都要重新檢查發射台上的字還算不算數。
         *    例如發射台架著「第 3 字位、第 2 句」的珠子，結果剛好有一顆先落定，
         *    該字位的目標就往上推了一句——架著的字若不更新就會發出一顆永遠不可能
         *    正確的球，白白浪費玩家的彈珠。
         */
        _revalidateLoaded: function () {
            if (!this.loaded) { this._loadNext(); return; }
            const c = this.loaded.col;
            if (this.nextLine[c] < 0 || this.nextLine[c] !== this.loaded.line) this._loadNext();
        },

        // ========================================================
        // 主迴圈
        // ========================================================
        _loop: function () {
            this.rafId = requestAnimationFrame(() => this._loop());
            const now = performance.now();
            const dt = clamp((now - this.lastFrameAt) / 16.667, 0.2, 2.5);
            this.lastFrameAt = now;
            // 按住蓄力：力道隨按壓時間長大；往上拖曳可以更快拉滿，兩者取大值
            if (this.charging) {
                const hold = clamp((now - this.chargeStart) / CHARGE_MS, 0, 1);
                this.power = Math.max(hold, this.dragPower || 0);
                // 場上狀況改變（例如剛好完成一個字位）時，架著的字可能已經失效
                if (!this.loaded) this.charging = false;
            }
            if (this.isActive || this.balls.length) {
                this._step(dt, now);
                this._stepEffects(dt);
            }
            this._draw();
        },

        _step: function (dt, now) {
            const h = dt / SUBSTEPS;
            for (let s = 0; s < SUBSTEPS; s++) {
                for (const b of this.balls) {
                    if (b.state === 'settled' || b.state === 'wrong' || b.state === 'dead') continue;
                    // ⚠️ 發射軌道內不計重力（理由見 V_MIN／V_MAX 的長註解）：力道就等於
                    //    球抵達拱門起拱線時的速度，整條力道滑桿才會全段都有意義。
                    if (b.inRail && b.y <= ARCH_CY) { b.inRail = false; b.exitedRail = true; }
                    if (!b.inRail) b.vy += GRAVITY * h;
                    b.vx *= AIR;
                    const sp = Math.hypot(b.vx, b.vy);
                    if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
                    b.x += b.vx * h;
                    b.y += b.vy * h;
                    this._collideBounds(b);
                    this._collidePegs(b);
                    this._collideDividers(b);
                }
                this._collideBalls();
                this._resolveBins(now);
            }

            for (const b of this.balls) {
                if (b.state === 'fly' || b.state === 'settling') {
                    if (Math.hypot(b.vx, b.vy) < 0.6) {
                        b.stuck = (b.stuck || 0) + 1;
                        if (b.stuck > 18) { b.vx += rnd(-4.5, 4.5); b.vy += 3.0; b.stuck = 0; }
                    } else b.stuck = 0;
                    // 安全閥（正常情況不該觸發）
                    if (now - b.bornAt > BALL_TTL_MS) { b.state = 'dead'; this._spark(b.x, b.y, b.hue, 10); }
                    b.trail.push(b.x, b.y);
                    if (b.trail.length > TRAIL_LEN * 2) b.trail.splice(0, 2);
                } else if (b.trail.length) b.trail.splice(0, 2);
            }
            this.balls = this.balls.filter(b => b.state !== 'dead');

            // ⚠️ 每一幀確保發射台上一定架著一顆「打得出去、而且有意義」的球。
            //    先前只在 _onCorrect（打中時）才重新裝填，於是有個會卡死的漏洞：
            //    當只剩最後一個字位還沒完成時，發射那一顆之後 _loadNext 找不到
            //    「沒有球在飛」的字位，loaded 變成 null；如果這顆球又沒打中，就
            //    再也沒有任何程式碼會把它重新裝回去——玩家明明還有彈珠，卻永遠
            //    不能再發射，遊戲就這樣卡在那裡（實測 小學 有 5 顆彈珠沒用到就
            //    無法繼續）。改成每幀檢查，任何情況下都會自動補上。
            if (this.isActive && !this._isComplete()) {
                if (!this.loaded || this.nextLine[this.loaded.col] !== this.loaded.line) {
                    this._loadNext();
                }
            }

            // 彈珠用完且場上沒有還有機會的球 → 失敗
            // ⚠️ 必須先排除「已經拼完整首詩」的情況：用最後一顆彈珠完成最後一個字時，
            //    這裡的失敗判定會比 _checkLineDone 排定的勝利結算（延後 700ms 讓落定
            //    特效播完）更早觸發，玩家明明贏了卻會看到失敗畫面。
            if (this.isActive && this.ballsLeft <= 0 && !this._hasLiveBall() && !this._isComplete()) {
                this.gameOver(false, '彈珠用盡');
            }
        },

        /** 邊界：側牆、發射軌道、上方拱形導軌 */
        _collideBounds: function (b) {
            const r = b.r;

            // ── 還在發射軌道內（尚未衝出起拱線）──
            if (b.inRail) {
                const left = PLAY_W + r, right = CW - r;
                if (left <= right) b.x = clamp(b.x, left, right);
                else b.x = (PLAY_W + CW) / 2;
                if (b.y > CH - r) { b.y = CH - r; b.vy = -Math.abs(b.vy) * 0.2; }
                return;
            }

            // ── 已經射出去了：發射口的單向擋板 ──
            // 一片朝上、向右上傾斜的隱形擋板。球往上衝時在它下方（不會碰到），
            // 落下時被擋住並往左推回台面，因此絕不可能掉回發射軌道。
            if (b.exitedRail && b.x > PLAY_W - r - RAIL_W) {
                const A = this._gateA(), B = this._gateB();
                const dx = B.x - A.x, dy = B.y - A.y;
                const len = Math.hypot(dx, dy) || 1;
                // 法線朝左上（(dy, -dx)/len 在 dy<0、dx>0 時指向左上）
                const nx = dy / len, ny = -dx / len;
                // 只在球的水平位置落在擋板的跨度內才算
                const tAlong = ((b.x - A.x) * dx + (b.y - A.y) * dy) / (len * len);
                if (tAlong >= 0 && tAlong <= 1) {
                    const s = (b.x - A.x) * nx + (b.y - A.y) * ny;   // 帶號距離（正＝在擋板上方）
                    if (s < r) {
                        const vn = b.vx * nx + b.vy * ny;
                        if (vn < 0) {                                // 正在往擋板壓下來
                            b.x += (r - s) * nx;
                            b.y += (r - s) * ny;
                            b.vx -= (1 + REST_WALL) * vn * nx;
                            b.vy -= (1 + REST_WALL) * vn * ny;
                            this._spark(b.x, b.y, b.hue, 4);
                            this._pegSound();
                        }
                    }
                }
            }

            // ── 主台面（起拱線以下）──
            if (b.y > ARCH_CY) {
                if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * REST_WALL; }
                // 發射軌道的內側牆（主台面的右牆）
                if (b.x > PLAY_W - r) { b.x = PLAY_W - r; b.vx = -Math.abs(b.vx) * REST_WALL; }
                return;
            }

            // ── 上方拱形導軌（左右對稱的圓弧）──
            // 球心被限制在半徑 (ARCH_R - r) 的圓內，等價於球的外緣貼著導軌內側。
            if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * REST_WALL; }
            const R = ARCH_R - r;
            const ux = b.x - ARCH_CX, uy = b.y - ARCH_CY;
            const d = Math.hypot(ux, uy);
            if (d <= R || d === 0) return;

            const nx = ux / d, ny = uy / d;      // 圓的外法線
            b.x = ARCH_CX + nx * R;
            b.y = ARCH_CY + ny * R;
            const vn = b.vx * nx + b.vy * ny;
            if (vn > 0) {                        // 正在往外衝 → 壓回導軌內側
                b.vx -= (1 + REST_ARCH) * vn * nx;
                b.vy -= (1 + REST_ARCH) * vn * ny;
                if (vn > 2.5) { this._spark(b.x, b.y, b.hue, 3); this._pegSound(); }
            }
        },

        /**
         * ⭐ 收納格之間的隔板：從格口一路延伸到台底的實心擋板，珠子絕對跨不過去。
         *
         * 先前隔板只是「畫出來的木條」，實際擋住珠子的是 _resolveBins 裡「跨過格口
         * 時鎖定格號、之後把 x 夾在該格範圍內」的邏輯——功能上雖然也跨不過去，但那是
         * 瞬間的位置修正，珠子在格口附近會有一瞬間壓在隔板上、甚至看起來像從隔板中間
         * 穿過去。改成真正的碰撞之後，珠子會實實在在地撞在隔板上彈開。
         *
         * 幾何上把隔板當成「垂直的膠囊」（線段 + 半徑），線段由格口延伸到台底。
         * ⚠️ 淨寬檢查：格寬 58.3 − 2×隔板半厚 6 = 52.3px，大於球徑 40px，
         *    球進得去也不會卡在隔板與隔板之間。
         */
        _collideDividers: function (b) {
            if (b.inRail || b.x > PLAY_W) return;     // 發射軌道裡沒有隔板
            if (b.y + b.r < this.binTop) return;      // 還沒到格口高度
            const hw = DIVIDER_HW;
            for (let i = 1; i < BIN_COUNT; i++) {
                const x = i * this.colW;
                const dx = b.x - x;
                const rr = b.r + hw;
                if (Math.abs(dx) > rr) continue;
                // 線段上離球心最近的點（超出兩端就取端點，形成圓角）
                const cy = clamp(b.y, this.binTop, CH);
                const dy = b.y - cy;
                const d = Math.hypot(dx, dy);
                if (d >= rr) continue;
                let nx, ny;
                if (d === 0) { nx = (dx >= 0 ? 1 : -1); ny = 0; }
                else { nx = dx / d; ny = dy / d; }
                b.x += nx * (rr - d);
                b.y += ny * (rr - d);
                const vn = b.vx * nx + b.vy * ny;
                if (vn < 0) {
                    b.vx -= (1 + REST_WALL) * vn * nx;
                    b.vy -= (1 + REST_WALL) * vn * ny;
                }
            }
        },

        _collidePegs: function (b) {
            if (b.passThrough) return;
            if (b.y < PEG_FIELD_TOP - b.r * 2 || b.inRail) return;   // 拱門區與軌道內沒有干擾棒
            for (const p of this.pegs) {
                // 隔板圓頭（最後一層）只在球還沒進格時有效：球一旦鎖定了格子就由
                // _resolveBins 接手把它吸到格中央，此時再撞隔板只會打架。
                if (p.divider && b.bin >= 0) continue;
                const dx = b.x - p.x, dy = b.y - p.y;
                const rr = b.r + (p.r || PEG_R);
                if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
                const d = Math.hypot(dx, dy);
                if (d >= rr || d === 0) continue;

                const nx = dx / d, ny = dy / d;
                b.x += nx * (rr - d);
                b.y += ny * (rr - d);
                const vn = b.vx * nx + b.vy * ny;
                if (vn >= 0) continue;

                if (vn < -CONTACT_V) {
                    const rest = this.restPeg;
                    b.vx -= (1 + rest) * vn * nx;
                    b.vy -= (1 + rest) * vn * ny;
                    b.vx += rnd(-0.5, 0.5);
                    p.flash = 1;
                    this._spark(p.x, p.y, b.hue, 5);
                    this._pegSound();
                } else {
                    // 靜置接觸：只消掉法線速度並助推滑落（詳見檔頭第 3 點）
                    b.vx -= vn * nx;
                    b.vy -= vn * ny;
                    b.vx += (Math.abs(nx) < 0.25 ? (nx >= 0 ? 1 : -1) : Math.sign(nx)) * ROLL_ASSIST;
                }
            }
        },

        _collideBalls: function () {
            const arr = this.balls;
            for (let i = 0; i < arr.length; i++) {
                const a = arr[i];
                if (a.state === 'dead' || a.passThrough) continue;
                for (let j = i + 1; j < arr.length; j++) {
                    const b = arr[j];
                    if (b.state === 'dead' || b.passThrough) continue;
                    const aS = (a.state === 'settled' || a.state === 'wrong');
                    const bS = (b.state === 'settled' || b.state === 'wrong');
                    if (aS && bS) continue;
                    const dx = b.x - a.x, dy = b.y - a.y;
                    const rr = a.r * a.scale + b.r * b.scale;
                    if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
                    const d = Math.hypot(dx, dy);
                    if (d >= rr || d === 0) continue;
                    const nx = dx / d, ny = dy / d, ov = rr - d;
                    if (aS) { b.x += nx * ov; b.y += ny * ov; }
                    else if (bS) { a.x -= nx * ov; a.y -= ny * ov; }
                    else { a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2; }

                    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                    if (vn >= 0) continue;
                    const imp = -(1 + REST_BALL) * vn / ((aS ? 0 : 1) + (bS ? 0 : 1) || 1);
                    if (!aS) { a.vx -= imp * nx; a.vy -= imp * ny; }
                    if (!bS) { b.vx += imp * nx; b.vy += imp * ny; }
                    this._spark((a.x + b.x) / 2, (a.y + b.y) / 2, 45, 3, true);
                }
            }
        },

        _resolveBins: function (now) {
            for (const b of this.balls) {
                if (b.state === 'settled' || b.state === 'wrong' || b.state === 'dead') continue;
                if (b.y + b.r < this.binTop) continue;
                if (b.x > PLAY_W) continue;                 // 還在發射軌道裡

                if (b.bin < 0) {
                    b.bin = clamp(Math.floor(b.x / this.colW), 0, BIN_COUNT - 1);
                    b.state = 'settling';
                    if (this._isDeadBin(b.bin)) {
                        b.passThrough = true;
                    } else if (b.bin === b.targetBin) {
                        // 清掉這一格所有掉錯的珠子，把落點讓出來
                        for (const o of this.balls) {
                            if (o !== b && o.bin === b.bin && !o.passThrough &&
                                (o.state === 'wrong' || (o.state === 'settling' && o.bin !== o.targetBin))) {
                                o.state = 'dead';
                                this._spark(o.x, o.y, 0, 12);
                            }
                        }
                        b.stackIndex = this.stacks[b.bin].length;
                        b.restY = this._slotCy(b.stackIndex);
                    } else if (this._incomingCorrect(b.bin)) {
                        b.state = 'dead';
                        this._spark(b.x, b.y, 0, 10);
                        continue;
                    } else {
                        b.stackIndex = this.stacks[b.bin].length;
                        b.restY = this._slotCy(b.stackIndex);
                        b.restCheck = 0;
                        b.lastY = b.y;
                    }
                }

                if (b.passThrough) {
                    if (b.y - b.r > CH) b.state = 'dead';
                    continue;
                }

                const cx = this._binCx(b.bin);
                b.x += (cx - b.x) * 0.22;
                b.vx *= 0.6;
                const left = b.bin * this.colW + 3 + b.r;
                const right = (b.bin + 1) * this.colW - 3 - b.r;
                if (left <= right) b.x = clamp(b.x, left, right);

                if (b.bin === b.targetBin) {
                    if (b.y >= b.restY) {
                        b.y = b.restY; b.vx = 0; b.vy = 0;
                        this._onCorrect(b, now);
                    }
                } else {
                    if (b.y >= b.restY) {
                        b.y = b.restY; b.vx = 0; b.vy = 0;
                        this._onWrong(b, now);
                    } else {
                        if (Math.abs(b.y - b.lastY) < 0.12 && Math.abs(b.vy) < 0.6) b.restCheck++;
                        else b.restCheck = 0;
                        b.lastY = b.y;
                        if (b.restCheck > 10 * SUBSTEPS) { b.vx = 0; b.vy = 0; this._onWrong(b, now); }
                    }
                }
            }

            for (const b of this.balls) {
                if (b.state !== 'wrong') continue;
                const age = now - b.wrongAt;
                if (age <= WRONG_HOLD_MS) { b.scale = 1; continue; }
                const t = (age - WRONG_HOLD_MS) / WRONG_FADE_MS;
                if (t >= 1) { b.state = 'dead'; this._spark(b.x, b.y, 0, 8); }
                else b.scale = 1 - t;
            }
        },

        _incomingCorrect: function (bin) {
            for (const b of this.balls) {
                if (b.passThrough || b.state !== 'settling') continue;
                if (b.bin === bin && b.bin === b.targetBin) return true;
            }
            return false;
        },

        _onCorrect: function (b, now) {
            b.state = 'settled';
            b.scale = 1;
            b.trail.length = 0;
            this.stacks[b.bin].push(b);
            this.placed[b.col]++;
            this.nextLine[b.col]--;

            if (window.ScoreManager) this.score += window.ScoreManager.getPointA('game39', this.difficulty);
            document.getElementById('game39-score').textContent = this.score;

            this._ring(b.x, b.y, b.hue, BALL_R * 2.6);
            this._spark(b.x, b.y, 45, 14);
            if (window.SoundManager) window.SoundManager.playSuccessShort();

            this._revalidateLoaded();
            this._checkLineDone(now);
        },

        _onWrong: function (b, now) {
            b.state = 'wrong';
            b.wrongAt = now;
            this._ring(b.x, b.y, 0, BALL_R * 1.8);
            this._spark(b.x, b.y, 0, 8);
            if (window.SoundManager) window.SoundManager.playHit(3, 0.05);
        },

        /** 整首詩是否已經全部歸位 */
        _isComplete: function () {
            for (let c = 0; c < this.CHARS; c++) if (this.placed[c] < this.LINES) return false;
            return true;
        },

        _checkLineDone: function (now) {
            for (let k = this.LINES - 1; k >= 0; k--) {
                if (this.lineDone[k]) continue;
                let ok = true;
                for (let c = 0; c < this.CHARS; c++) if (this.placed[c] < this.LINES - k) { ok = false; break; }
                if (!ok) continue;
                this.lineDone[k] = true;
                if (window.ScoreManager) this.score += window.ScoreManager.getPointB('game39', this.difficulty);
                document.getElementById('game39-score').textContent = this.score;
                this._celebrateLine(k);
            }

            if (this._isComplete() && this.isActive) {
                // 稍等一下讓最後的落定特效播完再結算
                setTimeout(() => { if (this.isActive) this.gameOver(true); }, 700);
            }
        },

        _celebrateLine: function (k) {
            const s = this.LINES - 1 - k;
            const cy = this._slotCy(s);
            for (let c = 0; c < this.CHARS; c++) {
                const cx = this._binCx(this._binOf(c));
                setTimeout(() => {
                    if (!this.container || this.container.classList.contains('hidden')) return;
                    this._ring(cx, cy, this.hues[c], BALL_R * 3.2);
                    this._spark(cx, cy, this.hues[c], 10);
                }, c * 90);
            }
            if (window.SoundManager) window.SoundManager.playJoyfulTriple();
        },

        // ========================================================
        // 特效
        // ========================================================
        _spark: function (x, y, hue, count, white) {
            for (let i = 0; i < count; i++) {
                const a = rnd(0, Math.PI * 2), sp = rnd(0.6, 3.6);
                this.particles.push({
                    x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.6,
                    life: 1, decay: rnd(0.02, 0.055), size: rnd(1.6, 3.8), hue: hue, white: !!white,
                });
            }
            if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
        },

        _ring: function (x, y, hue, maxR) {
            this.rings.push({ x: x, y: y, r: BALL_R * 0.6, maxR: maxR, life: 1, hue: hue });
            if (this.rings.length > 40) this.rings.splice(0, this.rings.length - 40);
        },

        _stepEffects: function (dt) {
            for (const p of this.particles) {
                p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.10 * dt; p.vx *= 0.985;
                p.life -= p.decay * dt;
            }
            this.particles = this.particles.filter(p => p.life > 0);
            for (const r of this.rings) { r.r += (r.maxR - r.r) * 0.16 * dt; r.life -= 0.045 * dt; }
            this.rings = this.rings.filter(r => r.life > 0);
            for (const p of this.pegs) if (p.flash > 0) p.flash = Math.max(0, p.flash - 0.09 * dt);
        },

        _pegSound: function () {
            const now = performance.now();
            if (now - this.lastPegSoundAt < 55) return;
            this.lastPegSoundAt = now;
            if (window.SoundManager) window.SoundManager.playHit(Math.floor(rnd(0, 5)), 0.03);
        },

        // ========================================================
        // 繪製
        // ========================================================
        _draw: function () {
            const ctx = this.ctx;
            if (!ctx) return;
            ctx.clearRect(0, 0, CW, CH);
            this._drawBoard(ctx);
            this._drawArch(ctx);
            this._drawRail(ctx);
            this._drawBins(ctx);
            this._drawPegs(ctx);
            this._drawTrails(ctx);
            this._drawRings(ctx);
            for (const b of this.balls) this._drawBall(ctx, b);
            this._drawLauncher(ctx);
            this._drawParticles(ctx);
        },

        _drawBoard: function (ctx) {
            const g = ctx.createLinearGradient(0, 0, 0, CH);
            g.addColorStop(0, 'hsl(38, 44%, 82%)');
            g.addColorStop(0.55, 'hsl(35, 40%, 74%)');
            g.addColorStop(1, 'hsl(32, 36%, 66%)');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, CW, CH);

            ctx.save();
            ctx.globalAlpha = 0.10;
            ctx.strokeStyle = 'hsl(28, 45%, 42%)';
            ctx.lineWidth = 1.4;
            for (let i = 0; i < 9; i++) {
                const x = (i + 0.5) * (CW / 9);
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.bezierCurveTo(x + 16, CH * 0.3, x - 16, CH * 0.7, x + 5, CH);
                ctx.stroke();
            }
            ctx.restore();
        },

        /** 上方拱形導軌：畫出橢圓的下半部（球滑行時貼著的那條木邊） */
        _drawArch: function (ctx) {
            ctx.save();
            // 左右對稱的圓弧拱形：把圓弧「以外」的畫布上緣填成實心木料
            ctx.beginPath();
            ctx.moveTo(0, ARCH_CY);
            ctx.lineTo(0, 0);
            ctx.lineTo(CW, 0);
            ctx.lineTo(CW, ARCH_CY);
            ctx.arc(ARCH_CX, ARCH_CY, ARCH_R, 0, Math.PI, true);   // 由右端逆掃過拱頂到左端
            ctx.closePath();
            const wood = ctx.createLinearGradient(0, 0, 0, ARCH_CY);
            wood.addColorStop(0, 'hsl(26, 42%, 34%)');
            wood.addColorStop(1, 'hsl(28, 40%, 48%)');
            ctx.fillStyle = wood;
            ctx.fill();

            // 導軌內緣的亮邊（球就是貼著這條弧線滑行）
            ctx.beginPath();
            ctx.arc(ARCH_CX, ARCH_CY, ARCH_R, Math.PI, 0, false);
            const gr = ctx.createLinearGradient(0, ARCH_CY - ARCH_R, 0, ARCH_CY);
            gr.addColorStop(0, 'hsl(38, 52%, 88%)');
            gr.addColorStop(1, 'hsl(30, 45%, 62%)');
            ctx.strokeStyle = gr;
            ctx.lineWidth = 5;
            ctx.stroke();
            ctx.restore();
        },

        /** 右側發射軌道 */
        _drawRail: function (ctx) {
            ctx.save();
            const g = ctx.createLinearGradient(PLAY_W, 0, CW, 0);
            g.addColorStop(0, 'hsl(30, 34%, 62%)');
            g.addColorStop(0.5, 'hsl(34, 40%, 72%)');
            g.addColorStop(1, 'hsl(28, 34%, 56%)');
            ctx.fillStyle = g;
            ctx.fillRect(PLAY_W, ARCH_CY, RAIL_W, CH - ARCH_CY);
            // 內側牆（主台面的右牆）：畫明顯一點，讓玩家一眼看出這是一條獨立的軌道
            ctx.fillStyle = 'hsl(36, 50%, 86%)';
            ctx.fillRect(PLAY_W - 4, ARCH_CY, 6, CH - ARCH_CY);
            ctx.fillStyle = 'hsla(26, 45%, 28%, 0.55)';
            ctx.fillRect(PLAY_W + 2, ARCH_CY, 3, CH - ARCH_CY);
            // 軌道底部的彈簧座
            ctx.fillStyle = 'hsl(24, 40%, 38%)';
            ctx.fillRect(PLAY_W + 6, CH - 6, RAIL_W - 6, 6);
            ctx.restore();
        },

        _drawBins: function (ctx) {
            const r = BALL_R;
            ctx.save();
            for (let b = 0; b < BIN_COUNT; b++) {
                ctx.fillStyle = this._isDeadBin(b)
                    ? 'hsla(28, 30%, 40%, 0.16)'
                    : 'hsla(30, 35%, 52%, 0.26)';
                ctx.fillRect(b * this.colW + 3, this.binTop, this.colW - 6, CH - this.binTop);
            }
            ctx.restore();

            // 底圖字：由上而下＝第一句到最後一句
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${Math.floor(r * 1.5)}px "Noto Serif TC", serif`;
            for (let c = 0; c < this.CHARS; c++) {
                const cx = this._binCx(this._binOf(c));
                for (let k = 0; k < this.LINES; k++) {
                    const s = this.LINES - 1 - k;
                    if (this.placed[c] > s) continue;
                    ctx.fillStyle = `hsla(${this.hues[c]}, 72%, 34%, 0.66)`;
                    ctx.fillText(this.poemLines[k][c], cx, this._slotCy(s) + r * 0.04);
                }
            }
            ctx.restore();

            ctx.save();
            for (let i = 1; i < BIN_COUNT; i++) {
                const x = i * this.colW;
                // ⚠️ 寬度必須與 DIVIDER_HW 的碰撞厚度一致，玩家看到的擋板才等於
                //    實際擋住珠子的擋板（畫得比碰撞窄會看起來像穿模）。
                const gr = ctx.createLinearGradient(x - DIVIDER_HW, 0, x + DIVIDER_HW, 0);
                gr.addColorStop(0, 'hsl(28, 42%, 46%)');
                gr.addColorStop(0.45, 'hsl(36, 50%, 88%)');
                gr.addColorStop(1, 'hsl(26, 42%, 38%)');
                ctx.fillStyle = gr;
                ctx.fillRect(x - DIVIDER_HW, this.binTop, DIVIDER_HW * 2, CH - this.binTop);
                // 圓頭不在這裡畫：它已經是干擾棒格子的最後一層，交給 _drawPegs 畫
            }
            for (let c = 0; c < this.CHARS; c++) {
                const bin = this._binOf(c);
                ctx.fillStyle = 'hsl(28, 42%, 44%)';
                ctx.fillRect(bin * this.colW + 3, CH - 4, this.colW - 6, 4);
            }
            ctx.restore();
        },

        _drawPegs: function (ctx) {
            for (const p of this.pegs) {
                const r = (p.r || PEG_R) + p.flash * 2.5;
                const g = ctx.createRadialGradient(p.x - r * 0.4, p.y - r * 0.45, r * 0.1, p.x, p.y, r);
                g.addColorStop(0, 'hsl(40, 30%, 96%)');
                g.addColorStop(0.6, 'hsl(34, 22%, 72%)');
                g.addColorStop(1, 'hsl(28, 25%, 42%)');
                ctx.beginPath();
                ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
                ctx.fillStyle = g;
                ctx.fill();
                if (p.flash > 0) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, r + 5 * p.flash, 0, Math.PI * 2);
                    ctx.strokeStyle = `hsla(45, 100%, 70%, ${0.75 * p.flash})`;
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        },

        _drawTrails: function (ctx) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            for (const b of this.balls) {
                const t = b.trail;
                if (t.length < 4) continue;
                const n = t.length / 2;
                for (let i = 1; i < n; i++) {
                    const a = i / n;
                    ctx.beginPath();
                    ctx.moveTo(t[(i - 1) * 2], t[(i - 1) * 2 + 1]);
                    ctx.lineTo(t[i * 2], t[i * 2 + 1]);
                    ctx.strokeStyle = `hsla(${b.hue}, 85%, 62%, ${0.42 * a})`;
                    ctx.lineWidth = b.r * 0.9 * a;
                    ctx.stroke();
                }
            }
            ctx.restore();
        },

        _drawRings: function (ctx) {
            ctx.save();
            for (const r of this.rings) {
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
                ctx.strokeStyle = `hsla(${r.hue}, 95%, 65%, ${0.75 * r.life})`;
                ctx.lineWidth = 3 * r.life + 1;
                ctx.stroke();
            }
            ctx.restore();
        },

        _drawBall: function (ctx, b) {
            const r = b.r * b.scale;
            if (r <= 0.5) return;
            const hue = b.hue, sat = 62, baseL = 74;
            ctx.save();
            ctx.globalAlpha = (b.state === 'wrong' && b.scale < 1) ? Math.max(0, b.scale) : 1;

            ctx.beginPath();
            ctx.ellipse(b.x, b.y + r * 0.92, r * 0.8, r * 0.22, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
            ctx.fill();

            const g = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.35, r * 0.1, b.x, b.y, r);
            g.addColorStop(0, `hsl(${hue}, ${sat}%, ${Math.min(98, baseL + 18)}%)`);
            g.addColorStop(0.55, `hsl(${hue}, ${sat}%, ${baseL}%)`);
            g.addColorStop(1, `hsl(${hue}, ${sat}%, ${Math.max(20, baseL - 26)}%)`);
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();

            ctx.strokeStyle = (b.state === 'settled')
                ? 'hsla(45, 100%, 55%, 0.95)'
                : `hsla(${hue}, 55%, 24%, 0.85)`;
            ctx.lineWidth = (b.state === 'settled') ? 2.4 : 1.5;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(b.x - r * 0.35, b.y - r * 0.4, r * 0.32, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(0, 0%, 100%, 0.55)';
            ctx.fill();

            ctx.fillStyle = 'hsl(220, 30%, 14%)';
            ctx.font = `900 ${Math.floor(r * 1.33)}px "Noto Serif TC", serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(b.ch || '', b.x, b.y + r * 0.04);
            ctx.restore();
        },

        /** 發射台上待發的珠子 ＋ 蓄力的半透明粗箭頭 */
        _drawLauncher: function (ctx) {
            if (!this.loaded || this.ballsLeft <= 0) return;
            const x = CW - RAIL_W / 2;
            const y = CH - BALL_R - 8;

            if (!this._railBusy()) {
                this._drawBall(ctx, {
                    x: x, y: y, r: BALL_R, scale: 1, hue: this.loaded.hue,
                    ch: this.loaded.ch, state: 'ready', trail: [],
                });
            }

            if (this.charging && this.power > 0) {
                // 粗箭頭：越長代表力道越強（長度以軌道可用高度為滿格）
                const maxLen = y - ARCH_CY - 20;
                const len = Math.max(18, maxLen * this.power);
                const tipY = y - BALL_R - 6 - len;
                const w = RAIL_W * 0.44;
                const hue = 40 - this.power * 40;         // 弱＝金黃，強＝橙紅
                ctx.save();
                ctx.globalAlpha = 0.55;
                ctx.fillStyle = `hsl(${hue}, 95%, 58%)`;
                ctx.fillRect(x - w / 2, tipY + 16, w, len - 16);
                ctx.beginPath();
                ctx.moveTo(x, tipY);
                ctx.lineTo(x - w * 0.92, tipY + 20);
                ctx.lineTo(x + w * 0.92, tipY + 20);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                // 力道百分比：讓玩家能記住「上次幾成力打到哪一格」，把運氣變成手感
                ctx.save();
                ctx.fillStyle = 'hsl(40, 90%, 96%)';
                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.lineWidth = 3;
                ctx.font = '900 18px "Noto Serif TC", serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const label = Math.round(this.power * 100) + '%';
                ctx.strokeText(label, PLAY_W - 8, tipY + 10);
                ctx.fillText(label, PLAY_W - 8, tipY + 10);
                ctx.restore();
            }
        },

        _drawParticles: function (ctx) {
            ctx.save();
            for (const p of this.particles) {
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.white ? 'hsla(0, 0%, 100%, 0.95)' : `hsl(${p.hue}, 95%, 68%)`;
                ctx.fill();
            }
            ctx.restore();
        },

        // ========================================================
        // 剩餘彈珠的紅白外框（完全比照 game24／game38 的步數框）
        // ========================================================
        updateBallsRing: function () {
            const rectRed = document.getElementById('game39-moves-path-red');
            const rectWhite = document.getElementById('game39-moves-path-white');
            const wrapper = document.getElementById('game39-board-wrapper');
            const svg = document.getElementById('game39-timer-ring');
            if (!rectRed || !rectWhite || !wrapper || !svg) return;
            if (!this.maxBalls || this.maxBalls <= 0) return;

            let w = wrapper.offsetWidth, h = wrapper.offsetHeight;
            if (w === 0 || h === 0) { const rb = wrapper.getBoundingClientRect(); w = rb.width; h = rb.height; }
            if (w === 0) return;
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);
            svg.style.display = 'block';
            // ⚠️ .fmd-moves-path-red/white 在共用主題裡預設 display:none，必須主動打開
            rectRed.style.display = 'block';
            rectWhite.style.display = 'block';
            rectRed.setAttribute('width', w - 6);
            rectRed.setAttribute('height', h - 6);
            rectWhite.setAttribute('width', w - 6);
            rectWhite.setAttribute('height', h - 6);

            const total = (w - 6 + h - 6) * 2;
            const seg = total / this.maxBalls;
            const dRed = [], dWhite = [];
            for (let i = 1; i <= this.maxBalls; i++) {
                const visible = i <= this.ballsLeft;
                const isRed = (i % 2 === 0);
                if (visible) {
                    if (isRed) { dWhite.push(0, seg); dRed.push(seg, 0); }
                    else { dWhite.push(seg, 0); dRed.push(0, seg); }
                } else { dWhite.push(0, seg); dRed.push(0, seg); }
            }
            rectRed.style.strokeDasharray = dRed.join(' ');
            rectWhite.style.strokeDasharray = dWhite.join(' ');
        },

        // ScoreManager.playWinAnimation 於勝利動畫中呼叫：依剩餘資源比例反推彈珠數
        updateTimerRing: function (ratio) {
            if (typeof ratio === 'number') this.ballsLeft = Math.round(ratio * this.maxBalls);
            this._updateBallsLabel();
            this.updateBallsRing();
        },

        // ========================================================
        // 結算
        // ========================================================
        gameOver: function (win, reason) {
            if (!this.isActive) return;
            this.isActive = false;
            this.isWin = win;
            this.charging = false;

            if (!win && window.SupabaseClient) {
                const dur = this.gameStartTime ? Math.floor((Date.now() - this.gameStartTime) / 1000) : 0;
                window.SupabaseClient.logGame({ gameNo: 39, difficulty: this.difficulty || '', score: 0, isWin: false, durationS: dur });
            }

            document.getElementById('game39-retryGame-btn').disabled = !!win;
            document.getElementById('game39-newGame-btn').disabled = !!win;
            if (window.SoundManager) {
                if (win) window.SoundManager.playJoyfulTripleSlow();
                else window.SoundManager.playFailure();
            }

            const onConfirm = () => {
                if (!win) { this.retryGame(); return; }
                if (this.isLevelMode) this.startNextLevel();
                else this.startNewGame();
            };
            const showMessage = (finalScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? (finalScore || this.score) : 0,
                        reason: win ? '' : (typeof reason === 'string' ? reason : '彈珠用盡'),
                        btnText: win ? (this.isLevelMode ? '下一關' : '下一局') : '再試一次',
                        onConfirm: onConfirm
                    });
                }
            };

            // 關卡挑戰過關：登錄通關紀錄，若因此解鎖成就則先跳成就彈窗再顯示結算
            const recordLevelAndShow = (finalScore) => {
                if (win && this.isLevelMode && window.ScoreManager) {
                    const achId = window.ScoreManager.completeLevel('game39', this.difficulty, this.currentLevelIndex);
                    if (achId && window.AchievementDialog && window.AchievementDialog.showInstantAchievementPop) {
                        window.AchievementDialog.showInstantAchievementPop(achId, 'game39', this.currentLevelIndex, () => showMessage(finalScore));
                        return;
                    }
                }
                showMessage(finalScore);
            };

            if (win && window.ScoreManager) {
                // 把「剩餘彈珠」當成「剩餘秒數」餵進去，沿用原生的飛星加分動畫
                this.timer = this.ballsLeft;
                this.maxTimer = this.maxBalls;
                this.startTime = 0;
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game39',
                    timerContainerId: 'game39-board-wrapper',
                    scoreElementId: 'game39-score',
                    heartsSelector: '.game39-no-hearts',   // 本作無紅心機制 —— 永不命中的 selector
                    onComplete: (finalScore) => { this.score = finalScore; recordLevelAndShow(finalScore); }
                });
            } else {
                showMessage();
            }
        },
    };

    window.Game39 = Game39;

    // ?game=39 自動啟動（精確比對，避免 game=3 誤觸）
    if (new URLSearchParams(window.location.search).get('game') === '39') {
        setTimeout(() => {
            if (window.Game39) window.Game39.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 50);
    }
})();
