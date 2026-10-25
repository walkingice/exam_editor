import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../data/repository';
import { GEMINI_API_KEY_STORAGE_KEY, GEMINI_MODEL_STORAGE_KEY,
  AI_USER_INPUT_STORAGE_KEY } from '../../shared/storageKeys';
import { ReadOnlyEditor } from './ReadOnlyEditor';

const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'item-1' },
  content: [{ type: 'text', text: '原本題目' }] }] };
const repository = { getAsset: vi.fn() } as unknown as ProjectRepository;

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

it('disables AI when no API key is saved', async () => {
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository} editable />);
  expect(await screen.findByRole('button', { name: 'AI 項目 item-1' })).toBeDisabled();
});

it('saves the user direction and applies the latest Gemini result', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  window.localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, 'gemini-test');
  let finish!: (response: Response) => void;
  const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal('fetch', fetchMock);
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository} editable />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 項目 item-1' }));
  expect(screen.getByLabelText('Content')).toHaveValue('原本題目');
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
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('海洋題目')).toBeInTheDocument();
});

it('keeps the original item when cancelled', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  render(<ReadOnlyEditor projectId="project" content={content} repository={repository} editable />);
  fireEvent.click(await screen.findByRole('button', { name: 'AI 項目 item-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('原本題目')).toBeInTheDocument();
});
