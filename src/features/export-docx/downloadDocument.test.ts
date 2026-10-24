import { afterEach, expect, it, vi } from 'vitest';
import { normalizeDocument } from '../../domain/document';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { createDocxDownload, docxFilename, downloadBlob } from './downloadDocument';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it('sanitizes illegal filename characters and supplies an empty-name fallback', () => {
  expect(docxFilename('試卷<>:"/\\|?*\u0000. ')).toBe('試卷__________.docx');
  expect(docxFilename(' ... ')).toBe('exam.docx');
  expect(docxFilename('測驗')).toBe('測驗.docx');
  expect(docxFilename('a'.repeat(300))).toHaveLength(185);
});

it('creates a DOCX Blob from editable semantic content', async () => {
  const result = await createDocxDownload(normalizeDocument({ type: 'doc', content: [{ type: 'paragraph',
    content: [{ type: 'text', text: '中文試卷' }] }] }), DEFAULT_PAGE_SETTINGS, async () => undefined);
  expect(result.blob.size).toBeGreaterThan(0);
  expect(result.blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  expect(result.warnings).toEqual([]);
});

it('removes the download anchor and releases its URL after browser consumption', () => {
  vi.useFakeTimers();
  const createObjectURL = vi.fn(() => 'blob:download');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('試卷.docx');
    expect(this.href).toBe('blob:download');
    expect(document.body.contains(this)).toBe(true);
  });
  const blob = new Blob(['docx']);
  downloadBlob(blob, '試卷.docx');
  expect(createObjectURL).toHaveBeenCalledWith(blob);
  expect(click).toHaveBeenCalledOnce();
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revokeObjectURL).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:download');
});

it('also releases resources when initiating the download fails', () => {
  vi.useFakeTimers();
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:failed', revokeObjectURL });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('Blocked'); });
  expect(() => downloadBlob(new Blob(), '試卷.docx')).toThrow('Blocked');
  expect(document.querySelector('a[download]')).toBeNull();
  vi.runAllTimers();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed');
});
