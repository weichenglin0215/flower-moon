// ========================================
// 漢堡選單與全域流程管理模組
// ========================================

(function () {
    'use strict';

    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMenu);
    } else {
        initMenu();
    }

    function initMenu() {
        // 創建選單 HTML 結構
        createMenuHTML();

        // 初始化選單功能
        setupMenuEvents();
    }

    function createMenuHTML() {
        // 創建漢堡按鈕
        const hamburgerBtn = document.createElement('div');
        hamburgerBtn.id = 'hamburgerBtn';
        hamburgerBtn.className = 'hamburger-btn';
        hamburgerBtn.innerHTML = `
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
        `;

        // 創建選單面板
        const menuPanel = document.createElement('nav');
        menuPanel.id = 'menuPanel';
        menuPanel.className = 'menu-panel';
        menuPanel.innerHTML = `
            <div class="menu-item" data-page="calendar">
                <span class="menu-number">1</span>
                <span class="menu-text">日曆</span>
            </div>
            <div class="menu-item" data-page="cards">
                <span class="menu-number">2</span>
                <span class="menu-text">卡片(默背)</span>
            </div>
            <div class="menu-item" data-page="game1">
                <span class="menu-number">3</span>
                <span class="menu-text">慢思快選</span>
            </div>
            <div class="menu-item" data-page="game2">
                <span class="menu-number">4</span>
                <span class="menu-text">飛花令</span>
            </div>
            <div class="menu-item" data-page="game3">
                <span class="menu-number">5</span>
                <span class="menu-text">字爬梯</span>
            </div>
            <div class="menu-item" data-page="game4">
                <span class="menu-number">6</span>
                <span class="menu-text">眾裡尋他千百度</span>
            </div>
            <div class="menu-item menu-item-disabled" data-page="coming-soon-7">
                <span class="menu-number">7</span>
                <span class="menu-text">敬請期待...</span>
            </div>
            <div class="menu-item menu-item-disabled" data-page="coming-soon-8">
                <span class="menu-number">8</span>
                <span class="menu-text">敬請期待...</span>
            </div>
            <div class="menu-item" data-page="author-biography">
                <span class="menu-number">9</span>
                <span class="menu-text">名人列傳</span>
            </div>
            <div class="menu-item" data-page="poem-data">
                <span class="menu-number">10</span>
                <span class="menu-text">詩詞資料集</span>
            </div>
            <div class="menu-item" data-page="fullscreen">
                <span class="menu-number">11</span>
                <span class="menu-text">全螢幕切換</span>
            </div>
        `;

        // 創建遮罩層
        const menuOverlay = document.createElement('div');
        menuOverlay.id = 'menuOverlay';
        menuOverlay.className = 'menu-overlay';

        // 插入到 body 的最前面
        document.body.insertBefore(hamburgerBtn, document.body.firstChild);
        document.body.insertBefore(menuPanel, document.body.firstChild);
        document.body.insertBefore(menuOverlay, document.body.firstChild);
    }

    /**
     * 核心管理器：關閉目前畫面上所有活動中的 Overlay、遊戲與對話框
     * 確保各個功能不會重疊顯示
     */
    function closeAllActiveOverlays() {
        console.log('[Menu] 正在執行全域清理...');
        try {
            // 1. 關閉難度選擇器
            if (window.DifficultySelector && typeof window.DifficultySelector.hide === 'function') {
                console.log('[Menu] 關閉難度選擇器');
                window.DifficultySelector.hide();
            }

            // 2. 關閉詩詞詳情對話框
            if (window.PoemDialog && typeof window.PoemDialog.close === 'function') {
                console.log('[Menu] 關閉詩詞詳情');
                window.PoemDialog.close();
            }

            // 3. 停止所有正在運作的遊戲
            ['Game1', 'Game2', 'Game3', 'Game4'].forEach(gameName => {
                if (window[gameName] && typeof window[gameName].stopGame === 'function') {
                    console.log(`[Menu] 停止 ${gameName}`);
                    window[gameName].stopGame();
                }
            });

            // 4. 隱藏名人列傳
            if (window.AuthorBio && typeof window.AuthorBio.hide === 'function') {
                console.log('[Menu] 隱藏名人列傳');
                window.AuthorBio.hide();
            }

            // 5. 確保主頁日曆或卡片容器被隱藏，避免遮擋遊戲或對話框
            // 之後由具體的切換邏輯或遊戲 show() 決定何時顯示
            const cardContainer = document.getElementById('cardContainer') || document.getElementById('calendarCardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 6. 重置 body 狀態
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            console.log('[Menu] 全域清理完成');
        } catch (err) {
            console.error('[Menu] 全域清理發生錯誤:', err);
        }
    }

    function setupMenuEvents() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const menuPanel = document.getElementById('menuPanel');
        const menuOverlay = document.getElementById('menuOverlay');
        const menuItems = document.querySelectorAll('.menu-item');

        function toggleMenu() {
            const isActive = menuPanel.classList.toggle('active');
            hamburgerBtn.classList.toggle('active');
            menuOverlay.classList.toggle('active');
            document.body.style.overflow = isActive ? 'hidden' : '';
        }

        function closeMenu() {
            menuPanel.classList.remove('active');
            hamburgerBtn.classList.remove('active');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        function switchPage(pageName) {
            console.log(`[Menu] 嘗試切換頁面: ${pageName}`);
            closeMenu();

            // 關閉所有覆蓋層 (例外情況：如果未來有需要共存的頁面)
            closeAllActiveOverlays();

            try {
                switch (pageName) {
                    case 'calendar':
                        console.log('[Menu] 切換至日曆');
                        const isCalendar = window.location.pathname.includes('calendar.html') || window.location.pathname.endsWith('/') || window.location.pathname.includes('index.html');
                        if (isCalendar) {
                            console.log('[Menu] 已經在主頁面，恢復顯示日曆');
                            const container = document.getElementById('calendarCardContainer') || document.getElementById('cardContainer');
                            if (container) container.style.display = '';
                        } else {
                            window.location.href = 'index.html';
                        }
                        break;
                    case 'cards':
                        console.log('[Menu] 切換至卡片');
                        if (window.location.pathname.includes('cards.html')) {
                            console.log('[Menu] 已經在卡片頁面，恢復顯示');
                            const container = document.getElementById('cardContainer') || document.getElementById('calendarCardContainer');
                            if (container) container.style.display = '';
                        } else {
                            window.location.href = 'cards.html';
                        }
                        break;
                    case 'game1':
                        console.log('[Menu] 開啟 慢思快選');
                        if (window.Game1) {
                            window.Game1.show();
                        } else {
                            console.log('[Menu] 跳轉至主頁開啟 Game 1');
                            window.location.href = 'index.html?game=1';
                        }
                        break;
                    case 'game2':
                        console.log('[Menu] 開啟 飛花令');
                        if (window.Game2) window.Game2.show();
                        else window.location.href = 'index.html?game=2';
                        break;
                    case 'game3':
                        console.log('[Menu] 開啟 字爬梯');
                        if (window.Game3) window.Game3.show();
                        else window.location.href = 'index.html?game=3';
                        break;
                    case 'game4':
                        console.log('[Menu] 開啟 眾裡尋他千百度');
                        if (window.Game4) window.Game4.show();
                        else window.location.href = 'index.html?game=4';
                        break;
                    case 'author-biography':
                        console.log('[Menu] 開啟 名人列傳');
                        if (window.AuthorBio) window.AuthorBio.show();
                        else {
                            window.location.href = 'index.html?page=author-bio';
                        }
                        break;
                    case 'poem-data':
                        console.log('[Menu] 開啟 詩詞資料集彈窗');
                        if (window.PoemDialog) {
                            // 隨機開啟一首詩，模擬進入資料集
                            const randomIdx = Math.floor(Math.random() * (window.POEMS ? window.POEMS.length : 1));
                            window.PoemDialog.openByIndex(randomIdx);
                        } else {
                            console.error('[Menu] PoemDialog 未載入');
                        }
                        break;
                    case 'fullscreen':
                        console.log('[Menu] 切換全螢幕');
                        toggleFullscreen();
                        break;
                    default:
                        console.warn('[Menu] 未知的頁面名稱:', pageName);
                }
            } catch (err) {
                console.error('[Menu] 切換頁面發生錯誤:', err);
            }
        }

        function toggleFullscreen() {
            const docEl = document.documentElement;
            const requestFS = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
            const exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

            if (!fsElement) {
                if (requestFS) {
                    requestFS.call(docEl).catch(err => {
                        console.error(`全螢幕嘗試失敗: ${err.message}`);
                    });
                } else {
                    alert("iPhone Safari 目前僅限制影片可全螢幕。建議點選「分享」並選擇「加入主畫面」將此網頁存為 App 獲得類全螢幕體驗。");
                }
            } else {
                if (exitFS) exitFS.call(document);
            }
        }

        hamburgerBtn.addEventListener('click', toggleMenu);
        menuOverlay.addEventListener('click', closeMenu);

        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                if (item.classList.contains('menu-item-disabled')) return;
                const pageName = item.getAttribute('data-page');
                switchPage(pageName);
            });
        });
    }

    // 暴露全域函數供外部（如頁面中的連結）呼叫
    window.MenuManager = {
        closeAll: closeAllActiveOverlays
    };

})();
