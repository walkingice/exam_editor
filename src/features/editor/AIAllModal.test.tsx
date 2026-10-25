import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AI_DEFAULT_PROMPT_STORAGE_KEY, AI_USER_INPUT_STORAGE_KEY, GEMINI_API_KEY_STORAGE_KEY,
  GEMINI_MODEL_STORAGE_KEY } from '../../shared/storageKeys';
import { editingExtensions } from './schema';
import { AIAllModal } from './AIAllModal';
import { applyAIItems, collectAIItems } from './aiBatchItems';

function createEditor() {
  return new Editor({ element: document.createElement('div'), extensions: editingExtensions,
    content: { type: 'doc', content: [
      { type: 'paragraph', attrs: { id: 'first' }, content: [{ type: 'text', text: '第一題' }] },
      { type: 'bulletList', content: [{ type: 'listItem', attrs: { id: 'second' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: '第二題' }] }] }] },
    ] } });
}

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

it('maps a structured response by ID and applies all items in one transaction', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, 'gemini-test');
  window.localStorage.setItem(AI_DEFAULT_PROMPT_STORAGE_KEY, '自訂提示詞');
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  const editor = createEditor();
  const dispatch = vi.spyOn(editor.view, 'dispatch');
  const onClose = vi.fn();
  render(<AIAllModal editor={editor} onClose={onClose} />);
  expect(screen.getByText('自訂提示詞')).toBeInTheDocument();
  expect(screen.getByText('顯示提示詞').closest('details')).not.toHaveAttribute('open');
  expect(screen.getByLabelText('User Input')).toHaveAttribute('placeholder',
    '範例：把敘述換成寶可夢相關的文字');
  fireEvent.change(screen.getByLabelText('User Input'), { target: { value: '海洋' } });
  expect(window.localStorage.getItem(AI_USER_INPUT_STORAGE_KEY)).toBe('海洋');
  fireEvent.click(screen.getByRole('button', { name: 'AI 改寫' }));
  expect(screen.getByRole('button', { name: 'AI 改寫中…' })).toBeDisabled();
  const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('/models/gemini-test:generateContent');
  const body = JSON.parse(options.body as string);
  expect(body.contents[0].parts[0].text).toContain('自訂提示詞');
  expect(body.generationConfig.responseMimeType).toBe('application/json');
  expect(body.contents[0].parts[0].text).toContain('"id":"second","content":"第二題"');
  finish({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text:
    JSON.stringify({ items: [{ id: 'second', content: '海洋第二題' },
      { id: 'first', content: '海洋第一題' }] }) }] } }] }) } as Response);
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(collectAIItems(editor).map(({ id, content }) => ({ id, content }))).toEqual([
    { id: 'first', content: '海洋第一題' }, { id: 'second', content: '海洋第二題' },
  ]);
  expect(dispatch).toHaveBeenCalledOnce();
  editor.destroy();
});

it('rejects missing or duplicate IDs without changing the document', () => {
  const editor = createEditor();
  const source = collectAIItems(editor);
  const before = editor.getJSON();
  expect(() => applyAIItems(editor, source, [{ id: 'first', content: '修改' }]))
    .toThrow('題目數量不符');
  expect(() => applyAIItems(editor, source, [
    { id: 'first', content: '修改' }, { id: 'first', content: '重複' },
  ])).toThrow('題目 ID 或內容無效');
  expect(editor.getJSON()).toEqual(before);
  editor.destroy();
});

it('sends only the parent question text for a list with nested content', () => {
  const editor = new Editor({ element: document.createElement('div'), extensions: editingExtensions,
    content: { type: 'doc', content: [{ type: 'bulletList', content: [
      { type: 'listItem', attrs: { id: 'parent' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: '主題' }] },
        { type: 'bulletList', content: [{ type: 'listItem', attrs: { id: 'nested' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '子題' }] }] }] },
      ] },
    ] }] } });
  expect(collectAIItems(editor).map(({ id, content }) => ({ id, content })))
    .toEqual([{ id: 'parent', content: '主題' }]);
  editor.destroy();
});
