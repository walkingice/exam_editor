import type { JSONContent } from '@tiptap/core';
import { examSchema } from '../features/editor/schema';

const idTypes = new Set(['paragraph', 'heading', 'listItem', 'table', 'image', 'blockquote',
  'codeBlock', 'horizontalRule']);
const nodeTypes = new Set(Object.keys(examSchema.nodes));
const markTypes = new Set(Object.keys(examSchema.marks));

export function normalizeDocument(input: JSONContent): JSONContent {
  const used = new Set<string>();
  const normalized = normalizeNode(input, used, false, false);
  validateDocument(normalized);
  return normalized;
}

function normalizeNode(
  node: JSONContent, used: Set<string>, parentIsDoc: boolean, questionItem: boolean,
): JSONContent {
  if (!node.type || (node.type !== 'orderedList' && !nodeTypes.has(node.type))) {
    throw new Error(`Unsupported document node: ${node.type ?? 'missing'}`);
  }
  const type = node.type === 'orderedList' ? 'bulletList' : node.type;
  const attrs = { ...node.attrs };
  if (node.type === 'orderedList') {
    delete attrs.start;
    delete attrs.type;
  }
  if (idTypes.has(type)) {
    const current = attrs.id;
    if (typeof current === 'string' && current.length > 0 && !used.has(current)) {
      attrs.id = current;
    } else {
      do { attrs.id = crypto.randomUUID(); } while (used.has(attrs.id as string));
    }
    used.add(attrs.id as string);
  }
  if (type === 'listItem') attrs.selected = questionItem ? attrs.selected !== false : null;
  if (type === 'image') {
    delete attrs.src;
    if (typeof attrs.assetId !== 'string' || !attrs.assetId) {
      throw new Error('Image requires an asset ID');
    }
  }
  return {
    ...node,
    type,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    content: node.content?.map((child) => normalizeNode(
      child, used, type === 'doc', type === 'bulletList' && parentIsDoc,
    )),
  };
}

export function validateDocument(input: JSONContent): void {
  checkNode(input, false, false, new Set());
  if (input.type !== 'doc') throw new Error('Document root must be doc');
  const document = examSchema.nodeFromJSON(input);
  document.check();
}

function checkNode(
  node: JSONContent, parentIsDoc: boolean, questionItem: boolean, used: Set<string>,
): void {
  if (!node.type || !nodeTypes.has(node.type) || node.type === 'orderedList') {
    throw new Error(`Unsupported document node: ${node.type ?? 'missing'}`);
  }
  if (node.marks?.some((mark) => !mark.type || !markTypes.has(mark.type))) {
    throw new Error('Unsupported document mark');
  }
  const attrs = node.attrs ?? {};
  const allowed = examSchema.nodes[node.type].spec.attrs ?? {};
  if (Object.keys(attrs).some((key) => !(key in allowed))) {
    throw new Error(`Unsupported ${node.type} attribute`);
  }
  if (idTypes.has(node.type) && (typeof attrs.id !== 'string' || !attrs.id)) {
    throw new Error(`${node.type} requires an ID`);
  }
  if (idTypes.has(node.type)) {
    if (used.has(attrs.id as string)) throw new Error('Duplicate node ID');
    used.add(attrs.id as string);
  }
  if (node.type === 'listItem' && (questionItem
    ? typeof attrs.selected !== 'boolean' : attrs.selected != null)) {
    throw new Error('Invalid question selection');
  }
  if (node.type === 'image' && (typeof attrs.assetId !== 'string' || !attrs.assetId || attrs.src)) {
    throw new Error('Image requires a persistent asset ID');
  }
  if (['paragraph', 'heading'].includes(node.type) && attrs.spacingAfterMm !== undefined
    && (!Number.isFinite(attrs.spacingAfterMm) || attrs.spacingAfterMm < 0
      || attrs.spacingAfterMm > 30)) {
    throw new Error('Invalid paragraph spacing');
  }
  if (node.type === 'image' && attrs.widthMm != null
    && (!Number.isFinite(attrs.widthMm) || attrs.widthMm <= 0 || attrs.widthMm > 379)) {
    throw new Error('Invalid image width');
  }
  node.content?.forEach((child) => checkNode(
    child, node.type === 'doc', node.type === 'bulletList' && parentIsDoc, used,
  ));
}
