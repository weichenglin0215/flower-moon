const fs = require('fs');
const path = require('path');

// 參數
const minRating = 4; // 只收集詩詞評價大於等於預設值 4

// 讀取 poems.js，提取 POEMS 陣列
const poemsFilePath = path.join(__dirname, '../data/poems.js');
const poemsFileContent = fs.readFileSync(poemsFilePath, 'utf8');

// 簡單的用 eval 取得 POEMS 陣列 (因為 poems.js 只包含 const POEMS = [...];)
let POEMS;
try {
    const scriptToEval = poemsFileContent.replace('const POEMS =', 'POEMS =');
    eval(scriptToEval);
} catch (e) {
    console.error("無法將 poems.js 解析為陣列：", e);
    process.exit(1);
}

const charCountMap = new Map();

POEMS.forEach(poem => {
    // 篩選評價大於等於 minRating 的詩詞
    if ((poem.rating || 0) >= minRating) {
        if (poem.content && Array.isArray(poem.content)) {
            poem.content.forEach(line => {
                // 洗去標點符號與空白字元
                const cleanLine = line.replace(/[，。？！、：；「」『』\s]/g, "");
                for (let i = 0; i < cleanLine.length; i++) {
                    const char = cleanLine[i];
                    charCountMap.set(char, (charCountMap.get(char) || 0) + 1);
                }
            });
        }
    }
});

// 將 Map 轉換為陣列並排序 (由大到小)
const sortedCharData = Array.from(charCountMap.entries())
    .sort((a, b) => b[1] - a[1]);

// 輸出成 .js 檔案
const outputFilePath = path.join(__dirname, '../data/最常見詩詞字排名.js');
let outputContent = 'const CharacterFrequencyRank = [\n';
sortedCharData.forEach((entry, i) => {
    const comma = i < sortedCharData.length - 1 ? ',' : '';
    outputContent += `  ["${entry[0]}", ${entry[1]}]${comma}\n`;
});
outputContent += '];\n';

fs.writeFileSync(outputFilePath, outputContent, 'utf8');

console.log(`成功匯出 ${sortedCharData.length} 個常用字 (評分 >= ${minRating}) 到 data/最常見詩詞字排名.js`);
