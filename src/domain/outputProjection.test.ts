import { expect, it } from 'vitest';
import { normalizeDocument } from './document';
import { collectAssetIds } from './assetReferences';
import { projectOutput } from './outputProjection';

it('filters top-level questions and restarts numbering after ordinary items', () => {
  const source = normalizeDocument({ type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Part one' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep' }] },
        { type: 'bulletList', content: [{ type: 'listItem', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Option' }] },
        ] }] }, { type: 'image', attrs: { assetId: 'kept' } }] },
      { type: 'listItem', attrs: { selected: false }, content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Remove' }] },
        { type: 'image', attrs: { assetId: 'removed' } },
      ] },
    ] },
    { type: 'heading', content: [{ type: 'text', text: 'Empty part' }] },
    { type: 'bulletList', content: [{ type: 'listItem', attrs: { selected: false },
      content: [{ type: 'paragraph' }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Name' }] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
  ] });
  const original = structuredClone(source);
  const result = projectOutput(source, 'ordered');
  expect(source).toEqual(original);
  expect(result.content?.map((node) => node.type)).toEqual([
    'heading', 'orderedList', 'heading', 'paragraph', 'orderedList',
  ]);
  expect(result.content?.[1].attrs?.start).toBe(1);
  expect(result.content?.[4].attrs?.start).toBe(1);
  expect(result.content?.[1].content?.[0].attrs?.id).toBe(source.content?.[1].content?.[0].attrs?.id);
  expect(result.content?.[1].content?.[0].content?.[1].type).toBe('bulletList');
  expect(collectAssetIds(result)).toEqual(new Set(['kept']));
  result.content![1].content![0].content![0].attrs!.id = 'changed';
  expect(source).toEqual(original);
  expect(projectOutput(source, 'unordered').content?.[1].type).toBe('bulletList');
});

it('keeps headings and ordinary paragraphs when all questions are excluded', () => {
  const source = normalizeDocument({ type: 'doc', content: [
    { type: 'heading' }, { type: 'paragraph' },
    { type: 'bulletList', content: [{ type: 'listItem', attrs: { selected: false },
      content: [{ type: 'paragraph' }] }] },
  ] });
  expect(projectOutput(source, 'ordered').content?.map((node) => node.type))
    .toEqual(['heading', 'paragraph']);
});

it('retains all selected questions in their current document order', () => {
  const source = normalizeDocument({ type: 'doc', content: [
    { type: 'heading', content: [{ type: 'text', text: 'Part A' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Moved' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
    ] },
    { type: 'heading', content: [{ type: 'text', text: 'Part B' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
    ] },
  ] });
  const output = projectOutput(source, 'ordered');
  expect(output.content?.[1].content?.map((item) => item.content?.[0].content?.[0].text))
    .toEqual(['Moved', 'First']);
  expect(output.content?.[3].content?.map((item) => item.content?.[0].content?.[0].text))
    .toEqual(['Second']);
  expect(output.content?.[1].attrs?.start).toBe(1);
  expect(output.content?.[3].attrs?.start).toBe(1);
});

it('continues adjacent lists but restarts after an excluded ordinary item', () => {
  const list = { type: 'bulletList', content: [
    { type: 'listItem', content: [{ type: 'paragraph' }] },
    { type: 'listItem', attrs: { selected: false }, content: [{ type: 'paragraph' }] },
    { type: 'listItem', content: [{ type: 'paragraph' }] },
  ] };
  const source = normalizeDocument({ type: 'doc', content: [
    list, list, { type: 'paragraph', attrs: { selected: false } }, list,
  ] });
  const output = projectOutput(source, 'ordered');
  expect(output.content?.map((node) => node.attrs?.start)).toEqual([1, 3, 1]);
});

it('filters unselected document items as well as questions for print', () => {
  const source = normalizeDocument({ type: 'doc', content: [
    { type: 'heading', attrs: { selected: false }, content: [{ type: 'text', text: 'Skip' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Keep' }] },
    { type: 'image', attrs: { assetId: 'skip', selected: false } },
    { type: 'paragraph', attrs: { selected: false }, content: [{ type: 'text', text: 'Skip too' }] },
  ] });
  expect(projectOutput(source, 'unordered').content?.map((node) => node.type)).toEqual(['paragraph']);
});

it('prints older items without a selection attribute', () => {
  const legacy = { type: 'doc', content: [
    { type: 'heading', attrs: { id: 'heading-1', level: 2 } },
    { type: 'paragraph', attrs: { id: 'paragraph-1' } },
  ] };
  expect(projectOutput(legacy, 'ordered').content?.map((node) => node.type))
    .toEqual(['heading', 'paragraph']);
});
