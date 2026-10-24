import { DocxImportError } from './limits';

export function imageDimensions(bytes: Uint8Array, mimeType: string): [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png') {
    if (bytes.length < 24 || ![137, 80, 78, 71, 13, 10, 26, 10]
      .every((value, index) => bytes[index] === value)) return invalid();
    return valid(view.getUint32(16), view.getUint32(20));
  }
  if (mimeType !== 'image/jpeg' || bytes[0] !== 0xff || bytes[1] !== 0xd8) return invalid();
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return invalid();
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
    if (offset + 2 > bytes.length) return invalid();
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) return invalid();
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
      .includes(marker)) {
      if (length < 7) return invalid();
      return valid(view.getUint16(offset + 5), view.getUint16(offset + 3));
    }
    offset += length;
  }
  return invalid();
}

function valid(width: number, height: number): [number, number] {
  if (!width || !height) return invalid();
  return [width, height];
}

function invalid(): never {
  throw new DocxImportError('image-dimensions', '圖片格式無效或無法讀取尺寸');
}
