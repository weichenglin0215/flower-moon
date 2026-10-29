/**
 * 「加到主畫面」安裝引導（window.InstallGuide）
 *
 * 要解決的問題：朋友掃 QR Code 玩過一次，之後找不到連結、無法再玩。
 * 解法是讓花月變成手機主畫面上的一個圖示。但「怎麼加」依環境完全不同，
 * 所以這支檔案的核心是「先判斷環境，再顯示對應的教學」：
 *
 *   inapp          LINE／FB／IG 內建瀏覽器：不能加入主畫面，要先請玩家改用手機瀏覽器開啟
 *   ios-safari     iOS Safari：分享 → 加入主畫面
 *   ios-other      iOS 的 Chrome／Firefox／Edge：iOS 16.4 起同樣可從分享選單加入
 *   native         Android Chrome 等：瀏覽器會給 beforeinstallprompt，可一鍵安裝
 *   android-manual Android 但沒有安裝事件：教玩家從瀏覽器選單安裝
 *   desktop        電腦：不自動提醒（手動從選單開啟仍可看到說明）
 *
 * 提醒頻率：
 *   · 一般環境「只提醒一次」（第二次開啟網頁、或剛建立／登入帳號之後），之後只能從選單手動開啟。
 *   · 內建瀏覽器每 3 天再提醒一次 —— 玩家留在那裡玩，進度與離線功能都不可靠，值得多提醒。
 *   · 已經是主畫面 App 就完全不提醒。
 *
 * ⚠️ 帳號制度是「暱稱＋四位數密碼」，沒有可以顯示的引繼碼。
 *    安裝引導只能提醒玩家「記住你的暱稱與密碼」，絕不能顯示或儲存密碼。
 *
 * ⚠️ 本檔自己擁有 localStorage 鍵 fm_install_guide（提醒紀錄），不屬於玩家存檔。
 */
