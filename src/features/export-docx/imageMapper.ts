import type { JSONContent } from '@tiptap/core';
import { ImageRun, Paragraph } from 'docx';
import type { Asset, PageSettings } from '../../domain/types';
import { pageDimensions } from '../../domain/pageSettings';
import { mmToPixels } from './formatMapper';
import { imageDimensions } from '../import-docx/imageDimensions';

export type AssetReader = (assetId: string) => Promise<Asset | undefined>;

export function createImageLoader(readAsset: AssetReader | undefined, settings: PageSettings) {
  const cache = new Map<string, Promise<{ bytes: Uint8Array; type: 'png' | 'jpg'; width: number; height: number }>>();
  const load = async (id: string) => {
    const asset = await readAsset?.(id);
    if (!asset || asset.id !== id) throw new Error(`Missing referenced image asset: ${id}`);
    if (!['image/png', 'image/jpeg'].includes(asset.mimeType) || asset.blob.type !== asset.mimeType) {
      throw new Error(`Unsupported image asset: ${id}`);
    }
    const bytes = new Uint8Array(await asset.blob.arrayBuffer());
    let size: [number, number];
    try { size = imageDimensions(bytes, asset.mimeType); }
    catch { throw new Error(`Invalid image asset: ${id}`); }
    return { bytes, type: asset.mimeType === 'image/png' ? 'png' as const : 'jpg' as const,
      width: size[0], height: size[1] };
  };
  return async (node: JSONContent, availableWidthMm?: number) => {
    const id = node.attrs?.assetId as string;
    if (!cache.has(id)) cache.set(id, load(id));
    const image = await cache.get(id)!;
    const page = pageDimensions(settings);
    const requestedWidth = node.attrs?.widthMm == null ? image.width : mmToPixels(node.attrs.widthMm);
    const width = Math.min(requestedWidth, mmToPixels(availableWidthMm ?? page.contentWidthMm),
      mmToPixels(page.contentHeightMm) * image.width / image.height);
    return new Paragraph({ children: [new ImageRun({ type: image.type, data: image.bytes,
      transformation: { width, height: width * image.height / image.width },
      altText: { name: node.attrs?.alt ?? '', description: node.attrs?.title ?? '' } })] });
  };
}
