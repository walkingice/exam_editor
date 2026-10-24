import { describe, expect, it } from 'vitest';
import { normalizeImport } from './normalizeImport';
import type { ParsedDocx } from './parseDocx';

function parsed(html: string): ParsedDocx {
  return { html, images: [{ id: 'image-1', mimeType: 'image/png',
    blob: new Blob(['image'], { type: 'image/png' }) }], warnings: [] };
}

function semantic(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => key === 'id' ? undefined : item);
}

describe('normalizeImport', () => {
  it('removes scripts, event handlers, URLs and forged image references', () => {
    const result = normalizeImport(parsed('<script>alert(1)</script><p onclick="evil()">安全文字'
      + '<a href="javascript:evil()">連結</a></p><img src="https://evil.test/a.png">'
      + '<img src="import-asset:missing"><img data-import-asset="image-1">'
      + '<img src="import-asset:image-1" onerror="evil()">'));
    const content = JSON.stringify(result.content);
    expect(content).toContain('安全文字');
    expect(content).toContain('image-1');
    expect(content).not.toMatch(/script|evil|https:|javascript:|onerror|missing/);
    expect(result.warnings).toContain('已移除不可信或缺少資產的圖片');
  });

  it('normalizes top-level ordered questions and keeps nested options', () => {
    const result = normalizeImport(parsed('<h2>中文試題</h2><ol><li><p>第一題 <strong>重點</strong>'
      + '</p><ul><li><p>選項 A</p></li></ul><table><tr><td><p>表格</p></td></tr></table>'
      + '<img src="import-asset:image-1"></li></ol>'));
    expect(result.content.content?.[1].type).toBe('bulletList');
    const question = result.content.content?.[1].content?.[0];
    expect(question?.attrs?.selected).toBe(true);
    expect(question?.content?.[1].content?.[0].attrs?.selected).toBeNull();
    expect(semantic(result.content)).toMatch(/中文試題.*第一題.*重點.*選項 A.*表格.*image-1/);
    expect(semantic(result.content)).toContain('"type":"bold"');
  });

  it('preserves loose content and warns about uncertain question ownership', () => {
    const result = normalizeImport(parsed('<p>1. 第一題</p><table><tr><td>資料</td></tr></table>'
      + '<img src="import-asset:image-1">'));
    expect(result.content.content?.[0].type).toBe('paragraph');
    expect(result.warnings).toEqual(expect.arrayContaining([
      '一般段落中的題號未自動轉成題目，請人工校對',
      '獨立圖片或表格的題目歸屬需人工校對',
    ]));
  });

  it('produces the same semantic content on repeated imports', () => {
    const input = parsed('<p>中文 <em>斜體</em></p><ul><li>題目</li></ul>');
    expect(semantic(normalizeImport(input).content))
      .toBe(semantic(normalizeImport(input).content));
  });

  it('keeps safe alignment and merged table cells', () => {
    const result = normalizeImport(parsed('<p style="color:red;text-align:center">置中</p>'
      + '<table><tr><td colspan="2" rowspan="2">跨欄</td></tr></table>'));
    expect(result.content.content?.[0].attrs?.textAlign).toBe('center');
    expect(result.content.content?.[1].content?.[0].content?.[0].attrs)
      .toMatchObject({ colspan: 2, rowspan: 2 });
    expect(semantic(result.content)).not.toContain('color:red');
  });

  it('warns about an image wrapped in a top-level paragraph', () => {
    const result = normalizeImport(parsed('<p><img src="import-asset:image-1"></p>'));
    expect(result.warnings).toContain('獨立圖片或表格的題目歸屬需人工校對');
  });
});
