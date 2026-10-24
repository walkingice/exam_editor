import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  Document, HeadingLevel, ImageRun, Math, MathFraction, MathRun, Packer,
  Paragraph, Table, TableCell, TableRow, TextRun, WpsShapeRun,
} from 'docx';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'src/test/fixtures/docx');
await mkdir(output, { recursive: true });

async function save(name, children, options = {}) {
  const document = new Document({ ...options, sections: [{ children }] });
  await writeFile(join(output, `${name}.docx`), await Packer.toBuffer(document));
}

const png = await readFile(join(root, 'src/test/fixtures/large.png'));
const jpeg = await readFile(join(root, 'src/test/fixtures/red.jpg'));

await save('chinese-questions', [
  new Paragraph({ text: '國語試卷', heading: HeadingLevel.HEADING_1 }),
  new Paragraph({ text: '第一題：選擇正確答案', bullet: { level: 0 } }),
  new Paragraph({ text: '選項甲', bullet: { level: 1 } }),
  new Paragraph({ text: '第二題：請閱讀短文', bullet: { level: 0 } }),
]);

await save('mixed-marks', [
  new Paragraph({ children: [new TextRun('一般文字 '),
    new TextRun({ text: '粗體', bold: true }),
    new TextRun({ text: '斜體', italics: true }),
    new TextRun({ text: '底線', underline: {} })] }),
]);

await save('mixed-images', [
  new Paragraph({ text: '兩張圖片與大圖' }),
  new Paragraph({ children: [new ImageRun({ data: png, type: 'png',
    transformation: { width: 400, height: 400 }, altText: { title: 'Large PNG',
      description: 'Large PNG', name: 'large.png' } })] }),
  new Paragraph({ children: [new ImageRun({ data: jpeg, type: 'jpg',
    transformation: { width: 100, height: 100 }, altText: { title: 'Small JPEG',
      description: 'Small JPEG', name: 'red.jpg' } })] }),
]);

await save('merged-table', [
  new Paragraph({ text: '合併儲存格' }),
  new Table({ rows: [
    new TableRow({ children: [
      new TableCell({ children: [new Paragraph('跨兩欄')], columnSpan: 2 }),
      new TableCell({ children: [new Paragraph('右欄')], rowSpan: 2 }),
    ] }),
    new TableRow({ children: [
      new TableCell({ children: [new Paragraph('第一欄')] }),
      new TableCell({ children: [new Paragraph('第二欄')] }),
    ] }),
  ] }),
]);

await save('multi-page', Array.from({ length: 120 }, (_, index) =>
  new Paragraph({ text: `第 ${index + 1} 段：多頁試卷內容。`,
    pageBreakBefore: index > 0 && index % 40 === 0 })));

await save('unsupported-elements', [
  new Paragraph({ text: '公式、文字方塊與圖形' }),
  new Paragraph({ children: [new Math({ children: [new MathFraction({
    numerator: [new MathRun('1')], denominator: [new MathRun('2')],
  })] })] }),
  new Paragraph({ children: [new WpsShapeRun({ type: 'wps',
    transformation: { width: 180, height: 60 },
    children: [new Paragraph('文字方塊內容')],
  })] }),
]);
