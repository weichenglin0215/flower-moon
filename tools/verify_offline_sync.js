/* ==========================================================================
   花月 · 離線遊玩的「存檔與紀錄補送」驗證 (tools/verify_offline_sync.js)
   --------------------------------------------------------------------------
   執行：  node tools/verify_offline_sync.js
   修改 supabaseClient.js 的存檔／紀錄／啟動同步之後必跑。

   用假的 Supabase 客戶端（不會連到任何真實資料庫）模擬：
     連線中斷、資料庫拒收、連線恢復、兩台裝置進度不同…
   驗證離線期間玩的進度與遊戲紀錄「不會被雲端舊資料蓋掉、也不會憑空消失」。

   這是離線遊玩最容易出事的地方，而且出事時玩家完全沒有感覺：
   離線玩了一晚，隔天連上網，進度回到昨天 —— 而且沒有任何錯誤訊息。
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(cond, name, detail) {
    if (cond) { pass++; return; }
    fail++;
    console.log('  ❌ ' + name + (detail ? '\n      ' + detail : ''));
}
function section(t) { console.log('\n■ ' + t); }

/** 建立一個全新的模擬環境，載入真正的 supabaseClient.js */
function makeEnv() {
    const store = {};
    const localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    };
    const nav = { onLine: true };
    const winListeners = {};

    // 假雲端：mode 決定下一次請求的結果
    const cloud = { mode: 'ok', calls: [], row: null, rpcResult: null };
    const reply = () => {
        if (cloud.mode === 'network') return { error: { message: 'TypeError: Failed to fetch', code: '' } };
        if (cloud.mode === 'dberr') return { error: { message: 'permission denied', code: '42501' } };
        return { error: null };
    };
    const fakeClient = {
        from(table) {
            return {
                upsert: async (payload) => { cloud.calls.push(['upsert', table, payload]); return reply(); },
                insert: async (payload) => { cloud.calls.push(['insert', table, payload]); return reply(); },
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () => {
                            const r = reply();
                            return r.error ? { data: null, error: r.error } : { data: cloud.row, error: null };
                        }
                    })
                })
            };
        },
        rpc: async (fn, args) => {
            cloud.calls.push(['rpc', fn, args]);
            if (cloud.mode === 'network') return { data: null, error: { message: 'TypeError: Failed to fetch', code: '' } };
            if (cloud.rpcResult) return cloud.rpcResult;
            return { data: { ok: true }, error: null };
        }
    };

    const local = { totalScore: 100, nickname: '測試' };
    const spies = { applied: 0, resetAll: 0 };

    const win = {
        supabase: { createClient: () => fakeClient },
        addEventListener: (t, fn) => { (winListeners[t] = winListeners[t] || []).push(fn); },
        ScoreManager: {
            loadPlayerData: () => local,
            resetAll: () => { spies.resetAll++; },
            updateProfileUI: () => { }
        },
        CloudSaveDialog: null   // 下面補上
    };
    const ctx = vm.createContext({
        window: win, localStorage, navigator: nav, console: { log() { }, warn() { }, error() { } },
        setTimeout, clearTimeout, Date, JSON, Promise, Math, Object, Array, String, Number, Error, TypeError, RegExp
    });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'supabaseClient.js'), 'utf8'), ctx, { filename: 'supabaseClient.js' });
    const S = win.SupabaseClient;

    win.CloudSaveDialog = {
        applyCloudDataToLocal: (row, id) => { spies.applied++; S.markCloudDirty(false); S.setCurrentId(id); local.totalScore = row.total_score; }
    };

    return { S, store, nav, cloud, local, spies, winListeners, win };
}

const gameLog = (n) => ({ gameNo: n, difficulty: '小學', score: 100 * n, isWin: true, durationS: 30 });
const tick = (ms) => new Promise(r => setTimeout(r, ms || 0));

