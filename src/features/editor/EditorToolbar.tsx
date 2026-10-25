import { Fragment, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { redoNoScroll, undoNoScroll } from '@tiptap/pm/history';
import { TableToolbar } from './TableToolbar';
import { focusedItemIndex, insertPageBreak } from './insertPageBreak';
import { fontSizes, validFontFamily } from './fontStyles';
import { fontOptions, readRecentFonts, rememberFont } from './fontCatalog';

type Tool = { label: string; active?: () => boolean; run: () => void };
type TextRange = { from: number; to: number };

function styleRange(editor: Editor): TextRange | null {
  if (!editor.isEditable) return null;
  const { selection } = editor.state;
  if (!selection.empty) return { from: selection.from, to: selection.to };
  if (!editor.isFocused || !selection.$from.parent.isTextblock) return null;
  return { from: selection.$from.start(), to: selection.$from.end() };
}

function focusedLineRange(editor: Editor): TextRange | null {
  const { selection } = editor.state;
  if (!selection.empty || !selection.$from.parent.isTextblock) return null;
  return { from: selection.$from.start(), to: selection.$from.end() };
}

function applyTextStyle(editor: Editor, mark: 'fontFamily' | 'fontSize', value: string,
  captured: TextRange | null): boolean {
  const range = captured ?? styleRange(editor);
  if (!range || range.from === range.to) return false;
  editor.view.dispatch(editor.state.tr.addMark(range.from, range.to,
    editor.schema.marks[mark].create({ [mark]: value })));
  return true;
}

function activeListStyle(editor: Editor): string | null {
  const { $from } = editor.state.selection;
  let itemStyle: string | null = null;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'listItem' && itemStyle === null) {
      itemStyle = node.attrs.listStyle;
    }
    if (node.type.name === 'bulletList') {
      return itemStyle ?? node.attrs.listStyle ?? (depth === 1 ? 'ordered' : 'unordered');
    }
  }
  return null;
}

