# 資產槓桿現金流

「投資資產 × 股票質押 × 現金流 × 被動收入」模擬 APP。這是一套手機優先、離線優先的個人投資資產負債表，讓使用者先建立股票與現金基準線，再逐步加入質押、槓桿風控與現金流規劃。

## V0.1 已完成

- React + TypeScript + Vite
- PWA manifest、Service Worker 與 SVG APP icon
- 手機 Bottom Navigation、桌面 Sidebar、Responsive UI
- IndexedDB 本機資料庫與 schema version 預留
- 0050、00878 與 NT$1,000,000 Demo 資料（可清除）
- 股票與現金資產新增、編輯、刪除
- 總資產、淨資產、股票市值、現金、未實現損益與月股息預估
- Light / Dark / System 顯示模式
- 財務公式獨立於 UI，並有 Vitest 單元測試
- GitHub Actions 型別檢查、測試與 GitHub Pages 部署設定

V0.1 的基線不把借款當成已存在的資產；V0.2 已加入實際借款與維持率管理，V0.3 再加入不寫入資料庫的借款再投入試算。這能確保「總資產」與「淨資產」不被借款誤算混淆。

## V0.2 已完成

- 質押借款新增、編輯、刪除與 IndexedDB bundle 儲存
- 借款本金、餘額、年利率、還款方式、借款日與到期日
- 股票擔保品複選、質押股數與擔保品市值預覽
- 每月利息估算、維持率、警戒線、追繳線與距離門檻
- 首頁資產健康度與質押風控總覽接上真實借款資料
- 安全 / 警戒 / 追繳風險狀態與手機版表單檢查

V0.2 仍是手動輸入的模擬工具，不代表任何金融機構的正式授信、維持率或追繳通知。壓力測試與現金流項目會在後續版本加入。

## V0.3 已完成

- 借款金額 Slider 與數字輸入、年利率、借款期間與還款方式
- 模擬擔保品選擇與質押股數調整
- 借款投入指定股票、投入比例、可買股數與新增股票市值
- 新增年度股息、年度 / 月利息、模擬後現金與月淨現金流
- Before / After 比較總資產、總負債、淨資產、負債比與資產槓桿
- 模擬方案只在畫面暫存，不會改動 IndexedDB 的實際借款資料

V0.3 仍以起始價格的靜態試算為主；市場下跌壓力測試排在 V0.4。

## 技術架構

```text
src/
├── domain/       # 財務資料模型與純計算服務
├── data/         # IndexedDB schema、Demo seed、repository
├── components/   # App shell、導覽、共用 UI
├── pages/        # Dashboard、資產、設定與版本邊界頁
├── shared/       # ID 與金額 / 百分比格式化
└── test/         # 測試環境設定
```

所有資產資料只寫入瀏覽器 IndexedDB；目前沒有後端、登入、Analytics、即時行情 API 或 Console 財務資料輸出。未來若要加入 Capacitor，domain 與 data contract 可繼續沿用。

## 本機執行

需要 Node.js 20 以上。

Windows 使用者可以直接雙擊專案根目錄的 `啟動APP.bat`；它會啟動本機 Vite server 並開啟瀏覽器。

```bash
npm install
npm run dev
```

開發伺服器啟動後，使用瀏覽器開啟終端機顯示的 localhost URL。

## 驗證指令

```bash
npm run type-check
npm test
npm run build
npm run preview
```

`npm run build` 會產生 `dist/`、manifest 與 Service Worker。若要在本地模擬 GitHub Pages 專案路徑，可使用：

```powershell
$env:VITE_BASE_PATH = "/your-repository-name/"
npm run build
```

## GitHub Pages 部署

1. 將此資料夾推送到 GitHub Repository 的 `main` 分支。
2. 在 Repository Settings → Pages → Build and deployment 選擇 **GitHub Actions**。
3. `.github/workflows/ci.yml` 會在 push 到 `main` 時執行 type-check、tests、production build，並把 `dist/` 部署到 GitHub Pages。

GitHub Actions 會自動將 `VITE_BASE_PATH` 設為 `/<repository-name>/`，避免專案頁面的資產路徑落到網域根目錄。

## 版本紀錄

### 0.3.0

- 完成借款再投入模擬與 Before / After 比較
- 完成槓桿倍數、負債比與新增現金流計算
- 新增模擬擔保品與投入比例控制

### 0.2.0

- 完成質押借款與擔保品管理
- 完成利息、維持率與門檻風控計算
- 首頁接上借款負債與風控狀態
- 新增 repository bundle 回歸測試與手機版水平溢位修正

### 0.1.0

- 建立離線 PWA 基線與 IndexedDB schema
- 完成股票 / 現金資產管理與 Dashboard
- 完成資產公式服務與 9 個單元測試
- 預留 Loan、Collateral、CashFlowItem、Simulation、DividendTarget 與 BackupData 模型

## 隱私與數值原則

- 股價、成本、匯率與配息為使用者手動輸入，不代表即時市場資料。
- 淨資產 = 總資產 − 總負債。
- 借款不是收入；借款再投入只是改變資產組成，未來會同時增加對應負債。
- 任何金融機構的維持率規則都不會在公式層寫死，門檻由設定與未來 simulation use case 提供。
