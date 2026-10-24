import type { JSONContent } from '@tiptap/core';
import { Document, LevelFormat, Paragraph } from 'docx';
import type { INumberingOptions, IParagraphOptions } from 'docx';
import { projectOutput } from '../../domain/outputProjection';
import { validatePageSettings } from '../../domain/types';
import type { PageSettings } from '../../domain/types';
import { mapParagraph } from './textMapper';

export type MappingContext = {
  warnings: Set<string>;
  numbering: INumberingOptions['config'][number][];
};

export async function mapExamDocument(source: JSONContent, settings: PageSettings) {
  validatePageSettings(settings);
  const projection = projectOutput(source, settings.outputListStyle);
  const context: MappingContext = { warnings: new Set(), numbering: [] };
  const children = (await Promise.all((projection.content ?? []).map((node) => mapBlock(node, context)))).flat();
  const document = new Document({ numbering: { config: context.numbering },
    sections: [{ children: children.length ? children : [new Paragraph('')] }] });
  return { document, warnings: [...context.warnings] };
}

export async function mapBlock(node: JSONContent, context: MappingContext, depth = 0): Promise<Paragraph[]> {
  if (node.type === 'paragraph' || node.type === 'heading') return [mapParagraph(node, context.warnings)];
  if (node.type === 'bulletList' || node.type === 'orderedList') return mapList(node, context, depth);
  if (node.type === 'horizontalRule') return [new Paragraph({ thematicBreak: true })];
  if (node.type === 'image' || node.type === 'table') throw new Error(`Unsupported export node: ${node.type}`);
  context.warnings.add(`Unsupported block style: ${node.type}; content was preserved.`);
  if (node.type === 'codeBlock') return [mapParagraph(node, context.warnings)];
  return (await Promise.all((node.content ?? []).map((child) => mapBlock(child, context, depth)))).flat();
}

async function mapList(node: JSONContent, context: MappingContext, depth = 0): Promise<Paragraph[]> {
  if (depth > 8) context.warnings.add('List depth beyond 9 levels was flattened.');
  const reference = `list-${context.numbering.length}`;
  const ordered = node.type === 'orderedList';
  context.numbering.push({ reference, levels: [{ level: Math.min(depth, 8),
    format: ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
    text: ordered ? `%${Math.min(depth, 8) + 1}.` : '•', start: ordered ? node.attrs?.start ?? 1 : 1,
    style: { paragraph: { indent: { left: 720 * (Math.min(depth, 8) + 1), hanging: 360 } } } }] });
  const result: Paragraph[] = [];
  for (const item of node.content ?? []) {
    const blocks = item.content ?? [];
    const options: IParagraphOptions = { numbering: { reference, level: Math.min(depth, 8) } };
    result.push(mapParagraph(blocks[0], context.warnings, options));
    for (const block of blocks.slice(1)) result.push(...await mapBlock(block, context, depth + 1));
  }
  return result;
}
