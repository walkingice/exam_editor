import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
    save: vi.fn(async () => {}) } as unknown as ProjectRepository;
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
