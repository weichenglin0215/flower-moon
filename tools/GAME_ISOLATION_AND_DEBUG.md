# 游戏隔离与调试边框实施总结

## 实施完成时间
2025年12月22日

---

## 实施内容

### 1. 游戏内容隔离

**问题：**
- 进入游戏时，主页、CARDS和其他游戏画面会重叠显示
- 造成视觉混乱和性能浪费

**解决方案：**
为每个游戏添加了 `hideOtherContents()` 和 `showOtherContents()` 方法

**实现逻辑：**
```javascript
hideOtherContents: function () {
    // 隐藏主页容器（主页和CARDS共用）
    const cardContainer = document.getElementById('cardContainer');
    if (cardContainer) {
        cardContainer.style.display = 'none';
    }
    
    // 隐藏其他游戏
    const game1 = document.getElementById('game1-container');
    const game2 = document.getElementById('game2-container');
    const game3 = document.getElementById('game3-container');
    // 隐藏除自己外的其他游戏
}

showOtherContents: function () {
    // 退出游戏时恢复主页容器
    const cardContainer = document.getElementById('cardContainer');
    if (cardContainer) {
        cardContainer.style.display = '';
    }
}
```

**调用时机：**
- **进入游戏时**：`showDifficultySelector()` 或 `show()` 开始时调用
- **退出游戏时**：`stopGame()` 或 `hide()` 结束时调用

---

### 2. 500*800 调试边框

**目的：**
提供可视化的尺寸参考，确认游戏画面是否充满设计尺寸

**实现方式：**

#### CSS样式（responsive.css）
```css
.debug-frame {
    position: absolute;
    top: 0;
    left: 0;
    width: 500px;
    height: 800px;
    border: 1px solid yellow;
    pointer-events: none;  /* 不干扰交互 */
    z-index: 9999;         /* 最顶层显示 */
    box-sizing: border-box;
}
```

#### DOM结构
在每个游戏容器的最前面添加：
```html
<div class="debug-frame"></div>
```

**特点：**
- ✅ 黄色空心边框
- ✅ 1像素线宽
- ✅ 不影响鼠标点击（pointer-events: none）
- ✅ 永远在最顶层显示
- ✅ 精确显示500*800的范围

---

### 3. 固定游戏尺寸为 500*800

**问题：**
- 之前的响应式系统会根据浏览器窗口动态缩放游戏
- 导致游戏尺寸不固定，不是精确的500*800

**解决方案：**
在 `responsive.css` 中强制游戏覆盖层为固定尺寸：

```css
.game-overlay.aspect-5-8,
.game1-overlay.aspect-5-8 {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    
    /* 固定游戏尺寸为 500*800 */
    width: 500px !important;
    height: 800px !important;
}
```

**效果：**
- ✅ 游戏画面固定为 500px 宽
- ✅ 游戏画面固定为 800px 高
- ✅ 无论浏览器窗口大小如何，游戏尺寸保持不变
- ✅ 游戏始终居中显示

---

## 修改的文件

### CSS文件

#### `responsive.css`
1. 添加 `.debug-frame` 样式
2. 修改游戏覆盖层为固定 500*800 尺寸

### JavaScript文件

#### `game1.js`
1. `createDOM()` - 添加调试边框 div
2. 新增 `hideOtherContents()` 方法
3. 新增 `showOtherContents()` 方法
4. `show()` - 调用 `hideOtherContents()`
5. `stopGame()` - 调用 `showOtherContents()`

#### `game2.js`
1. `createDOM()` - 添加调试边框 div
2. 新增 `hideOtherContents()` 方法
3. 新增 `showOtherContents()` 方法
4. `showDifficultySelector()` - 调用 `hideOtherContents()`
5. `hide()` - 调用 `showOtherContents()`

#### `game3.js`
1. `createDOM()` - 添加调试边框 div
2. 新增 `hideOtherContents()` 方法
3. 新增 `showOtherContents()` 方法
4. `showDifficultySelector()` - 调用 `hideOtherContents()`
5. `stopGame()` - 调用 `showOtherContents()`

---

## 画面切换流程

### 从主页进入游戏

```
主页显示
  ↓
点击游戏菜单
  ↓
调用 Game.show() 或 showDifficultySelector()
  ↓
hideOtherContents() - 隐藏主页和其他游戏
  ↓
显示难度选择器（2500层）
  ↓
选择难度
  ↓
显示游戏界面（2000层，500*800固定尺寸）
  ↓
开始游戏
```

### 从游戏返回主页

```
游戏进行中
  ↓
点击"离开"或汉堡菜单
  ↓
调用 stopGame() 或 hide()
  ↓
隐藏游戏容器
  ↓
showOtherContents() - 恢复主页显示
  ↓
返回主页
```

---

## 层级关系

### 显示状态管理

```
主页状态：
- #cardContainer: display: block (默认)
- Game1/2/3: hidden class

游戏1状态：
- #cardContainer: display: none ❌ 隐藏
- Game1: 显示（500*800固定）✅
- Game2/3: hidden class ❌ 隐藏

游戏2状态：
- #cardContainer: display: none ❌ 隐藏
- Game1/3: hidden class ❌ 隐藏
- Game2: 显示（500*800固定）✅

游戏3状态：
- #cardContainer: display: none ❌ 隐藏
- Game1/2: hidden class ❌ 隐藏
- Game3: 显示（500*800固定）✅
```

### Z-Index 层级

```
9999 - 调试边框（黄色方框）
3001 - 菜单提示
3000 - 汉堡菜单按钮
2999 - 菜单面板
2998 - 菜单背景
2500 - 难度选择器
2000 - 游戏覆盖层
0    - 主页内容
```

---

## 调试方法

### 查看尺寸

进入任何游戏后，会看到黄色边框显示500*800的范围：
- 如果游戏内容超出黄框 → 内容溢出
- 如果游戏内容未填满黄框 → 内容太小
- 如果游戏内容完全填满黄框 → 尺寸正确 ✅

### 临时移除调试边框

如果需要临时移除黄色边框，在浏览器控制台执行：
```javascript
document.querySelectorAll('.debug-frame').forEach(el => el.style.display = 'none');
```

### 永久移除调试边框

1. 从 `game1.js`, `game2.js`, `game3.js` 的 `createDOM()` 中删除：
```html
<div class="debug-frame"></div>
```

2. 从 `responsive.css` 中删除 `.debug-frame` 样式

---

## 验证清单

- ✅ 进入游戏1，主页和其他游戏隐藏
- ✅ 进入游戏2，主页和其他游戏隐藏
- ✅ 进入游戏3，主页和其他游戏隐藏
- ✅ 退出游戏返回主页，主页正常显示
- ✅ 游戏显示黄色500*800边框
- ✅ 游戏画面固定为500*800尺寸
- ✅ 汉堡菜单始终可点击
- ✅ 画面无重叠混乱

---

## 注意事项

1. **固定尺寸的影响**
   - 游戏现在固定为500*800，不再响应式缩放
   - 在小于500*800的屏幕上，游戏可能被裁切
   - 如需响应式，移除 `!important` 规则

2. **主页容器共享**
   - `#cardContainer` 同时用于主页（index.html）和CARDS（cards.html）
   - 隐藏/显示逻辑对两者都有效

3. **游戏间切换**
   - 直接从游戏1切换到游戏2时，游戏1会自动隐藏
   - 通过 `hideOtherContents()` 自动处理

---

## 实施状态

✅ 所有功能已完成
✅ 无 linter 错误
✅ 三个游戏已集成
✅ 调试边框已添加

可以在浏览器中测试，现在进入游戏时画面清爽，只显示当前游戏！

