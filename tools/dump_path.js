/* ==========================================================================
   花月 · 青雲梯站點清單輸出 (dump_path.js)
   --------------------------------------------------------------------------
   對應企畫書：note/學習道路_重新規劃企劃書.md 第五、八章

   執行方式：
      node tools/dump_path.js            → 摘要 + 前 20 站明細
      node tools/dump_path.js all        → 全部站點明細
      node tools/dump_path.js md         → 產生 note/青雲梯站點清單.md

   ⚠️ 實際的產生邏輯已抽到 tools/build_path_md.js，與 tools/converter.html
      共用同一份實作。本檔只負責「讀檔 → 呼叫 → 寫檔／印出」。
      要改輸出格式請改 build_path_md.js，不要只改其中一邊。
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

// eslint-disable-next-line no-eval
const POEMS = eval(fs.readFileSync(path.join(rootDir, 'data', 'poems.js'), 'utf8') + '; POEMS');
const LEVEL_TABLE = require(path.join(rootDir, 'data', 'level_table.js'));

const { generate } = require(path.join(__dirname, 'build_path_md.js'));

const mode = (process.argv[2] || '').toLowerCase();
const r = generate(POEMS, LEVEL_TABLE);

if (mode === 'md') {
    const target = path.join(rootDir, 'note', '青雲梯站點清單.md');
    fs.writeFileSync(target, r.markdown, 'utf8');
    console.log('已輸出：' + path.relative(rootDir, target));
    console.log('');
    console.log(r.summary);
    console.log(r.loadReport);
} else {
    console.log(r.summary);
    console.log(r.detail(mode === 'all' ? r.stations.length : 20));
    console.log(r.loadReport);
}
