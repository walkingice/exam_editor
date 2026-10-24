# Office compatibility acceptance

Status (2026-10-25): **pending**. Neither Microsoft Word nor LibreOffice was
found in `/Applications`; neither `libreoffice` nor `soffice` is on PATH.
No application was launched and no actual open/edit/save result is claimed.
Phase 12.3 and Milestone 4 remain incomplete. XML/media checks cannot prove
Office rendering or editing compatibility.

## Repeatable manual check

1. Import each of the six fixtures listed in `fixtures.md` into the app.
2. Export DOCX with ordered and unordered questions. For the Chinese question
   fixture, also move a question across a heading and deselect a question.
3. Export TW_B4 and A4 in portrait and landscape, with 15 mm margins.
4. In each application, record its exact version and open every export.
5. Check retained Chinese text, headings, marks, question order, nested bullets,
   PNG/JPEG images and aspect ratios, merged tables, and omitted questions.
6. Check paper dimensions, orientation, margins, font size, line height and
   local paragraph spacing. Compare semantic content with preview/print.
7. Edit a sentence and table cell, save as DOCX, close and reopen. Confirm
   both changes and embedded images remain editable/intact.
8. Record actual findings and any degradation below, with export filenames.

| Application/version | Cases | Open | Edit/save/reopen | Layout | Evidence |
| --- | --- | --- | --- | --- | --- |
| Microsoft Word (unavailable) | Six fixtures × output styles; paper matrix | Pending | Pending | Pending | None |
| LibreOffice (unavailable) | Six fixtures × output styles; paper matrix | Pending | Pending | Pending | None |

Known mapping differences and numeric tolerances are in `docx-export.md`.
Browser download E2E tests also require explicit user instruction before they
can run, according to SPEC. Existing native print limitations remain recorded
in `print-verification.md`.
