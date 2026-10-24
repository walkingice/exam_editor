import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { afterEach, expect, it } from 'vitest';
import { normalizeDocument } from '../../domain/document';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { editingExtensions } from '../editor/schema';
import { updateSourceFormat } from './updateSourceFormat';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

it('updates only the source node selected by stable ID', () => {
  const source = normalizeDocument({ type: 'doc', content: [{ type: 'bulletList', content: [
    { type: 'listItem', attrs: { selected: false }, content: [
      { type: 'paragraph', attrs: { id: 'excluded' }, content: [{ type: 'text', text: 'Hidden' }] },
    ] },
    { type: 'listItem', attrs: { selected: true }, content: [
      { type: 'paragraph', attrs: { id: 'included' }, content: [{ type: 'text', text: 'Shown' }] },
    ] },
  ] }] });
  editor = new Editor({ extensions: editingExtensions, content: source });
  updateSourceFormat(editor, 'included', { textAlign: 'center', spacingAfterMm: 5 },
    DEFAULT_PAGE_SETTINGS);
  const items = (editor.getJSON() as JSONContent).content![0].content!;
  expect(items[0].content![0].attrs?.spacingAfterMm).toBe(0);
  expect(items[1].content![0].attrs).toMatchObject({ id: 'included',
    textAlign: 'center', spacingAfterMm: 5 });
  expect(() => updateSourceFormat(editor!, 'missing', { spacingAfterMm: 3 },
    DEFAULT_PAGE_SETTINGS)).toThrow('找不到對應的來源節點');
});

it('rejects image widths beyond the content area', () => {
  const source = normalizeDocument({ type: 'doc', content: [{ type: 'image',
    attrs: { assetId: 'asset' } }] });
  editor = new Editor({ extensions: editingExtensions, content: source });
  const id = editor.getJSON().content![0].attrs!.id as string;
  expect(() => updateSourceFormat(editor!, id, { widthMm: 240 },
    DEFAULT_PAGE_SETTINGS)).toThrow('圖片寬度超過內容區');
  updateSourceFormat(editor, id, { widthMm: 100 }, DEFAULT_PAGE_SETTINGS);
  expect(editor.getJSON().content![0].attrs?.widthMm).toBe(100);
});
