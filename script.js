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
    // SWIPE_THRESHOLD 將在 dragStart 時動態計算 (基於卡片寬度)
    // const SWIPE_THRESHOLD = 80; 
    const MAX_ROTATION = 15; // 最大旋轉角度

    // DOM 元素
    const container = document.getElementById('cardContainer');
    const template = document.getElementById('cardTemplate');

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
        // 預設填入明天的日期 (符合向右滑動的直覺)
        // 但實際上視覺效果 (透明度/縮放) 會隨拖曳動態改變
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
        // 我們可以直接替換 innerHTML 或重新生成
        // 重新生成比較安全，能確保樣式正確
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
        const cardInner = clone.querySelector('.card');

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
        const poemIndex = Math.floor(seededRandom(2) * POEMS.length);
        const poem = POEMS[poemIndex];

        // 3. 宜忌 (獨立於詩詞，基於日期)
        // 為了確保每天的宜忌固定，我們使用隨機數種子來選擇，
        // 而不是使用詩詞本身的 lucky 欄位 (除非詩詞庫很大且固定)
        // 這裡我們暫時沿用 poem 的資料以確保穩定性，如果 poem 資料不足再 fallback
        const luckyText = poem.lucky || "讀書";
        const unluckyText = poem.unlucky || "發呆";

        // --- 渲染 DOM (Render DOM) ---
        // 日期標題
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        cardInner.querySelector('.year-month').textContent = `${y}.${m.toString().padStart(2, '0')}`;
        cardInner.querySelector('.day-number').textContent = d.toString().padStart(2, '0');
        cardInner.querySelector('.weekday').textContent = weekdays[date.getDay()];

        // 內容填充
        cardInner.querySelector('.poem-title').textContent = poem.title || "無題";
        cardInner.querySelector('.poem-author').textContent = `${poem.dynasty || ''} · ${poem.author || '佚名'}`;

        cardInner.querySelector('.activity.good .value').textContent = luckyText;
        cardInner.querySelector('.activity.bad .value').textContent = unluckyText;

        // 詩詞內文 (取評分最高的 4 句)
        const lines = getBestLines(poem, 4);
        const poemBody = cardInner.querySelector('.poem-body');
        lines.forEach(line => {
            const div = document.createElement('div');
            div.className = 'poem-line';
            div.textContent = line.text;
            // 高分詩句加粗邏輯也是決定性的
            if (line.rating >= 3) div.classList.add('best-line');
            poemBody.appendChild(div);
        });

        // 農曆 (Lunar)
        if (window.Lunar) {
            const lunar = Lunar.fromDate(date);
            let lunarHtml = `${lunar.getYearInGanZhi()}${lunar.getYearShengXiao()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}日`;
            const jieQi = lunar.getJieQi();
            if (jieQi) lunarHtml += ` · 近${jieQi}`;
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
        // 監聽 document 以捕捉任何地方的拖曳
        // 但開始 (start) 必須在卡片上
        const touchZone = document.body;

        touchZone.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        touchZone.addEventListener('touchstart', dragStart, { passive: false }); // passive false 才能使用 preventDefault
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
    }

    function dragStart(e) {
        // 目標必須在頂層卡片內
        const topCard = document.getElementById('topCard');
        if (!topCard) return;
        if (!e.target.closest('#topCard')) return;

        isDragging = true;
        dragTarget = topCard;
        lastDirection = 0; // 重置方向，確保新的拖曳能正確判斷左右

        // 清除動畫 class，避免干擾拖曳
        topCard.classList.remove('animate-recoil', 'animate-flyout');
        topCard.style.transition = 'none';

        startX = getClientX(e);
    }

    let lastDirection = 0; // 1 = 右 (明天), -1 = 左 (昨天)

    function dragMove(e) {
        if (!isDragging || !dragTarget) return;

        // 防止手機版面的捲動
        if (e.type === 'touchmove') e.preventDefault();

        currentX = getClientX(e);
        const diffX = currentX - startX;

        // 1. 移動頂層卡片
        const rotation = diffX * 0.05;
        // 限制旋轉角度
        dragTarget.style.transform = `translateX(${diffX}px) rotate(${rotation}deg)`;

        // 2. 底層卡片動畫邏輯
        const bottomCard = document.getElementById('bottomCard');
        if (bottomCard) {
            const cardWidth = dragTarget.offsetWidth;
            const threshold = cardWidth * 0.5; // 半張卡片距離

            // 檢查方向意圖
            // 閾值：只要稍微移動 10px 就切換預覽內容
            if (diffX > 10 && lastDirection !== 1) {
                lastDirection = 1;
                // 向右拖曳 -> 下一張是 明天
                updateBottomCardContent(1);
            } else if (diffX < -10 && lastDirection !== -1) {
                lastDirection = -1;
                // 向左拖曳 -> 下一張是 昨天
                updateBottomCardContent(-1);
            }

            // 根據進度插值計算縮放與亮度
            // 使用卡片寬度的一半作為「完成」的基準
            const progress = Math.min(Math.abs(diffX) / threshold, 1);

            // 縮放: 0.85 -> 1.0
            const scale = 0.85 + (0.15 * progress);
            // 亮度: 0.6 -> 1.0
            const brightness = 0.6 + (0.4 * progress);

            bottomCard.style.transform = `scale(${scale})`;
            bottomCard.style.filter = `brightness(${brightness})`;
        }
    }

    function dragEnd(e) {
        if (!isDragging || !dragTarget) return;

        // 將元素變數本地化，避免在 RAF 執行時 dragTarget 已被清空
        const card = dragTarget;
        isDragging = false;
        // 立即清除全局變數
        dragTarget = null;

        const diffX = currentX - startX;
        // 動態取得卡片寬度作為閾值
        const cardWidth = card.offsetWidth;
        const finalThreshold = cardWidth * 0.4;

        // 檢查是否超過滑動閾值
        if (Math.abs(diffX) > finalThreshold) {
            // 成功滑動 (Success Swipe)
            // 加入飛出動畫 (加速效果)
            card.style.transition = ''; // 清除 inline-style 以允許 CSS transition 生效
            card.classList.add('animate-flyout');

            const dir = diffX > 0 ? 1 : -1;
            const endX = dir * window.innerWidth * 1.5; // 飛出螢幕
            card.style.transform = `translateX(${endX}px) rotate(${dir * 30}deg)`;

            // --- 關鍵修正：讓底層卡片「同時」完成動畫 ---
            const bottomCard = document.getElementById('bottomCard');
            if (bottomCard) {
                // 設定底層卡片也進入動畫狀態
                bottomCard.style.transition = 'transform 0.4s ease, filter 0.4s ease'; // 與 flyout 時間匹配
                bottomCard.style.transform = 'scale(1.0)';
                bottomCard.style.filter = 'brightness(1.0)';
            }

            // 提交資料變更
            const offset = dir > 0 ? 1 : -1; // 右=明天(+1), 左=昨天(-1)

            setTimeout(() => {
                currentDate.setDate(currentDate.getDate() + offset);
                renderStack();
            }, 300); // 等待動畫結束
        } else {
            // 回彈 (Spring/Recoil)
            card.style.transition = ''; // 清除 inline-style 以允許 CSS transition 生效

            // 強制重繪 (Force Reflow) 確保 transition 生效
            void card.offsetWidth;

            card.classList.add('animate-recoil');
            requestAnimationFrame(() => {
                card.style.transform = `translate(0px, 0px) rotate(0deg)`;
            });

            // 重置底層卡片
            const bottomCard = document.getElementById('bottomCard');
            if (bottomCard) {
                bottomCard.style.transition = 'transform 0.5s ease, filter 0.5s ease';
                bottomCard.style.transform = 'scale(0.85)';
                bottomCard.style.filter = 'brightness(0.6)';
            }
        }
    }

    // ---------------------------------------------------------
    // 工具函式 (UTILS)
    // ---------------------------------------------------------
    function getClientX(e) {
        return e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    }

    function getOffsetDate(base, offset) {
        const d = new Date(base);
        d.setDate(base.getDate() + offset);
        return d;
    }

    function getHoliday(m, d) {
        if (m === 1 && d === 1) return "元旦";
        if (m === 2 && d === 28) return "和平紀念日";
        if (m === 4 && d === 4) return "兒童節";
        if (m === 4 && d === 5) return "清明節";
        if (m === 5 && d === 1) return "勞動節";
        if (m === 10 && d === 10) return "國慶日";
        return "";
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
