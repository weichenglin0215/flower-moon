/**
 * 「提意見」彈窗（window.FeedbackDialog）
 * ============================================================================
 *
 * 讓玩家把遊戲經驗寫下來，供開發者之後優化參考。兩個入口：
 *
 *   ① 每款遊戲的結算彈窗（GameMessage）裡，「下一關／再試一次」左邊的「提意見」
 *        → FeedbackDialog.show({ scope: 'game', gameKey: 'game22' })
 *        意見會記著是哪一款遊戲，後台可以分遊戲看。
 *   ② 漢堡選單「關於花月」右邊的「提意見」（menu.js 的 page: 'feedback'）
 *        → FeedbackDialog.show({ scope: 'system' })
 *        系統面或全面性的問題（介面、功能、操作、錯誤、想要的新玩法…）。
 *
 * 送出一律走 SupabaseClient.submitFeedback（資料庫函式 fm_submit_feedback，見
 * note/玩家意見_SQL草案.sql）。它負責清理內容、離線時先存在本機、之後補送；
 * 本檔只負責畫面。後台查閱在 tools/db_viewer.html 的「玩家意見查閱」。
 *
 * 畫面沿用 installGuide.css／offlineDialog.js 的 `fm-ig-*` 外觀（宣紙底、金色邊框、
 * 疊在整個視窗上而不是 500×850 舞台內）；本檔自己的樣式在 feedbackDialog.css（前綴 fm-fb-）。
 *
 * ⚠️ 所有玩家輸入與外來文字一律用 textContent 寫入，不拼接 HTML。
 */
