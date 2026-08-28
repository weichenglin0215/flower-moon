/**
 * 版本檢查：偵測到伺服器版本號變動時，強制重新整理一次，
 * 避免玩家的瀏覽器（尤其「加到主畫面」的殼子）快取住舊版 index.html／
 * .js／.css 卻毫無感覺，一直玩著舊版本。
 *
 * 版本號的唯一來源是 version.json，發布新版時記得同步更新，
 * 詳見 README.md「發布至GitHub Pages」一節。
 *
 * ⚠️ 這支檔案必須是 index.html 裡最先執行、且不能被瀏覽器快取住的那一個，
 *    否則連「去檢查有沒有新版本」這件事本身都可能卡在舊版快取裡，
 *    整套機制就失效了。fetch 用 cache:'no-store' 加上時間戳查詢字串，
 *    確保這一次請求一定打到伺服器，不會被瀏覽器或 CDN 快取擋下來。
 */
(function () {
    'use strict';

    var KEY = 'fm_app_version';
    var RELOAD_GUARD = 'fm_version_reload_pending';

    fetch('version.json?_=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
            if (!data || !data.version) return;
            var latest = String(data.version);
            var seen = localStorage.getItem(KEY);

            if (!seen) {
                // 第一次造訪（或本機資料被清過）：只記錄基準版本，不重整。
                localStorage.setItem(KEY, latest);
                return;
            }
            if (seen === latest) {
                sessionStorage.removeItem(RELOAD_GUARD);
                return;
            }

            // ⚠️ 同一分頁只因版本問題自動重整一次，避免 version.json
            //    本身讀取異常（例如格式壞掉）時陷入無窮重整迴圈。
            if (sessionStorage.getItem(RELOAD_GUARD)) return;
            sessionStorage.setItem(RELOAD_GUARD, '1');
            localStorage.setItem(KEY, latest);

            // 帶新的查詢字串重新導向，讓瀏覽器把這個網址當成沒看過的、
            // 一定會發出真正的網路請求，不會沿用舊 index.html 的快取。
            // 保留原本網址上其他參數（例如 game=／page=），只覆蓋自己需要的兩個。
            var params = new URLSearchParams(location.search);
            params.set('_v', latest);
            params.set('_t', String(Date.now()));
            location.replace(location.pathname + '?' + params.toString() + location.hash);
        })
        .catch(function () {
            // 版本檢查非必要功能，離線或抓取失敗時完全不影響遊戲本身。
        });
})();
