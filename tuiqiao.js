/* ============================================================================
 * tuiqiao.js — 詩仙推敲（自動推盤成詩．視覺療癒頁）
 * ----------------------------------------------------------------------------
 * 一頁純舒壓介面（非遊戲、無計分、無勝負、無時間限制）。
 *
 * 【畫面構成】
 *   類似「數字推盤」：整首詩被拆成一格一格的彩色圓角方塊，缺一格當作空位。
 *   盤面先被完全打亂，接著二頭身的李白會跳到方塊旁邊，一格一格把字推回原位，
 *   直到整首詩重新拼好。玩家什麼都不用做，看著李白努力推就好。
 *
 *   盤面尺寸（寬×高，寬＝句數、高＝每句字數）：
 *     4×5 五言絕句 ／ 4×7 七言絕句 ／ 8×5 五言律詩 ／ 8×7 七言律詩
 *   文字依古典習慣直排、由右至左，每一句一個顏色（沿用三字成珠的圓角方塊語彙）。
 *
 * 【自動解法（本檔最關鍵的部分）】
 *   採用「逐層歸位」(layered solving)，也就是人類解推盤的標準手法：
 *     1. 由上而下解列，直到只剩 2 列
 *     2. 改由左而右解行，直到只剩 2 行
 *     3. 最後的 2×2 用旋轉解開
 *   ⭐ 內部座標刻意轉置成「[句][字]」：解法器的一「列」正好就是詩的一「句」、
 *      一「行」正好是每句的第幾字。於是「這一輪要收哪一條邊」就直接決定了畫面上
 *      詩被拼出來的節奏，每一輪隨機挑一種，不會每次都同一套表演：
 *        一句一句依序完成（正序／倒序）── 節奏分明、每完成一句就慶祝一次
 *        一個字一個字橫向完成（正序／倒序）── 各句同時慢慢長出來，最後一起完成，
 *          會有「啊，竟然拼好了」的驚訝感
 *        由外圍繞圈往中心收（順時針／逆時針／從底邊起）── 四周先成形、中間最後解開
 *        上下交替、左右交替 ── 兩端往中間夾
 *      再加上左右鏡射（決定從哪個角落起手），共 18 種表演組合。
 *
 *   ⚠️ 空格死角：解列尾／行尾時，角落那兩格會被「已解好的列」與「正在搬運的字」
 *      包夾成只有單一出入口的口袋，BFS 會找不到路徑而卡死。實測「先擺 A」與
 *      「先擺 B」兩種順序各自都有解不開的盤面，沒有單純的擺放順序能完全避開。
 *      因此改用「快照 → 失敗就還原盤面、隨機擾動幾步再重試」，擾動幅度隨重試
 *      次數遞增。此解法已用 16000 組隨機盤面（4 種尺寸各 2000 組，含轉置前後）
 *      全數驗證：每一步都合法、且最後必定完全歸位。
 *
 * 【缺的那一格】
 *   直接採用「本輪風格最後收尾的那個 2×2 之中的一格」。因此目標盤面就是單純的
 *   board[i] === i，不需要額外把空格沿路徑推來推去；而且缺格位置會隨著風格自然
 *   落在不同地方（繞圈風格會落在盤面中央，一句一句風格則落在最後收的那一句）。
 *
 * 慣例：所有 CSS class 加 tuiqiao- 前綴；overlay 掛於 document.body（非 #stage，
 *       因 stage 有 transform 會造成 position:fixed 二次縮放）；透過
 *       registerOverlayResize 同步舞台縮放；window.TuiQiao 掛全域供 menu.js 呼叫。
 * ========================================================================== */

