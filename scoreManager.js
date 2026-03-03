const ScoreManager = {
    // 難度乘數
    multipliers: {
        '小學': 1,
        '中學': 2,
        '高中': 3,
        '大學': 4,
        '研究所': 5
    },

    // 各個遊戲的分數基數設定
    gameSettings: {
        'game1': { base: 100, heart: 30, time: 3 }, // 提高基數以平衡得分
        'game2': { base: 100, heart: 10, time: 3 },
        'game3': { base: 100, heart: 10, time: 3 },
        'game4': { base: 100, heart: 10, time: 3 },
        'game5': { base: 100, heart: 10, time: 1 },
        'game6': { base: 100, heart: 10, time: 3 }
    },

    // 玩家階級設定
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

    // 基礎通關分
    getBaseScore: function (gameKey) {
        return this.gameSettings[gameKey]?.base || 100;
    },

    // 每顆紅心分
    getHeartScore: function (gameKey) {
        return this.gameSettings[gameKey]?.heart || 10;
    },

    // 每一秒時間分
    getTimeScore: function (gameKey) {
        return this.gameSettings[gameKey]?.time || 5;
    },

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

    // 儲存分數並累加至 LocalStorage
    saveScore: function (gameKey, difficulty, finalScore) {
        let data = this.loadPlayerData(); // 使用涵蓋了 migrate 的 loadPlayerData

        data.totalScore += finalScore;

        // 更新遊戲個別紀錄
        if (!data.games[gameKey]) {
            data.games[gameKey] = { playCount: 0, highScore: 0, highestDifficulty: '未挑戰', totalStars: 0 };
        }

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

        // 紀錄難度過關次數
        if (!data.difficultyCounts) {
            data.difficultyCounts = { '小學': 0, '中學': 0, '高中': 0, '大學': 0, '研究所': 0 };
        }
        if (difficulty in data.difficultyCounts) {
            data.difficultyCounts[difficulty]++;
        }

        // 更新階級
        data.globalRank = this.getCurrentRank(data.totalScore);

        // 簡單的徽章系統
        if (difficulty === '研究所' && !data.achievements.unlocked.includes('研究所通關')) {
            data.achievements.unlocked.push('研究所通關');
        }

        localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        this.updateProfileUI(data);
    },

    // 簡單的 UI 更新 (如果我們有在首頁或選單顯示積分)
    updateProfileUI: function (data) {
        // 等等可以在 menu 加上 #player-total-score
        const scoreEl = document.getElementById('player-total-score');
        if (scoreEl) {
            scoreEl.textContent = data.totalScore;
        }
    },

    getDefaultData: function () {
        return {
            version: "1.1",
            nickname: '訪客',
            totalScore: 0,
            globalRank: '書僮',
            playDays: 1,
            lastPlayedDate: new Date().toISOString().split('T')[0],
            games: {},
            difficultyCounts: {
                '小學': 0,
                '中學': 0,
                '高中': 0,
                '大學': 0,
                '研究所': 0
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

    migrateData: function (data) {
        if (!data) return this.getDefaultData();

        // 如果已經是新版 (1.1 以上)，直接回傳
        if (data.version && parseFloat(data.version) >= 1.1) {
            return data;
        }

        // 舊版資料遷移至新結構
        const newData = this.getDefaultData();
        newData.nickname = data.nickname || '訪客';
        newData.totalScore = data.totalScore || 0;
        newData.globalRank = this.getCurrentRank(newData.totalScore);

        if (data.difficultyCounts) {
            newData.difficultyCounts = Object.assign(newData.difficultyCounts, data.difficultyCounts);
        }
        if (data.games) {
            newData.games = data.games;
        }

        // 舊版的 badges 合併
        if (data.badges && Array.isArray(data.badges)) {
            newData.achievements.unlocked = data.badges;
        }
        if (data.achievements) {
            if (data.achievements.claimed) newData.achievements.claimed = data.achievements.claimed;
        }

        if (data.highestDifficulty && data.highestDifficulty !== '未挑戰' && data.highestDifficulty !== '小學') {
            newData.achievements.unlocked.push(`${data.highestDifficulty}通關`);
        }

        // 將遷移後的資料存回
        localStorage.setItem('flowerMoon_playerData', JSON.stringify(newData));
        return newData;
    },

    loadPlayerData: function () {
        let rawData = localStorage.getItem('flowerMoon_playerData');
        let data = null;
        try {
            data = rawData ? JSON.parse(rawData) : null;
        } catch (e) {
            console.error("解析存檔失敗:", e);
        }

        data = this.migrateData(data);

        // 檢查登入天數
        const today = new Date().toISOString().split('T')[0];
        if (data.lastPlayedDate !== today) {
            data.playDays = (data.playDays || 0) + 1;
            data.lastPlayedDate = today;
            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
        }

        return data;
    },

    // 共用的結算動畫 (將 Game4 的動畫獨立出來)
    playWinAnimation: function (options) {
        this.initCSS();

        let currentScore = options.game.score || 0;
        const gameInst = options.game;
        const gameKey = options.gameKey || 'game4'; // 預設使用 game4

        // 1. 給予基礎分
        currentScore += this.getBaseScore(gameKey);
        document.getElementById(options.scoreElementId).textContent = currentScore;

        // 計算剩餘時間
        const duration = gameInst.timer ? (gameInst.maxTimer || gameInst.timer) * 1000 : 60000;
        const elapsed = gameInst.startTime ? Date.now() - gameInst.startTime : duration;
        let remainingMs = Math.max(0, duration - elapsed);
        let remainingSeconds = Math.floor(remainingMs / 1000);

        const multiplier = this.multipliers[options.difficulty] || 1;

        // Phase 3: 套用難度加成，並捲動數字
        const applyMultiplier = () => {
            const finalScore = currentScore * multiplier;
            let tempScore = currentScore;
            const diff = finalScore - currentScore;
            const steps = 20;
            const stepValue = diff / steps;
            let currentStep = 0;

            // 顯示最終分數前可以顯示乘數
            const scoreBoard = document.getElementById(options.scoreElementId).parentElement;
            if (scoreBoard) {
                const mulTip = document.createElement('span');
                mulTip.textContent = ` × ${multiplier}`;
                mulTip.style.color = '#f1c40f';
                scoreBoard.appendChild(mulTip);
                setTimeout(() => mulTip.remove(), 1500);
            }

            if (diff > 0) {
                const rollInterval = setInterval(() => {
                    currentStep++;
                    tempScore += stepValue;
                    document.getElementById(options.scoreElementId).textContent = Math.floor(tempScore);
                    if (currentStep >= steps) {
                        clearInterval(rollInterval);
                        document.getElementById(options.scoreElementId).textContent = finalScore;
                        this.saveScore(gameKey, options.difficulty, finalScore);
                        if (options.onComplete) options.onComplete(finalScore);
                    }
                }, 40);
            } else {
                document.getElementById(options.scoreElementId).textContent = finalScore;
                this.saveScore(gameKey, options.difficulty, finalScore);
                if (options.onComplete) options.onComplete(finalScore);
            }
        };

        // Phase 2: 將剩餘時間轉為分數並發射星星
        const convertTime = () => {
            if (remainingSeconds <= 0) {
                applyMultiplier();
                return;
            }

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

                    this.createFlyingStar(options.timerContainerId, options.scoreElementId, currentRatio, () => {
                        currentScore += this.getTimeScore(gameKey);
                        document.getElementById(options.scoreElementId).textContent = currentScore;
                        starsLanded++;
                        if (isLaunchComplete && starsLanded === starsLaunched) {
                            applyMultiplier();
                        }
                    });

                    remainingSeconds--;
                    const newRatio = remainingSeconds / (duration / 1000);
                    if (gameInst.updateTimerRing) gameInst.updateTimerRing(newRatio);
                } else {
                    clearInterval(winInterval);
                    if (gameInst.updateTimerRing) gameInst.updateTimerRing(0);
                    isLaunchComplete = true;
                    if (starsLanded === starsLaunched) {
                        applyMultiplier();
                    }
                }
            }, tickDelay);
        };

        // Phase 1: 將剩餘紅心轉為分數
        const hearts = Array.from(document.querySelectorAll(options.heartsSelector));
        if (hearts.length > 0) {
            let hIdx = hearts.length - 1;
            const heartInterval = setInterval(() => {
                if (hIdx >= 0) {
                    hearts[hIdx].classList.add('score');
                    // 當結算時顯示充滿或特效
                    hearts[hIdx].textContent = '❤';
                    currentScore += this.getHeartScore(gameKey);
                    document.getElementById(options.scoreElementId).textContent = currentScore;
                    hIdx--;
                } else {
                    clearInterval(heartInterval);
                    setTimeout(convertTime, 150);
                }
            }, 150);
        } else {
            convertTime();
        }
    },

    getTimerPathPoint: function (containerId, ratio) {
        const container = document.getElementById(containerId);
        if (!container) return { x: 0, y: 0 };
        const w = container.offsetWidth;
        const h = container.offsetHeight;
        // 我們假設 SVG 在框內有 padding
        const rw = Math.max(0, w - 6);
        const rh = Math.max(0, h - 6);
        const perimeter = 2 * (rw + rh);
        let dist = perimeter * (1 - ratio);

        if (dist <= rh) return { x: 3, y: 3 + dist };
        dist -= rh;
        if (dist <= rw) return { x: 3 + dist, y: 3 + rh };
        dist -= rw;
        if (dist <= rh) return { x: 3 + rw, y: 3 + rh - dist };
        dist -= rh;
        return { x: 3 + rw - dist, y: 3 };
    },

    createFlyingStar: function (containerId, scoreElementId, ratio, onLand) {
        const timerContainer = document.getElementById(containerId);
        if (!timerContainer) {
            if (onLand) onLand();
            return;
        }
        const tRect = timerContainer.getBoundingClientRect();

        const pointOnRect = this.getTimerPathPoint(containerId, ratio);
        const p0 = { x: tRect.left + pointOnRect.x, y: tRect.top + pointOnRect.y };

        const scoreEl = document.getElementById(scoreElementId);
        if (!scoreEl) {
            if (onLand) onLand();
            return;
        }
        const sRect = scoreEl.getBoundingClientRect();
        const p2 = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 };

        const midX = (p0.x + p2.x) / 2;
        const midY = (p0.y + p2.y) / 2;
        const offsetX = (Math.random() - 0.5) * 300;
        const offsetY = (Math.random() - 0.5) * 300 - 100;
        const p1 = { x: midX + offsetX, y: midY + offsetY };

        const star = document.createElement('div');
        star.className = 'flying-star';
        star.textContent = '★';
        star.style.left = `${p0.x}px`;
        star.style.top = `${p0.y}px`;
        document.body.appendChild(star);

        const duration = 1000;
        const startTime = Date.now();

        const animate = () => {
            const now = Date.now();
            const t = Math.min(1, (now - startTime) / duration);
            const oneMinusT = 1 - t;
            const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
            const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;

            star.style.left = `${x}px`;
            star.style.top = `${y}px`;
            star.style.transform = `translate(-50%, -50%) scale(${1 - t * 0.5}) rotate(${t * 360}deg)`;
            star.style.opacity = 1 - t * 0.2;

            if (t < 1) {
                requestAnimationFrame(animate);
            } else {
                star.remove();
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
    }
};

window.ScoreManager = ScoreManager;
