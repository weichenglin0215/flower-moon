/**
 * 响应式布局系统 - 5:8 宽高比
 * 确保所有画面保持固定比例并自动缩放适应任何浏览器尺寸
 */

(function () {
    'use strict';

    // 目标宽高比
    const TARGET_ASPECT_RATIO = 5 / 8; // 0.625

    /**
     * 计算并应用5:8宽高比的容器尺寸
     */
    function applyAspectRatio() {
        // 获取所有需要应用响应式的容器
        const containers = document.querySelectorAll('.aspect-5-8');

        if (containers.length === 0) {
            return;
        }

        // 获取视窗尺寸
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 计算视窗的宽高比
        const windowAspectRatio = windowWidth / windowHeight;

        let containerWidth, containerHeight;

        // 根据视窗比例决定以哪个维度为基准
        if (windowAspectRatio < TARGET_ASPECT_RATIO) {
            // 視窗更窄（典型的行動裝置），以寬度為基准，高度依比例增長
            containerWidth = windowWidth;
            containerHeight = windowWidth / TARGET_ASPECT_RATIO;
        } else {
            // 視窗更寬（電腦端或橫向平版）
            // 為了不讓畫面太過「頂天立地」，我們設定最大高度為視窗的 90%
            containerHeight = windowHeight * 0.95;
            containerWidth = containerHeight * TARGET_ASPECT_RATIO;

            // 如果寬度算出來竟然超過了視窗寬度（極少見），則以寬度為準
            if (containerWidth > windowWidth * 0.95) {
                containerWidth = windowWidth * 0.95;
                containerHeight = containerWidth / TARGET_ASPECT_RATIO;
            }
        }

        // 应用到所有容器
        containers.forEach(container => {
            container.style.setProperty('--responsive-width', `${containerWidth}px`);
            container.style.setProperty('--responsive-height', `${containerHeight}px`);
        });

        // --- 字體與 UI 等比例縮放實作 ---
        // 以 iPhone 原生基準高度 640px 為 1.0 倍
        // 計算當前容器高度相對於 640px 的縮放比例
        const fontScale = containerHeight / 640;

        // 將縮放比例套用到根節點 (html) 的字體大小
        // 預設 16px * 縮放比例，這樣所有使用 rem 的單位都會跟著等比例縮放
        document.documentElement.style.fontSize = `${fontScale * 16}px`;
        // ------------------------------

        // 调试信息（可选，生产环境可移除）
        if (window.DEBUG_RESPONSIVE) {
            console.log('Responsive Layout Applied:', {
                windowSize: `${windowWidth}x${windowHeight}`,
                windowAspectRatio: windowAspectRatio.toFixed(3),
                targetAspectRatio: TARGET_ASPECT_RATIO.toFixed(3),
                containerSize: `${containerWidth.toFixed(0)}x${containerHeight.toFixed(0)}`,
                basedOn: windowAspectRatio < TARGET_ASPECT_RATIO ? 'width' : 'height'
            });
        }
    }

    /**
     * 防抖函数 - 避免resize时频繁触发
     */
    function debounce(func, wait = 100) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 初始化响应式系统
     */
    function initResponsive() {
        // 立即应用一次
        applyAspectRatio();

        // 监听窗口大小变化（使用防抖）
        window.addEventListener('resize', debounce(applyAspectRatio, 100));

        // 监听方向变化（移动设备）
        window.addEventListener('orientationchange', () => {
            // 方向变化后稍微延迟，等待浏览器完成布局调整
            setTimeout(applyAspectRatio, 200);
        });
    }

    /**
     * 为动态创建的元素应用响应式
     * 供外部调用，例如游戏覆盖层显示时
     */
    window.updateResponsiveLayout = function () {
        applyAspectRatio();
    };

    // DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initResponsive);
    } else {
        // DOM已经加载完成
        initResponsive();
    }

    // 使用 MutationObserver 监听DOM变化（当新的 aspect-5-8 元素被添加时）
    const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;

        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // 元素节点
                        if (node.classList && node.classList.contains('aspect-5-8')) {
                            shouldUpdate = true;
                        }
                        // 检查子元素
                        const children = node.querySelectorAll && node.querySelectorAll('.aspect-5-8');
                        if (children && children.length > 0) {
                            shouldUpdate = true;
                        }
                    }
                });
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (mutation.target.classList.contains('aspect-5-8')) {
                    shouldUpdate = true;
                }
            }
        });

        if (shouldUpdate) {
            applyAspectRatio();
        }
    });

    // 开始观察
    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
    });

})();

