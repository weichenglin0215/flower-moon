// 確保 calendar.css 已載入（防止其他共用 CSS 的 class 名稱污染）
(function loadCSS() {
    if (!document.getElementById('calendar-css')) {
        const link = document.createElement('link');
        link.id = 'calendar-css';
        link.rel = 'stylesheet';
        link.href = 'calendar.css';
        document.head.appendChild(link);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    // ---------------------------------------------------------
    // 狀態 (STATE)
    // ---------------------------------------------------------
    let currentDate = new Date();

    // 拖曳狀態 (Drag State)
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    let dragTarget = null;

    // 設定 (Configuration)
    const MAX_ROTATION = 15; // 最大旋轉角度

    // DOM 元素
    const container = document.getElementById('calendarCardContainer');
    const template = document.getElementById('calendarCardTemplate');

    // ---------------------------------------------------------
    // 初始化 (INIT)
    // ---------------------------------------------------------
    if (typeof POEMS !== 'undefined') {
        initCards();
    } else {
        container.innerHTML = "<h1 style='color:white'>資料載入錯誤</h1>";
    }

    // ---------------------------------------------------------
    // 核心邏輯 (CORE LOGIC)
    // ---------------------------------------------------------
    function initCards() {
        // 渲染初始堆疊
        renderStack();
        attachGlobalDragEvents();
    }

    function renderStack() {
        container.innerHTML = '';

        // 1. 底層卡片 (用作 下一張/上一張 的預覽)
        const bottomDate = getOffsetDate(currentDate, 1);
        const bottomCard = createCardElement(bottomDate);
        bottomCard.id = 'calendarBottomCard';
        bottomCard.style.zIndex = 1;
        bottomCard.style.transform = 'scale(0.85)';
        bottomCard.style.filter = 'brightness(0.6)'; // 較暗
        container.appendChild(bottomCard);

        // 2. 頂層卡片 (當前顯示)
        const topCard = createCardElement(currentDate);
        topCard.id = 'calendarTopCard';
        topCard.style.zIndex = 10;
        container.appendChild(topCard);
    }

    // 動態更新底層卡片的內容
    function updateBottomCardContent(offset) {
        const bottomCard = document.getElementById('calendarBottomCard');
        if (!bottomCard) return;

        const newDate = getOffsetDate(currentDate, offset);
        const newCardEl = createCardElement(newDate);

        // 將新生成的內容複製到底層卡片
        bottomCard.innerHTML = newCardEl.innerHTML;
        bottomCard.style.setProperty('--card-hue', newCardEl.style.getPropertyValue('--card-hue'));
        bottomCard.style.color = newCardEl.style.color;
        bottomCard.className = newCardEl.className; // 複製樣式變體
        bottomCard.id = 'calendarBottomCard'; // 保持 ID
        bottomCard.style.zIndex = 1; // 保持 Z-Index
    }

    function createCardElement(date) {
        const clone = template.content.cloneNode(true);
        const cardInner = clone.querySelector('.calendarCard');

        // -----------------------------------------------------
        // 決定性生成 (基於種子 = 年月日)
        // -----------------------------------------------------
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const seed = y * 10000 + m * 100 + d;

        // 輔助函式：基於種子的偽隨機數生成器
        function seededRandom(offset = 0) {
            const x = Math.sin(seed + offset) * 10000;
            return x - Math.floor(x);
        }

        // 1. 顏色 (色相 Hue)
        const hue = Math.floor(seededRandom(1) * 360);
        cardInner.style.setProperty('--card-hue', hue);

        // 2. 詩詞選擇
        let poem;
        let forcedLines = null;
        let festivalLabel = null;
        const dateKey = `${y}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}`;

        if (typeof CALENDAR_ASSIGNMENTS !== 'undefined' && CALENDAR_ASSIGNMENTS[dateKey]) {
            const assignment = CALENDAR_ASSIGNMENTS[dateKey];
            if (Array.isArray(assignment)) {
                // 格式: [id, label, line1, line2, line3, line4]
                const [assignedId, label, ...lines] = assignment;
                poem = POEMS.find(p => p.id === assignedId);
                if (label) festivalLabel = label;
                if (lines && lines.length > 0) forcedLines = lines;
            } else {
                const assignedId = assignment;
                poem = POEMS.find(p => p.id === assignedId);
            }
        }

        // 如果找不到分配，或是沒載入分配表，則採用原有的隨機機制
        if (!poem) {
            const highRatingPoems = POEMS.filter(p => (p.rating || 0) >= 4);
            const poemIndex = Math.floor(seededRandom(2) * highRatingPoems.length);
            poem = highRatingPoems[poemIndex];
        }

        // 3. 宜忌 (基於節氣與農曆)
        let luckyText = "讀書";
        let unluckyText = "發呆";
        let solarTerm = "";
        let lunarMonth = 1;

        if (window.Lunar) {
            const lunar = Lunar.fromDate(date);
            solarTerm = lunar.getJieQi() || lunar.getPrevJieQi().getName(); // 當前或最近的節氣
            lunarMonth = lunar.getMonth(); // 農曆月份 (1-12)
        }

        const luckyUnlucky = getLuckyUnluckyBySolarTerm(solarTerm, lunarMonth, seed);
        luckyText = luckyUnlucky.lucky;
        unluckyText = luckyUnlucky.unlucky;

        // --- 渲染 DOM (Render DOM) ---
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        cardInner.querySelector('.year-month').textContent = `${y}.${m.toString().padStart(2, '0')}`;
        cardInner.querySelector('.day-number').textContent = d.toString().padStart(2, '0');
        cardInner.querySelector('.weekday').textContent = weekdays[date.getDay()];

        const titleEl = cardInner.querySelector('.poem-title');
        const authorEl = cardInner.querySelector('.poem-author');

        // 1. 先取得原始標題（處理無題或空內容的情況）
        let rawTitle = (poem.title && poem.title.trim())
            ? poem.title
            : (Array.isArray(poem.content) && poem.content.length ? poem.content[0] : "無題");

        // 2. 限制字數在 12 個字以內並加上 "..."
        titleEl.textContent = rawTitle.length > 12
            ? rawTitle.slice(0, 10) + "..."
            : rawTitle;

        titleEl.setAttribute('data-poem-id', poem.id);

        authorEl.textContent = `${poem.dynasty || ''} · ${poem.author || '佚名'}`;
        authorEl.setAttribute('data-poem-id', poem.id);

        cardInner.querySelector('.activity.good .value').textContent = luckyText;
        cardInner.querySelector('.activity.bad .value').textContent = unluckyText;

        // 詩詞內文
        const poemBody = cardInner.querySelector('.poem-body');
        if (forcedLines) {
            // 直接顯示強制的詩句 (陣列格式)
            forcedLines.forEach(text => {
                const div = document.createElement('div');
                div.className = 'poem-line best-line'; // 強制詩句視為最佳金句
                div.textContent = text;
                poemBody.appendChild(div);
            });
        } else {
            // 隨機獲取 4 句最佳詩句
            const lines = getBestLines(poem, 4);
            lines.forEach(line => {
                const div = document.createElement('div');
                div.className = 'poem-line';
                div.textContent = line.text;
                if (line.rating >= 3) div.classList.add('best-line');
                poemBody.appendChild(div);
            });
        }

        // 農曆 (Lunar) 與 節假日 (Festivals)
        if (window.Lunar) {
            const lunar = Lunar.fromDate(date);

            // 繁體中文映射 (用於處理 lunar-javascript 可能返回的簡體字)
            const tMap = {
                '龙': '龍', '马': '馬', '鸡': '雞', '猪': '豬',
                '节': '節', '气': '氣', '农': '農', '历': '曆',
                '腊': '臘', '阳': '陽', '惊': '驚', '蛰': '蟄',
                '谷': '穀', '满': '滿', '种': '種', '处': '處',
                '园': '園', '团': '團', '后': '後', '胜': '勝',
                '儿': '兒', '劳': '勞', '动': '動', '国': '國', '庆': '慶',
                '圣': '聖', '诞': '誕', '华': '華', '礼': '禮'
            };
            const toT = (s) => s ? s.split('').map(c => tMap[c] || c).join('') : '';

            // 1. 農曆資訊文字
            const ganZhi = lunar.getYearInGanZhi();
            const shengXiao = toT(lunar.getYearShengXiao());
            const monthChan = toT(lunar.getMonthInChinese());
            const dayChan = lunar.getDayInChinese();
            const currentJieQi = lunar.getJieQi();

            // 2. 節假日處理
            const festivals = [];

            // 1. 陽曆節日
            const gregHoliday = getHoliday(m, d);
            if (gregHoliday) festivals.push(gregHoliday);

            // 2. 自定義節日標籤 (來自 CALENDAR_ASSIGNMENTS)，但是避開月份開頭(與月份/日期相關的特定詩詞)
            if (festivalLabel && festivalLabel !== "一月" && festivalLabel !== "二月" && festivalLabel !== "三月" && festivalLabel !== "四月" && festivalLabel !== "五月" && festivalLabel !== "六月" && festivalLabel !== "七月" && festivalLabel !== "八月" && festivalLabel !== "九月" && festivalLabel !== "十月" && festivalLabel !== "十一月" && festivalLabel !== "十二月") {
                festivals.push(festivalLabel);
            }

            // 1.5 節氣處理：如果今天剛好是節氣，則加入節假日列表
            if (currentJieQi) {
                const jieQiName = toT(currentJieQi);
                if (!festivals.includes(jieQiName)) festivals.push(jieQiName);
            }

            // 3. 農曆節日 (庫自帶)
            lunar.getFestivals().forEach(f => festivals.push(toT(f)));

            // 確保包含使用者要求的傳統節日 (以防庫未收錄或名稱不同)
            const lm = lunar.getMonth();
            const ld = lunar.getDay();
            const lunarFests = {
                '1-1': '春節',
                '1-15': '元宵節',
                '5-5': '端午節',
                '7-7': '七夕節',
                '7-15': '中元節',
                '8-15': '中秋節',
                '9-9': '重陽節',
                '12-8': '臘八節',
                '12-28': '小年夜',
                '12-30': '除夕'
            };
            const lunarKey = `${lm}-${ld}`;
            if (lunarFests[lunarKey]) {
                if (!festivals.includes(lunarFests[lunarKey])) festivals.push(lunarFests[lunarKey]);
            }

            // 除夕判斷：農曆 12 月的最後一天 (不論是 29 還是 30)
            if (lm === 12) {
                // 檢查明天是否為正月初一
                const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
                const tomorrowLunar = Lunar.fromDate(tomorrow);
                if (tomorrowLunar.getMonth() === 1 && tomorrowLunar.getDay() === 1) {
                    if (!festivals.includes('除夕')) festivals.push('除夕');
                }
            }

            // 節氣轉節日 (清明)
            if (currentJieQi === "清明") {
                if (!festivals.includes("清明節")) festivals.push("清明節");
            }

            // 3. 渲染右側資訊：合併成單一行顯示
            const hContainer = cardInner.querySelector('.holidays-container');
            const lunarInfo = cardInner.querySelector('.lunar-info');

            // 處理長度邏輯 (限制 16 字)
            const pureLunarDate = `${ganZhi}${shengXiao}年${monthChan}月${dayChan}日`; // 基礎農曆日期
            let jieQiNearness = ""; // "近節氣"
            if (!currentJieQi) {
                const nextJieQi = lunar.getNextJieQi();
                if (nextJieQi) jieQiNearness = `·近${toT(nextJieQi.getName())}`;
            }

            const uniqueFests = [...new Set(festivals)];

            // 構建初始完整文字
            let combinedText = pureLunarDate + jieQiNearness;
            if (uniqueFests.length > 0) {
                combinedText += "·" + uniqueFests.join("·");
            }

            // 超長處理 (16字限制)
            if (combinedText.length > 16) {
                // 1. 優先移除「近節氣」
                jieQiNearness = "";
                combinedText = pureLunarDate;
                if (uniqueFests.length > 0) {
                    combinedText += "·" + uniqueFests.join("·");
                }

                // 2. 如果還是太長，移除「當日節氣」
                if (combinedText.length > 16 && currentJieQi) {
                    const jieQiName = toT(currentJieQi);
                    const filteredFests = uniqueFests.filter(f => f !== jieQiName);
                    combinedText = pureLunarDate;
                    if (filteredFests.length > 0) {
                        combinedText += "·" + filteredFests.join("·");
                    }
                }

                // 3. 如果依然太長... 截斷
                if (combinedText.length > 16) {
                    combinedText = combinedText.substring(0, 16);
                }
            }

            // 全部顯示在 holidays-container，清空 lunar-info 以達成單一行效果
            lunarInfo.textContent = '';
            lunarInfo.style.display = 'none';
            hContainer.innerHTML = '';

            const singleLineDiv = document.createElement('div');
            singleLineDiv.textContent = combinedText;
            singleLineDiv.className = 'vertical-text';
            hContainer.appendChild(singleLineDiv);
        }

        return cardInner;
    }

    // ---------------------------------------------------------
    // 互動 (全域拖曳 Global Drag)
    // ---------------------------------------------------------
    function attachGlobalDragEvents() {
        const touchZone = document.body;

        touchZone.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        touchZone.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function dragStart(e) {
        const topCard = document.getElementById('calendarTopCard');
        if (!topCard) return;
        if (!e.target.closest('#calendarTopCard')) return;

        if (window.SoundManager) window.SoundManager.playOpenItem();
        isDragging = true;
        dragTarget = topCard;
        lastDirection = 0;

        topCard.classList.remove('animate-recoil', 'animate-flyout');
        topCard.style.transition = 'none';

        startX = getClientX(e);
        currentX = startX;
    }

    let lastDirection = 0; // 1 = 右 (明天), -1 = 左 (昨天)

    function dragMove(e) {
        if (!isDragging || !dragTarget) return;

        if (e.type === 'touchmove') e.preventDefault();

        currentX = getClientX(e);
        const diffX = currentX - startX;

        const rotation = diffX * 0.05;
        dragTarget.style.transform = `translateX(${((diffX) * 0.03).toFixed(1)}rem) rotate(${rotation}deg)`;

        const bottomCard = document.getElementById('calendarBottomCard');
        if (bottomCard) {
            const cardWidth = dragTarget.offsetWidth;
            const threshold = cardWidth * 0.5;

            if (diffX > 10 && lastDirection !== 1) {
                lastDirection = 1;
                updateBottomCardContent(1);
            } else if (diffX < -10 && lastDirection !== -1) {
                lastDirection = -1;
                updateBottomCardContent(-1);
            }

            const progress = Math.min(Math.abs(diffX) / threshold, 1);
            const scale = 0.85 + (0.15 * progress);
            const brightness = 0.6 + (0.4 * progress);

            bottomCard.style.transform = `scale(${scale})`;
            bottomCard.style.filter = `brightness(${brightness})`;
        }
    }

    function dragEnd(e) {
        if (!isDragging || !dragTarget) return;

        const card = dragTarget;
        isDragging = false;
        dragTarget = null;

        const diffX = currentX - startX;
        const cardWidth = card.offsetWidth;
        const finalThreshold = cardWidth * 0.4;

        if (Math.abs(diffX) > finalThreshold) {
            card.style.transition = '';
            card.classList.add('animate-flyout');

            const dir = diffX > 0 ? 1 : -1;
            const endX = dir * window.innerWidth * 1.5;
            card.style.transform = `translateX(${((endX) * 0.03).toFixed(1)}rem) rotate(${dir * 30}deg)`;

            const bottomCard = document.getElementById('calendarBottomCard');
            if (bottomCard) {
                bottomCard.style.transition = 'transform 0.4s ease, filter 0.4s ease';
                bottomCard.style.transform = 'scale(1.0)';
                bottomCard.style.filter = 'brightness(1.0)';
            }

            const offset = dir > 0 ? 1 : -1;
            setTimeout(() => {
                currentDate.setDate(currentDate.getDate() + offset);
                renderStack();
            }, 300);
            if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();
        } else {
            card.style.transition = '';
            void card.offsetWidth;
            card.classList.add('animate-recoil');
            requestAnimationFrame(() => {
                card.style.transform = `translate(0.0rem, 0.0rem) rotate(0deg)`;
            });

            const bottomCard = document.getElementById('calendarBottomCard');
            if (bottomCard) {
                bottomCard.style.transition = 'transform 0.5s ease, filter 0.5s ease';
                bottomCard.style.transform = 'scale(0.85)';
                bottomCard.style.filter = 'brightness(0.6)';
            }
        }
    }

    function getClientX(e) {
        return e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    }

    function getOffsetDate(base, offset) {
        const d = new Date(base);
        d.setDate(base.getDate() + offset);
        return d;
    }

    function getHoliday(m, d) {
        const holidays = {
            '1-1': '元旦',
            '2-14': '情人節',
            '4-1': '愚人節',
            '4-4': '兒童節',
            '5-1': '勞動節',
            '8-8': '父親節',
            '9-28': '孔子誕辰',
            '10-10': '國慶日',
            '11-11': '光棍節',
            '12-25': '聖誕節'
        };
        return holidays[`${m}-${d}`] || "";
    }
    //產生宜忌文字
    function getLuckyUnluckyBySolarTerm(solarTerm, lunarMonth, seed) {
        const luckyPool = ["已讀不回", "手抄詩詞", "月下獨酌", "享受孤獨", "恐怖電影", "寫小說", "著漢服", "自拍", "手寫情書", "告白", "吃冰淇淋", "吃荔枝", "補眠", "拒社交", "折紙飛機", "靜音", "放風箏", "砸鬧鐘", "投稿", "取消追蹤", "泡咖啡", "逛夜市", "念詩給貓", "準時下班", "放空", "湖上泛舟", "泡茶", "聽平劇", "泡溫泉", "發限動", "爬山", "竹杖芒鞋", "素食", "上山看雪", "發呆看雲", "背包窮遊", "手寫卡片", "採菊東籬", "爵士舞", "尋仙訪聖", "登高望遠", "結伴翹班", "買書不看", "買新衣", "開會時發呆", "陽台發呆", "約閨蜜", "浮生半日", "背唐詩", "自然醒", "跳廣場舞", "訪故人", "窩沙發", "裸辭追夢", "寫日記", "寫詩作畫", "練字", "賞荷", "冷門技能", "斷捨離", "整理舊書", "打包舊愛", "舉杯邀明月", "靜坐觀心", "煮泡麵", "舊城漫遊", "離線模式", "騎單車", "關閉通知", "看星星", "聽雨", "聽琴品茗", "曬書", "賞花"];
        const unluckyPool = ["雨天沒傘", "已讀不回", "分手快樂", "被丟包", "流口水", "裝逼", "發限動", "熬夜加班", "打卡書店", "打卡景點", "愛上網美", "發現白髮", "假裝生病", "微波食品", "吃到飽", "老眼昏花", "收好人卡", "告白", "忘記密碼", "沒酒了", "刷短影音", "孤枕難眠", "拍馬屁", "出差", "瘋狂購物", "人擠人", "通勤地獄", "借酒澆愁", "借筆記", "借錢", "催婚", "迷路", "吃土", "倍速追劇", "耍帥裝逼", "叫外送", "古典樂", "前任婚禮", "視訊", "回訊息", "猜心思", "聊政治", "吃雞排", "藕斷絲連", "小人纏身", "報復消費", "後悔復合", "裝文青", "等不到人", "買琴不彈", "買書不看", "買酒不喝", "喝酒不醉", "提離職", "想家", "群發訊息", "落榜", "撞衫", "經典文學", "流行語", "買參考書", "買基金", "斷食法", "酸民吵架", "無效社交", "手機焦慮", "里程焦慮", "團建尬聊", "團購美食", "夢醒了", "網購解憂", "寫詩", "模仿簽名", "熬夜K書", "獨愴涕下", "薪水微薄", "失戀", "單相思", "懷才不遇", "藝術展", "畫展", "書展", "電玩展", "動漫展", "成人展", "邊吃邊回", "戀愛腦"];

        function createSeededRandom(baseSeed) {
            let state = baseSeed;
            return function (offset = 0) {
                let t = state + offset * 1013904223;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
        }

        const seededRandom = createSeededRandom(seed);
        const luckyItems = [];
        const unluckyItems = [];

        const luckyCount = Math.floor(seededRandom(10) * 2) + 2;
        const luckyStringMaxLength = 10;
        let luckyString = "";
        let attempts = 0;
        while (luckyItems.length < luckyCount && attempts < 100) {
            const idx = Math.floor(seededRandom(100 + attempts) * luckyPool.length);
            if (!luckyItems.includes(luckyPool[idx])) {
                if (luckyString.length + luckyPool[idx].length <= luckyStringMaxLength) {
                    luckyString += luckyPool[idx] + " · ";
                    luckyItems.push(luckyPool[idx]);
                }
            }
            attempts++;
        }

        const unluckyCount = Math.floor(seededRandom(200) * 2) + 2;
        const unluckyStringMaxLength = 10;
        let unluckyString = "";
        attempts = 0;
        while (unluckyItems.length < unluckyCount && attempts < 100) {
            const idx = Math.floor(seededRandom(300 + attempts) * unluckyPool.length);
            if (!unluckyItems.includes(unluckyPool[idx])) {
                if (unluckyString.length + unluckyPool[idx].length <= unluckyStringMaxLength) {
                    unluckyString += unluckyPool[idx] + " · ";
                    unluckyItems.push(unluckyPool[idx]);
                }
            }
            attempts++;
        }

        return {
            lucky: luckyItems.join(' · ') || "讀書",
            unlucky: unluckyItems.join(' · ') || "發呆"
        };
    }

    function getBestLines(poem, maxLines) {
        if (!poem.content) return [];
        let linesWithRating = poem.content.map((text, idx) => ({
            text,
            rating: (poem.line_ratings && poem.line_ratings[idx]) || 0,
            index: idx
        }));
        let goodLines = linesWithRating.filter(l => l.rating > 0);
        if (goodLines.length === 0) goodLines = linesWithRating;
        goodLines.sort((a, b) => b.rating - a.rating);
        let selected = goodLines.slice(0, maxLines);
        selected.sort((a, b) => a.index - b.index);
        return selected;
    }

    // ---------------------------------------------------------
    // 對外控制 API（供自動截圖等工具使用）
    // ---------------------------------------------------------
    window.CalendarController = {
        /**
         * 跳躍到指定日期並重新渲染日曆堆疊
         * @param {Date|string} date  Date 物件，或 "YYYYMMDD" / "YYYY-MM-DD" 字串
         */
        jumpToDate: function (date) {
            if (typeof date === 'string') {
                const s = date.replace(/-/g, '');
                const y = parseInt(s.slice(0, 4), 10);
                const mo = parseInt(s.slice(4, 6), 10) - 1;
                const d = parseInt(s.slice(6, 8), 10);
                currentDate = new Date(y, mo, d);
            } else {
                currentDate = new Date(date);
            }
            renderStack();
        },
        /** 取得目前顯示日期 */
        getCurrentDate: function () {
            return new Date(currentDate);
        }
    };
});
