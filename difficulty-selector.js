/**
 * 独立难度选择组件
 * 全局共享，供所有游戏使用
 */

(function () {
    'use strict';

    const DifficultySelector = {
        overlay: null,
        callback: null,
        currentGameName: '',

        // 难度级别
        levels: ['小學', '中學', '高中', '大學', '研究所'],

        // 遊戲標題至代號映射
        gameTitleToKey: {
            '慢思快選': 'game1',
            '飛花令': 'game2',
            '字爬梯': 'game3',
            '眾裡尋他': 'game4',
            '眾裡尋他千百度': 'game4',
            '詩詞精靈': 'game5',
            '詩詞小精靈': 'game5',
            '詩陣侵略': 'game6',
            '青鳥雲梯': 'game7',
            '一筆裁詩': 'game8',
            '詩韻鎖扣': 'game9',
            '擊石鳴詩': 'game10',
            '翻墨識蹤': 'game11',
            '疏影橫斜': 'game12',
            '人事時地': 'game13',
            '步步驚心': 'game14',
            '墨韻游龍': 'game15',
            '打地詩': 'game16',
            '青蛙過河': 'game17',
            '詩碟狂襲': 'game19',
            '丟三落一': 'game20',
            '橫批成詩': 'game21',
            '詩詞拼圖': 'game22',
            '縱橫集句': 'game23',
            '三字成珠': 'game24',
            '連珠拾字': 'game25',
            '投珠破句': 'game26',
            '詩磚壘塔': 'game27',
            '兩心相印': 'game28',
            '字龍盤環': 'game29',
            '層巒疊翠': 'game30',
            '詩眼覓蹤': 'game31',
            '尋詩地圖': 'game32',
            '作者是誰': 'game33',
            '猜猜詩題': 'game34',
            '詩人心情': 'game35',
            '步步為陣': 'game37',
            '推枰成詩': 'game38',
            '彈珠成詩': 'game39',
            '點兵成詩': 'game40'
        },

        /**
         * 初始化组件
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

            // 创建 DOM 结构
            this.createDOM();

            // 绑定事件
            this.bindEvents();
        },

        /**
         * 创建 DOM 结构
         */
        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'difficulty-selector-overlay';
            overlay.className = 'difficulty-selector-overlay  hidden';

            // ── 難度選單（2026-08 青雲梯改版後退回單欄）────────────────────
            // 對應企畫書 note/學習道路_重新規劃企劃書.md 第十一章。
            //
            // 改版前曾做成兩欄（左「隨機」／右「關卡模式」），但關卡模式與
            // 青雲梯在做同一件事 —— 兩套並存的進度系統只會讓玩家搞不清楚
            // 「到底哪個才是我的進度」。因此關卡模式整個併入青雲梯：
            //   · 青雲梯 = 唯一的進度主線（給文錢、積分、關卡進度、考試資格）
            //   · 漢堡選單 = 純娛樂與複習（給文錢、積分、獎狀、連續天數，
            //                但**不算考試資格**）
            // 這裡因此退回單純的五顆難度按鈕，每次隨機出題。
            const randomHTML = this.levels.map(level =>
                `<button class="difficulty-btn" data-level="${level}">${level}</button>`
            ).join('');

            // 關卡模式按鈕保留但預設隱藏，僅供開發期測試用
            //（正式上線不顯示；要開啟改 SHOW_LEVEL_MODE 或在主控台設
            //  window._fmShowLevelMode = true 後重新整理）。
            const showLevelMode = (typeof window !== 'undefined' && window._fmShowLevelMode === true);
            const levelHTML = this.levels.map(level =>
                `<button class="difficulty-level-btn" data-level="${level}">${level}</button>`
            ).join('');
            const levelColHTML = showLevelMode ? `
                        <div class="difficulty-col difficulty-col-level">
                            <div class="difficulty-col-title">關卡模式<span class="difficulty-new-tag">測試</span></div>
                            <div class="difficulty-buttons">
                                ${levelHTML}
                            </div>
                        </div>` : '';

            overlay.innerHTML = `
                <div class="difficulty-selector-container" style="position:relative;">
                    <h2>請選擇難度</h2>
                    <label id="difficulty-calendar-label" title="測試用：強制使用今日日曆詩（不消耗每日名額）" style="position:absolute;top:10px;right:10px;opacity:0.1;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;color:#f4e4a0;user-select:none;">
                        <input type="checkbox" id="difficulty-calendar-chk" style="cursor:pointer;">📅 日曆
                    </label>
                    <div class="difficulty-two-col${showLevelMode ? '' : ' difficulty-single-col'}">
                        <div class="difficulty-col difficulty-col-random">
                            <div class="difficulty-buttons">
                                ${randomHTML}
                            </div>
                        </div>${levelColHTML}
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
         * 绑定事件
         */
        bindEvents: function () {
            // 点击难度按钮
            const buttons = this.overlay.querySelectorAll('.difficulty-btn');
            buttons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const level = e.target.getAttribute('data-level');
                    //根據難度，播放不同音頻。
                    //小學:1,中學:2,高中:3,大學:4,研究所:5
                    let audioIndex = 1;
                    if (level === '小學') audioIndex = 7;
                    else if (level === '中學') audioIndex = 9;
                    else if (level === '高中') audioIndex = 11;
                    else if (level === '大學') audioIndex = 13;
                    else if (level === '研究所') audioIndex = 15;
                    if (window.SoundManager) {
                        //三連音，延遲播放，避免音頻重疊。
                        window.SoundManager.playGuzheng(audioIndex);
                        setTimeout(() => window.SoundManager.playGuzheng(audioIndex + 2), 200);
                        //setTimeout(() => window.SoundManager.playGuzheng(audioIndex + 4), 350);
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

            // 右欄「關卡模式」按鈕：直接接續上次進度，開始「尚未完成的那一關」，
            // 不再跳出挑選關卡的清單（少一次點擊，玩家也不必自己想該玩第幾關）。
            const levelButtons = this.overlay.querySelectorAll('.difficulty-level-btn');
            levelButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const level = e.target.getAttribute('data-level');
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    this.hide();

                    const gameKey = this.gameTitleToKey[this.currentGameName] || this.currentGameName;
                    const nextLevel = this.getNextLevel(gameKey, level);

                    // 設定關卡情境，讓 getSharedRandomPoem 去查跨遊戲共用關卡表
                    if (window.LevelTable) window.LevelTable.setContext(level, nextLevel);
                    if (this.callback) this.callback(level, nextLevel);
                });
            });

            // 点击背景关闭（可选）
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    // 点击背景不关闭，强制选择难度
                    // this.hide();
                }
            });
        },

        /**
         * 取得某遊戲在某難度層「下一關該玩第幾關」。
         * 規則：已通關的最高關卡 + 1；全部通關後停在最後一關（可重複挑戰複習）。
         * @param {string} gameKey 遊戲代號，如 'game1'
         * @param {string} tier    難度層，如 '小學'
         * @returns {number} 關卡編號（自 1 起算）
         */
        getNextLevel: function (gameKey, tier) {
            let maxCleared = 0;
            try {
                if (window.ScoreManager) {
                    const data = window.ScoreManager.loadPlayerData();
                    const prog = data && data.levelProgress && data.levelProgress[gameKey];
                    maxCleared = (prog && prog[tier]) || 0;
                }
            } catch (e) {
                console.warn('[DifficultySelector] 讀取關卡進度失敗，改由第 1 關開始', e);
            }
            const total = (window.LevelTable && window.LevelTable.getLevelCount(tier)) || 1;
            return Math.min(maxCleared + 1, total);
        },

        /**
         * 显示难度选择器
         * @param {string} gameName - 游戏名称（用于日志）
         * @param {Function} callback - 选择后的回调函数，参数为选中的难度
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
         * 隐藏难度选择器
         */
        hide: function () {
            if (!this.overlay) return;

            this.overlay.classList.add('hidden');
            document.body.style.overflow = '';

            console.log(`[DifficultySelector] 隐藏难度选择器`);
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
         * 清理组件
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

    // 导出到全局
    window.DifficultySelector = DifficultySelector;

    // 自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            DifficultySelector.init();
        });
    } else {
        DifficultySelector.init();
    }

})();

