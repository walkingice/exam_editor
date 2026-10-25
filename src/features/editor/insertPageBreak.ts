import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export function focusedItemIndex(editor: Editor): number | null {
  if (!editor.isEditable || !editor.isFocused) return null;
  const { $from } = editor.state.selection;
  if (!$from.parent.type.spec.group?.includes('block') && $from.depth === 0) return null;
  const top = $from.depth ? $from.index(0) : Math.min($from.index(0), editor.state.doc.childCount - 1);
  if (top < 0 || top >= editor.state.doc.childCount) return null;
  let index = 0;
  for (let i = 0; i < top; i += 1) {
    const node = editor.state.doc.child(i);
    index += node.type.name === 'bulletList' ? node.childCount : 1;
  }
  const node = editor.state.doc.child(top);
  return index + (node.type.name === 'bulletList' && $from.depth > 0 ? $from.index(1) : 0);
}

export function insertPageBreak(editor: Editor): boolean {
  const index = focusedItemIndex(editor);
  if (index === null) return false;
  const items: Array<{ node: ProseMirrorNode; list: boolean }> = [];
  editor.state.doc.forEach((node) => {
    if (node.type.name === 'bulletList') node.forEach((item) => items.push({ node: item, list: true }));
    else items.push({ node, list: false });
  });
  items.splice(index + 1, 0, { node: editor.schema.nodes.pageBreak.create({
    id: crypto.randomUUID(), selected: true,
  }), list: false });
  const nodes: ProseMirrorNode[] = [];
  let questions: ProseMirrorNode[] = [];
  const flush = () => {
    if (questions.length) nodes.push(editor.schema.nodes.bulletList.create(null, questions));
    questions = [];
  };
  items.forEach((item) => {
    if (item.list) questions.push(item.node);
    else { flush(); nodes.push(item.node); }
  });
  flush();
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, nodes));
  return true;
}
