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
            'game9': '詩韻鎖扣'
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
                            </div>
                        </div>
                        
                        <!-- 遊戲紀錄面板 -->
                        <div class="ach-panel" id="ach-panel-games">
                            <div class="ach-games-grid" id="achGamesContainer">
                                <!-- 動態生成 -->
                            </div>
                        </div>
                        
                        <!-- 徽章面板 -->
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
            // 移除背景點擊消失的功能
            // 頁籤切換
            const tabs = this.overlay.querySelectorAll('.ach-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    this.overlay.querySelectorAll('.ach-panel').forEach(p => p.classList.remove('active'));

                    tab.classList.add('active');
                    const targetId = tab.getAttribute('data-target');
                    document.getElementById(targetId).classList.add('active');
                });
            });

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
                const friction = 0.95; // 摩擦力
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
            // 手機觸控慣性由瀏覽器原生支援，但若要統一體驗也可加
            // 這裡暫以滑鼠拖拽實作為主
        },

        renderData: function () {
            if (!window.ScoreManager) return;
            const data = window.ScoreManager.loadPlayerData();

            // 填寫總覽
            const totalScore = data.totalScore || 0;
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
                        if (!data.achievements.claimed) data.achievements.claimed = [];
                        data.achievements.claimed.push(rankId);
                        localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
                        this.renderData();
                        this.showCert(cImg, cText);
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
                                最高分: <b>${gameInfo.highScore.toLocaleString()}</b><br>
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

            // 渲染徽章殿堂 (成就殿堂)
            const badgesContainer = document.getElementById('achBadgesContainer');
            badgesContainer.innerHTML = '';

            const claimStatus = data.achievements.claimed || [];
            const thresholds = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
            const certImages = [
                'images/九品獎狀.png', 'images/八品獎狀.png', 'images/七品獎狀.png',
                'images/六品獎狀.png', 'images/五品獎狀.png', 'images/四品獎狀.png',
                'images/三品獎狀.png', 'images/二品獎狀.png', 'images/一品獎狀.png',
                'images/聖旨獎狀.png'
            ];

            const getCertText = (t, title) => {
                const cleanTitle = title.replace(/」/g, '」\n');
                if (t <= 50) return `恭賀\n${cleanTitle}。\n青衿志遠，文心雕龍。恭喜閣下於辭海之中撥雲見日，初試啼聲。此番進境，如春草之生於幽谷，芬芳自逸。願君持此文心，更上層樓。`;
                if (t <= 500) return `恭賀\n${cleanTitle}。\n縹緲詞壇，錦繡華章。恭喜閣下擷取明珠於滄海，拾得紅葉於御溝。任務既成，墨香猶在。望君續筆山川，以詩為引，再續一段千古佳話。`;
                return `恭賀\n${cleanTitle}。\n筆落驚風雨，詩成泣鬼神。閣下才思敏捷，氣貫長虹，已破此番關隘。正如長風破浪，終抵文學之巔；金石為開，方顯大儒之志。壯哉！`;
            };

            const diffMap = { '小學': '小學', '中學': '中學', '高中': '高中', '大學': '大學', '研究所': '研究所' };
            const categories = [
                { data: data.difficultyCounts || {}, map: diffMap },
                { data: data.games || {}, map: this.gameNames }
            ];

            let lastUnlockedItem = null;

            // 1. 先渲染玩家階級榜單 (最前面)
            ranks.forEach((r, idx) => {
                const rankId = `rank_${r.name}`;
                const isUnlocked = totalScore >= r.minScore;
                const isClaimed = claimed.includes(rankId) || r.name === '書僮';

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
                const rankCertTexts = {
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
                };

                if (isClaimed) {
                    const btn = document.createElement('button');
                    btn.className = 'ach-btn-claim';
                    btn.textContent = '查看獎狀';
                    btn.style.background = 'hsl(44, 60%, 44%)';
                    btn.onclick = () => this.showCert(certImg, rankCertTexts[r.name] || '恭喜榮升！');
                    right.appendChild(btn);
                    lastUnlockedItem = item;
                } else if (isUnlocked) {
                    const btn = document.createElement('button');
                    btn.className = 'ach-btn-claim';
                    btn.textContent = '領取獎狀';
                    btn.onclick = () => {
                        if (!data.achievements.claimed) data.achievements.claimed = [];
                        data.achievements.claimed.push(rankId);
                        localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
                        this.renderData();
                        this.showCert(certImg, rankCertTexts[r.name] || '恭喜榮升！');
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

            // 2. 渲染其他成就
            thresholds.forEach((t, i) => {
                const certImg = certImages[i];
                categories.forEach(cat => {
                    const countsInfo = cat.data;
                    const nameMap = cat.map;

                    for (let key in nameMap) {
                        let count = countsInfo[key] || 0;
                        if (typeof count === 'object') count = count.playCount || 0;
                        const dispName = nameMap[key];
                        const title = `「${dispName}」過關${t}次`;
                        const achId = `${key}_${t}`;

                        const isClaimed = claimStatus.includes(achId);
                        const isUnlocked = count >= t;

                        const item = document.createElement('div');
                        item.className = 'ach-badge-item';

                        const left = document.createElement('div');
                        left.innerHTML = `
                            <div class="ach-badge-title">${title.replace('\n', '<br>')}</div>
                            <div class="ach-badge-status">進度: ${count.toLocaleString()} / ${t.toLocaleString()}</div>
                        `;

                        const right = document.createElement('div');
                        right.style.display = 'flex';
                        right.style.gap = '0.3rem';
                        right.style.alignItems = 'center';

                        if (isClaimed) {
                            const btn = document.createElement('button');
                            btn.className = 'ach-btn-claim';
                            btn.textContent = '查看獎狀';
                            btn.style.background = 'hsl(44, 60%, 44%)';
                            btn.onclick = () => this.showCert(certImg, getCertText(t, title));
                            right.appendChild(btn);
                            lastUnlockedItem = item;
                        } else if (isUnlocked) {
                            const btn = document.createElement('button');
                            btn.className = 'ach-btn-claim';
                            btn.textContent = '領取獎狀';
                            btn.onclick = () => {
                                if (!data.achievements.claimed) data.achievements.claimed = [];
                                data.achievements.claimed.push(achId);
                                localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
                                this.renderData();
                                this.showCert(certImg, getCertText(t, title));
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
                });
            });

            // 捲動至最難的已達成項目
            if (lastUnlockedItem) {
                setTimeout(() => {
                    lastUnlockedItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 200);
            }
        },

        showCert: function (imgUrl, text) {
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
                        <div class="cert-close-hint">點擊任意處關閉</div>
                    </div>
                `;
                document.body.appendChild(overlay);
                if (window.updateResponsiveLayout) window.updateResponsiveLayout();
                overlay.addEventListener('click', () => {
                    overlay.classList.remove('active');
                });
            }

            const certCard = document.getElementById('certCard');
            const certText = document.getElementById('certText');
            const certContent = document.getElementById('certContentBox');

            certCard.style.backgroundImage = `url('${imgUrl}')`;
            certText.textContent = text;

            // 重置動畫，使其每次都能表演
            certContent.classList.remove('animate');
            void certContent.offsetWidth;
            certContent.classList.add('animate');

            overlay.classList.add('active');
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

    window.AchievementDialog = AchievementDialog;

})();
