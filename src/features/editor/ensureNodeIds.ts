import type { Editor } from '@tiptap/core';

const idTypes = new Set(['paragraph', 'heading', 'listItem', 'table', 'image', 'blockquote',
  'codeBlock', 'horizontalRule']);

export function ensureNodeIds(editor: Editor): boolean {
  const used = new Set<string>();
  const transaction = editor.state.tr;
  const questionPositions = new Set<number>();
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === 'bulletList') node.forEach((_item, itemOffset) => {
      questionPositions.add(offset + 1 + itemOffset);
    });
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
    if (question && attrs.selected == null) attrs.selected = true;
    if (attrs.id !== node.attrs.id || attrs.selected !== node.attrs.selected) {
      transaction.setNodeMarkup(position, undefined, attrs);
    }
  });
  if (!transaction.docChanged) return false;
  editor.view.dispatch(transaction.setMeta('addToHistory', false));
  return true;
}
