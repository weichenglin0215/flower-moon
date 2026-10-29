/* ==========================================================================
   花月 · 離線／安裝功能驗證 (tools/verify_sw.js)
   --------------------------------------------------------------------------
   執行：  node tools/verify_sw.js
   修改以下任何一項之後都要跑，必須全部 ✓ 才算完成：
     sw.js／offline.js／installGuide.js／fmEnv.js／manifest.json／vendor/／index.html 的載入清單／
     任何會被離線快取的檔案（程式、樣式、資料、圖片）

   ── 兩大部分 ────────────────────────────────────────────────────────────
   A. 靜態檢查：sw-manifest.js 有沒有過期、檔案是否都存在、manifest.json 與圖示是否正確、
      index.html 有沒有殘留 CDN、vendor/ 檔案有沒有被改動…
   B. 行為模擬：在 Node 裡用假的 caches／fetch「真的執行 sw.js」，驗證
      首次安裝、導覽請求、版本檢查直通、離線回應、增量更新、安裝失敗、SKIP_WAITING。

   為什麼要有 B：Service Worker 的 bug 對玩家的傷害最大 —— 出錯時玩家會被卡在壞掉的舊版，
   而且你這邊重新整理看不到問題（因為你的快取是好的）。這種東西不能靠「上線後再看看」。
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { computeManifest, serialize, ROOT } = require('./build_sw.js');

let pass = 0, fail = 0;
const failures = [];

function ok(cond, name, detail) {
    if (cond) { pass++; return; }
    fail++;
    failures.push(name + (detail ? '\n      ' + detail : ''));
    console.log('  ❌ ' + name + (detail ? '\n      ' + detail : ''));
}

function section(title) { console.log('\n■ ' + title); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

// ═══════════════════════════════════════════════════════════════════════
// A. 靜態檢查
// ═══════════════════════════════════════════════════════════════════════

function staticChecks() {
    section('A1. 預快取清單 sw-manifest.js');
    const built = computeManifest();
    built.problems.forEach(p => ok(false, '清單產生問題：' + p));
    const onDisk = exists('sw-manifest.js') ? read('sw-manifest.js').replace(/\r\n/g, '\n') : '';
    ok(onDisk === built.text,
        'sw-manifest.js 已是最新',
        '清單已過期（程式／資料／圖片有變動，或剛改過版本號），請執行：node tools/build_sw.js');
    ok(built.manifest.version === JSON.parse(read('version.json')).version,
        'sw-manifest.js 的版本 = version.json');
    ok(Object.keys(built.manifest.core).length > 50, 'core 清單不是空的（' + Object.keys(built.manifest.core).length + ' 個檔案）');
    ['index.html', 'manifest.json', 'vendor/supabase.js', 'vendor/lunar.js', 'vendor/qrcode.min.js',
        'script.js', 'scoreManager.js', 'offline.js', 'installGuide.js', 'fmEnv.js'].forEach(f => {
        ok(!!built.manifest.core[f], 'core 含有 ' + f);
    });
    ['version.json', 'sw.js', 'sw-manifest.js'].forEach(f => {
        ok(!built.manifest.core[f], f + ' 不可進快取（版本檢查／Service Worker 自身必須走網路）');
    });

    // 動態載入的遊戲 CSS（只在 JS 裡寫 link.href = 'xxx.css'）一個都不能漏
    const dynCss = [];
    fs.readdirSync(ROOT).filter(f => /^game\d+\.js$/.test(f)).forEach(f => {
        const m = read(f).match(/link\.href\s*=\s*'([^']+\.css)'/);
        if (m) dynCss.push(m[1]);
    });
    ok(dynCss.length > 20, '找得到遊戲動態載入的 CSS（' + dynCss.length + ' 個）');
    dynCss.forEach(c => ok(!!built.manifest.core[c], '動態載入的 ' + c + ' 在清單內', '離線時該遊戲會完全沒有樣式'));

    section('A2. index.html');
    const html = read('index.html');
    const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const externals = [...noComments.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
    const badExt = externals.filter(u => !/^https:\/\/fonts\.googleapis\.com\//.test(u));
    ok(badExt.length === 0, 'index.html 沒有殘留 CDN 腳本（只允許 Google Fonts）', badExt.join(', '));
    ok(/<link rel="manifest" href="manifest\.json">/.test(noComments), '有 <link rel="manifest">');
    ok(/<meta name="theme-color"/.test(noComments), '有 theme-color');
    ok(/<link rel="apple-touch-icon" href="images\/icons\/apple-touch-icon-180\.png">/.test(noComments), '有 apple-touch-icon（iOS 不讀 manifest 圖示）');
    const idx = n => noComments.indexOf('src="' + n + '"');
    ok(idx('fmEnv.js') > 0 && idx('fmEnv.js') < idx('installGuide.js'), 'fmEnv.js 排在 installGuide.js 之前');
    ok(idx('fmEnv.js') < idx('offline.js'), 'fmEnv.js 排在 offline.js 之前');
    ok(idx('vendor/supabase.js') > 0 && idx('vendor/supabase.js') < idx('supabaseClient.js'), 'vendor/supabase.js 排在 supabaseClient.js 之前');
    ok(idx('vendor/lunar.js') > 0, '有載入 vendor/lunar.js');
    ok(idx('versionCheck.js') > 0 && idx('versionCheck.js') < idx('fmEnv.js'), 'versionCheck.js 仍是最先載入的腳本之一');

    section('A3. manifest.json 與圖示');
    let mf = null;
    try { mf = JSON.parse(read('manifest.json')); } catch (e) { ok(false, 'manifest.json 是合法 JSON', e.message); }
    if (mf) {
        ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons'].forEach(k => {
            ok(mf[k] !== undefined, 'manifest 有 ' + k);
        });
        ok(mf.display === 'standalone', 'display 是 standalone');
        ok(!/^\//.test(mf.start_url) && !/^https?:/.test(mf.start_url), 'start_url 是相對路徑（GitHub Pages 部署在子路徑，寫 / 開頭會跑到網域根目錄）');
        ok(!/^\//.test(mf.scope) && !/^https?:/.test(mf.scope), 'scope 是相對路徑');
        const hasSize = (s, purpose) => (mf.icons || []).some(i => i.sizes === s && (i.purpose || 'any').split(' ').includes(purpose));
        ok(hasSize('192x192', 'any'), '有 192×192 any 圖示');
        ok(hasSize('512x512', 'any'), '有 512×512 any 圖示');
        ok(hasSize('512x512', 'maskable'), '有 512×512 maskable 圖示');
        (mf.icons || []).forEach(i => {
            const rel = i.src;
            if (!exists(rel)) { ok(false, '圖示存在：' + rel); return; }
            const b = fs.readFileSync(path.join(ROOT, rel));
            const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
            ok(i.sizes === w + 'x' + h, '圖示 ' + rel + ' 實際尺寸與宣告相符', '宣告 ' + i.sizes + '、實際 ' + w + 'x' + h);
        });
        ok(exists('images/icons/apple-touch-icon-180.png'), 'apple-touch-icon-180.png 存在');
    }

    section('A4. vendor/ 檔案完整性');
    const readme = read('vendor/README.md');
    ['lunar.js', 'supabase.js', 'qrcode.min.js'].forEach(f => {
        const sum = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'vendor', f))).digest('hex');
        ok(readme.includes(sum), 'vendor/' + f + ' 的 SHA-256 與 vendor/README.md 記錄相符',
            '檔案被改動過，或升級後沒更新 README。目前雜湊：' + sum);
    });

    section('A5. 腳本語法與關鍵設計');
    ['sw.js', 'offline.js', 'offlineDialog.js', 'installGuide.js', 'fmEnv.js', 'qr-dialog.js',
        'supabaseClient.js', 'cloudSaveDialog.js', 'versionCheck.js', 'menu.js'].forEach(f => {
        try { new vm.Script(read(f), { filename: f }); ok(true, f + ' 語法正確'); }
        catch (e) { ok(false, f + ' 語法正確', e.message); }
    });
    const sw = read('sw.js');
    ok(/importScripts\('sw-manifest\.js'\)/.test(sw), 'sw.js 用 importScripts 讀清單（瀏覽器才會把清單變動視為 SW 更新）');
    ok((sw.match(/skipWaiting\(\)/g) || []).length === 1, 'sw.js 只在收到 SKIP_WAITING 訊息時才 skipWaiting（避免更新打斷玩家的遊戲）');
    ok(/rel === 'version\.json'/.test(sw), 'sw.js 讓 version.json 直通網路');
    const qr = read('qr-dialog.js');
    ok(/openExternalBrowser=1/.test(qr), 'QR／分享網址帶 openExternalBrowser=1（讓 LINE 改用預設瀏覽器開啟）');
    ok(!/cdnjs\.cloudflare\.com/.test(qr.replace(/\/\/.*$/gm, '')), 'qr-dialog.js 不再依賴 cdnjs');
    ok(/offline/.test(read('menu.js')) && /OfflineDialog/.test(read('menu.js')), '選單有「離線與安裝」');
    const vc = read('versionCheck.js');
    ok(/serviceWorker\.controller/.test(vc), 'versionCheck.js 在 Service Worker 接手時不做強制重新整理');
}

// ═══════════════════════════════════════════════════════════════════════
// B. Service Worker 行為模擬
// ═══════════════════════════════════════════════════════════════════════

const ORIGIN = 'https://example.test';
const SCOPE = ORIGIN + '/flower-moon/';

/** 記憶體版 Cache：存的是「已讀完 body 的快照」，match 時重建 Response（與真實 Cache API 行為一致） */
class MockCache {
    constructor() { this.m = new Map(); }
    async match(req, opts) {
        const url = typeof req === 'string' ? req : req.url;
        let hit = this.m.get(url);
        if (!hit && opts && opts.ignoreSearch) {
            const base = url.split('?')[0];
            for (const [k, v] of this.m) if (k.split('?')[0] === base) { hit = v; break; }
        }
        return hit ? asResponse(hit) : undefined;
    }
    async put(req, res) {
        const url = typeof req === 'string' ? req : req.url;
        this.m.set(url, { status: res.status, headers: [...res.headers], buf: Buffer.from(await res.arrayBuffer()) });
    }
}
function asResponse(e) { return typeof e === 'function' ? e() : basic(new Response(e.buf, { status: e.status, headers: e.headers })); }
/** Node 的 Response.type 是 'default'，真實瀏覽器同網域請求是 'basic'；sw.js 依此判斷能不能快取 */
function basic(res) { Object.defineProperty(res, 'type', { value: 'basic' }); return res; }

