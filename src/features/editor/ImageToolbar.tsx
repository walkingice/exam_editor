import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';

export function ImageToolbar({ editor, onInsert }: {
  editor: Editor; onInsert: (file: File) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update((value) => value + 1);
    editor.on('transaction', refresh);
    return () => { editor.off('transaction', refresh); };
  }, [editor]);

  async function selected(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try { await onInsert(file); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '圖片插入失敗'); }
    finally { setBusy(false); }
  }

  return <div className="image-toolbar">
    <label title="插入圖片">插入圖片 <input type="file" accept="image/png,image/jpeg" disabled={busy}
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        void selected(file);
      }} /></label>
    <button type="button" title="刪除圖片" disabled={!(editor.state.selection instanceof NodeSelection
      && editor.state.selection.node.type.name === 'image')}
      onClick={() => editor.chain().focus().deleteSelection().run()}>刪除圖片</button>
    {busy && <span role="status">圖片儲存中…</span>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
