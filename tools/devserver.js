/* ==========================================================================
   花月 · 開發用靜態伺服器 (devserver.js)
   --------------------------------------------------------------------------
   單純的靜態檔案伺服器，唯一的重點是**一律送出 no-store 標頭**，
   避免瀏覽器快取住 JS/CSS，導致改了程式卻看到舊版（開發時極易誤判）。

   ⚠️ 僅供本機開發預覽使用，不是正式部署用的伺服器。

   執行方式：
      node tools/devserver.js [port]
   ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2], 10) || 8788;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(url.parse(req.url).pathname);
    } catch (e) {
        res.writeHead(400); res.end('Bad Request'); return;
    }

    if (pathname === '/') pathname = '/index.html';

    // 防止跳出專案目錄（路徑穿越）
    const filePath = path.join(ROOT, pathname);
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            // 開發期間關閉所有快取，確保改完存檔重整就一定看得到新版
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`花月開發伺服器已啟動：http://localhost:${PORT}  （已停用快取）`);
});
