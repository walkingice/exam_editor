import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Document, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import mammoth from 'mammoth/mammoth.browser.js';
import { imageDimensions } from './imageDimensions';
import { DocxImportError } from './limits';
import { parseDocx } from './parseDocx';

const png = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII='
), (char) => char.charCodeAt(0));
const jpeg = new Uint8Array(readFileSync('src/test/fixtures/red.jpg'));

async function docxFile(withImage = false): Promise<File> {
  const children = [new Paragraph({ children: [new TextRun('中文試題')] })];
  if (withImage) children.push(new Paragraph({ children: [new ImageRun({
    data: png, type: 'png', transformation: { width: 1, height: 1 },
  })] }));
  const blob = await Packer.toBlob(new Document({ sections: [{ children }] }));
  return new File([blob], 'exam.docx', { type:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

describe('parseDocx', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses real DOCX text and retains images only in memory', async () => {
    const result = await parseDocx(await docxFile(true));
    expect(result.html).toContain('中文試題');
    expect(result.html).toContain(`import-asset:${result.images[0].id}`);
    expect(result.images[0].blob.type).toBe('image/png');
    expect(result.images[0].blob.size).toBe(png.length);
  });

  it('rejects disguised and damaged files with identifiable errors', async () => {
    await expect(parseDocx(new File(['fake'], 'exam.docx', { type: 'image/png' })))
      .rejects.toMatchObject({ code: 'file-type' });
    await expect(parseDocx(new File(['PK\x03\x04broken'], 'exam.docx')))
      .rejects.toMatchObject({ code: 'invalid-docx' });
  });

  it('stops on cancellation', async () => {
    const signal = AbortSignal.abort();
    await expect(parseDocx(await docxFile(), signal))
      .rejects.toMatchObject({ code: 'cancelled' });
  });

  it('checks image dimensions and rejects malformed headers', () => {
    expect(imageDimensions(png, 'image/png')).toEqual([1, 1]);
    expect(imageDimensions(jpeg, 'image/jpeg')).toEqual([1, 1]);
    expect(() => imageDimensions(new Uint8Array([1, 2, 3]), 'image/png'))
      .toThrow(DocxImportError);
  });

  it('rejects an image above the pixel limit even if Mammoth reports it as a warning', async () => {
    const large = png.slice();
    new DataView(large.buffer).setUint32(16, 7000);
    new DataView(large.buffer).setUint32(20, 7000);
    vi.spyOn(mammoth, 'convertToHtml').mockImplementation(async (_input, options) => {
      const convert = options?.convertImage as unknown as (
        image: { contentType: string; readAsArrayBuffer: () => Promise<ArrayBuffer> },
        messages: unknown[],
      ) => Promise<unknown>;
      await convert({ contentType: 'image/png', readAsArrayBuffer: async () => large.buffer }, [])
        .catch(() => undefined);
      return { value: '<p>text</p>', messages: [{ type: 'warning', message: 'image failed' }] };
    });
    await expect(parseDocx(await docxFile()))
      .rejects.toMatchObject({ code: 'image-dimensions' });
  });

  it('returns unsupported image and Mammoth warnings', async () => {
    vi.spyOn(mammoth, 'convertToHtml').mockImplementation(async (_input, options) => {
      const convert = options?.convertImage as unknown as (
        image: { contentType: string }, messages: unknown[],
      ) => Promise<unknown>;
      await convert({ contentType: 'image/gif' }, []);
      return { value: '<p>text</p>', messages: [{ type: 'warning', message: 'unknown style' }] };
    });
    const result = await parseDocx(await docxFile());
    expect(result.images).toHaveLength(0);
    expect(result.warnings).toEqual(['不支援的圖片格式：image/gif', 'unknown style']);
  });

  it('fails when Mammoth reports a conversion error', async () => {
    vi.spyOn(mammoth, 'convertToHtml').mockResolvedValue({
      value: '<p>incomplete</p>', messages: [{ type: 'error', message: 'broken image', error: Error() }],
    });
    await expect(parseDocx(await docxFile()))
      .rejects.toMatchObject({ code: 'invalid-docx' });
  });

  it('rejects an oversized embedded image', async () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    oversized.set(png);
    vi.spyOn(mammoth, 'convertToHtml').mockImplementation(async (_input, options) => {
      const convert = options?.convertImage as unknown as (
        image: { contentType: string; readAsArrayBuffer: () => Promise<ArrayBuffer> },
        messages: unknown[],
      ) => Promise<unknown>;
      await convert({ contentType: 'image/png', readAsArrayBuffer: async () => oversized.buffer }, [])
        .catch(() => undefined);
      return { value: '', messages: [] };
    });
    await expect(parseDocx(await docxFile()))
      .rejects.toMatchObject({ code: 'image-size' });
  });

  it('honors cancellation while Mammoth is converting', async () => {
    const controller = new AbortController();
    vi.spyOn(mammoth, 'convertToHtml').mockImplementation(async () => {
      controller.abort();
      return { value: '<p>unused</p>', messages: [] };
    });
    await expect(parseDocx(await docxFile(), controller.signal))
      .rejects.toMatchObject({ code: 'cancelled' });
  });

  it('rejects images exceeding the total asset limit', async () => {
    const image = new Uint8Array(8 * 1024 * 1024);
    image.set(png);
    vi.spyOn(mammoth, 'convertToHtml').mockImplementation(async (_input, options) => {
      const convert = options?.convertImage as unknown as (
        image: { contentType: string; readAsArrayBuffer: () => Promise<ArrayBuffer> },
        messages: unknown[],
      ) => Promise<unknown>;
      for (let count = 0; count < 4; count += 1) {
        await convert({ contentType: 'image/png', readAsArrayBuffer: async () => image.buffer }, [])
          .catch(() => undefined);
      }
      return { value: '', messages: [] };
    });
    await expect(parseDocx(await docxFile()))
      .rejects.toMatchObject({ code: 'assets-size' });
  });
});
