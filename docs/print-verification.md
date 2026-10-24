# Print verification

Print output uses the selected-content projection and the current editor snapshot.
The page size and margins are passed to `@page` in millimeters. Browser print
settings can override paper size, orientation, and scale. The continuous preview
does not promise the same page breaks as the final print or PDF. Long paragraphs,
tables, and images may split differently between Chromium and Firefox.

## Automated checks

`npm test -- --run src/features/layout/printDocument.test.ts` checks all four
TW_B4/A4 portrait/landscape dimensions, margins, print CSS, font/image readiness,
and missing-image errors. `tests/e2e/print.spec.ts` checks print-media visibility,
latest editor content, and printing from both workspace tabs in Chromium and
Firefox. Playwright media emulation is a CSS smoke test; it does not open or verify
the native print preview dialog.

## Native print preview matrix

Use `src/test/fixtures/docx/multi-page.docx` for the 120-paragraph page-break case
and `src/test/fixtures/docx/mixed-images.docx` plus `merged-table.docx` for image
and table layout. Import each fixture and open the native print preview. For
question fixtures, select all questions before printing. Repeat each case in
Chromium and Firefox and record application version, paper size, orientation,
Chinese text, image/table rendering, page count, and whether any page was clipped
or contained workspace UI.

| Browser | Paper | Orientation | Native preview result |
| --- | --- | --- | --- |
| Chromium | TW_B4 | Portrait | Pending manual inspection |
| Chromium | TW_B4 | Landscape | Pending manual inspection |
| Chromium | A4 | Portrait | Pending manual inspection |
| Chromium | A4 | Landscape | Pending manual inspection |
| Firefox | TW_B4 | Portrait | Pending manual inspection |
| Firefox | TW_B4 | Landscape | Pending manual inspection |
| Firefox | A4 | Portrait | Pending manual inspection |
| Firefox | A4 | Landscape | Pending manual inspection |

Do not treat a Playwright print-media screenshot or generated PDF as completion
of the native preview checks above.
