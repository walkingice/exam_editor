import { useCallback, useEffect, useState } from 'react';
import { ProjectOwnership, WriteAccessError } from '../../data/ownership';
import { ProjectRepository } from '../../data/repository';
import { createEmptyDocument, DEFAULT_PAGE_SETTINGS, DOCUMENT_SCHEMA_VERSION } from '../../domain/types';
import type { Project } from '../../domain/types';

export function ProjectHome({ repository, ownership }: {
  repository: ProjectRepository; ownership: ProjectOwnership;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError('');
    try { setProjects(await repository.list()); setStatus('ready'); }
    catch (cause) { setError(message(cause)); setStatus('error'); }
  }, [repository]);

  useEffect(() => { void reload(); }, [reload]);

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

  return <main>
    <h1>試卷專案</h1>
    <button disabled={busy} onClick={() => void createProject()}>建立空白試卷</button>
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
  return cause instanceof Error ? cause.message : '操作失敗，請重試';
}
