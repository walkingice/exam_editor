import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectLease, type ProjectOwnership } from '../../data/ownership';
import type { ProjectBundle, ProjectRepository } from '../../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { normalizeDocument } from '../../domain/document';
import { ProjectWorkspace } from './ProjectWorkspace';
import { createDocxDownload, downloadBlob } from '../export-docx/downloadDocument';

vi.mock('../export-docx/downloadDocument', async (original) => ({
  ...await original<typeof import('../export-docx/downloadDocument')>(),
  createDocxDownload: vi.fn(async () => ({ blob: new Blob(), warnings: [] })),
  downloadBlob: vi.fn(),
}));

const editorProps = vi.hoisted(() => ({
  current: [] as Array<{ onChange?: (editor: Editor) => void;
    onEditor?: (editor: Editor) => void; editable?: boolean }>,
}));

vi.mock('../editor/ReadOnlyEditor', () => ({
  ReadOnlyEditor: (props: typeof editorProps.current[number]) => {
    editorProps.current.push(props);
    return <div data-testid="editor" data-editable={String(props.editable)} />;
  },
}));

vi.mock('../editor/ensureNodeIds', () => ({ ensureNodeIds: () => false }));

function bundle(id: string): ProjectBundle {
  return { project: { id, name: id, createdAt: 1, updatedAt: 1,
    pageSettings: DEFAULT_PAGE_SETTINGS, schemaVersion: 1 },
  document: createEmptyDocument(id), assets: [] };
}

afterEach(() => { cleanup(); vi.useRealTimers(); editorProps.current.length = 0; });

