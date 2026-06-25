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
        'game13': { base: 100, heart: 10, time: 2, getPointA: 20 }, //人事時地
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
            getPointAMul: { '小學': 1.0, '中學': 1.5, '高中': 2.0, '大學': 3.0, '研究所': 4.0 }
        }, //詩詞拼圖（單題決勝，時限長故每秒分數較低）
        'game23': {
            base: 100, heart: 0, time: 1, getPointA: 20,
            getPointAMul: { '小學': 1.0, '中學': 1.5, '高中': 2.0, '大學': 3.0, '研究所': 4.0 }
        }, //縱橫集句（單題決勝，時限長故每秒分數較低）
        'game24': { base: 100, heart: 10, time: 3, getPointA: 1 }, //三字成珠（三消連線）
        'game25': { base: 100, heart: 10, time: 3, getPointA: 10 }, //連珠拾字（路徑連消）
        'game26': { base: 100, heart: 10, time: 3, getPointA: 10 }, //投珠破句（泡泡龍）
        'game27': { base: 100, heart: 10, time: 3, getPointA: 10 }, //詩磚壘塔（俄羅斯方塊）
        'game28': { base: 100, heart: 10, time: 2, getPointA: 10 }, //兩心相印（連連看）
        'game29': { base: 100, heart: 10, time: 3, getPointA: 10 }, //字龍盤環（滾球收集）
        'game30': { base: 100, heart: 10, time: 3, getPointA: 10 }, //層巒疊翠（麻將疊疊）
        'game31': { base: 100, heart: 10, time: 3, getPointA: 10 }, //詩眼覓蹤（字詞替換）
        'game32': { base: 100, heart: 10, time: 2, getPointA: 10 }, //尋詩地圖（地圖故事）
        'game33': { base: 100, heart: 10, time: 3, getPointA: 10 }, //作者是誰（風格辨識）
        'game34': { base: 100, heart: 10, time: 3, getPointA: 10 }, //猜猜詩題（標題配對）
        'game35': { base: 100, heart: 10, time: 2, getPointA: 10 } //詩人心情（情境推理）
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
     * 根據總分計算目前的玩家階級
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

            // 相容性補丁：若 levelCleared 為空但 levelProgress 有資料，
            // 從 levelProgress 的最高關卡回填（1 ~ maxIdx），以還原舊存檔的星星。
            if (!data.levelCleared) data.levelCleared = {};
            if (data.levelProgress && Object.keys(data.levelCleared).length === 0) {
                const diffs = ['小學', '中學', '高中', '大學', '研究所'];
                for (const gk in data.levelProgress) {
                    const prog = data.levelProgress[gk];
                    if (!prog) continue;
                    data.levelCleared[gk] = {};
                    for (const diff of diffs) {
                        const maxIdx = prog[diff] || 0;
                        if (maxIdx > 0) {
                            data.levelCleared[gk][diff] = Array.from({ length: maxIdx }, (_, k) => k + 1);
                        }
                    }
                }
            }

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

        // 將全域編號轉成 (難度, 相對編號)
        let finalDifficulty = difficulty;
        let finalRelIdx = levelIndex;
        if (levelIndex >= 1 && levelIndex <= 300) {
            const converted = this.getRelativeLevelIndex(levelIndex);
            finalDifficulty = converted.difficulty;
            finalRelIdx = converted.relIdx;
        }

        let needsSave = false;
        let achIdToReturn = null;

        // ─────────────────────────────────────────────────────
        // 區段 A：第 1~51 關 ── 自由區，每關個別留紀錄（星星用）
        // 區段 B：第 52 關以後 ── 依序區，只記最高關卡（解鎖+星星用）
        // ─────────────────────────────────────────────────────
        if (levelIndex <= 51) {
            // 自由區：把 finalRelIdx 加入個別星星陣列
            if (!data.levelCleared[gameKey][finalDifficulty]) {
                data.levelCleared[gameKey][finalDifficulty] = [];
            }
            if (!data.levelCleared[gameKey][finalDifficulty].includes(finalRelIdx)) {
                data.levelCleared[gameKey][finalDifficulty].push(finalRelIdx);
                needsSave = true;
            }
            // 特例：第 51 關 (高中 relIdx=1) 同時推進 levelProgress[高中]，
            // 讓第 52 關之後的依序解鎖邏輯能順利啟動。
            if (levelIndex === 51) {
                if ((data.levelProgress[gameKey]['高中'] || 0) < 1) {
                    data.levelProgress[gameKey]['高中'] = 1;
                    needsSave = true;
                }
            }
        } else {
            // 依序區：只更新該難度的最高關卡編號
            const currentMax = data.levelProgress[gameKey][finalDifficulty] || 0;
            if (finalRelIdx > currentMax) {
                data.levelProgress[gameKey][finalDifficulty] = finalRelIdx;
                needsSave = true;
            }
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
                mulTip.style.color = '#f1c40f';
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
        // 每顆星星隨機微變：色相 ±15%(基準60→51~69)、飽和度 ±15%(基準100→85~100)、尺寸 ±30%(基準2rem→1.4~2.6rem)
        const hueJitter = 60 + (Math.random() - 0.5) * 20;          // 41 ~ 79
        const lumJitter = Math.max(50, 50 + Math.random() * 30);  // 85 ~ 100
        const sizeJitter = 1.5 * (1 + (Math.random() - 0.5) * 0.6);   // 1.4 ~ 2.6 rem
        star.style.color = `hsl(${hueJitter}, 100%, ${lumJitter}%)`;
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
        if (!document.getElementById('score-manager-css')) {
            const style = document.createElement('style');
            style.id = 'score-manager-css';
            style.textContent = `
                .flying-star {
                    position: fixed;
                    z-index: 1100;
                    font-size: 2rem;
                    color: hsl(60, 100%, 50%);
                    pointer-events: none;
                    will-change: transform, opacity;
                }
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

