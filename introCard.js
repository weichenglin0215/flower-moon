/**
 * 花月 Intro Card (Splash Screen) / 關於花月對話框
 */

(function () {
    'use strict';

    const AboutDialog = {
        overlay: null,
        hideTimeout: null,
        autoCloseTimeout: null,

        init: function () {
            // 如果已经在 DOM 中则不处理
            if (document.getElementById('introOverlay')) return;

            // 確保 introCard.css 已載入
            if (!document.getElementById('intro-card-css')) {
                const link = document.createElement('link');
                link.id = 'intro-card-css';
                link.rel = 'stylesheet';
                link.href = 'introCard.css';
                document.head.appendChild(link);
            }

            this.createDOM();
            this.bindEvents();

            // 如果是在玩遊戲或是某個特定頁面開啟(有 query strings)，就不顯示
            if (!window.location.search.includes('game=') && !window.location.search.includes('page=')) {
                this.show(true);
            }
        },

        show: function (autoClose = false) {
            if (!this.overlay) this.init();
            // 如果正在隱藏中，取消隱藏計時器
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            if (this.autoCloseTimeout) {
                clearTimeout(this.autoCloseTimeout);
                this.autoCloseTimeout = null;
            }

            this.overlay.classList.remove('hidden');
            this.overlay.classList.remove('hide-fade', 'hide-slide-left', 'hide-slide-right');
            document.body.classList.add('overlay-active');

            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
            if (window.SoundManager) setTimeout(() => window.SoundManager.playJoyfulTriple(), 1000);

            if (autoClose) {
                this.autoCloseTimeout = setTimeout(() => {
                    //半透明慢慢消失
                    this.overlay.classList.add('hide-fade');
                }, 2500);
                this.autoCloseTimeout = setTimeout(() => {
                    this.hide(); //4秒後完全消失，請參考 introCard.css intro-overlay.hide-fade
                }, 4000);
            }
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'introOverlay';
            overlay.className = 'intro-overlay aspect-5-8 hidden'; // 預設隱藏

            overlay.innerHTML = `
                <div class="intro-card" id="introCardNode" role="dialog" aria-modal="true">
                    <div class="intro-decoration">🌸</div>
                    
                    <div class="intro-title">花月</div>
                    <div class="intro-subtitle">Flower Moon</div>
                    
                    <div class="intro-content">
                        <div class="intro-text-block">
                            <p>賞花吟月，品味詩詞之美</p>
                            <p>寓教於樂，挑戰傳統文學</p>
                            <p>更新：2026-04-01 V0.14.8.0</p>
                        </div>
                    </div>
                    
                    <div class="intro-footer">
                        <span class="intro-author">作者：開心花園丁</span>
                        <span>初版：2020年2月</span>
                    </div>
                    
                    <div class="intro-swipe-hint">點擊或滑動關閉</div>
                    
                    <div class="intro-decoration-left">🌸</div>
                </div>
            `;

            document.body.appendChild(overlay);
            this.overlay = overlay;
        },

        bindEvents: function () {
            if (!this.overlay) return;

            // 點擊關閉
            this.overlay.addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });

            // 滑動關閉邏輯
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
                        if (window.SoundManager) window.SoundManager.playCloseItem();
                        this.hide(diff > 0 ? 'right' : 'left');
                    }
                }
                startX = 0;
                currentX = 0;
            });
        },

        hide: function (direction) {
            if (!this.overlay) return;

            // 取消之前的隱藏計時器
            if (this.hideTimeout) {
                clearTimeout(this.hideTimeout);
                this.hideTimeout = null;
            }
            if (this.autoCloseTimeout) {
                clearTimeout(this.autoCloseTimeout);
                this.autoCloseTimeout = null;
            }

            let timeoutDuration = 600;
            if (direction === 'left') {
                this.overlay.classList.add('hide-slide-left');
            } else if (direction === 'right') {
                this.overlay.classList.add('hide-slide-right');
            } else {
                this.overlay.classList.add('hide-fade');
                timeoutDuration = 1000;
            }

            // 動畫結束後正式隱藏並恢復 body 捲動
            this.hideTimeout = setTimeout(() => {
                this.overlay.classList.add('hidden');
                document.body.classList.remove('overlay-active');
                this.hideTimeout = null;
            }, timeoutDuration);
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
