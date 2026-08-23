/* ==========================================================================
   花月 · 青雲梯 learningPath.js
   --------------------------------------------------------------------------
   「腳著謝公屐，身登青雲梯」——李白《夢遊天姥吟留別》

   對應企畫書：note/學習道路_重新規劃企劃書.md
     第一章 命名
     第三章 遊戲分類：依提取方式，不依難度
     第四章 學習單位與「學會」的定義
     第五章 文位節奏與四階小稱號
     第八章 必通關卡：定義與規則
     第十章 遊戲切換規則

   ── 與舊版最大的差異 ────────────────────────────────────────────────
   舊版用「積分」決定玩家走到哪一站，代表反覆刷低難度遊戲就能升到大儒。
   新版改用「必通關卡」：
     · 一首詩的必通關卡 = 該詩的題目單元 × 3 種**不同提取方式**
     · 一關要用三種不同記憶通道各通過一次才算完成
     · 積分完全不參與進度判定（只留在排行榜與統計）
   這樣「文位」才真的代表「我學會了幾首詩」。
   ========================================================================== */

(function () {
    'use strict';

    // ── 文位 × 可用遊戲對照表（作者定案）───────────────────────────────
    // 採「累加解鎖」：後面的文位自動繼承前面所有已解鎖的遊戲。
    const GAME_UNLOCK = [
        { ranks: ['書僮'], add: [1, 4, 8, 14, 22] },
        { ranks: ['蒙童'], add: [40] },
        { ranks: ['塾生'], add: [11, 20] },
        { ranks: ['童生'], add: [3, 13] },
        { ranks: ['縣案首'], add: [9, 31] },
        { ranks: ['府案首', '文童'], add: [12, 21, 37] },
        { ranks: ['秀才', '舉人', '貢士', '進士', '探花', '榜眼', '狀元', '大儒'], add: [23, 36, 33] }
    ];

    // ── 提取方式分類（企畫書 3.2）──────────────────────────────────────
    // ⚠️ 這是「記憶通道」，不是難度階梯。
    //    「步步驚心」不是精熟階段的遊戲，它是「整首詩逐字提取」這種提取方式，
    //    在小學難度一樣能玩。舊版誤把兩者混為一談。
    //
    //    同一首詩用不同通道各碰一次，效果遠勝同一通道碰很多次
    //    （交錯練習 / desirable difficulty）。因此換遊戲不只是防無聊，
    //    它本身就是教學法 —— 這也是「一關要三種通道」的由來。
    const GAME_CHANNELS = {
        // 語感記憶：整句節奏與詞序
        1: '語感', 4: '語感', 20: '語感', 31: '語感',
        // 字序記憶：逐字精確順序
        14: '字序', 37: '字序', 3: '字序',
        // 空間記憶：字的位置與路徑
        8: '空間', 22: '空間', 9: '空間', 11: '空間', 12: '空間',
        // 背景知識記憶：作者、朝代、詩名
        13: '背景',
        // 推理提取：跨回合演繹
        40: '推理'
    };

    // ── 移出必通關卡的四款（企畫書 8.4，作者決議）──────────────────────
    // 這四款未接 getSharedRandomPoem，各自實作選詩邏輯，
    // 無法保證「同一關 = 同一首詩」，因此不列入考試資格的計算。
    // 它們**完整保留**，仍會出現在複習與漢堡選單的自由練習中。
    const REVIEW_ONLY_GAMES = { 21: true, 23: true, 33: true, 36: true };

    // 長題目遊戲（整首詩）：認知負荷重，不連續出現兩次（企畫書 10.2）
    const LONG_GAMES = { 3: true, 9: true, 14: true, 22: true, 37: true, 21: true, 23: true };

    // 18 款遊戲的顯示名稱
    const GAME_NAMES = {
        1: '慢思快選', 3: '字爬梯', 4: '眾裡尋他', 8: '一筆裁詩',
        9: '詩韻鎖扣', 11: '翻墨識蹤', 12: '疏影橫斜', 13: '人事時地',
        14: '步步驚心', 20: '丟三落一', 21: '橫批成詩', 22: '詩詞拼圖',
        23: '縱橫集句', 31: '詩眼覓蹤', 33: '作者是誰', 36: '轉輪覓詩',
        37: '步步為陣', 40: '點兵成詩'
    };

    // ── 遊戲切換規則的參數（企畫書 10.2）───────────────────────────────
    const MAX_SAME_GAME_STREAK = 3;   // 同一款遊戲最多連續幾局
    const RECENT_WINDOW = 5;          // 排除最近幾局出現過的（關卡 × 遊戲）組合

    // ── 捐納跳關（企畫書 8.3）──────────────────────────────────────────
    // 積分原本是軟性門檻，卡住也能刷過去；改為硬性關卡後就是硬牆了。
    // 現成的例子：game37 研究所 minChars:40 配 4 句在題庫中數學上無解。
    // 因此逃生口是必需品，不是加值功能。
    const SKIP_FAIL_THRESHOLD = 3;    // 同一關卡失敗幾次後開放捐納
    const SKIP_FEE_BY_TIER = {        // 捐納費用（文錢），隨難度層遞增
        '小學': 60, '中學': 180, '高中': 300, '大學': 600, '研究所': 900
    };

    // 版面常數
    const SPACING = 92;   // 每一站的垂直間距
    const AMP = 96;       // 蜿蜒路徑的左右擺幅
    const TOP_PAD = 70;   // 道路頂端留白
    const BOT_PAD = 90;   // 道路底端留白

    const LearningPath = {
        overlay: null,
        stations: [],
        rankGames: null,
        trackHeight: 0,

        // 遊戲切換用的短期記憶（僅存活於本次工作階段）
        _recent: [],          // 最近幾局的「tier|level|game」字串
        _lastGame: null,
        _lastChannel: null,
        _sameGameStreak: 0,
        _pendingUnit: null,   // 上一次派出去、尚未確認通過的關卡
        _currentStation: null,// 玩家目前正在闖的那一站
        _patched: null,       // { no, original } —— 被覆寫 startNextLevel 的遊戲
        _reviewMode: false,   // 目前是否在溫習舊文位（不累計局數）
        _stationIdxAtLaunch: -1, // 開局當下的站點索引，用來偵測「這一局讓玩家晉升了」

        /** 建立「文位 → 可玩遊戲清單」的累加對照表 */
        buildRankGames: function () {
            if (this.rankGames) return this.rankGames;
            const map = {};
            let acc = [];
            GAME_UNLOCK.forEach(seg => {
                acc = acc.concat(seg.add);
                seg.ranks.forEach(rankName => { map[rankName] = acc.slice(); });
            });
            this.rankGames = map;
            return map;
        },

        // ══════════════════════════════════════════════════════════════
        //  進度判定：一切以「必通關卡」為準，與積分無關
        // ══════════════════════════════════════════════════════════════

        /**
         * 建立「關卡 → 已通過的提取方式」對照表。
         *
         * ⚠️ 一定要快取：計算已學首數需走訪 346 首詩約 970 關，
         *    若每一關都呼叫 loadPlayerData（會 JSON.parse 整份存檔），
         *    光是開啟青雲梯就要解析近千次存檔。這裡改成整份只讀一次。
         *
         * ⚠️ 只採計列入必通關卡的 14 款遊戲；被移出的四款（21/23/33/36）
         *    無法保證「同一關 = 同一首詩」，因此它們的通關紀錄不計入進度。
         */
        buildProgressCache: function () {
            if (this._progressCache) return this._progressCache;
            const map = {};
            const donated = {};
            if (window.ScoreManager) {
                const data = window.ScoreManager.loadPlayerData() || {};
                const lc = data.levelCleared || {};
                for (const gameKey in lc) {
                    const no = parseInt(String(gameKey).replace('game', ''), 10);
                    const ch = GAME_CHANNELS[no];
                    if (!ch || REVIEW_ONLY_GAMES[no]) continue;
                    const byTier = lc[gameKey] || {};
                    for (const tier in byTier) {
                        const arr = byTier[tier];
                        if (!Array.isArray(arr)) continue;
                        for (let i = 0; i < arr.length; i++) {
                            const k = tier + '|' + arr[i];
                            if (!map[k]) map[k] = {};
                            map[k][ch] = true;
                        }
                    }
                }
                const ld = data.levelDonated || {};
                for (const tier in ld) {
                    const arr = ld[tier];
                    if (!Array.isArray(arr)) continue;
                    for (let i = 0; i < arr.length; i++) donated[tier + '|' + arr[i]] = true;
                }
            }
            this._progressCache = { channels: map, donated: donated };
            return this._progressCache;
        },

        /** 存檔可能已變動（通關、捐納）時呼叫，下次讀取會重建 */
        invalidateProgress: function () {
            this._progressCache = null;
        },

        /**
         * 取得某一關已經用哪幾種提取方式通過了。
         * @returns {Object} 以通道名稱為 key 的集合（用物件模擬 Set，相容舊瀏覽器）
         */
        getLevelChannels: function (tier, level) {
            const c = this.buildProgressCache();
            return c.channels[tier + '|' + level] || {};
        },

        /** 這一關是否已完成（已用三種不同提取方式通過，或已捐納跳過） */
        isUnitDone: function (unit) {
            const c = this.buildProgressCache();
            if (c.donated[unit.tier + '|' + unit.level]) return true;
            const need = window.PathStations
                ? window.PathStations.getChannelsPerLevel() : 3;
            return Object.keys(this.getLevelChannels(unit.tier, unit.level)).length >= need;
        },

        /**
         * 累計局數：玩家在青雲梯贏過的總局數（只增不減、絕不跳號）。
         * 這是頂端「局數」與遊戲畫面「第 X 局」共用的數字。
         */
        getPathRounds: function () {
            if (!window.ScoreManager) return 0;
            const d = window.ScoreManager.loadPlayerData();
            return (d && d.pathRounds) || 0;
        },

        /**
         * 「還要打幾局才能晉升到下一站」的進度。
         *
         * ⚠️ 這裡的「下一站」是**下一個小站**（可能是「書僮二階」這種階，
         *    也可能剛好是下一個大文位），不是跳到底的大文位。
         *    分母是**目前這一站自己的份量**（小數字，例如 0/13），
         *    不是累積到某個大文位的總量（那會是三位數，對玩家沒有意義）。
         *
         *    分母同樣是「內容門檻」，不是玩過的局數 —— 複習模式重打已學會
         *    的關卡雖然會讓頂端「局數」+1，但不會推進這裡的進度，因為那些
         *    內容早已學會。
         *
         * @returns {{nextName:string|null, done:number, total:number}}
         */
        getPromotionProgress: function () {
            const PS = window.PathStations;
            const empty = { nextName: null, done: 0, total: 0 };
            if (!PS) return empty;

            const stations = PS.build();
            const idx = PS.getCurrentIndex(this.getLearnedPoemCount());
            const cur = stations[idx];
            const next = stations[idx + 1];
            if (!cur || !next) return empty;   // 已經是最後一站（大儒）

            const per = PS.getChannelsPerLevel();
            let done = 0;
            (cur.units || []).forEach(u => {
                if (window.ScoreManager && window.ScoreManager.isLevelDonated(u.tier, u.level)) {
                    done += per;
                    return;
                }
                done += Math.min(per, Object.keys(this.getLevelChannels(u.tier, u.level)).length);
            });
            return { nextName: next.name, done: done, total: cur.requiredClears };
        },

        /**
         * 全程累計已完成的必通關卡數。
         * 這是青雲梯上唯一「只增不減」的數字，取代舊版顯示的總積分 ——
         * 積分已不再推進任何進度，擺在這裡只會讓玩家誤會它還有用。
         */
        getClearedUnitCount: function () {
            if (!window.PathStations) return 0;
            const list = window.PathStations.getPoemUnits();
            let n = 0;
            for (let i = 0; i < list.length; i++) {
                const units = list[i].units;
                for (let k = 0; k < units.length; k++) {
                    if (this.isUnitDone(units[k])) n++;
                }
            }
            return n;
        },

        /** 某一站已完成的必通關卡數 */
        getStationProgress: function (station) {
            const units = (station && station.units) || [];
            let done = 0;
            units.forEach(u => { if (this.isUnitDone(u)) done++; });
            return { done: done, total: units.length };
        },

        /**
         * 玩家已學會（⭑⭑ 熟練）幾首詩。
         * 判定：該詩的所有必通關卡皆已用三種提取方式通過。
         * 這個數字就是青雲梯上的位置，也是文位晉升的依據。
         */
        getLearnedPoemCount: function () {
            if (!window.PathStations) return 0;
            const list = window.PathStations.getPoemUnits();
            let n = 0;
            for (let i = 0; i < list.length; i++) {
                const units = list[i].units;
                if (!units.length) continue;
                let all = true;
                for (let k = 0; k < units.length; k++) {
                    if (!this.isUnitDone(units[k])) { all = false; break; }
                }
                if (all) n++;
            }
            return n;
        },

        /**
         * 某文位的「考試資格」進度（企畫書 9.4 第一步）。
         *
         * 資格 = 學習序列中該文位里程碑之前的所有詩，其必通關卡全數完成。
         *   例：秀才里程碑 64 首 → 必須先把前 64 首的必通關卡全部做完。
         *
         * ⚠️ 這取代了舊制的「積分達標」。積分可以靠反覆刷低難度遊戲累積，
         *    完全不代表學會了詩詞，正是當初加考試制度要防的事。
         *
         * @returns {{ok:boolean, poemsDone:number, poemsNeed:number,
         *            unitsDone:number, unitsTotal:number}}
         */
        getRankExamProgress: function (rankName) {
            const empty = { ok: false, poemsDone: 0, poemsNeed: 0, unitsDone: 0, unitsTotal: 0 };
            const PS = window.PathStations;
            if (!PS) return empty;
            const ms = PS.getMilestones();
            let m = null;
            for (let i = 0; i < ms.length; i++) { if (ms[i].name === rankName) { m = ms[i]; break; } }
            if (!m) return empty;

            const list = PS.getPoemUnits().slice(0, m.poems);
            let unitsTotal = 0, unitsDone = 0, poemsDone = 0;
            for (let i = 0; i < list.length; i++) {
                const units = list[i].units;
                let all = units.length > 0;
                for (let k = 0; k < units.length; k++) {
                    unitsTotal++;
                    if (this.isUnitDone(units[k])) unitsDone++;
                    else all = false;
                }
                if (all) poemsDone++;
            }
            return {
                ok: unitsTotal > 0 && unitsDone >= unitsTotal,
                poemsDone: poemsDone,
                poemsNeed: m.poems,
                unitsDone: unitsDone,
                unitsTotal: unitsTotal
            };
        },

        /** 取得文錢（存放於收集系統的存檔中） */
        getSilver: function () {
            try {
                if (window.FMCollectionSave && typeof window.FMCollectionSave.load === 'function') {
                    return window.FMCollectionSave.load().silver || 0;
                }
            } catch (e) { /* 收集系統尚未初始化時視為 0 */ }
            return 0;
        },

        /** 取得總積分（僅供顯示與排行榜，不參與任何進度判定） */
        getTotalScore: function () {
            if (!window.ScoreManager) return 0;
            const data = window.ScoreManager.loadPlayerData();
            return (data && data.totalScore) || 0;
        },

        // ══════════════════════════════════════════════════════════════
        //  介面
        // ══════════════════════════════════════════════════════════════

        init: function () {
            if (this.overlay) return;
            // CSS 載入防護（見「花月開發常見錯誤與解法」§3.3）
            if (!document.getElementById('learning-path-css')) {
                const link = document.createElement('link');
                link.id = 'learning-path-css';
                link.rel = 'stylesheet';
                link.href = 'learningPath.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.bindDragEvents();
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'learning-path-overlay';
            overlay.className = 'lp-overlay hidden';
            overlay.innerHTML = `
                <div class="lp-header">
                    <div class="lp-header-main">
                        <div class="lp-rank" id="lpRank">書僮</div>
                        <div class="lp-stats">
                            <div class="lp-stat"><span class="lp-stat-label">已學</span><span class="lp-stat-value" id="lpLearned">0</span></div>
                            <div class="lp-stat"><span class="lp-stat-label">局數</span><span class="lp-stat-value" id="lpRounds">0</span></div>
                            <div class="lp-stat"><span class="lp-stat-label">文錢</span><span class="lp-stat-value" id="lpSilver">0</span></div>
                        </div>
                    </div>
                    <div class="lp-progress-bar"><div class="lp-progress-fill" id="lpProgFill"></div></div>
                    <div class="lp-progress-text" id="lpProgText"></div>
                </div>
                <div class="lp-notice hidden" id="lpNotice"></div>
                <div class="lp-scroll" id="lpScroll">
                    <div class="lp-track" id="lpTrack"></div>
                </div>
                <button class="lp-locate-btn" id="lpBtnGo" title="回到目前關卡" aria-label="回到目前關卡">
                    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                        <path d="M4 20 L20 4 M20 4 L20 13 M20 4 L11 4"
                              fill="none" stroke="currentColor" stroke-width="2.6"
                              stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            `;
            document.body.appendChild(overlay);

            // 舞台同步縮放（所有 overlay 的標準作法）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    overlay.style.left = r.left + 'px';
                    overlay.style.top = r.top + 'px';
                    overlay.style.width = 500 + 'px';
                    overlay.style.height = 850 + 'px';
                    overlay.style.transform = 'scale(' + r.scale + ')';
                    overlay.style.transformOrigin = 'top left';
                });
            }

            overlay.querySelector('#lpBtnGo').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.scrollToCurrent(true);
            });

            this.overlay = overlay;
        },

        /**
         * 以手指／滑鼠上下拖曳捲動，並帶慣性滑行。
         * ⚠️ 觸控時絕不可 preventDefault 或手動改 scrollTop，
         *    否則 iOS 會失去硬體加速而嚴重卡頓 —— 觸控交給瀏覽器原生處理，
         *    只在桌機滑鼠拖曳時才手動接管。
         */
        bindDragEvents: function () {
            const scroll = this.overlay.querySelector('#lpScroll');
            let isDragging = false;
            let startY = 0;
            let startScroll = 0;
            let hasDragged = false;
            const THRESHOLD = 5;

            let velocity = 0;
            let lastY = 0;
            let lastTime = 0;
            let momentumID = null;

            scroll.addEventListener('mousedown', (e) => {
                isDragging = true;
                hasDragged = false;
                startY = e.pageY;
                startScroll = scroll.scrollTop;
                scroll.style.cursor = 'grabbing';
                if (momentumID) cancelAnimationFrame(momentumID);
                velocity = 0;
                lastY = e.pageY;
                lastTime = performance.now();
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const walk = e.pageY - startY;
                if (Math.abs(walk) > THRESHOLD) {
                    hasDragged = true;
                    e.preventDefault();
                }
                scroll.scrollTop = startScroll - walk;

                const now = performance.now();
                const dt = now - lastTime;
                if (dt > 0) {
                    velocity = (e.pageY - lastY) / dt;
                    lastY = e.pageY;
                    lastTime = now;
                }
            });

            window.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                scroll.style.cursor = 'grab';

                const glide = () => {
                    if (Math.abs(velocity) > 0.05) {
                        scroll.scrollTop -= velocity * 16;   // 假設 16ms 更新率
                        velocity *= 0.95;                    // 摩擦係數，越接近 1 滑越遠
                        momentumID = requestAnimationFrame(glide);
                    } else {
                        velocity = 0;
                    }
                };
                glide();
            });

            // 觸控：只記錄是否拖曳過（避免誤觸站點），捲動交給瀏覽器原生處理
            scroll.addEventListener('touchstart', (e) => {
                hasDragged = false;
                startY = e.touches[0].pageY;
            }, { passive: true });

            scroll.addEventListener('touchmove', (e) => {
                if (Math.abs(e.touches[0].pageY - startY) > THRESHOLD) hasDragged = true;
            }, { passive: true });

            this.hasDragged = () => hasDragged;
        },

        show: function () {
            this.init();
            this.checkPendingUnit();
            this.render();
            this.overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            document.body.classList.add('overlay-active');
            setTimeout(() => this.scrollToCurrent(false), 50);
        },

        hide: function () {
            if (!this.overlay) return;
            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        /**
         * 供 menu.js 的全域清理呼叫。
         * ⚠️ 必須自己隱藏 overlay —— closeAllActiveOverlays() 只呼叫 stopGame()，
         *    不會呼叫 hide()（見「花月開發常見錯誤與解法」§4.1）。
         *    同時要還原 body 的捲動狀態，否則切到下一頁時 body 仍是 overflow:hidden。
         */
        stopGame: function () {
            // 玩家離開青雲梯（例如從漢堡選單切走）→ 還原被覆寫的遊戲方法，
            // 讓該遊戲回到自己原本的關卡推進行為。
            this.restorePatchedGame();
            this._currentStation = null;
            this._reviewMode = false;
            if (window.ScoreManager && window.ScoreManager.setReviewMode) {
                window.ScoreManager.setReviewMode(false);
            }
            if (!this.overlay) return;
            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        },

        /**
         * 回到青雲梯時，檢查上一次派出去的關卡是否真的通過了。
         * 沒通過就累計一次失敗 —— 累積到門檻後開放捐納跳關。
         *
         * ⚠️ 這個作法刻意不去改 14 款遊戲的 gameOver：
         *    以「派出去 → 回來時還沒完成」推定失敗，效果相同且零侵入。
         */
        checkPendingUnit: function () {
            const u = this._pendingUnit;
            this._pendingUnit = null;
            if (!u || !window.ScoreManager) return;
            // 這一關的提取方式集合沒有增加，視為這一次沒過
            const nowCount = Object.keys(this.getLevelChannels(u.tier, u.level)).length;
            if (nowCount <= u.channelsBefore) {
                window.ScoreManager.recordLevelFail(u.tier, u.level);
            }
        },

        /**
         * 產生「四段式進度圈」的 SVG。
         * 刻意切成 4 段而非一整圈：整圈在剛起步或即將完成時，
         * 那一點點差異幾乎看不出來；切段之後每完成 25% 就整段亮起。
         */
        buildProgressRing: function (pct) {
            const R = 40, C = 2 * Math.PI * R;
            const SEG = C / 4, GAP = 9;
            const arc = SEG - GAP;
            let s = `<svg class="lp-ring" viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">`;
            for (let i = 0; i < 4; i++) {
                const segPct = Math.max(0, Math.min(1, (pct - i * 25) / 25));
                const off = -(i * SEG);
                s += `<circle class="lp-ring-bg" cx="50" cy="50" r="${R}" fill="none"
                        stroke-width="7" stroke-linecap="round"
                        stroke-dasharray="${arc} ${C - arc}" stroke-dashoffset="${off}"/>`;
                if (segPct > 0) {
                    s += `<circle class="lp-ring-fg" cx="50" cy="50" r="${R}" fill="none"
                            stroke-width="7" stroke-linecap="round"
                            stroke-dasharray="${arc * segPct} ${C - arc * segPct}" stroke-dashoffset="${off}"/>`;
                }
            }
            return s + '</svg>';
        },

        render: function () {
            const track = this.overlay.querySelector('#lpTrack');
            if (!track || !window.PathStations) return;

            // 每次重繪都以最新存檔為準
            this.invalidateProgress();

            this.stations = window.PathStations.build();
            const learned = this.getLearnedPoemCount();
            const currentIdx = window.PathStations.getCurrentIndex(learned);

            // ── 頂部資訊列：文位（含小階）／已學首數／已過關卡數／文錢 ──
            const curStation = this.stations[currentIdx];
            const totalPoems = window.PathStations.getTotalPoems();
            // 顯示目前所在的「小階段文位」，而不只是大文位 ——
            // 玩家的短期成就感來自小階，標題要跟著小階走。
            this.overlay.querySelector('#lpRank').textContent = curStation ? curStation.name : '書僮';
            this.overlay.querySelector('#lpLearned').textContent = learned + ' / ' + totalPoems;
            this.overlay.querySelector('#lpRounds').textContent = this.getPathRounds().toLocaleString();
            this.overlay.querySelector('#lpSilver').textContent = this.getSilver().toLocaleString();

            // 進度 = 目前文位還要打幾局才能晉級（改用玩家看得懂的「局數」）
            const prom = this.getPromotionProgress();
            const pct = prom.total ? Math.min(100, prom.done / prom.total * 100) : 100;
            const progText = this.overlay.querySelector('#lpProgText');
            const progFill = this.overlay.querySelector('#lpProgFill');
            if (prom.nextName && prom.total) {
                // 顯示的是「下一站」的名字（可能是小階，也可能剛好是下一個大文位）
                progText.textContent =
                    `「${prom.nextName}」晉升局數 ${prom.done} / ${prom.total}`;
            } else {
                progText.textContent = '已抵達大儒之境，學海無涯。';
            }
            if (progFill) progFill.style.width = pct + '%';

            this.renderNotice(curStation);

            // ── 站點：由下往上排列，讓玩家有往上爬的成長感 ──
            const n = this.stations.length;
            this.trackHeight = TOP_PAD + n * SPACING + BOT_PAD;
            const html = [];

            this.stations.forEach((st, i) => {
                const x = 250 + Math.sin(i * 0.62) * AMP;
                // ⚠️ 由下往上：索引越大越靠近頂端
                const y = this.trackHeight - BOT_PAD - i * SPACING;

                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                const isLocked = i > currentIdx;

                const cls = ['lp-station'];
                cls.push(st.type === 'rank' ? 'lp-rank-station' : 'lp-minor-station');
                if (st.isExam) cls.push('lp-exam-station');
                if (isDone) cls.push('lp-done');
                if (isCurrent) cls.push('lp-current');
                if (isLocked) cls.push('lp-locked');
                const labelRight = x <= 250;
                cls.push(labelRight ? 'lp-label-right' : 'lp-label-left');

                // 站點圖示：文位站用印章、考棚站用門樓、階站用圓點
                let icon;
                if (st.type === 'rank') icon = st.isExam ? '⛩' : '❖';
                else icon = isDone ? '✓' : '●';

                // 副標顯示「難度層 + 這一站要學第幾首到第幾首詩」。
                // ⚠️ 刻意不顯示遊戲名稱：遊戲是每次進入時才決定的（見 pickGame）。
                const sub = st.poemTo > st.poemFrom
                    ? `${st.tier} 第 ${st.poemFrom + 1}~${st.poemTo} 首`
                    : st.tier;
                const labelHTML =
                    `<div class="lp-station-text">` +
                    `<div class="lp-station-label">${st.name}</div>` +
                    `<div class="lp-station-game">${sub}</div>` +
                    `</div>`;

                const iconHTML =
                    `<div class="lp-station-icon-wrap">` +
                    (isCurrent ? this.buildProgressRing(pct) : '') +
                    `<div class="lp-station-icon">${icon}</div>` +
                    `</div>`;

                html.push(
                    `<div class="${cls.join(' ')}" style="left:${x}px;top:${y}px;" ` +
                    `data-idx="${i}">` +
                    (labelRight ? iconHTML + labelHTML : labelHTML + iconHTML) +
                    `</div>`
                );
            });

            track.style.height = this.trackHeight + 'px';
            track.innerHTML = html.join('');

            track.querySelectorAll('.lp-station').forEach(el => {
                el.addEventListener('click', () => {
                    // 拖曳過就不算點擊，避免滑動時誤觸站點
                    if (this.hasDragged && this.hasDragged()) return;
                    this.onStationClick(parseInt(el.getAttribute('data-idx'), 10));
                });
            });
        },

        /**
         * 卡關提示列：目前這一站若有關卡失敗達門檻，就提供捐納跳關。
         * （清代確有「捐納」買監生資格的制度，主題上說得通。）
         */
        renderNotice: function (station) {
            const box = this.overlay.querySelector('#lpNotice');
            if (!box) return;
            const stuck = this.findStuckUnit(station);
            if (!stuck) { box.classList.add('hidden'); box.innerHTML = ''; return; }

            const fee = SKIP_FEE_BY_TIER[stuck.tier] || 100;
            const title = this.getPoemTitle(stuck.tier, stuck.level);
            box.classList.remove('hidden');
            box.innerHTML =
                `<span class="lp-notice-text">卡在〈${title}〉這一關？</span>` +
                `<button class="lp-notice-btn" id="lpBtnSkip">捐納 ${fee} 文錢跳過</button>`;
            const btn = box.querySelector('#lpBtnSkip');
            if (btn) btn.addEventListener('click', () => this.donateSkip(stuck, fee));
        },

        /** 找出目前這一站中失敗次數已達門檻、且尚未完成的關卡 */
        findStuckUnit: function (station) {
            if (!station || !window.ScoreManager) return null;
            const units = station.units || [];
            for (let i = 0; i < units.length; i++) {
                const u = units[i];
                if (this.isUnitDone(u)) continue;
                if (window.ScoreManager.getLevelFails(u.tier, u.level) >= SKIP_FAIL_THRESHOLD) return u;
            }
            return null;
        },

        /** 取得某一關錨定詩的詩名（提示文字用） */
        getPoemTitle: function (tier, level) {
            try {
                const ids = window.LevelTable.getClusterPoemIds(tier, level);
                const table = window.LevelTable.getTable();
                const entry = table.tiers[tier].levels[level - 1];
                const pid = entry ? entry.p : (ids[0] || 0);
                const poems = window.LevelTable.getPoems();
                for (let i = 0; i < poems.length; i++) {
                    if (poems[i].id === pid) return poems[i].title || '這一關';
                }
            } catch (e) { /* 查不到就用泛稱 */ }
            return '這一關';
        },

        /** 捐納跳關：扣文錢，並把該關直接記為三種通道皆已通過 */
        donateSkip: function (unit, fee) {
            const silver = this.getSilver();
            if (silver < fee) {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.toast('盤纏不足，尚差 ' + (fee - silver) + ' 文錢');
                return;
            }
            try {
                const data = window.FMCollectionSave.load();
                data.silver = (data.silver || 0) - fee;
                window.FMCollectionSave.save(data);
            } catch (e) {
                console.warn('[青雲梯] 扣文錢失敗', e);
                return;
            }
            // 直接補滿這一關所需的三種提取方式
            if (window.ScoreManager) {
                window.ScoreManager.markLevelDonated(unit.tier, unit.level);
            }
            if (window.SoundManager) window.SoundManager.playConfirmItem();
            // ⚠️ 先重繪再提示：render() 會重建提示列，順序顛倒會把訊息洗掉
            this.render();
            this.toast('已捐納，這一關視同通過。');
        },

        toast: function (msg) {
            const box = this.overlay && this.overlay.querySelector('#lpNotice');
            if (!box) return;
            box.classList.remove('hidden');
            box.innerHTML = `<span class="lp-notice-text">${msg}</span>`;
        },

        // ══════════════════════════════════════════════════════════════
        //  出題與遊戲挑選
        // ══════════════════════════════════════════════════════════════

        /**
         * 挑選這一次要玩哪一關。
         *
         * ⚠️ 絕對不可用「進入次數」來遞增關卡：那會讓玩家一關都沒過，
         *    只是反覆進出就把關卡編號一路往上推，等於跳過失敗的關卡。
         *    正確作法是依**實際通關紀錄**挑題：
         *      1. 優先從「尚未完成三種提取方式」的關卡中隨機挑。
         *      2. 若整站都已完成，改從全部關卡隨機挑（複習模式）。
         *    採隨機而非依序循環，是為了避免高文位時一直遇到同一首詩。
         */
        pickUnit: function (station) {
            const units = (station && station.units) || [];
            if (!units.length) return null;
            const undone = units.filter(u => !this.isUnitDone(u));
            const pool = undone.length ? undone : units;
            return pool[Math.floor(Math.random() * pool.length)];
        },

        /**
         * 決定這一次要玩哪一款遊戲（企畫書 10.2）。
         *
         * 依序套用四條規則，每一條都只在「篩完還有候選」時才生效，
         * 避免規則太嚴導致無games可選：
         *   1. 優先補上這一關還缺的提取方式（這是必通關卡的核心）
         *   2. 同一款遊戲最多連續 3 局
         *   3. 優先跨提取方式（與上一局不同通道）
         *   4. 長題目遊戲不連續出現兩次
         *   5. 排除最近 5 局出現過的（關卡 × 遊戲）組合
         */
        pickGame: function (rankName, unit, exclude) {
            const skip = exclude || [];
            const unlocked = this.buildRankGames()[rankName] || [1];
            // 只從列入必通關卡的 14 款中挑（被移出的四款不出現在青雲梯）
            let pool = unlocked.filter(g => GAME_CHANNELS[g] && !REVIEW_ONLY_GAMES[g]
                && skip.indexOf(g) === -1);
            if (!pool.length) return null;

            const narrow = (list, fn) => {
                const f = list.filter(fn);
                return f.length ? f : list;
            };

            // 1. 這一關還缺哪些提取方式
            const done = unit ? this.getLevelChannels(unit.tier, unit.level) : {};
            let cands = narrow(pool, g => !done[GAME_CHANNELS[g]]);

            // 2. 同一款不得連續超過上限
            if (this._sameGameStreak >= MAX_SAME_GAME_STREAK) {
                cands = narrow(cands, g => g !== this._lastGame);
            }
            // 3. 優先換一種記憶通道
            if (this._lastChannel) {
                cands = narrow(cands, g => GAME_CHANNELS[g] !== this._lastChannel);
            }
            // 4. 長題目不連續
            if (this._lastGame && LONG_GAMES[this._lastGame]) {
                cands = narrow(cands, g => !LONG_GAMES[g]);
            }
            // 5. 排除最近出現過的（關卡 × 遊戲）組合
            if (unit) {
                cands = narrow(cands, g => this._recent.indexOf(unit.tier + '|' + unit.level + '|' + g) === -1);
            }

            return cands[Math.floor(Math.random() * cands.length)];
        },

        /** 記下這一局，供切換規則參考 */
        notePlay: function (gameNo, unit) {
            if (gameNo === this._lastGame) this._sameGameStreak++;
            else this._sameGameStreak = 1;
            this._lastGame = gameNo;
            this._lastChannel = GAME_CHANNELS[gameNo] || null;
            if (unit) {
                this._recent.push(unit.tier + '|' + unit.level + '|' + gameNo);
                while (this._recent.length > RECENT_WINDOW) this._recent.shift();
            }
        },

        onStationClick: function (idx) {
            const st = this.stations[idx];
            if (!st) return;
            const currentIdx = window.PathStations.getCurrentIndex(this.getLearnedPoemCount());

            // 尚未解鎖的站不能玩（前面的詩還沒學會）
            if (idx > currentIdx) {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.toast('先把前面的詩學會吧。');
                return;
            }

            // ── 點到已經走過的舊站點 → 先問清楚是不是要溫習 ──────────────
            // 玩家看到的是全域累計局數，回頭點舊站時很容易誤以為
            // 「我還在往前走」。這裡明講：溫習不累計局數。
            if (idx < currentIdx) {
                this.showReviewConfirm(st, () => this.enterStation(idx, true));
                return;
            }
            this.enterStation(idx, false);
        },

        /**
         * 真正進入某一站開局。
         * @param {number} idx 站點索引
         * @param {boolean} review 是否為溫習（溫習不累計局數）
         */
        enterStation: function (idx, review) {
            const st = this.stations[idx];
            if (!st) return;
            this._reviewMode = !!review;
            if (window.ScoreManager && window.ScoreManager.setReviewMode) {
                window.ScoreManager.setReviewMode(this._reviewMode);
            }
            this._stationIdxAtLaunch = window.PathStations.getCurrentIndex(this.getLearnedPoemCount());
            this._currentStation = st;
            const unit = this.pickUnit(st);
            if (!unit) {
                if (window.SoundManager) window.SoundManager.playFailure();
                return;
            }
            if (window.SoundManager) window.SoundManager.playConfirmItem();

            const gameNo = this.pickGame(st.rankName, unit);
            if (!gameNo) {
                if (window.SoundManager) window.SoundManager.playFailure();
                this.toast('這一站尚無可玩的遊戲。');
                return;
            }
            this.notePlay(gameNo, unit);

            // 記下這一關，回到青雲梯時用來判斷有沒有過（見 checkPendingUnit）
            this._pendingUnit = {
                tier: unit.tier,
                level: unit.level,
                channelsBefore: Object.keys(this.getLevelChannels(unit.tier, unit.level)).length
            };

            this.launchGame(gameNo, unit.tier, unit.level);
        },

        /**
         * 直接以指定的難度層＋關卡開局，跳過難度選擇器。
         *
         * ⚠️ 作法說明：14 款遊戲的 show() 都是「先叫出 DifficultySelector，
         *    再由 callback(難度, 關卡) 開局」。為了不必逐一修改遊戲檔，
         *    這裡在呼叫 show() 前**暫時替換** DifficultySelector.show，
         *    讓它直接把我們指定的難度與關卡回呼回去，隨即立刻還原。
         */
        /**
         * 開局。若該遊戲在這個難度層／關卡出不了題，會自動改派另一款。
         *
         * ⚠️ 為什麼需要這層保護：
         *    各遊戲的 difficultySettings 與其 getSharedRandomPoem 呼叫端若不一致
         *    （例如 minChars 大於 maxChars），該遊戲在該難度層就永遠取不到題，
         *    只會 alert「載入詩詞失敗」然後停在那裡 —— 玩家等於整條青雲梯卡死。
         *    這裡攔截該次失敗並換一款遊戲，讓玩家能繼續走；
         *    同時在主控台留下警告，方便回頭修正該遊戲的設定。
         *
         * @param {number[]} [tried] 內部遞迴用：已經試過但失敗的遊戲
         */
        launchGame: function (gameNo, tier, levelIndex, tried) {
            const attempted = (tried || []).slice();
            const GameObj = window['Game' + gameNo];
            if (!GameObj || typeof GameObj.show !== 'function') {
                console.warn('[青雲梯] 找不到遊戲 Game' + gameNo);
                return;
            }

            if (window.LevelTable) window.LevelTable.setContext(tier, levelIndex);
            this.hide();

            // ⚠️ 先關掉其他還開著的青雲梯遊戲。
            //    玩家若沒通關就返回青雲梯、再點另一個站，舊遊戲的 overlay 會留在
            //    畫面上不會自動消失，新舊兩層疊著（實測會同時看到兩款遊戲，
            //    而且舊的那層還顯示著過期的局數標籤）。
            //    同一款遊戲續玩時不關，避免每關都閃一下。
            Object.keys(GAME_NAMES).forEach(k => {
                const n = parseInt(k, 10);
                if (n === gameNo) return;
                const G = window['Game' + n];
                if (G && typeof G.stopGame === 'function' && G.container
                    && !G.container.classList.contains('hidden')) {
                    G.stopGame();
                }
            });

            // ── 收回關卡推進的控制權（企畫書第十章）────────────────────
            // ⚠️ 這是「同一款遊戲連玩 20 關都沒換」的修正。
            //    18 款遊戲在關卡模式下過關後，都是自己呼叫 startNextLevel()
            //    把 currentLevelIndex++ 然後直接開下一局 —— 那是舊版「關卡模式」
            //    留下來的行為（玩家選定一款遊戲後一路打下去）。
            //    結果青雲梯的 pickGame() 只在「進站的那一刻」跑過一次，
            //    之後完全沒有機會再切換遊戲。
            //    這裡暫時覆寫該遊戲的 startNextLevel，讓每一關結束後都回到
            //    青雲梯重新挑題、重新挑遊戲，切換規則才能逐關生效。
            this.restorePatchedGame();
            if (typeof GameObj.startNextLevel === 'function') {
                this._patched = { no: gameNo, original: GameObj.startNextLevel };
                const self = this;
                GameObj.startNextLevel = function () { self.advanceAfterWin(gameNo); };
            }

            const DS = window.DifficultySelector;
            if (DS && typeof DS.show === 'function') {
                const originalShow = DS.show;
                let restored = false;
                const restore = () => {
                    if (!restored) { DS.show = originalShow; restored = true; }
                };
                DS.show = function (gameName, callback) {
                    restore();   // 立即還原，避免影響之後從選單進入的一般流程
                    if (typeof callback === 'function') callback(tier, levelIndex);
                };
                setTimeout(restore, 3000);   // 安全網
            }

            // 攔截該遊戲開局時的失敗提示（例如「載入詩詞失敗。」）
            const realAlert = window.alert;
            let failMsg = null;
            window.alert = function (m) { failMsg = String(m); };
            try {
                GameObj.show();
            } finally {
                window.alert = realAlert;
            }

            if (failMsg) {
                console.warn('[青雲梯] Game' + gameNo + '（' + (GAME_NAMES[gameNo] || '') + '）'
                    + '在「' + tier + '」第 ' + levelIndex + ' 關出不了題：' + failMsg
                    + '　→ 自動改派其他遊戲。請檢查該遊戲的 difficultySettings 與 '
                    + 'getSharedRandomPoem 呼叫端是否一致（常見為 minChars > maxChars）。');
                if (typeof GameObj.stopGame === 'function') GameObj.stopGame();
                this.restorePatchedGame();

                attempted.push(gameNo);
                const st = this._currentStation;
                const alt = st ? this.pickGame(st.rankName, { tier: tier, level: levelIndex }, attempted) : null;
                if (alt) {
                    this.notePlay(alt, { tier: tier, level: levelIndex });
                    this.launchGame(alt, tier, levelIndex, attempted);
                } else {
                    // 這一關所有可玩的遊戲都出不了題 —— 退回青雲梯並告知玩家
                    console.warn('[青雲梯] 這一關所有已解鎖的遊戲都無法出題，已退回青雲梯。');
                    this.show();
                    this.toast('這一關暫時無法出題，請改玩其他站點。');
                }
            }
        },

        /** 還原先前被覆寫的 startNextLevel，避免影響從選單進入的一般流程 */
        restorePatchedGame: function () {
            const p = this._patched;
            this._patched = null;
            if (!p) return;
            const G = window['Game' + p.no];
            if (G) G.startNextLevel = p.original;
        },

        /**
         * 玩家在青雲梯派出的關卡中過關了 —— 由被覆寫的 startNextLevel 呼叫。
         *
         * 這裡重新跑一次「挑題 + 挑遊戲」，因此第十章的五條切換規則
         * （同款最多連 3 局、優先換提取方式、長題目不連續、排除最近組合）
         * 會**逐關**生效，而不是只在進站時生效一次。
         */
        advanceAfterWin: function (gameNo) {
            // 剛剛通關了，進度快取必須重算，否則會重複派同一關
            this.invalidateProgress();
            this._pendingUnit = null;

            // ── 這一局是否讓玩家晉升到下一站？────────────────────────────
            // 站點索引往前跳 = 這一站的必通關卡剛剛全部完成。
            // 立刻彈窗給予成就感，避免玩家傻傻一直玩卻不知道自己已經升階。
            const nowIdx = window.PathStations.getCurrentIndex(this.getLearnedPoemCount());
            if (!this._reviewMode && nowIdx > this._stationIdxAtLaunch && this._stationIdxAtLaunch >= 0) {
                this._stationIdxAtLaunch = nowIdx;
                const reached = this.stations[nowIdx];
                this.restorePatchedGame();
                const cur1 = window['Game' + gameNo];
                if (cur1 && typeof cur1.stopGame === 'function') cur1.stopGame();
                this.showPromotionPopup(reached);
                return;
            }

            const st = this._currentStation;
            const unit = st ? this.pickUnit(st) : null;
            if (!unit) {
                // 找不到下一題（理論上不會發生）→ 安全退回青雲梯
                this.restorePatchedGame();
                const cur = window['Game' + gameNo];
                if (cur && typeof cur.stopGame === 'function') cur.stopGame();
                this.show();
                return;
            }

            const nextGame = this.pickGame(st.rankName, unit);
            if (!nextGame) {
                this.restorePatchedGame();
                const cur0 = window['Game' + gameNo];
                if (cur0 && typeof cur0.stopGame === 'function') cur0.stopGame();
                this.show();
                return;
            }
            this.notePlay(nextGame, unit);
            this._pendingUnit = {
                tier: unit.tier,
                level: unit.level,
                channelsBefore: Object.keys(this.getLevelChannels(unit.tier, unit.level)).length
            };

            // 換遊戲時先關掉目前這一款，避免兩個 overlay 疊著
            if (nextGame !== gameNo) {
                const cur = window['Game' + gameNo];
                if (cur && typeof cur.stopGame === 'function') cur.stopGame();
            }
            this.launchGame(nextGame, unit.tier, unit.level);
        },

        // ══════════════════════════════════════════════════════════════
        //  彈窗
        // ══════════════════════════════════════════════════════════════

        /** 建立一個對齊 500×850 舞台的彈窗外殼 */
        _makePopup: function (innerHTML) {
            const overlay = document.createElement('div');
            overlay.className = 'lp-pop-overlay';
            overlay.innerHTML = '<div class="lp-pop">' + innerHTML + '</div>';
            document.body.appendChild(overlay);
            // 對齊舞台（作法同 achievement.js 的即時獎狀彈窗）
            if (window.stageRect) {
                const r = window.stageRect;
                const stageBox = document.createElement('div');
                stageBox.style.cssText = 'position:absolute;left:' + r.left + 'px;top:' + r.top
                    + 'px;width:500px;height:850px;transform:scale(' + r.scale
                    + ');transform-origin:top left;display:flex;justify-content:center;'
                    + 'align-items:center;pointer-events:none;';
                const popEl = overlay.querySelector('.lp-pop');
                popEl.style.pointerEvents = 'auto';
                stageBox.appendChild(popEl);
                overlay.appendChild(stageBox);
            }
            return overlay;
        },

        /**
         * 晉升彈窗：這一局讓玩家走到新的站點時，於結算後立刻出現。
         *
         * 兩種型態：
         *   · 小階（例如「書僮二階」）→ 領取階段稱號，回到青雲梯
         *   · 需應試的文位（縣案首以後）→ 引導玩家前往江南小院考棚
         */
        showPromotionPopup: function (station) {
            if (!station) { this.show(); return; }
            const isExamRank = station.type === 'rank' && station.isExam;
            const isRank = station.type === 'rank';

            let html;
            if (isExamRank) {
                html = '<h2>學問已成，可赴科場</h2>'
                    + '<p>閣下苦讀不輟，已具應試「<b>' + station.name + '</b>」之學力。'
                    + '惟功名須經場屋一試方得冊封 —— 可即刻前往江南小院考棚報名，'
                    + '亦可再溫書數日，待胸有成竹再去。</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopLater">稍後再說</button>'
                    + '<button class="lp-pop-btn" id="lpPopExam">前往考棚應試</button>'
                    + '</div>';
            } else {
                html = '<h2>恭喜晉階</h2>'
                    + '<p>積跬步以至千里。閣下已通過此階全部關卡，'
                    + '榮登「<b>' + station.name + '</b>」' + (isRank ? '文位' : '') + '。'
                    + '新的詩篇已在前方等候。</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn" id="lpPopClaim">領取「' + station.name + '」</button>'
                    + '</div>';
            }

            const overlay = this._makePopup(html);
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) {
                window.SoundManager.playJoyfulTriple();
            }

            const backToPath = () => {
                overlay.remove();
                // 回到青雲梯主介面，讓玩家親眼看到自己已經站上新的一階
                this.show();
                setTimeout(() => this.scrollToCurrent(true), 120);
            };

            const btnClaim = overlay.querySelector('#lpPopClaim');
            if (btnClaim) btnClaim.onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                backToPath();
            };
            const btnLater = overlay.querySelector('#lpPopLater');
            if (btnLater) btnLater.onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                backToPath();
            };
            const btnExam = overlay.querySelector('#lpPopExam');
            if (btnExam) btnExam.onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                overlay.remove();
                this.hide();
                // 沿用江南小院既有的考棚流程（達標→付文錢→應試→領獎狀）
                if (window.CollectionDialog && window.CollectionDialog.show) {
                    window.CollectionDialog.show();
                    setTimeout(() => {
                        if (typeof window.CollectionDialog.openExam === 'function') {
                            window.CollectionDialog.openExam();
                        }
                    }, 350);
                }
            };
        },

        /** 溫習確認彈窗：點到已走過的舊站點時出現 */
        showReviewConfirm: function (station, onAgree) {
            const html = '<h2>溫故知新</h2>'
                + '<p>「<b>' + station.name + '</b>」是你已經走過的路。'
                + '在這裡重玩<b>不會增加晉升局數</b>，純粹供你溫習舊作；'
                + '過關仍可照常獲得文錢與積分。<br><br>'
                + '想繼續往前走，請點選道路最上方的站。</p>'
                + '<div class="lp-pop-footer">'
                + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopCancel">取消</button>'
                + '<button class="lp-pop-btn" id="lpPopReview">同意溫習</button>'
                + '</div>';
            const overlay = this._makePopup(html);
            overlay.querySelector('#lpPopCancel').onclick = () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                overlay.remove();
            };
            overlay.querySelector('#lpPopReview').onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                overlay.remove();
                if (typeof onAgree === 'function') onAgree();
            };
        },

        /** 捲動到玩家目前所在的站（道路由下往上，故需換算） */
        scrollToCurrent: function (smooth) {
            const scroll = this.overlay && this.overlay.querySelector('#lpScroll');
            if (!scroll || !window.PathStations) return;
            const idx = window.PathStations.getCurrentIndex(this.getLearnedPoemCount());
            const y = this.trackHeight - BOT_PAD - idx * SPACING;
            // 讓目前站落在可視區偏下方，上方預留即將前往的關卡
            const target = Math.max(0, y - scroll.clientHeight * 0.68);
            if (smooth && scroll.scrollTo) scroll.scrollTo({ top: target, behavior: 'smooth' });
            else scroll.scrollTop = target;
        },

        // 供其他模組（考試資格判定等）查詢用
        GAME_CHANNELS: GAME_CHANNELS,
        GAME_NAMES: GAME_NAMES,
        REVIEW_ONLY_GAMES: REVIEW_ONLY_GAMES
    };

    window.LearningPath = LearningPath;
})();
