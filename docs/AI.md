# Gemini API integration

This document records the current AI settings and the intended integration path for the 「試卷內容」 page. The editing interaction and prompt format are not finalized.

## Current settings

- The home page gear links to the `#/settings` page, which accepts a user supplied Gemini API key and a model choice. Both values are saved only when the user presses 「儲存」.
- Storage keys are defined in `src/shared/storageKeys.ts`: `mentor_exam_editor_api_key` and `mentor_exam_editor_model`. The API key is stored as plain text in browser `localStorage`; it is not encrypted. The key input is visible text.
- The initial model choices are `gemini-3.5-flash-lite` (default) and `gemini-3.8-flash`. These are UI defaults, not a guarantee that the API key can access them.
- 「⟳ Refresh」 is enabled when the input contains a nonempty API key. It uses the current input value, including changes not yet saved, and does not save the key or model choice.
- Refresh calls `GET https://generativelanguage.googleapis.com/v1beta/models` with the `x-goog-api-key` header. The response is filtered to models whose `supportedGenerationMethods` contains `generateContent`. The `models/` prefix is removed from each ID, duplicates are removed, and returned IDs are added to the two default choices.
- Refresh currently reads only the first response page. If the API returns `nextPageToken`, later pages are not loaded. The fetched list is kept in component state, so it is lost on page reload; the selected model ID is persisted separately.
- API failures are shown in the modal. Refresh does not call `generateContent` or validate the selected model through a generation request.

## Planned generation flow

On the 「試卷內容」 page, an item AI button is enabled when a saved API key exists. The button sits inside the item border and toggles an inline panel for that item. Multiple panels can stay open. Each displays the Default Prompt configured in Settings, a reusable User Input saved immediately in browser localStorage and synchronized across open panels, and an initially empty Result. Settings can save a custom Default Prompt or reset it to the system default; both changes take effect after saving Settings. The item's visible content is included in the request without duplicating it in the panel. Refresh sends these fields to the selected Gemini model through `generateContent`; another request cannot start for that item while one is pending. Apply replaces the item's content through an editor transaction, while Cancel collapses the panel without changing the document. A generated response is plain text, so applying it to a table or image replaces that item with a paragraph.

The content tab also provides 「全部修改✨」 when editing is available and an API key is saved. Its modal shares the fixed prompt and saved User Input with item panels. One `generateContent` request sends each nonempty text item with its stable ID and requests structured JSON containing the same IDs. The response must contain exactly one nonempty result for every sent ID. Valid results are applied in a single editor transaction, then the modal closes. Invalid or incomplete responses leave the document unchanged and show an error.

The intended browser request follows the same direct REST pattern as model discovery:

```text
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
Content-Type: application/json
x-goog-api-key: <user supplied key>
```

The request body uses `contents` with a text `part` containing the assembled prompt. Use the saved model ID without a `models/` prefix when building the URL. Check `response.ok`, surface API errors, and extract generated text from `candidates[].content.parts[]`; ignore parts without text or marked as thoughts. Confirm the response shape against the API when implementing this feature.

Only the text identified for a generation request, its prompt, and any context the UI explicitly discloses should be sent to Gemini. Do not send the full Project, images, or unrelated document content by default. Apply returned text through the editor's document operations so undo/redo, stable node IDs, dirty state, and autosave continue to work. Never treat generated text as trusted HTML.

## Implementation notes

- The application is a static frontend and calls Gemini directly from the browser with the user's own key. There is no application backend or OAuth flow.
- Project content remains in IndexedDB. AI settings in `localStorage` are separate from Project data and are not included in the DOCX export.
- A later implementation should decide how to handle missing keys, unavailable models, request cancellation, concurrent edits while a request is pending, and explicit user review before insertion.