it('ignores a callback from a project closed before switching', async () => {
  const repository = { get: vi.fn(async (id: string) => bundle(id)),
    beginSession: vi.fn(async (id: string) => bundle(id)),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  const view = render(<ProjectWorkspace key="first" projectId="first"
    repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  const stale = editorProps.current.at(-1)!;
  const editor = { getJSON: () => bundle('first').document.content } as Editor;
  stale.onEditor?.(editor);
  view.rerender(<ProjectWorkspace key="second" projectId="second"
    repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'second' });
  await waitFor(() => expect(screen.getByTestId('editor')).toHaveAttribute('data-editable', 'true'));
  vi.useFakeTimers();
  await act(async () => {
    stale.onChange?.(editor);
    await vi.advanceTimersByTimeAsync(801);
  });
  expect(repository.save).not.toHaveBeenCalled();
});

it('flushes on BFCache entry while retaining assets for the live history', async () => {
  const repository = { get: vi.fn(async () => bundle('first')),
    beginSession: vi.fn(async () => bundle('first')),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  await act(async () => {
    const event = new Event('pagehide') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
  });
  await waitFor(() => expect(repository.save).toHaveBeenCalledOnce());
  expect(repository.finishSession).not.toHaveBeenCalled();
});

it('keeps cleanup pending when the closing flush fails', async () => {
  const repository = { get: vi.fn(async () => bundle('first')),
    beginSession: vi.fn(async () => bundle('first')),
    finishSession: vi.fn(async () => {}),
    save: vi.fn(async () => { throw new Error('Storage failed'); }) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  await act(async () => { window.dispatchEvent(new Event('pagehide')); });
  await waitFor(() => expect(repository.save).toHaveBeenCalledOnce());
  expect(repository.finishSession).not.toHaveBeenCalled();
});

it('preserves an unsaved BFCache session after its lease expires', async () => {
  const lease = new ProjectLease('first');
  const repository = { get: vi.fn(async () => bundle('first')),
    beginSession: vi.fn(async () => bundle('first')),
    finishSession: vi.fn(async () => {}),
    save: vi.fn(async () => { throw new Error('Storage failed'); }) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (_id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease, value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Unsaved' } });
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  await act(async () => { window.dispatchEvent(new Event('pagehide')); });
  await waitFor(() => expect(repository.save).toHaveBeenCalledOnce());
  lease.invalidate();
  await act(async () => {
    const event = new Event('pageshow') as PageTransitionEvent;
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
  });
  expect(repository.beginSession).toHaveBeenCalledOnce();
  expect(screen.getByRole('heading', { name: 'Unsaved' })).toBeInTheDocument();
  expect(screen.getByText(/請先複製內容/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新取得寫入權' })).toBeNull();
});

it('saves page settings, reports failures, and restores them after reopening', async () => {
  let stored = bundle('first');
  const save = vi.fn(async (next: ProjectBundle) => {
    if (save.mock.calls.length === 1) throw new Error('Storage failed');
    stored = next;
  });
  const repository = { get: vi.fn(async () => stored),
    beginSession: vi.fn(async () => stored), finishSession: vi.fn(async () => {}),
    save } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  const view = render(<ProjectWorkspace projectId="first" repository={repository}
    ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  expect(screen.queryByRole('region', { name: '頁面設定' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '列印 / PDF' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  await screen.findByLabelText('紙張');
  expect(screen.getByRole('button', { name: '列印 / PDF' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('紙張'), { target: { value: 'A4' } });
  await act(async () => { await vi.waitFor(() => expect(save).toHaveBeenCalledOnce()); });
  expect(await screen.findByText('儲存失敗')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重試儲存' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(stored.project.pageSettings.paperSize).toBe('A4');
  view.unmount();
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  fireEvent.click(await screen.findByRole('tab', { name: '排版預覽' }));
  expect(await screen.findByLabelText('紙張')).toHaveValue('A4');
});

it('shows selected output while keeping the source editor mounted across tabs', async () => {
  const current = bundle('first');
  current.document.content = normalizeDocument({ type: 'doc', content: [{ type: 'bulletList',
    content: [
      { type: 'listItem', attrs: { selected: true },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Included' }] }] },
      { type: 'listItem', attrs: { selected: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Excluded' }] }] },
    ] }] });
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  const sourceEditor = screen.getByTestId('editor');
  expect(screen.queryByRole('region', { name: '頁面設定' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '列印 / PDF' })).not.toBeInTheDocument();
  const editor = { getJSON: () => current.document.content } as Editor;
  editorProps.current.at(-1)?.onEditor?.(editor);
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  expect(screen.getAllByTestId('editor')).toHaveLength(2);
  expect(sourceEditor).toBeInTheDocument();
  expect(screen.getByRole('tabpanel', { name: '排版預覽' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: '頁面設定' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '列印 / PDF' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '試卷內容' }));
  expect(screen.queryByRole('region', { name: '頁面設定' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '列印 / PDF' })).not.toBeInTheDocument();
  expect(screen.getByTestId('editor')).toBe(sourceEditor);
  expect(repository.save).not.toHaveBeenCalled();
});


it('exports the latest editor content before its debounced save', async () => {
  vi.mocked(createDocxDownload).mockClear();
  const current = bundle('first');
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}),
    getAsset: vi.fn(async () => null) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph',
    content: [{ type: 'text', text: 'Latest unsaved edit' }] }] });
  const editor = { getJSON: () => content } as Editor;
  editorProps.current.at(-1)?.onEditor?.(editor);
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  await waitFor(() => expect(createDocxDownload).toHaveBeenCalledOnce());
  expect(vi.mocked(createDocxDownload).mock.calls[0][0]).toEqual(content);
  expect(repository.save).not.toHaveBeenCalled();
});

it('exports a readonly tab loaded version without requesting write access again', async () => {
  vi.mocked(createDocxDownload).mockClear();
  vi.mocked(downloadBlob).mockClear();
  const current = bundle('first');
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(),
    finishSession: vi.fn(async () => {}), save: vi.fn(), getAsset: vi.fn(async () => null),
  } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async () => null) } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(vi.mocked(createDocxDownload).mock.calls[0][0]).toEqual(current.document.content);
  expect(ownership.acquireLatest).toHaveBeenCalledOnce();
  expect(repository.save).not.toHaveBeenCalled();
  expect(repository.beginSession).not.toHaveBeenCalled();
});
