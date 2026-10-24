import { describe, expect, it } from 'vitest';
import { generateJSON } from '@tiptap/core';
import { examExtensions } from '../features/editor/schema';
import { normalizeDocument, validateDocument } from './document';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS, validatePageSettings } from './types';
import { pageDimensions } from './pageSettings';

describe('exam document schema', () => {
  it('creates a valid empty document with default page settings', () => {
    const document = createEmptyDocument('project-1');
    expect(() => validateDocument(document.content)).not.toThrow();
    expect(document.content.content?.[0].attrs?.id).toBeTruthy();
    expect(DEFAULT_PAGE_SETTINGS).toMatchObject({
      paperSize: 'TW_B4', outputListStyle: 'ordered', defaultFontSizePt: 12,
    });
    expect(() => validatePageSettings(DEFAULT_PAGE_SETTINGS)).not.toThrow();
  });

  it('preserves mixed content and treats nested list items as options', () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '題目' }] },
      { type: 'orderedList', attrs: { start: 4 }, content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Question', marks: [{ type: 'bold' }] }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Option' }] },
        ] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] },
        ] }] },
        { type: 'image', attrs: { assetId: 'asset-1' } },
      ] }] },
    ] });
    const questions = content.content?.[1];
    expect(questions?.type).toBe('bulletList');
    expect(questions?.attrs?.start).toBeUndefined();
    expect(questions?.content?.[0].attrs?.selected).toBe(true);
    expect(questions?.content?.[0].content?.[1].content?.[0].attrs?.selected).toBeNull();
    expect(normalizeDocument(content)).toEqual(content);
  });

  it('repairs duplicate IDs without replacing the first valid ID', () => {
    const content = normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', attrs: { id: 'same' } },
      { type: 'paragraph', attrs: { id: 'same' } },
    ] });
    expect(content.content?.[0].attrs?.id).toBe('same');
    expect(content.content?.[1].attrs?.id).not.toBe('same');
  });

  it('does not turn a list inside a blockquote into questions', () => {
    const content = normalizeDocument({ type: 'doc', content: [{ type: 'blockquote', content: [
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
    ] }] });
    expect(content.content?.[0].content?.[0].content?.[0].attrs?.selected).toBeNull();
  });

  it('selects imported list items without a selection attribute', () => {
    const parsed = generateJSON('<ol><li><p>Question</p></li></ol>', examExtensions);
    const content = normalizeDocument(parsed);
    expect(content.content?.[0].content?.[0].attrs?.selected).toBe(true);
  });

  it('accepts older document items without a selection attribute', () => {
    const legacy = { type: 'doc', content: [
      { type: 'heading', attrs: { id: 'heading-1', level: 2 } },
      { type: 'paragraph', attrs: { id: 'paragraph-1' } },
    ] };
    expect(() => validateDocument(legacy)).not.toThrow();
    expect(normalizeDocument(legacy).content?.map((item) => item.attrs?.selected))
      .toEqual([true, true]);
    expect(() => validateDocument({ type: 'doc', content: [
      { type: 'paragraph', attrs: { id: 'invalid', selected: 'yes' } },
    ] })).toThrow('Invalid item selection');
    expect(() => normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', attrs: { selected: 'yes' } },
    ] })).toThrow('Invalid item selection');
  });

  it('rejects unsupported and malformed document content', () => {
    expect(() => normalizeDocument({ type: 'doc', content: [{ type: 'unknown' }] })).toThrow();
    expect(() => normalizeDocument({ type: 'doc', content: [{ type: 'image' }] })).toThrow();
    expect(() => validateDocument({ type: 'paragraph', attrs: { id: 'x' } })).toThrow();
    expect(() => normalizeDocument({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'X', marks: [{ type: 'unknown' }] }] },
    ] })).toThrow();
  });

  it('rejects margins that leave no printable area', () => {
    expect(() => validatePageSettings({
      ...DEFAULT_PAGE_SETTINGS,
      marginsMm: { ...DEFAULT_PAGE_SETTINGS.marginsMm, left: 250 },
    })).toThrow();
  });

  it('calculates both paper sizes and orientations', () => {
    expect(pageDimensions(DEFAULT_PAGE_SETTINGS)).toEqual({
      widthMm: 265, heightMm: 379, contentWidthMm: 235, contentHeightMm: 349,
    });
    expect(pageDimensions({ ...DEFAULT_PAGE_SETTINGS, orientation: 'landscape' })).toEqual({
      widthMm: 379, heightMm: 265, contentWidthMm: 349, contentHeightMm: 235,
    });
    expect(pageDimensions({ ...DEFAULT_PAGE_SETTINGS, paperSize: 'A4' })).toEqual({
      widthMm: 210, heightMm: 297, contentWidthMm: 180, contentHeightMm: 267,
    });
    expect(pageDimensions({ ...DEFAULT_PAGE_SETTINGS, paperSize: 'A4',
      orientation: 'landscape' })).toEqual({
      widthMm: 297, heightMm: 210, contentWidthMm: 267, contentHeightMm: 180,
    });
  });

  it('rejects non-finite and out-of-range typography values', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 0, 5, 73]) {
      expect(() => validatePageSettings({ ...DEFAULT_PAGE_SETTINGS,
        defaultFontSizePt: value })).toThrow();
    }
    for (const value of [Number.NaN, 0, 0.4, 4.1]) {
      expect(() => validatePageSettings({ ...DEFAULT_PAGE_SETTINGS, lineHeight: value })).toThrow();
    }
    expect(() => validatePageSettings({ ...DEFAULT_PAGE_SETTINGS,
      marginsMm: { ...DEFAULT_PAGE_SETTINGS.marginsMm, top: -1 } })).toThrow();
  });
});

it('accepts legacy column settings and rejects unsupported column counts', () => {
  expect(() => validatePageSettings({ ...DEFAULT_PAGE_SETTINGS, columns: undefined })).not.toThrow();
  expect(() => validatePageSettings({ ...DEFAULT_PAGE_SETTINGS, columns: 2 })).not.toThrow();
  expect(() => validatePageSettings({ ...DEFAULT_PAGE_SETTINGS, columns: 3 as 2 })).toThrow();
});
