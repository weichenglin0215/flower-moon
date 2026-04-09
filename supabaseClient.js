/**
 * Supabase 雲端存檔客戶端模組
 * 負責處理所有的雲端存取與引繼碼相關操作
 */

(function () {
    'use strict';

    // ==========================================
    // 請在此處填寫您的 Supabase 專案網址與公用金鑰
    // ==========================================
    const SUPABASE_URL = 'https://zxptpfwneoddlxbomotx.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_wYriQ2rSgv177jEsiYYbQA_SaQjUU-Q';

    let supabase = null;

    // 常見詩人清單，做為隨機暱稱預設值
    const DEFAULT_AUTHORS = [
        '王勃', '李白', '杜甫', '白居易', '王維', '王之渙', '王昌齡', '賀知章', '韋應物',
        '劉禹錫', '劉長卿', '韋莊', '李商隱', '杜牧', '孟浩然', '溫庭筠',
        '辛棄疾', '陸游', '李煜', '李清照', '蘇軾', '蘇東坡', '柳宗元', '韓愈', '王安石', '歐陽修', '曹雪芹'
    ];

    const SupabaseClient = {
        init: function () {
            if (typeof window.supabase === 'undefined') {
                console.warn('Supabase SDK 未載入');
                return false;
            }
            if (!SUPABASE_URL || !SUPABASE_KEY) {
                console.warn('Supabase URL 或 Key 未設定，啟動離線模式');
                return false;
            }
            if (!supabase) {
                try {
                    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                } catch (e) {
                    console.error('初始化 Supabase 失敗:', e);
                    return false;
                }
            }
            return true;
        },

        // 供外部直接取得建立好的 supabase 實例
        getClient: function () {
            this.init();
            return supabase;
        },

        /**
         * 遊戲啟動時自動從雲端同步（以雲端資料為主）
         * 若本機有引繼碼，靜默拉取雲端資料並覆蓋本機存檔
         */
        syncOnStartup: async function () {
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return false; // 未綁定引繼碼，略過

            if (!this.init()) return false;

            try {
                const cloudData = await this.loadGameFromCloud(currentId);
                if (!cloudData) {
                    console.log('雲端無此帳號資料，保留本機存檔');
                    return false;
                }

                // 將雲端資料套用至本機（以雲端為主）
                if (window.CloudSaveDialog) {
                    window.CloudSaveDialog.applyCloudDataToLocal(cloudData, currentId);
                } else {
                    // CloudSaveDialog 未載入時的備援寫法
                    const localData = window.ScoreManager ? window.ScoreManager.getDefaultData() : {};
                    localData.nickname        = cloudData.nickname;
                    localData.totalScore      = cloudData.total_score || 0;
                    localData.globalRank      = cloudData.global_rank || '書僮';
                    localData.playDays        = cloudData.play_days || 1;
                    localData.lastPlayedDate  = cloudData.last_played_date || '';
                    localData.games           = cloudData.games || {};
                    localData.levelProgress   = cloudData.level_progress || {};
                    localData.difficultyCounts= cloudData.difficulty_counts || {};
                    localData.achievements    = cloudData.achievements || { claimed: [] };
                    localData.settings        = cloudData.settings || { bgm: true, soundEffects: true };
                    localStorage.setItem('flowerMoon_playerData', JSON.stringify(localData));
                    if (window.ScoreManager) window.ScoreManager.updateProfileUI(localData);
                }
                console.log('✅ 雲端同步完成：', currentId);
                return true;
            } catch (e) {
                console.warn('啟動同步失敗（保留本機資料）:', e);
                return false;
            }
        },

        // 產生一組 4 碼的隨機大寫英數字
        generateRandomSuffix: function () {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let result = '';
            for (let i = 0; i < 4; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        },

        // 隨機取得一位詩人名字
        getRandomAuthorName: function () {
            return DEFAULT_AUTHORS[Math.floor(Math.random() * DEFAULT_AUTHORS.length)];
        },

        // 檢查該 ID 在資料庫是否已存在
        checkIdExists: async function (id) {
            if (!this.init()) return false;
            try {
                const { data, error } = await supabase
                    .from('player_saves')
                    .select('id')
                    .eq('id', id)
                    .single();
                if (error && error.code !== 'PGRST116') { // PGRST116 是找不到資料
                    console.error('查詢 ID 失敗:', error);
                    return false;
                }
                return !!data;
            } catch (e) {
                console.error('查詢異常:', e);
                return false;
            }
        },

        // 從資料庫載入遊戲進度
        loadGameFromCloud: async function (id) {
            if (!this.init()) return null;
            try {
                const { data, error } = await supabase
                    .from('player_saves')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) {
                    if (error.code !== 'PGRST116') console.error('載入存檔失敗:', error);
                    return null; // 找不到檔案或發生錯誤
                }
                return data;
            } catch (e) {
                console.error('讀取異常:', e);
                return null;
            }
        },

        // 更新使用者的暱稱並保持紀錄 (不會更動 id 引繼碼)
        updateNicknameOnly: async function (id, newNickname) {
            if (!this.init()) return false;
            try {
                const { error } = await supabase
                    .from('player_saves')
                    .update({ nickname: newNickname, updated_at: new Date().toISOString() })
                    .eq('id', id);
                if (error) throw error;
                return true;
            } catch (e) {
                console.error('更新暱稱失敗:', e);
                return false;
            }
        },

        // 將本地資料上傳至雲端覆蓋
        saveGameToCloud: async function (localData) {
            if (!this.init()) return false;
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return false;

            // 從 "#" 分割取得 nickname 顯示部分
            const nickname = currentId.split('#')[0] || localData.nickname || '訪客';

            // 準備上傳的結構
            const payload = {
                id: currentId,
                version: localData.version || '1.2',
                nickname: nickname,
                total_score: localData.totalScore || 0,
                global_rank: localData.globalRank || '書僮',
                play_days: localData.playDays || 1,
                last_played_date: localData.lastPlayedDate || new Date().toISOString().split('T')[0],
                games: localData.games || {},
                level_progress: localData.levelProgress || {},
                difficulty_counts: localData.difficultyCounts || {},
                achievements: localData.achievements || {},
                settings: localData.settings || {},
                updated_at: new Date().toISOString()
            };

            try {
                const { error } = await supabase
                    .from('player_saves')
                    .upsert(payload, { onConflict: 'id' });

                if (error) {
                    console.error('備份存檔至雲端失敗:', error);
                    return false;
                }
                return true;
            } catch (e) {
                console.error('備份儲存異常:', e);
                return false;
            }
        },

        /**
         * 寫入一筆遊戲 LOG 到 Supabase game_logs 資料表
         * @param {object} opts - { gameNo, difficulty, score, isWin }
         */
        logGame: async function (opts) {
            if (!this.init()) return;
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return; // 未綁定引繼碼則不記錄

            try {
                await supabase
                    .from('game_logs')
                    .insert({
                        player_id:  currentId,
                        played_at:  new Date().toISOString(),
                        duration_s: 0,
                        game_no:    opts.gameNo || 0,
                        difficulty: opts.difficulty || '',
                        score:      opts.score || 0,
                        is_win:     opts.isWin !== false
                    });
            } catch (e) {
                console.warn('LOG 寫入失敗:', e);
            }
        }
    };

    window.SupabaseClient = SupabaseClient;

})();
