import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';

type Tool = { label: string; active?: () => boolean; run: () => void };

export function EditorToolbar({ editor }: { editor: Editor }) {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update((value) => value + 1);
    editor.on('transaction', refresh);
    return () => { editor.off('transaction', refresh); };
  }, [editor]);

  const tools: Tool[] = [
    { label: '段落', active: () => editor.isActive('paragraph'),
      run: () => editor.chain().focus().setParagraph().run() },
    ...([1, 2, 3] as const).map((level) => ({
      label: `標題 ${level}`, active: () => editor.isActive('heading', { level }),
      run: () => editor.chain().focus().toggleHeading({ level }).run(),
    })),
    { label: '粗體', active: () => editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run() },
    { label: '斜體', active: () => editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run() },
    { label: '底線', active: () => editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run() },
    { label: '項目清單', active: () => editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run() },
    ...([['左', 'left'], ['中', 'center'], ['右', 'right']] as const).map(([label, align]) => ({
      label: `${label}對齊`, active: () => editor.isActive({ textAlign: align }),
      run: () => editor.chain().focus().setTextAlign(align).run(),
    })),
    { label: '復原', run: () => editor.chain().focus().undo().run() },
    { label: '重做', run: () => editor.chain().focus().redo().run() },
  ];

  return <div role="toolbar" aria-label="文字編輯工具列" className="editor-toolbar">
    {tools.map((tool) => <button key={tool.label} type="button"
      aria-pressed={tool.active?.() ?? undefined} onClick={tool.run}>{tool.label}</button>)}
  </div>;
}
