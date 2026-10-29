/* ==========================================================================
   花月 · Service Worker 預快取清單產生器 (tools/build_sw.js)
   --------------------------------------------------------------------------
   產生根目錄的 sw-manifest.js：離線遊玩要快取哪些檔案、每個檔案的內容雜湊。
   sw.js 本身不含清單，開頭 importScripts('sw-manifest.js') 讀進來。

   ⚠️ 每次發布前必須執行（程式、資料、圖片有任何改動都要重跑）：
          node tools/build_sw.js
      忘記重跑的後果：玩家的 Service Worker 看不出有新檔案，會一直拿舊檔案給玩家，
      直到清單改變為止。tools/verify_sw.js 會檢查清單是否過期。

   ── 為什麼不能只讀 index.html ────────────────────────────────────────
   大部分遊戲的 CSS 並不在 index.html，而是各遊戲 JS 執行時才動態插入 <link>
   （例：game16.js 內有 link.href = 'game16.css'）。只看 HTML 的話，
   離線時所有遊戲都會「沒有樣式」。因此清單由兩個來源組成：
      1. index.html 的 <script src>／<link href>（去掉 HTML 註解）
      2. 所有 JS／CSS 裡「看起來像檔案路徑」的字串，且該檔案真的存在

   ── 核心(core)與離線包(pack) ──────────────────────────────────────────
   core：Service Worker 安裝時一次下載、保證可離線的檔案（程式、樣式、資料、選單縮圖、圖示）。
   pack：體積較大的圖片（獎狀、古地圖、寶箱…），玩家可在「離線與安裝」頁面選擇下載，
         沒下載的也會在「看過一次」之後自動快取。

   ── 輸出是決定性的 ────────────────────────────────────────────────────
   沒有時間戳、鍵值排序固定：內容沒變，輸出的檔案就一個位元組都不會變，
   這樣 Service Worker 才不會因為「重新跑了一次建置」就誤判有新版本而讓所有玩家重新下載。
   雜湊以「換行統一成 LF」計算：本機工作目錄是 CRLF、GitHub 上是 LF，兩邊算出來要一樣。
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'sw-manifest.js');

// 不論有沒有被引用，都不進快取的檔案（網路直通，或與玩家無關）
const NEVER_CACHE = new Set([
    'version.json',       // 版本檢查必須永遠打到伺服器，快取了就永遠看不到新版本
    'sw.js',              // 瀏覽器自己管 Service Worker 腳本的更新
    'sw-manifest.js',     // 由 sw.js 特別處理（見 sw.js 的 install）
    'examFlowTest.js'     // 開發用熱鍵測試工具，正式站根本不載入（見 index.html）
]);

// 已廢棄的檔案（見 .agent/skills/SKILL.md「已廢棄的檔案」）：不掃描也不收錄。
// 否則它們引用的資料檔（例如 enricher.html 的 lucky_pool.txt）會被連帶塞進玩家的離線快取。
const DEPRECATED = new Set(['enricher.html', 'responsive.js', 'responsive.css', 'screen_adaptive.html']);

// 整個目錄都不掃描／不收錄
const SKIP_DIRS = new Set(['.git', '.agent', '.claude', '.vscode', 'node_modules', 'note', 'scratch', 'tools', 'images/Demo']);

// 一定放進 core 的圖片目錄（選單縮圖與安裝圖示，體積小而且每個畫面都會用到）
const CORE_IMAGE_DIRS = ['images/Menu/', 'images/icons/'];
// 單檔不超過這個大小的圖片，被程式引用時也放進 core
const CORE_IMAGE_MAX_BYTES = 150 * 1024;

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
// 「看起來像檔案路徑」的字串：不含引號／括號／空白，副檔名在白名單內
const REF_RE = /[^"'`()\s<>=,;{}|\\]+?\.(?:js|css|png|jpe?g|webp|gif|svg|ico|txt|json|mp3|ogg|wav|woff2?)(?=["'`)\s?#,;}]|$)/gi;

function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }

/** 內容雜湊：文字檔先把 CRLF 換成 LF，避免換行格式不同造成「內容沒變但雜湊變了」 */
function revOf(file) {
    let buf = fs.readFileSync(file);
    if (/\.(js|css|html|json|txt|svg)$/i.test(file)) {
        buf = Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    }
    return sha1(buf).slice(0, 10);
}

function toRel(abs) { return path.relative(ROOT, abs).split(path.sep).join('/'); }

function isSkipped(rel) {
    for (const d of SKIP_DIRS) if (rel === d || rel.startsWith(d + '/')) return true;
    return false;
}

function walk(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, e.name);
        const rel = toRel(abs);
        if (isSkipped(rel)) continue;
        if (e.isDirectory()) walk(abs, out);
        else out.push(rel);
    }
    return out;
}

