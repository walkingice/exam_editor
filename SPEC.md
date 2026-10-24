# 試卷編輯器 — MVP 產品與實作規格

目標：提供教師在瀏覽器匯入、編輯、排版、列印與匯出試卷的工具。
架構原則：**純前端、無應用程式後端、IndexedDB 本機儲存、全開源核心依賴**。

## 1. 產品範圍

### 核心流程

1. 首頁列出本機 Projects；每個 Project 代表一份試卷。
2. 使用者可建立空白 Project，或上傳 `.docx` 建立 Project。
3. DOCX 解析後保留可辨識的文字、標題、段落、清單、表格與嵌入圖片；**不要求保留 Word 原始排版**。
4. 進入 Project 後顯示兩個 Tab：
   - **試卷內容**：著重語意結構與內容編輯，體驗類似 Markdown，但不是原始 Markdown 原始碼編輯器。
   - **排版預覽**：同一份內容以紙張寬度、邊界及字體樣式顯示；仍可調整局部格式。
5. 透過瀏覽器列印對話框列印，或選擇「另存為 PDF」。
6. 匯出可再次編輯的 DOCX，盡量保留目前內容與基本樣式，**不要求與網頁/PDF 像素級一致**。

### MVP 必須支援

- Project：建立、匯入、列表、重新命名、刪除、開啟、本機自動儲存。
- 文件：標題、段落、粗體、斜體、底線、清單、基本文字對齊、圖片、簡單表格。
- 題目：以 list item 為單位勾選與拖曳排序，支援跨大題移動；預覽、列印與 DOCX 過濾未勾選題目。
- 排版：B4（預設，265 × 379 mm）、A4（210 × 297 mm），直向／橫向，四邊邊距、預設字級、行距。
- 列印：隱藏 UI、套用紙張設定、瀏覽器列印／存 PDF。
- DOCX 匯出：文字、標題、清單、表格、圖片與基本段落設定。

### 明確不納入 MVP

- 雲端帳號、跨裝置同步、多人協作、伺服器端轉檔。
- Word 完整相容、保留原始版面、浮動圖片／文繞圖、文字方塊、複雜圖形、註解與追蹤修訂。
- OMML 原生公式可編輯、複雜數學公式轉換（列為後續研究項目）。
- 在網頁即時自動切成實際第 1、2、3 頁；預覽採**連續顯示區**，列印時才分頁。
- 排版預覽內修改文字或題目結構；未來可擴充，MVP 僅提供格式調整。
- 精準控制 PDF 自動檔名或直接由應用程式下載 PDF（使用瀏覽器原生列印介面）。

## 2. 技術選型

| 職責 | 選型 | 說明 |
|---|---|---|
| Framework | React + TypeScript + Vite | 純前端 SPA，靜態部署 |
| Editor | Tiptap Core（基於 ProseMirror） | 使用開源 Extensions，不採用付費 Pages/Conversion |
| 文件主格式 | ProseMirror JSON | 唯一的內容來源，不以 Markdown/HTML 作為持久化真相 |
| DOCX 匯入 | Mammoth.js | 瀏覽器 ArrayBuffer → HTML，抽取嵌入圖片 |
| HTML 清理 | DOMPurify + 嚴格允許清單 | 匯入 DOCX 視為不可信輸入 |
| 本機儲存 | IndexedDB + Dexie.js | Project metadata、文件 JSON、圖片 Blob 分開保存 |
| 列印與 PDF | `window.print()` + CSS `@page` / `@media print` | 無須 Playwright 或後端 |
| DOCX 匯出 | docx.js（npm `docx`） | 將 ProseMirror JSON 轉成 Word 文件結構，瀏覽器產生 Blob |
| 測試 | Vitest + React Testing Library + Playwright | 單元、UI、端對端與列印 smoke test |

- 測試範圍：核心邏輯與外觀重點。不測試太過細節的UI 顏色、大小等等。
- React 不需要 Redux、Next.js 或其他大型框架

