import type { JSONContent } from '@tiptap/core';
import type { OutputListStyle } from './types';
import { validateDocument } from './document';

export function projectOutput(source: JSONContent, style: OutputListStyle): JSONContent {
  if (style !== 'ordered' && style !== 'unordered') throw new Error('Unsupported output list style');
  validateDocument(source);
  const copy = (node: JSONContent): JSONContent => structuredClone(node);
  let nextNumber = 1;
  return {
    ...copy(source),
    content: source.content?.flatMap((node) => {
      if (node.type !== 'bulletList') nextNumber = 1;
      if (node.type !== 'bulletList' && node.attrs?.selected === false) return [];
      if (node.type !== 'bulletList') return [copy(node)];
      const selected = node.content?.filter((item) => item.attrs?.selected === true) ?? [];
      if (!selected.length) return [];
      const groups: JSONContent[] = [];
      for (const item of selected) {
        const itemStyle = item.attrs?.listStyle ?? node.attrs?.listStyle ?? style;
        const previous = groups.at(-1);
        if (itemStyle === 'unordered') nextNumber = 1;
        if (previous?.type === (itemStyle === 'ordered' ? 'orderedList' : 'bulletList')) {
          previous.content?.push(copy(item));
        } else {
          groups.push({ ...copy(node), type: itemStyle === 'ordered' ? 'orderedList' : 'bulletList',
            attrs: itemStyle === 'ordered' ? { ...node.attrs, start: nextNumber } : { ...node.attrs },
            content: [copy(item)] });
        }
        if (itemStyle === 'ordered') nextNumber++;
      }
      return groups;
    }),
  };
}
