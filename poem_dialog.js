/**
 * 詩詞詳情彈窗組件
 * 全局共享，提供詩詞詳細內容顯示功能
 */

(function () {
    'use strict';

    const PoemDialog = {
        overlay: null,
        currentPoemIndex: 0,

        /**
         * 初始化組件
         */
        init: function () {
            if (this.overlay) return;
            this.createDOM();
            this.bindEvents();
        },

        /**
         * 創建 DOM 結構
         */
        createDOM: function () {
            const poemOverlay = document.createElement('div');
            poemOverlay.id = 'poemOverlay';
            poemOverlay.className = 'poem-overlay aspect-5-8 hidden';
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
            this.overlay = poemOverlay;
        },

        /**
         * 綁定事件
         */
        bindEvents: function () {
            document.getElementById('poemCloseBtn').addEventListener('click', () => this.close());
            document.getElementById('poemPrevBtn').addEventListener('click', () => {
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                this.openByIndex(this.currentPoemIndex - 1);
            });
            document.getElementById('poemNextBtn').addEventListener('click', () => {
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                this.openByIndex(this.currentPoemIndex + 1);
            });
            document.getElementById('poemRandomBtn').addEventListener('click', () => {
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                let idx;
                do { idx = Math.floor(Math.random() * POEMS.length); } while (idx === this.currentPoemIndex && POEMS.length > 1);
                this.openByIndex(idx);
            });

            this.overlay.addEventListener('click', (e) => {
                if (e.target.id === 'poemOverlay') this.close();
            });

            // 支持點擊頁面上的詩名或作者開啟 (全域委派)
            document.addEventListener('click', (e) => {
                const t = e.target.closest('.poem-title, .poem-author, [data-poem-id]');
                if (t) {
                    const id = t.getAttribute('data-poem-id');
                    if (id) {
                        e.preventDefault();
                        e.stopPropagation();
                        this.openById(id);
                    }
                }
            }, true); // 使用 Capture 模式確保優先處理
        },

        /**
         * 開啟彈窗 (透過 Index)
         */
        openByIndex: function (index) {
            console.log(`[PoemDialog] 嘗試開啟 Index: ${index}`);
            if (typeof POEMS === 'undefined' || !POEMS.length) {
                console.error('[PoemDialog] POEMS 資料未載入');
                return;
            }
            this.init();

            this.currentPoemIndex = (index + POEMS.length) % POEMS.length;
            const poem = POEMS[this.currentPoemIndex];
            console.log(`[PoemDialog] 顯示詩詞: ${poem.title}`);

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

            // Famous Lines
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

            this.overlay.classList.add('active');
            this.overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            document.body.classList.add('overlay-active');

            if (window.updateResponsiveLayout) window.updateResponsiveLayout();
        },

        /**
         * 開啟彈窗 (透過 ID)
         */
        openById: function (id) {
            console.log(`[PoemDialog] 嘗試開啟 ID: ${id}`);
            if (typeof POEMS === 'undefined' || !POEMS.length) {
                console.error('[PoemDialog] POEMS 資料未載入');
                return;
            }
            const idx = POEMS.findIndex(p => p.id == id);
            if (idx !== -1) {
                this.openByIndex(idx);
            } else {
                console.warn(`[PoemDialog] 找不到 ID: ${id}`);
            }
        },

        /**
         * 關閉彈窗
         */
        close: function () {
            if (!this.overlay) return;
            this.overlay.classList.remove('active');
            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');

            // 恢復主頁顯示
            const container = document.getElementById('calendarCardContainer') || document.getElementById('cardContainer');
            if (container) container.style.display = '';
        }
    };

    // 導出到全局
    window.PoemDialog = PoemDialog;

    // 兼容舊代碼的全局呼叫
    window.openPoemDialogById = (id) => PoemDialog.openById(id);
    window.openPoemDialogByIndex = (index) => PoemDialog.openByIndex(index);

    // 自動初始化以註冊全域點擊事件
    PoemDialog.init();

})();
