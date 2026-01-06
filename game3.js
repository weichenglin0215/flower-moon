
(function () {
    // 遊戲狀態
    const Game3 = {
        isActive: false,
        score: 0,
        speed: 1.0, // 初始速度 (像素/幀)
        baseSpeed: 1.0,
        incrementSpeed: 0.05,
        maxSpeed: 1.5,
        rows: [], // 存放行元素的陣列
        currentRowIndex: 0, // 當前需要點擊的行索引
        animationId: null,
        poemChars: [], // 詩詞的所有字
        container: null,
        gameArea: null,
        mistakeCount: 0,
        btnHeight: 72,
        btnColor: 'rgba(240, 230, 210, 0.9)',
        btnColorRight: 'rgba(120, 230, 150, 0.9)',
        btnColorWrong: 'rgba(230, 120, 150, 0.9)',
        //btnFontSize: 66,
        currentRowFontColor: 'rgba(24, 23, 0, 1)',
        nextRowFontColor: 'rgba(24, 23, 0, 0.5)',
        // 常用字庫 (用於生成干擾項)
        decoyCharsPeople: "你妳我他她它父母爺娘公婆兄弟姊妹人子吾余夫妻婦妾君卿爾奴汝彼此伊客君主翁",
        decoyCharsSeason: "春夏秋冬晨晝暮夜夕宵日月星辰漢輝曦雲霓虹雷電霽霄昊蒼溟",
        decoyCharsWeather: "陰晴風雨雪霜露霧霞虹暖寒涼暑晦暗亮光明清冽空氣嵐",
        decoyCharsEnvironment: "山嶺峰嶽丘陵原野石岩磐礫沙塵泥壤漠海江河川溪瀑澗流湖泊沼澤水淵深潭泉",
        decoyCharsColor: "紅絳朱丹彤緋橙黃綠碧翠蔥藍縹蒼靛紫白皓素皚黑玄緇黛烏墨金銀銅鐵灰",
        decoyCharsPlant: "花草梅蘭竹菊荷蓮桂桃李杏梨棠芍薔榴葵蘆荻芷蕙蘅薇薔薇柳松",
        decoyChars: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長",

        // 難度設定
        difficulty: '小學',
        difficultySettings: {
            '小學': { incrementSpeed: 0.01, maxSpeed: 1.0, minRating: 7, sentenceMinRating: 6, minOptions: 1, maxOptions: 2, maxMistakeCount: 14, isStrictOrder: false },
            '中學': { incrementSpeed: 0.02, maxSpeed: 1.2, minRating: 6, sentenceMinRating: 5, minOptions: 1, maxOptions: 3, maxMistakeCount: 12, isStrictOrder: false },
            '高中': { incrementSpeed: 0.04, maxSpeed: 1.5, minRating: 4, sentenceMinRating: 3, minOptions: 2, maxOptions: 3, maxMistakeCount: 10, isStrictOrder: false },
            '大學': { incrementSpeed: 0.06, maxSpeed: 1.8, minRating: 3, sentenceMinRating: 2, minOptions: 3, maxOptions: 4, maxMistakeCount: 8, isStrictOrder: true },
            '研究所': { incrementSpeed: 0.08, maxSpeed: 2.0, minRating: 1, sentenceMinRating: 1, minOptions: 3, maxOptions: 5, maxMistakeCount: 6, isStrictOrder: true }
        },

        loadCSS: function () {
            if (!document.getElementById('game3-css')) {
                const link = document.createElement('link');
                link.id = 'game3-css';
                link.rel = 'stylesheet';
                link.href = 'game3.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            // 創建遊戲 DOM 結構 (如果不存在)
            if (!document.getElementById('game3-container')) {
                this.createDOM();
            }
            this.container = document.getElementById('game3-container');
            this.gameArea = document.getElementById('game3-area');

            // 綁定關閉按鈕
            document.getElementById('game3-close-btn').addEventListener('click', () => {
                this.stopGame();
            });

            // 綁定重新開始按鈕
            document.getElementById('game3-restart-btn').addEventListener('click', () => {
                this.restartGame();
            });
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game3-container';
            div.className = 'game-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <div class="debug-frame"></div>
                
                <div class="game-header">
                    <div class="score-board">分數: <span id="game3-score">0</span></div>
                    <div class="game-controls">
                        <button id="game3-restart-btn" class="nav-btn">重來</button>
                        <button id="game3-close-btn" class="nav-btn close-btn">退出</button>
                    </div>
                </div>
                <div class="game-sub-header">
                    <div id="game3-hearts" class="hearts"></div>
                </div>
                <div id="game3-area" class="game-area">
                    <!-- 遊戲內容將在此生成 -->
                </div>
                <div id="game3-message" class="game-message hidden">
                    <h2 id="game3-msg-title">遊戲結束</h2>
                    <p id="game3-msg-content"></p>
                    <button id="game3-msg-btn" class="nav-btn">再來一局</button>
                </div>
            `;
            document.body.appendChild(div);

            document.getElementById('game3-msg-btn').addEventListener('click', () => {
                document.getElementById('game3-message').classList.add('hidden');
                this.restartGame(); // 直接以相同難度開啟下一局
            });

            this.renderHearts();
        },

        show: function () {
            this.init(); // 確保 DOM 存在

            // 显示难度选择器
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            this.isActive = false;
            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.gameArea.innerHTML = '';
            document.getElementById('game3-message').classList.add('hidden');

            // 隐藏主页和其他游戏
            this.hideOtherContents();

            // 使用全局难度选择器
            if (window.DifficultySelector) {
                window.DifficultySelector.show('游戏三：字爬梯', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    this.container.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                    document.body.classList.add('overlay-active');
                    if (window.updateResponsiveLayout) {
                        window.updateResponsiveLayout();
                    }
                    this.restartGame();
                });
            } else {
                console.warn('[Game3] DifficultySelector not found');
            }
        },

        hideOtherContents: function () {
            // 隐藏主页容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = 'none';
            }

            // 隐藏其他游戏
            const game1 = document.getElementById('game1-container');
            const game2 = document.getElementById('game2-container');
            if (game1) game1.classList.add('hidden');
            if (game2) game2.classList.add('hidden');
        },

        showOtherContents: function () {
            // 恢复主页容器
            const cardContainer = document.getElementById('cardContainer');
            if (cardContainer) {
                cardContainer.style.display = '';
            }
        },

        stopGame: function () {
            this.isActive = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
            this.container.classList.add('hidden');
            document.body.style.overflow = '';
            document.body.classList.remove('overlay-active');
            // 恢复其他内容
            this.showOtherContents();
        },

        restartGame: function () {
            this.isActive = true;
            this.score = 0;
            this.speed = this.baseSpeed + this.difficultySettings[this.difficulty].incrementSpeed;
            this.maxSpeed = this.difficultySettings[this.difficulty].maxSpeed;
            this.currentRowIndex = 0;
            this.rows = [];
            this.mistakeCount = 0;
            document.getElementById('game3-score').textContent = this.score;
            document.getElementById('game3-message').classList.add('hidden');
            this.renderHearts();

            // 清空遊戲區域
            this.gameArea.innerHTML = '';

            // 選擇詩詞並生成
            this.selectAndPreparePoem();

            // 開始動畫迴圈
            if (this.animationId) cancelAnimationFrame(this.animationId);
            this.loop();
        },

        selectAndPreparePoem: function () {
            if (typeof POEMS === 'undefined' || POEMS.length === 0) {
                alert('找不到詩詞資料');
                return;
            }

            const setting = this.difficultySettings[this.difficulty];
            const minRating = setting.minRating;
            const maxOptions = setting.maxOptions;
            const minOptions = setting.minOptions;

            // 篩選符合評分的詩詞
            const eligiblePoems = POEMS.filter(p => (p.rating || 0) >= minRating);
            if (eligiblePoems.length === 0) {
                alert('找不到符合該難度評分的詩詞');
                return;
            }

            let poem = eligiblePoems[Math.floor(Math.random() * eligiblePoems.length)];

            // 尋找三首相同類型的詩詞作為干擾項來源
            const similarPoems = POEMS.filter(p => p.type === poem.type && p.id !== poem.id);
            let extraDecoyChars = "";
            if (similarPoems.length > 0) {
                // 隨機取三首
                const shuffledSimilar = similarPoems.sort(() => Math.random() - 0.5).slice(0, 3);
                shuffledSimilar.forEach(p => {
                    p.content.forEach(line => {
                        extraDecoyChars += line.replace(/[，。？！、：；「」『』]/g, '');
                    });
                });
            }

            // 合併原本的常用字庫與額外的詩詞字庫
            const currentDecoyPool = (this.decoyChars + extraDecoyChars).split('');

            // 將詩詞內容展平為字符陣列，過濾標點符號 (簡單過濾)
            let chars = [];
            let charRatings = []; // 紀錄每個字的句子評價
            const firstIndices = new Set();

            poem.content.forEach((line, lineIdx) => {
                const cleanLine = line.replace(/[，。？！、：；「」『』]/g, '');
                if (!cleanLine) return;

                const startIndex = chars.length;
                firstIndices.add(startIndex);

                // 取得該句評價
                const lineRating = (poem.line_ratings && poem.line_ratings[lineIdx] !== undefined)
                    ? poem.line_ratings[lineIdx]
                    : 0;

                const lineChars = cleanLine.split('');
                chars.push(...lineChars);
                // 每個字都記錄其所屬句子的評價
                lineChars.forEach(() => charRatings.push(lineRating));
            });
            this.poemChars = chars;

            // 生成每一行
            let currentY = 500; // 從game-area下方開始

            chars.forEach((char, index) => {
                // 檢查是否為新句子的開始
                const isNewSentence = firstIndices.has(index);

                // 如果是新句子的開始（且不是第一句），額外增加垂直間距
                if (isNewSentence && index > 0) {
                    currentY += this.btnHeight / 2; // 留出半個按鍵高度的空間
                }

                // 難度控制：根據設定決定按鈕數量
                let numOptions = 1;
                const sentenceRating = charRatings[index];

                // 每一句的第一個字難度固定 1 個按鍵
                // 或者該句的評分低於難度設定的 sentenceMinRating
                if (isNewSentence || sentenceRating < setting.sentenceMinRating) {
                    numOptions = 1;
                } else {
                    // 根據難度設定隨機決定選項數量 (minOptions 到 maxOptions)
                    numOptions = Math.floor(Math.random() * (maxOptions - minOptions + 1)) + minOptions;
                    if (numOptions < 1) numOptions = 1;
                }

                const row = this.createRow(char, index, numOptions, currentY, currentDecoyPool);
                this.rows.push(row);
                this.gameArea.appendChild(row.element);

                // 行距：按鈕高度 + 16px (原本的基礎間距)
                currentY += this.btnHeight + 16;
            });

            // 初始化：高亮第一行
            if (this.rows.length > 0) {
                Array.from(this.rows[0].element.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }
        },

        createRow: function (correctChar, index, numOptions, startY, decoyPool) {
            const rowEl = document.createElement('div');
            rowEl.className = 'ladder-row';
            rowEl.style.top = startY + 'px';

            // 準備候選選項
            let options = [correctChar];

            // 1. 嘗試從分類主題中選取 (40% 機率)
            if (numOptions > 1 && Math.random() < 0.4) {
                const thematicSets = [
                    this.decoyCharsPeople,
                    this.decoyCharsSeason,
                    this.decoyCharsWeather,
                    this.decoyCharsEnvironment,
                    this.decoyCharsColor,
                    this.decoyCharsPlant
                ];

                const matchedSet = thematicSets.find(set => set && set.includes(correctChar));
                if (matchedSet) {
                    const themeCandidates = matchedSet.split('').filter(c => c !== correctChar);
                    // 隨機取出主題字
                    themeCandidates.sort(() => Math.random() - 0.5);
                    for (const char of themeCandidates) {
                        if (options.length >= numOptions) break;
                        if (!options.includes(char)) options.push(char);
                    }
                }
            }

            // 2. 如果選項不足，使用原本的 decoyPool 或預設字庫補齊
            const pool = decoyPool || (this.decoyChars ? this.decoyChars.split('') : []);
            let safetyCounter = 0;
            while (options.length < numOptions && safetyCounter < 100) {
                safetyCounter++;
                const decoy = pool[Math.floor(Math.random() * pool.length)];
                if (decoy && !options.includes(decoy)) {
                    options.push(decoy);
                }
            }

            // 洗牌
            options.sort(() => Math.random() - 0.5);

            // 創建按鈕
            options.forEach(char => {
                const btn = document.createElement('button');
                btn.className = 'ladder-btn';
                btn.textContent = char;
                btn.style.fontSize = this.btnFontSize * 0.8 + 'px';
                btn.style.background = this.btnColor;
                btn.style.color = this.nextRowFontColor;
                btn.addEventListener('click', (e) => this.handleBtnClick(e, char, index, rowEl));
                rowEl.appendChild(btn);
            });

            return {
                element: rowEl,
                y: startY,
                index: index,
                clicked: false,
                correctChar: correctChar
            };
        },

        handleBtnClick: function (e, char, rowIndex, rowEl) {
            if (!this.isActive) return;

            const setting = this.difficultySettings[this.difficulty];
            const clickedRow = this.rows[rowIndex];

            // 如果已經點擊過，或是處於嚴格模式且不是當前行，則不處理
            if (clickedRow.clicked) return;
            if (setting.isStrictOrder && rowIndex !== this.currentRowIndex) {
                return;
            }

            if (char === clickedRow.correctChar) {
                // 答對
                e.target.classList.add('correct');
                this.score += 10;
                document.getElementById('game3-score').textContent = this.score;

                // 標記該行已完成
                clickedRow.clicked = true;
                // 改變按鈕樣式
                e.target.style.background = this.btnColorRight;
                e.target.style.color = this.nextRowFontColor;

                rowEl.classList.add('completed');
                Array.from(rowEl.querySelectorAll('button')).forEach(b => b.disabled = true);

                // 增加速度
                if (this.speed < this.maxSpeed) this.speed += this.incrementSpeed;

                // 如果點中的是當前目標行，更新 currentRowIndex
                if (rowIndex === this.currentRowIndex) {
                    this.updateCurrentRowHighlight();
                }
            } else {
                // 答錯
                e.target.classList.add('wrong');
                e.target.disabled = true;
                e.target.style.background = this.btnColorWrong;
                this.mistakeCount += 1;
                this.updateHearts();
                if (this.mistakeCount >= setting.maxMistakeCount) {
                    this.gameOver(false, `按錯次數達 ${this.mistakeCount} 次，正確應為「${clickedRow.correctChar}」`);
                    return;
                }
            }
        },

        /**
         * 更新當前目標行的高亮狀態
         * 自動跳過已點擊或失敗的行
         */
        updateCurrentRowHighlight: function () {
            // 跳過所有已經完成或處理過的行
            while (this.currentRowIndex < this.rows.length && this.rows[this.currentRowIndex].clicked) {
                this.currentRowIndex++;
            }

            // 檢查勝利
            if (this.currentRowIndex >= this.rows.length) {
                this.gameOver(true);
            } else {
                // 將新的當前行的所有按鈕字體顏色改為深色 (高亮)
                const nextRowEl = this.rows[this.currentRowIndex].element;
                Array.from(nextRowEl.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }
        },

        loop: function () {
            if (!this.isActive) return;

            // 自動跳過已點擊的行
            while (this.currentRowIndex < this.rows.length && this.rows[this.currentRowIndex].clicked) {
                this.currentRowIndex++;
                // 也要檢查新定位的行是否結束了
                if (this.currentRowIndex >= this.rows.length) {
                    this.gameOver(true);
                    return;
                }
                // 高亮新行
                const nextRow = this.rows[this.currentRowIndex];
                Array.from(nextRow.element.querySelectorAll('button')).forEach(btn => {
                    btn.style.color = this.currentRowFontColor;
                });
            }

            const currentSetting = this.difficultySettings[this.difficulty];

            this.rows.forEach(row => {
                row.y -= this.speed;
                row.element.style.top = row.y + 'px';

                // 檢查是否超出螢幕上方且尚未點擊 (超時結束)
                if (!row.clicked && row.index === this.currentRowIndex && row.y < -this.btnHeight / 2) {
                    row.clicked = true; // 即使沒點也標記為處理過，避免重複計算
                    row.element.classList.add('completed');
                    Array.from(row.element.querySelectorAll('button')).forEach(b => b.disabled = true);

                    this.mistakeCount += 1;
                    this.updateHearts();

                    if (this.mistakeCount >= currentSetting.maxMistakeCount) {
                        this.gameOver(false, `錯過的次數達 ${this.mistakeCount} 次，正確應為「${row.correctChar}」`);
                    } else {
                        // 移動到下一個有效的行
                        this.updateCurrentRowHighlight();
                    }
                }
            });

            this.animationId = requestAnimationFrame(() => this.loop());
        },

        renderHearts: function () {
            const hearts = document.getElementById('game3-hearts');
            if (!hearts) return;
            hearts.innerHTML = '';
            for (let i = 0; i < this.difficultySettings[this.difficulty].maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = '♥';
                hearts.appendChild(span);
            }
        },

        updateHearts: function () {
            const hearts = document.querySelectorAll('#game3-hearts .heart');
            hearts.forEach((h, i) => {
                if (i < this.mistakeCount) {
                    h.classList.add('empty');
                    h.textContent = '♡';
                } else {
                    h.classList.remove('empty');
                    h.textContent = '♥';
                }
            });
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            cancelAnimationFrame(this.animationId);

            const msgDiv = document.getElementById('game3-message');
            const title = document.getElementById('game3-msg-title');
            const content = document.getElementById('game3-msg-content');

            msgDiv.classList.remove('hidden');
            if (win) {
                title.textContent = "恭喜過關！";
                title.style.color = "#4CAF50";
                content.textContent = `完成了一首詩！得分：${this.score}`;
            } else {
                title.textContent = "遊戲結束";
                title.style.color = "#f44336";
                content.textContent = reason || "";
            }
        }
    };

    // 暴露給全域
    window.Game3 = Game3;

    // 自動檢查是否需要啟動 (從 URL 參數)
    if (window.location.search.includes('game=3')) {
        // 稍微延遲以確保 DOM 和 POEMS 已完全載入
        setTimeout(() => {
            window.Game3.show();
            // 清除 URL 參數，避免重新整理時又跳出
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 300);
    }

})();
