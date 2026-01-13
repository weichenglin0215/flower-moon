
(function () {
    // 遊戲狀態
    const Game3 = {
        isActive: false,
        score: 0,
        speed: 0.1, // 初始速度 (rem/幀)
        baseSpeed: 0.06,
        incrementSpeed: 0.005,
        maxSpeed: 0.2,
        rows: [], // 存放行元素的陣列
        currentRowIndex: 0, // 當前需要點擊的行索引
        animationId: null,
        poemChars: [], // 詩詞的所有字
        container: null,
        gameArea: null,
        historyContainer: null,
        historyData: [], // 紀錄每個字的狀態 { char, status, isSep }
        mistakeCount: 0,
        updateLayoutMetrics: function () { }, // deprecated
        // 按鈕高度 CSS 定義為 3.5rem，垂直間距固定為 0.8rem
        btnHeightRem: 3.5,
        verticalGapRem: 0.8,
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
            '小學': { incrementSpeed: 0.001, maxSpeed: 0.07, minRating: 7, sentenceMinRating: 5, minOptions: 1, maxOptions: 2, maxMistakeCount: 14, isStrictOrder: false },
            '中學': { incrementSpeed: 0.002, maxSpeed: 0.08, minRating: 6, sentenceMinRating: 3, minOptions: 1, maxOptions: 3, maxMistakeCount: 14, isStrictOrder: false },
            '高中': { incrementSpeed: 0.004, maxSpeed: 0.10, minRating: 4, sentenceMinRating: 2, minOptions: 2, maxOptions: 3, maxMistakeCount: 12, isStrictOrder: false },
            '大學': { incrementSpeed: 0.006, maxSpeed: 0.12, minRating: 3, sentenceMinRating: 1, minOptions: 3, maxOptions: 4, maxMistakeCount: 10, isStrictOrder: true },
            '研究所': { incrementSpeed: 0.008, maxSpeed: 0.15, minRating: 1, sentenceMinRating: 1, minOptions: 3, maxOptions: 5, maxMistakeCount: 10, isStrictOrder: true }
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
            this.historyContainer = document.getElementById('game3-history');

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
            //檢查responsive.css是否有包括game3 - overlay.aspect - 5 - 8
            div.className = 'game3-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <!-- 调试边框 -->
                <div class="debug-frame"></div>
                
                <div class="game3-header">
                    <div class="score-board">分數: <span id="game3-score">0</span></div>
                    <div class="game3-controls">
                        <button id="game3-restart-btn" class="nav-btn">重來</button>
                        <button id="game3-close-btn" class="nav-btn close-btn">退出</button>
                    </div>
                </div>
                <div class="game3-sub-header">
                    <div id="game3-hearts" class="hearts"></div>
                </div>
                <div id="game3-area" class="game3-area">
                    <!-- 遊戲內容將在此生成 -->
                </div>
                <div id="game3-history" class="game3-history"></div>
                <div id="game3-message" class="game3-message">
                    <div id="game3-result-poem" class="game3-result-poem-display"></div>
                    <div class="game3-result-info">
                        <h2 id="game3-msg-title">遊戲結束</h2>
                        <p id="game3-msg-content"></p>
                    </div>
                    <button id="game3-msg-btn" class="nav-btn">勸君更進一杯酒</button>
                </div>
            `;
            document.body.appendChild(div);

            document.getElementById('game3-msg-btn').addEventListener('click', () => {
                document.getElementById('game3-message').classList.remove('visible');
                this.restartGame(); // 直接以相同難度開啟下一局
            });

            // 增加 result-poem-display 的滑鼠拖曳捲動功能
            const poemDisplay = document.getElementById('game3-result-poem');
            let isDown = false;
            let startY;
            let scrollTop;

            poemDisplay.addEventListener('mousedown', (e) => {
                isDown = true;
                poemDisplay.style.cursor = 'grabbing';
                startY = e.pageY - poemDisplay.offsetTop;
                scrollTop = poemDisplay.scrollTop;
            });

            poemDisplay.addEventListener('mouseleave', () => {
                isDown = false;
                poemDisplay.style.cursor = 'grab';
            });

            poemDisplay.addEventListener('mouseup', () => {
                isDown = false;
                poemDisplay.style.cursor = 'grab';
            });

            poemDisplay.addEventListener('mousemove', (e) => {
                if (!isDown) return;
                e.preventDefault();
                const y = e.pageY - poemDisplay.offsetTop;
                const walk = (y - startY) * 1.5; // 捲動速度倍率
                poemDisplay.scrollTop = scrollTop - walk;
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
            document.getElementById('game3-message').classList.remove('visible');

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
            if (this.container) {
                this.container.classList.add('hidden');
            }
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
            this.historyData = [];
            this.mistakeCount = 0;
            document.getElementById('game3-score').textContent = this.score;
            document.getElementById('game3-message').classList.remove('visible');
            // Restore history visibility
            if (this.historyContainer) this.historyContainer.style.display = '';
            this.renderHearts();

            // 清空遊戲區域
            this.gameArea.innerHTML = '';

            // 選擇詩詞並生成
            // this.updateLayoutMetrics(); // no longer needed
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
            this.currentPoem = poem;

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
                lineChars.forEach((c, charIdx) => {
                    charRatings.push(lineRating);
                    this.historyData.push({
                        char: c,
                        status: 'hidden', // hidden, waiting, correct, wrong
                        isSep: false
                    });
                    // 如果是該行最後一個字且不是最後一行，加入逗號
                    if (charIdx === lineChars.length - 1 && lineIdx < poem.content.length - 1) {
                        this.historyData.push({
                            char: '，',
                            status: 'hidden',
                            isSep: true
                        });
                    }
                });
            });
            this.poemChars = chars;
            this.historyContainer = document.getElementById('game3-history');
            this.renderHistory();

            // 生成每一行
            let currentY = 35; // 從game-area下方開始 (rem)

            chars.forEach((char, index) => {
                // 檢查是否為新句子的開始
                const isNewSentence = firstIndices.has(index);

                // 如果是新句子的開始（且不是第一句），額外增加垂直間距
                if (isNewSentence && index > 0) {
                    currentY += this.btnHeightRem / 2; // 留出半個按鍵高度的空間
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

                // 行距：按鈕高度 + 垂直間距 (動態計算)
                currentY += this.btnHeightRem * 1.25 + this.verticalGapRem;
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
            rowEl.style.transform = `translateY(${startY}rem)`;

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
                // 移除內聯 font-size，改由 CSS 控制
                // 移除內聯 background，改由 CSS 控制

                // 根據難度設定決定初始透明度 (Rule 1)
                const setting = this.difficultySettings[this.difficulty] || {};
                const initialColor = setting.isStrictOrder ? this.nextRowFontColor : this.currentRowFontColor;
                btn.style.color = initialColor;

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

                // 更新歷程狀態
                this.updateHistoryStatus(rowIndex, 'correct');

                // 標記該行已完成
                clickedRow.clicked = true;
                // 改變按鈕樣式 (CSS .correct)
                // e.target.style.color = this.nextRowFontColor; // REMOVED: 由 CSS 控制正確答案樣式

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
                this.mistakeCount += 1;
                this.updateHearts();

                if (this.mistakeCount >= setting.maxMistakeCount) {
                    this.gameOver(false, `按錯次數達 ${this.mistakeCount} 次，正確應為「${clickedRow.correctChar}」`);
                    return;
                }

                // 檢查是否只剩最後一個按鈕（即正確答案）
                const remainingBtns = Array.from(rowEl.querySelectorAll('button')).filter(btn => !btn.disabled);
                if (remainingBtns.length === 1) {
                    // 只剩正解：直接標記為錯過
                    clickedRow.clicked = true;
                    rowEl.classList.add('completed');
                    const correctBtn = remainingBtns[0];
                    correctBtn.disabled = true;
                    correctBtn.classList.add('missed'); // 使用 CSS class

                    // 更新歷程為錯誤 (紅色原字)
                    this.updateHistoryStatus(rowIndex, 'wrong');

                    // 如果點中的是當前目標行，更新 currentRowIndex
                    if (rowIndex === this.currentRowIndex) {
                        this.updateCurrentRowHighlight();
                    }
                } else {
                    // 還剩下其他干擾項：歷程顯示紅色 □
                    this.updateHistoryStatus(rowIndex, 'wrong_attempt');
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
                row.element.style.transform = `translateY(${row.y}rem)`;

                // 檢查是否超出螢幕上方且尚未點擊 (超時結束)
                if (!row.clicked && row.index === this.currentRowIndex && row.y < -this.btnHeightRem / 4) {
                    row.clicked = true; // 即使沒點也標記為處理過，避免重複計算
                    row.element.classList.add('completed');
                    Array.from(row.element.querySelectorAll('button')).forEach(btn => {
                        btn.disabled = true;
                        if (btn.textContent === row.correctChar) {
                            // 錯過的正確答案：顯示為藍色 (missed class)
                            btn.classList.add('missed');
                        } else {
                            // 錯誤答案：顯示為紅色
                            btn.classList.add('wrong');
                        }
                    });

                    this.mistakeCount += 1;
                    this.updateHearts();

                    if (this.mistakeCount >= currentSetting.maxMistakeCount) {
                        this.gameOver(false, `錯過的次數達 ${this.mistakeCount} 次，正確應為「${row.correctChar}」`);
                    } else {
                        // 移動到下一個有效的行
                        this.updateCurrentRowHighlight();
                    }
                    // 更新歷程為錯誤 (錯過)
                    this.updateHistoryStatus(row.index, 'wrong');
                }

                // 更新尚未處理字的 visibility 狀態 (只要進入畫面上方 約35rem 內)
                if (row.y < 35 && !row.clicked) {
                    this.updateHistoryStatus(row.index, 'waiting');
                }
            });

            this.renderHistory();
            this.animationId = requestAnimationFrame(() => this.loop());
        },

        // 更新歷史紀錄中的字符狀態
        updateHistoryStatus: function (charIndex, status) {
            // 因為 historyData 可能包含逗號，需要找對應的非分隔符索引
            let realIdx = 0;
            for (let i = 0; i < this.historyData.length; i++) {
                if (!this.historyData[i].isSep) {
                    if (realIdx === charIndex) {
                        // 狀態優先級：correct/wrong > wrong_attempt > waiting > hidden
                        const currentStatus = this.historyData[i].status;
                        if (currentStatus === 'correct' || currentStatus === 'wrong') return;

                        // 如果已經是錯誤嘗試，只有變成正解或最終錯誤才能覆蓋，不能變回 waiting
                        if (currentStatus === 'wrong_attempt' && status === 'waiting') return;

                        this.historyData[i].status = status;
                        return;
                    }
                    realIdx++;
                }
            }
        },

        renderHistory: function () {
            if (!this.historyContainer) return;

            let html = '';
            this.historyData.forEach((item, index) => {
                // 決定是否顯示：非 hidden，或者是 separator 且前一個字符已出現 (waiting 或以上)
                let shouldShow = item.status !== 'hidden';
                if (item.isSep && index > 0) {
                    const prev = this.historyData[index - 1];
                    if (prev.status !== 'hidden') {
                        shouldShow = true;
                    }
                }

                if (!shouldShow) return;

                if (item.isSep) {
                    html += `<span class="history-separator">${item.char}</span>`;
                } else {
                    let className = 'history-char';
                    let displayChar = item.char;

                    if (item.status === 'waiting') {
                        className += ' waiting';
                        displayChar = '□';
                    } else if (item.status === 'wrong_attempt') {
                        className += ' wrong-attempt';
                        displayChar = '□'; // 選錯但還有機會，顯示紅色 □
                    } else if (item.status === 'correct') {
                        className += ' correct';
                    } else if (item.status === 'wrong') {
                        className += ' wrong';
                    }
                    html += `<span class="${className}">${displayChar}</span>`;
                }
            });

            if (this.historyContainer.innerHTML !== html) {
                this.historyContainer.innerHTML = html;
            }
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

            // 1. 將所有畫面尚未完成的行，標示出藍色正確答案
            this.rows.forEach(row => {
                if (!row.clicked) {
                    // 標記為錯過
                    this.updateHistoryStatus(row.index, 'waiting'); // 保持原本狀態或視為未答
                    // 在畫面上顯示藍色
                    Array.from(row.element.querySelectorAll('button')).forEach(btn => {
                        btn.disabled = true;
                        if (btn.textContent === row.correctChar) {
                            btn.classList.add('missed');
                        }
                    });
                }
            });

            // 確保最後一刻的歷程狀態有被渲染
            this.renderHistory();

            const msgDiv = document.getElementById('game3-message');
            const title = document.getElementById('game3-msg-title');
            const content = document.getElementById('game3-msg-content');
            const btn = document.getElementById('game3-msg-btn');
            const poemDisplay = document.getElementById('game3-result-poem');

            // 隱藏左側歷程區
            if (this.historyContainer) this.historyContainer.style.display = 'none';

            // 建構結算詩詞顯示
            let poemHtml = `<div class="game3-result-poem-info" data-poem-id="${this.currentPoem.id}">
                ${this.currentPoem.title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}
            </div>`;
            let currentLineHtml = poemHtml + '<div class="game3-result-poem-line">';

            // 需要重新遍歷 historyData 來構建完整詩詞
            // 這裡我們直接使用 this.poemChars 和 historyData 對應
            // 由於 historyData 包含逗號，我們需要小心處理

            this.historyData.forEach((item, index) => {
                if (item.isSep) {
                    // 標點符號不顯示文字，僅作為換行依據
                    currentLineHtml += '</div><div class="game3-result-poem-line">';
                } else {
                    let className = 'game3-result-char';
                    // 判斷顏色狀態
                    // 如果遊戲過關(win=true)，且狀態是 correct -> 綠色
                    // 如果狀態是 wrong -> 紅色
                    // 如果狀態是 hidden/waiting 且遊戲結束 -> miss (藍色)

                    if (item.status === 'correct') {
                        className += ' correct';
                    } else if (item.status === 'wrong' || item.status === 'wrong_attempt') {
                        className += ' wrong';
                    } else {
                        // 未完成的字，視為錯過
                        className += ' missed';
                    }
                    currentLineHtml += `<span class="${className}">${item.char}</span>`;
                }
            });
            currentLineHtml += '</div>';
            poemDisplay.innerHTML = currentLineHtml;


            // 設定訊息與按鈕文字
            content.textContent = "";
            if (win) {
                // 檢查是否完全答對 (無錯誤)
                // 若 mistakeCount == 0 ? 或者全部都 correct
                // 簡單判斷：this.mistakeCount 是否為 0
                if (this.mistakeCount === 0) {
                    title.textContent = `謫仙下凡！得分：${this.score}分`;
                    title.style.color = "#FFD700"; // 金色
                } else {
                    title.textContent = `過關！得分：${this.score}分`;
                    title.style.color = "#4CAF50";
                }

                // 成功按鈕金句
                const successQuotes = [
                    "勸君更進一杯酒",
                    "欲窮千里目",
                    "更上一層樓",
                    "欲窮千里目，更上一層樓",
                    "大鵬一日同風起",
                    "扶搖直上九萬里",
                    "大鵬一日同風起，扶搖直上九萬里",
                    "莫愁前路無知己",
                    "天下誰人不識君",
                    "莫愁前路無知己，天下誰人不識君"
                ];
                btn.textContent = successQuotes[Math.floor(Math.random() * successQuotes.length)];

            } else {
                title.textContent = `遊戲失敗 錯過次數達 ${this.mistakeCount} 次`;
                title.style.color = "hsl(10, 80%, 60%)";

                // 失敗按鈕金句
                const failQuotes = [
                    "卷土重來未可知",
                    "莫道桑榆晚，為霞尚滿天",
                    "不經一番寒徹骨",
                    "怎得梅花撲鼻香",
                    "不經一番寒徹骨，怎得梅花撲鼻香",
                    "長風破浪會有時",
                    "直掛雲帆濟滄海",
                    "長風破浪會有時，直掛雲帆濟滄海",
                    "天生我材必有用"
                ];
                btn.textContent = failQuotes[Math.floor(Math.random() * failQuotes.length)];
            }

            // 動態調整按鍵字體大小
            const btnTextLen = btn.textContent.length;
            // 基礎大小 1.6rem，若超過 10 字則依比例縮小
            const newSize = btnTextLen > 10 ? (1.6 * 10 / btnTextLen) : 1.6;
            btn.style.fontSize = newSize + 'rem';


            // 稍微延遲顯示視窗 (1秒)
            setTimeout(() => {
                msgDiv.classList.add('visible');
            }, 1000);
        }
    };

    // 暴露給全域
    window.Game3 = Game3;

    // 自動檢查是否需要啟動 (從 URL 參數)
    if (window.location.search.includes('game=3')) {
        setTimeout(() => {
            if (window.Game3) window.Game3.show();
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }, 50);
    }

})();
