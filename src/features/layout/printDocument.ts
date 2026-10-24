import type { JSONContent } from '@tiptap/core';
import type { PageSettings } from '../../domain/types';
import { pageDimensions } from '../../domain/pageSettings';

export function createPrintCss(settings: PageSettings): string {
  const page = pageDimensions(settings);
  const { top, right, bottom, left } = settings.marginsMm;
  return `#exam-print-root { display: none; }\n`
    + `@page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }\n`
    + '@media print { html, body { margin: 0 !important; padding: 0 !important; '
    + 'height: auto !important; overflow: visible !important; } body * { visibility: hidden !important; } '
    + '#exam-print-root, #exam-print-root * { visibility: visible !important; } '
    + '#exam-print-root { display: block !important; position: static !important; '
    + 'width: auto !important; min-height: 0 !important; margin: 0 !important; padding: 0 !important; '
    + 'overflow: visible !important; color: #000; font-family: system-ui, "Noto Sans TC", sans-serif; '
    + `font-size: ${settings.defaultFontSizePt}pt; line-height: ${settings.lineHeight}; } `
    + '#exam-print-root .exam-document { min-height: 0 !important; padding: 0 !important; '
    + 'border: 0 !important; border-radius: 0 !important; background: transparent !important; } '
    + '#exam-print-root .document-item-control, #exam-print-root .question-drag-handle, '
    + '#exam-print-root .ProseMirror, #exam-print-root .ProseMirror-focused { outline: none !important; } '
    + '#exam-print-root .document-item-control, #exam-print-root .question-drag-handle { display: none !important; } '
    + `#exam-print-root .ProseMirror { column-count: ${settings.columns ?? 1}; column-gap: 10mm; `
    + `column-rule: ${settings.columns === 2 ? '1px solid #777' : 'none'}; } `
    + '#exam-print-root .ProseMirror > h1, #exam-print-root .ProseMirror > h2 { column-span: all; } '
    + '#exam-print-root li, #exam-print-root .exam-image { break-inside: avoid; } '
    + '#exam-print-root img { max-width: 100%; height: auto; } '
    + '#exam-print-root table { max-width: 100%; border-collapse: collapse; } '
    + '#exam-print-root tr, #exam-print-root img { break-inside: avoid; } }';
}

export function countPrintImages(content: JSONContent): number {
  return (content.type === 'image' ? 1 : 0)
    + (content.content ?? []).reduce((total, child) => total + countPrintImages(child), 0);
}

export async function waitForPrintAssets(root: HTMLElement, fonts: FontFaceSet,
  expectedImageCount?: number): Promise<void> {
  await Promise.all([fonts.ready, waitForImageNodes(root, expectedImageCount)]);
  if (root.querySelector('[aria-label="缺少圖片"]')) throw new Error('列印圖片載入失敗，請檢查圖片後重試。');
  const selector = expectedImageCount === undefined ? 'img:not(.ProseMirror-separator)' : '.exam-image img';
  const images = [...root.querySelectorAll<HTMLImageElement>(selector)];
  await Promise.all(images.map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => reject(new Error('列印圖片載入失敗，請重試。')), { once: true });
    });
    if (image.naturalWidth === 0) throw new Error('列印圖片載入失敗，請重試。');
    if (typeof image.decode === 'function') await image.decode();
  }));
}

function waitForImageNodes(root: HTMLElement, expectedImageCount?: number): Promise<void> {
  const hasPendingImages = () => {
    const containers = [...root.querySelectorAll('.exam-image')];
    return (expectedImageCount !== undefined && containers.length !== expectedImageCount)
      || containers.some((container) => !container.querySelector('img, [aria-label="缺少圖片"]'));
  };
  if (!hasPendingImages()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!hasPendingImages()) { clearTimeout(timeout); observer.disconnect(); resolve(); }
    });
    const timeout = setTimeout(() => {
      observer.disconnect(); reject(new Error('等待圖片載入逾時，請重試列印。'));
    }, 15000);
    observer.observe(root, { childList: true, subtree: true });
  });
}
