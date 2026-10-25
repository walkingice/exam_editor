import type { JSONContent } from '@tiptap/core';
import { Document, LevelFormat, Paragraph } from 'docx';
import type { INumberingOptions, IParagraphOptions } from 'docx';
import { projectOutput } from '../../domain/outputProjection';
import { validatePageSettings } from '../../domain/types';
import type { PageSettings } from '../../domain/types';
import { mapParagraph } from './textMapper';
import { createImageLoader } from './imageMapper';
import type { AssetReader } from './imageMapper';
import { mapTable } from './tableMapper';
import type { OutputBlock } from './tableMapper';
import { documentStyles, sectionProperties } from './formatMapper';
import { pageDimensions } from '../../domain/pageSettings';

export type MappingContext = {
  warnings: Set<string>;
  settings: PageSettings;
  image: ReturnType<typeof createImageLoader>;
  widthMm: number;
  numbering: INumberingOptions['config'][number][];
};

export async function mapExamDocument(source: JSONContent, settings: PageSettings, readAsset?: AssetReader) {
  settings = structuredClone(settings);
  validatePageSettings(settings);
  const projection = projectOutput(source, settings.outputListStyle);
  const context: MappingContext = { warnings: new Set(), numbering: [], settings,
    image: createImageLoader(readAsset, settings), widthMm: pageDimensions(settings).contentWidthMm };
  const children = (await Promise.all((projection.content ?? []).map((node) => mapBlock(node, context)))).flat();
  const document = new Document({ styles: documentStyles(settings), numbering: { config: context.numbering },
    sections: [{ properties: sectionProperties(settings), children: children.length ? children : [new Paragraph('')] }] });
  return { document, warnings: [...context.warnings] };
}

export async function mapBlock(node: JSONContent, context: MappingContext, depth = 0, widthMm = context.widthMm): Promise<OutputBlock[]> {
  if (node.type === 'paragraph' || node.type === 'heading') return [mapParagraph(node, context.warnings, context.settings)];
  if (node.type === 'bulletList' || node.type === 'orderedList') return mapList(node, context, depth, widthMm);
  if (node.type === 'horizontalRule') return [new Paragraph({ thematicBreak: true })];
  if (node.type === 'pageBreak') return [new Paragraph({ pageBreakBefore: true })];
  if (node.type === 'image') return [await context.image(node, widthMm)];
  if (node.type === 'table') return [await mapTable(node, (child, cellWidth) =>
    mapBlock(child, context, depth, cellWidth), context.warnings, widthMm)];
  context.warnings.add(`Unsupported block style: ${node.type}; content was preserved.`);
  if (node.type === 'codeBlock') return [mapParagraph(node, context.warnings, context.settings)];
  return (await Promise.all((node.content ?? []).map((child) => mapBlock(child, context, depth, widthMm)))).flat();
}

async function mapList(node: JSONContent, context: MappingContext, depth = 0, widthMm = context.widthMm): Promise<OutputBlock[]> {
  if (depth > 8) context.warnings.add('List depth beyond 9 levels was flattened.');
  const reference = `list-${context.numbering.length}`;
  const ordered = node.type === 'orderedList';
  context.numbering.push({ reference, levels: [{ level: Math.min(depth, 8),
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${Math.min(depth, 8) + 1}.` : '•', start: ordered ? node.attrs?.start ?? 1 : 1,
    style: { paragraph: { indent: { left: 720 * (Math.min(depth, 8) + 1), hanging: 360 } } } }] });
  const result: OutputBlock[] = [];
  for (const item of node.content ?? []) {
    const blocks = item.content ?? [];
    const options: IParagraphOptions = { numbering: { reference, level: Math.min(depth, 8) } };
    result.push(mapParagraph(blocks[0], context.warnings, context.settings, options));
    for (const block of blocks.slice(1)) result.push(...await mapBlock(block, context, depth + 1, Math.max(1, widthMm - 12.7)));
  }
  return result;
}
