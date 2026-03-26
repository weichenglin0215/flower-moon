/* =============================================================================
   花月共用邏輯核心 (FlowerMoon Core Script)
   =============================================================================
   此檔案包含全站通用的基礎功能，包括：
   1. 詩詞隨機選取邏輯 (getSharedRandomPoem)
   2. 混淆字元與相似句產生工具 (SharedDecoy)
   3. 全站通用音效管理工具 (SoundManager)
   
   其他專屬邏輯請參考對應檔案：
   - 日曆相關：calendar.js
   - 詩詞卡片：cards.js
   - 各遊戲：game1.js ~ game9.js
   ========================================================================== */

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
 * @param {number|null} seed 隨機種子/關卡序號 (若提供此值，則題目將會是確定性的)
 * @returns {object|null} 回傳包含 { poem: 原始詩詞物件, lines: [不含標點之乾淨句子字串陣列] } 的物件，若無結果則回傳 null。
 */
function getSharedRandomPoem(minRating, minLines, maxLines, minChars, maxChars, keyword = "", seed = null, gameKey = "") {
   if (typeof POEMS === 'undefined' || POEMS.length === 0) return null;

   let currentSeed = seed !== null ? Number(seed) : null;

   // 融入遊戲 ID (gameKey) 進入種子，確保不同遊戲即使在同一關卡也能產生不同題目
   if (currentSeed !== null && gameKey) {
      let gameHash = 0;
      for (let i = 0; i < gameKey.length; i++) {
         gameHash = (gameHash << 5) - gameHash + gameKey.charCodeAt(i);
         gameHash |= 0; // Convert to 32bit integer
      }
      currentSeed += Math.abs(gameHash) % 10000;
   }

   // 增加預熱步驟，避免小序號種子產生的隨機值過於集中在清單開頭
   if (currentSeed !== null) {
      for (let k = 0; k < 7; k++) {
         currentSeed = (currentSeed * 16807) % 2147483647;
      }
   }

   const nextRand = () => {
      if (currentSeed === null) return Math.random();
      currentSeed = (currentSeed * 16807) % 2147483647;
      return (currentSeed - 1) / 2147483646;
   };

   /**
    * 內部輔助函式：針對單首詩詞檢查是否有符合條件的起始索引。
    */
   const getValidStarts = (poem, checkStars) => {
      if (!poem.content || poem.content.length < minLines) return [];
      const validStarts = [];
      const lineRatings = poem.line_ratings || [];

      for (let i = 0; i <= poem.content.length - minLines; i += 2) {
         if (checkStars) {
            let allLinesOk = true;
            for (let k = 0; k < minLines; k++) {
               if ((lineRatings[i + k] || 0) < minRating) {
                  allLinesOk = false;
                  break;
               }
            }
            if (!allLinesOk) continue;
         }

         let charCount = 0;
         let combinedText = "";
         for (let j = 0; j < minLines; j++) {
            const raw = poem.content[i + j] || '';
            const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
            charCount += clean.length;
            combinedText += clean;
         }

         if (keyword && combinedText.indexOf(keyword) === -1) continue;

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
            validPoems.push({ poem, starts, isStrict: true });
         }
      }
   });

   if (validPoems.length === 0) {
      POEMS.forEach(poem => {
         const starts = getValidStarts(poem, false);
         if (starts.length > 0) {
            validPoems.push({ poem, starts, isStrict: false });
         }
      });
   }

   if (validPoems.length === 0) return null;

   // 確保 validPoems 的順序是穩定的（由 forEach 從 POEMS 推入已保證穩定）
   const isStrict = validPoems[0].isStrict;
   const chosenIndex = Math.floor(nextRand() * validPoems.length);
   const chosen = validPoems[chosenIndex];
   const chosenPoem = chosen.poem;
   const lineRatings = chosenPoem.line_ratings || [];

   // 確保 starts 陣列順序穩定（由 for 迴圈產生已保證遞增穩定）
   const startIdx = chosen.starts[Math.floor(nextRand() * chosen.starts.length)];

   let selectedLineCount = minLines;
   let currentChars = 0;

   for (let j = 0; j < minLines; j++) {
      const raw = chosenPoem.content[startIdx + j] || '';
      const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
      currentChars += clean.length;
   }

   while (startIdx + selectedLineCount + 1 < chosenPoem.content.length && selectedLineCount + 2 <= maxLines) {
      if (isStrict) {
         if ((lineRatings[startIdx + selectedLineCount] || 0) < minRating ||
            (lineRatings[startIdx + selectedLineCount + 1] || 0) < minRating) {
            break;
         }
      }

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

   const poemLines = [];
   for (let li = 0; li < selectedLineCount; li++) {
      const raw = chosenPoem.content[startIdx + li];
      const clean = raw.replace(/[，。？！、：；「」『』\s]/g, "");
      if (clean.length > 0) poemLines.push(clean);
   }

   return {
      poem: chosenPoem,
      lines: poemLines,
      startIndex: startIdx
   };
}


