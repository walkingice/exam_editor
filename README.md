# 試卷編輯器

這是依 [SPEC.md](SPEC.md) 開發的純前端試卷編輯器。目前已完成 Phase 0：
已建立 React + TypeScript + Vite 的 Hello World 與測試基礎。功能順序及驗證紀錄見
[PLANS.md](PLANS.md)；正式產品功能尚未實作。

## 環境與安裝

- Node.js 24 或更新版本；開發驗證使用 Node.js 24.18.0。
- npm 11 或更新版本；開發驗證使用 npm 11.18.0。
- 可使用 `.nvmrc` 選擇 Node.js 24。

從乾淨 checkout 安裝鎖定版本：

```sh
npm ci
```

## 開發與檢查

```sh
npm run dev
npm run typecheck
npm test
npm run test:watch
npm run build:smoke
npm run build
npm run preview
```

`dev` 預設服務於 `http://localhost:5173`，`preview` 預設服務於
`http://localhost:4173`。兩者的首頁預期呈現 Hello World；實際 browser 畫面待驗。
`test:watch` 持續執行，結束時按 `Ctrl+C`；`npm test` 是一次性測試。
`build:smoke` 檢查文件依賴可被 Vite 打包成 browser bundle，結果寫入已忽略的
`dist-smoke/`。套件版本與授權見 [docs/dependencies.md](docs/dependencies.md)。
dev 與 production preview 的 HTTP 回應已驗證；實際 browser 畫面待驗。

## Browser 測試

依 SPEC 的驗證規則，**只有使用者明確指定時**才執行以下兩個命令；它們會下載
或啟動真實瀏覽器：

```sh
npx playwright install chromium firefox
npm run test:e2e
```

不啟動瀏覽器即可檢查 E2E 測試清單：

```sh
npm run test:e2e -- --list
```

Playwright 已設定 Chromium、Firefox、獨立測試 context、由測試工具管理的 dev
server，以及失敗時保留 trace／screenshot。`test-results/` 與
`playwright-report/` 已由 Git 忽略。實際 E2E 及 server 自動結束行為尚未驗證。

## 目錄與目前限制

- `src/app/`：應用程式入口與目前的 Hello World。
- `src/test/`：測試 setup 與文件依賴的 build smoke 模組。
- `tests/e2e/`：待執行的 Playwright smoke test。
- `docs/`：套件與授權紀錄。

Project、DOCX 匯入／匯出、編輯、IndexedDB 本機儲存、預覽與列印都尚未實作。
目前不會儲存任何試卷資料；未來的本機資料也不等於永久備份。
