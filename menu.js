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
            <div class="menu-item" data-page="game5">
                <span class="menu-number">7</span>
                <span class="menu-text">詩詞小精靈</span>
            </div>
            <div class="menu-item" data-page="game6">
                <span class="menu-number">8</span>
                <span class="menu-text">詩陣侵略</span>
            </div>
            <div class="menu-item" data-page="game7">
                <span class="menu-number">9</span>
                <span class="menu-text">青鳥雲梯</span>
            </div>
            <div class="menu-item" data-page="game8">
                <span class="menu-number">10</span>
                <span class="menu-text">一筆裁詩</span>
            </div>
            <div class="menu-item" data-page="game9">
                <span class="menu-number">11</span>
                <span class="menu-text">詩韻鎖扣</span>
            </div>
            <div class="menu-item" data-page="author-biography">
                <span class="menu-number">人</span>
                <span class="menu-text">名人列傳</span>
            </div>
            <div class="menu-item" data-page="poem-data">
                <span class="menu-number">詩</span>
                <span class="menu-text">詩詞資料集</span>
            </div>
            <div class="menu-item" data-page="achievements">
                <span class="menu-number">成</span>
                <span class="menu-text">成就與紀錄</span>
            </div>
            <div class="menu-item" data-page="about">
                <span class="menu-number">?</span>
                <span class="menu-text">關於花月</span>
            </div>
            <div class="menu-item" data-page="fullscreen">
                <span class="menu-number">全</span>
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

        // 3. 停止所有正在運作的遊戲
        ['Game1', 'Game2', 'Game3', 'Game4', 'Game5', 'Game6', 'Game7', 'Game8', 'Game9'].forEach(gameName => {
            try {
                if (window[gameName] && typeof window[gameName].stopGame === 'function') {
                    window[gameName].stopGame();
                }
            } catch (e) { console.warn(`[Menu] 停止 ${gameName} 失敗`, e); }
        });

        // 4. 隱藏成就與紀錄
        try {
            if (window.AchievementDialog && typeof window.AchievementDialog.hide === 'function') {
                window.AchievementDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏成就紀錄失敗', e); }

        // 5. 隱藏關於花月 (IntroCard / AboutDialog)
        try {
            if (window.IntroCard && typeof window.IntroCard.hide === 'function') {
                window.IntroCard.hide();
            }
            if (window.AboutDialog && typeof window.AboutDialog.hide === 'function') {
                window.AboutDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏關於花月失敗', e); }

        // 6. 隱藏名人列傳
        try {
            if (window.AuthorBio && typeof window.AuthorBio.hide === 'function') {
                window.AuthorBio.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏名人列傳失敗', e); }

        // 7. 關閉詩詞資料集
        try {
            if (window.PoemDialog && typeof window.PoemDialog.close === 'function') {
                window.PoemDialog.close();
            }
        } catch (e) { console.warn('[Menu] 關閉詩詞資料集失敗', e); }

        // 8. 關閉難度選擇器
        try {
            if (window.DifficultySelector && typeof window.DifficultySelector.hide === 'function') {
                window.DifficultySelector.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉難度選擇器失敗', e); }

        // 9. 隱藏主頁日曆或卡片容器 (必須在所有遊戲 stopGame 之後執行，以免被 stopGame 再次打開)
        try {
            const card1 = document.getElementById('cardContainer');
            const card2 = document.getElementById('calendarCardContainer');
            if (card1) card1.style.display = 'none';
            if (card2) card2.style.display = 'none';
        } catch (e) { console.warn('[Menu] 隱藏主頁容器失敗', e); }

        // 8. 重置 body 狀態
        try {
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        } catch (e) { console.warn('[Menu] 重置 Body 狀態失敗', e); }

        console.log('[Menu] 全域清理完成');
    }

    function setupMenuEvents() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const menuPanel = document.getElementById('menuPanel');
        const menuOverlay = document.getElementById('menuOverlay');
        const menuItems = document.querySelectorAll('.menu-item');

        function toggleMenu() {
            const isActive = menuPanel.classList.toggle('active');
            if (isActive && window.SoundManager) window.SoundManager.playOpenItem(); //打開選單，提高音頻。
            else if (!isActive && window.SoundManager) window.SoundManager.playCloseItem(); //關閉選單，降低音頻。
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

            // 如果是關於花月 (about) 或詩詞資料集 (poem-data)，可以疊加在其他頁面之上，故不清理全域
            if (pageName !== 'about' && pageName !== 'poem-data' && pageName !== 'fullscreen') {
                // 關閉所有覆蓋層
                closeAllActiveOverlays();
            }

            try {
                switch (pageName) {
                    case 'calendar':
                        console.log('[Menu] 切換至日曆');
                        const isCalendar = window.location.pathname.includes('calendar.html') || window.location.pathname.endsWith('/') || window.location.pathname.includes('index.html');
                        if (isCalendar) {
                            console.log('[Menu] 已經在主頁面，恢復顯示日曆');
                            const c1 = document.getElementById('calendarCardContainer');
                            const c2 = document.getElementById('cardContainer');
                            if (c1) c1.style.display = 'block';
                            if (c2) c2.style.display = 'none';
                        } else {
                            window.location.href = 'index.html';
                        }
                        break;
                    case 'cards':
                        console.log('[Menu] 切換至卡片');
                        if (window.location.pathname.includes('cards.html')) {
                            // in case user is somehow on cards.html directly
                            window.location.href = 'index.html?page=cards';
                        } else {
                            const c1 = document.getElementById('cardContainer');
                            const c2 = document.getElementById('calendarCardContainer');
                            if (c1) c1.style.display = 'block';
                            if (c2) c2.style.display = 'none';
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
                    case 'game5':
                        console.log('[Menu] 開啟 詩詞小精靈');
                        if (window.Game5) window.Game5.show();
                        else window.location.href = 'index.html?game=5';
                        break;
                    case 'game6':
                        console.log('[Menu] 開啟 詩陣侵略');
                        if (window.Game6) window.Game6.show();
                        else window.location.href = 'index.html?game=6';
                        break;
                    case 'game7':
                        console.log('[Menu] 開啟 青鳥雲梯');
                        if (window.Game7) window.Game7.show();
                        else window.location.href = 'index.html?game=7';
                        break;
                    case 'game8':
                        console.log('[Menu] 開啟 一筆裁詩');
                        if (window.Game8) window.Game8.show();
                        else window.location.href = 'index.html?game=8';
                        break;
                    case 'game9':
                        console.log('[Menu] 開啟 詩韻鎖扣');
                        if (window.Game9) window.Game9.show();
                        else window.location.href = 'index.html?game=9';
                        break;
                    case 'author-biography':
                        console.log('[Menu] 開啟 名人列傳');
                        if (window.AuthorBio) window.AuthorBio.show();
                        else {
                            window.location.href = 'index.html?page=author-bio';
                        }
                        break;
                    case 'achievements':
                        console.log('[Menu] 開啟 成就與紀錄');
                        if (window.AchievementDialog) window.AchievementDialog.show();
                        else {
                            window.location.href = 'index.html?page=achievements';
                        }
                        break;
                    case 'about':
                        console.log('[Menu] 開啟 關於花月');
                        if (window.IntroCard) window.IntroCard.show();
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
                if (window.SoundManager) window.SoundManager.playConfirmItem(); //選定項目，提高音頻。
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
