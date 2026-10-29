/**
 * 離線遊玩（window.FMOffline）：Service Worker 註冊、更新、離線狀態列、完整離線包下載
 *
 * 配合檔案：sw.js（Service Worker 本體）、sw-manifest.js（預快取清單，tools/build_sw.js 產生）、
 *           offlineDialog.js（「離線與安裝」頁面）、supabaseClient.js（離線期間的存檔與紀錄補送）
 *
 * ── 什麼環境會註冊 Service Worker ─────────────────────────────────────
 *   · 一般瀏覽器、主畫面 App：註冊。
 *   · LINE／FB／IG 等內建瀏覽器：一律不註冊（iOS 的內建瀏覽器根本不支援，Android 的儲存空間
 *     也很容易被清掉）。註冊失敗一律「靜默略過」，不能影響遊戲本身。
 *   · 開發網址（localhost／區網 IP）：預設不註冊，並且會主動清掉先前殘留的 Service Worker 與快取。
 *     開發時改了程式存檔重整，若被快取擋住只會看到舊版，極易誤判。要在本機測試離線功能，
 *     網址加 ?sw=1（會記住），不想測了加 ?sw=0。
 *   · 開啟「省流量」的手機：不自動註冊（預快取約 10 MB），玩家可在「離線與安裝」頁面手動啟用。
 *
 * ── 更新流程 ──────────────────────────────────────────────────────────
 *   新版 Service Worker 安裝完成後會「等待」，不會打斷玩家正在進行的遊戲：
 *     · 玩家正在玩 → 右下角跳出「有新版本」提示，按下才更新。
 *     · 下次開啟遊戲 → 在使用者還沒操作前就自動套用（見 earlyApply）。
 *   這取代了 versionCheck.js 的強制重新整理（它在 Service Worker 接手後沒有作用，
 *   因為重新整理拿到的仍是快取裡的舊檔案）。
 *
 * ── 自我修復 ──────────────────────────────────────────────────────────
 *   如果 Service Worker 因故一直無法更新（例如部署時清單與檔案對不上，安裝一直失敗），
 *   玩家會永遠卡在舊版。偵測方式：version.json 的版本長期（連續 4 次開啟）與快取的版本不同，
 *   就清掉 Service Worker 與快取重新來過。
 *
 * ⚠️ 本檔擁有的 localStorage 鍵都以 fm_sw_ 開頭，不屬於玩家存檔。
 */
