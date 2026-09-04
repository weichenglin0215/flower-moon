/**
 * 群英榜（排行榜）面板
 * 沿用 achievement.js 的 overlay/registerOverlayResize 架構
 * 資料來源：
 *   - Supabase player_saves（總分、文位、各遊戲統計、詩詞）
 *   - Supabase RPC（短期／單遊戲／時長三張榜）：
 *       get_short_board / get_game_board / get_time_board
 *     背後讀的是彙總表 player_daily_stats 與 player_game_stats，
 *     而**不是** game_logs 明細（見 note/排行榜彙總表_SQL草案.sql）。
 *   - 無雲端綁定 ID 時，僅顯示自己一筆（本地 ScoreManager 資料）
 *
 * ⚠️ 為什麼不再直接查 game_logs：
 *    ① game_logs 有 90 天保留期，明細會被清掉，歷史排名會跟著消失；
 *    ② PostgREST 預設一次只回 1000 列，舊版「撈全表再用 JS 加總」的寫法
 *       在資料量超過 1000 局之後就一直在靜默算錯。
 *    RPC 一律在資料庫端加總、排序、限筆後才回傳，兩個問題一次解決。
 */
(function () {
    'use strict';

    // 遊戲名稱對照
    const GAME_NAMES = {
        game1: '慢思快選', game2: '飛花令', game3: '字爬梯', game4: '眾裡尋他千百度',
        game5: '詩詞小精靈', game6: '詩陣侵略', game7: '青鳥雲梯', game8: '一筆裁詩',
        game9: '詩韻鎖扣', game10: '擊石鳴詩', game11: '翻墨識蹤', game12: '疏影橫斜',
        game13: '人事時地', game14: '步步驚心', game15: '墨韻游龍', game16: '打地詩',
        game17: '青蛙過河', game19: '詩碟狂襲', game20: '丟三落一', game21: '橫批成詩',
        game22: '詩詞拼圖', game23: '縱橫集句', game24: '三字成珠', game25: '連珠拾字',
        game26: '投珠破句', game27: '詩磚壘塔', game28: '兩心相印', game29: '字龍盤環',
        game30: '層巒疊翠', game31: '詩眼覓蹤', game32: '尋詩地圖', game33: '作者是誰',
        game34: '猜猜詩題', game35: '詩人心情', game37: '步步為陣'
    };

    const DIFFICULTIES = ['小學', '中學', '高中', '大學', '研究所'];
    const STORAGE_STEALTH = 'fm_leaderboard_stealth';

    const LeaderboardDialog = {
        overlay: null,
        cache: {},          // 簡易結果快取，避免反覆查 Supabase
        currentTimeSlice: 'all',
        currentSubBoard: 'totalScore',
        currentGameKey: 'game1',
        currentDifficulty: '小學',

        init: function () {
            if (this.overlay) return;
            if (!document.getElementById('leaderboard-css')) {
                const link = document.createElement('link');
                link.id = 'leaderboard-css';
                link.rel = 'stylesheet';
                link.href = 'leaderboard.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.bindEvents();
        },

        show: function () {
            this.init();
            this.closePeerDialogs();
            document.body.classList.add('overlay-active');
            this.overlay.classList.remove('hidden');
            // 預設打開「文位榜」——新規則下文位才是玩家的身分，積分只是統計
            this.currentTimeSlice = 'all';
            this.switchTab('lb-panel-rank');
            this.refresh();
        },

        hide: function () {
            if (this.overlay) this.overlay.classList.add('hidden');
            document.body.classList.remove('overlay-active');
            // ⚠️ 關閉時清空快取。快取只有「60 秒內不重查」這一條規則，沒有任何
            //    失效點，於是會出現這個情境：玩家看了榜 → 關掉 → 去打一局
            //    （分數已經寫進雲端）→ 回來看榜，卻還是剛才那份舊資料，
            //    自己的新分數沒出現，像是這一局沒被記錄。
            //    「重新打開群英榜」是玩家心目中最自然的重新整理動作，
            //    在這裡清掉最符合直覺，也不必為此加一顆重新整理按鈕。
            this.cache = {};
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.className = 'lb-overlay hidden';
            overlay.innerHTML = `
                <div class="lb-container" id="lbContainer" role="dialog" aria-modal="true">
                    <div class="lb-header">
                        <div class="lb-title">群英榜</div>
                        <div class="lb-close-btn" id="lbCloseBtn">✕</div>
                    </div>
                    <div class="lb-tabs">
                        <div class="lb-tab active" data-target="lb-panel-rank">文位</div>
                        <div class="lb-tab" data-target="lb-panel-score">積分</div>
                        <div class="lb-tab" data-target="lb-panel-game">單遊戲</div>
                        <div class="lb-tab" data-target="lb-panel-poem">詩詞</div>
                        <div class="lb-tab" data-target="lb-panel-time">時長</div>
                    </div>
                    <div class="lb-body">
                        <!-- 文位 —— 以青雲梯課程進度與考試通過紀錄判定，與積分無關。
                             刻意不做總榜／本月／本週／今日的時間切片：文位是「一路累積、
                             只增不減」的身分，本來就沒有「本週的文位」這種東西，
                             切了只會得到四張一模一樣的榜。 -->
                        <div class="lb-panel active" id="lb-panel-rank">
                            <div class="lb-toolbar">
                                <div class="lb-board-title">文位榜（依青雲梯進度與考試）</div>
                                <label class="lb-stealth"><input type="checkbox" class="lb-stealth-chk"> 我隱身</label>
                            </div>
                            <div class="lb-content" id="lbRankContent"></div>
                        </div>
                        <!-- 積分 —— 原「綜合／總分排行」。
                             時間切片（總榜／本月／本週／今日）搬到這裡，同時取代了
                             原本獨立的「短期」分頁：那個分頁的日／週／月榜與這四顆
                             pill 是同一份資料的兩個入口，留兩處只會讓玩家困惑。 -->
                        <div class="lb-panel" id="lb-panel-score">
                            <div class="lb-toolbar">
                                <div class="lb-time-switch" id="lbTimeSwitch">
                                    <span class="lb-pill active" data-slice="all">總榜</span>
                                    <span class="lb-pill" data-slice="month">本月</span>
                                    <span class="lb-pill" data-slice="week">本週</span>
                                    <span class="lb-pill" data-slice="day">今日</span>
                                </div>
                                <label class="lb-stealth"><input type="checkbox" class="lb-stealth-chk"> 我隱身</label>
                            </div>
                            <div class="lb-content" id="lbScoreContent"></div>
                        </div>
                        <!-- 單遊戲 -->
                        <div class="lb-panel" id="lb-panel-game">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbGameSelect"></select>
                                <select class="lb-select" id="lbDiffSelect"></select>
                                <!-- 「速通榜」已移除：它撈回來的 best_score / win_count
                                     從來沒有被渲染，畫面上只剩一串秒數，看不出那是哪一局、
                                     幾分過的；而詩詞遊戲比誰按得快，本來也不是這個專案
                                     想鼓勵的行為。 -->
                                <select class="lb-select" id="lbGameSubSelect">
                                    <option value="highScore">單局最高分</option>
                                    <option value="playCount">累計通關</option>
                                </select>
                            </div>
                            <div class="lb-content" id="lbGameContent"></div>
                        </div>
                        <!-- 詩詞 —— 只剩「詩詞蒐藏家」，選單因此改為靜態標題。
                             原本的「詩仙詩聖榜」已移除：它的實作與蒐藏家完全相同
                             （同樣是數 poem_records 的 key 數量），只是少了排除 0 首
                             這道濾網，等於同一張榜掛兩個名字。真正的「依作者統計」
                             需要 poem_records 帶作者維度，資料層沒有那個欄位。 -->
                        <div class="lb-panel" id="lb-panel-poem">
                            <div class="lb-toolbar">
                                <div class="lb-board-title">詩詞蒐藏家</div>
                            </div>
                            <div class="lb-content" id="lbPoemContent"></div>
                        </div>
                        <!-- 時長 -->
                        <div class="lb-panel" id="lb-panel-time">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbTimeSubSelect">
                                    <option value="totalTime">總時長榜</option>
                                    <option value="streak">日日臨池（連續登入）</option>
                                </select>
                            </div>
                            <div class="lb-content" id="lbTimeContent"></div>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(overlay);
            this.overlay = overlay;

            // 填入遊戲與難度選單
            const gSel = overlay.querySelector('#lbGameSelect');
            Object.keys(GAME_NAMES).forEach(k => {
                const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = GAME_NAMES[k];
                gSel.appendChild(opt);
            });
            const dSel = overlay.querySelector('#lbDiffSelect');
            DIFFICULTIES.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d;
                opt.textContent = d;
                dSel.appendChild(opt);
            });

            // 載入隱身狀態
            // ⚠️ 隱身勾選框現在有兩個（文位／積分各一），因為這兩張榜是玩家最
            //    在意「別人看不看得到我」的地方，而分頁一切換就看不到對方的勾選框。
            //    兩個共用同一個 localStorage 旗標，change 時互相同步（見 bindEvents）。
            try {
                const stealth = localStorage.getItem(STORAGE_STEALTH) === '1';
                overlay.querySelectorAll('.lb-stealth-chk').forEach(c => { c.checked = stealth; });
            } catch (e) { /* ignore */ }

            // 跟著 stage resize
            const cont = overlay.querySelector('#lbContainer');
            if (window.registerOverlayResize) {
                window.registerOverlayResize(function (r) {
                    cont.style.width = (500 * 0.96) + 'px';
                    cont.style.height = (850 * 0.96) + 'px';
                    cont.style.left = (r.left + 500 * 0.02 * r.scale) + 'px';
                    cont.style.top = (r.top + 850 * 0.02 * r.scale) + 'px';
                    cont.style.transform = 'scale(' + r.scale + ')';
                    cont.style.transformOrigin = 'top left';
                });
            }
        },

        /**
         * 為任意 overflow:auto 容器加上「拖曳捲動 + 慣性滑行」效果。
         * 邏輯完全抄自 achievement.js 「遊戲紀錄」面板的捲動，包括摩擦係數與權重。
         */
        attachDragScroll: function (el) {
            if (!el || el._fmDragScrollAttached) return;
            el._fmDragScrollAttached = true;

            let isDown = false, startY = 0, scrollTop = 0;
            let velocity = 0, lastY = 0, lastTime = 0;
            let momentumID = null;

            const startInertia = () => {
                const friction = 0.97;
                const step = () => {
                    if (Math.abs(velocity) < 0.1) { cancelAnimationFrame(momentumID); return; }
                    el.scrollTop -= velocity;
                    velocity *= friction;
                    momentumID = requestAnimationFrame(step);
                };
                momentumID = requestAnimationFrame(step);
            };

            el.addEventListener('mousedown', (e) => {
                if (e.target.tagName.toLowerCase() === 'button') return;
                isDown = true;
                el.classList.add('grabbing');
                startY = e.pageY - el.offsetTop;
                scrollTop = el.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.pageY; lastTime = Date.now();
            });
            el.addEventListener('mouseleave', () => {
                if (!isDown) return;
                isDown = false; el.classList.remove('grabbing'); startInertia();
            });
            el.addEventListener('mouseup', () => {
                if (!isDown) return;
                isDown = false; el.classList.remove('grabbing'); startInertia();
            });
            el.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const y = e.pageY - el.offsetTop;
                const walk = (y - startY) * 1.5;
                el.scrollTop = scrollTop - walk;
                const now = Date.now(), dt = now - lastTime;
                if (dt > 0) {
                    const dy = e.pageY - lastY;
                    velocity = dy * 0.8;
                    lastTime = now; lastY = e.pageY;
                }
            });

            el.addEventListener('touchstart', (e) => {
                if (e.target.tagName.toLowerCase() === 'button') return;
                isDown = true;
                startY = e.touches[0].pageY - el.offsetTop;
                scrollTop = el.scrollTop;
                velocity = 0;
                cancelAnimationFrame(momentumID);
                lastY = e.touches[0].pageY; lastTime = Date.now();
            }, { passive: false });
            el.addEventListener('touchmove', (e) => {
                if (!isDown) return;
                const y = e.touches[0].pageY - el.offsetTop;
                const walk = (y - startY) * 1.5;
                el.scrollTop = scrollTop - walk;
                const now = Date.now(), dt = now - lastTime;
                if (dt > 0) {
                    const dy = e.touches[0].pageY - lastY;
                    velocity = dy * 0.8;
                    lastTime = now; lastY = e.touches[0].pageY;
                }
            }, { passive: true });
            el.addEventListener('touchend', () => {
                if (!isDown) return;
                isDown = false; startInertia();
            });
        },

        bindEvents: function () {
            const self = this;
            // 關閉按鈕
            const closeBtn = this.overlay.querySelector('#lbCloseBtn');
            if (closeBtn) closeBtn.addEventListener('click', () => self.hide());

            // 內容區拖曳捲動 + 慣性滑行（抄成就紀錄）
            // 只綁每個分頁裡的 .lb-content，不綁工具列；工具列固定在頂端
            this.overlay.querySelectorAll('.lb-content').forEach(el => self.attachDragScroll(el));

            const tabs = this.overlay.querySelectorAll('.lb-tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    if (window.SoundManager) window.SoundManager.playOpenItem();
                    const targetId = tab.getAttribute('data-target');
                    self.switchTab(targetId);
                    self.refresh();
                });
            });

            // 時間切片 pill
            this.overlay.querySelectorAll('#lbTimeSwitch .lb-pill').forEach(p => {
                p.addEventListener('click', () => {
                    this.overlay.querySelectorAll('#lbTimeSwitch .lb-pill')
                        .forEach(x => x.classList.remove('active'));
                    p.classList.add('active');
                    self.currentTimeSlice = p.getAttribute('data-slice');
                    self.refresh();
                });
            });

            // 各下拉選單
            const wire = (id, cb) => {
                const el = this.overlay.querySelector('#' + id);
                if (el) el.addEventListener('change', cb);
            };
            wire('lbGameSelect',    e => { self.currentGameKey = e.target.value; self.refresh(); });
            wire('lbDiffSelect',    e => { self.currentDifficulty = e.target.value; self.refresh(); });
            wire('lbGameSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });
            wire('lbTimeSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });

            // 隱身開關（文位／積分兩張榜各一個，共用同一個旗標，change 時互相同步）
            this.overlay.querySelectorAll('.lb-stealth-chk').forEach(chk => {
                chk.addEventListener('change', () => {
                    const on = chk.checked;
                    try { localStorage.setItem(STORAGE_STEALTH, on ? '1' : '0'); }
                    catch (e) { /* ignore */ }
                    self.overlay.querySelectorAll('.lb-stealth-chk')
                        .forEach(other => { other.checked = on; });
                    self.refresh();
                });
            });

            // 僅右上 X 可關閉；不再支援點背景關閉
        },

        /** 開啟前關掉其他三個對話框（成就、收集、名人列傳） */
        closePeerDialogs: function () {
            try {
                if (window.AchievementDialog && window.AchievementDialog.overlay &&
                    !window.AchievementDialog.overlay.classList.contains('hidden')) {
                    window.AchievementDialog.hide();
                }
                if (window.CollectionDialog && window.CollectionDialog.overlay &&
                    !window.CollectionDialog.overlay.classList.contains('hidden')) {
                    window.CollectionDialog.hide();
                }
                const ab = document.getElementById('authorBioPage');
                if (window.AuthorBio && ab && !ab.classList.contains('hidden')) {
                    window.AuthorBio.hide();
                }
            } catch (e) { /* ignore */ }
        },

        switchTab: function (targetId) {
            this.overlay.querySelectorAll('.lb-tab').forEach(t => {
                t.classList.toggle('active', t.getAttribute('data-target') === targetId);
            });
            this.overlay.querySelectorAll('.lb-panel').forEach(p => {
                p.classList.toggle('active', p.id === targetId);
            });
            // 同步當前子排行；文位與詩詞兩張榜沒有子選單，直接給固定值
            const map = {
                'lb-panel-rank':  () => 'rank',
                'lb-panel-score': () => 'totalScore',
                'lb-panel-game':  () => this.overlay.querySelector('#lbGameSubSelect').value,
                'lb-panel-poem':  () => 'collector',
                'lb-panel-time':  () => this.overlay.querySelector('#lbTimeSubSelect').value
            };
            if (map[targetId]) this.currentSubBoard = map[targetId]();
            this.currentPanel = targetId;
        },

        /** 主刷新：判斷當前面板，呼叫對應載入函式 */
        refresh: async function () {
            const panel = this.currentPanel || 'lb-panel-rank';
            const contentId = {
                'lb-panel-rank':  'lbRankContent',
                'lb-panel-score': 'lbScoreContent',
                'lb-panel-game':  'lbGameContent',
                'lb-panel-poem':  'lbPoemContent',
                'lb-panel-time':  'lbTimeContent'
            }[panel];
            const el = this.overlay.querySelector('#' + contentId);
            if (!el) return;
            el.innerHTML = '<div class="lb-loading">⌛ 拾取榜單中…</div>';

            try {
                let rows = [];
                let valueLabel = '分';
                let extractor = null;  // (row) => display value

                if (panel === 'lb-panel-rank') {
                    rows = await this.fetchRankBoard();
                    valueLabel = '文位';
                    extractor = r => r._rankName;
                } else if (panel === 'lb-panel-score') {
                    if (this.currentTimeSlice === 'all') {
                        // 總榜看 player_saves.total_score —— 那是含獎狀加分的
                        // 「累積總分」權威值，與成就頁顯示的數字同源。
                        rows = await this.fetchPlayers('total_score');
                        valueLabel = '總分';
                    } else {
                        // 日／週／月改走彙總表 RPC，區間起點由資料庫端以
                        // Asia/Taipei 計算（見 fetchShortBoard 的說明）。
                        rows = await this.fetchShortBoard(this.currentTimeSlice);
                        valueLabel = '本期分數';
                    }
                } else if (panel === 'lb-panel-game') {
                    rows = await this.fetchGameBoard(this.currentSubBoard, this.currentGameKey, this.currentDifficulty);
                    valueLabel = this.currentSubBoard === 'playCount' ? '通關次數' : '單局最高分';
                } else if (panel === 'lb-panel-poem') {
                    rows = await this.fetchPoemBoard();
                    valueLabel = '蒐詩數';
                } else if (panel === 'lb-panel-time') {
                    rows = await this.fetchTimeBoard(this.currentSubBoard);
                    valueLabel = this.currentSubBoard === 'streak' ? '連續登入' : '總時長';
                }

                // 名字旁的文位標籤：文位榜自己的數值就是文位，不必再查一次
                const rankMap = (panel === 'lb-panel-rank') ? {} : await this.fetchRankMap();

                this.renderList(el, rows, valueLabel, extractor, rankMap);
            } catch (err) {
                console.error('[Leaderboard] refresh 失敗', err);
                el.innerHTML = '<div class="lb-empty">榜單讀取失敗，請稍後再試。<br>' +
                    '<span style="font-size:12px;color:#bbb">' + (err.message || err) + '</span></div>';
            }
        },

        /* -----------------------------
         * 資料層：呼叫 Supabase
         * ----------------------------- */

        getSupabase: function () {
            return (window.SupabaseClient && window.SupabaseClient.getClient)
                ? window.SupabaseClient.getClient() : null;
        },

        getMyId: function () {
            try { return localStorage.getItem('flower_moon_id') || ''; } catch (e) { return ''; }
        },

        isStealth: function () {
            try { return localStorage.getItem(STORAGE_STEALTH) === '1'; } catch (e) { return false; }
        },

        /** 取 player_saves 全表並依某欄排序 */
        fetchPlayers: async function (orderField) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();
            const cacheKey = 'players_' + orderField;
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }
            // ⚠️ 刻意不再撈 global_rank / difficulty_counts / games / play_days /
            //    updated_at：
            //      · global_rank 是積分階級，名字旁的小標籤現在改顯示真正的文位
            //        （見 fetchRankMap），留著只會被誤用；
            //      · difficulty_counts 是已移除的「難度榜」專用，雲端該欄位還全是
            //        {}（見 note 的既有問題紀錄），沒有任何榜在讀它了；
            //      · games / play_days / updated_at 從來沒有被渲染過。
            //    這幾個欄位裡 games 最大（每款遊戲各難度的統計），一次撈 50 列
            //    的傳輸量幾乎全來自它。
            const { data, error } = await sb.from('player_saves')
                .select('id,nickname,total_score,poem_records')
                .order(orderField, { ascending: false })
                .limit(50);
            if (error) throw error;
            this.cache[cacheKey] = { ts: Date.now(), data: data || [] };
            return data || [];
        },

        /**
         * 引繼碼 → 文位 的對照表，供所有榜單的「名字旁小標籤」使用。
         *
         * ⚠️⚠️ 這張表存在的理由：小標籤原本顯示的是 r.global_rank，
         *    而那個欄位是**積分階級**（getCurrentRank(totalScore)）。
         *    積分階級與文位的 15 個名稱完全相同（書僮…大儒），只是判準不同，
         *    因此玩家看到「小楊 舉人」時必然理解成文位 —— 等於在群英榜上
         *    公告「刷分就能升文位」，與企劃書 §2 完全相反。
         *
         * ⚠️ 為什麼要獨立一支查詢，而不是讓每張榜自己帶文位：
         *    單遊戲榜、時長榜、積分的日／週／月榜都是走 RPC，回傳欄位由 SQL
         *    決定，前端改不了。與其為此改動四支 RPC（還要重跑 SQL 草案），
         *    不如在前端補一張輕量對照表：只撈 id 與 rank_name 兩欄。
         *
         * ⚠️ rank_name 是 saveGameToCloud 新增的欄位。資料庫還沒 alter 出來、
         *    或玩家自從該版本上線後還沒存過檔時，這裡會拿不到值 ——
         *    此時一律不顯示標籤（回傳空字串），**絕不退回 global_rank**。
         *    寧可少一個標籤，也不要顯示一個意義相反的標籤。
         */
        fetchRankMap: async function () {
            const sb = this.getSupabase();
            if (!sb) return {};
            const cacheKey = 'rankmap';
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }
            const map = {};
            try {
                const { data, error } = await sb.from('player_saves')
                    .select('id,rank_name')
                    .limit(500);
                if (error) throw error;
                (data || []).forEach(r => { if (r.rank_name) map[r.id] = r.rank_name; });
            } catch (e) {
                // 欄位還沒建立（42703 / PGRST204）→ 全站都沒有標籤可顯示，
                // 這是可接受的降級，不是錯誤，所以只留一行提示不中斷渲染。
                console.warn('[Leaderboard] 讀取文位對照表失敗，名字旁的文位標籤本次不顯示。'
                    + '若尚未建立欄位，請執行：'
                    + 'alter table player_saves add column if not exists rank_name text;', e.message || e);
            }
            this.cache[cacheKey] = { ts: Date.now(), data: map };
            return map;
        },

        /**
         * 短期榜：日／週／月區間總分。
         *
         * ⚠️ 改版前是 `select('player_id,score')` 撈明細回前端自己加總，
         *    但那句沒有分頁也沒有 limit，PostgREST 預設只回 1000 列 ——
         *    也就是說資料量一超過 1000 局，這張榜早就在靜默算錯了。
         *    現在改由 get_short_board 在資料庫端加總、排序、限筆後才回傳，
         *    回來的永遠就是正確的前 50 名。
         *
         * ⚠️ 區間起點改由資料庫端以 Asia/Taipei 計算（見 SQL 草案 §5.1），
         *    不再用瀏覽器本地時區推算，跨時區或半夜前後不會再對不上。
         */
        fetchShortBoard: async function (slice) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();

            const cacheKey = 'short_' + slice;
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }

            // p_slice 接受 'day' | 'week' | 'month' | 'all'，
            // 與這裡的 slice（子選單的 value）同名，直接傳即可。
            const { data, error } = await sb.rpc('get_short_board', {
                p_slice: slice || 'day',
                p_limit: 50
            });
            if (error) throw error;

            const rows = (data || []).map(r => ({
                id:          r.player_id,
                // RPC 已 join player_saves，拿得到玩家自訂暱稱，
                // 不必再從引繼碼硬切字串（舊寫法 pid.split('#')[0]）。
                // ⚠️ RPC 也會回 global_rank，但那是積分階級，刻意不接 ——
                //    名字旁的文位標籤統一由 fetchRankMap 提供。
                nickname:    r.nickname,
                total_score: Number(r.total_score) || 0
            }));

            this.cache[cacheKey] = { ts: Date.now(), data: rows };
            return rows;
        },

        /**
         * 單遊戲榜：單局最高分 / 累計通關，兩者共用同一支 RPC。
         *
         * ⚠️ 改版前是「兩套資料源」：高分撈 game_logs 明細，累計通關卻讀
         *    player_saves.games[gameKey].playCount。後者不分難度，跟榜單
         *    標題寫的「某難度」根本對不上（選研究所也是看全難度總和）。
         *    現在兩種全部走 player_game_stats，資料源統一、難度也正確。
         *
         * ⚠️ 高分榜改版前只撈前 200 筆再用 JS 去重取每人最佳，
         *    第 200 名之後的玩家紀錄根本進不了榜。現在由資料庫端直接
         *    對「每人一列」的彙總表排序，不會再漏人。
         */
        fetchGameBoard: async function (sub, gameKey, difficulty) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();

            const gameNo = parseInt(gameKey.replace('game', ''), 10) || 0;
            const cacheKey = 'gb_' + sub + '_' + gameKey + '_' + difficulty;
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }

            // ⚠️ 子選單的 value 是 'playCount'，但 RPC 認得的是 'clearCount'。
            //    兩者名稱不一致，若直接把 'playCount' 傳下去，SQL 的 case 會
            //    落入 else 分支回傳「最高分」——榜單標題寫著累計通關、
            //    數字卻是分數，而且完全不會報錯。這一行就是在擋這件事。
            const mode = (sub === 'playCount') ? 'clearCount' : sub;

            const { data, error } = await sb.rpc('get_game_board', {
                p_game_no:    gameNo,
                p_difficulty: difficulty,
                p_mode:       mode,
                p_limit:      50
            });
            if (error) throw error;

            const rows = (data || []).map(r => ({
                id:          r.player_id,
                nickname:    r.nickname,
                total_score: Number(r.value) || 0,
                // 累計通關榜的數字是「局數」不是分數，不能說「再得 N 分」
                _noScoreGap: (sub === 'playCount')
            }));

            this.cache[cacheKey] = { ts: Date.now(), data: rows };
            return rows;
        },

        /**
         * 文位榜：依玩家目前的文位由高到低排序，排序與限筆都交給資料庫。
         *
         * ⚠️⚠️ 這支函式改過一次，理由要留下來，否則很容易被「簡化」回去：
         *
         *    第一版是「撈 200 列（含 collection 與 achievements._levelCleared
         *    兩個大欄位）回前端，逐一用 LearningPath.getRankFromSave 重算文位，
         *    再前端排序後取 50 名」。它能算出正確的文位，但有兩個硬傷：
         *      ① 資料庫端只能依 total_score 排序（文位是前端才算得出來的），
         *         所以必須先多撈。玩家數一旦超過那個「多撈」的上限，
         *         「積分低但文位高」的玩家就會在資料庫端先被截掉，
         *         而且是靜默的 —— 榜上少了人，畫面不會有任何異狀。
         *      ② 每次刷新都要把近千個關卡編號傳回前端，量隨玩家數線性成長。
         *
         *    現在 saveGameToCloud 會把算好的文位一起寫進 player_saves
         *    （rank_index 為 0 起算的文位序號、rank_name 為名稱），
         *    於是排序與 limit 都能交還給資料庫，前端只收 50 列輕量資料。
         *
         * ⚠️ 過渡期：rank_index 欄位剛加上、或某位玩家自從該版本上線後還沒
         *    存過檔時，那一列的 rank_index 會是 null。這種列會被排到最後
         *    （nullsFirst:false），並在下面用「只針對這些人」的第二次查詢
         *    補算文位 —— 查詢範圍被 .in(id) 限制住，不會退化成第一版的全表重算，
         *    而且會隨著玩家陸續存檔自動消失。
         *
         * ⚠️ 欄位還不存在（資料庫尚未 alter）時整支退回舊路徑，
         *    並在 console 印出該執行的 SQL。
         */
        fetchRankBoard: async function () {
            const sb = this.getSupabase();
            if (!sb) return this.decorateRankRows(this.fallbackSinglePlayer());

            const cacheKey = 'rankboard';
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }

            let rows;
            const { data, error } = await sb.from('player_saves')
                .select('id,nickname,total_score,rank_name,rank_index')
                .order('rank_index', { ascending: false, nullsFirst: false })
                .order('total_score', { ascending: false })
                .limit(50);

            if (error) {
                const code = String(error.code || '');
                if (code === '42703' || code === 'PGRST204') {
                    console.warn('[Leaderboard] player_saves 尚無 rank_index 欄位，'
                        + '文位榜暫時退回前端計算（玩家數超過 200 會漏人）。請執行：\n'
                        + 'alter table player_saves add column if not exists rank_name text;\n'
                        + 'alter table player_saves add column if not exists rank_index int default -1;');
                    rows = await this.fetchRankBoardLegacy();
                    this.cache[cacheKey] = { ts: Date.now(), data: rows };
                    return rows;
                }
                throw error;
            }

            rows = (data || []).map(p => ({
                id: p.id,
                nickname: p.nickname,
                total_score: p.total_score || 0,
                _rankName: p.rank_name || '',
                _rankIdx: (typeof p.rank_index === 'number') ? p.rank_index : -1
            }));

            // 過渡期補算：只針對還沒寫入 rank_index 的那幾列
            const pending = rows.filter(r => r._rankIdx < 0).map(r => r.id);
            if (pending.length) {
                await this.backfillRanks(rows, pending);
                rows.sort((a, b) => (b._rankIdx - a._rankIdx) || (b.total_score - a.total_score));
            }

            rows = this.decorateRankRows(rows);
            this.cache[cacheKey] = { ts: Date.now(), data: rows };
            return rows;
        },

        /** 補算指定玩家的文位（過渡期用，範圍受 .in(id) 限制） */
        backfillRanks: async function (rows, ids) {
            const sb = this.getSupabase();
            const PS = window.PathStations, LP = window.LearningPath;
            if (!sb || !PS || !LP) return;
            try {
                const { data, error } = await sb.from('player_saves')
                    .select('id,collection,achievements')
                    .in('id', ids);
                if (error) throw error;
                const order = PS.getAllRankNames();
                const byId = {};
                (data || []).forEach(r => { byId[r.id] = r; });
                rows.forEach(r => {
                    if (r._rankIdx >= 0 || !byId[r.id]) return;
                    const name = LP.getRankFromSave(byId[r.id]);
                    r._rankName = name;
                    r._rankIdx = order.indexOf(name);
                });
            } catch (e) {
                console.warn('[Leaderboard] 補算文位失敗，該列文位暫以未知顯示:', e.message || e);
            }
        },

        /** rank_index 欄位尚未建立時的退路：撈 200 列回前端重算再排序 */
        fetchRankBoardLegacy: async function () {
            const sb = this.getSupabase();
            const PS = window.PathStations, LP = window.LearningPath;
            const order = (PS && PS.getAllRankNames) ? PS.getAllRankNames() : [];
            const { data, error } = await sb.from('player_saves')
                .select('id,nickname,total_score,collection,achievements')
                .order('total_score', { ascending: false })
                .limit(200);
            if (error) throw error;
            const rows = (data || []).map(p => {
                const name = (LP && LP.getRankFromSave) ? LP.getRankFromSave(p) : (order[0] || '書僮');
                return {
                    id: p.id, nickname: p.nickname, total_score: p.total_score || 0,
                    _rankName: name, _rankIdx: order.indexOf(name)
                };
            }).sort((a, b) => (b._rankIdx - a._rankIdx) || (b.total_score - a.total_score))
              .slice(0, 50);
            return this.decorateRankRows(rows);
        },

        /**
         * 文位榜列的共同收尾：本人的文位一律以本機為準，並補上渲染旗標。
         *
         * ⚠️ 本人為什麼要覆寫：雲端的 rank_name 是「上一次存檔當下」的文位，
         *    玩家剛在青雲梯晉升、還沒觸發存檔就打開群英榜時，雲端仍是舊值。
         *    自己的文位顯示得比實際低，是玩家最直覺會回報成 bug 的情形，
         *    而本機資料一定是最新的，沒有理由不用。
         */
        decorateRankRows: function (rows) {
            const myId = this.getMyId();
            const PS = window.PathStations, SM = window.ScoreManager;
            const order = (PS && PS.getAllRankNames) ? PS.getAllRankNames() : [];
            let myRank = '';
            if (SM && SM.getEffectiveRank) {
                try { myRank = SM.getEffectiveRank(SM.loadPlayerData()) || ''; } catch (e) { /* ignore */ }
            }
            rows.forEach(r => {
                if (myRank && (r.id === myId || r._isMe)) {
                    r._rankName = myRank;
                    r._rankIdx = order.indexOf(myRank);
                }
                // 名字旁的小標籤留空：這張榜的數值欄位本身就是文位，再掛一次只會重複
                r.global_rank = '';
                r._noRankTag = true;
                r._noScoreGap = true;   // 抑制「再得 N 分即可超越」的提示
            });
            return rows.sort((a, b) => (b._rankIdx - a._rankIdx) || (b.total_score - a.total_score));
        },

        /**
         * 詩詞蒐藏家：蒐集到的詩詞首數。
         *
         * ⚠️ 原本還有一個「詩仙詩聖榜」子選項，實作與這張榜完全相同
         *    （都是數 poem_records 的 key 數），只是少了 filter(>0)。
         *    要做成真正的「依作者統計」需要 poem_records 帶作者維度，
         *    資料層沒有那個欄位，因此整個子選項移除而非留著佔位。
         */
        fetchPoemBoard: async function () {
            const players = await this.fetchPlayers('total_score');
            const totalPoems = (window.POEMS && window.POEMS.length) || 100;
            return players.map(p => {
                const cnt = p.poem_records ? Object.keys(p.poem_records).length : 0;
                return {
                    id: p.id, nickname: p.nickname,
                    total_score: cnt, sub: '/ ' + totalPoems + ' 首',
                    _noScoreGap: true
                };
            }).filter(r => r.total_score > 0)
              .sort((a, b) => b.total_score - a.total_score).slice(0, 50);
        },

        /**
         * 總遊玩時長榜。
         *
         * ⚠️ 改版前是 `select('player_id,duration_s')` 撈**整張 game_logs**
         *    再回前端加總，同樣沒有分頁 —— 實際上永遠只拿得到前 1000 列，
         *    這張榜在資料量長大之後就一直是錯的。現在改由資料庫端加總。
         */
        fetchTimeBoard: async function (sub) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();

            if (sub === 'streak') return this.fetchStreakBoard();

            const cacheKey = 'totalTime';
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }

            const { data, error } = await sb.rpc('get_time_board', { p_limit: 50 });
            if (error) throw error;

            const rows = (data || []).map(r => ({
                id:          r.player_id,
                nickname:    r.nickname,
                total_score: Number(r.duration_sum) || 0,
                _isTime:     true
            }));

            this.cache[cacheKey] = { ts: Date.now(), data: rows };
            return rows;
        },

        /**
         * 日日臨池（連續登入天數）榜。
         *
         * ⚠️⚠️ 這張榜上線之後有很長一段時間是**空的**：舊版
         *    `if (sub !== 'totalTime') return this.fallbackSinglePlayer();`
         *    直接把它導向「只顯示自己一個人」的退路，而且畫面上沒有任何
         *    「尚未開放」的說明，玩家選了只會以為全站只有他一個人在玩。
         *    真正的原因是資料層根本沒有這個數字 —— player_saves 只有
         *    play_days（一共來過幾天，只增不減），那不是連續天數。
         *
         *    現在 ScoreManager.loadPlayerData 會維護 streakDays
         *    （接上昨天就 +1，斷一天就歸 1），並由 saveGameToCloud 上傳成
         *    player_saves.streak_days，這張榜才有資料可排。
         *
         * ⚠️ 欄位還沒建立時回傳空陣列，讓 renderList 顯示「尚無紀錄」，
         *    並在 console 印出該執行的 SQL —— 這比顯示一份只有自己的
         *    假榜單誠實得多。
         */
        fetchStreakBoard: async function () {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();

            const cacheKey = 'streak';
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }

            let rows = [];
            const { data, error } = await sb.from('player_saves')
                .select('id,nickname,streak_days')
                .order('streak_days', { ascending: false, nullsFirst: false })
                .limit(50);

            if (error) {
                const code = String(error.code || '');
                if (code === '42703' || code === 'PGRST204') {
                    console.warn('[Leaderboard] player_saves 尚無 streak_days 欄位，'
                        + '「日日臨池」榜暫時無資料。請執行：'
                        + 'alter table player_saves add column if not exists streak_days int default 1;');
                    this.cache[cacheKey] = { ts: Date.now(), data: [] };
                    return [];
                }
                throw error;
            }

            rows = (data || []).map(r => ({
                id: r.id,
                nickname: r.nickname,
                total_score: Number(r.streak_days) || 0,
                sub: '天',
                _noScoreGap: true
            })).filter(r => r.total_score > 0);

            // 本人一律以本機為準：連續天數是在 loadPlayerData 當下才更新的，
            // 今天第一次開遊戲、還沒存過檔時雲端仍是昨天的數字。
            const myId = this.getMyId();
            const me = rows.find(r => r.id === myId);
            if (me && window.ScoreManager) {
                me.total_score = window.ScoreManager.loadPlayerData().streakDays || me.total_score;
                rows.sort((a, b) => b.total_score - a.total_score);
            }

            this.cache[cacheKey] = { ts: Date.now(), data: rows };
            return rows;
        },

        /** 無雲端綁定或查詢失敗時，至少把自己列出來 */
        fallbackSinglePlayer: function () {
            if (!window.ScoreManager) return [];
            const data = window.ScoreManager.loadPlayerData();
            return [{
                id: this.getMyId() || 'me',
                nickname: data.nickname || '訪客',
                total_score: data.totalScore || 0,
                _isMe: true
            }];
        },

        /* -----------------------------
         * 渲染
         * ----------------------------- */

        /**
         * 渲染一張榜。
         *
         * @param {Element}  el         內容容器
         * @param {Array}    rows       榜單資料
         * @param {string}   valueLabel 右欄數值的欄位名稱（「總分」「時長」「文位」…）
         * @param {Function} extractor  自訂取值函式，不給就用 row.total_score
         * @param {Object}   rankMap    引繼碼 → 文位，供名字旁的小標籤使用
         */
        renderList: function (el, rows, valueLabel, extractor, rankMap) {
            if (!rows || rows.length === 0) {
                el.innerHTML = '<div class="lb-empty">尚無紀錄。<br>玩幾局詩詞遊戲就會出現你的身影。</div>';
                return;
            }
            const myId = this.getMyId();
            const stealth = this.isStealth();
            rankMap = rankMap || {};

            // 找我的位置
            let myIndex = -1;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].id === myId) { myIndex = i; break; }
            }
            const myRow = (myIndex >= 0) ? rows[myIndex] : null;

            let html = '';
            // 我的位置 sticky
            if (myRow) {
                const prev = myIndex > 0 ? rows[myIndex - 1] : null;
                const gap = prev ? (prev.total_score - myRow.total_score) : 0;
                // ⚠️ 「再得 N 分即可超越」只在數值本身就是分數的榜上才成立。
                //    文位榜（數值是文位名稱）、詩詞榜（首數）、時長榜（秒數）
                //    套這句話會得到「再得 3 分即可超越」這種不知所云的提示，
                //    因此由資料列自帶 _noScoreGap／_isTime 旗標決定要不要說。
                let hint;
                if (!prev) {
                    hint = '已是榜首，獨佔鰲頭。';
                } else if (myRow._noScoreGap || myRow._isTime) {
                    hint = '再進一步便可超越 ' + this.esc(prev.nickname) + '，晉升第 ' + myIndex + ' 名。';
                } else {
                    hint = '再得 ' + this.fmtNum(gap) + ' 分即可超越 ' +
                        this.esc(prev.nickname) + '，晉升第 ' + myIndex + ' 名。';
                }
                html += '<div class="lb-mybox">' +
                    '<div class="lb-mybox-row">' +
                      '<span class="lb-mybox-rank">#' + (myIndex + 1) + '</span>' +
                      '<span>' + this.esc(myRow.nickname) + '</span>' +
                      '<span>' + this.formatValue(extractor ? extractor(myRow) : myRow.total_score, myRow) + '</span>' +
                    '</div>' +
                    '<div class="lb-mybox-hint">' + hint + '</div>' +
                    '</div>';
            } else if (myId) {
                html += '<div class="lb-mybox">' +
                    '<div class="lb-mybox-row"><span>(尚未上榜)</span></div>' +
                    '<div class="lb-mybox-hint">先玩幾局遊戲累積分數，便會列入榜單。</div>' +
                    '</div>';
            }

            // ── 欄位標題列 ────────────────────────────────────────────────
            // ⚠️ valueLabel 這個參數以前是死的：refresh() 一路算出「總分」
            //    「時長」「蒐詩數」再傳進來，renderList 卻從頭到尾沒有用到它。
            //    於是玩家看到的只是一串「0:12」「12」「1.6萬」，沒有任何說明
            //    那是什麼 —— 時長榜與累計通關榜尤其看不懂。
            html += '<div class="lb-head">' +
                '<span class="lb-head-rank">名次</span>' +
                '<span class="lb-head-nick">玩家</span>' +
                '<span class="lb-head-val">' + this.esc(valueLabel || '') + '</span>' +
                '</div>';

            html += '<div class="lb-list">';
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const isMe = (r.id === myId);
                // ⚠️「我隱身」**刻意**只作用在自己的瀏覽器：旗標存在本機
                //    localStorage，把自己從自己看到的名次列表裡拿掉（自己的成績
                //    仍由上方的 mybox 顯示）。它不是「對其他玩家隱形」——
                //    別人的瀏覽器讀的是他們自己的旗標，照樣看得到你。
                //    這是設計決定，不是 bug：不要為此新增雲端隱身欄位。
                if (isMe && stealth) continue;
                const medal = (i === 0) ? '🥇' : (i === 1) ? '🥈' : (i === 2) ? '🥉' : '';
                const klass = 'lb-item' + (i < 3 ? ' top' + (i + 1) : '') + (isMe ? ' me' : '');
                const valDisp = this.formatValue(extractor ? extractor(r) : r.total_score, r);
                // 名字旁的小標籤：一律取真正的文位（青雲梯進度＋考試），
                // 查不到就不顯示。文位榜自己的數值欄位就是文位，因此不重複掛。
                const tag = r._noRankTag ? '' : (rankMap[r.id] || '');
                html += '<div class="' + klass + '">' +
                    '<span class="lb-rank">#' + (i + 1) + '</span>' +
                    (medal ? '<span class="lb-medal">' + medal + '</span>' : '') +
                    '<span class="lb-nick">' + this.esc(r.nickname || '訪客') +
                        (tag ? '<span class="lb-rank-tag"> ' + this.esc(tag) + '</span>' : '') +
                    '</span>' +
                    '<span class="lb-score">' + valDisp + (r.sub ? ' <span class="lb-sub">' + this.esc(r.sub) + '</span>' : '') + '</span>' +
                    '</div>';
            }
            html += '</div>';

            el.innerHTML = html;
        },

        formatValue: function (v, row) {
            if (typeof v === 'string') return this.esc(v);
            if (row && row._isTime) {
                const s = Math.max(0, parseInt(v, 10) || 0);
                const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
                if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
                return m + ':' + String(ss).padStart(2, '0');
            }
            return this.fmtNum(v);
        },

        fmtNum: function (n) {
            if (typeof n !== 'number') n = parseInt(n, 10) || 0;
            if (n >= 10000) return (Math.floor(n / 1000) / 10).toFixed(1) + '萬';
            return n.toLocaleString();
        },

        esc: function (s) {
            if (s == null) return '';
            return String(s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[c]));
        }
    };

    window.LeaderboardDialog = LeaderboardDialog;
})();