/**
 * 全站通用的混淆字元與混淆句產生工具
 */
window.SharedDecoy = {
   // 預設分類字庫：當找不到動態干擾項時的備用來源
   decoyCharsSets: {
      people: "你妳我他她它父母爺娘公婆兄弟姊妹人子吾余夫妻婦妾君卿爾奴汝彼此伊客君主翁",
      season: "春夏秋冬晨朝晝昏暮夜夕宵年日月星辰漢輝曦雲霓虹雷電霽霄昊蒼溟",
      weather: "陰晴風雨雪霜露霧霞虹暖寒涼暑晦暗亮光明清冽空氣嵐",
      environment: "地山嶺峰嶽丘陵原野石岩磐礫沙塵泥壤漠海江河川溪瀑澗流湖泊沼澤水火淵深潭泉",
      color: "紅絳朱丹彤緋橙黃綠碧翠蔥藍縹蒼靛紫白皓素皚黑玄緇黛烏墨金銀銅鐵灰",
      plant: "花草梅蘭竹菊荷蓮桂桃李杏梨棠芍薔榴葵蘆荻芷蕙蘅薇薔薇柳松",
      size: "大中小特巨微長短高矮胖瘦多少",
      direction: "東南西北上下左右前後",
      number: "一二三四五六七八九十百千萬億兩",
      truefalse: "是否不可真假對錯知同正確錯誤",
      common: "之乎者也了工文方心只分來去出入本沒有些什以作個們到動和問在如學定家國事實就度得想成所把於時更會樣現理當看起那都開點"
   },

   /**
    * 根據目標字元找尋混淆字元 (Decoy Characters)
    * 會先從正確答案的句子中找出最常見的字，並隨機選第二或第三等常見字作為 seed。
    * 接著從其他包含 seed 的詩句中，抽取出其他字作為混淆字。
    * 
    * @param {string[]} targetChars 正確答案的字元陣列
    * @param {number} requiredCount 需要產生的混淆字數量
    * @param {string[]} excludeChars 額外需要排除的字元陣列
    * @param {number} minRating 最低詩詞評價要求 (預設 4)
    * @returns {string[]} 回傳產出的混淆字陣列
    */
   getDecoyChars: function (targetChars, requiredCount, excludeChars = [], minRating = 4) {
      let decoys = new Set();
      const allExcluded = new Set([...targetChars, ...excludeChars]);

      // 1. 策略 A：動態種子法 (Dynamic Seed Selection)
      // 若系統已載入「最常見字排名」，則嘗試從正確答案中隨機挑選一個常見字作為「種子」。
      if (typeof CharacterFrequencyRank !== 'undefined' && typeof POEMS !== 'undefined' && POEMS.length > 0) {
         // 將 targetChars 對應其在 CharacterFrequencyRank 中的排名
         let rankMap = targetChars.map(c => {
            // 兼容舊格式 ["字", ...] 與新格式 [["字", 次數], ...]
            let idx = CharacterFrequencyRank.findIndex(item => {
               if (Array.isArray(item)) return item[0] === c;
               return item === c;
            });
            // 若不在排名中，給予極大值代表不常見
            return { char: c, rank: idx === -1 ? 999999 : idx };
         });

         // 依照常見度(排名數值越小越常見)排序
         rankMap.sort((a, b) => a.rank - b.rank);

         // 從最常見的前 N 個字中隨機挑選一個作為種子字 (seedChar)
         const topN = Math.min(3, rankMap.length);
         const seedChar = rankMap[Math.floor(Math.random() * topN)].char;

         // 1.1 從所有詩詞中搜尋包含該種子字的詩句，並取出其他字作為干擾項
         // 這樣產生的混淆字會與正確答案具有某種「文學上的聯繫」
         let candidateSentences = [];
         for (const poem of POEMS) {
            if (!poem.content || (poem.rating || 0) < minRating) continue;
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

      // 2. 策略 B：分類主題法 (Thematic Fallback)
      // 如果動態法產生的字數不足，則根據正確答案所屬的「主題」 (如：春夏秋冬、草木) 取字。
      if (decoys.size < requiredCount) {
         const sets = Object.values(this.decoyCharsSets);
         for (const targetChar of targetChars) {
            if (decoys.size >= requiredCount) break;
            // 60% 機率嘗試尋找匹配的主題集
            if (Math.random() < 0.6) {
               const matchedSet = sets.find(s => s.includes(targetChar));
               if (matchedSet) {
                  // 從該主題集中過濾掉已使用的字，隨機取出填充
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
   },

   /**
    * 根據輸入的鄰近字元陣列，從主題字庫中挑選最適合的混淆字。
    * 
    * @param {string[]} neighborChars 周圍已放置的正確題目字元
    * @param {string[]} excludeChars 需排除的字元 (如已使用的字)
    * @returns {string} 挑選出的混淆字
    */
   getThematicDecoy: function (neighborChars, excludeChars = []) {
      // 1. 統計鄰近字屬於哪些分類集
      let counts = {};
      const sets = this.decoyCharsSets;

      // 合併排除名單：外部傳入的 + 傳入的鄰近字本身 (避免重複)
      const allExcludes = [...excludeChars, ...neighborChars];

      neighborChars.forEach(char => {
         for (const [setName, setChars] of Object.entries(sets)) {
            if (setChars.includes(char)) {
               counts[setName] = (counts[setName] || 0) + 1;
            }
         }
      });

      // 2. 找出最匹配的主題集 (若無匹配則預設為 common)
      let bestSet = 'common';
      let maxCount = 0;
      for (const [setName, count] of Object.entries(counts)) {
         if (count > maxCount) {
            maxCount = count;
            bestSet = setName;
         }
      }

      // 3. 從選定的主題集中挑選一個未被排除的字
      let pool = sets[bestSet].split('');
      pool.sort(() => Math.random() - 0.5);

      for (const char of pool) {
         if (!allExcludes.includes(char)) return char;
      }

      // 4. 若全集都被排除，則從 common 補位
      let commonPool = sets.common.split('');
      commonPool.sort(() => Math.random() - 0.5);
      for (const char of commonPool) {
         if (!allExcludes.includes(char)) return char;
      }

      return '巃'; // 萬用保底
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
   playGuzhengOLD: function (index) {
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
    * 撥放古箏音階：根據索引選擇對應頻率，並利用 GainNode 模擬彈撥後的衰竭感
    * @param {number} index 音階索引
    */
   playGuzheng: function (index) {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      // 1. 計算頻率
      const baseFreq = this.guzhengNotes[index % this.guzhengNotes.length];
      const octave = Math.floor(index / this.guzhengNotes.length);
      const finalFreq = baseFreq * Math.pow(2, octave);

      // 2. 線性計算衰減時間 (300Hz ~ 1000Hz 之間平滑過渡)
      const minFreq = 300;
      const maxFreq = 1000;
      const maxDecay = 2.5; // 低音餘響
      const minDecay = 1.2; // 高音餘響
      const maxStartGain = 0.5; // 低音起始音量
      const minStartGain = 0.1; // 高音起始音量

      let decayTime;
      if (finalFreq <= minFreq) {
         decayTime = maxDecay;
      } else if (finalFreq >= maxFreq) {
         decayTime = minDecay;
      } else {
         // 線性插值公式
         const fraction = (finalFreq - minFreq) / (maxFreq - minFreq);
         decayTime = maxDecay - fraction * (maxDecay - minDecay);
      }

      // 3. 音色設定：使用 Triangle 並搭配低通濾波器磨平電子感
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(finalFreq, now);

      filter.type = 'lowpass';
      // 濾波頻率設為基頻的 1.5 倍，保留溫潤感，濾除高頻刺耳聲
      filter.frequency.setValueAtTime(finalFreq * 1.5, now);
      filter.Q.value = 0.7; // 較低的 Q 值讓聲音更自然

      // 4. 振幅包絡 (Envelope)
      // 稍微降低高音起始音量，讓聽感平衡
      let startGain;
      if (finalFreq <= minFreq) {
         startGain = maxStartGain;
      } else if (finalFreq >= maxFreq) {
         startGain = minStartGain;
      } else {
         // 線性插值公式
         const fraction = (finalFreq - minFreq) / (maxFreq - minFreq);
         startGain = maxStartGain - fraction * (maxStartGain - minStartGain);
      }

      gain.gain.setValueAtTime(0, now);
      // 0.02s 的極短淡入，消除電子音啟動的「滴答」聲
      gain.gain.linearRampToValueAtTime(startGain, now + 0.02);
      // 實現您要求的線性長餘響
      gain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

      // 5. 節點連接與播放
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      // 確保 Oscillator 在餘響結束後停止
      osc.stop(now + decayTime);
   },

   playGuzhengLowOLD: function (index) {
      this.init();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      // 根據索引決定頻率。若越過 5 聲，則自動升八度處理。
      const baseFreq = this.guzhengNotesLow[index % this.guzhengNotesLow.length];
      const octave = Math.floor(index / this.guzhengNotesLow.length);
      const finalFreq = baseFreq * Math.pow(2, octave);

      osc.type = 'sine'; // 使用正弦波模擬柔和的古音
      osc.frequency.setValueAtTime(finalFreq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.5, this.audioCtx.currentTime);
      // 模擬聲音隨時間由強變弱消失（衰減）
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 1.2);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 1.2);
   },

   playGuzhengLow: function (index) {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      const filter = this.audioCtx.createBiquadFilter();

      // 1. 計算頻率
      const baseFreq = this.guzhengNotesLow[index % this.guzhengNotesLow.length];
      const octave = Math.floor(index / this.guzhengNotesLow.length);
      const finalFreq = baseFreq * Math.pow(2, octave);

      // 2. 線性計算衰減時間 (300Hz ~ 1000Hz 之間平滑過渡)
      const minFreq = 300;
      const maxFreq = 1000;
      const maxDecay = 2.5; // 低音餘響
      const minDecay = 1.2; // 高音餘響
      const maxStartGain = 0.5; // 低音起始音量
      const minStartGain = 0.1; // 高音起始音量

      let decayTime;
      if (finalFreq <= minFreq) {
         decayTime = maxDecay;
      } else if (finalFreq >= maxFreq) {
         decayTime = minDecay;
      } else {
         // 線性插值公式
         const fraction = (finalFreq - minFreq) / (maxFreq - minFreq);
         decayTime = maxDecay - fraction * (maxDecay - minDecay);
      }

      // 3. 音色設定：使用 Triangle 並搭配低通濾波器磨平電子感
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(finalFreq, now);

      filter.type = 'lowpass';
      // 濾波頻率設為基頻的 1.5 倍，保留溫潤感，濾除高頻刺耳聲
      filter.frequency.setValueAtTime(finalFreq * 1.5, now);
      filter.Q.value = 0.7; // 較低的 Q 值讓聲音更自然

      // 4. 振幅包絡 (Envelope)
      // 稍微降低高音起始音量，讓聽感平衡
      let startGain;
      if (finalFreq <= minFreq) {
         startGain = maxStartGain;
      } else if (finalFreq >= maxFreq) {
         startGain = minStartGain;
      } else {
         // 線性插值公式
         const fraction = (finalFreq - minFreq) / (maxFreq - minFreq);
         startGain = maxStartGain - fraction * (maxStartGain - minStartGain);
      }

      gain.gain.setValueAtTime(0, now);
      // 0.02s 的極短淡入，消除電子音啟動的「滴答」聲
      gain.gain.linearRampToValueAtTime(startGain, now + 0.02);
      // 實現您要求的線性長餘響
      gain.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

      // 5. 節點連接與播放
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      // 確保 Oscillator 在餘響結束後停止
      osc.stop(now + decayTime);
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
 * 正確回饋音效：兩聲向上跳動的清脆頻率
 */
   playBreakEnemy: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(880.00, 0.3, now);     // A5
      this.playTone(1760.00, 0.6, now + 0.1); // A6
   },

   /**
    * 喜悅三連音：清脆的快節奏上升音階 (C5 E5 G5)
    * 通常用於遊戲獲勝、獲得獎勵等正面場景。
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
    * 喜悅三連音(緩慢)：步調較從容的上升音階
    * 用於層級晉升或較大幅度的成功回饋。
    */
   playJoyfulTripleSlow: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(523.25, 0.2, now);       // C5
      this.playTone(659.25, 0.4, now + 0.2); // E5
      this.playTone(783.99, 0.8, now + 0.4); // G5
   },

   /**
    * 悲傷三連音：沉重且節奏綿延的下降音標 (A4 E3 C3)
    * 用於遊戲結束、挑戰失敗等挫折場景。
    */
   playSadTriple: function () {
      this.init();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      this.playTone(440.00, 0.4, now);       // A4
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
    * 利用 Web Audio API 建立 Oscillator 與 GainNode 進行發聲。
    * 
    * @param {number} freq 頻率 (Hz)
    * @param {number} duration 持續時間 (秒)
    * @param {number} startTime 開始播放時間
    * @param {string} type 波形類別 ('sine', 'square', 'sawtooth', 'triangle')
    */
   playTone: function (freq, duration, startTime, type = 'triangle') {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      // 設定初始音量與指數型衰減，使聲音聽起來較自然
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

      osc.start(startTime);
      osc.stop(startTime + duration);
   }
};