(function () {
    'use strict';

    // ── loadCSS 防護（index.html 也有靜態 <link id="feedback-dialog-css">，有 id 就不會重複載入）──
    if (!document.getElementById('feedback-dialog-css')) {
        const link = document.createElement('link');
        link.id = 'feedback-dialog-css';
        link.rel = 'stylesheet';
        link.href = 'feedbackDialog.css';
        document.head.appendChild(link);
    }

    let overlay = null;       // 目前開著的彈窗（同一時間只開一個）
    let appVersion = null;    // version.json 的版本號，開彈窗時背景去抓，送出時帶上

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    /** 遊戲代號 → 中文名稱（沿用成就頁的對照表，找不到就退回代號本身） */
    function getGameTitle(key) {
        try {
            const names = window.AchievementDialog && window.AchievementDialog.gameNames;
            if (names && names[key]) return names[key];
        } catch (e) { /* 對照表還沒載入 */ }
        return String(key || '');
    }

    /** 背景取得版本號（只抓一次；失敗就不帶版本，意見照送）。⚠️ 回應一定要讀完，不能讓串流掛著（§3.5 第 5 點）。 */
    function prefetchVersion() {
        if (appVersion !== null || typeof fetch !== 'function') return;
        appVersion = '';   // 先占位，避免重複抓
        fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : r.text().then(function () { return null; }); })
            .then(function (info) { if (info && info.version) appVersion = String(info.version); })
            .catch(function () { /* 離線或抓不到：不影響意見送出 */ });
    }

    function playSound(name) {
        try { if (window.SoundManager && window.SoundManager[name]) window.SoundManager[name](); } catch (e) { /* 音效失敗不影響功能 */ }
    }

    function show(opts) {
        if (overlay) return;
        const o = opts || {};
        const S = window.SupabaseClient;
        const scope = (o.scope === 'game' && o.gameKey) ? 'game' : 'system';
        const gameKey = scope === 'game' ? String(o.gameKey) : null;
        const gameTitle = scope === 'game' ? (o.gameTitle || getGameTitle(gameKey)) : '';
        const max = (S && S.FEEDBACK_MAX) || 500;
        prefetchVersion();

        overlay = el('div', 'fm-ig-overlay fm-fb-overlay');
        const card = el('div', 'fm-ig-card fm-fb-card');
        card.appendChild(el('div', 'fm-ig-title', '提意見'));
        card.appendChild(el('div', 'fm-fb-sub', scope === 'game'
            ? '針對〈' + gameTitle + '〉'
            : '針對整個花月（介面、功能、操作、錯誤…）'));

        const ta = el('textarea', 'fm-fb-input');
        ta.rows = 7;
        ta.maxLength = max;
        ta.setAttribute('aria-label', '你的意見');
        ta.placeholder = scope === 'game'
            ? '這款遊戲哪裡好玩、哪裡不好玩、哪裡看不懂、太難或太簡單…想說什麼都可以。'
            : '介面好不好用、哪裡看不懂、遇到什麼問題、想要什麼新功能…想說什麼都可以。';
        // 輸入框裡的按鍵不要往上傳：有些遊戲在 document 上監聽方向鍵／空白鍵，
        // 從選單開啟本彈窗時遊戲可能還在背景，不擋的話打字會操作到遊戲。
        ['keydown', 'keyup', 'keypress'].forEach(function (t) {
            ta.addEventListener(t, function (e) { e.stopPropagation(); });
        });
        card.appendChild(ta);

        const count = el('div', 'fm-fb-count', '0 / ' + max);
        card.appendChild(count);
        const status = el('div', 'fm-fb-status');
        card.appendChild(status);

        const actions = el('div', 'fm-fb-actions');
        const cancelBtn = el('button', 'fm-ig-btn fm-ig-btn-secondary fm-fb-btn', '取消');
        const sendBtn = el('button', 'fm-ig-btn fm-ig-btn-primary fm-fb-btn', '送出');
        cancelBtn.type = 'button';
        sendBtn.type = 'button';
        actions.appendChild(cancelBtn);
        actions.appendChild(sendBtn);
        card.appendChild(actions);
        overlay.appendChild(card);

        let busy = false;
        let autoCloseTimer = null;

        function cleaned() {
            return S && S.cleanFeedbackText ? S.cleanFeedbackText(ta.value) : String(ta.value || '').trim();
        }
        function sync() {
            count.textContent = Array.from(ta.value).length + ' / ' + max;
            sendBtn.disabled = busy || Array.from(cleaned()).length < 2;
        }
        function setStatus(text, kind) {
            status.textContent = text || '';
            status.className = 'fm-fb-status' + (kind ? ' fm-fb-status-' + kind : '');
        }
        function close() {
            if (autoCloseTimer) { clearTimeout(autoCloseTimer); autoCloseTimer = null; }
            playSound('playCloseItem');
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            overlay = null;
            if (typeof o.onClose === 'function') { try { o.onClose(); } catch (e) { /* 呼叫端的錯誤不影響關閉 */ } }
        }
        /** 送出成功／已排隊：換成一句話的結果畫面，過幾秒自動關掉 */
        function showDone(message, ms) {
            card.textContent = '';
            card.appendChild(el('div', 'fm-ig-title', '提意見'));
            card.appendChild(el('div', 'fm-fb-done', message));
            const closeBtn = el('button', 'fm-ig-btn fm-ig-btn-close', '關閉');
            closeBtn.type = 'button';
            closeBtn.addEventListener('click', close);
            card.appendChild(closeBtn);
            autoCloseTimer = setTimeout(close, ms);
        }

        async function send() {
            if (busy || !S || typeof S.submitFeedback !== 'function') return;
            const text = cleaned();
            if (Array.from(text).length < 2) return;
            busy = true;
            sendBtn.textContent = '送出中…';
            setStatus('');
            sync();
            playSound('playConfirmItem');
            let res = null;
            try {
                res = await S.submitFeedback({
                    scope: scope, gameKey: gameKey, gameTitle: gameTitle, message: text, version: appVersion || null
                });
            } catch (e) {
                console.warn('[提意見] 送出時發生錯誤:', e);
            }
            if (!overlay) return;   // 等待期間玩家已經關掉了彈窗
            busy = false;
            const st = res && res.status;
            if (st === 'sent') {
                showDone('謝謝你的意見，我們收到了！', 1800);
            } else if (st === 'queued') {
                showDone('目前連不上網路，意見先存在這支手機，下次連線時會自動送出。謝謝你！', 3200);
            } else {
                sendBtn.textContent = '送出';
                setStatus(st === 'too-many'
                    ? '今天寄的意見有點多，明天再寄吧！'
                    : '這次沒有送成功，請稍後再試。', 'warn');
                sync();
            }
        }

        ta.addEventListener('input', sync);
        cancelBtn.addEventListener('click', close);
        sendBtn.addEventListener('click', send);
        // 點背景關閉：只有輸入框是空的才關，免得手滑點到背景就把寫好的意見弄丟
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !ta.value.trim() && !busy) close();
        });

        document.body.appendChild(overlay);
        sync();
        try { ta.focus(); } catch (e) { /* 部分瀏覽器不允許程式聚焦 */ }
    }

    function close() {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    window.FeedbackDialog = {
        show: show,
        close: close,
        isOpen: function () { return !!overlay; },
        getGameTitle: getGameTitle
    };
})();