注意：正式安裝套件時鎖定實際驗證過的版本；使用前再次檢查各相依套件及其擴充套件的授權。

## 3. 系統架構

```text
Browser SPA
├── Project Home
│   └── Project CRUD / DOCX Import
├── Project Workspace
│   ├── 試卷內容 Tab ──────────┐
│   └── 排版預覽 Tab ──────────┤
│                              ▼
│                    Tiptap Editor + shared document state
├── Import pipeline: DOCX → Mammoth → sanitized HTML → Tiptap JSON
├── Print pipeline: JSON → shared output projection → DOM + print CSS → window.print()
├── Export pipeline: JSON + Assets → shared output projection → docx.js → DOCX Blob
└── Persistence: Dexie / IndexedDB
    ├── projects  (metadata + page settings)
    ├── documents (ProseMirror JSON)
    └── assets    (image Blob + metadata)
```

**單一資料來源：** 一個 Project 只有一份 ProseMirror JSON。試卷內容由 Tiptap 編輯；預覽、列印與 DOCX 共用輸出轉換邏輯，從完整 JSON 過濾未勾選題目並套用清單樣式，不另存第二份文件，也不可把過濾結果覆寫回原文件。預覽格式調整透過穩定節點 ID 寫回來源；保留未來支援文字編輯的對應能力，但 MVP 不開放文字編輯。

## 4. 資料模型

以下為概念定義；具體型別以實作時的 Tiptap / Dexie 型別調整。

```ts
type PaperSize = 'TW_B4' | 'A4';
type Orientation = 'portrait' | 'landscape';
type OutputListStyle = 'ordered' | 'unordered';

type PageSettings = {
  paperSize: PaperSize;            // default: TW_B4
  orientation: Orientation;       // default: portrait
  marginsMm: { top: number; right: number; bottom: number; left: number };
  defaultFontSizePt: number;      // default: 12
  lineHeight: number;             // default: 1.5
  outputListStyle: OutputListStyle; // default: ordered
};

type Project = {
  id: string;                     // crypto.randomUUID()
  name: string;
  createdAt: number;
  updatedAt: number;
  pageSettings: PageSettings;
  schemaVersion: number;
};

type ExamDocument = {
  projectId: string;
  content: JSONContent;           // import type { JSONContent } from '@tiptap/core'
  schemaVersion: number;
};

type Asset = {
  id: string;
  projectId: string;
  mimeType: string;
  blob: Blob;
  originalName?: string;
};
```

- 題目使用文件最外層清單的 list item；每個 item 有穩定 `id` 與 `selected`（預設 true），屬性直接存於 ProseMirror JSON。內嵌選項清單不是獨立題目。
- 編輯內容中的清單統一為 unordered list，不儲存自動題號；題目內可包含段落、選項清單、圖片與表格。可調整局部格式的節點也需穩定 ID。
- `outputListStyle` 為 Project 層級設定，僅套用最外層題目清單，內嵌選項維持 unordered；預覽、列印與 DOCX 共用。ordered 模式在各題目清單內由 1 開始，依過濾後順序連續編號。
- 圖片在文件中的 `src` 使用**可持久化 asset ID／自訂節點屬性**，不要存 `blob:` object URL（重新載入後失效），也不要把大型 Base64 直接塞進 ProseMirror JSON。
- 編輯器渲染時由 Asset Resolver 讀取 Blob 並建立暫時性 object URL；生命週期結束時 `URL.revokeObjectURL()`。
- 匯出 DOCX 時由 asset ID 讀取 Blob / ArrayBuffer。
- IndexedDB 寫入使用約 500–1500 ms debounce；離開頁面及切換 Project 時 flush pending changes。提醒：瀏覽器關閉或系統崩潰時不保證最後一筆寫入必定完成。
- 同一 Project 限制單一瀏覽器分頁持有寫入權；其他分頁僅顯示唯讀內容與提示，不可修改、刪除或清理該 Project。取得寫入權後先重新讀取最新資料，避免舊狀態覆蓋；原分頁關閉或異常終止後可恢復編輯。
- 圖片 Blob 清理時機為瀏覽器分頁關閉；編輯期間保留已刪除圖片供 undo/redo 使用。僅清理完整已儲存文件不再引用的資產，未勾選題目引用的圖片仍須保留。關閉時若無法完成儲存或清理，不刪除資產；下次取得該 Project 寫入權後補做清理。這與暫時性 object URL 的釋放不同。
- Project 刪除時一併清理 documents/assets；更新失敗須有明確錯誤提示。
- IndexedDB 是本機儲存，不等於永久備份；匯出/匯入 Project 備份檔可列入下一版。
- 對資料庫與 JSON schema 準備 migration 機制；不要用不受控的 schema 改動破壞舊 Project。

