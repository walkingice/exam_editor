import type { PageSettings, PaperSize } from './types';

export const PAPER_DIMENSIONS_MM: Record<PaperSize, readonly [number, number]> = {
  TW_B4: [265, 379], A4: [210, 297],
};

export const PAGE_INPUT_LIMITS = {
  marginMm: 100, fontSizePt: [6, 72], lineHeight: [0.5, 4],
} as const;

export function pageDimensions(settings: PageSettings) {
  const [short, long] = PAPER_DIMENSIONS_MM[settings.paperSize] ?? [];
  const width = settings.orientation === 'landscape' ? long : short;
  const height = settings.orientation === 'landscape' ? short : long;
  return { widthMm: width, heightMm: height,
    contentWidthMm: width - settings.marginsMm.left - settings.marginsMm.right,
    contentHeightMm: height - settings.marginsMm.top - settings.marginsMm.bottom };
}
