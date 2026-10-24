import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import type { Asset } from '../../domain/types';
import type { ProjectRepository } from '../../data/repository';
import { checkImage } from '../import-docx/checkImage';
import { IMPORT_LIMITS } from '../import-docx/limits';

export async function insertLocalImage(file: File, projectId: string, editor: Editor,
  repository: ProjectRepository, isCurrent: () => boolean): Promise<void> {
  if (!isCurrent()) return;
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
    throw new Error('只支援 PNG 或 JPEG 圖片');
  }
  if (file.size > IMPORT_LIMITS.imageBytes) throw new Error('圖片超過 10 MiB 限制');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isCurrent()) return;
  checkImage(bytes, file.type, 0);
  const asset: Asset = { id: crypto.randomUUID(), projectId, mimeType: file.type,
    blob: file, originalName: file.name };
  await repository.addAsset(asset);
  if (!isCurrent()) return;
  if (!editor.chain().focus().insertContent({ type: 'image', attrs: {
    assetId: asset.id, alt: file.name,
  } }).run()) throw new Error('無法插入圖片');
  editor.view.dispatch(closeHistory(editor.state.tr));
}
