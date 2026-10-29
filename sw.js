/* ==========================================================================
   花月 · Service Worker (sw.js) — 讓花月可以離線遊玩
   --------------------------------------------------------------------------
   預快取清單不寫在這裡，而是由 tools/build_sw.js 產生 sw-manifest.js，
   這裡用 importScripts 讀進來。瀏覽器判斷「Service Worker 有沒有新版」時，
   會連 importScripts 進來的檔案一起比對，所以清單一變，玩家就會自動更新。

   ⚠️ 發布前務必執行 node tools/build_sw.js（見 tools/verify_sw.js 的檢查）。

   ── 兩個快取 ──────────────────────────────────────────────────────────
   fm-core-<版本>-<build>   核心檔案（程式、樣式、資料、選單縮圖）。安裝時一次建好，
                            之後唯讀；每個版本一份，新版啟用後舊的整個刪掉。
   fm-assets-v1            執行時才快取的東西（獎狀、古地圖、Google 字體切片…）。
                            跨版本保留，因為這些檔案幾乎不會變。

   ── 為什麼核心檔案是「快取優先」而不是「網路優先」 ──────────────────────
   index.html 內有行內 script，會呼叫各 .js 的函式。如果 index.html 是新的、.js 還是舊的
   （或反過來），會出現「呼叫不存在的函式」這種很難重現的錯誤。所以整個核心檔案是
   「同一個版本、一起切換」：新版本在背景整批下載完成、才一起啟用（見 install／activate）。

   ── 更新流程（玩家端）────────────────────────────────────────────────
   1. 玩家開啟遊戲，瀏覽器背景檢查 sw.js／sw-manifest.js 有沒有變 → 有就安裝新版。
   2. 新版只下載「內容雜湊有變」的檔案，沒變的直接從舊快取複製，不重新下載。
   3. 安裝完成後進入「等待中」，不會打斷正在玩的遊戲。
   4. 玩家按「立即更新」，或下次開啟遊戲時（offline.js 發現有等待中的新版），
      才送出 SKIP_WAITING 啟用，並重新載入頁面。
   ========================================================================== */

'use strict';

importScripts('sw-manifest.js');

const FM = self.FM_SW;
const SCOPE = self.registration.scope;                       // 例：https://xxx.github.io/flower-moon/
const SCOPE_PATH = new URL(SCOPE).pathname;
const CORE_CACHE = 'fm-core-' + FM.version + '-' + FM.build;
const ASSET_CACHE = 'fm-assets-v1';
const REV_KEY = new URL('__fm_rev__', SCOPE).href;           // 存在核心快取裡的「檔名→雜湊」對照表
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const ASSET_STALE_MS = 14 * 24 * 3600 * 1000;                // 執行時快取的檔案超過這個天數，背景重新驗證一次
const FETCH_CONCURRENCY = 6;

/** 專案內的相對路徑 → 完整網址（中文檔名會自動做百分比編碼，與瀏覽器送出的請求網址一致） */
function abs(p) { return new URL(p, SCOPE).href; }

// ── 安裝：預快取核心檔案 ─────────────────────────────────────────────

self.addEventListener('install', function (event) {
    event.waitUntil(precache());
});

async function precache() {
    const cache = await caches.open(CORE_CACHE);

    // 找一份「上一版的核心快取」：沒改動的檔案直接從那裡複製，不必重新下載
    let oldCache = null, oldRev = {};
    for (const name of await caches.keys()) {
        if (!name.startsWith('fm-core-') || name === CORE_CACHE) continue;
        const c = await caches.open(name);
        const r = await c.match(REV_KEY);
        if (r) { oldCache = c; oldRev = await r.json(); break; }
    }

    // sw-manifest.js 自己不在清單裡（它是清單本身），但離線時頁面需要讀它，所以一併快取
    const entries = Object.entries(FM.core).concat([['sw-manifest.js', FM.build]]);
    const todo = [];
    for (const [path, rev] of entries) {
        const url = abs(path);
        // 這個快取名稱帶有 build 雜湊＝內容固定；上次安裝若中途被中斷，已存在的檔案可以直接沿用
        if (await cache.match(url)) continue;
        if (oldCache && oldRev[path] === rev) {
            const hit = await oldCache.match(url);
            if (hit) { await cache.put(url, hit); continue; }
        }
        todo.push(path);
    }

    // 有限度地並行下載（一次全開會塞滿手機的連線數）
    let next = 0;
    async function worker() {
        while (next < todo.length) {
            const path = todo[next++];
            // cache:'reload' 繞過 HTTP 快取：GitHub Pages 會讓檔案在瀏覽器 HTTP 快取留約 10 分鐘，
            // 剛發布就更新的話可能抓到舊檔案，造成「版本號是新的、內容是舊的」。
            const res = await fetch(abs(path), { cache: 'reload' });
            if (!res.ok) throw new Error('下載失敗 ' + res.status + '：' + path);
            await cache.put(abs(path), res);
        }
    }
    const workers = [];
    for (let i = 0; i < Math.min(FETCH_CONCURRENCY, todo.length); i++) workers.push(worker());
    await Promise.all(workers);

    // 最後才寫「完成記號」：沒有它的快取代表安裝沒做完，不會被當成可靠的上一版
    await cache.put(REV_KEY, new Response(JSON.stringify(FM.core),
        { headers: { 'content-type': 'application/json' } }));
}

