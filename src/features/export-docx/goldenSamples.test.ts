import { readFileSync } from 'node:fs';
import type { JSONContent } from '@tiptap/core';
import { Packer } from 'docx';
import JSZip from 'jszip';
import { expect, it } from 'vitest';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import { projectOutput } from '../../domain/outputProjection';
import { parseDocx } from '../import-docx/parseDocx';
import { normalizeImport } from '../import-docx/normalizeImport';
import { mapExamDocument } from './mapDocument';
import { mmToTwips } from './formatMapper';
import { normalizeDocument } from '../../domain/document';

const samples = [
  { name: 'chinese-questions', text: ['國語試卷', '第一題：選擇正確答案', '選項甲', '第二題：請閱讀短文'], images: 0, tables: 0, questions: 2 },
  { name: 'mixed-marks', text: ['一般文字 ', '粗體', '斜體', '底線'], images: 0, tables: 0, questions: 0 },
  { name: 'mixed-images', text: ['兩張圖片與大圖'], images: 2, tables: 0, questions: 0 },
  { name: 'merged-table', text: ['合併儲存格', '跨兩欄', '右欄', '第一欄', '第二欄'], images: 0, tables: 1, questions: 0 },
  { name: 'multi-page', text: Array.from({ length: 120 }, (_, i) => `第 ${i + 1} 段：多頁試卷內容。`), images: 0, tables: 0, questions: 0 },
  { name: 'unsupported-elements', text: ['公式、文字方塊與圖形'], images: 0, tables: 0, questions: 0 },
];

function textNodes(node: JSONContent): string[] {
  return node.type === 'text' ? [node.text ?? ''] : (node.content ?? []).flatMap(textNodes);
}

it.each(samples)('round trips the $name golden sample semantically', async (sample) => {
  const parsed = await parseDocx(new File([readFileSync(`src/test/fixtures/docx/${sample.name}.docx`)], `${sample.name}.docx`));
  const source = normalizeImport(parsed).content;
  const before = structuredClone(source);
  const questions = source.content?.filter((node) => node.type === 'bulletList').flatMap((node) => node.content ?? []) ?? [];
  expect(questions).toHaveLength(sample.questions);
  expect(questions.every((node) => node.attrs?.selected === true)).toBe(true);
  expect(textNodes(source)).toEqual(sample.text);
  const assets = parsed.images.map((asset) => ({ ...asset, projectId: 'golden' }));
  for (const outputListStyle of ['ordered', 'unordered'] as const) {
    const settings = { ...DEFAULT_PAGE_SETTINGS, outputListStyle };
    const mapped = await mapExamDocument(source, settings, async (id) => assets.find((asset) => asset.id === id));
    const zip = await JSZip.loadAsync(await Packer.toBuffer(mapped.document));
    const xml = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'text/xml');
    expect([...xml.getElementsByTagName('w:t')].map((node) => node.textContent)).toEqual(sample.text);
    expect(xml.getElementsByTagName('w:tbl')).toHaveLength(sample.tables);
    expect(xml.getElementsByTagName('w:drawing')).toHaveLength(sample.images);
    expect(Object.keys(zip.files).filter((name) => name.startsWith('word/media/') && !zip.files[name].dir)).toHaveLength(sample.images);
    expect(xml.getElementsByTagName('w:pgSz')[0].getAttribute('w:w')).toBe(String(mmToTwips(265)));
    expect(xml.getElementsByTagName('w:pgSz')[0].getAttribute('w:h')).toBe(String(mmToTwips(379)));
    expect(xml.getElementsByTagName('w:pgMar')[0].getAttribute('w:left')).toBe(String(mmToTwips(15)));
    expect(textNodes(projectOutput(source, outputListStyle))).toEqual(sample.text);
  }
  expect(source).toEqual(before);
});

it('keeps excluded fixture tables and images in source while all outputs omit their subtree', async () => {
  const imported = await Promise.all(['mixed-images', 'merged-table'].map(async (name) => {
    const parsed = await parseDocx(new File([readFileSync(`src/test/fixtures/docx/${name}.docx`)], `${name}.docx`));
    return normalizeImport(parsed).content.content ?? [];
  }));
  const source = normalizeDocument({ type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Retained heading' }] },
    { type: 'bulletList', content: [{ type: 'listItem', attrs: { selected: false }, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Excluded subtree' }] }, ...imported.flat(),
    ] }] },
  ] });
  const before = structuredClone(source);
  for (const outputListStyle of ['ordered', 'unordered'] as const) {
    expect(textNodes(projectOutput(source, outputListStyle))).toEqual(['Retained heading']);
    const mapped = await mapExamDocument(source, { ...DEFAULT_PAGE_SETTINGS, outputListStyle }, async () => {
      throw new Error('Excluded images must never be loaded');
    });
    const zip = await JSZip.loadAsync(await Packer.toBuffer(mapped.document));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Retained heading');
    expect(xml).not.toContain('Excluded subtree');
    expect(xml).not.toContain('<w:tbl>');
    expect(xml).not.toContain('<w:drawing>');
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(false);
  }
  expect(source).toEqual(before);
  expect(JSON.stringify(source)).toContain('跨兩欄');
  expect(JSON.stringify(source)).toContain('assetId');
});
