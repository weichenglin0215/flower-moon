/**
 * 「離線與安裝」頁面（window.OfflineDialog）— 選單項目 offline
 *
 * 讓玩家一眼看到：有沒有加到主畫面、能不能離線玩、大圖片有沒有下載、進度有沒有同步，
 * 並提供「下載完整離線包」「檢查更新」「清除離線資料」三個動作。
 *
 * 資料與動作都來自 offline.js（window.FMOffline）；這裡只負責畫面。
 * 所有文字一律用 textContent 寫入，不拼接 HTML。
 */
(function () {
    'use strict';

    var overlay = null;
    var body = null;
    var dl = null;            // 下載中的狀態 { token, done, total, bytesDone, bytesTotal }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function btn(label, cls, onClick) {
        var b = el('button', 'fm-ig-btn fm-off-btn ' + cls, label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }

    function fmt(n) { return window.FMOffline.formatBytes(n); }

    /** 一列：標題＋說明文字＋（可選）按鈕／進度條 */
    function row(title, text, extra) {
        var r = el('div', 'fm-off-row');
        r.appendChild(el('div', 'fm-off-row-title', title));
        r.appendChild(el('div', 'fm-off-row-text', text));
        if (extra) (Array.isArray(extra) ? extra : [extra]).forEach(function (n) { r.appendChild(n); });
        return r;
    }

    function progressBar() {
        var wrap = el('div', 'fm-off-bar');
        var fill = el('div', 'fm-off-bar-fill');
        wrap.appendChild(fill);
        wrap._fill = fill;
        return wrap;
    }

    // ── 各區塊 ──────────────────────────────────────────────

    function installRow(s) {
        if (s.standalone) return row('加到主畫面', '✓ 已經加到主畫面了');
        var text = s.inApp
            ? '目前在「' + s.inApp + '」內建瀏覽器裡，無法加到主畫面，也無法離線遊玩。'
            : '還沒有加到主畫面。加了之後，點一下圖示就能玩，不必再找連結。';
        var how = btn(s.inApp ? '怎麼辦？' : '加到主畫面', 'fm-ig-btn-primary fm-ig-btn-small', function () {
            if (window.InstallGuide) window.InstallGuide.show();
        });
        return row('加到主畫面', text, how);
    }

    function offlineRow(s) {
        var why = s.blocked;
        var title = '離線遊玩';
        var extra = [];

        if (why === 'inapp') return row(title, '內建瀏覽器不支援離線遊玩，請改用手機的瀏覽器開啟。');
        if (why === 'unsupported') return row(title, '這個瀏覽器不支援離線遊玩。');
        if (why === 'insecure') return row(title, '需要 https 連線才能離線遊玩。');
        if (why === 'dev') return row(title, '開發網址預設不啟用離線功能（網址加 ?sw=1 可以測試）。');
        if (why === 'disabled' || why === 'savedata') {
            var text = why === 'savedata'
                ? '偵測到「省流量」模式，沒有自動下載遊戲檔案（約需 10 MB）。'
                : '離線遊玩已停用。';
            extra.push(btn('啟用離線遊玩', 'fm-ig-btn-primary fm-ig-btn-small', function () {
                window.FMOffline.enable().then(function () { setTimeout(render, 1500); });
            }));
            return row(title, text, extra);
        }

        if (window.FMOffline.hasWaitingUpdate()) {
            extra.push(btn('立即更新', 'fm-ig-btn-primary fm-ig-btn-small', function () {
                window.FMOffline.applyUpdate();
            }));
            return row(title, '新版本已經準備好了。', extra);
        }
        if (s.coreReady) {
            return row(title, '✓ 已就緒（版本 ' + s.version + '）。沒有網路時也可以玩。');
        }
        extra.push(btn('重新檢查', 'fm-ig-btn-secondary fm-ig-btn-small', render));
        return row(title, s.controlled
            ? '正在準備離線檔案，請稍候一下再回來看。'
            : '第一次開啟時會在背景下載遊戲檔案（約 10 MB），完成後就能離線遊玩。', extra);
    }

    function packRow(s) {
        // 離線包是放進 Service Worker 讀的快取，SW 沒啟用時下載了也用不到
        if (s.blocked) return null;
        var p = s.pack;
        if (!p.total) return null;
        var title = '完整離線包';
        var remain = p.bytesTotal - p.bytesCached;

        if (dl) {
            var bar = progressBar();
            var info = el('div', 'fm-off-row-text', '下載中… ' + dl.done + ' / ' + dl.total);
            var cancel = btn('取消', 'fm-ig-btn-secondary fm-ig-btn-small', function () { dl.token.cancelled = true; });
            var r = row(title, '', [bar, info, cancel]);
            // 進度更新時只改這兩個元素，不重畫整頁（否則按鈕會閃、進度條會從頭長）
            dl.bar = bar; dl.info = info;
            updateProgress();
            return r;
        }

        if (p.cached >= p.total) {
            return row(title, '✓ 已下載（' + p.total + ' 個檔案，' + fmt(p.bytesTotal) + '）。獎狀、古地圖等大圖片離線也看得到。');
        }
        var go = btn('下載完整離線包（約 ' + fmt(remain) + '）', 'fm-ig-btn-primary fm-ig-btn-small', startDownload);
        if (!s.online) go.disabled = true;
        return row(title,
            '獎狀、古地圖等大圖片已下載 ' + p.cached + ' / ' + p.total + '。沒下載的圖片，離線時會看不到。' +
            (s.online ? '建議使用 Wi-Fi 下載。' : '（需要連線才能下載）'), go);
    }

    function syncRow(s) {
        var text;
        if (s.pending > 0 || s.dirty) {
            text = '有' + (s.dirty ? '尚未上傳的進度' : '') + (s.dirty && s.pending ? '與 ' : '') +
                (s.pending ? s.pending + ' 筆遊戲紀錄' : '') + '，連上網路後會自動上傳。';
        } else {
            text = '✓ 進度與紀錄都已同步';
        }
        var extra = [];
        if ((s.pending > 0 || s.dirty) && s.online && window.SupabaseClient) {
            extra.push(btn('立即同步', 'fm-ig-btn-secondary fm-ig-btn-small', function () {
                window.SupabaseClient.flushPending().then(function () { render(); });
            }));
        }
        return row('雲端同步', text, extra.length ? extra : null);
    }

    function storageRow(s) {
        var st = s.storage;
        if (st.usage == null) return null;
        var text = '已使用 ' + fmt(st.usage) + (st.quota ? '（上限約 ' + fmt(st.quota) + '）' : '');
        if (st.persisted === true) text += '\n✓ 已申請長期保留，不容易被系統清掉';
        else if (st.persisted === false) text += '\n尚未取得長期保留；加到主畫面後最穩定';
        return row('儲存空間', text);
    }

    // ── 下載 ────────────────────────────────────────────────

    function updateProgress() {
        if (!dl || !dl.bar) return;
        var ratio = dl.bytesTotal ? dl.bytesDone / dl.bytesTotal : (dl.total ? dl.done / dl.total : 0);
        dl.bar._fill.style.width = Math.min(100, Math.round(ratio * 100)) + '%';
        dl.info.textContent = '下載中… ' + dl.done + ' / ' + dl.total + '（' + fmt(dl.bytesDone) + ' / ' + fmt(dl.bytesTotal) + '）';
    }

    function startDownload() {
        if (dl) return;
        dl = { token: { cancelled: false }, done: 0, total: 0, bytesDone: 0, bytesTotal: 0 };
        render();
        window.FMOffline.downloadPack(function (p) {
            if (!dl) return;
            dl.done = p.done; dl.total = p.total; dl.bytesDone = p.bytesDone; dl.bytesTotal = p.bytesTotal;
            updateProgress();
        }, dl.token).then(function (res) {
            dl = null;
            render().then(function () {
                // 結果訊息放在最上面，玩家不必捲動就看到
                var msg = res.ok ? '✓ 離線包下載完成'
                    : res.quota ? '儲存空間不足，已停止下載。請清出空間後再試。'
                    : res.cancelled ? '已取消下載，下載好的檔案會保留。'
                    : '有 ' + res.failed.length + ' 個檔案下載失敗，請確認網路後再試一次。';
                var note = el('div', 'fm-off-note' + (res.ok ? ' fm-off-note-ok' : ''), msg);
                if (body) body.insertBefore(note, body.firstChild);
            });
        });
    }

    // ── 畫面 ────────────────────────────────────────────────

    function render() {
        if (!overlay) return Promise.resolve();
        return window.FMOffline.status().then(function (s) {
            if (!overlay) return;
            body.textContent = '';
            if (!s.online) body.appendChild(el('div', 'fm-off-note', '目前離線中。可以繼續玩，進度會先存在這台裝置。'));

            [installRow(s), offlineRow(s), packRow(s), syncRow(s), storageRow(s)].forEach(function (r) {
                if (r) body.appendChild(r);
            });

            var foot = el('div', 'fm-off-foot');
            foot.appendChild(btn('檢查更新', 'fm-ig-btn-secondary fm-ig-btn-small', function (e) {
                var b = e.currentTarget;
                b.textContent = '檢查中…';
                window.FMOffline.checkUpdate().then(function () {
                    setTimeout(function () {
                        b.textContent = window.FMOffline.hasWaitingUpdate() ? '有新版本，請看上方' : '已是最新版本';
                        render();
                    }, 1500);
                });
            }));
            foot.appendChild(btn('清除離線資料', 'fm-ig-btn-secondary fm-ig-btn-small', function () {
                if (!window.confirm('清除所有離線檔案並重新載入？\n（玩家的進度與帳號不會受影響，之後需要重新下載。）')) return;
                window.FMOffline.reset();
            }));
            body.appendChild(foot);
        });
    }

    function show() {
        if (overlay) return;
        overlay = el('div', 'fm-ig-overlay');
        var card = el('div', 'fm-ig-card fm-off-card');
        card.appendChild(el('div', 'fm-ig-title', '離線與安裝'));
        body = el('div', 'fm-off-body');
        card.appendChild(body);
        card.appendChild(btn('關閉', 'fm-ig-btn-close', close));
        overlay.appendChild(card);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.body.appendChild(overlay);
        body.appendChild(el('div', 'fm-off-row-text', '讀取中…'));
        render();
    }

    function close() {
        if (window.SoundManager && window.SoundManager.playCloseItem) window.SoundManager.playCloseItem();
        // 下載進行中關掉視窗：下載仍在背景繼續（token 沒被取消），玩家再開啟會看到進度
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null; body = null;
        if (dl) { dl.bar = null; dl.info = null; }
    }

    window.OfflineDialog = { show: show, close: close };
})();
