import type { JSONContent } from '@tiptap/core';
import { Packer } from 'docx';
import type { PageSettings } from '../../domain/types';
import type { AssetReader } from './imageMapper';
import { mapExamDocument } from './mapDocument';

export function docxFilename(name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '').trim().slice(0, 180);
  return `${safe || 'exam'}.docx`;
}

export async function createDocxDownload(content: JSONContent, settings: PageSettings,
  readAsset: AssetReader) {
  const mapped = await mapExamDocument(content, settings, readAsset);
  return { blob: await Packer.toBlob(mapped.document), warnings: mapped.warnings };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Allow the browser to consume the download before releasing its URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
