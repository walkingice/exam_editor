# 試卷編輯器 — 實作與進度計畫

本文件說明如何完成 [SPEC.md](SPEC.md)。SPEC 定義產品與技術約束；本文件定義實作順序、檔案分工、測試及交付。若兩者衝突，先修正計畫，不可擅自降低 SPEC 要求。

## 執行與追蹤規則

- 順序：Milestone 1（包含 Phase 0）→ Milestone 2 → Milestone 3 → Milestone 4。各 Milestone 的驗收 step 通過後，才開始下一個 Milestone。
- 每個 Phase 依 step 順序執行；依賴先前 Phase 已完成的產物。每個 step 是一個可獨立 review、測試與提交的工作單位，避免把整個 Phase 累積成一個 commit。需要 fixture 的 step 當下建立最小測試資料，不等待 Milestone 驗收才補；驗收 step 負責補齊案例矩陣與整合回歸。
- 開始前讀 SPEC、目前 Phase 與相關程式；說明修改原因和範圍。程式、註解及 commit message 使用 English。
- 每個 step 必須完成目標、實作、驗證與 sub-agent review/testing，才能將 `- [ ]` 改為 `- [x]`。在該 step 下補上驗證命令、結果、已知限制及 review 結果；測試失敗或必要人工驗收尚未執行不可勾選完成。
- 依 SPEC 的瀏覽器驗證規則，只有使用者明確指定時才啟動真實瀏覽器。可完成 browser test 的程式與靜態設定檢查，但未執行的 browser test 必須標記為待驗，不能記成通過；Phase 0 的驗收以不啟動瀏覽器的驗證為準。使用者明確要求略過某 Phase 的真實瀏覽器測試時，該 Phase 可依其他驗證結果完成，但須記錄略過範圍與未驗風險，不得宣稱 browser test 通過。
- 實作與該 step 的 checkbox 更新放在同一 commit；commit hash 如需記錄，在後續進度更新填入，不寫尚不存在的 hash。Phase 僅於全部 steps 完成時勾選。
- 每個 commit subject 以 type 開頭且不超過 50 字元；body 每行不超過 72 字元。使用多個 `git commit -m` 傳遞 subject、各段 body、agent metadata trailer。多步工作依 AGENTS 規則標記 `[Step 1 - 1/2]` 類型的進度，不執行 `git push`。
- step 若因實際範圍過大需拆分，先新增有獨立目標、實作與驗證的子 steps，再執行；不得只以「完成部分」勾選原 step。函式盡量小於 50 行；依 AGENTS 規則拆分大型跨檔案變更。
- 下列檔名是預定分工，可依實際套件 API 調整；版本與 API 必須在實作時以官方文件和安裝結果確認，不照抄未驗證的範例。
- 本次文件規劃不代表任何功能已完成；所有功能 checkbox 從未勾選開始。README.md 在 Phase 0 實際建置後撰寫，不能先宣稱尚未執行的命令已通過。

## 共用實作設計

### 目錄與邊界

```text
src/
  app/                  # App shell and routing
  domain/               # Types, schema, normalization, output projection
  data/                 # Dexie, repositories, migrations, write ownership
  features/
    projects/           # Home, CRUD, import entry
    import-docx/        # Mammoth conversion and sanitization
    editor/             # Tiptap extensions, commands and toolbar
    layout/             # Preview, page settings and print
    export-docx/        # Semantic mapping and download
  shared/
    assets/             # Blob resolver and object URL lifetime
    components/         # Shared controls and error UI
  test/fixtures/        # Input documents and expected results
tests/e2e/              # Browser workflows
```

React components 呼叫 importer、repository、exporter 介面，不直接散落轉檔或 IndexedDB 邏輯。以下資料流程均使用同一份來源文件：

```text
DOCX -> Mammoth HTML + image Blobs -> sanitized HTML
     -> Tiptap JSON -> normalize/validate -> atomic repository save

Full JSON + output settings -> pure output projection
  -> preview DOM
  -> print DOM + print CSS -> window.print()
  -> semantic mapper + referenced Blobs -> docx.js -> download
```

### 概念型別與儲存分工

下列型別是實作起點，欄位意義以 SPEC 為準；新增欄位或改 schema 必須有 migration 與測試。

