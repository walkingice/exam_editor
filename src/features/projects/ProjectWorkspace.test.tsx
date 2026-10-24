import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectLease, type ProjectOwnership } from '../../data/ownership';
import type { ProjectBundle, ProjectRepository } from '../../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { ProjectWorkspace } from './ProjectWorkspace';

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
  await screen.findByLabelText('紙張');
  fireEvent.change(screen.getByLabelText('紙張'), { target: { value: 'A4' } });
  await act(async () => { await vi.waitFor(() => expect(save).toHaveBeenCalledOnce()); });
  expect(await screen.findByText('儲存失敗')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重試儲存' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(stored.project.pageSettings.paperSize).toBe('A4');
  view.unmount();
  render(<ProjectWorkspace projectId="first" repository={repository} ownership={ownership} />);
  expect(await screen.findByLabelText('紙張')).toHaveValue('A4');
});
