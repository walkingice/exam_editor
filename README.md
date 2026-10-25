# 試卷編輯器

純前端試卷編輯器。可在瀏覽器建立試卷或匯入 DOCX，編輯、選擇輸出項目、調整排版，透過瀏覽器列印／另存 PDF，或下載可編輯的 DOCX。Project 與圖片儲存在目前瀏覽器的 IndexedDB；沒有帳號或跨裝置同步。產品行為與資料規則見 [SPEC.md](SPEC.md)。

## 開始使用

需要 Node.js 24 以上；專案的 `.nvmrc` 指定 Node.js 24。使用鎖定的套件版本安裝並啟動：

```sh
npm ci
npm run dev
```

開啟 Vite 顯示的網址（預設為 `http://localhost:5173`）。首頁可建立空白試卷、匯入 `.docx`、開啟或刪除本機 Project。試卷名稱可在 workspace 更改。匯入後請檢查「匯入提醒」並對照原稿；Word 的原始版面、分頁及複雜物件不保證保留。

## 編輯與輸出

- **試卷內容**：編輯標題、段落、清單、粗斜體、底線、字體與字級、表格及 PNG/JPEG 圖片。每個頂層項目可勾選是否輸出並拖曳排序；清單項目可選編號或項目符號。可復原／重做、插入分隔頁，或用「修改全部格式」調整全文文字。字體選單提供常用字體與最近使用紀錄；「偵測本機字體」需瀏覽器支援及授權。
- **排版預覽**：設定台灣 B4／A4、直橫向、單欄／雙欄、四邊邊距、預設字級與行距。點選段落、標題或圖片可調整局部格式。分隔頁會把預覽切成多張紙；其他內容仍由瀏覽器自動排版，預覽不保證與最終 PDF 逐頁相同。
- **列印 / PDF**：開啟瀏覽器原生列印介面。紙張、縮放等設定仍可能被列印對話框覆寫，請在原生預覽核對結果。
- **匯出 DOCX**：從「排版預覽」下載目前內容與設定，包含尚未完成自動儲存的修改；未勾選項目不會匯出。DOCX 的文字、清單、表格與圖片可繼續編輯，但目前不映射雙欄設定，也不是完整 Project 備份。映射及降級細節見 [docs/docx-export.md](docs/docx-export.md)。

名稱、內容和頁面設定會自動儲存，畫面會顯示儲存狀態；失敗時可重試。同一 Project 同時只有一個分頁能編輯，其他分頁唯讀，可嘗試重新取得寫入權。清除網站資料、瀏覽器回收空間或更換裝置可能使資料遺失；目前沒有完整備份還原功能。

## Gemini AI 改寫

首頁的「設定」可儲存自己的 Gemini API key、model 與預設 prompt，或用 Refresh 讀取可用 model。這些設定存於目前瀏覽器的 `localStorage`；API key 以明文保存。設定 key 後，可在「試卷內容」對單一項目產生改寫建議並按「套用」，或用「修改全部內容」一次改寫有文字的項目。User Input 會在各面板共用並儲存在 `localStorage`。

AI 請求由瀏覽器直接送到 Gemini；單項改寫送出該項目文字，全文改寫會送出各個有文字項目的文字與 ID。請先檢查回傳內容再使用，尤其是全文改寫會一次套用。圖片不會隨請求上傳。

## 開發與驗證

```sh
npm run typecheck
npm test
npm run build:smoke
npm run build
npm run preview
```

`npm test` 執行一次 Vitest；`npm run test:watch` 持續執行。`build:smoke` 驗證文件依賴能由 Vite 打包成 browser bundle。`preview` 預設使用 `http://localhost:4173`。套件與授權見 [docs/dependencies.md](docs/dependencies.md)。

Playwright 測試涵蓋 Chromium 與 Firefox。依 [PLANS.md](PLANS.md) 的驗收規則，只有使用者明確指定時才啟動真實瀏覽器：

```sh
npx playwright install chromium firefox
npm run test:e2e
```

不用啟動瀏覽器即可列出案例：`npm run test:e2e -- --list`。目前完整 E2E、原生列印／PDF 及 Word／LibreOffice 實際開檔編輯，仍需依 [PLANS.md](PLANS.md)、[列印驗收紀錄](docs/print-verification.md)與 [Office 驗收紀錄](docs/office-verification.md) 完成驗收；自動化測試不能代替這些人工檢查。

## 程式結構

| 路徑 | 職責 |
|---|---|
| `src/domain/` | 文件與頁面設定驗證、輸出投影 |
| `src/data/` | IndexedDB repository 與單分頁寫入權 |
| `src/features/import-docx/` | DOCX 解析、清理與匯入 |
| `src/features/editor/` | Tiptap schema、內容編輯、AI 與格式工具 |
| `src/features/layout/` | 預覽局部格式與列印 |
| `src/features/export-docx/` | DOCX 語意映射與下載 |
| `tests/e2e/` | Playwright 工作流程測試 |

匯入限制為單一 DOCX 20 MiB、單張圖片 10 MiB／4,000 萬像素、圖片總量 30 MiB；圖片僅支援 PNG/JPEG。更多匯入案例見 [docs/fixtures.md](docs/fixtures.md)。
