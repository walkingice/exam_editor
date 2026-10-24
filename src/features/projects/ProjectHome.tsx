import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectOwnership, WriteAccessError } from '../../data/ownership';
import { ProjectRepository } from '../../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS, DOCUMENT_SCHEMA_VERSION } from '../../domain/types';
import type { Project } from '../../domain/types';
import { importProject, type ImportStage } from '../import-docx/importProject';
import { storeImportWarnings } from '../import-docx/importNotices';
import { DocxImportError } from '../import-docx/limits';

export function ProjectHome({ repository, ownership, importer = importProject }: {
  repository: ProjectRepository; ownership: ProjectOwnership; importer?: typeof importProject;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importStage, setImportStage] = useState<ImportStage | null>(null);
  const [notice, setNotice] = useState('');
  const activeImport = useRef<AbortController | null>(null);
  const stageRef = useRef<ImportStage | null>(null);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError('');
    try { setProjects(await repository.list()); setStatus('ready'); }
    catch (cause) { setError(message(cause)); setStatus('error'); }
  }, [repository]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; activeImport.current?.abort(); };
  }, []);

  async function createProject() {
    if (busy) return;
    setBusy(true);
    setError('');
    const id = crypto.randomUUID();
    try {
      const lease = await ownership.acquire(id);
      if (!lease) throw new WriteAccessError();
      try {
        const now = Date.now();
        await repository.create({
          project: { id, name: '未命名試卷', createdAt: now, updatedAt: now,
            pageSettings: structuredClone(DEFAULT_PAGE_SETTINGS), schemaVersion: DOCUMENT_SCHEMA_VERSION },
          document: createEmptyDocument(id), assets: [],
        });
      } finally { await lease.release(); }
      window.location.hash = `/projects/${encodeURIComponent(id)}`;
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function deleteProject(id: string) {
    if (busy || !window.confirm('確定刪除這份試卷？')) return;
    setBusy(true);
    setError('');
    try {
      const lease = await ownership.acquire(id);
      if (!lease) throw new WriteAccessError('另一個分頁正在使用此 Project');
      try { await repository.delete(id); }
      finally { await lease.release(); }
      await reload();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  }

  async function importFile(file: File) {
    if (busy || activeImport.current) return;
    const controller = new AbortController();
    activeImport.current = controller;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await importer(file, repository, ownership, controller.signal, (stage) => {
        if (!mounted.current) return;
        stageRef.current = stage;
        setImportStage(stage);
      });
      if (!mounted.current) return;
      storeImportWarnings(result.projectId, ['請人工校對題目、圖片和表格順序。', ...result.warnings]);
      window.location.hash = `/projects/${encodeURIComponent(result.projectId)}`;
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof DocxImportError && cause.code === 'cancelled') setNotice('匯入已取消');
      else setError(message(cause));
    } finally {
      activeImport.current = null;
      stageRef.current = null;
      if (mounted.current) { setImportStage(null); setBusy(false); }
    }
  }

  function cancelImport() {
    if (stageRef.current === 'converting') activeImport.current?.abort();
  }

  return <main>
    <h1>試卷專案</h1>
    <button disabled={busy} onClick={() => void createProject()}>建立空白試卷</button>
    <label>匯入 DOCX <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void importFile(file);
      }} /></label>
    {importStage && <p role="status">{importStage === 'converting' ? '正在轉換 DOCX…' : '正在儲存試卷…'}</p>}
    {importStage === 'converting' && <button onClick={cancelImport}>取消匯入</button>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {status === 'loading' && <p>載入中…</p>}
    {status === 'error' && <button onClick={() => void reload()}>重試載入</button>}
    {status === 'ready' && (projects.length === 0
      ? <p>還沒有試卷。建立一份空白試卷開始。</p>
      : <ul>{projects.map((project) => <li key={project.id}>
        <a href={`#/projects/${encodeURIComponent(project.id)}`}>{project.name}</a>
        <button disabled={busy} onClick={() => void deleteProject(project.id)}
          aria-label={`刪除 ${project.name}`}>刪除</button>
      </li>)}</ul>)}
  </main>;
}

function message(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'message' in cause
    && typeof cause.message === 'string') return cause.message;
  return '操作失敗，請重試';
}
