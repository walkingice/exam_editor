import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../data/repository';
import { GEMINI_API_KEY_STORAGE_KEY, GEMINI_MODEL_STORAGE_KEY,
  AI_USER_INPUT_STORAGE_KEY } from '../../shared/storageKeys';
import { ReadOnlyEditor } from './ReadOnlyEditor';
import type { Editor } from '@tiptap/core';

const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'item-1' },
  content: [{ type: 'text', text: '原本題目' }] }] };
const repository = { getAsset: vi.fn() } as unknown as ProjectRepository;

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

it('disables AI when no API key is saved', async () => {
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository} editable />);
  expect(await screen.findByRole('button', { name: 'AI 項目 item-1' })).toBeDisabled();
});

it('expands inside the item, saves the direction, and applies the Gemini result', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, 'gemini-test');
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository} editable />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 項目 item-1' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'AI 修改項目 item-1' })
    .closest('.document-item-border')).toBeInTheDocument();
  expect(screen.queryByLabelText('Content')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Result')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('User Input'), { target: { value: '改成海洋情境' } });
  expect(window.localStorage.getItem(AI_USER_INPUT_STORAGE_KEY)).toBe('改成海洋情境');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(screen.getByRole('button', { name: '處理中…' })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('/models/gemini-test:generateContent');
  expect(options.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' });
  expect(JSON.parse(options.body as string).contents[0].parts[0].text)
    .toContain('修改方向： 改成海洋情境\n\n原本題目：\n\n原本題目');
  finish({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '海洋題目' }] } }] }) } as Response);
  await waitFor(() => expect(screen.getByLabelText('Result')).toHaveValue('海洋題目'));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.queryByRole('region', { name: 'AI 修改項目 item-1' })).not.toBeInTheDocument();
  expect(screen.getByText('海洋題目')).toBeInTheDocument();
});

it('keeps the original item when cancelled', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository} editable />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 項目 item-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('region', { name: 'AI 修改項目 item-1' })).not.toBeInTheDocument();
  expect(screen.getByText('原本題目')).toBeInTheDocument();
});

it('keeps each item expanded independently and shares the user direction', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  const twoItems = { type: 'doc', content: [content.content[0],
    { type: 'paragraph', attrs: { id: 'item-2' },
      content: [{ type: 'text', text: '第二題' }] }] };
  render(<ReadOnlyEditor projectId="project" content={twoItems} repository={repository} editable />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 項目 item-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'AI 項目 item-2' }));
  expect(screen.getAllByRole('region', { name: /AI 修改項目/ })).toHaveLength(2);
  fireEvent.change(screen.getAllByLabelText('User Input')[0], { target: { value: '校園情境' } });
  expect(screen.getAllByLabelText('User Input')[1]).toHaveValue('校園情境');
  fireEvent.click(screen.getByRole('button', { name: 'AI 項目 item-1' }));
  expect(screen.getByRole('region', { name: 'AI 修改項目 item-2' })).toBeInTheDocument();
});

it('keeps an expanded panel attached when the editor replaces its node view', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  let editor!: Editor;
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository}
    editable onEditor={(current) => { editor = current; }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 項目 item-1' }));
  editor.commands.setContent({ type: 'doc', content: [{ type: 'heading', attrs: { id: 'item-1', level: 2 },
    content: [{ type: 'text', text: '更新題目' }] }] });
  await waitFor(() => expect(screen.getByRole('region', { name: 'AI 修改項目 item-1' })
    .closest('.document-item-border')).toContainElement(
    screen.getByRole('heading', { name: '更新題目' })));
});
