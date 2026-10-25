import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export type AIItem = { id: string; content: string };
type SourceItem = AIItem & { position: number; node: ProseMirrorNode };

function itemText(node: ProseMirrorNode): string {
  if (node.type.name === 'listItem' && node.firstChild) {
    return node.firstChild.textBetween(0, node.firstChild.content.size, '\n').trim();
  }
  return node.textBetween(0, node.content.size, '\n').trim();
}

export function collectAIItems(editor: Editor): SourceItem[] {
  const items: SourceItem[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'bulletList') return true;
    const depth = editor.state.doc.resolve(position).depth;
    const isItem = depth === 0 || (depth === 1 && node.type.name === 'listItem');
    if (!isItem) return true;
    const content = itemText(node);
    if (typeof node.attrs.id === 'string' && content) {
      items.push({ id: node.attrs.id, content, position, node });
    }
    return node.type.name === 'listItem';
  });
  return items;
}

export function applyAIItems(editor: Editor, source: SourceItem[], result: AIItem[]): void {
  if (!editor.isEditable) throw new Error('目前無法編輯試卷。');
  const original = new Map(source.map((item) => [item.id, item]));
  if (original.size !== source.length || result.length !== source.length) {
    throw new Error('AI 回傳的題目數量不符。');
  }
  const received = new Map<string, string>();
  for (const item of result) {
    if (!item || typeof item.id !== 'string' || !original.has(item.id)
      || received.has(item.id) || typeof item.content !== 'string' || !item.content.trim()) {
      throw new Error('AI 回傳的題目 ID 或內容無效。');
    }
    received.set(item.id, item.content);
  }
  const current = collectAIItems(editor);
  const currentById = new Map(current.map((item) => [item.id, item]));
  if (currentById.size !== source.length || current.length !== source.length
    || source.some((item) => !currentById.has(item.id))) {
    throw new Error('題目清單已變更，請重新執行全部修改。');
  }
  const { schema } = editor.state;
  let transaction = editor.state.tr;
  for (const item of [...current].sort((a, b) => b.position - a.position)) {
    const text = schema.text(received.get(item.id)!);
    const replacement = item.node.type.name === 'listItem'
      ? item.node.type.create(item.node.attrs, [schema.nodes.paragraph.create(null, text),
        ...Array.from({ length: item.node.childCount - 1 }, (_, index) => item.node.child(index + 1))])
      : item.node.isTextblock
        ? item.node.type.create(item.node.attrs, text)
        : schema.nodes.paragraph.create({ id: item.id, selected: item.node.attrs.selected }, text);
    transaction = transaction.replaceWith(item.position, item.position + item.node.nodeSize, replacement);
  }
  editor.view.dispatch(transaction);
}
