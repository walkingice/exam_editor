import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeDocument } from '../../domain/document';
import type { ProjectRepository } from '../../data/repository';
import type { Editor, JSONContent } from '@tiptap/core';
import { ReadOnlyEditor } from './ReadOnlyEditor';
import { ensureNodeIds } from './ensureNodeIds';

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

  it('names every editor button on hover and renders formatting icons', async () => {
    render(<ReadOnlyEditor projectId="first"
      content={normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] })}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository} editable />);
    await screen.findByLabelText('試卷文件');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('title', button.getAttribute('aria-label') ?? button.textContent);
    }
    for (const name of ['粗體', '斜體', '底線']) {
      const button = screen.getByRole('button', { name });
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(button).not.toHaveTextContent(name);
      fireEvent.click(button);
      expect(button).toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('applies toolbar marks, headings, alignment and history to JSON', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph',
      content: [{ type: 'text', text: 'Question' }] }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByText('Question');
    editor!.commands.setTextSelection({ from: 1, to: 9 });
    fireEvent.click(screen.getByRole('button', { name: '粗體' }));
    expect(editor!.getJSON().content?.[0].content?.[0].marks?.[0].type).toBe('bold');
    fireEvent.click(screen.getByRole('button', { name: '標題 2' }));
    fireEvent.click(screen.getByRole('button', { name: '中對齊' }));
    expect(editor!.getJSON().content?.[0]).toMatchObject({
      type: 'heading', attrs: { level: 2, textAlign: 'center' },
    });
    expect(screen.getByRole('button', { name: '標題 2' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect(editor!.getJSON().content?.[0].attrs?.textAlign).not.toBe('center');
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    expect(editor!.getJSON().content?.[0].attrs?.textAlign).toBe('center');
  });

  it('sets the list style on each source item from toolbar commands', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph',
      content: [{ type: 'text', text: 'Question' }] }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByText('Question');
    fireEvent.click(screen.getByRole('button', { name: '編號清單' }));
    expect(editor!.getJSON().content?.[0].type).toBe('bulletList');
    expect((editor!.getJSON() as JSONContent).content?.[0].content?.[0].attrs?.listStyle).toBe('ordered');
    fireEvent.click(screen.getByRole('button', { name: '項目符號清單' }));
    expect((editor!.getJSON() as JSONContent).content?.[0].content?.[0].attrs?.listStyle).toBe('unordered');
    expect(editor!.schema.nodes.orderedList).toBeUndefined();
    expect(ensureNodeIds(editor!)).toBe(true);
    expect((editor!.getJSON() as JSONContent).content?.[0].content?.[0].attrs?.selected).toBe(true);
  });

  it('persists top-level question selection with history and stable IDs', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'bulletList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Question' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Option' }] },
        ] }] },
      ] }] },
    ] });
    let editor: Editor | undefined;
    const view = render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const checkbox = await screen.findByRole('checkbox', { name: /選取題目/ });
    expect(screen.getAllByRole('checkbox', { name: /選取題目/ })).toHaveLength(1);
    expect(checkbox).toBeChecked();
    const id = content.content?.[0].content?.[0].attrs?.id;
    fireEvent.click(checkbox);
    expect((editor!.getJSON() as JSONContent).content?.[0].content?.[0].attrs)
      .toMatchObject({ id, selected: false });
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect(screen.getByRole('checkbox', { name: /選取題目/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    expect(screen.getByRole('checkbox', { name: /選取題目/ })).not.toBeChecked();
    const saved = normalizeDocument(editor!.getJSON());
    view.rerender(<ReadOnlyEditor projectId="first" content={saved}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository} />);
    expect(screen.getByRole('checkbox', { name: /選取題目/ })).not.toBeChecked();
    expect(saved.content?.[0].content?.[0].attrs?.id).toBe(id);
  });

  it('adds a print selection checkbox to ordinary document items', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph',
      content: [{ type: 'text', text: 'Intro' }] }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const checkbox = await screen.findByRole('checkbox', { name: /選取項目/ });
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(editor!.getJSON().content?.[0].attrs).toMatchObject({ selected: false });
  });

  it('keeps a horizontal rule checkbox in sync with undo and redo', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'horizontalRule' }, { type: 'paragraph' },
    ] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const id = content.content?.[0].attrs?.id;
    const checkbox = await screen.findByRole('checkbox', { name: `選取項目 ${id}` });
    fireEvent.click(checkbox);
    expect(editor!.getJSON().content?.[0].attrs?.selected).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect(checkbox).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    expect(checkbox).not.toBeChecked();
  });

  it('toggles a question after earlier text shifts its position without moving selection', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Question' }] },
      ] }] },
    ] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const checkbox = await screen.findByRole('checkbox', { name: /選取題目/ });
    editor!.commands.insertContentAt(2, ' more words');
    editor!.commands.setTextSelection(3);
    const selection = editor!.state.selection.from;
    fireEvent.click(checkbox);
    expect((editor!.getJSON() as JSONContent).content?.[1].content?.[0].attrs?.selected).toBe(false);
    expect(editor!.state.selection.from).toBe(selection);
  });

  it('moves a question after a heading with undo and redo', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'First heading' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Question' }] },
        { type: 'image', attrs: { assetId: 'photo' } },
      ] }] },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Second heading' }] },
    ] });
    let editor: Editor | undefined;
    const view = render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn(async () => null) } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const handle = await screen.findByRole('button', { name: /移動題目/ });
    const original = (editor!.getJSON() as JSONContent).content![1].content![0];
    const values = new Map<string, string>();
    const dataTransfer = { types: ['application/x-exam-question'],
      setData: (type: string, value: string) => { values.set(type, value); },
      getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '',
      setDragImage: vi.fn() };
    fireEvent.dragStart(handle, { dataTransfer });
    expect(dataTransfer.setDragImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0);
    fireEvent.drop(screen.getByRole('heading', { name: /Second heading/ }), { dataTransfer });
    expect((editor!.getJSON() as JSONContent).content?.slice(0, 3).map((node) => node.type))
      .toEqual(['heading', 'heading', 'bulletList']);
    expect((editor!.getJSON() as JSONContent).content?.[2].content?.[0]).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect((editor!.getJSON() as JSONContent).content?.[1].content?.[0]).toEqual(original);
    fireEvent.click(screen.getByRole('button', { name: '重做' }));
    const saved = normalizeDocument(editor!.getJSON());
    view.rerender(<ReadOnlyEditor projectId="first" content={saved}
      repository={{ getAsset: vi.fn(async () => null) } as unknown as ProjectRepository} />);
    expect(saved.content?.[2].content?.[0].attrs).toMatchObject(original.attrs!);
  });

  it('shows the question insertion position while dragging', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Second heading' }] },
      { type: 'bulletList', content: [
      { type: 'listItem', attrs: { id: 'a' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
      ] },
      { type: 'listItem', attrs: { id: 'b' }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ] },
    ] },
    ] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository} editable
      onEditor={(value) => { editor = value; }} />);
    const handle = await screen.findByRole('button', { name: '移動題目 a' });
    expect(editor!.extensionManager.extensions.some((extension) => extension.name === 'dropCursor'))
      .toBe(false);
    const values = new Map<string, string>();
    const dataTransfer = { types: ['application/x-exam-question'],
      setData: (type: string, value: string) => { values.set(type, value); },
      getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '' };
    const elementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => null;
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(screen.getByRole('heading', { name: /Second heading/ }),
      { dataTransfer, clientY: 0 });
    expect(document.querySelector('.document-drop-indicator')?.parentElement).toBe(document.body);
    fireEvent.dragOver(screen.getByText('Second'), { dataTransfer, clientY: 0 });
    document.elementFromPoint = elementFromPoint;
    expect(document.querySelector('.document-drop-indicator')?.parentElement).toBe(document.body);
    fireEvent.dragEnd(handle);
    expect(document.querySelector('.document-drop-indicator')).toBeNull();
  });

  it('accepts a drop in the gap between document items', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'bulletList', content:
      ['First', 'Second', 'Third'].map((text, index) => ({ type: 'listItem',
        attrs: { id: `q${index}` }, content: [{ type: 'paragraph',
          content: [{ type: 'text', text }] }] })),
    }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findAllByRole('button', { name: /移動題目/ });
    const items = screen.getAllByRole('listitem');
    items.forEach((item, index) => {
      vi.spyOn(item, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, index * 30, 400, 20));
    });
    const values = new Map<string, string>();
    const dataTransfer = { types: ['application/x-exam-question'],
      setData: (type: string, value: string) => { values.set(type, value); },
      getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '' };
    const elementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => null;
    const firstHandle = screen.getByRole('button', { name: '移動題目 q0' });
    fireEvent.dragStart(firstHandle, { dataTransfer });
    fireEvent.dragOver(items[1], { dataTransfer, clientY: 55 });
    const marker = document.querySelector('.document-drop-indicator');
    expect(marker).not.toBeNull();
    fireEvent.dragOver(marker!, { dataTransfer, clientY: 55 });
    fireEvent.drop(marker!, { dataTransfer, clientY: 55 });
    document.elementFromPoint = elementFromPoint;
    expect((editor!.getJSON() as JSONContent).content?.[0].content?.map((node) => node.attrs?.id))
      .toEqual(['q1', 'q0', 'q2']);
    expect(document.querySelector('.document-drop-indicator')).toBeNull();
  });

  it('uses a table as the drop target from inside a cell', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell text' }] }] }] }] },
      { type: 'image', attrs: { assetId: 'picture' } },
      { type: 'blockquote', content: [{ type: 'paragraph',
        content: [{ type: 'text', text: 'Quoted text' }] }] },
      { type: 'codeBlock', content: [{ type: 'text', text: 'Code' }] },
      { type: 'horizontalRule' },
    ] });
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository} editable />);
    const handle = (await screen.findByRole('heading', { name: /Title/ }))
      .querySelector('button[aria-label^="移動項目"]')!;
    expect(screen.getAllByRole('button', { name: /移動項目/ })).toHaveLength(6);
    const values = new Map<string, string>();
    const dataTransfer = { types: ['application/x-exam-question'],
      setData: (type: string, value: string) => { values.set(type, value); },
      getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '' };
    const elementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => null;
    fireEvent.dragStart(handle, { dataTransfer });
    fireEvent.dragOver(screen.getByText('Cell text'), { dataTransfer, clientY: 0 });
    document.elementFromPoint = elementFromPoint;
    expect(document.querySelector('.document-drop-indicator')?.parentElement).toBe(document.body);
  });

  it('treats a nested option drop as a drop on its outer question', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'bulletList', content: [
        { type: 'listItem', attrs: { id: 'a' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        ] },
        { type: 'listItem', attrs: { id: 'b' }, content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Nested option' }] },
          ] }] },
        ] },
      ] },
    ] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const values = new Map<string, string>();
    const dataTransfer = { types: ['application/x-exam-question'],
      setData: (type: string, value: string) => { values.set(type, value); },
      getData: (type: string) => values.get(type) ?? '', effectAllowed: '', dropEffect: '' };
    fireEvent.dragStart(await screen.findByRole('button', { name: '移動題目 a' }), { dataTransfer });
    fireEvent.drop(screen.getByText('Nested option'), { dataTransfer, clientY: 1 });
    expect((editor!.getJSON() as JSONContent).content?.[0].content?.map((node) => node.attrs?.id))
      .toEqual(['b', 'a']);
  });

  it('maps Markdown input shortcuts to heading and unordered lists', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByLabelText('試卷文件');
    for (const [prefix, expected] of [['#', 'heading'], ['-', 'bulletList'],
      ['1.', 'bulletList']]) {
      editor!.commands.setContent({ type: 'doc', content: [{ type: 'paragraph',
        content: [{ type: 'text', text: prefix }] }] });
      editor!.commands.focus('end');
      const position = editor!.state.selection.from;
      expect(editor!.view.someProp('handleTextInput', (handler) =>
        handler(editor!.view, position, position, ' ', () => editor!.state.tr))).toBe(true);
      expect(editor!.getJSON().content?.[0].type).toBe(expected);
      if (prefix === '1.') {
        expect((editor!.getJSON() as JSONContent).content?.[0].attrs?.listStyle).toBe('ordered');
      }
    }
  });

  it('edits table cells and structure with undo support', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByLabelText('試卷文件');
    fireEvent.click(screen.getByRole('button', { name: '插入表格' }));
    expect(screen.getAllByRole('cell')).toHaveLength(4);
    editor!.commands.insertContent('Cell text');
    expect(screen.getByText('Cell text')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '新增列' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '新增欄' }));
    expect(screen.getAllByRole('cell')).toHaveLength(9);
    fireEvent.click(screen.getByRole('button', { name: '刪除欄' }));
    expect(screen.getAllByRole('cell')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: '刪除列' }));
    expect(screen.getAllByRole('row')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect(screen.getAllByRole('row')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: '刪除表格' }));
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps a table inside a question item valid for saving', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph',
        content: [{ type: 'text', text: 'Question' }] }] }] }] });
    let editor: Editor | undefined;
    const view = render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByText('Question');
    fireEvent.click(screen.getByRole('button', { name: '插入表格' }));
    const saved = normalizeDocument(editor!.getJSON() as JSONContent);
    expect(saved.content?.[0].content?.[0].content?.some((node) => node.type === 'table')).toBe(true);
    view.rerender(<ReadOnlyEditor projectId="first" content={saved}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository} />);
    expect(screen.getAllByRole('cell')).toHaveLength(4);
  });

  it('shows an image upload error without adding a document node', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] });
    let editor: Editor | undefined;
    const repository = { getAsset: vi.fn(), addAsset: vi.fn() } as unknown as ProjectRepository;
    render(<ReadOnlyEditor projectId="first" content={content} repository={repository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByLabelText('插入圖片');
    fireEvent.change(screen.getByLabelText('插入圖片'), { target: {
      files: [new File(['gif'], 'wrong.gif', { type: 'image/gif' })],
    } });
    expect(await screen.findByRole('alert')).toHaveTextContent('只支援 PNG 或 JPEG');
    expect(editor!.getJSON().content?.some((node) => node.type === 'image')).toBe(false);
    expect(repository.addAsset).not.toHaveBeenCalled();
  });

  it('stores the print selection of a top-level image', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'image', attrs: { assetId: 'photo' } },
    ] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn(async () => null) } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    const checkbox = await screen.findByRole('checkbox', {
      name: `選取項目 ${content.content?.[0].attrs?.id}`,
    });
    fireEvent.click(checkbox);
    expect(editor!.getJSON().content?.[0].attrs?.selected).toBe(false);
  });

  it('deletes a selected image and restores it with undo', async () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
      { type: 'image', attrs: { assetId: 'photo' } },
    ] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn(async () => null) } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByText('Before');
    act(() => { editor!.commands.setTextSelection(2); });
    const remove = screen.getByRole('button', { name: '刪除圖片' });
    expect(remove).toBeDisabled();
    act(() => { editor!.commands.setNodeSelection(editor!.state.doc.firstChild!.nodeSize); });
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    expect(editor!.getJSON().content?.some((node) => node.type === 'image')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '復原' }));
    expect(editor!.getJSON().content?.some((node) => node.type === 'image')).toBe(true);
  });

  it('assigns stable IDs to newly split paragraphs', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph',
      content: [{ type: 'text', text: 'Line' }] }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByText('Line');
    editor?.commands.focus('end');
    editor?.commands.splitBlock();
    expect(ensureNodeIds(editor!)).toBe(true);
    const ids = editor!.getJSON().content?.map((node) => node.attrs?.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(ensureNodeIds(editor!)).toBe(false);
    expect(editor!.getJSON().content?.map((node) => node.attrs?.id)).toEqual(ids);
  });

  it('sets newly created question items selected in the live editor', async () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] });
    let editor: Editor | undefined;
    render(<ReadOnlyEditor projectId="first" content={content}
      repository={{ getAsset: vi.fn() } as unknown as ProjectRepository}
      editable onEditor={(value) => { editor = value; }} />);
    await screen.findByLabelText('試卷文件');
    editor?.commands.setContent({ type: 'doc', content: [{ type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph' }] },
    ] }] });
    expect(ensureNodeIds(editor!)).toBe(true);
    const item = (editor!.getJSON() as JSONContent).content?.[0].content?.[0];
    expect(item?.attrs?.selected).toBe(true);
    expect(item?.attrs?.id).toBeTruthy();
    expect(ensureNodeIds(editor!)).toBe(false);
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

  it('saves a dragged image width in document JSON and supports undo', async () => {
    vi.stubGlobal('PointerEvent', MouseEvent);
    try {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:resize' });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
      const content = normalizeDocument({ type: 'doc', content: [
        { type: 'image', attrs: { assetId: 'present', alt: 'Photo', widthMm: 50 } },
      ] });
      const repository = { getAsset: vi.fn(async () => ({
        id: 'present', projectId: 'first', mimeType: 'image/png',
        blob: new Blob(['image'], { type: 'image/png' }),
      })) } as unknown as ProjectRepository;
      let editor: Editor | undefined;
      render(<ReadOnlyEditor projectId="first" content={content} repository={repository}
        editable onEditor={(value) => { editor = value; }} />);
      const image = await screen.findByRole('img', { name: 'Photo' });
      vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
        width: 200, height: 100, x: 0, y: 0, top: 0, left: 0,
        right: 200, bottom: 100, toJSON: () => ({}),
      });
      Object.defineProperty(image.closest('.exam-image'), 'clientWidth', { value: 400 });
      const handle = screen.getByRole('button', { name: '拖曳調整圖片大小' });
      handle.setPointerCapture = vi.fn();
      fireEvent.pointerDown(handle, { button: 0, clientX: 200 });
      fireEvent.pointerMove(handle, { clientX: 300 });
      fireEvent.pointerUp(handle, { clientX: 300 });
      expect(editor!.getJSON().content?.[0].attrs?.widthMm).toBeCloseTo(79.375);
      fireEvent.click(screen.getByRole('button', { name: '復原' }));
      expect(editor!.getJSON().content?.[0].attrs?.widthMm).toBe(50);
    } finally { vi.unstubAllGlobals(); }
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
