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
        'game1': { base: 100, heart: 30, time: 2 },
        'game2': { base: 100, heart: 10, time: 2, getPointA: 10 },
        'game3': { base: 100, heart: 10, time: 2, getPointA: 5 },
        'game4': { base: 100, heart: 10, time: 2, getPointA: 10 },
        'game5': { base: 100, heart: 10, time: 1, getPointA: 25 },
        'game6': { base: 100, heart: 10, time: 1, getPointA: 3 },
        'game7': { base: 100, heart: 10, time: 2, getPointA: 5 },
        'game8': { base: 100, heart: 10, time: 1, getPointA: 2 },
        'game9': { base: 100, heart: 10, time: 5, getPointA: 0.5 },
        'game10': { base: 100, heart: 10, time: 0, getPointA: 1, getPointB: 20 },
        'game11': { base: 100, heart: 10, time: 0, getPointA: 5, getPointB: 30 },
        'game12': { base: 100, heart: 10, time: 2, getPointA: 20 },
        'game13': { base: 100, heart: 10, time: 2, getPointA: 20 },
        'game14': { base: 100, heart: 20, time: 5, getPointA: 10 }
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
    saveScore: function (gameKey, difficulty, finalScore) {
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
                isWin: true
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
            levelProgress: {}, // 格式: { gameKey: { '小學': 0, '中學': 0, ... } }
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

        // 雙重檢查確保 levelProgress 結構正確
        if (!data.levelProgress) data.levelProgress = {};

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

        let finalDifficulty = difficulty;
        let finalRelIdx = levelIndex;

        if (levelIndex >= 1 && levelIndex <= 300) {
            const converted = this.getRelativeLevelIndex(levelIndex);
            finalDifficulty = converted.difficulty;
            finalRelIdx = converted.relIdx;
        }

        let achIdToReturn = null;

        // 只有在通關更高關卡時才更新
        if (finalRelIdx > (data.levelProgress[gameKey][finalDifficulty] || 0)) {
            data.levelProgress[gameKey][finalDifficulty] = finalRelIdx;

            // 計算總通關數
            const progress = data.levelProgress[gameKey];
            const totalPassed = (progress['小學'] || 0) + (progress['中學'] || 0) + (progress['高中'] || 0) + (progress['大學'] || 0) + (progress['研究所'] || 0);

            // 檢查 20 關里程碑成就
            if (totalPassed > 0 && totalPassed % 20 === 0) {
                const milestone = totalPassed;
                const achId = `level_milestone_${gameKey}_${milestone}`;
                if (!data.achievements.claimed || !data.achievements.claimed.includes(achId)) {
                    achIdToReturn = achId;
                }
            }

            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        }
        return achIdToReturn;
    },

    /**
     * 播放過關結算動畫
     * 包含三個階段：紅心計算 -> 時間計算與星星飛舞 -> 難度加成捲動
     */
    playWinAnimation: function (options) {
        this.cancelAnimation(); // 在開始新的動畫前，先取消舊的
        this.initCSS();

        let currentScore = Math.floor(options.game.score || 0); // 初始分數去小數點
        const gameInst = options.game;
        const gameKey = options.gameKey || 'game4';

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
                        this.saveScore(gameKey, options.difficulty, finalScore);
                        checkCloudSaveAndComplete(finalScore);
                    }
                }, 40);
                this.activeIntervals.push(rollInterval);
            } else {
                document.getElementById(options.scoreElementId).textContent = finalScore;
                this.saveScore(gameKey, options.difficulty, finalScore);
                checkCloudSaveAndComplete(finalScore);
            }
        };

        // 階段 2：將剩餘時間轉換為分數並發射飛行星星
        const convertTime = () => {
            if (remainingSeconds <= 0) {
                applyMultiplier();
                return;
            }

            // 動態調整計時器跳動速度
            let tickDelay = Math.floor(1500 / remainingSeconds);
            if (tickDelay > 100) tickDelay = 100;
            if (tickDelay < 30) tickDelay = 30;

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
                    // 更新遊戲畫面上的計時環 (如果有對應的方法)
                    if (gameInst.updateTimerRing) gameInst.updateTimerRing(newRatio);
                } else {
                    const idx = this.activeIntervals.indexOf(winInterval);
                    if (idx > -1) this.activeIntervals.splice(idx, 1);
                    clearInterval(winInterval);
                    if (gameInst.updateTimerRing) gameInst.updateTimerRing(0);
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

        // 沿著矩形邊框模擬順時針軌跡
        if (dist <= rh) return { x: 3, y: 3 + dist };
        dist -= rh;
        if (dist <= rw) return { x: 3 + dist, y: 3 + rh };
        dist -= rw;
        if (dist <= rh) return { x: 3 + rw, y: 3 + rh - dist };
        dist -= rh;
        return { x: 3 + rw - dist, y: 3 };
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
        document.body.appendChild(star);

        const duration = 1000; // 動態時長 1 秒
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
                    z-index: 3000;
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

