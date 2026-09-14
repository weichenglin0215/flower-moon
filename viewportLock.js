/* ═══════════════════════════════════════════════════════
   viewportLock.js — 手機畫面鎖定（500×850 舞台永遠不偏移）

   【為什麼要有這個檔案】
   2026-09-14 玩家回報：手機上把整個介面往左或左上方滑，
   畫面會偏移並露出紅色底色（body 的背景色 hsl(0, 60%, 24%)）。

   根因（已在 CSS 修掉）：game3／game7／game14 的 overlay 規則裡
   `position` 寫了兩次，後面的 relative 蓋掉 fixed，未縮放的 500×850
   排版盒被撐進 body。手機寬度不到 500px，body 就多出可捲動區，
   而 body 是 overflow:hidden 的「捲動容器」—— iOS Safari 會讓手指
   直接拖動它，程式的 focus()／scrollIntoView() 也捲得動它。

   這個檔案是第二道防線：不管將來哪個元件又不小心撐大了 body，
   根元素只要被捲動，就立刻拉回 (0, 0)。
   介面是 screen_adaptive.js 置中縮放的固定舞台，根元素**本來就不該**
   有任何捲動位移，所以歸零不會誤傷任何正常功能；
   各介面自己的捲動區（青雲梯、成就、名人列傳…）是內層元素，不受影響。

   ⚠️ 刻意獨立成一個檔案，不寫進 screen_adaptive.js
      （專案規範：不得修改 screen_adaptive.js 的核心邏輯）。
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

    // ③ 輸入框失焦（軟鍵盤收起）時，iOS 常把 body 留在被推上去的位置
    document.addEventListener('focusout', function () {
        setTimeout(resetRootScroll, 50);
    }, true);

    // ④ iOS Safari 無視 viewport 的 user-scalable=no，雙指縮放後視覺視窗會偏移。
    //    gesturestart 是 iOS 專有事件，其他瀏覽器不會觸發，不影響一般觸控。
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });

    document.addEventListener('DOMContentLoaded', resetRootScroll);
})();