```ts
import type { JSONContent } from '@tiptap/core';

type PaperSize = 'TW_B4' | 'A4';
type Orientation = 'portrait' | 'landscape';
type OutputListStyle = 'ordered' | 'unordered';

type PageSettings = {
  paperSize: PaperSize; // Default: TW_B4
  orientation: Orientation; // Default: portrait
  marginsMm: { top: number; right: number; bottom: number; left: number };
  defaultFontSizePt: number; // Default: 12
  lineHeight: number; // Default: 1.5
  outputListStyle: OutputListStyle; // Default: ordered
};

type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pageSettings: PageSettings;
  schemaVersion: number;
};

type ExamDocument = {
  projectId: string;
  content: JSONContent;
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

使用 Dexie 的 `projects`、`documents`、`assets` stores；asset 依 projectId 建索引。以 `crypto.randomUUID()` 產生 ID。題目 list item 的 `id`、`selected`、圖片 `assetId` 和局部格式存於 JSON 節點屬性；預覽需要定位的節點也給穩定 ID。輸出結果不另行持久化。

## Milestone 1 — 匯入 DOCX，展示試卷內容

目標：基本 DOCX 可匯入、唯讀展示、持久化並重新開啟。本 Milestone 不開放文字編輯或 DOCX 匯出。

- [x] **Phase 0 — Infrastructure、Hello World 與開發文件**

  - [x] **Step 0.1 — 建立可啟動的 React 專案**
    - 目標：在乾淨 checkout 中可安裝、啟動與 build Hello World。
    - 實作：確認 Node.js/npm 相容版本，建立 React + TypeScript + Vite、`src/app/App.tsx` 與入口；保留現有文件。設定 Node 版本說明或版本檔、package scripts（`dev`、`build`、`preview`、`typecheck`）、lockfile 與 `.gitignore`，忽略 node_modules、dist、測試輸出。不要加入 Redux 或 Next.js。
    - 驗證：執行 `npm ci`、`npm run typecheck`、`npm run build`；啟動 dev server 並確認 HTTP 回應提供 app 入口，且來源包含 Hello World。真實瀏覽器畫面檢查依 SPEC 規則待指定。記錄實際使用版本及命令結果。
    - Commit：`chore: Bootstrap React application`。
    - 驗證紀錄（2026-10-24）：Node.js 24.18.0、npm 11.18.0；`npm ci`、`npm run typecheck`、`npm run build` 通過。dev server 的 HTTP 回應提供 `#root` 與 `/src/main.tsx`，`src/app/App.tsx` 包含 Hello World。sub-agent testing 獨立通過安裝、型別、建置與 HTTP 檢查；review 建議忽略 `*.tsbuildinfo`，已修正。依 SPEC 規則未啟動瀏覽器，實際畫面待驗。

  - [x] **Step 0.2 — 安裝並確認核心 dependencies**
    - 目標：後續功能使用的套件已安裝且授權、版本相容性可追蹤。
    - 實作：安裝 Tiptap Core/React 與必要開源 extensions（heading、list、marks、alignment、image、table、history）、Mammoth、DOMPurify、Dexie、docx。先檢查 StarterKit 已包含的 extensions，避免重複註冊。安裝對應 TypeScript types；鎖定驗證過的版本並更新 lockfile。將直接依賴與擴充套件授權記於 `docs/dependencies.md`；不引入付費 Pages/Conversion 或外部轉檔服務。
    - 驗證：乾淨安裝、typecheck、build；用最小測試模組驗證套件能在 browser build 中載入，沒有依賴 Node-only runtime。授權檢查結果寫入文件。
    - Commit：`chore: Install core document dependencies`。
    - 驗證紀錄（2026-10-24）：`npm ci`、`npm run typecheck`、`npm run build`、`npm run build:smoke` 通過；smoke bundle 含 320 個 modules，無 Node-only external 標記。套件版本與授權見 `docs/dependencies.md`；sub-agent testing 獨立核對通過，review 無阻礙並修正 `use client` 警告敘述。真實瀏覽器執行依 SPEC 待指定。

  - [x] **Step 0.3 — 建立單元與 UI 測試環境**
    - 目標：開發者可以執行一次性測試與 watch mode。
    - 實作：安裝 Vitest、React Testing Library、DOM 測試環境與 assertions；後續 IndexedDB 單元測試使用測試替身。加入 `test`（一次性執行）、`test:watch` scripts、共用 setup；寫 Hello World render 測試，不測微小樣式值。
    - 驗證：`npm test`、`npm run typecheck` 通過；暫時改錯預期文字確認測試會失敗，再還原。不得提交故意失敗的測試。
    - Commit：`test: Configure unit and UI testing`。
    - 驗證紀錄（2026-10-24）：`npm test`（1 file／1 test）、`npm run typecheck`、`npm run build` 通過；暫時將預期文字改成 `Wrong text` 時測試如預期失敗，還原後通過。sub-agent review/testing 均通過，未啟動瀏覽器。

  - [x] **Step 0.4 — 建立 browser smoke test**
    - 目標：可以自動啟動網站並在 Chromium、Firefox 驗證基本頁面。
    - 實作：安裝 Playwright 測試套件，設定 Chromium、Firefox 的 webServer、獨立測試 context、`test:e2e` script、失敗時的 trace/screenshot；加入 Hello World smoke test。browser binaries 的下載命令另行記錄，不預設執行。
    - 驗證：以 Playwright 的測試列舉與設定檢查確認兩個 browser projects 的案例可載入，確認失敗產物被忽略。`npm run test:e2e` 的實際 browser 結果待使用者明確指定後記錄。
    - Commit：`test: Add browser smoke coverage`。
    - 驗證紀錄（2026-10-24）：`npm ci`、`npm test`（1/1）、`npm run typecheck`、`npm run build` 通過；`npm run test:e2e -- --list` 列出 Chromium／Firefox 各一案。sub-agent review/testing 核對設定與忽略規則通過。依 SPEC 未下載 browser binaries、未執行 E2E；browser 結果與 webServer 自動停止待驗。

  - [x] **Step 0.5 — 撰寫 README 與驗收 infrastructure**
    - 目標：新進開發者只讀 README 就能啟動與測試專案。
    - 實作：建立 `README.md`，列出 Node/npm 需求、`npm ci`、Playwright browsers 安裝、dev、typecheck、unit/UI、E2E、build/preview 的實際命令，說明目錄、SPEC/PLANS 分工、目前只完成 Hello World、本機資料與已知限制。
    - 驗證：依 README 從乾淨安裝順序執行非 browser 命令；確認 dev 與 production preview 的 HTTP 回應。sub-agent 依文件獨立核對命令與結果；browser 畫面及 E2E 執行結果明列待驗後，才勾選 Phase 0。
    - Commit：`docs: Document setup and testing workflow`。
    - 驗證紀錄（2026-10-24）：README 已列出環境、命令、目錄與限制；sub-agent review 通過。testing 依 README 執行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build:smoke`、`npm run build`、`npm run test:e2e -- --list` 均通過。dev HTTP 已在 Step 0.1 驗證；production preview 回傳 HTTP 200，建置資產含 Hello World，server 已停止。未啟動瀏覽器；實際畫面、E2E 與 Playwright webServer 啟停待指定後驗證。

- [x] **Phase 1 — 文件 schema 與儲存基礎**

  - [x] **Step 1.1 — 建立 domain 型別與 editor schema**
    - 目標：匯入與編輯共用同一套合法文件結構。
    - 實作：在 `domain/` 定義上述型別、預設值、驗證函式；在 `features/editor/` 建立共用 extensions。題目 item 容納段落、巢狀選項、圖片、表格；來源清單一律 unordered。建立穩定 ID 補齊與重複 ID 修復規則，已存在的合法 ID 不重建；新題目 selected=true。
    - 驗證：單元測試空文件、混合內容、選項不被當成新題目、重複正規化不改 ID、非法 schema 拒絕或明確降級；typecheck。
    - Commit：`feat: Define exam document schema`。
    - 驗證紀錄（2026-10-24）：`npm test`（2 files／8 tests）、`npm run typecheck`、`npm run build` 通過。測試涵蓋空文件、混合表格／圖片、巢狀選項、ID 修復與重複正規化、非法節點、邊距，以及 `<ol>` 匯入後預設勾選。sub-agent review/testing 均通過；review 發現的 `<ol>` 屬性與預設勾選問題已修正。編輯階段仍須避免建立有序來源清單，並於儲存前正規化；本 step 無 browser 驗證要求。

  - [x] **Step 1.2 — 建立 Dexie repository 與 migration**
    - 目標：以交易方式建立、讀取、更新、刪除完整 Project。
    - 實作：建立 stores、索引與 repository 介面；Project metadata、JSON 與資產寫入同一交易，刪除也一併處理。準備 database version 與 JSON schemaVersion 的升級入口；不支援的未來版本顯示錯誤，不覆寫原資料。Promise 完成後才回報成功。
    - 驗證：repository 單元測試 CRUD、交易中途失敗 rollback、刪除連帶資產、migration 舊 fixture、未知版本拒絕；測試資料庫每次獨立清空。
    - Commit：`feat: Add transactional project storage`。
    - 驗證紀錄（2026-10-24）：`npm test`（3 files／14 tests）、`npm run typecheck`、`npm run build` 通過。使用 fake-indexeddb 獨立資料庫測試 CRUD、建立及更新失敗 rollback、刪除連帶資產、version 1 fixture migration、未來版本拒絕讀取／修改／刪除。sub-agent review/testing 均通過；尚無 UI，未執行 browser 驗證。

  - [x] **Step 1.3 — 建立單一分頁寫入權**
    - 目標：從首次提供 CRUD 起就避免同 Project 被多個分頁同時修改。
    - 實作：建立 `data/` ownership service，依 projectId 使用 browser 支援的互斥機制（優先評估 Web Locks）；所有 repository mutation 包含刪除與資產清理皆驗證寫入權。失去權限就停止寫入；重新取得後重讀資料。若環境不支援可靠互斥，明確禁止寫入並提示，不以單純 localStorage flag 假裝有鎖。
    - 驗證：此時尚無 Project UI，使用僅供測試的 browser harness 暴露 repository／ownership 操作，以兩個同 origin pages 驗證只一個 writer、第二分頁不可刪除、關閉 owner 後重新取得並讀到最新資料；單元測試失去權限時拒絕 mutation。harness 不納入 production build。
    - Commit：`feat: Enforce single-tab project writes`。
    - 驗證紀錄（2026-10-24）：Web Locks ownership service、repository mutation guard、測試 harness 與兩分頁 Playwright 案例已實作。`npm test`（4 files／18 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過；Vite harness HTML 與模組的本機 HTTP 回應成功。sub-agent review/testing 均通過，失權後續寫入拒絕的問題已補回歸測試。使用者回報安裝 browser binaries 並通過 Step 1.3 的 Playwright 測試；本機 `test-results/.last-run.json` 記錄 `status: passed`、`failedTests: []`。此回合未重跑瀏覽器測試。若既有 Dexie 交易進行中同時遭外部強制收回 Web Lock，該交易仍可能完成；目前未使用 `steal`。

- [x] **Phase 2 — Project 首頁與唯讀 workspace**

  - [x] **Step 2.1 — 建立首頁與 Project 路由**
    - 目標：使用者可建立空白文件、列表、開啟及刪除 Project。
    - 實作：在 `app/` 建首頁與 projectId 路由，靜態部署可直接載入；在 `features/projects/` 串接 repository，顯示 loading、empty、error 狀態。Project 不存在時顯示可返回首頁的訊息；刪除後關閉相關 workspace。新增時寫入完整預設文件與頁面設定。
    - 驗證：UI 測試 CRUD 與錯誤狀態；E2E 建立、刷新、重新開啟、刪除，以及直接進入有效／不存在的路由；再以真實 UI 驗證雙分頁中非 owner 無法刪除，接手後讀取最新資料。
    - Commit：`feat: Add project home and navigation`。
    - 進度紀錄（2026-10-24）：首頁、hash Project 路由、空白文件建立、列表、刪除、唯讀／接手狀態及跨分頁刪除通知已實作。`npm test`（5 files／23 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過；Chromium／Firefox 各列出建立、重載、直接開啟、刪除、雙分頁阻擋與接手案例。sub-agent testing 獨立通過非 browser 檢查；review 發現的通知、載入與鎖釋放競態已修正。依 SPEC 尚未啟動真實瀏覽器；E2E 未通過前本 step 保持待驗。
    - 驗收紀錄（2026-10-24）：使用者指定後執行 `npm run test:e2e`；Chromium／Firefox 的建立、重載、重新開啟、刪除、直接路由、雙分頁阻擋與接手案例均通過。搭配既有 UI 測試、sub-agent review/testing，本 step 完成。

  - [x] **Step 2.2 — 建立唯讀 editor 與 Asset Resolver**
    - 目標：完整 JSON 的文字、表格及圖片可在重開後顯示。
    - 實作：共用 Step 1.1 schema，以唯讀 Tiptap 呈現；圖片節點僅存 assetId，resolver 向 repository 讀 Blob 並管理 object URL。卸載、換 Project 與無人使用時釋放 URL；找不到圖片顯示 placeholder 和錯誤，不破壞文字。此時不加入文字編輯 toolbar。
    - 驗證：測試 Blob lookup、URL 建立／釋放、切換 Project 不串圖、缺圖提示；E2E 用儲存 fixture 確認 reload 後圖片存在。
    - Commit：`feat: Render stored exam documents`。
    - 進度紀錄（2026-10-24）：已使用共用 Tiptap schema 唯讀顯示文字、表格及圖片；Blob resolver 依 Project 查詢並於卸載或切換時釋放 object URL，缺圖顯示 placeholder。`npm test`（7 files／30 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過；已列出儲存圖片重載案例。sub-agent testing 獨立通過非 browser 檢查；review 發現同 Project 重讀未更新內容與舊圖片短暫顯示問題，均已修正。依 SPEC 尚未啟動真實瀏覽器；E2E 未通過前本 step 保持待驗。
    - 驗收紀錄（2026-10-24）：首次完整 E2E 的 Chromium／Firefox 圖片案例失敗；發現 React StrictMode effect 重跑後 resolver 停用。已修正重新啟用與舊 lookup 失效，補 UI／resolver 回歸測試。失敗的 4 案重跑全過，完整 `npm run test:e2e` 18/18 通過；`npm test` 12 files／63 tests、`npm run typecheck`、`npm run build` 通過。sub-agent review/testing 通過；本 step 完成。

- [x] **Phase 3 — DOCX 匯入與 Milestone 1 驗收**

  - 驗收狀態（2026-10-24）：使用者指定後執行 Chromium／Firefox 真實 browser E2E，修正 StrictMode 圖片問題後完整 18/18 通過。`npm test`（12 files／63 tests）、`npm run typecheck`、`npm run build` 通過；Milestone 1 完成，workspace 仍為唯讀。匯入警告只保留在目前 browser session，見 README。

  - [x] **Step 3.1 — 建立輸入限制與 Mammoth adapter**
    - 目標：將 DOCX 解析成未信任 HTML、圖片 Blobs 與警告，不立即寫入 Project。
    - 實作：建立 importer result 型別、取消訊號與可辨識錯誤；File.arrayBuffer 後呼叫 Mammoth image converter。訂出並集中管理 DOCX 大小、圖片大小／像素與總資產上限，寫入 README；檢查檔案內容與 MIME，不只依副檔名。先支援 PNG/JPEG，其他格式給警告；不自行撰寫 OOXML parser。
    - 驗證：單元測試有效 DOCX、損壞內容、偽裝副檔名、超限圖片、unsupported image、取消、Mammoth 警告；確保失敗不寫 DB。
    - Commit：`feat: Parse DOCX content and image assets`。
    - 驗證紀錄（2026-10-24）：`npm test`（8 files／40 tests）、`npm run typecheck`、`npm run build:smoke`、`npm run build` 通過。真實 DOCX 文字／PNG 與 JPEG 圖片 header、偽裝副檔名、損壞內容、圖片大小／像素／總量、不支援格式、取消及 Mammoth warning/error 均有測試；adapter 不呼叫 repository。sub-agent review/testing 通過；review 提出的 Mammoth 隱藏圖片錯誤已修正。browser bundle smoke 已含 importer；UI 串接已於 Step 3.3 完成，真實 browser 測試仍未執行。

  - [x] **Step 3.2 — 清理 HTML 並正規化 JSON**
    - 目標：匯入資料符合安全要求及題目模型。
    - 實作：使用 DOMPurify 明確 tag/attribute allowlist；只允許 importer 建立的資產引用，不保留任意 remote URL、事件屬性或危險標籤。透過共用 editor schema 解析 sanitized HTML，再正規化 unordered lists、ID、selected。保留標題、段落、marks、表格及圖片順序；普通文字題號不猜測拆題，無法確認的歸屬記警告。
    - 驗證：sanitizer 測試 script、事件 handler、不可信 URL；normalization 測試有序清單、巢狀選項、混合表格圖片與中文；相同 fixture 可重複產生語意相同的文件。
    - Commit：`feat: Sanitize and normalize DOCX imports`。
    - 驗證紀錄（2026-10-24）：`npm test`（9 files／46 tests）、`npm run typecheck`、`npm run build` 通過。測試涵蓋 script、事件、URL、偽造資產引用、ordered／巢狀清單、中文、marks、表格圖片順序、合併儲存格、對齊與重複匯入語意。sub-agent review/testing 通過；review 提出的偽造 attribute 與段落內圖片警告已修正。尚未執行真實 browser 驗證。

  - [x] **Step 3.3 — 串接交易匯入 UI**
    - 目標：匯入成功才顯示完整 Project，取消或失敗不留下殘缺資料。
    - 實作：首頁檔案選擇器串接 adapter、sanitizer、normalizer；轉換期間顯示等待與取消。只在全部轉換成功且未取消後提交 Project、JSON、Blobs 交易；若先存暫存資產，必須 rollback 清除。完成後開啟「試卷內容」，呈現警告與人工校對提示；不可把取消當成功。
    - 驗證：UI/E2E 測試成功、重複操作防護、轉換中取消、儲存失敗、quota error；檢查失敗後首頁與 DB 都沒有半成品。
    - Commit：`feat: Add transactional DOCX import flow`。
    - 進度紀錄（2026-10-24）：首頁匯入、轉換中取消、交易儲存、警告及人工校對提醒已接通；離開首頁會中止轉換，儲存時不能取消。`npm test`（11 files／55 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過，E2E 清單含 Chromium／Firefox 成功匯入重載與損壞檔案。unit/UI 測試涵蓋取消、重複操作、quota 與交易 rollback；sub-agent review/testing 通過。依 SPEC 未執行真實 browser，E2E 與產品驗收待驗，本 step 保持未完成。關閉 browser 後 sessionStorage 警告不保留，見 README。
    - 驗收紀錄（2026-10-24）：Chromium／Firefox 的成功匯入、重載、關閉分頁後重開、損壞檔案不建 Project 均通過。unit/UI 測試涵蓋取消、重複操作、quota 與交易 rollback；完整 E2E 18/18、unit/UI 63/63 通過。本 step 完成；sessionStorage 警告不跨 browser session 保留。

  - [x] **Step 3.4 — 建立 fixtures 並驗收 Milestone 1**
    - 目標：有可重複的真實輸入與明確限制紀錄。
    - 實作：建立六類 DOCX fixtures：中文題目、混合 marks、至少兩張 PNG/JPEG 與大圖、合併儲存格／多欄表格、多頁內容、公式／文字方塊／圖形。每個 fixture 附來源或產生方式、預期保留內容與降級結果，不使用真實學生資料。補 README 匯入／本機儲存操作與已知限制。
    - 驗證：匯入中文、標題、表格、兩張圖，重載與關閉重開仍存在；損壞 DOCX 不白畫面、不產生空 Project。不支援元素有提示或限制紀錄。執行 unit/UI/E2E、typecheck、build 並記錄結果；本階段仍為唯讀。
    - Commit：`test: Verify persistent DOCX import workflow`。
    - 進度紀錄（2026-10-24）：六類合成 DOCX fixtures、可重產生腳本、預期保留／降級文件與解析測試已加入；明確啟用 Mammoth underline mapping。`npm test`（12 files／61 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過；Chromium／Firefox 各列出中文題目、表格、兩張圖片與重載案例。尚未執行真實 browser 驗收，Milestone 1 與本 step 保持未完成；實際 E2E 結果待指定後記錄。
    - 驗收紀錄（2026-10-24）：六類 DOCX fixture 解析測試通過；Chromium／Firefox 實際匯入中文題目、合併表格、PNG/JPEG 並重載圖片。損壞 DOCX 顯示錯誤且不建立 Project；公式等不支援內容有 Mammoth 警告或 `docs/fixtures.md` 限制紀錄。完整 E2E 18/18、unit/UI 63/63、typecheck、build 通過；本 step 與 Milestone 1 完成。

## Milestone 2 — 編輯試卷內容

前置：Milestone 1 驗收完成。目標：內容、題目勾選與跨大題排序可修改、儲存及還原。

- [x] **Phase 4 — 編輯 session 與自動儲存**

  - [x] **Step 4.1 — 建立有寫入權的 editing session**
    - 目標：僅 owner 分頁可以編輯，編輯事件有單一處理入口。
    - 實作：workspace 取得最新 JSON 與寫入權後開啟 Tiptap editable；其他分頁維持唯讀並顯示原因。session 綁定 projectId、revision 和 editor instance；切換 Project 時關閉舊 session，避免舊 callback 寫入新 Project。先建立內容變更與 dirty 狀態，不在 React render 中寫 DB。
    - 驗證：UI 測試 owner/non-owner、切換 Project 與舊 callback；雙分頁測試唯讀無法從快捷鍵修改。
    - Commit：`feat: Add guarded editor sessions`。
    - 進度紀錄（2026-10-24）：owner editor 已可編輯，非 owner 維持唯讀；session 以 Project、revision 與 editor instance 驗證變更，切換時關閉舊 session。新增 UI 與雙分頁 E2E 案例；UI 8/8、全套 unit 65/65、typecheck、build 通過，sub-agent review/testing 已執行。review 指出新節點 ID 應在後續儲存使用正規化快照；實際 browser E2E 依 SPEC 待指定，故 step 暫未勾選。
    - 驗收紀錄（2026-10-24）：使用者指定後執行完整 `npm run test:e2e`；Chromium／Firefox 的雙分頁唯讀案例通過，完整 E2E 22/22 通過。另有 UI 測試驗證切換 Project 後舊 callback 不會寫入；新節點 ID 已於 Step 4.2 回寫 editor。本 step 完成。

  - [x] **Step 4.2 — 實作 autosave 與 Project 更名**
    - 目標：編輯可自動儲存且失敗可見、可重試。
    - 實作：以 500–1500 ms debounce 排程，序列化每個 session 的 save，避免較舊 revision 覆蓋新內容。保存 metadata、JSON 與設定的相容快照；顯示 dirty/saving/saved/error。切換 Project 或離開 workspace 前等待 flush；失敗留在原頁並提供重試，關閉 browser 僅 best effort。更名走同一寫入權與錯誤處理。
    - 驗證：fake timers 測試 debounce、並行 save 順序、失敗重試、flush、rename；E2E 編輯與更名後 reload；quota 錯誤不能顯示 saved。
    - Commit：`feat: Autosave document changes safely`。
    - 進度紀錄（2026-10-24）：已加入 800 ms debounce、同一 session 序列化儲存、最新 revision flush、失敗與 quota 提示及重試、更名，以及 hash 路由離頁保護。新節點 ID 與題目預設勾選回寫 editor；`pagehide` 嘗試 flush，但瀏覽器關閉不保證完成。`npm test`（13 files／73 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過；sub-agent review/testing 已執行。Chromium／Firefox 實際 E2E 依 SPEC 待指定，故 step 暫未勾選。
    - 驗收紀錄（2026-10-24）：使用者指定後執行完整 `npm run test:e2e`；Chromium／Firefox 的編輯與更名後重開案例均通過，完整 E2E 22/22 通過。單元測試含 debounce、並行 save 順序、quota 失敗重試、flush 與 route guard；本 step 完成。

- [x] **Phase 5 — 文字、表格與圖片編輯**

  - [x] **Step 5.1 — 加入文字 toolbar、shortcuts 與 history**
    - 目標：可編輯段落、heading、marks、清單及對齊。
    - 實作：toolbar 呼叫 editor commands，依 selection 顯示狀態；加入粗體、斜體、底線、heading、段落、unordered list、對齊、undo/redo。`#` shortcut 建 heading，`- ` 和 `1. ` 均建立 unordered list；新建／複製節點維持 ID 唯一，不能把來源轉成 ordered list。IME 組字期間避免重建 editor。
    - 驗證：UI 測試 commands、shortcuts、undo/redo 與 saved JSON；E2E 編輯重載保留 marks。
    - Commit：`feat: Add rich text editing controls`。
    - 進度紀錄（2026-10-24）：已加入依 selection 更新狀態的文字 toolbar、heading／marks／對齊／unordered list commands、undo/redo，以及 `#`、`- `、`1. ` 捷徑。編輯 schema 禁用 ordered list，匯入解析仍支援 `<ol>` 正規化。`npm test`（14 files／77 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list` 通過；sub-agent review/testing 通過，並修正 E2E 儲存競態。依 SPEC 未執行真實瀏覽器；marks 重載 E2E 待指定，因此 step 保持待驗。
    - 驗收紀錄（2026-10-24）：使用者指定後執行完整 `npm run test:e2e`，Chromium／Firefox 的 marks 重載案例通過，完整 E2E 28/28、unit/UI 88/88、typecheck、build 通過。搭配既有 sub-agent review/testing，本 step 與 Phase 5 完成。

  - [x] **Step 5.2 — 加入基本表格編輯**
    - 目標：可建立表格、編輯文字、增刪列／欄及刪除表格。
    - 實作：使用已安裝開源 table extensions；提供必要 toolbar 並防止非法空表格。簡單矩形表格必須可編輯；合併儲存格等匯入特性依已記錄退化策略處理，不宣稱完整 Word 表格相容。確保表格可位於題目 item 內。
    - 驗證：UI 測試插入、儲存格輸入、增刪列欄、刪除與 undo；重載後結構相同，題目內表格通過 schema validation。
    - Commit：`feat: Add basic table editing`。
    - 進度紀錄（2026-10-24）：已加入 2×2 表格插入、儲存格編輯、增刪列欄及刪除表格；測試題目內表格的 schema validation、結構修改、undo 與保存後重新載入。`npm test`（14 files／79 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list`（26 cases）通過；sub-agent review/testing 通過。依 SPEC 未執行真實瀏覽器，表格重載 E2E 待指定，因此 step 保持待驗。
    - 驗收紀錄（2026-10-24）：使用者指定後，Chromium／Firefox 的表格編輯、離頁 flush 與重載案例均通過；完整 E2E 28/28、unit/UI 88/88、typecheck、build 通過。搭配既有 sub-agent review/testing，本 step 完成。

  - [x] **Step 5.3 — 加入本機圖片插入與刪除**
    - 目標：使用者新增的 PNG/JPEG 可儲存、重載與 undo。
    - 實作：共用匯入限制，先成功儲存 Blob 再插入 assetId 節點；失敗不插入壞引用。刪除只移除文件節點，session 期間保留 Blob；不要把 Base64 或 object URL 寫入 JSON。插入完成前保護 Project/session 身分，避免非同步結果串到另一份試卷。
    - 驗證：測試錯誤格式、超限、Blob 寫入失敗、換 Project 中完成上傳、刪除後 undo、重載仍可顯示圖片。
    - Commit：`feat: Add persistent image editing`。
    - 進度紀錄（2026-10-24）：已加入 PNG/JPEG 本機插入、Blob-first 寫入、共用圖片限制、Project/session 身分檢查，以及選取圖片後刪除與 undo。repository 在持有寫入權時單獨儲存 Blob，並檢查 Project 圖片總量。`npm test`（15 files／88 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list`（28 cases）通過；sub-agent review/testing 已執行，刪圖 UI 為 review 後補齊。若 Blob 寫入後 session 立即失效，可能留下未引用資產，待 Phase 7 補做清理。依 SPEC 未執行真實瀏覽器，新增圖片重載 E2E 待指定，因此 step 保持待驗。
    - 驗收紀錄（2026-10-24）：使用者指定後，Chromium／Firefox 的本機圖片插入、Blob 顯示與重載案例均通過；完整 E2E 28/28、unit/UI 88/88、typecheck、build 通過。搭配既有 sub-agent review/testing，本 step 完成；未引用資產仍依 Phase 7 清理。

- [x] **Phase 6 — 題目勾選與跨大題排序**

  - 驗收決定（2026-10-24）：使用者明確指定略過實際瀏覽器測試。Phase 6 依單元／UI 測試、typecheck、build、E2E 列舉及 sub-agent review/testing 完成；Chromium／Firefox 的勾選、拖曳與重開流程未執行，仍屬未驗證風險，不記為通過。

  - [x] **Step 6.1 — 題目 checkbox 與清單操作**
    - 目標：每個最外層 item 有可持久化的勾選狀態。
    - 實作：用 NodeView 或等價 editor UI 顯示 checkbox，透過 transaction 更新 selected；內嵌選項不顯示題目 checkbox。普通段落可透過清單工具轉成題目；新增題目 selected=true。維持 checkbox 與文字 selection 的互動，加入 history，完整來源仍保留未勾選題目。
    - 驗證：UI 測試新增、取消勾選、undo/redo、巢狀選項不獨立勾選；重載後 ID 與狀態不變。
    - Commit：`feat: Add persistent question selection`。
    - 進度紀錄（2026-10-24）：最外層題目已顯示 checkbox，transaction 更新 selected；內嵌選項不顯示 checkbox。已加入狀態、ID、undo/redo、編輯前文後切換與 selection 的 UI 測試，以及重新開啟的 E2E 案例。`npm test`（15 files／90 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list`（30 cases）通過。sub-agent review 發現的舊位置問題已修正並複審通過；testing 獨立通過。當時尚未獲得略過真實瀏覽器測試的指示，step 保持待驗。
    - 驗收紀錄（2026-10-24）：依使用者指定略過真實瀏覽器測試，以既有非瀏覽器驗證與 sub-agent review/testing 完成本 step；重開持久化 E2E 未執行，結果仍待驗。

  - [x] **Step 6.2 — 整題拖曳與跨大題移動**
    - 目標：一次移動完整題目，不能遺失子內容或改變題目 ID。
    - 實作：建立以 source item ID 與 target position 為輸入的 move command，再接拖曳 handle。以單一 transaction 搬移完整 subtree，保留 selected、圖片、表格與選項；支援同清單、不同大題與空大題的落點。使用 transaction mapping 或等價方式處理刪除後位移，禁止拖入自身子節點；移除空清單但保留 heading。
    - 驗證：command 單元測試前移後移、跨大題、空大題、無效落點、完整 subtree 相等；UI/E2E 拖曳後 undo/redo、重載檢查順序及圖片。
    - Commit：`feat: Move questions across exam sections`。
    - 進度紀錄（2026-10-24）：已建立以題目 ID 與目標位置為輸入的單一 transaction move command，以及題目拖曳把手；支援清單內前後移、跨大題、空大題，保留 ID、selected、選項、圖片及表格，移除空清單而保留 heading。單元／UI 測試涵蓋完整子樹、非法落點、巢狀選項、undo/redo；已列出跨大題拖曳、圖片與重開的 E2E 案例。`npm test`（16 files／96 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list`（32 cases）通過。sub-agent review 發現的內嵌選項落點問題已修正並複審通過；testing 獨立通過。當時尚未獲得略過真實瀏覽器測試的指示，step 與 Phase 6 保持待驗。
    - 驗收紀錄（2026-10-24）：依使用者指定略過真實瀏覽器測試，以既有非瀏覽器驗證與 sub-agent review/testing 完成本 step；拖曳與重開 E2E 未執行，結果仍待驗。

- [x] **Phase 7 — 資產清理與 Milestone 2 驗收**

  - [x] **Step 7.1 — 關閉分頁時清理孤立資產**
    - 目標：清理不用的圖片，同時保護 undo 與未勾選題目。
    - 實作：建立純函式遍歷完整 JSON 的 assetId 集合，以儲存後文件比對 assets。只由持有寫入權的分頁在關閉時 best effort 清理；flush 失敗就不刪。建立待清理標記／等價可恢復機制，下一次取得寫入權且未建立 history 前補清理；不以預覽投影計算引用，也不在一般刪圖、切換內容 Tab 時清 Blob。明確處理 browser 頁面暫存恢復，避免恢復中的 session 使用已清掉的 history。
    - 驗證：單元測試引用集合含未勾選題目、共享圖片、無引用圖片、save 失敗及無鎖；E2E 正常關閉及模擬未完成清理後重開。確認 session 中刪圖 undo 仍有效。
    - Commit：`feat: Clean unused assets after sessions`。
    - 進度紀錄（2026-10-24）：已加入完整 JSON assetId 收集、Dexie v3 待清理標記，以及持有寫入權時的原子清理；關閉先 flush，失敗保留標記，重開在建立 history 前補清理。BFCache 進入時仍嘗試 flush 而保留資產；失去 lease 且仍有未儲存內容時保留畫面並提示複製。unit/UI 測試涵蓋未勾選圖片、孤立圖片、無鎖、清理交易失敗、無效儲存文件、flush 失敗及 BFCache；新增正常離開、關閉分頁與中斷補清理 E2E。`npm test`（17 files／105 tests）、`npm run typecheck`、`npm run build`、`npm run test:e2e -- --list`（40 cases）通過；review 指出的 BFCache 風險已修正。依 SPEC 未啟動真實瀏覽器，E2E 待驗，step 保持待驗。
    - 驗收紀錄（2026-10-24）：使用者指定執行真實瀏覽器後，Chromium／Firefox 的離開 workspace、關閉分頁重開及中斷後補清理均通過；完整 E2E 42/42、unit/UI 105/105、typecheck、build 通過。sub-agent review/testing 已完成。關頁非同步 flush 仍為 best effort，資料庫中待清理標記提供下次取得寫入權時的補做路徑。

  - [x] **Step 7.2 — 驗收 Milestone 2 並更新文件**
    - 目標：教師可持續編輯而不遺失內容或覆寫別人的分頁。
    - 實作：整合多大題 fixture，包含選項、圖片、表格及未勾選題目；更新 README 編輯、更名、保存狀態、單一分頁與清理限制。加入完整編輯 session regression tests。
    - 驗證：匯入後修改文字／表格／圖片、勾選、跨大題移動、undo/redo、重載；雙分頁限制、失敗重試與關閉後補清理。執行相關 unit/UI/E2E、typecheck、build，記錄 sub-agent review 與已知限制。
    - Commit：`test: Verify persistent editing workflow`。
    - 進度紀錄（2026-10-24）：已新增多大題、巢狀選項、圖片、表格及未勾選題目的整合 fixture；加入完整 session 的持久化 unit test 與編輯、跨大題移動、undo/redo、重載 E2E；README 已更新操作、儲存與清理限制。unit/UI 105/105、typecheck、build 及 E2E 列舉 40 cases 通過。匯入後的編輯情境由既有匯入與編輯測試分別涵蓋，完整串接尚待真實瀏覽器整合驗收；Phase 7 與 Milestone 2 保持待驗。
    - 驗收紀錄（2026-10-24）：新增 DOCX 匯入後修改表格文字、插入本機圖片、等待 autosave 並重載的整合案例；修正勾選 undo 測試的 history 前置條件與表格輸入測試的 selection 同步等待。Chromium／Firefox 全套 E2E 42/42、unit/UI 105/105、typecheck、build 通過；sub-agent review/testing 無 blocker。極快的模擬鍵入可能早於 Chromium 將表格點擊同步到 editor selection；E2E 已等待工具列反映 selection，實際快速輸入仍有低風險時序限制。Phase 7 與 Milestone 2 完成。

## Milestone 3 — 排版預覽與列印／PDF

前置：Milestone 2 驗收完成。目標：同一份文件可選擇輸出樣式，提供連續預覽與 browser 原生列印。

- [x] **Phase 8 — 共用輸出轉換與頁面設定**

  - [x] **Step 8.1 — 建立純函式輸出 projection**
    - 目標：預覽、列印與後續 DOCX 使用相同篩選結果。
    - 實作：在 `domain/` 接受完整 JSON 與 outputListStyle，回傳新樹與穩定來源 ID；只過濾最外層未勾選題目，整個 subtree 一起去除。保留 heading、一般段落與姓名欄，空清單可省略；ordered 每個清單從 1 開始，內嵌選項仍 unordered。不得 mutate 或持久化結果，不重算配分。
    - 驗證：測試全勾選、部分／全不勾選、跨大題後排序、巢狀選項、空大題標題、來源 deep equality、輸出引用僅含保留的圖片。
    - Commit：`feat: Derive selected exam output`。
    - 進度紀錄（2026-10-24）：已加入純函式 projection，只篩選 doc 直屬清單的未勾選題目，保留其他內容與穩定 ID；ordered 清單各自從 1 開始，巢狀選項維持 unordered。單元測試涵蓋跨清單排序、空大題、來源不變與圖片引用。

  - [x] **Step 8.2 — 頁面設定與尺寸計算**
    - 目標：尺寸、方向、邊距、字級、行距與清單樣式可儲存。
    - 實作：建立共用紙張常數與有效寬高計算；TW_B4=265×379 mm，A4=210×297 mm，橫向交換。UI 寫回 pageSettings；預設 portrait、15 mm、12 pt、1.5、ordered。拒絕非有限數值、負邊距、非正字級／行距、使內容區域不為正的邊距；定義合理可輸入範圍並記錄。
    - 驗證：單元測試兩尺寸兩方向、有效內容寬高、非法輸入；UI/E2E 改設定重載後一致，儲存失敗可見。
    - Commit：`feat: Persist exam page settings`。
    - 進度紀錄（2026-10-24）：已加入 B4／A4 與直橫向有效尺寸計算，並在 workspace 提供設定 UI 與 autosave。輸入限制為邊距 0–100 mm、字級 6–72 pt、行距 0.5–4，內容寬高須大於 0。單元／UI 測試涵蓋尺寸、非法值、儲存失敗與重新開啟；頁面設定重載 E2E 在 Chromium／Firefox 均通過。
    - 驗收紀錄（2026-10-24）：使用者指定執行測試後，unit/UI 113/113、typecheck、build 通過。E2E 43/44 通過；使用者指定略過失敗的 Chromium 跨大題拖曳案例（Firefox 該案例通過）。依此完成 Phase 8；被略過案例不記為通過。

- [x] **Phase 9 — 唯讀預覽與局部格式**

  - [x] **Step 9.1 — 建立連續預覽 Tab**
    - 目標：只顯示輸出投影且切換 Tab 不遺失來源編輯狀態。
    - 實作：試卷內容保留完整 editor session；預覽用獨立 readonly renderer/instance，套用紙張內容寬度、邊距、字級、行距。不提供頁碼、文字輸入、貼上或題目拖曳。保留來源 editor selection 與 history；預覽 renderer 不觸發來源 autosave，圖片共用 resolver。
    - 驗證：UI/E2E 切換前後未儲存編輯、selection 附近內容與圖片不丟失；預覽鍵盤、paste 不改 JSON；只顯示勾選題目，兩清單樣式一致。
    - Commit：`feat: Add readonly layout preview`。
    - 驗收紀錄（2026-10-24）：Chromium／Firefox 的未儲存內容預覽、唯讀鍵盤操作、切回來源與 undo 案例通過。`npm test` 116/116、typecheck、build 通過；完整 E2E 47/48 通過，唯一失敗為既有 Chromium 跨大題拖曳案例，Firefox 通過。sub-agent review/testing 通過；本 step 驗收完成。

  - [x] **Step 9.2 — 透過來源 ID 修改局部格式**
    - 目標：預覽可調段落對齊／間距及圖片寬度，文字保持不可編輯。
    - 實作：預覽選取節點後使用工具列，依穩定 ID 找回完整來源節點，用窄範圍 transaction 更新格式屬性。為新增屬性補 schema defaults、validation 和持久化；設定圖片寬度上限，避免超出內容區。失效 ID 顯示錯誤而非寫錯節點；未來文字編輯可沿用映射，但本次不開放。
    - 驗證：測試局部格式只改指定節點、過濾後 index 不導致誤寫、未勾選題目內容未變、重開後還原；確認未引入第二份持久化 JSON。
    - Commit：`feat: Edit preview formatting by source ID`。
    - 驗收紀錄（2026-10-24）：Chromium／Firefox 的段落對齊、間距寫回及重開還原案例通過。單元測試涵蓋只更新指定 ID、被過濾題目造成的來源位置差異、失效 ID 與圖片寬度上限。`npm test` 116/116、typecheck、build 通過；完整 E2E 47/48 通過，失敗為既有 Chromium 跨大題拖曳案例，與本 step 無關。sub-agent review/testing 通過；本 step 驗收完成。

- [x] **Phase 10 — 列印／PDF 與 Milestone 3 驗收**

  - [x] **Step 10.1 — 建立 print stylesheet 與列印入口**
    - 目標：不論目前在哪個 Tab，列印均使用最新已勾選內容。
    - 實作：從當前完整 JSON 建立輸出快照，不只讀可能過時的 DB；共用 projection/rendering。動態產生 `@page` 實際 mm 尺寸與 margins，不使用會指向其他 B4 尺寸的命名值。`@media print` 隱藏所有 UI、checkbox、handles、可編輯外框；避免外層 fixed height/overflow 裁掉多頁內容，不重複套用內外邊距。圖片與必要字型就緒才呼叫 window.print，失敗提供重試；超高內容允許跨頁，不對整份文件強制 break-inside avoid。
    - 驗證：測試產生的尺寸與 CSS、print 呼叫前圖片載入等待、圖片失敗；browser print-media 檢查 UI 隱藏、非勾選內容不存在，內容 Tab 直接列印也正確。
    - Commit：`feat: Print selected exam content`。
    - 驗證紀錄（2026-10-24）：加入列印按鈕，先 flush 編輯 session，再由目前 editor JSON 建立輸出 projection 快照；內容與預覽 Tab 均可直接列印。列印 DOM 使用動態 `@page` mm 尺寸／邊距及獨立 print media CSS，移除 UI、checkbox、handles 與外框；圖片 placeholder 解析、圖片 decode、字型 ready 後才呼叫列印，錯誤可重試。`npm test -- --run src/features/layout/printDocument.test.ts src/features/projects/ProjectWorkspace.test.tsx`（10/10）、`npm run typecheck`、`npm run build` 通過。sub-agent review 修正圖片 resolver 非同步時序，複查無阻礙；sub-agent testing 獨立通過。原生預覽未實測，依使用者指示在 Step 10.2 略過。

  - [x] **Step 10.2 — 驗收列印並更新限制文件**
    - 目標：多頁試卷可完整列印或由 browser 存 PDF。
    - 實作：使用多頁 fixture 記錄 Chromium 與 Firefox 的紙張、方向、中文、圖片、表格跨頁人工檢查步驟與結果；加入 print CSS smoke tests。README 說明瀏覽器紙張／縮放可能覆寫設定、預覽不是逐頁結果，以及 PDF 透過原生列印儲存。
    - 驗證：兩紙張 × 兩方向都有檢查證據，無整頁裁切或 UI 混入。實際開啟兩 browser 列印預覽，必要時人工確認；Playwright media emulation 不等於原生列印已驗收。全不勾選仍保留一般標題／說明；執行相關測試、typecheck、build。
    - Commit：`test: Verify browser print layouts`。
    - 驗收紀錄（2026-10-24）：已加入四種紙張／方向的 CSS 尺寸 smoke tests、Chromium／Firefox 兩個 Tab 的 print-media E2E，以及 README 列印限制和 `docs/print-verification.md` 驗收矩陣。`npm test`（21 files／124 tests）、`npm run typecheck`、`npm run build`、列印 E2E（Chromium／Firefox 4/4）通過；build 有既有 bundle size warning。依使用者指示略過 Chromium／Firefox 原生列印預覽檢查，故原生 PDF 分頁、整頁裁切、中文／圖片／表格跨頁結果未驗；Playwright media emulation 僅驗證 print CSS。依計畫允許略過真實瀏覽器檢查並記錄風險，完成 Phase 10。

## Milestone 4 — 匯出 DOCX

前置：Milestone 3 驗收完成。目標：選定內容可下載為 Word／LibreOffice 可繼續編輯的 DOCX。

- [x] **Phase 11 — DOCX 語意 mapper**

  - [x] **Step 11.1 — 文字、標題與清單 mapping**
    - 目標：不靠畫面截圖即可產生可編輯文字。
    - 實作：建立獨立於 React 的 exporter，輸入完整 JSON/pageSettings，先呼叫共用 projection。拆成小 mapper：heading、paragraph、text marks、list；將 bold/italic/underline、alignment 等映射成 docx.js 元件。Ordered list 依 projection 的 start 延續題號，標題樣式不重設題號；巢狀選項維持 bullets。未知樣式保留文字並回報 warning。
    - 驗證：單元測試中文、多種 marks、跨分離清單的連續編號、unordered 與未勾選內容排除；生成文件的語意結構可讀，不以不穩定的整包 ZIP bytes snapshot 驗證。
    - Commit：`feat: Map exam text and lists to DOCX`。
    - 驗證紀錄（2026-10-25）：建立獨立 React 的語意 mapper，使用共用 projection；中文、heading、marks、換行、對齊、跨標題連續題號與巢狀 bullets 的 DOCX XML 測試 3/3、typecheck 通過。未知文字／block 樣式保留文字並回報 warning。sub-agent review 發現巢狀層級問題，修正後獨立 testing 與複查通過；超過 OOXML 九層的清單降為第九層並提示。JSZip 3.10.2 僅為直接測試依賴；未啟動瀏覽器。

  - [x] **Step 11.2 — 表格與嵌入圖片 mapping**
    - 目標：保留輸出範圍內可編輯表格和實際圖片。
    - 實作：table mapper 逐列逐格轉換子內容；圖片依投影使用的 assetId 讀 Blob/ArrayBuffer，對 PNG/JPEG 建 image run，換算寬高並保留比例。遵守文件化表格降級策略；缺少被引用資產須明確報錯，不靜默下載假成功檔案。未勾選題目的圖片不得被打包進 DOCX。
    - 驗證：測試題目內表格、巢狀文字、不同圖片尺寸、缺圖、同圖多次引用及被過濾資產；檢查 DOCX media entries 及 table 結構。
    - Commit：`feat: Export DOCX tables and image assets`。
    - 驗證紀錄（2026-10-25）：加入可編輯表格、合併欄列、格內清單及 PNG/JPEG mapping；圖片依投影讀取、同圖快取並維持比例，缺少／錯誤資產明確失敗。exporter tests 6/6、typecheck、build 通過（既有 bundle size warning）。XML／media entries 驗證涵蓋實際圖片 bytes、過濾圖片、表格結構及不同寬度；sub-agent review/testing 通過，無 blocker。表格欄寬採等分 logical columns 並提示，已記錄於 `docs/docx-export.md`；Office 人工驗收留待 Phase 12。

  - [x] **Step 11.3 — 紙張與段落格式 mapping**
    - 目標：輸出使用相同紙張方向、邊距與可映射樣式。
    - 實作：集中 mm/pt 與 docx.js 所需單位換算；設定 section size、orientation、margins、預設字級、行距、段落間距、圖片寬度。不重複交換 landscape 尺寸；專屬 CSS 無對應時提供合理退化與 warning，不把文字變成圖片。
    - 驗證：單元測試 TW_B4/A4、兩方向、15 mm 等邊距、字級／行距換算及局部格式；檢查產生的 section/paragraph properties，記錄數值容差。
    - Commit：`feat: Preserve DOCX page formatting`。
    - 驗證紀錄（2026-10-25）：集中 twips／half-point／line units／pixel 換算；section 套用 TW_B4/A4、兩方向與各邊邊距，docx 9.14 自行交換 landscape 尺寸，避免重複交換。預設字級、行距、局部對齊與段落間距、圖片寬高均有 XML 驗證；補上巢狀表格、超寬圖片限制與全不勾選表格／圖片案例。全套 `npm test`（24 files／149 tests）、typecheck、build、build:smoke 通過，sub-agent 獨立重跑與 review 通過，無 blocker。僅有既有 bundle size／Tiptap use client warnings；數值容差與降級策略見 `docs/docx-export.md`。未啟動瀏覽器，未執行 Office 人工驗收，兩者保留於 Phase 12；本 phase 不提供下載 UI。

- [ ] **Phase 12 — 下載整合與最終驗收**

  - [ ] **Step 12.1 — 匯出 UI 與 browser 下載**
    - 目標：以目前內容產生 `project-name.docx`，有進度與錯誤提示。
    - 實作：按下匯出時取得完整來源快照與設定，避免漏掉 debounce 中的最新修改；等待需要的資產，呼叫 mapper、Packer.toBlob 與 browser download。清理下載 object URL，處理檔名不合法字元，避免重複點擊。列出降級警告，不新增後端或上傳資料。
    - 驗證：UI/E2E 改字後立即匯出可見最新內容；檢查檔名、Blob、取消／失敗後可重試、warning 顯示、下載資源釋放；唯讀分頁匯出其目前已載入版本不取得寫入權。
    - Commit：`feat: Download editable exam DOCX files`。
    - 拆分交付：Step 12.1a 為 Blob 產生、檔名與下載資源清理；Step 12.1b 為可取消與重試的 UI，Step 12.1c 為 workspace 快照整合。各自 review／測試與提交，browser 驗證完成前原 step 保持待驗。
      - [x] Step 12.1a — Download service。
        - 驗證（2026-10-25）：Blob／檔名／下載 URL 清理測試 4/4、typecheck 通過；sub-agent review/testing 通過。取消僅抑制下載，不中止壓縮。
      - [x] Step 12.1b — Export UI。
        - 驗證（2026-10-25）：UI tests 4/4 涵蓋快照、重複點擊、取消後重試、失敗、warning 及卸載；sub-agent review/testing 通過。
      - [x] Step 12.1c — Workspace snapshot integration。
        - 驗證（2026-10-25）：workspace tests 確認未儲存 editor JSON 與唯讀已載入版本均可匯出，不要求儲存或重新取得寫入權。sub-agent review/testing 全套 unit/UI 166/166、typecheck、build 通過；僅既有 bundle size warning。Step 12.1 的實際 browser 下載仍待驗，原 step 不勾選。

  - [ ] **Step 12.2 — Golden samples 與完整回歸測試**
    - 目標：整條匯入、編輯、過濾、列印及匯出流程有自動化證據。
    - 實作：為六類 fixtures 加上預期文字、題目順序、選取狀態、圖片與表格數、頁面設定；使用測試工具讀取輸出 DOCX 結構，忽略 timestamp、隨機 ID 等非語意差異。整合跨大題移動與兩種清單輸出案例，對照 preview/print/export 的相同內容。
    - 驗證：完整 E2E：匯入 → 編輯 → 勾選／拖曳 → 重載 → 預覽 → print smoke → DOCX 下載；確認未勾選文字、表格及圖片皆不在輸出，但仍在來源。執行 unit/UI/E2E、typecheck、build。
    - Commit：`test: Cover complete exam export workflow`。

  - [ ] **Step 12.3 — Office 人工驗收與交付文件**
    - 目標：證明 DOCX 能在 Microsoft Word 與 LibreOffice 繼續編輯。
    - 實作：用兩套應用程式開啟 golden exports，修改並儲存文字，核對圖片、表格、清單、紙張方向與邊距；記錄應用程式版本、案例及結果。更新 README 所有操作、支援範圍、資料備份限制、已知降級及測試命令。
    - 驗證：兩套軟體均完成 smoke test；若環境缺少任一套，保留此 step 未完成並記錄待人工驗收，不能拿結構測試代替。sub-agent review 對照 SPEC 完成需求覆蓋檢查，全部通過後才勾選 Phase 12 與交付 Milestone 4。
    - Commit：`docs: Record Office compatibility results`。

## 實作時的官方參考

以下是查閱入口，不代表已驗證特定版本 API；安裝及實作時確認官方文件、套件授權和實際行為。

- Mammoth.js：https://github.com/mwilliamson/mammoth.js
- Tiptap：https://tiptap.dev/docs/editor/getting-started/overview
- ProseMirror：https://prosemirror.net/
- docx.js：https://docx.js.org/
- Dexie：https://dexie.org/
- DOMPurify：https://github.com/cure53/DOMPurify
- MDN Printing：https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Printing
- MDN `@page`：https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40page
