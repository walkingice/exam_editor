# 試卷編輯器

這是依 [SPEC.md](SPEC.md) 開發的純前端試卷編輯器。目前已完成 Milestone 1。
已可建立、列表、開啟及刪除本機 Project，
匯入 DOCX，並在 workspace 唯讀顯示已儲存文件；功能順序與
驗證紀錄見 [PLANS.md](PLANS.md)。

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
`http://localhost:4173`。首頁顯示本機 Project 列表；實際 browser 畫面待驗。
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
`playwright-report/` 已由 Git 忽略。使用者指定後，Chromium／Firefox 共 18 個 E2E
案例已通過，Playwright 管理的 dev server 已正常結束。

## 目錄與目前限制

- `src/app/`：應用程式入口與 hash 路由。
- `src/data/`：IndexedDB 儲存及單分頁寫入權。
- `src/features/projects/`：Project 首頁與 workspace。
- `src/features/editor/`：共用 schema 與唯讀文件顯示。
- `src/shared/assets/`：圖片 Blob 的 object URL 生命週期。
- `src/test/`：測試 setup 與文件依賴的 build smoke 模組。
- `tests/e2e/`：待執行的 Playwright smoke test。
- `docs/`：套件與授權紀錄。

首頁可選擇 DOCX 匯入；轉換中可取消，完成後開啟唯讀「試卷內容」。
匯入警告保存在目前 browser session，關閉 browser 後不會保留；請在匯入後立即校對。
Word 原始版面、原始分頁不保證保留。公式、文字方塊、圖形、浮動物件可能遺失或改變順序；
匯入後請對照原稿。六類合成 DOCX 測試資料及預期結果見 [docs/fixtures.md](docs/fixtures.md)。
DOCX 匯出、編輯、預覽與列印尚未實作。本機資料不等於永久備份。

DOCX 匯入解析器的限制：單一 DOCX 20 MiB、單張圖片 10 MiB／4,000 萬像素、
圖片總量 30 MiB。圖片僅支援 PNG/JPEG，其他格式會顯示警告。
匯入時會清理 HTML、正規化文件並以單一交易儲存 Project、JSON 與圖片。
