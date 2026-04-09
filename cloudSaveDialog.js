/**
 * 雲端存檔與暱稱彈窗模組
 */

(function () {
    'use strict';

    const CloudSaveDialog = {
        overlay: null,

        init: function () {
            if (this.overlay) return;

            const overlay = document.createElement('div');
            overlay.className = 'cloud-save-overlay aspect-5-8';
            overlay.id = 'cloudSaveOverlay';

            overlay.innerHTML = `
                <div class="cloud-save-dialog">
                    <div class="cloud-save-title" id="csTitle">輸入暱稱</div>
                    <div class="cloud-save-desc" id="csDesc">請為自己取個響亮的名號，將為您儲存雲端進度。</div>
                    
                    <div class="cloud-save-input-group">
                        <input type="text" id="csInput" class="cloud-save-input" maxlength="20" placeholder="例如：李白" />
                    </div>

                    <div class="cloud-save-message" id="csMessage"></div>

                    <div class="cloud-save-actions">
                        <button class="cloud-save-btn cloud-save-btn-secondary" id="csBtnCancel" style="display:none;">取消</button>
                        <button class="cloud-save-btn cloud-save-btn-primary" id="csBtnConfirm">確認</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            this.overlay = overlay;
            this.bindEvents();
        },

        bindEvents: function () {
            document.getElementById('csBtnCancel').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
                if (this.cancelCallback) this.cancelCallback();
            });

            document.getElementById('csBtnConfirm').addEventListener('click', () => {
                this.submitForm();
            });

            document.getElementById('csInput').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.submitForm();
                }
            });
        },

        showMessage: function (msg, isError = true) {
            const msgEl = document.getElementById('csMessage');
            msgEl.textContent = msg;
            msgEl.className = 'cloud-save-message ' + (isError ? 'msg-error' : 'msg-success');
        },

        show: function (options) {
            this.init();

            // 設定模式: 'initial' (第一次建檔), 'change' (更改或引繼)
            this.mode = options.mode || 'initial';
            this.successCallback = options.onSuccess;
            this.cancelCallback = options.onCancel;

            const titleEl = document.getElementById('csTitle');
            const descEl = document.getElementById('csDesc');
            const inputEl = document.getElementById('csInput');
            const cancelBtn = document.getElementById('csBtnCancel');
            const msgEl = document.getElementById('csMessage');

            msgEl.textContent = '';

            if (this.mode === 'initial') {
                titleEl.textContent = '輸入暱稱';
                //descEl.textContent = '請為自己取個響亮的名號，\n將自動為您生成引繼碼，\n並同步雲端。';
                descEl.textContent = '請為自己取個響亮的名號。';
                inputEl.value = window.SupabaseClient.getRandomAuthorName();
                cancelBtn.style.display = 'none'; // 第一次強制要生帳號 (如果需要的話)，不過設計上也可以讓他關閉？
                // 需求：完成任一局後顯示，預設任一作者
            } else {
                titleEl.textContent = '變更暱稱 / 引繼帳號';
                //descEl.textContent = '輸入新暱稱可變更顯示名稱，\n\n若輸入完整暱稱+引繼碼\n（如 李白#1234）\n可在手機與平板上同步進度，\n\n注意：若輸入錯誤引繼碼，\n會失去目前所有進度。';
                descEl.innerHTML = '<b>輸入新暱稱可變更顯示名稱</b><br><br>若輸入完整暱稱+引繼碼<br>（如 李白#1234）<br>可在手機與平板上同步進度。<br><br><font color="red">注意：若輸入錯誤引繼碼，<br>會失去目前所有進度。</font>';
                inputEl.value = '';
                cancelBtn.style.display = 'block';
            }

            this.overlay.classList.add('active');
            inputEl.focus();
            inputEl.select();
        },

        hide: function () {
            if (this.overlay) {
                this.overlay.classList.remove('active');
            }
        },

        submitForm: async function () {
            if (window.SoundManager) window.SoundManager.playConfirmItem();

            const inputEl = document.getElementById('csInput');
            const btn = document.getElementById('csBtnConfirm');
            const rawValue = inputEl.value.trim();

            if (!rawValue) {
                this.showMessage('請輸入暱稱');
                return;
            }

            btn.disabled = true;
            btn.textContent = '處理中...';
            this.showMessage('', false);

            try {
                // 檢查是否為完整引繼碼格式 (Nickname#XXXX)
                const isFullCode = /^[^\#]+\#[A-Z0-9]{4}$/.test(rawValue);

                if (this.mode === 'initial') {
                    if (isFullCode) {
                        // 使用者刻意輸入了完整引繼碼當初次暱稱
                        const exists = await window.SupabaseClient.checkIdExists(rawValue);
                        if (exists) {
                            // 匯入舊進度
                            const cloudData = await window.SupabaseClient.loadGameFromCloud(rawValue);
                            if (cloudData) {
                                this.applyCloudDataToLocal(cloudData, rawValue);
                                this.showMessage('成功載入雲端進度！', false);
                                setTimeout(() => this.complete(cloudData), 1000);
                            } else {
                                this.showMessage('載入進度失敗，請稍後再試');
                                btn.disabled = false;
                                btn.textContent = '確認';
                            }
                        } else {
                            // 創建新資料
                            const newId = rawValue;
                            localStorage.setItem('flower_moon_id', newId);
                            // 呼叫 saveManager 儲存一次
                            this.updateLocalNicknameAndSave(newId.split('#')[0]);
                            this.showMessage('成功建立雲端存檔！', false);
                            setTimeout(() => this.complete(), 1000);
                        }
                    } else {
                        // 產生引繼碼
                        const newId = rawValue + '#' + window.SupabaseClient.generateRandomSuffix();
                        localStorage.setItem('flower_moon_id', newId);
                        this.updateLocalNicknameAndSave(rawValue);
                        this.showMessage(`建立成功！您的引繼碼為：${newId}`, false);
                        setTimeout(() => this.complete(), 2000);
                    }
                }
                else if (this.mode === 'change') {
                    if (isFullCode) {
                        // 引繼舊帳號
                        const exists = await window.SupabaseClient.checkIdExists(rawValue);
                        if (exists) {
                            const cloudData = await window.SupabaseClient.loadGameFromCloud(rawValue);
                            if (cloudData) {
                                this.applyCloudDataToLocal(cloudData, rawValue);
                                this.showMessage('成功載入雲端進度！', false);
                                setTimeout(() => {
                                    this.hide();
                                    if (this.successCallback) this.successCallback();
                                }, 1500);
                            } else {
                                this.showMessage('載入失敗');
                            }
                        } else {
                            this.showMessage('找不到該引繼碼的資料，請確認後再試！');
                        }
                    } else {
                        // 僅變更當前暱稱
                        const currentId = localStorage.getItem('flower_moon_id');
                        if (currentId) {
                            // 呼叫雲端更新暱稱 (保持 ID 不變)
                            const success = await window.SupabaseClient.updateNicknameOnly(currentId, rawValue);
                            if (success) {
                                this.updateLocalNickname(rawValue);
                                this.showMessage('更改暱稱成功！', false);
                                setTimeout(() => {
                                    this.hide();
                                    if (this.successCallback) this.successCallback();
                                }, 1000);
                            } else {
                                this.showMessage('更改暱稱失敗，可能未連線資料庫');
                            }
                        } else {
                            this.showMessage('本機無存檔，無法更改暱稱');
                        }
                    }

                    if (btn.disabled) { // 如果沒有中途返回 (因為失敗)
                        btn.disabled = false;
                        btn.textContent = '確認';
                    }
                }

            } catch (err) {
                console.error(err);
                this.showMessage('發生非預期錯誤');
                btn.disabled = false;
                btn.textContent = '確認';
            }
        },

        updateLocalNickname: function (nickname) {
            if (window.ScoreManager) {
                const data = window.ScoreManager.loadPlayerData();
                data.nickname = nickname;
                localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));
            }
        },

        updateLocalNicknameAndSave: function (nickname) {
            this.updateLocalNickname(nickname);
            if (window.ScoreManager && window.SupabaseClient) {
                const data = window.ScoreManager.loadPlayerData();
                window.SupabaseClient.saveGameToCloud(data);
            }
        },

        applyCloudDataToLocal: function (cloudData, id) {
            localStorage.setItem('flower_moon_id', id);

            // 轉換雲端資料回 localData 結構
            const localData = window.ScoreManager ? window.ScoreManager.getDefaultData() : {};
            localData.version = cloudData.version;
            localData.nickname = cloudData.nickname;
            localData.totalScore = cloudData.total_score;
            localData.globalRank = cloudData.global_rank;
            localData.playDays = cloudData.play_days;
            localData.lastPlayedDate = cloudData.last_played_date;
            localData.games = cloudData.games || {};
            localData.levelProgress = cloudData.level_progress || {};
            localData.difficultyCounts = cloudData.difficulty_counts || {};
            localData.achievements = cloudData.achievements || { unlocked: [], progress: {}, claimed: [] };
            localData.settings = cloudData.settings || { bgm: true, soundEffects: true };

            localStorage.setItem('flowerMoon_playerData', JSON.stringify(localData));

            // 重新刷新 UI
            if (window.ScoreManager) {
                window.ScoreManager.updateProfileUI(localData);
            }
        },

        complete: function (data) {
            this.hide();
            document.getElementById('csBtnConfirm').disabled = false;
            document.getElementById('csBtnConfirm').textContent = '確認';
            if (this.successCallback) this.successCallback(data);
        }
    };

    window.CloudSaveDialog = CloudSaveDialog;
})();
