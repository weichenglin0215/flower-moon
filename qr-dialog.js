/**
 * QR Code 分享對話框
 * 顯示「花月」遊戲網址的 QR Code，並提供系統分享功能。
 * 版面遵循 500×850 舞台比例規範 (screen_adaptive.js)。
 */

(function () {
    'use strict';

    const SHARE_URL = 'https://weichenglin0215.github.io/flower-moon/index.html';
    const SHARE_TITLE = '花月・唐詩宋詞遊戲';
    const SHARE_TEXT = '推薦給你一個有趣的唐詩宋詞遊戲，快來一起玩！';
    const QR_LIB_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    const QR_SIZE = 400;   // 80% of 500px stage width

    // 標準 iOS / Android 分享圖示 SVG（方框 + 向上箭頭）
    const SHARE_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"
        style="vertical-align:middle;margin-right:5px;">
        <polyline points="16 6 12 2 8 6"/>
        <line x1="12" y1="2" x2="12" y2="15"/>
        <path d="M4 14v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/>
    </svg>`;

    const QRDialog = {
        overlay: null,
        _qrGenerated: false,

        // ──────────────────────────────────────
        // 公開介面
        // ──────────────────────────────────────
        show: function () {
            if (!this.overlay) this._build();
            this.overlay.style.display = 'flex';
            document.body.classList.add('overlay-active');
            if (!this._qrGenerated) this._renderQR();
        },

        hide: function () {
            if (!this.overlay) return;
            this.overlay.style.display = 'none';
            document.body.classList.remove('overlay-active');
        },

        // ──────────────────────────────────────
        // 建立 DOM（只執行一次）
        // ──────────────────────────────────────
        _build: function () {

            /* ── 遮罩：遵循 500×850 舞台規範 ── */
            const overlay = document.createElement('div');
            overlay.id = 'qrDialogOverlay';
            overlay.style.cssText = [
                'position:absolute',
                'width:500px',
                'height:850px',
                'background:hsl(0, 60%, 24%)',
                'z-index:40000',
                'display:flex',
                'flex-direction:column',
                'align-items:center',
                'justify-content:center',
                'gap:0'
            ].join(';');

            /* 跟隨舞台縮放 */
            if (window.registerOverlayResize) {
                window.registerOverlayResize((r) => {
                    overlay.style.left = r.left + 'px';
                    overlay.style.top = r.top + 'px';
                    overlay.style.transform = 'scale(' + r.scale + ')';
                    overlay.style.transformOrigin = 'top left';
                });
            }

            /* ── 右上角「分享」按鈕（在 500px 邏輯空間內定位） ── */
            const shareBtn = document.createElement('button');
            shareBtn.innerHTML = SHARE_ICON_SVG + '分享';
            shareBtn.style.cssText = [
                'position:absolute',
                'top:18px',
                'right:18px',
                'padding:10px 18px',
                'font-size:19px',
                'font-family:"Noto Serif TC",serif',
                'font-weight:bold',
                'background:hsl(42, 38%, 86%)',
                'color:hsl(0, 60%, 24%)',
                'border:none',
                'border-radius:12px',
                'cursor:pointer',
                'display:flex',
                'align-items:center',
                'box-shadow:0 4px 12px rgba(0,0,0,0.45)',
                'transition:opacity 0.15s'
            ].join(';');
            shareBtn.addEventListener('mouseover', () => { shareBtn.style.opacity = '0.8'; });
            shareBtn.addEventListener('mouseout', () => { shareBtn.style.opacity = '1'; });

            /* ── 白色卡片 ── */
            const card = document.createElement('div');
            card.style.cssText = [
                'background:hsl(42, 38%, 86%)',
                'border-radius:18px',
                'padding:20px 20px 14px',
                'box-shadow:0 10px 50px rgba(0,0,0,0.75)',
                'display:flex',
                'flex-direction:column',
                'align-items:center',
                'gap:14px'
            ].join(';');

            /* 標題 */
            const titleEl = document.createElement('div');
            titleEl.textContent = SHARE_TITLE;
            titleEl.style.cssText = [
                'font-family:"Noto Serif TC",serif',
                'font-size:22px',
                'font-weight:bold',
                'color:#333',
                'letter-spacing:3px'
            ].join(';');

            /* QR Code 容器（qrcodejs 會在此 div 內插入 canvas/img） */
            const qrWrap = document.createElement('div');
            qrWrap.id = 'qrDialogWrap';
            // 指定無效，宣紙顏色背景：hsl(42, 38%, 86%) + 暗紅色圖案hsl(0, 60%, 24%)
            //qrWrap.style.cssText = `width:${QR_SIZE}px;height:${QR_SIZE}px;background-color:hsl(42, 38%, 86%);color:hsl(0, 60%, 24%);`;
            qrWrap.style.cssText = `width:${QR_SIZE}px;height:${QR_SIZE}px;`;

            /* 網址文字 */
            const urlEl = document.createElement('div');
            urlEl.textContent = SHARE_URL;
            urlEl.style.cssText = [
                'font-size:13px',
                'color:#666',
                'word-break:break-all',
                'text-align:center',
                `max-width:${QR_SIZE}px`
            ].join(';');

            card.appendChild(titleEl);
            card.appendChild(qrWrap);
            card.appendChild(urlEl);

            /* 底部提示 */
            const hintEl = document.createElement('div');
            hintEl.textContent = '點擊任意處關閉';
            hintEl.style.cssText = [
                'font-family:"Noto Serif TC",serif',
                'font-size:18px',
                'color:rgba(255,255,255,0.6)',
                'margin-top:18px',
                'pointer-events:none'
            ].join(';');

            overlay.appendChild(shareBtn);
            overlay.appendChild(card);
            overlay.appendChild(hintEl);
            document.body.appendChild(overlay);
            this.overlay = overlay;

            /* ── 事件 ── */
            /* 點擊任意處關閉（分享按鈕除外） */
            overlay.addEventListener('click', () => {
                if (window.SoundManager) window.SoundManager.playCloseItem();
                this.hide();
            });
            /* 分享按鈕：不觸發關閉 */
            shareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._share(shareBtn);
            });
        },

        // ──────────────────────────────────────
        // 載入 qrcodejs 並產生 QR Code
        // ──────────────────────────────────────
        _loadLib: function (cb) {
            if (window.QRCode) { cb(); return; }
            const s = document.createElement('script');
            s.src = QR_LIB_SRC;
            s.onload = cb;
            s.onerror = () => console.error('[QRDialog] qrcodejs 載入失敗');
            document.head.appendChild(s);
        },

        _renderQR: function () {
            this._loadLib(() => {
                const wrap = document.getElementById('qrDialogWrap');
                if (!wrap || !window.QRCode) return;
                wrap.innerHTML = '';   // 清空（防止重複呼叫）
                new window.QRCode(wrap, {
                    text: SHARE_URL,
                    width: QR_SIZE,
                    height: QR_SIZE,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: window.QRCode.CorrectLevel.H
                });
                this._qrGenerated = true;
            });
        },

        // ──────────────────────────────────────
        // 系統分享 / 複製連結備援
        // ──────────────────────────────────────
        _share: function (btn) {
            if (window.SoundManager) window.SoundManager.playConfirmItem();

            if (navigator.share) {
                navigator.share({
                    title: SHARE_TITLE,
                    text: SHARE_TEXT,
                    url: SHARE_URL
                }).catch(() => { });
                return;
            }

            /* 備援：複製連結 */
            const orig = btn.innerHTML;
            const markCopied = () => {
                btn.textContent = '✓ 已複製連結';
                setTimeout(() => { btn.innerHTML = orig; }, 2500);
            };
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(SHARE_URL).then(markCopied);
            } else {
                const ta = document.createElement('textarea');
                ta.value = SHARE_URL;
                ta.style.cssText = 'position:fixed;left:-9999px';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (_) { }
                document.body.removeChild(ta);
                markCopied();
            }
        }
    };

    window.QRDialog = QRDialog;

})();
