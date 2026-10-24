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
      const start = nextNumber;
      nextNumber += selected.length;
      return [{ ...copy(node), type: style === 'ordered' ? 'orderedList' : 'bulletList',
        attrs: style === 'ordered' ? { ...node.attrs, start } : { ...node.attrs },
        content: selected.map(copy) }];
    }),
  };
}
