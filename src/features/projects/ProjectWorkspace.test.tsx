import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectLease, type ProjectOwnership } from '../../data/ownership';
import type { ProjectBundle, ProjectRepository } from '../../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { normalizeDocument } from '../../domain/document';
import { ProjectWorkspace } from './ProjectWorkspace';
import { createDocxDownload, downloadBlob } from '../export-docx/downloadDocument';
import { GEMINI_API_KEY_STORAGE_KEY } from '../../shared/storageKeys';

vi.mock('../export-docx/downloadDocument', async (original) => ({
  ...await original<typeof import('../export-docx/downloadDocument')>(),
  createDocxDownload: vi.fn(async () => ({ blob: new Blob(), warnings: [] })),
  downloadBlob: vi.fn(),
}));

const editorProps = vi.hoisted(() => ({
  current: [] as Array<{ onChange?: (editor: Editor) => void;
    onEditor?: (editor: Editor) => void; editable?: boolean;
    preview?: boolean; content?: JSONContent }>,
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

it('opens the whole-document AI modal from the content tab', async () => {
  window.localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, 'test-key');
  const repository = { get: vi.fn(async () => bundle('first')),
    beginSession: vi.fn(async () => bundle('first')),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  const button = screen.getByRole('button', { name: '全部修改✨' });
  expect(button).toBeDisabled();
  act(() => editorProps.current[0].onEditor?.({ isEditable: true } as Editor));
  expect(button).toBeEnabled();
  fireEvent.click(button);
  expect(screen.getByRole('dialog', { name: '全部修改' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog', { name: '全部修改' })).not.toBeInTheDocument();
  window.localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
});

it('cancels a title edit without changing the project name', async () => {
  const repository = { get: vi.fn(async () => bundle('first')),
    beginSession: vi.fn(async () => bundle('first')),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(screen.getByRole('heading', { name: 'first' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '更名' })).toBeInTheDocument();
});

it('updates preview orientation, columns, and usable height without changing the source', async () => {
  const current = bundle('first');
  const originalContent = structuredClone(current.document.content);
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  const sourceEditor = screen.getByTestId('editor');
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  const paper = screen.getByRole('tabpanel', { name: '排版預覽' })
    .querySelector<HTMLElement>('.preview-paper')!;
  const content = paper.querySelector<HTMLElement>('.preview-content')!;
  expect(paper).toHaveAttribute('data-orientation', 'portrait');
  expect(content).not.toHaveAttribute('style');
  fireEvent.change(screen.getByLabelText('方向'), { target: { value: 'landscape' } });
  fireEvent.change(screen.getByLabelText('欄數'), { target: { value: '2' } });
  expect(paper).toHaveAttribute('data-orientation', 'landscape');
  expect(paper).toHaveAttribute('data-columns', '2');
  expect(paper.style.width).toBe('379mm');
  expect(paper.style.minHeight).toBe('265mm');
  expect(content.style.height).toBe('235mm');
  fireEvent.change(screen.getByLabelText('上邊距 (mm)'), { target: { value: '20' } });
  expect(content.style.height).toBe('230mm');
  fireEvent.change(screen.getByLabelText('方向'), { target: { value: 'portrait' } });
  expect(paper).toHaveAttribute('data-orientation', 'portrait');
  expect(content.style.height).toBe('');
  expect(paper).toHaveAttribute('data-columns', '2');
  expect(sourceEditor).toBeInTheDocument();
  expect(current.document.content).toEqual(originalContent);
});

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
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存' }));
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
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存' }));
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
  fireEvent.click(screen.getByRole('button', { name: '更名' }));
  fireEvent.change(screen.getByLabelText('試卷名稱'), { target: { value: 'Unsaved' } });
  fireEvent.click(screen.getByRole('button', { name: '儲存' }));
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
  expect(screen.queryByRole('button', { name: '匯出 DOCX' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  await screen.findByLabelText('紙張');
  expect(screen.getByRole('button', { name: '列印 / PDF' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '匯出 DOCX' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '匯出 DOCX' }).closest('.workspace-actions'))
    .toBe(screen.getByRole('button', { name: '列印 / PDF' }).closest('.workspace-actions'));
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
  expect(screen.queryByRole('button', { name: '匯出 DOCX' })).not.toBeInTheDocument();
  const editor = { getJSON: () => current.document.content } as Editor;
  editorProps.current.at(-1)?.onEditor?.(editor);
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  expect(screen.getAllByTestId('editor')).toHaveLength(2);
  expect(sourceEditor).toBeInTheDocument();
  expect(screen.getByRole('tabpanel', { name: '排版預覽' })).toBeInTheDocument();
  const previewPanel = screen.getByRole('tabpanel', { name: '排版預覽' });
  const settings = screen.getByRole('region', { name: '頁面設定' });
  expect(settings.parentElement).toBe(previewPanel);
  expect(settings.nextElementSibling).toHaveClass('preview-scroll');
  expect(screen.getByRole('button', { name: '列印 / PDF' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: '試卷內容' }));
  expect(screen.queryByRole('region', { name: '頁面設定' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '列印 / PDF' })).not.toBeInTheDocument();
  expect(screen.getByTestId('editor')).toBe(sourceEditor);
  expect(repository.save).not.toHaveBeenCalled();
});

it('keeps import review warnings collapsed in the content tab only', async () => {
  sessionStorage.setItem('exam-import-warnings:first', JSON.stringify(['請校對題目順序。']));
  const current = bundle('first');
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  await screen.findByRole('heading', { name: 'first' });
  const details = screen.getByLabelText('匯入提醒') as HTMLDetailsElement;
  expect(details.open).toBe(false);
  expect(screen.getByText('匯入文件需人工校對')).toBeInTheDocument();
  expect(screen.queryByText('請校對題目順序。')).not.toBeVisible();
  fireEvent.click(screen.getByText('匯入文件需人工校對'));
  expect(details.open).toBe(true);
  expect(screen.getByText('請校對題目順序。')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  expect(screen.getByLabelText('匯入提醒')).not.toBeVisible();
  expect(screen.queryByText('匯入文件需人工校對')).not.toBeVisible();
  sessionStorage.removeItem('exam-import-warnings:first');
});

it.each([
  ['A4', 'portrait', '210mm', '297mm'],
  ['TW_B4', 'landscape', '379mm', '265mm'],
] as const)('splits %s %s preview into physical pages at page breaks', async (
  paperSize, orientation, width, height,
) => {
  const current = bundle('first');
  current.project.pageSettings = { ...DEFAULT_PAGE_SETTINGS, paperSize, orientation };
  current.document.content = normalizeDocument({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
    { type: 'pageBreak' },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
  ] });
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  fireEvent.click(await screen.findByRole('tab', { name: '排版預覽' }));
  const papers = document.querySelectorAll<HTMLElement>('.preview-paper');
  expect(papers).toHaveLength(2);
  for (const paper of papers) {
    expect(paper.style.width).toBe(width);
    expect(paper.style.height).toBe(height);
    expect(paper.style.minHeight).toBe(height);
    expect(paper.querySelectorAll('[data-testid="editor"]')).toHaveLength(1);
  }
  const pages = editorProps.current.filter((props) => props.preview).map((props) => props.content);
  expect(pages.map((page) => page?.content?.map((node) => node.type)))
    .toEqual([['paragraph'], ['paragraph']]);
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
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
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
  fireEvent.click(screen.getByRole('tab', { name: '排版預覽' }));
  fireEvent.click(screen.getByRole('button', { name: '匯出 DOCX' }));
  await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
  expect(vi.mocked(createDocxDownload).mock.calls[0][0]).toEqual(current.document.content);
  expect(ownership.acquireLatest).toHaveBeenCalledOnce();
  expect(repository.save).not.toHaveBeenCalled();
  expect(repository.beginSession).not.toHaveBeenCalled();
});


it('waits for the print editor to initialize before opening print', async () => {
  const current = bundle('first');
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const fonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  try {
    render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
    fireEvent.click(await screen.findByRole('tab', { name: '排版預覽' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '列印 / PDF' })); });
    expect(document.querySelector('#exam-print-root')).toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
    await act(async () => { editorProps.current.at(-1)?.onEditor?.({} as Editor); });
    expect(print).toHaveBeenCalledOnce();
  } finally {
    print.mockRestore();
    if (fonts) Object.defineProperty(document, 'fonts', fonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
});

it('recreates the print editor after an image failure and allows retry', async () => {
  const current = bundle('first');
  const repository = { get: vi.fn(async () => current), beginSession: vi.fn(async () => current),
    finishSession: vi.fn(async () => {}), save: vi.fn(async () => {}) } as unknown as ProjectRepository;
  const ownership = { acquireLatest: vi.fn(async (id: string,
    read: () => Promise<ProjectBundle | null>) => ({ lease: new ProjectLease(id), value: await read() })),
  } as unknown as ProjectOwnership;
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const fonts = Object.getOwnPropertyDescriptor(document, 'fonts');
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  try {
    render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
    fireEvent.click(await screen.findByRole('tab', { name: '排版預覽' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '列印 / PDF' })); });
    const firstRoot = document.querySelector('#exam-print-root')!;
    const missing = document.createElement('span');
    missing.setAttribute('aria-label', '缺少圖片');
    firstRoot.append(missing);
    await act(async () => { editorProps.current.at(-1)?.onEditor?.({} as Editor); });
    expect(screen.getByRole('alert')).toHaveTextContent('列印圖片載入失敗');
    expect(firstRoot).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重試列印' })); });
    expect(document.querySelector('#exam-print-root')).toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
    await act(async () => { editorProps.current.at(-1)?.onEditor?.({} as Editor); });
    expect(print).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  } finally {
    print.mockRestore();
    if (fonts) Object.defineProperty(document, 'fonts', fonts);
    else Reflect.deleteProperty(document, 'fonts');
  }
});
