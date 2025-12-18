document.addEventListener('DOMContentLoaded', () => {

    // ---------------------------------------------------------
    // 狀態 (STATE)
    // ---------------------------------------------------------
    let currentPoemIndex = 0;
    let revealTimeouts = []; // 儲存所有顯示文字的 timeout
    let hiddenChars = []; // 尚未顯示的字符
    let isShaking = false; // 是否正在搖晃
    let lastShakeTime = 0; // 上次搖晃時間

    // 拖曳狀態
    let isDragging = false;
    let startX = 0;
    let currentX = 0;
    let dragTarget = null;
    let dragDistance = 0; // 累積拖曳距離，用於偵測搖晃

    // DOM 元素
    const container = document.getElementById('cardContainer');
    const template = document.getElementById('cardTemplate');

    // 統一的漢堡選單由 menu.js 負責插入與事件處理

    // ---------------------------------------------------------
    // 初始化 (INIT)
    // ---------------------------------------------------------
    if (typeof POEMS !== 'undefined' && POEMS.length > 0) {
        initCards();
    } else {
        container.innerHTML = "<h1 style='color:white'>資料載入錯誤</h1>";
    }

    // ---------------------------------------------------------
    // 核心邏輯 (CORE LOGIC)
    // ---------------------------------------------------------
    function initCards() {
        // 隨機選擇一首詩作為起始
        currentPoemIndex = Math.floor(Math.random() * POEMS.length);
        renderStack();
        attachGlobalDragEvents();
    }

    function renderStack() {
        container.innerHTML = '';

        // 1. 底層卡片（下一張預覽）
        const nextPoemIndex = (currentPoemIndex + 1) % POEMS.length;
        const bottomCard = createCardElement(nextPoemIndex);
        bottomCard.id = 'bottomCard';
        bottomCard.style.zIndex = 1;
        bottomCard.style.transform = 'scale(0.9)';
        bottomCard.style.filter = 'brightness(0.7)';
        container.appendChild(bottomCard);

        // 2. 頂層卡片（當前顯示）
        const topCard = createCardElement(currentPoemIndex);
        topCard.id = 'topCard';
        topCard.style.zIndex = 10;
        container.appendChild(topCard);

        // 開始逐漸顯示文字
        startRevealAnimation(topCard);
    }

    function createCardElement(poemIndex) {
        const clone = template.content.cloneNode(true);
        const cardInner = clone.querySelector('.card');
        const poem = POEMS[poemIndex];

        // 決定性生成顏色（基於詩詞索引）
        const hue = (poemIndex * 137.5) % 360; // 黃金角度分布
        cardInner.style.setProperty('--card-hue', hue);

        // 填充詩詞元資訊
        const titleEl = cardInner.querySelector('.poem-title');
        const authorEl = cardInner.querySelector('.poem-author');
        titleEl.textContent = (poem.title && poem.title.trim()) 
            ? poem.title 
            : (Array.isArray(poem.content) && poem.content.length ? poem.content[0] : "無題");
        authorEl.textContent = `${poem.dynasty || ''} · ${poem.author || '佚名'}`;
        titleEl.setAttribute('data-poem-id', poem.id);
        authorEl.setAttribute('data-poem-id', poem.id);

        // 選擇最佳的兩句詩
        const bestLines = getBestLines(poem, 2);
        const poemContent = cardInner.querySelector('.poem-content');

        bestLines.forEach(line => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'poem-line';

            // 將每個字符包裝成 span，以便逐字顯示
            const chars = line.text.split('');
            chars.forEach(char => {
                const charSpan = document.createElement('span');
                charSpan.className = 'char';
                charSpan.textContent = char;
                lineDiv.appendChild(charSpan);
            });

            poemContent.appendChild(lineDiv);
        });

        return cardInner;
    }

    // ---------------------------------------------------------
    // 文字逐漸顯示動畫 (REVEAL ANIMATION)
    // ---------------------------------------------------------
    function startRevealAnimation(card) {
        // 清除之前的所有計時器
        revealTimeouts.forEach(timeout => clearTimeout(timeout));
        revealTimeouts = [];
        hiddenChars = [];
        isShaking = false;
        dragDistance = 0;

        const poemLines = card.querySelectorAll('.poem-line');

        // 為每一句詩設定顯示邏輯
        poemLines.forEach((line, lineIndex) => {
            const chars = Array.from(line.querySelectorAll('.char'));
            const totalChars = chars.length;

            // 一開始每句只顯示兩個字（隨機選擇）
            const initialCount = Math.min(2, totalChars);
            const shuffledIndices = shuffleArray([...Array(totalChars).keys()]);

            // 顯示前兩個隨機字符
            for (let i = 0; i < initialCount; i++) {
                chars[shuffledIndices[i]].classList.add('visible');
            }

            // 剩餘的字符需要逐漸顯示
            const remainingIndices = shuffledIndices.slice(initialCount);

            // 將剩餘字符加入全域隱藏列表
            remainingIndices.forEach(idx => {
                hiddenChars.push({
                    element: chars[idx],
                    lineIndex: lineIndex
                });
            });
        });

        // 打亂所有隱藏字符的順序
        hiddenChars = shuffleArray(hiddenChars);

        // 計算每個字符的顯示時間
        // 總時長約 15 秒，每個字顯示動畫 2-3 秒，所以要有重疊
        const totalDuration = 15000; // 15秒
        const charRevealDuration = 2500; // 每個字的淡入時間（2.5秒）
        const totalHiddenChars = hiddenChars.length;

        if (totalHiddenChars > 0) {
            // 計算字符之間的間隔時間（要讓動畫有重疊）
            const interval = (totalDuration - charRevealDuration) / totalHiddenChars;

            hiddenChars.forEach((charObj, index) => {
                const delay = index * interval;
                const timeout = setTimeout(() => {
                    if (!charObj.element.classList.contains('visible')) {
                        charObj.element.classList.add('visible');
                    }
                }, delay);
                revealTimeouts.push(timeout);
            });
        }
    }

    // 搖晃加速：三秒內顯示所有文字
    function accelerateReveal() {
        if (isShaking) return; // 已經在加速中

        isShaking = true;

        // 清除所有現有的計時器
        revealTimeouts.forEach(timeout => clearTimeout(timeout));
        revealTimeouts = [];

        // 在 3 秒內顯示所有隱藏的字符
        const acceleratedDuration = 3000;
        const charRevealDuration = 800; // 加速時每個字的淡入時間
        const totalHiddenChars = hiddenChars.filter(c => !c.element.classList.contains('visible')).length;

        if (totalHiddenChars > 0) {
            const interval = (acceleratedDuration - charRevealDuration) / totalHiddenChars;

            let index = 0;
            hiddenChars.forEach((charObj) => {
                if (!charObj.element.classList.contains('visible')) {
                    const delay = index * interval;
                    const timeout = setTimeout(() => {
                        charObj.element.classList.add('visible');
                    }, delay);
                    revealTimeouts.push(timeout);
                    index++;
                }
            });
        }
    }

    // 洗牌演算法（Fisher-Yates）
    function shuffleArray(array) {
        const newArray = [...array];
        for (let i = newArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
        }
        return newArray;
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

        topCard.classList.remove('animate-recoil', 'animate-flyout');
        topCard.style.transition = 'none';

        startX = getClientX(e);
        currentX = startX;
        dragDistance = 0; // 重置拖曳距離
    }

    function dragMove(e) {
        if (!isDragging || !dragTarget) return;

        if (e.type === 'touchmove') e.preventDefault();

        const prevX = currentX;
        currentX = getClientX(e);
        const diffX = currentX - startX;

        // 累積拖曳距離（用於偵測搖晃）
        const moveDelta = Math.abs(currentX - prevX);
        dragDistance += moveDelta;

        // 偵測搖晃：如果在短時間內累積了足夠的拖曳距離
        const now = Date.now();
        if (dragDistance > 100 && now - lastShakeTime > 500) {
            lastShakeTime = now;
            accelerateReveal();
        }

        // 移動頂層卡片
        const rotation = diffX * 0.05;
        dragTarget.style.transform = `translateX(${diffX}px) rotate(${rotation}deg)`;

        // 底層卡片動畫
        const bottomCard = document.getElementById('bottomCard');
        if (bottomCard) {
            const cardWidth = dragTarget.offsetWidth;
            const threshold = cardWidth * 0.5;
            const progress = Math.min(Math.abs(diffX) / threshold, 1);

            const scale = 0.9 + (0.1 * progress);
            const brightness = 0.7 + (0.3 * progress);

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
            // 成功滑動
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

            // 清除所有計時器
            revealTimeouts.forEach(timeout => clearTimeout(timeout));
            revealTimeouts = [];

            // 切換到下一張卡片
            setTimeout(() => {
                if (dir > 0) {
                    // 向右滑：下一首詩
                    currentPoemIndex = (currentPoemIndex + 1) % POEMS.length;
                } else {
                    // 向左滑：上一首詩
                    currentPoemIndex = (currentPoemIndex - 1 + POEMS.length) % POEMS.length;
                }
                renderStack();
            }, 300);
        } else {
            // 回彈
            card.style.transition = '';
            void card.offsetWidth;

            card.classList.add('animate-recoil');
            requestAnimationFrame(() => {
                card.style.transform = `translate(0px, 0px) rotate(0deg)`;
            });

            const bottomCard = document.getElementById('bottomCard');
            if (bottomCard) {
                bottomCard.style.transition = 'transform 0.5s ease, filter 0.5s ease';
                bottomCard.style.transform = 'scale(0.9)';
                bottomCard.style.filter = 'brightness(0.7)';
            }
        }
    }

    // ---------------------------------------------------------
    // 工具函式 (UTILS)
    // ---------------------------------------------------------
    function getClientX(e) {
        return e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
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
