/**
 * 花月 Intro Card (Splash Screen) / 關於花月對話框
 */

(function () {
    'use strict';

    const AboutDialog = {
        overlay: null,

        init: function () {
            // 如果是在玩遊戲或是某個特定頁面開啟(有 query strings)，就不顯示
            if (window.location.search.includes('game=') || window.location.search.includes('page=')) {
                return;
            }

            this.show();
        },

        show: function () {
            if (document.getElementById('introOverlay')) return; // 避免重疊
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'introOverlay';
            overlay.className = 'intro-overlay';

            overlay.innerHTML = `
                <div class="intro-card" id="introCardNode">
                    <div class="intro-decoration">🌸</div>
                    
                    <div class="intro-title">花月</div>
                    <div class="intro-subtitle">Flower Moon</div>
                    
                    <div class="intro-content">
                        <div class="intro-text-block">
                            <p>賞花吟月，品味詩詞之美</p>
                            <p>寓教於樂，挑戰傳統文學</p>
                            <p>更新：2026-02-26</p>
                        </div>
                    </div>
                    
                    <div class="intro-footer">
                        <span class="intro-author">作者：開心花園丁</span>
                        <span>初版：2020年2月</span>
                    </div>
                    
                    <div class="intro-swipe-hint">點擊關閉簡介頁</div>
                    
                    <div class="intro-decoration-left">🌸</div>
                </div>
            `;

            document.body.appendChild(overlay);
            this.overlay = overlay;
        },

        bindEvents: function () {
            if (!this.overlay) return;

            // 點擊關閉 (淡出)
            this.overlay.addEventListener('click', () => {
                this.hide();
            });

            // 滑動關閉
            let startX = 0;
            let currentX = 0;
            const threshold = 50;

            this.overlay.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
            }, { passive: true });

            this.overlay.addEventListener('touchmove', (e) => {
                currentX = e.touches[0].clientX;
            }, { passive: true });

            this.overlay.addEventListener('touchend', () => {
                if (startX && currentX) {
                    const diff = currentX - startX;
                    if (Math.abs(diff) > threshold) {
                        this.hide(diff > 0 ? 'right' : 'left');
                    } else {
                        this.hide();
                    }
                }
                startX = 0;
                currentX = 0;
            });
        },

        hide: function (direction) {
            if (!this.overlay) return;

            if (direction === 'left') {
                this.overlay.classList.add('hide-slide-left');
            } else if (direction === 'right') {
                this.overlay.classList.add('hide-slide-right');
            } else {
                this.overlay.classList.add('hide-fade');
            }

            // 等待動畫結束後移除 DOM
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                    this.overlay = null;
                }
            }, 600); // 配合 CSS 動畫時間
        }
    };

    // 輸出到全域
    window.AboutDialog = AboutDialog;
    window.IntroCard = AboutDialog; // 兼容舊命名

    // DOMContentLoaded 後初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AboutDialog.init());
    } else {
        AboutDialog.init();
    }

})();
