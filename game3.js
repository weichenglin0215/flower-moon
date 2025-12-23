
(function () {
    // 遊戲狀態
    const Game3 = {
        isActive: false,
        score: 0,
        speed: 1.0, // 初始速度 (像素/幀)
        baseSpeed: 1.0,
        rows: [], // 存放行元素的陣列
        currentRowIndex: 0, // 當前需要點擊的行索引
        animationId: null,
        poemChars: [], // 詩詞的所有字
        container: null,
        gameArea: null,
        mistakeCount: 0,
        btnHeight: 90,
        btnColor: 'rgba(240, 230, 210, 0.9)',
        btnColorRight: 'rgba(120, 230, 150, 0.9)',
        btnColorWrong: 'rgba(230, 120, 150, 0.9)',
        //btnFontSize: 66,
        currentRowFontColor: 'rgba(24, 23, 0, 1)',
        nextRowFontColor: 'rgba(24, 23, 0, 0.5)',
        // 常用字庫 (用於生成干擾項)
        decoyChars: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長",

        // 難度設定
        difficulty: '幼稚園',
        difficultySettings: {
            '幼稚園': { minRating: 3, minOptions: 1, maxOptions: 2, maxMistakeCount: 12 },
            '小學': { minRating: 3, minOptions: 1, maxOptions: 3, maxMistakeCount: 10 },
            '中學': { minRating: 2, minOptions: 2, maxOptions: 3, maxMistakeCount: 8 },
            '大學': { minRating: 1, minOptions: 3, maxOptions: 4, maxMistakeCount: 6 },
            '研究所': { minRating: 0, minOptions: 3, maxOptions: 5, maxMistakeCount: 4 }
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
                this.showDifficultySelector();
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
            this.speed = this.baseSpeed;
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
            const firstIndices = new Set();
            poem.content.forEach(line => {
                const cleanLine = line.replace(/[，。？！、：；「」『』]/g, '');
                if (!cleanLine) return;
                const startIndex = chars.length;
                firstIndices.add(startIndex);
                chars.push(...cleanLine.split(''));
            });
            this.poemChars = chars;

            // 生成每一行
            //let currentY = window.innerHeight; // 從螢幕下方開始
            let currentY = 700; // 從game-area下方開始

            chars.forEach((char, index) => {
                // 難度控制：根據設定決定按鈕數量
                let numOptions = 1;
                // 每一句的第一個字難度固定 1 個按鍵
                if (firstIndices.has(index)) {
                    numOptions = 1;
                } else {
                    // 根據難度設定隨機決定選項數量 (minOptions 到 maxOptions)
                    // 幼稚園 (max 2) -> 1~2
                    // 研究所 (max 5) -> 1~5
                    // 增加一點隨機性，但確保不超過難度限制
                    numOptions = Math.floor(Math.random() * maxOptions) + minOptions;
                    if (numOptions < 1) numOptions = 1;
                }

                const row = this.createRow(char, index, numOptions, currentY, currentDecoyPool);
                this.rows.push(row);
                this.gameArea.appendChild(row.element);

                // 行距：按鈕高度 + 10px
                currentY += this.btnHeight + 10;
            });
        },

        createRow: function (correctChar, index, numOptions, startY, decoyPool) {
            const rowEl = document.createElement('div');
            rowEl.className = 'ladder-row';
            rowEl.style.top = startY + 'px';

            // 準備選項
            const pool = decoyPool || this.decoyChars.split('');
            let options = [correctChar];
            while (options.length < numOptions) {
                const decoy = pool[Math.floor(Math.random() * pool.length)];
                if (!options.includes(decoy)) {
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
                //btn.style.width = this.btnSize + 'px';
                //btn.style.height = this.btnSize + 'px';
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

            // 只能按當前行
            if (rowIndex !== this.currentRowIndex) {
                // 如果按了未來的行，視為無效或錯誤 (這裡暫時忽略)
                return;
            }

            const currentRow = this.rows[this.currentRowIndex];

            if (char === currentRow.correctChar) {
                // 答對
                e.target.classList.add('correct');
                this.score += 10;
                document.getElementById('game3-score').textContent = this.score;

                // 標記該行已完成
                currentRow.clicked = true;
                // 改變按鈕顏色
                e.target.style.background = this.btnColorRight;
                e.target.style.color = this.nextRowFontColor;

                rowEl.classList.add('completed');
                Array.from(rowEl.querySelectorAll('button')).forEach(b => b.disabled = true);

                // 增加速度
                if (this.speed < 2) this.speed += 0.05;

                // 移動到下一行
                this.currentRowIndex++;

                // 檢查勝利
                if (this.currentRowIndex >= this.rows.length) {
                    this.gameOver(true);
                } else {
                    // 將當前新一行的所有按鈕字體顏色改為 currentRowFontColor
                    const currentRowEl = this.rows[this.currentRowIndex].element;
                    Array.from(currentRowEl.querySelectorAll('button')).forEach(btn => {
                        btn.style.color = this.currentRowFontColor;
                    });
                }
            } else {
                // 答錯
                e.target.classList.add('wrong');
                e.target.disabled = true;
                e.target.style.background = this.btnColorWrong;
                this.mistakeCount += 1;
                this.updateHearts();
                if (this.mistakeCount >= this.difficultySettings[this.difficulty].maxMistakeCount) {
                    this.gameOver(false, `按錯次數達 ${this.mistakeCount} 次，正確應為「${currentRow.correctChar}」`);
                    return;
                }
            }
        },

        loop: function () {
            if (!this.isActive) return;
            const currentRow = this.rows[this.currentRowIndex];
            this.rows.forEach(row => {
                if (row.clicked) {
                }

                row.y -= this.speed;
                row.element.style.top = row.y + 'px';

                if (!row.clicked && row.index === this.currentRowIndex && row.y < -this.btnHeight / 2) {
                    row.clicked = true;
                    row.element.classList.add('completed');
                    Array.from(row.element.querySelectorAll('button')).forEach(b => b.disabled = true);
                    this.mistakeCount += 1;
                    this.updateHearts();
                    if (this.mistakeCount >= this.difficultySettings[this.difficulty].maxMistakeCount) {
                        this.gameOver(false, `錯過的次數達 ${this.mistakeCount} 次，正確應為「${currentRow.correctChar}」`);
                        //this.gameOver(false, `錯過的次數達 ${this.mistakeCount} 次`);
                    }
                    this.currentRowIndex++;
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
