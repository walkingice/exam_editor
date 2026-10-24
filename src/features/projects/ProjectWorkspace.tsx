import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectOwnership, WriteAccessError, type ProjectLease } from '../../data/ownership';
import { ProjectRepository, type ProjectBundle } from '../../data/repository';
import { onProjectDeleted } from '../../data/projectEvents';
import { ReadOnlyEditor } from '../editor/ReadOnlyEditor';
import { readImportWarnings } from '../import-docx/importNotices';
import { normalizeDocument } from '../../domain/document';
import type { Editor } from '@tiptap/core';

type EditingSession = { projectId: string; revision: number; editor: Editor | null };

export function ProjectWorkspace({ projectId, repository, ownership }: {
  projectId: string; repository: ProjectRepository; ownership: ProjectOwnership;
}) {
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [lease, setLease] = useState<ProjectLease | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [readOnlyReason, setReadOnlyReason] = useState('');
  const activeLease = useRef<ProjectLease | null>(null);
  const generation = useRef(0);
  const session = useRef<EditingSession | null>(null);
  const [dirty, setDirty] = useState(false);

  const open = useCallback(async (cancelled: () => boolean) => {
    const attempt = ++generation.current;
    setStatus('loading');
    setReadOnlyReason('');
    try {
      const acquired = await ownership.acquireLatest(projectId, () => repository.get(projectId))
        .catch((cause: unknown) => {
          if (cause instanceof WriteAccessError) {
            if (!cancelled()) setReadOnlyReason(cause.message);
            return null;
          }
          throw cause;
        });
      const next = acquired?.value ?? await repository.get(projectId);
      if (cancelled() || attempt !== generation.current) {
        await acquired?.lease.release();
        return;
      }
      if (!next) await acquired?.lease.release();
      activeLease.current = next ? acquired?.lease ?? null : null;
      session.current = next && acquired?.lease
        ? { projectId, revision: 0, editor: null } : null;
      setDirty(false);
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
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) void open(() => cancelled); });
    return () => {
      cancelled = true;
      session.current = null;
      void activeLease.current?.release();
      activeLease.current = null;
    };
  }, [open]);

  useEffect(() => onProjectDeleted(projectId, () => {
    generation.current += 1;
    void activeLease.current?.release();
    activeLease.current = null;
    session.current = null;
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
      normalizeDocument(editor.getJSON());
      current.revision += 1;
      setDirty(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '文件內容無效');
    }
  }

  return <main>
    <a href="#/">返回首頁</a>
    {status === 'loading' && <p>載入中…</p>}
    {status === 'missing' && <p>找不到這份試卷。</p>}
    {status === 'error' && <><p role="alert">{error}</p>
      <button onClick={() => void open(() => false)}>重試</button></>}
    {status === 'ready' && bundle && <>
      <h1>{bundle.project.name}</h1>
      {readImportWarnings(projectId).length > 0 && <section aria-label="匯入提醒">
        <p>匯入文件需人工校對：</p>
        <ul>{readImportWarnings(projectId).map((warning, index) => <li key={index}>{warning}</li>)}</ul>
      </section>}
      {!lease && <><p>{readOnlyReason || '此 Project 正由另一個分頁使用，目前為唯讀。'}</p>
        <button onClick={() => void takeOver()}>重新取得寫入權</button></>}
      <h2>試卷內容</h2>
      {lease && <p role="status">{dirty ? '尚未儲存' : '可以編輯'}</p>}
      <ReadOnlyEditor projectId={projectId} content={bundle.document.content} repository={repository}
        editable={!!lease?.isActive} onEditor={(editor) => {
          if (session.current?.projectId === projectId) session.current.editor = editor;
        }} onChange={recordChange} />
    </>}
  </main>;
}
