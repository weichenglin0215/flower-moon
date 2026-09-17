/* ═══════════════════════════════════════════════════════
   viewportLock.js — 手機畫面鎖定（500×850 舞台永遠不偏移）

   【為什麼要有這個檔案】
   玩家回報：手機上把整個介面往左或左上方滑，畫面會偏移並露出紅色底色
   （body 的背景色 hsl(0, 60%, 24%)），接著往上拖整個介面也會往上跑。

   【真正的病因（2026-09-17 確認）】頁面被「放大」了，而且看不出來。
   iPhone 上頁面一旦被放大（例如約 1.3 倍），screen_adaptive.js 用
   visualViewport 的寬高重算舞台縮放，會把舞台縮回「剛好填滿畫面」，
   所以畫面大小看起來完全正常；但放大後的頁面可以被手指平移，
   固定定位的介面跟著位移，右邊與下面就露出 body 的底色。
   判讀特徵：只會往左／往上偏（露紅的永遠是右邊與下面），
   而且 window.scrollX／scrollY 始終是 0 —— 這也是下面 ① 的
   「捲動歸零」攔不住這個問題的原因。

   2026-09-14 第一次修正時認為是 game3／game7／game14 的 overlay
   position 寫錯把 body 撐大（那確實是錯的，也修掉了），並加上 ①～④，
   但出現機率只是變低，沒有根除。

   【目前的防線】
   1. screen_adaptive.css：* { touch-action: pan-x pan-y }
      從手勢層級就禁止瀏覽器縮放（雙指縮放、點兩下放大），含捲動區內。
   2. screen_adaptive.css：body { position: relative }
      開機時還沒縮放的 500×850 #stage 不再把頁面撐得比螢幕寬
      （iOS 遇到內容比螢幕寬會放寬 viewport 的禁止縮放限制）。
   3. 本檔 ⑤：萬一頁面還是被放大了，手指放開後把縮放還原成 1。
   4. 本檔 ①～④：根元素若真的被捲動（程式呼叫 focus()／scrollIntoView()
      等），立刻拉回 (0, 0)。

   ⚠️ 刻意獨立成一個檔案，不寫進 screen_adaptive.js
      （專案規範：不得修改 screen_adaptive.js 的核心邏輯）。
   ⚠️ 電腦與 Android 上完全重現不了，修改後務必用 iPhone 實測。
   ═══════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /** 根元素（window／html／body）若有捲動位移就歸零 */
    function resetRootScroll() {
        const de = document.documentElement;
        const b = document.body;
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        if (de && (de.scrollLeft || de.scrollTop)) { de.scrollLeft = 0; de.scrollTop = 0; }
        if (b && (b.scrollLeft || b.scrollTop)) { b.scrollLeft = 0; b.scrollTop = 0; }
    }

    // ① 捲動事件：元素的 scroll 事件不會冒泡，必須用「捕獲階段」才收得到 body 的捲動。
    //    只處理根元素，內層捲動區（例如 #lpScroll）一律放行。
    document.addEventListener('scroll', function (e) {
        const t = e.target;
        if (t === document || t === document.documentElement || t === document.body) {
            resetRootScroll();
        }
    }, true);
    window.addEventListener('scroll', resetRootScroll, { passive: true });

    // ② 手機網址列收合、軟鍵盤收起、旋轉螢幕後，瀏覽器可能留下根元素位移
    window.addEventListener('resize', resetRootScroll);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resetRootScroll);
    }

    // ③ 輸入框失焦（軟鍵盤收起）時，iOS 常把 body 留在被推上去的位置；
    //    打字期間若頁面被放大，也是在這裡（失焦後）才還原，見 ⑤。
    document.addEventListener('focusout', function () {
        setTimeout(resetRootScroll, 50);
        scheduleZoomCheck();
    }, true);

    // ④ iOS Safari 無視 viewport 的 user-scalable=no，雙指縮放後視覺視窗會偏移。
    //    gesturestart 是 iOS 專有事件，其他瀏覽器不會觸發，不影響一般觸控。
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });

    document.addEventListener('DOMContentLoaded', resetRootScroll);

    // ⑤ 頁面若已被放大（visualViewport.scale ≠ 1），手指放開後把縮放還原成 1。
    //    作法：把 viewport meta 暫時拿掉 user-scalable=no（其餘限制不變，
    //    maximum-scale 仍是 1.0），瀏覽器會重新套用 viewport 設定，
    //    把目前的縮放夾回 1；稍後再改回原本的字串。
    //    ⚠️ 只改字面不改語意（例如 1.0 改成 1）瀏覽器會當作沒變，不會重新套用，
    //       所以一定要真的拿掉一個設定。
    //    ⚠️ 若 iPhone 開了輔助使用的「強制允許縮放」，瀏覽器不會夾回，
    //       這一道只是盡力而為；主要防線是 screen_adaptive.css 的 touch-action。
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const VIEWPORT_CONTENT = viewportMeta ? viewportMeta.getAttribute('content') : '';
    let activeTouches = 0;      // 目前螢幕上的手指數：手勢進行中不動 meta，避免畫面跳動
    let zoomTimer = null;
    let lastZoomReset = 0;

    function resetZoomIfNeeded() {
        const vv = window.visualViewport;
        if (!vv || !viewportMeta || Math.abs(vv.scale - 1) < 0.01) return;
        if (activeTouches > 0) return;                  // 手指還在螢幕上：放開時會再檢查一次
        const ae = document.activeElement;
        if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;   // 正在打字：失焦時再還原
        const now = Date.now();
        if (now - lastZoomReset < 1000) return;         // 還原無效（例如強制允許縮放）時，不要反覆改 meta
        lastZoomReset = now;

        viewportMeta.setAttribute('content', VIEWPORT_CONTENT.replace(/,\s*user-scalable\s*=\s*no/i, ''));
        setTimeout(function () {
            viewportMeta.setAttribute('content', VIEWPORT_CONTENT);
            resetRootScroll();
        }, 60);
    }

    /** 縮放動畫（例如點兩下放大）會連續觸發 resize，等它停下來再檢查 */
    function scheduleZoomCheck() {
        clearTimeout(zoomTimer);
        zoomTimer = setTimeout(resetZoomIfNeeded, 250);
    }

    // 用捕獲階段記錄手指數：遊戲按鈕常在 touchend 裡 stopPropagation，冒泡階段會收不到
    document.addEventListener('touchstart', function (e) {
        activeTouches = e.touches.length;
    }, { passive: true, capture: true });
    function onTouchFinish(e) {
        activeTouches = e.touches.length;
        if (activeTouches === 0) scheduleZoomCheck();
    }
    document.addEventListener('touchend', onTouchFinish, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchFinish, { passive: true, capture: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleZoomCheck);
    }
})();
