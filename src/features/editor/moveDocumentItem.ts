import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type DocumentItemTarget = { position: number; placement: 'before' | 'after' };

type Item = { node: ProseMirrorNode; list: boolean };

function flattenItems(doc: ProseMirrorNode): Item[] {
  const items: Item[] = [];
  doc.forEach((node) => {
    if (node.type.name === 'bulletList') {
      node.forEach((item) => items.push({ node: item, list: true }));
    } else items.push({ node, list: false });
  });
  return items;
}

function itemIndexAt(doc: ProseMirrorNode, position: number): number {
  let offset = 0;
  let itemIndex = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (node.type.name === 'bulletList') {
      let itemOffset = offset + 1;
      for (let child = 0; child < node.childCount; child += 1) {
        const item = node.child(child);
        if (position === itemOffset) return itemIndex;
        itemOffset += item.nodeSize;
        itemIndex += 1;
      }
    } else {
      if (position === offset) return itemIndex;
      itemIndex += 1;
    }
    offset += node.nodeSize;
  }
  return -1;
}

function groupItems(editor: Editor, items: Item[]): ProseMirrorNode[] {
  const nodes: ProseMirrorNode[] = [];
  let questions: ProseMirrorNode[] = [];
  const flushQuestions = () => {
    if (questions.length) nodes.push(editor.schema.nodes.bulletList.create(null, questions));
    questions = [];
  };
  items.forEach(({ node, list }) => {
    if (list) questions.push(node);
    else { flushQuestions(); nodes.push(node); }
  });
  flushQuestions();
  return nodes;
}

export function moveDocumentItem(editor: Editor, sourceId: string, target: DocumentItemTarget): boolean {
  if (!editor.isEditable) return false;
  const { doc } = editor.state;
  if (!Number.isInteger(target.position) || target.position < 0
    || target.position >= doc.content.size) return false;
  const items = flattenItems(doc);
  const sourceIndex = items.findIndex(({ node }) => node.attrs.id === sourceId);
  const targetIndex = itemIndexAt(doc, target.position);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;

  const [source] = items.splice(sourceIndex, 1);
  const adjustedTarget = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
  const destination = target.placement === 'before' ? adjustedTarget : adjustedTarget + 1;
  items.splice(Math.max(0, Math.min(destination, items.length)), 0, source);

  const transaction = editor.state.tr.replaceWith(0, doc.content.size,
    groupItems(editor, items));
  transaction.doc.check();
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}
