import type { Editor } from '@tiptap/core';
import { validFontFamily, validFontSize } from './fontStyles';

export type AllFormat = { fontFamily: string; fontSize: string; clear: boolean };

export function applyAllFormat(editor: Editor, format: AllFormat): void {
  if (!editor.isEditable) return;
  if (format.fontFamily && !validFontFamily(format.fontFamily)) throw new Error('字體無效。');
  if (format.fontSize && !validFontSize(format.fontSize)) throw new Error('字體大小無效。');
  const { doc, schema } = editor.state;
  const transaction = editor.state.tr;
  doc.descendants((node, position) => {
    if (!node.isText) return true;
    const end = position + node.nodeSize;
    if (format.clear) transaction.removeMark(position, end);
    if (format.fontFamily) {
      transaction.removeMark(position, end, schema.marks.fontFamily);
      transaction.addMark(position, end,
        schema.marks.fontFamily.create({ fontFamily: format.fontFamily }));
    }
    if (format.fontSize) {
      transaction.removeMark(position, end, schema.marks.fontSize);
      transaction.addMark(position, end,
        schema.marks.fontSize.create({ fontSize: format.fontSize }));
    }
    return true;
  });
  if (transaction.docChanged) editor.view.dispatch(transaction);
}
