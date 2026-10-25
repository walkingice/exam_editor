import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { AI_USER_INPUT_STORAGE_KEY, GEMINI_API_KEY_STORAGE_KEY,
  GEMINI_MODEL_STORAGE_KEY } from '../../shared/storageKeys';
import { DEFAULT_GEMINI_MODELS } from '../projects/geminiModels';
import { getAIPrompt } from '../../shared/aiPrompt';
import { applyAIItems, collectAIItems, type AIItem } from './aiBatchItems';

const resultSchema = { type: 'OBJECT', properties: { items: { type: 'ARRAY',
  items: { type: 'OBJECT', properties: { id: { type: 'STRING' },
    content: { type: 'STRING' } }, required: ['id', 'content'] } } }, required: ['items'] };

export function AIAllModal({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [userInput, setUserInput] = useState(() =>
    window.localStorage.getItem(AI_USER_INPUT_STORAGE_KEY) ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const syncInput = (event: Event) => setUserInput((event as CustomEvent<string>).detail);
    window.addEventListener('exam-ai-input', syncInput);
    return () => window.removeEventListener('exam-ai-input', syncInput);
  }, []);

  async function rewriteAll() {
    if (request.current) return;
    const key = window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim();
    if (!key) { setError('請先設定 Gemini API key。'); return; }
    const items = collectAIItems(editor);
    if (!items.length) { setError('沒有可修改的題目內容。'); return; }
    const model = window.localStorage.getItem(GEMINI_MODEL_STORAGE_KEY) || DEFAULT_GEMINI_MODELS[0];
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const prompt = `${getAIPrompt()}\n\n修改方向： ${userInput}\n\n`+
        '請逐題改寫下列 items，只回傳 JSON。保留每個 id，不能新增、刪除或合併題目。\n\n'
        + JSON.stringify({ items: items.map(({ id, content }) => ({ id, content })) });
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: resultSchema } }),
        signal: controller.signal,
      });
      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message || `Gemini API request failed (${response.status})`);
      const generated = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!generated) throw new Error('Gemini 未回傳文字內容。');
      const parsed = JSON.parse(generated) as { items?: AIItem[] };
      if (!Array.isArray(parsed.items)) throw new Error('AI 回傳格式不正確。');
      applyAIItems(editor, items, parsed.items);
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '全部修改失敗。');
    } finally {
      if (request.current === controller) request.current = null;
      setLoading(false);
    }
  }

  return <div className="settings-backdrop" role="presentation">
    <section className="settings-modal ai-all-modal" role="dialog" aria-modal="true"
      aria-label="修改全部內容" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <h2>修改全部內容</h2>
      <details className="ai-default-prompt">
        <summary>顯示提示詞</summary>
        <div>{getAIPrompt()}</div>
      </details>
      <label htmlFor="ai-all-user-input">User Input</label>
      <textarea id="ai-all-user-input" ref={input} value={userInput} rows={3}
        placeholder="範例：把敘述換成寶可夢相關的文字" onChange={(event) => {
          setUserInput(event.target.value);
          window.localStorage.setItem(AI_USER_INPUT_STORAGE_KEY, event.target.value);
          window.dispatchEvent(new CustomEvent('exam-ai-input', { detail: event.target.value }));
        }} />
      {error && <p role="alert">{error}</p>}
      <div className="ai-all-modal-actions">
        <button type="button" disabled={loading} onClick={() => void rewriteAll()}>
          {loading ? 'AI 改寫中…' : 'AI 改寫'}</button>
        <button type="button" onClick={onClose}>取消</button>
      </div>
    </section>
  </div>;
}
