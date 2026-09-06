/* ==========================================================================
   花月 · Node 版瀏覽器環境模擬 (fm_env.js)
   --------------------------------------------------------------------------
   讓 tools/ 底下的驗證程式可以直接載入**專案真正的**前端模組
   （script.js / scoreManager.js / learningPath.js / gameXX.js …），
   在 Node 裡以真實邏輯跑流程驗證，而不是另外抄一份規則來對答案。

   ── 為什麼要這樣做 ────────────────────────────────────────────────────
   驗證程式若自己重寫一份「文位怎麼升、獎勵怎麼發」的邏輯，就等於把規格
   抄成第二份：兩邊一旦飄移，驗證通過也不代表遊戲是對的（本專案已在
   群英榜文位判定上吃過這個虧，見 learningPath.js getRankFromSave 的說明）。
   因此這裡只模擬**瀏覽器環境**，商業邏輯一律用線上那一份。

   ── 用法 ──────────────────────────────────────────────────────────────
       const env = require('./fm_env.js');
       env.boot();                       // 建立 window/document/localStorage…
       env.loadCore();                   // 載入青雲梯所需的核心模組
       env.loadGames();                  // 載入 game1~game40
       env.resetSave();                  // 清空存檔，開始新的一個劇本

   ⚠️ 這是「能讓模組載入並執行純邏輯」的最小環境，不是 jsdom。
      任何真的要畫面才能跑的東西（canvas 繪圖、動畫、事件）都會安靜地
      變成 no-op。驗證程式只應該用它跑**邏輯**，不要拿它驗介面。
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

/** 建立一個什麼都吃、什麼都不做的假 DOM 元素 */
function makeEl() {
    const el = {
        id: '', className: '', innerHTML: '', textContent: '', value: '',
        scrollTop: 0, scrollLeft: 0, clientHeight: 850, clientWidth: 500,
        scrollHeight: 850, offsetTop: 0, offsetHeight: 0, disabled: false,
        style: {}, dataset: {}, children: [], parentNode: null,
        classList: {
            add() { }, remove() { }, toggle() { }, contains() { return false; }
        },
        appendChild() { }, removeChild() { }, remove() { }, insertBefore() { },
        setAttribute() { }, getAttribute() { return null; }, removeAttribute() { },
        addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
        querySelector() { return makeEl(); }, querySelectorAll() { return []; },
        closest() { return null; }, focus() { }, blur() { }, click() { },
        scrollTo() { }, scrollIntoView() { },
        getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
        setPointerCapture() { }, releasePointerCapture() { },
        // canvas：任何方法都回傳 no-op，避免遊戲初始化時炸掉
        getContext() { return new Proxy({}, { get: () => () => ({}) }); },
        toDataURL() { return ''; }
    };
    return el;
}

let booted = false;
const store = {};

