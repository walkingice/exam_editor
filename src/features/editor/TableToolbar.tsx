import type { Editor } from '@tiptap/core';

export function TableToolbar({ editor }: { editor: Editor }) {
  const inTable = editor.isActive('table');
  const controls = [
    { label: '插入表格', enabled: true,
      run: () => editor.chain().focus().insertTable({ rows: 2, cols: 2,
        withHeaderRow: false }).run() },
    { label: '新增列', enabled: inTable,
      run: () => editor.chain().focus().addRowAfter().run() },
    { label: '刪除列', enabled: inTable && editor.can().deleteRow(),
      run: () => editor.chain().focus().deleteRow().run() },
    { label: '新增欄', enabled: inTable,
      run: () => editor.chain().focus().addColumnAfter().run() },
    { label: '刪除欄', enabled: inTable && editor.can().deleteColumn(),
      run: () => editor.chain().focus().deleteColumn().run() },
    { label: '刪除表格', enabled: inTable,
      run: () => editor.chain().focus().deleteTable().run() },
  ];

  return <div role="group" aria-label="表格編輯">
    {controls.map(({ label, enabled, run }) => <button key={label} type="button"
      disabled={!enabled} onClick={run}>{label}</button>)}
  </div>;
}
