import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeImport } from './normalizeImport';
import { parseDocx } from './parseDocx';

async function fixture(name: string) {
  const bytes = readFileSync(`src/test/fixtures/docx/${name}.docx`);
  const file = new File([bytes], `${name}.docx`, { type:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const parsed = await parseDocx(file);
  return { parsed, normalized: normalizeImport(parsed) };
}

describe('DOCX acceptance fixtures', () => {
  it('preserves Chinese headings, questions, and nested options', async () => {
    const { normalized } = await fixture('chinese-questions');
    expect(normalized.content.content?.[0].type).toBe('heading');
    expect(normalized.content.content?.[1].type).toBe('bulletList');
    expect(normalized.content.content?.[1].content?.[0].attrs?.selected).toBe(true);
    expect(JSON.stringify(normalized.content)).toContain('選項甲');
  });

  it('preserves bold, italic, and explicit underline', async () => {
    const { normalized } = await fixture('mixed-marks');
    const value = JSON.stringify(normalized.content);
    expect(value).toContain('"type":"bold"');
    expect(value).toContain('"type":"italic"');
    expect(value).toContain('"type":"underline"');
  });

  it('keeps PNG, JPEG, and a large image as assets', async () => {
    const { parsed, normalized } = await fixture('mixed-images');
    expect(parsed.images.map((image) => image.mimeType)).toEqual(['image/png', 'image/jpeg']);
    const value = JSON.stringify(normalized.content);
    for (const image of parsed.images) expect(value).toContain(image.id);
  });

  it('preserves merged and multi-column tables', async () => {
    const { normalized } = await fixture('merged-table');
    const value = JSON.stringify(normalized.content);
    expect(value).toContain('"colspan":2');
    expect(value).toContain('"rowspan":2');
    expect(value).toContain('第二欄');
  });

  it('keeps long multi-page text without dropping the last paragraph', async () => {
    const { normalized } = await fixture('multi-page');
    expect(normalized.content.content).toHaveLength(120);
    expect(JSON.stringify(normalized.content)).toContain('第 120 段');
  });

  it('warns about unsupported equations and records text box loss', async () => {
    const { parsed, normalized } = await fixture('unsupported-elements');
    expect(parsed.warnings.join(' ')).toContain('unrecognised element');
    expect(JSON.stringify(normalized.content)).toContain('公式、文字方塊與圖形');
    expect(JSON.stringify(normalized.content)).not.toContain('文字方塊內容');
  });
});
