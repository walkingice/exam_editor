import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { ExportDocxButton } from './ExportDocxButton';
import { createDocxDownload, downloadBlob } from './downloadDocument';

vi.mock('./downloadDocument', async (original) => ({
  ...await original<typeof import('./downloadDocument')>(),
  createDocxDownload: vi.fn(), downloadBlob: vi.fn(),
}));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

const snapshot = () => ({ content: { type: 'doc', content: [{ type: 'paragraph',
  content: [{ type: 'text', text: 'Latest unsaved text' }] }] },
settings: structuredClone(DEFAULT_PAGE_SETTINGS), name: '期中/試卷' });
const readAsset = vi.fn();

it('captures the current source once, prevents duplicates, and displays warnings', async () => {
  let complete!: (value: { blob: Blob; warnings: string[] }) => void;
  vi.mocked(createDocxDownload).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const current = snapshot();
  render(<ExportDocxButton snapshot={() => current} readAsset={readAsset} />);
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  expect(createDocxDownload).toHaveBeenCalledOnce();
  expect(createDocxDownload).toHaveBeenCalledWith(current.content, current.settings, readAsset);
  expect(screen.getByRole('status')).toHaveTextContent('正在產生 DOCX');
  current.content.content[0].content[0].text = 'Later edit';
  expect(vi.mocked(createDocxDownload).mock.calls[0][0]).not.toEqual(current.content);
  const blob = new Blob(['docx']);
  await act(async () => complete({ blob, warnings: ['Table widths were simplified.'] }));
  expect(downloadBlob).toHaveBeenCalledWith(blob, '期中_試卷.docx');
  expect(screen.getByText('Table widths were simplified.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '匯出 DOCX' })).toBeEnabled();
});

it('suppresses a cancelled download and permits a fresh attempt', async () => {
  let complete!: (value: { blob: Blob; warnings: string[] }) => void;
  vi.mocked(createDocxDownload).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
  vi.mocked(createDocxDownload).mockResolvedValue({ blob: new Blob(), warnings: [] });
  render(<ExportDocxButton snapshot={snapshot} readAsset={readAsset} />);
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  fireEvent.click(screen.getByRole('button', { name: '取消匯出' }));
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  await act(async () => complete({ blob: new Blob(), warnings: ['Stale warning'] }));
  expect(downloadBlob).toHaveBeenCalledOnce();
  expect(screen.queryByText('Stale warning')).not.toBeInTheDocument();
});

it('reports asset failures and allows retry without downloading a failed result', async () => {
  vi.mocked(createDocxDownload).mockRejectedValueOnce(new Error('Missing referenced image asset'))
    .mockResolvedValueOnce({ blob: new Blob(), warnings: [] });
  render(<ExportDocxButton snapshot={snapshot} readAsset={readAsset} />);
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Missing referenced image asset');
  expect(downloadBlob).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('does not download after its workspace unmounts', async () => {
  let complete!: (value: { blob: Blob; warnings: string[] }) => void;
  vi.mocked(createDocxDownload).mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const view = render(<ExportDocxButton snapshot={snapshot} readAsset={readAsset} />);
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  view.unmount();
  await act(async () => complete({ blob: new Blob(), warnings: [] }));
  expect(downloadBlob).not.toHaveBeenCalled();
});