// ── 啟用：清掉舊版快取 ───────────────────────────────────────────────

self.addEventListener('activate', function (event) {
    event.waitUntil((async function () {
        const keep = new Set([CORE_CACHE, ASSET_CACHE]);
        for (const name of await caches.keys()) {
            const ours = name.startsWith('fm-core-') || name.startsWith('fm-assets-');
            if (ours && !keep.has(name)) await caches.delete(name);
        }
        await self.clients.claim();
    })());
});

// 頁面確認要套用新版時才啟用（避免打斷玩家正在進行的遊戲）
self.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── 攔截請求 ─────────────────────────────────────────────────────────

self.addEventListener('fetch', function (event) {
    const req = event.request;
    if (req.method !== 'GET') return;
    if (req.headers.has('range')) return;   // 影音的分段請求交給瀏覽器，快取了反而會壞

    const url = new URL(req.url);

    if (url.origin === self.location.origin) {
        if (!url.pathname.startsWith(SCOPE_PATH)) return;
        let rel;
        try { rel = decodeURIComponent(url.pathname.slice(SCOPE_PATH.length)); }
        catch (e) { return; }
        // 版本檢查一定要打到伺服器，快取了就永遠看不到新版本
        if (rel === 'version.json' || rel === 'sw.js') return;
        event.respondWith(handleLocal(event, req, rel));
        return;
    }

    // Google 字體：連線時快取起來，離線沿用。其他跨網域（Supabase 等）完全不碰，直接走網路。
    if (FONT_HOSTS.indexOf(url.hostname) >= 0) {
        event.respondWith(handleFont(event, req));
    }
});

async function handleLocal(event, req, rel) {
    const core = await caches.open(CORE_CACHE);

    // 頁面導覽：不論網址帶什麼參數（?game=、?page=、?_v=、?source=pwa…）或是直接開根網址，
    // 都回同一份 index.html（它是單頁應用程式，靠參數決定開哪一頁）
    if (req.mode === 'navigate' || rel === '' || rel === 'index.html') {
        const page = await core.match(abs('index.html'));
        if (page) return page;
        try { return await fetch(req); } catch (e) { return offlinePage(); }
    }

    // 核心檔案：快取優先，忽略查詢字串（例如 script.js?v=2）
    const hit = await core.match(req, { ignoreSearch: true });
    if (hit) return hit;

    // 其餘同網域資源（圖片、獎狀…）
    return handleAsset(event, req);
}

async function handleAsset(event, req) {
    const cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
        // 檔案幾乎不會變，所以不是每次都檢查；放太久才在背景重新驗證一次（不阻擋回應）
        const d = Date.parse(hit.headers.get('date') || '');
        if (!d || Date.now() - d > ASSET_STALE_MS) event.waitUntil(refresh(cache, req));
        return hit;
    }
    try {
        const res = await fetch(req);
        if (res && res.ok && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()));
        return res;
    } catch (e) {
        return Response.error();   // 離線而且沒快取過：讓頁面自己處理（圖片載入失敗）
    }
}

async function refresh(cache, req) {
    try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) await cache.put(req, res);
    } catch (e) { /* 離線就算了，下次再說 */ }
}

/** 字體：快取優先；沒快取就走網路並存起來 */
async function handleFont(event, req) {
    const cache = await caches.open(ASSET_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
        const res = await fetch(req);
        if (res && res.ok) event.waitUntil(cache.put(req, res.clone()));
        return res;
    } catch (e) {
        return Response.error();   // 離線：退回系統字體，版面不會壞
    }
}

/** 連 index.html 都沒有（沒裝好、又離線）時，至少告訴玩家發生什麼事 */
function offlinePage() {
    const html = '<!DOCTYPE html><html lang="zh-Hant"><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>花月</title><body style="margin:0;display:flex;min-height:100vh;align-items:center;' +
        'justify-content:center;background:#621818;color:#f3e6c4;font:18px/1.7 serif;text-align:center;padding:24px">' +
        '<div><div style="font-size:40px;margin-bottom:12px">花月</div>' +
        '目前沒有網路，而且還沒有下載遊戲檔案。<br>請連上網路後再開啟一次。</div></body></html>';
    return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
