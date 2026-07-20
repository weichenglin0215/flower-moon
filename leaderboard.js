/**
 * 群英榜（排行榜）面板
 * 沿用 achievement.js 的 overlay/registerOverlayResize 架構
 * 資料來源：
 *   - Supabase player_saves（總分、文位、各遊戲統計、詩詞）
 *   - Supabase game_logs（短期/速通/時長）
 *   - 無雲端綁定 ID 時，僅顯示自己一筆（本地 ScoreManager 資料）
 */
(function () {
    'use strict';

    // 文化包裝詞彙（依企劃書 §7）
    const POETIC_TERMS = {
        leaderboard: '群英榜',
        top: '十傑詩榜',
        rank1: '狀元', rank2: '榜眼', rank3: '探花'
    };

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
            // 預設打開「綜合 → 總分排行 → 總榜」
            this.switchTab('lb-panel-overall');
            this.currentSubBoard = 'totalScore';
            this.currentTimeSlice = 'all';
            this.refresh();
        },

        hide: function () {
            if (this.overlay) this.overlay.classList.add('hidden');
            document.body.classList.remove('overlay-active');
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
                        <div class="lb-tab active" data-target="lb-panel-overall">綜合</div>
                        <div class="lb-tab" data-target="lb-panel-game">單遊戲</div>
                        <div class="lb-tab" data-target="lb-panel-diff">難度</div>
                        <div class="lb-tab" data-target="lb-panel-poem">詩詞</div>
                        <div class="lb-tab" data-target="lb-panel-time">時長</div>
                        <div class="lb-tab" data-target="lb-panel-short">短期</div>
                    </div>
                    <div class="lb-body">
                        <!-- 綜合 -->
                        <div class="lb-panel active" id="lb-panel-overall">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbOverallSelect">
                                    <option value="totalScore">總分排行</option>
                                    <option value="rankHall">階級殿堂榜</option>
                                </select>
                                <div class="lb-time-switch" id="lbTimeSwitch">
                                    <span class="lb-pill active" data-slice="all">總榜</span>
                                    <span class="lb-pill" data-slice="month">本月</span>
                                    <span class="lb-pill" data-slice="week">本週</span>
                                    <span class="lb-pill" data-slice="day">今日</span>
                                </div>
                                <label class="lb-stealth"><input type="checkbox" id="lbStealth"> 我隱身</label>
                            </div>
                            <div class="lb-content" id="lbOverallContent"></div>
                        </div>
                        <!-- 單遊戲 -->
                        <div class="lb-panel" id="lb-panel-game">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbGameSelect"></select>
                                <select class="lb-select" id="lbDiffSelect"></select>
                                <select class="lb-select" id="lbGameSubSelect">
                                    <option value="highScore">單局最高分</option>
                                    <option value="speedrun">速通榜</option>
                                    <option value="playCount">累計通關</option>
                                </select>
                            </div>
                            <div class="lb-content" id="lbGameContent"></div>
                        </div>
                        <!-- 難度 -->
                        <div class="lb-panel" id="lb-panel-diff">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbDiffSubSelect">
                                    <option value="phd">研究所征服榜</option>
                                    <option value="fullDiff">滿級分制霸榜</option>
                                </select>
                            </div>
                            <div class="lb-content" id="lbDiffContent"></div>
                        </div>
                        <!-- 詩詞 -->
                        <div class="lb-panel" id="lb-panel-poem">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbPoemSubSelect">
                                    <option value="collector">詩詞蒐藏家</option>
                                    <option value="author">詩仙詩聖榜</option>
                                </select>
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
                        <!-- 短期 -->
                        <div class="lb-panel" id="lb-panel-short">
                            <div class="lb-toolbar">
                                <select class="lb-select" id="lbShortSubSelect">
                                    <option value="day">每日榜</option>
                                    <option value="week">本週榜</option>
                                    <option value="month">本月榜</option>
                                </select>
                            </div>
                            <div class="lb-content" id="lbShortContent"></div>
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
            try {
                const stealth = localStorage.getItem(STORAGE_STEALTH) === '1';
                overlay.querySelector('#lbStealth').checked = stealth;
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
            wire('lbOverallSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });
            wire('lbGameSelect',    e => { self.currentGameKey = e.target.value; self.refresh(); });
            wire('lbDiffSelect',    e => { self.currentDifficulty = e.target.value; self.refresh(); });
            wire('lbGameSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });
            wire('lbDiffSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });
            wire('lbPoemSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });
            wire('lbTimeSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });
            wire('lbShortSubSelect', e => { self.currentSubBoard = e.target.value; self.refresh(); });

            // 隱身開關
            const stealth = this.overlay.querySelector('#lbStealth');
            if (stealth) {
                stealth.addEventListener('change', () => {
                    try { localStorage.setItem(STORAGE_STEALTH, stealth.checked ? '1' : '0'); }
                    catch (e) { /* ignore */ }
                    self.refresh();
                });
            }

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
            // 同步當前子排行
            const map = {
                'lb-panel-overall': () => this.overlay.querySelector('#lbOverallSelect').value,
                'lb-panel-game':    () => this.overlay.querySelector('#lbGameSubSelect').value,
                'lb-panel-diff':    () => this.overlay.querySelector('#lbDiffSubSelect').value,
                'lb-panel-poem':    () => this.overlay.querySelector('#lbPoemSubSelect').value,
                'lb-panel-time':    () => this.overlay.querySelector('#lbTimeSubSelect').value,
                'lb-panel-short':   () => this.overlay.querySelector('#lbShortSubSelect').value
            };
            if (map[targetId]) this.currentSubBoard = map[targetId]();
            this.currentPanel = targetId;
        },

        /** 主刷新：判斷當前面板，呼叫對應載入函式 */
        refresh: async function () {
            const panel = this.currentPanel || 'lb-panel-overall';
            const contentId = {
                'lb-panel-overall': 'lbOverallContent',
                'lb-panel-game':    'lbGameContent',
                'lb-panel-diff':    'lbDiffContent',
                'lb-panel-poem':    'lbPoemContent',
                'lb-panel-time':    'lbTimeContent',
                'lb-panel-short':   'lbShortContent'
            }[panel];
            const el = this.overlay.querySelector('#' + contentId);
            if (!el) return;
            el.innerHTML = '<div class="lb-loading">⌛ 拾取榜單中…</div>';

            try {
                let rows = [];
                let valueLabel = '分';
                let extractor = null;  // (row) => display value

                if (panel === 'lb-panel-overall') {
                    if (this.currentSubBoard === 'totalScore') {
                        rows = await this.fetchPlayers('total_score');
                        valueLabel = '總分';
                    } else {
                        rows = await this.fetchPlayers('total_score');
                        valueLabel = '階級';
                        extractor = r => r.global_rank || this.calcRank(r.total_score);
                    }
                } else if (panel === 'lb-panel-game') {
                    rows = await this.fetchGameBoard(this.currentSubBoard, this.currentGameKey, this.currentDifficulty);
                    valueLabel = this.currentSubBoard === 'speedrun' ? '時間' : '分';
                } else if (panel === 'lb-panel-diff') {
                    rows = await this.fetchDiffBoard(this.currentSubBoard);
                    valueLabel = this.currentSubBoard === 'phd' ? '研究所通關' : '滿級制霸';
                } else if (panel === 'lb-panel-poem') {
                    rows = await this.fetchPoemBoard(this.currentSubBoard);
                    valueLabel = this.currentSubBoard === 'collector' ? '蒐詩數' : '覆蓋率';
                } else if (panel === 'lb-panel-time') {
                    rows = await this.fetchTimeBoard(this.currentSubBoard);
                    valueLabel = this.currentSubBoard === 'streak' ? '連續日' : '時長';
                } else if (panel === 'lb-panel-short') {
                    rows = await this.fetchShortBoard(this.currentSubBoard);
                    valueLabel = '本期分數';
                }

                this.renderList(el, rows, valueLabel, extractor);
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
            const { data, error } = await sb.from('player_saves')
                .select('id,nickname,total_score,global_rank,play_days,games,difficulty_counts,poem_records,updated_at')
                .order(orderField, { ascending: false })
                .limit(50);
            if (error) throw error;
            this.cache[cacheKey] = { ts: Date.now(), data: data || [] };
            return data || [];
        },

        /** 短期榜：依日/週/月區間從 game_logs 加總 */
        fetchShortBoard: async function (slice) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();
            const since = this.sliceSince(slice);
            const cacheKey = 'short_' + slice;
            if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                return this.cache[cacheKey].data;
            }
            const { data, error } = await sb.from('game_logs')
                .select('player_id,score')
                .gte('played_at', since.toISOString());
            if (error) throw error;
            const map = {};
            (data || []).forEach(r => {
                map[r.player_id] = (map[r.player_id] || 0) + (r.score || 0);
            });
            const rows = Object.keys(map).map(pid => ({
                id: pid,
                nickname: (pid.split('#')[0] || pid),
                total_score: map[pid]
            })).sort((a, b) => b.total_score - a.total_score).slice(0, 50);
            this.cache[cacheKey] = { ts: Date.now(), data: rows };
            return rows;
        },

        /** 單遊戲榜：分高分 / 速通 / 累計通關 */
        fetchGameBoard: async function (sub, gameKey, difficulty) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();
            const gameNo = parseInt(gameKey.replace('game', ''), 10) || 0;
            if (sub === 'highScore' || sub === 'speedrun') {
                const cacheKey = 'gb_' + sub + '_' + gameKey + '_' + difficulty;
                if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                    return this.cache[cacheKey].data;
                }
                const orderField = (sub === 'highScore') ? 'score' : 'duration_s';
                const ascending = (sub === 'speedrun');
                const { data, error } = await sb.from('game_logs')
                    .select('player_id,score,duration_s')
                    .eq('game_no', gameNo)
                    .eq('difficulty', difficulty)
                    .eq('is_win', true)
                    .order(orderField, { ascending })
                    .limit(200);
                if (error) throw error;
                // 每位玩家只取最佳一筆
                const seen = {};
                const rows = [];
                (data || []).forEach(r => {
                    if (seen[r.player_id]) return;
                    seen[r.player_id] = 1;
                    rows.push({
                        id: r.player_id,
                        nickname: r.player_id.split('#')[0] || r.player_id,
                        total_score: (sub === 'speedrun') ? r.duration_s : r.score,
                        _isTime: sub === 'speedrun'
                    });
                    if (rows.length >= 50) return;
                });
                this.cache[cacheKey] = { ts: Date.now(), data: rows };
                return rows;
            } else {
                // 累計通關次數：從 player_saves.games[gameKey].playCount 排序
                const players = await this.fetchPlayers('total_score');
                return players.map(p => ({
                    id: p.id, nickname: p.nickname,
                    total_score: (p.games && p.games[gameKey]) ? (p.games[gameKey].playCount || 0) : 0,
                    global_rank: p.global_rank
                })).filter(r => r.total_score > 0)
                  .sort((a, b) => b.total_score - a.total_score).slice(0, 50);
            }
        },

        fetchDiffBoard: async function (sub) {
            const players = await this.fetchPlayers('total_score');
            if (sub === 'phd') {
                return players.map(p => ({
                    id: p.id, nickname: p.nickname, global_rank: p.global_rank,
                    total_score: (p.difficulty_counts && p.difficulty_counts['研究所']) || 0
                })).filter(r => r.total_score > 0)
                  .sort((a, b) => b.total_score - a.total_score).slice(0, 50);
            }
            // fullDiff: 計算「五難度都有 highScore」的遊戲數
            return players.map(p => {
                let cnt = 0;
                const gs = p.games || {};
                Object.keys(gs).forEach(gk => {
                    const bd = gs[gk] && gs[gk].byDifficulty;
                    if (!bd) return;
                    const ok = DIFFICULTIES.every(d => bd[d] && bd[d].highScore > 0);
                    if (ok) cnt++;
                });
                return {
                    id: p.id, nickname: p.nickname, global_rank: p.global_rank,
                    total_score: cnt
                };
            }).filter(r => r.total_score > 0)
              .sort((a, b) => b.total_score - a.total_score).slice(0, 50);
        },

        fetchPoemBoard: async function (sub) {
            const players = await this.fetchPlayers('total_score');
            if (sub === 'collector') {
                const totalPoems = (window.POEMS && window.POEMS.length) || 100;
                return players.map(p => {
                    const cnt = p.poem_records ? Object.keys(p.poem_records).length : 0;
                    return {
                        id: p.id, nickname: p.nickname, global_rank: p.global_rank,
                        total_score: cnt, sub: '/ ' + totalPoems + ' 首'
                    };
                }).filter(r => r.total_score > 0)
                  .sort((a, b) => b.total_score - a.total_score).slice(0, 50);
            }
            // 詩仙詩聖：簡化版，顯示蒐藏比率（待 POEMS 表內含 author）
            return players.map(p => ({
                id: p.id, nickname: p.nickname, global_rank: p.global_rank,
                total_score: p.poem_records ? Object.keys(p.poem_records).length : 0
            })).sort((a, b) => b.total_score - a.total_score).slice(0, 50);
        },

        fetchTimeBoard: async function (sub) {
            const sb = this.getSupabase();
            if (!sb) return this.fallbackSinglePlayer();
            if (sub === 'totalTime') {
                const cacheKey = 'totalTime';
                if (this.cache[cacheKey] && (Date.now() - this.cache[cacheKey].ts < 60_000)) {
                    return this.cache[cacheKey].data;
                }
                const { data, error } = await sb.from('game_logs')
                    .select('player_id,duration_s');
                if (error) throw error;
                const map = {};
                (data || []).forEach(r => {
                    map[r.player_id] = (map[r.player_id] || 0) + (r.duration_s || 0);
                });
                const rows = Object.keys(map).map(pid => ({
                    id: pid,
                    nickname: pid.split('#')[0] || pid,
                    total_score: map[pid],
                    _isTime: true
                })).sort((a, b) => b.total_score - a.total_score).slice(0, 50);
                this.cache[cacheKey] = { ts: Date.now(), data: rows };
                return rows;
            }
            // streak：暫無欄位，回傳本地玩家自身
            return this.fallbackSinglePlayer();
        },

        sliceSince: function (slice) {
            const now = new Date();
            const d = new Date(now);
            if (slice === 'day') d.setHours(0, 0, 0, 0);
            else if (slice === 'week') {
                const dow = d.getDay() || 7;
                d.setDate(d.getDate() - (dow - 1));
                d.setHours(0, 0, 0, 0);
            } else if (slice === 'month') {
                d.setDate(1); d.setHours(0, 0, 0, 0);
            } else {
                d.setFullYear(1970, 0, 1); d.setHours(0, 0, 0, 0);
            }
            return d;
        },

        /** 無雲端綁定或查詢失敗時，至少把自己列出來 */
        fallbackSinglePlayer: function () {
            if (!window.ScoreManager) return [];
            const data = window.ScoreManager.loadPlayerData();
            return [{
                id: this.getMyId() || 'me',
                nickname: data.nickname || '訪客',
                total_score: data.totalScore || 0,
                global_rank: data.globalRank || '書僮',
                _isMe: true
            }];
        },

        calcRank: function (score) {
            if (window.ScoreManager) return window.ScoreManager.getCurrentRank(score || 0);
            return '書僮';
        },

        /* -----------------------------
         * 渲染
         * ----------------------------- */

        renderList: function (el, rows, valueLabel, extractor) {
            if (!rows || rows.length === 0) {
                el.innerHTML = '<div class="lb-empty">尚無紀錄。<br>玩幾局詩詞遊戲就會出現你的身影。</div>';
                return;
            }
            const myId = this.getMyId();
            const stealth = this.isStealth();

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
                html += '<div class="lb-mybox">' +
                    '<div class="lb-mybox-row">' +
                      '<span class="lb-mybox-rank">#' + (myIndex + 1) + '</span>' +
                      '<span>' + this.esc(myRow.nickname) + '</span>' +
                      '<span>' + this.formatValue(extractor ? extractor(myRow) : myRow.total_score, myRow) + '</span>' +
                    '</div>' +
                    (prev ? ('<div class="lb-mybox-hint">再得 ' + this.fmtNum(gap) +
                        ' 分即可超越 ' + this.esc(prev.nickname) + '，晉升第 ' + myIndex + ' 名。</div>') :
                        '<div class="lb-mybox-hint">已是榜首，獨佔鰲頭。</div>') +
                    '</div>';
            } else if (myId) {
                html += '<div class="lb-mybox">' +
                    '<div class="lb-mybox-row"><span>(尚未上榜)</span></div>' +
                    '<div class="lb-mybox-hint">先玩幾局遊戲累積分數，便會列入榜單。</div>' +
                    '</div>';
            }

            html += '<div class="lb-list">';
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const isMe = (r.id === myId);
                if (isMe && stealth) continue; // 隱身：本人對其他人不顯示。對自己仍由 mybox 顯示
                const medal = (i === 0) ? '🥇' : (i === 1) ? '🥈' : (i === 2) ? '🥉' : '';
                const klass = 'lb-item' + (i < 3 ? ' top' + (i + 1) : '') + (isMe ? ' me' : '');
                const valDisp = this.formatValue(extractor ? extractor(r) : r.total_score, r);
                html += '<div class="' + klass + '">' +
                    '<span class="lb-rank">#' + (i + 1) + '</span>' +
                    (medal ? '<span class="lb-medal">' + medal + '</span>' : '') +
                    '<span class="lb-nick">' + this.esc(r.nickname || '訪客') +
                        (r.global_rank ? '<span class="lb-rank-tag"> ' + this.esc(r.global_rank) + '</span>' : '') +
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
