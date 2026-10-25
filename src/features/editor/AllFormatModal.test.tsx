import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import { editingExtensions } from './schema';
import { AllFormatModal } from './AllFormatModal';

function createEditor() {
  return new Editor({ element: document.createElement('div'), extensions: editingExtensions,
    content: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'First',
        marks: [{ type: 'bold' }, { type: 'fontFamily', attrs: { fontFamily: 'Arial' } }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Second',
        marks: [{ type: 'italic' }, { type: 'fontSize', attrs: { fontSize: '12pt' } }] }] },
    ] } });
}

afterEach(cleanup);

it('applies choices to every text node only after confirmation', () => {
  const editor = createEditor();
  const before = editor.getJSON();
  const onClose = vi.fn();
  const view = render(<AllFormatModal editor={editor} onClose={onClose} />);
  fireEvent.change(screen.getByRole('combobox', { name: '字體' }),
    { target: { value: 'Noto Sans TC' } });
  fireEvent.change(screen.getByRole('combobox', { name: '字體大小' }),
    { target: { value: '18pt' } });
  expect(editor.getJSON()).toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: '取消' }));
  expect(editor.getJSON()).toEqual(before);
  view.unmount();
  render(<AllFormatModal editor={editor} onClose={onClose} />);
  fireEvent.change(screen.getByRole('combobox', { name: '字體' }),
    { target: { value: 'Noto Sans TC' } });
  fireEvent.change(screen.getByRole('combobox', { name: '字體大小' }),
    { target: { value: '18pt' } });
  fireEvent.click(screen.getByRole('checkbox', { name: '清除格式' }));
  fireEvent.click(screen.getByRole('button', { name: '確定' }));
  expect(onClose).toHaveBeenCalledTimes(2);
  for (const item of editor.getJSON().content ?? []) {
    expect(item.content?.[0].marks).toEqual([
      { type: 'fontFamily', attrs: { fontFamily: 'Noto Sans TC' } },
      { type: 'fontSize', attrs: { fontSize: '18pt' } },
    ]);
  }
  editor.destroy();
});
