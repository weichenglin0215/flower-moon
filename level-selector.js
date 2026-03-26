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

            // 滑鼠事件
            grid.addEventListener('mousedown', (e) => {
                isDragging = true;
                hasDragged = false;
                startY = e.pageY - grid.offsetTop;
                scrollTop = grid.scrollTop;
                grid.style.cursor = 'grabbing';
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
            });

            window.addEventListener('mouseup', () => {
                isDragging = false;
                grid.style.cursor = 'grab';
            });

            // 觸控事件
            grid.addEventListener('touchstart', (e) => {
                isDragging = true;
                hasDragged = false;
                startY = e.touches[0].pageY - grid.offsetTop;
                scrollTop = grid.scrollTop;
            }, { passive: true });

            grid.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                const y = e.touches[0].pageY - grid.offsetTop;
                const walk = (y - startY);
                if (Math.abs(walk) > threshold) {
                    hasDragged = true;
                    // 如果正在拖移，則阻擋原生捲動
                    if (e.cancelable) e.preventDefault();
                }
                grid.scrollTop = scrollTop - walk;
            }, { passive: false });

            grid.addEventListener('touchend', () => {
                isDragging = false;
            });

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
