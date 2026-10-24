import { LineRuleType, PageOrientation } from 'docx';
import type { IParagraphOptions, ISectionPropertiesOptions, IStylesOptions } from 'docx';
import type { JSONContent } from '@tiptap/core';
import type { PageSettings } from '../../domain/types';
import { PAPER_DIMENSIONS_MM } from '../../domain/pageSettings';

export const mmToTwips = (mm: number) => Math.round(mm * 1440 / 25.4);
export const ptToHalfPoints = (pt: number) => Math.round(pt * 2);
export const lineHeightToUnits = (multiple: number) => Math.round(multiple * 240);
export const mmToPixels = (mm: number) => mm * 96 / 25.4;

export function sectionProperties(settings: PageSettings): ISectionPropertiesOptions {
  // docx 9.14 swaps width and height when serializing landscape sections.
  const [width, height] = PAPER_DIMENSIONS_MM[settings.paperSize];
  const margin = settings.marginsMm;
  return { page: { size: { width: mmToTwips(width), height: mmToTwips(height),
    orientation: settings.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
  margin: { top: mmToTwips(margin.top), right: mmToTwips(margin.right),
    bottom: mmToTwips(margin.bottom), left: mmToTwips(margin.left) } } };
}

export function paragraphSpacing(node: JSONContent, settings: PageSettings): IParagraphOptions {
  return { spacing: { after: mmToTwips(node.attrs?.spacingAfterMm ?? 0),
    line: lineHeightToUnits(settings.lineHeight), lineRule: LineRuleType.AUTO } };
}

export function documentStyles(settings: PageSettings): IStylesOptions {
  return { default: { document: { run: { size: ptToHalfPoints(settings.defaultFontSizePt),
    sizeComplexScript: ptToHalfPoints(settings.defaultFontSizePt) },
  paragraph: { spacing: { line: lineHeightToUnits(settings.lineHeight), lineRule: LineRuleType.AUTO } } } } };
}
