import type { Editor } from '@tiptap/core';
import { pageDimensions } from '../../domain/pageSettings';
import type { PageSettings } from '../../domain/types';

export type FormatChange = { textAlign?: 'left' | 'center' | 'right';
  spacingAfterMm?: number; widthMm?: number | null };

export function updateSourceFormat(editor: Editor, id: string, change: FormatChange,
  settings: PageSettings): void {
  let match: { position: number; type: string; attrs: Record<string, unknown> } | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs.id === id) {
      match = { position, type: node.type.name, attrs: node.attrs };
      return false;
    }
    return true;
  });
  if (!match) throw new Error('找不到對應的來源節點');
  const target = match as { position: number; type: string; attrs: Record<string, unknown> };
  const paragraph = target.type === 'paragraph' || target.type === 'heading';
  if ((change.textAlign !== undefined || change.spacingAfterMm !== undefined) && !paragraph
    || change.widthMm !== undefined && target.type !== 'image') {
    throw new Error('此節點不支援該格式');
  }
  if (change.textAlign !== undefined && !['left', 'center', 'right'].includes(change.textAlign)) {
    throw new Error('無效的對齊設定');
  }
  if (change.spacingAfterMm !== undefined && (!Number.isFinite(change.spacingAfterMm)
    || change.spacingAfterMm < 0 || change.spacingAfterMm > 30)) {
    throw new Error('段落間距必須介於 0–30 mm');
  }
  if (change.widthMm != null && (!Number.isFinite(change.widthMm) || change.widthMm <= 0
    || change.widthMm > pageDimensions(settings).contentWidthMm)) {
    throw new Error('圖片寬度超過內容區');
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(target.position, undefined,
    { ...target.attrs, ...change }));
}