export function runHistory(editor: Editor, command: typeof undoNoScroll): void {
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

export function EditorToolbar({ editor, showHistory = true }: {
  editor: Editor; showHistory?: boolean;
}) {
  const [, update] = useState(0);
  const capturedRange = useRef<TextRange | null>(null);
  const focusedLine = useRef<TextRange | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [installedFonts, setInstalledFonts] = useState<string[] | null>(null);
  const [recentFonts, setRecentFonts] = useState(readRecentFonts);
  const [fontStatus, setFontStatus] = useState('');
  const [loadingFonts, setLoadingFonts] = useState(false);
  useEffect(() => {
    const refresh = () => update((value) => value + 1);
    const onBlur = ({ event }: { event: FocusEvent }) => {
      focusedLine.current = (capturedRange.current || toolbar.current?.contains(event.relatedTarget as Node))
        ? focusedLineRange(editor) : null;
      refresh();
    };
    editor.on('transaction', refresh);
    editor.on('focus', refresh);
    editor.on('blur', onBlur);
    return () => { editor.off('transaction', refresh); editor.off('focus', refresh);
      editor.off('blur', onBlur); };
  }, [editor]);

  const captureRange = () => {
    const current = styleRange(editor);
    if (current) {
      capturedRange.current = current;
      focusedLine.current = editor.state.selection.empty ? current : null;
    } else {
      capturedRange.current = toolbar.current?.contains(document.activeElement)
        ? focusedLine.current : null;
      if (!capturedRange.current) focusedLine.current = null;
    }
  };
  const setStyle = (mark: 'fontFamily' | 'fontSize', value: string) => {
    const range = capturedRange.current ?? (toolbar.current?.contains(document.activeElement)
      ? focusedLine.current : null);
    if (applyTextStyle(editor, mark, value, range) && mark === 'fontFamily') {
      setRecentFonts(rememberFont(value));
    }
    capturedRange.current = null;
  };
  const detectFonts = async () => {
    const restoreEditorFocus = editor.isFocused;
    const query = (window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>;
    }).queryLocalFonts;
    if (!query) { setFontStatus('此瀏覽器不支援偵測本機字體'); return; }
    setLoadingFonts(true);
    try {
      const faces = await query.call(window);
      const families = [...new Set(faces.map((face) => face.family).filter(validFontFamily))];
      setInstalledFonts(families);
      setFontStatus(`已載入 ${families.length} 個本機字體`);
    } catch {
      setFontStatus('無法讀取本機字體，請檢查瀏覽器權限');
    } finally {
      setLoadingFonts(false);
      if (restoreEditorFocus && !editor.isDestroyed
        && (document.activeElement === document.body || document.activeElement === editor.view.dom)) {
        editor.view.focus();
      }
    }
  };
  const currentFont = editor.getAttributes('fontFamily').fontFamily ?? '';
  const availableFonts = fontOptions(installedFonts, recentFonts, currentFont);

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
      label, active: () => activeListStyle(editor) === style,
      run: () => {
        if (activeListStyle(editor) === style) {
          editor.chain().focus().toggleBulletList().run();
          return;
        }
        if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run();
        editor.chain().focus().updateAttributes('listItem', { listStyle: style }).run();
      },
    })),
    { label: '清除格式', run: () => editor.chain().focus().unsetAllMarks().run() },
    { label: '復原', run: () => runHistory(editor, undoNoScroll) },
    { label: '重做', run: () => runHistory(editor, redoNoScroll) },
  ];

  const groups = [
    { label: '段落樣式', tools: tools.slice(0, 4), columns: 2 },
    { label: '文字樣式', tools: tools.slice(4, 7), columns: 3 },
    { label: '清單', tools: tools.slice(7, 9), columns: 2 },
    { label: '清除格式', tools: tools.slice(9, 10), columns: 1 },
    ...(showHistory ? [{ label: '編輯記錄', tools: tools.slice(10), columns: 2 }] : []),
  ];

  return <div ref={toolbar} role="toolbar" aria-label="文字編輯工具列" className="editor-toolbar"
    onBlurCapture={(event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node)) return;
      focusedLine.current = null;
      capturedRange.current = null;
    }}>
    {groups.map((group) => <Fragment key={group.label}>
      {group.label === '清除格式' && <div role="group" aria-label="字體設定"
        className="toolbar-group toolbar-columns-1 toolbar-font-settings">
        <label>字體 <select aria-label="字體" value={currentFont}
          onPointerDown={captureRange}
          onChange={(event) => setStyle('fontFamily', event.target.value)}>
          <option value="" disabled>選擇字體</option>
          {availableFonts.recent.length > 0 && <optgroup label="最近使用">
            {availableFonts.recent.map((font) => <option key={font} value={font}>{font}</option>)}
          </optgroup>}
          <optgroup label={installedFonts ? '本機字體' : '預設字體'}>
            {availableFonts.others.map((font) => <option key={font} value={font}>{font}</option>)}
          </optgroup>
        </select></label>
        <button type="button" onMouseDown={(event) => event.preventDefault()}
          onClick={() => { void detectFonts(); }} disabled={loadingFonts}
          title="偵測本機字體" aria-label="偵測本機字體">偵測本機字體</button>
        {fontStatus && <span role="status">{fontStatus}</span>}
        <label>字體大小 <select aria-label="字體大小"
          value={editor.getAttributes('fontSize').fontSize ?? ''}
          onPointerDown={captureRange}
          onChange={(event) => setStyle('fontSize', event.target.value)}>
          <option value="" disabled>選擇大小</option>
          {fontSizes.map((size) => <option key={size} value={`${size}pt`}>{size} pt</option>)}
        </select></label>
      </div>}
      <div role="group" aria-label={group.label}
        className={`toolbar-group toolbar-columns-${group.columns}`}>
      {group.tools.map((tool) => <button key={tool.label} type="button"
        title={tool.label} aria-label={tool.label} aria-pressed={tool.active?.() ?? undefined} onClick={tool.run}>
        {tool.label === '編號清單' ? '1.' : tool.label === '項目符號清單' ? '*'
          : ['粗體', '斜體', '底線'].includes(tool.label) ? <FormatIcon label={tool.label} />
          : tool.label}
      </button>)}
      </div>
    </Fragment>)}
    <div role="group" aria-label="分隔頁" className="toolbar-group toolbar-page-break">
      <button type="button" title="插入分隔頁" aria-label="插入分隔頁"
        disabled={focusedItemIndex(editor) === null}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => insertPageBreak(editor)}>插入分隔頁</button>
    </div>
    <TableToolbar editor={editor} />
  </div>;
}
