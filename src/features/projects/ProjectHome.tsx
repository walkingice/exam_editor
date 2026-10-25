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

  return <main className="project-home">
    <a className="home-settings" href="#/settings" aria-label="設定">
      <span aria-hidden="true">⚙</span>
    </a>
    <header className="home-intro">
      <p className="home-eyebrow">EXAM STUDIO</p>
      <h1>試卷編輯器</h1>
      <p className="home-description">建立新試卷，或匯入既有的 DOCX 文件，接著就能開始編輯。</p>
    </header>
    <section className="home-actions" aria-label="建立或匯入試卷">
      <label className="home-import">
        <span className="action-icon import-icon" aria-hidden="true">↥</span>
        <span><strong>匯入 DOCX</strong><small>沿用現有文件，快速開始編輯</small></span>
        <input aria-label="匯入 DOCX" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void importFile(file);
      }} />
      </label>
      <button className="home-create" disabled={busy} onClick={() => void createProject()}>
        <span className="action-icon" aria-hidden="true">＋</span>
        <span><strong>建立空白試卷</strong><small>從一張乾淨的版面開始</small></span>
        <span className="action-arrow" aria-hidden="true">→</span>
      </button>
    </section>
    {(importStage || notice || error) && <div className="home-messages">
      {importStage && <p role="status">{importStage === 'converting' ? '正在轉換 DOCX…' : '正在儲存試卷…'}
        {importStage === 'converting' && <button onClick={cancelImport}>取消匯入</button>}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>}
    <section className="project-list" aria-labelledby="project-list-title">
      <div className="section-heading"><div><p className="home-eyebrow">YOUR WORKSPACE</p>
        <h2 id="project-list-title">最近的試卷</h2></div>
        {status === 'ready' && <span className="project-count">{projects.length} 份試卷</span>}
      </div>
      {status === 'loading' && <p className="home-empty">正在整理你的試卷…</p>}
      {status === 'error' && <div className="home-empty"><p role="alert">{error || '載入失敗'}</p>
        <button className="retry-button" onClick={() => void reload()}>重試載入</button></div>}
      {status === 'ready' && (projects.length === 0
        ? <div className="home-empty"><span className="empty-mark" aria-hidden="true">✳</span>
          <strong>你的工作區還很清爽</strong><p>建立一份空白試卷，或匯入 DOCX 開始整理題目。</p></div>
        : <ul className="project-items">{projects.map((project) => <li key={project.id}>
          <a className="project-link" href={`#/projects/${encodeURIComponent(project.id)}`}>
            <span className="project-file" aria-hidden="true">▤</span><span className="project-name">{project.name}</span>
            <span className="project-open">開啟 <span aria-hidden="true">→</span></span>
          </a>
          <button className="project-delete" disabled={busy} onClick={() => void deleteProject(project.id)}
            aria-label={`刪除 ${project.name}`}>刪除</button>
        </li>)}</ul>)}
    </section>
  </main>;
}

function message(cause: unknown): string {
  if (cause && typeof cause === 'object' && 'message' in cause
    && typeof cause.message === 'string') return cause.message;
  return '操作失敗，請重試';
}
