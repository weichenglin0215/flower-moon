/**
 * 独立难度选择组件
 * 全局共享，供所有游戏使用
 */

(function () {
    'use strict';

    const DifficultySelector = {
        overlay: null,
        callback: null,
        currentGameName: '',

        // 难度级别
        levels: ['小學', '中學', '高中', '大學', '研究所'],

        // 遊戲標題至代號映射
        gameTitleToKey: {
            '慢思快選': 'game1',
            '飛花令': 'game2',
            '字爬梯': 'game3',
            '眾裡尋他': 'game4',
            '眾裡尋他千百度': 'game4',
            '詩詞精靈': 'game5',
            '詩詞小精靈': 'game5',
            '詩陣侵略': 'game6',
            '青鳥雲梯': 'game7',
            '一筆裁詩': 'game8',
            '詩韻鎖扣': 'game9',
            '擊石鳴詩': 'game10',
            '翻墨識蹤': 'game11',
            '疏影橫斜': 'game12'
        },

        /**
         * 初始化组件
         */
        init: function () {
            // 如果已經初始化，直接返回
            if (this.overlay) return;

            // 確保 difficulty-selector.css 已載入
            if (!document.getElementById('difficulty-selector-css')) {
                const link = document.createElement('link');
                link.id = 'difficulty-selector-css';
                link.rel = 'stylesheet';
                link.href = 'difficulty-selector.css';
                document.head.appendChild(link);
            }

            // 创建 DOM 结构
            this.createDOM();

            // 绑定事件
            this.bindEvents();
        },

        /**
         * 创建 DOM 结构
         */
        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'difficulty-selector-overlay';
            overlay.className = 'difficulty-selector-overlay  hidden';

            const buttonsHTML = this.levels.map(level =>
                `<button class="difficulty-btn" data-level="${level}">${level}</button>`
            ).join('');

            overlay.innerHTML = `
                <div class="difficulty-selector-container">
                    <h2>請選擇難度</h2>
                    <div class="difficulty-buttons">
                        ${buttonsHTML}
                    </div>
                    <div class="level-challenge-container">
                        <button class="level-challenge-btn" id="level-challenge-btn">
                            關卡挑戰 <span class="new-tag">新</span>
                        </button>
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

        /**
         * 绑定事件
         */
        bindEvents: function () {
            // 点击难度按钮
            const buttons = this.overlay.querySelectorAll('.difficulty-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const level = e.target.getAttribute('data-level');
                    //根據難度，播放不同音頻。
                    //小學:1,中學:2,高中:3,大學:4,研究所:5
                    let audioIndex = 1;
                    if (level === '小學') audioIndex = 7;
                    else if (level === '中學') audioIndex = 9;
                    else if (level === '高中') audioIndex = 11;
                    else if (level === '大學') audioIndex = 13;
                    else if (level === '研究所') audioIndex = 15;
                    if (window.SoundManager) {
                        //三連音，延遲播放，避免音頻重疊。
                        window.SoundManager.playGuzheng(audioIndex);
                        setTimeout(() => window.SoundManager.playGuzheng(audioIndex + 2), 200);
                        //setTimeout(() => window.SoundManager.playGuzheng(audioIndex + 4), 350);
                    }
                    this.selectDifficulty(level);
                });
            });

            // 点击关卡挑战按钮
            const levelBtn = this.overlay.querySelector('#level-challenge-btn');
            if (levelBtn) {
                levelBtn.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    this.hide();
                    if (window.LevelSelector) {
                        const gameKey = this.gameTitleToKey[this.currentGameName] || this.currentGameName;
                        window.LevelSelector.show(gameKey, this.callback);
                    } else {
                        console.error('LevelSelector not found');
                    }
                });
            }

            // 点击背景关闭（可选）
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    // 点击背景不关闭，强制选择难度
                    // this.hide();
                }
            });
        },

        /**
         * 显示难度选择器
         * @param {string} gameName - 游戏名称（用于日志）
         * @param {Function} callback - 选择后的回调函数，参数为选中的难度
         */
        show: function (gameName, callback) {
            console.log(`[DifficultySelector] 正在開啟難度選擇器: ${gameName}`);
            this.init(); // 確保已初始化

            this.currentGameName = gameName || 'Unknown Game';
            this.callback = callback;

            if (this.overlay) {
                this.overlay.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                console.log(`[DifficultySelector] 難度選擇器已顯示`);
            } else {
                console.error('[DifficultySelector] 無法顯示：DOM 未創建');
            }
        },

        /**
         * 隐藏难度选择器
         */
        hide: function () {
            if (!this.overlay) return;

            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';

            console.log(`[DifficultySelector] 隐藏难度选择器`);
        },

        /**
         * 選擇難度
         * @param {string} level - 選中的難度
         */
        selectDifficulty: function (level) {
            console.log(`[DifficultySelector] ${this.currentGameName} 選擇難度: ${level}`);
            this.hide();
            if (this.callback && typeof this.callback === 'function') {
                this.callback(level);
            }
        },

        /**
         * 清理组件
         */
        destroy: function () {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
            this.callback = null;
            this.currentGameName = '';
        }
    };

    // 导出到全局
    window.DifficultySelector = DifficultySelector;

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DifficultySelector.init();
        });
    } else {
        DifficultySelector.init();
    }

})();

