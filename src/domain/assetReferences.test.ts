import { expect, it } from 'vitest';
import { collectAssetIds } from './assetReferences';

it('collects shared images throughout the full document, including unselected questions', () => {
  const ids = collectAssetIds({ type: 'doc', content: [
    { type: 'image', attrs: { assetId: 'shared' } },
    { type: 'bulletList', content: [{ type: 'listItem', attrs: { selected: false },
      content: [{ type: 'paragraph', content: [
        { type: 'image', attrs: { assetId: 'shared' } },
        { type: 'image', attrs: { assetId: 'unselected' } },
      ] }] }] },
  ] });
  expect(ids).toEqual(new Set(['shared', 'unselected']));
});
