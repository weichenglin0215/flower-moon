// ========================================
// 漢堡選單統一管理模組
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
            <div class="menu-item menu-item-disabled" data-page="coming-soon-6">
                <span class="menu-number">6</span>
                <span class="menu-text">敬請期待...</span>
            </div>
            <div class="menu-item menu-item-disabled" data-page="coming-soon-7">
                <span class="menu-number">7</span>
                <span class="menu-text">敬請期待...</span>
            </div>
            <div class="menu-item menu-item-disabled" data-page="coming-soon-8">
                <span class="menu-number">8</span>
                <span class="menu-text">敬請期待...</span>
            </div>
            <div class="menu-item menu-item-disabled" data-page="coming-soon-9">
                <span class="menu-number">9</span>
                <span class="menu-text">敬請期待...</span>
            </div>
            <div class="menu-item" data-page="poem-data">
                <span class="menu-number">10</span>
                <span class="menu-text">詩詞資料</span>
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

        const poemOverlay = document.createElement('div');
        poemOverlay.id = 'poemOverlay';
        poemOverlay.className = 'poem-overlay';
        poemOverlay.innerHTML = `
            <div class="poem-dialog" role="dialog" aria-modal="true">
                <div class="poem-dialog-header">
                    <button class="nav-btn" id="poemPrevBtn">上一首</button>
                    <button class="nav-btn" id="poemRandomBtn">隨機</button>
                    <button class="nav-btn" id="poemNextBtn">下一首</button>
                    <button class="nav-btn close-btn" id="poemCloseBtn">關閉</button>
                </div>
                <div class="poem-dialog-body">
                    <div class="poem-type" id="dlgType"></div>
                    <h1 class="poem-title" id="dlgTitle"></h1>
                    <div class="poem-meta"><span id="dlgDynasty"></span> <span id="dlgAuthor"></span></div>
                    <div class="poem-content" id="dlgContent"></div>
                    <div class="section-title">總評</div>
                    <div id="dlgReview"></div>
                    <div class="section-title">佳句賞析</div>
                    <div class="famous-lines" id="dlgFamous"></div>
                    <div class="section-title">注音說明</div>
                    <div id="dlgZhuyin"></div>
                    <div class="section-title">作者略傳</div>
                    <p class="placeholder-text">（暫不實作）</p>
                </div>
            </div>`;

        document.body.appendChild(poemOverlay);
    }

    function setupMenuEvents() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const menuPanel = document.getElementById('menuPanel');
        const menuOverlay = document.getElementById('menuOverlay');
        const menuItems = document.querySelectorAll('.menu-item');

        // 切換選單
        function toggleMenu() {
            const isActive = menuPanel.classList.toggle('active');
            hamburgerBtn.classList.toggle('active');
            menuOverlay.classList.toggle('active');
            document.body.style.overflow = isActive ? 'hidden' : '';
        }

        // 關閉選單
        function closeMenu() {
            menuPanel.classList.remove('active');
            hamburgerBtn.classList.remove('active');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        // 頁面切換
        let currentPoemIndex = 0;

        function openPoemDialogByIndex(index) {
            if (typeof POEMS === 'undefined' || !POEMS.length) return;
            currentPoemIndex = (index + POEMS.length) % POEMS.length;
            const poem = POEMS[currentPoemIndex];
            document.getElementById('dlgType').textContent = poem.type || '詩詞';
            document.getElementById('dlgTitle').textContent = poem.title || '無題';
            document.getElementById('dlgDynasty').textContent = poem.dynasty || '';
            document.getElementById('dlgAuthor').textContent = poem.author || '佚名';
            const contentDiv = document.getElementById('dlgContent');
            contentDiv.innerHTML = '';
            if (poem.content && Array.isArray(poem.content)) {
                poem.content.forEach(line => {
                    const div = document.createElement('div');
                    div.className = 'poem-line';
                    div.textContent = line;
                    contentDiv.appendChild(div);
                });
            }

            // Review
            const reviewDiv = document.getElementById('dlgReview');
            if (poem.rating) {
                reviewDiv.textContent = poem.rating;
                reviewDiv.className = '';
                reviewDiv.style.color = '#333';
            } else {
                reviewDiv.className = 'placeholder-text';
                reviewDiv.textContent = '（暫無總評）';
            }

            const famousDiv = document.getElementById('dlgFamous');
            famousDiv.innerHTML = '';
            let hasFamous = false;
            if (poem.content && poem.line_ratings) {
                poem.content.forEach((line, i) => {
                    if (poem.line_ratings[i] >= 3) {
                        const d = document.createElement('div');
                        d.className = 'famous-line-item';
                        d.textContent = line;
                        famousDiv.appendChild(d);
                        hasFamous = true;
                    }
                });
            }
            if (!hasFamous) {
                famousDiv.innerHTML = '<p class="placeholder-text">此詩尚無評分較高的佳句。</p>';
            }

            // Zhuyin
            const zhuyinDiv = document.getElementById('dlgZhuyin');
            if (poem.zhuyin) {
                zhuyinDiv.textContent = poem.zhuyin;
                zhuyinDiv.style.color = '#333';
            } else {
                zhuyinDiv.innerHTML = '<p class="placeholder-text">（暫無注音）</p>';
            }

            document.getElementById('poemOverlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function openPoemDialogById(id) {
            if (typeof POEMS === 'undefined' || !POEMS.length) return;
            const idx = POEMS.findIndex(p => p.id == id);
            if (idx !== -1) openPoemDialogByIndex(idx);
        }

        function closePoemDialog() {
            document.getElementById('poemOverlay').classList.remove('active');
            document.body.style.overflow = '';
        }

        function switchPage(pageName) {
            closeMenu();

            // 根據選擇的頁面跳轉或執行操作
            switch (pageName) {
                case 'calendar':
                    if (window.location.pathname.includes('index.html') ||
                        window.location.pathname.endsWith('/') ||
                        window.location.pathname.endsWith('/FlowerMoon_web') ||
                        window.location.pathname.endsWith('/FlowerMoon_web/')) {
                        // 已經在日曆頁面
                        console.log('已在日曆頁面');
                    } else {
                        window.location.href = 'index.html';
                    }
                    break;
                case 'cards':
                    if (window.location.pathname.includes('cards.html')) {
                        // 已經在卡片頁面
                        console.log('已在卡片頁面');
                    } else {
                        window.location.href = 'cards.html';
                    }
                    break;
                case 'game1':
                    if (window.Game1) {
                        window.Game1.show();
                    } else {
                        window.location.href = 'index.html?game=1';
                    }
                    break;
                case 'game2':
                    console.log('切換到飛花令頁面 - 待實作');
                    // TODO: window.location.href = 'game2.html';
                    break;
                case 'game3':
                    if (window.Game3) {
                        window.Game3.show();
                    } else {
                        // 如果在其他頁面且沒有載入 Game3，則跳轉到首頁並帶參數
                        window.location.href = 'index.html?game=3';
                    }
                    break;
                case 'coming-soon-6':
                case 'coming-soon-7':
                case 'coming-soon-8':
                case 'coming-soon-9':
                    console.log('此功能敬請期待...');
                    break;
                case 'poem-data':
                    if (typeof POEMS !== 'undefined' && POEMS.length) {
                        const start = Math.floor(Math.random() * POEMS.length);
                        openPoemDialogByIndex(start);
                    }
                    break;
            }
        }

        // 事件監聽器
        hamburgerBtn.addEventListener('click', toggleMenu);
        menuOverlay.addEventListener('click', closeMenu);

        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                // 如果是禁用的項目，不執行切換
                if (item.classList.contains('menu-item-disabled')) {
                    return;
                }
                const pageName = item.getAttribute('data-page');
                switchPage(pageName);
            });
        });

        document.getElementById('poemCloseBtn').addEventListener('click', closePoemDialog);
        document.getElementById('poemPrevBtn').addEventListener('click', () => {
            if (typeof POEMS === 'undefined' || !POEMS.length) return;
            openPoemDialogByIndex(currentPoemIndex - 1);
        });
        document.getElementById('poemNextBtn').addEventListener('click', () => {
            if (typeof POEMS === 'undefined' || !POEMS.length) return;
            openPoemDialogByIndex(currentPoemIndex + 1);
        });
        document.getElementById('poemRandomBtn').addEventListener('click', () => {
            if (typeof POEMS === 'undefined' || !POEMS.length) return;
            let idx;
            do { idx = Math.floor(Math.random() * POEMS.length); } while (idx === currentPoemIndex && POEMS.length > 1);
            openPoemDialogByIndex(idx);
        });

        document.getElementById('poemOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'poemOverlay') closePoemDialog();
        });

        document.addEventListener('click', (e) => {
            const t = e.target;
            if (t.classList && (t.classList.contains('poem-title') || t.classList.contains('poem-author'))) {
                const id = t.getAttribute('data-poem-id');
                if (id) openPoemDialogById(id);
            }
        });
    }
})();
