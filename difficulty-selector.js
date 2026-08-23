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

            // ── 兩欄式難度選單 ───────────────────────────────────────────
            // 左欄「隨機練習」：維持原本行為，每次隨機抽題。
            // 右欄「關卡模式」：進入該難度層的固定關卡序列，題目由跨遊戲共用
            //                   關卡表決定，所有遊戲的同一關都是同一組詩句。
            // 已熟悉較難詩詞的玩家可直接點右欄「大學」，不必從小學一路推上來。
            // 左欄改以「隨機」為統一標籤：難度本身已由按鈕顏色表達
            //（綠=小學、藍=中學、紅=高中、紫=大學、金=研究所），
            // 寬度縮半，把視覺主體讓給右欄的關卡模式。
            const randomHTML = this.levels.map(level =>
                `<button class="difficulty-btn" data-level="${level}">隨機</button>`
            ).join('');
            const levelHTML = this.levels.map(level =>
                `<button class="difficulty-level-btn" data-level="${level}">${level}</button>`
            ).join('');

            overlay.innerHTML = `
                <div class="difficulty-selector-container" style="position:relative;">
                    <h2>請選擇難度</h2>
                    <label id="difficulty-calendar-label" title="測試用：強制使用今日日曆詩（不消耗每日名額）" style="position:absolute;top:10px;right:10px;opacity:0.1;font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer;color:#f4e4a0;user-select:none;">
                        <input type="checkbox" id="difficulty-calendar-chk" style="cursor:pointer;">📅 日曆
                    </label>
                    <div class="difficulty-two-col">
                        <div class="difficulty-col difficulty-col-random">
                            <div class="difficulty-col-title">隨機練習</div>
                            <div class="difficulty-buttons">
                                ${randomHTML}
                            </div>
                        </div>
                        <div class="difficulty-col difficulty-col-level">
                            <div class="difficulty-col-title">關卡模式<span class="difficulty-new-tag">新</span></div>
                            <div class="difficulty-buttons">
                                ${levelHTML}
                            </div>
                        </div>
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

