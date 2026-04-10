
(function () {
    const Game14 = {
        isActive: false,
        difficulty: '小學',
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 5,
        currentPoem: null,
        rows: [],
        currentIndex: 0,
        container: null,
        gameArea: null,
        historyContainer: null,
        historyData: [], // { char, status, isSep }
        timer: 120,
        maxTimer: 120,
        timerInterval: null,
        startTime: null,

        difficultySettings: {
            '小學': { timeMutiply: 2, poemMinRating: 6, maxMistakeCount: 6, minChars: 10, maxChars: 20 },
            '中學': { timeMutiply: 1.5, poemMinRating: 5, maxMistakeCount: 5, minChars: 20, maxChars: 28 },
            '高中': { timeMutiply: 1.0, poemMinRating: 4, maxMistakeCount: 4, minChars: 28, maxChars: 40 },
            '大學': { timeMutiply: 0.75, poemMinRating: 3, maxMistakeCount: 3, minChars: 28, maxChars: 56 },
            '研究所': { timeMutiply: 0.5, poemMinRating: 3, maxMistakeCount: 2, minChars: 40, maxChars: 120 }
        },

        init: function () {
            if (!this.container) {
                this.createDOM();
            }
            this.container = document.getElementById('game14-container');
            this.gameArea = document.getElementById('game14-area');
            this.historyContainer = document.getElementById('game14-history');

            document.getElementById('game14-retryGame-btn').onclick = () => this.retryGame();
            document.getElementById('game14-newGame-btn').onclick = () => this.startNewGame();
            document.getElementById('game14-diff-tag').onclick = () => this.showDifficultySelector();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game14-container';
            div.className = 'game14-overlay aspect-5-8 hidden';
            div.innerHTML = `
                <div class="game14-header">
                    <div class="game14-score-board">分數: <span id="game14-score">0</span></div>
                    <div class="game14-controls">
                        <button class="game14-difficulty-tag" id="game14-diff-tag">小學</button>
                        <button id="game14-retryGame-btn" class="nav-btn">重來</button>
                        <button id="game14-newGame-btn" class="nav-btn">開新局</button>
                    </div>
                </div>
                <div class="game14-sub-header">
                    <div id="game14-hearts" class="hearts"></div>
                </div>
                <div id="game14-area" class="game14-area">
                    <div id="game14-timer-display" class="timer-text-14">0</div>
                    <svg id="game14-timer-ring-svg">
                        <rect id="game14-timer-path" x="3" y="3"></rect>
                    </svg>
                </div>
                <div id="game14-history" class="game14-history"></div>
            `;
            document.body.appendChild(div);
            this.renderHearts();
        },

        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        showDifficultySelector: function () {
            if (window.DifficultySelector) {
                window.DifficultySelector.show('步步驚心', (selectedLevel) => {
                    this.difficulty = selectedLevel;
                    const diffTag = document.getElementById('game14-diff-tag');
                    if (diffTag) diffTag.textContent = selectedLevel;
                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.startNewGame();
                });
            }
        },

        stopGame: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.classList.remove('overlay-active');
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();
        },

        startNewGame: function (isRetry = false) {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);

            const settings = this.difficultySettings[this.difficulty] || this.difficultySettings['小學'];
            this.score = 0;
            this.mistakeCount = 0;
            this.maxMistakeCount = settings.maxMistakeCount;
            this.currentIndex = 0;
            this.rows = [];
            this.historyData = [];
            this.timer = 0;
            this.maxTimer = 0;
            this.startTime = null;

            document.getElementById('game14-score').textContent = Math.floor(this.score);
            document.getElementById('game14-timer-display').textContent = this.timer;

            // 清理舊的階梯行，但保留計時器
            const area = document.getElementById('game14-area');
            const elementsToRemove = area.querySelectorAll('.ladder-row-14');
            elementsToRemove.forEach(el => area.removeChild(el));

            this.updateTimerRing(1);
            this.renderHearts();

            this.selectAndPreparePoem(settings);
            this.updateLayout();

            if (isRetry) {
                this.gameStart();
            } else {
                this.showStartMessage();
            }

            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }
        },

        gameStart: function () {
            this.isActive = true;
            this.startTime = Date.now();
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                if (!this.isActive) return;
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                this.timer = Math.max(0, this.maxTimer - elapsed);
                document.getElementById('game14-timer-display').textContent = this.timer;
                this.updateTimerRing(this.timer / this.maxTimer);
                if (this.timer <= 0) {
                    this.gameOver(false, "時間到！");
                }
            }, 1000);
        },

        updateTimerRing: function (ratio) {
            const path = document.getElementById('game14-timer-path');
            const svg = document.getElementById('game14-timer-ring-svg');
            if (!path || !svg) return;

            const rect = svg.getBoundingClientRect();
            if (rect.width === 0) return; // Hidden or not rendered yet

            const w = rect.width - 6;
            const h = rect.height - 6;

            path.setAttribute('width', w);
            path.setAttribute('height', h);

            const perimeter = 2 * (w + h);
            path.style.strokeDasharray = perimeter;
            path.style.strokeDashoffset = perimeter * (1 - ratio);

            if (ratio < 0.25) path.style.stroke = 'hsl(0, 100%, 50%)';
            else path.style.stroke = 'hsl(0, 80%, 36%)';
        },

        retryGame: function () {
            this.startNewGame(true);
        },

        selectAndPreparePoem: function (settings) {
            // 修正參數順序：minRating, minLines, maxLines, minChars, maxChars, keyword, seed, gameKey
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                4,
                8,
                settings.minChars,
                settings.maxChars,
                "",
                null,
                'game14'
            );
            if (!result) return;

            this.currentPoem = result.poem;
            const chars = result.lines.join('').split('');

            // 根據字數與難度係數計算總時限
            this.maxTimer = Math.ceil(chars.length * settings.timeMutiply);
            this.timer = this.maxTimer;

            // 更新計時器顯示
            document.getElementById('game14-timer-display').textContent = this.timer;
            this.updateTimerRing(1);

            const baseCommon = window.SharedDecoy ? window.SharedDecoy.decoyCharsSets.common.split('') : "的一是在不了有和人這中".split('');

            chars.forEach((char, idx) => {
                let options;
                let isStartRow = (idx === 0);

                if (isStartRow) {
                    options = [char];
                } else {
                    const decoys = window.SharedDecoy ? window.SharedDecoy.getDecoyChars([char], 1) : [baseCommon[Math.floor(Math.random() * baseCommon.length)]];
                    options = [char, decoys[0]].sort(() => Math.random() - 0.5);
                }

                const rowEl = document.createElement('div');
                rowEl.className = 'ladder-row-14' + (isStartRow ? ' start-row' : '');

                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'ladder-btn-14' + (isStartRow ? ' double-wide' : '');

                    // 小學難度：錯誤選項直接顯示黑色
                    if (this.difficulty === '小學' && opt !== char && !isStartRow) {
                        btn.classList.add('wrong-hint');
                    }

                    btn.textContent = opt;
                    btn.onclick = () => this.handleBtnClick(opt, char, idx, btn, rowEl);
                    rowEl.appendChild(btn);
                });

                this.rows.push({ element: rowEl, char: char, index: idx });
                this.historyData.push({ char: char, status: 'waiting' });
                this.gameArea.appendChild(rowEl);
            });

            this.renderHistory();
        },

        updateLayout: function () {
            const rowHeight = 7.0; // rem

            this.rows.forEach((row, idx) => {
                const offset = idx - this.currentIndex;

                if (offset < 0) {
                    const dist = -offset;
                    const scale = Math.pow(0.9, dist);
                    const yShift = -dist * rowHeight * 0.9;
                    const zShift = -dist * 50;

                    row.element.style.display = 'flex';
                    row.element.style.opacity = (1 - dist * 0.066).toString();
                    row.element.style.transform = `translate3d(0, ${yShift}rem, ${zShift}px) scale(${scale})`;
                    row.element.style.zIndex = 100 - dist;
                    row.element.classList.remove('active-row');
                    Array.from(row.element.querySelectorAll('button')).forEach(b => b.style.opacity = '0.7');
                } else if (offset === 0) {
                    row.element.style.display = 'flex';
                    row.element.style.opacity = '1';
                    row.element.style.transform = `translate3d(0, 0, 0) scale(1)`;
                    row.element.style.zIndex = 150;
                    row.element.classList.add('active-row');
                    Array.from(row.element.querySelectorAll('button')).forEach(b => b.style.opacity = '1');
                } else {
                    row.element.style.display = 'flex';
                    row.element.style.opacity = '0';
                    row.element.style.transform = `translate3d(0, 15rem, -100px) scale(0.5)`;
                    row.element.style.zIndex = 50 - offset;
                    row.element.classList.remove('active-row');
                }
            });
        },

        handleBtnClick: function (selected, correct, index, btn, rowEl) {
            if (!this.isActive || index !== this.currentIndex) return;

            // 無論對錯，只要點擊了就禁用該行所有按鈕，且必定往下一關移動
            Array.from(rowEl.querySelectorAll('button')).forEach(b => b.disabled = true);

            if (selected === correct) {
                btn.classList.add('correct');
                this.score += window.ScoreManager.gameSettings['game14'].getPointA;
                document.getElementById('game14-score').textContent = Math.floor(this.score);
                this.historyData[index].status = 'correct';
                if (window.SoundManager) {
                    if (window.SoundManager.melodyPlayer) window.SoundManager.melodyPlayer.playNextNote();
                    else window.SoundManager.playSuccessShort();
                }
            } else {
                // 點擊錯誤：轉為紅底
                btn.classList.add('wrong-clicked');
                this.mistakeCount++;
                this.updateHearts();
                this.historyData[index].status = 'wrong';
                if (window.SoundManager) window.SoundManager.playFailure();

                if (this.mistakeCount >= this.maxMistakeCount) {
                    this.gameOver(false, "體力耗盡");
                    return; // 輸了就中斷
                }
            }

            // 無論對錯，只要沒輸就往上升
            setTimeout(() => {
                this.currentIndex++;
                this.renderHistory();

                if (this.currentIndex >= this.rows.length) {
                    this.gameOver(true, "步步登天");
                } else {
                    this.updateLayout();
                }
            }, 100);
        },

        showStartMessage: function () {
            if (window.RuleNoteDialog) {
                window.RuleNoteDialog.show({
                    title: '步步驚心',
                    lines: [
                        '點擊正確文字，攀爬詩詞之梯。',
                        '外圍紅框代表時間，務必把握。',
                        '首字直接點擊，後續二選一。',
                        '在小學難度中，黑色代表陷阱。',
                        '　',
                        '正確得10分，錯誤扣紅心。'
                    ],
                    btnText: '開始攀登',
                    onConfirm: () => {
                        this.gameStart();
                    }
                });
            } else {
                this.gameStart();
            }
        },

        renderHistory: function () {
            if (!this.historyContainer) return;
            let html = '';
            this.historyData.forEach(item => {
                const cls = `history-char ${item.status}`;
                html += `<span class="${cls}">${item.status === 'waiting' ? '□' : item.char}</span>`;
            });
            this.historyContainer.innerHTML = html;
        },

        renderHearts: function () {
            const container = document.getElementById('game14-hearts');
            if (!container) return;
            container.innerHTML = '';
            for (let i = 0; i < this.maxMistakeCount; i++) {
                const span = document.createElement('span');
                span.className = 'heart';
                span.textContent = i < (this.maxMistakeCount - this.mistakeCount) ? '♥' : '♡';
                if (i >= (this.maxMistakeCount - this.mistakeCount)) span.classList.add('empty');
                container.appendChild(span);
            }
        },

        updateHearts: function () {
            this.renderHearts();
        },

        gameOver: function (win, reason) {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);

            const showFinalMessage = (fScore) => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: Math.floor(fScore),
                        reason: reason,
                        onConfirm: () => this.startNewGame()
                    });
                } else {
                    alert((win ? "答對了！" : "輸了！") + reason);
                }
            };

            if (win && window.ScoreManager) {
                window.ScoreManager.playWinAnimation({
                    game: this,
                    difficulty: this.difficulty,
                    gameKey: 'game14',
                    scoreElementId: 'game14-score',
                    timerContainerId: 'game14-timer-ring-svg',
                    heartsSelector: '#game14-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        showFinalMessage(finalScore);
                    }
                });
            } else {
                showFinalMessage(this.score);
            }
        }
    };

    window.Game14 = Game14;

    if (new URLSearchParams(window.location.search).get('game') === '14') {
        setTimeout(() => {
            if (window.Game14) window.Game14.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);
    }
})();
