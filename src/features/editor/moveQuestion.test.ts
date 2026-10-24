import { Editor, type JSONContent } from '@tiptap/core';
import { afterEach, expect, it } from 'vitest';
import { normalizeDocument } from '../../domain/document';
import { editingExtensions } from './schema';
import { moveQuestion } from './moveQuestion';

const editors: Editor[] = [];
afterEach(() => { editors.splice(0).forEach((editor) => editor.destroy()); });

function item(id: string, text: string, extra: JSONContent[] = []): JSONContent {
  return { type: 'listItem', attrs: { id, selected: id !== 'b' }, content: [
    { type: 'paragraph', content: [{ type: 'text', text }] }, ...extra,
  ] };
}

function editor(content: JSONContent[]): Editor {
  const instance = new Editor({ extensions: editingExtensions,
    content: normalizeDocument({ type: 'doc', content }) });
  editors.push(instance);
  return instance;
}

function positions(instance: Editor) {
  const found: Record<string, number> = {};
  instance.state.doc.descendants((node, position) => {
    if (node.type.name === 'listItem' && ['a', 'b', 'c'].includes(node.attrs.id)) {
      found[node.attrs.id as string] = position;
    }
  });
  return found;
}

function ids(instance: Editor): string[][] {
  return (instance.getJSON() as JSONContent).content!
    .filter((node) => node.type === 'bulletList')
    .map((node) => node.content!.map((child) => child.attrs!.id as string));
}

it('moves a complete question forward and backward in one list', () => {
  const instance = editor([{ type: 'bulletList', content: [
    item('a', 'First'), item('b', 'Second'), item('c', 'Third'),
  ] }]);
  expect(moveQuestion(instance, 'a', { position: positions(instance).c,
    placement: 'after' })).toBe(true);
  expect(ids(instance)).toEqual([['b', 'c', 'a']]);
  expect(moveQuestion(instance, 'a', { position: positions(instance).b,
    placement: 'before' })).toBe(true);
  expect(ids(instance)).toEqual([['a', 'b', 'c']]);
});

it('moves a selected subtree with options, an image and table across sections', () => {
  const source = item('b', 'Question', [
    { type: 'bulletList', content: [item('option', 'Answer')] },
    { type: 'image', attrs: { assetId: 'photo' } },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] }] }] },
  ]);
  const instance = editor([
    { type: 'heading', attrs: { id: 'heading-one', level: 2 },
      content: [{ type: 'text', text: 'One' }] },
    { type: 'bulletList', content: [source] },
    { type: 'heading', attrs: { id: 'heading-two', level: 2 },
      content: [{ type: 'text', text: 'Two' }] },
    { type: 'bulletList', content: [item('c', 'Other')] },
  ]);
  const original = (instance.getJSON() as JSONContent).content![1].content![0];
  expect(moveQuestion(instance, 'b', { position: positions(instance).c,
    placement: 'after' })).toBe(true);
  expect(ids(instance)).toEqual([['c', 'b']]);
  expect((instance.getJSON() as JSONContent).content![2].content![1]).toEqual(original);
  instance.commands.undo();
  expect(ids(instance)).toEqual([['b'], ['c']]);
  instance.commands.redo();
  expect(ids(instance)).toEqual([['c', 'b']]);
});

it('creates a list under an empty section and rejects invalid targets', () => {
  const instance = editor([
    { type: 'heading', attrs: { id: 'heading-one', level: 2 },
      content: [{ type: 'text', text: 'One' }] },
    { type: 'bulletList', content: [item('a', 'First')] },
    { type: 'heading', attrs: { id: 'heading-two', level: 2 },
      content: [{ type: 'text', text: 'Two' }] },
  ]);
  const before = instance.getJSON();
  expect(moveQuestion(instance, 'missing', { position: 0, placement: 'section' })).toBe(false);
  expect(moveQuestion(instance, 'a', { position: positions(instance).a,
    placement: 'after' })).toBe(false);
  expect(moveQuestion(instance, 'a', { position: 1, placement: 'section' })).toBe(false);
  expect(moveQuestion(instance, 'a', { position: -1, placement: 'section' })).toBe(false);
  expect(moveQuestion(instance, 'a', { position: 100000, placement: 'before' })).toBe(false);
  expect(instance.getJSON()).toEqual(before);
  const headingPosition = instance.state.doc.child(0).nodeSize
    + instance.state.doc.child(1).nodeSize;
  expect(moveQuestion(instance, 'a', { position: headingPosition,
    placement: 'section' })).toBe(true);
  expect(ids(instance)).toEqual([['a']]);
  expect((instance.getJSON() as JSONContent).content?.slice(0, 3).map((node) => node.type))
    .toEqual(['heading', 'heading', 'bulletList']);
});

it('rejects a nested option as a destination', () => {
  const instance = editor([{ type: 'bulletList', content: [
    item('a', 'First'), item('b', 'Second', [
      { type: 'bulletList', content: [item('option', 'Nested option')] },
    ]),
  ] }]);
  let nestedPosition = -1;
  instance.state.doc.descendants((node, position) => {
    if (node.type.name === 'listItem' && node.attrs.id === 'option') nestedPosition = position;
  });
  const before = instance.getJSON();
  expect(moveQuestion(instance, 'a', { position: nestedPosition,
    placement: 'after' })).toBe(false);
  expect(instance.getJSON()).toEqual(before);
});
