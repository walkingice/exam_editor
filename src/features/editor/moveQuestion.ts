import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type QuestionTarget =
  | { position: number; placement: 'before' | 'after' }
  | { position: number; placement: 'section' };

type QuestionLocation = {
  position: number;
  listPosition: number;
  list: ProseMirrorNode;
  item: ProseMirrorNode;
};

function findQuestion(doc: ProseMirrorNode, id: string): QuestionLocation | null {
  let listPosition = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const list = doc.child(index);
    if (list.type.name === 'bulletList') {
      let itemOffset = 0;
      for (let itemIndex = 0; itemIndex < list.childCount; itemIndex += 1) {
        const item = list.child(itemIndex);
        if (item.attrs.id === id) {
          return { position: listPosition + 1 + itemOffset, listPosition, list, item };
        }
        itemOffset += item.nodeSize;
      }
    }
    listPosition += list.nodeSize;
  }
  return null;
}

function topLevelAt(doc: ProseMirrorNode, position: number) {
  let offset = 0;
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index);
    if (offset === position) return { node, index };
    offset += node.nodeSize;
  }
  return null;
}

export function moveQuestion(editor: Editor, sourceId: string, target: QuestionTarget): boolean {
  if (!editor.isEditable) return false;
  const { doc } = editor.state;
  if (!Number.isInteger(target.position) || target.position < 0
    || target.position >= doc.content.size) return false;
  const source = findQuestion(doc, sourceId);
  if (!source) return false;
  const targetItem = target.placement === 'section' ? null : doc.nodeAt(target.position);
  const targetList = target.placement === 'section' ? null
    : doc.resolve(target.position).parent;
  if (target.placement !== 'section' && (targetItem?.type.name !== 'listItem'
    || targetList?.type.name !== 'bulletList'
    || doc.resolve(target.position).depth !== 1 || targetItem.attrs.id === sourceId)) return false;
  const section = target.placement === 'section' ? topLevelAt(doc, target.position) : null;
  if (target.placement === 'section' && section?.node.type.name !== 'heading') return false;

  const targetPosition = target.placement === 'section'
    ? target.position + section!.node.nodeSize
    : target.position + (target.placement === 'after' ? targetItem!.nodeSize : 0);
  const transaction = editor.state.tr;
  const removeList = source.list.childCount === 1;
  transaction.delete(removeList ? source.listPosition : source.position,
    removeList ? source.listPosition + source.list.nodeSize : source.position + source.item.nodeSize);
  const mapped = transaction.mapping.map(targetPosition, 1);
  if (target.placement === 'section') {
    const next = transaction.doc.nodeAt(mapped);
    if (next?.type.name === 'bulletList') transaction.insert(mapped + 1, source.item);
    else transaction.insert(mapped, editor.schema.nodes.bulletList.create(null, source.item));
  } else {
    const $destination = transaction.doc.resolve(mapped);
    if ($destination.parent.type.name !== 'bulletList') return false;
    transaction.insert(mapped, source.item);
  }
  transaction.doc.check();
  editor.view.dispatch(transaction.scrollIntoView());
  return true;
}
