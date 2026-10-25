import type { JSONContent } from '@tiptap/core';
import { AlignmentType, HeadingLevel, Paragraph, TextRun } from 'docx';
import type { IParagraphOptions } from 'docx';
import type { PageSettings } from '../../domain/types';
import { paragraphSpacing } from './formatMapper';
import { validFontFamily, validFontSize } from '../editor/fontStyles';

export function textRuns(node: JSONContent, warnings: Set<string>): TextRun[] {
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })];
  if (node.type !== 'text') return (node.content ?? []).flatMap((child) => textRuns(child, warnings));
  const marks = new Set(node.marks?.map((mark) => mark.type));
  const fontFamily = node.marks?.find((mark) => mark.type === 'fontFamily')?.attrs?.fontFamily;
  const fontSize = node.marks?.find((mark) => mark.type === 'fontSize')?.attrs?.fontSize;
  if (fontFamily != null && !validFontFamily(fontFamily)) warnings.add('Unsupported font family; text was preserved.');
  if (fontSize != null && !validFontSize(fontSize)) warnings.add('Unsupported font size; text was preserved.');
  for (const mark of marks) {
    if (!['bold', 'italic', 'underline', 'strike', 'code', 'fontFamily', 'fontSize'].includes(mark)) {
      warnings.add(`Unsupported text style: ${mark}; text was preserved.`);
    }
  }
  return [new TextRun({ text: node.text ?? '', bold: marks.has('bold'),
    italics: marks.has('italic'), underline: marks.has('underline') ? {} : undefined,
    strike: marks.has('strike'), font: validFontFamily(fontFamily) ? fontFamily
      : (marks.has('code') ? 'Courier New' : undefined),
    size: validFontSize(fontSize) ? Number.parseFloat(fontSize) * 2 : undefined })];
}

export function paragraphOptions(node: JSONContent, warnings: Set<string>): IParagraphOptions {
  const alignments = { left: AlignmentType.LEFT, center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
  const alignment = node.attrs?.textAlign as keyof typeof alignments | undefined;
  const knownAlignment = alignment && Object.hasOwn(alignments, alignment);
  if (alignment && !knownAlignment) warnings.add(`Unsupported alignment: ${alignment}.`);
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  if (node.type === 'heading' && !headings[(node.attrs?.level ?? 1) - 1]) {
    warnings.add('Unsupported heading level; text was preserved as a paragraph.');
  }
  return { children: textRuns(node, warnings), alignment: knownAlignment ? alignments[alignment] : undefined,
    heading: node.type === 'heading' ? headings[(node.attrs?.level ?? 1) - 1] : undefined };
}

export function mapParagraph(node: JSONContent, warnings: Set<string>, settings: PageSettings, options: IParagraphOptions = {}) {
  return new Paragraph({ ...paragraphOptions(node, warnings), ...paragraphSpacing(node, settings), ...options });
}
