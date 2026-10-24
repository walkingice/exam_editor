import { imageDimensions } from './imageDimensions';
import { DocxImportError, IMPORT_LIMITS } from './limits';

export function checkImage(bytes: Uint8Array, mimeType: string, totalBytes: number): void {
  if (bytes.byteLength > IMPORT_LIMITS.imageBytes) {
    throw new DocxImportError('image-size', '圖片超過 10 MiB 限制');
  }
  if (totalBytes + bytes.byteLength > IMPORT_LIMITS.totalAssetBytes) {
    throw new DocxImportError('assets-size', '圖片總量超過 30 MiB 限制');
  }
  const [width, height] = imageDimensions(bytes, mimeType);
  if (width * height > IMPORT_LIMITS.imagePixels) {
    throw new DocxImportError('image-dimensions', '圖片超過 4,000 萬像素限制');
  }
}
