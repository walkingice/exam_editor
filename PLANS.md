# 試卷編輯器 — 待驗收與細節調整

功能規格見 [SPEC.md](SPEC.md)。原實作計畫已完成的開發步驟與歷史紀錄已移除；本文件只追蹤尚缺實測證據的驗收與需觀察的細節，不代表需要重新實作。

## 驗收規則

- 只有使用者明確指定時才啟動真實瀏覽器；本次文件整理不包含執行 browser 或 Office 驗收。
- 未執行或曾依使用者指示略過的檢查，不能記為通過。完成後記錄日期、版本、案例、命令與結果；問題修正需附回歸測試與 sub-agent review/testing。
- 自動測試、print-media emulation 與 DOCX XML/media 檢查不能取代原生列印及 Office 實際操作。

## Browser 下載與完整流程回歸

匯出 service、UI、最新快照整合與六類 golden semantic samples 均已完成。既有紀錄為 unit/UI 166/166、typecheck、build 通過；Playwright 可列舉 Chromium／Firefox 共 58 案，但新增匯出流程與當前完整 E2E 尚未實際執行。先前 42 案 E2E 與列印 media 檢查曾通過，不能據此宣稱新增案例通過。

- [ ] 在 Chromium／Firefox 執行 `npm run test:e2e`，確認匯入 → 編輯 → 勾選／跨標題拖曳 → 重載 → 預覽 → print smoke → DOCX 下載完整流程。案例見 `tests/e2e/export-docx.spec.ts`；同時回歸既有 CRUD、寫入權、清理及編輯流程。
- [ ] 驗證 ordered／unordered 輸出、部分及全部取消勾選：文字、圖片與表格的排除結果在 preview／print／DOCX 一致，來源仍完整保留；另驗證 heading、姓名欄／說明段落及獨立圖片／表格等非題目頂層項目的勾選過濾。
- [ ] 驗證修改後立即下載包含最新內容、檔名與 Blob 正確、唯讀分頁匯出已載入版本，以及實際 browser 的重複操作、取消／失敗重試與 warning 顯示。
- [ ] 配合最終回歸執行 `npm test`、`npm run typecheck`、`npm run build`；若修改依賴或打包相關設定，另跑 `npm run build:smoke`。

## 原生列印／PDF

曾依使用者指示略過原生列印預覽；既有 print-media E2E 只證明 CSS 與內容投影，尚無原生 PDF 分頁及裁切結果。

- [ ] 依 [列印驗收矩陣](docs/print-verification.md)，在 Chromium／Firefox 各檢查 TW_B4／A4、直向／橫向，使用多頁、圖片與合併表格 fixtures。
- [ ] 核對中文、圖片比例、表格跨頁、內容是否裁切、操作 UI 是否隱藏；另存 PDF 後檢查實際頁面。記錄 browser 版本、紙張、縮放與結果，區分 browser 對話框覆寫設定的影響。

## Word／LibreOffice 相容性

尚未實際開檔、編輯或儲存；先前環境未找到 Microsoft Word／LibreOffice。結構測試已完成，不代替以下驗收。

- [ ] 依 [Office 驗收矩陣](docs/office-verification.md)，在 Microsoft Word 與 LibreOffice 開啟六類 fixture 的匯出結果，涵蓋兩種清單、跨標題移動、取消勾選及紙張／方向設定。
- [ ] 核對文字、heading、marks、連續題號、巢狀選項、PNG/JPEG、合併表格、邊距、字級、行距與局部格式；對照 [已知 mapping 降級與容差](docs/docx-export.md)。
- [ ] 修改文字與儲存格、另存 DOCX、關閉再開啟，確認修改與圖片保留，記錄應用程式版本、檔名及證據。

## 操作細節與交付核對

- [ ] 重跑 Chromium 跨標題拖曳案例：先前 Phase 8／9 的完整 E2E 曾分別為 43/44、47/48，此案失敗後依使用者指示略過，Firefox 通過；目前尚未證明 Chromium 問題已解決。另觀察點選表格後立即快速輸入的 selection 同步；既有 E2E 已加入 selection 等待，實際快速操作仍需確認，重現後補回歸案例並修正。
- [ ] 依實測更新 README、列印及 Office 驗收文件的結果與限制；目前 README 的舊 Milestone／Phase 用語及「功能順序與驗證紀錄」連結說明亦需在交付時整理。
- [ ] 最後對照 SPEC 做需求覆蓋 review，確認各待驗項目有結果或明確保留的限制，不能以文件或測試案例存在視為驗收完成。