/** 建立 Node 版的 window / document / localStorage 等全域物件 */
function boot() {
    if (booted) return global;
    booted = true;

    global.window = global;
    // window 層級的事件（青雲梯的拖曳捲動、screen_adaptive 的 resize…）
    global.addEventListener = () => { };
    global.removeEventListener = () => { };
    global.dispatchEvent = () => true;
    global.visualViewport = null;
    global.innerWidth = 500;
    global.innerHeight = 850;
    global.scrollTo = () => { };

    global.document = {
        readyState: 'complete',
        body: makeEl(), head: makeEl(), documentElement: makeEl(), cookie: '',
        getElementById() { return null; },
        createElement() { return makeEl(); },
        createElementNS() { return makeEl(); },
        createTextNode() { return makeEl(); },
        createDocumentFragment() { return makeEl(); },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() { }, removeEventListener() { }
    };

    // navigator 在新版 Node 是唯讀的 getter，必須用 defineProperty 覆蓋
    try {
        Object.defineProperty(global, 'navigator', {
            value: { userAgent: 'node', language: 'zh-TW', onLine: true },
            configurable: true
        });
    } catch (e) { /* 覆蓋不了就用 Node 內建的，不影響驗證 */ }

    global.location = {
        href: 'http://localhost/index.html', origin: 'http://localhost',
        search: '', hash: '', pathname: '/index.html', reload() { }
    };

    global.localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => { delete store[k]; }); }
    };
    global.sessionStorage = global.localStorage;

    global.requestAnimationFrame = () => 0;
    global.cancelAnimationFrame = () => { };
    global.alert = () => { };
    global.confirm = () => true;
    global.prompt = () => null;
    global.Image = function () { return makeEl(); };
    global.Audio = function () { return { play() { }, pause() { }, addEventListener() { } }; };
    global.getComputedStyle = () => ({ getPropertyValue: () => '' });
    global.matchMedia = () => ({ matches: false, addListener() { }, removeListener() { } });
    // SoundManager 開場就會 new AudioContext()，沒有它會在每一次播音效時
    // 印一整段 stack trace，把驗證輸出洗掉。給一個什麼都不做的替身。
    global.AudioContext = function () {
        return {
            state: 'running', currentTime: 0, destination: {},
            createGain: () => ({ gain: { value: 1, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect() { }, disconnect() { } }),
            createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect() { }, start() { }, stop() { }, disconnect() { } }),
            createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
            createBufferSource: () => ({ buffer: null, connect() { }, start() { }, stop() { }, disconnect() { } }),
            createBiquadFilter: () => ({ type: '', frequency: { value: 0, setValueAtTime() { } }, Q: { value: 1 }, connect() { }, disconnect() { } }),
            createDynamicsCompressor: () => ({ connect() { }, disconnect() { } }),
            resume: () => Promise.resolve(), close: () => Promise.resolve()
        };
    };
    global.webkitAudioContext = global.AudioContext;
    global.fetch = () => Promise.reject(new Error('fm_env: 離線驗證環境不提供網路'));
    global.stageScale = 1;
    global.stageRect = null;
    global.registerOverlayResize = () => { };

    // 詩詞資料與關卡表：與瀏覽器一樣掛成全域
    // eslint-disable-next-line no-eval
    global.POEMS = eval(fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8') + '; POEMS');
    global.LEVEL_TABLE = require(path.join(rootDir, 'data', 'level_table.js'));

    return global;
}

/**
 * 載入一個前端模組（以 index.html 的 <script> 方式執行）。
 * @returns {{file:string, ok:boolean, error:string}}
 */
function loadFile(file) {
    try {
        // eslint-disable-next-line no-eval
        (0, eval)(fs.readFileSync(path.join(rootDir, file), 'utf8'));
        return { file: file, ok: true, error: '' };
    } catch (e) {
        return { file: file, ok: false, error: e.message };
    }
}

// 青雲梯與文位升等會用到的核心模組，順序與 index.html 一致
const CORE_FILES = [
    'script.js',
    'levelTable.js',
    'pathStations.js',
    'scoreManager.js',
    'fmCollectionSave.js',
    'examConfig.js',
    'achievement.js',          // rankRewards（獎勵金額的唯一來源）
    'collection.js',           // CollectionDialog.getExamFee（報名費的唯一來源）
    'supabaseClient.js',       // logGame（雲端 game_logs 的唯一組裝處）
    'promotionCelebration.js',
    'difficulty-selector.js',
    'gameMessage.js',
    'learningPath.js',
    'examEngine.js'
];

function loadCore() {
    boot();
    return CORE_FILES.map(loadFile);
}

/** 載入 game1 ~ game40（不存在的編號自動略過） */
function loadGames(maxNo) {
    boot();
    const out = [];
    for (let n = 1; n <= (maxNo || 40); n++) {
        const file = 'game' + n + '.js';
        if (!fs.existsSync(path.join(rootDir, file))) continue;
        const r = loadFile(file);
        r.no = n;
        out.push(r);
    }
    return out;
}

