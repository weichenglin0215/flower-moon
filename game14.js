
(function () {
    const Game14 = {
        isActive: false,
        difficulty: '小學',
        currentLevelIndex: 1,
        isLevelMode: false,
        score: 0,
        mistakeCount: 0,
        maxMistakeCount: 5,
        currentPoem: null,
        rows: [],
        currentIndex: 0,
        container: null,
        gameArea: null,
        historyContainer: null,
        historyData: [], // 歷程紀錄陣列，每筆格式為 { char: 該字, status: 狀態(waiting/correct/wrong), isSep: 是否為分隔符 }
        timer: 120,       // 目前剩餘時間（秒）
        maxTimer: 120,    // 本局總時限（秒），依詩詞字數與難度係數計算而來
        timerInterval: null, // setInterval 的計時器 ID，用於倒數計時
        startTime: null,     // 本局開始攀登的時間戳記（Date.now()），用於計算經過秒數
        // 難度參數說明：
        // timeMutiply：時間倍率，數值越小代表時間越緊迫
        // poemMinRating：詩詞最低評分門檻，篩選出的詩詞須達到此評分以上
        // maxMistakeCount：最大允許錯誤次數（生命值上限）
        // minChars：詩詞最少字數
        // maxChars：詩詞最多字數
        difficultySettings: {
            '小學': { timeMutiply: 1.2, poemMinRating: 6, maxMistakeCount: 6, minChars: 10, maxChars: 20 },
            '中學': { timeMutiply: 1.1, poemMinRating: 5, maxMistakeCount: 5, minChars: 20, maxChars: 28 },
            '高中': { timeMutiply: 1.0, poemMinRating: 4, maxMistakeCount: 4, minChars: 28, maxChars: 40 },
            '大學': { timeMutiply: 0.85, poemMinRating: 3, maxMistakeCount: 3, minChars: 28, maxChars: 56 },
            '研究所': { timeMutiply: 0.6, poemMinRating: 3, maxMistakeCount: 2, minChars: 28, maxChars: 120 }
        },
        gameStartTime: null, // 本局實際開始遊玩的時間戳記，用於統計遊玩時長並寫入紀錄

        // 初始化遊戲：建立 DOM（若尚未建立），取得容器參照並綁定按鈕事件
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

        // 動態建立遊戲畫面的 DOM 結構（僅執行一次），包含分數板、難度標籤、
        // 計時圓環、遊戲主區域與歷程顯示區，並註冊縮放回呼以配合畫面自適應
        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'game14-container';
            div.className = 'game14-overlay  hidden';
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
                    <svg id="game14-timer-ring">
                        <rect id="game14-timer-path" x="4" y="4"></rect>
                    </svg>
                    <div id="game14-poem-info" class="game14-poem-info"></div>
                </div>
                <div id="game14-history" class="game14-history"></div>
            `;
            document.body.appendChild(div);
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left   = r.left   + 'px';
                    div.style.top    = r.top    + 'px';
                    div.style.width  = 500 + 'px';
                    div.style.height = 850 + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
            this.renderHearts();
        },

        // 顯示遊戲：先初始化，再彈出難度選擇視窗
        show: function () {
            this.init();
            this.showDifficultySelector();
        },

        // 開啟難度選擇器，玩家選定難度（或挑戰關卡）後套用設定並開始新局
        showDifficultySelector: function () {
            if (window.DifficultySelector) {
                window.DifficultySelector.show('步步驚心', (selectedLevel, levelIndex) => {
                    this.difficulty = selectedLevel;
                    this.isLevelMode = (levelIndex !== undefined);
                    this.currentLevelIndex = levelIndex || 1;
                    this.container.classList.remove('hidden');
                    document.body.classList.add('overlay-active');
                    this.startNewGame();
                });
            }
        },

        // 依目前模式（一般難度 / 關卡挑戰）更新難度標籤文字、顏色，
        // 並決定「開新局」按鈕是否顯示
        updateUIForMode: function () {
            const diffTag = document.getElementById('game14-diff-tag');
            const newBtn = document.getElementById('game14-newGame-btn');
            const colors = { '小學': '#27ae60', '中學': '#2980b9', '高中': '#c0392b', '大學': '#8e44ad', '研究所': '#f1c40f' };
            if (diffTag) {
                diffTag.textContent = this.isLevelMode ? `挑戰第 ${this.currentLevelIndex} 關` : this.difficulty;
                diffTag.style.backgroundColor = colors[this.difficulty] || '#4CAF50';
                diffTag.style.color = (this.difficulty === '研究所') ? '#333' : '#fff';
            }
            // 挑戰模式下隱藏「新局」按鈕，避免玩家意外跳出挑戰流程
            if (newBtn) newBtn.style.display = this.isLevelMode ? 'none' : 'inline-block';
        },

        // 停止遊戲：清除計時器、隱藏遊戲畫面與規則說明彈窗
        stopGame: function () {
            this.isActive = false;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (this.container) this.container.classList.add('hidden');
            document.body.classList.remove('overlay-active');
            if (window.RuleNoteDialog) window.RuleNoteDialog.hide();
        },

        // 開新局：重置分數、錯誤次數、時間等所有狀態，重新選詩並準備階梯，
        // 最後顯示開始提示訊息（一般模式或挑戰下一關都會呼叫此函式）
        startNewGame: function () {
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (window.GameMessage) window.GameMessage.hide();

            this.isActive = false;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentIndex = 0;
            this.rows = [];
            this.historyData = [];
            this.timer = 0;
            this.maxTimer = 0;
            this.startTime = null;

            document.getElementById('game14-score').textContent = "0";

            // 每次開新局都同步更新 UI（含挑戰關卡編號與按鈕顯示狀態）
            this.updateUIForMode();

            // 啟用按鈕
            document.getElementById('game14-retryGame-btn').disabled = false;
            document.getElementById('game14-newGame-btn').disabled = false;

            const settings = this.difficultySettings[this.difficulty] || this.difficultySettings['小學'];
            this.maxMistakeCount = settings.maxMistakeCount;
            this.renderHearts();

            if (this.selectPoem(settings)) {
                this.prepareLadder(settings);
                this.showStartMessage();
            }

            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }
        },

        // 重來：沿用同一首詩重新開始（不重新選詩），重置分數與生命值，
        // 並直接進入遊戲（不顯示規則說明）
        retryGame: function () {
            if (!this.currentPoem) return;
            if (this.timerInterval) clearInterval(this.timerInterval);
            if (window.ScoreManager) window.ScoreManager.cancelAnimation();
            if (window.GameMessage) window.GameMessage.hide();

            this.isActive = false;
            this.score = 0;
            this.mistakeCount = 0;
            this.currentIndex = 0;
            this.rows = [];
            this.historyData = [];
            this.timer = this.maxTimer;
            this.startTime = null;

            document.getElementById('game14-score').textContent = "0";
            document.getElementById('game14-timer-display').textContent = this.timer;
            this.updateTimerRing(1);

            // 啟用按鈕
            document.getElementById('game14-retryGame-btn').disabled = false;
            document.getElementById('game14-newGame-btn').disabled = false;

            this.renderHearts();

            const settings = this.difficultySettings[this.difficulty] || this.difficultySettings['小學'];
            this.prepareLadder(settings);
            this.gameStart(); // 重來通常直接開始

            if (window.SoundManager && window.SoundManager.melodyPlayer) {
                window.SoundManager.melodyPlayer.currentIndex = 0;
            }
        },

        // 正式開始計時與遊戲互動：記錄開始時間，每秒更新剩餘時間顯示與
        // 計時圓環，時間歸零則觸發遊戲結束（失敗）
        gameStart: function () {
            this.isActive = true;
            this.startTime = Date.now();
            this.gameStartTime = Date.now();
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

        // 更新計時圓環的視覺呈現。
        // ratio：時間比例（0~1）；mode：'win' 時顯示勝利動畫（黃色弧段從紅色結束點縮短），
        // 其餘情況顯示一般倒數效果（暗紅漸變為鮮紅，隨時間增長）
        updateTimerRing: function (ratio, mode) {
            const path = document.getElementById('game14-timer-path');
            const svg = document.getElementById('game14-timer-ring');
            const area = document.getElementById('game14-area');
            if (!path || !svg || !area) return;

            const w = area.offsetWidth;
            const h = area.offsetHeight;

            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            // 扣除 stroke-width (預設 10px 換算大約 8px) 避免邊框被截斷
            const rw = Math.max(0, w - 8);
            const rh = Math.max(0, h - 8);

            path.setAttribute('width', rw);
            path.setAttribute('height', rh);

            const perimeter = 2 * (rw + rh);
            path.style.strokeDasharray = perimeter;
            if (mode === 'win') {
                // 勝利動畫：黃色弧段從紅色結束點繼續，顯示剩餘時間，順時針縮短至消失
                const clamped = Math.max(0, Math.min(1, ratio));
                path.style.transition = 'stroke 0.3s ease';
                path.style.strokeDasharray = `${clamped * perimeter}, ${(1 - clamped) * perimeter}`;
                path.style.strokeDashoffset = clamped * perimeter;
                path.style.stroke = `hsl(45, 95%, ${Math.round(55 + 20 * clamped)}%)`;
            } else {
                // 正常計時：顯示消逝時間（暗紅→鮮紅，順時針增長）
                path.style.transition = '';
                path.style.strokeDashoffset = perimeter * Math.max(0, Math.min(1, ratio));
                const elapsed = 1 - Math.max(0, Math.min(1, ratio));
                path.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
            }
        },

        // 依難度設定的評分與字數範圍，透過共用函式隨機抽取一首詩，
        // 並依總字數與時間倍率計算本局的總時限（maxTimer）
        selectPoem: function (settings) {
            const result = getSharedRandomPoem(
                settings.poemMinRating,
                4,
                8,
                settings.minChars,
                settings.maxChars,
                "",
                this.isLevelMode ? this.currentLevelIndex : null,
                'game14'
            );
            if (!result) return false;

            this.currentPoem = result.poem;
            this.poemLines = result.lines;

            // 根據字數與難度係數計算總時限
            const chars = result.lines.join('').split('');
            this.maxTimer = Math.ceil(chars.length * settings.timeMutiply);
            this.timer = this.maxTimer;
            return true;
        },

        // 準備「階梯」畫面：清除舊的階梯行，更新計時器與詩詞資訊顯示，
        // 並依詩句每個字產生對應的按鈕列（首字為單選直接點擊，
        // 其餘字為「正確字＋混淆字」二選一，隨機分配左右邊並避免連續同側過久）
        prepareLadder: function (settings) {
            // 清理舊的階梯行
            const area = document.getElementById('game14-area');
            if (!area) return;
            const elementsToRemove = area.querySelectorAll('.ladder-row-14');
            elementsToRemove.forEach(el => area.removeChild(el));

            // 更新計時器顯示
            document.getElementById('game14-timer-display').textContent = this.timer;
            this.updateTimerRing(1);

            // 更新詩詞資訊
            let title = this.currentPoem.title;
            if (title.length > 12) {
                title = title.substring(0, 10) + "...";
            }
            const infoEl = document.getElementById('game14-poem-info');
            if (infoEl) {
                infoEl.textContent = `${title} / ${this.currentPoem.dynasty} / ${this.currentPoem.author}`;
                infoEl.onclick = () => {
                    if (window.openPoemDialogById) window.openPoemDialogById(this.currentPoem.id);
                };
            }

            const chars = this.poemLines.join('').split('');
            const baseCommon = window.SharedDecoy ? window.SharedDecoy.decoyCharsSets.common.split('') : "的一是在不了有和人這中".split('');
            const fallbackPool = baseCommon.filter(c => !chars.includes(c));

            this.rows = [];
            this.historyData = [];
            let lastSide = -1; // 0: 左, 1: 右
            let sideCount = 0;

            chars.forEach((char, idx) => {
                let options;
                let isStartRow = (idx === 0);

                if (isStartRow) {
                    options = [char];
                } else {
                    // 混淆字排除題目詩句中的所有字，避免干擾
                    const decoys = window.SharedDecoy ?
                        window.SharedDecoy.getDecoyChars(chars, 1) :
                        [fallbackPool[Math.floor(Math.random() * fallbackPool.length)]];

                    // 隨機決定正確答案在哪一邊 (0: 左, 1: 右)
                    let correctSide = Math.random() < 0.5 ? 0 : 1;

                    // 防呆：若連續同一邊達 3 次以上，50% 機率強行換邊
                    if (correctSide === lastSide) {
                        sideCount++;
                        if (sideCount >= 3) {
                            if (Math.random() < 0.6) {
                                correctSide = 1 - correctSide;
                                sideCount = 1; // 換邊後重設計數
                            }
                        }
                    } else {
                        sideCount = 1; // 不同邊則重設計數
                    }
                    lastSide = correctSide;

                    options = correctSide === 0 ? [char, decoys[0]] : [decoys[0], char];
                }

                const rowEl = document.createElement('div');
                rowEl.className = 'ladder-row-14' + (isStartRow ? ' start-row' : '');

                options.forEach(opt => {
                    const btn = document.createElement('button');
                    btn.className = 'ladder-btn-14' + (isStartRow ? ' double-wide' : '');

                    if (this.difficulty === '小學' && opt !== char && !isStartRow) {
                        btn.classList.add('wrong-hint');
                    }

                    btn.textContent = opt;
                    // 使用 pointerdown 碰觸即觸發，不必等到手指離開畫面（參考 game3.js）
                    btn.addEventListener('pointerdown', (e) => {
                        if (e.pointerType === 'touch') e.preventDefault();
                        this.handleBtnClick(opt, char, idx, btn, rowEl);
                    });
                    rowEl.appendChild(btn);
                });

                this.rows.push({ element: rowEl, char: char, index: idx });
                this.historyData.push({ char: char, status: 'waiting' });
                area.appendChild(rowEl);
            });

            this.updateLayout();
            this.renderHistory();
        },

        // 更新階梯各行的 3D 視覺位置：目前作答行置中最大，
        // 已過的行往上、往後縮小淡出，未來的行則隱藏於下方
        updateLayout: function () {
            const rowHeight = 7.0; // 每行的基準高度（rem 單位，用於計算堆疊位移）

            this.rows.forEach((row, idx) => {
                const offset = idx - this.currentIndex;

                if (offset < 0) {
                    const dist = -offset;
                    const scale = Math.pow(0.9, dist);
                    const yShift = -dist * rowHeight * 0.9;
                    const zShift = -dist * 50;

                    row.element.style.display = 'flex';
                    row.element.style.opacity = (1 - dist * 0.066).toString();
                    row.element.style.transform = `translate3d(0, ${(yShift) * 20}px, ${zShift}px) scale(${scale})`;
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
                    row.element.style.transform = `translate3d(0, 300px, -100px) scale(0.5)`;
                    row.element.style.zIndex = 50 - offset;
                    row.element.classList.remove('active-row');
                }
            });
        },

        // 處理玩家點擊按鈕：判斷答對／答錯，更新分數、生命值與歷程紀錄，
        // 答錯次數達上限則直接判定遊戲失敗；否則短暫延遲後前進至下一行，
        // 若已是最後一行則判定遊戲勝利
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

        // 顯示開場規則說明彈窗，玩家確認後才正式開始計時（gameStart）
        showStartMessage: function () {
            if (window.RuleNoteDialog) {
                window.RuleNoteDialog.show({
                    title: '步步驚心',
                    lines: [
                        '依序點擊最下方文字。',
                        '點擊越快，分數越高。',
                        '錯誤扣紅心。',
                        '　',
                        '首字直接點擊，',
                        '後續二選一。'
                    ],
                    btnText: '開始攀登',
                    styles: { height: '60%', top: '60%' },
                    onConfirm: () => {
                        this.gameStart();
                    }
                });
            } else {
                this.gameStart();
            }
        },

        // 依 historyData 重新渲染左側直排的歷程顯示：
        // 尚未作答顯示「□」，已作答則顯示實際文字並套用對應顏色 class
        renderHistory: function () {
            if (!this.historyContainer) return;
            let html = '';
            this.historyData.forEach(item => {
                const cls = `history-char ${item.status}`;
                html += `<span class="${cls}">${item.status === 'waiting' ? '□' : item.char}</span>`;
            });
            this.historyContainer.innerHTML = html;
        },

        // 依目前錯誤次數與生命上限，重新渲染紅心圖示（實心♥為剩餘生命，空心♡為已消耗）
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

        // 生命值變動後的重繪入口（實際邏輯由 renderHearts 統一處理）
        updateHearts: function () {
            this.renderHearts();
        },

        // 遊戲結束處理：紀錄失敗局的遊玩紀錄（成功局由 ScoreManager 負責記錄），
        // 依勝負決定按鈕啟用狀態，並在確認後進入下一局（勝利：下一關或開新局；失敗：重來）；
        // 若勝利則先播放得分動畫，動畫結束後才顯示結算訊息（並檢查是否有成就達成）
        gameOver: function (win, reason) {
            this.isActive = false;
            this.isWin = win;
            // 失敗時寫入 game_logs（score=0，記錄本局時長）
            // 過關時 LOG 已由 ScoreManager.saveScore 負責寫入
            if (!win && window.SupabaseClient) {
                const durationS = this.gameStartTime
                    ? Math.floor((Date.now() - this.gameStartTime) / 1000)
                    : 0;
                window.SupabaseClient.logGame({
                    gameNo: 14,
                    difficulty: this.difficulty || '',
                    score: 0,
                    isWin: false,
                    durationS: durationS
                });
            }
            if (this.timerInterval) clearInterval(this.timerInterval);

            // 僅在挑戰成功 win 時停用重來按鍵。失敗則維持可點擊。
            if (win) {
                document.getElementById('game14-retryGame-btn').disabled = true;
                document.getElementById('game14-newGame-btn').disabled = true;
            } else {
                document.getElementById('game14-retryGame-btn').disabled = false;
                document.getElementById('game14-newGame-btn').disabled = false;
            }

            const onConfirm = () => {
                // 恢復按鈕狀態
                document.getElementById('game14-retryGame-btn').disabled = false;
                document.getElementById('game14-newGame-btn').disabled = false;

                if (win) {
                    if (this.isLevelMode) {
                        this.currentLevelIndex++;
                        this.startNewGame();
                    } else {
                        this.startNewGame();
                    }
                } else {
                    this.retryGame();
                }
            };

            const showMessage = () => {
                if (window.GameMessage) {
                    window.GameMessage.show({
                        isWin: win,
                        score: win ? Math.floor(this.score) : 0,
                        reason: reason,
                        btnText: win ? (this.isLevelMode ? "下一關" : "開新局") : "再試一次",
                        onConfirm: onConfirm
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
                    timerContainerId: 'game14-timer-ring',
                    heartsSelector: '#game14-hearts .heart:not(.empty)',
                    onComplete: (finalScore) => {
                        this.score = finalScore;
                        if (this.isLevelMode) {
                            const achId = window.ScoreManager.completeLevel('game14', this.difficulty, this.currentLevelIndex);
                            if (achId && window.AchievementDialog) {
                                window.AchievementDialog.showInstantAchievementPop(achId, 'game14', this.currentLevelIndex, showMessage);
                            } else {
                                showMessage();
                            }
                        } else {
                            showMessage();
                        }
                    }
                });
            } else {
                showMessage();
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
