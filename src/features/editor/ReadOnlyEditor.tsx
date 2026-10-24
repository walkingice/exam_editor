import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import type { JSONContent } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { NodeViewProps } from '@tiptap/react';
import { ProjectRepository } from '../../data/repository';
import { AssetResolver, type AssetHandle } from '../../shared/assets/AssetResolver';
import { AssetImage, editingExtensions } from './schema';
import { EditorToolbar } from './EditorToolbar';
import { ImageToolbar } from './ImageToolbar';
import { insertLocalImage } from './insertLocalImage';

function AssetImageView({ node, resolver }: NodeViewProps & { resolver: AssetResolver }) {
  const [resolved, setResolved] = useState<{ assetId: string; handle: AssetHandle } | null>(null);
  const [errorAssetId, setErrorAssetId] = useState<string | null>(null);
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

  return <NodeViewWrapper as="div" className="exam-image">
    {resolved?.assetId === assetId
      ? <img src={resolved.handle.url} alt={node.attrs.alt || '試卷圖片'} />
      : errorAssetId === assetId ? <span role="img" aria-label="缺少圖片">找不到圖片：{assetId}</span>
        : <span>圖片載入中…</span>}
  </NodeViewWrapper>;
}

export function ReadOnlyEditor({ projectId, content, repository, editable = false, onChange, onEditor,
  canInsertImage }: {
  projectId: string; content: JSONContent; repository: ProjectRepository;
  editable?: boolean;
  onChange?: (editor: Editor) => void;
  onEditor?: (editor: Editor) => void;
  canInsertImage?: (editor: Editor) => boolean;
}) {
  const callbacks = useRef({ onChange, onEditor, canInsertImage });
  callbacks.current = { onChange, onEditor, canInsertImage };
  const active = useRef(false);
  const resolver = useMemo(() => new AssetResolver(
    projectId, (id, assetId) => repository.getAsset(id, assetId),
  ), [projectId, repository]);
  const extensions = useMemo(() => editingExtensions.map((extension) => extension.name === 'image'
    ? AssetImage.extend({
      addNodeView() {
        return ReactNodeViewRenderer((props) => <AssetImageView {...props} resolver={resolver} />);
      },
    }) : extension), [resolver]);
  const editor = useEditor({ extensions, content, editable, immediatelyRender: false,
    onUpdate: ({ editor: current }) => callbacks.current.onChange?.(current),
    onCreate: ({ editor: current }) => callbacks.current.onEditor?.(current),
  }, [extensions]);

  useEffect(() => { editor?.setEditable(editable); }, [editable, editor]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(content, { emitUpdate: false });
  }, [content, editor]);
  useEffect(() => () => resolver.dispose(), [resolver]);

  return <>
    {editable && editor && <EditorToolbar editor={editor} />}
    {editable && editor && <ImageToolbar editor={editor} onInsert={(file) => insertLocalImage(
      file, projectId, editor, repository,
      () => active.current && editor.isEditable && !editor.isDestroyed
        && callbacks.current.canInsertImage?.(editor) !== false,
    )} />}
    <div aria-label="試卷文件" className="exam-document">
      <EditorContent editor={editor} />
    </div>
  </>;
}
