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
        { page: 'game4', label: '眾裡尋他', image: 'images/Menu/眾裡尋他千百度_Menu256.jpg' },
        { page: 'game13', label: '人事時地', image: 'images/Menu/人事時地_Menu256.jpg' },
        { page: 'game20', label: '丟三落一', image: 'images/Menu/丟三落一_Menu256.jpg' },
        { page: 'game36', label: '轉輪覓詩', image: 'images/Menu/轉輪覓詩_Menu256.jpg' },
        { page: 'game21', label: '橫批成詩', image: 'images/Menu/橫批成詩_Menu256.jpg' },
        { page: 'game22', label: '詩詞拼圖', image: 'images/Menu/詩詞拼圖_Menu256.jpg' },
        { page: 'game23', label: '縱橫集句', image: 'images/Menu/縱橫集句_Menu256.jpg' },
        { page: 'game8', label: '一筆裁詩', image: 'images/Menu/一筆裁詩_Menu256.jpg' },
        { page: 'game9', label: '詩韻鎖扣', image: 'images/Menu/詩韻鎖扣_Menu256.jpg' },
        { page: 'game11', label: '翻墨識蹤', image: 'images/Menu/翻墨識蹤_Menu256.jpg' },
        { page: 'game12', label: '疏影橫斜', image: 'images/Menu/疏影橫斜_Menu256.jpg' },
        { page: 'game3', label: '字爬梯', image: 'images/Menu/字爬梯_Menu256.jpg' },
        { page: 'game14', label: '步步驚心', image: 'images/Menu/步步驚心_Menu256.jpg' },
        { page: 'game5', label: '詩詞精靈', image: 'images/Menu/詩詞小精靈_Menu256.jpg' },
        { page: 'game6', label: '詩陣侵略', image: 'images/Menu/詩陣侵略_Menu256.jpg' },
        { page: 'game19', label: '詩碟狂襲', image: 'images/Menu/詩碟狂襲_Menu256.jpg' },
        { page: 'game10', label: '擊石鳴詩', image: 'images/Menu/擊石鳴詩_Menu256.jpg' },
        { page: 'game7', label: '青鳥雲梯', image: 'images/Menu/青鳥雲梯_Menu256.jpg' },
        { page: 'game15', label: '墨韻游龍', image: 'images/Menu/墨韻游龍_Menu256.jpg' },
        { page: 'game16', label: '打地詩', image: 'images/Menu/打地詩_Menu256.jpg' },
        { page: 'game17', label: '青蛙過河', image: 'images/Menu/青蛙過河_Menu256.jpg' },
        { page: 'game24', label: '三字成珠', image: 'images/Menu/三字成珠_Menu256.jpg' },
        { page: 'game25', label: '連珠拾字', image: 'images/Menu/連珠拾字_Menu256.jpg' },
        { page: 'game26', label: '投珠破句', image: 'images/Menu/投珠破句_Menu256.jpg' },
        { page: 'game27', label: '詩磚壘塔', image: 'images/Menu/詩磚壘塔_Menu256.jpg' },
        { page: 'game28', label: '兩心相印', image: 'images/Menu/兩心相印_Menu256.jpg' },
        { page: 'game29', label: '字龍盤環', image: 'images/Menu/字龍盤環_Menu256.jpg' },
        { page: 'game30', label: '層巒疊翠', image: 'images/Menu/層巒疊翠_Menu256.jpg' },
        { page: 'game31', label: '詩眼覓蹤', image: 'images/Menu/詩眼覓蹤_Menu256.jpg' },
        { page: 'game32', label: '尋詩地圖', image: 'images/Menu/尋詩地圖_Menu256.jpg' },
        { page: 'game33', label: '作者是誰', image: 'images/Menu/作者是誰_Menu256.jpg' },
        { page: 'game34', label: '猜猜詩題', image: 'images/Menu/猜猜詩題_Menu256.jpg' },
        { page: 'game35', label: '詩人心情', image: 'images/Menu/詩人心情_Menu256.jpg' },
        { page: 'achievements', label: '成就紀錄', image: 'images/Menu/成就與紀錄_Menu256.jpg' },
        { page: 'leaderboard', label: '群英榜', image: 'images/Menu/群英榜_Menu256.jpg' },
        { page: 'collection', label: '江南小院', image: 'images/Menu/江南小院_Menu256.jpg' },
        { page: 'author-biography', label: '名人列傳', image: 'images/Menu/名人列傳_Menu256.jpg' },
        { page: 'wordcloud', label: '文字雲', image: 'images/Menu/文字雲_Menu256.jpg' },
        { page: 'zhexianren', label: '詩詞珠簾', image: 'images/Menu/詩詞珠簾_Menu256.jpg' },
        { page: 'poem-data', label: '詩詞資料', image: 'images/Menu/詩詞資料集_Menu256.jpg' },
        { page: 'about', label: '關於花月', image: 'images/Menu/關於花月_Menu256.jpg' },
        { page: 'qrcode', label: 'QR Code', image: 'images/Menu/花月QRCode_Menu256.jpg' },
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
                imgWrapper.title = item.page;
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
                imgWrapper.title = item.page;
                cell.appendChild(imgWrapper);
            }

            // 遊戲頁面：在圖片下方插入過關次數進度條
            if (/^game\d+$/.test(item.page)) {
                const barWrap = document.createElement('div');
                barWrap.className = 'menu-playcount-wrap';
                const bar = document.createElement('div');
                bar.className = 'menu-playcount-bar';
                barWrap.appendChild(bar);
                cell.appendChild(barWrap);
            }

            const label = document.createElement('span');
            label.className = 'menu-item-label';
            label.textContent = item.label;
            cell.appendChild(label);

            grid.appendChild(cell);
        });

        menuPanel.appendChild(grid);
        // 初始化進度條數值
        updateMenuProgressBars();

        // 遮罩層
        const menuOverlay = document.createElement('div');
        menuOverlay.id = 'menuOverlay';
        menuOverlay.className = 'menu-overlay';

        // 遮罩層直接插入 body (滿版不需縮放)
        document.body.appendChild(menuOverlay);

        // 建立 menuWrapper 讓選單與按鈕與 stage 等比縮放且永遠在最上層
        const menuWrapper = document.createElement('div');
        menuWrapper.id = 'menuWrapper';
        menuWrapper.style.position = 'fixed';
        menuWrapper.style.zIndex = '30000';
        menuWrapper.style.pointerEvents = 'none'; // 讓點擊穿透到下方的遊戲

        // 恢復選單元件本身的點擊能力
        hamburgerBtn.style.pointerEvents = 'auto';
        menuPanel.style.pointerEvents = 'auto';

        menuWrapper.appendChild(menuPanel);
        menuWrapper.appendChild(hamburgerBtn);
        document.body.appendChild(menuWrapper);

        // 跟隨 stage 的縮放座標
        if (window.registerOverlayResize) {
            window.registerOverlayResize((r) => {
                menuWrapper.style.left = r.left + 'px';
                menuWrapper.style.top = r.top + 'px';
                menuWrapper.style.width = '500px';
                menuWrapper.style.height = '850px';
                menuWrapper.style.transform = 'scale(' + r.scale + ')';
                menuWrapper.style.transformOrigin = 'top left';
            });
        }
    }

    // ----------------------------------------
    // 更新選單內各遊戲的過關次數進度條
    // 顏色與進度依過關次數分段：
    //   0-20次 綠色（100%=20）
    //   21-50次 藍色（100%=50）
    //   51-100次 紅色（100%=100）
    //   101-200次 紫色（100%=200）
    //   201-300次 金黃色（100%=300）
    // ----------------------------------------
    function updateMenuProgressBars() {
        const gamesData = window.ScoreManager
            ? (window.ScoreManager.loadPlayerData().games || {})
            : {};

        document.querySelectorAll('.menu-item[data-page]').forEach(cell => {
            const page = cell.getAttribute('data-page');
            if (!/^game\d+$/.test(page)) return;
            const bar = cell.querySelector('.menu-playcount-bar');
            if (!bar) return;

            const count = (gamesData[page] && gamesData[page].playCount) || 0;

            let color, maxCount;
            if (count <= 20) {
                // 綠色（≤20次）
                color = 'linear-gradient(135deg, hsl(100, 50%, 40%) 0%, hsl(120, 60%, 60%) 100%)';
                maxCount = 20;
            } else if (count <= 50) {
                // 藍色（21-50次）
                color = 'linear-gradient(135deg, hsl(200, 60%, 50%) 0%, hsl(200, 66%, 70%) 100%)';
                maxCount = 50;
            } else if (count <= 100) {
                // 紅色（51-100次）
                color = 'linear-gradient(135deg, hsl(0, 60%, 50%) 0%, hsl(0, 66%, 70%) 100%)';
                maxCount = 100;
            } else if (count <= 200) {
                // 紫色（101-200次）
                color = 'linear-gradient(135deg, hsl(290, 60%, 50%) 0%, hsl(270, 66%, 70%) 100%)';
                maxCount = 200;
            } else {
                // 金黃色（201-300次）
                color = 'linear-gradient(135deg, hsl(50, 80%, 50%) 0%, hsl(60, 80%, 70%) 100%)';
                maxCount = 300;
            }

            const widthPct = Math.min(100, Math.round((count / maxCount) * 100));
            bar.style.width = widthPct + '%';
            bar.style.background = count > 0 ? color : 'transparent';
            bar.title = `過關 ${count} 次`;
        });
    }

    // 暴露讓外部可重整（例如過關動畫結束後更新）
    window.MenuProgressBarsUpdate = updateMenuProgressBars;

    // ----------------------------------------
    // 更新「成就紀錄」圖示右上角提示
    //  - 有未領取的獎狀 或 有資格參加考試 → 顯示黃底紅色驚嘆號
    // ----------------------------------------
    function updateAchievementBadge() {
        const cell = document.querySelector('.menu-item[data-page="achievements"]');
        if (!cell) return;
        const wrap = cell.querySelector('.menu-item-img-wrap');
        if (!wrap) return;

        let hasAlert = false;
        try {
            const data = (window.ScoreManager && window.ScoreManager.loadPlayerData()) || null;
            const coll = (window.FMCollectionSave && window.FMCollectionSave.load()) || null;
            if (data && coll) {
                const claimed = (data.achievements && data.achievements.claimed) || [];
                const passed = (coll.ranks && coll.ranks.passed) || [];
                const totalScore = Math.floor(data.totalScore || 0);
                const examNames = (window.ScoreManager && window.ScoreManager.EXAM_RANK_NAMES) || [];

                // (a) 有通過考試但未領獎狀
                for (const name of examNames) {
                    if (passed.indexOf(name) >= 0 && claimed.indexOf('rank_' + name) < 0) { hasAlert = true; break; }
                }
                // (b) 有資格參加考試（積分達標且尚未通過）
                if (!hasAlert && window.ScoreManager) {
                    for (const name of examNames) {
                        const r = window.ScoreManager.ranks.find(x => x.name === name);
                        if (!r) continue;
                        if (totalScore >= r.minScore && passed.indexOf(name) < 0) { hasAlert = true; break; }
                    }
                }
                // (c) 其他一般成就（次數、階級）尚未領取
                if (!hasAlert && window.ScoreManager) {
                    const ranks = window.ScoreManager.ranks;
                    for (const r of ranks) {
                        if (examNames.indexOf(r.name) >= 0) continue;
                        if (r.name === '書僮') continue;
                        if (totalScore >= r.minScore && !claimed.includes('rank_' + r.name)) { hasAlert = true; break; }
                    }
                }
            }
        } catch (e) { /* ignore */ }

        wrap.classList.toggle('menu-item-alert', hasAlert);
    }
    window.MenuAchievementBadgeUpdate = updateAchievementBadge;
    // 首次計算（等 ScoreManager 初始化後）
    setTimeout(updateAchievementBadge, 500);

    // ----------------------------------------
    // 核心管理器：關閉所有活動中的覆蓋層
    // ----------------------------------------
    function closeAllActiveOverlays() {
        console.log('[Menu] 正在執行全域清理...');

        ['Game1', 'Game2', 'Game3', 'Game4', 'Game5', 'Game6', 'Game7', 'Game8', 'Game9', 'Game10', 'Game11', 'Game12', 'Game13', 'Game14', 'Game15', 'Game16', 'Game17', 'Game19', 'Game20', 'Game21', 'Game22', 'Game23', 'Game24', 'Game25', 'Game26', 'Game27', 'Game28', 'Game29', 'Game30', 'Game31', 'Game32', 'Game33', 'Game34', 'Game35', 'Game36'].forEach(gameName => {
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
            if (window.WordCloud && typeof window.WordCloud.stopGame === 'function') {
                window.WordCloud.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏文字雲失敗', e); }

        try {
            if (window.ZheXianRen && typeof window.ZheXianRen.stopGame === 'function') {
                window.ZheXianRen.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏謫仙人失敗', e); }

        // 資料瀏覽類頁面群組（成就/群英榜/江南小院/名人列傳/文字雲）：同時只開一個
        try {
            if (window.LeaderboardDialog && typeof window.LeaderboardDialog.hide === 'function') {
                window.LeaderboardDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏群英榜失敗', e); }

        try {
            if (window.CollectionDialog && typeof window.CollectionDialog.hide === 'function') {
                window.CollectionDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏江南小院失敗', e); }

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
            if (window.LevelSelector && typeof window.LevelSelector.hide === 'function') {
                window.LevelSelector.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉關卡選擇器失敗', e); }

        try {
            if (window.GameMessage && typeof window.GameMessage.hide === 'function') {
                window.GameMessage.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉遊戲訊息視窗失敗', e); }

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
            if (isActive) {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                // 打開選單時刷新各遊戲的過關次數進度條 & 成就提示
                updateMenuProgressBars();
                updateAchievementBadge();
            } else if (!isActive && window.SoundManager) {
                window.SoundManager.playCloseItem();
            }
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

            // 這些頁面只是覆蓋在現有遊戲/日曆/卡片上，不可摧毀底下狀態
            const SKIP_CLEANUP_PAGES = ['about', 'poem-data', 'fullscreen', 'qrcode',
                'achievements', 'leaderboard', 'collection', 'author-biography'];
            if (!SKIP_CLEANUP_PAGES.includes(pageName)) {
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
                    case 'game13':
                        if (window.Game13) window.Game13.show();
                        else window.location.href = 'index.html?game=13';
                        break;
                    case 'game14':
                        if (window.Game14) window.Game14.show();
                        else window.location.href = 'index.html?game=14';
                        break;
                    case 'game15':
                        if (window.Game15) window.Game15.show();
                        else window.location.href = 'index.html?game=15';
                        break;
                    case 'game16':
                        if (window.Game16) window.Game16.show();
                        else window.location.href = 'index.html?game=16';
                        break;
                    case 'game17':
                        if (window.Game17) window.Game17.show();
                        else window.location.href = 'index.html?game=17';
                        break;
                    case 'game19':
                        if (window.Game19) window.Game19.show();
                        else window.location.href = 'index.html?game=19';
                        break;
                    case 'game20':
                        if (window.Game20) window.Game20.show();
                        else window.location.href = 'index.html?game=20';
                        break;
                    case 'game21':
                        if (window.Game21) window.Game21.show();
                        else window.location.href = 'index.html?game=21';
                        break;
                    case 'game22':
                        if (window.Game22) window.Game22.show();
                        else window.location.href = 'index.html?game=22';
                        break;
                    case 'game23':
                        if (window.Game23) window.Game23.show();
                        else window.location.href = 'index.html?game=23';
                        break;
                    case 'game24':
                        if (window.Game24) window.Game24.show();
                        else window.location.href = 'index.html?game=24';
                        break;
                    case 'game25':
                        if (window.Game25) window.Game25.show();
                        else window.location.href = 'index.html?game=25';
                        break;
                    case 'game26':
                        if (window.Game26) window.Game26.show();
                        else window.location.href = 'index.html?game=26';
                        break;
                    case 'game27':
                        if (window.Game27) window.Game27.show();
                        else window.location.href = 'index.html?game=27';
                        break;
                    case 'game28':
                        if (window.Game28) window.Game28.show();
                        else window.location.href = 'index.html?game=28';
                        break;
                    case 'game29':
                        if (window.Game29) window.Game29.show();
                        else window.location.href = 'index.html?game=29';
                        break;
                    case 'game30':
                        if (window.Game30) window.Game30.show();
                        else window.location.href = 'index.html?game=30';
                        break;
                    case 'game31':
                        if (window.Game31) window.Game31.show();
                        else window.location.href = 'index.html?game=31';
                        break;
                    case 'game32':
                        if (window.Game32) window.Game32.show();
                        else window.location.href = 'index.html?game=32';
                        break;
                    case 'game33':
                        if (window.Game33) window.Game33.show();
                        else window.location.href = 'index.html?game=33';
                        break;
                    case 'game34':
                        if (window.Game34) window.Game34.show();
                        else window.location.href = 'index.html?game=34';
                        break;
                    case 'game35':
                        if (window.Game35) window.Game35.show();
                        else window.location.href = 'index.html?game=35';
                        break;
                    case 'game36':
                        if (window.Game36) window.Game36.show();
                        else window.location.href = 'index.html?game=36';
                        break;
                    case 'author-biography':
                        if (window.AuthorBio) window.AuthorBio.show();
                        else window.location.href = 'index.html?page=author-bio';
                        break;
                    case 'wordcloud':
                        if (window.WordCloud) window.WordCloud.show();
                        else window.location.href = 'index.html?page=wordcloud';
                        break;
                    case 'zhexianren':
                        if (window.ZheXianRen) window.ZheXianRen.show();
                        else window.location.href = 'index.html?page=zhexianren';
                        break;
                    case 'achievements':
                        if (window.AchievementDialog) window.AchievementDialog.show();
                        else window.location.href = 'index.html?page=achievements';
                        break;
                    case 'leaderboard':
                        if (window.LeaderboardDialog) window.LeaderboardDialog.show();
                        else console.warn('[Menu] LeaderboardDialog 未載入');
                        break;
                    case 'collection':
                        if (window.CollectionDialog) window.CollectionDialog.show();
                        else console.warn('[Menu] CollectionDialog 未載入');
                        break;
                    case 'about':
                        if (window.IntroCard) window.IntroCard.show();
                        break;
                    case 'qrcode':
                        if (window.QRDialog) window.QRDialog.show();
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
