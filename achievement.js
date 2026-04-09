/**
 * 成就與紀錄面板組件
 */

(function () {
    'use strict';

    const AchievementDialog = {
        overlay: null,

        // 遊戲名稱對照表
        gameNames: {
            'game1': '慢思快選',
            'game2': '飛花令',
            'game3': '字爬梯',
            'game4': '眾裡尋他千百度',
            'game5': '詩詞小精靈',
            'game6': '詩陣侵略',
            'game7': '青鳥雲梯',
            'game8': '一筆裁詩',
            'game9': '詩韻鎖扣',
            'game10': '擊石鳴詩',
            'game11': '翻墨識蹤',
            'game12': '疏影橫斜'
        },

        rankCertTexts: {
            '書僮': '自幼好學，手不釋卷。\n今日正式入院為「書僮」，領略墨色清芬。願爾勤勉，志存高遠，於書山之中覓得真意。',
            '蒙童': '志學之始，啟蒙之初。\n累積修為已達萬分，榮升「蒙童」品階。初入文林，墨香稍染。願君焚膏繼晷，更上層樓。',
            '塾生': '書塾寒暑，心志益堅。\n閣下學識日進，修為已達兩萬分，獲封「塾生」。勤學如春起之苗，不見其增，日有所長。',
            '童生': '經史初通，文采斐然。\n恭賀閣下修為跨越四萬分，得授「童生」文位。筆下生風，字句清雅，已具文人之風骨。',
            '縣案首': '名震黌宮，冠絕全縣。\n閣下修為已達八萬分，於縣試之中脫穎而出，勇奪「縣案首」。才思敏捷，四鄉驚服。',
            '府案首': '府試揚名，魁首之才。\n恭賀閣下修為累積十六萬分，獲封「府案首」。文章錦繡，氣貫長虹，誠為一府之表率。',
            '文童': '詞藻華茂，文心雕龍。\n閣下修為突破三十二萬分，晉升「文童」。博覽群書，出口成章，已入大雅之堂。',
            '秀才': '身入膠庠，士林楷模。\n恭賀閣下修為達六十四萬分，博得「秀才」功名。志慮忠純，文采煥發，堪稱國之棟樑。',
            '舉人': '蟾宮折桂，名滿杏林。\n閣下修為突破一百二十八萬分，榮登「舉人」之列。鵬程萬里，前途無量，正待大展宏圖。',
            '貢士': '朝堂受書，天下景仰。\n恭賀閣下修為達二百五十六萬分，获「貢士」之榮。學究天人，德藝雙馨，四海皆知其名。',
            '進士': '金榜題名，國之重器。\n閣下修為突破五百一十二萬分，高中「進士」。經世致用，翰墨千秋，其名必傳於後世。',
            '探花': '風流倜儻，才貌雙全。\n恭賀閣下修為達一千零二十四萬分，榮膺「探花」。才情絕世，意氣風發，盡顯名士風流。',
            '榜眼': '學海無涯，僅次魁星。\n閣下修為突破二千零四十八萬分，获「榜眼」殊榮。文章冠代，識見精深，乃萬人之傑。',
            '狀元': '文魁天下，獨占鰲頭。\n恭賀閣下修為達四千零九十六萬分，奪取「狀元」極位。筆落驚風雨，詩成泣鬼神，舉世無雙。',
            '大儒': '德被天下，一代宗師。\n閣下修為已逾八千一百九十二萬分，獲尊「大儒」。學貫古今，德侔天地，萬世之師也。'
        },

        certImages: [
            'images/九品獎狀.png', 'images/八品獎狀.png', 'images/七品獎狀.png',
            'images/六品獎狀.png', 'images/五品獎狀.png', 'images/四品獎狀.png',
            'images/三品獎狀.png', 'images/二品獎狀.png', 'images/一品獎狀.png',
            'images/聖旨獎狀.png'
        ],

        init: function () {
            if (this.overlay) return;
            // 確保 achievement.css 已載入
            if (!document.getElementById('achievement-css')) {
                const link = document.createElement('link');
                link.id = 'achievement-css';
                link.rel = 'stylesheet';
                link.href = 'achievement.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'achievementOverlay';
            overlay.className = 'ach-overlay hidden';
            overlay.innerHTML = `
                <div class="ach-container aspect-5-8" role="dialog" aria-modal="true">
                    <div class="ach-header">
                        <div class="ach-title">成就與紀錄</div>
                    </div>
                    
                    <div class="ach-tabs">
                        <div class="ach-tab active" data-target="ach-panel-overview">總覽</div>
                        <div class="ach-tab" data-target="ach-panel-games">遊戲紀錄</div>
                        <div class="ach-tab" data-target="ach-panel-badges">成就殿堂</div>
                    </div>
                    
                    <div class="ach-body">
                        <!-- 總覽面板 -->
                        <div class="ach-panel active" id="ach-panel-overview">
                            <div class="ach-overview">
                                <div class="ach-rank-title" id="achRankTitle">當前文位</div>
                                <div class="ach-rank-display" id="achRankView">書僮</div>
                                
                                <div class="ach-overview-stats">
                                    <div class="ach-stat-box">
                                        <div class="ach-stat-val" id="achTotalScore">0</div>
                                        <div class="ach-stat-lbl">累積總分</div>
                                        <div class="ach-next-stat" id="achNextRankInfo">
                                            <div class="ach-next-val" id="achNextScore">10,000</div>
                                            <div class="ach-next-lbl" id="achNextRank">蒙童合格成績</div>
                                        </div>
                                    </div>
                                    <div class="ach-stat-box">
                                        <div class="ach-stat-val" id="achPlayDays">0</div>
                                        <div class="ach-stat-lbl">登入天數</div>
                                    </div>
                                </div>
                                <div class="ach-cloud-id-section">
                                    <div class="ach-cloud-id-value" id="achCloudIdDisplay">載入中...</div>
                                    <div class="ach-cloud-id-actions">
                                    <button id="achBtnSyncId" class="ach-btn-small" style="background: linear-gradient(135deg, hsla(145, 63%, 42%, 1.00), hsla(145, 63%, 35%, 1.00));">同步(測試用)</button>
                                    <button id="achBtnCopyId" class="ach-btn-small">顯示引繼碼</button>
                                        <button id="achBtnChangeId" class="ach-btn-small">變更暱稱</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- 遊戲紀錄面板 -->
                        <div class="ach-panel" id="ach-panel-games">
                            <div class="ach-games-grid" id="achGamesContainer">
                                <!-- 動態生成 -->
                            </div>
                        </div>
                        
                        <!-- 成就殿堂徽章面板 -->
                        <div class="ach-panel" id="ach-panel-badges">
                            <div class="ach-badges" id="achBadgesContainer">
                                <!-- 動態生成 -->
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            this.overlay = overlay;
        },

        bindEvents: function () {
            // 頁籤切換
            const tabs = this.overlay.querySelectorAll('.ach-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    tabs.forEach(t => t.classList.remove('active'));
                    this.overlay.querySelectorAll('.ach-panel').forEach(p => p.classList.remove('active'));

                    tab.classList.add('active');
                    const targetId = tab.getAttribute('data-target');
                    document.getElementById(targetId).classList.add('active');
                });
            });

            // 總覽/引繼碼按鈕綁定
            const btnCopy = document.getElementById('achBtnCopyId');
            if (btnCopy) {
                btnCopy.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    const data = window.ScoreManager.loadPlayerData();
                    const cloudId = localStorage.getItem('flower_moon_id') || '未綁定';
                    const display = document.getElementById('achCloudIdDisplay');

                    if (btnCopy.textContent === '顯示引繼碼') {
                        // 切換到顯示引繼碼並複製
                        display.textContent = cloudId;
                        btnCopy.textContent = '顯示暱稱';

                        if (cloudId !== '未綁定') {
                            navigator.clipboard.writeText(cloudId).then(() => {
                                //this.showNotification('引繼碼已複製到剪貼簿');
                            }).catch(err => console.error('複製失敗:', err));
                        }
                    } else {
                        // 切換回顯示暱稱
                        display.textContent = data.nickname || '訪客';
                        btnCopy.textContent = '顯示引繼碼';
                    }
                });
            }

            const btnChange = document.getElementById('achBtnChangeId');
            if (btnChange) {
                btnChange.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    if (window.CloudSaveDialog) {
                        window.CloudSaveDialog.show({
                            mode: 'change',
                            onSuccess: () => {
                                this.renderData(); // 重新整理成就面板
                            }
                        });
                    }
                });
            }

            const btnSync = document.getElementById('achBtnSyncId');
            if (btnSync) {
                btnSync.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    const data = window.ScoreManager.loadPlayerData();
                    btnSync.textContent = '同步中...';
                    btnSync.disabled = true;

                    if (window.SupabaseClient) {
                        window.SupabaseClient.saveGameToCloud(data).then(success => {
                            if (success) {
                                btnSync.textContent = '同步成功';
                                setTimeout(() => {
                                    btnSync.textContent = '同步(測試用)';
                                    btnSync.disabled = false;
                                }, 2000);
                            } else {
                                btnSync.textContent = '同步失敗';
                                btnSync.disabled = false;
                            }
                        });
                    }
                });
            }

            // 滑鼠拖曳捲動功能 (包含慣性捲動)
            const scrollContainer = this.overlay.querySelector('.ach-body');
            let isDown = false;
            let startY;
            let scrollTop;
            let velocity = 0;
            let lastY = 0;
            let lastTime = 0;
            let momentumID = null;

            const startInertia = () => {
                const friction = 0.97; // 摩擦係數，數值越大滑得越遠
                const step = () => {
                    if (Math.abs(velocity) < 0.1) {
                        cancelAnimationFrame(momentumID);
                        return;
                    }
                    scrollContainer.scrollTop -= velocity;
                    velocity *= friction;
                    momentumID = requestAnimationFrame(step);
                };
                momentumID = requestAnimationFrame(step);
            };

            scrollContainer.addEventListener('mousedown', (e) => {
                if (e.target.tagName.toLowerCase() === 'button') return;

                isDown = true;
                scrollContainer.classList.add('grabbing');
                startY = e.pageY - scrollContainer.offsetTop;
                scrollTop = scrollContainer.scrollTop;

                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.pageY;
                lastTime = Date.now();
            });

            scrollContainer.addEventListener('mouseleave', () => {
                if (!isDown) return;
                isDown = false;
                scrollContainer.classList.remove('grabbing');
                startInertia();
            });

            scrollContainer.addEventListener('mouseup', () => {
                if (!isDown) return;
                isDown = false;
                scrollContainer.classList.remove('grabbing');
                startInertia();
            });

            scrollContainer.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();

                const y = e.pageY - scrollContainer.offsetTop;
                const walk = (y - startY) * 1.5;
                scrollContainer.scrollTop = scrollTop - walk;

                // 計算即時速度
                const now = Date.now();
                const dt = now - lastTime;
                if (dt > 0) {
                    const dy = e.pageY - lastY;
                    velocity = dy * 0.8; // 速度權重
                    lastTime = now;
                    lastY = e.pageY;
                }
            });

            // 手機觸控支持
            scrollContainer.addEventListener('touchstart', (e) => {
                if (e.target.tagName.toLowerCase() === 'button') return;
                isDown = true;
                startY = e.touches[0].pageY - scrollContainer.offsetTop;
                scrollTop = scrollContainer.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.touches[0].pageY;
                lastTime = Date.now();
            }, { passive: false });

            scrollContainer.addEventListener('touchmove', (e) => {
                if (!isDown) return;
                const y = e.touches[0].pageY - scrollContainer.offsetTop;
                const walk = (y - startY) * 1.5;
                scrollContainer.scrollTop = scrollTop - walk;

                const now = Date.now();
                const dt = now - lastTime;
                if (dt > 0) {
                    const dy = e.touches[0].pageY - lastY;
                    velocity = dy * 0.8;
                    lastTime = now;
                    lastY = e.touches[0].pageY;
                }
            }, { passive: true });

            scrollContainer.addEventListener('touchend', () => {
                if (!isDown) return;
                isDown = false;
                startInertia();
            });
        },

        renderData: function () {
            if (!window.ScoreManager || !this.overlay) return;
            const data = window.ScoreManager.loadPlayerData();

            // 填寫總覽
            const totalScore = Math.floor(data.totalScore || 0);
            const currentRankName = data.globalRank || '書僮';
            const claimed = data.achievements?.claimed || [];

            // 判斷當前文位是否領取
            const rankId = `rank_${currentRankName}`;
            const isRankClaimed = claimed.includes(rankId) || currentRankName === '書僮';

            const rankViewEl = document.getElementById('achRankView');
            if (!isRankClaimed) {
                rankViewEl.textContent = '領取稱號榜單';
                rankViewEl.classList.add('clickable-rank');
                rankViewEl.onclick = () => {
                    const ranks = window.ScoreManager.ranks;
                    const r = ranks.find(rank => rank.name === currentRankName);
                    if (r) {
                        const idx = ranks.indexOf(r);
                        const cImg = this.certImages[Math.min(idx, this.certImages.length - 1)];
                        const cText = this.rankCertTexts[currentRankName] || '恭喜榮升！';
                        this.claimAchievementReward(rankId, cImg, cText);
                    }
                };
            } else {
                rankViewEl.textContent = currentRankName;
                rankViewEl.classList.remove('clickable-rank');
                rankViewEl.onclick = null;
            }

            document.getElementById('achTotalScore').textContent = totalScore.toLocaleString();
            document.getElementById('achPlayDays').textContent = data.playDays || 1;

            // 下一階級資訊
            const ranks = window.ScoreManager.ranks;
            let nextRank = null;
            for (let i = 0; i < ranks.length; i++) {
                if (totalScore < ranks[i].minScore) {
                    nextRank = ranks[i];
                    break;
                }
            }

            const nextInfoEl = document.getElementById('achNextRankInfo');
            if (nextRank) {
                nextInfoEl.style.display = 'block';
                document.getElementById('achNextScore').textContent = nextRank.minScore.toLocaleString();
                document.getElementById('achNextRank').textContent = `進階 ${nextRank.name} 合格成績`;
            } else {
                nextInfoEl.style.display = 'none';
            }

            // 渲染引繼碼區塊 (預設顯示暱稱)
            const idDisplay = document.getElementById('achCloudIdDisplay');
            const btnCopy = document.getElementById('achBtnCopyId');
            if (idDisplay) {
                idDisplay.textContent = data.nickname || '訪客';
            }
            if (btnCopy) {
                btnCopy.textContent = '顯示引繼碼';
            }

            // 渲染遊戲紀錄
            const gamesContainer = document.getElementById('achGamesContainer');
            gamesContainer.innerHTML = '';

            let hasGames = false;
            if (data.games) {
                for (const gameKey in data.games) {
                    const gameInfo = data.games[gameKey];
                    if (gameInfo && typeof gameInfo === 'object' && gameInfo.playCount > 0) {
                        hasGames = true;
                        const card = document.createElement('div');
                        card.className = 'ach-game-card';
                        card.innerHTML = `
                            <div class="ach-game-name">${this.gameNames[gameKey] || gameKey.toUpperCase()}</div>
                            <div class="ach-game-details">
                                最高分: <b>${Math.floor(gameInfo.highScore).toLocaleString()}</b><br>
                                最高難度: ${gameInfo.highestDifficulty}<br>
                                遊玩次數: ${gameInfo.playCount.toLocaleString()}
                            </div>
                        `;
                        gamesContainer.appendChild(card);
                    }
                }
            }
            if (!hasGames) {
                gamesContainer.innerHTML = '<div style="text-align:center; color:#999; padding:0.9rem;">尚無遊戲紀錄</div>';
            }

            // 渲染成就殿堂
            const badgesContainer = document.getElementById('achBadgesContainer');
            badgesContainer.innerHTML = '';

            const claimStatus = data.achievements.claimed || [];
            const thresholds = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
            const certImages = this.certImages;

            let lastUnlockedItem = null;

            // 1. 渲染玩家階級榜單
            ranks.forEach((r, idx) => {
                const rankId = `rank_${r.name}`;
                const isUnlocked = totalScore >= r.minScore;
                const isClaimed = claimStatus.includes(rankId) || r.name === '書僮';

                const item = document.createElement('div');
                item.className = 'ach-badge-item rank-item';

                const left = document.createElement('div');
                left.innerHTML = `
                    <div class="ach-badge-title">【階級】${r.name}</div>
                    <div class="ach-badge-status">${isUnlocked ? '已達成' : `還需 ${(r.minScore - totalScore).toLocaleString()} 分`}</div>
                `;

                const right = document.createElement('div');
                right.className = 'ach-item-right';

                const certImg = certImages[Math.min(idx, certImages.length - 1)];
                if (isClaimed) {
                    const btn = document.createElement('button');
                    btn.className = 'ach-btn-claim';
                    btn.textContent = '查看獎狀';
                    btn.style.background = 'hsl(44, 60%, 44%)';
                    btn.onclick = () => {
                        this.showCert(certImg, this.rankCertTexts[r.name] || '恭喜榮升！');
                    };
                    right.appendChild(btn);
                    lastUnlockedItem = item;
                } else if (isUnlocked) {
                    const btn = document.createElement('button');
                    btn.className = 'ach-btn-claim';
                    btn.textContent = '領取獎狀';
                    btn.onclick = () => {
                        this.claimAchievementReward(rankId, certImg, this.rankCertTexts[r.name] || '恭喜榮升！');
                    };
                    right.appendChild(btn);
                    lastUnlockedItem = item;
                } else {
                    const span = document.createElement('span');
                    span.style.color = '#ccc';
                    span.textContent = '未達成';
                    right.appendChild(span);
                }

                item.appendChild(left);
                item.appendChild(right);
                badgesContainer.appendChild(item);
            });

            // 2. 渲染【關卡挑戰】成就 (每個遊戲佔一格)
            for (let gameKey in this.gameNames) {
                const gameName = this.gameNames[gameKey];
                const progress = data.levelProgress[gameKey] || {};
                const totalPassed = (progress['小學'] || 0) + (progress['中學'] || 0) + (progress['高中'] || 0) + (progress['大學'] || 0) + (progress['研究所'] || 0);

                const milestone = Math.floor(totalPassed / 20) * 20;
                const nextMilestone = Math.min(300, milestone + 20);
                const achId = `level_milestone_${gameKey}_${milestone}`;

                const isClaimed = milestone > 0 && claimStatus.includes(achId);
                const isUnlocked = milestone > 0 && totalPassed >= milestone;

                const item = document.createElement('div');
                item.className = 'ach-badge-item level-challenge-item';

                const left = document.createElement('div');
                const displayMilestone = milestone > 0 ? milestone : 20;
                left.innerHTML = `
                    <div class="ach-badge-title">《${gameName}》挑戰 ${displayMilestone} 關</div>
                    <div class="ach-badge-status">關卡挑戰進度 ${totalPassed} / ${nextMilestone}</div>
                `;

                const right = document.createElement('div');
                right.className = 'ach-item-right';

                if (milestone === 0) {
                    const span = document.createElement('span');
                    span.style.color = '#ccc';
                    span.textContent = '未達成';
                    right.appendChild(span);
                } else if (isClaimed) {
                    const btn = document.createElement('button');
                    btn.className = 'ach-btn-claim';
                    btn.textContent = '查看獎狀';
                    btn.style.background = 'hsl(44, 60%, 44%)';
                    btn.onclick = () => {
                        this.showCert(this.certImages[Math.floor(milestone / 30) % 10], this.getLevelCertText(gameName, milestone));
                    };
                    right.appendChild(btn);
                    lastUnlockedItem = item;
                } else if (isUnlocked) {
                    const btn = document.createElement('button');
                    btn.className = 'ach-btn-claim';
                    btn.textContent = '領取獎狀';
                    btn.dataset.achId = achId;
                    btn.onclick = () => {
                        this.claimAchievementReward(achId, this.certImages[Math.floor(milestone / 30) % 10], this.getLevelCertText(gameName, milestone));
                    };
                    right.appendChild(btn);
                    lastUnlockedItem = item;
                } else {
                    const span = document.createElement('span');
                    span.style.color = '#ccc';
                    span.textContent = '未達成';
                    right.appendChild(span);
                }

                item.appendChild(left);
                item.appendChild(right);
                badgesContainer.appendChild(item);
            }

            // 3. 渲染原有次數成就
            const categories = [
                { data: data.difficultyCounts || {}, map: { '小學': '小學', '中學': '中學', '高中': '高中', '大學': '大學', '研究所': '研究所' } },
                { data: data.games || {}, map: this.gameNames }
            ];

            thresholds.forEach((t, i) => {
                const certImg = certImages[i % certImages.length];
                categories.forEach(cat => {
                    const countsInfo = cat.data;
                    const nameMap = cat.map;

                    for (let key in nameMap) {
                        let count = countsInfo[key] || 0;
                        if (typeof count === 'object') count = count.playCount || 0;
                        const dispName = nameMap[key];
                        let title = `「${dispName}」過關${t}次`;

                        if (dispName === '小學' || dispName === '中學' || dispName === '高中' || dispName === '大學' || dispName === '研究所') {
                            title = `『${dispName}』程度過關${t}次`;
                        }

                        const achId = `${key}_${t}`;

                        if (count < t && !claimStatus.includes(achId)) continue; // 隱藏未達成的舊成就，避免清單過長

                        const isClaimed = claimStatus.includes(achId);
                        const isUnlocked = count >= t;

                        const item = document.createElement('div');
                        item.className = 'ach-badge-item';

                        const left = document.createElement('div');
                        left.innerHTML = `
                            <div class="ach-badge-title">${title}</div>
                            <div class="ach-badge-status">進度: ${count} / ${t}</div>
                        `;

                        const right = document.createElement('div');
                        right.className = 'ach-item-right';

                        if (isClaimed) {
                            const btn = document.createElement('button');
                            btn.className = 'ach-btn-claim';
                            btn.textContent = '查看獎狀';
                            btn.style.background = 'hsl(44, 60%, 44%)';
                            btn.onclick = () => {
                                this.showCert(certImg, `恭賀\n「${dispName}」過關達${t}次。\n才思敏捷，氣貫長虹。望君續筆山川，再現錦繡華章。`);
                            };
                            right.appendChild(btn);
                        } else if (isUnlocked) {
                            const btn = document.createElement('button');
                            btn.className = 'ach-btn-claim';
                            btn.textContent = '領取獎狀';
                            btn.dataset.achId = achId;
                            btn.onclick = () => {
                                this.claimAchievementReward(achId, certImg, `恭賀\n「${dispName}」過關達${t}次。\n才思敏捷，氣貫長虹。望君續筆山川，再續錦繡華章。`);
                            };
                            right.appendChild(btn);
                            lastUnlockedItem = item;
                        }

                        item.appendChild(left);
                        item.appendChild(right);
                        badgesContainer.appendChild(item);
                    }
                });
            });

            if (lastUnlockedItem) {
                setTimeout(() => {
                    lastUnlockedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            }

            // --- 核心修正：將所有成就狀態「數據化」，確保本地與雲端完全一致 ---
            this.syncAchievementStates(data);
        },

        /**
         * 成就設計理念：
         * - claimed[]  = 唯一需要持久化的成就數據（避免重複領獎）
         * - unlocked/progress 均從 games/levelProgress/totalScore 動態計算，不儲存
         * - 每次領獎後，直接呼叫 saveGameToCloud 同步 claimed 即可
         */
        syncAchievementStates: function (currentData) {
            // 此函式保留為空，設計上不再推算 unlocked/progress
            // 雲端只需同步 totalScore, games, levelProgress, claimed
        },

        //顯示獎狀
        showCert: function (imgUrl, text, isNewClaim = false) {
            let overlay = document.getElementById('certOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'certOverlay';
                overlay.className = 'cert-overlay aspect-5-8';
                overlay.innerHTML = `
                    <div class="cert-card fallback-bg" id="certCard">
                        <div class="cert-content" id="certContentBox">
                            <div class="cert-text" id="certText"></div>
                        </div>
                        <div class="cert-reward-msg" id="certRewardMsg"></div>
                        <div class="cert-close-hint">點擊任意處關閉</div>
                    </div>
                    <div id="certStarContainer" class="cert-star-container"></div>
                `;
                document.body.appendChild(overlay);
                overlay.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playCloseItem();
                    overlay.classList.remove('active');
                });
            }

            const certCard = document.getElementById('certCard');
            const certText = document.getElementById('certText');
            const certContent = document.getElementById('certContentBox');
            const rewardMsg = document.getElementById('certRewardMsg');
            const starContainer = document.getElementById('certStarContainer');

            certCard.style.backgroundImage = `url('${imgUrl}')`;
            certText.textContent = text;
            rewardMsg.style.display = 'none';
            starContainer.innerHTML = '';

            certContent.classList.remove('animate');
            void certContent.offsetWidth;
            certContent.classList.add('animate');

            overlay.classList.add('active');
            //顯示領取得分獎勵訊息
            if (isNewClaim) {
                rewardMsg.style.display = 'block';
                rewardMsg.style.opacity = '1';

                let count = 10000;
                const duration = 3000;
                const startTime = Date.now();

                const spawnStar = () => {
                    const star = document.createElement('span');
                    star.className = 'cert-star';
                    star.textContent = '★';
                    star.style.fontSize = (Math.random() * 1 + 0.5) + 'rem';
                    star.style.left = Math.random() * 100 + '%';
                    star.style.animationDuration = (Math.random() * 1.5 + 0.5) + 's';
                    starContainer.appendChild(star);
                    setTimeout(() => star.remove(), 3000);
                };
                const starInterval = setInterval(spawnStar, 30);

                const animate = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(1, elapsed / duration);
                    const current = Math.floor(10000 * progress);
                    rewardMsg.textContent = `獲贈 ${current.toLocaleString()} 積分`;
                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        clearInterval(starInterval);
                        //取消延遲1秒後消失，留在原地
                        //setTimeout(() => { rewardMsg.style.opacity = '0'; }, 1000);
                    }
                };
                requestAnimationFrame(animate);
            }
        },

        getLevelCertText: function (gameName, milestone) {
            return `翰墨清芬，詞海揚名。\n閣下於「${gameName}」展現非凡才思，成功通過 ${milestone} 道關隘。經史合參，雅量高致。願君持此文心，再續一段千古佳話。`;
        },
        //領取獎勵
        claimAchievementReward: function (achId, imgUrl, text) {
            if (window.SoundManager) window.SoundManager.playJoyfulTriple();
            const data = window.ScoreManager.loadPlayerData();
            if (!data.achievements.claimed) data.achievements.claimed = [];

            if (data.achievements.claimed.includes(achId)) {
                this.showCert(imgUrl, text, false);
                return;
            }

            data.achievements.claimed.push(achId);
            data.totalScore += 10000;
            // 修正：使用 ScoreManager 統一的階級計算方法
            if (window.ScoreManager) {
                data.globalRank = window.ScoreManager.getCurrentRank(data.totalScore);
            }
            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));

            // 同步至雲端環境 (如果 Supabase 已初始化)
            if (window.SupabaseClient) {
                window.SupabaseClient.saveGameToCloud(data);
            }

            this.renderData();
            this.showCert(imgUrl, text, true);
        },
        //顯示即時成就彈窗
        showInstantAchievementPop: function (achId, gameKey, levelIndex, onComplete) {
            const data = window.ScoreManager.loadPlayerData();
            const gameName = this.gameNames[gameKey] || gameKey;
            const currentRank = data.globalRank || '書僮';

            const popOverlay = document.createElement('div');
            popOverlay.className = 'ach-instant-pop-overlay aspect-5-8';
            popOverlay.innerHTML = `
                <div class="ach-instant-pop">
                    <h2>恭喜榮獲成就</h2>
                    <p>翰墨清芬，詞海揚名。閣下<b>【${currentRank}】</b>銳意進取，終破此關，獲<b>積分萬點</b>以表精誠。願君筆耕不輟，再續錦繡華章。</p>
                    <div class="ach-instant-footer">
                        <button id="instantClaimBtn" class="ach-instant-btn">領取成就</button>
                    </div>
                </div>
            `;
            document.body.appendChild(popOverlay);
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();

            document.getElementById('instantClaimBtn').onclick = () => {
                popOverlay.remove();
                const milestone = Math.floor(levelIndex / 20) * 20;
                const cImg = this.certImages[Math.min(9, Math.floor(milestone / 30))];
                const cText = this.getLevelCertText(gameName, milestone);
                this.claimAchievementReward(achId, cImg, cText);
                setTimeout(onComplete, 2500);
            };
        },

        show: function () {
            this.init();
            this.renderData();
            const tabs = this.overlay.querySelectorAll('.ach-tab');
            if (tabs.length > 0) tabs[0].click();
            this.overlay.classList.remove('hidden');
            document.body.classList.add('overlay-active');
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
        },

        hide: function () {
            if (!this.overlay) return;
            this.overlay.classList.add('hidden');
            document.body.classList.remove('overlay-active');
        }
    };

    // 測試專用：按 Alt+W 觸發「恭喜榮獲成就」彈窗，方便檢視動畫表演
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'w' || e.key === 'W')) {
            e.preventDefault();
            const dummyId = 'test_ach_' + Date.now();
            AchievementDialog.showInstantAchievementPop(dummyId, 'game1', 20, () => {
                console.log('測試用成就表演完畢');
            });
        }
    });

    window.AchievementDialog = AchievementDialog;
})();
