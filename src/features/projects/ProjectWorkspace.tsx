import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ProjectOwnership, WriteAccessError, type ProjectLease } from '../../data/ownership';
import { ProjectRepository, type ProjectBundle } from '../../data/repository';
import { onProjectDeleted } from '../../data/projectEvents';
import { ReadOnlyEditor } from '../editor/ReadOnlyEditor';
import { readImportWarnings } from '../import-docx/importNotices';
import { normalizeDocument } from '../../domain/document';
import type { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { EditingSession, type SaveState } from '../editor/EditingSession';
import { ensureNodeIds } from '../editor/ensureNodeIds';
import { PageSettingsForm } from './PageSettingsForm';
import type { PageSettings } from '../../domain/types';
import { projectOutput } from '../../domain/outputProjection';
import { pageDimensions } from '../../domain/pageSettings';
import { AssetResolver } from '../../shared/assets/AssetResolver';
import { PreviewFormatToolbar } from '../layout/PreviewFormatToolbar';
import { updateSourceFormat, type FormatChange } from '../layout/updateSourceFormat';
import { countPrintImages, createPrintCss, waitForPrintAssets } from '../layout/printDocument';

import { ExportDocxButton } from '../export-docx/ExportDocxButton';
import { AIAllModal } from '../editor/AIAllModal';
import { GEMINI_API_KEY_STORAGE_KEY } from '../../shared/storageKeys';

type EditorIdentity = { projectId: string; revision: number; editor: Editor | null };

function errorMessage(cause: unknown): string {
  return cause && typeof cause === 'object' && 'message' in cause
    && typeof cause.message === 'string' ? cause.message : '儲存失敗';
}

function findEditorNode(editor: Editor | null | undefined, id: string | null) {
  if (!editor || !id) return null;
  let found: { type: string; attrs: Record<string, unknown> } | null = null;
  editor.state.doc.descendants((node) => {
    if (node.attrs.id === id) {
      found = { type: node.type.name, attrs: node.attrs };
      return false;
    }
    return true;
  });
  return found as { type: string; attrs: Record<string, unknown> } | null;
}

function includesNodeId(node: JSONContent | null, id: string | null): boolean {
  return !!node && !!id && (node.attrs?.id === id
    || !!node.content?.some((child) => includesNodeId(child, id)));
}

function previewPages(content: JSONContent): JSONContent[] {
  const pages: JSONContent[] = [];
  let items: JSONContent[] = [];
  for (const item of content.content ?? []) {
    if (item.type === 'pageBreak') {
      pages.push({ ...content, content: items });
      items = [];
    } else items.push(item);
  }
  pages.push({ ...content, content: items });
  return pages;
}

export function ProjectWorkspace({ projectId, repository, ownership, registerGuard }: {
  projectId: string; repository: ProjectRepository; ownership: ProjectOwnership;
  registerGuard?: (callback: (() => Promise<boolean>) | null) => void;
}) {
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [lease, setLease] = useState<ProjectLease | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [readOnlyReason, setReadOnlyReason] = useState('');
  const activeLease = useRef<ProjectLease | null>(null);
  const generation = useRef(0);
  const session = useRef<EditorIdentity | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [saveError, setSaveError] = useState('');
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [pageSettings, setPageSettings] = useState<PageSettings | null>(null);
  const [tab, setTab] = useState<'content' | 'preview'>('content');
  const [showAIAll, setShowAIAll] = useState(false);
  const [sourceEditor, setSourceEditor] = useState<Editor | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const [formatError, setFormatError] = useState('');
  const [printSnapshot, setPrintSnapshot] = useState<{ content: JSONContent; settings: PageSettings } | null>(null);
  const [printError, setPrintError] = useState('');
  const printRoot = useRef<HTMLDivElement>(null);
  const [printEditorReady, setPrintEditorReady] = useState(false);
  const printing = useRef(false);
  const saving = useRef<EditingSession | null>(null);
  const assetResolver = useMemo(() => new AssetResolver(
    projectId, (id, assetId) => repository.getAsset(id, assetId),
  ), [projectId, repository]);
  useEffect(() => () => assetResolver.dispose(), [assetResolver]);

  useLayoutEffect(() => {
    registerGuard?.(async () => {
      try { await saving.current?.flush(); return true; }
      catch (cause) {
        setSaveError(errorMessage(cause));
        return false;
      }
    });
    return () => registerGuard?.(null);
  }, [registerGuard]);

  useEffect(() => {
    const flushOnClose = (event: PageTransitionEvent) => {
      const current = saving.current;
      if (!current) return;
      void current.flush().then(() => event.persisted
        ? undefined : repository.finishSession(projectId)).catch(() => {});
    };
    window.addEventListener('pagehide', flushOnClose);
    return () => window.removeEventListener('pagehide', flushOnClose);
  }, [projectId, repository]);

  const open = useCallback(async (cancelled: () => boolean) => {
    const attempt = ++generation.current;
    setStatus('loading');
    setSourceEditor(null);
    setShowAIAll(false);
    setReadOnlyReason('');
    try {
      const acquired = await ownership.acquireLatest(projectId, () => repository.beginSession(projectId))
        .catch((cause: unknown) => {
          if (cause instanceof WriteAccessError) {
            if (!cancelled()) setReadOnlyReason(cause.message);
            return null;
          }
          throw cause;
        });
      const next = acquired?.value ?? await repository.get(projectId);
      if (cancelled() || attempt !== generation.current) {
        if (acquired?.value) await repository.finishSession(projectId).catch(() => {});
        await acquired?.lease.release();
        return;
      }
      if (!next) await acquired?.lease.release();
      activeLease.current = next ? acquired?.lease ?? null : null;
      saving.current?.close();
      saving.current = next && acquired?.lease
        ? new EditingSession(next, repository, (state, message) => {
          if (saving.current?.projectId !== projectId) return;
          setSaveState(state);
          setSaveError(message ?? '');
        }) : null;
      session.current = next && acquired?.lease
        ? { projectId, revision: 0, editor: null } : null;
      setSaveState('saved');
      setName(next?.project.name ?? '');
      setDisplayName(next?.project.name ?? '');
      setEditingName(false);
      setPageSettings(next?.project.pageSettings ?? null);
      setLease(activeLease.current);
      setBundle(next);
      setStatus(next ? 'ready' : 'missing');
    } catch (cause) {
      if (!cancelled() && attempt === generation.current) {
        setError(cause instanceof Error ? cause.message : '無法開啟 Project');
        setStatus('error');
      }
    }
  }, [ownership, projectId, repository]);

  useEffect(() => {
    const resume = (event: PageTransitionEvent) => {
      if (event.persisted && activeLease.current && !activeLease.current.isActive) {
        if (saving.current?.saveState !== 'saved') {
          setLease(null);
          setReadOnlyReason('寫入權已失效，未儲存內容仍顯示於此頁。請先複製內容。');
          setSaveError('未儲存的編輯無法自動恢復。');
          return;
        }
        void open(() => false);
      }
    };
    window.addEventListener('pageshow', resume);
    return () => window.removeEventListener('pageshow', resume);
  }, [open]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void open(() => cancelled); });
    return () => {
      cancelled = true;
      session.current = null;
      const currentSaving = saving.current;
      const currentLease = activeLease.current;
      saving.current = null;
      void (async () => {
        try {
          await currentSaving?.flush();
          if (currentSaving) await repository.finishSession(projectId);
        } catch { /* Keep cleanup pending after failed flush or cleanup. */ }
        currentSaving?.close();
        await currentLease?.release();
      })();
      activeLease.current = null;
    };
  }, [open]);

  useEffect(() => onProjectDeleted(projectId, () => {
    generation.current += 1;
    void activeLease.current?.release();
    activeLease.current = null;
    session.current = null;
    saving.current?.close();
    saving.current = null;
    setLease(null);
    setBundle(null);
    setStatus('missing');
  }), [projectId]);

  async function takeOver() { if (!activeLease.current) await open(() => false); }

  function recordChange(editor: Editor) {
    const current = session.current;
    if (!current || current.projectId !== projectId || current.editor !== editor
      || !activeLease.current?.isActive) return;
    try {
      if (ensureNodeIds(editor)) return;
      const content = normalizeDocument(editor.getJSON());
      saving.current?.updateContent(content);
      current.revision += 1;
      setPreviewRevision(current.revision);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件內容無效');
    }
  }

  async function leave(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    try {
      await saving.current?.flush();
      window.location.hash = '/';
    } catch (cause) {
      setSaveError(errorMessage(cause));
    }
  }

  function rename() {
    try {
      saving.current?.rename(name);
      if (saving.current) setDisplayName(saving.current.snapshot.project.name);
      setEditingName(false);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '更名失敗');
    }
  }

  function cancelRename() {
    setName(displayName);
    setEditingName(false);
  }

  function changePageSettings(settings: PageSettings) {
    try {
      saving.current?.updatePageSettings(settings);
      if (saving.current) setPageSettings(settings);
    } catch (cause) { setSaveError(errorMessage(cause)); }
  }

  function changePreviewFormat(change: FormatChange) {
    const editor = session.current?.editor;
    if (!editor || !selectedPreviewId || !pageSettings || !activeLease.current?.isActive) return;
    if (!includesNodeId(previewContent, selectedPreviewId)) {
      setFormatError('預覽中的節點已變更，請重新選取');
      return;
    }
    try { updateSourceFormat(editor, selectedPreviewId, change, pageSettings); setFormatError(''); }
    catch (cause) { setFormatError(errorMessage(cause)); }
  }

  async function printExam() {
    if (!pageSettings || printing.current) return;
    printing.current = true;
    setPrintError('');
    setPrintEditorReady(false);
    try {
      await saving.current?.flush();
      const source = session.current?.editor?.getJSON() ?? bundle?.document.content;
      if (!source) throw new Error('無法取得最新試卷內容。');
      setPrintSnapshot({ content: projectOutput(source, pageSettings.outputListStyle),
        settings: { ...pageSettings, marginsMm: { ...pageSettings.marginsMm } } });
    } catch (cause) {
      setPrintError(errorMessage(cause));
      printing.current = false;
    }
  }

  useEffect(() => {
    if (!printSnapshot || !printEditorReady || !printRoot.current) return;
    let active = true;
    void waitForPrintAssets(printRoot.current, document.fonts, countPrintImages(printSnapshot.content)).then(() => {
      if (!active) return;
      window.print();
      setPrintSnapshot(null);
      printing.current = false;
    }).catch((cause: unknown) => {
      if (!active) return;
      setPrintError(errorMessage(cause));
      setPrintSnapshot(null);
      printing.current = false;
    });
    return () => { active = false; };
  }, [printSnapshot, printEditorReady]);

  const previewContent = useMemo(() => {
    const source = session.current?.editor?.getJSON() ?? bundle?.document.content;
    return source && pageSettings ? projectOutput(source, pageSettings.outputListStyle) : null;
  }, [bundle, pageSettings, previewRevision, tab]);
  const page = pageSettings ? pageDimensions(pageSettings) : null;
  const pages = previewContent ? previewPages(previewContent) : [];
  const selectedNode = includesNodeId(previewContent, selectedPreviewId)
    ? findEditorNode(session.current?.editor, selectedPreviewId) : null;

  return <main>
    {status === 'loading' && <p>載入中…</p>}
    {status === 'missing' && <p>找不到這份試卷。</p>}
    {status === 'error' && <><p role="alert">{error}</p>
      <button onClick={() => void open(() => false)}>重試</button></>}
    {status === 'ready' && bundle && <>
      <header className="workspace-header">
        <a className="workspace-home" href="#/" onClick={(event) => void leave(event)}>返回首頁</a>
        <div className="workspace-header-content">
          <div className="workspace-title">
            {editingName ? <input aria-label="試卷名稱" autoFocus value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') rename();
                if (event.key === 'Escape') cancelRename();
              }} /> : <h1>{displayName}</h1>}
            {lease?.isActive && (editingName
              ? <><button type="button" className="workspace-rename" onClick={rename}>儲存</button>
                <button type="button" className="workspace-rename" onClick={cancelRename}>
                  取消</button></>
              : <button type="button" className="workspace-rename" onClick={() => setEditingName(true)}>
                更名</button>)}
          </div>
          <div role="tablist" aria-label="Workspace tabs" className="workspace-tabs">
            <button role="tab" aria-selected={tab === 'content'} onClick={() => setTab('content')}>
              試卷內容</button>
            <button role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>
              排版預覽</button>
          </div>
        </div>
      </header>
      {!lease && <><p>{readOnlyReason || '此 Project 正由另一個分頁使用，目前為唯讀。'}</p>
        {saving.current?.saveState === 'saved' || !saving.current
          ? <button onClick={() => void takeOver()}>重新取得寫入權</button> : null}</>}
      <div className="workspace-section-heading">
        <h2>{tab === 'content' ? '試卷內容' : '排版預覽'}</h2>
        {tab === 'content' && <button type="button" onClick={() => setShowAIAll(true)}
          disabled={!lease?.isActive || !sourceEditor
            || !window.localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY)?.trim()}>
          全部修改✨</button>}
      </div>
      {tab === 'preview' && pageSettings && <div className="workspace-actions">
        <ExportDocxButton key={projectId} snapshot={() => ({
          content: session.current?.editor?.getJSON() ?? bundle.document.content,
          settings: pageSettings, name: displayName,
        })} readAsset={async (assetId) => (await repository.getAsset(projectId, assetId)) ?? undefined} />
        <button onClick={() => void printExam()} disabled={printing.current}>列印 / PDF</button>
        {printError && <><p role="alert">{printError}</p>
          <button onClick={() => void printExam()}>重試列印</button></>}
      </div>}
      {tab === 'preview' && lease?.isActive && pageSettings && <PageSettingsForm settings={pageSettings}
        onChange={changePageSettings} />}
      {lease && <p role="status">{{ saved: '已儲存', dirty: '尚未儲存',
        saving: '儲存中…', error: '儲存失敗' }[saveState]}</p>}
      {saveError && <><p role="alert">{saveError}</p>
        {lease?.isActive && <button onClick={() => void saving.current?.flush().catch(() => {})}>
          重試儲存</button>}</>}
      <div role="tabpanel" hidden={tab !== 'content'} className="content-panel">
      {readImportWarnings(projectId).length > 0 && <details aria-label="匯入提醒">
        <summary>匯入文件需人工校對</summary>
        <ul>{readImportWarnings(projectId).map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </details>}
      <ReadOnlyEditor projectId={projectId} content={bundle.document.content} repository={repository}
        assetResolver={assetResolver}
        editable={!!lease?.isActive} onEditor={(editor) => {
          if (session.current?.projectId === projectId) {
            session.current.editor = editor;
            setSourceEditor(editor);
          }
        }} onChange={recordChange} canInsertImage={(editor) =>
          session.current?.projectId === projectId && session.current.editor === editor
          && !!activeLease.current?.isActive} />
      </div>
      {showAIAll && sourceEditor && <AIAllModal editor={sourceEditor}
        onClose={() => setShowAIAll(false)} />}
      {tab === 'preview' && previewContent && pageSettings && page &&
        <div role="tabpanel" aria-label="排版預覽" className="preview-scroll">
          {formatError && <p role="alert">{formatError}</p>}
          {selectedNode && lease?.isActive && <PreviewFormatToolbar
            key={selectedPreviewId} type={selectedNode.type} attrs={selectedNode.attrs}
            maxWidthMm={page.contentWidthMm} onChange={changePreviewFormat} />}
          {pages.map((pageContent, index) => <div key={index} className="preview-paper"
            data-columns={pageSettings.columns ?? 1}
            data-orientation={pageSettings.orientation} style={{ width: `${page.widthMm}mm`,
            height: `${page.heightMm}mm`, minHeight: `${page.heightMm}mm`,
            padding: `${pageSettings.marginsMm.top}mm ${pageSettings.marginsMm.right}mm ${pageSettings.marginsMm.bottom}mm ${pageSettings.marginsMm.left}mm`,
            fontSize: `${pageSettings.defaultFontSizePt}pt`, lineHeight: pageSettings.lineHeight }}
            onClick={(event) => {
              const element = event.target instanceof Element ? event.target : null;
              const node = element?.closest('[data-node-id]');
              if (node) setSelectedPreviewId(node.getAttribute('data-node-id'));
            }}>
            <div className="preview-content" style={pageSettings.orientation === 'landscape'
              ? { height: `${page.contentHeightMm}mm` } : undefined}>
            <ReadOnlyEditor projectId={projectId} content={pageContent}
              assetResolver={assetResolver}
              repository={repository} preview />
            </div>
          </div>)}
        </div>}
      {printSnapshot && <>
        <style>{createPrintCss(printSnapshot.settings)}</style>
        <div id="exam-print-root" ref={printRoot} aria-hidden="true">
          <ReadOnlyEditor projectId={projectId} content={printSnapshot.content}
            assetResolver={assetResolver} repository={repository} preview
            onEditor={() => setPrintEditorReady(true)} />
        </div>
      </>}
    </>}
  </main>;
}
