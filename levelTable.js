/* ==========================================================================
   花月 · 跨遊戲共用關卡表 執行期查表模組 (levelTable.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路與關卡模式_企畫書.md
     第五章 步驟② 跨遊戲共用關卡表
     第五章 步驟③ 逐遊戲驗證 + B 案（同題目群內重選）

   ── 這個模組解決什麼問題 ──────────────────────────────────────────────
   改版前：script.js 的 getSharedRandomPoem 會把 gameKey 混入隨機種子
           （見該檔「融入遊戲 ID (gameKey) 進入種子」段落），
           因此 game1 的第 5 關和 game13 的第 5 關是「不同的詩」。
   改版後：關卡模式下改由本模組查表，讓所有遊戲的「小學第 3 關」
           都指向同一組詩句 —— 這就是「同一首詩派給不同遊戲練習」。

   ── B 案：驗證失敗時怎麼辦 ────────────────────────────────────────────
   各遊戲對題目的行數／字數需求差異很大（例如有些遊戲要 8 句 56 字，
   有些只要 2 句 10 字），關卡表錨定的那組詩句不一定每款遊戲都能用。
   此時**不是**整關跳過該遊戲，而是在「同一個詩詞題目群」的範圍內
   改挑其他詩句給那款遊戲用 —— 複習的仍然是同一批詩。
   候選順序完全決定性（錨定詩→群內其他詩，起始句由小到大），
   確保同一玩家、同一遊戲、同一關永遠拿到同一題。

   ⚠️ 刻意不套用 line_ratings 過濾：
      關卡模式下「這一關該學哪首詩」是由課程設計決定的，
      不該再被評價門檻二次篩掉，否則會與固定指派互相打架。
   ========================================================================== */

