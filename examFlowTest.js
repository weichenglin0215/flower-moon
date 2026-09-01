/* ============================================================================
 * examFlowTest.js —《花月》考試「全流程」熱鍵測試工具
 * ----------------------------------------------------------------------------
 * 對應企畫書：note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md
 *
 * ⭐ 這支工具跟 Alt+E 的差別（兩者並存，用途完全不同）
 *
 *   Alt+E（exam.js 的 showTestPicker）
 *     用途：測「考題本身」——題目數量、難度、出題品質。
 *     作法：沙箱，**不寫入任何資料**，直接呼叫 ExamEngine.start()。
 *     缺點：它繞過了 LearningPath.startExam()／startSkipExam()，
 *           所以扣費、每日節流、考完回青雲梯重畫、獎勵入帳、晉升演出
 *           這些「考試前後」的流程它一概碰不到，自然也測不出那裡的錯。
 *
 *   Alt+T（本檔）
 *     用途：測「整條流程」——從主介面發起 → 扣費 → 考試 → 計分 → 獎勵入帳
 *           → 文位晉升 → 慶祝演出 → 回到青雲梯，每一段都要能單獨確認。
 *     作法：**完全走玩家真正的入口**，真的扣文錢、真的寫存檔。
 *           唯一的特權是「取消每日一次的限制」，否則一天只能測一次。
 *
 *   ⚠️ 會寫入真實存檔是刻意的：先前那三個最難抓的錯（慶祝動畫獎勵顯示 0、
 *      越級漏發沿途文位獎勵、站點被跳過）全都發生在「寫入之後」，
 *      沙箱模式永遠測不出來。要測真流程就得吃真資料。
 *
 * ⭐ 熱鍵一覽（全部用 Alt 組合，避免與遊戲內的數字／方向鍵輸入衝突）
 *
 *   Alt+T        開啟／關閉測試選單
 *   ── 以下只在測試進行中有效 ──
 *   Alt+Enter    下一步（自動按下當前階段的主要按鈕）
 *   Alt+N        同上（單手好按；某些環境按 Alt+Enter 收不到鍵值，用這個）
 *   Alt+1        本題判「對」
 *   Alt+2        本題判「錯」
 *   Alt+9        剩下的題目全部判對，一路衝到結算
 *   Alt+0        剩下的題目全部判錯，一路衝到結算
 *   Alt+S        跳過慶祝演出
 *   Alt+Q        中止測試
 * ========================================================================== */