## 5. DOCX 匯入策略

```text
File input (.docx)
→ file.arrayBuffer()
→ mammoth.convertToHtml({arrayBuffer}, image converter)
→ collect embedded image Blobs → IndexedDB assets
→ sanitized HTML (DOMPurify + tag/attribute whitelist)
→ Tiptap parse HTML → ProseMirror JSON
→ validate/normalize document
→ save Project + Document
→ open「試卷內容」Tab
```

- 可辨識的 `h1`–`h6`、`p`、`ul`／`ol`、`strong`、`em`、`table`、`img` 等結構應盡量保留。
- **不強制將所有段落推論成「題目」**：只有 DOCX 可明確辨識的標題才映射 heading；分類或題號如無可靠資訊，保留成普通段落，避免錯誤猜測。
- 辨識到的最外層清單以每個 list item 作為一題，ordered list 正規化為 unordered list，保留 item 內的選項、圖片與表格；內嵌清單不另外建立題目。普通段落不依文字題號猜測拆題，由教師在內容編輯時轉成清單；歸屬不明的圖片或表格保留原位置並提示校對。
- Mammoth 回傳的警告需收集並呈現在匯入結果中；不可靜默丟失不支援的內容。
- 文字方塊、浮動圖形、公式等可能遺失或改變順序；在 UI 提示「請人工校對」。
- 匯入應為交易式操作：失敗時不要產生內容不完整且被誤認成功的 Project；至少提供取消、錯誤提示及清理暫存資產。
- 圖片只允許明確支援的 MIME（第一版 PNG/JPEG，其他格式視支援程度轉換或提示）；限制檔案大小、檔案類型與超大圖片；匯入 HTML 不直接插入不可信 DOM。

## 6. 兩種 Tab 行為

### 試卷內容

- 單欄連續文件，寬度以閱讀舒適為主，不顯示紙張尺寸。
- Tiptap 所見即所得編輯器，支援 Markdown-like shortcuts（例如 `#` 轉標題、`-` 加空白轉無序清單；`1.` 加空白也正規化為無序清單）；**不是編輯 Markdown source**。
- 提供標題、段落、清單、文字強調、表格、插入圖片等必要工具。
- 匯入後預設停留本 Tab，方便修正 OCR/轉換以外的解析瑕疵（本方案不含 OCR）。
- 一個最外層 list item 就是一題（一個邏輯項目，不依畫面換行拆題）；題目前有 checkbox，預設勾選。未勾選題目及其所有子內容只在「試卷內容」保留，不出現在預覽、列印／PDF 或 DOCX。
- 編輯內容使用 unordered list，不顯示自動題號。可拖曳整題調整順序或跨大題移動，連同選項、圖片、表格、穩定 ID 與勾選狀態一起移動；支援 undo/redo。
- 題目以外的標題、姓名欄、說明照常輸出；即使大題內沒有勾選題目仍保留大題標題，配分與百分比視為文字，不自動重算。

試卷內容的格式用 Markdown 表示的話，大致上如下

