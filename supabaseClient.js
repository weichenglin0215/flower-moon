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

        /**
         * 取得目前綁定的玩家 id（模組外不必直接碰 localStorage）。
         *
         * ⚠️ 帳號制度改版後，id 只是「不可變的內部鍵」：玩家看到、輸入的是
         *    「暱稱＋四位數密碼」，id 由伺服器產生（新玩家）或沿用舊的 李白#1234（舊玩家）。
         *    其他資料表的 player_id 全靠它，所以暱稱可以改、id 不能改。
         */
        getCurrentId: function () {
            try { return localStorage.getItem('flower_moon_id') || ''; } catch (e) { return ''; }
        },

        /** 綁定玩家 id（登入／註冊／認領成功後呼叫；模組外不要自己寫 localStorage） */
        setCurrentId: function (id) {
            try { localStorage.setItem('flower_moon_id', id); } catch (e) { /* 無痕模式等情況忽略 */ }
        },

        // ──────────────────────────────────────────────────────────
        // 離線遊玩防護
        //
        // 離線時 saveGameToCloud／logGame 都會失敗，必須解決兩件事：
        //
        //  1.「雲端為準」的啟動同步，不能把離線期間玩的進度蓋掉。
        //     → 存檔因為連不上而失敗時，本機標記「有尚未上傳的進度」(dirty)；
        //       下次啟動看到旗標就改成補傳，不再拿雲端覆蓋
        //       （唯一的例外：雲端分數比本機高，代表別台裝置玩得更多，以雲端為準）。
        //
        //  2. 離線期間的遊戲紀錄（game_logs／silver_events）不能直接丟掉。
        //     → 先排進本機佇列，連線後依序補送，排行榜與統計才不會少算。
        //       每一筆都帶著原本的 player_id 與時間戳，補送時歸屬原帳號與原日期。
        //
        // ⚠️ 這兩個旗標存在本模組自己的 localStorage 鍵，不屬於玩家存檔：
        //    切換帳號（套用雲端資料）只清 dirty，不清佇列。
        // ──────────────────────────────────────────────────────────

        _DIRTY_KEY: 'fm_cloud_dirty',
        _QUEUE_KEY: 'fm_cloud_queue',
        _QUEUE_MAX: 500,   // 佇列上限，超過時丟掉最舊的（避免離線很久把儲存空間塞爆）

        /** 判斷錯誤是不是「連不上」（而不是資料庫真的回了拒絕或欄位錯誤） */
        _isNetworkError: function (err) {
            if (navigator.onLine === false) return true;
            if (!err) return false;
            const code = String(err.code || '');
            const msg = String(err.message || err);
            // supabase-js 的連線失敗：沒有資料庫錯誤碼，訊息是 Failed to fetch／Load failed／NetworkError…
            return (code === '' || code === '0') && /fetch|network|load failed|timeout|abort|offline/i.test(msg);
        },

        /** 本機是否有尚未上傳到雲端的進度 */
        isCloudDirty: function () {
            try { return localStorage.getItem(this._DIRTY_KEY) === '1'; } catch (e) { return false; }
        },

        markCloudDirty: function (flag) {
            try {
                if (flag) localStorage.setItem(this._DIRTY_KEY, '1');
                else localStorage.removeItem(this._DIRTY_KEY);
            } catch (e) { /* 無痕模式等情況忽略 */ }
        },

        _readQueue: function () {
            try {
                const q = JSON.parse(localStorage.getItem(this._QUEUE_KEY) || '[]');
                return Array.isArray(q) ? q : [];
            } catch (e) { return []; }
        },

        _writeQueue: function (q) {
            try {
                if (q.length) localStorage.setItem(this._QUEUE_KEY, JSON.stringify(q));
                else localStorage.removeItem(this._QUEUE_KEY);
            } catch (e) { /* 儲存空間滿了：寧可少記一筆統計，也不能影響遊戲 */ }
        },

        _enqueue: function (table, payload) {
            const q = this._readQueue();
            q.push({ table: table, payload: payload });
            while (q.length > this._QUEUE_MAX) q.shift();
            this._writeQueue(q);
        },

        /** 還有幾筆紀錄等著補送（供離線狀態列顯示） */
        pendingCount: function () {
            return this._readQueue().length;
        },

        /**
         * 補送所有離線期間累積的東西：先補傳存檔，再依序送出紀錄佇列。
         * 連線一恢復（online 事件）與每次啟動都會呼叫；沒網路或沒東西要送時什麼都不做。
         * @returns {Promise<boolean>} 是否已全部送完
         */
        flushPending: async function () {
            if (this._flushing) return false;
            if (navigator.onLine === false || !this.init()) return false;
            this._flushing = true;
            try {
                // 1. 未上傳的存檔：失敗代表多半還是沒網路，後面的紀錄也不用試了
                if (this.isCloudDirty() && this.getCurrentId() && window.ScoreManager) {
                    const ok = await this.saveGameToCloud(window.ScoreManager.loadPlayerData());
                    if (!ok && this.isCloudDirty()) return false;
                }

                // 2. 紀錄佇列。每送完一筆就「重新讀取」再移除隊首：
                //    送出期間 logGame 可能又排進新的一筆，拿舊陣列整份寫回會把它覆蓋掉。
                for (;;) {
                    const head = this._readQueue()[0];
                    if (!head) break;
                    const r = head.table === 'game_logs'
                        ? await this._insertGameLogWithFallback(head.payload)
                        : await this._insertSimple(head.table, head.payload);
                    if (r === 'retry') return false;   // 又斷線了，留待下次
                    const cur = this._readQueue();     // 'ok' 或 'drop'（資料庫拒收，重送也沒用）都出列
                    cur.shift();
                    this._writeQueue(cur);
                }
                return true;
            } finally {
                this._flushing = false;
            }
        },

        /** 寫入單純的一列。回傳 'ok'｜'drop'（資料庫拒收，重送無用）｜'retry'（連不上，值得重送） */
        _insertSimple: async function (table, payload) {
            try {
                const { error } = await supabase.from(table).insert(payload);
                if (!error) return 'ok';
                if (this._isNetworkError(error)) return 'retry';
                console.warn('[雲端] ' + table + ' 寫入失敗:', error.message);
                return 'drop';
            } catch (e) {
                return this._isNetworkError(e) ? 'retry' : 'drop';
            }
        },

        /** 有網路就直接送，送不出去（或明確離線）就排隊 */
        _sendOrQueue: async function (table, payload) {
            if (navigator.onLine === false || !this.init()) { this._enqueue(table, payload); return; }
            const r = table === 'game_logs'
                ? await this._insertGameLogWithFallback(payload)
                : await this._insertSimple(table, payload);
            if (r === 'retry') this._enqueue(table, payload);
        },

        // ──────────────────────────────────────────────────────────
        // 帳號（暱稱＋四位數密碼）— 對應 note/帳號密碼_SQL草案.sql
        //
        // ⚠️ 密碼的驗證、雜湊、錯誤鎖定「全部在資料庫端」的 fm_* 函式完成，
        //    前端只負責傳送與顯示結果，絕對不要在前端比對密碼：
        //    只有四位數字，前端比對等於把答案公開。
        //
        // 回傳格式統一為 { ok:boolean, reason?:string, ... }，reason 可能是：
        //   伺服器回的：taken／bad_nickname／bad_pin／not_found／locked／no_pin／
        //               no_player／already_set
        //   本機判斷的：server_not_ready（SQL 還沒執行）／network（連不上）／no_sdk
        // ──────────────────────────────────────────────────────────

        /** 呼叫一支 RPC，並把「函式不存在」與「連線失敗」分開（兩者的處置完全不同） */
        _rpc: async function (fn, args) {
            if (!this.init()) return { ok: false, reason: 'no_sdk' };
            try {
                const { data, error } = await supabase.rpc(fn, args);
                if (error) {
                    const code = String(error.code || '');
                    const msg = String(error.message || '');
                    // PGRST202 = PostgREST 找不到函式；42883 = 資料庫層 undefined_function
                    if (code === 'PGRST202' || code === '42883'
                        || /could not find the function/i.test(msg)) {
                        console.warn('[雲端] 找不到 ' + fn + '，請先執行 note/帳號密碼_SQL草案.sql');
                        return { ok: false, reason: 'server_not_ready', error: error };
                    }
                    return { ok: false, reason: 'network', error: error };
                }
                return { ok: true, data: data };
            } catch (e) {
                return { ok: false, reason: 'network', error: e };
            }
        },

        /** 把伺服器回的 jsonb 攤平成統一格式；連線層的失敗原樣回傳 */
        _unwrap: function (r) {
            if (!r.ok) return r;
            const d = r.data;
            return (d && typeof d === 'object') ? d : { ok: false, reason: 'network' };
        },

        /**
         * 暱稱是否可用。
         * @param {string} nickname
         * @param {string} [selfId] 改名時傳入自己的 id（自己目前的暱稱不算被占用）
         * @returns {Promise<boolean|null>} true 可用／false 已被使用或格式不合／null 無法判斷
         */
        checkNicknameAvailable: async function (nickname, selfId) {
            const r = await this._rpc('fm_check_nickname',
                { p_nickname: nickname, p_id: selfId || null });
            return r.ok ? !!r.data : null;
        },

        /** 註冊新帳號。成功回 {ok:true,id}；本函式只建立帳號，不碰本機存檔 */
        register: async function (nickname, pin) {
            return this._unwrap(await this._rpc('fm_register',
                { p_nickname: nickname, p_pin: pin }));
        },

        /** 以暱稱＋密碼登入。成功回 {ok:true,id}；失敗的 reason 見上方說明 */
        login: async function (nickname, pin) {
            return this._unwrap(await this._rpc('fm_login',
                { p_nickname: nickname, p_pin: pin }));
        },

        /** 查詢某個 id 是否已設定密碼。查不到（離線／SQL 未執行）回 null，呼叫端應當作「不打擾」 */
        getAccountStatus: async function (id) {
            const r = await this._rpc('fm_account_status', { p_id: id });
            return (r.ok && r.data && typeof r.data === 'object') ? r.data : null;
        },

        /**
         * 舊玩家認領：以舊 id（李白#1234）為憑證，設定暱稱＋密碼。
         * 若 player_saves 還沒有這一列（舊版曾在離線時只建本機 id），
         * 先把本機進度上傳建立該列，再重試一次。
         */
        claimLegacy: async function (id, nickname, pin) {
            const call = async () => this._unwrap(await this._rpc('fm_claim_legacy',
                { p_id: id, p_nickname: nickname, p_pin: pin }));
            let res = await call();
            if (!res.ok && res.reason === 'no_player' && window.ScoreManager
                && id === this.getCurrentId()) {
                const saved = await this.saveGameToCloud(window.ScoreManager.loadPlayerData());
                if (saved) res = await call();
            }
            return res;
        },

        /** 變更密碼（需舊密碼） */
        changePin: async function (id, oldPin, newPin) {
            return this._unwrap(await this._rpc('fm_change_pin',
                { p_id: id, p_old: oldPin, p_new: newPin }));
        },

        /** 變更暱稱（同時更新 player_saves.nickname，排行榜讀的就是這欄） */
        renameAccount: async function (id, nickname) {
            return this._unwrap(await this._rpc('fm_rename',
                { p_id: id, p_nickname: nickname }));
        },

        /**
         * 啟動時檢查：本機有綁定 id、但這個帳號還沒設定密碼（舊玩家）→ 跳出強制設定視窗。
         * 查不到狀態（離線、SQL 尚未執行）時完全不打擾，不能因為伺服器問題擋住玩家。
         * @returns {Promise<boolean>} 是否有跳出視窗
         */
        promptPinSetupIfNeeded: async function () {
            const id = this.getCurrentId();
            if (!id || !window.CloudSaveDialog) return false;
            const st = await this.getAccountStatus(id);
            if (!st || st.has_pin) return false;
            window.CloudSaveDialog.show({
                mode: 'migrate',
                onSuccess: () => {
                    if (window.ScoreManager && window.ScoreManager.updateProfileUI) {
                        window.ScoreManager.updateProfileUI(window.ScoreManager.loadPlayerData());
                    }
                }
            });
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
        /**
         * 讀取雲端存檔，並明確區分三種結果。
         *
         * ⚠️ 為什麼不能沿用舊的 loadGameFromCloud（已移除）：
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

            // 本機有「尚未上傳」的進度（離線期間玩的，或註冊後第一次存檔沒成功）：
            // 這時絕不能直接以雲端為準，否則離線玩的內容會被舊資料蓋掉。
            const dirty = this.isCloudDirty();

            if (!res.found && dirty) {
                console.warn('[雲端] 雲端還沒有這個帳號的存檔，但本機有尚未上傳的進度，改為補傳:', currentId);
                this.flushPending();
                return false;
            }

            if (!res.found) {
                console.warn('[雲端] 查無此帳號（可能已被重置），依雲端優先原則清空本機:', currentId);
                if (window.ScoreManager && typeof window.ScoreManager.resetAll === 'function') {
                    window.ScoreManager.resetAll({ cloud: false, keepId: true });
                }
                return false;
            }

            if (dirty && window.ScoreManager) {
                // 本機有離線進度，與雲端比較誰比較新。總積分只增不減，拿它當判準：
                // 本機 >= 雲端 → 本機是最新的，補傳；本機 < 雲端 → 別台裝置玩得更多，以雲端為準
                // （此時下面的 applyCloudDataToLocal 會一併清掉 dirty 旗標）。
                // ⚠️ 這是粗略的二選一，不是欄位合併：兩台裝置都離線各玩各的，較少的那邊會被取代。
                const localScore = Number((window.ScoreManager.loadPlayerData() || {}).totalScore) || 0;
                const cloudScore = Number(res.data && res.data.total_score) || 0;
                if (localScore >= cloudScore) {
                    console.warn('[雲端] 本機有離線期間的進度（' + localScore + ' ≥ 雲端 ' + cloudScore + '），改為補傳');
                    this.flushPending();
                    return false;
                }
                console.warn('[雲端] 雲端進度較新（' + cloudScore + ' > 本機 ' + localScore + '），以雲端為準');
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

        // 隨機取得一位詩人名字（註冊畫面的暱稱預設值；暱稱要全站唯一，撞名時玩家自己改）
        //
        // 已移除的舊函式：generateRandomSuffix（產生引繼碼後綴）、checkIdExists、
        // loadGameFromCloud、updateNicknameOnly —— 引繼碼制度已由「暱稱＋密碼」取代，
        // 讀取存檔統一用 fetchSave，改名統一用 renameAccount（見上方「帳號」一節）。
        getRandomAuthorName: function () {
            return DEFAULT_AUTHORS[Math.floor(Math.random() * DEFAULT_AUTHORS.length)];
        },

        /**
         * 將本地資料上傳至雲端覆蓋。
         * 成功 → 清掉「尚未上傳」旗標；因為連不上而失敗 → 標記旗標，等連線後補傳（見 flushPending）。
         * 沒綁定帳號時什麼都不做（沒有帳號就沒有東西需要補傳）。
         */
        saveGameToCloud: async function (localData) {
            if (!this.getCurrentId()) return false;
            this._lastSaveNetErr = false;
            const ok = await this._saveGameToCloudRaw(localData);
            if (ok) this.markCloudDirty(false);
            else if (this._lastSaveNetErr) this.markCloudDirty(true);
            return ok;
        },

        _saveGameToCloudRaw: async function (localData) {
            if (!this.init()) { this._lastSaveNetErr = true; return false; }
            const currentId = localStorage.getItem('flower_moon_id');
            if (!currentId) return false;

            // 顯示用暱稱：以本機存檔的暱稱為準。
            //
            // ⚠️ 舊寫法是 currentId.split('#')[0]（從引繼碼硬切），會造成
            //    「改暱稱只在當下有效、下一次存檔就被引繼碼的前半段蓋回去」。
            //    新制 id 不再含暱稱（改名後兩者本來就會不同），所以改讀本機暱稱；
            //    本機還是預設的「訪客」時，才退回舊 id 的前半段（舊玩家的過渡）。
            const legacyName = currentId.indexOf('#') > 0 ? currentId.split('#')[0] : '';
            const nickname = (localData.nickname && localData.nickname !== '訪客')
                ? localData.nickname
                : (legacyName || '訪客');

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

            // ── 文位（青雲梯課程進度＋考試通過紀錄）──────────────────────
            // ⚠️ 為什麼要把算好的文位一起上雲，而不是讓群英榜自己算：
            //    群英榜的「文位榜」原本是撈 200 列玩家存檔（含 collection 與
            //    achievements._levelCleared 兩個大欄位）回前端逐一重算再排序。
            //    ① 資料庫端只能依 total_score 排序，一旦玩家數超過 200，
            //       「積分低但文位高」的人會在資料庫端就被截掉；
            //    ② 每次刷新都要傳回近千個關卡編號，量隨玩家數線性成長。
            //    把 rank_index（0 起算的文位序號）存成欄位之後，排序與限筆
            //    都能交回資料庫，前端只需要 50 列輕量資料。
            //    rank_name 另外存一份純粹是為了「不必在前端反查名單」，
            //    兩者永遠由同一次計算產生，不會有對不上的可能。
            let rankName = '', rankIndex = -1;
            try {
                if (window.ScoreManager && window.ScoreManager.getEffectiveRank) {
                    rankName = window.ScoreManager.getEffectiveRank(localData) || '';
                    if (window.PathStations && window.PathStations.getAllRankNames) {
                        rankIndex = window.PathStations.getAllRankNames().indexOf(rankName);
                    }
                }
            } catch (e) {
                console.warn('[雲端] 計算文位失敗，本次不上傳文位欄位:', e);
            }

            // 準備上傳的結構
            const payload = {
                id: currentId,
                version: localData.version || '1.2',
                nickname: nickname,
                total_score: localData.totalScore || 0,
                global_rank: localData.globalRank || '書僮',
                rank_name: rankName,
                rank_index: rankIndex,
                streak_days: localData.streakDays || 1,
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

            // ── 選配欄位：資料庫還沒 alter 出來時，剝掉該欄位重存一次 ──────
            // ⚠️ 這個機制原本只服務 collection 一個欄位，現在有四個，因此改成
            //    「看錯誤訊息點名了哪一欄就剝哪一欄，再重試」的迴圈。
            //    絕對不可以一次把四欄全剝掉：那會讓「只缺 rank_index」的資料庫
            //    連 collection（考試通過紀錄、文錢）都停止上雲，而且完全沒有
            //    症狀 —— 玩家要到換裝置還原存檔時才會發現東西不見了。
            const OPTIONAL_COLUMN_DDL = {
                collection:  'alter table player_saves add column if not exists collection jsonb;',
                rank_name:   'alter table player_saves add column if not exists rank_name text;',
                rank_index:  'alter table player_saves add column if not exists rank_index int default -1;',
                streak_days: 'alter table player_saves add column if not exists streak_days int default 1;'
            };
            const optionalCols = Object.keys(OPTIONAL_COLUMN_DDL);

            try {
                for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
                    const { error } = await supabase
                        .from('player_saves')
                        .upsert(payload, { onConflict: 'id' });

                    if (!error) return true;

                    const code = String(error.code || '');
                    const msg = String(error.message || '');
                    const missingCol = (code === '42703' || code === 'PGRST204');
                    if (!missingCol) {
                        this._lastSaveNetErr = this._isNetworkError(error);
                        // 離線時失敗是預期中的事，用警告而不是錯誤，免得主控台一片紅
                        if (this._lastSaveNetErr) console.warn('[雲端] 目前連不上雲端，進度先存在本機，連線後補傳');
                        else console.error('備份存檔至雲端失敗:', error);
                        return false;
                    }

                    // 錯誤訊息通常會點名欄位；點得出來就只剝那一欄
                    let offending = optionalCols.find(
                        c => Object.prototype.hasOwnProperty.call(payload, c) && msg.indexOf(c) >= 0);

                    // 點不出來（少數 PostgREST 版本只回泛用訊息）→ 剝掉剩下的選配欄位，
                    // 至少保住核心進度；下一次存檔會再從頭試一遍。
                    if (!offending) {
                        const remaining = optionalCols.filter(
                            c => Object.prototype.hasOwnProperty.call(payload, c));
                        if (!remaining.length) {
                            console.error('備份存檔至雲端失敗:', error);
                            return false;
                        }
                        console.warn('[雲端] player_saves 缺少選配欄位（訊息未指名），'
                            + '本次改存舊格式。請執行：\n'
                            + remaining.map(c => OPTIONAL_COLUMN_DDL[c]).join('\n'));
                        remaining.forEach(c => { delete payload[c]; });
                        continue;
                    }

                    console.warn(`[雲端] player_saves 尚無 ${offending} 欄位，本次改存舊格式。`
                        + '請執行：' + OPTIONAL_COLUMN_DDL[offending]);
                    delete payload[offending];
                }
                console.error('備份存檔至雲端失敗：剝除所有選配欄位後仍無法寫入');
                return false;
            } catch (e) {
                this._lastSaveNetErr = this._isNetworkError(e);
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
                // ⚠️⚠️ 這裡原本只刪 game_logs 與 player_saves 兩張表，
                //    造成「重置過的玩家永遠留在群英榜上」：
                //    單遊戲榜、時長榜、積分的日／週／月榜讀的都不是明細，
                //    而是 player_game_stats / player_daily_stats 兩張彙總表
                //    （見 note/群英榜彙總表_SQL草案.sql）。彙總表是獨立資料、
                //    不跟著明細走，明細刪光了它們照樣留著，玩家的名字與分數
                //    就會一直掛在榜上，而且完全沒有錯誤訊息。
                //
                // ⚠️ 刪除順序刻意由「衍生資料」往「主檔」走：
                //    player_saves 最後刪。若先刪主檔而中途失敗，剩下的彙總列
                //    會變成查不到暱稱的孤兒資料，比全部沒刪還難處理。
                //
                // ⚠️ daily_game_stats（全站營運統計）不刪，也不該刪 ——
                //    它不含玩家身分，是整站的每日彙總。
                const targets = [
                    { table: 'game_logs',          col: 'player_id' },
                    { table: 'player_game_stats',  col: 'player_id' },
                    { table: 'player_daily_stats', col: 'player_id' },
                    { table: 'silver_events',      col: 'player_id' }
                ];

                const counts = {};
                for (const t of targets) {
                    const res = await supabase
                        .from(t.table)
                        .delete()
                        .eq(t.col, id)
                        .select(t.col);
                    if (res.error) {
                        // 表還沒建立（SQL 草案尚未執行）時不該讓整個重置失敗：
                        // 那張表本來就沒有這位玩家的資料，跳過即為正確結果。
                        const code = String(res.error.code || '');
                        const msg = String(res.error.message || '');
                        if (code === '42P01' || code === 'PGRST205' || msg.indexOf('does not exist') >= 0) {
                            console.warn(`[雲端] 資料表 ${t.table} 不存在，重置時略過。`);
                            counts[t.table] = 0;
                            continue;
                        }
                        throw res.error;
                    }
                    counts[t.table] = (res.data || []).length;
                }

                const savesRes = await supabase
                    .from('player_saves')
                    .delete()
                    .eq('id', id)
                    .select('id');
                if (savesRes.error) throw savesRes.error;
                counts.player_saves = (savesRes.data || []).length;

                return {
                    ok: true,
                    // saves / logs 兩個欄位維持原名與原意，呼叫端（成就頁的
                    // 測試用重置按鈕）的訊息文字不必跟著改
                    saves: counts.player_saves,
                    logs: counts.game_logs,
                    counts: counts,
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

                // ── 追蹤診斷用：這一局實際出的詩、屬於青雲梯哪一站 ─────────
                // 起因：玩家回報「書僮站玩到將進酒」——查證後發現這是真的，
                // 根因是 getSharedRandomPoem 在 LevelTable.resolve() 找不到
                // 同層候選詩句時，過去會靜默退回「跨全題庫、不看難度層」的隨機
                // 選詩（game22 在 poemType:'七言' 且該站詩詞全為五言時最容易
                // 觸發）；此路徑已在 script.js 修正為直接判定出題失敗，交給
                // launchGame 既有的「自動換遊戲」安全網處理，不會再跨層洩題。
                // game_logs 原本完全沒記錄「這局到底出了哪首詩」，只能事後從
                // player_saves.poem_records 拼湊、且對不到單一局，因此加這兩個
                // 欄位讓每一局都能被獨立稽核（見 note/排行榜彙總表_SQL草案.sql §8）。
                //
                // ⚠️ poem_id 記的是 LevelTable.getLastPoemId()——也就是
                //    getSharedRandomPoem 這次「真正回傳」的詩，不是「這一關
                //    應該出的錨定詩」。兩者正常情況下相同，但只要 resolve()
                //    走到 same-poem／same-cluster 分支改用群內其他詩，就會不同；
                //    要靠它稽核「有沒有出錯題目」，記的必須是實際出的那首。
                let poemId = null;
                let stationName = null;
                if (window.LevelTable && typeof window.LevelTable.getLastPoemId === 'function') {
                    poemId = window.LevelTable.getLastPoemId();
                }
                if (isRanked && window.LearningPath
                    && typeof window.LearningPath.getCurrentStation === 'function') {
                    const st = window.LearningPath.getCurrentStation();
                    stationName = st ? st.name : null;
                }

                const payload = {
                    player_id:    currentId,
                    played_at:    new Date().toISOString(),
                    duration_s:   Math.round(opts.durationS || 0), // 本局遊玩時長（秒）
                    game_no:      opts.gameNo || 0,
                    difficulty:   opts.difficulty || '',
                    score:        opts.score || 0,
                    is_win:       opts.isWin !== false,
                    is_ranked:    isRanked,
                    poem_id:      poemId,
                    station_name: stationName
                };

                await this._sendOrQueue('game_logs', payload);
            } catch (e) {
                console.warn('LOG 寫入失敗:', e);
            }
        },

        /**
         * 寫入 game_logs，欄位不存在時逐一降級重試。
         *
         * ⚠️ 這個保險非常重要：supabase-js 不會 throw，只會把錯誤放在
         *    回傳值裡，所以少了這段，「JS 先上線、SQL 還沒跑」的空窗期
         *    會讓**每一局的 LOG 都靜默寫不進去**，而且外面的 try/catch
         *    完全攔不到。作法比照 saveGameToCloud 對 collection 欄位的處理。
         *
         *    is_ranked／poem_id／station_name 是分次加上去的欄位，資料庫
         *    可能只執行過其中幾支 SQL、也可能同時漏了兩三個，因此改成迴圈
         *    「哪個缺就刪哪個再試」，而不是為每個欄位各寫一段幾乎重複的
         *    if 分支（那樣少加一段判斷，該欄位缺席時就會整局寫不進去）。
         */
        //
        // 回傳 'ok'｜'drop'（資料庫拒收，重送也沒用）｜'retry'（連不上，值得排隊重送）。
        _insertGameLogWithFallback: async function (payload) {
            const OPTIONAL_COLUMNS = ['station_name', 'poem_id', 'is_ranked'];
            let attempt = payload;
            for (let i = 0; i <= OPTIONAL_COLUMNS.length; i++) {
                let error = null;
                try {
                    ({ error } = await supabase.from('game_logs').insert(attempt));
                } catch (e) {
                    error = e;
                }
                if (!error) return 'ok';

                if (this._isNetworkError(error)) return 'retry';

                const code = String(error.code || '');
                const msg = String(error.message || '');
                const isMissingColumn = (code === '42703' || code === 'PGRST204');
                if (!isMissingColumn) {
                    console.warn('LOG 寫入失敗:', msg);
                    return 'drop';
                }
                const missing = OPTIONAL_COLUMNS.find(col => (col in attempt) && msg.indexOf(col) >= 0);
                if (!missing) {
                    console.warn('LOG 寫入失敗（缺少欄位但無法辨識是哪一個）:', msg);
                    return 'drop';
                }
                console.warn('[雲端] game_logs 尚無 ' + missing + ' 欄位，本次改存舊格式。'
                    + '請執行 note/排行榜彙總表_SQL草案.sql 相關章節。');
                attempt = Object.assign({}, attempt);
                delete attempt[missing];
            }
            return 'drop';
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
                // supabase-js 不會 throw，錯誤只會出現在回傳值裡，_insertSimple 會自己檢查。
                // silver_events 尚未建立時會持續告警，正好提醒 SQL 還沒跑；
                // 連不上時則排進佇列，連線後補送（時間戳在這裡就定下，補送不會變成當下）。
                await this._sendOrQueue('silver_events', {
                    player_id:   currentId,
                    occurred_at: new Date().toISOString(),
                    amount:      Math.round(opts.amount),
                    source:      opts.source || 'other',
                    note:        opts.note || null
                });
            } catch (e) {
                console.warn('文錢流水帳寫入失敗:', e);
            }
        }
    };

    window.SupabaseClient = SupabaseClient;

    // 連線一恢復就補傳離線期間的存檔與紀錄。
    // 延後幾秒：剛恢復連線時網路通常還不穩，立刻送容易又失敗一次。
    window.addEventListener('online', function () {
        setTimeout(function () { SupabaseClient.flushPending(); }, 2500);
    });

})();
