# Document dependencies

The versions below are exact direct dependencies in `package.json` and
`package-lock.json`, checked on 2026-10-24 with Node.js 24.18.0 and npm 11.18.0.
License values were checked against the installed package metadata. The
linked upstream projects document their licensing and browser use.

| Package | Version | License | Role |
| --- | --- | --- | --- |
| `@tiptap/core`, `@tiptap/react`, `@tiptap/starter-kit` | 3.32.0 | MIT | Editor and React integration |
| `@tiptap/extension-text-align`, `@tiptap/extension-image`, `@tiptap/extension-table` | 3.32.0 | MIT | Alignment, images, and tables |
| `mammoth` | 1.13.0 | BSD-2-Clause | DOCX import |
| `dompurify` | 3.4.17 | MPL-2.0 OR Apache-2.0 | HTML sanitization |
| `dexie` | 4.4.7 | Apache-2.0 | IndexedDB storage |
| `docx` | 9.14.0 | MIT | DOCX export |

StarterKit already includes heading, bullet and ordered lists, bold, italic,
underline, and undo/redo. It also installs the related list and text nodes.
Do not register these again. `TableKit` provides the table, row, cell, and
header nodes; image and text alignment are separate open source extensions.
No paid Tiptap features or remote conversion service are included.

`mammoth` ships its declaration at `lib/index.d.ts`; DOMPurify, Dexie, docx,
and Tiptap ship their own declarations. No separate `@types` package is needed.

`npm run build:smoke` bundles the document dependencies as a separate browser
target. It passed without a Node-only external module warning; the output is
ignored by Git. Vite emitted a `use client` directive warning from
`@tiptap/react`; this smoke build alone does not verify runtime behavior.
Chromium and Firefox workflow regression was subsequently confirmed by the user.

Sources: [Tiptap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit),
[Tiptap core license](https://github.com/ueberdosis/tiptap/tree/main/packages/core),
[Mammoth](https://github.com/mwilliamson/mammoth.js),
[DOMPurify](https://github.com/cure53/DOMPurify),
[Dexie license](https://github.com/dexie/Dexie.js/blob/master/LICENSE),
[docx license](https://github.com/dolanmiu/docx/blob/master/LICENSE).

JSZip 3.10.2 (MIT OR GPL-3.0-or-later; used under MIT) is a pinned
devDependency for semantic DOCX ZIP inspection in unit tests. It was
already a transitive dependency of docx and Mammoth. Export runtime uses
docx directly, without importing JSZip.