(function () {
    'use strict';

    // ── 邏輯舞台尺寸（與 screen_adaptive 一致）──
    const STAGE_W = 500;
    const STAGE_H = 850;

    // ============================================================
    // ⭐【推動節奏】調整這裡就能改變李白推方塊的快慢
    //    每推一格的總時間 = windupMs（蓄力）+ tileMoveMs（方塊滑動）+ settleMs（停頓）
    //    數值單位皆為毫秒(ms)。想更慢就把三個值一起放大。
    // ============================================================
    const SPEED_PRESETS = {
        slow: { label: '慢', windupMs: 150, tileMoveMs: 430, settleMs: 100 },  // 每格 680ms
        normal: { label: '中', windupMs: 100, tileMoveMs: 260, settleMs: 50 },   // 每格 410ms
        fast: { label: '快', windupMs: 55, tileMoveMs: 140, settleMs: 20 },   // 每格 215ms
    };
    const DEFAULT_SPEED = 'normal';

    // ⭐ 其他可調時間（毫秒）
    const TELEPORT_MS = 130;    // 李白瞬間移動的淡入淡出時間
    const LOCK_FLASH_MS = 520;    // 方塊歸位時的金光閃爍時間
    const LINE_CELEBRATE_MS = 900;    // 一句完成時的慶祝動畫時間
    const FINISH_HOLD_MS = 2600;   // 全部完成後停留多久才顯示「再來一首」
    const AUTO_NEXT_MS = 9000;   // 自動換下一首的等待時間（設為 0 則不自動換）

    // ⭐ 打亂強度：每格平均打亂幾步（越大越亂、解起來越久）
    const SCRAMBLE_PER_CELL = 30;

    // ⭐【開局進場】答案方塊由小放大的出場動畫。ENTRANCE_WINDOW_MS 是「所有方塊
    // 開始出場的時間」壓縮進多長的窗口（依左上→右下順序平均分配），越大越有
    // 明顯的接力感；ENTRANCE_TILE_MS 是單一方塊自己放大的時間。
    const ENTRANCE_WINDOW_MS = 650;
    const ENTRANCE_TILE_MS = 420;

    // ⭐【開局思考停頓】所有方塊都放大到定位、完全靜止不動的時間，讓玩家先看清楚
    // 打亂後的盤面、大腦轉一轉「這該怎麼解」，再開始看李白動手推。
    const THINK_PAUSE_MS = 3000;

    // ⭐【小範圍打亂】除了整盤打亂，也不時只讓少數方塊「看起來」跑錯位置，讓舒壓
    // 的節奏有變化。LIGHT_SCRAMBLE_CHANCE 是觸發這種打亂的機率（其餘仍是整盤打亂）。
    //
    // ⚠️ 這裡的設計目標，來自實測後修正過一次的理解，記錄下來避免重蹈覆轍：
    //    最早的版本是「把打亂侷限在缺格周圍一塊小區域內」（例如 2×2、橫排）。
    //    問題是：解題演算法對「已經在正確位置」的格子完全是零成本跳過
    //    （moveTileTo 一發現已經在目標格就直接不做事），所以只要打亂範圍夠小、
    //    夠集中，解開它需要的步數也會跟著很少——實測 2×2 只打亂 4 格，平均
    //    6 步就解完，這剛好跟目的相反：玩家一眼看出「只有旁邊幾格亂了」，
    //    結果真的沒兩下就解完，一點都不「看似容易其實不簡單」。
    //
    //    真正的關鍵在於「亂掉的幾個方塊彼此隔多遠」，不在於「亂掉幾個」。
    //    只要那幾個看起來錯位的方塊分散在盤面不同角落，即使數量很少（3～4
    //    個），解題時空格也必須實際橫跨大半個盤面去把每一個拖回家，過程中
    //    會暫時打亂沿途一大串本來已經對的格子、再逐一復原——這正是使用者
    //    描述的「你可以移動任何方格來達成，很可能要移動非常多格子，重點是
    //    看似容易其實很難」。
    //
    //    做法：不再用「侷限範圍的隨機走」去產生打亂盤面，而是直接在目標
    //    （已解好）盤面上，對「分散在不同象限」的幾個格子做一次奇偶性合法
    //    的重排——3 個格子一組循環（3-cycle）或兩組互換（兩個不相交的
    //    對調），兩者都是偶排列，數學上保證可以只靠合法滑動、且空格能回到
    //    原位而達成（不可能只單獨對調兩個格子：那是奇排列，就是經典「14-15
    //    拼圖不可解」的證明）。至於解題步驟該怎麼繞，仍然完全交給既有的
    //    solvePuzzle 演算法自己找路，不做任何特殊處理。
    const LIGHT_SCRAMBLE_CHANCE = 0.4;

    /** 依 (rs,cs) 落在盤面的哪個象限（0=左上 1=右上 2=左下 3=右下），用來確保
     *  挑選的格子彼此分散、不會擠在同一小塊裡。 */
    function quadrantBounds(q, rows, cols) {
        const rMid = Math.ceil(rows / 2), cMid = Math.ceil(cols / 2);
        return {
            r0: q < 2 ? 0 : rMid, r1: q < 2 ? rMid : rows,
            c0: q % 2 === 0 ? 0 : cMid, c1: q % 2 === 0 ? cMid : cols,
        };
    }

    /** 在指定象限內隨機挑一個尚未使用、且不是缺格的格子；挑不到回傳 null。 */
    function pickCellInQuadrant(q, rows, cols, exclude) {
        const b = quadrantBounds(q, rows, cols);
        const cand = [];
        for (let r = b.r0; r < b.r1; r++) for (let c = b.c0; c < b.c1; c++) {
            const cell = r * cols + c;
            if (!exclude.has(cell)) cand.push(cell);
        }
        return cand.length ? cand[Math.floor(Math.random() * cand.length)] : null;
    }

    /**
     * 建構一個「只有 3～4 個分散各處的方塊看起來錯位」的目標盤面，回傳
     * { label, board }；board 已經是完整的 N 長度打亂陣列（不需要再套用隨機
     * 走），board[cell] 是「目前站在這一格的方塊編號」。挑不出足夠分散的格子
     * （盤面太小）時回傳 null，呼叫端會自動退回整盤打亂。
     */
    function pickSparseSwapBoard(cols, rows, holeCell) {
        const quads = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
        const used = new Set([holeCell]);
        const cells = [];
        for (const q of quads) {
            const c = pickCellInQuadrant(q, rows, cols, used);
            if (c !== null) { cells.push(c); used.add(c); }
        }
        if (cells.length < 3) return null;   // 盤面太小、象限挑不出四個分散的格子

        const board = [];
        for (let i = 0; i < cols * rows; i++) board.push(i);

        if (cells.length >= 4 && Math.random() < 0.5) {
            // 兩組互換：4 個方塊看起來兩兩對調（偶排列＝兩個不相交的對調）
            const [a, b, c, d] = cells;
            board[a] = c; board[c] = a;
            board[b] = d; board[d] = b;
            return { label: 'twoSwaps', board };
        }
        // 三個一組循環：3 個方塊看起來循環錯位（偶排列＝單一 3-cycle）
        const [a, b, c] = cells;
        board[a] = c; board[c] = b; board[b] = a;
        return { label: 'threeCycle', board };
    }

    /**
     * 決定本輪要「整盤打亂」還是「少數方塊看似錯位」。
     * 回傳 null 代表整盤（沿用原本的隨機走演算法）；
     * 回傳 { label, board } 代表已經是建構好的完整打亂盤面，直接拿去解即可。
     */
    function pickLightScramble(cols, rows, holeCell) {
        if (Math.random() >= LIGHT_SCRAMBLE_CHANCE) return null;
        return pickSparseSwapBoard(cols, rows, holeCell);
    }

    // ── 盤面尺寸選項（寬＝句數 LINES，高＝每句字數 CHARS）──
    const BOARD_SIZES = [
        { key: '4x5', lines: 4, chars: 5, label: '五言絕句', sub: '4×5' },
        { key: '4x7', lines: 4, chars: 7, label: '七言絕句', sub: '4×7' },
        { key: '8x5', lines: 8, chars: 5, label: '五言律詩', sub: '8×5' },
        { key: '8x7', lines: 8, chars: 7, label: '七言律詩', sub: '8×7' },
    ];
    const DEFAULT_SIZE = '4x5';

    // ── 版面 ──
    const BOARD_AREA_TOP = 108;   // 盤面區域上緣（標題列下方）
    const BOARD_AREA_H = 596;   // 盤面區域可用高度
    const BOARD_MAX_W = 452;   // 盤面可用寬度
    const TILE_GAP = 4;     // 方塊間距

    const PUNCT_RE = /[，。？！、：；「」『』（）〈〉《》…—．,.\s]/g;

    // =====================================================================
    // 解法器（純函式，與畫面無關）
    // 盤面以一維陣列表示：board[i] = 方塊編號，目標盤面為 board[i] === i；
    // 空格是「編號等於缺格所在格子」的那一塊。回傳空格每一步移動到的格子索引。
    //
    // ⭐【表演風格】逐層歸位法本身並沒有規定「一定要從最上面那一列開始收」。
    //    這裡把「還沒解的子矩形」與「這一輪要收哪一條邊」抽象成一個 view（座標
    //    轉換函式），同一套演算法就能從任何一邊開始收，於是可以演出好幾種風格：
    //    一句一句完成／一個字一個字橫向完成／由外圍繞圈往中心收／上下交替…
    //    再加上左右鏡射決定起手角落，每一輪隨機挑一種，就不會每次都一樣。
    //
    //    ⚠️ 缺格位置直接採用「該風格最後收尾的 2×2 之中的一格」，不再另外把空格
    //       沿路徑推回去。這樣目標盤面就是單純的 board[i]===i，程式簡單很多，
    //       而且缺格會隨風格自然落在不同位置（繞圈風格會落在中間），變化更多。
    // ── view：把「子矩形 + 這次要解的邊」轉成統一的 (r,c) 座標 ──
    // view.cell(r,c) 回傳真實格子索引；view 的第 0 列永遠是「這次要解的那條邊」，
    // 第 1 列以下則是還可以自由操作的空間。
    function makeView(edge, r0, r1, c0, c1, cols, mirror) {
        const real = (r, c) => r * cols + c;
        const H0 = r1 - r0 + 1, W0 = c1 - c0 + 1;
        switch (edge) {
            case 'top':
                return { H: H0, W: W0, cell: (r, c) => real(r0 + r, mirror ? c1 - c : c0 + c) };
            case 'bottom':
                return { H: H0, W: W0, cell: (r, c) => real(r1 - r, mirror ? c1 - c : c0 + c) };
            case 'left':
                return { H: W0, W: H0, cell: (r, c) => real(mirror ? r1 - c : r0 + c, c0 + r) };
            case 'right':
                return { H: W0, W: H0, cell: (r, c) => real(mirror ? r1 - c : r0 + c, c1 - r) };
        }
        throw new Error('unknown edge ' + edge);
    }

    // ── 風格：決定每一輪要收哪一條邊 ──
    const STYLES = {
        lineByLine: { edges: ['top'] },
        lineByLineRev: { edges: ['bottom'] },
        charByChar: { edges: ['left'] },
        charByCharRev: { edges: ['right'] },
        ringCW: { edges: ['top', 'right', 'bottom', 'left'] },
        ringCCW: { edges: ['top', 'left', 'bottom', 'right'] },
        ringFromBottom: { edges: ['bottom', 'left', 'top', 'right'] },
        zigzag: { edges: ['top', 'bottom'] },
        zigzagLR: { edges: ['left', 'right'] },
    };

    /** 先模擬一次收邊順序，算出最後的 2×2 會落在哪裡（決定缺格位置） */
    function planPhases(cols, rows, styleKey, mirror) {
        const style = STYLES[styleKey];
        let r0 = 0, r1 = rows - 1, c0 = 0, c1 = cols - 1;
        const phases = [];
        let k = 0;
        while ((r1 - r0 + 1) > 2 && (c1 - c0 + 1) > 2) {
            const edge = style.edges[k % style.edges.length];
            k++;
            phases.push({ kind: 'edge', edge, r0, r1, c0, c1, mirror });
            if (edge === 'top') r0++;
            else if (edge === 'bottom') r1--;
            else if (edge === 'left') c0++;
            else c1--;
        }
        // 收尾：剩下 2 列（或 2 行）時，改成沿著它一格一格收到剩 2×2
        const tailEdge = (r1 - r0 + 1) === 2 ? 'top' : 'left';
        phases.push({ kind: 'tail', edge: tailEdge, r0, r1, c0, c1, mirror });

        // 最後的 2×2 = tail view 的最後兩列兩行
        const v = makeView(tailEdge, r0, r1, c0, c1, cols, mirror);
        const finalCells = [
            v.cell(v.H - 2, v.W - 2), v.cell(v.H - 2, v.W - 1),
            v.cell(v.H - 1, v.W - 2), v.cell(v.H - 1, v.W - 1),
        ];
        return { phases, finalCells };
    }

    /**
     * 解盤面。
     * @param startBoard 起始盤面（board[格子]=方塊編號，目標為 board[i]===i）
     * @param blankTile  空格的方塊編號（＝缺格所在的格子索引）
     */
    function solvePuzzle(startBoard, cols, rows, blankTile, plan) {
        const N = cols * rows;
        const BLANK = blankTile;
        const b = startBoard.slice();
        const moves = [];
        const frozen = new Array(N).fill(false);

        const rowOf = (i) => Math.floor(i / cols);
        const colOf = (i) => i % cols;
        const findTile = (t) => b.indexOf(t);
        const blankPos = () => b.indexOf(BLANK);

        let guard = 0;
        const tick = () => { if (++guard > 3000000) throw new Error('solver guard'); };

        function slideBlank(to) {
            const bp = blankPos();
            if (Math.abs(rowOf(bp) - rowOf(to)) + Math.abs(colOf(bp) - colOf(to)) !== 1) {
                throw new Error('slideBlank: 非相鄰格');
            }
            b[bp] = b[to]; b[to] = BLANK; moves.push(to);
        }

        function neighbours(i) {
            const r = rowOf(i), c = colOf(i), out = [];
            if (r > 0) out.push(i - cols);
            if (r < rows - 1) out.push(i + cols);
            if (c > 0) out.push(i - 1);
            if (c < cols - 1) out.push(i + 1);
            return out;
        }

        function moveBlankTo(target, keepOut) {
            const block = new Array(N).fill(false);
            for (let i = 0; i < N; i++) if (frozen[i]) block[i] = true;
            if (keepOut) for (const k of keepOut) if (k !== null && k !== undefined) block[k] = true;
            const start = blankPos();
            if (start === target) return;
            if (block[target]) throw new Error('moveBlankTo: 目標被封鎖');

            const prev = new Array(N).fill(-1), seen = new Array(N).fill(false);
            const queue = [start]; seen[start] = true;
            let found = false;
            for (let qi = 0; qi < queue.length && !found; qi++) {
                for (const n of neighbours(queue[qi])) {
                    if (seen[n] || block[n]) continue;
                    seen[n] = true; prev[n] = queue[qi];
                    if (n === target) { found = true; break; }
                    queue.push(n);
                }
            }
            if (!found) throw new Error('moveBlankTo: 找不到路徑');
            const path = [];
            for (let cur = target; cur !== start; cur = prev[cur]) path.push(cur);
            path.reverse();
            for (const step of path) { tick(); slideBlank(step); }
        }

        function nextStepForTile(from, target) {
            const prev = new Array(N).fill(-1), seen = new Array(N).fill(false);
            const queue = [from]; seen[from] = true;
            let found = false;
            for (let qi = 0; qi < queue.length && !found; qi++) {
                for (const n of neighbours(queue[qi])) {
                    if (seen[n] || frozen[n]) continue;
                    seen[n] = true; prev[n] = queue[qi];
                    if (n === target) { found = true; break; }
                    queue.push(n);
                }
            }
            if (!found) throw new Error('nextStepForTile: 找不到路徑');
            let cur = target;
            while (prev[cur] !== from) cur = prev[cur];
            return cur;
        }

        function moveTileTo(tile, target) {
            while (findTile(tile) !== target) {
                tick();
                const p = findTile(tile);
                const next = nextStepForTile(p, target);
                moveBlankTo(next, [p]);
                slideBlank(p);
            }
        }

        const snapshot = () => ({ board: b.slice(), fz: frozen.slice(), len: moves.length });
        function restore(s) {
            for (let i = 0; i < N; i++) { b[i] = s.board[i]; frozen[i] = s.fz[i]; }
            moves.length = s.len;
        }
        function randomWalkBlank(steps, rnd) {
            let last = -1;
            for (let k = 0; k < steps; k++) {
                const bp = blankPos();
                const free = neighbours(bp).filter(x => !frozen[x] && x !== last);
                if (free.length === 0) return;
                last = bp;
                slideBlank(free[Math.floor(rnd() * free.length)]);
            }
        }
        function withRetry(fn, label) {
            let seed = 0x9E3779B9;
            const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
            for (let attempt = 0; attempt < 200; attempt++) {
                const snap = snapshot();
                try { fn(); return; }
                catch (e) { restore(snap); randomWalkBlank(Math.min(60, 4 + attempt * 3), rnd); }
            }
            throw new Error('withRetry 用盡：' + label);
        }

        /** 解 view 第 r 列的最後兩格（旋轉技巧） */
        function solveRowEnd(v, r) {
            const c1 = v.W - 2, c2 = v.W - 1;
            const A = v.cell(r, c1), B = v.cell(r, c2);
            if (b[A] === A && b[B] === B) { frozen[A] = frozen[B] = true; return; }
            withRetry(() => {
                moveTileTo(A, v.cell(r, c2));
                frozen[v.cell(r, c2)] = true;
                try { moveTileTo(B, v.cell(r + 1, c2)); }
                finally { frozen[v.cell(r, c2)] = false; }
                moveBlankTo(v.cell(r, c1), [v.cell(r, c2), v.cell(r + 1, c2)]);
                slideBlank(v.cell(r, c2));
                slideBlank(v.cell(r + 1, c2));
            }, 'rowEnd');
            frozen[A] = frozen[B] = true;
        }

        /** 解 view 最後兩列中第 c 行的兩格（rowEnd 的鏡像） */
        function solveColEnd(v, c) {
            const r1 = v.H - 2, r2 = v.H - 1;
            const A = v.cell(r1, c), B = v.cell(r2, c);
            if (b[A] === A && b[B] === B) { frozen[A] = frozen[B] = true; return; }
            withRetry(() => {
                moveTileTo(A, v.cell(r2, c));
                frozen[v.cell(r2, c)] = true;
                try { moveTileTo(B, v.cell(r2, c + 1)); }
                finally { frozen[v.cell(r2, c)] = false; }
                moveBlankTo(v.cell(r1, c), [v.cell(r2, c), v.cell(r2, c + 1)]);
                slideBlank(v.cell(r2, c));
                slideBlank(v.cell(r2, c + 1));
            }, 'colEnd');
            frozen[A] = frozen[B] = true;
        }

        function solveFinal2x2(v) {
            const r1 = v.H - 2, r2 = v.H - 1, c1 = v.W - 2, c2 = v.W - 1;
            const cycle = [v.cell(r1, c1), v.cell(r1, c2), v.cell(r2, c2), v.cell(r2, c1)];
            for (let k = 0; k < 13; k++) {
                if (cycle.every(x => b[x] === x)) return;
                const pos = cycle.indexOf(blankPos());
                if (pos < 0) throw new Error('final2x2: 空格不在 2×2 內');
                slideBlank(cycle[(pos + 1) % 4]);
            }
            throw new Error('final2x2: 盤面奇偶性錯誤');
        }

        for (const ph of plan.phases) {
            const v = makeView(ph.edge, ph.r0, ph.r1, ph.c0, ph.c1, cols, ph.mirror);
            if (ph.kind === 'edge') {
                for (let c = 0; c < v.W - 2; c++) {
                    withRetry(() => moveTileTo(v.cell(0, c), v.cell(0, c)), 'edge');
                    frozen[v.cell(0, c)] = true;
                }
                solveRowEnd(v, 0);
            } else {
                for (let c = 0; c < v.W - 2; c++) solveColEnd(v, c);
                solveFinal2x2(v);
            }
        }
        return compressMoves(moves, startBoard, BLANK);
    }

    function compressMoves(moves, startBoard, BLANK) {
        let cur = moves.slice(), changed = true;
        while (changed) {
            changed = false;
            const out = [];
            let blank = startBoard.indexOf(BLANK);
            for (let i = 0; i < cur.length; i++) {
                if (i + 1 < cur.length && cur[i + 1] === blank) { i++; changed = true; continue; }
                out.push(cur[i]); blank = cur[i];
            }
            cur = out;
        }
        return cur;
    }

    // =====================================================================
    // 主模組
    // =====================================================================
    const TuiQiao = {

        container: null,
        boardEl: null,
        libaiEl: null,

        // ── 本輪資料 ──
        sizeKey: DEFAULT_SIZE,
        speedKey: DEFAULT_SPEED,
        LINES: 4,          // 句數（畫面上的「寬」，每一句一直行）
        CHARS: 5,          // 每句字數（畫面上的「高」）
        poemLines: [],     // 本輪的詩句（已去標點）
        poemMeta: null,    // { title, author, dynasty }
        tileChar: [],      // tileChar[方塊編號] = 字
        board: [],         // 目前盤面：board[格子] = 方塊編號
        styleKey: '',      // 本輪的表演風格（見 STYLES）
        _forceStyle: null, // 除錯用：鎖定表演風格
        _forceMirror: null,// 除錯用：鎖定鏡射
        _forceScrambleRegion: null, // 除錯用：鎖定打亂盤面（{label,board}），設 false 可強制整盤
        scrambleRegionLabel: 'full', // 本輪實際採用的打亂區域標籤（除錯用）
        styleMirror: false,// 本輪是否左右鏡射（決定從哪個角落起手）
        holeCell: 0,       // 缺的那一格（解法器座標）
        moveQueue: [],     // 待播放的步驟
        moveIndex: 0,
        totalMoves: 0,
        lineDone: [],      // 每一句是否已完成（用於慶祝）
        tileEls: [],       // tileEls[方塊編號] = 外層定位 DOM
        tileInnerEls: [],  // tileInnerEls[方塊編號] = 內層視覺 DOM（開局進場動畫套用在這裡）
        tileSize: 60,

        // ── 執行狀態 ──
        active: false,
        playing: false,
        finished: false,
        timer: null,
        lastChimeAt: 0,

        // ========================================================
        loadCSS: function () {
            if (!document.getElementById('tuiqiao-css')) {
                const link = document.createElement('link');
                link.id = 'tuiqiao-css';
                link.rel = 'stylesheet';
                link.href = 'tuiqiao.css';
                document.head.appendChild(link);
            }
        },

        init: function () {
            this.loadCSS();
            const isFirst = !document.getElementById('tuiqiao-container');
            if (isFirst) this.createDOM();
            this.container = document.getElementById('tuiqiao-container');
            this.boardEl = document.getElementById('tuiqiao-board');
            this.libaiEl = document.getElementById('tuiqiao-libai');
            if (isFirst) this.bindEvents();
        },

        createDOM: function () {
            const div = document.createElement('div');
            div.id = 'tuiqiao-container';
            div.className = 'tuiqiao-overlay hidden';
            div.innerHTML = `
                <div class="tuiqiao-header">
                    <div class="tuiqiao-title">詩仙推敲</div>
                    <div id="tuiqiao-poem-meta" class="tuiqiao-poem-meta"></div>
                </div>
                <div id="tuiqiao-close" class="tuiqiao-close" aria-label="關閉">✕</div>

                <div class="tuiqiao-stage-area">
                    <div id="tuiqiao-board" class="tuiqiao-board"></div>
                    ${this._libaiMarkup()}
                </div>

                <div class="tuiqiao-panel">
                    <div class="tuiqiao-progress-wrap">
                        <div id="tuiqiao-progress-bar" class="tuiqiao-progress-bar"></div>
                        <div id="tuiqiao-progress-text" class="tuiqiao-progress-text"></div>
                    </div>
                    <div class="tuiqiao-row">
                        <span class="tuiqiao-row-label">詩體</span>
                        <div id="tuiqiao-size-group" class="tuiqiao-btn-group"></div>
                    </div>
                    <div class="tuiqiao-row">
                        <span class="tuiqiao-row-label">速度</span>
                        <div id="tuiqiao-speed-group" class="tuiqiao-btn-group"></div>
                        <button id="tuiqiao-again" class="tuiqiao-action-btn">換一首</button>
                    </div>
                </div>
            `;
            // ⚠️ 掛於 body（非 #stage：stage 有 transform 會造成 position:fixed 雙重縮放）
            document.body.appendChild(div);

            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    div.style.left = r.left + 'px';
                    div.style.top = r.top + 'px';
                    div.style.width = STAGE_W + 'px';
                    div.style.height = STAGE_H + 'px';
                    div.style.transform = `scale(${r.scale})`;
                    div.style.transformOrigin = 'top left';
                });
            }
        },

        /** 二頭身李白：一顆大頭 + 小身體，三組手臂（側推／上推／下壓）依方向切換 */
        _libaiMarkup: function () {
            return `
            <div id="tuiqiao-libai" class="tuiqiao-libai hidden">
              <div class="tuiqiao-libai-flip">
                <div class="tuiqiao-libai-lunge">
                  <svg viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg">
                    <!-- 影子 -->
                    <ellipse class="tq-shadow" cx="50" cy="114" rx="26" ry="4"/>
                    <!-- 腳 -->
                    <path class="tq-shoe" d="M34 104 q-9 0 -9 5 h20 v-5 z"/>
                    <path class="tq-shoe" d="M62 104 q9 0 9 5 h-20 v-5 z"/>
                    <!-- 長袍 -->
                    <path class="tq-robe" d="M50 62 q-19 2 -22 20 l-4 24 q13 5 26 5 t26 -5 l-4 -24 q-3 -18 -22 -20 z"/>
                    <path class="tq-robe-shade" d="M50 62 q19 2 22 20 l4 24 q-11 4 -22 5 v-49 z"/>
                    <!-- 衣襟 -->
                    <path class="tq-collar" d="M50 63 l-11 7 l11 12 l11 -12 z"/>
                    <!-- 腰帶 -->
                    <rect class="tq-belt" x="27" y="86" width="46" height="7" rx="3"/>
                    <!-- 酒葫蘆 -->
                    <g class="tq-gourd">
                      <circle cx="74" cy="96" r="7"/>
                      <circle cx="74" cy="87" r="4.5"/>
                      <rect x="72" y="80" width="4" height="4" rx="1.5"/>
                    </g>
                    <!-- 大頭 -->
                    <circle class="tq-head" cx="50" cy="36" r="31"/>
                    <!-- 幞頭（唐代軟襆頭） -->
                    <path class="tq-hat" d="M22 26 q4 -22 28 -22 t28 22 q-14 -8 -28 -8 t-28 8 z"/>
                    <path class="tq-hat" d="M26 12 q-12 -8 -18 -2 q6 8 16 9 z"/>
                    <path class="tq-hat" d="M74 12 q12 -8 18 -2 q-6 8 -16 9 z"/>
                    <!-- 腮紅 -->
                    <ellipse class="tq-blush" cx="31" cy="45" rx="6" ry="4"/>
                    <ellipse class="tq-blush" cx="69" cy="45" rx="6" ry="4"/>
                    <!-- 眼睛：平時圓眼 -->
                    <g class="tq-eyes-open">
                      <circle class="tq-eye" cx="39" cy="37" r="4"/>
                      <circle class="tq-eye" cx="61" cy="37" r="4"/>
                      <circle class="tq-eye-hl" cx="40.5" cy="35.5" r="1.4"/>
                      <circle class="tq-eye-hl" cx="62.5" cy="35.5" r="1.4"/>
                    </g>
                    <!-- 眼睛：用力時瞇成 ^ ^ -->
                    <g class="tq-eyes-effort">
                      <path d="M34 39 q5 -7 10 0" />
                      <path d="M56 39 q5 -7 10 0" />
                    </g>
                    <!-- 嘴 -->
                    <path class="tq-mouth" d="M44 50 q6 6 12 0 q-6 3 -12 0 z"/>
                    <!-- 鬍鬚 -->
                    <path class="tq-beard" d="M40 56 q10 9 20 0 q-10 16 -20 0 z"/>
                  </svg>
                  <!-- 手臂：側推（面向右，往左推時由外層 scaleX(-1) 翻面） -->
                  <svg class="tq-arms tq-arms-side" viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg">
                    <path class="tq-arm" d="M58 74 q22 -6 36 -4"/>
                    <path class="tq-arm" d="M56 86 q22 -2 34 2"/>
                    <circle class="tq-hand" cx="96" cy="70" r="7.5"/>
                    <circle class="tq-hand" cx="93" cy="89" r="7"/>
                  </svg>
                  <!-- 手臂：往上推（雙手高舉過頭，繞過大頭兩側） -->
                  <svg class="tq-arms tq-arms-up" viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg">
                    <path class="tq-arm" d="M34 76 q-22 -22 -10 -54"/>
                    <path class="tq-arm" d="M66 76 q22 -22 10 -54"/>
                    <circle class="tq-hand" cx="22" cy="17" r="7.5"/>
                    <circle class="tq-hand" cx="78" cy="17" r="7.5"/>
                  </svg>
                  <!-- 手臂：往下壓（雙手下壓到腳邊） -->
                  <svg class="tq-arms tq-arms-down" viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg">
                    <path class="tq-arm" d="M34 76 q-16 16 -12 32"/>
                    <path class="tq-arm" d="M66 76 q16 16 12 32"/>
                    <circle class="tq-hand" cx="20" cy="112" r="7.5"/>
                    <circle class="tq-hand" cx="80" cy="112" r="7.5"/>
                  </svg>
                  <!-- 使力時冒出的汗滴與力線 -->
                  <div class="tq-effort">
                    <span class="tq-sweat tq-sweat-1"></span>
                    <span class="tq-sweat tq-sweat-2"></span>
                  </div>
                </div>
              </div>
            </div>`;
        },

        bindEvents: function () {
            document.getElementById('tuiqiao-close').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            document.getElementById('tuiqiao-again').addEventListener('click', () => {
                if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playConfirmItem(); }
                this.newRound();
            });

            // 詩體選擇
            const sizeGroup = document.getElementById('tuiqiao-size-group');
            BOARD_SIZES.forEach(s => {
                const btn = document.createElement('button');
                btn.className = 'tuiqiao-chip';
                btn.dataset.size = s.key;
                btn.innerHTML = `${s.label}<span class="tuiqiao-chip-sub">${s.sub}</span>`;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.sizeKey = s.key;
                    this._syncChips();
                    this.newRound();
                });
                sizeGroup.appendChild(btn);
            });

            // 速度選擇
            const speedGroup = document.getElementById('tuiqiao-speed-group');
            Object.keys(SPEED_PRESETS).forEach(k => {
                const btn = document.createElement('button');
                btn.className = 'tuiqiao-chip tuiqiao-chip-narrow';
                btn.dataset.speed = k;
                btn.textContent = SPEED_PRESETS[k].label;
                btn.addEventListener('click', () => {
                    if (window.SoundManager) { window.SoundManager.init(); window.SoundManager.playOpenItem(); }
                    this.speedKey = k;
                    this._syncChips();
                });
                speedGroup.appendChild(btn);
            });
            this._syncChips();
        },

        _syncChips: function () {
            document.querySelectorAll('#tuiqiao-size-group .tuiqiao-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.size === this.sizeKey);
            });
            document.querySelectorAll('#tuiqiao-speed-group .tuiqiao-chip').forEach(b => {
                b.classList.toggle('active', b.dataset.speed === this.speedKey);
            });
        },

        // ========================================================
        // 取詩：找出連續 LINES 句、每句剛好 CHARS 字的詩
        // ========================================================
        _pickPoem: function () {
            const need = this.LINES, width = this.CHARS;
            const pool = [];
            try {
                if (typeof POEMS !== 'undefined' && Array.isArray(POEMS)) {
                    for (const p of POEMS) {
                        if (!Array.isArray(p.content)) continue;
                        const lines = p.content.map(l => (l || '').replace(PUNCT_RE, '')).filter(l => l.length > 0);
                        // 從奇數句（index 偶數）起算，符合「兩句一聯」的詩詞原則
                        for (let s = 0; s + need <= lines.length; s += 2) {
                            const seg = lines.slice(s, s + need);
                            if (seg.every(l => l.length === width)) {
                                pool.push({ lines: seg, meta: { title: p.title || '', author: p.author || '', dynasty: p.dynasty || '' } });
                                break;
                            }
                        }
                    }
                }
            } catch (e) { console.warn('[詩仙推敲] 取詩失敗', e); }

            if (pool.length === 0) {
                // 降級保護：題庫不可用時給一首固定的詩，畫面仍可運作
                const fallback5 = ['床前明月光', '疑是地上霜', '舉頭望明月', '低頭思故鄉'];
                const fallback7 = ['朝辭白帝彩雲間', '千里江陵一日還', '兩岸猿聲啼不住', '輕舟已過萬重山'];
                const base = width === 5 ? fallback5 : fallback7;
                const lines = [];
                while (lines.length < need) lines.push(base[lines.length % base.length]);
                return { lines: lines, meta: { title: '靜夜思', author: '李白', dynasty: '唐' } };
            }
            return pool[Math.floor(Math.random() * pool.length)];
        },

        // ========================================================
        // 開新的一輪
        // ========================================================
        newRound: function () {
            this._stopTimer();
            // ⚠️ boardEl／libaiEl 是只建立一次、往後每輪重複使用的 DOM（見 createDOM），
            //    all-done／cheering 這兩個 class 是上一輪完成時加上去的，若只在 show()
            //    裡清、不在這裡清，透過「換一首」或切詩體直接呼叫 newRound() 就會漏清，
            //    新的一輪一開局就頂著上一輪的金色呼吸光暈（使用者回報的殘留特效）。
            this.boardEl.classList.remove('all-done');
            this.libaiEl.classList.remove('cheering');

            const size = BOARD_SIZES.find(s => s.key === this.sizeKey) || BOARD_SIZES[0];
            this.LINES = size.lines;
            this.CHARS = size.chars;

            const picked = this._pickPoem();
            this.poemLines = picked.lines;
            this.poemMeta = picked.meta;

            // ── 解法器座標：cols = 每句字數、rows = 句數（也就是 [句][字]）──
            //    在這個座標系裡，解法器的一「列」＝詩的一「句」、一「行」＝每句的第幾字，
            //    因此「收哪一條邊」就直接對應到畫面上要用哪種節奏把詩拼出來。
            const cols = this.CHARS, rows = this.LINES, N = cols * rows;

            // ⭐ 每一輪隨機挑一種表演風格＋是否左右鏡射（鏡射決定從哪個角落起手）
            const styleKeys = Object.keys(STYLES);
            this.styleKey = styleKeys[Math.floor(Math.random() * styleKeys.length)];
            this.styleMirror = Math.random() < 0.5;
            // 除錯／試玩用：在 console 設 TuiQiao._forceStyle = 'ringCW'（或其他 STYLES 的鍵）
            // 即可鎖定表演風格；_forceMirror 可鎖定鏡射。設回 null 就恢復隨機。
            if (this._forceStyle && STYLES[this._forceStyle]) this.styleKey = this._forceStyle;
            if (typeof this._forceMirror === 'boolean') this.styleMirror = this._forceMirror;
            const plan = planPhases(cols, rows, this.styleKey, this.styleMirror);

            // 缺格＝該風格最後收尾的 2×2 之中隨機一格（所以缺格位置也會跟著風格變化）
            this.holeCell = plan.finalCells[Math.floor(Math.random() * plan.finalCells.length)];

            // 目標盤面就是 board[i] === i；編號 i 的方塊要放的格子就是 i，
            // 而「空格」就是編號等於 holeCell 的那一塊（它沒有字，不會建立 DOM）。
            this.tileChar = new Array(N);
            for (let i = 0; i < N; i++) {
                this.tileChar[i] = (i === this.holeCell)
                    ? null
                    : this.poemLines[Math.floor(i / cols)][i % cols];
            }

            // ⭐ 打亂：多數時候整盤打亂，偶爾改成「少數方塊看似錯位」（見 pickLightScramble
            // 開頭的長註解，記錄了為什麼不能用「侷限小範圍隨機走」來做這件事）。
            // 除錯用 _forceScrambleRegion：null/undefined＝隨機（預設）；false＝強制整盤；
            // {label,board}＝強制指定打亂盤面。
            const sparse = (this._forceScrambleRegion === null || this._forceScrambleRegion === undefined)
                ? pickLightScramble(cols, rows, this.holeCell)
                : (this._forceScrambleRegion || null);
            this.scrambleRegionLabel = sparse ? sparse.label : 'full';   // 除錯用

            let start;
            if (sparse) {
                start = sparse.board;
            } else {
                // 整盤打亂：從目標盤面出發做隨機合法移動，保證一定有解
                // （這段是已用 21600 組盤面驗證過的原始寫法，不要更動）
                start = [];
                for (let i = 0; i < N; i++) start.push(i);
                let sbp = this.holeCell, last = -1;
                const steps = N * SCRAMBLE_PER_CELL;
                for (let s = 0; s < steps; s++) {
                    const r = Math.floor(sbp / cols), c = sbp % cols;
                    const cand = [];
                    if (r > 0) cand.push(sbp - cols);
                    if (r < rows - 1) cand.push(sbp + cols);
                    if (c > 0) cand.push(sbp - 1);
                    if (c < cols - 1) cand.push(sbp + 1);
                    const free = cand.filter(x => x !== last);
                    const pick = free[Math.floor(Math.random() * free.length)];
                    start[sbp] = start[pick]; start[pick] = this.holeCell;
                    last = sbp; sbp = pick;
                }
            }

            let moves;
            try {
                moves = solvePuzzle(start, cols, rows, this.holeCell, plan);
            } catch (e) {
                // 保險：某個風格萬一解不開，就退回最單純的「一句一句」風格重解；
                // 再失敗才放棄打亂（畫面至少不會壞掉）。
                console.warn('[詩仙推敲] 風格 ' + this.styleKey + ' 解法失敗，改用 lineByLine', e);
                try {
                    this.styleKey = 'lineByLine';
                    this.styleMirror = false;
                    const p2 = planPhases(cols, rows, 'lineByLine', false);
                    this.holeCell = p2.finalCells[0];
                    for (let i = 0; i < N; i++) {
                        this.tileChar[i] = (i === this.holeCell) ? null
                            : this.poemLines[Math.floor(i / cols)][i % cols];
                    }
                    for (let i = 0; i < N; i++) start[i] = i;
                    moves = [];
                } catch (e2) {
                    console.error('[詩仙推敲] 解法完全失敗', e2);
                    moves = [];
                    for (let i = 0; i < N; i++) start[i] = i;
                }
            }

            this.board = start.slice();
            this.moveQueue = moves;
            this.moveIndex = 0;
            this.totalMoves = moves.length;
            this.finished = false;
            this.lineDone = new Array(rows).fill(false);

            this._buildBoardDOM();
            this._updateMeta();
            this._updateProgress();
            document.getElementById('tuiqiao-poem-meta').classList.remove('done');
            this.playing = true;
            // 第一步要等「進場動畫全部播完」＋「思考停頓」才開始：
            // 進場動畫最後一顆方塊在 ENTRANCE_WINDOW_MS 時開始放大，再花 ENTRANCE_TILE_MS
            // 長大到定位，兩者相加才是「盤面完全靜止、可以開始看」的時間點。
            this._scheduleNextMove(ENTRANCE_WINDOW_MS + ENTRANCE_TILE_MS + THINK_PAUSE_MS);
        },

        // ========================================================
        // 盤面 DOM
        // ========================================================
        /** 解法器格子 → 畫面列/行。解法器是 [句][字]，畫面是直排、由右至左 */
        _screenPos: function (cell) {
            const cols = this.CHARS;
            const rs = Math.floor(cell / cols);   // 第幾句
            const cs = cell % cols;               // 句中第幾字
            return { row: cs, col: this.LINES - 1 - rs };
        },

        _buildBoardDOM: function () {
            const board = this.boardEl;
            board.innerHTML = '';
            const N = this.LINES * this.CHARS;

            // 依盤面大小計算方塊尺寸
            const tw = Math.floor((BOARD_MAX_W - TILE_GAP * (this.LINES - 1)) / this.LINES);
            const th = Math.floor((BOARD_AREA_H - TILE_GAP * (this.CHARS - 1)) / this.CHARS);
            this.tileSize = Math.max(28, Math.min(tw, th, 104));
            const bw = this.tileSize * this.LINES + TILE_GAP * (this.LINES - 1);
            const bh = this.tileSize * this.CHARS + TILE_GAP * (this.CHARS - 1);
            board.style.width = bw + 'px';
            board.style.height = bh + 'px';
            board.style.left = Math.round((STAGE_W - bw) / 2) + 'px';
            board.style.top = Math.round(BOARD_AREA_TOP + (BOARD_AREA_H - bh) / 2) + 'px';

            // 底板格線
            for (let i = 0; i < N; i++) {
                const p = this._screenPos(i);
                const slot = document.createElement('div');
                slot.className = 'tuiqiao-slot';
                slot.style.width = slot.style.height = this.tileSize + 'px';
                slot.style.transform = `translate(${p.col * (this.tileSize + TILE_GAP)}px, ${p.row * (this.tileSize + TILE_GAP)}px)`;
                board.appendChild(slot);
            }

            // 方塊：外層 .tuiqiao-tile 只負責定位（translate），內層 .tuiqiao-tile-inner
            // 才是實際看到的圓角色塊——分兩層是因為開局的「由小放大」進場動畫要對
            // scale 做 transform 動畫，若跟定位共用同一個 transform 會互相打架。
            this.tileEls = new Array(N).fill(null);
            this.tileInnerEls = new Array(N).fill(null);
            const totalLines = this.LINES;
            for (let tile = 0; tile < N; tile++) {
                const ch = this.tileChar[tile];
                if (ch === null || ch === undefined) continue;   // 空格沒有方塊

                // 顏色依「該方塊在目標盤面所屬的句」決定：一句一色
                const lineIdx = Math.floor(tile / this.CHARS);   // 目標格子＝編號本身
                const color = (window.TileStyleUtils && window.TileStyleUtils.getGroupColor)
                    ? window.TileStyleUtils.getGroupColor(lineIdx, totalLines)
                    : { hue: (lineIdx * 47) % 360, sat: 90, lum: 70, textColor: 'hsl(0,0%,12%)' };

                const el = document.createElement('div');
                el.className = 'tuiqiao-tile';
                el.style.width = el.style.height = this.tileSize + 'px';
                el.style.fontSize = Math.round(this.tileSize * 0.6) + 'px';

                const inner = document.createElement('div');
                inner.className = 'tuiqiao-tile-inner';
                inner.textContent = ch;
                inner.style.setProperty('--tq-h', color.hue);
                inner.style.setProperty('--tq-s', color.sat + '%');
                inner.style.setProperty('--tq-l', color.lum + '%');
                inner.style.setProperty('--tq-text', color.textColor);
                el.appendChild(inner);

                board.appendChild(el);
                this.tileEls[tile] = el;
                this.tileInnerEls[tile] = inner;
            }

            this._layoutTiles(true);
            this._sizeLibai();
            this._playEntrance();
            this._placeLibaiAtHole();
        },

        /** 開局進場：依畫面「左上→右下」的順序，讓方塊一個接一個由小放大到正確尺寸 */
        _playEntrance: function () {
            // 以目前的 this.board（打亂後的起始盤面）決定畫面每個位置實際站的是哪個方塊，
            // 再依螢幕座標的 row-major（先橫向、再往下一列）順序排出出場先後。
            const order = [];
            for (let cell = 0; cell < this.board.length; cell++) {
                const p = this._screenPos(cell);
                order.push({ cell, tile: this.board[cell], key: p.row * this.LINES + p.col });
            }
            order.sort((a, b) => a.key - b.key);

            const appearing = order.filter(o => this.tileInnerEls[o.tile]);
            const total = Math.max(1, appearing.length - 1);
            const durSec = (ENTRANCE_TILE_MS / 1000).toFixed(3) + 's';
            appearing.forEach((o, k) => {
                const inner = this.tileInnerEls[o.tile];
                const delay = (k / total) * (ENTRANCE_WINDOW_MS / 1000);
                inner.style.setProperty('--tq-appear-dur', durSec);
                inner.style.animationDelay = delay.toFixed(3) + 's';
                inner.classList.remove('tuiqiao-tile-appear');
                void inner.offsetWidth;   // 強制 reflow，確保重新套用 class 會重播動畫
                inner.classList.add('tuiqiao-tile-appear');
                // ⚠️ 動畫播完必須把 class 拿掉，不能留著。CSS 靠特異度讓 landed／
                //    line-done／all-done 這些後續狀態「暫時蓋過」進場動畫，但只要
                //    tuiqiao-tile-appear 這個 class 還在元素上，一旦 landed 等狀態的
                //    class 被移除、蓋過的規則失效，瀏覽器會偵測到「目前生效的
                //    animation 值變了」而重新播放進場動畫——結果是每次方塊落到正確
                //    位置、金光閃爍結束後，那顆方塊會無端再縮小放大一次。
                //    用 animationend 在動畫真正播完的當下移除 class；另外加一個
                //    setTimeout 當保險——若動畫途中被別的規則搶先蓋過（例如方塊剛
                //    出場沒多久就被判定「已在正確位置」而搶著播 landed），
                //    animationend 可能根本不會觸發，屆時就交給逾時保險移除。
                const cleanup = () => inner.classList.remove('tuiqiao-tile-appear');
                inner.addEventListener('animationend', function onEnd(e) {
                    if (e.animationName !== 'tuiqiao-tile-grow') return;
                    cleanup();
                    inner.removeEventListener('animationend', onEnd);
                });
                setTimeout(cleanup, delay * 1000 + ENTRANCE_TILE_MS + 80);
            });
        },

        /** 依 this.board 把每個方塊放到對應位置（instant=true 時不做過場動畫） */
        _layoutTiles: function (instant) {
            const step = this.tileSize + TILE_GAP;
            for (let cell = 0; cell < this.board.length; cell++) {
                const tile = this.board[cell];
                const el = this.tileEls[tile];
                if (!el) continue;
                const p = this._screenPos(cell);
                if (instant) el.style.transition = 'none';
                el.style.transform = `translate(${p.col * step}px, ${p.row * step}px)`;
                if (instant) {
                    void el.offsetWidth;                     // 強制 reflow，讓 transition:none 立即生效
                    el.style.transition = '';
                }
            }
        },

        _sizeLibai: function () {
            const size = Math.max(50, Math.round(this.tileSize * 1.08));
            this.libaiEl.style.width = size + 'px';
            this.libaiEl.style.height = Math.round(size * 1.18) + 'px';
        },

        _updateMeta: function () {
            const m = this.poemMeta || {};
            document.getElementById('tuiqiao-poem-meta').textContent =
                `${m.title || ''}　${m.dynasty ? '〔' + m.dynasty + '〕' : ''}${m.author || ''}`;
        },

        _updateProgress: function () {
            const pct = this.totalMoves ? Math.round(this.moveIndex / this.totalMoves * 100) : 100;
            document.getElementById('tuiqiao-progress-bar').style.width = pct + '%';
            document.getElementById('tuiqiao-progress-text').textContent =
                `${this.moveIndex} / ${this.totalMoves} 步`;
        },

        // ========================================================
        // 播放：一步一步推
        // ========================================================
        _stopTimer: function () {
            if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        },

        _scheduleNextMove: function (delay) {
            this._stopTimer();
            if (!this.active || !this.playing) return;
            this.timer = setTimeout(() => this._playMove(), delay);
        },

        _playMove: function () {
            if (!this.active || !this.playing) return;
            if (this.moveIndex >= this.moveQueue.length) { this._onFinish(); return; }

            const sp = SPEED_PRESETS[this.speedKey] || SPEED_PRESETS[DEFAULT_SPEED];
            const toCell = this.moveQueue[this.moveIndex];       // 空格移動到的格子
            const N = this.board.length;
            const fromCell = this.board.indexOf(this.holeCell);  // 空格目前位置
            const tile = this.board[toCell];                     // 被推動的方塊

            // 方塊的移動方向 = 從 toCell 走向 fromCell
            const a = this._screenPos(toCell), bpos = this._screenPos(fromCell);
            let dir = 'right';
            if (bpos.col > a.col) dir = 'right';
            else if (bpos.col < a.col) dir = 'left';
            else if (bpos.row > a.row) dir = 'down';
            else dir = 'up';

            // 李白瞬移到推動位置（在方塊的反方向側）
            this._placeLibai(a, dir);

            // 蓄力 → 推 → 方塊滑動
            this.timer = setTimeout(() => {
                if (!this.active || !this.playing) return;

                this.libaiEl.classList.add('pushing');
                const el = this.tileEls[tile];
                if (el) {
                    el.style.transition = `transform ${sp.tileMoveMs}ms cubic-bezier(0.34, 1.2, 0.64, 1)`;
                    const step = this.tileSize + TILE_GAP;
                    el.style.transform = `translate(${bpos.col * step}px, ${bpos.row * step}px)`;
                }
                this._playMoveSound();

                // 更新邏輯盤面
                this.board[fromCell] = tile;
                this.board[toCell] = this.holeCell;
                this.moveIndex++;
                this._updateProgress();

                this.timer = setTimeout(() => {
                    if (!this.active || !this.playing) return;
                    this.libaiEl.classList.remove('pushing');
                    this._checkLanded(tile, fromCell);
                    this._checkLineDone();
                    this._scheduleNextMove(sp.settleMs);
                }, sp.tileMoveMs);
            }, sp.windupMs);
        },

        /** 開局站在空格（缺格）處等待，尺寸收到能完整塞進一格之內，四周不擋到任何
         *  方塊。只在思考停頓期間顯示；第一次真正推動時 _placeLibai 會把尺寸還原
         *  成正常的推動用大小。 */
        _placeLibaiAtHole: function () {
            const step = this.tileSize + TILE_GAP;
            const emptyCell = this.board.indexOf(this.holeCell);   // 打亂後空格目前實際所在的格子
            const p = this._screenPos(emptyCell);

            // 縮小到「連頭帶身體都塞得進一格」，避免探出格外擋到隔壁方塊
            const h = Math.max(1, Math.round(this.tileSize * 0.94));
            const w = Math.max(1, Math.round(h / 1.18));
            this.libaiEl.style.width = w + 'px';
            this.libaiEl.style.height = h + 'px';

            const bx = parseFloat(this.boardEl.style.left) || 0;
            const by = parseFloat(this.boardEl.style.top) || 0;
            const px = bx + p.col * step + (this.tileSize - w) / 2;
            const py = by + p.row * step + (this.tileSize - h) / 2;

            this.libaiEl.classList.remove('pushing', 'cheering');
            // ⚠️ 刻意不設定 data-pose：三組手臂（side/up/down）的 CSS 選擇器都對不上，
            //    安靜站著、不伸手，讓玩家清楚看到「他站在空格處」而不是正在使力推。
            delete this.libaiEl.dataset.pose;
            delete this.libaiEl.dataset.dir;
            this.libaiEl.querySelector('.tuiqiao-libai-flip').style.transform = 'scaleX(1)';
            this.libaiEl.style.transform = `translate(${px}px, ${py}px)`;

            this.libaiEl.classList.remove('hidden');
            this.libaiEl.classList.remove('teleport');
            void this.libaiEl.offsetWidth;
            this.libaiEl.classList.add('teleport');
        },

        /** 把李白擺到方塊的反方向側（瞬間移動，不走路） */
        _placeLibai: function (tilePos, dir) {
            // ⚠️ 開局時 _placeLibaiAtHole 會把他縮小塞進空格，這裡第一次真正推動前
            //    必須先還原成正常的推動用尺寸，否則會整局都維持縮小的樣子。
            this._sizeLibai();
            const step = this.tileSize + TILE_GAP;
            const t = this.tileSize;
            const cx = tilePos.col * step + t / 2;
            const cy = tilePos.row * step + t / 2;
            const off = t * 0.92;

            let x = cx, y = cy, pose = 'side', flip = false;
            if (dir === 'right') { x = cx - off; pose = 'side'; flip = false; }
            else if (dir === 'left') { x = cx + off; pose = 'side'; flip = true; }
            // ⚠️ 往上推要站得比其他方向更遠一點：他的頭很大（二頭身），用一般距離
            //    會整顆頭壓在方塊上，看不出是「舉起來推」。
            else if (dir === 'up') { y = cy + off * 1.25; pose = 'up'; }
            else { y = cy - off; pose = 'down'; }

            const w = parseFloat(this.libaiEl.style.width) || 60;
            const h = parseFloat(this.libaiEl.style.height) || 70;
            const bx = parseFloat(this.boardEl.style.left) || 0;
            const by = parseFloat(this.boardEl.style.top) || 0;

            // 推動動作的長度要跟著速度設定走，否則調快之後動作會拖在方塊後面
            const sp = SPEED_PRESETS[this.speedKey] || SPEED_PRESETS[DEFAULT_SPEED];
            this.libaiEl.style.setProperty('--tq-push-dur', (sp.tileMoveMs / 1000).toFixed(3) + 's');

            this.libaiEl.dataset.dir = dir;
            this.libaiEl.dataset.pose = pose;
            this.libaiEl.querySelector('.tuiqiao-libai-flip').style.transform = flip ? 'scaleX(-1)' : 'scaleX(1)';
            // ⚠️ 夾在舞台範圍內：盤面幾乎和畫面等寬，最外側那一行/列若不夾住，
            //    李白會有一半跑到畫面外（實測推最右行時被切掉約 50px）。
            //    夾住之後他會稍微疊在方塊上，但至少完整看得見。
            let px = bx + x - w / 2;
            let py = by + y - h * 0.62;
            px = Math.max(2, Math.min(STAGE_W - w - 2, px));
            py = Math.max(96, Math.min(STAGE_H - h - 128, py));
            this.libaiEl.style.transform = `translate(${px}px, ${py}px)`;

            // 重播瞬移特效
            this.libaiEl.classList.remove('hidden');
            this.libaiEl.classList.remove('teleport');
            void this.libaiEl.offsetWidth;
            this.libaiEl.classList.add('teleport');
        },

        /** 方塊落在正確位置時的回饋 */
        _checkLanded: function (tile, cell) {
            if (cell !== tile) return;        // 目標盤面是 identity：格子索引＝該格該放的方塊編號
            const el = this.tileEls[tile];
            if (!el) return;
            el.classList.remove('landed');
            void el.offsetWidth;
            el.classList.add('landed');
            setTimeout(() => el && el.classList.remove('landed'), LOCK_FLASH_MS);

            // 輕柔的古箏音，但做節流避免太密集
            const now = Date.now();
            if (now - this.lastChimeAt > 140 && window.SoundManager) {
                this.lastChimeAt = now;
                window.SoundManager.playGuzheng(3 + (cell % 5), 0.22);
            }
        },

        /** 檢查是否有整句完成 */
        _checkLineDone: function () {
            const cols = this.CHARS;
            for (let line = 0; line < this.LINES; line++) {
                if (this.lineDone[line]) continue;
                let ok = true;
                for (let c = 0; c < cols; c++) {
                    const cell = line * cols + c;
                    if (this.board[cell] !== cell) { ok = false; break; }
                }
                if (!ok) continue;
                this.lineDone[line] = true;
                this._celebrateLine(line);
            }
        },

        _celebrateLine: function (line) {
            const cols = this.CHARS;
            for (let c = 0; c < cols; c++) {
                const cell = line * cols + c;
                const el = this.tileEls[this.board[cell]];
                if (!el) continue;
                setTimeout(() => {
                    el.classList.add('line-done');
                    setTimeout(() => el.classList.remove('line-done'), LINE_CELEBRATE_MS);
                }, c * 60);
            }
            if (window.SoundManager) window.SoundManager.playSuccessShort();
        },

        // ========================================================
        // 完成
        // ========================================================
        _onFinish: function () {
            this.playing = false;
            this.finished = true;
            this._stopTimer();
            // 保險：若這輪一步都沒推（極端邊界情況）就直接完成，此時尺寸可能還停留在
            // _placeLibaiAtHole 縮小過的狀態，這裡強制還原成正常大小再擺歡呼姿勢。
            this._sizeLibai();
            this.libaiEl.classList.add('cheering');
            this.libaiEl.dataset.pose = 'up';

            // 李白跳到盤面正下方歡呼
            const bx = parseFloat(this.boardEl.style.left) || 0;
            const by = parseFloat(this.boardEl.style.top) || 0;
            const bw = parseFloat(this.boardEl.style.width) || 0;
            const bh = parseFloat(this.boardEl.style.height) || 0;
            const w = parseFloat(this.libaiEl.style.width) || 60;
            const h = parseFloat(this.libaiEl.style.height) || 70;
            this.libaiEl.querySelector('.tuiqiao-libai-flip').style.transform = 'scaleX(1)';
            // ⚠️ 站在盤面「之上」而非下方：下方是控制面板（z-index 較高），放那裡會被蓋掉
            this.libaiEl.classList.remove('hidden');
            this.libaiEl.style.transform = `translate(${bx + bw / 2 - w / 2}px, ${by + bh - h * 0.98}px)`;

            this.boardEl.classList.add('all-done');
            if (window.SoundManager) window.SoundManager.playJoyfulTripleSlow();

            // ⚠️ 完成提示放在標題列，不做覆蓋整個畫面的卡片：
            //    玩家看了好幾分鐘就是為了看到這首詩拼完，這時候拿一張卡片蓋住它最掃興。
            const meta = document.getElementById('tuiqiao-poem-meta');
            const m = this.poemMeta || {};
            meta.textContent = `推敲既成　${m.title || ''}　${m.dynasty ? '〔' + m.dynasty + '〕' : ''}${m.author || ''}`;
            meta.classList.add('done');

            if (AUTO_NEXT_MS > 0) {
                this.timer = setTimeout(() => {
                    if (!this.active) return;
                    this.boardEl.classList.remove('all-done');
                    this.libaiEl.classList.remove('cheering');
                    this.newRound();
                }, FINISH_HOLD_MS + AUTO_NEXT_MS);
            }
        },

        _playMoveSound: function () {
            if (!window.SoundManager) return;
            // 短促、音量低的木質推動聲
            window.SoundManager.playHit(this.moveIndex % 5, 0.035);
        },

        // ========================================================
        // 顯示 / 隱藏
        // ========================================================
        show: function () {
            this.init();
            this.active = true;
            this.container.classList.remove('hidden');
            this.boardEl.classList.remove('all-done');
            this.libaiEl.classList.remove('cheering');
            this.newRound();
        },

        // 玩家按 ✕ 主動關閉 → 回到首頁「青雲梯」。
        // （只有這條路徑回首頁；menu.js 的全域清理走 stopGame()，不受影響）
        hide: function () {
            this.stopGame();
            if (typeof window.FMGoHome === 'function') window.FMGoHome();
        },

        // menu.js 的全域清理只呼叫 stopGame()，因此這裡必須自行隱藏 overlay
        stopGame: function () {
            this.active = false;
            this.playing = false;
            this._stopTimer();
            if (this.container) this.container.classList.add('hidden');
        },
    };

    window.TuiQiao = TuiQiao;

    // URL 參數啟動（與其他模組一致，精確比對）
    if (new URLSearchParams(window.location.search).get('page') === 'tuiqiao') {
        const start = () => {
            if (window.TuiQiao) window.TuiQiao.show();
            window.history.replaceState({}, document.title, window.location.pathname);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(start, 50));
        } else {
            setTimeout(start, 50);
        }
    }

})();