class MockCacheStorage {
    constructor() { this.stores = new Map(); }
    async open(n) { if (!this.stores.has(n)) this.stores.set(n, new MockCache()); return this.stores.get(n); }
    async keys() { return [...this.stores.keys()]; }
    async has(n) { return this.stores.has(n); }
    async delete(n) { return this.stores.delete(n); }
}

/** 假網路：files 是「路徑 → 內容」，log 記錄實際打出去的請求 */
function makeNet(files) {
    const net = { files, log: [], offline: false, failPaths: new Set() };
    net.fetch = async (input) => {
        const url = typeof input === 'string' ? input : input.url;
        net.log.push(url);
        if (net.offline) throw new TypeError('Failed to fetch');
        const u = new URL(url);
        const p = decodeURIComponent(u.pathname.slice('/flower-moon/'.length));
        if (u.origin !== ORIGIN) return basic(new Response('外部：' + url, { status: 200 }));
        if (net.failPaths.has(p) || !(p in net.files)) return basic(new Response('not found', { status: 404 }));
        return basic(new Response(net.files[p], { status: 200, headers: { date: new Date().toUTCString() } }));
    };
    return net;
}

/** 在隔離的 vm 裡載入 sw.js，回傳可以觸發事件的控制代碼 */
function loadSW(manifest, cacheStorage, net) {
    const listeners = {};
    const flags = { skipped: 0, claimed: 0 };
    const selfObj = {
        registration: { scope: SCOPE },
        location: { origin: ORIGIN },
        addEventListener: (t, fn) => { listeners[t] = fn; },
        skipWaiting: () => { flags.skipped++; },
        clients: { claim: async () => { flags.claimed++; } }
    };
    const ctx = vm.createContext({
        self: selfObj, caches: cacheStorage, fetch: net.fetch,
        Response, Request, URL, Headers, Promise, JSON, Date, Set, Error, TypeError, console,
        decodeURIComponent, encodeURIComponent,
        importScripts: () => vm.runInContext('self.FM_SW = ' + JSON.stringify(manifest) + ';', ctx)
    });
    vm.runInContext(read('sw.js'), ctx, { filename: 'sw.js' });

    const h = { flags, listeners };
    h.install = async () => { const ev = { waitUntil(p) { ev.p = p; } }; listeners.install(ev); await ev.p; };
    h.activate = async () => { const ev = { waitUntil(p) { ev.p = p; } }; listeners.activate(ev); await ev.p; };
    h.message = (data) => listeners.message({ data });
    /** 送出一個 fetch 事件；回傳 {handled, res}。handled=false 代表 sw 沒有攔截（直通網路） */
    h.request = async (url, opts) => {
        opts = opts || {};
        const req = { url, method: opts.method || 'GET', mode: opts.mode || 'no-cors', headers: new Headers(opts.headers || {}) };
        let responded = null; const waits = [];
        listeners.fetch({ request: req, respondWith: (p) => { responded = Promise.resolve(p); }, waitUntil: (p) => waits.push(p) });
        const res = responded ? await responded : null;
        await Promise.all(waits);
        return { handled: !!responded, res };
    };
    return h;
}

