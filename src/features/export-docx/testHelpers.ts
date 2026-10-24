import { Packer } from 'docx';
import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';
import { normalizeDocument } from '../../domain/document';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { mapExamDocument } from './mapDocument';

export const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
export const question = (text: string, selected = true): JSONContent => ({ type: 'listItem',
  attrs: { selected }, content: [paragraph(text)] });
export async function unpack(source: JSONContent, style: 'ordered' | 'unordered' = 'ordered') {
  const result = await mapExamDocument(normalizeDocument(source), { ...DEFAULT_PAGE_SETTINGS, outputListStyle: style });
  const zip = await JSZip.loadAsync(await Packer.toBuffer(result.document));
  return { ...result, zip, xml: await zip.file('word/document.xml')!.async('string'),
    numbering: await zip.file('word/numbering.xml')!.async('string') };
}