(function () {
    'use strict';

    // 標點符號正則 —— 必須與 script.js 的 getSharedRandomPoem 完全一致
    const PUNCT = /[，。？！、：；「」『』\s]/g;
    const cleanLine = (s) => (s || '').replace(PUNCT, '');

    const LevelTable = {
        // 關卡模式的當前情境（由 level-selector.js／learningPath.js 設定）
        // 形如 { tier: '小學', levelIndex: 3 }；非關卡模式時為 null
        _context: null,

        // Node 環境（驗證腳本）用的詩詞資料注入點；瀏覽器環境直接用全域 POEMS
        _poems: null,
        _table: null,

        /** 取得詩詞資料（瀏覽器用全域 POEMS，Node 用注入的資料） */
        getPoems: function () {
            if (this._poems) return this._poems;
            return (typeof POEMS !== 'undefined') ? POEMS : [];
        },

        /** 取得關卡表（瀏覽器用全域 LEVEL_TABLE，Node 用注入的資料） */
        getTable: function () {
            if (this._table) return this._table;
            return (typeof LEVEL_TABLE !== 'undefined') ? LEVEL_TABLE : null;
        },

        /** Node 環境注入資料用 */
        inject: function (poems, table) {
            this._poems = poems;
            this._table = table;
        },

        // ── 關卡情境管理 ─────────────────────────────────────────────────
        // 遊戲呼叫 getSharedRandomPoem 時只會傳入 seed（= 關卡編號）與 gameKey，
        // 並不會傳入難度層，因此難度層改由這裡的情境提供。

        /** 進入關卡模式時設定情境 */
        setContext: function (tier, levelIndex) {
            this._context = { tier: tier, levelIndex: levelIndex };
        },

        /** 離開關卡模式（回到隨機練習）時清除情境 */
        clearContext: function () {
            this._context = null;
        },

        getContext: function () {
            return this._context;
        },

        /** 該難度層共有幾關 */
        getLevelCount: function (tier) {
            const table = this.getTable();
            if (!table || !table.tiers[tier]) return 0;
            return table.tiers[tier].levels.length;
        },

        /**
         * 取得某一關所屬的詩詞題目群（回傳 poem id 陣列）。
         * 學習道路用它來判斷「這一站和上一站是不是同一群詩」。
         */
        getClusterPoemIds: function (tier, levelIndex) {
            const table = this.getTable();
            if (!table || !table.tiers[tier]) return [];
            const entry = table.tiers[tier].levels[levelIndex - 1];
            if (!entry) return [];
            return table.tiers[tier].clusters[entry.c] || [];
        },

        /**
         * 取得某一關的原始資料 { p: 錨定詩 id, s: 起始句索引, c: 題目群索引 }。
         * 青雲梯用 s 去查該關起始句的「詩句評價」，藉此挑出必通關卡。
         */
        getLevelEntry: function (tier, levelIndex) {
            const table = this.getTable();
            if (!table || !table.tiers[tier]) return null;
            return table.tiers[tier].levels[levelIndex - 1] || null;
        },

        /**
         * 取得某難度層「依關卡順序排列的不重複詩詞 id」。
         * 學習道路用它把詩詞分配給各個文位站（每站 2~3 首）。
         */
        getTierPoemOrder: function (tier) {
            const table = this.getTable();
            if (!table || !table.tiers[tier]) return [];
            const seen = {};
            const order = [];
            table.tiers[tier].levels.forEach(lv => {
                if (!seen[lv.p]) { seen[lv.p] = true; order.push(lv.p); }
            });
            return order;
        },

        /**
         * 取得「錨定詩屬於指定詩詞清單」的所有關卡編號（自 1 起算）。
         * 學習道路的一個文位站只在自己那 2~3 首詩的關卡裡循環出題，
         * 玩家因此會反覆遇到同一小批詩，而不是一路往下讀新詩。
         */
        getLevelsForPoems: function (tier, poemIds) {
            const table = this.getTable();
            if (!table || !table.tiers[tier]) return [];
            const want = {};
            (poemIds || []).forEach(id => { want[id] = true; });
            const out = [];
            table.tiers[tier].levels.forEach((lv, i) => {
                if (want[lv.p]) out.push(i + 1);
            });
            return out;
        },

        /**
         * 檢查某首詩自 startIdx 起的連續 minLines 句，是否符合該遊戲的題目需求。
         * 判定邏輯刻意與 script.js 的 getValidStarts 保持一致（除了不查 line_ratings）。
         * @returns {boolean}
         */
        _isValidStart: function (poem, startIdx, req) {
            const content = poem.content || [];
            if (startIdx + req.minLines > content.length) return false;

            let charCount = 0;
            let combinedText = '';
            for (let j = 0; j < req.minLines; j++) {
                const clean = cleanLine(content[startIdx + j]);
                if (clean.length === 0) return false;  // 空句（多為分段標記）不可用
                charCount += clean.length;
                combinedText += clean;
            }

            if (req.keyword && combinedText.indexOf(req.keyword) === -1) return false;
            return charCount >= req.minChars && charCount <= req.maxChars;
        },

        /**
         * 自 startIdx 起，依「兩句一聯」往下擴充到該遊戲允許的最大行數／字數。
         * 擴充邏輯與 script.js 的 getSharedRandomPoem 一致，確保關卡模式與
         * 隨機模式產出的題目長度規則相同。
         * @returns {string[]} 去除標點後的乾淨句子陣列
         */
        _expandLines: function (poem, startIdx, req) {
            const content = poem.content || [];
            let selectedLineCount = req.minLines;
            let currentChars = 0;

            for (let j = 0; j < req.minLines; j++) {
                currentChars += cleanLine(content[startIdx + j]).length;
            }

            while (startIdx + selectedLineCount + 1 < content.length &&
                   selectedLineCount + 2 <= req.maxLines) {
                const c1 = cleanLine(content[startIdx + selectedLineCount]);
                const c2 = cleanLine(content[startIdx + selectedLineCount + 1]);
                if (c1.length === 0 || c2.length === 0) break;
                if (currentChars + c1.length + c2.length > req.maxChars) break;
                currentChars += c1.length + c2.length;
                selectedLineCount += 2;
            }

            const lines = [];
            for (let li = 0; li < selectedLineCount; li++) {
                const clean = cleanLine(content[startIdx + li]);
                if (clean.length > 0) lines.push(clean);
            }
            return lines;
        },

        /**
         * 【核心】解析出某一關給某款遊戲用的題目。
         *
         * @param {string} tier       難度層（'小學'~'研究所'）
         * @param {number} levelIndex 關卡編號（自 1 起算）
         * @param {object} req        該遊戲的題目需求
         *        { minLines, maxLines, minChars, maxChars, keyword }
         * @returns {{poem:object, lines:string[], startIndex:number, fallback:string}|null}
         *          fallback: 'anchor'      = 用了關卡表錨定的那組詩句（理想情況）
         *                    'same-poem'   = 錨定詩句不合用，改用同一首詩的其他句
         *                    'same-cluster'= 改用同題目群的其他詩（B 案）
         *          若整個題目群都無法滿足該遊戲需求則回傳 null，
         *          由呼叫端（script.js）退回原本的隨機選詩邏輯。
         */
        resolve: function (tier, levelIndex, req) {
            const table = this.getTable();
            if (!table || !table.tiers[tier]) return null;

            const tierData = table.tiers[tier];
            const entry = tierData.levels[levelIndex - 1];
            if (!entry) return null;

            const poems = this.getPoems();
            const byId = {};
            for (let i = 0; i < poems.length; i++) byId[poems[i].id] = poems[i];

            const anchorPoem = byId[entry.p];
            const clusterIds = tierData.clusters[entry.c] || [];

            // ── 候選順序（完全決定性，確保同一關永遠出同一題）──────────
            // 1. 錨定詩 + 錨定起始句      → fallback: 'anchor'
            // 2. 錨定詩 + 其他起始句（遞增）→ fallback: 'same-poem'
            // 3. 同題目群其他詩（依群內順序）+ 起始句遞增 → fallback: 'same-cluster'
            const candidates = [];

            if (anchorPoem) {
                candidates.push({ poem: anchorPoem, start: entry.s, kind: 'anchor' });
                const content = anchorPoem.content || [];
                for (let s = 0; s + 1 < content.length; s += 2) {
                    if (s !== entry.s) {
                        candidates.push({ poem: anchorPoem, start: s, kind: 'same-poem' });
                    }
                }
            }

            for (const pid of clusterIds) {
                if (pid === entry.p) continue;          // 錨定詩已在上面排過
                const p = byId[pid];
                if (!p) continue;
                const content = p.content || [];
                for (let s = 0; s + 1 < content.length; s += 2) {
                    candidates.push({ poem: p, start: s, kind: 'same-cluster' });
                }
            }

            for (const cand of candidates) {
                if (this._isValidStart(cand.poem, cand.start, req)) {
                    return {
                        poem: cand.poem,
                        lines: this._expandLines(cand.poem, cand.start, req),
                        startIndex: cand.start,
                        fallback: cand.kind
                    };
                }
            }

            // 整群皆不合用 —— 交由呼叫端退回隨機選詩，遊戲不會因此卡死
            return null;
        }
    };

    // 瀏覽器環境掛載至全域
    if (typeof window !== 'undefined') window.LevelTable = LevelTable;
    // Node 環境（tools/verify_level_table.js）匯出
    if (typeof module !== 'undefined' && module.exports) module.exports = LevelTable;
})();
