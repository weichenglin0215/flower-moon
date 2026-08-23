/**
 * 分數與存檔管理器 (ScoreManager)
 * 負責處理各個遊戲的得分計算、存檔管理、以及過關動畫。
 */
const ScoreManager = {
    // 難度乘數：根據選定的難度對基礎分數進行加成
    multipliers: {
        '小學': 1,
        '中學': 2,
        '高中': 3,
        '大學': 4,
        '研究所': 5
    },

    // 追蹤當前正在執行的結算動畫，以便在中途開新局時取消
    activeIntervals: [],

    // 各個遊戲的分數基準設定
    // base: 過關基礎分, heart: 每顆剩餘紅心得分, time: 每秒剩餘時間得分
    // getPointA：遊戲中得分A(例如：擊石鳴詩擊中文字一次)
    // getPointB：遊戲中得分B(例如：擊石鳴詩消除一行詩句)

    gameSettings: {
        'game1': { base: 50, heart: 10, time: 1 }, //慢思快選
        'game2': { base: 100, heart: 10, time: 2, getPointA: 10 }, //飛花令
        'game3': { base: 100, heart: 10, time: 0, getPointA: 5 }, //字爬梯，無時間限制
        'game4': { base: 100, heart: 10, time: 2, getPointA: 10 }, //眾裡尋他千百度
        'game5': { base: 100, heart: 10, time: 1, getPointA: 25 }, //詩詞小精靈
        'game6': { base: 100, heart: 10, time: 1, getPointA: 3 }, //詩陣侵略
        'game7': { base: 100, heart: 10, time: 1, getPointA: 10 }, //青鳥雲梯
        'game8': {
            base: 100, heart: 10, time: 1, getPointA: 2,
            // 一筆裁詩：研究所無提示且必須一筆到底，但答案字數與低難度差不多；
            // 用 getPointAMul 提高高難度的過程得分以反映實際挑戰
            getPointAMul: { '小學': 1.0, '中學': 1.2, '高中': 1.5, '大學': 2.5, '研究所': 4.0 }
        }, //一筆裁詩
        'game9': { base: 100, heart: 10, time: 5, getPointA: 0.5 }, //詩韻鎖扣
        'game10': { base: 100, heart: 10, time: 0, getPointA: 1, getPointB: 20 }, //擊石鳴詩，無時間限制
        'game11': { base: 100, heart: 10, time: 0, getPointA: 5, getPointB: 30 }, //翻墨識蹤，無時間限制
        'game12': { base: 100, heart: 10, time: 2, getPointA: 20 }, //疏影橫斜
        'game13': { base: 100, heart: 10, time: 1, getPointA: 20 }, //人事時地
        'game14': { base: 100, heart: 10, time: 3, getPointA: 5 }, //步步驚心
        'game15': { base: 100, heart: 10, time: 2, getPointA: 15 }, //墨韻游龍
        'game16': { base: 100, heart: 5, time: 0, getPointA: 5 }, //打地詩，無時間限制 
        'game17': { base: 100, heart: 10, time: 2, getPointA: 5 }, //青蛙過河
        'game19': { base: 100, heart: 10, time: 0, getPointA: 5 }, //詩碟狂襲，無時間限制
        'game20': { base: 100, heart: 50, time: 3, getPointA: 0 }, //丟三落一（單題決勝，無連續得分）
        'game21': {
            base: 100, heart: 0, time: 1, getPointA: 20,
            getPointAMul: { '小學': 1.0, '中學': 1.5, '高中': 2.0, '大學': 3.0, '研究所': 4.0 }
        }, //橫批成詩（單題決勝，時限長故每秒分數較低）
        'game22': {
            base: 100, heart: 0, time: 1, getPointA: 20,
            getPointAMul: { '小學': 1.0, '中學': 1.0, '高中': 1.0, '大學': 1.0, '研究所': 1.0 }
        }, //詩詞拼圖（單題決勝，時限長故每秒分數較低）
        'game23': {
            base: 100, heart: 0, time: 1, getPointA: 10,
            getPointAMul: { '小學': 1.0, '中學': 1.5, '高中': 2.0, '大學': 3.0, '研究所': 4.0 }
        }, //縱橫集句（單題決勝，時限長故每秒分數較低）
        'game24': { base: 100, heart: 10, time: 3, getPointA: 1 }, //三字成珠（三消連線）
        'game25': { base: 100, heart: 10, time: 3, getPointA: 1 }, //連珠拾字（路徑連消）
        'game26': { base: 100, heart: 10, time: 3, getPointA: 1 }, //投珠破句（泡泡龍）
        'game27': { base: 100, heart: 10, time: 3, getPointA: 1 }, //詩磚壘塔（俄羅斯方塊）
        'game28': { base: 100, heart: 10, time: 2, getPointA: 2 }, //兩心相印（連連看）
        'game29': { base: 100, heart: 10, time: 3, getPointA: 1 }, //字龍盤環（滾球收集）
        'game30': { base: 100, heart: 10, time: 3, getPointA: 1 }, //層巒疊翠（麻將疊疊）
        'game31': { base: 100, heart: 10, time: 3, getPointA: 15 }, //詩眼覓蹤（字詞替換）
        'game32': { base: 100, heart: 10, time: 0, getPointA: 1 }, //尋詩地圖（地圖故事）
        'game33': {
            base: 50, heart: 30, time: 1, getPointA: 25,
            getPointAMul: { '小學': 0.66, '中學': 1.0, '高中': 1.25, '大學': 2.0, '研究所': 3.0 } //作者是誰（每張未翻開的線索卡 × getPointA，越早猜中分數越高）
        },
        'game34': { base: 100, heart: 10, time: 0, getPointA: 1 }, //猜猜詩題（標題配對）
        'game35': { base: 100, heart: 10, time: 0, getPointA: 1 }, //詩人心情（情境推理）
        'game36': { base: 100, heart: 0, time: 0.5, getPointA: 0 }, //轉輪覓詩（Wordle 推理，無紅心，時限只給時間加成）
        'game37': { base: 100, heart: 10, time: 2, getPointA: 3 }, //步步為陣（getPointA 會再依當前宮格邊長倍增，見 game37.js handleBtnClick）
        'game38': {
            base: 100, heart: 0, time: 5, getPointA: 2, getPointB: 20,
            getPointAMul: { '小學': 1.0, '中學': 2.0, '高中': 3.0, '大學': 4.0, '研究所': 5.0 }
        }, //推枰成詩（無紅心機制；getPointA 為方塊落到正確位置的即時得分，getPointB 為整句完成的額外獎勵）
        'game39': {
            base: 100, heart: 0, time: 4, getPointA: 4, getPointB: 40,
            getPointAMul: { '小學': 1.0, '中學': 2.0, '高中': 3.0, '大學': 4.0, '研究所': 5.0 },
            getPointBMul: { '小學': 1.0, '中學': 2.0, '高中': 3.0, '大學': 4.0, '研究所': 5.0 }
        }, //彈珠成詩（無紅心機制；time 換算的是「剩餘彈珠數」，getPointA 為一字歸位、getPointB 為整句完成）
        'game40': {
            base: 100, heart: 10, time: 2, getPointA: 2, getPointB: 20,
            getPointAMul: { '小學': 1.0, '中學': 2.0, '高中': 3.0, '大學': 4.0, '研究所': 5.0 },
            getPointBMul: { '小學': 1.0, '中學': 2.0, '高中': 3.0, '大學': 4.0, '研究所': 5.0 }
        } //點兵成詩（getPointA 為點對一塊字，getPointB 為某個字全數點齊的額外獎勵）
    },

    // 玩家階級設定：根據總分決定玩家的級別
    ranks: [
        { name: '書僮', minScore: 0 },
        { name: '蒙童', minScore: 10000 },
        { name: '塾生', minScore: 20000 },
        { name: '童生', minScore: 40000 },
        { name: '縣案首', minScore: 80000 },
        { name: '府案首', minScore: 160000 },
        { name: '文童', minScore: 320000 },
        { name: '秀才', minScore: 640000 },
        { name: '舉人', minScore: 1280000 },
        { name: '貢士', minScore: 2560000 },
        { name: '進士', minScore: 5120000 },
        { name: '探花', minScore: 10240000 },
        { name: '榜眼', minScore: 20480000 },
        { name: '狀元', minScore: 40960000 },
        { name: '大儒', minScore: 81920000 }
    ],

    /**
     * 取得指定遊戲的基礎通關分
     */
    getBaseScore: function (gameKey) {
        return this.gameSettings[gameKey]?.base || 100;
    },

    /**
     * 取得每顆紅心的獎勵得分
     */
    getHeartScore: function (gameKey) {
        return this.gameSettings[gameKey]?.heart || 10;
    },

    /**
     * 取得每一秒剩餘時間的獎勵得分
     */
    getTimeScore: function (gameKey) {
        return this.gameSettings[gameKey]?.time || 5;
    },

    /**
     * 取得遊戲中 A 類即時得分（已套用該難度的可選倍率 getPointAMul）
     * 各遊戲應透過此函式取得 getPointA，而不要直接讀取 gameSettings[gameKey].getPointA，
     * 否則難度倍率不會生效。回傳值可能為小數，呼叫端請保留浮點累計、顯示時再 Math.floor。
     */
    getPointA: function (gameKey, difficulty) {
        const s = this.gameSettings[gameKey];
        if (!s) return 0;
        const mul = (s.getPointAMul && s.getPointAMul[difficulty]) || 1;
        return (s.getPointA || 0) * mul;
    },

    /**
     * 取得遊戲中 B 類即時得分（已套用該難度的可選倍率 getPointBMul）
     * 設計同 getPointA，預設無倍率時 mul=1，回傳原始 getPointB。
     */
    getPointB: function (gameKey, difficulty) {
        const s = this.gameSettings[gameKey];
        if (!s) return 0;
        const mul = (s.getPointBMul && s.getPointBMul[difficulty]) || 1;
        return (s.getPointB || 0) * mul;
    },

    /**
     * 根據總分計算目前的玩家階級（供「積分是否達到門檻」判定用）
     */
    getCurrentRank: function (score) {
        let currentRank = this.ranks[0].name;
        for (let i = 0; i < this.ranks.length; i++) {
            if (score >= this.ranks[i].minScore) {
                currentRank = this.ranks[i].name;
            } else {
                break;
            }
        }
        return currentRank;
    },

    // 縣案首起的文位（必須通過考試 + 領取獎狀才生效）
    EXAM_RANK_NAMES: ['縣案首', '府案首', '文童', '秀才', '舉人', '貢士', '進士', '探花', '榜眼', '狀元', '大儒'],

    /**
     * 依「積分」+「已領獎狀」交叉判定實際文位（供 UI 顯示用）。
     *  - 書僮 ~ 童生：仍以積分推算
     *  - 縣案首以上：僅回傳 achievements.claimed 中已領取的最高文位
     *    未領取者，即便通過考試（ranks.passed）或積分達標，仍顯示上一個已領文位（預設『童生』）
     */
    getEffectiveRank: function (playerData) {
        if (!playerData) return this.ranks[0].name;
        const score = Math.floor(playerData.totalScore || 0);
        const claimed = (playerData.achievements && playerData.achievements.claimed) || [];
        const coll = (window.FMCollectionSave && window.FMCollectionSave.load && window.FMCollectionSave.load()) || {};
        const passed = (coll.ranks && coll.ranks.passed) || [];

        // 由高到低找出「已通過考試 且 已領獎狀」的最高文位
        for (let i = this.EXAM_RANK_NAMES.length - 1; i >= 0; i--) {
            const name = this.EXAM_RANK_NAMES[i];
            if (passed.indexOf(name) >= 0 && claimed.includes('rank_' + name)) return name;
        }

        // 尚未領任何考試文位獎狀：以積分推算，但封頂在「童生」
        let currentRank = this.ranks[0].name;
        for (let i = 0; i < this.ranks.length; i++) {
            const r = this.ranks[i];
            if (this.EXAM_RANK_NAMES.indexOf(r.name) >= 0) break;  // 遇到考試階級即停
            if (score >= r.minScore) currentRank = r.name;
            else break;
        }
        return currentRank;
    },

    /**
     * 儲存分數並更新 LocalStorage 中的玩家資料
     */
    saveScore: function (gameKey, difficulty, finalScore, poemId, durationS) {
        finalScore = Math.floor(finalScore);
        let data = this.loadPlayerData();

        data.totalScore += finalScore;

        // 更新各別這戲的紀錄
        if (gameKey) {
            if (!data.games[gameKey]) {
                data.games[gameKey] = { playCount: 0, highScore: 0, highestDifficulty: '未挑戰', totalStars: 0, byDifficulty: {} };
            }
            if (!data.games[gameKey].byDifficulty) data.games[gameKey].byDifficulty = {};

            data.games[gameKey].playCount++;
            if (finalScore > data.games[gameKey].highScore) {
                data.games[gameKey].highScore = finalScore;
            }

            const diffIndex = ['小學', '中學', '高中', '大學', '研究所'];
            const currentDiffIdx = diffIndex.indexOf(difficulty);
            const highestDiffIdx = diffIndex.indexOf(data.games[gameKey].highestDifficulty);
            if (currentDiffIdx > highestDiffIdx) {
                data.games[gameKey].highestDifficulty = difficulty;
            }

            // 紀錄每個難度的個別統計 (play次數 + 最高分)
            if (difficulty && diffIndex.includes(difficulty)) {
                if (!data.games[gameKey].byDifficulty[difficulty]) {
                    data.games[gameKey].byDifficulty[difficulty] = { playCount: 0, highScore: 0 };
                }
                data.games[gameKey].byDifficulty[difficulty].playCount++;
                if (finalScore > data.games[gameKey].byDifficulty[difficulty].highScore) {
                    data.games[gameKey].byDifficulty[difficulty].highScore = finalScore;
                }
            }

            // 紀錄各難度的累計通關次數
            if (!data.difficultyCounts) {
                data.difficultyCounts = { '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0 };
            }
            if (difficulty && difficulty in data.difficultyCounts) {
                data.difficultyCounts[difficulty]++;
            }
        }

        // 更新全局階級
        data.globalRank = this.getCurrentRank(data.totalScore);

        // 紀錄詩詞遊玩次數（與 saveScore 合併為一次 localStorage 寫入）
        if (poemId && difficulty) {
            const diffs = ['小學', '中學', '高中', '大學', '研究所'];
            if (!data.poemRecords) data.poemRecords = {};
            if (!data.poemRecords[poemId]) {
                data.poemRecords[poemId] = { '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0 };
            }
            if (diffs.includes(difficulty)) {
                data.poemRecords[poemId][difficulty]++;
            }
        }

        // 寫入 localStorage 並更新 UI
        localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        this.updateProfileUI(data);

        // ── 增加文錢（收集系統企畫書：100 分 = 1 文錢）──
        if (finalScore > 0 && window.FMCollectionSave) {
            try {
                const silverGained = Math.floor(finalScore / 100);
                if (silverGained > 0) {
                    const collData = window.FMCollectionSave.load();
                    collData.silver = (collData.silver || 0) + silverGained;
                    window.FMCollectionSave.save(collData);
                    // 若「江南小院」畫面正開著，即時刷新 HUD
                    if (window.Collection && typeof window.Collection.refreshHud === 'function') {
                        window.Collection.refreshHud();
                    }
                }
            } catch (e) {
                console.warn('[ScoreManager] 發放文錢失敗:', e);
            }
        }

        // 同步存檔至雲端並寫入 LOG
        if (window.SupabaseClient && gameKey) {
            window.SupabaseClient.saveGameToCloud(data);
            window.SupabaseClient.logGame({
                gameNo: parseInt(gameKey.replace('game', '')) || 0,
                difficulty: difficulty || '',
                score: finalScore,
                isWin: true,
                durationS: durationS || 0  // 本局遊玩時長（秒）
            });
        } else if (window.SupabaseClient) {
            window.SupabaseClient.saveGameToCloud(data);
        }
    },


    /**
     * 更新全局顯示的玩家資料 (例如選單中的總分)
     */
    updateProfileUI: function (data) {
        const scoreEl = document.getElementById('player-total-score');
        if (scoreEl) {
            scoreEl.textContent = Math.floor(data.totalScore);
        }
    },

    /**
     * 獲取玩家資料的初始化模版
     */
    getDefaultData: function () {
        return {
            version: "1.2",
            nickname: '訪客',
            totalScore: 0,
            globalRank: '書僮',
            playDays: 1,
            lastPlayedDate: new Date().toISOString().split('T')[0],
            games: {},
            levelProgress: {}, // 格式: { gameKey: { '小學': 0, '中學': 0, ... } } — 各難度最高通關關卡（供鎖定判斷）
            levelCleared: {},  // 格式: { gameKey: { '小學': [1,3,5,...], ... } } — 個別通關關卡紀錄（供星星顯示）
            // 青雲梯累計局數：玩家每贏一局就 +1，只增不減、絕不跳號。
            // ⚠️ 這是「給人看」的數字，與 levelCleared 的關卡編號完全不同：
            //    關卡編號（tier + levelIndex）是**題庫位址**（哪首詩的哪一聯），
            //    會重複、會跳號，拿來當進度顯示對玩家毫無意義。
            pathRounds: 0,
            poemRecords: {},   // 格式: { poemId: { '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0 } }
            difficultyCounts: {
                '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0
            },
            achievements: {
                unlocked: [],
                progress: {},
                claimed: []
            },
            settings: {
                soundEffects: true,
                bgm: true
            }
        };
    },

    /**
     * 數據遷移：處理舊版資料升級
     */
    migrateData: function (data) {
        if (!data) return this.getDefaultData();

        // 版本升級檢查
        if (data.version && parseFloat(data.version) < 1.2) {
            if (!data.levelProgress) data.levelProgress = {};
            data.version = "1.2";
        }

        if (data.version && parseFloat(data.version) >= 1.2) {
            // 即便版本符合，也要確保分數是整數 (針對已污染的資料)
            data.totalScore = Math.floor(data.totalScore || 0);
            if (data.games) {
                for (let key in data.games) {
                    if (data.games[key] && data.games[key].highScore) {
                        data.games[key].highScore = Math.floor(data.games[key].highScore);
                    }
                }
            }
            if (!data.poemRecords) data.poemRecords = {};

            // ⚠️ 已移除的相容性補丁（2026-08-23 青雲梯改版）─────────────────
            // 舊版在此會「若 levelCleared 為空但 levelProgress 有資料，
            // 就把 levelCleared 回填成 1~maxIdx」，用來還原舊存檔的星星。
            //
            // 這在舊制（關卡依序解鎖、通關必然連續）是合理的，但新制會出事：
            // 青雲梯的進度判準是「同一關用三種不同提取方式通過」，
            // 而回填會一次補齊多款遊戲的通關紀錄。實測某存檔
            // game1／game8／game14 各到小學 17 關（分屬語感／空間／字序三通道），
            // 回填後小學第 1~17 關全部被判定為已完成，玩家憑空前進 17 關。
            //
            // 花月尚未正式上線，依作者決議採最乾淨的處理方式：
            // 移除補丁，並以 tools/reset_progress.js 清空既有的關卡資料。
            if (!data.levelCleared) data.levelCleared = {};

            return data;
        }

        // 基礎遷移邏輯
        const newData = this.getDefaultData();
        newData.nickname = data.nickname || '訪客';
        newData.totalScore = Math.floor(data.totalScore || 0);
        newData.globalRank = this.getCurrentRank(newData.totalScore);

        if (data.difficultyCounts) {
            newData.difficultyCounts = Object.assign(newData.difficultyCounts, data.difficultyCounts);
        }
        if (data.games) {
            newData.games = data.games;
        }
        if (data.levelProgress) {
            newData.levelProgress = data.levelProgress;
        }
        if (data.levelCleared) {
            newData.levelCleared = data.levelCleared;
        }
        if (data.poemRecords) {
            newData.poemRecords = data.poemRecords;
        }

        if (data.badges && Array.isArray(data.badges)) {
            newData.achievements.unlocked = data.badges;
        }
        if (data.achievements) {
            if (data.achievements.claimed) newData.achievements.claimed = data.achievements.claimed;
        }

        localStorage.setItem('flowerMoon_playerData', JSON.stringify(newData));
        return newData;
    },

    /**
     * 從 LocalStorage 載入玩家資料
     */
    loadPlayerData: function () {
        let rawData = localStorage.getItem('flowerMoon_playerData');
        let data = null;
        try {
            data = rawData ? JSON.parse(rawData) : null;
        } catch (e) {
            console.error("解析存檔失敗:", e);
        }

        data = this.migrateData(data);

        // 雙重檢查確保 levelProgress / levelCleared / poemRecords 結構正確
        if (!data.levelProgress) data.levelProgress = {};
        if (!data.levelCleared) data.levelCleared = {};
        if (!data.poemRecords) data.poemRecords = {};

        // 更新累計登入天數
        const today = new Date().toISOString().split('T')[0];
        if (data.lastPlayedDate !== today) {
            data.playDays = (data.playDays || 0) + 1;
            data.lastPlayedDate = today;
            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        }

        // 再次確保返回的內容沒有小數點
        data.totalScore = Math.floor(data.totalScore || 0);
        if (data.games) {
            for (let key in data.games) {
                if (data.games[key] && data.games[key].highScore) {
                    data.games[key].highScore = Math.floor(data.games[key].highScore);
                }
            }
        }

        return data;
    },

    /**
     * 紀錄關卡通關進度
     */
    // 將全域關卡編號 (1~300) 轉換為該難度分類下的相對編號
    getRelativeLevelIndex: function (globalIndex) {
        if (globalIndex <= 20) return { difficulty: '小學', relIdx: globalIndex };
        if (globalIndex <= 50) return { difficulty: '中學', relIdx: globalIndex - 20 };
        if (globalIndex <= 100) return { difficulty: '高中', relIdx: globalIndex - 50 };
        if (globalIndex <= 150) return { difficulty: '大學', relIdx: globalIndex - 100 };
        return { difficulty: '研究所', relIdx: globalIndex - 150 };
    },

    completeLevel: function (gameKey, difficulty, levelIndex) {
        let data = this.loadPlayerData();
        if (!data.levelProgress[gameKey]) {
            data.levelProgress[gameKey] = { '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0 };
        }
        if (!data.levelCleared) data.levelCleared = {};
        if (!data.levelCleared[gameKey]) data.levelCleared[gameKey] = {};
        if (!data.achievements) data.achievements = { unlocked: [], progress: {}, claimed: [] };
        if (!data.achievements.unlocked) data.achievements.unlocked = [];

        // ── 關卡編號改制（2026-08 學習道路改版）────────────────────────
        // 舊制：1~300 的全域編號，需換算成 (難度, 相對編號)，且 1~51 為自由區。
        // 新制：每個難度層各自從 1 起算（小學第 1 關、中學第 1 關…），
        //       難度層由兩欄式選單的右欄直接指定，因此完全不需要換算。
        //       自由度改由「玩家可自選難度層」提供，層內則維持依序解鎖。
        //       （舊制進度已依企畫書第三章原則 9 全部歸零，不需相容。）
        const finalDifficulty = difficulty;
        const finalRelIdx = levelIndex;

        let needsSave = false;
        let achIdToReturn = null;

        // ── 累計局數（青雲梯「第 X 局」與頂端「局數」的來源）──────────
        // 不論是不是重複練同一個關卡編號、不論換了哪一款遊戲，
        // 只要贏了一局就 +1，確保玩家看到的是連續遞增的數字。
        data.pathRounds = (data.pathRounds || 0) + 1;
        needsSave = true;

        // 個別通關紀錄（選關介面的星星顯示用）
        if (!data.levelCleared[gameKey][finalDifficulty]) {
            data.levelCleared[gameKey][finalDifficulty] = [];
        }
        if (!data.levelCleared[gameKey][finalDifficulty].includes(finalRelIdx)) {
            data.levelCleared[gameKey][finalDifficulty].push(finalRelIdx);
            needsSave = true;
        }

        // 該難度層的最高通關關卡（下一關的解鎖判斷用）
        const currentMax = data.levelProgress[gameKey][finalDifficulty] || 0;
        if (finalRelIdx > currentMax) {
            data.levelProgress[gameKey][finalDifficulty] = finalRelIdx;
            needsSave = true;
        }

        // ─────────────────────────────────────────────────────
        // 里程碑成就：當全域編號為 20 的倍數 (20, 40, 60, ..., 300)
        // 不再依賴累計通關次數，與通關順序無關
        // ─────────────────────────────────────────────────────
        if (levelIndex > 0 && levelIndex % 20 === 0) {
            const achId = `level_milestone_${gameKey}_${levelIndex}`;
            if (!data.achievements.unlocked.includes(achId)) {
                data.achievements.unlocked.push(achId);
                achIdToReturn = achId;
                needsSave = true;
            }
        }

        if (needsSave) {
            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
            // ★ 修復關鍵：通關紀錄必須同步至雲端，避免下次開啟時被舊雲端資料覆蓋
            if (window.SupabaseClient) {
                window.SupabaseClient.saveGameToCloud(data);
            }
        }
        return achIdToReturn;
    },

    // ══════════════════════════════════════════════════════════════════
    //  青雲梯：關卡失敗計數與捐納跳關
    //  對應企畫書 note/學習道路_重新規劃企劃書.md 第 8.3 節
    //  ── 為什麼需要 ────────────────────────────────────────────────
    //  積分原本是軟性門檻，卡住也能刷過去；改為「必通關卡」硬性門檻後
    //  就成了硬牆。現成的例子：game37 研究所 minChars:40 配 4 句，
    //  在現有詩庫中數學上無解，玩家會永遠卡死。
    //  因此逃生口是必需品，不是加值功能。
    // ══════════════════════════════════════════════════════════════════

    /** 內部共用：寫回玩家存檔並同步雲端（模組外不得直接碰 localStorage） */
    _persist: function (data) {
        localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        if (window.SupabaseClient) {
            window.SupabaseClient.saveGameToCloud(data);
        }
    },

    /** 累計某一關的失敗次數（由 learningPath.js 在返回時推定） */
    recordLevelFail: function (tier, level) {
        const data = this.loadPlayerData();
        if (!data.levelFails) data.levelFails = {};
        const key = tier + '|' + level;
        data.levelFails[key] = (data.levelFails[key] || 0) + 1;
        this._persist(data);
        return data.levelFails[key];
    },

    /** 查詢某一關累計失敗幾次 */
    getLevelFails: function (tier, level) {
        const data = this.loadPlayerData();
        const fails = (data && data.levelFails) || {};
        return fails[tier + '|' + level] || 0;
    },

    /**
     * 捐納跳關：把某一關記為「視同完成」。
     * 另存於 levelDonated，不偽造 levelCleared 的遊戲別紀錄，
     * 以免污染成就系統的「某遊戲通關 N 次」統計。
     */
    markLevelDonated: function (tier, level) {
        const data = this.loadPlayerData();
        if (!data.levelDonated) data.levelDonated = {};
        if (!data.levelDonated[tier]) data.levelDonated[tier] = [];
        if (data.levelDonated[tier].indexOf(level) === -1) {
            data.levelDonated[tier].push(level);
            this._persist(data);
        }
    },

    /**
     * 清空所有關卡相關進度（本機 + 推送至雲端覆蓋）。
     *
     * ── 為什麼需要這個 ────────────────────────────────────────────────
     * 青雲梯改版把進度判準從「積分」換成「同一關用三種提取方式通過」，
     * 舊制留下的 levelProgress / levelCleared 在新制下語意不同，
     * 會讓玩家一登入就憑空前進一大段（見企畫書 16.2(g)）。
     * 花月尚未正式上線，依作者決議直接清空，不做遷移。
     *
     * ⚠️ 只清關卡進度，**不動**積分、文錢、成就、詩詞紀錄與暱稱。
     *
     * @returns {object} 清除前的統計，供確認用
     */
    resetLevelProgress: function () {
        const data = this.loadPlayerData();
        const before = {
            levelProgress: Object.keys(data.levelProgress || {}).length,
            levelCleared: Object.keys(data.levelCleared || {}).length,
            levelDonated: Object.keys(data.levelDonated || {}).length,
            levelFails: Object.keys(data.levelFails || {}).length
        };
        data.levelProgress = {};
        data.levelCleared = {};
        data.levelDonated = {};
        data.levelFails = {};
        data.pathRounds = 0;
        this._persist(data);
        if (window.LearningPath && typeof window.LearningPath.invalidateProgress === 'function') {
            window.LearningPath.invalidateProgress();
        }
        console.log('[ScoreManager] 已清空關卡進度', before);
        return before;
    },

    /**
     * 【測試期用】完整重置一位玩家的所有資料。
     *
     * ── 為什麼需要這個 ────────────────────────────────────────────────
     * 玩家資料散在三個地方，只清其中一處會留下鬼魂資料：
     *   1. flowerMoon_playerData      積分、關卡、成就
     *   2. flowerMoon_collection_v1   文錢、考試通過紀錄、江南小院
     *   3. 雲端 player_saves / game_logs
     * 實際發生過：只在雲端下了 delete，重開遊戲後成就頁仍要求
     * 領取「縣案首」獎狀 —— 因為考試通過紀錄 (ranks.passed) 只存在本機 2。
     *
     * @param {object} [opts]
     * @param {boolean} [opts.cloud=true]  是否一併刪除雲端資料
     * @param {boolean} [opts.keepId=true] 是否保留引繼碼綁定
     * @returns {Promise<object>} 清除結果摘要
     */
    resetAll: async function (opts) {
        const o = opts || {};
        const doCloud = o.cloud !== false;
        const keepId  = o.keepId !== false;
        const result  = { local: false, collection: false, cloud: null, id: null };

        const id = (window.SupabaseClient && window.SupabaseClient.getCurrentId)
            ? window.SupabaseClient.getCurrentId() : '';
        result.id = id || '(未綁定)';

        // 1. 雲端（必須先做：本機清掉後就查不到引繼碼了）
        if (doCloud && id && window.SupabaseClient &&
            typeof window.SupabaseClient.deletePlayerFromCloud === 'function') {
            result.cloud = await window.SupabaseClient.deletePlayerFromCloud(id);
        }

        // 2. 本機主存檔
        try {
            localStorage.removeItem('flowerMoon_playerData');
            localStorage.removeItem('flowerMoon_dailyFirstGame');
            result.local = true;
        } catch (e) { console.error('[ScoreManager] 清除本機存檔失敗:', e); }

        // 3. 江南小院收集系統（文錢、考試通過紀錄、examStats…）
        try {
            if (window.FMCollectionSave && typeof window.FMCollectionSave.reset === 'function') {
                window.FMCollectionSave.reset();
                result.collection = true;
            }
        } catch (e) { console.error('[ScoreManager] 清除收集系統存檔失敗:', e); }

        // 4. 引繼碼
        if (!keepId) {
            try { localStorage.removeItem('flower_moon_id'); } catch (e) { /* ignore */ }
        }

        // 5. 讓青雲梯的進度快取失效
        try {
            if (window.LearningPath && typeof window.LearningPath.invalidateProgress === 'function') {
                window.LearningPath.invalidateProgress();
            }
        } catch (e) { /* ignore */ }

        console.log('[ScoreManager] 完整重置完成', result);
        console.log('請重新整理頁面 (F5) 讓所有模組以全新狀態載入。');
        return result;
    },

    /** 某一關是否已捐納跳過 */
    isLevelDonated: function (tier, level) {
        const data = this.loadPlayerData();
        const d = (data && data.levelDonated) || {};
        return Array.isArray(d[tier]) && d[tier].indexOf(level) !== -1;
    },

    /**
     * 紀錄某首詩在某難度被勝利過關一次
     * 由各遊戲在 onComplete 後呼叫：ScoreManager.recordPoemPlay(poemId, difficulty)
     */
    recordPoemPlay: function (poemId, difficulty) {
        if (!poemId) return;
        const diffs = ['小學', '中學', '高中', '大學', '研究所'];
        if (!diffs.includes(difficulty)) return;
        let data = this.loadPlayerData();
        if (!data.poemRecords[poemId]) {
            data.poemRecords[poemId] = { '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0 };
        }
        data.poemRecords[poemId][difficulty]++;
        localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        if (window.SupabaseClient) window.SupabaseClient.saveGameToCloud(data);
    },

    /**
     * 播放過關結算動畫
     * 包含三個階段：紅心計算 -> 時間計算與星星飛舞 -> 難度加成捲動
     */
    playWinAnimation: function (options) {
        this.cancelAnimation(); // 在開始新的動畫前，先取消舊的

        // 玩家過關瞬間（動畫啟動前）計算本局遊玩時長（秒）
        // 需各遊戲在 options.game 物件上設置 gameStartTime = Date.now()
        const durationS = (options.game && options.game.gameStartTime)
            ? Math.floor((Date.now() - options.game.gameStartTime) / 1000)
            : 0;

        this.initCSS();

        let currentScore = Math.floor(options.game.score || 0); // 初始分數去小數點
        const gameInst = options.game;
        const gameKey = options.gameKey || 'game4';

        // 自動從遊戲的 currentPoem 取得詩詞 ID，不需各遊戲個別傳入
        const poemId = (gameInst.currentPoem && gameInst.currentPoem.id != null)
            ? String(gameInst.currentPoem.id) : null;

        // 階段 1：給予基礎分
        currentScore += this.getBaseScore(gameKey);
        document.getElementById(options.scoreElementId).textContent = currentScore;

        // 計算剩餘時間
        let remainingSeconds = 0;
        let duration = 60000; // 預設 60秒

        if (gameInst.startTime) {
            duration = (gameInst.maxTimer || gameInst.timer || 60) * 1000;
            const elapsed = Date.now() - gameInst.startTime;
            remainingSeconds = Math.floor(Math.max(0, duration - elapsed) / 1000);
        } else if (typeof gameInst.timer === 'number') {
            // 如果沒有 startTime 但有 timer，則 timer 本身就是剩餘秒數 (例如 Game 9)
            // 一律無條件捨棄小數點
            remainingSeconds = Math.floor(gameInst.timer);
            duration = (gameInst.maxTimer || gameInst.timer) * 1000;
        }


        const multiplier = this.multipliers[options.difficulty] || 1;

        // 子階段：套用難度乘數，並實現數字捲動效果
        const applyMultiplier = () => {
            const finalScore = Math.floor(currentScore * multiplier); // 乘數後再次確保整數
            let tempScore = currentScore;
            const diff = finalScore - currentScore;
            const steps = 20;
            const stepValue = diff / steps;
            let currentStep = 0;

            const scoreBoard = document.getElementById(options.scoreElementId).parentElement;
            if (scoreBoard) {
                const mulTip = document.createElement('span');
                mulTip.textContent = ` × ${multiplier}`;
                // 樣式（金黃色）改由 theme_xuanzhi.css 的 .fm-score-multiplier 提供
                mulTip.className = 'fm-score-multiplier';
                scoreBoard.appendChild(mulTip);
                setTimeout(() => mulTip.remove(), 1500);
            }

            const checkCloudSaveAndComplete = (fScore) => {
                if (!localStorage.getItem('flower_moon_id') && window.CloudSaveDialog) {
                    window.CloudSaveDialog.show({
                        mode: 'initial',
                        onSuccess: () => {
                            if (options.onComplete) options.onComplete(fScore);
                        }
                    });
                } else {
                    if (options.onComplete) options.onComplete(fScore);
                }
            };

            if (diff > 0) {
                const rollInterval = setInterval(() => {
                    currentStep++;
                    tempScore += stepValue;
                    document.getElementById(options.scoreElementId).textContent = Math.floor(tempScore);
                    if (currentStep >= steps) {
                        const idx = this.activeIntervals.indexOf(rollInterval);
                        if (idx > -1) this.activeIntervals.splice(idx, 1);
                        clearInterval(rollInterval);
                        document.getElementById(options.scoreElementId).textContent = finalScore;
                        this.saveScore(gameKey, options.difficulty, finalScore, poemId, durationS);
                        checkCloudSaveAndComplete(finalScore);
                    }
                }, 40);
                this.activeIntervals.push(rollInterval);
            } else {
                document.getElementById(options.scoreElementId).textContent = finalScore;
                this.saveScore(gameKey, options.difficulty, finalScore, poemId, durationS);
                checkCloudSaveAndComplete(finalScore);
            }
        };

        // 階段 2：將剩餘時間轉換為分數並發射飛行星星
        const convertTime = () => {
            if (remainingSeconds <= 0) {
                applyMultiplier();
                return;
            }

            // 動態調整計時器跳動速度（節奏加倍：原 1500/100/30 改為 750/50/15）
            let tickDelay = Math.floor(750 / remainingSeconds);
            if (tickDelay > 50) tickDelay = 50;
            if (tickDelay < 15) tickDelay = 15;

            // 勝利動畫開始：立即切換計時框為「黃色剩餘時間」模式
            // 傳入 'win' mode，讓各遊戲的 updateTimerRing 用舊公式（剩餘時間顯示）
            const initRatio = remainingSeconds / (duration / 1000);
            if (gameInst.updateTimerRing) gameInst.updateTimerRing(initRatio, 'win');

            let starsLaunched = 0;
            let starsLanded = 0;
            let isLaunchComplete = false;

            const winInterval = setInterval(() => {
                if (remainingSeconds > 0) {
                    const currentRatio = remainingSeconds / (duration / 1000);
                    starsLaunched++;

                    // 創建飛行星星
                    let customP0 = options.getStarStartPoint ? options.getStarStartPoint(currentRatio) : null;
                    this.createFlyingStar(options.timerContainerId, options.scoreElementId, currentRatio, () => {
                        currentScore += this.getTimeScore(gameKey);
                        document.getElementById(options.scoreElementId).textContent = currentScore;
                        starsLanded++;
                        // 確保所有星星都到達目標後才進入下一階段
                        if (isLaunchComplete && starsLanded === starsLaunched) {
                            applyMultiplier();
                        }
                    }, customP0);

                    remainingSeconds--;
                    const newRatio = remainingSeconds / (duration / 1000);
                    // 更新計時框（'win' mode：黃色剩餘時間，順時針縮短）
                    if (gameInst.updateTimerRing) gameInst.updateTimerRing(newRatio, 'win');
                } else {
                    const idx = this.activeIntervals.indexOf(winInterval);
                    if (idx > -1) this.activeIntervals.splice(idx, 1);
                    clearInterval(winInterval);
                    if (gameInst.updateTimerRing) gameInst.updateTimerRing(0, 'win');
                    isLaunchComplete = true;
                    if (starsLanded === starsLaunched) {
                        applyMultiplier();
                    }
                }
            }, tickDelay);
            this.activeIntervals.push(winInterval);
        };

        // 階段 0：將剩餘紅心轉為分數
        const hearts = Array.from(document.querySelectorAll(options.heartsSelector));
        if (hearts.length > 0) {
            let hIdx = hearts.length - 1;
            const heartInterval = setInterval(() => {
                if (hIdx >= 0) {
                    hearts[hIdx].classList.add('score');
                    hearts[hIdx].textContent = '❤';
                    currentScore += this.getHeartScore(gameKey);
                    document.getElementById(options.scoreElementId).textContent = currentScore;
                    hIdx--;
                } else {
                    const idx = this.activeIntervals.indexOf(heartInterval);
                    if (idx > -1) this.activeIntervals.splice(idx, 1);
                    clearInterval(heartInterval);
                    setTimeout(convertTime, 150);
                }
            }, 150);
            this.activeIntervals.push(heartInterval);
        } else {
            convertTime();
        }
    },

    /**
     * 計算矩形計時條上對應比例的座標點
     * 用於決定星星發射的起始位置
     */
    getTimerPathPoint: function (containerId, ratio) {
        const container = document.getElementById(containerId);
        if (!container) return { x: 0, y: 0 };

        const rect = container.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;

        // 考量到 SVG 邊框的偏移 (3px padding)
        const rw = Math.max(0, w - 6);
        const rh = Math.max(0, h - 6);

        const perimeter = 2 * (rw + rh);
        let dist = perimeter * (1 - ratio);

        // 沿矩形邊框「順時針」軌跡：從左上 → 上邊往右 → 右邊往下 → 下邊往左 → 左邊往上回到左上
        // 與 SVG 倒數框的繪製方向（順時針，終點在左上角）一致
        if (dist <= rw) return { x: 3 + dist, y: 3 };
        dist -= rw;
        if (dist <= rh) return { x: 3 + rw, y: 3 + dist };
        dist -= rh;
        if (dist <= rw) return { x: 3 + rw - dist, y: 3 + rh };
        dist -= rw;
        return { x: 3, y: 3 + rh - dist };
    },

    /**
     * 讀取飛行星星的基準色。
     * 來源：theme_xuanzhi.css 的 --fm-star-gold（與 .flying-star 的後備色一致）。
     * 解析成 { h, s, l }（皆為數值）供逐顆星星抖動使用；解析失敗時回退到金黃預設，
     * 確保即使主題未載入或變數異常，星星仍為可見的金黃色而非黑色。
     */
    getStarBaseColor: function () {
        const fallback = { h: 45, s: 100, l: 60 }; // 金黃後備色
        try {
            const raw = getComputedStyle(document.documentElement)
                .getPropertyValue('--fm-star-gold').trim();
            // 支援 hsl()/hsla() 形式，例如 hsl(30, 95%, 55%)
            const m = raw.match(/hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
            if (m) {
                return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
            }
        } catch (e) {
            /* 忽略解析錯誤，改用後備色 */
        }
        return fallback;
    },

    /**
     * 創建一顆飛行的星星從計時器飛向分數面板
     */
    createFlyingStar: function (containerId, scoreElementId, ratio, onLand, customStartPoint) {
        let p0;
        if (customStartPoint) {
            p0 = customStartPoint;
        } else {
            const timerContainer = document.getElementById(containerId);
            if (!timerContainer) {
                if (onLand) onLand();
                return;
            }
            const tRect = timerContainer.getBoundingClientRect();
            const pointOnRect = this.getTimerPathPoint(containerId, ratio);
            p0 = { x: tRect.left + pointOnRect.x, y: tRect.top + pointOnRect.y };
        }

        // 獲取分數區域在螢幕中的絕對座標
        const scoreEl = document.getElementById(scoreElementId);
        if (!scoreEl) {
            if (onLand) onLand();
            return;
        }
        const sRect = scoreEl.getBoundingClientRect();
        const p2 = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 };

        // 計算貝茲曲線的控制點 (創造弧線飛行的效果，且偏移點向上 (-100))
        const midX = (p0.x + p2.x) / 2;
        const midY = (p0.y + p2.y) / 2;
        const offsetX = (Math.random() - 0.5) * 300;
        const offsetY = (Math.random() - 0.5) * 300 - 100; // 向上偏移以實現「往上飛」
        const p1 = { x: midX + offsetX, y: midY + offsetY };

        // 修正 rem 轉換比例：動態從 html 獲取 font-size 作為基準
        const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const pxToRem = (px) => (px / rootFontSize).toFixed(2) + 'rem';

        const star = document.createElement('div');
        star.className = 'flying-star';
        star.textContent = '★';
        star.style.left = pxToRem(p0.x);
        star.style.top = pxToRem(p0.y);
        // 每顆星星隨機微變：以 theme_xuanzhi.css 的 --fm-star-gold 為基準色，
        // 再對「色相 ±10、飽和度 ±15、亮度 +0~30」做隨機抖動，讓星群有層次。
        // 基準色不再寫死；改由 getStarBaseColor() 從 CSS 變數解析取得。
        const base = this.getStarBaseColor();
        const hueJitter = base.h + (Math.random() - 0.5) * 60;                                   // 基準色相 ±10
        const satJitter = Math.min(255, Math.max(0, base.s + (Math.random() - 0.5) * 30));       // 基準飽和度 ±15
        // 亮度：在基準之上隨機提亮 0~30；並設可見度保底（避免基準過暗時星星看不見）
        const lumJitter = Math.min(255, Math.max(0, base.l + (Math.random() - 0.5) * 30));
        const sizeJitter = 1.5 * (1 + (Math.random() - 0.5) * 0.6);   // 1.4 ~ 2.6 rem
        star.style.color = `hsl(${hueJitter}, ${satJitter}%, ${lumJitter}%)`;
        star.style.fontSize = sizeJitter.toFixed(2) + 'rem';
        document.body.appendChild(star);

        const duration = 500; // 飛星動畫時長（節奏加倍：原 1000ms 改為 500ms）
        const startTime = Date.now();

        const animate = () => {
            const now = Date.now();
            const t = Math.min(1, (now - startTime) / duration);
            const oneMinusT = 1 - t;

            // 使用二階貝茲曲線公式計算當前點 (x, y)
            const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
            const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;

            // 更新星星位置與視覺效果
            star.style.left = pxToRem(x);
            star.style.top = pxToRem(y);
            star.style.transform = `translate(-50%, -50%) scale(${1 - t * 0.5}) rotate(${t * 360}deg)`;
            star.style.opacity = 1 - t * 0.2;

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                star.remove();
                // 到達目標時的縮放回饋效果
                scoreEl.style.transform = "scale(1.5)";
                scoreEl.style.color = "#f1c40f";
                setTimeout(() => {
                    scoreEl.style.transform = "";
                    scoreEl.style.color = "";
                }, 150);
                if (onLand) onLand();
            }
        };
        requestAnimationFrame(animate);
    },

    /**
     * 初始化結算動畫所需的 CSS 樣式
     */
    initCSS: function () {
        // ⚠️ 2026-07：.flying-star 樣式已整併至 theme_xuanzhi.css（結算共用樣式）。
        // 此處僅保留 .heart.score（未加 fm- 前綴的舊紅心過關色），供未套用主題的頁面後備。
        if (!document.getElementById('score-manager-css')) {
            const style = document.createElement('style');
            style.id = 'score-manager-css';
            style.textContent = `
                .heart.score {
                    color: hsl(60, 90%, 60%) !important;
                    opacity: 1 !important;
                }
            `;
            document.head.appendChild(style);
        }
    },

    /**
     * 取消目前正在執行的結算動畫與計時器
     */
    cancelAnimation: function () {
        this.activeIntervals.forEach(id => clearInterval(id));
        this.activeIntervals = [];
        // 清除所有飛行星星
        const stars = document.querySelectorAll('.flying-star');
        stars.forEach(s => s.remove());
    }
};

// 將管理器掛載到 window 全局對象
window.ScoreManager = ScoreManager;

/**
 * 遊戲畫面右上角的關卡標籤文字。
 *
 * ⚠️ 為什麼不直接印 levelIndex：
 *    levelIndex 是**題庫位址**（第幾首詩的第幾聯），不是進度計數器。
 *    青雲梯會讓同一個編號配三種不同提取方式各出現一次，且刻意隨機挑題，
 *    所以直接顯示會變成「第1關→第2關→第4關→第4關→第2關」這種
 *    又跳號又重複的樣子，對玩家完全無法理解。
 *    改為顯示連續遞增的「第 X 局」。
 *
 * @param {number} levelIndex 目前關卡編號（僅在非青雲梯的測試用關卡模式下顯示）
 * @returns {string}
 */
window.FMRoundLabel = function (levelIndex) {
    try {
        // 青雲梯進行中 → 顯示累計局數（含本局）
        if (window.LevelTable && window.LevelTable.getContext()) {
            const d = ScoreManager.loadPlayerData();
            return '第 ' + ((d.pathRounds || 0) + 1) + ' 局';
        }
    } catch (e) { /* 存檔異常時退回舊格式 */ }
    // 測試用的關卡模式（正式上線隱藏）維持舊格式
    return '挑戰第 ' + levelIndex + ' 關';
};