```markdown
# 第一學期數學考卷

六年___班___號 姓名：

## 一、是非題 (15%)

- (  )  第一題
- (  )  第二題

## 二、填填看

- 第一題 (  )  題目
- 第一題 (  )  題目
```

### 排版預覽

- 顯示連續紙張寬度與列印內容區域，依 Project 設定套用 B4/A4、方向、邊距。
- 不可修改文字、增刪內容或重排題目；可選擇輸出使用 ordered 或 unordered list，只改變呈現方式，不改變題目順序或來源清單類型。
- 可修改全文件預設字級、行距、邊距，以及單一段落的對齊/間距、圖片寬度等。
- **不顯示虛構的頁數**，也不承諾編輯視圖就是最終 PDF 的逐頁結果；以瀏覽器實際列印預覽為最終檢查。
- 預覽從「試卷內容」的完整 JSON 衍生；切換 Tab 不應丟失游標附近編輯、圖片、未勾選題目或尚未儲存的修改。

### 頁面規格

- `TW_B4`: 265 mm × 379 mm（預設）。
- `A4`: 210 mm × 297 mm。
- 橫向時交換寬高。
- 預設四邊邊距：15 mm，可調整。
- 第一版「頁數」由瀏覽器排版自動產生，不提供強制固定總頁數。手動分頁符可作為延伸功能。

## 7. 列印／PDF

- 「列印 / PDF」呼叫 `window.print()`。
- 用獨立 print stylesheet 隱藏 nav、toolbar、side panel、可編輯外框等 UI；只保留文件內容。
- 使用與預覽相同的過濾及清單樣式規則，checkbox 與拖曳把手不列印。
- 透過 `@page { size: ...; margin: ... }` 套用 Project 紙張大小與邊距；視設定動態產生有效規則。
- 使用 `@media print` 管理字型、圖片最大寬度、表格與段落分頁屬性，例如 `break-inside: avoid`（但不能保證所有元素永不跨頁）。
- 列印前確認圖片 Blob 已解析與載入，避免空白圖片；使用者仍可在列印對話框調整紙張/縮放，網站不能完全禁止。
- 測試 Chrome/Chromium 與 Firefox 的列印結果；不要求跨瀏覽器像素級一致。

## 8. DOCX 匯出策略

```text
ProseMirror JSON + pageSettings + Asset Blobs
→ shared output projection (selected items + output list style)
→ traversal / semantic mapping
→ docx.js Document
→ Packer.toBlob(...)
→ browser download
```

- 與預覽／列印共用過濾與清單樣式規則；未勾選題目的文字、圖片與表格不匯出，checkbox、拖曳把手與內部 ID 不轉成可見內容。
- 以**文件節點語意**轉換，不以已排版的 HTML 截圖匯出。
- 對應：heading → Word heading，paragraph → Paragraph，marks → TextRun，list → numbering/bullets，table → Word table，image → embedded image。
- 轉出紙張尺寸、方向、邊距、字級、對齊、粗斜體等能可靠映射的設定。
- 無法保留的 CSS 或編輯器專屬屬性應採合理退化，並明確列出限制。
- 目標是「可在 Microsoft Word / LibreOffice 繼續編輯」；不保證與 PDF 完全一致。
- 匯出必須保留實際圖片與文字，而不是將整頁轉為圖片。

## 9. 四個 Milestone

### Milestone 1 — 匯入 DOCX，展示「試卷內容」

**目標：** 將任意一份基本 DOCX 匯入成可持久化且可閱讀的 Project。

**工作項目：**
1. 初始化 React / TypeScript / Vite、路由與基本首頁。
2. Dexie schema：projects、documents、assets。
3. Project 首頁：列表、新增空白、上傳 DOCX、開啟、刪除。
4. Mammoth 匯入管線與基本錯誤/警告處理。
5. DOCX HTML sanitization；支援內嵌圖片抽取、存 Blob、asset resolver。
6. Tiptap 以唯讀模式顯示「試卷內容」，標題、段落、清單、基本表格、圖片。
7. 重新整理頁面後 Project 與圖片仍能正確顯示。