async function main() {
    console.log('花月 離線補送驗證');

    section('1. 存檔失敗時是否正確標記「尚未上傳」');
    {
        const e = makeEnv();
        e.S.setCurrentId('U123');
        e.cloud.mode = 'ok';
        ok(await e.S.saveGameToCloud(e.local) === true, '連線正常：存檔成功');
        ok(!e.S.isCloudDirty(), '成功後沒有「尚未上傳」標記');

        e.cloud.mode = 'network';
        ok(await e.S.saveGameToCloud(e.local) === false, '連線中斷：存檔回傳失敗');
        ok(e.S.isCloudDirty(), '連線中斷：標記「尚未上傳」');

        e.cloud.mode = 'ok';
        await e.S.saveGameToCloud(e.local);
        ok(!e.S.isCloudDirty(), '之後存檔成功，標記清除');

        // 資料庫明確拒收（不是連不上）：不能標成 dirty，否則會永遠阻止「以雲端為準」的同步
        e.cloud.mode = 'dberr';
        ok(await e.S.saveGameToCloud(e.local) === false, '資料庫拒收：存檔回傳失敗');
        ok(!e.S.isCloudDirty(), '資料庫拒收（非連線問題）不標記，免得永遠卡在「本機為準」');

        // 瀏覽器明確回報離線時，即使錯誤訊息不像連線錯誤也視為連線問題
        e.cloud.mode = 'dberr'; e.nav.onLine = false;
        await e.S.saveGameToCloud(e.local);
        ok(e.S.isCloudDirty(), 'navigator.onLine=false 時一律視為連線問題');
    }

    section('2. 沒有帳號的玩家');
    {
        const e = makeEnv();
        e.cloud.mode = 'network';
        ok(await e.S.saveGameToCloud(e.local) === false, '沒帳號：存檔直接略過');
        ok(!e.S.isCloudDirty(), '沒帳號不會有需要補傳的東西');
        await e.S.logGame(gameLog(1));
        ok(e.S.pendingCount() === 0, '沒帳號不記錄也不排隊遊戲紀錄');
    }

    section('3. 離線期間的遊戲紀錄：排隊、保留時間、連線後補送');
    {
        const e = makeEnv();
        e.S.setCurrentId('U123');
        e.nav.onLine = false;
        await e.S.logGame(gameLog(1));
        await e.S.logGame(gameLog(2));
        await e.S.logSilverEvent({ amount: 30, source: 'cert' });
        ok(e.S.pendingCount() === 3, '離線時 3 筆全部進佇列', '實際 ' + e.S.pendingCount());
        ok(e.cloud.calls.length === 0, '離線時不浪費請求');

        const queued = JSON.parse(e.store['fm_cloud_queue']);
        ok(queued[0].payload.player_id === 'U123' && !!queued[0].payload.played_at, '紀錄在排隊當下就定下時間與帳號');

        e.nav.onLine = true; e.cloud.mode = 'ok';
        ok(await e.S.flushPending() === true, '連線後補送成功');
        ok(e.S.pendingCount() === 0, '佇列清空');
        const ins = e.cloud.calls.filter(c => c[0] === 'insert');
        ok(ins.length === 3 && ins[0][1] === 'game_logs' && ins[2][1] === 'silver_events', '依原本順序送出（遊戲紀錄、文錢流水帳）');
        ok(ins[0][2].played_at === queued[0].payload.played_at, '補送的時間戳是原本遊玩的時間，不是補送當下');
    }

    section('4. 線上但連不上、與資料庫拒收的區別');
    {
        const e = makeEnv();
        e.S.setCurrentId('U123');
        e.cloud.mode = 'network';
        await e.S.logGame(gameLog(1));
        ok(e.S.pendingCount() === 1, '線上但請求失敗（網路不穩）：排隊等待');

        ok(await e.S.flushPending() === false, '補送時仍斷線：回傳未完成');
        ok(e.S.pendingCount() === 1, '補送失敗：紀錄保留在佇列，不遺失');

        e.cloud.mode = 'dberr';
        await e.S.flushPending();
        ok(e.S.pendingCount() === 0, '資料庫拒收的紀錄直接丟棄（重送也不會成功，不能卡住後面的）');

        e.cloud.mode = 'ok';
        await e.S.logGame(gameLog(2));
        ok(e.S.pendingCount() === 0, '連線恢復後新的紀錄直接送出');
    }

    section('5. 補送途中又有新紀錄進來，不可被覆蓋');
    {
        const e = makeEnv();
        e.S.setCurrentId('U123');
        e.nav.onLine = false;
        await e.S.logGame(gameLog(1));
        await e.S.logGame(gameLog(2));
        e.nav.onLine = true; e.cloud.mode = 'ok';
        // 讓第一筆送出時，順便排進一筆新的（模擬玩家補送期間又打完一局）
        let injected = false;
        const orig = e.S._insertGameLogWithFallback.bind(e.S);
        e.S._insertGameLogWithFallback = async function (p) {
            if (!injected) { injected = true; e.S._enqueue('game_logs', { player_id: 'U123', score: 999, played_at: 'NEW' }); }
            return orig(p);
        };
        await e.S.flushPending();
        const sent = e.cloud.calls.filter(c => c[0] === 'insert').map(c => c[2].score);
        ok(sent.includes(999), '補送期間新增的紀錄也被送出（沒有被舊陣列覆蓋掉）', '送出：' + sent.join(','));
        ok(e.S.pendingCount() === 0, '最後佇列清空');
    }

    section('6. 佇列上限');
    {
        const e = makeEnv();
        e.S.setCurrentId('U123');
        e.nav.onLine = false;
        for (let i = 0; i < 520; i++) await e.S.logGame(gameLog(i));
        ok(e.S.pendingCount() === 500, '超過 500 筆時丟掉最舊的，避免離線很久把儲存空間塞爆', '實際 ' + e.S.pendingCount());
    }

    section('7. 啟動同步：離線進度不能被雲端舊資料蓋掉');
    {
        // 7a. 本機有離線進度、雲端分數較低 → 保留本機並補傳
        let e = makeEnv();
        e.S.setCurrentId('U123'); e.local.totalScore = 500;
        e.cloud.row = { total_score: 300 };
        e.S.markCloudDirty(true);
        let r = await e.S.syncOnStartup(); await tick();
        ok(r === false && e.spies.applied === 0, '本機(500) ≥ 雲端(300) 且有離線進度：不套用雲端');
        ok(e.cloud.calls.some(c => c[0] === 'upsert'), '改為把本機進度補傳上雲端');
        ok(!e.S.isCloudDirty(), '補傳成功後標記清除');

        // 7b. 雲端分數較高（別台裝置玩得更多）→ 以雲端為準
        e = makeEnv();
        e.S.setCurrentId('U123'); e.local.totalScore = 200;
        e.cloud.row = { total_score: 900 };
        e.S.markCloudDirty(true);
        r = await e.S.syncOnStartup();
        ok(r === true && e.spies.applied === 1, '雲端(900) > 本機(200)：別台裝置玩得更多，以雲端為準');
        ok(!e.S.isCloudDirty(), '套用雲端資料後標記清除');

        // 7c. 沒有離線進度 → 照舊以雲端為準
        e = makeEnv();
        e.S.setCurrentId('U123'); e.local.totalScore = 500;
        e.cloud.row = { total_score: 300 };
        r = await e.S.syncOnStartup();
        ok(r === true && e.spies.applied === 1, '沒有離線進度：維持「雲端為準」');

        // 7d. 雲端查無帳號 + 沒有離線進度 → 視為被重置，清空本機（既有行為）
        e = makeEnv();
        e.S.setCurrentId('U123'); e.cloud.row = null;
        await e.S.syncOnStartup();
        ok(e.spies.resetAll === 1, '雲端查無帳號、本機也沒有離線進度：照舊清空本機');

        // 7e. 雲端查無帳號 + 有離線進度（剛註冊、第一次存檔失敗）→ 補傳，不可清空
        e = makeEnv();
        e.S.setCurrentId('U123'); e.cloud.row = null; e.S.markCloudDirty(true);
        await e.S.syncOnStartup(); await tick();
        ok(e.spies.resetAll === 0, '查無帳號但本機有未上傳的進度：不可清空本機（這是剛註冊的新帳號）');
        ok(e.cloud.calls.some(c => c[0] === 'upsert'), '並補傳建立雲端存檔');

        // 7f. 啟動時連不上 → 本機完全不動
        e = makeEnv();
        e.S.setCurrentId('U123'); e.cloud.mode = 'network';
        r = await e.S.syncOnStartup();
        ok(r === false && e.spies.applied === 0 && e.spies.resetAll === 0, '啟動時連不上：本機完全不動');
    }

    section('8. 帳號 RPC 的錯誤分類');
    {
        const e = makeEnv();
        e.cloud.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fm_login' } };
        let r = await e.S.login('甲', '1234');
        ok(r.ok === false && r.reason === 'server_not_ready', '函式不存在 → server_not_ready（SQL 還沒執行）');

        e.cloud.rpcResult = null; e.cloud.mode = 'network';
        r = await e.S.login('甲', '1234');
        ok(r.ok === false && r.reason === 'network', '連不上 → network');

        e.cloud.mode = 'ok';
        e.cloud.rpcResult = { data: { ok: false, reason: 'bad_pin', attempts_left: 3 }, error: null };
        r = await e.S.login('甲', '0000');
        ok(r.ok === false && r.reason === 'bad_pin' && r.attempts_left === 3, '伺服器的拒絕原因與剩餘次數原樣傳回');

        // 離線時暱稱檢查不能誤判成「可用」或「已被使用」
        e.cloud.mode = 'network';
        ok(await e.S.checkNicknameAvailable('甲') === null, '離線時暱稱可用性回傳 null（無法判斷），不是 true／false');
    }

    section('9. 連線恢復事件');
    {
        const e = makeEnv();
        ok((e.winListeners['online'] || []).length === 1, '有註冊 online 事件監聽');
        e.S.setCurrentId('U123');
        e.nav.onLine = false;
        await e.S.logGame(gameLog(1));
        e.nav.onLine = true;
        e.winListeners['online'][0]();
        await tick(2800);   // 實作延後 2.5 秒才補送（剛恢復連線時網路通常還不穩）
        ok(e.S.pendingCount() === 0, 'online 事件觸發後會自動補送');
    }

    section('10. 玩家意見（提意見）');
    {
        const e = makeEnv();
        const fbCalls = () => e.cloud.calls.filter(c => c[0] === 'rpc' && c[1] === 'fm_submit_feedback');

        // 內容清理：控制字元／零寬字元去掉、連續空白縮成一格、三個以上換行縮成兩個、最多 500 字（用「字」不是 UTF-16 單位）
        ok(e.S.cleanFeedbackText('  甲​乙   丙\n\n\n\n丁\u0007 ') === '甲 乙 丙\n\n丁', '意見清理：零寬字元／控制字元／多餘空白與換行');
        ok(Array.from(e.S.cleanFeedbackText('𠀀'.repeat(600))).length === 500, '意見最多 500 個「字」（罕用字不會被切成兩半）');

        // 太短、缺遊戲代號：不送、不排隊
        let r = await e.S.submitFeedback({ scope: 'system', message: '我' });
        ok(r.status === 'skip' && fbCalls().length === 0 && e.S.pendingFeedbackCount() === 0, '少於 2 字：不送出也不排隊');
        r = await e.S.submitFeedback({ scope: 'game', message: '沒有遊戲代號的意見' });
        ok(r.status === 'skip' && fbCalls().length === 0, 'scope=game 沒有 gameKey：不送出');

        // 正常送出（有帳號）：參數正確
        e.S.setCurrentId('李白#1234');
        e.cloud.rpcResult = { data: { ok: true, saved: true }, error: null };
        r = await e.S.submitFeedback({ scope: 'game', gameKey: 'game22', gameTitle: '詩詞拼圖', message: '碎片太小了', version: 'V9.9.9.9' });
        const a = fbCalls()[0] && fbCalls()[0][2];
        ok(r.status === 'sent', '連線正常：回傳 sent');
        ok(a && a.p_scope === 'game' && a.p_game_key === 'game22' && a.p_game_title === '詩詞拼圖'
            && a.p_player_id === '李白#1234' && a.p_message === '碎片太小了' && a.p_version === 'V9.9.9.9', '遊戲意見：參數帶齊（範圍／遊戲／名稱／帳號／內容／版本）');

        // 系統面意見、訪客：遊戲欄位為 null、player_id 為空字串（資料庫當匿名）
        e.S.setCurrentId('');
        await e.S.submitFeedback({ scope: 'system', gameKey: 'game22', gameTitle: '不該帶', message: '選單字太小' });
        const b = fbCalls()[1][2];
        ok(b.p_scope === 'system' && b.p_game_key === null && b.p_game_title === null && b.p_player_id === '', '系統意見：不帶遊戲欄位；訪客 player_id 為空字串');

        // 重複送出（資料庫說 duplicate）也算送出
        e.cloud.rpcResult = { data: { ok: true, saved: false, duplicate: true }, error: null };
        r = await e.S.submitFeedback({ scope: 'system', message: '選單字太小' });
        ok(r.status === 'sent', '資料庫回報重複：視為已送出');

        // 資料庫明確拒絕／超過次數：不排隊
        e.cloud.rpcResult = { data: { ok: false, error: 'too_many' }, error: null };
        ok((await e.S.submitFeedback({ scope: 'system', message: '第三十一則' })).status === 'too-many', '超過次數：too-many');
        e.cloud.rpcResult = { data: { ok: false, error: 'bad_args' }, error: null };
        ok((await e.S.submitFeedback({ scope: 'system', message: '格式不對' })).status === 'rejected', '資料庫拒絕：rejected');
        e.cloud.rpcResult = { data: null, error: { code: '23514', message: 'violates check constraint' } };
        ok((await e.S.submitFeedback({ scope: 'system', message: '違反檢查' })).status === 'rejected', '有資料庫錯誤碼的非連線錯誤：rejected，不重送');
        ok(e.S.pendingFeedbackCount() === 0, '被拒絕的意見不排隊');

        // 連不上：排隊；函式還不存在（SQL 沒執行）：也排隊
        e.cloud.rpcResult = null; e.cloud.mode = 'network';
        ok((await e.S.submitFeedback({ scope: 'system', message: '離線時寫的意見' })).status === 'queued', '連不上：queued');
        e.cloud.mode = 'ok';
        e.cloud.rpcResult = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fm_submit_feedback' } };
        ok((await e.S.submitFeedback({ scope: 'game', gameKey: 'game4', message: 'SQL 還沒執行時寫的意見' })).status === 'queued', '函式不存在：queued（SQL 部署後補送）');
        e.nav.onLine = false;
        ok((await e.S.submitFeedback({ scope: 'system', message: '明確離線' })).status === 'queued', 'navigator.onLine=false：直接排隊、不白等');
        e.nav.onLine = true;
        ok(e.S.pendingFeedbackCount() === 3, '三則意見在佇列裡');
        ok(e.S.pendingCount() === 0, '意見佇列與遊戲紀錄佇列分開（pendingCount 不受影響）');

        // 補送：還是連不上 → 全留著；恢復後一次送完且順序不變
        e.cloud.rpcResult = null; e.cloud.mode = 'network';
        await e.S._flushFeedback();
        ok(e.S.pendingFeedbackCount() === 3, '補送時仍斷線：意見全部保留');
        e.cloud.mode = 'ok';
        const before = fbCalls().length;
        await e.S._flushFeedback();
        const sent = fbCalls().slice(before).map(c => c[2].p_message);
        ok(e.S.pendingFeedbackCount() === 0, '連線恢復：全部補送完、佇列清空');
        ok(JSON.stringify(sent) === JSON.stringify(['離線時寫的意見', 'SQL 還沒執行時寫的意見', '明確離線']), '補送順序與寫入順序相同');

        // flushPending 也會順手補送意見，而且意見補不上不影響「紀錄已全部送完」的回傳值
        e.S.setCurrentId('U123');
        e.cloud.mode = 'network'; e.nav.onLine = false;
        await e.S.submitFeedback({ scope: 'system', message: '給 flushPending 補送的意見' });
        e.nav.onLine = true; e.cloud.mode = 'ok';
        ok(await e.S.flushPending() === true && e.S.pendingFeedbackCount() === 0, 'flushPending 會一併補送意見');

        // 佇列上限 5 則：超過丟最舊的
        e.nav.onLine = false;
        for (let i = 1; i <= 7; i++) await e.S.submitFeedback({ scope: 'system', message: '第 ' + i + ' 則意見' });
        e.nav.onLine = true;
        ok(e.S.pendingFeedbackCount() === 5, '意見佇列上限 5 則');
        ok(e.S._readFbQueue()[0].args.p_message === '第 3 則意見', '超過上限時丟掉最舊的');

        // 超過 30 天的意見補送時直接丟掉
        e.cloud.mode = 'ok';
        const q = e.S._readFbQueue();
        q[0].at = Date.now() - 31 * 24 * 3600 * 1000;
        e.S._writeFbQueue(q);
        const calls0 = fbCalls().length;
        await e.S._flushFeedback();
        ok(fbCalls().length - calls0 === 4 && e.S.pendingFeedbackCount() === 0, '超過 30 天的意見不補送（其餘 4 則補送完）');
    }

    console.log('\n' + '='.repeat(60));
    console.log('通過 ' + pass + ' 項　❌ ' + fail + ' 項');
    if (fail) { console.log('\n結果：✗ 未通過'); process.exit(1); }
    console.log('\n結果：✓ 全數通過');
}

main().catch(e => { console.error('驗證程式本身發生錯誤：', e); process.exit(2); });
