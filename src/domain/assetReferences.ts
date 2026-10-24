import type { JSONContent } from '@tiptap/core';

export function collectAssetIds(content: JSONContent): Set<string> {
  const ids = new Set<string>();
  const visit = (node: JSONContent) => {
    if (node.type === 'image' && typeof node.attrs?.assetId === 'string') {
      ids.add(node.attrs.assetId);
    }
    node.content?.forEach(visit);
  };
  visit(content);
  return ids;
}
