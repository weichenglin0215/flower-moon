/* =========================================
   全站通用邏輯（已分離至各元件）
   - 日曆邏輯請見 calendar.js
   - 卡片邏輯請見 cards.js
   ========================================= */

/* 
   此檔案保留以供全局邏輯使用。
*/

/**
 * 於詩詞資料庫中隨機選取題目之共用邏輯。
 * 遵循以下規則：
 * 1. 篩選 rating 大於等於 minRating 的詩。若無，則放寬條件。
 * 2. 由奇數句開始挑選，且該句的 line_ratings 大於等於 minRating。
 * 3. 確保總句數不小於 minLines 且不大於 maxLines (且維持為偶數)。
 * 4. 確保總字數不大於 maxChars 且不小於 minChars。
 * 5. 全程禁止以評分做排序，完全採絕對隨機挑選以維持多樣性。
 *
 * @param {number} minRating 最低詩詞/詩句評價要求
 * @param {number} minLines 最少行數 (必須連貫並保持為偶數)
 * @param {number} maxLines 最多行數上限 (如無限制可代入很大的數字，例如 100)
 * @param {number} minChars 最少字數要求
 * @param {number} maxChars 最多字數要求
 * @returns {object|null} 回傳包含 { poem: 原始詩詞物件, lines: [不含標點之乾淨句子字串陣列] } 的物件，若無結果則回傳 null。
 */
function getSharedRandomPoem(minRating, minLines, maxLines, minChars, maxChars) {
   if (typeof POEMS === 'undefined' || POEMS.length === 0) return null;

   const getValidStarts = (poem, checkStars) => {
      if (!poem.content || poem.content.length < minLines) return [];
      const validStarts = [];
      const lineRatings = poem.line_ratings || [];

      // 奇數句開始 (陣列 index = 0, 2, 4...)
      for (let i = 0; i <= poem.content.length - minLines; i += 2) {
         if (checkStars && (lineRatings[i] || 0) < minRating) continue;

         let charCount = 0;
         for (let j = 0; j < minLines; j++) {
            const raw = poem.content[i + j] || '';
            const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
            charCount += clean.length;
         }
         if (charCount <= maxChars && charCount >= minChars) {
            validStarts.push(i);
         }
      }
      return validStarts;
   };

   let validPoems = [];
   POEMS.forEach(poem => {
      if ((poem.rating || 0) >= minRating) {
         const starts = getValidStarts(poem, true);
         if (starts.length > 0) {
            validPoems.push({ poem, starts });
         }
      }
   });

   // 降級保護：若無符合所有條件的詩詞，放寬評分要求
   if (validPoems.length === 0) {
      POEMS.forEach(poem => {
         const starts = getValidStarts(poem, false);
         if (starts.length > 0) {
            validPoems.push({ poem, starts });
         }
      });
   }

   if (validPoems.length === 0) return null;

   // 絕對隨機挑選一首詩
   const chosen = validPoems[Math.floor(Math.random() * validPoems.length)];
   const chosenPoem = chosen.poem;

   // 絕對隨機選定起始句
   const startIdx = chosen.starts[Math.floor(Math.random() * chosen.starts.length)];

   let selectedLineCount = minLines;
   let currentChars = 0;

   // 計算基礎 minLines 句的總字數
   for (let j = 0; j < minLines; j++) {
      const raw = chosenPoem.content[startIdx + j] || '';
      const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
      currentChars += clean.length;
   }

   // 嘗試以 2 句為單位往下連續擷取，直到超過字數、句數上限或碰到詩的結尾
   while (startIdx + selectedLineCount + 1 < chosenPoem.content.length && selectedLineCount + 2 <= maxLines) {
      const raw1 = chosenPoem.content[startIdx + selectedLineCount] || '';
      const raw2 = chosenPoem.content[startIdx + selectedLineCount + 1] || '';
      const clean1 = raw1.replace(/[，。？！、：；「」『』\s]/g, "");
      const clean2 = raw2.replace(/[，。？！、：；「」『』\s]/g, "");
      const extraChars = clean1.length + clean2.length;

      if (currentChars + extraChars <= maxChars) {
         currentChars += extraChars;
         selectedLineCount += 2;
      } else {
         break;
      }
   }

   // 輸出最終的連續句子陣列
   const poemLines = [];
   for (let li = 0; li < selectedLineCount; li++) {
      const raw = chosenPoem.content[startIdx + li];
      const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
      if (clean.length > 0) poemLines.push(clean);
   }

   return {
      poem: chosenPoem,
      lines: poemLines
   };
}
