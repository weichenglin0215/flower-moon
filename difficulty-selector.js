/**
 * 獨立難度選擇組件
 * 全域共享，供所有遊戲使用（漢堡選單的自由練習入口）
 *
 * ── 這支檔案曾經有過的功能，2026-08-28 已整理掉 ─────────────────────
 * 舊版做過「左：隨機練習／右：關卡模式」兩欄版面，關卡模式可以直接
 * 接續上次進度開下一關。後來關卡模式整個併入青雲梯（見
 * note/學習道路_重新規劃企劃書.md 第十一章），右欄改成預設隱藏、
 * 只在主控台手動設 window._fmShowLevelMode = true 才會出現——
 * 但全專案沒有任何地方會去設這個旗標，等於是一段沒有開關的死碼。
 * 這裡把它整組拿掉（HTML 產生、CSS、gameTitleToKey、getNextLevel），
 * 只留下真正還在用的「五顆難度按鈕、隨機出題」單一路徑。
 * 想找回關卡模式版本可以翻 git 記錄，不必在正式檔案裡留一份不會啟用的分支。
 */

(function () {
    'use strict';

    const DifficultySelector = {
        overlay: null,
        callback: null,
        currentGameName: '',

        // 難度級別
        levels: ['小學', '中學', '高中', '大學', '研究所'],

        /**
         * 初始化組件
         */
        init: function () {
            // 如果已經初始化，直接返回
            if (this.overlay) return;

            // 確保 difficulty-selector.css 已載入
            if (!document.getElementById('difficulty-selector-css')) {
                const link = document.createElement('link');
                link.id = 'difficulty-selector-css';
                link.rel = 'stylesheet';
                link.href = 'difficulty-selector.css';
                document.head.appendChild(link);
            }

            // 建立 DOM 結構
            this.createDOM();

            // 綁定事件
            this.bindEvents();
        },

        /**
         * 建立 DOM 結構
         */
        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'difficulty-selector-overlay';
            overlay.className = 'difficulty-selector-overlay hidden';

            const buttonsHTML = this.levels.map(level =>
                `<button class="difficulty-btn" data-level="${level}">${level}</button>`
            ).join('');

            overlay.innerHTML = `
                <div class="difficulty-selector-container">
                    <h2>請選擇難度</h2>
                    <label id="difficulty-calendar-label" class="difficulty-calendar-label"
                           title="測試用：強制使用今日日曆詩（不消耗每日名額）">
                        <input type="checkbox" id="difficulty-calendar-chk">📅 日曆
                    </label>
                    <div class="difficulty-buttons">
                        ${buttonsHTML}
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    overlay.style.left = r.left + 'px';
                    overlay.style.top = r.top + 'px';
                    overlay.style.width = 500 + 'px';
                    overlay.style.height = 850 + 'px';
                    overlay.style.transform = 'scale(' + r.scale + ')';
                    overlay.style.transformOrigin = 'top left';
                });
            }
            this.overlay = overlay;
        },

        /**
         * 綁定事件
         */
        bindEvents: function () {
            // 點擊難度按鈕
            const buttons = this.overlay.querySelectorAll('.difficulty-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const level = e.target.getAttribute('data-level');
                    // 根據難度播放不同音頻：小學1→7、中學→9、高中→11、大學→13、研究所→15
                    let audioIndex = 1;
                    if (level === '小學') audioIndex = 7;
                    else if (level === '中學') audioIndex = 9;
                    else if (level === '高中') audioIndex = 11;
                    else if (level === '大學') audioIndex = 13;
                    else if (level === '研究所') audioIndex = 15;
                    if (window.SoundManager) {
                        // 三連音，延遲播放避免音頻重疊
                        window.SoundManager.playGuzheng(audioIndex);
                        setTimeout(() => window.SoundManager.playGuzheng(audioIndex + 2), 200);
                    }
                    this.selectDifficulty(level);
                });
            });

            // 日曆測試勾選框（強制使用今日日曆詩，不消耗每日名額）
            const calChk = this.overlay.querySelector('#difficulty-calendar-chk');
            if (calChk) {
                calChk.addEventListener('change', () => {
                    window._forceCalendarPoem = calChk.checked;
                });
            }
        },

        /**
         * 顯示難度選擇器
         * @param {string} gameName - 遊戲名稱（用於日誌）
         * @param {Function} callback - 選擇後的回呼函式，參數為選中的難度
         */
        show: function (gameName, callback) {
            console.log(`[DifficultySelector] 正在開啟難度選擇器: ${gameName}`);
            this.init(); // 確保已初始化

            this.currentGameName = gameName || 'Unknown Game';
            this.callback = callback;

            if (this.overlay) {
                this.overlay.classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                console.log(`[DifficultySelector] 難度選擇器已顯示`);
            } else {
                console.error('[DifficultySelector] 無法顯示：DOM 未創建');
            }
        },

        /**
         * 隱藏難度選擇器
         */
        hide: function () {
            if (!this.overlay) return;

            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';

            console.log(`[DifficultySelector] 隱藏難度選擇器`);
        },

        /**
         * 選擇難度
         * @param {string} level - 選中的難度
         */
        selectDifficulty: function (level) {
            console.log(`[DifficultySelector] ${this.currentGameName} 選擇難度: ${level}`);
            this.hide();
            // ⚠️ 進入「隨機練習」前必須清除關卡情境，
            //    否則 getSharedRandomPoem 會誤以為仍在關卡模式而去查關卡表。
            if (window.LevelTable) window.LevelTable.clearContext();
            if (this.callback && typeof this.callback === 'function') {
                this.callback(level);
            }
        },

        /**
         * 清理組件
         */
        destroy: function () {
            if (this.overlay) {
                this.overlay.remove();
                this.overlay = null;
            }
            this.callback = null;
            this.currentGameName = '';
        }
    };

    // 匯出到全域
    window.DifficultySelector = DifficultySelector;

    // 自動初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DifficultySelector.init();
        });
    } else {
        DifficultySelector.init();
    }

})();
