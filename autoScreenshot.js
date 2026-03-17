/**
 * autoScreenshot.js — 自動截圖模組 (螢幕擷取版本)
 * 以 ALT+C 觸發，讀取「auto_screenshot.txt」設定，
 * 透過瀏覽器 Screen Capture API 擷取分頁畫面。
 */

(function () {
    'use strict';

    let isRunning = false;
    let dirHandle = null;
    let captureStream = null;

    document.addEventListener('keydown', async function (e) {
        // 支援 ALT+C
        const isTargetKey = e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S' || e.code === 'KeyC' || e.code === 'KeyS';
        if (e.altKey && isTargetKey) {
            e.preventDefault();
            if (isRunning) return;
            await startAutoScreenshot();
        }
    });

    async function startAutoScreenshot() {
        isRunning = true;
        showToast('⏳ 自動截圖啟動中...', 1500);

        try {
            // 1. 讀取設定檔
            const config = await loadConfig();
            if (!config) { isRunning = false; return; }

            if (!window.CalendarController) {
                showToast('❌ CalendarController 未就緒', 3000);
                isRunning = false;
                return;
            }

            // 2. 選擇儲存目錄
            if (!dirHandle) {
                showToast('📂 請選擇圖片儲存目錄...');
                try {
                    dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                } catch (err) {
                    showToast('❌ 未選擇目錄', 3000);
                    isRunning = false;
                    return;
                }
            }

            // 3. 請求分頁擷取權限
            showToast('🖥️ 請選擇「此分頁 (This Tab)」頁籤中的「花月」並按「分享」...', 5000);
            try {
                captureStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        displaySurface: 'browser',
                        // 強制要求最高畫質傳輸
                        // width: { ideal: 3840, max: 7680 }, 
                        // height: { ideal: 2160, max: 4320 },
                        //4K畫質輸出
                        // width: { ideal: 3840, max: 7680 },
                        // height: { ideal: 2160, max: 4320 },
                        //HD畫質輸出
                        width: { ideal: 1920, max: 7680 },
                        height: { ideal: 1080, max: 4320 },
                        frameRate: { ideal: 60 }
                    },
                    audio: false,
                    preferCurrentTab: true,
                    selfBrowserSurface: 'include',
                    systemAudio: 'exclude'
                });
            } catch (err) {
                showToast('❌ 未授權螢幕擷取', 3000);
                isRunning = false;
                return;
            }

            // 檢查實際抓到的解析度 (偵錯用)
            const settings = captureStream.getVideoTracks()[0].getSettings();
            console.log(`[AutoScreenshot] 串流解析度: ${settings.width}x${settings.height}`);

            hideToast();
            await delay(100);

            const video = document.createElement('video');
            video.srcObject = captureStream;
            // 關鍵：確保影片不被縮放
            video.style.width = settings.width + 'px';
            video.style.height = settings.height + 'px';
            video.play();

            await delay(1000);

            ensureCalendarVisible();
            const targetEl = document.getElementById('calendarCardContainer');

            const originalTitle = document.title;
            let currentDateStr = config.startDate;
            let saved = 0;

            for (let i = 0; i < config.count; i++) {
                document.title = `📸 (${i + 1}/${config.count}) - ${currentDateStr}`;
                window.CalendarController.jumpToDate(currentDateStr);
                await delay(600);

                const blob = await captureFrameFromVideo(video, targetEl);
                if (blob) {
                    const filename = buildFilename(config.filenamePattern, currentDateStr);
                    await saveBlob(dirHandle, filename, blob);
                    saved++;
                }
                currentDateStr = addOneDay(currentDateStr);
            }

            document.title = originalTitle;
            showToast(`✅ 完成！共存入 ${saved} 張圖片`, 4000);

        } catch (err) {
            console.error('[AutoScreenshot] 錯誤：', err);
            showToast(`❌ 失敗：${err.message}`, 4000);
        } finally {
            if (captureStream) {
                captureStream.getTracks().forEach(track => track.stop());
                captureStream = null;
            }
            isRunning = false;
        }
    }

    /**
     * 從 Video 串流中擷取影格並進行「精準物理裁切」
     */
    async function captureFrameFromVideo(video, targetEl) {
        const rect = targetEl.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        // 計算視窗內容與擷取串流的真實比例
        const scaleX = videoW / winW;
        const scaleY = videoH / winH;

        // 計算裁切範圍並取整，防止半像素造成的模糊
        const cropX = Math.round(rect.left * scaleX);
        const cropY = Math.round(rect.top * scaleY);
        const cropW = Math.round(rect.width * scaleX);
        const cropH = Math.round(rect.height * scaleY);

        const outCanvas = document.createElement('canvas');
        outCanvas.width = cropW;
        outCanvas.height = cropH;

        const octx = outCanvas.getContext('2d');
        // 關閉平滑過濾以維持 1:1 物理像素的銳利度
        octx.imageSmoothingEnabled = false;

        octx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // 使用 PNG 格式以確保無失真輸出 (依妳上一次的手動改動)
        return new Promise(resolve => outCanvas.toBlob(resolve, 'image/png'));
        // 使用 jpg 格式 (MIME 必須是 image/jpeg)，但是對於字體筆劃變得很粗糙有雜點
        //return new Promise(resolve => outCanvas.toBlob(resolve, 'image/jpeg', 0.90));
    }

    async function loadConfig() {
        let text;
        const configFilename = './auto_screenshot.txt';
        try {
            const resp = await fetch(configFilename + '?nocache=' + Date.now());
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            text = await resp.text();
        } catch (err) {
            console.warn('[AutoScreenshot] 無法直接讀取設定檔，請手動選取');
            showToast('📂 請選取「auto_screenshot.txt」設定檔...');
            try {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: '設定檔', accept: { 'text/plain': ['.txt'] } }],
                    multiple: false
                });
                const file = await fileHandle.getFile();
                text = await file.text();
            } catch (pickerErr) {
                showToast('❌ 無法取得設定', 4000);
                return null;
            }
        }

        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//'));
        if (lines.length < 7) {
            showToast('❌ 設定檔內容不足', 3000);
            return null;
        }

        return {
            page: lines[0],
            startDate: lines[1].replace(/-/g, ''),
            count: parseInt(lines[2], 10) || 1,
            widthPx: (lines[4].match(/(\d+)/) || [0, 570])[1] * 1,
            filenamePattern: lines[6]
        };
    }

    async function saveBlob(dir, filename, blob) {
        const fileHandle = await dir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    function buildFilename(pattern, dateStr) {
        let name = pattern.replace('$日期', dateStr);
        //jpg 檔案會變得很粗糙有雜點
        //if (!/\.jpe?g$/i.test(name)) name += '.jpg';
        if (!/\.png$/i.test(name)) name += '.png';
        return name;
    }

    function addOneDay(dateStr) {
        const y = parseInt(dateStr.slice(0, 4), 10);
        const m = parseInt(dateStr.slice(4, 6), 10) - 1;
        const d = parseInt(dateStr.slice(6, 8), 10);
        const dt = new Date(y, m, d);
        dt.setDate(dt.getDate() + 1);
        const newY = dt.getFullYear();
        const newM = String(dt.getMonth() + 1).padStart(2, '0');
        const newD = String(dt.getDate()).padStart(2, '0');
        return `${newY}${newM}${newD}`;
    }

    function ensureCalendarVisible() {
        const cal = document.getElementById('calendarCardContainer');
        if (cal) cal.style.display = '';
        ['game1-container', 'game2-container', 'game3-container', 'game4-container',
            'game5-container', 'game6-container', 'game7-container', 'game8-container',
            'game9-container', 'game10-container', 'game11-container', 'game12-container',
            'cardContainer'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
        document.body.classList.remove('overlay-active');
    }

    let toastTimer = null;
    function showToast(msg, duration = 2000) {
        let el = document.getElementById('autoshot-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'autoshot-toast';
            Object.assign(el.style, {
                position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '0.6rem 1.5rem',
                borderRadius: '2rem', fontSize: '1rem', zIndex: '99999', transition: 'none',
                pointerEvents: 'none', fontFamily: 'sans-serif'
            });
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = '1';
        el.style.display = 'block';

        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { hideToast(); }, duration);
    }

    function hideToast() {
        const el = document.getElementById('autoshot-toast');
        if (el) {
            el.style.opacity = '0';
            el.style.display = 'none';
        }
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    console.log('[AutoScreenshot] 模組 (螢幕擷取版) 已載入。');
})();
