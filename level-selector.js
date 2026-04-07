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
        maxLevels: 300,

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
            overlay.className = 'level-selector-overlay aspect-5-8 hidden';

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
            this.overlay = overlay;
        },

        show: function (gameKey, callback) {
            this.init();
            this.gameKey = gameKey;
            this.callback = callback;
            this.renderLevels();
            this.overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
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

            for (let i = 1; i <= this.maxLevels; i++) {
                const info = this.getLevelConfig(i, progressData);
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

        getLevelConfig: function (i, progressData) {
            let diff = '';
            let relIdx = 0;
            let isLocked = false;
            let isCleared = false;
            let colorClass = '';

            if (i <= 20) {
                diff = '小學';
                relIdx = i;
                colorClass = 'green-bg';
                isCleared = (progressData['小學'] || 0) >= relIdx;
                isLocked = false;
            } else if (i <= 50) {
                diff = '中學';
                relIdx = i - 20;
                colorClass = 'blue-bg';
                isCleared = (progressData['中學'] || 0) >= relIdx;
                isLocked = false;
            } else if (i <= 100) {
                diff = '高中';
                relIdx = i - 50;
                colorClass = 'red-bg';
                const currentProg = progressData['高中'] || 0;
                isCleared = currentProg >= relIdx;
                isLocked = relIdx > (currentProg + 1);
            } else if (i <= 150) {
                diff = '大學';
                relIdx = i - 100;
                colorClass = 'purple-bg';
                const hsProg = progressData['高中'] || 0;
                const currentProg = progressData['大學'] || 0;
                isCleared = currentProg >= relIdx;
                isLocked = (hsProg < 50) || (relIdx > (currentProg + 1));
            } else {
                diff = '研究所';
                relIdx = i - 150;
                colorClass = 'gold-bg';
                const univProg = progressData['大學'] || 0;
                const currentProg = progressData['研究所'] || 0;
                isCleared = currentProg >= relIdx;
                isLocked = (univProg < 50) || (relIdx > (currentProg + 1));
            }

            return { diff, relIdx, isLocked, isCleared, colorClass };
        },

        selectLevel: function (difficulty, levelIndex) {
            this.hide();
            if (this.callback) {
                this.callback(difficulty, levelIndex);
            }
        }
    };

    window.LevelSelector = LevelSelector;

})();
