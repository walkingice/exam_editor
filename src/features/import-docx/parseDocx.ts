import mammoth from 'mammoth/mammoth.browser.js';
import { checkImage } from './checkImage';
import { checkCancelled, DocxImportError, IMPORT_LIMITS } from './limits';

export type ParsedImage = { id: string; mimeType: 'image/png' | 'image/jpeg'; blob: Blob };
export type ParsedDocx = { html: string; images: ParsedImage[]; warnings: string[] };

const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const allowedFileMimes = new Set(['', docxMime, 'application/zip', 'application/octet-stream']);

function checkFile(file: File, bytes: Uint8Array): void {
  if (!file.name.toLowerCase().endsWith('.docx') || !allowedFileMimes.has(file.type)
    || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new DocxImportError('file-type', '請選擇有效的 DOCX 檔案');
  }
}

export async function parseDocx(file: File, signal?: AbortSignal): Promise<ParsedDocx> {
  checkCancelled(signal);
  if (file.size > IMPORT_LIMITS.docxBytes) {
    throw new DocxImportError('file-size', 'DOCX 超過 20 MiB 限制');
  }
  const arrayBuffer = await file.arrayBuffer();
  checkCancelled(signal);
  checkFile(file, new Uint8Array(arrayBuffer));
  const images: ParsedImage[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;
  let imageError: DocxImportError | null = null;
  let result: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
  try {
    result = await mammoth.convertToHtml({ arrayBuffer }, {
      externalFileAccess: false,
      styleMap: ['u => u'],
      convertImage: mammoth.images.imgElement(async (image) => {
        checkCancelled(signal);
        if (image.contentType !== 'image/png' && image.contentType !== 'image/jpeg') {
          warnings.push(`不支援的圖片格式：${image.contentType}`);
          return { src: '' };
        }
        try {
          const bytes = new Uint8Array(await image.readAsArrayBuffer());
          checkCancelled(signal);
          checkImage(bytes, image.contentType, totalBytes);
          totalBytes += bytes.byteLength;
          const id = crypto.randomUUID();
          images.push({ id, mimeType: image.contentType,
            blob: new Blob([new Uint8Array(bytes)], { type: image.contentType }) });
          return { src: `import-asset:${id}` };
        } catch (cause) {
          if (cause instanceof DocxImportError) imageError = cause;
          throw cause;
        }
      }),
    });
  } catch (cause) {
    checkCancelled(signal);
    if (cause instanceof DocxImportError) throw cause;
    throw new DocxImportError('invalid-docx', 'DOCX 損壞或無法解析');
  }
  checkCancelled(signal);
  if (imageError) throw imageError;
  if (result.messages.some((message) => message.type === 'error')) {
    throw new DocxImportError('invalid-docx', 'DOCX 含有無法解析的內容或圖片');
  }
  warnings.push(...result.messages.map((message) => message.message));
  return { html: result.value, images, warnings };
}

