/* ============================================================================
 * playerCalendar.js —《花月》玩家遊戲日曆
 * ----------------------------------------------------------------------------
 * 對應企劃書：note/玩家遊戲日曆_企劃書.md
 * 資料層依據：note/排行榜彙總表_SQL草案.sql
 *
 * ⭐ 這是什麼
 *   以「月」為單位呈現玩家每天的投入量。每個格子的底色由當日通關局數決定
 *   （1～15 綠 / 16～30 藍 / 31～60 紅 / 61～120 紫 / 121+ 金黃），
 *   點格子看當日明細，下緣顯示本月合計，彈窗上緣的 30px 色條則反映
 *   整個月的累積局數。
 *
 * ⭐ 資料從哪裡來
 *   完全讀自雲端彙總表 player_daily_stats，經由兩支 RPC：
 *     get_player_calendar(player_id, from, to)      → 每一天的數字
 *     get_player_month_summary(player_id, from, to) → 該月合計
 *
 *   ⚠️ 為什麼不讀 game_logs 明細：
 *      game_logs 有 90 天保留期，舊資料會被清掉；player_daily_stats 是永久
 *      保留的彙總，所以日曆可以無限往回滑。這正是排行榜彙總重構的主要目的。
 *
 * ⭐ 分日一律以 Asia/Taipei 為準
 *   資料庫端的 day 欄位是用 Asia/Taipei 分日的（見 SQL 草案 §1.2），
 *   前端若改用瀏覽器本地時區或 UTC 去算「今天是哪一天」，
 *   跨時區或跨半夜就會對不上。因此本檔一律透過 _todayTW() 取得台北日期，
 *   不使用 new Date() 的本地日期欄位。
 *
 * ⭐ 兩種局、兩種文錢
 *   ranked_wins   ＝ 關卡模式（青雲梯／關卡選擇器）＝ 可累積晉升文位的局
 *   practice_wins ＝ 自由練習（漢堡選單挑遊戲）
 *   silver_game   ＝ 玩遊戲賺的文錢（由資料庫 trigger 從分數推算）
 *   silver_bonus  ＝ 獎狀／晉升文位／江南小院賺的文錢（來自 silver_events）
 * ========================================================================== */

