# DOCX semantic mapping

`mapExamDocument(source, settings, readAsset?)` is independent of React and
returns a docx `Document` and deduplicated warning strings. Callers must scope
`readAsset(assetId)` to the current project. The mapper applies the shared
output projection before reading assets. It does not write to storage or
start a download. The download UI belongs to Phase 12.

Text, headings, emphasis, alignment, breaks, lists, and tables remain editable.
Each separated ordered list starts at the projection's continuous question
number. Nested options remain bullets, with nesting capped at nine levels
(the OOXML limit); deeper lists produce a warning. Links retain their visible
text with a warning. Blockquote and code-block styling falls back to ordinary
paragraphs with a warning; horizontal rules become paragraph borders.

Tables preserve row/cell content, horizontal and vertical merges, and header
rows. Browser-specific cell widths are replaced with equal logical columns
and produce a warning. Complex CSS and exact browser table layout are not
preserved. Nested tables end with a required empty paragraph in the parent
cell. Word and LibreOffice rendering still require Phase 12 manual acceptance.

Only referenced PNG/JPEG assets are read and embedded. Repeated references
share one asset read per export. Missing, unsupported, or invalid referenced
assets reject the export. An image's explicit width uses millimetres; otherwise
its intrinsic pixels use 96 DPI. Images retain their aspect ratio and fit the
available content width and page content height, including narrower table
cells and question indentation. No source image bytes are resized or replaced.

Tests unpack generated DOCX files with JSZip and inspect semantic XML/media,
without snapshots of timestamps, random relationship IDs, or complete ZIP bytes.
