export const IMPORT_LIMITS = {
  docxBytes: 20 * 1024 * 1024,
  imageBytes: 10 * 1024 * 1024,
  imagePixels: 40_000_000,
  totalAssetBytes: 30 * 1024 * 1024,
} as const;

export type ImportErrorCode = 'cancelled' | 'file-type' | 'file-size'
  | 'invalid-docx' | 'image-size' | 'image-dimensions' | 'assets-size';

export class DocxImportError extends Error {
  constructor(readonly code: ImportErrorCode, message: string) {
    super(message);
    this.name = 'DocxImportError';
  }
}

export function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DocxImportError('cancelled', '匯入已取消');
}
