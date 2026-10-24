import { describe, expect, it } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import type { PageSettings } from '../../domain/types';
import { normalizeDocument } from '../../domain/document';
import { mapExamDocument } from './mapDocument';
import { lineHeightToUnits, mmToPixels, mmToTwips, ptToHalfPoints } from './formatMapper';
import { paragraph } from './testHelpers';

const parse = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml');
const attr = (xml: Document, tag: string, name: string) =>
  xml.getElementsByTagName(tag)[0].getAttribute(`w:${name}`);

describe('DOCX page and paragraph formatting', () => {
  it.each([
    ['TW_B4', 'portrait', 265, 379], ['TW_B4', 'landscape', 379, 265],
    ['A4', 'portrait', 210, 297], ['A4', 'landscape', 297, 210],
  ] as const)('maps %s %s dimensions without swapping twice', async (paperSize, orientation, width, height) => {
    const settings = { ...DEFAULT_PAGE_SETTINGS, paperSize, orientation,
      marginsMm: { top: 15, right: 12, bottom: 18, left: 20 } };
    const mapped = await mapExamDocument(normalizeDocument({ type: 'doc', content: [paragraph('格式')] }), settings);
    const zip = await JSZip.loadAsync(await Packer.toBuffer(mapped.document));
    const xml = parse(await zip.file('word/document.xml')!.async('string'));
    expect(Number(attr(xml, 'w:pgSz', 'w'))).toBe(mmToTwips(width));
    expect(Number(attr(xml, 'w:pgSz', 'h'))).toBe(mmToTwips(height));
    expect(attr(xml, 'w:pgSz', 'orient')).toBe(orientation);
    for (const [side, mm] of Object.entries(settings.marginsMm)) {
      expect(Number(attr(xml, 'w:pgMar', side))).toBe(mmToTwips(mm));
    }
  });

  it('maps document typography and local spacing/alignment with bounded rounding', async () => {
    const node = paragraph('局部格式');
    node.attrs = { spacingAfterMm: 6.5, textAlign: 'justify' };
    const settings: PageSettings = { ...DEFAULT_PAGE_SETTINGS, defaultFontSizePt: 13.3, lineHeight: 1.75 };
    const { document } = await mapExamDocument(normalizeDocument({ type: 'doc', content: [node] }), settings);
    const zip = await JSZip.loadAsync(await Packer.toBuffer(document));
    const xml = parse(await zip.file('word/document.xml')!.async('string'));
    const styles = parse(await zip.file('word/styles.xml')!.async('string'));
    expect(Number(attr(styles, 'w:sz', 'val'))).toBe(27);
    expect(Number(attr(styles, 'w:szCs', 'val'))).toBe(27);
    expect(attr(xml, 'w:spacing', 'line')).toBe('420');
    expect(attr(xml, 'w:spacing', 'lineRule')).toBe('auto');
    expect(Number(attr(xml, 'w:spacing', 'after'))).toBe(mmToTwips(6.5));
    expect(attr(xml, 'w:jc', 'val')).toBe('both');
    expect(Math.abs(mmToTwips(15) * 25.4 / 1440 - 15)).toBeLessThan(25.4 / 2880);
    expect(ptToHalfPoints(12)).toBe(24);
    expect(lineHeightToUnits(1.5)).toBe(360);
    expect(mmToPixels(25.4)).toBeCloseTo(96);
  });

  it('rejects invalid settings before reading assets', async () => {
    await expect(mapExamDocument(normalizeDocument({ type: 'doc', content: [paragraph('文字')] }),
      { ...DEFAULT_PAGE_SETTINGS, lineHeight: NaN })).rejects.toThrow('Invalid');
  });
});
