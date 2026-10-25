import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { ProjectRepository } from '../../data/repository';
import { AssetResolver, type AssetHandle } from '../../shared/assets/AssetResolver';
import { AssetImage, editingExtensions, examExtensions } from './schema';
import { EditorToolbar } from './EditorToolbar';
import { ImageToolbar } from './ImageToolbar';
import { ResizableImage } from './ResizableImage';
import { insertLocalImage } from './insertLocalImage';
import { clearDocumentItemDropIndicator, deleteDocumentItem, refreshItemControls, setDocumentItemDragData } from './questionControls';
import { itemNodeView } from './itemNodeView';
import { AIItemModal } from './AIItemModal';
import { GEMINI_API_KEY_STORAGE_KEY } from '../../shared/storageKeys';

function AssetImageView({ node, resolver, editor, getPos, preview }: NodeViewProps & {
  resolver: AssetResolver; preview: boolean;
}) {
  const [resolved, setResolved] = useState<{ assetId: string; handle: AssetHandle } | null>(null);
  const [errorAssetId, setErrorAssetId] = useState<string | null>(null);
  const hasApiKey = !!window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim();
  const assetId = node.attrs.assetId as string;

  useEffect(() => {
    let active = true;
    let current: AssetHandle | null = null;
    resolver.activate();
    setResolved(null);
    setErrorAssetId(null);
    void resolver.acquire(assetId).then((result) => {
      if (!active) { result?.release(); return; }
      current = result;
      setResolved(result ? { assetId, handle: result } : null);
      setErrorAssetId(result ? null : assetId);
    }).catch(() => { if (active) setErrorAssetId(assetId); });
    return () => { active = false; current?.release(); };
  }, [assetId, resolver]);

  const dragId = node.attrs.id as string;
  const itemSelected = node.attrs.selected !== false;
  const position = getPos();
  const isDocumentItem = typeof position === 'number'
    && editor.state.doc.resolve(position).depth === 0;
  return <NodeViewWrapper as="div" className="exam-image document-item-shell" data-node-id={dragId}>
    {!preview && isDocumentItem && <span className="document-item-control" contentEditable={false}>
      <label><input type="checkbox" aria-label={`選取項目 ${dragId}`}
        checked={itemSelected} disabled={!editor.isEditable}
        onChange={(event) => {
          const selected = event.currentTarget.checked;
          const currentPosition = getPos();
          if (typeof currentPosition !== 'number' || !editor.isEditable) return;
          editor.view.dispatch(editor.state.tr.setNodeMarkup(currentPosition, undefined,
            { ...node.attrs, selected }));
        }} /></label>
      {editor.isEditable && <button type="button" className="question-drag-handle" draggable
        title={`移動項目 ${dragId}`} aria-label={`移動項目 ${dragId}`}
        onDragStart={(event) => setDocumentItemDragData(event.dataTransfer, dragId)}
        onDragEnd={clearDocumentItemDropIndicator} />}
    </span>}
    <div className="document-item-border">{resolved?.assetId === assetId
      ? <ResizableImage src={resolved.handle.url} alt={node.attrs.alt || '試卷圖片'}
        widthMm={node.attrs.widthMm} editable={!preview && editor.isEditable}
        onResize={(widthMm) => {
          const pos = getPos();
          if (typeof pos !== 'number' || !editor.isEditable) return;
          const current = editor.state.doc.nodeAt(pos);
          if (current?.type.name !== 'image') return;
          editor.view.dispatch(closeHistory(editor.state.tr).setNodeMarkup(pos, undefined,
            { ...current.attrs, widthMm }));
        }} />
      : errorAssetId === assetId ? <span role="img" aria-label="缺少圖片">找不到圖片：{assetId}</span>
        : <span>圖片載入中…</span>}</div>
    {!preview && isDocumentItem && <span className="document-item-actions" contentEditable={false}>
      <button type="button" title={`AI 項目 ${dragId}`} aria-label={`AI 項目 ${dragId}`}
        disabled={!editor.isEditable || !hasApiKey}
        onClick={() => editor.view.dom.dispatchEvent(new CustomEvent('exam-ai-open',
          { bubbles: true, detail: dragId }))}>✨</button>
      <button type="button" title={`刪除項目 ${dragId}`} aria-label={`刪除項目 ${dragId}`}
        onClick={() => deleteDocumentItem(editor.view, dragId)}>❌</button>
    </span>}
  </NodeViewWrapper>;
}

export function ReadOnlyEditor({ projectId, content, repository, editable = false, onChange, onEditor,
  canInsertImage, preview = false, assetResolver }: {
  projectId: string; content: JSONContent; repository: ProjectRepository;
  editable?: boolean;
  onChange?: (editor: Editor) => void;
  onEditor?: (editor: Editor) => void;
  canInsertImage?: (editor: Editor) => boolean;
  preview?: boolean;
  assetResolver?: AssetResolver;
}) {
  const callbacks = useRef({ onChange, onEditor, canInsertImage });
  callbacks.current = { onChange, onEditor, canInsertImage };
  const active = useRef(false);
  const [aiItemId, setAiItemId] = useState<string | null>(null);
  const ownedResolver = useMemo(() => new AssetResolver(
    projectId, (id, assetId) => repository.getAsset(id, assetId),
  ), [projectId, repository]);
  const resolver = assetResolver ?? ownedResolver;
  const extensions = useMemo(() => (preview ? examExtensions : editingExtensions).map((extension) => extension.name === 'image'
    ? AssetImage.extend({
      addNodeView() {
        return ReactNodeViewRenderer((props) => <AssetImageView {...props} resolver={resolver} preview={preview} />);
      },
    }) : !preview && ['paragraph', 'heading', 'listItem', 'table', 'blockquote', 'codeBlock']
      .includes(extension.name) ? (extension as Node).extend({
        addNodeView() {
          return ({ node, getPos, editor }) => itemNodeView(editor.view, node, getPos);
        },
      }) : extension), [preview, resolver]);
  const editor = useEditor({ extensions, content, editable, immediatelyRender: false,
    onUpdate: ({ editor: current }) => callbacks.current.onChange?.(current),
    onCreate: ({ editor: current }) => callbacks.current.onEditor?.(current),
  }, [extensions]);

  useEffect(() => {
    if (!editor) return;
    const changed = editor.isEditable !== editable;
    editor.setEditable(editable);
    if (changed && editor.isInitialized) refreshItemControls(editor.view);
  }, [editable, editor]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);
  useEffect(() => () => ownedResolver.dispose(), [ownedResolver]);
  useEffect(() => {
    if (!editor) return;
    const open = (event: Event) => setAiItemId((event as CustomEvent<string>).detail);
    const dom = editor.view.dom;
    dom.addEventListener('exam-ai-open', open);
    return () => dom.removeEventListener('exam-ai-open', open);
  }, [editor]);

  return <div className={editable && editor ? 'content-editor-layout' : undefined}>
    {editable && editor && <aside className="content-editor-controls" aria-label="編輯工具">
      <EditorToolbar editor={editor} />
      <ImageToolbar editor={editor} onInsert={(file) => insertLocalImage(
        file, projectId, editor, repository,
        () => active.current && editor.isEditable && !editor.isDestroyed
          && callbacks.current.canInsertImage?.(editor) !== false,
      )} />
    </aside>}
    <div aria-label="試卷文件" className="exam-document">
      <EditorContent editor={editor} />
    </div>
    {editor && aiItemId && <AIItemModal editor={editor} itemId={aiItemId}
      onClose={() => setAiItemId(null)} />}
  </div>;
}