/**
 * 攔截雲端寫入，把 game_logs 的 payload 收進陣列。
 *
 * ⚠️ 刻意**不**自己組 payload：`is_ranked` / `poem_id` / `station_name`
 *    三個欄位是 supabaseClient.logGame 內部依當下的 LevelTable 情境與
 *    LearningPath 站點推算出來的。驗證程式若自己抄一份，抄錯了會驗出
 *    一個「假的正確」，而且正是這三個欄位當初加進來就是為了稽核出題錯誤。
 *    這裡只換掉「真的送去資料庫」那一步，其餘完全走線上程式。
 *
 * @returns {{logs:Array, saves:number, restore:Function}}
 */
function captureCloud() {
    boot();
    const S = global.SupabaseClient;
    const out = { logs: [], saves: 0, restore: function () { } };
    if (!S) return out;

    // logGame 開頭會查引繼碼，沒有就直接 return（與線上一致）
    global.localStorage.setItem('flower_moon_id', 'VERIFY-LOCAL');

    const origInit = S.init;
    const origInsert = S._insertGameLogWithFallback;
    const origSave = S.saveGameToCloud;
    const origSilver = S.logSilverEvent;
    S.init = function () { return true; };
    S._insertGameLogWithFallback = function (payload) { out.logs.push(payload); return Promise.resolve(); };
    S.saveGameToCloud = function () { out.saves++; return Promise.resolve(); };
    // 文錢流水帳也攔下來：沒攔的話每發一次文錢就噴一次
    // 「文錢流水帳寫入失敗」的 stack trace，把驗證輸出洗掉。
    if (typeof origSilver === 'function') {
        out.silverEvents = [];
        S.logSilverEvent = function (amount, source, note) {
            out.silverEvents.push({ amount: amount, source: source, note: note });
            return Promise.resolve();
        };
    }

    out.restore = function () {
        S.init = origInit;
        S._insertGameLogWithFallback = origInsert;
        S.saveGameToCloud = origSave;
        if (typeof origSilver === 'function') S.logSilverEvent = origSilver;
    };
    return out;
}

/** 讀取專案內某個檔案的原始碼（給原始碼層級的檢查用） */
function readSource(file) {
    const p = path.join(rootDir, file);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function exists(file) {
    return fs.existsSync(path.join(rootDir, file));
}

/**
 * 清空存檔，回到「全新玩家」狀態，讓每個劇本互不干擾。
 * ⚠️ 快取也必須一併清掉：LearningPath 會把進度表快取起來
 *    （buildProgressCache），不清就會拿上一個劇本的進度來算。
 */
function resetSave() {
    const keepId = global.localStorage.getItem('flower_moon_id');
    global.localStorage.clear();
    // ⚠️ 引繼碼要留著：logGame 開頭沒有它就直接 return，LOG 會整份不見。
    if (keepId) global.localStorage.setItem('flower_moon_id', keepId);
    if (global.LearningPath && global.LearningPath.invalidateProgress) {
        global.LearningPath.invalidateProgress();
    }
    if (global.ScoreManager && global.ScoreManager.setReviewMode) {
        global.ScoreManager.setReviewMode(false);
    }
    if (global.LearningPath) {
        global.LearningPath._recent = [];
        global.LearningPath._lastGame = null;
        global.LearningPath._sameGameStreak = 0;
        global.LearningPath._pendingUnit = null;
        global.LearningPath._currentStation = null;
        global.LearningPath._reviewMode = false;
        global.LearningPath._stationIdxAtLaunch = -1;
    }
}

module.exports = {
    rootDir: rootDir,
    boot: boot,
    makeEl: makeEl,
    loadFile: loadFile,
    loadCore: loadCore,
    loadGames: loadGames,
    captureCloud: captureCloud,
    readSource: readSource,
    exists: exists,
    resetSave: resetSave,
    CORE_FILES: CORE_FILES
};
