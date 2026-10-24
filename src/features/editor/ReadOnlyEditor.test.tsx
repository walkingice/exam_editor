import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeDocument } from '../../domain/document';
import type { ProjectRepository } from '../../data/repository';
import type { Editor } from '@tiptap/core';
import { ReadOnlyEditor } from './ReadOnlyEditor';

const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

afterEach(() => {
  cleanup();
  if (createDescriptor) Object.defineProperty(URL, 'createObjectURL', createDescriptor);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revokeDescriptor) Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.restoreAllMocks();
});

describe('read-only document', () => {
  it('allows an owner to edit and reports its editor instance', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] });
    let editor: Editor | undefined;
    const changed = vi.fn();
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} onChange={changed} />);
    await screen.findByLabelText('試卷文件');
    expect(editor?.isEditable).toBe(true);
    editor?.commands.insertContent('Edited');
    expect(changed).toHaveBeenCalledWith(editor);
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('keeps a non-owner document read-only', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      onEditor={(value) => { editor = value; }} />);
    await screen.findByLabelText('試卷文件');
    expect(editor?.isEditable).toBe(false);
    expect(screen.getByRole('textbox')).toHaveAttribute('contenteditable', 'false');
  });
  it('renders text and tables while showing a placeholder for a missing image', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Question text' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Answer cell' }] },
      ] }] }] },
      { type: 'image', attrs: { assetId: 'missing' } },
    ] });
    const repository = { getAsset: vi.fn(async () => null) } as unknown as ProjectRepository;
    render(<ReadOnlyEditor projectId="first" content={content} repository={repository} />);
    expect(await screen.findByText('Question text')).toBeInTheDocument();
    expect(screen.getByRole('cell')).toHaveTextContent('Answer cell');
    expect(await screen.findByRole('img', { name: '缺少圖片' })).toHaveTextContent('missing');
    expect(repository.getAsset).toHaveBeenCalledWith('first', 'missing');
  });

  it('loads and releases an image URL on unmount', async () => {
    const create = vi.fn(() => 'blob:test-image');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'image', attrs: { assetId: 'present', alt: 'Photo' } },
    ] });
    const repository = { getAsset: vi.fn(async () => ({
      id: 'present', projectId: 'first', mimeType: 'image/png',
      blob: new Blob(['image'], { type: 'image/png' }),
    })) } as unknown as ProjectRepository;
    const view = render(<ReadOnlyEditor projectId="first" content={content} repository={repository} />);
    expect(await screen.findByRole('img', { name: 'Photo' })).toHaveAttribute('src', 'blob:test-image');
    view.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:test-image');
  });

  it('loads an image when StrictMode replays effects', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:strict-image' });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'image', attrs: { assetId: 'present', alt: 'Strict image' } },
    ] });
    const repository = { getAsset: vi.fn(async () => ({
      id: 'present', projectId: 'first', mimeType: 'image/png',
      blob: new Blob(['image'], { type: 'image/png' }),
    })) } as unknown as ProjectRepository;
    render(<StrictMode><ReadOnlyEditor projectId="first" content={content}
      repository={repository} /></StrictMode>);
    expect(await screen.findByRole('img', { name: 'Strict image' }))
      .toHaveAttribute('src', 'blob:strict-image');
  });

  it('releases the first project image before showing another project', async () => {
    const create = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'image', attrs: { assetId: 'shared', alt: 'Project image' } },
    ] });
    const repository = { getAsset: vi.fn(async (projectId: string) => ({
      id: 'shared', projectId, mimeType: 'image/png',
      blob: new Blob([projectId], { type: 'image/png' }),
    })) } as unknown as ProjectRepository;
    const view = render(<ReadOnlyEditor key="first" projectId="first"
      content={content} repository={repository} />);
    expect(await screen.findByRole('img', { name: 'Project image' }))
      .toHaveAttribute('src', 'blob:first');
    view.rerender(<ReadOnlyEditor key="second" projectId="second"
      content={content} repository={repository} />);
    expect(await screen.findByRole('img', { name: 'Project image' }))
      .toHaveAttribute('src', 'blob:second');
    expect(revoke).toHaveBeenCalledWith('blob:first');
    expect(repository.getAsset).toHaveBeenLastCalledWith('second', 'shared');
  });

  it('updates document content after an ownership handoff reread', async () => {
    const first = normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Old content' }] },
    ] });
    const latest = normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Latest content' }] },
    ] });
    const repository = { getAsset: vi.fn() } as unknown as ProjectRepository;
    const view = render(<ReadOnlyEditor projectId="first" content={first} repository={repository} />);
    expect(await screen.findByText('Old content')).toBeInTheDocument();
    view.rerender(<ReadOnlyEditor projectId="first" content={latest} repository={repository} />);
    expect(await screen.findByText('Latest content')).toBeInTheDocument();
    expect(screen.queryByText('Old content')).toBeNull();
  });

  it('shows the missing image message when asset lookup throws', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'image', attrs: { assetId: 'broken' } },
    ] });
    const repository = {
      getAsset: vi.fn(async () => { throw new Error('Storage failed'); }),
    } as unknown as ProjectRepository;
    render(<ReadOnlyEditor projectId="first" content={content} repository={repository} />);
    expect(await screen.findByRole('img', { name: '缺少圖片' })).toHaveTextContent('broken');
  });
});
