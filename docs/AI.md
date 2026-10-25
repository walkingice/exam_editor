# Gemini AI integration

The content editor calls Gemini directly from the browser when the user requests a rewrite. The application has no AI backend. Project content stays in IndexedDB; AI settings and the shared rewrite direction stay in browser `localStorage`.

## Settings and model discovery

- The home page gear opens `#/settings`. The user supplies a Gemini API key, chooses a model, and may edit or reset the default prompt. These values are saved when the user presses 「儲存設定」. The key is visible in the input and stored as plain text; it is not encrypted.
- Storage keys are defined in `src/shared/storageKeys.ts`: `mentor_exam_editor_api_key`, `mentor_exam_editor_model`, `mentor_exam_editor_ai_default_prompt`, and `mentor_exam_editor_ai_user_input`.
- The initial model choices are `gemini-3.5-flash-lite` (default) and `gemini-3.8-flash`. These are UI defaults, not proof that a key can access them.
- 「Refresh」 uses the current key input without saving it. It calls `GET https://generativelanguage.googleapis.com/v1beta/models` with `x-goog-api-key`, keeps models that support `generateContent`, removes the `models/` prefix, and adds them to the default choices.
- Discovery reads only the first response page. The fetched list is lost on reload; the selected model ID is saved separately. Refresh does not perform a generation request to confirm model access.

## Single item rewrite

With an API key saved, editable content items have an AI button. Its inline panel shows the saved default prompt, a shared User Input, an initially empty Result, and 「AI 改寫」／「套用」 actions. Multiple item panels may stay open. User Input is saved immediately and synchronized between open panels. A page-break item currently displays an AI action but has no panel host, so that action cannot open a rewrite panel.

「AI 改寫」 sends the prompt, direction, and that item's text to the selected model. For an image, it sends the alt text or 「圖片」; it does not upload image bytes. A second request for the same panel is blocked while one is pending. The returned text is shown in Result and changes the document only after the user presses 「套用」. Applying replaces a text block's text, replaces a list item's first paragraph while retaining later child blocks, or replaces another block such as a table or image with a paragraph. The editor transaction participates in undo/redo and autosave. Closing the panel aborts a pending request.

## Whole-document rewrite

「修改全部內容」 is available in the content tab when editing is allowed and an API key is saved. It collects every nonempty top-level text item and list item, including items excluded from output, then sends each stable ID and text in one request. The request asks Gemini for JSON with the same IDs. The response must contain exactly one nonempty result per ID; invalid or incomplete results leave the document unchanged.

Valid results replace the collected items immediately in one editor transaction; there is no result preview or second confirmation. Undo can revert the transaction. For list items, later child blocks remain. Other non-text blocks with collected text may become paragraphs. The modal closes after a successful application. Closing it aborts a pending request. Adding or removing an item or changing its ID during the request is rejected; reordering existing IDs is allowed. Edits to an existing item's text are not compared with the original request text.

## Request and limits

Both rewrite paths send a `POST` request to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with `Content-Type: application/json` and the user's key in `x-goog-api-key`. They read text from the first candidate's content parts. Whole-document rewrite requests JSON using `responseMimeType` and `responseSchema`; single-item rewrite accepts plain text. API failures and invalid responses appear in the UI.

Only a user-initiated request sends the prompt, direction, and relevant item text or IDs to Gemini. Image Blob data, the full Project record, and unrelated assets are not sent. Generated text is inserted as text, never as trusted HTML. The single-item result can be reviewed before applying it. Whole-document results apply immediately, so review the edited document afterward and use undo if needed. A rewrite can remove original inline formatting or replace a table/image block.

Current limits: model discovery has no pagination; default model availability is not checked in advance; live Gemini responses depend on the selected model and key. Automated tests mock the API and do not establish live service compatibility.
