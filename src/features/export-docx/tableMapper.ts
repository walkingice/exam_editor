import type { JSONContent } from '@tiptap/core';
import { Paragraph, Table, TableCell, TableRow, WidthType } from 'docx';

export type OutputBlock = Paragraph | Table;
type BlockMapper = (node: JSONContent, widthMm?: number) => Promise<OutputBlock[]>;

export async function mapTable(node: JSONContent, mapBlock: BlockMapper,
  warnings: Set<string>, widthMm: number): Promise<Table> {
  const rows: TableRow[] = [];
  // Equal logical columns are a deliberate fallback for browser-specific widths.
  const columns = Math.max(1, ...(node.content ?? []).map((row) =>
    (row.content ?? []).reduce((count, cell) => count + (cell.attrs?.colspan ?? 1), 0)));
  for (const row of node.content ?? []) {
    const cells: TableCell[] = [];
    for (const cell of row.content ?? []) {
      if (cell.attrs?.colwidth || cell.attrs?.style) {
        warnings.add('Table cell widths and CSS were replaced with equal logical columns.');
      }
      const span = cell.attrs?.colspan ?? 1;
      const children = (await Promise.all((cell.content ?? []).map((child) =>
        mapBlock(child, Math.max(1, widthMm * span / columns - 4))))).flat();
      // Word cells must end in a paragraph, including cells containing nested tables.
      if (!(children.at(-1) instanceof Paragraph)) children.push(new Paragraph(''));
      cells.push(new TableCell({ children, columnSpan: span, rowSpan: cell.attrs?.rowspan ?? 1 }));
    }
    rows.push(new TableRow({ children: cells,
      tableHeader: row.content?.every((cell) => cell.type === 'tableHeader') }));
  }
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}
