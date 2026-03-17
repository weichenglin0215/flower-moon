// ========================================
// 漢堡選單與全域流程管理模組
// ========================================

(function () {
    'use strict';

    // ========================================
    // 選單項目清單（可自由調整順序與新增項目）
    // 每個項目格式：
    //   { page: '頁面鍵值', label: '顯示名稱', image: '圖片路徑 (可省略)' }
    // 調整順序即可改變在選單中的排列位置。
    // ========================================
    const MENU_ITEMS = [
        { page: 'calendar', label: '日曆', image: 'images/Menu/日曆_Menu256.jpg' },
        { page: 'cards', label: '默背卡片', image: 'images/Menu/默背_Menu256.jpg' },
        { page: 'game1', label: '慢思快選', image: 'images/Menu/慢思快選_Menu256.jpg' },
        { page: 'game2', label: '飛花令', image: 'images/Menu/飛花令_Menu256.jpg' },
        { page: 'game3', label: '字爬梯', image: 'images/Menu/字爬梯_Menu256.jpg' },
        { page: 'game4', label: '眾裡尋他', image: 'images/Menu/眾裡尋他千百度_Menu256.jpg' },
        { page: 'game5', label: '詩詞精靈', image: 'images/Menu/詩詞小精靈_Menu256.jpg' },
        { page: 'game6', label: '詩陣侵略', image: 'images/Menu/詩陣侵略_Menu256.jpg' },
        { page: 'game7', label: '青鳥雲梯', image: 'images/Menu/青鳥雲梯_Menu256.jpg' },
        { page: 'game8', label: '一筆裁詩', image: 'images/Menu/一筆裁詩_Menu256.jpg' },
        { page: 'game9', label: '詩韻鎖扣', image: 'images/Menu/詩韻鎖扣_Menu256.jpg' },
        { page: 'game10', label: '擊石鳴詩', image: 'images/Menu/擊石鳴詩_Menu256.jpg' },
        { page: 'game11', label: '翻墨識蹤', image: 'images/Menu/翻墨識蹤_Menu256.jpg' },
        { page: 'game12', label: '疏影橫斜', image: 'images/Menu/疏影橫斜_Menu256.jpg' },
        { page: 'achievements', label: '成就紀錄', image: 'images/Menu/成就與紀錄_Menu256.jpg' },
        { page: 'author-biography', label: '名人列傳', image: 'images/Menu/名人列傳_Menu256.jpg' },
        { page: 'poem-data', label: '詩詞資料', image: 'images/Menu/詩詞資料集_Menu256.jpg' },
        { page: 'about', label: '關於花月', image: 'images/Menu/關於花月_Menu256.jpg' },
        { page: 'fullscreen', label: '全螢幕', image: 'images/Menu/全螢幕_Menu256.jpg' },
    ];

    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMenu);
    } else {
        initMenu();
    }

    function initMenu() {
        createMenuHTML();
        setupMenuEvents();
    }

    // ----------------------------------------
    // 建立選單 DOM 結構
    // ----------------------------------------
    function createMenuHTML() {
        // 漢堡按鈕
        const hamburgerBtn = document.createElement('div');
        hamburgerBtn.id = 'hamburgerBtn';
        hamburgerBtn.className = 'hamburger-btn';
        hamburgerBtn.innerHTML = `
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
        `;

        // 選單面板
        const menuPanel = document.createElement('nav');
        menuPanel.id = 'menuPanel';
        menuPanel.className = 'menu-panel';

        // 格狀容器
        const grid = document.createElement('div');
        grid.className = 'menu-grid';

        MENU_ITEMS.forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'menu-item';
            cell.setAttribute('data-page', item.page);

            if (item.image) {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'menu-item-img-wrap';
                const img = document.createElement('img');
                img.src = item.image;
                img.alt = item.label;
                img.className = 'menu-item-img';
                // 圖片載入失敗時顯示佔位色塊
                img.onerror = function () {
                    imgWrapper.classList.add('menu-item-img-placeholder');
                    this.remove();
                };
                imgWrapper.appendChild(img);
                cell.appendChild(imgWrapper);
            } else {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'menu-item-img-wrap menu-item-img-placeholder';
                cell.appendChild(imgWrapper);
            }

            const label = document.createElement('span');
            label.className = 'menu-item-label';
            label.textContent = item.label;
            cell.appendChild(label);

            grid.appendChild(cell);
        });

        menuPanel.appendChild(grid);

        // 遮罩層
        const menuOverlay = document.createElement('div');
        menuOverlay.id = 'menuOverlay';
        menuOverlay.className = 'menu-overlay';

        // 插入到 body 前方
        document.body.insertBefore(hamburgerBtn, document.body.firstChild);
        document.body.insertBefore(menuPanel, document.body.firstChild);
        document.body.insertBefore(menuOverlay, document.body.firstChild);
    }

    // ----------------------------------------
    // 核心管理器：關閉所有活動中的覆蓋層
    // ----------------------------------------
    function closeAllActiveOverlays() {
        console.log('[Menu] 正在執行全域清理...');

        ['Game1', 'Game2', 'Game3', 'Game4', 'Game5', 'Game6', 'Game7', 'Game8', 'Game9', 'Game10', 'Game11', 'Game12'].forEach(gameName => {
            try {
                if (window[gameName] && typeof window[gameName].stopGame === 'function') {
                    window[gameName].stopGame();
                }
            } catch (e) { console.warn(`[Menu] 停止 ${gameName} 失敗`, e); }
        });

        try {
            if (window.AchievementDialog && typeof window.AchievementDialog.hide === 'function') {
                window.AchievementDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏成就紀錄失敗', e); }

        try {
            if (window.IntroCard && typeof window.IntroCard.hide === 'function') {
                window.IntroCard.hide();
            }
            if (window.AboutDialog && typeof window.AboutDialog.hide === 'function') {
                window.AboutDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏關於花月失敗', e); }

        try {
            if (window.AuthorBio && typeof window.AuthorBio.hide === 'function') {
                window.AuthorBio.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏名人列傳失敗', e); }

        try {
            if (window.PoemDialog && typeof window.PoemDialog.close === 'function') {
                window.PoemDialog.close();
            }
        } catch (e) { console.warn('[Menu] 關閉詩詞資料集失敗', e); }

        try {
            if (window.DifficultySelector && typeof window.DifficultySelector.hide === 'function') {
                window.DifficultySelector.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉難度選擇器失敗', e); }

        try {
            const card1 = document.getElementById('cardContainer');
            const card2 = document.getElementById('calendarCardContainer');
            if (card1) card1.style.display = 'none';
            if (card2) card2.style.display = 'none';
        } catch (e) { console.warn('[Menu] 隱藏主頁容器失敗', e); }

        try {
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        } catch (e) { console.warn('[Menu] 重置 Body 狀態失敗', e); }

        console.log('[Menu] 全域清理完成');
    }

    // ----------------------------------------
    // 設定選單事件
    // ----------------------------------------
    function setupMenuEvents() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const menuPanel = document.getElementById('menuPanel');
        const menuOverlay = document.getElementById('menuOverlay');
        const menuItems = document.querySelectorAll('.menu-item');

        function toggleMenu() {
            const isActive = menuPanel.classList.toggle('active');
            if (isActive && window.SoundManager) window.SoundManager.playOpenItem();
            else if (!isActive && window.SoundManager) window.SoundManager.playCloseItem();
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

            if (pageName !== 'about' && pageName !== 'poem-data' && pageName !== 'fullscreen') {
                closeAllActiveOverlays();
            }

            try {
                switch (pageName) {
                    case 'calendar':
                        console.log('[Menu] 切換至日曆');
                        {
                            const c1 = document.getElementById('calendarCardContainer');
                            const c2 = document.getElementById('cardContainer');
                            if (c1) {
                                c1.style.display = 'block';
                            } else {
                                window.location.href = 'index.html';
                                break;
                            }
                            if (c2) c2.style.display = 'none';
                        }
                        break;
                    case 'cards':
                        console.log('[Menu] 切換至卡片');
                        if (window.location.pathname.includes('cards.html')) {
                            window.location.href = 'index.html?page=cards';
                        } else {
                            const c1 = document.getElementById('cardContainer');
                            const c2 = document.getElementById('calendarCardContainer');
                            if (c1) c1.style.display = 'block';
                            if (c2) c2.style.display = 'none';
                        }
                        break;
                    case 'game1':
                        if (window.Game1) window.Game1.show();
                        else window.location.href = 'index.html?game=1';
                        break;
                    case 'game2':
                        if (window.Game2) window.Game2.show();
                        else window.location.href = 'index.html?game=2';
                        break;
                    case 'game3':
                        if (window.Game3) window.Game3.show();
                        else window.location.href = 'index.html?game=3';
                        break;
                    case 'game4':
                        if (window.Game4) window.Game4.show();
                        else window.location.href = 'index.html?game=4';
                        break;
                    case 'game5':
                        if (window.Game5) window.Game5.show();
                        else window.location.href = 'index.html?game=5';
                        break;
                    case 'game6':
                        if (window.Game6) window.Game6.show();
                        else window.location.href = 'index.html?game=6';
                        break;
                    case 'game7':
                        if (window.Game7) window.Game7.show();
                        else window.location.href = 'index.html?game=7';
                        break;
                    case 'game8':
                        if (window.Game8) window.Game8.show();
                        else window.location.href = 'index.html?game=8';
                        break;
                    case 'game9':
                        if (window.Game9) window.Game9.show();
                        else window.location.href = 'index.html?game=9';
                        break;
                    case 'game10':
                        if (window.Game10) window.Game10.show();
                        else window.location.href = 'index.html?game=10';
                        break;
                    case 'game11':
                        if (window.Game11) window.Game11.show();
                        else window.location.href = 'index.html?game=11';
                        break;
                    case 'game12':
                        if (window.Game12) window.Game12.show();
                        else window.location.href = 'index.html?game=12';
                        break;
                    case 'author-biography':
                        if (window.AuthorBio) window.AuthorBio.show();
                        else window.location.href = 'index.html?page=author-bio';
                        break;
                    case 'achievements':
                        if (window.AchievementDialog) window.AchievementDialog.show();
                        else window.location.href = 'index.html?page=achievements';
                        break;
                    case 'about':
                        if (window.IntroCard) window.IntroCard.show();
                        break;
                    case 'poem-data':
                        if (window.PoemDialog) {
                            const randomIdx = Math.floor(Math.random() * (window.POEMS ? window.POEMS.length : 1));
                            window.PoemDialog.openByIndex(randomIdx);
                        } else {
                            console.error('[Menu] PoemDialog 未載入');
                        }
                        break;
                    case 'fullscreen':
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
                    alert('iPhone Safari 目前僅限制影片可全螢幕。建議點選「分享」並選擇「加入主畫面」將此網頁存為 App 獲得類全螢幕體驗。');
                }
            } else {
                if (exitFS) exitFS.call(document);
            }
        }

        hamburgerBtn.addEventListener('click', toggleMenu);
        menuOverlay.addEventListener('click', closeMenu);

        // ----------------------------------------
        // 拖曳捲動支援（滑鼠 + 觸控）
        // ----------------------------------------
        let dragStartY = 0;
        let dragStartScrollTop = 0;
        let isDragging = false;
        let hasDragged = false;          // 是否真的有位移（用來區分「點擊」與「拖曳」）
        const DRAG_THRESHOLD = 5;        // 超過幾 px 才算拖曳

        // 滑鼠拖曳
        menuPanel.addEventListener('mousedown', (e) => {
            isDragging = true;
            hasDragged = false;
            dragStartY = e.clientY;
            dragStartScrollTop = menuPanel.scrollTop;
            menuPanel.style.cursor = 'grabbing';
            menuPanel.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dy = dragStartY - e.clientY;
            if (Math.abs(dy) > DRAG_THRESHOLD) hasDragged = true;
            menuPanel.scrollTop = dragStartScrollTop + dy;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            menuPanel.style.cursor = '';
            menuPanel.style.userSelect = '';
        });

        // 觸控拖曳
        menuPanel.addEventListener('touchstart', (e) => {
            hasDragged = false;
            dragStartY = e.touches[0].clientY;
            dragStartScrollTop = menuPanel.scrollTop;
        }, { passive: true });

        menuPanel.addEventListener('touchmove', (e) => {
            const dy = dragStartY - e.touches[0].clientY;
            if (Math.abs(dy) > DRAG_THRESHOLD) hasDragged = true;
            menuPanel.scrollTop = dragStartScrollTop + dy;
        }, { passive: true });

        // ----------------------------------------
        // 格子點擊（拖曳中忽略）
        // ----------------------------------------
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                if (hasDragged) return;        // 拖曳後不觸發點擊
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (item.classList.contains('menu-item-disabled')) return;
                const pageName = item.getAttribute('data-page');
                switchPage(pageName);
            });
        });
    }

    // 暴露全域函數
    window.MenuManager = {
        closeAll: closeAllActiveOverlays
    };

})();
