# 試卷編輯器

這是依 [SPEC.md](SPEC.md) 開發的純前端試卷編輯器。目前已完成 Milestone 1–3，並已加入 DOCX 語意匯出與下載；
Phase 12 的 browser／Office 最終驗收仍待完成。已可建立、列表、開啟及刪除
本機 Project、匯入 DOCX，並在有寫入權的 workspace 編輯文件；功能順序與
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
`http://localhost:4173`。首頁顯示本機 Project 列表。
`test:watch` 持續執行，結束時按 `Ctrl+C`；`npm test` 是一次性測試。
`build:smoke` 檢查文件依賴可被 Vite 打包成 browser bundle，結果寫入已忽略的
`dist-smoke/`。套件版本與授權見 [docs/dependencies.md](docs/dependencies.md)。
dev 與 production preview 的 HTTP 回應已驗證。

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
`playwright-report/` 已由 Git 忽略。使用者指定後，Chromium／Firefox
共 42 個 E2E 案例已通過，包含資產清理、完整編輯 session，以及匯入後修改表格
與插入圖片再重載。

## 目錄與目前限制

- `src/app/`：應用程式入口與 hash 路由。
- `src/data/`：IndexedDB 儲存及單分頁寫入權。
- `src/features/projects/`：Project 首頁與 workspace。
- `src/features/editor/`：共用 schema、文字／表格／圖片編輯與文件顯示。
- `src/shared/assets/`：圖片 Blob 的 object URL 生命週期。
- `src/test/`：測試 setup 與文件依賴的 build smoke 模組。
- `tests/e2e/`：Playwright 工作流程測試。
- `docs/`：套件與授權紀錄。

首頁可選擇 DOCX 匯入；轉換中可取消，完成後開啟「試卷內容」。持有該 Project
寫入權的分頁可編輯文字、表格與 PNG/JPEG 圖片、勾選題目，並在整份試卷內容中排序項目；其他分頁唯讀。標題樣式只改變外觀，不建立排序區域。
名稱、內容與頁面設定自動儲存，畫面會顯示儲存狀態，失敗時可重試。頁面設定可選
台灣 B4／A4、直向／橫向、四邊邊距、字級、行距及輸出清單樣式。邊距可輸入
0–100 mm，字級 6–72 pt，行距 0.5–4；內容寬高必須大於 0。頁面設定與「列印 / PDF」
僅在「排版預覽」Tab 顯示。排版預覽是連續畫面，不保證與最終 PDF 逐頁一致。
可在「排版預覽」Tab 選「列印 / PDF」開啟瀏覽器原生列印介面，
再選擇印表機或「另存為 PDF」。瀏覽器或列印對話框的紙張、方向與縮放設定可能覆寫
頁面設定，請以原生列印預覽作最後檢查。列印支援範圍和驗收狀態見
[docs/print-verification.md](docs/print-verification.md)。
圖片刪除後的 Blob
在編輯期間保留以供 undo；離開 workspace 或關閉分頁時，成功儲存後清理未引用圖片。
若關閉時清理未完成，下次取得寫入權會在建立編輯 history 前補做。瀏覽器關閉時的
非同步儲存是 best effort，最後一筆編輯不保證完成；進入 browser 暫存不清理圖片。
匯入警告保存在目前 browser session，關閉 browser 後不會保留；請在匯入後立即校對。
Word 原始版面、原始分頁不保證保留。公式、文字方塊、圖形、浮動物件可能遺失或改變順序；
匯入後請對照原稿。六類合成 DOCX 測試資料及預期結果見 [docs/fixtures.md](docs/fixtures.md)。
兩個 Tab 均可按「匯出 DOCX」，下載目前內容與設定的 `project-name.docx`，
包含尚未自動儲存的修改；唯讀分頁匯出目前已載入版本。產生期間可取消下載，
失敗可重試；取消不會中止已開始的壓縮運算。表格等降級會列於匯出提醒。
檔名不合法字元會替換為底線。DOCX 保留可編輯文字、圖片與表格，但不包含
未勾選內容，也不是完整 Project 備份。本機資料不等於永久備份；清除網站資料、
瀏覽器儲存空間回收或更換裝置可能遺失資料，目前沒有完整備份還原功能。

DOCX 匯入解析器的限制：單一 DOCX 20 MiB、單張圖片 10 MiB／4,000 萬像素、
圖片總量 30 MiB。圖片僅支援 PNG/JPEG，其他格式會顯示警告。
匯入時會清理 HTML、正規化文件並以單一交易儲存 Project、JSON 與圖片。

## DOCX mapper development status

Phase 11 provides an independent semantic DOCX mapper for selected content,
including editable text, lists, tables, embedded PNG/JPEG images, and page
formatting. See [mapping behavior and limitations](docs/docx-export.md).
The download UI is implemented. Browser download acceptance and actual
Word/LibreOffice editing remain pending; see [Office verification](docs/office-verification.md).