(function () {
    'use strict';

    // 自動連打模式下，每一步之間的間隔（毫秒）。
    // 太快會來不及等遊戲把畫面建好，實測 160ms 足夠且不會讓人等。
    const AUTO_STEP_MS = 160;

    const ExamFlowTest = {

        active: false,       // 測試流程進行中
        _auto: 0,            // 0=手動 1=全部判對 -1=全部判錯
        _stall: 0,           // 自動模式連續幾次沒有進展（防呆用）
        _lastQi: -1,
        _hud: null,
        _picker: null,
        _timer: 0,
        _snapshot: null,
        _celebLog: [],
        _origCelebrate: null,

        // ══════════════════════════════════════════════════════════
        //  快照：用來比對「這一場考試前後到底改變了什麼」
        // ══════════════════════════════════════════════════════════

        _snap: function () {
            const SM = window.ScoreManager, LP = window.LearningPath, PS = window.PathStations;
            let coll = {};
            try { coll = (window.FMCollectionSave && window.FMCollectionSave.load()) || {}; } catch (e) { }
            let station = '(未知)';
            try {
                if (LP && PS) {
                    LP.invalidateProgress();
                    station = PS.build()[LP.getCurrentStationIndex()].name;
                }
            } catch (e) { }
            let rank = '(未知)';
            try { rank = SM.getEffectiveRank(SM.loadPlayerData()); } catch (e) { }
            return {
                silver: coll.silver || 0,
                rank: rank,
                station: station,
                passed: ((coll.ranks && coll.ranks.passed) || []).slice(),
                pathCount: (LP && LP.getPathPoemCount) ? LP.getPathPoemCount() : -1,
                learnedCount: (LP && LP.getLearnedPoemCount) ? LP.getLearnedPoemCount() : -1
            };
        },

        // ══════════════════════════════════════════════════════════
        //  選單
        // ══════════════════════════════════════════════════════════

        togglePicker: function () {
            if (this._picker) { this._picker.remove(); this._picker = null; return; }
            if (this.active) { this._log('測試進行中，請先 Alt+Q 中止'); return; }

            const PS = window.PathStations;
            const ranks = (PS && PS.getExamRankNames) ? PS.getExamRankNames() : [];
            if (!ranks.length) { this._log('取不到文位名單'); return; }

            const wrap = document.createElement('div');
            wrap.id = 'examFlowTestPicker';
            wrap.style.cssText = [
                'position:fixed', 'left:50%', 'top:50%', 'transform:translate(-50%,-50%)',
                'z-index:99999', 'background:hsl(28,30%,12%)', 'color:hsl(45,80%,88%)',
                'border:2px solid hsl(45,70%,55%)', 'border-radius:10px',
                'padding:14px 16px', 'font-size:14px', 'font-family:system-ui,sans-serif',
                'max-height:86vh', 'overflow:auto', 'min-width:460px',
                'box-shadow:0 8px 32px rgba(0,0,0,.6)'
            ].join(';');

            const silver = this._snap().silver;
            wrap.innerHTML =
                '<div style="font-size:17px;font-weight:bold;margin-bottom:4px;">'
                + '考試全流程測試（Alt+T）</div>'
                + '<div style="opacity:.8;line-height:1.6;margin-bottom:8px;">'
                + '走玩家真正的入口，<b style="color:hsl(10,80%,70%)">會扣文錢、會寫入存檔</b>；'
                + '僅取消「每日一次」限制。<br>目前文錢：<b id="eftSilver">'
                + silver.toLocaleString() + '</b>'
                + ' <button id="eftTopUp" style="margin-left:6px;cursor:pointer;">補 10 萬</button>'
                + '</div>';

            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:auto repeat(3,1fr);gap:4px;align-items:center;';
            grid.innerHTML = '<div></div>'
                + '<div style="text-align:center;opacity:.7;">模擬考</div>'
                + '<div style="text-align:center;opacity:.7;">正式考</div>'
                + '<div style="text-align:center;opacity:.7;">越級考</div>';

            const self = this;
            ranks.forEach(function (name) {
                const lbl = document.createElement('div');
                lbl.textContent = name;
                lbl.style.cssText = 'padding-right:8px;white-space:nowrap;';
                grid.appendChild(lbl);
                [['mock', '模擬'], ['real', '正式'], ['skip', '越級']].forEach(function (m) {
                    const b = document.createElement('button');
                    b.textContent = m[1];
                    b.style.cssText = 'cursor:pointer;padding:2px 0;';
                    b.onclick = function () { self.start(name, m[0]); };
                    grid.appendChild(b);
                });
            });
            wrap.appendChild(grid);

            const close = document.createElement('button');
            close.textContent = '取消';
            close.style.cssText = 'margin-top:10px;width:100%;cursor:pointer;padding:4px;';
            close.onclick = function () { wrap.remove(); self._picker = null; };
            wrap.appendChild(close);

            document.body.appendChild(wrap);
            this._picker = wrap;

            wrap.querySelector('#eftTopUp').onclick = function () {
                const S = window.FMCollectionSave;
                if (!S) return;
                const coll = S.load();
                S.addSilver(coll, 100000, 'debug_topup', 'examFlowTest');
                S.save(coll);
                wrap.querySelector('#eftSilver').textContent = S.load().silver.toLocaleString();
                self._log('已補 100,000 文錢');
            };
        },

        // ══════════════════════════════════════════════════════════
        //  啟動：走玩家真正的入口
        // ══════════════════════════════════════════════════════════

        start: function (rankName, mode) {
            const LP = window.LearningPath, C = window.FMExamConfig, S = window.FMCollectionSave;
            if (!LP || !C || !S) { this._log('模組未載入'); return; }

            if (this._picker) { this._picker.remove(); this._picker = null; }

            // ── 唯一的特權：清掉今日已考標記 ──
            // 不這樣做的話，模擬考與越級考一天只能測一次，
            // 而這支工具的重點正是「反覆跑同一段流程」。
            try {
                const coll = S.load();
                if (coll.examDaily && coll.examDaily[mode]) {
                    delete coll.examDaily[mode][rankName];
                    S.save(coll);
                }
            } catch (e) { }

            this.active = true;
            this._auto = 0;
            this._snapshot = this._snap();
            this._celebLog = [];
            this._buildHud();

            this._log('══ 開始測試：' + rankName + '（'
                + (mode === 'mock' ? '模擬考' : mode === 'skip' ? '越級考' : '正式考') + '）══');
            this._log('考前：文錢 ' + this._snapshot.silver
                + '｜文位 ' + this._snapshot.rank
                + '｜站點 ' + this._snapshot.station
                + '｜課程進度 ' + this._snapshot.pathCount
                + '（總學會 ' + this._snapshot.learnedCount + '）');

            // ── 攔截慶祝演出，只為了「記錄它實際收到的文錢」──
            // 這正是先前那個「動畫永遠顯示 0 文錢」的觀測點。
            // ⚠️ 只包一層記錄後照常呼叫原函式，不改變任何行為。
            const self = this;
            if (!this._origCelebrate && typeof LP.playPromotionCelebration === 'function') {
                this._origCelebrate = LP.playPromotionCelebration;
                LP.playPromotionCelebration = function (station, silver, onDone) {
                    self._celebLog.push({ station: station && station.name, silver: silver });
                    self._log('▶ 慶祝演出：' + (station && station.name)
                        + '　收到文錢 = ' + silver
                        + (silver ? '' : '  ← 若此處為 0 但存檔有加錢，就是顯示端斷鏈'));
                    return self._origCelebrate.call(LP, station, silver, onDone);
                };
            }

            try {
                if (mode === 'skip') LP.startSkipExam(rankName);
                else LP.startExam(rankName, mode);
            } catch (e) {
                this._log('啟動失敗：' + e.message);
                this.stop();
                return;
            }

            // 沒有真的開起來（費用不足／資格不符）就直接收工
            const self2 = this;
            setTimeout(function () {
                if (!document.getElementById('exgGo') && !self2._examRunning()) {
                    self2._log('考試沒有開起來——多半是文錢不足或不具應試資格，'
                        + '請看青雲梯上的提示。');
                    self2.stop();
                }
            }, 700);
        },

        stop: function () {
            this.active = false;
            this._auto = 0;
            if (this._timer) { clearTimeout(this._timer); this._timer = 0; }
            // 還原慶祝演出的攔截
            if (this._origCelebrate && window.LearningPath) {
                window.LearningPath.playPromotionCelebration = this._origCelebrate;
                this._origCelebrate = null;
            }
            if (this._hud) { this._hud.remove(); this._hud = null; }
        },

        /** 收尾：把考前考後的差異印成一張對照表 */
        _report: function () {
            const before = this._snapshot;
            if (!before) return;
            const after = this._snap();
            const line = function (name, a, b) {
                const same = String(a) === String(b);
                return '  ' + name + '：' + a + (same ? '（未變）' : '  →  ' + b);
            };
            this._log('══ 流程結束，前後對照 ══');
            this._log(line('文錢    ', before.silver, after.silver)
                + (after.silver !== before.silver
                    ? '　淨變化 ' + (after.silver - before.silver > 0 ? '+' : '')
                    + (after.silver - before.silver) : ''));
            this._log(line('文位    ', before.rank, after.rank));
            this._log(line('站點    ', before.station, after.station));
            this._log(line('課程進度', before.pathCount, after.pathCount));
            this._log(line('總學會  ', before.learnedCount, after.learnedCount));
            const gained = after.passed.filter(function (x) { return before.passed.indexOf(x) < 0; });
            this._log('  新取得文位：' + (gained.length ? gained.join('、') : '（無）'));
            this._log('  慶祝演出收到的文錢：'
                + (this._celebLog.length
                    ? this._celebLog.map(function (c) { return c.station + '=' + c.silver; }).join('、')
                    : '（未播放）'));

            // 一致性自我檢查：演出顯示的金額，應該等於文錢實際增加量
            // （扣掉報名費之後）。對不上就是顯示端或發放端有一邊斷了。
            const shown = this._celebLog.reduce(function (s, c) { return s + (c.silver || 0); }, 0);
            if (this._celebLog.length && shown === 0) {
                this._log('  ⚠️ 演出顯示 0 文錢 —— 若上方文錢確實有增加，代表獎勵金額沒有傳進動畫。');
            }
            this._snapshot = null;
        },

        // ══════════════════════════════════════════════════════════
        //  階段判讀
        // ══════════════════════════════════════════════════════════

        _examRunning: function () {
            const E = window.ExamEngine;
            return !!(E && E._plan && E._questions && E._qi < E._questions.length);
        },

        /**
         * 這個元素是不是「真的看得到」。
         *
         * ⚠️⚠️ 這道檢查非做不可，別拿掉：
         *    ExamEngine._hideCard() 只是把 overlay 的 display 設成 none，
         *    **卡片的 HTML 仍然留在 DOM 裡**。因此考試進入遊戲之後，
         *    document.getElementById('exgGo') 依然找得到那顆「入場應試」按鈕。
         *    若只用「元素存在」判斷階段，自動模式會一直以為還停在簡介卡，
         *    反覆點擊一顆看不見的按鈕（實測會重複觸發開局，畫面完全錯亂）。
         */
        _visible: function (el) {
            if (!el) return false;
            // offsetParent 為 null 代表自己或任一祖先是 display:none
            if (!el.offsetParent && !el.getClientRects().length) return false;

            // ⚠️ 只看 display 不夠。獎狀層 #certOverlay 關閉之後仍留在 DOM，
            //    而且維持 display:flex，只是把 opacity 降到 0、pointer-events
            //    設成 none（見 achievement.css 的 .cert-overlay / .active）。
            //    少了下面這段，_stage() 會永遠回報「獎狀」，
            //    測試工具就再也偵測不到流程其實已經回到青雲梯了。
            for (let n = el; n && n !== document.body; n = n.parentElement) {
                const cs = getComputedStyle(n);
                if (cs.visibility === 'hidden' || cs.opacity === '0') return false;
            }
            return true;
        },

        _findVisible: function (id) {
            const el = document.getElementById(id);
            return this._visible(el) ? el : null;
        },

        /** 目前停在哪一個階段，以及該階段的主要按鈕 */
        _stage: function () {
            if (document.querySelector('.pcel-stage, .pcel-ribbon')) {
                return { name: '慶祝演出', btn: null, hint: 'Alt+S 跳過' };
            }
            // 獎狀畫面沒有按鈕，是「點畫面任何一處關閉」（監聽掛在 #certOverlay 上），
            // 因此這裡把整層 overlay 當成要點的目標。
            const cert = document.querySelector('.cert-card');
            if (this._visible(cert)) {
                const ov = document.getElementById('certOverlay') || cert.parentElement || cert;
                return { name: '獎狀', btn: ov, hint: 'Alt+Enter 關閉' };
            }

            let b;
            if ((b = this._findVisible('exgGo'))) {
                return { name: '簡介卡', btn: b, hint: 'Alt+Enter 入場應試' };
            }
            if ((b = this._findVisible('exgNext'))) {
                return { name: '單題結果', btn: b, hint: 'Alt+Enter 下一題' };
            }
            if ((b = this._findVisible('exgClose'))) {
                return { name: '總結', btn: b, hint: 'Alt+Enter 離場' };
            }
            const pop = this._findVisible('lpPopClaim') || this._findVisible('lpPopExam');
            if (pop) return { name: '晉升彈窗', btn: pop, hint: 'Alt+Enter 確認' };

            const E = window.ExamEngine;
            if (E && E._patchedGame && E._patchedGame.obj) {
                return { name: '答題中（遊戲進行）', btn: null, hint: 'Alt+1 判對／Alt+2 判錯' };
            }
            return { name: '（青雲梯／其他）', btn: null, hint: 'Alt+Q 結束測試' };
        },

        // ══════════════════════════════════════════════════════════
        //  操作
        // ══════════════════════════════════════════════════════════

        /** 把目前這一局判定成贏或輸，接回考試流程 */
        answer: function (win) {
            const E = window.ExamEngine;
            if (!E || !E._patchedGame || !E._patchedGame.obj) return false;
            // examEngine._patchGame 覆寫過 gameOver，呼叫它等同「這一局結束了」，
            // 後續的計分、過場、換題全部照原本的流程跑。
            E._patchedGame.obj.gameOver(!!win);
            return true;
        },

        /** 按下目前階段的主要按鈕 */
        next: function () {
            const s = this._stage();
            if (s.btn) { s.btn.click(); return true; }
            if (s.name === '慶祝演出') { this.skipCelebration(); return true; }
            return false;
        },

        /**
         * 跳過慶祝演出。
         * ⚠️ 不能只呼叫 stop() —— 那不會觸發 onDone，流程會卡在原地。
         *    這裡複製 promotionCelebration._showCert 裡 finish() 的順序：
         *    先取出回呼、清成 null、清場，最後才呼叫回呼。
         */
        skipCelebration: function () {
            const P = window.PromotionCelebration;
            if (!P || !P._running) return false;
            const cb = P._onDone;
            P._onDone = null;
            P.stop(true);
            if (cb) cb();
            return true;
        },

        /** 自動連打：把剩下的題目全部判成同一種結果，一路跑到結算 */
        auto: function (win) {
            this._auto = win ? 1 : -1;
            this._stall = 0;
            this._lastQi = -1;
            this._log('自動模式：剩餘題目全部判' + (win ? '對' : '錯'));
            this._tick();
        },

        _tick: function () {
            const self = this;
            if (!this.active || this._auto === 0) return;
            if (this._timer) clearTimeout(this._timer);
            this._timer = setTimeout(function () {
                if (!self.active || self._auto === 0) return;
                const E = window.ExamEngine;
                const s = self._stage();

                // ── 卡住保護 ──
                // 只要題號在推進就算有進展；連續 60 次（約 10 秒）都沒推進，
                // 代表流程卡在某個沒預料到的狀態，停下來讓人看，
                // 絕不無限重試（無限重試會把畫面點到完全錯亂）。
                const qi = (E && typeof E._qi === 'number') ? E._qi : -1;
                if (qi !== self._lastQi) { self._lastQi = qi; self._stall = 0; }
                else if (++self._stall > 60) {
                    self._auto = 0;
                    self._log('⚠️ 自動模式卡在「' + s.name + '」超過 10 秒，已停止。'
                        + '請看畫面目前的狀態，或 Alt+Q 結束測試。');
                    return;
                }

                if (s.name === '答題中（遊戲進行）') {
                    self.answer(self._auto > 0);
                } else if (s.name === '單題結果' || s.name === '簡介卡') {
                    self.next();
                } else if (s.name === '（青雲梯／其他）') {
                    // 遊戲還在開場、卡片已收起的短暫空檔，等下一輪再看
                } else {
                    // 到了總結／演出／彈窗／獎狀就停下來，讓人親眼看這幾段
                    self._auto = 0;
                    self._log('已跑到「' + s.name + '」，自動模式結束（' + s.hint + '）');
                    return;
                }
                self._tick();
            }, AUTO_STEP_MS);
        },

        // ══════════════════════════════════════════════════════════
        //  HUD
        // ══════════════════════════════════════════════════════════

        _buildHud: function () {
            if (this._hud) return;
            const d = document.createElement('div');
            d.id = 'examFlowTestHud';
            d.style.cssText = [
                'position:fixed', 'left:8px', 'top:8px', 'z-index:99998',
                'background:rgba(20,12,6,.88)', 'color:hsl(45,80%,88%)',
                'border:1px solid hsl(45,60%,45%)', 'border-radius:8px',
                'padding:8px 10px', 'font-size:12px', 'line-height:1.5',
                'font-family:ui-monospace,monospace', 'pointer-events:none',
                'white-space:pre', 'max-width:46vw'
            ].join(';');
            document.body.appendChild(d);
            this._hud = d;
            this._refresh();
        },

        _refresh: function () {
            if (!this._hud) return;
            const E = window.ExamEngine;
            const s = this._stage();
            let prog = '';
            if (E && E._plan && E._questions) {
                prog = '題目 ' + Math.min(E._qi + 1, E._questions.length) + ' / ' + E._questions.length
                    + '　答對 ' + E._correct + '　及格需 ' + E._plan.passCount + '\n';
            }
            this._hud.textContent =
                '【全流程測試】' + (this._auto ? '自動判' + (this._auto > 0 ? '對' : '錯') + '中…' : '')
                + '\n階段：' + s.name + '\n' + prog
                + s.hint + '\n'
                + 'Alt+1 對　Alt+2 錯　Alt+9/0 全對/全錯\n'
                + 'Alt+Enter／Alt+N 下一步　Alt+S 跳演出　Alt+Q 結束';
        },

        _log: function (msg) {
            console.log('%c[全流程測試] ' + msg, 'color:hsl(35,80%,60%)');
        }
    };

    window.ExamFlowTest = ExamFlowTest;

    // ══════════════════════════════════════════════════════════
    //  熱鍵
    // ══════════════════════════════════════════════════════════
    /**
     * 把按鍵正規化成單一字串。
     *
     * ⚠️ 不能只看 e.key：某些情況下按著 Alt 時 e.key 會是空字串或
     *    組合鍵符號（不同鍵盤配置、輸入法、以及自動化工具都會這樣），
     *    實測 Alt+Enter 就收到 e.key === ''。因此改成
     *    「e.key 認不出來時，退回看 e.code」——e.code 是實體按鍵位置，
     *    不受修飾鍵與輸入法影響。
     */
    function normalizeKey(e) {
        const k = (e.key || '').toLowerCase();
        if (k && k !== 'alt' && k !== 'dead' && k !== 'unidentified') {
            if (k === 'enter') return 'enter';
            if (k.length === 1) return k;
        }
        const c = e.code || '';
        if (c === 'Enter' || c === 'NumpadEnter') return 'enter';
        let m = c.match(/^Key([A-Z])$/);
        if (m) return m[1].toLowerCase();
        m = c.match(/^(?:Digit|Numpad)(\d)$/);
        if (m) return m[1];
        return '';
    }

    document.addEventListener('keydown', function (e) {
        if (!e.altKey) return;
        const k = normalizeKey(e);

        if (k === 't') { e.preventDefault(); ExamFlowTest.togglePicker(); return; }
        if (!ExamFlowTest.active) return;

        switch (k) {
            case 'q': e.preventDefault(); ExamFlowTest._log('已中止'); ExamFlowTest.stop(); break;
            case '1': e.preventDefault(); ExamFlowTest.answer(true); break;
            case '2': e.preventDefault(); ExamFlowTest.answer(false); break;
            case '9': e.preventDefault(); ExamFlowTest.auto(true); break;
            case '0': e.preventDefault(); ExamFlowTest.auto(false); break;
            case 's': e.preventDefault(); ExamFlowTest.skipCelebration(); break;
            // 下一步提供兩個鍵：Alt+Enter 直覺，Alt+N 單手好按，
            // 且部分環境（含自動化工具與某些輸入法）按 Alt+Enter 時
            // e.key／e.code 會雙雙送出空字串，那時只有 Alt+N 進得來。
            case 'enter':
            case 'n': e.preventDefault(); ExamFlowTest.next(); break;
            default: return;
        }
    });

    // HUD 每 200ms 更新一次階段顯示；順便偵測「流程已回到青雲梯」→ 印對照表。
    setInterval(function () {
        if (!ExamFlowTest.active) return;
        ExamFlowTest._refresh();
        // 考試物件已收乾淨、且畫面上沒有任何考試卡片 → 視為整段流程結束
        const E = window.ExamEngine;
        const done = (!E || !E._overlay)
            && !document.querySelector('.pcel-stage, .pcel-ribbon, .cert-card')
            && !document.getElementById('lpPopClaim')
            && !document.getElementById('lpPopExam');
        if (done && ExamFlowTest._snapshot) {
            ExamFlowTest._report();
            ExamFlowTest._log('（測試仍在監看，Alt+Q 結束）');
        }
    }, 200);

})();
