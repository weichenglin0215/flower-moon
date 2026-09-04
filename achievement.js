/**

 * 成就與紀錄面板組件

 */



(function () {

    'use strict';



    const AchievementDialog = {

        overlay: null,



        // 遊戲名稱對照表

        gameNames: {
            'game1': '慢思快選',
            'game2': '飛花令',
            'game3': '字爬梯',
            'game4': '眾裡尋他千百度',
            'game5': '詩詞小精靈',
            'game6': '詩陣侵略',
            'game7': '青鳥雲梯',
            'game8': '一筆裁詩',
            'game9': '詩韻鎖扣',
            'game10': '擊石鳴詩',
            'game11': '翻墨識蹤',
            'game12': '疏影橫斜',
            'game13': '人事時地',
            'game14': '步步驚心',
            'game15': '墨韻游龍',
            'game16': '打地詩',
            'game17': '青蛙過河',
            'game19': '詩碟狂襲',
            'game20': '丟三落一',
            'game21': '橫批成詩',
            'game22': '詩詞拼圖',
            'game23': '縱橫集句',
            'game24': '三字成珠',
            'game25': '連珠拾字',
            'game26': '投珠破句',
            'game27': '詩磚壘塔',
            'game28': '兩心相印',
            'game29': '字龍盤環',
            'game30': '層巒疊翠',
            'game31': '詩眼覓蹤',
            'game32': '尋詩地圖',
            'game33': '作者是誰',
            'game34': '猜猜詩題',
            'game35': '詩人心情',
            'game36': '轉輪覓詩',
            'game37': '步步為陣',
            'game38': '推枰成詩',
            'game39': '彈珠成詩',
            'game40': '點兵成詩'
        },

        // ── 文位獎狀賀詞 ──────────────────────────────────────────────
        // ⚠️ 這 15 段賀詞原本全部寫著「修為已達兩萬分」「修為突破三十二萬分」
        //    這類**積分**敘述，那是舊制「積分升等」留下的文字。
        //    新規則下文位與積分完全脫鉤（企畫書 §2）：
        //      · 書僮／蒙童 —— 走完青雲梯該段課程即晉升
        //      · 塾生以上   —— 必須通過考棚的考試才能冊封
        //    因此改寫為以「學會了多少詩詞、通過了哪一場試」為主軸的措辭，
        //    不再出現任何分數。日後調整 rankRewards 的數字也不必再回頭改文案。
        rankCertTexts: {
            '書僮': '自幼好學，手不釋卷。\n今日正式入院為「書僮」，領略墨色清芬。願爾勤勉，志存高遠，於書山之中覓得真意。',
            '蒙童': '志學之始，啟蒙之初。\n閣下拾級而上，已將蒙學詩篇盡數記誦，榮登「蒙童」。初入文林，墨香稍染。願君焚膏繼晷，更上層樓。',
            '塾生': '書塾寒暑，心志益堅。\n閣下課業既成，復於場屋一試中式，獲封「塾生」。勤學如春起之苗，不見其增，日有所長。',
            '童生': '經史初通，文采斐然。\n閣下遍誦所習詩詞，應試得中，敕授「童生」文位。筆下生風，字句清雅，已具文人之風骨。',
            '縣案首': '名震黌宮，冠絕全縣。\n閣下學養既充，於縣試之中脫穎而出，勇奪「縣案首」。才思敏捷，四鄉驚服。',
            '府案首': '府試揚名，魁首之才。\n閣下詩書滿腹，府試拔得頭籌，獲封「府案首」。文章錦繡，氣貫長虹，誠為一府之表率。',
            '文童': '詞藻華茂，文心雕龍。\n閣下所學日廣，試中而晉「文童」。博覽群書，出口成章，已入大雅之堂。',
            '秀才': '身入膠庠，士林楷模。\n閣下窮研篇什，一舉中式，博得「秀才」功名。志慮忠純，文采煥發，堪稱國之棟樑。',
            '舉人': '蟾宮折桂，名滿杏林。\n閣下詩詞爛熟於心，鄉試題名，榮登「舉人」之列。鵬程萬里，前途無量，正待大展宏圖。',
            '貢士': '朝堂受書，天下景仰。\n閣下會試中式，獲「貢士」之榮。學究天人，德藝雙馨，四海皆知其名。',
            '進士': '金榜題名，國之重器。\n閣下歷試不輟，終登甲第，高中「進士」。經世致用，翰墨千秋，其名必傳於後世。',
            '探花': '風流倜儻，才貌雙全。\n閣下殿試名列第三，榮膺「探花」。才情絕世，意氣風發，盡顯名士風流。',
            '榜眼': '學海無涯，僅次魁星。\n閣下殿試高居第二，獲「榜眼」殊榮。文章冠代，識見精深，乃萬人之傑。',
            '狀元': '文魁天下，獨占鰲頭。\n閣下殿試策問第一，奪取「狀元」極位。筆落驚風雨，詩成泣鬼神，舉世無雙。',
            '大儒': '德被天下，一代宗師。\n閣下遍歷青雲之梯，詩詞無所不通，獲尊「大儒」。學貫古今，德侔天地，萬世之師也。'
        },

        certImages: [
            'images/九品獎狀.png', 'images/八品獎狀.png', 'images/七品獎狀.png',
            'images/六品獎狀.png', 'images/五品獎狀.png', 'images/四品獎狀.png',
            'images/三品獎狀.png', 'images/二品獎狀.png', 'images/一品獎狀.png',
            'images/聖旨獎狀.png'
        ],

        // ══════════════════════════════════════════════════════════
        // 獎狀獎勵對照表（依獎狀種類分別查表發放，取代舊版固定 10,000分/100文錢）
        // 統一比例：100 積分 = 1 文錢
        // ══════════════════════════════════════════════════════════

        // 【遊戲別】通過勝利次數獎狀：不分遊戲，統一標準；100 次起每滿 100 次給予相同獎勵，可無限延伸
        gameCountRewards: {
            10: { score: 1000, silver: 10 },
            20: { score: 2000, silver: 20 },
            50: { score: 5000, silver: 50 },
            100: { score: 10000, silver: 100 } // 100 次以上（含每滿 100 次）皆套用此檔
        },

        // 【難度別】過關次數獎狀：分五種難度各自一張表，門檻結構同上，獎勵隨難度遞增
        difficultyCountRewards: {
            '小學': { 10: { score: 100, silver: 1 }, 20: { score: 200, silver: 2 }, 50: { score: 500, silver: 5 }, 100: { score: 1000, silver: 10 } },
            '中學': { 10: { score: 300, silver: 3 }, 20: { score: 600, silver: 6 }, 50: { score: 1500, silver: 15 }, 100: { score: 3000, silver: 30 } },
            '高中': { 10: { score: 500, silver: 5 }, 20: { score: 1000, silver: 10 }, 50: { score: 2500, silver: 25 }, 100: { score: 5000, silver: 50 } },
            '大學': { 10: { score: 1000, silver: 10 }, 20: { score: 2000, silver: 20 }, 50: { score: 5000, silver: 50 }, 100: { score: 10000, silver: 100 } },
            '研究所': { 10: { score: 1500, silver: 15 }, 20: { score: 4000, silver: 40 }, 50: { score: 7500, silver: 75 }, 100: { score: 15000, silver: 150 } }
        },

        // 【關卡挑戰】里程碑獎狀已取消（note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md）：
        // 難度選單早已沒有獨立的「關卡挑戰」模式，這組獎狀失去對應場景，
        // 連同 levelMilestoneRewards 表、getRewardForAchId 的 level_milestone_
        // 分支、成就頁的渲染區塊與 scoreManager 的解鎖判定一併移除。

        // 【文位】階級獎狀：書僮為起始階級，自動擁有無需領取，故不列入表中
        rankRewards: {
            '蒙童': { score: 3000, silver: 30 },
            '塾生': { score: 6000, silver: 60 },
            '童生': { score: 8000, silver: 80 },
            '縣案首': { score: 10000, silver: 100 },
            '府案首': { score: 16000, silver: 160 },
            '文童': { score: 32000, silver: 320 },
            '秀才': { score: 64000, silver: 640 },
            '舉人': { score: 128000, silver: 1280 },
            '貢士': { score: 256000, silver: 2560 },
            '進士': { score: 512000, silver: 5120 },
            '探花': { score: 1024000, silver: 10240 },
            '榜眼': { score: 2048000, silver: 20480 },
            '狀元': { score: 4096000, silver: 40960 },
            '大儒': { score: 8192000, silver: 81920 }
        },

        // 依 count 類獎狀（遊戲別／難度別）的查表結果取得獎勵；100 以上一律沿用 100 檔位的獎勵
        getCountReward: function (table, threshold) {
            return table[threshold] || table[100] || { score: 0, silver: 0 };
        },

        // 產生某個 key（遊戲代號或難度名稱）在目前次數下「已達成」的所有門檻：10 / 20 / 50 / 100 起每滿 100 次
        getCountThresholds: function (count) {
            const list = [];
            [10, 20, 50, 100].forEach(t => { if (count >= t) list.push(t); });
            for (let t = 200; t <= count; t += 100) list.push(t);
            return list;
        },

        // 依 achId 判斷獎狀種類，回傳對應的 { score, silver } 獎勵
        getRewardForAchId: function (achId) {
            if (achId.indexOf('rank_') === 0) {
                const rankName = achId.slice('rank_'.length);
                return this.rankRewards[rankName] || { score: 0, silver: 0 };
            }
            // 其餘格式為 `${key}_${threshold}`：key 為難度名稱（小學/中學/高中/大學/研究所）或遊戲代號（gameN）
            const lastUnderscore = achId.lastIndexOf('_');
            const key = achId.slice(0, lastUnderscore);
            const threshold = parseInt(achId.slice(lastUnderscore + 1), 10);
            if (this.difficultyCountRewards[key]) {
                return this.getCountReward(this.difficultyCountRewards[key], threshold);
            }
            return this.getCountReward(this.gameCountRewards, threshold);
        },

        init: function () {
            if (this.overlay) return;
            // 確保 achievement.css 已載入
            if (!document.getElementById('achievement-css')) {
                const link = document.createElement('link');
                link.id = 'achievement-css';
                link.rel = 'stylesheet';
                link.href = 'achievement.css';
                document.head.appendChild(link);
            }
            this.createDOM();
            this.bindEvents();
        },

        createDOM: function () {
            const overlay = document.createElement('div');
            overlay.id = 'achievementOverlay';
            overlay.className = 'ach-overlay hidden';
            overlay.innerHTML = `
                <div class="ach-container" id="achContainer" role="dialog" aria-modal="true">
                    <div class="ach-header">
                        <div class="ach-title">成就與紀錄</div>
                        <div class="ach-close-btn" id="achCloseBtn">✕</div>
                    </div>
                    <div class="ach-tabs">
                        <div class="ach-tab active" data-target="ach-panel-overview">總覽</div>
                        <div class="ach-tab" data-target="ach-panel-games">遊戲紀錄</div>
                        <div class="ach-tab" data-target="ach-panel-badges">成就殿堂</div>
                        <div class="ach-tab" data-target="ach-panel-poems">詩詞寶盒</div>
                    </div>
                    <div class="ach-body">
                        <!-- 總覽面板 -->
                        <div class="ach-panel active" id="ach-panel-overview">
                            <div class="ach-overview">
                                <div class="ach-rank-title" id="achRankTitle">當前文位</div>
                                <div class="ach-rank-display" id="achRankView">書僮</div>
                                <!-- 考試 / 領獎狀 CTA（移到文位下方） -->
                                <div id="achNextRankInfo" style="min-height:0;"></div>
                                <div class="ach-overview-stats">
                                    <div class="ach-stat-box">
                                        <div class="ach-stat-val" id="achTotalScore">0</div>
                                        <div class="ach-stat-lbl">累積總分</div>
                                    </div>
                                    <div class="ach-stat-box">
                                        <div class="ach-stat-val" id="achPlayDays">0</div>
                                        <div class="ach-stat-lbl">登入天數</div>
                                    </div>
                                </div>
                                <!-- 文位進度橫欄：距離「下一個文位」還差多少課程進度。
                                     ⚠️⚠️ 這條橫欄過去畫的是**積分階級**的推進比例
                                     （totalScore 與 ScoreManager.ranks[].minScore 的比值），
                                     那是舊制「積分升等」的最後遺留。即使當時已在標題註明
                                     「與文位無關」，玩家看到的仍然是一條寫著「書僮 → 蒙童」
                                     的進度條隨著刷分前進 —— 與新規則（企劃書 §2：積分完全
                                     不參與文位判定）給出的訊息完全相反。
                                     現在一律改看青雲梯：目前文位取 getEffectiveRank
                                     （站點進度＋考試通過紀錄），分母取下一個文位里程碑的
                                     應學詩詞數，分子取其中已學會（必通關卡全通）的首數。
                                     積分仍保留在上方「累積總分」數字方塊裡，純作統計。 -->
                                <div class="ach-rank-progress-row" id="achRankProgressRow">
                                    <div style="font-size:13px;opacity:.7;text-align:center;margin-bottom:2px;" id="achRankProgCaption">文位進度（青雲梯課程，與積分無關）</div>
                                    <div class="ach-rank-progress-labels">
                                        <span id="achRankProgFrom">書僮</span>
                                        <span id="achRankProgScore">0 / 0 首</span>
                                        <span id="achRankProgTo">蒙童</span>
                                    </div>
                                    <div class="ach-rank-progress-track">
                                        <div class="ach-rank-progress-fill" id="achRankProgFill" style="width:0%"></div>
                                    </div>
                                </div>
                                <div class="ach-cloud-id-section">
                                    <div class="ach-cloud-id-value" id="achCloudIdDisplay">載入中...</div>
                                    <div class="ach-cloud-id-actions">
                                    <button id="achBtnSyncId" class="ach-btn-small" style="background: linear-gradient(135deg, hsla(145, 63%, 42%, 1.00), hsla(145, 63%, 35%, 1.00));">同步(測試用)</button>
                                    <button id="achBtnCopyId" class="ach-btn-small">顯示引繼碼</button>
                                        <button id="achBtnChangeId" class="ach-btn-small">變更暱稱</button>
                                    </div>
                                </div>
                                <!-- ⚠️ 測試期專用：完整重置（本機 + 雲端）。
                                     刻意做成幾乎看不見（opacity 0.12），
                                     作法比照 difficulty-selector 的「📅 日曆」測試勾選框。
                                     ⛔ 正式上線前必須連同下方事件綁定一起移除。 -->
                                <div class="ach-devtool-row">
                                    <button id="achBtnResetAll" class="ach-devtool-btn"
                                            title="測試用：清空本機與雲端的所有玩家資料">⟲ 重置</button>
                                </div>
                            </div>
                        </div>
                        <!-- 遊戲紀錄面板 -->
                        <div class="ach-panel" id="ach-panel-games">
                            <div class="ach-games-grid" id="achGamesContainer">
                                <!-- 動態生成 -->
                            </div>
                        </div>
                        <!-- 成就殿堂徽章面板 -->
                        <div class="ach-panel" id="ach-panel-badges">
                            <!-- 一鍵領取：獎狀會隨著遊玩次數無限延伸（100 次之後每滿 100 次
                                 就多一張），累積到數十張時逐張點擊要按上百下，每按一下還會
                                 播一次三秒的獎狀動畫，實測是玩家最常抱怨的操作。
                                 沒有待領項目時整列隱藏，避免變成一顆按了沒反應的死按鈕。

                                 ⚠️ 這一列必須 position:sticky 常駐在頂端（樣式見 CSS）：
                                    點擊「成就殿堂」頁籤時 scrollToFirstPending 會自動把清單
                                    捲到第一張待領獎狀的位置，若這顆按鈕跟著清單捲動，
                                    玩家一進來就已經捲過頭，根本看不到它。 -->
                            <div class="ach-claim-all-row" id="achClaimAllRow" style="display:none;">
                                <button class="ach-btn-claim claim-pending" id="achBtnClaimAll">領取所有獎狀</button>
                                <div class="ach-claim-all-hint" id="achClaimAllHint"></div>
                            </div>
                            <div class="ach-badges" id="achBadgesContainer">
                                <!-- 動態生成 -->
                            </div>
                        </div>
                        <!-- 詩詞寶盒面板 -->
                        <div class="ach-panel" id="ach-panel-poems">
                            <div class="ach-poem-records" id="achPoemContainer">
                                <!-- 動態生成 -->
                            </div>
                        </div>
                    </div>
                </div>`;

            document.body.appendChild(overlay);

            this.overlay = overlay;

            /* Resize ach-container to match scaled stage */
            /*y自動調整卡片的尺寸，預設是92%*90%*/
            var achCont = overlay.querySelector('#achContainer');
            if (window.registerOverlayResize) {
                window.registerOverlayResize(function (r) {
                    // 將 Container 寬高設為符合邏輯比例
                    achCont.style.width = (500 * 0.96) + 'px';
                    achCont.style.height = (850 * 0.96) + 'px';

                    // 完全追蹤 stage 的座標與縮放
                    // 因為外圍是 500x850，0.96 代表兩側各留白 0.02
                    achCont.style.left = (r.left + 500 * 0.02 * r.scale) + 'px';
                    achCont.style.top = (r.top + 850 * 0.02 * r.scale) + 'px';

                    achCont.style.transform = 'scale(' + r.scale + ')';
                    achCont.style.transformOrigin = 'top left';
                });
            }
        },



        bindEvents: function () {

            // 關閉按鈕
            const closeBtn = this.overlay.querySelector('#achCloseBtn');
            if (closeBtn) closeBtn.addEventListener('click', () => this.hide());

            // 頁籤切換

            const tabs = this.overlay.querySelectorAll('.ach-tab');

            tabs.forEach(tab => {

                tab.addEventListener('click', () => {

                    if (window.SoundManager) window.SoundManager.playOpenItem();

                    tabs.forEach(t => t.classList.remove('active'));

                    this.overlay.querySelectorAll('.ach-panel').forEach(p => p.classList.remove('active'));



                    tab.classList.add('active');

                    const targetId = tab.getAttribute('data-target');

                    document.getElementById(targetId).classList.add('active');

                    // 點擊「成就殿堂」時，自動捲動到第一顆「領取獎狀」按鈕，方便玩家領取
                    if (targetId === 'ach-panel-badges') {
                        setTimeout(() => this.scrollToFirstPending(), 60);
                    }

                });

            });



            // 一鍵領取所有獎狀
            const btnClaimAll = this.overlay.querySelector('#achBtnClaimAll');
            if (btnClaimAll) {
                btnClaimAll.addEventListener('click', () => this.claimAllAchievementRewards());
            }



            // ⚠️ 測試期專用：完整重置按鈕（正式上線前連同 HTML 一起移除）
            const btnReset = this.overlay.querySelector('#achBtnResetAll');
            if (btnReset) {
                btnReset.addEventListener('click', async () => {
                    const id = (window.SupabaseClient && window.SupabaseClient.getCurrentId)
                        ? (window.SupabaseClient.getCurrentId() || '(未綁定)') : '(未綁定)';
                    const msg = [
                        '【測試用】完整重置',
                        '',
                        '引繼碼：' + id,
                        '',
                        '將清除：',
                        '　· 本機積分、關卡進度、成就、詩詞紀錄',
                        '　· 本機文錢、考試通過紀錄、江南小院',
                        '　· 雲端 player_saves 與 game_logs',
                        '',
                        '此操作無法復原，確定嗎？'
                    ].join(String.fromCharCode(10));
                    if (!window.confirm(msg)) return;

                    btnReset.disabled = true;
                    btnReset.textContent = '重置中…';
                    try {
                        const r = await window.ScoreManager.resetAll();
                        const cloudTxt = r.cloud
                            ? (r.cloud.ok
                                ? ('雲端已刪除（存檔 ' + r.cloud.saves + ' 筆、紀錄 ' + r.cloud.logs + ' 筆）')
                                : ('雲端刪除失敗：' + r.cloud.error))
                            : '未綁定引繼碼，僅清除本機';
                        window.alert(['重置完成。', cloudTxt, '', '按確定後將重新整理頁面。']
                            .join(String.fromCharCode(10)));
                    } catch (e) {
                        window.alert('重置失敗：' + e);
                    }
                    window.location.reload();
                });
            }

            // 總覽/引繼碼按鈕綁定

            const btnCopy = document.getElementById('achBtnCopyId');

            if (btnCopy) {

                btnCopy.addEventListener('click', () => {

                    if (window.SoundManager) window.SoundManager.playConfirmItem();

                    const data = window.ScoreManager.loadPlayerData();

                    const cloudId = localStorage.getItem('flower_moon_id') || '未綁定';

                    const display = document.getElementById('achCloudIdDisplay');



                    if (btnCopy.textContent === '顯示引繼碼') {

                        // 切換到顯示引繼碼並複製

                        display.textContent = cloudId;

                        btnCopy.textContent = '顯示暱稱';



                        if (cloudId !== '未綁定') {

                            navigator.clipboard.writeText(cloudId).then(() => {

                                //this.showNotification('引繼碼已複製到剪貼簿');

                            }).catch(err => console.error('複製失敗:', err));

                        }

                    } else {

                        // 切換回顯示暱稱

                        display.textContent = data.nickname || '訪客';

                        btnCopy.textContent = '顯示引繼碼';

                    }

                });

            }



            const btnChange = document.getElementById('achBtnChangeId');

            if (btnChange) {

                btnChange.addEventListener('click', () => {

                    if (window.SoundManager) window.SoundManager.playConfirmItem();

                    if (window.CloudSaveDialog) {

                        window.CloudSaveDialog.show({

                            mode: 'change',

                            onSuccess: () => {

                                this.renderData(); // 重新整理成就面板

                            }

                        });

                    }

                });

            }



            const btnSync = document.getElementById('achBtnSyncId');

            if (btnSync) {

                btnSync.addEventListener('click', () => {

                    if (window.SoundManager) window.SoundManager.playConfirmItem();

                    const data = window.ScoreManager.loadPlayerData();

                    btnSync.textContent = '同步中...';

                    btnSync.disabled = true;



                    if (window.SupabaseClient) {

                        window.SupabaseClient.saveGameToCloud(data).then(success => {

                            if (success) {

                                btnSync.textContent = '同步成功';

                                setTimeout(() => {

                                    btnSync.textContent = '同步(測試用)';

                                    btnSync.disabled = false;

                                }, 2000);

                            } else {

                                btnSync.textContent = '同步失敗';

                                btnSync.disabled = false;

                            }

                        });

                    }

                });

            }



            // 滑鼠拖曳捲動功能 (包含慣性捲動)

            const scrollContainer = this.overlay.querySelector('.ach-body');

            let isDown = false;

            let startY;

            let scrollTop;

            let velocity = 0;

            let lastY = 0;

            let lastTime = 0;

            let momentumID = null;



            const startInertia = () => {

                const friction = 0.97; // 摩擦係數，數值越大滑得越遠

                const step = () => {

                    if (Math.abs(velocity) < 0.1) {

                        cancelAnimationFrame(momentumID);

                        return;

                    }

                    scrollContainer.scrollTop -= velocity;

                    velocity *= friction;

                    momentumID = requestAnimationFrame(step);

                };

                momentumID = requestAnimationFrame(step);

            };



            scrollContainer.addEventListener('mousedown', (e) => {

                if (e.target.tagName.toLowerCase() === 'button') return;



                isDown = true;

                scrollContainer.classList.add('grabbing');

                startY = e.pageY - scrollContainer.offsetTop;

                scrollTop = scrollContainer.scrollTop;



                velocity = 0;

                cancelAnimationFrame(momentumID);

                lastY = e.pageY;

                lastTime = Date.now();

            });



            scrollContainer.addEventListener('mouseleave', () => {

                if (!isDown) return;

                isDown = false;

                scrollContainer.classList.remove('grabbing');

                startInertia();

            });



            scrollContainer.addEventListener('mouseup', () => {

                if (!isDown) return;

                isDown = false;

                scrollContainer.classList.remove('grabbing');

                startInertia();

            });



            scrollContainer.addEventListener('mousemove', (e) => {

                if (!isDown) return;

                e.preventDefault();



                const y = e.pageY - scrollContainer.offsetTop;

                const walk = (y - startY) * 1.5;

                scrollContainer.scrollTop = scrollTop - walk;



                // 計算即時速度

                const now = Date.now();

                const dt = now - lastTime;

                if (dt > 0) {

                    const dy = e.pageY - lastY;

                    velocity = dy * 0.8; // 速度權重

                    lastTime = now;

                    lastY = e.pageY;

                }

            });



            // 手機觸控支持

            scrollContainer.addEventListener('touchstart', (e) => {

                if (e.target.tagName.toLowerCase() === 'button') return;

                isDown = true;

                startY = e.touches[0].pageY - scrollContainer.offsetTop;

                scrollTop = scrollContainer.scrollTop;

                velocity = 0;

                cancelAnimationFrame(momentumID);

                lastY = e.touches[0].pageY;

                lastTime = Date.now();

            }, { passive: false });



            scrollContainer.addEventListener('touchmove', (e) => {

                if (!isDown) return;

                const y = e.touches[0].pageY - scrollContainer.offsetTop;

                const walk = (y - startY) * 1.5;

                scrollContainer.scrollTop = scrollTop - walk;



                const now = Date.now();

                const dt = now - lastTime;

                if (dt > 0) {

                    const dy = e.touches[0].pageY - lastY;

                    velocity = dy * 0.8;

                    lastTime = now;

                    lastY = e.touches[0].pageY;

                }

            }, { passive: true });



            scrollContainer.addEventListener('touchend', () => {

                if (!isDown) return;

                isDown = false;

                startInertia();

            });

        },



        renderData: function () {

            if (!window.ScoreManager || !this.overlay) return;

            const data = window.ScoreManager.loadPlayerData();



            // 填寫總覽

            const totalScore = Math.floor(data.totalScore || 0);

            // 文位改用 getEffectiveRank：未通過考試 + 未領獎狀時，即使積分達縣案首亦顯示童生
            const currentRankName = (window.ScoreManager && window.ScoreManager.getEffectiveRank)
                ? window.ScoreManager.getEffectiveRank(data)
                : (data.globalRank || '書僮');

            const claimed = data.achievements?.claimed || [];



            // ── 當前文位顯示 ──────────────────────────────────────────────
            //
            // ⚠️ 舊版在這裡還有一個「手動領取」的入口：只要
            //    `rank_<目前文位>` 不在 achievements.claimed 裡，就把玩家的
            //    文位名稱整個換成一顆寫著「領取稱號榜單」的按鈕，點下去
            //    呼叫 claimAchievementReward。這是積分升等時代的遺留，
            //    新規則下晉升獎勵在達成當下就已入帳（企劃書 §5），
            //    根本沒有東西可以領。它造成兩個實際問題：
            //      ① 玩家明明已經晉升，總覽卻看不到自己的文位，
            //         只看到一句莫名其妙的「領取稱號榜單」。
            //      ② 點下去會把 rank_X 寫進 claimed，而那正是
            //         grantPromotionSilver 用來判斷「發過沒」的旗標 ——
            //         真正晉升時的文錢會被誤判成已發放而永遠拿不到。
            //    因此這裡一律直接顯示文位名稱，點擊只開啟文位一覽表。

            const rankViewEl = document.getElementById('achRankView');

            rankViewEl.textContent = currentRankName;

            rankViewEl.classList.remove('clickable-rank');

            rankViewEl.style.cursor = 'pointer';

            rankViewEl.onclick = () => {

                if (window.SoundManager) window.SoundManager.playOpenItem && window.SoundManager.playOpenItem();

                this.showRankTablePopup(currentRankName);

            };



            document.getElementById('achTotalScore').textContent = totalScore.toLocaleString();

            document.getElementById('achPlayDays').textContent = data.playDays || 1;



            // 下一階級資訊

            const ranks = window.ScoreManager.ranks;

            let nextRank = null;

            for (let i = 0; i < ranks.length; i++) {

                if (totalScore < ranks[i].minScore) {

                    nextRank = ranks[i];

                    break;

                }

            }



            // ── 渲染「考試」相關 CTA（縣案首以上依規則顯示）── 移到文位下方
            this.renderExamCTAs(data, totalScore, nextRank);

            // ── 渲染文位進度橫欄（青雲梯課程進度＋考試，完全不看積分） ──
            this.renderRankProgressBar(data);



            // 渲染引繼碼區塊 (預設顯示暱稱)

            const idDisplay = document.getElementById('achCloudIdDisplay');

            const btnCopy = document.getElementById('achBtnCopyId');

            if (idDisplay) {

                idDisplay.textContent = data.nickname || '訪客';

            }

            if (btnCopy) {

                btnCopy.textContent = '顯示引繼碼';

            }



            // 渲染遊戲紀錄

            const gamesContainer = document.getElementById('achGamesContainer');

            gamesContainer.innerHTML = '';



            let hasGames = false;

            if (data.games) {

                for (const gameKey in data.games) {

                    const gameInfo = data.games[gameKey];

                    if (gameInfo && typeof gameInfo === 'object' && gameInfo.playCount > 0) {

                        hasGames = true;

                        const card = document.createElement('div');

                        card.className = 'ach-game-card';

                        card.innerHTML = `

                            <div class="ach-game-name">${this.gameNames[gameKey] || gameKey.toUpperCase()}</div>

                            <div class="ach-game-details">

                                最高分: <b>${Math.floor(gameInfo.highScore).toLocaleString()}</b><br>

                                最高難度: ${gameInfo.highestDifficulty}<br>

                                遊玩次數: ${gameInfo.playCount.toLocaleString()}

                            </div>

                        `;

                        gamesContainer.appendChild(card);

                    }

                }

            }

            if (!hasGames) {

                gamesContainer.innerHTML = '<div style="text-align:center; color:#999; padding:18px;">尚無遊戲紀錄</div>';

            }



            // 渲染成就殿堂

            const badgesContainer = document.getElementById('achBadgesContainer');

            badgesContainer.innerHTML = '';



            const claimStatus = data.achievements.claimed || [];

            const certImages = this.certImages;



            let lastUnlockedItem = null;



            // 1. 渲染玩家階級榜單
            //
            // ⚠️⚠️ 這一段曾經是整個舊「積分升等」制度最後的殘留，
            //    判定式是 `totalScore >= r.minScore`，跟青雲梯進度、
            //    跟考試通過與否**完全無關**。造成的實際災情有兩個：
            //
            //    ① 玩家積分早就超過門檻，於是「童生」這種根本還沒考過的
            //       文位，在成就殿堂冒出一顆「領取獎狀」按鈕。
            //    ② 那顆按鈕會呼叫 claimAchievementReward('rank_童生')，
            //       把 `rank_童生` 寫進 achievements.claimed。而新制的
            //       grantPromotionSilver 正是用同一個旗標做冪等判斷 ——
            //       將來玩家真的考過童生時，它會認定「已經發過了」而回傳 0，
            //       **那筆晉升文錢就永遠領不到，而且沒有任何錯誤訊息**。
            //
            //    新制下文位晉升「達成即入帳」，本來就沒有手動領取這回事
            //    （企劃書 §5），因此這裡改成純粹的「成績單」：
            //    達成與否一律以 getEffectiveRank（站點進度＋考試通過）為準，
            //    已達成的可以回看獎狀，未達成的顯示未達成，不再有領取動作。

            const effectiveRankName = (window.ScoreManager && window.ScoreManager.getEffectiveRank)
                ? window.ScoreManager.getEffectiveRank(data)
                : ranks[0].name;
            const effectiveRankIdx = ranks.findIndex(x => x.name === effectiveRankName);

            ranks.forEach((r, idx) => {

                // 文位是依序取得的，因此「索引不超過目前文位」即為已達成
                const isAchieved = idx <= effectiveRankIdx;

                const item = document.createElement('div');

                item.className = 'ach-badge-item rank-item';

                const left = document.createElement('div');

                left.innerHTML = `

                    <div class="ach-badge-title">【文位】${r.name}</div>

                    <div class="ach-badge-status">${isAchieved ? '已達成' : '未達成'}</div>

                `;

                const right = document.createElement('div');

                right.className = 'ach-item-right';

                const certImg = certImages[Math.min(idx, certImages.length - 1)];

                if (isAchieved) {

                    const btn = document.createElement('button');

                    btn.className = 'ach-btn-claim';

                    btn.textContent = '查看獎狀';

                    btn.style.background = 'hsl(44, 60%, 44%)';

                    btn.onclick = () => {

                        this.showCert(certImg, this.rankCertTexts[r.name] || '恭喜榮升！');

                    };

                    right.appendChild(btn);

                    lastUnlockedItem = item;

                } else {

                    const span = document.createElement('span');

                    span.style.color = '#ccc';

                    span.textContent = '未達成';

                    right.appendChild(span);

                }

                item.appendChild(left);

                item.appendChild(right);

                badgesContainer.appendChild(item);

            });



            // 2.【關卡挑戰】成就區塊已移除
            //    （note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md）
            //    難度選單已無獨立關卡模式，此獎狀類別失去對應場景。

            // 3. 渲染原有次數成就

            const categories = [

                { data: data.difficultyCounts || {}, map: { '小學': '小學', '中學': '中學', '高中': '高中', '大學': '大學', '研究所': '研究所' } },

                { data: data.games || {}, map: this.gameNames }

            ];



            categories.forEach(cat => {

                const countsInfo = cat.data;

                const nameMap = cat.map;



                for (let key in nameMap) {

                    let count = countsInfo[key] || 0;

                    if (typeof count === 'object') count = count.playCount || 0;

                    const dispName = nameMap[key];

                    const isDifficultyKey = !!this.difficultyCountRewards[key];



                    // 動態產生此 key 已達成的門檻：10 / 20 / 50 / 100 起每滿 100 次無限延伸
                    const keyThresholds = this.getCountThresholds(count);
                    // 防禦性處理：若玩家過去已領取但目前存檔的次數低於門檻（理論上不會發生），仍將該門檻補回清單
                    claimStatus.forEach(id => {
                        if (id.indexOf(key + '_') === 0) {
                            const n = parseInt(id.slice(key.length + 1), 10);
                            if (!isNaN(n) && keyThresholds.indexOf(n) === -1) keyThresholds.push(n);
                        }
                    });
                    keyThresholds.sort((a, b) => a - b);



                    keyThresholds.forEach((t, i) => {

                        const certImg = certImages[i % certImages.length];

                        let title = `「${dispName}」過關${t}次`;

                        if (isDifficultyKey) {

                            title = `『${dispName}』程度過關${t}次`;

                        }



                        const achId = `${key}_${t}`;

                        const isClaimed = claimStatus.includes(achId);

                        const isUnlocked = count >= t;



                        const item = document.createElement('div');

                        item.className = 'ach-badge-item';



                        const left = document.createElement('div');

                        left.innerHTML = `

                            <div class="ach-badge-title">${title}</div>

                            <div class="ach-badge-status">進度: ${count} / ${t}</div>

                        `;



                        const right = document.createElement('div');

                        right.className = 'ach-item-right';



                        if (isClaimed) {

                            const btn = document.createElement('button');

                            btn.className = 'ach-btn-claim';

                            btn.textContent = '查看獎狀';

                            btn.style.background = 'hsl(44, 60%, 44%)';

                            btn.onclick = () => {

                                this.showCert(certImg, `恭賀\n「${dispName}」過關達${t}次。\n才思敏捷，氣貫長虹。望君續筆山川，再現錦繡華章。`);

                            };

                            right.appendChild(btn);

                        } else if (isUnlocked) {

                            const btn = document.createElement('button');

                            btn.className = 'ach-btn-claim claim-pending';

                            btn.textContent = '領取獎狀';

                            btn.dataset.achId = achId;

                            btn.onclick = () => {

                                this.claimAchievementReward(achId, certImg, `恭賀\n「${dispName}」過關達${t}次。\n才思敏捷，氣貫長虹。望君續筆山川，再續錦繡華章。`);

                            };

                            right.appendChild(btn);

                            lastUnlockedItem = item;

                        }



                        item.appendChild(left);

                        item.appendChild(right);

                        badgesContainer.appendChild(item);

                    });

                }

            });



            // 註：不再於此處自動捲動；捲動改由「頁籤點擊」與「領取獎狀之後」統一由
            //     scrollToFirstPending() 處理，避免 renderData 每次重繪就跳到最後一項。
            void lastUnlockedItem;



            // 渲染詩詞寶盒面板

            this.renderPoemsPanel(data);

            // 更新「成就殿堂」頁籤右上角未領獎狀提示，並同步「領取所有獎狀」那一列
            // ⚠️ 待領數量一律以剛剛重繪出來的 DOM 為準，不另外再算一次。
            //    若這裡自己重算一遍門檻，就等於把上面那段判定邏輯抄成第二份，
            //    日後任一邊改了規則就會出現「按鈕說有 3 張、清單只有 2 張」。
            const pendingBtns = badgesContainer.querySelectorAll('.ach-btn-claim.claim-pending');
            const pendingCount = pendingBtns.length;

            const badgeTab = this.overlay.querySelector('.ach-tab[data-target="ach-panel-badges"]');
            if (badgeTab) {
                badgeTab.classList.toggle('has-unclaimed', pendingCount > 0);
            }

            const claimAllRow = this.overlay.querySelector('#achClaimAllRow');
            if (claimAllRow) {
                claimAllRow.style.display = pendingCount > 0 ? '' : 'none';
                if (pendingCount > 0) {
                    // 順便把「一次能拿到多少」先算給玩家看，省得逐張點開才知道
                    let sumScore = 0, sumSilver = 0;
                    pendingBtns.forEach(b => {
                        const rw = this.getRewardForAchId(b.dataset.achId || '');
                        sumScore += rw.score || 0;
                        sumSilver += rw.silver || 0;
                    });
                    const btnAll = this.overlay.querySelector('#achBtnClaimAll');
                    if (btnAll) btnAll.textContent = `領取所有獎狀（${pendingCount} 張）`;
                    const hint = this.overlay.querySelector('#achClaimAllHint');
                    if (hint) {
                        hint.textContent = `可獲 ${sumScore.toLocaleString()} 積分 ／ ${sumSilver.toLocaleString()} 文錢`;
                    }
                }
            }
            // 更新「總覽」頁籤右上角提示：有考試 CTA 或領獎狀 CTA 就亮紅點
            const overviewTab = this.overlay.querySelector('.ach-tab[data-target="ach-panel-overview"]');
            if (overviewTab) {
                const hasCta = !!this.overlay.querySelector('#achExamCtaWrap .claim-pending');
                overviewTab.classList.toggle('has-unclaimed', hasCta);
            }
            // 同步刷新選單漢堡「成就紀錄」圖示提示
            if (typeof window.MenuAchievementBadgeUpdate === 'function') {
                window.MenuAchievementBadgeUpdate();
            }

            // --- 核心修正：將所有成就狀態「數據化」，確保本地與雲端完全一致 ---

            this.syncAchievementStates(data);

        },



        /**

         * 成就設計理念：

         * - claimed[]  = 唯一需要持久化的成就數據（避免重複領獎）

         * - unlocked/progress 均從 games/levelProgress/totalScore 動態計算，不儲存

         * - 每次領獎後，直接呼叫 saveGameToCloud 同步 claimed 即可

         */

        syncAchievementStates: function (currentData) {

            // 此函式保留為空，設計上不再推算 unlocked/progress

            // 雲端只需同步 totalScore, games, levelProgress, claimed

        },

        // 點擊當前文位開啟：所有文位一覽表，右上角 X 關閉
        //
        // ⚠️ 舊版這張表列的是「文位 + 積分門檻」，那是積分升等時代的東西。
        //    新規則下積分完全不參與文位判定（企劃書 §2），繼續把積分門檻
        //    擺在「文位一覽」裡，等於明著告訴玩家「刷分就能升文位」，
        //    與實際規則完全相反。改列真正的判準：該文位要學會幾首詩，
        //    以及塾生起還需要通過考試。
        showRankTablePopup: function (currentRankName) {

            if (!this.overlay) return;

            // 若已存在，先移除
            const existed = this.overlay.querySelector('#achRankTablePopup');
            if (existed) existed.remove();

            const ranks = (window.ScoreManager && window.ScoreManager.ranks) || [];
            const PS = window.PathStations;
            const milestones = (PS && typeof PS.getMilestones === 'function') ? PS.getMilestones() : [];
            const msByName = {};
            milestones.forEach(m => { msByName[m.name] = m.poems; });

            const currIdx = ranks.findIndex(x => x.name === currentRankName);

            const rows = ranks.map((r, idx) => {
                const isCurr = (r.name === currentRankName);
                const rowStyle = isCurr
                    ? 'background:hsla(45,80%,45%,0.28);font-weight:bold;color:hsl(48,90%,80%);'
                    : '';
                const poems = (msByName[r.name] != null) ? msByName[r.name] + ' 首' : '—';
                const needExam = (PS && typeof PS.isExamRank === 'function') ? PS.isExamRank(r.name) : false;
                const state = (idx <= currIdx) ? '已達成' : (needExam ? '需通過考試' : '未達成');
                return `<tr style="${rowStyle}">
                    <td style="padding:6px 10px;border-bottom:1px solid hsla(45,40%,60%,0.25);text-align:center;">${r.name}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid hsla(45,40%,60%,0.25);text-align:right;">${poems}</td>
                    <td style="padding:6px 10px;border-bottom:1px solid hsla(45,40%,60%,0.25);text-align:center;">${state}</td>
                </tr>`;
            }).join('');

            const popup = document.createElement('div');
            popup.id = 'achRankTablePopup';
            popup.style.cssText = [
                'position:absolute',
                'left:50%',
                'top:50%',
                'transform:translate(-50%,-50%)',
                'width:80%',
                'max-height:92%',
                'background:linear-gradient(135deg, hsl(30,35%,16%), hsl(28,40%,2%))',
                'border:2px solid hsl(45,70%,55%)',
                'border-radius:12px',
                'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
                'z-index:10',
                'display:flex',
                'flex-direction:column',
                'color:hsl(45,80%,88%)',
                'font-family:inherit'
            ].join(';');

            popup.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid hsla(45,60%,55%,0.4);">
                    <div style="font-size:22px;font-weight:bold;color:hsl(48,85%,72%);">文位一覽</div>
                    <div id="achRankTableClose" style="cursor:pointer;font-size:22px;line-height:1;padding:2px 8px;color:hsl(45,70%,75%);">✕</div>
                </div>
                <div style="overflow-y:auto;padding:10px 14px;">
                    <table style="width:100%;border-collapse:collapse;font-size:20px;">
                        <thead>
                            <tr style="color:hsl(48,80%,70%);">
                                <th style="padding:6px 10px;border-bottom:2px solid hsla(45,60%,55%,0.5);text-align:center;">文位</th>
                                <th style="padding:6px 10px;border-bottom:2px solid hsla(45,60%,55%,0.5);text-align:right;">應學詩詞</th>
                                <th style="padding:6px 10px;border-bottom:2px solid hsla(45,60%,55%,0.5);text-align:center;">狀態</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;

            const container = this.overlay.querySelector('#achContainer') || this.overlay;
            container.appendChild(popup);

            popup.querySelector('#achRankTableClose').addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem && window.SoundManager.playCloseItem();
                popup.remove();
            });
        },

        // 「參加考試」與「領取獎狀」CTA — 掛在總覽 #achNextRankInfo（文位下方）
        renderExamCTAs: function (data, totalScore, nextRank) {

            const host = document.getElementById('achNextRankInfo');
            if (!host) return;
            host.innerHTML = '';    // 完全重畫

            const examRankNames = (window.ScoreManager && window.ScoreManager.EXAM_RANK_NAMES) || [];
            const coll = (window.FMCollectionSave && window.FMCollectionSave.load()) || {};
            const passed = (coll.ranks && coll.ranks.passed) || [];
            const stats = coll.examStats || {};

            // ⚠️ 舊版這裡還有一段「已通過考試但未領獎狀 → 顯示領取獎狀」的
            //    分支，已整段移除：新制的晉升獎勵在考試通過的當下就已入帳
            //    （企劃書 §5「彈窗只是表演，不是領取動作」），再擺一顆
            //    領取按鈕只會讓玩家以為還有東西沒拿，而且點下去會污染
            //    achievements.claimed 這個冪等旗標（詳見成就殿堂那一段的說明）。

            // 找「已具應試資格但尚未通過考試」的最低文位（催促去考試）
            // ⚠️ 資格看必通關卡（企畫書 §6），完全不看積分；
            //    因此這裡不需要、也不可以再去查 ScoreManager.ranks 的 minScore。
            let toExam = null;
            for (const name of examRankNames) {
                const _p = (window.LearningPath && window.LearningPath.getRankExamProgress)
                    ? window.LearningPath.getRankExamProgress(name) : { ok: false };
                if (_p.ok && passed.indexOf(name) < 0) {
                    toExam = { name: name };
                    break;
                }
            }

            if (!toExam) return;

            const wrap = document.createElement('div');
            wrap.id = 'achExamCtaWrap';
            wrap.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;align-items:center;gap:6px;';

            // 已具應試資格但未考 → 引導到江南小院考棚
            const st = stats[toExam.name] || { passCount: 0, failCount: 0 };
            const attemptNo = (st.passCount || 0) + (st.failCount || 0) + 1;
            const btn = document.createElement('button');
            btn.className = 'ach-btn-medium claim-pending';
            btn.style.background = 'linear-gradient(135deg, hsl(0, 65%, 50%), hsl(0, 65%, 35%))';
            btn.innerHTML = `參加「${toExam.name}」考試 <span style="opacity:.85;font-weight:normal;">（第 ${attemptNo} 次挑戰）</span>`;
            btn.onclick = () => {
                if (window.SoundManager) window.SoundManager.playConfirmItem();
                this.hide();
                if (window.CollectionDialog && window.CollectionDialog.show) {
                    window.CollectionDialog.show();
                }
                setTimeout(() => {
                    if (window.CollectionDialog && typeof window.CollectionDialog.openExam === 'function') {
                        window.CollectionDialog.openExam();
                    }
                }, 350);
            };
            wrap.appendChild(btn);
            if (st.failCount > 0) {
                const hint = document.createElement('div');
                hint.style.cssText = 'font-size:14px;color:hsl(45,60%,68%);';
                hint.textContent = `歷次紀錄：通過 ${st.passCount} 次 / 挑戰失敗 ${st.failCount} 次`;
                wrap.appendChild(hint);
            }

            host.appendChild(wrap);
        },

        /**
         * 繪製「文位進度」橫欄 —— 依青雲梯課程進度，不看積分。
         *
         * ⚠️⚠️ 這支函式的舊版簽章是 renderRankProgressBar(totalScore)，
         *    畫的是 totalScore 在 ScoreManager.ranks[].minScore 之間的比例。
         *    那是舊制「積分升等」的最後一處殘留：畫面上是一條寫著
         *    「書僮 → 蒙童」的進度條，玩家刷分它就前進，但實際上刷再多分
         *    也一格都不會晉升（企劃書 §2）。加註「與文位無關」的小字沒有用 ——
         *    進度條本身講的話比小字大聲。因此整支改寫為真正的判準：
         *
         *      目前文位 = ScoreManager.getEffectiveRank()（站點進度＋考試通過）
         *      下一文位 = PathStations.getNextRankNameAfter(目前文位)
         *      進度     = LearningPath.getRankExamProgress(下一文位)
         *                 的 poemsDone / poemsNeed（該里程碑之前，
         *                 必通關卡全數完成的詩詞首數）
         *
         *    分母採「應學詩詞首數」而非「必通關卡數」，是為了與點擊文位
         *    彈出的「文位一覽」表格欄位一致（那張表列的就是應學詩詞 N 首），
         *    兩處對不上會讓玩家以為其中一邊算錯。
         *
         * @param {object} data ScoreManager.loadPlayerData() 的結果
         */
        renderRankProgressBar: function (data) {
            const row = document.getElementById('achRankProgressRow');
            const fromEl = document.getElementById('achRankProgFrom');
            const toEl = document.getElementById('achRankProgTo');
            const scoreEl = document.getElementById('achRankProgScore');
            const fillEl = document.getElementById('achRankProgFill');
            const capEl = document.getElementById('achRankProgCaption');
            if (!row || !fromEl || !toEl || !scoreEl || !fillEl) return;

            const SM = window.ScoreManager;
            const PS = window.PathStations;
            const LP = window.LearningPath;

            // 三個模組任一未載入就整條隱藏 —— 寧可不顯示，也不要退回積分那條路，
            // 否則又會在某些載入時序下悄悄畫出一條「刷分就會動」的假進度。
            if (!SM || !PS || !LP || typeof SM.getEffectiveRank !== 'function') {
                row.style.display = 'none';
                return;
            }
            row.style.display = '';

            const currName = SM.getEffectiveRank(data);
            const nextName = (typeof PS.getNextRankNameAfter === 'function')
                ? PS.getNextRankNameAfter(currName) : '';

            fromEl.textContent = currName;

            // 已是最後一個文位（大儒）
            if (!nextName) {
                toEl.textContent = '極位';
                scoreEl.textContent = '已臻極位';
                fillEl.style.width = '100%';
                if (capEl) capEl.textContent = '文位進度（青雲梯課程，與積分無關）';
                return;
            }

            toEl.textContent = nextName;

            const prog = (typeof LP.getRankExamProgress === 'function')
                ? LP.getRankExamProgress(nextName)
                : { ok: false, poemsDone: 0, poemsNeed: 0 };

            const need = prog.poemsNeed || 0;
            const done = Math.min(prog.poemsDone || 0, need);
            const pct = need > 0 ? Math.min(100, (done / need) * 100) : 0;

            scoreEl.textContent = `${done} / ${need} 首`;
            fillEl.style.width = pct.toFixed(1) + '%';

            // 課程已修畢但下一個文位要考試 → 進度條滿格，但文位還沒到手，
            // 必須明講，否則玩家會看著滿格的條子疑惑為何文位沒變。
            // （「參加考試」按鈕由 renderExamCTAs 畫在文位下方。）
            if (capEl) {
                const needExam = (typeof PS.isExamRank === 'function') && PS.isExamRank(nextName);
                capEl.textContent = (prog.ok && needExam)
                    ? `課程已修畢，通過「${nextName}」考試即可晉升`
                    : '文位進度（青雲梯課程，與積分無關）';
            }
        },

        // 手動計算並捲動到第一個「領取獎狀」按鈕；
        // scrollIntoView 在 transform: scale() 縮放的祖先下不可靠，
        // 因此改用 getBoundingClientRect 反算再直接設定 .ach-body 的 scrollTop。
        scrollToFirstPending: function () {

            if (!this.overlay) return;

            const body = this.overlay.querySelector('.ach-body');

            if (!body) return;

            // ⚠️ 一定要限縮在 #achBadgesContainer 之內。「領取所有獎狀」按鈕
            //    也帶著 .ach-btn-claim.claim-pending（為了共用金色樣式與紅點），
            //    若用 #ach-panel-badges 當範圍，它會變成第一個命中的元素，
            //    自動捲動就會停在那顆常駐按鈕上，而不是第一張待領獎狀。
            const btn = this.overlay.querySelector('#achBadgesContainer .ach-btn-claim.claim-pending');

            if (!btn) {
                // 沒有待領項目 → 捲回頂端
                body.scrollTo({ top: 0, behavior: 'smooth' });
                return;
            }

            const item = btn.closest('.ach-badge-item') || btn;
            const scale = (window.stageRect && window.stageRect.scale) || 1;
            const bodyRect = body.getBoundingClientRect();
            const itemRect = item.getBoundingClientRect();

            // 螢幕上的距離換算為 body 內部（未縮放）座標
            const itemInternalTop = body.scrollTop + (itemRect.top - bodyRect.top) / scale;
            const centerOffset = (body.clientHeight - item.clientHeight) / 2;
            const target = Math.max(0, itemInternalTop - centerOffset);

            body.scrollTo({ top: target, behavior: 'smooth' });

        },

        // 難度顯示顏色
        diffColors: {
            '研究所': 'hsl(280, 60%, 75%)',
            '大學': 'hsl(10,  80%, 70%)',
            '高中': 'hsl(35,  90%, 65%)',
            '中學': 'hsl(210, 70%, 70%)',
            '小學': 'hsl(120, 60%, 65%)'
        },

        // 渲染詩詞寶盒面板
        renderPoemsPanel: function (data) {

            const container = document.getElementById('achPoemContainer');

            if (!container) return;

            container.innerHTML = '';

            const poemRecords = data.poemRecords || {};

            // ── 排序與呈現規則（企畫書第 2.3 節）───────────────────────────
            // 改版前：只列出「玩過的詩」，且依遊玩次數排序 ——
            //         等於用玩家的隨機遊玩順序決定畫面順序，看不出收集進度。
            // 改版後：列出**全部詩詞**，固定依
            //           主要鍵 = 詩詞評價 rating（7 → 1）
            //           次要鍵 = 詩句總評價（line_ratings 平均，高 → 低）
            //         排列，未收集的以暗色呈現。
            //         學習道路正是從評價 7 開始，因此初期收集到的寶盒
            //         永遠顯示在最前端，往下捲就是還沒收集的部分。
            //         ⚠️ 不使用分頁（分頁看起來不像遊戲），維持單一可捲動清單。
            const avgLineRating = (p) => {
                const lr = (p && p.line_ratings) || [];
                if (!lr.length) return 0;
                let s = 0;
                for (let i = 0; i < lr.length; i++) s += (lr[i] || 0);
                return s / lr.length;
            };

            const allPoems = (typeof POEMS !== 'undefined') ? POEMS.slice() : [];

            if (allPoems.length === 0) {

                container.innerHTML = '<div style="text-align:center;color:#999;padding:18px;">尚無詩詞資料</div>';

                return;

            }

            allPoems.sort((a, b) =>
                (b.rating || 0) - (a.rating || 0) ||
                avgLineRating(b) - avgLineRating(a) ||
                (a.id || 0) - (b.id || 0)
            );

            const played = allPoems.map(poem => {
                const counts = poemRecords[poem.id] || poemRecords[String(poem.id)] || {};
                const total = (counts['小學'] || 0) + (counts['中學'] || 0) + (counts['高中'] || 0)
                    + (counts['大學'] || 0) + (counts['研究所'] || 0);
                return { poemId: poem.id, counts, total, poem };
            });

            // 各評價層的收集進度，供分組標題顯示「3 / 12」
            const groupStat = {};

            played.forEach(r => {
                const g = r.poem.rating || 0;
                if (!groupStat[g]) groupStat[g] = { got: 0, all: 0 };
                groupStat[g].all++;
                if (r.total > 0) groupStat[g].got++;
            });

            const diffs = ['研究所', '大學', '高中', '中學', '小學'];

            let lastRating = null;

            played.forEach(({ poemId, counts, total, poem }) => {

                // 評價改變時插入分組標題，讓 381 首的長清單有段落感
                // （仍然是同一條可上下拖曳的清單，沒有分頁）
                const rating = poem.rating || 0;

                if (rating !== lastRating) {

                    lastRating = rating;

                    const gh = document.createElement('div');

                    gh.className = 'ach-poem-group-header';

                    const st = groupStat[rating] || { got: 0, all: 0 };

                    gh.textContent = '評價 ' + rating + '　　' + st.got + ' / ' + st.all;

                    container.appendChild(gh);

                }

                const title = poem ? poem.title : poemId;

                const author = poem ? (poem.author || '') : '';

                const item = document.createElement('div');

                // 未收集的詩以暗色呈現，讓玩家一眼看出還有多少沒收集
                item.className = 'ach-poem-item' + (total > 0 ? '' : ' ach-poem-item-locked');

                const left = document.createElement('div');

                left.className = 'ach-poem-left';

                const titleEl = document.createElement('div');

                titleEl.className = 'ach-poem-title';

                titleEl.textContent = title;

                if (author) titleEl.title = author;

                titleEl.addEventListener('click', () => {

                    if (window.SoundManager) window.SoundManager.playConfirmItem();

                    if (window.PoemDialog) window.PoemDialog.openById(poemId);

                });

                const countsEl = document.createElement('div');

                countsEl.className = 'ach-poem-counts';

                countsEl.innerHTML = total > 0 ? '次數：' : '尚未收集';

                diffs.forEach(diff => {

                    const cnt = counts[diff] || 0;

                    if (cnt <= 0) return;

                    const span = document.createElement('span');

                    span.className = 'ach-poem-count-tag';

                    span.textContent = diff + '×' + cnt;

                    span.style.color = this.diffColors[diff];

                    countsEl.appendChild(span);

                });

                left.appendChild(titleEl);

                left.appendChild(countsEl);

                const right = document.createElement('div');

                right.className = 'ach-item-right';

                // 只有已收集的詩才給「寶盒」按鈕；未收集的留白，避免誤觸空寶盒
                if (total > 0) {

                    const btn = document.createElement('button');

                    btn.className = 'ach-btn-claim';

                    btn.textContent = '寶盒';

                    btn.onclick = () => {

                        if (window.SoundManager) window.SoundManager.playConfirmItem();

                        this.showTreasureBox(poem, counts, total);

                    };

                    right.appendChild(btn);

                }

                item.appendChild(left);

                item.appendChild(right);

                container.appendChild(item);

            });

        },

        // 顯示詩詞寶盒圖片 (5×8格子螺旋解鎖)
        showTreasureBox: function (poem, counts, totalCount) {

            const existing = document.getElementById('treasureBoxOverlay');

            if (existing) existing.remove();

            const imgSrc = 'images/TreasureBox/李白-早發白帝城-001.png';

            const overlay = document.createElement('div');

            overlay.id = 'treasureBoxOverlay';

            overlay.className = 'treasurebox-overlay';

            overlay.innerHTML = `

                <div class="treasurebox-stage" id="tbStage">

                    <div class="treasurebox-container" id="tbContainer">
                        <img class="treasurebox-img" src="${imgSrc}" alt="">

                        <div class="treasurebox-grid" id="tbGrid"></div>

                    </div>

                    <div class="treasurebox-hint">點擊任意處關閉</div>

                </div>

            `;

            document.body.appendChild(overlay);

            // 對齊舞台
            const tbStage = overlay.querySelector('#tbStage');

            if (window.stageRect) {

                const r = window.stageRect;

                tbStage.style.position = 'absolute';

                tbStage.style.left = r.left + 'px';

                tbStage.style.top = r.top + 'px';

                tbStage.style.width = '500px';

                tbStage.style.height = '850px';

                tbStage.style.transform = 'scale(' + r.scale + ')';

                tbStage.style.transformOrigin = 'top left';

            }

            // 建立 5×8 格子
            const grid = overlay.querySelector('#tbGrid');

            const spiralOrder = this.getGridSpiralOrder();

            const ROWS = 8, COLS = 5;

            const cellMap = {};

            for (let r = 0; r < ROWS; r++) {

                for (let c = 0; c < COLS; c++) {

                    const cell = document.createElement('div');

                    cell.className = 'tb-cell tb-cell-hidden';

                    cell.style.gridRow = (r + 1).toString();

                    cell.style.gridColumn = (c + 1).toString();

                    cellMap[r + '_' + c] = cell;

                    grid.appendChild(cell);

                }

            }

            // 依通關次數解鎖格子（解鎖的格子顯示彩色原圖對應區塊）
            const maxReveal = Math.min(Math.max(totalCount, 0), 40);

            for (let i = 0; i < maxReveal; i++) {

                const pos = spiralOrder[i];

                const cell = cellMap[pos.row + '_' + pos.col];

                if (cell) {
                    cell.classList.remove('tb-cell-hidden');
                    // 顯示彩色原圖對應的切片
                    cell.style.backgroundImage = `url('${imgSrc}')`;
                    cell.style.backgroundSize = '500% 800%';
                    cell.style.backgroundPosition =
                        `calc(${pos.col * 100 / 4}%) calc(${pos.row * 100 / 7}%)`;
                }

            }

            overlay.addEventListener('click', () => {

                if (window.SoundManager) window.SoundManager.playCloseItem();

                overlay.remove();

            });

        },

        // 計算 5×8 格子的逆時針螺旋順序 (從左下角出發)
        getGridSpiralOrder: function () {

            const ROWS = 8, COLS = 5;

            const visited = [];

            for (let r = 0; r < ROWS; r++) visited.push(Array(COLS).fill(false));

            const order = [];

            // 逆時針 (在螢幕座標系): 右→上→左→下
            const dr = [0, -1, 0, 1];

            const dc = [1, 0, -1, 0];

            let r = ROWS - 1, c = 0, dir = 0;

            for (let i = 0; i < ROWS * COLS; i++) {

                order.push({ row: r, col: c });

                visited[r][c] = true;

                const nr = r + dr[dir], nc = c + dc[dir];

                if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc]) {

                    r = nr; c = nc;

                } else {

                    dir = (dir + 1) % 4;

                    r += dr[dir]; c += dc[dir];

                }

            }

            return order;

        },



        //顯示獎狀

        showCert: function (imgUrl, text, isNewClaim = false, scoreReward = 10000, silverReward = 0) {

            let overlay = document.getElementById('certOverlay');

            if (!overlay) {

                overlay = document.createElement('div');

                overlay.id = 'certOverlay';

                overlay.className = 'cert-overlay';

                overlay.innerHTML = `

                    <div class="cert-card fallback-bg" id="certCard">

                        <div class="cert-content" id="certContentBox">

                            <div class="cert-text" id="certText"></div>

                        </div>

                        <div class="cert-reward-msg" id="certRewardMsg"></div>

                        <div class="cert-close-hint">點擊任意處關閉</div>

                    </div>

                    <div id="certStarContainer" class="cert-star-container"></div>

                `;

                document.body.appendChild(overlay);

                overlay.addEventListener('click', () => {

                    if (window.SoundManager) window.SoundManager.playCloseItem();

                    overlay.classList.remove('active');

                });

                // 對齊 500×850 舞台：同 ach-container 的做法
                const certCardEl = overlay.querySelector('#certCard');

                const certStarEl = overlay.querySelector('#certStarContainer');

                if (window.registerOverlayResize) {

                    window.registerOverlayResize(function (r) {

                        const W = 500 * 0.96, H = 850 * 0.96;

                        const x = r.left + 500 * 0.02 * r.scale;

                        const y = r.top + 850 * 0.02 * r.scale;

                        certCardEl.style.width = W + 'px';

                        certCardEl.style.height = H + 'px';

                        certCardEl.style.left = x + 'px';

                        certCardEl.style.top = y + 'px';

                        certCardEl.style.transform = 'scale(' + r.scale + ')';

                        certCardEl.style.transformOrigin = 'top left';

                        certStarEl.style.left = x + 'px';

                        certStarEl.style.top = y + 'px';

                        certStarEl.style.width = (W * r.scale) + 'px';

                        certStarEl.style.height = (H * r.scale) + 'px';

                    });

                }

            }



            const certCard = document.getElementById('certCard');

            const certText = document.getElementById('certText');

            const certContent = document.getElementById('certContentBox');

            const rewardMsg = document.getElementById('certRewardMsg');

            const starContainer = document.getElementById('certStarContainer');



            // ⚠️ imgUrl 允許傳 null（青雲梯小站晉升的「簡易慶祝動畫」用）：
            //    此時不掛獎狀底圖，只保留文字與星星特效。
            //    這是為了不必再寫一支邏輯幾乎重複的動畫函式
            //    （見 note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md）。
            if (imgUrl) {
                certCard.style.backgroundImage = `url('${imgUrl}')`;
                certCard.classList.remove('cert-no-image');
            } else {
                certCard.style.backgroundImage = 'none';
                certCard.classList.add('cert-no-image');
            }

            certText.textContent = text;

            rewardMsg.style.display = 'none';

            starContainer.innerHTML = '';



            certContent.classList.remove('animate');

            void certContent.offsetWidth;

            certContent.classList.add('animate');



            overlay.classList.add('active');

            //顯示領取得分獎勵訊息

            if (isNewClaim) {

                rewardMsg.style.display = 'block';

                rewardMsg.style.opacity = '1';



                const duration = 3000;

                const startTime = Date.now();



                const spawnStar = () => {

                    const star = document.createElement('span');

                    star.className = 'cert-star';

                    star.textContent = '★';

                    star.style.fontSize = (Math.random() * 1 + 0.5) + 'rem';

                    star.style.left = Math.random() * 100 + '%';

                    star.style.animationDuration = (Math.random() * 1.5 + 0.5) + 's';

                    starContainer.appendChild(star);

                    setTimeout(() => star.remove(), 3000);

                };

                const starInterval = setInterval(spawnStar, 30);



                const animate = () => {

                    const elapsed = Date.now() - startTime;

                    const progress = Math.min(1, elapsed / duration);

                    const curScore = Math.floor(scoreReward * progress);

                    const curSilver = Math.floor(silverReward * progress);

                    // 同時顯示 +積分 與 +文錢
                    // ⚠️ 積分為 0 時整行不顯示：青雲梯的文位晉升只給文錢、
                    //    不再給積分（企劃書 §2），若照舊印出「獲贈 0 積分」
                    //    會讓玩家以為獎勵算錯了。
                    const parts = [];
                    if (scoreReward > 0) parts.push(`獲贈 ${curScore.toLocaleString()} 積分`);
                    if (silverReward > 0) parts.push(`獲贈 ${curSilver.toLocaleString()} 文錢`);
                    rewardMsg.innerHTML = parts.join('<br>');

                    if (progress < 1) {

                        requestAnimationFrame(animate);

                    } else {

                        clearInterval(starInterval);

                        //取消延遲1秒後消失，留在原地

                        //setTimeout(() => { rewardMsg.style.opacity = '0'; }, 1000);

                    }

                };

                requestAnimationFrame(animate);

            }

        },



        // getLevelCertText 與 showInstantAchievementPop 已移除
        //（note/青雲梯與獎勵企畫書/青雲梯與文位晉升_總企畫書.md）：
        // 兩者只服務【關卡挑戰】里程碑獎狀，該類別取消後已無呼叫來源。
        // ⚠️ 38 個遊戲檔仍寫著
        //      const achId = ScoreManager.completeLevel(...);
        //      if (achId && window.AchievementDialog) { ...showInstantAchievementPop... }
        //    但 completeLevel 已不再回傳里程碑 achId（恆為 null），
        //    該分支永遠不會執行，因此毋須逐一修改那 38 個檔案。


        //領取獎勵

        claimAchievementReward: function (achId, imgUrl, text) {

            // ⚠️⚠️ 文位獎狀（rank_*）**絕對不可以**走這條路領取。
            //    新規則下文位晉升的文錢在達成當下就由
            //    LearningPath.grantPromotionSilver 入帳（企劃書 §5），
            //    而它判斷「發過了沒」靠的正是 achievements.claimed 裡的
            //    `rank_<文位>`。若讓這支舊的手動領取函式也去寫同一個旗標，
            //    玩家提前點一下，將來真正晉升時就會被判定成「已發過」
            //    而拿不到那筆文錢，且全程沒有任何錯誤訊息。
            //    此外這裡還會發積分，也違反「晉升只給文錢」的新規則。
            //    目前 UI 已經沒有任何入口會傳 rank_ 進來，這道防線是為了
            //    擋掉日後有人不知情又接回去（成就殿堂就這樣殘留了很久）。
            if (typeof achId === 'string' && achId.indexOf('rank_') === 0) {
                console.warn('[成就] 文位獎狀不經手動領取，已改為晉升當下自動入帳：', achId);
                this.showCert(imgUrl, text, false);
                return;
            }

            if (window.SoundManager) window.SoundManager.playJoyfulTriple();

            const data = window.ScoreManager.loadPlayerData();

            if (!data.achievements.claimed) data.achievements.claimed = [];



            if (data.achievements.claimed.includes(achId)) {

                this.showCert(imgUrl, text, false);

                return;

            }



            data.achievements.claimed.push(achId);

            // ── 獎勵：依獎狀種類查表發放積分與文錢（比例維持 100 積分 = 1 文錢）──
            const reward = this.getRewardForAchId(achId);
            const scoreReward = reward.score;
            const silverReward = reward.silver;

            data.totalScore += scoreReward;

            // 修正：使用 ScoreManager 統一的階級計算方法

            if (window.ScoreManager) {

                data.globalRank = window.ScoreManager.getCurrentRank(data.totalScore);

            }

            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));



            // 同步至雲端環境 (如果 Supabase 已初始化)

            if (window.SupabaseClient) {

                window.SupabaseClient.saveGameToCloud(data);

            }

            // ── 給予銀兩：寫入江南小院收集系統存檔 ──
            if (window.FMCollectionSave) {
                try {
                    const collData = window.FMCollectionSave.load();
                    // 走統一收口，順帶留下雲端流水帳（source='cert'）供遊戲日曆統計
                    window.FMCollectionSave.addSilver(collData, silverReward, 'cert', achId);
                    window.FMCollectionSave.save(collData);
                    // 若收集系統畫面正開著，即時刷新 HUD 上的銀兩數字
                    if (window.Collection && typeof window.Collection.refreshHud === 'function') {
                        window.Collection.refreshHud();
                    }
                } catch (e) {
                    console.warn('[Achievement] 發放銀兩失敗:', e);
                }
            }

            this.renderData();

            // 領完後自動捲到「下一個」領取獎狀按鈕；若全數領完則捲回頂端。
            // 用小延遲等 renderData 的 DOM 更新完成。
            setTimeout(() => this.scrollToFirstPending(), 120);

            this.showCert(imgUrl, text, true, scoreReward, silverReward);

        },



        /**
         * 一鍵領取所有待領獎狀。
         *
         * 與 claimAchievementReward 的差別只在「批次」二字，規則完全相同：
         * 同一組 getRewardForAchId 查表、同一個 achievements.claimed 冪等旗標、
         * 同樣的 100 積分 = 1 文錢比例。刻意**不**呼叫 claimAchievementReward
         * N 次，理由有三：
         *   ① 那會寫 N 次 localStorage、排 N 次雲端同步、跑 N 次 renderData，
         *      獎狀累積到數十張時整個面板會卡住數秒。
         *   ② 那會連續彈出 N 次獎狀動畫（每次三秒），玩家得一直點關閉。
         *   ③ silver_events 會多出 N 筆流水帳；批次領取在帳上本來就該是一筆。
         * 因此這裡改成「先全部算完，再一次寫檔、一次動畫」。
         *
         * ⚠️ 待領清單一律取自剛剛 renderData 產生的 DOM（.claim-pending 的
         *    dataset.achId），不自行重算門檻 —— 重算就是把判定規則抄成第二份。
         * ⚠️ 文位獎狀（rank_*）永遠不會出現在這個清單裡（成就殿堂的文位區塊
         *    只給「查看獎狀」），但這裡仍照 claimAchievementReward 的做法擋一次：
         *    誤寫 rank_* 會讓 grantPromotionSilver 的冪等旗標提前成立，
         *    玩家真正晉升時那筆文錢就永遠領不到，且沒有任何錯誤訊息。
         */
        claimAllAchievementRewards: function () {

            if (!this.overlay || !window.ScoreManager) return;

            const btns = this.overlay.querySelectorAll(
                '#achBadgesContainer .ach-btn-claim.claim-pending');

            const ids = [];
            btns.forEach(b => {
                const id = b.dataset.achId;
                if (!id) return;
                if (id.indexOf('rank_') === 0) {
                    console.warn('[成就] 文位獎狀不經手動領取，批次領取已略過：', id);
                    return;
                }
                ids.push(id);
            });

            if (ids.length === 0) return;

            if (window.SoundManager) window.SoundManager.playJoyfulTriple();

            const data = window.ScoreManager.loadPlayerData();
            if (!data.achievements.claimed) data.achievements.claimed = [];

            let totalScore = 0, totalSilver = 0, claimedCount = 0;

            ids.forEach(achId => {
                if (data.achievements.claimed.includes(achId)) return;   // 冪等：已領過就跳過
                data.achievements.claimed.push(achId);
                const reward = this.getRewardForAchId(achId);
                totalScore += reward.score || 0;
                totalSilver += reward.silver || 0;
                claimedCount++;
            });

            if (claimedCount === 0) return;

            data.totalScore += totalScore;

            // 積分階級（僅排行榜統計用，與文位無關）同步刷新
            if (window.ScoreManager) {
                data.globalRank = window.ScoreManager.getCurrentRank(data.totalScore);
            }

            localStorage.setItem('flowerMoon_playerData', JSON.stringify(data));

            if (window.SupabaseClient) {
                window.SupabaseClient.saveGameToCloud(data);
            }

            // ── 給予文錢：整批只寫一筆流水帳（note 記下實際張數以利對帳）──
            if (window.FMCollectionSave && totalSilver > 0) {
                try {
                    const collData = window.FMCollectionSave.load();
                    window.FMCollectionSave.addSilver(
                        collData, totalSilver, 'cert', 'claim_all x' + claimedCount);
                    window.FMCollectionSave.save(collData);
                    if (window.Collection && typeof window.Collection.refreshHud === 'function') {
                        window.Collection.refreshHud();
                    }
                } catch (e) {
                    console.warn('[Achievement] 批次發放文錢失敗:', e);
                }
            }

            this.renderData();

            // 全數領完後 scrollToFirstPending 會找不到待領項目，自動捲回頂端
            setTimeout(() => this.scrollToFirstPending(), 120);

            // 表演：沿用原有的獎狀動畫（星星 + 數字跑動），只換成一併領取的說明文字。
            // 底圖固定用最高階的「聖旨獎狀」，與逐張領取時依序輪替的九品～一品區隔開來。
            const certImg = this.certImages[this.certImages.length - 1];
            const text = `恭賀\n一併領受獎狀 ${claimedCount} 張。\n` +
                `積學儲寶，酌理富才。歷年功課，今日並敘於此。\n願君再接再厲，長保筆耕不輟。`;

            this.showCert(certImg, text, true, totalScore, totalSilver);

        },



        show: function () {

            this.init();

            // 開啟前關掉其他三個對話框（群英榜、江南小院、名人列傳）
            try {
                if (window.LeaderboardDialog && window.LeaderboardDialog.overlay &&
                    !window.LeaderboardDialog.overlay.classList.contains('hidden')) {
                    window.LeaderboardDialog.hide();
                }
                if (window.CollectionDialog && window.CollectionDialog.overlay &&
                    !window.CollectionDialog.overlay.classList.contains('hidden')) {
                    window.CollectionDialog.hide();
                }
                const ab = document.getElementById('authorBioPage');
                if (window.AuthorBio && ab && !ab.classList.contains('hidden')) {
                    window.AuthorBio.hide();
                }
            } catch (e) { /* ignore */ }

            this.renderData();

            const tabs = this.overlay.querySelectorAll('.ach-tab');

            if (tabs.length > 0) tabs[0].click();

            this.overlay.classList.remove('hidden');

            document.body.classList.add('overlay-active');

            /* updateResponsiveLayout replaced by registerOverlayResize */

        },



        hide: function () {

            if (!this.overlay) return;

            this.overlay.classList.add('hidden');

            document.body.classList.remove('overlay-active');

        }

    };



    // 測試專用：檢視晉升慶祝動畫的兩種規模（企劃書 §5）
    //   Alt + W        → 文位晉升：獎狀圖片＋星星特效（華麗版）
    //   Alt + Shift + W → 小站晉升：只有星星特效、不掛獎狀圖（簡易版）
    // ⚠️ 純表演，不發放任何文錢、不寫入任何存檔。
    document.addEventListener('keydown', (e) => {

        if (e.altKey && (e.key === 'w' || e.key === 'W')) {

            e.preventDefault();

            const LP = window.LearningPath;

            if (!LP || typeof LP.playPromotionCelebration !== 'function') {

                console.warn('[測試] LearningPath 尚未載入，無法預覽晉升動畫');

                return;

            }

            const isGrade = e.shiftKey;

            const station = isGrade

                ? { type: 'grade', name: '書僮二階', isExam: false }

                : { type: 'rank', name: '蒙童', isExam: false };

            LP.playPromotionCelebration(station, isGrade ? 300 : 900, () => {

                console.log('測試用晉升動畫表演完畢（' + (isGrade ? '小站簡易版' : '文位華麗版') + '）');

            });

        }

    });



    window.AchievementDialog = AchievementDialog;

})();

