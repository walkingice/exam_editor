import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { AI_USER_INPUT_STORAGE_KEY, GEMINI_API_KEY_STORAGE_KEY,
  GEMINI_MODEL_STORAGE_KEY } from '../../shared/storageKeys';
import { DEFAULT_GEMINI_MODELS } from '../projects/geminiModels';

export const DEFAULT_AI_PROMPT = `你是一位台灣國中小學教師，正在準備考試題目。
為了把題目變得有趣，我會給你一個題目，以及修改的方向。

不改變題目的語意，測驗目的，也盡量不改變題目的形式符號，僅替換題目內的名詞或情境，讓題目更貼近我提供的修改方向。

直接回應修改的內容，不加上任何的贅詞、問候語、心得。
`;

function findItem(editor: Editor, id: string) {
  let found: { position: number; node: typeof editor.state.doc } | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs.id !== id) return true;
    found = { position, node };
    return false;
  });
  return found as { position: number; node: typeof editor.state.doc } | null;
}

function applyResult(editor: Editor, id: string, result: string): boolean {
  const item = findItem(editor, id);
  if (!item || !editor.isEditable) return false;
  const { schema } = editor.state;
  const text = result ? schema.text(result) : undefined;
  const replacement = item.node.type.name === 'listItem'
    ? item.node.type.create(item.node.attrs, [schema.nodes.paragraph.create(null, text),
      ...Array.from({ length: item.node.childCount - 1 }, (_, index) => item.node.child(index + 1))])
    : item.node.isTextblock
      ? item.node.type.create(item.node.attrs, text)
      : schema.nodes.paragraph.create({ id, selected: item.node.attrs.selected }, text);
  editor.view.dispatch(editor.state.tr.replaceWith(item.position,
    item.position + item.node.nodeSize, replacement));
  return true;
}

export function AIItemPanel({ editor, itemId, onClose }: {
  editor: Editor; itemId: string; onClose: () => void;
}) {
  const [userInput, setUserInput] = useState(() =>
    window.localStorage.getItem(AI_USER_INPUT_STORAGE_KEY) ?? '');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const item = findItem(editor, itemId);
  const content = item?.node.type.name === 'image' ? item.node.attrs.alt || '圖片'
    : item?.node.textBetween(0, item.node.content.size, '\n') ?? '';
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const syncInput = (event: Event) => setUserInput((event as CustomEvent<string>).detail);
    window.addEventListener('exam-ai-input', syncInput);
    return () => window.removeEventListener('exam-ai-input', syncInput);
  }, []);

  async function refresh() {
    if (request.current) return;
    const key = window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim();
    if (!key) { setError('請先設定 Gemini API key。'); return; }
    const model = window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || DEFAULT_GEMINI_MODELS[0];
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setResult('');
    setError('');
    try {
      const prompt = `${DEFAULT_AI_PROMPT}\n\n修改方向： ${userInput}\n\n原本題目：\n\n${content}`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: controller.signal,
      });
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Gemini API request failed (${response.status})`);
      const generated = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!generated) throw new Error('Gemini 未回傳文字內容。');
      setResult(generated);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '生成失敗。');
    } finally {
      if (request.current === controller) request.current = null;
      setLoading(false);
    }
  }

  return <section className="ai-item-panel" role="region" aria-label={`AI 修改項目 ${itemId}`}
      onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <label htmlFor={`ai-default-prompt-${itemId}`}>Default Prompt</label>
      <textarea id={`ai-default-prompt-${itemId}`} value={DEFAULT_AI_PROMPT} readOnly rows={5} />
      <label htmlFor={`ai-user-input-${itemId}`}>User Input</label>
      <textarea id={`ai-user-input-${itemId}`} ref={inputRef} value={userInput} rows={3} onChange={(event) => {
        setUserInput(event.target.value);
        window.localStorage.setItem(AI_USER_INPUT_STORAGE_KEY, event.target.value);
        window.dispatchEvent(new CustomEvent('exam-ai-input', { detail: event.target.value }));
      }} />
      <label htmlFor={`ai-result-${itemId}`}>Result</label>
      <textarea id={`ai-result-${itemId}`} value={result} readOnly rows={4} />
      {error && <p role="alert">{error}</p>}
      <div className="ai-item-panel-actions">
        <button type="button" disabled={loading} onClick={() => void refresh()}>
          {loading ? '處理中…' : 'Refresh'}</button>
        <button type="button" disabled={!result || loading || !item || !editor.isEditable}
          onClick={() => { if (applyResult(editor, itemId, result)) onClose(); }}>Apply</button>
        <button type="button" onClick={onClose}>Cancel</button>
      </div>
    </section>;
}