(function () {
    'use strict';

    // ── CSS 載入防護（資料類型規範 §3.2）────────────────────────────────
    // 本模組可能被青雲梯動態喚起，不能假設 index.html 一定有 <link>。
    if (!document.getElementById('player-calendar-css')) {
        const link = document.createElement('link');
        link.id = 'player-calendar-css';
        link.rel = 'stylesheet';
        link.href = 'playerCalendar.css';
        document.head.appendChild(link);
    }

    /* ------------------------------------------------------------------
     * 色階門檻
     *
     * ⚠️ 格子與 board-top 共用同一組門檻邏輯：
     *    board-top 的門檻＝格子門檻的每日下限 × 15 天，
     *    也就是「這個月平均每天都達到某個格子色階」。
     *    這是企劃書 §4 創新點 2 的要求 —— 兩者是同一套視覺語言，
     *    改門檻時必須兩邊一起改，不可只動一邊。
     * ------------------------------------------------------------------ */
    const DAY_TIERS = [15, 30, 60, 120];              // 單日：>0→lv1、>15→lv2、>30→lv3、>60→lv4、>120→lv5
    const MONTH_TIERS = [225, 450, 900, 1800];          // 月度：15×15、30×15、60×15、120×15
    const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

    /** 依門檻表算出色階 0～5（0 代表無紀錄） */
    function tierOf(count, tiers) {
        if (!count || count <= 0) return 0;
        let lv = 1;
        for (let i = 0; i < tiers.length; i++) {
            if (count > tiers[i]) lv = i + 2;
        }
        return lv;
    }

    const PlayerCalendar = {

        overlay: null,
        /** 目前顯示的月份（以該月 1 日的台北日期字串為準，如 '2026-08-01'） */
        viewYear: 0,
        viewMonth: 0,   // 1～12
        /** 目前展開明細的日期字串，null 代表沒有展開 */
        selectedDay: null,
        /** 以 'YYYY-MM' 為 key 的月資料快取（比照 leaderboard.js 的 60 秒慣例） */
        cache: {},
        CACHE_TTL: 60000,
        /** 切月的 debounce 計時器：連點箭頭時只查最後一次 */
        _navTimer: null,
        _reqSeq: 0,

        // ══════════════════════════════════════════════════════════════
        //  時間工具（一律台北時區）
        // ══════════════════════════════════════════════════════════════

        /**
         * 取得「台北此刻」的日期字串 YYYY-MM-DD。
         * 用 sv-SE 語系是因為它的日期格式天生就是 YYYY-MM-DD，
         * 不必自己補零，也不受使用者語系影響。
         */
        _todayTW: function () {
            return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
        },

        /**
         * 把 RPC 回傳的 day 欄位正規化成 'YYYY-MM-DD'。
         *
         * ⚠️ 為什麼需要這一層：
         *    前端是拿日期字串當 key 去對格子的（days['2026-08-25']），
         *    只要格式差一點，整個月的格子就會全部對不上而變成一片米白 ——
         *    而且不會有任何錯誤訊息，是最難查的那種壞法。
         *
         *    PostgREST 對 Postgres 的 date 型別「通常」就是回 '2026-08-25'，
         *    但這件事取決於 PostgREST 版本與 supabase-js 的處理，
         *    與其賭它、事後再用肉眼驗證，不如在這裡直接吃下所有可能格式。
         *
         *    ⚠️ 字串一律用 slice(0,10) 而**不是**轉成 Date 再格式化：
         *       資料庫端的 day 已經是用 Asia/Taipei 分好日的「名目日期」，
         *       再套一次時區轉換反而會把日期整個推移一天。
         */
        _normalizeDay: function (v) {
            if (!v) return '';
            // '2026-08-25' 或 '2026-08-25T00:00:00+00:00' 都取前 10 碼
            if (typeof v === 'string') return v.slice(0, 10);
            // 極少見：若被轉成 Date 物件，用台北時區還原成名目日期
            if (v instanceof Date) {
                return v.toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
            }
            return String(v).slice(0, 10);
        },

        /** 把 (年, 月, 日) 組成 YYYY-MM-DD，月與日補零 */
        _ymd: function (y, m, d) {
            return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        },

        /** 該月共有幾天（傳入 1～12 的月份） */
        _daysInMonth: function (y, m) {
            return new Date(y, m, 0).getDate();
        },

        /**
         * 該月 1 日是星期幾，回傳 0～6（0＝星期一，符合月曆從週一起始的排法）。
         * ⚠️ 這裡用 Date.UTC 建構再取 getUTCDay，是為了避開瀏覽器本地時區
         *    可能讓「該月 1 日」落到前一天的問題 —— 星期幾只跟日曆本身有關，
         *    與時區無關，用 UTC 計算最穩定。
         */
        _firstWeekdayIndex: function (y, m) {
            const dow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=週日
            return (dow + 6) % 7;                                    // 轉成 0=週一
        },

        // ══════════════════════════════════════════════════════════════
        //  初始化
        // ══════════════════════════════════════════════════════════════

        init: function () {
            if (this.overlay) return;
            this.createDOM();
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'playerCalendarOverlay';
            overlay.className = 'pc-overlay hidden';
            overlay.innerHTML =
                '<div class="pc-container">' +
                '<div class="pc-board-top" id="pcBoardTop"></div>' +
                '<div class="pc-header">' +
                '<div class="pc-title">遊戲日曆</div>' +
                '<button class="pc-close-btn" id="pcClose" aria-label="關閉">&times;</button>' +
                '</div>' +
                '<div class="pc-month-nav">' +
                '<button class="pc-month-btn" id="pcPrev" aria-label="上個月">&#9664;</button>' +
                '<div class="pc-month-label" id="pcMonthLabel"></div>' +
                '<button class="pc-month-btn" id="pcNext" aria-label="下個月">&#9654;</button>' +
                '</div>' +
                '<div class="pc-weekday-row">' +
                WEEKDAYS.map(w => '<div class="pc-weekday">' + w + '</div>').join('') +
                '</div>' +
                '<div class="pc-grid-wrap" id="pcGridWrap">' +
                '<div class="pc-grid" id="pcGrid"></div>' +
                '<div class="pc-daycard hidden" id="pcDayCard"></div>' +
                '</div>' +
                '<div class="pc-footer">' +
                '<div class="pc-empty hidden" id="pcEmpty"></div>' +
                '<div id="pcSummary"></div>' +
                '</div>' +
                '</div>';
            document.body.appendChild(overlay);

            // 舞台同步縮放（所有 overlay 的標準作法，見 learningPath.js createDOM）
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    overlay.style.left = r.left + 'px';
                    overlay.style.top = r.top + 'px';
                    overlay.style.width = '500px';
                    overlay.style.height = '850px';
                    overlay.style.transform = 'scale(' + r.scale + ')';
                    overlay.style.transformOrigin = 'top left';
                });
            }

            this.overlay = overlay;
            this.bindEvents();
        },

        bindEvents: function () {
            const q = (id) => this.overlay.querySelector('#' + id);

            q('pcClose').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.hide();
            });

            // 點遮罩空白處關閉（點在主卡上不關）
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) this.hide();
            });

            q('pcPrev').addEventListener('click', () => this.stepMonth(-1));
            q('pcNext').addEventListener('click', () => this.stepMonth(1));

            this.bindSwipe(q('pcGridWrap'));

            // Esc 關閉（桌機）
            this._onKeyDown = (e) => {
                if (e.key !== 'Escape') return;
                if (this.overlay.classList.contains('hidden')) return;
                this.hide();
            };
            document.addEventListener('keydown', this._onKeyDown);
        },

        /**
         * 水平滑動切月。
         *
         * ⚠️ 角度閾值（水平位移 > 垂直位移 × 1.5）是必要的：
         *    玩家很少滑出完美的水平線，若只比較水平位移量，
         *    斜著往下滑（想捲動頁面）就會被誤判成切月。
         *
         * ⚠️ 全程不呼叫 preventDefault：
         *    見 learningPath.js bindDragEvents 的教訓 ——
         *    在觸控事件上攔截會讓 iOS 失去硬體加速而嚴重卡頓。
         *    改由 CSS 的 touch-action: pan-y 告訴瀏覽器「這裡只允許垂直捲動」，
         *    水平方向交給我們自己處理。
         */
        bindSwipe: function (el) {
            const SWIPE_MIN = 40;      // 至少要滑這麼多 px 才算數
            const ANGLE_RATIO = 1.5;   // 水平必須是垂直的 1.5 倍以上
            let startX = 0, startY = 0, tracking = false;

            el.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) { tracking = false; return; }
                tracking = true;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: true });

            el.addEventListener('touchend', (e) => {
                if (!tracking) return;
                tracking = false;
                const t = e.changedTouches && e.changedTouches[0];
                if (!t) return;
                const dx = t.clientX - startX;
                const dy = t.clientY - startY;
                if (Math.abs(dx) < SWIPE_MIN) return;
                if (Math.abs(dx) < Math.abs(dy) * ANGLE_RATIO) return;
                // 手指往左滑 → 看下個月；往右滑 → 看上個月
                this.stepMonth(dx < 0 ? 1 : -1);
            }, { passive: true });
        },

        // ══════════════════════════════════════════════════════════════
        //  顯示／隱藏
        // ══════════════════════════════════════════════════════════════

        show: function () {
            this.init();
            const today = this._todayTW().split('-');
            this.viewYear = parseInt(today[0], 10);
            this.viewMonth = parseInt(today[1], 10);
            this.selectedDay = null;
            this.overlay.classList.remove('hidden');
            this.loadAndRender();
        },

        hide: function () {
            if (!this.overlay) return;
            this.overlay.classList.add('hidden');
            this.hideDayCard();
        },

        isOpen: function () {
            return !!this.overlay && !this.overlay.classList.contains('hidden');
        },

        /**
         * 切換月份。
         * ⚠️ 不允許翻到未來的月份 —— 未來沒有資料，翻過去只會看到一片空白，
         *    玩家會以為是壞掉了。
         */
        stepMonth: function (delta) {
            if (delta > 0 && this.isViewingCurrentMonth()) return;

            let y = this.viewYear;
            let m = this.viewMonth + delta;
            if (m < 1) { m = 12; y -= 1; }
            if (m > 12) { m = 1; y += 1; }
            this.viewYear = y;
            this.viewMonth = m;
            this.selectedDay = null;
            this.hideDayCard();

            if (window.SoundManager) window.SoundManager.playConfirmItem();

            // 切月過場：先把格子推出去，載入完成後再滑回來
            const grid = this.overlay.querySelector('#pcGrid');
            grid.classList.add(delta > 0 ? 'pc-slide-left' : 'pc-slide-right');

            // debounce：連點箭頭時只送出最後一次查詢
            if (this._navTimer) clearTimeout(this._navTimer);
            this._navTimer = setTimeout(() => {
                this._navTimer = null;
                this.loadAndRender();
            }, 200);
        },

        isViewingCurrentMonth: function () {
            const today = this._todayTW().split('-');
            return this.viewYear === parseInt(today[0], 10)
                && this.viewMonth === parseInt(today[1], 10);
        },

        // ══════════════════════════════════════════════════════════════
        //  資料
        // ══════════════════════════════════════════════════════════════

        getSupabase: function () {
            return (window.SupabaseClient && window.SupabaseClient.getClient)
                ? window.SupabaseClient.getClient() : null;
        },

        getMyId: function () {
            // ⚠️ 不直接碰 localStorage（專案規範：模組外禁止直呼 localStorage）
            return (window.SupabaseClient && window.SupabaseClient.getCurrentId)
                ? (window.SupabaseClient.getCurrentId() || '') : '';
        },

        /**
         * 讀取某個月的資料。
         * @returns {{days:object, summary:object}}
         *   days    以 'YYYY-MM-DD' 為 key 的當日統計
         *   summary 該月合計；查不到資料時為全 0
         */
        fetchMonth: async function (y, m) {
            const key = y + '-' + String(m).padStart(2, '0');
            const hit = this.cache[key];
            if (hit && (Date.now() - hit.ts < this.CACHE_TTL)) return hit.data;

            const empty = { days: {}, summary: this.emptySummary() };

            const sb = this.getSupabase();
            const pid = this.getMyId();
            // 未綁定引繼碼或雲端未就緒 → 回空資料，由 render 顯示提示
            if (!sb || !pid) return empty;

            const from = this._ymd(y, m, 1);
            const to = this._ymd(y, m, this._daysInMonth(y, m));

            const [calRes, sumRes] = await Promise.all([
                sb.rpc('get_player_calendar', { p_player_id: pid, p_from: from, p_to: to }),
                sb.rpc('get_player_month_summary', { p_player_id: pid, p_from: from, p_to: to })
            ]);

            if (calRes.error) throw calRes.error;
            if (sumRes.error) throw sumRes.error;

            const days = {};
            const rows = calRes.data || [];
            rows.forEach(r => {
                const key = this._normalizeDay(r.day);
                if (key) days[key] = r;
            });

            // 自我診斷：有回資料卻一天都對不上，代表 day 欄位格式超出預期。
            // 沒有這道警告的話，畫面只會安靜地變成一片米白，很難查。
            if (rows.length > 0 && Object.keys(days).length === 0) {
                console.warn('[遊戲日曆] RPC 回了 ' + rows.length
                    + ' 筆，但 day 欄位無法解析成 YYYY-MM-DD，格子將全部空白。'
                    + ' 實際收到的 day：', rows[0] && rows[0].day);
            }

            // get_player_month_summary 一定回一列（沒資料時全是 0）
            const summary = (sumRes.data && sumRes.data[0]) || this.emptySummary();

            const data = { days: days, summary: summary };
            this.cache[key] = { ts: Date.now(), data: data };
            return data;
        },

        emptySummary: function () {
            return {
                ranked_wins: 0, practice_wins: 0, total_wins: 0,
                active_days: 0, score_sum: 0,
                silver_game: 0, silver_bonus: 0, silver_spent: 0
            };
        },

        /**
         * 載入目前月份並重繪。
         * ⚠️ 用 _reqSeq 序號擋住「舊查詢比新查詢晚回來」的情況：
         *    快速連切月份時，先發出的請求可能後到，
         *    若不擋就會用舊月份的資料蓋掉畫面。
         */
        loadAndRender: async function () {
            const seq = ++this._reqSeq;
            this.renderMonthLabel();

            let data;
            try {
                data = await this.fetchMonth(this.viewYear, this.viewMonth);
            } catch (e) {
                console.warn('[遊戲日曆] 讀取失敗:', e);
                data = { days: {}, summary: this.emptySummary(), _error: true };
            }
            if (seq !== this._reqSeq) return; // 已有更新的查詢，這份結果作廢

            this.renderGrid(data);
            this.renderSummary(data);
        },

        // ══════════════════════════════════════════════════════════════
        //  繪製
        // ══════════════════════════════════════════════════════════════

        renderMonthLabel: function () {
            this.overlay.querySelector('#pcMonthLabel').textContent =
                this.viewYear + ' 年 ' + this.viewMonth + ' 月';
            // 已在當月時，「下個月」停用
            this.overlay.querySelector('#pcNext').disabled = this.isViewingCurrentMonth();
        },

        renderGrid: function (data) {
            const grid = this.overlay.querySelector('#pcGrid');
            const y = this.viewYear, m = this.viewMonth;
            const today = this._todayTW();
            const total = this._daysInMonth(y, m);
            const lead = this._firstWeekdayIndex(y, m);

            let html = '';

            // 該月 1 日之前的空白補位格
            for (let i = 0; i < lead; i++) {
                html += '<div class="pc-cell pc-cell-blank"></div>';
            }

            for (let d = 1; d <= total; d++) {
                const key = this._ymd(y, m, d);
                const row = data.days[key];
                const wins = row ? (Number(row.total_wins) || 0) : 0;
                const lv = tierOf(wins, DAY_TIERS);

                const cls = ['pc-cell'];
                if (lv > 0) cls.push('pc-lv' + lv);
                if (wins > 0) cls.push('pc-cell-has-data');
                if (key === today) cls.push('pc-cell-today');
                if (key > today) cls.push('pc-cell-future');
                if (key === this.selectedDay) cls.push('pc-cell-selected');

                html += '<div class="' + cls.join(' ') + '" data-day="' + key + '">'
                    + '<div class="pc-cell-date">' + d + '</div>'
                    + (wins > 0 ? '<div class="pc-cell-count">' + wins + '</div>' : '')
                    + '</div>';
            }

            grid.innerHTML = html;

            // 事件委派：格子是每次重繪的，逐格綁定會不斷累積 listener
            if (!grid._pcBound) {
                grid.addEventListener('click', (e) => {
                    const cell = e.target.closest('.pc-cell-has-data');
                    if (!cell) return;
                    this.showDayCard(cell.getAttribute('data-day'));
                });
                grid._pcBound = true;
            }

            // 收掉切月過場的位移，讓格子滑回原位
            grid.classList.remove('pc-slide-left', 'pc-slide-right');
        },

        renderSummary: function (data) {
            const s = data.summary || this.emptySummary();
            const emptyEl = this.overlay.querySelector('#pcEmpty');
            const sumEl = this.overlay.querySelector('#pcSummary');

            // board-top 色條：依本月累積總局數上色
            const boardLv = tierOf(Number(s.total_wins) || 0, MONTH_TIERS);
            const board = this.overlay.querySelector('#pcBoardTop');
            board.className = 'pc-board-top' + (boardLv > 0 ? ' pc-board-lv' + boardLv : '');

            // 三種空狀態的提示各不相同，不可混為一談
            let emptyMsg = '';
            if (data._error) {
                emptyMsg = '雲端連線不順，稍後再看看。';
            } else if (!this.getMyId()) {
                emptyMsg = '尚未綁定引繼碼，日曆還沒有東西可以記。';
            } else if (!Number(s.total_wins)) {
                emptyMsg = this.isViewingCurrentMonth()
                    ? '這個月還沒有記錄，去青雲梯打一局試試？'
                    : '這個月沒有留下記錄。';
            }

            if (emptyMsg) {
                emptyEl.textContent = emptyMsg;
                emptyEl.classList.remove('hidden');
                sumEl.innerHTML = '';
                return;
            }

            emptyEl.classList.add('hidden');
            const n = (v) => (Number(v) || 0).toLocaleString();
            sumEl.innerHTML =
                '<div class="pc-footer-line">' +
                '<span class="pc-footer-label">本月</span>' +
                '<span>晉升 <span class="pc-footer-value">' + n(s.ranked_wins) + '</span> 局</span>' +
                '<span>練習 <span class="pc-footer-value">' + n(s.practice_wins) + '</span> 局</span>' +
                '<span>' + n(s.active_days) + ' 天</span>' +
                '</div>' +
                '<div class="pc-footer-line">' +
                '<span class="pc-footer-label">文錢</span>' +
                '<span>遊戲 <span class="pc-footer-value">' + n(s.silver_game) + '</span></span>' +
                '<span>贈獎 <span class="pc-footer-value">' + n(s.silver_bonus) + '</span></span>' +
                '</div>';
        },

        // ══════════════════════════════════════════════════════════════
        //  當日明細小卡
        // ══════════════════════════════════════════════════════════════

        showDayCard: function (dayKey) {
            const cacheKey = this.viewYear + '-' + String(this.viewMonth).padStart(2, '0');
            const hit = this.cache[cacheKey];
            const row = hit && hit.data.days[dayKey];
            if (!row) return;

            if (window.SoundManager) window.SoundManager.playConfirmItem();

            this.selectedDay = dayKey;
            // 只換選中框，不整片重繪（重繪會讓 :active 的縮放動畫被打斷）
            this.overlay.querySelectorAll('.pc-cell-selected')
                .forEach(el => el.classList.remove('pc-cell-selected'));
            const cell = this.overlay.querySelector('.pc-cell[data-day="' + dayKey + '"]');
            if (cell) cell.classList.add('pc-cell-selected');

            const parts = dayKey.split('-');
            const n = (v) => (Number(v) || 0).toLocaleString();

            const rows = [
                ['晉升局數', n(row.ranked_wins) + ' 局'],
                ['練習局數', n(row.practice_wins) + ' 局'],
                ['獲得積分', n(row.score_sum) + ' 分'],
                ['遊戲文錢', n(row.silver_game) + ' 文'],
                ['其他文錢', n(row.silver_bonus) + ' 文']
            ];
            // 當天沒有花錢就不顯示這一列，免得每天都掛一個 0 文
            if (Number(row.silver_spent) > 0) {
                rows.push(['花費文錢', n(row.silver_spent) + ' 文']);
            }

            const card = this.overlay.querySelector('#pcDayCard');
            card.innerHTML =
                '<div class="pc-daycard-title">'
                + parseInt(parts[1], 10) + ' 月 ' + parseInt(parts[2], 10) + ' 日</div>'
                + rows.map(r =>
                    '<div class="pc-daycard-row">'
                    + '<span class="pc-daycard-row-label">' + r[0] + '</span>'
                    + '<span class="pc-daycard-row-value">' + r[1] + '</span>'
                    + '</div>').join('')
                + '<button class="pc-daycard-close" id="pcDayCardClose">關閉</button>';
            card.classList.remove('hidden');

            card.querySelector('#pcDayCardClose').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.hideDayCard();
            });
        },

        hideDayCard: function () {
            if (!this.overlay) return;
            const card = this.overlay.querySelector('#pcDayCard');
            if (card) card.classList.add('hidden');
            this.selectedDay = null;
            this.overlay.querySelectorAll('.pc-cell-selected')
                .forEach(el => el.classList.remove('pc-cell-selected'));
        },

        /**
         * 清掉快取。
         * 玩家打完一局回到青雲梯時呼叫，避免 60 秒內看到的是舊數字。
         */
        clearCache: function () {
            this.cache = {};
        }
    };

    window.PlayerCalendar = PlayerCalendar;

})();
