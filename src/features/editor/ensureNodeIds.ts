import type { Editor } from '@tiptap/core';

const idTypes = new Set(['paragraph', 'heading', 'listItem', 'table', 'image', 'blockquote',
  'codeBlock', 'horizontalRule', 'pageBreak']);

export function ensureNodeIds(editor: Editor): boolean {
  const used = new Set<string>();
  const transaction = editor.state.tr;
  let changed = false;
  const questionPositions = new Set<number>();
  const documentItemPositions = new Set<number>();
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'bulletList') node.forEach((_item, itemOffset) => {
      questionPositions.add(offset + 1 + itemOffset);
    });
    else if (idTypes.has(node.type.name)) documentItemPositions.add(offset);
  });
  editor.state.doc.descendants((node, position) => {
    const question = node.type.name === 'listItem' && questionPositions.has(position);
    if (!idTypes.has(node.type.name) && !question) return;
    const attrs = { ...node.attrs };
    const id = node.attrs.id;
    if (idTypes.has(node.type.name)) {
      if (typeof id === 'string' && id && !used.has(id)) used.add(id);
      else {
        let next: string;
        do { next = crypto.randomUUID(); } while (used.has(next));
        used.add(next);
        attrs.id = next;
      }
    }
    const selectable = question || documentItemPositions.has(position);
    if (selectable && attrs.selected == null) attrs.selected = true;
    if (attrs.id !== node.attrs.id || attrs.selected !== node.attrs.selected) {
      transaction.setNodeMarkup(position, undefined, attrs);
      changed = true;
    }
  });
  if (!changed) return false;
  editor.view.dispatch(transaction.setMeta('addToHistory', false));
  return true;
}
