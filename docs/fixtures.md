# DOCX acceptance fixtures

Run `node scripts/generate-docx-fixtures.mjs` from the repository root to regenerate
the six DOCX files in `src/test/fixtures/docx/`. All text and images are synthetic;
there is no student data. The source images are `src/test/fixtures/large.png`
(5,000 × 5,000 white PNG) and `src/test/fixtures/red.jpg` (1 × 1 red JPEG),
both generated with ImageMagick. The generated DOCX files are committed so tests
can run without ImageMagick. Regeneration can change ZIP timestamps and binary
hashes while preserving the same document content.

| Fixture | Expected preservation | Expected degradation / review |
| --- | --- | --- |
| `chinese-questions.docx` | Chinese h1, two question items, nested option | Word list indentation may differ |
| `mixed-marks.docx` | Bold, italic, explicit underline | Other Word character styling is not modeled |
| `mixed-images.docx` | Large PNG and small JPEG as distinct assets in order | Layout and original display dimensions may differ |
| `merged-table.docx` | Two-column span, two-row span, cell text | Complex table layout can differ |
| `multi-page.docx` | All 120 paragraphs, including the last | Original page breaks are not retained |
| `unsupported-elements.docx` | Ordinary heading text and Mammoth equation warning | Equation, text box, and shape content may be omitted; review the source |

`npm test` parses every committed fixture through the import adapter and
normalizer. Browser import, reload, and close/reopen remain pending until
real-browser testing is explicitly requested.