**驗收標準：**
- 匯入含中文段落、標題、表格、至少兩張圖片的 DOCX 後，內容順序基本正確、圖片可顯示。
- 重新整理、關閉後再次開啟仍可看到同一 Project。
- 不支援元素與解析警告有提示；格式不正確的 DOCX 不會造成空白 Project 或白畫面。
- 此階段不用實作實際內容修改與 DOCX 匯出。

### Milestone 2 — 編輯「試卷內容」

**目標：** 讓教師能修改與儲存試卷內容。

**工作項目：**
1. 開啟 Tiptap 編輯與 toolbar。
2. 支援文字、heading、粗斜體/底線、段落、列表、對齊、表格編輯、插入/刪除圖片。
3. Markdown-like keyboard shortcuts 與 undo/redo。
4. 圖片以本機 Blob 形式儲存，編輯器引用 asset ID。
5. Debounced autosave、dirty/saved/error 狀態，Project 更名。
6. 實作題目勾選、跨大題拖曳整題、unordered list 正規化與 undo/redo。
7. 同一 Project 單一分頁寫入限制、分頁關閉後的圖片清理與下次開啟補清理。
8. 基本編輯器單元測試與重啟還原測試，包含題目屬性、排序、寫入權與圖片清理。

**驗收標準：**
- 能在匯入 DOCX 後任意修改文字、增刪段落與圖片、編輯表格。
- 重新載入後內容和圖片保持一致；反覆編輯無資產遺失。
- autosave 失敗有明確提示；不會默默覆蓋其他 Project。
- 跨大題拖曳後選項、圖片與表格完整，勾選與順序可還原、重做並在重載後保留。
- 第二個瀏覽器分頁不能寫入同一 Project；原分頁關閉後可重新取得寫入權並讀取最新資料。
- 刪圖後 undo 可還原；關閉分頁後清理未引用圖片，保留未勾選題目的圖片；未完成清理可在下次開啟補做。

### Milestone 3 —「排版預覽」與列印／PDF

**目標：** 提供紙張風格排版模式和正式列印功能。

**工作項目：**
1. 加入「試卷內容」「排版預覽」Tabs；保留同一份完整 JSON，預覽不可編輯文字。
2. 排版設定 UI：台灣 B4/A4、直向/橫向、四邊邊距、預設字級/行距。
3. 連續式紙張預覽：展示內容區域寬度，不做即時自動分頁。
4. 調整段落樣式、對齊、圖片寬度；這些設定可儲存並在重開後還原。
5. 建立 print-only stylesheet 和 `window.print()`。
6. 共用輸出轉換：過濾未勾選題目，依 Project 設定呈現 ordered/unordered list。
7. 驗證中文、圖片、表格跨頁與兩種紙張尺寸的列印結果。

**驗收標準：**
- 內容編輯立即反映於預覽；預覽不能修改文字，格式調整可持久化且不影響未勾選題目內容。
- 預覽及列印只包含勾選題目，ordered/unordered 設定一致；跨大題移動或取消勾選後依各清單重新連續編號。
- 更換紙張/方向/邊距後預覽寬度與列印規則跟著更新。
- 瀏覽器列印預覽無工具列或操作按鈕，能列印或另存 PDF。
- 多頁文件內容不被整頁裁掉；已知不理想的跨頁情形文件化。

### Milestone 4 — 匯出 DOCX

**目標：** 提供教師可在 Office 編輯器繼續修改的 DOCX。

**工作項目：**
1. 實作 ProseMirror JSON → docx.js mapper，與 UI 元件解耦。
2. 支援 paragraphs/headings、text marks、numbering、tables、images。
3. 對應 pageSettings（紙張、方向、邊界）與常用樣式。
4. Browser 端產生 Blob 並下載 `project-name.docx`。
5. 使用 Microsoft Word 與 LibreOffice 開檔 smoke test，檢查文字可編輯、圖片與表格存在。
6. 建立 golden sample fixtures 和 export regression tests。

