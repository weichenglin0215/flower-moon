/* ==========================================================================
   花月 · 學習道路（科考大道）learningPath.js
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路與關卡模式_企畫書.md
     第一章 雙入口架構（學習道路為新首頁，Menu 選單保留自由練功）
     第六章 積分節奏與文位門檻推算（站點分佈）
     第七章 學習道路與文位系統整合（科考大道）

   ── 設計要點 ────────────────────────────────────────────────────────
   1. 這一頁**不新建任何晉升邏輯**：
      文位門檻直接讀 scoreManager.js 既有的 ranks（書僮 0 ～ 大儒 81,920,000），
      站點由 pathStations.js 依「每隔幾天一個小站」的節奏算出（共 308 站）。
   2. 每一站都預先綁定「難度層 + 關卡編號」，
      題目內容由跨遊戲共用關卡表（levelTable.js）決定。
   3. 玩家點下站點後由本模組直接開局，**不再跳出難度選擇器**。
   4. 道路**由下往上**排列，讓玩家有「往上爬」的成長感。
   ========================================================================== */

(function () {
    'use strict';

    // ── 文位 × 可用遊戲對照表（企畫書第 4.2 節，作者定案）──────────────
    // 採「累加解鎖」：後面的文位自動繼承前面所有已解鎖的遊戲。
    // 要調整某個文位可玩哪些遊戲，直接改這張表即可。
    const GAME_UNLOCK = [
        { ranks: ['書僮', '蒙童', '塾生', '童生', '縣案首'], add: [1, 4, 8, 11, 14, 22] },
        { ranks: ['府案首', '文童'], add: [3, 9, 12, 31, 40] },
        { ranks: ['秀才', '舉人'], add: [13, 20, 36, 33] },
        { ranks: ['貢士', '進士', '探花', '榜眼', '狀元', '大儒'], add: [21, 23, 37] }
    ];

    // 學習道路採用的 18 款記憶類遊戲（飛花令 game2 已依作者指示排除）
    const GAME_NAMES = {
        1: '慢思快選', 3: '字爬梯', 4: '眾裡尋他', 8: '一筆裁詩',
        9: '詩韻鎖扣', 11: '翻墨識蹤', 12: '疏影橫斜', 13: '人事時地',
        14: '步步驚心', 20: '丟三落一', 21: '橫批成詩', 22: '詩詞拼圖',
        23: '縱橫集句', 31: '詩眼覓蹤', 33: '作者是誰', 36: '轉輪覓詩',
        37: '步步為陣', 40: '點兵成詩'
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
                            <div class="lp-stat"><span class="lp-stat-label">總積分</span><span class="lp-stat-value" id="lpScore">0</span></div>
                            <div class="lp-stat"><span class="lp-stat-label">文錢</span><span class="lp-stat-value" id="lpSilver">0</span></div>
                        </div>
                    </div>
                    <div class="lp-progress-bar"><div class="lp-progress-fill" id="lpProgFill"></div></div>
                    <div class="lp-progress-text" id="lpProgText"></div>
                </div>
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
         * （作法比照 level-selector.js 既有的慣性捲動實作，行為一致。）
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

            // 慣性參數
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

        /** 取得玩家目前累積分數（一律透過 ScoreManager，不直接碰 localStorage） */
        getTotalScore: function () {
            if (!window.ScoreManager) return 0;
            const data = window.ScoreManager.loadPlayerData();
            return (data && data.totalScore) || 0;
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

        show: function () {
            this.init();
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

        /** 供 menu.js 的全域清理呼叫 */
        stopGame: function () {
            if (this.overlay) this.overlay.classList.add('hidden');
        },

        /**
         * 產生「四段式進度圈」的 SVG。
         * 刻意切成 4 段而非一整圈：整圈在剛起步或即將完成時，
         * 那一點點差異幾乎看不出來；切段之後每完成 25% 就整段亮起，
         * 階段性一目了然。
         */
        buildProgressRing: function (pct) {
            const R = 40, C = 2 * Math.PI * R;
            const SEG = C / 4, GAP = 9;          // 每段弧長與段間空隙
            const arc = SEG - GAP;
            let s = `<svg class="lp-ring" viewBox="0 0 100 100" width="100" height="100" aria-hidden="true">`;
            for (let i = 0; i < 4; i++) {
                // 這一段自身的完成比例（0~1）
                const segPct = Math.max(0, Math.min(1, (pct - i * 25) / 25));
                const off = -(i * SEG);
                // 底槽
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

            this.stations = window.PathStations.build();
            const totalScore = this.getTotalScore();
            const currentIdx = window.PathStations.getCurrentIndex(totalScore);
            const rankGames = this.buildRankGames();

            // ── 頂部資訊列 ──
            const curStation = this.stations[currentIdx];
            this.overlay.querySelector('#lpRank').textContent = curStation ? curStation.rankName : '書僮';
            this.overlay.querySelector('#lpScore').textContent = totalScore.toLocaleString();
            this.overlay.querySelector('#lpSilver').textContent = this.getSilver().toLocaleString();

            // 距離下一站還差多少分（同時作為進度圈的百分比）
            const nextStation = this.stations[currentIdx + 1];
            const progText = this.overlay.querySelector('#lpProgText');
            const progFill = this.overlay.querySelector('#lpProgFill');
            let pct = 100;
            if (nextStation) {
                const base = curStation ? curStation.score : 0;
                const span = Math.max(1, nextStation.score - base);
                pct = Math.min(100, Math.max(0, (totalScore - base) / span * 100));
                progText.textContent =
                    `距「${nextStation.name}」還差 ${(nextStation.score - totalScore).toLocaleString()} 分`;
            } else {
                progText.textContent = '已抵達大儒之境，學海無涯。';
            }
            if (progFill) progFill.style.width = pct + '%';

            // ── 站點：由下往上排列，讓玩家有往上爬的成長感 ──
            const n = this.stations.length;
            this.trackHeight = TOP_PAD + n * SPACING + BOT_PAD;
            const html = [];

            this.stations.forEach((st, i) => {
                // 蜿蜒排列：正弦波決定左右位置
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
                // 標籤放在圓圈的左邊或右邊：圓圈偏左時標籤放右邊，反之亦然
                const labelRight = x <= 250;
                cls.push(labelRight ? 'lp-label-right' : 'lp-label-left');

                // 站點圖示：文位站用印章、考棚站用門樓、小站用圓點
                let icon;
                if (st.type === 'rank') icon = st.isExam ? '⛩' : '❖';
                else icon = isDone ? '✓' : '●';

                // 文位名稱與「難度層＋起始題號」一律顯示（不論是否已取得）。
                // ⚠️ 這裡刻意不顯示遊戲名稱：遊戲是每次進入時才輪替決定的
                //    （見 pickGame），寫死在站點上會與實際玩到的不符。
                const labelHTML =
                    `<div class="lp-station-text">` +
                    `<div class="lp-station-label">${st.name}</div>` +
                    `<div class="lp-station-game">${st.tier} ${st.startQuestion}</div>` +
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
         * 決定這一次要玩哪一款遊戲 —— **隨機挑選**。
         *
         * 遊戲不綁定在題號上：玩家每次進入文位站都隨機抽一款，
         * 因此同一道題也可能換個玩法再遇到一次，正好呼應
         * 「同一首詩，用不同遊戲反覆學」的設計。
         * 候選名單依文位取自 GAME_UNLOCK（企畫書第 4.2 節）。
         */
        pickGame: function (rankName) {
            const pool = this.buildRankGames()[rankName] || [1];
            return pool[Math.floor(Math.random() * pool.length)];
        },

        /**
         * 判斷某一關是否已經通關過（不分是用哪一款遊戲通的）。
         *
         * 學習道路的進度是「這道題會不會了」，與用哪款遊戲通關無關 ——
         * 玩家可能用慢思快選過了第 3 關，之後隨機抽到詩詞拼圖時，
         * 第 3 關就不該再被當成未完成。因此這裡掃過所有遊戲的通關紀錄。
         */
        isLevelCleared: function (tier, level) {
            if (!window.ScoreManager) return false;
            const data = window.ScoreManager.loadPlayerData();
            const lc = (data && data.levelCleared) || {};
            for (const gameKey in lc) {
                const arr = lc[gameKey] && lc[gameKey][tier];
                if (Array.isArray(arr) && arr.indexOf(level) !== -1) return true;
            }
            return false;
        },

        onStationClick: function (idx) {
            const st = this.stations[idx];
            if (!st) return;
            const currentIdx = window.PathStations.getCurrentIndex(this.getTotalScore());

            // 尚未解鎖的站不能玩（分數還沒到）
            if (idx > currentIdx) {
                if (window.SoundManager) window.SoundManager.playFailure();
                return;
            }
            if (window.SoundManager) window.SoundManager.playConfirmItem();

            // ── 挑選這一次要玩的題目 ──────────────────────────────────
            // ⚠️ 絕對不可用「進入次數」來遞增關卡：那會讓玩家一關都沒過，
            //    只是反覆進出就把關卡編號一路往上推，等於跳過失敗的關卡。
            //    正確作法是依**實際通關紀錄**挑題：
            //      1. 優先從「還沒通關」的題目中隨機挑一題 —— 沒過關就會
            //         留在候選名單裡，直到真的通關為止。
            //      2. 若整站都已通關，改從全部題目隨機挑（複習模式）。
            //    採隨機而非依序循環，是為了避免高文位時一直遇到同一首詩。
            const pool = st.levelPool || [st.levelIndex || 1];
            const uncleared = pool.filter(lv => !this.isLevelCleared(st.tier, lv));
            const candidates = uncleared.length ? uncleared : pool;
            const level = candidates[Math.floor(Math.random() * candidates.length)];

            this.launchGame(this.pickGame(st.rankName), st.tier, level);
        },

        /**
         * 直接以指定的難度層＋關卡開局，跳過難度選擇器。
         *
         * ⚠️ 作法說明：18 款遊戲的 show() 都是「先叫出 DifficultySelector，
         *    再由 callback(難度, 關卡) 開局」。為了不必逐一修改 18 個遊戲檔，
         *    這裡在呼叫 show() 前**暫時替換** DifficultySelector.show，
         *    讓它直接把我們指定的難度與關卡回呼回去，隨即立刻還原。
         */
        launchGame: function (gameNo, tier, levelIndex) {
            const GameObj = window['Game' + gameNo];
            if (!GameObj || typeof GameObj.show !== 'function') {
                console.warn('[LearningPath] 找不到遊戲 Game' + gameNo);
                return;
            }

            if (window.LevelTable) window.LevelTable.setContext(tier, levelIndex);
            this.hide();

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

            GameObj.show();
        },

        /** 捲動到玩家目前所在的站（道路由下往上，故需換算） */
        scrollToCurrent: function (smooth) {
            const scroll = this.overlay && this.overlay.querySelector('#lpScroll');
            if (!scroll || !window.PathStations) return;
            const idx = window.PathStations.getCurrentIndex(this.getTotalScore());
            const y = this.trackHeight - BOT_PAD - idx * SPACING;
            // 讓目前站落在可視區偏下方，上方預留即將前往的關卡
            const target = Math.max(0, y - scroll.clientHeight * 0.68);
            if (smooth && scroll.scrollTo) scroll.scrollTo({ top: target, behavior: 'smooth' });
            else scroll.scrollTop = target;
        }
    };

    window.LearningPath = LearningPath;
})();
