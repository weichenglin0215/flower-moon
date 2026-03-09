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
 * @param {string} keyword 篩選關鍵字 (選填。若給定，則只挑選含此字元的句對)
 * @returns {object|null} 回傳包含 { poem: 原始詩詞物件, lines: [不含標點之乾淨句子字串陣列] } 的物件，若無結果則回傳 null。
 */
function getSharedRandomPoem(minRating, minLines, maxLines, minChars, maxChars, keyword = "") {
   if (typeof POEMS === 'undefined' || POEMS.length === 0) return null;

   const getValidStarts = (poem, checkStars) => {
      if (!poem.content || poem.content.length < minLines) return [];
      const validStarts = [];
      const lineRatings = poem.line_ratings || [];

      // 奇數句開始 (陣列 index = 0, 2, 4...)
      for (let i = 0; i <= poem.content.length - minLines; i += 2) {
         if (checkStars && (lineRatings[i] || 0) < minRating) continue;

         let charCount = 0;
         let combinedText = "";
         for (let j = 0; j < minLines; j++) {
            const raw = poem.content[i + j] || '';
            const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
            charCount += clean.length;
            combinedText += clean;
         }

         // 檢查是否符合關鍵字條件
         if (keyword && combinedText.indexOf(keyword) === -1) {
            continue;
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

/**
 * 全站通用的混淆字元與混淆句產生工具
 */
window.SharedDecoy = {
   // 常用字庫分類，可以當作備用干擾項目
   decoyCharsSets: {
      people: "你妳我他她它父母爺娘公婆兄弟姊妹人子吾余夫妻婦妾君卿爾奴汝彼此伊客君主翁",
      season: "春夏秋冬晨晝暮夜夕宵日月星辰漢輝曦雲霓虹雷電霽霄昊蒼溟",
      weather: "陰晴風雨雪霜露霧霞虹暖寒涼暑晦暗亮光明清冽空氣嵐",
      environment: "山嶺峰嶽丘陵原野石岩磐礫沙塵泥壤漠海江河川溪瀑澗流湖泊沼澤水淵深潭泉",
      color: "紅絳朱丹彤緋橙黃綠碧翠蔥藍縹蒼靛紫白皓素皚黑玄緇黛烏墨金銀銅鐵灰",
      plant: "花草梅蘭竹菊荷蓮桂桃李杏梨棠芍薔榴葵蘆荻芷蕙蘅薇薔薇柳松",
      common: "的一是在不了有和人這中大為上個國我以要他時來用們生到作地於出就分對成會可主發年動同工也能下過子說產種面而方後多定行學法所民得經十三之進著等部度家更想樣理心她本去現什把那問當沒看起天都現兩文正開實事些點只如水長"
   },

   /**
    * 根據目標字元找尋混淆字元 (Decoy Characters)
    * 會先從正確答案的句子中找出最常見的字，並隨機選第二或第三等常見字作為 seed。
    * 接著從其他包含 seed 的詩句中，抽取出其他字作為混淆字。
    * 
    * @param {string[]} targetChars 正確答案的字元陣列
    * @param {number} requiredCount 需要產生的混淆字數量
    * @param {string[]} excludeChars 額外需要排除的字元陣列
    * @returns {string[]} 回傳產出的混淆字陣列
    */
   getDecoyChars: function (targetChars, requiredCount, excludeChars = []) {
      let decoys = new Set();
      const allExcluded = new Set([...targetChars, ...excludeChars]);

      // 1. 若有載入最常見字排名，則尋找 seed
      if (typeof CharacterFrequencyRank !== 'undefined' && typeof POEMS !== 'undefined' && POEMS.length > 0) {
         // 從靶標中整理頻率排名 (使用全域的 CharacterFrequencyRank)
         let rankMap = targetChars.map(c => {
            let idx = CharacterFrequencyRank.indexOf(c);
            return { char: c, rank: idx === -1 ? 999999 : idx };
         });

         // 依照 rank 由小至大排序 (也就是最常見到最不常見)
         rankMap.sort((a, b) => a.rank - b.rank);

         // 隨機選擇排名靠前的字 (避免每次都是第一名，可以選前 3 名中的 1 個)
         const topN = Math.min(3, rankMap.length);
         const seedChar = rankMap[Math.floor(Math.random() * topN)].char;

         // 從所有詩詞中尋找含有該 seed 的詩句
         let candidateSentences = [];
         for (const poem of POEMS) {
            if (!poem.content) continue;
            for (const line of poem.content) {
               const cleanLine = line.replace(/[，。？！、：；「」『』\s]/g, "");
               if (cleanLine.includes(seedChar)) {
                  candidateSentences.push(cleanLine);
               }
            }
         }

         candidateSentences.sort(() => Math.random() - 0.5);

         for (const sentence of candidateSentences) {
            if (decoys.size >= requiredCount) break;
            const chars = sentence.split('').sort(() => Math.random() - 0.5);
            for (const char of chars) {
               if (!allExcluded.has(char)) {
                  decoys.add(char);
                  allExcluded.add(char);
               }
               if (decoys.size >= requiredCount) break;
            }
         }
      }

      // 2. 如果透過上述方法找不夠，回退使用舊的分類字庫方法
      if (decoys.size < requiredCount) {
         const sets = Object.values(this.decoyCharsSets);
         for (const targetChar of targetChars) {
            if (decoys.size >= requiredCount) break;
            if (Math.random() < 0.6) {
               const matchedSet = sets.find(s => s.includes(targetChar));
               if (matchedSet) {
                  const candidates = matchedSet.split('').filter(c => !allExcluded.has(c));
                  candidates.sort(() => Math.random() - 0.5);
                  for (const c of candidates) {
                     if (decoys.size >= requiredCount) break;
                     decoys.add(c);
                     allExcluded.add(c);
                  }
               }
            }
         }
      }

      // 3. 如果還是不夠，用 common 字庫填滿
      if (decoys.size < requiredCount) {
         const pool = this.decoyCharsSets.common.split('');
         pool.sort(() => Math.random() - 0.5);
         for (const char of pool) {
            if (decoys.size >= requiredCount) break;
            if (!allExcluded.has(char)) {
               decoys.add(char);
               allExcluded.add(char);
            }
         }
      }

      return Array.from(decoys).sort(() => Math.random() - 0.5);
   }
};

/**
 * 全站通用的音效管理工具 (SoundManager)
 * 提供古箏五聲音階演奏、以及正確與錯誤操作的共用回饋音效。
 */
window.SoundManager = {
   audioCtx: null,
   // 宮商角徵羽五聲調式 (C4, D4, E4, G4, A4)
   guzhengNotes: [261.63, 293.66, 329.63, 392.00, 440.00],

   // 宮商角徵羽五聲調式從低音開始 (C2, D2, E2, G2, A2)
   guzhengNotesLow: [65.40, 73.41, 82.40, 98.00, 110.00],

   /**
    * 初始化 AudioContext。由於瀏覽器對自動播放音效的高級限制，
    * 建議在使用者第一次進行互動（如 Click）時呼叫此方法。
    */
   init: function () {
      if (!this.audioCtx) {
         try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
         } catch (e) {
            console.warn("此瀏覽器不支援 Web Audio API", e);
         }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
         this.audioCtx.resume();
      }
   },

   /**
    * 撥放古箏音階：根據索引選擇對應頻率，並利用 GainNode 模擬彈撥後的衰竭感
    * @param {number} index 音階索引
    */
   playGuzheng: function (index) {
      this.init();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      // 根據索引決定頻率。若越過 5 聲，則自動升八度處理。
      const baseFreq = this.guzhengNotes[index % this.guzhengNotes.length];
      const octave = Math.floor(index / this.guzhengNotes.length);
      const finalFreq = baseFreq * Math.pow(2, octave);

      osc.type = 'sine'; // 使用正弦波模擬柔和的古音
      osc.frequency.setValueAtTime(finalFreq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      // 模擬聲音隨時間由強變弱消失（衰減）
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 1.2);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 1.2);
   },

   /**
    * 撞擊聲 
    */
   playHit: function (index, timeLength) {
      this.init();
      if (!this.audioCtx) return;

      // 根據索引決定頻率。若越過 5 聲，則自動升八度處理。
      const baseFreq = this.guzhengNotesLow[index % this.guzhengNotesLow.length];
      const octave = Math.floor(index / this.guzhengNotesLow.length);
      const finalFreq = baseFreq * Math.pow(2, octave);

      const now = this.audioCtx.currentTime;
      this.playTone(finalFreq, timeLength, now);
   },

   /**
    * 關閉項目，C4 261.63 
    */
   playCloseItem: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(261.63, 1, now);     // C4
   },

   /**
    * 開啟項目，E4 329.63 
    */
   playOpenItem: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(329.63, 1, now);     // E4
   },

   /**
    * 確認項目，A4 440.00 
    */
   playConfirmItem: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(440.00, 1, now);     // A4
   },

   /**
    * 喜悅三連音，C5 E5 G5 
    */
   playJoyfulTriple: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(523.25, 0.1, now);     // C5
      this.playTone(659.25, 0.2, now + 0.1); // E5
      this.playTone(783.99, 0.6, now + 0.2); // G5
   },
   /**
    * 喜悅三連音緩慢，C5 E5 G5 
    */
   playJoyfulTripleSlow: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(523.25, 0.2, now);     // C5
      this.playTone(659.25, 0.4, now + 0.2); // E5
      this.playTone(783.99, 0.8, now + 0.4); // G5
   },
   /**
    * 悲傷三連音，A3 E3 C3 
    */
   playSadTriple: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(440.00, 0.4, now);     // A4
      this.playTone(164.81, 0.8, now + 0.2); // E3
      this.playTone(130.81, 1.2, now + 0.4); // C3
   },


   /**
    * 正確回饋音效：兩聲向上跳動的清脆頻率
    */
   playSuccess: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(440.00, 0.3, now);     // A4
      this.playTone(880.00, 0.6, now + 0.1); // A5
   },

   /**
    * 正確回饋音效短音(給多次點擊的遊戲用)：兩聲向上跳動的清脆頻率
    */
   playSuccessShort: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(440.00, 0.1, now);     // A4
      this.playTone(880.00, 0.3, now + 0.05); // A5
   },

   /**
    * 錯誤回饋音效：低沉且稍具警告意味的音調
    */
   playFailure: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(220.00, 0.3, now, 'triangle');   // A3
      this.playTone(110.00, 0.6, now + 0.2, 'triangle'); // A2
   },

   /**
    * 基礎播放正弦波(或其他波形)音調之工具函數
    */
   playTone: function (freq, duration, startTime, type = 'sine') {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
   }
};
