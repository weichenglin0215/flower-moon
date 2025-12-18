# GitHub Pages 發佈指南

恭喜您完成了「花月 Flower Moon」日曆應用程式的開發！接下來，我們將透過 GitHub Pages 將其發佈到網路上，讓所有人都能使用。

由於您的專案目前位於本地端，我們需要先將其上傳到 GitHub。

## 步驟 1: 建立 GitHub Repository (儲存庫)

1.  登入您的 [GitHub](https://github.com/) 帳號。
2.  點擊右上角的 **+** 號，選擇 **New repository**。
3.  **Repository name**: 輸入 `flower-moon` (或您喜歡的名字)。
4.  **Public/Private**: 選擇 **Public** (GitHub Pages 免費版需公開，若您有 Pro 帳號可選 Private)。
5.  勾選 **Add a README file** (這會讓初始化更簡單)。
6.  點擊 **Create repository**。

## 步驟 2: 初始化本地 Git 並上傳

請打開您的終端機 (Terminal) 或 PowerShell，並執行以下指令：

```powershell
# 1. 進入專案資料夾
cd "c:\3D_prj\VS_2022_prj\FlowerMoon_web"

# 2. 初始化 Git
git init

# 3. 將所有檔案加入追蹤
git add .

# 4. 提交第一次變更
git commit -m "Initial commit - Flower Moon App"

# 5. 連結到您剛剛建立的 GitHub Repository
# 請將下面網址中的 [YOUR_USERNAME] 換成您的 GitHub 帳號
git remote add origin https://github.com/[YOUR_USERNAME]/flower-moon.git

# 6. 將程式碼推送到 GitHub
# 如果是第一次推送，可能會跳出視窗要求您登入 GitHub
git branch -M main
git push -u origin main --force
```

> **注意**：如果上述 `push` 指令失敗（因為線上已經有 README），請改用：
> `git push -u origin main --force`

## 步驟 3: 開啟 GitHub Pages

1.  回到您的 GitHub Repository 網頁。
2.  點擊上方的 **Settings** (設定) 分頁。
3.  在左側選單中找到並點擊 **Pages**。
4.  在 **Build and deployment** > **Source** 區塊：
    *   選擇 **Deploy from a branch**。
5.  在 **Branch** 區塊：
    *   選擇 **main** 分支。
    *   資料夾選擇 **/(root)**。
    *   點擊 **Save**。

## 步驟 4: 完成！

等待約 1-2 分鐘後，重新整理 Pages 設定頁面，您會看到頂端出現一行綠色訊息：

> **Your site is live at...**

點擊該連結，您的「花月日曆」就正式上線了！您可以將這個連結分享給朋友，在手機上操作體驗會特別好。

---

## 未來更新

之後如果您修改了程式碼（例如新增了功能），只需執行以下指令即可更新網站：

```powershell
git add .
git commit -m "Update descriptions"
git push
```

GitHub Pages 會自動偵測到新的推送並重新部署。
