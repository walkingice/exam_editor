import DOMPurify from 'dompurify';
import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/core';
import { normalizeDocument } from '../../domain/document';
import { examSchema } from '../editor/schema';
import type { ParsedDocx } from './parseDocx';

export type NormalizedImport = { content: JSONContent; warnings: string[] };

const tags = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'blockquote',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'img',
];
const attrs = ['src', 'alt', 'colspan', 'rowspan', 'style'];
const assetPrefix = 'import-asset:';

export function normalizeImport(parsed: ParsedDocx): NormalizedImport {
  const root = document.createElement('div');
  const tokens = new Map<string, string>();
  const prepared = parsed.html.replace(
    /\bsrc\s*=\s*(["'])import-asset:([a-z0-9-]+)\1/gi,
    (_match, _quote: string, id: string) => {
      const token = crypto.randomUUID();
      tokens.set(token, id);
      return `data-import-asset="${token}"`;
    },
  );
  root.innerHTML = DOMPurify.sanitize(prepared, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: [...attrs.filter((attr) => attr !== 'src'), 'data-import-asset'],
    ALLOW_DATA_ATTR: true,
    FORBID_ATTR: ['src'],
  });
  const imageIds = new Set(parsed.images.map((image) => image.id));
  for (const element of root.querySelectorAll('*')) {
    for (const attr of [...element.attributes]) {
      if (![...attrs.filter((name) => name !== 'src'), 'data-import-asset'].includes(attr.name)) {
        element.removeAttribute(attr.name);
      }
    }
  }
  const warnings = [...parsed.warnings];
  for (const image of root.querySelectorAll('img')) {
    const id = tokens.get(image.getAttribute('data-import-asset') ?? '') ?? '';
    if (!imageIds.has(id)) {
      image.remove();
      warnings.push('已移除不可信或缺少資產的圖片');
      continue;
    }
    image.removeAttribute('data-import-asset');
    image.setAttribute('src', `${assetPrefix}${id}`);
    image.setAttribute('data-asset-id', id);
  }
  for (const element of root.querySelectorAll('[style]')) {
    const alignment = /(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*(?:;|$)/i
      .exec(element.getAttribute('style') ?? '');
    if (alignment) element.setAttribute('style', `text-align: ${alignment[1].toLowerCase()}`);
    else element.removeAttribute('style');
  }
  for (const element of root.querySelectorAll('[colspan], [rowspan]')) {
    for (const name of ['colspan', 'rowspan']) {
      const value = element.getAttribute(name);
      if (value && (!/^\d{1,2}$/.test(value) || Number(value) < 1)) {
        element.removeAttribute(name);
      }
    }
  }
  if (root.querySelector(':scope > img, :scope > table')
    || [...root.querySelectorAll(':scope > p')].some((paragraph) => paragraph.querySelector('img'))) {
    warnings.push('獨立圖片或表格的題目歸屬需人工校對');
  }
  if ([...root.querySelectorAll(':scope > p')].some((paragraph) =>
    /^\s*\d+[.、．)]/.test(paragraph.textContent ?? ''))) {
    warnings.push('一般段落中的題號未自動轉成題目，請人工校對');
  }
  const documentNode = ProseMirrorDOMParser.fromSchema(examSchema).parse(root);
  return { content: normalizeDocument(documentNode.toJSON()), warnings };
}
