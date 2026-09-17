/* ==========================================================================
   花月 · 青雲梯 learningPath.js
   --------------------------------------------------------------------------
   「腳著謝公屐，身登青雲梯」——李白《夢遊天姥吟留別》

   對應企畫書：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md
     第三章 遊戲分類：依提取方式，不依難度
     第四章 學習單位與「學會」的定義
     第五章 文位節奏與四階小稱號
     第八章 必通關卡：定義與規則
     第十章 遊戲切換規則

   ── 與舊版最大的差異 ────────────────────────────────────────────────
   舊版用「積分」決定玩家走到哪一站，代表反覆刷低難度遊戲就能升到大儒。
   新版改用「必通關卡」：
     · 一首詩的必通關卡 = 該詩的題目單元 × 每個單元 3 局
     · 一個單元的 3 局必須用 3 款**不同遊戲**（同款玩第二次就沒難度了）
     · 一站的十幾局**整體**至少要涵蓋 3 種不同的記憶通道
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
        { ranks: ['童生'], add: [3, 13, 33, 16] },
        { ranks: ['縣案首'], add: [9, 31] },
        { ranks: ['府案首', '文童'], add: [12, 21, 37] },
        { ranks: ['秀才', '舉人', '貢士', '進士', '探花', '榜眼', '狀元', '大儒'], add: [23, 36] }
    ];

    // ── 提取方式分類（企畫書 3.2）──────────────────────────────────────
    // ⚠️ 這是「記憶通道」，不是難度階梯。
    //    「步步驚心」不是精熟階段的遊戲，它是「整首詩逐字提取」這種提取方式，
    //    在小學難度一樣能玩。舊版誤把兩者混為一談。
    //
    //    同一首詩用不同通道各碰一次，效果遠勝同一通道碰很多次
    //    （交錯練習 / desirable difficulty）。因此換遊戲不只是防無聊，
    //    它本身就是教學法 —— 這也是「一站要涵蓋三種通道」的由來。
    const GAME_CHANNELS = {
        // 語感記憶：整句節奏與詞序
        1: '語感', 4: '語感', 20: '語感', 31: '語感',
        // 字序記憶：逐字精確順序
        14: '字序', 37: '字序', 3: '字序', 16: '字序',
        // 空間記憶：字的位置與路徑
        8: '空間', 22: '空間', 9: '空間', 11: '空間', 12: '空間',
        // 背景知識記憶：作者、朝代、詩名
        13: '背景', 33: '背景',
        // 推理提取：跨回合演繹
        40: '推理'
    };

    // ── 移出必通關卡的三款（企畫書 8.4，作者決議）──────────────────────
    // 這三款未接 getSharedRandomPoem，各自實作選詩邏輯，
    // 無法保證「同一關 = 同一首詩」，因此不列入考試資格的計算。
    // 它們**完整保留**，仍會出現在複習與漢堡選單的自由練習中。
    // ⚠️ game33「作者是誰」2026-09 已改接 getSharedRandomPoem（見 game33.js
    //    prepareChallenge），移出此名單，納入必通關卡與考試（examConfig.js）。
    const REVIEW_ONLY_GAMES = { 21: true, 23: true, 36: true };

    // 長題目遊戲（整首詩）：認知負荷重，不連續出現兩次（企畫書 10.2）
    const LONG_GAMES = { 3: true, 9: true, 14: true, 22: true, 37: true, 21: true, 23: true };

    // 青雲梯會碰到的 19 款遊戲的顯示名稱
    // ⚠️ 這張表不只用來顯示：launchGame 靠 Object.keys(GAME_NAMES) 逐一
    //    關掉「還開著的其他青雲梯遊戲」。少列一款，那一款的 overlay 就
    //    永遠不會被關掉，玩家會同時看到兩層遊戲畫面
    //    （2026-09 實測：game16 因漏列而發生）。
    //    只要是青雲梯可能派出或列在 GAME_CHANNELS 裡的遊戲，都必須在這裡有名字。
    const GAME_NAMES = {
        1: '慢思快選', 3: '字爬梯', 4: '眾裡尋他', 8: '一筆裁詩',
        9: '詩韻鎖扣', 11: '翻墨識蹤', 12: '疏影橫斜', 13: '人事時地',
        14: '步步驚心', 16: '打地詩', 20: '丟三落一', 21: '橫批成詩',
        22: '詩詞拼圖', 23: '縱橫集句', 31: '詩眼覓蹤', 33: '作者是誰',
        36: '轉輪覓詩', 37: '步步為陣', 40: '點兵成詩'
    };

    // ── 通道出現權重（作者定案）─────────────────────────────────────────
    // 語感 : 字序 : 空間 : 背景 : 推理 = 12 : 3 : 3 : 1 : 1
    //
    // 用意是讓玩家仍有機會碰到各種類型的遊戲，但把大部分局數留給「語感」——
    // 語感題型的變化度最高，字序類（如步步驚心）題型變化小，出太多會膩。
    //
    // ⚠️ 權重只在「該文位已解鎖的通道」之間分配。書僮只有語感/字序/空間，
    //    因此在那一站實際上是 12:3:3。等蒙童解鎖推理、童生解鎖背景之後，
    //    比例才會逐步逼近上面的設定值。
    const CHANNEL_WEIGHTS = {
        '語感': 12, '字序': 3, '空間': 3, '背景': 1, '推理': 1
    };

    // 一站的十幾局整體至少要涵蓋幾種通道
    const MIN_CHANNELS_PER_STATION = 3;

    // 站尾保留幾局做「刻意補缺」：進入最後這幾局時若通道種類還不足，
    // 就不再依權重隨機，改成指定挑還沒出現過的通道。
    const DELIBERATE_TAIL_ROUNDS = 3;

    // ── 遊戲切換規則的參數（企畫書 10.2）───────────────────────────────
    const MAX_SAME_GAME_STREAK = 3;   // 同一款遊戲最多連續幾局
    const RECENT_WINDOW = 5;          // 排除最近幾局出現過的（單元 × 遊戲）組合

    // ── 捐納跳關（企畫書 8.3）──────────────────────────────────────────
    // 積分原本是軟性門檻，卡住也能刷過去；改為硬性關卡後就是硬牆了。
    // 現成的例子：game37 研究所 minChars:40 配 4 句在題庫中數學上無解。
    // 因此逃生口是必需品，不是加值功能。
    const SKIP_FAIL_THRESHOLD = 3;    // 同一關卡失敗幾次後開放捐納
    const SKIP_FEE_BY_TIER = {        // 捐納費用（文錢），隨難度層遞增
        '小學': 60, '中學': 180, '高中': 300, '大學': 600, '研究所': 900
    };

    // 版面常數
    // ⚠️ 站距從 92 加大到 120：站點文字多了一行「詩名小按鈕」（見
    //    buildPoemChips），整塊文字高度約 97px，用舊的 92 會讓相鄰兩站
    //    的文字直接疊在一起。道路因此變長約兩成，但那只是多捲一點。
    const SPACING = 120;  // 每一站的垂直間距

    // 詩名小按鈕的版面常數（buildPoemChips 用來回推字級，必須與
    // learningPath.css 的 .lp-poem-chip / .lp-poem-chips 規則一致）
    const TRACK_W = 500;        // 道路寬度，與 .lp-track 的 width 相同
    const STATION_GAP = 10;     // .lp-station 的 gap（圖示與文字之間）
    const ICON_HALF_RANK = 32;  // 文位站圖示寬度的一半（64px，已含邊框）
    const ICON_HALF_MINOR = 22; // 小站圖示寬度的一半（44px，已含邊框）
    const CHIP_SAFE_PAD = 2;    // 貼邊安全距離，避免剛好卡在道路邊緣
    const CHIP_FS_MAX = 18;     // 字級上限（與副標 --lp-fs-xs 同級）
    // ⚠️ 下限是「排不下時才會用到的緊急值」，不是常態。
    //    圖示錨在道路曲線上之後，文字只能往單邊展開，落在曲線正中央
    //    （x≈250）的站點兩側各只剩約 206px；那幾站若硬守 16px 就會換行，
    //    而換行會讓文字高度超過站距、直接撞上相鄰的站 —— 字小一點
    //    遠比兩站文字疊在一起好。絕大多數站點仍會拿到滿的 18px。
    const CHIP_FS_MIN = 12;
    // ⚠️ 內距與間距要隨按鈕數量縮小，否則「殼」會把「內容」擠掉：
    //    七顆按鈕在寬鬆規格下，光是內距與 gap 就吃掉 108px，佔最窄站點
    //    可用寬度的一半，字級被迫壓到下限仍排不進一行。
    //    收緊到 2px 內距、2px gap 之後同樣七顆只剩 54px。
    const CHIP_STYLE_BY_COUNT = [
        { max: 4, padX: 5, gap: 4 },        // 1~4 顆：寬鬆
        { max: 6, padX: 3, gap: 2 },        // 5~6 顆：收緊
        { max: Infinity, padX: 2, gap: 2 }  // 7 顆以上：最緊
    ];
    const AMP = 196;       // 蜿蜒路徑的左右擺幅
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
        _sameGameStreak: 0,
        _pendingUnit: null,   // 上一次派出去、尚未確認通過的關卡
        _currentStation: null,// 玩家目前正在闖的那一站
        _patched: null,       // { no, original } —— 被覆寫 startNextLevel 的遊戲
        _reviewMode: false,   // 目前是否在溫習舊文位（不累計局數）
        _examPrompted: null,  // 已經跳過「可赴科場」提示的文位（僅本工作階段）
        _stationIdxAtLaunch: -1, // 開局當下的站點索引，用來偵測「這一局讓玩家晉升了」
        _navLockedGameNo: null, // 目前被鎖住「難度標籤／開新局」鈕的遊戲編號

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
         * 建立「題目單元 → 已用哪幾款遊戲通過」對照表。
         *
         * ⚠️ 記錄的是**遊戲**不是通道。
         *    通道種類的保證在「站」的層級（一站十幾局要涵蓋 3 種通道，
         *    見 pickGame 的站尾補缺規則）；單元層級要管的是別讓同樣的
         *    兩句話用同一款遊戲重複玩 —— 第二次就沒有難度了。
         *
         * ⚠️ 一定要快取：計算已學首數需走訪 346 首詩約 970 個單元，
         *    若每一個都呼叫 loadPlayerData（會 JSON.parse 整份存檔），
         *    光是開啟青雲梯就要解析近千次存檔。這裡改成整份只讀一次。
         *
         * ⚠️ 只採計列入必通關卡的遊戲；REVIEW_ONLY_GAMES 名單上的那幾款
         *    無法保證「同一關 = 同一首詩」，因此它們的通關紀錄不計入進度。
         *    （名單本身以 REVIEW_ONLY_GAMES 為準，此處刻意不再抄一份編號，
         *      以免像 2026-09 那次把 33 移出名單後註解卻沒跟著改。）
         */
        buildProgressCache: function () {
            if (this._progressCache) return this._progressCache;
            const data = (window.ScoreManager && window.ScoreManager.loadPlayerData()) || {};
            this._progressCache = this.buildProgressMapsFrom(data.levelCleared, data.levelDonated);
            return this._progressCache;
        },

        /**
         * 由「原始的通關／捐納紀錄」建出進度對照表。
         *
         * ⚠️ 這一段本來寫死在 buildProgressCache 裡直接讀本機存檔。抽出來的
         *    理由是群英榜的「文位榜」要替**別人**算文位：那些玩家的紀錄來自
         *    雲端 player_saves（achievements._levelCleared / _levelDonated），
         *    不在 localStorage 裡。若讓群英榜自己抄一份判定邏輯，
         *    「幾款遊戲算學會一關」「哪幾款不列入進度」就會出現第二份定義，
         *    兩邊一旦飄移，玩家看到的自己的文位與榜上的文位就會不一樣。
         *
         * ⚠️ 兩份輸入都可能是**新舊混雜**的：
         *    · 新格式＝穩定識別碼字串 "錨定詩id:起始句"（例如 "69:4"）
         *    · 舊格式＝關卡編號數字（＝關卡表的陣列位置）
         *    本機存檔會在 ScoreManager.loadPlayerData 就地遷移，但群英榜讀到的
         *    是**別人**的雲端存檔，那些人可能還沒開過新版。因此這裡一律先正規化
         *    成穩定識別碼再建表，兩種格式都吃得下。
         *    （舊格式的換算只有在關卡表還沒被新詩打亂之前才正確 ——
         *      這正是遷移必須趕在下次擴充題庫之前上線的原因，
         *      詳見 levelTable.js 的「穩定關卡識別碼」段落。）
         *
         * @param {object} levelCleared  {gameKey: {難度層: [關卡參照…]}}
         * @param {object} levelDonated  {難度層: [關卡參照…]}
         * @returns {{games:Object, donated:Object}}
         */
        buildProgressMapsFrom: function (levelCleared, levelDonated) {
            const map = {};
            const donated = {};
            const LT = window.LevelTable;
            const norm = (tier, ref) => {
                if (LT && typeof LT.toLevelKey === 'function') {
                    const k = LT.toLevelKey(tier, ref);
                    if (k !== null) return k;
                }
                return String(ref);
            };
            const lc = levelCleared || {};
            for (const gameKey in lc) {
                const no = parseInt(String(gameKey).replace('game', ''), 10);
                if (!GAME_CHANNELS[no] || REVIEW_ONLY_GAMES[no]) continue;
                const byTier = lc[gameKey] || {};
                for (const tier in byTier) {
                    const arr = byTier[tier];
                    if (!Array.isArray(arr)) continue;
                    for (let i = 0; i < arr.length; i++) {
                        const k = tier + '|' + norm(tier, arr[i]);
                        if (!map[k]) map[k] = {};
                        map[k][no] = true;
                    }
                }
            }
            const ld = levelDonated || {};
            for (const tier in ld) {
                const arr = ld[tier];
                if (!Array.isArray(arr)) continue;
                for (let i = 0; i < arr.length; i++) donated[tier + '|' + norm(tier, arr[i])] = true;
            }
            return { games: map, donated: donated };
        },

        /**
         * 站點的必通關卡（{tier, level}）→ 進度表的鍵值。
         * 站點是由關卡表即時算出來的，所以這裡拿到的一定是「目前的」關卡編號；
         * 進度表則一律以穩定識別碼為鍵，因此必須換算後才能比對。
         */
        _unitKey: function (tier, level) {
            const LT = window.LevelTable;
            if (LT && typeof LT.toLevelKey === 'function') {
                const k = LT.toLevelKey(tier, level);
                if (k !== null) return tier + '|' + k;
            }
            return tier + '|' + level;
        },

        /** 存檔可能已變動（通關、捐納）時呼叫，下次讀取會重建 */
        invalidateProgress: function () {
            this._progressCache = null;
        },

        /**
         * 取得某個題目單元已經用哪幾款遊戲通過了。
         * @returns {Object} 以遊戲編號為 key 的集合（用物件模擬 Set，相容舊瀏覽器）
         */
        getLevelGames: function (tier, level) {
            const c = this.buildProgressCache();
            return c.games[this._unitKey(tier, level)] || {};
        },

        /** 這個題目單元已完成的局數（已用幾款不同遊戲通過） */
        getUnitPlays: function (tier, level) {
            return Object.keys(this.getLevelGames(tier, level)).length;
        },

        /** 這個題目單元是否已完成（已用三款不同遊戲通過，或已捐納跳過） */
        isUnitDone: function (unit) {
            return this.isUnitDoneIn(this.buildProgressCache(), unit);
        },

        /** isUnitDone 的「指定進度表」版本，供替別人（雲端存檔）計算時使用 */
        isUnitDoneIn: function (maps, unit) {
            if (!maps || !unit) return false;
            const k = this._unitKey(unit.tier, unit.level);
            if (maps.donated[k]) return true;
            const need = window.PathStations
                ? window.PathStations.getPlaysPerUnit() : 3;
            return Object.keys(maps.games[k] || {}).length >= need;
        },

        /**
         * 這一站目前的局數進度與「已經出現過哪些通道」。
         *
         * 這是站尾補缺規則的依據：一站的十幾局整體要涵蓋至少 3 種通道，
         * 因此必須知道還剩幾局、以及目前湊到幾種通道。
         * 完全由既有存檔推導，不需要新增任何欄位。
         *
         * @returns {{done:number, total:number, channels:Object}}
         */
        getStationRounds: function (station) {
            const units = (station && station.units) || [];
            const per = window.PathStations
                ? window.PathStations.getPlaysPerUnit() : 3;
            const cache = this.buildProgressCache();
            let done = 0;
            const channels = {};
            units.forEach(u => {
                // 捐納跳關的單元沒有實際遊玩，但要算進「這一站已推進多少」
                if (cache.donated[this._unitKey(u.tier, u.level)]) { done += per; return; }
                const games = this.getLevelGames(u.tier, u.level);
                const keys = Object.keys(games);
                // ⚠️ 同一單元的「已完成局數」必須夾在 per（3 局）以內。
                //    玩家在整站通關後仍可繼續複習（pickUnit 會改從全部單元
                //    隨機挑），一個單元因此可能累積到四、五款遊戲的紀錄；
                //    若照實累加，done 會超過 total，下面的 left（= total − done）
                //    變成負數，於是 pickGame 的「站尾補缺」條件 left <= 3
                //    會永遠成立 —— 整站從此不再依 12:3:3:1:1 權重挑通道，
                //    而是一直在補那些權重最低的通道。
                done += Math.min(per, keys.length);
                keys.forEach(no => {
                    const ch = GAME_CHANNELS[no];
                    if (ch) channels[ch] = true;
                });
            });
            return { done: done, total: units.length * per, channels: channels };
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
            const idx = this.getCurrentStationIndex();
            const cur = stations[idx];
            const next = stations[idx + 1];
            if (!cur || !next) return empty;   // 已經是最後一站（大儒）

            const per = PS.getPlaysPerUnit();
            let done = 0;
            (cur.units || []).forEach(u => {
                if (window.ScoreManager && window.ScoreManager.isLevelDonated(u.tier, u.level)) {
                    done += per;
                    return;
                }
                done += Math.min(per, this.getUnitPlays(u.tier, u.level));
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
         * 玩家已學會（⭑⭑ 熟練）幾首詩 —— **全部**，不論在哪裡學的。
         * 判定：該詩的所有必通關卡皆已用三種提取方式通過。
         *
         * ⚠️ 這個數字**不可以**拿去定位青雲梯站點，請改用 getPathPoemCount()。
         *    理由見該函式的說明。這裡只適合用來顯示「已學詩詞 N / 總數」，
         *    因為玩家在漢堡選單自由練習裡學會的詩，確實也是學會了。
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
         * 青雲梯的「課程進度」：依學習順序**從第一首起連續**學會了幾首。
         *
         * ⚠️⚠️ 這支函式存在的理由，是修正一個會讓玩家整站被跳過的嚴重錯誤。
         *
         *    站點定位靠的是 PathStations.getCurrentIndex(n)，而它的判斷是
         *    「n >= 該站的 poemFrom 就算已抵達」——這句話只有在
         *    **「這 n 首正好就是學習順序的前 n 首」** 時才成立。
         *
         *    但 getLearnedPoemCount() 數的是「總共學會幾首」，不管在哪學的：
         *    漢堡選單的自由練習、溫習模式，用的是同一套 levelCleared 紀錄
         *    （只認「難度層＋關卡編號」，完全不記錄屬於青雲梯哪一站）。
         *    於是玩家只要在自由練習裡打到後段的詩，總數就會灌水，
         *    站點跟著往前跳，中間那幾站明明一關都沒打過卻顯示「已完成」。
         *
         *    實測重現：只完成學習順序第 1~16 首與第 30~33 首（中間跳號），
         *    getLearnedPoemCount() 得到 20，站點就跳到「塾生三階」，
         *    而「塾生」與「塾生二階」兩站合計 12 個必通關卡一個都沒做。
         *    這正是玩家回報的「考完塾生，塾生二階卻自己變成已完成」。
         *
         *    改用「依序連續」計數後，沒學完的站絕對不會被跳過；
         *    亂序學到的詩仍然照樣計入 getLearnedPoemCount() 的顯示數字，
         *    只是不會再推動課程進度——課程本來就該一站一站走。
         *
         * @returns {number} 依學習順序連續完成的首數
         */
        getPathPoemCount: function () {
            return this.pathPoemCountFrom(this.buildProgressCache());
        },

        /** getPathPoemCount 的「指定進度表」版本，供替別人（雲端存檔）計算時使用 */
        pathPoemCountFrom: function (maps) {
            if (!window.PathStations) return 0;
            const list = window.PathStations.getPoemUnits();
            let n = 0;
            for (let i = 0; i < list.length; i++) {
                const units = list[i].units;
                // 沒有必通關卡的詩不擋路（也不計分），直接跳過繼續往下數
                if (!units.length) continue;
                let all = true;
                for (let k = 0; k < units.length; k++) {
                    if (!this.isUnitDoneIn(maps, units[k])) { all = false; break; }
                }
                if (!all) break;      // ← 與 getLearnedPoemCount 唯一的差別
                n++;
            }
            return n;
        },

        /**
         * 由一份「雲端存檔列」推算該玩家的文位。
         *
         * 這是 ScoreManager.getEffectiveRank 的「別人版」：判定規則一模一樣
         * （考試通過紀錄優先，沒考過就看青雲梯站點進度並封頂在最後一個免考
         * 文位），差別只在資料來源 —— getEffectiveRank 讀本機 localStorage
         * 與 FMCollectionSave，這一支讀傳進來的 player_saves 欄位。
         *
         * ⚠️ 群英榜的「文位榜」一定要走這裡，**不可以**改用 row.global_rank。
         *    global_rank 存的是**積分階級**（getCurrentRank(totalScore)），
         *    名稱與文位完全同名（書僮…大儒）卻是另一套判準，直接拿來當文位
         *    顯示，等於在排行榜上公告「刷分就能升文位」——與企劃書 §2 相反。
         *
         * @param {object} row player_saves 的一列，需含 collection 與
         *                     achievements（內含 _levelCleared / _levelDonated）
         * @returns {string} 文位名稱；資料不足時回傳第一個文位
         */
        getRankFromSave: function (row) {
            const PS = window.PathStations;
            const first = (PS && PS.getAllRankNames && PS.getAllRankNames()[0]) || '書僮';
            if (!row || !PS) return first;

            // 1. 已通過的考試文位優先，由高到低取第一個命中的
            try {
                const coll = row.collection || {};
                const passed = (coll.ranks && coll.ranks.passed) || [];
                const examNames = PS.getExamRankNames();
                for (let i = examNames.length - 1; i >= 0; i--) {
                    if (passed.indexOf(examNames[i]) >= 0) return examNames[i];
                }
            } catch (e) { /* 欄位缺漏視為沒考過，往下走站點推算 */ }

            // 2. 沒考過任何文位 → 看青雲梯站點進度，封頂在最後一個免考文位
            try {
                const ach = row.achievements || {};
                const maps = this.buildProgressMapsFrom(ach._levelCleared, ach._levelDonated);
                const stations = PS.build();
                const idx = PS.getCurrentIndex(this.pathPoemCountFrom(maps));
                const st = stations[Math.max(0, Math.min(idx, stations.length - 1))];
                if (st && st.rankName) {
                    const freeNames = PS.getFreeRankNames();
                    if (freeNames.indexOf(st.rankName) >= 0) return st.rankName;
                    // 站點已走到需應試的文位但還沒考 → 顯示最後一個免考文位
                    return freeNames[freeNames.length - 1] || first;
                }
            } catch (e) {
                console.warn('[LearningPath] 由雲端存檔推算文位失敗:', e);
            }
            return first;
        },

        /**
         * 目前所在的站點索引 —— 全站定位的唯一收口。
         *
         * ⚠️ 請一律呼叫這一支，不要自己寫
         *    `PathStations.getCurrentIndex(getLearnedPoemCount())`。
         *    那個寫法正是上面 getPathPoemCount() 說明中的那個錯誤，
         *    本檔曾在六處各寫一遍，只要漏改一處就會再度出現跳站。
         */
        getCurrentStationIndex: function () {
            if (!window.PathStations) return 0;
            const byPoems = window.PathStations.getCurrentIndex(this.getPathPoemCount());
            return Math.min(byPoems, this.getExamGateIndex());
        },

        /**
         * 考試關卡：站點推進的上限索引。
         *
         * ── 規則（作者 2026-09-05 定案）────────────────────────────────
         *   抵達文位站  ＝ 入學，開始修這個文位自己的課程（**還沒有應試資格**）
         *   修完文位站的課程 ＝ 取得應試資格
         *   通過考試    ＝ 冊封（獎狀＋文位獎勵），並得以進入下一階課程
         *
         * 因此「第一個尚未通過考試的應試文位站」就是玩家能走到的最遠處：
         * 詩學得再多也不會越過它，必須先把那一場考試考過。
         *
         * ⚠️ 為什麼一定要有這道關卡：少了它，玩家可以一路走完全部 77 站
         *    抵達大儒，**文位卻始終停在「蒙童」**（實測如此）——
         *    文位就不再代表進度，「越級考試」這條路也失去存在的理由。
         *
         * ⚠️ 這不會造成死鎖：正式考沒有次數限制（只收文錢），文錢可以靠
         *    漢堡選單的自由練習賺；卡在關卡站時該站的必通關卡也還能反覆重打
         *    （pickUnit 在整站通關後會改為隨機重抽），模擬考則每日免費一次。
         *
         * @returns {number} 上限索引；全部考過（或考試模組未載入）時回無限大
         */
        getExamGateIndex: function () {
            const PS = window.PathStations;
            const EC = window.FMExamConfig;
            if (!PS || !EC) return Infinity;
            let coll = null;
            try { coll = window.FMCollectionSave && window.FMCollectionSave.load(); }
            catch (e) { coll = null; }
            if (!coll) return Infinity;

            const stations = PS.build();
            for (let i = 0; i < stations.length; i++) {
                const st = stations[i];
                // ⚠️ 2026-09-06 起「有考試的站」不只文位站：每累積約 12 首詩
                //    就有一場小考，兩種考試都是硬性關卡。
                if (st.examKind && !EC.isExamPassed(coll, st)) return i;
            }
            return Infinity;
        },

        /**
         * 玩家目前是不是「卡在考試關卡」——課程修完了、考試還沒過。
         * @returns {{blocked:boolean, station:object|null, qualified:boolean}}
         */
        getExamGateState: function () {
            const PS = window.PathStations;
            const empty = { blocked: false, station: null, qualified: false, kind: null };
            if (!PS) return empty;
            const gate = this.getExamGateIndex();
            if (!isFinite(gate)) return empty;
            const stations = PS.build();
            const st = stations[gate];
            if (!st) return empty;
            // 站點索引已經被壓在關卡上，代表詩已經學到（或超過）這一站
            const atGate = this.getCurrentStationIndex() === gate;
            const qualified = atGate && this.getStationExamProgress(st).ok;
            return { blocked: atGate, station: st, qualified: qualified, kind: st.examKind };
        },

        /**
         * 某文位的「考試資格」進度（企畫書 9.4 第一步）。
         *
         * 資格 = 學習序列中「**修完該文位站自己的課程**」之前的所有詩，
         *        其必通關卡全數完成 —— 也就是該文位站的 poemTo。
         *
         * ⚠️⚠️ 這裡的分母**不是**該文位的里程碑首數（＝該站的 poemFrom）。
         *    兩者差了整整一站：里程碑首數代表「剛踏進這個文位站、課程一關
         *    都還沒打」的那一刻。作者 2026-09-05 定案的規則是：
         *
         *        抵達文位站      ＝ 入學（開始修這個文位的課程）
         *        修完文位站課程  ＝ 取得應試資格      ← 就是這裡
         *        通過考試        ＝ 冊封
         *
         *    用里程碑首數會讓玩家在「一關都還沒修」時就被通知可以應試。
         *    更嚴重的是考試範圍（FMExamConfig.getScopeStations）**本來就包含
         *    文位站自己的詩**，於是考卷上會有一大部分是還沒學過的內容 ——
         *    實測 13 個文位中有 9 個「就算學過的每一題全對也到不了及格線」
         *    （縣案首：及格 15/18，學過的最多只能對 12 題）。
         *    改用 poemTo 之後，13 個文位的考試範圍全部落在已學範圍內。
         *
         * ⚠️ 這取代了舊制的「積分達標」。積分可以靠反覆刷低難度遊戲累積，
         *    完全不代表學會了詩詞，正是當初加考試制度要防的事。
         *
         * @returns {{ok:boolean, poemsDone:number, poemsNeed:number,
         *            unitsDone:number, unitsTotal:number}}
         */
        getRankExamProgress: function (rankName) {
            const PS = window.PathStations;
            if (!PS) return { ok: false, poemsDone: 0, poemsNeed: 0, unitsDone: 0, unitsTotal: 0 };
            return this.getStationExamProgress(PS.getStationByName(rankName));
        },

        /**
         * 某一站的「考試資格」進度。
         *
         * 資格 ＝ 修完**這一站自己的**課程（該站的 poemTo 之前全部學會）。
         * 文位考與小考共用同一條規則。
         *
         * @param {object} station 站點物件
         * @returns {{ok:boolean, poemsDone:number, poemsNeed:number,
         *            unitsDone:number, unitsTotal:number}}
         */
        getStationExamProgress: function (station) {
            const empty = { ok: false, poemsDone: 0, poemsNeed: 0, unitsDone: 0, unitsTotal: 0 };
            const PS = window.PathStations;
            if (!PS || !station) return empty;
            const need = station.poemTo;
            if (typeof need !== 'number' || need < 0) return empty;
            const m = { poems: need };

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

        // ── 文錢與積分：一律委派給全站唯一的讀取收口（gameContract.js）──
        //
        // ⚠️ 2026-09-11 收口。改版前同樣的兩段邏輯在
        //    `collection.js`（getCurrentScore，且是死程式碼）與這裡各有一份，
        //    欄位名稱一旦改動就得四處找齊。保留這兩支具名入口是為了
        //    不動既有呼叫端（#lpSilver 的顯示、報名費餘額判斷）。

        /** 取得文錢（存放於收集系統的存檔中） */
        getSilver: function () {
            return window.FMGame ? window.FMGame.getSilver() : 0;
        },

        /** 取得總積分（僅供顯示與排行榜，不參與任何進度判定） */
        getTotalScore: function () {
            return window.FMGame ? window.FMGame.getScore() : 0;
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
                    <div class="lp-progress-row">
                        <div class="lp-progress-text" id="lpProgText"></div>
                        <button class="pc-entry-btn" id="lpBtnCalendar" title="遊戲日曆" aria-label="遊戲日曆">
                            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                                <rect x="3" y="5" width="18" height="16" rx="2.5"
                                      fill="none" stroke="currentColor" stroke-width="2"/>
                                <path d="M3 10 H21 M8 3 V7 M16 3 V7"
                                      fill="none" stroke="currentColor" stroke-width="2"
                                      stroke-linecap="round"/>
                                <rect x="7" y="13" width="3.2" height="3.2" fill="currentColor"/>
                                <rect x="13.8" y="13" width="3.2" height="3.2" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
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

            // 遊戲日曆入口（playerCalendar.js）
            // ⚠️ 每次開啟前先清快取：玩家通常是剛打完幾局才來看日曆，
            //    若沿用 60 秒內的舊資料，剛才那幾局不會出現，看起來像壞掉。
            overlay.querySelector('#lpBtnCalendar').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (!window.PlayerCalendar) return;
                window.PlayerCalendar.clearCache();
                window.PlayerCalendar.show();
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
            // ⚠️ 必須排在 checkPendingUnit() 之後：那一支會把 _pendingUnit 收掉，
            //    守門才算得出「已經回到地圖、沒有課程局在進行」。
            this.updateSessionGuard();
            this.render();
            this.overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            document.body.classList.add('overlay-active');
            // ⚠️ 開機時 menu.js 會在 DOMContentLoaded 當下就呼叫這裡
            // （見「花月開發常見錯誤與解法」§showHomeOnBoot），這是版面最
            //    不穩定的時間點：learningPath.css 是這裡（init()）才動態插入
            //    的，插入當下瀏覽器連抓都還沒抓，往後究竟哪一輪才套用完成
            //    無法預測——實測發現只靠「立刻捲一次＋rAF 補一次」仍然會
            //    賭輸：兩次都讀到還沒套用 CSS 的 #lpScroll（此時它連
            //    overflow-y:auto 都還沒生效，等於不能捲，scrollTop 設了也
            //    會被夾回 0），新玩家因此停在最上方的「大儒」而不是自己該
            //    在的「書僮」。且套用完成後**沒有任何東西會再補捲一次**，
            //    於是就這樣定住了。
            //    改成連續補捲好幾輪（立刻＋三次 rAF 疊加，涵蓋「版面要兩三
            //    輪 reflow 才穩定」的情形）＋ 一個 300ms 的保底 setTimeout
            //    （涵蓋 CSS 檔案真的要走一趟網路請求才回來的極端情形）。
            //    不能只用 setTimeout 取代 rAF：分頁在背景時 rAF 會暫停，
            //    但 setTimeout 不會，兩者搭配才兼顧「開面板當下多半在前景
            //    要盡快捲到位」與「萬一真的卡很久也要有保底」。
            const self = this;
            const refix = function () { self.scrollToCurrent(false); };
            refix();
            requestAnimationFrame(function () {
                refix();
                requestAnimationFrame(function () {
                    refix();
                    requestAnimationFrame(refix);
                });
            });
            setTimeout(refix, 300);
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
            // 離開青雲梯就不該再鎖著漢堡選單（否則玩家永遠回不了首頁）
            this._pendingUnit = null;
            this.updateSessionGuard();
            this._currentStation = null;
            this._reviewMode = false;
            // 離開青雲梯就解除候選詩白名單，避免殘留影響漢堡選單的自由練習
            if (window.LevelTable && typeof window.LevelTable.clearAllowedPoemIds === 'function') {
                window.LevelTable.clearAllowedPoemIds();
            }
            // ⚠️⚠️ 關卡情境也必須一起清（2026-09 亂序模擬抓到）：
            //    舊版只清白名單，`LevelTable.getContext()` 會一路停在
            //    青雲梯最後派出的那一關，離開之後仍然掛著。而
            //    **「有沒有情境」正是全站用來判斷「這一局算不算晉升局」的依據**：
            //      · supabaseClient.logGame 用它決定 game_logs 的 is_ranked
            //        → 之後在漢堡選單玩的自由練習會被記成晉升局（雲端資料污染）
            //      · scoreManager.js 的 FMRoundLabel 用它決定要不要顯示「第 X 局」
            //        → 自由練習的難度標籤會冒出局號
            //      · script.js 的 getSharedRandomPoem 會依情境限縮選詩範圍
            //    difficulty-selector 進入隨機練習前雖然也會 clearContext()，
            //    但那只擋得住「有經過難度選單」的路徑，擋不住上面那兩個
            //    直接讀情境的地方。清除的正確位置就是這裡 ——
            //    與白名單同一個「玩家真的離開青雲梯了」的時機。
            if (window.LevelTable && typeof window.LevelTable.clearContext === 'function') {
                window.LevelTable.clearContext();
            }
            if (window.ScoreManager && window.ScoreManager.setReviewMode) {
                window.ScoreManager.setReviewMode(false);
            }
            // ⚠️ 晉升動畫（PromotionCelebration）跟結算動畫是同一種洞：離開
            // 青雲梯時若晉升動畫還在播（rAF＋setTimeout 鏈可以長達 9 秒以上），
            // 它會繼續在背景播完、彈出獎狀蓋在別的畫面上。stop(true) 連內部的
            // onDone 一起清掉，不會再回頭呼叫任何回呼。
            if (window.PromotionCelebration && typeof window.PromotionCelebration.stop === 'function') {
                window.PromotionCelebration.stop(true);
            }
            if (window.AchievementDialog && typeof window.AchievementDialog.forceCloseCert === 'function') {
                window.AchievementDialog.forceCloseCert();
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
            // ⚠️ 這裡就是「課程局結束」的那一刻，守門必須在這裡重算 ——
            //    不能只放在 show() 裡。亂序模擬抓到過：任何只呼叫
            //    checkPendingUnit() 而沒走 show() 的路徑（例如玩家中途
            //    直接關掉遊戲），漢堡選單會永遠停在鎖定狀態，
            //    玩家再也回不了首頁。把更新綁在狀態改變的那一行，
            //    就不可能有「改了狀態卻忘了更新守門」的路徑。
            this.updateSessionGuard();
            if (!u || !window.ScoreManager) return;
            // 這個單元的通關遊戲集合沒有增加，視為這一次沒過
            const nowCount = this.getUnitPlays(u.tier, u.level);
            if (nowCount <= u.playsBefore) {
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
            // 補發「已抵達但沒經過晉升彈窗」的站點文錢（冪等，見該函式說明）
            this.settleArrivedRewards();
            // ⚠️ learned（總學會首數）只拿來顯示，站點定位一律走
            //    getCurrentStationIndex()——兩者的差別見 getPathPoemCount()。
            const learned = this.getLearnedPoemCount();
            const currentIdx = this.getCurrentStationIndex();

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
            const gateNow = this.getExamGateState();
            const gateBlockedQualified = gateNow.blocked && gateNow.qualified;
            const gateStationName = gateNow.station ? gateNow.station.name : '';
            const pct = prom.total ? Math.min(100, prom.done / prom.total * 100) : 100;
            const progText = this.overlay.querySelector('#lpProgText');
            const progFill = this.overlay.querySelector('#lpProgFill');
            if (gateBlockedQualified) {
                // 課程修完、卡在考試 —— 進度條滿格但站點不會動，必須明講，
                // 否則玩家會盯著滿格的條子疑惑為什麼沒有前進。
                progText.textContent = `「${gateStationName}」課程已修畢 —— `
                    + (gateNow.kind === 'minor' ? '通過小考方可續進' : '中式方可續進');
            } else if (prom.nextName && prom.total) {
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

            // 已通過考試的文位清單，用來判斷考試站要不要掛「可應試」標記。
            // ⚠️ 在迴圈外先取一次：這是讀存檔的操作，放進 forEach 會被
            //    每個站點各讀一遍（站點有近百個）。
            const coll = (function () {
                try { return window.FMCollectionSave && window.FMCollectionSave.load(); }
                catch (e) { return null; }
            })();
            const passedRanks = (coll && coll.ranks && coll.ranks.passed) || [];

            // ── 唯一一個「可應試」的站（規則第二步）──────────────────────
            // ⚠️ 以前是 `st.isExam && i <= currentIdx && 尚未通過`，也就是
            //    「抵達即可應試」。新規則下抵達只是入學，必須修完這一站自己的
            //    課程才有資格，因此改以 getRankExamProgress() 為準。
            // ⚠️ 考試會擋路（getExamGateIndex），所以站點索引之前的應試文位
            //    必定都已通過，可應試的站最多只有一個 —— 在迴圈外算一次就好，
            //    避免對近百個站點各跑一次 getRankExamProgress（那要走訪整份題庫）。
            const gateState = this.getExamGateState();
            const examReadyIdx = (gateState.blocked && gateState.qualified)
                ? this.getExamGateIndex() : -1;

            // 今日的模擬考次數是否已用完（每日 5 次，見 FMExamConfig.EXAM_DAILY_LIMITS）。
            // 只有可應試的那一站會畫模擬考鈕，算一次就夠。
            // ⚠️ 只做灰階區分，鈕仍要可以點——玩家點下去才會看到「今日已用完」
            //    的提示，直接 disabled 會讓那句提示永遠沒有機會顯示。
            const examReadySt = (examReadyIdx >= 0) ? this.stations[examReadyIdx] : null;
            const mockUsedToday = (examReadySt && examReadySt.examKind === 'rank' && window.FMExamConfig)
                ? !window.FMExamConfig.canAttemptToday(coll, 'mock', examReadySt.name)
                : false;

            this.stations.forEach((st, i) => {
                const x = 250 + Math.sin(i * 0.62) * AMP;
                // ⚠️ 由下往上：索引越大越靠近頂端
                const y = this.trackHeight - BOT_PAD - i * SPACING;

                const isDone = i < currentIdx;
                const isCurrent = i === currentIdx;
                const isLocked = i > currentIdx;

                // ── 第四態：可應試（企劃書 §7）────────────────────────
                // 條件是「已經走到這一站（或已走過）＋ 該文位還沒考過」。
                // ⚠️ 用 i <= currentIdx 而不是 i === currentIdx：青雲梯的
                //    站點推進只看已學詩詞數，考試並不擋路，所以玩家很可能
                //    已經走過頭好幾站、卻還沒回頭去考那個文位。這種情況下
                //    那一站仍然必須標示成「可應試」，否則玩家會找不到入口。
                const isExamReady = (i === examReadyIdx);

                const cls = ['lp-station'];
                cls.push(st.type === 'rank' ? 'lp-rank-station' : 'lp-minor-station');
                if (st.isExam) cls.push('lp-exam-station');
                if (st.examKind === 'minor') cls.push('lp-minor-exam-station');
                if (isDone) cls.push('lp-done');
                if (isCurrent) cls.push('lp-current');
                if (isLocked) cls.push('lp-locked');
                if (isExamReady) cls.push('lp-exam-ready');
                const labelRight = x <= 250;
                cls.push(labelRight ? 'lp-label-right' : 'lp-label-left');

                // 站點圖示：文位站用印章、考棚站用門樓、階站用圓點
                let icon;
                if (st.type === 'rank') icon = st.isExam ? '⛩' : '❖';
                else if (st.examKind === 'minor') icon = isDone ? '✓' : '◈';   // 有小考的小站
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
                    this.buildPoemChips(st, x) +
                    `</div>`;

                const iconHTML =
                    `<div class="lp-station-icon-wrap">` +
                    (isCurrent ? this.buildProgressRing(pct) : '') +
                    `<div class="lp-station-icon">${icon}</div>` +
                    // 「模擬考」與「正式考試」兩顆並排。
                    // ⚠️ 分成兩顆而不是一顆再跳選單：新玩家沒看過考試會慌，
                    //    模擬考必須一眼就看得到、而且看得出它是安全的，
                    //    藏在第二層選單裡等於沒有。
                    // ⚠️ 小考只有一顆鈕：它免報名費，本身就是「安全的練習」，
                    //    再給一顆模擬考只是多一層選擇障礙。
                    (isExamReady
                        ? (st.examKind === 'minor'
                            ? `<div class="lp-exam-badges">` +
                            `<div class="lp-exam-badge lp-exam-real" data-exam="real">小考</div>` +
                            `</div>`
                            : `<div class="lp-exam-badges">` +
                            `<div class="lp-exam-badge lp-exam-mock${mockUsedToday ? ' lp-exam-used' : ''}" data-exam="mock">模擬考</div>` +
                            `<div class="lp-exam-badge lp-exam-real" data-exam="real">正式考</div>` +
                            `</div>`)
                        : '') +
                    // ── 手指提示：長期存在的引導動畫 ─────────────────────
                    // ⚠️ 每次開啟青雲梯都會重繪，這顆手指就會跟著「目前所在站」
                    //    一起出現，不分新舊玩家——這正是企劃要的「長期存在」
                    //    而非只給新手看一次的簡介動畫。
                    // ⚠️ isExamReady 時不疊加：可應試的站已經有 .lp-exam-real
                    //    自己的脈動徽章，兩個一起跳只會互相搶焦點。
                    (isCurrent && !isExamReady
                        ? `<div class="lp-finger-hint">👆</div>`
                        : '') +
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

            // 詩名小按鈕：開啟該首詩的詩詞資料。
            // ⚠️ 必須 stopPropagation，否則會連帶觸發外層站點的 click，
            //    變成「想查詩卻直接開了一局遊戲」（與考試標記同一個坑）。
            track.querySelectorAll('.lp-poem-chip').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.hasDragged && this.hasDragged()) return;
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    const pid = parseInt(el.getAttribute('data-poem-id'), 10);
                    if (window.PoemDialog && typeof window.PoemDialog.openById === 'function') {
                        window.PoemDialog.openById(pid);
                    }
                });
            });

            // 「模擬考／正式考」標記本身就是按鈕。
            // ⚠️ 必須 stopPropagation：否則會連帶觸發外層站點的 click，
            //    變成「開了考試又同時開一局遊戲」。
            //    刻意不把整個站點的點擊都改成前往考試 —— 文位站本身也有
            //    詩詞要學（poemFrom~poemTo），玩家仍要能點進去練功。
            track.querySelectorAll('.lp-exam-badge').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (this.hasDragged && this.hasDragged()) return;
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    const stEl = el.closest('.lp-station');
                    const idx = stEl ? parseInt(stEl.getAttribute('data-idx'), 10) : -1;
                    const st = this.stations[idx];
                    if (!st) return;
                    this.startExam(st.name, el.getAttribute('data-exam') === 'mock' ? 'mock' : 'real');
                });
            });
        },

        /**
         * 站點副標下方的「詩名小按鈕」：這一站要學的每首詩各一顆，
         * 點下去開啟該首詩的詩詞資料（PoemDialog）。
         *
         * ⚠️ 為什麼要截字：站點文字掛在蜿蜒道路的左右兩側，寬度沒有容器可擋，
         *    一站最多有八首詩，完整詩名（〈黃鶴樓送孟浩然之廣陵〉）並排會
         *    直接衝出畫面。因此按鈕文字長度隨這一站的詩數遞減，讓整排字數
         *    大致維持在畫面容得下的 12~15 字：
         *      1~2 首 → 詩名前六個字   （2×6 ＝ 12 字）
         *      3   首 → 前四個字       （3×4 ＝ 12 字）
         *      4   首 → 前三個字       （4×3 ＝ 12 字）
         *      5~7 首 → 前兩個字       （最多 7×2 ＝ 14 字）
         *      8 首以上 → 只留第一個字 （8×1 ＝ 8 字）
         *    完整詩名放在 title 屬性，桌機滑鼠停留仍看得到。
         *
         * ⚠️⚠️ 可用寬度是**每一站各自不同**的，不可以用固定的 CSS
         *    max-width 打死。這個算法前後錯過兩次，兩次的教訓都留在這裡：
         *
         *    第一版：CSS 寫死 max-width: 236px。那是拿「擺幅兩端」的最壞
         *      情況去套所有站點，結果站在道路正中央、左右明明還很空的
         *      站點也被那個上限逼著換行。
         *
         *    第二版：改成 2 × min(x, 500 − x)。公式本身對「整個方塊以 x
         *      為中心」這個前提是對的，但那個前提本身就是錯的設計 ——
         *      方塊是不對稱的（一邊圖示、一邊一長條文字），置中的結果是
         *      圖示被文字推開（實測 ±151px），道路的正弦曲線被文字寬度
         *      扭曲，而且方塊整個擠到單邊、另一邊留下一大片空白。
         *
         *    現在：圖示錨在座標點上（CSS 的 --lp-icon-half，見 .lp-station），
         *    文字往「空間比較多」的那一側展開，可用寬度就是那一側的剩餘空間：
         *      · 文字在右（x ≤ 250）→ 500 − x − 半個圖示 − gap
         *      · 文字在左（x > 250）→ x − 半個圖示 − gap
         *    最寬出現在擺幅兩端（約 300px），最窄出現在曲線正中央
         *    （x≈250，約 206px）—— 與第二版的直覺正好相反。
         *
         * ⚠️ 字級因此是「依這一站的實際可用寬度回推」，不是查表：
         *    先照上面的規則決定字數，再算出「要排成一行，字級最多能多大」，
         *    夾在 CHIP_FS_MIN~CHIP_FS_MAX 之間。
         *
         * ⚠️ 這些按鈕必須自行 stopPropagation（在 renderTrack 綁事件時處理），
         *    否則點詩名會連帶觸發外層站點的 click 而直接開一局遊戲。
         *
         * @param {object} st build() 產出的站點物件
         * @param {number} x  這一站在道路上的水平座標（renderTrack 算好的）
         * @returns {string} HTML 字串；查不到詩就回空字串（不佔版面）
         */
        buildPoemChips: function (st, x) {
            const ids = (st && st.poemIds) || [];
            if (!ids.length) return '';
            if (typeof POEMS === 'undefined' || !POEMS.length) return '';

            // 依這一站的詩數決定每顆按鈕顯示幾個字（規則見上方說明）
            const n = ids.length;
            const keep = (n <= 2) ? 6
                : (n === 3) ? 4
                    : (n === 4) ? 3
                        : (n <= 7) ? 2
                            : 1;

            const chips = [];
            const shorts = [];
            for (let i = 0; i < ids.length; i++) {
                const pid = ids[i];
                let poem = null;
                for (let k = 0; k < POEMS.length; k++) {
                    if (POEMS[k].id === pid) { poem = POEMS[k]; break; }
                }
                if (!poem) continue;
                const full = poem.title || '無題';
                const short = full.slice(0, keep);
                shorts.push(short);
                chips.push(
                    `<span class="lp-poem-chip" data-poem-id="${pid}" title="${this.escAttr(full)}">` +
                    `${this.escAttr(short)}</span>`
                );
            }
            if (!chips.length) return '';

            // ── 這一站文字欄的可用寬度 ────────────────────────────────
            // 圖示錨在 x 上，文字往空間較多的那一側展開；
            // 側邊的判定必須與 renderTrack 的 labelRight 完全一致。
            const iconHalf = (st.type === 'rank') ? ICON_HALF_RANK : ICON_HALF_MINOR;
            const labelRight = x <= TRACK_W / 2;
            const side = labelRight ? (TRACK_W - x) : x;
            const room = Math.max(90, side - iconHalf - STATION_GAP - CHIP_SAFE_PAD);

            // ── 回推「排成一行時字級最多能多大」────────────────────────
            // 每顆按鈕的寬度 ＝ 字數×字級 ＋ 左右內距 ＋ 邊框，
            // 再加上按鈕之間的 gap。中日韓字元寬度正好等於字級，
            // 因此這個估算對詩名而言是精準的（遇到「-」等半形字元會高估，
            // 高估只會讓字縮小一點點，不會排不下）。
            const count = chips.length;
            const style = CHIP_STYLE_BY_COUNT.find(s => count <= s.max);
            const padX = style.padX, gap = style.gap;
            const totalChars = shorts.reduce((s, t) => s + t.length, 0);
            const overhead = count * (padX * 2 + 2) + gap * (count - 1);
            let fs = Math.floor((room - overhead) / Math.max(1, totalChars));
            fs = Math.max(CHIP_FS_MIN, Math.min(CHIP_FS_MAX, fs));

            // 字級、內距、間距、寬度上限全部照這一站的實際可用寬度給，
            // 不再是全域固定值。CSS 端只負責讀這幾個變數（見 .lp-poem-chip）。
            return `<div class="lp-poem-chips" style="` +
                `font-size:${fs}px;max-width:${room}px;` +
                `--lp-chip-pad-x:${padX}px;gap:${gap}px">` +
                chips.join('') + `</div>`;
        },

        /** 供 innerHTML 組字串用的最小逸出（詩名可能含引號或角括號） */
        escAttr: function (s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        },

        /**
         * 卡關提示列：目前這一站若有關卡失敗達門檻，就提供捐納跳關。
         * （清代確有「捐納」買監生資格的制度，主題上說得通。）
         */
        renderNotice: function (station) {
            const box = this.overlay.querySelector('#lpNotice');
            if (!box) return;

            // ── 卡在考試關卡：課程修完了、考試還沒過 ────────────────────
            //    這是常駐入口；一次性的彈窗（showExamQualifiedPopup）只在
            //    剛取得資格那一刻出現，之後玩家就得靠這一列與站點標記。
            const gate = this.getExamGateState();
            if (gate.blocked && gate.qualified) {
                const minor = (gate.kind === 'minor');
                box.classList.remove('hidden');
                box.innerHTML =
                    `<span class="lp-notice-text">「${gate.station.name}」課程已修畢，<br>`
                    + (minor ? '通過小考方可續進。' : '中式(通過考試)方可續進。') + `</span>` +
                    `<button class="lp-notice-btn" id="lpBtnGoExam">`
                    + (minor ? '應小考' : '前往應試') + `</button>`;
                const b = box.querySelector('#lpBtnGoExam');
                if (b) b.addEventListener('click', () => {
                    // 小考與文位考現在走的是同一條路（就地開考），
                    // 差別只在報名費與通過後的獎勵，見 startExam()。
                    this.startExam(gate.station.name, 'real');
                });
                return;
            }

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

        /**
         * 一次性提示：借用 renderNotice() 那條常駐提示列來顯示，用完自動還原。
         *
         * ⚠️ 兩個實測踩過的坑：
         *   1. 連續點擊觸發「一模一樣的訊息」時（例如反覆點「模擬考」都得到
         *      「今日模擬考已用過，明日請早。」），若直接覆寫 innerHTML，
         *      前後 DOM 內容完全相同、畫面毫無變化，玩家會以為按鍵沒有反應。
         *      因此一律先清空、停 0.3 秒讓玩家「看到有東西真的被清掉」，
         *      再顯示新訊息，即使兩次文字一樣也看得出有反應。
         *   2. toast 蓋掉的是 renderNotice() 畫出來的常駐提示（例如「課程已
         *      修畢，前往應試」那顆按鈕）。過去沒有計時器，這條常駐提示會
         *      被永久蓋住，直到玩家做了其他動作觸發下一次 render() 才會
         *      意外重新出現——這段期間玩家完全看不到「可以去應試」的入口。
         *      因此 5 秒後自動把提示列還原成目前真正該常駐顯示的內容。
         */
        toast: function (msg) {
            const box = this.overlay && this.overlay.querySelector('#lpNotice');
            if (!box) return;

            if (this._toastClearTimer) clearTimeout(this._toastClearTimer);
            if (this._toastRevertTimer) clearTimeout(this._toastRevertTimer);

            box.classList.remove('hidden');
            box.innerHTML = '';

            this._toastClearTimer = setTimeout(() => {
                this._toastClearTimer = null;
                box.innerHTML = `<span class="lp-notice-text">${msg}</span>`;

                this._toastRevertTimer = setTimeout(() => {
                    this._toastRevertTimer = null;
                    const st = this.stations && this.stations[this.getCurrentStationIndex()];
                    this.renderNotice(st);
                }, 5000);
            }, 300);
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
         * 依通道權重隨機挑一種通道。
         * 只在傳入的候選通道之間分配 —— 例如書僮還沒解鎖背景與推理，
         * 12:3:3:1:1 在那一站就會正規化成 12:3:3。
         */
        pickChannelByWeight: function (channels) {
            if (!channels.length) return null;
            let total = 0;
            channels.forEach(c => { total += (CHANNEL_WEIGHTS[c] || 1); });
            let r = Math.random() * total;
            for (let i = 0; i < channels.length; i++) {
                r -= (CHANNEL_WEIGHTS[channels[i]] || 1);
                if (r <= 0) return channels[i];
            }
            return channels[channels.length - 1];
        },

        /**
         * 決定這一次要玩哪一款遊戲。
         *
         * ── 兩層規則 ────────────────────────────────────────────────────
         * 單元層（同一組詩句的那 3 局）：必須是 3 款不同的遊戲。
         *   同樣兩句話用同一款遊戲玩第二次就沒有難度了。
         *
         * 站層（一站十幾局的整體）：至少要涵蓋 3 種不同通道，
         *   讓玩家享受到不同類型遊戲的樂趣。
         *
         * ── 為什麼通道保證放在站層而不是單元層 ──────────────────────────
         * 若要求「每個單元都要集滿 3 種不同通道」，一個 N 單元的站對每種
         * 通道的需求量就固定是 N 次，總局數 3N —— 權重只能改變順序，
         * 改不了比例，語感永遠被鎖在 1/3。實測純加權重數字分毫未變。
         * 改放在站層之後，權重才真正生效（語感 33.3% → 58.5%）。
         *
         * ── 挑選順序 ────────────────────────────────────────────────────
         *   1. 排除這個單元已經玩過的遊戲
         *   2. 同一款遊戲最多連續 3 局
         *   3. 長題目遊戲不連續出現兩次
         *   4. 排除最近 5 局出現過的（單元 × 遊戲）組合
         *   5. 依 12:3:3:1:1 權重挑通道；但若已進入這一站的最後 3 局
         *      而通道種類還不足 3 種，就改成刻意挑還沒出現過的通道
         *   6. 在該通道的候選遊戲中隨機挑一款
         *
         * 每一條篩選都只在「篩完還有候選」時才生效，避免規則太嚴導致無遊戲可選。
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

            // 1. 這個單元已經玩過的遊戲不再重複
            const played = unit ? this.getLevelGames(unit.tier, unit.level) : {};
            let cands = narrow(pool, g => !played[g]);

            // 2. 同一款不得連續超過上限
            if (this._sameGameStreak >= MAX_SAME_GAME_STREAK) {
                cands = narrow(cands, g => g !== this._lastGame);
            }
            // 3. 長題目不連續
            if (this._lastGame && LONG_GAMES[this._lastGame]) {
                cands = narrow(cands, g => !LONG_GAMES[g]);
            }
            // 4. 排除最近出現過的（單元 × 遊戲）組合
            if (unit) {
                cands = narrow(cands, g => this._recent.indexOf(unit.tier + '|' + unit.level + '|' + g) === -1);
            }

            // 5. 挑通道
            const byChannel = {};
            cands.forEach(g => {
                const c = GAME_CHANNELS[g];
                (byChannel[c] = byChannel[c] || []).push(g);
            });
            let channels = Object.keys(byChannel);

            const st = this._currentStation;
            if (st && channels.length > 1) {
                const prog = this.getStationRounds(st);
                const left = prog.total - prog.done;
                const got = Object.keys(prog.channels).length;
                if (left <= DELIBERATE_TAIL_ROUNDS && got < MIN_CHANNELS_PER_STATION) {
                    // 站尾補缺：剩沒幾局了，通道種類還不夠 —— 刻意挑沒出現過的
                    const missing = channels.filter(c => !prog.channels[c]);
                    if (missing.length) channels = missing;
                }
            }

            // 6. 在該通道裡隨機挑一款
            const ch = this.pickChannelByWeight(channels);
            const list = byChannel[ch] || cands;
            return list[Math.floor(Math.random() * list.length)];
        },

        /** 記下這一局，供切換規則參考 */
        notePlay: function (gameNo, unit) {
            if (gameNo === this._lastGame) this._sameGameStreak++;
            else this._sameGameStreak = 1;
            this._lastGame = gameNo;
            if (unit) {
                this._recent.push(unit.tier + '|' + unit.level + '|' + gameNo);
                while (this._recent.length > RECENT_WINDOW) this._recent.shift();
            }
        },

        onStationClick: function (idx) {
            const st = this.stations[idx];
            if (!st) return;

            // ⚠️ 考試進行中不得再開課程局（2026-09 亂序模擬抓到）：
            //    考試引擎會覆寫該款遊戲的 gameOver／startNextLevel 來接管答題，
            //    青雲梯派局時也會覆寫 startNextLevel 來接管關卡推進。
            //    兩者交錯時，還原階段會把「對方的替身」當成原版裝回去，
            //    那款遊戲的 startNextLevel 就永久停在別人的閉包上
            //    （玩家之後自由練習過關，會被導回青雲梯的流程）。
            //    正常情況下考試期間看不到青雲梯地圖，但殘留點擊、
            //    測試熱鍵與任何新入口都可能走到這裡，必須在這裡擋掉。
            if (window.ExamEngine && typeof window.ExamEngine.isBusy === 'function'
                && window.ExamEngine.isBusy()) {
                this.toast('考試進行中，請先考完或離場。');
                return;
            }

            const currentIdx = this.getCurrentStationIndex();

            // ── 尚未解鎖的站 → 詢問是否要越級考試 ────────────────────────
            // ⚠️ 舊版這裡只丟一句「先把前面的詩學會吧」就打發玩家，
            //    等於把越級考試這條路藏起來、沒有任何入口。
            //    作者定案：點任何一個未解鎖站點都要跳出越級考試選單。
            if (idx > currentIdx) {
                this.showSkipExamMenu();
                return;
            }

            // ── 點到已經走過的舊站點 → 先問清楚是不是要溫習 ──────────────
            // 玩家看到的是全域累計局數，回頭點舊站時很容易誤以為
            // 「我還在往前走」。這裡明講：溫習不累計局數。
            if (idx < currentIdx) {
                this.showReviewConfirm(st, () => this.enterStation(idx, true));
                return;
            }

            // ── 課程修完了、但考試還沒過 → 也是溫習 ──────────────────────
            //
            // ⚠️⚠️ 這一段補的是實際回報的災情：玩家修完「塾生」的課程、
            //    在「可赴科場」彈窗按了「容後再議」，回到青雲梯再點一次
            //    塾生站，會被當成**正常課程**開局：
            //      · pickUnit 找不到未完成的單元 → 退回「整站隨機重抽」
            //        （見該函式的複習分支），於是又派出一關早就學會的詩；
            //      · _reviewMode 是 false → completeLevel 照樣把 pathRounds +1，
            //        局號一路往上跳（第 50 局、第 51 局…），
            //        但那些局數對應的內容其實是已經學完的舊課程。
            //    玩家看到的就是「局數莫名其妙一直加，站點卻永遠不動」。
            //
            //    站點之所以停在這裡，是因為考試擋路（getExamGateIndex），
            //    不是因為課程還沒修完 —— 對玩家而言這一站的課程已經結束了，
            //    再進來就是溫習。因此改為與「回頭點舊站」同一套待遇：
            //    先跳「溫故知新」說清楚，同意後才以溫習模式進入
            //    （溫習不累計局數，難度標籤也會顯示「溫習」而不是局號）。
            //
            // ⚠️ 用「這一站自己的必通關卡是否全數完成」判斷，而不是看考試
            //    關卡 —— 前者才是「課程有沒有修完」的直接定義。
            //    total 為 0 的站（最後一站大儒沒有課程）不走這條，
            //    留給 enterStation 既有的「這一站沒有安排課程」提示。
            const prog = this.getStationProgress(st);
            if (prog.total > 0 && prog.done >= prog.total) {
                this.showReviewConfirm(st, () => this.enterStation(idx, true), 'done');
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
            this._stationIdxAtLaunch = this.getCurrentStationIndex();
            this._currentStation = st;
            const unit = this.pickUnit(st);
            if (!unit) {
                // 最後一站「大儒」沒有再往後的詩（poemFrom === poemTo），
                // 過去這裡靜靜地什麼都不做，玩家只會覺得點了沒反應。
                if (window.SoundManager) window.SoundManager.playFailure();
                this.toast('這一站沒有安排課程，青雲梯已至頂端。');
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
                playsBefore: this.getUnitPlays(unit.tier, unit.level)
            };

            this.launchGame(gameNo, unit.tier, unit.level);
        },

        /**
         * 目前正在遊玩的站點物件（含小站，例如「書僮二階」）。
         * ⚠️ 給 supabaseClient.js 記錄 game_logs.station_name 用於事後追蹤
         *    （例如稽核「這一站有沒有出到不屬於自己的詩」）。
         *    非青雲梯情境（漢堡選單自由練習）時回傳 null。
         */
        getCurrentStation: function () {
            return this._currentStation || null;
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

            if (window.LevelTable) {
                window.LevelTable.setContext(tier, levelIndex);
                // ⚠️ 把候選詩限制在「這一站安排好的詩」之內。
                //    少了這一行，LevelTable.resolve() 的 B 案會端出「同題目群、
                //    但不屬於這一站」的詩（實測 88 站有 85 站會發生，最遠可拿到
                //    22 站之後才該學的〈水調歌頭〉）。青雲梯是課程，只能學排定的詩。
                if (typeof window.LevelTable.setAllowedPoemIds === 'function') {
                    const st0 = this._currentStation;
                    window.LevelTable.setAllowedPoemIds(st0 ? st0.poemIds : null);
                }
            }
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
                // ⚠️ 一律回推到「真正的原版」再存（2026-09 亂序模擬抓到）：
                //    考試引擎也會覆寫同一支 startNextLevel。若兩邊都直接把
                //    「我覆寫前看到的那一個」當成原版存起來，交錯還原時就會
                //    把對方的替身當成原版裝回去，該款遊戲從此永久停在別人的
                //    閉包上（玩家自由練習過關會被導回青雲梯的流程，且完全
                //    不會有錯誤訊息）。替身身上掛 __fmOriginal 指向真正的原版，
                //    不論誰先誰後、包幾層，還原時都拿得回同一個原版。
                const cur = GameObj.startNextLevel;
                const trueOrig = cur.__fmOriginal || cur;
                const self = this;
                const patched = function () { self.advanceAfterWin(gameNo); };
                patched.__fmOriginal = trueOrig;
                this._patched = { no: gameNo, original: trueOrig };
                GameObj.startNextLevel = patched;
            }

            const DS = window.DifficultySelector;
            if (DS && typeof DS.show === 'function') {
                // ⚠️ 回推到真正的原版：考試沙箱也會覆寫 DS.show（見
                //    examEngine._installSandbox）。兩邊若各自把「我覆寫前看到
                //    的那一個」當成原版，交錯還原時會互相把對方的替身裝回去，
                //    玩家從漢堡選單進自由練習就選不了難度（會被直接丟進
                //    上一次青雲梯派的那一關），而且沒有任何錯誤訊息。
                //    作法與 startNextLevel／gameOver 相同。
                const originalShow = DS.show.__fmOriginal || DS.show;
                let restored = false;
                const restore = () => {
                    if (!restored) { DS.show = originalShow; restored = true; }
                };
                const patchedShow = function (gameName, callback) {
                    restore();   // 立即還原，避免影響之後從選單進入的一般流程
                    if (typeof callback === 'function') callback(tier, levelIndex);
                };
                patchedShow.__fmOriginal = originalShow;
                DS.show = patchedShow;
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
                return;
            }

            // 成功開局：禁止點擊這款遊戲自己的「難度標籤」與「開新局」鈕
            // （只擋點擊、照常顯示，難度標籤這時顯示的是局數／考試別）。
            // 見 setGameNavLocked 的說明。
            this.setGameNavLocked(gameNo, true);
            this._navLockedGameNo = gameNo;
            // 課程局開始 → 鎖住漢堡選單，改顯示「←（放棄）」
            this.updateSessionGuard();
        },

        /** 還原先前被覆寫的 startNextLevel，避免影響從選單進入的一般流程 */
        restorePatchedGame: function () {
            const p = this._patched;
            this._patched = null;
            this.unlockGameNav();
            if (!p) return;
            const G = window['Game' + p.no];
            if (G) G.startNextLevel = p.original;
        },

        /**
         * 禁止／恢復點擊某款遊戲自己的「難度標籤」與「開新局」鈕。
         *
         * ⚠️ 為什麼要擋：這兩顆鈕平常是漢堡選單自由練習的入口，點下去會
         *    呼叫 showDifficultySelector() 跳出**真正**的難度選單，讓玩家
         *    中途岔出去玩別的關卡／難度。青雲梯這時記著的 _pendingUnit／
         *    _currentStation 仍是原本那一關，玩家後續操作會對不上——
         *    實測會造成「明明在打別的關卡，青雲梯卻以為還在等原本那一題」
         *    的錯亂（考試引擎也有相同風險，見 examEngine.js 的
         *    setGameNavLocked 呼叫）。
         *
         * ⚠️⚠️ 只擋點擊，**不可以隱藏**：難度標籤在青雲梯／考試期間顯示的
         *    不是難度，而是 window.FMRoundLabel() 寫進去的
         *    「第 X 局／考試／越級考試／溫習」——那是玩家判斷自己進度與
         *    現況的唯一指示。實際做法見 theme_xuanzhi.css 的 .fm-nav-locked
         *    （pointer-events:none，不動 display）。
         *
         * ⚠️ 用 class 而不是 disabled 屬性或 inline style：各遊戲每開一局都會
         *    自己設一次 `newGame-btn.disabled = false`、`style.display`，
         *    屬性與 inline style 都會被蓋掉，class 則不會（遊戲只改
         *    textContent 與 style）。
         * ⚠️ 只能靠 id 定位元素：40 款遊戲的 id 命名一致
         *    （gameN-diff-tag／gameN-newGame-btn），class 用字卻不一致
         *    （例如 game40 用 .fmd-difficulty-tag／.nav-btn）。
         * ⚠️ 兩顆鈕的 DOM 只建立一次（各遊戲的 createDOM 都有
         *    `!this.container` 的守衛），因此「鎖住」必須配對「解除」，
         *    否則玩家下次從漢堡選單自由練習這款遊戲時會永遠點不動。
         *
         * @param {number} gameNo
         */
        setGameNavLocked: function (gameNo, locked) {
            if (!gameNo) return;
            ['diff-tag', 'newGame-btn'].forEach(suffix => {
                const el = document.getElementById('game' + gameNo + '-' + suffix);
                if (el) el.classList.toggle('fm-nav-locked', locked);
            });
        },

        // ══════════════════════════════════════════════════════════════
        //  課程／考試進行中的「離場守門」
        // ══════════════════════════════════════════════════════════════

        /**
         * 依**當下狀態**決定要不要鎖住漢堡選單、並顯示「←（放棄）」按鈕。
         *
         * ⚠️⚠️ 2026-09-11 玩家回報的災情：考試進行中漢堡選單仍可點開，
         *    玩家從那裡切到別的遊戲時，`switchPage()` 會先跑
         *    `closeAllActiveOverlays()` → `ExamEngine.forceStop()`，
         *    **正在進行的考試就這樣被靜默中止**：報名費已扣不退、
         *    examLog 一筆紀錄都沒有，緊接著新遊戲叫出真正的難度選單。
         *    玩家看到的是「考到一半突然跳出難度選單，考試就沒了，錢白花」。
         *    課程局同理：中途被切走，那一局等於白打。
         *
         * ⚠️ 刻意採「由狀態推導」而不是「進場開、離場關」的配對記帳：
         *    考試與課程的結束路徑有七、八條（考完／棄考／forceStop／
         *    切站／重新整理…），配對記帳只要漏掉一條，漢堡選單就會
         *    永久消失，玩家再也回不了首頁 —— 那比原本的 bug 更嚴重。
         *    這裡改成任何時候呼叫都會算出正確答案，漏呼叫只是晚一點更新，
         *    不會把玩家鎖死（與 `__fmOriginal` 是同一個教訓）。
         */
        /**
         * 目前有沒有「局」在進行？回傳 'exam' / 'course' / null。
         *
         * ⚠️ 這是**推導**出來的，不是記帳。進場開一個旗標、離場關一個旗標的做法
         *    看似直覺，但結束路徑有七八條，漏掉任何一條就是漢堡選單永遠不解鎖、
         *    玩家再也回不了首頁 —— 比原本要防的 bug 更嚴重。
         *    這裡一律從當下的真實狀態重新算，就不存在「忘了關」的路徑。
         */
        sessionKind: function () {
            const examOn = !!(window.ExamEngine && typeof window.ExamEngine.isBusy === 'function'
                && window.ExamEngine.isBusy());
            if (examOn) return 'exam';
            // 課程局進行中 ＝ 派出去的關卡還沒被 checkPendingUnit() 收回
            return this._pendingUnit ? 'course' : null;
        },

        /** 有沒有課程／考試正在進行（供 FMGame.exit 判斷該不該先問玩家）*/
        isSessionActive: function () {
            return !!this.sessionKind();
        },

        updateSessionGuard: function () {
            const kind = this.sessionKind();

            if (window.MenuManager && typeof window.MenuManager.setNavLocked === 'function') {
                window.MenuManager.setNavLocked(!!kind);
            }
            this._renderAbandonBtn(kind);
        },

        /** 建立／更新「←」放棄按鈕（掛在 menuWrapper 裡，沿用漢堡的縮放與定位） */
        _renderAbandonBtn: function (kind) {
            let btn = document.getElementById('lpAbandonBtn');
            if (!kind) {
                if (btn) btn.style.display = 'none';
                return;
            }
            if (!btn) {
                btn = document.createElement('div');
                btn.id = 'lpAbandonBtn';
                btn.className = 'lp-abandon-btn';
                btn.textContent = '←';
                btn.style.pointerEvents = 'auto';
                // ⚠️ 掛進 #menuWrapper：那個容器已經由 menu.js 註冊了
                //    registerOverlayResize，會跟著 stage 一起縮放與定位。
                //    自己另外掛到 body 就得再維護一份縮放邏輯。
                const wrap = document.getElementById('menuWrapper');
                (wrap || document.body).appendChild(btn);
                // ⚠️ 刻意繞一圈走 FMGame.exit()，不直接呼叫 confirmAbandonSession：
                //    「想離開現在這個畫面」全站只有這一條路徑，
                //    由它去判斷現在有沒有課程／考試在進行。
                //    這顆按鈕只在有局在進行時才顯示，所以實際結果相同，
                //    但規範要求遊戲一律呼叫 FMGame.exit()，青雲梯自己更沒有理由破例
                //    —— 而且這樣一來，那支函式每次放棄課程／考試都會被走過一遍，
                //    不會變成「只寫在文件裡、沒人跑過」的擺設。
                btn.addEventListener('click', () => {
                    if (window.FMGame && typeof window.FMGame.exit === 'function') window.FMGame.exit();
                    else this.confirmAbandonSession();
                });
            }
            btn.title = (kind === 'exam') ? '放棄本次考試' : '離開本次課程';
            btn.style.display = '';
        },

        /** 點下「←」：先問清楚再放棄，絕不靜默中止 */
        confirmAbandonSession: function () {
            const EE = window.ExamEngine;
            const examOn = !!(EE && typeof EE.isBusy === 'function' && EE.isBusy());
            if (window.SoundManager) window.SoundManager.playOpenItem();

            // 已經按過「入場應試」才算真的花掉報名費／今日次數；
            // 還停在簡介畫面時放棄，等同「先回家苦讀」，什麼都不會損失。
            const entered = examOn && !!EE._entered;
            const html = examOn
                ? ('<h2>放棄本次考試？</h2>'
                    + '<p>'
                    + (entered
                        ? '本次成績不列入紀錄，<br><b>報名費不予退還</b>，'
                        + '今日已用掉的應試次數也不會返還。<br><br>'
                        : '你尚未入場，<b>不會損失報名費與應試次數</b>。<br><br>')
                    + '確定要離開考場嗎？</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopStay">繼續作答</button>'
                    + '<button class="lp-pop-btn" id="lpPopQuit">放棄考試</button>'
                    + '</div>')
                : ('<h2>離開本次課程？</h2>'
                    + '<p>這一局尚未完成，離開後不會計入晉升局數，<br>'
                    + '這一關要重新再打一次。<br><br>確定要離開嗎？</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopStay">繼續遊戲</button>'
                    + '<button class="lp-pop-btn" id="lpPopQuit">離開課程</button>'
                    + '</div>');

            const overlay = this._makePopup(html);
            const stay = overlay.querySelector('#lpPopStay');
            if (stay) stay.onclick = () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                overlay.remove();
            };
            const quit = overlay.querySelector('#lpPopQuit');
            if (quit) quit.onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                overlay.remove();
                this.abandonSession();
            };
        },

        /**
         * 真的放棄：收掉考試／課程，回到青雲梯。
         *
         * ⚠️ 一律走既有的收口（ExamEngine.forceStop／各遊戲 stopGame），
         *    不要在這裡自己拆沙箱或還原函式 —— 那會變成第二份清理邏輯，
         *    兩邊遲早飄移（見已知錯誤 №26）。
         */
        abandonSession: function () {
            const EE = window.ExamEngine;
            if (EE && typeof EE.forceStop === 'function') EE.forceStop();
            this.restorePatchedGame();
            Object.keys(GAME_NAMES).forEach(k => {
                const G = window['Game' + k];
                if (G && typeof G.stopGame === 'function') G.stopGame();
            });
            if (window.PromotionCelebration && typeof window.PromotionCelebration.stop === 'function') {
                window.PromotionCelebration.stop(true);
            }
            if (window.AchievementDialog && typeof window.AchievementDialog.forceCloseCert === 'function') {
                window.AchievementDialog.forceCloseCert();
            }
            this._pendingUnit = null;
            this._reviewMode = false;
            if (window.ScoreManager && window.ScoreManager.setReviewMode) {
                window.ScoreManager.setReviewMode(false);
            }
            this.invalidateProgress();
            this.show();
            setTimeout(() => this.scrollToCurrent(true), 120);
        },

        /** 解除目前鎖住的那一款遊戲（若有），配合 setGameNavLocked 的說明 */
        unlockGameNav: function () {
            if (this._navLockedGameNo === null) return;
            this.setGameNavLocked(this._navLockedGameNo, false);
            this._navLockedGameNo = null;
        },

        /**
         * 玩家在青雲梯派出的關卡中過關了 —— 由被覆寫的 startNextLevel 呼叫。
         *
         * 這裡重新跑一次「挑題 + 挑遊戲」，因此第十章的五條切換規則
         * （同款最多連 3 局、優先換提取方式、長題目不連續、排除最近組合）
         * 會**逐關**生效，而不是只在進站時生效一次。
         */
        advanceAfterWin: function (gameNo) {
            // ⚠️ 這一局的結算動畫（飛星）此刻已經播完（玩家能點「下一關」
            //    正是因為它播完了才彈出訊息框），但飛星降落是靠
            //    requestAnimationFrame 各自跑完整趟軌跡、不受 activeIntervals
            //    追蹤，若前面還有別局卡住沒播完的殘留（例如分頁曾被切到
            //    背景導致 rAF 停擺），此刻接下來可能呼叫 stopGame() 的分支
            //    一律先斷開，讓那些遲到的星星降落時變成無害的空跑，
            //    不會再憑空跳出 completeLevel／「下一關」訊息框。
            if (window.ScoreManager && typeof window.ScoreManager.cancelAnimation === 'function') {
                window.ScoreManager.cancelAnimation();
            }
            // 剛剛通關了，進度快取必須重算，否則會重複派同一關
            this.invalidateProgress();
            this._pendingUnit = null;
            // ⚠️ 與 checkPendingUnit() 同樣的理由：課程局的狀態在這一行改變了，
            //    守門就必須在這裡重算，不能指望「後面每一條分支都會走到
            //    show() 或 launchGame()」——那是記帳，漏一條玩家就被鎖死。
            //    這一整段是同步執行的：若下面接著派了新局，launchGame 會立刻
            //    再鎖回去，瀏覽器不會畫出中間那一幀，玩家看不到閃爍。
            this.updateSessionGuard();

            // ── 這一局是否讓玩家晉升到下一站？────────────────────────────
            // 站點索引往前跳 = 這一站的必通關卡剛剛全部完成。
            // 立刻彈窗給予成就感，避免玩家傻傻一直玩卻不知道自己已經升階。
            //
            // ⚠️⚠️ 一局有可能一次跨過**好幾站**，必須逐站結算，不可以只處理
            //    最後那一站。站點定位靠的是「依學習順序連續學會幾首詩」
            //    （getPathPoemCount），只要中間某幾首詩早就在自由練習、溫習、
            //    或別站派題時被順手學完，補上缺口的那一局就會讓索引一次前進
            //    兩站以上。
            //    舊版只彈 stations[nowIdx] 一個窗，造成兩個實際災情：
            //      ① 中間若夾著「需應試的文位站」（塾生／童生／縣案首…），
            //         那個「可赴科場」的引導彈窗會被整個吃掉 —— 玩家回報的
            //         「完成童生課程卻沒叫我去考試，反而直接跳獎狀動畫」
            //         就是這一條：跳過的是童生站，演出的是童生二階的小站晉升。
            //      ② 中間被跳過的小站／免考文位站，其晉升文錢是在
            //         showPromotionPopup 裡發的，沒彈窗就等於**永遠拿不到**。
            const nowIdx = this.getCurrentStationIndex();
            if (!this._reviewMode && nowIdx > this._stationIdxAtLaunch && this._stationIdxAtLaunch >= 0) {
                const fromIdx = this._stationIdxAtLaunch;
                this._stationIdxAtLaunch = nowIdx;
                this.restorePatchedGame();
                const cur1 = window['Game' + gameNo];
                if (cur1 && typeof cur1.stopGame === 'function') cur1.stopGame();
                this.showPromotionQueue(fromIdx + 1, nowIdx);
                return;
            }

            // ── 這一局是否讓玩家「修完了應試文位站的課程」？────────────
            //    站點索引不會前進（考試擋路，見 getExamGateIndex），
            //    因此上面那一段抓不到，必須在這裡單獨判斷。
            //    這是升等規則第二步：修完課程 ＝ 取得應試資格。
            if (!this._reviewMode) {
                const gate = this.getExamGateState();
                if (gate.blocked && gate.qualified
                    && this._examPrompted !== gate.station.name) {
                    this._examPrompted = gate.station.name;
                    this.restorePatchedGame();
                    const cur2 = window['Game' + gameNo];
                    if (cur2 && typeof cur2.stopGame === 'function') cur2.stopGame();
                    this.showExamQualifiedPopup(gate.station);
                    return;
                }
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
                playsBefore: this.getUnitPlays(unit.tier, unit.level)
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

        // ══════════════════════════════════════════════════════════════
        //  晉升獎勵發放（note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md）
        // ══════════════════════════════════════════════════════════════

        /**
         * 發放晉升獎勵文錢，並記錄「已發放」避免重複。
         *
         * ⚠️ 新規則的核心行為翻轉（企劃書 §5）：
         *    **達成當下就入帳，不需要玩家點擊「領取」**。
         *    舊規則要玩家按下按鈕才真正發放，萬一玩家故意不按、或按之前
         *    就關掉視窗，獎勵就永遠拿不到——流程既麻煩又有漏發風險。
         *    因此本函式是在「彈窗出現之前」就先呼叫，彈窗純粹是表演。
         *
         * ⚠️ 冪等性：同一個站／文位只會發一次。
         *    記錄沿用 playerData.achievements.claimed 這個既有陣列：
         *      · 小站 → 'lpgrade_<站名>'
         *      · 文位 → 'rank_<文位名>'（**刻意沿用 achievement.js 的既有 id**）
         *    文位用同一組 id 是為了讓成就頁的「領取獎狀」CTA 自動消失
         *    （renderExamCTAs 只找 passed 但尚未 claimed 的文位），
         *    否則玩家會在成就頁再領一次、造成重複發放。
         *
         * @param {string} kind   'grade'（小站）或 'rank'（文位）
         * @param {string} name   小站名或文位名
         * @param {number} silver 應發文錢
         * @returns {number} 實際發放的文錢；0 代表先前已發過，本次不重複發
         */
        grantPromotionSilver: function (kind, name, silver) {
            const amount = Math.max(0, Math.floor(silver || 0));
            if (!amount || !name) return 0;
            if (!window.ScoreManager || !window.FMCollectionSave) return 0;

            // ⚠️ 三種前綴必須各自獨立，絕不可共用：
            //      rank_<文位名>   文位獎勵（與成就頁的「領取獎狀」CTA 共用，刻意的）
            //      lpgrade_<站名>  小站「抵達」時的晉升文錢
            //      lpexam_<站名>   小考「通過」時的文錢
            //    小考掛在小站上，若沿用 lpgrade_ 前綴就會與該站的抵達獎勵
            //    共用同一個冪等旗標 —— 先發的那一筆會把後發的那一筆擋掉，
            //    玩家永遠只拿得到其中一筆，而且不會有任何錯誤訊息。
            const achId = (kind === 'rank') ? ('rank_' + name)
                : (kind === 'minor') ? ('lpexam_' + name)
                    : ('lpgrade_' + name);

            const data = window.ScoreManager.loadPlayerData();
            if (!data.achievements) data.achievements = { unlocked: [], progress: {}, claimed: [] };
            if (!Array.isArray(data.achievements.claimed)) data.achievements.claimed = [];
            if (data.achievements.claimed.indexOf(achId) >= 0) return 0;  // 已發過

            data.achievements.claimed.push(achId);
            window.ScoreManager._persist(data);

            // 文錢一律走統一收口，順帶留下雲端流水帳（source='rank'）
            try {
                const coll = window.FMCollectionSave.load();
                window.FMCollectionSave.addSilver(coll, amount, 'rank', name);
                window.FMCollectionSave.save(coll);
                if (window.CollectionDialog && typeof window.CollectionDialog.refreshHud === 'function') {
                    window.CollectionDialog.refreshHud();
                }
            } catch (e) {
                console.warn('[青雲梯] 晉升文錢發放失敗:', e);
            }
            return amount;
        },

        /**
         * 依站點型態算出這一站該發多少文錢，並實際發放。
         *
         * 三種情形（企劃書 §4.2）：
         *   · 小站            → 目標文位總額 ÷ 小站數（無條件捨去，最低 1）
         *   · 免考文位        → 該文位的獎勵總額
         *   · 需應試的文位    → **這裡不發**，等考試通過才由 exam.js 發放。
         *                       抵達這一站的定位是「取得應試資格」而非「晉升」。
         *
         * @param {object} station 站點
         * @param {boolean} [includeExamRanks] true = 連「需應試的文位站」也發。
         *        只有越級考試通過後的補發（examEngine._grantSkipStations）該傳 true——
         *        那時沿途文位已經被寫進 ranks.passed、視同考過，不發就等於
         *        「文位給了、獎勵卻永遠拿不到」。平常的「抵達站點」一律不要傳。
         * @returns {number} 實際發放的文錢（0 = 不發或已發過）
         */
        grantStationReward: function (station, includeExamRanks) {
            if (!station || !window.PathStations) return 0;
            const PS = window.PathStations;

            if (station.type === 'grade') {
                return this.grantPromotionSilver('grade', station.name, PS.getGradeStationSilver(station));
            }
            if (station.type === 'rank' && (!station.isExam || includeExamRanks)) {
                return this.grantPromotionSilver('rank', station.name, PS.getRankSilver(station.name));
            }
            return 0;   // 需應試的文位：資格達成不發獎，通過考試才發
        },

        /**
         * 算出「恭賀已通過◯◯」「即將進入◯◯課程」該填哪個站名，
         * 以及這是不是「考試剛通過」的情境（isExamPass）。
         *
         * ⚠️ 這是兩件事的交集，兩者缺一都會兜錯站名：
         *
         *   ① station.isExam 是不是 true。
         *   ② station 是不是 PathStations.build() 陣列裡的「真身」。
         *
         *   縣案首站本身就是 isExam=true，但玩家剛跨進這一站、考試根本
         *   還沒開始時（showPromotionPopup 的 isExamRank 分支），傳進來的
         *   仍是陣列裡的真實物件——這時候①為真但②也為真，屬於「抵達」，
         *   不是「通過」。只有 exam.js 在通過考試後才會傳一個不在陣列裡的
         *   合成物件 { type:'rank', name, isExam:true } 進來，這時①②都不
         *   在陣列裡才是真的「考試剛通過」。
         *
         *   反過來，Alt+W 測試熱鍵預覽「抵達」時也是傳合成物件（不在陣列
         *   裡），但故意選了 isExam:false 的站（蒙童／書僮二階）避開這個
         *   混淆——所以①②必須同時成立才算「考試剛通過」，只看②（不在
         *   陣列裡）會把這些測試熱鍵也誤判成通過考試，只看①（isExam）
         *   則會把「剛抵達的需應試文位站」誤判成通過考試。
         *   這兩種誤判都曾經在實測時做出「已通過『X』全部關卡，
         *   已具應試『X』之學力」這種同名兩次的句子，故特此記錄。
         *
         *   · isExamPass＝false（一般抵達，含小站／免考文位／剛抵達但
         *     還沒考的需應試文位／任何測試預覽用的合成物件）——
         *     已完成的是「上一站」，即將進入的課程就是 station 自己。
         *     優先用參考直接比對，找不到（合成物件）才退回用「型態＋
         *     名字」查，畢竟合成物件不可能靠參考找到。
         *
         *   · isExamPass＝true（只有 exam.js 傳來的合成物件會落到這裡）——
         *     玩家早在「取得應試資格」那一刻就已學完 station 自己的全部
         *     關卡，通過考試只是拿到正式頭銜，所以已完成的就是 station
         *     自己，即將進入的是它的下一站。isFinal＝true 僅在「大儒」
         *     ——它是整條青雲梯的最後一站，沒有下一站可以進，
         *     需要另外的收尾文案（不再有課程可修）。
         *
         * @returns {{prevName:string, nextName:string, isFinal:boolean, isExamPass:boolean}}
         */
        _getPrevNextStationNames: function (station) {
            const empty = { prevName: '', nextName: '', isFinal: false, isExamPass: false };
            if (!station || !window.PathStations) return empty;
            const stations = this.stations || window.PathStations.build();

            const foundByReference = stations.indexOf(station) >= 0;
            const isExamPass = !!station.isExam && !foundByReference;

            if (isExamPass) {
                const idx = stations.findIndex(s => s.type === 'rank' && s.name === station.name);
                if (idx < 0) return empty;
                const next = stations[idx + 1] || null;
                return { prevName: station.name, nextName: next ? next.name : '', isFinal: !next, isExamPass: true };
            }

            let idx = stations.indexOf(station);
            if (idx < 0) idx = stations.findIndex(s => s.type === station.type && s.name === station.name);
            if (idx < 0) return empty;
            const prev = idx > 0 ? stations[idx - 1] : null;
            return { prevName: prev ? prev.name : '', nextName: station.name, isFinal: false, isExamPass: false };
        },

        /**
         * 依序演出「這一局跨過的每一站」的晉升彈窗。
         *
         * ⚠️ 為什麼一定要排隊而不是只演最後一站：見 advanceAfterWin 內的說明。
         *    重點是**每一站都要各自跑一次 showPromotionPopup**，因為晉升文錢
         *    是在那支函式裡發的（grantStationReward），而「需應試的文位站」
         *    的考試引導彈窗也只在那裡出現。少演一站，玩家就少拿一筆文錢、
         *    或整個錯過一次「該去考試了」的提示。
         *
         * ⚠️ 中途若玩家在「應試資格」彈窗按下「即赴科場」，佇列會就此中止
         *    （goToExam 會就地開始考試）。這是可接受的：獎勵在
         *    彈窗出現之前就已經入帳，後面沒演到的只是慶祝動畫；而且玩家
         *    回到青雲梯時，render() 的 settleArrivedRewards() 還會再補一次刀。
         *
         * @param {number} fromIdx 第一個要演出的站點索引（含）
         * @param {number} toIdx   最後一個要演出的站點索引（含）
         */
        showPromotionQueue: function (fromIdx, toIdx) {
            const stations = (this.stations && this.stations.length)
                ? this.stations
                : (window.PathStations ? window.PathStations.build() : []);
            const list = [];
            for (let i = fromIdx; i <= toIdx; i++) {
                if (stations[i]) list.push(stations[i]);
            }
            const self = this;
            let k = 0;
            const next = function () {
                if (k >= list.length) {
                    self.show();
                    setTimeout(function () { self.scrollToCurrent(true); }, 120);
                    return;
                }
                self.showPromotionPopup(list[k++], next);
            };
            next();
        },

        /**
         * 補發「已經抵達、卻從來沒發過獎勵」的站點文錢。
         *
         * ⚠️ 為什麼需要這一支：晉升文錢原本只在 showPromotionPopup 裡發，
         *    而那個彈窗只有「在青雲梯裡打完一局、而且按下『下一關』回到
         *    青雲梯」這一條路徑會觸發。實際上還有好幾條路會讓站點前進卻
         *    完全不經過那個彈窗：
         *      · 玩家過關後直接關掉遊戲、從漢堡選單走人
         *      · 捐納跳關（donateSkip）剛好補完這一站的最後一個單元
         *      · 在漢堡選單自由練習裡把某一站的關卡打完
         *      · 一局跨過好幾站、而玩家在中途的彈窗按了「即赴科場」
         *    這些情況下那筆文錢過去是**永遠拿不到**的。
         *
         * ⚠️ 冪等：grantStationReward 內部以 achievements.claimed 判斷是否
         *    已發過，重複呼叫不會重複發放，因此可以放心在每次 render() 都跑。
         *    需應試的文位站一律跳過（第二個參數不傳），維持「考過才發」。
         *
         * @returns {number} 這一次實際補發出去的文錢總額
         */
        settleArrivedRewards: function () {
            if (!window.PathStations || !window.ScoreManager) return 0;
            const stations = (this.stations && this.stations.length)
                ? this.stations : window.PathStations.build();
            const idx = this.getCurrentStationIndex();

            // ⚠️ 效能：grantStationReward 內部每呼叫一次就 loadPlayerData() 一次
            //    （＝JSON.parse 整份存檔）。這裡會走訪近百個站，若無條件全部呼叫，
            //    光是重繪一次青雲梯就要解析近百次存檔——與 buildProgressCache
            //    當初被加上快取的是同一個坑。因此先讀一次 claimed 名單，
            //    只對「真的還沒發過」的站點才進去發（正常情況下是 0~2 站）。
            let claimed = [];
            try {
                const data = window.ScoreManager.loadPlayerData();
                claimed = (data && data.achievements && data.achievements.claimed) || [];
            } catch (e) { return 0; }

            let gained = 0;
            for (let i = 0; i <= idx && i < stations.length; i++) {
                const st = stations[i];
                if (st.type === 'grade') {
                    if (claimed.indexOf('lpgrade_' + st.name) >= 0) continue;
                } else if (st.type === 'rank' && !st.isExam) {
                    if (claimed.indexOf('rank_' + st.name) >= 0) continue;
                } else {
                    continue;   // 需應試的文位站：考過才發，這裡一律不碰
                }
                gained += this.grantStationReward(st) || 0;
            }
            return gained;
        },

        /**
         * 晉升彈窗：這一局讓玩家走到新的站點時，於結算後立刻出現。
         *
         * 三種型態（企劃書 §5）：
         *   · 小階（例如「書僮二階」）→ 簡易全畫面動畫（無獎狀圖）
         *   · 免考文位（書僮／蒙童）→ 華麗全畫面動畫（獎狀圖＋特效）
         *   · 需應試的文位（塾生起）→ 引導彈窗，就地開始考試
         *
         * ⚠️ 獎勵在彈窗出現「之前」就已經發放（見 grantStationReward），
         *    按鈕只負責關閉彈窗與播放慶祝動畫，不再是領取動作。
         */
        showPromotionPopup: function (station, onNext) {
            const proceed = () => {
                if (typeof onNext === 'function') { onNext(); return; }
                // 回到青雲梯主介面，讓玩家親眼看到自己已經站上新的一階
                this.show();
                setTimeout(() => this.scrollToCurrent(true), 120);
            };
            if (!station) { proceed(); return; }
            const isRank = station.type === 'rank';
            const isExamRank = isRank && station.isExam;

            // prevName＝玩家剛學完、正要離開的舊站；nextName／isFinal 見
            // _getPrevNextStationNames 的說明。此彈窗只在 nowIdx 前進時觸發，
            // 對非考試分支而言 idx 必然 >=1，上一站必存在。
            const neighbor = this._getPrevNextStationNames(station);
            const prevName = neighbor.prevName || '前一階';

            // ⚠️ 先發獎勵、再顯示彈窗——彈窗只是表演，不是領取動作。
            const gained = this.grantStationReward(station);
            const silverLine = gained > 0
                ? '<br>得文錢 <b>' + gained.toLocaleString() + '</b> 枚。'
                : '';

            let html;
            // ⚠️ 邊界：抵達的當下課程就已經修畢的應試文位站。
            //    兩種情況會發生：
            //      · 最後一站「大儒」自己沒有課程（poemFrom === poemTo）
            //      · 玩家先在漢堡選單的自由練習裡把這一站的關卡打完了
            //    這時「修畢本階課程方具應試學力」是廢話，應該直接給應試引導。
            const alreadyQualified = isExamRank && this.getRankExamProgress(station.name).ok;

            if (isExamRank && alreadyQualified) {
                html = '<h2>學問已成，可赴科場</h2>'
                    + '<p>積跬步以至千里。<br>閣下已通過「<b>' + prevName + '</b>」全部課程，<br>'
                    + '已具應試「<b>' + station.name + '</b>」之學力。<br>'
                    + '惟功名須經場屋一試方得冊封 ——<br>可即刻就地報名應試，<br>'
                    + '亦可再溫書數日，待胸有成竹再去。</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopLater">容後再議</button>'
                    + '<button class="lp-pop-btn" id="lpPopExam">即赴科場</button>'
                    + '</div>';
            } else if (isExamRank) {
                // ── 抵達需應試的文位站 ＝ **入學**，不是取得應試資格 ──────────
                // ⚠️⚠️ 這裡以前寫的是「學問已成，可赴科場／已具應試之學力」，
                //    那是錯的：作者 2026-09-05 定案的規則是
                //        抵達文位站     ＝ 入學（開始修這個文位自己的課程）
                //        修完文位站課程 ＝ 取得應試資格   ← 才是「可赴科場」
                //        通過考試       ＝ 冊封
                //    舊文案等於在玩家「一關都還沒修」時就催他去考試，而考卷
                //    範圍又包含這一站的詩，形同叫他去考沒學過的東西。
                //    「可赴科場」那一段已移到 showExamQualifiedPopup()。
                //
                // 應試文位站抵達時不發獎勵（企畫書 §4.2），故不顯示文錢行。
                html = '<h2>入室升堂</h2>'
                    + '<p>積跬步以至千里。<br>閣下已通過「<b>' + prevName + '</b>」全部課程，<br>'
                    + '得入「<b>' + station.name + '</b>」之門，修習本階課程。<br>'
                    + '<br>修畢本階全部課程，<br>方具應試「<b>' + station.name + '</b>」之學力；<br>'
                    + '中式之後始得冊封，並續修下一階。</p>'
                    // ⚠️ 這裡刻意用 lpPopLater 而不是 lpPopClaim。
                    //    lpPopClaim 的處理常式會播放晉升慶祝動畫（獎狀），
                    //    而「入學」還沒有任何功名可頒 —— 用錯 id 就會變成
                    //    「考試都還沒考就先發獎狀」。lpPopLater 只是關閉回到青雲梯。
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn" id="lpPopLater">開卷有益</button>'
                    + '</div>';
            } else if (isRank) {
                // ⚠️ 標題刻意不用「金榜題名」——那是科舉及第的專稱，
                //    保留給 exam.js 的考試通過畫面。蒙童／塾生／童生是
                //    純靠累積學習取得的免考文位，用「積學有成」才貼切，
                //    也避免兩種完全不同的成就用同一句賀詞。
                html = '<h2>積學有成</h2>'
                    + '<p>積跬步以至千里。<br>閣下已通過「<b>' + prevName + '</b>」全部課程。<br>'
                    + '榮登「<b>' + station.name + '</b>」文位。<br>' + silverLine + '</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn" id="lpPopClaim">敬受榮銜</button>'
                    + '</div>';
            } else {
                html = '<h2>更上一層</h2>'
                    + '<p>積跬步以至千里。<br>閣下已通過「<b>' + prevName + '</b>」全部課程。<br>'
                    + '進「<b>' + station.name + '</b>」。<br>' + silverLine
                    + '<br>新的詩篇已在前方等候。</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn" id="lpPopClaim">拾級而上</button>'
                    + '</div>';
            }

            const overlay = this._makePopup(html);
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) {
                window.SoundManager.playJoyfulTriple();
            }

            const backToPath = () => {
                overlay.remove();
                proceed();   // 佇列還有下一站就接著演，沒有才回到青雲梯主介面
            };

            const btnClaim = overlay.querySelector('#lpPopClaim');
            if (btnClaim) btnClaim.onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                overlay.remove();
                // 全畫面慶祝動畫：文位有獎狀圖、小站只有特效（企劃書 §5）
                this.playPromotionCelebration(station, gained, backToPath);
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
                // 就地開考（資格已在 alreadyQualified 判定過，付費在入場時才扣）
                this.goToExam(station.name);
            };
        },

        /**
         * 「取得應試資格」彈窗：修完某個應試文位站的全部課程時跳出。
         *
         * ⚠️ 這是規則第二步的提示，時機**不是**抵達文位站（那是入學，
         *    見 showPromotionPopup 的 isExamRank 分支），而是把那一站
         *    自己的必通關卡全部做完的那一刻。
         *
         * ⚠️ 同一個文位一個工作階段只提示一次（_examPrompted），
         *    否則玩家在關卡站反覆練習時每過一局就被彈一次。
         *    真正持久的入口是站點上的「模擬考／正式考」標記與提示列，
         *    這個彈窗只是第一次的臨門一腳。
         */
        showExamQualifiedPopup: function (station) {
            if (!station) { this.show(); return; }
            const isMinor = (station.examKind === 'minor');
            const html = isMinor
                // 小考：章節檢核，通過只給文錢與續行，沒有功名可言
                ? ('<h2>溫故驗業</h2>'
                    + '<p>積跬步以至千里。<br>閣下已通過「<b>' + station.name + '</b>」全部課程。<br>'
                    + '此處設有一場小考，<br>驗一驗這一段書讀得如何 ——<br>'
                    + '中式即可續行，並得文錢若干。<br>'
                    + '小考不收報名費，考壞了再來便是。</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopLater">容後再議</button>'
                    + '<button class="lp-pop-btn" id="lpPopExam">即刻應試</button>'
                    + '</div>')
                : ('<h2>學問已成，可赴科場</h2>'
                    + '<p>積跬步以至千里。<br>閣下已通過「<b>' + station.name + '</b>」全部課程，<br>'
                    + '已具應試「<b>' + station.name + '</b>」之學力。<br>'
                    + '惟功名須經場屋一試方得冊封 ——<br>可即刻就地報名應試，<br>'
                    + '亦可再溫書數日，待胸有成竹再去。</p>'
                    + '<div class="lp-pop-footer">'
                    + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpPopLater">容後再議</button>'
                    + '<button class="lp-pop-btn" id="lpPopExam">即赴科場</button>'
                    + '</div>');

            const overlay = this._makePopup(html);
            if (window.SoundManager && window.SoundManager.playJoyfulTriple) {
                window.SoundManager.playJoyfulTriple();
            }
            const backToPath = () => {
                overlay.remove();
                this.show();
                setTimeout(() => this.scrollToCurrent(true), 120);
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
                // 小考與文位考共用同一條路（就地開考）；差別只在報名費與獎勵。
                this.startExam(station.name, 'real');
            };
        },

        /**
         * 就地開始正式考。
         *
         * ⚠️ 2026-09-11 改版：考試入口統一由青雲梯進入，江南小院的「考棚」已移除。
         *    舊版這一支會 `hide()` 青雲梯 → 開啟江南小院 → 350ms 後呼叫
         *    `CollectionDialog.openExam()`，等於為了報名一場考試把玩家
         *    丟到另一個頁面，回來還要自己找路（實測回報過「考完停在江南小院、
         *    關掉卻回不到青雲梯」）。而且那個入口只認「下一個沒考過的**文位**」，
         *    小考（小站）在那裡根本找不到，於是小考得另外寫一條路 ——
         *    同一件事兩套流程，正是先前多個考試 bug 的溫床。
         *    現在一律就地呼叫 startExam()，不再跳頁。
         *
         * @param {string} [target] 要考的站名；省略時取目前被考試擋住的那一站
         */
        goToExam: function (target) {
            let name = target;
            if (!name) {
                const gate = this.getExamGateState();
                name = gate.station ? gate.station.name : '';
            }
            if (!name) {
                this.toast('目前沒有可以應試的科目。');
                return;
            }
            this.startExam(name, 'real');
        },

        /**
         * 從青雲梯站點直接開考（模擬考／正式考）。
         *
         * ⚠️ 每日次數（作者 2026-09-11 定案，見 FMExamConfig.EXAM_DAILY_LIMITS）：
         *    正式考**不限次數**——節流機制只有「文錢」，考越多次越貴；
         *    模擬考每日 5 次——免費，但不能無限刷，否則等於直接看考卷；
         *    越級考每日 5 次——另外還要付 2 倍報名費。
         *    次數是**逐場**計算的（以站名為鍵），不是全域共用。
         *
         * @param {string} rankName 應試文位
         * @param {string} mode     'mock' | 'real'
         */
        startExam: function (target, mode) {
            const C = window.FMExamConfig;
            const S = window.FMCollectionSave;
            const PS = window.PathStations;
            if (!C || !window.ExamEngine || !S || !PS) {
                this.toast('考試模組尚未載入。');
                return;
            }
            // ⚠️ 重入防護（破壞性測試 A1／B1）：考試進行中再開一場，會把
            //    正在進行的那一場無聲吃掉——已扣的報名費拿不回來，
            //    前一場的 onDone（負責演出晉升、把畫面帶回青雲梯）也永遠
            //    不會被呼叫。連點兩下考試標記就會踩到。
            if (typeof window.ExamEngine.isBusy === 'function' && window.ExamEngine.isBusy()) {
                this.toast('考試進行中，請先考完或離場。');
                return;
            }
            // ⚠️ 2026-09-06 起 target 是**站名**：文位考的站名剛好等於文位名，
            //    小考則只有站名。兩者共用這一支。
            const station = PS.getStationByName(target);
            if (!station || !station.examKind) {
                this.toast('「' + target + '」沒有安排考試。');
                return;
            }
            const rankName = target;

            // ⚠️ 資格必須在這裡再擋一次，不能只靠站點標記有沒有畫出來。
            //    畫面是「顯示與否」，這裡是「能不能真的開考」——
            //    任何新的入口（測試熱鍵、外部呼叫）都會經過這一支。
            const prog = this.getStationExamProgress(station);
            if (!prog.ok) {
                this.toast('「' + rankName + '」課程尚未修畢（'
                    + prog.unitsDone + ' / ' + prog.unitsTotal + ' 關），未具應試學力。');
                return;
            }

            const coll = S.load();

            // ⚠️ 已經通過的考試不得再報名（破壞性測試 C1）：舊版照收報名費，
            //    但這場考試對進度毫無意義——通過紀錄已經在了，考過也不會
            //    再發一次文位或獎勵，等於白花錢。正常 UI 不會出現這顆鈕
            //    （考試標記只掛在「還沒通過的那一站」），但晉升後畫面還沒
            //    重繪時的殘留點擊、或任何外部入口都會走到這裡。
            if (C.isExamPassed(coll, station)) {
                this.toast('「' + rankName + '」已經通過，不必再考。');
                return;
            }

            if (mode === 'mock' && !C.canAttemptToday(coll, mode, rankName)) {
                this.toast('今日模擬考已用完（每日 ' + C.dailyLimit('mock') + ' 次），明日請早。');
                return;
            }

            // 正式考要收報名費；模擬考不收
            const fee = (mode === 'real') ? this.getExamFee(rankName) : 0;
            if (mode === 'real' && (coll.silver || 0) < fee) {
                this.toast('盤纏不足，報名費需 ' + fee.toLocaleString() + ' 文錢。');
                return;
            }

            // ⚠️ 報名費／模擬考名額只在玩家真的按下「入場應試」才扣，不能在
            //    這裡先扣——這裡只是顯示考試簡介，玩家還沒決定要不要考。
            //    2026-09 實測回報：在簡介畫面按「先回家苦讀」取消，回到
            //    青雲梯卻發現今日模擬考名額已經用掉，因為舊寫法在**開啟
            //    簡介之前**就先扣了，取消等於白白燒掉一次機會。改成透過
            //    ExamEngine 的 onEnter 回呼，真正入場（點下「入場應試」）
            //    那一刻才扣，見 examEngine.js 的 start() 說明。
            //
            // ⚠️ 入場當下必須**重新驗一次餘額**（破壞性測試 D1）：資格檢查
            //    是在開啟簡介之前做的，玩家可能在簡介畫面停留期間把文錢
            //    花掉。少了這一次重驗，addSilver 會照扣，餘額直接變成負數。
            //    回傳 false ＝ 拒絕入場，examEngine 會當作沒入場直接離場。
            const self0 = this;
            const onEnter = function () {
                const coll2 = S.load();
                if (mode === 'real') {
                    if ((coll2.silver || 0) < fee) {
                        window.ExamEngine._abortReason =
                            '盤纏不足，報名費需 ' + fee.toLocaleString() + ' 文錢。';
                        self0.toast('盤纏不足，報名費需 ' + fee.toLocaleString() + ' 文錢。');
                        return false;
                    }
                    S.addSilver(coll2, -fee, 'exam_fee', rankName);
                } else {
                    C.markAttemptToday(coll2, mode, rankName);
                }
                S.save(coll2);
                if (window.CollectionDialog && typeof window.CollectionDialog.refreshHud === 'function') {
                    window.CollectionDialog.refreshHud();
                }
                return true;
            };

            this.hide();
            const self = this;
            // ⚠️ 考試通過會解除關卡、讓站點往前跳。跳過去的那幾站也是「抵達」，
            //    必須補演晉升彈窗 —— 否則免考文位的獎狀會整個不見：
            //    小考站後面若緊接著「蒙童」，通過小考時站點直接從小考站跳到蒙童，
            //    advanceAfterWin 完全沒有參與，蒙童的獎狀動畫就被吃掉了（實測）。
            const idxBefore = this.getCurrentStationIndex();
            window.ExamEngine.start({
                onEnter: onEnter,
                rankName: rankName,
                mode: mode,
                onDone: function () {
                    self.invalidateProgress();
                    const idxAfter = self.getCurrentStationIndex();
                    if (idxAfter > idxBefore) {
                        self._stationIdxAtLaunch = idxAfter;
                        self.showPromotionQueue(idxBefore + 1, idxAfter);
                        return;
                    }
                    self.show();
                    setTimeout(function () { self.scrollToCurrent(true); }, 120);
                }
            });
        },

        /**
         * 報名費：交給 examConfig.js 那份唯一的費用表，這裡不另外複製一份。
         *
         * ⚠️ 小考（小站考試）一律免費 —— 它是課程的一部分，不該再收一次錢；
         *    而且改版後考試從 13 場變成 33 場，若每場都收費，後段文位的
         *    盤纏缺口會再擴大一倍以上（見驗證程式第 8 節的收支分析）。
         *
         * ⚠️ 2026-09-11 費用表從 `collection.js` 搬到 `examConfig.js`：
         *    考棚取消後小院不再參與考試流程，費用表若留在那裡，
         *    小院沒載入時這裡會靜靜地回 0（考試全部免費且無錯誤訊息）。
         *
         * @param {string} target 文位名或站名
         */
        getExamFee: function (target) {
            const EC = window.FMExamConfig;
            const PS = window.PathStations;
            if (PS && typeof PS.getStationByName === 'function') {
                const st = PS.getStationByName(target);
                if (st && st.examKind === 'minor') {
                    return (EC && EC.MINOR_FEE) || 0;
                }
            }
            if (EC && typeof EC.getExamFee === 'function') return EC.getExamFee(target);
            return 0;
        },

        /**
         * 小考通過的文錢：該文位獎勵 ÷ MINOR_REWARD_DIVISOR（最低 1）。
         * ⚠️ 用「這一站所屬文位的下一個文位」的獎勵當基數，與小站晉升文錢
         *    的算法（getGradeStationSilver）同一套邏輯，避免兩份數字打架。
         */
        getMinorExamSilver: function (station) {
            const PS = window.PathStations;
            const EC = window.FMExamConfig;
            if (!PS || !station) return 0;
            const target = (station.type === 'rank')
                ? station.name : PS.getNextRankNameAfter(station.rankName);
            const total = target ? PS.getRankSilver(target) : 0;
            const div = (EC && EC.MINOR_REWARD_DIVISOR) || 4;
            return Math.max(1, Math.floor(total / div));
        },

        /**
         * 越級考試選單：點到任何一個未解鎖站點時跳出。
         *
         * 規則（作者定案，判斷全在 FMExamConfig.getSkipMenu）：
         *   · 固定列出所有可越級的文位（塾生～進士）
         *   · 不能點的以半透明顯示，並註明原因
         *   · 沒有模擬考，一律收費，一天一次
         */
        showSkipExamMenu: function () {
            const C = window.FMExamConfig;
            const self = this;
            if (!C || !window.ExamEngine) { this.toast('先把前面的詩學會吧。'); return; }

            const menu = C.getSkipMenu();
            const silver = (window.FMCollectionSave ? (window.FMCollectionSave.load().silver || 0) : 0);

            // ⚠️ 清單刻意「文位低的排在下面」，與青雲梯主介面的方向一致
            //    （主畫面是由下往上爬）。getSkipMenu 回傳的是由低到高，
            //    所以這裡整個反過來輸出。
            let rows = '';
            menu.slice().reverse().forEach(function (m) {
                // ⚠️ 走 LearningPath.getExamFee：它認得小考（免報名費），
                //    直接查 CollectionDialog 的文位費用表會對小站查不到而回 0，
                //    看起來一樣但那是「查無資料」而不是「本來就免費」。
                const fee = self.getExamFee(m.name) * C.SKIP_FEE_MULTIPLIER;

                // ⚠️ 文錢不足要「當場」就顯示不足並鎖住，不能等點下去才說「盤纏不足」。
                //    玩家看到金額卻點不動、還要被彈一次錯誤訊息，是很差的體驗。
                const poor = m.enabled && silver < fee;
                const usable = m.enabled && !poor;
                const sub = !m.enabled ? m.reason
                    : (poor ? '不足 ' + fee.toLocaleString() + ' 文錢'
                        : fee.toLocaleString() + ' 文錢');

                // ⚠️ 不能用 disabled 屬性！被 disabled 的按鈕在瀏覽器裡
                //    完全不觸發 pointer/mouse/touch 事件，連冒泡都沒有，
                //    於是拖曳捲動的監聽器收不到訊號 —— 清單大部分項目
                //    都是鎖住的，玩家等於只能對著項目之間那幾 px 的縫隙拖，
                //    這正是「很難捲動」的原因。
                //    改用 aria-disabled + class，事件照常發生、點擊在 JS 裡擋掉。
                rows += '<button type="button" class="lp-skip-item'
                    + (usable ? '' : ' lp-skip-off') + '"'
                    + (usable ? ' data-rank="' + m.name + '"' : ' aria-disabled="true"')
                    + '><span class="lp-skip-name">' + m.name
                    + (m.kind === 'minor' ? '　<small>小考</small>' : '　<small>文位考</small>')
                    + '</span>'
                    + '<span class="lp-skip-sub">' + sub + '</span></button>';
            });

            const html = '<h2>越級應試</h2>'
                + '<p>閣下尚未循序抵達此處。<br>'
                + '若自認學養已足，可直接應試 ——<br>'
                + '中式則該場之前的課程視同修畢，<br>獎勵一併補發。<br>'
                + '<b>惟考試須逐場依序通過</b>，<br>小考亦不可略過。</p>'
                + '<div class="lp-skip-list" id="lpSkipList">' + rows + '</div>'
                + '<p class="lp-skip-note">越級考試題目較嚴（紅心減半、及格九成），'
                + '無模擬考，報名費不予退還，每日限考一次。</p>'
                //+ '省下的是修課，不是考試 —— 每一場都要親自考過。</p>'
                + '<div class="lp-pop-footer">'
                + '<button class="lp-pop-btn lp-pop-btn-sub" id="lpSkipCancel">再苦讀些時日</button>'
                + '<button class="lp-pop-btn" id="lpSkipGo" disabled>越級應試</button>'
                + '</div>';

            const overlay = this._makePopup(html);
            overlay.querySelector('.lp-pop').classList.add('lp-pop-skip');

            const goBtn = overlay.querySelector('#lpSkipGo');
            let picked = '';

            overlay.querySelector('#lpSkipCancel').onclick = function () {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                overlay.remove();
            };

            // ⚠️ 清單只負責「選擇」，不等於確定應試 —— 真正送出的是「應試」鈕。
            //    這樣玩家可以先來回比較各文位的費用再決定，不會手滑就扣錢。
            overlay.querySelectorAll('.lp-skip-item[data-rank]').forEach(function (btn) {
                btn.onclick = function () {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    overlay.querySelectorAll('.lp-skip-item').forEach(function (b) {
                        b.classList.remove('lp-skip-picked');
                    });
                    btn.classList.add('lp-skip-picked');
                    picked = btn.getAttribute('data-rank');
                    goBtn.disabled = false;
                };
            });

            goBtn.onclick = function () {
                if (!picked) return;
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                overlay.remove();
                self.startSkipExam(picked);
            };

            const list = overlay.querySelector('#lpSkipList');
            this._enableDragScroll(list);

            // ⚠️ 預先勾選「最下方」那個可應試的文位（＝離玩家目前程度最近、
            //    最容易達成的一個），並讓「越級應試」鈕直接呈現可點的硃紅色。
            //    先前是完全不勾選、鈕維持半透明鎖住樣式，玩家常常誤以為
            //    整個功能點不動，還沒看清清單就放棄了（回報過）。
            const usableBtns = overlay.querySelectorAll('.lp-skip-item[data-rank]');
            if (usableBtns.length) {
                const defaultBtn = usableBtns[usableBtns.length - 1];
                defaultBtn.classList.add('lp-skip-picked');
                picked = defaultBtn.getAttribute('data-rank');
                goBtn.disabled = false;
            }

            // ⚠️ 預先捲到「第一個可應試的文位」。
            //    清單是文位低者在下，而玩家可考的通常就在最下面那幾列，
            //    預設停在頂端的話玩家會看到一整片鎖住的項目，
            //    以為根本不能越級考（回報過）。
            //    用 requestAnimationFrame 等版面算完再捲，否則此時
            //    scrollHeight 還是 0，捲不動。
            const target = list.querySelector('.lp-skip-item[data-rank]');
            const scrollToTarget = function () {
                if (!target) { list.scrollTop = list.scrollHeight; return; }
                // 讓目標盡量置中，上下都露出一點，玩家才知道還能再拖
                list.scrollTop = Math.max(0,
                    target.offsetTop - (list.clientHeight - target.offsetHeight) / 2);
            };
            // 立刻捲一次（元素已在 DOM 內，讀 offsetTop 會強制算好版面），
            // 再用 rAF 補一次以防第一次讀到的尺寸還沒穩定。
            // ⚠️ 不能「只」用 rAF：分頁在背景時 rAF 會被暫停，
            //    玩家切回來就會看到清單停在最上面那一片鎖住的項目。
            scrollToTarget();
            requestAnimationFrame(scrollToTarget);
        },

        /**
         * 讓清單可以用手指／滑鼠拖曳上下捲動。
         *
         * ⚠️ 捲動軸已用 CSS 隱藏（見 .lp-skip-list），因此**必須**有這個，
         *    否則在沒有滾輪的觸控裝置上，被裁掉的那幾列就完全拿不到。
         * ⚠️ 只有真的拖動超過門檻才視為捲動：否則手指按下時的微小位移
         *    會把「點選文位」誤判成拖曳，玩家會覺得按鈕沒反應。
         */
        _enableDragScroll: function (el) {
            if (!el) return;
            let down = false, startY = 0, startTop = 0, moved = false;

            // ⚠️ 統一走 pointer 事件：滑鼠、觸控、觸控筆都是同一套，
            //    不必再分 mouse/touch 兩組，也不會有兩組同時觸發而捲兩倍的問題。
            const onDown = function (e) {
                down = true; moved = false;
                startY = e.clientY;
                startTop = el.scrollTop;
            };
            const onMove = function (e) {
                if (!down) return;
                const dy = e.clientY - startY;
                // 超過 4px 才算拖曳，否則手指按下時的微小抖動會被誤判成捲動，
                // 玩家會覺得「點了卻選不到」。
                if (!moved && Math.abs(dy) > 4) {
                    moved = true;
                    // 接管後續事件，即使指標滑出清單範圍也還能繼續拖
                    if (el.setPointerCapture && e.pointerId !== undefined) {
                        try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
                    }
                }
                if (moved) {
                    el.scrollTop = startTop - dy;
                    if (e.cancelable) e.preventDefault();
                }
            };
            const onUp = function (e) {
                down = false;
                if (el.releasePointerCapture && e && e.pointerId !== undefined) {
                    try { el.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
                }
            };

            el.addEventListener('pointerdown', onDown);
            el.addEventListener('pointermove', onMove, { passive: false });
            el.addEventListener('pointerup', onUp);
            el.addEventListener('pointercancel', onUp);

            // 拖曳過就吃掉這一次 click，避免放手時誤選到底下的文位；
            // 鎖住的項目（aria-disabled）也在這裡擋掉，因為它已經不是
            // disabled 按鈕、click 會照常發生。
            el.addEventListener('click', function (e) {
                const locked = e.target.closest && e.target.closest('[aria-disabled="true"]');
                if (moved || locked) {
                    e.stopPropagation();
                    e.preventDefault();
                    moved = false;
                }
            }, true);
        },

        /** 實際開始越級考試（收費、每日 5 次，見 FMExamConfig.EXAM_DAILY_LIMITS） */
        startSkipExam: function (rankName) {
            const C = window.FMExamConfig;
            const S = window.FMCollectionSave;
            const PS = window.PathStations;
            if (!C || !S || !PS || !window.ExamEngine) return;

            // 重入防護，理由同 startExam
            if (typeof window.ExamEngine.isBusy === 'function' && window.ExamEngine.isBusy()) {
                this.toast('考試進行中，請先考完或離場。');
                return;
            }

            // ⚠️ 2026-09-06 起 rankName 是**站名**（可能是小考站）。
            //    而且越級必須依序：只有「下一個還沒通過的考試站」可以考。
            const station = PS.getStationByName(rankName);
            if (!station || !station.examKind) {
                this.toast('「' + rankName + '」沒有安排考試。');
                return;
            }
            const menu = C.getSkipMenu();
            const row = menu.filter(function (m) { return m.name === rankName; })[0];
            if (!row || !row.enabled) {
                this.toast('越級考試須逐場依序通過，尚輪不到「' + rankName + '」。');
                return;
            }

            const coll = S.load();
            if (!C.canAttemptToday(coll, 'skip', rankName)) {
                this.toast('今日越級考試已用完（每日 ' + C.dailyLimit('skip') + ' 次），明日請早。');
                return;
            }
            const fee = this.getExamFee(rankName) * C.SKIP_FEE_MULTIPLIER;
            if ((coll.silver || 0) < fee) {
                this.toast('盤纏不足，越級報名費需 ' + fee.toLocaleString() + ' 文錢。');
                return;
            }

            // 同 startExam：報名費／今日名額只在玩家真的按下「入場應試」才扣，
            // 且入場當下必須重新驗一次餘額，否則文錢會被扣成負數。
            const self0 = this;
            const onEnter = function () {
                const coll2 = S.load();
                if ((coll2.silver || 0) < fee) {
                    window.ExamEngine._abortReason =
                        '盤纏不足，越級報名費需 ' + fee.toLocaleString() + ' 文錢。';
                    self0.toast('盤纏不足，越級報名費需 ' + fee.toLocaleString() + ' 文錢。');
                    return false;
                }
                S.addSilver(coll2, -fee, 'exam_fee', '越級-' + rankName);
                C.markAttemptToday(coll2, 'skip', rankName);
                S.save(coll2);
                if (window.CollectionDialog && typeof window.CollectionDialog.refreshHud === 'function') {
                    window.CollectionDialog.refreshHud();
                }
                return true;
            };

            this.hide();
            const self = this;
            window.ExamEngine.start({
                onEnter: onEnter,
                rankName: rankName,
                mode: 'skip',
                onDone: function () {
                    // 越級通過會改寫站點進度，必須重算快取再重畫
                    self.invalidateProgress();
                    self.show();
                    setTimeout(function () { self.scrollToCurrent(true); }, 120);
                }
            });
        },

        /**
         * 晉升後的全畫面慶祝動畫（企劃書 §5）。
         *
         * 實際演出由 promotionCelebration.js 負責（三幕：詩句浮現 → 拖曳擾動
         * → 獎狀浮現）。這裡保留同名函式作為青雲梯對外的統一入口，
         * exam.js 與 achievement.js 的測試熱鍵也都是打這支。
         *
         * ⚠️ 若 promotionCelebration.js 沒載入，就退回 achievement.js 的
         *    單張獎狀畫面，確保流程不會卡死在沒有動畫的狀態。
         */
        playPromotionCelebration: function (station, silver, onDone) {
            const done = () => { if (typeof onDone === 'function') onDone(); };

            if (window.PromotionCelebration && typeof window.PromotionCelebration.play === 'function') {
                window.PromotionCelebration.play({ station: station, silver: silver, onDone: done });
                return;
            }

            // ── 降級：只顯示獎狀，不播詩句動畫 ──
            const AD = window.AchievementDialog;
            if (!AD || typeof AD.showCert !== 'function' || !station) { done(); return; }
            const isRank = station.type === 'rank';
            let imgUrl = null;
            if (isRank && Array.isArray(AD.certImages) && AD.certImages.length) {
                const ms = (window.PathStations && window.PathStations.getMilestones)
                    ? window.PathStations.getMilestones() : [];
                let idx = 0;
                for (let i = 0; i < ms.length; i++) { if (ms[i].name === station.name) { idx = i; break; } }
                imgUrl = AD.certImages[Math.min(idx, AD.certImages.length - 1)];
            }
            // 恭賀「剛通過的文位」、告知「即將進入的新課程」——
            // 兩個站名的算法見 _getPrevNextStationNames 的說明；
            // 這段文字與 promotionCelebration.js 的 _showCert 保持同一套邏輯，
            // 純粹是「PromotionCelebration 沒載入時」的降級版本。
            const neighbor = this._getPrevNextStationNames(station);
            let text;
            if (neighbor.isExamPass) {
                text = neighbor.isFinal
                    ? `恭賀
寒窗苦讀，終登「${station.name}」之境！
青雲梯至此已無新詩可修，
不妨轉戰漢堡選單，挑一款喜愛的遊戲，
痛快衝一波排行榜積分！`
                    : `恭賀
寒窗苦讀，終登「${station.name}」文位！
即將修習「${neighbor.nextName}」課程，
願君持此文心，再續錦繡華章。`;
            } else if (isRank) {
                text = `恭賀
已通過「${neighbor.prevName}」全部課程，
榮登「${station.name}」文位！
寒窗不負苦心人，願君持此文心，再續錦繡華章。`;
            } else {
                text = `恭賀
已通過「${neighbor.prevName}」全部課程，
晉「${station.name}」。
積跬步以至千里，前路尚有好詩相候。`;
            }
            AD.showCert(imgUrl, text, silver > 0, 0, silver);
            const overlay = document.getElementById('certOverlay');
            if (!overlay) { done(); return; }
            const onClick = () => { overlay.removeEventListener('click', onClick); setTimeout(done, 60); };
            overlay.addEventListener('click', onClick);
        },

        /** 溫習確認彈窗：點到已走過的舊站點時出現 */
        /**
         * 「溫故知新」確認彈窗。
         *
         * @param {object}   station 這一站
         * @param {Function} onAgree 玩家按下「同意溫習」後要做的事
         * @param {string}   [reason] 'past'（預設，回頭點已走過的舊站）
         *                            'done'（這一站課程已修完、只差考試）
         *                            —— 兩者都是溫習，但「接下來該做什麼」
         *                            完全不同，文案必須分開：前者要玩家往上走，
         *                            後者要玩家去應試，寫錯會把玩家導到死路。
         */
        showReviewConfirm: function (station, onAgree, reason) {
            const isDone = (reason === 'done');
            const body = isDone
                ? '「<b>' + station.name + '</b>」的課程你已經全部修畢，'
                + '目前卡在<b>考試</b>這一關，還沒中式。'
                + '在這裡重玩<b>不會增加晉升局數</b>，也不會讓站點前進，'
                + '純粹供你考前溫習；過關仍可照常獲得文錢與積分。<br><br>'
                + '想繼續往前走，請點這一站的<b>「正式考」</b>應試中式，'
                + '沒把握可先點<b>「模擬考」</b>練手感。'
                : '「<b>' + station.name + '</b>」是你已經走過的路。'
                + '在這裡重玩<b>不會增加晉升局數</b>，純粹供你溫習舊作；'
                + '過關仍可照常獲得文錢與積分。<br><br>'
                + '想繼續往前走，請點選道路最上方的站。';
            const html = '<h2>溫故知新</h2>'
                + '<p>' + body + '</p>'
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
            const idx = this.getCurrentStationIndex();
            const y = this.trackHeight - BOT_PAD - idx * SPACING;
            // 讓目前站落在可視區偏下方，上方預留即將前往的關卡
            const target = Math.max(0, y - scroll.clientHeight * 0.68);
            if (smooth && scroll.scrollTo) scroll.scrollTo({ top: target, behavior: 'smooth' });
            else scroll.scrollTop = target;
        },

        // 供其他模組（考試資格判定等）查詢用
        GAME_CHANNELS: GAME_CHANNELS,
        GAME_NAMES: GAME_NAMES,
        REVIEW_ONLY_GAMES: REVIEW_ONLY_GAMES,

        // ── 以下純供 tools/verify_learning_path.js 對照用 ──────────────
        // ⚠️ 驗證程式若改用正規表示式從原始碼刮這些常數，只要換行或
        //    加註解就會刮錯，等於驗了個假的。這裡直接把「唯一那一份」
        //    公開出去，驗證程式與遊戲讀到的必定是同一組數字。
        //    這些是唯讀對照表，任何模組都不應該去改它們的內容。
        GAME_UNLOCK: GAME_UNLOCK,
        LONG_GAMES: LONG_GAMES,
        CHANNEL_WEIGHTS: CHANNEL_WEIGHTS,
        MIN_CHANNELS_PER_STATION: MIN_CHANNELS_PER_STATION,
        MAX_SAME_GAME_STREAK: MAX_SAME_GAME_STREAK,
        RECENT_WINDOW: RECENT_WINDOW,
        SKIP_FAIL_THRESHOLD: SKIP_FAIL_THRESHOLD,
        SKIP_FEE_BY_TIER: SKIP_FEE_BY_TIER
    };

    window.LearningPath = LearningPath;
})();