(function () {
    'use strict';

    var E = window.FMEnv;
    var STORE_KEY = 'fm_install_guide';
    var INAPP_REPEAT_MS = 3 * 24 * 3600 * 1000;   // 內建瀏覽器的再提醒間隔
    var AUTO_DELAY_MS = 4000;                      // 載入後等幾秒才自動提醒，別搶在畫面還在載入時

    var deferredPrompt = null;    // Android Chrome 的安裝事件（要等它觸發才能做一鍵安裝）
    var overlay = null;

    // 分享圖示（方框＋向上箭頭），與 qr-dialog.js 同一個形狀，玩家在瀏覽器裡看到的就是這個
    var SHARE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="fm-ig-ico">' +
        '<polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>' +
        '<path d="M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/></svg>';

    // ── 提醒紀錄 ────────────────────────────────────────────

    function loadState() {
        try {
            var s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
            s.visits = s.visits || 0;
            s.shown = s.shown || {};
            return s;
        } catch (e) { return { visits: 0, shown: {} }; }
    }

    function saveState(s) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* 無痕模式忽略 */ }
    }

    // ── 環境判斷 ────────────────────────────────────────────

    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();          // 擋掉瀏覽器自己的小橫幅，改由我們選時機顯示
        deferredPrompt = e;
    });

    window.addEventListener('appinstalled', function () {
        deferredPrompt = null;
        if (overlay) close();
    });

    function getKind() {
        if (E.isInApp) return 'inapp';
        if (E.isIOS) return E.iosBrowser === 'safari' ? 'ios-safari' : 'ios-other';
        if (deferredPrompt) return 'native';
        if (E.isAndroid) return 'android-manual';
        return 'desktop';
    }

    // ── 小工具 ──────────────────────────────────────────────

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function copyText(text, btn) {
        var orig = btn.textContent;
        var done = function () {
            btn.textContent = '✓ 已複製';
            setTimeout(function () { btn.textContent = orig; }, 2200);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
        } else {
            fallbackCopy(text);
            done();
        }
    }

    function fallbackCopy(text) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* 忽略 */ }
        document.body.removeChild(ta);
    }

    /** Android 內建瀏覽器 → 用 intent 直接喚起 Chrome（失敗時退回原網址） */
    function chromeIntentUrl() {
        var u = new URL(E.cleanUrl());
        return 'intent://' + u.host + u.pathname + '#Intent;scheme=https;package=com.android.chrome;' +
            'S.browser_fallback_url=' + encodeURIComponent(u.href) + ';end';
    }

    function button(label, cls, onClick) {
        var b = el('button', 'fm-ig-btn ' + cls, label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    // ── 各環境的內容 ────────────────────────────────────────

    /** 回傳 { title, intro, steps:[ node|string ], actions:[button] } */
    function contentFor(kind) {
        var url = E.cleanUrl();
        var steps = [], actions = [];

        if (kind === 'inapp') {
            var name = E.inAppBrowser;
            var intro = '你現在是在「' + name + '」裡面開啟花月。這裡不能加到主畫面，' +
                '而且進度會存在這個內建瀏覽器裡，換到別的瀏覽器就看不到了。請改用手機的瀏覽器開啟：';
            if (E.isAndroid) {
                actions.push(button('用 Chrome 開啟', 'fm-ig-btn-primary', function () {
                    window.location.href = chromeIntentUrl();
                }));
                steps.push('或點右上角「⋮」，選「在瀏覽器中開啟」。');
            } else {
                steps.push('點畫面右下角（或右上角）的「⋯」或分享圖示');
                steps.push('選「用 Safari 開啟」或「在預設瀏覽器開啟」');
            }
            var copyBtn = button('複製連結', 'fm-ig-btn-secondary', function () { copyText(url, copyBtn); });
            actions.push(copyBtn);
            return { title: '請改用瀏覽器開啟', intro: intro, steps: steps, actions: actions, ordered: !E.isAndroid };
        }

        if (kind === 'ios-safari') {
            steps.push(['點瀏覽器的「分享」圖示 ', SHARE_SVG, '（方框加向上箭頭）']);
            steps.push('往下滑，選「加入主畫面」');
            steps.push('按右上角「加入」，主畫面就會出現「花月」圖示');
            return { title: '把花月放到主畫面', intro: '加到主畫面後，下次點一下圖示就能玩，不必再找連結，也能離線遊玩。',
                steps: steps, actions: actions, ordered: true };
        }

        if (kind === 'ios-other') {
            var br = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge' }[E.iosBrowser] || '這個瀏覽器';
            steps.push(['點「' + br + '」網址列旁的「分享」圖示 ', SHARE_SVG]);
            steps.push('選「加入主畫面」');
            steps.push('按「加入」，主畫面就會出現「花月」圖示');
            return { title: '把花月放到主畫面',
                intro: '加到主畫面後，下次點一下圖示就能玩，不必再找連結，也能離線遊玩。' +
                    '（需要 iOS 16.4 以上；找不到「加入主畫面」的話，請改用 Safari 開啟本頁。）',
                steps: steps, actions: actions, ordered: true };
        }

        if (kind === 'native') {
            actions.push(button('立即安裝', 'fm-ig-btn-primary', function () {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function () { deferredPrompt = null; close(); });
            }));
            return { title: '把花月放到主畫面', intro: '安裝後，下次點一下圖示就能玩，不必再找連結，也能離線遊玩。',
                steps: steps, actions: actions };
        }

        if (kind === 'android-manual') {
            steps.push('點瀏覽器右上角的「⋮」選單');
            steps.push('選「安裝應用程式」或「加到主畫面」');
            return { title: '把花月放到主畫面', intro: '加到主畫面後，下次點一下圖示就能玩，不必再找連結，也能離線遊玩。',
                steps: steps, actions: actions, ordered: true };
        }

        // desktop：只有手動開啟才會到這裡
        steps.push('Chrome／Edge：點網址列右側的「安裝」圖示');
        steps.push('或在選單選「安裝花月」');
        return { title: '安裝花月', intro: '安裝後可以像一般程式一樣開啟，也能離線遊玩。', steps: steps, actions: actions };
    }

    /** 帳號提醒：玩家最需要記的是暱稱與密碼 */
    function accountBlock() {
        var box = el('div', 'fm-ig-account');
        var S = window.SupabaseClient;
        var hasId = !!(S && S.getCurrentId && S.getCurrentId());

        if (hasId) {
            var nick = '';
            try { nick = (window.ScoreManager && window.ScoreManager.loadPlayerData().nickname) || ''; } catch (e) { /* 忽略 */ }
            box.appendChild(el('div', 'fm-ig-account-title', '請記住你的帳號'));
            box.appendChild(el('div', 'fm-ig-account-text',
                '暱稱：' + (nick || '（未設定）') + '\n換手機或瀏覽器時，輸入「暱稱＋四位數密碼」就能接續進度。'));
        } else {
            box.appendChild(el('div', 'fm-ig-account-title', '還沒有帳號'));
            box.appendChild(el('div', 'fm-ig-account-text',
                '建立帳號後，換手機或瀏覽器也能用「暱稱＋密碼」接續進度。'));
            box.appendChild(button('建立帳號', 'fm-ig-btn-secondary fm-ig-btn-small', function () {
                close();
                if (window.CloudSaveDialog) window.CloudSaveDialog.show({ mode: 'change' });
            }));
        }
        return box;
    }

    // ── 顯示／關閉 ──────────────────────────────────────────

    function close() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    function recordShown(kind) {
        var s = loadState();
        s.shown[kind] = Date.now();
        saveState(s);
    }

    /**
     * 顯示引導卡片。
     * @param {object} [opts]
     * @param {boolean} [opts.force] 手動開啟（選單）：不受「只提醒一次」與開發網址限制
     */
    function show(opts) {
        opts = opts || {};
        if (overlay) return;
        var kind = getKind();
        var c = contentFor(kind);

        overlay = el('div', 'fm-ig-overlay');
        var card = el('div', 'fm-ig-card');
        card.appendChild(el('div', 'fm-ig-title', c.title));
        card.appendChild(el('div', 'fm-ig-intro', c.intro));

        if (c.steps.length) {
            var list = el('div', 'fm-ig-steps');
            c.steps.forEach(function (st, i) {
                var row = el('div', 'fm-ig-step');
                row.appendChild(el('span', 'fm-ig-step-no', c.ordered === false ? '•' : String(i + 1)));
                var body = el('span', 'fm-ig-step-text');
                if (Array.isArray(st)) {
                    // 陣列：文字與 SVG 圖示混排（SVG 是本檔常數，不含使用者輸入）
                    st.forEach(function (part) {
                        if (part.charAt(0) === '<') body.insertAdjacentHTML('beforeend', part);
                        else body.appendChild(document.createTextNode(part));
                    });
                } else {
                    body.textContent = st;
                }
                row.appendChild(body);
                list.appendChild(row);
            });
            card.appendChild(list);
        }

        if (c.actions.length) {
            var acts = el('div', 'fm-ig-actions');
            c.actions.forEach(function (a) { acts.appendChild(a); });
            card.appendChild(acts);
        }

        // 內建瀏覽器的玩家要先離開才有意義，帳號提醒放在那之後；其他環境一併顯示
        if (kind !== 'inapp') card.appendChild(accountBlock());

        card.appendChild(button(kind === 'inapp' ? '先在這裡玩' : '知道了', 'fm-ig-btn-close', function () {
            if (window.SoundManager && window.SoundManager.playCloseItem) window.SoundManager.playCloseItem();
            close();
        }));

        overlay.appendChild(card);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.body.appendChild(overlay);

        if (!opts.force) recordShown(kind);
    }

    /**
     * 依規則決定要不要自動提醒。
     * @param {string} reason 'visit'（開啟網頁）｜'account'（剛建立／登入帳號）
     */
    function maybeShow(reason) {
        if (E.isStandalone()) return;
        if (E.isDevHost()) return;
        var kind = getKind();
        if (kind === 'desktop') return;

        var s = loadState();
        var last = s.shown[kind] || 0;
        if (kind === 'inapp') {
            if (last && Date.now() - last < INAPP_REPEAT_MS) return;
        } else {
            if (last) return;                              // 只提醒一次
            if (reason === 'visit' && s.visits < 2) return; // 第一次來玩先不打擾
        }

        // 別蓋在帳號視窗上：兩個視窗疊在一起，玩家兩邊都看不懂
        var busy = document.querySelector('.cloud-save-overlay.active');
        if (busy) { setTimeout(function () { maybeShow(reason); }, 3000); return; }

        show();
    }

    // ── 啟動 ────────────────────────────────────────────────

    function boot() {
        var s = loadState();
        s.visits += 1;
        saveState(s);
        setTimeout(function () { maybeShow('visit'); }, AUTO_DELAY_MS);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();

    window.InstallGuide = {
        show: function () { show({ force: true }); },
        maybeShow: maybeShow,
        getKind: getKind,
        /** 此環境能不能一鍵安裝（Android Chrome 等） */
        canInstallNatively: function () { return !!deferredPrompt; },
        close: close
    };
})();
