import { describe, expect, it } from 'vitest';
import { paragraph, question, unpack } from './testHelpers';

describe('DOCX text mapping', () => {
  it('exports editable Chinese, headings, marks, breaks, and alignment without mutating source', async () => {
    const source = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 },
      content: [{ type: 'text', text: '中文試卷' }] }, { type: 'paragraph', attrs: { textAlign: 'center' },
      content: [{ type: 'text', text: '粗斜底線', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'underline' }] },
        { type: 'hardBreak' }, { type: 'text', text: '連結', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] }] };
    const before = structuredClone(source);
    const { xml, warnings } = await unpack(source);
    for (const value of ['中文試卷', 'Heading2', '<w:b', '<w:i', '<w:u', '<w:br', 'w:val="center"', '連結']) expect(xml).toContain(value);
    expect(warnings).toContain('Unsupported text style: link; text was preserved.');
    expect(source).toEqual(before);
  });

  it('restarts numbering after headings, filters subtrees, and keeps nested bullets', async () => {
    const first = question('第一題');
    first.content!.push({ type: 'bulletList', content: [question('選項')] });
    const source = { type: 'doc', content: [{ type: 'bulletList', content: [first, question('排除', false)] },
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: '第二大題' }] },
      { type: 'bulletList', content: [question('第二題')] }] };
    const { xml, numbering } = await unpack(source);
    expect(xml.indexOf('第一題')).toBeLessThan(xml.indexOf('第二大題'));
    expect(xml).not.toContain('排除');
    const decimalLevels = numbering.match(/<w:lvl\b[^>]*>.*?<\/w:lvl>/g)!
      .filter((level) => level.includes('w:val="decimal"'));
    expect(decimalLevels).toHaveLength(2);
    for (const level of decimalLevels) expect(level).toContain('<w:start w:val="1"');
    expect(numbering).toContain('w:val="bullet"');
    expect(xml).toContain('<w:ilvl w:val="1"');
    expect(numbering).toContain('w:left="1440"');
    const unordered = await unpack(source, 'unordered');
    expect(unordered.numbering).not.toContain('w:val="decimal"');
  });

  it('exports mixed question list styles from item settings', async () => {
    const ordered = { ...question('編號題'), attrs: { listStyle: 'ordered' } };
    const unordered = { ...question('項目題'), attrs: { listStyle: 'unordered' } };
    const source = { type: 'doc', content: [{ type: 'bulletList',
      content: [ordered, unordered, ordered] }] };
    const { xml, numbering } = await unpack(source, 'unordered');
    expect(xml.indexOf('編號題')).toBeLessThan(xml.indexOf('項目題'));
    expect(numbering).toContain('w:val="decimal"');
    expect(numbering).toContain('w:val="bullet"');
  });

  it('supports an empty output and preserves unsupported block text with warnings', async () => {
    const { xml, warnings } = await unpack({ type: 'doc', content: [{ type: 'blockquote', content: [paragraph('引言')] },
      { type: 'bulletList', content: [question('隱藏', false)] }] });
    expect(xml).toContain('引言');
    expect(xml).not.toContain('隱藏');
    expect(warnings.some((warning) => warning.includes('blockquote'))).toBe(true);
    expect((await unpack({ type: 'doc', content: [paragraph('')] })).xml).toContain('<w:p');
  });
});