const text = async (r) => r.res ? await r.res.text() : null;

function makeManifest(core, version, pack) {
    const build = crypto.createHash('sha1').update(version + JSON.stringify(core)).digest('hex').slice(0, 10);
    return { version, build, core, pack: pack || [] };
}

async function behaviourChecks() {
    const baseFiles = {
        'index.html': 'INDEX-V1', 'script.js': 'SCRIPT-V1', 'game1.css': 'CSS-V1',
        'data/poems.js': 'POEMS-V1', 'images/Menu/a 圖.jpg': 'JPG', 'sw-manifest.js': 'MANIFEST',
        'version.json': '{"version":"V1"}', 'images/big.png': 'BIGPNG'
    };
    const coreV1 = { 'index.html': 'r1', 'script.js': 'r2', 'game1.css': 'r3', 'data/poems.js': 'r4', 'images/Menu/a 圖.jpg': 'r5' };
    const packV1 = [{ u: 'images/big.png', s: 6, r: 'p1' }];
    const mV1 = makeManifest(coreV1, 'V1', packV1);
    const coreName = (m) => 'fm-core-' + m.version + '-' + m.build;

    section('B1. 首次安裝');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        const sw = loadSW(mV1, cs, net);
        await sw.install();
        const c = await cs.open(coreName(mV1));
        ok(net.log.length === Object.keys(coreV1).length + 1, '下載 core 全部檔案＋sw-manifest.js', '實際下載 ' + net.log.length + ' 次');
        for (const f of Object.keys(coreV1)) ok(!!(await c.match(SCOPE + encodeURI(f))), 'core 已快取 ' + f);
        ok(!!(await c.match(SCOPE + 'sw-manifest.js')), '離線頁面讀得到 sw-manifest.js');
        ok(!!(await c.match(SCOPE + '__fm_rev__')), '寫入「安裝完成」記號');
        ok(sw.flags.skipped === 0, '安裝後不自動 skipWaiting（不打斷玩家）');
        ok(net.log.every(u => u.startsWith(SCOPE)), '只向自己的網域下載');
    }

    section('B2. 攔截請求（有網路）');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        const sw = loadSW(mV1, cs, net);
        await sw.install(); await sw.activate();
        net.log.length = 0;

        let r = await sw.request(SCOPE + 'index.html?game=3&_v=V9&_t=1', { mode: 'navigate' });
        ok(await text(r) === 'INDEX-V1', '導覽請求（帶 ?game=）回快取的 index.html');
        r = await sw.request(SCOPE, { mode: 'navigate' });
        ok(await text(r) === 'INDEX-V1', '直接開根網址也回 index.html');
        r = await sw.request(SCOPE + 'script.js?v=2');
        ok(await text(r) === 'SCRIPT-V1', '核心檔案忽略查詢字串仍命中快取');
        r = await sw.request(SCOPE + encodeURI('images/Menu/a 圖.jpg'));
        ok(await text(r) === 'JPG', '中文／空格檔名（百分比編碼）能命中快取');
        ok(net.log.length === 0, '以上請求完全沒有打網路', '實際打了：' + net.log.join(', '));

        r = await sw.request(SCOPE + 'version.json?_=123');
        ok(!r.handled, 'version.json 不攔截（直通網路，才看得到新版本）');
        r = await sw.request(SCOPE + 'sw.js');
        ok(!r.handled, 'sw.js 不攔截');
        r = await sw.request('https://zxptpfwneoddlxbomotx.supabase.co/rest/v1/player_saves');
        ok(!r.handled, 'Supabase API 完全不碰');
        r = await sw.request(SCOPE + 'script.js', { method: 'POST' });
        ok(!r.handled, '非 GET 請求不攔截');
        r = await sw.request(SCOPE + 'images/big.png', { headers: { range: 'bytes=0-9' } });
        ok(!r.handled, 'Range 請求不攔截');
        r = await sw.request('https://example.test/other-site/x.js');
        ok(!r.handled, '同網域但不在 scope 內的路徑不攔截');

        // 執行時快取：第一次走網路並存起來，第二次不再打網路
        net.log.length = 0;
        r = await sw.request(SCOPE + 'images/big.png');
        ok(await text(r) === 'BIGPNG', '未預快取的圖片第一次走網路');
        const first = net.log.length;
        r = await sw.request(SCOPE + 'images/big.png');
        ok(await text(r) === 'BIGPNG' && net.log.length === first, '第二次直接用快取，不再打網路');

        // 字體
        net.log.length = 0;
        r = await sw.request('https://fonts.googleapis.com/css2?family=Noto+Serif+TC', { mode: 'cors' });
        ok(r.handled && (await text(r)).includes('外部'), 'Google 字體第一次走網路');
        const f1 = net.log.length;
        r = await sw.request('https://fonts.googleapis.com/css2?family=Noto+Serif+TC', { mode: 'cors' });
        ok(net.log.length === f1, 'Google 字體第二次用快取');
    }

    section('B3. 完全離線');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        const sw = loadSW(mV1, cs, net);
        await sw.install(); await sw.activate();
        await sw.request(SCOPE + 'images/big.png');                                       // 先在線時看過一次
        await sw.request('https://fonts.googleapis.com/css2?family=Noto+Serif+TC', { mode: 'cors' });
        net.offline = true;

        let r = await sw.request(SCOPE + 'index.html', { mode: 'navigate' });
        ok(await text(r) === 'INDEX-V1', '離線：頁面載得出來');
        r = await sw.request(SCOPE + 'game1.css');
        ok(await text(r) === 'CSS-V1', '離線：核心檔案載得出來');
        r = await sw.request(SCOPE + 'images/big.png');
        ok(await text(r) === 'BIGPNG', '離線：先前看過的圖片載得出來');
        r = await sw.request('https://fonts.googleapis.com/css2?family=Noto+Serif+TC', { mode: 'cors' });
        ok((await text(r)).includes('外部'), '離線：先前載入過的字體沿用快取');
        r = await sw.request(SCOPE + 'images/never-seen.png');
        ok(r.handled && r.res.type === 'error', '離線：沒快取過的圖片回「載入失敗」而不是讓整頁壞掉');
    }

    section('B4. 沒裝好又離線');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        const sw = loadSW(mV1, cs, net);
        await cs.open(coreName(mV1));               // 空的核心快取（等同安裝被中斷）
        net.offline = true;
        const r = await sw.request(SCOPE + 'index.html', { mode: 'navigate' });
        ok(r.handled && r.res.status === 503 && (await text(r)).includes('花月'), '回一頁說明文字，而不是瀏覽器的「無法連線」');
    }

    section('B5. 增量更新（只改一支檔案）');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        const sw1 = loadSW(mV1, cs, net);
        await sw1.install(); await sw1.activate();
        await sw1.request(SCOPE + 'images/big.png');   // 執行時快取，更新後必須保留

        const coreV2 = { ...coreV1, 'script.js': 'r2-new' };
        const mV2 = makeManifest(coreV2, 'V2', packV1);
        net.files['script.js'] = 'SCRIPT-V2';
        net.log.length = 0;
        const sw2 = loadSW(mV2, cs, net);
        await sw2.install();
        const downloaded = net.log.map(u => decodeURIComponent(u.slice(SCOPE.length)));
        ok(downloaded.length === 2 && downloaded.includes('script.js') && downloaded.includes('sw-manifest.js'),
            '只下載有變的檔案（script.js）與清單本身', '實際下載：' + downloaded.join(', '));
        const c2 = await cs.open(coreName(mV2));
        ok(await (await c2.match(SCOPE + 'script.js')).text() === 'SCRIPT-V2', '新版快取裡的 script.js 是新內容');
        ok(await (await c2.match(SCOPE + 'data/poems.js')).text() === 'POEMS-V1', '沒變的檔案從舊快取複製過來');

        // 新版安裝完、啟用之前：舊版仍然服務（不會讓正在玩的玩家看到新舊混合）
        let r = await sw1.request(SCOPE + 'script.js');
        ok(await text(r) === 'SCRIPT-V1', '新版啟用前，舊版 Service Worker 仍提供舊檔案');

        ok(sw2.flags.skipped === 0, '安裝完成後新版保持等待');
        sw2.message({ type: 'SOMETHING_ELSE' });
        ok(sw2.flags.skipped === 0, '不認識的訊息不會觸發 skipWaiting');
        sw2.message({ type: 'SKIP_WAITING' });
        ok(sw2.flags.skipped === 1, '收到 SKIP_WAITING 才啟用');

        await sw2.activate();
        const names = await cs.keys();
        ok(!names.includes(coreName(mV1)), '啟用後舊版核心快取被刪除');
        ok(names.includes(coreName(mV2)) && names.includes('fm-assets-v1'), '新版核心快取與執行時快取保留');
        r = await sw2.request(SCOPE + 'images/big.png');
        ok(await text(r) === 'BIGPNG', '更新後先前快取的大圖仍在');
        ok(sw2.flags.claimed === 1, '啟用後接管所有開啟中的頁面');
    }

    section('B6. 安裝失敗（部署時漏傳一支檔案）');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        const sw1 = loadSW(mV1, cs, net);
        await sw1.install(); await sw1.activate();

        const mV3 = makeManifest({ ...coreV1, 'game1.css': 'r3-new' }, 'V3', packV1);
        net.failPaths.add('game1.css');
        const sw3 = loadSW(mV3, cs, net);
        let threw = false;
        try { await sw3.install(); } catch (e) { threw = true; }
        ok(threw, '有檔案下載失敗時，整個安裝失敗（不會裝一半的版本）');
        const c3 = await cs.open(coreName(mV3));
        ok(!(await c3.match(SCOPE + '__fm_rev__')), '失敗的安裝沒有「完成」記號');
        const r = await sw1.request(SCOPE + 'index.html', { mode: 'navigate' });
        ok(await text(r) === 'INDEX-V1', '舊版仍正常服務玩家');
    }

    section('B7. 安裝中途被中斷後重試');
    {
        const cs = new MockCacheStorage(), net = makeNet({ ...baseFiles });
        net.failPaths.add('data/poems.js');
        const swA = loadSW(mV1, cs, net);
        try { await swA.install(); } catch (e) { /* 預期失敗 */ }
        net.failPaths.clear(); net.log.length = 0;
        const swB = loadSW(mV1, cs, net);
        await swB.install();
        ok(net.log.length < Object.keys(coreV1).length + 1, '重試時沿用上次已下載好的檔案', '重新下載了 ' + net.log.length + ' 個');
        const c = await cs.open(coreName(mV1));
        ok(!!(await c.match(SCOPE + '__fm_rev__')), '重試後安裝完成');
    }
}

// ═══════════════════════════════════════════════════════════════════════

(async function main() {
    console.log('花月 離線／安裝功能驗證');
    staticChecks();
    await behaviourChecks();

    console.log('\n' + '='.repeat(60));
    console.log('通過 ' + pass + ' 項　❌ ' + fail + ' 項');
    if (fail) {
        console.log('\n失敗清單：');
        failures.forEach(f => console.log('  - ' + f));
        console.log('\n結果：✗ 未通過');
        process.exit(1);
    }
    console.log('\n結果：✓ 全數通過');
})().catch(e => { console.error('驗證程式本身發生錯誤：', e); process.exit(2); });
