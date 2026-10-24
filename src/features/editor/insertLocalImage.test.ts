import { readFileSync } from 'node:fs';
import { Editor } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../data/repository';
import { normalizeDocument } from '../../domain/document';
import { editingExtensions } from './schema';
import { insertLocalImage } from './insertLocalImage';

const jpeg = new Uint8Array(readFileSync('src/test/fixtures/red.jpg'));
const editors: Editor[] = [];

function editor(): Editor {
  const value = new Editor({ extensions: editingExtensions,
    content: normalizeDocument({ type: 'doc', content: [{ type: 'paragraph' }] }) });
  editors.push(value);
  return value;
}

function file(): File {
  return new File([jpeg], 'red.jpg', { type: 'image/jpeg' });
}

afterEach(() => { editors.splice(0).forEach((value) => value.destroy()); });

it('stores an asset before inserting a persistent reference that supports undo', async () => {
  const current = editor();
  const writes: string[] = [];
  const repository = { addAsset: vi.fn(async () => { writes.push('asset'); }) } as
    unknown as ProjectRepository;
  current.on('update', () => writes.push('document'));
  await insertLocalImage(file(), 'first', current, repository, () => true);
  expect(writes).toEqual(['asset', 'document']);
  const image = current.getJSON().content?.find((node) => node.type === 'image');
  expect(image?.attrs?.assetId).toBeTruthy();
  expect(image?.attrs?.src).toBeNull();
  expect(normalizeDocument(current.getJSON()).content?.some((node) => node.type === 'image'))
    .toBe(true);
  let position = -1;
  current.state.doc.descendants((node, offset) => {
    if (node.type.name === 'image') position = offset;
  });
  current.commands.setNodeSelection(position);
  current.commands.deleteSelection();
  expect(current.getJSON().content?.some((node) => node.type === 'image')).toBe(false);
  current.commands.undo();
  expect(current.getJSON().content?.some((node) => node.type === 'image')).toBe(true);
});

it('rejects invalid type, oversized and corrupt images without writing', async () => {
  const current = editor();
  const repository = { addAsset: vi.fn() } as unknown as ProjectRepository;
  await expect(insertLocalImage(new File(['gif'], 'a.gif', { type: 'image/gif' }),
    'first', current, repository, () => true)).rejects.toThrow('PNG');
  await expect(insertLocalImage(new File([new Uint8Array(10 * 1024 * 1024 + 1)],
    'large.jpg', { type: 'image/jpeg' }), 'first', current, repository, () => true))
    .rejects.toThrow('10 MiB');
  await expect(insertLocalImage(new File(['bad'], 'bad.jpg', { type: 'image/jpeg' }),
    'first', current, repository, () => true)).rejects.toThrow('圖片格式無效');
  expect(repository.addAsset).not.toHaveBeenCalled();
});

it('does not insert a broken reference when writing the Blob fails', async () => {
  const current = editor();
  const repository = { addAsset: vi.fn(async () => { throw new Error('Quota exceeded'); }) } as
    unknown as ProjectRepository;
  await expect(insertLocalImage(file(), 'first', current, repository, () => true))
    .rejects.toThrow('Quota exceeded');
  expect(current.getJSON().content?.some((node) => node.type === 'image')).toBe(false);
});

it('does not insert into a stale editor after asset writing completes', async () => {
  const current = editor();
  let complete!: () => void;
  const pending = new Promise<void>((resolve) => { complete = resolve; });
  const repository = { addAsset: vi.fn(() => pending) } as unknown as ProjectRepository;
  let active = true;
  const operation = insertLocalImage(file(), 'first', current, repository, () => active);
  await vi.waitFor(() => expect(repository.addAsset).toHaveBeenCalledOnce());
  active = false;
  complete();
  await operation;
  expect(current.getJSON().content?.some((node) => node.type === 'image')).toBe(false);
});

it('does not store an asset after switching projects during file reading', async () => {
  const current = editor();
  let complete!: (bytes: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((resolve) => { complete = resolve; });
  const selected = file();
  Object.defineProperty(selected, 'arrayBuffer', { value: () => pending });
  const repository = { addAsset: vi.fn() } as unknown as ProjectRepository;
  let active = true;
  const operation = insertLocalImage(selected, 'first', current, repository, () => active);
  active = false;
  complete(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer);
  await operation;
  expect(repository.addAsset).not.toHaveBeenCalled();
  expect(current.getJSON().content?.some((node) => node.type === 'image')).toBe(false);
});
