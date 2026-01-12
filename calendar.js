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
        bottomCard.id = 'bottomCard';
        bottomCard.style.zIndex = 1;
        bottomCard.style.transform = 'scale(0.85)';
        bottomCard.style.filter = 'brightness(0.6)'; // 較暗
        container.appendChild(bottomCard);

        // 2. 頂層卡片 (當前顯示)
        const topCard = createCardElement(currentDate);
        topCard.id = 'topCard';
        topCard.style.zIndex = 10;
        container.appendChild(topCard);
    }

    // 動態更新底層卡片的內容
    function updateBottomCardContent(offset) {
        const bottomCard = document.getElementById('bottomCard');
        if (!bottomCard) return;

        const newDate = getOffsetDate(currentDate, offset);
        const newCardEl = createCardElement(newDate);

        // 將新生成的內容複製到底層卡片
        bottomCard.innerHTML = newCardEl.innerHTML;
        bottomCard.style.setProperty('--card-hue', newCardEl.style.getPropertyValue('--card-hue'));
        bottomCard.style.color = newCardEl.style.color;
        bottomCard.className = newCardEl.className; // 複製樣式變體
        bottomCard.id = 'bottomCard'; // 保持 ID
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

        // 2. 詩詞選擇 - 只選擇評價在 1 以上的詩詞
        const highRatingPoems = POEMS.filter(p => (p.rating || 0) > 1);
        const poemIndex = Math.floor(seededRandom(2) * highRatingPoems.length);
        const poem = highRatingPoems[poemIndex];

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
        titleEl.textContent = poem.title || "無題";
        authorEl.textContent = `${poem.dynasty || ''} · ${poem.author || '佚名'}`;
        titleEl.setAttribute('data-poem-id', poem.id);
        authorEl.setAttribute('data-poem-id', poem.id);

        cardInner.querySelector('.activity.good .value').textContent = luckyText;
        cardInner.querySelector('.activity.bad .value').textContent = unluckyText;

        // 詩詞內文 (取評分最高的 4 句)
        const lines = getBestLines(poem, 4);
        const poemBody = cardInner.querySelector('.poem-body');
        lines.forEach(line => {
            const div = document.createElement('div');
            div.className = 'poem-line';
            div.textContent = line.text;
            if (line.rating >= 3) div.classList.add('best-line');
            poemBody.appendChild(div);
        });

        // 農曆 (Lunar)
        if (window.Lunar) {
            const lunar = Lunar.fromDate(date);
            let lunarHtml = `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}日`;

            const currentJieQi = lunar.getJieQi();
            if (currentJieQi) {
                lunarHtml += ` · ${currentJieQi}`;
            } else {
                const nextJieQi = lunar.getNextJieQi();
                if (nextJieQi) {
                    lunarHtml += ` · 近${nextJieQi.getName()}`;
                }
            }
            cardInner.querySelector('.lunar-info').textContent = lunarHtml;
        }

        // 節假日 (Holidays)
        const holidayText = getHoliday(m, d);
        if (holidayText) {
            const hDiv = document.createElement('div');
            hDiv.textContent = holidayText;
            cardInner.querySelector('.holidays-container').appendChild(hDiv);
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
        const topCard = document.getElementById('topCard');
        if (!topCard) return;
        if (!e.target.closest('#topCard')) return;

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
        dragTarget.style.transform = `translateX(${diffX}px) rotate(${rotation}deg)`;

        const bottomCard = document.getElementById('bottomCard');
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
            card.style.transform = `translateX(${endX}px) rotate(${dir * 30}deg)`;

            const bottomCard = document.getElementById('bottomCard');
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
        } else {
            card.style.transition = '';
            void card.offsetWidth;
            card.classList.add('animate-recoil');
            requestAnimationFrame(() => {
                card.style.transform = `translate(0px, 0px) rotate(0deg)`;
            });

            const bottomCard = document.getElementById('bottomCard');
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
        if (m === 1 && d === 1) return "元旦　";
        if (m === 4 && d === 4) return "兒童節　";
        if (m === 4 && d === 5) return "清明節　";
        if (m === 5 && d === 1) return "勞動節　";
        if (m === 10 && d === 10) return "國慶日　";
        return "";
    }

    function getLuckyUnluckyBySolarTerm(solarTerm, lunarMonth, seed) {
        const luckyPool = ["已讀不回", "手抄詩詞", "月下獨酌", "享受孤獨", "看恐怖電影", "半夜寫小說", "古裝自拍", "手寫情書告白", "吃冰淇淋", "吃荔枝", "發早安圖", "圖書館補眠", "刪掉社交軟體", "改同事暱稱", "考試折紙飛機", "手機調成靜音", "電視音量開最大", "把鬧鐘砸了", "投稿匿名詩", "取消追蹤", "咖啡廳裝忙", "自己逛夜市", "念詩給貓聽", "拒絕加班", "放空一整天", "放風箏", "湖上泛舟", "泡茶聽平劇", "泡溫泉發限動", "爬山發限動", "竹杖芒鞋輕勝馬", "挑戰素食", "上山看雪", "發呆看雲", "罵老闆", "背包客窮遊", "換手機", "家族群組靜音", "送手寫卡片", "採菊東籬", "報名爵士舞", "尋仙訪聖", "登高望遠", "結伴翹班", "買書不看", "買新衣", "視訊會議露下巴", "開會時發呆", "陽台發呆", "約閨蜜", "準時下班", "浮生半日閒", "睡到自然醒", "偷吃雞排", "跳廣場舞", "訪故人", "窩沙發", "裸辭追夢", "寫日記", "寫詩作畫", "練字", "賞荷", "學冷門技能", "斷捨離", "整理舊書", "舉杯邀明月", "靜坐觀心", "煮泡麵", "舊城區漫遊", "離線模式", "騎單車", "關閉通知", "看星星", "聽雨", "聽琴品茗", "曬書", "賞花"];
        const unluckyPool = ["雨天沒帶傘", "已讀不回", "分手快樂", "分組被丟包", "午睡流口水", "裝逼", "比較IG限動", "加班到半夜", "打卡書店", "打卡網美景點", "發現白髮", "請沒生病假", "吃微波食品", "試吃吃到飽", "老眼昏花", "收好人卡", "告白選節日", "忘記密碼", "沒酒了", "刷短影音", "孤枕難眠", "拍馬屁", "出差", "相信購物專家", "穿新鞋被踩", "音樂節人擠人", "通勤地獄", "借酒澆愁", "借筆記給學霸", "借錢給同事", "被催婚", "迷路", "吃土", "二倍速追劇", "耍帥裝逼", "叫外送", "古典樂", "前任婚禮", "深夜回訊息", "猜另一半心思", "聊政治毀友情", "藕斷絲連", "小人纏身", "報復性消費", "復合又後悔", "背唐詩裝文青", "等不到人", "買琴當家具", "週一提離職", "想家", "群發訊息", "落榜", "修理遙控器", "跟老闆撞衫", "看經典文學", "不懂流行語", "買參考書", "買基金", "斷食法", "跟酸民吵架", "無效社交", "遇到強盜", "團建尬聊", "團購美食", "夢醒了", "網購解憂", "寫詩不押韻", "模仿簽名", "熬夜K書", "獨愴涕下", "薪水微薄", "失戀/單相思", "懷才不遇", "看藝術展", "邊吃邊回", "戀愛腦"];

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
        const luckyStringMaxLength = 13;
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
        const unluckyStringMaxLength = 13;
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
});
