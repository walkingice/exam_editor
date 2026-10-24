import { readFileSync } from 'node:fs';
import { Blob as NodeBlob } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import { Packer } from 'docx';
import JSZip from 'jszip';
import type { JSONContent } from '@tiptap/core';
import { normalizeDocument } from '../../domain/document';
import { DEFAULT_PAGE_SETTINGS } from '../../domain/types';
import type { Asset } from '../../domain/types';
import { mapExamDocument } from './mapDocument';
import { paragraph, question } from './testHelpers';

const image = (assetId: string, widthMm?: number): JSONContent => ({ type: 'image', attrs: { assetId, widthMm } });
function asset(id: string, file = 'large.png', mimeType = 'image/png'): Asset {
  return { id, projectId: 'project', mimeType,
    blob: new NodeBlob([readFileSync(`src/test/fixtures/${file}`)], { type: mimeType }) as Blob };
}
const source = (content: JSONContent[]) => normalizeDocument({ type: 'doc', content });
async function packed(content: JSONContent[], assets: Asset[]) {
  const reader = vi.fn(async (id: string) => assets.find((item) => item.id === id));
  const mapped = await mapExamDocument(source(content), DEFAULT_PAGE_SETTINGS, reader);
  const zip = await JSZip.loadAsync(await Packer.toBuffer(mapped.document));
  const xml = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'text/xml');
  return { reader, mapped, zip, xml };
}

describe('DOCX tables and media', () => {
  it('preserves editable cells, nested text, lists, and merged cells inside a question', async () => {
    const item = question('題目');
    item.content!.push({ type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2 }, content: [paragraph('合併欄')] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', attrs: { rowspan: 2, colwidth: [100] },
        content: [paragraph('合併列'), { type: 'bulletList', content: [question('格內選項')] }] },
      { type: 'tableCell', content: [paragraph('右上')] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph('右下')] }] },
    ] });
    const { xml, mapped } = await packed([{ type: 'bulletList', content: [item] }], []);
    expect(xml.getElementsByTagName('w:tbl')).toHaveLength(1);
    expect(xml.getElementsByTagName('w:tr')).toHaveLength(3);
    expect(xml.getElementsByTagName('w:gridSpan')[0].getAttribute('w:val')).toBe('2');
    expect(xml.getElementsByTagName('w:vMerge')[0].getAttribute('w:val')).toBe('restart');
    expect(xml.documentElement.textContent).toContain('格內選項');
    expect(mapped.warnings).toContain('Table cell widths and CSS were replaced with equal logical columns.');
  });

  it('embeds only referenced PNG/JPEG bytes, caches repeated reads, and preserves image ratios', async () => {
    const hidden = question('隱藏', false);
    hidden.content!.push(image('hidden'));
    const { zip, xml, reader } = await packed([image('png', 25.4), image('png', 50.8), image('jpg'),
      { type: 'bulletList', content: [hidden] }], [asset('png'), asset('jpg', 'red.jpg', 'image/jpeg')]);
    expect(reader.mock.calls.map(([id]) => id).sort()).toEqual(['jpg', 'png']);
    const entries = Object.keys(zip.files).filter((name) => /^word\/media\/[^/]+$/.test(name));
    expect(entries).toHaveLength(2);
    const media = await Promise.all(entries.map((name) => zip.file(name)!.async('uint8array')));
    expect(media.some((bytes) => Buffer.from(bytes).equals(readFileSync('src/test/fixtures/large.png')))).toBe(true);
    expect(media.some((bytes) => Buffer.from(bytes).equals(readFileSync('src/test/fixtures/red.jpg')))).toBe(true);
    const extents = [...xml.getElementsByTagName('wp:extent')];
    expect(extents).toHaveLength(3);
    expect(Number(extents[0].getAttribute('cx'))).toBeCloseTo(914400, -1);
    expect(Number(extents[1].getAttribute('cx'))).toBe(Number(extents[0].getAttribute('cx')) * 2);
    expect(Number(extents[0].getAttribute('cx')) / Number(extents[0].getAttribute('cy')))
      .toBeCloseTo(Number(extents[1].getAttribute('cx')) / Number(extents[1].getAttribute('cy')), 4);
  });

  it('fails explicitly for missing, mismatched, unsupported, or corrupt referenced assets', async () => {
    await expect(mapExamDocument(source([image('missing')]), DEFAULT_PAGE_SETTINGS)).rejects.toThrow('Missing referenced image asset');
    await expect(mapExamDocument(source([image('expected')]), DEFAULT_PAGE_SETTINGS, async () => asset('wrong')))
      .rejects.toThrow('Missing referenced image asset');
    await expect(mapExamDocument(source([image('gif')]), DEFAULT_PAGE_SETTINGS,
      async () => ({ ...asset('gif'), mimeType: 'image/gif' }))).rejects.toThrow('Unsupported image asset');
    await expect(mapExamDocument(source([image('bad')]), DEFAULT_PAGE_SETTINGS,
      async () => ({ ...asset('bad'), blob: new NodeBlob(['bad'], { type: 'image/png' }) as Blob })))
      .rejects.toThrow('Invalid image asset');
  });

  it('fits oversized images and ends nested-table cells with a paragraph', async () => {
    const cell = (content: JSONContent[]): JSONContent => ({ type: 'tableCell', content });
    const table = (content: JSONContent[]): JSONContent => ({ type: 'table',
      content: [{ type: 'tableRow', content: [cell(content)] }] });
    const { xml } = await packed([image('png', 379), table([table([image('png', 379)])])], [asset('png')]);
    const extents = [...xml.getElementsByTagName('wp:extent')];
    const emuPerMm = 36000;
    for (const extent of extents) {
      expect(Number(extent.getAttribute('cx'))).toBeLessThanOrEqual(235 * emuPerMm);
      expect(Number(extent.getAttribute('cy'))).toBeLessThanOrEqual(349 * emuPerMm);
    }
    expect(Number(extents[1].getAttribute('cx'))).toBeLessThan(Number(extents[0].getAttribute('cx')));
    const parentCell = xml.getElementsByTagName('w:tc')[0];
    expect(parentCell.lastElementChild?.tagName).toBe('w:p');
    expect(xml.getElementsByTagName('w:tbl')).toHaveLength(2);
  });

  it('excludes all unselected table and image subtrees without reading assets', async () => {
    const hidden = question('不輸出', false);
    hidden.content!.push(image('not-stored'), { type: 'table', content: [{ type: 'tableRow',
      content: [{ type: 'tableCell', content: [paragraph('隱藏表格')] }] }] });
    const { xml, reader, zip } = await packed([{ type: 'bulletList', content: [hidden] }], []);
    expect(reader).not.toHaveBeenCalled();
    expect(xml.getElementsByTagName('w:tbl')).toHaveLength(0);
    expect(xml.documentElement.textContent).not.toContain('不輸出');
    expect(Object.keys(zip.files).some((name) => name.startsWith('word/media/'))).toBe(false);
  });
});
