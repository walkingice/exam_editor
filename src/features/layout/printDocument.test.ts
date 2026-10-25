import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { countPrintImages, createPrintCss, waitForPrintAssets } from './printDocument';

it('generates physical page dimensions and applies margins only in @page', () => {
  const settings = { ...DEFAULT_PAGE_SETTINGS, paperSize: 'TW_B4' as const,
    orientation: 'landscape' as const };
  const css = createPrintCss(settings);
  expect(css).toContain('@page { size: 379mm 265mm; margin: 15mm 15mm 15mm 15mm; }');
  expect(css).toContain('font-size: 12pt; line-height: 1.5');
  expect(css).toContain('overflow: visible !important');
  expect(css).not.toContain('#exam-print-root { break-inside: avoid');
});

it.each([
  ['TW_B4', 'portrait', '265mm 379mm'], ['TW_B4', 'landscape', '379mm 265mm'],
  ['A4', 'portrait', '210mm 297mm'], ['A4', 'landscape', '297mm 210mm'],
] as const)('generates %s %s physical print size', (paperSize, orientation, size) => {
  const settings = { ...DEFAULT_PAGE_SETTINGS, paperSize, orientation };
  expect(createPrintCss(settings)).toContain(`@page { size: ${size};`);
});

it('waits for fonts and decoded images before printing', async () => {
  const root = document.createElement('div');
  const image = document.createElement('img');
  image.src = 'data:image/png;base64,AA==';
  root.append(image);
  Object.defineProperty(image, 'complete', { value: true });
  Object.defineProperty(image, 'naturalWidth', { value: 2 });
  image.decode = vi.fn(async () => {});
  const fonts = { ready: Promise.resolve() } as unknown as FontFaceSet;
  await waitForPrintAssets(root, fonts);
  expect(image.decode).toHaveBeenCalledOnce();
});

it('reports unavailable print images', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<span aria-label="缺少圖片"></span>';
  await expect(waitForPrintAssets(root, { ready: Promise.resolve() } as unknown as FontFaceSet))
    .rejects.toThrow('列印圖片載入失敗');
});

it('waits until asynchronously resolved image nodes enter the print DOM', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<div class="exam-image"><span>圖片載入中…</span></div>';
  const waiting = waitForPrintAssets(root, { ready: Promise.resolve() } as unknown as FontFaceSet);
  window.setTimeout(() => {
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1 });
    image.decode = async () => {};
    root.querySelector('.exam-image')?.replaceChildren(image);
  }, 0);
  await waiting;
});

it('prints two columns with spanning headers and a divider', () => {
  const css = createPrintCss({ ...DEFAULT_PAGE_SETTINGS, columns: 2 });
  expect(css).toContain('column-count: 2');
  expect(css).toContain('column-rule: 1px solid #777');
  expect(css).toContain('.ProseMirror > h1, #exam-print-root .ProseMirror > h2 { column-span: all; }');
  expect(createPrintCss({ ...DEFAULT_PAGE_SETTINGS, columns: undefined })).toContain('column-count: 1');
});

it('starts a new printed page at each page break item', () => {
  const css = createPrintCss(DEFAULT_PAGE_SETTINGS);
  expect(css).toContain('#exam-print-root .exam-page-break');
  expect(css).toMatch(/\.exam-page-break[^}]*break-after:\s*page/);
  expect(css).toMatch(/\.exam-page-break[^}]*visibility:\s*hidden/);
});

it('hides page break markers in the layout preview', () => {
  const css = readFileSync('src/app/styles.css', 'utf8');
  expect(css).toMatch(/\.preview-paper \.exam-page-break\s*\{[^}]*visibility:\s*hidden/);
});


it('counts nested document images', () => {
  expect(countPrintImages({ type: 'doc', content: [
    { type: 'image' }, { type: 'blockquote', content: [{ type: 'image' }] },
  ] })).toBe(2);
});

it('waits for every image node view instead of checking raw placeholder images', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<img><img class="ProseMirror-separator">';
  let printed = false;
  const waiting = waitForPrintAssets(root, { ready: Promise.resolve() } as unknown as FontFaceSet, 2)
    .then(() => { printed = true; });
  const appendImage = () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'exam-image';
    const image = document.createElement('img');
    Object.defineProperty(image, 'complete', { value: true });
    Object.defineProperty(image, 'naturalWidth', { value: 1 });
    wrapper.append(image);
    root.append(wrapper);
  };
  await Promise.resolve();
  expect(printed).toBe(false);
  appendImage();
  await Promise.resolve();
  expect(printed).toBe(false);
  appendImage();
  await waiting;
  expect(printed).toBe(true);
});


it('still rejects a broken document image while ignoring editor helper images', async () => {
  const root = document.createElement('div');
  root.innerHTML = '<img class="ProseMirror-separator"><div class="exam-image"><img></div>';
  const image = root.querySelector('.exam-image img')!;
  Object.defineProperty(image, 'complete', { value: true });
  Object.defineProperty(image, 'naturalWidth', { value: 0 });
  await expect(waitForPrintAssets(root,
    { ready: Promise.resolve() } as unknown as FontFaceSet, 1))
    .rejects.toThrow('列印圖片載入失敗');
});
