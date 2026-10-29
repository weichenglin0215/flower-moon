/**
 * 雲端存檔與帳號彈窗模組
 *
 * 帳號制度：「暱稱（全站唯一）＋四位數密碼」，由玩家自己決定。
 * 任何裝置／瀏覽器輸入同一組暱稱＋密碼，就能使用同一份玩家資料。
 * 暱稱唯一性、密碼雜湊、錯誤鎖定全部在資料庫端（見 note/帳號密碼_SQL草案.sql），
 * 這個檔案只負責畫面與流程，絕對不要在這裡比對密碼。
 *
 * 四種開啟方式（options.mode）：
 *   'initial' 還沒有帳號的玩家（完成第一局後）：分頁「新玩家」「已有帳號」
 *   'change'  已登入玩家從成就頁開啟：分頁「暱稱」「密碼」「切換帳號」
 *   'migrate' 舊制玩家（有 李白#1234 但沒密碼）：強制設定暱稱＋密碼，沒有分頁
 *   （options.tab 可指定一開始停在哪個分頁）
 *
 * 內部分頁（this.tab）：register／login／rename／changepin／migrate／claim
 *   claim = 玩家在登入欄輸入了舊的引繼碼（李白#1234），要為它設定新暱稱與密碼
 */

(function () {
    'use strict';

    // 舊制引繼碼格式：暱稱#四碼英數。舊碼本身是大寫，但手機鍵盤常自動轉小寫，
    // 所以比對時不分大小寫，送出前再統一轉成大寫（見 _normalizeLegacyCode）。
    const LEGACY_CODE_RE = /^[^#]+#[A-Za-z0-9]{4}$/;
    const PIN_RE = /^\d{4}$/;

    // 需要「暱稱是否已被使用」即時提示的分頁
    const NICK_CHECK_TABS = ['register', 'rename', 'migrate', 'claim'];

    // 各分頁的內容。fields 決定哪些輸入欄會顯示（nick／oldpin／pin／pin2）
    const TABS = {
        register: {
            label: '新玩家', title: '建立帳號', btn: '建立',
            desc: '取一個全站唯一的暱稱，\n再自訂四位數密碼。\n換裝置時輸入暱稱＋密碼，\n就能接續同一份進度。',
            fields: ['nick', 'pin', 'pin2']
        },
        login: {
            label: '已有帳號', title: '登入帳號', btn: '登入',
            desc: '輸入暱稱與密碼，\n就能在這台裝置繼續你的進度。',
            fields: ['nick', 'pin']
        },
        rename: {
            label: '暱稱', title: '變更暱稱', btn: '變更',
            desc: '暱稱不可與其他玩家重複。\n密碼與進度不受影響。',
            fields: ['nick']
        },
        changepin: {
            label: '密碼', title: '變更密碼', btn: '變更',
            desc: '請先輸入目前的密碼，\n再設定新的四位數密碼。',
            fields: ['oldpin', 'pin', 'pin2']
        },
        migrate: {
            label: '', title: '設定密碼', btn: '確認',
            desc: '花月升級了！\n現在用「暱稱＋四位數密碼」登入，\n換手機或瀏覽器也能接續進度。\n請確認暱稱並設定密碼。',
            fields: ['nick', 'pin', 'pin2']
        },
        claim: {
            label: '', title: '認領舊帳號', btn: '確認',
            desc: '找到你的舊引繼碼了！\n請為這個帳號設定新的暱稱與密碼，\n之後就用它們登入。',
            fields: ['nick', 'pin', 'pin2']
        }
    };

    // 各開啟方式有哪幾個分頁
    const MODE_TABS = {
        initial: ['register', 'login'],
        change: ['rename', 'changepin', 'login'],
        migrate: []
    };

    // 各開啟方式的預設分頁
    const MODE_DEFAULT_TAB = { initial: 'register', change: 'rename', migrate: 'migrate' };

    const CloudSaveDialog = {
        overlay: null,
        mode: 'initial',
        tab: 'register',
        _busy: false,            // 送出中，避免連點重複送出
        _armed: false,           // 切換帳號的「再按一次確認」是否已武裝
        _nickTouched: false,     // 玩家是否自己動過暱稱欄（沒動過才會自動帶預設值）
        _connFailed: false,      // 這次是否遇到連不上雲端（連不上時要放行「稍後再說」）
        _userOpened: false,      // 是否由玩家主動開啟（主動開的一定能取消）
        _claimId: '',            // claim 分頁要認領的舊 id
        _nickSeq: 0,             // 暱稱檢查的序號，丟棄過期的回應

        init: function () {
            if (this.overlay) return;

            const overlay = document.createElement('div');
            overlay.className = 'cloud-save-overlay aspect-5-8';
            overlay.id = 'cloudSaveOverlay';

            // 輸入欄的 autocomplete 一律關掉：密碼欄不要讓瀏覽器跳出「儲存密碼」，
            // 那會把四位數 PIN 當成帳號密碼存進玩家的密碼管理員。
            overlay.innerHTML = `
                <div class="cloud-save-dialog">
                    <div class="cloud-save-title" id="csTitle"></div>
                    <div class="cloud-save-tabs" id="csTabs"></div>
                    <div class="cloud-save-desc" id="csDesc"></div>

                    <div class="cloud-save-input-group" data-field="nick">
                        <input type="text" id="csInput" class="cloud-save-input" maxlength="20"
                               placeholder="暱稱（例如：李白）" autocomplete="off" autocapitalize="off" />
                        <div class="cloud-save-nick-hint" id="csNickHint"></div>
                    </div>
                    <div class="cloud-save-input-group" data-field="oldpin">
                        <input type="password" id="csPinOld" class="cloud-save-input cloud-save-pin" maxlength="4"
                               inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="目前的密碼（4位數字）" />
                    </div>
                    <div class="cloud-save-input-group" data-field="pin">
                        <input type="password" id="csPin" class="cloud-save-input cloud-save-pin" maxlength="4"
                               inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="密碼（4位數字）" />
                    </div>
                    <div class="cloud-save-input-group" data-field="pin2">
                        <input type="password" id="csPin2" class="cloud-save-input cloud-save-pin" maxlength="4"
                               inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="再輸入一次密碼" />
                    </div>
                    <label class="cloud-save-showpin" id="csShowPinRow">
                        <input type="checkbox" id="csShowPin" /> 顯示密碼
                    </label>

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
                if (this._busy) return;
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
                if (this.cancelCallback) this.cancelCallback();
            });

            document.getElementById('csBtnConfirm').addEventListener('click', () => {
                this.submitForm();
            });

            // Enter 送出（三個輸入欄都適用）
            ['csInput', 'csPinOld', 'csPin', 'csPin2'].forEach((id) => {
                document.getElementById(id).addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this.submitForm();
                });
            });

            // 密碼欄只收數字（手機數字鍵盤以外的貼上、全形數字也一併擋掉）
            ['csPinOld', 'csPin', 'csPin2'].forEach((id) => {
                document.getElementById(id).addEventListener('input', (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    this._armed = false;
                });
            });

            // 暱稱欄：記錄玩家動過、並做「是否已被使用」的即時檢查（防抖）
            let timer = null;
            document.getElementById('csInput').addEventListener('input', () => {
                this._nickTouched = true;
                this._armed = false;
                clearTimeout(timer);
                timer = setTimeout(() => this._checkNickname(), 450);
            });

            // 顯示／隱藏密碼
            document.getElementById('csShowPin').addEventListener('change', (e) => {
                const type = e.target.checked ? 'text' : 'password';
                ['csPinOld', 'csPin', 'csPin2'].forEach((id) => {
                    document.getElementById(id).type = type;
                });
            });
        },

        showMessage: function (msg, isError = true) {
            const msgEl = document.getElementById('csMessage');
            msgEl.textContent = msg;
            msgEl.className = 'cloud-save-message ' + (isError ? 'msg-error' : 'msg-success');
        },

        /**
         * 開啟視窗
         * @param {object} options
         *   mode      'initial' | 'change' | 'migrate'
         *   tab       一開始停在哪個分頁（可省略）
         *   onSuccess 成功後的回呼
         *   onCancel  取消／稍後再說的回呼
         */
        show: function (options) {
            this.init();
            options = options || {};

            this.mode = options.mode || 'initial';
            this.successCallback = options.onSuccess;
            this.cancelCallback = options.onCancel;
            this._userOpened = (options.mode === 'change');
            this._connFailed = false;
            this._armed = false;
            this._nickTouched = false;
            this._claimId = '';

            // 從成就頁開啟，但這台裝置根本還沒有帳號：改走「新玩家／已有帳號」
            const hasId = !!window.SupabaseClient.getCurrentId();
            let firstTab = options.tab || MODE_DEFAULT_TAB[this.mode];
            if (this.mode === 'change' && !hasId) {
                this.mode = 'initial';
                firstTab = 'register';
            }
            // 改名／改密碼必須有帳號；沒有就退回登入分頁
            if (!hasId && (firstTab === 'rename' || firstTab === 'changepin')) firstTab = 'register';

            document.getElementById('csShowPin').checked = false;
            ['csPinOld', 'csPin', 'csPin2'].forEach((id) => { document.getElementById(id).type = 'password'; });

            this._switchTab(firstTab);
            this.overlay.classList.add('active');
            this._focusFirst();
        },

        hide: function () {
            if (this.overlay) {
                this.overlay.classList.remove('active');
            }
        },

        // ──────────────────────────────────────────────
        // 畫面
        // ──────────────────────────────────────────────

        /** 這個視窗現在能不能被略過？（強制設定密碼不能擋死離線的玩家） */
        _skippable: function () {
            return this._userOpened || this._connFailed || navigator.onLine === false;
        },

        /** 依目前分頁重畫整個視窗內容 */
        _switchTab: function (tab, opts) {
            opts = opts || {};
            const def = TABS[tab];
            this.tab = tab;
            this._armed = false;

            // 分頁列（migrate 模式沒有分頁）
            const tabsEl = document.getElementById('csTabs');
            const names = MODE_TABS[this.mode] || [];
            tabsEl.innerHTML = '';
            tabsEl.style.display = names.length ? 'flex' : 'none';
            names.forEach((name) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'cloud-save-tab' + (name === tab ? ' active' : '');
                // 已登入玩家的「登入」分頁，意思其實是切換到別的帳號
                b.textContent = (name === 'login' && this.mode === 'change') ? '切換帳號' : TABS[name].label;
                b.addEventListener('click', () => {
                    if (this._busy || name === this.tab) return;
                    if (window.SoundManager) window.SoundManager.playConfirmItem();
                    this._switchTab(name);
                    this._focusFirst();
                });
                tabsEl.appendChild(b);
            });

            document.getElementById('csTitle').textContent = def.title;
            document.getElementById('csDesc').textContent = def.desc;

            // 欄位顯示
            this.overlay.querySelectorAll('[data-field]').forEach((el) => {
                el.style.display = def.fields.indexOf(el.getAttribute('data-field')) >= 0 ? '' : 'none';
            });
            document.getElementById('csShowPinRow').style.display =
                (def.fields.indexOf('pin') >= 0 || def.fields.indexOf('oldpin') >= 0) ? '' : 'none';

            // 密碼欄每次換分頁都清空
            ['csPinOld', 'csPin', 'csPin2'].forEach((id) => { document.getElementById(id).value = ''; });

            // 暱稱欄的預設值：玩家自己動過就不要覆蓋
            const nickEl = document.getElementById('csInput');
            if (opts.nick !== undefined) {
                nickEl.value = opts.nick;
            } else if (!this._nickTouched) {
                nickEl.value = this._defaultNick(tab);
            }

            document.getElementById('csNickHint').textContent = '';
            this.showMessage('', false);

            const confirmBtn = document.getElementById('csBtnConfirm');
            confirmBtn.disabled = false;
            confirmBtn.textContent = def.btn;

            const cancelBtn = document.getElementById('csBtnCancel');
            cancelBtn.textContent = this._userOpened ? '取消' : '稍後再說';
            cancelBtn.style.display = this._skippable() ? 'block' : 'none';

            if (NICK_CHECK_TABS.indexOf(tab) >= 0) this._checkNickname();
        },

        /** 各分頁暱稱欄的預設值 */
        _defaultNick: function (tab) {
            if (tab === 'register') return window.SupabaseClient.getRandomAuthorName();
            if (tab === 'rename' || tab === 'migrate') {
                const d = window.ScoreManager ? window.ScoreManager.loadPlayerData() : null;
                if (d && d.nickname && d.nickname !== '訪客') return d.nickname;
                const id = window.SupabaseClient.getCurrentId();
                return id.indexOf('#') > 0 ? id.split('#')[0] : '';
            }
            return '';
        },

        _focusFirst: function () {
            const order = ['csInput', 'csPinOld', 'csPin', 'csPin2'];
            const fields = TABS[this.tab].fields;
            const map = { csInput: 'nick', csPinOld: 'oldpin', csPin: 'pin', csPin2: 'pin2' };
            for (const id of order) {
                if (fields.indexOf(map[id]) >= 0) {
                    const el = document.getElementById(id);
                    el.focus();
                    if (id === 'csInput') el.select();
                    return;
                }
            }
        },

        /** 暱稱欄下方的即時提示：這個暱稱能不能用 */
        _checkNickname: async function () {
            if (NICK_CHECK_TABS.indexOf(this.tab) < 0) return;
            const hint = document.getElementById('csNickHint');
            const nick = document.getElementById('csInput').value.trim();
            if (!nick) { hint.textContent = ''; return; }
            if (nick.indexOf('#') >= 0) {
                hint.textContent = '✗ 暱稱不可包含 # 符號';
                hint.className = 'cloud-save-nick-hint msg-error';
                return;
            }

            const seq = ++this._nickSeq;
            // 自己目前（或要認領）的暱稱不算被占用
            const selfId = this.tab === 'claim' ? this._claimId
                : (this.tab === 'register' ? '' : window.SupabaseClient.getCurrentId());
            const ok = await window.SupabaseClient.checkNicknameAvailable(nick, selfId);
            if (seq !== this._nickSeq) return;   // 玩家又打了新的字，這份回應已過期

            if (ok === true) {
                hint.textContent = '✓ 這個暱稱可以使用';
                hint.className = 'cloud-save-nick-hint msg-success';
            } else if (ok === false) {
                hint.textContent = '✗ 這個暱稱已有人使用';
                hint.className = 'cloud-save-nick-hint msg-error';
            } else {
                hint.textContent = '';   // 查不到（離線或伺服器未升級）：不顯示，送出時再處理
            }
        },

        // ──────────────────────────────────────────────
        // 送出
        // ──────────────────────────────────────────────

        /** 檢查輸入格式，回傳錯誤訊息；沒問題回傳空字串 */
        _validate: function (v) {
            const f = TABS[this.tab].fields;
            if (f.indexOf('nick') >= 0) {
                if (!v.nick) return '請輸入暱稱';
                if (v.nick.indexOf('#') >= 0) return '暱稱不可包含 # 符號';
            }
            if (f.indexOf('oldpin') >= 0 && !PIN_RE.test(v.oldPin)) return '請輸入目前的密碼（4 位數字）';
            if (f.indexOf('pin') >= 0 && !PIN_RE.test(v.pin)) return '密碼必須是 4 位數字';
            if (f.indexOf('pin2') >= 0 && v.pin2 !== v.pin) return '兩次輸入的密碼不一致';
            return '';
        },

        /** 舊引繼碼的「#」之後一律轉大寫（資料庫裡存的就是大寫，大小寫不同會查不到） */
        _normalizeLegacyCode: function (code) {
            const i = code.lastIndexOf('#');
            return code.slice(0, i + 1) + code.slice(i + 1).toUpperCase();
        },

        /** 把伺服器回傳的 reason 轉成玩家看得懂的話 */
        _reasonMessage: function (res) {
            switch (res.reason) {
                case 'taken': return '這個暱稱已經有人使用了，請換一個';
                case 'bad_nickname': return '暱稱格式不合（1～20 字，不可包含 #）';
                case 'bad_pin':
                    // 登入／改密碼時的 bad_pin 帶有 attempts_left，代表「密碼錯了」；
                    // 沒帶的是註冊／設定時「格式不是四位數字」
                    return (res.attempts_left !== undefined && res.attempts_left !== null)
                        ? '密碼錯誤，還可以再試 ' + res.attempts_left + ' 次'
                        : '密碼必須是 4 位數字';
                case 'not_found': return '找不到這個暱稱，請確認是否輸入正確';
                case 'locked': {
                    const min = Math.max(1, Math.ceil((res.locked_seconds || 900) / 60));
                    return '密碼錯誤次數過多，請 ' + min + ' 分鐘後再試';
                }
                case 'no_pin': return '這是尚未設定密碼的舊帳號。\n請在暱稱欄輸入舊的引繼碼（例如 李白#1234）來認領。';
                case 'already_set': return '這個舊帳號已經設定過密碼，請改用「暱稱＋密碼」登入';
                case 'no_player': return '雲端找不到這個舊帳號，請確認引繼碼是否正確';
                case 'server_not_ready': return '伺服器尚未完成升級，請稍後再試';
                default: return '無法連線到雲端，請檢查網路後再試';
            }
        },

        /** 統一的失敗處理：顯示訊息；連線類失敗時放行「稍後再說」 */
        _fail: function (res) {
            if (res.reason === 'network' || res.reason === 'no_sdk' || res.reason === 'server_not_ready') {
                this._connFailed = true;
                const cancelBtn = document.getElementById('csBtnCancel');
                cancelBtn.textContent = this._userOpened ? '取消' : '稍後再說';
                cancelBtn.style.display = 'block';
            }
            this.showMessage(this._reasonMessage(res));
        },

        submitForm: async function () {
            if (this._busy) return;
            if (window.SoundManager) window.SoundManager.playConfirmItem();

            const v = {
                nick: document.getElementById('csInput').value.trim(),
                oldPin: document.getElementById('csPinOld').value,
                pin: document.getElementById('csPin').value,
                pin2: document.getElementById('csPin2').value
            };

            // 登入欄輸入了舊的引繼碼 → 改走「認領舊帳號」，此時不需要密碼欄
            if (this.tab === 'login' && LEGACY_CODE_RE.test(v.nick)) {
                this._claimId = this._normalizeLegacyCode(v.nick);
                this._switchTab('claim', { nick: this._claimId.split('#')[0] });
                this._focusFirst();
                return;
            }

            const err = this._validate(v);
            if (err) { this.showMessage(err); return; }

            // 切換到另一個帳號前先提醒一次：這台裝置的進度會改成新帳號的進度
            const curId = window.SupabaseClient.getCurrentId();
            const switching = this.tab === 'login' || (this.tab === 'claim' && this._claimId !== curId);
            if (switching && this.mode === 'change' && curId && !this._armed) {
                this._armed = true;
                const d = window.ScoreManager ? window.ScoreManager.loadPlayerData() : null;
                const me = (d && d.nickname) || '目前帳號';
                this.showMessage('你目前登入的是「' + me + '」。\n切換後這台裝置會改用新帳號的進度（原帳號的進度仍保存在雲端）。\n再按一次確認。');
                return;
            }

            const btn = document.getElementById('csBtnConfirm');
            this._busy = true;
            btn.disabled = true;
            btn.textContent = '處理中...';
            this.showMessage('', false);

            try {
                if (this.tab === 'register') await this._doRegister(v);
                else if (this.tab === 'login') await this._doLogin(v);
                else if (this.tab === 'rename') await this._doRename(v);
                else if (this.tab === 'changepin') await this._doChangePin(v);
                else await this._doClaim(v);   // migrate／claim
            } catch (e) {
                console.error(e);
                this.showMessage('發生非預期錯誤');
            } finally {
                this._busy = false;
                btn.disabled = false;
                btn.textContent = TABS[this.tab].btn;
            }
        },

        /** 成功後稍等一下讓玩家看到訊息，再關閉視窗並通知呼叫端 */
        _finish: function (message, data, delay) {
            this.showMessage(message, false);
            const tab = this.tab;
            setTimeout(() => {
                this.complete(data);
                // 剛建立／登入帳號的玩家正是最需要「加到主畫面」的時候（確定會再回來玩）。
                // 安裝引導自己會判斷環境與是否已提醒過，這裡只負責遞上時機。
                if (['register', 'login', 'claim'].indexOf(tab) >= 0 && window.InstallGuide) {
                    setTimeout(() => window.InstallGuide.maybeShow('account'), 800);
                }
            }, delay || 1200);
        },

        _doRegister: async function (v) {
            const res = await window.SupabaseClient.register(v.nick, v.pin);
            if (!res.ok) { this._fail(res); return; }

            window.SupabaseClient.setCurrentId(res.id);
            // 把目前這台裝置上的進度（通常是剛玩完的第一局）存成這個新帳號的雲端進度。
            //
            // ⚠️ 這裡必須「等」存檔結果，而不是丟出去就算：帳號（密碼）已經建立，但 player_saves
            //    那一列若沒寫成功，下次啟動 syncOnStartup 會看到「雲端查無此帳號」，
            //    依規則把它當成「帳號被重置」而清空本機進度。存檔失敗時 saveGameToCloud
            //    會把本機標成「有未上傳的進度」，syncOnStartup 看到旗標就會改成補傳，不會清空。
            this.updateLocalNickname(v.nick);
            const saved = await window.SupabaseClient.saveGameToCloud(window.ScoreManager.loadPlayerData());
            this._finish(saved
                ? '建立成功！換裝置時請用「' + v.nick + '」和你的密碼登入。'
                : '帳號建立成功！進度暫時還沒上傳，連上網路後會自動補傳。\n換裝置時請用「' + v.nick + '」和你的密碼登入。',
                undefined, saved ? 2000 : 3500);
        },

        _doLogin: async function (v) {
            const res = await window.SupabaseClient.login(v.nick, v.pin);
            if (!res.ok) { this._fail(res); return; }

            const entered = await this._enterAccount(res.id, v.nick);
            if (entered) this._finish('登入成功！已載入雲端進度。', entered.data);
        },

        /** migrate（舊制玩家補設密碼）與 claim（以舊引繼碼認領）共用 */
        _doClaim: async function (v) {
            const currentId = window.SupabaseClient.getCurrentId();
            const id = this.tab === 'claim' ? this._claimId : currentId;
            const res = await window.SupabaseClient.claimLegacy(id, v.nick, v.pin);
            if (!res.ok) {
                // 這個舊帳號其實已經有密碼了：把玩家帶回登入分頁
                if (res.reason === 'already_set' && this.tab === 'claim') {
                    this._switchTab('login', { nick: v.nick });
                }
                this._fail(res);
                return;
            }

            if (id === currentId) {
                // 認領的就是這台裝置原本的帳號：進度本來就在，只需更新暱稱
                this.updateLocalNickname(v.nick);
                this._finish('設定完成！之後請用「' + v.nick + '」和你的密碼登入。', undefined, 1800);
            } else {
                const entered = await this._enterAccount(id, v.nick);
                if (entered) this._finish('認領成功！已載入雲端進度。', entered.data);
            }
        },

        _doRename: async function (v) {
            const id = window.SupabaseClient.getCurrentId();
            const res = await window.SupabaseClient.renameAccount(id, v.nick);
            if (!res.ok) {
                // 舊制帳號還沒有密碼，連帶也還沒有暱稱登記：請他先走設定密碼
                if (res.reason === 'not_found') {
                    this._switchTab('migrate');
                    this.showMessage('這個帳號還沒設定密碼，請先完成設定。');
                    return;
                }
                this._fail(res);
                return;
            }
            this.updateLocalNickname(v.nick);
            this._finish('更改暱稱成功！', undefined, 1000);
        },

        _doChangePin: async function (v) {
            const id = window.SupabaseClient.getCurrentId();
            const res = await window.SupabaseClient.changePin(id, v.oldPin, v.pin);
            if (!res.ok) {
                if (res.reason === 'no_pin' || res.reason === 'not_found') {
                    this._switchTab('migrate');
                    this.showMessage('這個帳號還沒設定密碼，請先完成設定。');
                    return;
                }
                this._fail(res);
                return;
            }
            this._finish('密碼已更新！', undefined, 1000);
        },

        /**
         * 登入／認領成功後，把這個帳號的雲端進度載回本機。
         * @returns {Promise<{data:object|null}|null>} 失敗回 null（此時不會動到本機的帳號綁定）
         */
        _enterAccount: async function (id, nick) {
            const S = window.SupabaseClient;
            const prevId = S.getCurrentId();
            const res = await S.fetchSave(id);

            if (!res.ok) {
                // 密碼對了但讀不到進度：先不要換綁定，免得本機變成「新帳號＋舊進度」
                this._connFailed = true;
                this.showMessage('密碼正確，但讀取雲端進度失敗，請稍後再試');
                return null;
            }

            if (res.found) {
                this.applyCloudDataToLocal(res.data, id);
                return { data: res.data };
            }

            // 帳號存在，但雲端還沒有進度列（例如測試期被重置過）。
            // 若是從別的帳號切換過來，要先清掉本機，免得把前一個帳號的進度灌進這個帳號。
            if (prevId && prevId !== id && window.ScoreManager
                && typeof window.ScoreManager.resetAll === 'function') {
                await window.ScoreManager.resetAll({ cloud: false, keepId: true });
            }
            S.setCurrentId(id);
            this.updateLocalNicknameAndSave(nick);
            return { data: null };
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
            window.SupabaseClient.setCurrentId(id);
            // 套用雲端資料 = 以雲端為準，本機先前「尚未上傳」的標記不再有意義
            window.SupabaseClient.markCloudDirty(false);

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
            localData.poemRecords  = cloudData.poem_records || {};
            localData.settings = cloudData.settings || { bgm: true, soundEffects: true };

            // 關卡相關的三個欄位存放在雲端的 achievements 底下
            //   _levelCleared = 各遊戲的通關紀錄（青雲梯據此計算「三種提取方式」）
            //   _levelDonated = 捐納跳關的關卡
            //   _levelFails   = 各關卡失敗次數
            //
            // ⚠️ 一律以雲端為準，**不再回退到本機舊值**。
            //    舊版寫成「雲端為空就沿用本機」，等於雲端清空後本機仍會復活，
            //    使用者實際遇過：清了雲端，成就頁照樣要求領取「縣案首」獎狀。
            const ach = cloudData.achievements || {};
            localData.achievements = {
                unlocked: ach.unlocked || [],
                progress: ach.progress || {},
                claimed:  ach.claimed  || []
            };
            localData.levelCleared = ach._levelCleared || {};
            localData.levelDonated = ach._levelDonated || {};
            localData.levelFails   = ach._levelFails   || {};
            localData.pathRounds   = ach._pathRounds   || 0;

            localStorage.setItem('flowerMoon_playerData', JSON.stringify(localData));

            // 江南小院收集系統（文錢、考試通過紀錄、考試次數、田地/茶寮/酒窖…）
            // 雲端若沒有這一包（欄位尚未建立或舊存檔）則保留本機，不覆蓋成空的。
            try {
                if (window.FMCollectionSave && typeof window.FMCollectionSave.applyCloudData === 'function') {
                    window.FMCollectionSave.applyCloudData(cloudData.collection);
                }
            } catch (e) {
                console.warn('[雲端] 套用收集系統資料失敗:', e);
            }

            // 青雲梯的進度快取必須失效，否則畫面仍是同步前的舊進度
            try {
                if (window.LearningPath && typeof window.LearningPath.invalidateProgress === 'function') {
                    window.LearningPath.invalidateProgress();
                }
            } catch (e) { /* 青雲梯尚未初始化時忽略 */ }

            // 重新刷新 UI
            if (window.ScoreManager) {
                window.ScoreManager.updateProfileUI(localData);
            }
        },

        complete: function (data) {
            this.hide();
            // 註冊／改名／認領後，畫面上的暱稱要跟著更新（以前只有登入會刷新）
            try {
                if (window.ScoreManager && typeof window.ScoreManager.updateProfileUI === 'function') {
                    window.ScoreManager.updateProfileUI(window.ScoreManager.loadPlayerData());
                }
            } catch (e) { /* 個人頁尚未初始化時忽略 */ }
            if (this.successCallback) this.successCallback(data);
        }
    };

    window.CloudSaveDialog = CloudSaveDialog;
})();
