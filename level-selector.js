/**
 * 關卡選擇器組件 (LevelSelector)
 * 用於在關卡挑戰模式下，讓玩家選擇特定的關卡序號。
 */

(function () {
    'use strict';

    const LevelSelector = {
        overlay: null,
        callback: null,
        gameKey: '',

        // 目前顯示的難度層。由兩欄式難度選單的右欄「關卡模式」指定。
        // 改版後關卡編號改為「每個難度層各自從 1 起算」，
        // 不再使用舊制 1~300 的全域編號。
        tier: '小學',

        // 後備關卡數；實際數量以 LevelTable.getLevelCount(tier) 為準
        maxLevels: 300,

        // 各難度層的按鈕配色（沿用原本五色）
        tierColorClass: {
            '小學': 'green-bg',
            '中學': 'blue-bg',
            '高中': 'red-bg',
            '大學': 'purple-bg',
            '研究所': 'gold-bg'
        },

        init: function () {
            if (this.overlay) return;
            if (!document.getElementById('level-selector-css')) {
                const link = document.createElement('link');
                link.id = 'level-selector-css';
                link.rel = 'stylesheet';
                link.href = 'level-selector.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.bindDragEvents();
        },

        bindDragEvents: function () {
            const grid = this.overlay.querySelector('#levelGrid');
            let isDragging = false;
            let startY = 0;
            let scrollTop = 0;
            let hasDragged = false;
            const threshold = 5;

            // 慣性捲動變數
            let velocity = 0;
            let lastY = 0;
            let lastTime = 0;
            let momentumID = null;

            // 滑鼠事件
            grid.addEventListener('mousedown', (e) => {
                isDragging = true;
                hasDragged = false;
                startY = e.pageY - grid.offsetTop;
                scrollTop = grid.scrollTop;
                grid.style.cursor = 'grabbing';
                
                // 取消先前的慣性動畫
                if (momentumID) cancelAnimationFrame(momentumID);
                velocity = 0;
                lastY = startY;
                lastTime = performance.now();
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const y = e.pageY - grid.offsetTop;
                const walk = (y - startY);
                if (Math.abs(walk) > threshold) {
                    hasDragged = true;
                    e.preventDefault();
                }
                grid.scrollTop = scrollTop - walk;

                // 計算瞬時速度
                const now = performance.now();
                const dt = now - lastTime;
                if (dt > 0) {
                    velocity = (y - lastY) / dt; // 計算每個 ms 移動多少像素
                    lastY = y;
                    lastTime = now;
                }
            });

            window.addEventListener('mouseup', () => {
                if (!isDragging) return;
                isDragging = false;
                grid.style.cursor = 'grab';

                // 如果速度夠大，開始慣性捲動 (Momentum/Inertia Scrolling)
                const startMomentum = () => {
                    if (Math.abs(velocity) > 0.05) {
                        grid.scrollTop -= velocity * 16; // 假設 16ms 螢幕更新率
                        velocity *= 0.95; // 摩擦係數 (阻尼)，越接近 1 滑行越遠
                        momentumID = requestAnimationFrame(startMomentum);
                    } else {
                        velocity = 0;
                    }
                };
                
                startMomentum();
            });

            // 觸控事件 (讓原生處理捲動，只記錄是否有滑動以避免誤觸)
            grid.addEventListener('touchstart', (e) => {
                hasDragged = false;
                startY = e.touches[0].pageY;
            }, { passive: true });

            grid.addEventListener('touchmove', (e) => {
                const y = e.touches[0].pageY;
                if (Math.abs(y - startY) > threshold) {
                    hasDragged = true;
                }
                // 【重要修復】：絕對不要阻擋 touchmove 的預設行為 (e.preventDefault) 或手動修改 grid.scrollTop，
                // 否則在 iPad / iOS 上會喪失硬體加速，導致嚴重的捲動卡頓。
            }, { passive: true });

            // 存儲 hasDragged 狀態供點擊事件判斷
            this.hasDragged = () => hasDragged;
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'level-selector-overlay';
            overlay.className = 'level-selector-overlay  hidden';

            overlay.innerHTML = `
                <!-- 调试边框 -->
                <!-- <div class="debug-frame"></div> -->
                <div class="level-selector-container">
                    <h2 class="level-selector-title">選擇挑戰關卡</h2>
                    <div class="level-grid" id="levelGrid">
                        <!-- 動態生成 300 格 -->
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    overlay.style.left   = r.left   + 'px';
                    overlay.style.top    = r.top    + 'px';
                    overlay.style.width  = 500 + 'px';
                    overlay.style.height = 850 + 'px';
                    overlay.style.transform = 'scale(' + r.scale + ')';
                    overlay.style.transformOrigin = 'top left';
                });
            }
            this.overlay = overlay;
        },

        show: function (gameKey, callback, tier) {
            this.init();
            this.gameKey = gameKey;
            this.callback = callback;
            this.tier = tier || '小學';
            // 標題顯示目前所在的難度層，避免玩家忘記自己點了哪一層
            const titleEl = this.overlay.querySelector('.level-selector-title');
            if (titleEl) titleEl.textContent = this.tier + ' · 選擇關卡';
            this.renderLevels();
            this.overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            /* updateResponsiveLayout replaced */
        },

        hide: function () {
            if (this.overlay) {
                this.overlay.classList.add('hidden');
                document.body.style.overflow = '';
            }
        },

        renderLevels: function () {
            const grid = document.getElementById('levelGrid');
            if (!grid) return;
            grid.innerHTML = '';

            const data = window.ScoreManager ? window.ScoreManager.loadPlayerData() : null;
            const progressData = (data && data.levelProgress[this.gameKey]) ? data.levelProgress[this.gameKey] : {};
            // 個別通關星星紀錄（只有實際通關過的關卡才亮星）
            const clearedData = (data && data.levelCleared && data.levelCleared[this.gameKey]) ? data.levelCleared[this.gameKey] : {};

            // 關卡數改由跨遊戲共用關卡表決定（各難度層數量不同，
            // 例如小學只有 33 關 —— 因為評價 7 的詩僅 12 首）
            const levelCount = (window.LevelTable && window.LevelTable.getLevelCount(this.tier))
                || this.maxLevels;

            for (let i = 1; i <= levelCount; i++) {
                const info = this.getLevelConfig(i, progressData, clearedData);
                const btn = document.createElement('div');
                btn.className = `level-item ${info.colorClass}`;
                btn.innerHTML = `<span class="level-num">${i}</span>`;

                if (info.isCleared) {
                    btn.innerHTML += '<span class="status-icon star">★</span>';
                }
                if (info.isLocked) {
                    btn.classList.add('locked');
                    btn.innerHTML += '<span class="status-icon lock">🔒</span>';
                }

                btn.addEventListener('click', () => {
                    if (this.hasDragged && this.hasDragged()) return; // 拖拽中不觸發點擊
                    if (info.isLocked) {
                        if (window.SoundManager) window.SoundManager.playFailure();
                        return;
                    }
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    this.selectLevel(info.diff, i);
                });

                grid.appendChild(btn);
            }
        },

        getLevelConfig: function (i, progressData, clearedData) {
            clearedData = clearedData || {};

            // ── 改版後的解鎖規則 ─────────────────────────────────────────
            // 舊制：1~300 全域編號，前 51 關自由選、之後依序解鎖，
            //       且高難度層還要求前一層先破 50 關。
            // 新制：難度層本身已可自由挑選（兩欄式選單右欄），
            //       所以「自由度」由選層提供；層內則單純依序解鎖，
            //       第 1 關永遠開放，第 N 關需先通過第 N-1 關。
            //       已通關的關卡可重複挑戰（複習）。
            const diff = this.tier;
            const relIdx = i;
            const colorClass = this.tierColorClass[diff] || 'green-bg';

            const clearedArr = Array.isArray(clearedData[diff]) ? clearedData[diff] : [];
            const isCleared = clearedArr.indexOf(relIdx) !== -1;

            const currentProg = progressData[diff] || 0;
            const isLocked = relIdx > (currentProg + 1);

            return { diff, relIdx, isLocked, isCleared, colorClass };
        },

        selectLevel: function (difficulty, levelIndex) {
            this.hide();
            // ⚠️ 必須在呼叫遊戲之前設定關卡情境：
            //    遊戲啟動時會呼叫 getSharedRandomPoem(..., seed=levelIndex, gameKey)，
            //    該函式會依這裡設定的難度層去查跨遊戲共用關卡表，
            //    才能讓所有遊戲的「同一關」拿到同一組詩句。
            if (window.LevelTable) {
                window.LevelTable.setContext(difficulty, levelIndex);
            }
            if (this.callback) {
                this.callback(difficulty, levelIndex);
            }
        }
    };

    window.LevelSelector = LevelSelector;

})();
