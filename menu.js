// ========================================
// 漢堡選單與全域流程管理模組
// ========================================

(function () {
    'use strict';

    // ========================================
    // 選單項目清單（可自由調整順序與新增項目）
    // 每個項目格式：
    //   { page: '頁面鍵值', label: '顯示名稱', image: '圖片路徑 (可省略)' }
    // 調整順序即可改變在選單中的排列位置。
    // ========================================
    const MENU_ITEMS = [
        // ⚠️ 選單縮圖尚未製作，暫時借用花月 logo，
        //    待美術補上 images/Menu/青雲梯_Menu256.jpg 後改回。
        { page: 'learningpath', label: '青雲梯', image: 'images/Menu/青雲梯_Menu256.jpg' },
        { page: 'calendar', label: '日曆', image: 'images/Menu/日曆_Menu256.jpg' },
        { page: 'cards', label: '默背卡片', image: 'images/Menu/默背_Menu256.jpg' },
        { page: 'game1', label: '慢思快選', image: 'images/Menu/慢思快選_Menu256.jpg' },
        { page: 'game2', label: '飛花令', image: 'images/Menu/飛花令_Menu256.jpg' },
        { page: 'game4', label: '眾裡尋他', image: 'images/Menu/眾裡尋他千百度_Menu256.jpg' },
        { page: 'game13', label: '人事時地', image: 'images/Menu/人事時地_Menu256.jpg' },
        { page: 'game33', label: '作者是誰', image: 'images/Menu/作者是誰_Menu256.jpg' },
        { page: 'game20', label: '丟三落一', image: 'images/Menu/丟三落一_Menu256.jpg' },
        { page: 'game31', label: '詩眼覓蹤', image: 'images/Menu/詩眼覓蹤_Menu256.jpg' },
        { page: 'game36', label: '轉輪覓詩', image: 'images/Menu/轉輪覓詩_Menu256.jpg' },
        { page: 'game21', label: '橫批成詩', image: 'images/Menu/橫批成詩_Menu256.jpg' },
        { page: 'game22', label: '詩詞拼圖', image: 'images/Menu/詩詞拼圖_Menu256.jpg' },
        { page: 'game23', label: '縱橫集句', image: 'images/Menu/縱橫集句_Menu256.jpg' },
        { page: 'game8', label: '一筆裁詩', image: 'images/Menu/一筆裁詩_Menu256.jpg' },
        { page: 'game9', label: '詩韻鎖扣', image: 'images/Menu/詩韻鎖扣_Menu256.jpg' },
        { page: 'game11', label: '翻墨識蹤', image: 'images/Menu/翻墨識蹤_Menu256.jpg' },
        { page: 'game12', label: '疏影橫斜', image: 'images/Menu/疏影橫斜_Menu256.jpg' },
        { page: 'game3', label: '字爬梯', image: 'images/Menu/字爬梯_Menu256.jpg' },
        { page: 'game14', label: '步步驚心', image: 'images/Menu/步步驚心_Menu256.jpg' },
        { page: 'game37', label: '步步為陣', image: 'images/Menu/步步為陣_Menu256.jpg' },
        { page: 'game40', label: '點兵成詩', image: 'images/Menu/點兵成詩_Menu256.jpg' },
        { page: 'game16', label: '打地詩', image: 'images/Menu/打地詩_Menu256.jpg' },
        { page: 'game5', label: '詩詞精靈', image: 'images/Menu/詩詞小精靈_Menu256.jpg' },
        { page: 'game6', label: '詩陣侵略', image: 'images/Menu/詩陣侵略_Menu256.jpg' },
        { page: 'game19', label: '詩碟狂襲', image: 'images/Menu/詩碟狂襲_Menu256.jpg' },
        { page: 'game10', label: '擊石鳴詩', image: 'images/Menu/擊石鳴詩_Menu256.jpg' },
        { page: 'game7', label: '青鳥雲梯', image: 'images/Menu/青鳥雲梯_Menu256.jpg' },
        { page: 'game15', label: '墨韻游龍', image: 'images/Menu/墨韻游龍_Menu256.jpg' },
        { page: 'game17', label: '青蛙過河', image: 'images/Menu/青蛙過河_Menu256.jpg' },
        { page: 'game39', label: '彈珠成詩', image: 'images/Menu/彈珠成詩_Menu256.jpg' },
        { page: 'game38', label: '推枰成詩', image: 'images/Menu/推枰成詩_Menu256.jpg' },
        { page: 'game24', label: '三字成珠', image: 'images/Menu/三字成珠_Menu256.jpg' },
        { page: 'game25', label: '連珠拾字', image: 'images/Menu/連珠拾字_Menu256.jpg' },
        { page: 'game26', label: '投珠破句', image: 'images/Menu/投珠破句_Menu256.jpg' },
        { page: 'game27', label: '詩磚壘塔', image: 'images/Menu/詩磚壘塔_Menu256.jpg' },
        { page: 'game28', label: '兩心相印', image: 'images/Menu/兩心相印_Menu256.jpg' },
        { page: 'game29', label: '字龍盤環', image: 'images/Menu/字龍盤環_Menu256.jpg' },
        { page: 'game30', label: '層巒疊翠', image: 'images/Menu/層巒疊翠_Menu256.jpg' },
        //{ page: 'game32', label: '尋詩地圖', image: 'images/Menu/尋詩地圖_Menu256.jpg' },
        //{ page: 'game34', label: '猜猜詩題', image: 'images/Menu/猜猜詩題_Menu256.jpg' },
        //{ page: 'game35', label: '詩人心情', image: 'images/Menu/詩人心情_Menu256.jpg' },
        { page: 'collection', label: '江南小院', image: 'images/Menu/江南小院_Menu256.jpg' },
        { page: 'achievements', label: '成就紀錄', image: 'images/Menu/成就與紀錄_Menu256.jpg' },
        { page: 'leaderboard', label: '群英榜', image: 'images/Menu/群英榜_Menu256.jpg' },
        { page: 'author-biography', label: '名人列傳', image: 'images/Menu/名人列傳_Menu256.jpg' },
        { page: 'poem-data', label: '詩詞資料', image: 'images/Menu/詩詞資料集_Menu256.jpg' },
        { page: 'about', label: '關於花月', image: 'images/Menu/關於花月_Menu256.jpg' },
        { page: 'qrcode', label: 'QR Code', image: 'images/Menu/花月QRCode_Menu256.jpg' },
        { page: 'wordcloud', label: '文字雲', image: 'images/Menu/文字雲_Menu256.jpg' },
        { page: 'zhexianren', label: '詩詞珠簾', image: 'images/Menu/詩詞珠簾_Menu256.jpg' },
        { page: 'suiyuean', label: '隨遇而安', image: 'images/Menu/隨遇而安_Menu256.jpg' },
        { page: 'yichichunshui', label: '一池春水', image: 'images/Menu/一池春水_Menu256.jpg' },
        { page: 'tuibo', label: '推波助瀾', image: 'images/Menu/推波助瀾_Menu256.jpg' },
        { page: 'zhuluo', label: '珠落玉盤', image: 'images/Menu/珠落玉盤_Menu256.jpg' },
        { page: 'qianzhu', label: '千珠成字', image: 'images/Menu/千珠成字_Menu256.jpg' },
        { page: 'tuiqiao', label: '詩仙推敲', image: 'images/Menu/詩仙推敲_Menu256.jpg' },
        { page: 'chousi', label: '抽絲剝繭', image: 'images/Menu/抽絲剝繭_Menu256.jpg' },
        { page: 'kaizhi', label: '開枝散葉', image: 'images/Menu/開枝散葉_Menu256.jpg' },
        { page: 'fullscreen', label: '全螢幕', image: 'images/Menu/全螢幕_Menu256.jpg' },
    ];

    // ============================================================
    // 【手指觸控特效對照表】煙火 / 彩色煙霧
    // ------------------------------------------------------------
    // 手指點擊或拖曳畫面時，全站有兩個獨立的覆蓋層特效模組：
    //
    //   firework（煙火）  → touchInk.js  ：在接觸點噴出大量彩色粒子並緩緩飄落
    //   smoke（彩色煙霧）→ waterFlow.js ：WebGL 流體，拖曳出會迴旋擴散的彩色染料
    //
    // 兩者預設都是 true（全部出現）。某些畫面（例如水波紋、珠簾等本身就是滿版
    // 視覺效果的頁面）會被這些特效干擾，把該列改成 false 即可單獨關掉。
    //
    //   例：'yichichunshui': { firework: false, smoke: false },   ← 兩個都關
    //       'wordcloud':     { firework: false, smoke: true  },   ← 只關煙火
    //
    // ⚠️ 清單中沒有列到的頁面，一律視為兩個特效都開啟（見 DEFAULT_TOUCH_EFFECT）。
    // ============================================================
    const DEFAULT_TOUCH_EFFECT = { firework: false, smoke: false };

    const TOUCH_EFFECTS = {
        // ── 主頁面 ────────────────────────────  煙火            彩色煙霧
        'calendar': { firework: false, smoke: true },
        'cards': { firework: false, smoke: true },

        // ── 遊戲類 ───────────────────────────────────────────────────────
        'game1': { firework: false, smoke: false },   // 慢思快選
        'game2': { firework: false, smoke: false },   // 飛花令
        'game3': { firework: false, smoke: false },   // 字爬梯
        'game4': { firework: false, smoke: false },   // 眾裡尋他
        'game5': { firework: false, smoke: false },   // 詩詞精靈
        'game6': { firework: false, smoke: false },   // 詩陣侵略
        'game7': { firework: false, smoke: false },   // 青鳥雲梯
        'game8': { firework: false, smoke: false },   // 一筆裁詩
        'game9': { firework: false, smoke: false },   // 詩韻鎖扣
        'game10': { firework: false, smoke: false },   // 擊石鳴詩
        'game11': { firework: false, smoke: false },   // 翻墨識蹤
        'game12': { firework: false, smoke: false },   // 疏影橫斜
        'game13': { firework: false, smoke: false },   // 人事時地
        'game14': { firework: false, smoke: false },   // 步步驚心
        'game15': { firework: false, smoke: false },   // 墨韻游龍
        'game16': { firework: true, smoke: false },   // 打地詩
        'game17': { firework: true, smoke: false },   // 青蛙過河
        'game19': { firework: false, smoke: false },   // 詩碟狂襲
        'game20': { firework: false, smoke: false },   // 丟三落一
        'game21': { firework: false, smoke: false },   // 橫批成詩
        'game22': { firework: false, smoke: false },   // 詩詞拼圖
        'game23': { firework: false, smoke: false },   // 縱橫集句
        'game24': { firework: false, smoke: false },   // 三字成珠
        'game25': { firework: false, smoke: false },   // 連珠拾字
        'game26': { firework: false, smoke: false },   // 投珠破句
        'game27': { firework: false, smoke: false },   // 詩磚壘塔
        'game28': { firework: false, smoke: false },   // 兩心相印
        'game29': { firework: false, smoke: false },   // 字龍盤環
        'game30': { firework: false, smoke: false },   // 層巒疊翠
        'game31': { firework: false, smoke: false },   // 詩眼覓蹤
        'game32': { firework: false, smoke: false },   // 尋詩地圖
        'game33': { firework: false, smoke: false },   // 作者是誰
        'game34': { firework: false, smoke: false },   // 猜猜詩題
        'game35': { firework: false, smoke: false },   // 詩人心情
        'game36': { firework: false, smoke: false },   // 轉輪覓詩
        'game37': { firework: false, smoke: false },   // 步步為陣
        'game38': { firework: false, smoke: false },   // 推枰成詩
        'game39': { firework: false, smoke: false },   // 彈珠成詩
        'game40': { firework: false, smoke: false },   // 點兵成詩


        // ── 舒壓／視覺療癒類 ──────────────────────────────────────────────
        'wordcloud': { firework: false, smoke: true },   // 文字雲
        'zhexianren': { firework: false, smoke: true },   // 詩詞珠簾
        'suiyuean': { firework: false, smoke: true },   // 隨遇而安
        'yichichunshui': { firework: false, smoke: true },   // 一池春水
        'tuibo': { firework: false, smoke: true },  // 推波助瀾（滿版視覺，關掉觸控特效）
        'zhuluo': { firework: false, smoke: true },   // 珠落玉盤
        'qianzhu': { firework: false, smoke: true },   // 千珠成字
        'tuiqiao': { firework: false, smoke: true },   // 詩仙推敲
        'chousi': { firework: false, smoke: true },   // 抽絲剝繭
        'kaizhi': { firework: false, smoke: true },   // 開枝散葉


        // ── 青雲梯─────────────────────────────────────────
        'learningpath': { firework: false, smoke: true },   // 青雲梯

        // ── 資料類 ───────────────────────────────────────────────────────
        'achievements': { firework: false, smoke: true },   // 成就紀錄
        'leaderboard': { firework: false, smoke: true },   // 群英榜
        'author-biography': { firework: false, smoke: true },   // 名人列傳
        'collection': { firework: false, smoke: true },   // 江南小院
        'poem-data': { firework: false, smoke: true },   // 詩詞資料

        // ── 其他（對話框／動作）───────────────────────────────────────────
        'about': { firework: false, smoke: true },   // 關於花月
        'qrcode': { firework: false, smoke: true },   // QR Code
        'fullscreen': { firework: false, smoke: true },   // 全螢幕
    };

    // ── 「目前在哪一頁」的偵測用對照（與上面的設定表無關，不需要動）──
    // ⚠️ 為什麼需要偵測：玩家用頁面自己的 ✕ 關掉遊戲／舒壓頁時**不會**經過 switchPage，
    //    若只在切頁時套用設定，離開該頁後特效就會一直卡在錯誤的開關狀態。因此每次
    //    pointerdown 都先判斷「現在真正顯示的是哪一頁」再套用對應設定。

    // ── 首頁 ────────────────────────────────────────────────────────────
    // 「青雲梯」是花月的主軸：開場動畫結束、以及任何舒壓頁按 ✕ 關閉之後，
    // 都要回到這裡，讓玩家隨時能接著學習，而不是停在空白的舞台底色。
    const HOME_PAGE = 'learningpath';

    // (a) 有固定容器 id 的頁面。遊戲一律是 gameXX-container，只需列出命名不同的。
    const PAGE_CONTAINER_ID = {
        'wordcloud': 'wordcloud-container',
        'zhexianren': 'zhexianren-container',
        'suiyuean': 'suiyuean-container',
        'yichichunshui': 'yichichunshui-container',
        'tuiqiao': 'tuiqiao-container',
        'zhuluo': 'zhuluo-container',
        'qianzhu': 'qianzhu-container',
        'chousi': 'chousi-container',
        'kaizhi': 'kaizhi-container',
        'tuibo': 'tuibo-container',
        'author-biography': 'authorBioPage',
    };
    Object.keys(TOUCH_EFFECTS).forEach(function (page) {
        if (/^game\d+$/.test(page)) PAGE_CONTAINER_ID[page] = page + '-container';
    });

    // (b) 資料類對話框沒有固定 id（class 命名各異），但都把根元素掛在模組的 .overlay 上，
    //     且該 DOM 是第一次開啟時才建立（沒開過 → 取不到 → 自然視為未顯示）。
    //     ⚠️ 只認 .overlay 這一個屬性：例如 CollectionDialog 另外還有 .canvas／.toast，
    //        它們即使在對話框關閉時 display 仍是 block，一併檢查會誤判成「正在顯示」。
    const PAGE_MODULE_OVERLAY = {
        'achievements': 'AchievementDialog',
        'leaderboard': 'LeaderboardDialog',
        'collection': 'CollectionDialog',
    };

    // switchPage 記錄的頁面：偵測不到任何 overlay 時以這個值為準。
    let currentPage = HOME_PAGE;

    /** 取得某頁的特效設定（未列出者一律採用預設值＝兩個都開） */
    function getTouchEffect(page) {
        return TOUCH_EFFECTS[page] || DEFAULT_TOUCH_EFFECT;
    }

    /** 元素是否真的顯示中：先用便宜的 class 判斷，通過才做 getComputedStyle */
    function isElementShown(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.classList.contains('hidden')) return false;
        return getComputedStyle(el).display !== 'none';
    }

    /**
     * 判斷目前實際顯示的是哪一頁。
     * 任何 overlay 處於顯示狀態就以它為準（涵蓋用 ✕ 關閉、直接開新頁等所有路徑）；
     * 都沒有顯示時才退回 switchPage 記錄的頁面。
     */
    function detectActivePage() {
        for (const page in PAGE_CONTAINER_ID) {
            if (isElementShown(document.getElementById(PAGE_CONTAINER_ID[page]))) return page;
        }
        for (const page in PAGE_MODULE_OVERLAY) {
            const mod = window[PAGE_MODULE_OVERLAY[page]];
            if (mod && isElementShown(mod.overlay)) return page;
        }
        // ⚠️ 沒有任何 overlay 在顯示，但 currentPage 卻是個 overlay 類型的頁面
        //    → 代表玩家剛用該頁自己的 ✕ 關掉它、已經回到日曆了。
        //    少了這一段，關閉頁面後特效會一直沿用該頁的設定而回不來。
        if (PAGE_CONTAINER_ID[currentPage] || PAGE_MODULE_OVERLAY[currentPage]) return HOME_PAGE;
        return currentPage;
    }

    /** 依對照表開關兩個特效模組 */
    function applyTouchEffects(page) {
        const cfg = getTouchEffect(page);
        try {
            if (window.TouchInk) {
                if (cfg.firework) window.TouchInk.enable();
                else window.TouchInk.disable();
            }
        } catch (e) { console.warn('[Menu] 切換煙火特效失敗', e); }
        try {
            if (window.WaterFlow) {
                if (cfg.smoke) window.WaterFlow.enable();
                else window.WaterFlow.disable();
            }
        } catch (e) { console.warn('[Menu] 切換彩色煙霧特效失敗', e); }
    }

    // 每次手指按下前先確認目前頁面並套用設定。
    // ⚠️ 必須用 capture 階段：touchInk.js／waterFlow.js 都是在 window 的 bubble 階段
    //    監聽 pointerdown，capture 會先跑，才來得及在它們生成粒子之前開關。
    window.addEventListener('pointerdown', function () {
        applyTouchEffects(detectActivePage());
    }, true);

    // 供外部（或除錯）使用
    window.MenuTouchEffects = {
        table: TOUCH_EFFECTS,
        apply: applyTouchEffects,
        detect: detectActivePage,
        get: getTouchEffect,
    };

    /**
     * 開機時把首頁（青雲梯）鋪在最底層。
     *
     * ⚠️ 這裡刻意**不呼叫 goHome()** —— goHome 會執行 closeAllActiveOverlays()，
     *    那會把正在播放的開場動畫（IntroCard，z-index 3500）一起關掉。
     *    青雲梯的 z-index 是 1000，本來就在開場動畫底下，
     *    因此只要先 show() 出來，等開場動畫淡出後玩家看到的就是青雲梯。
     *
     * 若網址帶有 ?game= / ?page= 參數（從外部直接連進某個遊戲或頁面），
     * 就交給該模組自行處理，不搶先顯示首頁。
     */
    function showHomeOnBoot() {
        try {
            const qs = window.location.search || '';
            if (qs.indexOf('game=') >= 0 || qs.indexOf('page=') >= 0) return;
            if (window.LearningPath && typeof window.LearningPath.show === 'function') {
                window.LearningPath.show();
            }
        } catch (e) {
            console.warn('[Menu] 開機顯示首頁失敗', e);
        }
    }

    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initMenu(); showHomeOnBoot(); });
    } else {
        initMenu();
        showHomeOnBoot();
    }

    function initMenu() {
        createMenuHTML();
        setupMenuEvents();
    }

    // ----------------------------------------
    // 建立選單 DOM 結構
    // ----------------------------------------
    function createMenuHTML() {
        // 漢堡按鈕
        const hamburgerBtn = document.createElement('div');
        hamburgerBtn.id = 'hamburgerBtn';
        hamburgerBtn.className = 'hamburger-btn';
        hamburgerBtn.innerHTML = `
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
            <span class="hamburger-line"></span>
        `;

        // 選單面板
        const menuPanel = document.createElement('nav');
        menuPanel.id = 'menuPanel';
        menuPanel.className = 'menu-panel';

        // 格狀容器
        const grid = document.createElement('div');
        grid.className = 'menu-grid';

        MENU_ITEMS.forEach(item => {
            const cell = document.createElement('div');
            cell.className = 'menu-item';
            cell.setAttribute('data-page', item.page);

            if (item.image) {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'menu-item-img-wrap';
                imgWrapper.title = item.page;
                const img = document.createElement('img');
                img.src = item.image;
                img.alt = item.label;
                img.className = 'menu-item-img';
                img.draggable = false; // 禁止原生圖片拖曳（避免拖曳選單時圖片被拖出變半透明幽靈圖）
                // 圖片載入失敗時顯示佔位色塊
                img.onerror = function () {
                    imgWrapper.classList.add('menu-item-img-placeholder');
                    this.remove();
                };
                imgWrapper.appendChild(img);
                cell.appendChild(imgWrapper);
            } else {
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'menu-item-img-wrap menu-item-img-placeholder';
                imgWrapper.title = item.page;
                cell.appendChild(imgWrapper);
            }

            // 遊戲頁面：在圖片下方插入過關次數進度條
            if (/^game\d+$/.test(item.page)) {
                const barWrap = document.createElement('div');
                barWrap.className = 'menu-playcount-wrap';
                const bar = document.createElement('div');
                bar.className = 'menu-playcount-bar';
                barWrap.appendChild(bar);
                cell.appendChild(barWrap);
            }

            const label = document.createElement('span');
            label.className = 'menu-item-label';
            label.textContent = item.label;
            cell.appendChild(label);

            grid.appendChild(cell);
        });

        menuPanel.appendChild(grid);
        // 初始化進度條數值
        updateMenuProgressBars();

        // 遮罩層
        const menuOverlay = document.createElement('div');
        menuOverlay.id = 'menuOverlay';
        menuOverlay.className = 'menu-overlay';

        // 遮罩層直接插入 body (滿版不需縮放)
        document.body.appendChild(menuOverlay);

        // 建立 menuWrapper 讓選單與按鈕與 stage 等比縮放且永遠在最上層
        const menuWrapper = document.createElement('div');
        menuWrapper.id = 'menuWrapper';
        menuWrapper.style.position = 'fixed';
        menuWrapper.style.zIndex = '30000';
        menuWrapper.style.pointerEvents = 'none'; // 讓點擊穿透到下方的遊戲

        // 恢復選單元件本身的點擊能力
        hamburgerBtn.style.pointerEvents = 'auto';
        menuPanel.style.pointerEvents = 'auto';

        menuWrapper.appendChild(menuPanel);
        menuWrapper.appendChild(hamburgerBtn);
        document.body.appendChild(menuWrapper);

        // 跟隨 stage 的縮放座標
        if (window.registerOverlayResize) {
            window.registerOverlayResize((r) => {
                menuWrapper.style.left = r.left + 'px';
                menuWrapper.style.top = r.top + 'px';
                menuWrapper.style.width = '500px';
                menuWrapper.style.height = '850px';
                menuWrapper.style.transform = 'scale(' + r.scale + ')';
                menuWrapper.style.transformOrigin = 'top left';
            });
        }
    }

    // ----------------------------------------
    // 更新選單內各遊戲的過關次數進度條
    // 顏色與進度依過關次數分段：
    //   0-20次 綠色（100%=20）
    //   21-50次 藍色（100%=50）
    //   51-100次 紅色（100%=100）
    //   101-200次 紫色（100%=200）
    //   201-300次 金黃色（100%=300）
    // ----------------------------------------
    function updateMenuProgressBars() {
        const gamesData = window.ScoreManager
            ? (window.ScoreManager.loadPlayerData().games || {})
            : {};

        document.querySelectorAll('.menu-item[data-page]').forEach(cell => {
            const page = cell.getAttribute('data-page');
            if (!/^game\d+$/.test(page)) return;
            const bar = cell.querySelector('.menu-playcount-bar');
            if (!bar) return;

            const count = (gamesData[page] && gamesData[page].playCount) || 0;

            let color, maxCount;
            if (count <= 20) {
                // 綠色（≤20次）
                color = 'linear-gradient(135deg, hsl(100, 50%, 40%) 0%, hsl(120, 60%, 60%) 100%)';
                maxCount = 20;
            } else if (count <= 50) {
                // 藍色（21-50次）
                color = 'linear-gradient(135deg, hsl(200, 60%, 50%) 0%, hsl(200, 66%, 70%) 100%)';
                maxCount = 50;
            } else if (count <= 100) {
                // 紅色（51-100次）
                color = 'linear-gradient(135deg, hsl(0, 60%, 50%) 0%, hsl(0, 66%, 70%) 100%)';
                maxCount = 100;
            } else if (count <= 200) {
                // 紫色（101-200次）
                color = 'linear-gradient(135deg, hsl(290, 60%, 50%) 0%, hsl(270, 66%, 70%) 100%)';
                maxCount = 200;
            } else {
                // 金黃色（201-300次）
                color = 'linear-gradient(135deg, hsl(50, 80%, 50%) 0%, hsl(60, 80%, 70%) 100%)';
                maxCount = 300;
            }

            const widthPct = Math.min(100, Math.round((count / maxCount) * 100));
            bar.style.width = widthPct + '%';
            bar.style.background = count > 0 ? color : 'transparent';
            bar.title = `過關 ${count} 次`;
        });
    }

    // 暴露讓外部可重整（例如過關動畫結束後更新）
    window.MenuProgressBarsUpdate = updateMenuProgressBars;

    // ----------------------------------------
    // 更新「成就紀錄」圖示右上角提示
    //  - 目前唯一的觸發條件：有資格參加考試但還沒去考 → 顯示黃底紅色驚嘆號
    //
    // ⚠️⚠️ 這裡原本還有另外兩個條件，都是舊「積分升等 + 手動領獎狀」制度的
    //    殘留，已於 2026-08-31 移除（企畫書附錄 F 問題②）：
    //      (a) 「通過考試但未領獎狀」——新制的晉升獎勵在達成當下就自動入帳，
    //          根本沒有「領獎狀」這個動作。留著它會讓紅點永遠消不掉，
    //          因為玩家再怎麼點也不可能把 rank_X 標記成已領。
    //      (c) 「積分達標但未領階級獎狀」（`totalScore >= r.minScore`）——
    //          純積分判定，與文位完全無關，正是那個讓「童生」冒出
    //          假『領取獎狀』按鈕的同一條舊規則。
    // ----------------------------------------
    function updateAchievementBadge() {
        const cell = document.querySelector('.menu-item[data-page="achievements"]');
        if (!cell) return;
        const wrap = cell.querySelector('.menu-item-img-wrap');
        if (!wrap) return;

        let hasAlert = false;
        try {
            const data = (window.ScoreManager && window.ScoreManager.loadPlayerData()) || null;
            const coll = (window.FMCollectionSave && window.FMCollectionSave.load()) || null;
            if (data && coll) {
                const passed = (coll.ranks && coll.ranks.passed) || [];
                const examNames = (window.ScoreManager && window.ScoreManager.EXAM_RANK_NAMES) || [];

                // 有資格應試且尚未通過 → 提醒玩家可以去考棚
                // （資格看必通關卡，不看積分；企畫書 §6）
                for (const name of examNames) {
                    const p = (window.LearningPath && window.LearningPath.getRankExamProgress)
                        ? window.LearningPath.getRankExamProgress(name) : { ok: false };
                    if (p.ok && passed.indexOf(name) < 0) { hasAlert = true; break; }
                }
            }
        } catch (e) { /* ignore */ }

        wrap.classList.toggle('menu-item-alert', hasAlert);
    }
    window.MenuAchievementBadgeUpdate = updateAchievementBadge;
    // 首次計算（等 ScoreManager 初始化後）
    setTimeout(updateAchievementBadge, 500);

    // ----------------------------------------
    // 核心管理器：關閉所有活動中的覆蓋層
    // ----------------------------------------
    function closeAllActiveOverlays() {
        console.log('[Menu] 正在執行全域清理...');

        ['Game1', 'Game2', 'Game3', 'Game4', 'Game5', 'Game6', 'Game7', 'Game8', 'Game9', 'Game10', 'Game11', 'Game12', 'Game13', 'Game14', 'Game15', 'Game16', 'Game17', 'Game19', 'Game20', 'Game21', 'Game22', 'Game23', 'Game24', 'Game25', 'Game26', 'Game27', 'Game28', 'Game29', 'Game30', 'Game31', 'Game32', 'Game33', 'Game34', 'Game35', 'Game36', 'Game37', 'Game38', 'Game39', 'Game40'].forEach(gameName => {
            try {
                if (window[gameName] && typeof window[gameName].stopGame === 'function') {
                    window[gameName].stopGame();
                }
            } catch (e) { console.warn(`[Menu] 停止 ${gameName} 失敗`, e); }
        });

        try {
            if (window.LearningPath && typeof window.LearningPath.stopGame === 'function') {
                window.LearningPath.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏青雲梯失敗', e); }

        try {
            if (window.AchievementDialog && typeof window.AchievementDialog.hide === 'function') {
                window.AchievementDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏成就紀錄失敗', e); }

        try {
            if (window.IntroCard && typeof window.IntroCard.hide === 'function') {
                window.IntroCard.hide();
            }
            if (window.AboutDialog && typeof window.AboutDialog.hide === 'function') {
                window.AboutDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏關於花月失敗', e); }

        try {
            if (window.AuthorBio && typeof window.AuthorBio.hide === 'function') {
                window.AuthorBio.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏名人列傳失敗', e); }

        try {
            if (window.WordCloud && typeof window.WordCloud.stopGame === 'function') {
                window.WordCloud.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏文字雲失敗', e); }

        try {
            if (window.ZheXianRen && typeof window.ZheXianRen.stopGame === 'function') {
                window.ZheXianRen.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏謫仙人失敗', e); }

        try {
            if (window.SuiYuEAn && typeof window.SuiYuEAn.stopGame === 'function') {
                window.SuiYuEAn.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏隨遇而安失敗', e); }

        try {
            if (window.YiChiChunShui && typeof window.YiChiChunShui.stopGame === 'function') {
                window.YiChiChunShui.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏一池春水失敗', e); }

        try {
            if (window.TuiQiao && typeof window.TuiQiao.stopGame === 'function') {
                window.TuiQiao.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏詩仙推敲失敗', e); }

        try {
            if (window.ZhuLuo && typeof window.ZhuLuo.stopGame === 'function') {
                window.ZhuLuo.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏珠落玉盤失敗', e); }

        try {
            if (window.QianZhu && typeof window.QianZhu.stopGame === 'function') {
                window.QianZhu.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏千珠成字失敗', e); }

        try {
            if (window.ChouSi && typeof window.ChouSi.stopGame === 'function') {
                window.ChouSi.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏抽絲剝繭失敗', e); }

        try {
            if (window.KaiZhi && typeof window.KaiZhi.stopGame === 'function') {
                window.KaiZhi.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏開枝散葉失敗', e); }

        try {
            if (window.TuiBo && typeof window.TuiBo.stopGame === 'function') {
                window.TuiBo.stopGame();
            }
        } catch (e) { console.warn('[Menu] 隱藏推波助瀾失敗', e); }

        // 資料瀏覽類頁面群組（成就/群英榜/江南小院/名人列傳/文字雲）：同時只開一個
        try {
            if (window.LeaderboardDialog && typeof window.LeaderboardDialog.hide === 'function') {
                window.LeaderboardDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏群英榜失敗', e); }

        try {
            if (window.CollectionDialog && typeof window.CollectionDialog.hide === 'function') {
                window.CollectionDialog.hide();
            }
        } catch (e) { console.warn('[Menu] 隱藏江南小院失敗', e); }

        try {
            if (window.PoemDialog && typeof window.PoemDialog.close === 'function') {
                window.PoemDialog.close();
            }
        } catch (e) { console.warn('[Menu] 關閉詩詞資料集失敗', e); }

        try {
            if (window.DifficultySelector && typeof window.DifficultySelector.hide === 'function') {
                window.DifficultySelector.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉難度選擇器失敗', e); }

        try {
            if (window.LevelSelector && typeof window.LevelSelector.hide === 'function') {
                window.LevelSelector.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉關卡選擇器失敗', e); }

        try {
            if (window.GameMessage && typeof window.GameMessage.hide === 'function') {
                window.GameMessage.hide();
            }
        } catch (e) { console.warn('[Menu] 關閉遊戲訊息視窗失敗', e); }

        try {
            const card1 = document.getElementById('cardContainer');
            const card2 = document.getElementById('calendarCardContainer');
            if (card1) card1.style.display = 'none';
            if (card2) card2.style.display = 'none';
        } catch (e) { console.warn('[Menu] 隱藏主頁容器失敗', e); }

        try {
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
        } catch (e) { console.warn('[Menu] 重置 Body 狀態失敗', e); }

        console.log('[Menu] 全域清理完成');
    }

    // ----------------------------------------
    // 設定選單事件
    // ----------------------------------------
    function setupMenuEvents() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const menuPanel = document.getElementById('menuPanel');
        const menuOverlay = document.getElementById('menuOverlay');
        const menuItems = document.querySelectorAll('.menu-item');

        function toggleMenu() {
            const isActive = menuPanel.classList.toggle('active');
            if (isActive) {
                if (window.SoundManager) window.SoundManager.playOpenItem();
                // 打開選單時刷新各遊戲的過關次數進度條 & 成就提示
                updateMenuProgressBars();
                updateAchievementBadge();
            } else if (!isActive && window.SoundManager) {
                window.SoundManager.playCloseItem();
            }
            hamburgerBtn.classList.toggle('active');
            menuOverlay.classList.toggle('active');
            document.body.style.overflow = isActive ? 'hidden' : '';
        }

        function closeMenu() {
            menuPanel.classList.remove('active');
            hamburgerBtn.classList.remove('active');
            menuOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        function switchPage(pageName) {
            console.log(`[Menu] 嘗試切換頁面: ${pageName}`);
            closeMenu();

            // 記錄目前頁面並立即套用該頁的煙火／彩色煙霧設定（見檔案上方 TOUCH_EFFECTS）
            currentPage = pageName;
            applyTouchEffects(pageName);

            // 這些頁面只是覆蓋在現有遊戲/日曆/卡片上，不可摧毀底下狀態
            const SKIP_CLEANUP_PAGES = ['about', 'poem-data', 'fullscreen', 'qrcode',
                'achievements', 'leaderboard', 'collection', 'author-biography'];
            if (!SKIP_CLEANUP_PAGES.includes(pageName)) {
                closeAllActiveOverlays();
            }

            try {
                switch (pageName) {
                    case 'learningpath':
                        console.log('[Menu] 切換至青雲梯');
                        if (window.LearningPath) window.LearningPath.show();
                        else console.warn('[Menu] LearningPath 模組未載入');
                        break;
                    case 'calendar':
                        console.log('[Menu] 切換至日曆');
                        {
                            const c1 = document.getElementById('calendarCardContainer');
                            const c2 = document.getElementById('cardContainer');
                            if (c1) {
                                c1.style.display = 'block';
                            } else {
                                window.location.href = 'index.html';
                                break;
                            }
                            if (c2) c2.style.display = 'none';
                        }
                        break;
                    case 'cards':
                        console.log('[Menu] 切換至卡片');
                        if (window.location.pathname.includes('cards.html')) {
                            window.location.href = 'index.html?page=cards';
                        } else {
                            const c1 = document.getElementById('cardContainer');
                            const c2 = document.getElementById('calendarCardContainer');
                            if (c1) c1.style.display = 'block';
                            if (c2) c2.style.display = 'none';
                        }
                        break;
                    case 'game1':
                        if (window.Game1) window.Game1.show();
                        else window.location.href = 'index.html?game=1';
                        break;
                    case 'game2':
                        if (window.Game2) window.Game2.show();
                        else window.location.href = 'index.html?game=2';
                        break;
                    case 'game3':
                        if (window.Game3) window.Game3.show();
                        else window.location.href = 'index.html?game=3';
                        break;
                    case 'game4':
                        if (window.Game4) window.Game4.show();
                        else window.location.href = 'index.html?game=4';
                        break;
                    case 'game5':
                        if (window.Game5) window.Game5.show();
                        else window.location.href = 'index.html?game=5';
                        break;
                    case 'game6':
                        if (window.Game6) window.Game6.show();
                        else window.location.href = 'index.html?game=6';
                        break;
                    case 'game7':
                        if (window.Game7) window.Game7.show();
                        else window.location.href = 'index.html?game=7';
                        break;
                    case 'game8':
                        if (window.Game8) window.Game8.show();
                        else window.location.href = 'index.html?game=8';
                        break;
                    case 'game9':
                        if (window.Game9) window.Game9.show();
                        else window.location.href = 'index.html?game=9';
                        break;
                    case 'game10':
                        if (window.Game10) window.Game10.show();
                        else window.location.href = 'index.html?game=10';
                        break;
                    case 'game11':
                        if (window.Game11) window.Game11.show();
                        else window.location.href = 'index.html?game=11';
                        break;
                    case 'game12':
                        if (window.Game12) window.Game12.show();
                        else window.location.href = 'index.html?game=12';
                        break;
                    case 'game13':
                        if (window.Game13) window.Game13.show();
                        else window.location.href = 'index.html?game=13';
                        break;
                    case 'game14':
                        if (window.Game14) window.Game14.show();
                        else window.location.href = 'index.html?game=14';
                        break;
                    case 'game15':
                        if (window.Game15) window.Game15.show();
                        else window.location.href = 'index.html?game=15';
                        break;
                    case 'game16':
                        if (window.Game16) window.Game16.show();
                        else window.location.href = 'index.html?game=16';
                        break;
                    case 'game17':
                        if (window.Game17) window.Game17.show();
                        else window.location.href = 'index.html?game=17';
                        break;
                    case 'game19':
                        if (window.Game19) window.Game19.show();
                        else window.location.href = 'index.html?game=19';
                        break;
                    case 'game20':
                        if (window.Game20) window.Game20.show();
                        else window.location.href = 'index.html?game=20';
                        break;
                    case 'game21':
                        if (window.Game21) window.Game21.show();
                        else window.location.href = 'index.html?game=21';
                        break;
                    case 'game22':
                        if (window.Game22) window.Game22.show();
                        else window.location.href = 'index.html?game=22';
                        break;
                    case 'game23':
                        if (window.Game23) window.Game23.show();
                        else window.location.href = 'index.html?game=23';
                        break;
                    case 'game24':
                        if (window.Game24) window.Game24.show();
                        else window.location.href = 'index.html?game=24';
                        break;
                    case 'game25':
                        if (window.Game25) window.Game25.show();
                        else window.location.href = 'index.html?game=25';
                        break;
                    case 'game26':
                        if (window.Game26) window.Game26.show();
                        else window.location.href = 'index.html?game=26';
                        break;
                    case 'game27':
                        if (window.Game27) window.Game27.show();
                        else window.location.href = 'index.html?game=27';
                        break;
                    case 'game28':
                        if (window.Game28) window.Game28.show();
                        else window.location.href = 'index.html?game=28';
                        break;
                    case 'game29':
                        if (window.Game29) window.Game29.show();
                        else window.location.href = 'index.html?game=29';
                        break;
                    case 'game30':
                        if (window.Game30) window.Game30.show();
                        else window.location.href = 'index.html?game=30';
                        break;
                    case 'game31':
                        if (window.Game31) window.Game31.show();
                        else window.location.href = 'index.html?game=31';
                        break;
                    case 'game32':
                        if (window.Game32) window.Game32.show();
                        else window.location.href = 'index.html?game=32';
                        break;
                    case 'game33':
                        if (window.Game33) window.Game33.show();
                        else window.location.href = 'index.html?game=33';
                        break;
                    case 'game34':
                        if (window.Game34) window.Game34.show();
                        else window.location.href = 'index.html?game=34';
                        break;
                    case 'game35':
                        if (window.Game35) window.Game35.show();
                        else window.location.href = 'index.html?game=35';
                        break;
                    case 'game36':
                        if (window.Game36) window.Game36.show();
                        else window.location.href = 'index.html?game=36';
                        break;
                    case 'game37':
                        if (window.Game37) window.Game37.show();
                        else window.location.href = 'index.html?game=37';
                        break;
                    case 'game38':
                        if (window.Game38) window.Game38.show();
                        else window.location.href = 'index.html?game=38';
                        break;
                    case 'game39':
                        if (window.Game39) window.Game39.show();
                        else window.location.href = 'index.html?game=39';
                        break;
                    case 'game40':
                        if (window.Game40) window.Game40.show();
                        else window.location.href = 'index.html?game=40';
                        break;
                    case 'author-biography':
                        if (window.AuthorBio) window.AuthorBio.show();
                        else window.location.href = 'index.html?page=author-bio';
                        break;
                    case 'wordcloud':
                        if (window.WordCloud) window.WordCloud.show();
                        else window.location.href = 'index.html?page=wordcloud';
                        break;
                    case 'zhexianren':
                        if (window.ZheXianRen) window.ZheXianRen.show();
                        else window.location.href = 'index.html?page=zhexianren';
                        break;
                    case 'suiyuean':
                        if (window.SuiYuEAn) window.SuiYuEAn.show();
                        else window.location.href = 'index.html?page=suiyuean';
                        break;
                    case 'yichichunshui':
                        if (window.YiChiChunShui) window.YiChiChunShui.show();
                        else window.location.href = 'index.html?page=yichichunshui';
                        break;
                    case 'tuiqiao':
                        if (window.TuiQiao) window.TuiQiao.show();
                        else window.location.href = 'index.html?page=tuiqiao';
                        break;
                    case 'zhuluo':
                        if (window.ZhuLuo) window.ZhuLuo.show();
                        else window.location.href = 'index.html?page=zhuluo';
                        break;
                    case 'qianzhu':
                        if (window.QianZhu) window.QianZhu.show();
                        else window.location.href = 'index.html?page=qianzhu';
                        break;
                    case 'chousi':
                        if (window.ChouSi) window.ChouSi.show();
                        else window.location.href = 'index.html?page=chousi';
                        break;
                    case 'kaizhi':
                        if (window.KaiZhi) window.KaiZhi.show();
                        else window.location.href = 'index.html?page=kaizhi';
                        break;
                    case 'tuibo':
                        if (window.TuiBo) window.TuiBo.show();
                        else window.location.href = 'index.html?page=tuibo';
                        break;
                    case 'achievements':
                        if (window.AchievementDialog) window.AchievementDialog.show();
                        else window.location.href = 'index.html?page=achievements';
                        break;
                    case 'leaderboard':
                        if (window.LeaderboardDialog) window.LeaderboardDialog.show();
                        else console.warn('[Menu] LeaderboardDialog 未載入');
                        break;
                    case 'collection':
                        if (window.CollectionDialog) window.CollectionDialog.show();
                        else console.warn('[Menu] CollectionDialog 未載入');
                        break;
                    case 'about':
                        if (window.IntroCard) window.IntroCard.show();
                        break;
                    case 'qrcode':
                        if (window.QRDialog) window.QRDialog.show();
                        break;
                    case 'poem-data':
                        if (window.PoemDialog) {
                            const randomIdx = Math.floor(Math.random() * (window.POEMS ? window.POEMS.length : 1));
                            window.PoemDialog.openByIndex(randomIdx);
                        } else {
                            console.error('[Menu] PoemDialog 未載入');
                        }
                        break;
                    case 'fullscreen':
                        toggleFullscreen();
                        break;
                    default:
                        console.warn('[Menu] 未知的頁面名稱:', pageName);
                }
            } catch (err) {
                console.error('[Menu] 切換頁面發生錯誤:', err);
            }
        }

        function toggleFullscreen() {
            const docEl = document.documentElement;
            const requestFS = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
            const exitFS = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
            const fsElement = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;

            if (!fsElement) {
                if (requestFS) {
                    requestFS.call(docEl).catch(err => {
                        console.error(`全螢幕嘗試失敗: ${err.message}`);
                    });
                } else {
                    alert('iPhone Safari 目前僅限制影片可全螢幕。建議點選「分享」並選擇「加入主畫面」將此網頁存為 App 獲得類全螢幕體驗。');
                }
            } else {
                if (exitFS) exitFS.call(document);
            }
        }

        hamburgerBtn.addEventListener('click', toggleMenu);
        menuOverlay.addEventListener('click', closeMenu);

        // ----------------------------------------
        // 拖曳捲動支援（滑鼠 + 觸控，含慣性滑動）
        // ----------------------------------------
        let dragStartY = 0;
        let dragStartScrollTop = 0;
        let isDragging = false;
        let hasDragged = false;          // 是否真的有位移（用來區分「點擊」與「拖曳」）
        const DRAG_THRESHOLD = 5;        // 超過幾 px 才算拖曳

        // 慣性滑動相關狀態
        let lastY = 0;
        let lastTime = 0;
        let velocity = 0;                // px / ms
        let momentumRAF = null;
        const FRICTION = 0.985;           // 每影格衰減係數，越接近 1 滑越遠
        const MIN_VELOCITY = 0.02;       // 低於此速度停止慣性

        function stopMomentum() {
            if (momentumRAF) {
                cancelAnimationFrame(momentumRAF);
                momentumRAF = null;
            }
        }

        function startMomentum() {
            stopMomentum();
            function step() {
                velocity *= FRICTION;
                if (Math.abs(velocity) < MIN_VELOCITY) {
                    momentumRAF = null;
                    return;
                }
                menuPanel.scrollTop += velocity * 16; // 以約一影格 16ms 換算位移
                // 觸底/觸頂即停止，避免在邊界持續嘗試捲動造成抖動
                if (menuPanel.scrollTop <= 0 || menuPanel.scrollTop >= menuPanel.scrollHeight - menuPanel.clientHeight) {
                    momentumRAF = null;
                    return;
                }
                momentumRAF = requestAnimationFrame(step);
            }
            momentumRAF = requestAnimationFrame(step);
        }

        function dragMoveTo(clientY) {
            const now = performance.now();
            const dy = dragStartY - clientY;
            if (Math.abs(dy) > DRAG_THRESHOLD) hasDragged = true;
            menuPanel.scrollTop = dragStartScrollTop + dy;

            const dt = now - lastTime;
            if (dt > 0) {
                // 瞬時速度（px/ms），用來作為放開後的慣性初速
                velocity = (clientY - lastY) === 0 ? velocity : -(clientY - lastY) / dt;
            }
            lastY = clientY;
            lastTime = now;
        }

        // 滑鼠拖曳
        menuPanel.addEventListener('mousedown', (e) => {
            stopMomentum();
            isDragging = true;
            hasDragged = false;
            dragStartY = e.clientY;
            dragStartScrollTop = menuPanel.scrollTop;
            lastY = e.clientY;
            lastTime = performance.now();
            velocity = 0;
            menuPanel.style.cursor = 'grabbing';
            menuPanel.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            dragMoveTo(e.clientY);
        });

        document.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            menuPanel.style.cursor = '';
            menuPanel.style.userSelect = '';
            startMomentum();
        });

        // 觸控拖曳
        // 注意：touchmove 必須用 { passive: false } 並呼叫 preventDefault()，
        // 否則瀏覽器原生捲動會與這裡手動設定的 scrollTop 同時作用，造成畫面上下抖動。
        menuPanel.addEventListener('touchstart', (e) => {
            stopMomentum();
            hasDragged = false;
            dragStartY = e.touches[0].clientY;
            dragStartScrollTop = menuPanel.scrollTop;
            lastY = e.touches[0].clientY;
            lastTime = performance.now();
            velocity = 0;
        }, { passive: true });

        menuPanel.addEventListener('touchmove', (e) => {
            e.preventDefault(); // 阻止原生捲動，避免與手動 scrollTop 互相干擾造成抖動
            dragMoveTo(e.touches[0].clientY);
        }, { passive: false });

        menuPanel.addEventListener('touchend', () => {
            startMomentum();
        }, { passive: true });

        // ----------------------------------------
        // 格子點擊（拖曳中忽略）
        // ----------------------------------------
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                if (hasDragged) return;        // 拖曳後不觸發點擊
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                if (item.classList.contains('menu-item-disabled')) return;
                const pageName = item.getAttribute('data-page');
                switchPage(pageName);
            });
        });
    }

    /**
     * 回到首頁（青雲梯）。
     *
     * 供舒壓頁的 ✕ 按鈕呼叫。這些頁面原本的 hide() 只把自己的容器隱藏，
     * 底下沒有任何東西，玩家會看到一片空白的舞台底色（紅底）。
     *
     * ⚠️ 只有玩家「主動關閉」時才呼叫；menu.js 的全域清理走 stopGame()，
     *    那條路徑不可以回首頁，否則會跟正要開啟的新頁面互相打架。
     */
    function goHome() {
        closeAllActiveOverlays();
        currentPage = HOME_PAGE;
        applyTouchEffects(HOME_PAGE);
        if (window.LearningPath && typeof window.LearningPath.show === 'function') {
            window.LearningPath.show();
        } else {
            console.warn('[Menu] LearningPath 模組未載入，無法回到首頁');
        }
    }

    // 暴露全域函數
    window.MenuManager = {
        closeAll: closeAllActiveOverlays,
        goHome: goHome,
        HOME_PAGE: HOME_PAGE
    };
    window.FMGoHome = goHome;

})();
