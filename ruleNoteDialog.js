/* ruleNoteDialog.js - 共用的遊戲規則彈窗系統 */

(function () {
    window.RuleNoteDialog = {
        containerId: 'global-rule-note-dialog',
        element: null,

        createDOM: function () {
            if (this.element) return;
            const div = document.createElement('div');
            div.id = this.containerId;
            // 讓外層遵循 5:8 縮放比例
            div.className = 'ruleNoteDialog-container  hidden';
            div.innerHTML = `
                <div id="${this.containerId}-box" class="ruleNoteDialog-box">
                    <h2 id="${this.containerId}-title"></h2>
                    <div id="${this.containerId}-content"></div>
                    <button id="${this.containerId}-btn"></button>
                </div>
            `;
            document.body.appendChild(div);
            this.element = div;
            
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = '500px';
                    div.style.height = '850px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        /**
         * 顯示遊戲規則彈窗
         * @param {Object} options 
         * @param {string} options.title - 彈窗標題
         * @param {Array<string>} options.lines - 段落陣列 (可用 <br> 等)
         * @param {string} options.btnText - 確認按鈕文字
         * @param {Function} options.onConfirm - 點擊確認後的回呼 (如開始計時)
         * @param {Object} options.styles - 客製化樣式，包含 top, left, width, height, bg, titleColor, textColor, btnBg, btnColor
         */
        show: function (options) {
            this.createDOM();

            const boxEl = document.getElementById(`${this.containerId}-box`);
            const titleEl = document.getElementById(`${this.containerId}-title`);
            const contentEl = document.getElementById(`${this.containerId}-content`);
            const btnEl = document.getElementById(`${this.containerId}-btn`);

            // 設置文字
            titleEl.textContent = options.title || '規則說明';
            if (options.lines && Array.isArray(options.lines)) {
                contentEl.innerHTML = options.lines.map(line => `<p>${line}</p>`).join('');
            } else {
                contentEl.innerHTML = '';
            }
            btnEl.textContent = options.btnText || '開始挑戰';

            // 套用客製化樣式 (或重置為預設) 給內部框
            const st = options.styles || {};
            boxEl.style.top = st.top || '50%';
            boxEl.style.left = st.left || '50%';
            boxEl.style.width = st.width || '60%';
            boxEl.style.height = st.height || '70%';
            boxEl.style.background = st.bg || 'hsla(210, 80%, 25%, 0.6)';
            
            titleEl.style.color = st.titleColor || 'hsl(45, 100%, 70%)';
            contentEl.style.color = st.textColor || 'hsl(45, 30%, 90%)';
            
            btnEl.style.background = st.btnBg || 'hsl(210, 70%, 75%)';
            btnEl.style.color = st.btnColor || 'hsl(220, 60%, 33%)';

            // 綁定事件
            btnEl.onclick = (e) => {
                e.stopPropagation();
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.hide();
                if (typeof options.onConfirm === 'function') {
                    options.onConfirm();
                }
            };

            this.element.classList.remove('hidden');
        },

        hide: function () {
            if (this.element) {
                this.element.classList.add('hidden');
            }
        }
    };
})();