/** 從一段文字抽出「存在於專案裡的檔案」的相對路徑 */
function refsIn(text, exists) {
    const found = new Set();
    let m;
    REF_RE.lastIndex = 0;
    while ((m = REF_RE.exec(text))) {
        let cand = m[0];
        if (/^(https?:)?\/\//i.test(cand) || /^data:/i.test(cand)) continue;
        cand = cand.replace(/^\.\//, '');
        try { cand = decodeURIComponent(cand); } catch (e) { /* 不是百分比編碼就原樣使用 */ }
        if (exists.has(cand) && !DEPRECATED.has(cand)) found.add(cand);
    }
    return found;
}

/** 計算清單（純函式，不寫檔；verify_sw.js 也用它來檢查 sw-manifest.js 是否過期） */
function computeManifest() {
    const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).version;
    const all = walk(ROOT, []);
    const exists = new Set(all);

    const core = new Set(['index.html', 'manifest.json']);
    const maybePack = new Set();
    const problems = [];

    // 1. index.html 靜態引用（先去掉註解，免得把被註解掉的標籤也收進來）
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)) {
        let ref = m[1];
        if (/^(https?:)?\/\//i.test(ref) || /^data:/i.test(ref)) continue;
        ref = decodeURIComponent(ref.split('?')[0].split('#')[0]);
        if (NEVER_CACHE.has(ref)) continue;
        if (!exists.has(ref)) { problems.push('index.html 引用了不存在的檔案：' + ref); continue; }
        core.add(ref);
    }

    // 2. 所有 JS／CSS／HTML 裡的檔案字串（動態插入的 CSS、資料檔、圖片）
    const scannable = all.filter(f => /\.(js|css|html)$/i.test(f) && !f.startsWith('vendor/')
        && !NEVER_CACHE.has(f) && !DEPRECATED.has(f));
    for (const f of scannable) {
        for (const ref of refsIn(fs.readFileSync(path.join(ROOT, f), 'utf8'), exists)) {
            if (NEVER_CACHE.has(ref)) continue;
            if (IMAGE_EXT.test(ref)) maybePack.add(ref);
            else core.add(ref);
        }
    }

    // 3. vendor/ 的函式庫（自架的第三方程式碼，離線時必須在）
    all.filter(f => f.startsWith('vendor/') && /\.js$/i.test(f)).forEach(f => core.add(f));

    // 4. 安裝圖示與選單縮圖：一律 core，不論有沒有被程式碼字串引用到
    all.filter(f => CORE_IMAGE_DIRS.some(d => f.startsWith(d)) && IMAGE_EXT.test(f)).forEach(f => core.add(f));

    // 5. 被引用的圖片：小的進 core，大的進 pack
    const pack = [];
    for (const ref of [...maybePack].sort()) {
        if (core.has(ref)) continue;
        const size = fs.statSync(path.join(ROOT, ref)).size;
        if (CORE_IMAGE_DIRS.some(d => ref.startsWith(d)) || size <= CORE_IMAGE_MAX_BYTES) core.add(ref);
        else pack.push({ u: ref, s: size });
    }

    const coreMap = {};
    for (const f of [...core].sort()) {
        if (!exists.has(f)) { problems.push('清單內的檔案不存在：' + f); continue; }
        coreMap[f] = revOf(path.join(ROOT, f));
    }

    const packOut = pack.map(p => ({ u: p.u, s: p.s, r: revOf(path.join(ROOT, p.u)) }));
    const build = sha1(Buffer.from(
        version + '\n' +
        Object.entries(coreMap).map(([k, v]) => k + ':' + v).join('\n') + '\n' +
        packOut.map(p => p.u + ':' + p.r).join('\n')
    )).slice(0, 10);

    const manifest = { version: version, build: build, core: coreMap, pack: packOut };
    return { manifest, problems, text: serialize(manifest) };
}

function serialize(manifest) {
    return '/* 自動產生，請勿手動編輯。重新產生：node tools/build_sw.js */\n' +
        'self.FM_SW = ' + JSON.stringify(manifest, null, 1) + ';\n';
}

function fmtMB(n) { return (n / 1048576).toFixed(2) + ' MB'; }

if (require.main === module) {
    const { manifest, problems, text } = computeManifest();
    if (problems.length) {
        console.error('❌ 無法產生清單：');
        problems.forEach(p => console.error('   - ' + p));
        process.exit(1);
    }
    const old = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    const same = old === text;
    if (!same) fs.writeFileSync(OUT_FILE, text, 'utf8');

    const coreBytes = Object.keys(manifest.core).reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
    const packBytes = manifest.pack.reduce((s, p) => s + p.s, 0);
    console.log('版本 ' + manifest.version + '　build ' + manifest.build);
    console.log('core（安裝時下載）：' + Object.keys(manifest.core).length + ' 個檔案，' + fmtMB(coreBytes));
    console.log('pack（選擇性下載）：' + manifest.pack.length + ' 個檔案，' + fmtMB(packBytes));
    console.log(same ? '✓ sw-manifest.js 沒有變動（內容與上次相同）' : '✓ 已更新 sw-manifest.js');
}

module.exports = { computeManifest, serialize, ROOT };
