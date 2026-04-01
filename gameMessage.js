/**
 * 遊戲訊息視窗組件 (GameMessage)
 * 統一處理所有遊戲的勝利與失敗結算視窗。
 */
const GameMessage = {
    // 勝利與失敗的隨機情緒文字
    victoryPhrases: [
        "春風得意馬蹄疾",
        "會當凌絕頂",
        "白日放歌須縱酒",
        "十年磨一劍",
        "贏得生前身後名",
        "飛流直下三千尺"
    ],
    defeatPhrases: [
        "東風不與周郎便",
        "捲土重來未可知",
        "長風破浪會有時",
        "柳暗花明又一村",
        "我輩豈是蓬蒿人",
        "莫道桑榆晚"
    ],

    container: null,

    /**
     * 顯示訊息視窗
     * @param {Object} options 
     * @param {boolean} options.isWin - 是否勝利
     * @param {number} options.score - 得分 (僅勝利時顯示)
     * @param {string} options.reason - 失敗原因 (如 "失誤過多", "超出時限")
     * @param {string} options.customH2 - 自定義主題文字 (可選)
     * @param {string} options.btnText - 按鈕文字 (如 "下一關", "再試一次")
     * @param {Function} options.onConfirm - 點擊按鈕後的回調函數
     */
    show: function (options) {
        this.initDOM();

        const { isWin, score, reason, customH2, btnText, onConfirm } = options;

        // 1. 決定標題文字 (h2)
        let titleText = customH2;
        if (!titleText) {
            const list = isWin ? this.victoryPhrases : this.defeatPhrases;
            titleText = list[Math.floor(Math.random() * list.length)];
        }

        // 2. 決定副標題文字 (p)
        let contentText = "";
        if (isWin) {
            // 勝利時，副標題只顯示得分，不顯示情緒文字
            contentText = `，得分 ${score}。`;
        } else {
            if (reason) {
                // 失敗時，副標題顯示失敗原因
                contentText = `，${reason}`;
            }
        }

        // 3. 更新 DOM 內容
        const h2 = this.container.querySelector('h2');
        const p = this.container.querySelector('p');
        const extra = this.container.querySelector('.extra-content');
        const btn = this.container.querySelector('.nav-btn');

        h2.textContent = titleText;
        p.textContent = contentText;
        btn.textContent = btnText || (isWin ? "下一局" : "再試一次");

        // 處理額外內容 (如 Game 3 的詩詞全文)
        if (options.customContent) {
            extra.innerHTML = options.customContent;
            extra.classList.remove('hidden');
            this.container.classList.add('has-extra');
        } else {
            extra.innerHTML = '';
            extra.classList.add('hidden');
            this.container.classList.remove('has-extra');
        }

        // 設定標題顏色
        h2.style.color = isWin ? "hsl(145, 68%, 36%)" : "hsl(0, 68%, 36%)";

        // 4. 綁定按鈕點擊事件
        btn.onclick = () => {
            if (window.SoundManager) window.SoundManager.playConfirmItem();
            this.hide();
            if (onConfirm) onConfirm();
        };

        // 5. 顯示視窗
        this.container.classList.remove('hidden');
    },

    /**
     * 隱藏訊息視窗
     */
    hide: function () {
        if (this.container) {
            this.container.classList.add('hidden');
        }
    },

    /**
     * 初始化 DOM 結構 (若不存在則建立)
     */
    initDOM: function () {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'common-game-message';
            this.container.className = 'common-game-message aspect-5-8 hidden';
            this.container.innerHTML = `
                <div class="msg-header-line">
                    <h2></h2>
                    <p></p>
                </div>
                <div class="extra-content hidden"></div>
                <button class="nav-btn"></button>
            `;
            document.body.appendChild(this.container);
        }
    }
};

// 掛載到 window 全域對象
window.GameMessage = GameMessage;
