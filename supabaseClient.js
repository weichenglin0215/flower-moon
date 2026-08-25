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
                    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
                        auth: {
                            // 本專案不使用帳號登入，關閉 session 相關功能
                            // 避免 SDK 在啟動時反覆嘗試重新整理已過期的舊 token
                            persistSession:    false,
                            autoRefreshToken:  false,
                            detectSessionInUrl: false
                        }
                    });
                } catch (e) {
                    console.error('初始化 Supabase 失敗:', e);
                    return false;
                }
            }
            return true;
        },

        /** 取得目前綁定的引繼碼（模組外不必直接碰 localStorage） */
        getCurrentId: function () {
            try { return localStorage.getItem('flower_moon_id') || ''; } catch (e) { return ''; }
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
        /**
         * 讀取雲端存檔，並明確區分三種結果。
         *
         * ⚠️ 為什麼不能沿用 loadGameFromCloud：
         *    它在「查無此帳號」與「連線失敗」兩種情況都回傳 null，
         *    呼叫端無從分辨。但這兩者的正確處置完全相反 ——
         *    查無資料代表帳號已被重置（本機該跟著清空），
         *    連線失敗則絕對不可以動本機資料。
         *
         * @returns {{ok:boolean, found:boolean, data:object|null, error:*}}
         */
        fetchSave: async function (id) {
            if (!this.init()) return { ok: false, found: false, data: null, error: 'SDK 未就緒' };
            try {
                const { data, error } = await supabase
                    .from('player_saves')
                    .select('*')
                    .eq('id', id)
                    .maybeSingle();

                if (error) return { ok: false, found: false, data: null, error: error };
                return { ok: true, found: !!data, data: data || null, error: null };
            } catch (e) {
                return { ok: false, found: false, data: null, error: e };
            }
        },

        /**
         * 遊戲啟動時自動從雲端同步（**以雲端資料為主**）
         *
         * 三種情形的處置：
         *   1. 連線失敗       → 保留本機，什麼都不動（網路問題不該毀掉玩家進度）
         *   2. 雲端查無此帳號 → 帳號已在雲端被刪除／重置，本機一併清空
         *   3. 雲端有資料     → 以雲端覆蓋本機
         *
         * ⚠️ 第 2 種是本次修正的重點。舊版在查無資料時只是「保留本機存檔」，
         *    導致清空雲端後重開遊戲，本機殘留的資料仍在運作
         *    （實際發生過：雲端已清空，成就頁卻仍要求領取「縣案首」獎狀），
         *    而且下一次存檔又會把舊資料整包推回雲端，等於清了個寂寞。
         */
        syncOnStartup: async function () {
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return false; // 未綁定引繼碼，略過

            if (!this.init()) return false;

            const res = await this.fetchSave(currentId);

            if (!res.ok) {
                console.warn('[雲端] 連線失敗，本次以本機存檔運作:', res.error);
                return false;
            }

            if (!res.found) {
                console.warn('[雲端] 查無此帳號（可能已被重置），依雲端優先原則清空本機:', currentId);
                if (window.ScoreManager && typeof window.ScoreManager.resetAll === 'function') {
                    window.ScoreManager.resetAll({ cloud: false, keepId: true });
                }
                return false;
            }

            try {
                if (window.CloudSaveDialog) {
                    window.CloudSaveDialog.applyCloudDataToLocal(res.data, currentId);
                } else {
                    console.warn('[雲端] CloudSaveDialog 未載入，無法套用雲端資料');
                    return false;
                }
                console.log('✅ 雲端同步完成：', currentId);
                return true;
            } catch (e) {
                console.warn('套用雲端資料失敗（保留本機資料）:', e);
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

            // 關卡相關的三個欄位嵌入 achievements 一起存雲端
            // （沿用既有的 _levelCleared 慣例，避免再動 schema）
            //   _levelCleared = 各遊戲的通關紀錄（青雲梯用它算「三種提取方式」）
            //   _levelDonated = 捐納跳關的關卡
            //   _levelFails   = 各關卡失敗次數（捐納門檻判定用）
            const achievementsToSave = Object.assign(
                {}, localData.achievements || {},
                {
                    _levelCleared: localData.levelCleared || {},
                    _levelDonated: localData.levelDonated || {},
                    _levelFails:   localData.levelFails   || {},
                    _pathRounds:   localData.pathRounds   || 0
                }
            );

            // 江南小院收集系統（文錢、考試通過紀錄、考試次數、田地/茶寮/酒窖…）
            // ⚠️ 這一整包過去只存在本機、從未上雲，造成的實害：
            //    清空雲端後重開遊戲，成就頁仍依本機的 ranks.passed
            //    要求玩家領取「縣案首」獎狀。
            let collectionToSave = {};
            try {
                if (window.FMCollectionSave && typeof window.FMCollectionSave.load === 'function') {
                    collectionToSave = window.FMCollectionSave.load() || {};
                }
            } catch (e) {
                console.warn('[雲端] 讀取收集系統存檔失敗，本次不上傳該欄位:', e);
            }

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
                achievements: achievementsToSave,
                poem_records: localData.poemRecords || {},
                settings: localData.settings || {},
                collection: collectionToSave,
                updated_at: new Date().toISOString()
            };

            try {
                const { error } = await supabase
                    .from('player_saves')
                    .upsert(payload, { onConflict: 'id' });

                if (error) {
                    // 資料庫尚未新增 collection 欄位時（PostgREST 42703 / PGRST204），
                    // 退回舊格式再存一次，確保核心進度不會因此完全存不進去。
                    const code = String(error.code || '');
                    const msg = String(error.message || '');
                    if (code === '42703' || code === 'PGRST204' || msg.indexOf('collection') >= 0) {
                        console.warn('[雲端] player_saves 尚無 collection 欄位，本次改存舊格式。'
                            + '請執行：alter table player_saves add column if not exists collection jsonb;');
                        delete payload.collection;
                        const retry = await supabase
                            .from('player_saves')
                            .upsert(payload, { onConflict: 'id' });
                        if (retry.error) {
                            console.error('備份存檔至雲端失敗:', retry.error);
                            return false;
                        }
                        return true;
                    }
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
         * 把某個引繼碼在雲端的所有紀錄整個刪除。
         *
         * ⚠️ 這是破壞性操作，只用於測試期重置。
         *    會刪除 player_saves 與 game_logs 兩張表中該 id 的資料。
         *
         * @param {string} id 引繼碼，例如 '家中測試#ZPSY'
         * @returns {{ok:boolean, saves:number|null, logs:number|null, error:*}}
         */
        deletePlayerFromCloud: async function (id) {
            if (!this.init()) return { ok: false, saves: null, logs: null, error: 'SDK 未就緒' };
            if (!id) return { ok: false, saves: null, logs: null, error: '未提供 id' };
            try {
                const logsRes = await supabase
                    .from('game_logs')
                    .delete()
                    .eq('player_id', id)
                    .select('player_id');
                if (logsRes.error) throw logsRes.error;

                const savesRes = await supabase
                    .from('player_saves')
                    .delete()
                    .eq('id', id)
                    .select('id');
                if (savesRes.error) throw savesRes.error;

                return {
                    ok: true,
                    saves: (savesRes.data || []).length,
                    logs: (logsRes.data || []).length,
                    error: null
                };
            } catch (e) {
                console.error('[雲端] 刪除玩家資料失敗:', e);
                return { ok: false, saves: null, logs: null, error: e };
            }
        },

        /**
         * 寫入一筆遊戲 LOG 到 Supabase game_logs 資料表
         * @param {object} opts - { gameNo, difficulty, score, isWin, durationS }
         *   durationS: 本局遊玩時長（秒），從進入關卡到過關/失敗的整數秒數
         */
        logGame: async function (opts) {
            if (!this.init()) return;
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return; // 未綁定引繼碼則不記錄

            try {
                // 這一局屬於關卡模式（青雲梯／關卡選擇器）還是自由練習？
                //
                // ⚠️ 刻意在這裡自行判斷，而不是要求 41 個 logGame 呼叫點多傳一個參數。
                //    LevelTable 的關卡情境由 level-selector.js／learningPath.js 設定，
                //    difficulty-selector.js 進入隨機練習前會 clearContext()，
                //    因此「情境是否存在」正好等於「這局算不算晉升局」。
                //    結算動畫期間玩家不可能離開關卡，此時讀取仍然有效。
                const isRanked = !!(window.LevelTable
                    && typeof window.LevelTable.getContext === 'function'
                    && window.LevelTable.getContext());

                const payload = {
                    player_id:  currentId,
                    played_at:  new Date().toISOString(),
                    duration_s: Math.round(opts.durationS || 0), // 本局遊玩時長（秒）
                    game_no:    opts.gameNo || 0,
                    difficulty: opts.difficulty || '',
                    score:      opts.score || 0,
                    is_win:     opts.isWin !== false,
                    is_ranked:  isRanked
                };

                const { error } = await supabase.from('game_logs').insert(payload);

                if (error) {
                    // 資料庫尚未新增 is_ranked 欄位時（PostgREST 42703 / PGRST204），
                    // 退回舊格式再寫一次。
                    //
                    // ⚠️ 這個保險非常重要：supabase-js 不會 throw，只會把錯誤放在
                    //    回傳值裡，所以少了這段，「JS 先上線、SQL 還沒跑」的空窗期
                    //    會讓**每一局的 LOG 都靜默寫不進去**，而且外面的 try/catch
                    //    完全攔不到。作法比照 saveGameToCloud 對 collection 欄位的處理。
                    const code = String(error.code || '');
                    const msg  = String(error.message || '');
                    if (code === '42703' || code === 'PGRST204' || msg.indexOf('is_ranked') >= 0) {
                        console.warn('[雲端] game_logs 尚無 is_ranked 欄位，本次改存舊格式。'
                            + '請執行 note/排行榜彙總表_SQL草案.sql 第 1.4 節。');
                        delete payload.is_ranked;
                        const retry = await supabase.from('game_logs').insert(payload);
                        if (retry.error) console.warn('LOG 寫入失敗:', retry.error.message);
                    } else {
                        console.warn('LOG 寫入失敗:', msg);
                    }
                }
            } catch (e) {
                console.warn('LOG 寫入失敗:', e);
            }
        },

        /**
         * 寫入一筆文錢流水帳到 Supabase silver_events 資料表。
         *
         * ⚠️ 只記「玩遊戲以外」的文錢異動（獎狀、晉升文位、江南小院經營、消費）。
         *    玩遊戲賺的文錢刻意不寫這裡 —— 它可以由 game_logs.score 直接推算
         *    （floor(score/100)，與 ScoreManager.saveScore 同一條規則），
         *    重複記錄只會製造兩份可能對不起來的數字。
         *
         * ⚠️ 這張表是統計用的流水帳，不是餘額的權威來源。
         *    餘額的權威是本機存檔的 collection.silver（隨 player_saves 上雲）。
         *
         * 一律由 FMCollectionSave.addSilver 呼叫，其他地方不要直接呼叫，
         * 否則本機餘額與流水帳會不同步。
         *
         * @param {object} opts - { amount, source, note }
         *   amount: 正值＝獲得，負值＝花費
         *   source: cert / rank / harvest / tea / wine / scribe / sell / decorate / exam_fee
         */
        logSilverEvent: async function (opts) {
            if (!this.init()) return;
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return; // 未綁定引繼碼則不記錄（與 logGame 一致）
            if (!opts || !opts.amount) return;

            try {
                // supabase-js 不會 throw，錯誤只會出現在回傳值裡，必須自己檢查。
                // silver_events 尚未建立時這裡會持續告警，正好提醒 SQL 還沒跑。
                const { error } = await supabase
                    .from('silver_events')
                    .insert({
                        player_id:   currentId,
                        occurred_at: new Date().toISOString(),
                        amount:      Math.round(opts.amount),
                        source:      opts.source || 'other',
                        note:        opts.note || null
                    });
                if (error) {
                    console.warn('[雲端] 文錢流水帳寫入失敗（不影響本機文錢餘額）:',
                        error.message);
                }
            } catch (e) {
                console.warn('文錢流水帳寫入失敗:', e);
            }
        }
    };

    window.SupabaseClient = SupabaseClient;

})();
