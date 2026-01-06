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

        /**
         * 初始化组件
         */
        init: function () {
            // 如果已经初始化，直接返回
            if (this.overlay) return;

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
            overlay.className = 'hidden';

            const buttonsHTML = this.levels.map(level =>
                `<button class="difficulty-btn" data-level="${level}">${level}</button>`
            ).join('');

            overlay.innerHTML = `
                <div class="difficulty-selector-container">
                    <h2>請選擇難度</h2>
                    <div class="difficulty-buttons">
                        ${buttonsHTML}
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
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
                    this.selectDifficulty(level);
                });
            });

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
            this.init(); // 确保已初始化

            this.currentGameName = gameName || 'Unknown Game';
            this.callback = callback;

            this.overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            console.log(`[DifficultySelector] 显示难度选择器 for ${this.currentGameName}`);
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
         * 选择难度
         * @param {string} level - 选中的难度
         */
        selectDifficulty: function (level) {
            console.log(`[DifficultySelector] ${this.currentGameName} 选择难度: ${level}`);

            this.hide();

            // 调用回调函数
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

