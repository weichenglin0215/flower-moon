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
            // 確保 poem_dialog.css 已載入
            if (!document.getElementById('poem-dialog-css')) {
                const link = document.createElement('link');
                link.id = 'poem-dialog-css';
                link.rel = 'stylesheet';
                link.href = 'poem_dialog.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.bindEvents();
        },

        /**
         * 創建 DOM 結構
         */
        createDOM: function () {
            const poemOverlay = document.createElement('div');
            poemOverlay.id = 'poemOverlay';
            poemOverlay.className = 'pd-overlay aspect-5-8 hidden';
            poemOverlay.innerHTML = `
                <div class="pd-container" role="dialog" aria-modal="true">
                    <div class="pd-header">
                        <button class="nav-btn" id="poemPrevBtn">上首</button>
                        <button class="nav-btn" id="poemRandomBtn">隨機</button>
                        <button class="nav-btn" id="poemNextBtn">下首</button>
                        <button class="nav-btn" id="copyPoemDataBtn">複製詩文</button>
                        <button class="nav-btn" id="searchPoemBtn" style="font-size: 1.2rem; padding: 0.1rem 0.5rem;">🔍</button>
                        <button class="nav-btn close-btn" id="poemCloseBtn">關閉</button>
                    </div>
                    <div class="pd-body">
                        <div class="pd-type" id="dlgType"></div>
                        <div class="pd-title" id="dlgTitle"></div>
                        <div class="pd-meta"><span id="dlgDynasty"></span> <span id="dlgAuthor"></span></div>
                        <div class="pd-line-content" id="dlgContent"></div>
                        <div class="pd-section-title">總評價</div>
                        <div id="dlgReview"></div>
                        <div class="pd-section-title">佳句賞析 <button class="pd-copy-inline-btn" data-target="dlgFamous">複製</button></div>
                        <div class="pd-famous-lines" id="dlgFamous"></div>
                        <div class="pd-section-title">注音說明 <button class="pd-copy-inline-btn" data-target="dlgZhuyin">複製</button></div>
                        <div id="dlgZhuyin"></div>
                        <div class="pd-section-title">詩詞注釋 <button class="pd-copy-inline-btn" data-target="dlgPoemNotes">複製</button></div>
                        <div id="dlgPoemNotes"></div>
                        <div class="pd-section-title">作者生平 <button class="pd-copy-inline-btn" data-target="dlgAuthorLife">複製</button></div>
                        <div id="dlgAuthorLife"></div>
                        <div class="pd-section-title">作者小傳 <button class="pd-copy-inline-btn" data-target="dlgAuthorBio">複製</button></div>
                        <div id="dlgAuthorBio"></div>
                    </div>
                </div>`;
            document.body.appendChild(poemOverlay);
            this.overlay = poemOverlay;

            // Search Overlay
            const searchOverlay = document.createElement('div');
            searchOverlay.id = 'poemSearchOverlay';
            searchOverlay.className = 'pd-overlay pd-search-overlay hidden aspect-5-8';
            searchOverlay.innerHTML = `
                <div class="pd-container" role="dialog" aria-modal="true">
                    <div class="pd-header" style="justify-content: center; background: hsl(40, 40%, 75%); border-bottom: none;">
                        <h2 style="margin: 0; font-size: 1.5rem; color: hsl(40, 40%, 20%); letter-spacing: 0.2rem;">詩詞搜尋</h2>
                    </div>
                    <div class="pd-body pd-search-body" id="poemSearchList" style="padding: 1rem; border-top: 0.05rem solid hsl(0, 0%, 93%);">
                        <div class="pd-placeholder" style="text-align: center; margin-top: 2rem;">請輸入文字<br>搜尋作者、詩名或詩句。</div>
                    </div>
                    <div class="pd-search-footer">
                        <input type="text" id="poemSearchInput" placeholder="輸入搜尋字...">
                        <button class="nav-btn" id="doSearchBtn">搜尋</button>
                        <button class="nav-btn close-btn" id="closeSearchBtn">取消</button>
                    </div>
                </div>`;
            document.body.appendChild(searchOverlay);
            this.searchOverlay = searchOverlay;
        },

        /**
         * 綁定事件
         */
        bindEvents: function () {
            document.getElementById('poemCloseBtn').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem(); //關閉時播放低音 Do。
                this.close();
            });
            document.getElementById('poemPrevBtn').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                this.openByIndex(this.currentPoemIndex - 1);
            });
            document.getElementById('poemNextBtn').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                this.openByIndex(this.currentPoemIndex + 1);
            });
            document.getElementById('poemRandomBtn').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                let idx;
                do { idx = Math.floor(Math.random() * POEMS.length); } while (idx === this.currentPoemIndex && POEMS.length > 1);
                this.openByIndex(idx);
            });

            document.getElementById('copyPoemDataBtn').addEventListener('click', (e) => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (typeof POEMS === 'undefined' || !POEMS.length) return;
                const poem = POEMS[this.currentPoemIndex];
                let text = `${poem.title || '無題'} / ${poem.type || '詩詞'}\n${poem.dynasty || ''} / ${poem.author || '佚名'}\n\n`;
                if (poem.content && Array.isArray(poem.content)) {
                    text += poem.content.join('\n');
                }
                text += `\n\n喜歡嗎？歡迎分享給好友。\n也請推薦你鍾愛的詩詞給我。`;
                this.copyToClipboard(text, e.target);
            });

            this.overlay.querySelectorAll('.pd-copy-inline-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    const targetId = e.target.getAttribute('data-target');
                    if (!targetId) return;
                    const targetEl = document.getElementById(targetId);
                    if (targetEl) {
                        const text = targetEl.innerText;
                        this.copyToClipboard(text, e.target);
                    }
                });
            });

            // 搜尋系統事件
            document.getElementById('searchPoemBtn').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                this.searchOverlay.classList.remove('hidden');
                this.searchOverlay.classList.add('active');
                setTimeout(() => document.getElementById('poemSearchInput').focus(), 100);
            });

            document.getElementById('closeSearchBtn').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.searchOverlay.classList.add('hidden');
                this.searchOverlay.classList.remove('active');
            });

            const executeSearch = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                const keyword = document.getElementById('poemSearchInput').value.trim();
                const listContainer = document.getElementById('poemSearchList');
                listContainer.innerHTML = '';

                if (!keyword) {
                    listContainer.innerHTML = '<div class="pd-placeholder" style="text-align: center; margin-top: 2rem;">請輸入關鍵字</div>';
                    return;
                }

                let matches = [];
                for (let i = 0; i < POEMS.length; i++) {
                    const p = POEMS[i];
                    let matchedLine = null;
                    if (p.title.includes(keyword)) {
                        matchedLine = p.content && p.content.length > 0 ? p.content[0] : "（無內容）";
                    } else if (p.author && p.author.includes(keyword)) {
                        matchedLine = p.content && p.content.length > 0 ? p.content[0] : "（無內容）";
                    } else if (p.content) {
                        for (let line of p.content) {
                            if (line.includes(keyword)) {
                                matchedLine = line;
                                break;
                            }
                        }
                    }
                    if (matchedLine) {
                        matches.push({ index: i, poem: p, line: matchedLine });
                    }
                }

                if (matches.length === 0) {
                    listContainer.innerHTML = '<div class="pd-placeholder" style="text-align: center; margin-top: 2rem;">找不到相關詩詞</div>';
                    return;
                }

                matches.forEach(m => {
                    const item = document.createElement('div');
                    item.className = 'pd-search-item';
                    item.innerHTML = `
                        <div class="pd-search-item-title">${m.poem.title} <span style="font-size: 1rem; font-weight: normal; color: #555;"> - ${m.poem.author || '佚名'} - 
${m.poem.rating || ''}星</span></div>
                        <div class="pd-search-item-line">${m.line}</div>
                    `;
                    item.addEventListener('click', () => {
                        if (window.SoundManager) window.SoundManager.playConfirmItem();
                        this.searchOverlay.classList.add('hidden');
                        this.searchOverlay.classList.remove('active');
                        this.openByIndex(m.index);
                    });
                    listContainer.appendChild(item);
                });
            };

            document.getElementById('doSearchBtn').addEventListener('click', executeSearch);
            document.getElementById('poemSearchInput').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    executeSearch();
                }
            });

            this.overlay.addEventListener('click', (e) => {
                if (e.target.id === 'poemOverlay') this.close();
            });

            // 增加慣性捲動功能的通用處理函式 (支持滑鼠及觸控)
            const setupMomentumScroll = (el) => {
                if (!el) return;
                let isDown = false;
                let startY;
                let startScrollTop;
                let moved = false;
                let velocity = 0;
                let lastY = 0;
                let lastTime = 0;
                let momentumID = null;

                const startInertia = () => {
                    const friction = 0.97; // 摩擦係數，數值越大滑得越遠
                    const step = () => {
                        if (Math.abs(velocity) < 0.1) {
                            cancelAnimationFrame(momentumID);
                            return;
                        }
                        el.scrollTop -= velocity;
                        velocity *= friction;
                        momentumID = requestAnimationFrame(step);
                    };
                    momentumID = requestAnimationFrame(step);
                };

                const onStart = (e) => {
                    // 若點擊的是按鈕則不觸發拖拽
                    if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button')) return;

                    isDown = true;
                    moved = false;
                    el.style.cursor = 'grabbing';
                    const pageY = (e.type === 'touchstart') ? e.touches[0].pageY : e.pageY;
                    startY = pageY;
                    startScrollTop = el.scrollTop;
                    velocity = 0;
                    cancelAnimationFrame(momentumID);
                    lastY = pageY;
                    lastTime = Date.now();
                };

                const onMove = (e) => {
                    if (!isDown) return;
                    const pageY = (e.type === 'touchmove') ? e.touches[0].pageY : e.pageY;
                    const deltaY = pageY - startY;

                    // 位移超過一定門檻才判斷為拖曳
                    if (Math.abs(deltaY) > 5) {
                        moved = true;
                        if (e.cancelable) e.preventDefault();
                        const multiplier = (e.type === 'touchmove') ? 1.2 : 1.5;
                        el.scrollTop = startScrollTop - deltaY * multiplier;
                    }

                    const now = Date.now();
                    const dt = now - lastTime;
                    if (dt > 0) {
                        const dy = pageY - lastY;
                        velocity = dy * 0.8;
                        lastTime = now;
                        lastY = pageY;
                    }
                };

                const onEnd = () => {
                    if (!isDown) return;
                    isDown = false;
                    el.style.cursor = 'grab';
                    startInertia();

                    if (moved) {
                        // 如果有位移，攔截接下來的 click 事件以防誤觸列表項
                        const preventClick = (e) => {
                            e.stopImmediatePropagation();
                            el.removeEventListener('click', preventClick, true);
                        };
                        el.addEventListener('click', preventClick, true);
                    }
                };

                el.addEventListener('mousedown', onStart);
                el.addEventListener('touchstart', onStart, { passive: true });
                el.addEventListener('mousemove', onMove);
                el.addEventListener('touchmove', onMove, { passive: false });
                window.addEventListener('mouseup', onEnd);
                window.addEventListener('touchend', onEnd);
            };

            // 套用到主彈窗與搜尋列表
            const dialogBody = this.overlay.querySelector('.pd-body');
            const searchList = document.getElementById('poemSearchList');
            setupMomentumScroll(dialogBody);
            setupMomentumScroll(searchList);

            // 支持點擊頁面上的詩名或作者開啟 (全域委派)
            document.addEventListener('click', (e) => {
                const t = e.target.closest('.poem-title, .poem-author, [data-poem-id]');
                if (t) {
                    const id = t.getAttribute('data-poem-id');
                    if (id) {
                        if (window.SoundManager) window.SoundManager.playConfirmItem(); //中音 Do
                        e.preventDefault();
                        e.stopPropagation();
                        this.openById(id);
                    }
                }
            }, true); // 使用 Capture 模式確保優先處理
        },

        /**
         * 複製文字到剪貼簿
         */
        copyToClipboard: function (text, btnElement) {
            const originalText = btnElement.textContent;
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(text).then(() => {
                    btnElement.textContent = '已複製';
                    setTimeout(() => { btnElement.textContent = originalText; }, 2000);
                }).catch(err => {
                    console.error('Clipboard API fail:', err);
                    this.fallbackCopyTextToClipboard(text, btnElement, originalText);
                });
            } else {
                this.fallbackCopyTextToClipboard(text, btnElement, originalText);
            }
        },

        fallbackCopyTextToClipboard: function (text, btnElement, originalText) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    btnElement.textContent = '已複製';
                    setTimeout(() => { btnElement.textContent = originalText; }, 2000);
                }
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
            }
            document.body.removeChild(textArea);
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
                poem.content.forEach((line, i) => {
                    const div = document.createElement('div');
                    div.className = 'pd-line-content';
                    div.textContent = line;
                    /*詩句評價大於等於詩評價，且大於等於4，絕佳詩句 */
                    if (poem.line_ratings && poem.line_ratings[i] >= (poem.rating || 0) && poem.line_ratings[i] >= 4) {
                        div.style.fontWeight = 'bold';
                        div.style.color = 'hsla(6, 100%, 30%, 1.00)';
                    }
                    /*詩句評價大於等於詩評價-1，且大於等於於4 有些高評價的詩中也有不錯的詩句，不加粗體*/
                    else if (poem.line_ratings && poem.line_ratings[i] >= (poem.rating || 0) - 1 && poem.line_ratings[i] >= 4) {
                        div.style.color = 'hsla(6, 100%, 30%, 1.00)';
                    }
                    /*詩句評價大於等於詩評價，卻小於4 因這首詩的評價就不高了，所以不加粗*/
                    else if (poem.line_ratings && poem.line_ratings[i] >= (poem.rating || 0)) {
                        div.style.color = 'hsla(6, 100%, 30%, 1.00)';
                    }
                    contentDiv.appendChild(div);
                });
            }

            // Review (總評價)
            const reviewDiv = document.getElementById('dlgReview');
            if (poem.rating) {
                reviewDiv.innerHTML = `<span>${poem.rating}</span>`;

                let assignedDates = [];
                if (typeof CALENDAR_ASSIGNMENTS !== 'undefined') {
                    for (const [key, val] of Object.entries(CALENDAR_ASSIGNMENTS)) {
                        if (val === poem.id) {
                            assignedDates.push(key);
                        }
                    }
                }

                if (assignedDates.length > 0) {
                    const prefixSpan = document.createElement('span');
                    prefixSpan.style.fontSize = '1.0rem';
                    prefixSpan.textContent = ` （出現在日曆：`;
                    reviewDiv.appendChild(prefixSpan);

                    assignedDates.forEach((dateKey, index) => {
                        const dateText = `${dateKey.slice(0, 4)}/${dateKey.slice(4, 6)}/${dateKey.slice(6, 8)}`;
                        const dateLink = document.createElement('span');
                        dateLink.textContent = dateText;
                        dateLink.style.cursor = 'pointer';
                        dateLink.style.fontSize = '0.6rem';
                        dateLink.style.color = 'hsla(6, 100%, 30%, 1.00)';
                        dateLink.style.textDecoration = 'underline';
                        dateLink.addEventListener('click', () => {
                            if (window.SoundManager) window.SoundManager.playConfirmItem();
                            if (window.MenuManager && window.MenuManager.closeAll) {
                                window.MenuManager.closeAll();
                            } else {
                                PoemDialog.close();
                            }
                            const c1 = document.getElementById('calendarCardContainer');
                            const c2 = document.getElementById('cardContainer');
                            if (c1) c1.style.display = 'block';
                            if (c2) c2.style.display = 'none';
                            if (window.CalendarController && window.CalendarController.jumpToDate) {
                                window.CalendarController.jumpToDate(dateKey);
                            }
                        });
                        reviewDiv.appendChild(dateLink);

                        if (index < assignedDates.length - 1) {
                            const comma = document.createElement('span');
                            comma.textContent = '、';
                            comma.style.fontSize = '0.6rem';
                            reviewDiv.appendChild(comma);
                        }
                    });

                    const suffixSpan = document.createElement('span');
                    suffixSpan.textContent = `）`;
                    suffixSpan.style.fontSize = '1.0rem';
                    reviewDiv.appendChild(suffixSpan);
                } else {
                    const noDateSpan = document.createElement('span');
                    noDateSpan.textContent = '（未出現在日曆中）';
                    noDateSpan.style.fontSize = '1.0rem';
                    reviewDiv.appendChild(noDateSpan);
                }
                reviewDiv.className = '';
                reviewDiv.style.color = '#333';
            } else {
                reviewDiv.className = 'pd-placeholder';
                reviewDiv.textContent = '（暫無總評）';
            }

            // Famous Lines (佳句賞析)
            const famousDiv = document.getElementById('dlgFamous');
            famousDiv.innerHTML = '';
            let hasFamous = false;
            if (poem.content && poem.line_ratings) {
                poem.content.forEach((line, i) => {
                    if (poem.line_ratings[i] >= poem.rating) {
                        const d = document.createElement('div');
                        d.className = 'pd-famous-item';
                        d.textContent = line;
                        famousDiv.appendChild(d);
                        hasFamous = true;
                    }
                });
            }
            if (!hasFamous) {
                famousDiv.innerHTML = '<p class="pd-placeholder">此詩尚無評分較高的佳句。</p>';
            }

            // Zhuyin (注音說明)
            const zhuyinDiv = document.getElementById('dlgZhuyin');
            if (poem.zhuyin) {
                //在注音說明資料的每一行之前添加"△"字元
                poem.zhuyin = "△" + poem.zhuyin;
                poem.zhuyin = poem.zhuyin.replace(/\n/g, '\n△');
                zhuyinDiv.textContent = poem.zhuyin;
            } else {
                zhuyinDiv.innerHTML = '<p class="pd-placeholder">（暫無注音）</p>';
            }

            // Poem Notes (詩詞注釋)
            const poemNotesDiv = document.getElementById('dlgPoemNotes');
            if (poem.poem_notes) {
                poemNotesDiv.innerHTML = poem.poem_notes.replace(/\n/g, '<br>');
            } else {
                poemNotesDiv.innerHTML = '<p class="pd-placeholder">（暫無注釋）</p>';
            }

            // Author Life (作者生平)
            const authorData = (typeof AUTHOR_BIOGRAPHY !== 'undefined' && AUTHOR_BIOGRAPHY[poem.author]) ? AUTHOR_BIOGRAPHY[poem.author] : {};

            const authorLifeDiv = document.getElementById('dlgAuthorLife');
            if (authorData && authorData.author_life) {
                authorLifeDiv.innerHTML = authorData.author_life.replace(/\n/g, '<br>');
            } else {
                authorLifeDiv.innerHTML = '<p class="pd-placeholder">（暫無生平）</p>';
            }

            // Author Bio (作者小傳)
            const authorBioDiv = document.getElementById('dlgAuthorBio');
            if (authorData && authorData.author_bio) {
                authorBioDiv.innerHTML = authorData.author_bio.replace(/\n/g, '<br>');
            } else {
                authorBioDiv.innerHTML = '<p class="pd-placeholder">（暫無小傳）</p>';
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