**驗收標準：**
- 匯出的 DOCX 能在 Word/LibreOffice 打開並正常編輯文字。
- 輸出範圍內的文字、標題、表格、圖片不遺失；未勾選題目及其子內容不出現，清單樣式與題目順序和預覽一致。
- 紙張尺寸/方向/邊界大致符合設定；不要求與 PDF 相同的精準分頁。
- 不支援的樣式採可接受降級，且不會直接導致匯出失敗。

## 10. 測試資料與品質策略

準備至少以下 6 類 DOCX fixture：

1. 全中文、標題與編號選擇題。
2. 混合粗體/斜體/底線、段落與清單。
3. 多張 PNG/JPEG 圖片，含較大尺寸圖片。
4. 有合併儲存格或多欄的表格（檢查可接受退化）。
5. 多頁內容（測試列印跨頁、B4/A4、直橫向）。
6. 含 Word 公式、浮動文字方塊或圖形的限制案例（預期給出警告或記錄缺失）。

- 單元測試：import normalization、asset resolution、schema migration、DOCX mapping、題目過濾與清單編號、跨大題移動、單一分頁寫入權、圖片清理（含異常關閉後補清理）。
- 題目 fixture：含巢狀選項、圖片與表格的多個大題，驗證整題移動、全不勾選、部分勾選、undo/redo，以及預覽／列印／DOCX 輸出一致。
- 端對端測試：匯入 → 打開 → 編輯 → 重載 → 排版 → 列印（可測 print CSS）→ 匯出 DOCX。
- 穩定性：大型 DOCX 的解析等待/錯誤狀態，以及 IndexedDB quota exceeded 的提示。
- 安全性：不可信 HTML 的 sanitizer 測試；禁止事件處理屬性、不受信任 URL、危險標籤。

## 11. 建議目錄結構

```text
src/
  app/             # routing, app shell
  features/
    projects/      # homepage, project CRUD
    import-docx/   # mammoth pipeline, sanitize, normalization
    editor/        # tiptap setup, extensions, toolbar
    layout/        # page settings, print styles, layout preview
    export-docx/   # ProseMirror → docx.js
  data/
    db.ts          # Dexie schema / migrations
    repositories/  # projects, documents, assets
  domain/
    types.ts       # project/page settings/document models
  shared/
    assets/        # image resolver / object URL lifecycle
    components/
  test/fixtures/
```

## 12. Coding agent 工作規則

- **嚴格依照 Milestone 1 → 4 順序**；每階段先完成該階段驗收，再進入下一階段。
- 優先使用成熟開源套件，不自行解析 OOXML、也不自行實作排版引擎。
- Editor JSON 是唯一的內容 truth；不要額外持久化獨立 Markdown/HTML 內容造成分歧。
- 模組間透過清楚的 importer、repository、exporter 介面隔離，避免轉換邏輯散落在 React components。
- 重要功能必須有自動化測試；匯入／匯出提供可重複使用的 fixture。
- 若某一種 DOCX 結構無法正確轉換，記錄限制及測試案例，不要以無證據的猜測默默轉換。
- 前端完全本機執行；除下載靜態應用程式資源之外，不將使用者試卷上傳到外部服務。
- 每個 Milestone 完成時，交付可執行程式、README（啟動方式）、測試結果、已知限制。

## 13. 外部技術參考

- Mammoth.js：https://github.com/mwilliamson/mammoth.js
- Tiptap：https://tiptap.dev/docs/editor/getting-started/overview
- ProseMirror：https://prosemirror.net/
- docx.js：https://docx.js.org/
- Dexie：https://dexie.org/
- DOMPurify：https://github.com/cure53/DOMPurify
- MDN Printing：https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing
- MDN `@page`：https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40page

