
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
        btnSize: 90,
        btnColor: 'rgba(240, 230, 210, 0.9)',
        btnColorRight: 'rgba(120, 230, 150, 0.9)',
        btnColorWrong: 'rgba(230, 120, 150, 0.9)',
        btnFontSize: 66,
        currentRowFontColor: 'rgba(24, 23, 0, 1)',
        nextRowFontColor: 'rgba(24, 23, 0, 0.5)',
        // 常用字庫 (用於生成干擾項)
        decoyChars: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長",

        init: function () {
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
            div.className = 'game-overlay hidden';
            div.innerHTML = `
                <div class="game-header">
                    <div class="score-board">分數: <span id="game3-score">0</span></div>
                    <div class="game-controls">
                        <button id="game3-restart-btn" class="nav-btn">重新開始</button>
                        <button id="game3-close-btn" class="nav-btn close-btn">退出</button>
                    </div>
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
                this.restartGame();
            });
            const hearts = document.createElement('div');
            hearts.id = 'game3-hearts';
            hearts.className = 'hearts';
            document.querySelector('#game3-container .game-header').insertBefore(hearts, document.querySelector('#game3-container .game-controls'));
            this.renderHearts();
        },

        show: function () {
            this.init(); // 確保 DOM 存在
            this.container.classList.remove('hidden');
            document.body.style.overflow = 'hidden'; // 禁止背景捲動
            this.restartGame();
        },

        stopGame: function () {
            this.isActive = false;
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
            this.container.classList.add('hidden');
            document.body.style.overflow = '';
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
            let poem = POEMS[Math.floor(Math.random() * POEMS.length)];
            /*優先選擇rating高的詩詞*/
            while ((poem.rating || 0) < 2) {
                poem = POEMS[Math.floor(Math.random() * POEMS.length)];
            }

            while (poem.rating <= 1) {
                poem = POEMS[Math.floor(Math.random() * POEMS.length)];
            }

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
            let currentY = window.innerHeight; // 從螢幕下方開始

            chars.forEach((char, index) => {
                // 難度控制：隨機決定按鈕數量 (1-3)
                let numOptions = 1;
                // 每一句的第一個字難度固定 1 個按鍵
                if (firstIndices.has(index)) {
                    numOptions = 1;
                } else {
                    // 其他字維持原難度設計
                    if (index < 5) {
                        numOptions = Math.random() > 0.66 ? 1 : 2;
                    } else {
                        numOptions = Math.floor(Math.random() * 3) + 2;
                    }
                }

                const row = this.createRow(char, index, numOptions, currentY);
                this.rows.push(row);
                this.gameArea.appendChild(row.element);


                // 行距：按鈕高度 + 10px
                currentY += this.btnSize + 10;
            });
        },

        createRow: function (correctChar, index, numOptions, startY) {
            const rowEl = document.createElement('div');
            rowEl.className = 'ladder-row';
            rowEl.style.top = startY + 'px';

            // 準備選項
            let options = [correctChar];
            while (options.length < numOptions) {
                const decoy = this.decoyChars[Math.floor(Math.random() * this.decoyChars.length)];
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
                btn.style.width = this.btnSize + 'px';
                btn.style.height = this.btnSize + 'px';
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
                this.speed += 0.05;

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
                if (this.mistakeCount >= 5) {
                    this.gameOver(false, `錯誤次數達 5 次，正確應為「${currentRow.correctChar}」`);
                }
            }
        },

        loop: function () {
            if (!this.isActive) return;

            this.rows.forEach(row => {
                if (row.clicked) {
                }

                row.y -= this.speed;
                row.element.style.top = row.y + 'px';

                if (!row.clicked && row.index === this.currentRowIndex && row.y < 0) {
                    row.clicked = true;
                    row.element.classList.add('completed');
                    Array.from(row.element.querySelectorAll('button')).forEach(b => b.disabled = true);
                    this.mistakeCount += 1;
                    this.updateHearts();
                    if (this.mistakeCount >= 5) {
                        this.gameOver(false, "錯誤次數達 5 次");
                        return;
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
            for (let i = 0; i < 5; i++) {
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
