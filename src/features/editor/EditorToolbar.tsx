import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { redoNoScroll, undoNoScroll } from '@tiptap/pm/history';
import { TableToolbar } from './TableToolbar';

type Tool = { label: string; active?: () => boolean; run: () => void };

function runHistory(editor: Editor, command: typeof undoNoScroll): void {
  editor.view.focus();
  command(editor.state, editor.view.dispatch);
}

function FormatIcon({ label }: { label: string }) {
  const paths: Record<string, string> = {
    粗體: 'M6 4h7a4 4 0 0 1 0 8H6m7 0a4 4 0 0 1 0 8H6V4',
    斜體: 'M10 4h10M4 20h10M15 4 9 20',
    底線: 'M6 4v7a6 6 0 0 0 12 0V4M4 21h16',
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={label === '粗體' ? 3 : 2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={paths[label]} />
  </svg>;
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  const [, update] = useState(0);
  useEffect(() => {
    const refresh = () => update((value) => value + 1);
    editor.on('transaction', refresh);
    return () => { editor.off('transaction', refresh); };
  }, [editor]);

  const tools: Tool[] = [
    ...([1, 2, 3] as const).map((level) => ({
      label: `標題 ${level}`, active: () => editor.isActive('heading', { level }),
      run: () => editor.chain().focus().toggleHeading({ level }).run(),
    })),
    { label: '內文', active: () => editor.isActive('paragraph'),
      run: () => editor.chain().focus().setParagraph().run() },
    { label: '粗體', active: () => editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run() },
    { label: '斜體', active: () => editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run() },
    { label: '底線', active: () => editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run() },
    ...([['編號清單', 'ordered'], ['項目符號清單', 'unordered']] as const).map(([label, style]) => ({
      label, active: () => editor.isActive('bulletList')
        && editor.getAttributes('listItem').listStyle === style,
      run: () => {
        if (editor.isActive('bulletList') && editor.getAttributes('listItem').listStyle === style) {
          editor.chain().focus().toggleBulletList().run();
          return;
        }
        if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
        editor.chain().focus().updateAttributes('listItem', { listStyle: style }).run();
      },
    })),
    ...([['左', 'left'], ['中', 'center'], ['右', 'right']] as const).map(([label, align]) => ({
      label: `${label}對齊`, active: () => editor.isActive({ textAlign: align }),
      run: () => editor.chain().focus().setTextAlign(align).run(),
    })),
    { label: '復原', run: () => runHistory(editor, undoNoScroll) },
    { label: '重做', run: () => runHistory(editor, redoNoScroll) },
  ];

  const groups = [
    { label: '段落樣式', tools: tools.slice(0, 4), columns: 2 },
    { label: '文字樣式', tools: tools.slice(4, 7), columns: 3 },
    { label: '清單', tools: tools.slice(7, 9), columns: 2 },
    { label: '文字對齊', tools: tools.slice(9, 12), columns: 3 },
    { label: '編輯記錄', tools: tools.slice(12), columns: 2 },
  ];

  return <div role="toolbar" aria-label="文字編輯工具列" className="editor-toolbar">
    {groups.map((group) => <div key={group.label} role="group" aria-label={group.label}
      className={`toolbar-group toolbar-columns-${group.columns}`}>
      {group.tools.map((tool) => <button key={tool.label} type="button"
        title={tool.label} aria-label={tool.label} aria-pressed={tool.active?.() ?? undefined} onClick={tool.run}>
        {tool.label === '編號清單' ? '1.' : tool.label === '項目符號清單' ? '*'
          : ['粗體', '斜體', '底線'].includes(tool.label) ? <FormatIcon label={tool.label} />
          : { 左對齊: '靠左', 中對齊: '置中', 右對齊: '靠右' }[tool.label] ?? tool.label}
      </button>)}
    </div>)}
    <TableToolbar editor={editor} />
  </div>;
}
