/**
 * 考試（考棚）遊戲模組
 * 依《參加考試_企畫書 v2》規格。
 *
 * 對外 API：
 *   window.Exam.start(rank, { onPass, onFail })
 *     - rank: { name, minScore }  來自 collection.js 的 nextExamRank()
 *     - onPass / onFail: 玩家關閉結果彈窗後的回呼（用來重開江南小院）
 *
 * 規則摘要：
 *   - 連續 10 題；共用 heart（依難度而異）
 *   - 答對 → 短暫倒數框動畫 → 立刻下一題
 *   - 答錯或時間到 → 扣一顆心
 *   - 心 = 0 → 落榜
 *   - 10 題全結束且心 > 0 → 通過
 *   - 本遊戲「不」計積分、「不」給文錢、「不」記詩詞紀錄
 *   - 通過 → ranks.passed 追加、examStats.passCount++、彈「金榜題名」訊息
 *   - 失敗 → examStats.failCount++、彈失敗訊息（顯示第 N 次挑戰）
 */
(function () {
    'use strict';

    const RANK_COLORS = {
        '縣案首': 'hsl(100, 40%, 40%)', '府案首': 'hsl(100, 40%, 40%)',
        '文童': 'hsl(210, 40%, 50%)', '秀才': 'hsl(210, 40%, 50%)',
        '舉人': 'hsl(0, 50%, 50%)', '貢士': 'hsl(0, 50%, 50%)',
        '進士': 'hsl(290, 50%, 50%)', '探花': 'hsl(290, 50%, 50%)',
        '榜眼': 'hsl(50, 80%, 50%)', '狀元': 'hsl(50, 80%, 50%)',
        '大儒': 'hsl(0, 0%, 100%)'
    };

    // difficultySettings 依企畫書 §3.3（參照 game20 加入 formats / minMaskCount / maxMaskCount）
    //   formats:
    //     'A' — 2 句：顯示第 2 句，隱藏第 1 句（猜前句）
    //     'B' — 3 句：顯示第 1+2 句，隱藏第 3 句（猜後句）
    //     'C' — 4 句：顯示第 3+4 句，隱藏第 2 句（猜中間句／逆推）
    //   minMaskCount / maxMaskCount:
    //     對每一句可見句施加 0~N 個字元遮罩 ◎，考驗記憶完整度
    const DIFFICULTY = {
        '縣案首': { hearts: 4, secPerQ: 12, poolMinRating: 6, poolMaxRating: 7, optionCount: 3, formats: ['A'], minMaskCount: 0, maxMaskCount: 0 },
        '府案首': { hearts: 4, secPerQ: 11, poolMinRating: 6, poolMaxRating: 7, optionCount: 3, formats: ['A'], minMaskCount: 0, maxMaskCount: 1 },
        '文童': { hearts: 4, secPerQ: 10, poolMinRating: 5, poolMaxRating: 7, optionCount: 4, formats: ['A', 'B'], minMaskCount: 0, maxMaskCount: 1 },
        '秀才': { hearts: 4, secPerQ: 9, poolMinRating: 5, poolMaxRating: 6, optionCount: 4, formats: ['A', 'B'], minMaskCount: 1, maxMaskCount: 2 },
        '舉人': { hearts: 3, secPerQ: 9, poolMinRating: 4, poolMaxRating: 6, optionCount: 5, formats: ['B'], minMaskCount: 1, maxMaskCount: 3 },
        '貢士': { hearts: 3, secPerQ: 8, poolMinRating: 4, poolMaxRating: 5, optionCount: 5, formats: ['B'], minMaskCount: 2, maxMaskCount: 3 },
        '進士': { hearts: 3, secPerQ: 7, poolMinRating: 3, poolMaxRating: 5, optionCount: 6, formats: ['B', 'C'], minMaskCount: 2, maxMaskCount: 4 },
        '探花': { hearts: 2, secPerQ: 7, poolMinRating: 3, poolMaxRating: 4, optionCount: 6, formats: ['B', 'C'], minMaskCount: 3, maxMaskCount: 4 },
        '榜眼': { hearts: 2, secPerQ: 6, poolMinRating: 2, poolMaxRating: 4, optionCount: 7, formats: ['B', 'C'], minMaskCount: 3, maxMaskCount: 5 },
        '狀元': { hearts: 2, secPerQ: 6, poolMinRating: 2, poolMaxRating: 3, optionCount: 7, formats: ['B', 'C'], minMaskCount: 4, maxMaskCount: 5 },
        '大儒': { hearts: 1, secPerQ: 5, poolMinRating: 1, poolMaxRating: 2, optionCount: 7, formats: ['B', 'C'], minMaskCount: 4, maxMaskCount: 6 }
    };

    const TOTAL_QUESTIONS = 10;

    const Exam = {
        overlay: null,
        rank: null,
        settings: null,
        callbacks: null,

        heartsLeft: 0,
        qIndex: 0,          // 目前題號 (0-based)
        currentPoem: null,
        hiddenLine: '',
        visibleLines: [],
        options: [],
        timerLeft: 0,
        timerHandle: null,
        isBusy: false,      // 答對後過場動畫期間鎖定輸入

        // ─────────────────────────────────────────────
        // 公開介面
        // ─────────────────────────────────────────────
        start: function (rank, callbacks) {
            if (!rank || !DIFFICULTY[rank.name]) {
                console.warn('[Exam] 未知的文位：', rank);
                if (callbacks && callbacks.onFail) callbacks.onFail();
                return;
            }
            this.rank = rank;
            this.settings = DIFFICULTY[rank.name];
            this.callbacks = callbacks || {};

            this._loadCSS();
            this._buildDOM();
            this._resetState();
            this.overlay.style.display = 'block';
            document.body.classList.add('overlay-active');
            this._nextQuestion();
        },

        // ─────────────────────────────────────────────
        // DOM / CSS
        // ─────────────────────────────────────────────
        _loadCSS: function () {
            if (document.getElementById('exam-css')) return;
            const link = document.createElement('link');
            link.id = 'exam-css';
            link.rel = 'stylesheet';
            link.href = 'exam.css';
            document.head.appendChild(link);
        },

        _buildDOM: function () {
            if (this.overlay) return;
            const div = document.createElement('div');
            div.id = 'examOverlay';
            div.innerHTML = `
                <div class="exam-header">
                    <div id="examDiffTag" class="exam-diff-tag">縣案首</div>
                    <div id="examHearts" class="exam-hearts"></div>
                    <div id="examQProgress" class="exam-q-progress">1 / ${TOTAL_QUESTIONS}</div>
                </div>

                <div class="exam-body">
                    <div id="examPoemInfo" class="exam-poem-info"></div>
                    <div id="examQuestion" class="exam-question"></div>
                    <div id="examOptionsContainer" class="exam-options-container">
                        <svg id="examTimerRing">
                            <rect id="examTimerPath" x="4" y="4"></rect>
                        </svg>
                        <div id="examOptions" class="exam-options"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(div);
            this.overlay = div;

            // 對齊 500×850 舞台
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.transform = 'scale(' + r.scale + ')';
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        // ─────────────────────────────────────────────
        // 狀態初始化
        // ─────────────────────────────────────────────
        _resetState: function () {
            this.heartsLeft = this.settings.hearts;
            this.qIndex = 0;
            this.currentPoem = null;
            this.isBusy = false;
            if (this.timerHandle) { clearInterval(this.timerHandle); this.timerHandle = null; }

            // Header
            const attemptNo = this._getAttemptNumber();
            const tag = this.overlay.querySelector('#examDiffTag');
            tag.textContent = `第 ${attemptNo} 次挑戰 · ${this.rank.name}`;
            tag.style.marginLeft = '50px';

            tag.style.background = RANK_COLORS[this.rank.name] || '#c0392b';
            tag.style.color = (this.rank.name === '大儒') ? '#333' : '#fff';

            this._renderHearts();
            this._updateProgress();
        },

        _getAttemptNumber: function () {
            const coll = (window.FMCollectionSave && window.FMCollectionSave.load()) || {};
            const st = (coll.examStats && coll.examStats[this.rank.name]) || { passCount: 0, failCount: 0 };
            return (st.passCount || 0) + (st.failCount || 0) + 1;
        },

        _renderHearts: function () {
            const wrap = this.overlay.querySelector('#examHearts');
            wrap.innerHTML = '';
            for (let i = 0; i < this.settings.hearts; i++) {
                const h = document.createElement('span');
                h.className = 'exam-heart' + (i < this.heartsLeft ? '' : ' empty');
                h.textContent = '♥';
                wrap.appendChild(h);
            }
        },

        _updateProgress: function () {
            const el = this.overlay.querySelector('#examQProgress');
            if (el) el.textContent = `${Math.min(this.qIndex + 1, TOTAL_QUESTIONS)} / ${TOTAL_QUESTIONS}`;
        },

        // ─────────────────────────────────────────────
        // 題目流程
        // ─────────────────────────────────────────────
        _nextQuestion: function () {
            if (this.qIndex >= TOTAL_QUESTIONS) {
                this._pass();
                return;
            }
            if (this.heartsLeft <= 0) {
                this._fail();
                return;
            }
            this._updateProgress();
            const ok = this._prepareChallenge();
            if (!ok) {
                // 題庫抽不到 → 直接判 fail 保底
                console.warn('[Exam] 抽題失敗');
                this._fail();
                return;
            }
            this._render();
            this._startTimer();
        },

        _prepareChallenge: function () {
            if (typeof POEMS === 'undefined' || !POEMS.length) return false;
            const s = this.settings;

            // 抽取本題格式（從 formats 陣列隨機挑一）
            const formats = (s.formats && s.formats.length) ? s.formats : ['A'];
            this.currentFormat = formats[Math.floor(Math.random() * formats.length)];
            // A: 2 句, B: 3 句, C: 4 句
            const needLines = (this.currentFormat === 'A') ? 2
                : (this.currentFormat === 'B') ? 3
                    : 4;

            // 依 rating 範圍 + 最少行數過濾候選詩
            let candidates = POEMS.filter(p => {
                const r = p.rating || 0;
                return r >= s.poolMinRating && r <= s.poolMaxRating
                    && Array.isArray(p.content) && p.content.length >= needLines;
            });
            if (!candidates.length) {
                candidates = POEMS.filter(p => (p.rating || 0) >= s.poolMinRating
                    && Array.isArray(p.content) && p.content.length >= needLines);
            }
            if (!candidates.length) {
                // 大儒等極端設定可能太嚴苛：降回格式 A 再試
                candidates = POEMS.filter(p => Array.isArray(p.content) && p.content.length >= 2);
                this.currentFormat = 'A';
            }
            if (!candidates.length) return false;

            const poem = candidates[Math.floor(Math.random() * candidates.length)];
            this.currentPoem = poem;
            const content = poem.content;

            // 隨機挑起始 index（讓題目在詩中不同段落取樣）
            const maxStart = Math.max(0, content.length - (this.currentFormat === 'C' ? 4 : this.currentFormat === 'B' ? 3 : 2));
            // 偏好從偶數 index 起（讓成雙成對的詩句對仗完整），若不行退回 0
            let startIdx = maxStart > 0 ? (Math.floor(Math.random() * (Math.floor(maxStart / 2) + 1)) * 2) : 0;
            if (startIdx > maxStart) startIdx = maxStart;

            // 依格式抽取可見句與隱藏句
            let visibleLines, hiddenLine, hiddenPosition;
            if (this.currentFormat === 'A') {
                // A：顯示第 2 句，隱藏第 1 句
                hiddenLine = content[startIdx];
                visibleLines = [content[startIdx + 1]];
                hiddenPosition = 'top';
            } else if (this.currentFormat === 'B') {
                // B：顯示第 1+2 句，隱藏第 3 句
                visibleLines = [content[startIdx], content[startIdx + 1]];
                hiddenLine = content[startIdx + 2];
                hiddenPosition = 'bottom';
            } else {
                // C：顯示第 3+4 句，隱藏第 2 句
                visibleLines = [content[startIdx + 2], content[startIdx + 3]];
                hiddenLine = content[startIdx + 1];
                hiddenPosition = 'middle';
            }

            this.visibleLines = visibleLines;
            this.hiddenLine = hiddenLine;
            this.hiddenPosition = hiddenPosition;
            // 對每一句可見句施加遮罩 ◎
            this.visibleMaskedHTML = visibleLines.map(line =>
                this._applyVisibleMask(line, s.minMaskCount || 0, s.maxMaskCount || 0)
            );

            // 產生 optionCount 個選項（正解 + 干擾）
            this.options = this._makeOptions(this.hiddenLine, s.optionCount);
            return true;
        },

        // 遮蔽字元邏輯（照抄 game20.applyVisibleMask 精簡版）
        _applyVisibleMask: function (line, minCount, maxCount) {
            const chars = line.split('');
            const validIndices = [];
            chars.forEach((c, i) => {
                if (!/[，。？！、：；]/.test(c)) validIndices.push(i);
            });
            const poemLen = validIndices.length;
            if (maxCount <= 0 || poemLen === 0) return chars.join('');

            const maxPossible = Math.max(0, poemLen - 1);   // 至少留 1 字
            const actualMin = Math.min(maxPossible, Math.max(0, minCount));
            const actualMax = Math.min(maxPossible, Math.max(actualMin, maxCount));
            const maskCount = Math.floor(Math.random() * (actualMax - actualMin + 1)) + actualMin;
            if (maskCount <= 0) return chars.join('');

            // 依詩句字數與遮蔽數量決定「起始遮蔽位置」— 前段 / 後段擇一
            const range = (s, e) => { const a = []; for (let i = s; i < e; i++) a.push(i); return a; };
            const patternA = range(0, Math.min(maskCount, maxPossible));                       // 前 N
            const patternB = range(Math.max(0, poemLen - maskCount), poemLen);                 // 後 N
            const pick = Math.random() < 0.5 ? patternA : patternB;
            const maskedSet = new Set(pick.map(pi => validIndices[pi]));

            return chars.map((c, i) =>
                maskedSet.has(i) ? `<span class="hidden-char" data-char="${c}">－</span>` : c
            ).join('');
        },

        _makeOptions: function (correct, count) {
            const pool = new Set();
            pool.add(correct);
            const targetLen = correct.replace(/[，。？！、：；]/g, '').length;

            // 從其他詩中撈相似字數句子
            const shuffled = POEMS.slice().sort(() => Math.random() - 0.5);
            for (const p of shuffled) {
                if (pool.size >= count) break;
                if (!p.content) continue;
                for (const line of p.content) {
                    if (pool.size >= count) break;
                    if (line === correct) continue;
                    const len = line.replace(/[，。？！、：；]/g, '').length;
                    if (Math.abs(len - targetLen) <= 1) pool.add(line);
                }
            }
            // 保底：字數不合也硬塞
            for (const p of shuffled) {
                if (pool.size >= count) break;
                if (!p.content) continue;
                for (const line of p.content) {
                    if (pool.size >= count) break;
                    if (line !== correct) pool.add(line);
                }
            }

            const arr = Array.from(pool).slice(0, count);
            // 洗牌
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        },

        _render: function () {
            // 詩詞資訊
            const info = this.overlay.querySelector('#examPoemInfo');
            info.textContent = `${this.currentPoem.dynasty || ''} · ${this.currentPoem.author || '佚名'} · ${this.currentPoem.title || ''}`;

            // 題目：依 A/B/C 格式決定「可見句 + 佔位欄」的排列順序（同 game20）
            const q = this.overlay.querySelector('#examQuestion');
            q.innerHTML = '';

            const slotHTML = this._buildSlotHTML(this.hiddenPosition);
            const visibleHTMLs = this.visibleMaskedHTML.map((html, i) =>
                this._buildVisibleLineHTML(html, this.visibleLines[i])
            );

            let lineNodes;
            if (this.hiddenPosition === 'top') {
                // A：佔位欄在上，可見句在下
                lineNodes = [slotHTML, visibleHTMLs[0]];
            } else if (this.hiddenPosition === 'bottom') {
                // B：可見句 1, 2 在上，佔位欄在下
                lineNodes = [visibleHTMLs[0], visibleHTMLs[1], slotHTML];
            } else {
                // C：佔位欄夾在兩可見句之間
                lineNodes = [visibleHTMLs[0], slotHTML, visibleHTMLs[1]];
            }
            q.innerHTML = lineNodes.join('');

            // 選項按鈕
            const opts = this.overlay.querySelector('#examOptions');
            opts.innerHTML = '';
            this.options.forEach(text => {
                const b = document.createElement('button');
                b.className = 'exam-option';
                b.type = 'button';
                b.textContent = text;
                // 依字數自動縮字
                const len = text.length;
                const fontSize = len <= 7 ? 40 : len <= 9 ? 35 : 30;
                b.style.fontSize = fontSize + 'px';
                b.onclick = () => this._onAnswer(b, text);
                opts.appendChild(b);
            });
        },

        // 建立可見句節點（字級依字數自動縮）
        _buildVisibleLineHTML: function (maskedHTML, originalLine) {
            const cleanLen = originalLine.replace(/[，。？！、：；]/g, '').length;
            const baseSize = 45;
            const threshold = 7;
            const size = cleanLen > threshold
                ? Math.max(28, Math.floor(baseSize * threshold / cleanLen))
                : baseSize;
            return `<div class="exam-poem-line" style="font-size:${size}px;">${maskedHTML}</div>`;
        },

        // 建立隱藏句佔位欄（呼吸虛線框 + 方向提示）
        _buildSlotHTML: function (hiddenPos) {
            const hint = hiddenPos === 'top' ? '↑ 猜這一句'
                : hiddenPos === 'bottom' ? '↓ 猜這一句'
                    : '？ 猜中間句';
            return `<div class="exam-hidden-slot" data-pos="${hiddenPos}">
                        <span class="exam-slot-hint">${hint}</span>
                    </div>`;
        },

        _startTimer: function () {
            this.timerLeft = this.settings.secPerQ * 1000;
            const maxMs = this.timerLeft;
            if (this.timerHandle) clearInterval(this.timerHandle);

            // 先呼叫一次以計算 SVG 尺寸並將邊框拉滿
            this.updateTimerRing(1);

            const tick = 100;
            this.timerHandle = setInterval(() => {
                if (this.isBusy) return;
                this.timerLeft -= tick;
                const ratio = Math.max(0, this.timerLeft / maxMs);
                this.updateTimerRing(ratio);
                if (this.timerLeft <= 0) {
                    clearInterval(this.timerHandle);
                    this.timerHandle = null;
                    this._onTimeout();
                }
            }, tick);
        },

        // 抄襲 game1.updateTimerRing：SVG rect 順時針縮短，並依剩餘比例插值暗紅→鮮紅
        updateTimerRing: function (ratio) {
            const rect = this.overlay.querySelector('#examTimerPath');
            const container = this.overlay.querySelector('#examOptionsContainer');
            if (!rect || !container) return;

            const w = container.offsetWidth;
            const h = container.offsetHeight;
            const svg = this.overlay.querySelector('#examTimerRing');
            svg.setAttribute('width', w);
            svg.setAttribute('height', h);

            // stroke-width:8 → rect 內縮 8 (兩側各 4)
            const rw = w - 8;
            const rh = h - 8;
            if (rw < 0 || rh < 0) return;
            rect.setAttribute('width', rw);
            rect.setAttribute('height', rh);

            const perimeter = (rw + rh) * 2;
            const clamped = Math.max(0, Math.min(1, ratio));
            rect.style.strokeDasharray = perimeter;
            // 消逝時間 = 1 - clamped；offset 表示「已消逝的部分」
            rect.style.strokeDashoffset = perimeter * clamped;
            // 暗紅 → 鮮紅（越接近時間到越紅）
            const elapsed = 1 - clamped;
            rect.style.stroke = `hsl(0, ${Math.round(50 + 40 * elapsed)}%, ${Math.round(22 + 32 * elapsed)}%)`;
        },

        _onAnswer: function (btn, text) {
            if (this.isBusy) return;
            this.isBusy = true;
            if (this.timerHandle) { clearInterval(this.timerHandle); this.timerHandle = null; }

            // 禁用所有選項
            this.overlay.querySelectorAll('.exam-option').forEach(b => b.disabled = true);

            if (text === this.hiddenLine) {
                btn.classList.add('correct');
                // 答對：揭曉題目中被遮蔽的字（改綠色顯示原字）
                this._revealMaskedChars();
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                // 短暫過場後下一題
                setTimeout(() => {
                    this.qIndex++;
                    this.isBusy = false;
                    this._nextQuestion();
                }, 800);
            } else {
                btn.classList.add('wrong');
                // 顯示正解
                this.overlay.querySelectorAll('.exam-option').forEach(b => {
                    if (b.textContent === this.hiddenLine) b.classList.add('correct');
                });
                if (window.SoundManager) window.SoundManager.playFailure && window.SoundManager.playFailure();
                this._loseHeart(() => {
                    this.qIndex++;
                    this.isBusy = false;
                    this._nextQuestion();
                }, 1200);
            }
        },

        _onTimeout: function () {
            if (this.isBusy) return;
            this.isBusy = true;
            this.overlay.querySelectorAll('.exam-option').forEach(b => {
                b.disabled = true;
                if (b.textContent === this.hiddenLine) b.classList.add('correct');
            });
            this._loseHeart(() => {
                this.qIndex++;
                this.isBusy = false;
                this._nextQuestion();
            }, 1200);
        },

        _loseHeart: function (cb, delay) {
            this.heartsLeft = Math.max(0, this.heartsLeft - 1);
            this._renderHearts();
            setTimeout(cb, delay || 800);
        },

        // 答對後把題目全部揭曉：
        //   (1) 可見句被遮罩的 ◎ 還原成原字（綠色）
        //   (2) 佔位欄的「？ 猜這一句」改成顯示正解全句（綠色）
        _revealMaskedChars: function () {
            if (!this.overlay) return;

            // (1) 揭曉可見句中的遮罩字
            const chars = this.overlay.querySelectorAll('#examQuestion .hidden-char');
            chars.forEach(el => {
                const orig = el.getAttribute('data-char');
                if (orig) el.textContent = orig;
                el.classList.add('exam-revealed-char');
            });

            // (2) 揭曉佔位欄 → 顯示正解全句
            const slot = this.overlay.querySelector('#examQuestion .exam-hidden-slot');
            if (slot) {
                slot.classList.add('exam-slot-revealed');
                slot.innerHTML = `<span class="exam-slot-answer">${this.hiddenLine}</span>`;
            }
        },

        // ─────────────────────────────────────────────
        // 結局
        // ─────────────────────────────────────────────
        _pass: function () {
            if (this.timerHandle) { clearInterval(this.timerHandle); this.timerHandle = null; }
            const rankName = this.rank.name;
            const attemptNo = this._getAttemptNumber();

            // ── 測試模式：不寫任何資料 ──
            if (!this._isTestMode) {
                // 寫入江南小院存檔
                const coll = window.FMCollectionSave.load();
                if (!coll.ranks) coll.ranks = { passed: [] };
                if (!coll.ranks.passed.includes(rankName)) coll.ranks.passed.push(rankName);
                if (!coll.examStats) coll.examStats = window.FMCollectionSave.emptyExamStats();
                if (!coll.examStats[rankName]) coll.examStats[rankName] = { passCount: 0, failCount: 0, lastAttemptTs: 0 };
                coll.examStats[rankName].passCount++;
                coll.examStats[rankName].lastAttemptTs = Date.now();
                if (!Array.isArray(coll.examLog)) coll.examLog = [];
                coll.examLog.push({ rank: rankName, ts: Date.now(), pass: true, attemptNo: attemptNo });
                window.FMCollectionSave.save(coll);

                // game_logs（若接雲端 LOG）
                if (window.SupabaseClient && typeof window.SupabaseClient.logGame === 'function') {
                    window.SupabaseClient.logGame({
                        gameNo: 99, difficulty: rankName, score: 0, isWin: true, durationS: 0
                    });
                }
            }

            if (window.SoundManager) window.SoundManager.playJoyfulTriple && window.SoundManager.playJoyfulTriple();

            const isTest = this._isTestMode;
            this._showResultDialog({
                title: isTest ? '【測試】金榜題名' : '金榜題名',
                lines: isTest
                    ? [`（測試模式）已通過「${rankName}」考試，未寫入任何資料。`]
                    : [
                        `恭賀！第 ${attemptNo} 次挑戰「${rankName}」，終得中式。`,
                        '請至「成就與紀錄 → 總覽」領取獎狀，正式冊封文位。'
                    ],
                btnText: isTest ? '關閉' : '返回【成就與紀錄】',
                onClose: () => {
                    this._close();
                    if (isTest) return;
                    // 正式模式：通過後直接開成就與紀錄，讓玩家立刻領獎狀
                    if (window.AchievementDialog && window.AchievementDialog.show) {
                        window.AchievementDialog.show();
                    } else if (this.callbacks.onPass) {
                        this.callbacks.onPass();
                    }
                }
            });
        },

        _fail: function () {
            if (this.timerHandle) { clearInterval(this.timerHandle); this.timerHandle = null; }
            const rankName = this.rank.name;
            const attemptNo = this._getAttemptNumber();

            // ── 測試模式：不寫任何資料 ──
            if (!this._isTestMode) {
                const coll = window.FMCollectionSave.load();
                if (!coll.examStats) coll.examStats = window.FMCollectionSave.emptyExamStats();
                if (!coll.examStats[rankName]) coll.examStats[rankName] = { passCount: 0, failCount: 0, lastAttemptTs: 0 };
                coll.examStats[rankName].failCount++;
                coll.examStats[rankName].lastAttemptTs = Date.now();
                if (!Array.isArray(coll.examLog)) coll.examLog = [];
                coll.examLog.push({ rank: rankName, ts: Date.now(), pass: false, attemptNo: attemptNo });
                window.FMCollectionSave.save(coll);

                if (window.SupabaseClient && typeof window.SupabaseClient.logGame === 'function') {
                    window.SupabaseClient.logGame({
                        gameNo: 99, difficulty: rankName, score: 0, isWin: false, durationS: 0
                    });
                }
            }

            if (window.SoundManager) window.SoundManager.playSadTriple && window.SoundManager.playSadTriple();

            const encouragements = ['柳暗花明又一村', '捲土重來未可知', '長風破浪會有時', '莫道桑榆晚'];
            const title = encouragements[Math.floor(Math.random() * encouragements.length)];

            const isTest = this._isTestMode;
            this._showResultDialog({
                title: isTest ? '【測試】未第' : title,
                lines: isTest
                    ? [`（測試模式）「${rankName}」考試落榜，未寫入任何資料。`]
                    : [
                        `本次未第。這是您第 ${attemptNo} 次挑戰「${rankName}」。`,
                        '天將降大任，此不足懼。學海無涯，再接再厲。'
                    ],
                btnText: isTest ? '關閉' : '返回江南小院',
                onClose: () => {
                    this._close();
                    if (isTest) return;
                    if (this.callbacks.onFail) this.callbacks.onFail();
                }
            });
        },

        _showResultDialog: function (opts) {
            // 覆蓋於 examOverlay 之上的結果彈窗（樣式定義於 exam.css）
            const mask = document.createElement('div');
            mask.className = 'exam-result-mask';

            const box = document.createElement('div');
            box.className = 'exam-result-box';

            const h = document.createElement('div');
            h.className = 'exam-result-title';
            h.textContent = opts.title;
            box.appendChild(h);

            opts.lines.forEach(text => {
                const p = document.createElement('div');
                p.className = 'exam-result-line';
                p.textContent = text;
                box.appendChild(p);
            });

            const btn = document.createElement('button');
            btn.className = 'exam-result-btn';
            btn.type = 'button';
            btn.textContent = opts.btnText || '關閉';
            btn.onclick = () => {
                mask.remove();
                if (opts.onClose) opts.onClose();
            };
            box.appendChild(btn);
            mask.appendChild(box);
            this.overlay.appendChild(mask);
        },

        _close: function () {
            if (this.timerHandle) { clearInterval(this.timerHandle); this.timerHandle = null; }
            if (this.overlay) this.overlay.style.display = 'none';
            document.body.classList.remove('overlay-active');
        },

        stopGame: function () { this._close(); },

        // ─────────────────────────────────────────────
        // 測試模式：Alt+E 開啟文位選擇彈窗
        //   點擊任一文位 → 進入該考試（TEST 模式，不寫任何存檔、雲端、log）
        // ─────────────────────────────────────────────
        _isTestMode: false,

        startTest: function (rankName) {
            this._isTestMode = true;
            this.start({ name: rankName, minScore: 0 }, {
                onPass: () => { this._isTestMode = false; },
                onFail: () => { this._isTestMode = false; }
            });
        },

        showTestPicker: function () {
            const existing = document.getElementById('examTestPicker');
            if (existing) { existing.remove(); return; }

            // 確保 exam.css 已載入（測試彈窗與主遊戲共用同一份樣式）
            this._loadCSS();

            const ranks = ['大儒', '狀元', '榜眼', '探花', '進士', '貢士', '舉人', '秀才', '文童', '府案首', '縣案首'];

            // 對齊 500×850 舞台，位置與縮放由 registerOverlayResize 動態套用
            const wrap = document.createElement('div');
            wrap.id = 'examTestPicker';

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    wrap.style.left = r.left + 'px';
                    wrap.style.top = r.top + 'px';
                    wrap.style.transform = 'scale(' + r.scale + ')';
                    wrap.style.transformOrigin = 'top left';
                });
            }

            const title = document.createElement('div');
            title.className = 'exam-test-picker-title';
            title.textContent = '【測試】選擇考試文位';
            wrap.appendChild(title);

            const sub = document.createElement('div');
            sub.className = 'exam-test-picker-sub';
            sub.textContent = '此模式不會寫入任何資料（Alt+E 再按一次關閉）';
            wrap.appendChild(sub);

            ranks.forEach(name => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'exam-test-picker-btn';
                b.textContent = name;
                b.onclick = () => {
                    wrap.remove();
                    this.startTest(name);
                };
                wrap.appendChild(b);
            });

            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'exam-test-picker-cancel';
            close.textContent = '取消';
            close.onclick = () => wrap.remove();
            wrap.appendChild(close);

            document.body.appendChild(wrap);
        }
    };

    window.Exam = Exam;

    // 全域熱鍵：Alt+E 開啟測試選擇彈窗
    document.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'e' || e.key === 'E')) {
            e.preventDefault();
            Exam.showTestPicker();
        }
    });
})();