(function () {
    'use strict';

    var E = window.FMEnv;
    var K = {
        DEV: 'fm_sw_dev',            // 開發網址：'1' = 玩家（開發者）要求啟用
        DISABLED: 'fm_sw_disabled',  // '1' = 玩家在離線頁面主動停用
        ENABLED: 'fm_sw_enabled',    // '1' = 玩家在離線頁面主動啟用（省流量模式下用）
        STALE: 'fm_sw_stale'         // 版本落後計次（自我修復用）
    };
    var ASSET_CACHE = 'fm-assets-v1';
    var REGISTER_DELAY_MS = 2500;    // 載入後等一下才註冊，別跟遊戲本身搶頻寬
    var UPDATE_CHECK_MIN_GAP_MS = 30 * 60 * 1000;
    var STALE_LIMIT = 4;

    var hadController = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    var registration = null;
    var updating = false;            // 已經送出 SKIP_WAITING，等待 controllerchange 後重新載入
    var reloading = false;
    var lastUpdateCheck = Date.now();
    var manifestPromise = null;
    var toast = null;

    // ── localStorage 小工具（無痕模式或儲存空間被禁用時不能丟例外）──────────
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 忽略 */ } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ } }

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function formatBytes(n) {
        if (!isFinite(n)) return '?';
        if (n < 1024) return n + ' B';
        if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
        if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
        return (n / 1073741824).toFixed(2) + ' GB';
    }

    // ── 開發網址的 ?sw= 開關 ────────────────────────────────────────────
    (function readDevSwitch() {
        if (!E.isDevHost()) return;
        var m = /[?&]sw=([01])\b/.exec(location.search);
        if (!m) return;
        if (m[1] === '1') lsSet(K.DEV, '1'); else lsDel(K.DEV);
    })();

    /**
     * 這個環境為什麼「不會」註冊？回傳原因代碼；可以註冊則回傳 ''。
     * 離線頁面用它決定要顯示哪一種說明。
     */
    function blockedReason() {
        if (!('serviceWorker' in navigator)) return 'unsupported';
        if (E.isInApp) return 'inapp';
        if (location.protocol !== 'https:' && !E.isDevHost()) return 'insecure';
        if (lsGet(K.DISABLED) === '1') return 'disabled';
        if (E.isDevHost() && lsGet(K.DEV) !== '1') return 'dev';
        if (navigator.connection && navigator.connection.saveData && lsGet(K.ENABLED) !== '1') return 'savedata';
        return '';
    }

    // ── 預快取清單（sw-manifest.js）──────────────────────────────────────

    /**
     * 讀取預快取清單。有 Service Worker 接手時它是從快取來的（與目前執行的版本一致），
     * 所以離線也讀得到。sw-manifest.js 在頁面裡執行的結果是設定 window.FM_SW。
     */
    function loadManifest() {
        if (window.FM_SW) return Promise.resolve(window.FM_SW);
        if (manifestPromise) return manifestPromise;
        manifestPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = 'sw-manifest.js';
            s.onload = function () { window.FM_SW ? resolve(window.FM_SW) : reject(new Error('清單格式錯誤')); };
            s.onerror = function () { manifestPromise = null; reject(new Error('讀不到 sw-manifest.js')); };
            document.head.appendChild(s);
        });
        return manifestPromise;
    }

    // ── 清除 ───────────────────────────────────────────────────────────

    /** 取消註冊所有 Service Worker，並刪除花月的所有快取。不碰玩家存檔。 */
    function teardown() {
        var p = Promise.resolve();
        if ('serviceWorker' in navigator) {
            p = navigator.serviceWorker.getRegistrations().then(function (regs) {
                return Promise.all(regs.map(function (r) { return r.unregister(); }));
            }).catch(function () { });
        }
        return p.then(function () {
            if (!('caches' in window)) return;
            return caches.keys().then(function (names) {
                return Promise.all(names.filter(function (n) { return n.indexOf('fm-') === 0; })
                    .map(function (n) { return caches.delete(n); }));
            });
        }).catch(function () { });
    }

    // ── 更新 ───────────────────────────────────────────────────────────

    /** 請等待中的新版 Service Worker 啟用，啟用後 controllerchange 會觸發重新載入 */
    function applyUpdate(reg) {
        var w = reg && reg.waiting;
        if (!w) return false;
        updating = true;
        w.postMessage({ type: 'SKIP_WAITING' });
        return true;
    }

    function onControllerChange() {
        // 第一次安裝時 sw.js 會 clients.claim()，也會觸發這個事件，但那時不需要重新載入
        if (!hadController && !updating) return;
        if (reloading) return;
        // 保險：15 秒內已經因更新重新載入過就不再來一次，避免任何意外造成無限重新整理
        var last = 0;
        try { last = parseInt(sessionStorage.getItem('fm_sw_reload_ts') || '0', 10) || 0; } catch (e) { /* 忽略 */ }
        if (Date.now() - last < 15000) return;
        try { sessionStorage.setItem('fm_sw_reload_ts', String(Date.now())); } catch (e) { /* 忽略 */ }
        reloading = true;
        location.reload();
    }

    /** 開啟頁面的第一時間：如果上次已經裝好一個等待中的新版，趁玩家還沒開始操作就套用 */
    function earlyApply() {
        if (!('serviceWorker' in navigator) || blockedReason()) return;
        navigator.serviceWorker.getRegistration().then(function (reg) {
            if (reg && reg.waiting) applyUpdate(reg);
        }).catch(function () { });
    }

    function offerUpdate(reg) {
        if (toast) return;
        toast = el('div', 'fm-off-toast');
        toast.appendChild(el('span', 'fm-off-toast-text', '有新版本可以更新'));
        var go = el('button', 'fm-off-toast-btn', '立即更新');
        go.type = 'button';
        go.addEventListener('click', function () { go.disabled = true; go.textContent = '更新中…'; applyUpdate(reg); });
        var later = el('button', 'fm-off-toast-x', '✕');
        later.type = 'button';
        later.setAttribute('aria-label', '稍後再說');
        later.addEventListener('click', function () { if (toast && toast.parentNode) toast.parentNode.removeChild(toast); });
        toast.appendChild(go);
        toast.appendChild(later);
        document.body.appendChild(toast);
    }

    function checkUpdate() {
        if (!registration) return Promise.resolve(false);
        lastUpdateCheck = Date.now();
        return registration.update().then(function () { return true; }).catch(function () { return false; });
    }

    function wire(reg) {
        reg.addEventListener('updatefound', function () {
            var w = reg.installing;
            if (!w) return;
            w.addEventListener('statechange', function () {
                // installed 且已有舊版在控制頁面 = 這是「更新」而不是第一次安裝
                if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg);
            });
        });
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

        // 已加到主畫面的 App 很少真的「重新載入」（切到背景再切回來而已），
        // 不主動檢查的話會一直停在舊版。
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible' && Date.now() - lastUpdateCheck > UPDATE_CHECK_MIN_GAP_MS) {
                checkUpdate();
            }
        });
        // 若安裝期間（例如剛好在背景下載）已經有等待中的版本
        if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg);

        selfHeal();

        // 請瀏覽器把這個網站的儲存空間標成「持久」，不要在空間吃緊時被優先清掉
        // （iOS Safari 對 7 天沒開啟的網站會清空儲存，加到主畫面則不受影響）
        navigator.serviceWorker.ready.then(requestPersist).catch(function () { });
    }

    function selfHeal() {
        if (navigator.onLine === false) return;
        fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (latest) {
                return loadManifest().then(function (m) { return [latest, m]; });
            })
            .then(function (pair) {
                var latest = pair[0], m = pair[1];
                if (!latest || !latest.version || !m) return;
                if (String(latest.version) === String(m.version)) { lsDel(K.STALE); return; }
                // 正在安裝或等待中的新版 = 正常的更新過程，不算落後
                if (registration && (registration.installing || registration.waiting)) return;
                var n = (parseInt(lsGet(K.STALE) || '0', 10) || 0) + 1;
                lsSet(K.STALE, String(n));
                if (n >= STALE_LIMIT) {
                    console.warn('[離線] 版本長期落後（快取 ' + m.version + '／最新 ' + latest.version + '），重設離線快取');
                    lsDel(K.STALE);
                    teardown().then(function () { location.reload(); });
                }
            })
            .catch(function () { /* 離線或讀取失敗：不是問題，下次再檢查 */ });
    }

    // ── 註冊 ───────────────────────────────────────────────────────────

    function start() {
        var why = blockedReason();
        if (why) {
            // 開發網址：把先前測試留下的 Service Worker 與快取清乾淨，免得之後存檔重整卻看到舊檔案
            if (why === 'dev' && 'serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function (regs) {
                    if (regs.length) teardown();
                }).catch(function () { });
            }
            return Promise.resolve(null);
        }
        return navigator.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' })
            .then(function (reg) { registration = reg; wire(reg); return reg; })
            .catch(function (e) {
                // 內建瀏覽器、隱私模式等註冊失敗是預期內的事，靜默略過，遊戲照玩
                console.info('[離線] Service Worker 無法註冊，略過：', e && e.message);
                return null;
            });
    }

    // ── 儲存空間 ───────────────────────────────────────────────────────

    function requestPersist() {
        if (!(navigator.storage && navigator.storage.persist)) return Promise.resolve(false);
        return navigator.storage.persisted().then(function (already) {
            return already ? true : navigator.storage.persist();
        }).catch(function () { return false; });
    }

    // ── 狀態 ───────────────────────────────────────────────────────────

    /** 彙整給「離線與安裝」頁面顯示的所有資訊 */
    function status() {
        var out = {
            online: navigator.onLine !== false,
            standalone: E.isStandalone(),
            inApp: E.inAppBrowser,
            blocked: blockedReason(),
            controlled: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
            version: '', build: '',
            coreReady: false,
            pack: { total: 0, cached: 0, bytesTotal: 0, bytesCached: 0 },
            storage: { usage: null, quota: null, persisted: null },
            pending: 0, dirty: false
        };
        var S = window.SupabaseClient;
        if (S) {
            try { out.pending = S.pendingCount(); out.dirty = S.isCloudDirty(); } catch (e) { /* 忽略 */ }
        }

        var tasks = [];

        tasks.push(loadManifest().then(function (m) {
            out.version = m.version; out.build = m.build;
            out.pack.total = m.pack.length;
            out.pack.bytesTotal = m.pack.reduce(function (s, p) { return s + p.s; }, 0);
            if (!('caches' in window)) return;

            var coreName = 'fm-core-' + m.version + '-' + m.build;
            var p1 = caches.has(coreName).then(function (has) {
                if (!has) return;
                return caches.open(coreName).then(function (c) {
                    return c.match(new URL('__fm_rev__', location.href).href);
                }).then(function (r) { out.coreReady = !!r; });
            });

            var p2 = caches.has(ASSET_CACHE).then(function (has) {
                if (!has) return;
                return caches.open(ASSET_CACHE).then(function (c) {
                    return Promise.all(m.pack.map(function (p) {
                        return c.match(new URL(p.u, location.href).href, { ignoreSearch: true }).then(function (hit) {
                            if (hit) { out.pack.cached++; out.pack.bytesCached += p.s; }
                        });
                    }));
                });
            });
            return Promise.all([p1, p2]);
        }).catch(function () { /* 讀不到清單（離線且尚未安裝）：保持預設值 */ }));

        if (navigator.storage && navigator.storage.estimate) {
            tasks.push(navigator.storage.estimate().then(function (e) {
                out.storage.usage = e.usage; out.storage.quota = e.quota;
            }).catch(function () { }));
            if (navigator.storage.persisted) {
                tasks.push(navigator.storage.persisted().then(function (p) { out.storage.persisted = p; }).catch(function () { }));
            }
        }
        return Promise.all(tasks).then(function () { return out; });
    }

    // ── 完整離線包 ─────────────────────────────────────────────────────

    /**
     * 下載 pack 清單內所有還沒快取的檔案（獎狀、古地圖、寶箱圖…）。
     * 直接由頁面 fetch 並寫入快取，不必依賴 Service Worker 是否已經接手。
     *
     * @param {function} [onProgress] 回呼 { done, total, bytesDone, bytesTotal, current }
     * @param {{cancelled:boolean}} [token] 把 token.cancelled 設成 true 可中途取消
     * @returns {Promise<{ok:boolean, failed:string[], cancelled:boolean, quota:boolean}>}
     */
    function downloadPack(onProgress, token) {
        token = token || { cancelled: false };
        var result = { ok: true, failed: [], cancelled: false, quota: false };

        return requestPersist().then(function () {
            return Promise.all([loadManifest(), caches.open(ASSET_CACHE)]);
        }).then(function (pair) {
            var m = pair[0], cache = pair[1];
            var total = m.pack.length;
            var bytesTotal = m.pack.reduce(function (s, p) { return s + p.s; }, 0);
            var done = 0, bytesDone = 0, next = 0;

            function report(current) {
                if (onProgress) onProgress({ done: done, total: total, bytesDone: bytesDone, bytesTotal: bytesTotal, current: current || '' });
            }
            report();

            function one(item) {
                var url = new URL(item.u, location.href).href;
                return cache.match(url, { ignoreSearch: true }).then(function (hit) {
                    if (hit) return;   // 已經有了
                    report(item.u);
                    return fetch(url, { cache: 'reload' }).then(function (res) {
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                        return cache.put(url, res);
                    });
                }).then(function () {
                    done++; bytesDone += item.s; report();
                }).catch(function (e) {
                    done++; report();
                    // 儲存空間不足：後面的也一定失敗，直接中止並告知
                    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(String(e.message)))) {
                        result.quota = true; token.cancelled = true;
                    }
                    result.failed.push(item.u);
                });
            }

            // 兩條並行：圖片很大，同時下載太多會把手機的連線塞滿
            function worker() {
                if (token.cancelled || next >= total) return Promise.resolve();
                return one(m.pack[next++]).then(worker);
            }
            return Promise.all([worker(), worker()]);
        }).then(function () {
            result.cancelled = !!token.cancelled && !result.quota;
            result.ok = result.failed.length === 0 && !result.cancelled;
            return result;
        }).catch(function (e) {
            console.warn('[離線] 下載離線包失敗：', e);
            result.ok = false;
            return result;
        });
    }

    // ── 啟用／停用／重設 ────────────────────────────────────────────────

    function enable() {
        lsDel(K.DISABLED);
        lsSet(K.ENABLED, '1');
        if (E.isDevHost()) lsSet(K.DEV, '1');
        return start();
    }

    function disable() {
        lsSet(K.DISABLED, '1');
        lsDel(K.ENABLED);
        return teardown();
    }

    /** 清掉所有離線資料並重新載入。玩家存檔（localStorage）完全不動。 */
    function reset() {
        lsDel(K.STALE);
        return teardown().then(function () { location.reload(); });
    }

    // ── 離線狀態列 ─────────────────────────────────────────────────────

    function initPill() {
        var pill = el('div', 'fm-off-pill');
        pill.setAttribute('role', 'status');
        document.body.appendChild(pill);
        var timer = null;

        function offline() {
            clearTimeout(timer);
            pill.className = 'fm-off-pill fm-off-pill-show';
            pill.textContent = '離線中・進度先存在這台裝置';
        }
        function online() {
            clearTimeout(timer);
            var n = 0;
            try { n = window.SupabaseClient ? window.SupabaseClient.pendingCount() : 0; } catch (e) { /* 忽略 */ }
            var dirty = false;
            try { dirty = window.SupabaseClient ? window.SupabaseClient.isCloudDirty() : false; } catch (e) { /* 忽略 */ }
            if (!n && !dirty && !pill.classList.contains('fm-off-pill-show')) return;
            pill.className = 'fm-off-pill fm-off-pill-show fm-off-pill-ok';
            pill.textContent = (n || dirty) ? '已恢復連線・同步中…' : '已恢復連線';
            timer = setTimeout(function () { pill.className = 'fm-off-pill'; }, 3000);
        }
        window.addEventListener('offline', offline);
        window.addEventListener('online', online);
        if (navigator.onLine === false) offline();
    }

    // ── 啟動 ───────────────────────────────────────────────────────────

    earlyApply();

    function boot() {
        initPill();
        setTimeout(start, REGISTER_DELAY_MS);
    }
    if (document.readyState === 'complete') boot();
    else window.addEventListener('load', boot);

    window.FMOffline = {
        status: status,
        loadManifest: loadManifest,
        downloadPack: downloadPack,
        checkUpdate: checkUpdate,
        applyUpdate: function () { return applyUpdate(registration); },
        hasWaitingUpdate: function () { return !!(registration && registration.waiting); },
        enable: enable,
        disable: disable,
        reset: reset,
        blockedReason: blockedReason,
        requestPersist: requestPersist,
        formatBytes: formatBytes,
        isReady: function () { return !!registration; },
        _teardown: teardown
    };
})();
