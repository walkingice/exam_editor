import type { JSONContent } from '@tiptap/core';
import { AlignmentType, HeadingLevel, Paragraph, TextRun } from 'docx';
import type { IParagraphOptions } from 'docx';

export function textRuns(node: JSONContent, warnings: Set<string>): TextRun[] {
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })];
  if (node.type !== 'text') return (node.content ?? []).flatMap((child) => textRuns(child, warnings));
  const marks = new Set(node.marks?.map((mark) => mark.type));
  for (const mark of marks) {
    if (!['bold', 'italic', 'underline', 'strike', 'code'].includes(mark)) {
      warnings.add(`Unsupported text style: ${mark}; text was preserved.`);
    }
  }
  return [new TextRun({ text: node.text ?? '', bold: marks.has('bold'),
    italics: marks.has('italic'), underline: marks.has('underline') ? {} : undefined,
    strike: marks.has('strike'), font: marks.has('code') ? 'Courier New' : undefined })];
}

export function paragraphOptions(node: JSONContent, warnings: Set<string>): IParagraphOptions {
  const alignments = { left: AlignmentType.LEFT, center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED };
  const alignment = node.attrs?.textAlign as keyof typeof alignments | undefined;
  if (alignment && !alignments[alignment]) warnings.add(`Unsupported alignment: ${alignment}.`);
  const headings = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  return { children: textRuns(node, warnings), alignment: alignment ? alignments[alignment] : undefined,
    heading: node.type === 'heading' ? headings[(node.attrs?.level ?? 1) - 1] : undefined };
}

export function mapParagraph(node: JSONContent, warnings: Set<string>, options: IParagraphOptions = {}) {
  return new Paragraph({ ...paragraphOptions(node, warnings), ...options });
}
