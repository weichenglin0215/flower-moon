/**
 * 執行環境偵測（window.FMEnv）
 *
 * 安裝引導（installGuide.js）與離線功能（offline.js）共用，
 * 兩邊對「這是哪種瀏覽器」的判斷必須一致，所以集中在這一支。
 *
 * ⚠️ 本檔只做「判斷」，不產生任何畫面、不碰玩家存檔，載入順序只要比使用者早即可。
 *
 * 重要的區別：
 *   · 內建瀏覽器（LINE／FB／IG…）：無法加入主畫面，iOS 上的內建瀏覽器也不支援 Service Worker，
 *     而且它的 localStorage 跟 Safari／Chrome 是分開的，玩家在裡面玩的進度換個瀏覽器就看不到。
 *   · 主畫面 App（standalone）：已經安裝好了，不必再提醒安裝，離線與儲存空間也最穩定。
 *   · iOS 上的 Chrome／Firefox／Edge：引擎仍是 WebKit，沒有 Android 那種一鍵安裝，
 *     但 iOS 16.4 起可以從分享選單「加入主畫面」。
 */
(function () {
    'use strict';

    var ua = navigator.userAgent || '';

    // iPadOS 13+ 的 Safari 會假裝成 Mac，要靠觸控點數分辨
    var isIOS = /iPhone|iPad|iPod/.test(ua)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var isAndroid = /Android/i.test(ua);

    /**
     * 內建瀏覽器（App 內的網頁檢視）。
     * 傳回名稱（供畫面顯示）；不是內建瀏覽器回傳 ''。
     */
    function detectInApp() {
        if (/\bLine\//i.test(ua)) return 'LINE';
        if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'Facebook';
        if (/Instagram/i.test(ua)) return 'Instagram';
        if (/MicroMessenger/i.test(ua)) return '微信';
        if (/Twitter/i.test(ua)) return 'X（Twitter）';
        if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return 'TikTok';
        return '';
    }

    /** iOS 上實際用的是哪個瀏覽器（引擎都是 WebKit，但「加入主畫面」的位置不同） */
    function detectIOSBrowser() {
        if (!isIOS) return '';
        if (/CriOS/i.test(ua)) return 'chrome';
        if (/FxiOS/i.test(ua)) return 'firefox';
        if (/EdgiOS/i.test(ua)) return 'edge';
        return 'safari';
    }

    /** 是否已經是「加入主畫面」之後開啟的獨立視窗 */
    function isStandalone() {
        try {
            if (window.navigator.standalone === true) return true;   // iOS
            if (window.matchMedia) {
                return window.matchMedia('(display-mode: standalone)').matches
                    || window.matchMedia('(display-mode: fullscreen)').matches
                    || window.matchMedia('(display-mode: minimal-ui)').matches;
            }
        } catch (e) { /* 忽略 */ }
        return false;
    }

    /**
     * 是否為開發用網址（本機或區網 IP）。
     * 這類網址不自動註冊 Service Worker、不自動跳安裝提示：
     * 開發時改了程式存檔重整，若被快取擋住只會看到舊版，極易誤判。
     */
    function isDevHost() {
        var h = location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '::1'
            || /\.localhost$/.test(h)
            || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
            || location.protocol === 'file:';
    }

    var inApp = detectInApp();

    window.FMEnv = {
        ua: ua,
        isIOS: isIOS,
        isAndroid: isAndroid,
        isMobile: isIOS || isAndroid,
        inAppBrowser: inApp,              // '' | 'LINE' | 'Facebook' | …
        isInApp: !!inApp,
        iosBrowser: detectIOSBrowser(),   // '' | 'safari' | 'chrome' | 'firefox' | 'edge'
        isStandalone: isStandalone,       // 函式：安裝後這個值會變，每次要用時再問
        isDevHost: isDevHost,

        /** 此環境是否可能註冊 Service Worker（內建瀏覽器一律不註冊） */
        canUseServiceWorker: function () {
            return ('serviceWorker' in navigator) && !inApp
                && (location.protocol === 'https:' || isDevHost());
        },

        /** 乾淨的遊戲網址（不含 ?source=pwa、?openExternalBrowser=1 等參數），給「複製連結」用 */
        cleanUrl: function () {
            try {
                return new URL('index.html', location.href).href;
            } catch (e) {
                return location.origin + location.pathname;
            }
        }
    };
})();
